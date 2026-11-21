// Màn kết thúc của hướng dẫn (02_onboarding.js savedRows) và gắn hồ sơ sản phẩm vào dự án (53_products.js adsWithProduct): hàm thuần.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const slice = (file, tag, names) => {
  const src = fs.readFileSync(new URL(`../../studio/features/${file}`, import.meta.url), 'utf8');
  const a = src.indexOf(`// <pure:${tag}>`), b = src.indexOf(`// </pure:${tag}>`);
  assert.ok(a > 0 && b > a, `thiếu khối pure:${tag} trong ${file}`);
  const ctx = {}; vm.runInNewContext(`${src.slice(a, b)};this.api = { ${names} };`, ctx); return ctx.api;
};
const { savedRows } = slice('02_onboarding.js', 'onbsaved', 'savedRows');
const { adsWithProduct } = slice('53_products.js', 'adsproduct', 'adsWithProduct');

test('dự án đang mở: sản phẩm đã gắn, chỉ chỗ xem lại kèm panel', () => {
  const r = savedRows({ brand: '82x Beauty', applied: true, product: { name: 'Placenta', attached: true }, kho: { exists: false, root: 'X' }, project: true });
  assert.equal(r.length, 3);
  assert.match(r[0].text, /82x Beauty.*áp vào dự án/); assert.equal(r[0].panel, 'brands'); assert.equal(r[0].where, 'Chuẩn bị → Thương hiệu');
  assert.match(r[1].text, /dự án đang mở dùng hồ sơ này/); assert.equal(r[1].panel, 'products'); assert.equal(r[1].where, 'Chuẩn bị → Sản phẩm');
  assert.equal(r[2].ok, false); assert.match(r[2].text, /Chưa tạo Kho/); assert.equal(r[2].lead, 'Tạo ở'); assert.equal(r[2].panel, 'kho');
});
test('dự án trỏ hồ sơ khác: không ghi đè, nói cách đổi', () => {
  const r = savedRows({ brand: 'B', product: { name: 'P', attached: false, other: true }, kho: { exists: true, root: 'D:/Kho' }, project: true });
  assert.match(r[1].text, /hồ sơ khác/);
  assert.equal(r[2].ok, true); assert.match(r[2].text, /D:\/Kho/);
});
test('không có dự án: không có nút mở, Kho tạo ở trang chủ', () => {
  const r = savedRows({ brand: 'B', product: { name: 'P', attached: false }, kho: null, project: false });
  assert.ok(r.every(x => !x.panel));
  assert.match(r[1].text, /Mở một dự án/);
  assert.match(r[2].where, /Trang chủ/);
});
test('không nhập sản phẩm: không có dòng sản phẩm', () => {
  const r = savedRows({ brand: 'B', product: null, kho: { exists: true, root: 'K' }, project: true });
  assert.deepEqual([...r.map(x => x.panel)], ['brands', 'kho']);
});
test('adsWithProduct bật quảng cáo, giữ ngành đã chọn', () => {
  assert.deepEqual({ ...adsWithProduct(undefined, { id: 'p1', industry: 'cosmetics' }) }, { on: true, product: 'p1', industry: 'cosmetics' });
  assert.deepEqual({ ...adsWithProduct({ industry: 'food', x: 1 }, { id: 'p2', industry: 'cosmetics' }) }, { industry: 'food', x: 1, on: true, product: 'p2' });
  assert.deepEqual({ ...adsWithProduct({}, { id: 'p3' }) }, { on: true, product: 'p3' });
});
