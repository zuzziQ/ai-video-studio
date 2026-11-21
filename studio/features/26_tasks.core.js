// S27 M201: lõi thuần của bước "Bạn muốn làm gì?" (panel AI dựng, bước Dựng). Chủ repo 2026-11-20: thêm video → thêm kịch bản
// (mục riêng ngay dưới Video nguồn) → hỏi người dùng cần làm gì, mỗi việc một lựa chọn, không tick sẵn, không tự làm thêm việc
// không chọn. Chỉ Tự lái (hàng đợi nền, 15_autopilot.js) làm tự động hết theo mẫu.
// Không DOM: 26_tasks.js vẽ và chạy; test scripts/tests/s27_m201.test.mjs. Chạy trong trình duyệt (window.TasksCore) và Node.
'use strict';
(function (root) {
  // kind: 'run' = Studio làm rồi báo kết quả (vẫn hoàn tác được) · 'list' = dò rồi đưa danh sách để bạn tự chọn chỗ cắt ·
  // 'open' = mở công cụ để bạn tự chỉnh. need: điều kiện để chọn được. claude: việc này đi qua một lượt AI dựng của Claude.
  const TASKS = [
    { id: 'cut', icon: 'ti-scissors', label: 'Cắt chỗ thừa', hint: 'Dò lỗi nói, từ đệm, khoảng lặng dài; bạn chọn chỗ cắt', kind: 'list', need: 'captions' },
    { id: 'face', icon: 'ti-face-id', label: 'Cố định mặt', hint: 'Bám mặt người nói, giữ mặt trong khung khi đổi khổ', kind: 'run', need: 'video' },
    { id: 'look', icon: 'ti-adjustments', label: 'Tinh chỉnh hình', hint: 'Mở Bộ lọc: màu, sáng, tương phản', kind: 'open' },
    { id: 'aroll', icon: 'ti-user-square', label: 'A-roll theo kịch bản', hint: 'Tìm lời ngoài kịch bản để cắt, chọn lần quay tốt (take)', kind: 'list', need: 'script' },
    { id: 'broll', icon: 'ti-movie', label: 'Thêm B-roll', hint: 'Chữ nổi, ảnh, video minh hoạ đúng lúc nói', kind: 'run', need: 'captions' },
    { id: 'music', icon: 'ti-music', label: 'Thêm nhạc và SFX', hint: 'Nhạc nền theo đoạn, hiệu ứng âm thanh theo cảnh', kind: 'run' },
    { id: 'graphic', icon: 'ti-wand', label: 'Graphic và style', hint: 'Claude chọn gói style, viết hook, đặt graphic theo lời thoại', kind: 'run', need: 'captions', claude: true },
    { id: 'caption', icon: 'ti-text-spellcheck', label: 'Sửa lỗi phụ đề', hint: 'Claude sửa chữ nhận dạng sai, giữ thời gian từng từ', kind: 'run', need: 'captions', claude: true },
  ];
  const byId = id => TASKS.find(t => t.id === id);
  const WHY = { captions: 'Cần lời thoại trước (bước Nguồn)', script: 'Cần kịch bản (bước Nguồn → Kịch bản)', video: 'Dự án chưa có clip video', claude: 'Cần Claude Code trên máy' };

  // ctx = { captions: bool, script: bool, video: bool, claude: bool|null } → { ok, why }
  function avail(id, ctx = {}) {
    const t = byId(id); if (!t) return { ok: false, why: 'Không có việc này' };
    if (t.need && !ctx[t.need]) return { ok: false, why: WHY[t.need] };
    // claude === null: chưa kiểm xong, vẫn cho chọn (server từ chối thì báo lúc chạy)
    if (t.claude && ctx.claude === false) return { ok: false, why: WHY.claude };
    return { ok: true, why: '' };
  }

  // Thứ tự chạy các việc đã chọn (mỗi bước một việc nền, lần lượt): cắt nhịp chỉ dò (bạn tự cắt) → bám mặt → một lượt Claude cho
  // graphic / phụ đề (nhạc đi kèm lượt đó khi có, để nhạc theo dấu MOOD của kịch bản) → B-roll → nhạc tự động khi không có lượt Claude
  // → A-roll (danh sách) → mở Bộ lọc cuối cùng (mở panel khác nên để sau mọi việc chạy nền).
  // → [{ step: 'cut'|'face'|'claude'|'broll'|'music'|'aroll'|'look', parts?: ['graphic','caption','music'] }]
  function steps(sel) {
    const s = new Set((Array.isArray(sel) ? sel : [...(sel || [])]).filter(byId));
    const parts = ['graphic', 'caption'].filter(k => s.has(k));
    if (parts.length && s.has('music')) parts.push('music');
    const out = [];
    if (s.has('cut')) out.push({ step: 'cut' });
    if (s.has('face')) out.push({ step: 'face' });
    if (parts.length) out.push({ step: 'claude', parts });
    if (s.has('broll')) out.push({ step: 'broll' });
    if (s.has('music') && !parts.length) out.push({ step: 'music' });
    if (s.has('aroll')) out.push({ step: 'aroll' });
    if (s.has('look')) out.push({ step: 'look' });
    return out;
  }

  // Lượt Claude chỉ làm phần đã chọn: kế hoạch đầy đủ của ai_edit.mjs vẫn về, Studio chỉ áp phần trong parts (applyPlan {only}).
  // → { graphic, caption, music } (true = áp phần đó; thiếu parts = áp hết như AI dựng cũ / Hỏi Claude)
  function onlyOf(parts) {
    if (!parts) return { graphic: true, caption: true, music: true };
    const p = new Set(parts);
    return { graphic: p.has('graphic'), caption: p.has('caption'), music: p.has('music') };
  }

  const T = { TASKS, WHY, byId, avail, steps, onlyOf };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.TasksCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
