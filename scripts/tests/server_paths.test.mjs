// M39 — cổng HTTP của Studio (studio/server.mjs): thoát thư mục qua tiền tố tĩnh (/studio/, /engine/, /assets/, /templates/, /project/),
// Origin / Host / Sec-Fetch-Site, token phiên cho /api (kể cả route plugin). Chạy: node --test scripts/tests/*.test.mjs
// Server thật được bật trên cổng trống với AVS_HOME tạm; file "bí mật" nằm ngoài thư mục được phục vụ; không gọi mạng ngoài.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { killTree } from '../platform.mjs';
import { tokenFile } from '../../studio/security.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-paths-m39-'));
const HOME = path.join(TMP, 'home');           // thư mục cấu hình (chứa "token" giả)
const PROJ = path.join(TMP, 'proj');           // dự án được mở
const SECRET_MARK = 'BI-MAT-M39-' + 'x'.repeat(8);
const SECRET = path.join(HOME, 'config.json');
const TL = JSON.stringify({ width: 720, height: 1280, duration: 2, scenes: [] });

fs.mkdirSync(HOME, { recursive: true });
fs.writeFileSync(SECRET, JSON.stringify({ openai: SECRET_MARK }));
fs.mkdirSync(PROJ, { recursive: true });
fs.writeFileSync(path.join(PROJ, 'timeline.json'), TL);

let srv = null, PORT = 0, TOKEN = '';

const freePort = () => new Promise(ok => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
// Yêu cầu thô: giữ nguyên đường dẫn (không để client chuẩn hoá ..), trả status + body
function raw(p, { method = 'GET', headers = {}, body, token = TOKEN, host } = {}) {
  return new Promise((ok, bad) => {
    const h = { ...headers };
    if (token) h['X-AVS-Token'] = token;
    if (host) h.Host = host;
    if (body !== undefined) h['Content-Length'] = Buffer.byteLength(body);
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: h }, res => {
      const c = []; res.on('data', d => c.push(d));
      res.on('end', () => ok({ status: res.statusCode, text: Buffer.concat(c).toString('utf8') }));
    });
    r.on('error', bad);
    if (body !== undefined) r.end(body); else r.end();
  });
}

before(async () => {
  PORT = await freePort();
  const env = { ...process.env, AVS_HOME: HOME, AVS_NO_LAUNCHCTL: '1', AVS_DRY_OPEN: '1' };
  srv = spawn(process.execPath, [path.join(SKILL, 'studio/server.mjs'), PROJ, '--port', String(PORT)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  await new Promise((ok, bad) => {
    const t = setTimeout(() => bad(new Error('server không khởi động:\n' + out)), 20000);
    const on = d => { out += d; if (out.includes('AI Video Studio')) { clearTimeout(t); ok(); } };
    srv.stdout.on('data', on); srv.stderr.on('data', on);
    srv.on('exit', c => bad(new Error(`server thoát mã ${c}:\n${out}`)));
  });
  for (let i = 0; i < 50 && !fs.existsSync(tokenFile(PORT, HOME)); i++) await new Promise(r => setTimeout(r, 100));
  TOKEN = fs.readFileSync(tokenFile(PORT, HOME), 'utf8');
});
after(async () => {
  if (srv) await killTree(srv);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* file còn bị khoá: bỏ qua */ }
});

// Các cách viết đường dẫn trỏ tới SECRET, tương đối với một thư mục gốc phục vụ tĩnh
function escapes(root, target) {
  const rel = path.relative(root, target).split(/[\\/]/);
  return {
    dotdotSlash: rel.map(encodeURIComponent).join('%2F'),           // ..%2F..%2F…
    dotdotBackslash: rel.map(encodeURIComponent).join('%5C'),       // ..%5C..%5C…
    absolute: encodeURIComponent(target),                          // %2Fhome… hoặc D%3A%5C…
    doubleEncoded: rel.map(s => encodeURIComponent(encodeURIComponent(s))).join('%252F'), // chỉ giải mã một lần
  };
}

test('tiền tố tĩnh /studio/ /engine/ /assets/ /templates/: không đọc được file ngoài thư mục gốc', async () => {
  const roots = {
    '/studio/': path.join(SKILL, 'studio'),
    '/engine/': path.join(SKILL, 'engine'),
    '/assets/': path.join(SKILL, 'assets'),
    '/templates/': path.join(SKILL, 'templates'),
  };
  for (const [prefix, root] of Object.entries(roots)) {
    for (const [kind, enc] of Object.entries(escapes(root, SECRET))) {
      const r = await raw(prefix + enc);
      assert.ok(r.status !== 200 || !r.text.includes(SECRET_MARK), `${prefix} ${kind} lộ file bí mật (status ${r.status})`);
      assert.ok(!r.text.includes(SECRET_MARK), `${prefix} ${kind} trả nội dung bí mật`);
    }
  }
});

test('tiền tố /studio/: NUL, dấu .. đứng riêng và chuỗi %2e%2e không lộ file', async () => {
  for (const p of ['/studio/%00', '/studio/..%2F..%2F', '/studio/%2e%2e%2f%2e%2e%2f', '/studio/%2e%2e/%2e%2e/config.json', '/studio/%E0%A4%A']) {
    const r = await raw(p);
    assert.notEqual(r.status, 200, p);
    assert.ok(!r.text.includes(SECRET_MARK), p);
  }
});

test('/project/: không thoát thư mục dự án, không đọc được config folder', async () => {
  for (const [kind, enc] of Object.entries(escapes(PROJ, SECRET))) {
    const r = await raw('/project/' + enc);
    assert.ok(!r.text.includes(SECRET_MARK), `/project/ ${kind} lộ bí mật`);
  }
  const ok = await raw('/project/timeline.json');
  assert.equal(ok.status, 200);
  assert.match(ok.text, /"width":720/);
});

test('Origin lạ, Host lạ, Sec-Fetch-Site khác site: 403 cho cả trang và tệp tĩnh', async () => {
  const cases = [
    { headers: { Origin: 'null' } },
    { headers: { Origin: 'https://evil.example' } },
    { headers: { Origin: 'http://localhost:3000' } },           // web app khác trên máy
    { headers: { 'Sec-Fetch-Site': 'cross-site' } },            // <img src> từ site khác
    { host: 'evil.example:' + PORT },                           // DNS rebinding
    { host: 'localhost:' + (PORT + 1) },                        // cổng khác
  ];
  for (const c of cases) {
    for (const p of ['/', '/studio/index.html', '/api/project']) {
      const r = await raw(p, { ...c, token: TOKEN });
      assert.equal(r.status, 403, `${p} ${JSON.stringify(c)}`);
    }
  }
  const same = await raw('/api/project', { token: TOKEN, headers: { Origin: `http://127.0.0.1:${PORT}`, 'Sec-Fetch-Site': 'same-origin' }, host: `127.0.0.1:${PORT}` });
  assert.equal(same.status, 200);
});

test('/api/* không có token → 401, kể cả route plugin (stylelab, job) và POST', async () => {
  assert.equal((await raw('/api/stylelab/packs', { token: null })).status, 401);
  assert.equal((await raw('/api/job', { token: null })).status, 401);
  assert.equal((await raw('/api/job/cancel', { method: 'POST', token: null, body: '{}' })).status, 401);
  assert.equal((await raw('/api/stylelab/packs', { token: 'sai-token' })).status, 401);
});

test('token trong query chỉ dùng được cho GET; POST chỉ nhận header', async () => {
  const q = encodeURIComponent(TOKEN);
  assert.equal((await raw('/api/job?avs_token=' + q, { token: null })).status, 200);
  const post = await raw('/api/job/cancel?avs_token=' + q, { method: 'POST', token: null, body: '{}', headers: { 'Content-Type': 'application/json' } });
  assert.equal(post.status, 401);
});

test('route plugin có token đúng thì trả lời (không bị chặn oan)', async () => {
  const r = await raw('/api/stylelab/packs');
  assert.notEqual(r.status, 401);
  assert.notEqual(r.status, 403);
});
