// S28 M206: track Hiệu ứng trên timeline (lõi 81_fxtrack.core.js, hiệu ứng ở engine/fx_registry.js nhóm fx).
// Khối của TL.fx (nhấn do AI / template ghi), TL.grade (màu) và TL.efx (khối mới) hiện trên một track, phủ mọi lớp bên dưới.
// Kéo dời / kéo mép, khoá, ẩn, xoá, nhân đôi, hoàn tác: dùng đường chung của studio.js (component có setTimes / remove / dup / tabs).
// Thuộc tính: loại, phạm vi (cả khung / video chính), ≤ 3 thanh, thời gian, "Xem thử ±1 s" phát lặp đoạn quanh khối.
// Thư viện Hiệu ứng: nhóm "Hiệu ứng khung hình" ở đầu panel; bấm = thêm tại playhead, kéo thả vào timeline (65_drop.js → libInsert).
// Rê chuột lên một ô: khung xem trước phát lặp 2 s tại playhead với hiệu ứng đó bằng TL TẠM (cơ chế xem thử của M202, 79_transpeek.js):
// không pushUndo, không markDirty; rời ô là Studio.redraw() dựng lại từ timeline thật.
'use strict';
(() => {
  const S = window.Studio, C = window.FxTrackCore, PC = window.TransPeekCore;
  if (!S || !C || !window.FX) return;
  const { $, esc, fmt } = S;
  KIND_IC.efx = 'ti-wand';
  TCOL.efx = 'rgb(var(--track-4))';
  const css = document.createElement('style');
  css.textContent = `
.efxg { margin-bottom: var(--space-3); } .efxg .sect { display: flex; align-items: center; gap: var(--space-2); }
.efxgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: var(--space-2); margin-top: var(--space-2); }
.efxgrid button { display: flex; flex-direction: column; align-items: center; gap: var(--space-1); padding: var(--space-2); min-width: 0; font-size: var(--text-2xs); white-space: normal; text-align: center; line-height: 1.25; }
.efxgrid button .ti { font-size: var(--text-lg); color: rgb(var(--color-accent-text)); }
#insp .efx-peek.on { background: rgb(var(--color-accent-soft) / .24); border-color: rgb(var(--color-accent-text) / .5); }`;
  document.head.appendChild(css);
  const r2 = v => Math.round(v * 100) / 100;

  // ---------- component ----------
  S._build.push(comps => {
    C.blocks(S.TL).forEach((b, i) => {
      b.obj.cid = 'fe' + i;
      comps.push({
        obj: b.obj, kind: 'efx', track: 'efx', t0: b.start, t1: b.end, label: b.label, icon: b.icon, tag: b.src === 'grade' ? 'Màu' : 'Hiệu ứng', blk: b,
        setTimes(t0, t1, moved) { C.setTimes(b.src, b.obj, t0, t1, moved); },
        remove() { const a = S.TL[b.src]; a.splice(a.indexOf(b.obj), 1); },
        dup(cp) { C.setTimes(b.src, cp, b.end, b.end + (b.end - b.start), true); S.TL[b.src].push(cp); },
        tabs,
      });
    });
  });

  // ---------- inspector ----------
  const opt = (list, v) => list.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const typeOpts = (legacy, v) => FX.GROUPS.fx.map(([g, gl]) => {
    const xs = FX.list('fx').filter(x => x.group === g && !!x.legacy === legacy);
    return xs.length ? `<optgroup label="${esc(gl)}">${opt(xs.map(x => [x.id, x.label]), v)}</optgroup>` : '';
  }).join('');
  const sl = (n, s, v) => `<div class="slrow"><span>${esc(s.label || n)}</span><input type="range" data-efx="${n}" min="${s.min}" max="${s.max}" step="${s.max - s.min > 5 ? 1 : .01}" value="${v}"><b>${r2(v)}</b></div>`;
  function tabs(c) {
    const b = c.blk, o = b.obj, d = FX.get('fx', b.type);
    let h = '';
    if (b.src === 'grade') h += `<span class="lbl">Màu</span><select data-efx="mode">${opt(Object.entries(C.GRADE_VI), o.mode)}</select>
      <div class="help">Khối màu do AI dựng / gói style đặt, chỉ áp cho video chính.</div>`;
    else {
      h += `<span class="lbl">Loại</span><select data-efx="type">${typeOpts(b.src === 'fx', b.type)}</select>`;
      if (b.src === 'efx') h += `<span class="lbl">Phủ lên</span><select data-efx="target">${opt([['all', 'Cả khung (mọi lớp bên dưới)'], ['main', 'Chỉ video chính']], b.target)}</select>`;
      for (const [n, s] of Object.entries(d?.params || {})) h += sl(n, s, b.params[n] ?? s.def);
      if (d?.ai) h += `<div class="help">Hợp khi ${esc(d.ai.khi_nao)}. Tránh: ${esc(d.ai.tranh)}.</div>`;
    }
    h += `<div class="row"><div><span class="lbl">Bắt đầu (s)</span><input type="number" data-efxt="start" step="0.01" value="${r2(b.start)}"></div>
      <div><span class="lbl">Kết thúc (s)</span><input type="number" data-efxt="end" step="0.01" value="${r2(b.end)}"></div></div>
      <div class="acts"><button class="efx-peek ${P?.real ? 'on' : ''}" data-efxpeek aria-pressed="${!!P?.real}"><i class="ti ti-player-play"></i> Xem thử ±1 s</button></div>`;
    return [['basic', 'Hiệu ứng', S.sect(esc(b.label), h, b.icon)]];
  }
  const cur = () => (S.sel?.kind === 'efx' ? S.sel : null);
  const lockedMsg = () => { S.toast('Khối đang khoá · ⌥⇧L để mở khoá'); return true; };
  document.addEventListener('input', e => {
    const el = e.target.closest?.('#insp [data-efx]'), c = cur();
    if (!el || !c || el.tagName === 'SELECT') return;
    if (c.obj.locked) return lockedMsg();
    S.touch(c.obj, 'efx' + el.dataset.efx);
    C.setParam(c.blk.src, c.obj, el.dataset.efx, el.value);
    const v = el.parentNode.querySelector('b'); if (v) v.textContent = r2(+el.value);
    S.changed();
  });
  document.addEventListener('change', e => {
    const c = cur(); if (!c) return;
    const sel = e.target.closest?.('#insp select[data-efx]'), tm = e.target.closest?.('#insp [data-efxt]');
    if (!sel && !tm) return;
    if (c.obj.locked) { S.renderInspector(); return lockedMsg(); }
    if (sel) { S.touch(c.obj); C.setParam(c.blk.src, c.obj, sel.dataset.efx, sel.value); return S.changed(true); }
    const b = c.blk, a = tm.dataset.efxt === 'start' ? +tm.value : b.start, z = tm.dataset.efxt === 'end' ? +tm.value : b.end;
    if (!Number.isFinite(a) || !Number.isFinite(z)) return;
    S.touch(c.obj); C.setTimes(b.src, c.obj, a, Math.max(a + .05, z), false); S.changed(true);
  });

  // ---------- xem thử (khối đang chọn: TL thật; ô thư viện: TL tạm) ----------
  let P = null, gen = 0, wait = 0;
  const can = () => !S.playing && !S.dragging && !S.review?.active && !S.transPeek?.active && S.win?.renderFrame;
  const frameT = (sp, ms) => (PC ? PC.frameT(sp, ms) : sp.a + ((ms / 1000) % Math.max(.01, sp.b - sp.a)));
  async function start(p) {
    if (P) stop(false);
    if (!can()) return;
    const my = ++gen; P = { ...p, t0: 0 };
    if (p.tl) { try { await S.win.init(S.previewTL(p.tl)); } catch (e) { console.error(e); } }
    if (my !== gen) return;
    P.t0 = performance.now();
    const loop = async () => {
      if (my !== gen) return;
      if (!can() || (P.real && S.sel?.obj !== P.real)) return stop();
      try { await S.win.renderFrame(frameT(P.sp, performance.now() - P.t0)); } catch (e) { console.error(e); }
      if (my === gen) setTimeout(loop, 16);
    };
    loop();
  }
  function stop(redraw = true) {
    clearTimeout(wait);
    if (!P) return;
    const real = P.real; P = null; gen++;
    if (redraw) S.redraw();
    if (real) document.querySelector('#insp [data-efxpeek]')?.classList.remove('on');
  }
  document.addEventListener('click', e => {
    if (!e.target.closest?.('#insp [data-efxpeek]')) return;
    const c = cur(); if (!c) return;
    if (P?.real === c.obj) return stop();
    const total = S.TL.duration || 0, a = Math.max(0, c.t0 - 1), b = Math.min(total, Math.max(c.t0 + 1, Math.min(c.t1 + 1, c.t0 + 4)));
    start({ real: c.obj, sp: { a, b } });
    e.target.closest('[data-efxpeek]').classList.add('on');
  });
  const ITEM = '[data-efxadd]';
  const peekItem = btn => {
    const total = S.TL?.duration || 0, a = Math.max(0, Math.min(S.T, total - 2));
    start({ btn, tl: C.peekTL(S.TL, { type: btn.dataset.efxadd, dur: 2 }, a), sp: { a, b: Math.min(total, a + 2) } });
  };
  document.addEventListener('mouseover', e => { const b = e.target.closest?.(ITEM); if (b && P?.btn !== b) { clearTimeout(wait); wait = setTimeout(() => peekItem(b), 150); } });
  document.addEventListener('mouseout', e => { const b = e.target.closest?.(ITEM); if (b && !(e.relatedTarget && b.contains(e.relatedTarget))) { clearTimeout(wait); if (P?.btn === b) stop(); } });

  // ---------- thêm khối ----------
  function add(type, t) {
    if (!FX.get('fx', type) || !S.TL) return;
    if (P) stop(false);
    try { S.pushUndo(); } catch { return; }
    const at = r2(Math.max(0, Math.min(t ?? S.T, (S.TL.duration || 0) - .2))), n0 = (S.TL.fx || []).length, e0 = (S.TL.efx || []).length;
    C.addApply(S.TL, { type, dur: C.legacy(type) ? undefined : 2 }, null, at);
    const obj = C.legacy(type) ? S.TL.fx[n0] : S.TL.efx[e0];
    S.changed(); S.select(S.compOf(obj)); S.toast(`Đã thêm “${FX.get('fx', type).label}” vào track Hiệu ứng`);
  }
  document.addEventListener('click', e => { const b = e.target.closest?.('#libbody ' + ITEM); if (b) { e.preventDefault(); add(b.dataset.efxadd); } });
  function panelHtml(q = '') {
    q = (q || '').toLowerCase();
    const groups = FX.GROUPS.fx.map(([g, gl]) => {
      const xs = FX.list('fx').filter(x => x.group === g && (!q || (x.label + ' ' + x.id).toLowerCase().includes(q)));
      return xs.length ? `<div class="efxg"><div class="sect">${esc(gl)} <span class="muted">${xs.length}</span></div><div class="efxgrid">${xs.map(x =>
        `<button data-efxadd="${x.id}" draggable="true" title="${esc(x.label)}: ${esc(x.ai?.khi_nao || '')} · bấm = thêm tại playhead, kéo vào timeline"><i class="ti ${x.icon}"></i>${esc(x.label)}</button>`).join('')}</div></div>` : '';
    }).join('');
    return groups ? `<div class="efx-panel"><div class="help">Hiệu ứng khung hình: phủ mọi lớp bên dưới, nằm trên track Hiệu ứng. Rê chuột để xem thử tại playhead.</div>${groups}</div>` : '';
  }
  S.fxtrack = { add, panelHtml, stop, get active() { return !!P; } };
  S._play.push(k => { if (k === 'tick' && P) stop(false); });
})();
