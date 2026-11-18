// S20 M142: bảng Lớp tại playhead. S21 M145 (C21): là tab "Lớp" của cột phải (Studio.right), không còn trong panel Thành phần. Element đang hiện tại playhead theo thứ tự vẽ (trên cùng ở đầu,
// phụ đề ghim trên cùng, video chính ở đáy); mỗi dòng: icon loại, tên, mắt (obj.hidden), khoá (obj.locked: quét chọn và bấm lặp
// bỏ qua; M141 chặn kéo / phím). Bấm dòng = chọn; kéo dòng đổi thứ tự trong cùng mảng (TL.scenes / lines / nodes), một bước hoàn tác.
// Quét chọn và bấm lặp chọn lớp dưới nằm trong studio/studio.js (#overlay). Lõi thuần: 67_layers.core.js (window.Layers).
'use strict';
(() => {
  const S = window.Studio, L = window.Layers;
  if (!S || !L || !S.right) return;
  const { $, esc } = S;
  const body = $('#insp'); // thân của tab đang mở ở cột phải; mọi selector dưới đây giới hạn trong #lyr
  let dragC = null, last = '';

  const scenes = () => S.TL?.scenes || [];
  const ICON = { cap: 'ti-badge-cc', clip: 'ti-movie', line: 'ti-letter-t', node: 'ti-point', badge: 'ti-award' };
  const SCENE_IC = { broll: 'ti-photo', scene: 'ti-layout-board', gfx: 'ti-sparkles' };
  const iconOf = c => (c.kind === 'scene' ? (c.obj.type === 'shape' ? 'ti-square' : c.obj.type === 'sticker' || c.obj.type === 'emoji_pop' ? 'ti-mood-smile' : SCENE_IC[c.track] || 'ti-sparkles') : ICON[c.kind] || 'ti-square');
  const subOf = c => (c.kind === 'cap' ? 'Phụ đề · luôn trên cùng' : c.kind === 'clip' ? 'Video chính · dưới cùng' : c.kind === 'scene' ? '' : c.kind === 'line' && c.scene?.type === 'text' ? 'Chữ thêm' : c.scene ? S.typeName(c.scene.type) : '');
  const isSel = c => S.sel?.obj === c.obj || S.multi.some(m => m.obj === c.obj);

  function row(c) {
    const o = c.obj, drag = L.canDrag(c, scenes()), nen = c.kind === 'scene' && back.has(scenes().indexOf(o)) ? ' · nền' : '';
    const sub = c.kind === 'scene' ? S.typeName(o.type) + nen : subOf(c);
    const tools = c.kind === 'clip' ? '' :
      `<button data-lyeye title="${o.hidden ? 'Hiện' : 'Ẩn'}" aria-label="${o.hidden ? 'Hiện' : 'Ẩn'}" aria-pressed="${!o.hidden}"><i class="ti ${o.hidden ? 'ti-eye-off' : 'ti-eye'}"></i></button>` +
      `<button data-lylock class="${o.locked ? 'on' : ''}" title="${o.locked ? 'Mở khoá' : 'Khoá (không chọn được trên khung)'}" aria-label="${o.locked ? 'Mở khoá' : 'Khoá'}" aria-pressed="${!!o.locked}"><i class="ti ${o.locked ? 'ti-lock' : 'ti-lock-open'}"></i></button>`;
    return `<div class="lyr ${isSel(c) ? 'sel' : ''} ${o.hidden ? 'off' : ''}" data-ly="${esc(o.cid)}" data-drag="${drag ? 1 : 0}" role="listitem">
      <i class="ti ti-grip-vertical grip ${drag ? '' : 'no'}" title="Kéo để đổi lớp"></i><i class="ti ${iconOf(c)} ic"></i>
      <div class="mid"><div class="t1">${esc(c.label || S.typeName(o.type) || '')}</div>${sub && sub !== c.label ? `<div class="t2">${esc(sub)}</div>` : ''}</div>${tools}</div>`;
  }
  // S23 M160 (PR 178): cảnh engine vẽ ở lớp nền, đọc theo thứ tự phần tử data-cid trong preview tại playhead (Layers.backSet);
  // S23 M169: cộng cảnh chỉ có back theo khai báo module (window.drawnScenes của engine, Layers.backWith).
  let back = new Set();
  function backNow() {
    const doc = S.win?.document, sc = scenes(); if (!doc) return new Set();
    const seq = [];
    for (const el of doc.querySelectorAll('#stage [data-cid]')) {
      const c = S.compByCid(el.getAttribute('data-cid'));
      if (c?.kind === 'scene' || (c?.kind === 'line' && c.scene?.type === 'text')) seq.push(sc.indexOf(c.scene || c.obj));
    }
    let drawn = []; try { drawn = S.win.drawnScenes?.() || []; } catch { /* engine chưa sẵn */ }
    return L.backWith(L.backSet(seq), drawn); // S23 M169: cộng cảnh nền của module không gắn data-cid
  }
  function html() {
    if (dragC) return last; // đang kéo dòng: giữ nguyên DOM (playhead / timeline vẽ lại không cắt ngang thao tác kéo)
    back = backNow();
    const list = L.layerList(S.comps, scenes(), S.T, back);
    last = `<div id="lyr"><div class="lyhint">Element tại ${S.fmt(S.T)}, trên cùng ở đầu. Kéo dòng để đổi lớp · kéo trên khoảng trống của khung để quét chọn · bấm lại element đang chọn để chọn lớp bên dưới.</div>
      <div role="list" aria-label="Lớp tại playhead">${list.map(row).join('') || '<div class="lysep">Tại playhead không có element nào.</div>'}</div></div>`;
    return last;
  }
  S.right.addTab('layers', el => { el.innerHTML = html(); });

  const compOfRow = el => el && S.compByCid(el.dataset.ly);
  body.addEventListener('click', e => {
    const r = e.target.closest('#lyr .lyr'), c = compOfRow(r); if (!c || swallow) return;
    if (e.target.closest('[data-lyeye]')) { S.touch(c.obj); c.obj.hidden = !c.obj.hidden || undefined; if (!c.obj.hidden) delete c.obj.hidden; return S.changed(true); }
    if (e.target.closest('[data-lylock]')) {
      S.pushUndo(); if (c.obj.locked) delete c.obj.locked; else c.obj.locked = true;
      S.changed(true); return S.toast(c.obj.locked ? 'Đã khoá: không chọn được trên khung, mở khoá ở bảng Lớp' : 'Đã mở khoá');
    }
    S.select(c); S.revealOnTimeline(c);
  });

  // ---- kéo dòng đổi thứ tự (sự kiện chuột, không dùng kéo thả HTML5: không lẫn với thả media của 65_drop.js) ----
  const clearMarks = () => body.querySelectorAll('#lyr .drop-above, #lyr .drop-below, #lyr .dragging').forEach(x => x.classList.remove('drop-above', 'drop-below', 'dragging'));
  const aboveOf = (r, y) => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2; };
  let pend = null, hit = null, swallow = false;
  body.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const r = e.target.closest('#lyr .lyr[data-drag="1"]'), c = compOfRow(r); if (!c) return;
    pend = { c, r, y: e.clientY }; e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!pend) return;
    if (!dragC) { if (Math.abs(e.clientY - pend.y) < 4) return; dragC = pend.c; pend.r.classList.add('dragging'); document.body.classList.add('lydrag'); }
    const r = document.elementFromPoint(e.clientX, e.clientY)?.closest('#lyr .lyr'), c = compOfRow(r);
    body.querySelectorAll('#lyr .drop-above, #lyr .drop-below').forEach(x => x.classList.remove('drop-above', 'drop-below'));
    hit = c && L.canDrop(dragC, c, scenes(), back) ? { c, above: aboveOf(r, e.clientY) } : null; // khác mảng: không cho thả
    if (hit) r.classList.add(hit.above ? 'drop-above' : 'drop-below');
  });
  window.addEventListener('mouseup', () => {
    const a = dragC, h = hit; pend = null; hit = null;
    if (!a) return;
    dragC = null; swallow = true; setTimeout(() => (swallow = false), 0); // click sau khi thả không chọn dòng
    clearMarks(); document.body.classList.remove('lydrag');
    const A = L.layerOf(a, scenes()), B = h && L.layerOf(h.c, scenes());
    if (!B || !L.reorder(A.arr.slice(), A.item, B.item, h.above)) return S.right.refresh(); // thả đúng chỗ cũ / ngoài bảng: không thêm bước hoàn tác
    S.pushUndo(); L.dropOn(a, h.c, h.above, scenes(), back); S.changed(true);
  });
})();
