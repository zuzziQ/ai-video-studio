// Sửa thương hiệu từ trang chủ (02_onboarding.js): bộ nhận diện AI đã Nhận phải dựng lại từ kit và lưu lại không mất trường.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../../studio/features/02_onboarding.js', import.meta.url), 'utf8');
const a = src.indexOf('// <pure:onbkit>'), b = src.indexOf('// </pure:onbkit>');
assert.ok(a > 0 && b > a, 'thiếu khối pure:onbkit');
const ctx = {}; vm.runInNewContext(`${src.slice(a, b)};this.api = { BRAND_EXTRA, kitExtra, fontLabel, fontValue };`, ctx);
const { BRAND_EXTRA, kitExtra, fontLabel, fontValue } = ctx.api;

const KIT = { id: '82x-beauty-20d5', title: '82x Beauty', primary: '#c8102e', accent: '#f4c2c2', dark: '#1a0b10', light: '#fff7f8',
  font: '"Be Vietnam Pro", sans-serif', disp: '"Playfair Display", serif', voice: 'sang trọng, tin cậy', slogan: 'Đẹp từ bên trong', cta: 'Đặt ngay', outro: 'Follow 82x Beauty', website: '82x.vn' };

test('mở để sửa: dựng lại đủ các trường AI từ kit', () => {
  const x = kitExtra(KIT);
  assert.deepEqual(Object.keys(x).sort(), ['cta', 'dark', 'disp', 'font', 'light', 'outro', 'slogan', 'voice']);
  assert.equal(x.voice, 'sang trọng, tin cậy'); assert.equal(x.font, KIT.font);
});
test('khoá trống hoặc vắng không vào extra (không gửi "" làm server xoá)', () => {
  assert.deepEqual({ ...kitExtra({ dark: '', slogan: null, cta: 'Gọi' }) }, { cta: 'Gọi' });
  assert.deepEqual({ ...kitExtra(null) }, {});
});
test('lưu lại: payload giữ mọi trường AI như cũ khi không sửa', () => {
  const extra = kitExtra(KIT);
  // ô font hiện tên, đọc lại không đổi chuỗi CSS
  extra.font = fontValue(fontLabel(extra.font), extra.font); extra.disp = fontValue(fontLabel(extra.disp), extra.disp);
  const brand = Object.assign({ title: KIT.title, id: KIT.id }, extra);
  for (const k of BRAND_EXTRA) assert.equal(brand[k], KIT[k], k);
});
test('fontValue: tên mới thành CSS, ô trống bỏ font, bỏ ký tự lạ', () => {
  assert.equal(fontLabel('"Be Vietnam Pro", sans-serif'), 'Be Vietnam Pro');
  assert.equal(fontValue('Inter', '"Be Vietnam Pro", sans-serif'), '"Inter", sans-serif');
  assert.equal(fontValue('  ', '"Inter", sans-serif'), '');
  assert.equal(fontValue('Inter";}', ''), '"Inter", sans-serif');
});
