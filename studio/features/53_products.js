// Product Brain (ROADMAP M18, references/products.md): hồ sơ sản phẩm dùng chung nhiều dự án ($AVS_HOME/products/<id>.json).
// Panel "Sản phẩm": danh sách hồ sơ, sửa claim kèm bằng chứng + trạng thái duyệt, cụm từ cấm, FAQ; "Dùng cho dự án" đặt
// TL.ads.product để scripts/ad_gates.py đối chiếu claim của hồ sơ khi Kiểm tra chất lượng.
'use strict';
(() => {
  const S = Studio, $ = s => document.querySelector(s), esc = S.esc;
  const IND = { '': '— chưa chọn —', general: 'Chung', cosmetics: 'Mỹ phẩm / chăm sóc da', supplements: 'Thực phẩm chức năng', food: 'Thực phẩm & đồ uống', finance: 'Tài chính', health_device: 'Thiết bị sức khoẻ' };
  const ST = { approved: 'Đã duyệt', pending: 'Chờ duyệt', prohibited: 'Cấm nói', expired: 'Hết hạn' };
  let LIST = null, EDIT = null;
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
  .pb-cl textarea { resize: vertical; } .pb-form input[type=date] { color-scheme: dark; }
  .pb-cl[data-st="approved"] { border-left: 4px solid rgb(var(--color-success)); } .pb-cl[data-st="prohibited"], .pb-cl[data-st="expired"] { border-left: 4px solid rgb(var(--color-danger)); }
  .pb-cl[data-st="pending"] { border-left: 4px solid rgb(var(--color-warning)); }
  .pb-faq { display: grid; grid-template-columns: minmax(0, 1fr) var(--h-sm); gap: var(--space-1); margin: var(--space-1) 0; }
  .pb-faq-qa { display: grid; gap: var(--space-1); }`;
  document.head.appendChild(css);

  const active = () => document.querySelector('#rail .on')?.dataset.p === 'products';
  const cur = () => S.TL?.ads?.product;
  async function load() { const r = await S.api('/api/products').catch(() => []); LIST = Array.isArray(r) ? r : []; if (active()) render(); return LIST; }

  function use(id) {
    const p = LIST.find(x => x.id === id); if (!p) return;
    S.pushUndo('product');
    const a = S.TL.ads || {};
    S.TL.ads = { ...a, on: true, product: id, ...(p.industry && !a.industry ? { industry: p.industry } : {}) };
    S.changed(); render();
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
      <div class="pb-g2"><div><label>Thương hiệu</label><input id="pb-brand" value="${esc(p.brand || '')}"></div>
        <div><label>Ngành</label><select id="pb-ind">${Object.entries(IND).map(([k, v]) => `<option value="${k}" ${(p.industry || '') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
      <label>Claim <span class="muted">· claim “Đã duyệt” phải có bằng chứng; quá ngày hết hạn thì tính là hết hạn</span></label>
      <div id="pb-claims">${(p.claims || []).map(claimRow).join('')}</div><button class="mini" id="pb-addc"><i class="ti ti-plus"></i> Thêm claim</button>
      <label>Cụm từ không được dùng <span class="muted">· mỗi dòng một cụm (tên đối thủ, từ cấm của ngành…)</span></label>
      <textarea id="pb-blocked" rows="3">${esc((p.blocked || []).join('\n'))}</textarea>
      <label>FAQ <span class="muted">· câu trả lời chuẩn để viết kịch bản</span></label>
      <div id="pb-faqs">${(p.faq || []).map(faqRow).join('')}</div><button class="mini" id="pb-addf"><i class="ti ti-plus"></i> Thêm câu hỏi</button>
      <label>Ghi chú</label><textarea id="pb-notes" rows="2">${esc(p.notes || '')}</textarea>
      <div class="pb-act"><button class="primary" id="pb-save"><i class="ti ti-device-floppy"></i> Lưu</button><button id="pb-cancel">Huỷ</button></div></div>`;
  }
  function collect() {
    const v = el => el.value.trim();
    const claims = [...document.querySelectorAll('#pb-claims .pb-cl')].map(r => ({ id: r.dataset.cid || undefined, ...Object.fromEntries([...r.querySelectorAll('[data-f]')].map(i => [i.dataset.f, v(i)])) })).filter(c => c.text);
    const faq = [...document.querySelectorAll('#pb-faqs .pb-faq')].map(r => ({ q: v(r.querySelector('[data-f=q]')), a: v(r.querySelector('[data-f=a]')) })).filter(f => f.q);
    return { id: EDIT.id, created: EDIT.created, name: v($('#pb-name')), brand: v($('#pb-brand')), industry: $('#pb-ind').value, claims,
      blocked: $('#pb-blocked').value.split('\n').map(s => s.trim()).filter(Boolean), faq, notes: $('#pb-notes').value };
  }
  function render() {
    $('#libact').innerHTML = '<button class="icon" id="pb-new" title="Hồ sơ mới"><i class="ti ti-plus"></i></button>';
    $('#pb-new').onclick = () => { EDIT = { claims: [{ status: 'approved' }] }; render(); };
    if (!LIST) { $('#libbody').innerHTML = '<div class="help">Đang tải…</div>'; return; }
    const legacy = !cur() && (S.TL.ads?.claims?.length || S.TL.ads?.blocked?.length);
    $('#libbody').innerHTML = `<div class="help pb-intro">Hồ sơ sản phẩm dùng chung cho mọi dự án: claim kèm bằng chứng và trạng thái duyệt, cụm từ cấm, FAQ. Dự án trỏ tới một hồ sơ thì “Kiểm tra quảng cáo” đối chiếu theo hồ sơ, không cần nhập claim lại. Lưu ở <code>~/.ai-video-studio/products/</code>.</div>
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
    $('#pb-addc').onclick = () => $('#pb-claims').insertAdjacentHTML('beforeend', claimRow({ status: 'approved' }));
    $('#pb-addf').onclick = () => $('#pb-faqs').insertAdjacentHTML('beforeend', faqRow({}));
    $('#pb-cancel').onclick = () => { EDIT = null; render(); };
    $('#pb-save').onclick = async () => {
      const r = await S.api('/api/products/save', { product: collect() });
      if (r.error) return S.toast(r.error);
      EDIT = null; await load(); S.toast(`Đã lưu hồ sơ “${r.name}”`);
    };
  }
  // gắn một lần (không gắn lại mỗi lần render): xoá dòng claim/FAQ, tô viền theo trạng thái
  document.addEventListener('click', e => { const d = e.target.closest?.('.pb-form [data-pbdel]'); if (d) d.closest('.pb-cl, .pb-faq').remove(); });
  document.addEventListener('change', e => { const s = e.target.closest?.('.pb-form [data-f=status]'); if (s) s.closest('.pb-cl').dataset.st = s.value; });
  S.products = { list: () => (LIST ? Promise.resolve(LIST) : load()), reload: load };
  S.addPanel('products', 'ti-package', 'Sản phẩm', () => { render(); load(); });
})();
