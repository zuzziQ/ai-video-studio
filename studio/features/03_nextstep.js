// AI Video Studio — thẻ "Bước tiếp theo" + thanh "Sẵn sàng x/6" ở cột phải khi không chọn gì (M84, đợt S10).
// Một câu + một nút theo trạng thái dự án: chưa thương hiệu → ①, chưa video nguồn → ②, chưa mẫu/phụ đề → ③, chưa kiểm tra → ④, chưa xuất → ⑤.
// Nội dung cũ của inspector (Dự án, Thương hiệu) giữ nguyên, nằm trong mục thu gọn "Cài đặt dự án" bên dưới.
// Trạng thái kiểm tra / xuất đọc từ GET /api/qc và GET /api/publish/videos (có sẵn), không thêm route.
'use strict';
(() => {
  const S = Studio, $ = s => document.querySelector(s), esc = S.esc;
  const store = {
    get(k, d) { try { return localStorage.getItem('avs.' + k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('avs.' + k, v); } catch {} },
  };
  const NUM = ['', '①', '②', '③', '④', '⑤'];
  const has = id => typeof RAIL !== 'undefined' && RAIL.some(r => r[0] === id);
  const open = (id, st) => () => { if (has(id)) openPanel(id); else if (S.workflow) S.workflow.goStep(st); };
  let qcDone = false, exported = false, fetchedAt = 0, busy = false;

  // 6 mục sẵn sàng, theo thứ tự làm. done(TL, CAP) -> bool.
  const ITEMS = [
    { k: 'brand', n: 1, st: 'prep', ic: 'ti-palette', label: 'Thương hiệu', done: tl => !!(tl.brand && (tl.brand.kit || tl.brand.name || tl.brand.logo)),
      say: 'Thêm tên và logo thương hiệu: mẫu và graphic sẽ tự lấy màu, chữ của bạn.', btn: 'Thêm thương hiệu', go: open('brands', 'prep') },
    { k: 'source', n: 2, st: 'source', ic: 'ti-video', label: 'Video nguồn', done: tl => (tl.clips || []).length > 0 && tl.duration > 0,
      say: 'Chọn video quay sẵn để bắt đầu dựng.', btn: 'Chọn video', go: open('wf-new', 'source') },
    { k: 'tpl', n: 3, st: 'build', ic: 'ti-layout-grid', label: 'Mẫu', done: tl => !!tl.pack || (tl.scenes || []).some(s => s._tpl || s._recipe),
      say: 'Chọn một mẫu hợp nội dung, hoặc để AI dựng nhanh giúp bạn.', btn: 'Chọn mẫu', go: open('tpl', 'build') },
    { k: 'cap', n: 3, st: 'build', ic: 'ti-badge-cc', label: 'Phụ đề', done: (tl, cap) => (cap || []).length > 0 && tl.caption_style !== 'none',
      say: 'Bật phụ đề để người xem hiểu cả khi tắt tiếng.', btn: 'Chọn kiểu phụ đề', go: open('text', 'build') },
    { k: 'qc', n: 4, st: 'check', ic: 'ti-shield-check', label: 'Kiểm tra', done: () => qcDone,
      say: 'Soi lỗi trước khi xuất: chữ tràn khung, graphic che mặt, âm lượng.', btn: 'Kiểm tra video', go: open('wf-qc', 'check') },
    { k: 'export', n: 5, st: 'ship', ic: 'ti-upload', label: 'Xuất', done: () => exported,
      say: 'Video đã sẵn sàng. Xuất ra file MP4 để đăng.', btn: 'Xuất video', go: open('wf-export', 'ship') },
  ];
  const ALL_DONE = { n: 5, ic: 'ti-send', say: 'Đã xuất video. Viết caption, hashtag và ảnh bìa để đăng.', btn: 'Mở gói đăng', go: open('wf-publish', 'ship') };

  const css = document.createElement('style');
  css.textContent = `
  #insp > .ns { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
  .ns-card { border: 1px solid var(--acc-line); background: var(--acc-soft); border-radius: var(--r); padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .ns-k { font-size: 11px; font-weight: 600; color: var(--tx2); text-transform: uppercase; letter-spacing: .04em; }
  .ns-card p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--tx); }
  .ns-card button { align-self: flex-start; gap: 8px; }
  .ns-rh { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--tx2); }
  .ns-rh b { margin-left: auto; color: var(--tx); font-size: 13px; }
  .ns-bar { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin: 8px 0; }
  .ns-bar i { height: 4px; border-radius: 4px; background: var(--bg4); }
  .ns-bar i.on { background: var(--acc); }
  .ns-list { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  .ns-list button { height: 32px; justify-content: flex-start; gap: 8px; padding: 0 8px; font-size: 12px; background: transparent; border-color: var(--line); color: var(--tx2); min-width: 0; }
  .ns-list button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ns-list button:hover { background: var(--bg3); color: var(--tx); }
  /* is-done, not .ok: studio.css has #insp .ok (status banner: margin-top 8px, green fill) that pushed done items down a row */
  .ns-list button.is-done { color: var(--tx); }
  .ns-list button.is-done .ti { color: var(--ok); }
  .ns-list button.is-next { border-color: var(--acc-line); color: var(--tx); }
  .ns-more { border-top: 1px solid var(--line); margin: 0 -12px; }
  .ns-more > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 12px; font-size: 12px; font-weight: 600; color: var(--tx2); }
  .ns-more > summary::-webkit-details-marker { display: none; }
  .ns-more > summary:hover { color: var(--tx); }
  .ns-more > summary .ti-chevron-right { margin-left: auto; transition: transform .15s; }
  .ns-more[open] > summary .ti-chevron-right { transform: rotate(90deg); }
  .ns-link { color: var(--acc); cursor: pointer; text-decoration: underline; }
  `;
  document.head.appendChild(css);

  async function refresh(force) {
    if (busy || !S.TL || (!force && Date.now() - fetchedAt < 8000)) return;
    busy = true;
    try {
      const [q, v] = await Promise.all([S.api('/api/qc').catch(() => null), S.api('/api/publish/videos').catch(() => null)]);
      qcDone = !!(q && !q.none && !q.error); exported = Array.isArray(v) && v.length > 0;
    } finally { busy = false; fetchedAt = Date.now(); }
    paint();
  }

  function state() {
    const tl = S.TL, cap = S.CAP;
    const done = ITEMS.map(it => { try { return !!it.done(tl, cap); } catch { return false; } });
    const i = done.indexOf(false);
    return { done, next: i < 0 ? null : ITEMS[i], count: done.filter(Boolean).length };
  }

  function html() {
    const { done, next, count } = state(), n = next || ALL_DONE;
    return `<div class="ns-card" aria-live="polite"><div class="ns-k">Bước tiếp theo · ${NUM[n.n]}</div><p>${esc(n.say)}</p>
        <button class="primary" data-ns="go"><i class="ti ${n.ic}"></i>${esc(n.btn)}</button></div>
      <div class="ns-ready"><div class="ns-rh"><i class="ti ti-checklist"></i><span>Sẵn sàng</span><b>${count}/${ITEMS.length}</b></div>
        <div class="ns-bar" role="progressbar" aria-label="Sẵn sàng" aria-valuemin="0" aria-valuemax="${ITEMS.length}" aria-valuenow="${count}">${done.map(d => `<i class="${d ? 'on' : ''}"></i>`).join('')}</div>
        <div class="ns-list">${ITEMS.map((it, i) => `<button data-ns-i="${i}" class="${done[i] ? 'is-done' : ''} ${it === next ? 'is-next' : ''}" title="${esc(it.label)}: ${done[i] ? 'xong' : 'chưa xong'} · bước ${it.n}">
          <i class="ti ${done[i] ? 'ti-circle-check' : it.ic}"></i><span>${esc(it.label)}</span></button>`).join('')}</div></div>`;
  }

  function paint() { const box = $('#insp > .ns'); if (box) box.querySelector('[data-ns="top"]').innerHTML = html(); }

  // inspector "không chọn gì" (projectPanel của studio.js) vừa vẽ lại: thêm thẻ, gom phần cũ vào mục thu gọn
  function wrap() {
    const insp = $('#insp');
    if (!insp || S.sel || !S.TL || insp.querySelector(':scope > .ns') || !insp.querySelector(':scope > .itabs [data-itab="proj"]')) return;
    const box = document.createElement('div'); box.className = 'ns';
    box.innerHTML = `<div data-ns="top">${html()}</div>
      <details class="ns-more"${store.get('nsMore', '') === '1' ? ' open' : ''}><summary><i class="ti ti-settings"></i>Cài đặt dự án và thương hiệu<i class="ti ti-chevron-right"></i></summary></details>`;
    const det = box.querySelector('details');
    det.append(...insp.childNodes);
    det.addEventListener('toggle', () => store.set('nsMore', det.open ? '1' : ''));
    if (det.querySelector('.itabs [data-itab="brand"].on')) det.querySelector('.ibody')?.insertAdjacentHTML('afterbegin',
      `<p class="wf-hint">Màu, chữ của riêng dự án này. Bộ thương hiệu dùng chung ở <a class="ns-link" data-ns="brands">bước ① Thương hiệu</a>.</p>`);
    insp.appendChild(box);
    refresh();
  }

  const insp = $('#insp');
  if (insp) {
    new MutationObserver(wrap).observe(insp, { childList: true });
    insp.addEventListener('click', e => {
      const b = e.target.closest('[data-ns], [data-ns-i]'); if (!b) return;
      if (b.dataset.nsI != null) return ITEMS[+b.dataset.nsI]?.go();
      if (b.dataset.ns === 'go') { const { next } = state(); return (next || ALL_DONE).go(); }
      if (b.dataset.ns === 'brands') return open('brands', 'prep')();
    });
  }
  window.addEventListener('focus', () => refresh());
  S.onReady(() => { wrap(); refresh(true); });
  S.nextStep = { refresh: () => refresh(true), state };
})();
