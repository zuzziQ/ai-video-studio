// S23 M169: bảng Lớp xếp cảnh nền của module cũ không gắn data-cid (vd slam_bg) theo khai báo back của module
// (window.drawnScenes của engine), không chỉ theo thứ tự phần tử data-cid trong DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const req = createRequire(import.meta.url);
const L = req('../../studio/features/67_layers.core.js');
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('backWith: cảnh chỉ có back là nền, cảnh có front giữ kết quả DOM', () => {
  assert.deepEqual([...L.backWith(new Set(), [{ i: 1, back: true, front: false }, { i: 0, back: false, front: true }])], [1]);
  assert.deepEqual([...L.backWith(new Set([2]), [{ i: 3, back: true, front: true }])], [2]); // cả hai phần: không thêm
  assert.deepEqual([...L.backWith(new Set([0]), [{ i: -1, back: true, front: false }, null])].sort(), [0]);
  assert.deepEqual([...L.backWith(undefined, undefined)], []);
});

test('slam_bg (không data-cid) đứng dưới cảnh front và mang nhãn nền', () => {
  const slam = { type: 'slam_bg', t0: 0, t1: 3 }, card = { type: 'media_card', t0: 0, t1: 3 };
  const scenes = [card, slam]; // slam_bg sau trong mảng nhưng engine vẽ nó ở back
  const comps = [
    { kind: 'clip', idx: 0, obj: {}, t0: 0, t1: 3, label: 'clip' },
    { kind: 'scene', obj: card, t0: 0, t1: 3, label: 'card' },
    { kind: 'scene', obj: slam, t0: 0, t1: 3, label: 'slam' },
    { kind: 'cap', obj: {}, t0: 0, t1: 3, label: 'cap' },
  ];
  const names = list => list.map(c => c.label);
  const dom = L.backSet([0]); // DOM chỉ thấy data-cid của card
  assert.deepEqual([...dom], []);
  assert.deepEqual(names(L.layerList(comps, scenes, 1, dom)), ['cap', 'slam', 'card', 'clip']); // lỗi cũ: slam đầu bảng
  const back = L.backWith(dom, [{ i: 0, back: false, front: true }, { i: 1, back: true, front: false }]);
  assert.ok(back.has(1));
  assert.deepEqual(names(L.layerList(comps, scenes, 1, back)), ['cap', 'card', 'slam', 'clip']);
  assert.equal(L.canDrop(comps[1], comps[2], scenes, back), false); // nền ↔ front không đổi chỗ
});

test('engine ghi DRAWN trong compose, không đổi HTML; bảng Lớp đọc drawnScenes', () => {
  const eng = read('../../engine/engine.js');
  assert.match(eng, /window\.drawnScenes = \(\) => DRAWN;/);
  assert.match(eng, /DRAWN\.push\(\{ i: TL\.scenes\.indexOf\(s0\), back: !!r\.back, front: !!r\.front \}\);/);
  // slam_bg vẫn chỉ trả back (không data-cid) — lý do cần khai báo module
  const mods = read('../../engine/modules.js');
  assert.match(mods, /slam_bg\(s, t\) \{[\s\S]{0,200}?return \{ back: techBg\(s, t\), person: true \};/);
  const ui = read('../../studio/features/67_layers.js');
  assert.match(ui, /L\.backWith\(L\.backSet\(seq\), drawn\)/);
  assert.match(ui, /S\.win\.drawnScenes\?\.\(\)/);
});
