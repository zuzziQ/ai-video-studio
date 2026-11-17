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
  for (const id of ['rembg', 'edge-tts', 'cuda', 'headless-shell', 'ollama', 'vieneu', 'claude', 'yunet'])
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
