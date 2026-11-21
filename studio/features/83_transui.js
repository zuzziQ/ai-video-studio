// S29 M203: giao diện chuyển cảnh v2 — dùng chung cho panel Chuyển cảnh (library.js panelTrans, ô data-tr) và mục Chuyển cảnh
// của clip trong Thuộc tính (studio.js clipTabs, ô data-ctr):
//   Studio.transUI.grid(cur, attr, q)  → tab theo nhóm của registry (FX.GROUPS.trans) + ô "Không" + lưới loại (lọc theo q)
//   Studio.transUI.insp(c)             → inspector chỗ nối: lưới, thời lượng 0.1–3 s, nhịp (5 preset), tham số riêng của loại
//                                         (hướng / màu / cường độ, đọc từ params của mục), Áp cho tất cả giữ nguyên tham số
// Dữ liệu: clip.transition = { type, dur, params?: { ease, dir, color, intensity } } — chỉ lưu giá trị khác mặc định.
// Ô lưới: rê chuột thì hình demo chạy bằng chính fn của registry (cùng tham số của chỗ nối đang chọn), không phải CSS chép tay;
// khung xem trước chính vẫn do 79_transpeek.js phát trên footage thật.
'use strict';
(() => {
  const S = window.Studio;
  if (!S || !window.FX) return;
  const { esc, sect, tip } = S;
  const r2 = v => Math.round(v * 100) / 100;
  const GROUPS = FX.GROUPS.trans;
  let group = '';                                  // '' = Tất cả
  const css = document.createElement('style');
  css.textContent = `
.trtabs { display: flex; flex-wrap: wrap; gap: var(--space-1); margin: var(--space-2) 0 0; }
.trtabs button { padding: var(--space-050) var(--space-2); border-radius: var(--radius-control); font-size: var(--text-2xs); border: 1px solid rgb(var(--color-line)); background: transparent; color: rgb(var(--color-fg-muted)); cursor: pointer; }
.trtabs button.on { background: rgb(var(--color-accent-soft) / .5); border-color: rgb(var(--color-accent-text)); color: rgb(var(--color-accent-text-strong)); }
.trtabs button span { opacity: .6; margin-left: 2px; }
.tr .demo.live i.a, .tr .demo.live i.b { animation: none !important; opacity: 1; }
.tr .demo.live .ic { opacity: 0; }
.tr .demo i.o { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
.tr .demo i.o .full { position: absolute; inset: 0; }
.trp .seg { display: flex; flex-wrap: wrap; gap: var(--space-1); margin: var(--space-1) 0 var(--space-2); }
.trp .seg button { flex: 1 1 auto; min-width: 0; padding: var(--space-050) var(--space-1); font-size: var(--text-2xs); }
.trp .seg button.on { background: rgb(var(--color-accent-soft) / .5); border-color: rgb(var(--color-accent-text)); }
.trempty { padding: var(--space-3) 0; color: rgb(var(--color-fg-subtle)); font-size: var(--text-xs); }`;
  document.head.appendChild(css);

  const norm = s => String(s || '').toLocaleLowerCase('vi').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  const match = (x, q) => !q || norm(`${x.id} ${x.label} ${x.ai.mood} ${x.ai.khi_nao}`).includes(norm(q));
  const cell = (x, on, attr) => `<button class="tr ${on ? 'on' : ''}" data-${attr}="${x.id}" ${attr === 'tr' ? 'draggable="true"' : ''} title="${esc(x.ai.khi_nao)}"><span class="demo t-${x.id}"><i class="a"></i><i class="b"></i><i class="o"></i><i class="ti ${x.icon} ic"></i></span><small>${esc(x.label)}</small></button>`;
  function grid(cur, attr = 'tr', q = '') {
    const all = FX.TRANS.filter(x => match(x, q)), list = all.filter(x => !group || x.group === group);
    const n = g => all.filter(x => x.group === g).length;
    const tabs = `<div class="trtabs" role="tablist">${[['', 'Tất cả'], ...GROUPS].map(([g, l]) => `<button role="tab" aria-selected="${g === group}" class="${g === group ? 'on' : ''}" data-trg="${g}">${l}<span>${g ? n(g) : all.length}</span></button>`).join('')}</div>`;
    const none = `<button class="tr ${cur ? '' : 'on'}" data-${attr}=""><span class="demo none"><i class="ti ti-ban"></i></span><small>Không</small></button>`;
    return `${tabs}<div class="trgrid ${attr === 'ctr' ? 'sm' : ''}">${none}${list.map(x => cell(x, cur === x.id, attr)).join('')}</div>${list.length ? '' : `<div class="trempty">Không có loại nào khớp “${esc(q)}”.</div>`}`;
  }

  // ---------- inspector chỗ nối ----------
  const control = (n, s, v) => s.t === 'enum'
    ? `<span class="lbl">${esc(s.label || n)}</span><div class="seg">${s.values.map(x => `<button class="${x === v ? 'on' : ''}" data-trp="${n}" data-v="${x}">${esc(s.vl?.[x] || x)}</button>`).join('')}</div>`
    : `<div class="slrow"><span>${esc(s.label || n)}</span><input type="range" data-trpn="${n}" min="${s.min}" max="${s.max}" step=".05" value="${v}"><b>${r2(v)}${n === 'dur' ? 's' : '×'}</b></div>`;
  function insp(c) {
    if (c.idx === 0) return sect('', `<div class="help">Clip đầu tiên không có chuyển cảnh vào. ${tip('Chọn clip phía sau, hoặc kéo hiệu ứng từ thư viện Chuyển cảnh thả vào chỗ nối giữa hai clip.')}</div>`);
    const tr = c.obj.transition, d = tr && FX.get('trans', tr.type);
    let body = grid(tr?.type || '', 'ctr');
    if (tr) {
      const P = d?.params || { dur: FX.TRANS[0].params.dur }, v = FX.params('trans', tr.type, tr.params);
      body += `<div class="trp">${control('dur', P.dur, tr.dur ?? P.dur.def)}${Object.entries(P).filter(([n]) => n !== 'dur').map(([n, s]) => control(n, s, v[n])).join('')}</div>
        <div class="help">${esc(d?.ai.khi_nao || '')}. ${tip('Rê chuột lên một ô để xem thử trên khung với tham số đang đặt. Nhịp "Mặc định" giữ đường cong riêng của từng loại.')}</div>
        <div class="acts"><button data-trpall><i class="ti ti-copy-check"></i> Áp cho tất cả chỗ nối</button></div>`;
    }
    return `<div id="trinsp">${sect('Chuyển cảnh vào clip này', body, 'ti-transition-right')}</div>`;
  }

  // tham số chỉ giữ giá trị khác mặc định của loại; đổi loại thì giữ phần loại mới cũng có (ease luôn có)
  function cleanParams(type, p) {
    const d = FX.get('trans', type); if (!d || !p) return undefined;
    const v = FX.params('trans', type, p), out = {};
    for (const [n, s] of Object.entries(d.params)) if (n !== 'dur' && p[n] != null && v[n] !== s.def) out[n] = v[n];
    return Object.keys(out).length ? out : undefined;
  }
  function setParam(tr, n, val) {
    if (n === 'dur') { tr.dur = r2(Math.min(3, Math.max(.1, +val))); return; }
    const p = cleanParams(tr.type, { ...(tr.params || {}), [n]: val });
    if (p) tr.params = p; else delete tr.params;
  }
  const curClip = () => (S.sel?.kind === 'clip' && S.sel.idx > 0 ? S.sel : null);
  document.addEventListener('click', e => {
    let b;
    if ((b = e.target.closest('[data-trg]'))) {
      group = b.dataset.trg;
      if (b.closest('#trinsp')) S.renderInspector(); else S.renderPanel();
      return;
    }
    if (!e.target.closest('#trinsp')) return;
    const c = curClip(), tr = c?.obj.transition; if (!tr) return;
    if ((b = e.target.closest('[data-trp]'))) { S.transPeek?.stop(false); S.pushUndo(); setParam(tr, b.dataset.trp, b.dataset.v); S.changed(true); return S.renderInspector(); }
    if (e.target.closest('[data-trpall]')) {
      S.pushUndo(); let n = 0;
      (S.TL.clips || []).forEach((o, i) => { if (i && o !== c.obj) { o.transition = JSON.parse(JSON.stringify(tr)); n++; } });
      S.changed(true); S.toast(`Đã áp “${FX.get('trans', tr.type)?.label || tr.type}” (giữ tham số) cho ${n} chỗ nối khác`);
    }
  });
  document.addEventListener('input', e => {
    const r = e.target.closest('#trinsp [data-trpn]'); if (!r) return;
    const tr = curClip()?.obj.transition; if (!tr) return;
    S.pushUndo('trp' + r.dataset.trpn); setParam(tr, r.dataset.trpn, +r.value);
    r.nextElementSibling.textContent = r2(+r.value) + (r.dataset.trpn === 'dur' ? 's' : '×'); S.changed();
  });

  // ---------- demo ô: chạy fn của registry ----------
  let live = null; // { demo, raf }
  function demoStart(btn) {
    const id = btn.dataset.tr ?? btn.dataset.ctr, d = id && FX.get('trans', id), demo = btn.querySelector('.demo');
    if (!d || !demo || live?.demo === demo) return;
    demoStop();
    const tr = S.sel?.kind === 'clip' ? S.sel.obj.transition : null, p = tr?.type === id ? tr.params : { ease: tr?.params?.ease };
    const a = demo.querySelector('i.a'), bb = demo.querySelector('i.b'), o = demo.querySelector('i.o'), t0 = performance.now();
    demo.classList.add('live');
    const tick = () => {
      const ph = ((performance.now() - t0) % 1400) / 1400, k = FX.ease(p?.ease, Math.min(1, Math.max(0, (ph - .15) / .45)));
      const [inS, outS] = d.fn(k, p);
      bb.style.cssText = inS; a.style.cssText = outS;
      if (o) o.innerHTML = k > 0 && k < 1 ? FX.transOverlay(id, k, p) : '';
      live.raf = requestAnimationFrame(tick);
    };
    live = { demo, raf: 0 }; tick();
  }
  function demoStop() {
    if (!live) return;
    cancelAnimationFrame(live.raf);
    const { demo } = live; live = null;
    demo.classList.remove('live');
    for (const i of demo.querySelectorAll('i.a, i.b')) i.style.cssText = '';
    const o = demo.querySelector('i.o'); if (o) o.innerHTML = '';
  }
  const SEL = '.tr[data-tr], .tr[data-ctr]';
  document.addEventListener('mouseover', e => { const b = e.target.closest?.(SEL); if (b) demoStart(b); });
  document.addEventListener('mouseout', e => { const b = e.target.closest?.(SEL); if (b && !b.contains(e.relatedTarget)) demoStop(); });

  S.transUI = { grid, insp, cleanParams, get group() { return group; } };
})();
