// S28 M202: lõi thuần của xem thử chuyển cảnh (giao diện 79_transpeek.js). Không DOM: window.TransPeekCore / Node (s28_registry.test.mjs).
//   peekTL(tl, idx, type, dur, params) → BẢN SAO timeline với chuyển cảnh `type` (+ params, S29 M203) vào clip idx ('' = không); tl không đổi
//   span(t0, total, pad)       → { a, b }: đoạn ±pad giây quanh chỗ nối t0, kẹp trong [0, total]
//   frameT(sp, ms)             → giây cần vẽ sau ms mili giây phát lặp đoạn sp
//   durOf(clip, slider, def)   → thời lượng xem thử: của clip nếu đã có, không thì giá trị thanh trượt, không thì def
'use strict';
(function (root) {
  const PAD = 1;
  function peekTL(tl, idx, type, dur, params) {
    const o = JSON.parse(JSON.stringify(tl)), c = o.clips?.[idx];
    if (!c || idx < 1) return o;
    if (type) c.transition = { type, dur: Math.round(dur * 100) / 100, ...(params && Object.keys(params).length ? { params: JSON.parse(JSON.stringify(params)) } : {}) };
    else delete c.transition;
    return o;
  }
  function span(t0, total, pad = PAD) {
    const end = Math.max(0, total || 0), a = Math.max(0, Math.min(end, t0 - pad)), b = Math.max(a, Math.min(end, t0 + pad));
    return { a, b };
  }
  const frameT = (sp, ms) => (sp.b - sp.a > 1e-3 ? sp.a + ((ms / 1000) % (sp.b - sp.a)) : sp.a);
  function durOf(clip, slider, def = 0.4) {
    const d = clip?.transition?.dur ?? (Number.isFinite(+slider) && slider !== '' && slider != null ? +slider : def);
    return Math.min(3, Math.max(0.1, d)); // S29 M203: 0.1–3 s
  }
  const api = { PAD, peekTL, span, frameT, durOf };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TransPeekCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
