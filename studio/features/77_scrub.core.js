// S23 M162: lõi thuần của dải tua 40 px (mức "strip" của timeline 3 mức, docs/plans/S23-bo-cuc-theo-kho-video.md mục 2, 4).
// Vào: thời lượng, bề rộng dải (px, theo container), tỉ lệ khung, bố cục clip [{t0, t1}] (clipLayout của clips.js), TL.scenes.
// Ra: ô ảnh nhỏ theo thời gian, vạch cắt (ranh clip) / cảnh (đầu cảnh), thời điểm dưới con trỏ, bắt dính vào vạch khi kéo.
// Không DOM: chạy trong trình duyệt (window.ScrubCore, dùng bởi 77_scrub.js) và Node (scripts/tests/s23_m162.test.mjs).
'use strict';
(function (root) {
  const TILE_H = 32;        // px: chiều cao ảnh nhỏ trong dải 40 px (chừa viền trên / dưới)
  const MAX_TILES = 240;    // trần số ô (cửa sổ 4K, video dọc): mỗi ô là một ảnh khung
  const SNAP_PX = 6;        // kéo trong 6 px quanh vạch thì bắt dính
  const MERGE_S = 0.05;     // hai vạch gần hơn 50 ms gộp làm một (cắt thắng cảnh)

  const num = v => (Number.isFinite(+v) ? +v : 0);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Bề rộng một ô theo tỉ lệ khung (rộng / cao): 9:16 → 18 px, 1:1 → 32 px, 16:9 → 57 px.
  const tileW = ratio => Math.max(12, Math.round(TILE_H * (num(ratio) > 0 ? +ratio : 9 / 16)));

  // Ô ảnh nhỏ phủ kín bề rộng: [{x, w, t}], t = thời điểm giữa ô (giây). Ô cuối co cho vừa.
  function tiles(dur, width, ratio) {
    const D = num(dur), W = Math.floor(num(width));
    if (!(D > 0) || !(W > 0)) return [];
    let tw = tileW(ratio);
    const n = Math.min(MAX_TILES, Math.ceil(W / tw));
    if (n === MAX_TILES) tw = W / n;
    const out = [];
    for (let j = 0; j < n; j++) {
      const x = j * tw, w = Math.min(tw, W - x);
      if (w <= 0) break;
      out.push({ x: Math.round(x * 100) / 100, w: Math.round(w * 100) / 100, t: Math.round(clamp((x + w / 2) / W * D, 0, D) * 1000) / 1000 });
    }
    return out;
  }

  // Vạch: ranh giữa hai clip (cut) và đầu mỗi cảnh (scene). Bỏ vạch ở 0 và ở cuối, gộp vạch sát nhau, sắp theo thời gian.
  // layout: [{t0, t1}] của clipLayout() (clip ẩn có t0 = t1, bỏ qua); scenes: TL.scenes [{t0, type, hidden?}].
  function marks(layout, scenes, dur) {
    const D = num(dur), raw = [];
    const inside = t => t > MERGE_S && t < D - MERGE_S;
    const L = (Array.isArray(layout) ? layout : []).filter(k => num(k?.t1) > num(k?.t0));
    for (let i = 0; i < L.length - 1; i++) { const t = num(L[i].t1); if (inside(t)) raw.push({ t, kind: 'cut', i: i + 1 }); }
    for (const s of Array.isArray(scenes) ? scenes : []) {
      if (!s || s.hidden || s.off) continue;
      const t = num(s.t0);
      if (inside(t)) raw.push({ t, kind: 'scene', type: typeof s.type === 'string' ? s.type : '' });
    }
    raw.sort((a, b) => a.t - b.t || (a.kind === 'cut' ? -1 : 1));
    const out = [];
    for (const m of raw) {
      const last = out[out.length - 1];
      if (last && m.t - last.t < MERGE_S) { if (m.kind === 'cut' && last.kind !== 'cut') out[out.length - 1] = m; continue; }
      out.push({ ...m, t: Math.round(m.t * 1000) / 1000 });
    }
    return out;
  }

  // Thời điểm dưới con trỏ: x (clientX), left / width của dải.
  const timeAt = (x, left, width, dur) => (num(width) > 0 && num(dur) > 0 ? clamp((num(x) - num(left)) / +width, 0, 1) * +dur : 0);

  // Bắt dính: vạch gần t nhất trong SNAP_PX (đổi ra giây theo px / giây của dải). Trả { t, mark|null }.
  function snap(t, list, width, dur, px = SNAP_PX) {
    const D = num(dur), W = num(width);
    if (!(D > 0) || !(W > 0) || !Array.isArray(list) || !list.length) return { t, mark: null };
    const tol = px * D / W;
    let best = null, bd = Infinity;
    for (const m of list) { const d = Math.abs(m.t - t); if (d < bd) { bd = d; best = m; } }
    return best && bd <= tol ? { t: best.t, mark: best } : { t, mark: null };
  }

  // Chữ ký để biết khi nào vẽ lại ô / vạch (đổi clip, cảnh, thời lượng, bề rộng, khổ).
  const sig = (dur, width, ratio, layout, scenes) => [num(dur).toFixed(3), Math.floor(num(width)), num(ratio).toFixed(3),
    (layout || []).map(k => `${num(k.t0).toFixed(2)}-${num(k.t1).toFixed(2)}`).join(','),
    (scenes || []).map(s => (s && !s.hidden && !s.off ? num(s.t0).toFixed(2) : '')).join(',')].join('|');

  const T = { TILE_H, MAX_TILES, SNAP_PX, MERGE_S, tileW, tiles, marks, timeAt, snap, sig };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.ScrubCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
