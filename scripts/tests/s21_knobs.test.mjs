// S21 M148: Núm điều chỉnh (studio/features/71_knobs.core.js) + màu / font thương hiệu đứng đầu + chỗ nối trong studio.js / 66_canvas_cmds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const req = createRequire(import.meta.url);
const K = req('../../studio/features/71_knobs.core.js');
const SC = req('../../studio/features/68_sections.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('loại bảng núm theo element', () => {
  assert.equal(K.targetOf({ kind: 'line', obj: {} }), 'line');
  assert.equal(K.targetOf({ kind: 'scene', obj: { type: 'shape' } }), 'shape');
  assert.equal(K.targetOf({ kind: 'scene', obj: { type: 'hf' } }), 'hf');
  assert.equal(K.targetOf({ kind: 'scene', obj: { type: 'sticker' } }), 'sticker');
  assert.equal(K.targetOf({ kind: 'scene', obj: { type: 'emoji_pop' } }), 'scene');
  for (const kind of ['clip', 'cap', 'sfx', 'music', 'node']) assert.equal(K.targetOf({ kind, obj: {} }), null);
  assert.equal(K.targetOf(null), null);
});

test('chữ: "Độ nổi" đổi cỡ + đậm + kiểu cùng lúc, 0 = giữ nguyên gốc, kẹp biên', () => {
  const A = K.ALLOWED.line, T = K.tableFor('line'), raw = { size: 48, dur: 2, weight: null, style: null, anim: null };
  assert.deepEqual(K.patchOf(T, {}, raw, A), { size: 48, weight: null, style: null, anim: null, dur: 2 });
  const hi = K.patchOf(T, { pop: 50 }, raw, A);
  assert.equal(hi.size, 72); assert.equal(hi.weight, null /* 900 = mặc định */); assert.equal(hi.style, 'glow');
  const lo = K.patchOf(T, { pop: -50 }, raw, A);
  assert.equal(lo.size, 34); assert.equal(lo.weight, 500); assert.equal(lo.style, 'muted');
  // giá trị núm ngoài biên bị kẹp; cỡ không vượt biên trường
  assert.deepEqual(K.patchOf(T, { pop: 999 }, raw, A), hi);
  assert.equal(K.patchOf(T, { pop: 50 }, { ...raw, size: 240 }, A).size, 260);
});

test('chữ: "Năng lượng" đổi hoạt ảnh vào + thời lượng hiện', () => {
  const A = K.ALLOWED.line, T = K.tableFor('line'), raw = { size: 48, dur: 2, anim: 'slide_l' };
  const p = K.patchOf(T, { energy: 50 }, raw, A);
  assert.equal(p.anim, 'blur_zoom'); assert.equal(p.dur, 1.2);
  const q = K.patchOf(T, { energy: -50 }, raw, A);
  assert.equal(q.anim, 'fade'); assert.equal(q.dur, 3);
  assert.equal(K.patchOf(T, { energy: 0 }, raw, A).anim, 'slide_l'); // bậc null = giữ gốc
});

test('sticker, cảnh: Kích cỡ + Năng lượng; hình khối: Độ đậm, Bo góc chỉ khi bo góc', () => {
  const st = K.patchOf(K.tableFor('sticker'), { size: 50, energy: -50 }, { size: 320, dur: 3 }, K.ALLOWED.sticker);
  assert.equal(st.size, 704); assert.equal(st.from, 'up'); assert.equal(st.bob, false); assert.equal(st.dur, 4.2);
  const sc = K.patchOf(K.tableFor('scene'), { size: -50 }, { size: 100, dur: 3 }, K.ALLOWED.scene);
  assert.equal(sc.size, 40);
  const A = K.ALLOWED.shape, T = K.tableFor('shape');
  const d = K.patchOf(T, { density: -50 }, { size: 300, dur: 3, opacity: null, stroke_w: 4, shape: 'rect' }, A);
  assert.equal(d.opacity, 0.25); assert.equal(d.stroke_w, 0);
  assert.equal(K.patchOf(T, { density: 50 }, { size: 300, dur: 3, shape: 'rect' }, A).opacity, null); // 1 = mặc định → xoá
  assert.equal(K.patchOf(T, { radius: 50 }, { size: 300, dur: 3, shape: 'rect' }, A).radius, null); // hình chữ nhật: núm bỏ qua
  assert.equal(K.patchOf(T, { radius: 50 }, { size: 300, dur: 3, shape: 'rounded', radius: 32 }, A).radius, 182);
  assert.ok(!('shape' in K.patchOf(T, {}, { size: 1, dur: 1, shape: 'rounded' }, A))); // trường chỉ đọc không vào bản vá
});

test('khối HyperFrames: núm cho biến số có biên trong catalog, đặt thẳng min…max, giá trị ban đầu suy ngược', () => {
  const block = { vars: [{ id: 'zoom', type: 'number', def: 1.6, min: 1, max: 3 }, { id: 'title', type: 'string' }, { id: 'n', type: 'number', def: 3 }] };
  const A = K.allowedFor('hf', block), T = K.tableFor('hf', { block, varLabel: v => 'Phóng ' + v.id });
  assert.deepEqual(T.map(k => k.id), ['size', 'energy', 'v_zoom']);
  assert.equal(T[2].label, 'Phóng zoom');
  assert.ok(A['vars.zoom'] && !A['vars.title'] && !A['vars.n']);
  const raw = { size: 1000, dur: 5, speed: null, 'vars.zoom': null };
  assert.equal(K.initValue(T[2], raw, A), 30); // def 1.6 → (1.6−1)/2 = 30%
  assert.equal(K.patchOf(T, { v_zoom: 100 }, raw, A)['vars.zoom'], 3);
  assert.equal(K.patchOf(T, { energy: 50 }, raw, A).speed, 1.6);
  // núm 'set' chưa đụng (giá trị = suy ngược, đã làm tròn) không ghi đè biến gốc lẻ
  const b2 = { vars: [{ id: 'x', type: 'number', def: 68.5, min: 0, max: 100 }, { id: 'zoom', type: 'number', def: 1.8, min: 1.2, max: 2.6 }] };
  const A2 = K.allowedFor('hf', b2), T2 = K.tableFor('hf', { block: b2 }), r2 = { size: 100, dur: 5 };
  const v2 = Object.fromEntries(T2.map(k => [k.id, K.initValue(k, r2, A2)]));
  assert.equal(v2.v_x, 69);
  const p2 = K.patchOf(T2, { ...v2, v_zoom: 100 }, r2, A2);
  assert.equal(p2['vars.x'], null); assert.equal(p2['vars.zoom'], 2.6);
});

test('lệch trạng thái (sửa tay ở mục khác) thì inSync báo false', () => {
  const A = K.ALLOWED.line, T = K.tableFor('line'), raw = { size: 48, dur: 2 };
  const now = K.compute(T, { pop: 20 }, raw, A);
  assert.equal(K.inSync(T, { pop: 20 }, raw, A, now), true);
  assert.equal(K.inSync(T, { pop: 20 }, raw, A, { ...now, size: now.size + 10 }), false);
});

test('validateMap: chỉ trường cho phép, kiểu đúng, bỏ núm / trường hỏng', () => {
  const A = K.ALLOWED.line;
  const ok = K.validateMap({ knobs: [{ id: 'x', label: 'Thử', fields: [{ f: 'size', op: 'mul', lo: 0.5, hi: 2 }, { f: 'style', op: 'step', steps: [[10, 'neon'], [-50, null]] }] }] }, A);
  assert.equal(ok.ok, true); assert.deepEqual(ok.knobs[0].fields[1].steps, [[-50, null], [10, 'neon']]); // sắp theo at
  assert.equal(ok.knobs[0].min, -50); assert.equal(ok.knobs[0].max, 50);
  const bad = K.validateMap([
    { id: 'a', label: 'A', fields: [{ f: 'text', op: 'set', lo: 0, hi: 1 }] }, // trường không cho phép
    { id: 'b', label: 'B', fields: [{ f: 'style', op: 'step', steps: [[0, 'rainbow']] }] }, // giá trị enum lạ
    { id: 'c', label: 'C', min: 0, max: 500, fields: [{ f: 'size', op: 'mul', lo: 1, hi: 2 }] }, // biên núm sai
    { id: 'd', label: 'D', fields: [{ f: 'size', op: 'mul', lo: 1, hi: 50 }] }, // hệ số quá lớn
    { id: 'e', label: 'E', fields: [{ f: 'weight', op: 'add', lo: 'x', hi: 1 }, { f: 'size', op: 'add', lo: -5, hi: 5 }] }, // một trường hỏng, một đúng
    { id: 'e', label: 'trùng', fields: [{ f: 'size', op: 'add', lo: -5, hi: 5 }] },
    { label: 'không id', fields: [] },
  ], A);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.knobs.map(k => k.id), ['e']);
  assert.deepEqual(bad.knobs[0].fields.map(f => f.f), ['size']);
  assert.ok(bad.errors.length >= 6);
  assert.equal(K.validateMap('rác', A).ok, false);
  assert.equal(K.validateMap([], null).ok, false);
  // set bị kẹp vào biên trường; trường chỉ đọc bị từ chối
  const s = K.validateMap([{ id: 'r', label: 'R', fields: [{ f: 'radius', op: 'set', lo: -10, hi: 9999 }, { f: 'shape', op: 'step', steps: [[0, 'circle']] }] }], K.ALLOWED.shape);
  assert.deepEqual(s.knobs[0].fields, [{ f: 'radius', op: 'set', lo: 0, hi: 300 }]);
  assert.equal(K.validateMap(Array.from({ length: 9 }, (_, i) => ({ id: 'k' + i, label: 'K', fields: [{ f: 'size', op: 'add', lo: -1, hi: 1 }] })), A).knobs.length, K.MAX_KNOBS);
});

test('núm của gói style nối thêm sau khi qua validateMap', () => {
  const T = K.tableFor('scene', { extra: [{ id: 'pk', label: 'Gói', fields: [{ f: 'dur', op: 'mul', lo: 0.5, hi: 2 }] }, { id: 'bad', label: 'X', fields: [{ f: 'html', op: 'set', lo: 0, hi: 1 }] }] });
  assert.deepEqual(T.map(k => k.id), ['size', 'energy', 'pk']);
});

test('thương hiệu: màu bỏ trùng / bỏ giá trị lạ, font an toàn, nhóm Thương hiệu đứng đầu ô font', () => {
  assert.deepEqual(K.brandColors(null), []);
  assert.deepEqual(K.brandColors({ primary: '#ff5a36', accent: '#FF5A36', dark: 'red;x', light: '#fff' }).map(x => x.v), ['#FF5A36', '#FFFFFF']);
  assert.deepEqual(K.brandFonts({ disp: '"Montserrat", sans-serif', font: 'x;}body{', logo: 'a' }), [["'Montserrat', sans-serif", 'Montserrat · tiêu đề']]); // ngoặc đơn: engine chèn vào thuộc tính style
  assert.deepEqual(K.brandFonts({ font: 'var(--sans)' }), []);
  const FONTS = [['', 'Mặc định'], ["'Inter'", 'Inter']];
  assert.equal(K.fontOptions(FONTS, {}, ''), '<option value="" selected>Mặc định</option><option value="\'Inter\'" >Inter</option>');
  const h = K.fontOptions(FONTS, { font: '"Lexend", sans-serif' }, "'Lexend', sans-serif");
  assert.ok(h.startsWith(`<optgroup label="Thương hiệu"><option value="'Lexend', sans-serif" selected>`));
  assert.ok(h.indexOf('Tất cả font') > h.indexOf('Lexend'));
});

test('mục Núm đứng đầu Thuộc tính (mở sẵn như mục đầu)', () => {
  const s = SC.normalize([['basic', 'Cơ bản', ''], ['pos', 'Vị trí', ''], ['knobs', 'Núm', '']]);
  assert.deepEqual(s.map(x => x.key), ['knobs', 'basic', 'pos']);
  assert.equal(s[0].icon, 'ti-adjustments-horizontal');
});

test('chỗ nối: studio.js / thanh nổi dùng màu + font thương hiệu, Studio có setTimes, giao diện núm không gọi API', () => {
  const studio = read('studio/studio.js'), cmds = read('studio/features/66_canvas_cmds.js'), ui = read('studio/features/71_knobs.js');
  assert.match(studio, /KnobsCore\?\.brandColors\(TL\.brand\)/);
  assert.match(studio, /fontOpt\(o\.font/);
  assert.match(studio, /setTimes: \(c, t0, t1\) =>/);
  assert.match(cmds, /brandColors\(S\.TL\?\.brand\)/);
  assert.match(cmds, /S\.fontOpt\(o\.font\)/);
  assert.match(ui, /addInspectorTab/);
  assert.match(ui, /window\.Knobs = /);
  assert.doesNotMatch(ui, /S\.api\(|fetch\(/); // C23: kéo núm không gọi Claude / server
  assert.doesNotMatch(ui, /style="/);
});
