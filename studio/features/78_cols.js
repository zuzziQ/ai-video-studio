// S23 M165: hai cột theo chế độ (docs/plans/S23-bo-cuc-theo-kho-video.md mục 2, 4). Vùng lấy từ Studio.layout (76_layout.js):
//   Cơ bản (data-lib="flyout"): thư viện là ngăn trượt đè lên khung, mở khi bấm nút thanh trái (bấm lại đúng nút thì đóng), tự đóng
//     khi bấm ra ngoài (khung, cột phải, timeline, thanh trên), Esc, thả một mục từ thư viện, hoặc vừa chèn xong (bấm một mục trong
//     ngăn làm dự án đổi). Đang kéo một mục thì ngăn mờ đi để thấy chỗ thả.
//   Chuyên nghiệp: phím [ gấp / mở thư viện, ] gấp / mở cột phải (Studio.layout 'foldLib' / 'foldRight', nhớ theo máy); bấm lại nút
//     của panel đang mở trên thanh trái cũng gấp / mở thư viện. Cơ bản: [ mở / đóng ngăn trượt, ] gấp / mở cột phải như
//     Chuyên nghiệp (S24 M170, C35).
//   Studio.cols = { open(), close(), toggle(), get isOpen() }
// CSS ở studio.css (khối "S23 M165"). Lõi thuần: LayoutCore.foldKey / toggleFold / flyoutClick (76_layout.core.js).
'use strict';
(() => {
  const S = window.Studio, LC = window.LayoutCore;
  if (!S || !LC || !S.layout) return;
  const $ = q => document.querySelector(q), body = document.body;
  const lib = $('#lib'), rail = $('#rail');
  if (!lib || !rail) return;
  let open = false;
  const flyout = () => S.layout.get().lib === 'flyout';

  function setOpen(v) {
    v = !!v && flyout();
    if (v === open) return;
    open = v;
    body.toggleAttribute('data-libopen', open);
    lib.setAttribute('aria-hidden', String(flyout() && !open));
    if (!open && lib.contains(document.activeElement)) document.activeElement.blur(); // không để focus trong ngăn đã ẩn
  }
  const close = () => setOpen(false);

  // ---------- thanh trái: Cơ bản mở / đóng ngăn, Chuyên nghiệp bấm lại panel đang mở thì gấp ----------
  let wasCur = false;
  rail.addEventListener('click', e => { const b = e.target.closest('[data-p]'); wasCur = !!b && b.classList.contains('on'); }, true); // trước openPanel (library.js)
  rail.addEventListener('click', e => {
    const b = e.target.closest('[data-p]'); if (!b || S._restoring) return; // M168: mở lại panel của tab lúc tải ≠ mở tay
    const st = S.layout.get();
    if (st.lib === 'flyout') return setOpen(LC.flyoutClick(open, wasCur));
    if (st.mode === 'pro' && (st.foldLib || wasCur)) S.layout.set('foldLib', !st.foldLib);
  });
  // "Thêm…" của thanh trái (01_workflow.js, #wf-pop gắn vào body) và mở panel từ chỗ khác (Studio.workflow.focus, cột phải)
  document.addEventListener('click', e => { if (e.target.closest?.('#wf-pop [data-p]')) unfoldLib(); });
  function unfoldLib() {
    const st = S.layout.get();
    if (st.lib === 'flyout') setOpen(true); else if (st.foldLib) S.layout.set('foldLib', false);
  }
  if (S.workflow?.focus) { const f = S.workflow.focus; S.workflow.focus = (...a) => { unfoldLib(); return f(...a); }; }

  // ---------- tự đóng ----------
  const OUT = '#center, #right, #tlwrap, #top';
  document.addEventListener('pointerdown', e => { if (open && e.target.closest?.(OUT) && !lib.contains(e.target)) close(); }, true);
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !open) return;
    if (!$('#modal')?.hidden || $('#wf-pop') || $('#wf-more:not([hidden])')) return; // Esc đóng hộp / menu trước
    e.preventDefault(); e.stopImmediatePropagation(); close();
  }, true);
  // thả một mục kéo từ thư viện (library.js gỡ body.libdrag ở dragend)
  $('#libbody')?.addEventListener('dragend', () => { if (open) close(); });
  // chèn xong: bấm một mục (không phải ô nhập) trong ngăn rồi dự án đổi (studio.js markDirty → #status "Chưa lưu") trong ~1 giây
  let pick = 0;
  lib.addEventListener('click', e => {
    if (!open) return;
    const t = e.target.closest?.('button, [data-cid], [draggable="true"], .tcard, .mcell, .item, [role="button"]');
    pick = t && !t.closest('input, select, textarea, label, .seg, .chips, #wf-tabs, .libhead, .libsearch') ? performance.now() : 0;
  });
  const status = $('#status');
  if (status) new MutationObserver(() => {
    if (open && pick && performance.now() - pick < 1000 && /Chưa lưu/.test(status.textContent)) { pick = 0; close(); }
  }).observe(status, { childList: true, characterData: true, subtree: true });

  // ---------- phím [ / ] ----------
  window.addEventListener('keydown', e => {
    const which = LC.foldKey({ code: e.code, key: e.key, mod: e.metaKey || e.ctrlKey, alt: e.altKey });
    if (!which || e.repeat) return;
    const a = document.activeElement;
    if (/INPUT|TEXTAREA|SELECT/.test(a?.tagName) && a.type !== 'checkbox' && a.type !== 'range') return;
    if (a?.isContentEditable || !$('#modal')?.hidden) return;
    const st = S.layout.get();
    if (which === 'lib' && st.lib === 'flyout') { e.preventDefault(); setOpen(!open); return; }
    if (st.focus || (which === 'lib' && st.mode !== 'pro')) return; // M170: ] gấp cột phải ở cả hai chế độ
    e.preventDefault();
    const nx = LC.toggleFold(st, which), key = which === 'lib' ? 'foldLib' : 'foldRight';
    S.layout.set(key, nx[key]);
    S.toast?.(which === 'lib' ? (nx.foldLib ? 'Đã gấp thư viện (phím [ để mở)' : 'Đã mở thư viện') : (nx.foldRight ? 'Đã gấp cột phải (phím ] để mở)' : 'Đã mở cột phải'));
  });

  // đổi chế độ / khổ / ⤢: rời dạng ngăn trượt thì bỏ trạng thái mở
  S.layout.on(st => { if (st.lib !== 'flyout') { open = false; body.removeAttribute('data-libopen'); lib.removeAttribute('aria-hidden'); } else if (!open) lib.setAttribute('aria-hidden', 'true'); });
  if (flyout()) lib.setAttribute('aria-hidden', 'true');

  S.cols = { open: () => setOpen(true), close, toggle: () => setOpen(!open), get isOpen() { return open; } };
})();
