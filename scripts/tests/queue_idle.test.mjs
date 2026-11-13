// M55 — hàng đợi nhàn rỗi không ghi đĩa: Runner.tick() không khoá/ghi lại queue.json khi không có gì đổi, vẫn dọn mục
// "running" của runner đã chết; run-due chỉ được sinh khi schedule.json có mục đến hạn (scripts/schedule_due.mjs).
// Không chạy publish.mjs thật: execDue được thay bằng hàm đếm. AVS_HOME là thư mục tạm.
// Chạy: node --test scripts/tests/queue_idle.test.mjs
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-queue-m55-'));
process.env.AVS_HOME = HOME;
process.env.AVS_NO_LAUNCHCTL = '1';
process.env.AVS_NO_SCHEDULE_TIMER = '1';
delete process.env.AVS_NOW;
const QFILE = path.join(HOME, 'queue.json'), SCHED = path.join(HOME, 'schedule.json');
let Q, D, P;

before(async () => { Q = await import('../queue.mjs'); D = await import('../schedule_due.mjs'); P = await import('../publish.mjs'); });
after(() => { fs.rmSync(HOME, { recursive: true, force: true }); });
beforeEach(() => { for (const f of [QFILE, SCHED, path.join(HOME, 'queue.lock')]) fs.rmSync(f, { force: true }); });

const writeQ = items => fs.writeFileSync(QFILE, JSON.stringify({ version: 1, items }));
const writeS = (items, settings) => fs.writeFileSync(SCHED, JSON.stringify({ version: 1, ...(settings ? { settings } : {}), items }));
const item = (id, state, extra = {}) => ({ id, kind: 'topic', input: 'chủ đề ' + id, title: 'T' + id, state, opts: {}, outputs: [], error: null, ...extra });
const mtime = f => fs.statSync(f).mtimeMs;
const DEAD_PID = 2 ** 22 + 12345; // không tồn tại trên Windows / Linux / macOS
const iso = ms => new Date(Date.now() + ms).toISOString();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Runner không gọi script thật: runItem bị thay để không sinh tiến trình cho mục đang chờ; execDue đếm số lần sinh run-due.
function runner() {
  const calls = [];
  const r = new Q.Runner({ role: 'test', daemon: true, log: () => {}, execDue: (args, done) => { calls.push({ args, done }); } });
  r.runItem = () => {};
  return { r, calls };
}
// mỗi lượt giả như đã qua 60 s để nhánh run-due được xét
async function ticks(r, n) { for (let k = 0; k < n; k++) { r.lastDue = 0; await r.tick(); } }

test('nhàn rỗi: 20 vòng tick không ghi lại queue.json (mtime và nội dung giữ nguyên), không sinh run-due', async () => {
  writeQ([item('d1', 'done'), item('q1', 'paused')]);
  const before = { m: mtime(QFILE), txt: fs.readFileSync(QFILE, 'utf8') };
  await sleep(30); // để một lần ghi (nếu có) chắc chắn đổi mtime
  const { r, calls } = runner();
  await ticks(r, 20);
  assert.equal(r.active, true);
  assert.equal(mtime(QFILE), before.m);
  assert.equal(fs.readFileSync(QFILE, 'utf8'), before.txt);
  assert.ok(!fs.existsSync(QFILE + '.lock'));
  assert.equal(calls.length, 0);
  assert.equal(r.due?.msg, 'không có mục đến hạn');
  r.stop({ requeue: false });
});

test('runner đã chết: mục "running" của nó được trả về hàng đợi, rồi các vòng sau lại không ghi', async () => {
  writeQ([item('r1', 'running', { runner: DEAD_PID }), item('r2', 'running', { runner: DEAD_PID, pauseAfter: true }), item('r3', 'running', { runner: DEAD_PID, cancel: true })]);
  const { r } = runner();
  await ticks(r, 1);
  const st = Object.fromEntries(Q.loadQueue().items.map(x => [x.id, x.state]));
  assert.deepEqual(st, { r1: 'queued', r2: 'paused', r3: 'cancelled' });
  const m = mtime(QFILE);
  await sleep(30);
  await ticks(r, 10);
  assert.equal(mtime(QFILE), m);
  r.stop({ requeue: false });
});

test('mục "running" của runner còn sống (chính tiến trình này) không bị đụng và không gây ghi', async () => {
  writeQ([item('a1', 'running', { runner: process.pid })]);
  const m = mtime(QFILE);
  await sleep(30);
  const { r } = runner();
  await ticks(r, 5);
  assert.equal(Q.loadQueue().items[0].state, 'running');
  assert.equal(mtime(QFILE), m);
  r.stop({ requeue: false });
});

test('run-due: không có lịch / chỉ có mục chưa tới hạn / đã xong → không sinh tiến trình', async () => {
  writeQ([]);
  const { r, calls } = runner();
  await ticks(r, 2); // không có schedule.json
  writeS([
    { id: 's1', platform: 'tiktok', state: 'planned', when: iso(3 * 3600e3) },          // còn 3 giờ, ngoài 10 phút nhắc trước
    { id: 's2', platform: 'youtube', state: 'planned', when: iso(5 * 3600e3) },         // ngoài 120 phút tải trước
    { id: 's3', platform: 'youtube', state: 'planned', when: iso(60e3), retryAfter: iso(10 * 60e3) }, // đang chờ thử lại
    { id: 's4', platform: 'facebook', state: 'reminded', when: iso(-3600e3) },
    { id: 's5', platform: 'youtube', state: 'done', when: iso(-3600e3) },
    { id: 's6', platform: 'zalo', state: 'planned', when: iso(5 * 60e3), preReminded: true }, // đã nhắc trước, chưa tới giờ
  ]);
  await ticks(r, 5);
  assert.equal(calls.length, 0);
  r.stop({ requeue: false });
});

test('run-due: có mục đến hạn → sinh đúng một lần mỗi lượt, không sinh thêm khi lượt trước chưa xong', async () => {
  writeQ([]);
  writeS([{ id: 'y1', platform: 'youtube', state: 'planned', when: iso(60 * 60e3) }]); // trong 120 phút tải trước
  const { r, calls } = runner();
  await ticks(r, 1);
  assert.equal(calls.length, 1);
  assert.equal(path.basename(calls[0].args[0]), 'publish.mjs');
  assert.equal(calls[0].args[1], 'run-due');
  await ticks(r, 3); // run-due trước vẫn đang chạy (giữ publish.lock): không sinh thêm
  assert.equal(calls.length, 1);
  calls[0].done(null, 'run-due lúc …: tải YouTube 1\n', '');
  assert.equal(r.due.ok, true);
  await ticks(r, 1); // vẫn đến hạn ở lượt sau → sinh lại một lần
  assert.equal(calls.length, 2);
  r.stop({ requeue: false });
});

test('run-due: lượt chưa đủ 60 s thì không xét lịch', async () => {
  writeQ([]);
  writeS([{ id: 'p1', platform: 'tiktok', state: 'planned', when: iso(-60e3) }]);
  const { r, calls } = runner();
  r.lastDue = 0; await r.tick();
  calls[0].done(null, 'xong', '');
  await r.tick(); await r.tick(); // lastDue vừa đặt: chưa tới 60 s
  assert.equal(calls.length, 1);
  r.stop({ requeue: false });
});

test('scheduleHasDue: ba loại mục đến hạn của runDue, và lịch hỏng vẫn cho chạy run-due', () => {
  const T = Date.parse('2026-11-13T12:00:00Z'), at = m => new Date(T + m * 60e3).toISOString();
  const has = (items, settings) => { writeS(items, settings); return D.scheduleHasDue({ home: HOME, now: T }); };
  assert.equal(D.scheduleHasDue({ home: HOME, now: T }), false); // không có file
  assert.equal(has([{ platform: 'tiktok', state: 'planned', when: at(5) }]), true);                 // nhắc trước
  assert.equal(has([{ platform: 'tiktok', state: 'planned', when: at(-1), preReminded: true }]), true); // đến giờ đăng
  assert.equal(has([{ platform: 'youtube', state: 'uploading', when: at(200) }], { ytLeadMin: 240 }), true); // ytLeadMin theo settings
  assert.equal(has([{ platform: 'youtube', state: 'planned', when: at(200) }]), false);
  assert.equal(has([{ platform: 'tiktok', state: 'planned', when: at(30) }], { remindMin: 45 }), true);
  assert.equal(has([{ platform: 'youtube', state: 'planned', when: at(10), retryAfter: at(-1) }]), true); // hết giờ chờ thử lại
  assert.equal(has([{ platform: 'youtube', state: 'uploading', when: at(30) }]), true); // tải lên bị kẹt: run-due làm tiếp
  fs.writeFileSync(SCHED, '{hỏng');
  assert.equal(D.scheduleHasDue({ home: HOME, now: T }), true);
  // đọc lỗi không phải ENOENT (trên Windows là EPERM/EBUSY khi file đang bị thay; ở đây EISDIR) → vẫn cho chạy run-due
  fs.rmSync(SCHED, { force: true }); fs.mkdirSync(SCHED);
  try { assert.equal(D.scheduleHasDue({ home: HOME, now: T }), true); } finally { fs.rmSync(SCHED, { recursive: true, force: true }); }
});

test('scheduleHasDue dùng cùng mặc định với publish.mjs', () => {
  assert.equal(D.DUE_DEFAULTS.remindMin, P.DEFAULT_SETTINGS.remindMin);
  assert.equal(D.DUE_DEFAULTS.ytLeadMin, P.DEFAULT_SETTINGS.ytLeadMin);
});
