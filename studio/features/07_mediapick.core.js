// S30 M214: lõi thuần của bộ chọn media dùng chung (features/07_mediapick.js): tên dễ đọc, lọc theo loại và ô tìm,
// đường dẫn ảnh nhỏ. Chạy trong trình duyệt (window.MediaPickCore) và trong Node (scripts/tests/mediapick.test.mjs).
'use strict';
(function (root) {
  // tiền tố nguồn của file trong media/ (cùng bảng SRC_PREFIX của studio/library.js)
  const SRC = [['kho_', 'Từ Kho'], ['brand_', 'Thương hiệu'], ['lib_', 'Thư viện b-roll'], ['stock_', 'Stock'], ['ai_', 'Ảnh AI'],
    ['sticker_', 'Sticker'], ['product_', 'Sản phẩm'], ['shot_', 'Ảnh chụp']];
  const IMG = /\.(jpe?g|png|webp|gif|svg)$/i, VID = /\.(mp4|mov|m4v|webm|mkv|avi|mts)$/i;

  const fold = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

  /** Tên file → { title, src }: bỏ tiền tố nguồn (kho_, stock_…) để tên người dùng đặt đứng đầu, nguồn ghi riêng. */
  function label(name) {
    const n = String(name || '').split(/[\\/]/).pop();
    const hit = SRC.find(([p]) => n.toLowerCase().startsWith(p));
    const rest = hit ? n.slice(hit[0].length) : n;
    return { title: rest || n, src: hit ? hit[1] : '' };
  }
  const kindOf = it => it?.kind || (IMG.test(it?.name || it?.rel || '') ? 'image' : VID.test(it?.name || it?.rel || '') ? 'video' : 'audio');

  /** Lọc danh sách theo loại (['image'] | ['image','video']) và ô tìm (không dấu, theo tên và thư mục). */
  function filter(items, { kinds = ['image', 'video'], q = '' } = {}) {
    const f = fold(q).trim();
    return (Array.isArray(items) ? items : []).filter(it => it && kinds.includes(kindOf(it)) && (!f || fold(it.rel || it.name).includes(f)));
  }

  /** Ảnh nhỏ: mục của dự án (media/) dùng thumb sẵn có (ảnh chính nó, khung đầu của video); mục Kho: ảnh xem trực tiếp,
   * video qua /api/media/kho/thumb (một khung ffmpeg có cache). Trả đường dẫn chưa gắn token (client bọc avsUrl / purl). */
  function thumbOf(it, from = 'project') {
    if (!it) return '';
    if (from === 'kho') {
      const k = kindOf(it), q = encodeURIComponent(it.rel || '');
      return k === 'image' ? '/api/media/kho/file?rel=' + q : k === 'video' ? '/api/media/kho/thumb?rel=' + q : '';
    }
    return it.thumb ? String(it.thumb) : '';
  }

  const T = { label, filter, thumbOf, kindOf, fold, SRC };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.MediaPickCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
