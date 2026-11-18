// Test S17 M125: bỏ dự án mẫu. Studio mở không kèm dự án (trang chủ), trình cài không tạo clip-mau, "Dự án gần đây" ẩn dự án
// mẫu và dự án trong thư mục tạm, nút "Xem thử dự án mẫu" (POST /api/onboarding/sample) chép sample/clip-mau rồi mở.
// Chạy: node --test scripts/tests/s17_no_sample.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m125-'));
process.env.AVS_HOME = HOME;
const FILE = path.join(HOME, 'onboarding.json');
const OUT = fs.mkdtempSync(path.join(os.homedir(), '.avs-m125-out-')); // dự án thật: ngoài thư mục tạm, ngoài $AVS_HOME
const mk = d => { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'timeline.json'), '{}'); return d; };

const { readJson } = await import('../../studio/security.mjs');
const R = await import('../../studio/routes/02_onboarding.mjs');
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
let project = null, skill = SKILL; const opened = [];
const ctx = { json, body: req => readJson(req), get SKILL() { return skill; }, get project() { return project; }, openProject: d => { opened.push(d); project = { dir: d }; } };
const handler = R.default(ctx);
const app = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try { if (!(await handler(req, res, u.pathname, u))) json(res, { error: 'not found' }, 404); }
  catch (e) { if (!res.headersSent) json(res, { error: e.message }, e.status || 500); }
});
await new Promise(ok => app.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${app.address().port}`;
after(() => { app.closeAllConnections?.(); app.close(); for (const d of [HOME, OUT]) fs.rmSync(d, { recursive: true, force: true }); });
const get = async p => { const r = await fetch(BASE + p); return { status: r.status, j: await r.json() }; };
const post = async (p, b) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, j: await r.json() }; };
const read = f => fs.readFileSync(path.join(SKILL, f), 'utf8');

test('hiddenRecent: dự án mẫu và thư mục tạm bị ẩn, dự án trong $AVS_HOME và ngoài tạm thì không', () => {
  assert.equal(R.hiddenRecent(path.join(HOME, 'footage', 'clip-mau')), true);
  assert.equal(R.hiddenRecent(path.join(OUT, 'Clip-Mau')), true);
  assert.equal(R.hiddenRecent(path.join(os.tmpdir(), 'avs-perf-x', 'p')), true);
  assert.equal(R.hiddenRecent(os.tmpdir()), true);
  assert.equal(R.hiddenRecent(path.join(HOME, 'Kho', 'Chung', 'Du an', 'video-1')), false, 'AVS_HOME nằm trong tạm (test) vẫn là dự án thật');
  assert.equal(R.hiddenRecent(path.join(OUT, 'video-2')), false);
  assert.equal(R.hiddenRecent(''), true);
});

test('"Dự án gần đây" không ghi dự án mẫu / dự án tạm, lọc cả mục cũ trong file mà giữ đúng chỉ số để mở', async () => {
  fs.writeFileSync(FILE, JSON.stringify({ done: true }));
  const real = mk(path.join(OUT, 'that')), tmp = mk(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m125-tmp-')));
  for (const d of [mk(path.join(HOME, 'footage', 'clip-mau')), tmp]) { project = { dir: d }; await get('/api/onboarding'); }
  assert.deepEqual(JSON.parse(fs.readFileSync(FILE, 'utf8')).recent || [], [], 'không ghi');
  // file cũ (trước M125) đã có clip-mau và dự án tạm đứng trước dự án thật
  fs.writeFileSync(FILE, JSON.stringify({ done: true, recent: [{ dir: path.join(HOME, 'footage', 'clip-mau'), name: 'clip-mau' }, { dir: tmp, name: 'tam' }, { dir: real, name: 'that' }] }));
  project = null;
  const r = await get('/api/onboarding');
  assert.deepEqual(r.j.recent.map(x => [x.i, x.name]), [[2, 'that']]);
  opened.length = 0;
  assert.equal((await post('/api/onboarding/open', { i: 2 })).status, 200);
  assert.deepEqual(opened, [real]);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('addRecent (Tự lái) cũng bỏ qua dự án tạm', () => {
  const before = fs.readFileSync(FILE, 'utf8');
  assert.equal(R.addRecent(path.join(os.tmpdir(), 'avs-ap-x')), false);
  assert.equal(fs.readFileSync(FILE, 'utf8'), before);
});

test('POST /api/onboarding/sample chép dự án mẫu (không khung hình), không đè timeline đã sửa, rồi mở', async () => {
  fs.rmSync(path.join(HOME, 'footage'), { recursive: true, force: true });
  opened.length = 0;
  let r = await post('/api/onboarding/sample', {});
  assert.equal(r.status, 200, JSON.stringify(r.j));
  const dst = path.join(HOME, 'footage', 'clip-mau');
  assert.deepEqual(opened, [dst]);
  for (const f of ['timeline.json', 'work/captions.json', 'work/words.json', 'work/aroll.mp4']) assert.ok(fs.existsSync(path.join(dst, f)), f);
  assert.ok(fs.statSync(path.join(dst, 'work/frames')).isDirectory());
  fs.writeFileSync(path.join(dst, 'timeline.json'), '{"sua":1}');
  r = await post('/api/onboarding/sample', {});
  assert.equal(r.status, 200);
  assert.equal(fs.readFileSync(path.join(dst, 'timeline.json'), 'utf8'), '{"sua":1}', 'giữ bản người dùng đã sửa');
  skill = path.join(OUT, 'khong-co');
  r = await post('/api/onboarding/sample', {});
  assert.equal(r.status, 404); assert.match(r.j.error, /dự án mẫu/);
  skill = SKILL;
});

test('launcher không đối số không mở clip-mau; trình cài không tạo clip-mau', () => {
  for (const f of ['studio.cmd', 'studio.sh', 'scripts/app/launcher.sh', 'install.ps1', 'install.sh']) {
    const code = read(f).split(/\r?\n/).filter(l => !/^\s*(#|rem\b)/i.test(l)).join('\n');
    assert.doesNotMatch(code, /footage[\\/]clip-mau|sample[\\/]clip-mau/, f);
  }
  assert.match(read('studio.cmd'), /node "%HERE%studio\\server\.mjs" %\* --open/);
  assert.match(read('studio.sh'), /exec node "\$HERE\/studio\/server\.mjs" "\$@" --open/);
  // ghi công tác giả cuối trình cài vẫn còn
  for (const f of ['install.ps1', 'install.sh']) assert.match(read(f), /Dựa trên AI Video Studio của Nguyễn Tất Kiểm/, f);
});

test('trang chủ: nút "Xem thử dự án mẫu", nhắc bước Chuẩn bị khi chưa có thương hiệu', () => {
  const js = read('studio/features/02_onboarding.js');
  assert.match(js, /data-h="sample"/); assert.match(js, /\/api\/onboarding\/sample/);
  assert.match(js, /data-h="prep"/); assert.match(js, /brandCount\(\)\) === 0/);
});
