// S28 M202: xem thử chuyển cảnh trên footage thật (lõi 79_transpeek.core.js).
// Rê chuột / focus một ô chuyển cảnh — thư viện Chuyển cảnh (data-tr) hoặc mục Chuyển cảnh của clip (data-ctr) — khi đang chọn
// clip thứ 2 trở đi: khung xem trước chính phát lặp ±1 s quanh chỗ nối vào clip đó với loại đang rê, bằng TL TẠM
// (Studio.previewTL(bản sao) → win.init). Timeline thật không đổi: không pushUndo, không markDirty, nên không tự lưu.
// Rời ô (hoặc bấm phát, mở Studio.review) là dừng và Studio.redraw() dựng lại khung từ timeline thật tại playhead.
'use strict';
(() => {
  const S = window.Studio, PC = window.TransPeekCore;
  if (!S || !PC || !window.FX) return;
  const css = document.createElement('style');
  css.textContent = `
#stagebox .tp-tag { position: absolute; top: var(--space-2); left: 50%; transform: translateX(-50%); z-index: 3; padding: var(--space-050) var(--space-2);
  border-radius: var(--radius-control); font-size: var(--text-2xs); font-weight: 600; white-space: nowrap; pointer-events: none;
  background: rgb(var(--color-scrim) / .72); color: rgb(var(--color-fg-on-media)); }
#stagebox .tp-tag[hidden] { display: none; }`;
  document.head.appendChild(css);

  const SEL = '.tr[data-tr], .tr[data-ctr]';
  let P = null, wait = 0, gen = 0; // P: phiên đang phát { btn, type, sp, t0, tag }

  const ok = () => S.sel?.kind === 'clip' && S.sel.idx > 0 && !S.playing && !S.dragging && !S.review?.active && S.win?.init && S.win?.renderFrame;
  function tag(text) {
    let el = document.querySelector('#stagebox .tp-tag');
    if (!el) { el = document.createElement('div'); el.className = 'tp-tag'; el.setAttribute('aria-live', 'polite'); document.querySelector('#stagebox')?.appendChild(el); }
    el.textContent = text; el.hidden = !text;
  }
  async function start(btn) {
    const type = btn.dataset.tr ?? btn.dataset.ctr ?? '';
    if (P?.btn === btn) return;
    if (P) stop(false);
    if (!ok()) return;
    const idx = S.sel.idx, clip = S.TL.clips?.[idx], k = clipLayout()[idx];
    if (!clip || !k) return;
    const slider = document.querySelector('[data-transdur]')?.value;
    const dur = PC.durOf(clip, slider ?? (typeof transDur === 'number' ? transDur : undefined));
    const my = ++gen;
    P = { btn, type, sp: PC.span(k.t0, S.TL.duration), t0: 0 };
    tag(`Xem thử: ${type ? FX.get('trans', type)?.label || type : 'Không chuyển cảnh'}`);
    // S29 M203: xem thử với tham số của chỗ nối (cùng loại: nguyên params; loại khác: phần loại đó cũng có, như khi bấm áp)
    const params = clip.transition?.type === type ? clip.transition.params : S.transUI?.cleanParams(type, clip.transition?.params);
    try { await S.win.init(S.previewTL(PC.peekTL(S.TL, idx, type, dur, params))); } catch (e) { console.error(e); }
    if (my !== gen) return;
    P.t0 = performance.now();
    const loop = async () => {
      if (my !== gen) return;
      if (!ok()) return stop();
      try { await S.win.renderFrame(PC.frameT(P.sp, performance.now() - P.t0)); } catch (e) { console.error(e); }
      if (my === gen) setTimeout(loop, 16); // renderFrame đã chờ ảnh; không dùng rAF (bị hãm khi khung ẩn)
    };
    loop();
  }
  function stop(redraw = true) {
    clearTimeout(wait);
    if (!P) return;
    P = null; gen++; tag('');
    if (redraw) S.redraw();
  }
  const enter = btn => { clearTimeout(wait); wait = setTimeout(() => start(btn), 120); };
  const leave = (btn, to) => { if (to && btn.contains(to)) return; clearTimeout(wait); if (P?.btn === btn) stop(); };

  document.addEventListener('mouseover', e => { const b = e.target.closest?.(SEL); if (b) enter(b); });
  document.addEventListener('mouseout', e => { const b = e.target.closest?.(SEL); if (b) leave(b, e.relatedTarget); });
  document.addEventListener('focusin', e => { const b = e.target.closest?.(SEL); if (b) enter(b); });
  document.addEventListener('focusout', e => { const b = e.target.closest?.(SEL); if (b) leave(b, e.relatedTarget); });
  // Bấm ô = áp thật (studio.js / library.js vẽ lại panel, nút cũ mất): dừng xem thử trước để khung dựng từ timeline mới
  document.addEventListener('click', e => { if (P && e.target.closest?.(SEL)) stop(false); }, true);
  S.transPeek = { get active() { return !!P; }, stop };
})();
