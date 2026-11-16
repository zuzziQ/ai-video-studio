// Hiệu năng (S08 · M67): panel trái "Hiệu năng": máy này, chọn profile (scripts/perf_profile.mjs, M64), form Tuỳ chỉnh,
// biến môi trường đang ghi đè, "Đo thử 10 s", lịch sử perf_log, "Hỏi AI chọn profile" (POST /api/perf/advise của M68: không
// có route đó thì ẩn nút). Hộp xuất video hiện tên profile đang dùng. API: studio/routes/29_perf.mjs.
'use strict';
(() => {
  const { $, esc } = Studio;
  const S = { v: null, err: '', log: [], form: null, bench: null, benchJob: null, polling: false, advise: true, asking: false, goal: 'nhanh', adv: null, saving: false };
  const GOALS = [['nhanh', 'Nhanh nhất'], ['song-song', 'Vừa làm việc khác'], ['chat-luong', 'Chất lượng cao nhất']];
  const ENC = { auto: 'Tự dò', nvenc: 'NVENC (NVIDIA)', qsv: 'Quick Sync (Intel)', videotoolbox: 'VideoToolbox (Mac)', x264: 'x264 (CPU)' };
  const PRIO = { normal: 'Bình thường', below_normal: 'Thấp (máy mượt hơn)' };
  const WD = { auto: 'Tự chọn', cuda: 'GPU (CUDA)', cpu: 'CPU' };
  const css = document.createElement('style');
  css.textContent = `
  .pf-card { background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); padding: var(--space-3); margin: var(--space-2) 0; min-width: 0; }
  .pf-card h4 { margin: 0 0 var(--space-2); font-size: var(--text-xs); display: flex; align-items: center; gap: var(--space-2); color: rgb(var(--color-fg)); }
  .pf-card h4 .r { margin-left: auto; } .pf-card h4 .r.pf-sub { font-weight: 500; font-size: var(--text-2xs); }
  .pf-card h4 .r button { padding: var(--space-050) var(--space-2); font-size: var(--text-2xs); }
  .pf-hw { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: var(--space-1) var(--space-2); font-size: var(--text-xs); }
  .pf-hw dt { color: rgb(var(--color-fg-subtle)); } .pf-hw dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .pf-prof { display: grid; gap: var(--space-2); }
  .pf-prof .ui-choice { align-items: stretch; width: 100%; min-width: 0; padding: var(--space-2) var(--space-3); border-radius: var(--radius-control); white-space: normal; height: auto; }
  .pf-prof .ui-choice__title { font-size: var(--text-xs); display: flex; gap: var(--space-2); align-items: center; }
  .pf-prof .ui-choice__title em { font-style: normal; margin-left: auto; font-size: var(--text-2xs); font-weight: 600; color: rgb(var(--color-accent-text)); }
  .pf-prof .ui-choice__desc { color: rgb(var(--color-fg-subtle)); line-height: 1.4; }
  .pf-mt { margin-top: var(--space-2); }
  .pf-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-1) var(--space-2); }
  .pf-grid label { display: block; min-width: 0; } .pf-grid span { display: block; font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); margin: var(--space-2) 0 var(--space-1); }
  .pf-grid select, .pf-grid input { width: 100%; min-width: 0; box-sizing: border-box; }
  .pf-warn { font-size: var(--text-2xs); color: rgb(var(--color-warning-text)); line-height: 1.45; margin: var(--space-2) 0 0; overflow-wrap: anywhere; }
  .pf-warn code { font-size: var(--text-2xs); }
  .pf-help { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); line-height: 1.5; margin: var(--space-2) 0 0; } .pf-help.pf-mt0 { margin-top: 0; }
  .pf-tshell { margin-top: var(--space-2); }
  .pf-plan { font-size: var(--text-2xs); table-layout: fixed; }
  .pf-plan th, .pf-plan td { padding: var(--space-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pf-plan thead th { text-transform: none; letter-spacing: 0; } /* panel ~300px: uppercase headers would be cut */
  .pf-plan .pf-col-at { width: 64px; }
  .pf-row { display: flex; gap: var(--space-2); align-items: center; margin-top: var(--space-2); min-width: 0; }
  .pf-row > select { flex: 1; min-width: 0; } .pf-row > button { flex: none; }
  .pf-go { width: 100%; justify-content: center; margin-top: var(--space-2); }
  .pf-bar { height: 4px; background: rgb(var(--color-surface-hover)); border-radius: var(--radius-pill); overflow: hidden; margin: var(--space-2) 0 var(--space-1); } .pf-bar i { display: block; height: 100%; background: rgb(var(--color-accent-text)); width: var(--w, 0%); transition: width var(--duration-slow) var(--ease-standard); }
  .pf-res { font-size: var(--text-xs); padding: var(--space-2) var(--space-3); border-radius: var(--radius-control); margin-top: var(--space-2); overflow-wrap: anywhere; line-height: 1.45; background: rgb(var(--color-accent-soft) / .24); border: 1px solid rgb(var(--color-accent-text) / .5); }
  .pf-ban { margin-top: var(--space-2); overflow-wrap: anywhere; }
  .pf-xp { font-size: var(--text-xs); color: rgb(var(--color-fg-muted)); margin: var(--space-3) 0 0; display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
  .pf-xp a { color: rgb(var(--color-accent-text)); cursor: pointer; }`;
  document.head.appendChild(css);

  const active = () => document.querySelector('#rail .on')?.dataset.p === 'perf';
  const body = () => $('#libbody');
  const api = (u, b) => Studio.api(u, b).catch(e => ({ error: e.message }));
  const label = id => S.v?.profiles.find(p => p.id === id)?.label || id;
  const workersTxt = w => (w == null ? 'tự động' : w === 'physical-1' ? 'nhân thật − 1' : String(w));

  async function load(fresh) {
    const [v, log] = await Promise.all([api('/api/perf' + (fresh ? '?fresh=1' : '')), api('/api/perf/log?n=20')]);
    if (v.error) { S.err = v.error; } else { S.v = v; S.err = ''; S.form = { ...defaultsFor('tuy-chinh'), ...v.custom }; }
    S.log = Array.isArray(log) ? log : [];
  }
  function defaultsFor(id) {
    const p = S.v?.profiles.find(x => x.id === id) || {};
    return { workers: typeof p.workers === 'number' ? p.workers : null, encoder: p.encoder || 'auto', preset: p.preset ?? null, priority: p.priority || 'normal', slots: p.slots || 1, whisperDevice: p.whisperDevice || 'auto' };
  }

  function hwCard() {
    const h = S.v.hw, g = h.gpu || [], e = h.encoder;
    return `<div class="pf-card"><h4><i class="ti ti-device-desktop"></i> Máy này <span class="r"><button data-pf="refresh" title="Đo lại"><i class="ti ti-refresh"></i></button></span></h4>
      <dl class="pf-hw">
        <dt>CPU</dt><dd>${h.cores.physical} nhân thật · ${h.cores.logical} luồng</dd>
        <dt>RAM</dt><dd>trống ${h.ram.free_gb} / ${h.ram.total_gb} GB</dd>
        <dt>GPU</dt><dd>${g.length ? g.map(x => `${esc(x.name)}${x.vram_mb ? ` · ${(x.vram_mb / 1024).toFixed(1)} GB VRAM${x.vram_free_mb != null ? ` (trống ${(x.vram_free_mb / 1024).toFixed(1)})` : ''}` : ''}`).join('<br>') : '<span class="muted">không thấy GPU NVIDIA</span>'}</dd>
        <dt>Chrome</dt><dd>${h.chrome.mode === 'gpu' ? 'Dựng bằng GPU' : 'SwiftShader (CPU)'}${h.chrome.headless_shell ? ' · headless shell' : ''}</dd>
        <dt>Encoder</dt><dd>${e ? `${esc(ENC[e.final] || e.final)}${e.segment && e.segment !== e.final ? ` · đoạn: ${esc(ENC[e.segment] || e.segment)}` : ''}` : '<span class="muted">chưa dò được</span>'}</dd>
      </dl></div>`;
  }
  function envLine() {
    const on = Object.entries(S.v.env).filter(([, x]) => x).map(([k]) => k);
    return on.length ? `<p class="pf-warn"><i class="ti ti-alert-triangle"></i> Đang bị biến môi trường ghi đè: ${on.map(k => `<code>${esc(k)}</code>`).join(', ')}. Giá trị đặt ở đây chỉ có hiệu lực cho núm không bị ghi đè.</p>` : '';
  }
  function profCard() {
    const v = S.v, act = v.active !== v.profile ? `<p class="pf-warn">Đang chạy theo <b>${esc(label(v.active))}</b> (biến <code>AVS_PERF_PROFILE</code>), không phải profile đã lưu.</p>` : '';
    return `<div class="pf-card"><h4><i class="ti ti-gauge"></i> Profile</h4>
      <div class="pf-prof" role="radiogroup">${v.profiles.map(p => `<button data-pf="pick" data-id="${esc(p.id)}" class="ui-choice" role="radio" aria-checked="${p.id === v.profile}" ${S.saving ? 'disabled' : ''}>
        <b class="ui-choice__title">${esc(p.label)}${p.id === v.profile ? '<em>ĐANG DÙNG</em>' : ''}</b><small class="ui-choice__desc">${esc(p.hint)}</small></button>`).join('')}</div>
      ${v.profile === 'tuy-chinh' ? customForm() : ''}${act}${envLine()}${planTable()}</div>`;
  }
  const opt = (map, cur, list) => list.map(k => `<option value="${esc(String(k))}" ${String(k) === String(cur) ? 'selected' : ''}>${esc(map[k] || String(k))}</option>`).join('');
  function customForm() {
    const f = S.form, c = S.v.choices, workers = ['', ...Array.from({ length: c.maxWorkers }, (_, i) => i + 1)];
    return `<div class="pf-grid pf-mt">
      <label><span>Worker</span><select data-pfc="workers">${opt({ '': 'Tự động' }, f.workers ?? '', workers)}</select></label>
      <label><span>Encoder</span><select data-pfc="encoder">${opt(ENC, f.encoder, c.encoder)}</select></label>
      <label><span>Preset x264</span><select data-pfc="preset">${opt({ '': 'Mặc định' }, f.preset ?? '', ['', ...c.preset])}</select></label>
      <label><span>Ưu tiên</span><select data-pfc="priority">${opt(PRIO, f.priority, c.priority)}</select></label>
      <label><span>Lượt render cùng lúc</span><select data-pfc="slots">${opt({}, f.slots, Array.from({ length: c.maxSlots }, (_, i) => i + 1))}</select></label>
      <label><span>Whisper</span><select data-pfc="whisperDevice">${opt(WD, f.whisperDevice, c.whisperDevice)}</select></label>
    </div><button class="primary pf-go" data-pf="save-custom" ${S.saving ? 'disabled' : ''}><i class="ti ti-device-floppy"></i> Lưu tuỳ chỉnh</button>`;
  }
  function planTable() {
    const P = S.v.plans, r = S.v.resolved;
    return `<div class="ui-table-shell pf-tshell"><table class="ui-table pf-plan"><thead><tr><th>Kế hoạch 30 s</th><th class="is-num">Worker</th><th>Preset</th><th>Encoder</th></tr></thead><tbody>
      ${[['720', '720p'], ['1080', '1080p'], ['4k', '4K']].map(([k, n]) => { const p = P[k]; return p ? `<tr><td>${n}${p.ramCap ? ' <span class="muted" title="Bị hạ vì RAM trống thấp">(RAM)</span>' : ''}</td><td class="is-num">${p.workers}</td><td>${esc(p.preset || '—')}</td><td>${esc(ENC[p.encoder] || p.encoder)}</td></tr>` : ''; }).join('')}
      </tbody></table></div><p class="pf-help">Ưu tiên: ${esc(PRIO[r.priority] || r.priority)} · lượt render cùng lúc: ${r.slots || 'không điều phối'} · whisper: ${esc(WD[r.whisperDevice] || r.whisperDevice)}.</p>`;
  }
  function benchCard() {
    const j = S.benchJob, rows = j?.bench || S.bench || [], running = j?.state === 'running';
    const tbl = rows.length ? `<div class="ui-table-shell pf-tshell"><table class="ui-table pf-plan"><thead><tr><th>Profile</th><th class="is-num">Giây</th><th class="is-num">fps</th><th class="is-num">Worker</th><th>Encoder</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td title="${esc(r.label)}">${esc(r.label)}</td>${r.state === 'xong' ? `<td class="is-num">${r.sec}</td><td class="is-num">${r.fps}</td><td class="is-num">${r.workers ?? '—'}</td><td title="${esc(r.encoder || '')}">${esc(r.encoder || '—')}</td>` : `<td colspan="4" class="muted">${esc(r.state)}</td>`}</tr>`).join('')}</tbody></table></div>` : '';
    // Huỷ theo yêu cầu không phải lỗi: màu vàng như stoppedNotice của studio.js (M60), lỗi thật màu đỏ.
    const st = j && j.state !== 'running' && j.state !== 'done' ? `<div class="ui-banner pf-ban ${j.state === 'error' ? 'ui-banner--err' : 'ui-banner--warn'}" role="status">${esc(j.step || j.state)}</div>` : '';
    return `<div class="pf-card"><h4><i class="ti ti-stopwatch"></i> Đo thử</h4>
      <p class="pf-help pf-mt0">Render 10 s của dự án mẫu với Tiết kiệm, Cân bằng và Tốc độ (bản chép tạm, xoá sau khi đo). Mất khoảng 1–3 phút.</p>
      ${running ? `<div class="pf-bar"><i data-w="${Math.round((j.progress || 0) * 100)}"></i></div><div class="pf-help">${esc(j.step || '')}</div><button class="pf-go" data-pf="cancel"><i class="ti ti-player-stop"></i> Dừng</button>`
        : `<button class="pf-go" data-pf="bench"><i class="ti ti-player-play"></i> Đo thử 10 s</button>`}${tbl}${st}</div>`;
  }
  function adviseCard() {
    if (!S.advise) return '';
    const a = S.adv;
    const res = !a ? '' : a.error ? `<div class="ui-banner ui-banner--err pf-ban" role="alert">${esc(a.error)}</div>`
      : `<div class="pf-res"><b>${esc(label(a.profile))}</b>${a.overrides && Object.keys(a.overrides).length ? ` · ${esc(Object.entries(a.overrides).map(([k, x]) => `${k}=${x ?? 'tự động'}`).join(', '))}` : ''}<br>${esc(a.reason || '')}
        <div class="pf-row"><button class="primary" data-pf="apply" ${S.saving ? 'disabled' : ''}><i class="ti ti-check"></i> Áp dụng</button></div></div>`;
    return `<div class="pf-card" id="pf-ai"><h4><i class="ti ti-sparkles"></i> Hỏi AI chọn profile</h4>
      <div class="pf-row"><select id="pf-goal">${GOALS.map(([k, n]) => `<option value="${k}" ${k === S.goal ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <button data-pf="ask" ${S.asking ? 'disabled' : ''}><i class="ti ti-sparkles"></i> ${S.asking ? 'Đang hỏi…' : 'Hỏi AI'}</button></div>${res}</div>`;
  }
  function logCard() {
    const L = S.log.slice().reverse();
    const t = s => { const d = new Date(s); return isNaN(d) ? '' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    return `<div class="pf-card"><h4><i class="ti ti-history"></i> Lịch sử render <span class="r muted pf-sub">${L.length} lượt gần nhất</span></h4>
      ${L.length ? `<div class="ui-table-shell pf-tshell"><table class="ui-table pf-plan"><thead><tr><th class="pf-col-at">Lúc</th><th>Profile</th><th class="is-num">Khổ</th><th class="is-num">Giây</th><th class="is-num">fps</th></tr></thead><tbody>
      ${L.map(e => `<tr title="${esc(`${e.workers} worker · ${e.encoder || ''} · ${e.chrome || ''}${e.waited_s ? ` · chờ ${e.waited_s}s` : ''}`)}"><td>${t(e.at)}</td><td>${esc(label(e.profile))}</td><td class="is-num">${Math.min(e.W, e.H)}p</td><td class="is-num">${e.sec}</td><td class="is-num">${e.fps}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="pf-help pf-mt0">Chưa có lượt render nào. Mỗi lần xuất video hoặc đo thử sẽ ghi một dòng.</p>'}</div>`;
  }
  function render() {
    if (!active()) return;
    const b = body(); if (!b) return;
    if (S.err && !S.v) { b.innerHTML = `<div class="ui-banner ui-banner--err pf-ban" role="alert">Không đọc được cấu hình hiệu năng: ${esc(S.err)}</div>`; return; }
    if (!S.v) { b.innerHTML = '<div class="ui-state ui-state--loading" role="status"><i class="ti ti-loader-2 ui-state__icon"></i> Đang đo máy…</div>'; return; }
    const keep = b.scrollTop;
    b.innerHTML = `${S.err ? `<div class="ui-banner ui-banner--err pf-ban" role="alert">${esc(S.err)}</div>` : ''}${hwCard()}${profCard()}${adviseCard()}${benchCard()}${logCard()}`;
    b.querySelectorAll('.pf-bar i[data-w]').forEach(i => i.style.setProperty('--w', i.dataset.w + '%'));
    b.scrollTop = keep;
  }

  async function save(payload, msg) {
    S.saving = true; render();
    const r = await api('/api/perf', payload);
    S.saving = false;
    if (r.error) { S.err = r.error; Studio.toast('Lỗi: ' + r.error); } else { S.v = r; S.err = ''; S.form = { ...defaultsFor('tuy-chinh'), ...r.custom }; Studio.toast(msg); }
    render(); return !r.error;
  }
  async function pollBench() {
    if (S.polling) return; S.polling = true;
    try {
      for (;;) {
        const j = await api('/api/job');
        if (!j || j.kind !== 'perf-bench') break;
        S.benchJob = j; render();
        if (j.state !== 'running') { S.bench = j.bench || null; break; }
        await new Promise(ok => setTimeout(ok, 1000));
      }
    } finally { S.polling = false; }
    const lg = await api('/api/perf/log?n=20'); if (Array.isArray(lg)) S.log = lg;
    render();
  }
  async function ask() {
    S.goal = $('#pf-goal')?.value || S.goal; S.asking = true; S.adv = null; render();
    try {
      // fetch thô (không qua Studio.api) để phân biệt 404 = chưa có route của M68 → ẩn nút, không báo lỗi.
      const r = await fetch('/api/perf/advise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal: S.goal }) });
      if (r.status === 404) { S.advise = false; S.adv = null; return; }
      const j = await r.json().catch(() => ({}));
      const a = j.advice || j;
      S.adv = !r.ok || j.error ? { error: j.error || 'HTTP ' + r.status } : { profile: a.profile, overrides: a.overrides || {}, reason: a.reason || '' };
      if (!S.adv.error && !S.v.profiles.some(p => p.id === S.adv.profile)) S.adv = { error: 'AI trả profile không hợp lệ: ' + S.adv.profile };
    } catch (e) { S.adv = { error: e.message }; }
    finally { S.asking = false; render(); }
  }

  document.addEventListener('click', async e => {
    if (!e.target.closest?.('#libbody') || !active()) return;
    const b = e.target.closest('[data-pf]'); if (!b) return;
    const a = b.dataset.pf;
    if (a === 'refresh') { S.v = null; render(); await load(true); return render(); }
    if (a === 'pick') { const id = b.dataset.id; if (id === S.v.profile) return; return save({ profile: id }, 'Đã chọn profile ' + label(id)); }
    if (a === 'save-custom') {
      const custom = {};
      for (const s of body().querySelectorAll('[data-pfc]')) {
        const k = s.dataset.pfc, x = s.value;
        custom[k] = k === 'workers' ? (x === '' ? null : +x) : k === 'slots' ? +x : k === 'preset' ? (x === '' ? null : x) : x;
      }
      return save({ profile: 'tuy-chinh', custom }, 'Đã lưu tuỳ chỉnh');
    }
    if (a === 'bench') {
      const r = await api('/api/perf/bench', {});
      if (!r.ok) { Studio.toast(r.error || 'Không chạy được đo thử'); return; }
      S.bench = null; S.benchJob = { state: 'running', progress: 0, step: 'Bắt đầu', bench: r.profiles.map(id => ({ profile: id, label: label(id), state: 'chờ' })) };
      render(); return pollBench();
    }
    if (a === 'cancel') { await api('/api/job/cancel', {}); return; }
    if (a === 'ask') return ask();
    if (a === 'apply' && S.adv && !S.adv.error) {
      const p = { profile: S.adv.profile };
      if (S.adv.profile === 'tuy-chinh' && Object.keys(S.adv.overrides).length) p.custom = S.adv.overrides;
      if (await save(p, 'Đã áp dụng ' + label(S.adv.profile))) S.adv = null;
      return render();
    }
  });
  document.addEventListener('change', e => { if (e.target.id === 'pf-goal') S.goal = e.target.value; });

  // Hộp xuất video (studio.js): thêm một dòng tên profile đang dùng, chạy sau listener của studio.js (feature nạp sau).
  function exportLine() {
    const box = $('#modalbox'); if (!box || !$('#xgo') || box.querySelector('.pf-xp')) return;
    const v = S.v, id = v?.active || v?.profile;
    const el = document.createElement('p'); el.className = 'pf-xp';
    el.innerHTML = `<i class="ti ti-gauge"></i> Profile hiệu năng: <b>${esc(id ? label(id) : '…')}</b> <a data-pfx="open">đổi</a>`;
    box.querySelector('.qual')?.after(el);
    el.querySelector('[data-pfx]').onclick = () => { Studio.closeModal(); document.querySelector('#rail [data-p="perf"]')?.click(); };
  }
  Studio.onReady(() => {
    Studio.addPanel('perf', 'ti-gauge', 'Hiệu năng', () => {
      render();
      load(false).then(() => { render(); return api('/api/job'); }).then(j => { if (j?.kind === 'perf-bench') { S.benchJob = j; if (j.state === 'running') pollBench(); else { S.bench = j.bench || null; render(); } } });
    });
    $('#export')?.addEventListener('click', () => {
      exportLine();
      load(false).then(() => { const b = document.querySelector('.pf-xp b'); if (b && S.v) b.textContent = label(S.v.active || S.v.profile); });
    });
  });
})();
