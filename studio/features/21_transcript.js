// Panel "Lời thoại" (ROADMAP M89): sửa phụ đề bằng chữ, không cần LLM. CAP (mảng khối phụ đề, mỗi khối có
// words[{w, s, e, hl, br, ed}]) là nguồn chung của panel, track Phụ đề và preview, nên mọi sửa ở đây đổi ngay ở đó.
//   - Hai chế độ cho phím Delete: Sửa chữ (mặc định; xoá chữ khỏi phụ đề, video giữ nguyên) / Cắt video (ripple như cũ).
//   - Sửa tại chỗ: bấm đúp một từ, hoặc chọn rồi Enter / gõ. Cùng số từ giữ thời gian từng từ; khác số từ chia lại
//     trong khoảng cũ theo độ dài chữ, không vượt khối phụ đề (lõi thuần: 21_transcript.core.js). Từ đã sửa có `ed`.
//   - Menu đoạn (chuột phải, phím Menu / Shift F10, thanh nổi): Sửa, Nhấn mạnh, Xuống dòng, Ẩn khỏi phụ đề,
//     Cắt khỏi video, Phát lại đoạn (lặp, Esc dừng).
//   - Tìm và thay (Ctrl H), từ điển "sai=đúng" của dự án (/api/dict, routes/21_dict.mjs) và thương hiệu (brand kit `dict`).
//   - Lớp "đề xuất" (dữ liệu tạm, không lưu) cho M90: Studio.transcript.suggest([{s, e, to, reason}]).
// Cắt video dùng Studio.ai (20_ai.js): cutRanges, wordSpan, allWords.
'use strict';
(() => {
  const S = Studio, { $, esc, fmt } = S;
  const C = () => window.TranscriptCore;
  const css = document.createElement('style');
  css.textContent = `
  .tx-head { margin: var(--space-1) 0 var(--space-2); }
  .tx-mode .ui-tab { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-1); }
  .tx-help { margin: 0 0 var(--space-2); font-size: var(--text-2xs); line-height: 1.5; color: rgb(var(--color-fg-muted)); }
  .tx-help b { color: rgb(var(--color-fg)); font-weight: 600; }
  .tx-box { display: flex; flex-direction: column; gap: var(--space-2); margin: 0 0 var(--space-3); padding: var(--space-3); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-card); background: rgb(var(--color-surface-raised)); }
  .tx-boxhead { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); font-size: var(--text-sm); }
  .tx-row { display: flex; align-items: center; gap: var(--space-2); } .tx-row > .ui-input { flex: 1; min-width: 0; }
  .tx-count { flex: none; font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); font-variant-numeric: tabular-nums; }
  .tx-opts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); }
  .tx-opts label { display: inline-flex; align-items: center; gap: var(--space-1); cursor: pointer; }
  .tx-scope.ui-input { width: auto; max-width: 100%; height: var(--h-sm); }
  .tx-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  .tx-note { margin: 0; font-size: var(--text-2xs); line-height: 1.5; color: rgb(var(--color-fg-muted)); }
  .tx-chips { display: flex; flex-wrap: wrap; gap: var(--space-1); }
  .tx-err { margin: 0; font-size: var(--text-2xs); color: rgb(var(--color-danger-text)); } .tx-err:empty { display: none; }
  .tx-hits { list-style: none; margin: 0; padding: 0; max-height: 176px; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-050); }
  .tx-hits:empty { display: none; }
  .tx-hits li { display: flex; gap: var(--space-2); min-width: 0; padding: var(--space-1) var(--space-2); border-radius: var(--radius-xs); font-size: var(--text-xs); color: rgb(var(--color-fg-muted)); cursor: pointer; }
  .tx-hits li:hover { background: rgb(var(--color-surface-hover)); }
  .tx-hits li[aria-selected="true"] { background: rgb(var(--color-accent-soft) / .24); color: rgb(var(--color-fg)); }
  .tx-hits .tx-t { flex: none; font-family: var(--font-mono); font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); }
  .tx-hits .tx-ctx { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tx-hits mark { background: rgb(var(--color-warning) / .25); color: rgb(var(--color-fg)); border-radius: var(--radius-xs); }
  .tw-wrap { line-height: 2.05; font-size: var(--text-sm); user-select: none; padding: var(--space-1) 0 var(--space-5); border-radius: var(--radius-control); outline: none; }
  .tw-wrap:focus-visible { box-shadow: 0 0 0 2px rgb(var(--color-focus)); }
  .tw-wrap .tm { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); margin: 0 var(--space-1) 0 var(--space-050); font-family: var(--font-mono); cursor: pointer; background: rgb(var(--color-surface-raised)); border-radius: var(--radius-xs); padding: var(--space-050) var(--space-1); }
  .tw-wrap .tm:hover { color: rgb(var(--color-fg)); }
  .tw { padding: var(--space-050); border-radius: var(--radius-xs); cursor: text; transition: background-color var(--duration-fast) var(--ease-standard); }
  .tw:hover { background: rgb(var(--color-surface-muted)); }
  .tw.cur { color: rgb(var(--color-fg)); box-shadow: inset 0 -2px 0 rgb(var(--color-accent-text)); }
  .tw.hl { color: rgb(var(--color-highlight)); font-weight: 600; }
  .tw.br::after { content: '↵'; margin-left: var(--space-050); font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); }
  .tw.flag { box-shadow: inset 0 -2px 0 rgb(var(--color-warning)); }
  .tw.ed { text-decoration: underline dotted rgb(var(--color-accent-text)); text-decoration-thickness: 2px; text-underline-offset: 4px; }
  .tw.sug { text-decoration: underline wavy rgb(var(--color-warning)); text-underline-offset: 4px; }
  .tw.tw-hit { background: rgb(var(--color-warning) / .18); }
  .tw.tw-hitcur { background: rgb(var(--color-warning) / .4); color: rgb(var(--color-fg)); }
  .tw.sel { background: rgb(var(--color-accent-soft) / .5); color: rgb(var(--color-fg)); box-shadow: inset 0 0 0 1px rgb(var(--color-accent-text) / .6); }
  .tw-wrap.is-cut .tw.sel { background: rgb(var(--color-danger) / .28); color: rgb(var(--color-white)); box-shadow: none; text-decoration: line-through; text-decoration-color: rgb(var(--color-white) / .5); }
  .tw.tx-off { display: none; }
  .tx-edit { height: var(--h-sm); max-width: 100%; padding: 0 var(--space-1); font: inherit; color: rgb(var(--color-fg)); background: rgb(var(--color-surface)); border: 1px solid rgb(var(--color-focus)); border-radius: var(--radius-xs); box-shadow: 0 0 0 3px rgb(var(--color-focus) / .25); outline: none; }
  .tx-bar { position: sticky; bottom: 0; display: flex; align-items: center; gap: var(--space-050); padding: var(--space-1); background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-control); box-shadow: var(--shadow-raised); }
  .tx-bar[hidden] { display: none; }
  .tx-bar .tx-n { flex: 1; min-width: 0; padding: 0 var(--space-1); font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tx-bar .ui-btn[aria-pressed="true"] { color: rgb(var(--color-accent-text)); }
  .tx-menu { position: fixed; z-index: 1000; display: flex; flex-direction: column; min-width: 224px; padding: var(--space-1); background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-control); box-shadow: var(--shadow-overlay); }
  .tx-menu [role="menuitem"] { display: flex; align-items: center; gap: var(--space-2); height: var(--h-sm); padding: 0 var(--space-2); border: 0; border-radius: var(--radius-xs); background: transparent; color: rgb(var(--color-fg)); font-size: var(--text-xs); text-align: left; cursor: pointer; }
  .tx-menu [role="menuitem"]:hover, .tx-menu [role="menuitem"]:focus { background: rgb(var(--color-surface-hover)); outline: none; }
  .tx-menu [role="menuitem"] span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tx-menu kbd { font-family: var(--font-mono); font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); }
  .tx-menu [role="separator"] { height: 1px; margin: var(--space-1) 0; background: rgb(var(--color-line)); }`;
  document.head.appendChild(css);

  // ---------- state ----------
  const MODE_KEY = 'avs.twMode';
  let mode = (() => { try { return localStorage.getItem(MODE_KEY) === 'cut' ? 'cut' : 'text'; } catch { return 'text'; } })();
  let tw = { a: -1, b: -1, drag: false, moved: false }, W = [], sig = null, curK = -1;
  let editing = null, box = '', dict = null, draft = null, loopT = null, sugs = [], sugId = 0; // draft: unsaved dictionary text
  const find = { q: '', r: '', na: false, mem: false, scope: 'project', hits: [], cur: 0 };
  const selRange = () => (tw.a < 0 || !W[tw.a] || !W[tw.b] ? null : [Math.min(tw.a, tw.b), Math.max(tw.a, tw.b)]);
  const textOf = (a, b) => W.slice(a, b + 1).map(x => x.w.w).join(' ');
  const short = t => (t.length > 32 ? t.slice(0, 32) + '…' : t);
  const ibtn = (attr, icon, label, extra = '') => `<button type="button" class="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" ${attr} title="${label}" aria-label="${label}" ${extra}><i class="ti ${icon}"></i></button>`;
  const acts = () => [
    ['edit', 'ti-pencil', 'Sửa chữ', 'Enter'],
    ['hl', 'ti-highlight', 'Nhấn mạnh', ''],
    ['br', 'ti-corner-down-left', 'Xuống dòng sau đoạn này', ''],
    ['hide', 'ti-eye-off', 'Ẩn khỏi phụ đề', mode === 'text' ? 'Delete' : ''],
    ['cut', 'ti-scissors', 'Cắt khỏi video', mode === 'cut' ? 'Delete' : ''],
    ['loop', 'ti-repeat', 'Phát lại đoạn (lặp)', loopT ? 'Esc dừng' : ''],
  ];

  // ---------- render ----------
  function render() {
    closeMenu();
    W = S.ai.allWords(); sig = [S.CAP, S.TL.duration]; editing = null;
    if (tw.a >= W.length || tw.b >= W.length) tw = { a: -1, b: -1 };
    $('#libact').innerHTML = ibtn('data-transcribe', 'ti-microphone', 'Tạo lại lời thoại tự động (Whisper)')
      + ibtn('data-tx="find"', 'ti-replace', 'Tìm và thay (Ctrl H)', `aria-pressed="${box === 'find'}"`)
      + ibtn('data-tx="dict"', 'ti-book-2', 'Từ điển sửa lời thoại', `aria-pressed="${box === 'dict'}"`);
    if (!W.length) { $('#libbody').innerHTML = S.ctaTranscribe('Sửa video bằng chữ'); return; }
    const fl = S.ai.fillers, flags = new Set(), sugK = new Map();
    if (fl) for (const c of fl.cuts) for (const [k, x] of W.entries()) if (x.w.s >= c.a - .01 && x.w.e <= c.b + .05) flags.add(k);
    for (const g of sugs) { const q = sugRange(g); if (q) for (let k = q[0]; k <= q[1]; k++) sugK.set(k, g); }
    // flowing text; a time chip where the speaker pauses (≥ 0.5 s) or every ~40 words
    let html = '', lastE = -9, since = 99;
    for (const [k, x] of W.entries()) {
      if (x.w.s - lastE >= .5 || since >= 40) { html += `${k ? '<br>' : ''}<span class="tm" data-tws="${x.w.s}" title="Tua tới ${fmt(x.w.s)}">${fmt(x.w.s)}</span>`; since = 0; }
      lastE = x.w.e; since++;
      const g = sugK.get(k);
      const cls = ['tw', x.w.hl && 'hl', x.w.br && 'br', x.w.ed && 'ed', flags.has(k) && 'flag', g && 'sug'].filter(Boolean).join(' ');
      html += `<span class="${cls}" data-k="${k}"${g ? ` title="Đề xuất: ${esc(g.to)}${g.reason ? ' · ' + esc(g.reason) : ''}"` : x.w.ed ? ' title="Đã sửa tay"' : ''}>${esc(x.w.w)}</span> `;
    }
    const help = mode === 'text'
      ? 'Bấm đúp một từ, hoặc chọn rồi gõ hay Enter để sửa (Enter lưu, Esc huỷ). <b>Delete xoá chữ khỏi phụ đề, video giữ nguyên.</b> Chuột phải mở menu.'
      : 'Kéo hoặc Shift-bấm để chọn một đoạn. <b>Delete cắt đoạn đó khỏi video</b> (dồn cả timeline). Chuột phải mở menu.';
    $('#libbody').innerHTML = `<div class="tx-head"><div class="ui-tabs tx-mode" role="radiogroup" aria-label="Phím Delete trong lời thoại">
        ${[['text', 'ti-pencil', 'Sửa chữ'], ['cut', 'ti-scissors', 'Cắt video']].map(([k, i, l]) => `<button type="button" class="ui-tab${mode === k ? ' is-active' : ''}" role="radio" aria-checked="${mode === k}" tabindex="${mode === k ? 0 : -1}" data-txmode="${k}"><i class="ti ${i}"></i> ${l}</button>`).join('')}</div></div>
      <p class="tx-help">${help} ${fl ? 'Gạch chân vàng là lỗi nói đã dò. ' : ''}${sugs.length ? `Gạch sóng là ${sugs.length} đề xuất (chuột phải để nhận hoặc bỏ). ` : ''}Hoàn tác ⌘Z.</p>
      <div id="txbox">${boxHtml()}</div>
      <div class="tw-wrap${mode === 'cut' ? ' is-cut' : ''}" id="twwrap" tabindex="0" aria-label="Lời thoại, ${W.length} từ. Chọn từ bằng chuột hoặc mũi tên.">${html}</div>
      <div class="tx-bar" id="txbar" role="toolbar" aria-label="Việc với đoạn đã chọn" hidden></div>`;
    paintSel(); markCur();
    if (box === 'find') updateFind();
  }
  function boxHtml() { return box === 'find' ? findHtml() : box === 'dict' ? dictHtml() : ''; }
  function renderBox() { const b = $('#txbox'); if (b) { b.innerHTML = boxHtml(); if (box === 'find') updateFind(); } }
  function paintSel() {
    const r = selRange();
    for (const el of document.querySelectorAll('#twwrap .tw')) { const k = +el.dataset.k; el.classList.toggle('sel', !!r && k >= r[0] && k <= r[1]); }
    const bar = $('#txbar'); if (!bar) return;
    bar.hidden = !r || !!editing;
    if (!r) return;
    const n = r[1] - r[0] + 1;
    bar.innerHTML = `<span class="tx-n" title="${esc(textOf(r[0], r[1]))}">${n} từ · ${esc(short(textOf(r[0], r[1])))}</span>`
      + acts().map(([k, i, l, kb]) => ibtn(`data-txact="${k}"`, i, l + (kb ? ` (${kb})` : ''), k === 'loop' ? `aria-pressed="${!!loopT}"` : '')).join('');
  }
  function markCur() {
    if (panel !== 'words') return;
    // the captions were replaced (undo, cut, reload): redraw so indices never point at stale words
    if (sig && (sig[0] !== S.CAP || sig[1] !== S.TL?.duration) && !tw.drag && !editing) { tw = { a: -1, b: -1 }; return render(); }
    if (!W.length) return;
    const T = S.T, k = W.findIndex(x => T >= x.w.s - .02 && T < x.w.e + .02);
    if (k === curK && document.querySelector('#twwrap .tw.cur')) return;
    document.querySelector('#twwrap .tw.cur')?.classList.remove('cur');
    curK = k;
    const el = k >= 0 && document.querySelector(`#twwrap .tw[data-k="${k}"]`);
    if (el) { el.classList.add('cur'); if (playing) el.scrollIntoView({ block: 'nearest' }); }
  }
  setInterval(markCur, 120);
  const focusWrap = () => $('#twwrap')?.focus({ preventScroll: true });
  const spanOf = k => document.querySelector(`#twwrap .tw[data-k="${k}"]`);

  // ---------- edits (one undo step each) ----------
  // Replace words a..b (indices into W) by `text`; '' removes them from the captions (the video is untouched).
  function applyEdit(a, b, text, { batch = false, mark = true } = {}) {
    const toks = C().tokenize(text), sel = W.slice(a, b + 1);
    if (!sel.length) return false;
    const groups = [];
    for (const x of sel) { const g = groups[groups.length - 1]; if (g && g.c === x.c) g.items.push(x); else groups.push({ c: x.c, items: [x] }); }
    if (!batch) S.pushUndo();
    const plan = toks.length ? C().planEdit(groups.map(g => g.items.map(x => x.w)), toks) : groups.map(() => []);
    groups.forEach((g, i) => {
      const idx = g.items.map(x => g.c.words.indexOf(x.w)).filter(j => j >= 0);
      if (!idx.length) return;
      const lo = Math.min(...idx), hi = Math.max(...idx);
      g.c.words.splice(lo, hi - lo + 1, ...(mark ? plan[i] : plan[i].map(({ ed, ...w }) => w)));
    });
    if (!batch) commit(toks.length ? [a, a + toks.length - 1] : null);
    return true;
  }
  function commit(newSel) {
    if (S.CAP.some(c => !c.words.length)) S.CAP = S.CAP.filter(c => c.words.length);
    S.changed();
    tw = newSel ? { a: newSel[0], b: newSel[1] } : { a: -1, b: -1 };
    render(); focusWrap();
  }
  function hideSel() {
    const r = selRange(); if (!r) return;
    const t = textOf(r[0], r[1]);
    applyEdit(r[0], r[1], '');
    S.toast(`Đã xoá “${short(t)}” khỏi phụ đề, video giữ nguyên · ⌘Z hoàn tác`);
  }
  function cutSel() {
    const r = selRange(); if (!r) return;
    stopLoop();
    const span = S.ai.wordSpan(W, r[0], r[1]), t = textOf(r[0], r[1]);
    tw = { a: -1, b: -1 };
    if (S.ai.cutRanges([span], `Đã cắt “${short(t)}” khỏi video`)) S.setTime(span[0]);
    render(); focusWrap();
  }
  function toggleHl() {
    const r = selRange(); if (!r) return;
    const ws = W.slice(r[0], r[1] + 1).map(x => x.w), on = !ws.every(w => w.hl);
    S.pushUndo();
    for (const w of ws) { if (on) w.hl = true; else delete w.hl; }
    S.changed(); render(); focusWrap();
    S.toast(on ? `Đã nhấn mạnh “${short(textOf(r[0], r[1]))}” trên phụ đề` : 'Đã bỏ nhấn mạnh');
  }
  function toggleBr() {
    const r = selRange(); if (!r) return;
    const w = W[r[1]].w, on = !w.br;
    S.pushUndo();
    if (on) w.br = true; else delete w.br;
    S.changed(); render(); focusWrap();
    S.toast(on ? `Phụ đề xuống dòng sau “${short(w.w)}”` : 'Đã bỏ xuống dòng');
  }
  // Play the selection over and over until Esc / pause.
  function loopSel() {
    const r = selRange(); if (!r) return;
    if (loopT) { stopLoop(); return S.toast('Đã dừng phát lặp'); }
    const a = Math.max(0, W[r[0]].w.s - .05), b = W[r[1]].w.e + .05;
    S.setTime(a); if (!playing) play();
    loopT = setInterval(() => { if (!playing) return stopLoop(); if (S.T >= b || S.T < a - .5) S.setTime(a); }, 40);
    paintSel();
    S.toast('Đang phát lặp đoạn đã chọn · Esc để dừng');
  }
  function stopLoop() { if (!loopT) return; clearInterval(loopT); loopT = null; if (playing) play(); paintSel(); }

  // ---------- inline editor ----------
  function startEdit(initial) {
    const r = selRange(); if (!r || editing) return;
    stopLoop(); closeMenu();
    const spans = [...document.querySelectorAll('#twwrap .tw')].filter(el => +el.dataset.k >= r[0] && +el.dataset.k <= r[1]);
    if (!spans.length) return;
    const old = textOf(r[0], r[1]);
    editing = { a: r[0], b: r[1], done: false };
    const inp = document.createElement('input');
    inp.className = 'tx-edit'; inp.value = initial ?? old; inp.spellcheck = false; inp.autocomplete = 'off';
    inp.setAttribute('aria-label', `Sửa “${old}”: Enter lưu, Esc huỷ`);
    const fit = () => { inp.size = Math.max(3, [...inp.value].length + 1); };
    fit(); inp.addEventListener('input', fit);
    spans[0].before(inp); spans.forEach(s => s.classList.add('tx-off'));
    $('#txbar').hidden = true;
    inp.focus();
    if (initial == null) inp.select(); else inp.setSelectionRange(inp.value.length, inp.value.length);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); finishEdit(true, inp.value); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishEdit(false); }
    });
    inp.addEventListener('blur', () => finishEdit(true, inp.value));
  }
  function finishEdit(save, val) {
    if (!editing || editing.done) return;
    editing.done = true;
    const { a, b } = editing, old = textOf(a, b), next = C().tokenize(val).join(' ');
    editing = null;
    if (save && next !== old) {
      applyEdit(a, b, next);
      S.toast(next ? `Đã sửa “${short(old)}” → “${short(next)}” trên phụ đề · ⌘Z hoàn tác` : `Đã xoá “${short(old)}” khỏi phụ đề, video giữ nguyên`);
      return;
    }
    render(); focusWrap();
  }

  // ---------- context menu ----------
  function openMenu(x, y) {
    closeMenu();
    const r = selRange(); if (!r) return;
    const g = sugAt(r);
    const items = acts().map(([k, i, l, kb]) => `<button type="button" role="menuitem" tabindex="-1" data-txact="${k}"><i class="ti ${i}"></i><span>${l}</span>${kb ? `<kbd>${kb}</kbd>` : ''}</button>`);
    if (g) items.unshift(`<button type="button" role="menuitem" tabindex="-1" data-txact="sug-ok" data-sug="${g.id}"><i class="ti ti-check"></i><span>Nhận đề xuất: “${esc(short(g.to))}”</span></button>`,
      `<button type="button" role="menuitem" tabindex="-1" data-txact="sug-no" data-sug="${g.id}"><i class="ti ti-x"></i><span>Bỏ đề xuất</span></button>`, '<div role="separator"></div>');
    const m = document.createElement('div');
    m.className = 'tx-menu'; m.id = 'txmenu'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', `Đoạn “${short(textOf(r[0], r[1]))}”`);
    m.innerHTML = items.join('');
    document.body.appendChild(m);
    const R = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(x, innerWidth - R.width - 8)) + 'px';
    m.style.top = Math.max(8, Math.min(y, innerHeight - R.height - 8)) + 'px';
    m.addEventListener('click', e => { const b = e.target.closest('[data-txact]'); if (!b) return; closeMenu(); act(b.dataset.txact, +b.dataset.sug); });
    m.querySelector('[role=menuitem]')?.focus();
  }
  function closeMenu(refocus) { const m = $('#txmenu'); if (!m) return; m.remove(); if (refocus) focusWrap(); }
  function menuKey(e, m) {
    const items = [...m.querySelectorAll('[role=menuitem]')], i = items.indexOf(document.activeElement);
    const go = j => { e.preventDefault(); items[(j + items.length) % items.length]?.focus(); };
    e.stopImmediatePropagation();
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenu(true); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.activeElement?.click(); }
  }
  function menuAtSel() {
    const r = selRange(); if (!r) return;
    const R = spanOf(r[1])?.getBoundingClientRect(); if (!R) return;
    openMenu(R.left, R.bottom + 4);
  }
  function act(k, sid) {
    if (k === 'edit') startEdit();
    else if (k === 'hl') toggleHl();
    else if (k === 'br') toggleBr();
    else if (k === 'hide') hideSel();
    else if (k === 'cut') cutSel();
    else if (k === 'loop') loopSel();
    else if (k === 'sug-ok') acceptSuggestion(sid);
    else if (k === 'sug-no') rejectSuggestion(sid);
  }
  function setMode(m) {
    if (m === mode) return;
    mode = m; try { localStorage.setItem(MODE_KEY, m); } catch { /* private window */ }
    render();
    $(`[data-txmode="${m}"]`)?.focus();
    S.toast(m === 'text' ? 'Chế độ Sửa chữ: Delete chỉ xoá chữ khỏi phụ đề, video giữ nguyên' : 'Chế độ Cắt video: Delete cắt đoạn đã chọn khỏi video');
  }

  // ---------- find & replace ----------
  function findHtml() {
    const kit = dict?.kit;
    return `<section class="tx-box" id="txfind" role="search" aria-label="Tìm và thay">
      <div class="tx-boxhead"><b>Tìm và thay</b>${ibtn('data-txf="close"', 'ti-x', 'Đóng tìm và thay')}</div>
      <div class="tx-row"><input class="ui-input" id="txq" placeholder="Tìm, vd: tiền hóa" aria-label="Tìm" value="${esc(find.q)}" autocomplete="off" spellcheck="false"><span class="tx-count" id="txcount" aria-live="polite"></span></div>
      <div class="tx-row"><input class="ui-input" id="txr" placeholder="Thay bằng, vd: tiến hoá" aria-label="Thay bằng" value="${esc(find.r)}" autocomplete="off" spellcheck="false"></div>
      <div class="tx-opts"><label><input type="checkbox" id="txna" ${find.na ? 'checked' : ''}> Không phân biệt dấu</label>
        <label><input type="checkbox" id="txmem" ${find.mem ? 'checked' : ''}> Nhớ cho lần sau</label>
        ${kit ? `<select class="ui-input tx-scope" id="txscope" aria-label="Nhớ vào từ điển của"><option value="project">vào dự án này</option><option value="brand" ${find.scope === 'brand' ? 'selected' : ''}>vào thương hiệu ${esc(kit.title)}</option></select>` : ''}</div>
      <div class="tx-acts"><button type="button" class="ui-btn ui-btn--secondary ui-btn--sm" data-txf="one">Thay</button><button type="button" class="ui-btn ui-btn--primary ui-btn--sm" data-txf="all">Thay tất cả</button></div>
      <ul class="tx-hits" id="txhits" role="listbox" aria-label="Chỗ khớp, bấm để tua"></ul></section>`;
  }
  function updateFind() {
    find.hits = C().findMatches(W.map(x => x.w.w), find.q, { noAccent: find.na });
    if (find.cur >= find.hits.length) find.cur = 0;
    const hit = new Set(), cur = new Set();
    find.hits.forEach((h, j) => { for (let k = h.i; k < h.i + h.n; k++) (j === find.cur ? cur : hit).add(k); });
    for (const el of document.querySelectorAll('#twwrap .tw')) { const k = +el.dataset.k; el.classList.toggle('tw-hit', hit.has(k)); el.classList.toggle('tw-hitcur', cur.has(k)); }
    const cnt = $('#txcount'); if (!cnt) return;
    cnt.textContent = find.q.trim() ? `${find.hits.length} chỗ` : '';
    $('#txhits').innerHTML = find.hits.slice(0, 200).map((h, j) => `<li role="option" aria-selected="${j === find.cur}" data-hit="${j}"><span class="tx-t">${fmt(W[h.i].w.s)}</span><span class="tx-ctx">${esc(textOf(Math.max(0, h.i - 3), h.i - 1))} <mark>${esc(textOf(h.i, h.i + h.n - 1))}</mark> ${esc(textOf(h.i + h.n, Math.min(W.length - 1, h.i + h.n + 2)))}</span></li>`).join('');
    for (const b of document.querySelectorAll('[data-txf="one"],[data-txf="all"]')) b.disabled = !find.hits.length;
  }
  function goHit(j) {
    const h = find.hits[j]; if (!h) return;
    find.cur = j; tw = { a: h.i, b: h.i + h.n - 1 };
    paintSel(); updateFind();
    S.setTime(W[h.i].w.s + .001);
    spanOf(h.i)?.scrollIntoView({ block: 'nearest' });
  }
  async function replace(all) {
    if (!find.hits.length) return S.toast('Không có chỗ nào khớp');
    const list = all ? [...find.hits] : [find.hits[find.cur]];
    const seen = [...new Set(list.map(h => textOf(h.i, h.i + h.n - 1)))], to = C().tokenize(find.r).join(' ');
    S.pushUndo();
    for (const h of list.sort((x, y) => y.i - x.i)) applyEdit(h.i, h.i + h.n - 1, to, { batch: true });
    const first = list[list.length - 1];
    commit(to ? [first.i, first.i + C().tokenize(to).length - 1] : null);
    let msg = to ? `Đã thay ${list.length} chỗ “${short(seen[0])}” → “${short(to)}”` : `Đã xoá ${list.length} chỗ khỏi phụ đề`;
    if (find.mem && to) { const ok = await remember(seen.map(from => ({ from, to }))); if (ok) msg += ok; }
    S.toast(msg + ' · ⌘Z hoàn tác');
    if (box === 'find') $('#txq')?.focus();
  }
  // Save pairs into the project or brand dictionary; returns the toast suffix.
  async function remember(pairs) {
    if (!dict) await loadDict();
    if (!dict || dict.error) return ' (chưa nhớ được: không đọc được từ điển)';
    if (find.scope === 'brand' && dict.kit) {
      const r = await S.api('/api/brands/save', { brand: { id: dict.kit.id, dict: C().dictString([...dict.brand, ...pairs]) } });
      if (r.error) return ` (chưa nhớ được: ${r.error})`;
      dict.brand = C().parseDict(r.dict || '').entries;
      return `, đã nhớ vào từ điển thương hiệu ${dict.kit.title}`;
    }
    const r = await S.api('/api/dict', { entries: [...dict.project, ...pairs] });
    if (r.error) return ` (chưa nhớ được: ${r.error})`;
    dict.project = r.project;
    return ', đã nhớ vào từ điển dự án';
  }

  // ---------- dictionary ----------
  async function loadDict() {
    const kit = S.TL.brand?.kit;
    try { dict = await S.api('/api/dict' + (kit ? '?kit=' + encodeURIComponent(kit) : '')); } catch (e) { dict = { error: e.message }; }
    if (!dict || dict.error) dict = { project: [], brand: [], auto: [], kit: null, error: dict?.error || 'lỗi' };
    draft = null;
    if (panel === 'words' && box) renderBox();
  }
  function dictHtml() {
    const head = `<div class="tx-boxhead"><b>Từ điển sửa lời thoại</b>${ibtn('data-txd="close"', 'ti-x', 'Đóng từ điển')}</div>`;
    if (!dict) return `<section class="tx-box" aria-label="Từ điển sửa lời thoại" aria-busy="true">${head}<div class="ui-state ui-state--loading">Đang đọc từ điển…</div></section>`;
    return `<section class="tx-box" id="txdict" aria-label="Từ điển sửa lời thoại">${head}
      <p class="tx-note">Mỗi dòng một cặp <b>sai = đúng</b>, không phân biệt hoa thường. Tự áp mỗi lần tạo lại lời thoại; giữ thời gian của từ.</p>
      ${dict.error ? `<p class="tx-err">Không đọc được từ điển: ${esc(dict.error)}</p>` : ''}
      <div class="ui-field"><label class="ui-label" for="txdp">Dự án này</label><textarea class="ui-input" id="txdp" rows="4" spellcheck="false" placeholder="tiền hóa = tiến hoá">${esc(draft?.project ?? C().dictLines(dict.project))}</textarea></div>
      ${dict.kit ? `<div class="ui-field"><label class="ui-label" for="txdb">Thương hiệu ${esc(dict.kit.title)} · dùng cho mọi dự án của thương hiệu</label><textarea class="ui-input" id="txdb" rows="3" spellcheck="false" placeholder="ly chi = Lychee">${esc(draft?.brand ?? C().dictLines(dict.brand))}</textarea></div>`
        : '<p class="ui-hint">Dự án chưa gắn thương hiệu: chọn ở bước ① Thương hiệu để có từ điển dùng chung cho mọi dự án.</p>'}
      ${dict.auto.length ? `<div class="ui-field"><span class="ui-label">Tự có (tên thương hiệu, sản phẩm)</span><div class="tx-chips">${dict.auto.map(e => `<span class="ui-chip" title="${esc(e.from)} → ${esc(e.to)}">${esc(e.to)}</span>`).join('')}</div></div>` : ''}
      <p class="tx-err" id="txderr" role="alert"></p>
      <div class="tx-acts"><button type="button" class="ui-btn ui-btn--primary ui-btn--sm" data-txd="save">Lưu từ điển</button><button type="button" class="ui-btn ui-btn--secondary ui-btn--sm" data-txd="apply">Áp vào lời thoại này</button></div></section>`;
  }
  // Parse the textareas; marks a textarea invalid and returns null when a line is not "sai = đúng".
  function readDictForm() {
    const out = {}, errs = [];
    draft = { project: $('#txdp')?.value, brand: $('#txdb')?.value };
    for (const [id, key] of [['#txdp', 'project'], ['#txdb', 'brand']]) {
      const el = $(id); if (!el) continue;
      const p = C().parseDict(el.value);
      el.setAttribute('aria-invalid', p.bad.length ? 'true' : 'false');
      if (p.bad.length) errs.push(`Dòng chưa đúng dạng “sai = đúng”: ${p.bad.slice(0, 3).map(b => `“${b}”`).join(', ')}`);
      out[key] = p.entries;
    }
    const e = $('#txderr'); if (e) e.textContent = errs.join('. ');
    return errs.length ? null : out;
  }
  async function saveDict() {
    const f = readDictForm(); if (!f) return;
    const r = await S.api('/api/dict', { entries: f.project });
    if (r.error) return S.toast('Chưa lưu được từ điển: ' + r.error);
    dict.project = r.project;
    if (dict.kit && f.brand && C().dictString(f.brand) !== C().dictString(dict.brand)) {
      const b = await S.api('/api/brands/save', { brand: { id: dict.kit.id, dict: C().dictString(f.brand) } });
      if (b.error) return S.toast('Đã lưu từ điển dự án; từ điển thương hiệu chưa lưu được: ' + b.error);
      dict.brand = C().parseDict(b.dict || '').entries;
    }
    draft = null; renderBox();
    S.toast(`Đã lưu từ điển: ${dict.project.length} cặp của dự án${dict.kit ? `, ${dict.brand.length} cặp của thương hiệu` : ''}. Lần tạo lại lời thoại sau sẽ tự áp.`);
  }
  // Apply every pair to the current captions now (one undo step).
  function applyDict() {
    const f = readDictForm(); if (!f) return;
    const entries = [...dict.auto, ...(f.brand || dict.brand), ...f.project], words = W.map(x => x.w.w), hits = [];
    for (const e of entries) for (const h of C().findMatches(words, e.from)) if (textOf(h.i, h.i + h.n - 1) !== e.to) hits.push({ ...h, to: e.to });
    hits.sort((x, y) => y.i - x.i);
    const keep = []; let lo = Infinity;
    for (const h of hits) if (h.i + h.n - 1 < lo) { keep.push(h); lo = h.i; }
    if (!keep.length) return S.toast('Lời thoại không có chỗ nào cần sửa theo từ điển');
    S.pushUndo();
    for (const h of keep) applyEdit(h.i, h.i + h.n - 1, h.to, { batch: true });
    commit(null);
    S.toast(`Đã sửa ${keep.length} chỗ theo từ điển · ⌘Z hoàn tác`);
  }
  function openBox(b) {
    box = box === b ? '' : b;
    if (box && !dict) loadDict();
    render();
    if (box === 'find') { const q = $('#txq'); const r = selRange(); if (r && !find.q) { q.value = find.q = textOf(r[0], r[1]); updateFind(); } q.focus(); q.select(); }
    if (box === 'dict') $('#txdp')?.focus();
    if (!box) focusWrap();
  }

  // ---------- suggestions (M90 builds on this; in memory only, never saved into the timeline) ----------
  function sugRange(g) {
    const ks = []; for (const [k, x] of W.entries()) if (x.w.s >= g.s - .03 && x.w.e <= g.e + .03) ks.push(k);
    return ks.length ? [ks[0], ks[ks.length - 1]] : null;
  }
  function sugAt(r) { return sugs.find(g => { const q = sugRange(g); return q && q[0] <= r[1] && q[1] >= r[0]; }); }
  function suggest(list) {
    sugs = (Array.isArray(list) ? list : []).filter(x => x && Number.isFinite(+x.s) && Number.isFinite(+x.e) && typeof x.to === 'string')
      .map(x => ({ id: ++sugId, s: +x.s, e: +x.e, to: x.to.slice(0, 200), from: String(x.from || '').slice(0, 200), reason: String(x.reason || '').slice(0, 300) }));
    if (panel === 'words') render();
    return sugs.map(g => ({ ...g }));
  }
  function acceptSuggestion(id) {
    const g = sugs.find(x => x.id === id); if (!g) return false;
    const q = sugRange(g); sugs = sugs.filter(x => x !== g);
    if (!q) { render(); return false; }
    const old = textOf(q[0], q[1]);
    applyEdit(q[0], q[1], g.to);
    S.toast(`Đã nhận đề xuất “${short(old)}” → “${short(g.to)}” · ⌘Z hoàn tác`);
    return true;
  }
  function rejectSuggestion(id) { const n = sugs.length; sugs = sugs.filter(x => x.id !== id); if (panel === 'words') render(); return sugs.length < n; }

  // ---------- events ----------
  S.addPanel('words', 'ti-file-text', 'Lời thoại', render);
  const lib = $('#libbody');
  lib.addEventListener('mousedown', e => {
    if (panel !== 'words') return;
    const el = e.target.closest('#twwrap .tw'); if (!el) return;
    if (editing) { $('.tx-edit')?.blur(); if (e.button === 0) e.preventDefault(); return; }
    const k = +el.dataset.k, r = selRange();
    if (e.button === 2) { if (!r || k < r[0] || k > r[1]) { tw = { a: k, b: k }; paintSel(); } return; }
    if (e.button !== 0) return;
    e.preventDefault(); closeMenu(); focusWrap();
    if (e.shiftKey && tw.a >= 0) tw.b = k; else tw = { a: k, b: k, drag: true, moved: false };
    paintSel();
  });
  lib.addEventListener('mouseover', e => {
    if (panel !== 'words' || !tw.drag) return;
    const el = e.target.closest('#twwrap .tw'); if (!el) return;
    const k = +el.dataset.k; if (k !== tw.b) { tw.b = k; tw.moved = true; paintSel(); }
  });
  window.addEventListener('mouseup', e => {
    if (panel !== 'words' || !tw.drag) return;
    tw.drag = false;
    if (!tw.moved && !e.shiftKey && W[tw.a]) S.setTime(W[tw.a].w.s + .001);
  });
  lib.addEventListener('dblclick', e => {
    if (panel !== 'words') return;
    const el = e.target.closest('#twwrap .tw'); if (!el) return;
    tw = { a: +el.dataset.k, b: +el.dataset.k }; paintSel(); startEdit();
  });
  lib.addEventListener('contextmenu', e => {
    if (panel !== 'words' || !e.target.closest('#twwrap .tw')) return;
    e.preventDefault(); openMenu(e.clientX, e.clientY);
  });
  document.addEventListener('mousedown', e => { if ($('#txmenu') && !e.target.closest('#txmenu')) closeMenu(); }, true);
  lib.addEventListener('click', e => {
    if (panel !== 'words') return;
    const t = e.target, m = t.closest('[data-tws]');
    if (m) return S.setTime(+m.dataset.tws);
    const b = t.closest('[data-txmode],[data-txact],[data-txf],[data-txd],[data-hit]');
    if (!b) return;
    if (b.dataset.txmode) return setMode(b.dataset.txmode);
    if (b.dataset.txact) return act(b.dataset.txact);
    if (b.dataset.hit) return goHit(+b.dataset.hit);
    if (b.dataset.txf === 'close' || b.dataset.txd === 'close') return openBox(box);
    if (b.dataset.txf) return replace(b.dataset.txf === 'all');
    if (b.dataset.txd === 'save') return saveDict();
    if (b.dataset.txd === 'apply') return applyDict();
  });
  lib.addEventListener('input', e => {
    if (panel !== 'words') return;
    const id = e.target.id;
    if (id === 'txq') { find.q = e.target.value; find.cur = 0; updateFind(); }
    if (id === 'txr') find.r = e.target.value;
    if (id === 'txna') { find.na = e.target.checked; updateFind(); }
    if (id === 'txmem') find.mem = e.target.checked;
    if (id === 'txscope') find.scope = e.target.value;
  });
  lib.addEventListener('change', e => { if (panel === 'words' && e.target.id === 'txscope') find.scope = e.target.value; });
  lib.addEventListener('keydown', e => {
    if (panel !== 'words') return;
    const id = e.target.id;
    if ((id === 'txq' || id === 'txr') && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return openBox('find'); }
    if (id === 'txq' && e.key === 'Enter') { e.preventDefault(); return goHit(e.shiftKey ? find.cur - 1 < 0 ? find.hits.length - 1 : find.cur - 1 : (find.cur + 1) % Math.max(1, find.hits.length)); }
    if (id === 'txr' && e.key === 'Enter') { e.preventDefault(); return replace(e.ctrlKey || e.metaKey); }
    const radio = e.target.closest?.('[data-txmode]');
    if (radio && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); setMode(mode === 'text' ? 'cut' : 'text'); }
  });
  $('#libact').addEventListener('click', e => {
    if (panel !== 'words') return;
    const b = e.target.closest('[data-tx]'); if (b) openBox(b.dataset.tx);
  });
  // Keys in the transcript (capture phase: before the editor's own shortcuts: Delete = remove element, ← → = frame step).
  window.addEventListener('keydown', e => {
    if (panel !== 'words') return;
    const menu = $('#txmenu'); if (menu) return menuKey(e, menu);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'h') { e.preventDefault(); e.stopImmediatePropagation(); return openBox('find'); }
    if (e.key === 'Escape' && loopT) { e.preventDefault(); e.stopImmediatePropagation(); stopLoop(); return S.toast('Đã dừng phát lặp'); }
    const ae = document.activeElement;
    if (/INPUT|TEXTAREA|SELECT/.test(ae?.tagName) || ae?.isContentEditable) return;
    if (ae && ae !== document.body && ae.id !== 'twwrap') return; // a focused button keeps Enter / Space
    const r = selRange();
    if (!r) {
      if (ae?.id === 'twwrap' && ['ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key) && W.length && !mod) {
        e.preventDefault(); e.stopImmediatePropagation(); const k = curK >= 0 ? curK : 0; tw = { a: k, b: k }; paintSel(); spanOf(k)?.scrollIntoView({ block: 'nearest' });
      }
      return;
    }
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (e.key === 'Delete' || e.key === 'Backspace') { stop(); return mode === 'text' ? hideSel() : cutSel(); }
    if (e.key === 'Enter' || e.key === 'F2') { stop(); return startEdit(); }
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { stop(); return menuAtSel(); }
    if (e.key === 'Escape') { stop(); tw = { a: -1, b: -1 }; return paintSel(); }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !mod && !e.altKey) {
      stop();
      const d = e.key === 'ArrowLeft' ? -1 : 1, clamp = k => Math.max(0, Math.min(W.length - 1, k));
      if (e.shiftKey) tw.b = clamp(tw.b + d); else { const k = clamp((d < 0 ? r[0] : r[1]) + d); tw = { a: k, b: k }; }
      paintSel(); spanOf(tw.b)?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key.length === 1 && e.key !== ' ' && !mod && !e.altKey) { stop(); return startEdit(e.key); }
  }, true);

  // For M90 / scripts / Claude in the browser (references/studio.md, "Lời thoại").
  S.transcript = {
    get mode() { return mode; }, setMode,
    words: () => S.ai.allWords().map((x, i) => ({ i, w: x.w.w, s: x.w.s, e: x.w.e, hl: !!x.w.hl, br: !!x.w.br, ed: !!x.w.ed })),
    applyEdit(i, n, text) { W = S.ai.allWords(); if (!(i >= 0 && n >= 1 && i + n <= W.length)) return false; return applyEdit(i, i + n - 1, String(text ?? '')); },
    find: (q, opts) => { const w = S.ai.allWords(); return C().findMatches(w.map(x => x.w.w), q, opts).map(h => ({ ...h, s: w[h.i].w.s, e: w[h.i + h.n - 1].w.e, text: w.slice(h.i, h.i + h.n).map(x => x.w.w).join(' ') })); },
    suggest, acceptSuggestion, rejectSuggestion,
    suggestions: () => sugs.map(g => ({ ...g })),
    clearSuggestions: () => suggest([]),
    dict: { load: async () => { await loadDict(); return dict; }, saveProject: async entries => { const r = await S.api('/api/dict', { entries }); if (!r.error && dict) dict.project = r.project; return r; } },
    openFind: () => openBox('find'), openDict: () => openBox('dict'),
  };
})();
