// Studio API guards (ROADMAP M33, M37): project path checks, session token, same origin, body limits.
// run: node --test scripts/tests/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { forbiddenDir, resolveProject, fileAllowed, tokenOk, sameOrigin, bodyStatus, readJson, tokenFile, cookieName } from '../../studio/security.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-sec-'));
const HOME = path.join(TMP, 'home');
const TL = JSON.stringify({ width: 720, height: 1280, duration: 2, scenes: [] });
const mk = (rel, files = {}) => { const d = path.join(TMP, rel); fs.mkdirSync(d, { recursive: true }); for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(d, f), c); return d; };
mk('home', { 'config.json': '{"openai":"secret"}', 'telegram.json': '{"token":"secret"}', 'timeline.json': TL });
mk('home/telegram', { 'timeline.json': TL });
mk('home/autopilot/projects/p1', { 'timeline.json': TL });
mk('', { 'timeline.json': TL }); // TMP itself: an ancestor of HOME
const PROJ = mk('proj', { 'timeline.json': TL });
const NOTL = mk('empty');
const OTHER = mk('proj2', { 'timeline.json': TL, 'edit.json': TL, 'notes.json': '{"a":1}' });

// ---------- unit ----------
test('forbiddenDir: config folder, its parents and non-project children are refused', () => {
  assert.ok(forbiddenDir(HOME, HOME));
  assert.ok(forbiddenDir(TMP, HOME));
  assert.ok(forbiddenDir(path.join(HOME, 'telegram'), HOME));
  assert.equal(forbiddenDir(path.join(HOME, 'autopilot/projects/p1'), HOME), null);
  assert.equal(forbiddenDir(PROJ, HOME), null);
});

test('resolveProject: needs a timeline, never the config folder', () => {
  assert.deepEqual(resolveProject(PROJ, HOME), { dir: PROJ, tlFile: path.join(PROJ, 'timeline.json') });
  assert.equal(resolveProject(path.join(OTHER, 'edit.json'), HOME).dir, OTHER);
  const st = (p, code) => assert.throws(() => resolveProject(p, HOME), e => e.status === code);
  st(NOTL, 400); // no timeline.json
  st(HOME, 403);
  st(path.join(HOME, 'config.json'), 403); // the original exploit: a .json inside the config folder
  st(path.join(HOME, 'telegram'), 403);
  st(TMP, 403);
  st(path.join(OTHER, 'notes.json'), 403); // a .json that is not a timeline
  st('', 400);
  st(undefined, 400);
});

test('tokenOk: header always, query only for GET/HEAD, exact match', () => {
  const T = 'abc123';
  const r = (method, headers = {}, q = '') => tokenOk({ method, headers }, new URL('http://x/api/a' + q), T);
  assert.equal(r('GET'), false);
  assert.equal(r('GET', { 'x-avs-token': T }), true);
  assert.equal(r('POST', { 'x-avs-token': T }), true);
  assert.equal(r('POST', { 'x-avs-token': 'abc12' }), false);
  assert.equal(r('POST', { 'x-avs-token': 'abc124' }), false);
  assert.equal(r('GET', {}, '?avs_token=' + T), true);
  assert.equal(r('POST', {}, '?avs_token=' + T), false);
  assert.equal(tokenOk({ method: 'GET', headers: { 'x-avs-token': '' } }, new URL('http://x/'), ''), false);
});

test('sameOrigin: loopback host on this port, same Origin, same-origin fetch only', () => {
  const ok = (h, port = 5186) => sameOrigin({ headers: h }, port);
  assert.equal(ok({ host: 'localhost:5186' }), true);
  assert.equal(ok({ host: '127.0.0.1:5186', origin: 'http://127.0.0.1:5186', 'sec-fetch-site': 'same-origin' }), true);
  assert.equal(ok({ host: 'localhost:5186', 'sec-fetch-site': 'none' }), true);
  assert.equal(ok({ host: 'evil.com:5186' }), false); // DNS rebinding
  assert.equal(ok({ host: 'localhost:5187' }), false);
  assert.equal(ok({ host: 'localhost:5186', origin: 'http://localhost:3000' }), false); // another local web app
  assert.equal(ok({ host: 'localhost:5186', origin: 'https://evil.com' }), false);
  assert.equal(ok({ host: 'localhost:5186', origin: 'null' }), false);
  assert.equal(ok({ host: 'localhost:5186', 'sec-fetch-site': 'cross-site' }), false); // <img src> from another site
  assert.equal(ok({ host: 'localhost:5186', 'sec-fetch-site': 'same-site' }), false);
});

test('bodyStatus: JSON vs upload limits, chunked refused', () => {
  const lim = { json: 100, upload: 1000 };
  const s = (p, h) => bodyStatus({ headers: h }, p, lim);
  assert.equal(s('/api/save', {}), 0);
  assert.equal(s('/api/save', { 'content-length': '100' }), 0);
  assert.equal(s('/api/save', { 'content-length': '101' }), 413);
  assert.equal(s('/api/upload', { 'content-length': '900' }), 0);
  assert.equal(s('/api/autopilot/upload', { 'content-length': '1001' }), 413);
  assert.equal(s('/api/save', { 'transfer-encoding': 'chunked' }), 411);
  assert.equal(s('/api/batch/sheet', { 'content-length': '101' }), 413); // buffered in memory → JSON cap
});

test('resolveProject: UNC paths refused on Windows', { skip: process.platform !== 'win32' }, () => {
  assert.throws(() => resolveProject('\\\\localhost\\c$\\Users', HOME), e => e.status === 403);
  assert.throws(() => resolveProject('//localhost/c$/Users', HOME), e => e.status === 403);
});

test('symlinks into the config folder are refused (project folder, timeline, /project/ file)', () => {
  const link = (target, at, type) => { try { fs.symlinkSync(target, at, type); return true; } catch { return false; } };
  const p = mk('linkproj', { 'timeline.json': TL });
  if (link(HOME, path.join(p, 'cfg'), 'junction')) assert.equal(fileAllowed(path.join(p, 'cfg', 'telegram.json'), HOME), false);
  assert.equal(fileAllowed(path.join(p, 'timeline.json'), HOME), true);
  const q = mk('linkproj2');
  if (link(path.join(HOME, 'timeline.json'), path.join(q, 'timeline.json'), 'file')) assert.throws(() => resolveProject(q, HOME), e => e.status === 403);
  const r = path.join(TMP, 'linkhome');
  if (link(HOME, r, 'junction')) assert.throws(() => resolveProject(r, HOME), e => e.status === 403);
});

test('readJson: caps the bytes it buffers', async () => {
  const { Readable } = await import('node:stream');
  const req = n => Object.assign(Readable.from([Buffer.alloc(n, 0x20)]), {});
  await assert.rejects(readJson(req(50), 10), e => e.status === 413);
  assert.deepEqual(await readJson(Readable.from([Buffer.from('{"a":1}')]), 10), { a: 1 });
});

// ---------- the real server ----------
let srv, PORT, TOKEN, SESSION;
const freePort = () => new Promise(ok => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
function call(p, { method = 'GET', headers = {}, body, token = TOKEN, host } = {}) {
  return new Promise((ok, bad) => {
    const h = { ...headers };
    if (token) h['X-AVS-Token'] = token;
    if (host) h.Host = host;
    if (body !== undefined && !h['Transfer-Encoding']) h['Content-Length'] = Buffer.byteLength(body);
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: h }, res => {
      const c = []; res.on('data', d => c.push(d)); res.on('end', () => ok({ status: res.statusCode, text: Buffer.concat(c).toString() }));
    });
    r.on('error', bad);
    if (body !== undefined) r.end(body); else r.end();
  });
}
before(async () => {
  PORT = await freePort();
  srv = spawn(process.execPath, [path.join(SKILL, 'studio/server.mjs'), PROJ, '--port', String(PORT)],
    { env: { ...process.env, AVS_HOME: HOME, AVS_MAX_JSON_MB: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
after(() => { srv?.kill(); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

test('server: main page needs the browser session; the launch link ?k=<token> sets it; the page then carries the token', async () => {
  const bare = await call('/', { token: null });
  assert.equal(bare.status, 401); // a local process that only reaches the port does not get the token from the page
  assert.ok(!bare.text.includes(TOKEN));
  assert.equal((await call('/?k=' + 'x'.repeat(TOKEN.length), { token: null })).status, 401);
  const res = await new Promise((ok, bad) => http.get({ host: '127.0.0.1', port: PORT, path: '/?k=' + encodeURIComponent(TOKEN) }, ok).on('error', bad));
  res.resume();
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, '/');
  const ck = String(res.headers['set-cookie'] || '');
  assert.match(ck, new RegExp(`^${cookieName(PORT)}=[A-Za-z0-9_-]{32,}; Path=/; HttpOnly; SameSite=Strict`));
  const cookie = ck.split(';')[0];
  SESSION = cookie.split('=')[1];
  assert.notEqual(SESSION, TOKEN, 'cookie (cũng gửi tới cổng localhost khác) không phải token API');
  assert.equal((await call('/api/project', { token: SESSION })).status, 401, 'giá trị cookie không dùng được làm X-AVS-Token');
  const r = await call('/', { token: null, headers: { Cookie: cookie } });
  assert.equal(r.status, 200);
  assert.match(r.text, new RegExp(`<meta name="avs-token" content="${TOKEN}">`));
  assert.ok(TOKEN.length >= 32);
  // another Studio's cookie (other port) does not count
  assert.equal((await call('/', { token: null, headers: { Cookie: `${cookieName(PORT + 1)}=${SESSION}` } })).status, 401);
  assert.equal((await call('/', { token: null, headers: { Cookie: `${cookieName(PORT)}=${TOKEN}` } })).status, 401, 'token API không thay được cookie');
});

test('server: /project/* needs the session cookie or the API token', async () => {
  assert.equal((await call('/project/timeline.json', { token: null })).status, 401);
  assert.equal((await call('/project/timeline.json', { token: null, headers: { Cookie: `${cookieName(PORT)}=${'x'.repeat(TOKEN.length)}` } })).status, 401);
  assert.equal((await call('/project/timeline.json', { token: null, headers: { Cookie: `other=1; ${cookieName(PORT)}=${SESSION}` } })).status, 200);
  assert.equal((await call('/project/timeline.json')).status, 200);
});

test('server: /api without or with a wrong token → 401', async () => {
  assert.equal((await call('/api/project', { token: null })).status, 401);
  assert.equal((await call('/api/project', { token: 'x'.repeat(TOKEN.length) })).status, 401);
  assert.equal((await call('/api/open', { method: 'POST', token: null, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: HOME }) })).status, 401);
  assert.equal((await call('/api/project')).status, 200);
  assert.equal((await call('/api/project?avs_token=' + encodeURIComponent(TOKEN), { token: null })).status, 200);
});

test('server: /api/open refuses the config folder and folders without timeline.json', async () => {
  const open = p => call('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) });
  assert.equal((await open(HOME)).status, 403);
  assert.equal((await open(path.join(HOME, 'config.json'))).status, 403);
  assert.equal((await open(TMP)).status, 403);
  assert.equal((await open(NOTL)).status, 400);
  // still on the original project
  assert.equal(JSON.parse((await call('/api/project')).text).meta.dir, PROJ);
  assert.equal((await call('/project/config.json')).status, 404);
  assert.equal((await open(OTHER)).status, 200);
  assert.equal(JSON.parse((await call('/api/project')).text).meta.dir, OTHER);
});

test('server: other origins and hosts → 403 even with the token', async () => {
  assert.equal((await call('/api/project', { headers: { Origin: 'https://evil.com' } })).status, 403);
  assert.equal((await call('/api/project', { headers: { Origin: 'http://localhost:3000' } })).status, 403);
  assert.equal((await call('/api/project', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await call('/api/project', { host: 'evil.com:' + PORT })).status, 403);
  assert.equal((await call('/api/project', { headers: { Origin: `http://127.0.0.1:${PORT}`, 'Sec-Fetch-Site': 'same-origin' }, host: `127.0.0.1:${PORT}` })).status, 200);
});

// The 413 is decided from the Content-Length header alone, and the server closes the connection right after answering.
// Sending the 1.5 MB body as well raced that close (write EPIPE on the Linux runner, CI run 43363531642), so the oversized
// request declares the length and sends only the head: same server path, no client write to break.
function headOnlyStatus(p, headers) {
  return new Promise((ok, bad) => {
    const s = net.connect(PORT, '127.0.0.1', () => s.write(`POST ${p} HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nX-AVS-Token: ${TOKEN}\r\n`
      + Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('') + '\r\n'));
    let got = '';
    s.on('data', d => { got += d; const m = /^HTTP\/1\.1 (\d{3})/.exec(got); if (m) { s.destroy(); ok(+m[1]); } });
    s.on('error', bad);
    s.setTimeout(5000, () => { s.destroy(); bad(new Error('no response: ' + got)); });
  });
}
test('server: oversized / chunked bodies are refused, GET side effects are gone', async () => {
  assert.equal(await headOnlyStatus('/api/save', { 'Content-Type': 'application/json', 'Content-Length': String(1.5 * (1 << 20)) }), 413);
  assert.equal((await call('/api/save', { method: 'POST', headers: { 'Transfer-Encoding': 'chunked' }, body: '{}' })).status, 411);
  assert.equal((await call('/api/srt')).status, 404); // GET no longer writes out/<name>.srt
  assert.equal((await call('/api/still?t=1')).status, 404);
  const srt = await call('/api/srt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(srt.status, 200);
  assert.match(JSON.parse(srt.text).out, /^out\/.+\.srt$/);
});
