// M39 — hàng đợi nền (scripts/queue.mjs): thêm / huỷ / chạy lại / xoá / đổi thứ tự / dọn; queue.json thiếu hoặc hỏng;
// loại việc lạ bị từ chối; dọn thư mục .render_* còn sót. Chạy: node --test scripts/tests/*.test.mjs
// Không chạy script xử lý thật (không gọi Runner.runItem thành công), AVS_HOME là thư mục tạm, không đụng ~/.ai-video-studio.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-queue-m39-'));
process.env.AVS_HOME = HOME;
process.env.AVS_NO_LAUNCHCTL = '1';
const QFILE = path.join(HOME, 'queue.json');
let Q;

before(async () => { Q = await import('../queue.mjs'); });
after(() => { fs.rmSync(HOME, { recursive: true, force: true }); });

const write = items => fs.writeFileSync(QFILE, JSON.stringify({ version: 1, items }));
const item = (id, state, extra = {}) => ({ id, kind: 'topic', input: 'chủ đề ' + id, title: 'T' + id, state, opts: {}, outputs: [], error: state === 'error' ? 'hỏng' : null, ...extra });
const ids = () => Q.loadQueue().items.map(x => x.id);

test('addItem: việc mới nằm cuối hàng đợi ở trạng thái chờ, có id 8 ký tự và tiêu đề', () => {
  write([]);
  const a = Q.addItem({ kind: 'topic', input: 'Ăn sáng healthy', source: 'test' });
  const b = Q.addItem({ kind: 'publish', input: path.join(HOME, 'clip.mp4'), opts: { action: 'youtube-upload' } });
  const items = Q.loadQueue().items;
  assert.deepEqual(items.map(x => x.id), [a.id, b.id]);
  assert.match(a.id, /^[0-9a-f]{8}$/);
  assert.notEqual(a.id, b.id);
  assert.equal(items[0].state, 'queued');
  assert.equal(items[0].title, 'Ăn sáng healthy');
  assert.equal(items[1].title, 'clip.mp4'); // loại không phải "topic": tên là tên file
});

test('addItem: thiếu đầu vào bị từ chối và queue.json không đổi', () => {
  write([item('k1', 'queued')]);
  const before = fs.readFileSync(QFILE, 'utf8');
  assert.throws(() => Q.addItem({ kind: 'topic', input: '' }), /Thiếu đầu vào/);
  assert.throws(() => Q.addItem({ kind: 'rm-rf', input: 'x' }), /Loại việc lạ/);
  assert.equal(fs.readFileSync(QFILE, 'utf8'), before);
});

// Trước M24: KINDS là object thường nên `KINDS['constructor']`, `KINDS['toString']` … trả về hàm có sẵn và kind lạ lọt qua.
test('addItem: tên kind trùng thuộc tính của Object (constructor, toString) cũng bị từ chối', () => {
  write([]);
  for (const kind of ['constructor', 'toString', '__proto__']) assert.throws(() => Q.addItem({ kind, input: 'x' }), /Loại việc lạ/, kind);
  assert.deepEqual(ids(), []);
});

test('cancelItem: việc đang chờ thành đã huỷ; việc đang chạy chỉ được đặt cờ huỷ; id lạ trả false', () => {
  write([item('c1', 'queued'), item('c2', 'running')]);
  assert.equal(Q.cancelItem('c1'), true);
  assert.equal(Q.cancelItem('c2'), true);
  assert.equal(Q.cancelItem('nope'), false);
  const [a, b] = Q.loadQueue().items;
  assert.equal(a.state, 'cancelled');
  assert.ok(a.finished);
  assert.equal(b.state, 'running');
  assert.equal(b.cancel, true);
});

test('retryItem: việc lỗi về lại hàng chờ, xoá lỗi và số lần thử; việc đang chạy không được chạy lại', () => {
  write([item('r1', 'error', { attempt: 2 }), item('r2', 'running')]);
  assert.equal(Q.retryItem('r1'), true);
  assert.equal(Q.retryItem('r2'), false);
  const a = Q.loadQueue().items.find(x => x.id === 'r1');
  assert.equal(a.state, 'queued');
  assert.equal(a.error, null);
  assert.equal(a.attempt, 0);
  assert.equal(Q.loadQueue().items.find(x => x.id === 'r2').state, 'running');
});

test('removeItem: xoá được việc chờ và việc lỗi, không xoá việc đang chạy', () => {
  write([item('d1', 'queued'), item('d2', 'running'), item('d3', 'error')]);
  assert.equal(Q.removeItem('d2'), false);
  assert.equal(Q.removeItem('d1'), true);
  assert.equal(Q.removeItem('d3'), true);
  assert.deepEqual(ids(), ['d2']);
  assert.equal(Q.removeItem('d9'), false);
});

test('moveItem: đổi chỗ lên/xuống; không vượt đầu hoặc cuối; id lạ trả false', () => {
  write([item('m1', 'queued'), item('m2', 'queued'), item('m3', 'queued')]);
  assert.equal(Q.moveItem('m3', -1), true);
  assert.deepEqual(ids(), ['m1', 'm3', 'm2']);
  assert.equal(Q.moveItem('m1', -1), false);
  assert.equal(Q.moveItem('m2', 1), false);
  assert.equal(Q.moveItem('zz', 1), false);
  assert.deepEqual(ids(), ['m1', 'm3', 'm2']);
});

test('clearDone: chỉ bỏ việc xong và việc đã huỷ; giữ việc chờ, việc lỗi, việc đang chạy', () => {
  write([item('x1', 'done'), item('x2', 'cancelled'), item('x3', 'queued'), item('x4', 'error'), item('x5', 'running')]);
  assert.equal(Q.clearDone(), 2);
  assert.deepEqual(ids(), ['x3', 'x4', 'x5']);
});

test('clearFailed: chỉ bỏ việc lỗi (nút "Xoá mục lỗi" riêng); giữ việc xong, đã huỷ, chờ, đang chạy', () => {
  write([item('y1', 'done'), item('y2', 'error'), item('y3', 'queued'), item('y4', 'error'), item('y5', 'running'), item('y6', 'cancelled')]);
  assert.equal(Q.clearFailed(), 2);
  assert.deepEqual(ids(), ['y1', 'y3', 'y5', 'y6']);
});

test('queue.json thiếu hoặc hỏng: đọc ra hàng đợi rỗng, không ném lỗi; lần ghi sau tạo lại file', () => {
  fs.rmSync(QFILE, { force: true });
  assert.deepEqual(Q.loadQueue(), { version: 1, items: [] });
  fs.writeFileSync(QFILE, '{ không phải json');
  assert.deepEqual(Q.loadQueue().items, []);
  fs.writeFileSync(QFILE, JSON.stringify({ items: 'không phải mảng' }));
  assert.deepEqual(Q.loadQueue().items, []);
  const a = Q.addItem({ kind: 'topic', input: 'sau khi hỏng' });
  assert.deepEqual(ids(), [a.id]);
  assert.equal(JSON.parse(fs.readFileSync(QFILE, 'utf8')).items.length, 1);
});

test('sweepRenderTmp: chỉ xoá .render_* được tạo sau mốc; thư mục khác giữ nguyên', () => {
  const out = fs.mkdtempSync(path.join(HOME, 'out-'));
  const r1 = path.join(out, '.render_ab12');
  fs.mkdirSync(r1);
  fs.mkdirSync(path.join(out, 'giữ-lại'));
  assert.deepEqual(Q.sweepRenderTmp([out], Date.now() + 60_000), []); // mốc ở tương lai: không có gì "mới"
  assert.ok(fs.existsSync(r1));
  assert.deepEqual(Q.sweepRenderTmp([out], 0), [r1]);
  assert.ok(!fs.existsSync(r1));
  assert.ok(fs.existsSync(path.join(out, 'giữ-lại')));
});

test('renderRoots: chỉ lấy đường dẫn tuyệt đối, bỏ trùng và bỏ đường dẫn tương đối', () => {
  const p = path.join(HOME, 'proj');
  const roots = Q.renderRoots({ project: p, result: { project: p }, opts: { out: 'tương-đối' }, outputs: [path.join(p, 'out', 'a.mp4')] });
  assert.deepEqual(roots, [p, path.join(p, 'out')]);
});

// Trước M24: runItem đọc KINDS[kind].script khi kind lạ → TypeError trong tick(); mục đứng đầu hàng nên các mục sau không chạy.
test('Runner: mục loại lạ đưa vào queue.json bằng tay không làm kẹt hàng đợi', async () => {
  write([item('bad', 'queued', { kind: 'khong-co' }), item('ok', 'error')]);
  const r = new Q.Runner({ role: 'test', daemon: false, log: () => {} });
  try {
    await r.tick();
  } finally {
    r.stop({ requeue: false });
  }
  assert.equal(Q.loadQueue().items.find(x => x.id === 'bad').state, Q.FAILED);
});

// ---------- M24: khoá ghi queue.json giữa các tiến trình ----------
const QUEUE_URL = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'queue.mjs')).href;
// Mỗi tiến trình con chờ tới cùng một mốc giờ rồi thêm N việc liên tiếp: không khoá thì đọc–sửa–ghi chồng nhau và mất việc.
const writer = (n, at, tag) => new Promise((ok, bad) => {
  const code = `const Q = await import(${JSON.stringify(QUEUE_URL)}); while (Date.now() < ${at}) {} for (let i = 0; i < ${n}; i++) Q.addItem({ kind: 'topic', input: '${tag}-' + i, source: 'test' });`;
  const p = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, AVS_HOME: HOME }, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', d => (err += d));
  p.on('close', c => (c === 0 ? ok() : bad(new Error(`tiến trình ${tag} lỗi ${c}: ${err}`))));
});

test('khoá: ba tiến trình cùng thêm việc một lúc không làm mất việc nào', async () => {
  write([]);
  const N = 40, at = Date.now() + 1500;
  await Promise.all(['a', 'b', 'c'].map(t => writer(N, at, t)));
  const items = Q.loadQueue().items;
  assert.equal(items.length, 3 * N);
  for (const t of ['a', 'b', 'c']) assert.equal(items.filter(x => x.input.startsWith(t + '-')).length, N, t);
  assert.ok(!fs.existsSync(QFILE + '.lock'), 'khoá được nhả sau khi ghi');
  assert.deepEqual(fs.readdirSync(HOME).filter(f => f.endsWith('.tmp')), [], 'không còn file tạm');
});

test('khoá: khoá bỏ lại bởi tiến trình đã chết (pid không còn) được gỡ, không treo', () => {
  write([]);
  fs.writeFileSync(QFILE + '.lock', JSON.stringify({ pid: 2 ** 22 + 12345, host: os.hostname(), t: Date.now() }));
  const t0 = Date.now();
  Q.addItem({ kind: 'topic', input: 'sau khoá chết' });
  assert.ok(Date.now() - t0 < 3000);
  assert.equal(Q.loadQueue().items.length, 1);
  assert.ok(!fs.existsSync(QFILE + '.lock'));
});

test('khoá: khoá cũ quá hạn (file rỗng, mtime cũ) được gỡ', () => {
  write([]);
  fs.writeFileSync(QFILE + '.lock', '');
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(QFILE + '.lock', old, old);
  Q.addItem({ kind: 'topic', input: 'sau khoá cũ' });
  assert.equal(Q.loadQueue().items.length, 1);
});

test('khoá: còn người giữ (khoá mới, máy khác) thì chờ rồi báo lỗi khi quá hạn, không chạy phần ghi', () => {
  const lock = path.join(HOME, 'other.lock');
  fs.writeFileSync(lock, JSON.stringify({ pid: 1, host: 'may-khac', t: Date.now() }));
  let ran = false;
  assert.throws(() => Q.withFileLock(lock, () => { ran = true; }, { timeoutMs: 300 }), /bị khoá/);
  assert.equal(ran, false);
  fs.rmSync(lock);
  assert.equal(Q.withFileLock(lock, () => 42), 42);
  assert.ok(!fs.existsSync(lock));
  assert.throws(() => Q.withFileLock(lock, () => { throw new Error('hỏng giữa chừng'); }), /hỏng giữa chừng/);
  assert.ok(!fs.existsSync(lock), 'lỗi trong phần ghi vẫn nhả khoá');
});

test('queue.json hỏng: lần ghi sau giữ bản hỏng thành queue.json.bad-*', () => {
  for (const f of fs.readdirSync(HOME).filter(f => f.startsWith('queue.json.bad-'))) fs.rmSync(path.join(HOME, f));
  fs.writeFileSync(QFILE, '{ hỏng');
  Q.addItem({ kind: 'topic', input: 'x' });
  const bad = fs.readdirSync(HOME).filter(f => f.startsWith('queue.json.bad-'));
  assert.equal(bad.length, 1);
  assert.equal(fs.readFileSync(path.join(HOME, bad[0]), 'utf8'), '{ hỏng');
});

// ---------- M24: điều khiển cả lô ----------
test('lô: addItem ghi nhãn lô; tạm dừng chỉ đụng việc đang chờ của lô đó; tiếp tục trả về hàng chờ', () => {
  write([item('o1', 'queued')]);
  const a = Q.addItem({ kind: 'topic', input: 'l1', batch: 'L' }), b = Q.addItem({ kind: 'topic', input: 'l2', batch: 'L' });
  assert.equal(Q.loadQueue().items.find(x => x.id === a.id).batch, 'L');
  const q0 = Q.loadQueue(); q0.items.find(x => x.id === a.id).state = 'running'; fs.writeFileSync(QFILE, JSON.stringify(q0));
  assert.equal(Q.batchControl('pause', 'L'), 2);
  const get = id => Q.loadQueue().items.find(x => x.id === id), st = id => get(id).state;
  assert.equal(st(a.id), 'running'); // việc đang chạy làm nốt…
  assert.equal(get(a.id).pauseAfter, true); // …nhưng nếu phải về hàng đợi thì về "tạm dừng"
  assert.equal(st(b.id), 'paused');
  assert.equal(st('o1'), 'queued'); // ngoài lô: không đổi
  assert.equal(Q.batchControl('resume', 'L'), 2);
  assert.equal(st(b.id), 'queued');
  assert.equal(get(a.id).pauseAfter, undefined);
});

test('lô: huỷ cả lô — chờ/tạm dừng thành đã huỷ, đang chạy được đặt cờ huỷ; không ghi lô = cả hàng đợi', () => {
  write([item('p1', 'queued', { batch: 'X' }), item('p2', 'paused', { batch: 'X' }), item('p3', 'running', { batch: 'X' }), item('p4', 'done', { batch: 'X' }), item('p5', 'queued')]);
  assert.equal(Q.batchControl('cancel', 'X'), 3);
  const by = Object.fromEntries(Q.loadQueue().items.map(x => [x.id, x]));
  assert.equal(by.p1.state, 'cancelled');
  assert.equal(by.p2.state, 'cancelled');
  assert.equal(by.p3.state, 'running');
  assert.equal(by.p3.cancel, true);
  assert.equal(by.p4.state, 'done');
  assert.equal(by.p5.state, 'queued');
  assert.equal(Q.batchControl('pause'), 2); // p5 chờ → tạm dừng, p3 đang chạy → pauseAfter
  assert.equal(Q.loadQueue().items.find(x => x.id === 'p5').state, 'paused');
  assert.throws(() => Q.batchControl('xoa-het'), /Lệnh lô lạ/);
});

test('Runner: việc tạm dừng không được chạy; việc chờ phía sau vẫn được chọn', async () => {
  write([item('s1', 'paused'), item('s2', 'queued', { kind: 'khong-co' })]);
  const r = new Q.Runner({ role: 'test', daemon: false, log: () => {} });
  try { await r.tick(); } finally { r.stop({ requeue: false }); }
  const by = Object.fromEntries(Q.loadQueue().items.map(x => [x.id, x]));
  assert.equal(by.s1.state, 'paused');
  assert.equal(by.s2.state, Q.FAILED); // runner chọn s2 (loại lạ → lỗi), bỏ qua s1
});

test('requeue: việc phải về hàng đợi tôn trọng cờ huỷ và lô đang tạm dừng', () => {
  assert.equal(Q.requeue({ state: 'running', cancel: true }, 'x').state, 'cancelled');
  assert.equal(Q.requeue({ state: 'running', pauseAfter: true }, 'x').state, 'paused');
  const it = Q.requeue({ state: 'running', runner: 123 }, 'Chạy tiếp');
  assert.equal(it.state, 'queued');
  assert.equal(it.step, 'Chạy tiếp');
  assert.equal(it.runner, null);
});

test('Runner: runner chết giữa chừng — việc của lô đã tạm dừng về "tạm dừng", việc đã bấm huỷ thành đã huỷ', async () => {
  const dead = 2 ** 22 + 4321;
  write([item('z1', 'running', { runner: dead, pauseAfter: true }), item('z2', 'running', { runner: dead, cancel: true }), item('z3', 'running', { runner: dead })]);
  const q = Q.loadQueue(); for (const it of q.items) it.kind = 'khong-co'; fs.writeFileSync(QFILE, JSON.stringify(q)); // z3 về hàng đợi rồi lỗi ngay, không chạy script thật
  const r = new Q.Runner({ role: 'test', daemon: false, log: () => {} });
  try { await r.tick(); } finally { r.stop({ requeue: false }); }
  const by = Object.fromEntries(Q.loadQueue().items.map(x => [x.id, x]));
  assert.equal(by.z1.state, 'paused');
  assert.equal(by.z2.state, 'cancelled');
  assert.equal(by.z3.state, Q.FAILED);
});

test('Runner.runItem: việc đã bị tạm dừng / xoá sau khi runner đọc hàng đợi thì không được chạy', () => {
  const stale = item('y1', 'queued', { kind: 'topic' });
  write([{ ...stale, state: 'paused' }]);
  const r = new Q.Runner({ role: 'test', daemon: false, log: () => {} });
  r.runItem(stale);
  assert.equal(r.child, null);
  assert.equal(Q.loadQueue().items[0].state, 'paused');
  write([]);
  r.runItem(stale);
  assert.equal(r.child, null);
  assert.deepEqual(ids(), []);
});

test('khoá: người giữ chỉ xoá khoá của chính mình', () => {
  const lock = path.join(HOME, 'own.lock');
  Q.withFileLock(lock, () => { fs.writeFileSync(lock, JSON.stringify({ pid: 1, host: 'khac', t: Date.now(), tok: 'cua-nguoi-khac' })); });
  assert.ok(fs.existsSync(lock), 'khoá của người khác (đã thay chỗ) không bị xoá');
  fs.rmSync(lock);
});
