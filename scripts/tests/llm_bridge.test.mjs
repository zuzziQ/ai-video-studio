// Test M61: script Python gọi mô hình chữ qua `node scripts/llm.mjs ask` (scripts/llm_bridge.py), không tự chạy `claude`.
// Không gọi Claude thật: CLAUDE_BIN trỏ vào fixtures/fake_claude.mjs. Chạy: node --test scripts/tests/llm_bridge.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), SCRIPTS = path.join(HERE, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-bridge-'));
const ENV = { ...process.env, AVS_HOME: TMP, CLAUDE_BIN: path.join(HERE, 'fixtures/fake_claude.mjs'), AVS_NODE: process.execPath, PYTHONIOENCODING: 'utf-8' };
delete ENV.CLAUDE_CODE_OAUTH_TOKEN;
const PY = process.platform === 'win32' ? 'python' : 'python3';
const hasPy = spawnSync(PY, ['--version']).status === 0;
let n = 0;
const fake = replies => { const log = path.join(TMP, `log-${++n}.jsonl`); return { env: { ...ENV, FAKE_CLAUDE_REPLIES: JSON.stringify(replies), FAKE_CLAUDE_LOG: log }, seen: () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) }; };
const ask = (env, prompt, ...kv) => spawnSync(process.execPath, [path.join(SCRIPTS, 'llm.mjs'), 'ask', ...kv], { input: prompt, env, encoding: 'utf8' });

test('llm.mjs ask: prompt qua stdin → chữ của mô hình; chạy claude với --setting-sources "" trong thư mục tạm', () => {
  const f = fake([{ text: '["một","hai"]' }]);
  const r = ask(f.env, 'DỊCH GIÚP', 'model=haiku', 'timeout=30');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '["một","hai"]');
  const s = f.seen()[0];
  assert.equal(s.prompt, 'DỊCH GIÚP');
  assert.ok(s.args.includes('--setting-sources') && s.args.includes('haiku'), JSON.stringify(s.args));
  assert.equal(fs.realpathSync(s.cwd), fs.realpathSync(os.tmpdir()), 'không chạy trong thư mục dự án (CLAUDE.md của dự án không lọt vào)');
});

test('llm.mjs ask: chưa đăng nhập → mã 4 kèm câu dễ hiểu; quá giờ → mã 3; prompt rỗng → mã 1', () => {
  let r = ask(fake([{ error: 'Invalid API key · Please run /login', code: 1 }]).env, 'x');
  assert.equal(r.status, 4); assert.match(r.stderr, /chưa đăng nhập/);
  r = ask(fake([{ hang: true }]).env, 'x', 'timeout=5');
  assert.equal(r.status, 3); assert.match(r.stderr, /quá 5 giây/);
  r = ask(ENV, '   ');
  assert.equal(r.status, 1);
});

test('llm_bridge.py: ask() trả chữ; LlmUnavailable khi không có mô hình; không traceback', { skip: !hasPy && 'cần python' }, () => {
  const code = `import sys, json; sys.path.insert(0, ${JSON.stringify(SCRIPTS)})
from llm_bridge import ask, LlmUnavailable, LlmError
try:
    print(json.dumps({"ok": ask("p", model="sonnet", timeout=30)}))
except LlmUnavailable as e:
    print(json.dumps({"unavailable": str(e)}))
except LlmError as e:
    print(json.dumps({"error": str(e)}))`;
  let r = spawnSync(PY, ['-I', '-c', code], { env: fake([{ text: 'xin chào' }]).env, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(r.stdout), { ok: 'xin chào' }, r.stderr);
  r = spawnSync(PY, ['-I', '-c', code], { env: fake([{ error: 'Not logged in · Please run /login', code: 1 }]).env, encoding: 'utf8' });
  assert.match(JSON.parse(r.stdout).unavailable, /chưa đăng nhập/);
  assert.doesNotMatch(r.stderr, /Traceback/);
});

test('không script Python nào tự chạy lệnh claude (mọi lời gọi đi qua llm_bridge.py)', () => {
  const hits = fs.readdirSync(SCRIPTS).filter(f => f.endsWith('.py') && f !== 'llm_bridge.py')
    .filter(f => /subprocess\.\w+\(\s*\[[^\]]*["']claude["']|which\(\s*["']claude["']|CLAUDE_BIN/.test(fs.readFileSync(path.join(SCRIPTS, f), 'utf8')));
  assert.deepEqual(hits, []);
});

test('cleanPlatform (gói đăng): hashtag dạng chuỗi, trường lạ, giờ ảnh bìa ngoài video', async () => {
  const { cleanPlatform } = await import('../publish_texts.mjs');
  const d = cleanPlatform({ title: 'T', caption: 'C', hashtags: '#a #b b2, #a', thumb_time: '99', evil: { x: 1 } }, 30);
  assert.deepEqual(d, { title: 'T', caption: 'C', hashtags: ['#a', '#b', '#b2'], first_comment: '', thumb_time: 30, thumb_text: '' });
  assert.equal(cleanPlatform({ caption: 'x', thumb_time: 'abc' }, 30).thumb_time, null);
  assert.deepEqual(cleanPlatform({ hashtags: ['##x y', 5] }).hashtags, ['#xy', '#5']);
});

test('numCtx (Ollama): cửa sổ ngữ cảnh theo độ dài prompt, 4k–32k', async () => {
  const { numCtx } = await import('../llm.mjs');
  assert.equal(numCtx('ngắn'), 4096);
  assert.ok(numCtx('x'.repeat(30000)) >= 30000 / 2.5);
  assert.equal(numCtx('x'.repeat(500000)), 32768);
});
