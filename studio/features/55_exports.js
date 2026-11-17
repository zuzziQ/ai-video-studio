// Lịch sử xuất (S14 M112, docs/plans/S14-xuat-cot-phai-diem.md; route studio/routes/55_exports.mjs, dữ liệu .studio/exports.json).
// Panel Xuất (wf-export, 01_workflow.js gọi Studio.exports.render()) hiện bản gần nhất và các bản trước; mỗi bản: Xem (trình phát
// trong Studio, không rời trang), Hiện trong thư mục / Finder, Mở Thành phẩm, Giao vào Thành phẩm, Chép đường dẫn.
// Hộp "Xuất xong" (studio.js gọi Studio.exports.done khi job xuất xong) ghi lịch sử rồi hiện cùng các nút đó; giữ h3 "Xuất xong",
// .path và .actions để 16_qc / 52_publish vẫn chèn được thẻ QC và nút Đăng.
// Studio.exports: { render(), done(job, {quality, from, to}), refresh(), latest(), list(), loaded(), edited() } — M113 dùng latest()/edited() cho cột phải.
(() => {
  const S = window.Studio, esc = S.esc, $ = S.$;
  const st = document.createElement('style');
  st.textContent = `.xp-h { display: flex; align-items: center; gap: var(--space-2); margin: var(--space-4) 0 var(--space-2); font-size: var(--text-2xs); font-weight: 600; color: rgb(var(--color-fg-subtle)); text-transform: uppercase; letter-spacing: .04em; }
    .xp-it { border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); padding: var(--space-2) var(--space-3); margin-bottom: var(--space-2); display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; background: rgb(var(--color-surface)); }
    .xp-it.is-gone { opacity: .72; }
    .xp-name { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); font-weight: 600; color: rgb(var(--color-fg)); min-width: 0; }
    .xp-name span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .xp-name .ti { flex: none; color: rgb(var(--color-fg-subtle)); }
    .xp-meta { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); line-height: 1.5; overflow-wrap: anywhere; }
    .xp-tags { display: flex; flex-wrap: wrap; gap: var(--space-1); }
    .xp-tag { display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--text-2xs); padding: 0 var(--space-2); border-radius: var(--radius-pill); border: 1px solid rgb(var(--color-line)); color: rgb(var(--color-fg-muted)); line-height: 1.8; }
    .xp-tag.ok { color: rgb(var(--color-success-text)); border-color: rgb(var(--color-success) / .4); }
    .xp-tag.warn { color: rgb(var(--color-warning-text)); border-color: rgb(var(--color-warning) / .4); }
    .xp-tag.gone { color: rgb(var(--color-danger-text)); border-color: rgb(var(--color-danger) / .4); }
    .xp-files { display: flex; flex-direction: column; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
    .xp-files li { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); min-width: 0; }
    .xp-files li b { flex: none; color: rgb(var(--color-fg)); } .xp-files li span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .xp-files li.is-gone span { text-decoration: line-through; }
    .xp-acts { display: flex; flex-wrap: wrap; gap: var(--space-1); }
    .xp-acts button { height: 28px; padding: 0 var(--space-2); font-size: var(--text-2xs); gap: var(--space-1); }
    .xp-ib { height: 24px; width: 24px; padding: 0; flex: none; justify-content: center; background: transparent; border-color: transparent; color: rgb(var(--color-fg-subtle)); }
    .xp-ib:hover { color: rgb(var(--color-fg)); background: rgb(var(--color-surface-hover)); }
    .xp-ib[disabled] { opacity: .4; cursor: default; }
    .xp-empty { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); line-height: 1.5; margin: 0; }
    #modalbox:has(.xp-player) { width: min(720px, calc(100vw - 2 * var(--space-4))); }
    .xp-player { display: block; width: 100%; max-height: 62vh; background: rgb(var(--color-black)); border-radius: var(--radius-control); }
    #modal .actions.xp-done { flex-wrap: wrap; }`;
  document.head.appendChild(st);

  let DATA = null, OS = /Mac/.test(navigator.platform) ? 'mac' : /Win/.test(navigator.platform) ? 'win' : 'linux';
  const revealLabel = () => (OS === 'mac' ? 'Hiện trong Finder' : 'Hiện trong thư mục');
  const QL = { 720: '720p', 1080: '1080p', '4k': '4K' };
  const mb = b => (b == null ? '' : b >= 1e9 ? (b / 1e9).toFixed(1).replace('.', ',') + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB');
  const dur = s => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
  const when = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }); };
  const url = rel => Studio.purl('') + rel.split('/').map(encodeURIComponent).join('/');
  const base = f => f.file.split('/').pop();
  const meta = (x, f = x.files[0]) => [f.aspect, x.quality ? QL[x.quality] : f.w && f.h ? `${f.w}×${f.h}` : '', dur(f.dur), mb(f.size), x.range ? `đoạn ${x.range.from ?? 0}–${x.range.to ?? 'hết'} s` : ''].filter(Boolean).join(' · ');
  const find = id => DATA?.items.find(x => x.id === id);

  async function load() {
    try { const r = await S.api('/api/exports'); if (Array.isArray(r?.items)) { DATA = r; if (r.os) OS = r.os; } } catch { /* giữ bản cũ */ }
    return DATA;
  }
  function tags(x) {
    const t = [];
    if (x.missing) t.push('<span class="xp-tag gone"><i class="ti ti-trash"></i>File đã bị xoá ngoài Studio</span>');
    else if (x.files.some(f => !f.exists)) t.push('<span class="xp-tag gone"><i class="ti ti-trash"></i>Một file đã bị xoá</span>');
    if (x.deliveredNow) t.push(`<span class="xp-tag ok"><i class="ti ti-package"></i>Đã giao Thành phẩm${x.files.length > 1 ? ` ${x.deliveredNow}/${x.files.length}` : ''}</span>`);
    else if (x.deliverError) t.push(`<span class="xp-tag warn" title="${esc(x.deliverError)}"><i class="ti ti-alert-triangle"></i>Chưa giao được: ${esc(x.deliverError.slice(0, 80))}</span>`);
    else if (x.delivered.length) t.push('<span class="xp-tag warn"><i class="ti ti-package-off"></i>Bản giao đã bị xoá khỏi Thành phẩm</span>');
    else if (!x.missing) t.push('<span class="xp-tag"><i class="ti ti-package-off"></i>Chưa giao Thành phẩm</span>');
    return `<div class="xp-tags">${t.join('')}</div>`;
  }
  // nút của một bản (đầy đủ ở bản gần nhất và hộp Xuất xong)
  function actions(x) {
    const f = x.files[0], live = x.files.some(y => y.exists), canGive = live && x.deliveredNow < x.files.filter(y => y.exists).length;
    return `<button class="primary" data-xp="play" data-id="${esc(x.id)}" data-i="0" ${f.exists ? '' : 'disabled'}><i class="ti ti-player-play"></i>Xem</button>
      <button data-xp="reveal" data-id="${esc(x.id)}" data-i="0"><i class="ti ti-folder"></i>${f.exists ? revealLabel() : 'Mở thư mục out'}</button>
      ${x.deliveredNow || x.delivered.length ? `<button data-xp="kho" data-id="${esc(x.id)}"><i class="ti ti-package"></i>Mở Thành phẩm</button>` : ''}
      ${canGive ? `<button data-xp="give" data-id="${esc(x.id)}"><i class="ti ti-package-import"></i>${x.deliverError ? 'Giao lại' : 'Giao vào Thành phẩm'}</button>` : ''}
      <button data-xp="copy" data-id="${esc(x.id)}" data-i="0" ${f.exists ? '' : 'disabled'}><i class="ti ti-copy"></i>Chép đường dẫn</button>`;
  }
  // các khổ thêm (9:16 + 1:1…): mỗi file một dòng với nút nhỏ
  const fileRows = x => (x.files.length > 1 ? `<ul class="xp-files">${x.files.map((f, i) => `<li class="${f.exists ? '' : 'is-gone'}"><b>${esc(f.aspect || '')}</b><span title="${esc(f.file)}">${esc(base(f))}</span>
      ${iconBtns(x, i)}</li>`).join('')}</ul>` : '');
  const iconBtns = (x, i) => { const f = x.files[i], d = f.exists ? '' : 'disabled';
    return `<button class="xp-ib" data-xp="play" data-id="${esc(x.id)}" data-i="${i}" title="Xem" aria-label="Xem" ${d}><i class="ti ti-player-play"></i></button>
      <button class="xp-ib" data-xp="reveal" data-id="${esc(x.id)}" data-i="${i}" title="${f.exists ? revealLabel() : 'Mở thư mục out'}" aria-label="${revealLabel()}"><i class="ti ti-folder"></i></button>
      <button class="xp-ib" data-xp="copy" data-id="${esc(x.id)}" data-i="${i}" title="Chép đường dẫn" aria-label="Chép đường dẫn" ${d}><i class="ti ti-copy"></i></button>`; };
  const latestHtml = x => `<div class="xp-it ${x.missing ? 'is-gone' : ''}"><div class="xp-name"><i class="ti ti-movie"></i><span title="${esc(x.files[0].file)}">${esc(base(x.files[0]))}</span></div>
      <div class="xp-meta">${esc(meta(x))}<br>${esc(when(x.at))}${x.legacy ? ' · bản cũ (trước khi có lịch sử xuất)' : ''}</div>${tags(x)}${fileRows(x)}<div class="xp-acts">${actions(x)}</div></div>`;
  const rowHtml = x => `<div class="xp-it ${x.missing ? 'is-gone' : ''}"><div class="xp-name"><i class="ti ti-movie"></i><span title="${esc(x.files[0].file)}">${esc(base(x.files[0]))}</span>
      ${x.files.length > 1 ? '' : iconBtns(x, 0)}${x.deliveredNow ? `<button class="xp-ib" data-xp="kho" data-id="${esc(x.id)}" title="Mở Thành phẩm" aria-label="Mở Thành phẩm"><i class="ti ti-package"></i></button>` : ''}</div>
      <div class="xp-meta">${esc(meta(x))} · ${esc(when(x.at))}</div>${x.missing || x.deliverError ? tags(x) : ''}${fileRows(x)}</div>`;

  function render() {
    const host = $('#libbody'); if (!host) return;
    const items = DATA?.items || [];
    host.innerHTML = `<div class="wf-card"><h4><i class="ti ti-upload"></i>Xuất video</h4><p>Chọn khổ hình (9:16, 1:1, 16:9) và chất lượng, rồi dựng ra file MP4.</p>
      <button class="primary" data-xp="export"><i class="ti ti-upload"></i>Xuất video</button></div>
      <div data-exp>${DATA == null ? '<p class="xp-empty"><i class="ti ti-loader-2 spin"></i> Đang đọc lịch sử xuất…</p>'
        : !items.length ? '<p class="xp-empty">Chưa có bản xuất nào. Bản xuất xong sẽ nằm ở đây, kèm thư mục và trạng thái giao Thành phẩm.</p>'
        : `<div class="xp-h">Bản gần nhất</div>${latestHtml(items[0])}${items.length > 1 ? `<div class="xp-h">Các bản trước (${items.length - 1})</div>${items.slice(1).map(rowHtml).join('')}` : ''}`}</div>`;
    if (DATA == null) load().then(() => { if ($('#libbody [data-exp]')) render(); });
  }
  const refresh = async () => { await load(); if ($('#libbody [data-exp]')) render(); return DATA; };

  // ---------- việc của các nút (panel + hộp thoại dùng chung) ----------
  async function copy(x, i) {
    const f = x.files[i]; if (!f?.exists) return S.toast('File đã bị xoá');
    let ok = false;
    try { await navigator.clipboard.writeText(f.abs); ok = true; } catch { /* cửa sổ app có thể chặn clipboard: nhờ server chép */ }
    if (!ok) ok = !!(await S.api('/api/exports/copy', { id: x.id, i }).catch(() => null))?.ok;
    S.toast(ok ? 'Đã chép đường dẫn: ' + f.abs : 'Không chép được. Đường dẫn: ' + f.abs);
  }
  async function reveal(x, i) {
    const r = await S.api('/api/exports/reveal', { id: x.id, i }).catch(() => null);
    if (!r?.ok) return S.toast(r?.error || 'Không mở được thư mục');
    if (r.missing) S.toast('File đã bị xoá ngoài Studio, mở thư mục out của dự án');
  }
  async function kho(x) {
    const p = x.files.find(f => f.deliveredTo)?.deliveredTo;
    let r = p ? await S.api('/api/thanhpham/open', { path: p }).catch(() => null) : null;
    if (!r?.ok) r = await S.api('/api/thanhpham/open', {}).catch(() => null); // bản giao đã bị xoá: mở thư mục Thành phẩm
    if (!r?.ok) S.toast(r?.error || 'Không mở được Thành phẩm');
  }
  async function give(x, after) {
    S.toast('Đang giao vào Thành phẩm…');
    const r = await S.api('/api/exports/deliver', { id: x.id }).catch(e => ({ error: e.message }));
    S.toast(r?.ok ? 'Đã giao vào Thành phẩm' : 'Chưa giao được: ' + (r?.error || ''));
    await refresh(); after?.(r?.item);
  }
  function play(x, i) {
    const f = x.files[i]; if (!f?.exists) return S.toast('File đã bị xoá ngoài Studio');
    S.modal(`<h3><i class="ti ti-player-play"></i> ${esc(base(f))}</h3>
      <video class="xp-player" src="${esc(url(f.file))}" controls autoplay playsinline></video>
      <p class="xp-meta">${esc(meta(x, f))} · ${esc(when(x.at))}</p>
      <div class="actions xp-done"><button data-xp="reveal" data-id="${esc(x.id)}" data-i="${i}"><i class="ti ti-folder"></i>${revealLabel()}</button>
      <button data-xp="copy" data-id="${esc(x.id)}" data-i="${i}"><i class="ti ti-copy"></i>Chép đường dẫn</button><button data-xp="close" class="primary">Đóng</button></div>`);
  }
  function act(e) {
    const b = e.target.closest('[data-xp]'); if (!b || b.disabled) return;
    const k = b.dataset.xp;
    if (k === 'export') return document.getElementById('export')?.click();
    if (k === 'close') return S.closeModal();
    const x = find(b.dataset.id); if (!x) return S.toast('Không thấy bản xuất, mở lại panel Xuất');
    const i = +b.dataset.i || 0;
    if (k === 'play') play(x, i); else if (k === 'reveal') reveal(x, i); else if (k === 'copy') copy(x, i); else if (k === 'kho') kho(x);
    else if (k === 'give') give(x, it => { if (b.closest('#modalbox') && it) showDone(it); });
  }
  $('#libbody').addEventListener('click', act);
  $('#modalbox').addEventListener('click', act);
  // đóng hộp thoại (nút, bấm ra ngoài, hộp khác thay chỗ) thì dừng video đang phát
  const stopVideo = () => { for (const v of document.querySelectorAll('video.xp-player')) if (!v.closest('#modal:not([hidden])')) v.pause(); };
  new MutationObserver(stopVideo).observe($('#modal'), { attributes: true, attributeFilter: ['hidden'] });

  // ---------- hộp "Xuất xong" ----------
  function showDone(x, j) {
    const f = x.files[0];
    S.modal(`<h3><i class="ti ti-circle-check ui-text-ok"></i> Xuất xong</h3><p class="path">${esc(f.file)}</p>
      <p class="xp-meta">${esc(meta(x))}${f.abs ? `<br>${esc(f.abs)}` : ''}</p>${tags(x)}${fileRows(x)}
      <div class="actions xp-done">${actions(x)}<button data-xp="close">Đóng</button></div>`);
    if (j?.delivered?.length && !x.deliveredNow) S.toast('Đã giao ' + j.delivered.length + ' file vào Thành phẩm');
  }
  async function done(j, o = {}) {
    const r = await S.api('/api/exports/record', { quality: o.quality, from: o.from, to: o.to }).catch(() => null);
    await load();
    const x = (r?.item && find(r.item.id)) || r?.item;
    if (!x) return false; // không ghi được: studio.js hiện hộp cũ
    showDone(x, j);
    if ($('#libbody [data-exp]')) render();
    S.nextStep?.refresh?.(); // S16 M118: điểm Xuất và "Bản xuất gần nhất" ở cột phải đổi ngay, không chờ đổi tab
    return true;
  }
  S.exports = { render, done, refresh, latest: () => DATA?.items?.[0] || null, list: () => DATA?.items || [], loaded: () => DATA != null, edited: () => DATA?.edited || null };
})();
