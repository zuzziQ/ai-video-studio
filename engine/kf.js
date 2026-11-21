// S29 M209: keyframe mở rộng — hàm thuần theo t, dùng chung engine (xem trước = render), Studio (60_keyframes, 85_kfprops) và test Node
// (scripts/tests/s29_keyframe.test.mjs). Bản Python của đường bao âm lượng: scripts/kf_env.py (mix_audio.py), cùng easing.
//   clip.kf  = [{t, …thuộc tính, ease?, bz?}]  t = giây tính từ đầu clip trên timeline (clip dời / ripple thì keyframe đi theo).
//   music.kf = [{t, gain (dB), ease?}]          t = giây tính từ t0 của khối nhạc.
// Mỗi key chỉ cần thuộc tính được đặt (hình thoi theo từng thuộc tính): thuộc tính p nội suy giữa các key CÓ p, trước key đầu / sau key
// cuối giữ giá trị mép. ease = đường cong của đoạn RỜI key đó (7 easing cũ + 5 preset bezier); bz = [x1, y1, x2, y2] tự chọn thắng ease.
// Cảnh / dòng chữ (scene.kf, line.kf) vẫn đi engine.js kfAt như cũ (thiếu thuộc tính = mặc định), chỉ thêm easing mới.
(function (root) {
  'use strict';
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const EPS = 0.5 / 30;

  // cubic-bezier(x1, y1, x2, y2) như CSS: Newton rồi chia đôi, trả y theo x = k
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = u => ((ax * u + bx) * u + cx) * u, sy = u => ((ay * u + by) * u + cy) * u, dx = u => (3 * ax * u + 2 * bx) * u + cx;
    return k => {
      if (!(k > 0)) return 0;
      if (k >= 1) return 1;
      let u = k;
      for (let i = 0; i < 8; i++) {
        const e = sx(u) - k;
        if (Math.abs(e) < 1e-7) return sy(u);
        const d = dx(u);
        if (Math.abs(d) < 1e-6) break;
        u -= e / d;
      }
      let lo = 0, hi = 1; u = k;
      for (let i = 0; i < 40; i++) { const x = sx(u); if (Math.abs(x - k) < 1e-7) break; if (x < k) lo = u; else hi = u; u = (lo + hi) / 2; }
      return sy(u);
    };
  }
  // 7 easing cũ: chép đúng công thức của engine.js (E + KF_EASE), để clip / nhạc dùng cùng nghĩa
  const outBack = (k, s) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2);
  const OLD = {
    linear: k => k, in: k => k * k * k, out: k => 1 - Math.pow(1 - k, 3), inOut: k => -(Math.cos(Math.PI * k) - 1) / 2,
    back: k => outBack(k, 1.7), hold: () => 0,
    bounce: k => { const n = 7.5625, d = 2.75; return k < 1 / d ? n * k * k : k < 2 / d ? n * (k -= 1.5 / d) * k + .75 : k < 2.5 / d ? n * (k -= 2.25 / d) * k + .9375 : n * (k -= 2.625 / d) * k + .984375; },
  };
  // preset bezier mới (tên không trùng tên cũ): ease vào / ra / cả hai, nảy (vượt rồi về), đàn hồi (dao động tắt dần)
  const BZ = { easeIn: [0.42, 0, 1, 1], easeOut: [0, 0, 0.58, 1], easeInOut: [0.42, 0, 0.58, 1], overshoot: [0.34, 1.56, 0.64, 1] };
  const NEW = Object.fromEntries(Object.entries(BZ).map(([k, v]) => [k, bezier(...v)]));
  NEW.elastic = k => (k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI) / 3) + 1);
  const EASE = { ...OLD, ...NEW };
  const EASE_VI = [['linear', 'Đều'], ['inOut', 'Mượt'], ['in', 'Nhanh dần'], ['out', 'Chậm dần'], ['back', 'Nảy quá'], ['bounce', 'Nảy bóng'], ['hold', 'Giữ (nhảy)'],
    ['easeIn', 'Ease vào'], ['easeOut', 'Ease ra'], ['easeInOut', 'Ease cả hai'], ['overshoot', 'Nảy (bezier)'], ['elastic', 'Đàn hồi']];
  const easeOf = k => (Array.isArray(k?.bz) && k.bz.length === 4 && k.bz.every(Number.isFinite) ? bezier(...k.bz) : EASE[k?.ease] || EASE.linear);

  // ---- bảng thuộc tính keyframe được (Studio vẽ nút thoi, Claude đọc tên) ----
  // g: nhóm; base(o) = giá trị tĩnh khi thuộc tính chưa có key (Studio tạo key đầu từ đây)
  const P = (g, label, min, max, step, def, unit, base) => ({ g, label, min, max, step, def, unit, base: base || (() => def) });
  const PROPS = {
    x: P('tr', 'Dời X', -1280, 1280, 1, 0, 'px'), y: P('tr', 'Dời Y', -1280, 1280, 1, 0, 'px'),
    scale: P('tr', 'Tỉ lệ', 0.1, 4, 0.01, 1, '×'), rot: P('tr', 'Xoay', -360, 360, 1, 0, '°'), opacity: P('tr', 'Độ mờ', 0, 1, 0.01, 1, ''),
    mask_x: P('mask', 'Mặt nạ: tâm X', 0, 100, 0.5, 50, '%', o => o.mask?.x ?? 50), mask_y: P('mask', 'Mặt nạ: tâm Y', 0, 100, 0.5, 50, '%', o => o.mask?.y ?? 50),
    mask_w: P('mask', 'Mặt nạ: rộng', 5, 200, 0.5, 80, '%', o => o.mask?.w ?? 80), mask_h: P('mask', 'Mặt nạ: cao', 5, 200, 0.5, 60, '%', o => o.mask?.h ?? 60),
    mask_feather: P('mask', 'Mặt nạ: viền mềm', 0, 20, 0.5, 0, '', o => o.mask?.feather ?? 0),
    strength: P('color', 'Cường độ bộ lọc', 0, 100, 1, 100, '%', o => o.filter?.strength ?? 100),
    volume: P('audio', 'Âm lượng clip', 0, 2, 0.01, 1, '×', o => o.volume ?? 1),
    gain: P('audio', 'Âm lượng nhạc', -40, 12, 1, -16, 'dB', o => o.gain ?? -16),
  };
  // Adjust của M208 (engine/fx_registry.js FX.ADJ): đọc lười, fx_registry.js nạp trước file này nhưng Node cần require
  let ADJ0 = null;
  const ADJ = () => ADJ0 || (ADJ0 = (root.FX || (typeof require === 'function' ? require('./fx_registry.js') : null))?.ADJ || []);
  function prop(p) {
    if (PROPS[p]) return PROPS[p];
    const a = ADJ().find(x => x.id === p);
    return a ? (PROPS[p] = P('color', a.label, a.min, a.max, a.step, a.def, a.unit, o => o.filter?.[p] ?? a.def)) : null;
  }
  const propsOf = g => [...Object.keys(PROPS), ...ADJ().map(a => a.id)].filter(p => prop(p) && (!g || prop(p).g === g));
  const TR = ['x', 'y', 'scale', 'rot', 'opacity'];

  // ---- nội suy ----
  const has = (kf, p) => Array.isArray(kf) && kf.some(k => k && k[p] != null && Number.isFinite(+k[p]));
  const keysOf = (kf, p) => (Array.isArray(kf) ? kf.filter(k => k && k[p] != null && Number.isFinite(+k[p]) && Number.isFinite(+k.t)).sort((a, b) => a.t - b.t) : []);
  // giá trị của p tại t, null khi không key nào có p
  function valueAt(kf, p, t) {
    const ks = keysOf(kf, p);
    if (!ks.length) return null;
    const i = ks.findIndex(k => k.t > t);
    if (i === 0 || i < 0) return +ks[i === 0 ? 0 : ks.length - 1][p];
    const a = ks[i - 1], b = ks[i], e = easeOf(a)(clamp((t - a.t) / Math.max(1e-6, b.t - a.t)));
    return +a[p] + (+b[p] - +a[p]) * e;
  }
  // clip tại lt (giây trong clip): c = bản sao có mask / filter theo key; tr = biến đổi (null khi không key biến đổi); own = thuộc tính biến đổi có key
  function clipAt(c, lt) {
    const kf = c?.kf;
    if (!Array.isArray(kf) || !kf.length) return { c, tr: null, own: null };
    const v = p => valueAt(kf, p, lt);
    const own = new Set(TR.filter(p => has(kf, p)));
    const tr = own.size ? { x: v('x') ?? 0, y: v('y') ?? 0, scale: v('scale') ?? 1, rot: v('rot') ?? 0, opacity: v('opacity') ?? 1 } : null;
    let out = c;
    if (c.mask && ['mask_x', 'mask_y', 'mask_w', 'mask_h', 'mask_feather'].some(p => has(kf, p))) {
      const m = { ...c.mask };
      for (const p of ['x', 'y', 'w', 'h', 'feather']) { const x = v('mask_' + p); if (x != null) m[p] = +x.toFixed(3); }
      out = { ...out, mask: m };
    }
    const cps = propsOf('color').filter(p => has(kf, p));
    if (cps.length) {
      const f = { ...(c.filter || {}) };
      for (const p of cps) { if (p === 'strength' && !f.preset) continue; const x = v(p); f[p] = +x.toFixed(4); }
      out = { ...out, filter: f };
    }
    return { c: out, tr, own: own.size ? own : null };
  }

  // ---- sửa key (Studio, Claude): thuần trên đối tượng o (clip / nhạc) ----
  const r4 = v => Math.round(v * 1e4) / 1e4;
  const keyAt = (o, t) => (o.kf || []).find(k => Math.abs(k.t - t) < EPS) || null;
  function setKey(o, p, t, v, ease) {
    const d = prop(p); if (!d || !Number.isFinite(+v) || !Number.isFinite(+t)) return null;
    o.kf = Array.isArray(o.kf) ? o.kf : [];
    let k = keyAt(o, t);
    if (!k) {
      const prev = keysOf(o.kf, p).filter(x => x.t < t).pop();
      k = { t: Math.max(0, Math.round(t * 100) / 100), ease: prev?.ease || 'inOut' };
      o.kf.push(k); o.kf.sort((a, b) => a.t - b.t);
    }
    k[p] = r4(clamp(+v, d.min, d.max));
    if (ease && EASE[ease]) k.ease = ease;
    return k;
  }
  // bỏ p khỏi key tại t; key không còn thuộc tính nào thì xoá; hết key thì xoá o.kf
  function delKey(o, p, t) {
    const k = keyAt(o, t); if (!k || k[p] == null) return false;
    delete k[p];
    tidy(o);
    return true;
  }
  const isData = n => n !== 't' && n !== 'ease' && n !== 'bz';
  function tidy(o) {
    if (!Array.isArray(o.kf)) return;
    o.kf = o.kf.filter(k => Object.keys(k).some(isData));
    if (!o.kf.length) delete o.kf;
  }
  function clearProp(o, p) { for (const k of o.kf || []) delete k[p]; tidy(o); }
  // Claude: p chạy from → to trong [a, b] giây của clip (thay mọi key cũ của p)
  function ramp(o, p, from, to, a, b, ease = 'inOut') {
    if (!prop(p) || !Number.isFinite(+from) || !Number.isFinite(+to)) return false;
    a = Math.max(0, +a || 0); b = Math.max(a + 0.1, +b || a + 1);
    clearProp(o, p);
    setKey(o, p, a, from, EASE[ease] ? ease : 'inOut');
    setKey(o, p, b, to);
    return true;
  }
  // tách clip tại d giây (ripple split): phần sau nhận key dời về 0, mỗi thuộc tính có giá trị tại điểm cắt ở hai bên
  function split(kf, d) {
    if (!Array.isArray(kf) || !kf.length) return [kf, kf];
    const ps = [...new Set(kf.flatMap(k => Object.keys(k).filter(isData)))];
    const A = { kf: kf.filter(k => k.t < d - EPS).map(k => ({ ...k })) }, B = { kf: kf.filter(k => k.t > d + EPS).map(k => ({ ...k, t: r4(k.t - d) })) };
    // key mới ở điểm cắt của phần sau mang ease của đoạn đang chạy (tuyến tính giữ nguyên chuyển động; đường cong khác thì gần đúng)
    for (const p of ps) { const v = valueAt(kf, p, d), e = keysOf(kf, p).filter(k => k.t <= d).pop()?.ease; setKey(A, p, d, v); setKey(B, p, 0, v, e); }
    return [A.kf, B.kf];
  }

  const api = { EPS, EASE, EASE_VI, BZ, bezier, easeOf, PROPS, TR, prop, propsOf, has, keysOf, valueAt, clipAt, keyAt, setKey, delKey, clearProp, ramp, split, tidy };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KF = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
