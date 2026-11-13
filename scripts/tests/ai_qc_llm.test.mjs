// M25 (phần còn lại): ai_qc.askClaude / parseJson đi qua scripts/llm.mjs mà không đổi hành vi.
// Không gọi Claude thật: CLAUDE_BIN trỏ vào fixtures/fake_claude.mjs. Chạy: node --test scripts/tests/ai_qc_llm.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-qc-llm-'));
process.env.AVS_HOME = TMP;
process.env.CLAUDE_BIN = path.join(HERE, 'fixtures/fake_claude.mjs');
for (const k of ['CLAUDE_CODE_OAUTH_TOKEN', 'AVS_LLM_TEXT', 'AVS_LLM_FALLBACK']) delete process.env[k];
const { askClaude, parseJson } = await import('../ai_qc.mjs');
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

let n = 0;
function fake(replies) {
  const log = path.join(TMP, `log-${++n}.jsonl`);
  process.env.FAKE_CLAUDE_REPLIES = JSON.stringify(replies);
  process.env.FAKE_CLAUDE_LOG = log;
  return () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

test('askClaude (QC xem ảnh): --allowedTools Read, --add-dir thư mục ảnh, chạy trong thư mục đó, prompt qua stdin', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'review-'));
  const seen = fake([{ text: '{"issues": []}' }]);
  assert.equal(await askClaude('XEM ẢNH', { model: 'sonnet', cwd: dir, tools: ['Read'] }), '{"issues": []}');
  const [c] = seen();
  assert.deepEqual(c.args.slice(0, 5), ['-p', '--output-format', 'json', '--model', 'sonnet']);
  assert.ok(c.args.includes('--allowedTools') && c.args[c.args.indexOf('--allowedTools') + 1] === 'Read');
  assert.equal(path.resolve(c.args[c.args.indexOf('--add-dir') + 1]), path.resolve(dir));
  assert.equal(fs.realpathSync(c.cwd), fs.realpathSync(dir));
  assert.equal(c.prompt, 'XEM ẢNH');
});

test('askClaude (hook của variants, không công cụ): không --allowedTools, không --add-dir, chạy trong thư mục tạm', async () => {
  const seen = fake([{ text: 'ok' }]);
  assert.equal(await askClaude('VIẾT HOOK'), 'ok');
  const [c] = seen();
  assert.ok(!c.args.includes('--allowedTools') && !c.args.includes('--add-dir'));
  assert.equal(fs.realpathSync(c.cwd), fs.realpathSync(os.tmpdir()));
});

test('askClaude: lỗi đăng nhập và quá giờ ra câu tiếng Việt như trước', async () => {
  fake([{ error: 'Invalid API key · Please run /login' }]);
  await assert.rejects(askClaude('p'), /chưa đăng nhập/);
  fake([{ hang: true }]);
  await assert.rejects(askClaude('p', { timeout: 600 }), /quá 1 giây — bỏ qua phần nhận xét AI/);
});

test('parseJson: lời dẫn, ``` , dấu phẩy thừa, ngoặc kép cong; không có JSON thì ném lỗi', () => {
  assert.deepEqual(parseJson('Nhận xét:\n```json\n{"issues": [{"t": 1,}],}\n```'), { issues: [{ t: 1 }] });
  assert.deepEqual(parseJson('{“summary”: “tốt”}'), { summary: 'tốt' });
  assert.throws(() => parseJson('không có gì'));
});
