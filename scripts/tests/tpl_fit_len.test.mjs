// "Bám lời thoại" không được viết chữ dài hơn ô của graphic (chữ bị khung cắt, vd lower-third "…EDIT TỰ ĐỘNG").
import test from 'node:test';
import assert from 'node:assert/strict';
import { maxLen, clampLen } from '../tpl_fit.mjs';

test('maxLen: ô ngắn thêm vài ký tự, ô dài thêm ~15 %', () => {
  assert.equal(maxLen('TIN NÓNG'), 12);
  assert.equal(maxLen('Khai trương chi nhánh mới'), 29);
});

test('clampLen cắt theo từ, bỏ từ nối treo ở cuối', () => {
  const v = clampLen('Video clip được edit tự động bằng AI', maxLen('Khai trương chi nhánh mới'));
  assert.equal(v, 'Video clip được edit tự động');
  assert.ok([...v].length <= 29);
  assert.equal(clampLen('Mua ngay và nhận quà', 13), 'Mua ngay');
  assert.equal(clampLen('Ngắn gọn', 20), 'Ngắn gọn');
});

test('clampLen: một từ dài hơn giới hạn thì cắt cứng', () => {
  assert.equal(clampLen('ABCDEFGHIJ', 4), 'ABCD');
});
