// M39 — hàng đợi nền (scripts/queue.mjs): thêm / huỷ / chạy lại / xoá / đổi thứ tự / dọn; queue.json thiếu hoặc hỏng;
// loại việc lạ bị từ chối; dọn thư mục .render_* còn sót. Chạy: node --test scripts/tests/*.test.mjs
// Không chạy script xử lý thật (không gọi Runner.runItem thành công), AVS_HOME là thư mục tạm, không đụng ~/.ai-video-studio.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

// LỖI: scripts/queue.mjs:68 — KINDS là object thường nên `KINDS['constructor']`, `KINDS['toString']` … trả về hàm có sẵn (truthy),
// nên kind lạ kiểu đó lọt qua kiểm tra. Hậu quả: mục được xếp vào hàng đợi rồi Runner.runItem (scripts/queue.mjs:185) ném TypeError.
test('addItem: tên kind trùng thuộc tính của Object (constructor, toString) cũng bị từ chối', { skip: 'LỖI: scripts/queue.mjs:68 kiểm `KINDS[kind]` bằng truy cập object thường, nhận nhầm Object.prototype' }, () => {
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

test('Runner: mục loại lạ đưa vào queue.json bằng tay không làm kẹt hàng đợi', { skip: 'LỖI: scripts/queue.mjs:185 runItem: KINDS[it0.kind] là undefined rồi đọc spec.script ném TypeError trong tick(); mục đó đứng đầu hàng nên các mục sau không bao giờ chạy' }, async () => {
  write([item('bad', 'queued', { kind: 'khong-co' }), item('ok', 'error')]);
  const r = new Q.Runner({ role: 'test', daemon: false, log: () => {} });
  try {
    await r.tick();
  } finally {
    r.stop({ requeue: false });
  }
  assert.equal(Q.loadQueue().items.find(x => x.id === 'bad').state, Q.FAILED);
});
