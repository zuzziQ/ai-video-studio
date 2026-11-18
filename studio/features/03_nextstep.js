// AI Video Studio — dữ liệu điểm 0–100 từng bước (S14 M113, M114) và chỗ sửa của từng tiêu chí. Rà hiện trạng, tiêu chí:
// docs/plans/S14-xuat-cot-phai-diem.md. S23 M164 (C32): điểm 5 bước + tiêu chí đạt / thiếu nằm ở vòng điểm + popover của thanh bước
// (03_stepscore.js, đọc Studio.nextStep.state / fix / _paint). S24 M174 (C37): bỏ tab Dự án của cột phải — file này không vẽ gì ở
// cột phải nữa; "Cài đặt dự án" là panel wf-project ở bước Chuẩn bị (01_workflow.js). Điểm tính bằng lõi thuần 02_score.core.js (window.ScoreCore) từ dữ liệu sẵn có, không gọi Claude: timeline, lời
// thoại, PACKS[].needs của gói, GET /api/source (phụ đề cháy sẵn M110), GET /api/ai/fillers, QC nhanh M105 `GET /api/qc/quick`,
// QC đầy đủ `GET /api/qc`, bản xuất M112 `Studio.exports` (exportsView của scripts/exports_log.mjs qua GET /api/exports).
// fix(task) → Studio.workflow.focus(panel, chỗ cần làm) theo bảng TASKS: mở đúng panel bên trái và tô sáng.
// C17: bấm Xuất khi bước Kiểm tra dưới ScoreCore.WARN_BELOW thì hiện cảnh báo kèm chỗ thiếu và nút "Vẫn xuất" (không chặn).
// Không thêm route.
'use strict';
(() => {
  const S = Studio, $ = s => document.querySelector(s), esc = S.esc, C = window.ScoreCore;
  if (!C) return console.error('03_nextstep: thiếu 02_score.core.js');
  const ORDER = C.STEPS;
  // dữ liệu ngoài timeline, đọc lại tối đa mỗi 8 s (focus cửa sổ, đổi bước, mở popover điểm)
  const D = { qc: null, quick: null, src: null, fill: null, dir: null, ready: false };
  let fetchedAt = 0, busy = null;

  // go(panel, selectors, at): mở panel bên trái + tô sáng (M113); at = giây cần tua tới (khoảng trống dài)
  const go = (id, sel, at) => () => {
    if (at != null && S.setTime) S.setTime(at);
    return S.workflow ? S.workflow.focus(id, sel) : typeof openPanel === 'function' && openPanel(id);
  };
  const latest = () => (S.exports && S.exports.latest()) || null;

  // chỗ sửa của từng tiêu chí (id = id mục của ScoreCore): go: [panel, [selector…]]. Nhãn, câu vì sao, điểm: ScoreCore.
  const TASKS = {
    prep: {
      name: ['brands', [], null, 'name'], // brandEdit: mở biểu mẫu của thương hiệu đang dùng (chưa có thì tạo mới) rồi vào đúng ô
      logo: ['brands', [], null, 'logo'],
      color: ['brands', [], null, 'color'],
      product: ['products', ['.pr-cur', '.pr-it', '.wf-card']],
    },
    source: {
      video: ['wf-new', ['.wf-src', '[data-wf="src-change"]']],
      speech: ['wf-new', ['[data-transcribe]', '.wf-st li:nth-child(1)']],
      clean: ['ai', ['[data-ai="detect"]']],
      face: ['wf-new', ['.wf-st li:nth-child(3)']],
      burn: ['wf-new', ['.wf-burn-opts button', '.wf-burn']],
    },
    build: {
      template: ['wf-aihelp', ['[data-ai="build"]', '.ai-card']],
      captions: ['text', ['.cslist button.on', '.cslist']],
      gap: ['wf-aihelp', ['[data-ai="build"]']],
      broll: ['aibroll', []],
      music: ['audio', []],
    },
    check: {
      quick: ['wf-aihelp', ['[data-ai="qc"]', '.ai-card']],
      qc: ['wf-qc', ['#qcbox', '.ai-card']],
    },
    ship: {
      export: ['wf-export', ['[data-xp="export"]']],
      deliver: ['wf-export', ['[data-xp="give"]', '.xp-it']],
    },
  };
  // danh sách tiêu chí trong hộp cảnh báo Xuất (C17); khối .ns của tab Dự án cũ đã bỏ (M174)
  const css = document.createElement('style');
  css.textContent = `
  .ns-tasks { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .ns-tasks li { display: flex; align-items: flex-start; gap: 8px; padding: 6px 8px; border: 1px solid var(--line); border-radius: var(--r);
    color: var(--tx2); font-size: 12px; line-height: 1.4; min-width: 0; }
  .ns-tasks li > .ti { flex: none; font-size: 16px; }
  .ns-tasks li > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .ns-tasks small { display: block; color: var(--tx3); font-size: 11px; }
  .ns-tasks em { font-style: normal; color: var(--warn); font-variant-numeric: tabular-nums; }
  .ns-tasks li button { flex: none; height: 24px; padding: 0 8px; font-size: 11px; }
  /* is-*, không .ok/.warn: studio.css có #insp .ok (banner trạng thái) đẩy phần tử xuống (dev-memory ai-video-studio-026) */
  .ns-tasks li.is-done { color: var(--tx); } .ns-tasks li.is-done > .ti { color: var(--ok); }
  .ns-tasks li.is-next { border-color: var(--acc-line); background: var(--acc-soft); color: var(--tx); }
  .ns-tasks li.is-opt:not(.is-done) > .ti { color: var(--warn); }
  #modalbox .ns-warn { margin: 8px 0 12px; }
  `;
  document.head.appendChild(css);

  function refresh(force) {
    if (busy) return force ? busy.then(() => refresh(true)) : busy; // lần ép làm mới (vừa xuất xong) không nhận kết quả của lượt đang bay
    if (!S.TL || (!force && Date.now() - fetchedAt < 8000)) return Promise.resolve();
    const dir = S.META?.dir;
    if (D.dir !== dir) { D.qc = D.quick = D.src = D.fill = null; D.ready = false; D.dir = dir; }
    const get = u => S.api(u).catch(() => null);
    busy = Promise.all([get('/api/qc'), get('/api/qc/quick'), get('/api/source'), get('/api/ai/fillers'),
      // làm mới vẽ lại panel Xuất nếu đang mở: hoãn khi panel đang tô sáng chỗ cần làm (Studio.workflow.focus) để không mất nó
      S.exports && !(S.exports.loaded() && $('#libbody .wf-flash')) ? S.exports.refresh().catch(() => null) : null])
      .then(([q, k, src, fill]) => { if (S.META?.dir === dir) Object.assign(D, { qc: q, quick: k, src, fill, ready: true }); })
      .finally(() => { busy = null; fetchedAt = Date.now(); paint(); });
    return busy;
  }

  /** Dữ liệu cho ScoreCore.score: chỉ dữ liệu sẵn có, gói đọc từ PACKS (engine) theo TL.pack. */
  function input() {
    const pack = (S.win?.PACKS || []).find(p => p.id === S.TL.pack) || null;
    const f = D.fill;
    return { tl: S.TL, caps: (S.CAP || []).length, pack, burn: D.src?.burnin || null, fillers: !!f && !f.none && !f.error && Array.isArray(f.cuts),
      quick: D.quick, qc: D.qc, latest: latest(), edited: S.exports?.edited?.() || null };
  }
  const scores = () => C.score(input()).steps;

  // bước đang nói tới: bước đang mở bên trái; Cài đặt / Tự lái → bước đầu còn việc chính chưa xong
  function stepNow(sc = scores()) {
    const st = S.workflow?.step;
    if (ORDER.includes(st)) return st;
    return ORDER.find(k => sc[k].items.some(t => !t.opt && !t.ok)) || 'ship';
  }

  /** Trạng thái một bước: { step, score, tasks:[{id, label, done, opt, miss, lost, go, at}], need, done, next } —
   *  next = tiêu chí chính đầu chưa đạt, rồi tiêu chí nên làm. go = [panel, selectors] của TASKS. */
  function state(step, sc = scores()) {
    step = ORDER.includes(step) ? step : stepNow(sc);
    const tasks = sc[step].items.map(i => ({ id: i.id, label: i.label, done: i.ok, opt: i.opt, miss: i.miss, lost: i.lost, at: i.at, go: TASKS[step][i.id] || ['wf-' + step, []] }));
    const main = tasks.filter(t => !t.opt);
    return { step, score: sc[step].score, tasks, need: main.length, done: main.filter(t => t.done).length,
      next: main.find(t => !t.done) || tasks.find(t => !t.done) || null };
  }
  const fix = t => (t.go[3] ? () => editBrand(t.go[3]) : go(t.go[0], t.go[1], t.at));

  // Nút "Sửa" của bước Chuẩn bị (tên, logo, màu): trước chỉ tô sáng panel Thương hiệu, nên khi biểu mẫu chưa mở hoặc dự án chưa
  // dùng thương hiệu nào thì không thấy gì xảy ra. Giờ: dự án đang dùng một thương hiệu → mở biểu mẫu sửa của nó; chưa có thương
  // hiệu nào → mở biểu mẫu tạo mới; có thương hiệu nhưng chưa áp → tô các thẻ và nói phải bấm "Áp dụng cho dự án".
  const FIELD = { name: '[data-bk="name"]', logo: '#bk-logo', color: '[data-bk="primary"]' };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function editBrand(field) {
    S.workflow?.focus('brands');
    let root = null;
    for (let i = 0; i < 25; i++) { root = $('#libbody'); if (root?.querySelector('.bk-card, #bk-new2')) break; await wait(80); }
    if (!root) return;
    if (!root.querySelector('.bk-form')) {
      const open = root.querySelector('.bk-card.cur [data-bke]') || (!root.querySelector('.bk-card') && root.querySelector('#bk-new2'));
      if (!open) {
        for (const c of root.querySelectorAll('.bk-card')) { c.classList.remove('wf-flash'); void c.offsetWidth; c.classList.add('wf-flash'); }
        return S.toast('Dự án chưa dùng thương hiệu nào: bấm “Áp dụng cho dự án” ở thương hiệu muốn dùng, hoặc + để tạo mới');
      }
      open.click();
      for (let i = 0; i < 15 && !root.querySelector('.bk-form'); i++) await wait(60);
    }
    const el = root.querySelector(FIELD[field] || FIELD.name); if (!el) return;
    el.scrollIntoView({ block: 'center' }); el.classList.remove('wf-flash'); void el.offsetWidth; el.classList.add('wf-flash');
    el.focus({ preventScroll: true }); setTimeout(() => el.classList.remove('wf-flash'), 1600);
  }

  // danh sách tiêu chí; data = thuộc tính nút Sửa (hộp cảnh báo Xuất: data-nsx-i)
  const list = (st, data, only) => `<ul class="ns-tasks">${st.tasks.map((t, k) => (only && t.done ? '' : `<li class="${t.done ? 'is-done' : ''} ${t === st.next ? 'is-next' : ''} ${t.opt ? 'is-opt' : ''}">
    <i class="ti ${t.done ? 'ti-circle-check' : t.opt ? 'ti-alert-circle' : 'ti-circle-dashed'}"></i>
    <span>${esc(t.label)}${t.opt && !t.done ? ' (nên làm)' : ''}${t.lost ? ` <em>−${t.lost}</em>` : ''}${t.done ? '' : `<small>${esc(t.miss)}</small>`}</span>
    ${t.done ? '' : `<button ${data}="${k}" title="Mở chỗ sửa ở thanh trái"><i class="ti ti-tool"></i>Sửa</button>`}</li>`)).join('')}</ul>`;

  const onPaint = []; // S23 M164: vòng điểm trên thanh bước (03_stepscore.js) vẽ lại khi dữ liệu điểm vừa đọc xong
  function paint() {
    for (const f of onPaint) { try { f(); } catch (e) { console.error(e); } }
  }

  // ---------- C17: cảnh báo khi Xuất mà bước Kiểm tra dưới WARN_BELOW (không chặn) ----------
  // Chỉ chặn lượt bấm thật của người dùng vào #export (thanh đầu) hoặc "Xuất video" của panel Xuất. Lượt .click() do code
  // (16_qc.js mở lại hộp Xuất sau khi QC sửa xong, "Vẫn xuất" ở đây) không có isTrusted nên đi thẳng tới studio.js.
  const openExport = () => document.getElementById('export')?.click();
  async function guardExport() {
    await Promise.race([refresh(true), new Promise(ok => setTimeout(ok, 1500))]);
    const st = state('check');
    if (st.score >= C.WARN_BELOW) return openExport();
    S.modal(`<h3><i class="ti ti-alert-triangle ui-text-warn"></i> Bước Kiểm tra mới được ${st.score}/100</h3>
      <p>Video vẫn xuất được, nhưng nên sửa các chỗ dưới trước khi đăng.</p>
      <div class="ns-warn">${list(st, 'data-nsx-i', true)}</div>
      <div class="actions"><button onclick="closeModal()">Huỷ</button><button class="primary" id="ns-xgo"><i class="ti ti-upload"></i> Vẫn xuất</button></div>`);
    const box = $('#modalbox');
    box.querySelector('#ns-xgo').onclick = () => { S.closeModal(); openExport(); };
    box.querySelector('.ns-warn').onclick = e => {
      const b = e.target.closest('[data-nsx-i]'), t = b && st.tasks[+b.dataset.nsxI]; if (!t) return;
      S.closeModal(); fix(t)();
    };
  }
  document.addEventListener('click', e => {
    if (!e.isTrusted || !S.TL || !e.target.closest?.('#export, [data-xp="export"]')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    guardExport().catch(err => { console.error(err); openExport(); });
  }, true);

  // đổi bước bên trái (01_workflow.js lọc thanh trái trước hook này) → vòng điểm vẽ lại, đọc lại dữ liệu
  let lastStep = null;
  (S._rail || []).push(() => { const st = S.workflow?.step; if (st !== lastStep) { lastStep = st; paint(); refresh(); } });
  window.addEventListener('focus', () => refresh());
  S.onReady(() => refresh(true));
  S.nextStep = { refresh: () => refresh(true), peek: () => refresh(), state, scores, paint, steps: ORDER, guardExport, fix, ready: () => D.ready, _paint: onPaint, editBrand };
})();
