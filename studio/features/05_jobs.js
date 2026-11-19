// Khay việc (S26 M185): xuất, AI dựng, kiểm tra & áp gợi ý, tạo dự án mới chạy nền trong thẻ nổi ở góc dưới phải, không còn hộp
// giữa màn hình chặn thao tác. Mỗi việc một thẻ: tên, một dòng bước (log đã làm sạch, tải mô hình ghi "Đang tải mô hình (176 MB, lần đầu) 14%"),
// thanh %, Dừng. Xong thì thẻ đổi thành kết quả có nút + toast; lỗi thì thẻ đỏ có "Xem log". Thu gọn thành chip. Lõi thuần: 05_jobs.core.js.
// Server chỉ chạy một việc một lúc (GET /api/job, POST /api/job/cancel): theo dõi bằng bộ đếm riêng, không giành Studio.pollJob dùng chung.
// Việc đặt lock (AI dựng, áp gợi ý QC ghi lại timeline.json lúc xong): trong lúc chạy khoá phần sửa timeline (body.jobs-lock + dải báo
// trên khung), tạm dừng tự lưu (studio.js autoBusy); thanh trái / thư viện / trang chủ / panel khác vẫn dùng được.
// Studio.jobs: { track({kind, title, lock, note, onDone(j) → {text, acts, toast}, onFail(j) → {text, acts}}) → Promise<{ok, job}>,
//   refuse(r) (toast "Đang chạy: … (xem khay việc)"), locked(), running(), autopilot(state), show(), log(job) }
(() => {
  const S = window.Studio, J = window.JobsCore, esc = S.esc;
  const st = document.createElement('style');
  st.textContent = `#avs-jobs { position: fixed; right: var(--space-4); bottom: var(--space-4); z-index: 44; /* dưới #modal (50) */
      width: min(340px, calc(100vw - 2 * var(--space-4))); display: flex; flex-direction: column; gap: var(--space-2); align-items: stretch; }
    #avs-jobs[hidden] { display: none; }
    .jt-card, .jt-q, .jt-chip { background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-card); box-shadow: var(--shadow-raised); color: rgb(var(--color-fg)); }
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
    .jt-chip { display: inline-flex; align-items: center; gap: var(--space-2); align-self: flex-end; max-width: 100%; height: var(--h-sm); padding: 0 var(--space-3); font-size: var(--text-xs); border-radius: var(--radius-pill); cursor: pointer; }
    .jt-chip > .ti { color: rgb(var(--color-accent-text)); } .jt-chip.is-ok > .ti { color: rgb(var(--color-success-text)); } .jt-chip.is-err > .ti { color: rgb(var(--color-danger-text)); }
    .jt-chip span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .jt-min { align-self: flex-end; height: var(--space-5); padding: 0 var(--space-2); font-size: var(--text-2xs); gap: var(--space-1); background: transparent; border-color: transparent; color: rgb(var(--color-fg-subtle)); }
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
  let seq = 0, mini = false, ap = { items: [], line: '' }, host = null, lockEl = null, wasLocked = false;
  const cl = n => document.getElementById(n);
  const root = () => {
    if (!host) { host = document.createElement('div'); host.id = 'avs-jobs'; host.setAttribute('role', 'region'); host.setAttribute('aria-label', 'Khay việc'); host.hidden = true; document.body.appendChild(host); host.addEventListener('click', onClick); }
    return host;
  };
  const phase = c => c.phase || J.phaseOf(c.job?.state);
  const running = () => cards.find(c => phase(c) === 'run') || null;
  const locked = () => J.locked(cards);
  const ICON = { run: 'ti-loader-2 spin', ok: 'ti-circle-check', err: 'ti-alert-triangle', stop: 'ti-player-stop' };
  const setW = (el, p) => el?.style.setProperty('--w', p + '%');
  const openAp = () => document.querySelector('#rail [data-p="autopilot"]')?.click();

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
  function chipLine() {
    const r = running(), n = cards.length + (ap.line ? 1 : 0);
    if (r) { const v = J.view(r); return [`ti ${ICON.run}`, `${r.title} ${v.pct}%${n > 1 ? ` · +${n - 1}` : ''}`, '']; }
    const bad = cards.find(c => phase(c) === 'err');
    if (bad) return ['ti ti-alert-triangle', bad.title + ': lỗi', 'is-err'];
    if (cards.length) return ['ti ti-circle-check', `${cards[cards.length - 1].title}: xong`, 'is-ok'];
    return ['ti ti-rocket', ap.line, ''];
  }
  function render() {
    const h = root(), n = cards.length + (ap.line ? 1 : 0);
    h.hidden = !n; if (!n) return;
    if (mini) {
      const [ic, tx, tone] = chipLine();
      h.innerHTML = `<button class="jt-chip ${tone}" data-a="max" title="Mở khay việc" aria-label="Mở khay việc: ${esc(tx)}"><i class="${ic}"></i><span>${esc(tx)}</span></button>`;
      return;
    }
    h.innerHTML = `<button class="ui-btn ui-btn--ghost ui-btn--sm jt-min" data-a="min" title="Thu gọn khay việc"><i class="ti ti-chevron-down"></i> Thu gọn</button>`
      + cards.map(cardHtml).join('')
      + (ap.line ? `<button class="jt-q" data-a="ap" title="Mở panel Tự lái"><i class="ti ti-rocket"></i><span>${esc(ap.line)}</span><i class="ti ti-chevron-right"></i></button>` : '');
    for (const c of cards) patch(c);
  }
  function onClick(e) {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a, id = b.closest('[data-id]')?.dataset.id, c = cards.find(x => x.id === id);
    if (a === 'min') { mini = true; render(); } else if (a === 'max') { mini = false; render(); } else if (a === 'ap') openAp();
    else if (a === 'stop') { b.disabled = true; b.textContent = 'Đang dừng…'; S.api('/api/job/cancel', {}).catch(() => {}); }
    else if (a === 'close' && c) { cards.splice(cards.indexOf(c), 1); render(); }
    else if (a === 'act' && c) { const k = c.acts?.[+b.dataset.k]; if (k) Promise.resolve(k.on?.(c)).then(r => { if (r === 'close') { cards.splice(cards.indexOf(c), 1); render(); } }); }
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
    cards.push(c); mini = false; syncLock(); render();
    return new Promise(done => {
      const tick = async () => {
        let j = null; try { j = await S.api('/api/job'); } catch { /* mất kết nối thoáng qua: thử lại */ }
        if (!j || j.state === 'running') { if (j) { c.job = j; patch(c); if (mini) render(); } return setTimeout(tick, 700); }
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
        // không còn việc chạy: 8 s sau thu khay thành chip để không che timeline (chuột đang ở trên khay hay việc lỗi thì giữ)
        if (c.phase !== 'err') setTimeout(() => { if (!running() && !mini && !host?.matches(':hover') && !cards.some(x => phase(x) === 'err')) { mini = true; render(); } }, 8000);
        done({ ok: c.phase === 'ok', job: j, result: res });
      };
      setTimeout(tick, 700);
    });
  }
  // Server bận (POST trả 409 "Đang có tác vụ khác chạy"): toast chỉ tên việc đang chạy, không hộp lỗi
  function refuse(r) {
    const run = running();
    S.toast(J.busyMessage(run?.title || J.queueRunning(ap.items) || ''));
    if (mini) { mini = false; render(); }
    return r;
  }
  // 15_autopilot.js gọi mỗi lần đọc /api/autopilot/state: dòng tóm tắt hàng đợi trong khay
  function autopilot(state) {
    const items = state?.items || [], line = J.queueLine(items);
    if (line === ap.line) { ap.items = items; return; }
    ap = { items, line }; render();
  }

  S.jobs = { exportNote: J.exportNote, track, refuse, locked, running: () => running()?.title || '', autopilot, show: () => { mini = false; render(); }, log: showLog, cards: () => cards.slice() };
  // tạo dự án mới (studio.js): trình chỉnh sửa hiện chỗ chờ, trang chủ và Tự lái vẫn dùng được
  if (!cl('np-wait')) { const w = document.createElement('div'); w.id = 'np-wait'; w.setAttribute('role', 'status'); w.innerHTML = '<i class="ti ti-loader-2 spin"></i><b>Đang tạo dự án mới…</b><span>Xong sẽ tự mở. Trang chủ và Tự lái vẫn dùng được trong lúc chờ.</span>'; (cl('center') || document.body).appendChild(w); }
})();
