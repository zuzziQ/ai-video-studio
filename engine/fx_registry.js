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

  const LISTS = { trans: TRANS, text_in: TEXT_IN, lut: LUT };
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
  };
  if (typeof module === 'object' && module.exports) module.exports = FX;
  else root.FX = FX;
})(typeof window !== 'undefined' ? window : globalThis);
