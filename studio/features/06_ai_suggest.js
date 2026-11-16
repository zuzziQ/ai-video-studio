// Trợ lý AI cho chữ, phụ đề, mẫu và ảnh bìa (ROADMAP M92, references/assist.md). Logic: scripts/assist.mjs (text, captions,
// templates, cover); gọi qua Studio.assist / Studio.assistPanel của 05_assist.js. Kết quả luôn là đề xuất: chỉ áp khi bấm.
//   Panel Chữ: "Viết giúp" (3 câu hợp lời thoại tại playhead → Thêm thành chữ mới).
//   Inspector khi chọn một chữ: "Viết lại ▾" (Ngắn hơn / Giật tít hơn / Thêm CTA / Viết giúp) → Dùng (hoàn tác được).
//   Inspector phụ đề: "Tự nhấn từ khoá", "Ngắt dòng hợp nghĩa" → xem trước số thay đổi → Nhận / Bỏ (chỉ đổi hl/br, không đổi chữ và thời gian).
//   Panel Mẫu: hàng "Gợi ý cho video này" (3 mẫu có thật + lý do); lỗi hoặc thiếu AI thì ẩn hàng, gallery như cũ.
//   Studio.coverSheet(): lưới 9 khung hình thu nhỏ + thời điểm cho trợ lý ảnh bìa (dùng trong 52_publish.js).
'use strict';
(() => {
  const S = window.Studio, { $, esc } = S;
  const css = document.createElement('style');
  css.textContent = `
  .ais-text { margin: 0 0 var(--space-3); } .ais-text .as-box { margin-top: var(--space-2); }
  .ais-rw { position: relative; margin-top: var(--space-2); }
  .ais-rw-btn { display: inline-flex; gap: var(--space-1); align-items: center; }
  .ais-menu { position: absolute; z-index: 20; left: 0; top: calc(100% + var(--space-1)); min-width: 180px; padding: var(--space-1); display: flex; flex-direction: column; gap: var(--space-050);
    background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-control); box-shadow: var(--shadow-overlay); }
  .ais-menu[hidden] { display: none; }
  .ais-menu button { justify-content: flex-start; border: 0; background: transparent; text-align: left; }
  .ais-menu button:hover { background: rgb(var(--color-surface-hover)); }
  .ais-cap { margin-top: var(--space-3); }
  .ais-cap-btns { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .ais-cap-btns button { flex: 1 1 140px; justify-content: center; }
  .ais-prev { margin: var(--space-2) 0 0; padding: 0; list-style: none; }
  .ais-prev li { padding: var(--space-1) 0; border-top: 1px solid rgb(var(--color-line)); overflow-wrap: anywhere; line-height: 1.5; }
  .ais-prev small { display: block; color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); }
  .ais-more { color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); margin-top: var(--space-1); }
  .ais-tsug { margin: 0 0 var(--space-3); padding: var(--space-3); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-control); background: rgb(var(--color-surface)); font-size: var(--text-xs); min-width: 0; }
  .ais-tsug-h { display: flex; gap: var(--space-1) var(--space-2); align-items: center; min-width: 0; } .ais-tsug-h .grow { flex: 1; }
  .ais-tsug-h b { font-size: var(--text-sm); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ais-tsug-h small { color: rgb(var(--color-fg-subtle)); white-space: nowrap; } .ais-tsug-h button { flex: none; }
  .ais-tsug-h .muted { min-width: 0; font-size: var(--text-2xs); line-height: 1.4; }
  .ais-tgrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); margin-top: var(--space-2); }
  .ais-why { font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); line-height: 1.4; margin-top: var(--space-050); overflow-wrap: anywhere;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .ais-tsug .tpl .use { padding: var(--space-1); font-size: var(--text-2xs); }`;
  document.head.appendChild(css);

  // ---------- ngữ cảnh chung ----------
  let ONB = null;
  const purpose = async () => { try { ONB ??= await S.api('/api/onboarding'); } catch { ONB = {}; } return ONB?.purpose || ''; };
  const aspect = () => (S.DW > S.DH ? '16:9' : '9:16');
  const brand = () => { let b = {}; try { b = S.win?.BR ? S.win.BR() : {}; } catch { /* engine chưa sẵn */ } return { ...b, ...(S.TL.brand || {}) }; };
  const words = () => (S.CAP || []).flatMap(c => c.words || []);
  const speechAround = (t, span = 8) => words().filter(w => w.e >= t - span && w.s <= t + span).map(w => w.w).join(' ').slice(0, 1400);
  const transcript = n => (S.CAP || []).map(c => (c.words || []).map(w => w.w).join(' ')).join(' ').slice(0, n);
  // Giới hạn ký tự theo khung: bề ngang khung hình / bề ngang một chữ ở cỡ đó, tối đa 2 dòng.
  const maxChars = o => { const size = +o?.size || 56, per = Math.max(8, Math.floor(S.DW * 0.86 / (size * 0.56))); return Math.max(12, Math.min(120, per * 2)); };

  // ---------- panel Chữ: Viết giúp ----------
  const writeAI = S.assistPanel({
    name: 'text', label: 'Viết giúp', pick: true, okLabel: 'Thêm',
    hint: 'AI viết 3 câu chữ hợp lời thoại tại playhead; bấm Thêm để đặt thành chữ mới.',
    input: async () => {
      const context = speechAround(S.T);
      if (!context) throw new Error('Chưa có lời thoại quanh playhead: tạo phụ đề trước, hoặc tua tới đoạn có lời nói.');
      return { mode: 'write', context, brand: brand(), purpose: await purpose(), max: maxChars({ size: 56 }) };
    },
    onAccept: f => addText({ text: f.value, p: { style: 'yellow', size: 56, anim: 'pop' } }), // eslint-disable-line no-undef -- library.js
  });
  function injectText() {
    if (typeof panel === 'undefined' || panel !== 'text') return; // eslint-disable-line no-undef -- library.js
    const add = $('#addtext');
    if (!add || $('#libbody .ais-text')) return;
    const box = document.createElement('div'); box.className = 'ais-text'; box.innerHTML = '<div></div>';
    add.after(box); writeAI.mount(box.firstElementChild); // mount() đặt className = as-box: gắn vào ô con để giữ dấu .ais-text
  }

  // ---------- inspector chữ: Viết lại ▾ ----------
  const MODES = [['shorter', 'Ngắn hơn', 'ti-arrows-minimize'], ['punchier', 'Giật tít hơn', 'ti-bolt'], ['cta', 'Thêm CTA', 'ti-hand-click'], ['write', 'Viết giúp', 'ti-pencil']];
  const RW = new WeakMap(); // đối tượng chữ → { mode, panel }
  function rwPanel(o, mode) {
    const cur = RW.get(o);
    if (cur && cur.mode === mode) return cur.panel;
    const label = MODES.find(m => m[0] === mode)[1];
    const p = S.assistPanel({
      name: 'text', label, pick: true, okLabel: 'Dùng', hint: 'AI chỉ đề xuất; bấm Dùng để thay chữ (Ctrl+Z để hoàn tác).',
      current: () => o.text || '',
      input: async () => {
        const c = S.compOf(o), len = [...String(o.text || '')].length, box = maxChars(o);
        const max = mode === 'shorter' ? Math.max(6, Math.min(box, Math.round(len * 0.7))) : box;
        return { mode, text: o.text || '', context: speechAround(c ? c.t0 : S.T), brand: brand(), purpose: await purpose(), max };
      },
      onAccept: f => {
        if (typeof touch === 'function') touch(o, 'text'); else S.pushUndo(); // eslint-disable-line no-undef -- studio.js (pushUndo + _orig)
        o.text = f.value; S.changed(true);
      },
    });
    RW.set(o, { mode, panel: p });
    return p;
  }
  function injectRewrite() {
    const c = S.sel;
    if (c?.kind !== 'line') return;
    const ta = $('#insp textarea[data-f="text"]');
    if (!ta || $('#insp .ais-rw')) return;
    const o = c.obj, wrap = document.createElement('div');
    wrap.className = 'ais-rw';
    wrap.innerHTML = `<button class="mini ais-rw-btn" data-rw="menu" aria-haspopup="menu" aria-expanded="false"><i class="ti ti-sparkles"></i> Viết lại <i class="ti ti-chevron-down"></i></button>
      <div class="ais-menu" role="menu" hidden>${MODES.map(([k, l, ic]) => `<button role="menuitem" data-rw="${k}"><i class="ti ${ic}"></i> ${esc(l)}</button>`).join('')}</div><div class="ais-out"><div></div></div>`;
    ta.after(wrap);
    const menu = wrap.querySelector('.ais-menu'), btn = wrap.querySelector('[data-rw=menu]'), out = wrap.querySelector('.ais-out > div');
    const show = on => { menu.hidden = !on; btn.setAttribute('aria-expanded', String(on)); };
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-rw]'); if (!b) return;
      e.stopPropagation();
      if (b.dataset.rw === 'menu') return show(menu.hidden);
      show(false);
      if (!String(o.text || '').trim() && b.dataset.rw !== 'write') return S.toast('Chữ đang trống: dùng Viết giúp');
      const p = rwPanel(o, b.dataset.rw); p.mount(out); p.start();
    });
    const cur = RW.get(o);
    if (cur) cur.panel.mount(out); // inspector vẽ lại (sau khi Dùng) → giữ đề xuất đang xem
  }

  // ---------- inspector phụ đề: Tự nhấn từ khoá / Ngắt dòng hợp nghĩa ----------
  const CAPM = { hl: ['Tự nhấn từ khoá', 'ti-highlight', 'từ nhấn'], br: ['Ngắt dòng hợp nghĩa', 'ti-text-wrap', 'chỗ ngắt'] };
  const CS = { state: 'idle', mode: '', step: '', progress: 0, error: '', res: null, sig: null };
  const sigOf = c => (c.words || []).map(w => w.w).join('\u0001');
  async function runCaps(mode) {
    if (CS.state === 'running') return;
    if (!(S.CAP || []).length) return S.toast('Chưa có phụ đề');
    Object.assign(CS, { state: 'running', mode, step: 'Đang gửi…', progress: 0, error: '', res: null, sig: S.CAP.map(sigOf) }); paintCaps();
    try {
      const lines = S.CAP.map(c => ({ words: (c.words || []).map(w => w.w), hl: (c.words || []).flatMap((w, j) => (w.hl ? [j] : [])), br: (c.words || []).flatMap((w, j) => (w.br ? [j] : [])) }));
      CS.res = await S.assist('captions', { mode, lines, purpose: await purpose() }, { onStep: (s, k) => { CS.step = s; CS.progress = k; paintCaps(); } });
      CS.state = 'done';
    } catch (e) { CS.state = e.state === 'cancelled' ? 'idle' : 'error'; CS.error = e.message; }
    paintCaps();
  }
  function acceptCaps() {
    const r = CS.res; if (!r) return;
    S.pushUndo();
    let n = 0, skip = 0;
    for (const f of r.fields) {
      const c = S.CAP[f.value.c];
      if (!c || sigOf(c) !== CS.sig[f.value.c]) { skip++; continue; } // dòng đã bị sửa sau khi gửi: bỏ qua
      const set = new Set(f.value[r.mode]);
      c.words.forEach((w, j) => { if (set.has(j)) w[r.mode] = true; else delete w[r.mode]; });
      n++;
    }
    Object.assign(CS, { state: 'idle', res: null });
    S.changed(true);
    S.toast(`Đã áp ${CAPM[r.mode][2]} cho ${n} dòng phụ đề` + (skip ? ` · bỏ ${skip} dòng đã sửa sau khi gửi` : ''));
  }
  function capsHtml() {
    const btns = `<div class="ais-cap-btns">${Object.entries(CAPM).map(([k, [l, ic]]) => `<button class="mini" data-capai="${k}" ${CS.state === 'running' ? 'disabled' : ''}><i class="ti ${ic}"></i> ${l}</button>`).join('')}</div>`;
    if (CS.state === 'running') return `${btns}<div class="as-box"><div class="as-run"><i class="ti ti-loader-2 spin"></i><span>${esc(CAPM[CS.mode][0])}: ${esc(CS.step)}</span><span class="grow"></span><button class="ghost mini" data-capai="stop">Huỷ</button></div><div class="as-bar"><i></i></div></div>`;
    if (CS.state === 'error') return `${btns}<div class="as-box"><p class="as-err"><i class="ti ti-alert-circle"></i><span>${esc(CS.error)}</span></p></div>`;
    if (CS.state !== 'done') return btns + '<div class="help">AI chỉ đổi từ nhấn hoặc chỗ xuống dòng của mọi phụ đề, không đổi chữ và thời gian. Bạn xem trước rồi Nhận / Bỏ.</div>';
    const r = CS.res, fs = r.fields, prov = r.provider === 'ollama' ? 'Ollama' : 'Claude';
    return `${btns}<div class="as-box"><div class="as-top"><b><i class="ti ti-sparkles"></i> ${esc(CAPM[r.mode][0])}</b><small>${prov} · ${Math.max(1, Math.round((r.ms || 0) / 1000))} s</small></div>
      <p class="as-reason">${fs.length ? `AI đề xuất <b>${r.changes}</b> thay đổi ${esc(CAPM[r.mode][2])} ở <b>${fs.length}</b> dòng.` : 'AI thấy phụ đề hiện tại đã ổn, không có thay đổi.'}</p>
      ${r.warnings?.length ? `<ul class="as-warn">${r.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      ${fs.length ? `<ul class="ais-prev">${fs.slice(0, 5).map(f => `<li>${esc(f.display)}<small>Hiện tại: ${esc(f.current || '')}</small></li>`).join('')}</ul>${fs.length > 5 ? `<div class="ais-more">… và ${fs.length - 5} dòng khác</div>` : ''}` : ''}
      <div class="as-foot">${fs.length ? '<button class="primary mini" data-capai="ok"><i class="ti ti-check"></i> Nhận</button>' : ''}<button class="ghost mini" data-capai="no">${fs.length ? 'Bỏ' : 'Đóng'}</button></div></div>`;
  }
  function paintCaps() {
    const el = $('#insp .ais-cap'); if (!el) return;
    el.innerHTML = capsHtml();
    el.querySelector('.as-bar')?.style.setProperty('--as-p', String(CS.progress || 0));
  }
  function injectCaps() {
    if (S.sel?.kind !== 'cap') return;
    const all = $('#insp [data-act="capall"]');
    if (!all || $('#insp .ais-cap')) return;
    const box = document.createElement('div'); box.className = 'ais-cap';
    all.closest('.acts').after(box);
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-capai]'); if (!b) return;
      const k = b.dataset.capai;
      if (k === 'stop') return S.assistCancel();
      if (k === 'ok') return acceptCaps();
      if (k === 'no') { Object.assign(CS, { state: 'idle', res: null }); return paintCaps(); }
      runCaps(k);
    });
    paintCaps();
  }

  // ---------- panel Mẫu: Gợi ý cho video này ----------
  const TS = { state: 'idle', step: '', res: null };
  async function runTpl() {
    if (TS.state === 'running') return;
    const list = typeof TEMPLATES !== 'undefined' && Array.isArray(TEMPLATES) ? TEMPLATES : []; // eslint-disable-line no-undef -- library.js
    if (!list.length) return;
    Object.assign(TS, { state: 'running', step: 'Đang gửi…', res: null }); paintTpl();
    try {
      const pur = await purpose(), tr = transcript(2500);
      if (!tr && !pur) throw new Error('Cần phụ đề hoặc chọn lĩnh vực ở hướng dẫn lần đầu để AI gợi ý mẫu.');
      const catalog = list.map(t => ({ id: t.id, name: t.name, category: t.category, aspect: t.aspect || '9:16', desc: t.desc, pack: t.pack }));
      TS.res = await S.assist('templates', { catalog, transcript: tr, purpose: pur, aspect: aspect() }, { onStep: s => { TS.step = s; paintTpl(); } });
      TS.state = 'done';
    } catch (e) {
      Object.assign(TS, { state: 'idle', res: null }); // lỗi hoặc thiếu AI: ẩn hàng, gallery như cũ
      if (e.state !== 'cancelled') S.toast('Không gợi ý được mẫu: ' + e.message);
    }
    paintTpl();
  }
  function tplHtml() {
    if (TS.state === 'running') return `<div class="as-run"><i class="ti ti-loader-2 spin"></i><span>Gợi ý mẫu: ${esc(TS.step)}</span><span class="grow"></span><button class="ghost mini" data-tsug="stop">Huỷ</button></div>`;
    const list = typeof TEMPLATES !== 'undefined' && Array.isArray(TEMPLATES) ? TEMPLATES : []; // eslint-disable-line no-undef -- library.js
    const picks = TS.state === 'done' ? TS.res.fields.map(f => ({ t: list.find(x => x.id === f.value), why: f.note })).filter(p => p.t) : [];
    if (!picks.length) return `<div class="ais-tsug-h"><button class="mini" data-tsug="go"><i class="ti ti-sparkles"></i> Gợi ý mẫu cho video này</button><span class="muted">AI đọc lời thoại, lĩnh vực và khổ video</span></div>`;
    return `<div class="ais-tsug-h"><b><i class="ti ti-sparkles"></i> Gợi ý cho video này</b><small>${TS.res.provider === 'rules' ? 'theo lĩnh vực' : 'AI'} · ${Math.max(1, Math.round((TS.res.ms || 0) / 1000))} s</small><span class="grow"></span>
        <button class="ghost mini" data-tsug="go" title="Hỏi lại"><i class="ti ti-refresh"></i></button><button class="ghost mini" data-tsug="hide" title="Ẩn gợi ý"><i class="ti ti-x"></i></button></div>
      <div class="ais-tgrid">${picks.map(({ t, why }) => `<div class="tpl" data-tpl="${esc(t.id)}"><div class="tv ${(t.aspect || '9:16') === '16:9' ? 'h' : ''}" data-dbg="${esc(t.preview?.jpg || '')}">
        <span class="badge">${esc(t.aspect || '9:16')}</span><button class="use" data-use="${esc(t.id)}"><i class="ti ti-wand"></i> Dùng</button></div>
        <div class="tn">${esc(t.name || t.id)}</div>${why ? `<div class="ais-why" title="${esc(why)}">${esc(why)}</div>` : ''}</div>`).join('')}</div>`;
  }
  function paintTpl() { const el = $('#libbody .ais-tsug'); if (el) el.innerHTML = tplHtml(); }
  function injectTpl() {
    if (typeof panel === 'undefined' || panel !== 'tpl') return; // eslint-disable-line no-undef -- library.js
    const grid = $('#libbody .tgrid');
    if (!grid || $('#libbody .ais-tsug')) return;
    const box = document.createElement('div'); box.className = 'ais-tsug';
    grid.before(box);
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-tsug]'); if (!b) return; // thẻ mẫu (data-tpl / data-use) do library.js xử lý
      const k = b.dataset.tsug;
      if (k === 'stop') return S.assistCancel();
      if (k === 'hide') { Object.assign(TS, { state: 'idle', res: null }); return paintTpl(); }
      runTpl();
    });
    paintTpl();
  }

  // ---------- ảnh bìa: lưới khung hình cho trợ lý cover ----------
  const loadImg = url => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('img')); i.src = url; });
  async function coverSheet(n = 9) {
    /* global clipAtT, srcAt, clipFrameUrl -- studio/clips.js */
    const D = S.TL.duration || 0;
    if (!(D > 1)) throw new Error('Video quá ngắn để chọn ảnh bìa');
    const times = Array.from({ length: n }, (_, k) => Math.round(D * (0.06 + 0.88 * k / (n - 1)) * 10) / 10);
    const urls = times.map(t => { const k = clipAtT(t); return k ? clipFrameUrl(k.c, srcAt(k, t)) : ''; });
    let imgs;
    try { imgs = await Promise.all(urls.map(u => (u ? loadImg(u) : Promise.reject(new Error('no clip'))))); }
    catch { throw new Error('Không đọc được khung hình của video. Dự án thiếu thư mục work/frames: mở lại Studio và chọn “Tạo lại khung hình”.'); }
    const vert = S.DH >= S.DW, cw = vert ? 216 : 320, ch = vert ? 384 : 180, cols = 3, rows = Math.ceil(n / cols);
    const cv = document.createElement('canvas'); cv.width = cw * cols; cv.height = ch * rows;
    const g = cv.getContext('2d');
    // Ảnh gửi cho AI (không phải giao diện): nền đen, số ô trắng trên ô đen mờ.
    g.fillStyle = 'black'; g.fillRect(0, 0, cv.width, cv.height);
    imgs.forEach((im, k) => {
      const x = (k % cols) * cw, y = Math.floor(k / cols) * ch, s = Math.max(cw / im.naturalWidth, ch / im.naturalHeight);
      const w = im.naturalWidth * s, h = im.naturalHeight * s;
      g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip(); g.drawImage(im, x + (cw - w) / 2, y + (ch - h) / 2, w, h); g.restore();
      g.globalAlpha = 0.7; g.fillStyle = 'black'; g.fillRect(x + 6, y + 6, 44, 40); g.globalAlpha = 1;
      g.fillStyle = 'white'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(k + 1), x + 28, y + 27);
    });
    return { image: cv.toDataURL('image/jpeg', 0.85), times, near: times.map(t => speechAround(t, 1.5).slice(0, 180)), transcript: transcript(1500), purpose: await purpose(), brand: brand() };
  }

  // ---------- gắn vào giao diện ----------
  document.addEventListener('click', e => { if (!e.target.closest?.('.ais-rw')) document.querySelectorAll('.ais-menu:not([hidden])').forEach(m => { m.hidden = true; m.previousElementSibling?.setAttribute('aria-expanded', 'false'); }); });
  S.onReady(() => {
    new MutationObserver(() => { injectText(); injectTpl(); }).observe($('#libbody'), { childList: true });
    new MutationObserver(() => { injectRewrite(); injectCaps(); }).observe($('#insp'), { childList: true });
    injectText(); injectTpl(); injectRewrite(); injectCaps();
  });
  Object.assign(S, { coverSheet });
})();
