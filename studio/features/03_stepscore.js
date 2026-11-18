// S23 M164 (C32): điểm từng bước nằm trên thanh bước (01_workflow.js #wf-steps), không còn chip + thanh ở tab Dự án.
//   Vòng điểm: viền tròn quanh số bước (0–100, màu theo ScoreCore.WARN_BELOW / đầy), không làm thanh rộng thêm.
//   Popover (rê chuột hoặc focus bàn phím vào nút bước): "Kiểm tra 56/100", mục chưa đạt kèm vì sao và điểm mất, mục đã đạt thu gọn.
//   Bấm mục: bước có việc trên thanh Hỏi Claude (StepScoreCore.askOf → Studio.ask.run, việc theo bước của M154) thì giao việc đó,
//   không thì mở chỗ sửa như nút Sửa của tab Dự án (Studio.nextStep.fix). Esc đóng; ↓ từ nút bước vào popover.
// Dữ liệu: Studio.nextStep.state(step) (03_nextstep.js), lõi thuần 03_stepscore.core.js. CSS ở khối "S23 M164" cuối studio.css.
'use strict';
(() => {
  const S = window.Studio, SC = window.ScoreCore, P = window.StepScoreCore;
  if (!S || !SC || !P) return console.error('03_stepscore: thiếu 02_score.core.js / 03_stepscore.core.js');
  const $ = s => document.querySelector(s), esc = S.esc;
  const NAME = { prep: 'Chuẩn bị', source: 'Nguồn', build: 'Dựng', check: 'Kiểm tra', ship: 'Xuất và đăng' };
  const nav = () => $('#wf-steps');

  const pop = document.createElement('div');
  pop.id = 'wf-sp'; pop.hidden = true; pop.setAttribute('role', 'group');
  document.body.appendChild(pop);
  let cur = null, hideT = 0, last = '', mute = null; // mute: nút vừa nhận lại focus sau Esc, không mở lại popover

  // việc của thanh Hỏi Claude giao được ở bước (AskCore.actionsOf của phạm vi bước)
  // 75_ask.core.js nạp sau file này (tên file): đọc window.AskCore lúc dùng
  const allowed = step => { const AC = window.AskCore; return AC ? AC.actionsOf(AC.scopeOf({ step })).map(a => a.id) : []; };
  const ready = () => S.nextStep?.ready?.() !== false;
  function viewOf(step) {
    const st = S.nextStep.state(step);
    return { st, v: P.view(st, { name: NAME[step], ready: ready(), warnBelow: SC.WARN_BELOW, allowed: S.ask?.run ? allowed(step) : [] }) };
  }

  // ---------- vòng điểm ----------
  function rings() {
    const n = nav(); if (!n || !S.TL || !S.nextStep?.state) return;
    let sc; try { sc = S.nextStep.scores(); } catch { return; }
    const sig = JSON.stringify([ready(), SC.STEPS.map(k => sc[k].score)]);
    if (sig === last && n.querySelector('.sp-ring')) return;
    last = sig;
    for (const b of n.querySelectorAll('button[data-step]')) {
      const k = b.dataset.step, s = sc[k]?.score ?? 0, num = b.querySelector('b'); if (!num) continue;
      num.classList.add('sp-ring');
      num.classList.remove('is-low', 'is-mid', 'is-full', 'is-wait');
      num.classList.add(ready() ? 'is-' + P.tone(s, SC.WARN_BELOW) : 'is-wait');
      num.style.setProperty('--sp', ready() ? s : 0); // độ dài vòng đặt bằng JS (HTML không có style nội tuyến)
      b.setAttribute('aria-label', `Bước ${SC.STEPS.indexOf(k) + 1}: ${NAME[k]}${ready() ? `, ${s}/100 điểm` : ''}`);
      b.removeAttribute('title'); // popover thay tooltip
    }
    if (cur && !pop.hidden) paint(cur);
  }
  let ringT = 0;
  const soon = () => { if (!ringT) ringT = setTimeout(() => { ringT = 0; rings(); }, 250); };
  (S._ov = S._ov || []).push(soon);
  (S._rail = S._rail || []).push(soon);
  (S.nextStep?._paint || []).push(rings);

  // ---------- popover ----------
  function paint(btn) {
    const step = btn.dataset.step, { v } = viewOf(step);
    const item = (f, k) => `<li><button data-sp-i="${f.i}" data-sp-k="${k}">
      <i class="ti ${f.ask ? 'ti-sparkles' : f.opt ? 'ti-alert-circle' : 'ti-circle-dashed'}" aria-hidden="true"></i>
      <span><b>${esc(f.label)}${f.opt ? ' (nên làm)' : ''}</b>${f.miss ? `<small>${esc(f.miss)}</small>` : ''}
        <small class="sp-act">${esc(f.ask ? f.ask.label : 'Mở chỗ sửa')}</small></span>${f.lost ? `<em>−${f.lost}</em>` : ''}</button></li>`;
    pop.innerHTML = `<div id="wf-sp-sum"><div class="sp-h"><b>${esc(v.title)}</b>${v.fail.length ? `<span>${v.fail.length} mục chưa đạt</span>` : '<span>Đạt hết</span>'}</div>
      ${v.fail.length ? `<ul class="sp-fail" aria-label="Mục chưa đạt">${v.fail.map(item).join('')}</ul>` : ''}</div>
      ${v.pass.length ? `<details class="sp-pass"><summary>${v.pass.length} mục đã đạt</summary><ul>${v.pass.map(p => `<li><i class="ti ti-circle-check" aria-hidden="true"></i>${esc(p.label)}</li>`).join('')}</ul></details>` : ''}`;
    pop.classList.toggle('is-low', v.tone === 'low');
    pop.dataset.step = step;
  }
  function place(btn) {
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.top = r.bottom + 6 + 'px';
    pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  }
  function show(btn) {
    clearTimeout(hideT);
    if (!S.TL || !S.nextStep?.state) return;
    if (cur && cur !== btn) cur.removeAttribute('aria-describedby');
    cur = btn; paint(btn); pop.hidden = false; place(btn);
    btn.setAttribute('aria-describedby', 'wf-sp-sum'); btn.setAttribute('aria-expanded', 'true');
    S.nextStep.peek?.(); // đọc lại QC / bản xuất (tối đa mỗi 8 s ở 03_nextstep): vòng + popover vẽ lại khi xong
  }
  function hide(now) {
    clearTimeout(hideT);
    const go = () => { pop.hidden = true; if (cur) { cur.removeAttribute('aria-describedby'); cur.setAttribute('aria-expanded', 'false'); } cur = null; };
    if (now) go(); else hideT = setTimeout(go, 180);
  }
  const inside = el => el && (pop.contains(el) || (cur && cur.contains(el)));

  document.addEventListener('mouseover', e => { const b = e.target.closest?.('#wf-steps button[data-step]'); if (b) show(b); else if (cur) { if (inside(e.target) || pop.contains(document.activeElement)) clearTimeout(hideT); else hide(); } });
  document.addEventListener('focusin', e => {
    const b = e.target.closest?.('#wf-steps button[data-step]');
    if (b && b === mute) { mute = null; return; }
    mute = null;
    if (b) return show(b);
    if (cur && !inside(e.target)) hide(true);
  });
  document.addEventListener('keydown', e => {
    if (pop.hidden || !cur) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const b = cur, back = pop.contains(document.activeElement); hide(true); if (back) { mute = b; b.focus(); } return; }
    if (e.key === 'ArrowDown' && document.activeElement === cur) { e.preventDefault(); pop.querySelector('button, summary')?.focus(); return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && pop.contains(document.activeElement)) {
      const all = [...pop.querySelectorAll('button, summary')], i = all.indexOf(document.activeElement);
      e.preventDefault();
      if (e.key === 'ArrowUp' && i <= 0) return cur.focus();
      all[Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    }
  }, true);
  window.addEventListener('resize', () => { if (cur && !pop.hidden) place(cur); });
  pop.addEventListener('toggle', () => { if (cur) place(cur); }, true);

  // bấm mục: giao việc cho thanh Hỏi Claude, không có việc thì mở chỗ sửa
  pop.addEventListener('click', e => {
    const b = e.target.closest('[data-sp-i]'); if (!b) return;
    const step = pop.dataset.step, { st, v } = viewOf(step), f = v.fail.find(x => x.i === +b.dataset.spI), t = st.tasks[+b.dataset.spI];
    hide(true);
    if (!t) return;
    if (f?.ask && S.ask?.run) {
      if (S.workflow?.step !== step) S.workflow?.goStep(step);
      if (S.ask.run(f.ask.action, f.ask.params, step)) return;
    }
    S.nextStep.fix(t)();
  });

  S.stepScore = { show, hide, rings, view: step => viewOf(step).v };
  S.onReady(() => { rings(); setTimeout(rings, 400); });
})();
