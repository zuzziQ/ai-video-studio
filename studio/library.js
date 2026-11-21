// AI Video Studio — left icon rail + library panels (Mẫu, Media, Âm thanh, Chữ, Sticker, Hiệu ứng, Chuyển cảnh, Bộ lọc, Thành phần).
'use strict';

const RAIL = [['tpl', 'ti-layout-grid', 'Mẫu'], ['media', 'ti-photo-video', 'Media'], ['audio', 'ti-music', 'Âm thanh'], ['text', 'ti-letter-t', 'Chữ'],
  ['sticker', 'ti-mood-smile-beam', 'Sticker'], ['fx', 'ti-sparkles', 'Hiệu ứng'], ['trans', 'ti-transition-right', 'Chuyển cảnh'], ['filter', 'ti-color-filter', 'Bộ lọc'],
  ['comp', 'ti-stack-2', 'Thành phần']];
let panel = 'media', mediaTab = 'kho', audioTab = 'music', tplCat = 'Tất cả', TEMPLATES = null, THUMBS = null, transDur = .4;
const qOf = {};
const TPL_CATS = ['Tất cả', 'Doanh nghiệp', 'BĐS', 'Khoá học', 'Review', 'Chia sẻ', 'Tin tức', 'Bán hàng', 'AI', 'Khác'];
const STICKERS = '🔥 💯 🚀 ✨ ⭐ 🌟 💡 ❤️ 🧡 💙 💚 💜 😂 🤣 😍 🥰 🤩 🤯 😱 😎 🤔 🫣 😅 🥳 😭 😡 😴 🤑 👏 👍 👎 🙏 💪 🤝 👉 👀 🫶 👑 💎 🎉 🎯 🏆 🥇 📈 📉 💰 💸 🪙 🏠 🏡 🏢 🔑 📍 🗺️ 🛒 🛍️ 🎁 📦 🏷️ 📱 💻 🖥️ 🤖 🧠 ⚡ ✅ ❌ ⚠️ ❓ ❗ 💬 🗣️ 📣 🔔 🎬 🎵 🎤 📸 ⏰ 📅 📝 📚 🎓 ✍️ 📌 🔍 🔒 🧩 🎮 ☀️ 🌙 🌈 ☕ 🍀 🌸 🍕 🍔 🧋 ✈️ 🚗 🏖️ 💄 👗 🏋️ 🧘 🐶 🐱'.split(' ');
// Text presets: line props + a CSS approximation of engine TEXT_STYLE for the tile.
const SH = c => `2px 2px 0 ${c},-2px 2px 0 ${c},2px -2px 0 ${c},-2px -2px 0 ${c}`;
const TEXT_PRESETS = [
  { name: 'Tiêu đề vàng', text: 'SIÊU HAY', p: { style: 'yellow', size: 72, anim: 'pop' }, css: 'color:#FCDB36;font:italic 900 22px Montserrat,var(--font-sans);text-shadow:2px 3px 0 #000' }, // design-token-ok: preset preview = text colours of the video
  { name: 'Trắng nổi', text: 'Chữ trắng', p: { style: 'white', size: 60, anim: 'pop' }, css: 'color:#fff;font:italic 900 20px Montserrat,var(--font-sans);text-shadow:2px 3px 0 #000' }, // design-token-ok: preset preview = text colours of the video
  { name: 'Mực vàng', text: 'CHÚ Ý', p: { style: 'ink', size: 64, anim: 'drop' }, css: `color:#FFE53B;font:italic 900 19px Montserrat,var(--font-sans);text-shadow:${SH('#000')},3px 4px 0 #000` }, // design-token-ok: preset preview = text colours of the video
  { name: 'Lửa', text: 'NÓNG!', p: { style: 'fire', size: 76, anim: 'blur_zoom' }, css: `color:#E8432A;font:italic 900 24px Montserrat,var(--font-sans);text-shadow:${SH('#fff')}` }, // design-token-ok: preset preview = text colours of the video
  { name: 'Phát sáng', text: 'GLOW', p: { style: 'glow', size: 78, anim: 'blur_zoom' }, css: 'color:#FFFF22;font:italic 900 24px Montserrat,var(--font-sans);text-shadow:0 0 6px #ff7a00,0 0 14px #ff5a00' }, // design-token-ok: preset preview = text colours of the video
  { name: 'Neon', text: 'neon', p: { style: 'neon', size: 80, anim: 'fade', upper: false }, css: 'color:#fff;font:italic 900 24px Montserrat,var(--font-sans);text-shadow:0 0 4px #9CFF4A,0 0 10px #7dff2a,0 0 18px #5cff10' }, // design-token-ok: preset preview = text colours of the video
  { name: 'Tối giản', text: 'Tối giản', p: { style: 'white', size: 52, anim: 'fade', italic: false, weight: 600, font: "'Inter'", upper: false }, css: 'color:#fff;font:600 19px Inter,var(--font-sans);text-shadow:0 1px 6px rgba(0,0,0,.5)' }, // design-token-ok: preset preview = text colours of the video
  { name: 'Sang trọng', text: 'Luxury', p: { style: 'white', size: 64, anim: 'fade', italic: true, weight: 600, font: "'Playfair Display',serif", upper: false }, css: "color:#F3E7C9;font:italic 600 23px 'Playfair Display',serif" }, // design-token-ok: preset preview = text colours of the video
  { name: 'Đánh máy', text: 'đang gõ…', p: { style: 'white', size: 50, anim: 'type', italic: false, font: "'Inter'", weight: 700, upper: false }, css: 'color:#fff;font:700 18px Inter,var(--font-sans);text-shadow:2px 2px 0 #000;border-right:2px solid #fff;padding-right:2px' }, // design-token-ok: preset preview = text colours of the video
  { name: 'Lật chữ', text: 'TUMBLE', p: { style: 'yellow', size: 70, anim: 'tumble' }, css: 'color:#FCDB36;font:italic 900 22px Montserrat,var(--font-sans);text-shadow:2px 3px 0 #000;letter-spacing:.04em' }, // design-token-ok: preset preview = text colours of the video
  { name: 'Bungee', text: 'BOOM', p: { style: 'white', size: 70, anim: 'pop', font: "'Bungee'", italic: false }, css: 'color:#fff;font:400 22px Bungee,var(--font-sans);text-shadow:2px 3px 0 #E8432A' }, // design-token-ok: preset preview = text colours of the video
  { name: 'Viết tay', text: 'Cảm ơn', p: { style: 'white', size: 66, anim: 'fade', font: "'Pacifico'", italic: false, weight: 400, upper: false }, css: "color:#fff;font:400 22px Pacifico,cursive;text-shadow:2px 2px 0 rgba(0,0,0,.6)" }, // design-token-ok: preset preview = text colours of the video
  { name: 'Chữ tối', text: 'Ghi chú', p: { style: 'dark', size: 52, anim: 'slide_l', italic: false, weight: 800, upper: false }, css: 'color:#111;font:800 19px Montserrat,var(--font-sans);background:#fff;padding:2px 8px;border-radius:4px' }, // design-token-ok: preset preview = text colours of the video
  { name: 'Oswald', text: 'TIN NÓNG', p: { style: 'white', size: 70, anim: 'slide_r', font: "'Oswald'", italic: false, weight: 700 }, css: 'color:#fff;font:700 22px Oswald,var(--font-sans);text-shadow:2px 2px 0 #000;letter-spacing:.02em' }, // design-token-ok: preset preview = text colours of the video
];
const ANIM_LIST = FX.animList(); // S28 M202: engine/fx_registry.js FX.TEXT_IN

function renderRail() {
  $('#rail').innerHTML = RAIL.map(([k, ic, name]) => `<button data-p="${k}" class="${panel === k ? 'on' : ''}"><i class="ti ${ic}"></i><span>${name}</span></button>`).join('');
  for (const h of window.Studio?._rail || []) h($('#rail')); // M82: 01_workflow.js filters the rail by step
}
$('#rail').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) openPanel(b.dataset.p); });
function openPanel(p) {
  if (window.Studio?.layout?.get().focus) window.Studio.layout.set('focus', false); // S23 M161: mở panel thì thoát ⤢
  qOf[panel] = $('#search').value; panel = p; $('#search').value = qOf[p] || ''; query = $('#search').value;
  renderRail(); renderPanel();
  if (p === 'tpl' && !TEMPLATES) loadTemplates();
}
const PANEL_TITLE = Object.fromEntries(RAIL.map(r => [r[0], r[2]]));
const EXTRA_PANELS = {}; // id -> render fn, added by features via Studio.addPanel
const SEARCH_PH = { media: 'Tìm media / b-roll (Enter)…', audio: 'Tìm nhạc, SFX…', fx: 'Tìm hiệu ứng…', comp: 'Tìm chữ…', sticker: '', tpl: 'Tìm mẫu…', text: '', trans: '', filter: '' };
function renderPanel() {
  $('#libtitle').textContent = PANEL_TITLE[panel];
  $('#libsearch').style.display = SEARCH_PH[panel] ? '' : 'none';
  $('#search').placeholder = SEARCH_PH[panel] || '';
  $('#libact').innerHTML = '';
  const fn = EXTRA_PANELS[panel] || { tpl: panelTemplates, media: panelMedia, audio: panelAudio, text: panelText, sticker: panelSticker, fx: panelFx, trans: panelTrans, filter: panelFilter, comp: renderComps }[panel];
  fn && fn();
}
// The component list is refreshed often (on seek); other panels only on demand.
function renderList() { if (panel === 'comp') renderComps(); if (window.Studio?.right?.tab === 'layers') Studio.right.refresh(); } // S21 M145: tab Lớp theo playhead
const chips = (list, cur, attr) => `<div class="chips">${list.map(([v, l]) => `<button class="chip ${cur === v ? 'on' : ''}" data-${attr}="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
const empty = (ic, title, sub) => `<div class="empty"><i class="ti ${ic}"></i><b>${title}</b><span>${sub}</span></div>`;

// ---------- Thành phần (component list) ----------
let tab = 'here';
const COMP_TABS = [['here', 'Tại đây'], ['all', 'Tất cả'], ['edited', 'Đã chỉnh']], COMP_EXT = {}; // S20 M142: tab thêm từ feature (Studio.addCompTab, 67_layers.js: Lớp)
const compTabs = () => `<div class="seg" id="tabs">${COMP_TABS.map(([k, l, t]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}"${t ? ` title="${esc(t)}"` : ''}>${l}</button>`).join('')}</div>`;
function renderComps() {
  if (COMP_EXT[tab]) { $('#libbody').innerHTML = compTabs() + COMP_EXT[tab](); return; }
  const q = query.toLowerCase();
  const items = comps.filter(c => c.kind !== 'sfx' || tab !== 'here')
    .filter(c => tab === 'all' ? true : tab === 'edited' ? !!c.obj._orig || !!c.obj.note : T >= c.t0 - .001 && T < c.t1)
    .filter(c => !q || (c.label + ' ' + (c.sub || '')).toLowerCase().includes(q))
    .sort((a, b) => a.t0 - b.t0);
  const name = c => TRACKS.find(x => x[0] === c.track)?.[1] || 'Khác';
  $('#libbody').innerHTML = `${compTabs()}
    <div id="list">${items.map(c => `<div class="item ${sel?.obj === c.obj ? 'sel' : ''}" data-cid="${c.obj.cid}">
      ${c.kind === 'clip' ? '<i class="ti ti-movie ck"></i>' : `<input type="checkbox" ${c.obj.hidden ? '' : 'checked'} title="Hiện / ẩn">`}
      <div class="mid"><div class="t1">${c.obj._orig ? '<span class="ed">●</span> ' : ''}${esc(c.label)}</div><div class="t2">${name(c)} · ${fmt(c.t0)}${c.obj.note ? ' · <i class="ti ti-note"></i>' : ''}</div></div>
      <span class="dot" data-dfill="${TCOL[c.track] || 'rgb(var(--color-line-hover))'}"></span></div>`).join('') || empty('ti-stack-2', 'Không có thành phần nào', tab === 'here' ? 'Tại playhead không có gì. Thử tab Tất cả.' : '')}</div>`;
}

// ---------- Mẫu (templates) ----------
// S27 M189: mẫu của thương hiệu. Thương hiệu ngữ cảnh = thương hiệu (Kho) của dự án đang mở, hoặc thương hiệu trang chủ truyền vào
// (Studio.openTemplates({ brand })). Mẫu có brand_id trùng đứng đầu, có nhóm "Của <thương hiệu>"; brand.tpl = mẫu mặc định.
let BRANDS = [], TPL_BRAND = null;
const ctxBrand = () => (TPL_BRAND ?? META?.kho?.brand) || '';
const brandById = id => BRANDS.find(b => b.id === id) || null;
const brandTitle = b => b ? b.title || b.name || b.id : '';
const brandCat = () => { const b = brandById(ctxBrand()); return b ? `Của ${brandTitle(b)}` : ''; };
const tplCats = () => { const bc = brandCat(); return bc ? [TPL_CATS[0], bc, ...TPL_CATS.slice(1)] : TPL_CATS; };
async function loadTemplates() {
  const [t, b] = await Promise.all([api('/api/templates').catch(() => []), api('/api/brands').catch(() => [])]);
  TEMPLATES = Array.isArray(t) ? t : []; BRANDS = Array.isArray(b) ? b : [];
  if (panel === 'tpl') renderPanel();
}
function panelTemplates() {
  $('#libact').innerHTML = `<button class="mini" data-tplact="gallery" title="Mở thư viện mẫu cỡ lớn"><i class="ti ti-layout-grid"></i> Xem lớn</button><button class="mini icon" data-tplact="save" title="Lưu dự án hiện tại thành mẫu"><i class="ti ti-bookmark-plus"></i></button>`;
  const all = TEMPLATES || [];
  const list = tplFilter(tplCat, query);
  if (!tplCats().includes(tplCat)) tplCat = 'Tất cả';
  $('#libbody').innerHTML = chips(tplCats().map(c => [c, c]), tplCat, 'cat') +
    (TEMPLATES == null ? '<div class="loading"><i class="ti ti-loader-2 spin"></i> Đang tải mẫu…</div>'
      : !all.length ? empty('ti-layout-grid-add', 'Chưa có mẫu nào', 'Mẫu sẽ xuất hiện ở đây khi có trong thư mục templates/. Bạn có thể bấm “Lưu thành mẫu” để biến dự án này thành mẫu đầu tiên.')
        : !list.length ? empty('ti-filter-off', 'Không có mẫu trong mục này', 'Chọn mục khác hoặc xoá ô tìm.')
          : `<div class="tgrid">${list.map(t => `<div class="tpl" data-tpl="${esc(t.id)}" tabindex="0">
        <div class="tv ${(t.aspect || '9:16') === '16:9' ? 'h' : ''}" data-dbg="${esc(t.preview?.jpg || '')}">
          ${t.preview?.jpg ? '' : `<span class="ph">${esc(pk(t.pack)?.icon || '🎬')}</span>`}
          ${t.preview?.mp4 ? `<video muted loop playsinline preload="none" data-src="${t.preview.mp4}"></video>` : ''}
          <span class="badge">${esc(t.aspect || '9:16')}</span>${tplBadge(t)}
          <button class="use" data-use="${esc(t.id)}"><i class="ti ti-wand"></i> Dùng mẫu</button>
        </div>
        <div class="tn">${esc(t.name || t.id)}</div><div class="tc2">${esc(catName(t))} · ${esc(pk(t.pack)?.name || t.pack || '')}</div></div>`).join('')}</div>`);
}
// ---------- popup mẫu: thư viện lớn + xem chi tiết ----------
const CAT_ID = { 'BĐS': 'bds', 'Khoá học': 'khoahoc', 'Review': 'review', 'Chia sẻ': 'chiase', 'Tin tức': 'tintuc', 'Bán hàng': 'banhang', 'Doanh nghiệp': 'doanhnghiep', 'AI': 'ai', 'Khác': 'khac' };
const catName = t => Object.keys(CAT_ID).find(k => CAT_ID[k] === t.category || k === t.category) || 'Khác';
const pk = id => packs().find(p => p.id === id);
const ownTpl = t => !!t.brand_id && t.brand_id === ctxBrand();
const inCat = (t, cat) => cat === 'Tất cả' || (cat === brandCat() ? ownTpl(t) : catName(t) === cat);
// mẫu của thương hiệu đang làm đứng đầu, mẫu mặc định đầu tiên (sort ổn định giữ thứ tự còn lại)
const tplRank = t => (brandById(ctxBrand())?.tpl === t.id ? 0 : ownTpl(t) ? 1 : 2);
const tplFilter = (cat, q) => (TEMPLATES || []).filter(t => inCat(t, cat))
  .filter(t => !q || [t.name, t.desc, t.pack, pk(t.pack)?.name, catName(t), brandTitle(brandById(t.brand_id)), ...(t.tags || [])].join(' ').toLowerCase().includes(q.toLowerCase()))
  .sort((a, b) => tplRank(a) - tplRank(b));
const tplBadge = t => brandById(ctxBrand())?.tpl === t.id ? '<span class="badge l"><i class="ti ti-star-filled"></i> Mặc định</span>'
  : ownTpl(t) ? `<span class="badge l" title="${esc(brandTitle(brandById(t.brand_id)))}">Thương hiệu</span>` : t.user ? '<span class="badge l">Của tôi</span>' : '';
const TP = { cat: 'Tất cả', q: '', aspect: '', list: [], cur: null };
function tplPop(html, wide) {
  let el = $('#tplpop');
  if (!el) { el = document.createElement('div'); el.id = 'tplpop'; document.body.appendChild(el); el.addEventListener('click', tplPopClick); el.addEventListener('change', e => { const s = e.target.closest('[data-tpbrand]'); if (s) tplSetBrand(s.dataset.tpbrand, s.value); }); el.addEventListener('mouseover', tplHover(true)); el.addEventListener('mouseout', tplHover(false)); }
  el.innerHTML = `<div class="tpbox ${wide ? 'wide' : ''}">${html}</div>`; el.hidden = false;
}
function closeTplPop() { TPL_BRAND = null; const el = $('#tplpop'); if (el) { el.querySelectorAll('video').forEach(v => v.pause()); el.hidden = true; el.innerHTML = ''; } }
function tplCardHtml(t) {
  return `<div class="tpc" data-open="${esc(t.id)}"><div class="tv ${(t.aspect || '9:16') === '16:9' ? 'h' : ''}" data-dbg="${esc(t.preview?.jpg || '')}">
    ${t.preview?.mp4 ? `<video muted loop playsinline preload="none" data-src="${t.preview.mp4}"></video>` : `<span class="ph">${esc(pk(t.pack)?.icon || '🎬')}</span>`}
    <span class="badge">${esc(t.aspect || '9:16')}</span>${tplBadge(t)}</div>
    <div class="tn">${esc(t.name || t.id)}</div><div class="tc2">${esc(catName(t))} · ${esc(pk(t.pack)?.name || t.pack || '')}</div></div>`;
}
function openTplGallery() {
  TP.list = tplFilter(TP.cat, TP.q).filter(t => !TP.aspect || (t.aspect || '9:16') === TP.aspect);
  if (!tplCats().includes(TP.cat)) TP.cat = 'Tất cả';
  const count = c => (TEMPLATES || []).filter(t => inCat(t, c)).length;
  const box = $('#tplpop .tpbox.wide');
  const body = `<div class="tpgrid">${TP.list.length ? TP.list.map(tplCardHtml).join('') : empty('ti-filter-off', 'Không có mẫu phù hợp', 'Đổi danh mục hoặc xoá ô tìm.')}</div>`;
  if (box && box.querySelector('.tpgrid')) {   // giữ ô tìm đang gõ, chỉ vẽ lại danh mục + lưới
    box.querySelector('.tpcats').innerHTML = tplCats().map(c => `<button class="chip ${TP.cat === c ? 'on' : ''}" data-tpcat="${esc(c)}">${esc(c)} <span>${count(c)}</span></button>`).join('');
    box.querySelector('.tpasp').innerHTML = [['', 'Mọi khổ'], ['9:16', 'Dọc 9:16'], ['16:9', 'Ngang 16:9']].map(([v, l]) => `<button class="${TP.aspect === v ? 'on' : ''}" data-tpasp="${v}">${l}</button>`).join('');
    box.querySelector('.tpgrid').outerHTML = body; box.querySelector('.tpn').textContent = `${TP.list.length} mẫu`; return;
  }
  tplPop(`<div class="tphead"><h3><i class="ti ti-layout-grid"></i> Thư viện mẫu <span class="tpn">${TP.list.length} mẫu</span></h3>
      <div class="tpsearch"><i class="ti ti-search"></i><input id="tpq" placeholder="Tìm mẫu: căn hộ, khoá học, review…" value="${esc(TP.q)}"></div>
      <div class="seg3 tpasp"></div><button class="icon" data-tpclose title="Đóng (Esc)"><i class="ti ti-x"></i></button></div>
    <div class="chips tpcats"></div>${body}
    <div class="tpfoot muted">Rê chuột để xem trước · bấm vào mẫu để xem chi tiết và dùng</div>`, true);
  $('#tpq').addEventListener('input', e => { TP.q = e.target.value; openTplGallery(); });
  openTplGallery(); setTimeout(() => $('#tpq')?.focus(), 0);
}
function openTplDetail(id, list) {
  const t = (TEMPLATES || []).find(x => x.id === id); if (!t) return;
  TP.cur = id; if (list) TP.list = list;
  const i = TP.list.findIndex(x => x.id === id), n = TP.list.length, p = pk(t.pack), h = (t.aspect || '9:16') === '16:9';
  const fromGallery = !!$('#tplpop .tpgrid') || TP.back;
  TP.back = fromGallery;
  tplPop(`<div class="tdet ${h ? 'h' : ''}">
    <div class="tdv">${t.preview?.mp4 ? `<video src="${t.preview.mp4}" poster="${t.preview.jpg || ''}" autoplay muted loop playsinline controls></video>`
      : `<div class="ph" data-dbg="${esc(t.preview?.jpg || '')}">${t.preview?.jpg ? '' : esc(p?.icon || '🎬')}</div>`}</div>
    <div class="tdi">
      <div class="tdtop">${TP.back ? '<button class="ghost" data-tpback><i class="ti ti-arrow-left"></i> Thư viện</button>' : ''}<div class="grow"></div>
        ${n > 1 ? `<button class="icon" data-tpnav="-1" title="Mẫu trước (←)"><i class="ti ti-chevron-left"></i></button><span class="muted">${i + 1}/${n}</span><button class="icon" data-tpnav="1" title="Mẫu sau (→)"><i class="ti ti-chevron-right"></i></button>` : ''}
        <button class="icon" data-tpclose title="Đóng (Esc)"><i class="ti ti-x"></i></button></div>
      <h2>${esc(t.name || t.id)}</h2>
      <div class="tdtags"><span class="pill">${esc(catName(t))}</span><span class="pill">${esc(p?.icon || '')} ${esc(p?.name || t.pack || '')}</span><span class="pill">${esc(t.aspect || '9:16')}</span>${t.base_dur ? `<span class="pill">~${Math.round(t.base_dur)} giây</span>` : ''}${t.user ? '<span class="pill acc">Của tôi</span>' : ''}</div>
      ${t.desc ? `<p class="tddesc">${esc(t.desc)}</p>` : ''}
      ${t.needs?.length ? `<div class="tdneeds"><b><i class="ti ti-checklist"></i> Bạn cần chuẩn bị</b><ul>${t.needs.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${t.tags?.length ? `<div class="tdkw">${t.tags.map(x => `<span>#${esc(x)}</span>`).join('')}</div>` : ''}
      ${h !== (DW > DH) ? `<div class="help warn"><i class="ti ti-alert-triangle"></i> Mẫu này làm cho khổ ${h ? 'ngang 16:9' : 'dọc 9:16'}, dự án đang là ${DW > DH ? 'ngang 16:9' : 'dọc 9:16'}. ${tip('Vẫn dùng được: bố cục tự đổi theo khổ dự án.')}</div>` : ''}
      <div class="help">Giữ nguyên video và lời nói; hoàn tác bằng ⌘Z. ${tip('Mẫu chỉ thay graphic, phụ đề, nhạc, hiệu ứng; video và lời nói của bạn giữ nguyên. Bấm Hoàn tác (⌘Z) nếu không ưng.')}</div>
      ${tplBrandRow(t)}
      <div class="tdact"><button class="primary big" data-tpuse="${esc(t.id)}"><i class="ti ti-wand"></i> ${TL ? 'Dùng mẫu này' : 'Tạo video với mẫu này'}</button></div>
    </div></div>`, false);
}
// S27 M189: gán mẫu của tôi cho thương hiệu; đặt / bỏ mẫu mặc định của thương hiệu đang làm (brand kit `tpl`)
function tplBrandRow(t) {
  const cb = brandById(ctxBrand()), isDef = cb?.tpl === t.id;
  const own = t.user ? `<label class="lbl">Thương hiệu của mẫu</label><select data-tpbrand="${esc(t.id)}"><option value="">Không thuộc thương hiệu nào</option>${BRANDS.map(b => `<option value="${esc(b.id)}" ${b.id === t.brand_id ? 'selected' : ''}>${esc(brandTitle(b))}</option>`).join('')}</select>` : '';
  const def = cb ? `<button class="ghost" data-tpdef="${esc(t.id)}" title="${isDef ? 'Video mới của thương hiệu này không đề nghị mẫu nào nữa' : 'Hộp Video mới của thương hiệu này đề nghị áp mẫu này'}"><i class="ti ${isDef ? 'ti-star-off' : 'ti-star'}"></i> ${isDef ? 'Bỏ mẫu mặc định' : `Đặt làm mẫu mặc định của ${esc(brandTitle(cb))}`}</button>` : '';
  return own || def ? `<div class="tdbrand">${own}${def}</div>` : '';
}
async function tplSetBrand(id, brand) {
  const r = await api('/api/templates/brand', { id, brand }).catch(e => ({ error: e.message }));
  if (r.error) return toast(r.error);
  const t = (TEMPLATES || []).find(x => x.id === id); if (t) { if (brand) t.brand_id = brand; else delete t.brand_id; }
  toast(brand ? `Đã gán mẫu cho ${brandTitle(brandById(brand))}` : 'Mẫu không còn thuộc thương hiệu nào');
  if (panel === 'tpl') renderPanel(); openTplDetail(id);
}
async function tplSetDefault(id) {
  const cb = brandById(ctxBrand()); if (!cb) return;
  const tpl = cb.tpl === id ? '' : id;
  const r = await api('/api/brands/save', { brand: { id: cb.id, tpl } }).catch(e => ({ error: e.message }));
  if (r.error) return toast(r.error);
  if (tpl) cb.tpl = tpl; else delete cb.tpl;
  toast(tpl ? `Mẫu mặc định của ${brandTitle(cb)}: video mới sẽ đề nghị áp mẫu này` : 'Đã bỏ mẫu mặc định');
  if (panel === 'tpl') renderPanel(); openTplDetail(id);
}
function tplPopClick(e) {
  const t = e.target, q = s => t.closest(s);
  let b;
  if ((b = q('[data-tpdef]'))) return tplSetDefault(b.dataset.tpdef);
  if (t.id === 'tplpop' || q('[data-tpclose]')) return closeTplPop();
  if ((b = q('[data-tpcat]'))) { TP.cat = b.dataset.tpcat; return openTplGallery(); }
  if ((b = q('[data-tpasp]'))) { TP.aspect = b.dataset.tpasp; return openTplGallery(); }
  if (q('[data-tpback]')) { TP.back = false; $('#tplpop').innerHTML = ''; return openTplGallery(); }
  if ((b = q('[data-tpnav]'))) return tplNav(+b.dataset.tpnav);
  if ((b = q('[data-open]'))) return openTplDetail(b.dataset.open);
  if ((b = q('[data-tpuse]'))) {
    const tp = (TEMPLATES || []).find(x => x.id === b.dataset.tpuse), br = ctxBrand(), fromHome = TPL_BRAND != null; closeTplPop(); if (!tp) return;
    // mở từ trang chủ mà chưa mở dự án, hoặc dự án đang mở thuộc thương hiệu khác: tạo video mới cho thương hiệu này,
    // mẫu áp sau khi dự án mở (applyPendingTemplate); cùng thương hiệu thì áp ngay vào dự án đang mở
    if (fromHome) Studio.hideHome?.();
    if (!TL || (fromHome && br !== (META?.kho?.brand || ''))) return Studio.newProject({ brand: br, tpl: tp.id });
    applyTemplate(tp);
  }
}
function tplNav(d) { const n = TP.list.length; if (n < 2) return; const i = TP.list.findIndex(x => x.id === TP.cur); openTplDetail(TP.list[(i + d + n) % n].id); }
const tplHover = on => e => {
  const c = e.target.closest('.tpc'); if (!c || (!on && c.contains(e.relatedTarget))) return;
  const v = c.querySelector('video'); if (!v) return;
  if (on) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); v.classList.add('on'); } else { v.pause(); v.classList.remove('on'); }
};
window.addEventListener('keydown', e => {
  const el = $('#tplpop'); if (!el || el.hidden) return;
  const typing = document.activeElement?.id === 'tpq';
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); return closeTplPop(); }
  if (typing) { e.stopImmediatePropagation(); return; }
  if (el.querySelector('.tdet')) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); tplNav(e.key === 'ArrowLeft' ? -1 : 1); }
    if (e.key === 'Enter') { e.preventDefault(); el.querySelector('[data-tpuse]')?.click(); }
  }
  e.stopImmediatePropagation();
}, true);
$('#libbody').addEventListener('mouseover', e => {
  const v = e.target.closest('.tpl')?.querySelector('video');
  if (v && v.paused) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); v.classList.add('on'); }
});
$('#libbody').addEventListener('mouseout', e => {
  const t = e.target.closest('.tpl'); if (!t || t.contains(e.relatedTarget)) return;
  const v = t.querySelector('video'); if (v) { v.pause(); v.classList.remove('on'); }
});
// Map a template's own scenes (made for base_dur) onto this video's length.
function tplSceneMap(s, dur, base) {
  if (!base || s.t0 < 3) return s;
  const d = s.t0 > base - 4 ? dur - base : s.t0 * (dur / base - 1);
  mapScene(s, t => t + d);
  return s;
}
// "Dùng mẫu": the engine's shared win.applyTemplate (engine/packs/core.js) so Studio and the preview builder agree;
// the local version below is only a fallback for engines without it.
async function applyTemplate(tpl) {
  pushUndo();
  // Sample media the template points at (skill examples/media) is copied into this project's media/ first.
  try { const r = await api('/api/templates/media', { id: tpl.id }); if (r.copied) MEDIA_LOAD?.(); } catch (e) { console.warn(e); }
  if (typeof win?.applyTemplate === 'function') {
    try {
      win.applyTemplate(TL, JSON.parse(JSON.stringify(tpl)), CAP, TL.title || '');
      fixDuration(); needInit = true; changed(true);
      // the template's text, photos and timing come from its sample video: fit them to this clip's speech (27_tplfit)
      if (window.Studio?.fitTemplate && tpl.fit !== false) return Studio.fitTemplate(tpl);
      return toast(`Đã áp dụng mẫu “${tpl.name || tpl.id}”` + (tpl.needs?.length ? ` · cần thay: ${tpl.needs.join(', ')}` : ''));
    } catch (e) { console.error(e); toast('Mẫu lỗi: ' + e.message); }
  }
  const dur = TL.duration, p = packs().find(x => x.id === tpl.pack);
  TL.pack = tpl.pack || TL.pack;
  TL.brand = { ...(tpl.brand || {}), ...(TL.brand || {}) };
  let r = {};
  if (p?.recipe) {
    try { r = p.recipe({ dur, captions: CAP, brand: { ...(win.BR ? win.BR() : {}), ...TL.brand }, vertical: DH > DW, title: TL.title || tpl.title || '', opts: tpl.recipe_opts || {} }) || {}; }
    catch (e) { console.error(e); toast('Recipe lỗi: ' + e.message); }
  }
  const cs = tpl.caption_style ?? r.caption_style;
  if (cs != null) TL.caption_style = cs || undefined;
  const own = (tpl.scenes || []).map(s => tplSceneMap(JSON.parse(JSON.stringify(s)), dur, tpl.base_dur || dur));
  TL.scenes = [...(TL.scenes || []).filter(s => !s._recipe && !s._tpl), ...[...(r.scenes || []), ...own].map(s => ({ ...s, _recipe: true }))];
  const fx = [...(r.fx || []), ...(tpl.fx || []).map(f => ({ ...f, t: f.t < 3 || !tpl.base_dur ? f.t : f.t > tpl.base_dur - 4 ? f.t + dur - tpl.base_dur : f.t * dur / tpl.base_dur }))];
  if (fx.length || tpl.fx) TL.fx = [...(TL.fx || []).filter(f => !f._recipe), ...fx.map(f => ({ ...f, _recipe: true }))];
  const mood = tpl.music || r.music;
  if (mood) { TL.audio = TL.audio || {}; TL.audio.music = [{ t0: 0, t1: TL.duration, mood, gain: -20 }]; }
  fixDuration();
  needInit = true; changed(true);
  if (window.Studio?.fitTemplate && tpl.fit !== false) return Studio.fitTemplate(tpl);
  toast(`Đã áp dụng mẫu “${tpl.name || tpl.id}”`);
}
async function saveAsTemplate() {
  if (!BRANDS.length) BRANDS = await api('/api/brands').then(b => (Array.isArray(b) ? b : [])).catch(() => []);
  const p = packs().find(x => x.id === TL.pack);
  modal(`<h3><i class="ti ti-bookmark-plus"></i> Lưu dự án thành mẫu</h3>
    <label class="lbl">Tên mẫu</label><input id="tname" value="${esc(META.name || '')}">
    <div class="row2"><div><label class="lbl">Danh mục</label><select id="tcat">${TPL_CATS.slice(1).map(c => `<option>${c}</option>`).join('')}</select></div>
    <div><label class="lbl">Ảnh bìa tại</label><input id="tt" type="number" step=".1" value="${r2(T)}"></div></div>
    <label class="lbl">Mô tả ngắn</label><input id="tdesc" placeholder="VD: Giới thiệu căn hộ, nhạc sang, CTA gọi điện">
    <label class="lbl">Thẻ (cách nhau dấu phẩy)</label><input id="ttags" placeholder="bđs, căn hộ">
    <label class="lbl">Thuộc thương hiệu</label><select id="tbrand"><option value="">Không thuộc thương hiệu nào</option>${BRANDS.map(b => `<option value="${esc(b.id)}" ${b.id === ctxBrand() ? 'selected' : ''}>${esc(brandTitle(b))}</option>`).join('')}</select>
    <p class="muted">Mẫu giữ: gói ${esc(p?.name || TL.pack || '—')}, kiểu phụ đề, nhạc, brand kit, hiệu ứng và các graphic bạn tự thêm (graphic của bản dựng tự động sẽ được dựng lại theo video mới).</p>
    <div class="actions"><button onclick="closeModal()">Huỷ</button><button class="primary" id="tsave">Lưu mẫu</button></div>`);
  $('#tsave').onclick = async () => {
    if (dirty && !await saveNow()) return;
    const clean = s => JSON.parse(JSON.stringify(s, (k, v) => (k === 'cid' || k === '_orig' || k === '_recipe' || k === '_tpl' || k === 'note' ? undefined : v)));
    const tpl = { name: $('#tname').value.trim() || 'Mẫu của tôi', category: $('#tcat').value, aspect: DW > DH ? '16:9' : '9:16', pack: TL.pack || '',
      brand_id: $('#tbrand').value || undefined, desc: $('#tdesc').value.trim(), tags: $('#ttags').value.split(',').map(s => s.trim()).filter(Boolean),
      caption_style: TL.caption_style ?? '', music: TL.audio?.music?.[0]?.mood || '', brand: TL.brand || undefined,
      fx: (TL.fx || []).filter(f => !f._recipe).map(clean), scenes: (TL.scenes || []).filter(s => !s._recipe).map(clean), base_dur: TL.duration };
    modal(`<h3>Đang lưu mẫu…</h3><div class="muted">Render ảnh bìa</div><div class="bar bar--busy"><i></i></div>`);
    const r = await api('/api/templates/save', { tpl, t: +$('#tt')?.value || T });
    closeModal();
    if (r.ok) { toast('Đã lưu mẫu ' + r.id); TEMPLATES = null; tplCat = 'Tất cả'; openPanel('tpl'); } else toast('Lỗi: ' + (r.error || ''));
  };
}

// S27 M189: trang chủ mở thư viện mẫu cỡ lớn theo một thương hiệu (cả khi chưa mở dự án); mẫu chờ áp sau khi tạo video mới.
async function openTemplatesFor(o = {}) {
  await loadTemplates();
  TPL_BRAND = typeof o.brand === 'string' ? o.brand : null;
  TP.cat = brandCat() && (TEMPLATES || []).some(ownTpl) ? brandCat() : 'Tất cả'; TP.q = ''; TP.aspect = ''; TP.back = false;
  $('#tplpop')?.remove(); openTplGallery();
}
const PENDING_TPL = 'avs-apply-tpl';
function applyPendingTemplate() {
  let id = ''; try { id = sessionStorage.getItem(PENDING_TPL) || ''; sessionStorage.removeItem(PENDING_TPL); } catch { /* không có sessionStorage */ }
  if (!id || !TL) return;
  (TEMPLATES ? Promise.resolve() : loadTemplates()).then(() => {
    const tp = (TEMPLATES || []).find(x => x.id === id);
    if (tp) applyTemplate(tp); else toast('Không còn mẫu đã chọn, dự án mở không áp mẫu');
  });
}

// ---------- Media: tab Kho (tài nguyên của thương hiệu, S12 · M99) · Dự án này (media/) · B-roll động ----------
let MEDIA = [], BRES = [], KHOM = null, khoGroup = '', khoBusy = '';
// Mới mở dự án (hoặc dự án khác): đọc lại cả Kho, vì Kho đi theo thương hiệu của dự án
async function MEDIA_LOAD() { MEDIA = await api('/api/media'); KHOM = null; if (panel === 'media') renderPanel(); }
async function KHO_LOAD() {
  try { KHOM = await api('/api/media/kho'); } catch { KHOM = { error: 'Không đọc được Kho' }; }
  if (!KHOM || typeof KHOM !== 'object') KHOM = { error: 'Không đọc được Kho' };
  if (panel === 'media' && mediaTab === 'kho') renderPanel();
}
const KHO_GROUPS = [['', 'Tất cả'], ['image', 'Ảnh'], ['broll', 'B-roll'], ['music', 'Nhạc'], ['source', 'Nguồn']];
// Tiền tố nguồn của file trong media/ (docs/plans/S12-kho-du-an.md mục 2.2)
const SRC_PREFIX = [['kho_', 'Từ Kho', 'ti-building-warehouse'], ['brand_', 'Thương hiệu', 'ti-badge'], ['lib_', 'Thư viện b-roll', 'ti-folder-heart'], ['stock_', 'Ảnh / video stock', 'ti-world-download'],
  ['ai_', 'Ảnh AI', 'ti-sparkles'], ['sticker_', 'Sticker', 'ti-sticker'], ['', 'Tải thẳng vào dự án', 'ti-upload']];
const srcOf = name => SRC_PREFIX.find(([p]) => p && name.startsWith(p)) || SRC_PREFIX.at(-1);
const hovBtns = (kind, attr) => kind === 'audio' ? `<button data-${attr}="music"><i class="ti ti-plus"></i> Nhạc nền</button>`
  : `<button data-${attr}="clip" title="Thêm vào track chính tại playhead"><i class="ti ti-plus"></i> Track chính</button><button data-${attr}="overlay" class="sub" title="Chèn làm lớp phủ (ảnh phủ lên video)"><i class="ti ti-stack-push"></i> Lớp phủ</button>`;
const fsize = b => (!(b >= 0) ? '' : b >= 1 << 30 ? (b / (1 << 30)).toFixed(1) + ' GB' : b >= 1 << 20 ? Math.round(b / (1 << 20)) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
function mediaCell(m) {
  return `<div class="mcell" data-m="${MEDIA.indexOf(m)}" draggable="true" title="${esc(m.name)}">
      <div class="th" data-dbg="${m.thumb ? esc('/project/' + encodeURI(m.thumb)) : ''}">${m.thumb ? '' : `<i class="ti ${m.kind === 'audio' ? 'ti-music' : 'ti-movie'}"></i>`}
        ${m.dur ? `<span class="du">${fmt(m.dur).replace(/\.\d+$/, '')}</span>` : ''}${m.kind === 'image' ? '<span class="du"><i class="ti ti-photo"></i></span>' : ''}
        <div class="hov">${hovBtns(m.kind, 'madd')}</div></div>
      <div class="nm">${esc(m.name)}</div></div>`;
}
function khoCell(it, i) {
  const th = it.kind === 'image' ? avsUrl('/api/media/kho/file?rel=' + encodeURIComponent(it.rel)) : '';
  const ic = it.kind === 'image' ? 'ti-photo' : it.kind === 'video' ? 'ti-video' : 'ti-music';
  return `<div class="mcell" data-k="${i}" draggable="true" title="${esc(it.rel)}">
      <div class="th" data-dbg="${esc(th)}">${th ? '' : `<i class="ti ${it.kind === 'audio' ? 'ti-music' : 'ti-movie'}"></i>`}
        ${it.used ? '<span class="kused" title="Đã có trong dự án (media/kho_*)"><i class="ti ti-check"></i></span>' : ''}
        <span class="du"><i class="ti ${ic}"></i> ${fsize(it.size)}</span>
        ${khoBusy === it.rel ? '<div class="kwait"><i class="ti ti-loader-2 spin"></i></div>' : `<div class="hov">${hovBtns(it.kind, 'kadd')}</div>`}</div>
      <div class="nm">${esc(it.name)}</div></div>`;
}
const khoList = () => {
  const q = query.toLowerCase().trim();
  return (KHOM?.items || []).filter(it => (!khoGroup || it.group === khoGroup) && (!q || it.rel.toLowerCase().includes(q)));
};
function panelMedia() {
  const seg = `<div class="seg">${[['kho', 'Kho'], ['here', 'Dự án này'], ['broll', 'B-roll động']].map(([k, l]) => `<button data-mtab="${k}" class="${mediaTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (mediaTab === 'broll') {
    $('#libbody').innerHTML = seg + `<div class="help">Gõ chủ đề rồi Enter; bấm để chèn tại playhead. ${tip('Ví dụ: “tiền”, “AI”, “nhà đẹp”. Thư viện có 9.080 b-roll động.')}</div>
      <div class="bres">${BRES.map((b, i) => `<div data-b="${i}"><i class="ti ti-movie"></i><div><b>${esc(b.text || b.id)}</b><small>${esc(b.template)} · ${esc(b.id)}</small></div><i class="ti ti-plus add"></i></div>`).join('')}</div>`;
    return;
  }
  if (mediaTab === 'kho') {
    $('#libact').innerHTML = '<button class="mini icon" data-kreload title="Đọc lại Kho"><i class="ti ti-refresh"></i></button>';
    if (!KHOM) { $('#libbody').innerHTML = seg + '<div class="loading"><i class="ti ti-loader-2 spin"></i> Đang đọc Kho…</div>'; KHOM = { loading: true }; KHO_LOAD(); return; }
    if (KHOM.loading) { $('#libbody').innerHTML = seg + '<div class="loading"><i class="ti ti-loader-2 spin"></i> Đang đọc Kho…</div>'; return; }
    if (KHOM.error) { $('#libbody').innerHTML = seg + empty('ti-alert-triangle', 'Không đọc được Kho', esc(KHOM.error)); return; }
    const k = KHOM.kho || {}, list = khoList(), all = KHOM.items || [];
    const n = g => (g ? all.filter(it => it.group === g).length : all.length);
    $('#libbody').innerHTML = seg + `<div class="khohead" title="${esc(k.root || '')}"><i class="ti ti-building-warehouse"></i><span>Kho <b>${esc(k.title || 'Chung')}</b></span><small>${all.length} file</small></div>
      ${k.warning ? `<div class="help">${esc(k.warning)}</div>` : ''}
      <div class="chips">${KHO_GROUPS.map(([g, l]) => `<button class="chip ${khoGroup === g ? 'on' : ''}" data-kg="${g}">${l} <span>${n(g)}</span></button>`).join('')}</div>
      ${list.length ? `<div class="mgrid">${list.map(it => khoCell(it, all.indexOf(it))).join('')}</div><div class="help">Bấm hoặc kéo vào timeline để dùng. ${tip('File được liên kết vào media/ của dự án, không chép thêm nên không tốn dung lượng.')}</div>`
        : all.length ? empty('ti-filter-off', 'Không có file phù hợp', 'Chọn nhóm khác hoặc xoá ô tìm.')
          : empty('ti-building-warehouse', 'Kho chưa có file', 'Thêm ảnh, b-roll, nhạc vào Kho ở bước 1 Chuẩn bị (hoặc chép thẳng vào thư mục Kho) rồi bấm làm mới.')}`;
    return;
  }
  const q = query.toLowerCase(), list = MEDIA.filter(m => !q || m.name.toLowerCase().includes(q));
  const groups = SRC_PREFIX.map(([p, l, ic]) => [l, ic, list.filter(m => srcOf(m.name)[0] === p)]).filter(g => g[2].length);
  $('#libbody').innerHTML = seg + `<label class="upl"><i class="ti ti-cloud-upload"></i><span><b>Nhập media</b><small>Ảnh, video, nhạc · hoặc kéo thả vào cửa sổ</small></span><input type="file" id="upl" multiple hidden accept="image/*,video/*,audio/*"></label>
    ${groups.map(([l, ic, ms]) => `<div class="mgh"><i class="ti ${ic}"></i>${l}<span>${ms.length}</span></div><div class="mgrid">${ms.map(mediaCell).join('')}</div>`).join('')}
    ${MEDIA.length ? (groups.length ? '' : empty('ti-filter-off', 'Không có file phù hợp', 'Xoá ô tìm.')) : empty('ti-photo-plus', 'Chưa có media', 'Nhập ảnh hoặc video, hoặc chèn từ tab Kho. Bấm vào một file để thêm vào track chính tại playhead.')}`;
  $('#upl').onchange = e => uploadFiles([...e.target.files]);
}
// Kho → media/kho_* (POST /api/media/kho/use) rồi chèn như file media thường. how: clip | overlay | music; at: giây (thả lên timeline)
async function useKho(it, how, at) {
  if (!it || khoBusy) return;
  khoBusy = it.rel; if (panel === 'media') renderPanel();
  if (it.kind === 'video' && !it.used) toast('Đang tách khung hình video…');
  let m = null;
  try { m = await api('/api/media/kho/use', { rel: it.rel }); } catch (e) { m = { error: e.message }; }
  khoBusy = '';
  if (!m || m.error) { if (panel === 'media') renderPanel(); return toast('Không chèn được: ' + (m?.error || 'lỗi')); }
  it.used = m.path;
  try { MEDIA = await api('/api/media'); } catch {}
  if (at != null) setTime(at);
  if (how === 'overlay' || how === 'music' || m.kind === 'audio') insertMedia(m); else insertMediaClip(m);
  if (panel === 'media') renderPanel();
}
// Media → main track clip (default) or → overlay photo scene (old behaviour).
function insertMediaClip(m) {
  if (m.kind === 'audio') return insertMedia(m);
  pushUndo();
  const clip = m.kind === 'video' ? { src: { seq: m.seq.seq, fps: m.seq.fps || 30, count: m.seq.count }, audio: m.path, in: 0, out: r3(m.dur || m.seq.count / 30), fit: 'blurfill' }
    : { src: m.path, in: 0, out: 3, fit: 'blurfill' };
  const at = insertClipAt(clip, T);
  changed(); select(compOf(clip)); setTime(at + .01);
  toast('Đã thêm vào track chính');
}
// o (S20 M143, kéo thả): { t: giây chèn (mặc định playhead), x, y: tâm px thiết kế khi thả lên khung }. Ảnh phủ toàn màn không có vị trí.
function insertMedia(m, o = {}) {
  pushUndo();
  const t = o.t ?? T;
  if (m.kind === 'audio') { TL.audio = TL.audio || {}; TL.audio.music = TL.audio.music || []; const x = { t0: r2(t), t1: TL.duration, file: m.path, gain: -18 }; TL.audio.music.push(x); changed(); return libSelect(x, o); }
  const src = m.kind === 'video' ? { ...m.seq, t0: r2(t) } : m.path;
  const dur = m.kind === 'video' ? Math.min(m.dur || 3, TL.duration - t) : 3;
  const s = { type: 'photo', t0: r2(t), t1: r2(Math.min(TL.duration, t + dur)), mode: 'full', media: src };
  TL.scenes.push(s); changed(); libSelect(s, o);
}
// Chọn element vừa thêm; thả lên khung thì dời tâm về điểm thả (cùng bước hoàn tác với lần chèn). Thả lên timeline xa playhead thì
// tua tới element để thấy khung chọn.
const NO_POS = s => LAYOUT.has(s.type) || (BROLL.has(s.type) && window.StageCore?.geoOf(s.type) !== 'card') || s.fit === 'contain';
function libSelect(obj, o = {}) {
  const c = compOf(obj); if (!c) return;
  if (o.x != null && !(c.kind === 'scene' && NO_POS(c.obj))) {
    // chỉ dời tâm, không ghi cỡ: getPos trả cỡ mặc định (60) mà khối HF hiểu size là % (mặc định 100). Cảnh card cần size = rộng.
    const p = window.DropCore?.centerAt(getPos(c), o.x, o.y);
    if (p) { setPos(c, p.card ? p : { x: p.x, y: p.y }); changed(); }
  }
  select(compOf(obj), o.t != null && Math.abs(o.t - T) > .05);
}
async function uploadFiles(files) {
  for (const f of files) { toast('Đang tải ' + f.name + '…'); MEDIA = await (await fetch('/api/upload?name=' + encodeURIComponent(f.name), { method: 'POST', body: f })).json(); }
  mediaTab = 'here'; openPanel('media'); toast('Đã thêm ' + files.length + ' file');
}
// S20 M143: mọi mục kéo được của thư viện (chữ, sticker, hiệu ứng / khối HyperFrames, media) mang { kind, id } theo DropCore.MIME;
// đích thả ở features/65_drop.js gọi libInsert. Ô Kho / Dự án này thả lên timeline vẫn như cũ (ảnh/video → track chính, nhạc → nhạc nền).
function libDragItem(el) {
  let b;
  if (el.closest('#addtext')) return ['text', -1];
  if ((b = el.closest('[data-tp]'))) return ['text', b.dataset.tp];
  if ((b = el.closest('[data-st]'))) return ['sticker', b.dataset.st];
  if ((b = el.closest('[data-fx]'))) return ['fx', b.dataset.fx];
  if ((b = el.closest('[data-efxadd]'))) return ['efx', b.dataset.efxadd]; // S28 M206: hiệu ứng khung hình → track Hiệu ứng
  if ((b = el.closest('.mcell[data-m]'))) return ['media', b.dataset.m];
  if ((b = el.closest('.mcell[data-k]'))) return ['kho', b.dataset.k];
  return null;
}
$('#libbody').addEventListener('dragstart', e => {
  const it = e.target.closest && libDragItem(e.target); if (!it || !window.DropCore) return;
  e.dataTransfer.setData(DropCore.MIME, DropCore.encode(...it)); e.dataTransfer.effectAllowed = 'copy';
  document.body.classList.add('libdrag');
});
$('#libbody').addEventListener('dragend', () => document.body.classList.remove('libdrag'));
// where: 'stage' (o.x, o.y = tâm, chèn tại playhead) | 'timeline' (o.t = giây thả, o.track = data-track của track đích)
function libInsert(d, where, o = {}) {
  const at = where === 'timeline' ? { t: o.t } : { x: o.x, y: o.y };
  if (d.kind === 'text') return addText(+d.id >= 0 ? TEXT_PRESETS[+d.id] : undefined, at);
  if (d.kind === 'sticker') return STICKERS.includes(d.id) && addSticker(d.id, at);
  if (d.kind === 'fx') { const [i, j] = d.id.split(':').map(Number); return packs()[i]?.items[j] && addPackItem(i, j, at); }
  if (d.kind === 'efx') return window.Studio?.fxtrack?.add(d.id, where === 'timeline' ? o.t : undefined); // S28 M206 (81_fxtrack.js)
  const how = where === 'stage' ? 'overlay' : DropCore.mediaHow(o.track);
  if (d.kind === 'kho') { const it = KHOM?.items?.[+d.id]; return it && useKho(it, how, where === 'timeline' ? o.t : undefined); }
  const m = MEDIA[+d.id]; if (!m) return;
  if (how === 'clip' && m.kind !== 'audio') { setTime(o.t); return insertMediaClip(m); }
  return insertMedia(m, at);
}
// S21 M147: mục thư viện xem chi tiết được ở cột phải (features/69_libdetail.js). Bấm một lần (hoặc Enter / Space khi focus) = xem chi
// tiết; bấm đúp, nút "Thêm tại playhead" / "Áp dụng" trong chi tiết và kéo thả (M143) = chèn ngay qua libAct. Nút nhỏ trong ô (nghe
// thử, Dùng mẫu, + nhạc / SFX, Nhạc của bạn) vẫn làm việc của nó.
const LIB_ITEMS = [['tpl', 'data-tpl'], ['text', 'data-tp'], ['cs', 'data-cs'], ['sticker', 'data-st'], ['fx', 'data-fx'], ['shape', 'data-shadd'],
  ['music', 'data-mus'], ['sfx', 'data-sfx'], ['trans', 'data-tr'], ['filter', 'data-flt']];
function libItemOf(el) {
  if (!el?.closest || el.closest('[data-aud],[data-use],[data-addmusic],[data-addsfx],[data-mymus]')) return null;
  for (const [k, a] of LIB_ITEMS) { const b = el.closest(`[${a}]`); if (b) return [k, b.getAttribute(a), b]; }
  return null;
}
// Hành vi chèn / áp của mục (cũng là hành vi bấm cũ). how = 'all': chuyển cảnh, bộ lọc cho mọi clip.
function libAct(kind, id, how) {
  if (kind === 'tpl') { const tp = (TEMPLATES || []).find(x => x.id === id); return tp && applyTemplate(tp); }
  if (kind === 'text') return addText(TEXT_PRESETS[+id]);
  if (kind === 'cs') { pushUndo(); TL.caption_style = id || undefined; changed(); return renderPanel(); }
  if (kind === 'sticker') return addSticker(id);
  if (kind === 'fx') { const [i, j] = id.split(':').map(Number); return packs()[i]?.items[j] && addPackItem(i, j); }
  if (kind === 'shape') return window.Studio?.addShape?.(id);
  if (kind === 'music') return addMusic(id);
  if (kind === 'sfx') return addSfx(id);
  if (kind === 'trans') {
    if (how === 'all') {
      pushUndo(); TL.clips.forEach((c, i) => { if (i) { if (id) c.transition = { type: id, dur: r2(transDur) }; else delete c.transition; } }); changed(true); renderPanel();
      return toast(id ? `Đã áp dụng “${id}” cho ${TL.clips.length - 1} chỗ nối` : 'Đã bỏ chuyển cảnh ở mọi chỗ nối');
    }
    if (sel?.kind !== 'clip') { const k = clipAtT(T); if (k && k.i > 0) { select(compOf(k.c)); } else return toast('Chọn một clip (không phải clip đầu)'); }
    return setTransition(sel.idx, id, transDur);
  }
  if (kind === 'filter') {
    if (how === 'all') { setFilter(0, id, true); return toast('Đã áp dụng cho mọi clip'); }
    const k = sel?.kind === 'clip' ? clipLayout()[sel.idx] : clipAtT(T); if (!k) return toast('Chưa có clip');
    if (sel?.kind !== 'clip') select(compOf(k.c));
    return setFilter(k.i, id);
  }
}
$('#libbody').addEventListener('dblclick', e => { const it = libItemOf(e.target); if (it) { e.preventDefault(); e.stopPropagation(); libAct(it[0], it[1]); } });
$('#libbody').addEventListener('keydown', e => {
  if ((e.key !== 'Enter' && e.key !== ' ') || e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const it = libItemOf(e.target); if (!it || it[2] !== e.target || !window.Studio?.libDetail) return;
  e.preventDefault(); e.stopPropagation(); Studio.libDetail.pick(it[0], it[1]);
});
(() => {
  let dz = null;
  window.addEventListener('dragover', e => { if (![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); if (!dz) { dz = document.createElement('div'); dz.id = 'drop'; dz.innerHTML = '<i class="ti ti-cloud-upload"></i>Thả để thêm vào Media'; document.body.appendChild(dz); } });
  window.addEventListener('dragleave', e => { if (e.relatedTarget == null && dz) { dz.remove(); dz = null; } });
  window.addEventListener('drop', e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); dz?.remove(); dz = null; uploadFiles([...e.dataTransfer.files]); });
})();

// ---------- Âm thanh ----------
let audEl = null, audKey = '';
function audition(src, key) {
  if (audEl) { audEl.pause(); }
  if (audKey === key) { audKey = ''; audEl = null; return refreshAud(); }
  audEl = new Audio(src); audKey = key; audEl.volume = .7; audEl.play().catch(() => {});
  audEl.onended = () => { audKey = ''; refreshAud(); };
  refreshAud();
}
function refreshAud() { for (const b of document.querySelectorAll('[data-aud]')) { const on = b.dataset.aud === audKey; b.classList.toggle('on', on); b.innerHTML = `<i class="ti ${on ? 'ti-player-pause-filled' : 'ti-player-play-filled'}"></i>`; } }
const MOOD_VI = { corporate: 'Doanh nghiệp', epic: 'Hùng tráng', happy: 'Vui tươi', hype: 'Sôi động', inspire: 'Truyền cảm hứng', lofi: 'Lofi thư giãn', mellow: 'Nhẹ nhàng', sad: 'Trầm buồn', suspense: 'Hồi hộp', tech: 'Công nghệ' };
const MOOD_IC = { corporate: 'ti-briefcase', epic: 'ti-sword', happy: 'ti-mood-happy', hype: 'ti-flame', inspire: 'ti-sparkles', lofi: 'ti-coffee', mellow: 'ti-feather', sad: 'ti-cloud-rain', suspense: 'ti-eye', tech: 'ti-cpu' };
// S19 M138: "Nhạc của bạn" = Nhac/ trong Kho của dự án (Kho của thương hiệu): tải lên, nghe thử, thay nhạc nền cả video, thêm tại
// playhead. Đưa vào dự án qua /api/media/kho/use (media/kho_*, như tab Kho của panel Media). Nhạc mẫu theo tâm trạng ở dưới.
let MYMUS = null, myMusBusy = '', myMusAt = 0;
async function loadMyMusic(force) {
  if (MYMUS && !force) return;
  myMusAt = Date.now();
  try { const r = await api('/api/media/kho?group=music'); MYMUS = { kho: r.kho || null, items: (r.items || []).filter(i => i.kind === 'audio'), error: r.error || '' }; }
  catch (e) { MYMUS = { kho: null, items: [], error: e.message }; }
  if (panel === 'audio' && audioTab === 'music') renderPanel();
}
function myMusicBlock() {
  const head = n => `<div class="mgh"><i class="ti ti-user-star"></i>Nhạc của bạn${n != null ? `<span>${n}</span>` : ''}</div>`;
  if (MYMUS && Date.now() - myMusAt > 15000) loadMyMusic(true); // file chép thẳng vào thư mục Nhac/: đọc lại khi mở panel
  if (!MYMUS) { loadMyMusic(); return head() + '<div class="help">Đang đọc Kho…</div>'; }
  const k = MYMUS.kho, where = k ? `Kho ${k.brand ? k.title : 'Chung'} › Nhac` : 'Kho';
  const up = k?.exists ? `<label class="upl"><i class="ti ti-cloud-upload"></i><span><b>Tải nhạc lên</b><small>Lưu vào ${esc(where)}, dùng lại cho mọi video của thương hiệu</small></span><input type="file" id="mymus-up" accept="audio/*,.mp3,.m4a,.wav,.aac,.flac,.ogg" multiple hidden></label>`
    : `<div class="help">${esc(MYMUS.error || 'Dự án chưa có Kho')}. ${tip('Tạo Kho ở bước ① Chuẩn bị (mục Kho) để lưu nhạc riêng.')}</div>`;
  const rows = MYMUS.items.map(it => `<div class="arow"><button class="pl" data-aud="kho:${esc(it.rel)}" title="Nghe thử"><i class="ti ti-player-play-filled"></i></button><span class="mi"><i class="ti ti-music"></i></span>
    <div class="mid"><b>${esc(it.name.replace(/\.[^.]+$/, ''))}</b><small>${esc(it.rel)}</small></div>
    <button class="add" data-mymus="replace" data-rel="${esc(it.rel)}" title="Dùng làm nhạc nền cả video (thay nhạc nền đang có)" ${myMusBusy ? 'disabled' : ''}><i class="ti ti-replace"></i></button>
    <button class="add" data-mymus="add" data-rel="${esc(it.rel)}" title="Thêm tại playhead" ${myMusBusy ? 'disabled' : ''}><i class="ti ti-plus"></i></button></div>`).join('');
  return head(MYMUS.items.length) + up + (rows ? `<div class="alist">${rows}</div>` : k?.exists ? `<div class="help">Chưa có bài nào trong ${esc(where)}. Tải nhạc lên hoặc chép file vào thư mục đó.</div>` : '')
    + '<div class="mgh"><i class="ti ti-music"></i>Nhạc mẫu theo tâm trạng</div>';
}
async function useMyMusic(rel, how) {
  if (myMusBusy) return; myMusBusy = rel; renderPanel();
  let m = null; try { m = await api('/api/media/kho/use', { rel }); } catch (e) { m = { error: e.message }; }
  myMusBusy = ''; renderPanel();
  if (!m || m.error || m.kind !== 'audio') return toast('Không dùng được bài này: ' + (m?.error || 'không phải file âm thanh'));
  try { MEDIA = await api('/api/media'); } catch {}
  if (how === 'add') return insertMedia(m);
  // thay nhạc nền cả video: một đoạn từ đầu tới hết, thay mọi đoạn nhạc nền đang có (⌘Z để quay lại)
  pushUndo(); TL.audio = TL.audio || {};
  const x = { t0: 0, t1: TL.duration, file: m.path, gain: -18 }; TL.audio.music = [x];
  changed(); select(compOf(x)); toast('Đã thay nhạc nền bằng “' + (m.name || rel) + '” · ⌘Z để hoàn tác');
}
async function uploadMyMusic(files) {
  for (const f of files) {
    toast('Đang tải ' + f.name + '…');
    // vào Nhac/ của Kho chứa dự án này (không theo id thương hiệu: dự án có thể nằm trong Kho tự chọn)
    let r = null; try { r = await (await fetch('/api/media/kho/upload?' + new URLSearchParams({ name: f.name }), { method: 'POST', body: f })).json(); } catch (e) { r = { error: e.message }; }
    if (r?.error) { toast('Không tải được ' + f.name + ': ' + r.error); continue; }
  }
  await loadMyMusic(true); toast('Đã lưu nhạc vào Kho');
}
function panelAudio() {
  const q = query.toLowerCase();
  const seg = `<div class="seg">${[['music', 'Nhạc nền'], ['sfx', 'Hiệu ứng âm thanh']].map(([k, l]) => `<button data-atab="${k}" class="${audioTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (audioTab === 'music') {
    const rows = LIB.music.map(f => f.replace('.mp3', '')).filter(m => !q || (m + ' ' + (MOOD_VI[m.replace(/_\d+$/, '')] || '')).toLowerCase().includes(q));
    $('#libbody').innerHTML = seg + `<div class="help">${(TL.audio?.music || []).length ? `Đang có ${(TL.audio.music).length} đoạn nhạc trên timeline.` : 'Chưa có nhạc nền.'} ${tip('Bấm + để thêm từ playhead tới hết video.')}</div>
      ${myMusicBlock()}
      <div class="alist">${rows.map(m => { const b = m.replace(/_\d+$/, ''), n = m.match(/_(\d+)$/)?.[1]; return `<div class="arow" data-mus="${m}" tabindex="0">
        <button class="pl" data-aud="music:${m}"><i class="ti ti-player-play-filled"></i></button><span class="mi"><i class="ti ${MOOD_IC[b] || 'ti-music'}"></i></span>
        <div class="mid"><b>${esc(MOOD_VI[b] || b)}${n ? ' ' + n : ''}</b><small>${esc(m)}.mp3</small></div><button class="add" data-addmusic="${m}" title="Thêm tại playhead"><i class="ti ti-plus"></i></button></div>`; }).join('')}</div>`;
    $('#mymus-up')?.addEventListener('change', e => uploadMyMusic([...e.target.files]));
  } else {
    const rows = LIB.sfx.map(f => f.replace(/\.\w+$/, '')).filter(s => !q || s.includes(q));
    $('#libbody').innerHTML = seg + `<button class="wide" data-pact="autosfx"><i class="ti ti-wand"></i> Tự đặt SFX theo graphic</button>
      <div class="alist">${rows.map(s => `<div class="arow sfx" data-sfx="${s}" tabindex="0" title="Bấm để xem chi tiết, bấm đúp để thêm tại playhead">
        <button class="pl" data-aud="sfx:${s}"><i class="ti ti-player-play-filled"></i></button><div class="mid"><b>${esc(s.replace(/_/g, ' '))}</b></div><i class="ti ti-plus add2" data-addsfx="${s}" title="Thêm tại playhead"></i></div>`).join('')}</div>`;
  }
  refreshAud();
}
function addSfx(name) { pushUndo(); TL.audio = TL.audio || {}; TL.audio.sfx = TL.audio.sfx || []; const x = { t: r2(T), name, gain: -14 }; TL.audio.sfx.push(x); changed(); select(compOf(x)); toast('Đã thêm SFX ' + name); }
function addMusic(mood) { pushUndo(); TL.audio = TL.audio || {}; TL.audio.music = TL.audio.music || []; const m = { t0: r2(T), t1: TL.duration, mood, gain: -18 }; TL.audio.music.push(m); changed(); select(compOf(m)); toast('Đã thêm nhạc ' + mood); }

// ---------- Chữ ----------
function panelText() {
  const capStyles = [...new Set(['slate', 'tiktok', ...Object.keys((win && win.CAPTION_STYLES) || {})])];
  const owner = cs => packs().find(p => p.caption === cs || p.id === cs);
  $('#libbody').innerHTML = `<button class="wide primary" id="addtext" draggable="true" title="Bấm để thêm tại playhead, hoặc kéo vào khung / timeline"><i class="ti ti-plus"></i> Thêm chữ</button>
    <div class="sect">Mẫu chữ</div><div class="txgrid">${TEXT_PRESETS.map((p, i) => `<button class="tx" data-tp="${i}" draggable="true"><span data-dcss="${esc(p.css)}">${esc(p.text)}</span><small>${esc(p.name)}</small></button>`).join('')}</div>
    <div class="sect">Kiểu phụ đề <span class="muted">· cả video</span></div>
    <div class="cslist">${[...capStyles.map(c => [c, (owner(c)?.icon || '💬') + ' ' + ((win && win.CAPTION_LABELS || {})[c] || c)]), ['', '✦ Karaoke cơ bản'], ['none', '⊘ Tắt phụ đề']].map(([v, l]) => `<button class="${(TL.caption_style ?? '') === v ? 'on' : ''}" data-cs="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
}
function addText(preset, o = {}) {
  pushUndo();
  const p = preset ? preset.p : { style: 'yellow', size: 56, anim: 'pop' }, t = o.t ?? T;
  const s = { type: 'text', t0: r2(t), t1: r2(Math.min(TL.duration, t + 2)), added: true, lines: [{ text: preset ? preset.text : 'Chữ mới', t: r2(t), y: DH > DW ? 640 : 360, ...(DH > DW ? {} : { x: 640 }), ...p }] };
  TL.scenes.push(s); changed(); libSelect(s.lines[0], o);
}

// ---------- Sticker ----------
let FLU = null;
function fluentUrl(ch) {
  if (FLU == null) { try { FLU = win?.eval('typeof FLUENT_INDEX !== "undefined" ? FLUENT_INDEX : 0') || 0; } catch { FLU = 0; } }
  const p = FLU && (FLU[ch] || FLU[ch.replace(/️/g, '')] || FLU[ch + '️']);
  return p ? '/cdn/gh/microsoft/fluentui-emoji@main/assets/' + encodeURI(p) : ''; // server disk cache (net_cache.mjs)
}
function panelSticker() {
  $('#libbody').innerHTML = `<div class="help">Emoji 3D bật lên tại playhead. ${tip('Kéo vào khung để đặt đúng chỗ, hoặc vào timeline để chọn lúc hiện.')}</div>
    <div class="stgrid">${STICKERS.map(ch => { const u = fluentUrl(ch); return `<button data-st="${ch}" title="${ch}" draggable="true">${u ? `<img loading="lazy" src="${u}" alt="${ch}" draggable="false">` : `<span>${ch}</span>`}</button>`; }).join('')}</div>`;
}
function addSticker(ch, o = {}) {
  pushUndo();
  const t = o.t ?? T;
  const s = { type: 'emoji_pop', t0: r2(t), t1: r2(Math.min(TL.duration, t + 1.6)), src: ch, x: DW / 2, y: DH > DW ? 900 : 420, size: 160 };
  TL.scenes.push(s); changed(); libSelect(s, o);
}

// ---------- Hiệu ứng (every pack item) ----------
async function loadThumbs() { try { const r = await fetch('/studio/thumbs/index.json'); THUMBS = r.ok ? await r.json() : {}; } catch { THUMBS = {}; } if (panel === 'fx') renderPanel(); }
function panelFx() {
  const q = query.toLowerCase();
  const has = k => THUMBS && (Array.isArray(THUMBS.items) ? THUMBS.items.some(x => x.key === k) : THUMBS[k]);
  const groups = packs().map((p, i) => {
    const items = p.items.map((it, j) => ({ it, j })).filter(({ it }) => !q || (it.label + ' ' + it.type + ' ' + p.name).toLowerCase().includes(q));
    if (!items.length) return '';
    return `<div class="fxg"><div class="sect">${esc(p.icon || '')} ${esc(p.name)} <span class="muted">${items.length}</span></div><div class="fxgrid">${items.map(({ it, j }) => {
      const k = `${p.id}__${j}`;
      return `<button class="fx" data-fx="${i}:${j}" draggable="true" title="${esc(it.label)} · ${esc(it.type)}"><span class="fth ${DW > DH ? 'h' : ''}">${has(k) ? `<img loading="lazy" src="/studio/thumbs/${k}.jpg" onerror="this.remove()" draggable="false">` : ''}<em>${esc(p.icon || '✦')}</em></span><small>${esc(it.label)}</small></button>`;
    }).join('')}</div></div>`;
  }).join('');
  $('#libbody').innerHTML = (window.Studio?.fxtrack?.panelHtml(q) || '') + (packs().length ? '' : '<div class="loading"><i class="ti ti-loader-2 spin"></i> Đang nạp engine…</div>') + (groups || (packs().length ? empty('ti-search-off', 'Không tìm thấy hiệu ứng', '') : ''));
}
// Pack demo items point at sample files (broll/01.jpg, ui/…png) most projects don't have → use the project's own images instead.
const DEMO_MEDIA = /^(broll|ui)\/[\w.-]+\.(jpe?g|png|webp)$/i;
async function fillDemoMedia(s) {
  const refs = []; JSON.stringify(s, (k, v) => { if (typeof v === 'string' && DEMO_MEDIA.test(v)) refs.push(v); return v; });
  const imgs = MEDIA.filter(m => m.kind === 'image').map(m => m.path);
  if (!refs.length || !imgs.length) return s;
  try { if ((await fetch('/project/' + refs[0], { method: 'HEAD' })).ok) return s; } catch { }
  let k = 0;
  return JSON.parse(JSON.stringify(s), (key, v) => (typeof v === 'string' && DEMO_MEDIA.test(v) ? imgs[k++ % imgs.length] : v));
}
async function addPackItem(i, j, o = {}) {
  pushUndo();
  const s = await fillDemoMedia(JSON.parse(JSON.stringify(packs()[i].items[j].make(r2(o.t ?? T)))));
  s.t1 = r2(Math.min(TL.duration, s.t1)); TL.scenes.push(s); changed(); libSelect(compOf(s) ? s : s.lines?.[0] || s, o);
}

// ---------- Chuyển cảnh ----------
function panelTrans() {
  const c = sel?.kind === 'clip' ? sel : null, cur = c?.obj.transition?.type || '';
  $('#libbody').innerHTML = `<div class="help">${c ? (c.idx === 0 ? 'Clip đầu tiên không có chuyển cảnh vào — chọn clip phía sau.' : `Áp dụng cho chuyển cảnh <b>vào clip ${c.idx + 1}</b>.`) : `Chọn một clip trên track chính. ${tip('Hoặc kéo hiệu ứng thả vào chỗ nối giữa hai clip.')}`}</div>
    <div class="slrow"><span>Thời lượng</span><input type="range" min=".1" max="1.5" step=".05" value="${c?.obj.transition?.dur ?? transDur}" data-transdur><b id="tdv">${(c?.obj.transition?.dur ?? transDur).toFixed(2)}s</b></div>
    <div class="trgrid"><button class="tr ${cur ? '' : 'on'}" data-tr=""><span class="demo none"><i class="ti ti-ban"></i></span><small>Không</small></button>
    ${TRANS_TYPES.map(([k, l, ic]) => `<button class="tr ${cur === k ? 'on' : ''}" data-tr="${k}" draggable="true"><span class="demo t-${k}"><i class="a"></i><i class="b"></i><i class="ti ${ic} ic"></i></span><small>${l}</small></button>`).join('')}</div>
    <button class="wide" data-trall><i class="ti ti-copy"></i> Áp dụng cho mọi clip</button>`;
}
function setTransition(i, type, dur = transDur) {
  const c = TL.clips?.[i]; if (!c || i === 0) return toast('Clip đầu tiên không có chuyển cảnh vào');
  pushUndo();
  if (type) c.transition = { type, dur: r2(dur) }; else delete c.transition;
  changed(true); if (panel === 'trans') renderPanel();
}

// ---------- Bộ lọc ----------
function panelFilter() {
  const k = sel?.kind === 'clip' ? clipLayout()[sel.idx] : clipAtT(T);
  const img = k ? clipFrameUrl(k.c, srcAt(k, Math.max(k.t0, Math.min(T, k.t1 - .05)))) : '';
  const cur = k?.c.filter?.preset || '';
  $('#libbody').innerHTML = `<div class="help">${k ? `Áp dụng cho <b>clip ${k.i + 1}</b>${sel?.kind === 'clip' ? '' : ' (tại playhead)'}. Tinh chỉnh thêm ở tab Màu bên phải.` : 'Chưa có clip.'}</div>
    <div class="flgrid">${FILTERS.map(([v, l]) => `<button class="fl ${cur === v ? 'on' : ''}" data-flt="${v}"><span data-dbg="${esc(img)}" data-dfx="${esc(v ? LUT_CSS[v] : 'none')}"></span><small>${l}</small></button>`).join('')}</div>
    <button class="wide" data-flall><i class="ti ti-copy"></i> Áp dụng bộ lọc này cho mọi clip</button>`;
}
function setFilter(i, preset, all) {
  pushUndo();
  for (const c of all ? TL.clips : [TL.clips[i]]) { c.filter = { ...(c.filter || {}) }; if (preset) c.filter.preset = preset; else delete c.filter.preset; if (!Object.keys(c.filter).length) delete c.filter; }
  changed(true); if (panel === 'filter') renderPanel();
}

// ---------- panel events ----------
$('#libact').addEventListener('click', e => { if (e.target.closest('[data-kreload]')) { KHOM = null; return renderPanel(); } const b = e.target.closest('[data-tplact]'); if (!b) return; if (b.dataset.tplact === 'gallery') { TP.cat = tplCat; TP.q = query; TP.back = false; $('#tplpop')?.remove(); return openTplGallery(); } saveAsTemplate(); });
$('#libbody').addEventListener('click', async e => {
  const t = e.target, q = s => t.closest(s);
  let b;
  if ((b = q('[data-tab]'))) { tab = b.dataset.tab; return renderComps(); }
  if ((b = q('.item'))) {
    const c = compByCid(b.dataset.cid); if (!c) return;
    if (t.type === 'checkbox') { touch(c.obj); c.obj.hidden = !t.checked || undefined; changed(true); return; }
    return select(c, true);
  }
  if ((b = libItemOf(t))) { // S21 M147: bấm = xem chi tiết; bấm thứ hai của bấm đúp bỏ qua (dblclick chèn)
    e.stopPropagation(); // ô Hình khối: 64_shapes.js không chèn ngay
    if (!window.Studio?.libDetail) return libAct(b[0], b[1]);
    if (e.detail < 2) Studio.libDetail.pick(b[0], b[1]);
    return;
  }
  if ((b = q('[data-cat]'))) { tplCat = b.dataset.cat; return renderPanel(); }
  if ((b = q('[data-use]'))) { const tp = TEMPLATES.find(x => x.id === b.dataset.use); if (tp) applyTemplate(tp); return; }
  if ((b = q('[data-mtab]'))) { mediaTab = b.dataset.mtab; return renderPanel(); }
  if ((b = q('[data-atab]'))) { audioTab = b.dataset.atab; return renderPanel(); }
  if ((b = q('[data-kg]'))) { khoGroup = b.dataset.kg; return renderPanel(); }
  if ((b = q('[data-k]'))) { const how = q('[data-kadd]')?.dataset.kadd; return useKho(KHOM?.items?.[+b.dataset.k], how || 'clip'); }
  if ((b = q('[data-m]'))) {
    const m = MEDIA[+b.dataset.m], how = q('[data-madd]')?.dataset.madd;
    return how === 'overlay' || how === 'music' ? insertMedia(m) : insertMediaClip(m);
  }
  if ((b = q('[data-b]'))) { pushUndo(); const s = { type: 'media_card', t0: r2(T), t1: r2(Math.min(TL.duration, T + 3)), screen: { broll: { id: BRES[+b.dataset.b].id, ...(BRES[+b.dataset.b].text ? { text: BRES[+b.dataset.b].text } : {}) } } }; TL.scenes.push(s); changed(); return select(compOf(s)); }
  if ((b = q('[data-aud]'))) { const a = b.dataset.aud, i = a.indexOf(':'), kind = a.slice(0, i), n = a.slice(i + 1); return audition(kind === 'music' ? `/assets/music/${n}.mp3` : kind === 'kho' ? avsUrl('/api/media/kho/file?rel=' + encodeURIComponent(n)) : sfxUrl(n), a); }
  if ((b = q('[data-mymus]'))) return useMyMusic(b.dataset.rel, b.dataset.mymus);
  if ((b = q('[data-addmusic]'))) return addMusic(b.dataset.addmusic);
  if ((b = q('[data-addsfx]'))) return addSfx(b.dataset.addsfx);
  if (q('[data-pact="autosfx"]')) return autoSfx();
  if (q('#addtext')) return addText();
  if (q('[data-trall]')) return libAct('trans', sel?.obj.transition?.type || 'fade', 'all');
  if (q('[data-flall]')) { const k = sel?.kind === 'clip' ? clipLayout()[sel.idx] : clipAtT(T); setFilter(0, k?.c.filter?.preset || '', true); return toast('Đã áp dụng cho mọi clip'); }
});
$('#libbody').addEventListener('input', e => {
  if (e.target.dataset.transdur != null) {
    transDur = +e.target.value; $('#tdv').textContent = transDur.toFixed(2) + 's';
    if (sel?.kind === 'clip' && sel.obj.transition) { pushUndo('transdur'); sel.obj.transition.dur = r2(transDur); changed(); }
  }
});
$('#libbody').addEventListener('dragstart', e => { const b = e.target.closest('[data-tr]'); if (b) { e.dataTransfer.setData('text/x-trans', b.dataset.tr); e.dataTransfer.effectAllowed = 'copy'; } });
$('#search').addEventListener('input', e => { query = e.target.value; if (!(panel === 'media' && mediaTab === 'broll')) renderPanel(); });
$('#search').addEventListener('keydown', async e => {
  if (e.key !== 'Enter' || panel !== 'media' || mediaTab === 'kho') return;
  mediaTab = 'broll'; $('#libbody').innerHTML = '<div class="loading"><i class="ti ti-loader-2 spin"></i> Đang tìm…</div>';
  BRES = await api('/api/broll?q=' + encodeURIComponent(query)); renderPanel();
});
