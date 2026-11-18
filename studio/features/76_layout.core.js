// S23 M161: lõi thuần của bố cục Studio (docs/plans/S23-bo-cuc-theo-kho-video.md mục 2, 4; C29, C31).
// Vào: tỉ lệ khung (rộng / cao của video), chế độ basic|pro, bề rộng cửa sổ, kiểu ghim (auto|side|bottom), mức timeline đã nhớ.
// Ra: vùng của từng phần — askPos side|bottom (Hỏi Claude cạnh / dưới khung), tl strip|compact|full, lib panel|flyout|none,
// right panel|claude|none, controls row (luôn dòng dưới khung từ M165). 76_layout.js gắn kết quả lên body (data-ask, data-tl, …) và đặt --tlh;
// M162 (dải tua), M163 (Claude cạnh khung), M165 (hai cột) đọc qua Studio.layout. Không DOM: chạy trong trình duyệt
// (window.LayoutCore) và Node (scripts/tests/s23_layout.test.mjs). M167: khổ soạn của dự án (frameOf, C33).
'use strict';
(function (root) {
  const SIDE_RATIO = 0.8;   // C31: tỉ lệ khung < 0,8 (dọc, 4:5 trở xuống) → Claude cạnh khung
  const NARROW = 1280;      // C31: cửa sổ hẹp hơn → luôn Claude dưới khung, timeline gọn
  const TLS = ['strip', 'compact', 'full'];
  const PINS = ['auto', 'side', 'bottom'];
  const MODES = ['basic', 'pro'];
  const TL_H = { strip: 40, compact: 120 }; // px; mức đầy đủ = chiều cao kéo tay (fullH)
  const FULL = { def: 300, min: 180, keep: 320 }; // keep: chiều cao tối thiểu chừa cho thanh trên + khung xem
  const PIN_LABEL = { auto: 'Tự động', side: 'Claude cạnh khung', bottom: 'Claude dưới khung' };
  const TL_LABEL = { strip: 'Dải tua', compact: 'Gọn', full: 'Đầy đủ' };

  const normMode = v => (v === 'basic' ? 'basic' : 'pro');
  const normPin = v => (PINS.includes(v) ? v : 'auto');
  const normTl = v => (TLS.includes(v) ? v : null);
  const isNarrow = w => Number.isFinite(+w) && +w > 0 && +w < NARROW;

  // C29: mức mặc định theo chế độ; cửa sổ hẹp mặc định gọn (C31).
  const defaultTl = (mode, narrow) => (narrow ? 'compact' : normMode(mode) === 'basic' ? 'strip' : 'full');
  // Khoá localStorage (không tiền tố avs.) của mức timeline đã nhớ: theo chế độ, cửa sổ hẹp nhớ riêng một mức chung.
  const tlKey = (mode, narrow) => (narrow ? 'tl.narrow' : 'tl.' + normMode(mode));

  function askPos(ratio, width, pin) {
    if (isNarrow(width)) return 'bottom';
    const p = normPin(pin);
    if (p !== 'auto') return p;
    const r = +ratio;
    return Number.isFinite(r) && r > 0 && r < SIDE_RATIO ? 'side' : 'bottom';
  }

  // o: { ratio, mode, width, pin, tl (mức đã nhớ của tlKey), focus (nút ⤢: ẩn hai cột),
  //      foldLib / foldRight (M165: Chuyên nghiệp gấp thư viện bằng phím [, cột phải bằng ]; Cơ bản bỏ qua) }
  function compute(o = {}) {
    const mode = normMode(o.mode), narrow = isNarrow(o.width), pin = normPin(o.pin), focus = !!o.focus;
    const foldLib = mode === 'pro' && !!o.foldLib, foldRight = mode === 'pro' && !!o.foldRight;
    const ask = askPos(o.ratio, o.width, pin);
    const tl = normTl(o.tl) || defaultTl(mode, narrow);
    let lib = mode === 'basic' ? 'flyout' : foldLib ? 'none' : 'panel';
    let right = mode === 'pro' ? (foldRight ? 'none' : 'panel') : ask === 'side' ? 'claude' : 'none';
    if (focus) { lib = 'none'; if (right === 'panel') right = 'none'; }
    const controls = 'row'; // M165: chủ repo chốt 2026-11-18 nút phát luôn một dòng dưới khung (cột dọc khó hiểu với người dựng)
    return { mode, narrow, pin, focus, foldLib, foldRight, askPos: ask, tl, lib, right, controls };
  }

  // M165, phím [ / ]: đảo trạng thái gấp của một cột. st = { foldLib, foldRight }; which 'lib' | 'right'.
  const toggleFold = (st, which) => (which === 'lib' ? { ...st, foldLib: !st?.foldLib } : which === 'right' ? { ...st, foldRight: !st?.foldRight } : { ...st });
  // Phím trần [ / ] (không ⌘ / Ctrl / ⌥: mod+[ ] là đưa lớp xuống / lên, 67_keys.core.js) → cột cần gấp. k = { code, key, mod, alt }.
  const foldKey = k => (k.mod || k.alt ? null : k.code === 'BracketLeft' || k.key === '[' ? 'lib' : k.code === 'BracketRight' || k.key === ']' ? 'right' : null);
  // Ngăn trượt thư viện ở Cơ bản: bấm một nút thanh trái → mở (đang đóng, hoặc đổi panel) / đóng (bấm lại đúng panel đang mở).
  const flyoutClick = (open, wasCur) => !(open && wasCur);

  const maxFull = innerH => Math.max(FULL.min, (+innerH || 900) - FULL.keep);
  const clampFull = (h, innerH) => Math.round(Math.min(maxFull(innerH), Math.max(FULL.min, +h || FULL.def)));
  // Chiều cao (px) của timeline ở một mức.
  const tlHeight = (tl, fullH, innerH) => (tl === 'strip' || tl === 'compact' ? TL_H[tl] : clampFull(fullH, innerH));

  // Thả mép trên sau khi kéo: bắt về mức gần nhất. Dưới giữa dải tua và gọn → dải tua; dưới giữa gọn và đầy đủ tối thiểu → gọn;
  // còn lại đầy đủ với chiều cao vừa kéo (kẹp trong [min, cửa sổ − keep]).
  function snap(h, innerH) {
    const v = +h || 0;
    if (v < (TL_H.strip + TL_H.compact) / 2) return { tl: 'strip', h: TL_H.strip };
    if (v < (TL_H.compact + FULL.min) / 2) return { tl: 'compact', h: TL_H.compact };
    return { tl: 'full', h: clampFull(v, innerH) };
  }

  // Phím `: dải tua → gọn → đầy đủ → dải tua (Shift: chiều ngược).
  const cycle = (tl, back = false) => TLS[(TLS.indexOf(normTl(tl) || 'full') + (back ? TLS.length - 1 : 1)) % TLS.length];

  // M167 (C33): Studio chỉ soạn hai khổ, 9:16 và 16:9. Khổ vuông (và khổ lạ như 4:5) chỉ là bản xuất thêm (Xuất thêm khổ).
  const CREATE_ASPECTS = ['9:16', '16:9'];
  // Khổ khi tạo dự án (onboarding, template, làm hàng loạt): 16:9 giữ, mọi khổ khác (1:1, 4:5, rỗng) → 9:16.
  const createAspect = v => (v === '16:9' ? '16:9' : '9:16');
  const even = n => 2 * Math.round(n / 2);
  // Khổ soạn của một dự án theo timeline.width / height. Luật: rộng > cao → 16:9, còn lại (kể cả vuông) → 9:16.
  // legacy: tỉ lệ thật không phải 9:16 / 16:9 (dự án 1:1 cũ) → 76_layout.js hiện dải báo trên khung; to = cỡ khi đổi sang khổ soạn.
  function frameOf(w, h) {
    const W = +w > 0 ? +w : 1080, H = +h > 0 ? +h : 1920, r = W / H, land = W > H;
    const aspect = land ? '16:9' : '9:16', ratio = land ? 16 / 9 : 9 / 16;
    const legacy = Math.abs(r - ratio) / ratio > 0.02;
    const source = !legacy ? aspect : Math.abs(r - 1) < 0.02 ? '1:1' : `${W}×${H}`;
    const to = !legacy ? null : land ? { width: even(H * 16 / 9), height: H } : { width: W, height: even(W * 16 / 9) };
    return { aspect, ratio, legacy, source, to };
  }

  const T = { SIDE_RATIO, NARROW, TLS, PINS, MODES, TL_H, FULL, PIN_LABEL, TL_LABEL, normMode, normPin, normTl, isNarrow,
    defaultTl, tlKey, askPos, compute, toggleFold, foldKey, flyoutClick, tlHeight, clampFull, maxFull, snap, cycle,
    CREATE_ASPECTS, createAspect, frameOf };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.LayoutCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
