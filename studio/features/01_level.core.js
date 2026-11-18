// S22 M151: lõi thuần của hai chế độ giao diện Cơ bản / Chuyên nghiệp (docs/plans/S22-che-do-va-hoi-claude.md mục 4, C13, C24).
// Cơ bản = Claude lái, người dùng duyệt: mỗi bước vài mục trên thanh trái, cột phải không có tab Lớp, Thuộc tính chỉ hiện đầu +
// mục chính + Núm (mục khác thu sau "Thêm thuộc tính"). Chuyên nghiệp = đủ như S21. Không bỏ tính năng: mục ẩn ở
// Cơ bản vẫn mở được bằng ⌘K ("Mở ở Chuyên nghiệp") hoặc nút "Thêm thuộc tính".
// Không DOM: 01_workflow.js, 04_cmdk.js và studio.js gọi các hàm ở đây. Chạy trong trình duyệt (window.LevelCore) và Node
// (scripts/tests/s22_level.test.mjs).
'use strict';
(function (root) {
  const LEVELS = ['basic', 'pro'];
  const LABEL = { basic: 'Cơ bản', pro: 'Chuyên nghiệp' };
  const norm = v => (v === 'basic' ? 'basic' : 'pro');

  // Thanh trái ở Cơ bản: id panel theo bước (bảng mục 4 của kế hoạch). Mục của nhóm có tab (01_workflow GROUPS) ghi đủ các tab:
  // Âm thanh = Nhạc & SFX + Giọng & trộn. Bước không có ở đây (vd. 'queue' — hàng đợi Tự lái) hiện đủ ở mọi chế độ.
  const BASIC_RAIL = {
    prep: ['brands', 'wf-project'], // S24 M174: Cài đặt dự án (01_workflow.js) — cũ ở tab Dự án của cột phải
    source: ['wf-new'],
    build: ['wf-aihelp', 'tpl', 'text', 'audio', 'audioplus'],
    check: ['wf-qc'],
    ship: ['wf-export', 'wf-publish'],
    settings: ['wf-mode', 'wf-engines'],
  };
  // Mức của một panel. optLevel = opts.level của Studio.addPanel / mức trong bảng PANELS; 'pro' luôn thắng. Bước có bảng
  // BASIC_RAIL thì chỉ id trong bảng là 'basic' (panel tính năng mới gắn bước mà không có trong bảng: Chuyên nghiệp).
  function railLevel(id, step, optLevel) {
    if (optLevel === 'pro') return 'pro';
    const list = BASIC_RAIL[step];
    if (!list) return 'basic';
    return list.includes(id) ? 'basic' : 'pro';
  }
  const railShown = (id, step, level, optLevel) => norm(level) === 'pro' || railLevel(id, step, optLevel) === 'basic';

  // Cột phải (68_right.core.js): Cơ bản không có tab Lớp; tab Claude ở cả hai chế độ (S24 M170, C34, C35); bỏ tab Dự án (M174, C37).
  const RIGHT_TABS = { basic: ['props', 'claude'], pro: ['props', 'layers', 'claude'] };
  const rightTabs = level => RIGHT_TABS[norm(level)];

  // Thuộc tính (68_sections.core.js): ở Cơ bản hiện Núm và mục chính (khoá 'basic' của lõi inspector; không có thì mục đầu không
  // phải Núm). Còn lại — kể cả Keyframe / Mặt nạ / Nâng cao — vào "Thêm thuộc tính". S24 M172 (C36): bỏ mục Hỏi Claude ('ai').
  const BASIC_SECS = ['knobs'];
  const MAIN = 'basic';
  function splitSections(secs, level) {
    const list = Array.isArray(secs) ? secs : [];
    if (norm(level) === 'pro') return { main: list, more: [] };
    const main = list.find(s => s.key === MAIN) || list.find(s => !BASIC_SECS.includes(s.key));
    const keep = s => s === main || BASIC_SECS.includes(s.key);
    return { main: list.filter(keep), more: list.filter(s => !keep(s)) };
  }

  // C13: chế độ lúc mở Studio. Đã chọn (avs.uiLevel) thì giữ; chưa chọn: người mới (chưa có onboarding.json) vào Cơ bản, người
  // đang dùng giữ Chuyên nghiệp. isNew = null khi chưa đọc được trạng thái hướng dẫn (dùng Chuyên nghiệp như trước).
  function initialLevel(saved, isNew) {
    if (LEVELS.includes(saved)) return saved;
    return isNew === true ? 'basic' : 'pro';
  }

  const T = { LEVELS, LABEL, BASIC_RAIL, RIGHT_TABS, BASIC_SECS, MAIN, norm, railLevel, railShown, rightTabs, splitSections, initialLevel };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.LevelCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
