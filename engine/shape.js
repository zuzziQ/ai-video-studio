// Hình khối (S20 M144): cảnh `shape` — chữ nhật, bo góc, tròn, đường, mũi tên vẽ bằng SVG đúng hộp s.card.
// Trường: shape 'rect'|'rounded'|'circle'|'line'|'arrow' · card {x, y, w, h} (px thiết kế, góc trên trái) · fill · stroke ·
// stroke_w · radius (rounded) · opacity 0..1 · anim 'fade'|'pop'|'wipe' (mặc định fade). Ra: phong bì chung của engine.js
// (mọi cảnh overlay mờ dần quanh t1); xoay: s.rot qua applyRot (data-cid). Studio: features/64_shapes.js, tay nắm cạnh nhờ
// StageCore.GEO.shape = 'card' (features/09_stage.core.js). Chạy trong trình duyệt (MODULES.shape) và trong Node (module.exports)
// cho scripts/tests/s20_shape.test.mjs. Spec: references/modules.md mục "shape".
(function (root) {
  const KINDS = ['rect', 'rounded', 'circle', 'line', 'arrow'];
  const LINEY = new Set(['line', 'arrow']);
  // Hộp mặc định khi cảnh chưa có card: [dọc 720×1280, ngang 1280×720] — giữ khớp CARD_DEF.shape của StageCore.
  const DEF = [{ x: 210, y: 490, w: 300, h: 300 }, { x: 490, y: 210, w: 300, h: 300 }];
  const DUR = { fade: .25, pop: .32, wipe: .4 };
  const num = (v, d) => (v != null && v !== '' && Number.isFinite(+v) ? +v : d);
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  // Màu đi thẳng vào thuộc tính SVG: chỉ nhận dạng màu CSS (#hex, rgb()/hsl(), tên, var(--x)), còn lại dùng mặc định.
  const color = (v, d) => (typeof v === 'string' && /^(#[0-9a-f]{3,8}|(rgba?|hsla?)\([\d\s.,%/]+\)|[a-z]{3,20}|var\(--[\w-]+\))$/i.test(v.trim()) ? v.trim() : d);
  const f1 = v => Math.round(v * 10) / 10;

  function shapeBox(s, landscape = false) {
    const c = { ...DEF[landscape ? 1 : 0], ...(s.card || {}) };
    return { x: num(c.x, 0), y: num(c.y, 0), w: Math.max(1, num(c.w, 300)), h: Math.max(1, num(c.h, 300)) };
  }
  // Trường đã chuẩn hoá (mặc định theo loại hình): đường / mũi tên chỉ có nét, hình kín có nền và nét tuỳ chọn.
  function shapeProps(s) {
    const kind = KINDS.includes(s.shape) ? s.shape : 'rect', liney = LINEY.has(kind);
    const stroke = color(s.stroke, liney ? color(s.fill, '#FFFFFF') : '#FFFFFF');
    return {
      kind,
      fill: liney ? 'none' : s.fill === 'none' ? 'none' : color(s.fill, '#FFD84A'),
      stroke,
      sw: cl(num(s.stroke_w, liney ? 8 : 0), 0, 200),
      radius: cl(num(s.radius, 32), 0, 2000),
      opacity: cl(num(s.opacity, 1), 0, 1),
      anim: DUR[s.anim] ? s.anim : 'fade',
    };
  }
  // SVG của hình trong hộp w×h; nét nằm trong hộp (thụt nửa độ dày) để khung chọn của Studio khớp hình nhìn thấy.
  function shapeSVG(p, w, h) {
    const sw = p.sw, hs = sw / 2, st = sw > 0 ? ` stroke="${p.stroke}" stroke-width="${f1(sw)}"` : '';
    let body;
    if (p.kind === 'circle') body = `<ellipse cx="${f1(w / 2)}" cy="${f1(h / 2)}" rx="${f1(Math.max(0, w / 2 - hs))}" ry="${f1(Math.max(0, h / 2 - hs))}" fill="${p.fill}"${st}/>`;
    else if (p.kind === 'line') body = `<line x1="${f1(hs)}" y1="${f1(h / 2)}" x2="${f1(w - hs)}" y2="${f1(h / 2)}" stroke="${p.stroke}" stroke-width="${f1(Math.max(1, sw))}" stroke-linecap="round"/>`;
    else if (p.kind === 'arrow') {
      const lw = Math.max(1, sw), hl = Math.min(w * .5, Math.max(lw * 3, 24)), hh = Math.min(h / 2, hl * .6), my = h / 2;
      body = `<line x1="${f1(lw / 2)}" y1="${f1(my)}" x2="${f1(w - hl + 1)}" y2="${f1(my)}" stroke="${p.stroke}" stroke-width="${f1(lw)}" stroke-linecap="round"/>` +
        `<polygon points="${f1(w)},${f1(my)} ${f1(w - hl)},${f1(my - hh)} ${f1(w - hl)},${f1(my + hh)}" fill="${p.stroke}" stroke="${p.stroke}" stroke-width="${f1(Math.min(lw, 4))}" stroke-linejoin="round"/>`;
    } else {
      const rx = p.kind === 'rounded' ? Math.min(p.radius, Math.min(w, h) / 2) : 0;
      body = `<rect x="${f1(hs)}" y="${f1(hs)}" width="${f1(Math.max(0, w - sw))}" height="${f1(Math.max(0, h - sw))}"${rx ? ` rx="${f1(Math.max(0, rx - hs))}"` : ''} fill="${p.fill}"${st}/>`;
    }
    return `<svg width="${f1(w)}" height="${f1(h)}" viewBox="0 0 ${f1(w)} ${f1(h)}" style="display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }
  // Hoạt ảnh vào theo thời gian trong cảnh lt (giây): độ mờ, scale, phần lộ ra từ trái (wipe). Ra do phong bì chung lo.
  function shapeAnim(anim, lt) {
    const d = DUR[anim] || DUR.fade, k = cl(lt / d, 0, 1);
    if (anim === 'pop') { const b = 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2); return { o: cl(k * 2, 0, 1), s: .4 + .6 * b, reveal: 1 }; }
    const e = 1 - Math.pow(1 - k, 3);
    if (anim === 'wipe') return { o: 1, s: 1, reveal: e };
    return { o: e, s: 1, reveal: 1 };
  }
  function shape(s, t, lt) {
    const W = typeof STAGE_WH !== 'undefined' && STAGE_WH ? STAGE_WH : null;
    const b = shapeBox(s, W ? W[0] > W[1] : false), p = shapeProps(s), a = shapeAnim(p.anim, lt);
    const cid = s.cid ? ` data-cid="${s.cid}"` : '';
    const clip = a.reveal < 1 ? `clip-path:inset(-50% ${f1((1 - a.reveal) * 100)}% -50% -50%);` : '';
    const tr = a.s !== 1 ? `transform:scale(${a.s.toFixed(3)});` : '';
    return { front: `<div class="abs"${cid} style="left:${f1(b.x)}px;top:${f1(b.y)}px;width:${f1(b.w)}px;height:${f1(b.h)}px;opacity:${(p.opacity * a.o).toFixed(3)};${tr}${clip}">${shapeSVG(p, b.w, b.h)}</div>` };
  }
  const api = { KINDS, DEF, shapeBox, shapeProps, shapeSVG, shapeAnim, shape };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof MODULES !== 'undefined') MODULES.shape = shape;
  if (root) root.SHAPE = api;
})(typeof window !== 'undefined' ? window : null);
