// S22 M152: khung xem lại kết quả Claude (lõi studio/features/74_review.core.js) + chỗ nối vào Hỏi Claude và Viết lại.
// Chạy: node --test scripts/tests/s22_review.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const R = createRequire(import.meta.url)('../../studio/features/74_review.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('đoạn phát lặp: nới ±0,3 s, kẹp trong video, ngắn quá thì kéo tới tối thiểu', () => {
  assert.deepEqual(R.range(4, 6, 20), { a: 3.7, b: 6.3 });
  assert.deepEqual(R.range(0.1, 1, 20), { a: 0, b: 1.3 }, 'không âm');
  assert.deepEqual(R.range(19, 20, 20), { a: 18.7, b: 20 }, 'không quá cuối');
  const s = R.range(5, 5.03, 20); assert.ok(s.b - s.a >= R.MIN - 1e-9, 'element chỉ vài khung vẫn đủ nhìn');
  const e = R.range(19.9, 20, 20); assert.equal(e.b, 20); assert.ok(e.b - e.a >= R.MIN - 1e-9, 'sát cuối: lùi điểm đầu');
  assert.deepEqual(R.range(6, 4, 20), { a: 3.7, b: 6.3 }, 't0 > t1 thì đảo');
});

test('phát lặp: qua cuối đoạn hoặc tua về trước đầu đoạn thì về đầu đoạn', () => {
  const r = R.range(4, 6, 20);
  assert.equal(R.loopStep(5, r), null);
  assert.equal(R.loopStep(6.3, r), 3.7);
  assert.equal(R.loopStep(1, r), 3.7);
  assert.equal(R.loopStep(5, null), null);
  assert.equal(R.seekOf(r), 3.7);
});

const items = n => Array.from({ length: n }, (_, i) => ({ label: 'm' + i, t0: i * 2, t1: i * 2 + 1, apply() { return true; } }));

test('biến thể (C27): mở là xem phương án 1, bấm / phím chỉ đổi bản xem, Nhận một cái thì các cái khác thành bỏ', () => {
  const s = R.create({ mode: 'variants', items: items(3) });
  assert.equal(s.pick, 0); assert.deepEqual(R.previewIdx(s), [0]);
  assert.equal(R.pick(s, 2), true); assert.deepEqual(R.previewIdx(s), [2]);
  assert.equal(R.pick(s, 2), false, 'chọn lại cùng cái: không đổi');
  assert.equal(R.pick(s, 7), false);
  assert.deepEqual(s.items.map(x => x.st), ['open', 'open', 'open'], 'chọn chưa áp gì');
  const r = R.settle(s, 2, 'done');
  assert.equal(r.finished, true);
  assert.deepEqual(s.items.map(x => x.st), ['skip', 'skip', 'done']);
  assert.deepEqual(R.previewIdx(s), []);
});

test('danh sách: Nhận / Bỏ từng mục chuyển tới mục còn chờ kế tiếp; Nhận tất cả trả các mục còn chờ', () => {
  const s = R.create({ mode: 'list', items: items(4) });
  assert.equal(s.pick, -1); assert.equal(s.focus, 0); assert.deepEqual(R.previewIdx(s), [0, 1, 2, 3]);
  assert.equal(R.focus(s, 2), true); assert.equal(s.focus, 2);
  assert.deepEqual(R.settle(s, 2, 'done'), { finished: false, focus: 3, changed: true });
  assert.deepEqual(R.settle(s, 3, 'skip'), { finished: false, focus: 0, changed: true }, 'hết phía sau: vòng lại đầu');
  assert.equal(R.settle(s, 3, 'done').changed, false, 'mục đã xử lý: không đổi');
  assert.deepEqual(R.previewIdx(s), [0, 1], 'bản xem trước bỏ mục đã Nhận (đã vào timeline thật) và mục đã Bỏ');
  assert.deepEqual(R.settleAll(s), [0, 1]);
  assert.deepEqual(R.counts(s), { open: 0, done: 3, skip: 1 });
  assert.equal(R.create({ items: [] }).focus, -1);
});

test('phím: \\ = xem bản cũ, 1…3 đổi biến thể; đang gõ, có phím bổ trợ hay ở danh sách thì bỏ qua', () => {
  const v = R.create({ mode: 'variants', items: items(3) }), l = R.create({ mode: 'list', items: items(3) });
  assert.equal(R.keyAction({ key: '\\' }, v), 'before');
  assert.equal(R.keyAction({ key: '\\' }, l), 'before');
  assert.deepEqual(R.keyAction({ key: '2' }, v), { pick: 1 });
  assert.equal(R.keyAction({ key: '4' }, v), null);
  assert.equal(R.keyAction({ key: '2' }, l), null);
  assert.equal(R.keyAction({ key: '2', typing: true }, v), null);
  assert.equal(R.keyAction({ key: '\\', mod: true }, v), null);
  assert.equal(R.keyAction({ key: 'a' }, v), null);
});

test('vạch chia đôi kẹp 5–95 %; mốc thời gian ngắn', () => {
  assert.equal(R.splitX(150, 100, 200), 0.25);
  assert.equal(R.splitX(0, 100, 200), 0.05);
  assert.equal(R.splitX(999, 100, 200), 0.95);
  assert.equal(R.splitX(5, 0, 0), 0.5);
  assert.equal(R.stamp(4.24), '0:04.2'); assert.equal(R.stamp(75.5), '1:15.5'); assert.equal(R.stamp(-1), '0:00.0');
});

test('locate theo cid trên bản sao; áp lên bản sao không đụng bản gốc; markOrig giữ bản thiết kế một lần', () => {
  const tl = { scenes: [{ type: 'text', lines: [{ text: 'a' }, { text: 'b' }], badge: { text: 'x' } }, { type: 'emoji' }] };
  const cap = [{ t0: 0, t1: 1, words: [] }];
  assert.equal(R.locate(tl, cap, 's0l1').obj.text, 'b');
  assert.equal(R.locate(tl, cap, 's0b').obj.text, 'x');
  assert.equal(R.locate(tl, cap, 's1').obj.type, 'emoji');
  assert.equal(R.locate(tl, cap, 'c0').obj, cap[0]);
  for (const bad of ['s9', 's0l9', 's1b', 'c3', 'k0', '', null]) assert.equal(R.locate(tl, cap, bad), null, String(bad));
  const copy = JSON.parse(JSON.stringify(tl));
  R.locate(copy, cap, 's0l0').obj.text = 'mới';
  assert.equal(tl.scenes[0].lines[0].text, 'a');
  const o = { cid: 's0l0', text: 'a', size: 40 };
  R.markOrig(o); o.text = 'b'; R.markOrig(o);
  assert.deepEqual(o._orig, { text: 'a', size: 40 });
});

test('chỗ nối: Hỏi Claude và Viết lại xem qua Studio.review, bấm biến thể không áp (C27), xem trước không ghi timeline', () => {
  const ui = read('studio/features/74_review.js'), ai = read('studio/features/72_elem_ai.js'), rw = read('studio/features/06_ai_suggest.js');
  assert.match(ui, /S\.review = api/);
  assert.ok(!/S\.TL\s*=/.test(ui) && !/S\.CAP\s*=/.test(ui), 'khung xem lại không thay timeline thật');
  assert.match(ui, /S\.pushUndo\(\);[\s\S]{0,200}apply\(S\.TL, S\.CAP, true\)/, 'Nhận = một bước hoàn tác rồi áp');
  assert.ok(!/style="/.test(ui) && !/style="/.test(ai), 'không style="" trong markup');
  // 72: không còn áp tạm lên timeline thật, bấm biến thể = pick
  assert.ok(!/S\.TL\s*=/.test(ai) && !/startPreview|dropPreview/.test(ai));
  const varClick = /const v = e\.target\.closest\('\[data-eaivar\]'\);([\s\S]*?)\n {4}const a = /.exec(ai)[1];
  assert.match(varClick, /RV\(\)\.pick\(i\)/);
  assert.ok(!/accept\(|applyPatch|touch\(/.test(varClick), 'bấm biến thể không áp');
  assert.match(ai, /openReview\('variants'/); assert.match(ai, /openReview\('list'/);
  // 06: Viết lại = biến thể, phụ đề = danh sách
  assert.match(rw, /owner: 'rewrite'[\s\S]{0,200}mode: 'variants'/);
  assert.match(rw, /owner: 'caps'[\s\S]{0,120}mode: 'list'/);
});
