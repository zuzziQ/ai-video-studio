// S21 M145: lõi thuần của cột phải kiểu Adobe — nhóm tab Thuộc tính · Lớp · Dự án. Không DOM: studio.js (renderInspector) gọi
// các hàm ở đây để quyết định tab đang mở. Chạy trong trình duyệt (window.RightCore) và trong Node (scripts/tests/s21_right.test.mjs).
//   Thuộc tính (props): element đang chọn; không chọn gì mà đang xem một mục thư viện (M147) thì chi tiết mục đó.
//   Lớp (layers): bảng lớp tại playhead (67_layers.js, M142).
//   Dự án (project): điểm 5 bước, việc thiếu, cài đặt dự án (projectPanel + 03_nextstep.js).
'use strict';
(function (root) {
  const TABS = [['props', 'Thuộc tính', 'ti-adjustments-horizontal'], ['layers', 'Lớp', 'ti-stack-2'], ['project', 'Dự án', 'ti-layout-dashboard']];
  const KEYS = TABS.map(t => t[0]);
  const valid = t => KEYS.includes(t);

  // Tab khi mở Studio: tab đã lưu (avs.rtab) nếu hợp lệ, không thì Thuộc tính khi có chọn, Dự án khi không.
  const initialTab = (saved, has) => (valid(saved) ? saved : has ? 'props' : 'project');

  // Tab sau khi trạng thái chọn đổi (had → has). Tự đổi như Adobe nhưng không giành tab người dùng đang dùng:
  //   Dự án + vừa chọn element → Thuộc tính; Thuộc tính + vừa bỏ chọn (không có chi tiết mục thư viện) → Dự án;
  //   Lớp giữ nguyên (bấm dòng trong bảng Lớp là chọn, không được nhảy khỏi bảng).
  function nextTab({ tab, had, has, detail = false }) {
    if (!valid(tab)) return has ? 'props' : 'project';
    if (has && !had && tab === 'project') return 'props';
    if (!has && had && tab === 'props' && !detail) return 'project';
    return tab;
  }
  // Mở chi tiết mục thư viện (M147) luôn đưa về Thuộc tính.
  const tabForDetail = () => 'props';

  const T = { TABS, KEYS, valid, initialTab, nextTab, tabForDetail };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.RightCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
