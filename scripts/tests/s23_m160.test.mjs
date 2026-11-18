// S23 M160: còn sót của sân khấu — mũi tên trên thanh trượt Núm, khung chọn xoay theo element, size của khối HF khi kéo,
// thanh nổi trong khung hẹp, chấm ghim gọn, cảnh nền "back" trong bảng Lớp.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const req = createRequire(import.meta.url);
const K = req('../../studio/features/67_keys.core.js');
const SC = req('../../studio/features/09_stage.core.js');
const C = req('../../studio/features/66_canvas_cmds.core.js');
const L = req('../../studio/features/67_layers.core.js');
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('PR 185: thanh trượt giữ mũi tên / Home / End, ô gõ giữ mọi phím, checkbox không giữ', () => {
  const range = { tagName: 'INPUT', type: 'range' };
  for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']) assert.equal(K.fieldOwnsKey(range, k), true, k);
  assert.equal(K.fieldOwnsKey(range, ' '), false); // Space vẫn phát / dừng
  assert.equal(K.fieldOwnsKey(range, 'z'), false); // ⌘Z vẫn hoàn tác
  assert.equal(K.fieldOwnsKey({ tagName: 'INPUT', type: 'text' }, 'ArrowLeft'), true);
  assert.equal(K.fieldOwnsKey({ tagName: 'INPUT', type: 'number' }, 'z'), true);
  assert.equal(K.fieldOwnsKey({ tagName: 'TEXTAREA' }, 'Delete'), true);
  assert.equal(K.fieldOwnsKey({ tagName: 'SELECT' }, 'ArrowDown'), true);
  assert.equal(K.fieldOwnsKey({ tagName: 'INPUT', type: 'checkbox' }, 'ArrowLeft'), false);
  assert.equal(K.fieldOwnsKey({ tagName: 'BUTTON' }, 'ArrowLeft'), false);
  assert.equal(K.fieldOwnsKey({ tagName: 'DIV', isContentEditable: true }, 'ArrowLeft'), true);
  assert.equal(K.fieldOwnsKey(null, 'ArrowLeft'), false);
  // studio.js dùng hàm này trong keydown chung
  assert.match(read('../../studio/studio.js'), /KeysCore\.fieldOwnsKey\(ae, e\.key\)/);
});

test('PR 175: dời cảnh không ghi size mặc định, đổi cỡ thật thì ghi', () => {
  const hf = { type: 'hf', block: 'x' };
  assert.deepEqual(SC.posPatch(hf, { x: 100.4, y: 200.6, size: 100 }, 100), { x: 100, y: 201 }); // dời: không size
  assert.deepEqual(SC.posPatch(hf, { x: 100, y: 200, size: 60 }, 60), { x: 100, y: 200 }); // def cũ (60) cũng không ghi khi không đổi
  assert.deepEqual(SC.posPatch(hf, { x: 1, y: 2, size: 125.04 }, 100), { x: 1, y: 2, size: 125 }); // kéo góc: ghi
  assert.deepEqual(SC.posPatch({ type: 'sticker', size: 200 }, { x: 0, y: 0, size: 200 }, 320), { x: 0, y: 0 });
  assert.deepEqual(SC.posPatch({ type: 'follow_cta' }, { x: 0, y: 0, size: 50 }, 0), { x: 0, y: 0 }); // loại không có cỡ
  assert.deepEqual(SC.posPatch({ type: 'x' }, { x: 0, y: 0 }, 60), { x: 0, y: 0 });
  // cỡ mặc định của khối HF trong studio.js là 100 (%), không phải 60
  assert.match(read('../../studio/studio.js'), /hf: \[360, 640, 100\]/);
});

test('PR 174: khung chọn xoay theo element, kéo cạnh theo trục đã xoay', () => {
  assert.deepEqual(SC.selFrame({ x: 10, y: 20, w: 100, h: 50 }, 30, 0.5, 3), { l: 2, t: 7, w: 56, h: 31, rot: 30 });
  assert.equal(SC.selFrame({ x: 0, y: 0, w: 1, h: 1 }, 0, 1).rot, 0);
  assert.equal(SC.selFrame({ x: 0, y: 0, w: 1, h: 1 }, 370, 1).rot, 10);
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
  let u = SC.unrotate(10, 0, 90); near(u.dx, 0); near(u.dy, -10); // element xoay 90°: kéo sang phải màn = kéo lên trên trục element
  u = SC.unrotate(0, 10, 90); near(u.dx, 10); near(u.dy, 0);
  u = SC.unrotate(3, 4, 0); near(u.dx, 3); near(u.dy, 4);
  const js = read('../../studio/studio.js');
  assert.match(js, /function frameOf\(obj\)/);
  assert.match(js, /el\.style\.rotate = el\.dataset\.drot \+ 'deg'/);
});

test('PR 177: thanh nổi đặt cạnh element cao khi trên / dưới không đủ chỗ', () => {
  const view = { l: 0, t: 0, r: 1000, b: 800 };
  // khung 9:16 hẹp giữa cột rộng, element gần cả khung cao
  assert.deepEqual(C.placeBar({ l: 400, t: 5, r: 600, b: 795 }, { w: 300, h: 36 }, view), { x: 610, y: 5, below: false, side: 'right' });
  // không đủ bên phải → bên trái
  assert.deepEqual(C.placeBar({ l: 400, t: 5, r: 900, b: 795 }, { w: 300, h: 36 }, view), { x: 90, y: 5, below: false, side: 'left' });
  // không đủ hai bên → đè mép trên như cũ
  assert.deepEqual(C.placeBar({ l: 0, t: 5, r: 1000, b: 795 }, { w: 300, h: 36 }, view), { x: 350, y: 15, below: false });
  // mép trên element ra ngoài view: kẹp
  assert.equal(C.placeBar({ l: 400, t: -40, r: 600, b: 820 }, { w: 300, h: 36 }, view).y, 0);
  // đủ chỗ trên → như cũ (trên khung chọn)
  assert.deepEqual(C.placeBar({ l: 400, t: 300, r: 600, b: 400 }, { w: 300, h: 36 }, view), { x: 350, y: 254, below: false });
});

test('PR 182: chấm ghim nghỉ 12 px, về cỡ đầy khi rê / mở / chế độ ghim', () => {
  const css = read('../../studio/studio.css');
  const i = css.indexOf('/* S23 M160 (PR 182)');
  assert.ok(i > 0);
  const blk = css.slice(i);
  assert.match(blk, /\.pinlayer:not\(\.on\) \.pin:not\(\.open\):not\(\.draft\):not\(:hover\):not\(:focus-visible\) \{[^}]*height: 12px/);
  assert.match(blk, /span \{ display: none; \}/);
});

test('PR 178: cảnh nền "back" xếp dưới mọi cảnh front trong bảng Lớp', () => {
  assert.deepEqual([...L.backSet([2, 0, 1])], [2]);
  assert.deepEqual([...L.backSet([0, 3, 1, 2])], [0, 3]);
  assert.deepEqual([...L.backSet([0, 1, 2])], []); // không có chỗ giảm: thứ tự mảng đúng
  assert.deepEqual([...L.backSet([1, 1, 0])], [1]); // trùng chỉ số (cảnh nhiều phần tử): tính lần đầu
  assert.deepEqual([...L.backSet([-1, 2, 0])], [2]);
  assert.deepEqual([...L.backSet()], []);

  const grid = { type: 'grid_bg', t0: 0, t1: 5 }, card = { type: 'media_card', t0: 0, t1: 5 }, bg2 = { type: 'frame_grid', t0: 0, t1: 5 };
  const scenes = [card, grid, bg2];
  const comps = [
    { kind: 'clip', idx: 0, obj: {}, t0: 0, t1: 5, label: 'clip' },
    { kind: 'scene', obj: card, t0: 0, t1: 5, label: 'card' },
    { kind: 'scene', obj: grid, t0: 0, t1: 5, label: 'grid' },
    { kind: 'scene', obj: bg2, t0: 0, t1: 5, label: 'bg2' },
    { kind: 'cap', obj: {}, t0: 0, t1: 5, label: 'cap' },
  ];
  const names = list => list.map(c => c.label);
  assert.deepEqual(names(L.layerList(comps, scenes, 1)), ['cap', 'bg2', 'grid', 'card', 'clip']); // không biết nền: theo mảng
  const back = L.backSet([1, 2, 0]); // grid, bg2 ở back
  assert.deepEqual(names(L.layerList(comps, scenes, 1, back)), ['cap', 'card', 'bg2', 'grid', 'clip']);
  // kéo: nền ↔ front không thả được, nền ↔ nền được
  assert.equal(L.canDrop(comps[1], comps[2], scenes, back), false);
  assert.equal(L.canDrop(comps[2], comps[3], scenes, back), true);
  assert.equal(L.canDrop(comps[1], comps[2], scenes), true); // không truyền back: như cũ
  assert.equal(L.dropOn(comps[3], comps[2], false, scenes, back), true);
  assert.deepEqual(scenes.map(s => s.type), ['media_card', 'frame_grid', 'grid_bg']);
});
