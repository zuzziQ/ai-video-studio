// S28 M202: registry hiệu ứng chung — nguồn DUY NHẤT cho chuyển cảnh, hoạt ảnh chữ (vào) và bộ lọc màu (LUT).
// Chạy ở ba nơi, không DOM:
//   - engine (engine/index.html nạp trước mọi module): window.FX; engine.js lấy TRANS / LUT từ đây
//   - Studio (studio/index.html nạp /engine/fx_registry.js trước clips.js): TRANS_TYPES, FILTERS, LUT_CSS, ANIM_LIST
//   - Node (require): scripts/tests/s28_registry.test.mjs, studio/features/75_ask.core.js (prompt Claude), scripts/fx_doc.mjs
// Mỗi mục: { id, label (nhãn Việt), group, icon (Tabler), params: { tên: { t: 'num'|'enum', min, max, def, values } },
//            fn, ai: { mood, nhip, khi_nao, tranh } } — `ai` là mô tả cho Claude chọn theo nội dung câu nói, không chọn bừa.
//   chuyển cảnh: fn(k, params) → [inStyle, outStyle] (k 0→1 trong đoạn chuyển; in = clip mới, out = clip trước chạy dưới nền);
//                overlay(k) → HTML phủ lên trên (chỉ flash). Hàm thuần: cùng k cho cùng chuỗi (glitch dùng rnd tất định).
//   LUT: css = chuỗi CSS filter; fn(k, params) → css (k chưa dùng, để M208 làm cường độ).
//   hoạt ảnh chữ: chỉ dữ liệu (nhãn, nhóm, mô tả); hình vẫn vẽ ở engine/vertical.js textLine (M205 sẽ gom vào đây).
// Thêm một loại = thêm một mục ở đây; danh sách của Studio, prompt Claude và bảng references/clips.md (node scripts/fx_doc.mjs) đọc từ đó.
'use strict';
(function (root) {
  // Bản sao đúng công thức của engine/engine.js (E, lerp) và engine/modules.js (rnd): file này nạp trước nên không dùng chung được.
  const lerp = (a, b, k) => a + (b - a) * k;
  const rnd = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const E = {
    inCubic: k => k * k * k,
    outCubic: k => 1 - Math.pow(1 - k, 3),
    outExpo: k => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    inOutSine: k => -(Math.cos(Math.PI * k) - 1) / 2,
  };
  const DUR = { t: 'num', min: 0.1, max: 1.5, def: 0.4 };

  const GROUPS = {
    trans: [['basic', 'Cơ bản'], ['slide', 'Trượt'], ['camera', 'Camera'], ['light', 'Ánh sáng'], ['mask', 'Mặt nạ'], ['distort', 'Nhiễu']],
    text_in: [['basic', 'Cơ bản'], ['move', 'Chuyển động'], ['letter', 'Từng chữ']],
    lut: [['tone', 'Tông màu'], ['mood', 'Không khí']],
  };

  const TRANS = [
    { id: 'fade', label: 'Mờ dần', group: 'basic', icon: 'ti-blur', params: { dur: DUR },
      fn: k => [`opacity:${k}`, ''],
      ai: { mood: 'nhẹ, trung tính', nhip: 'chậm–vừa', khi_nao: 'đổi ý trong cùng mạch kể, chuyển giữa hai đoạn nói', tranh: 'video bán hàng nhịp nhanh, cần cú đấm' } },
    { id: 'dissolve', label: 'Hoà tan', group: 'basic', icon: 'ti-droplet-half-2', params: { dur: DUR },
      fn: k => [`opacity:${k}`, ''],
      ai: { mood: 'mềm, cảm xúc, hoài niệm', nhip: 'chậm', khi_nao: 'cảnh đẹp, kể chuyện, trước/sau theo thời gian', tranh: 'nội dung tin tức, hướng dẫn cần rõ ràng' } },
    { id: 'slide_l', label: 'Trượt trái', group: 'slide', icon: 'ti-arrow-big-left-lines', params: { dur: DUR },
      fn: k => [`transform:translateX(${((1 - E.outCubic(k)) * 100).toFixed(2)}%)`, ''],
      ai: { mood: 'gọn, tiến tới', nhip: 'vừa', khi_nao: 'sang ý tiếp theo, bước kế trong danh sách', tranh: 'dùng liên tục mọi chỗ nối (đơn điệu)' } },
    { id: 'slide_r', label: 'Trượt phải', group: 'slide', icon: 'ti-arrow-big-right-lines', params: { dur: DUR },
      fn: k => [`transform:translateX(${(-(1 - E.outCubic(k)) * 100).toFixed(2)}%)`, ''],
      ai: { mood: 'gọn, quay lại', nhip: 'vừa', khi_nao: 'nhắc lại ý trước, so sánh ngược', tranh: 'dùng liên tục mọi chỗ nối (đơn điệu)' } },
    { id: 'slide_up', label: 'Trượt lên', group: 'slide', icon: 'ti-arrow-big-up-lines', params: { dur: DUR },
      fn: k => [`transform:translateY(${((1 - E.outCubic(k)) * 100).toFixed(2)}%)`, ''],
      ai: { mood: 'hướng lên, tích cực', nhip: 'vừa–nhanh', khi_nao: 'kết quả, con số tăng, video dọc kiểu lướt feed', tranh: 'tin buồn, nội dung trầm' } },
    { id: 'push', label: 'Đẩy', group: 'slide', icon: 'ti-arrows-right', params: { dur: DUR },
      fn: k => [`transform:translateX(${((1 - E.inOutSine(k)) * 100).toFixed(2)}%)`, `transform:translateX(${(-E.inOutSine(k) * 100).toFixed(2)}%)`],
      ai: { mood: 'liền mạch, chuyên nghiệp', nhip: 'vừa', khi_nao: 'chuyển địa điểm, sản phẩm này sang sản phẩm khác', tranh: 'hai clip gần giống nhau (trông như giật)' } },
    { id: 'zoom', label: 'Phóng vào', group: 'camera', icon: 'ti-zoom-in', params: { dur: DUR },
      fn: k => [`opacity:${k};transform:scale(${lerp(1.35, 1, E.outCubic(k)).toFixed(3)})`, `transform:scale(${lerp(1, .85, k).toFixed(3)})`],
      ai: { mood: 'mạnh, nhấn, hào hứng', nhip: 'nhanh', khi_nao: 'câu hook, tiết lộ, chi tiết sản phẩm, nhịp mạnh của nhạc', tranh: 'đặt dày đặc; nội dung trang trọng' } },
    { id: 'zoom_out', label: 'Thu ra', group: 'camera', icon: 'ti-zoom-out', params: { dur: DUR },
      fn: k => [`opacity:${k};transform:scale(${lerp(.7, 1, E.outCubic(k)).toFixed(3)})`, `transform:scale(${lerp(1, 1.25, k).toFixed(3)})`],
      ai: { mood: 'mở rộng, toàn cảnh', nhip: 'vừa', khi_nao: 'từ chi tiết ra toàn cảnh, tổng kết, cảnh BĐS rộng', tranh: 'đầu video (mất hook)' } },
    { id: 'blur', label: 'Nhoè', group: 'light', icon: 'ti-blur-off', params: { dur: DUR },
      fn: k => [`opacity:${k};filter:blur(${((1 - k) * 22).toFixed(1)}px)`, `filter:blur(${(k * 22).toFixed(1)}px)`],
      ai: { mood: 'mơ màng, chuyển trạng thái', nhip: 'chậm–vừa', khi_nao: 'hồi tưởng, chuyển sang suy nghĩ, cảnh sang trọng', tranh: 'video hướng dẫn cần đọc chữ trên màn' } },
    { id: 'whip', label: 'Lia nhanh', group: 'slide', icon: 'ti-wind', params: { dur: DUR },
      fn: k => [`transform:translateX(${((1 - E.outExpo(k)) * 110).toFixed(2)}%);filter:blur(${((1 - k) * 26).toFixed(1)}px)`, `transform:translateX(${(-E.inCubic(k) * 110).toFixed(2)}%);filter:blur(${(k * 26).toFixed(1)}px)`],
      ai: { mood: 'năng lượng, trẻ, vlog', nhip: 'nhanh', khi_nao: 'đổi cảnh dồn dập, montage, đúng nhịp mạnh', tranh: 'nội dung chậm, tâm sự; dur dài (> 0.5 s)' } },
    { id: 'spin', label: 'Xoay', group: 'camera', icon: 'ti-rotate-clockwise-2', params: { dur: DUR },
      fn: k => [`opacity:${k};transform:rotate(${((1 - E.outCubic(k)) * -25).toFixed(1)}deg) scale(${lerp(1.4, 1, E.outCubic(k)).toFixed(3)})`, ''],
      ai: { mood: 'vui, bất ngờ, giải trí', nhip: 'nhanh', khi_nao: 'twist, chuyển chủ đề vui, video giải trí', tranh: 'thương hiệu sang trọng, nội dung nghiêm túc' } },
    { id: 'wipe', label: 'Gạt', group: 'mask', icon: 'ti-layout-sidebar-left-expand', params: { dur: DUR },
      fn: k => [`clip-path:inset(0 ${((1 - E.inOutSine(k)) * 100).toFixed(2)}% 0 0)`, ''],
      ai: { mood: 'rõ ràng, so sánh', nhip: 'vừa', khi_nao: 'trước/sau, so sánh hai lựa chọn, đổi chương', tranh: 'dùng cho mọi chỗ nối' } },
    { id: 'circle', label: 'Vòng tròn', group: 'mask', icon: 'ti-circle-dashed', params: { dur: DUR },
      fn: k => [`clip-path:circle(${(E.outCubic(k) * 75).toFixed(2)}% at 50% 50%)`, ''],
      ai: { mood: 'tập trung, tiết lộ', nhip: 'vừa', khi_nao: 'mở màn sản phẩm, tiết lộ kết quả ở giữa khung', tranh: 'chủ thể lệch mép khung' } },
    { id: 'flash', label: 'Loé sáng', group: 'light', icon: 'ti-bolt', params: { dur: DUR },
      fn: k => [`opacity:${k > .5 ? 1 : 0}`, ''],
      overlay: k => `<div class="full" style="background:#fff;opacity:${(1 - Math.abs(k - .5) * 2).toFixed(3)}"></div>`,
      ai: { mood: 'sốc, cú đấm, khoảnh khắc', nhip: 'rất nhanh', khi_nao: 'đúng beat drop, câu đinh, ảnh chụp/khoảnh khắc', tranh: 'quá 2–3 lần mỗi video; người xem nhạy sáng' } },
    { id: 'glitch', label: 'Nhiễu', group: 'distort', icon: 'ti-wave-saw-tool', params: { dur: DUR },
      fn: k => [`opacity:${k > .3 ? 1 : 0};transform:translateX(${k < .9 ? ((rnd(Math.floor(k * 20)) - .5) * 60).toFixed(0) : 0}px)`, ''],
      ai: { mood: 'công nghệ, gắt, căng', nhip: 'nhanh', khi_nao: 'tin công nghệ/AI, lỗi, bất ngờ tiêu cực, nhạc điện tử', tranh: 'thương hiệu mềm mại, mỹ phẩm, BĐS cao cấp' } },
  ];

  // Hoạt ảnh vào của dòng chữ (L.anim, engine/vertical.js textLine). Thứ tự = thứ tự nút trong Studio.
  const TEXT_IN = [
    { id: 'pop', label: 'Bật', group: 'basic', icon: 'ti-sparkles', params: {},
      ai: { mood: 'vui, nổi bật', nhip: 'nhanh', khi_nao: 'từ khoá, con số, nhãn ngắn (mặc định)', tranh: 'đoạn chữ dài' } },
    { id: 'fade', label: 'Mờ dần', group: 'basic', icon: 'ti-blur', params: {},
      ai: { mood: 'nhẹ, sang', nhip: 'chậm', khi_nao: 'câu trích dẫn, thương hiệu cao cấp', tranh: 'hook cần giật mắt' } },
    { id: 'slide_l', label: 'Trượt trái', group: 'move', icon: 'ti-arrow-big-left-lines', params: {},
      ai: { mood: 'năng động', nhip: 'nhanh', khi_nao: 'tiêu đề đi vào từ phải, danh sách', tranh: 'chữ đặt sát mép trái' } },
    { id: 'slide_r', label: 'Trượt phải', group: 'move', icon: 'ti-arrow-big-right-lines', params: {},
      ai: { mood: 'năng động', nhip: 'nhanh', khi_nao: 'tiêu đề đi vào từ trái, đối xứng với slide_l', tranh: 'chữ đặt sát mép phải' } },
    { id: 'drop', label: 'Rơi', group: 'move', icon: 'ti-arrow-big-down-lines', params: {},
      ai: { mood: 'chắc, đóng dấu', nhip: 'vừa–nhanh', khi_nao: 'kết luận, giá, nhãn "MỚI"', tranh: 'nhiều dòng cùng lúc' } },
    { id: 'blur_zoom', label: 'Nhoè', group: 'move', icon: 'ti-zoom-in', params: {},
      ai: { mood: 'điện ảnh, mạnh', nhip: 'vừa', khi_nao: 'tiêu đề lớn, mở màn, câu hook', tranh: 'chữ nhỏ, phụ' } },
    { id: 'fly', label: 'Bay', group: 'move', icon: 'ti-plane', params: {},
      ai: { mood: 'kể chuyện, dẫn mắt', nhip: 'vừa', khi_nao: 'chữ hiện ở một chỗ rồi bay về vị trí (from_x / from_y)', tranh: 'không có vị trí bắt đầu rõ' } },
    { id: 'tumble', label: 'Lật', group: 'letter', icon: 'ti-rotate-3d', params: {},
      ai: { mood: 'vui, sinh động', nhip: 'vừa', khi_nao: 'câu ngắn cần chú ý từng chữ', tranh: 'câu dài (> 20 ký tự)' } },
    { id: 'type', label: 'Đánh máy', group: 'letter', icon: 'ti-keyboard', params: {},
      ai: { mood: 'công nghệ, tò mò', nhip: 'chậm', khi_nao: 'câu hỏi, prompt AI, ghi chú', tranh: 'chữ hiện quá ngắn (< 1 s)' } },
  ];

  const lut = (id, label, group, icon, css, ai) => ({ id, label, group, icon, params: {}, css, fn: () => css, ai });
  const LUT = [
    lut('warm', 'Ấm', 'tone', 'ti-sun', 'sepia(.22) saturate(1.2) hue-rotate(-8deg)',
      { mood: 'ấm áp, gần gũi', nhip: '—', khi_nao: 'đồ ăn, gia đình, chia sẻ, nội thất', tranh: 'da người đã vàng sẵn' }),
    lut('cool', 'Lạnh', 'tone', 'ti-snowflake', 'saturate(1.05) hue-rotate(12deg) brightness(1.02)',
      { mood: 'sạch, công nghệ', nhip: '—', khi_nao: 'công nghệ, y tế, văn phòng', tranh: 'đồ ăn' }),
    lut('vivid', 'Rực rỡ', 'tone', 'ti-palette', 'saturate(1.45) contrast(1.1)',
      { mood: 'tươi, bắt mắt', nhip: '—', khi_nao: 'bán hàng, du lịch, sản phẩm nhiều màu', tranh: 'cảnh đã bão hoà, da mặt cận' }),
    lut('bw', 'Đen trắng', 'mood', 'ti-contrast', 'grayscale(1) contrast(1.15)',
      { mood: 'nghiêm, hoài niệm', nhip: '—', khi_nao: 'hồi tưởng, trích dẫn, đoạn "trước"', tranh: 'sản phẩm cần thấy màu' }),
    lut('film', 'Phim', 'mood', 'ti-movie', 'sepia(.3) contrast(1.08) saturate(.85)',
      { mood: 'điện ảnh, cổ điển', nhip: '—', khi_nao: 'kể chuyện, vlog, thương hiệu thủ công', tranh: 'tin tức, hướng dẫn' }),
    lut('fade', 'Phai', 'mood', 'ti-droplet', 'contrast(.86) brightness(1.08) saturate(.8)',
      { mood: 'nhẹ, mộng', nhip: '—', khi_nao: 'lifestyle, thời trang nhẹ nhàng', tranh: 'cảnh tối' }),
    lut('night', 'Đêm', 'mood', 'ti-moon', 'brightness(.8) saturate(1.2) hue-rotate(195deg) contrast(1.1)',
      { mood: 'bí ẩn, đêm', nhip: '—', khi_nao: 'cảnh đêm, kể chuyện bí ẩn', tranh: 'da người cận mặt (đổi sắc mạnh)' }),
    lut('pop', 'Pop', 'tone', 'ti-confetti', 'saturate(1.6) contrast(1.15) brightness(1.04)',
      { mood: 'trẻ, sôi động', nhip: '—', khi_nao: 'giải trí, review đồ chơi, quảng cáo nhanh', tranh: 'thương hiệu sang trọng' }),
  ];

  // ---- S28 M206: nhóm `fx` — khối của track Hiệu ứng (TL.efx) + 10 hiệu ứng nhấn cũ (TL.fx, engine.js fxWrap vẽ như trước) ----
  // Khối mới: TL.efx = [{ type, start, end, params: { intensity, speed, range }, target: 'all'|'main', hidden?, locked? }].
  //   fn(lt, p, dur) → { filter?, transform?, over? (HTML phủ trên), wrap? (html → html) }; lt = giây từ đầu khối. Hàm thuần theo t
  //   (nhiễu dùng rnd tất định theo số khung), không CSS animation theo đồng hồ. Mỗi loại ≤ 3 thanh.
  // Nhấn cũ (legacy: true): chỉ dữ liệu (nhãn, thời lượng mặc định, mô tả cho Claude); hình vẫn ở engine.js fxWrap để timeline cũ y hệt.
  GROUPS.fx = [['accent', 'Nhấn'], ['light', 'Ánh sáng'], ['retro', 'Cổ điển'], ['frame', 'Khung'], ['color', 'Màu']];
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const f3 = v => (+v).toFixed(3);
  const INT = def => ({ t: 'num', min: 0, max: 1, def, label: 'Cường độ' });
  const SPD = (def, min = .1, max = 4) => ({ t: 'num', min, max, def, label: 'Tốc độ' });
  const RNG = (def, min = 0, max = 1) => ({ t: 'num', min, max, def, label: 'Phạm vi' });
  const env = (lt, dur, f = .3) => clamp01(Math.min(lt / f, (dur - lt) / f)); // vào / ra mềm ở hai đầu khối
  const noCid = h => h.replace(/ data-cid=/g, ' data-mcid='); // bản sao (gương, giữ màu) không bấm chọn được trên Studio
  const svgUrl = s => `url(data:image/svg+xml,${encodeURIComponent(s).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
  const NOISE = svgUrl("<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='256' height='256' filter='url(#n)'/></svg>");
  const ACC = (id, label, icon, dur, amp, ai) => ({ id, label, group: 'accent', icon, legacy: true, dur,
    params: { dur: { t: 'num', min: .1, max: 4, def: dur, label: 'Thời lượng' }, ...(amp ? { amp: { t: 'num', min: amp[0], max: amp[1], def: amp[2], label: 'Cường độ' } } : {}) }, ai });
  const FXS = [
    ACC('shake', 'Rung', 'ti-vibration', .35, [2, 40, 14], { mood: 'gắt, bất ngờ', nhip: 'rất nhanh', khi_nao: 'câu sốc, va chạm, beat mạnh', tranh: 'đặt liền nhau; nội dung nhẹ nhàng' }),
    ACC('punch', 'Đấm zoom', 'ti-zoom-in-area', .25, [.03, .4, .12], { mood: 'nhấn, dứt khoát', nhip: 'nhanh', khi_nao: 'từ khoá, con số, câu đinh', tranh: 'quá 1 lần / 3 s' }),
    ACC('zoom_in', 'Phóng chậm', 'ti-zoom-in', .6, [.03, .4, .15], { mood: 'tập trung, kịch tính', nhip: 'vừa', khi_nao: 'nhấn một câu quan trọng, tiết lộ', tranh: 'khi đang có zoom khác' }),
    ACC('whip', 'Lia', 'ti-wind', .3, null, { mood: 'năng lượng', nhip: 'nhanh', khi_nao: 'chuyển ý dồn dập, montage', tranh: 'nội dung chậm' }),
    ACC('blur_in', 'Nhoè vào', 'ti-blur', .35, null, { mood: 'mở màn, tỉnh lại', nhip: 'vừa', khi_nao: 'đầu đoạn mới, sau cảnh đen', tranh: 'giữa câu đang nói' }),
    ACC('glitch', 'Nhiễu', 'ti-wave-saw-tool', .3, null, { mood: 'công nghệ, lỗi', nhip: 'nhanh', khi_nao: 'tin AI/công nghệ, bất ngờ tiêu cực', tranh: 'thương hiệu mềm mại' }),
    ACC('rgb', 'Lệch màu', 'ti-color-swatch', .3, null, { mood: 'điện tử, gắt', nhip: 'nhanh', khi_nao: 'nhạc điện tử, beat drop', tranh: 'cảnh sang trọng' }),
    ACC('flash', 'Loé trắng', 'ti-bolt', .25, null, { mood: 'cú đấm, khoảnh khắc', nhip: 'rất nhanh', khi_nao: 'beat drop, ảnh chụp', tranh: 'quá 2–3 lần mỗi video' }),
    ACC('push', 'Đẩy vào mặt', 'ti-focus-centered', 2, [.03, .3, .1], { mood: 'thân mật, chú ý', nhip: 'chậm', khi_nao: 'câu tâm sự, nhấn lời người nói', tranh: 'đoạn có b-roll phủ kín' }),
    ACC('mono', 'Đen trắng nhấn', 'ti-contrast-2', 1.5, null, { mood: 'nghiêm, dừng lại', nhip: 'chậm', khi_nao: 'câu đinh, trích dẫn, khoảnh khắc "trước"', tranh: 'sản phẩm cần thấy màu' }),
    { id: 'light_leak', label: 'Rò sáng', group: 'light', icon: 'ti-sun-high', params: { intensity: INT(.6), speed: SPD(.5) },
      fn: (lt, p, dur) => {
        const a = p.intensity * env(lt, dur, .5), w = 2 * Math.PI * lt * p.speed * .25;
        const x = 50 + 42 * Math.sin(w), y = 30 + 25 * Math.cos(w * .7), x2 = 100 - x * .8;
        return { over: `<div class="full" style="pointer-events:none;mix-blend-mode:screen;background:radial-gradient(ellipse 55% 75% at ${x.toFixed(1)}% ${y.toFixed(1)}%, rgba(255,150,60,${f3(.75 * a)}), rgba(255,60,120,${f3(.35 * a)}) 45%, transparent 72%),radial-gradient(ellipse 40% 60% at ${x2.toFixed(1)}% ${(100 - y).toFixed(1)}%, rgba(255,210,120,${f3(.4 * a)}), transparent 70%)"></div>` };
      },
      ai: { mood: 'ấm, hoài niệm, mơ màng', nhip: 'chậm', khi_nao: 'vlog, du lịch, kỷ niệm, cảnh ngoài trời', tranh: 'tin tức, hướng dẫn cần rõ chữ' } },
    { id: 'vhs', label: 'Băng VHS', group: 'retro', icon: 'ti-device-tv-old', params: { intensity: INT(.6), speed: SPD(1) },
      fn: (lt, p) => {
        const i = p.intensity, j = Math.floor(lt * 30), band = ((lt * p.speed * .35) % 1) * 115 - 10;
        const jit = rnd(j) > .86 ? ((rnd(j + 1) - .5) * 14 * i).toFixed(1) : 0;
        return { filter: `saturate(${f3(1 + .4 * i)}) contrast(${f3(1 + .15 * i)}) sepia(${f3(.18 * i)})`, transform: jit ? `translateX(${jit}px)` : '',
          over: `<div class="full" style="pointer-events:none;background:repeating-linear-gradient(rgba(0,0,0,${f3(.28 * i)}) 0 1px, transparent 1px 3px)"></div>` +
            `<div class="abs" style="pointer-events:none;left:0;right:0;top:${band.toFixed(2)}%;height:6%;background:rgba(255,255,255,${f3(.12 * i)});mix-blend-mode:screen;filter:blur(2px)"></div>` };
      },
      ai: { mood: 'cổ điển, retro 90s', nhip: 'vừa', khi_nao: 'hồi tưởng, chuyện xưa, meme, nhạc lo-fi', tranh: 'thương hiệu cao cấp, sản phẩm mới' } },
    { id: 'grain', label: 'Hạt phim', group: 'retro', icon: 'ti-grain', params: { intensity: INT(.45), speed: SPD(1) },
      fn: (lt, p) => {
        const j = Math.floor(lt * 24 * p.speed);
        return { over: `<div class="full" style="pointer-events:none;mix-blend-mode:overlay;opacity:${f3(.6 * p.intensity)};background-image:${NOISE};background-size:256px 256px;background-position:${Math.round(rnd(j) * 256)}px ${Math.round(rnd(j + 9) * 256)}px"></div>` };
      },
      ai: { mood: 'điện ảnh, mộc', nhip: '—', khi_nao: 'kể chuyện, phim ngắn, thương hiệu thủ công; phủ cả video ở mức nhẹ', tranh: 'màn hình app / chữ nhỏ' } },
    { id: 'vignette', label: 'Tối viền', group: 'frame', icon: 'ti-circle-dot', params: { intensity: INT(.6), range: RNG(.45, .1, .9) },
      fn: (lt, p) => ({ over: `<div class="full" style="pointer-events:none;background:radial-gradient(ellipse at 50% 50%, transparent ${(p.range * 100).toFixed(1)}%, rgba(0,0,0,${f3(.85 * p.intensity)}) 100%)"></div>` }),
      ai: { mood: 'tập trung, trầm', nhip: '—', khi_nao: 'kéo mắt vào người nói / sản phẩm giữa khung', tranh: 'chủ thể ở mép khung' } },
    { id: 'letterbox', label: 'Viền điện ảnh', group: 'frame', icon: 'ti-movie', params: { intensity: INT(1), speed: SPD(1), range: RNG(.12, .03, .25) },
      fn: (lt, p, dur) => {
        const d = .6 / p.speed, s = E.outCubic(clamp01(Math.min(lt / d, (dur - lt) / d))), h = (p.range * 100 * s).toFixed(2), bg = `rgba(0,0,0,${f3(p.intensity)})`;
        return { over: `<div class="abs" style="pointer-events:none;left:0;right:0;top:0;height:${h}%;background:${bg}"></div><div class="abs" style="pointer-events:none;left:0;right:0;bottom:0;height:${h}%;background:${bg}"></div>` };
      },
      ai: { mood: 'điện ảnh, trang trọng', nhip: 'chậm', khi_nao: 'mở màn, cảnh đẹp, tiết lộ, trailer', tranh: 'đoạn có phụ đề / chữ sát mép trên dưới' } },
    { id: 'glow', label: 'Phát sáng', group: 'light', icon: 'ti-brightness-up', params: { intensity: INT(.5), range: RNG(.6, .2, 1) },
      fn: (lt, p, dur) => {
        const i = p.intensity * env(lt, dur);
        return { filter: `brightness(${f3(1 + .12 * i)}) saturate(${f3(1 + .25 * i)}) contrast(${f3(1 - .05 * i)})`,
          over: `<div class="full" style="pointer-events:none;mix-blend-mode:soft-light;background:radial-gradient(ellipse at 50% 42%, rgba(255,255,255,${f3(.55 * i)}), transparent ${(p.range * 100).toFixed(1)}%)"></div>` };
      },
      ai: { mood: 'mộng, sạch, sang', nhip: '—', khi_nao: 'mỹ phẩm, thời trang, cảnh sản phẩm sáng', tranh: 'cảnh đã cháy sáng' } },
    { id: 'mirror', label: 'Chia đôi gương', group: 'frame', icon: 'ti-flip-vertical', params: { intensity: INT(1) },
      fn: (lt, p) => ({ wrap: h => `<div class="full" style="clip-path:inset(0 50% 0 0)">${h}</div><div class="full" style="pointer-events:none;transform:scaleX(-1);clip-path:inset(0 50% 0 0);opacity:${f3(p.intensity)}">${noCid(h)}</div>` }),
      ai: { mood: 'lạ mắt, nghệ thuật', nhip: 'nhanh', khi_nao: 'nhịp mạnh của nhạc, montage thời trang, đoạn ngắn 1–2 s', tranh: 'người nói nhìn vào máy (mặt bị cắt đôi); chữ trên khung' } },
    { id: 'edge_blur', label: 'Mờ viền', group: 'frame', icon: 'ti-blur', params: { intensity: INT(.5), range: RNG(.4, .1, .8) },
      fn: (lt, p) => {
        const r = (p.range * 100).toFixed(1), m = `radial-gradient(ellipse at 50% 50%, transparent ${r}%, #000 ${(p.range * 100 + 25).toFixed(1)}%)`;
        return { over: `<div class="full" style="pointer-events:none;backdrop-filter:blur(${(2 + 12 * p.intensity).toFixed(1)}px);-webkit-mask-image:${m};mask-image:${m}"></div>` };
      },
      ai: { mood: 'mơ, tập trung giữa khung', nhip: '—', khi_nao: 'hồi tưởng, giấc mơ, nhấn chủ thể giữa khung', tranh: 'chữ / logo ở mép; đặt rất dài (blur nặng khi xuất)' } },
    { id: 'pulse', label: 'Nhịp sáng', group: 'light', icon: 'ti-heartbeat', params: { intensity: INT(.5), speed: SPD(2, .5, 4) },
      fn: (lt, p) => {
        const pk = Math.pow(1 - ((lt * p.speed) % 1), 3) * p.intensity;
        return { filter: `brightness(${f3(1 + .45 * pk)})`, transform: `scale(${(1 + .03 * pk).toFixed(4)})` };
      },
      ai: { mood: 'sôi động, bắt nhịp', nhip: 'theo nhạc (speed = số nhịp mỗi giây)', khi_nao: 'đoạn nhạc mạnh, quảng cáo nhanh, đếm ngược', tranh: 'người xem nhạy sáng; đoạn nói chậm' } },
    { id: 'color_pop', label: 'Đen trắng giữ màu', group: 'color', icon: 'ti-color-picker', params: { intensity: INT(1), range: RNG(.35, .15, .7) },
      fn: (lt, p) => {
        const r = (p.range * 100).toFixed(1), m = `radial-gradient(ellipse ${r}% ${(p.range * 120).toFixed(1)}% at 50% 45%, #000 60%, transparent 100%)`;
        return { wrap: h => `<div class="full" style="filter:grayscale(${f3(p.intensity)})">${h}</div><div class="full" style="pointer-events:none;-webkit-mask-image:${m};mask-image:${m}">${noCid(h)}</div>` };
      },
      ai: { mood: 'nhấn chủ thể, nghệ thuật', nhip: '—', khi_nao: 'giữ màu sản phẩm / người ở giữa khung, nền thành đen trắng (gần đúng: theo vùng, không theo màu)', tranh: 'chủ thể lệch mép' } },
  ];
  // Thực thi khối mới tại t: html = các lớp bên dưới; trả lớp gói + filter / transform + HTML phủ (engine.js gộp vào wrapper)
  function fxApply(items, t, html) {
    let tr = '', fl = '', over = '';
    for (const b of items) {
      const d = FXS.find(x => x.id === b.type);
      if (!d?.fn) continue;
      const r = d.fn(t - b.start, params('fx', b.type, b.params), b.end - b.start) || {};
      if (r.wrap) html = r.wrap(html);
      if (r.transform) tr += ' ' + r.transform;
      if (r.filter) fl += ' ' + r.filter;
      if (r.over) over += r.over;
    }
    return { html, tr, fl, over };
  }

  const LISTS = { trans: TRANS, text_in: TEXT_IN, lut: LUT, fx: FXS };
  const list = kind => LISTS[kind] || [];
  const get = (kind, id) => list(kind).find(x => x.id === id) || null;
  const ids = kind => list(kind).map(x => x.id);
  const groupLabel = (kind, g) => (GROUPS[kind] || []).find(x => x[0] === g)?.[1] || g;
  // Tham số đã kẹp theo bảng của mục (thiếu → mặc định)
  function params(kind, id, p) {
    const d = get(kind, id), out = {};
    for (const [n, s] of Object.entries(d?.params || {})) {
      const v = p?.[n];
      if (s.t === 'num') out[n] = Number.isFinite(+v) && v !== null && v !== '' ? Math.min(s.max, Math.max(s.min, +v)) : s.def;
      else if (s.t === 'enum') out[n] = s.values.includes(v) ? v : s.def;
    }
    return out;
  }
  // Mô tả cho Claude: một dòng mỗi loại, đủ để chọn theo nội dung (75_ask.core.js, prompt AI dựng)
  const aiGuide = (kind, sep = '\n') => list(kind).map(x => `${x.id} (${x.label.toLowerCase()}): ${x.ai.mood}; nhịp ${x.ai.nhip}; dùng khi ${x.ai.khi_nao}; tránh ${x.ai.tranh}`).join(sep);
  // Bảng Markdown cho references/clips.md (scripts/fx_doc.mjs)
  function docTable(kind) {
    const head = '| `id` | Tên | Nhóm | Không khí | Dùng khi | Tránh |\n|---|---|---|---|---|---|\n';
    return head + list(kind).map(x => `| \`${x.id}\` | ${x.label} | ${groupLabel(kind, x.group)} | ${x.ai.mood} | ${x.ai.khi_nao} | ${x.ai.tranh} |`).join('\n');
  }

  const FX = {
    GROUPS, TRANS, TEXT_IN, LUT, list, get, ids, groupLabel, params, aiGuide, docTable,
    // engine/engine.js
    transFns: () => Object.fromEntries(TRANS.map(x => [x.id, x.fn])),
    transOverlay: (id, k) => get('trans', id)?.overlay?.(k) || '',
    lutCss: () => Object.fromEntries(LUT.map(x => [x.id, x.css])),
    // studio (dạng mảng cũ của clips.js / library.js)
    transTypes: () => TRANS.map(x => [x.id, x.label, x.icon]),
    filters: () => [['', 'Gốc'], ...LUT.map(x => [x.id, x.label])],
    animList: () => TEXT_IN.map(x => [x.id, x.label]),
    // S28 M206: track Hiệu ứng (engine.js fxWrap / mainFx, studio/features/81_fxtrack*.js, 75_ask.core.js)
    FXS, fxApply,
    accentDur: () => Object.fromEntries(FXS.filter(x => x.legacy).map(x => [x.id, x.dur])),
  };
  // ---------- S28 M204: nhóm clip_anim — hoạt ảnh clip Vào / Ra / Combo (clip.anim của clip Video chính, b-roll, ảnh phủ) ----------
  // anim = { in: {type, dur}, out: {type, dur}, combo: {type, speed} }; ghép ở engine/engine.js (animWrap: clipLayer, sceneFx).
  // Mỗi mục trả props { x, y (% khung), scale, rot (độ), rx, ry (độ, xoay 3D), opacity, blur (px) }; thiếu = trung tính.
  //   in.fn(k): k 0→1 trong in.dur đầu clip, k = 1 là trạng thái nghỉ. out.fn(k): k 0→1 trong out.dur cuối (đối xứng của Vào).
  //   combo.fn(p, lt, speed): suốt clip, p = 0→1 theo thời lượng clip, lt giây. Hàm thuần theo t: cùng t cho cùng chuỗi.
  // Combo có xoay / trôi tự phóng nhẹ để không lộ mép khung.
  (() => {
    const bounce = k => { const n = 7.5625, d = 2.75; return k < 1 / d ? n * k * k : k < 2 / d ? n * (k -= 1.5 / d) * k + .75 : k < 2.5 / d ? n * (k -= 2.25 / d) * k + .9375 : n * (k -= 2.625 / d) * k + .984375; };
    const ADUR = { t: 'num', min: 0.1, max: 3, def: 0.5 }, ASPD = { t: 'num', min: 0.25, max: 3, def: 1 };
    const fadeUp = k => Math.min(1, k * 2);
    const IN = {
      fade: k => ({ opacity: k }),
      zoom_in: k => ({ scale: lerp(.6, 1, E.outCubic(k)), opacity: fadeUp(k) }),
      zoom_out: k => ({ scale: lerp(1.4, 1, E.outCubic(k)), opacity: fadeUp(k) }),
      slide_l: k => ({ x: (1 - E.outCubic(k)) * 100 }),
      slide_r: k => ({ x: -(1 - E.outCubic(k)) * 100 }),
      slide_up: k => ({ y: (1 - E.outCubic(k)) * 100 }),
      slide_down: k => ({ y: -(1 - E.outCubic(k)) * 100 }),
      rotate: k => ({ rot: (1 - E.outCubic(k)) * -90, scale: lerp(.4, 1, E.outCubic(k)), opacity: fadeUp(k) }),
      shake: k => ({ x: Math.sin(k * Math.PI * 8) * (1 - k) * 6, scale: lerp(1.08, 1, k) }),
      sway: k => ({ rot: Math.sin(k * Math.PI * 5) * (1 - k) * 8, scale: lerp(1.15, 1, k) }),
      bounce: k => ({ scale: lerp(.3, 1, bounce(k)), opacity: Math.min(1, k * 3) }),
      blur: k => ({ blur: (1 - k) * 24, opacity: k, scale: lerp(1.08, 1, E.outCubic(k)) }),
    };
    const ai = (mood, nhip, khi_nao, tranh) => ({ mood, nhip, khi_nao, tranh });
    const mk = (group, p) => (id, label, icon, fn, a) => ({ id, label, group, icon, params: { [p === ASPD ? 'speed' : 'dur']: p }, fn, ai: a });
    const ci = mk('in', ADUR), co = mk('out', ADUR), cc = mk('combo', ASPD);
    const CLIP_IN = [
      ci('fade', 'Mờ dần', 'ti-blur', IN.fade, ai('nhẹ, trung tính', 'chậm–vừa', 'mở clip đầu, ảnh phủ vào nhẹ', 'cần cú đấm ngay khung đầu')),
      ci('zoom_in', 'Phóng to vào', 'ti-zoom-in', IN.zoom_in, ai('bật ra, hào hứng', 'nhanh', 'sản phẩm, chi tiết, câu hook', 'nội dung trang trọng')),
      ci('zoom_out', 'Thu vào', 'ti-zoom-out', IN.zoom_out, ai('mạnh, điện ảnh', 'vừa', 'cảnh rộng, mở chương, ảnh phủ toàn khung', 'clip quá ngắn (< 1 s)')),
      ci('slide_l', 'Trượt sang trái', 'ti-arrow-big-left-lines', IN.slide_l, ai('tiến tới, gọn', 'vừa–nhanh', 'ý tiếp theo, ảnh minh hoạ đi vào từ phải', 'dùng cho mọi clip liền nhau')),
      ci('slide_r', 'Trượt sang phải', 'ti-arrow-big-right-lines', IN.slide_r, ai('quay lại, so sánh', 'vừa–nhanh', 'nhắc ý trước, đối chiếu', 'dùng cho mọi clip liền nhau')),
      ci('slide_up', 'Trượt lên', 'ti-arrow-big-up-lines', IN.slide_up, ai('tích cực, lướt feed', 'nhanh', 'video dọc, kết quả, con số tăng', 'tin buồn')),
      ci('slide_down', 'Trượt xuống', 'ti-arrow-big-down-lines', IN.slide_down, ai('rơi vào, đóng dấu', 'vừa', 'kết luận, thẻ giá, ảnh rơi vào khung', 'mở đầu video')),
      ci('rotate', 'Xoay vào', 'ti-rotate-clockwise-2', IN.rotate, ai('vui, bất ngờ', 'nhanh', 'twist, giải trí, sticker ảnh', 'thương hiệu sang trọng')),
      ci('shake', 'Lắc', 'ti-vibration', IN.shake, ai('gắt, sốc', 'rất nhanh', 'tin sốc, beat drop, lỗi', 'nội dung nhẹ nhàng; dùng dày')),
      ci('sway', 'Lắc lư', 'ti-wave-sine', IN.sway, ai('tinh nghịch, mềm', 'vừa', 'lifestyle, đồ ăn, trẻ em', 'tin tức, hướng dẫn kỹ thuật')),
      ci('bounce', 'Nảy', 'ti-ball-basketball', IN.bounce, ai('vui, năng lượng', 'nhanh', 'ảnh sản phẩm dạng thẻ, khuyến mãi', 'cảnh toàn khung nghiêm túc')),
      ci('blur', 'Mờ nhoè', 'ti-blur-off', IN.blur, ai('mơ màng, sang', 'chậm–vừa', 'hồi tưởng, BĐS cao cấp, mỹ phẩm', 'màn có chữ cần đọc ngay')),
    ];
    // Ra = Vào chạy ngược; hướng đổi chiều để clip đi tiếp ra ngoài (trượt ra trái = vào từ trái chạy ngược, phóng ra = thu vào chạy ngược)
    const back = id => k => IN[id](1 - k);
    const CLIP_OUT = [
      co('fade', 'Mờ dần', 'ti-blur', back('fade'), ai('nhẹ, kết', 'chậm–vừa', 'clip cuối, ảnh phủ rút đi', 'ngay trước chuyển cảnh mạnh')),
      co('zoom_in', 'Phóng ra', 'ti-zoom-in', back('zoom_out'), ai('lao tới, dồn dập', 'nhanh', 'trước cảnh hook, đẩy sang ý mới', 'kết video')),
      co('zoom_out', 'Thu nhỏ', 'ti-zoom-out', back('zoom_in'), ai('khép lại', 'vừa', 'tổng kết, ảnh thẻ rút đi', 'clip chính đang nói')),
      co('slide_l', 'Trượt ra trái', 'ti-arrow-big-left-lines', back('slide_r'), ai('tiến tới', 'vừa–nhanh', 'nhường chỗ ý tiếp theo', 'dùng cho mọi clip')),
      co('slide_r', 'Trượt ra phải', 'ti-arrow-big-right-lines', back('slide_l'), ai('lùi lại', 'vừa–nhanh', 'quay về ý trước', 'dùng cho mọi clip')),
      co('slide_up', 'Trượt ra trên', 'ti-arrow-big-up-lines', back('slide_down'), ai('lướt đi', 'nhanh', 'video dọc kiểu lướt feed', 'tin buồn')),
      co('slide_down', 'Trượt ra dưới', 'ti-arrow-big-down-lines', back('slide_up'), ai('hạ xuống, kết', 'vừa', 'kết đoạn, rút ảnh minh hoạ', 'mở đầu')),
      co('rotate', 'Xoay ra', 'ti-rotate-clockwise-2', back('rotate'), ai('vui, bất ngờ', 'nhanh', 'kết đoạn giải trí', 'thương hiệu sang trọng')),
      co('sway', 'Lắc lư ra', 'ti-wave-sine', back('sway'), ai('tinh nghịch', 'vừa', 'lifestyle, đồ ăn', 'tin tức')),
      co('blur', 'Mờ nhoè', 'ti-blur-off', back('blur'), ai('mơ màng', 'chậm–vừa', 'chuyển sang hồi tưởng, cảnh sang', 'màn có chữ cần đọc')),
    ];
    const TAU = Math.PI * 2;
    // xoay θ độ: phóng đủ để khung 9:16 / 16:9 (tỉ lệ ≤ 1,78) vẫn phủ kín
    const cover = deg => { const a = Math.abs(deg % 180) * Math.PI / 180; return Math.abs(Math.cos(a)) + 1.78 * Math.abs(Math.sin(a)); };
    const CLIP_COMBO = [
      cc('ken_burns', 'Ken Burns', 'ti-camera', (p, lt, v) => ({ scale: 1.04 + .14 * v * p, x: lerp(-1.5, 1.5, p), y: lerp(1, -1, p) }),
        ai('kể chuyện, sống động', 'chậm', 'b-roll ảnh tĩnh (ảnh AI, ảnh stock) cho khỏi đứng hình, BĐS, du lịch', 'video quay sẵn đã chuyển động mạnh')),
      cc('pendulum', 'Con lắc', 'ti-clock-pause', (p, lt, v) => ({ rot: Math.sin(lt * v * TAU / 3) * 3, scale: 1.12 }),
        ai('đung đưa, thư thả', 'chậm', 'ảnh minh hoạ vui, đồ chơi, thời trang', 'tin tức, dữ liệu')),
      cc('zoom_pulse', 'Zoom vào-ra', 'ti-arrows-diagonal', (p, lt, v) => ({ scale: 1 + .08 * (1 - Math.cos(lt * v * TAU / 2.5)) / 2 }),
        ai('nhấn nhá, sôi động', 'vừa', 'ảnh sản phẩm, khuyến mãi, nhạc vui', 'clip chính đang nói dài (chóng mặt)')),
      cc('shake3d', 'Lắc 3D', 'ti-rotate-3d', (p, lt, v) => ({ ry: Math.sin(lt * v * TAU / 2.2) * 10, rx: Math.sin(lt * v * TAU / 3.1) * 5, scale: 1.15 }),
        ai('công nghệ, hiện đại', 'vừa', 'ảnh màn hình app, sản phẩm công nghệ', 'mặt người cận')),
      cc('breathe', 'Thở', 'ti-lungs', (p, lt, v) => ({ scale: 1.03 + .03 * Math.sin(lt * v * TAU / 3) }),
        ai('êm, sống', 'chậm', 'ảnh tĩnh giữ lâu, chân dung, cảnh đẹp', 'chồng với Ken Burns')),
      cc('drift', 'Trôi', 'ti-wind', (p, lt, v) => ({ x: Math.sin(lt * v * .9) * 2.5, y: Math.cos(lt * v * .7) * 1.8, scale: 1.08 }),
        ai('mơ màng, điện ảnh', 'chậm', 'cảnh thiên nhiên, BĐS, hồi tưởng', 'ảnh có chữ sát mép')),
      cc('beat_shake', 'Rung nhịp', 'ti-wave-square', (p, lt, v) => { const e = Math.exp(-((lt * v * 2) % 1) * 7); return { x: Math.sin(lt * 60) * e * 1.2, scale: 1.04 + .05 * e }; },
        ai('mạnh, theo nhạc', 'nhanh (2 nhịp/giây × speed)', 'montage, nhạc EDM, khoảnh khắc bùng nổ', 'đoạn nói chậm, tâm sự')),
      cc('slow_spin', 'Xoay chậm', 'ti-rotate', (p, lt, v) => { const r = lt * v * 4; return { rot: r, scale: cover(r) }; },
        ai('lạ, nghệ thuật', 'chậm', 'ảnh sản phẩm trưng bày, intro nghệ thuật', 'clip dài (> 5 s, phóng quá to)')),
    ];
    Object.assign(GROUPS, { clip_in: [['in', 'Vào']], clip_out: [['out', 'Ra']], clip_combo: [['combo', 'Combo']] });
    Object.assign(LISTS, { clip_in: CLIP_IN, clip_out: CLIP_OUT, clip_combo: CLIP_COMBO });
    const SLOT = { in: 'clip_in', out: 'clip_out', combo: 'clip_combo' };
    const NEUTRAL = { x: 0, y: 0, scale: 1, rot: 0, rx: 0, ry: 0, opacity: 1, blur: 0 };
    // Props đã ghép tại giây lt của clip dài D (null = không có hoạt ảnh nào đang chạy → engine không bọc gì, giữ HTML cũ).
    // edge = đang ở đoạn Vào / Ra (clip có thể hở nền: engine bỏ cờ cover của cảnh).
    function clipAnimAt(anim, lt, D) {
      if (!anim || typeof anim !== 'object' || !(D > 0)) return null;
      const P = { ...NEUTRAL }; let any = false, edge = false;
      const add = q => { any = true; for (const k in q) P[k] = k === 'scale' || k === 'opacity' ? P[k] * q[k] : P[k] + q[k]; };
      const fi = anim.in && get('clip_in', anim.in.type), fo = anim.out && get('clip_out', anim.out.type), fc = anim.combo && get('clip_combo', anim.combo.type);
      let di = fi ? params('clip_in', fi.id, anim.in).dur : 0, dout = fo ? params('clip_out', fo.id, anim.out).dur : 0;
      if (di + dout > D) { const s = D / (di + dout); di *= s; dout *= s; } // clip ngắn: chia thời gian Vào / Ra theo tỉ lệ
      const x = Math.min(Math.max(lt, 0), D);
      if (fc) add(fc.fn(x / D, x, params('clip_combo', fc.id, anim.combo).speed));
      if (di && x < di) { add(fi.fn(x / di)); edge = true; }
      if (dout && x > D - dout) { add(fo.fn((x - (D - dout)) / dout)); edge = true; }
      return any ? { ...P, edge } : null;
    }
    // CSS của props; skip = thuộc tính keyframe đã giữ (x/y/scale/rot/opacity) → bỏ phần đó của hoạt ảnh (keyframe thắng).
    function clipAnimCss(P, skip) {
      const has = k => !skip?.has(k), n = (v, d = 2) => (+v).toFixed(d), tr = [];
      if (P.rx || P.ry) tr.push('perspective(900px)');
      const x = has('x') ? P.x : 0, y = has('y') ? P.y : 0;
      if (x || y) tr.push(`translate(${n(x)}%,${n(y)}%)`);
      if (P.rx) tr.push(`rotateX(${n(P.rx)}deg)`);
      if (P.ry) tr.push(`rotateY(${n(P.ry)}deg)`);
      if (has('rot') && P.rot) tr.push(`rotate(${n(P.rot)}deg)`);
      if (has('scale') && P.scale !== 1) tr.push(`scale(${n(P.scale, 4)})`);
      let css = tr.length ? `transform:${tr.join(' ')};` : '';
      if (has('opacity') && P.opacity < 1) css += `opacity:${n(Math.max(0, P.opacity), 3)};`;
      if (P.blur > .3) css += `filter:blur(${n(P.blur, 1)}px);`;
      return css;
    }
    // Đặt một slot của anim: type rỗng / 'none' / không có trong nhóm → bỏ slot; trả anim mới (null = hết slot). Studio + Claude dùng chung.
    function clipAnimSet(anim, slot, type, v) {
      const kind = SLOT[slot]; if (!kind) return anim || null;
      const o = { ...(anim && typeof anim === 'object' ? anim : {}) };
      if (!type || type === 'none' || !get(kind, type)) delete o[slot];
      else o[slot] = { type, ...params(kind, type, { ...(o[slot] || {}), ...(v || {}) }) };
      return Object.keys(o).length ? o : null;
    }
    Object.assign(FX, { CLIP_IN, CLIP_OUT, CLIP_COMBO, CLIP_SLOT: SLOT, clipAnimAt, clipAnimCss, clipAnimSet });
  })();

  if (typeof module === 'object' && module.exports) module.exports = FX;
  else root.FX = FX;
})(typeof window !== 'undefined' ? window : globalThis);
