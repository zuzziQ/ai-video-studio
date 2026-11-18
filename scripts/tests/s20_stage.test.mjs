// S20 M139: chỉnh tại chỗ trên khung (studio/features/09_stage.core.js) — tay nắm xoay, sửa chữ tại chỗ, cuộn timeline tới khối.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const C = createRequire(import.meta.url)('../../studio/features/09_stage.core.js');
const c = { x: 100, y: 100 };

test('xoay: kéo quanh tâm cộng góc vào góc cũ, chuẩn hoá về (-180, 180]', () => {
  assert.equal(C.rotFromDrag(c, { x: 200, y: 100 }, { x: 100, y: 200 }, 0, { snap: 0 }), 90); // phải → dưới = +90° (trục y hướng xuống)
  assert.equal(C.rotFromDrag(c, { x: 200, y: 100 }, { x: 100, y: 0 }, 30, { snap: 0 }), -60);
  assert.equal(C.rotFromDrag(c, { x: 200, y: 100 }, { x: 0, y: 101 }, 170, { snap: 0 }) <= 180, true);
});

test('xoay: không Shift thì hít 0 / 90 khi lệch ≤ 3°, Shift bắt bội 15°', () => {
  const at = deg => ({ x: c.x + 100 * Math.cos(deg * Math.PI / 180), y: c.y + 100 * Math.sin(deg * Math.PI / 180) });
  assert.equal(C.rotFromDrag(c, at(0), at(2.4), 0), 0);
  assert.equal(C.rotFromDrag(c, at(0), at(88), 0), 90);
  assert.equal(C.rotFromDrag(c, at(0), at(20), 0), 20);
  assert.equal(C.rotFromDrag(c, at(0), at(20), 0, { step: 15 }), 15);
  assert.equal(C.rotFromDrag(c, at(0), at(23), 0, { step: 15 }), 30);
});

test('sửa chữ tại chỗ: chữ thêm, chữ graphic, node, chữ LED / neon; không phụ đề, không cảnh khác', () => {
  assert.ok(C.canEditText('line', { text: 'A' }));
  assert.ok(C.canEditText('node', { text: '' }));
  assert.ok(C.canEditText('scene', { type: 'led_text', text: 'LED' }));
  assert.equal(C.canEditText('scene', { type: 'media_card', text: 'x' }), false);
  assert.equal(C.canEditText('cap', { text: 'x' }), false);
  assert.equal(C.canEditText('line', {}), false);
  assert.equal(C.canEditText('line', null), false);
});

test('kiểu ô gõ: nhân K cho cỡ chữ, giãn chữ, bóng; màu trong suốt thành trắng', () => {
  const s = C.editStyle({ fontFamily: 'Montserrat', fontWeight: '900', fontStyle: 'italic', fontSize: '48px', letterSpacing: '-0.48px', lineHeight: '50.4px',
    textTransform: 'uppercase', textShadow: 'rgba(0, 0, 0, 0.65) 0px 2px 6px', color: 'rgb(252, 219, 54)' }, .5);
  assert.equal(s.fontSize, '24px'); assert.equal(s.letterSpacing, '-0.2px'); assert.equal(s.lineHeight, '25.2px');
  assert.equal(s.textShadow, 'rgba(0, 0, 0, 0.65) 0px 1px 3px');
  assert.equal(s.color, 'rgb(252, 219, 54)'); assert.equal(s.textTransform, 'uppercase'); assert.equal(s.fontWeight, '900');
  assert.equal(C.editStyle({ fontSize: '40px', color: 'rgba(0, 0, 0, 0)' }).color, '#fff');
  assert.equal(C.editStyle({ fontSize: '40px', color: 'transparent', textShadow: 'none', letterSpacing: 'normal' }).textShadow, undefined);
});

test('cuộn timeline tới khối: đã thấy thì không cuộn, khuất phải / trái / dưới thì cuộn vừa đủ', () => {
  const view = { l: 0, r: 1000, t: 0, b: 300 };
  assert.deepEqual(C.revealDelta(view, { l: 100, r: 300, t: 50, b: 80 }), { dx: 0, dy: 0 });
  assert.deepEqual(C.revealDelta(view, { l: 1200, r: 1300, t: 50, b: 80 }), { dx: 324, dy: 0 });
  assert.deepEqual(C.revealDelta(view, { l: -400, r: -300, t: 50, b: 80 }), { dx: -424, dy: 0 });
  assert.deepEqual(C.revealDelta(view, { l: 100, r: 200, t: 320, b: 360 }), { dx: 0, dy: 84 });
  // khối dài hơn tầm nhìn mà đầu khối đã thấy: không cuộn
  assert.deepEqual(C.revealDelta(view, { l: 200, r: 3000, t: 50, b: 80 }), { dx: 0, dy: 0 });
  assert.deepEqual(C.revealDelta(view, { l: 1500, r: 4000, t: 50, b: 80 }), { dx: 1476, dy: 0 });
});

test('studio.js nối các phần: bấm đúp gọi sửa tại chỗ, có tay nắm xoay, viền rê chuột', () => {
  const src = fs.readFileSync(new URL('../../studio/studio.js', import.meta.url), 'utf8');
  for (const s of ['StageCore.canEditText', 'StageCore.editStyle', 'data-h="rot"', 'StageCore.rotFromDrag', 'class="hoverbox"', 'StageCore.revealDelta'])
    assert.ok(src.includes(s), `studio.js thiếu ${s}`);
});
