// Lần đầu mở Studio (ROADMAP M83, references/studio.md): hướng dẫn 3 bước + trang chủ khi chưa mở dự án.
// - Hướng dẫn mở SAU màn tác giả (00_author.js, overlay #author) khi $AVS_HOME/onboarding.json chưa done/skipped.
//   (a) Thương hiệu → /api/brands/save + /api/brands/logo (51_brands); (b) Kho → /api/kho/create|set|pick-folder|upload (12_workspace,
//   S12/M97: Kho của thương hiệu vừa lưu, không cần dự án đang mở)
//   + /api/products/save (53_products); (c) Mục đích → /api/onboarding (02_onboarding.mjs).
//   Bước (a) có "Gợi ý bằng AI" (trợ lý brand), bước (b) có "Điền bằng AI" (trợ lý product): 05_assist.js, M91. Chỉ ghi khi bấm Nhận.
// - Trang chủ (#onb-home): 4 cách bắt đầu, mỗi thẻ mở đúng luồng có sẵn (Tự lái, Video mới + Mẫu, Cắt clip từ video dài, Hàng loạt)
//   + dự án gần đây. Tự hiện khi chưa mở dự án; nút nhà trên thanh trên mở lại. Studio.openOnboarding() / Studio.openHome().
// - S17 M125: Studio mở không kèm dự án (không còn dự án mẫu tự tạo). Chưa có thương hiệu: trang chủ nhắc bước Chuẩn bị và tự mở
//   hướng dẫn ở bước Thương hiệu (một lần mỗi phiên trình duyệt); "Xem thử dự án mẫu" chép sample/clip-mau rồi mở (/api/onboarding/sample).
'use strict';
(() => {
  const { esc, api, toast } = Studio;
  const PURPOSES = [
    ['bds', 'ti-building-estate', 'Bất động sản', 'BĐS'], ['khoahoc', 'ti-school', 'Khoá học', 'Khoá học'],
    ['banhang', 'ti-shopping-bag', 'Bán hàng', 'Bán hàng'], ['review', 'ti-star', 'Review', 'Review'],
    ['chiase', 'ti-message-circle', 'Chia sẻ kinh nghiệm', 'Chia sẻ'], ['tintuc', 'ti-news', 'Tin tức', 'Tin tức'],
    ['doanhnghiep', 'ti-building', 'Doanh nghiệp', 'Doanh nghiệp'], ['khac', 'ti-dots', 'Việc khác', 'Khác']];
  const ASPECTS = [['9:16', 'Dọc 9:16', 'TikTok, Reels, Shorts'], ['16:9', 'Ngang 16:9', 'YouTube, Facebook'], ['1:1', 'Vuông 1:1', 'Bài đăng Facebook, Instagram']];
  const PLATFORMS = [['tiktok', 'ti-brand-tiktok', 'TikTok'], ['youtube', 'ti-brand-youtube', 'YouTube'], ['facebook', 'ti-brand-facebook', 'Facebook'],
    ['instagram', 'ti-brand-instagram', 'Instagram'], ['zalo', 'ti-message-dots', 'Zalo']];
  const STEPS = ['Thương hiệu', 'Kho', 'Mục đích'];
  let ST = null, W = null, HOME = null, TPLS = null;

  const css = document.createElement('style');
  css.textContent = `
  .onb-ov { position: fixed; inset: 0; z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 16px;
    background: color-mix(in srgb, var(--bg0) 72%, transparent); backdrop-filter: blur(4px); }
  .onb-card { width: min(640px, 100%); max-height: calc(100vh - 32px); display: flex; flex-direction: column; background: var(--bg2); border: 1px solid var(--line2); border-radius: var(--r); overflow: hidden; }
  .onb-head { padding: 20px 24px 12px; }
  .onb-prog { display: flex; gap: 4px; margin-bottom: 12px; } .onb-prog i { flex: 1; height: 4px; border-radius: 4px; background: var(--bg4); } .onb-prog i.on { background: var(--acc); }
  .onb-kick { font-size: 12px; color: var(--tx3); margin: 0 0 4px; }
  .onb-head h2 { margin: 0; font-size: 22px; line-height: 1.3; } .onb-head p { margin: 4px 0 0; font-size: 13px; color: var(--tx2); }
  .onb-body { padding: 8px 24px 16px; overflow-y: auto; font-size: 13px; }
  .onb-foot { display: flex; gap: 8px; align-items: center; padding: 12px 24px; border-top: 1px solid var(--line); background: var(--bg1); }
  .onb-foot button { font-size: 13px; padding: 8px 16px; } .onb-foot .grow { flex: 1; }
  .onb-f { margin: 12px 0 0; } .onb-f > label { display: block; font-size: 12px; font-weight: 600; color: var(--tx); margin-bottom: 4px; }
  .onb-f > label em { font-style: normal; color: var(--tx3); font-weight: 400; }
  .onb-f input:not([type=color]), .onb-f textarea { width: 100%; padding: 8px 12px; font-size: 13px; background: var(--bg1); border: 1px solid var(--line2); border-radius: var(--r); }
  .onb-f textarea { min-height: 64px; resize: vertical; }
  .onb-f input:focus, .onb-f textarea:focus { outline: none; border-color: var(--acc-line); }
  .onb-hint { margin: 4px 0 0; font-size: 11px; color: var(--tx3); line-height: 1.4; } .onb-lead { margin: 0 0 8px; }
  .onb-err { margin: 12px 0 0; font-size: 12px; color: var(--bad); display: flex; gap: 4px; align-items: center; } .onb-err:empty { display: none; }
  .onb-g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 12px; } .onb-g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 12px; }
  .onb-drop { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px dashed var(--line3); border-radius: var(--r); background: var(--bg1); cursor: pointer; color: var(--tx2); font-size: 13px; }
  .onb-drop:hover, .onb-drop.over { border-color: var(--acc); color: var(--tx); } .onb-drop.off { opacity: .5; cursor: default; pointer-events: none; }
  .onb-drop > .ti { font-size: 22px; color: var(--tx3); } .onb-drop b { display: block; color: var(--tx); font-size: 13px; font-weight: 600; } .onb-drop span { font-size: 12px; color: var(--tx3); }
  .onb-logo { width: 56px; height: 56px; flex: none; border-radius: var(--r); background: var(--bg3); display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .onb-logo img { width: 100%; height: 100%; object-fit: contain; }
  .onb-sw { display: flex; gap: 8px; align-items: center; } .onb-sw input[type=color] { width: 40px; height: 32px; padding: 0; border: 1px solid var(--line2); border-radius: var(--r); background: none; cursor: pointer; }
  .onb-nosw { width: 40px; height: 32px; border: 1px dashed var(--line3); border-radius: var(--r); background: var(--bg1); }
  .onb-kho { cursor: default; } .onb-kho:hover { border-color: var(--line3); color: var(--tx2); } .onb-kp { min-width: 0; flex: 1; } .onb-kp b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .onb-kacts { margin-top: 8px; } .onb-sw #onb-kdir { flex: 1; min-width: 0; }
  .onb-files { list-style: none; margin: 8px 0 0; padding: 0; font-size: 12px; } .onb-files li { display: flex; gap: 8px; align-items: center; padding: 4px 0; color: var(--tx2); }
  .onb-files li .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .onb-files .ok { color: var(--ok); } .onb-files .bad { color: var(--bad); }
  .onb-pick { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .onb-pick button, .onb-seg button, .onb-chips button { flex-direction: column; justify-content: center; gap: 4px; padding: 12px 8px; font-size: 12px; border-radius: var(--r); background: var(--bg1); color: var(--tx2); text-align: center; }
  .onb-pick button .ti { font-size: 22px; } .onb-pick button.on, .onb-seg button.on, .onb-chips button.on { border-color: var(--acc); color: var(--tx); background: var(--acc-soft); }
  .onb-seg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; } .onb-seg small { font-size: 11px; color: var(--tx3); }
  .onb-chips { display: flex; flex-wrap: wrap; gap: 8px; } .onb-chips button { flex-direction: row; padding: 8px 12px; }
  .onb-note { margin: 16px 0 0; padding: 12px; border-radius: var(--r); background: var(--bg1); border: 1px solid var(--line); font-size: 12px; color: var(--tx2); display: flex; gap: 8px; line-height: 1.5; }
  .onb-note .ti { color: var(--tx3); }
  #onb-home { position: fixed; inset: 0; z-index: 40; overflow-y: auto; background: var(--bg0); }
  #onb-home .in { max-width: 880px; margin: 0 auto; padding: 48px 16px 32px; }
  #onb-home .hd { display: flex; align-items: flex-start; gap: 12px; } #onb-home .hd .grow { flex: 1; }
  #onb-home h1 { margin: 0; font-size: 22px; } #onb-home .sub { margin: 4px 0 0; color: var(--tx2); font-size: 13px; }
  #onb-home .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 24px; }
  #onb-home .card { all: unset; box-sizing: border-box; cursor: pointer; display: flex; gap: 16px; align-items: flex-start; padding: 20px; border-radius: var(--r); background: var(--bg2); border: 1px solid var(--line); }
  #onb-home .card:hover, #onb-home .card:focus-visible { border-color: var(--acc-line); background: var(--bg3); }
  #onb-home .card .ic { width: 48px; height: 48px; flex: none; border-radius: var(--r); background: var(--acc-soft); color: var(--acc); display: flex; align-items: center; justify-content: center; }
  #onb-home .card .ic .ti { font-size: 22px; } #onb-home .card b { display: block; font-size: 15px; margin-bottom: 4px; color: var(--tx); }
  #onb-home .card span { font-size: 12px; color: var(--tx2); line-height: 1.5; display: block; } #onb-home .card small { display: block; margin-top: 8px; font-size: 11px; color: var(--tx3); }
  #onb-home h3 { margin: 32px 0 8px; font-size: 13px; color: var(--tx2); font-weight: 600; }
  #onb-home .rec { display: flex; flex-direction: column; gap: 4px; }
  #onb-home .rec button { justify-content: flex-start; gap: 12px; padding: 12px; font-size: 13px; background: var(--bg1); border-color: var(--line); border-radius: var(--r); text-align: left; }
  #onb-home .rec button .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } #onb-home .rec small { font-size: 11px; color: var(--tx3); }
  #onb-home .empty { font-size: 12px; color: var(--tx3); padding: 12px; border: 1px dashed var(--line2); border-radius: var(--r); }
  #onb-home .prep { display: flex; gap: 12px; align-items: center; margin-top: 24px; padding: 12px 16px; border-radius: var(--r); background: var(--acc-soft); border: 1px solid var(--acc-line); font-size: 13px; color: var(--tx); }
  #onb-home .prep .ti { font-size: 22px; color: var(--acc); flex: none; } #onb-home .prep div { flex: 1; min-width: 0; } #onb-home .prep small { display: block; color: var(--tx2); font-size: 12px; margin-top: 2px; }
  #onb-home .prep button { flex: none; font-size: 13px; }
  @media (max-width: 720px) { #onb-home .prep { flex-wrap: wrap; } }
  #onb-home .links { display: flex; gap: 8px; margin-top: 24px; flex-wrap: wrap; } #onb-home .links button { font-size: 12px; }
  @media (max-width: 720px) { #onb-home .cards, .onb-g2, .onb-g3 { grid-template-columns: minmax(0, 1fr); } .onb-pick { grid-template-columns: repeat(2, minmax(0, 1fr)); } }`;
  document.head.appendChild(css);

  const loadState = async () => { const r = await api('/api/onboarding'); if (r && !r.error) ST = r; return ST; };
  const saveState = async patch => { const r = await api('/api/onboarding', patch); if (r.error) throw new Error(r.error); ST = r; return r; };
  const templates = async () => TPLS || (TPLS = await api('/api/templates').then(t => (Array.isArray(t) ? t : [])).catch(() => []));
  const fmtDay = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }); };
  const purpose = id => PURPOSES.find(p => p[0] === id);
  // Drop zones stop the event so the editor's window-level drop handler does not also upload the file into the project.
  function dropzone(el, onFiles) {
    el.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); el.classList.remove('over'); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); });
    const inp = el.querySelector('input[type=file]');
    el.addEventListener('click', e => { if (e.target !== inp) inp.click(); });
    inp.addEventListener('change', () => { if (inp.files.length) onFiles([...inp.files]); inp.value = ''; });
  }

  // Two dominant colours of a logo: 64×64 canvas, 12-bit colour bins, near-white/black and transparent pixels barely count.
  async function logoColors(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Không đọc được ảnh logo')); i.src = url; });
      const n = 64, c = document.createElement('canvas'); c.width = c.height = n;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, n, n);
      const d = g.getImageData(0, 0, n, n).data, bins = new Map();
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        const r = d[i], gr = d[i + 1], b = d[i + 2], mx = Math.max(r, gr, b), sat = mx ? (mx - Math.min(r, gr, b)) / mx : 0;
        const w = sat < 0.15 && (mx > 235 || mx < 25) ? 0.05 : 1 + sat;
        const k = ((r >> 4) << 8) | ((gr >> 4) << 4) | (b >> 4), e = bins.get(k) || { w: 0, r: 0, g: 0, b: 0 };
        e.w += w; e.r += r * w; e.g += gr * w; e.b += b * w; bins.set(k, e);
      }
      const out = [];
      for (const e of [...bins.values()].sort((a, b) => b.w - a.w)) {
        const c3 = [e.r / e.w, e.g / e.w, e.b / e.w];
        if (out.every(o => Math.hypot(o[0] - c3[0], o[1] - c3[1], o[2] - c3[2]) > 60)) out.push(c3);
        if (out.length === 2) break;
      }
      return out.map(c3 => '#' + c3.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''));
    } finally { URL.revokeObjectURL(url); }
  }

  // ---------- wizard ----------
  async function openWizard(step) {
    closeWizard();
    await loadState();
    const brands = await api('/api/brands').catch(() => []);
    const kit = (Array.isArray(brands) ? brands : []).find(b => b.id === ST?.brand) || null;
    W = { step: Math.min(step ?? ST?.step ?? 0, 2), kit, logoFile: null, logoUrl: kit?.logoUrl ? avsUrl(kit.logoUrl) : '', colors: [kit?.primary || '', kit?.accent || ''],
      name: kit?.title || kit?.name || '', phone: kit?.phone || '', website: kit?.website || '', handle: kit?.handle || '',
      files: [], uploading: 0, kho: null, product: { name: '', price: '', strengths: '', faq: [], industry: '' }, extra: {}, pImage: null, pUrl: '', bAi: null, pAi: null,
      purpose: ST?.purpose || '', aspect: ST?.aspect || '9:16', platforms: [...(ST?.platforms || [])], busy: false };
    const ov = document.createElement('div');
    ov.className = 'onb-ov'; ov.id = 'onb-wiz';
    ov.innerHTML = '<div class="onb-card" role="dialog" aria-modal="true" aria-labelledby="onb-title"></div>';
    for (const ev of ['dragover', 'drop']) ov.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); });
    document.body.appendChild(ov);
    render();
  }
  function closeWizard() { document.getElementById('onb-wiz')?.remove(); W = null; }

  function render() {
    const box = document.querySelector('#onb-wiz .onb-card'); if (!box || !W) return;
    const s = W.step, heads = [
      ['Thương hiệu của bạn', 'Tên và logo sẽ hiện trên mọi video. Màu chủ đạo tự lấy từ logo.'],
      ['Kho của thương hiệu', 'Một thư mục trên máy chứa video quay, ảnh, nhạc và logo; mọi video sau lấy file từ đây. Bước này không bắt buộc.'],
      ['Bạn làm video để làm gì?', 'Studio gợi ý gói style, mẫu và khổ hình hợp với bạn.']];
    box.innerHTML = `<div class="onb-head"><div class="onb-prog">${STEPS.map((_, i) => `<i class="${i <= s ? 'on' : ''}"></i>`).join('')}</div>
      <p class="onb-kick">Bước ${s + 1}/3 · ${STEPS[s]}</p><h2 id="onb-title">${heads[s][0]}</h2><p>${heads[s][1]}</p></div>
      <div class="onb-body">${[stepBrand, stepAssets, stepPurpose][s]()}<p class="onb-err" id="onb-err"></p></div>
      <div class="onb-foot"><button class="ghost" data-o="skip">Bỏ qua hướng dẫn</button><span class="grow"></span>
        ${s ? '<button data-o="back"><i class="ti ti-arrow-left"></i> Quay lại</button>' : ''}
        <button class="primary" data-o="next" ${W.busy ? 'disabled' : ''}>${W.busy ? '<i class="ti ti-loader-2 spin"></i> Đang lưu…' : s === 2 ? '<i class="ti ti-check"></i> Xong' : 'Tiếp <i class="ti ti-arrow-right"></i>'}</button></div>`;
    box.querySelector('[data-o=skip]').onclick = skip;
    box.querySelector('[data-o=back]')?.addEventListener('click', () => { W.step--; render(); });
    box.querySelector('[data-o=next]').onclick = next;
    [wireBrand, wireAssets, wirePurpose][s](box);
  }
  const err = m => { const e = document.getElementById('onb-err'); if (e) e.innerHTML = m ? `<i class="ti ti-alert-circle"></i> ${esc(m)}` : ''; };
  const field = (id, label, hint, input) => `<div class="onb-f"><label for="${id}">${label}</label>${input}<p class="onb-hint">${hint}</p></div>`;
  const text = (id, val, ph, type = 'text') => `<input id="${id}" type="${type}" value="${esc(val)}" placeholder="${esc(ph)}">`;

  const stepBrand = () => field('onb-name', 'Tên thương hiệu', 'Tên hiện trên video, ví dụ phần giới thiệu và lời kêu gọi cuối video.', text('onb-name', W.name, 'Ví dụ: Nhà Đẹp Sài Gòn')) +
    `<div class="onb-f"><label>Logo</label><div class="onb-drop" id="onb-logo-drop" role="button" tabindex="0"><div class="onb-logo">${W.logoUrl ? `<img src="${esc(W.logoUrl)}" alt="Logo">` : '<i class="ti ti-photo"></i>'}</div>
      <div><b>${W.logoUrl ? 'Đổi logo' : 'Kéo thả logo vào đây'}</b><span>hoặc bấm để chọn ảnh PNG, JPG, WebP, SVG</span></div><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></div>
      <p class="onb-hint">Logo nền trong suốt (PNG) hiện đẹp nhất trên video.</p></div>` +
    `<div class="onb-f"><label>Màu chủ đạo</label><div class="onb-sw">${W.colors[0] ? `<input type="color" id="onb-c1" value="${esc(W.colors[0])}" aria-label="Màu chính">
      <input type="color" id="onb-c2" value="${esc(W.colors[1] || W.colors[0])}" aria-label="Màu nhấn">` : '<span class="onb-nosw"></span><span class="onb-nosw"></span>'}</div>
      <p class="onb-hint">${W.colors[0] ? 'Lấy từ logo. Bấm vào ô màu để đổi.' : 'Tự lấy sau khi có logo.'}</p></div>` +
    (Studio.assistPanel ? '<div id="onb-ai-brand"></div>' : '') +
    `<div class="onb-g3">${field('onb-phone', 'Số điện thoại <em>(không bắt buộc)</em>', 'Hiện ở lời kêu gọi cuối video.', text('onb-phone', W.phone, '0901 234 567', 'tel'))}
      ${field('onb-web', 'Website <em>(không bắt buộc)</em>', 'Ví dụ: nhadep.vn', text('onb-web', W.website, 'nhadep.vn'))}
      ${field('onb-handle', 'Tên kênh <em>(không bắt buộc)</em>', 'Ví dụ: @nhadep', text('onb-handle', W.handle, '@nhadep'))}</div>`;
  function wireBrand(box) {
    // box (.onb-card) sống qua mọi bước, listener cộng dồn: chỉ đọc ô khi đang ở bước này
    const sync = () => { if (W?.step !== 0 || !box.querySelector('#onb-name')) return; W.name = box.querySelector('#onb-name').value; W.phone = box.querySelector('#onb-phone').value; W.website = box.querySelector('#onb-web').value; W.handle = box.querySelector('#onb-handle').value;
      const c1 = box.querySelector('#onb-c1'), c2 = box.querySelector('#onb-c2'); if (c1) W.colors[0] = c1.value; if (c2) W.colors[1] = c2.value; };
    box.addEventListener('input', sync);
    mountBrandAi(box, sync);
    const dz = box.querySelector('#onb-logo-drop');
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dz.querySelector('input').click(); } });
    dropzone(dz, async files => {
      const f = files.find(x => /^image\//.test(x.type)); if (!f) return err('Logo phải là ảnh (PNG, JPG, WebP hoặc SVG).');
      if (f.size > 10 * 1024 * 1024) return err('Logo lớn quá 10 MB, chọn ảnh nhỏ hơn.');
      sync(); W.logoFile = f; if (W.logoUrl.startsWith('blob:')) URL.revokeObjectURL(W.logoUrl); W.logoUrl = URL.createObjectURL(f);
      try { const c = await logoColors(f); if (c[0]) W.colors = [c[0], c[1] || c[0]]; } catch { /* màu để trống: gói style dùng màu mặc định */ }
      render();
    });
  }
  // M91: trợ lý Thương hiệu. Màu chính/nhấn vào hai ô màu; nền tối, chữ sáng, font, giọng văn, slogan, CTA, chữ màn kết lưu cùng bộ nhận diện.
  const AI_COLOR = { primary: 0, accent: 1 };
  const fontLabel = v => String(v || '').split(',')[0].replace(/"/g, '');
  function mountBrandAi(box, sync) {
    const host = box.querySelector('#onb-ai-brand'); if (!host) return;
    W.bAi ||= Studio.assistPanel({
      name: 'brand', label: 'Gợi ý bằng AI', hint: 'AI xem logo (và website nếu có) rồi đề xuất vai trò màu, font tiếng Việt, giọng văn, slogan, CTA, chữ màn kết.',
      async input() {
        sync();
        const inp = { name: W.name.trim(), website: W.website.trim(), colors: W.colors.filter(Boolean) };
        const src = W.logoFile || (W.kit?.logoUrl ? await fetch(avsUrl(W.kit.logoUrl)).then(r => r.blob()) : null);
        if (src) inp.image = await Studio.imagePayload(src);
        inp.industry = purpose(ST?.purpose)?.[2] || '';
        if (!inp.image && !inp.website && !inp.name) throw new Error('Thêm logo, tên hoặc website trước khi hỏi AI.');
        return inp;
      },
      current: f => (f.key in AI_COLOR ? W.colors[AI_COLOR[f.key]] : f.kind === 'font' ? fontLabel(W.extra[f.key]) : W.extra[f.key]) || '',
      onAccept: f => {
        if (f.key in AI_COLOR) { const i = AI_COLOR[f.key]; W.colors[i] = f.value; if (!W.colors[1 - i]) W.colors[1 - i] = f.value; }
        else W.extra[f.key] = f.value;
        render();
      },
    });
    W.bAi.mount(host);
  }
  async function saveBrand() {
    if (!W.name.trim()) throw new Error('Nhập tên thương hiệu.');
    if (!W.logoFile && !W.kit?.logoUrl) throw new Error('Thêm logo để tiếp tục.');
    const brand = { title: W.name.trim(), name: W.name.trim(), phone: W.phone.trim(), website: W.website.trim(), handle: W.handle.trim() };
    if (W.kit) brand.id = W.kit.id;
    if (W.colors[0]) { brand.primary = W.colors[0]; brand.accent = W.colors[1] || W.colors[0]; }
    Object.assign(brand, W.extra); // đề xuất AI đã Nhận (dark, light, font, disp, voice, slogan, cta, outro)
    let b = await api('/api/brands/save', { brand });
    if (b.error) throw new Error(b.error);
    if (W.logoFile) {
      const r = await fetch(`/api/brands/logo?id=${encodeURIComponent(b.id)}&name=${encodeURIComponent(W.logoFile.name)}`, { method: 'POST', body: W.logoFile });
      b = await r.json(); if (!r.ok || b.error) throw new Error(b.error || 'Không tải được logo lên');
      W.logoFile = null;
    }
    if (W.kit?.id !== b.id) W.kho = null; // Kho theo thương hiệu: đổi thương hiệu thì đọc lại
    W.kit = b;
    await saveState({ brand: b.id, step: 1 });
    // "Đang dùng": with a project open, apply the kit to it the same way the Thương hiệu panel does (undoable).
    if (Studio.TL && Studio._isReady) {
      const r = await api('/api/brands/apply', { id: b.id });
      if (!r.error) { Studio.pushUndo('brandkit'); Studio.TL.brand = { ...(Studio.TL.brand || {}), ...r.brand }; Studio.changed(); }
    }
  }

  // S12 (M97): Kho của thương hiệu vừa lưu: tạo thư mục mặc định, hoặc chọn thư mục có sẵn (dán đường dẫn / hộp chọn thư mục), rồi tải lên.
  const khoBrand = () => W.kit?.id || '';
  const stepKho = () => {
    const K = W.kho;
    if (!K) return '<div class="onb-f"><label>Kho</label><p class="onb-hint"><i class="ti ti-loader-2 spin"></i> Đang mở Kho…</p></div>';
    if (K.error) return `<div class="onb-f"><label>Kho</label><p class="onb-err"><i class="ti ti-alert-circle"></i> ${esc(K.error)}</p></div>`;
    const ws = K.ws, st = { up: '<i class="ti ti-loader-2 spin"></i>', ok: '<i class="ti ti-circle-check ok"></i>', bad: '<i class="ti ti-alert-circle bad"></i>' };
    const pick = `<div class="onb-f"><label for="onb-kdir">Thư mục có sẵn</label><div class="onb-sw"><input id="onb-kdir" value="${esc(K.dir ?? (ws.custom ? ws.root : ''))}" placeholder="Ví dụ D:\\Videos\\Nha Dep" spellcheck="false">
        <button type="button" id="onb-kpick"><i class="ti ti-folder-search"></i> Chọn…</button><button type="button" class="primary" id="onb-kset" ${K.busy ? 'disabled' : ''}>Dùng</button></div>
        <p class="onb-hint">Studio chỉ đọc và phân nhóm file theo đuôi, không chép, không đòi đúng cấu trúc thư mục con.</p></div>`;
    return `<div class="onb-f"><label>Thư mục Kho${ws.exists ? '' : ' <em>(chưa tạo)</em>'}</label><div class="onb-drop onb-kho" title="${esc(ws.root)}"><i class="ti ti-folder"></i><div class="onb-kp"><b>${esc(ws.root)}</b>
        <span>${ws.exists ? (ws.custom ? 'Thư mục bạn chọn' : 'Thư mục mặc định') : 'Sẽ tạo sẵn Nguon, Anh, BRoll, Nhac, Thuong hieu'}</span></div></div>
        ${K.warning ? `<p class="onb-hint">${esc(K.warning)}</p>` : ''}
        <div class="onb-chips onb-kacts">${ws.exists ? '' : `<button type="button" class="primary" id="onb-kcreate" ${K.busy ? 'disabled' : ''}><i class="ti ti-folder-plus"></i> Tạo Kho mặc định</button>`}
        <button type="button" id="onb-kedit"><i class="ti ti-folder-cog"></i> ${ws.exists ? 'Đổi thư mục' : 'Chọn thư mục có sẵn'}</button></div></div>
      ${K.editing ? pick : ''}
      <div class="onb-f"><label>Tải file vào Kho</label><div class="onb-drop" id="onb-kup" role="button" tabindex="0"><i class="ti ti-cloud-upload"></i>
        <div><b>Kéo thả video, ảnh, nhạc vào đây</b><span>hoặc bấm để chọn nhiều file. Video vào Nguon, ảnh vào Anh, nhạc vào Nhac.</span></div><input type="file" accept="video/*,image/*,audio/*" multiple hidden></div>
      <p class="onb-hint">Chỉ dùng nhạc bạn có quyền dùng.${ws.exists ? '' : ' Chưa có Kho thì Studio tạo thư mục mặc định ở trên khi bạn thả file.'}</p></div>
      ${W.files.length ? `<ul class="onb-files">${W.files.map(f => `<li>${st[f.st]}<span class="nm">${esc(f.name)}</span>${f.msg ? `<small class="bad">${esc(f.msg)}</small>` : f.rel ? `<small>${esc(f.rel.split('/')[0])}</small>` : ''}</li>`).join('')}</ul>` : ''}`;
  };
  const stepAssets = () => `${stepKho()}
      <div class="onb-f"><label>Một sản phẩm <em>(không bắt buộc)</em></label><p class="onb-hint onb-lead">AI dùng hồ sơ này khi viết lời và soát quảng cáo. Thêm sản phẩm khác ở mục Sản phẩm.</p></div>
      <div class="onb-g2">${field('onb-pname', 'Tên sản phẩm', 'Ví dụ: Căn hộ 2 phòng ngủ Quận 7', text('onb-pname', W.product.name, 'Tên sản phẩm'))}
      ${field('onb-price', 'Giá', 'Ghi như bạn muốn hiện, ví dụ 2,9 tỷ', text('onb-price', W.product.price, '2,9 tỷ'))}</div>
      ${field('onb-strong', 'Điểm mạnh', 'Mỗi dòng một ý. Studio lưu ở trạng thái chờ duyệt, chưa dùng trong quảng cáo cho tới khi bạn duyệt.', `<textarea id="onb-strong" placeholder="View sông&#10;Sổ hồng riêng">${esc(W.product.strengths)}</textarea>`)}
      ${W.product.faq.length ? `<p class="onb-hint">Kèm ${W.product.faq.length} câu hỏi thường gặp do AI đề xuất (lưu cùng sản phẩm).</p>` : ''}
      ${Studio.assistPanel ? `<div class="onb-g2">${field('onb-purl', 'Link sản phẩm <em>(không bắt buộc)</em>', 'Trang bán hàng công khai: AI đọc tên, giá, điểm mạnh.', text('onb-purl', W.pUrl, 'https://…'))}
        <div class="onb-f"><label>Ảnh sản phẩm <em>(cho AI)</em></label><button id="onb-pimg-btn" type="button"><i class="ti ti-photo"></i> ${W.pImage ? 'Đổi ảnh' : 'Chọn ảnh'}</button><input type="file" id="onb-pimg" accept="image/*" hidden>
        <p class="onb-hint">${W.pImage ? esc(W.pImage.name) : 'Ảnh chụp sản phẩm hoặc bao bì.'}</p></div></div><div id="onb-ai-prod"></div>` : ''}`;
  function wireAssets(box) {
    const psync = () => { if (W?.step !== 1 || !box.querySelector('#onb-pname')) return; W.product = { ...W.product, name: box.querySelector('#onb-pname').value, price: box.querySelector('#onb-price').value, strengths: box.querySelector('#onb-strong').value }; const u = box.querySelector('#onb-purl'); if (u) W.pUrl = u.value; };
    box.addEventListener('input', psync);
    mountProductAi(box, psync);
    wireKho(box);
  }
  const khoLoad = async () => {
    const want = khoBrand(), r = await api('/api/kho?brand=' + encodeURIComponent(want)).catch(e => ({ error: e.message }));
    if (!W || want !== khoBrand()) return; // đổi thương hiệu trong lúc chờ: bỏ kết quả cũ
    W.kho = r.error ? { error: r.error } : { ws: r.ws, warning: r.warning, editing: false, dir: null };
    if (W.step === 1) render();
  };
  async function khoDo(path, body, ok) {
    const K = W.kho; K.busy = true; render();
    const r = await api(path, body).catch(e => ({ error: e.message }));
    if (!W) return null;
    K.busy = false;
    if (r.error) { render(); err(r.error); return null; }
    W.kho = { ws: r.ws, warning: null, editing: false, dir: null }; render(); if (ok) toast(ok);
    return r;
  }
  function wireKho(box) {
    if (!W.kho) { khoLoad(); return; }
    if (W.kho.error) return;
    const K = W.kho, $k = s => box.querySelector(s);
    $k('#onb-kcreate')?.addEventListener('click', () => khoDo('/api/kho/create', { brand: khoBrand() }, 'Đã tạo Kho'));
    $k('#onb-kedit')?.addEventListener('click', () => { K.editing = !K.editing; render(); box.querySelector('#onb-kdir')?.focus(); });
    $k('#onb-kdir')?.addEventListener('input', e => (K.dir = e.target.value));
    $k('#onb-kdir')?.addEventListener('keydown', e => { if (e.key === 'Enter') $k('#onb-kset').click(); });
    $k('#onb-kset')?.addEventListener('click', () => khoDo('/api/kho/set', { brand: khoBrand(), dir: ($k('#onb-kdir').value || '').trim() }, 'Đã chọn thư mục Kho'));
    $k('#onb-kpick')?.addEventListener('click', async e => {
      e.currentTarget.disabled = true;
      const r = await api('/api/kho/pick-folder', {}).catch(() => ({ error: 'Không mở được hộp chọn thư mục' }));
      if (!W) return;
      if (r.error) err(r.error);
      else if (r.unsupported) err('Máy này không mở được hộp chọn thư mục: dán đường dẫn vào ô bên cạnh.');
      else if (r.path) K.dir = r.path;
      render();
    });
    const up = async files => {
      // Kho chưa có: tạo thư mục mặc định trước (ghi đường dẫn vào brand kit), như bấm "Tạo Kho mặc định"
      if (!W.kho.ws.exists && !(await khoDo('/api/kho/create', { brand: khoBrand() }))) return;
      for (const f of files) {
        const it = { name: f.name, st: 'up' }; W.files.push(it); W.uploading++; render();
        try {
          const r = await fetch(`/api/kho/upload?brand=${encodeURIComponent(khoBrand())}&name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f });
          const j = await r.json().catch(() => ({ error: r.status === 413 ? 'File quá lớn' : `Lỗi ${r.status}` }));
          if (!r.ok || j.error) throw new Error(j.error || 'lỗi'); it.st = 'ok'; it.rel = j.rel;
        } catch (e) { it.st = 'bad'; it.msg = e.message; }
        if (!W) return;
        W.uploading--; render();
      }
    };
    dropzone(box.querySelector('#onb-kup'), fs => up(fs.filter(f => /^(image|video|audio)\//.test(f.type) || /\.(mts|mkv|heic|ttf|otf)$/i.test(f.name))));
  }
  // M91: trợ lý Sản phẩm (ảnh và/hoặc link). Claim AI đề xuất vào ô Điểm mạnh, lưu ở trạng thái chờ duyệt như mọi điểm mạnh.
  function mountProductAi(box, psync) {
    const host = box.querySelector('#onb-ai-prod'); if (!host) return;
    const pick = box.querySelector('#onb-pimg');
    box.querySelector('#onb-pimg-btn').onclick = () => pick.click();
    pick.onchange = () => { const f = pick.files[0]; if (f && /^image\//.test(f.type)) { psync(); W.pImage = f; render(); } };
    W.pAi ||= Studio.assistPanel({
      name: 'product', label: 'Điền bằng AI', hint: 'Từ ảnh và/hoặc link: tên, giá (giữ nguyên như nguồn), điểm mạnh, FAQ. Claim luôn ở trạng thái chờ duyệt.',
      async input() {
        psync();
        const inp = { url: W.pUrl.trim(), name: W.product.name.trim(), brand: W.kit?.title || W.name || '' };
        if (W.pImage) inp.image = await Studio.imagePayload(W.pImage, { max: 1024, type: 'image/jpeg', quality: 0.88 });
        if (!inp.image && !inp.url) throw new Error('Chọn ảnh sản phẩm hoặc dán link trước khi hỏi AI.');
        return inp;
      },
      current: f => ({ name: W.product.name, price: W.product.price }[f.key] || ''),
      onAccept: f => {
        const p = W.product;
        if (f.key === 'name' || f.key === 'price' || f.key === 'industry') p[f.key] = f.value;
        else if (f.kind === 'claim') p.strengths = [p.strengths.trim(), f.value.text].filter(Boolean).join('\n');
        else if (f.kind === 'faq') p.faq.push(f.value);
        render();
      },
    });
    W.pAi.mount(host);
  }
  async function saveAssets() {
    if (W.uploading) throw new Error('Đợi tải lên xong rồi bấm Tiếp.');
    const p = W.product;
    if (p.name.trim()) {
      const claims = p.strengths.split('\n').map(t => t.trim()).filter(Boolean).map(t => ({ text: t, status: 'pending' }));
      const r = await api('/api/products/save', { product: { name: p.name.trim(), brand: W.kit?.title || '', claims, price: p.price.trim(), faq: p.faq, industry: p.industry, notes: p.price.trim() ? `Giá: ${p.price.trim()}` : '' } });
      if (r.error) throw new Error(r.error);
      W.product = { name: '', price: '', strengths: '', faq: [], industry: '' }; W.pImage = null; W.pUrl = ''; W.pAi = null;
      toast(`Đã lưu sản phẩm “${r.name}”`);
    } else if (p.price.trim() || p.strengths.trim()) throw new Error('Nhập tên sản phẩm, hoặc xoá giá và điểm mạnh để bỏ qua.');
    await saveState({ step: 2 });
  }

  const stepPurpose = () => `<div class="onb-f"><label>Lĩnh vực</label><div class="onb-pick">${PURPOSES.map(([id, ic, name]) => `<button data-pp="${id}" class="${W.purpose === id ? 'on' : ''}" aria-pressed="${W.purpose === id}"><i class="ti ${ic}"></i>${name}</button>`).join('')}</div>
      <p class="onb-hint" id="onb-sug">${W.purpose ? 'Đang tìm mẫu hợp…' : 'Chọn một lĩnh vực để xem gợi ý.'}</p></div>
    <div class="onb-f"><label>Khổ hình hay dùng</label><div class="onb-seg">${ASPECTS.map(([id, name, sub]) => `<button data-as="${id}" class="${W.aspect === id ? 'on' : ''}" aria-pressed="${W.aspect === id}">${name}<small>${sub}</small></button>`).join('')}</div>
      <p class="onb-hint">Đổi được cho từng video khi xuất.</p></div>
    <div class="onb-f"><label>Nền tảng đăng</label><div class="onb-chips">${PLATFORMS.map(([id, ic, name]) => `<button data-pf="${id}" class="${W.platforms.includes(id) ? 'on' : ''}" aria-pressed="${W.platforms.includes(id)}"><i class="ti ${ic}"></i>${name}</button>`).join('')}</div>
      <p class="onb-hint">Chọn nhiều nơi được. Studio gợi ý khổ và độ dài theo nơi đăng.</p></div>
    <div class="onb-note"><i class="ti ti-settings"></i><div>Kết nối YouTube, Telegram và chọn AI (Claude hoặc Ollama chạy trên máy): làm sau trong Cài đặt, ở nút <b>Mô hình &amp; giọng</b> và <b>Lịch đăng</b>.</div></div>`;
  function wirePurpose(box) {
    box.querySelectorAll('[data-pp]').forEach(b => (b.onclick = () => { W.purpose = b.dataset.pp; render(); }));
    box.querySelectorAll('[data-as]').forEach(b => (b.onclick = () => { W.aspect = b.dataset.as; render(); }));
    box.querySelectorAll('[data-pf]').forEach(b => (b.onclick = () => { const id = b.dataset.pf; W.platforms = W.platforms.includes(id) ? W.platforms.filter(x => x !== id) : [...W.platforms, id]; render(); }));
    if (W.purpose) suggest(W.purpose).then(t => { const el = document.getElementById('onb-sug'); if (el && W?.step === 2) el.textContent = t; });
  }
  // "Gợi ý": templates of the chosen category (GET /api/templates) and their most used style pack.
  async function suggest(pid) {
    const list = (await templates()).filter(t => t.category === pid);
    if (!list.length) return 'Chưa có mẫu riêng cho lĩnh vực này. Studio gợi ý mẫu chung.';
    const cnt = {}; for (const t of list) if (t.pack) cnt[t.pack] = (cnt[t.pack] || 0) + 1;
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0];
    const pk = (Studio.win?.PACKS || []).find(p => p.id === top);
    return `Gợi ý: ${list.length} mẫu (${list.slice(0, 3).map(t => t.name).join(', ')}${list.length > 3 ? '…' : ''})${top ? `, gói style ${pk ? pk.name : top}` : ''}. Mở ở thẻ Dựng theo mẫu trên trang chủ.`;
  }

  async function next() {
    if (!W || W.busy) return;
    err(''); W.busy = true; render();
    const s = W.step;
    try {
      if (s === 0) await saveBrand();
      else if (s === 1) await saveAssets();
      else await saveState({ purpose: W.purpose, aspect: W.aspect, platforms: W.platforms, done: true, skipped: false, step: 3 });
    } catch (e) { if (W) { W.busy = false; render(); err(e.message || 'Có lỗi, thử lại.'); } return; }
    W.busy = false;
    if (s < 2) { W.step++; render(); return; }
    const pid = W.purpose; closeWizard();
    toast('Xong! Mở lại hướng dẫn bằng nút nhà trên thanh trên.');
    if (ST?.project) openTemplates(pid); else openHome();
  }
  async function skip() {
    try { await saveState({ skipped: true }); } catch (e) { return err(e.message); }
    closeWizard();
    toast('Đã bỏ qua. Mở lại hướng dẫn bằng nút nhà trên thanh trên.');
    if (!ST?.project) openHome();
  }

  // ---------- home ----------
  const openPanel = id => { const b = document.querySelector(`#rail [data-p="${id}"]`); if (b) b.click(); return !!b; };
  function openTemplates(pid) {
    if (!openPanel('tpl')) return;
    const cat = purpose(pid)?.[3];
    if (cat) setTimeout(() => document.querySelector(`#libbody [data-cat="${CSS.escape(cat)}"]`)?.click(), 0);
  }
  function hideHome() { HOME?.remove(); HOME = null; document.removeEventListener('keydown', homeKey, true); }
  function homeKey(e) { if (e.key === 'Escape' && ST?.project && !document.getElementById('onb-wiz') && document.getElementById('modal')?.hidden !== false) { e.stopPropagation(); hideHome(); } }
  const brandCount = async () => { const b = await api('/api/brands').catch(() => null); return Array.isArray(b) ? b.length : -1; };
  // S18 M128: các clip cùng một lần cắt chỉ hiện một dòng (clip mở gần nhất, hoặc clip đang mở), kèm số clip khác đã mở
  const groupRecent = rec => {
    const out = [], seen = new Map();
    for (const r of rec) {
      if (!r.set) { out.push(r); continue; }
      const g = seen.get(r.set);
      if (!g) { const x = { ...r, more: 0 }; seen.set(r.set, x); out.push(x); }
      else if (r.current) { Object.assign(g, r, { more: g.more + 1 }); } else g.more++;
    }
    return out;
  };
  async function openHome() {
    await loadState();
    const nb = await brandCount();
    hideHome();
    HOME = document.createElement('div'); HOME.id = 'onb-home';
    const p = purpose(ST?.purpose), rec = ST?.recent || [];
    const card = (act, ic, title, sub, small = '') => `<button class="card" data-h="${act}"><span class="ic"><i class="ti ${ic}"></i></span><div><b>${title}</b><span>${sub}</span>${small ? `<small>${small}</small>` : ''}</div></button>`;
    HOME.innerHTML = `<div class="in"><div class="hd"><div class="grow"><h1>Bạn muốn làm video gì hôm nay?</h1><p class="sub">Chọn một cách bắt đầu. Studio dẫn bạn từng bước.</p></div>
      ${ST?.project ? '<button class="ghost" data-h="close" title="Về trình chỉnh sửa (Esc)"><i class="ti ti-x"></i> Đóng</button>' : ''}</div>
      <div class="cards">${card('auto', 'ti-rocket', 'Thả video → video hoàn chỉnh', 'Thả video quay sẵn, AI tự cắt, thêm phụ đề, hiệu ứng, nhạc và xuất video.', 'Tự lái')}
        ${card('tpl', 'ti-layout-grid', 'Dựng theo mẫu', 'Chọn một mẫu đẹp sẵn rồi thay chữ, ảnh, video của bạn.', p ? `Gợi ý cho ${p[2]}` : 'Gần 90 mẫu theo lĩnh vực')}
        ${card('long', 'ti-scissors', 'Cắt clip từ video dài', 'Đưa video dài (livestream, podcast, buổi học), AI chọn đoạn hay làm clip ngắn.', 'Cắt clip')}
        ${card('batch', 'ti-stack-2', 'Làm hàng loạt', 'Từ một file Excel hoặc CSV, làm nhiều video cùng mẫu trong một lần.', 'Hàng loạt')}</div>
      ${nb === 0 ? `<div class="prep"><i class="ti ti-briefcase"></i><div><b>Chưa có thương hiệu</b><small>Làm bước Chuẩn bị trước: thương hiệu (logo, màu, lời kết) và Kho chứa dự án, thành phẩm.</small></div>
        <button class="primary" data-h="prep"><i class="ti ti-arrow-right"></i> Chuẩn bị</button></div>` : ''}
      <h3>Dự án gần đây</h3><div class="rec">${rec.length ? groupRecent(rec).map(r => `<button data-r="${r.i}" ${r.current ? 'disabled' : ''}><i class="ti ${r.set ? 'ti-stack-2' : 'ti-folder'}"></i><span class="nm">${esc(r.set ? `${r.set} · ${r.name}` : r.name)}</span><small>${r.current ? 'đang mở' : r.set ? `bộ clip${r.more ? ` · +${r.more} clip khác đã mở` : ''}` : esc(r.parent)}${r.t && !r.current ? ' · ' + esc(fmtDay(r.t)) : ''}</small></button>`).join('')
        : '<div class="empty">Chưa có dự án nào. Bắt đầu bằng một trong 4 cách ở trên.</div>'}</div>
      <div class="links"><button class="ghost" data-h="wiz"><i class="ti ti-route"></i> Xem lại hướng dẫn</button>
        <button class="ghost" data-h="sample" title="Mở một video mẫu có sẵn để xem Studio làm được gì"><i class="ti ti-player-play"></i> Xem thử dự án mẫu</button></div></div>`;
    HOME.addEventListener('click', onHome);
    document.body.appendChild(HOME);
    document.addEventListener('keydown', homeKey, true);
  }
  async function onHome(e) {
    const r = e.target.closest('[data-r]');
    if (r) {
      r.disabled = true; r.querySelector('small').textContent = 'đang mở…';
      // S17 M126: lưu dự án đang mở trước khi đổi sang dự án khác; lưu không được thì dừng, không bỏ mất thay đổi
      if (ST?.project && Studio.TL) { await Studio.saveNow().catch(() => {}); if (Studio.dirty) { r.disabled = false; r.querySelector('small').textContent = 'chưa lưu được dự án đang mở'; return; } }
      const j = await api('/api/onboarding/open', { i: +r.dataset.r }).catch(err => ({ error: err.message }));
      if (j.error) { toast(j.error); return openHome(); }
      return location.reload();
    }
    const b = e.target.closest('[data-h]'); if (!b) return;
    const a = b.dataset.h;
    if (a === 'close') return hideHome();
    if (a === 'wiz' || a === 'prep') return openWizard(0);
    if (a === 'sample') {
      b.disabled = true;
      try {
        if (ST?.project && Studio.TL) { await Studio.saveNow(); if (Studio.dirty) throw new Error('Chưa lưu được dự án đang mở'); } // lưu trước khi đổi sang dự án mẫu
        const j = await api('/api/onboarding/sample', {});
        if (j.error) throw new Error(j.error);
      } catch (err) { b.disabled = false; return toast(err.message || 'Không mở được dự án mẫu'); }
      return location.reload();
    }
    if (a === 'tpl') {
      if (ST?.project) { hideHome(); return openTemplates(ST.purpose); }
      // Templates need a project: start "Video mới"; after it reloads, onReady opens the Mẫu panel on the chosen field.
      try { sessionStorage.setItem('avs-onb-tpl', ST?.purpose || '-'); } catch { /* trình duyệt chặn lưu: bỏ qua */ }
      toast('Chọn video của bạn để tạo dự án, sau đó chọn mẫu.');
      return document.getElementById('newproj')?.click();
    }
    hideHome();
    openPanel({ auto: 'autopilot', long: 'longform', batch: 'batch' }[a]);
  }

  // ---------- start ----------
  Studio.openOnboarding = () => openWizard(0);
  Studio.logoColors = logoColors; // M91: ô Gợi ý bằng AI của panel Thương hiệu đo màu logo cùng một cách
  Studio.onboardingPurpose = async () => purpose((await loadState())?.purpose)?.[2] || '';
  Studio.openHome = openHome;
  // Home button first in the header (logo removed to save space) (not addTopButton: 01_workflow moves step-less header buttons into the ⋯ menu).
  { const b = document.createElement('button'); b.id = 'onb-btn'; b.className = 'icon'; b.title = 'Trang chủ: cách bắt đầu nhanh, dự án gần đây, hướng dẫn';
    b.setAttribute('aria-label', 'Trang chủ'); b.innerHTML = '<i class="ti ti-home"></i>'; b.addEventListener('click', openHome);
    const top = document.querySelector('#top'); if (top) top.prepend(b); else Studio.addTopButton(b.outerHTML, openHome); }
  Studio.onReady(() => {
    let pid = null; try { pid = sessionStorage.getItem('avs-onb-tpl'); sessionStorage.removeItem('avs-onb-tpl'); } catch { /* không có sessionStorage */ }
    if (pid) openTemplates(pid === '-' ? '' : pid);
  });
  // The author screen (#author, 00_author.js) always comes first, then the machine check (01_setup.js, S15 M115): wait for both.
  const afterAuthor = fn => { const t = setInterval(() => { if (!document.getElementById('author')) { clearInterval(t); (Studio.setupGate || Promise.resolve()).then(fn); } }, 250); };
  loadState().then(async s => {
    if (!s) return;
    if (!s.project) {
      await openHome();
      // boot() shows a "Chưa mở dự án" modal when nothing is open; the home screen replaces it.
      const mb = document.getElementById('modalbox');
      const drop = () => { if (mb && /Chưa mở dự án/.test(mb.textContent) && HOME && !document.getElementById('modal').hidden) { Studio.closeModal(); return true; } };
      if (mb && !drop()) { const mo = new MutationObserver(() => drop() && mo.disconnect()); mo.observe(mb, { childList: true }); setTimeout(() => mo.disconnect(), 15000); }
    }
    if (!s.done && !s.skipped) afterAuthor(() => openWizard());
    else if (!s.project && (await brandCount()) === 0) {
      // S17 M125: đã qua hướng dẫn nhưng chưa có thương hiệu: vào thẳng bước Chuẩn bị (Thương hiệu → Kho), mỗi phiên một lần
      let seen = false; try { seen = !!sessionStorage.getItem('avs-onb-prep'); sessionStorage.setItem('avs-onb-prep', '1'); } catch { /* không có sessionStorage */ }
      if (!seen) afterAuthor(() => openWizard(0));
    }
  }).catch(e => console.error('onboarding', e));
})();
