// Kho theo thương hiệu (S12 / M97, docs/plans/S12-kho-du-an.md): panel "Kho" ở bước 1 Chuẩn bị (thay Media cũ; Media của dự án
// vẫn ở bước Dựng). Chọn thương hiệu → đường dẫn Kho, đổi thư mục (dán đường dẫn hoặc hộp chọn thư mục của hệ điều hành), mở trong
// Explorer/Finder, xem file theo nhóm Nguồn / Ảnh / B-roll / Nhạc / Khác (chỉ đọc, có ô tìm), kéo thả tải lên đúng thư mục con.
// API: studio/routes/12_workspace.mjs. Dùng ở chỗ khác: Studio.kho.open(brandId), Studio.kho.refresh().
'use strict';
(() => {
  const S = Studio, { esc, api, toast } = S, $ = s => document.querySelector(s);
  const GROUPS = [['Nguon', 'Nguồn', 'ti-video'], ['Anh', 'Ảnh', 'ti-photo'], ['BRoll', 'B-roll', 'ti-movie'], ['Nhac', 'Nhạc', 'ti-music'], ['', 'Khác', 'ti-folder']];
  const TARGETS = [['', 'Tự theo loại file'], ['source', 'Nguồn (video quay)'], ['inbox', 'Thả vào đây (Tự lái)'], ['image', 'Ảnh'], ['broll', 'B-roll'], ['music', 'Nhạc'], ['brand', 'Thương hiệu (logo, phông)']];
  const ICON = { video: 'ti-movie', image: 'ti-photo', audio: 'ti-music', font: 'ti-typography' };
  const MAX_TILES = 240; // mỗi nhóm; Kho lớn vẫn mở nhanh
  let BRANDS = null, brand = null, DATA = null, q = '', tab = 'all', to = '', editing = false, files = [], busy = false;

  const css = document.createElement('style');
  css.textContent = `
  .kho-row { display: flex; gap: 8px; align-items: center; min-width: 0; margin: 8px 0; }
  .kho-row select, .kho-row input { flex: 1; min-width: 0; }
  .kho-path { display: flex; gap: 8px; align-items: center; min-width: 0; padding: 8px; border: 1px solid var(--line); border-radius: var(--r); background: var(--bg1); font-size: 12px; }
  .kho-path .ti { color: var(--tx3); flex: none; } .kho-path code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx); }
  .kho-acts { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; } .kho-acts button { font-size: 12px; padding: 4px 8px; }
  .kho-warn { margin: 8px 0; padding: 8px; border-radius: var(--r); border: 1px solid var(--line2); background: var(--bg1); color: var(--warn); font-size: 12px; display: flex; gap: 8px; line-height: 1.4; }
  .kho-box { margin: 8px 0; padding: 12px; border: 1px solid var(--line2); border-radius: var(--r); background: var(--bg1); font-size: 12px; color: var(--tx2); }
  .kho-box b { color: var(--tx); } .kho-box .kho-acts { margin-bottom: 0; }
  .kho-drop { display: flex; gap: 8px; align-items: center; padding: 12px; margin: 8px 0 4px; border: 1px dashed var(--line3); border-radius: var(--r); background: var(--bg1); color: var(--tx2); font-size: 12px; cursor: pointer; }
  .kho-drop:hover, .kho-drop.over { border-color: var(--acc); color: var(--tx); } .kho-drop > .ti { font-size: 20px; color: var(--tx3); } .kho-drop b { display: block; color: var(--tx); }
  .kho-to { display: flex; gap: 8px; align-items: center; font-size: 11px; color: var(--tx3); } .kho-to select { flex: 1; min-width: 0; font-size: 12px; }
  .kho-up { list-style: none; margin: 4px 0; padding: 0; font-size: 11px; } .kho-up li { display: flex; gap: 4px; align-items: center; color: var(--tx2); padding: 2px 0; }
  .kho-up .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .kho-up .ok { color: var(--ok); } .kho-up .bad { color: var(--bad); }
  .kho-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; } .kho-tabs .chip { padding: 2px 8px; }
  .kho-g h4 { margin: 12px 0 4px; font-size: 12px; color: var(--tx2); font-weight: 600; display: flex; gap: 4px; align-items: center; } .kho-g h4 small { color: var(--tx3); font-weight: 400; }
  .kho-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 4px; }
  .kho-t { min-width: 0; border: 1px solid var(--line); border-radius: var(--r); background: var(--bg1); overflow: hidden; }
  .kho-t .pv { aspect-ratio: 1; display: flex; align-items: center; justify-content: center; background: var(--bg3); color: var(--tx3); font-size: 22px; }
  .kho-t .pv img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .kho-t .nm { padding: 2px 4px 0; font-size: 11px; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .kho-t small { display: block; padding: 0 4px 4px; font-size: 10px; color: var(--tx3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kho-more { font-size: 11px; color: var(--tx3); margin: 4px 0; }`;
  document.head.appendChild(css);

  const fmt = n => (n >= 1 << 30 ? (n / (1 << 30)).toFixed(1) + ' GB' : n >= 1 << 20 ? (n / (1 << 20)).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const qs = o => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  // Thư mục chuẩn của Kho → nhóm của nó; thư mục có sẵn không theo cấu trúc → nhóm theo loại file; Thuong hieu, phông chữ → Khác
  const BY_KIND = { video: 'Nguon', image: 'Anh', audio: 'Nhac' };
  const groupOf = it => (GROUPS.some(g => g[0] && g[0] === it.dir) ? it.dir : it.dir === 'Thuong hieu' ? '' : BY_KIND[it.kind] || '');
  const active = () => document.querySelector('#rail .on')?.dataset.p === 'kho';

  async function defaultBrand() {
    const kit = S.TL?.brand?.kit;
    if (kit && BRANDS.some(b => b.id === kit)) return kit;
    const st = await api('/api/onboarding').catch(() => null);
    if (st?.brand && BRANDS.some(b => b.id === st.brand)) return st.brand;
    return BRANDS[0]?.id || '';
  }
  async function load() {
    if (!BRANDS) { const r = await api('/api/brands').catch(() => []); BRANDS = Array.isArray(r) ? r : []; }
    if (brand == null || (brand && !BRANDS.some(b => b.id === brand))) brand = await defaultBrand();
    const want = brand, r = await api('/api/kho?' + qs({ brand })).catch(e => ({ error: e.message }));
    if (want !== brand) return; // đã chọn thương hiệu khác trong lúc chờ: bỏ kết quả cũ
    DATA = r.error ? { error: r.error } : r;
    if (active()) render();
  }

  function render() {
    $('#libact').innerHTML = '<button class="icon" id="kho-reload" title="Tải lại danh sách"><i class="ti ti-refresh"></i></button>';
    $('#kho-reload').onclick = () => { BRANDS = null; load(); };
    const B = $('#libbody');
    if (!DATA) { B.innerHTML = '<div class="help">Đang mở Kho…</div>'; return; }
    const opts = [['', 'Kho chung (không theo thương hiệu)'], ...BRANDS.map(b => [b.id, b.title || b.name || b.id])];
    const ws = DATA.ws;
    B.innerHTML = `<div class="help help--flush">Một thư mục thật trên máy cho mỗi thương hiệu: video quay, ảnh, b-roll, nhạc, logo. Mọi bước sau lấy file từ đây.</div>
      <div class="kho-row"><select id="kho-brand" aria-label="Thương hiệu">${opts.map(([v, t]) => `<option value="${esc(v)}" ${v === brand ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      ${DATA.error ? `<div class="kho-warn"><i class="ti ti-alert-triangle"></i><span>${esc(DATA.error)}</span></div>` : `
      <div class="kho-path" title="${esc(ws.root)}"><i class="ti ti-folder"></i><code>${esc(ws.root)}</code><span class="pill">${ws.custom ? 'tự chọn' : 'mặc định'}</span></div>
      ${DATA.warning ? `<div class="kho-warn"><i class="ti ti-alert-triangle"></i><span>${esc(DATA.warning)}</span></div>` : ''}
      <div class="kho-acts"><button id="kho-edit"><i class="ti ti-folder-cog"></i> Đổi thư mục</button>${ws.exists ? '<button id="kho-reveal"><i class="ti ti-external-link"></i> Mở trong Explorer</button>' : ''}</div>
      ${editing ? editBox(ws) : ''}
      ${ws.exists ? body() : `<div class="kho-box"><b>Kho chưa có trên máy.</b> Tạo thư mục mặc định ở trên (có sẵn Nguon, Anh, BRoll, Nhac, Thuong hieu) hoặc chọn một thư mục bạn đang để video.
        <div class="kho-acts"><button class="primary" id="kho-create" ${busy ? 'disabled' : ''}><i class="ti ti-folder-plus"></i> Tạo Kho mặc định</button>${editing ? '' : '<button id="kho-edit2"><i class="ti ti-folder-search"></i> Chọn thư mục có sẵn</button>'}</div></div>`}`}`;
    bind();
  }
  const editBox = ws => `<div class="kho-box"><b>Thư mục làm Kho</b>
    <div class="kho-row"><input id="kho-dir" placeholder="Ví dụ D:\\Videos\\Nha Dep" value="${esc(ws.custom ? ws.root : '')}" spellcheck="false"><button id="kho-pick" title="Mở hộp chọn thư mục"><i class="ti ti-folder-search"></i> Chọn…</button></div>
    <div class="help help--flush">Thư mục có sẵn được giữ nguyên: Studio chỉ đọc và phân nhóm theo đuôi file, thư mục con tạo khi cần ghi.</div>
    <div class="kho-acts"><button class="primary" id="kho-set" ${busy ? 'disabled' : ''}><i class="ti ti-check"></i> Dùng thư mục này</button><button id="kho-cancel">Huỷ</button></div></div>`;
  function body() {
    const items = DATA.items || [];
    const st = { up: '<i class="ti ti-loader-2 spin"></i>', ok: '<i class="ti ti-circle-check ok"></i>', bad: '<i class="ti ti-alert-circle bad"></i>' };
    const count = id => items.filter(it => groupOf(it) === id).length;
    return `<div class="kho-drop" id="kho-drop" role="button" tabindex="0"><i class="ti ti-cloud-upload"></i><div><b>Kéo thả file vào Kho</b>hoặc bấm để chọn nhiều file (video, ảnh, nhạc, phông chữ)</div><input type="file" multiple hidden></div>
      <label class="kho-to">Vào thư mục <select id="kho-to">${TARGETS.map(([v, t]) => `<option value="${v}" ${v === to ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${files.length ? `<ul class="kho-up">${files.map(f => `<li>${st[f.st]}<span class="nm">${esc(f.name)}</span>${f.msg ? `<small class="bad">${esc(f.msg)}</small>` : f.rel ? `<small>${esc(f.rel.split('/')[0])}</small>` : ''}</li>`).join('')}</ul>` : ''}
      <div class="kho-row"><input id="kho-q" type="search" placeholder="Tìm theo tên file" value="${esc(q)}" aria-label="Tìm trong Kho"></div>
      <div class="kho-tabs">${[['all', 'Tất cả', items.length], ...GROUPS.map(g => [g[0] || 'other', g[1], count(g[0])])].map(([id, n, c]) => `<button class="chip ${tab === id ? 'on' : ''}" data-kt="${id}">${n} <small>${c}</small></button>`).join('')}</div>
      <div id="kho-list">${list()}</div>`;
  }
  function list() {
    const items = DATA.items || [], s = q.trim().toLowerCase();
    if (!items.length) return '<div class="help">Kho đang trống. Kéo thả file vào ô ở trên, hoặc chép file vào thư mục Kho rồi bấm tải lại.</div>';
    const hit = items.filter(it => !s || it.rel.toLowerCase().includes(s));
    const html = GROUPS.filter(g => tab === 'all' || tab === (g[0] || 'other')).map(([id, name, icon]) => {
      const g = hit.filter(it => groupOf(it) === id); if (!g.length) return '';
      return `<div class="kho-g"><h4><i class="ti ${icon}"></i>${name} <small>${g.length}</small></h4><div class="kho-grid">${g.slice(0, MAX_TILES).map(tile).join('')}</div>
        ${g.length > MAX_TILES ? `<div class="kho-more">và ${g.length - MAX_TILES} file nữa: tìm theo tên để thấy</div>` : ''}</div>`;
    }).join('');
    return html || '<div class="help">Không có file khớp.</div>';
  }
  const tile = it => `<div class="kho-t" title="${esc(it.rel)}"><div class="pv">${it.kind === 'image'
    ? `<img loading="lazy" alt="" src="${esc(avsUrl('/api/kho/file?' + qs({ brand, rel: it.rel })))}">` : `<i class="ti ${ICON[it.kind] || 'ti-file'}"></i>`}</div>
    <div class="nm">${esc(it.name)}</div><small>${fmt(it.size)}${it.dir && !GROUPS.some(g => g[0] === it.dir) ? ' · ' + esc(it.dir) : ''}</small></div>`;

  function bind() {
    const B = $('#libbody');
    B.querySelector('#kho-brand').onchange = e => { brand = e.target.value; editing = false; files = []; q = ''; tab = 'all'; DATA = null; render(); load(); };
    const ed = () => { editing = true; render(); B.querySelector('#kho-dir')?.focus(); };
    B.querySelector('#kho-edit')?.addEventListener('click', ed);
    B.querySelector('#kho-edit2')?.addEventListener('click', ed);
    B.querySelector('#kho-cancel')?.addEventListener('click', () => { editing = false; render(); });
    B.querySelector('#kho-reveal')?.addEventListener('click', async () => { const r = await api('/api/kho/reveal', { brand }).catch(e => ({ error: e.message })); if (r.error) toast(r.error); });
    B.querySelector('#kho-create')?.addEventListener('click', () => run(() => api('/api/kho/create', { brand }), 'Đã tạo Kho'));
    B.querySelector('#kho-set')?.addEventListener('click', () => run(() => api('/api/kho/set', { brand, dir: B.querySelector('#kho-dir').value.trim() }), 'Đã đổi thư mục Kho'));
    B.querySelector('#kho-dir')?.addEventListener('keydown', e => { if (e.key === 'Enter') B.querySelector('#kho-set').click(); });
    B.querySelector('#kho-pick')?.addEventListener('click', async e => {
      const btn = e.currentTarget; btn.disabled = true;
      const r = await api('/api/kho/pick-folder', {}).catch(() => ({ error: 'Không mở được hộp chọn thư mục' }));
      btn.disabled = false;
      if (r.error) return toast(r.error);
      if (r.unsupported) return toast('Máy này không mở được hộp chọn thư mục: dán đường dẫn vào ô bên cạnh');
      if (r.path) B.querySelector('#kho-dir').value = r.path;
    });
    const drop = B.querySelector('#kho-drop'); if (!drop) return;
    const inp = drop.querySelector('input');
    drop.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    // stopPropagation: trình xử lý thả file của cửa sổ (library.js) sẽ đưa file vào Media của dự án, không phải Kho
    drop.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); document.getElementById('drop')?.remove(); if (e.dataTransfer.files.length) upload([...e.dataTransfer.files]); });
    drop.addEventListener('click', e => { if (e.target !== inp) inp.click(); });
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    inp.addEventListener('change', () => { if (inp.files.length) upload([...inp.files]); inp.value = ''; });
    B.querySelector('#kho-to').onchange = e => (to = e.target.value);
    B.querySelector('#kho-q').oninput = e => { q = e.target.value; B.querySelector('#kho-list').innerHTML = list(); };
    B.querySelectorAll('[data-kt]').forEach(b => (b.onclick = () => { tab = b.dataset.kt; render(); }));
  }
  async function run(fn, ok) {
    busy = true; render();
    const r = await fn().catch(e => ({ error: e.message }));
    busy = false;
    if (r.error) { render(); return toast(r.error); }
    editing = false; BRANDS = null; toast(ok); await load();
  }
  async function upload(list) {
    const b = brand, dest = to, batch = [];
    for (const f of list) {
      const it = { name: f.name, st: 'up' }; files.push(it); batch.push(it); if (active()) render();
      try {
        const r = await fetch('/api/kho/upload?' + qs({ brand: b, name: f.name, to: dest }), { method: 'POST', body: f });
        const j = await r.json().catch(() => ({ error: r.status === 413 ? 'File quá lớn' : `Lỗi ${r.status}` }));
        if (!r.ok || j.error) throw new Error(j.error || `Lỗi ${r.status}`);
        it.st = 'ok'; it.rel = j.rel;
      } catch (e) { it.st = 'bad'; it.msg = e.message; }
      if (active()) render();
    }
    if (b === brand) await load();
    const bad = batch.filter(f => f.st === 'bad').length;
    toast(bad ? `${bad}/${batch.length} file chưa tải lên được` : `Đã đưa ${batch.length} file vào Kho`);
  }

  S.addPanel('kho', 'ti-folders', 'Kho', () => { render(); load(); }, { step: 'prep', level: 'basic' });
  S.kho = {
    open(id) { if (typeof id === 'string') { brand = id; DATA = null; files = []; } S.workflow?.goStep?.('prep'); document.querySelector('#rail [data-p="kho"]')?.click(); },
    refresh: () => { BRANDS = null; return load(); },
  };
})();
