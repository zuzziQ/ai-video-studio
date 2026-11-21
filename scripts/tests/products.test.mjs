// Product Brain (ROADMAP M18): scripts/products.mjs + route studio/routes/53_products.mjs through the real server.
// run: node --test scripts/tests/products.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { productFile, validId, newId, normalizeProduct, effectiveStatus, saveProduct, loadProduct, listProducts, deleteProduct,
  saveProductImage, productImage, copyProductImage, productHero, imageKind } from '../products.mjs';
import { tokenFile } from '../../studio/security.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-prod-'));
const HOME = path.join(TMP, 'home');
const DIR = path.join(HOME, 'products');
fs.mkdirSync(HOME, { recursive: true });
fs.writeFileSync(path.join(HOME, 'config.json'), '{"secret":1}');
const PROJ = path.join(TMP, 'proj');
fs.mkdirSync(PROJ, { recursive: true });
fs.writeFileSync(path.join(PROJ, 'timeline.json'), JSON.stringify({ width: 720, height: 1280, duration: 2, scenes: [] }));
const SERUM = { name: 'Serum Đầu Nhỏ Giọt', industry: 'cosmetics', claims: [
  { text: 'Đầu nhỏ giọt giúp kiểm soát lượng dùng', status: 'approved', evidence: 'Thử nghiệm nội bộ' },
  { text: 'Trị dứt điểm mụn', status: 'prohibited' },
  { text: '  ', status: 'approved' },
], blocked: 'tên đối thủ\n\ntên đối thủ\ngiá rẻ nhất', faq: [{ q: 'Dùng mấy lần?', a: 'Hai lần mỗi ngày' }, { q: '' }] };

test('ids: only [a-z0-9_-], never a path', () => {
  for (const bad of ['../config', '..', 'a/b', 'image', 'use-image', 'save', 'delete', 'a\\b', 'C:x', 'Serum', '.x', 'a.json', 'x'.repeat(65), '', null, 5, 'ok\n'])
    assert.throws(() => productFile(bad, DIR), e => e.status === 400, String(bad));
  assert.equal(validId('serum-x_1'), true);
  assert.match(newId('Kem Dưỡng Đêm!'), /^kem-duong-dem-[0-9a-f]{4}$/);
  assert.match(newId('***'), /^san-pham-[0-9a-f]{4}$/);
});

test('normalize: trims, dedupes, drops empties, approved needs evidence', () => {
  const p = normalizeProduct(SERUM);
  assert.equal(p.claims.length, 2);
  assert.deepEqual(p.claims.map(c => [c.id, c.status]), [['c1', 'approved'], ['c2', 'prohibited']]);
  assert.deepEqual(p.blocked, ['tên đối thủ', 'giá rẻ nhất']);
  assert.deepEqual(p.faq, [{ q: 'Dùng mấy lần?', a: 'Hai lần mỗi ngày' }]);
  assert.throws(() => normalizeProduct({ name: 'x', claims: [{ text: 'a', status: 'approved' }] }), /bằng chứng/);
  assert.equal(normalizeProduct({ name: 'x', claims: [{ text: 'a', status: 'approved' }] }, { strict: false }).claims[0].status, 'approved');
  assert.throws(() => normalizeProduct({ name: ' ' }), /tên/);
  assert.equal(normalizeProduct({ name: 'x', claims: [{ text: 'a', status: 'bogus' }] }).claims[0].status, 'pending');
  assert.equal(normalizeProduct({ name: 'x', industry: 'weapons' }).industry, '');
});

test('effectiveStatus: approved past its expiry is expired', () => {
  assert.equal(effectiveStatus({ status: 'approved', expires: '2020-01-01' }, '2026-11-13'), 'expired');
  assert.equal(effectiveStatus({ status: 'approved', expires: '2027-01-01' }, '2026-11-13'), 'approved');
  assert.equal(effectiveStatus({ status: 'pending', expires: '2020-01-01' }, '2026-11-13'), 'pending');
});

test('save / load / list / delete round trip', () => {
  const d = path.join(TMP, 'unit');
  const a = saveProduct(SERUM, d);
  assert.match(a.id, /^serum-dau-nho-giot-/);
  assert.ok(a.created && a.updated);
  const again = saveProduct({ ...a, name: 'Serum mới' }, d);
  assert.equal(again.id, a.id);
  assert.equal(again.created, a.created);
  assert.equal(loadProduct(a.id, d).name, 'Serum mới');
  fs.writeFileSync(path.join(d, 'broken.json'), '{not json');
  fs.writeFileSync(path.join(d, 'Bad.Name.json'), '{}');
  const l = listProducts(d);
  assert.deepEqual(l.map(x => x.id), [a.id]);
  assert.deepEqual(l[0].claims, { approved: 1, pending: 0, prohibited: 1, expired: 0 });
  assert.equal(fs.readdirSync(d).some(f => f.endsWith('.tmp')), false);
  deleteProduct(a.id, d);
  assert.throws(() => loadProduct(a.id, d), e => e.status === 404);
  assert.deepEqual(listProducts(path.join(TMP, 'none')), []);
});

test('a symlink out of products/ is refused', t => {
  const d = path.join(TMP, 'link');
  fs.mkdirSync(d, { recursive: true });
  try { fs.symlinkSync(path.join(HOME, 'config.json'), path.join(d, 'evil.json'), 'file'); } catch { return t.skip('no symlink permission'); }
  assert.throws(() => loadProduct('evil', d), e => e.status === 403);
  assert.deepEqual(listProducts(d), []);
});

// ---------- ảnh của hồ sơ: products/<id>/image.<ext> ----------
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(24, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16, 3)]);

test('imageKind: PNG / JPEG / WebP by their first bytes only', () => {
  assert.equal(imageKind(PNG), 'png');
  assert.equal(imageKind(JPG), 'jpg');
  assert.equal(imageKind(WEBP), 'webp');
  assert.equal(imageKind(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), '');
  assert.equal(imageKind(Buffer.from('GIF89a......')), '');
  assert.equal(imageKind(Buffer.alloc(3)), '');
});

test('image: save, replace, keep on profile save, clear, delete removes the folder', () => {
  const d = path.join(TMP, 'img');
  const old = saveProduct({ name: 'Hồ sơ cũ' }, d); // hồ sơ trước khi có trường ảnh: không có image, vẫn chạy như trước
  assert.equal('image' in loadProduct(old.id, d), false);
  assert.equal(productImage(old.id, d), null);
  assert.equal(copyProductImage(path.join(TMP, 'p-none'), old.id, d), '');
  assert.equal(productHero('.', { ads: { product: old.id } }, d).image, '');

  const a = saveProduct({ name: 'Serum ảnh' }, d);
  assert.equal(saveProductImage(a.id, PNG, d).image, 'image.png');
  assert.ok(fs.existsSync(path.join(d, a.id, 'image.png')));
  assert.equal(saveProductImage(a.id, JPG, d).image, 'image.jpg'); // thay ảnh: ảnh cũ khác đuôi bị xoá
  assert.deepEqual(fs.readdirSync(path.join(d, a.id)), ['image.jpg']);
  // lưu hồ sơ (client không gửi image, hoặc gửi tên lạ) giữ ảnh đang có; không đặt được tên file khác
  assert.equal(saveProduct({ ...loadProduct(a.id, d), image: undefined, name: 'Serum ảnh 2' }, d).image, 'image.jpg');
  assert.equal(saveProduct({ ...loadProduct(a.id, d), image: '../config.json' }, d).image, 'image.jpg');
  assert.equal(saveProduct({ ...loadProduct(a.id, d), image: 'image.png' }, d).image, 'image.jpg');
  assert.equal(normalizeProduct({ name: 'x', image: 'a/image.png' }).image, undefined);
  assert.equal(productImage(a.id, d).type, 'image/jpeg');

  assert.throws(() => saveProductImage(a.id, Buffer.from('<svg/>'.repeat(4)), d), e => e.status === 400);
  assert.throws(() => saveProductImage(a.id, Buffer.alloc(8 * 1024 * 1024 + 1), d), e => e.status === 413);
  assert.throws(() => saveProductImage('../config', PNG, d), e => e.status === 400);
  assert.throws(() => saveProductImage('khong-co', PNG, d), e => e.status === 404);
  assert.equal(fs.readdirSync(path.join(d, a.id)).some(f => f.endsWith('.tmp')), false);

  // gắn vào dự án: chép vào media/product_<id>.<ext>, lần sau không chép lại khi giống
  const proj = path.join(TMP, 'p-img');
  const h = productHero(proj, { ads: { product: a.id } }, d);
  assert.equal(h.image, `media/product_${a.id}.jpg`);
  assert.ok(fs.readFileSync(path.join(proj, h.image)).equals(JPG));
  const m = fs.statSync(path.join(proj, h.image)).mtimeMs;
  assert.equal(copyProductImage(proj, a.id, d), h.image);
  assert.equal(fs.statSync(path.join(proj, h.image)).mtimeMs, m);
  saveProductImage(a.id, WEBP, d);
  assert.equal(copyProductImage(proj, a.id, d), `media/product_${a.id}.webp`);

  // image: '' = bỏ ảnh
  const cleared = saveProduct({ ...loadProduct(a.id, d), image: '' }, d);
  assert.equal('image' in cleared, false);
  assert.deepEqual(fs.readdirSync(path.join(d, a.id)), []);

  saveProductImage(a.id, PNG, d);
  deleteProduct(a.id, d);
  assert.equal(fs.existsSync(path.join(d, a.id)), false);
  assert.equal(fs.existsSync(path.join(d, a.id + '.json')), false);
});

test('image: a product folder that is a link out of products/ is refused', t => {
  const d = path.join(TMP, 'imglink');
  const a = saveProduct({ name: 'Liên kết' }, d);
  const out = path.join(TMP, 'outside'); fs.mkdirSync(out, { recursive: true });
  try { fs.symlinkSync(out, path.join(d, a.id), 'junction'); } catch { return t.skip('no symlink permission'); }
  assert.throws(() => saveProductImage(a.id, PNG, d), e => e.status === 403);
  assert.throws(() => saveProduct({ ...a, image: '' }, d), e => e.status === 403);
  fs.writeFileSync(path.join(out, 'giu.txt'), 'x');
  assert.throws(() => deleteProduct(a.id, d), e => e.status === 403); // không đi theo liên kết xoá file bên ngoài
  assert.deepEqual(fs.readdirSync(out), ['giu.txt']);
  assert.ok(fs.existsSync(path.join(d, a.id + '.json')));
});

// ---------- the real server: token, routes, traversal ----------
let srv, PORT, TOKEN;
const freePort = () => new Promise(ok => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
function call(p, { method = 'GET', body, raw, token = TOKEN } = {}) {
  return new Promise((ok, bad) => {
    const h = {}, data = raw ?? (body === undefined ? undefined : JSON.stringify(body));
    if (token) h['X-AVS-Token'] = token;
    if (data !== undefined) { h['Content-Type'] = raw ? 'application/octet-stream' : 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: h }, res => {
      const c = []; res.on('data', d => c.push(d));
      res.on('end', () => { const buf = Buffer.concat(c), text = buf.toString(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ } ok({ status: res.statusCode, json, buf, type: res.headers['content-type'] }); });
    });
    r.on('error', bad);
    r.end(data);
  });
}
before(async () => {
  PORT = await freePort();
  srv = spawn(process.execPath, [path.join(SKILL, 'studio/server.mjs'), PROJ, '--port', String(PORT)],
    { env: { ...process.env, AVS_HOME: HOME }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  await new Promise((ok, bad) => {
    const t = setTimeout(() => bad(new Error('server did not start:\n' + out)), 20000);
    const on = d => { out += d; if (out.includes('AI Video Studio')) { clearTimeout(t); ok(); } };
    srv.stdout.on('data', on); srv.stderr.on('data', on);
    srv.on('exit', c => bad(new Error(`server exited ${c}:\n${out}`)));
  });
  for (let i = 0; i < 50 && !fs.existsSync(tokenFile(PORT, HOME)); i++) await new Promise(r => setTimeout(r, 100));
  TOKEN = fs.readFileSync(tokenFile(PORT, HOME), 'utf8');
});
after(async () => {
  // wait for the server to exit before removing its folder: on Windows a live process keeps files open (ENOTEMPTY)
  if (srv && srv.exitCode == null) await new Promise(ok => { srv.once('exit', ok); srv.kill(); setTimeout(ok, 5000); });
  fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('routes need the session token', async () => {
  assert.equal((await call('/api/products', { token: null })).status, 401);
  assert.equal((await call('/api/products/save', { method: 'POST', body: { product: SERUM }, token: 'wrong' })).status, 401);
  assert.equal(fs.existsSync(DIR), false);
});

test('save, list, get, delete through the API', async () => {
  const s = await call('/api/products/save', { method: 'POST', body: { product: SERUM } });
  assert.equal(s.status, 200);
  const id = s.json.id;
  assert.ok(fs.existsSync(path.join(DIR, id + '.json')));
  assert.deepEqual((await call('/api/products')).json.map(x => x.id), [id]);
  assert.equal((await call('/api/products/' + id)).json.name, SERUM.name);
  const bad = await call('/api/products/save', { method: 'POST', body: { product: { name: 'x', claims: [{ text: 'a', status: 'approved' }] } } });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /bằng chứng/);
  assert.equal((await call('/api/products/delete', { method: 'POST', body: { id } })).json.ok, true);
  assert.equal((await call('/api/products/' + id)).status, 404);
});

test('ids that try to leave products/ are refused', async () => {
  for (const p of ['/api/products/..%2Fconfig', '/api/products/..%5Cconfig', '/api/products/%E0%A4%A'])
    assert.equal((await call(p)).status, 400, p);
  // URL parser folds %2e%2e into "/api/", which no route answers: never the config file
  const dots = await call('/api/products/%2e%2e/config');
  assert.notEqual(dots.status, 200);
  assert.equal(dots.json?.secret, undefined);
  assert.equal((await call('/api/products/save', { method: 'POST', body: { product: { ...SERUM, id: '../config' } } })).status, 400);
  assert.equal((await call('/api/products/delete', { method: 'POST', body: { id: '../config' } })).status, 400);
  assert.ok(fs.existsSync(path.join(HOME, 'config.json')));
});

test('product image through the API: upload, get, use in the open project, size and id limits', async () => {
  const id = (await call('/api/products/save', { method: 'POST', body: { product: { name: 'Ảnh qua API' } } })).json.id;
  assert.equal((await call('/api/products/image?id=' + id)).status, 404);
  assert.equal((await call('/api/products/use-image', { method: 'POST', body: { id } })).json.image, '');
  assert.equal((await call('/api/products/image?id=' + id, { method: 'POST', raw: PNG, token: null })).status, 401);
  const up = await call('/api/products/image?id=' + id, { method: 'POST', raw: PNG });
  assert.equal(up.status, 200);
  assert.equal(up.json.image, 'image.png');
  const got = await call('/api/products/image?id=' + id);
  assert.equal(got.status, 200);
  assert.equal(got.type, 'image/png');
  assert.ok(got.buf.equals(PNG));
  const use = await call('/api/products/use-image', { method: 'POST', body: { id } });
  assert.equal(use.json.image, `media/product_${id}.png`);
  assert.ok(fs.readFileSync(path.join(PROJ, use.json.image)).equals(PNG));
  // lưu hồ sơ từ form (không gửi image) giữ ảnh
  assert.equal((await call('/api/products/save', { method: 'POST', body: { product: { id, name: 'Ảnh qua API 2' } } })).json.image, 'image.png');

  assert.equal((await call('/api/products/image?id=' + id, { method: 'POST', raw: Buffer.from('not an image at all') })).status, 400);
  assert.equal((await call('/api/products/image?id=' + id, { method: 'POST', raw: Buffer.alloc(8 * 1024 * 1024 + 1) })).status, 413);
  for (const bad of ['..%2Fconfig', '', 'A'])
    assert.equal((await call('/api/products/image?id=' + bad, { method: 'POST', raw: PNG })).status, 400, bad);
  assert.equal((await call('/api/products/image?id=..%2Fconfig')).status, 400);
  assert.equal((await call('/api/products/use-image', { method: 'POST', body: { id: '../config' } })).status, 400);
  assert.ok(fs.readFileSync(path.join(DIR, id, 'image.png')).equals(PNG));

  assert.equal((await call('/api/products/delete', { method: 'POST', body: { id } })).json.ok, true);
  assert.equal(fs.existsSync(path.join(DIR, id)), false);
});
