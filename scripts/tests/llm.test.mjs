// Test M25: lớp gọi LLM dùng chung scripts/llm.mjs. Chạy: node --test scripts/tests/llm.test.mjs
// Không gọi Claude thật: CLAUDE_BIN trỏ vào fixtures/fake_claude.mjs (platform.mjs chạy file .mjs bằng Node).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-llm-'));
process.env.AVS_HOME = TMP; // no real claude-token is read
process.env.CLAUDE_BIN = path.join(HERE, 'fixtures/fake_claude.mjs');
delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
const { runClaude, askJSON, parseLooseJSON, LlmError } = await import('../llm.mjs');

let logN = 0;
// Script the fake CLI's answers; returns a reader for what it received.
function fake(replies) {
  const log = path.join(TMP, `log-${++logN}.jsonl`);
  process.env.FAKE_CLAUDE_REPLIES = JSON.stringify(replies);
  process.env.FAKE_CLAUDE_LOG = log;
  return () => { try { return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };
}

test('parseLooseJSON: fences, lời dẫn, dấu phẩy thừa, ngoặc kép cong, xuống dòng thô', () => {
  assert.deepEqual(parseLooseJSON('Đây là kết quả:\n```json\n{"a": [1, 2,],}\n```\nHết.'), { a: [1, 2] });
  assert.deepEqual(parseLooseJSON('{“a”: “b”}'), { a: 'b' });
  assert.deepEqual(parseLooseJSON('{"a": "dòng 1\ndòng 2"}'), { a: 'dòng 1 dòng 2' });
  assert.deepEqual(parseLooseJSON('ok [ {"i":0}, {"i":3} ] xong', { shape: 'array' }), [{ i: 0 }, { i: 3 }]);
  assert.deepEqual(parseLooseJSON('[1] và {"x":1}', { shape: 'object' }), { x: 1 });
  assert.deepEqual(parseLooseJSON('[{"x":1}]'), [{ x: 1 }]);
  assert.throws(() => parseLooseJSON('không có gì'), e => e instanceof LlmError && e.kind === 'parse');
  assert.throws(() => parseLooseJSON('{"a": }'), e => e.kind === 'parse' && /JSON lỗi/.test(e.message));
});

test('runClaude: prompt qua stdin, đúng tham số, trả result', async () => {
  const seen = fake([{ text: 'xin chào' }]);
  const r = await runClaude('PROMPT DÀI', { model: 'opus', args: ['--allowedTools', 'Read'], cwd: TMP });
  assert.equal(r.text, 'xin chào'); assert.equal(r.code, 0); assert.equal(r.result.session_id, 'fake-session');
  const [c] = seen();
  assert.equal(c.prompt, 'PROMPT DÀI');
  assert.deepEqual(c.args, ['-p', '--output-format', 'json', '--model', 'opus', '--allowedTools', 'Read', '--setting-sources', '']);
  assert.equal(fs.realpathSync(c.cwd), fs.realpathSync(TMP));
});

test('runClaude: model "default" không truyền --model', async () => {
  const seen = fake([{ text: 'x' }]);
  await runClaude('p', { model: 'default' });
  assert.ok(!seen()[0].args.includes('--model'));
});

test('runClaude: lỗi đăng nhập, hết lượt, is_error, mã thoát khác 0', async () => {
  fake([{ error: 'Invalid API key · Please run /login' }]);
  await assert.rejects(runClaude('p'), e => e.kind === 'login' && /chưa đăng nhập/.test(e.message));
  fake([{ stderr: 'Claude usage limit reached', code: 1 }]);
  await assert.rejects(runClaude('p'), e => e.kind === 'quota' && /hết lượt/.test(e.message));
  fake([{ error: 'model overloaded', code: 0 }]);
  await assert.rejects(runClaude('p'), e => e.kind === 'model' && e.message === 'Claude báo lỗi: model overloaded');
  fake([{ stderr: 'boom', code: 3 }]);
  await assert.rejects(runClaude('p'), e => e.kind === 'exit' && e.code === 3 && /mã 3\): boom/.test(e.message));
});

test('runClaude: mã 0 nhưng không phải JSON thì trả nguyên văn', async () => {
  fake([{ raw: 'chữ thường' }]);
  assert.equal((await runClaude('p')).text, 'chữ thường');
});

test('runClaude: quá thời gian thì dừng tiến trình và báo lỗi timeout', async () => {
  fake([{ hang: true }]);
  let proc; const t0 = Date.now();
  await assert.rejects(runClaude('p', { timeout: 800, timeoutMsg: 'quá giờ', onProc: p => { proc = p; } }), e => e.kind === 'timeout' && e.message === 'quá giờ');
  assert.ok(Date.now() - t0 < 10000);
  assert.ok(proc.exitCode !== null || proc.signalCode !== null);
});

test('runClaude: onTick được gọi trong lúc chờ', async () => {
  fake([{ hang: true }]);
  let ticks = 0;
  await assert.rejects(runClaude('p', { timeout: 700, tickMs: 100, onTick: s => { assert.equal(typeof s, 'number'); ticks++; } }));
  assert.ok(ticks >= 2, `ticks=${ticks}`);
});

test('runClaude: stream-json gửi từng event và lấy event result', async () => {
  const seen = fake([{ stream: [{ type: 'system', subtype: 'init', model: 'claude-x' }, { type: 'assistant', message: { content: [{ type: 'tool_use', input: { file_path: '/a/b.png' } }] } }, { type: 'result', is_error: false, result: 'XONG', session_id: 's1' }] }]);
  const evs = [];
  const r = await runClaude('p', { stream: true, onEvent: e => evs.push(e.type) });
  assert.equal(r.text, 'XONG'); assert.equal(r.result.session_id, 's1');
  assert.deepEqual(evs, ['system', 'assistant', 'result']);
  assert.deepEqual(seen()[0].args.slice(0, 5), ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages']);
  fake([{ stream: [{ type: 'system', subtype: 'init' }] }]);
  await assert.rejects(runClaude('p', { stream: true }), e => /không có kết quả/.test(e.message));
});

test('askJSON: parse lỏng theo shape', async () => {
  fake([{ text: 'Đây:\n```json\n[{"i":0,"kind":"stock",},]\n```' }]);
  assert.deepEqual(await askJSON('p', { shape: 'array' }), [{ i: 0, kind: 'stock' }]);
});

test('askJSON: JSON hỏng thì hỏi lại kèm lý do, lần sau đúng thì trả', async () => {
  const seen = fake([{ text: 'xin lỗi, tôi không làm được' }, { text: '{"hook":"Mở đầu"}' }]);
  const attempts = [], raws = [];
  const v = await askJSON('GỐC', { shape: 'object', retries: 1, onAttempt: a => attempts.push(a), onRaw: (t, a) => raws.push([a, t]) });
  assert.deepEqual(v, { hook: 'Mở đầu' });
  assert.deepEqual(attempts, [0, 1]);
  assert.equal(raws.length, 2);
  const calls = seen();
  assert.equal(calls[0].prompt, 'GỐC');
  assert.match(calls[1].prompt, /^GỐC\n\nLần trước bạn trả lời không phải JSON hợp lệ \(không có JSON\)\. Chỉ trả về JSON\.$/);
});

test('askJSON: validate từ chối thì hỏi lại; hết lượt thì báo lỗi', async () => {
  const seen = fake([{ text: '{"beats":[]}' }, { text: '{"beats":[1]}' }]);
  const validate = v => { if (!v.beats.length) throw new Error('thiếu beats'); return v.beats; };
  assert.deepEqual(await askJSON('p', { validate, retries: 1, retryHint: m => ` [sửa: ${m}]` }), [1]);
  assert.equal(seen()[1].prompt, 'p [sửa: thiếu beats]');
  fake([{ text: 'không' }]);
  await assert.rejects(askJSON('p', { retries: 2 }), e => e.kind === 'parse' && /^Claude không trả về JSON hợp lệ: không có JSON/.test(e.message));
});

test('askJSON: lỗi CLI không thử lại', async () => {
  const seen = fake([{ error: 'Please run /login' }]);
  await assert.rejects(askJSON('p', { retries: 3 }), e => e.kind === 'login');
  assert.equal(seen().length, 1);
});

test('askJSON: run tuỳ chọn (nhà cung cấp khác)', async () => {
  const v = await askJSON('p', { run: async (prompt, o) => ({ text: `{"p":"${prompt}","m":"${o.model}"}` }), model: 'm1' });
  assert.deepEqual(v, { p: 'p', m: 'm1' });
});

test('không còn chỗ nào gọi spawnClaude ngoài llm.mjs (trừ ai_qc.mjs, chuyển sau)', () => {
  const dir = path.join(HERE, '..');
  const hits = fs.readdirSync(dir).filter(f => f.endsWith('.mjs') && !['llm.mjs', 'platform.mjs', 'ai_qc.mjs'].includes(f))
    .filter(f => /\bspawnClaude\s*\(/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.deepEqual(hits, []);
});
