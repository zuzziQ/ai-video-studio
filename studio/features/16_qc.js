// AI QC ("Kiểm tra chất lượng") + A/B variants ("Nhiều phiên bản") — references/qc-variants.md.
// Adds two cards to the AI panel (injected when the panel renders, no edit of 20_ai.js), a checkbox
// "AI kiểm tra & sửa trước khi xuất" in the export dialog, and a QC card in the "Xuất xong" dialog.
'use strict';
(() => {
  const S = Studio, $ = s => document.querySelector(s), esc = S.esc;
  const css = document.createElement('style');
  css.textContent = `
  .qc-score { display: flex; align-items: center; gap: var(--space-4); margin: var(--space-2) 0 var(--space-3); } .qc-score.qc-tight { margin: var(--space-2) 0; }
  .qc-ring { --c: var(--color-danger); width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; font-size: var(--text-xl); font-weight: 800; flex: none;
    background: conic-gradient(rgb(var(--c)) calc(var(--v, 0) * 1%), rgb(var(--color-surface-hover)) 0); position: relative; }
  .qc-ring.ok { --c: var(--color-success); } .qc-ring.warn { --c: var(--color-warning); }
  .qc-ring::after { content: ''; position: absolute; inset: 6px; border-radius: 50%; background: rgb(var(--color-surface)); }
  .qc-ring b { position: relative; z-index: 1; }
  .qc-sum { color: rgb(var(--color-fg-muted)); line-height: 1.5; font-size: var(--text-sm); }
  .qc-list { display: flex; flex-direction: column; gap: var(--space-1); max-height: 46vh; overflow: auto; margin: var(--space-2) 0; }
  .qc-it { display: flex; gap: var(--space-2); align-items: flex-start; padding: var(--space-2) var(--space-3); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); background: rgb(var(--color-surface)); cursor: pointer; transition: border-color var(--duration-fast) var(--ease-standard); }
  .qc-it:hover { border-color: rgb(var(--color-line-hover)); }
  .qc-it.fixed { opacity: .62; }
  .qc-it input.qc-pick { flex: none; width: auto; margin: var(--space-050) 0 0; cursor: pointer; }
  .qc-it .sg { display: block; color: rgb(var(--color-accent-text)); font-size: var(--text-xs); margin-top: var(--space-050); }
  .qc-it .nw { color: rgb(var(--color-warning)); font-size: var(--text-2xs); border: 1px solid rgb(var(--color-warning)); border-radius: var(--radius-xs); padding: 0 var(--space-1); margin-left: var(--space-1); }
  .qc-bulk { display: flex; gap: var(--space-3); align-items: center; font-size: var(--text-xs); color: rgb(var(--color-fg-muted)); margin: var(--space-1) 0 0; } .qc-bulk a { color: rgb(var(--color-accent-text)); cursor: pointer; }
  .qc-it .tm { font-variant-numeric: tabular-nums; font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); width: 44px; flex: none; padding-top: 1px; }
  .qc-it .sv { width: 8px; height: 8px; border-radius: 50%; margin-top: var(--space-1); flex: none; background: rgb(var(--color-fg-subtle)); }
  .qc-it .sv.high { background: rgb(var(--color-danger)); } .qc-it .sv.med { background: rgb(var(--color-warning)); } .qc-it .sv.low { background: rgb(var(--color-audio)); }
  .qc-it .bd { flex: 1; min-width: 0; font-size: var(--text-sm); line-height: 1.45; }
  .qc-it .bd small { color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); margin-left: var(--space-1); }
  .qc-it .ok { color: rgb(var(--color-success)); font-size: var(--text-2xs); flex: none; }
  .qc-it .src { font-size: var(--text-2xs); text-transform: uppercase; color: rgb(var(--color-fg-subtle)); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-xs); padding: 0 var(--space-1); margin-right: var(--space-1); }
  .qc-imgs { display: flex; gap: var(--space-2); flex-wrap: wrap; margin: var(--space-2) 0; } .qc-imgs a { color: rgb(var(--color-accent-text)); font-size: var(--text-xs); }
  .qc-cmp { width: 100%; border-radius: var(--radius-control); border: 1px solid rgb(var(--color-line-strong)); margin-top: var(--space-2); }
  .qc-sumt { cursor: pointer; }
  label.qcx { display: flex; gap: var(--space-2); align-items: center; margin-top: var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-control); cursor: pointer; background: rgb(var(--color-surface)); }
  label.qcx.qc-m0 { margin-top: 0; }
  label.qcx:has(input:checked) { border-color: rgb(var(--color-accent-text) / .5); background: rgb(var(--color-accent-soft) / .24); }
  label.qcx small { color: rgb(var(--color-fg-subtle)); }
  .qc-c-ok { color: rgb(var(--color-success)); } .qc-c-warn { color: rgb(var(--color-warning)); } .qc-c-bad { color: rgb(var(--color-danger)); }
  .qc-sub { font-weight: 400; font-size: var(--text-xs); }
  .ai-row.qc-mt { margin-top: var(--space-3); } .ai-row.qc-mt2 { margin-top: var(--space-2); } .ai-row.qc-click { cursor: pointer; } .qc-nf { flex: none; }
  /* M156 (K7): 20_ai.js nạp sau và đặt .ai-row > * { flex: 1 } — ô tick bị kéo dài, nằm xa chữ. Ô tick đứng sát chữ, chữ chiếm phần còn lại. */
  .ai-row.qc-click { align-items: flex-start; } .ai-row.qc-click > input.qc-nf { flex: none; width: auto; margin: var(--space-050) 0 0; }
  .ai-row.qc-click > span { flex: 1 1 auto; min-width: 0; line-height: 1.4; }
  .qc-tip { display: inline-flex; vertical-align: -2px; margin-left: var(--space-1); color: rgb(var(--color-fg-subtle)); cursor: help; }
  .qc-tip:hover, .qc-tip:focus-visible { color: rgb(var(--color-fg)); outline: none; }
  .qc-lbl { flex: none; width: 88px; } .qc-push { margin-left: auto; }
  p.qc-hint { margin: var(--space-050) 0 0 96px; font-size: var(--text-xs); }
  .qc-chk { cursor: pointer; margin-right: var(--space-3); }
  p.qc-p { margin: var(--space-3) 0 var(--space-1); } p.qc-p0 { margin: 0 0 var(--space-2); } textarea.qc-ta { width: 100%; }
  .va-grid { display: grid; grid-template-columns: repeat(var(--n, 4), minmax(0, 1fr)); gap: var(--space-3); margin: var(--space-2) 0; }
  .va-col { background: rgb(var(--color-surface)); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); padding: var(--space-2); display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
  .va-col.cur { border-color: rgb(var(--color-accent-text) / .5); }
  .va-col video, .va-col img { width: 100%; aspect-ratio: 9/16; object-fit: cover; border-radius: var(--radius-control); background: rgb(var(--color-black)); }
  body.landscape .va-col video, body.landscape .va-col img { aspect-ratio: 16/9; }
  .va-col b { font-size: var(--text-sm); } .va-col p { margin: 0; color: rgb(var(--color-fg-muted)); font-size: var(--text-xs); line-height: 1.45; }
  .va-col .hk { color: rgb(var(--color-warning)); font-weight: 700; font-size: var(--text-xs); }
  #modalbox:has(.va-grid) { width: min(1100px, 94vw); max-width: 94vw; }
  #modalbox:has(.qc-list) { width: min(640px, 94vw); }
  /* S22 M154: Cơ bản không có thẻ A/B ở panel Kiểm tra; "3 hook cho A/B" là gợi ý nhanh của thanh Hỏi Claude */
  body.wf-basic #vabox { display: none; }`;
  document.head.appendChild(css);
  // Data-driven values (ring score, number of variant columns) arrive as data-v="--v:72" and are set with style.setProperty after insert.
  const applyVars = root => (root || document).querySelectorAll('[data-v]').forEach(el => el.dataset.v.split(';').forEach(p => { const i = p.indexOf(':'); if (i > 0) el.style.setProperty(p.slice(0, i).trim(), p.slice(i + 1).trim()); }));

  const tier = v => (v >= 80 ? 'ok' : v >= 55 ? 'warn' : 'bad');
  const ring = v => `<div class="qc-ring ${tier(v)}" data-v="--v:${+v || 0}"><b>${v}</b></div>`;
  const KV = { hook: 'Hook', readability: 'Dễ đọc', spelling: 'Chính tả', variety: 'Đa dạng', pacing: 'Nhịp', brand: 'Thương hiệu' };
  let last = null, va = null, exportQc = null, passQc = false, saved = null;

  async function load() { const r = await S.api('/api/qc').catch(() => null); last = r && !r.none ? r : null; return last; }
  async function loadVa() { const r = await S.api('/api/variants').catch(() => null); va = r && !r.none ? r : null; return va; }
  const dirty = () => $('#status')?.classList.contains('dirty');

  // ---------- run QC as a job ----------
  // fail(msg): S22 M154 — thanh Hỏi Claude đợi kết quả (S.qc.fixAll), lỗi thì báo về thay vì treo
  async function runQc({ fix = false, claude = true, after, only, fail } = {}) {
    if (dirty() && !await S.saveNow()) return fail?.('Chưa lưu được dự án');
    const r = await S.api('/api/qc/run', { fix, claude, ...(only ? { only } : {}) });
    if (!r.ok) { S.toast(r.error || 'Đang có tác vụ khác chạy'); return fail?.(r.error || 'Đang có tác vụ khác chạy'); }
    S.modal(`<h3><i class="ti ti-shield-check"></i> ${only ? `Đang áp dụng ${only.length} gợi ý sửa…` : fix ? 'Đang kiểm tra & tự sửa…' : 'Đang kiểm tra chất lượng…'}</h3>
      <div id="jobstep" class="muted">Bắt đầu</div><div class="bar"><i></i></div><pre id="joblog"></pre>
      <p class="muted">Render ảnh bằng engine, đo chữ/mặt/phụ đề, trộn thử âm thanh${claude ? ', rồi Claude xem các khung hình (30–120 giây)' : ''}.</p>`);
    S.pollJob(async j => {
      if (j.state !== 'done') {
        if (fail) { S.closeModal(); return fail(j.error || j.step || 'Kiểm tra chưa xong'); }
        return S.modal(`<h3>Lỗi kiểm tra</h3><p>${esc(j.error || j.step)}</p><pre>${esc((j.log || '').slice(-1200))}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
      }
      await load();
      if (fix) await S.reload();
      if (after) return after(last);
      showResult();
      rerender();
    });
  }

  // ---------- result dialog ----------
  // What a fix will do, shown as a suggestion the user accepts (machine fixes by issue kind, Claude fixes by patch op).
  const AUTO_FIX = { text_offcanvas: 'Dời / thu nhỏ chữ vào trong khung', face_cover: 'Dời graphic khỏi khuôn mặt', caption_overlap: 'Dời graphic tránh phụ đề (hoặc ẩn phụ đề lúc đó)',
    overlap: 'Rút ngắn cảnh trước để hết chồng lớp', empty: 'Thêm chữ từ khoá vào đoạn trống', caption_long: 'Tách phụ đề thành dòng ≤ 4 từ', missing_media: 'Ẩn cảnh / bỏ SFX bị thiếu file',
    hook_missing: 'Thêm chữ hook lớn ở đầu video', music_masking: 'Hạ nhạc nền để nghe rõ giọng', music_quiet: 'Tăng nhạc nền cho nghe được' };
  // Claude patch ops (scripts/ai_qc.mjs validatePatch)
  const CL_FIX = {
    text: f => `Sửa chữ “${f.from}” → “${f.to}”`, move: f => `Dời ${f.target} (${f.dx || 0}, ${f.dy || 0} px)`, resize: f => `Đổi cỡ ${f.target} × ${f.scale}`,
    retime: f => `Cho ${f.target} hiện ${f.t0}–${f.t1}s`, shorten: f => `Rút ${f.target} kết thúc ở ${f.t1}s`, delete: f => `Ẩn cảnh ${f.target}`,
    caption_style: f => `Đổi kiểu phụ đề sang “${f.value}”`, gain: f => `${f.db > 0 ? 'Tăng' : 'Giảm'} nhạc ${Math.abs(f.db)} dB`, hook: f => `Đổi hook thành “${f.text}”`,
  };
  const suggestion = i => {
    if (i.fixed || i.new) return '';
    if (i.src === 'auto') return AUTO_FIX[i.kind] || '';
    if (!i.fix?.op) return '';
    return String(CL_FIX[i.fix.op]?.(i.fix) || 'Sửa theo gợi ý của Claude').slice(0, 160);
  };
  function showResult() {
    const q = last; if (!q) return;
    const fixedN = q.issues.filter(i => i.fixed).length, newN = q.issues.filter(i => i.new).length;
    // suggestions only on a plain check: after a fix the timeline changed, so ids would not match → "Kiểm tra lại" first
    const sug = q.fix ? [] : q.issues.filter(i => i.key && suggestion(i));
    const initial = q.counts?.initial ?? q.issues.length - newN;
    const sc = q.claude?.scores && Object.keys(q.claude.scores).length ? `<div class="ai-kv">${Object.entries(q.claude.scores).map(([k, v]) => `<span>${KV[k] || k} ${v}/10</span>`).join('')}</div>` : '';
    const sum = !q.issues.length ? 'Không thấy vấn đề nào'
      : q.fix ? `Ban đầu ${initial} vấn đề${fixedN ? ` · đã sửa <b class="qc-c-ok">${fixedN}</b>` : ''}${q.selected ? ` <span class="muted">(bạn chọn ${q.selected} gợi ý)</span>` : ''}${newN ? ` · <b class="qc-c-warn">${newN} phát sinh sau khi sửa</b>` : ''}${q.counts?.high ? ` · <b class="qc-c-bad">${q.counts.high} nặng</b> còn lại` : ''}`
      : `${q.issues.length} vấn đề${sug.length ? ` · <b>${sug.length} gợi ý sửa</b>, tick mục muốn áp dụng` : ''}${q.counts?.high ? ` · <b class="qc-c-bad">${q.counts.high} nặng</b>` : ''}`;
    S.modal(`<h3><i class="ti ti-shield-check"></i> Kiểm tra chất lượng</h3>
      <div class="qc-score">${q.after != null ? `${ring(q.before)}<i class="ti ti-arrow-right ui-subtle"></i>${ring(q.after)}` : ring(q.score)}
        <div class="qc-sum">${sum}
        ${q.fix && newN ? '<br><small class="muted">“Phát sinh” là vấn đề do chính lần sửa tạo ra (vd chữ dời chỗ thì đè lên thứ khác). Bấm Kiểm tra lại để có gợi ý sửa tiếp, hoặc Hoàn tác.</small>' : ''}
        ${q.audio?.lufs != null ? `<br>Âm thanh: ${q.audio.lufs} LUFS · đỉnh ${q.audio.true_peak} dBTP${q.audio.masked_pct != null ? ` · nhạc át giọng ${q.audio.masked_pct}%` : ''}` : ''}
        ${adsSummary(q)}
        ${q.undone ? '<br><i>Đã hoàn tác lần sửa trước.</i>' : ''}</div></div>
      ${q.claude?.summary ? `<div class="help"><b>Claude:</b> ${esc(q.claude.summary)}</div>${sc}` : q.claude?.error ? `<div class="help qc-c-warn">Không có nhận xét của Claude: ${esc(q.claude.error)}</div>` : ''}
      ${sug.length ? '<div class="qc-bulk"><a data-qcsel="all">Chọn tất cả</a><a data-qcsel="high">Chỉ lỗi nặng + vừa</a><a data-qcsel="none">Bỏ chọn</a></div>' : ''}
      <div class="qc-list">${q.issues.map(i => { const g = !q.fix && i.key && suggestion(i); return `<div class="qc-it ${i.fixed ? 'fixed' : ''}" data-qct="${i.t}" title="Bấm để tua tới ${S.fmt(i.t)}">
        ${g ? `<input type="checkbox" class="qc-pick" data-key="${esc(i.key)}" data-sv="${i.severity}" ${i.severity !== 'low' ? 'checked' : ''} title="Áp dụng gợi ý này">` : ''}
        <span class="tm">${S.fmt(i.t).replace(/^0:/, '')}</span><span class="sv ${i.severity}"></span>
        <span class="bd"><span class="src">${i.src === 'claude' ? 'Claude' : 'máy'}</span><b>${esc(i.kind_vi)}</b> — ${esc(i.msg)}${i.new ? '<span class="nw">phát sinh sau khi sửa</span>' : ''}${i.note ? `<small>(${esc(i.note)})</small>` : ''}
        ${g ? `<span class="sg"><i class="ti ti-wand"></i> Gợi ý: ${esc(g)}</span>` : ''}</span>
        ${i.fixed ? '<span class="ok"><i class="ti ti-check"></i> đã sửa</span>' : ''}</div>`; }).join('')}</div>
      ${q.compare_sheet ? `<details><summary class="muted qc-sumt">Ảnh trước / sau khi sửa (${q.compare.length} cặp)</summary><img class="qc-cmp" src="${Studio.pbase}${q.compare_sheet}?${Date.now()}"></details>` : ''}
      <div class="qc-imgs">${q.sheet ? `<a href="${Studio.pbase}${q.sheet}" target="_blank"><i class="ti ti-layout-grid"></i> Ảnh tổng quan các khung</a>` : ''}</div>
      <div class="actions">${q.can_undo && q.fix && !q.undone ? '<button id="qcundo"><i class="ti ti-arrow-back-up"></i> Hoàn tác sửa</button>' : ''}
        <button id="qcagain"><i class="ti ti-refresh"></i> Kiểm tra lại</button>
        ${sug.length ? '<button class="primary" id="qcfix"><i class="ti ti-wand"></i> <span>Áp dụng gợi ý đã chọn</span></button>' : ''}<button onclick="closeModal()">Đóng</button></div>`);
    applyVars($('#modalbox'));
    const list = $('#modalbox .qc-list'), picks = () => [...list.querySelectorAll('.qc-pick')];
    const count = () => { const n = picks().filter(x => x.checked).length, b = $('#qcfix'); if (b) { b.disabled = !n; b.querySelector('span').textContent = n ? `Áp dụng ${n} gợi ý đã chọn` : 'Chưa chọn gợi ý nào'; } };
    list.addEventListener('click', e => { if (e.target.closest('.qc-pick')) return count(); const it = e.target.closest('[data-qct]'); if (it) { S.setTime(+it.dataset.qct); S.closeModal(); } });
    document.querySelectorAll('#modalbox [data-qcsel]').forEach(a => (a.onclick = () => { for (const x of picks()) x.checked = a.dataset.qcsel === 'all' || (a.dataset.qcsel === 'high' && x.dataset.sv !== 'low'); count(); }));
    count();
    $('#qcfix') && ($('#qcfix').onclick = () => { const only = picks().filter(x => x.checked).map(x => x.dataset.key); if (only.length) runQc({ fix: true, only, claude: !!q.claude?.used }); });
    $('#qcagain').onclick = () => runQc({ fix: false });
    $('#qcundo') && ($('#qcundo').onclick = async () => {
      const r = await S.api('/api/qc/undo', {}); if (r.error) return S.toast(r.error);
      await S.reload(); await load(); S.toast('Đã hoàn tác các sửa đổi của QC'); showResult(); rerender();
    });
  }

  // ---------- ad gates (references/ad-gates.md): settings live in TL.ads, checked by scripts/ad_gates.py during QC ----------
  const AD_IND = { '': 'Tự nhận diện', general: 'Chung', cosmetics: 'Mỹ phẩm / chăm sóc da', supplements: 'Thực phẩm chức năng', food: 'Thực phẩm & đồ uống', finance: 'Tài chính', health_device: 'Thiết bị sức khoẻ' };
  const AD_PLAT = { meta: 'Facebook / Instagram', tiktok: 'TikTok' };
  async function adsDialog() {
    const a = S.TL.ads || {}, plats = a.platforms?.length ? a.platforms : Object.keys(AD_PLAT), cl = a.claims || [];
    // Product Brain (M18, studio/features/53_products.js): claim, cụm từ cấm, ngành lấy từ hồ sơ sản phẩm dùng chung
    const prods = await S.api('/api/products').then(r => (Array.isArray(r) ? r : [])).catch(() => []);
    const lost = a.product && !prods.some(p => p.id === a.product);
    const lines = st => cl.filter(c => (c.status || 'approved') === st).map(c => c.text).join('\n');
    S.modal(`<h3><i class="ti ti-speakerphone"></i> Kiểm tra quảng cáo</h3>
      <p class="muted">Khi bật, “Kiểm tra chất lượng” soát thêm lời thoại và chữ trên màn hình theo chính sách quảng cáo Meta / TikTok, đối chiếu claim, và chấm điểm nguyên bản so với các phiên bản A/B. Chỉ báo, không tự sửa; không thay kiểm duyệt của nền tảng.</p>
      <label class="qcx qc-m0"><input type="checkbox" id="adon" ${a.on ? 'checked' : ''}><span><b>Video này dùng để chạy quảng cáo</b></span></label>
      <div class="ai-row qc-mt"><span class="qc-lbl">Sản phẩm</span><select id="adprod"><option value="">— nhập claim tay cho dự án này —</option>
        ${prods.map(p => `<option value="${esc(p.id)}" ${a.product === p.id ? 'selected' : ''}>${esc(p.name)} · ${p.claims?.approved || 0} claim đã duyệt</option>`).join('')}
        ${lost ? `<option value="${esc(a.product)}" selected>⚠ ${esc(a.product)} (không còn hồ sơ)</option>` : ''}</select></div>
      <p class="muted qc-hint" id="adprodhint"></p>
      <div class="ai-row"><span class="qc-lbl">Ngành</span><select id="adind">${Object.entries(AD_IND).map(([k, v]) => `<option value="${k}" ${(a.industry || '') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="ai-row"><span class="qc-lbl">Nền tảng</span>${Object.entries(AD_PLAT).map(([k, v]) => `<label class="qc-chk"><input type="checkbox" data-adp="${k}" ${plats.includes(k) ? 'checked' : ''}> ${v}</label>`).join('')}</div>
      <p class="qc-p"><b id="adoklbl">Claim đã có bằng chứng</b> <span class="muted">· mỗi dòng một câu; có ít nhất một dòng thì câu nêu lợi ích hay số liệu không khớp sẽ bị nhắc</span></p>
      <textarea id="adok" rows="4" class="qc-ta">${esc(lines('approved'))}</textarea>
      <p class="qc-p"><b>Claim bị cấm</b> <span class="muted">· mỗi dòng một câu; lời thoại gần giống sẽ bị chặn</span></p>
      <textarea id="adno" rows="2" class="qc-ta">${esc(lines('prohibited'))}</textarea>
      <p class="qc-p"><b>Cụm từ không được dùng</b> <span class="muted">· mỗi dòng một cụm</span></p>
      <textarea id="adbl" rows="2" class="qc-ta">${esc((a.blocked || []).join('\n'))}</textarea>
      <div class="actions"><button onclick="closeModal()">Huỷ</button><button class="primary" id="adsave">Lưu</button></div>`);
    const hint = () => {
      const id = $('#adprod').value, p = prods.find(x => x.id === id);
      $('#adprodhint').textContent = p ? `Đối chiếu theo hồ sơ: ${p.claims?.approved || 0} claim đã duyệt, ${(p.claims?.prohibited || 0) + (p.claims?.expired || 0)} cấm / hết hạn, ${p.blocked || 0} cụm từ cấm. Sửa hồ sơ ở panel Sản phẩm; ô dưới chỉ để thêm riêng cho dự án này.`
        : id ? 'Hồ sơ này không còn: kiểm tra quảng cáo sẽ chặn xuất cho tới khi chọn hồ sơ khác.' : 'Chưa có hồ sơ? Tạo ở panel Sản phẩm (thanh trái) để dùng lại cho nhiều dự án.';
      $('#adoklbl').textContent = id ? 'Claim thêm riêng dự án này' : 'Claim đã có bằng chứng';
    };
    $('#adprod').onchange = () => { const p = prods.find(x => x.id === $('#adprod').value); if (p?.industry && !$('#adind').value) $('#adind').value = p.industry; hint(); };
    hint();
    $('#adsave').onclick = () => {
      const rows = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean);
      const old = new Map(cl.map(c => [c.text, c.id])); let n = 0;
      const mk = (text, status) => ({ id: old.get(text) || `c${Date.now().toString(36)}${n++}`, text, status });
      const platforms = [...document.querySelectorAll('[data-adp]:checked')].map(i => i.dataset.adp);
      S.pushUndo('ads');
      S.TL.ads = { ...a, on: $('#adon').checked, industry: $('#adind').value || undefined, platforms: platforms.length ? platforms : Object.keys(AD_PLAT),
        claims: [...rows('#adok').map(t => mk(t, 'approved')), ...rows('#adno').map(t => mk(t, 'prohibited'))], blocked: rows('#adbl'),
        product: $('#adprod').value || undefined };
      S.changed(); S.closeModal(); rerender();
      S.toast(S.TL.ads.on ? 'Đã bật kiểm tra quảng cáo. Bấm Kiểm tra để soát.' : 'Đã tắt kiểm tra quảng cáo');
    };
  }
  function adsSummary(q) {
    const a = q.ads; if (!a) return '';
    if (a.error) return `<br><span class="qc-c-warn">Kiểm tra quảng cáo không chạy được: ${esc(a.error)}</span>`;
    const o = a.originality;
    return `<br>Quảng cáo (${esc(a.industry_vi || '')} · ${(a.platforms || []).map(p => AD_PLAT[p] || p).join(', ')}${a.product?.name || S.TL.ads?.product ? ` · hồ sơ ${esc(a.product?.name || S.TL.ads.product)}` : ''}): ${a.blocked ? '<b class="qc-c-bad">có lỗi chặn</b>' : '<b class="qc-c-ok">không có lỗi chặn</b>'}`
      + (o ? ` · nguyên bản <b class="qc-c-${o.ok ? 'ok' : o.ab ? 'warn' : 'bad'}">${o.score.toFixed(2)}</b> (ngưỡng ${o.min}, so ${o.compared} bản${o.ab ? ', nhóm A/B' : ''})` : ' · chưa có phiên bản khác để chấm nguyên bản')
      + (a.rechecked ? ' · đã soát lại sau khi sửa' : '')
      + (q.override ? `<br><span class="qc-c-warn">Đã bỏ qua chặn xuất (${esc(new Date(q.override.at).toLocaleString('vi-VN'))}): ${esc(q.override.reason)}</span>` : '');
  }

  // ---------- variants ----------
  async function runVariants(o = {}) {
    const kind = o.kind || $('#vakind')?.value || 'hook', exp = o.export ?? $('#vaexp')?.checked;
    if (dirty() && !await S.saveNow()) return;
    const r = await S.api('/api/variants/run', { n: 3, kind, export: !!exp });
    if (!r.ok) return S.toast(r.error || 'Đang có tác vụ khác chạy');
    S.modal(`<h3><i class="ti ti-versions"></i> Đang tạo 3 phiên bản…</h3><div id="jobstep" class="muted">Bắt đầu</div><div class="bar"><i></i></div><pre id="joblog"></pre>
      <p class="muted">Mỗi phiên bản là một dự án riêng nằm cạnh dự án này${exp ? ', có xuất video (720p) để so sánh' : ''}.</p>`);
    S.pollJob(async j => {
      if (j.state !== 'done') return S.modal(`<h3>Lỗi tạo phiên bản</h3><p>${esc(j.error || j.step)}</p><pre>${esc((j.log || '').slice(-1200))}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
      await loadVa(); showVariants(); rerender();
    });
  }
  const vfile = (dir, f) => avsUrl(`/api/variants/file?dir=${encodeURIComponent(dir)}&f=${encodeURIComponent(f)}`);
  function showVariants() {
    const v = va; if (!v) return S.toast('Chưa có phiên bản nào');
    const cols = [{ dir: v.base, name: 'Gốc', desc: 'Dự án ban đầu', hook: v.base_hook, still: v.base_still, video: v.base_video }, ...v.variants];
    S.modal(`<h3><i class="ti ti-versions"></i> So sánh ${v.variants.length} phiên bản <span class="muted qc-sub">· ${esc(v.kind_vi || v.kind)}</span></h3>
      <div class="va-grid" data-v="--n:${cols.length}">${cols.map(c => `<div class="va-col ${c.dir === v.current ? 'cur' : ''}">
        ${c.video ? `<video src="${vfile(c.dir, c.video)}" ${c.still ? `poster="${vfile(c.dir, c.still)}"` : ''} muted loop playsinline controls preload="metadata"></video>` : c.still ? `<img src="${vfile(c.dir, c.still)}">` : '<div class="muted">chưa có ảnh</div>'}
        <b>${esc(c.name)}</b>${c.hook ? `<span class="hk">“${esc(c.hook)}”</span>` : ''}<p>${esc(c.desc || '')}</p>
        ${c.dir === v.current ? '<button class="mini" disabled>Đang mở</button>' : `<button class="mini" data-vaopen="${esc(c.dir)}"><i class="ti ti-folder-open"></i> Mở</button>`}</div>`).join('')}</div>
      <div class="actions"><button id="vaplay"><i class="ti ti-player-play"></i> Phát cùng lúc</button><button onclick="closeModal()">Đóng</button></div>`);
    applyVars($('#modalbox'));
    $('#vaplay').onclick = () => { for (const vd of document.querySelectorAll('#modalbox video')) { vd.currentTime = 0; vd.play().catch(() => {}); } };
    $('#modalbox .va-grid').addEventListener('click', async e => {
      const b = e.target.closest('[data-vaopen]'); if (!b) return;
      if (dirty() && !await S.saveNow()) return;
      const r = await S.api('/api/variants/open', { dir: b.dataset.vaopen });
      if (r.ok) location.reload(); else S.toast(r.error || 'Không mở được');
    });
  }

  // ---------- AI panel cards (inserted whenever 20_ai.js renders its "Dựng giúp" tab) ----------
  // M156 (C26): một dòng hiện, phần dài vào (i) (Studio.tip của M155 nếu đã có).
  const tip = h => (S.tip ? S.tip(h) : `<span class="qc-tip" tabindex="0" role="img" title="${esc(h)}" aria-label="${esc(h)}"><i class="ti ti-info-circle" aria-hidden="true"></i></span>`);
  function cards() {
    const q = last, v = va;
    return `<div class="ai-card" id="qcbox"><h4><i class="ti ti-shield-check"></i> Kiểm tra chất lượng</h4>
      <p>Soát bố cục, phụ đề, âm thanh rồi gợi ý sửa.${tip('Máy dò chữ tràn khung, graphic che mặt, phụ đề bị đè, đoạn trống > 6 giây, phụ đề quá dài, file thiếu, hook, độ to âm thanh; Claude xem khung hình để soi hook, chính tả, nhịp.')}</p>
      ${q ? `<div class="qc-score qc-tight">${ring(q.score)}<div class="qc-sum">${q.counts?.initial ?? q.issues.length} vấn đề${q.counts?.fixed ? `, đã sửa ${q.counts.fixed}` : ''}${q.counts?.new ? `, ${q.counts.new} phát sinh` : ''}<br><span class="muted">${new Date(q.created).toLocaleString('vi-VN')}</span></div></div>` : ''}
      <label class="ai-row qc-click"><input type="checkbox" id="qcclaude" class="qc-nf" checked><span>Nhờ Claude xem khung hình <span class="muted">· chậm hơn</span>${tip('Claude soi hook, chính tả, nhịp trên các khung hình. Bỏ tích thì chỉ chạy máy dò, nhanh hơn.')}</span></label>
      <div class="acts"><button class="mini primary" data-qc="fix" title="Kiểm tra rồi liệt kê gợi ý sửa; bạn chọn mục nào thì mới sửa mục đó"><i class="ti ti-wand"></i> Kiểm tra & gợi ý sửa</button>
      ${q ? '<button class="mini" data-qc="show"><i class="ti ti-list-details"></i> Kết quả</button>' : ''}</div>
      <div class="ai-row qc-mt2"><span>Kiểm tra quảng cáo: <b>${S.TL.ads?.on ? 'bật' : 'tắt'}</b>${S.TL.ads?.on ? ` <span class="muted">· ${AD_IND[S.TL.ads.industry || '']}${S.TL.ads.product ? ` · hồ sơ ${esc(S.TL.ads.product)}` : ''}</span>` : ''}</span><button class="mini qc-push" data-qc="ads"><i class="ti ti-speakerphone"></i> Thiết lập</button></div></div>
      <div class="ai-card" id="vabox"><h4><i class="ti ti-versions"></i> Nhiều phiên bản (A/B)</h4>
      <p>3 bản khác hook hoặc style để đăng thử.${tip('Tạo 3 dự án anh em với hook mở đầu khác nhau (Claude viết) và/hoặc gói style khác nhau, để đăng thử xem bản nào giữ chân người xem tốt hơn.')}</p>
      <div class="ai-row"><select id="vakind"><option value="hook">Khác hook mở đầu</option><option value="style">Khác gói style</option><option value="both">Khác cả hai</option></select></div>
      <label class="ai-row qc-click"><input type="checkbox" id="vaexp" class="qc-nf"><span>Xuất luôn video 720p để so sánh</span></label>
      <div class="acts"><button class="mini primary" data-qc="variants"><i class="ti ti-copy"></i> Tạo 3 phiên bản</button>${v ? '<button class="mini" data-qc="compare"><i class="ti ti-columns-3"></i> So sánh</button>' : ''}</div></div>`;
  }
  function inject() {
    const lib = $('#libbody'); if (!lib || !lib.querySelector('[data-ai="open"]') || lib.querySelector('#qcbox')) return;
    lib.insertAdjacentHTML('beforeend', cards()); applyVars(lib);
  }
  function rerender() { const a = $('#qcbox'), b = $('#vabox'); if (a) { a.remove(); b?.remove(); inject(); } }
  new MutationObserver(inject).observe($('#libbody'), { childList: true });
  $('#libbody').addEventListener('click', e => {
    const b = e.target.closest('[data-qc]'); if (!b) return;
    const a = b.dataset.qc, claude = $('#qcclaude')?.checked !== false;
    if (a === 'run') runQc({ fix: false, claude });
    if (a === 'fix') runQc({ fix: false, claude });
    if (a === 'show') { if (last) showResult(); }
    if (a === 'ads') adsDialog();
    if (a === 'variants') runVariants({});
    if (a === 'compare') loadVa().then(showVariants);
  });

  // ---------- export dialog: "AI kiểm tra & sửa trước khi xuất" ----------
  new MutationObserver(() => {
    const box = $('#modalbox'); if (!box) return;
    if (box.querySelector('#xgo') && !box.querySelector('#qcx')) {
      const act = box.querySelector('.actions');
      act?.insertAdjacentHTML('beforebegin', `<label class="qcx"><input type="checkbox" id="qcx" ${saved?.qc ? 'checked' : ''}><span><b>AI kiểm tra & sửa trước khi xuất</b>${tip('Tự sửa chữ tràn khung, graphic che mặt, đoạn trống, phụ đề dài…; Claude soát chính tả và hook. Hoàn tác được.')}<br><small>Hoàn tác được.</small></span></label>`);
      if (saved && passQc) { // re-opened by us after the QC run: restore the form, then export
        const q = box.querySelector(`[name=xq][value="${saved.quality}"]`); if (q) q.checked = true;
        if ($('#xfrom')) $('#xfrom').value = saved.from; if ($('#xto')) $('#xto').value = saved.to;
        for (const i of box.querySelectorAll('[name=xasp]')) i.checked = saved.aspects.includes(i.value);
        setTimeout(() => $('#xgo')?.click(), 0);
      }
    }
    // QC card in the "Xuất xong" dialog
    if (exportQc && box.querySelector('h3 .ti-circle-check') && !box.querySelector('#qcdone')) {
      const q = exportQc; exportQc = null;
      box.querySelector('.actions')?.insertAdjacentHTML('beforebegin', `<div class="ai-card" id="qcdone"><h4><i class="ti ti-shield-check"></i> AI đã kiểm tra trước khi xuất</h4>
        <div class="qc-score">${q.after != null ? `${ring(q.before)}<i class="ti ti-arrow-right ui-subtle"></i>${ring(q.after)}` : ring(q.score)}
        <div class="qc-sum">Đã sửa ${q.counts?.fixed || 0}/${q.issues.length} vấn đề${q.counts?.high ? ` · còn ${q.counts.high} lỗi nặng` : ''}.<br><a href="#" id="qcdetail">Xem chi tiết</a></div></div></div>`);
      applyVars(box); $('#qcdetail').onclick = e => { e.preventDefault(); showResult(); };
    }
  }).observe($('#modalbox'), { childList: true, subtree: false });
  // ---------- export gate (M15, scripts/export_gate.mjs): QC still has high ad issues → ask, default = stop ----------
  let passGate = false;
  const KCODE = { ad_policy: 'Chính sách', ad_claim: 'Claim', ad_originality: 'Nguyên bản' };
  async function checkGate() {
    if (dirty() && !await S.saveNow()) return null;
    const g = await S.api('/api/qc/gate').catch(() => null);
    if (!g?.blocked) { passGate = true; return $('#xgo')?.click(); }
    showGate(g);
  }
  function showGate(g) {
    const box = $('#modalbox'); if (!box || box.querySelector('#qcgate')) return;
    // hide the export form (kept, with its handlers) while the gate is open; #modal .actions sets display, so not [hidden]
    const form = [...box.children].map(el => [el, el.style.display]); form.forEach(([el]) => (el.style.display = 'none'));
    const wasQc = passQc; passQc = false; saved = null; // "Dừng" must not leave the QC-then-export pass armed
    box.insertAdjacentHTML('beforeend', `<div id="qcgate">
      <h3><i class="ti ti-shield-x qc-c-bad"></i> Chưa xuất: còn ${g.issues.length} lỗi quảng cáo mức cao</h3>
      <p class="muted qc-p0">Lần kiểm tra chất lượng gần nhất${g.checked ? ` (${new Date(g.checked).toLocaleString('vi-VN')})` : ''} còn các lỗi sau. Mặc định là dừng để sửa.</p>
      ${g.stale ? '<div class="help qc-c-warn">Timeline đã đổi sau lần kiểm tra đó. Nếu đã sửa, bấm “Kiểm tra lại”.</div>' : ''}
      <div class="qc-list">${g.issues.map(i => `<div class="qc-it" data-qct="${i.t}"><span class="tm">${S.fmt(i.t).replace(/^0:/, '')}</span><span class="sv high"></span>
        <span class="bd"><span class="src">${esc(KCODE[i.kind] || i.kind)}</span>${esc(i.msg)}</span></div>`).join('')}</div>
      ${g.hard ? `<div class="help qc-c-bad"><b>Có lỗi chính sách quảng cáo mức cao: không bỏ qua được.</b> Sửa lời thoại hoặc chữ trên màn hình rồi kiểm tra lại.</div>`
        : `<label class="lbl" for="qcgwhy">Vẫn xuất? Ghi lý do (lưu vào .studio/qc.json và .studio/qc_overrides.log)</label>
           <textarea id="qcgwhy" rows="2" class="qc-ta" placeholder="Ví dụ: claim đã có giấy chứng nhận số …, khách hàng đã duyệt"></textarea>`}
      <div class="actions"><button id="qcgqc"><i class="ti ti-refresh"></i> Kiểm tra lại</button>
        ${g.hard ? '' : '<button id="qcggo" disabled><i class="ti ti-upload"></i> Vẫn xuất</button>'}
        <button class="primary" id="qcgstop"><i class="ti ti-player-stop"></i> Dừng</button></div></div>`);
    const gate = $('#qcgate'), stop = $('#qcgstop'), why = $('#qcgwhy'), go = $('#qcggo');
    stop.focus();
    stop.onclick = () => S.closeModal();
    gate.querySelector('.qc-list').addEventListener('click', e => { const it = e.target.closest('[data-qct]'); if (it) { S.setTime(+it.dataset.qct); S.closeModal(); } });
    $('#qcgqc').onclick = () => runQc({ fix: false, claude: false });
    if (why) why.oninput = () => (go.disabled = why.value.trim().length < 10);
    if (go) go.onclick = async () => {
      const r = await S.api('/api/qc/override', { reason: why.value });
      if (r.error) return S.toast(r.error);
      S.toast('Đã ghi lý do bỏ qua chặn xuất');
      gate.remove(); form.forEach(([el, d]) => (el.style.display = d));
      passQc = wasQc; passGate = true; $('#xgo')?.click();
    };
  }
  document.addEventListener('click', e => {
    if (!e.target.closest?.('#xgo')) return;
    // the gate is checked on the export about to run: after the QC pass when "AI kiểm tra & sửa" is ticked, else now
    if (passGate) passGate = false;
    else if (passQc || !$('#qcx')?.checked) { e.preventDefault(); e.stopImmediatePropagation(); checkGate(); return; }
    if (passQc) { passQc = false; saved = null; return; } // second pass: let studio.js export
    if (!$('#qcx')?.checked) return;
    e.preventDefault(); e.stopImmediatePropagation();
    saved = { qc: true, quality: document.querySelector('[name=xq]:checked')?.value || '1080', from: $('#xfrom')?.value || '', to: $('#xto')?.value || '',
      aspects: [...document.querySelectorAll('[name=xasp]:checked')].map(i => i.value) };
    runQc({ fix: true, claude: true, after: q => { exportQc = q; passQc = true; $('#export').click(); } });
  }, true);

  // S22 M154: thanh Hỏi Claude (75_ask.js) — bước Kiểm tra
  //   brief()        → { score, issues: [{ t, kind, msg, sev }] } của lần kiểm tra gần nhất (bộ định tuyến giải thích lỗi) | null
  //   fixAll()       → Promise<{ q } | { error }>: kiểm tra + sửa hết (job qc, fix), timeline mới đã nạp; thanh đưa qua Studio.review
  //   variants(kind) → 3 phiên bản A/B (job variants, hộp So sánh như nút của thẻ A/B)
  S.qc = {
    get last() { return last; },
    brief: () => (last ? { score: last.score, issues: (last.issues || []).filter(i => !i.fixed).map(i => ({ t: i.t, kind: i.kind_vi || i.kind, msg: i.msg, sev: i.severity })) } : null),
    fixAll: () => new Promise(ok => runQc({ fix: true, claude: $('#qcclaude')?.checked !== false, after: q => { S.closeModal(); rerender(); ok({ q }); }, fail: error => ok({ error }) })),
    variants: kind => runVariants({ kind }),
  };
  S.onReady(() => { load().then(rerender); loadVa().then(rerender); });
})();
