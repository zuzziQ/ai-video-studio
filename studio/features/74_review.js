// S22 M152: khung xem lại kết quả Claude dùng chung — Studio.review (lõi thuần 74_review.core.js).
//   Studio.review.open({ title, mode: 'variants' | 'list', items: [{ label, sub?, t0, t1, apply(tl, cap, commit) }], pick?,
//                        onAccept(items, n)?, onReject(items)?, onPick(i)?, onClose(reason)?, owner? })
//   - Bản mới vẽ ở một khung engine thứ hai (#rvframe) đè lên khung chính; khung chính vẫn là timeline thật (bản cũ). Vì vậy:
//     xem trước không ghi vào timeline (lưu / tự lưu không bao giờ dính bản xem trước), giữ "Trước" hoặc phím \ = ẩn khung mới,
//     "Chia đôi" = cắt khung mới theo vạch kéo được (trái cũ, phải mới).
//   - Mở ra là dời playhead vào đoạn đổi và phát lặp (±0,3 s); nút dừng / phát lại. ⤢ = phóng to khung (ẩn hai cột), thanh
//     Nhận / Bỏ nằm ngay dưới khung nên vẫn còn.
//   - Biến thể (C27): bấm / phím 1…3 chỉ đổi bản xem trước; Nhận mới áp. Danh sách: bấm dòng = nhảy tới và phát; Nhận từng cái
//     hoặc tất cả. Mỗi lần Nhận là một bước ⌘Z (pushUndo rồi apply(S.TL, S.CAP, true)).
'use strict';
(() => {
  const S = window.Studio, RC = window.ReviewCore;
  if (!S || !RC) return;
  const { $, esc } = S;
  const css = document.createElement('style');
  css.textContent = `
#rvframe { position: absolute; left: 0; top: 0; border: 0; transform-origin: 0 0; pointer-events: none; }
#rvframe[hidden] { display: none; }
#stagebox.rv-before #rvframe { visibility: hidden; }
#stagebox.rv-split #rvframe { clip-path: inset(0 0 0 calc(var(--rv-x, .5) * 100%)); }
#stagebox .rv-tag { position: absolute; top: var(--space-2); z-index: 3; padding: var(--space-050) var(--space-2); border-radius: var(--radius-control); font-size: var(--text-2xs); font-weight: 600;
  background: rgb(var(--color-scrim) / .72); color: rgb(var(--color-fg-on-media)); pointer-events: none; }
#stagebox .rv-tag.l { left: var(--space-2); } #stagebox .rv-tag.r { right: var(--space-2); }
#stagebox .rv-tag[hidden] { display: none; }
#rvsplit { position: absolute; top: 0; bottom: 0; left: calc(var(--rv-x, .5) * 100%); width: 24px; margin-left: -12px; z-index: 4; cursor: ew-resize; touch-action: none; display: flex; justify-content: center; }
#rvsplit[hidden] { display: none; }
#rvsplit::before { content: ''; width: 2px; height: 100%; background: rgb(var(--color-white)); box-shadow: 0 0 0 1px rgb(var(--color-black) / .45); }
#rvsplit i { position: absolute; top: 50%; width: 22px; height: 22px; margin-top: -11px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: rgb(var(--color-white)); color: rgb(var(--color-black)); font-size: 14px; box-shadow: var(--shadow-card); }
#rvbar { flex: none; display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-2) var(--space-3); border-top: 1px solid rgb(var(--color-line)); background: rgb(var(--color-surface-raised)); min-width: 0; }
#rvbar .rv-top { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; min-width: 0; }
#rvbar .rv-title { display: flex; align-items: center; gap: var(--space-1); font-size: var(--text-sm); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#rvbar .rv-title .ti { color: rgb(var(--color-accent-text)); }
#rvbar .rv-when { font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); font-variant-numeric: tabular-nums; white-space: nowrap; }
#rvbar .rv-tools { display: flex; align-items: center; gap: var(--space-1); }
#rvbar .grow { flex: 1; }
#rvbar button[aria-pressed="true"] { border-color: rgb(var(--color-accent)); color: rgb(var(--color-accent-text)); background: rgb(var(--color-accent-soft) / .22); }
#rvbar .rv-vars { display: flex; gap: var(--space-2); flex-wrap: wrap; }
#rvbar .rv-vars button { display: flex; align-items: center; gap: var(--space-1); min-width: 0; max-width: 180px; }
#rvbar .rv-vars button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#rvbar kbd { font-size: var(--text-2xs); padding: 0 var(--space-1); border-radius: var(--radius-xs); border: 1px solid rgb(var(--color-line-strong)); color: rgb(var(--color-fg-muted)); }
#rvbar .rv-list { margin: 0; padding: 0; list-style: none; max-height: 168px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
#rvbar .rv-list li { display: flex; align-items: center; gap: var(--space-2); padding: 2px var(--space-1); border-radius: var(--radius-control); min-width: 0; }
#rvbar .rv-list li.on { background: rgb(var(--color-accent-soft) / .22); }
#rvbar .rv-list li.done, #rvbar .rv-list li.skip { opacity: .55; }
#rvbar .rv-go { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: var(--space-2); border: 0; background: transparent; text-align: left; padding: var(--space-050) var(--space-1); }
#rvbar .rv-go .t { font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); font-variant-numeric: tabular-nums; flex: none; }
#rvbar .rv-go .l { font-size: var(--text-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
#rvbar .rv-go small { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
#rvbar .rv-st { font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); flex: none; }`;
  document.head.appendChild(css);

  let R = null; // phiên đang mở: { s (lõi), o (tuỳ chọn), range, loop, before, split, x, zoomed }
  let F = null; // khung engine thứ hai: { el, win, stale, busy, pending, t }
  const box = () => $('#stagebox');
  const refit = () => window.dispatchEvent(new Event('resize')); // studio.js fit() theo resize: thanh chiếm chỗ dưới khung

  // ---------- khung bản mới ----------
  function frame() {
    if (F) return F;
    const el = document.createElement('iframe');
    el.id = 'rvframe'; el.src = '/engine/index.html'; el.hidden = true; el.tabIndex = -1;
    el.setAttribute('scrolling', 'no'); el.setAttribute('aria-hidden', 'true');
    $('#frame').after(el);
    F = { el, win: null, stale: true, busy: false, pending: false, t: -1 };
    el.addEventListener('load', () => { F.win = el.contentWindow; F.stale = true; paintFrame(); });
    return F;
  }
  function syncSize() {
    const a = $('#frame'); if (!F || !a) return;
    for (const k of ['width', 'height', 'transform']) if (F.el.style[k] !== a.style[k]) F.el.style[k] = a.style[k];
  }
  // Bản xem trước = bản sao timeline thật + các mục đang xem (giống previewTL() của studio.js, bỏ phần ẩn track)
  function previewObj() {
    const tl = JSON.parse(JSON.stringify(S.TL)), cap = JSON.parse(JSON.stringify(S.CAP || []));
    for (const i of RC.previewIdx(R.s)) { try { R.s.items[i].apply(tl, cap, false); } catch (e) { console.error(e); } }
    tl.captions = cap; tl.base = S.pbase; tl.width = S.DW; tl.height = S.DH;
    if (tl.aroll && S.META?.frames) tl.aroll.count = S.META.frames;
    return tl;
  }
  async function paintFrame() {
    if (!R || !F?.win?.renderFrame) return;
    if (F.busy) { F.pending = true; return; }
    F.busy = true;
    try {
      const capped = p => Promise.race([p, new Promise(r => setTimeout(r, 1200))]);
      syncSize();
      if (F.stale) { F.stale = false; await capped(F.win.init(previewObj())); }
      F.t = S.T; await capped(F.win.renderFrame(F.t));
      if (R) F.el.hidden = false; // chỉ hiện khi đã có một khung, không nháy trắng
    } catch (e) { console.error(e); }
    F.busy = false;
    if (F.pending) { F.pending = false; paintFrame(); }
  }
  const restale = () => { if (F) { F.stale = true; paintFrame(); } };
  // Sau mỗi lần khung chính vẽ (drawOverlay → _ov): theo cỡ + thời điểm; timeline thật đổi (build) → dựng lại bản xem trước
  S._ov.push(() => { if (R && F) { syncSize(); if (F.stale || F.t !== S.T) paintFrame(); } });
  S._build.push(() => { if (R && F) F.stale = true; });

  // ---------- phát lặp ----------
  const playBtn = () => $('#play');
  function goTo(i, play = true) {
    const it = R.s.items[i]; if (!it) return;
    R.range = RC.range(it.t0, it.t1, S.TL.duration);
    S.setTime(RC.seekOf(R.range));
    if (play) { R.loop = true; if (!S.playing) playBtn()?.click(); }
    paintBar();
  }
  function stopLoop() { if (!R) return; R.loop = false; if (S.playing) playBtn()?.click(); paintBar(); }
  S._play.push((ev, T) => {
    if (!R) return;
    if (ev === 'stop') { if (R.loop) { R.loop = false; paintBar(); } return; }
    if (ev === 'tick' && R.loop) { const n = RC.loopStep(T, R.range); if (n != null) S.setTime(n); }
  });

  // ---------- trước / sau, chia đôi, phóng to ----------
  function setBefore(on) {
    if (!R || R.before === !!on) return;
    R.before = !!on; box()?.classList.toggle('rv-before', R.before); paintTags();
    const b = $('#rvbar [data-rv="before"]'); if (b) b.setAttribute('aria-pressed', String(R.before));
  }
  function setSplit(on) {
    if (!R) return;
    R.split = !!on; box()?.classList.toggle('rv-split', R.split);
    const h = $('#rvsplit'); if (h) h.hidden = !R.split;
    box()?.style.setProperty('--rv-x', String(R.x));
    paintTags(); paintBar();
  }
  function paintTags() {
    const l = $('#stagebox .rv-tag.l'), r = $('#stagebox .rv-tag.r'); if (!l || !r) return;
    l.hidden = !(R && (R.before || R.split)); r.hidden = !(R && R.split && !R.before);
    l.textContent = R?.split && !R.before ? 'Trước' : 'Bản cũ';
  }
  const expanded = () => document.body.classList.contains('expanded');
  function toggleZoom() { const b = $('#expand'); if (!b || !R) return; b.click(); R.zoomed = expanded(); paintBar(); }
  function stageParts() {
    const sb = box(); if (!sb || $('#rvsplit')) return;
    const h = document.createElement('div'); h.id = 'rvsplit'; h.hidden = true; h.setAttribute('role', 'slider'); h.tabIndex = 0;
    h.setAttribute('aria-label', 'Vạch chia trước / sau'); h.setAttribute('aria-valuemin', '5'); h.setAttribute('aria-valuemax', '95');
    h.innerHTML = '<i class="ti ti-arrows-horizontal"></i>';
    const tl = document.createElement('span'); tl.className = 'rv-tag l'; tl.hidden = true; tl.textContent = 'Trước';
    const tr = document.createElement('span'); tr.className = 'rv-tag r'; tr.hidden = true; tr.textContent = 'Sau';
    sb.append(h, tl, tr);
    const setX = x => { if (!R) return; R.x = x; sb.style.setProperty('--rv-x', String(x)); h.setAttribute('aria-valuenow', String(Math.round(x * 100))); };
    h.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); h.setPointerCapture(e.pointerId);
      const mv = ev => { const r = sb.getBoundingClientRect(); setX(RC.splitX(ev.clientX, r.left, r.width)); };
      const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); };
      h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    });
    h.addEventListener('keydown', e => {
      if (!R || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault(); e.stopPropagation(); setX(Math.min(.95, Math.max(.05, R.x + (e.key === 'ArrowLeft' ? -.05 : .05))));
    });
  }

  // ---------- thanh xem lại ----------
  function barHtml() {
    const s = R.s, o = R.o, c = RC.counts(s), many = s.mode === 'list' && s.items.length > 1, r = R.range;
    const top = `<div class="rv-top"><b class="rv-title"><i class="ti ti-eye"></i> ${esc(o.title || 'Xem lại thay đổi')}</b>
      ${r ? `<span class="rv-when">${RC.stamp(r.a)}–${RC.stamp(r.b)}</span>` : ''}
      <div class="rv-tools">
        <button class="icon" data-rv="loop" aria-pressed="${!!R.loop}" title="${R.loop ? 'Dừng phát lặp' : 'Phát lặp đoạn đổi'}" aria-label="${R.loop ? 'Dừng phát lặp' : 'Phát lặp đoạn đổi'}"><i class="ti ${R.loop ? 'ti-player-pause' : 'ti-player-play'}"></i></button>
        <button class="icon" data-rv="replay" title="Phát lại từ đầu đoạn" aria-label="Phát lại từ đầu đoạn"><i class="ti ti-repeat"></i></button>
        <button data-rv="before" aria-pressed="${!!R.before}" title="Giữ để xem bản cũ (giữ phím \\)"><i class="ti ti-history"></i> Trước</button>
        <button class="icon" data-rv="split" aria-pressed="${!!R.split}" title="Chia đôi: trái bản cũ, phải bản mới (kéo vạch)" aria-label="Chia đôi trước / sau"><i class="ti ti-columns-2"></i></button>
        <button class="icon" data-rv="zoom" aria-pressed="${expanded()}" title="${expanded() ? 'Thu nhỏ khung xem' : 'Phóng to khung xem'}" aria-label="Phóng to khung xem"><i class="ti ${expanded() ? 'ti-arrows-minimize' : 'ti-arrows-maximize'}"></i></button>
      </div><span class="grow"></span>
      ${c.open ? `<button class="primary" data-rv="accept"><i class="ti ti-check"></i> ${many ? `Nhận tất cả (${c.open})` : 'Nhận'}</button>` : ''}
      <button data-rv="reject"><i class="ti ti-x"></i> ${many ? 'Bỏ hết' : 'Bỏ'}</button></div>`;
    if (s.mode === 'variants') {
      return top + `<div class="rv-vars" role="radiogroup" aria-label="Phương án">${s.items.map((it, i) => `<button role="radio" data-rvgo="${i}" aria-checked="${s.pick === i}" aria-pressed="${s.pick === i}" title="${esc(it.sub || it.label)}"><kbd>${i + 1}</kbd><span>${esc(it.label)}</span></button>`).join('')}</div>`;
    }
    if (!many) return top;
    return top + `<ol class="rv-list">${s.items.map((it, i) => `<li class="${it.st !== 'open' ? it.st : ''} ${s.focus === i ? 'on' : ''}">
      <button class="rv-go" data-rvgo="${i}"><span class="t">${RC.stamp(it.t0)}</span><span class="l">${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>
      ${it.st === 'open' ? `<button class="mini" data-rvok="${i}">Nhận</button><button class="ghost mini" data-rvno="${i}">Bỏ</button>` : `<span class="rv-st">${it.st === 'done' ? 'Đã nhận' : 'Đã bỏ'}</span>`}</li>`).join('')}</ol>`;
  }
  function paintBar() {
    if (!R) return;
    let bar = $('#rvbar');
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'rvbar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Xem lại thay đổi');
      $('#controls').before(bar); bar.addEventListener('click', onBar);
      bar.addEventListener('pointerdown', e => { if (e.button === 0 && e.target.closest?.('[data-rv="before"]')) { R.ptr = true; setBefore(true); } });
      bar.addEventListener('pointerout', e => { const b = e.target.closest?.('[data-rv="before"]'); if (R?.ptr && b && !b.contains(e.relatedTarget)) { R.ptr = false; setBefore(false); } });
      requestAnimationFrame(refit);
    }
    const sc = bar.querySelector('.rv-list')?.scrollTop || 0;
    bar.innerHTML = barHtml();
    const L = bar.querySelector('.rv-list'); if (L) L.scrollTop = sc;
  }
  function onBar(e) {
    if (!R) return;
    const go = e.target.closest('[data-rvgo]'); if (go) return focusItem(+go.dataset.rvgo);
    const ok = e.target.closest('[data-rvok]'); if (ok) return accept(+ok.dataset.rvok);
    const no = e.target.closest('[data-rvno]'); if (no) return reject(+no.dataset.rvno);
    const a = e.target.closest('[data-rv]')?.dataset.rv; if (!a) return;
    if (a === 'loop') return R.loop ? stopLoop() : goTo(R.s.focus >= 0 ? R.s.focus : 0);
    if (a === 'replay') return goTo(R.s.focus >= 0 ? R.s.focus : 0);
    if (a === 'split') return setSplit(!R.split);
    if (a === 'zoom') return toggleZoom();
    if (a === 'accept') return accept();
    if (a === 'reject') return reject();
    // 'before' là nút giữ (pointerdown / up); bấm bằng phím thì đảo
    if (a === 'before' && e.detail === 0) setBefore(!R.before);
  }

  // ---------- chọn / Nhận / Bỏ ----------
  function focusItem(i) {
    if (!R || !R.s.items[i]) return;
    const was = R.s.pick;
    RC.focus(R.s, i);
    if (R.s.mode === 'variants' && R.s.pick !== was) { restale(); R.o.onPick?.(i); }
    goTo(i);
  }
  // Áp các mục lên timeline thật: một bước hoàn tác cho cả lượt
  function commit(idx) {
    S.pushUndo();
    let n = 0;
    for (const i of idx) { try { if (R.s.items[i].apply(S.TL, S.CAP, true) !== false) n++; } catch (e) { console.error(e); } }
    S.changed(true);
    return n;
  }
  function accept(i) {
    if (!R) return;
    const s = R.s, o = R.o;
    let idx;
    if (s.mode === 'variants') { idx = s.pick >= 0 ? [s.pick] : []; if (idx.length) RC.settle(s, idx[0], 'done'); }
    else if (i == null) idx = RC.settleAll(s);
    else { idx = s.items[i]?.st === 'open' ? [i] : []; if (idx.length) RC.settle(s, i, 'done'); }
    if (!idx.length) return;
    const items = idx.map(k => s.items[k]), n = commit(idx);
    if (o.onAccept) o.onAccept(items, n);
    else S.toast(n ? `Đã nhận ${n} thay đổi · ⌘Z để hoàn tác` : 'Không áp được: element không còn trên timeline');
    if (!RC.counts(s).open) return close('accepted');
    restale(); goTo(s.focus);
  }
  function reject(i) {
    if (!R) return;
    const s = R.s;
    if (s.mode === 'list' && i != null) {
      if (!RC.settle(s, i, 'skip').changed) return;
      R.o.onReject?.([s.items[i]]);
      if (!RC.counts(s).open) return close('rejected');
      restale(); return goTo(s.focus);
    }
    R.o.onReject?.(RC.openIdx(s).map(k => s.items[k]));
    close('rejected');
  }

  // ---------- mở / đóng ----------
  function open(o) {
    if (R) close('replaced');
    const s = RC.create(o || {});
    if (!s.items.length) return null;
    R = { s, o: o || {}, range: null, loop: false, before: false, split: false, x: 0.5, zoomed: false };
    frame(); stageParts(); F.stale = true; F.el.hidden = true;
    box()?.style.setProperty('--rv-x', '0.5');
    paintBar(); paintFrame();
    goTo(s.focus >= 0 ? s.focus : 0);
    return api;
  }
  function close(reason = 'closed') {
    if (!R) return;
    const o = R.o, wasZoom = R.zoomed;
    if (R.loop && S.playing) playBtn()?.click();
    setBefore(false); setSplit(false);
    R = null;
    if (F) F.el.hidden = true;
    paintTags();
    $('#rvbar')?.remove();
    if (wasZoom && expanded()) $('#expand')?.click();
    requestAnimationFrame(refit);
    try { o.onClose?.(reason); } catch (e) { console.error(e); }
  }

  window.addEventListener('keydown', e => {
    if (!R) return;
    const ae = document.activeElement;
    const typing = /INPUT|TEXTAREA|SELECT/.test(ae?.tagName || '') && ae.type !== 'checkbox' && ae.type !== 'range' || !!ae?.isContentEditable;
    const a = RC.keyAction({ key: e.key, typing, mod: e.metaKey || e.ctrlKey || e.altKey }, R.s);
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    if (a === 'before') { if (!e.repeat) setBefore(true); return; }
    if (a.pick != null) focusItem(a.pick);
  }, true);
  window.addEventListener('keyup', e => { if (R && e.key === '\\') setBefore(false); }, true);
  window.addEventListener('pointerup', () => { if (R?.ptr) { R.ptr = false; setBefore(false); } }, true);
  window.addEventListener('blur', () => { if (R) R.ptr = false; setBefore(false); });

  const api = {
    open, close, accept, reject,
    pick: i => focusItem(i),
    get active() { return !!R; }, get owner() { return R?.o.owner || null; }, get picked() { return R ? R.s.pick : -1; },
    get state() { return R ? { mode: R.s.mode, pick: R.s.pick, focus: R.s.focus, loop: R.loop, before: R.before, split: R.split, range: R.range, counts: RC.counts(R.s) } : null; },
  };
  S.review = api;
})();
