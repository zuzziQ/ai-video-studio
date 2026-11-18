// S21 M145: lõi thuần của cột phải kiểu Adobe — nhóm tab Thuộc tính · Lớp · Dự án. Không DOM: studio.js (renderInspector) gọi
// các hàm ở đây để quyết định tab đang mở. Chạy trong trình duyệt (window.RightCore) và trong Node (scripts/tests/s21_right.test.mjs).
//   Thuộc tính (props): element đang chọn; không chọn gì mà đang xem một mục thư viện (M147) thì chi tiết mục đó.
//   Lớp (layers): bảng lớp tại playhead (67_layers.js, M142).
//   Dự án (project): điểm 5 bước, việc thiếu, cài đặt dự án (projectPanel + 03_nextstep.js).
'use strict';
(function (root) {
  const TABS = [['props', 'Thuộc tính', 'ti-adjustments-horizontal'], ['layers', 'Lớp', 'ti-stack-2'], ['project', 'Dự án', 'ti-layout-dashboard']];
  const KEYS = TABS.map(t => t[0]);
  // S22 M151: keys = các tab có ở chế độ đang dùng (LevelCore.rightTabs: Cơ bản không có Lớp); bỏ trống = đủ ba tab.
  const valid = (t, keys = KEYS) => KEYS.includes(t) && keys.includes(t);
  const tabsFor = (keys = KEYS) => TABS.filter(t => keys.includes(t[0]));

  // S22 M156 (K4): Thuộc tính khi không chọn gì và không xem chi tiết mục thư viện chỉ là ô "Chưa chọn element" — không bao giờ
  // dừng ở đó, ở mọi bước và mọi chế độ: về Dự án (điểm, việc thiếu của bước). Tab bấm được khi có chọn hoặc có chi tiết.
  const propsUsable = (has, detail) => !!has || !!detail;

  // Tab khi mở Studio: tab đã lưu (avs.rtab) nếu hợp lệ và dùng được, không thì Thuộc tính khi có chọn, Dự án khi không.
  const initialTab = (saved, has, keys = KEYS, detail = false) => {
    if (valid(saved, keys) && (saved !== 'props' || propsUsable(has, detail))) return saved;
    return has ? 'props' : 'project';
  };

  // Tab sau khi trạng thái chọn đổi (had → has). Tự đổi như Adobe nhưng không giành tab người dùng đang dùng:
  //   Dự án + vừa chọn element → Thuộc tính; Thuộc tính + vừa bỏ chọn (không có chi tiết mục thư viện) → Dự án;
  //   Lớp giữ nguyên (bấm dòng trong bảng Lớp là chọn, không được nhảy khỏi bảng).
  //   Tab không có ở chế độ đang dùng (vd. Lớp khi vừa đổi sang Cơ bản) → như tab hỏng.
  //   M156: Thuộc tính mà không có gì để xem (kể cả khi đổi bước, đóng chi tiết thư viện) → Dự án.
  function nextTab({ tab, had, has, detail = false, keys = KEYS }) {
    if (!valid(tab, keys)) return has ? 'props' : 'project';
    if (has && !had && tab === 'project') return 'props';
    if (tab === 'props' && !propsUsable(has, detail)) return 'project';
    return tab;
  }
  // Mở chi tiết mục thư viện (M147) luôn đưa về Thuộc tính.
  const tabForDetail = () => 'props';

  const T = { TABS, KEYS, valid, tabsFor, propsUsable, initialTab, nextTab, tabForDetail };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.RightCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
