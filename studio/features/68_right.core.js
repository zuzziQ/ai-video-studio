// S21 M145: lõi thuần của cột phải kiểu Adobe — nhóm tab Thuộc tính · Lớp · Claude (S24 M170 thêm Claude, C34; S24 M174 bỏ Dự án,
// C37). Không DOM: studio.js (renderInspector) gọi các hàm ở đây để quyết định tab đang mở. Chạy trong trình duyệt (window.RightCore)
// và trong Node (scripts/tests/s21_right.test.mjs, s24_m174.test.mjs).
//   Thuộc tính (props): element đang chọn; không chọn gì mà đang xem một mục thư viện (M147) thì chi tiết mục đó.
//   Lớp (layers): bảng lớp tại playhead (67_layers.js, M142).
//   Claude (claude): Hỏi Claude (75_ask.js, Studio.right.addTab) — tab nghỉ khi không chọn gì, giữ nguyên khi chọn / bỏ chọn như Lớp.
//   Tab Dự án cũ (M174): tiêu chí bước ở popover thanh bước (03_stepscore.js), "Cài đặt dự án" ở bước Chuẩn bị (panel wf-project).
'use strict';
(function (root) {
  const TABS = [['props', 'Thuộc tính', 'ti-adjustments-horizontal'], ['layers', 'Lớp', 'ti-stack-2'], ['claude', 'Claude', 'ti-sparkles']];
  const KEYS = TABS.map(t => t[0]);
  const IDLE = 'claude'; // tab khi không chọn gì (cả Cơ bản và Chuyên nghiệp)
  // M174: tab đã lưu ở bản cũ (avs.rtab = 'project') → Claude, không rơi về luật "tab hỏng"
  const OLD = { project: IDLE };
  const migrate = t => (Object.prototype.hasOwnProperty.call(OLD, t) ? OLD[t] : t);
  // S22 M151: keys = các tab có ở chế độ đang dùng (LevelCore.rightTabs: Cơ bản không có Lớp); bỏ trống = đủ các tab.
  const valid = (t, keys = KEYS) => KEYS.includes(t) && keys.includes(t);
  const tabsFor = (keys = KEYS) => TABS.filter(t => keys.includes(t[0]));

  // S22 M156 (K4): Thuộc tính khi không chọn gì và không xem chi tiết mục thư viện chỉ là ô "Chưa chọn element" — không bao giờ
  // dừng ở đó, ở mọi bước và mọi chế độ: về Claude (M174). Tab bấm được khi có chọn hoặc có chi tiết.
  const propsUsable = (has, detail) => !!has || !!detail;

  // Tab khi mở Studio: tab đã lưu (avs.rtab, đổi tên cũ qua migrate) nếu hợp lệ và dùng được, không thì Thuộc tính khi có chọn,
  // Claude khi không.
  const initialTab = (saved, has, keys = KEYS, detail = false) => {
    saved = migrate(saved);
    if (valid(saved, keys) && (saved !== 'props' || propsUsable(has, detail))) return saved;
    return has ? 'props' : IDLE;
  };

  // Tab sau khi trạng thái chọn đổi (had → has). Tự đổi như Adobe nhưng không giành tab người dùng đang dùng:
  //   Thuộc tính + vừa bỏ chọn (không có chi tiết mục thư viện) → Claude; Lớp / Claude giữ nguyên (bấm dòng trong bảng Lớp là
  //   chọn, không được nhảy khỏi bảng; đang đọc câu trả lời của Claude mà bấm element thì không mất câu trả lời).
  //   auto = tab đang mở do Studio tự đổi tới (không phải người dùng bấm / Studio.right.show): Claude tự về khi không chọn gì mà
  //   vừa chọn element → Thuộc tính, như tab Dự án cũ. Cờ do studio.js giữ (RT.auto), tiêu ngay khi người dùng tự chọn tab.
  //   Tab không có ở chế độ đang dùng (vd. Lớp khi vừa đổi sang Cơ bản) → như tab hỏng.
  //   M156: Thuộc tính mà không có gì để xem (kể cả khi đổi bước, đóng chi tiết thư viện) → Claude.
  function nextTab({ tab, had, has, detail = false, keys = KEYS, auto = false }) {
    tab = migrate(tab);
    if (!valid(tab, keys)) return has ? 'props' : IDLE;
    if (auto && has && !had && tab === IDLE) return 'props';
    if (tab === 'props' && !propsUsable(has, detail)) return IDLE;
    return tab;
  }
  // Mở chi tiết mục thư viện (M147) luôn đưa về Thuộc tính.
  const tabForDetail = () => 'props';

  const T = { TABS, KEYS, IDLE, migrate, valid, tabsFor, propsUsable, initialTab, nextTab, tabForDetail };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.RightCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
