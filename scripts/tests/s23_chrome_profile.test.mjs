// M158: mọi script mở Chrome qua scripts/chrome_profile.mjs (hồ sơ riêng, dọn có thử lại), kể cả render_hw.mjs launchChrome;
// Chrome bản thường trên Windows không lên khi USERPROFILE là thư mục tạm chưa có AppData\Local → helper tạo sẵn thư mục đó.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchChrome, ensureWinAppData, PROFILE_PREFIX } from '../chrome_profile.mjs';

process.env.AVS_CHROME_SHELL = '0';
const SCRIPTS = path.resolve(import.meta.dirname, '..');
const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'avs-cp23-test-'));

test('không script nào gọi puppeteer.launch thẳng (ngoài chrome_profile.mjs)', () => {
  const bad = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'tests', '.venv'].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.m?js$/.test(e.name) && e.name !== 'chrome_profile.mjs' && /\bpuppeteer\.launch\s*\(/.test(fs.readFileSync(p, 'utf8'))) bad.push(path.relative(SCRIPTS, p));
    }
  };
  walk(SCRIPTS);
  walk(path.resolve(SCRIPTS, '../studio'));
  assert.deepEqual(bad, []);
});

test('ensureWinAppData: Windows tạo %USERPROFILE%\\AppData\\Local và LOCALAPPDATA, hệ khác không làm gì', () => {
  const made = [];
  const mkdir = d => made.push(d);
  assert.deepEqual(ensureWinAppData({ USERPROFILE: 'C:\\tmp\\home' }, { platform: 'win32', mkdir }), ['C:\\tmp\\home\\AppData\\Local']);
  assert.deepEqual(ensureWinAppData({ USERPROFILE: 'C:\\h', LOCALAPPDATA: 'C:\\h\\AppData\\Local' }, { platform: 'win32', mkdir }), ['C:\\h\\AppData\\Local']);
  assert.deepEqual(ensureWinAppData({ USERPROFILE: '/home/x' }, { platform: 'linux', mkdir }), []);
  assert.deepEqual(ensureWinAppData({}, { platform: 'win32', mkdir }), []);
  // không tạo được thì bỏ qua, không ném lỗi
  assert.deepEqual(ensureWinAppData({ USERPROFILE: 'C:\\x' }, { platform: 'win32', mkdir: () => { throw new Error('EPERM'); } }), []);
});

test('launchChrome: env có USERPROFILE tạm → AppData\\Local có sẵn trước khi mở Chrome (Windows)', { skip: process.platform !== 'win32' }, async () => {
  const root = tmpRoot(), home = path.join(root, 'home');
  fs.mkdirSync(home);
  try {
    let seen;
    const pptr = { launch: async o => { seen = fs.existsSync(path.join(home, 'AppData', 'Local')); return { close: async () => {} }; } };
    const b = await launchChrome(pptr, { env: { ...process.env, USERPROFILE: home } }, { root });
    assert.equal(seen, true);
    await b.close();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('render_hw launchChrome: mỗi lần mở có hồ sơ riêng avs-chrome-*, đóng thì dọn, giữ cờ GPU', async () => {
  const { launchChrome: launchHw } = await import(`../render_hw.mjs?x=${Math.random()}`);
  const dirs = [], args = [];
  const pptr = {
    async launch(o) {
      dirs.push(o.userDataDir); args.push(o.args);
      return { async pages() { return [{ evaluate: async () => 'ANGLE (NVIDIA, GeForce D3D11)' }]; }, async close() {} };
    },
  };
  delete process.env.AVS_RENDER_GPU;
  const r = await launchHw(pptr, { quiet: true });
  assert.equal(r.mode, 'gpu');
  assert.equal(dirs.length, 1);
  assert.ok(path.basename(dirs[0]).startsWith(PROFILE_PREFIX));
  assert.ok(!args[0].includes('--use-angle=swiftshader'));
  assert.ok(fs.existsSync(dirs[0]));
  await r.browser.close();
  await new Promise(res => setTimeout(res, 50));
  assert.equal(fs.existsSync(dirs[0]), false);
});
