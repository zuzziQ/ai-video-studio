// "Tạo lời thoại tự động" (studio/routes/25_transcribe.mjs): whisper the timeline's voice → captions.
// Studio.openTranscribe(next) opens the dialog; Studio.needCaptions(next, what) is what AI/Tự động/Dịch call when the
// project has no captions yet — it offers to create them, then continues with next().
// Any element with data-transcribe opens the dialog.
'use strict';
(() => {
  const S = Studio, $ = S.$;
  const css = document.createElement('style');
  css.textContent = `
  .tr-cta { background: linear-gradient(135deg, rgb(var(--color-accent-soft) / .24), rgb(var(--color-audio) / .08)); border: 1px solid rgb(var(--color-accent-text) / .5); border-radius: var(--radius-control); padding: var(--space-3); margin: var(--space-2) 0 var(--space-3); }
  .tr-cta b { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }
  .tr-cta p { margin: var(--space-2) 0 var(--space-3); color: rgb(var(--color-fg-muted)); line-height: 1.5; font-size: var(--text-xs); }
  .tr-cta button { width: 100%; justify-content: center; }
  .tr-models label { display: flex; gap: var(--space-2); align-items: flex-start; padding: var(--space-2) var(--space-3); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-control); margin: var(--space-1) 0; cursor: pointer; background: rgb(var(--color-surface)); transition: border-color var(--duration-fast) var(--ease-standard); }
  .tr-models label:has(input:checked) { border-color: rgb(var(--color-accent-text) / .5); background: rgb(var(--color-accent-soft) / .24); }
  .tr-models small { display: block; color: rgb(var(--color-fg-subtle)); margin-top: var(--space-050); }
  p.tr-p { margin: 0 0 var(--space-2); } .help.tr-warn { color: rgb(var(--color-warning)); } .tr-el { font-size: var(--text-2xs); margin-top: var(--space-1); }`;
  document.head.appendChild(css);

  // Measured on the sample clip (Vietnamese, 29 s, hand-corrected reference): word error small 13.5 %, medium 11 %,
  // large-v3 6 %, large-v3-turbo 2.3 % at ~2× the time of small — so turbo is the default.
  const MODELS = [['large-v3-turbo', 'Chính xác (khuyên dùng)', 'model large-v3-turbo · sai ~2 % số từ · ~20 giây cho video 1 phút · lần đầu tải ~1,6 GB'],
    ['small', 'Nhanh', 'model small · sai ~13 % số từ · ~10 giây cho video 1 phút · nên sửa lại phụ đề'],
    ['large-v3', 'Model lớn nhất', 'model large-v3 · chậm ~5 lần small · lần đầu tải ~3 GB']];

  S.ctaTranscribe = what => `<div class="tr-cta"><b><i class="ti ti-microphone"></i> Chưa có lời thoại</b>
    <p>${what ? `${what} cần lời thoại (phụ đề có thời gian từng chữ). ` : ''}Bấm để máy nghe tiếng nói trong video và tự tạo phụ đề.</p>
    <button class="primary" data-transcribe><i class="ti ti-wand"></i> Tạo lời thoại tự động</button></div>`;

  S.openTranscribe = (next, what) => {
    const n = (S.CAP || []).length;
    S.modal(`<h3><i class="ti ti-microphone"></i> Tạo lời thoại tự động</h3>
      ${what ? `<p class="muted tr-p">${S.esc(what)} cần lời thoại. Tạo xong sẽ tự chạy tiếp.</p>` : ''}
      <p class="muted tr-p">Máy nghe tiếng nói trên timeline (đã tính các đoạn cắt, tốc độ, clip tắt tiếng) bằng Whisper, rồi tạo phụ đề có thời gian từng chữ. Chạy ngay trên máy, không cần mạng (trừ lần đầu tải model lớn).</p>
      <label class="lbl">Độ chính xác</label><div class="tr-models">${MODELS.map(([v, l, d], i) => `<label><input type="radio" name="trm" value="${v}" ${i ? '' : 'checked'}><div><b>${l}</b><small>${d}</small></div></label>`).join('')}</div>
      <div class="row2"><div><label class="lbl">Ngôn ngữ</label><select id="trl"><option value="vi">Tiếng Việt</option><option value="auto">Tự nhận ngôn ngữ</option></select></div>
      <div><label class="lbl">Số chữ mỗi dòng</label><select id="trx"><option value="3">3 (dồn dập)</option><option value="4" selected>4</option><option value="5">5</option><option value="6">6 (dài)</option></select></div></div>
      ${n ? `<div class="help tr-warn"><i class="ti ti-alert-triangle"></i> ${n} dòng phụ đề hiện có sẽ được thay bằng bản mới. ${S.tip('Bản cũ sao lưu trong .studio/, hoàn tác bằng Lịch sử.')}</div>` : ''}
      <div class="actions"><button onclick="closeModal()">Huỷ</button><button class="primary" id="trgo"><i class="ti ti-wand"></i> Tạo lời thoại</button></div>`);
    $('#trgo').onclick = () => run(next);
  };
  S.needCaptions = (next, what) => { S.openTranscribe(next, what); return null; };

  async function run(next) {
    const body = { model: document.querySelector('[name=trm]:checked').value, lang: $('#trl').value, max: +$('#trx').value };
    if (!await S.saveNow()) return;
    const r = await S.api('/api/transcribe', body);
    if (!r.ok) return S.toast(r.error || 'Đang có tác vụ khác chạy');
    const t0 = Date.now();
    S.modal(`<h3><i class="ti ti-microphone"></i> Đang tạo lời thoại…</h3><div id="jobstep" class="muted">Bắt đầu</div><div class="bar"><i></i></div>
      <div class="muted tr-el" id="trel"></div><pre id="joblog"></pre><div class="actions"><button id="trcancel">Dừng</button></div>`);
    const tick = setInterval(() => { const el = $('#trel'); if (el) el.textContent = `Đã chạy ${Math.round((Date.now() - t0) / 1000)} giây`; else clearInterval(tick); }, 1000);
    $('#trcancel').onclick = () => S.api('/api/job/cancel', {});
    S.pollJob(async j => {
      clearInterval(tick);
      if (j.state !== 'done') return S.modal(`<h3>Chưa tạo được lời thoại</h3><p>${S.esc(j.step)}</p><pre>${S.esc((j.log || '').slice(-900))}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
      await S.reload();
      S.closeModal();
      S.toast(`Đã tạo lời thoại: ${j.out?.words || 0} từ, ${j.out?.captions || 0} dòng phụ đề`);
      if (typeof next === 'function') setTimeout(next, 300);
      else S.renderPanel();
    });
  }

  document.addEventListener('click', e => { if (e.target.closest('[data-transcribe]')) { e.preventDefault(); e.stopPropagation(); S.openTranscribe(); } }, true);
})();
