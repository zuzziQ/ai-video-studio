// S26 M183: thương hiệu mặc định của Tự lái, chuỗi "bỏ qua" của việc đã xong (hàm thuần trong studio/features/02_onboarding.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../../studio/features/02_onboarding.js', import.meta.url), 'utf8');
const a = src.indexOf('// <pure:apdefaults>'), b = src.indexOf('// </pure:apdefaults>');
assert.ok(a > 0 && b > a, 'thiếu khối pure:apdefaults');
const ctx = {};
vm.runInNewContext(src.slice(a, b) + ';this.api = { apPickBrand, apKhoText, apSkipText };', ctx);
const { apPickBrand: pick, apKhoText: kho, apSkipText: skip } = ctx.api;
const B = [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }];

test('thương hiệu mặc định: hướng dẫn đầu, hoặc duy nhất', () => {
  assert.equal(pick({ saved: '', onboard: 'b', brands: B }), 'b');
  assert.equal(pick({ saved: '', onboard: '', brands: [B[0]] }), 'a');
  assert.equal(pick({ saved: '', onboard: 'x', brands: B }), ''); // hai thương hiệu, hướng dẫn trỏ thương hiệu đã xoá
  assert.equal(pick({ saved: '', onboard: '', brands: [] }), '');
});
test('lựa chọn của người dùng được giữ', () => {
  assert.equal(pick({ saved: 'a', onboard: 'b', brands: B }), 'a');
  assert.equal(pick({ saved: '__none', onboard: 'b', brands: B }), '__none');
  assert.equal(pick({ saved: 'gone', onboard: 'b', brands: B }), 'b'); // thương hiệu đã chọn bị xoá
});
test('chữ Kho đích', () => {
  assert.match(kho('a', B), /Kho Alpha/);
  assert.match(kho('__none', B), /Kho Chung/);
  assert.match(kho('', B), /hồ sơ/);
});
test('chuỗi bỏ qua chỉ lấy bước warn', () => {
  const s = { new: { state: 'done' }, ai: { state: 'warn', label: 'AI dựng', msg: 'chưa đăng nhập Claude' }, publish: { state: 'warn', label: 'Đăng', msg: 'chưa nối tài khoản' }, qc: { state: 'skipped', label: 'QC' } };
  assert.equal(skip(s), 'Xong · bỏ qua: AI dựng (chưa đăng nhập Claude), Đăng (chưa nối tài khoản)');
  assert.equal(skip({ ai: { state: 'done' } }), '');
  assert.equal(skip(undefined), '');
});
