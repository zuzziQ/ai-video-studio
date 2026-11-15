// M50/M51: Chrome GPU flags with SwiftShader fallback, worker plan by physical cores (scripts/render_hw.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The M50 tests below are about GPU vs SwiftShader only: no chrome-headless-shell from this machine's $AVS_HOME.
process.env.AVS_CHROME_SHELL = '0';

const load = () => import(`../render_hw.mjs?x=${Math.random()}`); // fresh module: the GPU decision is per process

test('M50: AVS_RENDER_GPU=0/false/off tắt GPU, mặc định bật', async () => {
  const { gpuWanted } = await load();
  assert.equal(gpuWanted({}), true);
  assert.equal(gpuWanted({ AVS_RENDER_GPU: '1' }), true);
  for (const v of ['0', 'false', 'OFF', ' no ']) assert.equal(gpuWanted({ AVS_RENDER_GPU: v }), false, v);
});

test('M50: renderer phần mềm bị nhận ra, GPU thật thì không', async () => {
  const { isSoftwareRenderer } = await load();
  for (const r of ['', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
    'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)', 'llvmpipe (LLVM 15.0.7, 256 bits)'])
    assert.equal(isSoftwareRenderer(r), true, r);
  for (const r of ['ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti (0x00002182) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)'])
    assert.equal(isSoftwareRenderer(r), false, r);
});

test('M50: cờ Chrome theo chế độ và hệ điều hành', async () => {
  const { chromeArgs, BACKGROUND_FLAGS } = await load();
  const win = chromeArgs('gpu', BACKGROUND_FLAGS, 'win32');
  assert.ok(win.includes('--use-angle=d3d11') && !win.includes('--use-angle=swiftshader'));
  assert.ok(win.includes('--disable-renderer-backgrounding') && win.includes('--force-color-profile=srgb'));
  assert.ok(!chromeArgs('gpu', [], 'darwin').some(f => f.startsWith('--use-angle')));
  const sw = chromeArgs('swiftshader', [], 'win32');
  assert.ok(sw.includes('--use-angle=swiftshader') && sw.includes('--enable-unsafe-swiftshader'));
  assert.equal(new Set(win).size, win.length);
});

// Fake puppeteer: every launch records its args; the page reports `renderer` (or launch throws).
function fakePuppeteer({ renderer = 'ANGLE (NVIDIA, GeForce D3D11)', fail = false } = {}) {
  const launches = [];
  return {
    launches,
    async launch(o) {
      const gpu = !o.args.includes('--use-angle=swiftshader');
      launches.push(gpu ? 'gpu' : 'swiftshader');
      if (gpu && fail) throw new Error('GPU process crashed');
      const b = { closed: false, async pages() { return [{ evaluate: async () => (gpu ? renderer : 'SwiftShader') }]; }, async close() { b.closed = true; } };
      return b;
    },
  };
}

test('M50: có GPU thật thì giữ trình duyệt GPU, mở một lần', async () => {
  delete process.env.AVS_RENDER_GPU;
  const { launchChrome, chromeMode } = await load();
  const pp = fakePuppeteer();
  const r = await launchChrome(pp, { quiet: true });
  assert.equal(r.mode, 'gpu'); assert.deepEqual(pp.launches, ['gpu']); assert.equal(chromeMode(), 'gpu');
});

test('M50: renderer phần mềm → đóng, lùi SwiftShader, các worker sau mở thẳng SwiftShader', async () => {
  delete process.env.AVS_RENDER_GPU;
  const { launchChrome } = await load();
  const pp = fakePuppeteer({ renderer: 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11, D3D11)' });
  assert.equal((await launchChrome(pp, { quiet: true })).mode, 'swiftshader');
  assert.equal((await launchChrome(pp, { quiet: true })).mode, 'swiftshader');
  assert.deepEqual(pp.launches, ['gpu', 'swiftshader', 'swiftshader']);
});

test('M50: mở Chrome GPU lỗi → SwiftShader; AVS_RENDER_GPU=0 không thử GPU', async () => {
  delete process.env.AVS_RENDER_GPU;
  let m = await load(), pp = fakePuppeteer({ fail: true });
  assert.equal((await m.launchChrome(pp, { quiet: true })).mode, 'swiftshader');
  assert.deepEqual(pp.launches, ['gpu', 'swiftshader']);
  process.env.AVS_RENDER_GPU = '0';
  try {
    m = await load(); pp = fakePuppeteer();
    assert.equal((await m.launchChrome(pp, { quiet: true })).mode, 'swiftshader');
    assert.deepEqual(pp.launches, ['swiftshader']);
  } finally { delete process.env.AVS_RENDER_GPU; }
});

test('M51: worker theo nhân thật, tối đa 4 (3 trên 1080p), --workers ghi đè', async () => {
  const { renderPlan } = await load();
  const v = { W: 1080, H: 1920, n: 947, fps: 30 };
  assert.deepEqual(renderPlan({ ...v, physical: 6, logical: 12 }), { workers: 4, threads: 3, preset: 'veryfast' });
  assert.equal(renderPlan({ ...v, physical: 16, logical: 32 }).workers, 4);
  assert.equal(renderPlan({ ...v, physical: 4, logical: 8 }).workers, 2);
  assert.deepEqual(renderPlan({ ...v, physical: 2, logical: 4 }), { workers: 1, threads: 0, preset: 'medium' });
  assert.equal(renderPlan({ W: 2160, H: 3840, n: 900, fps: 30, physical: 16, logical: 32 }).workers, 3);
  assert.equal(renderPlan({ ...v, workers: '6', physical: 6, logical: 12 }).workers, 6);
  assert.equal(renderPlan({ ...v, workers: '6', physical: 6, logical: 12 }).threads, 2);
  assert.equal(renderPlan({ ...v, n: 45, physical: 6, logical: 12 }).workers, 2); // ≥ ~1 s of frames per worker
});

test('M51: preset: đoạn song song veryfast, một worker giữ medium, --fast/--preset ghi đè', async () => {
  const { renderPlan } = await load();
  const v = { W: 720, H: 1280, n: 947, fps: 30, physical: 6, logical: 12 };
  assert.equal(renderPlan({ ...v, workers: 1 }).preset, 'medium');
  assert.equal(renderPlan({ ...v, workers: 1, fast: true }).preset, 'veryfast');
  assert.equal(renderPlan({ ...v, preset: 'medium' }).preset, 'medium');
  assert.equal(renderPlan(v).preset, 'veryfast');
});

test('M51: đếm nhân thật từ /proc/cpuinfo (2 socket, SMT)', async () => {
  const { parseCpuinfo } = await load();
  const cpu = (p, c) => `processor\t: x\nphysical id\t: ${p}\ncore id\t\t: ${c}\n\n`;
  const text = [0, 1].flatMap(p => [0, 1, 2, 3].flatMap(c => [cpu(p, c), cpu(p, c)])).join('');
  assert.equal(parseCpuinfo(text), 8);
  assert.equal(parseCpuinfo('processor : 0\n'), 0);
});

test('M57: cờ bỏ vsync mặc định bật cho cả GPU lẫn SwiftShader, AVS_RENDER_NOVSYNC=0 tắt', async () => {
  const { chromeArgs, novsyncWanted, NOVSYNC_FLAGS } = await load();
  assert.deepEqual(NOVSYNC_FLAGS, ['--disable-gpu-vsync', '--disable-frame-rate-limit']);
  for (const mode of ['gpu', 'swiftshader']) {
    const a = chromeArgs(mode, [], 'win32', {});
    assert.ok(NOVSYNC_FLAGS.every(f => a.includes(f)), mode);
    const off = chromeArgs(mode, [], 'win32', { AVS_RENDER_NOVSYNC: '0' });
    assert.ok(!off.some(f => NOVSYNC_FLAGS.includes(f)), mode);
  }
  assert.equal(novsyncWanted({}), true);
  for (const v of ['0', 'false', 'off', 'No']) assert.equal(novsyncWanted({ AVS_RENDER_NOVSYNC: v }), false, v);
});

// $AVS_HOME/chrome-headless-shell laid out like @puppeteer/browsers installs it.
function fakeHome(versions) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-shell-'));
  const bin = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
  const exes = versions.map(v => {
    const d = path.join(home, 'chrome-headless-shell', 'chrome-headless-shell', `win64-${v}`, 'chrome-headless-shell-win64');
    fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, bin), ''); return path.join(d, bin);
  });
  return { home, exes };
}

test('M57: tìm chrome-headless-shell trong $AVS_HOME (bản mới nhất), AVS_CHROME_SHELL ghi đè hoặc tắt', async () => {
  const { findHeadlessShell } = await load();
  const { home, exes } = fakeHome(['156.0.8078.80', '157.0.8103.50', '99.0.1.2']);
  try {
    assert.equal(findHeadlessShell({ AVS_HOME: home }), exes[1]);
    assert.equal(findHeadlessShell({ AVS_HOME: home, AVS_CHROME_SHELL: '0' }), null);
    assert.equal(findHeadlessShell({ AVS_HOME: home, AVS_CHROME_SHELL: exes[0] }), exes[0]);
    assert.equal(findHeadlessShell({ AVS_HOME: home, AVS_CHROME_SHELL: path.join(home, 'missing.exe') }), null);
    assert.equal(findHeadlessShell({ AVS_HOME: path.join(home, 'empty') }), null);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

// Fake puppeteer that tells the shell from Chrome by executablePath; records `<exe>:<mode>:<headless>`.
function fakeLaunch({ shellFails = false, shellSoftware = false, chromeSoftware = false } = {}) {
  const launches = [];
  return {
    launches,
    async launch(o) {
      const gpu = !o.args.includes('--use-angle=swiftshader'), shell = /headless-shell/.test(o.executablePath);
      launches.push(`${shell ? 'shell' : 'chrome'}:${gpu ? 'gpu' : 'sw'}:${o.headless}`);
      if (shell && shellFails) throw new Error('spawn UNKNOWN');
      const soft = !gpu || (shell ? shellSoftware : chromeSoftware);
      return { async pages() { return [{ evaluate: async () => (soft ? 'SwiftShader' : 'ANGLE (NVIDIA, D3D11)') }]; }, async close() {} };
    },
  };
}
async function withShell(fn) {
  const { home, exes } = fakeHome(['157.0.8103.50']);
  const saved = process.env.AVS_CHROME_SHELL;
  process.env.AVS_CHROME_SHELL = exes[0]; delete process.env.AVS_RENDER_GPU;
  try { await fn(exes[0]); } finally { process.env.AVS_CHROME_SHELL = saved; fs.rmSync(home, { recursive: true, force: true }); }
}
const CHROME = 'C:/Chrome/chrome.exe';

test('M57: có headless-shell thì worker mở nó (headless: shell), giữ GPU; shell:false bỏ qua', async () => withShell(async exe => {
  const { launchChrome } = await load();
  const pp = fakeLaunch();
  const r = await launchChrome(pp, { quiet: true, executablePath: CHROME });
  assert.equal(r.mode, 'gpu'); assert.equal(r.shell, true); assert.equal(r.executablePath, exe);
  await launchChrome(pp, { quiet: true, executablePath: CHROME });
  assert.deepEqual(pp.launches, ['shell:gpu:shell', 'shell:gpu:shell']);
  const plain = await launchChrome(pp, { quiet: true, executablePath: CHROME, shell: false });
  assert.equal(plain.shell, false); assert.equal(pp.launches.at(-1), 'chrome:gpu:true');
}));

test('M57: headless-shell mở lỗi → lùi Chrome cài sẵn, các worker sau không thử lại', async () => withShell(async () => {
  const { launchChrome } = await load();
  const pp = fakeLaunch({ shellFails: true });
  const r = await launchChrome(pp, { quiet: true, executablePath: CHROME });
  assert.equal(r.mode, 'gpu'); assert.equal(r.shell, false); assert.equal(r.executablePath, CHROME);
  await launchChrome(pp, { quiet: true, executablePath: CHROME });
  assert.deepEqual(pp.launches, ['shell:gpu:shell', 'chrome:gpu:true', 'chrome:gpu:true']);
}));

test('M57: headless-shell mở lỗi cả khi SwiftShader → Chrome SwiftShader', async () => withShell(async () => {
  process.env.AVS_RENDER_GPU = '0';
  try {
    const { launchChrome } = await load();
    const pp = fakeLaunch({ shellFails: true });
    const r = await launchChrome(pp, { quiet: true, executablePath: CHROME });
    assert.equal(r.mode, 'swiftshader'); assert.equal(r.shell, false);
    assert.deepEqual(pp.launches, ['shell:sw:shell', 'chrome:sw:true']);
  } finally { delete process.env.AVS_RENDER_GPU; }
}));

test('M57: chỉ Chrome có GPU → Chrome GPU; cả hai phần mềm → SwiftShader trên headless-shell', async () => withShell(async () => {
  let m = await load(), pp = fakeLaunch({ shellSoftware: true });
  let r = await m.launchChrome(pp, { quiet: true, executablePath: CHROME });
  assert.equal(r.mode, 'gpu'); assert.equal(r.shell, false);
  await m.launchChrome(pp, { quiet: true, executablePath: CHROME });
  assert.deepEqual(pp.launches, ['shell:gpu:shell', 'chrome:gpu:true', 'chrome:gpu:true']);
  m = await load(); pp = fakeLaunch({ shellSoftware: true, chromeSoftware: true });
  r = await m.launchChrome(pp, { quiet: true, executablePath: CHROME });
  assert.equal(r.mode, 'swiftshader'); assert.equal(r.shell, true);
  await m.launchChrome(pp, { quiet: true, executablePath: CHROME });
  assert.deepEqual(pp.launches, ['shell:gpu:shell', 'chrome:gpu:true', 'shell:sw:shell', 'shell:sw:shell']);
}));

test('M57: không có headless-shell trong $AVS_HOME → Chrome như cũ', async () => {
  const { home } = fakeHome([]);
  const saved = { s: process.env.AVS_CHROME_SHELL, h: process.env.AVS_HOME };
  delete process.env.AVS_CHROME_SHELL; process.env.AVS_HOME = home;
  try {
    const { launchChrome } = await load();
    const pp = fakeLaunch();
    const r = await launchChrome(pp, { quiet: true, executablePath: CHROME });
    assert.equal(r.shell, false); assert.deepEqual(pp.launches, ['chrome:gpu:true']);
  } finally {
    process.env.AVS_CHROME_SHELL = saved.s;
    if (saved.h === undefined) delete process.env.AVS_HOME; else process.env.AVS_HOME = saved.h;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('M57: bộ cài chọn bản headless-shell theo Chrome máy này', async () => {
  const { buildTags } = await import('../install_headless_shell.mjs');
  assert.deepEqual(buildTags('HeadlessChrome/157.0.8103.51', '157.0.8103.51'), ['157.0.8103', '157', 'stable']);
  assert.deepEqual(buildTags('HeadlessEdg/157.0.3400.12', '157.0.3400.12'), ['157', 'stable']);
  assert.deepEqual(buildTags('', ''), ['stable']);
  assert.deepEqual(buildTags('', '', '156'), ['156']);
});

test('M69: đoạn của mỗi worker dài số micro giây chẵn, phủ đủ khung, không chồng', async () => {
  const { segmentRanges } = await import('../render_hw.mjs');
  for (const [n, w, fps] of [[947, 3, 30], [947, 2, 30], [947, 4, 30], [10, 4, 30], [100, 3, 24], [100, 3, 25], [900, 6, 60], [5, 8, 30], [301, 3, 29.97]]) {
    const r = segmentRanges(n, w, fps);
    assert.ok(r.length >= 1 && r.length <= w, `${n}/${w}: ${r.length} đoạn`);
    assert.equal(r[0][0], 0); assert.equal(r.at(-1)[1], n);
    for (let i = 1; i < r.length; i++) assert.equal(r[i][0], r[i - 1][1]);
    if (Number.isInteger(fps)) for (const [a, b] of r.slice(0, -1)) assert.equal(((b - a) * 1e6) % fps, 0, `${n}/${w}@${fps}: ${b - a} khung`);
  }
  assert.deepEqual(segmentRanges(947, 3, 30), [[0, 318], [318, 636], [636, 947]]); // trước M69: 316 khung → lệch pts
  assert.deepEqual(segmentRanges(947, 4, 30).map(([a, b]) => b - a), [237, 237, 237, 236]); // 237 đã chẵn: không đổi
});
