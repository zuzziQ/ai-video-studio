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
  .pf-card { background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r); padding: 10px; margin: 8px 0; min-width: 0; }
  .pf-card h4 { margin: 0 0 8px; font-size: 12px; display: flex; align-items: center; gap: 6px; color: var(--tx); }
  .pf-card h4 .r { margin-left: auto; }
  .pf-card h4 .r button { padding: 2px 7px; font-size: 11px; }
  .pf-hw { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 4px 8px; font-size: 11.5px; }
  .pf-hw dt { color: var(--tx3); } .pf-hw dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .pf-prof { display: grid; gap: 6px; }
  .pf-prof button { display: block; width: 100%; text-align: left; padding: 8px 10px; border: 1px solid var(--line2); border-radius: 8px; background: var(--bg3); min-width: 0; white-space: normal; height: auto; }
  .pf-prof button b { font-size: 12px; display: flex; gap: 6px; align-items: center; }
  .pf-prof button b em { font-style: normal; margin-left: auto; font-size: 10px; font-weight: 600; color: var(--acc); }
  .pf-prof button small { display: block; color: var(--tx3); font-size: 10.5px; line-height: 1.4; margin-top: 2px; }
  .pf-prof button.on { border-color: var(--acc-line); background: var(--acc-soft); }
  .pf-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4px 8px; }
  .pf-grid label { display: block; min-width: 0; } .pf-grid span { display: block; font-size: 10.5px; color: var(--tx3); margin: 6px 0 3px; }
  .pf-grid select, .pf-grid input { width: 100%; min-width: 0; box-sizing: border-box; }
  .pf-warn { font-size: 11px; color: var(--warn); line-height: 1.45; margin: 6px 0 0; overflow-wrap: anywhere; }
  .pf-warn code { font-size: 10.5px; }
  .pf-help { font-size: 10.5px; color: var(--tx3); line-height: 1.5; margin: 6px 0 0; }
  .pf-plan { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; table-layout: fixed; }
  .pf-plan th, .pf-plan td { text-align: left; padding: 3px 4px; border-top: 1px solid var(--line); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pf-plan th { color: var(--tx3); font-weight: 500; }
  .pf-plan td.n, .pf-plan th.n { text-align: right; }
  .pf-row { display: flex; gap: 6px; align-items: center; margin-top: 8px; min-width: 0; }
  .pf-row > select { flex: 1; min-width: 0; } .pf-row > button { flex: none; }
  .pf-go { width: 100%; justify-content: center; margin-top: 8px; }
  .pf-bar { height: 4px; background: var(--bg4); border-radius: 4px; overflow: hidden; margin: 8px 0 4px; } .pf-bar i { display: block; height: 100%; background: var(--acc); width: 0; transition: width .3s; }
  .pf-res { font-size: 11.5px; padding: 8px 10px; border-radius: 8px; margin-top: 8px; overflow-wrap: anywhere; line-height: 1.45; background: var(--acc-soft); border: 1px solid var(--acc-line); }
  .pf-res.bad { background: rgba(248,113,113,.08); border-color: rgba(248,113,113,.3); }
  .pf-res.warn { background: rgba(251,191,36,.08); border-color: rgba(251,191,36,.3); color: var(--warn); }
  .pf-xp { font-size: 11.5px; color: var(--tx2); margin: 10px 0 0; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .pf-xp a { color: var(--acc); cursor: pointer; }`;
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
      <div class="pf-prof">${v.profiles.map(p => `<button data-pf="pick" data-id="${esc(p.id)}" class="${p.id === v.profile ? 'on' : ''}" ${S.saving ? 'disabled' : ''}>
        <b>${esc(p.label)}${p.id === v.profile ? '<em>ĐANG DÙNG</em>' : ''}</b><small>${esc(p.hint)}</small></button>`).join('')}</div>
      ${v.profile === 'tuy-chinh' ? customForm() : ''}${act}${envLine()}${planTable()}</div>`;
  }
  const opt = (map, cur, list) => list.map(k => `<option value="${esc(String(k))}" ${String(k) === String(cur) ? 'selected' : ''}>${esc(map[k] || String(k))}</option>`).join('');
  function customForm() {
    const f = S.form, c = S.v.choices, workers = ['', ...Array.from({ length: c.maxWorkers }, (_, i) => i + 1)];
    return `<div class="pf-grid" style="margin-top:8px">
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
    return `<table class="pf-plan"><thead><tr><th>Kế hoạch 30 s</th><th class="n">Worker</th><th>Preset</th><th>Encoder</th></tr></thead><tbody>
      ${[['720', '720p'], ['1080', '1080p'], ['4k', '4K']].map(([k, n]) => { const p = P[k]; return p ? `<tr><td>${n}${p.ramCap ? ' <span class="muted" title="Bị hạ vì RAM trống thấp">(RAM)</span>' : ''}</td><td class="n">${p.workers}</td><td>${esc(p.preset || '—')}</td><td>${esc(ENC[p.encoder] || p.encoder)}</td></tr>` : ''; }).join('')}
      </tbody></table><p class="pf-help">Ưu tiên: ${esc(PRIO[r.priority] || r.priority)} · lượt render cùng lúc: ${r.slots || 'không điều phối'} · whisper: ${esc(WD[r.whisperDevice] || r.whisperDevice)}.</p>`;
  }
  function benchCard() {
    const j = S.benchJob, rows = j?.bench || S.bench || [], running = j?.state === 'running';
    const tbl = rows.length ? `<table class="pf-plan"><thead><tr><th>Profile</th><th class="n">Giây</th><th class="n">fps</th><th class="n">Worker</th><th>Encoder</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td title="${esc(r.label)}">${esc(r.label)}</td>${r.state === 'xong' ? `<td class="n">${r.sec}</td><td class="n">${r.fps}</td><td class="n">${r.workers ?? '—'}</td><td title="${esc(r.encoder || '')}">${esc(r.encoder || '—')}</td>` : `<td colspan="4" class="muted">${esc(r.state)}</td>`}</tr>`).join('')}</tbody></table>` : '';
    // Huỷ theo yêu cầu không phải lỗi: màu vàng như stoppedNotice của studio.js (M60), lỗi thật màu đỏ.
    const st = j && j.state !== 'running' && j.state !== 'done' ? `<div class="pf-res ${j.state === 'error' ? 'bad' : 'warn'}">${esc(j.step || j.state)}</div>` : '';
    return `<div class="pf-card"><h4><i class="ti ti-stopwatch"></i> Đo thử</h4>
      <p class="pf-help" style="margin-top:0">Render 10 s của dự án mẫu với Tiết kiệm, Cân bằng và Tốc độ (bản chép tạm, xoá sau khi đo). Mất khoảng 1–3 phút.</p>
      ${running ? `<div class="pf-bar"><i style="width:${Math.round((j.progress || 0) * 100)}%"></i></div><div class="pf-help">${esc(j.step || '')}</div><button class="pf-go" data-pf="cancel"><i class="ti ti-player-stop"></i> Dừng</button>`
        : `<button class="pf-go" data-pf="bench"><i class="ti ti-player-play"></i> Đo thử 10 s</button>`}${tbl}${st}</div>`;
  }
  function adviseCard() {
    if (!S.advise) return '';
    const a = S.adv;
    const res = !a ? '' : a.error ? `<div class="pf-res bad">${esc(a.error)}</div>`
      : `<div class="pf-res"><b>${esc(label(a.profile))}</b>${a.overrides && Object.keys(a.overrides).length ? ` · ${esc(Object.entries(a.overrides).map(([k, x]) => `${k}=${x ?? 'tự động'}`).join(', '))}` : ''}<br>${esc(a.reason || '')}
        <div class="pf-row"><button class="primary" data-pf="apply" ${S.saving ? 'disabled' : ''}><i class="ti ti-check"></i> Áp dụng</button></div></div>`;
    return `<div class="pf-card" id="pf-ai"><h4><i class="ti ti-sparkles"></i> Hỏi AI chọn profile</h4>
      <div class="pf-row"><select id="pf-goal">${GOALS.map(([k, n]) => `<option value="${k}" ${k === S.goal ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <button data-pf="ask" ${S.asking ? 'disabled' : ''}><i class="ti ti-sparkles"></i> ${S.asking ? 'Đang hỏi…' : 'Hỏi AI'}</button></div>${res}</div>`;
  }
  function logCard() {
    const L = S.log.slice().reverse();
    const t = s => { const d = new Date(s); return isNaN(d) ? '' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    return `<div class="pf-card"><h4><i class="ti ti-history"></i> Lịch sử render <span class="r muted" style="font-weight:500;font-size:10.5px">${L.length} lượt gần nhất</span></h4>
      ${L.length ? `<table class="pf-plan"><thead><tr><th style="width:62px">Lúc</th><th>Profile</th><th class="n">Khổ</th><th class="n">Giây</th><th class="n">fps</th></tr></thead><tbody>
      ${L.map(e => `<tr title="${esc(`${e.workers} worker · ${e.encoder || ''} · ${e.chrome || ''}${e.waited_s ? ` · chờ ${e.waited_s}s` : ''}`)}"><td>${t(e.at)}</td><td>${esc(label(e.profile))}</td><td class="n">${Math.min(e.W, e.H)}p</td><td class="n">${e.sec}</td><td class="n">${e.fps}</td></tr>`).join('')}</tbody></table>`
        : '<p class="pf-help" style="margin-top:0">Chưa có lượt render nào. Mỗi lần xuất video hoặc đo thử sẽ ghi một dòng.</p>'}</div>`;
  }
  function render() {
    if (!active()) return;
    const b = body(); if (!b) return;
    if (S.err && !S.v) { b.innerHTML = `<div class="pf-res bad">Không đọc được cấu hình hiệu năng: ${esc(S.err)}</div>`; return; }
    if (!S.v) { b.innerHTML = '<div class="muted" style="padding:12px 0">Đang đo máy…</div>'; return; }
    const keep = b.scrollTop;
    b.innerHTML = `${S.err ? `<div class="pf-res bad">${esc(S.err)}</div>` : ''}${hwCard()}${profCard()}${adviseCard()}${benchCard()}${logCard()}`;
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
