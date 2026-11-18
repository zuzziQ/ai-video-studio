// S23 M163: Hỏi Claude cạnh khung khi video dọc — dạng cột / dòng theo Studio.layout (lõi 75_ask.core.js: formOf, colParts),
// chỗ nối trong 75_ask.js / 74_review.js và khối CSS "S23 M163" của studio.css.
// Chạy: node --test scripts/tests/s23_m163.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const req = createRequire(import.meta.url);
const AC = req('../../studio/features/75_ask.core.js');
const LC = req('../../studio/features/76_layout.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('dạng thanh theo bố cục: cột chỉ khi Cơ bản + video dọc + cửa sổ đủ rộng (C30, C31)', () => {
  const f = o => AC.formOf(LC.compute(o));
  assert.equal(f({ ratio: 9 / 16, mode: 'basic', width: 1600 }), 'col');
  assert.equal(f({ ratio: 4 / 5, mode: 'basic', width: 1600 }), 'row', '4:5 = 0,8 không dưới ngưỡng');
  assert.equal(f({ ratio: 16 / 9, mode: 'basic', width: 1600 }), 'row', 'video ngang: một dòng dưới khung');
  assert.equal(f({ ratio: 9 / 16, mode: 'pro', width: 1600 }), 'row', 'Chuyên nghiệp: Thuộc tính ở cột phải, Claude một dòng');
  assert.equal(f({ ratio: 9 / 16, mode: 'basic', width: 1100 }), 'row', 'cửa sổ hẹp');
  assert.equal(f({ ratio: 16 / 9, mode: 'basic', width: 1600, pin: 'side' }), 'col', 'ghim Claude cạnh khung');
  assert.equal(AC.formOf(null), 'row');
});

test('phần vào cột: thanh xem lại khi đang xem lại, Thuộc tính khi chọn element hoặc xem chi tiết mục thư viện', () => {
  assert.deepEqual(AC.colParts('col', { review: true }), { rv: true, insp: false });
  assert.deepEqual(AC.colParts('col', { sel: true }), { rv: false, insp: true });
  assert.deepEqual(AC.colParts('col', { detail: true }), { rv: false, insp: true });
  assert.deepEqual(AC.colParts('row', { review: true, sel: true }), { rv: false, insp: false });
  assert.deepEqual(AC.colParts('col'), { rv: false, insp: false });
});

test('hợp đồng việc của 75_ask.core.js không đổi', () => {
  assert.ok(AC.actionsOf(AC.scopeOf({ step: 'build' })).some(a => a.id === 'ai_build'));
  for (const k of ['scopeOf', 'actionsOf', 'quickOf', 'checkPick']) assert.equal(typeof AC[k], 'function');
});

test('75_ask.js dời #rvbar / #insp theo dạng; 74_review.js gọi place ngay khi tạo thanh; thanh ẩn thì trả về chỗ cũ', () => {
  const a = read('studio/features/75_ask.js');
  assert.match(a, /const f = scope\(\) \? AC\.formOf\(S\.layout\?\.get\(\)\) : 'row';/);
  assert.match(a, /slotRv\.append\(rv\)/);
  assert.match(a, /\$\('#controls'\)\?\.before\(rv\)/);
  assert.match(a, /slotIn\.append\(ins\)/);
  assert.match(a, /right\.append\(ins\)/);
  assert.match(a, /S\.layout\?\.on\(\(\) => place\(\)\)/);
  assert.match(a, /function check\(\) \{\s+place\(\);/);
  assert.match(read('studio/features/74_review.js'), /S\.ask\?\.place\?\.\(\);/);
});

test('CSS khối S23 M163: cột thay cột phải ở Cơ bản, Chuyên nghiệp video dọc về một dòng, dòng chỉ hiện gợi ý khi gõ', () => {
  const css = read('studio/studio.css'), i = css.indexOf('/* S23 M163');
  assert.ok(i > 0, 'có khối S23 M163');
  const blk = css.slice(i);
  assert.match(blk, /body\.wf-basic\[data-right="claude"\]:not\(\[data-focus\]\) main:has\(#askbar:not\(\[hidden\]\)\) > #center \{ grid-column: span 2; \}/);
  assert.match(blk, /main:has\(#askbar:not\(\[hidden\]\)\) > #right \{ display: none; \}/);
  assert.match(blk, /body\[data-ask="side"\]:not\(\[data-right="claude"\]\) #center:has\(> #askbar:not\(\[hidden\]\)\) \{ display: flex; \}/);
  assert.match(blk, /#askbar\[data-form="row"\]:not\(:focus-within\) \.ask-quick \{ display: none; \}/);
  assert.match(blk, /#askbar\[data-form="col"\] \.ask-out \{ max-height: none;/);
});
