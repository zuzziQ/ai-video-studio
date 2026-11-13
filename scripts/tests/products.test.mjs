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
import { productFile, validId, newId, normalizeProduct, effectiveStatus, saveProduct, loadProduct, listProducts, deleteProduct } from '../products.mjs';
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
  for (const bad of ['../config', '..', 'a/b', 'a\\b', 'C:x', 'Serum', '.x', 'a.json', 'x'.repeat(65), '', null, 5, 'ok\n'])
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

// ---------- the real server: token, routes, traversal ----------
let srv, PORT, TOKEN;
const freePort = () => new Promise(ok => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
function call(p, { method = 'GET', body, token = TOKEN } = {}) {
  return new Promise((ok, bad) => {
    const h = {}, data = body === undefined ? undefined : JSON.stringify(body);
    if (token) h['X-AVS-Token'] = token;
    if (data !== undefined) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: h }, res => {
      const c = []; res.on('data', d => c.push(d));
      res.on('end', () => { const text = Buffer.concat(c).toString(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ } ok({ status: res.statusCode, json }); });
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
after(() => { srv?.kill(); fs.rmSync(TMP, { recursive: true, force: true }); });

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
