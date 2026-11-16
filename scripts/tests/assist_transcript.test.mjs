// Test M90: trợ lý Soát lời thoại (scripts/assist.mjs, khối `transcript`) + ô job riêng của studio/routes/05_assist.mjs.
// Chạy: node --test scripts/tests/assist_transcript.test.mjs
// Không gọi Claude thật: CLAUDE_BIN trỏ vào fixtures/fake_claude.mjs.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-assist-tx-'));
process.env.AVS_HOME = TMP;
process.env.CLAUDE_BIN = path.join(HERE, 'fixtures/fake_claude.mjs');
delete process.env.AVS_LLM_TEXT;
const A = await import('../assist.mjs');
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

let logN = 0;
function fake(replies) {
  const log = path.join(TMP, `log-${++logN}.jsonl`);
  process.env.FAKE_CLAUDE_REPLIES = JSON.stringify(replies.map(r => (typeof r === 'string' ? { text: r } : r)));
  process.env.FAKE_CLAUDE_LOG = log;
  return () => { try { return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };
}
const J = o => JSON.stringify(o);
// "đây là thuyết tiền hóa của ly chi" (8 từ, 0,4 s mỗi từ)
const words = text => text.split(' ').map((w, i) => ({ w, s: i * 0.4, e: i * 0.4 + 0.35 }));
const BASE = { words: words('đây là thuyết tiền hóa của ly chi'), dict: [{ from: 'tiền hóa', to: 'tiến hoá' }], names: ['Lychee'], industry: 'mỹ phẩm' };

test('check: dữ liệu sai → 400; giữ từ điển sạch', () => {
  const st400 = e => e instanceof A.AssistError && e.status === 400;
  assert.throws(() => A.check('transcript', {}), st400);
  assert.throws(() => A.check('transcript', { words: [] }), st400);
  assert.throws(() => A.check('transcript', { words: [{ w: 'a b', s: 0, e: 1 }] }), st400);
  assert.throws(() => A.check('transcript', { words: [{ w: 'a', s: 2, e: 1 }] }), st400);
  const ok = A.check('transcript', { ...BASE, dict: [...BASE.dict, { from: 'x=y', to: 'z' }, 'rác'] });
  assert.deepEqual(ok.dict, [{ from: 'tiền hóa', to: 'tiến hoá' }]);
  assert.equal(ok.words.length, 8);
});

test('txWindows: chia đúng chỉ số, phủ kín, không chồng; ≤ 400 từ và ≤ 90 s', () => {
  const ws = Array.from({ length: 1500 }, (_, i) => ({ w: i % 50 === 49 ? 'xong.' : 'từ', s: i * 0.2, e: i * 0.2 + 0.18 }));
  const win = A.txWindows(ws);
  assert.equal(win[0].a, 0); assert.equal(win[win.length - 1].b, 1499);
  for (let k = 1; k < win.length; k++) assert.equal(win[k].a, win[k - 1].b + 1);
  for (const w of win) { assert.ok(w.b - w.a + 1 <= 400); assert.ok(ws[w.b].e - ws[w.a].s <= 90.5); }
  // qua 60 s thì cắt ở cuối câu: 0,2 s/từ → câu kết ở từ 299 (59,98 s) chưa đủ, từ 349 (69,98 s) là chỗ cắt đầu
  assert.equal(win[0].b, 349);
  // chậm (1 s/từ): cắt theo giờ trước khi đủ 400 từ
  const slow = Array.from({ length: 200 }, (_, i) => ({ w: 'a', s: i, e: i + 0.9 }));
  assert.ok(A.txWindows(slow)[0].b < 100);
});

test('txCheckEdit: old lệch → bỏ; viết lại câu → bỏ; đổi hoa thường chỉ cho tên riêng', () => {
  const ws = BASE.words, win = { a: 0, b: 7 }, terms = ['Lychee', 'tiến hoá'];
  const chk = it => A.txCheckEdit(it, ws, win, terms);
  assert.equal(chk({ start: 3, end: 4, old: 'tiền hóa', new: 'tiến hoá', kind: 'nhận dạng' }).ok, true);
  assert.equal(chk({ start: 2, end: 3, old: 'tiền hóa', new: 'tiến hoá' }).why, 'mismatch'); // lệch một từ
  assert.equal(chk({ start: 3, end: 4, old: 'tiến hoá', new: 'tiến hoá' }).why, 'mismatch'); // chép sai chữ cũ
  assert.equal(chk({ start: 0, end: 5, old: 'đây là thuyết tiền hóa của', new: 'đó chính là lý thuyết về sự phát triển của' }).why, 'rewrite');
  assert.equal(chk({ start: 0, end: 1, old: 'đây là', new: 'chúng ta có' }).why, 'rewrite');
  assert.equal(chk({ start: 6, end: 7, old: 'ly chi', new: 'Lychee', kind: 'tên riêng' }).ok, true); // tên đã biết
  assert.equal(chk({ start: 5, end: 5, old: 'của', new: 'Của' }).why, 'noop');
  assert.equal(chk({ start: 0, end: 7, old: BASE.words.map(w => w.w).join(' '), new: 'x' }).why, 'bad'); // > 6 từ
  assert.equal(chk({ start: 7, end: 8, old: 'chi', new: 'chí' }).why, 'bad'); // ra ngoài cửa sổ
  const p = chk({ start: 7, end: 7, old: 'chi', new: 'chi.', kind: 'chính tả' });
  assert.equal(p.ok, true); assert.equal(p.edit.kind, 'dấu câu');
});

test('runAssist transcript: gọi theo từng cửa sổ, gộp, bỏ đề xuất xấu; prompt có chỉ số và từ điển', async () => {
  const ws = Array.from({ length: 700 }, (_, i) => ({ w: i === 3 ? 'tiền' : i === 4 ? 'hóa' : i === 450 ? 'ly' : i === 451 ? 'chi' : 'nói', s: i * 0.3, e: i * 0.3 + 0.28 }));
  const input = A.check('transcript', { ...BASE, words: ws });
  const n = A.txWindows(input.words).length;
  assert.ok(n >= 2);
  const second = A.txWindows(input.words)[1];
  assert.ok(second.a <= 450 && second.b >= 451);
  const seen = fake([
    J({ edits: [{ start: 3, end: 4, old: 'tiền hóa', new: 'tiến hoá', kind: 'nhận dạng', reason: 'nghe nhầm' }, { start: 5, end: 5, old: 'sai', new: 'đúng' }, { start: 0, end: 2, old: 'nói nói nói', new: 'hôm nay chúng ta sẽ cùng tìm hiểu' }] }),
    J({ edits: [{ start: 450, end: 451, old: 'ly chi', new: 'Lychee', kind: 'tên riêng', reason: 'tên thương hiệu' }, { start: 450, end: 451, old: 'ly chi', new: 'Lychee' }] }),
    J({ edits: [] }),
  ]);
  const prog = [];
  const r = await A.runAssist('transcript', input, { onProgress: (p, s) => prog.push([p, s]) });
  const calls = seen();
  assert.equal(calls.length, n, 'một lần gọi mỗi cửa sổ');
  assert.match(calls[0].prompt, /3:tiền 4:hóa/);
  assert.match(calls[0].prompt, /tiền hóa = tiến hoá/);
  assert.match(calls[1].prompt, new RegExp(`Lời thoại đoạn 2/${n}`));
  assert.deepEqual(r.suggestions.map(s => [s.start, s.end, s.new, s.kind]), [[3, 4, 'tiến hoá', 'nhận dạng'], [450, 451, 'Lychee', 'tên riêng']]);
  assert.equal(r.dropped.mismatch, 1); assert.equal(r.dropped.rewrite, 1); assert.equal(r.dropped.dup, 1);
  assert.equal(r.counts['tên riêng'], 1); assert.equal(r.provider, 'claude'); assert.equal(r.windows, n);
  assert.ok(prog.some(([, s]) => s.startsWith(`Đoạn 2/${n}`)));
  assert.ok(r.suggestions.every(s => s.id));
});

test('JSON hỏng → hỏi lại một lần rồi lùi về đề xuất theo từ điển', async () => {
  const seen = fake(['không phải json', '{"edits": "cũng sai"}']);
  const r = await A.runAssist('transcript', A.check('transcript', BASE));
  assert.equal(seen().length, 2);
  assert.equal(r.provider, 'rules');
  assert.deepEqual(r.suggestions.map(s => [s.old, s.new, s.kind]), [['tiền hóa', 'tiến hoá', 'chính tả']]);
  // tên thương hiệu viết thường → đề xuất viết hoa (tên riêng)
  fake(['vẫn hỏng']);
  const r2 = await A.runAssist('transcript', A.check('transcript', { ...BASE, words: words('dùng lychee mỗi ngày') }));
  assert.deepEqual(r2.suggestions.map(s => [s.old, s.new, s.kind]), [['lychee', 'Lychee', 'tên riêng']]);
  assert.match(r.warnings.join(' '), /từ điển/);
});

test('uncertain (M96): chỗ AI nghi nhưng không chắc sửa — kiểm chặt vị trí, không chồng đề xuất, thiếu thì rỗng', async () => {
  const ws = words('thời gian 15 đến 3 phút là có thuyết tiền hóa');
  const input = A.check('transcript', { ...BASE, words: ws });
  const seen = fake([J({
    edits: [{ start: 9, end: 10, old: 'tiền hóa', new: 'tiến hoá', kind: 'nhận dạng', reason: 'nghe nhầm' }],
    uncertain: [
      { start: 2, end: 4, old: '15 đến 3', reason: 'khoảng số lạ' },
      { start: 4, end: 4, old: '3', reason: 'chồng chỗ nghi trước' },
      { start: 10, end: 10, old: 'hóa', reason: 'chồng đề xuất sửa' },
      { start: 5, end: 5, old: 'giây', reason: 'chép sai chữ' },
      { start: 0, end: 7, old: 'thời gian 15 đến 3 phút là có', reason: 'quá 6 từ' },
      'rác',
    ],
  })]);
  const r = await A.runAssist('transcript', input);
  assert.match(seen()[0].prompt, /"uncertain"/);
  assert.deepEqual(r.uncertain, [{ start: 2, end: 4, old: '15 đến 3', reason: 'khoảng số lạ' }]);
  assert.equal(r.dropped.unsure, 3, 'sai chữ, quá dài, không phải object');
  assert.equal(r.suggestions.length, 1);
  // CLI cũ chỉ trả edits, hoặc trả mảng: uncertain rỗng, đề xuất vẫn chạy
  fake([J({ edits: [] })]);
  assert.deepEqual((await A.runAssist('transcript', input)).uncertain, []);
  fake([J([{ start: 9, end: 10, old: 'tiền hóa', new: 'tiến hoá' }])]);
  const arr = await A.runAssist('transcript', input);
  assert.deepEqual(arr.uncertain, []); assert.equal(arr.suggestions.length, 1);
  // AI hỏng → theo từ điển, không có chỗ nghi
  fake(['hỏng', 'hỏng']);
  assert.deepEqual((await A.runAssist('transcript', input)).uncertain, []);
  assert.equal(A.txCheckSpot({ start: 2, end: 2, old: '15' }, ws, { a: 3, b: 9 }).why, 'bad', 'ngoài cửa sổ');
});

test('thiếu claude → báo nguyên văn, không lùi về im lặng', async () => {
  const { LlmError, MSG } = await import('../llm.mjs');
  const run = async () => { throw new LlmError(MSG.missing, { kind: 'missing' }); };
  await assert.rejects(A.runAssist('transcript', A.check('transcript', BASE), { run }), e => e.kind === 'missing' && e.message === MSG.missing);
});

// ---------------------------------------------------------------- route: ô job riêng
test('route: trợ lý chạy được khi đang xuất video; một trợ lý một lúc; huỷ chỉ dừng trợ lý', async () => {
  let job = { kind: 'export', state: 'running' }; // đang xuất video
  const ctx = { SKILL, PY: undefined, json: (res, o, c = 200) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); },
    body: req => new Promise(ok => { let s = ''; req.on('data', d => (s += d)); req.on('end', () => ok(s ? JSON.parse(s) : {})); }),
    get job() { return job; }, startJob() { throw new Error('trợ lý không được dùng ctx.startJob'); } };
  const handler = (await import('../../studio/routes/05_assist.mjs')).default(ctx);
  const app = http.createServer(async (req, res) => { const u = new URL(req.url, 'http://x'); if (!(await handler(req, res, u.pathname, u))) { res.writeHead(404); res.end('{}'); } });
  await new Promise(ok => app.listen(0, '127.0.0.1', ok));
  const B = `http://127.0.0.1:${app.address().port}`;
  const call = async (p, b) => { const r = await fetch(B + p, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, j: await r.json() }; };
  const wait = async name => { let s; for (let i = 0; i < 100 && (s = (await call('/api/assist/' + name)).j).state === 'running'; i++) await new Promise(ok => setTimeout(ok, 100)); return s; };
  try {
    assert.ok((await call('/api/assist')).j.some(x => x.name === 'transcript'));
    assert.equal((await call('/api/assist/transcript', { words: [] })).status, 400);
    fake([{ hang: true }]);
    const a = await call('/api/assist/transcript', BASE);
    assert.equal(a.status, 200, 'đang xuất video vẫn chạy được trợ lý');
    assert.equal((await call('/api/assist/brand', { name: 'X' })).status, 409, 'một trợ lý một lúc');
    assert.equal(job.state, 'running'); assert.equal(job.kind, 'export');
    await new Promise(ok => setTimeout(ok, 400)); // để tiến trình giả kịp chạy
    assert.equal((await call('/api/assist/cancel', {})).j.cancelled, true);
    const s = await wait('transcript');
    assert.equal(s.state, 'cancelled'); assert.equal(s.run, a.j.run);
    assert.equal(job.state, 'running', 'huỷ trợ lý không đụng job xuất video');
    fake([J({ edits: [{ start: 3, end: 4, old: 'tiền hóa', new: 'tiến hoá', kind: 'nhận dạng' }] })]);
    const b = await call('/api/assist/transcript', BASE);
    assert.equal(b.status, 200, 'huỷ xong thì ô trống lại');
    const d = await wait('transcript');
    assert.equal(d.state, 'done'); assert.equal(d.run, b.j.run); assert.equal(d.suggestions.length, 1);
    assert.equal((await call('/api/assist/cancel', {})).j.cancelled, false);
  } finally { app.closeAllConnections?.(); app.close(); }
});
