// S16 M121: chọn thương hiệu / sản phẩm ở panel Tự lái → settings + tham số job autopilot.mjs.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-s16-prep-'));
process.env.AVS_HOME = TMP;
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const Q = await import('../queue.mjs');

const job = opts => Q.argsFor({ kind: 'autopilot', input: 'C:/v/a.mp4', opts });
const val = (A, k) => { const i = A.indexOf(k); return i < 0 ? undefined : A[i + 1]; };

test('argsFor: thương hiệu và sản phẩm chọn trước đi vào --brand / --product', () => {
  const A = job({ profile: 'mac-dinh', brand: 'tiem-banh', product: 'banh-mi' });
  assert.equal(val(A, '--brand'), 'tiem-banh');
  assert.equal(val(A, '--product'), 'banh-mi');
});

test('argsFor: "__none" = không thương hiệu (Kho Chung) → --brand ""; trống = theo hồ sơ (không truyền)', () => {
  assert.equal(val(job({ brand: '__none' }), '--brand'), '');
  assert.equal(job({ brand: '' }).includes('--brand'), false);
  assert.equal(job({}).includes('--product'), false);
});

test('settings nhớ lựa chọn gần nhất', () => {
  assert.equal(Q.loadSettings().brand, '');
  Q.saveSettings({ brand: 'tiem-banh', product: 'banh-mi' });
  const s = Q.loadSettings();
  assert.equal(s.brand, 'tiem-banh'); assert.equal(s.product, 'banh-mi');
});
