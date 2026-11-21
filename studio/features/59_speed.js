// S29 M207: tab Tốc độ trong Thuộc tính của clip: Đều / Đường cong (6 preset + editor điểm kéo), Freeze 3 s, Đảo ngược.
// Toán: engine/speed.js (SpeedMap, chung với engine nên xem trước = render); ripple: studio/clips.js (setClipCurve, setClipReverse,
// freezeAt, trimClip). Studio.speedTab(o, k, flatHtml) được studio.js gọi khi vẽ tab 'speed'; Studio.speed.apply cho thanh Hỏi Claude.
(() => {
  const S = Studio, { esc, sect, tip } = S, SM = SpeedMap;
  const W = 264, H = 120, PAD = 10;
  const px = x => PAD + x * (W - 2 * PAD);
  const vy = y => (Math.log10(y) - Math.log10(SM.MIN)) / (Math.log10(SM.MAX) - Math.log10(SM.MIN)); // 0,1× → 0, 10× → 1 (log)
  const py = y => H - PAD - vy(y) * (H - 2 * PAD);
  const fromPx = (X, Y) => ({ x: Math.min(1, Math.max(0, (X - PAD) / (W - 2 * PAD))),
    y: Math.min(SM.MAX, Math.max(SM.MIN, 10 ** (Math.log10(SM.MIN) + (1 - (Y - PAD) / (H - 2 * PAD)) * (Math.log10(SM.MAX) - Math.log10(SM.MIN))))) });
  const r2 = v => Math.round(v * 100) / 100;
  const sel = () => (S.sel?.kind === 'clip' ? S.sel : null);

  function svg(pts) {
    const line = Array.from({ length: 61 }, (_, i) => { const u = i / 60; return `${px(u).toFixed(1)},${py(SM.valueAt(pts, u)).toFixed(1)}`; }).join(' ');
    const grid = [[1, '1×'], [SM.MIN, '0,1×'], [SM.MAX, '10×'], [4, '4×']].map(([y, l]) =>
      `<line x1="${PAD}" x2="${W - PAD}" y1="${py(y)}" y2="${py(y)}" class="${y === 1 ? 'g1' : y === 4 ? 'g4' : 'g'}"/><text x="${W - PAD}" y="${py(y) - 2}">${l}</text>`).join('');
    const dots = pts.map((p, i) => `<circle data-spi="${i}" cx="${px(p.x).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="5"/>`).join('');
    return `<svg data-spcurve viewBox="0 0 ${W} ${H}">${grid}<polyline points="${line}"/>${dots}</svg>`;
  }
  function curveHtml(o, k) {
    const name = typeof o.speedCurve === 'string' ? o.speedCurve : '', pts = SM.norm(o.speedCurve) || SM.norm('montage');
    return sect('Đường cong tốc độ', `<div class="sppre">${Object.entries(SM.PRESET_VI).map(([id, l]) =>
      `<button data-sppre="${id}" class="${name === id ? 'on' : ''}">${svgMini(id)}<small>${l}</small></button>`).join('')}</div>
      <div class="spbox">${svg(pts)}</div>
      <div class="help">Kéo điểm để đổi tốc độ; bấm đúp vào nền để thêm điểm, bấm đúp vào điểm để xoá. ${tip('Trục ngang là clip gốc từ đầu đến cuối, trục dọc là tốc độ 0,1–10× (thang log). Đoạn nhanh hơn 4× bị tắt tiếng khi xem và khi xuất, như CapCut.')}</div>
      <div class="stat"><span>Thời lượng</span><b>${r2(k.t1 - k.t0)}s</b><span class="muted">gốc ${r2(SM.span(o))}s</span></div>`, 'ti-chart-bar');
  }
  function svgMini(id) {
    const p = SM.norm(id), w = 40, h = 18;
    const pts = Array.from({ length: 21 }, (_, i) => `${(i / 20 * w).toFixed(1)},${(h - 1 - vy(SM.valueAt(p, i / 20)) * (h - 2)).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}"><polyline points="${pts}"/></svg>`;
  }
  S.speedTab = (o, k, flatHtml) => {
    if (o.hold != null) return `<div id="sppanel">${sect('Đứng hình', `<div class="slrow"><span>Dài</span><input type="range" data-sphold min=".5" max="10" step=".1" value="${o.hold}"><b>${r2(o.hold)}s</b></div>
      <div class="help">Giữ nguyên khung ${r2(o.in || 0)}s của nguồn, im lặng. Kéo mép clip trên timeline cũng đổi được độ dài.</div>`, 'ti-snowflake')}</div>`;
    const curve = !!o.speedCurve, still = typeof o.src === 'string';
    return `<div id="sppanel"><div class="spmode"><button data-spmode="flat" class="${curve ? '' : 'on'}"><i class="ti ti-equal"></i> Đều</button>
      <button data-spmode="curve" class="${curve ? 'on' : ''}"><i class="ti ti-chart-bar"></i> Đường cong</button></div>
      ${curve ? curveHtml(o, k) : flatHtml}
      ${sect('Đứng hình và tua ngược', `<div class="acts"><button data-spact="freeze" ${still ? 'disabled' : ''}><i class="ti ti-snowflake"></i> Freeze 3 s tại playhead</button>
        <button data-spact="reverse" class="${o.reverse ? 'on' : ''}" ${still ? 'disabled' : ''}><i class="ti ti-arrow-back-up"></i> ${o.reverse ? 'Đang phát ngược' : 'Đảo ngược'}</button></div>
        <div class="help">${still ? 'Ảnh tĩnh không cần đứng hình hay đảo ngược.' : `Freeze chèn 3 s giữ khung tại playhead, phía sau tự dồn. ${tip('Freeze im lặng. Đảo ngược đọc khung từ cuối về đầu, không tạo file video mới; tiếng phát ngược khi xuất, lúc xem trước tắt tiếng.')}`}</div>`, 'ti-player-track-prev')}</div>`;
  };

  // Một việc cho thanh Hỏi Claude (75_ask.js, việc clip_speed): mode = preset | normal | freeze | reverse | forward; speed khi normal.
  function apply(i, p) {
    const c = S.TL?.clips?.[i]; if (!c) return false;
    switch (p.mode) {
      case 'normal': return (setClipSpeed(i, p.speed ?? 1), true);
      case 'freeze': { const L = clipLayout()[i], t = Math.min(Math.max(S.T, L.t0), L.t1 - .05); return !!freezeAt(t, p.dur ?? 3); }
      case 'reverse': return setClipReverse(i, true);
      case 'forward': return setClipReverse(i, false);
      default: return SM.PRESETS[p.mode] ? setClipCurve(i, p.mode) : false;
    }
  }
  S.speed = { apply };

  const run = (fn, key) => { const c = sel(); if (!c) return; S.pushUndo(key); if (fn(c.idx, c.obj) !== false) S.changed(true); };
  document.addEventListener('click', e => {
    if (!e.target.closest('#sppanel')) return;
    let b;
    if ((b = e.target.closest('[data-spmode]'))) return run((i, o) => (b.dataset.spmode === 'curve' ? !o.speedCurve && setClipCurve(i, 'montage') : !!o.speedCurve && setClipCurve(i, null)));
    if ((b = e.target.closest('[data-sppre]'))) return run(i => setClipCurve(i, b.dataset.sppre));
    if ((b = e.target.closest('[data-spact]'))) {
      if (b.dataset.spact === 'reverse') return run((i, o) => setClipReverse(i, !o.reverse));
      return run(i => { const fr = apply(i, { mode: 'freeze' }); if (!fr) S.toast('Không đứng hình được ở đây'); return fr; });
    }
  });
  document.addEventListener('input', e => {
    const r = e.target.closest('#sppanel [data-sphold]'); if (!r) return;
    const c = sel(); if (!c || c.obj.hold == null) return;
    S.pushUndo('sphold' + c.idx); trimClip(c.idx, 'r', +r.value - c.obj.hold);
    r.nextElementSibling.textContent = r2(+r.value) + 's'; S.changed();
  });
  // editor điểm: kéo (vẽ lại tại chỗ, ghi khi thả), bấm đúp nền = thêm, bấm đúp điểm = xoá
  let drag = null;
  const ptsOf = o => (SM.norm(o.speedCurve) || []).map(p => ({ ...p }));
  const local = (el, e) => { const r = el.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  document.addEventListener('pointerdown', e => {
    const dot = e.target.closest('#sppanel [data-spi]'); const c = sel(); if (!dot || !c) return;
    e.preventDefault(); const el = dot.closest('svg');
    drag = { el, i: +dot.dataset.spi, pts: ptsOf(c.obj) }; el.setPointerCapture?.(e.pointerId);
  });
  document.addEventListener('pointermove', e => {
    if (!drag) return;
    const [X, Y] = local(drag.el, e), q = fromPx(X, Y), n = drag.pts.length, i = drag.i;
    const lo = i ? drag.pts[i - 1].x + .01 : 0, hi = i < n - 1 ? drag.pts[i + 1].x - .01 : 1;
    drag.pts[i] = { x: i === 0 ? 0 : i === n - 1 ? 1 : Math.min(hi, Math.max(lo, q.x)), y: q.y }; // hai đầu chỉ kéo dọc
    drag.el.outerHTML = svg(drag.pts); drag.el = document.querySelector('#sppanel [data-spcurve]');
  });
  document.addEventListener('pointerup', () => {
    if (!drag) return;
    const pts = drag.pts; drag = null;
    run(i => setClipCurve(i, pts), 'spcurve');
  });
  document.addEventListener('dblclick', e => {
    const el = e.target.closest('#sppanel [data-spcurve]'), c = sel(); if (!el || !c) return;
    const pts = ptsOf(c.obj), dot = e.target.closest('[data-spi]');
    if (dot) { const i = +dot.dataset.spi; if (i === 0 || i === pts.length - 1 || pts.length <= 2) return; pts.splice(i, 1); }
    else { const [X, Y] = local(el, e); pts.push(fromPx(X, Y)); pts.sort((a, b) => a.x - b.x); }
    run(i => setClipCurve(i, pts));
  });

  const st = document.createElement('style');
  st.textContent = `
#sppanel .spmode { display:grid; grid-template-columns:1fr 1fr; gap:var(--space-1); margin-bottom:var(--space-2); }
#sppanel .spmode button.on, #sppanel .sppre button.on, #sppanel .acts button.on { background:rgb(var(--color-accent-soft) / .24); border-color:rgb(var(--color-accent-text) / .5); color:rgb(var(--color-accent-text-strong)); }
#sppanel .sppre { display:grid; grid-template-columns:repeat(3,1fr); gap:var(--space-1); margin-bottom:var(--space-2); }
#sppanel .sppre button { flex-direction:column; gap:var(--space-050); padding:var(--space-1); font-size:var(--text-2xs); color:rgb(var(--color-fg-muted)); }
#sppanel .sppre svg { width:40px; height:18px; }
#sppanel .sppre polyline, #sppanel .spbox polyline { fill:none; stroke:rgb(var(--color-accent-text)); stroke-width:1.6; }
#sppanel .spbox { background:rgb(var(--color-surface-raised)); border:1px solid rgb(var(--color-line)); border-radius:var(--radius-control); margin-bottom:var(--space-2); }
#sppanel .spbox svg { display:block; width:100%; height:auto; touch-action:none; }
#sppanel .spbox line.g { stroke:rgb(var(--color-line)); stroke-dasharray:2 3; }
#sppanel .spbox line.g1 { stroke:rgb(var(--color-fg-muted) / .6); }
#sppanel .spbox line.g4 { stroke:rgb(var(--color-warning) / .5); stroke-dasharray:4 3; }
#sppanel .spbox text { fill:rgb(var(--color-fg-muted)); font-size:8px; text-anchor:end; }
#sppanel .spbox circle { fill:rgb(var(--color-surface)); stroke:rgb(var(--color-accent-text)); stroke-width:2; cursor:grab; }
#sppanel .spbox circle:hover { fill:rgb(var(--color-accent-text)); }`;
  document.head.appendChild(st);
})();
