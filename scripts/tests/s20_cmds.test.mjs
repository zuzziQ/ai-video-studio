// S20 M140: bảng lệnh trên khung (studio/features/66_canvas_cmds.core.js) — thanh nổi, menu chuột phải, thứ tự lớp.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const C = createRequire(import.meta.url)('../../studio/features/66_canvas_cmds.core.js');
const ids = list => list.filter(x => x !== '-').map(x => x.id);

test('thanh nổi theo loại element', () => {
  assert.equal(C.barKind({ kind: 'line' }), 'text');
  assert.equal(C.barKind({ kind: 'node' }), 'text');
  assert.equal(C.barKind({ kind: 'cap' }), 'cap');
  assert.equal(C.barKind({ kind: 'scene' }), 'scene');
  for (const k of ['clip', 'sfx', 'music']) assert.equal(C.barKind({ kind: k }), null, k);
  assert.equal(C.barKind(null), null);
});

test('Thay mở đúng thư viện', () => {
  assert.equal(C.replacePanel('emoji_pop'), 'sticker');
  assert.equal(C.replacePanel('photo'), 'media');
  assert.equal(C.replacePanel('shape'), 'shapes');
  assert.equal(C.replacePanel('led_text'), 'fx');
});

test('lớp: cảnh đổi trong TL.scenes, chữ thêm theo cảnh của nó, chữ graphic trong lines', () => {
  const a = { type: 'emoji_pop' }, t = { type: 'text', lines: [{ text: 'x' }] }, g = { type: 'led_text', lines: [{ text: '1' }, { text: '2' }] }, scenes = [a, t, g];
  assert.equal(C.layerOf({ kind: 'scene', obj: a }, scenes).item, a);
  assert.equal(C.layerOf({ kind: 'line', obj: t.lines[0], scene: t }, scenes).item, t);
  assert.equal(C.layerOf({ kind: 'line', obj: g.lines[1], scene: g }, scenes).arr, g.lines);
  assert.equal(C.layerOf({ kind: 'cap', obj: {} }, scenes), null);
  assert.equal(C.layerOf({ kind: 'clip', obj: {} }, scenes), null);

  assert.equal(C.layerTarget(scenes, a, 'down'), -1);
  assert.equal(C.layerTarget(scenes, g, 'up'), -1);
  assert.equal(C.layerTarget(scenes, a, 'top'), 2);
  assert.ok(C.moveLayer(scenes, a, 'up')); assert.deepEqual(scenes, [t, a, g]);
  assert.ok(C.moveLayer(scenes, a, 'top')); assert.deepEqual(scenes, [t, g, a]);
  assert.ok(C.moveLayer(scenes, a, 'bottom')); assert.deepEqual(scenes, [a, t, g]);
  assert.equal(C.moveLayer(scenes, a, 'down'), false); assert.deepEqual(scenes, [a, t, g]);
});

test('menu chuột phải: chữ có Sửa chữ, lớp tắt ở mép, Về thiết kế khi có _orig; clip có Tách', () => {
  const a = { type: 'emoji_pop' }, b = { type: 'sticker' }, scenes = [a, b];
  const m = C.menuItems({ kind: 'scene', obj: b }, { scenes, hasOrig: true });
  assert.deepEqual(ids(m), ['dup', 'hide', 'cut', 'copy', 'paste', 'up', 'top', 'down', 'bottom', 'lock', 'reset', 'note', 'seek', 'del']);
  assert.equal(m.find(x => x.id === 'up').off, true);
  assert.equal(m.find(x => x.id === 'down').off, false);
  const t = C.menuItems({ kind: 'line', obj: { text: 'x' }, scene: { type: 'text', lines: [{}] } }, { scenes, canEditText: true, hidden: true });
  assert.equal(ids(t)[0], 'edit');
  assert.equal(t.find(x => x.id === 'hide').label, 'Hiện');
  assert.ok(!ids(t).includes('reset'));
  assert.deepEqual(ids(C.menuItems({ kind: 'clip', obj: {} }, { canSplit: true })), ['split', 'dup', 'copy', 'paste', 'del']);
  assert.ok(!ids(C.menuItems({ kind: 'cap', obj: {} }, {})).includes('up'));
  assert.deepEqual(C.menuItems(null), []);
});

test('đặt thanh nổi: trên khung chọn, sát mép trên thì xuống dưới, kẹp trong khung', () => {
  const view = { l: 0, t: 0, r: 400, b: 800 };
  assert.deepEqual(C.placeBar({ l: 100, t: 300, r: 200, b: 340 }, { w: 120, h: 36 }, view), { x: 90, y: 254, below: false });
  assert.deepEqual(C.placeBar({ l: 100, t: 20, r: 200, b: 60 }, { w: 120, h: 36 }, view), { x: 90, y: 70, below: true });
  assert.equal(C.placeBar({ l: 360, t: 300, r: 400, b: 340 }, { w: 120, h: 36 }, view).x, 280);
  assert.equal(C.placeBar({ l: -50, t: 300, r: 10, b: 340 }, { w: 120, h: 36 }, view).x, 0);
  // element phủ gần cả khung: không chỗ trên lẫn dưới → đè trong mép trên
  assert.deepEqual(C.placeBar({ l: 0, t: 5, r: 400, b: 795 }, { w: 120, h: 36 }, view), { x: 140, y: 15, below: false });
});

test('menu lật khi tràn; cỡ chữ ± 10 % trong 8–400', () => {
  const view = { l: 0, t: 0, r: 1000, b: 700 };
  assert.deepEqual(C.placeMenu(100, 100, { w: 220, h: 300 }, view), { x: 100, y: 100 });
  assert.deepEqual(C.placeMenu(900, 600, { w: 220, h: 300 }, view), { x: 680, y: 300 });
  assert.equal(C.stepSize(50, 1), 55); assert.equal(C.stepSize(55, -1), 50);
  assert.equal(C.stepSize(8, -1), 8); assert.equal(C.stepSize(399, 1), 400);
});

test('studio.js mở đủ hàm cho bảng lệnh và gọi hook sau khi vẽ khung chọn', () => {
  const src = fs.readFileSync(new URL('../../studio/studio.js', import.meta.url), 'utf8');
  for (const s of ['window.Studio?._ov', 'removeSel, duplicateSel, splitAtPlayhead', 'startInlineEdit: c =>', 'get dragging()', 'get editing()'])
    assert.ok(src.includes(s), `studio.js thiếu ${s}`);
});
