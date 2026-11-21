// Product Brain (ROADMAP M18, references/products.md): hồ sơ sản phẩm dùng chung nhiều dự án ($AVS_HOME/products/<id>.json).
// Panel "Sản phẩm": danh sách hồ sơ, sửa claim kèm bằng chứng + trạng thái duyệt, cụm từ cấm, FAQ; "Dùng cho dự án" đặt
// TL.ads.product để scripts/ad_gates.py đối chiếu claim của hồ sơ khi Kiểm tra chất lượng.
// "Điền bằng AI" (M91, trợ lý product của 05_assist.js): từ ảnh và/hoặc link đề xuất tên, giá, ngành, điểm mạnh/claim (luôn Chờ duyệt,
// kèm cờ rủi ro của ad_gates.py), FAQ; Nhận mới thêm vào form, Lưu mới ghi hồ sơ.
'use strict';
(() => {
  const S = Studio, $ = s => document.querySelector(s), esc = S.esc;
  const IND = { '': '— chưa chọn —', general: 'Chung', cosmetics: 'Mỹ phẩm / chăm sóc da', supplements: 'Thực phẩm chức năng', food: 'Thực phẩm & đồ uống', finance: 'Tài chính', health_device: 'Thiết bị sức khoẻ' };
  const ST = { approved: 'Đã duyệt', pending: 'Chờ duyệt', prohibited: 'Cấm nói', expired: 'Hết hạn' };
  let LIST = null, EDIT = null, AI = null, AI_FOR = null, PIMG = null; // AI: ô Điền bằng AI của bản đang sửa; PIMG: ảnh chọn cho AI (không lưu)
  // ảnh của hồ sơ ($AVS_HOME/products/<id>/image.*): NEWIMG = ảnh chờ tải lên khi bấm Lưu, DROPIMG = bỏ ảnh đang có khi Lưu
  let NEWIMG = null, DROPIMG = false, IMG_FOR = null, IMG_URL = '';
  const IMG_MAX = 8 * 1024 * 1024;
  const css = document.createElement('style');
  css.textContent = `
  .pb-card { background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); padding: var(--space-3); margin: var(--space-2) 0; }
  .pb-card.cur { border-color: rgb(var(--color-accent-text)); box-shadow: inset 0 0 0 1px rgb(var(--color-accent-text)); background: rgb(var(--color-accent-soft) / .14); }
  .pb-title { font-size: var(--text-sm); }
  .pb-intro { margin-top: var(--space-1); }
  .pb-top { display: flex; gap: var(--space-2); align-items: flex-start; } .pb-top > div { min-width: 0; flex: 1; }
  .pb-top b { display: block; font-size: var(--text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pb-top small { color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); }
  .pb-n { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-2); font-size: var(--text-2xs); }
  .pb-n span { border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-xs); padding: 0 var(--space-1); color: rgb(var(--color-fg-muted)); }
  .pb-n .ok { color: rgb(var(--color-success)); } .pb-n .bad { color: rgb(var(--color-danger)); } .pb-n .warn { color: rgb(var(--color-warning)); }
  .pb-act { display: flex; gap: var(--space-1); margin-top: var(--space-2); } .pb-act button { padding: var(--space-1) var(--space-2); font-size: var(--text-2xs); } .pb-act .grow { flex: 1; }
  .pb-form label { display: block; font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); margin: var(--space-2) 0 var(--space-1); }
  .pb-form input, .pb-form select, .pb-form textarea { width: 100%; min-width: 0; box-sizing: border-box; }
  .pb-g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 var(--space-2); }
  .pb-cl { border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); padding: var(--space-2); margin: var(--space-2) 0; background: rgb(var(--color-surface)); display: grid; gap: var(--space-1); }
  .pb-cl .row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) var(--h-sm); gap: var(--space-1); align-items: center; }
  .pb-cl textarea { resize: vertical; }
  .pb-cl[data-st="approved"] { border-left: 4px solid rgb(var(--color-success)); } .pb-cl[data-st="prohibited"], .pb-cl[data-st="expired"] { border-left: 4px solid rgb(var(--color-danger)); }
  .pb-cl[data-st="pending"] { border-left: 4px solid rgb(var(--color-warning)); }
  .pb-faq { display: grid; grid-template-columns: minmax(0, 1fr) var(--h-sm); gap: var(--space-1); margin: var(--space-1) 0; }
  .pb-faq-qa { display: grid; gap: var(--space-1); }
  .pb-ai { margin-top: var(--space-2); padding-top: var(--space-2); border-top: 1px solid rgb(var(--color-line)); }
  .pb-aisrc { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-1); align-items: center; }
  .pb-pimg { display: flex; gap: var(--space-2); align-items: center; }
  .pb-pimg img, .pb-pimg .ph { width: 64px; height: 64px; flex: none; object-fit: contain; border-radius: var(--radius-sm); border: 1px solid rgb(var(--color-line)); background: rgb(var(--color-surface)); }
  .pb-pimg .ph { display: grid; place-items: center; color: rgb(var(--color-fg-subtle)); font-size: var(--text-lg); }
  .pb-pimg > div { display: flex; gap: var(--space-1); flex-wrap: wrap; min-width: 0; }
  .pb-imgname { display: block; margin-top: var(--space-1); font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); overflow-wrap: anywhere; }`;
  document.head.appendChild(css);

  const active = () => document.querySelector('#rail .on')?.dataset.p === 'products';
  const cur = () => S.TL?.ads?.product;
  async function load() { const r = await S.api('/api/products').catch(() => []); LIST = Array.isArray(r) ? r : []; if (active()) render(); return LIST; }

  // <pure:adsproduct> TL.ads sau khi trỏ dự án tới hồ sơ p (giữ ngành đã chọn); test scripts/tests/onboarding_saved.test.mjs
  const adsWithProduct = (ads, p) => { const a = ads || {}; return { ...a, on: true, product: p.id, ...(p.industry && !a.industry ? { industry: p.industry } : {}) }; };
  // </pure:adsproduct>
  // gắn hồ sơ p ({id, name, industry}) vào dự án đang mở (hoàn tác được); 02_onboarding.js gọi qua Studio.products.attach
  function attach(p) {
    if (!p?.id || !S.TL) return false;
    S.pushUndo('product'); S.TL.ads = adsWithProduct(S.TL.ads, p); S.changed();
    if (active()) render();
    fill();
    return true;
  }
  // M18: khối sản phẩm máy dựng (công thức gói, AI dựng, Tự lái) lấy tên, giá, ảnh từ hồ sơ dự án đang trỏ (53_products.core.js).
  // Gọi khi mở dự án, sau "Dựng tự động theo gói" (studio.js applyRecipe) và khi gắn hồ sơ. Mỗi khối điền một lần (cờ _prod).
  // one: một khối người dùng bấm "Điền lại theo hồ sơ" (87_prodimg.js) → điền riêng khối đó, kể cả khối tự thêm / đã điền
  async function fill(one) {
    const C = window.ProductsCore, id = cur();
    if (!C || !id || (!one && !C.needsFill(S.TL?.scenes, id))) return 0;
    const r = await S.api('/api/products/' + encodeURIComponent(id)).catch(() => null);
    if (!r || r.error || cur() !== id) return 0;
    // ảnh hồ sơ chép vào media/product_<id>.<ext> của dự án; hồ sơ chưa có ảnh: đổi ảnh ở Thuộc tính (87_prodimg.js)
    const img = r.image ? await S.api('/api/products/use-image', { id }).catch(() => null) : null;
    if (cur() !== id) return 0;
    const h = C.heroOf(r, { logo: S.TL.brand?.logo, image: img?.image || '' });
    const n = one ? +C.fillScene(one, h, undefined, true) : C.fillScenes(S.TL.scenes, h);
    if (n) { S.changed(true); S.toast(`Graphic sản phẩm lấy tên, giá theo hồ sơ “${r.name}”`); }
    return n;
  }
  // vừa lưu ảnh cho hồ sơ dự án đang dùng: khối rv_product đã điền theo hồ sơ (cờ _prod) mà chưa có ảnh nhận ảnh này (một bước hoàn tác).
  // Chỉ ngay sau khi lưu, không ở mỗi lần mở: khối người dùng đã "Bỏ ảnh" giữ nguyên.
  async function fillImage(id) {
    const want = s => s?.type === 'rv_product' && s._prod === id && !s.locked && !s.image;
    if (cur() !== id || !(S.TL?.scenes || []).some(want)) return 0;
    const r = await S.api('/api/products/use-image', { id }).catch(() => null);
    if (!r?.image || cur() !== id) return 0;
    S.pushUndo('product');
    const n = S.TL.scenes.filter(want).map(s => (s.image = r.image)).length;
    S.changed(true); S.toast(`${n} graphic sản phẩm dùng ảnh mới của hồ sơ`);
    return n;
  }
  S.onReady(() => setTimeout(fill, 0)); // sau khối _starter của studio.js (áp công thức gói lần mở đầu)
  function use(id) {
    const p = LIST.find(x => x.id === id); if (!p) return;
    attach(p);
    S.toast(`Dự án dùng hồ sơ “${p.name}”: Kiểm tra chất lượng sẽ đối chiếu claim của hồ sơ`);
  }
  function unuse() { S.pushUndo('product'); const { product, ...a } = S.TL.ads || {}; S.TL.ads = a; S.changed(); render(); S.toast('Dự án không còn trỏ tới hồ sơ sản phẩm'); }

  function card(p) {
    const c = p.claims || {};
    return `<div class="pb-card ${cur() === p.id ? 'cur' : ''}"><div class="pb-top"><div><b>${esc(p.name)}</b>
      <small>${esc([p.brand, IND[p.industry || ''] && p.industry ? IND[p.industry] : ''].filter(Boolean).join(' · ') || p.id)}</small></div>${cur() === p.id ? '<span class="pill">đang dùng</span>' : ''}</div>
      <div class="pb-n"><span class="ok">${c.approved || 0} đã duyệt</span>${c.pending ? `<span class="warn">${c.pending} chờ duyệt</span>` : ''}${c.prohibited ? `<span class="bad">${c.prohibited} cấm</span>` : ''}${c.expired ? `<span class="bad">${c.expired} hết hạn</span>` : ''}
        ${p.blocked ? `<span>${p.blocked} cụm cấm</span>` : ''}${p.faq ? `<span>${p.faq} FAQ</span>` : ''}</div>
      <div class="pb-act">${cur() === p.id ? '<button data-pbu=""><i class="ti ti-unlink"></i> Bỏ khỏi dự án</button>' : `<button class="primary" data-pbu="${esc(p.id)}"><i class="ti ti-check"></i> Dùng cho dự án</button>`}<span class="grow"></span>
        <button class="icon" title="Sửa" data-pbe="${esc(p.id)}"><i class="ti ti-pencil"></i></button><button class="icon danger" title="Xoá" data-pbx="${esc(p.id)}"><i class="ti ti-trash"></i></button></div></div>`;
  }
  const claimRow = c => `<div class="pb-cl" data-st="${esc(c.status || 'pending')}" data-cid="${esc(c.id || '')}">
    <textarea data-f="text" rows="2" placeholder="Câu claim, ví dụ: Đầu nhỏ giọt giúp kiểm soát lượng dùng">${esc(c.text || '')}</textarea>
    <div class="row"><select data-f="status" title="Trạng thái duyệt">${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${(c.status || 'pending') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <input type="date" data-f="expires" value="${esc(c.expires || '')}" title="Hết hạn ngày (để trống = không hết hạn)">
      <button class="icon danger" data-pbdel title="Xoá claim"><i class="ti ti-x"></i></button></div>
    <input data-f="evidence" value="${esc(c.evidence || '')}" placeholder="Bằng chứng (bắt buộc khi đã duyệt): số giấy chứng nhận, báo cáo…">
    <input data-f="source" value="${esc(c.source || '')}" placeholder="Nguồn / link tài liệu (tuỳ chọn)"></div>`;
  const faqRow = f => `<div class="pb-faq"><div class="pb-faq-qa"><input data-f="q" value="${esc(f.q || '')}" placeholder="Câu hỏi khách hay hỏi"><textarea data-f="a" rows="2" placeholder="Câu trả lời đúng">${esc(f.a || '')}</textarea></div>
    <button class="icon danger" data-pbdel title="Xoá"><i class="ti ti-x"></i></button></div>`;
  function form() {
    const p = EDIT;
    return `<div class="pb-card pb-form"><b class="pb-title">${p.id ? 'Sửa hồ sơ sản phẩm' : 'Hồ sơ sản phẩm mới'}</b>
      <label>Tên sản phẩm</label><input id="pb-name" value="${esc(p.name || '')}" placeholder="VD: Serum B5 đầu nhỏ giọt">
      <label>Giá <span class="muted">· ghi như muốn hiện, ví dụ 350.000đ</span></label><input id="pb-price" value="${esc(p.price || '')}" placeholder="350.000đ">
      <label>Ảnh sản phẩm <span class="muted">· graphic sản phẩm của Tự lái và AI dựng dùng ảnh này</span></label><div id="pb-imgbox">${imgBox()}</div>
      <input type="file" id="pb-pimgf" accept="image/png,image/jpeg,image/webp" hidden>
      <div class="pb-g2"><div><label>Thương hiệu</label><input id="pb-brand" value="${esc(p.brand || '')}"></div>
        <div><label>Ngành</label><select id="pb-ind">${Object.entries(IND).map(([k, v]) => `<option value="${k}" ${(p.industry || '') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
      <label>Claim <span class="muted">· claim “Đã duyệt” phải có bằng chứng; quá ngày hết hạn thì tính là hết hạn</span></label>
      <div id="pb-claims">${(p.claims || []).map(claimRow).join('')}</div><button class="mini" id="pb-addc"><i class="ti ti-plus"></i> Thêm claim</button>
      <label>Cụm từ không được dùng <span class="muted">· mỗi dòng một cụm (tên đối thủ, từ cấm của ngành…)</span></label>
      <textarea id="pb-blocked" rows="3">${esc((p.blocked || []).join('\n'))}</textarea>
      <label>FAQ <span class="muted">· câu trả lời chuẩn để viết kịch bản</span></label>
      <div id="pb-faqs">${(p.faq || []).map(faqRow).join('')}</div><button class="mini" id="pb-addf"><i class="ti ti-plus"></i> Thêm câu hỏi</button>
      <label>Ghi chú</label><textarea id="pb-notes" rows="2">${esc(p.notes || '')}</textarea>
      ${S.assistPanel ? `<div class="pb-ai" id="pb-aiwrap"><label>Điền bằng AI <span class="muted">· từ ảnh sản phẩm và/hoặc link trang bán</span></label>
        <div class="pb-aisrc"><input id="pb-url" placeholder="https://… (không bắt buộc)" aria-label="Link sản phẩm"><button class="mini" id="pb-imgbtn"><i class="ti ti-photo"></i> ${PIMG ? 'Đổi ảnh' : 'Chọn ảnh'}</button></div>
        <input type="file" id="pb-img" accept="image/*" hidden><small class="pb-imgname" id="pb-imgname">${PIMG ? esc(PIMG.name) : ''}</small><div id="pb-ai"></div></div>` : ''}
      <div class="pb-act"><button class="primary" id="pb-save"><i class="ti ti-device-floppy"></i> Lưu</button><button id="pb-cancel">Huỷ</button></div></div>`;
  }
  function imgBox() {
    if (IMG_URL) { URL.revokeObjectURL(IMG_URL); IMG_URL = ''; }
    const has = NEWIMG || (EDIT.image && !DROPIMG);
    const src = NEWIMG ? (IMG_URL = URL.createObjectURL(NEWIMG)) : has ? avsUrl(`/api/products/image?id=${encodeURIComponent(EDIT.id)}&v=${encodeURIComponent(EDIT.updated || '')}`) : ''; // thẻ img không gửi header token (studio/auth.js)
    return `<div class="pb-pimg">${src ? `<img src="${esc(src)}" alt="Ảnh sản phẩm">` : '<span class="ph"><i class="ti ti-photo"></i></span>'}
      <div><button class="mini" data-pbimg="up"><i class="ti ti-upload"></i> ${has ? 'Đổi ảnh' : 'Tải ảnh lên'}</button>${has ? '<button class="mini" data-pbimg="drop"><i class="ti ti-x"></i> Bỏ ảnh</button>' : ''}
      ${PIMG && PIMG !== NEWIMG ? '<button class="mini" data-pbimg="ai" title="Ảnh đã chọn ở Điền bằng AI"><i class="ti ti-photo-check"></i> Dùng ảnh của AI</button>' : ''}</div></div>
      ${NEWIMG ? `<small class="pb-imgname">${esc(NEWIMG.name)} · lưu khi bấm Lưu</small>` : DROPIMG && EDIT.image ? '<small class="pb-imgname">Bỏ ảnh khi bấm Lưu</small>' : ''}`;
  }
  const redrawImg = () => { const b = $('#pb-imgbox'); if (b) b.innerHTML = imgBox(); };
  function takeImg(f) {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return S.toast('Chỉ nhận ảnh PNG, JPG hoặc WebP');
    if (f.size > IMG_MAX) return S.toast('Ảnh sản phẩm tối đa 8 MB');
    NEWIMG = f; DROPIMG = false; redrawImg();
  }
  function collect() {
    const v = el => el.value.trim();
    const claims = [...document.querySelectorAll('#pb-claims .pb-cl')].map(r => ({ id: r.dataset.cid || undefined, ...Object.fromEntries([...r.querySelectorAll('[data-f]')].map(i => [i.dataset.f, v(i)])) })).filter(c => c.text);
    const faq = [...document.querySelectorAll('#pb-faqs .pb-faq')].map(r => ({ q: v(r.querySelector('[data-f=q]')), a: v(r.querySelector('[data-f=a]')) })).filter(f => f.q);
    return { id: EDIT.id, created: EDIT.created, name: v($('#pb-name')), price: v($('#pb-price')), brand: v($('#pb-brand')), industry: $('#pb-ind').value, claims,
      blocked: $('#pb-blocked').value.split('\n').map(s => s.trim()).filter(Boolean), faq, notes: $('#pb-notes').value,
      ...(DROPIMG && !NEWIMG ? { image: '' } : {}) };
  }
  function render() {
    $('#libact').innerHTML = '<button class="icon" id="pb-new" title="Hồ sơ mới"><i class="ti ti-plus"></i></button>';
    $('#pb-new').onclick = () => { EDIT = { claims: [{ status: 'approved' }] }; render(); };
    if (!LIST) { $('#libbody').innerHTML = '<div class="help">Đang tải…</div>'; return; }
    const legacy = !cur() && (S.TL.ads?.claims?.length || S.TL.ads?.blocked?.length);
    $('#libbody').innerHTML = `<div class="help pb-intro">Claim, bằng chứng, từ cấm dùng chung cho mọi dự án. ${S.tip('Hồ sơ gồm claim kèm bằng chứng và trạng thái duyệt, cụm từ cấm, FAQ. Dự án trỏ tới một hồ sơ thì “Kiểm tra quảng cáo” đối chiếu theo hồ sơ, không cần nhập claim lại. Lưu trên máy ở ~/.ai-video-studio/products/.')}</div>
      ${EDIT ? form() : ''}
      ${LIST.map(card).join('') || (EDIT ? '' : '<div class="help">Chưa có hồ sơ nào.</div>')}
      <div class="pb-act"><button id="pb-new2"><i class="ti ti-plus"></i> Hồ sơ mới</button>${legacy ? '<button id="pb-fromproj" title="Lấy claim và cụm từ cấm đang nhập tay trong dự án này"><i class="ti ti-download"></i> Tạo từ claim của dự án</button>' : ''}</div>`;
    bind();
  }
  function bind() {
    const B = $('#libbody');
    $('#pb-new2').onclick = () => { EDIT = { claims: [{ status: 'approved' }] }; render(); };
    $('#pb-fromproj') && ($('#pb-fromproj').onclick = () => {
      const a = S.TL.ads || {};
      // claim nhập tay chưa có bằng chứng: để "Chờ duyệt", người dùng điền bằng chứng rồi chuyển "Đã duyệt"
      EDIT = { name: S.TL.brand?.name || S.META?.name || '', industry: a.industry || '', blocked: a.blocked || [],
        claims: (a.claims || []).map(c => ({ text: c.text, status: (c.status || 'approved') === 'approved' ? 'pending' : c.status })) };
      render();
    });
    B.querySelectorAll('[data-pbu]').forEach(b => (b.onclick = () => (b.dataset.pbu ? use(b.dataset.pbu) : unuse())));
    B.querySelectorAll('[data-pbe]').forEach(b => (b.onclick = async () => {
      const r = await S.api('/api/products/' + encodeURIComponent(b.dataset.pbe)); if (r.error) return S.toast(r.error);
      EDIT = r; render(); B.scrollTop = 0;
    }));
    B.querySelectorAll('[data-pbx]').forEach(b => (b.onclick = async () => {
      const p = LIST.find(x => x.id === b.dataset.pbx);
      if (!confirm(`Xoá hồ sơ “${p.name}”? Dự án đang trỏ tới hồ sơ này sẽ bị chặn xuất khi kiểm tra quảng cáo cho tới khi chọn hồ sơ khác.`)) return;
      const r = await S.api('/api/products/delete', { id: p.id }); if (r.error) return S.toast(r.error);
      await load();
    }));
    if (!EDIT) return;
    if (IMG_FOR !== EDIT) { IMG_FOR = EDIT; NEWIMG = null; DROPIMG = false; redrawImg(); }
    const pf = $('#pb-pimgf');
    pf.onchange = () => { const f = pf.files[0]; pf.value = ''; takeImg(f); };
    $('#pb-imgbox').onclick = e => {
      const a = e.target.closest('[data-pbimg]')?.dataset.pbimg;
      if (a === 'up') pf.click();
      else if (a === 'drop') { NEWIMG = null; DROPIMG = true; redrawImg(); }
      else if (a === 'ai') takeImg(PIMG);
    };
    mountAi();
    $('#pb-addc').onclick = () => $('#pb-claims').insertAdjacentHTML('beforeend', claimRow({ status: 'approved' }));
    $('#pb-addf').onclick = () => $('#pb-faqs').insertAdjacentHTML('beforeend', faqRow({}));
    $('#pb-cancel').onclick = () => { EDIT = null; render(); };
    $('#pb-save').onclick = async () => {
      const r = await S.api('/api/products/save', { product: collect() });
      if (r.error) return S.toast(r.error);
      if (NEWIMG) { // ảnh tải sau khi có id (hồ sơ mới); lỗi thì giữ form mở với ảnh chờ để thử lại
        const q = await fetch('/api/products/image?id=' + encodeURIComponent(r.id), { method: 'POST', body: NEWIMG }).then(x => x.json()).catch(e => ({ error: e.message }));
        if (q.error) { const f = NEWIMG; EDIT = r; IMG_FOR = r; NEWIMG = f; DROPIMG = false; await load(); return S.toast(`Đã lưu hồ sơ “${r.name}” · chưa lưu được ảnh: ${q.error}`); }
      }
      const img = !!NEWIMG;
      EDIT = null; NEWIMG = null; if (IMG_URL) { URL.revokeObjectURL(IMG_URL); IMG_URL = ''; } await load(); S.toast(`Đã lưu hồ sơ “${r.name}”`);
      if (img) fillImage(r.id);
    };
  }
  // ---- Điền bằng AI (M91): Nhận thì sửa thẳng ô của form (không vẽ lại form, giữ chữ đang gõ) ----
  function mountAi() {
    const host = $('#pb-ai'); if (!host) return;
    if (AI_FOR !== EDIT) { AI_FOR = EDIT; PIMG = null; AI = null; }
    const pick = $('#pb-img');
    $('#pb-imgbtn').onclick = () => pick.click();
    pick.onchange = () => {
      const f = pick.files[0]; if (!f || !/^image\//.test(f.type)) return; PIMG = f; $('#pb-imgname').textContent = f.name; $('#pb-imgbtn').innerHTML = '<i class="ti ti-photo"></i> Đổi ảnh';
      redrawImg(); // hiện nút "Dùng ảnh của AI"
    };
    AI ||= S.assistPanel({
      name: 'product', label: 'Điền bằng AI', hint: 'Tên, giá (giữ nguyên như nguồn), ngành, điểm mạnh, FAQ. Claim luôn ở Chờ duyệt kèm cờ rủi ro.',
      async input() {
        const inp = { url: $('#pb-url')?.value.trim() || '', name: $('#pb-name')?.value.trim() || '', brand: $('#pb-brand')?.value.trim() || '', industry: $('#pb-ind')?.value || '' };
        if (PIMG) inp.image = await S.imagePayload(PIMG, { max: 1024, type: 'image/jpeg', quality: 0.88 });
        if (!inp.image && !inp.url) throw new Error('Chọn ảnh sản phẩm hoặc dán link trước khi hỏi AI.');
        return inp;
      },
      current: f => ({ name: () => $('#pb-name')?.value, price: () => $('#pb-price')?.value, industry: () => IND[$('#pb-ind')?.value || ''] }[f.key]?.() || '').trim().replace(/^—.*—$/, ''),
      onAccept: f => {
        if (!$('#pb-name')) throw new Error('Form đã đóng');
        if (f.key === 'name') $('#pb-name').value = f.value;
        else if (f.key === 'price') $('#pb-price').value = f.value;
        else if (f.key === 'industry') $('#pb-ind').value = f.value;
        else if (f.kind === 'claim') $('#pb-claims').insertAdjacentHTML('beforeend', claimRow({ text: f.value.text, status: 'pending' }));
        else if (f.kind === 'faq') $('#pb-faqs').insertAdjacentHTML('beforeend', faqRow(f.value));
      },
    });
    AI.mount(host);
  }
  // gắn một lần (không gắn lại mỗi lần render): xoá dòng claim/FAQ, tô viền theo trạng thái
  document.addEventListener('click', e => { const d = e.target.closest?.('.pb-form [data-pbdel]'); if (d) d.closest('.pb-cl, .pb-faq').remove(); });
  document.addEventListener('change', e => { const s = e.target.closest?.('.pb-form [data-f=status]'); if (s) s.closest('.pb-cl').dataset.st = s.value; });
  // S22 M154: "Viết mô tả sản phẩm" của thanh Hỏi Claude (thay nút "Điền bằng AI" cuối panel): mở panel, sửa hồ sơ dự án đang trỏ
  // (chưa có thì hồ sơ mới), điền link nếu có rồi chạy ô Điền bằng AI; đề xuất ở ô đó, Nhận mới ghi vào form. → { started } | { need }
  async function ai(o = {}) {
    if (!active()) (window.openPanel || (id => S.workflow?.focus(id)))('products');
    if (!LIST) await load();
    if (!EDIT) {
      const r = cur() ? await S.api('/api/products/' + encodeURIComponent(cur())).catch(() => null) : null;
      EDIT = r && !r.error ? r : { claims: [] }; PIMG = null;
    }
    render(); $('#libbody').scrollTop = 0;
    const url = $('#pb-url'); if (url && o.url) url.value = String(o.url).slice(0, 300);
    if (!AI || (!PIMG && !url?.value.trim())) { url?.focus(); return { need: 'Dán link trang bán hoặc chọn ảnh sản phẩm rồi bấm Điền bằng AI.' }; }
    AI.start(); $('#pb-aiwrap')?.scrollIntoView({ block: 'nearest' });
    return { started: true };
  }
  S.products = { list: () => (LIST ? Promise.resolve(LIST) : load()), reload: load, ai, attach, current: cur, fill };
  S.addPanel('products', 'ti-package', 'Sản phẩm', () => { render(); load(); });
})();
