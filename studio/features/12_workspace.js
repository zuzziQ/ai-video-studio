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
  .kho-more { font-size: 11px; color: var(--tx3); margin: 4px 0; }
  .kho-link { font-size: 11px; padding: 2px 8px; flex: none; }
  .kho-mhead { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 12px 0 4px; font-size: 12px; }
  .kho-mlist { max-height: 34vh; overflow: auto; border: 1px solid var(--line); border-radius: var(--r); background: var(--bg1); }
  .kho-mrow { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 8px; align-items: center; padding: 4px 8px; border-bottom: 1px solid var(--line); font-size: 12px; cursor: pointer; }
  .kho-mrow:last-child { border-bottom: 0; } .kho-mrow.off { opacity: .6; cursor: default; }
  .kho-mrow .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx); }
  .kho-mrow small { grid-column: 2; color: var(--tx3); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .kho-mrow small.bad { color: var(--bad); }`;
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
    if (DATA.ws?.exists && active()) loadMig(); // quét chỗ cũ chỉ khi panel Kho đang mở
  }

  // ---------- M101: file và dự án ở chỗ cũ (trước khi có Kho) ----------
  // Chỉ liệt kê; người dùng tích rồi bấm "Chuyển vào Kho". Dự án cũ giữ chỗ, chỉ ghi vào Kho để mở lại từ đây.
  let MIG = null;
  async function loadMig() {
    const want = brand, r = await api('/api/kho-migrate?' + qs({ brand })).catch(() => null);
    if (want !== brand) return;
    MIG = r && !r.error ? r : null;
    const box = document.getElementById('kho-mig'); if (box && active()) { box.innerHTML = migBox(); bindMig(); }
  }
  const migTodo = () => (MIG ? { f: MIG.files.length, p: MIG.projects.filter(x => !x.linked).length } : { f: 0, p: 0 });
  function migBox() {
    if (!MIG) return '';
    const { f, p } = migTodo(), L = MIG.linked || [];
    const ask = f || p ? `<div class="kho-box"><b>Có ${[f && `${f} video`, p && `${p} dự án`].filter(Boolean).join(' và ')} ở chỗ cũ</b> (trước khi có Kho).
      Đưa vào Kho để mọi bước lấy chung một chỗ; không chuyển gì khi bạn chưa đồng ý.
      <div class="kho-acts"><button class="primary" id="kho-mig-open"><i class="ti ti-transfer-in"></i> Xem và chuyển</button></div></div>` : '';
    const lst = L.length ? `<div class="kho-g"><h4><i class="ti ti-history"></i>Dự án ở chỗ cũ <small>${L.length}</small></h4>
      <ul class="kho-up">${L.map(x => `<li><i class="ti ti-folder"></i><span class="nm" title="${esc(x.from)}">${esc(x.name)}</span><button class="kho-link" data-li="${esc(x.id)}">Mở</button></li>`).join('')}</ul></div>` : '';
    return ask + lst;
  }
  function bindMig() {
    document.getElementById('kho-mig-open')?.addEventListener('click', migDialog);
    document.querySelectorAll('#kho-mig [data-li]').forEach(b => (b.onclick = async () => {
      const r = await api('/api/kho-migrate/open', { brand, id: b.dataset.li }).catch(e => ({ error: e.message }));
      if (r.error) return toast(r.error);
      location.reload();
    }));
  }
  function migDialog() {
    const F = MIG.files, P = MIG.projects.filter(x => !x.linked), when = t => new Date(t).toLocaleDateString('vi-VN');
    const row = (k, x, on, extra) => `<label class="kho-mrow${x.busy ? ' off' : ''}"><input type="checkbox" data-${k}="${x.id}" ${on ? 'checked' : ''} ${x.busy ? 'disabled' : ''}><span class="nm" title="${esc(x.name)}">${esc(x.name)}</span>${extra}</label>`;
    S.modal(`<h3><i class="ti ti-transfer-in"></i> Đưa file cũ vào Kho</h3>
      <p class="muted">Video được <b>chuyển</b> (không chép thêm) vào Kho “${esc(DATA.ws.title)}”; tên trùng thì thêm “(2)”. Dự án cũ giữ nguyên chỗ, chỉ hiện trong Kho để mở lại.</p>
      ${F.length ? `<div class="kho-mhead"><b>Video (${F.length}${MIG.more ? ` + ${MIG.more} nữa` : ''})</b><button class="kho-link" data-all="f">Chọn hết / bỏ hết</button></div>
        <div class="kho-mlist">${F.map(x => row('f', x, x.checked, `<small>${esc(x.from)} → ${esc(x.dest)}</small><small>${fmt(x.size)} · ${when(x.mtime)}</small>${x.busy ? `<small class="bad">${esc(x.busy)}</small>` : x.note ? `<small>${esc(x.note)}: tích để chuyển vào Tha vao day của Kho</small>` : ''}`)).join('')}</div>
        ${MIG.more ? `<p class="muted">Danh sách chỉ hiện ${F.length} video mới nhất: chuyển xong mở lại để chuyển phần còn lại.</p>` : ''}` : ''}
      ${P.length ? `<div class="kho-mhead"><b>Dự án (${P.length})</b><button class="kho-link" data-all="p">Chọn hết / bỏ hết</button></div>
        <div class="kho-mlist">${P.map(x => row('p', x, true, `<small>${esc(x.from)}</small>`)).join('')}</div>` : ''}
      <div class="actions"><button onclick="closeModal()">Để sau</button><button class="primary" id="kho-mig-go"><i class="ti ti-check"></i> Chuyển vào Kho</button></div>`);
    const box = document.getElementById('modalbox');
    box.querySelectorAll('[data-all]').forEach(b => (b.onclick = () => {
      const cs = [...box.querySelectorAll(`input[data-${b.dataset.all}]:not(:disabled)`)], on = !cs.every(c => c.checked);
      cs.forEach(c => (c.checked = on));
    }));
    box.querySelector('#kho-mig-go').onclick = async e => {
      const pick = k => [...box.querySelectorAll(`input[data-${k}]:checked`)].map(c => c.dataset[k]);
      const files = pick('f'), projects = pick('p');
      if (!files.length && !projects.length) return toast('Chưa chọn mục nào');
      e.currentTarget.disabled = true;
      const btn = e.currentTarget; btn.disabled = true;
      // S26 M186: chạy nền trong khay việc; hộp chọn file đóng ngay, Kho tự tải lại khi xong
      const t = await S.jobs.start('/api/kho-migrate', { brand, files, projects }, { kind: 'kho-migrate', onStart: () => S.closeModal(), onDone: migDone });
      if (t.refused) btn.disabled = false;
    };
  }
  async function migDone(j) {
    const r = j.out; MIG = null;
    if (!r) return { text: j.step || 'Xong' };
    const msg = [r.moved.length && `đã chuyển ${r.moved.length} video`, r.linked && `ghi ${r.linked} dự án`].filter(Boolean).join(', ');
    const text = (msg ? msg[0].toUpperCase() + msg.slice(1) : 'Không có gì thay đổi') + (r.failed.length ? ` · ${r.failed.length} file chưa chuyển được: ${r.failed[0].error}` : '') + (r.warn?.length ? ` · ${r.warn[0]}` : '');
    await load();
    return { text, toast: text, acts: [{ label: 'Mở Kho', icon: 'ti-folders', primary: true, on: () => S.jobs.open('kho') }] };
  }
  S.jobs.resumable('kho-migrate', () => ({ onDone: migDone }));

  function render() {
    $('#libact').innerHTML = '<button class="icon" id="kho-reload" title="Tải lại danh sách"><i class="ti ti-refresh"></i></button>';
    $('#kho-reload').onclick = () => { BRANDS = null; load(); };
    const B = $('#libbody');
    if (!DATA) { B.innerHTML = '<div class="help">Đang mở Kho…</div>'; return; }
    const opts = [['', 'Kho chung (không theo thương hiệu)'], ...BRANDS.map(b => [b.id, b.title || b.name || b.id])];
    const ws = DATA.ws;
    B.innerHTML = `<div class="help help--flush">Mỗi thương hiệu một thư mục thật trên máy. ${S.tip('Chứa video quay, ảnh, b-roll, nhạc, logo. Mọi bước sau lấy file từ đây.')}</div>
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
    <div class="help help--flush">Thư mục có sẵn được giữ nguyên. ${S.tip('Studio chỉ đọc và phân nhóm theo đuôi file; thư mục con chỉ tạo khi cần ghi.')}</div>
    <div class="kho-acts"><button class="primary" id="kho-set" ${busy ? 'disabled' : ''}><i class="ti ti-check"></i> Dùng thư mục này</button><button id="kho-cancel">Huỷ</button></div></div>`;
  function body() {
    const items = DATA.items || [];
    const st = { up: '<i class="ti ti-loader-2 spin"></i>', ok: '<i class="ti ti-circle-check ok"></i>', bad: '<i class="ti ti-alert-circle bad"></i>' };
    const count = id => items.filter(it => groupOf(it) === id).length;
    return `<div id="kho-mig">${migBox()}</div><div class="kho-drop" id="kho-drop" role="button" tabindex="0"><i class="ti ti-cloud-upload"></i><div><b>Kéo thả file vào Kho</b>hoặc bấm để chọn nhiều file (video, ảnh, nhạc, phông chữ)</div><input type="file" multiple hidden></div>
      <label class="kho-to">Vào thư mục <select id="kho-to">${TARGETS.map(([v, t]) => `<option value="${v}" ${v === to ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${files.length ? `<ul class="kho-up">${files.map(f => `<li>${st[f.st]}<span class="nm">${esc(f.name)}</span>${f.msg ? `<small class="bad">${esc(f.msg)}</small>` : f.rel ? `<small>${esc(f.rel.split('/')[0])}</small>` : ''}</li>`).join('')}</ul>` : ''}
      <div class="kho-row"><input id="kho-q" type="search" placeholder="Tìm theo tên file" value="${esc(q)}" aria-label="Tìm trong Kho"></div>
      <div class="kho-tabs">${[['all', 'Tất cả', items.length], ...GROUPS.map(g => [g[0] || 'other', g[1], count(g[0])])].map(([id, n, c]) => `<button class="chip ${tab === id ? 'on' : ''}" data-kt="${id}">${n} <small>${c}</small></button>`).join('')}</div>
      <div id="kho-list">${list()}</div>`;
  }
  function list() {
    const items = DATA.items || [], s = q.trim().toLowerCase();
    if (!items.length) return `<div class="help">Kho đang trống. Kéo thả file vào ô ở trên. ${S.tip('Hoặc chép file vào thư mục Kho rồi bấm tải lại.')}</div>`;
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
    B.querySelector('#kho-brand').onchange = e => { brand = e.target.value; editing = false; files = []; MIG = null; q = ''; tab = 'all'; DATA = null; render(); load(); };
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
    bindMig();
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
