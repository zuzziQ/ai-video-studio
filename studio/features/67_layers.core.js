// S20 M142: lõi thuần của bảng Lớp tại playhead, quét chọn trên khung và bấm lặp chọn lớp dưới. Không DOM: 67_layers.js và
// studio/studio.js đo hộp (rectOf) rồi gọi các hàm ở đây. Chạy trong trình duyệt (window.Layers) và trong Node (module.exports)
// cho scripts/tests/s20_layers.test.mjs.
'use strict';
(function (root) {
  const VIS = new Set(['clip', 'scene', 'line', 'node', 'badge', 'cap']); // element có hình trên khung (âm thanh không có lớp)

  // Khoá thứ tự vẽ của một element: [nhóm, cảnh, trong cảnh]. Clip ở đáy, phụ đề luôn trên cùng (engine vẽ caption sau mọi cảnh),
  // cảnh theo vị trí trong TL.scenes (sau cùng ở trên); trong một cảnh: thân cảnh, rồi lines, rồi nodes, rồi huy hiệu.
  // S23 M160 (PR 178): back = Set chỉ số cảnh (trong TL.scenes) mà engine vẽ ở lớp nền ("back", dưới người và mọi cảnh "front");
  // cảnh nền xếp dưới mọi cảnh front, giữa các cảnh cùng lớp vẫn theo vị trí trong mảng.
  function drawKey(c, scenes, back) {
    if (c.kind === 'cap') return [2, 0, 0];
    if (c.kind === 'clip') return [0, c.idx || 0, 0];
    const s = c.scene || c.obj, i = scenes.indexOf(s), si = back?.has(i) ? i : i + scenes.length;
    if (c.kind === 'line') return [1, si, 1 + (s.lines || []).indexOf(c.obj)];
    if (c.kind === 'node') return [1, si, 1 + (s.lines || []).length + (s.nodes || []).indexOf(c.obj)];
    if (c.kind === 'badge') return [1, si, 1e4];
    return [1, si, 0];
  }
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

  // Danh sách lớp đang hiện tại playhead T, trên cùng ở đầu. Gồm cả element đang ẩn (để bật lại bằng nút mắt).
  function layerList(comps, scenes, T, back) {
    return comps.filter(c => VIS.has(c.kind) && T >= c.t0 - 1e-3 && T < c.t1)
      .map(c => ({ c, k: drawKey(c, scenes, back) })).sort((a, b) => cmp(b.k, a.k)).map(x => x.c);
  }

  // S23 M160 (PR 178): cảnh nào ở lớp nền, đọc từ thứ tự DOM của preview. seq = chỉ số cảnh (TL.scenes) theo thứ tự phần tử data-cid
  // trong #stage (engine ghép back theo thứ tự mảng rồi front theo thứ tự mảng, nên seq là hai dãy tăng nối nhau). Phần trước chỗ
  // giảm đầu tiên là back; không có chỗ giảm thì thứ tự vẽ trùng thứ tự mảng, trả Set rỗng.
  function backSet(seq) {
    const s = []; for (const i of seq || []) if (i >= 0 && !s.includes(i)) s.push(i);
    const k = s.findIndex((v, j) => j > 0 && v < s[j - 1]);
    return new Set(k < 0 ? [] : s.slice(0, k));
  }
  // Mảng chứa và phần tử đổi chỗ của một lớp (giống CanvasCmds.layerOf của M140): cảnh và chữ thêm một dòng đổi trong TL.scenes,
  // chữ graphic trong lines, node trong nodes. Phụ đề, clip, huy hiệu: null (không kéo được).
  function layerOf(c, scenes) {
    if (!c) return null;
    if (c.kind === 'scene') return { arr: scenes, item: c.obj };
    if (c.kind === 'line' && c.scene?.type === 'text' && c.scene.lines?.length === 1) return { arr: scenes, item: c.scene };
    if (c.kind === 'line') return c.scene?.lines ? { arr: c.scene.lines, item: c.obj } : null;
    if (c.kind === 'node') return c.scene?.nodes ? { arr: c.scene.nodes, item: c.obj } : null;
    return null;
  }
  const canDrag = (c, scenes) => { const L = layerOf(c, scenes); return !!L && L.arr.length > 1; };
  // Thả dòng a lên dòng b (above = nửa trên của dòng b trong bảng, tức lớp cao hơn b). Chỉ trong cùng một mảng.
  // S23 M160 (PR 178): cảnh nền và cảnh front không đổi chỗ cho nhau (engine luôn vẽ nền dưới), back như ở drawKey.
  function canDrop(a, b, scenes, back) {
    const A = layerOf(a, scenes), B = layerOf(b, scenes);
    if (!A || !B || A.arr !== B.arr || A.item === B.item) return false;
    if (A.arr === scenes && back && back.has(scenes.indexOf(A.item)) !== back.has(scenes.indexOf(B.item))) return false;
    return true;
  }
  // Đổi chỗ tại chỗ trong mảng: trên cùng của bảng = cuối mảng, nên "above" chèn ngay sau target. Trả true khi thứ tự đổi.
  function reorder(arr, item, target, above) {
    const i = arr.indexOf(item); if (i < 0 || item === target || arr.indexOf(target) < 0) return false;
    arr.splice(i, 1);
    const t = arr.indexOf(target), j = above ? t + 1 : t;
    arr.splice(j, 0, item);
    return j !== i;
  }
  // Thả dòng a lên dòng b trong bảng. Trả true khi đã đổi thứ tự.
  function dropOn(a, b, above, scenes, back) {
    if (!canDrop(a, b, scenes, back)) return false;
    const A = layerOf(a, scenes), B = layerOf(b, scenes);
    return reorder(A.arr, A.item, B.item, above);
  }

  // ---- quét chọn ----
  // Hộp từ hai điểm kéo (px thiết kế), luôn w, h ≥ 0.
  const normBox = (x0, y0, x1, y1) => ({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
  const touches = (a, b) => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
  // items: [{c, r}] (r = rectOf, px thiết kế). Bỏ element đầy khung (nền, b-roll full) để quét không luôn dính chúng.
  function marqueeHits(items, box, frame = {}) {
    const full = r => frame.DW && r.w >= frame.DW * .98 && r.h >= frame.DH * .98;
    return items.filter(({ r }) => r && r.w > 0 && r.h > 0 && !full(r) && touches(r, box)).map(x => x.c);
  }
  // Ghép kết quả quét với chọn sẵn (Shift cộng thêm): trả {sel, multi}; phần tử đầu thành sel.
  function mergeSel(base, hits) {
    const all = [...base.filter(Boolean)];
    for (const h of hits) if (!all.includes(h)) all.push(h);
    return { sel: all[0] || null, multi: all.slice(1) };
  }

  // ---- bấm lặp ----
  // stack: element tại điểm bấm, trên cùng ở đầu. Bấm lại chỗ element đang chọn → element kế tiếp bên dưới (hết thì vòng lên đầu).
  function nextBelow(stack, cur) {
    if (!stack.length) return null;
    const i = stack.indexOf(cur);
    return i < 0 ? stack[0] : stack[(i + 1) % stack.length];
  }

  const T = { VIS, drawKey, backSet, layerList, layerOf, canDrag, canDrop, reorder, dropOn, normBox, touches, marqueeHits, mergeSel, nextBelow };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.Layers = T;
})(typeof window !== 'undefined' ? window : globalThis);
