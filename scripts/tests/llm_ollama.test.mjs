// Test M26: Ollama làm nhà cung cấp thứ hai trong scripts/llm.mjs. Chạy: node --test scripts/tests/llm_ollama.test.mjs
// Không cần Ollama hay Claude thật: máy chủ HTTP giả trả lời /api/generate, CLAUDE_BIN trỏ vào fixtures/fake_claude.mjs,
// AVS_HOME là thư mục tạm (config.json của test).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-ollama-'));
process.env.AVS_HOME = HOME;
process.env.CLAUDE_BIN = path.join(HERE, 'fixtures/fake_claude.mjs');
for (const k of ['AVS_LLM_TEXT', 'AVS_LLM_FALLBACK', 'OLLAMA_HOST', 'AVS_OLLAMA_MODEL', 'CLAUDE_CODE_OAUTH_TOKEN']) delete process.env[k];
process.env.FAKE_CLAUDE_REPLIES = JSON.stringify([{ text: '{"from":"claude"}' }]);

// fake Ollama: records requests; reply per request decided by `answer`
const reqs = [];
let answer = () => ({ status: 200, body: { model: 'm', response: '{"from":"ollama"}', done: true } });
const server = http.createServer((req, res) => {
  let b = ''; req.on('data', d => (b += d)); req.on('end', () => {
    const j = b ? JSON.parse(b) : null; reqs.push({ url: req.url, body: j });
    const a = answer(j, req);
    if (a.hang) return; // never answers (timeout / cancel tests); the client aborts
    res.writeHead(a.status, { 'Content-Type': 'application/json' }); res.end(typeof a.body === 'string' ? a.body : JSON.stringify(a.body));
  });
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const URL_ = `http://127.0.0.1:${server.address().port}`;
after(() => { server.closeAllConnections?.(); server.close(); });

const llm = await import('../llm.mjs');
const CONF = path.join(HOME, 'config.json');
const setConf = c => fs.writeFileSync(CONF, JSON.stringify(c));
const reset = () => { reqs.length = 0; answer = () => ({ status: 200, body: { response: '{"from":"ollama"}', done: true } }); };

test('mặc định (không có cấu hình) mọi việc vẫn dùng Claude', async () => {
  fs.rmSync(CONF, { force: true }); reset();
  assert.equal(llm.llmConfig().text, 'claude');
  assert.deepEqual(await llm.askJSON('p', { task: 'text', shape: 'object' }), { from: 'claude' });
  assert.equal(reqs.length, 0);
});

test('config.json chọn Ollama: việc chữ đi Ollama, đúng model, JSON mode cho object', async () => {
  setConf({ openai: 'giữ nguyên', llm: { text: 'ollama', ollama: { url: URL_ + '/', model: 'qwen2.5:7b' } } }); reset();
  const v = await llm.askJSON('VIẾT HOOK', { task: 'text', model: 'sonnet', shape: 'object' });
  assert.deepEqual(v, { from: 'ollama' });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].url, '/api/generate');
  // num_ctx: Ollama's small default context would cut long prompts (M61)
  assert.deepEqual(reqs[0].body, { model: 'qwen2.5:7b', prompt: 'VIẾT HOOK', stream: false, options: { num_ctx: 4096 }, format: 'json' });
  answer = () => ({ status: 200, body: { response: 'Đây: [{"i":0}]' } });
  assert.deepEqual(await llm.askJSON('p', { task: 'text', shape: 'array' }), [{ i: 0 }]);
  assert.equal(reqs[1].body.format, undefined); // JSON mode only for objects: it would wrap an array in an object
});

test('việc cần xem ảnh / dùng công cụ, hoặc không đánh dấu text, vẫn đi Claude', async () => {
  setConf({ llm: { text: 'ollama', ollama: { url: URL_ } } }); reset();
  assert.deepEqual(await llm.askJSON('p', { task: 'text', args: ['--allowedTools', 'Read'], shape: 'object' }), { from: 'claude' });
  assert.deepEqual(await llm.askJSON('p', { task: 'vision', shape: 'object' }), { from: 'claude' });
  assert.deepEqual(await llm.askJSON('p', { shape: 'object' }), { from: 'claude' });
  assert.equal(reqs.length, 0);
  assert.equal(llm.pickProvider({ task: 'text', provider: 'claude' }), 'claude');
});

test('biến môi trường thắng file cấu hình', async () => {
  setConf({ llm: { text: 'claude', ollama: { url: 'http://127.0.0.1:1', model: 'a' } } }); reset();
  process.env.AVS_LLM_TEXT = 'ollama'; process.env.OLLAMA_HOST = URL_.replace('http://', ''); process.env.AVS_OLLAMA_MODEL = 'llama3.2';
  try {
    const c = llm.llmConfig();
    assert.deepEqual([c.text, c.ollama.url, c.ollama.model], ['ollama', URL_, 'llama3.2']);
    await llm.askJSON('p', { task: 'text' });
    assert.equal(reqs[0].body.model, 'llama3.2');
  } finally { for (const k of ['AVS_LLM_TEXT', 'OLLAMA_HOST', 'AVS_OLLAMA_MODEL']) delete process.env[k]; }
});

test('JSON hỏng từ Ollama thì hỏi lại; tên lỗi ghi Ollama', async () => {
  setConf({ llm: { text: 'ollama', ollama: { url: URL_ } } }); reset();
  let n = 0; answer = () => ({ status: 200, body: { response: n++ ? '{"ok":1}' : 'tôi nghĩ là...' } });
  assert.deepEqual(await llm.askJSON('p', { task: 'text', shape: 'object', retries: 1 }), { ok: 1 });
  assert.match(reqs[1].body.prompt, /Lần trước bạn trả lời không phải JSON hợp lệ/);
  reset(); answer = () => ({ status: 200, body: { response: 'không' } });
  await assert.rejects(llm.askJSON('p', { task: 'text' }), e => /^Ollama không trả về JSON hợp lệ/.test(e.message));
});

test('Ollama chưa có model / lỗi HTTP / trả lời lạ', async () => {
  setConf({ llm: { text: 'ollama', ollama: { url: URL_, model: 'x:1b' } } }); reset();
  answer = () => ({ status: 404, body: { error: "model 'x:1b' not found, try pulling it first" } });
  await assert.rejects(llm.runLLM('p', { task: 'text' }), e => e.kind === 'model' && e.message === 'Ollama chưa có model "x:1b". Chạy: ollama pull x:1b');
  answer = () => ({ status: 500, body: { error: 'out of memory' } });
  await assert.rejects(llm.runLLM('p', { task: 'text' }), e => e.kind === 'exit' && /HTTP 500\): out of memory/.test(e.message));
  answer = () => ({ status: 200, body: 'not json' });
  await assert.rejects(llm.runLLM('p', { task: 'text' }), e => /không đọc được/.test(e.message));
});

test('không kết nối được Ollama: báo rõ; có fallback=claude thì chạy Claude', async () => {
  setConf({ llm: { text: 'ollama', ollama: { url: 'http://127.0.0.1:1' } } }); reset();
  await assert.rejects(llm.runLLM('p', { task: 'text' }), e => e.kind === 'missing' && /Không kết nối được Ollama ở http:\/\/127\.0\.0\.1:1/.test(e.message));
  setConf({ llm: { text: 'ollama', fallback: 'claude', ollama: { url: 'http://127.0.0.1:1' } } });
  const r = await llm.runLLM('p', { task: 'text' });
  assert.equal(r.provider, 'claude'); assert.match(r.fallbackFrom, /Không kết nối được Ollama/);
  // fallback is only for "can't run at all", not for a bad answer
  setConf({ llm: { text: 'ollama', fallback: 'claude', ollama: { url: URL_ } } }); answer = () => ({ status: 500, body: { error: 'boom' } });
  await assert.rejects(llm.runLLM('p', { task: 'text' }), e => e.kind === 'exit');
});

test('quá thời gian và huỷ job (onProc → killTree) đều dừng yêu cầu', async () => {
  setConf({ llm: { text: 'ollama', ollama: { url: URL_ } } }); reset(); answer = () => ({ hang: true });
  let ticks = 0;
  await assert.rejects(llm.runLLM('p', { task: 'text', timeout: 500, timeoutMsg: 'quá giờ', tickMs: 100, onTick: () => ticks++ }), e => e.kind === 'timeout' && e.message === 'quá giờ');
  assert.ok(ticks >= 2);
  const { killTree } = await import('../platform.mjs');
  let h; const p = llm.runLLM('p', { task: 'text', onProc: x => { h = x; } });
  await new Promise(ok => setTimeout(ok, 200));
  await killTree(h);
  await assert.rejects(p, e => e.kind === 'cancel');
});

test('saveLlmConfig giữ khoá khác trong config.json; CLI set/status', async () => {
  setConf({ openai: 'sk-test', llm: { ollama: { timeout: 1000 } } });
  const c = llm.saveLlmConfig({ text: 'ollama', ollama: { url: URL_, model: 'qwen2.5:3b', timeout: undefined } });
  assert.equal(c.text, 'ollama'); assert.equal(c.ollama.timeout, 1000);
  const f = JSON.parse(fs.readFileSync(CONF, 'utf8'));
  assert.equal(f.openai, 'sk-test'); assert.deepEqual(f.llm, { text: 'ollama', ollama: { timeout: 1000, url: URL_, model: 'qwen2.5:3b' } });
  assert.throws(() => llm.saveLlmConfig({ text: 'gpt' }), /Nhà cung cấp phải là/);
  const env = { ...process.env, AVS_HOME: HOME };
  const set = spawnSync(process.execPath, [path.join(HERE, '../llm.mjs'), 'set', 'text=claude', 'fallback=claude'], { env, encoding: 'utf8' });
  assert.equal(set.status, 0, set.stderr);
  assert.deepEqual([JSON.parse(set.stdout).text, JSON.parse(set.stdout).fallback], ['claude', 'claude']);
});

test('CLI status hỏi /api/tags', async () => {
  setConf({ llm: { text: 'ollama', ollama: { url: URL_, model: 'qwen2.5:7b' } } }); reset();
  answer = () => ({ status: 200, body: { models: [{ name: 'qwen2.5:7b' }, { name: 'llama3.2:latest' }] } });
  // async spawn, not spawnSync: the fake server lives in this process and must keep answering
  const r = await new Promise(ok => {
    const p = spawn(process.execPath, [path.join(HERE, '../llm.mjs'), 'status'], { env: { ...process.env, AVS_HOME: HOME } });
    let o = ''; p.stdout.on('data', d => (o += d)); p.on('close', c => ok({ c, o }));
  });
  assert.equal(r.c, 0);
  const j = JSON.parse(r.o);
  assert.equal(j.ollama_reachable, true); assert.equal(j.has_model, true); assert.deepEqual(j.ollama_models, ['qwen2.5:7b', 'llama3.2:latest']);
  assert.equal(reqs.at(-1).url, '/api/tags');
});
