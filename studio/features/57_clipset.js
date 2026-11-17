// S18 M128: "Cùng bộ" — mở một clip cắt từ video dài vẫn thấy cả bộ trên thanh trên: ‹ › sang clip trước / sau, bấm nút giữa
// mở danh sách (ảnh bìa, tiêu đề, điểm, đã xuất), bấm clip = lưu dự án đang sửa rồi chuyển. "Xuất cả bộ" chạy job xuất của Cắt clip.
// Server: studio/routes/57_clipset.mjs. Kiểu panel Project / bin của phần mềm dựng: các clip cùng nguồn đi cùng nhau.
'use strict';
(() => {
  const S = Studio, { esc, toast } = S;
  const api = (u, b) => S.api(u, b).catch(e => ({ error: e.message }));
  const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  let SET = null, pop = null, moving = false;

  const css = document.createElement('style');
  css.textContent = `
  .cset { display: inline-flex; align-items: center; gap: 2px; flex: none; border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); background: rgb(var(--color-surface-raised)); }
  .cset[hidden] { display: none; }
  .cset button { background: none; border: 0; padding: 4px 6px; font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); display: inline-flex; align-items: center; gap: var(--space-1); white-space: nowrap; }
  .cset button:hover:not(:disabled) { color: rgb(var(--color-fg)); background: rgb(var(--color-surface-hover)); }
  .cset button:disabled { opacity: .35; }
  .cset .mid b { color: rgb(var(--color-fg)); font-weight: 600; }
  @media (max-width: 1200px) { .cset .mid .lb { display: none; } .cset button { padding: 4px; } } /* thanh trên chật: nhường chỗ cho tên dự án */
  .cset-pop { position: fixed; z-index: 60; width: min(380px, calc(100vw - 32px)); max-height: min(70vh, 560px); overflow: auto; padding: var(--space-2);
    background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-control); box-shadow: var(--shadow-raised); }
  .cset-pop h4 { margin: 0 0 var(--space-1); font-size: var(--text-xs); display: flex; gap: var(--space-2); align-items: center; }
  .cset-pop .src { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); margin-bottom: var(--space-2); overflow-wrap: anywhere; }
  .cset-it { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: var(--space-2); align-items: center; width: 100%; text-align: left; padding: var(--space-1);
    border: 1px solid transparent; border-radius: var(--radius-control); background: none; color: inherit; }
  .cset-it:hover:not(:disabled) { background: rgb(var(--color-surface-hover)); }
  .cset-it.on { border-color: rgb(var(--color-accent) / .7); background: rgb(var(--color-accent-soft) / .14); }
  .cset-it:disabled:not(.on) { opacity: .5; }
  .cset-it img, .cset-it .ph { width: 40px; height: 56px; object-fit: cover; border-radius: var(--radius-control); background: rgb(var(--color-surface-hover)); display: block; }
  .cset-it .tt { font-size: var(--text-xs); font-weight: 600; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .cset-it .mt { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: 2px; }
  .cset-it .sc { font-size: var(--text-2xs); font-weight: 700; padding: 1px var(--space-2); border-radius: var(--radius-pill); background: rgb(var(--color-accent-soft) / .24); color: rgb(var(--color-accent-text-strong)); }
  .cset-it .ok { color: rgb(var(--color-success)); }
  .cset-acts { display: flex; gap: var(--space-2); margin-top: var(--space-2); } .cset-acts button { flex: 1; justify-content: center; font-size: var(--text-xs); }`;
  document.head.appendChild(css);

  const bar = document.createElement('div');
  bar.className = 'cset'; bar.hidden = true; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Các clip cùng bộ');
  bar.innerHTML = `<button data-c="prev" title="Clip trước trong bộ"><i class="ti ti-chevron-left"></i></button>
    <button class="mid" data-c="list" aria-haspopup="dialog"><i class="ti ti-stack-2"></i><span></span><i class="ti ti-chevron-down"></i></button>
    <button data-c="next" title="Clip sau trong bộ"><i class="ti ti-chevron-right"></i></button>`;
  document.querySelector('#top .proj')?.after(bar);

  function paint() {
    if (!SET) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.querySelector('.mid span').innerHTML = `<span class="lb">Cùng bộ </span><b>${SET.cur + 1}/${SET.n}</b>`;
    bar.querySelector('.mid').title = `${SET.n} clip cắt từ “${SET.name}” — bấm để xem cả bộ`;
    bar.querySelector('[data-c=prev]').disabled = !step(-1);
    bar.querySelector('[data-c=next]').disabled = !step(1);
  }
  // clip kế tiếp còn thư mục (bỏ qua clip đã xoá)
  const step = d => { if (!SET) return null; for (let i = SET.cur + d; i >= 0 && i < SET.n; i += d) if (SET.items[i].exists) return SET.items[i]; return null; };

  async function refresh() {
    const r = await api('/api/clipset');
    SET = r?.set || null; paint();
    if (pop) drawPop();
  }

  async function go(it) {
    if (!it || it.current || moving) return;
    moving = true;
    try {
      if (S.TL && S.dirty) { await S.saveNow(); if (S.dirty) return toast('Chưa lưu được clip đang sửa — chưa chuyển'); }
      const r = await api('/api/clipset/open', { i: it.i });
      if (!r.ok) return toast(r.error || 'Không mở được clip');
      location.reload();
    } finally { moving = false; }
  }

  function drawPop() {
    pop.innerHTML = `<h4><i class="ti ti-stack-2"></i> ${SET.n} clip cùng bộ</h4>
      <div class="src">Cắt từ: ${esc(SET.source || SET.name)}</div>
      ${SET.items.map(it => `<button class="cset-it ${it.current ? 'on' : ''}" data-i="${it.i}" ${it.current || !it.exists ? 'disabled' : ''}>
        ${it.thumbUrl ? `<img src="${esc(it.thumbUrl)}" alt="" loading="lazy">` : '<span class="ph"></span>'}
        <span><span class="tt">${esc(it.title)}</span><span class="mt"><span>${mmss(it.dur)}</span>${it.current ? '<span>đang mở</span>' : ''}${!it.exists ? '<span>đã xoá</span>' : ''}${it.exported ? '<span class="ok"><i class="ti ti-check"></i> đã xuất</span>' : ''}</span></span>
        ${it.score != null ? `<span class="sc" title="Điểm Claude chấm khi cắt">${it.score}</span>` : '<span></span>'}</button>`).join('')}
      <div class="cset-acts"><button id="cset-exp"><i class="ti ti-upload"></i> Xuất cả bộ</button><button id="cset-lf"><i class="ti ti-scissors"></i> Mở ở Cắt clip</button></div>`;
    pop.querySelectorAll('[data-i]').forEach(b => b.onclick = () => go(SET.items[+b.dataset.i]));
    pop.querySelector('#cset-exp').onclick = exportAll;
    pop.querySelector('#cset-lf').onclick = () => { const d = SET.dir; close(); document.querySelector('#rail [data-p=longform]')?.click(); window.dispatchEvent(new CustomEvent('lf:run', { detail: d })); };
  }
  function open() {
    if (pop) return close();
    pop = document.createElement('div'); pop.className = 'cset-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Các clip cùng bộ');
    const r = bar.getBoundingClientRect();
    pop.style.top = `${r.bottom + 6}px`; pop.style.left = `${Math.max(16, Math.min(r.left, innerWidth - 396))}px`;
    document.body.appendChild(pop); drawPop();
    setTimeout(() => document.addEventListener('pointerdown', outside, true));
    document.addEventListener('keydown', esc_, true);
  }
  function close() {
    pop?.remove(); pop = null;
    document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc_, true);
  }
  const outside = e => { if (!pop?.contains(e.target) && !bar.contains(e.target)) close(); };
  const esc_ = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };

  async function exportAll() {
    if (S.TL && S.dirty) { await S.saveNow(); if (S.dirty) return toast('Chưa lưu được clip đang sửa'); }
    const r = await api('/api/longform/export', { dir: SET.dir });
    if (!r.ok) return toast(r.error || 'Không xuất được');
    close();
    S.modal(`<h3><i class="ti ti-loader-2 spin"></i> Đang xuất ${SET.n} clip…</h3><div id="jobstep" class="muted"></div><div class="bar"><i></i></div>`);
    S.pollJob(j => {
      if (j.state === 'done') { S.closeModal(); toast(`Đã xuất ${j.out?.outputs?.length || 0} clip`); refresh(); }
      else S.modal(`<h3>Xuất chưa xong</h3><p>${esc(j.step || '')}</p><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
    });
  }

  bar.addEventListener('click', e => {
    const c = e.target.closest('[data-c]')?.dataset.c;
    if (c === 'list') open(); else if (c === 'prev') go(step(-1)); else if (c === 'next') go(step(1));
  });
  S.clipset = { refresh, get set() { return SET; } };
  // feature nạp trong boot, trước khi có META: đợi dự án nạp xong (không mở dự án nào thì thôi)
  const wait = setInterval(() => { if (S.META) { clearInterval(wait); refresh(); } }, 200);
  setTimeout(() => clearInterval(wait), 30000);
})();
