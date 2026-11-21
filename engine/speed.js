// S29 M207: tốc độ của một clip trên track chính, hàm thuần dùng chung cho engine (xem trước = render), Studio (clips.js,
// ripple) và test Node (scripts/tests/s28_speed.test.mjs). Bản Python cùng thuật toán: scripts/speed_curve.py (mix_audio.py).
//   clip.speed        hệ số đều (mặc định 1)
//   clip.speedCurve   [{x, y}] hoặc tên preset: x = vị trí 0–1 trên đoạn nguồn [in, out] theo chiều phát, y = hệ số tốc độ
//                     (0,1–10×, nội suy theo log). Có đường cong thì bỏ qua clip.speed.
//   clip.reverse      phát ngược: srcT = out − tiến độ (đọc chuỗi khung ngược, không tạo file đảo — C40)
//   clip.hold         clip đứng hình (Freeze) dài hold giây, giữ nguyên srcT = in (= out)
// Đường cong chia đoạn nguồn thành N ô đều, mỗi ô một tốc độ (giá trị ở giữa ô): thời lượng ra = Σ (ô / tốc độ). Ánh xạ
// lt → srcT tra bảng cộng dồn + nội suy tuyến tính trong ô, nên cùng một clip luôn ra cùng khung ở mọi nơi.
(function (root) {
  'use strict';
  const N = 240, MIN = 0.1, MAX = 10;
  const P = a => a.map(([x, y]) => ({ x, y }));
  const PRESETS = {
    montage: P([[0, 1], [0.2, 3], [0.4, 0.6], [0.6, 0.6], [0.8, 3], [1, 1]]),
    hero: P([[0, 2.5], [0.35, 2.5], [0.45, 0.3], [0.55, 0.3], [0.65, 2.5], [1, 2.5]]),
    bullet: P([[0, 2], [0.3, 2], [0.4, 0.2], [0.6, 0.2], [0.7, 2], [1, 2]]),
    jump_cut: P([[0, 1], [0.4, 1], [0.45, 5], [0.55, 5], [0.6, 1], [1, 1]]),
    flash_in: P([[0, 5], [0.3, 5], [0.5, 1], [1, 1]]),
    flash_out: P([[0, 1], [0.5, 1], [0.7, 5], [1, 5]]),
  };
  const PRESET_VI = { montage: 'Montage', hero: 'Hero', bullet: 'Bullet', jump_cut: 'Jump cut', flash_in: 'Flash in', flash_out: 'Flash out' };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = v => v !== null && v !== '' && Number.isFinite(+v);

  // Điểm hợp lệ, sắp theo x, có đủ hai đầu x = 0 và x = 1; null nếu không dùng được.
  function norm(pts) {
    if (typeof pts === 'string') pts = PRESETS[pts];
    if (!Array.isArray(pts)) return null;
    const p = pts.filter(q => q && num(q.x) && num(q.y)).map(q => ({ x: clamp(+q.x, 0, 1), y: clamp(+q.y, MIN, MAX) })).sort((a, b) => a.x - b.x);
    if (!p.length) return null;
    if (p[0].x > 0) p.unshift({ x: 0, y: p[0].y });
    if (p[p.length - 1].x < 1) p.push({ x: 1, y: p[p.length - 1].y });
    return p;
  }
  function valueAt(p, u) {
    let i = 1;
    while (i < p.length - 1 && p[i].x < u) i++;
    const a = p[i - 1], b = p[i], k = b.x > a.x ? clamp((u - a.x) / (b.x - a.x), 0, 1) : 1;
    return Math.exp(Math.log(a.y) + (Math.log(b.y) - Math.log(a.y)) * k);
  }
  const CACHE = new Map();
  // cum[j] = thời lượng ra (đơn vị: độ dài đoạn nguồn) của j ô đầu; sp[j] = tốc độ ô j
  function table(p) {
    const key = JSON.stringify(p);
    let t = CACHE.get(key);
    if (t) return t;
    const cum = new Float64Array(N + 1), sp = new Float64Array(N);
    for (let j = 0; j < N; j++) { sp[j] = valueAt(p, (j + 0.5) / N); cum[j + 1] = cum[j] + 1 / N / sp[j]; }
    if (CACHE.size > 200) CACHE.clear();
    CACHE.set(key, (t = { cum, sp }));
    return t;
  }
  const span = c => Math.max(0, (c.out ?? 3) - (c.in || 0));
  const curveOf = c => (c && c.speedCurve ? norm(c.speedCurve) : null);
  const isHold = c => c && c.hold != null;
  const plain = c => !isHold(c) && !curveOf(c) && !c.reverse;

  function dur(c, fps = 30) {
    const m = 1 / (fps || 30);
    if (isHold(c)) return Math.max(m, +c.hold || 0);
    const k = curveOf(c);
    return Math.max(m, k ? span(c) * table(k).cum[N] : span(c) / (c.speed || 1));
  }
  // Tiến độ trên đoạn nguồn (giây, theo chiều phát) sau lt giây ra; quá cuối thì đi tiếp bằng tốc độ cuối (lớp dưới chuyển cảnh).
  function fwd(c, lt) {
    const k = curveOf(c);
    if (!k) return lt * (c.speed || 1);
    const S = span(c);
    if (!(S > 0)) return 0;
    const { cum, sp } = table(k), x = lt / S;
    if (x <= 0) return 0;
    if (x >= cum[N]) return S + (lt - S * cum[N]) * sp[N - 1];
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= x) lo = m; else hi = m; }
    return ((lo + (x - cum[lo]) / (cum[lo + 1] - cum[lo])) / N) * S;
  }
  function srcAt(c, lt) {
    if (isHold(c)) return c.in || 0;
    const f = fwd(c, Math.max(0, lt));
    return c.reverse ? (c.out ?? 3) - f : (c.in || 0) + f;
  }
  // Ngược của srcAt: giây ra trong clip ứng với giây nguồn s (ripple của remapAll).
  function ltAt(c, s) {
    if (isHold(c)) return 0;
    const f = c.reverse ? (c.out ?? 3) - s : s - (c.in || 0), k = curveOf(c);
    if (!k) return f / (c.speed || 1);
    const S = span(c);
    if (!(S > 0)) return 0;
    const { cum, sp } = table(k), u = f / S;
    if (u <= 0) return f / sp[0];
    if (u >= 1) return S * cum[N] + (f - S) / sp[N - 1];
    const j = Math.min(N - 1, Math.floor(u * N));
    return S * (cum[j] + (u * N - j) * (cum[j + 1] - cum[j]));
  }
  // Tốc độ tức thời tại lt (âm thanh lúc xem trước: playbackRate); 0 = đứng hình.
  function speedAt(c, lt) {
    if (isHold(c)) return 0;
    const k = curveOf(c);
    if (!k) return c.speed || 1;
    const S = span(c);
    return S > 0 ? valueAt(k, clamp(fwd(c, Math.max(0, lt)) / S, 0, 1)) : 1;
  }
  // Phần [u0, u1] (vị trí 0–1 theo chiều phát) của đường cong, kéo giãn lại về 0–1: dùng khi tách clip.
  function subCurve(pts, u0, u1) {
    const p = norm(pts);
    if (!p || !(u1 > u0)) return p;
    const out = [{ x: 0, y: valueAt(p, u0) }];
    for (const q of p) if (q.x > u0 + 1e-6 && q.x < u1 - 1e-6) out.push({ x: (q.x - u0) / (u1 - u0), y: q.y });
    out.push({ x: 1, y: valueAt(p, u1) });
    return out.map(q => ({ x: Math.round(q.x * 1e4) / 1e4, y: Math.round(q.y * 1e3) / 1e3 }));
  }
  // Nhãn ngắn cho timeline / thẻ: "2×", "Hero", "Ngược", "Đứng hình"
  function label(c) {
    if (isHold(c)) return 'Đứng hình';
    const k = typeof c.speedCurve === 'string' ? PRESET_VI[c.speedCurve] || 'Đường cong' : c.speedCurve ? 'Đường cong' : c.speed && c.speed !== 1 ? `${c.speed}×` : '';
    return [k, c.reverse ? 'Ngược' : ''].filter(Boolean).join(' · ');
  }

  const api = { N, MIN, MAX, PRESETS, PRESET_VI, norm, valueAt, dur, fwd, srcAt, ltAt, speedAt, subCurve, label, plain, span };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SpeedMap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
