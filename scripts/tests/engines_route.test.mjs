// Test M26/M27: route Studio "Mô hình & giọng" (studio/routes/28_engines.mjs) + scripts/tts_config.mjs + pickVoice của topic_video.mjs.
// Chạy: node --test scripts/tests/engines_route.test.mjs
// Không cần Ollama/VieNeu/Claude thật: máy chủ HTTP giả trên 127.0.0.1; AVS_HOME là thư mục tạm.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '../..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-engines-'));
process.env.AVS_HOME = HOME;
process.env.CLAUDE_BIN = path.join(HERE, 'fixtures/fake_claude.mjs');
for (const k of ['AVS_LLM_TEXT', 'AVS_LLM_FALLBACK', 'OLLAMA_HOST', 'AVS_OLLAMA_MODEL', 'AVS_VIENEU_URL']) delete process.env[k];
const CONF = path.join(HOME, 'config.json');
const SECRET = 'sk-THIS-IS-A-SECRET-KEY-1234', VPY = path.join(HOME, 'vieneu', 'python-secret-path.exe');
const setConf = c => fs.writeFileSync(CONF, JSON.stringify(c));
const conf = () => JSON.parse(fs.readFileSync(CONF, 'utf8'));

// fake Ollama + fake VieNeu on one loopback server
const VOICES = [{ name: 'Hải Đăng', gender: 'nam', region: 'Bắc', kind: 'preset' }, { name: 'Trúc Ly', gender: 'nữ', region: 'Nam', kind: 'preset' }];
const CLONES = [], CLONE_BODIES = [];
const fake = http.createServer((req, res) => {
  let b = ''; req.on('data', d => (b += d)); req.on('end', () => {
    const send = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/api/tags') return send({ models: [{ name: 'qwen2.5:7b' }] });
    if (req.url === '/api/generate') return send({ response: '{"ok": true, "loi_chao": "Xin chào"}', done: true });
    if (req.url === '/health') return send({ ready: true, loaded: false, clone: true, voices: [...VOICES, ...CLONES.map(name => ({ name, kind: 'clone' }))], default: 'Hải Đăng' });
    if (req.url === '/voices') { const j = JSON.parse(b); CLONE_BODIES.push(j); CLONES.push(j.name); return send({ name: j.name, seconds: 5 }); }
    if (req.url === '/voices/delete') { const i = CLONES.indexOf(JSON.parse(b).name); if (i < 0) return send({ error: 'Không có' }, 404); CLONES.splice(i, 1); return send({ ok: true }); }
    send({ error: 'no' }, 404);
  });
});
await new Promise(ok => fake.listen(0, '127.0.0.1', ok));
const FAKE = `http://127.0.0.1:${fake.address().port}`;
// a loopback port with nothing listening
const closed = http.createServer(); await new Promise(ok => closed.listen(0, '127.0.0.1', ok));
const DEAD = `http://127.0.0.1:${closed.address().port}`; await new Promise(ok => closed.close(ok));

// the route behind a minimal ctx (same shape as studio/server.mjs: json, body, SKILL, PY; errors with .status → JSON)
const { readJson } = await import('../../studio/security.mjs');
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const ctx = { SKILL, PY: process.platform === 'win32' ? 'python' : 'python3', json, body: req => readJson(req) };
const handler = (await import('../../studio/routes/28_engines.mjs')).default(ctx);
const app = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try { if (!(await handler(req, res, u.pathname, u))) json(res, { error: 'not found' }, 404); }
  catch (e) { if (!res.headersSent) json(res, { error: e.message }, e.status || 500); }
});
await new Promise(ok => app.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${app.address().port}`;
after(() => { for (const s of [fake, app]) { s.closeAllConnections?.(); s.close(); } fs.rmSync(HOME, { recursive: true, force: true }); });
const get = async p => { const r = await fetch(BASE + p); return { status: r.status, text: await r.text() }; };
const post = async (p, b) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, j: await r.json() }; };

test('GET /api/engines và /status không lộ khoá, token hay đường dẫn python', async () => {
  setConf({ pexels: SECRET, openai: SECRET, telegram: { token: SECRET }, llm: { text: 'ollama', ollama: { url: FAKE, model: 'qwen2.5:7b' } },
    tts: { vieneu: { url: FAKE, python: VPY, voice: 'Trúc Ly' }, default_engine: 'vieneu' } });
  const a = await get('/api/engines');
  assert.equal(a.status, 200);
  for (const bad of [SECRET, 'python-secret-path', 'pexels', 'openai', 'telegram']) assert.ok(!a.text.includes(bad), 'lộ ' + bad);
  const j = JSON.parse(a.text);
  assert.equal(j.llm.text, 'ollama'); assert.equal(j.llm.ollama.url, FAKE); assert.equal(j.tts.vieneu.voice, 'Trúc Ly'); assert.equal(j.tts.default_engine, 'vieneu');
  const s = await get('/api/engines/status');
  assert.ok(!s.text.includes(SECRET) && !s.text.includes('python-secret-path'));
  const st = JSON.parse(s.text);
  assert.equal(st.ollama.reachable, true); assert.equal(st.ollama.has_model, true);
  assert.equal(st.vieneu.running, true); assert.deepEqual(st.vieneu.voices.map(v => v.name), ['Hải Đăng', 'Trúc Ly']); assert.equal(st.vieneu.clone, true);
});

test('POST từ chối URL không phải loopback và không ghi gì', async () => {
  setConf({ pexels: SECRET, llm: { text: 'claude' } });
  const before = fs.readFileSync(CONF, 'utf8');
  for (const url of ['http://evil.com:11434', 'http://127.0.0.1.nip.io:11434', 'http://user:pw@127.0.0.1:11434', 'https://127.0.0.1:11434',
    'http://127.0.0.1:11434/x', 'http://10.0.0.5:11434', 'file:///etc/passwd', 'http://localhost@evil.com']) {
    const r = await post('/api/engines/llm', { text: 'ollama', url });
    assert.equal(r.status, 400, url); assert.match(r.j.error, /127\.0\.0\.1/);
    const v = await post('/api/engines/voice', { url, default_engine: 'vieneu' });
    assert.equal(v.status, 400, url);
  }
  assert.equal(fs.readFileSync(CONF, 'utf8'), before);
  assert.equal((await post('/api/engines/llm', { text: 'gpt' })).status, 400);
  assert.equal((await post('/api/engines/llm', { model: 'a b; rm -rf' })).status, 400);
  assert.equal((await post('/api/engines/voice', { default_engine: 'lạ' })).status, 400);
  assert.equal(fs.readFileSync(CONF, 'utf8'), before);
});

test('POST giữ các khoá khác của config.json, quyền 600', async () => {
  setConf({ pexels: SECRET, gemini: SECRET, youtube: { refresh: SECRET }, llm: { ollama: { timeout: 5000 } }, tts: { vieneu: { python: VPY } } });
  const r = await post('/api/engines/llm', { text: 'ollama', fallback: 'claude', url: 'localhost:11434', model: 'llama3.1:8b' });
  assert.equal(r.status, 200); assert.ok(!JSON.stringify(r.j).includes(SECRET));
  const v = await post('/api/engines/voice', { url: FAKE, voice: 'Hải Đăng', default_engine: 'vieneu' });
  assert.equal(v.status, 200);
  const c = conf();
  assert.equal(c.pexels, SECRET); assert.equal(c.gemini, SECRET); assert.equal(c.youtube.refresh, SECRET);
  assert.deepEqual(c.llm, { text: 'ollama', fallback: 'claude', ollama: { timeout: 5000, url: 'http://localhost:11434', model: 'llama3.1:8b' } });
  assert.deepEqual(c.tts, { vieneu: { python: VPY, url: FAKE, voice: 'Hải Đăng' }, default_engine: 'vieneu' });
  if (process.platform !== 'win32') assert.equal(fs.statSync(CONF).mode & 0o777, 0o600);
  assert.ok(!fs.existsSync(CONF + '.tmp'));
});

test('giọng phải là giọng có sẵn hoặc giọng nhái của máy chủ (không nhận tên lạ)', async () => {
  setConf({ tts: { vieneu: { url: FAKE } } });
  const r = await post('/api/engines/voice', { voice: 'Giọng của tôi' });
  assert.equal(r.status, 400); assert.match(r.j.error, /Hải Đăng/);
  assert.equal((await post('/api/engines/voice', { voice: '../../x\n' })).status, 400);
  assert.equal(conf().tts.vieneu.voice, undefined);
});

test('đọc thử khi máy chủ VieNeu không chạy → 409 có lời nhắn', async () => {
  setConf({ tts: { vieneu: { url: DEAD } } });
  const r = await post('/api/engines/voice/preview', { voice: 'Hải Đăng' });
  assert.equal(r.status, 409); assert.match(r.j.error, /chưa chạy/);
  const s = JSON.parse((await get('/api/engines/status')).text);
  assert.equal(s.vieneu.running, false); assert.deepEqual(s.vieneu.voices, []);
});

test('nút Thử: Ollama trả JSON; Ollama tắt → lỗi rõ (kind missing), có fallback thì dùng Claude', async () => {
  setConf({ llm: { text: 'ollama', ollama: { url: FAKE, model: 'qwen2.5:7b' } } });
  let r = await post('/api/engines/llm/try', {});
  assert.equal(r.j.ok, true); assert.equal(r.j.provider, 'ollama'); assert.equal(r.j.result.loi_chao, 'Xin chào');
  setConf({ llm: { text: 'ollama', ollama: { url: DEAD, model: 'qwen2.5:7b' } } });
  r = await post('/api/engines/llm/try', {});
  assert.equal(r.j.ok, false); assert.equal(r.j.kind, 'missing'); assert.match(r.j.error, /Ollama/);
  process.env.FAKE_CLAUDE_REPLIES = JSON.stringify([{ text: '{"ok": true, "loi_chao": "Chào từ Claude"}' }]);
  setConf({ llm: { text: 'ollama', fallback: 'claude', ollama: { url: DEAD, model: 'qwen2.5:7b' } } });
  r = await post('/api/engines/llm/try', {});
  assert.equal(r.j.ok, true); assert.equal(r.j.provider, 'claude'); assert.ok(r.j.fallbackFrom);
});

test('batch: job không ghi tts_engine theo tts.default_engine', async () => {
  const { ttsEngine } = await import('../batch.mjs');
  setConf({ tts: { default_engine: 'vieneu' } });
  assert.equal(ttsEngine({}), 'vieneu');
  assert.equal(ttsEngine({ tts_engine: 'edge' }), 'edge');
  setConf({ tts: { default_engine: 'say' } });
  assert.equal(ttsEngine({}), process.platform === 'darwin' ? 'say' : 'edge');
});

test('topic_video pickVoice: vieneu[:tên] → giọng có sẵn; máy chủ tắt → báo rồi lùi edge-tts', async () => {
  const { pickVoice } = await import('../topic_video.mjs');
  setConf({ tts: { vieneu: { url: FAKE, voice: 'Trúc Ly' } } });
  assert.equal(await pickVoice('Linh'), 'Linh');
  assert.equal(await pickVoice('edge:vi-VN-NamMinhNeural'), 'edge:vi-VN-NamMinhNeural');
  assert.equal(await pickVoice('vieneu'), 'vieneu:Trúc Ly');
  assert.equal(await pickVoice('vieneu:Hải Đăng'), 'vieneu:Hải Đăng');
  await assert.rejects(pickVoice('vieneu:Không Có'), /Giọng có sẵn: Hải Đăng, Trúc Ly/);
  const warns = [];
  setConf({ tts: { vieneu: { url: DEAD } } });
  assert.equal(await pickVoice('vieneu:Hải Đăng', { warn: m => warns.push(m) }), 'edge:vi-VN-HoaiMyNeural');
  assert.match(warns[0], /không chạy.*Lùi về edge-tts/);
});

// WAV PCM 16-bit mono (tiếng ồ 220 Hz) làm file mẫu giọng
function wavBuf(sec, sr = 16000) {
  const n = Math.round(sec * sr), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 220 * i / sr)), 44 + i * 2);
  return b;
}
const upload = async (qs, body) => { const r = await fetch(BASE + '/api/engines/voice/clone?' + new URLSearchParams(qs), { method: 'POST', body }); return { status: r.status, j: await r.json() }; };
const hasFfmpeg = (await import('node:child_process')).spawnSync('ffmpeg', ['-version']).status === 0;
const SPEECH = () => fs.readFileSync(path.join(SKILL, 'sample/clip-mau/work/aroll.mp4'));

test('nhái giọng: mẫu không phải âm thanh / không có tiếng nói → 400 rõ ràng (không phải 502), không gửi tới máy chủ', { skip: !hasFfmpeg && 'cần ffmpeg' }, async () => {
  setConf({ tts: { vieneu: { url: FAKE } } });
  const n = CLONE_BODIES.length;
  let r = await upload({ name: 'Mới', consent: '1', ext: 'mp3' }, Buffer.from('đây không phải âm thanh'));
  assert.equal(r.status, 400); assert.match(r.j.error, /không đọc được/); assert.doesNotMatch(r.j.error, /Error opening|Invalid data/);
  r = await upload({ name: 'Mới', consent: '1', ext: 'wav' }, wavBuf(6)); // tiếng sin đều
  assert.equal(r.status, 400); assert.match(r.j.error, /không giống giọng nói|Không nghe thấy tiếng nói/);
  assert.equal(CLONE_BODIES.length, n);
});

test('nhái giọng: chặn khi thiếu xác nhận, tên lạ, định dạng lạ, máy chủ tắt', async () => {
  setConf({ tts: { vieneu: { url: FAKE } } });
  const w = wavBuf(4), n = CLONE_BODIES.length;
  let r = await upload({ name: 'Giọng Minh', ext: 'wav' }, w);
  assert.equal(r.status, 400); assert.match(r.j.error, /xác nhận/);
  for (const name of ['', '../x', 'a'.repeat(41), 'tên\nxuống dòng']) assert.equal((await upload({ name, consent: '1', ext: 'wav' }, w)).status, 400, name);
  r = await upload({ name: 'A', consent: '1', ext: 'exe' }, w);
  assert.equal(r.status, 400); assert.match(r.j.error, /Định dạng/);
  setConf({ tts: { vieneu: { url: DEAD } } });
  r = await upload({ name: 'A', consent: '1', ext: 'wav' }, w);
  assert.equal(r.status, 409); assert.match(r.j.error, /chưa chạy/);
  assert.equal(CLONE_BODIES.length, n);
  assert.deepEqual(fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('avs-clone-')), [], 'không để lại file tạm');
});

test('nhái giọng: Content-Length > 50 MB → 413 ngay; huỷ giữa chừng → nhả khoá, xoá file tạm', async () => {
  setConf({ tts: { vieneu: { url: FAKE } } });
  const port = new URL(BASE).port, qs = new URLSearchParams({ name: 'A', consent: '1', ext: 'wav' });
  const raw = (len, chunk, keepOpen) => new Promise(ok => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/engines/voice/clone?' + qs, headers: { 'Content-Length': len } },
      res => { let b = ''; res.on('data', d => (b += d)); res.on('end', () => ok({ status: res.statusCode, b })); });
    req.on('error', () => ok({ status: 'reset' }));
    req.write(chunk);
    if (keepOpen) setTimeout(() => { req.destroy(); ok({ status: 'aborted' }); }, 150); else req.end();
  });
  assert.equal((await raw(51 * 1024 * 1024, Buffer.alloc(0))).status, 413);
  assert.equal((await raw(10 * 1024 * 1024, Buffer.alloc(64 * 1024), true)).status, 'aborted'); // gửi 64 KB rồi huỷ
  await new Promise(r => setTimeout(r, 200));
  assert.deepEqual(fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('avs-clone-')), [], 'file tạm của bản huỷ đã xoá');
  setConf({ tts: { vieneu: { url: DEAD } } });
  const r = await upload({ name: 'A', consent: '1', ext: 'wav' }, wavBuf(4));
  assert.equal(r.status, 409); assert.match(r.j.error, /chưa chạy/, 'khoá busy đã nhả (không còn "Đang tạo một giọng nhái khác")');
});

test('nhái giọng: tạo → chọn làm giọng mặc định → xoá', { skip: !hasFfmpeg && 'cần ffmpeg' }, async () => {
  setConf({ pexels: SECRET, tts: { vieneu: { url: FAKE } } });
  try {
    const note = '-Minh, chính tôi', nfd = 'Giọng Minh'.normalize('NFD');
    // giọng nói thật (tiếng sin bị bộ kiểm giọng của tts.py chặn, xem test dưới)
    const rr = await fetch(BASE + '/api/engines/voice/clone?' + new URLSearchParams({ name: nfd, consent: '1', ext: 'mp4' }),
      { method: 'POST', body: SPEECH(), headers: { 'X-AVS-Consent-Note': encodeURIComponent(note) } });
    let r = { status: rr.status, j: await rr.json() };
    assert.equal(r.status, 200, r.j.error); assert.equal(r.j.name, 'Giọng Minh', 'tên NFD được chuẩn hoá NFC');
    const body = CLONE_BODIES.at(-1);
    assert.equal(body.consent, true); assert.equal(body.consent_note, note, 'ghi chú bắt đầu bằng "-" không thành tuỳ chọn');
    assert.equal(Buffer.from(body.audio_b64, 'base64').toString('latin1', 0, 4), 'RIFF');
    // trùng tên (giọng nhái vừa tạo, hoặc một giọng có sẵn) → 409 trước khi nhận file; không gửi gì thêm tới máy chủ
    const n = CLONE_BODIES.length;
    for (const taken of ['Giọng Minh', 'Trúc Ly']) {
      const d = await upload({ name: taken, consent: '1', ext: 'mp4' }, SPEECH());
      assert.equal(d.status, 409, taken); assert.match(d.j.error, /Đã có giọng tên/);
    }
    assert.equal(CLONE_BODIES.length, n);
    assert.deepEqual(r.j.vieneu.voices.filter(v => v.kind === 'clone').map(v => v.name), ['Giọng Minh']);
    // hai lần tạo cùng lúc: chỗ được giữ trước mọi await, nên đúng một lần chạy, lần kia 409 "Đang tạo…"
    const pair = await Promise.all(['Song A', 'Song B'].map(nm => upload({ name: nm, consent: '1', ext: 'mp4' }, SPEECH())));
    assert.deepEqual(pair.map(x => x.status).sort(), [200, 409], JSON.stringify(pair.map(x => x.j)));
    assert.match(pair.find(x => x.status === 409).j.error, /Đang tạo/);
    CLONES.splice(CLONES.findIndex(x => x.startsWith('Song')), 1);
    assert.equal((await post('/api/engines/voice', { voice: 'Giọng Minh' })).status, 200);
    assert.equal(conf().tts.vieneu.voice, 'Giọng Minh');
    assert.equal((await post('/api/engines/voice/rm', { name: 'Trúc Ly' })).status, 404, 'không xoá giọng có sẵn');
    r = await post('/api/engines/voice/rm', { name: 'Giọng Minh' });
    assert.equal(r.status, 200); assert.deepEqual(CLONES, []);
    assert.equal(conf().tts.vieneu.voice, '', 'giọng mặc định bị xoá → về giọng của máy chủ');
    assert.equal(conf().pexels, SECRET);
  } finally { CLONES.length = 0; }
});
