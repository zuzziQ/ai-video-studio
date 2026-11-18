// S23 M161: nền bố cục Studio (docs/plans/S23-bo-cuc-theo-kho-video.md mục 2, 4; C29, C31). Lõi thuần 76_layout.core.js.
//   Studio.layout.get()            → { askPos, tl, lib, right, controls, mode, narrow, pin, focus, tlH, ratio, width,
//                                      aspect, source, legacy } (M167: khổ soạn 9:16 | 16:9, khổ thật, dự án khổ cũ → dải báo #lay-band)
//   Studio.layout.set(k, v)        k: 'tl' (strip|compact|full, nhớ avs.tl.<chế độ> / avs.tl.narrow), 'pin' (auto|side|bottom,
//                                  nhớ avs.layout.pin), 'focus' (nút ⤢: ẩn hai cột, không nhớ), 'fullH' (px của mức đầy đủ, avs.tl.h)
//                                  'foldLib' / 'foldRight' (M165: Chuyên nghiệp gấp thư viện / cột phải, nhớ avs.col.lib / avs.col.right;
//                                  M168: cửa sổ < 1280 px thư viện tự gấp, mở tay nhớ avs.col.libNarrow tới khi bề rộng qua ngưỡng)
//   Studio.layout.on(fn)           fn(state, prev) sau mỗi lần đổi; trả hàm gỡ. M162 (dải tua), M163 (Claude cạnh khung),
//                                  M165 (hai cột) đăng ký ở đây thay vì tự đo cửa sổ.
//   Studio.layout.cycleTl(back) / dragStart() / drag(h) / dragEnd(h): phím ` và kéo mép trên timeline (studio.js).
// Gắn lên body: data-ask, data-tl, data-lib, data-right, data-controls, data-narrow, data-focus; đặt --tlh rồi gọi Studio.fit().
// CSS bố cục ở studio.css (khối "S23 M161"). Thông báo Studio.notice là nút chuông trên thanh đầu (01_setup.js), không ở khung xem.
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
  // M167 (C33): tỉ lệ = khổ soạn (LayoutCore.frameOf), không phải tỉ lệ thật của dự án: dự án 1:1 cũ soạn và xếp theo 9:16
  // (Studio chỉ có hai khổ soạn), kèm dải báo trên khung. Chưa tải dự án thì theo body.landscape.
  const frame = () => (S.TL ? LC.frameOf(S.TL.width, S.TL.height) : LC.frameOf(...(body.classList.contains('landscape') ? [1920, 1080] : [1080, 1920])));
  const ratio = () => frame().ratio;
  function compute() {
    const width = innerWidth, m = mode(), narrow = LC.isNarrow(width);
    const r = LC.compute({ ratio: ratio(), mode: m, width, pin: store.get('layout.pin', 'auto'), tl: store.get(LC.tlKey(m, narrow), ''), focus,
      foldLib: store.get('col.lib', '') === 'off', foldRight: store.get('col.right', '') === 'off', narrowLib: store.get('col.libNarrow', '') || null });
    const f = frame();
    return { ...r, ratio: f.ratio, aspect: f.aspect, source: f.source, legacy: f.legacy, width, tlH: LC.tlHeight(r.tl, +store.get('tl.h', LC.FULL.def), innerHeight) };
  }

  const ATTR = { askPos: 'data-ask', tl: 'data-tl', lib: 'data-lib', right: 'data-right', controls: 'data-controls' };
  function apply() {
    if (!LC.isNarrow(innerWidth)) store.set('col.libNarrow', null); // M168: qua ngưỡng 1280 px → lần sau hẹp lại thì tự gấp lại
    const prev = cur, st = compute(); cur = st;
    for (const [k, a] of Object.entries(ATTR)) if (!(dragging && k === 'tl')) body.setAttribute(a, st[k]);
    body.toggleAttribute('data-narrow', st.narrow);
    body.toggleAttribute('data-focus', st.focus);
    if (!dragging) document.documentElement.style.setProperty('--tlh', st.tlH + 'px');
    paintExpand(); paintMenu(); paintBand();
    const same = prev && Object.keys(st).every(k => k === 'width' || st[k] === prev[k]);
    if (same) return;
    if (S.TL) { S.fit?.(); if (prev && prev.tl !== st.tl) { S.renderTimeline?.(); if (st.tl !== 'strip' && S.zoomPending) S.zoomFit?.(); } } // fit đọc cỡ #stagewrap mới; timeline vừa hiện lại thì vừa khung
    for (const fn of subs) { try { fn({ ...st }, prev && { ...prev }); } catch (e) { console.error(e); } }
    if (prev && st.autoFold && !prev.autoFold && st.foldLib && !prev.foldLib) S.toast?.('Cửa sổ hẹp: đã gấp thư viện (phím [ để mở)'); // M168
  }

  function set(k, v) {
    if (k === 'tl') { const t = LC.normTl(v); if (!t) return; const c = cur || compute(); store.set(LC.tlKey(c.mode, c.narrow), t); }
    else if (k === 'pin') store.set('layout.pin', LC.normPin(v) === 'auto' ? null : LC.normPin(v));
    else if (k === 'focus') focus = !!v;
    else if (k === 'foldLib') { const f = LC.foldStore(LC.autoFoldLib(mode(), innerWidth), !!v); store.set(f.key, f.val); } // M165 / M168 (cửa sổ hẹp nhớ riêng)
    else if (k === 'foldRight') store.set('col.right', v ? 'off' : null); // M165, nhớ theo máy
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
  #wf-more .lay-note { padding: 0 var(--space-2) var(--space-1); font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); }`;
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

  // ---------- M167: dải báo trên khung (dự án khổ cũ, vd 1:1) ----------
  // Một dòng đầu #center (trên #stagewrap, M161: vùng riêng, không che khung). "Đổi sang …" ghi timeline.width / height theo khổ soạn
  // rồi tải lại, để bản dựng khớp khung xem (engine coi vuông là ngang, Studio coi là dọc). "Để sau" ẩn tới khi mở lại tab.
  const bandCss = document.createElement('style');
  bandCss.textContent = `
  #lay-band { flex: none; display: flex; align-items: center; gap: var(--space-2); min-width: 0; height: 34px; padding: 0 var(--space-2) 0 var(--space-3);
    border-bottom: 1px solid rgb(var(--color-line)); background: rgb(var(--color-warning) / .10); font-size: var(--text-xs); color: rgb(var(--color-fg)); }
  #lay-band[hidden] { display: none; }
  #lay-band > .ti { color: rgb(var(--color-warning-text)); flex: none; }
  #lay-band > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #lay-band > button { flex: none; height: 26px; padding: 0 var(--space-2); font-size: var(--text-2xs); white-space: nowrap; }`;
  document.head.appendChild(bandCss);
  let band = null;
  const bandKey = () => 'avs.band.' + (S.TL ? `${S.TL.width}x${S.TL.height}` : '');
  function paintBand() {
    const c = $('#center'), st = cur; if (!c || !st) return;
    let off = false; try { off = sessionStorage.getItem(bandKey()) === 'off'; } catch {}
    const show = !!(S.TL && st.legacy && !off);
    if (!show) { if (band) band.hidden = true; return; }
    if (!band) {
      band = document.createElement('div'); band.id = 'lay-band'; band.setAttribute('role', 'status');
      c.prepend(band);
      band.addEventListener('click', e => { const b = e.target.closest('[data-band]'); if (b) bandAct(b.dataset.band); });
    }
    const sig = `${st.source}|${st.aspect}`;
    if (band.dataset.sig !== sig) {
      band.dataset.sig = sig;
      const why = `Dự án khổ ${st.source} (bản cũ). Studio chỉ soạn 9:16 / 16:9 nên khung xem theo ${st.aspect}. Đổi dự án sang ${st.aspect} để bản dựng khớp khung; bản vuông lấy ở Xuất → Xuất thêm khổ.`;
      band.title = why;
      band.innerHTML = `<i class="ti ti-aspect-ratio" aria-hidden="true"></i><span>Dự án khổ <b>${esc(st.source)}</b> cũ · khung xem theo <b>${esc(st.aspect)}</b>, bản vuông lấy ở Xuất thêm khổ</span>
        <button data-band="fix" class="primary" title="${esc(why)}"><i class="ti ti-arrows-exchange"></i>Đổi sang ${esc(st.aspect)}</button><button data-band="later" class="icon" title="Để sau (ẩn tới khi mở lại tab)" aria-label="Để sau"><i class="ti ti-x"></i></button>`;
    }
    band.hidden = false;
  }
  async function bandAct(k) {
    if (k === 'later') { try { sessionStorage.setItem(bandKey(), 'off'); } catch {} paintBand(); S.fit?.(); return; }
    const to = S.TL && LC.frameOf(S.TL.width, S.TL.height).to; if (!to) return;
    const was = { width: S.TL.width, height: S.TL.height };
    S.TL.width = to.width; S.TL.height = to.height;
    if (await S.saveNow?.()) { location.reload(); return; } // engine + Studio đọc lại khổ từ đầu
    Object.assign(S.TL, was); S.toast?.('Chưa lưu được, khổ chưa đổi');
  }

  // dải tua (mức strip) là features/77_scrub.js (S23 M162): đăng ký qua Studio.layout.on

  // thanh trong #center hiện / ẩn (Hỏi Claude, xem lại thay đổi) → khung xem co giãn lại
  if (window.ResizeObserver && $('#stagewrap')) new ResizeObserver(() => S.fit?.()).observe($('#stagewrap'));

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
