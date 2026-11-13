// M57 (S07): optional download of chrome-headless-shell (Chrome for Testing) into $AVS_HOME/chrome-headless-shell, matching
// the installed Chrome: same build (157.0.8103.x), else the same milestone, else stable. Render workers use it when present
// (scripts/render_hw.mjs findHeadlessShell); without it they keep the installed Chrome. Older builds there are removed.
// usage: node scripts/install_headless_shell.mjs [--version 157.0.8103.51 | 157 | stable]
// Called by install.sh / install.ps1; a failure there only prints a line, the install goes on.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from './platform.mjs';
import { shellRoot, findHeadlessShell } from './render_hw.mjs';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const say = m => console.log(`[headless-shell] ${m}`);

// Version of the installed Chrome/Edge as the browser reports it ("HeadlessChrome/157.0.8103.51"); '' when unknown.
async function chromeVersion() {
  const exe = findChrome();
  if (!exe) return { exe: null, product: '', version: '' };
  const { default: puppeteer } = await import('puppeteer-core');
  const b = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-first-run'], timeout: 30000 });
  try {
    const product = await b.version();
    return { exe, product, version: (product.match(/\d+(\.\d+){3}/) || [''])[0] };
  } finally { await b.close().catch(() => {}); }
}

// Tags to try, most exact first. Edge shares the milestone with Chrome but not the build numbers.
export function buildTags(product, version, forced = null) {
  if (forced) return [forced];
  const tags = [];
  const major = version.split('.')[0];
  if (version && /chrome/i.test(product)) tags.push(version.split('.').slice(0, 3).join('.'));
  if (major) tags.push(major);
  tags.push('stable');
  return [...new Set(tags)];
}

async function main() {
  // loaded here, not at the top: the tests import buildTags on CI, which installs no node_modules
  const { install, resolveBuildId, detectBrowserPlatform, Browser, getInstalledBrowsers, uninstall } = await import('@puppeteer/browsers');
  const platform = detectBrowserPlatform();
  if (!platform) throw new Error(`nền tảng ${process.platform}/${process.arch} không có bản chrome-headless-shell`);
  let info = { product: '', version: '' };
  if (!arg('--version')) {
    try { info = await chromeVersion(); } catch (e) { say(`không đọc được phiên bản Chrome (${String(e.message || e).split('\n')[0]}), lấy bản stable`); }
  }
  let buildId = null;
  for (const tag of buildTags(info.product, info.version, arg('--version'))) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(tag)) { buildId = tag; break; }
    try { buildId = await resolveBuildId(Browser.CHROMEHEADLESSSHELL, platform, tag); } catch { buildId = null; }
    if (buildId) break;
  }
  if (!buildId) throw new Error('không tìm được bản chrome-headless-shell phù hợp');
  const cacheDir = shellRoot();
  fs.mkdirSync(cacheDir, { recursive: true });
  say(`Chrome máy này: ${info.version || 'không rõ'} → chrome-headless-shell ${buildId} (${platform})`);
  const got = await install({ browser: Browser.CHROMEHEADLESSSHELL, platform, buildId, cacheDir });
  for (const old of await getInstalledBrowsers({ cacheDir })) {
    if (old.browser === Browser.CHROMEHEADLESSSHELL && old.buildId !== buildId) {
      await uninstall({ browser: old.browser, platform: old.platform, buildId: old.buildId, cacheDir }).catch(() => {});
    }
  }
  const found = findHeadlessShell({ ...process.env, AVS_CHROME_SHELL: '' });
  say(`đã cài: ${got.executablePath}${found === got.executablePath ? '' : ` (cảnh báo: render_hw tìm thấy ${found})`}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(`[headless-shell] không cài được: ${String(e.message || e).split('\n')[0]}`); process.exit(1); });
}
