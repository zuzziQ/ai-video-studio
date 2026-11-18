// S21 M146: lõi thuần của Thuộc tính dạng mục xếp chồng (như Premiere Pro Properties). Mỗi "tab" cũ của inspector (lõi inspTabs +
// Studio.addInspectorTab, chữ ký [key, label, html]) thành một mục thu gọn được; dải mục dính dưới đầu inspector để nhảy nhanh.
// Không DOM: studio.js (renderInspector) gọi các hàm ở đây. Chạy trong trình duyệt (window.SectCore) và Node (scripts/tests/s21_sections.test.mjs).
'use strict';
(function (root) {
  // Mục ẩn ở chế độ Cơ bản (01_workflow.js, avs.uiLevel): Keyframe, Mặt nạ, Nâng cao (JSON) — như ẩn tab trước M146.
  const PRO = ['kf', 'mask', 'json'];
  // Mục luôn đứng đầu (và vì thế mở sẵn như mục đầu): Núm điều chỉnh (S21 M148, 71_knobs.js).
  const FIRST = ['knobs'];
  const ICON = {
    basic: 'ti-forms', anim: 'ti-sparkles', pos: 'ti-arrows-move', json: 'ti-code', kf: 'ti-timeline-event', mask: 'ti-mask',
    shape: 'ti-shape', hf: 'ti-box', reframe: 'ti-focus-centered', alts: 'ti-arrows-shuffle', fade: 'ti-chart-line', fx: 'ti-wave-sine',
    trk: 'ti-adjustments-alt', knobs: 'ti-adjustments-horizontal', speed: 'ti-brand-speedtest', color: 'ti-color-filter', audio: 'ti-volume', trans: 'ti-transition-right',
  };
  const iconOf = k => ICON[String(k).replace(/-\d+$/, '')] || 'ti-point';

  // Danh sách tab → danh sách mục theo đúng thứ tự (lõi trước, tính năng sau). Bỏ phần tử hỏng; khoá trùng được hậu tố -2, -3
  // (trước M146 tab trùng khoá không mở được; nay mỗi mục đều hiện).
  function normalize(tabs) {
    const seen = {}, out = [];
    for (const t of tabs || []) {
      if (!Array.isArray(t) || t[0] == null || t[0] === '') continue;
      const base = String(t[0]); seen[base] = (seen[base] || 0) + 1;
      const key = seen[base] > 1 ? `${base}-${seen[base]}` : base;
      out.push({ key, label: String(t[1] ?? base), html: t[2] == null ? '' : String(t[2]), icon: iconOf(key), pro: PRO.includes(base) });
    }
    const first = s => FIRST.includes(s.key);
    const res = [...out.filter(first), ...out.filter(s => !first(s))];
    return res; // S24 M172: bỏ luật "Hỏi Claude là mục thứ hai" của M149 — Thuộc tính không còn mục đó
  }
  // Mục thấy được theo chế độ giao diện (trước S22). S22 M151: studio.js dùng split — ở Cơ bản mục ngoài Núm / mục
  // chính (LevelCore.splitSections) thu sau "Thêm thuộc tính", kể cả Keyframe / Mặt nạ / Nâng cao, nên không mục nào mất hẳn.
  const visible = (secs, basic) => (basic ? secs.filter(s => !s.pro) : secs);
  const split = (secs, basic, L = root.LevelCore) => (L ? L.splitSections(secs, basic ? 'basic' : 'pro') : { main: visible(secs, basic), more: basic ? secs.filter(s => s.pro) : [] });

  // Trạng thái mở / đóng nhớ theo loại element: { [kind]: { [key]: true|false } } (localStorage avs.isec).
  function parse(str) {
    try { const v = JSON.parse(str || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
  }
  // Chưa từng bấm: chỉ mục đầu (trong số mục thấy được) mở sẵn.
  const isOpen = (state, kind, key, first) => (typeof state?.[kind]?.[key] === 'boolean' ? state[kind][key] : !!first);
  function setOpen(state, kind, key, open) {
    const s = { ...(state || {}) }; s[kind] = { ...(s[kind] || {}), [key]: !!open }; return s;
  }

  // Mục đang thấy trong vùng cuộn: tops = [[key, top]] theo thứ tự DOM (top đo so với mép trên vùng cuộn), line = đáy phần dính
  // (dải tab + đầu inspector + dải mục). Mục cuối có đầu mục đã lên tới line; chưa mục nào thì mục đầu. Cuộn chạm đáy → mục cuối.
  function active(tops, line, atBottom = false) {
    if (!tops?.length) return null;
    if (atBottom) return tops[tops.length - 1][0];
    let k = tops[0][0];
    for (const [key, top] of tops) if (top <= line + 2) k = key;
    return k;
  }

  const T = { PRO, FIRST, ICON, iconOf, normalize, visible, split, parse, isOpen, setOpen, active };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.SectCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
