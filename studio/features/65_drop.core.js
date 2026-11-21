// Lõi thuần kéo mục thư viện thả vào khung / timeline (S20 M143). Không DOM: 65_drop.js đo hộp phần tử rồi gọi các hàm ở đây.
// Chạy trong trình duyệt (window.DropCore) và trong Node (module.exports) cho scripts/tests/s20_drop.test.mjs.
// Toạ độ khung là px thiết kế (720×1280 dọc, 1280×720 ngang): x = (clientX - box.left) / K.
'use strict';
(function (root) {
  const MIME = 'text/x-avs-lib';
  // Loại mục kéo được: chữ (id = số mẫu, -1 = Thêm chữ), sticker (emoji), fx (gói "i:j", gồm khối HyperFrames),
  // media (số trong Media › Dự án này), kho (số trong Media › Kho).
  const KINDS = new Set(['text', 'sticker', 'fx', 'media', 'kho', 'efx']); // efx: S28 M206 hiệu ứng khung hình (81_fxtrack.js)
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const r2 = v => Math.round(v * 100) / 100;

  const encode = (kind, id) => JSON.stringify({ kind, id: String(id) });
  function decode(str) {
    let d; try { d = JSON.parse(str); } catch { return null; }
    if (!d || !KINDS.has(d.kind) || typeof d.id !== 'string' || !d.id || d.id.length > 64) return null;
    if (d.kind === 'fx' && !/^\d+:\d+$/.test(d.id)) return null;
    if (['text', 'media', 'kho'].includes(d.kind) && !/^-?\d+$/.test(d.id)) return null;
    return d;
  }
  // Điểm thả trên khung → px thiết kế. box = getBoundingClientRect của #stagebox; ngoài khung → null.
  function stageToDesign(clientX, clientY, box, K, DW, DH) {
    if (!box || !(K > 0)) return null;
    const x = (clientX - box.left) / K, y = (clientY - box.top) / K;
    if (x < 0 || y < 0 || x > DW || y > DH) return null;
    return { x: Math.round(clamp(x, 0, DW)), y: Math.round(clamp(y, 0, DH)) };
  }
  // Điểm thả trên timeline → giây. left = getBoundingClientRect().left của #tlinner (đã tính cuộn ngang).
  // Chừa 0.2 s cuối để element vừa thêm còn thời lượng.
  function timelineToSec(clientX, left, PPS, duration) {
    if (!(PPS > 0) || !(duration > 0)) return 0;
    return r2(clamp((clientX - left) / PPS, 0, Math.max(0, duration - .2)));
  }
  // Track nào nhận được: mọi track có data-track trừ track giọng (wave, không có data-track).
  // Media: thả vào Video chính (hoặc thước, ngoài track) → clip track chính như cũ; track khác → lớp phủ.
  function mediaHow(track) { return !track || track === 'video' ? 'clip' : 'overlay'; }
  // Dời element để tâm nằm ở điểm thả. pos = getPos(c) của Studio ({x, y, size, card?}); card: x, y là góc trên trái.
  function centerAt(pos, x, y) {
    if (!pos) return null;
    const cx = pos.card ? pos.card.x + pos.card.w / 2 : pos.x, cy = pos.card ? pos.card.y + pos.card.h / 2 : pos.y;
    return { ...pos, x: Math.round(pos.x + x - cx), y: Math.round(pos.y + y - cy) };
  }

  const T = { MIME, KINDS, encode, decode, stageToDesign, timelineToSec, mediaHow, centerAt };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.DropCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
