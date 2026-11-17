// AI Video Studio — cột phải khi không chọn gì: ngữ cảnh của bước đang mở bên trái (S14 M113; thay thẻ "Bước tiếp theo" +
// "Sẵn sàng x/6" của M84, đợt S10) và điểm 0–100 từng bước (S14 M114). Rà hiện trạng, tiêu chí: docs/plans/S14-xuat-cot-phai-diem.md.
// Trên cùng: 5 ô điểm (Chuẩn bị, Nguồn, Dựng, Kiểm tra, Xuất); bấm một ô → tiêu chí đạt / thiếu của bước đó, mỗi chỗ thiếu một
// nút Sửa. Điểm tính bằng lõi thuần 02_score.core.js (window.ScoreCore) từ dữ liệu sẵn có, không gọi Claude: timeline, lời
// thoại, PACKS[].needs của gói, GET /api/source (phụ đề cháy sẵn M110), GET /api/ai/fillers, QC nhanh M105 `GET /api/qc/quick`,
// QC đầy đủ `GET /api/qc`, bản xuất M112 `Studio.exports` (exportsView của scripts/exports_log.mjs qua GET /api/exports).
// Nút Sửa → Studio.workflow.focus(panel, chỗ cần làm) theo bảng TASKS: mở đúng panel bên trái và tô sáng.
// C17: bấm Xuất khi bước Kiểm tra dưới ScoreCore.WARN_BELOW thì hiện cảnh báo kèm chỗ thiếu và nút "Vẫn xuất" (không chặn).
// Nội dung cũ của inspector (Dự án, Thương hiệu) vẫn trong mục thu gọn "Cài đặt dự án". Không thêm route.
'use strict';
(() => {
  const S = Studio, $ = s => document.querySelector(s), esc = S.esc, C = window.ScoreCore;
  if (!C) return console.error('03_nextstep: thiếu 02_score.core.js');
  const store = {
    get(k, d) { try { return localStorage.getItem('avs.' + k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('avs.' + k, v); } catch {} },
  };
  const ORDER = C.STEPS;
  const NAME = { prep: 'Chuẩn bị', source: 'Nguồn', build: 'Dựng', check: 'Kiểm tra', ship: 'Xuất và đăng' };
  const SHORT = { ...NAME, ship: 'Xuất' }; // nhãn ô điểm (5 ô một hàng)
  // dữ liệu ngoài timeline, đọc lại tối đa mỗi 8 s (focus cửa sổ, đổi bước, inspector vẽ lại)
  const D = { qc: null, quick: null, src: null, fill: null, dir: null, ready: false };
  let fetchedAt = 0, busy = null, view = null; // view: bước người dùng bấm ở hàng điểm (null = theo thanh trái)

  // go(panel, selectors, at): mở panel bên trái + tô sáng (M113); at = giây cần tua tới (khoảng trống dài)
  const go = (id, sel, at) => () => {
    if (at != null && S.setTime) S.setTime(at);
    return S.workflow ? S.workflow.focus(id, sel) : typeof openPanel === 'function' && openPanel(id);
  };
  const brand = () => (S.TL && S.TL.brand) || {};
  const capOn = () => (S.CAP || []).length > 0 && S.TL.caption_style !== 'none' && S.TL.burnin?.mode !== 'off';
  const aiScenes = () => (S.TL.scenes || []).filter(s => (s._ai || s._auto) && !s._base).length;
  const latest = () => (S.exports && S.exports.latest()) || null;
  const when = iso => { try { return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); } catch { return ''; } };

  // chỗ sửa của từng tiêu chí (id = id mục của ScoreCore): go: [panel, [selector…]]. Nhãn, câu vì sao, điểm: ScoreCore.
  const TASKS = {
    prep: {
      name: ['brands', ['.bk-card.cur', '#bk-new2', '.bk-card']],
      logo: ['brands', ['.bk-card.cur .bk-logo', '#bk-logo', '#bk-new2']],
      color: ['brands', ['.bk-card.cur .bk-sw', '#bk-new2']],
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
  // nút đi tiếp khi bước đã xong việc chính
  const NEXT = {
    prep: ['Sang bước Nguồn', 'ti-arrow-right', () => S.workflow.goStep('source')],
    source: ['Sang bước Dựng', 'ti-arrow-right', () => S.workflow.goStep('build')],
    build: ['Sang bước Kiểm tra', 'ti-arrow-right', () => S.workflow.goStep('check')],
    check: ['Sang bước Xuất', 'ti-arrow-right', () => S.workflow.goStep('ship')],
    ship: ['Mở gói đăng', 'ti-send', go('wf-publish')],
  };

  const css = document.createElement('style');
  css.textContent = `
  #insp > .ns { display: flex; flex-direction: column; gap: 12px; padding: 12px; min-width: 0; }
  .ns-step { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .ns-sc { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; min-width: 0; }
  .ns-sc button { height: auto; min-height: 44px; min-width: 0; padding: 4px 2px; flex-direction: column; gap: 2px; justify-content: center;
    background: transparent; border-color: var(--line); color: var(--tx2); font-size: 11px; line-height: 1.2; }
  .ns-sc button:hover { background: var(--bg3); color: var(--tx); }
  .ns-sc button span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ns-sc button b { font-size: 14px; color: var(--tx); font-variant-numeric: tabular-nums; }
  .ns-sc button.is-low b { color: var(--warn); } .ns-sc button.is-full b { color: var(--ok); }
  .ns-sc button.is-cur { border-color: var(--acc-line); background: var(--acc-soft); color: var(--tx); }
  .ns-rh { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .ns-k { font-size: 11px; font-weight: 600; color: var(--tx2); text-transform: uppercase; letter-spacing: .04em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .ns-rh b { margin-left: auto; color: var(--tx); font-size: 12px; flex: none; font-variant-numeric: tabular-nums; }
  .ns-bar { height: 4px; border-radius: 2px; background: var(--bg3); overflow: hidden; }
  .ns-bar i { display: block; height: 100%; background: var(--acc); }
  .ns-bar.is-low i { background: var(--warn); }
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
  .ns-res { border: 1px solid var(--line); background: var(--bg2); border-radius: var(--r); padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--tx2); line-height: 1.5; min-width: 0; }
  .ns-v { color: var(--tx); overflow-wrap: anywhere; min-width: 0; }
  .ns-v.is-warn { color: var(--warn); }
  .ns-lnk { align-self: flex-start; background: none; border: 0; padding: 0; height: auto; color: var(--acc); cursor: pointer; font-size: 12px; text-decoration: underline; }
  .ns-go { gap: 8px; justify-content: center; white-space: normal; height: auto; min-height: 32px; }
  .ns-more { border-top: 1px solid var(--line); margin: 0 -12px; }
  .ns-more > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 12px; font-size: 12px; font-weight: 600; color: var(--tx2); }
  .ns-more > summary::-webkit-details-marker { display: none; }
  .ns-more > summary:hover { color: var(--tx); }
  .ns-more > summary .ti-chevron-right { margin-left: auto; transition: transform .15s; }
  .ns-more[open] > summary .ti-chevron-right { transform: rotate(90deg); }
  .ns-link { color: var(--acc); cursor: pointer; text-decoration: underline; }
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

  // bước cột phải nói tới: bước đang mở bên trái; Cài đặt / Tự lái → bước đầu còn việc chính chưa xong
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
  const fix = t => go(t.go[0], t.go[1], t.at);

  function result(step) {
    const row = (k, v, warn, act) => `<div class="ns-res"><span class="ns-k">${esc(k)}</span><span class="ns-v ${warn ? 'is-warn' : ''}">${v}</span>${act || ''}</div>`;
    const lnk = (a, t) => `<button class="ns-lnk" data-ns="${a}">${esc(t)}</button>`;
    const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const quick = () => {
      const q = D.quick;
      if (!q) return row('QC nhanh', 'Đang đọc…');
      if (q.none || q.error) return row('QC nhanh', 'Chưa kiểm tra nhanh lần nào.', false, aiScenes() ? lnk('quick', 'Kiểm tra nhanh') : '');
      const n = (q.issues || []).length;
      return row('QC nhanh', `${n ? `${n} chỗ cần xem` : 'Không thấy lỗi vị trí'}${q.fix ? ` · đã sửa ${q.fixed}/${q.before}` : ''}${q.stale ? ' · đã sửa video sau lần này' : ''}`,
        n > 0 || q.stale, lnk('quick', n ? 'Xem và sửa' : q.stale ? 'Kiểm tra lại' : 'Xem lại'));
    };
    if (step === 'prep') { const b = brand(); return row('Thương hiệu của dự án', b.name ? esc(b.name) : 'Chưa có', !b.name); }
    if (step === 'source') return row('Video nguồn', `${mmss(S.TL.duration || 0)} · ${(S.CAP || []).length} câu lời thoại${capOn() ? ' · phụ đề bật' : ''}`);
    if (step === 'build') return row('Graphic', `${(S.TL.scenes || []).length} cảnh${aiScenes() ? ` · ${aiScenes()} do AI đặt` : ''}`) + quick();
    if (step === 'check') {
      const q = D.qc, full = !q ? row('QC đầy đủ', 'Đang đọc…') : q.none || q.error ? row('QC đầy đủ', 'Chưa chạy.')
        : row('QC đầy đủ', `${q.score ?? '?'} điểm · ${(q.issues || []).filter(i => !i.fixed).length} chỗ chưa sửa`, (q.score ?? 100) < 60, lnk('qc', 'Mở kết quả'));
      return full + quick();
    }
    if (step === 'ship') {
      if (!S.exports?.loaded?.()) return row('Bản xuất gần nhất', 'Đang đọc…');
      const x = latest();
      if (!x) return row('Bản xuất gần nhất', 'Chưa xuất bản nào.');
      const name = String(x.files[0]?.file || '').split(/[\\/]/).pop(), ok = C.fresh(x, S.exports.edited?.());
      return row('Bản xuất gần nhất', `${esc(name)}<br>${esc(when(x.at))}${x.missing ? ' · file đã bị xoá' : ok ? '' : ' · đã sửa video sau bản này'}`,
        x.missing || !ok, lnk('export', 'Mở bản xuất'));
    }
    return '';
  }

  // danh sách tiêu chí; data = thuộc tính nút Sửa (cột phải: data-ns-i, hộp cảnh báo Xuất: data-nsx-i)
  const list = (st, data, only) => `<ul class="ns-tasks">${st.tasks.map((t, k) => (only && t.done ? '' : `<li class="${t.done ? 'is-done' : ''} ${t === st.next ? 'is-next' : ''} ${t.opt ? 'is-opt' : ''}">
    <i class="ti ${t.done ? 'ti-circle-check' : t.opt ? 'ti-alert-circle' : 'ti-circle-dashed'}"></i>
    <span>${esc(t.label)}${t.opt && !t.done ? ' (nên làm)' : ''}${t.lost ? ` <em>−${t.lost}</em>` : ''}${t.done ? '' : `<small>${esc(t.miss)}</small>`}</span>
    ${t.done ? '' : `<button ${data}="${k}" title="Mở chỗ sửa ở thanh trái"><i class="ti ti-tool"></i>Sửa</button>`}</li>`)).join('')}</ul>`;

  function html() {
    const sc = scores(), cur = ORDER.includes(view) ? view : stepNow(sc), st = state(cur, sc), i = ORDER.indexOf(cur), todo = st.next, main = todo && !todo.opt;
    const nx = NEXT[cur], low = v => v < C.WARN_BELOW;
    const chip = (k, n) => `<button data-ns-step="${k}" class="${k === cur ? 'is-cur' : ''} ${low(sc[k].score) ? 'is-low' : sc[k].score >= 100 ? 'is-full' : ''}"
      aria-pressed="${k === cur}" title="${esc(NAME[k])}: ${sc[k].score}/100 — xem tiêu chí"><span>${esc(SHORT[k])}</span><b>${D.ready ? sc[k].score : '…'}</b></button>`;
    return `<div class="ns-sc" role="group" aria-label="Điểm từng bước">${ORDER.map(chip).join('')}</div>
      <div class="ns-rh" aria-live="polite"><span class="ns-k">Bước ${i + 1}/5 · ${esc(NAME[cur])}</span><b>${D.ready ? `${st.score}/100` : 'Đang đọc…'}</b></div>
      <div class="ns-bar ${low(st.score) ? 'is-low' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${st.score}"><i data-w="${st.score}"></i></div>
      ${list(st, 'data-ns-i')}
      ${result(cur)}
      <button class="primary ns-go" data-ns="go"><i class="ti ${main ? 'ti-tool' : nx[1]}"></i>${esc(main ? 'Sửa: ' + todo.label : nx[0])}</button>`;
  }

  // độ dài thanh điểm đặt bằng JS (HTML không có thuộc tính style nội tuyến, scripts/check_studio_tokens.mjs)
  const bars = root => { for (const i of root.querySelectorAll('.ns-bar i[data-w]')) i.style.width = Math.max(0, Math.min(100, +i.dataset.w || 0)) + '%'; };
  function paint() { const top = $('#insp > .ns [data-ns="top"]'); if (top && S.TL) { top.innerHTML = html(); bars(top); } }

  // inspector "không chọn gì" (projectPanel của studio.js) vừa vẽ lại: thêm khối bước, gom phần cũ vào mục thu gọn
  function wrap() {
    const insp = $('#insp');
    if (!insp || S.sel || !S.TL || insp.querySelector(':scope > .ns') || !insp.querySelector(':scope > .itabs [data-itab="proj"]')) return;
    const box = document.createElement('div'); box.className = 'ns';
    box.innerHTML = `<div data-ns="top" class="ns-step">${html()}</div>
      <details class="ns-more"${store.get('nsMore', '') === '1' ? ' open' : ''}><summary><i class="ti ti-settings"></i>Cài đặt dự án và thương hiệu<i class="ti ti-chevron-right"></i></summary></details>`;
    const det = box.querySelector('details');
    det.append(...insp.childNodes);
    det.addEventListener('toggle', () => store.set('nsMore', det.open ? '1' : ''));
    if (det.querySelector('.itabs [data-itab="brand"].on')) det.querySelector('.ibody')?.insertAdjacentHTML('afterbegin',
      `<p class="wf-hint">Màu, chữ của riêng dự án này. Bộ thương hiệu dùng chung ở <a class="ns-link" data-ns="brands">bước ① Thương hiệu</a>.</p>`);
    insp.appendChild(box); bars(box);
    refresh();
  }

  const insp = $('#insp');
  if (insp) {
    new MutationObserver(wrap).observe(insp, { childList: true });
    insp.addEventListener('click', e => {
      const b = e.target.closest('[data-ns], [data-ns-i], [data-ns-step]'); if (!b || !S.TL) return;
      if (b.dataset.nsStep) { view = b.dataset.nsStep; return paint(); }
      const st = state(view);
      if (b.dataset.nsI != null) { const t = st.tasks[+b.dataset.nsI]; return t && fix(t)(); }
      const a = b.dataset.ns;
      if (a === 'go') return st.next && !st.next.opt ? fix(st.next)() : NEXT[st.step][2]();
      if (a === 'brands') return go('brands')();
      if (a === 'export') return go('wf-export', ['.xp-it'])();
      if (a === 'qc') return go('wf-qc', ['#qcbox'])();
      // QC nhanh: hộp 3 khung của 20_ai.js (Studio.ai.openQuick), không có thì panel AI dựng
      if (a === 'quick') return S.ai?.openQuick ? S.ai.openQuick() : go('wf-aihelp')();
    });
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

  // đổi bước bên trái (01_workflow.js lọc thanh trái trước hook này) → vẽ lại cột phải theo bước mới
  let lastStep = null;
  (S._rail || []).push(() => { const st = S.workflow?.step; if (st !== lastStep) { lastStep = st; view = null; paint(); refresh(); } });
  window.addEventListener('focus', () => refresh());
  S.onReady(() => { wrap(); refresh(true); });
  S.nextStep = { refresh: () => refresh(true), state, scores, paint, steps: ORDER, guardExport };
})();
