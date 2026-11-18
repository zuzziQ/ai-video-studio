// S21 M150: lõi thuần của ghi chú ghim trên khung (kiểu bình luận trên canvas của Claude Design). Không DOM: 73_pins.js gọi các
// hàm ở đây để gom mọi ghi chú (ghi chú trên element + ghim chung), đánh số theo thời điểm và chọn ghim hiện ở playhead.
// Chạy trong trình duyệt (window.PinsCore) và trong Node (scripts/tests/s21_pins.test.mjs).
//   Ghim trên element: obj.note (như cũ) + obj.note_at = {x, y, t, done?} (px thiết kế, giây).
//   Ghim chung (cả video): TL.pins = [{x, y, t, text, done?}].
// S24 M173 (C37): ghim thành chú thích "Để sau" của chế độ chú thích. Chú thích vùng = ghim chung có thêm w, h (px thiết kế):
//   TL.pins = [{x, y, w, h, t, text, done?}] — notes.md vẫn ghi như ghim (writeNotes của server.mjs, x / y là góc trên-trái).
//   dragRect(a, b) → vùng kéo trên khung hoặc null khi kéo quá ngắn (= bấm).
'use strict';
(function (root) {
  const WIN = 0.5; // ghim hiện khi playhead trong ±WIN giây của t (ghim element: thêm cả khoảng hiện của element)
  const KINDS = new Set(['scene', 'line', 'node', 'badge', 'cap', 'sfx', 'music', 'clip']);
  const txt = v => (typeof v === 'string' ? v.trim() : '');
  const num = v => (Number.isFinite(+v) ? +v : null);

  // Gom danh sách ghi chú. comps: [{cid, kind, t0, t1, label, obj}] (Studio.comps); pins: TL.pins.
  // Trả [{n, key, kind:'el'|'pin', t, x, y, text, done, cid?, idx?, t0, t1, label}] sắp theo t (cùng t: element trước), n từ 1.
  function collect(comps, pins) {
    const out = [];
    for (const c of comps || []) {
      const o = c && c.obj; if (!o || !KINDS.has(c.kind) || !txt(o.note)) continue;
      const at = o.note_at && typeof o.note_at === 'object' ? o.note_at : null;
      const x = at ? num(at.x) : null, y = at ? num(at.y) : null;
      out.push({ kind: 'el', key: 'e:' + (o.cid || c.cid), cid: o.cid || c.cid, t: num(at?.t) ?? num(c.t0) ?? 0, x, y, text: txt(o.note), done: !!at?.done,
        t0: num(c.t0) ?? 0, t1: num(c.t1) ?? 0, label: String(c.label || '') });
    }
    (Array.isArray(pins) ? pins : []).forEach((p, idx) => {
      if (!p || !txt(p.text)) return;
      const t = num(p.t) ?? 0;
      const w = num(p.w), h = num(p.h), rect = w > 0 && h > 0;
      out.push({ kind: 'pin', key: 'p:' + idx, idx, t, x: num(p.x), y: num(p.y), ...(rect ? { w, h } : {}), text: txt(p.text), done: !!p.done, t0: t, t1: t,
        label: rect ? `Vùng ${Math.round(w)}×${Math.round(h)}` : 'Cả video' });
    });
    out.sort((a, b) => a.t - b.t || (a.kind === b.kind ? 0 : a.kind === 'el' ? -1 : 1));
    out.forEach((it, i) => { it.n = i + 1; });
    return out;
  }

  // Ghim (có toạ độ) hiện ở thời điểm T.
  const showAt = (it, T, win = WIN) => it.x != null && it.y != null &&
    (Math.abs(T - it.t) <= win + 1e-6 || (it.kind === 'el' && T >= it.t0 - 1e-6 && T < it.t1));
  const visibleAt = (items, T, win = WIN) => (items || []).filter(it => showAt(it, T, win));

  // Điểm bấm → toạ độ ghim trong khung (px thiết kế, làm tròn).
  const clampPt = (x, y, DW, DH) => ({ x: Math.round(Math.max(0, Math.min(DW, +x || 0))), y: Math.round(Math.max(0, Math.min(DH, +y || 0))) });

  // Ghim gắn với element dưới điểm bấm hay cả video: clip chính, âm thanh, không có gì → cả video.
  const attachTo = c => (c && c.obj && ['scene', 'line', 'node', 'badge', 'cap'].includes(c.kind) ? c : null);

  // Chỗ vẽ ghim element: điểm ghim nếu còn trong hộp element (rect px thiết kế, nới PAD), không thì góc trên-phải của hộp
  // (element đã bị kéo / đổi cỡ sau khi ghim). Không có hộp (element chưa hiện) → điểm ghim.
  const PAD = 12;
  function anchor(it, rect) {
    if (!rect || !(rect.w > 0) || !(rect.h > 0) || it.x == null || it.y == null) return { x: it.x, y: it.y };
    const inside = it.x >= rect.x - PAD && it.x <= rect.x + rect.w + PAD && it.y >= rect.y - PAD && it.y <= rect.y + rect.h + PAD;
    return inside ? { x: it.x, y: it.y } : { x: Math.round(rect.x + rect.w), y: Math.round(rect.y) };
  }

  // Chữ ký để vẽ lại khi có đổi (danh sách ở tab Dự án, lớp ghim trên khung).
  const sig = items => (items || []).map(i => [i.key, i.n, i.t, i.x, i.y, i.w, i.h, i.done ? 1 : 0, i.text].join('|')).join('\n');

  // Kéo trên khung (px thiết kế): a, b = điểm đầu / cuối. Ngắn hơn DRAG px theo một chiều = bấm (null); kẹp trong khung DW×DH.
  const DRAG = 12;
  function dragRect(a, b, DW, DH) {
    if (!a || !b) return null;
    const p = clampPt(a.x, a.y, DW, DH), q = clampPt(b.x, b.y, DW, DH);
    const w = Math.abs(q.x - p.x), h = Math.abs(q.y - p.y);
    if (w < DRAG || h < DRAG) return null;
    return { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w, h };
  }

  const mmss = t => { t = Math.max(0, +t || 0); return `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`; };

  const P = { WIN, DRAG, collect, showAt, visibleAt, clampPt, attachTo, anchor, dragRect, sig, mmss };
  if (typeof module === 'object' && module.exports) module.exports = P;
  else root.PinsCore = P;
})(typeof window !== 'undefined' ? window : globalThis);
