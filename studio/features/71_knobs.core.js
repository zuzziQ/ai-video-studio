// S21 M148: lõi thuần của Núm điều chỉnh (học "thanh trượt do Claude sinh" của Claude Design) + màu / font thương hiệu đứng đầu.
// Núm = một thanh trượt mức cao (−50…+50 hoặc 0–100) đổi nhiều trường một lúc theo bảng ánh xạ có kiểm. Không DOM, không gọi Claude
// (C23): 71_knobs.js đọc trạng thái element, gọi compute() rồi ghi bản vá. Chạy trong trình duyệt (window.KnobsCore) và Node
// (scripts/tests/s21_knobs.test.mjs).
//
// Bảng núm (JSON, cũng là dạng M149 "Gợi ý núm" nhận từ Claude):
//   [{ id, label, min?, max?, zero?, when?: { field: [giá trị…] }, fields: [
//       { f, op: 'mul', lo, hi }   nhân giá trị gốc: ×lo ở min, ×1 ở zero, ×hi ở max
//       { f, op: 'add', lo, hi }   cộng vào giá trị gốc: +lo ở min, 0 ở zero, +hi ở max
//       { f, op: 'set', lo, hi }   đặt thẳng: lo ở min → hi ở max (giá trị núm ban đầu suy ngược từ giá trị gốc)
//       { f, op: 'step', steps: [[at, v], …] }  bậc: lấy bậc cuối có at ≤ giá trị núm; v = null là giữ giá trị trước đó
//   ] }]
// Trường chỉ được nằm trong danh sách cho phép của loại element (ALLOWED / allowedFor): mỗi trường có kiểu, biên, mặc định.
// `size` (cỡ trên khung) và `dur` (thời lượng hiện) là trường ảo: 71_knobs.js đọc / ghi qua getPos/setPos và setTimes.
'use strict';
(function (root) {
  const STYLE_IDS = ['white', 'yellow', 'clean', 'muted', 'ink', 'fire', 'glow', 'neon', 'dark', 'hl', 'grad_blue', 'grad_teal'];
  const ANIM_IDS = ['pop', 'fade', 'slide_l', 'slide_r', 'drop', 'blur_zoom', 'fly', 'tumble', 'type'];
  const SHAPES = ['rect', 'rounded', 'circle', 'line', 'arrow'];
  const OPS = ['mul', 'add', 'set', 'step'];
  const MAX_KNOBS = 6, MAX_FIELDS = 8, MAX_STEPS = 12;

  const SIZE = (min, max) => ({ t: 'num', min, max, dp: 0, virt: true });
  const DUR = { t: 'num', min: 0.3, max: 30, dp: 2, virt: true };
  const ALLOWED = {
    line: {
      size: SIZE(12, 260), dur: DUR,
      weight: { t: 'num', min: 300, max: 900, step: 100, def: 900 },
      style: { t: 'enum', values: STYLE_IDS, def: 'white' },
      anim: { t: 'enum', values: ANIM_IDS, def: 'pop' },
    },
    sticker: {
      size: SIZE(40, 1200), dur: DUR,
      from: { t: 'enum', values: ['left', 'right', 'up', 'down', 'pop'], def: 'left' },
      bob: { t: 'bool', def: true },
      outline: { t: 'num', min: 0, max: 16, dp: 0, def: 7 },
    },
    scene: { size: SIZE(10, 3000), dur: DUR },
    shape: {
      size: SIZE(10, 3000), dur: DUR,
      opacity: { t: 'num', min: 0.05, max: 1, dp: 2, def: 1 },
      stroke_w: { t: 'num', min: 0, max: 60, dp: 0, def: 0 },
      radius: { t: 'num', min: 0, max: 300, dp: 0, def: 32 },
      shape: { t: 'enum', values: SHAPES, def: 'rect', ro: true },
    },
    hf: {
      size: SIZE(10, 4000), dur: DUR,
      speed: { t: 'num', min: 0.25, max: 3, dp: 2, def: 1 },
    },
  };

  // Bảng núm có sẵn theo loại element.
  const SIZE_KNOB = { id: 'size', label: 'Kích cỡ', min: -50, max: 50, fields: [{ f: 'size', op: 'mul', lo: 0.4, hi: 2.2 }] };
  const TABLES = {
    line: [
      { id: 'pop', label: 'Độ nổi', min: -50, max: 50, fields: [
        { f: 'size', op: 'mul', lo: 0.7, hi: 1.5 },
        { f: 'weight', op: 'step', steps: [[-50, 500], [-30, 700], [-10, null], [20, 900]] },
        { f: 'style', op: 'step', steps: [[-50, 'muted'], [-25, null], [30, 'glow']] },
      ] },
      { id: 'energy', label: 'Năng lượng', min: -50, max: 50, fields: [
        { f: 'anim', op: 'step', steps: [[-50, 'fade'], [-20, null], [20, 'drop'], [38, 'blur_zoom']] },
        { f: 'dur', op: 'mul', lo: 1.5, hi: 0.6 },
      ] },
    ],
    sticker: [
      SIZE_KNOB,
      { id: 'energy', label: 'Năng lượng', min: -50, max: 50, fields: [
        { f: 'from', op: 'step', steps: [[-50, 'up'], [-20, null], [25, 'pop']] },
        { f: 'bob', op: 'step', steps: [[-50, false], [-20, null]] },
        { f: 'dur', op: 'mul', lo: 1.4, hi: 0.65 },
      ] },
    ],
    scene: [
      SIZE_KNOB,
      { id: 'energy', label: 'Năng lượng', min: -50, max: 50, fields: [{ f: 'dur', op: 'mul', lo: 1.4, hi: 0.65 }] },
    ],
    shape: [
      { id: 'density', label: 'Độ đậm', min: -50, max: 50, fields: [
        { f: 'opacity', op: 'add', lo: -0.75, hi: 0.5 },
        { f: 'stroke_w', op: 'add', lo: -20, hi: 12 },
      ] },
      { id: 'radius', label: 'Bo góc', min: -50, max: 50, when: { shape: ['rounded'] }, fields: [{ f: 'radius', op: 'add', lo: -150, hi: 150 }] },
      SIZE_KNOB,
    ],
    hf: [
      SIZE_KNOB,
      { id: 'energy', label: 'Năng lượng', min: -50, max: 50, fields: [{ f: 'speed', op: 'mul', lo: 0.6, hi: 1.6 }] },
    ],
  };

  // Loại bảng núm của một element (comp của studio.js). null = không có núm (clip, phụ đề, âm thanh, sơ đồ…).
  function targetOf(c) {
    if (!c || !c.obj) return null;
    if (c.kind === 'line') return 'line';
    if (c.kind !== 'scene') return null;
    const ty = c.obj.type;
    if (ty === 'shape') return 'shape';
    if (ty === 'hf') return 'hf';
    if (ty === 'sticker') return 'sticker';
    return 'scene';
  }

  const fin = v => typeof v === 'number' && Number.isFinite(v);
  const dpOf = (a, b, d) => (Number.isInteger(a) && Number.isInteger(b) && (d == null || Number.isInteger(d)) && b - a > 10 ? 0 : b - a > 10 ? 1 : 2);
  // Danh sách trường cho phép theo loại; khối HyperFrames thêm biến số có biên trong catalog (vars.<id>, tối đa 4 biến).
  function allowedFor(target, block) {
    const base = ALLOWED[target]; if (!base) return null;
    const out = { ...base };
    if (target === 'hf' && block && Array.isArray(block.vars)) {
      for (const v of block.vars) {
        if (v && v.type === 'number' && fin(v.min) && fin(v.max) && v.max > v.min && /^[\w-]{1,40}$/.test(v.id || ''))
          out['vars.' + v.id] = { t: 'num', min: v.min, max: v.max, dp: dpOf(v.min, v.max, v.def), def: fin(v.def) ? v.def : v.min };
      }
    }
    return out;
  }
  // Bảng núm của element: bảng có sẵn + núm cho từng biến số của khối HyperFrames (0–100, đặt thẳng min…max) + núm của gói style.
  function tableFor(target, opts = {}) {
    const t = TABLES[target]; if (!t) return [];
    const out = t.map(k => ({ ...k }));
    if (target === 'hf' && opts.block) {
      const vars = (opts.block.vars || []).filter(v => v && v.type === 'number' && fin(v.min) && fin(v.max) && v.max > v.min).slice(0, 4);
      for (const v of vars) {
        const lab = opts.varLabel ? opts.varLabel(v) : v.label || v.id;
        out.push({ id: 'v_' + v.id, label: String(lab).slice(0, 24), min: 0, max: 100, fields: [{ f: 'vars.' + v.id, op: 'set', lo: v.min, hi: v.max }] });
      }
    }
    if (Array.isArray(opts.extra) && opts.extra.length) {
      const r = validateMap(opts.extra, allowedFor(target, opts.block));
      for (const k of r.knobs) if (!out.some(x => x.id === k.id) && out.length < MAX_KNOBS + 4) out.push(k);
    }
    return out;
  }

  const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
  const zeroOf = k => (fin(k.zero) ? clampN(k.zero, k.min, k.max) : k.min < 0 && k.max > 0 ? 0 : k.min);
  const lerp = (a, b, t) => a + (b - a) * t;
  function round(spec, v) {
    if (spec.step) return Math.round(v / spec.step) * spec.step;
    const p = 10 ** (spec.dp ?? 2); return Math.round(v * p) / p;
  }
  // Ép một giá trị về đúng kiểu / biên của trường; sai kiểu thì trả `prev` (không ghi bừa).
  function fit(spec, v, prev) {
    if (!spec) return prev;
    if (spec.t === 'num') return fin(v) ? round(spec, clampN(v, spec.min, spec.max)) : prev;
    if (spec.t === 'enum') return spec.values.includes(v) ? v : prev;
    if (spec.t === 'bool') return typeof v === 'boolean' ? v : prev;
    return prev;
  }
  // Hai nửa quanh zero: min…zero nội suy lo…trung tính, zero…max nội suy trung tính…hi.
  function bend(k, v, lo, mid, hi) {
    const z = zeroOf(k);
    if (v <= z) return z === k.min ? mid : lerp(mid, lo, (z - v) / (z - k.min));
    return z === k.max ? mid : lerp(mid, hi, (v - z) / (k.max - z));
  }
  function applyField(fl, k, v, cur) {
    if (fl.op === 'mul') return fin(cur) ? cur * bend(k, v, fl.lo, 1, fl.hi) : cur;
    if (fl.op === 'add') return fin(cur) ? cur + bend(k, v, fl.lo, 0, fl.hi) : cur;
    if (fl.op === 'set') return lerp(fl.lo, fl.hi, (v - k.min) / (k.max - k.min));
    if (fl.op === 'step') { let out = cur; for (const [at, val] of fl.steps) if (v >= at) out = val === null ? cur : val; return out; }
    return cur;
  }
  const effective = (allowed, raw) => {
    const st = {};
    for (const [f, spec] of Object.entries(allowed || {})) st[f] = raw && raw[f] != null ? raw[f] : spec.def;
    return st;
  };
  const applies = (k, st) => !k.when || Object.entries(k.when).every(([f, vals]) => Array.isArray(vals) && vals.includes(st[f]));

  // Trạng thái sau khi áp mọi núm (theo thứ tự bảng) lên giá trị gốc. raw: giá trị gốc thô (null = trường chưa đặt → mặc định).
  function compute(knobs, values, raw, allowed) {
    const st = effective(allowed, raw);
    for (const k of knobs || []) {
      if (!applies(k, st)) continue;
      const v = clampN(fin(values?.[k.id]) ? values[k.id] : zeroOf(k), k.min, k.max);
      // Núm 'set' chưa rời vị trí suy ngược từ gốc thì không ghi (tránh làm tròn trôi giá trị gốc, ví dụ 68,5 → 69).
      if (k.fields[0]?.op === 'set' && v === initValue(k, raw, allowed)) continue;
      for (const fl of k.fields) {
        const spec = allowed[fl.f]; if (!spec || spec.ro) continue;
        st[fl.f] = fit(spec, applyField(fl, k, v, st[fl.f]), st[fl.f]);
      }
    }
    return st;
  }
  // Núm hiện được với trạng thái gốc (điều kiện when, ví dụ Bo góc chỉ cho hình bo góc).
  const visibleKnobs = (knobs, raw, allowed) => { const st = effective(allowed, raw); return (knobs || []).filter(k => applies(k, st)); };
  // Trường mà bảng núm được đổi (bỏ trường chỉ đọc).
  const fieldsOf = (knobs, allowed) => [...new Set((knobs || []).flatMap(k => k.fields.map(f => f.f)))].filter(f => allowed[f] && !allowed[f].ro);
  // Bản vá { trường: giá trị | null (xoá) } cho các trường núm đổi; trường chưa đặt mà vẫn bằng mặc định thì xoá cho JSON gọn.
  function patchOf(knobs, values, raw, allowed) {
    const st = compute(knobs, values, raw, allowed), out = {};
    for (const f of fieldsOf(knobs, allowed)) {
      const spec = allowed[f];
      out[f] = !spec.virt && (raw?.[f] == null) && st[f] === spec.def ? null : st[f];
    }
    return out;
  }
  // Giá trị núm ban đầu: núm 'set' suy ngược từ giá trị gốc của trường đầu; còn lại là zero.
  function initValue(k, raw, allowed) {
    const fl = k.fields[0], st = effective(allowed, raw);
    if (fl && fl.op === 'set' && fin(st[fl.f]) && fl.hi !== fl.lo)
      return Math.round(clampN(k.min + (st[fl.f] - fl.lo) / (fl.hi - fl.lo) * (k.max - k.min), k.min, k.max));
    return zeroOf(k);
  }
  // Trạng thái hiện có còn khớp với (gốc, giá trị núm) đã lưu không; lệch (người dùng sửa tay ở mục khác) thì lấy lại gốc.
  function inSync(knobs, values, raw, allowed, now) {
    const st = compute(knobs, values, raw, allowed);
    return fieldsOf(knobs, allowed).every(f => {
      const a = st[f], b = now?.[f] != null ? now[f] : allowed[f].def;
      return fin(a) && fin(b) ? Math.abs(a - b) <= Math.max(0.011, Math.abs(a) * 0.01) : a === b;
    });
  }

  // Kiểm một bảng núm lạ (JSON từ gói style hoặc từ Claude ở M149): chỉ trường cho phép, kiểu đúng, số hữu hạn, có giới hạn số lượng.
  // Trả { ok, knobs (đã làm sạch), errors }. Núm hỏng bị bỏ cả núm; trường hỏng bị bỏ, núm không còn trường nào cũng bị bỏ.
  function validateMap(map, allowed) {
    const errors = [], knobs = [];
    const list = Array.isArray(map) ? map : map && Array.isArray(map.knobs) ? map.knobs : null;
    if (!allowed) return { ok: false, knobs, errors: ['element này không có núm'] };
    if (!list) return { ok: false, knobs, errors: ['cần một mảng núm (hoặc { knobs: [...] })'] };
    if (list.length > MAX_KNOBS) errors.push(`nhiều hơn ${MAX_KNOBS} núm, bỏ phần thừa`);
    const ids = new Set();
    list.slice(0, MAX_KNOBS).forEach((k, i) => {
      const at = `núm ${i + 1}`;
      if (!k || typeof k !== 'object') return errors.push(`${at}: không phải đối tượng`);
      const id = String(k.id ?? '');
      if (!/^[a-z][\w-]{0,30}$/i.test(id) || ids.has(id)) return errors.push(`${at}: id "${id}" sai hoặc trùng`);
      const label = typeof k.label === 'string' ? k.label.trim().slice(0, 24) : '';
      if (!label) return errors.push(`${at}: thiếu nhãn`);
      const min = k.min ?? -50, max = k.max ?? 50;
      if (!fin(min) || !fin(max) || min >= max || min < -100 || max > 100) return errors.push(`${at}: biên ${min}…${max} sai (trong −100…100)`);
      if (!Array.isArray(k.fields) || !k.fields.length) return errors.push(`${at}: thiếu fields`);
      const fields = [];
      for (const fl of k.fields.slice(0, MAX_FIELDS)) {
        const spec = fl && allowed[fl.f];
        if (!spec || spec.ro) { errors.push(`${at}: trường "${fl?.f}" không được phép`); continue; }
        if (!OPS.includes(fl.op)) { errors.push(`${at}: phép "${fl.op}" sai`); continue; }
        if (fl.op === 'step') {
          const steps = Array.isArray(fl.steps) ? fl.steps.slice(0, MAX_STEPS).filter(s => Array.isArray(s) && fin(s[0]) && (s[1] === null || fit(spec, s[1], undefined) === s[1])) : [];
          if (!steps.length) { errors.push(`${at}: bậc của "${fl.f}" sai kiểu`); continue; }
          fields.push({ f: fl.f, op: 'step', steps: steps.map(s => [s[0], s[1]]).sort((a, b) => a[0] - b[0]) });
        } else {
          if (spec.t !== 'num' || !fin(fl.lo) || !fin(fl.hi)) { errors.push(`${at}: "${fl.f}" cần lo / hi là số`); continue; }
          if (fl.op === 'mul' && (fl.lo < 0 || fl.hi < 0 || fl.lo > 10 || fl.hi > 10)) { errors.push(`${at}: hệ số nhân của "${fl.f}" ngoài 0…10`); continue; }
          const span = spec.max - spec.min;
          if (fl.op === 'add' && (Math.abs(fl.lo) > span || Math.abs(fl.hi) > span)) { errors.push(`${at}: mức cộng của "${fl.f}" quá lớn`); continue; }
          const lo = fl.op === 'set' ? clampN(fl.lo, spec.min, spec.max) : fl.lo, hi = fl.op === 'set' ? clampN(fl.hi, spec.min, spec.max) : fl.hi;
          fields.push({ f: fl.f, op: fl.op, lo, hi });
        }
      }
      if (!fields.length) return errors.push(`${at}: không còn trường hợp lệ`);
      const out = { id, label, min, max, fields };
      if (fin(k.zero)) out.zero = clampN(k.zero, min, max);
      if (k.when && typeof k.when === 'object' && !Array.isArray(k.when)) {
        const when = {};
        for (const [f, vals] of Object.entries(k.when)) if (allowed[f] && Array.isArray(vals)) when[f] = vals.filter(v => fit(allowed[f], v, undefined) === v).slice(0, 12);
        if (Object.keys(when).length) out.when = when;
      }
      ids.add(id); knobs.push(out);
    });
    return { ok: !errors.length && knobs.length > 0, knobs, errors };
  }

  // ---- Thương hiệu trước tiên (ô màu, ô font của Thuộc tính và thanh nổi) ----
  const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  const CLABEL = { primary: 'Màu chính', accent: 'Màu nhấn', dark: 'Màu tối', light: 'Màu sáng' };
  // Màu của TL.brand (bộ đang dùng), bỏ trùng và bỏ giá trị không phải #hex. Rỗng = chưa có thương hiệu → ô màu như cũ.
  function brandColors(brand) {
    const seen = new Set(), out = [];
    for (const k of Object.keys(CLABEL)) {
      const v = typeof brand?.[k] === 'string' ? brand[k].trim() : '';
      if (!HEX.test(v)) continue;
      const u = v.length === 4 ? '#' + [...v.slice(1)].map(c => c + c).join('').toUpperCase() : v.toUpperCase();
      if (seen.has(u)) continue; seen.add(u); out.push({ k, v: u, label: CLABEL[k] });
    }
    return out;
  }
  // Font của bộ thương hiệu (font tiêu đề trước, font chữ sau) thành [giá trị, nhãn]; chỉ nhận chuỗi font-family an toàn.
  const FONT_OK = /^[\w\s"',.-]{1,80}$/u;
  const family = v => String(v).split(',')[0].replace(/["']/g, '').trim();
  function brandFonts(brand) {
    const out = [];
    for (const [k, tag] of [['disp', 'tiêu đề'], ['font', 'chữ']]) {
      const v = typeof brand?.[k] === 'string' ? brand[k].trim() : '';
      if (!v || !FONT_OK.test(v) || /var\(|url\(|;/.test(v)) continue;
      // Engine chèn font của element vào thuộc tính style viết bằng ngoặc kép → đổi ngoặc kép thành ngoặc đơn như FONTS của Studio.
      const val = v.replace(/"/g, "'");
      if (!out.some(x => x[0] === val)) out.push([val, `${family(v)} · ${tag}`]);
    }
    return out;
  }
  // Danh sách <option> của ô font: có font thương hiệu thì nhóm "Thương hiệu" đứng đầu, rồi nhóm "Tất cả font" như cũ.
  function fontOptions(fonts, brand, cur, esc) {
    const e = esc || (s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]));
    const o = list => list.map(([v, l]) => `<option value="${e(v)}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${e(l)}</option>`).join('');
    const b = brandFonts(brand);
    if (!b.length) return o(fonts);
    return `<optgroup label="Thương hiệu">${o(b)}</optgroup><optgroup label="Tất cả font">${o(fonts)}</optgroup>`;
  }

  const T = { STYLE_IDS, ANIM_IDS, ALLOWED, TABLES, MAX_KNOBS, targetOf, allowedFor, tableFor, compute, patchOf, fieldsOf, visibleKnobs, initValue, inSync, zeroOf,
    validateMap, brandColors, brandFonts, fontOptions };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.KnobsCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
