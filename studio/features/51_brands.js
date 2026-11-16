// Brand kit nhiều thương hiệu: lưu trong ~/.ai-video-studio/brands.json, áp cho dự án (TL.brand + logo vào media/), đổi nhanh trên thanh trên.
(() => {
  const { $, esc } = Studio;
  const FONTS = [['', 'Mặc định của gói'], ['"Be Vietnam Pro", sans-serif', 'Be Vietnam Pro'], ['"Montserrat", sans-serif', 'Montserrat'], ['"Inter", sans-serif', 'Inter'],
    ['"Lexend", sans-serif', 'Lexend'], ['"Nunito", sans-serif', 'Nunito'], ['"Oswald", sans-serif', 'Oswald'], ['"Playfair Display", serif', 'Playfair Display'],
    ['"DM Serif Display", serif', 'DM Serif Display'], ['"Bungee", sans-serif', 'Bungee'], ['"Pacifico", cursive', 'Pacifico']];
  const KEYS = ['primary', 'accent', 'dark', 'light', 'font', 'disp', 'logo', 'name', 'handle', 'phone', 'website', 'outro', 'kit'];
  const DEF = { primary: '#FF5A36', accent: '#FFD84A', dark: '#111214', light: '#FFFFFF' }; // design-token-ok: màu mặc định của brand kit là dữ liệu video, không phải màu giao diện
  // Màu brand (dữ liệu người dùng) đặt bằng biến CSS sau khi chèn HTML: data-bkc → --bk-c, data-bkbg/data-bkfg → --bk-bg/--bk-fg.
  const paint = root => root.querySelectorAll('[data-bkc],[data-bkbg],[data-bkfg]').forEach(el => {
    if (el.dataset.bkc) el.style.setProperty('--bk-c', el.dataset.bkc);
    if (el.dataset.bkbg) el.style.setProperty('--bk-bg', el.dataset.bkbg);
    if (el.dataset.bkfg) el.style.setProperty('--bk-fg', el.dataset.bkfg);
  });
  let LIST = null, EDIT = null, AI = null, AI_FOR = null; // AI: ô Gợi ý bằng AI (05_assist.js) của bản đang sửa
  const css = document.createElement('style');
  css.textContent = `
  .bk-card { background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); padding: var(--space-3); margin: var(--space-2) 0; transition: border-color var(--duration-fast) var(--ease-standard); }
  .bk-card.cur { border-color: rgb(var(--color-accent-text)); box-shadow: inset 0 0 0 1px rgb(var(--color-accent-text)); background: rgb(var(--color-accent-soft) / .14); }
  .bk-top { display: flex; gap: var(--space-3); align-items: center; }
  .bk-logo { width: var(--h-lg); height: var(--h-lg); border-radius: var(--radius-control); background: var(--bk-bg, rgb(var(--color-surface-hover))); color: var(--bk-fg, rgb(var(--color-fg))); display: flex; align-items: center; justify-content: center; overflow: hidden; flex: none; font-weight: 800; font-size: var(--text-md); }
  .bk-logo img { width: 100%; height: 100%; object-fit: contain; }
  .bk-nm { min-width: 0; flex: 1; } .bk-nm b { display: block; font-size: var(--text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .bk-nm small { color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bk-sw { display: flex; gap: var(--space-1); margin-top: var(--space-2); } .bk-sw i { flex: 1; height: 16px; border-radius: var(--radius-xs); border: 1px solid rgb(var(--color-white) / .08); background: var(--bk-c); }
  .bk-act { display: flex; gap: var(--space-1); margin-top: var(--space-2); } .bk-act button { padding: var(--space-1) var(--space-2); font-size: var(--text-2xs); } .bk-act .grow { flex: 1; }
  .bk-title { font-size: var(--text-sm); }
  .bk-kho { display: flex; width: 100%; min-width: 0; gap: var(--space-1); align-items: center; justify-content: flex-start; margin-top: var(--space-2); padding: var(--space-1) var(--space-2); font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); background: transparent; border-color: transparent; }
  .bk-kho:hover { color: rgb(var(--color-fg)); background: rgb(var(--color-surface-hover)); }
  .bk-kho span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; } .bk-kho small { color: rgb(var(--color-warning-text)); }
  .bk-form label { display: block; font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); margin: var(--space-2) 0 var(--space-1); }
  .bk-intro { margin-top: var(--space-1); }
  .bk-g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 var(--space-2); } .bk-g4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0 var(--space-2); }
  .bk-up { display: flex; gap: var(--space-2); align-items: center; }
  .bk-up .bk-pick { padding: 0; border: 1px dashed rgb(var(--color-line-strong)); cursor: pointer; } .bk-up .bk-pick:hover { border-color: rgb(var(--color-accent-text)); }
  .bk-up small { color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); }
  #bk-menu { position: fixed; z-index: 60; background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-card); padding: var(--space-2); min-width: 230px; box-shadow: var(--shadow-overlay); }
  #bk-menu button { width: 100%; background: transparent; border-color: transparent; justify-content: flex-start; padding: var(--space-2); }
  #bk-menu button:hover { background: rgb(var(--color-surface-hover)); } #bk-menu .dots { display: inline-flex; gap: var(--space-050); } #bk-menu .dots i { width: 10px; height: 10px; border-radius: var(--radius-pill); background: var(--bk-c); }
  #bk-menu .bk-cur { margin-left: auto; color: rgb(var(--color-accent-text)); }
  #bk-menu hr { border: 0; border-top: 1px solid rgb(var(--color-line)); margin: var(--space-1) 0; }
  #bk-sw .sw { width: 12px; height: 12px; border-radius: var(--radius-xs); display: inline-block; background: rgb(var(--color-surface-hover)); }
  #bk-sw .ti-chevron-down { font-size: var(--text-sm); }
  #bk-sw b { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }`;
  document.head.appendChild(css);
  const active = () => document.querySelector('#rail .on')?.dataset.p === 'brands';
  const cur = () => Studio.TL?.brand?.kit;
  const packs = () => (Studio.win?.PACKS || []).map(p => [p.id, p.icon + ' ' + p.name]);
  async function load() { const r = await Studio.api('/api/brands'); LIST = Array.isArray(r) ? r : []; updateSwitch(); if (active()) render(); }

  async function apply(id) {
    const r = await Studio.api('/api/brands/apply', { id });
    if (r.error) return Studio.toast(r.error);
    Studio.pushUndo('brandkit');
    const keep = Object.fromEntries(Object.entries(Studio.TL.brand || {}).filter(([k]) => !KEYS.includes(k)));
    Studio.TL.brand = { ...keep, ...r.brand };
    let msg = `Đã áp thương hiệu “${r.title}”`;
    // PACKS is empty until the engine iframe has loaded: only call a pack missing when the list is known.
    const known = Studio.win?.PACKS || [], packOk = r.pack && (!known.length || known.some(p => p.id === r.pack));
    if (r.pack && !packOk) msg += ` (gói “${r.pack}” không còn trên máy này — giữ gói hiện tại)`;
    else if (r.pack && r.pack !== Studio.TL.pack && confirm(`Thương hiệu này dùng gói style mặc định “${r.pack}”. Đổi gói của dự án sang gói này?`)) { Studio.TL.pack = r.pack; msg += ' + đổi gói (bấm “Dựng tự động theo gói” nếu muốn dựng lại)'; }
    Studio.changed(); updateSwitch(); Studio.toast(msg);
    if (active()) render();
  }
  function card(b) {
    const ini = (b.name || b.title || '?').split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase();
    return `<div class="bk-card ${cur() === b.id ? 'cur' : ''}"><div class="bk-top"><div class="bk-logo" data-bkbg="${esc(b.primary || '')}" data-bkfg="${esc(b.light || '')}">${b.logoUrl ? `<img src="${esc(avsUrl(b.logoUrl))}">` : esc(ini)}</div>
      <div class="bk-nm"><b>${esc(b.title || b.name)}</b><small>${esc([b.name, b.handle, b.phone].filter(Boolean).join(' · ') || 'chưa có thông tin')}</small></div>${cur() === b.id ? '<span class="pill">đang dùng</span>' : ''}</div>
      <div class="bk-sw">${['primary', 'accent', 'dark', 'light'].map(k => `<i title="${k} ${esc(b[k] || DEF[k])}" data-bkc="${esc(b[k] || DEF[k])}"></i>`).join('')}</div>
      ${b.ws ? `<button type="button" class="bk-kho" data-bkk="${esc(b.id)}" title="${esc(b.ws.root)}"><i class="ti ti-folder"></i><span>${esc(b.ws.root)}</span>${b.ws.exists ? '' : '<small>chưa tạo</small>'}</button>` : ''}
      <div class="bk-act"><button class="primary" data-bka="${esc(b.id)}"><i class="ti ti-check"></i> Áp dụng cho dự án</button><span class="grow"></span>
        <button class="icon" title="Sửa" data-bke="${esc(b.id)}"><i class="ti ti-pencil"></i></button><button class="icon" title="Nhân bản" data-bkd="${esc(b.id)}"><i class="ti ti-copy"></i></button><button class="icon danger" title="Xoá" data-bkx="${esc(b.id)}"><i class="ti ti-trash"></i></button></div></div>`;
  }
  function form() {
    const b = EDIT, inp = (k, l, ph = '') => `<div><label>${l}</label><input data-bk="${k}" value="${esc(b[k] || '')}" placeholder="${esc(ph)}"></div>`;
    const col = (k, l) => `<div><label>${l}</label><input type="color" data-bk="${k}" value="${esc(b[k] || DEF[k])}"></div>`;
    const sel = (k, l, opts) => `<div><label>${l}</label><select data-bk="${k}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${(b[k] || '') === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
    return `<div class="bk-card bk-form"><b class="bk-title">${b.id ? 'Sửa thương hiệu' : 'Thương hiệu mới'}</b>
      ${inp('title', 'Tên bộ nhận diện (chỉ để bạn phân biệt)', 'VD: Kênh BĐS Sài Gòn')}
      <div class="bk-g4">${col('primary', 'Màu chính')}${col('accent', 'Màu nhấn')}${col('dark', 'Nền tối')}${col('light', 'Chữ sáng')}</div>
      <div class="bk-g2">${sel('font', 'Font chữ', FONTS)}${sel('disp', 'Font tiêu đề', FONTS)}</div>
      <label>Logo (PNG nền trong là đẹp nhất)</label><div class="bk-up"><button type="button" class="bk-logo bk-pick" id="bk-logo-pv" title="Chọn logo" aria-label="Chọn logo">${b.logoUrl ? `<img src="${esc(avsUrl(b.logoUrl))}" alt="">` : '<i class="ti ti-photo"></i>'}</button>
        <button type="button" id="bk-logo"><i class="ti ti-upload"></i> ${b.logoUrl ? 'Đổi logo' : 'Tải logo'}</button><input type="file" id="bk-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>${b.id ? '' : '<small>Thương hiệu sẽ được lưu khi bạn chọn logo</small>'}</div>
      ${Studio.assistPanel ? '<div id="bk-ai"></div>' : ''}
      <div class="bk-g2">${inp('name', 'Tên hiển thị trong video', 'Kiệm AI')}${inp('handle', 'Kênh / handle', '@kiem.ai')}${inp('phone', 'Điện thoại', '09xx xxx xxx')}${inp('website', 'Website', 'vidu.vn')}</div>
      ${sel('pack', 'Gói style mặc định', [['', '— không đổi gói —'], ...packs()])}
      ${inp('outro', 'Câu kết / CTA (dùng {{brand.outro}} trong mẫu)', 'Follow để xem thêm!')}
      <div class="bk-g2">${inp('slogan', 'Slogan', 'Nhà đẹp, giá thật')}${inp('cta', 'Lời kêu gọi ngắn', 'Gọi ngay')}</div>
      ${inp('voice', 'Giọng văn (AI dùng khi viết lời)', 'thân thiện, rõ ràng, tin cậy')}
      <div class="acts"><button class="primary" id="bk-save"><i class="ti ti-device-floppy"></i> Lưu</button><button id="bk-cancel">Huỷ</button></div></div>`;
  }
  function render() {
    $('#libact').innerHTML = `<button class="icon" id="bk-new" title="Thương hiệu mới"><i class="ti ti-plus"></i></button>`;
    $('#bk-new').onclick = () => { EDIT = { ...DEF }; render(); };
    if (!LIST) { $('#libbody').innerHTML = '<div class="help">Đang tải…</div>'; return; }
    $('#libbody').innerHTML = `<div class="help bk-intro">Lưu nhiều bộ nhận diện (màu, font, logo, liên hệ) dùng lại cho mọi dự án và cho <b>Làm hàng loạt</b>. Lưu ở <code>~/.ai-video-studio/brands.json</code>.</div>
      ${EDIT ? form() : ''}
      ${LIST.map(card).join('') || (EDIT ? '' : '<div class="help">Chưa có thương hiệu nào.</div>')}
      <div class="acts"><button id="bk-new2"><i class="ti ti-plus"></i> Thương hiệu mới</button><button id="bk-fromproj" title="Lấy màu, tên, liên hệ đang đặt trong dự án này"><i class="ti ti-download"></i> Lưu từ dự án này</button></div>`;
    bind();
  }
  function bind() {
    const B = $('#libbody');
    paint(B);
    $('#bk-new2').onclick = () => { EDIT = { ...DEF }; render(); };
    $('#bk-fromproj').onclick = () => { const t = Studio.TL.brand || {}; EDIT = { ...DEF, ...Object.fromEntries(['primary', 'accent', 'dark', 'light', 'font', 'disp', 'name', 'handle', 'phone', 'website'].filter(k => t[k]).map(k => [k, t[k]])), title: t.name || Studio.META.name, pack: Studio.TL.pack || '' }; render(); };
    B.querySelectorAll('[data-bka]').forEach(b => (b.onclick = () => apply(b.dataset.bka)));
    B.querySelectorAll('[data-bkk]').forEach(b => (b.onclick = () => (Studio.kho ? Studio.kho.open(b.dataset.bkk) : null)));
    B.querySelectorAll('[data-bke]').forEach(b => (b.onclick = () => { EDIT = { ...LIST.find(x => x.id === b.dataset.bke) }; render(); B.scrollTop = 0; }));
    B.querySelectorAll('[data-bkd]').forEach(b => (b.onclick = async () => { const r = await Studio.api('/api/brands/duplicate', { id: b.dataset.bkd }); if (r.error) return Studio.toast(r.error); await load(); Studio.toast('Đã nhân bản'); }));
    B.querySelectorAll('[data-bkx]').forEach(b => (b.onclick = async () => { const x = LIST.find(y => y.id === b.dataset.bkx); if (!confirm(`Xoá thương hiệu “${x.title || x.name}”? (dự án đã áp vẫn giữ màu)`)) return; await Studio.api('/api/brands/delete', { id: x.id }); await load(); }));
    if (!EDIT) return;
    mountAi();
    B.querySelectorAll('[data-bk]').forEach(i => (i.oninput = i.onchange = () => (EDIT[i.dataset.bk] = i.value)));
    $('#bk-cancel').onclick = () => { EDIT = null; render(); };
    $('#bk-save').onclick = async () => {
      const { logoUrl, ws, workspace, ...brand } = EDIT; // ws/workspace: Kho do /api/kho ghi. Ô AI giữ ngoài EDIT (AI, AI_FOR) nên không lọt vào dữ liệu lưu
      const r = await Studio.api('/api/brands/save', { brand });
      if (r.error) return Studio.toast(r.error);
      EDIT = null; await load(); Studio.toast('Đã lưu thương hiệu “' + (r.title || r.name) + '”');
      if (cur() === r.id && confirm('Thương hiệu này đang dùng cho dự án — áp lại các thay đổi?')) apply(r.id);
    };
    // The file picker opens straight from the click (a picker opened after an await can lose the user gesture). A brand that was
    // never saved has no id for /api/brands/logo yet, so it is saved first (same rule as "Lưu": needs a name), then the logo goes up.
    $('#bk-logo').onclick = $('#bk-logo-pv').onclick = () => $('#bk-file').click();
    $('#bk-file').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      if (!EDIT.id) {
        const { logoUrl, ws, workspace, ...brand } = EDIT;
        const s = await Studio.api('/api/brands/save', { brand });
        if (s.error) return Studio.toast(s.error === 'Đặt tên thương hiệu trước khi lưu' ? 'Đặt tên thương hiệu trước, rồi chọn logo' : s.error);
        EDIT.id = s.id;
      }
      const r = await fetch(`/api/brands/logo?id=${encodeURIComponent(EDIT.id)}&name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f }).then(x => x.json()).catch(() => ({ error: 'Không tải được logo, thử lại' }));
      if (r.error) { await load(); return Studio.toast(r.error); }
      EDIT.logo = r.logo; EDIT.logoUrl = r.logoUrl; await load(); Studio.toast(r.khoWarning || 'Đã tải logo (bản gốc cũng lưu trong Kho › Thuong hieu)');
    };
  }
  // ---- Gợi ý bằng AI (M91): logo đã tải + màu đo bằng canvas + website + tên → đề xuất từng trường, Nhận mới ghi vào form ----
  const fontName = v => (FONTS.find(f => f[0] === v) || [])[1] || v;
  function mountAi() {
    const host = document.getElementById('bk-ai'); if (!host) return;
    if (AI_FOR !== EDIT) {
      AI_FOR = EDIT;
      AI = Studio.assistPanel({
        name: 'brand', label: 'Gợi ý bằng AI', hint: 'Từ logo, tên và website: vai trò 4 màu, cặp font tiếng Việt, giọng văn, slogan, CTA, chữ màn kết.',
        async input() {
          const b = AI_FOR, inp = { name: b.name || b.title || '', website: b.website || '', colors: [] };
          if (b.logoUrl) {
            const blob = await fetch(avsUrl(b.logoUrl)).then(r => r.blob());
            inp.image = await Studio.imagePayload(blob);
            if (Studio.logoColors) inp.colors = (await Studio.logoColors(blob).catch(() => [])).filter(Boolean);
          }
          inp.industry = (await Studio.onboardingPurpose?.().catch(() => '')) || '';
          if (!inp.image && !inp.website && !inp.name) throw new Error('Tải logo, nhập tên hoặc website trước khi hỏi AI.');
          return inp;
        },
        current: f => (AI_FOR[f.key] ? (f.kind === 'font' ? fontName(AI_FOR[f.key]) : AI_FOR[f.key]) : ''),
        onAccept: f => { AI_FOR[f.key] = f.value; if (AI_FOR === EDIT) render(); },
      });
    }
    AI.mount(host);
  }
  // ---- quick switcher (top bar) ----
  let sw = null;
  function updateSwitch() {
    if (!sw) return;
    const b = LIST?.find(x => x.id === cur());
    sw.querySelector('b').textContent = b ? b.title || b.name : 'Thương hiệu';
    sw.querySelector('.sw').style.background = b?.primary || Studio.TL?.brand?.primary || 'rgb(var(--color-surface-hover))';
  }
  function menu() {
    document.getElementById('bk-menu')?.remove();
    const r = sw.getBoundingClientRect(), m = document.createElement('div'); m.id = 'bk-menu';
    m.style.top = r.bottom + 6 + 'px'; m.style.left = Math.min(innerWidth - 250, r.left) + 'px';
    m.innerHTML = (LIST || []).map(b => `<button data-bkm="${esc(b.id)}"><span class="dots"><i data-bkc="${esc(b.primary || DEF.primary)}"></i><i data-bkc="${esc(b.accent || DEF.accent)}"></i></span>${esc(b.title || b.name)}${cur() === b.id ? ' <i class="ti ti-check bk-cur"></i>' : ''}</button>`).join('')
      + `${LIST?.length ? '<hr>' : ''}<button data-bkm=""><i class="ti ti-settings"></i> Quản lý thương hiệu…</button>`;
    paint(m);
    document.body.appendChild(m);
    m.onclick = e => { const b = e.target.closest('[data-bkm]'); if (!b) return; m.remove(); if (b.dataset.bkm) apply(b.dataset.bkm); else document.querySelector('#rail [data-p="brands"]')?.click(); };
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off); } }), 0);
  }
  Studio.addPanel('brands', 'ti-palette', 'Thương hiệu', () => { render(); load(); }); // nạp lại: hướng dẫn lần đầu có thể vừa lưu thương hiệu
  Studio.onReady(() => {
    sw = Studio.addTopButton('<button class="ghost" id="bk-sw" title="Đổi nhanh thương hiệu"><span class="sw"></span><b>Thương hiệu</b><i class="ti ti-chevron-down"></i></button>', menu);
    load();
  });
})();
