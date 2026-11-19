// AI Video Studio — ô tìm công cụ ⌘K / Ctrl K (M84, đợt S10).
// Tìm mọi panel trên thanh trái (kể cả panel đang ẩn theo bước), 5 bước + Cài đặt và các lệnh (Lưu, Xuất, Hoàn tác…).
// Gõ không dấu vẫn khớp ("xuat" → Xuất, "broll" → B-roll). ↑↓ chọn, Enter mở, Esc đóng. Editor không có phím tắt K nào khác.
// S22 M151 (C24): ở chế độ Cơ bản vẫn tìm thấy công cụ chỉ có ở Chuyên nghiệp (nhãn "Chuyên nghiệp"); chọn thì hộp hỏi
// "Mở ở Chuyên nghiệp" (đổi chế độ rồi mở) hoặc "Chỉ mở lần này" (giữ Cơ bản) — không công cụ nào mất.
'use strict';
(() => {
  const S = Studio, $ = s => document.querySelector(s), esc = S.esc;
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const KEY = MAC ? '⌘K' : 'Ctrl K';
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const click = id => () => { const el = document.getElementById(id); if (el) el.click(); else S.toast('Tính năng này chưa sẵn sàng'); };
  const W = () => S.workflow;
  const STEP_N = { prep: '①', source: '②', build: '③', check: '④', ship: '⑤', settings: '⚙', queue: 'Tự lái' };

  // lệnh: [nhãn, icon, từ khoá thêm, việc, điều kiện hiện]
  const COMMANDS = [
    ['Lưu dự án', 'ti-device-floppy', 'save luu ctrl s', click('save'), () => !!S.TL],
    ['Xuất video', 'ti-upload', 'export render mp4 xuat file', click('export'), () => !!S.TL],
    ['Hoàn tác', 'ti-arrow-back-up', 'undo hoan tac ctrl z', click('undo'), () => !!S.TL],
    ['Làm lại', 'ti-arrow-forward-up', 'redo lam lai', click('redo'), () => !!S.TL],
    ['Mở Cài đặt', 'ti-settings', 'settings cai dat tuy chinh', () => W()?.goStep('settings'), () => !!W()],
    ['Chế độ Cơ bản', 'ti-user', 'basic mode che do co ban don gian', () => W()?.setLevel('basic'), () => W()?.level === 'pro'],
    ['Chế độ Chuyên nghiệp', 'ti-user-star', 'pro mode che do chuyen nghiep nang cao', () => W()?.setLevel('pro'), () => W()?.level === 'basic'],
    ['Video mới từ file', 'ti-video-plus', 'new project du an moi tao', click('newproj'), () => !!document.getElementById('newproj')],
    ['Đổi nhanh thương hiệu', 'ti-palette', 'brand kit thuong hieu doi', click('bk-sw'), () => !!document.getElementById('bk-sw')],
    ['Gói đăng mạng xã hội', 'ti-send', 'publish dang tiktok youtube facebook caption hashtag', click('pub-btn'), () => !!document.getElementById('pub-btn')],
    ['Mô hình & giọng', 'ti-cpu', 'llm claude ollama giong doc voice model', click('eng-btn'), () => !!document.getElementById('eng-btn')],
    ['Vừa khung', 'ti-arrows-maximize', 'fit vua khung zoom', click('fitall'), () => !!document.getElementById('fitall')],
    // S25 M177: nền giao diện (00_theme.js)
    ['Nền sáng', 'ti-sun', 'theme light giao dien nen sang trang', () => S.theme.set('light'), () => !!S.theme && S.theme.pref !== 'light'],
    ['Nền tối', 'ti-moon', 'theme dark giao dien nen toi den', () => S.theme.set('dark'), () => !!S.theme && S.theme.pref !== 'dark'],
    ['Nền theo hệ thống', 'ti-device-desktop', 'theme system auto giao dien nen he thong tu dong', () => S.theme.set('system'), () => !!S.theme && S.theme.pref !== 'system'],
    ['Mẫu giao diện (design system)', 'ti-color-swatch', 'ui design system token mau giao dien', () => window.open('/studio/ui.html', '_blank', 'noopener'), () => true],
    ['Mở menu thêm (⋯)', 'ti-dots', 'more menu lich su history', () => W()?.openMore(), () => !!W()],
    ['Trang chủ', 'ti-home', 'home trang chu du an gan day recent', () => S.openHome?.(), () => !!S.openHome],
    ['Xem lại hướng dẫn', 'ti-school', 'onboarding huong dan bat dau', () => S.openOnboarding?.(), () => !!S.openOnboarding],
  ];

  // Words a new user types for a tool whose name differs (gõ không dấu, so khớp theo norm()).
  const ALIAS = {
    text: 'phu de caption kieu phu de chu tieu de font', tpl: 'template mau video', media: 'anh video tai len upload file',
    audio: 'nhac nen sfx am nhac', audioplus: 'giong tron am luong ha nhac', brands: 'logo mau thuong hieu brand kit',
    trans: 'chuyen canh transition', filter: 'loc mau lut', fx: 'hieu ung graphic', words: 'loi thoai sua chu transcript',
    'wf-aihelp': 'ai dung giup claude broll am thanh', autopilot: 'tu lai hang doi nhieu video', autofill: 'tu dong broll am thanh sfx nhac',
    longform: 'video dai cat clip ngan highlight', dub: 'long tieng dich', batch: 'hang loat excel csv', schedule: 'lich dang hen gio',
  };

  function items() {
    const out = [];
    const steps = W()?.STEPS || [];
    steps.forEach(([k, l, ic], i) => out.push({ label: `Bước ${i + 1}: ${l}`, ic, kind: 'Bước', kw: 'buoc step ' + k, run: () => W().goStep(k) }));
    const rail = typeof RAIL !== 'undefined' ? RAIL : [];
    for (const [id, ic, name] of rail) {
      const m = W()?.meta(id), g = W()?.groupOf(id);
      const pro = !!W()?.hidden?.(id);
      const tab = g?.tabs.find(t => t[0] === id)?.[1];
      const label = g ? `${g.name} › ${tab || name}` : name;
      out.push({ label, ic: g ? g.icon : ic, kind: m ? `${pro ? 'Chuyên nghiệp' : 'Công cụ'} · ${STEP_N[m.step] || ''}` : 'Công cụ', pro,
        kw: `${id} ${name} ${g ? g.name : ''} ${ALIAS[id] || ''} cong cu panel${pro ? ' chuyen nghiep pro' : ''}`, run: () => openPanel(id) });
    }
    for (const [label, ic, kw, run, show] of COMMANDS) if (show()) out.push({ label, ic, kind: 'Lệnh', kw, run });
    for (const it of out) { it.n = norm(it.label); it.k = norm(it.label + ' ' + it.kw); it.c = it.k.replace(/ /g, ''); }
    return out;
  }
  function search(list, q) {
    const nq = norm(q); if (!nq) return list;
    const toks = nq.split(' '), cq = nq.replace(/ /g, '');
    const hit = [];
    for (const it of list) {
      const ok = toks.every(t => it.k.includes(t)) || it.c.includes(cq);
      if (!ok) continue;
      const nc = it.n.replace(/ /g, '');
      const score = (it.n.startsWith(nq) || nc.startsWith(cq) ? 0 : it.n.split(' ').some(w => w.startsWith(toks[0])) || nc.includes(cq) ? 1 : 2) * 10 + (it.kind === 'Bước' ? 1 : 0);
      hit.push([score, it]);
    }
    return hit.sort((a, b) => a[0] - b[0]).map(x => x[1]);
  }

  const css = document.createElement('style');
  css.textContent = `
  #cmdk { position: fixed; inset: 0; z-index: 90; display: flex; justify-content: center; align-items: flex-start; padding: 12vh 16px 16px; background: rgb(var(--color-scrim) / .66); }
  #cmdk[hidden] { display: none; }
  #cmdk .ck-box { width: min(560px, 100%); max-height: 64vh; display: flex; flex-direction: column; background: var(--bg2); border: 1px solid var(--line2); border-radius: var(--r); box-shadow: var(--shadow-overlay); overflow: hidden; }
  #cmdk .ck-in { display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--line); flex: none; }
  #cmdk .ck-in .ti { color: var(--tx3); font-size: 18px; }
  #cmdk .ck-in input { flex: 1; min-width: 0; height: 48px; border: 0; background: transparent; font-size: 15px; color: var(--tx); outline: none; box-shadow: none; padding: 0; }
  #cmdk kbd, #wf-more kbd { font-family: inherit; font-size: 11px; font-weight: 600; color: var(--tx3); border: 1px solid var(--line2); border-radius: var(--rs); padding: 0 4px; line-height: 20px; }
  #cmdk ul { list-style: none; margin: 0; padding: 4px; overflow: auto; }
  #cmdk li { display: flex; align-items: center; gap: 12px; height: 40px; padding: 0 8px; border-radius: var(--rs); cursor: pointer; font-size: 13px; color: var(--tx); }
  #cmdk li .ti { font-size: 18px; color: var(--tx2); width: 20px; text-align: center; flex: none; }
  #cmdk li span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #cmdk li small { font-size: 11px; color: var(--tx3); flex: none; }
  #cmdk li[aria-selected="true"] { background: var(--acc-soft); }
  #cmdk li[aria-selected="true"] .ti { color: var(--acc); }
  #cmdk .ck-empty { padding: 16px 12px; font-size: 13px; color: var(--tx3); }
  #cmdk li.pro small { color: var(--acc); }
  #cmdk li.ck-pro { display: flex; flex-direction: column; align-items: stretch; gap: 8px; height: auto; padding: 12px; cursor: default; }
  #cmdk li.ck-pro[aria-selected="true"] { background: transparent; }
  #cmdk .ck-pro p { margin: 0; font-size: 13px; color: var(--tx); }
  #cmdk .ck-pro div { display: flex; flex-wrap: wrap; gap: 8px; }
  #cmdk .ck-foot { display: flex; gap: 12px; padding: 8px 12px; border-top: 1px solid var(--line); font-size: 11px; color: var(--tx3); flex: none; }
  `;
  document.head.appendChild(css);

  const root = document.createElement('div'); root.id = 'cmdk'; root.hidden = true;
  root.innerHTML = `<div class="ck-box" role="dialog" aria-modal="true" aria-label="Tìm công cụ">
    <div class="ck-in"><i class="ti ti-search"></i><input id="ck-q" type="text" role="combobox" aria-expanded="true" aria-controls="ck-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Tìm công cụ, bước, lệnh… (gõ không dấu cũng được)"><kbd>Esc</kbd></div>
    <ul id="ck-list" role="listbox" aria-label="Kết quả"></ul>
    <div class="ck-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> chọn</span><span><kbd>Enter</kbd> mở</span><span><kbd>Esc</kbd> đóng</span></div></div>`;
  document.body.appendChild(root);
  const inp = root.querySelector('#ck-q'), ul = root.querySelector('#ck-list');
  let all = [], res = [], cur = 0, back = null, ask = null;

  function render() {
    res = search(all, inp.value).slice(0, 40); cur = Math.min(cur, Math.max(0, res.length - 1));
    ask = null;
    ul.innerHTML = res.length ? res.map((it, i) => `<li role="option" id="ck-o${i}" data-ck="${i}" aria-selected="${i === cur}"${it.pro ? ' class="pro"' : ''}><i class="ti ${esc(it.ic)}"></i><span>${esc(it.label)}</span><small>${esc(it.kind)}</small></li>`).join('')
      : `<li class="ck-empty" role="option" aria-disabled="true">Không thấy công cụ nào khớp “${esc(inp.value)}”</li>`;
    mark();
  }
  function mark() {
    for (const li of ul.querySelectorAll('[data-ck]')) li.setAttribute('aria-selected', String(+li.dataset.ck === cur));
    if (res.length) { inp.setAttribute('aria-activedescendant', 'ck-o' + cur); ul.querySelector('#ck-o' + cur)?.scrollIntoView({ block: 'nearest' }); }
    else inp.removeAttribute('aria-activedescendant');
  }
  function openCk() {
    W()?.closeMore?.(); $('#wf-pop')?.remove();
    back = document.activeElement; all = items(); inp.value = ''; cur = 0;
    root.hidden = false; render(); inp.focus();
  }
  function closeCk(restore = true) { if (root.hidden) return; root.hidden = true; if (restore && back?.isConnected) back.focus?.(); back = null; }
  function go(it) { closeCk(false); try { it.run(); } catch (e) { console.error(e); S.toast('Không mở được: ' + it.label); } }
  function run(i) {
    const it = res[i]; if (!it) return;
    if (!it.pro || W()?.level !== 'basic') return go(it);
    // C24: công cụ chỉ có ở Chuyên nghiệp — hỏi trong hộp, Enter = Mở ở Chuyên nghiệp
    ask = it; inp.removeAttribute('aria-activedescendant');
    ul.innerHTML = `<li class="ck-pro" role="option" aria-selected="true"><p>«${esc(it.label)}» là công cụ của chế độ Chuyên nghiệp.</p>
      <div><button class="primary" data-ckpro="pro"><i class="ti ti-user-star"></i> Mở ở Chuyên nghiệp</button><button data-ckpro="once">Chỉ mở lần này</button></div></li>`;
    ul.querySelector('[data-ckpro="pro"]').focus();
  }
  function answer(how) {
    const it = ask; if (!it) return; ask = null;
    if (how === 'pro') W()?.setLevel('pro');
    go(it);
  }

  inp.addEventListener('input', () => { cur = 0; render(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (res.length) { cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + res.length) % res.length; mark(); } }
    else if (e.key === 'Enter') { e.preventDefault(); run(cur); }
    else if (e.key === 'Escape') { e.preventDefault(); closeCk(); }
    else if (e.key === 'Tab') e.preventDefault(); // giữ tiêu điểm trong hộp
    e.stopPropagation();
  });
  ul.addEventListener('mousemove', e => { const li = e.target.closest('[data-ck]'); if (li && +li.dataset.ck !== cur) { cur = +li.dataset.ck; mark(); } });
  ul.addEventListener('click', e => { const p = e.target.closest('[data-ckpro]'); if (p) return answer(p.dataset.ckpro); const li = e.target.closest('[data-ck]'); if (li) run(+li.dataset.ck); });
  ul.addEventListener('keydown', e => { // hộp hỏi "Mở ở Chuyên nghiệp": Esc về danh sách, phím mũi tên giữa hai nút
    if (!ask) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); render(); inp.focus(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Tab') { e.preventDefault(); const bs = [...ul.querySelectorAll('[data-ckpro]')]; bs[(bs.indexOf(document.activeElement) + 1) % bs.length]?.focus(); }
    e.stopPropagation();
  });
  root.addEventListener('mousedown', e => { if (e.target === root) { e.preventDefault(); closeCk(); } });
  // ⌘K / Ctrl K ở mọi nơi (cả khi đang gõ trong ô khác); chặn mặc định của trình duyệt (Ctrl K = ô tìm web)
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault(); e.stopPropagation();
      root.hidden ? openCk() : closeCk();
    }
  }, true);

  // lối vào bằng chuột: mục trong menu ⋯
  const more = $('#wf-more'), set = more?.querySelector('[data-wf="settings"]');
  if (set) {
    const b = document.createElement('button'); b.dataset.wf = 'cmdk';
    b.innerHTML = `<i class="ti ti-search"></i> Tìm công cụ… <kbd class="pct">${KEY}</kbd>`;
    b.addEventListener('click', () => { W()?.closeMore?.(); openCk(); });
    set.before(b);
  }
  S.openCommand = openCk;
})();
