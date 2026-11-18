// S21 M145: cột phải kiểu Adobe — nhóm tab Thuộc tính · Lớp · Dự án (studio/features/68_right.core.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const C = createRequire(import.meta.url)('../../studio/features/68_right.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('ba tab theo thứ tự Thuộc tính · Lớp · Claude (S24 M174 bỏ Dự án)', () => {
  assert.deepEqual(C.KEYS, ['props', 'layers', 'claude']);
  assert.ok(C.valid('layers')); assert.equal(C.valid('x'), false);
});

test('tab lúc mở: tab đã lưu nếu hợp lệ, không thì theo trạng thái chọn', () => {
  assert.equal(C.initialTab('layers', false), 'layers');
  assert.equal(C.initialTab(null, true), 'props');
  assert.equal(C.initialTab('bogus', false), 'claude');
});

test('tự đổi tab khi chọn / bỏ chọn, không giành tab Lớp', () => {
  assert.equal(C.nextTab({ tab: 'claude', had: false, has: true, auto: true }), 'props'); // Claude tự về khi bỏ chọn → chọn lại thì Thuộc tính
  assert.equal(C.nextTab({ tab: 'props', had: true, has: false }), 'claude');
  assert.equal(C.nextTab({ tab: 'props', had: true, has: false, detail: true }), 'props'); // đang xem chi tiết mục thư viện
  assert.equal(C.nextTab({ tab: 'layers', had: false, has: true }), 'layers');
  assert.equal(C.nextTab({ tab: 'layers', had: true, has: false }), 'layers');
  assert.equal(C.nextTab({ tab: 'claude', had: true, has: true, auto: true }), 'claude'); // đang chọn sẵn: không giành
  assert.equal(C.nextTab({ tab: 'props', had: true, has: true }), 'props');
  assert.equal(C.nextTab({ tab: 'nope', had: false, has: true }), 'props');
  assert.equal(C.tabForDetail(), 'props');
});

test('studio.js / index.html / 67_layers / 03_nextstep nối đúng', () => {
  const s = read('studio/studio.js');
  for (const x of ['window.RightCore', 'right: { get tab()', 'setDetail(d)', "rtStore.set(k)", 'data-rtab']) assert.ok(s.includes(x), `studio.js thiếu ${x}`);
  assert.match(read('studio/index.html'), /<aside id="right"><div id="rtabs" role="tablist"[^>]*><\/div><div id="insp"><\/div><\/aside>/);
  const ly = read('studio/features/67_layers.js');
  assert.match(ly, /S\.right\.addTab\('layers'/);
  assert.doesNotMatch(ly, /S\.addCompTab\(/);
  assert.doesNotMatch(read('studio/features/03_nextstep.js'), /'project'/); // S24 M174: không còn tab Dự án
  assert.match(read('studio/library.js'), /Studio\.right\.refresh\(\)/);
});
