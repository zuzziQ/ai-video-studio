// Test M83: route hướng dẫn lần đầu (studio/routes/02_onboarding.mjs) — đọc/ghi $AVS_HOME/onboarding.json.
// Chạy: node --test scripts/tests/onboarding_route.test.mjs
// AVS_HOME là thư mục tạm; ctx tối giản như studio/server.mjs (json, body, project, openProject).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-onb-'));
process.env.AVS_HOME = HOME;
const FILE = path.join(HOME, 'onboarding.json');
// S17 M125: dự án trong thư mục tạm của máy bị ẩn khỏi "gần đây", trừ khi nằm trong $AVS_HOME (như Kho)
const PROJ = fs.mkdtempSync(path.join(HOME, 'avs-onb-proj-'));
fs.writeFileSync(path.join(PROJ, 'timeline.json'), '{}');

const { readJson } = await import('../../studio/security.mjs');
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
let project = null; const opened = [];
const ctx = { json, body: req => readJson(req), get project() { return project; }, openProject: d => { opened.push(d); project = { dir: d }; } };
const handler = (await import('../../studio/routes/02_onboarding.mjs')).default(ctx);
const app = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try { if (!(await handler(req, res, u.pathname, u))) json(res, { error: 'not found' }, 404); }
  catch (e) { if (!res.headersSent) json(res, { error: e.message }, e.status || 500); }
});
await new Promise(ok => app.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${app.address().port}`;
after(() => { app.closeAllConnections?.(); app.close(); fs.rmSync(HOME, { recursive: true, force: true }); fs.rmSync(PROJ, { recursive: true, force: true }); });
const get = async p => { const r = await fetch(BASE + p); return { status: r.status, j: await r.json() }; };
const post = async (p, b) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof b === 'string' ? b : JSON.stringify(b) });
  return { status: r.status, j: await r.json() };
};

test('người mới: chưa có file → mặc định, isNew, không tự tạo file', async () => {
  const r = await get('/api/onboarding');
  assert.equal(r.status, 200);
  assert.deepEqual([r.j.done, r.j.skipped, r.j.step, r.j.isNew, r.j.project], [false, false, 0, true, false]);
  assert.deepEqual(r.j.recent, []);
  assert.equal(fs.existsSync(FILE), false);
});

test('POST ghi khoá hợp lệ, gộp với lần trước, ghi nguyên tử (không còn file tạm)', async () => {
  let r = await post('/api/onboarding', { step: 2, purpose: 'bds', aspect: '9:16', platforms: ['tiktok', 'youtube', 'tiktok'], brand: 'nha-dep-a1b2' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.j.platforms, ['tiktok', 'youtube']);
  r = await post('/api/onboarding', { done: true, step: 3 });
  assert.equal(r.j.done, true); assert.equal(r.j.purpose, 'bds'); assert.equal(r.j.isNew, false);
  const disk = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  assert.equal(disk.done, true); assert.equal(disk.aspect, '9:16'); assert.ok(disk.updated);
  assert.deepEqual(fs.readdirSync(HOME).filter(f => f.endsWith('.tmp')), []);
});

test('dữ liệu sai → 400, file không đổi', async () => {
  const before = fs.readFileSync(FILE, 'utf8');
  for (const bad of [{ step: 9 }, { step: '1' }, { done: 'yes' }, { purpose: 'casino' }, { aspect: '4:3' }, { platforms: 'tiktok' },
    { platforms: ['myspace'] }, { brand: '../../etc' }, { token: 'x' }, [1, 2], null]) {
    const r = await post('/api/onboarding', bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.ok(r.j.error);
  }
  assert.equal((await post('/api/onboarding', '{hỏng')).status, 400);
  assert.equal(fs.readFileSync(FILE, 'utf8'), before);
});

test('body quá 8 KB → 413', async () => {
  const r = await post('/api/onboarding', { purpose: 'x'.repeat(9000) });
  assert.equal(r.status, 413);
});

test('file hỏng → đọc như người mới, khoá sai trong file bị bỏ', async () => {
  fs.writeFileSync(FILE, '{ không phải json');
  assert.equal((await get('/api/onboarding')).j.isNew, true);
  fs.writeFileSync(FILE, JSON.stringify({ done: 'x', step: 2, recent: [{ dir: 'relative/path' }, 5] }));
  const r = await get('/api/onboarding');
  assert.equal(r.j.done, false); assert.equal(r.j.step, 2); assert.deepEqual(r.j.recent, []);
});

test('dự án đang mở vào đầu "gần đây"; mở lại theo chỉ số, không nhận đường dẫn', async () => {
  project = { dir: PROJ };
  let r = await get('/api/onboarding');
  assert.equal(r.j.recent.length, 1); assert.equal(r.j.recent[0].current, true);
  assert.equal(r.j.recent[0].name, path.basename(PROJ));
  assert.equal('dir' in r.j.recent[0], false);
  project = null;
  r = await post('/api/onboarding/open', { i: 0 });
  assert.equal(r.status, 200); assert.deepEqual(opened, [PROJ]);
  assert.equal((await post('/api/onboarding/open', { i: 7 })).status, 400);
  assert.equal((await post('/api/onboarding/open', { path: '/etc' })).status, 400);
});

test('dự án đã xoá khỏi máy → 404 và bỏ khỏi danh sách', async () => {
  const gone = path.join(HOME, 'gone-proj');
  const s = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  s.recent = [{ dir: gone, name: 'gone-proj' }, ...s.recent]; fs.writeFileSync(FILE, JSON.stringify(s));
  const r = await post('/api/onboarding/open', { i: 0 });
  assert.equal(r.status, 404);
  assert.equal((await get('/api/onboarding')).j.recent.some(x => x.name === 'gone-proj'), false);
});

test('đường dẫn khác không thuộc route', async () => {
  assert.equal((await get('/api/onboardingx')).status, 404);
});
