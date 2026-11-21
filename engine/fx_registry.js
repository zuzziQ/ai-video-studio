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
  if (typeof module === 'object' && module.exports) module.exports = FX;
  else root.FX = FX;
})(typeof window !== 'undefined' ? window : globalThis);
