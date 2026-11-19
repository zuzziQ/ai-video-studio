// Element riêng (S27 M199, docs/plans/S27-element-claude.md): cảnh `celem` vẽ từ một spec JSON khai báo, không phải JS tự do.
// Spec: { v: 1, name, w, h, vars?: {tên: màu | font}, in?, out?, dur?, layers: [lớp…] } — w×h là hộp gốc của spec; lớp đặt theo
// toạ độ trong hộp đó và giãn theo s.card {x, y, w, h} (px thiết kế, góc trên trái), chữ / bo góc / viền giãn theo chiều cao.
// Lớp: k 'rect'|'round'|'pill'|'line'|'text'|'image' · x y w h · fill (màu hoặc {from, to, angle}) · stroke · sw · dash · r (round) ·
//   opacity · rot · shadow {x, y, blur, color} · in / delay / dur (hoạt ảnh vào riêng của lớp) · chữ: text ('{text}' = s.text),
//   font, size, weight, color, align, valign, ls, lh, upper, italic · ảnh: src '@logo' (logo thương hiệu), fit.
// Màu: #hex, rgb()/hsl(), tên màu, '@primary|@accent|@dark|@light|@muted' (bộ thương hiệu), '$tên' (spec.vars).
// Font: '@font' | '@disp' (bộ thương hiệu), tên họ font chỉ gồm chữ / số / khoảng trắng / '-', hoặc '$tên'.
// check(raw) là cổng duy nhất: whitelist khoá ở mọi tầng, chặn ngoặc kép, '<', '>', url(, javascript:, expression(, @import, '\'.
// Engine gọi lại check lúc vẽ (timeline.json có thể bị sửa tay): spec hỏng thì vẽ khung nét đứt, không chèn gì của spec.
// Chạy trong trình duyệt (MODULES.celem, window.CELEM) và Node (module.exports) cho scripts/elem_make.mjs và s27_m199.test.mjs.
(function (root) {
  const KINDS = ['rect', 'round', 'pill', 'line', 'text', 'image'];
  const ANIMS = ['none', 'fade', 'pop', 'slide_l', 'slide_r', 'slide_u', 'slide_d', 'drop', 'wipe', 'grow_x'];
  const OUTS = ['none', 'fade', 'pop', 'slide_l', 'slide_r', 'slide_u', 'slide_d'];
  const BRAND_COLORS = ['primary', 'accent', 'dark', 'light', 'muted'];
  const MAX_LAYERS = 12, MAX_VARS = 8, MAX_TEXT = 200;
  // khoá cho phép theo tầng; [kiểu, min, max] cho số
  const TOP = { v: 'v', name: 'str40', w: ['n', 40, 2000], h: ['n', 20, 2000], vars: 'vars', in: 'anim', out: 'out', dur: ['n', 0.1, 2], layers: 'layers' };
  const LAYER = {
    k: 'kind', x: ['n', -4000, 4000], y: ['n', -4000, 4000], w: ['n', 0, 4000], h: ['n', 0, 4000],
    fill: 'paint', stroke: 'color', sw: ['n', 0, 60], dash: 'bool', r: ['n', 0, 2000], opacity: ['n', 0, 1], rot: ['n', -180, 180],
    shadow: 'shadow', in: 'anim', delay: ['n', 0, 3], dur: ['n', 0.1, 2],
    text: 'text', font: 'font', size: ['n', 6, 600], weight: ['n', 100, 900], color: 'color', align: ['e', 'left', 'center', 'right'],
    valign: ['e', 'top', 'middle', 'bottom'], ls: ['n', -20, 60], lh: ['n', 0.7, 2.5], upper: 'bool', italic: 'bool',
    src: ['e', '@logo'], fit: ['e', 'contain', 'cover'],
  };
  const ONLY = { text: ['text', 'font', 'size', 'weight', 'color', 'align', 'valign', 'ls', 'lh', 'upper', 'italic'], image: ['src', 'fit'] };
  const SHADOW = { x: ['n', -100, 100], y: ['n', -100, 100], blur: ['n', 0, 120], color: 'color' };
  const GRAD = { from: 'color', to: 'color', angle: ['n', 0, 360] };
  // Chuỗi nào cũng không được mang mã: ngoặc kép (đóng style="…" của engine, dev-memory ai-video-studio-053), thẻ, url ngoài, JS.
  const BAD = /["<>\\]|url\s*\(|javascript:|expression\s*\(|@import|data:|https?:/i;
  const BAD_TEXT = /[<>]|javascript:|url\s*\(|expression\s*\(/i; // chữ hiển thị được có ngoặc kép (thoát &quot;) nhưng không thẻ
  const COLOR = /^(#[0-9a-f]{3,8}|(rgba?|hsla?)\(\s*[\d.]+%?(\s*[,\s/]\s*[\d.]+%?){2,3}\s*\)|[a-z]{3,20})$/i;
  const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 -]{0,39}$/;
  const VAR = /^[a-z][a-z0-9_]{0,15}$/;
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  const f1 = v => Math.round(v * 10) / 10;
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const colorOk = v => typeof v === 'string' && !BAD.test(v) && (COLOR.test(v.trim()) || v === 'transparent' ||
    /^@(primary|accent|dark|light|muted)$/.test(v) || /^\$[a-z][a-z0-9_]{0,15}$/.test(v));
  const fontOk = v => typeof v === 'string' && !BAD.test(v) && (/^@(font|disp)$/.test(v) || FAMILY.test(v) || /^\$[a-z][a-z0-9_]{0,15}$/.test(v));

  // Kiểm một giá trị theo kiểu; trả [giá trị, lỗi]
  function val(type, v, at, errs) {
    if (Array.isArray(type)) {
      if (type[0] === 'n') { if (typeof v !== 'number' || !Number.isFinite(v)) { errs.push(`${at}: phải là số`); return undefined; } return cl(v, type[1], type[2]); }
      if (type[0] === 'e') { if (!type.slice(1).includes(v)) { errs.push(`${at}: giá trị lạ`); return undefined; } return v; }
    }
    switch (type) {
      case 'v': if (v !== 1) errs.push(`${at}: chỉ có bản 1`); return 1;
      case 'str40': if (typeof v !== 'string' || BAD.test(v)) { errs.push(`${at}: tên chỉ là chữ thường`); return undefined; } return v.trim().slice(0, 40);
      case 'bool': if (typeof v !== 'boolean') { errs.push(`${at}: phải là true/false`); return undefined; } return v;
      case 'kind': if (!KINDS.includes(v)) { errs.push(`${at}: loại lớp lạ`); return undefined; } return v;
      case 'anim': if (!ANIMS.includes(v)) { errs.push(`${at}: hoạt ảnh vào lạ`); return undefined; } return v;
      case 'out': if (!OUTS.includes(v)) { errs.push(`${at}: hoạt ảnh ra lạ`); return undefined; } return v;
      case 'color': if (!colorOk(v)) { errs.push(`${at}: màu không hợp lệ`); return undefined; } return v.trim();
      case 'font': if (!fontOk(v)) { errs.push(`${at}: font không hợp lệ`); return undefined; } return v.trim();
      case 'text': if (typeof v !== 'string' || BAD_TEXT.test(v)) { errs.push(`${at}: chữ có thẻ / mã`); return undefined; } return v.slice(0, MAX_TEXT);
      case 'paint': if (isObj(v)) return obj(GRAD, v, at, errs, ['from', 'to']); return val('color', v, at, errs);
      case 'shadow': if (!isObj(v)) { errs.push(`${at}: bóng phải là object`); return undefined; } return obj(SHADOW, v, at, errs, ['color']);
    }
    errs.push(`${at}: kiểu lạ`); return undefined;
  }
  function obj(schema, raw, at, errs, need = []) {
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!Object.prototype.hasOwnProperty.call(schema, k)) { errs.push(`${at}.${k}: thuộc tính lạ`); continue; }
      if (v == null) continue;
      const r = val(schema[k], v, `${at}.${k}`, errs); if (r !== undefined) out[k] = r;
    }
    for (const k of need) if (out[k] == null) errs.push(`${at}.${k}: thiếu`);
    return out;
  }

  // Cổng kiểm spec: { ok, spec (đã chuẩn hoá), errors }. Mọi khoá lạ, chuỗi mang mã, url → lỗi (không lặng lẽ bỏ).
  function check(raw) {
    const errors = [];
    if (!isObj(raw)) return { ok: false, spec: null, errors: ['spec phải là object'] };
    const spec = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!Object.prototype.hasOwnProperty.call(TOP, k)) { errors.push(`${k}: thuộc tính lạ`); continue; }
      if (v == null) continue;
      if (k === 'vars') {
        if (!isObj(v)) { errors.push('vars phải là object'); continue; }
        const ks = Object.keys(v); if (ks.length > MAX_VARS) errors.push(`vars: tối đa ${MAX_VARS}`);
        spec.vars = {};
        for (const n of ks.slice(0, MAX_VARS)) {
          const x = v[n];
          if (!VAR.test(n)) { errors.push(`vars.${String(n).slice(0, 20)}: tên biến chỉ gồm a-z, 0-9, _`); continue; }
          if (typeof x === 'string' && x.startsWith('$')) { errors.push(`vars.${n}: biến không trỏ sang biến khác`); continue; }
          if (colorOk(x)) spec.vars[n] = x.trim(); else if (fontOk(x)) spec.vars[n] = x.trim(); else errors.push(`vars.${n}: chỉ nhận màu hoặc font`);
        }
        continue;
      }
      if (k === 'layers') {
        if (!Array.isArray(v) || !v.length) { errors.push('layers: cần ít nhất một lớp'); continue; }
        if (v.length > MAX_LAYERS) errors.push(`layers: tối đa ${MAX_LAYERS} lớp`);
        spec.layers = v.slice(0, MAX_LAYERS).map((L, i) => {
          if (!isObj(L)) { errors.push(`layers[${i}]: phải là object`); return null; }
          const o = obj(LAYER, L, `layers[${i}]`, errors, ['k']);
          for (const [kind, ks] of Object.entries(ONLY)) if (o.k !== kind) for (const f of ks) if (f in o) errors.push(`layers[${i}].${f}: chỉ dùng cho lớp ${kind}`);
          if (o.k === 'text' && !o.text) errors.push(`layers[${i}].text: lớp chữ cần chữ`);
          if (o.k === 'image' && !o.src) errors.push(`layers[${i}].src: lớp ảnh chỉ nhận '@logo'`);
          return o;
        }).filter(Boolean);
        continue;
      }
      const r = val(TOP[k], v, k, errors); if (r !== undefined) spec[k] = r;
    }
    if (!spec.w || !spec.h) errors.push('w, h: cần kích thước hộp');
    if (!spec.layers?.length) errors.push('layers: cần ít nhất một lớp');
    // biến được dùng phải có, và đúng loại (màu ở chỗ màu, font ở chỗ font)
    const vars = spec.vars || {};
    const use = (v, kind, at) => {
      if (typeof v !== 'string' || !v.startsWith('$')) return;
      const x = vars[v.slice(1)];
      if (x == null) errors.push(`${at}: chưa khai báo biến ${v}`);
      else if (kind === 'color' ? !colorOk(x) || /^@(font|disp)$/.test(x) : !fontOk(x) || COLOR.test(x) && !FAMILY.test(x)) errors.push(`${at}: biến ${v} sai loại`);
    };
    (spec.layers || []).forEach((L, i) => {
      for (const f of ['stroke', 'color']) use(L[f], 'color', `layers[${i}].${f}`);
      if (isObj(L.fill)) { use(L.fill.from, 'color', `layers[${i}].fill.from`); use(L.fill.to, 'color', `layers[${i}].fill.to`); } else use(L.fill, 'color', `layers[${i}].fill`);
      if (L.shadow) use(L.shadow.color, 'color', `layers[${i}].shadow.color`);
      use(L.font, 'font', `layers[${i}].font`);
    });
    if (!spec.v) spec.v = 1;
    return { ok: !errors.length, spec: errors.length ? null : spec, errors };
  }
  // spec có lớp chữ gắn '{text}' (chữ sửa được ở Thuộc tính, mặc định lấy từ s.text)
  // thời gian tới lúc mọi lớp đã vào xong (giây): ảnh xem trước chụp sau mốc này, cảnh chèn mới dài hơn mốc này
  const settle = spec => Math.max(spec?.dur || 0.4, ...(spec?.layers || []).map(L => (L.in && L.in !== 'none' ? (L.delay || 0) + (L.dur || 0.4) : 0)));
  const hasText = spec => !!spec?.layers?.some(L => L.k === 'text' && L.text.includes('{text}'));

  // ---------- vẽ ----------
  const brandOf = o => {
    const B = o?.brand || (typeof BR === 'function' ? BR() : {}) || {};
    // giá trị thương hiệu có thể mang ngoặc kép ('"Bungee", sans-serif'): đổi sang ngoặc đơn trước khi vào style="…"
    const q = v => (typeof v === 'string' ? v.replace(/"/g, "'").replace(/[<>\\;{}]/g, '') : '');
    return { primary: q(B.primary) || '#FF5A36', accent: q(B.accent) || '#FFD84A', dark: q(B.dark) || '#111214', light: q(B.light) || '#FFFFFF',
      muted: q(B.muted) || '#A7A9B0', font: q(B.font) || 'var(--sans)', disp: q(B.disp) || 'var(--disp)', logo: typeof B.logo === 'string' ? B.logo : '' };
  };
  function colorOf(v, spec, B, d = 'transparent') {
    if (typeof v !== 'string') return d;
    if (v.startsWith('$')) v = spec.vars?.[v.slice(1)] ?? '';
    if (v.startsWith('@')) { const k = v.slice(1); return BRAND_COLORS.includes(k) && COLOR.test(B[k]) ? B[k] : d; }
    return colorOk(v) ? v : d;
  }
  function fontOf(v, spec, B) {
    if (typeof v !== 'string') return B.font;
    if (v.startsWith('$')) v = spec.vars?.[v.slice(1)] ?? '';
    if (v === '@font') return B.font;
    if (v === '@disp') return B.disp;
    return FAMILY.test(v) ? `'${v}',sans-serif` : B.font;
  }
  const paintOf = (v, spec, B) => (isObj(v) ? `linear-gradient(${f1(v.angle ?? 90)}deg,${colorOf(v.from, spec, B)},${colorOf(v.to, spec, B)})` : colorOf(v, spec, B));

  const backOut = k => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
  // trạng thái hoạt ảnh ở tiến độ k (0 = chưa vào, 1 = đã vào): độ mờ, dời (% hộp), scale, scaleX, phần lộ (wipe)
  function animAt(id, k) {
    k = cl(k, 0, 1); const e = 1 - Math.pow(1 - k, 3), r = { o: 1, tx: 0, ty: 0, s: 1, sx: 1, rev: 1 };
    switch (id) {
      case 'fade': r.o = e; break;
      case 'pop': r.o = cl(k * 2, 0, 1); r.s = 0.4 + 0.6 * backOut(k); break;
      case 'slide_l': r.o = e; r.tx = -(1 - e) * 30; break;
      case 'slide_r': r.o = e; r.tx = (1 - e) * 30; break;
      case 'slide_u': r.o = e; r.ty = (1 - e) * 30; break;
      case 'slide_d': r.o = e; r.ty = -(1 - e) * 30; break;
      case 'drop': r.o = cl(k * 3, 0, 1); r.ty = -(1 - backOut(k)) * 60; break;
      case 'wipe': r.rev = e; break;
      case 'grow_x': r.sx = e; break;
    }
    return r;
  }
  function animCss(a, origin = 'center') {
    const tr = [];
    if (a.tx || a.ty) tr.push(`translate(${f1(a.tx)}%,${f1(a.ty)}%)`);
    if (a.s !== 1) tr.push(`scale(${a.s.toFixed(3)})`);
    if (a.sx !== 1) tr.push(`scaleX(${a.sx.toFixed(3)})`);
    return (tr.length ? `transform:${tr.join(' ')};transform-origin:${a.sx !== 1 ? 'left center' : origin};` : '') +
      (a.rev < 1 ? `clip-path:inset(0 ${f1((1 - a.rev) * 100)}% 0 0);` : '');
  }

  function layerHTML(L, spec, B, sx, sy, lt, text) {
    const sm = Math.min(sx, sy), x = f1((L.x || 0) * sx), y = f1((L.y || 0) * sy), w = f1((L.w ?? spec.w) * sx), h = f1((L.h ?? spec.h) * sy);
    let st = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;`;
    if (L.opacity != null) st += `opacity:${L.opacity};`;
    const a = animAt(L.in || 'none', L.in && L.in !== 'none' ? (lt - (L.delay || 0)) / (L.dur || 0.4) : 1);
    const rot = L.rot ? `rotate(${f1(L.rot)}deg)` : '';
    let anim = animCss(a); if (rot) anim = anim.includes('transform:') ? anim.replace('transform:', `transform:${rot} `) : `transform:${rot};` + anim;
    st += anim + (a.o < 1 ? `opacity:${((L.opacity ?? 1) * a.o).toFixed(3)};` : '');
    const sh = L.shadow ? `${f1((L.shadow.x || 0) * sm)}px ${f1((L.shadow.y || 0) * sm)}px ${f1((L.shadow.blur || 0) * sm)}px ${colorOf(L.shadow.color, spec, B, 'rgba(0,0,0,.4)')}` : '';
    if (L.k === 'text') {
      const al = L.align || 'center', va = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[L.valign || 'middle'];
      const body = esc(L.text).replace(/\{text\}/g, () => esc(text)); // hàm thay: '$&' trong chữ giá giữ nguyên
      st += `display:flex;align-items:${va};justify-content:${al === 'left' ? 'flex-start' : al === 'right' ? 'flex-end' : 'center'};text-align:${al};` +
        `font-family:${fontOf(L.font, spec, B)};font-size:${f1((L.size || 40) * sm)}px;font-weight:${L.weight || 800};color:${colorOf(L.color, spec, B, '#FFFFFF')};` +
        `line-height:${L.lh || 1.15};white-space:pre-wrap;overflow-wrap:anywhere;` + (L.ls ? `letter-spacing:${f1(L.ls * sm)}px;` : '') +
        (L.upper ? 'text-transform:uppercase;' : '') + (L.italic ? 'font-style:italic;' : '') + (sh ? `text-shadow:${sh};` : '');
      return `<div style="${st}"><span>${body}</span></div>`;
    }
    if (L.k === 'image') {
      if (!B.logo || /^(javascript|vbscript):/i.test(B.logo)) return '';
      return `<div style="${st}"><img src="${esc(B.logo)}" style="width:100%;height:100%;object-fit:${L.fit || 'contain'};display:block" alt=""></div>`;
    }
    if (L.k === 'line') {
      const t = f1(Math.max(1, (L.sw || 4) * sm)), c = colorOf(L.stroke || (typeof L.fill === 'string' ? L.fill : ''), spec, B, '#FFFFFF');
      return `<div style="${st}"><div style="position:absolute;left:0;right:0;top:50%;height:${t}px;margin-top:-${f1(t / 2)}px;${L.dash ? `border-top:${t}px dashed ${c}` : `background:${c}`};border-radius:${t}px"></div></div>`;
    }
    const rad = L.k === 'pill' ? '9999px' : L.k === 'round' ? `${f1((L.r ?? 24) * sm)}px` : '0';
    st += `background:${L.fill != null ? paintOf(L.fill, spec, B) : 'transparent'};border-radius:${rad};`;
    if (L.sw) st += `border:${f1(L.sw * sm)}px ${L.dash ? 'dashed' : 'solid'} ${colorOf(L.stroke, spec, B, '#FFFFFF')};`;
    if (sh) st += `box-shadow:${sh};`;
    return `<div style="${st}"></div>`;
  }

  // Hộp mặc định khi cảnh chưa có card: giữa khung, theo tỉ lệ spec (tối đa 70% bề ngang)
  function boxOf(s, spec, W = [720, 1280]) {
    const c = isObj(s.card) ? s.card : {}, num = (v, d) => (Number.isFinite(+v) && v !== '' && v != null ? +v : d);
    const w0 = spec ? Math.min(spec.w, W[0] * 0.7) : 300, h0 = spec ? w0 * spec.h / spec.w : 160;
    return { x: num(c.x, (W[0] - w0) / 2), y: num(c.y, (W[1] - h0) / 2), w: Math.max(1, num(c.w, w0)), h: Math.max(1, num(c.h, h0)) };
  }

  // html của cảnh tại thời điểm t (lt = t − t0). o.brand / o.stage cho Node; trong trình duyệt lấy BR() và STAGE_WH.
  function render(s, t, lt, o = {}) {
    const W = o.stage || (typeof STAGE_WH !== 'undefined' && STAGE_WH) || [720, 1280];
    const r = check(s.spec), spec = r.spec, b = boxOf(s, spec, W), cid = s.cid ? ` data-cid="${esc(s.cid)}"` : '';
    const box = `left:${f1(b.x)}px;top:${f1(b.y)}px;width:${f1(b.w)}px;height:${f1(b.h)}px;`;
    if (!r.ok) return { front: `<div class="abs"${cid} title="Element riêng lỗi" style="${box}border:2px dashed rgba(255,90,54,.8);box-sizing:border-box"></div>`, errors: r.errors };
    const B = brandOf(o), sx = b.w / spec.w, sy = b.h / spec.h, d = spec.dur || 0.4;
    const aIn = animAt(spec.in || 'fade', spec.in === 'none' ? 1 : lt / d);
    const end = Number.isFinite(+s.t1) ? +s.t1 : Infinity, ko = spec.out && spec.out !== 'none' ? cl((end - t) / d, 0, 1) : 1;
    const aOut = animAt(spec.out || 'none', ko);
    const a = { o: aIn.o * aOut.o, tx: aIn.tx + aOut.tx, ty: aIn.ty + aOut.ty, s: aIn.s * aOut.s, sx: aIn.sx * aOut.sx, rev: Math.min(aIn.rev, aOut.rev) };
    const text = typeof s.text === 'string' ? s.text : '';
    const inner = spec.layers.map(L => layerHTML(L, spec, B, sx, sy, lt, text)).join('');
    return { front: `<div class="abs"${cid} style="${box}opacity:${a.o.toFixed(3)};${animCss(a)}">${inner}</div>` };
  }
  const celem = (s, t, lt) => render(s, t, lt);

  const api = { KINDS, ANIMS, OUTS, MAX_LAYERS, MAX_VARS, check, hasText, settle, render, boxOf, animAt, colorOk, fontOk };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof MODULES !== 'undefined') MODULES.celem = celem;
  if (root) root.CELEM = api;
})(typeof window !== 'undefined' ? window : null);
