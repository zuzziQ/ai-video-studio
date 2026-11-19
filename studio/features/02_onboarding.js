// Lần đầu mở Studio (ROADMAP M83, references/studio.md): hướng dẫn 3 bước + trang chủ khi chưa mở dự án.
// - Hướng dẫn mở SAU màn Kiểm tra máy (01_setup.js, Studio.setupGate) khi $AVS_HOME/onboarding.json chưa done/skipped.
//   (a) Thương hiệu → /api/brands/save + /api/brands/logo (51_brands); (b) Kho → /api/kho/create|set|pick-folder|upload (12_workspace,
//   S12/M97: Kho của thương hiệu vừa lưu, không cần dự án đang mở)
//   + /api/products/save (53_products); (c) Mục đích → /api/onboarding (02_onboarding.mjs).
//   Bước (a) có "Gợi ý bằng AI" (trợ lý brand), bước (b) có "Điền bằng AI" (trợ lý product): 05_assist.js, M91. Chỉ ghi khi bấm Nhận.
// - Trang chủ (#onb-home): các cách bắt đầu, mỗi thẻ mở đúng luồng có sẵn (Video mới, Tự lái, Mẫu, Cắt clip từ video dài, Hàng loạt)
//   + dự án gần đây. Tự hiện khi chưa mở dự án; nút nhà trên thanh trên mở lại. Studio.openOnboarding() / Studio.openHome().
//   S19 M132: Tự lái bắt đầu ở thẻ của trang chủ (thả nhiều video → /api/autopilot/upload, chọn thương hiệu); thanh trên chỉ còn
//   chỉ báo việc nền (15_autopilot.js). S19 M136: dự án gần đây là lưới thẻ có ảnh bìa (/api/onboarding/thumb?i=, tạo nền ở
//   scripts/home_cards.mjs), thời lượng, Kho, sửa lần cuối, đã xuất, dấu đang mở trên thanh tab; tìm theo tên, lọc theo thương hiệu.
// - S26 M188: đã có thương hiệu thì hướng dẫn không tự mở nữa; trang chủ có mục Thương hiệu: mỗi thương hiệu một thẻ (Video mới chọn
//   sẵn thương hiệu đó, Dự án lọc dự án gần đây, Mẫu mở thư viện mẫu của thương hiệu (S27 M189), Sửa), thẻ "Thương hiệu mới" mở hướng dẫn trống. Tạo / sửa từ thẻ chỉ có 2 bước (Thương hiệu, Kho).
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
  // M167 (C33): chỉ hai khổ soạn; vuông 1:1 là bản xuất thêm (Xuất → Xuất thêm khổ), không còn là khổ của dự án
  const ASPECTS = [['9:16', 'Dọc 9:16', 'TikTok, Reels, Shorts'], ['16:9', 'Ngang 16:9', 'YouTube, Facebook']];
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
  .onb-tip { display: inline-flex; vertical-align: -2px; margin-left: 4px; color: var(--tx3); cursor: help; border-radius: 50%; } .onb-tip:hover, .onb-tip:focus-visible { color: var(--tx); outline: none; }
  .onb-tip .ti { font-size: 14px; }
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
  #onb-home .cards.sm { grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 12px; } #onb-home .cards.sm .card { padding: 16px; gap: 12px; }
  #onb-home .cards.sm .card .ic { width: 40px; height: 40px; }
  /* S19 M132: Tự lái bắt đầu ở đây (thả nhiều video + chọn thương hiệu), không còn nút trên thanh trên */
  #onb-home .card.ap { cursor: default; flex-direction: column; align-items: stretch; gap: 12px; } #onb-home .card.ap:hover { border-color: var(--line); background: var(--bg2); }
  #onb-home .card.ap .top { display: flex; gap: 16px; align-items: flex-start; } #onb-home .card.ap .top > div { flex: 1; min-width: 0; }
  #onb-home .apdrop { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px dashed var(--line3); border-radius: var(--r); background: var(--bg1); color: var(--tx2); font-size: 12px; cursor: pointer; }
  #onb-home .apdrop:hover, #onb-home .apdrop.over, #onb-home .apdrop:focus-visible { border-color: var(--acc); color: var(--tx); }
  #onb-home .apdrop .ti { font-size: 20px; color: var(--acc); flex: none; } #onb-home .apdrop.busy { pointer-events: none; opacity: .7; }
  #onb-home .aprow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px; color: var(--tx2); }
  #onb-home .aprow select { flex: 1; min-width: 140px; height: 32px; font-size: 12px; } #onb-home .aprow button { font-size: 12px; height: 32px; }
  #onb-home .apq { font-size: 11px; color: var(--tx3); }
  /* S19 M136: dự án gần đây thành lưới thẻ có ảnh bìa (như màn dự án của CapCut / Premiere), tìm theo tên, lọc theo thương hiệu */
  #onb-home .rhd { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 32px 0 12px; } #onb-home .rhd h3 { margin: 0; flex: 1; min-width: 120px; }
  #onb-home .rhd input { width: 220px; max-width: 100%; height: 32px; font-size: 12px; } #onb-home .rhd select { height: 32px; font-size: 12px; max-width: 180px; }
  #onb-home .rec { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  #onb-home .pc { all: unset; box-sizing: border-box; cursor: pointer; display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 0 0 8px; border-radius: var(--r); }
  #onb-home .pc[hidden], #onb-home .empty[hidden] { display: none; }
  #onb-home .pc .th { position: relative; display: block; aspect-ratio: 16 / 10; border-radius: var(--r); overflow: hidden; background: var(--bg3); border: 1px solid var(--line); }
  #onb-home .pc:hover .th, #onb-home .pc:focus-visible .th { border-color: var(--acc-line); } #onb-home .pc.cur .th { border-color: var(--acc); }
  #onb-home .pc .th img { width: 100%; height: 100%; object-fit: cover; display: block; } #onb-home .pc .th.v img { object-fit: contain; }
  #onb-home .pc .th > .ti { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 28px; color: var(--tx3); }
  #onb-home .pc .th.wait { animation: onb-pulse 1.4s ease-in-out infinite; } @keyframes onb-pulse { 50% { opacity: .55; } }
  #onb-home .pc .bd { position: absolute; display: flex; gap: 4px; align-items: center; padding: 2px 6px; border-radius: var(--rs); font-size: 11px; line-height: 16px; background: rgb(var(--color-scrim) / .72); color: rgb(var(--color-fg-on-media)); }
  #onb-home .pc .bd.tl { top: 6px; left: 6px; } #onb-home .pc .bd.tr { top: 6px; right: 6px; } #onb-home .pc .bd.br { bottom: 6px; right: 6px; font-variant-numeric: tabular-nums; }
  #onb-home .pc .bd.on { background: var(--acc); color: var(--bg0); } #onb-home .pc .bd .ok { color: var(--ok); }
  #onb-home .pc .nm { margin-top: 4px; font-size: 13px; font-weight: 600; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #onb-home .pc small { display: block; font-size: 11px; color: var(--tx3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #onb-home .pc small.set { color: var(--tx2); } #onb-home .pc small .ti { font-size: 12px; vertical-align: -2px; }
  #onb-home .empty { font-size: 12px; color: var(--tx3); padding: 12px; border: 1px dashed var(--line2); border-radius: var(--r); }
  #onb-home .prep { display: flex; gap: 12px; align-items: center; margin-top: 24px; padding: 12px 16px; border-radius: var(--r); background: var(--acc-soft); border: 1px solid var(--acc-line); font-size: 13px; color: var(--tx); }
  #onb-home .prep .ti { font-size: 22px; color: var(--acc); flex: none; } #onb-home .prep div { flex: 1; min-width: 0; } #onb-home .prep small { display: block; color: var(--tx2); font-size: 12px; margin-top: 2px; }
  #onb-home .prep button { flex: none; font-size: 13px; }
  @media (max-width: 720px) { #onb-home .prep { flex-wrap: wrap; } }
  /* S26 M188: mục Thương hiệu của trang chủ */
  #onb-home .brs { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  #onb-home .bc { box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 16px; border-radius: var(--r); background: var(--bg2); border: 1px solid var(--line); }
  #onb-home .bc .bt { display: flex; gap: 12px; align-items: center; min-width: 0; } #onb-home .bc .bt > div { min-width: 0; flex: 1; }
  #onb-home .bc .lg { width: 40px; height: 40px; flex: none; border-radius: var(--r); background: var(--bg3); display: flex; align-items: center; justify-content: center; overflow: hidden; font-weight: 700; font-size: 16px; color: rgb(var(--color-fg-on-media)); }
  #onb-home .bc .lg img { width: 100%; height: 100%; object-fit: contain; background: var(--bg1); }
  #onb-home .bc b { display: block; font-size: 14px; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #onb-home .bc small { display: block; font-size: 11px; color: var(--tx3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #onb-home .bc .ba { display: flex; gap: 8px; flex-wrap: wrap; } #onb-home .bc .ba button { font-size: 12px; height: 32px; } #onb-home .bc .ba .grow { flex: 1; }
  #onb-home .bc.add { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 112px; padding: 16px; border-radius: var(--r); border: 1px dashed var(--line3); color: var(--tx2); font-size: 13px; }
  #onb-home .bc.add:hover, #onb-home .bc.add:focus-visible { border-color: var(--acc); color: var(--tx); } #onb-home .bc.add .ti { font-size: 18px; color: var(--acc); }
  #onb-home .links { display: flex; gap: 8px; margin-top: 24px; flex-wrap: wrap; } #onb-home .links button { font-size: 12px; }
  @media (max-width: 720px) { #onb-home .cards.sm { grid-template-columns: minmax(0, 1fr); } #onb-home .rhd input { width: 100%; } #onb-home .rhd select { max-width: none; flex: 1; } }
  @media (max-width: 420px) { #onb-home .rec { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; } #onb-home .in { padding-top: 32px; } }
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
  // opt.fresh: tạo thương hiệu mới (ô trống); opt.brand: sửa thương hiệu đó. Hai cách này mở từ trang chủ, chỉ 2 bước, không đụng trạng thái hướng dẫn.
  async function openWizard(step, opt = {}) {
    closeWizard();
    await loadState();
    const brands = await api('/api/brands').catch(() => []);
    const want = opt.fresh ? null : opt.brand || ST?.brand;
    const kit = (Array.isArray(brands) ? brands : []).find(b => b.id === want) || null;
    const mode = opt.fresh ? 'new' : opt.brand && kit ? 'edit' : '';
    W = { step: Math.min(step ?? ST?.step ?? 0, mode ? 1 : 2), mode, last: mode ? 1 : 2, kit, logoFile: null, logoUrl: kit?.logoUrl ? avsUrl(kit.logoUrl) : '', colors: [kit?.primary || '', kit?.accent || ''],
      name: kit?.title || kit?.name || '', phone: kit?.phone || '', website: kit?.website || '', handle: kit?.handle || '',
      files: [], uploading: 0, kho: null, product: { name: '', price: '', strengths: '', faq: [], industry: '' }, extra: {}, pImage: null, pUrl: '', bAi: null, pAi: null,
      purpose: ST?.purpose || '', aspect: ST?.aspect === '16:9' ? '16:9' : '9:16', platforms: [...(ST?.platforms || [])], busy: false };
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
    const s = W.step, n = W.last + 1, heads = [
      W.mode === 'new' ? ['Thương hiệu mới', 'Mỗi thương hiệu có tên, logo, màu và Kho riêng. Màu chủ đạo tự lấy từ logo.']
        : W.mode === 'edit' ? ['Sửa thương hiệu', 'Đổi tên, logo, màu hay thông tin liên hệ; video mới của thương hiệu này dùng bản đã lưu.']
          : ['Thương hiệu của bạn', 'Tên và logo sẽ hiện trên mọi video. Màu chủ đạo tự lấy từ logo.'],
      ['Kho của thương hiệu', 'Một thư mục trên máy chứa video quay, ảnh, nhạc và logo; mọi video sau lấy file từ đây. Bước này không bắt buộc.'],
      ['Bạn làm video để làm gì?', 'Studio gợi ý gói style, mẫu và khổ hình hợp với bạn.']];
    box.innerHTML = `<div class="onb-head"><div class="onb-prog">${STEPS.slice(0, n).map((_, i) => `<i class="${i <= s ? 'on' : ''}"></i>`).join('')}</div>
      <p class="onb-kick">Bước ${s + 1}/${n} · ${STEPS[s]}</p><h2 id="onb-title">${heads[s][0]}</h2><p>${heads[s][1]}</p></div>
      <div class="onb-body">${[stepBrand, stepAssets, stepPurpose][s]()}<p class="onb-err" id="onb-err"></p></div>
      <div class="onb-foot"><button class="ghost" data-o="skip">${W.mode ? 'Đóng' : 'Bỏ qua hướng dẫn'}</button><span class="grow"></span>
        ${s ? '<button data-o="back"><i class="ti ti-arrow-left"></i> Quay lại</button>' : ''}
        <button class="primary" data-o="next" ${W.busy ? 'disabled' : ''}>${W.busy ? '<i class="ti ti-loader-2 spin"></i> Đang lưu…' : s === W.last ? '<i class="ti ti-check"></i> Xong' : 'Tiếp <i class="ti ti-arrow-right"></i>'}</button></div>`;
    box.querySelector('[data-o=skip]').onclick = skip;
    box.querySelector('[data-o=back]')?.addEventListener('click', () => { W.step--; render(); });
    box.querySelector('[data-o=next]').onclick = next;
    [wireBrand, wireAssets, wirePurpose][s](box);
  }
  const err = m => { const e = document.getElementById('onb-err'); if (e) e.innerHTML = m ? `<i class="ti ti-alert-circle"></i> ${esc(m)}` : ''; };
  // S22 M156 (C26): ô của hướng dẫn chỉ còn nhãn + placeholder; lời giải thích vào (i) cạnh nhãn (Studio.tip của M155 nếu đã có).
  const tip = h => (!h ? '' : Studio.tip ? Studio.tip(h) : `<span class="onb-tip" tabindex="0" role="img" title="${esc(h)}" aria-label="${esc(h)}"><i class="ti ti-info-circle" aria-hidden="true"></i></span>`);
  const field = (id, label, hint, input) => `<div class="onb-f"><label for="${id}">${label}${tip(hint)}</label>${input}</div>`;
  const text = (id, val, ph, type = 'text') => `<input id="${id}" type="${type}" value="${esc(val)}" placeholder="${esc(ph)}">`;

  const stepBrand = () => field('onb-name', 'Tên thương hiệu', 'Tên hiện trên video: phần giới thiệu và lời kêu gọi cuối video.', text('onb-name', W.name, 'Ví dụ: Nhà Đẹp Sài Gòn')) +
    `<div class="onb-f"><label>Logo${tip('Logo nền trong suốt (PNG) hiện đẹp nhất trên video.')}</label><div class="onb-drop" id="onb-logo-drop" role="button" tabindex="0"><div class="onb-logo">${W.logoUrl ? `<img src="${esc(W.logoUrl)}" alt="Logo">` : '<i class="ti ti-photo"></i>'}</div>
      <div><b>${W.logoUrl ? 'Đổi logo' : 'Kéo thả logo vào đây'}</b><span>hoặc bấm để chọn ảnh PNG, JPG, WebP, SVG</span></div><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></div>
      </div>` +
    `<div class="onb-f"><label>Màu chủ đạo${tip(W.colors[0] ? 'Lấy từ logo. Bấm vào ô màu để đổi.' : 'Tự lấy sau khi có logo.')}</label><div class="onb-sw">${W.colors[0] ? `<input type="color" id="onb-c1" value="${esc(W.colors[0])}" aria-label="Màu chính">
      <input type="color" id="onb-c2" value="${esc(W.colors[1] || W.colors[0])}" aria-label="Màu nhấn">` : '<span class="onb-nosw"></span><span class="onb-nosw"></span>'}</div>
      </div>` +
    (Studio.assistPanel ? '<div id="onb-ai-brand"></div>' : '') +
    `<div class="onb-g3">${field('onb-phone', 'Số điện thoại <em>(không bắt buộc)</em>', 'Hiện ở lời kêu gọi cuối video.', text('onb-phone', W.phone, '0901 234 567', 'tel'))}
      ${field('onb-web', 'Website <em>(không bắt buộc)</em>', '', text('onb-web', W.website, 'nhadep.vn'))}
      ${field('onb-handle', 'Tên kênh <em>(không bắt buộc)</em>', '', text('onb-handle', W.handle, '@nhadep'))}</div>`;
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
    await saveState(W.mode ? { brand: b.id } : { brand: b.id, step: 1 });
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
    const pick = `<div class="onb-f"><label for="onb-kdir">Thư mục có sẵn${tip('Studio chỉ đọc và phân nhóm file theo đuôi, không chép, không đòi đúng cấu trúc thư mục con.')}</label><div class="onb-sw"><input id="onb-kdir" value="${esc(K.dir ?? (ws.custom ? ws.root : ''))}" placeholder="Ví dụ D:\\Videos\\Nha Dep" spellcheck="false">
        <button type="button" id="onb-kpick"><i class="ti ti-folder-search"></i> Chọn…</button><button type="button" class="primary" id="onb-kset" ${K.busy ? 'disabled' : ''}>Dùng</button></div></div>`;
    return `<div class="onb-f"><label>Thư mục Kho${ws.exists ? '' : ' <em>(chưa tạo)</em>'}</label><div class="onb-drop onb-kho" title="${esc(ws.root)}"><i class="ti ti-folder"></i><div class="onb-kp"><b>${esc(ws.root)}</b>
        <span>${ws.exists ? (ws.custom ? 'Thư mục bạn chọn' : 'Thư mục mặc định') : 'Sẽ tạo sẵn Nguon, Anh, BRoll, Nhac, Thuong hieu'}</span></div></div>
        ${K.warning ? `<p class="onb-hint">${esc(K.warning)}</p>` : ''}
        <div class="onb-chips onb-kacts">${ws.exists ? '' : `<button type="button" class="primary" id="onb-kcreate" ${K.busy ? 'disabled' : ''}><i class="ti ti-folder-plus"></i> Tạo Kho mặc định</button>`}
        <button type="button" id="onb-kedit"><i class="ti ti-folder-cog"></i> ${ws.exists ? 'Đổi thư mục' : 'Chọn thư mục có sẵn'}</button></div></div>
      ${K.editing ? pick : ''}
      <div class="onb-f"><label>Tải file vào Kho${tip('Chỉ dùng nhạc bạn có quyền dùng.' + (ws.exists ? '' : ' Chưa có Kho thì Studio tạo thư mục mặc định ở trên khi bạn thả file.'))}</label><div class="onb-drop" id="onb-kup" role="button" tabindex="0"><i class="ti ti-cloud-upload"></i>
        <div><b>Kéo thả video, ảnh, nhạc vào đây</b><span>hoặc bấm để chọn nhiều file. Video vào Nguon, ảnh vào Anh, nhạc vào Nhac.</span></div><input type="file" accept="video/*,image/*,audio/*" multiple hidden></div></div>
      ${W.files.length ? `<ul class="onb-files">${W.files.map(f => `<li>${st[f.st]}<span class="nm">${esc(f.name)}</span>${f.msg ? `<small class="bad">${esc(f.msg)}</small>` : f.rel ? `<small>${esc(f.rel.split('/')[0])}</small>` : ''}</li>`).join('')}</ul>` : ''}`;
  };
  const stepAssets = () => `${stepKho()}
      <div class="onb-f"><label>Một sản phẩm <em>(không bắt buộc)</em>${tip('AI dùng hồ sơ này khi viết lời và soát quảng cáo. Thêm sản phẩm khác ở mục Sản phẩm.')}</label></div>
      <div class="onb-g2">${field('onb-pname', 'Tên sản phẩm', '', text('onb-pname', W.product.name, 'Ví dụ: Căn hộ 2 phòng ngủ Quận 7'))}
      ${field('onb-price', 'Giá', 'Ghi như bạn muốn hiện trên video.', text('onb-price', W.product.price, '2,9 tỷ'))}</div>
      ${field('onb-strong', 'Điểm mạnh', 'Mỗi dòng một ý. Studio lưu ở trạng thái chờ duyệt, chưa dùng trong quảng cáo cho tới khi bạn duyệt.', `<textarea id="onb-strong" placeholder="View sông&#10;Sổ hồng riêng">${esc(W.product.strengths)}</textarea>`)}
      ${W.product.faq.length ? `<p class="onb-hint">Kèm ${W.product.faq.length} câu hỏi thường gặp do AI đề xuất (lưu cùng sản phẩm).</p>` : ''}
      ${Studio.assistPanel ? `<div class="onb-g2">${field('onb-purl', 'Link sản phẩm <em>(không bắt buộc)</em>', 'Trang bán hàng công khai: AI đọc tên, giá, điểm mạnh.', text('onb-purl', W.pUrl, 'https://…'))}
        <div class="onb-f"><label>Ảnh sản phẩm <em>(cho AI)</em>${tip('Ảnh chụp sản phẩm hoặc bao bì.')}</label><button id="onb-pimg-btn" type="button"><i class="ti ti-photo"></i> ${W.pImage ? 'Đổi ảnh' : 'Chọn ảnh'}</button><input type="file" id="onb-pimg" accept="image/*" hidden>
        ${W.pImage ? `<p class="onb-hint">${esc(W.pImage.name)}</p>` : ''}</div></div><div id="onb-ai-prod"></div>` : ''}`;
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
    if (!W.mode) await saveState({ step: 2 });
  }

  const stepPurpose = () => `<div class="onb-f"><label>Lĩnh vực</label><div class="onb-pick">${PURPOSES.map(([id, ic, name]) => `<button data-pp="${id}" class="${W.purpose === id ? 'on' : ''}" aria-pressed="${W.purpose === id}"><i class="ti ${ic}"></i>${name}</button>`).join('')}</div>
      <p class="onb-hint" id="onb-sug">${W.purpose ? 'Đang tìm mẫu hợp…' : 'Chọn một lĩnh vực để xem gợi ý.'}</p></div>
    <div class="onb-f"><label>Khổ hình hay dùng${tip('Khổ soạn của video mới. Bản vuông 1:1 cho bài đăng Facebook, Instagram: chọn thêm khi xuất.')}</label><div class="onb-seg">${ASPECTS.map(([id, name, sub]) => `<button data-as="${id}" class="${W.aspect === id ? 'on' : ''}" aria-pressed="${W.aspect === id}">${name}<small>${sub}</small></button>`).join('')}</div></div>
    <div class="onb-f"><label>Nền tảng đăng${tip('Chọn nhiều nơi được. Studio gợi ý khổ và độ dài theo nơi đăng.')}</label><div class="onb-chips">${PLATFORMS.map(([id, ic, name]) => `<button data-pf="${id}" class="${W.platforms.includes(id) ? 'on' : ''}" aria-pressed="${W.platforms.includes(id)}"><i class="ti ${ic}"></i>${name}</button>`).join('')}</div></div>
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
    if (s < W.last) { W.step++; render(); return; }
    if (W.mode) { const t = W.kit?.title || W.name; closeWizard(); toast(`Đã lưu thương hiệu ${t}`); return openHome(); }
    const pid = W.purpose; closeWizard();
    toast('Xong! Mở lại hướng dẫn bằng nút nhà trên thanh trên.');
    if (ST?.project) openTemplates(pid); else openHome();
  }
  async function skip() {
    if (W?.mode) { closeWizard(); return HOME ? openHome() : undefined; } // đóng hộp tạo / sửa thương hiệu: trang chủ đọc lại danh sách
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
  // S19 M136: thẻ dự án gần đây
  const fmtDur = d => { d = Math.round(+d || 0); if (!d) return ''; const h = Math.floor(d / 3600), m = Math.floor(d / 60) % 60, x = String(d % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
  const fmtAgo = t => {
    const d = new Date(t), m = (Date.now() - d) / 60000; if (isNaN(d)) return '';
    if (m < 2) return 'vừa sửa'; if (m < 60) return `sửa ${Math.round(m)} phút trước`; if (m < 24 * 60) return `sửa ${Math.round(m / 60)} giờ trước`;
    if (m < 48 * 60) return 'sửa hôm qua'; return `sửa ${fmtDay(t)}`;
  };
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase(); // tìm không dấu
  const thumbUrl = r => avsUrl(`/api/onboarding/thumb?i=${r.i}&v=${r.thumb.v}`);
  const thumbHtml = r => r.thumb ? `<img loading="lazy" alt="" src="${esc(thumbUrl(r))}">` : r.gone ? '<i class="ti ti-folder-off"></i>' : r.thumbPending ? '' : '<i class="ti ti-movie"></i>';
  const projCard = r => {
    const meta = r.gone ? 'Thư mục không còn trên máy' : [r.kho, fmtAgo(r.edited || r.t)].filter(Boolean).join(' · ');
    return `<button class="pc${r.current ? ' cur' : ''}" data-r="${r.i}" data-q="${esc(fold(`${r.name} ${r.set || ''} ${r.kho || ''}`))}" data-b="${esc(r.brand || '')}" title="${esc(r.set ? `${r.set} · ${r.name}` : r.name)}">
      <span class="th${r.aspect === 'v' ? ' v' : ''}${!r.thumb && r.thumbPending ? ' wait' : ''}">${thumbHtml(r)}
        ${r.current ? '<span class="bd tl on">Đang sửa</span>' : r.open ? '<span class="bd tl" title="Dự án này có trên thanh tab">Đang mở</span>' : ''}
        ${r.exported ? '<span class="bd tr"><i class="ti ti-circle-check ok"></i>Đã xuất</span>' : ''}${r.dur ? `<span class="bd br">${fmtDur(r.dur)}</span>` : ''}</span>
      <span class="nm">${esc(r.name)}</span>
      ${r.set ? `<small class="set"><i class="ti ti-stack-2"></i> ${esc(r.set)}${r.more ? ` · +${r.more} clip` : ''}</small>` : ''}<small class="mt">${esc(meta)}</small></button>`;
  };
  function filterRec() {
    if (!HOME) return;
    const q = fold(HOME.querySelector('#onb-q')?.value).trim(), b = HOME.querySelector('#onb-kb')?.value ?? '*';
    let n = 0;
    for (const c of HOME.querySelectorAll('.rec .pc')) { const ok = (!q || c.dataset.q.includes(q)) && (b === '*' || c.dataset.b === b); c.hidden = !ok; n += ok; }
    const e = HOME.querySelector('#onb-none'); if (e) e.hidden = n > 0;
  }
  // ảnh bìa đang tạo nền: hỏi lại vài lần rồi thay khung xám bằng ảnh (không vẽ lại cả trang chủ)
  let thumbPoll = 0;
  function pollThumbs(left = 8) {
    clearTimeout(thumbPoll);
    if (!HOME || !left || !(ST?.recent || []).some(r => r.thumbPending)) return;
    thumbPoll = setTimeout(async () => {
      const s = await api('/api/onboarding').catch(() => null); if (!s?.recent || !HOME) return;
      ST = s;
      for (const r of s.recent) {
        const th = HOME.querySelector(`.pc[data-r="${r.i}"] .th`); if (!th || th.querySelector('img') || r.thumbPending) continue;
        th.classList.remove('wait'); th.insertAdjacentHTML('afterbegin', thumbHtml(r));
      }
      pollThumbs(left - 1);
    }, 2500);
  }
  // S26 M183: thương hiệu mặc định của Tự lái (hàm thuần, 15_autopilot.js dùng chung qua Studio.apDefaults; scripts/tests/s26_m183.test.mjs)
  // <pure:apdefaults>
  const apPickBrand = ({ saved, onboard, brands }) => {
    const ids = (brands || []).map(b => b.id);
    if (saved === '__none' || (saved && ids.includes(saved))) return saved; // người dùng đã tự chọn: giữ
    if (onboard && ids.includes(onboard)) return onboard; // thương hiệu chọn ở hướng dẫn đầu
    return ids.length === 1 ? ids[0] : ''; // chỉ có một thương hiệu
  };
  const apKhoText = (brand, brands) => {
    const b = brand && brand !== '__none' ? (brands || []).find(x => x.id === brand) : null;
    return b ? `Video và thành phẩm vào Kho ${b.title || b.name || b.id}.` : brand === '__none' ? 'Video và thành phẩm vào Kho Chung (không thương hiệu).' : 'Video và thành phẩm vào Kho theo hồ sơ Tự lái.';
  };
  const apSkipText = steps => {
    const w = Object.entries(steps || {}).filter(([, s]) => s && s.state === 'warn').map(([id, s]) => `${s.label || id}${s.msg ? ` (${s.msg})` : ''}`);
    return w.length ? `Xong · bỏ qua: ${w.join(', ')}` : '';
  };
  // </pure:apdefaults>
  Studio.apDefaults = { pickBrand: apPickBrand, khoText: apKhoText, skipText: apSkipText };
  // S19 M132: thẻ Tự lái của trang chủ: thả nhiều video, chọn thương hiệu (cùng lựa chọn với panel Tự lái: /api/autopilot/settings)
  let AP = null;
  const apOpt = (v, l) => `<option value="${esc(v)}" ${v === AP?.brand ? 'selected' : ''}>${esc(l)}</option>`;
  const apQueue = st => {
    const it = st?.items || [], run = it.filter(x => x.state === 'running').length, wait = it.filter(x => x.state === 'queued').length;
    return [run && `Đang chạy ${run} việc`, wait && `${wait} việc chờ`].filter(Boolean).join(' · ');
  };
  // dòng trạng thái hàng đợi dưới thẻ Tự lái: hỏi lại khi trang chủ còn mở và hàng đợi còn việc
  let apPoll = 0;
  function pollAp() {
    clearTimeout(apPoll);
    if (!HOME || !apQueue(AP?.st)) return;
    apPoll = setTimeout(async () => {
      const st = await api('/api/autopilot/state').catch(() => null);
      if (!HOME || !st || st.error) return;
      AP.st = st; const q = HOME.querySelector('#onb-apq'); if (q && !HOME.querySelector('#onb-apdrop.busy')) q.textContent = apQueue(st);
      pollAp();
    }, 3000);
  }
  const apCard = brands => `<div class="card ap"><div class="top"><span class="ic"><i class="ti ti-rocket"></i></span><div><b>Tự lái: thả video → video hoàn chỉnh</b>
      <span>Thả một hay nhiều video quay sẵn. AI tự cắt, thêm phụ đề, hiệu ứng, nhạc và xuất video, chạy nền trong khi bạn làm việc khác.</span></div></div>
    <div class="apdrop" id="onb-apdrop" role="button" tabindex="0"><i class="ti ti-cloud-upload"></i><div><b>Thả video vào đây</b> hoặc bấm để chọn (được chọn nhiều video)</div></div>
    <input type="file" id="onb-apfile" accept="video/*,.mkv" multiple hidden>
    <div class="aprow"><label for="onb-apbrand">Thương hiệu</label><select id="onb-apbrand">${apOpt('', 'Theo hồ sơ Tự lái')}${apOpt('__none', 'Không thương hiệu · Kho Chung')}${brands.map(b => apOpt(b.id, b.title || b.name || b.id)).join('')}</select>
      <button class="ghost" data-h="auto" title="Mở panel Tự lái: hàng đợi, thư mục tự động, hồ sơ"><i class="ti ti-list-details"></i> Hàng đợi</button></div>
    <span class="apq" id="onb-apkho">${esc(apKhoText(AP?.brand, brands))}</span>
    <span class="apq" id="onb-apq">${esc(apQueue(AP?.st))}</span></div>`;
  async function apUpload(files) {
    const dz = HOME?.querySelector('#onb-apdrop'), q = HOME?.querySelector('#onb-apq');
    const vids = files.filter(f => /\.(mp4|mov|m4v|mkv|webm)$/i.test(f.name));
    if (vids.length < files.length) toast(`Bỏ qua ${files.length - vids.length} tệp không phải video`);
    if (!vids.length) return;
    dz?.classList.add('busy');
    let ok = 0;
    for (const [k, f] of vids.entries()) {
      if (q) q.textContent = `Đang chép ${k + 1}/${vids.length}: ${f.name} (${(f.size / 1048576).toFixed(0)} MB)…`;
      const u = `/api/autopilot/upload?name=${encodeURIComponent(f.name)}&profile=${encodeURIComponent(AP?.st?.settings?.profile || '')}&brand=${encodeURIComponent(AP?.brand || '')}`;
      const r = await fetch(u, { method: 'POST', body: f }).then(x => x.json()).catch(e => ({ error: e.message }));
      if (r.error) toast(`Lỗi “${f.name}”: ${r.error}`); else ok++;
    }
    dz?.classList.remove('busy');
    if (ok) toast(`Đã thêm ${ok} video vào hàng đợi Tự lái. Video chạy nền, bạn cứ làm việc khác.`);
    const st = await api('/api/autopilot/state').catch(() => null); if (st && !st.error && AP) AP.st = st;
    if (q) q.textContent = apQueue(AP?.st);
    Studio.autopilotRefresh?.(); pollAp();
  }
  function wireAp() {
    const dz = HOME.querySelector('#onb-apdrop'), fi = HOME.querySelector('#onb-apfile'); if (!dz) return;
    dz.addEventListener('click', () => fi.click());
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
    fi.addEventListener('change', () => { apUpload([...fi.files]); fi.value = ''; });
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); apUpload([...e.dataTransfer.files]); });
    HOME.querySelector('#onb-apbrand').addEventListener('change', e => { AP.brand = e.target.value; HOME.querySelector('#onb-apkho').textContent = apKhoText(AP.brand, AP.brands); api('/api/autopilot/settings', { brand: AP.brand }).catch(() => {}); });
  }
  async function openHome() {
    await loadState();
    const [brands, st, tpls] = await Promise.all([api('/api/brands').catch(() => null), api('/api/autopilot/state').catch(() => null), api('/api/templates').catch(() => [])]);
    const tplN = id => (Array.isArray(tpls) ? tpls : []).filter(t => t.brand_id === id).length; // S27 M189: mẫu của thương hiệu
    const nb = Array.isArray(brands) ? brands.length : -1;
    const bl = Array.isArray(brands) ? brands : [], saved = st?.settings?.brand || '';
    AP = { st: st && !st.error ? st : null, brand: apPickBrand({ saved, onboard: ST?.brand, brands: bl }), brands: bl }; // S26 M183
    if (AP.brand && AP.brand !== saved) api('/api/autopilot/settings', { brand: AP.brand }).catch(() => {}); // nhớ mặc định để hàng đợi và thư mục tự động cùng dùng
    hideHome();
    HOME = document.createElement('div'); HOME.id = 'onb-home';
    const p = purpose(ST?.purpose), rec = groupRecent(ST?.recent || []);
    const card = (act, ic, title, sub, small = '') => `<button class="card" data-h="${act}"><span class="ic"><i class="ti ${ic}"></i></span><div><b>${title}</b><span>${sub}</span>${small ? `<small>${small}</small>` : ''}</div></button>`;
    const kb = [...new Map(rec.filter(r => !r.gone).map(r => [r.brand || '', r.kho || 'Chung'])).entries()];
    // S26 M188: mỗi thương hiệu đã có một thẻ: tạo video mới cho thương hiệu đó, xem dự án của nó, sửa; thêm thẻ Thương hiệu mới
    const brandCard = b => {
      const t = b.title || b.name || b.id, live = rec.filter(r => !r.gone && r.brand === b.id), col = /^#[0-9a-f]{3,8}$/i.test(b.primary || '') ? b.primary : '';
      const last = live.reduce((m, r) => Math.max(m, +new Date(r.edited || r.t) || 0), 0);
      const info = [live.length ? `${live.length} dự án` : 'Chưa có dự án', last ? fmtAgo(last) : '', b.ws && !b.ws.exists ? 'Kho chưa tạo' : ''].filter(Boolean).join(' · ');
      return `<div class="bc"><div class="bt"><span class="lg"${col && !b.logoUrl ? ` data-col="${col}"` : ''}>${b.logoUrl ? `<img src="${esc(avsUrl(b.logoUrl))}" alt="">` : esc(t.trim().charAt(0).toUpperCase() || '?')}</span>
        <div><b title="${esc(t)}">${esc(t)}</b><small>${esc(info)}</small></div></div>
        <div class="ba"><button class="primary" data-h="bvid" data-bid="${esc(b.id)}"><i class="ti ti-video-plus"></i> Video mới</button>
          ${live.length ? `<button data-h="bproj" data-bid="${esc(b.id)}"><i class="ti ti-folders"></i> Dự án</button>` : ''}
          <button data-h="btpl" data-bid="${esc(b.id)}" title="Thư viện mẫu, mẫu của thương hiệu này đứng đầu"><i class="ti ti-layout-grid"></i> Mẫu${tplN(b.id) ? ` (${tplN(b.id)})` : ''}</button><span class="grow"></span>
          <button class="ghost" data-h="bedit" data-bid="${esc(b.id)}" title="Sửa thương hiệu ${esc(t)}" aria-label="Sửa thương hiệu ${esc(t)}"><i class="ti ti-pencil"></i></button></div></div>`;
    };
    HOME.innerHTML = `<div class="in"><div class="hd"><div class="grow"><h1>Bạn muốn làm video gì hôm nay?</h1><p class="sub">Chọn một cách bắt đầu. Studio dẫn bạn từng bước.</p></div>
      ${ST?.project ? '<button class="ghost" data-h="close" title="Về trình chỉnh sửa (Esc)"><i class="ti ti-x"></i> Đóng</button>' : ''}</div>
      <div class="cards">${card('new', 'ti-video-plus', 'Video mới', 'Chọn video quay sẵn rồi tự tay dựng: cắt, phụ đề, hiệu ứng, nhạc, xuất.', 'Trình chỉnh sửa')}
        ${apCard(Array.isArray(brands) ? brands : [])}</div>
      <div class="cards sm">${card('tpl', 'ti-layout-grid', 'Dựng theo mẫu', 'Chọn mẫu đẹp sẵn rồi thay chữ, ảnh, video.', p ? `Gợi ý cho ${p[2]}` : 'Gần 90 mẫu theo lĩnh vực')}
        ${card('long', 'ti-scissors', 'Cắt clip từ video dài', 'Livestream, podcast, buổi học: AI chọn đoạn hay.', 'Cắt clip')}
        ${card('batch', 'ti-stack-2', 'Làm hàng loạt', 'Từ file Excel hoặc CSV, nhiều video cùng mẫu.', 'Hàng loạt')}</div>
      ${bl.length ? `<div class="rhd"><h3>Thương hiệu</h3></div><div class="brs">${bl.map(brandCard).join('')}
        <button class="bc add" data-h="bnew"><i class="ti ti-plus"></i> Thương hiệu mới</button></div>` : ''}
      ${nb === 0 ? `<div class="prep"><i class="ti ti-briefcase"></i><div><b>Chưa có thương hiệu</b><small>Làm bước Chuẩn bị trước: thương hiệu (logo, màu, lời kết) và Kho chứa dự án, thành phẩm.</small></div>
        <button class="primary" data-h="prep"><i class="ti ti-arrow-right"></i> Chuẩn bị</button></div>` : ''}
      <div class="rhd"><h3>Dự án gần đây</h3>${rec.length > 1 ? `<input type="search" id="onb-q" placeholder="Tìm dự án theo tên" title="Gõ có dấu hay không dấu đều được" aria-label="Tìm dự án theo tên">` : ''}
        ${kb.length > 1 ? `<select id="onb-kb" aria-label="Lọc theo thương hiệu"><option value="*">Mọi thương hiệu</option>${kb.map(([id, t]) => `<option value="${esc(id)}">${esc(t)}</option>`).join('')}</select>` : ''}</div>
      ${rec.length ? `<div class="rec">${rec.map(projCard).join('')}</div><div class="empty" id="onb-none" hidden>Không có dự án khớp. Thử tên khác hoặc chọn Mọi thương hiệu.</div>`
        : '<div class="empty">Chưa có dự án nào. Bắt đầu bằng một trong các cách ở trên.</div>'}
      <div class="links"><button class="ghost" data-h="wiz"><i class="ti ti-route"></i> Xem lại hướng dẫn</button>
        <button class="ghost" data-h="sample" title="Mở một video mẫu có sẵn để xem Studio làm được gì"><i class="ti ti-player-play"></i> Xem thử dự án mẫu</button></div></div>`;
    HOME.querySelectorAll('.bc .lg[data-col]').forEach(e => { e.style.background = e.dataset.col; }); // màu chủ đạo của thương hiệu (giá trị người dùng, đã kiểm dạng #hex)
    HOME.addEventListener('click', onHome);
    HOME.addEventListener('input', e => e.target.id === 'onb-q' && filterRec());
    HOME.addEventListener('change', e => e.target.id === 'onb-kb' && filterRec());
    // thả tệp ra ngoài ô Tự lái: không để trình chỉnh sửa (đang mở bên dưới) chép tệp vào media/ của dự án
    for (const ev of ['dragover', 'drop']) HOME.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); });
    document.body.appendChild(HOME);
    wireAp();
    document.addEventListener('keydown', homeKey, true);
    pollThumbs(); pollAp();
  }
  async function onHome(e) {
    const r = e.target.closest('[data-r]');
    if (r) {
      if (r.classList.contains('cur')) return hideHome(); // dự án đang sửa: về trình chỉnh sửa
      if (r.disabled) return;
      const m = r.querySelector('small.mt');
      r.disabled = true; m.textContent = 'đang mở…';
      // S17 M126: lưu dự án đang mở trước khi đổi sang dự án khác; lưu không được thì dừng, không bỏ mất thay đổi
      if (ST?.project && Studio.TL) { await Studio.saveNow().catch(() => {}); if (Studio.dirty) { r.disabled = false; m.textContent = 'chưa lưu được dự án đang mở'; return; } }
      const j = await api('/api/onboarding/open', { i: +r.dataset.r }).catch(err => ({ error: err.message }));
      if (j.error) { toast(j.error); return openHome(); }
      return location.reload();
    }
    const b = e.target.closest('[data-h]'); if (!b) return;
    const a = b.dataset.h;
    if (a === 'close') return hideHome();
    if (a === 'new') { hideHome(); return document.getElementById('newproj')?.click(); }
    if (a === 'wiz' || a === 'prep') return openWizard(0);
    if (a === 'bnew') return openWizard(0, { fresh: true });
    if (a === 'bedit') return openWizard(0, { brand: b.dataset.bid });
    if (a === 'bvid') { hideHome(); return Studio.newProject ? Studio.newProject({ brand: b.dataset.bid }) : document.getElementById('newproj')?.click(); }
    if (a === 'btpl') return Studio.openTemplates?.({ brand: b.dataset.bid }); // thư viện nổi trên trang chủ; Dùng mẫu thì trang chủ đóng
    if (a === 'bproj') {
      const sel = HOME.querySelector('#onb-kb');
      if (sel && [...sel.options].some(o => o.value === b.dataset.bid)) { sel.value = b.dataset.bid; filterRec(); }
      return HOME.querySelector('.rec')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
  Studio.openHome = openHome; Studio.hideHome = hideHome;
  // Home button first in the header (logo removed to save space) (not addTopButton: 01_workflow moves step-less header buttons into the ⋯ menu).
  { const b = document.createElement('button'); b.id = 'onb-btn'; b.className = 'icon'; b.title = 'Trang chủ: cách bắt đầu nhanh, dự án gần đây, hướng dẫn';
    b.setAttribute('aria-label', 'Trang chủ'); b.innerHTML = '<i class="ti ti-home"></i>'; b.addEventListener('click', openHome);
    const top = document.querySelector('#top'); if (top) top.prepend(b); else Studio.addTopButton(b.outerHTML, openHome); }
  Studio.onReady(() => {
    let pid = null; try { pid = sessionStorage.getItem('avs-onb-tpl'); sessionStorage.removeItem('avs-onb-tpl'); } catch { /* không có sessionStorage */ }
    if (pid) openTemplates(pid === '-' ? '' : pid);
  });
  // The machine check (01_setup.js, S15 M115) comes first: wait for Studio.setupGate (set once 01_setup has loaded its state).
  const afterSetup = fn => setTimeout(() => (Studio.setupGate || Promise.resolve()).then(fn), 250);
  loadState().then(async s => {
    if (!s) return;
    if (!s.project) {
      await openHome();
      // boot() shows a "Chưa mở dự án" modal when nothing is open; the home screen replaces it.
      const mb = document.getElementById('modalbox');
      const drop = () => { if (mb && /Chưa mở dự án/.test(mb.textContent) && HOME && !document.getElementById('modal').hidden) { Studio.closeModal(); return true; } };
      if (mb && !drop()) { const mo = new MutationObserver(() => drop() && mo.disconnect()); mo.observe(mb, { childList: true }); setTimeout(() => mo.disconnect(), 15000); }
    }
    // S26 M188: đã có thương hiệu thì không tự mở hướng dẫn (trang chủ cho chọn thương hiệu cũ hay tạo mới); chỉ người chưa có thương hiệu mới được dẫn vào
    const nb = await brandCount();
    if (nb !== 0) return;
    if (!s.done && !s.skipped) afterSetup(() => openWizard());
    else if (!s.project) {
      // S17 M125: đã qua hướng dẫn nhưng chưa có thương hiệu: vào thẳng bước Chuẩn bị (Thương hiệu → Kho), mỗi phiên một lần
      let seen = false; try { seen = !!sessionStorage.getItem('avs-onb-prep'); sessionStorage.setItem('avs-onb-prep', '1'); } catch { /* không có sessionStorage */ }
      if (!seen) afterSetup(() => openWizard(0));
    }
  }).catch(e => console.error('onboarding', e));
})();
