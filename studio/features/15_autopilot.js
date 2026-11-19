// Tự lái: thả video → video hoàn chỉnh. Hàng đợi nền, thư mục tự động, chọn thương hiệu (phong cách dựng + "Học từ chỉnh sửa"
// của thương hiệu sửa ở trang Thương hiệu, 51_brands.js — S19 M133).
// Server: studio/routes/15_autopilot.mjs · scripts/autopilot.mjs, queue.mjs, profile.mjs (references/autopilot.md).
(() => {
  const { $, esc } = Studio;
  const S = { st: null, brand: null, product: null, path: '', uploading: null, open: {}, sig: '' };
  const css = document.createElement('style');
  css.textContent = `
  .ap-card { background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); padding: var(--space-3); margin: var(--space-2) 0; }
  .ap-card h4 { margin: 0 0 var(--space-2); font-size: var(--text-xs); display: flex; align-items: center; gap: var(--space-2); color: rgb(var(--color-fg)); }
  .ap-card h4 .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ap-card h4 .r { flex: none; margin-left: auto; font-weight: 500; color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); }
  .ap-drop { border: 1.5px dashed rgb(var(--color-line-hover)); border-radius: var(--radius-card); padding: var(--space-5) var(--space-3); text-align: center; color: rgb(var(--color-fg-muted)); cursor: pointer; transition: border-color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard); }
  .ap-drop i.big { font-size: 32px; color: rgb(var(--color-accent-text)); display: block; margin-bottom: var(--space-2); }
  .ap-drop b { display: block; font-size: var(--text-sm); color: rgb(var(--color-fg)); margin-bottom: var(--space-1); }
  .ap-drop small { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); }
  .ap-drop.over, .ap-drop:hover { border-color: rgb(var(--color-accent-text)); background: rgb(var(--color-accent-soft) / .24); }
  .ap-row2 { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: var(--space-2); align-items: center; margin-top: var(--space-2); } .ap-row2.ap-t1 { margin-top: var(--space-1); }
  .ap-lbl { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); display: block; margin: var(--space-2) 0 var(--space-1); }
  .ap-min { min-width: 0; }
  .help.ap-m0 { margin: 0; } .help.ap-t1 { margin-top: var(--space-1); } .help.ap-mt { margin: var(--space-2) 0 0; } .help.ap-mt1 { margin: var(--space-1) 0 0; } .help.ap-mb { margin: 0 0 var(--space-1); }
  .ap-sep { border-top: 1px solid rgb(var(--color-line)); padding-top: var(--space-2); margin-top: var(--space-2); }
  .ap-steps { display: flex; flex-direction: column; gap: var(--space-1); margin-top: var(--space-2); }
  .ap-step { display: grid; grid-template-columns: 16px minmax(0,1fr) auto; gap: var(--space-2); align-items: start; font-size: var(--text-xs); color: rgb(var(--color-fg-muted)); }
  .ap-step small { display: block; color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ap-step .s { color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); font-variant-numeric: tabular-nums; }
  .ap-step.done i { color: rgb(var(--color-success)); } .ap-step.warn i { color: rgb(var(--color-warning)); } .ap-step.error i { color: rgb(var(--color-danger)); } .ap-step.running { color: rgb(var(--color-fg)); } .ap-step.running i { color: rgb(var(--color-accent-text)); }
  .ap-step.skipped { opacity: .55; }
  .ap-bar { height: var(--space-1); background: rgb(var(--color-surface-hover)); border-radius: var(--radius-pill); overflow: hidden; margin-top: var(--space-2); } .ap-bar i { display: block; height: 100%; width: var(--w, 0%); background: linear-gradient(90deg, rgb(var(--color-accent-text)), rgb(var(--color-audio))); transition: width var(--duration-slow) var(--ease-standard); }
  .ap-it { display: grid; grid-template-columns: 16px minmax(0,1fr) auto; gap: var(--space-2); align-items: center; padding: var(--space-2) 0; border-top: 1px solid rgb(var(--color-line)); font-size: var(--text-xs); }
  .ap-it .nm { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .ap-it .st { color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ap-it .st.err { color: rgb(var(--color-danger)); }
  .ap-it .b { display: flex; gap: 1px; } .ap-it .b button { width: var(--h-sm); height: var(--h-sm); padding: 0; justify-content: center; }
  .ap-ok { color: rgb(var(--color-success)); } .ap-bad { color: rgb(var(--color-danger)); } .ap-run { color: rgb(var(--color-accent-text)); } .ap-warn { color: rgb(var(--color-warning)); } .ap-it .st.stop { color: rgb(var(--color-warning)); }
  .ap-tog { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); margin: var(--space-2) 0; cursor: pointer; } .ap-tog.ap-t3 { margin-top: var(--space-3); } .ap-tog input { width: auto; margin: 0; }
  .ap-tog small { display: block; color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); }
  .ap-fold { display: grid; grid-template-columns: minmax(0,1fr) var(--h-sm); gap: var(--space-1); align-items: center; margin-bottom: var(--space-1); } .ap-fold input { font-size: var(--text-2xs); height: var(--h-sm); }
  .ap-fold button { width: var(--h-sm); height: var(--h-sm); padding: 0; justify-content: center; }
  #ap-topbtn[hidden] { display: none; }
  #ap-topbtn .pct { font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); font-variant-numeric: tabular-nums; } #ap-topbtn .pct:empty { display: none; }
  #ap-topbtn.run .ti { color: rgb(var(--color-accent-text)); } #ap-topbtn.ok .ti { color: rgb(var(--color-success)); } #ap-topbtn.bad .ti { color: rgb(var(--color-danger)); }`;
  // Data-driven width of the progress bar arrives as data-v="--w:40%" and is set with style.setProperty after insert.
  const applyVars = root => (root || document).querySelectorAll('[data-v]').forEach(el => el.dataset.v.split(';').forEach(p => { const i = p.indexOf(':'); if (i > 0) el.style.setProperty(p.slice(0, i).trim(), p.slice(i + 1).trim()); }));
  document.head.appendChild(css);
  const active = () => document.querySelector('#rail .on')?.dataset.p === 'autopilot';
  const api = (u, b) => Studio.api(u, b);
  const ICON = { done: 'ti-circle-check ap-ok', error: 'ti-alert-triangle ap-bad', running: 'ti-loader-2 spin ap-run', cancelled: 'ti-player-stop ap-warn', paused: 'ti-player-pause ap-warn', queued: 'ti-clock muted', warn: 'ti-alert-circle ap-warn', skipped: 'ti-minus muted' };
  const KNAME = { autopilot: 'Tự lái', highlights: 'Video dài → shorts', topic: 'Chủ đề → video', variants: 'Biến thể', publish: 'Đăng' };
  const SRC = { watch: 'thư mục tự động', upload: 'kéo thả', ui: 'Studio', cli: 'dòng lệnh', app: 'thả vào app' };
  const profiles = () => S.st?.profiles?.list || [];
  const defProfile = () => S.st?.profiles?.default;
  const styleOf = id => (id && S.st?.profiles?.aliases?.[id]) || id; // S19 M133: id hồ sơ cũ (thư mục canh) → id phong cách

  async function refresh(force) {
    const st = await api('/api/autopilot/state').catch(() => null);
    if (!st || st.error) return;
    const sig = JSON.stringify([st.items, st.runner, st.learn]);
    const first = !S.st; S.st = st;
    if (S.brand == null) { S.brand = st.settings.brand || ''; S.product = st.settings.product || ''; } // S16 M121: lựa chọn gần nhất
    topBadge();
    Studio.jobs?.autopilot(st); // S26 M185: dòng tóm tắt hàng đợi trong khay việc (bấm mở panel này)
    if (!active()) return;
    if (first || force) return render();
    if (sig !== S.sig) { S.sig = sig; renderLive(); }
  }
  // S19 M132: thanh trên chỉ còn chỉ báo việc nền (như hàng đợi của Adobe Media Encoder): hiện khi có việc chạy / chờ, hoặc việc
  // vừa xong / vừa lỗi trong 15 phút mà chưa mở panel Tự lái xem; bấm mở panel. Điểm bắt đầu Tự lái ở thẻ của trang chủ.
  const FRESH_MS = 15 * 60e3, SEEN = 'avs.apSeen';
  const seenAt = () => { try { return +localStorage.getItem(SEEN) || 0; } catch { return 0; } };
  function topBadge() {
    const b = $('#ap-topbtn'); if (!b) return;
    const items = S.st?.items || [], now = Date.now();
    if (active()) try { localStorage.setItem(SEEN, String(now)); } catch { /* không lưu được: chỉ báo tự tắt sau 15 phút */ }
    const run = items.find(i => i.state === 'running'), wait = items.filter(i => i.state === 'queued').length;
    const since = Math.max(now - FRESH_MS, seenAt()), fin = items.filter(i => i.finished && Date.parse(i.finished) > since && (i.state === 'done' || i.state === 'error'));
    const bad = fin.filter(i => i.state === 'error').length, done = fin.length - bad;
    const [cls, ic, txt, tip] = run ? ['run', 'ti-loader-2 spin', `${Math.round((run.progress || 0) * 100)}%${wait ? ` +${wait}` : ''}`, `Tự lái đang chạy “${run.title || ''}”${wait ? ` · ${wait} việc chờ` : ''}`]
      : wait ? ['run', 'ti-clock', `${wait}`, `Tự lái: ${wait} việc đang chờ`]
      : bad ? ['bad', 'ti-alert-triangle', `${bad}`, `Tự lái: ${bad} việc vừa lỗi`]
      : done ? ['ok', 'ti-circle-check', `${done}`, `Tự lái: ${done} video vừa xong`] : [];
    b.hidden = !cls;
    if (!cls) return;
    b.className = `ghost ${cls}${b.classList.contains('on') ? ' on' : ''}`;
    const i = b.querySelector('.ti'); if (i.className !== `ti ${ic}`) i.className = `ti ${ic}`;
    b.querySelector('.pct').textContent = txt;
    b.title = `${tip} · bấm để xem hàng đợi`; b.setAttribute('aria-label', b.title);
  }

  // ---------- render ----------
  function render() {
    $('#libact').innerHTML = `<button class="icon" id="ap-refresh" title="Tải lại"><i class="ti ti-refresh"></i></button>`;
    $('#ap-refresh').onclick = () => refresh(true);
    if (!S.st) { $('#libbody').innerHTML = '<div class="help">Đang tải…</div>'; return; }
    const st = S.st;
    $('#libbody').innerHTML = `
    <div class="help ap-t1">Thả video thô, Studio tự làm tới MP4 và nội dung đăng. ${Studio.tip('Tự làm hết: phụ đề, cắt lỗi nói, AI dựng, b-roll, SFX + nhạc, xuất MP4, ảnh bìa, nội dung đăng. Chạy nền, bạn vẫn sửa video khác được.')}</div>
    <div class="ap-drop" id="ap-drop"><i class="ti ti-rocket big"></i><b>Thả video vào đây để tự dựng</b><small>mp4 · mov · m4v · mkv — có thể thả nhiều file</small>
      <input type="file" id="ap-file" accept="video/*,.mov,.mkv,.m4v" multiple hidden></div>
    <div id="ap-upl"></div>
    <div id="ap-claude"></div>
    <div id="ap-prep"></div>
    <div class="ap-row2"><span class="help ap-m0">Hoặc chọn video trên máy</span>
      <button id="ap-pick"><i class="ti ti-file-upload"></i> Chọn file</button></div>
    <label class="ap-lbl">Hoặc đường dẫn video / thư mục dự án trên máy</label>
    <div class="ap-row2"><input id="ap-path" placeholder="${/Win/i.test(navigator.platform || navigator.userAgent) ? 'D:\\Video\\clip.mp4' : '/Users/ban/Movies/clip.mov'}" value="${esc(S.path)}"><button id="ap-add" title="Thêm vào hàng đợi"><i class="ti ti-plus"></i> Thêm</button></div>
    <div id="ap-live"></div>
    <div id="ap-watch"></div>`;
    bindTop(); renderLive(); renderWatch(); renderClaude(); renderPrep();
  }
  // S16 M121: chuẩn bị trước khi chạy: thương hiệu (brand kit + Kho chứa dự án và Thành phẩm) và sản phẩm (không bắt buộc).
  // '__none' = không thương hiệu (Kho Chung, phong cách Chung); gửi kèm mỗi video (enqueue / upload), nhớ ở autopilot.json.
  // S19 M133: thương hiệu quyết định luôn phong cách dựng; '' (cách cũ "theo hồ sơ") → thương hiệu của phong cách mặc định.
  let PREP = null;
  const IS_MAC = /Mac/i.test(navigator.platform || navigator.userAgent || ''); // S26 M183: mục macOS chỉ hiện trên Mac
  // bước 'warn' của việc đã xong (autopilot.mjs ghi lý do vào result.steps): "Xong · bỏ qua: AI dựng (lý do), Đăng (lý do)"
  const skipOf = it => {
    if (it.state !== 'done' || !it.result?.steps) return '';
    const lab = Object.fromEntries((S.st?.steps || []).map(s => [s.id, s.label]));
    return Studio.apDefaults?.skipText(Object.fromEntries(Object.entries(it.result.steps).map(([k, v]) => [k, { ...v, label: lab[k] || k }]))) || '';
  };
  // S17 M126: video Tự lái vào Kho khác dự án đang mở → nhắc trước, cho đổi lại về thương hiệu của dự án đang mở
  function offKho(kit, name) {
    const cur = Studio.TL ? Studio.META?.kho : null;
    if (!cur || PREP.loading || (kit?.id || '') === (cur.brand || '')) return '';
    // Kho của thương hiệu mang tên thương hiệu (scripts/workspace.mjs workspaceFor); thư mục thật hiện ở bước Chuẩn bị
    const to = kit ? `Kho của thương hiệu <b>${esc(name(kit))}</b>` : 'Kho <b>Chung</b> (không thương hiệu)';
    const now = cur.brand ? `Kho ${esc(cur.title)}` : 'Kho Chung';
    return `<div class="help ap-mt"><i class="ti ti-alert-triangle ap-warn"></i> Video này sẽ vào ${to}, khác dự án đang mở (${now}).
      <button class="wf-lnk" id="ap-kho-back">Dùng thương hiệu của dự án đang mở</button></div>`;
  }
  function renderPrep() {
    const box = $('#ap-prep'); if (!box) return;
    if (!PREP) {
      PREP = { brands: [], products: [], loading: true };
      Promise.all([api('/api/brands').catch(() => []), api('/api/products').catch(() => []), api('/api/onboarding').catch(() => null)])
        .then(([b, p, ob]) => { PREP = { brands: Array.isArray(b) ? b : [], products: Array.isArray(p) ? p : [], onboard: ob && !ob.error ? ob.brand || '' : '' }; renderPrep(); });
    }
    const def = defProfile(), defBrand = def && def !== 'chung' && PREP.brands.some(b => b.id === def) ? def : '__none';
    if (!PREP.loading && (!S.brand || (S.brand !== '__none' && !PREP.brands.some(b => b.id === S.brand)))) { // chưa chọn / thương hiệu đã xoá
      // S26 M183: mặc định = thương hiệu của hướng dẫn đầu / thương hiệu duy nhất (Studio.apDefaults, 02_onboarding.js), rồi mới tới hồ sơ
      S.brand = Studio.apDefaults?.pickBrand({ saved: '', onboard: PREP.onboard, brands: PREP.brands }) || defBrand;
      if (S.brand !== '__none') api('/api/autopilot/settings', { brand: S.brand }).catch(() => {});
    }
    if (S.product && !PREP.loading && !PREP.products.some(p => p.id === S.product)) S.product = '';
    const kit = S.brand && S.brand !== '__none' ? PREP.brands.find(b => b.id === S.brand) : null;
    const sty = profiles().find(p => p.id === (kit ? kit.id : 'chung')), learn = S.st?.learn, proj = S.st?.project;
    const name = b => b.title || b.name || b.id, opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
    box.innerHTML = `<div class="ap-card"><h4><i class="ti ti-building-store"></i>Chuẩn bị trước khi chạy</h4>
      <label class="ap-lbl">Thương hiệu · Kho</label>
      <select id="ap-brand">${opt('__none', 'Không thương hiệu · Kho Chung', S.brand)}${PREP.brands.map(b => opt(b.id, name(b), S.brand)).join('')}</select>
      <label class="ap-lbl">Sản phẩm (không bắt buộc)</label>
      <select id="ap-product">${opt('', '— Không gắn sản phẩm —', S.product)}${PREP.products.map(p => opt(p.id, p.name || p.id, S.product)).join('')}</select>
      <div class="help ap-mt">${kit ? `Logo, màu, CTA của <b>${esc(name(kit))}</b>. ${Studio.tip('Dự án và thành phẩm vào Kho của thương hiệu này.' + (S.product ? ' Gắn sản phẩm bật kiểm tra quảng cáo (claim, chính sách) ở bước QC.' : ''))}`
        : `<i class="ti ti-info-circle ap-warn"></i> Không thương hiệu: không logo, màu, lời kết riêng. ${Studio.tip('Dự án và thành phẩm vào Kho Chung.' + (S.product ? ' Gắn sản phẩm bật kiểm tra quảng cáo (claim, chính sách) ở bước QC.' : ''))}`}
        ${PREP.brands.length ? '' : ' Chưa có thương hiệu: tạo ở bước <b>Chuẩn bị</b>.'}</div>${offKho(kit, name)}
      ${sty ? `<div class="help ap-mt"><i class="ti ti-adjustments"></i> Phong cách dựng ${kit ? `của <b>${esc(name(kit))}</b>` : '<b>Chung</b>'}${sty.saved || !kit ? '' : ' (đang theo Chung)'}:
        ${esc(Studio.brandStyle?.summary ? Studio.brandStyle.summary(sty) : ['b-roll ' + sty.broll_density, 'âm thanh ' + sty.sound].join(' · '))}${(sty.habits || []).some(h => !h.off) ? ` · áp ${(sty.habits || []).filter(h => !h.off).length} thói quen đã học` : sty.learn ? ` · đang học từ ${sty.learnedN || 0} video` : ''}.
        <button class="wf-lnk" id="ap-style">Sửa ở trang Thương hiệu</button>${proj?.autopilot ? ' <button class="wf-lnk" id="ap-learn" title="So dự án đang mở (do Tự lái làm) với bản Tự lái giao để học thói quen sửa của bạn">Học từ dự án này</button>' : ''}</div>` : ''}
      ${learn ? `<div class="help ap-mt1">${learn.ok ? `Lần học gần nhất: ${esc(learn.observation?.name || '')} → ${esc(learn.name || '')} (${new Date(learn.at).toLocaleTimeString('vi-VN')})` : `Chưa học: ${esc(learn.why || '')}`}</div>` : ''}
      <label class="ap-lbl">Kịch bản (không bắt buộc, cho video kế tiếp)</label><div id="ap-script"></div></div>`;
    Studio.scriptStage?.mount($('#ap-script')); // S17 M123 (studio/features/19_script.js)
    const save = () => api('/api/autopilot/settings', { brand: S.brand, product: S.product }).catch(() => {});
    $('#ap-brand').onchange = e => { S.brand = e.target.value; save(); renderPrep(); };
    $('#ap-kho-back')?.addEventListener('click', () => { const c = Studio.META?.kho; S.brand = c?.brand && PREP.brands.some(b => b.id === c.brand) ? c.brand : '__none'; save(); renderPrep(); });
    $('#ap-product').onchange = e => { S.product = e.target.value; save(); renderPrep(); };
    $('#ap-style')?.addEventListener('click', () => (Studio.brandStyle ? Studio.brandStyle.open(kit ? kit.id : 'chung') : document.querySelector('#rail [data-p="brands"]')?.click()));
    $('#ap-learn')?.addEventListener('click', async () => {
      if (Studio.saveNow && !await Studio.saveNow()) return;
      const r = await api('/api/autopilot/learn', {});
      Studio.toast(r.ok ? `Đã ghi nhận vào ${r.name || 'phong cách'}: ${r.rules?.notes?.length || 0} điều chỉnh (${r.rules?.n || 0} video)` : 'Chưa học: ' + (r.why || r.error));
      if (r.profiles) S.st.profiles = r.profiles; await refresh(); renderPrep();
    });
  }
  // S16 M120: báo trước khi chạy: máy không có Claude CLI thì "AI dựng giúp" và "Viết nội dung đăng" sẽ bị bỏ qua
  let claudeAsked = false;
  function renderClaude() {
    const box = $('#ap-claude'); if (!box) return;
    const R = Studio.setupCheck?.();
    if (!R && !claudeAsked) { claudeAsked = true; api('/api/setup/check').then(r => { if (r?.items && !Studio.setupCheck?.()) S.apClaude = r; renderClaude(); }).catch(() => {}); }
    const it = ((R || S.apClaude)?.items || []).find(i => i.id === 'claude');
    box.innerHTML = it && it.status !== 'ok' ? `<div class="ap-card"><i class="ti ti-alert-triangle ap-warn"></i> Máy chưa có Claude Code CLI: Tự lái vẫn chạy nhưng bỏ qua <b>AI dựng giúp</b> và <b>Viết nội dung đăng</b>.
      <button class="wf-lnk" id="ap-claude-fix">Kiểm tra máy</button></div>` : '';
    $('#ap-claude-fix')?.addEventListener('click', () => Studio.openSetup?.());
  }
  function stepList(it) {
    const steps = S.st.steps, ss = it.steps || {};
    return `<div class="ap-steps">${steps.map(s => {
      const x = ss[s.id] || {}, state = x.state || 'queued';
      return `<div class="ap-step ${state}"><i class="ti ${ICON[state] || ICON.queued}"></i><div class="ap-min">${esc(s.label)}${x.msg || x.detail ? `<small title="${esc(x.msg || x.detail)}">${esc(x.msg || x.detail)}</small>` : ''}</div><span class="s">${x.sec != null ? (x.sec < 10 ? x.sec.toFixed(1) : Math.round(x.sec)) + 's' : ''}</span></div>`;
    }).join('')}</div>`;
  }
  // Live list is rebuilt (innerHTML) on every change, ~1.5 s while a job runs. A rebuild between mouse-down and mouse-up loses
  // the click (QA L9: "Huỷ" right after "Thử lại" did nothing), so hold rebuilds while a button inside is pressed.
  let hold = false, held = false;
  let holdT = null;
  const release = () => { clearTimeout(holdT); if (!hold) return; hold = false; if (held) { held = false; setTimeout(renderLive, 0); } };
  // released outside the window sends no pointerup: a press elsewhere or 1.5 s later lets the list update again
  document.addEventListener('pointerdown', e => { release(); hold = !!e.target.closest?.('#ap-live button'); if (hold) holdT = setTimeout(release, 1500); });
  document.addEventListener('pointerup', release, true); document.addEventListener('pointercancel', release, true);
  function renderLive() {
    const box = $('#ap-live'); if (!box) return;
    if (hold) { held = true; return; }
    const st = S.st, items = st.items, run = items.find(i => i.state === 'running');
    const r = st.runner;
    const runnerNote = r.disabled ? 'Studio không chạy hàng đợi (AVS_NO_QUEUE) — dùng lệnh node scripts/queue.mjs run'
      : r.active ? '' : r.lock ? `Hàng đợi đang do tiến trình khác chạy (${r.lock.role === 'agent' ? 'chạy nền khi tắt app' : r.lock.role}, pid ${r.lock.pid})` : 'Đang khởi động hàng đợi…';
    box.innerHTML = `
    ${run ? `<div class="ap-card"><h4><i class="ti ti-loader-2 spin ap-run"></i><span class="t" title="${esc(run.input)}">Đang làm: ${esc(run.title)}</span><span class="r">${Math.round((run.progress || 0) * 100)}%</span></h4>
      <div class="help ap-m0" title="${esc(run.step)}">${esc((run.step || '').slice(0, 120))}</div><div class="ap-bar"><i data-v="--w:${Math.round((run.progress || 0) * 100)}%"></i></div>
      ${run.kind === 'autopilot' ? stepList(run) : ''}
      ${run.learnedApplied?.length ? `<div class="help ap-mt"><i class="ti ti-school"></i> Đã áp điều học được: ${esc(run.learnedApplied.length)} điều chỉnh</div>` : ''}
      <div class="acts"><button class="danger" data-act="cancel" data-id="${run.id}"><i class="ti ti-player-stop"></i> Huỷ</button></div></div>` : ''}
    <div class="ap-card"><h4><i class="ti ti-list-details"></i>Hàng đợi<span class="r">${items.filter(i => i.state === 'queued').length} chờ · ${items.filter(i => i.state === 'done').length} xong</span></h4>
      ${runnerNote ? `<div class="help ap-mb">${esc(runnerNote)}</div>` : ''}
      ${!items.length ? '<div class="help ap-m0">Chưa có việc nào. Thả video ở trên hoặc vào thư mục tự động.</div>' : items.map((it, k) => `<div class="ap-it"><i class="ti ${ICON[it.state] || ''}"></i>
        <div class="ap-min"><span class="nm" title="${esc(it.input)}">${esc(it.title)}</span>
          <span class="st ${it.state === 'error' ? 'err' : ['cancelled', 'paused'].includes(it.state) ? 'stop' : ''}" title="${esc(it.error || it.step || '')}">${esc(KNAME[it.kind] || it.kind)} · ${esc(SRC[it.source] || '')}${it.state === 'error' ? ' — ' + esc(it.error || '') : it.state === 'running' ? ` · ${Math.round((it.progress || 0) * 100)}%` : it.state === 'done' && it.result?.seconds ? ` · ${skipOf(it) ? '' : 'xong trong '}${it.result.seconds}s` : (it.state === 'queued' && it.attempt) || ['cancelled', 'paused'].includes(it.state) ? ' · ' + esc(it.step || (it.state === 'paused' ? 'Tạm dừng' : 'Đã huỷ')) : ''}</span>${skipOf(it) ? `<span class="st ap-warn" title="${esc(skipOf(it))}"><i class="ti ti-alert-triangle"></i> ${esc(skipOf(it))}. <button class="wf-lnk" data-fixsetup>Kiểm tra máy</button></span>` : ''}</div>
        <div class="b">
          ${it.state === 'queued' ? `<button class="icon" title="Lên" data-act="up" data-id="${it.id}" ${k === 0 ? 'disabled' : ''}><i class="ti ti-arrow-up"></i></button><button class="icon" title="Xuống" data-act="down" data-id="${it.id}"><i class="ti ti-arrow-down"></i></button>` : ''}
          ${it.state === 'done' && it.project ? `<button class="icon" title="Mở dự án trong Studio để chỉnh" data-act="open" data-id="${it.id}"><i class="ti ti-edit"></i></button>` : ''}
          ${it.state === 'done' && it.outputs?.length ? `<button class="icon" title="Mở video" data-play="${esc(it.outputs.find(o => /\.mp4$/i.test(o)) || '')}"><i class="ti ti-player-play"></i></button>` : ''}
          ${['done', 'error'].includes(it.state) ? `<button class="icon" title="Hiện trong Finder" data-act="reveal" data-id="${it.id}"><i class="ti ti-folder"></i></button>` : ''}
          ${['error', 'cancelled'].includes(it.state) ? `<button class="icon" title="Thử lại (chạy tiếp từ bước dừng)" data-act="retry" data-id="${it.id}"><i class="ti ti-reload"></i></button>` : ''}
          ${['queued', 'running'].includes(it.state) ? `<button class="icon" title="Huỷ" data-act="cancel" data-id="${it.id}"><i class="ti ti-x"></i></button>` : `<button class="icon" title="Xoá khỏi danh sách" data-act="remove" data-id="${it.id}"><i class="ti ti-trash"></i></button>`}
        </div></div>`).join('')}
      ${items.some(i => ['done', 'cancelled', 'error'].includes(i.state)) ? `<div class="acts">${items.some(i => ['done', 'cancelled'].includes(i.state)) ? '<button id="ap-clear"><i class="ti ti-clear-all"></i> Xoá việc đã xong</button>' : ''}${items.some(i => i.state === 'error') ? `<button class="danger" id="ap-clear-err"><i class="ti ti-trash-x"></i> Xoá mục lỗi (${items.filter(i => i.state === 'error').length})</button>` : ''}</div>` : ''}</div>`;
    applyVars(box);
    box.querySelectorAll('[data-act]').forEach(b => (b.onclick = () => itemAct(b.dataset.id, b.dataset.act)));
    box.querySelectorAll('[data-fixsetup]').forEach(b => (b.onclick = () => Studio.openSetup?.()));
    box.querySelectorAll('[data-play]').forEach(b => (b.onclick = () => b.dataset.play && api('/api/autopilot/reveal', { path: b.dataset.play })));
    if ($('#ap-clear')) $('#ap-clear').onclick = async () => { await api('/api/autopilot/clear', {}); refresh(true); };
    if ($('#ap-clear-err')) $('#ap-clear-err').onclick = async () => { if (!confirm('Xoá mọi mục lỗi khỏi hàng đợi? (không xoá file đã tạo)')) return; await api('/api/autopilot/clear-failed', {}); refresh(true); };
  }
  function renderWatch() {
    const st = S.st, w = st.settings.watch, ag = st.runner.agent || {};
    $('#ap-watch').innerHTML = `<div class="ap-card"><h4><i class="ti ti-folder-bolt"></i>Thư mục tự động</h4>
      <label class="ap-tog"><input type="checkbox" id="ap-won" ${w.on ? 'checked' : ''}><span>Tự dựng mọi video thả vào thư mục<small>Video đứng yên 5 giây (đã chép xong) mới được nhận. Mỗi Kho có sẵn thư mục “Tha vao day”: bản gốc chuyển sang Nguon, dự án vào Du an, thành phẩm vào Thanh pham.</small></span></label>
      ${(st.kho || []).map(k => `<div class="ap-sep"><label class="ap-lbl">Kho ${esc(k.kho)} · phong cách ${esc((profiles().find(p => p.id === styleOf(k.profile)) || {}).name || 'mặc định')}</label><div class="ap-fold"><input value="${esc(k.in)}" readonly><button class="icon" title="Mở thư mục" data-wopen="${esc(k.in)}"><i class="ti ti-external-link"></i></button></div></div>`).join('')}
      ${w.folders.length ? '<label class="ap-lbl ap-t1">Thư mục riêng (kiểu cũ)</label>' : ''}
      ${w.folders.map((f, i) => `<div class="ap-sep">
        <label class="ap-lbl">Thả video vào</label><div class="ap-fold"><input data-wf="${i}" data-k="in" value="${esc(f.in)}"><button class="icon" title="Mở trong Finder" data-wopen="${esc(f.in)}"><i class="ti ti-external-link"></i></button></div>
        <label class="ap-lbl">Kết quả (MP4, ảnh bìa, nội dung đăng)</label><div class="ap-fold"><input data-wf="${i}" data-k="done" value="${esc(f.done)}"><button class="icon" title="Mở trong Finder" data-wopen="${esc(f.done)}"><i class="ti ti-external-link"></i></button></div>
        <label class="ap-lbl">Bản gốc đã xử lý</label><div class="ap-fold"><input data-wf="${i}" data-k="processed" value="${esc(f.processed)}"><button class="icon" title="Mở trong Finder" data-wopen="${esc(f.processed)}"><i class="ti ti-external-link"></i></button></div>
        <div class="ap-row2 ap-t1"><select data-wf="${i}" data-k="profile" title="Thương hiệu (phong cách dựng) cho video thả vào đây"><option value="">Phong cách mặc định</option>${profiles().map(p => `<option value="${esc(p.id)}" ${f.profile && p.id === styleOf(f.profile) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
          <button class="icon" title="Bỏ thư mục này" data-wdel="${i}"><i class="ti ti-trash"></i></button></div></div>`).join('')}
      <div class="acts"><button id="ap-wadd"><i class="ti ti-folder-plus"></i> Thêm thư mục (cho thương hiệu khác)</button><button class="primary" id="ap-wsave"><i class="ti ti-device-floppy"></i> Lưu</button></div>
      ${st.runner.watchError ? `<div class="help ap-bad">${esc(st.runner.watchError)}</div>` : ''}
      ${IS_MAC ? `<label class="ap-tog ap-t3"><input type="checkbox" id="ap-agent" ${st.settings.agent || ag.installed ? 'checked' : ''}><span>Chạy cả khi tắt app<small>Cài một tác vụ nền macOS (LaunchAgent ${ag.installed ? '— đã cài' : ''}). Bỏ chọn để gỡ.</small></span></label>
      <label class="ap-tog"><input type="checkbox" id="ap-notify" ${st.settings.notify ? 'checked' : ''}><span>Thông báo macOS khi xong / lỗi</span></label>
      <label class="ap-tog"><input type="checkbox" id="ap-appdrop" ${st.settings.appDrop ? 'checked' : ''}><span>Thả vào app = tự lái<small>Thả video vào biểu tượng AI Video Studio → đưa thẳng vào hàng đợi Tự lái (thay vì chỉ tạo dự án).</small></span></label>` : ''}
      ${st.runner.due ? `<div class="help ap-mt1">Lịch đăng: ${st.runner.due.skipped ? esc(st.runner.due.skipped) : `kiểm tra lúc ${new Date(st.runner.due.at).toLocaleTimeString('vi-VN')}${st.runner.due.msg ? ' — ' + esc(st.runner.due.msg) : ''}`}</div>` : ''}</div>`;
    const W = $('#ap-watch');
    const folders = () => { const f = JSON.parse(JSON.stringify(S.st.settings.watch.folders)); W.querySelectorAll('[data-wf]').forEach(el => (f[+el.dataset.wf][el.dataset.k] = el.value.trim())); return f; };
    const saveW = async (patch) => { const r = await api('/api/autopilot/settings', patch); if (r.error) return Studio.toast(r.error); S.st.settings = r.settings; return r; };
    $('#ap-won').onchange = async e => { await saveW({ watch: { on: e.target.checked, folders: folders() } }); Studio.toast(e.target.checked ? 'Đã bật thư mục tự động' : 'Đã tắt thư mục tự động'); };
    $('#ap-wsave').onclick = async () => { await saveW({ watch: { folders: folders() } }); Studio.toast('Đã lưu thư mục'); renderWatch(); };
    $('#ap-wadd').onclick = async () => { const f = folders(); const up = (p, n) => { for (let i = 0; i < n; i++) p = p.replace(/[\\/][^\\/]+$/, ''); return p; }; // f[0].in → thư mục cha; Kho/Nguon/Tha vao day → thư mục chứa các Kho
      const base = f[0]?.in ? up(f[0].in, 1) : (S.st.kho || [])[0]?.in ? up(S.st.kho[0].in, 4) : '';
      if (!/[\\/]/.test(base) || /^[A-Za-z]:$/.test(base)) return Studio.toast('Chưa biết đặt thư mục ở đâu: tạo Kho ở bước Chuẩn bị trước'); f.push({ in: base + `/Thả video ${f.length + 1}`, done: f[0]?.done || base + '/Đã xong', processed: f[0]?.processed || base + '/Đã xử lý', profile: '' }); await saveW({ watch: { folders: f } }); renderWatch(); };
    W.querySelectorAll('[data-wdel]').forEach(b => (b.onclick = async () => { const f = folders(); f.splice(+b.dataset.wdel, 1); await saveW({ watch: { folders: f } }); renderWatch(); }));
    W.querySelectorAll('[data-wopen]').forEach(b => (b.onclick = async () => { const r = await api('/api/autopilot/reveal', { path: b.previousElementSibling.value, create: true }); if (r.error) Studio.toast(r.error); }));
    if (IS_MAC) {
    $('#ap-notify').onchange = e => saveW({ notify: e.target.checked });
    $('#ap-appdrop').onchange = e => saveW({ appDrop: e.target.checked });
    $('#ap-agent').onchange = async e => {
      if (e.target.checked && !confirm('Cài tác vụ nền macOS (LaunchAgent com.aivideostudio.watch)? Nó chạy hàng đợi + thư mục tự động cả khi Studio tắt. Gỡ bằng cách bỏ chọn ô này.')) { e.target.checked = false; return; }
      const r = await api('/api/autopilot/agent', { on: e.target.checked });
      Studio.toast(r.ok === false || r.error ? 'Lỗi: ' + (r.error || '') : e.target.checked ? 'Đã cài chạy nền' : 'Đã gỡ chạy nền');
      await refresh(); renderWatch();
    };
    }
  }
  // ---------- actions ----------
  async function itemAct(id, action) {
    if (action === 'cancel' && !confirm('Huỷ việc này?')) return;
    if (action === 'open') { if (!confirm('Mở dự án này trong Studio? (dự án hiện tại được lưu trước)')) return; if (Studio.dirty && Studio.saveNow && !await Studio.saveNow()) return; }
    const r = await api('/api/autopilot/item', { id, action });
    if (r.error) return Studio.toast(r.error);
    if (action === 'open') return (location.hash = '', location.reload());
    refresh(true);
  }
  async function enqueuePath() {
    const p = $('#ap-path').value.trim(); if (!p) return Studio.toast('Nhập đường dẫn video');
    let script = ''; try { script = await Studio.scriptStage?.take() || ''; } catch (e) { return Studio.toast(e.message); } // S17 M123
    const r = await api('/api/autopilot/enqueue', { input: p, brand: S.brand || '', product: S.product || '', script });
    if (r.error) return Studio.toast(r.error);
    if (script) Studio.scriptStage.clear();
    S.path = ''; Studio.toast('Đã thêm vào hàng đợi Tự lái'); refresh(true);
  }
  async function uploadFiles(files) {
    let script = ''; // S17 M123: kịch bản chỉ đi kèm video đầu tiên
    for (const f of files) {
      if (!/\.(mp4|mov|m4v|mkv|webm)$/i.test(f.name)) { Studio.toast('Bỏ qua (không phải video): ' + f.name); continue; }
      const first = script === ''; if (first) { try { script = await Studio.scriptStage?.take() || null; } catch (e) { Studio.toast(e.message); break; } }
      S.uploading = f.name; $('#ap-upl') && ($('#ap-upl').innerHTML = `<div class="help"><i class="ti ti-loader-2 spin"></i> Đang chép ${esc(f.name)} (${(f.size / 1048576).toFixed(0)} MB)…</div>`);
      const r = await fetch(`/api/autopilot/upload?name=${encodeURIComponent(f.name)}&brand=${encodeURIComponent(S.brand || '')}&product=${encodeURIComponent(S.product || '')}${script ? `&script=${encodeURIComponent(script)}` : ''}`, { method: 'POST', body: f }).then(x => x.json()).catch(e => ({ error: e.message }));
      if (r.error) Studio.toast('Lỗi: ' + r.error); else { Studio.toast('Đã thêm “' + f.name + '” vào hàng đợi' + (script ? ' (kèm kịch bản)' : '')); if (script) Studio.scriptStage.clear(); }
      script = null; // lỗi thì ô vẫn giữ chữ, nhưng không gắn sang video sau
    }
    S.uploading = null; if ($('#ap-upl')) $('#ap-upl').innerHTML = ''; refresh(true);
  }
  function bindTop() {
    const dz = $('#ap-drop');
    dz.onclick = () => $('#ap-file').click();
    $('#ap-pick').onclick = () => $('#ap-file').click();
    $('#ap-file').onchange = e => uploadFiles([...e.target.files]);
    // stopPropagation: the editor's window-level drop handler would otherwise upload the file into the open project's media/
    dz.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('over'); uploadFiles([...e.dataTransfer.files]); });
    $('#ap-path').oninput = e => (S.path = e.target.value);
    $('#ap-path').onkeydown = e => e.key === 'Enter' && enqueuePath();
    $('#ap-add').onclick = enqueuePath;
  }

  // ---------- wiring ----------
  const openMe = () => document.querySelector('#rail [data-p="autopilot"]')?.click();
  Studio.addPanel('autopilot', 'ti-rocket', 'Tự lái', () => { render(); refresh(true); });
  // the top bar exists even when no project is open (onReady never fires then)
  // S19 M132: chỉ báo việc nền (ẩn khi hàng đợi trống); trang chủ gọi Studio.autopilotRefresh sau khi thả video ở thẻ Tự lái
  Studio.addTopButton('<button class="ghost" id="ap-topbtn" hidden title="Tự lái: việc nền"><i class="ti ti-rocket"></i><span class="pct"></span></button>', openMe);
  Studio.autopilotRefresh = () => refresh(false);
  let n = 0; setInterval(() => (active() || ++n % 4 === 0) && refresh(false), 1500);
  refresh(false);
  if (/^#(tu-lai|autopilot)/.test(location.hash)) setTimeout(openMe, 300);
})();
