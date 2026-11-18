// S21 M147: chi tiết mục thư viện ở cột phải (studio/features/69_libdetail.core.js + 69_libdetail.js, sự kiện chọn mục ở library.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const C = createRequire(import.meta.url)('../../studio/features/69_libdetail.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const acts = d => d.actions.map(a => a.a);

test('khoá mục: kind:id, tách lại được (id có dấu hai chấm của item gói)', () => {
  assert.equal(C.keyOf('fx', '3:7'), 'fx:3:7');
  assert.deepEqual(C.parseKey('fx:3:7'), { kind: 'fx', id: '3:7' });
  assert.equal(C.parseKey('x'), null);
});

test('mẫu: bố cục, gói, phụ đề, nhạc, font, màu, lớp sẽ thêm, Áp dụng + Xem lớn', () => {
  const t = { id: 'a', name: 'Căn hộ', aspect: '16:9', pack: 're', base_dur: 20.2, caption_style: 'luxury', music: 'inspire', use_recipe: true,
    brand: { primary: '#112233', accent: '#abc', font: "'Playfair Display',serif", name: 'x' }, needs: ['ảnh'],
    scenes: [{ type: 're_price', t0: 8, t1: 10.6, lines: [{ font: "'Oswald'" }] }, { type: 're_specs', t0: 2.9, t1: 5 }, { type: 're_gallery', mode: 'full', t0: 5, t1: 8 }],
    preview: { mp4: '/p.mp4', jpg: '/p.jpg' } };
  const d = C.describe('tpl', 'a', t, { pack: { name: 'BĐS', icon: '🏠' }, catName: 'BĐS', capLabel: 'Sang trọng', moodVi: { inspire: 'Truyền cảm hứng' }, nameOf: s => s.type, vertical: true });
  const row = k => d.rows.find(r => r[0] === k)?.[1];
  assert.equal(d.title, 'Căn hộ'); assert.equal(d.whole, true);
  assert.match(row('Bố cục'), /Ngang 16:9 · 3 lớp graphic \(1 phủ kín khung\)/);
  assert.equal(row('Kiểu phụ đề'), 'Sang trọng'); assert.equal(row('Nhạc'), 'Truyền cảm hứng');
  assert.equal(row('Font'), 'Playfair Display, Oswald');
  assert.deepEqual(d.colors.map(c => c.v), ['#112233', '#abc']);
  assert.deepEqual(d.lists[0].items, ['re_specs · 2.9–5s', 're_gallery · 5–8s', 're_price · 8–10.6s']); // theo thời gian
  assert.equal(d.preview.t, 'video'); assert.match(d.warn, /dọc 9:16/);
  assert.deepEqual(acts(d), ['apply', 'big']);
  assert.ok(d.chips.includes('~20 giây'));
});

test('mẫu chữ: font, cỡ, kiểu, hoạt ảnh, chữ mẫu; Thêm, và Áp kiểu khi đang chọn chữ', () => {
  const p = { name: 'Sang trọng', text: 'Luxury', p: { style: 'white', size: 64, anim: 'fade', italic: true, weight: 600, font: "'Playfair Display',serif", upper: false }, css: 'color:#fff' };
  const d = C.describe('text', '7', p, { anims: [['fade', 'Mờ dần']] });
  const row = k => d.rows.find(r => r[0] === k)?.[1];
  assert.equal(row('Font'), 'Playfair Display'); assert.equal(row('Cỡ'), '64 px'); assert.equal(row('Hoạt ảnh'), 'Mờ dần'); assert.equal(row('Chữ mẫu'), 'Luxury');
  assert.doesNotMatch(row('Kiểu'), /IN HOA/);
  assert.deepEqual(acts(d), ['add']);
  const s = C.describe('text', '7', p, { sel: { kind: 'line' } });
  assert.deepEqual(acts(s), ['replace', 'add']); assert.equal(s.replace, 'text'); assert.equal(s.actions[0].primary, true);
});

test('khối HyperFrames: biến đổi được, chữ, khung, thời lượng từ catalog', () => {
  const b = { label: 'Số đếm', title: 'Counter', dur: 4, w: 1920, h: 1080, layer: 'overlay', vars: [{ id: 'accent', type: 'color', label: 'Accent' }, { id: 'end', type: 'number' }], texts: [{ i: 0 }], tags: ['stat'] };
  const d = C.describe('hf', '2:0', { pack: { name: 'Số liệu' }, item: { label: 'Số đếm', type: 'hf' }, block: b, dur: 4 }, { varLabel: v => ({ accent: 'Màu nhấn', end: 'Đến số' })[v.id] });
  assert.deepEqual(d.lists[0].items, ['Màu nhấn (màu)', 'Đến số (số)']);
  assert.equal(d.rows.find(r => r[0] === 'Khung')[1], '1920×1080');
  assert.ok(d.chips.includes('nền trong suốt'));
  assert.deepEqual(acts(C.describe('hf', '2:0', { pack: {}, item: {}, block: b }, { sel: { kind: 'scene', type: 'hf' } })), ['replace', 'add']);
});

test('thay element: chỉ khi cùng loại', () => {
  const R = C.replaceMode;
  assert.equal(R('sticker', { kind: 'scene', type: 'emoji_pop' }), 'sticker');
  assert.equal(R('sticker', { kind: 'scene', type: 'shape' }), null);
  assert.equal(R('shape', { kind: 'scene', type: 'shape' }), 'shape');
  assert.equal(R('fx', { kind: 'scene', type: 're_price' }), 'scene');
  assert.equal(R('fx', { kind: 'scene', type: 'emoji_pop' }), null);
  assert.equal(R('fx', { kind: 'line' }), null);
  assert.equal(R('music', { kind: 'music' }), 'music'); assert.equal(R('sfx', { kind: 'music' }), null);
  assert.equal(R('trans', { kind: 'clip', idx: 0 }), null); assert.equal(R('trans', { kind: 'clip', idx: 2 }), 'clip');
  assert.equal(R('filter', { kind: 'clip', idx: 0 }), 'clip');
  assert.equal(R('tpl', { kind: 'scene', type: 'x' }), null); assert.equal(R('cs', { kind: 'cap' }), null);
  assert.equal(R('sticker', null), null);
});

test('chuyển cảnh / bộ lọc: Áp dụng + Áp cho cả video; kiểu phụ đề: Áp cho cả video', () => {
  assert.deepEqual(acts(C.describe('trans', 'fade', { id: 'fade', label: 'Mờ dần' }, { dur: .6 })), ['apply', 'all']);
  assert.deepEqual(acts(C.describe('trans', 'fade', { id: 'fade', label: 'Mờ dần' }, { sel: { kind: 'clip', idx: 1 } })), ['replace', 'all']);
  assert.deepEqual(acts(C.describe('filter', 'warm', { label: 'Ấm' }, {})), ['apply', 'all']);
  const cs = C.describe('cs', 'none', { id: 'none', label: 'Tắt phụ đề' }, {});
  assert.deepEqual(acts(cs), ['apply']); assert.equal(cs.actions[0].label, 'Áp cho cả video');
});

test('nhạc / SFX / sticker / hình có xem trước và nút Thêm', () => {
  const m = C.describe('music', 'lofi_2', { id: 'lofi_2', src: '/assets/music/lofi_2.mp3' }, { moodVi: { lofi: 'Lofi thư giãn' } });
  assert.equal(m.title, 'Lofi thư giãn 2'); assert.equal(m.preview.t, 'audio');
  assert.deepEqual(acts(m), ['add']);
  assert.equal(C.describe('sfx', 'whoosh_1', { id: 'whoosh_1', src: '/s.mp3' }, {}).title, 'whoosh 1');
  assert.equal(C.describe('sticker', '🔥', { ch: '🔥', url: '' }, {}).preview.t, 'emoji');
  assert.equal(C.describe('shape', 'circle', { label: 'Tròn', svg: '<circle/>' }, {}).preview.t, 'svg');
  assert.equal(C.describe('nope', 'x', {}, {}), null);
});

test('font: tên đọc được từ var(--sans) / danh sách CSS', () => {
  assert.equal(C.fontName('var(--sans)'), 'Be Vietnam Pro');
  assert.equal(C.fontName("'Bungee'"), 'Bungee');
  assert.deepEqual(C.fontsIn({ a: [{ font: "'Inter'" }, { font: "'Inter'" }] }), ['Inter']);
});

test('library.js: bấm = xem chi tiết, bấm đúp = chèn, Enter / Space khi focus', () => {
  const L = read('studio/library.js');
  assert.match(L, /function libItemOf\(/);
  assert.match(L, /function libAct\(/);
  assert.match(L, /addEventListener\('dblclick'/);
  assert.match(L, /Studio\.libDetail\.pick/);
  const F = read('studio/features/69_libdetail.js');
  assert.match(F, /Studio\.right\.setDetail|S\.right\.setDetail/);
  assert.match(F, /Escape/);
  assert.doesNotMatch(F, /style="/); // M85: không markup style
});
