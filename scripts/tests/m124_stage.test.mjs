// S17 M124: lõi chỉnh tay trên sân khấu (studio/features/09_stage.core.js) — hàm thuần, không DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const C = createRequire(import.meta.url)('../../studio/features/09_stage.core.js');

test('chỉ cảnh engine đọc được rộng/cao mới có tay nắm cạnh', () => {
  for (const t of ['frame_grid', 'media_card', 'hook_card', 'bubble_screen', 'follow_cta']) assert.ok(C.canResize('scene', t), t);
  for (const t of ['led_text', 'sticker', 'emoji_pop', 'title_card', 'broll']) assert.equal(C.canResize('scene', t), false, t);
  assert.equal(C.canResize('line', 'media_card'), false);
});

test('bảng GEO khớp engine: mỗi loại card đọc s.card, follow_cta đọc s.w/s.h', () => {
  const src = ['engine/slate.js', 'engine/vertical.js'].map(f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8')).join('\n');
  for (const [t, g] of Object.entries(C.GEO)) {
    const body = src.slice(src.indexOf(`  ${t}(s, t`)).slice(0, 900);
    assert.ok(body.length > 10, `không thấy module ${t}`);
    assert.match(body, g === 'card' ? /\.\.\.\(s\.card \|\| \{\}\)/ : /s\.w \?\?.*s\.h \?\?/, t);
  }
});

test('boxOf / setBox giữ đúng trường engine đọc', () => {
  const s = { type: 'media_card' };
  assert.deepEqual(C.boxOf(s), { x: 110, y: 360, w: 500, h: 290 });
  C.setBox(s, { x: 100.4, y: 300, w: 640, h: 10 });
  assert.equal(s.card.w, 640); assert.equal(s.card.h, 24);
  const f = { type: 'follow_cta' };
  assert.deepEqual(C.boxOf(f), { x: 207, y: 809, w: 306, h: 98 });
  C.setBox(f, { x: 180, y: 800, w: 360, h: 120 });
  assert.deepEqual([f.w, f.h, f.y], [360, 120, 860]);
  assert.deepEqual(C.boxOf({ type: 'frame_grid' }, true), { x: 150, y: 96, w: 980, h: 551 });
  assert.equal(C.boxOf({ type: 'led_text' }), null);
});

test('resizeEdge: cạnh đổi một trục, cạnh trái/trên giữ mép đối diện, có cỡ tối thiểu', () => {
  const r = { x: 100, y: 100, w: 200, h: 100 };
  assert.deepEqual(C.resizeEdge(r, 'e', 50, 999), { x: 100, y: 100, w: 250, h: 100 });
  assert.deepEqual(C.resizeEdge(r, 'w', 50, 0), { x: 150, y: 100, w: 150, h: 100 });
  assert.deepEqual(C.resizeEdge(r, 'n', 0, -40), { x: 100, y: 60, w: 200, h: 140 });
  assert.deepEqual(C.resizeEdge(r, 's', 0, -500), { x: 100, y: 100, w: 200, h: 24 });
  assert.deepEqual(C.resizeEdge(r, 'e', 20, 0, { sym: true }), { x: 80, y: 100, w: 240, h: 100 });
});

test('snapMove dính vào giữa khung, vùng an toàn và element khác; trả đường để vẽ', () => {
  const lines = C.guideLines({ DW: 720, DH: 1280, safe: { x: 40, y: 130, w: 600, h: 870 }, rects: [{ x: 400, y: 500, w: 100, h: 50 }] });
  const a = C.snapMove({ x: 257, y: 700, w: 200, h: 80 }, lines, 6); // tâm 357 → 360
  assert.equal(a.dx, 3); assert.deepEqual(a.gx, [360]);
  const b = C.snapMove({ x: 43, y: 497, w: 100, h: 40 }, lines, 6); // mép trái 43 → 40 (an toàn), mép trên 497 → 500 (element)
  assert.equal(b.dx, -3); assert.equal(b.dy, 3); assert.ok(b.gy.includes(500));
  const c = C.snapMove({ x: 200, y: 200, w: 30, h: 30 }, lines, 6);
  assert.deepEqual([c.dx, c.dy, c.gx.length, c.gy.length], [0, 0, 0, 0]);
});

test('snapEdge chỉnh đúng cạnh đang kéo', () => {
  const lines = { x: [0, 360, 720], y: [0, 640, 1280] };
  const e = C.snapEdge({ x: 100, y: 100, w: 257, h: 50 }, 'e', lines, 6);
  assert.equal(e.r.w, 260); assert.deepEqual(e.gx, [360]);
  const n = C.snapEdge({ x: 100, y: 636, w: 50, h: 50 }, 'n', lines, 6);
  assert.deepEqual([n.r.y, n.r.h], [640, 46]);
});

test('alignDeltas căn theo khung bao của nhóm', () => {
  const rs = [{ x: 10, y: 10, w: 100, h: 20 }, { x: 50, y: 100, w: 20, h: 20 }];
  assert.deepEqual(C.alignDeltas(rs, 'left'), [{ dx: 0, dy: 0 }, { dx: -40, dy: 0 }]);
  assert.deepEqual(C.alignDeltas(rs, 'right'), [{ dx: 0, dy: 0 }, { dx: 40, dy: 0 }]);
  assert.deepEqual(C.alignDeltas(rs, 'hcenter'), [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }]);
  assert.deepEqual(C.alignDeltas(rs, 'bottom'), [{ dx: 0, dy: 90 }, { dx: 0, dy: 0 }]);
  assert.deepEqual(C.alignDeltas(rs, 'nope'), [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }]);
});

test('quickCheck: tràn khung, ngoài vùng an toàn, che mặt (> 15 %), bỏ qua che mặt khi cảnh phủ khung', () => {
  const ctx = { DW: 720, DH: 1280, safe: { x: 40, y: 130, w: 600, h: 870 }, face: { x: 360, y: 520, h: 200 } };
  assert.deepEqual(C.quickCheck({ x: 100, y: 800, w: 200, h: 80 }, ctx), []);
  assert.equal(C.quickCheck({ x: 600, y: 800, w: 200, h: 80 }, ctx)[0].kind, 'text_offcanvas');
  assert.equal(C.quickCheck({ x: 20, y: 800, w: 200, h: 80 }, ctx)[0].kind, 'text_unsafe');
  const k = C.quickCheck({ x: 260, y: 420, w: 200, h: 200 }, ctx);
  assert.deepEqual(k.map(i => i.kind), ['face_cover']);
  assert.deepEqual(C.quickCheck({ x: 260, y: 420, w: 200, h: 200 }, { ...ctx, cover: true }), []);
  assert.ok(C.faceBox({ x: 1, y: 2 }).h > 0); assert.equal(C.faceBox(null), null);
});

test('panCrop / zoomCrop: kéo phải lộ bên trái, kẹp 0..100 và 1..3', () => {
  const g = { ar: 16 / 9, boxAr: 9 / 16, DW: 720, DH: 1280 };
  const a = C.panCrop({ ox: 50, oy: 45 }, 100, 0, g);
  assert.ok(a.ox < 50); assert.equal(a.oy, 45); // nguồn ngang trong khung dọc: không dư theo chiều dọc
  assert.equal(C.panCrop({ ox: 2 }, 5000, 0, g).ox, 0);
  const same = C.panCrop({ ox: 50, oy: 45, zoom: 1 }, 100, 100, { ...g, ar: 9 / 16 });
  assert.deepEqual(same, { ox: 50, oy: 45 });
  assert.ok(C.panCrop({ ox: 50, oy: 45, zoom: 2 }, 0, 100, { ...g, ar: 9 / 16 }).oy < 45);
  assert.equal(C.zoomCrop(1, .5), 1); assert.equal(C.zoomCrop(2, 2), 3); assert.equal(C.zoomCrop(1.2, 1.1), 1.32);
});

test('rotNorm đưa góc về (-180, 180]', () => {
  assert.equal(C.rotNorm(370), 10); assert.equal(C.rotNorm(-190), 170); assert.equal(C.rotNorm('abc'), 0); assert.equal(C.rotNorm(12.345), 12.3);
  assert.ok(C.canRotate('line') && C.canRotate('scene') && !C.canRotate('cap'));
});
