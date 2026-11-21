// S30 M214: bộ chọn media dùng chung (lõi 07_mediapick.core.js). Thay các <select> chỉ hiện tên file trơn trong Thuộc tính
// (Ảnh / clip, Ảnh sản phẩm, ảnh nền khi tách nền…): một ô hiện ảnh nhỏ + tên, bấm mở hộp lưới có ảnh nhỏ, ô tìm, hai tab
// "Dự án này" (media/) và "Kho" (Kho của dự án; chọn thì liên kết vào media/kho_* như tab Kho của Media), nút Tải lên.
//   Studio.mediaField({ attr, value, kinds, empty, title }) → HTML: ô hiển thị + <input type=hidden ${attr}>. Chọn xong thì ô ẩn
//       nhận giá trị (đường dẫn media/… hoặc '' khi bỏ) và phát sự kiện change: feature cũ nghe change trên ô của nó vẫn chạy.
//   Studio.mediaPick({ kinds, value, title, clear }) → Promise<mục media {path, name, kind, thumb} | '' (bỏ) | null (huỷ)>
//   Studio.lazyThumbs(root) → nạp img[data-lz] khi cuộn tới, mỗi lúc tối đa 2 ảnh (ảnh nhỏ video Kho chờ ffmpeg ở server:
//       không chiếm hết 6 kết nối của trình duyệt).
'use strict';
(() => {
  const S = window.Studio, C = window.MediaPickCore;
  if (!S || !C) return;
  const { esc } = S;
  const proj = rel => (S.purl ? S.purl(encodeURI(rel)) : '/project/' + encodeURI(rel));
  const tok = u => (window.avsUrl ? window.avsUrl(u) : u);
  const media = () => (typeof MEDIA !== 'undefined' && Array.isArray(MEDIA) ? MEDIA : []);
  const setMedia = list => { if (typeof MEDIA !== 'undefined' && Array.isArray(list)) MEDIA = list; }; // eslint-disable-line no-global-assign
  const KIND_IC = { image: 'ti-photo', video: 'ti-movie', audio: 'ti-music' };

  // ---------- nạp ảnh nhỏ lười, giới hạn song song ----------
  let running = 0; const waiting = [];
  const pump = () => {
    while (running < 2 && waiting.length) {
      const img = waiting.shift(); if (!img.isConnected) continue;
      running++;
      const done = () => { running--; pump(); };
      img.addEventListener('load', () => { img.classList.add('ok'); done(); }, { once: true });
      img.addEventListener('error', () => { img.remove(); done(); }, { once: true });
      img.src = img.dataset.lz; delete img.dataset.lz;
    }
  };
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); waiting.push(e.target); }
    pump();
  }, { rootMargin: '120px' }) : null;
  S.lazyThumbs = root => root?.querySelectorAll?.('img[data-lz]').forEach(img => (io ? io.observe(img) : (waiting.push(img), pump())));

  const css = document.createElement('style'); css.id = 'mp-css';
  css.textContent = `.mpf { display: flex; align-items: center; gap: var(--space-2); width: 100%; min-width: 0; padding: var(--space-1); text-align: left; background: rgb(var(--color-surface-muted)); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); color: rgb(var(--color-fg)); cursor: pointer; }
  .mpf:hover { border-color: rgb(var(--color-accent-text)); }
  .mpf .mpt { flex: none; width: 56px; aspect-ratio: 4/3; border-radius: var(--radius-xs); background: rgb(var(--color-surface)); display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; }
  .mpf .mpt img, .mp-c .mpt img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity var(--duration-fast) var(--ease-standard); }
  .mpf .mpt img.ok, .mp-c .mpt img.ok { opacity: 1; }
  .mpf .mpt .ti { font-size: 18px; color: rgb(var(--color-fg-subtle)); }
  .mpf .mpn { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: var(--text-xs); }
  .mpf .mpn b, .mpf .mpn small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mpf .mpn b { font-weight: 500; } .mpf .mpn small { color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); }
  .mpf > .ti { flex: none; color: rgb(var(--color-fg-subtle)); }
  .mp-ov { position: fixed; inset: 0; z-index: 60; background: rgb(var(--color-scrim) / .66); display: flex; align-items: center; justify-content: center; padding: var(--space-4); }
  .mp-box { width: min(640px, 100%); max-height: min(720px, 100%); display: flex; flex-direction: column; min-width: 0; background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-modal); box-shadow: var(--shadow-overlay); overflow: hidden; }
  .mp-hd { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-bottom: 1px solid rgb(var(--color-line)); min-width: 0; }
  .mp-hd h3 { flex: 1; min-width: 0; margin: 0; font-size: var(--text-md); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mp-bar { display: flex; flex-wrap: wrap; gap: var(--space-2); padding: var(--space-2) var(--space-4); align-items: center; min-width: 0; }
  .mp-bar .seg { flex: none; } .mp-bar input[type=search] { flex: 1 1 160px; min-width: 0; }
  .mp-kho { padding: 0 var(--space-4); font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mp-grid { flex: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: var(--space-2); padding: var(--space-2) var(--space-4) var(--space-4); align-content: start; }
  .mp-c { display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; gap: var(--space-1); min-width: 0; padding: 0; background: none; border: 0; text-align: left; color: rgb(var(--color-fg)); cursor: pointer; font-size: var(--text-2xs); }
  .mp-c .mpt { position: relative; width: 100%; aspect-ratio: 4/3; border-radius: var(--radius-control); background: rgb(var(--color-surface-muted)); border: 1px solid rgb(var(--color-line)); overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .mp-c .mpt .ti { font-size: 22px; color: rgb(var(--color-fg-subtle)); }
  .mp-c:hover .mpt, .mp-c:focus-visible .mpt { border-color: rgb(var(--color-accent-text)); }
  .mp-c.on .mpt { border-color: rgb(var(--color-accent-text)); box-shadow: 0 0 0 2px rgb(var(--color-accent-text) / .45); }
  .mp-c .mpb { position: absolute; left: var(--space-1); bottom: var(--space-1); max-width: calc(100% - 2 * var(--space-1)); padding: 0 var(--space-1); border-radius: var(--radius-xs); background: rgb(var(--color-black) / .65); color: rgb(var(--color-fg-on-media)); font-size: var(--text-2xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mp-c .mpn { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; max-width: 100%; overflow: hidden; white-space: normal; overflow-wrap: anywhere; line-height: 1.35; }
  .mp-c.busy { opacity: .55; pointer-events: none; }
  .mp-empty { grid-column: 1 / -1; padding: var(--space-6) var(--space-3); text-align: center; color: rgb(var(--color-fg-subtle)); font-size: var(--text-xs); line-height: 1.5; }
  .mp-ft { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: flex-end; padding: var(--space-3) var(--space-4); border-top: 1px solid rgb(var(--color-line)); }
  .mp-ft .mp-sp { flex: 1; }`;
  document.head.appendChild(css);

  const thumbHtml = (it, from, big) => {
    const u = C.thumbOf(it, from), ic = `<i class="ti ${KIND_IC[C.kindOf(it)] || 'ti-file'}"></i>`;
    if (!u) return ic;
    const src = from === 'kho' ? tok(u) : proj(u);
    return ic + `<img alt="" ${big || from === 'kho' ? `data-lz="${esc(src)}"` : `src="${esc(src)}" class="ok"`}>`;
  };
  const nameOf = (it, from) => (from === 'kho' ? { title: it.name, src: it.rel.includes('/') ? it.rel.split('/').slice(0, -1).join('/') : 'Kho' } : C.label(it.name));

  // ---------- ô hiển thị trong Thuộc tính ----------
  S.mediaField = ({ attr, value = '', kinds = ['image'], empty = '— Chưa chọn —', title = 'Chọn ảnh', clear = true } = {}) => {
    const v = typeof value === 'string' ? value : '';
    // khối photo giữ video dạng chuỗi khung {seq, fps, count}: tìm lại file trong Media theo seq
    const it = v ? media().find(m => m.path === v) : value?.seq ? media().find(m => m.seq?.seq === value.seq) : null;
    const nm = it ? C.label(it.name) : v ? { title: v.split('/').pop(), src: /^(si:|https?:)/.test(v) ? 'Ngoài dự án' : 'Không thấy trong Media' } : null;
    const obj = !it && typeof value === 'object' && value ? { title: 'Video đã chọn', src: 'Chuỗi khung' } : null;
    const show = nm || obj;
    return `<button type="button" class="mpf" data-mpopen data-kinds="${esc(kinds.join(','))}" data-title="${esc(title)}" data-clear="${clear ? 1 : ''}" title="${esc(show ? show.title : title)}">
      <span class="mpt">${it ? thumbHtml(it, 'project') : `<i class="ti ${v || obj ? 'ti-photo' : 'ti-photo-plus'}"></i>`}</span>
      <span class="mpn"><b>${esc(show ? show.title : empty)}</b><small>${esc(show ? show.src || 'Media của dự án' : 'Bấm để chọn từ Media, Kho hoặc tải lên')}</small></span>
      <i class="ti ti-selector"></i></button><input type="hidden" data-mpv ${attr || ''} value="${esc(v)}">`;
  };
  document.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-mpopen]'); if (!b) return;
    e.preventDefault();
    const inp = b.nextElementSibling; if (!inp || inp.dataset.mpv == null) return;
    const r = await S.mediaPick({ kinds: b.dataset.kinds.split(','), value: inp.value, title: b.dataset.title, clear: !!b.dataset.clear });
    if (r === null || !inp.isConnected) return;
    inp.value = r ? r.path : '';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    if (b.isConnected) S.renderInspector?.(); // ô vẫn còn (feature không tự vẽ lại): hiện ảnh nhỏ + tên mới
  });

  // ---------- hộp chọn ----------
  let open = null;
  S.mediaPick = (o = {}) => new Promise(resolve => {
    open?.close(null);
    const kinds = o.kinds?.length ? o.kinds : ['image'];
    const st = { tab: 'here', q: '', kho: null, busy: '' };
    const ov = document.createElement('div'); ov.className = 'mp-ov';
    const accept = kinds.map(k => k + '/*').join(',');
    ov.innerHTML = `<div class="mp-box" role="dialog" aria-modal="true" aria-label="${esc(o.title || 'Chọn media')}">
      <div class="mp-hd"><h3><i class="ti ti-photo-search"></i> ${esc(o.title || 'Chọn media')}</h3><button class="icon" data-mpx="close" aria-label="Đóng"><i class="ti ti-x"></i></button></div>
      <div class="mp-bar"><div class="seg"><button data-mpt="here">Dự án này</button><button data-mpt="kho">Kho</button></div>
        <input type="search" placeholder="Tìm theo tên file" aria-label="Tìm media"></div>
      <div class="mp-kho"></div><div class="mp-grid" role="listbox"></div>
      <div class="mp-ft">${o.clear ? '<button data-mpx="clear"><i class="ti ti-x"></i> Bỏ chọn</button>' : ''}<span class="mp-sp"></span>
        <button data-mpx="up" class="primary"><i class="ti ti-upload"></i> Tải lên…</button><input type="file" hidden multiple accept="${esc(accept)}"></div></div>`;
    document.body.appendChild(ov);
    const $ = s => ov.querySelector(s), grid = $('.mp-grid'), q = $('input[type=search]'), file = $('input[type=file]');
    const close = v => { if (!ov.isConnected) return; ov.remove(); document.removeEventListener('keydown', onKey, true); open = null; resolve(v); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
    document.addEventListener('keydown', onKey, true);
    open = { close };

    function draw() {
      ov.querySelectorAll('[data-mpt]').forEach(b => b.classList.toggle('on', b.dataset.mpt === st.tab));
      const kho = st.tab === 'kho';
      $('.mp-kho').textContent = kho ? (st.kho?.kho ? `Kho ${st.kho.kho.title || 'Chung'} · ${st.kho.kho.root || ''}` : '') : 'Ảnh, video trong thư mục media/ của dự án';
      if (kho && !st.kho) { grid.innerHTML = '<div class="mp-empty"><i class="ti ti-loader-2 spin"></i> Đang đọc Kho…</div>'; return loadKho(); }
      if (kho && st.kho.error) { grid.innerHTML = `<div class="mp-empty">${esc(st.kho.error)}</div>`; return; }
      const all = kho ? st.kho.items || [] : media(), list = C.filter(all, { kinds, q: st.q });
      grid.innerHTML = list.length ? list.slice(0, 300).map(it => {
        const n = nameOf(it, kho ? 'kho' : 'project'), id = kho ? it.rel : it.path, on = !kho && it.path === o.value;
        return `<button type="button" role="option" class="mp-c ${on ? 'on' : ''} ${st.busy === id ? 'busy' : ''}" data-mpi="${esc(id)}" title="${esc(kho ? it.rel : it.name)}">
          <span class="mpt">${thumbHtml(it, kho ? 'kho' : 'project', true)}${n.src ? `<span class="mpb">${esc(n.src)}</span>` : ''}</span><span class="mpn">${esc(n.title)}</span></button>`;
      }).join('') : `<div class="mp-empty">${all.length ? 'Không có file khớp ô tìm.' : kho ? 'Kho chưa có ảnh hay video phù hợp. Chép file vào thư mục Kho rồi mở lại, hoặc bấm Tải lên.' : 'Dự án chưa có media phù hợp. Bấm Tải lên, hoặc chọn từ tab Kho.'}</div>`;
      S.lazyThumbs(grid);
    }
    async function loadKho() {
      try { st.kho = await S.api('/api/media/kho'); } catch (e) { st.kho = { error: e.message }; }
      if (!st.kho || typeof st.kho !== 'object') st.kho = { error: 'Không đọc được Kho' };
      if (ov.isConnected) draw();
    }
    async function pickKho(rel) {
      if (st.busy) return;
      st.busy = rel; draw();
      let m; try { m = await S.api('/api/media/kho/use', { rel }); } catch (e) { m = { error: e.message }; }
      st.busy = '';
      if (!m?.path) { draw(); return S.toast('Chưa lấy được file từ Kho: ' + (m?.error || 'lỗi')); }
      try { setMedia(await S.api('/api/media')); } catch { /* danh sách cũ */ }
      S.renderPanel?.();
      close(media().find(x => x.path === m.path) || m);
    }
    async function upload(files) {
      const ok = files.filter(f => kinds.some(k => f.type.startsWith(k + '/')));
      if (!ok.length) return S.toast(kinds.includes('video') ? 'Chỉ nhận ảnh hoặc video' : 'Chỉ nhận file ảnh');
      const up = $('[data-mpx="up"]'), label = up.innerHTML; up.disabled = true;
      let got = null;
      try {
        for (const f of ok) {
          up.innerHTML = `<i class="ti ti-loader-2 spin"></i> Đang tải ${esc(f.name)}…`;
          const before = new Set(media().map(x => x.path));
          const list = await (await fetch('/api/upload?name=' + encodeURIComponent(f.name), { method: 'POST', body: f })).json();
          if (!Array.isArray(list)) throw new Error(list?.error || 'tải lên lỗi');
          setMedia(list);
          got = list.find(x => !before.has(x.path)) || list.find(x => x.name === f.name.replace(/[^\w.\-À-ỹ ]+/g, '_')) || got;
        }
      } catch (e) { S.toast('Chưa tải được: ' + e.message); }
      up.disabled = false; up.innerHTML = label;
      S.renderPanel?.();
      if (got && ok.length === 1) return close(got);
      st.tab = 'here'; draw(); // nhiều file: để người dùng chọn một
    }
    ov.addEventListener('click', e => {
      if (e.target === ov) return close(null);
      const t = e.target.closest('[data-mpt],[data-mpx],[data-mpi]'); if (!t) return;
      if (t.dataset.mpt) { st.tab = t.dataset.mpt; return draw(); }
      if (t.dataset.mpx === 'close') return close(null);
      if (t.dataset.mpx === 'clear') return close('');
      if (t.dataset.mpx === 'up') return file.click();
      if (t.dataset.mpi != null) {
        if (st.tab === 'kho') return pickKho(t.dataset.mpi);
        return close(media().find(x => x.path === t.dataset.mpi) || null);
      }
    });
    q.oninput = () => { st.q = q.value; draw(); };
    file.onchange = () => { const fs = [...file.files]; file.value = ''; if (fs.length) upload(fs); };
    ov.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
    ov.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); upload([...e.dataTransfer.files]); });
    draw(); q.focus();
  });
})();
