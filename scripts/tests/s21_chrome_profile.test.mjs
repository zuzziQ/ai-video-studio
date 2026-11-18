// M149 (sửa lỗi): Chrome chạy ngầm không khởi động được trên Windows → puppeteer xoá hồ sơ tạm gặp EBUSY và làm sập server.
// Hồ sơ giờ do scripts/chrome_profile.mjs quản: xoá có thử lại, không bao giờ ném lỗi; route /api/elem/shots trả lỗi rõ.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { launchChrome, removeProfile, sweepProfiles, PROFILE_PREFIX } from '../chrome_profile.mjs';
import route, { shotError } from '../../studio/routes/72_elem_ai.mjs';

const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'avs-cp-test-'));
const busy = () => Object.assign(new Error('EBUSY: resource busy or locked, unlink CrashpadMetrics-active.pma'), { code: 'EBUSY' });
const settle = () => new Promise(r => setTimeout(r, 30));

test('removeProfile thử lại khi EBUSY rồi xoá được, không ném lỗi', async () => {
  let n = 0;
  const rm = async () => { if (++n < 3) throw busy(); };
  assert.equal(await removeProfile(path.join(os.tmpdir(), PROFILE_PREFIX + 'x'), { rm, delayMs: 1 }), true);
  assert.equal(n, 3);
});

test('removeProfile luôn bận → false (để lần dọn sau), không ném lỗi', async () => {
  const rm = async () => { throw busy(); };
  assert.equal(await removeProfile(path.join(os.tmpdir(), PROFILE_PREFIX + 'x'), { rm, tries: 3, delayMs: 1 }), false);
});

test('removeProfile không đụng thư mục không phải hồ sơ của Studio', async () => {
  let called = false;
  assert.equal(await removeProfile(os.tmpdir(), { rm: async () => { called = true; } }), false);
  assert.equal(called, false);
});

test('launchChrome: Chrome không lên → lỗi CHROME_START, truyền userDataDir riêng, không có unhandled rejection', async () => {
  const root = tmpRoot(), seen = [];
  const onUnhandled = e => seen.push(e);
  process.on('unhandledRejection', onUnhandled);
  try {
    let opts;
    const pptr = { launch: async o => { opts = o; throw new Error('Timed out after 30000 ms while waiting for the WS endpoint URL to appear in stdout!'); } };
    const rm = async () => { throw busy(); }; // Windows còn khoá file
    await assert.rejects(launchChrome(pptr, { headless: true }, { root, rm }), e => e.code === 'CHROME_START' && e.reason === 'launch' && /không khởi động được/.test(e.message));
    assert.ok(opts.userDataDir && path.basename(opts.userDataDir).startsWith(PROFILE_PREFIX), 'puppeteer phải nhận userDataDir riêng để không tự xoá thư mục tạm');
    assert.equal(path.dirname(opts.userDataDir), root);
    await new Promise(r => setTimeout(r, 2000)); // các lần thử xoá ở nền chạy xong
    assert.deepEqual(seen, []);
  } finally { process.off('unhandledRejection', onUnhandled); fs.rmSync(root, { recursive: true, force: true }); }
});

test('launchChrome: close() và disconnected đều dọn hồ sơ đúng một lần', async () => {
  const root = tmpRoot();
  try {
    const b = Object.assign(new EventEmitter(), { closed: 0, close: async function () { this.closed++; this.emit('disconnected'); } });
    const pptr = { launch: async () => b };
    const removed = [];
    const rm = async d => { removed.push(d); fs.rmSync(d, { recursive: true, force: true }); };
    const br = await launchChrome(pptr, {}, { root, rm });
    assert.ok(fs.existsSync(br.profileDir));
    await br.close();
    await settle();
    assert.equal(b.closed, 1);
    assert.deepEqual(removed.filter(d => d === br.profileDir).length, 1);
    assert.equal(fs.existsSync(br.profileDir), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('sweepProfiles chỉ xoá hồ sơ cũ có tiền tố của Studio', async () => {
  const root = tmpRoot();
  try {
    const old = path.join(root, PROFILE_PREFIX + 'old'), fresh = path.join(root, PROFILE_PREFIX + 'new'), other = path.join(root, 'puppeteer_dev_chrome_profile-x');
    for (const d of [old, fresh, other]) fs.mkdirSync(d);
    const past = new Date(Date.now() - 2 * 3600e3); fs.utimesSync(old, past, past); fs.utimesSync(other, past, past);
    assert.equal(await sweepProfiles({ root }), 1);
    assert.equal(fs.existsSync(old), false);
    assert.equal(fs.existsSync(fresh), true);
    assert.equal(fs.existsSync(other), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('shotError: phân biệt thiếu puppeteer, thiếu Chrome, Chrome không lên', () => {
  assert.equal(shotError(Object.assign(new Error("Cannot find package 'puppeteer-core'"), { code: 'ERR_MODULE_NOT_FOUND' })).kind, 'no-chrome');
  assert.equal(shotError(new Error('Không tìm thấy Google Chrome (cần để render ảnh kiểm tra).')).kind, 'no-chrome');
  const r = shotError(Object.assign(new Error('Chrome chạy ngầm không khởi động được (Timed out…)'), { code: 'CHROME_START' }));
  assert.equal(r.kind, 'chrome-start');
  assert.match(r.error, /không khởi động được/);
  // trước đây mọi lỗi có chữ "puppeteer" đều thành "chưa cài puppeteer-core"
  assert.equal(shotError(new Error('puppeteer: Target closed')).kind, 'error');
});

test('/api/elem/shots: Chrome không lên → 503 kèm lỗi rõ, route vẫn nhận lượt sau', async () => {
  const lib = {
    designOf: () => [720, 1280],
    openEngine: async () => { throw Object.assign(new Error('Chrome chạy ngầm không khởi động được (x)'), { code: 'CHROME_START' }); },
  };
  const ctx = { project: { dir: '.' }, elemShotLib: lib, SKILL: path.resolve(import.meta.dirname, '../..'), json: (res, o, c = 200) => { res.code = c; res.out = o; }, body: async req => req.body };
  const h = route(ctx);
  const call = async () => { const res = {}; await h({ method: 'POST', body: { timelines: [{ scenes: [] }], t: 1 } }, res, '/api/elem/shots'); return res; };
  const a = await call();
  assert.equal(a.code, 503);
  assert.equal(a.out.kind, 'chrome-start');
  const b = await call(); // cờ "đang dựng" đã được nhả
  assert.equal(b.code, 503);
});
