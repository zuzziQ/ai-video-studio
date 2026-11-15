// Test M68: AI chọn profile hiệu năng (scripts/perf_advisor.mjs) + route studio/routes/31_perfai.mjs.
// Chạy: node --test scripts/tests/perf_advisor.test.mjs
// Không gọi LLM thật: `run` giả cắm vào advise(); route nhận advisor giả qua ctx.perfAdvisor.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-perfai-'));
process.env.AVS_HOME = HOME;
for (const k of ['AVS_PERF_PROFILE', 'AVS_ENCODER', 'AVS_RENDER_SLOTS', 'AVS_RENDER_PRIORITY', 'AVS_WHISPER_DEVICE', 'AVS_LLM_TEXT']) delete process.env[k];
const A = await import('../perf_advisor.mjs');
const { PROFILES } = await import('../perf_profile.mjs');

const HW = { cores: { physical: 6, logical: 12 }, ram: { total_gb: 32, free_gb: 20 }, gpu: [{ name: 'NVIDIA GeForce GTX 1660 Ti', vram_mb: 6144, vram_free_mb: 5000, driver: '560.1' }],
  chrome: { mode: 'gpu', headless_shell: true, novsync: true }, encoder: { want: 'auto', final: 'nvenc', segment: 'nvenc' } };
const NOGPU = { ...HW, gpu: [], encoder: { want: 'auto', final: 'x264', segment: 'x264' } };
const LOWRAM = { ...HW, ram: { total_gb: 8, free_gb: 3.5 } };
const LOG = [
  { profile: 'can-bang', W: 1080, H: 1920, frames: 947, workers: 4, encoder: 'nvenc', chrome: 'gpu', sec: 16, fps: 60 },
  { profile: 'can-bang', W: 1080, H: 1920, frames: 947, workers: 4, encoder: 'nvenc', chrome: 'gpu', sec: 17, fps: 50 },
  { profile: 'can-bang', W: 1080, H: 1920, frames: 947, workers: 4, encoder: 'nvenc', chrome: 'gpu', sec: 18, fps: 55 },
  { profile: 'tiet-kiem', W: 720, H: 1280, frames: 900, workers: 2, encoder: 'nvenc', chrome: 'gpu', sec: 20, fps: 45 },
];
const LOAD = { renders_running: 0, cpu_busy_pct: 10 };
after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const valid = c => {
  assert.ok(Object.hasOwn(PROFILES, c.profile), c.profile);
  if (c.profile !== 'tuy-chinh') assert.deepEqual(c.overrides, {});
  assert.equal(typeof c.why, 'string'); assert.ok(c.why.length > 5);
};

test('ứng viên: 2–4, hợp lệ, tất định, theo goal', () => {
  for (const goal of A.GOALS) for (const hw of [HW, NOGPU, LOWRAM]) {
    const c = A.candidates({ hw, log: LOG, job: {}, goal, load: LOAD });
    assert.ok(c.length >= 2 && c.length <= 4, `${goal}: ${c.length}`);
    c.forEach(valid);
    assert.equal(new Set(c.map(x => x.profile + JSON.stringify(x.overrides))).size, c.length, 'không trùng');
    assert.deepEqual(A.candidates({ hw, log: LOG, job: {}, goal, load: LOAD }), c, 'tất định');
  }
  assert.equal(A.candidates({ hw: HW, goal: 'nhanh', load: LOAD })[0].profile, 'toc-do');
  assert.equal(A.candidates({ hw: HW, goal: 'song-song', load: LOAD })[0].profile, 'tiet-kiem');
  assert.equal(A.candidates({ hw: HW, goal: 'chat-luong', load: LOAD })[0].profile, 'chat-luong');
  assert.match(A.candidates({ hw: HW, goal: 'nhanh', job: { count: 10 }, load: LOAD })[0].why, /lô 10 video/);
});

test('không GPU → x264 veryfast đứng đầu khi cần nhanh', () => {
  const c = A.candidates({ hw: NOGPU, goal: 'nhanh', load: LOAD })[0];
  assert.equal(c.profile, 'tuy-chinh');
  assert.equal(c.overrides.encoder, 'x264'); assert.equal(c.overrides.preset, 'veryfast');
  assert.equal(c.overrides.workers, 5);
});

test('RAM trống < 6 GB → hạ worker theo RAM', () => {
  const cap = A.ramWorkerCap(3.5); // (3.5 − 1.5) / 0.7 → 2
  assert.equal(cap, 2);
  const c = A.candidates({ hw: LOWRAM, goal: 'nhanh', load: LOAD });
  assert.equal(c[0].profile, 'tuy-chinh'); assert.equal(c[0].overrides.workers, 2); assert.match(c[0].why, /RAM trống 3\.5 GB/);
  for (const x of c) assert.ok(x.workers == null || x.workers <= 2, JSON.stringify(x));
});

test('đang có lượt render khác → thêm ứng viên tiết kiệm', () => {
  const c = A.candidates({ hw: HW, goal: 'nhanh', load: { renders_running: 1, cpu_busy_pct: 90 } });
  assert.ok(c.some(x => x.profile === 'tiet-kiem'));
});

test('ước thời gian: trung vị fps cùng profile + độ phân giải', () => {
  const c = A.candidates({ hw: HW, log: LOG, goal: 'nhanh', job: { sec: 30, fps: 30 }, load: LOAD }).find(x => x.profile === 'can-bang');
  assert.deepEqual(c.est, { fps: 55, sec: 16.4, runs: 3 });
  assert.equal(A.estimate(LOG, { profile: 'tiet-kiem' }, A.cleanJob({})), null, '720p không tính cho 1080p');
});

const base = { hw: HW, log: LOG, load: LOAD, goal: 'nhanh' };
const reply = text => async () => ({ text, provider: 'claude' });

test('LLM chọn hợp lệ → dùng lựa chọn, lý do ≤ 2 câu', async () => {
  const r = await A.advise({ ...base, run: reply('Đây: ```json\n{"pick": 1, "reason": "Câu một. Câu hai. Câu ba bị bỏ."}\n```') });
  assert.equal(r.provider, 'claude'); assert.equal(r.pick, 1); assert.equal(r.profile, r.candidates[1].profile);
  assert.equal(r.reason, 'Câu một. Câu hai.');
  const o = await A.advise({ ...base, run: async () => ({ text: '{"pick":"0","reason":"ok"}', provider: 'ollama' }) });
  assert.equal(o.provider, 'ollama'); assert.equal(o.pick, 0);
});

test('LLM trả rác, chỉ số sai, lỗi, hết giờ → ứng viên đầu, provider rules', async () => {
  for (const run of [reply('xin lỗi, tôi không biết'), reply('{"pick": 9, "reason": "x"}'), reply('{"pick": -1}'), reply('{"pick": 1.5}'), reply('[1]'),
    async () => { throw new Error('Claude Code chưa đăng nhập'); }]) {
    const r = await A.advise({ ...base, run });
    assert.equal(r.provider, 'rules'); assert.equal(r.pick, 0); assert.equal(r.profile, 'toc-do'); assert.ok(r.llm_error); assert.ok(r.reason);
  }
  const t0 = Date.now();
  const r = await A.advise({ ...base, timeout: 1000, run: () => new Promise(() => {}) });
  assert.equal(r.provider, 'rules'); assert.match(r.llm_error, /quá/);
  assert.ok(Date.now() - t0 < 6000, 'hết giờ đúng hạn');
  const n = await A.advise({ ...base, useLlm: false, run: () => assert.fail('không được gọi LLM') });
  assert.equal(n.provider, 'rules'); assert.equal(n.llm_error, undefined);
  await assert.rejects(A.advise({ ...base, goal: 'lung-tung' }), /goal/);
});

test('gói gửi LLM: không đường dẫn máy, không chuỗi giống token, ≤ 20 dòng log', async () => {
  const SECRET = 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd';
  const dirty = [...Array(30)].map((_, i) => ({ ...LOG[i % 3], out: 'C:\\Users\\LeQuang\\video\\out.mp4', token: SECRET, note: SECRET, dir: '/home/u/x' }));
  const hw = { ...HW, chrome: { ...HW.chrome, path: 'C:\\Program Files\\chrome.exe' }, gpu: [{ ...HW.gpu[0], driver: '/usr/lib/nvidia' }] };
  let sent = '';
  await A.advise({ ...base, hw, log: dirty, run: async p => { sent = p; return { text: '{"pick":0,"reason":"ok"}', provider: 'claude' }; } });
  const body = sent.split('\n').pop(); // dòng cuối của prompt là gói dữ liệu
  assert.ok(!sent.includes(SECRET) && !sent.includes('Users'));
  for (const bad of ['Users', 'LeQuang', '/home/', 'chrome.exe', 'Program Files', SECRET, 'sk-ant', '/usr/lib']) assert.ok(!body.includes(bad), 'lộ ' + bad);
  const j = JSON.parse(body);
  assert.equal(j.perf_log.length, 20); assert.equal(j.candidates.length, A.candidates({ ...base, log: dirty, hw }).length);
  assert.equal(j.hw.gpu[0].name, HW.gpu[0].name);
  assert.equal(A.scrub({ a: 'eyJhbGciOiJIUzI1NiJ9.x', b: 'ghp_abcdef', c: 'D:\\ai', d: 'nvenc', apiKey: 'x' }).d, 'nvenc');
  assert.deepEqual(Object.keys(A.scrub({ a: 'eyJhbGciOiJIUzI1NiJ9.x', b: 'ghp_abcdef', c: 'D:\\ai', d: 'nvenc', apiKey: 'x' })), ['d']);
});

// ---------- route ----------
const { readJson } = await import('../../studio/security.mjs');
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
let gate = null, calls = [];
const fakeAdvisor = { GOALS: A.GOALS, advise: async a => { calls.push(a); if (gate) await gate; return { profile: 'can-bang', overrides: {}, reason: 'ok', provider: 'rules', pick: 0, candidates: [] }; } };
const handler = (await import('../../studio/routes/31_perfai.mjs')).default({ SKILL: path.resolve('.'), json, body: req => readJson(req), perfAdvisor: fakeAdvisor });
const app = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try { if (!(await handler(req, res, u.pathname, u))) json(res, { error: 'not found' }, 404); }
  catch (e) { if (!res.headersSent) json(res, { error: e.message }, e.status || 500); }
});
await new Promise(ok => app.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${app.address().port}`;
after(() => { app.closeAllConnections?.(); app.close(); });
const post = async (p, b) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, j: await r.json() }; };

test('route: 400 cho goal/job sai, chỉ nhận đúng đường dẫn', async () => {
  for (const b of [{}, { goal: 'lung-tung' }, { goal: 1 }, [], { goal: 'nhanh', job: [] }, { goal: 'nhanh', job: { W: '1080' } }, { goal: 'nhanh', job: { W: 10 } },
    { goal: 'nhanh', job: { fps: 29.97 } }, { goal: 'nhanh', job: { path: 'C:\\x' } }, { goal: 'nhanh', llm: 'no' }]) {
    const r = await post('/api/perf/advise', b);
    assert.equal(r.status, 400, JSON.stringify(b)); assert.ok(r.j.error);
  }
  assert.equal((await post('/api/perf', { goal: 'nhanh' })).status, 404);
  assert.equal((await fetch(BASE + '/api/perf/advise')).status, 404);
  calls = [];
  const ok = await post('/api/perf/advise', { goal: 'chat-luong', job: { W: 1920, H: 1080, sec: 12.5 }, llm: false });
  assert.equal(ok.status, 200); assert.equal(ok.j.profile, 'can-bang');
  assert.deepEqual(calls[0], { goal: 'chat-luong', job: { W: 1920, H: 1080, sec: 12.5 }, useLlm: false });
});

test('route: một yêu cầu một lúc (409 khi bận)', async () => {
  let open; gate = new Promise(r => (open = r));
  const first = post('/api/perf/advise', { goal: 'nhanh' });
  await new Promise(r => setTimeout(r, 100));
  const second = await post('/api/perf/advise', { goal: 'nhanh' });
  assert.equal(second.status, 409);
  open(); gate = null;
  assert.equal((await first).status, 200);
  assert.equal((await post('/api/perf/advise', { goal: 'song-song' })).status, 200, 'hết bận');
});
