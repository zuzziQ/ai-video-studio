// S29 M212: nướng sẵn bằng ffmpeg (C39, mục 5a của docs/plans/S28-edit-kieu-capcut.md) — phông xanh, LUT .cube, HSL, curves,
// ổn định hình biến chuỗi khung của đoạn in–out thành chuỗi mới; engine chỉ đổi chuỗi ảnh, không thêm mã dựng hình.
// Hàm thuần dùng chung cho engine (engine.js srcFrame), Studio (studio/features/86_bake.js), route (studio/routes/86_bake.mjs),
// job nền `bake` (scripts/bake_job.mjs qua scripts/queue.mjs) và test Node (scripts/tests/s29_bake.test.mjs).
//   clip.bake = { chroma?, lut?, hsl?, curves?, stab?,   ← tham số người dùng (Thuộc tính clip → Hiệu chỉnh)
//                 seq?, hash?, p540? }                    ← kết quả job: chuỗi nướng .studio/bake/<hash>/%05d.jpg|png
// hash = tham số đã chuẩn hoá + chuỗi nguồn + khoảng khung: đổi tham số hay in / out là hash khác → engine bỏ chuỗi cũ,
// đọc chuỗi gốc kèm CSS gần đúng (approxCss) tới khi nướng xong. Số khung của chuỗi nướng trùng số khung gốc (n0…n1);
// ngoài khoảng đó, hay ảnh nướng lỗi, đọc chuỗi gốc (không trắng khung).
(function (root) {
  'use strict';
  const DIR = '.studio/bake', OK = '.ok', V = 2; // V 2: sửa trộn LUT bị đảo + strength của HSL → hash mới, chuỗi nướng cũ được nướng lại
  const num = (v, a, b, d = 0) => { const x = +v; return Number.isFinite(x) ? Math.min(b, Math.max(a, x)) : d; };
  const r2 = v => Math.round(v * 100) / 100;
  const HEX = /^#[0-9a-f]{6}$/i;
  const BANDS = ['all', 'r', 'y', 'g', 'c', 'b', 'm'];
  const BAND_VI = { all: 'Mọi màu', r: 'Đỏ', y: 'Vàng', g: 'Xanh lục', c: 'Xanh lơ', b: 'Xanh lam', m: 'Tím' };
  // preset của bộ lọc curves trong ffmpeg
  const CURVES = ['none', 'lighter', 'darker', 'increase_contrast', 'medium_contrast', 'strong_contrast', 'linear_contrast', 'vintage', 'cross_process', 'color_negative', 'negative'];
  const CURVES_VI = { none: 'Không', lighter: 'Sáng hơn', darker: 'Tối hơn', increase_contrast: 'Tăng tương phản', medium_contrast: 'Tương phản vừa', strong_contrast: 'Tương phản mạnh',
    linear_contrast: 'Tương phản đều', vintage: 'Cổ điển', cross_process: 'Cross process', color_negative: 'Âm bản màu', negative: 'Âm bản' };
  const LUT_FILE = /^\.studio\/bake\/luts\/[0-9a-f]{12,40}\.cube$/;

  // tham số đã kẹp, chỉ thao tác có tác dụng; không còn gì → null (clip không cần nướng)
  function ops(b) {
    if (!b || typeof b !== 'object') return null;
    const o = {};
    const k = b.chroma;
    if (k && HEX.test(k.color || '')) o.chroma = { color: k.color.toLowerCase(), strength: Math.round(num(k.strength, 0, 100, 40)), edge: Math.round(num(k.edge, 0, 100, 10)), spill: Math.round(num(k.spill, 0, 100, 50)) };
    const l = b.lut;
    if (l && LUT_FILE.test(l.file || '')) o.lut = { file: l.file, mix: Math.round(num(l.mix, 0, 100, 100)) };
    if (o.lut && !o.lut.mix) delete o.lut;
    const h = b.hsl;
    if (h) {
      const x = { band: BANDS.includes(h.band) ? h.band : 'all', hue: Math.round(num(h.hue, -180, 180)), sat: Math.round(num(h.sat, -100, 100)), light: Math.round(num(h.light, -100, 100)) };
      if (x.hue || x.sat || x.light) o.hsl = x;
    }
    const c = b.curves;
    if (c) {
      const x = { preset: CURVES.includes(c.preset) ? c.preset : 'none', shadows: Math.round(num(c.shadows, -50, 50)), highlights: Math.round(num(c.highlights, -50, 50)) };
      if (x.preset !== 'none' || x.shadows || x.highlights) o.curves = x;
    }
    const s = b.stab;
    if (s && num(s.strength, 0, 100) > 0) o.stab = { strength: Math.round(num(s.strength, 0, 100)) };
    return Object.keys(o).length ? o : null;
  }

  // khoảng khung gốc (đánh số từ 1) của đoạn in–out đang dùng; ảnh tĩnh / không phải chuỗi → null
  function range(c, tlFps = 30) {
    if (!c || !c.src || typeof c.src !== 'object' || typeof c.src.seq !== 'string') return null;
    const fps = c.src.fps || tlFps, a = Math.max(0, +c.in || 0), b = c.out != null ? +c.out : a + 3;
    const n0 = Math.max(1, Math.floor(a * fps + 1e-6) + 1), n1 = Math.min(c.src.count || 1e9, Math.max(n0, Math.floor(b * fps + 1e-6) + 1));
    return { seq: c.src.seq, fps, n0, n1 };
  }

  // FNV-1a 32 bit, hai hạt giống → 16 hex (đồng bộ, chạy được trong engine lẫn Node)
  function fnv(s, h) { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  const hex8 = h => ('0000000' + h.toString(16)).slice(-8);
  const hashOf = str => hex8(fnv(str, 2166136261)) + hex8(fnv(str, 0x811c9dc5 ^ 0x5bd1e995));
  // tên khoá JSON theo thứ tự cố định (ops() luôn dựng cùng thứ tự) → chuỗi giống nhau thì hash giống nhau
  function spec(c, tlFps = 30) {
    const o = ops(c && c.bake), r = range(c, tlFps);
    if (!o || !r) return null;
    const hash = hashOf(JSON.stringify({ v: V, seq: r.seq, n0: r.n0, n1: r.n1, ops: o }));
    const ext = o.chroma ? 'png' : 'jpg';
    return { ...r, ops: o, hash, ext, out: `${DIR}/${hash}/%05d.${ext}` };
  }
  const cache = typeof WeakMap === 'function' ? new WeakMap() : null;
  // chuỗi engine đọc cho clip c: { seq, n0, n1, p540 } khi chuỗi nướng khớp tham số hiện tại, không thì null
  function active(c, tlFps = 30) {
    const b = c && c.bake;
    if (!b || typeof b.seq !== 'string' || !b.hash) return null;
    let s = cache && cache.get(b);
    const k = JSON.stringify([b, c.in, c.out, c.src && c.src.seq, tlFps]);
    if (!s || s.k !== k) { s = { k, v: spec(c, tlFps) }; if (cache) cache.set(b, s); }
    const sp = s.v;
    return sp && sp.hash === b.hash && sp.out === b.seq ? { seq: b.seq, n0: sp.n0, n1: sp.n1, p540: !!b.p540 } : null;
  }
  // trạng thái cho Studio: 'none' (không có thao tác) | 'ready' | 'stale' (cần nướng / đang nướng)
  const state = (c, tlFps) => (!ops(c && c.bake) || !range(c, tlFps) ? 'none' : active(c, tlFps) ? 'ready' : 'stale');

  // CSS xem gần đúng khi chưa có chuỗi nướng khớp (lúc kéo thanh, đang nướng): HSL + curves; phông xanh, LUT, ổn định thì không
  // force = bỏ qua kiểm chuỗi nướng (engine: chuỗi nướng có nhưng ảnh lỗi)
  function approxCss(c, tlFps, force = false) {
    const o = ops(c && c.bake);
    if (!o || (!force && active(c, tlFps))) return '';
    const f = [];
    if (o.hsl) {
      const w = o.hsl.band === 'all' ? 1 : 0.35; // một dải màu: CSS chỉ đổi được cả ảnh, nên nhẹ tay
      if (o.hsl.hue) f.push(`hue-rotate(${Math.round(o.hsl.hue * w)}deg)`);
      if (o.hsl.sat) f.push(`saturate(${r2(1 + (o.hsl.sat / 100) * w)})`);
      if (o.hsl.light) f.push(`brightness(${r2(1 + (o.hsl.light / 200) * w)})`);
    }
    if (o.curves) {
      const p = o.curves.preset, CON = { increase_contrast: 1.15, medium_contrast: 1.25, strong_contrast: 1.45, linear_contrast: 1.2 };
      if (CON[p]) f.push(`contrast(${CON[p]})`);
      if (p === 'lighter') f.push('brightness(1.12)');
      if (p === 'darker') f.push('brightness(.88)');
      if (p === 'vintage') f.push('sepia(.35) contrast(.95)');
      if (p === 'negative' || p === 'color_negative') f.push('invert(1)');
      const sh = o.curves.shadows / 100, hi = o.curves.highlights / 100;
      if (sh || hi) f.push(`brightness(${r2(1 + (sh + hi) / 3)}) contrast(${r2(1 + (hi - sh) / 2)})`);
    }
    return f.join(' ');
  }

  // ---------- ffmpeg ----------
  // -vf của một bộ thao tác. w, h = cỡ khung gốc (ổn định hình phóng nhẹ để giấu mép); lut = đường dẫn tương đối (cwd = thư mục dự án)
  function vf(o, { w = 0, h = 0 } = {}) {
    const f = [];
    if (o.stab) {
      const s = o.stab.strength / 100, r = 16 * (1 + Math.round(s * 3)), z = 1 + s * 0.08;
      f.push(`deshake=rx=${r}:ry=${r}:edge=clamp`);
      if (w && h) f.push(`crop=${Math.round(w / z / 2) * 2}:${Math.round(h / z / 2) * 2}`, `scale=${w}:${h}`);
    }
    if (o.chroma) {
      const k = o.chroma, sim = r2(0.02 + (k.strength / 100) * 0.38), bl = r2((k.edge / 100) * 0.25);
      f.push(`chromakey=color=0x${k.color.slice(1)}:similarity=${sim}:blend=${bl}`);
      if (k.spill) {
        const R = parseInt(k.color.slice(1, 3), 16), B = parseInt(k.color.slice(5, 7), 16), G = parseInt(k.color.slice(3, 5), 16);
        f.push('format=rgba', `despill=type=${B > G && B > R ? 'blue' : 'green'}:mix=${r2(k.spill / 100)}:expand=0`);
      }
    }
    if (o.lut) {
      const lut = `lut3d=file=${o.lut.file}:interp=tetrahedral`;
      if (o.lut.mix >= 100) f.push(lut);
      // blend: đầu vào thứ nhất là lớp trên, all_opacity là phần của lớp trên → LUT ([bk2]) phải đứng trước, mix 90 = 90% LUT
      else f.push(`split[bk0][bk1];[bk1]${lut}[bk2];[bk2][bk0]blend=all_mode=normal:all_opacity=${r2(o.lut.mix / 100)}`);
    }
    // strength mặc định của huesaturation là 1 (thang 0–100): gần như không đổi ảnh. 10 cho hue / sat / sáng cùng tầm với CSS xem
    // trước của approxCss (hue-rotate, saturate, brightness); đo trên khung thật, cao hơn thì intensity tăng vọt
    if (o.hsl) f.push(`huesaturation=hue=${o.hsl.hue}:saturation=${r2(o.hsl.sat / 100)}:intensity=${r2(o.hsl.light / 100)}:colors=${o.hsl.band === 'all' ? 'a' : o.hsl.band}:strength=10`);
    if (o.curves) {
      const c = o.curves, sh = r2(Math.min(1, Math.max(0, 0.25 + c.shadows / 200))), hi = r2(Math.min(1, Math.max(0, 0.75 + c.highlights / 200)));
      const m = c.shadows || c.highlights ? `master='0/0 0.25/${sh} 0.75/${hi} 1/1'` : '';
      f.push(`curves=${[c.preset !== 'none' ? `preset=${c.preset}` : '', m].filter(Boolean).join(':')}`);
    }
    f.push(o.chroma ? 'format=rgba' : 'format=yuvj420p');
    return f.join(',');
  }
  // lệnh ffmpeg (đường dẫn tương đối theo thư mục dự án): chuỗi gốc n0…n1 → outPat, giữ số khung gốc
  function ffArgs(sp, outPat, dims = {}) {
    return ['-v', 'error', '-y', '-start_number', String(sp.n0), '-i', sp.seq, '-frames:v', String(sp.n1 - sp.n0 + 1),
      '-vf', vf(sp.ops, dims), ...(sp.ext === 'png' ? ['-compression_level', '3'] : ['-q:v', '3']), '-start_number', String(sp.n0), outPat];
  }
  // tóm tắt cho Claude / thẻ: "Phông xanh, LUT 80%, HSL"
  function label(o) {
    if (!o) return '';
    return [o.chroma && 'Phông xanh', o.lut && `LUT${o.lut.mix < 100 ? ' ' + o.lut.mix + '%' : ''}`, o.hsl && `HSL ${BAND_VI[o.hsl.band].toLowerCase()}`,
      o.curves && `Đường cong${o.curves.preset !== 'none' ? ' ' + CURVES_VI[o.curves.preset].toLowerCase() : ''}`, o.stab && 'Ổn định hình'].filter(Boolean).join(', ');
  }
  // .cube hợp lệ: có LUT_3D_SIZE 2–65 và đủ dòng số (size³)
  function cubeOk(text) {
    if (typeof text !== 'string' || text.length > 8e6) return false;
    const m = /^\s*LUT_3D_SIZE\s+(\d+)\s*$/m.exec(text), n = m ? +m[1] : 0;
    if (n < 2 || n > 65) return false;
    let rows = 0;
    for (const l of text.split(/\r?\n/)) if (/^\s*-?[\d.]+(e[-+]?\d+)?\s+-?[\d.]+(e[-+]?\d+)?\s+-?[\d.]+(e[-+]?\d+)?\s*$/i.test(l)) rows++;
    return rows === n * n * n;
  }

  const api = { DIR, OK, V, BANDS, BAND_VI, CURVES, CURVES_VI, LUT_FILE, ops, range, hashOf, spec, active, state, approxCss, vf, ffArgs, label, cubeOk };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BakeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
