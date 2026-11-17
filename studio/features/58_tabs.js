// S18 M129: thanh tab "Dự án đang mở" ngay dưới thanh trên (kiểu tab timeline của Premiere / tab dự án của CapCut). Hiện khi có từ
// 2 dự án trở lên. Bấm tab = lưu dự án đang sửa rồi mở tab kia trong cửa sổ này (trạng thái giao diện từng tab giữ ở
// Studio.saveTabUI); Ctrl/⌘ + bấm hoặc bấm chuột giữa = mở trong cửa sổ trình duyệt mới, sửa song song. × đóng tab (không xoá
// dự án). + mở trang chủ để mở thêm dự án. Kéo thả để đổi thứ tự. Chấm xoay = dự án đang chạy tác vụ (xuất, QC…).
// Clip cắt từ cùng một video dài là một NHÓM (kiểu nhóm tab của Chrome): nhãn màu "tên bộ n/N" có ‹ › sang clip trước / sau
// (thay tab đang xem tại chỗ, nhóm không phình ra) và mở danh sách cả bộ (57_clipset.js); tab của nhóm gạch chân cùng màu.
// Server: studio/routes/58_tabs.mjs + studio/tabs.mjs; mỗi request mang mã tab (studio/auth.js, X-AVS-Project).
'use strict';
(() => {
  const S = Studio, { esc, toast } = S;
  const api = (u, b) => S.api(u, b).catch(e => ({ error: e.message }));
  let TABS = [], moving = false, timer = null, dragId = null;

  const css = document.createElement('style');
  css.textContent = `
  #ptabs { position: absolute; top: 50px; left: 0; right: 0; height: 32px; display: flex; align-items: stretch; gap: 2px; padding: 0 var(--space-3);
    background: rgb(var(--color-canvas)); border-bottom: 1px solid rgb(var(--color-line)); z-index: 4; overflow-x: auto; scrollbar-width: none; }
  #ptabs[hidden] { display: none; }
  body.has-ptabs main { top: 82px; }
  .ptab { display: inline-flex; align-items: center; gap: var(--space-1); max-width: 220px; min-width: 0; flex: 0 1 auto; padding: 0 var(--space-1) 0 var(--space-3);
    border: 0; border-radius: var(--radius-control) var(--radius-control) 0 0; background: transparent; color: rgb(var(--color-fg-muted)); font-size: var(--text-2xs); cursor: pointer; }
  .ptab:hover { background: rgb(var(--color-surface-hover)); color: rgb(var(--color-fg)); }
  .ptab.on { background: rgb(var(--color-surface)); color: rgb(var(--color-fg)); box-shadow: inset 0 2px 0 rgb(var(--color-accent)); }
  .ptab.gone { opacity: .5; text-decoration: line-through; }
  .ptab.drop { box-shadow: inset 2px 0 0 rgb(var(--color-accent)); }
  .ptab .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .ptab .x { flex: none; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--radius-xs); opacity: .55; }
  .ptab .x:hover { opacity: 1; background: rgb(var(--color-surface-raised)); }
  .ptab .busy { flex: none; color: rgb(var(--color-accent-text)); }
  #ptabs .padd { flex: none; border: 0; background: transparent; color: rgb(var(--color-fg-subtle)); padding: 0 var(--space-2); cursor: pointer; }
  #ptabs .padd:hover { color: rgb(var(--color-fg)); }
  .pgrp { --g: var(--color-accent); flex: none; display: inline-flex; align-items: center; gap: 0; margin: 4px 2px 4px var(--space-2); padding: 0 2px; border-radius: var(--radius-pill);
    background: rgb(var(--g) / .16); color: rgb(var(--color-fg)); font-size: var(--text-2xs); }
  .pgrp:first-child { margin-left: 0; }
  .pgrp button { border: 0; background: transparent; color: inherit; height: 22px; padding: 0 var(--space-1); display: inline-flex; align-items: center; gap: var(--space-1); cursor: pointer; border-radius: var(--radius-pill); white-space: nowrap; }
  .pgrp button:hover:not(:disabled) { background: rgb(var(--g) / .22); }
  .pgrp button:disabled { opacity: .35; cursor: default; }
  .pgrp .gl { max-width: 160px; overflow: hidden; text-overflow: ellipsis; } .pgrp b { font-weight: 600; }
  .ptab.ing { box-shadow: inset 0 -2px 0 rgb(var(--g) / .7); }
  .ptab.ing.on { box-shadow: inset 0 2px 0 rgb(var(--color-accent)), inset 0 -2px 0 rgb(var(--g) / .7); }
  .g0 { --g: var(--color-accent); } .g1 { --g: var(--color-audio); } .g2 { --g: var(--color-success); } .g3 { --g: var(--color-warning); }`;
  document.head.appendChild(css);

  const bar = document.createElement('div');
  bar.id = 'ptabs'; bar.hidden = true; bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', 'Dự án đang mở');
  document.querySelector('#top')?.after(bar);

  const me = () => window.avsProject?.id || S.META?.pid || '';
  // màu nhóm cố định theo mã bộ (4 màu token)
  const gcls = key => 'g' + (parseInt(String(key).slice(0, 6), 16) % 4);
  const tabHTML = (t, g) => `<div class="ptab ${t.id === me() ? 'on' : ''} ${t.exists ? '' : 'gone'} ${g ? 'ing ' + g : ''}" role="tab" tabindex="0" draggable="true"
        aria-selected="${t.id === me()}" data-id="${t.id}" title="${esc(t.name)} · ${esc(t.parent)}${t.busy ? `\nĐang chạy: ${esc(t.busy)}` : ''}${t.exists ? '\nCtrl/⌘ + bấm: mở trong cửa sổ mới' : '\nThư mục dự án không còn'}">
        ${t.busy ? '<i class="ti ti-loader-2 spin busy"></i>' : ''}<span class="nm">${esc(t.name)}</span>
        <span class="x" role="button" aria-label="Đóng tab ${esc(t.name)}" title="Đóng tab (dự án vẫn còn trên máy)"><i class="ti ti-x"></i></span></div>`;
  function groupHTML(set, tabs) {
    const g = gcls(set.key), here = tabs.some(t => t.id === me()), cs = here ? S.clipset?.set : null;
    const cur = cs ? cs.cur : set.cur, n = cs ? cs.n : set.n;
    const nav = d => here && S.clipset?.step(d);
    return `<div class="pgrp ${g}" data-key="${esc(set.key)}" role="group" aria-label="Bộ clip ${esc(set.name)}">
        ${here ? `<button data-g="prev" title="Clip trước trong bộ" aria-label="Clip trước" ${nav(-1) ? '' : 'disabled'}><i class="ti ti-chevron-left"></i></button>` : ''}
        <button data-g="list" aria-haspopup="dialog" title="${n} clip cắt từ “${esc(set.name)}”${here ? ' — bấm để xem cả bộ' : ' — bấm để mở'}"><i class="ti ti-stack-2"></i><span class="gl">${esc(set.name)}</span>
          <b>${here ? `${cur + 1}/${n}` : `${tabs.length}/${n}`}</b>${here ? '<i class="ti ti-chevron-down"></i>' : ''}</button>
        ${here ? `<button data-g="next" title="Clip sau trong bộ" aria-label="Clip sau" ${nav(1) ? '' : 'disabled'}><i class="ti ti-chevron-right"></i></button>` : ''}</div>`
      + tabs.map(t => tabHTML(t, g)).join('');
  }
  function paint() {
    const inSet = !!(S.clipset?.set) || TABS.some(t => t.id === me() && t.set);
    const show = TABS.length >= 2 || inSet || (TABS.length === 1 && TABS[0].id !== me());
    bar.hidden = !show; document.body.classList.toggle('has-ptabs', show);
    if (!show) return requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    // tab liền nhau cùng bộ → một nhóm (server đã xếp chúng đứng cạnh nhau)
    let html = '';
    for (let i = 0; i < TABS.length;) {
      const t = TABS[i];
      if (!t.set) { html += tabHTML(t, ''); i++; continue; }
      let j = i; while (j < TABS.length && TABS[j].set?.key === t.set.key) j++;
      html += groupHTML(t.set, TABS.slice(i, j)); i = j;
    }
    bar.innerHTML = html + '<button class="padd" title="Mở thêm dự án (trang chủ)" aria-label="Mở thêm dự án"><i class="ti ti-plus"></i></button>';
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); // sân khấu / timeline đo lại khi thanh tab hiện / ẩn
  }
  async function refresh() {
    const r = await api('/api/tabs');
    if (!Array.isArray(r?.tabs)) return;
    TABS = r.tabs; paint();
    clearTimeout(timer); if (TABS.some(t => t.busy)) timer = setTimeout(refresh, 4000);
  }
  // lưu dự án đang sửa trước khi rời trang; lưu hỏng thì ở lại (không bỏ mất thay đổi)
  async function leaveOk() {
    if (S.TL && S.dirty) { await S.saveNow(); if (S.dirty) { toast('Chưa lưu được dự án đang sửa — chưa chuyển tab'); return false; } }
    S.saveTabUI?.(); return true;
  }
  async function go(id, newWin) {
    if (id === me() && !newWin) return;
    const url = window.avsProject.url(id);
    if (newWin) return void window.open(url, '_blank', 'noopener');
    if (moving) return; moving = true;
    try { if (await leaveOk()) location.href = url; } finally { moving = false; }
  }
  async function close(id) {
    const t = TABS.find(x => x.id === id); if (!t) return;
    const here = id === me();
    if (here && !(await leaveOk())) return;
    const r = await api('/api/tabs/close', { id });
    if (!r.ok) return toast(r.error || 'Không đóng được tab');
    const i = TABS.indexOf(t); TABS = TABS.filter(x => x !== t);
    if (!here) return paint();
    const next = TABS[i] || TABS[i - 1];
    if (next) location.href = window.avsProject.url(next.id);
    else { paint(); S.openHome?.(); } // không còn tab nào: về trang chủ
  }

  bar.addEventListener('click', e => {
    if (e.target.closest('.padd')) return S.openHome?.();
    const gb = e.target.closest('.pgrp [data-g]');
    if (gb) {
      const grp = gb.closest('.pgrp'), a = gb.dataset.g, mine = TABS.filter(t => t.set?.key === grp.dataset.key), here = mine.some(t => t.id === me());
      if (!here) return mine[0] && go(mine[0].id, e.ctrlKey || e.metaKey); // nhóm khác: sang tab đầu của nhóm
      if (a === 'list') return S.clipset?.open(grp);
      return S.clipset?.go(S.clipset.step(a === 'next' ? 1 : -1));
    }
    const tab = e.target.closest('.ptab'); if (!tab) return;
    if (e.target.closest('.x')) return close(tab.dataset.id);
    if (tab.classList.contains('gone')) return toast('Thư mục dự án này không còn trên máy — đóng tab đi');
    go(tab.dataset.id, e.ctrlKey || e.metaKey);
  });
  bar.addEventListener('auxclick', e => { const tab = e.target.closest('.ptab'); if (e.button === 1 && tab && !tab.classList.contains('gone')) { e.preventDefault(); go(tab.dataset.id, true); } });
  bar.addEventListener('keydown', e => {
    const tab = e.target.closest('.ptab'); if (!tab) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(tab.dataset.id, e.ctrlKey || e.metaKey); }
    if (e.key === 'Delete') close(tab.dataset.id);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') (e.key === 'ArrowRight' ? tab.nextElementSibling : tab.previousElementSibling)?.focus?.();
  });
  // kéo thả đổi thứ tự
  bar.addEventListener('dragstart', e => { dragId = e.target.closest('.ptab')?.dataset.id || null; });
  bar.addEventListener('dragover', e => { const t = e.target.closest('.ptab'); if (!dragId || !t) return; e.preventDefault(); bar.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); t.classList.add('drop'); });
  bar.addEventListener('drop', e => {
    const t = e.target.closest('.ptab'); e.preventDefault(); bar.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
    if (!dragId || !t || t.dataset.id === dragId) return;
    const ids = TABS.map(x => x.id).filter(x => x !== dragId); ids.splice(ids.indexOf(t.dataset.id), 0, dragId);
    TABS = ids.map(id => TABS.find(x => x.id === id)); paint(); api('/api/tabs/order', { ids }); dragId = null;
  });
  // phím tắt: Ctrl/⌘ + Alt + ← / → sang tab trước / sau
  document.addEventListener('keydown', e => {
    if (!(e.altKey && (e.ctrlKey || e.metaKey)) || !['ArrowLeft', 'ArrowRight'].includes(e.key) || TABS.length < 2) return;
    const i = TABS.findIndex(x => x.id === me()), n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    if (n) { e.preventDefault(); go(n.id); }
  });
  window.addEventListener('focus', refresh); // cửa sổ khác vừa mở / đóng tab
  S.tabs = { refresh, paint, get list() { return TABS; } };
  refresh();
  const wait = setInterval(() => { if (S.META?.pid) { clearInterval(wait); refresh(); } }, 300);
  setTimeout(() => clearInterval(wait), 30000);
})();
