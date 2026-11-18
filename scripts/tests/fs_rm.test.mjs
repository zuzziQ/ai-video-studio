// Test S23 M157: scripts/fs_rm.mjs rmSync — xoá được đường dẫn có dấu trên Windows (fs.rmSync của Node 24 im lặng bỏ qua),
// cùng hành vi fs.rmSync: force bỏ qua file không có, thư mục cần recursive, liên kết (junction/symlink) chỉ gỡ liên kết.
// Chạy: node --test scripts/tests/fs_rm.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rmSync } from '../fs_rm.mjs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-fsrm-'));
// Kho mặc định theo thư mục người dùng: đặt vào thư mục tạm, không giao gì vào Kho thật
process.env.AVS_HOME = path.join(TMP, 'cfg'); process.env.USERPROFILE = process.env.HOME = path.join(TMP, 'user');
const { deliverExports } = await import('../kho_deliver.mjs');
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const W = (f, s = 'x') => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); return f; };

test('xoá file và thư mục có dấu (kể cả file có liên kết cứng); force; EISDIR khi thiếu recursive', () => {
  const f = W(path.join(TMP, 'Nhà Đẹp', 'Bản gốc.mp4')), g = path.join(TMP, 'Nhà Đẹp', 'cứng.mp4');
  fs.linkSync(f, g);
  rmSync(f); assert.ok(!fs.existsSync(f), 'file có dấu đã xoá'); assert.equal(fs.readFileSync(g, 'utf8'), 'x', 'liên kết cứng còn nguyên');
  W(path.join(TMP, 'Nhà Đẹp', 'con', 'ảnh.jpg'));
  assert.throws(() => rmSync(path.join(TMP, 'Nhà Đẹp')), e => e.code === 'ERR_FS_EISDIR');
  assert.throws(() => rmSync(path.join(TMP, 'Không có.mp4')), e => e.code === 'ENOENT');
  rmSync(path.join(TMP, 'Không có.mp4'), { force: true });
  rmSync(path.join(TMP, 'Nhà Đẹp'), { recursive: true, force: true });
  assert.ok(!fs.existsSync(path.join(TMP, 'Nhà Đẹp')));
});

test('liên kết thư mục (junction trên Windows) trong đường dẫn có dấu: chỉ gỡ liên kết, không đụng thư mục đích', t => {
  const target = W(path.join(TMP, 'đích', 'giữ.txt')), j = path.join(TMP, 'liên kết');
  try { fs.symlinkSync(path.dirname(target), j, process.platform === 'win32' ? 'junction' : 'dir'); } catch { return t.skip('không tạo được liên kết'); }
  rmSync(j, { recursive: true, force: true });
  assert.ok(!fs.existsSync(j)); assert.ok(fs.existsSync(target), 'không xoá vào trong đích');
});

test('giao bản chép của dự án tên có dấu: không còn file .part trong Thanh pham', async () => {
  const WS = await import('../workspace.mjs'), ws = WS.ensureWorkspace(WS.workspaceFor('')), d = WS.projectDirFor(ws, 'Nhà Đẹp');
  assert.ok(ws.root.startsWith(TMP), 'Kho của test nằm trong thư mục tạm');
  W(path.join(d, 'timeline.json'), JSON.stringify({ width: 1080, height: 1920, duration: 1 }));
  const src = W(path.join(d, 'out', 'Nhà Đẹp.mp4'), 'v');
  const real = fs.linkSync;
  fs.linkSync = (s, t) => { if (!String(s).includes('.part.')) throw Object.assign(new Error('khác ổ'), { code: 'EXDEV' }); return real(s, t); };
  try {
    const r = deliverExports(d, [{ src, w: 1080, h: 1920 }], { date: new Date(2026, 10, 18) });
    assert.equal(r.items[0].how, 'copy');
    assert.deepEqual(fs.readdirSync(r.dir).filter(n => n.includes('.part')), [], 'file tạm .part đã xoá');
  } finally { fs.linkSync = real; }
});
