// Test M67: route Studio "Hiệu năng" (studio/routes/29_perf.mjs).
// Chạy: node --test scripts/tests/perf_route.test.mjs
// AVS_HOME là thư mục tạm; không render thật (bench chỉ kiểm kiểu và 409, startJob giả).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '../..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-perfroute-'));
process.env.AVS_HOME = HOME;
for (const k of ['AVS_PERF_PROFILE', 'AVS_ENCODER', 'AVS_WHISPER_DEVICE', 'AVS_RENDER_SLOTS', 'AVS_RENDER_PRIORITY', 'AVS_RENDER_GPU']) delete process.env[k];
const CONF = path.join(HOME, 'config.json');
const SECRET = 'sk-THIS-IS-A-SECRET-KEY-1234';
fs.writeFileSync(CONF, JSON.stringify({ pexels: SECRET, telegram: { token: SECRET } }));
fs.writeFileSync(path.join(HOME, 'perf_log.jsonl'), [1, 2, 3].map(i => JSON.stringify({ at: `2026-11-15T10:0${i}:00Z`, profile: 'can-bang', W: 1080, H: 1920, frames: 300, workers: 3, encoder: 'nvenc', chrome: 'gpu', sec: 20 + i, fps: 15, waited_s: 0 })).join('\n') + '\n');

const { readJson } = await import('../../studio/security.mjs');
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
let jobRunning = false; const started = [];
const ctx = { SKILL, json, body: req => readJson(req), get job() { return null; },
  startJob: (kind, fn, payload) => { if (jobRunning) return false; started.push({ kind, payload }); return true; } };
const handler = (await import('../../studio/routes/29_perf.mjs')).default(ctx);
// a later route that owns another /api/perf/* path (like 31_perfai.mjs of M68)
const other = async (req, res, p) => { if (p === '/api/perf/advise' && req.method === 'POST') { json(res, { profile: 'toc-do', overrides: {}, reason: 'x' }); return true; } return false; };
const app = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try { for (const r of [handler, other]) if (await r(req, res, u.pathname, u)) return; json(res, { error: 'not found' }, 404); }
  catch (e) { if (!res.headersSent) json(res, { error: e.message }, e.status || 500); }
});
await new Promise(ok => app.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${app.address().port}`;
after(() => { app.closeAllConnections?.(); app.close(); fs.rmSync(HOME, { recursive: true, force: true }); });
const get = async p => { const r = await fetch(BASE + p); return { status: r.status, text: await r.text() }; };
const post = async (p, b) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, j: await r.json() }; };

test('GET /api/perf: profile, danh sách, máy, kế hoạch 3 khổ, env chỉ có/không; không lộ đường dẫn hay khoá', async () => {
  process.env.AVS_ENCODER = 'x264';
  try {
    const r = await get('/api/perf');
    assert.equal(r.status, 200);
    const j = JSON.parse(r.text);
    assert.equal(j.profile, 'can-bang');
    assert.deepEqual(j.profiles.map(p => p.id), ['tiet-kiem', 'can-bang', 'toc-do', 'chat-luong', 'tuy-chinh']);
    assert.ok(j.profiles.every(p => p.label && p.hint));
    assert.ok(j.hw.cores.physical >= 1 && j.hw.cores.logical >= 1);
    assert.deepEqual(Object.keys(j.plans), ['720', '1080', '4k']);
    assert.ok(j.plans['1080'].workers >= 1);
    assert.equal(j.env.AVS_ENCODER, true); assert.equal(j.env.AVS_RENDER_SLOTS, false);
    assert.equal(j.resolved.from.encoder, 'env');
    assert.ok(Object.values(j.env).every(x => typeof x === 'boolean')); // env: chỉ có/không, không giá trị
    for (const leak of [SECRET, HOME, os.homedir(), SKILL, 'pexels', 'telegram', 'headless_shell":"', '.exe', ':\\\\']) assert.ok(!r.text.includes(leak), 'lộ ' + leak);
  } finally { delete process.env.AVS_ENCODER; }
});

test('POST /api/perf: kiểm kiểu, sai trả 400 {error} và không ghi', async () => {
  const before = fs.readFileSync(CONF, 'utf8');
  const cases = [
    [[1, 2]], ['chuoi'], [{}], [{ profile: 'sieu-nhanh' }], [{ profile: 1 }], [{ profile: 'can-bang', extra: 1 }],
    [{ custom: [] }], [{ custom: { workers: 0 } }], [{ custom: { workers: 99 } }], [{ custom: { workers: 2.5 } }], [{ custom: { workers: '3' } }],
    [{ custom: { encoder: 'h265' } }], [{ custom: { preset: 'nhanh' } }], [{ custom: { priority: 'high' } }],
    [{ custom: { slots: 5 } }], [{ custom: { slots: 0 } }], [{ custom: { whisperDevice: 'gpu' } }], [{ custom: { fps: 60 } }],
  ];
  for (const [b] of cases) {
    const r = await post('/api/perf', b);
    assert.equal(r.status, 400, JSON.stringify(b));
    assert.equal(typeof r.j.error, 'string');
  }
  assert.equal(fs.readFileSync(CONF, 'utf8'), before);
});

test('POST /api/perf: ghi profile + custom, giữ khoá khác của config.json', async () => {
  const r = await post('/api/perf', { profile: 'tuy-chinh', custom: { workers: 3, encoder: 'x264', preset: 'medium', priority: 'below_normal', slots: 2, whisperDevice: 'cpu' } });
  assert.equal(r.status, 200);
  assert.equal(r.j.profile, 'tuy-chinh');
  assert.equal(r.j.resolved.workers, 3); assert.equal(r.j.resolved.preset, 'medium');
  const c = JSON.parse(fs.readFileSync(CONF, 'utf8'));
  assert.equal(c.pexels, SECRET); assert.equal(c.perf.custom.slots, 2);
  const r2 = await post('/api/perf', { custom: { workers: null } });
  assert.equal(r2.status, 200); assert.equal(r2.j.custom.workers, null); assert.equal(r2.j.custom.encoder, 'x264');
  const r3 = await post('/api/perf', { profile: 'tiet-kiem' });
  assert.equal(r3.j.profile, 'tiet-kiem');
});

test('GET /api/perf/log?n=', async () => {
  const r = JSON.parse((await get('/api/perf/log?n=2')).text);
  assert.equal(r.length, 2); assert.equal(r[1].sec, 23);
  assert.equal(JSON.parse((await get('/api/perf/log?n=abc')).text).length, 3);
});

test('đường dẫn lạ dưới /api/perf/ không bị route này chặn', async () => {
  const a = await post('/api/perf/advise', { goal: 'nhanh' });
  assert.equal(a.status, 200); assert.equal(a.j.profile, 'toc-do');
  assert.equal((await get('/api/perf/khong-co')).status, 404);
  assert.equal((await get('/api/perfx')).status, 404);
  assert.equal((await get('/api/perf/bench')).status, 404); // bench chỉ POST
});

test('POST /api/perf/bench: kiểm kiểu, chạy job, đang có job thì 409', async () => {
  for (const b of [{ profiles: [] }, { profiles: 'can-bang' }, { profiles: ['a'] }, { profiles: ['can-bang', 'toc-do', 'tiet-kiem', 'chat-luong'] }, [1]]) {
    assert.equal((await post('/api/perf/bench', b)).status, 400, JSON.stringify(b));
  }
  const r = await post('/api/perf/bench', {});
  assert.equal(r.status, 200); assert.deepEqual(r.j.profiles, ['tiet-kiem', 'can-bang', 'toc-do']);
  assert.equal(started.at(-1).kind, 'perf-bench');
  const r2 = await post('/api/perf/bench', { profiles: ['can-bang', 'can-bang'] });
  assert.deepEqual(r2.j.profiles, ['can-bang']);
  jobRunning = true;
  const busy = await post('/api/perf/bench', {});
  assert.equal(busy.status, 409); assert.equal(busy.j.ok, false);
  jobRunning = false;
});
