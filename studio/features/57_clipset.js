// S18 M128: "Cùng bộ" — các clip cắt từ cùng một video dài. S18 M129: không còn nút riêng trên thanh trên; các tab cùng bộ là một
// nhóm trên thanh tab (58_tabs.js), nhãn nhóm có ‹ › (clip trước / sau) và mở danh sách cả bộ ở đây (ảnh bìa, tiêu đề, điểm, đã
// xuất, cả clip chưa mở). Bấm clip = lưu dự án đang sửa rồi chuyển, thay tab đang xem tại chỗ; Ctrl/⌘ + bấm = cửa sổ mới.
// "Xuất cả bộ" chạy job xuất của Cắt clip. Server: studio/routes/57_clipset.mjs. Kiểu bin của phần mềm dựng.
// S19 M135: "Áp cho các clip còn lại" — lưu clip đang sửa, xem trước (clip nào, đổi gì, bao nhiêu chỗ), chọn clip rồi áp; clip đang mở
// ở tab khác (khoá Web Locks M131 của trang này thấy qua navigator.locks.query) hoặc đang chạy tác vụ thì server bỏ qua và báo.
'use strict';
(() => {
  const S = Studio, { esc, toast } = S;
  const api = (u, b) => S.api(u, b).catch(e => ({ error: e.message }));
  const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  let SET = null, pop = null, moving = false;

  const css = document.createElement('style');
  css.textContent = `
  .cset-pop { position: fixed; z-index: 60; width: min(380px, calc(100vw - 32px)); max-height: min(70vh, 560px); overflow: auto; padding: var(--space-2);
    background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-control); box-shadow: var(--shadow-raised); }
  .cset-pop h4 { margin: 0 0 var(--space-1); font-size: var(--text-xs); display: flex; gap: var(--space-2); align-items: center; }
  .cset-pop .src { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); margin-bottom: var(--space-2); overflow-wrap: anywhere; }
  .cset-it { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: var(--space-2); align-items: center; width: 100%; text-align: left; padding: var(--space-1);
    border: 1px solid transparent; border-radius: var(--radius-control); background: none; color: inherit; }
  .cset-it:hover:not(:disabled) { background: rgb(var(--color-surface-hover)); }
  .cset-it[aria-current] { border-color: rgb(var(--color-accent) / .7); background: rgb(var(--color-accent-soft) / .14); }
  .cset-it:disabled { opacity: .5; }
  .cset-it img, .cset-it .ph { width: 40px; height: 56px; object-fit: cover; border-radius: var(--radius-control); background: rgb(var(--color-surface-hover)); display: block; }
  .cset-it .tt { font-size: var(--text-xs); font-weight: 600; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .cset-it .mt { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: 2px; }
  .cset-it .sc { font-size: var(--text-2xs); font-weight: 700; padding: 1px var(--space-2); border-radius: var(--radius-pill); background: rgb(var(--color-accent-soft) / .24); color: rgb(var(--color-accent-text-strong)); }
  .cset-it .ok { color: rgb(var(--color-success)); }
  .cset-acts { display: flex; gap: var(--space-2); margin-top: var(--space-2); flex-wrap: wrap; } .cset-acts button { flex: 1; justify-content: center; font-size: var(--text-xs); }
  .cset-acts .wide { flex-basis: 100%; }
  .capl-ops { margin: var(--space-2) 0; padding-left: var(--space-5); font-size: var(--text-sm); } .capl-ops li { margin: 2px 0; }
  .capl-note { font-size: var(--text-xs); color: rgb(var(--color-fg-subtle)); margin: var(--space-1) 0; }
  .capl-list { display: grid; gap: var(--space-1); max-height: 40vh; overflow: auto; margin-top: var(--space-2); }
  .capl-row { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-2); align-items: start; padding: var(--space-2); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); font-size: var(--text-xs); }
  .capl-row b { display: block; font-size: var(--text-sm); overflow-wrap: anywhere; } .capl-row .w { color: rgb(var(--color-fg-subtle)); }
  .capl-row.off { opacity: .6; } .capl-row .sk { color: rgb(var(--color-warning)); }`;
  document.head.appendChild(css);

  let anchor = null; // nhãn nhóm trên thanh tab đã mở danh sách
  const paint = () => S.tabs?.paint?.(); // nhãn nhóm (n/N, ‹ ›) do thanh tab vẽ

  // clip kế tiếp còn thư mục (bỏ qua clip đã xoá)
  const step = d => { if (!SET) return null; for (let i = SET.cur + d; i >= 0 && i < SET.n; i += d) if (SET.items[i].exists) return SET.items[i]; return null; };

  async function refresh() {
    const r = await api('/api/clipset');
    SET = r?.set || null; paint();
    if (pop) drawPop();
  }

  async function go(it, newWin) {
    if (!it || moving || (it.current && !newWin)) return;
    if (newWin) { // cửa sổ mới: trang này giữ nguyên clip đang sửa
      const r = await api('/api/clipset/open', { i: it.i, keep: true });
      if (!r.ok) return toast(r.error || 'Không mở được clip');
      return void window.open(window.avsProject.url(r.id), '_blank', 'noopener');
    }
    moving = true;
    try {
      if (S.TL && S.dirty) { await S.saveNow(); if (S.dirty) return toast('Chưa lưu được clip đang sửa — chưa chuyển'); }
      S.saveTabUI?.();
      const r = await api('/api/clipset/open', { i: it.i });
      if (!r.ok) return toast(r.error || 'Không mở được clip');
      location.reload();
    } finally { moving = false; }
  }

  function drawPop() {
    pop.innerHTML = `<h4><i class="ti ti-stack-2"></i> ${SET.n} clip cùng bộ</h4>
      <div class="src">Cắt từ: ${esc(SET.source || SET.name)}</div>
      ${SET.items.map(it => `<button class="cset-it" data-i="${it.i}" ${!it.exists ? 'disabled' : ''} ${it.current ? 'aria-current="true"' : ''} title="${it.current ? 'Đang mở' : 'Bấm: mở thay clip đang xem · Ctrl/⌘ + bấm: cửa sổ mới'}">
        ${it.thumbUrl ? `<img src="${esc(it.thumbUrl)}" alt="" loading="lazy">` : '<span class="ph"></span>'}
        <span><span class="tt">${esc(it.title)}</span><span class="mt"><span>${mmss(it.dur)}</span>${it.current ? '<span>đang mở</span>' : ''}${!it.exists ? '<span>đã xoá</span>' : ''}${it.exported ? '<span class="ok"><i class="ti ti-check"></i> đã xuất</span>' : ''}</span></span>
        ${it.score != null ? `<span class="sc" title="Điểm Claude chấm khi cắt">${it.score}</span>` : '<span></span>'}</button>`).join('')}
      <div class="cset-acts"><button id="cset-apply" class="wide primary" title="Đem các thay đổi của clip này (xoá emoji / chữ / ảnh tự động, kiểu phụ đề, gói, nhạc, sửa chữ phụ đề) sang các clip khác của bộ — xem trước rồi mới áp"><i class="ti ti-copy-check"></i> Áp cho các clip còn lại</button><button id="cset-exp"><i class="ti ti-upload"></i> Xuất cả bộ</button><button id="cset-lf"><i class="ti ti-scissors"></i> Mở ở Cắt clip</button></div>`;
    pop.querySelectorAll('[data-i]').forEach(b => b.onclick = e => go(SET.items[+b.dataset.i], e.ctrlKey || e.metaKey));
    pop.querySelector('#cset-exp').onclick = exportAll;
    pop.querySelector('#cset-apply').onclick = applyAll;
    pop.querySelector('#cset-lf').onclick = () => { const d = SET.dir; close(); document.querySelector('#rail [data-p=longform]')?.click(); window.dispatchEvent(new CustomEvent('lf:run', { detail: d })); };
  }
  function open(el) {
    if (pop) return close();
    if (!SET || !el) return;
    anchor = el;
    pop = document.createElement('div'); pop.className = 'cset-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Các clip cùng bộ');
    const r = el.getBoundingClientRect();
    pop.style.top = `${r.bottom + 6}px`; pop.style.left = `${Math.max(16, Math.min(r.left, innerWidth - 396))}px`;
    document.body.appendChild(pop); drawPop();
    setTimeout(() => document.addEventListener('pointerdown', outside, true));
    document.addEventListener('keydown', esc_, true);
  }
  function close() {
    pop?.remove(); pop = null;
    document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc_, true);
  }
  const outside = e => { if (!pop?.contains(e.target) && !anchor?.contains(e.target)) close(); };
  const esc_ = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };

  async function exportAll() {
    if (S.TL && S.dirty) { await S.saveNow(); if (S.dirty) return toast('Chưa lưu được clip đang sửa'); }
    close();
    // S26 M186: chạy nền trong khay việc (không khoá: xuất đọc bản đã lưu của từng clip)
    S.jobs.start('/api/longform/export', { dir: SET.dir }, { kind: 'longform-export', title: `Xuất ${SET.n} clip cùng bộ`,
      onDone: j => { refresh(); return { text: `Đã xuất ${j.out?.outputs?.length || 0} clip` }; } });
  }

  // ---------- S19 M135: áp cho các clip còn lại ----------
  // mã các dự án đang giữ khoá ở tab / cửa sổ khác của trình duyệt này (M131: 'avs-project:<mã>')
  async function heldIds() {
    try { const q = await navigator.locks?.query?.(); return [...new Set((q?.held || []).map(l => /^avs-project:([a-f0-9]{12})$/.exec(l.name || '')?.[1]).filter(Boolean))]; } catch { return []; }
  }
  const FROM = { autopilot: 'bản Tự lái giao', set_base: 'bản lúc cắt clip', history: 'bản lưu đầu tiên trong Lịch sử' };
  async function applyAll() {
    if (S.TL && S.dirty) { await S.saveNow(); if (S.dirty) return toast('Chưa lưu được clip đang sửa'); }
    close();
    S.modal('<h3><i class="ti ti-loader-2 spin"></i> Đang so clip này với bản gốc…</h3>');
    const held = await heldIds();
    const r = await api('/api/clipset/apply', { held });
    if (!r.ok) { S.closeModal(); return toast(r.error || 'Không xem trước được'); }
    const can = r.clips.filter(c => !c.skip && c.n > 0);
    const notes = (r.notes || []).map(n => `<p class="capl-note"><i class="ti ti-info-circle"></i> ${esc(n)}</p>`).join('');
    if (!r.ops.length) {
      return S.modal(`<h3><i class="ti ti-copy-check"></i> Chưa có gì để áp</h3><p>Clip này chưa có thay đổi nào áp được cho clip khác (so với ${esc(FROM[r.from] || 'bản gốc')}).</p>${notes}
        <p class="muted">Áp được: xoá hết emoji / chữ nổi / ảnh tự động, đổi kiểu phụ đề hoặc gói, tắt hay chỉnh dB nhạc nền, sửa chữ phụ đề.</p><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
    }
    S.modal(`<h3><i class="ti ti-copy-check"></i> Áp cho các clip còn lại</h3>
      <p class="muted">So clip đang mở với ${esc(FROM[r.from] || 'bản gốc')}. Thay đổi sẽ áp:</p>
      <ul class="capl-ops">${r.ops.map(o => `<li>${esc(o.label)}</li>`).join('')}</ul>${notes}
      <div class="capl-list">${r.clips.map(c => { const ok = !c.skip && c.n > 0; return `<label class="capl-row ${ok ? '' : 'off'}">
        <input type="checkbox" data-ci="${c.i}" ${ok ? 'checked' : 'disabled'}>
        <span><b>${c.i + 1}. ${esc(c.title)}</b>${c.skip ? `<span class="sk"><i class="ti ti-lock"></i> Bỏ qua: ${esc(c.skip)}</span>` : c.n ? `<span class="w">${c.what.map(w => `${esc(w.label)} (${w.n} chỗ)`).join(' · ')}</span>` : '<span class="w">Đã giống clip này — không đổi gì</span>'}</span></label>`; }).join('')}</div>
      <p class="capl-note">Mỗi clip được áp có bản cũ trong Lịch sử để mở lại.</p>
      <div class="actions"><button onclick="closeModal()">Huỷ</button><button id="capl-go" class="primary" ${can.length ? '' : 'disabled'}><i class="ti ti-check"></i> Áp cho <span id="capl-n">${can.length}</span> clip</button></div>`);
    const box = document.getElementById('modalbox'), n = () => box.querySelectorAll('[data-ci]:checked').length;
    box.querySelectorAll('[data-ci]').forEach(c => c.onchange = () => { box.querySelector('#capl-n').textContent = n(); box.querySelector('#capl-go').disabled = !n(); });
    box.querySelector('#capl-go').onclick = async e => {
      const only = [...box.querySelectorAll('[data-ci]:checked')].map(c => +c.dataset.ci);
      e.currentTarget.disabled = true;
      const w = await api('/api/clipset/apply', { held: await heldIds(), only, apply: true });
      if (!w.ok) return toast(w.error || 'Chưa áp được');
      S.closeModal();
      const skipped = w.clips.filter(c => c.skip && only.includes(c.i));
      toast(`Đã áp cho ${w.applied} clip${skipped.length ? ` · bỏ qua ${skipped.length} clip (${skipped.map(c => c.skip).join(', ')})` : ''}`);
      refresh();
    };
  }

  S.clipset = { refresh, open, go, step, applyAll, get set() { return SET; } };
  // feature nạp trong boot, trước khi có META: đợi dự án nạp xong (không mở dự án nào thì thôi)
  const wait = setInterval(() => { if (S.META) { clearInterval(wait); refresh(); } }, 200);
  setTimeout(() => clearInterval(wait), 30000);
})();
