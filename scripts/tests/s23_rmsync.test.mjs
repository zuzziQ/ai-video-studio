// Test S23 M157 (tiếp): mọi lệnh xoá của scripts/ và studio/ qua rmSync của scripts/fs_rm.mjs — luồng thật với đường dẫn có dấu
// (khoá file của hàng đợi / lịch đăng dưới thư mục người dùng có dấu, xoá b-roll khỏi thư viện), maxRetries khi file bị giữ,
// lint scripts/check-rmsync.mjs chặn fs.rmSync mới, và check-roadmap-link nhận ID 3 chữ số (M157).
// Chạy: node --test scripts/tests/s23_rmsync.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rmSync } from '../fs_rm.mjs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-rmsync-'));
const USER = path.join(TMP, 'Người dùng Đẹp');
// Thư mục cấu hình và Kho theo thư mục người dùng: đặt vào thư mục tạm có dấu, không đụng ~/.ai-video-studio thật
process.env.AVS_HOME = path.join(USER, '.ai-video-studio'); process.env.USERPROFILE = process.env.HOME = USER;
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const W = (f, s = 'x') => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); return f; };

test('withFileLock dưới thư mục có dấu: khoá của mình được gỡ, khoá mồ côi (pid đã chết) được dọn', async () => {
  const { withFileLock } = await import('../file_lock.mjs');
  const lock = path.join(process.env.AVS_HOME, 'queue.json.lock');
  assert.equal(withFileLock(lock, () => 42), 42);
  assert.ok(!fs.existsSync(lock), 'khoá đã gỡ sau khi xong');
  W(lock, JSON.stringify({ pid: 2 ** 22 + 12345, host: os.hostname(), t: Date.now(), tok: 'cu' })); // pid không tồn tại
  const t0 = Date.now();
  assert.equal(withFileLock(lock, () => 'ok', { timeoutMs: 3000 }), 'ok');
  assert.ok(Date.now() - t0 < 2500, 'không phải chờ hết hạn khoá');
  assert.ok(!fs.existsSync(lock));
});

test('xoá b-roll khỏi thư viện dưới thư mục người dùng có dấu: file và thư mục khung hình đều mất', async () => {
  const lib = await import('../broll_lib.mjs');
  assert.ok(lib.LIB.startsWith(USER), 'thư viện của test nằm trong thư mục tạm');
  W(path.join(lib.LIB, 'b1.mp4'), 'v'); W(path.join(lib.LIB, 'b1_frames', '00001.jpg'));
  W(path.join(lib.LIB, 'index.json'), JSON.stringify([{ id: 'b1', file: 'b1.mp4', tags: ['phố cổ'] }]));
  assert.equal(lib.remove('b1'), true);
  assert.ok(!fs.existsSync(path.join(lib.LIB, 'b1.mp4')), 'file b-roll đã xoá');
  assert.ok(!fs.existsSync(path.join(lib.LIB, 'b1_frames')), 'thư mục khung hình đã xoá');
  assert.deepEqual(lib.load(), []);
});

test('maxRetries: file bị giữ (EBUSY) lúc đầu vẫn được xoá ở lần thử sau', t => {
  if (process.platform !== 'win32') return t.skip('nhánh riêng của Windows');
  const f = W(path.join(TMP, 'Đang mở.mp4')), real = fs.unlinkSync;
  let n = 0;
  fs.unlinkSync = p => { if (++n < 3) throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' }); return real(p); };
  try {
    assert.throws(() => rmSync(f, { force: true }), e => e.code === 'EBUSY', 'không maxRetries: ném ngay như fs.rmSync');
    n = 0; rmSync(f, { force: true, maxRetries: 3, retryDelay: 1 });
  } finally { fs.unlinkSync = real; }
  assert.equal(n, 3); assert.ok(!fs.existsSync(f));
});

test('check-rmsync: bắt fs.rmSync và rmSync lấy thẳng từ node:fs; mã của repo sạch', async () => {
  const { findRmSync, scan } = await import('../check-rmsync.mjs');
  const bad = [
    "fs.rmSync(p, { force: true });",
    "for (const f of xs) fs.rmSync (f);",
    "xs.forEach(fs.rmSync);",
    "import { rmSync } from 'node:fs';",
    "import { readFileSync, rmSync as rm } from 'fs';",
    "const { rmSync } = fs;",
    "const { rmSync } = require('node:fs');",
  ];
  for (const s of bad) assert.equal(findRmSync(s).length, 1, s);
  const ok = [
    "import { rmSync } from './fs_rm.mjs';",
    "rmSync(p, { recursive: true, force: true });",
    "// fs.rmSync( của Node 24 bỏ qua đường dẫn có dấu",
    "fs.rmSync(p); // rmsync-ok: đường dẫn ASCII cố định",
    "console.log('fs.rmSync trực tiếp — dùng fs_rm');",
    "fs.promises.rm(p, { force: true });",
  ];
  for (const s of ok) assert.deepEqual(findRmSync(s), [], s);
  assert.deepEqual(scan(), [], 'không còn fs.rmSync ngoài scripts/fs_rm.mjs');
});

test('check-roadmap-link nhận ID 3 chữ số (M157) như ID 2 chữ số', async () => {
  const { checkRoadmapLink, roadmapIds } = await import('../check-roadmap-link.mjs');
  const roadmap = '- [x] **`S23`** đợt\n- [x] **`M157`** (`area/infra`): test Windows\n- [ ] **`M05`** cũ\n';
  assert.deepEqual([...roadmapIds(roadmap)].sort(), ['M05', 'M157', 'S23']);
  const files = ['scripts/fs_rm.mjs', 'docs/ROADMAP.md'];
  assert.deepEqual(checkRoadmapLink({ body: 'Roadmap: M157', files, roadmap }).ids, ['M157']);
  assert.deepEqual(checkRoadmapLink({ body: 'Roadmap: S23, M157, M05', files, roadmap }).ids, ['S23', 'M157', 'M05']);
  const r = checkRoadmapLink({ body: 'Roadmap: M158', files, roadmap });
  assert.equal(r.ok, false); assert.match(r.reason, /M158 is not an item/);
});
