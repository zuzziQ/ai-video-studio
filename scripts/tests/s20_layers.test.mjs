// S20 M142: bảng Lớp tại playhead, quét chọn, bấm lặp chọn lớp dưới (studio/features/67_layers.core.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const L = createRequire(import.meta.url)('../../studio/features/67_layers.core.js');

// Mô phỏng build() của studio.js: comp cho clip, cảnh, chữ, node, phụ đề, âm thanh.
function fixture() {
  const bg = { type: 'media_card', t0: 0, t1: 5 };
  const txt = { type: 'text', t0: 0, t1: 5, lines: [{ text: 'Chữ thêm' }] };
  const g = { type: 'diagram', t0: 1, t1: 4, lines: [{ text: 'A' }, { text: 'B' }], nodes: [{ text: 'n' }] };
  const late = { type: 'sticker', t0: 6, t1: 8 };
  const scenes = [bg, txt, g, late];
  const cap = { t0: 0, t1: 5 }, clip = { src: 'a.mp4' };
  const comps = [
    { obj: clip, kind: 'clip', idx: 0, t0: 0, t1: 10 },
    { obj: bg, kind: 'scene', scene: bg, t0: 0, t1: 5 },
    { obj: txt.lines[0], kind: 'line', scene: txt, t0: 0, t1: 5 },
    { obj: g, kind: 'scene', scene: g, t0: 1, t1: 4 },
    { obj: g.lines[0], kind: 'line', scene: g, t0: 1, t1: 4 },
    { obj: g.lines[1], kind: 'line', scene: g, t0: 1, t1: 4 },
    { obj: g.nodes[0], kind: 'node', scene: g, t0: 1, t1: 4 },
    { obj: late, kind: 'scene', scene: late, t0: 6, t1: 8 },
    { obj: cap, kind: 'cap', t0: 0, t1: 5 },
    { obj: { name: 'pop' }, kind: 'sfx', t0: 2, t1: 2.45 },
  ];
  return { scenes, comps, bg, txt, g, late, cap, clip };
}
const names = list => list.map(c => c.obj.text || c.obj.type || (c.kind === 'cap' ? 'cap' : c.kind));

test('thứ tự hiển thị: phụ đề trên cùng, cảnh sau ở trên, clip ở đáy, chỉ element tại playhead', () => {
  const f = fixture();
  assert.deepEqual(names(L.layerList(f.comps, f.scenes, 2)), ['cap', 'n', 'B', 'A', 'diagram', 'Chữ thêm', 'media_card', 'clip']);
  assert.deepEqual(names(L.layerList(f.comps, f.scenes, .5)), ['cap', 'Chữ thêm', 'media_card', 'clip']); // diagram chưa vào, sfx không có lớp
  assert.deepEqual(names(L.layerList(f.comps, f.scenes, 7)), ['sticker', 'clip']);
});

test('kéo được: cảnh, chữ thêm, chữ graphic; không kéo: phụ đề, clip', () => {
  const f = fixture(), by = t => f.comps.find(c => (c.obj.text || c.obj.type) === t);
  assert.ok(L.canDrag(by('media_card'), f.scenes));
  assert.ok(L.canDrag(by('Chữ thêm'), f.scenes));
  assert.ok(L.canDrag(by('A'), f.scenes));
  assert.ok(!L.canDrag(by('n'), f.scenes), 'một node duy nhất: không có chỗ đổi');
  assert.ok(!L.canDrag(f.comps.find(c => c.kind === 'cap'), f.scenes));
  assert.ok(!L.canDrag(f.comps[0], f.scenes));
});

test('thả đổi thứ tự trong cùng mảng, không cho giữa hai mảng', () => {
  const f = fixture(), by = t => f.comps.find(c => (c.obj.text || c.obj.type) === t);
  // nền lên trên chữ thêm (above) → scenes: txt, bg, g, late
  assert.ok(L.dropOn(by('media_card'), by('Chữ thêm'), true, f.scenes));
  assert.deepEqual(f.scenes.map(s => s.type), ['text', 'media_card', 'diagram', 'sticker']);
  // thả lại đúng chỗ cũ: không đổi
  assert.ok(!L.dropOn(by('media_card'), by('Chữ thêm'), true, f.scenes));
  // chữ graphic A lên trên B
  assert.ok(L.dropOn(by('A'), by('B'), true, f.scenes));
  assert.deepEqual(f.g.lines.map(x => x.text), ['B', 'A']);
  // cảnh thả lên chữ graphic (mảng khác): từ chối, không đổi gì
  assert.ok(!L.canDrop(by('media_card'), by('A'), f.scenes));
  assert.ok(!L.dropOn(by('media_card'), by('A'), false, f.scenes));
  assert.ok(!L.canDrop(by('A'), by('n'), f.scenes), 'lines và nodes là hai mảng');
});

test('reorder: below chèn trước target trong mảng', () => {
  const a = ['a', 'b', 'c', 'd'];
  assert.ok(L.reorder(a, 'd', 'a', false)); assert.deepEqual(a, ['d', 'a', 'b', 'c']);
  assert.ok(L.reorder(a, 'd', 'c', true)); assert.deepEqual(a, ['a', 'b', 'c', 'd']);
  assert.ok(!L.reorder(a, 'x', 'a', true));
  assert.ok(!L.reorder(a, 'a', 'a', true));
});

test('quét chọn: giao hộp, bỏ element đầy khung, Shift cộng thêm', () => {
  const box = L.normBox(300, 400, 100, 100);
  assert.deepEqual(box, { x: 100, y: 100, w: 200, h: 300 });
  const items = [
    { c: 'trong', r: { x: 150, y: 150, w: 20, h: 20 } },
    { c: 'chạm mép', r: { x: 300, y: 380, w: 50, h: 50 } },
    { c: 'ngoài', r: { x: 400, y: 100, w: 30, h: 30 } },
    { c: 'nền', r: { x: 0, y: 0, w: 720, h: 1280 } },
    { c: 'rỗng', r: null },
  ];
  assert.deepEqual(L.marqueeHits(items, box, { DW: 720, DH: 1280 }), ['trong', 'chạm mép']);
  assert.deepEqual(L.marqueeHits(items, box), ['trong', 'chạm mép', 'nền'], 'không có khung: không lọc nền');
  assert.deepEqual(L.mergeSel([], ['a', 'b']), { sel: 'a', multi: ['b'] });
  assert.deepEqual(L.mergeSel(['x', 'a'], ['a', 'b']), { sel: 'x', multi: ['a', 'b'] });
  assert.deepEqual(L.mergeSel([null], []), { sel: null, multi: [] });
});

test('bấm lặp: lớp kế tiếp bên dưới, hết thì vòng lên đầu', () => {
  const st = ['chữ', 'thẻ', 'nền'];
  assert.equal(L.nextBelow(st, 'chữ'), 'thẻ');
  assert.equal(L.nextBelow(st, 'thẻ'), 'nền');
  assert.equal(L.nextBelow(st, 'nền'), 'chữ');
  assert.equal(L.nextBelow(st, 'khác'), 'chữ');
  assert.equal(L.nextBelow([], 'chữ'), null);
});

test('studio.js nối quét chọn, bấm lặp và tab Lớp; không sửa pick()', () => {
  const s = fs.readFileSync(new URL('../../studio/studio.js', import.meta.url), 'utf8');
  assert.match(s, /function pickAll\(px, py\)/);
  assert.match(s, /Layers\.nextBelow/);
  assert.match(s, /Layers\.marqueeHits/);
  assert.match(s, /addCompTab/);
  const lib = fs.readFileSync(new URL('../../studio/library.js', import.meta.url), 'utf8');
  assert.match(lib, /COMP_EXT/);
  const f = fs.readFileSync(new URL('../../studio/features/67_layers.js', import.meta.url), 'utf8');
  assert.doesNotMatch(f, /style="/, 'markup không có thuộc tính style (M85)');
  assert.match(f, /obj\.locked/);
});
