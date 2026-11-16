// Fit-to-box for graphic text (M94): text longer than its graphic's box shrinks (font-size, down to MIN of its own size)
// instead of being cut by the box; only past MIN does it get an ellipsis. Two users:
//  - HyperFrames blocks (engine/hf.js): hfFit(win, box, dur) once per iframe after it is ready, before the first seek.
//    Texts are the block's elements holding text of their own (data-hft or filled from variables); clip = every ancestor with overflow/clip-path + the block's content box.
//    Measured at a few fixed block times and the best-visible sample wins, so in/out animations do not count and the
//    result does not depend on which frame a (parallel) render starts at.
//  - Pack modules (engine/packs/*.js): an element with class "fit" (fixed width, white-space:nowrap) has its font-size
//    lowered each frame until its scrollWidth fits its clientWidth (layout px, unaffected by transforms). fitStage(stage).
// Vietnamese stacked accents (devmem ai-video-studio-019): an ellipsis box gets padding-block with an equal negative margin.
(() => {
  const MIN = .7;
  const textRect = el => {
    const r = el.ownerDocument.createRange(); r.selectNodeContents(el);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const q of r.getClientRects()) { if (q.width < 1 || q.height < 1) continue; x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); }
    return x1 > x0 ? { x0, y0, x1, y1 } : null;
  };
  // Ancestors that really clip el (overflow ≠ visible or clip-path), stopping at `stop`; null when el is not rendered.
  // An overflow box does not clip an absolutely/fixed positioned descendant whose containing block lies above it
  // (cta-lockup: a static .mount-card with overflow:hidden around an absolute #root), so skip those.
  const holdsFixed = cs => cs.transform !== 'none' || cs.filter !== 'none' || cs.perspective !== 'none'
    || /paint|layout|strict|content/.test(cs.contain) || /transform|filter/.test(cs.willChange);
  window.__clipChain = (el, stop) => {
    const w = el.ownerDocument.defaultView, out = [];
    let pend = null; // 'absolute' | 'fixed' while el's box escapes the ancestors up to its containing block
    for (let e = el; e && e !== stop && e !== el.ownerDocument.documentElement; e = e.parentElement) {
      const cs = w.getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return null;
      if (e !== el && pend && ((pend === 'absolute' && cs.position !== 'static') || holdsFixed(cs))) pend = null;
      if (!pend && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.clipPath !== 'none')) out.push(e);
      if (cs.position === 'absolute' || cs.position === 'fixed') pend = cs.position;
    }
    return out;
  };
  // visible share of el's text: { need } = scale that would make the text fit its clip (≤ 1), or null when nothing is visible
  function need(el, box) {
    const w = el.ownerDocument.defaultView, r = textRect(el); if (!r) return null;
    let op = 1; for (let e = el; e; e = e.parentElement) op *= +w.getComputedStyle(e).opacity;
    if (op < .05) return null;
    const chain = window.__clipChain(el, el.ownerDocument.body); if (!chain) return null;
    let c = { ...box };
    for (const e of chain) {
      const b = e.getBoundingClientRect(); if (b.width < 2 || b.height < 2) return null;
      c = { x0: Math.max(c.x0, b.left), y0: Math.max(c.y0, b.top), x1: Math.min(c.x1, b.right), y1: Math.min(c.y1, b.bottom) };
    }
    const tw = r.x1 - r.x0, th = r.y1 - r.y0;
    if (Math.min(r.x1, c.x1) - Math.max(r.x0, c.x0) <= 0 || Math.min(r.y1, c.y1) - Math.max(r.y0, c.y0) <= 0) return null;
    // room = the clip's span on the side(s) the text spills, measured from where the text starts
    const L = r.x0 < c.x0 - 1, R = r.x1 > c.x1 + 1;
    const roomW = L && R ? c.x1 - c.x0 : R ? c.x1 - Math.max(r.x0, c.x0) : r.x1 > c.x0 ? Math.min(r.x1, c.x1) - c.x0 : 0;
    const kw = L || R ? Math.min(1, Math.max(0, roomW - 2) / tw) : 1;
    const kh = r.y1 > c.y1 + th * .25 || r.y0 < c.y0 - th * .25 ? Math.min(1, (c.y1 - c.y0) / th) : 1;
    return Math.min(kw, kh);
  }
  // k = share of the text's current width that still fits: cap the element there and let the rest end in "…"
  const ellipsis = (el, w, k) => {
    const cs = w.getComputedStyle(el), max = Math.max(20, el.getBoundingClientRect().width * k - 2);
    if (cs.display === 'inline') el.style.display = 'inline-block';
    Object.assign(el.style, { maxWidth: max.toFixed(1) + 'px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    // the new clip must not cut stacked accents: a box without padding of its own gets padding-block, offset by margins
    if (parseFloat(cs.paddingTop) < parseFloat(cs.fontSize) * .25)
      Object.assign(el.style, { paddingTop: '.3em', paddingBottom: '.2em', marginTop: '-.3em', marginBottom: '-.2em' });
  };
  // HyperFrames: box = block content box in iframe px {x0,y0,x1,y1}; seek(t) moves the block; times = block times to sample
  window.hfFit = (win, box, seek, times) => {
    // every element holding text of its own: [data-hft] texts and the ones a block fills from its variables
    const d = win.document, els = [...d.body.querySelectorAll('*')].filter(e => !e.closest('svg,script,style,[data-hf-demo]')
      && [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim().length > 1 && /[\p{L}\p{N}]/u.test(n.nodeValue)));
    // (★★★★★ ratings and other symbol rows are cut to a score on purpose)
    if (!els.length) return [];
    const done = [];
    for (let round = 0; round < 3; round++) {
      const best = new Map();
      for (const t of times) { seek(t); for (const el of els) { const k = need(el, box); if (k != null) best.set(el, Math.max(best.get(el) ?? 0, k)); } }
      let changed = false;
      for (const [el, k] of best) {
        // < .45 even at its best: a ticker / giant backdrop word that runs past the box on purpose
        if (k > .985 || (round === 0 && k < .45)) { if (k < .45) els.splice(els.indexOf(el), 1); continue; }
        const cur = parseFloat(win.getComputedStyle(el).fontSize), base = +(el.dataset.fitBase || (el.dataset.fitBase = cur));
        const next = Math.max(base * MIN, cur * k * .99);
        if (next < cur - .2) { el.style.setProperty('font-size', next.toFixed(2) + 'px', 'important'); changed = true; if (!done.includes(el)) done.push(el); }
        else if (round === 2 || next <= base * MIN + .2) { if (!el.dataset.fitEll) { el.dataset.fitEll = 1; ellipsis(el, win, k); changed = true; } }
      }
      if (!changed) break;
    }
    return done.map(e => e.textContent.slice(0, 30));
  };
  // Pack modules: <el class="fit"> with a fixed width; deterministic per frame (layout px only).
  window.fitStage = (stage) => {
    for (const el of stage.querySelectorAll('.fit')) {
      if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) continue;
      const base = parseFloat(getComputedStyle(el).fontSize);
      for (let i = 0; i < 4; i++) {
        const k = Math.min(el.clientWidth / el.scrollWidth, el.scrollHeight > el.clientHeight + 1 ? el.clientHeight / el.scrollHeight : 1);
        if (k >= .995) break;
        const cur = parseFloat(el.style.fontSize) || base, next = Math.max(base * MIN, cur * k * .99);
        el.style.fontSize = next.toFixed(2) + 'px';
        if (next <= base * MIN + .01) {
          // last resort "…" only where the box already clips; a visible-overflow box (strip with its own padding/background)
          // keeps the 70 % text spilling a little rather than a clip that could cut stacked accents (devmem ai-video-studio-019)
          if (getComputedStyle(el).overflowX !== 'visible') el.style.textOverflow = 'ellipsis';
          break;
        }
      }
    }
  };
})();
