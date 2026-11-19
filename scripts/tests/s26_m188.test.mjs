// S26 M188: trang chủ cho chọn thương hiệu cũ hay tạo mới; hướng dẫn chỉ tự mở khi chưa có thương hiệu.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('hướng dẫn không tự mở khi đã có thương hiệu', () => {
  const js = read('studio/features/02_onboarding.js');
  const boot = js.slice(js.indexOf('loadState().then(async s =>'));
  assert.ok(boot.indexOf('if (nb !== 0) return;') > -1 && boot.indexOf('if (nb !== 0) return;') < boot.indexOf('afterSetup(() => openWizard())'));
});

test('trang chủ có thẻ thương hiệu: Video mới / Dự án / Sửa / Thương hiệu mới', () => {
  const js = read('studio/features/02_onboarding.js');
  for (const h of ['bvid', 'bproj', 'bedit', 'bnew']) assert.match(js, new RegExp(`data-h="${h}"`), h);
  assert.match(js, /openWizard\(0, \{ fresh: true \}\)/);
  assert.match(js, /openWizard\(0, \{ brand: b\.dataset\.bid \}\)/);
  assert.match(js, /Studio\.newProject\(\{ brand: b\.dataset\.bid \}\)/);
  // tạo / sửa từ thẻ: 2 bước, không ghi bước của hướng dẫn
  assert.match(js, /last: mode \? 1 : 2/);
  assert.match(js, /saveState\(W\.mode \? \{ brand: b\.id \} : \{ brand: b\.id, step: 1 \}\)/);
  assert.match(js, /if \(!W\.mode\) await saveState\(\{ step: 2 \}\)/);
});

test('hộp Video mới nhận thương hiệu chọn sẵn', () => {
  const js = read('studio/studio.js');
  assert.match(js, /async function openNewProject\(opt = \{\}\)/);
  assert.match(js, /typeof opt\.brand === 'string'/);
  assert.match(js, /saveNow, newProject,/);
});
