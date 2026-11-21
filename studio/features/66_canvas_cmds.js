// S20 M140: thanh nổi theo ngữ cảnh trên khung chọn của preview + menu chuột phải (preview và khối timeline), chung một bảng lệnh.
//   Chữ (chữ thêm, chữ graphic, node): font, cỡ − / +, màu, đậm, hoạt ảnh, lớp, ⋯ · Phụ đề: font, cỡ, màu, ⋯ · Cảnh / sticker / ảnh:
//   Thay (mở thư viện đúng loại), lớp ▲ ▼, nhân bản, xoá, ⋯. Nút ⋯ mở cùng menu với chuột phải.
// Thanh nổi chỉ là lối tắt (C20): inspector vẫn đủ mọi trường. Ẩn khi đang phát, đang kéo, đang gõ tại chỗ, đang chọn nhiều.
// Lõi thuần: 66_canvas_cmds.core.js (window.CanvasCmds). Vị trí đặt bằng JS (fixed), markup không có thuộc tính style (M85).
'use strict';
(() => {
  const S = window.Studio, C = window.CanvasCmds;
  if (!S || !C) return;
  const { $, esc } = S;
  const wrap = $('#stagewrap'), ov = $('#overlay'), tl = $('#tlinner');
  if (!wrap || !ov || !tl) return;

  const bar = document.createElement('div'); bar.className = 'cbar'; bar.hidden = true; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Thao tác nhanh');
  const menu = document.createElement('div'); menu.className = 'cmenu'; menu.hidden = true; menu.setAttribute('role', 'menu');
  document.body.append(bar, menu);
  let sig = '', pop = null;

  const sel = () => S.sel;
  const scenes = () => S.TL?.scenes || [];
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const btn = (cb, ic, title, extra = '') => `<button data-cb="${cb}" title="${esc(title)}" aria-label="${esc(title)}" ${extra}><i class="ti ${ic}"></i></button>`;
  const layerBtns = c => {
    const L = C.layerOf(c, scenes()); if (!L) return '';
    const off = how => (C.layerTarget(L.arr, L.item, how) < 0 ? 'disabled' : '');
    return `<span class="sep"></span>${btn('up', 'ti-arrow-bar-up', 'Đưa lên một lớp', off('up'))}${btn('down', 'ti-arrow-bar-down', 'Đưa xuống một lớp', off('down'))}`;
  };
  // S24 M172 (C36): thanh nổi chỉ chỉnh tay, bỏ ✦ Hỏi Claude (lối vào là nút đầu Thuộc tính, / và ✦ ở thanh nút phát)
  function barHtml(c) { return barCore(c); }
  function barCore(c) {
    const o = c.obj, k = C.barKind(c), size = Math.round(S.getPos(c)?.size || 0);
    const color = `<button data-cb="color" class="sw" title="Màu" aria-label="Màu"><b data-dfill="${esc(o.color || '#ffffff')}"></b></button>`; // design-token-ok: màu chữ của video
    const sizeCtl = size ? `${btn('sz-', 'ti-minus', 'Nhỏ hơn')}<span class="num" title="Cỡ chữ">${size}</span>${btn('sz+', 'ti-plus', 'To hơn')}` : '';
    const font = `<select data-cb="font" title="Font" aria-label="Font">${S.fontOpt ? S.fontOpt(o.font) : opt(S.FONTS, o.font)}</select>`; // S21 M148: font thương hiệu đứng đầu
    if (k === 'text') return font + sizeCtl + color +
      btn('bold', 'ti-bold', 'Đậm', `class="${(o.weight ?? 900) >= 700 ? 'on' : ''}" aria-pressed="${(o.weight ?? 900) >= 700}"`) +
      `<select data-cb="anim" title="Hoạt ảnh vào" aria-label="Hoạt ảnh vào">${opt(S.ANIM_LIST, o.anim || 'pop')}</select>` + animOutLoop(c) + layerBtns(c) + btn('more', 'ti-dots', 'Thêm');
    if (k === 'cap') return font + sizeCtl + color + btn('more', 'ti-dots', 'Thêm');
    return `<button data-cb="replace" class="txt" title="Thay bằng mục khác trong thư viện"><i class="ti ti-replace"></i> Thay</button>` + layerBtns(c) +
      `<span class="sep"></span>${btn('dup', 'ti-copy', 'Nhân bản (⌘D)')}${btn('del', 'ti-trash', 'Xoá (Delete)', 'class="danger"')}${btn('more', 'ti-dots', 'Thêm')}`;
  }
  // S28 M205: Ra / Lặp của dòng chữ (bộ anim chung, FX.ANIM_OUT / FX.ANIM_LOOP); '' = không có (Ra = mờ dần chung như cũ)
  const typeOf = v => (v && typeof v === 'object' ? v.type : v) || '';
  const animOutLoop = c => (c.kind !== 'line' || !window.FX ? '' :
    `<select data-cba="out" title="Hoạt ảnh ra" aria-label="Hoạt ảnh ra">${opt([['', 'Ra: mờ'], ...FX.animOutList()], typeOf(c.obj.anim_out))}</select>` +
    `<select data-cba="loop" title="Hoạt ảnh lặp" aria-label="Hoạt ảnh lặp">${opt([['', 'Lặp: không'], ...FX.animLoopList()], typeOf(c.obj.anim_loop))}</select>`);
  const keyOf = c => JSON.stringify([c.obj.cid, c.kind, c.obj.font, c.obj.weight, c.obj.color, c.obj.anim, typeOf(c.obj.anim_out), typeOf(c.obj.anim_loop), Math.round(S.getPos(c)?.size || 0), scenes().length,
    C.layerOf(c, scenes())?.arr?.indexOf(C.layerOf(c, scenes())?.item)]);

  // Đặt lại thanh nổi sau mỗi lần vẽ khung chọn (drawOverlay → Studio._ov).
  function place() {
    const c = sel(), k = C.barKind(c), box = ov.querySelector('.selbox:not(.multi):not(.crop)');
    if (!c || !k || !box || S.playing || S.dragging || S.editing || S.multi.length || c.obj.hidden || c.obj.locked) { hide(); return; } // S20 M141: element khoá không có thanh nổi
    const key = keyOf(c);
    if (key !== sig || bar.hidden) { sig = key; closePop(); bar.innerHTML = barHtml(c); }
    bar.hidden = false; bar.classList.remove('v');
    const r = box.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    const sr = { l: r.left, t: r.top - 30, r: r.right, b: r.bottom }, view = { l: w.left + 4, t: w.top + 4, r: w.right - 4, b: w.bottom - 4 }; // −30: tay nắm xoay
    let p = C.placeBar(sr, { w: bar.offsetWidth, h: bar.offsetHeight }, view);
    // S23 M160 (PR 177): thanh ngang không có chỗ ngoài element (element cao trong khung 9:16 hẹp) → thử thanh dọc cạnh khung chọn
    if (!p.side && p.y < sr.b && p.y + bar.offsetHeight > sr.t) {
      bar.classList.add('v');
      const q = C.placeBar(sr, { w: bar.offsetWidth, h: bar.offsetHeight }, view);
      if (q.side) p = q; else bar.classList.remove('v');
    }
    bar.style.left = p.x + 'px'; bar.style.top = p.y + 'px';
  }
  function hide() { if (!bar.hidden) { bar.hidden = true; closePop(); } sig = ''; }
  S._ov.push(place);
  window.addEventListener('resize', () => { closeMenu(); place(); });

  // ---- lệnh ----
  const setField = (f, v) => { const o = sel().obj; S.touch(o, f); if (v === '' || v == null) delete o[f]; else o[f] = v; S.changed(true); };
  function focusNote() {
    if (S.right?.tab && S.right.tab !== 'props') S.right.show('props');
    const n = $('#insp [data-f="note"]'); // S21 M146: Ghi chú cho Claude luôn ở cuối Thuộc tính
    if (n) { n.scrollIntoView({ block: 'center', behavior: 'smooth' }); n.focus({ preventScroll: true }); }
  }
  function run(id, el) {
    const c = sel(); if (!c) return;
    const o = c.obj;
    switch (id) {
      case 'sz-': case 'sz+': { const p = S.getPos(c); if (!p?.size) return; S.touch(o, 'pos'); p.size = C.stepSize(p.size, id === 'sz+' ? 1 : -1); S.setPos(c, p); return S.changed(true); }
      case 'bold': return setField('weight', (o.weight ?? 900) >= 700 ? 500 : 900);
      case 'color': return togglePop(el);
      case 'replace': return S.workflow?.focus(C.replacePanel(o.type));
      case 'up': case 'down': case 'top': case 'bottom': return S.layerSel(id); // S20 M141: chung với ⌘] ⌘[ (studio.js)
      case 'dup': return S.duplicateSel();
      case 'cut': case 'copy': return S.copySel(id === 'cut');
      case 'paste': return S.pasteClip();
      case 'pcopy': return copyProps();
      case 'ppaste': return pasteDlg();
      case 'lock': return S.toggleLock();
      case 'del': return S.removeSel();
      case 'split': return S.splitAtPlayhead();
      case 'edit': return S.startInlineEdit(c);
      case 'hide': S.touch(o); o.hidden = !o.hidden || undefined; return S.changed(true);
      case 'reset': { if (!o._orig) return; S.pushUndo(); const orig = o._orig; for (const k of Object.keys(o)) if (k !== 'cid' && k !== 'note' && k !== 'note_at' && k !== 'locked') delete o[k]; Object.assign(o, orig); return S.changed(true); }
      case 'note': return focusNote();
      case 'seek': return S.setTime(c.t0);
      case 'more': { const r = el.getBoundingClientRect(); return openMenu(r.left, r.bottom + 4); }
    }
  }
  bar.addEventListener('mousedown', e => { if (!e.target.closest('select')) e.preventDefault(); }); // không lấy focus khỏi preview
  bar.addEventListener('click', e => { const b = e.target.closest('button[data-cb]'); if (b && !b.disabled) run(b.dataset.cb, b); });
  bar.addEventListener('change', e => {
    const s = e.target.closest('select[data-cb]'); if (s) return setField(s.dataset.cb, s.value);
    const a = e.target.closest('select[data-cba]'); if (!a || !sel()) return;
    const o = sel().obj; S.touch(o, 'anim_' + a.dataset.cba); C.animSet(o, a.dataset.cba, a.value); S.changed(true);
  });

  // Bảng màu nhỏ dưới nút Màu
  function togglePop(anchor) {
    if (pop) return closePop();
    const cur = sel()?.obj.color || '';
    pop = document.createElement('div'); pop.className = 'cbar-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Chọn màu');
    const bc = window.KnobsCore?.brandColors(S.TL?.brand) || [], up = String(cur).toUpperCase(); // S21 M148: hàng Thương hiệu đứng đầu
    pop.innerHTML = (bc.length ? `<div class="cbar-brand" role="group" aria-label="Màu thương hiệu"><small>Thương hiệu</small>${bc.map(x => `<button data-col="${x.v}" data-dfill="${x.v}" class="${up === x.v ? 'on' : ''}" title="${esc(x.label)} ${x.v}" aria-label="${esc(x.label)} ${x.v}"></button>`).join('')}</div>` : '') +
      `<button data-col="" class="orig ${cur ? '' : 'on'}">Gốc</button>` +
      S.SWATCH.map(x => `<button data-col="${x}" data-dfill="${x}" class="${cur === x ? 'on' : ''}" title="${x}" aria-label="${x}"></button>`).join('') +
      `<input type="color" value="${esc(cur || '#ffffff')}" aria-label="Màu khác">`; // design-token-ok: màu chữ của video
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect(); pop.style.left = r.left + 'px'; pop.style.top = (r.bottom + 6) + 'px';
    pop.addEventListener('mousedown', e => { if (e.target.tagName !== 'INPUT') e.preventDefault(); });
    pop.addEventListener('click', e => { const b = e.target.closest('[data-col]'); if (b) { closePop(); setField('color', b.dataset.col); } });
    pop.addEventListener('change', e => { if (e.target.type === 'color') { closePop(); setField('color', e.target.value); } });
  }
  function closePop() { pop?.remove(); pop = null; }

  // ---- S29 M211: Chép / Dán thuộc tính (lõi KeysCore.propsCopy / propsApply của 67_keys.core.js, đọc lúc chạy) ----
  // Clipboard thuộc tính trong trang, riêng với clipboard element (⌘C / ⌘V). Dán: hộp tích chọn nhóm, lên mục đang chọn (cả nhóm
  // Shift) hoặc mọi mục cùng loại; một bước hoàn tác. Tốc độ đi qua clips.js (setClipSpeed / setClipCurve / setClipReverse: ripple).
  let PCLIP = null;
  const K = () => window.KeysCore;
  const kindOf = c => (c && K() ? K().propKind(c, c.kind === 'efx' && !!window.FX?.get('fx', c.obj?.type)?.color) : null);
  const KIND_VI = { clip: 'clip', media: 'b-roll / ảnh phủ', elem: 'hình khối / sticker / element', text: 'dòng chữ', efx: 'khối Điều chỉnh' };
  function copyProps() {
    const c = sel(), k = kindOf(c), clip = k && K().propsCopy(c.obj, k, c.t0);
    if (!clip) return S.toast('Mục này chưa đặt hoạt ảnh, màu, mặt nạ, chuyển cảnh, tốc độ hay keyframe để chép');
    PCLIP = clip;
    S.toast(`Đã chép: ${K().PROP_GROUPS.filter(g => clip.groups[g.id]).map(g => g.label).join(', ')} · chuột phải mục khác → Dán thuộc tính`);
  }
  function pasteDlg() {
    const c = sel(); if (!c || !PCLIP) return;
    const kinds = [...new Set([c, ...S.multi].map(kindOf).filter(Boolean))];
    const groups = K().PROP_GROUPS.filter(g => kinds.some(k => K().pasteGroups(PCLIP, k).includes(g.id)));
    if (!groups.length) return S.toast('Thuộc tính đã chép không hợp với mục này');
    const k0 = kindOf(c), many = S.multi.length ? ` (${S.multi.length + 1} mục đang chọn)` : '';
    modal(`<h3><i class="ti ti-clipboard-check"></i> Dán thuộc tính${esc(many)}</h3>
      <p>Chọn nhóm cần dán. Nhóm được dán thay hẳn thiết lập cũ của nhóm đó; ⌘Z hoàn tác cả lần dán.</p>
      <div class="pp-list">${groups.map(g => `<label class="check"><input type="checkbox" data-pp="${g.id}" checked> ${esc(g.label)}</label>`).join('')}</div>
      ${k0 ? `<label class="check pp-all"><input type="checkbox" data-ppall> Dán cho mọi ${esc(KIND_VI[k0])} trong dự án</label>` : ''}
      <div class="actions"><button data-ppgo class="primary"><i class="ti ti-clipboard-check"></i> Dán</button><button data-ppno>Huỷ</button></div>`);
  }
  function speedTo(i, v) {
    if (v.speedCurve != null) setClipCurve(i, v.speedCurve); else setClipSpeed(i, v.speed ?? 1);
    setClipReverse(i, !!v.reverse);
  }
  function pasteProps(ids, all) {
    const c = sel(); if (!c || !PCLIP || !ids.length) return;
    const k0 = kindOf(c), list = (all ? (S.comps || []).filter(x => kindOf(x) === k0) : [c, ...S.multi]).filter(x => kindOf(x) && !x.obj.locked);
    if (!list.length) return S.toast('Mục đang khoá · ⌥⇧L để mở khoá');
    S.pushUndo();
    let m = 0;
    for (const x of list) {
      const k = kindOf(x), use = k === 'clip' && !x.idx ? ids.filter(i => i !== 'trans') : ids; // clip đầu không có chuyển cảnh vào
      if (x.kind !== 'clip' && !x.obj._orig) x.obj._orig = JSON.parse(JSON.stringify(x.obj, (q, v) => (q === 'cid' || q === '_orig' ? undefined : v)));
      const r = K().propsApply(x.obj, k, PCLIP, use, x.t0);
      if (r.speed && x.kind === 'clip' && x.obj.hold == null) speedTo(x.idx, r.speed);
      if (r.n) m++;
    }
    S.changed(true);
    S.toast(m ? `Đã dán thuộc tính cho ${m} mục` : 'Không mục nào nhận được nhóm đã chọn');
  }
  document.addEventListener('click', e => {
    const box = e.target.closest?.('#modalbox'); if (!box?.querySelector('[data-ppgo]')) return;
    if (e.target.closest('[data-ppno]')) return closeModal();
    if (!e.target.closest('[data-ppgo]')) return;
    const ids = [...box.querySelectorAll('[data-pp]:checked')].map(i => i.dataset.pp), all = !!box.querySelector('[data-ppall]:checked');
    closeModal(); pasteProps(ids, all);
  });
  S.props = { copy: copyProps, paste: pasteProps, get clip() { return PCLIP; } };

  // ---- menu chuột phải ----
  function openMenu(x, y) {
    const c = sel(); if (!c) return;
    const items = C.menuItems(c, { scenes: scenes(), hasOrig: !!c.obj._orig, hidden: !!c.obj.hidden, canEditText: !!window.StageCore?.canEditText(c.kind, c.obj), canSplit: c.kind === 'clip', locked: !!c.obj.locked, canPaste: S.canPaste,
      props: !!kindOf(c), canPasteProps: [c, ...S.multi].some(x => window.KeysCore?.pasteGroups(PCLIP, kindOf(x)).length > 0) });
    if (!items.length) return;
    closePop();
    menu.innerHTML = items.map(it => (it === '-' ? '<hr>' : `<button role="menuitem" data-mi="${it.id}" class="${it.danger ? 'danger' : ''}" ${it.off ? 'disabled' : ''}>
      <i class="ti ${it.icon}"></i><span>${esc(it.label)}</span>${it.key ? `<kbd>${esc(it.key)}</kbd>` : ''}</button>`)).join('');
    menu.hidden = false;
    const p = C.placeMenu(x, y, { w: menu.offsetWidth, h: menu.offsetHeight }, { l: 4, t: 4, r: innerWidth - 4, b: innerHeight - 4 });
    menu.style.left = p.x + 'px'; menu.style.top = p.y + 'px';
    menu.querySelector('button:not([disabled])')?.focus();
  }
  S.cmdMenu = openMenu; // S21 M146: nút ⋯ ở đầu Thuộc tính mở đúng menu này (studio.js data-act="more")
  function closeMenu() { if (!menu.hidden) { menu.hidden = true; menu.innerHTML = ''; } }
  menu.addEventListener('click', e => { const b = e.target.closest('[data-mi]'); if (!b || b.disabled) return; closeMenu(); run(b.dataset.mi, b); });
  // Esc / mũi tên khi menu mở: bắt trước phím tắt của studio.js (Esc ở đó là bỏ chọn)
  window.addEventListener('keydown', e => {
    if (pop && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); return closePop(); }
    if (menu.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); return closeMenu(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopImmediatePropagation();
      const list = [...menu.querySelectorAll('button:not([disabled])')], i = list.indexOf(document.activeElement);
      list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
    }
  }, true);
  document.addEventListener('mousedown', e => {
    if (!menu.hidden && !menu.contains(e.target)) closeMenu();
    if (pop && !pop.contains(e.target) && !e.target.closest('[data-cb="color"]')) closePop();
  }, true);
  document.addEventListener('wheel', closeMenu, { capture: true, passive: true }); // không dùng scroll: chọn element làm timeline tự cuộn tới khối (M139)

  ov.addEventListener('contextmenu', e => {
    e.preventDefault();
    const box = $('#stagebox').getBoundingClientRect(), c = S.pick((e.clientX - box.left) / S.K, (e.clientY - box.top) / S.K);
    if (c && c !== sel()) S.select(c);
    if (sel()) openMenu(e.clientX, e.clientY);
  });
  tl.addEventListener('contextmenu', e => {
    const b = e.target.closest('.blk[data-cid], .clip[data-ci]'); if (!b) return;
    e.preventDefault();
    const c = b.dataset.ci != null ? S.compOf(S.TL.clips[+b.dataset.ci]) : S.compByCid(b.dataset.cid);
    if (!c) return;
    if (c !== sel()) S.select(c, true);
    openMenu(e.clientX, e.clientY);
  });
})();
