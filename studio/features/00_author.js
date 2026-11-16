// Author card shown every time the Studio opens (+ "Tác giả" chip next to the logo to see it again).
// Required credit — see NOTICE / AGENTS.md: keep the author name and course link when modifying or redistributing.
// M85: a small card in the bottom-right corner (above the timeline, clear of the top bar's "Xuất"), not a centred dialog:
// it slides in, closes by itself after 3 s (the count pauses while the pointer or keyboard focus is on it), never blocks
// the editor and never takes focus. Close button, or Esc while focus is inside. The chip reopens it (then it stays until
// closed). Element id stays `author`: 02_onboarding.js waits for #author to be gone before opening the first-run guide.
'use strict';
(() => {
  const AUTHOR = 'Nguyễn Tất Kiểm', COURSE = 'https://nguyentatkiem.com.vn/aiplusntk/', SITE = 'https://taki.vn';
  const SHOW_MS = 3000;
  const css = document.createElement('style');
  css.textContent = `
  #author { position: fixed; right: var(--space-4); bottom: calc(var(--tlh, 300px) + var(--space-4)); z-index: 40; width: min(320px, calc(100vw - 2 * var(--space-4)));
    display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3) var(--space-4) var(--space-3);
    background: rgb(var(--color-surface-raised)); color: rgb(var(--color-fg)); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-card);
    box-shadow: var(--shadow-raised); overflow: hidden; animation: au-in var(--duration-slow) var(--ease-standard); }
  #author.out { opacity: 0; transform: translateX(var(--space-6)); transition: opacity var(--duration-base) var(--ease-standard), transform var(--duration-base) var(--ease-standard); }
  @keyframes au-in { from { opacity: 0; transform: translateX(var(--space-8)); } }
  #author .au-head { display: flex; align-items: center; gap: var(--space-3); padding-right: var(--space-6); }
  #author .mk { flex: none; width: var(--h-md); height: var(--h-md); border-radius: var(--radius-control); position: relative; box-shadow: var(--shadow-accent);
    background: conic-gradient(from 210deg, rgb(var(--navy-400)), rgb(var(--color-audio)), rgb(var(--navy-400))); }
  #author .mk i { position: absolute; background: rgb(var(--color-canvas)); border-radius: 2px; }
  #author .mk i:nth-child(1) { left: 8px; top: 8px; width: 4px; height: 16px; } #author .mk i:nth-child(2) { left: 14px; top: 12px; width: 4px; height: 12px; } #author .mk i:nth-child(3) { left: 20px; top: 10px; width: 4px; height: 14px; }
  #author .au-t { margin: 0; font-size: var(--text-sm); font-weight: 700; }
  #author .by { margin: 0; color: rgb(var(--color-fg-muted)); font-size: var(--text-xs); }
  #author .by b { color: rgb(var(--color-fg)); }
  #author .au-x { position: absolute; top: var(--space-2); right: var(--space-2); }
  #author .gift { height: var(--h-md); font-size: var(--text-xs); text-decoration: none; }
  #author .au-site { align-self: center; color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); text-decoration: none; }
  #author .au-site:hover { color: rgb(var(--color-accent-text)); }
  #author .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: rgb(var(--color-line)); }
  #author .bar i { display: block; height: 100%; background: rgb(var(--color-accent-text)); transform-origin: left; animation: au-t ${SHOW_MS}ms linear forwards; }
  #author:hover .bar i, #author:focus-within .bar i { animation-play-state: paused; }
  @keyframes au-t { to { transform: scaleX(0); } }
  .au-chip { margin-left: var(--space-1); }
  .au-chip .ti { font-size: 12px; vertical-align: -2px; }`;
  document.head.appendChild(css);

  function show(auto = true) {
    const old = document.getElementById('author');
    if (old?.classList.contains('out')) old.remove(); // chip pressed while the card fades out: open a fresh one
    else if (old) { if (!auto) { old.stay?.(); old.querySelector('.bar')?.remove(); } return; } // chip while the card is up: keep it open
    const el = document.createElement('aside');
    el.id = 'author';
    el.setAttribute('aria-label', 'Giới thiệu tác giả');
    el.innerHTML = `<div class="au-head"><span class="mk" aria-hidden="true"><i></i><i></i><i></i></span>
        <div><p class="au-t">AI Video Studio</p><p class="by">Phần mềm của tác giả <b>${AUTHOR}</b></p></div></div>
      <a class="gift ui-btn ui-btn--primary ui-btn--block" href="${COURSE}" target="_blank" rel="noopener"><i class="ti ti-gift"></i> Tặng khoá học AI miễn phí</a>
      <a class="au-site" href="${SITE}" target="_blank" rel="noopener">taki.vn</a>
      <button class="au-x ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" data-close title="Đóng" aria-label="Đóng giới thiệu tác giả"><i class="ti ti-x"></i></button>
      ${auto ? '<div class="bar" aria-hidden="true"><i></i></div>' : ''}`;
    const close = () => { if (!el.isConnected || el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 200); };
    el.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    // Timer in JS (a CSS animationend never fires while the page paints no frames, e.g. a background tab); the bar only shows it.
    // It pauses while the pointer or keyboard focus is on the card and resumes with the time that was left.
    if (auto) {
      let left = SHOW_MS, since = 0, timer = 0;
      el.stay = () => { el.dataset.stay = '1'; pause(); };
      // Counting starts only while the page is visible (the browser may open the Studio in a background tab).
      const run = () => { if (timer || el.dataset.stay || document.hidden || el.matches(':hover, :focus-within')) return; since = performance.now(); timer = setTimeout(close, left); };
      const pause = () => { if (!timer) return; clearTimeout(timer); timer = 0; left = Math.max(0, left - (performance.now() - since)); };
      el.addEventListener('mouseenter', pause); el.addEventListener('focusin', pause);
      el.addEventListener('mouseleave', () => setTimeout(run)); el.addEventListener('focusout', () => setTimeout(run));
      const vis = () => { if (!el.isConnected) return document.removeEventListener('visibilitychange', vis); if (document.hidden) pause(); else run(); };
      document.addEventListener('visibilitychange', vis);
      run();
    }
    document.body.appendChild(el);
  }
  // "Tác giả" chip beside the logo
  const logo = document.querySelector('.logo');
  if (logo) {
    const b = document.createElement('button');
    b.className = 'au-chip ui-chip'; b.title = `Tác giả: ${AUTHOR} · Tặng khoá học AI miễn phí`; b.innerHTML = '<i class="ti ti-user-heart"></i> Tác giả';
    b.onclick = () => show(false);
    logo.appendChild(b);
  }
  show(true);
  window.Studio && (Studio.showAuthor = () => show(false));
})();
