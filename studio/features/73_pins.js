// S21 M150: ghi chú ghim trên khung (học bình luận trên canvas của Claude Design).
//   Chế độ ghim: nút "Ghim ghi chú" ở thanh dưới preview hoặc phím C (không khi đang gõ). Bấm lên khung = ghim tại (x, y px
//   thiết kế, t = playhead): có element dưới điểm bấm (Studio.pick) thì ghim vào element (obj.note + obj.note_at), không thì ghim
//   chung của cả video (TL.pins). Server ghi cả hai vào <dự án>/.studio/notes.md khi lưu (writeNotes của server.mjs).
//   Ghim (chấm có số) nằm trên lớp riêng #stagebox > .pinlayer, trên #overlay: lớp không nhận chuột trừ chính các chấm, nên kéo /
//   chọn element vẫn như cũ khi không ở chế độ ghim. Bấm chấm = ô nhập nổi (sửa, Xong, Xoá, Đã làm). Mỗi lần tạo / sửa / xoá /
//   đánh dấu là một bước hoàn tác (Studio.pushUndo trước khi đổi).
//   Tab Dự án: khối "Ghi chú cho Claude (N)" chèn qua hook S._proj của 03_nextstep.js; "Giao Claude sửa hết" = lưu rồi chép câu
//   "xem ghi chú trong editor" (C23: không tự gọi Claude). Lõi thuần: 73_pins.core.js (window.PinsCore).
'use strict';
(() => {
  const S = window.Studio, P = window.PinsCore;
  if (!S || !P) return console.error('73_pins: thiếu Studio / 73_pins.core.js');
  const { $, esc } = S;
  const box = $('#stagebox'), btn = $('#pinbtn');
  if (!box) return;
  const PHRASE = 'xem ghi chú trong editor';

  const css = document.createElement('style');
  css.textContent = `
  #stagebox .pinlayer { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
  #stagebox .pinlayer.on { pointer-events: auto; cursor: crosshair; }
  .pinlayer .pin { position: absolute; transform: translateY(-100%); pointer-events: auto; display: inline-flex; align-items: center; justify-content: center;
    min-width: 24px; height: 24px; padding: 0 var(--space-1); border: 2px solid rgb(var(--color-white)); border-radius: 12px 12px 12px 2px;
    background: rgb(var(--color-accent)); color: rgb(var(--color-accent-fg)); font-size: var(--text-2xs); font-weight: 700; line-height: 1; box-shadow: var(--shadow-raised); cursor: pointer; }
  .pinlayer .pin:hover, .pinlayer .pin.open { outline: 2px solid rgb(var(--color-focus)); outline-offset: 1px; }
  .pinlayer .pin.done { background: rgb(var(--color-surface-muted)); color: rgb(var(--color-fg-muted)); }
  .pinlayer .pin.draft { background: rgb(var(--color-warning)); color: rgb(var(--color-black)); }
  .pinlayer.drag .pin { pointer-events: none; }
  .pinpop { position: fixed; z-index: 45; width: 260px; display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-2);
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
  .pnotes { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid rgb(var(--color-line)); }
  .pnotes-h { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
  .pnotes-h b { flex: 1; display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--text-sm); }
  .pnotes-h small { color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); }
  .pnotes-l { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); max-height: 280px; overflow-y: auto; }
  .pnotes-l button { width: 100%; height: auto; display: flex; align-items: flex-start; gap: var(--space-2); padding: var(--space-1) var(--space-2); text-align: left; justify-content: flex-start; white-space: normal; }
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
  pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Ghi chú cho Claude');
  document.body.appendChild(pop);

  let mode = false, cur = null, sigVis = '', sigAll = ''; // cur: {item} (ghim có sẵn) | {draft: {x, y, t, cid, label}}

  const items = () => (S.TL ? P.collect(S.comps, S.TL.pins) : []);
  const typing = () => { const a = document.activeElement; return !!a && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'range' || a.isContentEditable); };

  function setMode(on) {
    mode = !!on && !!S.TL;
    layer.classList.toggle('on', mode);
    if (btn) { btn.classList.toggle('on', mode); btn.setAttribute('aria-pressed', String(mode)); }
    if (!mode && cur?.draft) close();
    paintList();
    if (mode) S.toast('Ghim ghi chú: bấm lên khung (bấm lên element để ghim vào element) · C hoặc Esc để thoát');
  }
  btn?.addEventListener('click', () => setMode(!mode));
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing() || !S.TL) return;
    if (e.code === 'KeyC' || e.key === 'c' || e.key === 'C') { e.preventDefault(); return setMode(!mode); }
    if (e.key === 'Escape' && mode) setMode(false);
  });

  // ---------- lớp ghim trên khung ----------
  const findItem = key => items().find(i => i.key === key) || null;
  function render() {
    if (!S.TL) return;
    const all = items(), K = S.K, sa = P.sig(all);
    const shown = P.visibleAt(all, S.T);
    const d = cur?.draft;
    // ghim element bám theo element: element đã dời khỏi điểm ghim thì ghim hiện ở góc trên-phải của element
    const at = it => (it.kind === 'el' ? P.anchor(it, (() => { const o = S.compByCid(it.cid)?.obj; return o ? S.rectOf(o) : null; })()) : it);
    const list = (d ? [...shown, { key: 'draft', n: all.length + 1, x: d.x, y: d.y, done: false, text: '', draft: true }] : shown).map(it => ({ ...it, ...at(it) }));
    layer.classList.toggle('drag', S.dragging);
    const sv = P.sig(list) + '|' + K + '|' + (cur ? cur.item?.key || 'draft' : '');
    if (sv !== sigVis) {
      sigVis = sv;
      layer.innerHTML = list.map(it => `<button class="pin${it.done ? ' done' : ''}${it.draft ? ' draft' : ''}${cur && (cur.item?.key === it.key || (it.draft && cur.draft)) ? ' open' : ''}" data-pin="${esc(it.key)}"
        title="${esc(it.text || 'Ghi chú mới')}" aria-label="Ghi chú ${it.n}${it.done ? ' (đã làm)' : ''}: ${esc(it.text)}"><span>${it.n}</span></button>`).join('');
      layer.querySelectorAll('.pin').forEach((b, i) => { b.style.left = list[i].x * K + 'px'; b.style.top = list[i].y * K + 'px'; });
    }
    if (cur?.item && !all.some(i => i.key === cur.item.key)) close();
    else if (cur) place();
    if (sa !== sigAll) { sigAll = sa; paintList(); }
  }
  S._ov.push(render);
  window.addEventListener('resize', () => { if (cur) place(); });

  layer.addEventListener('mousedown', e => {
    const b = e.target.closest('.pin');
    e.preventDefault(); e.stopPropagation();
    if (b) { if (b.dataset.pin === 'draft') return; const it = findItem(b.dataset.pin); if (it) open({ item: it }); return; }
    if (!mode || !S.TL) return;
    const r = box.getBoundingClientRect(), px = (e.clientX - r.left) / S.K, py = (e.clientY - r.top) / S.K;
    const c = P.attachTo(S.pick(px, py)), pt = P.clampPt(px, py, S.DW, S.DH);
    open({ draft: { ...pt, t: Math.round(S.T * 100) / 100, cid: c?.obj.cid || null, label: c ? c.label || '' : 'Cả video', text: c?.obj.note || '' } });
  });

  // ---------- ô nhập nổi ----------
  function open(o) {
    if (cur) commit(); // đang mở ô khác: giữ chữ đã gõ
    cur = o;
    const it = o.item, d = o.draft;
    const n = it ? it.n : items().length + 1, t = it ? it.t : d.t, label = it ? it.label : d.label, text = it ? it.text : d.text;
    pop.innerHTML = `<div class="pinpop-h"><b>${n}</b><span>${esc(P.mmss(t))} · ${esc(label || (it?.kind === 'pin' ? 'Cả video' : ''))}</span>
        <button data-pp="x" class="icon" title="Đóng (Esc)" aria-label="Đóng"><i class="ti ti-x"></i></button></div>
      <textarea rows="3" aria-label="Ghi chú cho Claude" placeholder="Ghi chú cho Claude: đổi chữ này sang màu cam, cắt đoạn này…">${esc(text)}</textarea>
      <div class="pinpop-a">${it ? `<button data-pp="del" class="danger" title="Xoá ghi chú"><i class="ti ti-trash"></i>Xoá</button>
        <button data-pp="done" title="${it.done ? 'Bỏ đánh dấu đã làm' : 'Đánh dấu Claude đã làm xong'}"><i class="ti ${it.done ? 'ti-circle-check-filled' : 'ti-circle-check'}"></i>${it.done ? 'Chưa làm' : 'Đã làm'}</button>` : ''}
        <button data-pp="ok" class="primary" title="Lưu ghi chú (⌘↵)">Xong</button></div>`;
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

  // một bước hoàn tác cho mỗi thay đổi; fn sửa TL / element, trả false nếu không có gì đổi
  function apply(fn) {
    S.pushUndo();
    fn();
    if (Array.isArray(S.TL.pins) && !S.TL.pins.length) delete S.TL.pins;
    cur = null; hidePop(); sigVis = '';
    S.changed(true);
  }
  const objOf = it => (it?.kind === 'el' ? S.compByCid(it.cid)?.obj : null);
  function commit(how = 'ok') {
    if (!cur) return;
    const text = (pop.querySelector('textarea')?.value || '').trim(), it = cur.item, d = cur.draft;
    if (d) {
      if (!text) return close();
      const o = d.cid ? S.compByCid(d.cid)?.obj : null;
      return apply(() => {
        if (o) { o.note = text; o.note_at = { x: d.x, y: d.y, t: d.t }; }
        else S.TL.pins = [...(Array.isArray(S.TL.pins) ? S.TL.pins : []), { x: d.x, y: d.y, t: d.t, text }];
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
    if (del) S.toast('Đã xoá ghi chú · ⌘Z để hoàn tác');
  }
  pop.addEventListener('click', e => {
    const a = e.target.closest('[data-pp]')?.dataset.pp; if (!a) return;
    if (a === 'x') return close();
    commit(a);
  });
  pop.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return close(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); return commit(); }
  });
  // bấm ra ngoài: giữ chữ đã gõ (ghim mới rỗng thì bỏ)
  document.addEventListener('mousedown', e => {
    if (!cur || pop.contains(e.target) || e.target.closest?.('.pinlayer .pin')) return;
    commit();
  }, true);

  // ---------- tab Dự án: danh sách mọi ghi chú ----------
  function listHtml() {
    const L = items(), done = L.filter(i => i.done).length;
    const head = `<div class="pnotes-h"><b><i class="ti ti-message-circle"></i>Ghi chú cho Claude (${L.length})</b>${done ? `<small>${done} đã làm</small>` : ''}
      <button data-pn="pin" class="icon${mode ? ' on' : ''}" title="Ghim ghi chú trên khung (C)" aria-label="Ghim ghi chú trên khung"><i class="ti ti-message-circle-plus"></i></button></div>`;
    if (!L.length) return head + '<p class="help">Bấm nút ghim ở thanh dưới khung xem (hoặc phím C) rồi bấm lên video để ghi chú cho Claude ngay tại chỗ.</p>';
    return head + `<ul class="pnotes-l">${L.map(i => `<li><button data-pn-k="${esc(i.key)}" class="${i.done ? 'done' : ''}" title="Tua tới ${esc(P.mmss(i.t))}${i.kind === 'el' ? ' và chọn element' : ''}">
        <span class="n">${i.n}</span><span class="pnotes-tx"><small>${esc(P.mmss(i.t))} · ${esc(i.label || (i.kind === 'pin' ? 'Cả video' : ''))}${i.x == null ? ' · chưa ghim trên khung' : ''}</small>${esc(i.text)}</span></button></li>`).join('')}</ul>
      <button class="primary pnotes-go" data-pn="give" title="Lưu rồi chép câu cho Claude Code"><i class="ti ti-wand"></i>Giao Claude sửa hết</button>`;
  }
  function paintList(el = $('#insp .pnotes')) { if (el && S.TL) el.innerHTML = listHtml(); }
  (S._proj = S._proj || []).push(() => {
    if (!S.TL) return null;
    const el = document.createElement('section'); el.className = 'pnotes'; paintList(el); return el;
  });

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
    S.toast(`${n} ghi chú đã lưu vào .studio/notes.md. ${ok ? `Đã chép câu “${PHRASE}”` : `Gõ “${PHRASE}”`}: dán vào Claude Code mở ở thư mục dự án để Claude sửa hết.`);
  }
  $('#insp')?.addEventListener('click', e => {
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
