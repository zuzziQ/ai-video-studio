// S21 M150: ghi chú ghim trên khung (học bình luận trên canvas của Claude Design).
// S24 M173 (C37): chế độ chú thích thay chế độ ghim (học "select element / annotate" của Claude).
//   Bật: nút chú thích ở thanh dưới khung (#pinbtn) hoặc phím C (không khi đang gõ); C / Esc để thoát.
//   Bấm lên khung: có element dưới điểm bấm (Studio.pick) thì chọn element đó + ô hỏi nổi tại điểm bấm (chú thích gắn element:
//   obj.note + obj.note_at), không thì chú thích điểm của cả video (TL.pins). Kéo một hình chữ nhật: chú thích vùng (x, y, w, h px
//   thiết kế, t = playhead; TL.pins có w, h). Shift + kéo trên thước vẫn là khoảng thời gian (75_ask.js).
//   Ô hỏi nổi: Hỏi ngay = Studio.ask.askNow (gửi vào tab Claude với phạm vi element / vùng rồi chạy; điểm không có element thành
//   vùng 160 px quanh điểm); Để sau = lưu như ghim cũ (C23: chỉ gọi mô hình khi bấm Hỏi ngay). Server ghi chú thích Để sau vào
//   <dự án>/.studio/notes.md khi lưu (writeNotes của server.mjs, định dạng không đổi). Ghim cũ đọc như chú thích Để sau kiểu điểm.
//   Lớp #stagebox > .pinlayer nằm trên #overlay, không nhận chuột trừ các chấm số khi không ở chế độ chú thích (kéo / chọn element
//   như cũ); khung vùng không nhận chuột. Mỗi lần tạo / sửa / xoá / đánh dấu là một bước hoàn tác (Studio.pushUndo trước khi đổi).
//   Danh sách chú thích nằm trong tab Claude (Studio.ask.notes của 75_ask.js), thay khối "Ghi chú cho Claude" của tab Dự án cũ;
//   bấm chấm trên khung → mở tab Claude và cuộn tới mục đó. "Giao Claude sửa hết" = lưu rồi chép câu "xem ghi chú trong editor".
//   Lõi thuần: 73_pins.core.js (window.PinsCore).
'use strict';
(() => {
  const S = window.Studio, P = window.PinsCore;
  if (!S || !P) return console.error('73_pins: thiếu Studio / 73_pins.core.js');
  const { $, esc } = S;
  const box = $('#stagebox'), btn = $('#pinbtn');
  if (!box) return;
  const PHRASE = 'xem ghi chú trong editor';
  const POINT_REGION = 160; // điểm không có element: Hỏi ngay về vùng vuông quanh điểm (px thiết kế)

  const css = document.createElement('style');
  css.textContent = `
  #stagebox .pinlayer { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
  #stagebox .pinlayer.on { pointer-events: auto; cursor: crosshair; }
  .pinlayer .pin { position: absolute; transform: translateY(-100%); pointer-events: auto; display: inline-flex; align-items: center; justify-content: center;
    min-width: 24px; height: 24px; padding: 0 var(--space-1); border: 2px solid rgb(var(--color-white)); border-radius: 12px 12px 12px 2px;
    background: rgb(var(--color-accent)); color: rgb(var(--color-accent-fg)); font-size: var(--text-2xs); font-weight: 700; line-height: 1; box-shadow: var(--shadow-raised); cursor: pointer; }
  .pinlayer .pin:hover, .pinlayer .pin.open { outline: 2px solid rgb(var(--color-focus)); outline-offset: 1px; }
  .pinlayer .pin.done { background: rgb(var(--color-surface-muted)); color: rgb(var(--color-fg-muted)); }
  .pinlayer .pin.draft { background: rgb(var(--color-warning)); color: rgb(var(--color-canvas)); }
  .pinlayer.drag .pin { pointer-events: none; }
  .pinlayer .pinrect { position: absolute; pointer-events: none; border: 2px solid rgb(var(--color-accent)); border-radius: var(--radius-xs); background: rgb(var(--color-accent) / .08); box-shadow: 0 0 0 1px rgb(var(--color-black) / .35); }
  .pinlayer .pinrect.done { border-color: rgb(var(--color-fg-muted)); background: none; }
  .pinlayer .pinrect.draft { border-color: rgb(var(--color-warning)); border-style: dashed; background: rgb(var(--color-warning) / .08); }
  .pinlayer .pinrect.ask { border-style: dashed; border-color: rgb(var(--color-accent-text)); background: none; }
  .pinpop { position: fixed; z-index: 45; width: 268px; display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-2);
    background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-control); box-shadow: var(--shadow-raised); }
  .pinpop[hidden] { display: none; }
  .pinpop-h { display: flex; align-items: center; gap: var(--space-2); min-width: 0; font-size: var(--text-xs); color: rgb(var(--color-fg-muted)); }
  .pinpop-h b { min-width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px 10px 10px 2px;
    background: rgb(var(--color-accent)); color: rgb(var(--color-accent-fg)); font-size: var(--text-2xs); }
  .pinpop-h span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pinpop-h button { width: 24px; height: 24px; }
  .pinpop textarea { width: 100%; min-height: 64px; resize: vertical; box-sizing: border-box; }
  .pinpop-a { display: flex; gap: var(--space-1); justify-content: flex-end; flex-wrap: wrap; }
  .pinpop-a button { display: inline-flex; align-items: center; gap: var(--space-1); }
  .pinpop-a .danger { margin-right: auto; }
  .pinpop-a .danger:hover { color: rgb(var(--color-danger)); }
  .pnotes { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; padding-bottom: var(--space-2); border-bottom: 1px solid rgb(var(--color-line)); }
  .pnotes-h { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
  .pnotes-h b { flex: 1; display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--text-xs); }
  .pnotes-h small { color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); }
  .pnotes .help { margin: 0; font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); }
  .pnotes-l { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); max-height: 220px; overflow-y: auto; }
  .pnotes-l button { width: 100%; height: auto; display: flex; align-items: flex-start; gap: var(--space-2); padding: var(--space-1) var(--space-2); text-align: left; justify-content: flex-start; white-space: normal; }
  .pnotes-l button.flash { outline: 2px solid rgb(var(--color-focus)); outline-offset: -2px; }
  .pnotes-l .n { flex: none; min-width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px 10px 10px 2px;
    background: rgb(var(--color-accent)); color: rgb(var(--color-accent-fg)); font-size: var(--text-2xs); font-weight: 700; }
  .pnotes-l .pnotes-tx { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; font-size: var(--text-xs); overflow-wrap: anywhere; }
  .pnotes-l small { color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); }
  .pnotes-l .done .n { background: rgb(var(--color-surface-muted)); color: rgb(var(--color-fg-muted)); }
  .pnotes-l .done .pnotes-tx { color: rgb(var(--color-fg-muted)); text-decoration: line-through; }
  .pnotes-go { justify-content: center; }`;
  document.head.appendChild(css);

  const layer = document.createElement('div'); layer.className = 'pinlayer';
  box.appendChild(layer);
  const pop = document.createElement('div'); pop.className = 'pinpop'; pop.hidden = true;
  pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Chú thích cho Claude');
  document.body.appendChild(pop);
  if (btn) { btn.title = 'Chú thích cho Claude (C): bấm lên element hoặc kéo khung một vùng'; btn.setAttribute('aria-label', 'Chú thích cho Claude'); }

  // cur: {item} (chú thích có sẵn) | {draft: {x, y, w?, h?, t, cid, label, text}}; band: vùng đang kéo (px thiết kế)
  let mode = false, cur = null, band = null, sigVis = '', sigAll = '';

  const items = () => (S.TL ? P.collect(S.comps, S.TL.pins) : []);
  const typing = () => { const a = document.activeElement; return !!a && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'range' || a.isContentEditable); };

  function setMode(on) {
    mode = !!on && !!S.TL;
    layer.classList.toggle('on', mode);
    if (btn) { btn.classList.toggle('on', mode); btn.setAttribute('aria-pressed', String(mode)); }
    if (!mode && cur?.draft) close();
    paintList();
    if (mode) S.toast('Chú thích: bấm lên element, hoặc kéo khung quanh một vùng · C hoặc Esc để thoát');
  }
  btn?.addEventListener('click', () => setMode(!mode));
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing() || !S.TL) return;
    if (e.code === 'KeyC' || e.key === 'c' || e.key === 'C') { e.preventDefault(); return setMode(!mode); }
    if (e.key === 'Escape' && mode) setMode(false);
  });

  // ---------- lớp chú thích trên khung ----------
  const findItem = key => items().find(i => i.key === key) || null;
  const rectHtml = (r, cls) => `<div class="pinrect ${cls}" data-r="${[r.x, r.y, r.w, r.h].join(',')}"></div>`;
  function render() {
    if (!S.TL) return;
    const all = items(), K = S.K, sa = P.sig(all);
    const shown = P.visibleAt(all, S.T);
    const d = cur?.draft, ar = S.ask?.region;
    // chú thích element bám theo element: element đã dời khỏi điểm ghim thì chấm hiện ở góc trên-phải của element
    const at = it => (it.kind === 'el' ? P.anchor(it, (() => { const o = S.compByCid(it.cid)?.obj; return o ? S.rectOf(o) : null; })()) : it);
    const list = (d ? [...shown, { key: 'draft', n: all.length + 1, x: d.x, y: d.y, w: d.w, h: d.h, done: false, text: '', draft: true }] : shown).map(it => ({ ...it, ...at(it) }));
    layer.classList.toggle('drag', S.dragging);
    const sv = P.sig(list) + '|' + K + '|' + (cur ? cur.item?.key || 'draft' : '') + '|' + (band ? [band.x, band.y, band.w, band.h].join(',') : '') + '|' + (ar ? [ar.x, ar.y, ar.w, ar.h].join(',') : '');
    if (sv !== sigVis) {
      sigVis = sv;
      const rects = list.filter(it => it.w > 0 && it.h > 0).map(it => rectHtml(it, it.draft ? 'draft' : it.done ? 'done' : '')).join('');
      layer.innerHTML = rects + (band ? rectHtml(band, 'draft') : '') + (ar ? rectHtml(ar, 'ask') : '') +
        list.map(it => `<button class="pin${it.done ? ' done' : ''}${it.draft ? ' draft' : ''}${cur && (cur.item?.key === it.key || (it.draft && cur.draft)) ? ' open' : ''}" data-pin="${esc(it.key)}"
        title="${esc(it.text || 'Chú thích mới')}" aria-label="Chú thích ${it.n}${it.done ? ' (đã làm)' : ''}: ${esc(it.text)}"><span>${it.n}</span></button>`).join('');
      layer.querySelectorAll('.pin').forEach((b, i) => { b.style.left = list[i].x * K + 'px'; b.style.top = list[i].y * K + 'px'; });
      layer.querySelectorAll('.pinrect').forEach(el => {
        const [x, y, w, h] = el.dataset.r.split(',').map(Number);
        Object.assign(el.style, { left: x * K + 'px', top: y * K + 'px', width: w * K + 'px', height: h * K + 'px' });
      });
    }
    if (cur?.item && !all.some(i => i.key === cur.item.key)) close();
    else if (cur) place();
    if (sa !== sigAll) { sigAll = sa; paintList(); }
  }
  S._ov.push(render);
  window.addEventListener('resize', () => { if (cur) place(); });

  const ptOf = e => { const r = box.getBoundingClientRect(); return { x: (e.clientX - r.left) / S.K, y: (e.clientY - r.top) / S.K }; };
  layer.addEventListener('mousedown', e => {
    const b = e.target.closest('.pin');
    e.preventDefault(); e.stopPropagation();
    if (b) { if (b.dataset.pin === 'draft') return; const it = findItem(b.dataset.pin); if (it) { open({ item: it }); showInList(it.key); } return; }
    if (!mode || !S.TL || e.button !== 0) return;
    if (cur) commit(); // đang mở ô khác: giữ chữ đã gõ
    const a = ptOf(e), t = Math.round(S.T * 100) / 100;
    const mv = ev => { band = P.dragRect(a, ptOf(ev), S.DW, S.DH); sigVis = ''; render(); };
    const up = ev => {
      window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
      const r = P.dragRect(a, ptOf(ev), S.DW, S.DH); band = null;
      if (r) return open({ draft: { ...r, t, cid: null, label: `Vùng ${r.w}×${r.h}`, text: '' } });
      // bấm: chọn element dưới điểm bấm (nếu có) + ô hỏi tại điểm bấm
      const c = P.attachTo(S.pick(a.x, a.y)), pt = P.clampPt(a.x, a.y, S.DW, S.DH);
      if (c && S.sel?.obj !== c.obj) S.select(c);
      open({ draft: { ...pt, t, cid: c?.obj.cid || null, label: c ? c.label || '' : 'Cả video', text: c?.obj.note || '' } });
    };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  });

  // ---------- ô hỏi nổi ----------
  function open(o) {
    if (cur) commit(); // đang mở ô khác: giữ chữ đã gõ
    cur = o;
    const it = o.item, d = o.draft;
    const n = it ? it.n : items().length + 1, t = it ? it.t : d.t, label = it ? it.label : d.label, text = it ? it.text : d.text;
    pop.innerHTML = `<div class="pinpop-h"><b>${n}</b><span>${esc(P.mmss(t))} · ${esc(label || (it?.kind === 'pin' ? 'Cả video' : ''))}</span>
        <button data-pp="x" class="icon" title="Đóng (Esc)" aria-label="Đóng"><i class="ti ti-x"></i></button></div>
      <textarea rows="3" aria-label="Hỏi hoặc ghi chú cho Claude" placeholder="Hỏi Claude về chỗ này, hoặc ghi chú để sau: chữ này sang màu cam, che bớt góc này…">${esc(text)}</textarea>
      <div class="pinpop-a">${it ? `<button data-pp="del" class="danger icon" title="Xoá chú thích" aria-label="Xoá chú thích"><i class="ti ti-trash"></i></button>
        <button data-pp="done" title="${it.done ? 'Bỏ đánh dấu đã làm' : 'Đánh dấu Claude đã làm xong'}"><i class="ti ${it.done ? 'ti-circle-check-filled' : 'ti-circle-check'}"></i>${it.done ? 'Chưa làm' : 'Đã làm'}</button>` : ''}
        <button data-pp="ok" title="Lưu chú thích, giao Claude sau (⌘↵)"><i class="ti ti-bookmark"></i>Để sau</button>
        <button data-pp="ask" class="primary" title="Gửi vào tab Claude và chạy ngay"><i class="ti ti-sparkles"></i>Hỏi ngay</button></div>`;
    pop.hidden = false; sigVis = ''; render(); place();
    const ta = pop.querySelector('textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  }
  function place() {
    const k = cur?.item?.key || (cur?.draft && 'draft'), b = k && layer.querySelector(`.pin[data-pin="${CSS.escape(k)}"]`);
    if (!b) { if (cur?.item) hidePop(); return; }
    pop.hidden = false;
    const r = b.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let x = r.right + 8, y = r.top;
    if (x + w > vw - 8) x = Math.max(8, r.left - w - 8);
    y = Math.max(8, Math.min(y, vh - h - 8));
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }
  // ô nhập ẩn đi thì trả focus (để C / Esc / ⌘Z lại là phím tắt của Studio)
  const hidePop = () => { if (pop.contains(document.activeElement)) document.activeElement.blur(); pop.hidden = true; };
  function close() { cur = null; hidePop(); sigVis = ''; render(); }

  // một bước hoàn tác cho mỗi thay đổi; fn sửa TL / element
  function apply(fn) {
    S.pushUndo();
    fn();
    if (Array.isArray(S.TL.pins) && !S.TL.pins.length) delete S.TL.pins;
    cur = null; hidePop(); sigVis = '';
    S.changed(true);
  }
  const objOf = it => (it?.kind === 'el' ? S.compByCid(it.cid)?.obj : null);
  // Để sau (lưu), Xoá, Đã làm
  function commit(how = 'ok') {
    if (!cur) return;
    const text = (pop.querySelector('textarea')?.value || '').trim(), it = cur.item, d = cur.draft;
    if (d) {
      if (!text) return close();
      const o = d.cid ? S.compByCid(d.cid)?.obj : null;
      return apply(() => {
        if (o) { o.note = text; o.note_at = { x: d.x, y: d.y, t: d.t }; }
        else S.TL.pins = [...(Array.isArray(S.TL.pins) ? S.TL.pins : []), { x: d.x, y: d.y, ...(d.w > 0 && d.h > 0 ? { w: d.w, h: d.h } : {}), t: d.t, text }];
      });
    }
    const o = objOf(it), pin = it.kind === 'pin' ? S.TL.pins?.[it.idx] : null;
    if (!o && !pin) return close();
    const del = how === 'del' || !text, flip = how === 'done';
    if (!del && !flip && text === it.text) return close();
    apply(() => {
      if (o) {
        if (del) { delete o.note; delete o.note_at; return; }
        o.note = text;
        if (flip) { o.note_at = { ...(o.note_at || { t: it.t }) }; if (it.done) delete o.note_at.done; else o.note_at.done = true; }
      } else {
        if (del) return S.TL.pins.splice(it.idx, 1);
        pin.text = text;
        if (flip) { if (it.done) delete pin.done; else pin.done = true; }
      }
    });
    if (del) S.toast('Đã xoá chú thích · ⌘Z để hoàn tác');
  }
  // Hỏi ngay: vùng → phạm vi region; element → chọn element rồi hỏi với phạm vi element; điểm cả video → vùng vuông quanh điểm.
  //   Chú thích nháp không lưu (muốn giữ thì Để sau); chú thích có sẵn giữ nguyên.
  function askNow() {
    if (!cur) return;
    const ta = pop.querySelector('textarea'), text = (ta?.value || '').trim(), src = cur.item || cur.draft;
    if (!text) { ta?.focus(); return S.toast('Gõ câu muốn hỏi Claude'); }
    if (!S.ask?.askNow) return S.toast('Chưa có Hỏi Claude');
    let region = null;
    const c = src.cid ? S.compByCid(src.cid) : null;
    if (src.w > 0 && src.h > 0) region = { x: src.x, y: src.y, w: src.w, h: src.h, t: src.t };
    else if (!c) {
      const half = POINT_REGION / 2, x = Math.max(0, Math.min(S.DW - POINT_REGION, src.x - half)), y = Math.max(0, Math.min(S.DH - POINT_REGION, src.y - half));
      region = { x, y, w: Math.min(POINT_REGION, S.DW), h: Math.min(POINT_REGION, S.DH), t: src.t };
    } else if (S.sel?.obj !== c.obj) S.select(c);
    if (!S.ask.askNow(text, region ? { region } : {})) return;
    close();
  }
  pop.addEventListener('click', e => {
    const a = e.target.closest('[data-pp]')?.dataset.pp; if (!a) return;
    if (a === 'x') return close();
    if (a === 'ask') return askNow();
    commit(a);
  });
  pop.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return close(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); return commit(); }
  });
  // bấm ra ngoài: giữ chữ đã gõ (chú thích mới rỗng thì bỏ)
  document.addEventListener('mousedown', e => {
    if (!cur || pop.contains(e.target) || e.target.closest?.('.pinlayer .pin')) return;
    commit();
  }, true);

  // ---------- tab Claude: danh sách chú thích ----------
  const notesEl = () => S.ask?.notes || null;
  function listHtml() {
    const L = items(), done = L.filter(i => i.done).length;
    const head = `<div class="pnotes-h"><b><i class="ti ti-message-circle"></i>Chú thích để sau (${L.length})</b>${done ? `<small>${done} đã làm</small>` : ''}
      <button data-pn="pin" class="icon${mode ? ' on' : ''}" title="Chú thích trên khung (C)" aria-label="Chú thích trên khung" aria-pressed="${mode}"><i class="ti ti-message-circle-plus"></i></button></div>`;
    if (!L.length) return head + '<p class="help">Bấm nút chú thích (C), rồi bấm element hoặc kéo khung một vùng: Hỏi ngay, hoặc Để sau.</p>';
    return head + `<ul class="pnotes-l">${L.map(i => `<li><button data-pn-k="${esc(i.key)}" class="${i.done ? 'done' : ''}" title="Tua tới ${esc(P.mmss(i.t))}${i.kind === 'el' ? ' và chọn element' : ''}">
        <span class="n">${i.n}</span><span class="pnotes-tx"><small>${esc(P.mmss(i.t))} · ${esc(i.label || (i.kind === 'pin' ? 'Cả video' : ''))}${i.x == null ? ' · chưa ghim trên khung' : ''}</small>${esc(i.text)}</span></button></li>`).join('')}</ul>
      <button class="primary pnotes-go" data-pn="give" title="Lưu rồi chép câu cho Claude Code"><i class="ti ti-wand"></i>Giao Claude sửa hết</button>`;
  }
  function paintList() {
    const el = notesEl(); if (!el || !S.TL) return;
    let sec = el.querySelector(':scope > .pnotes');
    if (!sec) { sec = document.createElement('section'); sec.className = 'pnotes'; el.replaceChildren(sec); }
    sec.innerHTML = listHtml();
  }
  // bấm chấm trên khung: mở tab Claude (mở cột phải đang gấp) và cuộn tới chú thích trong danh sách
  function showInList(key) {
    if (!notesEl()) return;
    S.layout?.revealRight?.();
    if (S.right?.tab !== 'claude') S.right?.show?.('claude');
    requestAnimationFrame(() => {
      paintList();
      const b = notesEl()?.querySelector(`[data-pn-k="${CSS.escape(key)}"]`); if (!b) return;
      b.scrollIntoView({ block: 'nearest' });
      b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 1200);
      if (cur) place();
    });
  }
  S.onReady?.(paintList);

  async function copy(s) {
    try { await navigator.clipboard.writeText(s); return true; } catch {
      const ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch { /* không chép được */ }
      ta.remove(); return ok;
    }
  }
  async function give() {
    const n = items().filter(i => !i.done).length;
    if (!await S.saveNow()) return S.toast('Chưa lưu được dự án — chưa giao cho Claude');
    const ok = await copy(PHRASE);
    S.toast(`${n} chú thích đã lưu vào .studio/notes.md. ${ok ? `Đã chép câu “${PHRASE}”` : `Gõ “${PHRASE}”`}: dán vào Claude Code mở ở thư mục dự án để Claude sửa hết.`);
  }
  // S22 M154: "Sửa hết lỗi" của tab Claude nhắc chú thích Để sau còn mở và giao luôn (cùng luồng nút Giao Claude sửa hết)
  S.pins = { open: () => (S.TL ? items().filter(i => !i.done).length : 0), give, get mode() { return mode; }, setMode };
  document.addEventListener('click', e => {
    const b = e.target.closest('.pnotes [data-pn], .pnotes [data-pn-k]'); if (!b || !S.TL) return;
    if (b.dataset.pn === 'pin') return setMode(!mode);
    if (b.dataset.pn === 'give') return give();
    const it = findItem(b.dataset.pnK); if (!it) return;
    S.setTime(Math.min(it.t, S.TL.duration || it.t));
    const c = it.kind === 'el' ? S.compByCid(it.cid) : null;
    if (c) S.select(c);
    if (it.x != null) setTimeout(() => { const now = findItem(it.key); if (now) open({ item: now }); }, 250); // chờ khung vẽ ở thời điểm mới
  });
})();
