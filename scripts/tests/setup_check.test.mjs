// Test S15 M115: route Kiểm tra máy (studio/routes/01_setup.mjs).
// Chạy: node --test scripts/tests/setup_check.test.mjs
// - danh sách gói pip đọc từ install.ps1 / scripts/setup.sh và khớp PIP_META (không có danh sách thứ hai lệch trình cài)
// - giả lập thiếu ffmpeg (PATH rỗng) và có ffmpeg (PATH trỏ tới một ffmpeg giả), đo < 3 s
// - GET có cache, ?fresh=1 kiểm lại; POST /api/setup/seen ghi $AVS_HOME/setup.json; không lộ token hay .env
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-setup-'));
process.env.AVS_HOME = HOME;
const BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-setup-bin-'));
const M = await import('../../studio/routes/01_setup.mjs');
const { readJson } = await import('../../studio/security.mjs');

const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const handler = M.default({ SKILL, json, body: req => readJson(req) });
const app = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try { if (!(await handler(req, res, u.pathname, u))) json(res, { error: 'not found' }, 404); }
  catch (e) { if (!res.headersSent) json(res, { error: e.message }, e.status || 500); }
});
await new Promise(ok => app.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${app.address().port}`;
after(() => { app.closeAllConnections?.(); app.close(); fs.rmSync(HOME, { recursive: true, force: true }); fs.rmSync(BIN, { recursive: true, force: true }); });

test('gói pip lấy từ chính trình cài, mọi gói có META và ngược lại', () => {
  const win = M.pipFromInstallers(SKILL, 'win32').map(p => p.dist), nix = M.pipFromInstallers(SKILL, 'linux').map(p => p.dist);
  for (const d of ['faster-whisper', 'numpy', 'scipy', 'pillow', 'rembg', 'edge-tts', 'nvidia-cublas-cu12']) {
    assert.ok(win.includes(d), `install.ps1 thiếu ${d}`); assert.ok(nix.includes(d), `setup.sh thiếu ${d}`);
  }
  assert.ok(!win.includes('pip') && !nix.includes('pip'), '--upgrade pip không phải gói');
  for (const d of new Set([...win, ...nix])) assert.ok(M.PIP_META[d], `gói ${d} của trình cài chưa có nhãn trong PIP_META`);
  for (const d of Object.keys(M.PIP_META)) assert.ok(win.includes(d) || nix.includes(d), `PIP_META có ${d} mà trình cài không cài`);
  assert.equal(M.pipFromInstallers(SKILL, 'win32').find(p => p.dist === 'rembg').spec, 'rembg[cpu]');
});

test('thêm gói vào trình cài là màn kiểm thấy ngay (không có danh sách thứ hai)', () => {
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-setup-skill-'));
  fs.mkdirSync(path.join(fake, 'scripts'));
  fs.writeFileSync(path.join(fake, 'install.ps1'), "# & $VPY -m pip install -q commented\n& $VPY -m pip install -q --upgrade pip\n& $VPY -m pip install -q numpy 'newpkg[x]'; if ($LASTEXITCODE) { Die 'x' }\n");
  fs.writeFileSync(path.join(fake, 'scripts/setup.sh'), './.venv/bin/pip -q install numpy "other>=2,<3" || echo no\n');
  assert.deepEqual(M.pipFromInstallers(fake, 'win32').map(p => p.dist), ['numpy', 'newpkg']);
  assert.deepEqual(M.pipFromInstallers(fake, 'darwin').map(p => p.dist), ['numpy', 'other']);
  fs.rmSync(fake, { recursive: true, force: true });
});

test('thiếu ffmpeg (PATH rỗng): mục bắt buộc missing, ready=false, có lệnh cài, < 3 s', async () => {
  const t = Date.now();
  const r = await M.checkAll({ skill: SKILL, env: { ...process.env, PATH: BIN, Path: BIN } });
  assert.ok(Date.now() - t < 3000, `kiểm mất ${Date.now() - t} ms`);
  const ff = r.items.find(i => i.id === 'ffmpeg');
  assert.equal(ff.status, 'missing'); assert.equal(ff.need, 'required'); assert.ok(ff.fix.length > 5); assert.ok(ff.features);
  assert.ok(ff.api.includes('/api/export'));
  assert.equal(r.ready, false);
  assert.match(r.install, /install\.(ps1|sh)/);
  const ids = r.items.map(i => i.id);
  for (const id of ['ffmpeg', 'ffprobe', 'node', 'venv', 'faster-whisper', 'numpy', 'scipy', 'pillow', 'chrome', 'puppeteer-core'])
    assert.equal(r.items.find(i => i.id === id)?.need, 'required', `${id} phải là bắt buộc`);
  // M117: phần nặng trình cài cài sẵn (mặt, tách nền, mô hình whisper, Claude Code) là "recommended"
  for (const id of ['rembg', 'edge-tts', 'cuda', 'headless-shell', 'claude', 'yunet', 'whisper-large-v3-turbo', 'whisper-large-v3', 'rembg-u2net_human_seg'])
    assert.equal(r.items.find(i => i.id === id)?.need, 'recommended', `${id} phải là cài sẵn`);
  for (const id of ['ollama', 'vieneu'])
    assert.equal(r.items.find(i => i.id === id)?.need, 'optional', `${id} phải là tuỳ chọn`);
  assert.equal(new Set(ids).size, ids.length, 'id trùng');
  for (const i of r.items) assert.ok(['ok', 'missing', 'old', 'na'].includes(i.status));
  // không có GPU NVIDIA (nvidia-smi không trên PATH) → cuBLAS không cần
  assert.equal(r.items.find(i => i.id === 'cuda').status, 'na');
  assert.equal(r.items.find(i => i.id === 'node').status, 'ok');
});

test('ffmpeg giả trên PATH: chạy được → ok, chạy lỗi → thiếu kèm ghi chú', async () => {
  const exe = path.join(BIN, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (process.platform === 'win32') { try { fs.linkSync(process.execPath, exe); } catch { fs.copyFileSync(process.execPath, exe); } }
  else { fs.writeFileSync(exe, '#!/bin/sh\necho "ffmpeg version 6.1.1 Copyright"\n'); fs.chmodSync(exe, 0o755); }
  const r = await M.checkAll({ skill: SKILL, env: { ...process.env, PATH: BIN, Path: BIN } });
  const ff = r.items.find(i => i.id === 'ffmpeg');
  if (process.platform === 'win32') {
    // node.exe đội tên ffmpeg.exe: tìm thấy nhưng `-version` lỗi → vẫn là thiếu, kèm ghi chú
    assert.equal(ff.status, 'missing'); assert.match(ff.note, /không chạy được/);
  } else { assert.equal(ff.status, 'ok'); assert.equal(ff.version, '6.1.1'); }
  assert.equal(r.items.find(i => i.id === 'ffprobe').status, 'missing');
});

test('lệnh cài theo hệ điều hành', async () => {
  const w = await M.checkAll({ skill: SKILL, platform: 'win32', env: { PATH: BIN } });
  assert.match(w.install, /^powershell -ExecutionPolicy Bypass -File .*install\.ps1/);
  assert.match(w.items.find(i => i.id === 'ffmpeg').fix, /winget/);
  const m = await M.checkAll({ skill: SKILL, platform: 'darwin', env: { PATH: BIN } });
  assert.match(m.install, /^bash .*install\.sh/);
  assert.match(m.items.find(i => i.id === 'ffmpeg').fix, /brew install ffmpeg/);
  assert.match(m.items.find(i => i.id === 'rembg').fix, /-m pip install "rembg\[cpu\]"/);
});

test('GET có cache, fresh=1 kiểm lại, POST seen ghi setup.json; không lộ token/.env', async () => {
  const a = await (await fetch(BASE + '/api/setup/check')).json();
  assert.ok(Array.isArray(a.items) && a.items.length >= 18);
  assert.equal(a.seen, false); assert.equal(a.cached, false);
  const b = await (await fetch(BASE + '/api/setup/check')).json();
  assert.equal(b.cached, true); assert.equal(b.at, a.at);
  const c = await (await fetch(BASE + '/api/setup/check?fresh=1')).json();
  assert.equal(c.cached, false);
  const s = JSON.stringify(a);
  assert.doesNotMatch(s, /claude-token|\.env\b|studio-\d+\.token|OAUTH/i);
  const p = await fetch(BASE + '/api/setup/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ missing: ['ffmpeg', '../x', 7] }) });
  assert.equal(p.status, 200);
  const f = JSON.parse(fs.readFileSync(path.join(HOME, 'setup.json'), 'utf8'));
  assert.equal(f.seen, true); assert.deepEqual(f.later, ['ffmpeg']);
  const d = await (await fetch(BASE + '/api/setup/check')).json();
  assert.equal(d.seen, true); assert.deepEqual(d.later, ['ffmpeg']);
  assert.equal((await fetch(BASE + '/api/setup/other')).status, 404);
});

// ---------- M116: cài giúp ----------
test('fixPlan: lệnh dựng từ danh sách cho phép, đúng hệ điều hành', () => {
  const o = { skill: SKILL, platform: 'win32', venv: true, winget: 'C:/w/winget.exe', brew: null, npm: '/n/npm-cli.js', node: '/n/node', puppeteer: true };
  const all = M.fixPlan('all', o)[0];
  // đường dẫn tuyệt đối: ctx.run chạy ở thư mục dự án, tên trần có thể khớp file lạ trong đó
  assert.ok(path.win32.isAbsolute(all.cmd) && /powershell\.exe$/i.test(all.cmd), all.cmd);
  assert.equal(M.fixPlan('all', { ...o, platform: 'linux' })[0].cmd, '/bin/bash');
  assert.equal(M.fixPlan('constructor', o), null); assert.equal(M.fixPlan('toString', o), null);
  assert.ok(M.fixPlan('ffmpeg', o)[0].okText.test('Found an existing package already installed.')); assert.ok(all.argv.includes('-Yes')); assert.match(all.argv.join(' '), /install\.ps1/);
  assert.match(M.fixPlan('all', { ...o, platform: 'darwin' })[0].argv[0], /install\.sh$/);
  const rem = M.fixPlan('rembg', o)[0];
  assert.match(rem.cmd, /\.venv[\\/]Scripts[\\/]python\.exe$/); assert.deepEqual(rem.argv, ['-m', 'pip', 'install', 'rembg[cpu]']);
  assert.equal(M.fixPlan('rembg', { ...o, venv: false }), null, 'chưa có .venv → dùng trình cài');
  assert.deepEqual(M.fixPlan('yunet', o)[0].argv, ['-m', 'pip', 'install', 'onnxruntime']);
  assert.deepEqual(M.fixPlan('ffmpeg', o)[0].argv.slice(0, 3), ['install', '--id', 'Gyan.FFmpeg']);
  assert.equal(M.fixPlan('ffmpeg', { ...o, winget: null }), null);
  assert.deepEqual(M.fixPlan('chrome', { ...o, platform: 'darwin', brew: '/b/brew' })[0].argv, ['install', '--cask', 'google-chrome']);
  assert.deepEqual(M.fixPlan('puppeteer-core', o)[0].argv.slice(0, 2), ['/n/npm-cli.js', 'install']);
  assert.equal(M.fixPlan('headless-shell', { ...o, puppeteer: false }), null);
  assert.equal(M.fixPlan('vieneu', o), null);
  assert.equal(M.fixPlan('rm -rf /', o), null);
});

test('POST /api/setup/install: chỉ nhận id, chạy job với lệnh của server, bận thì 409', async () => {
  const calls = [];
  let job = null, busy = false;
  const ctx2 = { SKILL, json, body: req => readJson(req), get job() { return job; },
    startJob: (kind, fn, payload) => { if (busy) return false; job = { kind, step: '', progress: 0, log: '', payload }; job.done = fn(payload).then(() => 'done', e => 'error:' + e.message); return true; },
    run: async (cmd, argv, onLine) => { calls.push([cmd, argv]); onLine('▸ Kiểm tra công cụ'); } };
  const h = M.default(ctx2);
  const srv = http.createServer(async (req, res) => { const u = new URL(req.url, 'http://x'); if (!(await h(req, res, u.pathname, u))) json(res, {}, 404); });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const B = `http://127.0.0.1:${srv.address().port}`;
  const post = async b => { const r = await fetch(B + '/api/setup/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, j: await r.json() }; };
  try {
    assert.equal((await post({ cmd: 'calc.exe' })).status, 400);
    assert.equal((await post({ id: 'không có' })).status, 400);
    assert.equal((await post({ id: 'vieneu' })).status, 400, 'mục không cài lẻ được');
    const r = await post({ id: 'all' });
    assert.equal(r.status, 200); assert.equal(job.kind, 'setup');
    await new Promise(ok => setTimeout(ok, 50));
    assert.equal(calls.length, 1);
    assert.match(calls[0][1].join(' '), /install\.(ps1|sh)/);
    assert.equal(job.step.length > 0, true);
    assert.equal(await job.done, 'done');
    busy = true;
    assert.equal((await post({ id: 'all' })).status, 409);
  } finally { srv.closeAllConnections?.(); srv.close(); }
});

test('cài giúp: lệnh lỗi thì job lỗi; winget báo "đã cài" thì coi là xong', async () => {
  let job = null, mode = 'fail';
  const ctx3 = { SKILL, json, body: req => readJson(req), get job() { return job; },
    startJob: (kind, fn) => { job = { kind, step: '', progress: 0, log: '' }; job.done = fn().then(() => 'done', e => 'error:' + e.message); return true; },
    run: async () => { job.log += mode === 'fail' ? 'boom\n' : 'Found an existing package already installed.\n'; throw new Error('winget.exe lỗi (mã 1)'); } };
  const h = M.default(ctx3);
  const srv = http.createServer(async (req, res) => { const u = new URL(req.url, 'http://x'); if (!(await h(req, res, u.pathname, u))) json(res, {}, 404); });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const post = async b => (await fetch(`http://127.0.0.1:${srv.address().port}/api/setup/install`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).status;
  try {
    assert.equal(await post({ id: 'all' }), 200);
    assert.match(await job.done, /^error:/, 'trình cài lỗi → job lỗi');
    // okText chỉ gắn cho bước winget; trình cài ("all") không có okText nên "already installed" vẫn là lỗi
    mode = 'ok';
    assert.equal(await post({ id: 'all' }), 200);
    assert.match(await job.done, /^error:/);
  } finally { srv.closeAllConnections?.(); srv.close(); }
});

// ---------- M117: cài sẵn mô hình, Ollama tắt mặc định ----------
test('models.json: mô hình whisper large-v3 + large-v3-turbo và tách nền; trình cài tải sẵn và cài onnxruntime', () => {
  const ms = M.loadModels(SKILL), names = ms.map(m => m.name);
  for (const n of ['large-v3', 'large-v3-turbo', 'u2net_human_seg']) assert.ok(names.includes(n), n);
  assert.equal(ms.find(m => m.name === 'large-v3').repo, 'Systran/faster-whisper-large-v3');
  const ps1 = fs.readFileSync(path.join(SKILL, 'install.ps1'), 'utf8'), sh = fs.readFileSync(path.join(SKILL, 'scripts/setup.sh'), 'utf8');
  assert.match(ps1, /prefetch_models\.py/); assert.match(ps1, /\$NoModels/);
  assert.match(sh, /prefetch_models\.py/); assert.match(sh, /AVS_NO_MODELS/);
  assert.match(fs.readFileSync(path.join(SKILL, 'install.sh'), 'utf8'), /--no-models/);
  for (const plat of ['win32', 'linux']) assert.ok(M.pipFromInstallers(SKILL, plat).some(p => p.dist === 'onnxruntime'), `onnxruntime trong trình cài ${plat}`);
});

test('mô hình có / chưa có: đọc cache Hugging Face và thư mục rembg, không import thư viện', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-models-'));
  const env = { HOME: home, USERPROFILE: home, PATH: BIN };
  const v3 = M.loadModels(SKILL).find(m => m.name === 'large-v3'), seg = M.loadModels(SKILL).find(m => m.kind === 'rembg');
  try {
    assert.equal(M.modelPresent(v3, env), false);
    const snap = path.join(home, '.cache/huggingface/hub/models--Systran--faster-whisper-large-v3/snapshots/abc');
    fs.mkdirSync(snap, { recursive: true });
    assert.equal(M.modelPresent(v3, env), false, 'chưa có model.bin (tải dở) → chưa có');
    fs.writeFileSync(path.join(snap, 'model.bin'), 'x');
    assert.equal(M.modelPresent(v3, env), true);
    assert.equal(M.modelPresent(v3, { ...env, HF_HUB_CACHE: path.join(home, 'khac') }), false, 'HF_HUB_CACHE thắng mặc định');
    assert.equal(M.modelPresent(seg, env), false);
    fs.mkdirSync(path.join(home, '.u2net')); fs.writeFileSync(path.join(home, '.u2net', 'u2net_human_seg.onnx'), 'x');
    assert.equal(M.modelPresent(seg, env), true);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('fixPlan mô hình: tải bằng prefetch_models.py trong .venv khi đã có thư viện của nó', () => {
  const o = { skill: SKILL, platform: 'linux', venv: true, pkgs: { 'faster-whisper': true, rembg: false } };
  const st = M.fixPlan('whisper-large-v3', o)[0];
  assert.match(st.cmd, /\.venv[\\/]bin[\\/]python$/);
  assert.deepEqual(st.argv.slice(-2), ['--model', 'large-v3']); assert.match(st.argv[1], /prefetch_models\.py$/);
  assert.equal(M.fixPlan('rembg-u2net_human_seg', o), null, 'thiếu rembg → trình cài');
  assert.equal(M.fixPlan('whisper-large-v3', { ...o, venv: false }), null);
  assert.equal(M.fixPlan('whisper-khong-co', o), null);
});

test('Ollama tắt mặc định: màn Kiểm tra máy ghi "na", không dò máy chủ; bật thì kiểm như cũ', async () => {
  const cfg = path.join(HOME, 'config.json');
  const r = await M.checkAll({ skill: SKILL, env: { ...process.env, PATH: BIN, Path: BIN } });
  const ol = r.items.find(i => i.id === 'ollama');
  assert.equal(ol.status, 'na'); assert.match(ol.note, /tắt/); assert.equal(ol.auto, '');
  const L = await import('../llm.mjs');
  assert.equal(L.llmConfig().text, 'claude'); assert.equal(L.llmConfig().ollama.enabled, false);
  L.saveLlmConfig({ enabled: true });
  assert.equal(L.llmConfig().ollama.enabled, true);
  const r2 = await M.checkAll({ skill: SKILL, env: { ...process.env, PATH: BIN, Path: BIN } });
  assert.notEqual(r2.items.find(i => i.id === 'ollama').note, ol.note);
  L.saveLlmConfig({ text: 'ollama' }); L.saveLlmConfig({ enabled: false });
  assert.deepEqual([L.llmConfig().text, L.llmConfig().ollama.enabled], ['claude', false], 'tắt Ollama → quay về Claude');
  fs.rmSync(cfg, { force: true });
});
