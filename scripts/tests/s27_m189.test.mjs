// S27 M189: mẫu của thương hiệu — gán mẫu người dùng cho thương hiệu, mẫu mặc định trong brand kit, thư viện / Video mới / trang chủ.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTemplateBrand } from '../../studio/routes/56_brandtpl.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('setTemplateBrand: gán, bỏ gán, chặn id lạ / thương hiệu lạ / mẫu không phải của người dùng', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm189-'));
  fs.writeFileSync(path.join(dir, 'u-mau-a.json'), JSON.stringify({ id: 'u-mau-a', name: 'A' }));
  assert.deepEqual(setTemplateBrand(dir, 'u-mau-a', 'nha-dep-1a2b', ['nha-dep-1a2b']), { ok: true, id: 'u-mau-a', brand_id: 'nha-dep-1a2b' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'u-mau-a.json'), 'utf8')).brand_id, 'nha-dep-1a2b');
  assert.equal(setTemplateBrand(dir, 'u-mau-a', '', []).ok, true);
  assert.equal('brand_id' in JSON.parse(fs.readFileSync(path.join(dir, 'u-mau-a.json'), 'utf8')), false);
  assert.equal(setTemplateBrand(dir, '../index', '', []).status, 400);
  assert.equal(setTemplateBrand(dir, 'U-A', '', []).status, 400);
  assert.equal(setTemplateBrand(dir, 'u-mau-a', 'khong-co', ['nha-dep-1a2b']).status, 404);
  assert.equal(setTemplateBrand(dir, 'bds-can-ho', '', []).status, 404); // mẫu có sẵn của repo không nằm trong templates/user
  fs.writeFileSync(path.join(dir, 'u-hong.json'), '[]');
  assert.equal(setTemplateBrand(dir, 'u-hong', '', []).status, 409);
  assert.deepEqual(fs.readdirSync(dir).filter(f => f.endsWith('.tmp')), []);
});

test('brand kit có khoá tpl (mẫu mặc định), kiểm dạng id', () => {
  const js = read('studio/routes/51_brands.mjs');
  assert.match(js, /KEYS\.push\('tpl'\)/);
  assert.match(js, /src\.tpl && !\/\^\[A-Za-z0-9_-\]\{1,80\}\$\/\.test/);
});

test('thư viện: nhóm "Của <thương hiệu>", mẫu của thương hiệu đứng đầu, gán / mặc định, Lưu thành mẫu có thương hiệu', () => {
  const js = read('studio/library.js');
  assert.match(js, /const brandCat = \(\) =>/);
  assert.match(js, /\.sort\(\(a, b\) => tplRank\(a\) - tplRank\(b\)\)/);
  assert.match(js, /api\('\/api\/templates\/brand', \{ id, brand \}\)/);
  assert.match(js, /api\('\/api\/brands\/save', \{ brand: \{ id: cb\.id, tpl \} \}\)/);
  assert.match(js, /brand_id: \$\('#tbrand'\)\.value \|\| undefined/);
  assert.match(js, /Studio\.newProject\(\{ brand: br, tpl: tp\.id \}\)/);
});

test('Video mới đề nghị mẫu mặc định / mẫu chọn ở trang chủ, áp sau bản khởi đầu', () => {
  const js = read('studio/studio.js');
  assert.match(js, /id="ntplrow"/);
  assert.match(js, /sessionStorage\.setItem\('avs-apply-tpl', useTpl\)/);
  assert.match(js, /Studio\.onReady\(\(\) => setTimeout\(applyPendingTemplate, 0\)\)/);
  assert.match(js, /openTemplates: openTemplatesFor/);
  assert.match(read('studio/features/02_onboarding.js'), /data-h="btpl"/);
});
