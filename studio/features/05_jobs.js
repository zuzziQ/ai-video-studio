// Khay việc (S26 M185): xuất, AI dựng, kiểm tra & áp gợi ý, tạo dự án mới chạy nền, không còn hộp giữa màn hình chặn thao tác.
// S26 M187: nút chuông trên thanh đầu (số việc, vòng %, đỏ khi lỗi), bấm thì xổ danh sách thẻ; không còn khay nổi che timeline / cột phải.
// Mỗi việc một thẻ: tên, một dòng bước (log đã làm sạch, tải mô hình ghi "Đang tải mô hình (176 MB, lần đầu) 14%"), thanh %, Dừng.
// Xong thì thẻ đổi thành kết quả có nút + toast; lỗi thì thẻ đỏ có "Xem log" và danh sách tự xổ một lần. Lõi thuần: 05_jobs.core.js.
// Server chỉ chạy một việc một lúc (GET /api/job, POST /api/job/cancel): theo dõi bằng bộ đếm riêng, không giành Studio.pollJob dùng chung.
// Việc đặt lock (AI dựng, áp gợi ý QC ghi lại timeline.json lúc xong): trong lúc chạy khoá phần sửa timeline (body.jobs-lock + dải báo
// trên khung), tạm dừng tự lưu (studio.js autoBusy); thanh trái / thư viện / trang chủ / panel khác vẫn dùng được.
// Studio.jobs: { track({kind, title, lock, note, onDone(j) → {text, acts, toast}, onFail(j) → {text, acts}}) → Promise<{ok, job}>,
//   refuse(r) (toast "Đang chạy: … (bấm chuông việc nền)"), locked(), running(), autopilot(state), show(), log(job) }
(() => {
  const S = window.Studio, J = window.JobsCore, esc = S.esc;
  const st = document.createElement('style');
  st.textContent = `#avs-jobs { position: relative; flex: none; display: inline-flex; }
    #avs-jobs[hidden] { display: none; }
    /* S26 M187: trang chủ (#onb-home, z 40) che thanh đầu: nút nổi ở góc trên phải, trên trang chủ, dưới #modal (50) */
    #avs-jobs.jt-float { position: fixed; top: var(--space-2); right: var(--space-4); z-index: 45; }
    .jt-bell { position: relative; display: inline-flex; align-items: center; gap: var(--space-1); height: var(--h-md); padding: 0 var(--space-2); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
    .jt-float .jt-bell { background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-pill); box-shadow: var(--shadow-raised); }
    .jt-ic { position: relative; display: inline-flex; align-items: center; justify-content: center; width: var(--space-6); height: var(--space-6); flex: none; }
    .jt-ic > .ti { font-size: var(--text-md); }
    .jt-bell.is-run .jt-ic > .ti { color: rgb(var(--color-accent-text)); }
    .jt-bell.is-err { color: rgb(var(--color-danger-text)); border-color: rgb(var(--color-danger) / .6); background: rgb(var(--color-danger) / .1); }
    .jt-bell.is-ok .jt-ic > .ti { color: rgb(var(--color-success-text)); }
    .jt-ring { position: absolute; inset: 0; border-radius: var(--radius-pill); pointer-events: none;
      background: conic-gradient(rgb(var(--color-accent-text)) var(--w, 0%), rgb(var(--color-line)) 0); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 0); mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 0); } /* design-token-ok: mặt nạ, không phải màu */
    .jt-bell:not(.is-run) .jt-ring, .jt-bell:not(.is-run) .jt-bp { display: none; }
    .jt-bp { font-size: var(--text-2xs); font-weight: 600; color: rgb(var(--color-accent-text)); }
    .jt-badge { position: absolute; top: 0; right: 0; min-width: var(--space-4); height: var(--space-4); padding: 0 var(--space-1); border-radius: var(--radius-pill); display: inline-flex; align-items: center; justify-content: center;
      font-size: var(--text-2xs); font-weight: 600; line-height: 1; background: rgb(var(--color-accent)); color: rgb(var(--color-accent-fg)); transform: translate(30%, -20%); }
    .jt-bell.is-err .jt-badge { background: rgb(var(--color-danger)); }
    .jt-bell.jt-ping { animation: jt-ping .6s 2; } @keyframes jt-ping { 50% { transform: scale(1.12); } }
    @media (prefers-reduced-motion: reduce) { .jt-bell.jt-ping { animation: none; } }
    @media (max-width: 1280px) { .jt-bp { display: none !important; } }
    /* #top đã kín ở 1280 px (scrollWidth = 1280 khi chưa có chuông): chuông hiện thì công tắc mức chỉ còn biểu tượng (01_workflow làm vậy ở ≤ 1180) */
    @media (max-width: 1400px) { #top:has(> #avs-jobs:not([hidden])) #wf-lvbar button span { display: none; } }
    .jt-pop { position: absolute; top: calc(100% + var(--space-2)); right: 0; z-index: 46; width: min(360px, calc(100vw - 2 * var(--space-4))); max-height: min(70vh, 560px); overflow-y: auto;
      display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-2); background: rgb(var(--color-surface)); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-card); box-shadow: var(--shadow-raised); }
    .jt-pop[hidden] { display: none; }
    .jt-empty { padding: var(--space-3); font-size: var(--text-xs); color: rgb(var(--color-fg-muted)); text-align: center; }
    .jt-card, .jt-q { background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-card); color: rgb(var(--color-fg)); }
    .jt-card { padding: var(--space-2) var(--space-3); display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
    .jt-card.is-ok { border-color: rgb(var(--color-success) / .5); }
    .jt-card.is-err { border-color: rgb(var(--color-danger) / .6); background: rgb(var(--color-danger) / .1); }
    .jt-card.is-warn { border-color: rgb(var(--color-warning) / .6); }
    .jt-h { display: flex; align-items: center; gap: var(--space-2); min-width: 0; font-size: var(--text-xs); font-weight: 600; }
    .jt-h > .ti { flex: none; color: rgb(var(--color-accent-text)); }
    .is-ok .jt-h > .ti { color: rgb(var(--color-success-text)); } .is-err .jt-h > .ti { color: rgb(var(--color-danger-text)); } .is-warn .jt-h > .ti { color: rgb(var(--color-warning-text)); }
    .jt-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .jt-x { flex: none; height: var(--space-5); width: var(--space-5); padding: 0; justify-content: center; background: transparent; border-color: transparent; color: rgb(var(--color-fg-subtle)); }
    .jt-x:hover { color: rgb(var(--color-fg)); background: rgb(var(--color-surface-hover)); }
    .jt-s { font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); line-height: 1.5; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .jt-n { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); line-height: 1.5; }
    .jt-bar { height: var(--space-1); background: rgb(var(--color-surface-hover)); border-radius: var(--radius-pill); overflow: hidden; }
    .jt-bar i { display: block; height: 100%; width: var(--w, 0%); background: rgb(var(--color-accent-text)); transition: width .3s; }
    .jt-pct { flex: none; font-size: var(--text-2xs); font-weight: 500; color: rgb(var(--color-fg-subtle)); font-variant-numeric: tabular-nums; }
    .jt-acts { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: var(--space-1); }
    .jt-acts button { height: var(--h-sm); padding: 0 var(--space-2); font-size: var(--text-2xs); gap: var(--space-1); }
    .jt-q { display: flex; align-items: center; gap: var(--space-2); width: 100%; padding: var(--space-2) var(--space-3); font-size: var(--text-2xs); text-align: left; cursor: pointer; min-width: 0; }
    .jt-q:hover { background: rgb(var(--color-surface-hover)); } .jt-q > .ti { flex: none; color: rgb(var(--color-accent-text)); }
    .jt-q span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .jt-lock { display: flex; align-items: center; gap: var(--space-2); flex: none; padding: var(--space-1) var(--space-3); font-size: var(--text-xs); color: rgb(var(--color-warning-text)); background: rgb(var(--color-warning) / .08); border-bottom: 1px solid rgb(var(--color-warning) / .4); }
    .jt-lock[hidden] { display: none; }
    .jt-lock span { min-width: 0; overflow-wrap: anywhere; }
    body.jobs-lock #tracks, body.jobs-lock #tllabels, body.jobs-lock #tlhead .tools, body.jobs-lock #overlay, body.jobs-lock #right,
    body.jobs-lock #undo, body.jobs-lock #redo, body.jobs-lock #save { pointer-events: none; opacity: .55; }
    #center { position: relative; }
    #np-wait { display: none; position: absolute; inset: 0; z-index: 5; align-items: center; justify-content: center; flex-direction: column; gap: var(--space-2);
      background: rgb(var(--color-canvas)); color: rgb(var(--color-fg-muted)); font-size: var(--text-sm); text-align: center; padding: var(--space-4); }
    body.np-busy #np-wait { display: flex; }
    body.np-busy #undo, body.np-busy #redo, body.np-busy #save, body.np-busy #export, body.np-busy #newproj, body.np-busy #history { pointer-events: none; opacity: .55; }
    #np-wait .ti { font-size: var(--text-xl); color: rgb(var(--color-accent-text)); }`;
  document.head.appendChild(st);

  const cards = [], LOCK_SEL = '#tracks, #tllabels, #tlhead .tools, #overlay, #right, #undo, #redo, #save';
  // S26 M187: khay nổi che timeline và cột phải → nút chuông trên thanh đầu (#top, trước Lưu); bấm thì xổ danh sách thẻ. Trang chủ
  // (#onb-home, chưa mở dự án hoặc bấm về trang chủ) che cả thanh đầu: nút chuyển ra nổi ở góc trên phải (jt-float) tới khi trang chủ đóng.
  let seq = 0, isOpen = false, ap = { items: [], line: '' }, host = null, btn = null, pop = null, lockEl = null, wasLocked = false;
  const cl = n => document.getElementById(n);
  const root = () => {
    if (!host) {
      host = document.createElement('span'); host.id = 'avs-jobs'; host.hidden = true;
      host.innerHTML = `<button type="button" class="ghost jt-bell" aria-haspopup="true" aria-expanded="false" aria-controls="avs-jobs-pop" title="Việc nền">`
        + '<span class="jt-ic"><i class="ti ti-bell"></i><span class="jt-ring"></span></span><span class="jt-bp"></span><span class="jt-badge"></span></button>'
        + '<div class="jt-pop" id="avs-jobs-pop" role="region" aria-label="Việc nền" hidden></div>';
      btn = host.firstElementChild; pop = host.lastElementChild;
      btn.addEventListener('click', () => setOpen(!isOpen));
      pop.addEventListener('click', onClick);
      place(); new MutationObserver(place).observe(document.body, { childList: true });
    }
    return host;
  };
  function place() {
    const top = cl('top'), float = !!cl('onb-home') || !top;
    if (float) { host.classList.add('jt-float'); if (host.parentNode !== document.body) document.body.appendChild(host); return; }
    host.classList.remove('jt-float');
    if (host.parentNode !== top) { const ref = [cl('save'), cl('export')].find(x => x?.parentNode === top); top.insertBefore(host, ref || null); }
  }
  function setOpen(v) {
    root(); isOpen = !!v && !host.hidden;
    pop.hidden = !isOpen; btn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) renderPop();
  }
  // bấm ra ngoài hoặc Esc: đóng danh sách
  document.addEventListener('pointerdown', e => { if (isOpen && !host.contains(e.target)) setOpen(false); }, true);
  document.addEventListener('keydown', e => { if (isOpen && e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.focus(); } }, true);
  const ping = () => { if (!btn || host.hidden) return; btn.classList.remove('jt-ping'); void btn.offsetWidth; btn.classList.add('jt-ping'); };
  const phase = c => c.phase || J.phaseOf(c.job?.state);
  const running = () => cards.find(c => phase(c) === 'run') || null;
  const locked = () => J.locked(cards);
  const ICON = { run: 'ti-loader-2 spin', ok: 'ti-circle-check', err: 'ti-alert-triangle', stop: 'ti-player-stop' };
  const setW = (el, p) => el?.style.setProperty('--w', p + '%');
  const openAp = () => document.querySelector('#rail [data-p="autopilot"]')?.click();
  const BELL_IC = { run: 'ti-bell-ringing', err: 'ti-bell-exclamation' };

  function syncLock() {
    const on = locked();
    document.body.classList.toggle('jobs-lock', on);
    for (const el of document.querySelectorAll(LOCK_SEL)) { if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); }
    if (on) {
      if (!lockEl) { lockEl = document.createElement('div'); lockEl.className = 'jt-lock'; lockEl.setAttribute('role', 'status'); }
      lockEl.innerHTML = `<i class="ti ti-lock"></i><span>${esc(J.lockTitle(cards))} đang chạy: tạm khoá sửa timeline. Thư viện và các panel khác vẫn dùng được.</span>`;
      const c = cl('center'); if (c && !lockEl.parentNode) c.insertBefore(lockEl, c.firstChild);
    } else lockEl?.remove();
    if (on !== wasLocked) { wasLocked = on; setTimeout(() => S.fit?.(), 0); }
  }

  function cardHtml(c, i) {
    const v = J.view(c), p = phase(c), tone = p === 'ok' ? 'is-ok' : p === 'err' ? 'is-err' : p === 'stop' ? 'is-warn' : '';
    const acts = p === 'run' ? '<button class="ui-btn ui-btn--secondary ui-btn--sm" data-a="stop"><i class="ti ti-player-stop"></i> Dừng</button>'
      : (c.acts || []).map((a, k) => `<button class="ui-btn ui-btn--${a.primary ? 'primary' : 'secondary'} ui-btn--sm" data-a="act" data-k="${k}">${a.icon ? `<i class="ti ${esc(a.icon)}"></i> ` : ''}${esc(a.label)}</button>`).join('');
    return `<div class="jt-card ${tone}" data-id="${c.id}" role="${p === 'err' ? 'alert' : 'status'}"><div class="jt-h"><i class="ti ${ICON[p]}"></i><span class="jt-t" title="${esc(c.title)}">${esc(c.title)}</span>
      ${p === 'run' ? '<span class="jt-pct"></span>' : `<button class="ui-btn ui-btn--ghost ui-btn--icon jt-x" data-a="close" title="Đóng" aria-label="Đóng"><i class="ti ti-x"></i></button>`}</div>
      <div class="jt-s"></div>${c.note && p === 'run' ? `<div class="jt-n">${esc(c.note)}</div>` : ''}${p === 'run' ? '<div class="jt-bar"><i></i></div>' : ''}${acts ? `<div class="jt-acts">${acts}</div>` : ''}</div>`;
  }
  // Cập nhật dòng bước + thanh % tại chỗ (không dựng lại: nút Dừng không bị nuốt lúc bấm)
  function patch(c) {
    const el = host?.querySelector(`[data-id="${c.id}"]`); if (!el) return;
    const v = J.view(c);
    el.querySelector('.jt-s').textContent = v.line;
    const pc = el.querySelector('.jt-pct'); if (pc) pc.textContent = v.pct + '%';
    setW(el.querySelector('.jt-bar i'), v.pct);
  }
  // nút chuông: số việc, vòng % + "42%" khi đang chạy, đỏ khi có việc lỗi (JobsCore.bell). Không dựng lại danh sách: nút Dừng không bị nuốt
  function paintBell() {
    const v = J.bell(cards, ap.line);
    root().hidden = !v.n; if (!v.n) { if (isOpen) setOpen(false); return v; }
    for (const t of ['run', 'err', 'ok']) btn.classList.toggle('is-' + t, v.tone === t);
    btn.title = v.label; btn.setAttribute('aria-label', v.label);
    btn.querySelector('.jt-ic > .ti').className = `ti ${BELL_IC[v.tone] || 'ti-bell'}`;
    btn.querySelector('.jt-badge').textContent = v.n;
    btn.querySelector('.jt-bp').textContent = v.tone === 'run' ? v.pct + '%' : '';
    setW(btn.querySelector('.jt-ring'), v.pct);
    return v;
  }
  function renderPop() {
    pop.innerHTML = (cards.map(cardHtml).join('')
      + (ap.line ? `<button class="jt-q" data-a="ap" title="Mở panel Tự lái"><i class="ti ti-rocket"></i><span>${esc(ap.line)}</span><i class="ti ti-chevron-right"></i></button>` : ''))
      || '<div class="jt-empty">Không có việc nào</div>';
    for (const c of cards) patch(c);
  }
  function render() { paintBell(); if (isOpen) renderPop(); }
  function onClick(e) {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a, id = b.closest('[data-id]')?.dataset.id, c = cards.find(x => x.id === id);
    if (a === 'ap') { setOpen(false); openAp(); }
    else if (a === 'stop') { b.disabled = true; b.textContent = 'Đang dừng…'; S.api('/api/job/cancel', {}).catch(() => {}); }
    else if (a === 'close' && c) { cards.splice(cards.indexOf(c), 1); render(); }
    // nút kết quả: đóng danh sách trước để chỗ được mở (panel, hộp) không bị che
    else if (a === 'act' && c) { const k = c.acts?.[+b.dataset.k]; if (k) { setOpen(false); Promise.resolve(k.on?.(c)).then(r => { if (r === 'close') { cards.splice(cards.indexOf(c), 1); render(); } }); } }
  }
  // "Xem log": hộp do người dùng bấm mới mở, log đã làm sạch
  function showLog(j) {
    const lines = J.cleanLog(j?.log, 60);
    S.modal(`<h3><i class="ti ti-file-text"></i> Log</h3><p>${esc(J.stepLine(j) || '')}</p><pre>${esc(lines.join('\n') || '(log trống)')}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
  }

  // Theo dõi một việc server đã nhận (gọi sau khi POST trả ok). → Promise<{ok, job}> khi việc dừng (done / error / cancelled)
  function track(o = {}) {
    const c = { id: 'j' + (++seq), kind: o.kind || 'job', title: o.title || 'Việc nền', lock: !!o.lock, note: o.note || '', phase: 'run', job: { state: 'running', step: 'Bắt đầu', progress: 0, log: '' }, acts: [], result: null };
    const fin = cards.filter(x => phase(x) !== 'run'); while (fin.length >= 3) cards.splice(cards.indexOf(fin.shift()), 1); // giữ tối đa 3 thẻ đã xong
    cards.push(c); syncLock(); render(); ping(); // bắt đầu việc: không tự xổ danh sách, chỉ nút đổi trạng thái
    return new Promise(done => {
      const tick = async () => {
        let j = null; try { j = await S.api('/api/job'); } catch { /* mất kết nối thoáng qua: thử lại */ }
        if (!j || j.state === 'running') { if (j) { c.job = j; patch(c); paintBell(); } return setTimeout(tick, 700); }
        c.job = j; c.phase = J.phaseOf(j.state); syncLock(); // mở khoá trước onDone: onDone còn gọi saveNow()
        let res = null;
        try {
          if (c.phase === 'ok') res = await o.onDone?.(j);
          else if (c.phase === 'err') res = await o.onFail?.(j);
        } catch (e) { console.error(e); c.phase = 'err'; res = { text: e.message }; }
        if (res && c.phase === 'ok' && res.error) { c.phase = 'err'; }
        c.result = res || null;
        c.acts = [...(c.phase === 'err' ? [{ label: 'Xem log', icon: 'ti-file-text', on: () => showLog(j) }] : []), ...(res?.acts || [])];
        render();
        if (c.phase === 'ok') S.toast(res?.toast || `${c.title}: xong`);
        else if (c.phase === 'err') S.toast(`${c.title}: chưa xong`);
        else S.toast(`${c.title}: ${J.view(c).line.toLowerCase()}`);
        if (c.phase === 'err') setOpen(true); // việc lỗi: tự xổ danh sách một lần (thẻ đỏ + Xem log); xong thì chỉ toast
        done({ ok: c.phase === 'ok', job: j, result: res });
      };
      setTimeout(tick, 700);
    });
  }
  // Server bận (POST trả 409 "Đang có tác vụ khác chạy"): toast chỉ tên việc đang chạy, không hộp lỗi
  function refuse(r) {
    const run = running();
    S.toast(J.busyMessage(run?.title || J.queueRunning(ap.items) || ''));
    ping();
    return r;
  }
  // 15_autopilot.js gọi mỗi lần đọc /api/autopilot/state: dòng tóm tắt hàng đợi trong khay
  function autopilot(state) {
    const items = state?.items || [], line = J.queueLine(items);
    if (line === ap.line) { ap.items = items; return; }
    ap = { items, line }; render();
  }

  // S26 M186: POST một việc rồi theo dõi trong khay. Server bận (409) → refuse (toast tên việc đang chạy); lỗi khác (thiếu video…) → toast lỗi.
  // Tên + khoá mặc định lấy theo kind (JobsCore.KINDS); o ghi đè; onStart(r) chạy ngay khi server nhận. → Promise (tới khi việc dừng)
  // <{ok, job, result} | {ok:false, refused, r}>
  async function start(path, body, o = {}) {
    let r; try { r = await S.api(path, body || {}); } catch (e) { r = { error: e.message }; }
    if (!r?.ok) {
      if (r?.error && !/tác vụ/i.test(r.error)) S.toast(r.error); else refuse(r);
      return { ok: false, refused: true, r };
    }
    try { o.onStart?.(r); } catch (e) { console.error(e); } // server đã nhận: đóng hộp tuỳ chọn người dùng mở…
    const fn = o.onDone; // onDone(j, r): r = phản hồi của POST (vd. thư mục kết quả server đã chọn)
    return track({ ...(J.kindInfo(o.kind) || {}), ...o, onDone: fn && (j => fn(j, r)) });
  }
  // Tải lại trang khi server còn chạy việc: lúc khởi động nhận lại vào khay theo job.kind. Tính năng nào cần làm gì lúc xong
  // (AI dựng áp kế hoạch, dò lỗi nói nạp kết quả) đăng ký resumable(kind, j => opts track); mặc định: việc khoá thì tải lại dự án.
  const resumers = {};
  const resumable = (kind, fn) => { resumers[kind] = fn; };
  async function resume() {
    let j = null; try { j = await S.api('/api/job'); } catch { return; }
    const info = J.resumeOf(j); if (!info || running()) return;
    let extra = {}; try { extra = resumers[info.kind]?.(j) || {}; } catch (e) { console.error(e); }
    track({ ...info, note: 'Việc đang chạy từ trước khi tải lại trang', resumed: true,
      onDone: async () => { if (info.lock && S.TL) await S.reload(); return { text: info.lock ? 'Xong · đã tải lại dự án từ đĩa' : 'Xong' }; }, ...extra });
  }
  // chạy cả khi chưa mở dự án (boot không gọi onReady): tạo dự án từ video kéo vào app, hay tạo dự án mới rồi tải lại trang
  if (document.readyState === 'complete') setTimeout(resume, 900); else addEventListener('load', () => setTimeout(resume, 900), { once: true });

  // nút kết quả "Xem …" của thẻ: mở panel theo id (S.addPanel). S26 M187: đi qua Studio.workflow.focus (đổi bước quy trình, nhóm có tab
  // thì mở đúng tab, 78_cols bọc để mở ngăn thư viện). openPanel trần chỉ đổi panel: ở Cơ bản thư viện là ngăn trượt đang đóng
  // (body[data-lib="flyout"] #lib visibility: hidden), ở Chuyên nghiệp có thể đang gấp ([), nên bấm "Xem lời thoại" trông như không chạy.
  // Panel chỉ có ở Chuyên nghiệp (vd. Làm sạch lời nói) mà đang ở Cơ bản: focus sẽ đổi cả giao diện sang Chuyên nghiệp; thanh trái vẫn
  // hiện panel đang mở ở Cơ bản nên mở thẳng rồi mở ngăn, giữ mức người dùng đã chọn.
  const open = id => {
    const wf = S.workflow;
    if (wf?.focus && !wf.hidden?.(id)) return wf.focus(id);
    if (typeof window.openPanel === 'function') window.openPanel(id);
    S.cols?.open();
    if (S.layout?.get().foldLib) S.layout.set('foldLib', false);
  };

  S.jobs = { exportNote: J.exportNote, track, start, refuse, resumable, open, locked, running: () => running()?.title || '', autopilot, show: () => setOpen(true), log: showLog, cards: () => cards.slice() };
  // tạo dự án mới (studio.js): trình chỉnh sửa hiện chỗ chờ, trang chủ và Tự lái vẫn dùng được
  if (!cl('np-wait')) { const w = document.createElement('div'); w.id = 'np-wait'; w.setAttribute('role', 'status'); w.innerHTML = '<i class="ti ti-loader-2 spin"></i><b>Đang tạo dự án mới…</b><span>Xong sẽ tự mở. Trang chủ và Tự lái vẫn dùng được trong lúc chờ.</span>'; (cl('center') || document.body).appendChild(w); }
})();
