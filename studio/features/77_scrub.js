// S23 M162: dải tua 40 px — mức "strip" của timeline 3 mức (Studio.layout, 76_layout.js). Lõi thuần 77_scrub.core.js.
// Ảnh nhỏ theo thời gian (khung của Video chính, theo bộ lọc clip), playhead, vạch cắt (ranh clip) / cảnh (đầu cảnh),
// kéo hoặc bấm để tua (bắt dính vạch trong 6 px, giữ Alt để tắt), rê chuột thấy thời điểm, bấm đúp mở mức "gọn".
// Phím khi dải đang focus: ← / → 1 giây (Shift 5 giây), Home / End, PageUp / PageDown nhảy vạch trước / sau.
// Bề rộng theo container (#tlwrap, ResizeObserver), không theo cửa sổ. CSS: khối "S23 M162" cuối studio/studio.css.
'use strict';
(() => {
  const S = window.Studio, SC = window.ScrubCore;
  if (!S || !SC || !S.layout) return;
  /* global clipLayout, clipAtT, srcAt, clipFrameUrl, clipFilterCss -- studio/clips.js */
  const { $, esc, fmt } = S;
  const wrap = $('#tlwrap'); if (!wrap) return;

  const el = document.createElement('div');
  el.id = 'tlstrip'; el.tabIndex = 0;
  el.setAttribute('role', 'slider'); el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-label', 'Dải tua: kéo hoặc bấm để tua, bấm đúp mở timeline gọn (phím ` đổi mức)');
  el.innerHTML = '<div class="scr-film"></div><div class="scr-done"></div><div class="scr-marks"></div><div class="scr-hover"></div><div class="scr-head"></div><div class="scr-tip" hidden></div>';
  wrap.append(el);
  const film = el.querySelector('.scr-film'), done = el.querySelector('.scr-done'), marksEl = el.querySelector('.scr-marks'),
    hoverEl = el.querySelector('.scr-hover'), head = el.querySelector('.scr-head'), tip = el.querySelector('.scr-tip');

  const on = () => S.layout.get().tl === 'strip';
  const dur = () => +S.TL?.duration || 0;
  const ratio = () => (S.DW && S.DH ? S.DW / S.DH : 9 / 16);
  const layout = () => { try { return typeof clipLayout === 'function' && S.TL ? clipLayout() : []; } catch { return []; } };
  let W = 0, MARKS = [], lastSig = '';

  // ---------- vẽ ô ảnh nhỏ + vạch ----------
  function paint(force) {
    if (!S.TL || !on()) return;
    W = el.clientWidth;
    const L = layout(), scenes = S.TL.scenes || [], D = dur(), s = SC.sig(D, W, ratio(), L, scenes);
    if (!force && s === lastSig) return;
    lastSig = s;
    let h = '';
    for (const t of SC.tiles(D, W, ratio())) {
      let url = '', fx = 'none';
      try { const k = clipAtT(t.t); if (k) { url = clipFrameUrl(k.c, srcAt(k, t.t)); fx = clipFilterCss(k.c); } } catch {}
      h += `<i style="left:${t.x}px;width:${t.w}px;${url ? `background-image:url(&quot;${esc(url)}&quot;);` : ''}${fx !== 'none' ? `filter:${esc(fx)};` : ''}"></i>`;
    }
    film.innerHTML = h;
    MARKS = SC.marks(L, scenes, D);
    marksEl.innerHTML = D > 0 ? MARKS.map(m => `<b class="scr-${m.kind}" style="left:${(m.t / D * 100).toFixed(3)}%"></b>`).join('') : '';
    el.setAttribute('aria-valuemax', String(Math.round(D * 10) / 10));
  }

  // ---------- playhead (rAF chỉ khi dải đang hiện) ----------
  let raf = 0, lastChk = 0;
  function tick(now) {
    if (!on()) { raf = 0; return; }
    const D = dur(), p = D ? Math.min(1, Math.max(0, S.T / D)) : 0;
    done.style.width = head.style.left = p * 100 + '%';
    el.setAttribute('aria-valuenow', String(Math.round(S.T * 10) / 10));
    el.setAttribute('aria-valuetext', `${fmt(S.T)} / ${fmt(D)}`);
    if (now - lastChk > 400) { lastChk = now; paint(); } // sửa clip / cảnh / thời lượng: vẽ lại khi chữ ký đổi
    raf = requestAnimationFrame(tick);
  }
  function wake() { if (on() && !raf) raf = requestAnimationFrame(tick); if (on()) paint(); }

  // ---------- kéo / bấm để tua ----------
  let seeking = false;
  const at = (x, alt) => {
    const r = el.getBoundingClientRect(), D = dur();
    const t = SC.timeAt(x, r.left, r.width, D);
    return alt ? { t, mark: null } : SC.snap(t, MARKS, r.width, D);
  };
  function showTip(x, alt) {
    const r = el.getBoundingClientRect(), s = at(x, alt), D = dur();
    if (!D || !r.width) return s;
    const kind = s.mark ? (s.mark.kind === 'cut' ? ` · cắt clip ${s.mark.i + 1}` : ` · cảnh${s.mark.type ? ' ' + (S.typeName?.(s.mark.type) || s.mark.type) : ''}`) : '';
    tip.textContent = fmt(s.t) + kind;
    tip.hidden = false;
    const px = s.t / D * r.width, tw = tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(r.width - tw, px - tw / 2)) + 'px';
    hoverEl.style.left = px + 'px'; hoverEl.hidden = false;
    return s;
  }
  const hideTip = () => { tip.hidden = true; hoverEl.hidden = true; };
  el.addEventListener('pointerdown', e => {
    if (e.button || !dur()) return;
    seeking = true; el.setPointerCapture(e.pointerId); el.classList.add('scr-seeking');
    S.setTime(showTip(e.clientX, e.altKey).t);
  });
  el.addEventListener('pointermove', e => { const s = showTip(e.clientX, e.altKey); if (seeking) S.setTime(s.t); });
  const end = () => { seeking = false; el.classList.remove('scr-seeking'); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', () => { if (!seeking) hideTip(); });
  el.addEventListener('dblclick', () => { hideTip(); S.layout.set('tl', 'compact'); });

  // ---------- phím khi dải đang focus (không để phím tắt chung bắt mũi tên) ----------
  el.addEventListener('keydown', e => {
    const D = dur(); if (!D || e.metaKey || e.ctrlKey) return;
    let t = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') t = S.T + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1);
    else if (e.key === 'Home') t = 0;
    else if (e.key === 'End') t = D;
    else if (e.key === 'PageUp') t = [...MARKS].reverse().find(m => m.t < S.T - 0.01)?.t ?? 0;
    else if (e.key === 'PageDown') t = MARKS.find(m => m.t > S.T + 0.01)?.t ?? D;
    else if (e.key === 'Enter') { S.layout.set('tl', 'compact'); e.preventDefault(); e.stopPropagation(); return; }
    if (t == null) return;
    e.preventDefault(); e.stopPropagation();
    S.setTime(Math.min(D, Math.max(0, t)));
  });

  // ---------- khi nào vẽ lại ----------
  if (window.ResizeObserver) new ResizeObserver(() => { if (on()) paint(); }).observe(el);
  S.layout.on(st => { if (st.tl === 'strip') wake(); else hideTip(); });
  S.onReady(() => wake());

  S.scrub = { refresh: () => paint(true), get marks() { return MARKS.map(m => ({ ...m })); } };
})();
