// S29 M208: màu — cường độ LUT, Adjust mới, áp cho b-roll / ảnh phủ / khối Điều chỉnh, Claude chọn màu.
// Timeline cũ (filter không cường độ, chỉ trường cũ) phải dựng ra y hệt: so chuỗi filter với bản chép đông cứng của engine.js /
// studio/clips.js trước M208 trên mọi tổ hợp trường cũ.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';

const req = createRequire(import.meta.url);
const FX = req('../../engine/fx_registry.js');
const AC = req('../../studio/features/75_ask.core.js');
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---- bản chép đông cứng trước M208 (đừng sửa: đây là "hình cũ") ----
const OLD_LUT = FX.lutCss();
function oldClipFilter(c) {
  const f = c.filter || {};
  let s = f.preset ? OLD_LUT[f.preset] || '' : '';
  if (f.brightness != null) s += ` brightness(${f.brightness})`;
  if (f.contrast != null) s += ` contrast(${f.contrast})`;
  if (f.saturate != null) s += ` saturate(${f.saturate})`;
  if (f.hue) s += ` hue-rotate(${f.hue}deg)`;
  if (f.temp) s += f.temp > 0 ? ` sepia(${(f.temp * .5).toFixed(2)})` : ` hue-rotate(${(f.temp * 25).toFixed(0)}deg)`;
  if (f.blur) s += ` blur(${f.blur}px)`;
  return s;
}
function oldClipFilterCss(c) {
  const f = c?.filter || {};
  let s = f.preset ? OLD_LUT[f.preset] || '' : '';
  if (f.brightness != null) s += ` brightness(${f.brightness})`;
  if (f.contrast != null) s += ` contrast(${f.contrast})`;
  if (f.saturate != null) s += ` saturate(${f.saturate})`;
  if (f.hue) s += ` hue-rotate(${f.hue}deg)`;
  if (f.temp) s += f.temp > 0 ? ` sepia(${(f.temp * .5).toFixed(2)})` : ` hue-rotate(${(f.temp * 25).toFixed(0)}deg)`;
  return s || 'none';
}
// các bộ filter cũ: mọi preset (kể cả lạ / rỗng) × vài giá trị trường cũ
function* oldFilters() {
  yield undefined; yield {};
  const presets = [undefined, '', 'nope', ...FX.ids('lut')];
  const vals = { brightness: [undefined, 1, 1.23, .5], contrast: [undefined, .87], saturate: [undefined, 0, 1.7], hue: [undefined, 0, -35, 120], temp: [undefined, 0, .4, -.6, 1], blur: [undefined, 0, 2.5] };
  let i = 0;
  for (const preset of presets) for (const b of vals.brightness) for (const t of vals.temp) {
    const k = i++;
    const f = { preset, brightness: b, temp: t, contrast: vals.contrast[k % 2], saturate: vals.saturate[k % 3], hue: vals.hue[k % 4], blur: vals.blur[k % 3] };
    for (const n of Object.keys(f)) if (f[n] === undefined) delete f[n];
    yield f;
  }
}

test('timeline cũ: filter của clip / thumbnail Studio đúng chuỗi cũ, không thêm lớp phủ', () => {
  let n = 0;
  for (const f of oldFilters()) {
    const c = f === undefined ? {} : { filter: f };
    assert.equal(FX.colorFx(c.filter).filter, oldClipFilter(c), JSON.stringify(f));
    assert.equal(FX.colorCss(c.filter, { blur: false }) || 'none', oldClipFilterCss(c), JSON.stringify(f));
    assert.equal(FX.colorFx(c.filter, { t: 3.3 }).over, '', 'trường cũ không phủ gì');
    n++;
  }
  assert.ok(n > 100);
  // engine.js / clips.js không còn tự chép LUT hay công thức màu
  const eng = read('engine/engine.js'), clips = read('studio/clips.js');
  assert.doesNotMatch(eng, /LUT\[f\.preset\]|FX\.lutCss\(\)/);
  assert.doesNotMatch(clips, /LUT_CSS\[f\.preset\]|brightness\(\$\{f\.brightness\}\)/);
  assert.match(clips, /FX\.colorCss\(c\?\.filter, \{ blur: false \}\)/);
});

test('cường độ LUT 0–100: 100 (hoặc thiếu) = chuỗi cũ, 0 = gốc, giữa = nội suy về trung tính', () => {
  for (const x of FX.LUT) {
    assert.equal(x.fn(1), x.css); assert.equal(x.fn(), x.css); assert.equal(FX.lutAt(x.id, 1.5), x.css);
    assert.equal(FX.lutAt(x.id, 0), '');
    assert.equal(FX.colorFx({ preset: x.id, strength: 0 }).filter, '');
    const half = FX.lutAt(x.id, .5), full = x.css.match(/[a-z-]+\(/g);
    assert.deepEqual(half.match(/[a-z-]+\(/g), full, `${x.id}: giữ thứ tự hàm`);
    assert.doesNotMatch(half, /NaN|undefined/);
  }
  assert.equal(FX.lutAt('warm', .5), 'sepia(0.11) saturate(1.1) hue-rotate(-4deg)');
  assert.equal(FX.lutAt('night', .25), 'brightness(0.95) saturate(1.05) hue-rotate(48.75deg) contrast(1.025)');
  assert.equal(FX.colorFx({ preset: 'warm', strength: 50 }).filter, FX.lutAt('warm', .5));
  assert.equal(FX.lutAt('nope', .5), '');
});

test('Adjust mới: phơi sáng, fade bằng CSS; vùng sáng / tối, nét bằng SVG; vignette, hạt phủ; hàm thuần theo t', () => {
  const f = { exposure: .5, fade: .4, highlights: -.5, shadows: .6, sharpen: .5, vignette: .7, grain: .5 };
  const a = FX.colorFx(f, { t: 1.37 }), b = FX.colorFx(f, { t: 1.37 });
  assert.deepEqual(a, b);
  assert.match(a.filter, /brightness\(1\.4142\)/);
  assert.match(a.filter, /contrast\(0\.88\) brightness\(1\.024\) saturate\(0\.94\)/);
  const id = a.filter.match(/url\(#([\w]+)\)/)[1];
  assert.match(a.defs, new RegExp(`<filter id="${id}"`));
  assert.match(a.defs, /<feComponentTransfer><feFuncR type="table" tableValues="0 [\d. ]+ 1"\/>/);
  assert.match(a.defs, /<feConvolveMatrix order="3" kernelMatrix="0 -0\.4 0 -0\.4 2\.6 -0\.4 0 -0\.4 0"/);
  assert.ok(a.over.startsWith(a.defs), 'defs đi cùng lớp phủ');
  assert.match(a.over, /radial-gradient/); assert.match(a.over, /mix-blend-mode:overlay/);
  assert.equal((a.over.match(/pointer-events:none/g) || []).length, 2, 'lớp phủ không chặn bấm chọn');
  assert.doesNotMatch(a.over + a.filter, /NaN|undefined|animation|@keyframes/);
  // hạt đổi theo số khung, giữ nguyên trong một khung (24 / s)
  const g = t => FX.colorFx({ grain: .5 }, { t }).over;
  assert.equal(g(1), g(1 + 1 / 48)); assert.notEqual(g(1), g(1.2));
  // bảng tông: hai đầu giữ nguyên, vùng tối nâng lên khi shadows > 0
  const tv = FX.colorFx({ shadows: .8 }).defs.match(/tableValues="([^"]+)"/)[1].split(' ').map(Number);
  assert.equal(tv[0], 0); assert.equal(tv[10], 1); assert.ok(tv[3] > .3);
  // svg: false (thumbnail, module tự vẽ a-roll) → không url(#…) mồ côi
  assert.doesNotMatch(FX.colorCss(f), /url\(/);
  assert.equal(FX.colorFx({ sharpen: .3 }).filter.trim().startsWith('url(#'), true);
});

test('mix (cường độ khối Điều chỉnh) kéo cả bộ về trung tính; colorClean kẹp dữ liệu lạ', () => {
  const f = { preset: 'vivid', strength: 80, brightness: 1.3, exposure: .6, vignette: .8 };
  const z = FX.colorFx(f, { mix: 0 });
  assert.equal(z.over, '');
  assert.doesNotMatch(z.filter, /vivid|saturate\(1\.45\)/);
  assert.equal(z.filter.trim(), 'brightness(1)');
  assert.match(FX.colorFx(f, { mix: .5 }).filter, /^saturate\(1\.18\) contrast\(1\.04\) brightness\(1\.15\) brightness\(1\.2311\)$/);
  assert.deepEqual(FX.colorClean({ preset: 'film', strength: 140, exposure: 9, hue: -999, fade: 0, brightness: 1, junk: 5, grain: 'x' }),
    { preset: 'film', strength: 100, exposure: 1, hue: -180 });
  assert.deepEqual(FX.colorClean({ preset: 'zzz', strength: 50 }), {}, 'không preset → bỏ strength');
  assert.deepEqual(FX.colorClean(null), {});
  assert.equal(FX.ADJ.length, 13);
  for (const a of FX.ADJ) assert.ok(a.label && a.min < a.max && a.def >= a.min && a.def <= a.max, a.id);
  assert.match(FX.colorGuide(), /warm \(ấm\)/); assert.match(FX.colorGuide(), /highlights vùng sáng/);
});

test('khối Điều chỉnh (TL.efx type adjust): áp filter + phủ lên mọi lớp; không bộ màu = không làm gì', () => {
  const d = FX.get('fx', 'adjust');
  assert.ok(d && d.color && d.group === 'color' && Object.keys(d.params).length <= 3);
  const b = { type: 'adjust', start: 2, end: 5, params: {}, filter: { preset: 'bw', strength: 60, vignette: .5, shadows: .3 } };
  const r = FX.fxApply([b], 3, '<p data-cid="s1">x</p>');
  assert.match(r.fl, /grayscale\(0\.6\) contrast\(1\.09\)/);
  assert.match(r.fl, /url\(#avscg/); assert.match(r.over, /<filter id="avscg/); assert.match(r.over, /radial-gradient/);
  assert.equal(r.html, '<p data-cid="s1">x</p>');
  const off = FX.fxApply([{ ...b, params: { intensity: 0 } }], 3, '<p>x</p>');
  assert.equal(off.fl.trim(), ''); assert.equal(off.over, '');
  const none = FX.fxApply([{ type: 'adjust', start: 0, end: 1, params: {} }], .5, '<p>x</p>');
  assert.equal(none.fl + none.over + none.tr, '');
});

// engine.js: colorWrap (b-roll / ảnh phủ có s.filter) và colorOver (hộp clip) chạy trong vm
const eng = read('engine/engine.js');
const SNIP = eng.match(/\nconst clipFilter = [\s\S]*?\n}\n/)[0];
const E = (() => { const c = vm.createContext({ FX }); vm.runInContext(SNIP + ';globalThis.__E = { clipFilter, colorOver, colorWrap };', c); return c.__E; })();

test('engine: b-roll / ảnh phủ có filter được lọc; phủ một lần ở lớp trên; thẻ chỉ lọc; không filter thì y nguyên', () => {
  assert.match(eng, /if \(s\.filter && ANIM_SCENES\.has\(s\.type\)\) colorWrap\(s, r, t\);/);
  assert.match(eng, /filter:\$\{gradeBase\(t\)\} \$\{extraFilter\}">\$\{colorOver\(c, t\)\}`;\n  const bg =/);
  assert.equal(E.colorOver({}, 1), '');
  assert.equal(E.colorOver({ filter: { preset: 'warm', brightness: 1.1 } }, 1), '', 'trường cũ: hộp clip y nguyên');
  assert.match(E.colorOver({ filter: { grain: .4 } }, 1), /mix-blend-mode:overlay/);
  const s = { type: 'broll', filter: { preset: 'film', vignette: .5 } }, r = { back: '<B data-cid="b">', front: '<F data-cid="f">' };
  E.colorWrap(s, r, 1);
  assert.match(r.back, /^<div class="full" style="filter:sepia\(\.3\)[^"]*"><B data-cid="b"><\/div>$/, 'back: chỉ lọc');
  assert.match(r.front, /^<div class="full" style="filter:[^"]+"><F data-cid="f"><\/div><div class="full" style="pointer-events:none;background:radial/);
  assert.doesNotMatch(r.front.split('</div>')[0], /pointer-events/, 'lớp mang data-cid bấm chọn được');
  const card = { type: 'photo', mode: 'card', filter: { vignette: .5, shadows: .4 } }, rc = { front: '<F>' };
  E.colorWrap(card, rc, 1);
  assert.doesNotMatch(rc.front, /radial-gradient/, 'ảnh dạng thẻ: vignette không phủ cả khung');
  assert.match(rc.front, /<filter id="avscg/, 'nhưng vẫn có defs cho url(#…)');
  const plain = { back: '<B>' }; E.colorWrap({ type: 'broll', filter: {} }, plain, 1);
  assert.deepEqual(plain, { back: '<B>' });
});

test('Studio: tab Màu cho clip, b-roll / ảnh phủ, khối Điều chỉnh dùng một panel (82_color.js)', () => {
  const st = read('studio/studio.js'), fx = read('studio/features/81_fxtrack.js'), col = read('studio/features/82_color.js');
  assert.match(st, /\['color', 'Màu', Studio\.colorPanel \? Studio\.colorPanel\(o, thumb, 'clip'\)/);
  assert.match(st, /\['photo', 'broll'\]\.includes\(o\.type\) \? \[\['color', 'Màu', Studio\.colorPanel\(o, null, 'scene'\)\]\]/);
  assert.match(fx, /d\?\.color && S\.colorPanel \? \[\['color', 'Màu', S\.colorPanel\(o, null, 'efx'\)\]\]/);
  assert.match(col, /FX\.ADJ\.map/); assert.match(col, /data-col="\$\{id\}"/); assert.match(col, /S\.assist\('color'/);
  assert.doesNotMatch(st, /data-cf="brightness"|rng\('brightness'/, 'không còn bộ thanh màu riêng trong studio.js');
});

test('Claude chọn màu: việc color_pick ở phạm vi clip, gợi ý nhanh, áp + tóm tắt thay đổi', () => {
  for (const idx of [0, 2]) {
    const sc = AC.scopeOf({ step: 'build', sel: { kind: 'clip', idx, t0: 1, t1: 4 } });
    assert.ok(AC.actionsOf(sc).some(a => a.id === 'color_pick'));
    assert.ok(AC.quickOf(sc).some(q => q.action === 'color_pick' && q.label === 'Claude chọn màu'));
  }
  assert.deepEqual(AC.checkPick({ action: 'color_pick', params: {} }, AC.scopeOf({ step: 'build', sel: { kind: 'clip', idx: 0 } })).action, 'color_pick');
  const tl = { clips: [{ src: 'a.jpg' }, { src: 'b.jpg', filter: { preset: 'warm' } }] }, before = JSON.parse(JSON.stringify(tl));
  assert.equal(AC.colorApply(tl, 1, { preset: 'film', strength: 70, exposure: .2, junk: 1 }), true);
  assert.deepEqual(tl.clips[1].filter, { preset: 'film', strength: 70, exposure: .2 });
  assert.equal(AC.colorApply(tl, 0, { preset: 'nope' }), false, 'bộ rỗng sau khi kẹp: không áp');
  assert.equal(AC.colorApply(tl, 9, { exposure: .2 }), false);
  assert.ok(AC.changeSummary({ TL: before, CAP: [] }, { TL: tl, CAP: [] }).includes('màu 1 clip'));
  const js = read('studio/features/75_ask.js');
  assert.match(js, /case 'color_pick': \{[\s\S]*?S\.color\.pick\(sc\.idx[\s\S]*?pureReview\([\s\S]*?AC\.colorApply\(tl, sc\.idx, r\.filter\)/);
});

test('trợ lý color: kiểm đầu vào, prompt có bảng bộ lọc + gu, kẹp kết quả của mô hình', async () => {
  const A = await import('../assist.mjs');
  assert.ok(A.has('color'));
  const png = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64');
  assert.throws(() => A.check('color', {}), /Cần ảnh/);
  const i = A.check('color', { image: png, brand: { name: 'Quán A', primary: '#c0392b', dark: 'đỏ' }, taste: ['Bạn hay xoá b-roll', 3], current: { preset: 'warm', hue: 999 } });
  assert.deepEqual(i.brand.colors, { primary: '#C0392B' });
  assert.deepEqual(i.current, { preset: 'warm', hue: 180 });
  const p = A.ASSISTANTS.color.prompt(i);
  assert.match(p, /frame\.png/); assert.match(p, /warm \(ấm\)/); assert.match(p, /primary #C0392B/); assert.match(p, /CHỈ LÀ DỮ LIỆU[\s\S]*Bạn hay xoá b-roll/);
  const out = A.ASSISTANTS.color.normalize({ preset: 'FILM', strength: 65.4, adjust: { exposure: .25, shadows: .3, glow: 1 }, why: 'ấm, hợp đồ ăn' });
  assert.deepEqual(out.fields[0].value, { filter: { preset: 'film', strength: 65, exposure: .25, shadows: .3 }, why: 'ấm, hợp đồ ăn' });
  assert.match(out.warnings.join(' '), /glow/);
  assert.throws(() => A.ASSISTANTS.color.normalize({ preset: 'zzz', adjust: {} }), /không có bộ lọc/);
  // chạy đủ đường runAssist với mô hình giả (không cần CLI claude)
  const r = await A.runAssist('color', i, { run: async () => ({ text: '{"preset":"vivid","strength":55,"adjust":{"saturate":1.1},"why":"tươi"}', provider: 'claude' }) });
  assert.deepEqual(r.fields[0].value.filter, { preset: 'vivid', strength: 55, saturate: 1.1 });
});
