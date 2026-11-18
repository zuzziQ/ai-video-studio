// Hồ sơ (profile) Chrome chạy ngầm do Studio tự quản, thay cho thư mục tạm puppeteer tự tạo.
//
// Vì sao: không truyền userDataDir thì puppeteer-core tạo %TEMP%/puppeteer_dev_chrome_profile-* và tự xoá khi Chrome thoát.
// Trên Windows Chrome (crashpad) còn giữ khoá file vài giây sau khi bị kill → rm lỗi EBUSY. Khi Chrome không khởi động
// được (quá giờ chờ WS endpoint), puppeteer gọi `void browserCloseCallback()` nên lỗi EBUSY thành unhandled rejection
// và làm sập cả server Studio (M149, /api/elem/shots). Truyền userDataDir riêng thì puppeteer không xoá nữa; ta xoá có
// thử lại, xoá không được thì để lại cho lần dọn sau (sweepProfiles), không bao giờ ném lỗi ra ngoài.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PROFILE_PREFIX = 'avs-chrome-';
export const profileRoot = () => os.tmpdir();

// Xoá một hồ sơ; Windows còn khoá file thì thử lại, vẫn không được → false (để sweepProfiles dọn sau). Không ném lỗi.
export async function removeProfile(dir, { rm = fs.promises.rm, tries = 6, delayMs = 250 } = {}) {
  if (!dir || !path.basename(dir).startsWith(PROFILE_PREFIX)) return false;
  for (let i = 0; i < tries; i++) {
    try { await rm(dir, { recursive: true, force: true }); return true; }
    catch (e) {
      if (!['EBUSY', 'EPERM', 'ENOTEMPTY', 'EACCES'].includes(e?.code)) return false;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  return false;
}

// Dọn hồ sơ cũ còn sót (Chrome đã thoát từ lâu nên hết khoá). Chạy nền, không ném lỗi.
export async function sweepProfiles({ root = profileRoot(), maxAgeMs = 60 * 60 * 1000, now = Date.now(), rm } = {}) {
  let names = [];
  try { names = await fs.promises.readdir(root); } catch { return 0; }
  let n = 0;
  for (const name of names) {
    if (!name.startsWith(PROFILE_PREFIX)) continue;
    const dir = path.join(root, name);
    try { if (now - (await fs.promises.stat(dir)).mtimeMs < maxAgeMs) continue; } catch { continue; }
    if (await removeProfile(dir, { rm, tries: 1 })) n++;
  }
  return n;
}

// puppeteer.launch với hồ sơ riêng. Lỗi khởi động → Error rõ ràng (.reason = 'launch', .code = 'CHROME_START'),
// hồ sơ được dọn ở nền; Chrome đóng (close hoặc tự chết) → hồ sơ được dọn ở nền.
export async function launchChrome(puppeteer, opts = {}, { root = profileRoot(), rm } = {}) {
  sweepProfiles({ root, rm }).catch(() => {});
  let dir;
  try { dir = fs.mkdtempSync(path.join(root, PROFILE_PREFIX)); }
  catch (e) { throw Object.assign(new Error(`Không tạo được thư mục tạm cho Chrome: ${e.message}`), { reason: 'launch', code: 'CHROME_START' }); }
  let browser;
  try { browser = await puppeteer.launch({ ...opts, userDataDir: dir }); }
  catch (e) {
    removeProfile(dir, { rm }).catch(() => {});
    const msg = String(e?.message || e).split('\n')[0].slice(0, 160);
    throw Object.assign(new Error(`Chrome chạy ngầm không khởi động được (${msg})`), { reason: 'launch', code: 'CHROME_START', cause: e });
  }
  let cleaned = false;
  const clean = () => { if (cleaned) return; cleaned = true; removeProfile(dir, { rm }).catch(() => {}); };
  if (typeof browser?.once === 'function') browser.once('disconnected', clean);
  if (typeof browser?.close === 'function') {
    const close = browser.close.bind(browser);
    browser.close = async () => { try { await close(); } finally { clean(); } };
  }
  browser.profileDir = dir;
  return browser;
}
