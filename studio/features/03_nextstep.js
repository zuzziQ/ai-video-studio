// AI Video Studio — cột phải khi không chọn gì: ngữ cảnh của bước đang mở bên trái (S14 M113; thay thẻ "Bước tiếp theo" +
// "Sẵn sàng x/6" của M84, đợt S10). Rà hiện trạng và phần đã bỏ: docs/plans/S14-xuat-cot-phai-diem.md mục 1.2.
// Mỗi bước (thanh bước của 01_workflow.js): việc còn thiếu, kết quả gần nhất (QC nhanh M105 `GET /api/qc/quick`, QC đầy đủ
// `GET /api/qc`, bản xuất M112 `Studio.exports`), một nút đi tiếp. Bấm một việc → Studio.workflow.focus(panel, chỗ cần làm):
// mở đúng panel bên trái và tô sáng. Nội dung cũ của inspector (Dự án, Thương hiệu) vẫn trong mục thu gọn "Cài đặt dự án".
// Không thêm route; đổi bước (thanh trái vẽ lại) thì vẽ lại cột phải qua hook Studio._rail.
'use strict';
(() => {
  const S = Studio, $ = s => document.querySelector(s), esc = S.esc;
  const store = {
    get(k, d) { try { return localStorage.getItem('avs.' + k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('avs.' + k, v); } catch {} },
  };
  const ORDER = ['prep', 'source', 'build', 'check', 'ship'];
  const NAME = { prep: 'Chuẩn bị', source: 'Nguồn', build: 'Dựng', check: 'Kiểm tra', ship: 'Xuất và đăng' };
  // dữ liệu ngoài timeline, đọc lại tối đa mỗi 8 s (focus cửa sổ, đổi bước, inspector vẽ lại)
  const D = { qc: null, quick: null, dir: null };
  let fetchedAt = 0, busy = false;

  const go = (id, sel) => () => (S.workflow ? S.workflow.focus(id, sel) : typeof openPanel === 'function' && openPanel(id));
  const brand = () => (S.TL && S.TL.brand) || {};
  const capOn = () => (S.CAP || []).length > 0 && S.TL.caption_style !== 'none' && S.TL.burnin?.mode !== 'off';
  const aiScenes = () => (S.TL.scenes || []).filter(s => (s._ai || s._auto) && !s._base).length;
  const latest = () => (S.exports && S.exports.latest()) || null;
  // bản xuất còn file và không cũ hơn lần lưu timeline cuối (2 s dư cho lần lưu ngay trước khi xuất)
  const fresh = x => { const e = S.exports?.edited?.(); return !!x && !x.missing && (!e || Date.parse(x.at) >= Date.parse(e) - 2000); };
  const when = iso => { try { return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); } catch { return ''; } };
  const quickClean = () => !!D.quick && !D.quick.none && !D.quick.error && !D.quick.stale && !(D.quick.issues || []).length;
  const quickMiss = () => (!D.quick || D.quick.none || D.quick.error ? 'Chưa kiểm tra nhanh vị trí graphic (che mặt, đè phụ đề).'
    : D.quick.stale ? 'Đã sửa video sau lần kiểm tra nhanh: kiểm tra lại.' : `QC nhanh còn ${(D.quick.issues || []).length} chỗ.`);
  const QUICK = { label: 'QC nhanh không còn lỗi', done: quickClean, miss: quickMiss, go: ['wf-aihelp', ['[data-ai="qc"]', '.ai-card']], opt: true };

  // việc của từng bước: { label, done(), miss (câu khi chưa xong), go: [panel, [selector…]] }; opt = nên làm, không tính vào x/y.
  // M114 chấm điểm dùng lại state(step) và go (nút sửa).
  const TASKS = {
    prep: [
      { label: 'Tên thương hiệu', done: () => !!(brand().name || brand().kit), miss: 'Chưa đặt tên: mẫu và màn kết sẽ trống tên.', go: ['brands', ['.bk-card.cur', '#bk-new2', '.bk-card']] },
      { label: 'Logo', done: () => !!brand().logo, miss: 'Chưa có logo: graphic và màn kết không có dấu thương hiệu.', go: ['brands', ['.bk-card.cur .bk-logo', '#bk-logo', '#bk-new2']] },
      { label: 'Màu thương hiệu', done: () => !!brand().primary, miss: 'Chưa có màu riêng: mẫu dùng màu mặc định.', go: ['brands', ['.bk-card.cur .bk-sw', '#bk-new2']], opt: true },
    ],
    source: [
      { label: 'Video nguồn', done: () => (S.TL.clips || []).length > 0 && S.TL.duration > 0, miss: 'Chưa có video quay sẵn.', go: ['wf-new', ['.wf-src', '[data-wf="src-change"]']] },
      { label: 'Lời thoại', done: () => (S.CAP || []).length > 0, miss: 'Chưa tách lời thoại: phụ đề và AI dựng cần lời thoại.', go: ['wf-new', ['[data-transcribe]', '.wf-st li:nth-child(1)']] },
      { label: 'Vị trí mặt', done: () => !!(S.TL.face_track?.keys?.length || S.TL.face), miss: 'Chưa dò mặt: graphic có thể che mặt người nói.', go: ['wf-new', ['.wf-st li:nth-child(3)']], opt: true },
    ],
    build: [
      { label: 'Mẫu hoặc AI dựng', done: () => !!S.TL.pack || (S.TL.scenes || []).some(s => s._tpl || s._recipe) || aiScenes() > 0,
        miss: 'Chưa có mẫu: bấm AI dựng để Claude dựng giúp, hoặc chọn một mẫu.', go: ['wf-aihelp', ['[data-ai="build"]', '.ai-card']] },
      { label: 'Phụ đề bật', done: capOn, miss: 'Phụ đề đang tắt hoặc chưa có: người xem tắt tiếng sẽ không hiểu.', go: ['text', ['.cslist button.on', '.cslist']] },
      QUICK,
    ],
    check: [
      { label: 'QC đầy đủ', done: () => !!D.qc && !D.qc.none && !D.qc.error, miss: 'Chưa chạy QC đầy đủ: chính tả, hook, nhịp, âm lượng.', go: ['wf-qc', ['#qcbox', '.ai-card']] },
      QUICK,
    ],
    ship: [
      { label: 'Bản xuất mới nhất', done: () => fresh(latest()),
        miss: () => (!latest() ? 'Chưa xuất video.' : latest().missing ? 'File của bản xuất gần nhất đã bị xoá.' : 'Đã sửa video sau lần xuất gần nhất: xuất lại.'),
        go: ['wf-export', ['[data-xp="export"]']] },
      { label: 'Giao vào Thành phẩm', done: () => !!latest()?.deliveredNow, miss: () => (latest() ? 'Bản gần nhất chưa nằm trong Thành phẩm của Kho.' : 'Xuất xong thì giao vào Thành phẩm của Kho.'), go: ['wf-export', ['[data-xp="give"]', '.xp-it']], opt: true },
    ],
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
  .ns-rh { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .ns-k { font-size: 11px; font-weight: 600; color: var(--tx2); text-transform: uppercase; letter-spacing: .04em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .ns-rh b { margin-left: auto; color: var(--tx); font-size: 12px; flex: none; }
  .ns-tasks { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .ns-tasks button { width: 100%; height: auto; min-height: 32px; padding: 6px 8px; justify-content: flex-start; align-items: flex-start; gap: 8px; text-align: left; white-space: normal;
    background: transparent; border-color: var(--line); color: var(--tx2); font-size: 12px; line-height: 1.4; min-width: 0; }
  .ns-tasks button:hover { background: var(--bg3); color: var(--tx); }
  .ns-tasks button .ti { flex: none; font-size: 16px; }
  .ns-tasks button span { min-width: 0; overflow-wrap: anywhere; }
  .ns-tasks button small { display: block; color: var(--tx3); font-size: 11px; }
  /* is-*, không .ok/.warn: studio.css có #insp .ok (banner trạng thái) đẩy nút xuống (dev-memory ai-video-studio-026) */
  .ns-tasks button.is-done { color: var(--tx); } .ns-tasks button.is-done .ti { color: var(--ok); }
  .ns-tasks button.is-next { border-color: var(--acc-line); background: var(--acc-soft); color: var(--tx); }
  .ns-tasks button.is-opt:not(.is-done) .ti { color: var(--warn); }
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
  `;
  document.head.appendChild(css);

  async function refresh(force) {
    if (busy || !S.TL || (!force && Date.now() - fetchedAt < 8000)) return;
    busy = true;
    const dir = S.META?.dir;
    if (D.dir !== dir) { D.qc = D.quick = null; D.dir = dir; }
    try {
      const [q, k] = await Promise.all([S.api('/api/qc').catch(() => null), S.api('/api/qc/quick').catch(() => null),
        // làm mới vẽ lại panel Xuất nếu đang mở: hoãn khi panel đang tô sáng chỗ cần làm (Studio.workflow.focus) để không mất nó
        S.exports && !(S.exports.loaded() && $('#libbody .wf-flash')) ? S.exports.refresh().catch(() => null) : null]);
      if (S.META?.dir === dir) { D.qc = q; D.quick = k; }
    } finally { busy = false; fetchedAt = Date.now(); }
    paint();
  }

  const ok = t => { try { return !!t.done(); } catch { return false; } };
  const say = t => { try { return typeof t.miss === 'function' ? t.miss() : t.miss; } catch { return ''; } };
  // bước cột phải nói tới: bước đang mở bên trái; Cài đặt / Tự lái → bước đầu còn việc chính chưa xong
  function stepNow() {
    const st = S.workflow?.step;
    if (ORDER.includes(st)) return st;
    return ORDER.find(k => TASKS[k].some(t => !t.opt && !ok(t))) || 'ship';
  }

  /** Trạng thái một bước (cho M114): { step, tasks:[{label, done, opt, miss, go}], need, done, next } — next = việc chính đầu chưa xong, rồi việc nên làm. */
  function state(step = stepNow()) {
    const tasks = TASKS[step].map(t => { const d = ok(t); return { label: t.label, done: d, opt: !!t.opt, miss: d ? '' : say(t), go: t.go }; });
    const main = tasks.filter(t => !t.opt);
    return { step, tasks, need: main.length, done: main.filter(t => t.done).length, next: main.find(t => !t.done) || tasks.find(t => !t.done) || null };
  }

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
      const name = String(x.files[0]?.file || '').split(/[\\/]/).pop();
      return row('Bản xuất gần nhất', `${esc(name)}<br>${esc(when(x.at))}${x.missing ? ' · file đã bị xoá' : fresh(x) ? '' : ' · đã sửa video sau bản này'}`,
        x.missing || !fresh(x), lnk('export', 'Mở bản xuất'));
    }
    return '';
  }

  function html() {
    const st = state(), i = ORDER.indexOf(st.step), todo = st.next, main = todo && !todo.opt;
    const nx = NEXT[st.step];
    return `<div class="ns-rh" aria-live="polite"><span class="ns-k">Bước ${i + 1}/5 · ${esc(NAME[st.step])}</span><b>${st.done}/${st.need} việc chính</b></div>
      <ul class="ns-tasks">${st.tasks.map((t, k) => `<li><button data-ns-i="${k}" class="${t.done ? 'is-done' : ''} ${t === todo ? 'is-next' : ''} ${t.opt ? 'is-opt' : ''}" title="Mở chỗ làm ${esc(t.label)} ở thanh trái">
        <i class="ti ${t.done ? 'ti-circle-check' : t.opt ? 'ti-alert-circle' : 'ti-circle-dashed'}"></i><span>${esc(t.label)}${t.opt && !t.done ? ' (nên làm)' : ''}${t.done ? '' : `<small>${esc(t.miss)}</small>`}</span></button></li>`).join('')}</ul>
      ${result(st.step)}
      <button class="primary ns-go" data-ns="go"><i class="ti ${main ? 'ti-pointer' : nx[1]}"></i>${esc(main ? 'Làm: ' + todo.label : nx[0])}</button>`;
  }

  function paint() { const top = $('#insp > .ns [data-ns="top"]'); if (top && S.TL) top.innerHTML = html(); }

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
    insp.appendChild(box);
    refresh();
  }

  const insp = $('#insp');
  if (insp) {
    new MutationObserver(wrap).observe(insp, { childList: true });
    insp.addEventListener('click', e => {
      const b = e.target.closest('[data-ns], [data-ns-i]'); if (!b || !S.TL) return;
      const st = state();
      if (b.dataset.nsI != null) { const t = st.tasks[+b.dataset.nsI]; return t && go(...t.go)(); }
      const a = b.dataset.ns;
      if (a === 'go') return st.next && !st.next.opt ? go(...st.next.go)() : NEXT[st.step][2]();
      if (a === 'brands') return go('brands')();
      if (a === 'export') return go('wf-export', ['.xp-it'])();
      if (a === 'qc') return go('wf-qc', ['#qcbox'])();
      // QC nhanh: hộp 3 khung của 20_ai.js (Studio.ai.openQuick), không có thì panel AI dựng
      if (a === 'quick') return S.ai?.openQuick ? S.ai.openQuick() : go('wf-aihelp')();
    });
  }
  // đổi bước bên trái (01_workflow.js lọc thanh trái trước hook này) → vẽ lại cột phải theo bước mới
  let lastStep = null;
  (S._rail || []).push(() => { const st = S.workflow?.step; if (st !== lastStep) { lastStep = st; paint(); refresh(); } });
  window.addEventListener('focus', () => refresh());
  S.onReady(() => { wrap(); refresh(true); });
  S.nextStep = { refresh: () => refresh(true), state, paint, steps: ORDER };
})();
