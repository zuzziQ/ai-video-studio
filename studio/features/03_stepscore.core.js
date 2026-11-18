// S23 M164 (C32): lõi thuần của điểm trên thanh bước (giao diện 03_stepscore.js). Không DOM: chạy trong trình duyệt
// (window.StepScoreCore) và trong Node (scripts/tests/s23_score_stepper.test.mjs).
//   tone(score, warnBelow)  → 'low' (dưới ScoreCore.WARN_BELOW) | 'full' (100) | 'mid'
//   askOf(step, id, allowed) → việc của thanh Hỏi Claude (75_ask.core.js) giao được cho tiêu chí chưa đạt, hoặc null (mở chỗ sửa)
//   view(st, opt)            → dữ liệu popover từ Studio.nextStep.state(step) (tasks: label, done, opt, miss, lost, go)
// Không tính điểm: điểm và tiêu chí là của ScoreCore (02_score.core.js).
'use strict';
(function (root) {
  // tiêu chí (id của ScoreCore) → [việc AskCore, tham số, nhãn nút]. Tiêu chí không có ở đây (tên, logo, video nguồn, xuất…)
  // cần người dùng tự làm: bấm thì mở chỗ sửa như nút Sửa của tab Dự án.
  const ASK = {
    prep: { color: ['brand_ai', {}, 'Claude dựng bộ thương hiệu'], product: ['product_ai', {}, 'Claude viết hồ sơ sản phẩm'] },
    source: { clean: ['clean_speech', { claude: 'khong' }, 'Claude dò lỗi nói'] },
    build: {
      template: ['ai_build', { density: 'vua' }, 'Claude dựng cả video'],
      gap: ['autofill', { mode: 'broll' }, 'Claude thêm b-roll vào chỗ trống'],
      broll: ['autofill', { mode: 'broll' }, 'Claude thêm b-roll'],
      music: ['autofill', { mode: 'sfx' }, 'Claude thêm nhạc & SFX'],
    },
    check: { quick: ['qc_fix_all', {}, 'Claude kiểm tra và sửa lỗi'], qc: ['qc_fix_all', {}, 'Claude kiểm tra và sửa lỗi'] },
    ship: {},
  };

  const tone = (score, warnBelow = 60) => (score < warnBelow ? 'low' : score >= 100 ? 'full' : 'mid');

  /** allowed: id việc của phạm vi bước (AskCore.actionsOf(scopeOf({ step })).map(a => a.id)); bỏ trống = không kiểm. */
  function askOf(step, id, allowed) {
    const a = ASK[step] && ASK[step][id];
    if (!a || (Array.isArray(allowed) && !allowed.includes(a[0]))) return null;
    return { action: a[0], params: { ...a[1] }, label: a[2] };
  }

  /** opt: { name, ready, warnBelow, allowed }. fail: tiêu chí chưa đạt, việc chính trước rồi điểm mất nhiều trước; pass: đã đạt. */
  function view(st, opt = {}) {
    const tasks = (st && st.tasks) || [], score = Math.max(0, Math.min(100, Math.round(+st?.score || 0)));
    const fail = tasks.map((t, i) => ({ t, i })).filter(x => !x.t.done)
      .sort((a, b) => (!!a.t.opt - !!b.t.opt) || (+b.t.lost || 0) - (+a.t.lost || 0) || a.i - b.i)
      .map(({ t, i }) => ({ i, id: t.id, label: t.label, miss: t.miss || '', lost: +t.lost || 0, opt: !!t.opt, ask: askOf(st.step, t.id, opt.allowed) }));
    const pass = tasks.map((t, i) => ({ i, id: t.id, label: t.label })).filter(x => tasks[x.i].done);
    const name = opt.name || st?.step || '';
    return { step: st?.step, score, ready: opt.ready !== false, tone: tone(score, opt.warnBelow),
      title: opt.ready === false ? `${name} · đang đọc…` : `${name} ${score}/100`, fail, pass };
  }

  const api = { ASK, tone, askOf, view };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StepScoreCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
