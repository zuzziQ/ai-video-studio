// AI Video Studio — bố cục theo 5 bước (M82, đợt S10 trong docs/ROADMAP.md).
// Thanh bước giữa header (Chuẩn bị → Nguồn → Dựng → Kiểm tra → Xuất và đăng) + trang Cài đặt; thanh trái chỉ hiện
// công cụ của bước đang mở (tối đa 7 + "Thêm…"); menu ⋯ gom việc phụ; chế độ Cơ bản / Chuyên nghiệp lưu theo máy.
// Không bỏ tính năng nào: panel/nút chưa gắn bước rơi vào "Thêm…" của bước Dựng, nút trên header chưa gắn bước vào menu ⋯.
// Gắn bước/mức: Studio.addPanel(id, icon, name, fn, { step, level }) / Studio.addTopButton(html, fn, { step, level }),
// hoặc bảng PANELS / TOPS bên dưới cho panel có sẵn. Chỉ dùng biến CSS có sẵn (--bg*, --tx*, --acc*, --line*, --r, --rs).
'use strict';
(() => {
  const S = Studio, $ = s => document.querySelector(s), esc = S.esc;
  const DEFAULT_LEVEL = 'pro'; // C13 chưa chốt: đổi thành 'basic' khi chủ repo quyết người mới vào chế độ Cơ bản
  const MAX_RAIL = 7;
  const STEPS = [['prep', 'Chuẩn bị', 'ti-briefcase'], ['source', 'Nguồn', 'ti-video'], ['build', 'Dựng', 'ti-layers-subtract'],
    ['check', 'Kiểm tra', 'ti-shield-check'], ['ship', 'Xuất và đăng', 'ti-send']];
  const SETTINGS = ['settings', 'Cài đặt', 'ti-settings'];
  // id panel -> [bước, thứ tự, mức]. Mức 'pro' bị ẩn ở chế độ Cơ bản.
  const PANELS = {
    brands: ['prep', 1], products: ['prep', 2], media: ['prep', 3],
    'wf-new': ['source', 1], longform: ['source', 2], words: ['source', 3], ai: ['source', 4],
    autopilot: ['build', 1], 'wf-aihelp': ['build', 2], tpl: ['build', 3], text: ['build', 4], audio: ['build', 5], fx: ['build', 6], sticker: ['build', 7],
    trans: ['build', 8], filter: ['build', 9], aibroll: ['build', 10], autofill: ['build', 11], audioplus: ['build', 12], dub: ['build', 13],
    'wf-qc': ['check', 1], comp: ['check', 2, 'pro'],
    'wf-export': ['ship', 1], 'wf-publish': ['ship', 2], schedule: ['ship', 3], batch: ['ship', 4],
    'wf-mode': ['settings', 1], 'wf-engines': ['settings', 2], perf: ['settings', 3, 'pro'], agent: ['settings', 4, 'pro'], stylelab: ['settings', 5, 'pro'],
  };
  // nút header (id) -> 'park' (giấu, panel của bước làm thay) | 'menu' (vào ⋯). Nút không có ở đây và không có opts.step -> 'menu'.
  const TOPS = { 'ap-topbtn': 'park', aibtn: 'park', 'pub-btn': 'park', newproj: 'park', aspect: 'park', 'eng-btn': 'menu', 'app-reveal': 'menu', 'bk-sw': 'menu', fitall: 'menu' };
  const PRO_TABS = ['kf', 'mask', 'json']; // tab inspector ẩn ở Cơ bản: Keyframe, Mặt nạ, Nâng cao (JSON)

  const store = {
    get(k, d) { try { return localStorage.getItem('avs.' + k) || d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('avs.' + k, v); } catch {} },
  };
  let level = store.get('uiLevel', DEFAULT_LEVEL) === 'basic' ? 'basic' : 'pro';
  let step = store.get('step', '');
  const stepIds = [...STEPS.map(s => s[0]), 'settings'];
  if (!stepIds.includes(step)) step = '';
  const want = step; // bước lần trước (lưu theo máy), mở lại khi dự án sẵn sàng; trước đó thanh trái đi theo panel mặc định

  const css = document.createElement('style');
  css.textContent = `
  #wf-steps { display: flex; align-items: center; gap: 4px; flex: none; }
  #wf-steps button { height: 32px; padding: 0 12px 0 8px; gap: 8px; background: transparent; border-color: transparent; color: var(--tx2); font-size: 12px; font-weight: 600; }
  #wf-steps button b { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; background: var(--bg3); border: 1px solid var(--line2); color: var(--tx2); }
  #wf-steps button:hover { background: var(--bg3); color: var(--tx); }
  #wf-steps button.on { background: var(--acc-soft); color: var(--tx); border-color: var(--acc-line); }
  #wf-steps button.on b { background: var(--acc); border-color: var(--acc); color: var(--bg0); }
  #wf-steps .ln { width: 12px; height: 1px; background: var(--line3); flex: none; }
  #wf-morebtn.on { background: var(--bg3); color: var(--tx); }
  #wf-more { position: fixed; z-index: 60; min-width: 240px; padding: 4px; background: var(--bg2); border: 1px solid var(--line2); border-radius: var(--r); box-shadow: var(--shadow-raised); display: flex; flex-direction: column; gap: 4px; }
  #wf-more[hidden] { display: none; }
  #wf-more > button, #wf-more .selwrap select { width: 100%; justify-content: flex-start; height: 32px; padding: 0 8px; font-size: 13px; background: transparent; border-color: transparent; color: var(--tx); gap: 8px; }
  #wf-more > button:hover, #wf-more .selwrap select:hover { background: var(--bg3); }
  #wf-more .selwrap select { padding-left: 32px; }
  #wf-more .selwrap .ti { left: 8px; }
  #wf-more > button .pct { margin-left: auto; }
  #wf-more hr { border: 0; border-top: 1px solid var(--line); margin: 0 4px; width: calc(100% - 8px); }
  #wf-more .wf-lv { display: flex; align-items: center; gap: 8px; padding: 4px 8px; color: var(--tx2); font-size: 12px; }
  .wf-seg { display: inline-flex; background: var(--bg1); border: 1px solid var(--line2); border-radius: var(--rs); padding: 4px; gap: 4px; }
  .wf-seg button { height: 24px; padding: 0 8px; font-size: 12px; background: transparent; border-color: transparent; color: var(--tx2); }
  .wf-seg button.on { background: var(--bg4); color: var(--tx); }
  #rail button[hidden], #wf-park { display: none; }
  #rail button { height: 48px; } /* 7 công cụ + "Thêm…" vừa khung ở màn cao 800 */
  #rail button[data-wf="more"] .ti { color: var(--tx3); }
  #wf-pop { position: fixed; z-index: 60; min-width: 200px; padding: 4px; background: var(--bg2); border: 1px solid var(--line2); border-radius: var(--r); box-shadow: var(--shadow-raised); display: flex; flex-direction: column; gap: 4px; }
  #wf-pop button { justify-content: flex-start; height: 32px; padding: 0 8px; font-size: 13px; background: transparent; border-color: transparent; gap: 8px; }
  #wf-pop button:hover, #wf-pop button.on { background: var(--bg3); }
  .wf-card { border: 1px solid var(--line); background: var(--bg2); border-radius: var(--r); padding: 12px; margin: 4px 0 12px; display: flex; flex-direction: column; gap: 8px; }
  .wf-card h4 { margin: 0; font-size: 13px; display: flex; align-items: center; gap: 8px; }
  .wf-card p { margin: 0; color: var(--tx2); font-size: 12px; line-height: 1.5; }
  .wf-card button { align-self: flex-start; }
  .wf-card.pick { cursor: pointer; } .wf-card.pick:hover { border-color: var(--line3); } .wf-card.pick.on { border-color: var(--acc-line); background: var(--acc-soft); }
  .wf-hint { color: var(--tx3); font-size: 11px; line-height: 1.5; margin: 0 0 8px; }
  body.wf-basic .itabs ${PRO_TABS.map(k => `[data-itab="${k}"]`).join(', body.wf-basic .itabs ')} { display: none; }
  @media (max-width: 1180px) { #wf-steps button:not(.on) span { display: none; } #wf-steps button:not(.on) { padding: 0 6px; } #wf-steps .ln { width: 8px; } }
  `;
  document.head.appendChild(css);
  document.body.classList.toggle('wf-basic', level === 'basic');

  // ---------- header: thanh bước, ⋯, chỗ giấu nút ----------
  const top = $('#top');
  const park = document.createElement('div'); park.id = 'wf-park'; document.body.appendChild(park);
  const nav = document.createElement('nav'); nav.id = 'wf-steps'; nav.setAttribute('aria-label', 'Các bước làm video');
  nav.innerHTML = STEPS.map(([k, l], i) => `${i ? '<span class="ln"></span>' : ''}<button data-step="${k}" title="Bước ${i + 1}: ${l}"><b>${i + 1}</b><span>${l}</span></button>`).join('');
  const grow = top.querySelector('.grow');
  grow.after(nav); const grow2 = document.createElement('div'); grow2.className = 'grow'; nav.after(grow2);
  const moreBtn = document.createElement('button'); moreBtn.id = 'wf-morebtn'; moreBtn.className = 'icon'; moreBtn.title = 'Thêm: lịch sử, thư mục, mô hình, cài đặt';
  moreBtn.innerHTML = '<i class="ti ti-dots"></i>'; $('#save').before(moreBtn);
  const more = document.createElement('div'); more.id = 'wf-more'; more.hidden = true;
  more.innerHTML = `<div class="wf-lv"><span>Chế độ</span><div class="grow"></div><span class="wf-seg" data-wf="lv"></span></div><hr data-wf="tail">
    <button data-wf="settings"><i class="ti ti-settings"></i> Cài đặt…</button>`;
  document.body.appendChild(more);
  const tail = more.querySelector('[data-wf="tail"]');
  const LABEL = { fitall: 'Vừa khung (⇧Z)', 'app-reveal': 'Mở thư mục dự án' };
  const toMenu = el => {
    tail.before(el);
    if (!el.textContent.trim() && el.tagName === 'BUTTON') el.insertAdjacentHTML('beforeend', `<span>${esc(LABEL[el.id] || el.title || '')}</span>`); el.addEventListener('click', () => { if (!el.matches('#bk-sw')) closeMore(); }); };
  const toPark = el => park.appendChild(el);
  function placeTop(el, opts) {
    const how = TOPS[el.id] || (opts.step ? 'step' : 'menu');
    if (how === 'park') return toPark(el);
    if (how === 'menu') return toMenu(el);
    // nút mới gắn bước: giấu nút, thêm một mục trên thanh trái mở bằng nút đó
    toPark(el);
    const id = 'wf-btn-' + (el.id || Math.random().toString(36).slice(2, 8));
    PANELS[id] = [opts.step, 50, opts.level === 'pro' ? 'pro' : 'basic'];
    const ic = el.querySelector('.ti')?.className.split(' ').find(c => c.startsWith('ti-')) || 'ti-point';
    S.addPanel(id, ic, (el.textContent || el.title || 'Công cụ').trim().slice(0, 14), () => card(ic, el.textContent.trim() || el.title, el.title, 'Mở', () => el.click()));
  }
  S._top.push(placeTop);
  for (const id of ['newproj', 'aspect']) { const el = document.getElementById(id); if (el) toPark(el); }
  { const h = $('#history')?.closest('.selwrap'); if (h) toMenu(h); const f = $('#fitall'); if (f) toMenu(f); }
  // tính năng đã gọi addTopButton trước khi file này chạy (không có ở bản hiện tại, phòng khi đổi thứ tự)
  for (const el of [...top.children]) if (el.matches('button.ghost:not(#export):not(#save)')) placeTop(el, {});

  function renderLv() {
    for (const seg of document.querySelectorAll('[data-wf="lv"]'))
      seg.innerHTML = [['basic', 'Cơ bản'], ['pro', 'Chuyên nghiệp']].map(([k, l]) => `<button data-lv="${k}" class="${level === k ? 'on' : ''}">${l}</button>`).join('');
  }
  function setLevel(v) {
    level = v === 'basic' ? 'basic' : 'pro'; store.set('uiLevel', level);
    document.body.classList.toggle('wf-basic', level === 'basic');
    renderLv(); renderRail(); fixInspTab();
    if (panel === 'wf-mode') renderPanel();
    S.toast(level === 'basic' ? 'Chế độ Cơ bản: ẩn công cụ nâng cao' : 'Chế độ Chuyên nghiệp: hiện đủ công cụ');
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-lv]'); if (b && b.closest('[data-wf="lv"]')) setLevel(b.dataset.lv); });

  function openMore() {
    renderLv(); more.hidden = false; moreBtn.classList.add('on');
    const r = moreBtn.getBoundingClientRect();
    more.style.top = r.bottom + 4 + 'px'; more.style.left = Math.max(8, Math.min(innerWidth - more.offsetWidth - 8, r.right - more.offsetWidth)) + 'px';
  }
  function closeMore() { more.hidden = true; moreBtn.classList.remove('on'); }
  moreBtn.addEventListener('click', () => (more.hidden ? openMore() : closeMore()));
  document.addEventListener('mousedown', e => {
    if (!more.hidden && !more.contains(e.target) && !moreBtn.contains(e.target) && !e.target.closest('#bk-menu')) closeMore();
    const pop = $('#wf-pop'); if (pop && !pop.contains(e.target) && !e.target.closest('[data-wf="more"]')) pop.remove();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMore(); $('#wf-pop')?.remove(); } });
  more.querySelector('[data-wf="settings"]').addEventListener('click', () => { closeMore(); goStep('settings'); });

  // ---------- thanh trái theo bước ----------
  const meta = id => {
    const o = S._popts[id] || {}, t = PANELS[id];
    const st = stepIds.includes(o.step) ? o.step : t ? t[0] : 'build';
    return { step: st, order: t ? t[1] : 100, level: o.level === 'pro' || (!o.level && t?.[2] === 'pro') ? 'pro' : 'basic', known: !!(t || stepIds.includes(o.step)) };
  };
  let overflow = [];
  function filterRail(rail) {
    if (!step) step = meta(panel).step;
    if (meta(panel).step !== step) step = meta(panel).step; // panel mở từ nơi khác (nút, liên kết): đi theo bước của panel
    store.set('step', step);
    const btns = [...rail.querySelectorAll('button[data-p]')];
    const mine = btns.filter(b => { const m = meta(b.dataset.p); return m.step === step && (level === 'pro' || m.level === 'basic' || b.dataset.p === panel); })
      .sort((a, b) => { const x = meta(a.dataset.p), y = meta(b.dataset.p); return (x.known === y.known ? 0 : x.known ? -1 : 1) || x.order - y.order; });
    for (const b of btns) b.hidden = true;
    const shown = mine.slice(0, MAX_RAIL); overflow = mine.slice(MAX_RAIL);
    const cur = overflow.find(b => b.dataset.p === panel);
    for (const b of shown) { b.hidden = false; rail.appendChild(b); }
    if (cur) { cur.hidden = false; rail.appendChild(cur); }
    if (overflow.length) {
      const m = document.createElement('button'); m.dataset.wf = 'more'; m.title = 'Công cụ khác của bước này';
      m.innerHTML = `<i class="ti ti-dots-circle-horizontal"></i><span>Thêm…</span>`; rail.appendChild(m);
    }
    for (const b of nav.querySelectorAll('[data-step]')) b.classList.toggle('on', b.dataset.step === step);
  }
  S._rail.push(filterRail);
  $('#rail').addEventListener('click', e => {
    const m = e.target.closest('[data-wf="more"]'); if (!m) return;
    if ($('#wf-pop')) return $('#wf-pop').remove();
    const pop = document.createElement('div'); pop.id = 'wf-pop';
    pop.innerHTML = overflow.map(b => `<button data-p="${esc(b.dataset.p)}" class="${b.dataset.p === panel ? 'on' : ''}">${b.querySelector('.ti').outerHTML}${esc(b.textContent.trim())}</button>`).join('');
    const r = m.getBoundingClientRect(); pop.style.left = r.right + 8 + 'px'; pop.style.top = Math.min(r.top, innerHeight - 44 * overflow.length - 16) + 'px';
    pop.onclick = ev => { const b = ev.target.closest('[data-p]'); if (b) { pop.remove(); openPanel(b.dataset.p); } };
    document.body.appendChild(pop);
  });
  function firstOf(st) {
    return RAIL.map(r => r[0]).filter(id => { const m = meta(id); return m.step === st && (level === 'pro' || m.level === 'basic'); })
      .sort((a, b) => meta(a).order - meta(b).order)[0];
  }
  function goStep(st) { step = st; const id = firstOf(st); if (id) openPanel(id); else renderRail(); }
  nav.addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) goStep(b.dataset.step); });

  // ---------- panel do bước thêm: thẻ giải thích + nút làm việc ----------
  function card(ic, title, desc, label, fn) {
    $('#libbody').innerHTML = `<div class="wf-card"><h4><i class="ti ${ic}"></i>${esc(title)}</h4><p>${esc(desc || '')}</p>
      <button class="primary" data-wf="go"><i class="ti ${ic}"></i>${esc(label)}</button></div>`;
    $('#libbody [data-wf="go"]').onclick = fn;
  }
  const clickEl = (id, miss) => () => { const el = document.getElementById(id); if (el) el.click(); else S.toast(miss); };
  S.addPanel('wf-new', 'ti-video-plus', 'Video mới', () => card('ti-video-plus', 'Tạo dự án từ video thô',
    'Chọn một video quay sẵn: Studio tách lời thoại, làm phụ đề và mở dự án mới để dựng.', 'Chọn video', clickEl('newproj', 'Chưa có nút Video mới')));
  S.addPanel('wf-aihelp', 'ti-wand', 'AI dựng', () => card('ti-wand', 'AI dựng giúp',
    'Claude đọc lời thoại rồi đặt graphic, phụ đề, nhạc và hiệu ứng âm thanh. Bạn xem lại và sửa từng thứ sau.', 'Mở AI dựng giúp', clickEl('aibtn', 'Tính năng AI chưa sẵn sàng')));
  S.addPanel('wf-qc', 'ti-shield-check', 'Kiểm tra', () => {
    // thẻ "Kiểm tra chất lượng" và "Nhiều phiên bản" của 16_qc.js tự chèn vào panel có [data-ai="open"]
    $('#libbody').innerHTML = `<p class="wf-hint">Soi lỗi trước khi xuất: chữ tràn khung, graphic che mặt, phụ đề quá dài, đoạn trống, âm lượng.</p><span data-ai="open" hidden></span>`;
  });
  S.addPanel('wf-export', 'ti-upload', 'Xuất', () => card('ti-upload', 'Xuất video',
    'Chọn khổ hình (9:16, 1:1, 16:9) và chất lượng, rồi dựng ra file MP4.', 'Xuất video', clickEl('export', 'Chưa có nút Xuất')));
  S.addPanel('wf-publish', 'ti-send', 'Đăng', () => card('ti-send', 'Gói đăng mạng xã hội',
    'Caption, hashtag và ảnh bìa cho TikTok, YouTube, Facebook từ video vừa xuất.', 'Mở gói đăng', clickEl('pub-btn', 'Tính năng Đăng chưa sẵn sàng')));
  S.addPanel('wf-engines', 'ti-cpu', 'Mô hình', () => card('ti-cpu', 'Mô hình & giọng',
    'Chọn mô hình viết chữ (Claude hoặc Ollama chạy trên máy) và giọng đọc VieNeu.', 'Mở cài đặt mô hình', clickEl('eng-btn', 'Tính năng Mô hình & giọng chưa sẵn sàng')));
  S.addPanel('wf-mode', 'ti-adjustments', 'Giao diện', () => {
    const opt = (k, ic, t, d) => `<div class="wf-card pick ${level === k ? 'on' : ''}" data-lv="${k}"><h4><i class="ti ${ic}"></i>${t}</h4><p>${d}</p></div>`;
    $('#libbody').innerHTML = `<p class="wf-hint">Đổi lúc nào cũng được, lưu trên máy này.</p><div data-wf="lv">
      ${opt('basic', 'ti-user', 'Cơ bản', 'Ẩn công cụ nâng cao: Keyframe, Mặt nạ, tham số JSON, Agent, Tạo style, Hiệu năng, Thành phần.')}
      ${opt('pro', 'ti-user-star', 'Chuyên nghiệp', 'Hiện đủ mọi công cụ.')}</div>`;
  });

  // ---------- inspector: ở Cơ bản, tab đang mở bị ẩn thì chuyển về tab đầu ----------
  function fixInspTab() {
    if (level !== 'basic') return;
    const on = $('#insp .itabs button.on');
    if (on && PRO_TABS.includes(on.dataset.itab)) [...document.querySelectorAll('#insp .itabs button')].find(b => !PRO_TABS.includes(b.dataset.itab))?.click();
  }
  const insp = $('#insp'); if (insp) new MutationObserver(fixInspTab).observe(insp, { childList: true });

  S.onReady(() => { if (want && meta(panel).step !== want) goStep(want); else renderRail(); });
  renderRail();
})();
