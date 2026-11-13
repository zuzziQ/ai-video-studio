// Test M34 (một tên trạng thái lỗi), M35 (huỷ job dừng cả cây tiến trình, dọn .render_*), M36 (giới hạn thử mã ghép nối,
// đường dẫn video chỉ trong thư mục đã khai). Chạy: node --test scripts/tests/
// Không gọi Telegram thật: AVS_TG_API trỏ vào máy chủ giả trong test; AVS_NOW là đồng hồ giả; AVS_HOME là thư mục tạm.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-test-'));
process.env.AVS_HOME = HOME;
process.env.AVS_NO_LAUNCHCTL = '1';
delete process.env.AVS_NOW;

// fake Bot API: records every call, answers ok
const calls = [];
const server = http.createServer((req, res) => {
  let b = ''; req.on('data', d => (b += d)); req.on('end', () => {
    const method = req.url.split('/').pop();
    let body = {}; try { body = JSON.parse(b); } catch { /* multipart */ }
    calls.push({ method, body });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, result: method === 'getMe' ? { username: 'test_bot' } : true }));
  });
});
let Q, T, F, P;
before(async () => {
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  process.env.AVS_TG_API = `http://127.0.0.1:${server.address().port}`;
  Q = await import('../queue.mjs');
  T = await import('../telegram.mjs');
  F = await import('../feedback.mjs');
  P = await import('../platform.mjs');
  T.saveCfg({ token: 'TEST', on: true });
});
after(() => { server.close(); fs.rmSync(HOME, { recursive: true, force: true }); });

const QFILE = () => path.join(HOME, 'queue.json');
const writeQueue = items => fs.writeFileSync(QFILE(), JSON.stringify({ version: 1, items }));
const item = (id, state, extra = {}) => ({ id, kind: 'topic', input: 'x', title: 'Việc ' + id, state, opts: { telegram: { chat: 42 } }, outputs: [], error: state === 'done' ? null : 'hỏng ' + id, finished: '2026-11-01T00:00:00.000Z', ...extra });
const sent = () => calls.filter(c => c.method === 'sendMessage').map(c => c.body);
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------- M34 ----------------
test('M34: hàng đợi chỉ có một tên trạng thái lỗi; queue.json cũ ghi "failed" được đọc thành "error"', () => {
  assert.equal(Q.FAILED, 'error');
  writeQueue([item('a1', 'failed'), item('a2', 'error'), item('a3', 'done')]);
  const items = Q.loadQueue().items;
  assert.deepEqual(items.map(i => i.state), ['error', 'error', 'done']);
  assert.deepEqual(items.map(Q.isFailed), [true, true, false]);
  Q.mutate(() => {}); // lần ghi kế tiếp chuẩn hoá luôn file trên đĩa
  assert.equal(JSON.parse(fs.readFileSync(QFILE(), 'utf8')).items[0].state, 'error');
});

test('M34: runner ghi job hỏng là "error" và mọi chỗ đọc đều nhận ra', async () => {
  writeQueue([]);
  const it = Q.addItem({ kind: 'variants', input: path.join(HOME, 'không-có-dự-án'), opts: { args: ['--no-claude'] }, source: 'test' });
  const r = new Q.Runner({ role: 'test', daemon: false, log: () => {} });
  const idle = new Promise(ok => { r.onIdle = ok; });
  r.start();
  let guard; await Promise.race([idle, new Promise(ok => { guard = setTimeout(ok, 60000); })]);
  clearTimeout(guard); r.stop({ requeue: false });
  const got = Q.loadQueue().items.find(x => x.id === it.id);
  assert.equal(got.state, 'error', `state=${got.state} step=${got.step}`);
  assert.ok(Q.isFailed(got));
});

test('M34: bot Telegram báo job hỏng (cả tên cũ "failed") kèm nút chạy lại, bấm thì job được xếp lại', async () => {
  writeQueue([item('b1', 'error'), item('b2', 'failed')]);
  T.saveCfg({ notified: [], allowed: [{ id: 42, name: 'chủ' }] });
  calls.length = 0;
  const bot = new T.TelegramBot({ log: () => {} });
  await bot.deliver();
  const msgs = sent();
  assert.equal(msgs.length, 2);
  for (const m of msgs) {
    assert.match(m.text, /bị lỗi/);
    assert.match(m.reply_markup.inline_keyboard[0][0].callback_data, /^q:b[12]:retry$/);
  }
  await bot.deliver(); // đã báo thì không báo lại
  assert.equal(sent().length, 2);
  assert.match(bot.statusText(), /⚠️.*lỗi/);

  await bot.onCallback({ id: 'cb', data: 'q:b1:retry', message: { chat: { id: 42 }, message_id: 1 } });
  assert.equal(Q.loadQueue().items.find(x => x.id === 'b1').state, 'queued');
  // chạy lại xong (finished mới) → lại được gửi kết quả
  Q.mutate(q => Object.assign(q.items.find(x => x.id === 'b1'), { state: 'error', finished: '2026-11-02T00:00:00.000Z' }));
  calls.length = 0;
  await bot.deliver();
  assert.equal(sent().length, 1);
});

test('M34: vòng phản hồi đề xuất và chạy lại các job "error"', async () => {
  writeQueue([item('c1', 'error'), item('c2', 'failed'), item('c3', 'done')]);
  const st = await F.refreshSuggestions({ claude: false });
  const s = st.items.find(x => x.action?.type === 'retry_failed' && x.state === 'new');
  assert.ok(s, 'phải có đề xuất chạy lại');
  assert.match(s.title, /2 việc/);
  const r = await F.actSuggestion(s.id, 'apply');
  assert.match(r.msg, /2 việc/);
  assert.deepEqual(Q.loadQueue().items.map(i => i.state), ['queued', 'queued', 'done']);
});

// ---------------- M35 ----------------
test('M35: killTree dừng cả tiến trình cháu (như Chrome/ffmpeg con của render.mjs)', async () => {
  const code = `const { spawn } = require('node:child_process');
const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
console.log(c.pid); setInterval(() => {}, 1000);`;
  const p = spawn(process.execPath, ['-e', code], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
  const grandchild = await new Promise(ok => p.stdout.once('data', d => ok(+String(d).trim())));
  assert.ok(alive(grandchild));
  const closed = new Promise(ok => p.on('close', ok));
  await P.killTree(p, { group: true });
  await closed;
  for (let i = 0; i < 20 && alive(grandchild); i++) await sleep(150);
  assert.equal(alive(grandchild), false, 'tiến trình cháu vẫn sống sau khi huỷ');
});

test('M35: dọn thư mục .render_* do job để lại, không đụng thư mục có trước khi job chạy', () => {
  const proj = fs.mkdtempSync(path.join(HOME, 'proj-')), out = path.join(proj, 'out');
  fs.mkdirSync(path.join(out, '.render_new1'), { recursive: true });
  fs.writeFileSync(path.join(out, '.render_new1', 'seg0.mp4'), 'x');
  fs.mkdirSync(path.join(proj, '.render_new2'));
  fs.mkdirSync(path.join(out, 'giu_lai'));
  const roots = Q.renderRoots({ project: proj, opts: { out: 'tương-đối/bỏ-qua' }, outputs: [path.join(out, 'a.mp4')] });
  assert.deepEqual(roots, [path.resolve(proj), path.resolve(out)]);
  // job bắt đầu sau khi các thư mục đã có → không xoá
  assert.deepEqual(Q.sweepRenderTmp(roots, Date.now() + 60000), []);
  assert.ok(fs.existsSync(path.join(out, '.render_new1')));
  const gone = Q.sweepRenderTmp(roots, Date.now() - 60000);
  assert.equal(gone.length, 2);
  assert.ok(!fs.existsSync(path.join(out, '.render_new1')) && !fs.existsSync(path.join(proj, '.render_new2')));
  assert.ok(fs.existsSync(path.join(out, 'giu_lai')));
});

// ---------------- M36 ----------------
test('M36: mã ghép nối khoá sau 5 lần sai, mã mới mở khoá', async () => {
  process.env.AVS_NOW = '2026-11-13T08:00:00.000Z';
  try {
    T.saveCfg({ allowed: [] });
    const { code } = T.newPairCode();
    const wrong = String((+code + 1) % 900000 + 100000);
    const bot = new T.TelegramBot({ log: () => {} });
    const chat = { id: 777, first_name: 'Lạ' };
    calls.length = 0;
    for (let i = 1; i < T.PAIR_MAX_TRIES; i++) await bot.onMessage({ chat, text: `/start ${wrong}` });
    assert.equal(T.loadCfg().pairTries, T.PAIR_MAX_TRIES - 1);
    assert.match(sent().at(-1).text, /Còn 1 lần/);
    await bot.onMessage({ chat, text: `/start ${wrong}` }); // lần thứ 5 → khoá, mã bị huỷ
    assert.equal(T.loadCfg().pair, null);
    assert.match(sent().at(-1).text, /khoá/);
    await bot.onMessage({ chat, text: `/start ${code}` }); // đúng mã nhưng đang khoá
    assert.equal(bot.allowed(chat), false);
    assert.equal(T.checkPairCode(code), 'locked');
    process.env.AVS_NOW = '2026-11-13T08:16:00.000Z'; // hết khoá, nhưng mã cũ đã bị huỷ
    assert.equal(T.checkPairCode(code), 'none');
    const fresh = T.newPairCode(); // chủ máy tạo mã mới
    await bot.onMessage({ chat, text: `/start ${fresh.code}` });
    assert.equal(bot.allowed(chat), true);
    assert.equal(T.loadCfg().pairTries, 0);
  } finally { delete process.env.AVS_NOW; T.saveCfg({ allowed: [{ id: 42, name: 'chủ' }], pair: null, pairLock: null, pairTries: 0 }); }
});

test('M36: mã ghép nối hết hạn thì không nhận', () => {
  process.env.AVS_NOW = '2026-11-13T09:00:00.000Z';
  try {
    const { code } = T.newPairCode();
    process.env.AVS_NOW = '2026-11-13T09:16:00.000Z';
    assert.equal(T.checkPairCode(code), 'none');
  } finally { delete process.env.AVS_NOW; T.saveCfg({ pair: null }); }
});

test('M36: đường dẫn video từ tin nhắn chỉ được nhận khi nằm trong thư mục đã khai', () => {
  const watch = path.join(HOME, 'watch'), extra = path.join(HOME, 'kho'), outside = path.join(HOME, 'ngoai');
  for (const d of [watch, extra, outside]) fs.mkdirSync(d, { recursive: true });
  Q.saveSettings({ watch: { folders: [{ in: watch, done: path.join(HOME, 'xong'), processed: path.join(HOME, 'da-xu-ly') }] } });
  T.saveCfg({ roots: [extra] });
  const okA = path.join(watch, 'a.mp4'), okB = path.join(extra, 'b.mov'), bad = path.join(outside, 'c.mp4'), txt = path.join(watch, 'd.txt');
  for (const f of [okA, okB, bad, txt]) fs.writeFileSync(f, 'x');
  const roots = T.allowedRoots();
  assert.equal(T.safeVideoPath(okA, roots), fs.realpathSync(okA));
  assert.equal(T.safeVideoPath(`"${okB}"`, roots), fs.realpathSync(okB));
  assert.equal(T.safeVideoPath(bad, roots), null, 'ngoài thư mục đã khai');
  assert.equal(T.safeVideoPath(path.join(watch, '..', 'ngoai', 'c.mp4'), roots), null, 'thoát ra bằng ..');
  assert.equal(T.safeVideoPath(txt, roots), null, 'không phải video');
  assert.equal(T.safeVideoPath('a.mp4', roots), null, 'đường dẫn tương đối');
  assert.equal(T.safeVideoPath(path.join(watch, 'khong-co.mp4'), roots), null, 'không tồn tại');
  assert.equal(T.safeVideoPath(watch, roots), null, 'thư mục, không phải file');
});
