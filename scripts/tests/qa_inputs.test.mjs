// Test M58: lỗi Trung bình từ đợt test Studio trên localhost (qa-reports/2026-11-15/SUMMARY.md).
// Chạy: node --test scripts/tests/qa_inputs.test.mjs
// Route chạy sau một ctx tối thiểu (giống studio/server.mjs); AVS_HOME là thư mục tạm; không gọi mạng ngoài, không chạy job thật.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '../..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-qa-'));
process.env.AVS_HOME = HOME;
process.env.AVS_NO_QUEUE = '1'; process.env.AVS_NO_TELEGRAM = '1'; // no runner / bot loops in the test process
const PROJ = path.join(HOME, 'footage', 'du-an');
fs.mkdirSync(path.join(PROJ, 'out'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'timeline.json'), JSON.stringify({ width: 720, height: 1280, duration: 4, scenes: [] }));
fs.writeFileSync(path.join(PROJ, 'out', 'v.mp4'), 'not really a video');

const { readJson } = await import('../../studio/security.mjs');
const { isBlockedIp, assertPublicUrl, safeFetch } = await import('../net_guard.mjs');
const { cloneProject } = await import('../project_clone.mjs');
const { linkPath } = await import('../platform.mjs');

const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const under = (base, rel) => { const f = path.resolve(base, String(rel)); return f === base || f.startsWith(base + path.sep) ? f : null; };
const started = [];
let job = null;
const ctx = {
  SKILL, PY: 'python', json, body: req => readJson(req), under, stamp: () => '20261115_000000',
  project: { dir: PROJ, tlFile: path.join(PROJ, 'timeline.json') }, P: rel => path.join(PROJ, rel),
  get job() { return job; },
  startJob: (kind) => { if (job?.state === 'running') return false; started.push(kind); job = { kind, state: 'done' }; return true; },
  readProject: () => ({ timeline: {}, captions: [] }), openProject: () => {},
};
const handlers = [];
for (const f of ['60_media.mjs', '52_publish.mjs', '15_autopilot.mjs', '17_longform.mjs', '50_batch.mjs', '51_brands.mjs', '46_agent.mjs'])
  handlers.push((await import(`../../studio/routes/${f}`)).default(ctx));
const app = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try { for (const h of handlers) if (await h(req, res, u.pathname, u)) return; json(res, { error: 'not found' }, 404); }
  catch (e) { if (!res.headersSent) json(res, { error: e.message }, e.status || 500); }
});
await new Promise(ok => app.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${app.address().port}`;
after(() => { app.closeAllConnections?.(); app.close(); fs.rmSync(HOME, { recursive: true, force: true }); setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref(); });
const post = async (p, b, raw) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ?? JSON.stringify(b) });
  return { status: r.status, j: await r.json() };
};

test('net_guard chặn loopback, mạng nội bộ, link-local và IPv6 tương ứng', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1'])
    assert.equal(isBlockedIp(ip), true, ip);
  for (const ip of ['::7f00:1', '::127.0.0.1', '2002:7f00:1::', '64:ff9b::127.0.0.1', '64:ff9b::a00:1']) assert.equal(isBlockedIp(ip), true, ip);
  // public, incl. Clash/Surge fake-ip (198.18/15) and NAT64 of a public IPv4 (DNS64 on IPv6-only networks)
  for (const ip of ['8.8.8.8', '151.101.1.1', '2606:4700::1111', '198.18.0.5', '64:ff9b::808:808', '2002:808:808::1']) assert.equal(isBlockedIp(ip), false, ip);
});

test('assertPublicUrl: chỉ http(s), tên miền trỏ về IP nội bộ bị chặn sau khi phân giải', async () => {
  await assert.rejects(assertPublicUrl('file:///etc/passwd'), { status: 400 });
  await assert.rejects(assertPublicUrl('không phải url'), { status: 400 });
  await assert.rejects(assertPublicUrl('http://[::1]:5186/api/project'), { status: 400 });
  const lookup = async () => [{ address: '127.0.0.1', family: 4 }];
  await assert.rejects(assertPublicUrl('https://rebind.example/x.jpg', { lookup }), /nội bộ/);
  const pub = async () => [{ address: '93.184.216.34', family: 4 }];
  assert.equal((await assertPublicUrl('https://images.example/x.jpg', { lookup: pub })).hostname, 'images.example');
});

test('safeFetch kiểm lại từng bước chuyển hướng: host công khai chuyển về localhost bị chặn', async () => {
  const lookup = async h => [{ address: h === 'cdn.example' ? '93.184.216.34' : '127.0.0.1', family: 4 }];
  const seen = [];
  const fetchImpl = async u => { seen.push(String(u)); return new Response(null, { status: 302, headers: { Location: 'http://localhost:5186/api/project' } }); };
  await assert.rejects(safeFetch('https://cdn.example/a.jpg', {}, { lookup, fetchImpl }), /nội bộ/);
  assert.deepEqual(seen, ['https://cdn.example/a.jpg']); // the redirect target was never requested
  const ok = async () => new Response('img', { status: 200 });
  assert.equal(await (await safeFetch('https://cdn.example/a.jpg', {}, { lookup, fetchImpl: ok })).text(), 'img');
});

test('safeFetch chặn DNS rebinding: lần phân giải thứ hai trả 127.0.0.1 thì không kết nối', async () => {
  let hits = 0;
  const target = http.createServer((req, res) => { hits++; res.end('secret'); });
  await new Promise(ok => target.listen(0, '127.0.0.1', ok));
  let n = 0;
  const lookup = async () => [{ address: n++ === 0 ? '93.184.216.34' : '127.0.0.1', family: 4 }];
  await assert.rejects(safeFetch(`http://rebind.example:${target.address().port}/`, {}, { lookup }), /nội bộ/);
  assert.equal(hits, 0);
  target.close();
});

test('/api/stock/fetch từ chối URL nội bộ bằng 400 (SSRF)', async () => {
  const r = await post('/api/stock/fetch', { url: `${BASE}/api/project`, kind: 'photo' });
  assert.equal(r.status, 400); assert.match(r.j.error, /nội bộ|localhost/);
  assert.equal((await post('/api/stock/fetch', {})).status, 400);
});

test('/api/publish/gen cần file video thật, không nhận body rỗng hay thư mục', async () => {
  started.length = 0; job = null;
  for (const b of [{}, { video: '' }, { video: 'out' }, { video: 'out/khong-co.mp4' }, { video: '../x.mp4' }]) {
    const r = await post('/api/publish/gen', b);
    assert.equal(r.status, 400, JSON.stringify(b));
  }
  assert.deepEqual(started, []);
  const ok = await post('/api/publish/gen', { video: 'out/v.mp4' });
  assert.equal(ok.status, 200); assert.deepEqual(started, ['publish']);
});

test('/api/autopilot/settings từ chối sai kiểu, không ghi gì vào autopilot.json', async () => {
  const f = path.join(HOME, 'autopilot.json'), before = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  for (const b of [{ watch: 'str' }, { watch: [1] }, { watch: { on: 'yes' } }, { watch: { folders: 'x' } }, { watch: { folders: [{ in: 3 }] } }, { notify: 'no' }, { profile: 5 }])
    assert.equal((await post('/api/autopilot/settings', b)).status, 400, JSON.stringify(b));
  assert.equal(fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null, before);
  const r = await post('/api/autopilot/settings', { notify: false, watch: { on: false } });
  assert.equal(r.status, 200); assert.equal(r.j.settings.notify, false); assert.ok(Array.isArray(r.j.settings.watch.folders));
});

test('JSON hỏng trả 400 ở longform và autopilot (trước là 500)', async () => {
  for (const p of ['/api/longform/topic', '/api/longform/highlights', '/api/autopilot'])
    assert.equal((await post(p, null, '{"a":')).status, 400, p);
});

test('/api/batch/start khi đang bận trả 409 và không để lại thư mục lô', async () => {
  job = { kind: 'export', state: 'running' };
  const r = await post('/api/batch/start', { name: 'TEST-lo', sheet: path.join(PROJ, 'timeline.json') });
  assert.equal(r.status, 409);
  const root = path.join(PROJ, 'batch');
  assert.deepEqual(fs.existsSync(root) ? fs.readdirSync(root) : [], []);
  job = null;
});

test('/api/brands/save từ chối body rỗng và gói style sai dạng', async () => {
  assert.equal((await post('/api/brands/save', {})).status, 400);
  assert.equal((await post('/api/brands/save', { brand: { title: '' } })).status, 400);
  assert.equal((await post('/api/brands/save', { brand: { title: 'X', pack: '../../evil' } })).status, 400);
  const ok = await post('/api/brands/save', { brand: { title: 'TEST-brand', pack: 'u_bds_den_gold' } });
  assert.equal(ok.status, 200); assert.equal(ok.j.pack, 'u_bds_den_gold');
  assert.equal((await post('/api/brands/save', { brand: { id: ok.j.id, title: '' } })).status, 400); // would wipe the saved title
  assert.equal((await post('/api/brands/save', { brand: { id: ok.j.id, phone: '0900' } })).status, 200); // partial edit keeps working
});

test('/api/agent/feedback không ghi phản hồi trống hoặc điểm ngoài 1–5', async () => {
  const fb = path.join(HOME, 'feedback.jsonl');
  for (const b of [{}, { rating: 9 }, { rating: 'x' }, { tags: 'a' }, { comment: '   ' }])
    assert.equal((await post('/api/agent/feedback', b)).status, 400, JSON.stringify(b));
  assert.equal(fs.existsSync(fb) ? fs.readFileSync(fb, 'utf8').trim() : '', '');
  const ok = await post('/api/agent/feedback', { video: 'out/v.mp4', rating: '4' });
  assert.equal(ok.status, 200); assert.equal(ok.j.entry.rating, 4); // stored as a number
});

test('cloneProject chép được thư mục là liên kết (junction trên Windows) thay vì báo "Recursive option not enabled"', () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-clone-')), src = path.join(t, 'p'), real = path.join(t, 'real');
  try {
    fs.mkdirSync(path.join(real, 'frames'), { recursive: true }); fs.writeFileSync(path.join(real, 'frames', '00001.jpg'), 'x');
    fs.mkdirSync(src); fs.writeFileSync(path.join(src, 'timeline.json'), '{}'); linkPath(real, path.join(src, 'work'));
    cloneProject(src, path.join(t, 'p_v1'), { link: false, clone: false });
    assert.equal(fs.readFileSync(path.join(t, 'p_v1', 'work', 'frames', '00001.jpg'), 'utf8'), 'x');
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
});
