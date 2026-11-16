// Test M101: route dọn file cũ (studio/routes/13_kho_migrate.mjs) — mã thương hiệu, Kho chưa có, chỉ nhận id, chạy như job, mở theo id.
// Chạy: node --test scripts/tests/kho_migrate_route.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const TMP = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-mig-route-')));
const HOME = path.join(TMP, 'home'), USER = path.join(TMP, 'user'), KHO = path.join(TMP, 'Kho');
fs.mkdirSync(USER, { recursive: true }); fs.mkdirSync(KHO, { recursive: true });
process.env.AVS_HOME = HOME; process.env.HOME = USER; process.env.USERPROFILE = USER;
const OLD = new Date(Date.now() - 3600_000);
const put = (f, s = 'x') => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); fs.utimesSync(f, OLD, OLD); return f; };
put(path.join(HOME, 'brands.json'), JSON.stringify({ version: 1, brands: [{ id: 'nha-dep', title: 'Nhà Đẹp', workspace: KHO }, { id: 'chua-co', title: 'Chưa có' }] }));
const vid = put(path.join(HOME, 'uploads', 'cu.mp4'), 'v');
const proj = path.join(HOME, 'footage', 'cu_studio'); put(path.join(proj, 'timeline.json'), '{}');

const { readJson } = await import('../../studio/security.mjs');
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
let job = null, opened = null;
const ctx = {
  json, body: req => readJson(req), get job() { return job; }, openProject: d => { opened = d; },
  startJob: (kind, fn) => { if (job?.state === 'running') return false; job = { kind, state: 'running', progress: 0, step: '' }; job.done = fn().then(() => { job.state = 'done'; }, e => { job.state = 'error'; job.step = e.message; }); return true; },
};
const handler = (await import('../../studio/routes/13_kho_migrate.mjs')).default(ctx);
const app = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try { if (!(await handler(req, res, u.pathname, u))) json(res, { error: 'not found' }, 404); }
  catch (e) { if (!res.headersSent) json(res, { error: e.message }, e.status || 500); }
});
await new Promise(ok => app.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${app.address().port}`;
after(() => { app.closeAllConnections?.(); app.close(); fs.rmSync(TMP, { recursive: true, force: true }); });
const get = async p => { const r = await fetch(BASE + p); return { status: r.status, j: await r.json() }; };
const post = async (p, b) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b ?? {}) }); return { status: r.status, j: await r.json() }; };

test('GET: mã sai 400, thương hiệu lạ 404, Kho chưa có → rỗng; không lộ đường dẫn tuyệt đối', async () => {
  assert.equal((await get('/api/kho-migrate?brand=../x')).status, 400);
  assert.equal((await get('/api/kho-migrate?brand=khong-co')).status, 404);
  const n = await get('/api/kho-migrate?brand=chua-co');
  assert.equal(n.j.noKho, true); assert.deepEqual(n.j.files, []);
  const r = await get('/api/kho-migrate?brand=nha-dep');
  assert.equal(r.status, 200); assert.deepEqual(r.j.files.map(f => f.name), ['cu.mp4']); assert.equal(r.j.files[0].dir, 'uploads');
  assert.ok(!JSON.stringify(r.j).includes(HOME.replace(/\\/g, '\\\\')), 'không trả đường dẫn tuyệt đối');
});

test('POST: Kho chưa có 409, không chọn gì 400, đường dẫn thô bị bỏ, chạy như job rồi chuyển đúng file', async () => {
  assert.equal((await post('/api/kho-migrate', { brand: 'chua-co', files: ['0123456789abcdef'] })).status, 409);
  assert.equal((await post('/api/kho-migrate', { brand: 'nha-dep', files: [vid, '../a'] })).status, 400);
  const plan = (await get('/api/kho-migrate?brand=nha-dep')).j;
  job = { state: 'running' };
  assert.equal((await post('/api/kho-migrate', { brand: 'nha-dep', files: [plan.files[0].id] })).status, 409, 'đang có job khác (xuất…) chạy');
  job = null;
  const r = await post('/api/kho-migrate', { brand: 'nha-dep', files: [plan.files[0].id], projects: [plan.projects[0].id] });
  assert.equal(r.status, 200); assert.equal(r.j.started, true);
  await job.done;
  assert.equal(job.state, 'done'); assert.equal(job.out.moved[0].to, 'Nguon/cu.mp4'); assert.equal(job.out.linked, 1);
  assert.ok(fs.existsSync(path.join(KHO, 'Nguon', 'cu.mp4')) && !fs.existsSync(vid));
});

test('open: theo id trong .kho.json, id lạ 404', async () => {
  const L = (await get('/api/kho-migrate?brand=nha-dep')).j.linked;
  assert.deepEqual(L.map(x => x.name), ['cu_studio']);
  assert.equal((await post('/api/kho-migrate/open', { brand: 'nha-dep', id: 'ffffffffffffffff' })).status, 404);
  assert.equal((await post('/api/kho-migrate/open', { brand: 'nha-dep', i: 0 })).status, 404);
  assert.equal((await post('/api/kho-migrate/open', { brand: 'nha-dep', id: L[0].id })).status, 200);
  assert.equal(opened, proj);
});
