// S20 M140: lõi thuần của bảng lệnh trên khung xem trước — thanh nổi theo ngữ cảnh và menu chuột phải (khung + khối timeline)
// dùng chung một bảng lệnh. Không DOM: 66_canvas_cmds.js đo hộp rồi gọi các hàm ở đây. Chạy trong trình duyệt (window.CanvasCmds)
// và trong Node (module.exports) cho scripts/tests/s20_cmds.test.mjs.
'use strict';
(function (root) {
  // Nhóm thanh nổi theo loại element: chữ (font, cỡ, màu, đậm, hoạt ảnh), phụ đề (cỡ, màu), cảnh (thay, lớp, nhân bản, xoá).
  function barKind(c) {
    if (!c) return null;
    if (c.kind === 'line' || c.kind === 'node') return 'text';
    if (c.kind === 'cap') return 'cap';
    if (c.kind === 'scene' || c.kind === 'badge') return 'scene';
    return null; // clip, âm thanh: không có thanh nổi (inspector + menu chuột phải)
  }
  // Panel thư viện để "Thay" một cảnh cùng loại.
  function replacePanel(type) {
    if (type === 'emoji_pop' || type === 'sticker') return 'sticker';
    if (type === 'photo' || type === 'broll' || type === 'media_card') return 'media';
    if (type === 'shape') return 'shapes';
    return 'fx';
  }

  // Thứ tự lớp: cảnh = vị trí trong TL.scenes (engine vẽ front theo thứ tự mảng, sau cùng ở trên); chữ thêm (cảnh text một dòng)
  // đổi theo cảnh của nó; chữ graphic / node đổi trong lines / nodes của cảnh. Phụ đề luôn trên cùng, clip / âm thanh không có lớp.
  // Trả {arr, item} (mảng chứa và phần tử đổi chỗ) hoặc null.
  function layerOf(c, scenes) {
    if (!c) return null;
    if (c.kind === 'scene') return { arr: scenes, item: c.obj };
    if (c.kind === 'line' && c.scene?.type === 'text' && c.scene.lines?.length === 1) return { arr: scenes, item: c.scene };
    if (c.kind === 'line') return { arr: c.scene?.lines, item: c.obj };
    if (c.kind === 'node') return { arr: c.scene?.nodes, item: c.obj };
    return null;
  }
  // Vị trí mới khi đổi lớp: how = 'up' | 'down' | 'top' | 'bottom'. -1 khi không đổi được (đã ở mép, không có lớp).
  function layerTarget(arr, item, how) {
    const i = arr ? arr.indexOf(item) : -1; if (i < 0) return -1;
    const j = how === 'up' ? i + 1 : how === 'down' ? i - 1 : how === 'top' ? arr.length - 1 : how === 'bottom' ? 0 : i;
    return j < 0 || j >= arr.length || j === i ? -1 : j;
  }
  // Đổi lớp tại chỗ. Trả true khi đã đổi.
  function moveLayer(arr, item, how) {
    const j = layerTarget(arr, item, how); if (j < 0) return false;
    arr.splice(arr.indexOf(item), 1); arr.splice(j, 0, item);
    return true;
  }

  // Bảng lệnh của menu chuột phải (cũng là nút ⋯ của thanh nổi). ctx: {scenes, hasOrig, hidden, canEditText, canSplit}.
  // Mỗi mục {id, label, icon, key?, off?}; '-' là gạch ngăn.
  function menuItems(c, ctx = {}) {
    if (!c) return [];
    if (c.kind === 'clip') return [
      { id: 'split', label: 'Tách tại playhead', icon: 'ti-scissors', key: '⌘B', off: !ctx.canSplit },
      { id: 'dup', label: 'Nhân bản', icon: 'ti-copy', key: '⌘D' }, '-',
      { id: 'del', label: 'Xoá', icon: 'ti-trash', key: 'Del', danger: true }];
    if (c.kind === 'sfx' || c.kind === 'music') return [
      { id: 'seek', label: 'Tua tới đầu', icon: 'ti-clock-play' }, { id: 'dup', label: 'Nhân bản', icon: 'ti-copy', key: '⌘D', off: c.kind === 'music' }, '-',
      { id: 'del', label: 'Xoá', icon: 'ti-trash', key: 'Del', danger: true }];
    const L = layerOf(c, ctx.scenes || []), can = how => !!L && layerTarget(L.arr, L.item, how) >= 0;
    const out = [];
    if (ctx.canEditText) out.push({ id: 'edit', label: 'Sửa chữ', icon: 'ti-cursor-text', key: 'Bấm đúp' });
    out.push({ id: 'dup', label: 'Nhân bản', icon: 'ti-copy', key: '⌘D' }, { id: 'hide', label: ctx.hidden ? 'Hiện' : 'Ẩn', icon: ctx.hidden ? 'ti-eye' : 'ti-eye-off' });
    if (L) out.push('-', { id: 'up', label: 'Đưa lên một lớp', icon: 'ti-arrow-bar-up', off: !can('up') }, { id: 'top', label: 'Đưa lên trên cùng', icon: 'ti-arrow-bar-to-up', off: !can('top') },
      { id: 'down', label: 'Đưa xuống một lớp', icon: 'ti-arrow-bar-down', off: !can('down') }, { id: 'bottom', label: 'Đưa xuống dưới cùng', icon: 'ti-arrow-bar-to-down', off: !can('bottom') });
    out.push('-');
    if (ctx.hasOrig) out.push({ id: 'reset', label: 'Về thiết kế', icon: 'ti-restore' });
    out.push({ id: 'note', label: 'Ghi chú cho Claude', icon: 'ti-message-2' }, { id: 'seek', label: 'Tua tới đầu', icon: 'ti-clock-play' }, '-',
      { id: 'del', label: 'Xoá', icon: 'ti-trash', key: 'Del', danger: true });
    return out;
  }

  // Chỗ đặt thanh nổi: trên khung chọn (cách gap), không đủ chỗ thì dưới; giữa theo chiều ngang, kẹp trong view.
  // sel / view = {l, t, r, b}, bar = {w, h} (px màn hình). Trả {x, y, below}.
  function placeBar(sel, bar, view, gap = 10) {
    const cx = (sel.l + sel.r) / 2;
    let below = sel.t - gap - bar.h < view.t;
    let y = below ? sel.b + gap : sel.t - gap - bar.h;
    if (below && y + bar.h > view.b) { below = false; y = Math.max(view.t, sel.t + gap); } // element cao gần cả khung: đè mép trên trong khung
    const x = Math.min(Math.max(view.l, cx - bar.w / 2), Math.max(view.l, view.r - bar.w));
    return { x: Math.round(x), y: Math.round(y), below };
  }
  // Menu chuột phải tại (x, y): lật sang trái / lên trên khi tràn view.
  function placeMenu(x, y, m, view) {
    return { x: Math.round(x + m.w > view.r ? Math.max(view.l, x - m.w) : x), y: Math.round(y + m.h > view.b ? Math.max(view.t, y - m.h) : y) };
  }
  // Cỡ chữ ±: bước 10 % cỡ hiện tại, kẹp 8–400 px thiết kế.
  const stepSize = (size, dir) => Math.round(Math.min(400, Math.max(8, size * (dir > 0 ? 1.1 : 1 / 1.1))) * 10) / 10;

  const T = { barKind, replacePanel, layerOf, layerTarget, moveLayer, menuItems, placeBar, placeMenu, stepSize };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.CanvasCmds = T;
})(typeof window !== 'undefined' ? window : globalThis);
