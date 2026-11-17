// Kịch bản có sẵn (S17 M123): ô "Kịch bản" (không bắt buộc) ở bước Nguồn và ở thẻ Chuẩn bị của Tự lái.
// Server: studio/routes/19_script.mjs · scripts/script_doc.mjs. Dán chữ hoặc mở .txt / .docx; dấu [HOOK] [CHỮ: …] [B-ROLL: …] [CTA].
//   Studio.scriptCard.mount(el)   bước Nguồn: lưu vào dự án đang mở (.studio/script.json), phụ đề theo đúng chữ kịch bản
//   Studio.scriptStage.mount(el)  panel Tự lái: giữ chữ cho video kế tiếp; .take() → id kịch bản chờ ('' khi để trống)
(() => {
  const { $, esc } = Studio;
  const css = document.createElement('style');
  css.textContent = `
  .sc-box { margin-top: var(--space-2); }
  .sc-box textarea { width: 100%; min-height: 96px; box-sizing: border-box; font-size: var(--text-xs); }
  .sc-row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-top: var(--space-2); }
  .sc-row .sc-gap { flex: 1 1 auto; }
  .sc-st { list-style: none; margin: var(--space-2) 0 0; padding: 0; font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); }
  .sc-st li { display: flex; gap: var(--space-1); align-items: baseline; margin: var(--space-1) 0; overflow-wrap: anywhere; }
  .sc-st .is-warn { color: rgb(var(--color-warning)); }
  .sc-hint { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); margin: var(--space-1) 0 0; }`;
  document.head.appendChild(css);
  const HINT = 'Không bắt buộc. Dấu tuỳ chọn: <code>[HOOK]</code> mở đầu · <code>[CHỮ: …]</code> chữ trên màn hình · <code>[B-ROLL: …]</code> hình minh hoạ · <code>[CTA]</code> kêu gọi. Không dấu: dòng trống tách đoạn. Mẫu quyết định giao diện, kịch bản quyết định chữ.';

  async function fileText(f) {
    if (/\.docx$/i.test(f.name)) {
      const r = await fetch('/api/script/docx', { method: 'POST', body: f }).then(x => x.json()).catch(e => ({ error: e.message }));
      if (r.error) throw new Error(r.error); return r.text;
    }
    if (/\.(txt|md)$/i.test(f.name) || f.type === 'text/plain') return (await f.text()).replace(/^﻿/, '');
    throw new Error('Chỉ nhận file .txt hoặc .docx');
  }
  // khung chung: ô chữ + Mở file; `extra` là nút riêng của từng nơi
  function frame(el, { text, extra = '', status = '' }) {
    el.innerHTML = `<div class="sc-box"><textarea data-sc="text" placeholder="Dán kịch bản vào đây…" aria-label="Kịch bản">${esc(text || '')}</textarea>
      <div class="sc-row"><button data-sc="file"><i class="ti ti-file-text"></i>Mở .txt / .docx</button><span class="sc-gap"></span>${extra}</div>
      <input type="file" data-sc="pick" accept=".txt,.docx,text/plain" hidden>${status}<p class="sc-hint">${HINT}</p></div>`;
    const pick = el.querySelector('[data-sc="pick"]'), ta = el.querySelector('[data-sc="text"]');
    el.querySelector('[data-sc="file"]').onclick = () => pick.click();
    return { ta, pick };
  }

  // ---------- bước Nguồn: kịch bản của dự án đang mở ----------
  let P = { dir: null, data: null, busy: false, draft: null, name: '' };
  const fmtPct = v => Math.round(v * 100) + '%';
  function statusOf(d) {
    const sc = d?.script; if (!sc) return '';
    const segs = sc.segments || [], miss = segs.filter(s => s.spoken === false), A = sc.align;
    const li = (warn, ic, t) => `<li class="${warn ? 'is-warn' : ''}"><i class="ti ${ic}"></i><span>${t}</span></li>`;
    const marks = segs.reduce((n, s) => n + (s.screen?.length || 0) + (s.broll?.length || 0) + (s.kind !== 'body' ? 1 : 0), 0);
    return `<ul class="sc-st">${li(false, 'ti-circle-check', `Đã lưu ${segs.length} đoạn${marks ? `, ${marks} dấu` : ''}${sc.name ? ` · ${esc(sc.name)}` : ''}`)}
      ${!A ? li(true, 'ti-clock', d.mute ? 'Chưa chia phụ đề' : 'Chưa có lời thoại: phụ đề theo kịch bản khi tạo lời thoại') : A.mode === 'even'
        ? li(false, 'ti-circle-check', 'Video không lời: phụ đề chia đều theo đoạn')
        : li(false, 'ti-circle-check', `Phụ đề theo chữ kịch bản · ${A.matched}/${A.words} chữ khớp lời nói (${fmtPct(A.matched / Math.max(1, A.words))})`)}
      ${miss.map(s => li(true, 'ti-alert-triangle', `Chưa nói: “${esc(s.say.slice(0, 60))}${s.say.length > 60 ? '…' : ''}”`)).join('')}
      ${(A?.offscript || []).slice(0, 3).map(o => li(true, 'ti-alert-triangle', `Nói ngoài kịch bản ${o.t0.toFixed(1)}s: “${esc(o.text.slice(0, 50))}…”`)).join('')}
      ${(sc.gate?.issues || []).filter(i => i.severity !== 'low').slice(0, 4).map(i => li(true, 'ti-shield-x', `Claim quảng cáo · ${esc(i.where)}: ${esc(i.msg.slice(0, 120))}`)).join('')}</ul>`;
  }
  function renderCard(el) {
    if (!el?.isConnected) return;
    const sc = P.data?.script, text = P.draft ?? sc?.text ?? '';
    const { ta, pick } = frame(el, { text, status: P.data ? statusOf(P.data) : '',
      extra: `${sc ? '<button data-sc="clear" title="Bỏ kịch bản, lấy lại phụ đề nhận dạng tự động"><i class="ti ti-trash"></i>Bỏ</button>' : ''}
        <button class="primary" data-sc="save" ${P.busy ? 'disabled' : ''}><i class="ti ${P.busy ? 'ti-loader-2 spin' : 'ti-device-floppy'}"></i>${sc ? 'Lưu lại' : 'Dùng kịch bản'}</button>` });
    ta.oninput = () => { P.draft = ta.value; };
    pick.onchange = async () => { const f = pick.files[0]; if (!f) return; try { P.draft = await fileText(f); P.name = f.name; renderCard(el); } catch (e) { Studio.toast(e.message); } };
    el.querySelector('[data-sc="save"]').onclick = async () => {
      const t = (P.draft ?? ta.value).trim(); if (!t) return Studio.toast('Kịch bản đang trống');
      P.busy = true; renderCard(el);
      try {
        await Studio.saveNow?.(); // phụ đề đang sửa trong trình duyệt vào đĩa trước khi server thay
        const r = await Studio.api('/api/script', { text: t, name: P.name || sc?.name || '' });
        if (r.error) throw new Error(r.error);
        P.draft = null; P.data = { ...(P.data || {}), script: r.script };
        if (!r.pending) await Studio.reload?.();
        Studio.toast(r.pending ? 'Đã lưu kịch bản: phụ đề theo kịch bản khi tạo lời thoại' : `Đã lưu kịch bản: ${r.captions} dòng phụ đề theo đúng chữ kịch bản`);
      } catch (e) { Studio.toast(e.message); }
      P.busy = false; renderCard(el);
    };
    const clr = el.querySelector('[data-sc="clear"]');
    if (clr) clr.onclick = async () => {
      if (!confirm('Bỏ kịch bản của dự án này? Phụ đề quay về bản nhận dạng tự động (nếu còn bản sao lưu).')) return;
      await Studio.saveNow?.();
      const r = await Studio.api('/api/script/clear', {});
      if (r.error) return Studio.toast(r.error);
      P.data = { ...(P.data || {}), script: null }; P.draft = ''; if (r.restored) await Studio.reload?.();
      Studio.toast(r.restored ? 'Đã bỏ kịch bản, phụ đề quay về bản nhận dạng' : 'Đã bỏ kịch bản'); renderCard(el);
    };
  }
  Studio.scriptCard = {
    mount(el) {
      const dir = Studio.META?.dir || '';
      if (P.dir !== dir) { P = { dir, data: null, busy: false, draft: null, name: '' }; }
      renderCard(el);
      if (!P.data) Studio.api('/api/script').then(r => { if (P.dir === dir && !r.error) { P.data = r; renderCard(el); } }).catch(() => {});
    },
  };

  // ---------- panel Tự lái: kịch bản cho video kế tiếp ----------
  const Q = { text: '', name: '' };
  Studio.scriptStage = {
    mount(el) {
      if (!el) return;
      const { ta, pick } = frame(el, { text: Q.text, extra: Q.text.trim() ? '<button data-sc="drop"><i class="ti ti-x"></i>Xoá</button>' : '',
        status: Q.text.trim() ? '<p class="sc-hint"><i class="ti ti-info-circle"></i> Dùng cho video kế tiếp thêm vào hàng đợi, rồi tự xoá.</p>' : '' });
      ta.oninput = () => { const had = !!Q.text.trim(); Q.text = ta.value; if (had !== !!Q.text.trim()) { const pos = ta.selectionStart; this.mount(el); const t2 = el.querySelector('textarea'); t2.focus(); t2.setSelectionRange(pos, pos); } };
      pick.onchange = async () => { const f = pick.files[0]; if (!f) return; try { Q.text = await fileText(f); Q.name = f.name; this.mount(el); } catch (e) { Studio.toast(e.message); } };
      const d = el.querySelector('[data-sc="drop"]'); if (d) d.onclick = () => { Q.text = ''; Q.name = ''; this.mount(el); };
      this.el = el;
    },
    /** Lưu kịch bản chờ → id cho job ('' khi ô trống). Lỗi thì ném ra để không chạy nhầm không kịch bản. */
    async take() {
      if (!Q.text.trim()) return '';
      const r = await Studio.api('/api/script/stage', { text: Q.text, name: Q.name });
      if (r.error) throw new Error('Kịch bản: ' + r.error);
      return r.id;
    },
    clear() { Q.text = ''; Q.name = ''; if (this.el?.isConnected) this.mount(this.el); },
  };
})();
