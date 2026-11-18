// S23 M161: lõi thuần của bố cục Studio (docs/plans/S23-bo-cuc-theo-kho-video.md mục 2, 4; C29, C31).
// Vào: tỉ lệ khung (rộng / cao của video), chế độ basic|pro, bề rộng cửa sổ, mức timeline đã nhớ, trạng thái gấp cột.
// Ra: vùng của từng phần — tl strip|compact|full, lib panel|flyout|none, right panel|none, controls row (luôn dòng dưới khung từ M165).
// S24 M170 (C34, C35): bỏ askPos / ghim side|bottom — Hỏi Claude là tab Claude của cột phải ở mọi khổ × chế độ; Cơ bản có cột phải
// giống Chuyên nghiệp (cùng tab, cùng gấp ], cùng luật cửa sổ hẹp), chỉ thư viện vẫn là ngăn trượt. 76_layout.js gắn kết quả lên
// body (data-tl, data-lib, data-right, …) và đặt --tlh; M162 (dải tua), M165 (hai cột) đọc qua Studio.layout. Không DOM: chạy trong trình duyệt
// (window.LayoutCore) và Node (scripts/tests/s23_layout.test.mjs). M167: khổ soạn của dự án (frameOf, C33).
'use strict';
(function (root) {
  const NARROW = 1280;      // C31: cửa sổ hẹp hơn → timeline gọn; Chuyên nghiệp tự gấp thư viện (M168)
  const TLS = ['strip', 'compact', 'full'];
  const MODES = ['basic', 'pro'];
  const TL_H = { strip: 40, compact: 120 }; // px; mức đầy đủ = chiều cao kéo tay (fullH)
  const FULL = { def: 300, min: 180, keep: 320 }; // keep: chiều cao tối thiểu chừa cho thanh trên + khung xem
  const TL_LABEL = { strip: 'Dải tua', compact: 'Gọn', full: 'Đầy đủ' };

  const normMode = v => (v === 'basic' ? 'basic' : 'pro');
  const normTl = v => (TLS.includes(v) ? v : null);
  const isNarrow = w => Number.isFinite(+w) && +w > 0 && +w < NARROW;

  // C29: mức mặc định theo chế độ; cửa sổ hẹp mặc định gọn (C31).
  const defaultTl = (mode, narrow) => (narrow ? 'compact' : normMode(mode) === 'basic' ? 'strip' : 'full');
  // Khoá localStorage (không tiền tố avs.) của mức timeline đã nhớ: theo chế độ, cửa sổ hẹp nhớ riêng một mức chung.
  const tlKey = (mode, narrow) => (narrow ? 'tl.narrow' : 'tl.' + normMode(mode));

  // o: { ratio (khổ soạn; không còn quyết định chỗ của Claude, C35), mode, width, tl (mức đã nhớ của tlKey), focus (nút ⤢: ẩn hai cột),
  //      foldLib (M165: Chuyên nghiệp gấp thư viện bằng phím [; Cơ bản thư viện là ngăn trượt nên bỏ qua),
  //      foldRight (phím ]: gấp cột phải, CẢ HAI chế độ từ M170), narrowLib ('open' | null, M168: lần mở tay thư viện khi cửa sổ hẹp) }
  function compute(o = {}) {
    const mode = normMode(o.mode), narrow = isNarrow(o.width), focus = !!o.focus;
    const autoFold = autoFoldLib(mode, o.width);
    const foldLib = mode === 'pro' && (autoFold ? o.narrowLib !== 'open' : !!o.foldLib), foldRight = !!o.foldRight;
    const tl = normTl(o.tl) || defaultTl(mode, narrow);
    let lib = mode === 'basic' ? 'flyout' : foldLib ? 'none' : 'panel';
    let right = foldRight ? 'none' : 'panel';
    if (focus) { lib = 'none'; right = 'none'; }
    const controls = 'row'; // M165: chủ repo chốt 2026-11-18 nút phát luôn một dòng dưới khung (cột dọc khó hiểu với người dựng)
    return { mode, narrow, focus, foldLib, foldRight, autoFold, tl, lib, right, controls };
  }

  // M170: phím / và nút ✦ mở tab Claude — cột phải đang ẩn thì các lệnh Studio.layout.set cần chạy trước ([[k, v], …]).
  const revealRight = st => [...(st?.focus ? [['focus', false]] : []), ...(st?.foldRight ? [['foldRight', false]] : [])];
  // Phím trần / (không ⌘ / Ctrl / ⌥) → mở tab Claude. k = { key, mod, alt }.
  const askKey = k => !k.mod && !k.alt && k.key === '/';

  // M168: Chuyên nghiệp, cửa sổ < 1280 px → thư viện tự gấp (như phím [): 312 + 340 px hai cột để khung 16:9 còn 264×149 ở 1024.
  // Mở tay (phím [, bấm nút thanh trái) nhớ ở narrowLib = 'open', không tự gấp lại cho tới khi bề rộng qua ngưỡng (76_layout.js xoá).
  // Trạng thái gấp của cửa sổ rộng (foldLib, avs.col.lib) giữ riêng, không bị lần tự gấp ghi đè.
  const autoFoldLib = (mode, width) => normMode(mode) === 'pro' && isNarrow(width);
  // Gấp / mở thư viện (v = muốn gấp) ghi vào khoá nào: cửa sổ hẹp → col.libNarrow, rộng → col.lib (M165). Giá trị null = xoá khoá.
  const foldStore = (autoFold, v) => (autoFold ? { key: 'col.libNarrow', val: v ? null : 'open' } : { key: 'col.lib', val: v ? 'off' : null });

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

  const T = { NARROW, TLS, MODES, TL_H, FULL, TL_LABEL, normMode, normTl, isNarrow,
    defaultTl, tlKey, compute, revealRight, askKey, toggleFold, foldKey, flyoutClick, tlHeight, clampFull, maxFull, snap, cycle,
    CREATE_ASPECTS, createAspect, frameOf, autoFoldLib, foldStore };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.LayoutCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
