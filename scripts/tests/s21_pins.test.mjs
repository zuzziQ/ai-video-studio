// S21 M150: ghi chú ghim trên khung (studio/features/73_pins.core.js) + chỗ nối vào Studio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const P = createRequire(import.meta.url)('../../studio/features/73_pins.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

const comps = [
  { cid: 's0', kind: 'scene', t0: 2, t1: 5, label: 'Tiêu đề', obj: { cid: 's0', note: 'to hơn', note_at: { x: 100, y: 200, t: 3 } } },
  { cid: 'c1', kind: 'cap', t0: 6, t1: 7, label: 'xin chào', obj: { cid: 'c1', note: 'sai chính tả' } }, // ghi chú cũ, chưa có toạ độ
  { cid: 's1', kind: 'scene', t0: 0, t1: 9, label: 'Nền', obj: { cid: 's1', note: '   ' } }, // ghi chú rỗng: bỏ
  { cid: 'k0', kind: 'clip', t0: 0, t1: 9, label: 'Clip 1', obj: { cid: 'k0' } },
];
const pins = [{ x: 10, y: 20, t: 1, text: 'cắt đoạn đầu' }, { x: 5, y: 5, t: 3, text: 'thêm nhạc', done: true }, { x: 1, y: 1, t: 4, text: '' }];

test('gom ghi chú element + ghim chung, đánh số theo thời điểm', () => {
  const L = P.collect(comps, pins);
  assert.deepEqual(L.map(i => [i.n, i.kind, i.t, i.text]), [
    [1, 'pin', 1, 'cắt đoạn đầu'], [2, 'el', 3, 'to hơn'], [3, 'pin', 3, 'thêm nhạc'], [4, 'el', 6, 'sai chính tả']]);
  assert.equal(L[1].cid, 's0'); assert.equal(L[2].idx, 1); assert.equal(L[2].done, true);
  assert.equal(L[3].x, null, 'ghi chú cũ không có toạ độ: chỉ ở danh sách');
});

test('ghim hiện trong ±0.5 s của t, ghim element hiện cả khoảng của element', () => {
  const L = P.collect(comps, pins);
  const at = T => P.visibleAt(L, T).map(i => i.n);
  assert.deepEqual(at(1.4), [1]);
  assert.deepEqual(at(1.6), []);
  assert.deepEqual(at(2.1), [2], 'element hiện từ t0');
  assert.deepEqual(at(3.2), [2, 3]);
  assert.deepEqual(at(4.9), [2]);
  assert.deepEqual(at(5.2), [], 'qua khoảng element và xa t');
});

test('toạ độ trong khung, gắn element hay cả video', () => {
  assert.deepEqual(P.clampPt(-4, 2000.6, 1080, 1920), { x: 0, y: 1920 });
  assert.deepEqual(P.clampPt(10.4, 20.6, 1080, 1920), { x: 10, y: 21 });
  assert.equal(P.attachTo(null), null);
  assert.equal(P.attachTo(comps[3]), null, 'clip chính → cả video');
  assert.equal(P.attachTo({ kind: 'sfx', obj: {} }), null);
  assert.equal(P.attachTo(comps[0]), comps[0]);
});

test('chữ ký đổi khi nội dung / trạng thái đổi', () => {
  const a = P.sig(P.collect(comps, pins));
  assert.equal(a, P.sig(P.collect(comps, pins)));
  assert.notEqual(a, P.sig(P.collect(comps, [{ ...pins[0], done: true }, pins[1]])));
  assert.equal(P.mmss(63.25), '1:03.3');
});

test('nối vào Studio: nút, danh sách ở tab Claude (S24 M173), notes.md có ghim chung, Về thiết kế giữ note_at', () => {
  assert.match(read('studio/index.html'), /id="pinbtn"/);
  assert.match(read('studio/features/73_pins.js'), /S\.ask\?\.notes/);
  assert.match(read('studio/server.mjs'), /tl\.pins/);
  assert.match(read('studio/studio.js'), /k !== 'note_at'/);
  assert.match(read('studio/features/66_canvas_cmds.js'), /k !== 'note_at'/);
});

test('ghim element bám element khi element đã dời', () => {
  const it = { x: 100, y: 200 };
  assert.deepEqual(P.anchor(it, { x: 80, y: 180, w: 50, h: 40 }), { x: 100, y: 200 }, 'còn trong hộp');
  assert.deepEqual(P.anchor(it, { x: 300, y: 500, w: 50, h: 40 }), { x: 350, y: 500 }, 'đã dời: góc trên-phải');
  assert.deepEqual(P.anchor(it, null), { x: 100, y: 200 });
});
