// S23 M161: nền bố cục Studio (docs/plans/S23-bo-cuc-theo-kho-video.md mục 2, 4; C29, C31). Lõi thuần 76_layout.core.js.
//   Studio.layout.get()            → { askPos, tl, lib, right, controls, mode, narrow, pin, focus, tlH, ratio, width }
//   Studio.layout.set(k, v)        k: 'tl' (strip|compact|full, nhớ avs.tl.<chế độ> / avs.tl.narrow), 'pin' (auto|side|bottom,
//                                  nhớ avs.layout.pin), 'focus' (nút ⤢: ẩn hai cột, không nhớ), 'fullH' (px của mức đầy đủ, avs.tl.h)
//   Studio.layout.on(fn)           fn(state, prev) sau mỗi lần đổi; trả hàm gỡ. M162 (dải tua), M163 (Claude cạnh khung),
//                                  M165 (hai cột) đăng ký ở đây thay vì tự đo cửa sổ.
//   Studio.layout.cycleTl(back) / dragStart() / drag(h) / dragEnd(h): phím ` và kéo mép trên timeline (studio.js).
// Gắn lên body: data-ask, data-tl, data-lib, data-right, data-controls, data-narrow, data-focus; đặt --tlh rồi gọi Studio.fit().
// CSS bố cục ở studio.css (khối "S23 M161"). Dải báo Studio.notice có vùng riêng đầu #center (không đè đỉnh khung, PR 190).
'use strict';
(() => {
  const S = window.Studio, LC = window.LayoutCore;
  if (!S || !LC) return;
  const { $, esc } = S;
  const store = {
    get(k, d) { try { return localStorage.getItem('avs.' + k) || d; } catch { return d; } },
    set(k, v) { try { if (v == null) localStorage.removeItem('avs.' + k); else localStorage.setItem('avs.' + k, String(v)); } catch {} },
  };
  const body = document.body;
  let focus = false, dragging = false, cur = null;
  const subs = new Set();

  const mode = () => (body.classList.contains('wf-basic') ? 'basic' : 'pro');
  const ratio = () => (S.DW && S.DH ? S.DW / S.DH : body.classList.contains('landscape') ? 16 / 9 : 9 / 16);
  function compute() {
    const width = innerWidth, m = mode(), narrow = LC.isNarrow(width);
    const r = LC.compute({ ratio: ratio(), mode: m, width, pin: store.get('layout.pin', 'auto'), tl: store.get(LC.tlKey(m, narrow), ''), focus });
    return { ...r, ratio: ratio(), width, tlH: LC.tlHeight(r.tl, +store.get('tl.h', LC.FULL.def), innerHeight) };
  }

  const ATTR = { askPos: 'data-ask', tl: 'data-tl', lib: 'data-lib', right: 'data-right', controls: 'data-controls' };
  function apply() {
    const prev = cur, st = compute(); cur = st;
    for (const [k, a] of Object.entries(ATTR)) if (!(dragging && k === 'tl')) body.setAttribute(a, st[k]);
    body.toggleAttribute('data-narrow', st.narrow);
    body.toggleAttribute('data-focus', st.focus);
    if (!dragging) document.documentElement.style.setProperty('--tlh', st.tlH + 'px');
    paintExpand(); paintMenu(); paintStrip();
    const same = prev && Object.keys(st).every(k => k === 'width' || st[k] === prev[k]);
    if (same) return;
    if (S.TL) { S.fit?.(); if (prev && prev.tl !== st.tl) S.renderTimeline?.(); } // fit đọc cỡ #stagewrap mới (bố cục tính lại ngay)
    for (const fn of subs) { try { fn({ ...st }, prev && { ...prev }); } catch (e) { console.error(e); } }
  }

  function set(k, v) {
    if (k === 'tl') { const t = LC.normTl(v); if (!t) return; const c = cur || compute(); store.set(LC.tlKey(c.mode, c.narrow), t); }
    else if (k === 'pin') store.set('layout.pin', LC.normPin(v) === 'auto' ? null : LC.normPin(v));
    else if (k === 'focus') focus = !!v;
    else if (k === 'fullH') store.set('tl.h', LC.clampFull(v, innerHeight));
    else return;
    apply();
  }

  // ---------- kéo mép trên timeline (studio.js gọi) ----------
  function dragStart() { dragging = true; body.setAttribute('data-tl', 'full'); }
  function drag(h) {
    const v = Math.round(Math.min(LC.maxFull(innerHeight), Math.max(LC.TL_H.strip, h)));
    document.documentElement.style.setProperty('--tlh', v + 'px');
    return v;
  }
  function dragEnd(h) {
    dragging = false;
    const s = LC.snap(h, innerHeight);
    if (s.tl === 'full') store.set('tl.h', s.h);
    set('tl', s.tl); // apply() đặt lại data-tl và --tlh theo mức đã bắt
    requestAnimationFrame(() => S.fit?.());
  }
  const cycleTl = back => set('tl', LC.cycle((cur || compute()).tl, back));

  // ---------- nút ⤢ ----------
  function paintExpand() {
    const b = $('#expand'); if (!b) return;
    const on = !!cur?.focus;
    b.innerHTML = `<i class="ti ${on ? 'ti-arrows-minimize' : 'ti-arrows-maximize'}"></i>`;
    b.title = on ? 'Thu nhỏ preview (Esc)' : 'Phóng to preview: ẩn thư viện và cột phải';
    b.setAttribute('aria-pressed', String(on));
  }

  // ---------- ⋯ → Bố cục ----------
  const css = document.createElement('style');
  css.textContent = `
  #wf-more .lay-row { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-2); font-size: var(--text-xs); color: rgb(var(--color-fg-muted)); }
  #wf-more .lay-row > .ti { color: rgb(var(--color-fg-subtle)); }
  #wf-more .lay-row > span { flex: 1; min-width: 0; }
  #wf-more .lay-seg { display: flex; flex-wrap: wrap; gap: var(--space-050); padding: 0 var(--space-2) var(--space-1); }
  #wf-more .lay-seg button { flex: 1 1 auto; height: 28px; padding: 0 var(--space-2); font-size: var(--text-2xs); justify-content: center; background: transparent; border-color: rgb(var(--color-line)); color: rgb(var(--color-fg-muted)); gap: var(--space-1); }
  #wf-more .lay-seg button:hover { background: rgb(var(--color-surface-muted)); color: rgb(var(--color-fg)); }
  #wf-more .lay-seg button.on { background: rgb(var(--color-accent) / .18); border-color: rgb(var(--color-accent-text) / .6); color: rgb(var(--color-fg)); }
  #wf-more .lay-note { padding: 0 var(--space-2) var(--space-1); font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); }
  #tlstrip { display: none; position: relative; flex: 1; margin: var(--space-2) var(--space-3); border-radius: var(--radius-xs); background: rgb(var(--color-surface-muted)); cursor: pointer; }
  body[data-tl="strip"] #tlstrip { display: block; }
  #tlstrip .tls-done { position: absolute; left: 0; top: 0; bottom: 0; border-radius: var(--radius-xs); background: rgb(var(--color-accent) / .35); pointer-events: none; }
  #tlstrip .tls-head { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: rgb(var(--color-playhead)); pointer-events: none; }`;
  document.head.appendChild(css);

  const PIN_IC = { auto: 'ti-wand', side: 'ti-layout-sidebar-right', bottom: 'ti-layout-bottombar' };
  const TL_IC = { strip: 'ti-minus', compact: 'ti-layout-rows', full: 'ti-layout-board' };
  let menu = null;
  function mountMenu() {
    const more = $('#wf-more'), tail = more?.querySelector('[data-wf="tail"]');
    if (!more || !tail || menu) return;
    menu = document.createElement('div'); menu.dataset.wf = 'layout';
    tail.before(menu);
    menu.addEventListener('click', e => {
      const b = e.target.closest('[data-lay-pin],[data-lay-tl]'); if (!b) return;
      if (b.dataset.layPin) set('pin', b.dataset.layPin); else set('tl', b.dataset.layTl);
    });
  }
  function paintMenu() {
    if (!menu || !cur) return;
    const pin = cur.pin, tl = cur.tl;
    menu.innerHTML = `<hr><div class="lay-row"><i class="ti ti-layout"></i><span>Bố cục</span></div>
      <div class="lay-seg" role="group" aria-label="Hỏi Claude">${LC.PINS.map(k => `<button data-lay-pin="${k}" class="${pin === k ? 'on' : ''}" aria-pressed="${pin === k}"><i class="ti ${PIN_IC[k]}"></i>${esc(LC.PIN_LABEL[k])}</button>`).join('')}</div>
      ${cur.narrow ? '<div class="lay-note">Cửa sổ hẹp: Claude luôn dưới khung</div>' : ''}
      <div class="lay-seg" role="group" aria-label="Timeline (phím \`)">${LC.TLS.map(k => `<button data-lay-tl="${k}" class="${tl === k ? 'on' : ''}" aria-pressed="${tl === k}" title="Timeline ${esc(LC.TL_LABEL[k].toLowerCase())} (phím \`)"><i class="ti ${TL_IC[k]}"></i>${esc(LC.TL_LABEL[k])}</button>`).join('')}</div>`;
  }

  // ---------- dải tua tạm (mức strip; ảnh nhỏ + vạch cắt là M162, features/77_scrub.js) ----------
  const strip = document.createElement('div'); strip.id = 'tlstrip'; strip.setAttribute('role', 'slider');
  strip.setAttribute('aria-label', 'Tua video (kéo hoặc bấm; phím ` mở timeline)'); strip.tabIndex = -1;
  strip.innerHTML = '<div class="tls-done"></div><div class="tls-head"></div>';
  $('#tlwrap')?.append(strip);
  const doneEl = strip.querySelector('.tls-done'), headEl = strip.querySelector('.tls-head');
  let raf = 0;
  function paintStrip() {
    if (cur?.tl !== 'strip') { cancelAnimationFrame(raf); raf = 0; return; }
    if (raf) return;
    const tick = () => {
      const d = S.TL?.duration || 0, p = d ? Math.min(1, Math.max(0, S.T / d)) : 0;
      doneEl.style.width = headEl.style.left = p * 100 + '%';
      strip.setAttribute('aria-valuenow', String(Math.round(p * 100)));
      raf = cur?.tl === 'strip' ? requestAnimationFrame(tick) : 0;
    };
    raf = requestAnimationFrame(tick);
  }
  let seeking = false;
  const seekAt = x => { const r = strip.getBoundingClientRect(), d = S.TL?.duration || 0; if (d && r.width) S.setTime(Math.min(1, Math.max(0, (x - r.left) / r.width)) * d); };
  strip.addEventListener('pointerdown', e => { if (e.button) return; seeking = true; strip.setPointerCapture(e.pointerId); seekAt(e.clientX); });
  strip.addEventListener('pointermove', e => { if (seeking) seekAt(e.clientX); });
  strip.addEventListener('pointerup', () => (seeking = false));
  strip.addEventListener('dblclick', () => set('tl', 'compact'));

  // ---------- vùng dải báo: đầu #center, chiếm chỗ thay vì đè đỉnh khung ----------
  {
    const center = $('#center');
    let box = document.getElementById('avs-notices');
    if (!box) { box = document.createElement('div'); box.id = 'avs-notices'; }
    if (center && box.parentElement !== center) center.prepend(box);
    // dải báo hiện / ẩn → khung xem co giãn lại
    if (window.ResizeObserver && $('#stagewrap')) new ResizeObserver(() => S.fit?.()).observe($('#stagewrap'));
  }

  // ---------- phím ` ----------
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code !== 'Backquote' && e.key !== '`' && e.key !== '~') return;
    const a = document.activeElement;
    if (/INPUT|TEXTAREA|SELECT/.test(a?.tagName) && a.type !== 'checkbox' && a.type !== 'range') return;
    if (a?.isContentEditable) return;
    e.preventDefault(); cycleTl(e.shiftKey);
    S.toast?.(`Timeline: ${LC.TL_LABEL[cur.tl].toLowerCase()} (phím \` để đổi)`);
  });

  // chế độ (01_workflow đặt body.wf-basic), khổ (studio.js đặt body.landscape), cửa sổ
  new MutationObserver(apply).observe(body, { attributes: true, attributeFilter: ['class'] });
  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(apply); });

  S.layout = {
    core: LC,
    get() { return { ...(cur || compute()) }; },
    set,
    on(fn) { if (typeof fn !== 'function') return () => {}; subs.add(fn); return () => subs.delete(fn); },
    cycleTl, dragStart, drag, dragEnd, refresh: apply,
  };
  mountMenu();
  apply();
  S.onReady(apply); // DW / DH thật của dự án có sau khi tải
})();
