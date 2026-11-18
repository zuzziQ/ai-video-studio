// Hình khối (S20 M144): panel "Hình khối" ở bước Dựng (lưới 5 hình, bấm = chèn cảnh `shape` giữa khung tại playhead) và tab
// inspector "Hình" (màu nền, viền, độ dày viền, bo góc, độ mờ, hoạt ảnh). Engine: engine/shape.js. Kéo / tay nắm cạnh / ô
// Rộng–Cao chạy nhờ StageCore.GEO.shape = 'card' (09_stage.core.js). Không có route: mọi thứ nằm trong timeline.json.
(() => {
  const S = Studio, { $, sect } = S;
  const KINDS = [
    ['rect', 'Chữ nhật', '<rect x="3" y="6" width="18" height="12"/>'],
    ['rounded', 'Bo góc', '<rect x="3" y="6" width="18" height="12" rx="4"/>'],
    ['circle', 'Tròn', '<circle cx="12" cy="12" r="8"/>'],
    ['line', 'Đường', '<line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'],
    ['arrow', 'Mũi tên', '<line x1="3" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><polygon points="21,12 15,7.5 15,16.5"/>'],
  ];
  const ANIMS = [['fade', 'Mờ dần', 'ti-brightness-half'], ['pop', 'Bật lên', 'ti-sparkles'], ['wipe', 'Quét', 'ti-arrow-narrow-right']];
  const LINEY = new Set(['line', 'arrow']);
  const r2 = v => Math.round(v * 100) / 100;
  const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : /^#[0-9a-f]{3}$/i.test(v || '') ? '#' + [...v.slice(1)].map(c => c + c).join('') : d);
  const DFILL = '#FFD84A', DSTROKE = '#FFFFFF'; // design-token-ok: màu mặc định của hình trong video (dữ liệu render), không phải màu giao diện
  const brand = () => S.TL?.brand || {};
  const isShape = c => c && c.kind === 'scene' && c.obj.type === 'shape';

  // Hộp mặc định theo loại, giữa khung thiết kế (720×1280 dọc, 1280×720 ngang).
  function make(kind) {
    const DW = S.DW, DH = S.DH, m = Math.min(DW, DH);
    const [w, h] = { rect: [m * .5, m * .34], rounded: [m * .5, m * .34], circle: [m * .4, m * .4], line: [m * .56, 32], arrow: [m * .56, 64] }[kind];
    const D = S.TL.duration || 0, T = S.T;
    let t1 = Math.min(D, T + 3), t0 = T;
    if (t1 - t0 < .5) t0 = Math.max(0, t1 - 3);
    const s = { type: 'shape', shape: kind, t0: r2(t0), t1: r2(t1), added: true,
      card: { x: Math.round((DW - w) / 2), y: Math.round((DH - h) / 2), w: Math.round(w), h: Math.round(h) }, opacity: 1, anim: 'fade' };
    if (LINEY.has(kind)) Object.assign(s, { stroke: hex(brand().accent, DSTROKE), stroke_w: kind === 'arrow' ? 10 : 8 });
    else Object.assign(s, { fill: hex(brand().accent, DFILL), stroke: DSTROKE, stroke_w: 0 }, kind === 'rounded' ? { radius: 32 } : {});
    return s;
  }
  function add(kind) {
    S.pushUndo();
    const s = make(kind);
    S.TL.scenes.push(s); S.changed();
    if (S.T < s.t0 + .4) S.setTime(Math.min(s.t1 - .05, s.t0 + .4)); // qua lúc hoạt ảnh vào để thấy hình ngay
    S.select(S.compOf(s));
    S.toast('Đã thêm hình — kéo trên khung để dời, tay nắm cạnh để giãn');
  }

  function panel() {
    $('#libbody').innerHTML = `<div class="help">Bấm để xem chi tiết ở cột phải; bấm đúp hoặc nút Thêm tại playhead để chèn hình vào giữa khung tại playhead (3 giây). Kéo trên preview để dời, tay nắm cạnh để giãn; màu, viền, hoạt ảnh ở tab Hình bên phải.</div>
      <div class="shgrid">${KINDS.map(([k, l, svg]) => `<button data-shadd="${k}" title="${l}"><svg viewBox="0 0 24 24">${svg}</svg><small>${l}</small></button>`).join('')}</div>`;
  }
  S.addPanel('shapes', 'ti-shape', 'Hình khối', panel, { step: 'build', level: 'basic' });

  const rng = (f, v, a, b, st, l, u = '') => `<div class="slrow"><span>${l}</span><input type="range" data-shr="${f}" min="${a}" max="${b}" step="${st}" value="${v}"><b data-shv="${f}">${v}${u}</b></div>`;
  function tab(c) {
    if (!isShape(c)) return null;
    const o = c.obj, kind = o.shape || 'rect', liney = LINEY.has(kind), sw = o.stroke_w ?? (liney ? 8 : 0);
    const br = brand(), sws = [...new Set([br.primary, br.accent, br.dark, br.light].map(v => hex(v, '')).filter(Boolean))];
    const swatch = f => (sws.length ? `<div class="shsw">${sws.map(v => `<button data-shsw="${f}" data-v="${v}" title="Màu thương hiệu ${v}" style="background:${v}"></button>`).join('')}</div>` : ''); // design-token-ok: ô màu thương hiệu (màu của video)
    let h = sect('Loại hình', `<div class="shgrid">${KINDS.map(([k, l, svg]) => `<button data-shk="${k}" class="${kind === k ? 'on' : ''}" title="${l}"><svg viewBox="0 0 24 24">${svg}</svg><small>${l}</small></button>`).join('')}</div>`, 'ti-shape');
    if (!liney) h += sect('Màu nền', `<div class="row"><input type="color" data-shc="fill" value="${hex(o.fill, DFILL)}" ${o.fill === 'none' ? 'disabled' : ''}>
      <label class="check"><input type="checkbox" data-shnofill ${o.fill === 'none' ? 'checked' : ''}> Không nền</label></div>${swatch('fill')}`, 'ti-palette');
    h += sect(liney ? 'Nét' : 'Viền', `<div class="row"><input type="color" data-shc="stroke" value="${hex(o.stroke, DSTROKE)}"></div>${swatch('stroke')}
      ${rng('stroke_w', sw, liney ? 1 : 0, 60, 1, 'Độ dày', 'px')}${kind === 'rounded' ? rng('radius', o.radius ?? 32, 0, 300, 1, 'Bo góc', 'px') : ''}`, 'ti-border-outer');
    h += sect('Hiển thị', `${rng('opacity', Math.round((o.opacity ?? 1) * 100), 0, 100, 1, 'Độ mờ', '%')}
      <span class="lbl">Hoạt ảnh vào</span><div class="seg3">${ANIMS.map(([k, l, ic]) => `<button data-sha="${k}" class="${(o.anim || 'fade') === k ? 'on' : ''}"><i class="ti ${ic}"></i>${l}</button>`).join('')}</div>`, 'ti-eye');
    return ['shape', 'Hình', `<div id="shpanel">${h}</div>`];
  }
  S.addInspectorTab(tab);

  const cur = () => (isShape(S.sel) ? S.sel : null);
  const set = (fn, key) => { const c = cur(); if (!c) return; S.pushUndo(key); fn(c.obj); S.changed(!key); };
  document.addEventListener('click', e => {
    let b;
    if ((b = e.target.closest('#libbody [data-shadd]'))) return add(b.dataset.shadd);
    if (!e.target.closest('#shpanel')) return;
    if ((b = e.target.closest('[data-shk]'))) return set(o => setKind(o, b.dataset.shk));
    if ((b = e.target.closest('[data-sha]'))) return set(o => { o.anim = b.dataset.sha; });
    if ((b = e.target.closest('[data-shsw]'))) return set(o => { o[b.dataset.shsw] = b.dataset.v; if (b.dataset.shsw === 'stroke' && !LINEY.has(o.shape) && !o.stroke_w) o.stroke_w = 6; });
  });
  // Đổi loại hình, giữ vị trí / màu / thời gian (tab Hình, và "Thay element đang chọn" của chi tiết thư viện, M147)
  function setKind(o, k) {
      const was = LINEY.has(o.shape), now = LINEY.has(k); o.shape = k;
      if (was !== now) { // đổi giữa hình kín và đường: giữ màu chính (nền <-> nét), đổi cao hộp cho hợp
        const main = was ? o.stroke : o.fill;
        if (now) { o.stroke = hex(main, DSTROKE); o.stroke_w = Math.max(o.stroke_w || 0, 8); delete o.fill; o.card = { ...(o.card || {}), h: k === 'arrow' ? 64 : 32 }; }
        else { o.fill = hex(main, DFILL); o.stroke = DSTROKE; o.stroke_w = 0; const w = o.card?.w || 300; o.card = { ...(o.card || {}), h: Math.round(w * (k === 'circle' ? 1 : .68)) }; }
      }
      if (k === 'circle' && o.card) o.card.h = o.card.w;
      if (k === 'arrow' && o.card && o.card.h < 40) o.card.h = 64;
      if (k === 'rounded' && o.radius == null) o.radius = 32;
  }
  S.addShape = add; S.shapeKind = setKind; S.SHAPE_KINDS = KINDS;
  document.addEventListener('input', e => {
    const t = e.target; if (!t.closest?.('#shpanel')) return;
    if (t.dataset.shr) {
      const f = t.dataset.shr, v = +t.value, lab = document.querySelector(`#shpanel [data-shv="${f}"]`);
      if (lab) lab.textContent = v + (f === 'opacity' ? '%' : 'px');
      return set(o => { o[f] = f === 'opacity' ? v / 100 : v; }, 'sh' + f);
    }
    if (t.dataset.shc) return set(o => { o[t.dataset.shc] = t.value; if (t.dataset.shc === 'stroke' && !LINEY.has(o.shape) && !o.stroke_w) { o.stroke_w = 6; } }, 'shc' + t.dataset.shc);
  });
  document.addEventListener('change', e => {
    const t = e.target; if (!t.closest?.('#shpanel')) return;
    if (t.dataset.shnofill != null) return set(o => { o.fill = t.checked ? 'none' : DFILL; });
  });

  const st = document.createElement('style');
  st.textContent = `
.shgrid { display:grid; grid-template-columns:repeat(5,1fr); gap:var(--space-2); margin-top:var(--space-2); }
.shgrid button { flex-direction:column; gap:var(--space-1); padding:var(--space-2) var(--space-050); font-size:var(--text-2xs); color:rgb(var(--color-fg-muted)); }
.shgrid svg { width:28px; height:28px; fill:currentColor; opacity:.85; }
.shgrid button.on { background:rgb(var(--color-accent-soft) / .24); border-color:rgb(var(--color-accent-text) / .5); color:rgb(var(--color-fg)); }
#libbody .shgrid { grid-template-columns:repeat(3,1fr); }
#libbody .shgrid button { padding:var(--space-3) var(--space-1); }
#libbody .shgrid svg { width:40px; height:40px; }
#shpanel .seg3 { display:grid; grid-template-columns:repeat(3,1fr); gap:var(--space-1); }
#shpanel .seg3 button { flex-direction:column; gap:var(--space-050); padding:var(--space-2) var(--space-050); font-size:var(--text-2xs); }
#shpanel .seg3 button.on { background:rgb(var(--color-accent-soft) / .24); border-color:rgb(var(--color-accent-text) / .5); }
#shpanel input[type=color] { width:44px; height:var(--h-md); padding:var(--space-050); }
#shpanel .row { align-items:center; }
#shpanel .shsw { display:flex; gap:var(--space-1); margin:var(--space-1) 0 var(--space-2); }
#shpanel .shsw button { width:22px; height:22px; min-height:0; padding:0; border-radius:var(--radius-control); }`;
  document.head.appendChild(st);
})();
