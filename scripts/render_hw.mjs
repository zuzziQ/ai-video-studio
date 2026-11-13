// Hardware choices for headless rendering in one place (S07: M50, M51).
//   M50: headless Chrome draws with the GPU when there is a usable one (Windows: ANGLE on D3D11), else SwiftShader (CPU).
//        The first launch checks which WebGL renderer it really got; a software renderer (SwiftShader, WARP, llvmpipe)
//        or a failed launch falls back to SwiftShader for this process. AVS_RENDER_GPU=0 forces SwiftShader.
//   M51: render workers follow physical cores, not logical threads, and each parallel ffmpeg gets a share of the threads.
//   M57: Chrome does not wait for vsync (--disable-gpu-vsync --disable-frame-rate-limit: a capture waited ~2–3 compositor
//        frames at 60 Hz); AVS_RENDER_NOVSYNC=0 turns that off. chrome-headless-shell is used when found
//        ($AVS_HOME/chrome-headless-shell, installed by scripts/install_headless_shell.mjs, or AVS_CHROME_SHELL=<exe>;
//        AVS_CHROME_SHELL=0 never uses it); it falls back to the installed Chrome when it is missing or fails to launch.
//   M52: H.264 encoder for render.mjs / export_multi.mjs: NVENC / QSV / VideoToolbox after a cached test encode, else
//        libx264 (pickEncoder). AVS_ENCODER=auto|nvenc|qsv|videotoolbox|x264.
// usage: node scripts/render_hw.mjs   → prints the Chrome mode, WebGL renderer, executable, vsync, cores, worker plan, encoder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ---------- Chrome flags ----------
export const BASE_FLAGS = ['--allow-file-access-from-files', '--force-color-profile=srgb', '--hide-scrollbars'];
// Pages that must keep animating while not focused (render workers, HyperFrames import).
export const BACKGROUND_FLAGS = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
// WebGL everywhere (3D HyperFrames blocks), drawn on the CPU.
export const SWIFTSHADER_FLAGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export function gpuFlags(platform = process.platform) {
  // Windows: D3D11 is what ANGLE ships best; macOS (Metal) and Linux keep Chrome's own default backend.
  // --enable-unsafe-swiftshader stays so WebGL still exists if Chrome drops to software; the renderer check catches that.
  return [...(platform === 'win32' ? ['--use-angle=d3d11'] : []), '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'];
}
const OFF = /^(0|false|off|no)$/i;
export const gpuWanted = (env = process.env) => !OFF.test(String(env.AVS_RENDER_GPU ?? '').trim());
// M57: frames are drawn on demand (renderFrame + captureScreenshot), so pacing them to vsync only adds latency.
export const NOVSYNC_FLAGS = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];
export const novsyncWanted = (env = process.env) => !OFF.test(String(env.AVS_RENDER_NOVSYNC ?? '').trim());
export const isSoftwareRenderer = r => !r || /swiftshader|llvmpipe|softpipe|software|basic render|\bwarp\b/i.test(r);
export const chromeArgs = (mode, extra = [], platform = process.platform, env = process.env) =>
  [...new Set([...BASE_FLAGS, ...(novsyncWanted(env) ? NOVSYNC_FLAGS : []), ...extra, ...(mode === 'gpu' ? gpuFlags(platform) : SWIFTSHADER_FLAGS)])];

// ---------- chrome-headless-shell (M57) ----------
export const avsHome = (env = process.env) => env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio');
export const shellRoot = (env = process.env) => path.join(avsHome(env), 'chrome-headless-shell');
const SHELL_BIN = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
const verKey = v => (v.match(/\d+/g) || []).map(Number);
const byVersionDesc = (a, b) => { const x = verKey(a), y = verKey(b); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0); return 0; };
// AVS_CHROME_SHELL=<exe> wins, =0 disables; else the newest build in $AVS_HOME/chrome-headless-shell, laid out the way
// @puppeteer/browsers installs it: chrome-headless-shell/<platform>-<version>/chrome-headless-shell-<platform>/<bin>.
export function findHeadlessShell(env = process.env) {
  const pick = String(env.AVS_CHROME_SHELL ?? '').trim();
  if (OFF.test(pick)) return null;
  if (pick) return fs.existsSync(pick) ? pick : null;
  const root = path.join(shellRoot(env), 'chrome-headless-shell');
  let builds = [];
  try { builds = fs.readdirSync(root).sort(byVersionDesc); } catch { return null; }
  for (const b of builds) {
    let subs = [];
    try { subs = fs.readdirSync(path.join(root, b)).filter(d => d.startsWith('chrome-headless-shell')); } catch { continue; }
    for (const d of subs) { const exe = path.join(root, b, d, SHELL_BIN); if (fs.existsSync(exe)) return exe; }
  }
  return null;
}

// WebGL renderer string of a fresh browser ('' = no WebGL), read on its first tab.
async function webglRenderer(browser) {
  const page = (await browser.pages())[0] || await browser.newPage();
  return page.evaluate(() => {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return r;
  });
}

// One decision per process, shared by every worker: the first GPU launch that comes back as software settles the mode, and
// the executable is settled the same way (headless-shell that fails to launch, or only Chrome gets the GPU → Chrome).
let decided = null;
let shellState = null; // null = not tried yet, false = not used in this process, string = the shell in use
export const chromeMode = () => decided;
const errLine = e => String(e?.message || e).split('\n')[0];
// launchChrome(puppeteer, { executablePath, extra: [flags], shell, …puppeteer.launch options })
//   → { browser, mode, renderer, executablePath, shell }   (shell:false = never try chrome-headless-shell)
export async function launchChrome(puppeteer, { extra = [], quiet = false, shell = true, ...opts } = {}) {
  const note = m => { if (!quiet) console.error(`[chrome] ${m}`); };
  const shellExe = shell && shellState !== false ? (shellState || findHeadlessShell()) : null;
  const chrome = opts.executablePath;
  const open = (exe, mode) => puppeteer.launch({ headless: true, ...opts, ...(exe === shellExe ? { headless: 'shell' } : {}), executablePath: exe, args: chromeArgs(mode, extra) });
  const done = (browser, mode, renderer, exe) => {
    decided = mode;
    if (shellExe) shellState = exe === shellExe ? shellExe : false; // Chrome won over the shell: do not try it again
    return { browser, mode, renderer, executablePath: exe, shell: !!shellExe && exe === shellExe };
  };
  const exes = [shellExe, chrome].filter((e, i, a) => e && a.indexOf(e) === i);
  if (!exes.length) exes.push(chrome); // no executable at all: let puppeteer report it
  let shellBroken = false;
  const shellFailed = e => { shellBroken = true; note(`chrome-headless-shell không mở được (${errLine(e)}), dùng Chrome`); };
  if ((decided || (gpuWanted() ? 'gpu' : 'swiftshader')) === 'gpu') {
    let why = '';
    for (const exe of exes) {
      let browser = null;
      try {
        browser = await open(exe, 'gpu');
        const renderer = await webglRenderer(browser);
        if (!isSoftwareRenderer(renderer)) return done(browser, 'gpu', renderer, exe);
        why = renderer || 'không có WebGL';
      } catch (e) {
        why = `mở lỗi: ${errLine(e)}`;
        if (shellExe && exe === shellExe) shellFailed(e);
      }
      await browser?.close().catch(() => {});
    }
    if (decided !== 'swiftshader') note(`GPU không dùng được (${why}), dùng SwiftShader`);
  }
  for (const exe of exes) {
    if (shellBroken && exe === shellExe) continue;
    try {
      return done(await open(exe, 'swiftshader'), 'swiftshader', 'SwiftShader', exe);
    } catch (e) {
      if (!shellExe || exe !== shellExe || exe === exes[exes.length - 1]) throw e;
      shellFailed(e);
    }
  }
  throw new Error('không mở được Chrome');
}

// ---------- cores and workers ----------
const logicalCores = () => (os.availableParallelism ? os.availableParallelism() : os.cpus().length) || 1;
// Physical cores: CIM on Windows (cached in the temp dir, PowerShell takes ~0.5 s), sysctl on macOS, /proc/cpuinfo on
// Linux; anything unknown → half the logical threads (SMT is the common case).
export function parseCpuinfo(text) {
  const pairs = new Set(); let phys = '0';
  for (const line of text.split(/\r?\n/)) {
    const m = /^(physical id|core id)\s*:\s*(\d+)/.exec(line);
    if (m && m[1] === 'physical id') phys = m[2]; else if (m) pairs.add(`${phys}:${m[2]}`);
  }
  return pairs.size;
}
let PHYS = null;
export function physicalCores() {
  if (PHYS) return PHYS;
  const logical = logicalCores();
  let n = 0;
  try {
    if (process.platform === 'win32') {
      const cache = path.join(os.tmpdir(), 'avs-cpu-cores.json'), key = `${os.cpus()[0]?.model}|${logical}`;
      try { const c = JSON.parse(fs.readFileSync(cache, 'utf8')); if (c.key === key) n = +c.cores; } catch { /* no cache yet */ }
      if (!n) {
        const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_Processor | Measure-Object NumberOfCores -Sum).Sum'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
        n = parseInt(r.stdout, 10) || 0;
        if (n) try { fs.writeFileSync(cache, JSON.stringify({ key, cores: n })); } catch { /* read-only temp */ }
      }
    } else if (process.platform === 'darwin') {
      n = parseInt(spawnSync('sysctl', ['-n', 'hw.physicalcpu'], { encoding: 'utf8', timeout: 3000 }).stdout, 10) || 0;
    } else {
      n = parseCpuinfo(fs.readFileSync('/proc/cpuinfo', 'utf8'));
    }
  } catch { n = 0; }
  return (PHYS = n > 0 && n <= logical ? n : Math.max(1, Math.ceil(logical / 2)));
}

// Worker plan for render.mjs. Each worker is a whole Chrome plus an x264, so the default leaves 2 physical cores free and
// stops at 4 (measured on 6 cores / 12 threads: 4 GPU workers beat 6; with SwiftShader 3–4 beat 6), 3 above 1080p.
// Never less than ~1 s of frames per worker. Parallel segments split the logical threads between their ffmpegs and use
// x264 veryfast (SSIM 0.994 vs medium, ~2.4× less CPU); one worker writes the final file itself and keeps medium.
export function renderPlan({ W, H, n, fps, workers = null, fast = false, preset = null, physical = physicalCores(), logical = logicalCores() }) {
  const auto = Math.max(1, Math.min(W * H > 2.5e6 ? 3 : 4, physical - 2));
  const w = Math.max(1, Math.min(Math.floor(+workers) || auto, Math.ceil(n / fps)));
  return {
    workers: w,
    threads: w > 1 ? Math.max(1, Math.floor(logical / w)) : 0, // 0 = let ffmpeg decide
    preset: preset || (fast || w > 1 ? 'veryfast' : 'medium'),
  };
}

// ---------- video encoder (M52) ----------
// Hardware H.264 when this ffmpeg + driver can really open it, else libx264. One short test encode per encoder, cached in
// $AVS_HOME/encoders.json under a key of the ffmpeg version, OS and GPU driver (a driver or ffmpeg update probes again).
// AVS_ENCODER=auto (default) | nvenc | qsv | videotoolbox | x264. A forced hardware encoder that fails its probe still falls
// back to libx264 (with one line on stderr), so a render never dies for want of a GPU encoder.
export const ENCODERS = { nvenc: 'h264_nvenc', qsv: 'h264_qsv', videotoolbox: 'h264_videotoolbox', x264: 'libx264' };
const ALIAS = { '': 'auto', auto: 'auto', nvenc: 'nvenc', h264_nvenc: 'nvenc', nvidia: 'nvenc', qsv: 'qsv', h264_qsv: 'qsv', intel: 'qsv',
  videotoolbox: 'videotoolbox', h264_videotoolbox: 'videotoolbox', vt: 'videotoolbox', x264: 'x264', libx264: 'x264', cpu: 'x264', '0': 'x264', off: 'x264' };
export function encoderWanted(env = process.env) {
  const v = String(env.AVS_ENCODER ?? '').trim().toLowerCase();
  return ALIAS[v] || 'auto';
}
// Hardware encoders worth trying on this OS, best first.
export const hwCandidates = (platform = process.platform) => (platform === 'darwin' ? ['videotoolbox'] : ['nvenc', 'qsv']);
// Where auto uses the hardware encoder (measured on GTX 1660 Ti, docs/perf/2026-11-13-m52-nvenc.md).
export const AUTO_USES = new Set(['segment', 'final', 'derive']);

// NVENC quality (cq) per x264 crf: chosen so SSIM vs the x264 file stays ≥ 0.98 at a similar size (report M52, mục 3).
export const NVENC_CQ_OFFSET = 6;
// encoderArgs(kind, { preset: x264 preset, crf, threads }) → ffmpeg output args for the video stream.
export function encoderArgs(kind, { preset = 'medium', crf = 17, threads = 0 } = {}) {
  switch (kind) {
    case 'nvenc': return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', String(crf + NVENC_CQ_OFFSET), '-b:v', '0',
      '-spatial-aq', '1', '-bf', '3', '-profile:v', 'high', '-pix_fmt', 'yuv420p'];
    // qsv / videotoolbox: not measured on the M52 machine; constant-quality modes roughly matching crf.
    case 'qsv': return ['-c:v', 'h264_qsv', '-preset', 'medium', '-global_quality', String(crf + 3), '-profile:v', 'high', '-pix_fmt', 'nv12'];
    case 'videotoolbox': return ['-c:v', 'h264_videotoolbox', '-q:v', String(Math.max(1, Math.min(100, 100 - crf * 2))), '-profile:v', 'high', '-pix_fmt', 'yuv420p'];
    default: return ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p', ...(threads ? ['-threads', String(threads)] : [])];
  }
}
export const encoderLabel = (kind, preset) => (kind === 'x264' ? `x264 ${preset}` : kind);

const firstLine = s => String(s || '').split(/\r?\n/).find(l => l.trim())?.trim() || '';
// Key for the probe cache: ffmpeg build, OS, and the NVIDIA driver when nvidia-smi exists (QSV/VideoToolbox ride on the OS).
export function encoderKey({ run = spawnSync, platform = process.platform } = {}) {
  const ff = firstLine(run('ffmpeg', ['-hide_banner', '-version'], { encoding: 'utf8', timeout: 8000, windowsHide: true })?.stdout);
  let drv = '';
  if (platform !== 'darwin') {
    try { drv = firstLine(run('nvidia-smi', ['--query-gpu=driver_version', '--format=csv,noheader'], { encoding: 'utf8', timeout: 8000, windowsHide: true })?.stdout); } catch { /* no NVIDIA */ }
  }
  return `${ff}|${platform}-${os.release()}|nvidia ${drv || '-'}`;
}
// One tiny encode with the same args the render uses. → { ok, err }
export function probeEncoder(kind, { run = spawnSync } = {}) {
  const r = run('ffmpeg', ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=320x240:r=30', '-frames:v', '8', ...encoderArgs(kind), '-f', 'null', '-'],
    { encoding: 'utf8', timeout: 20000, windowsHide: true });
  const ok = !r?.error && r?.status === 0;
  return { ok, err: ok ? '' : firstLine(r?.error?.message || r?.stderr) || `ffmpeg exit ${r?.status}` };
}
export const encoderCachePath = (env = process.env) => path.join(avsHome(env), 'encoders.json');
// Probe result for one encoder, from the cache when the key matches (a probe costs ~0.1–0.4 s: a GPU init each time).
export function encoderUsable(kind, { env = process.env, key = null, run = spawnSync, cachePath = encoderCachePath(env) } = {}) {
  key ??= encoderKey({ run });
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch { /* none yet */ }
  if (cache.key !== key || typeof cache.results !== 'object' || !cache.results) cache = { key, results: {} };
  if (!cache.results[kind]) {
    cache.results[kind] = { ...probeEncoder(kind, { run }), at: new Date().toISOString() };
    try { fs.mkdirSync(path.dirname(cachePath), { recursive: true }); fs.writeFileSync(cachePath, JSON.stringify(cache, null, 1)); } catch { /* read-only home: probe again next time */ }
  }
  return cache.results[kind];
}

// pickEncoder({ use: 'segment' | 'final' | 'derive' }) → { kind, why }. Decided once per process and use.
const picked = new Map();
export function pickEncoder({ use = 'final', env = process.env, platform = process.platform, run = spawnSync, cachePath, quiet = false } = {}) {
  const memo = `${use}|${encoderWanted(env)}`, real = run === spawnSync && !cachePath;
  if (real && picked.has(memo)) return picked.get(memo);
  const want = encoderWanted(env), note = m => { if (!quiet) console.error(`[encoder] ${m}`); };
  let res = null;
  if (want === 'x264') res = { kind: 'x264', why: 'AVS_ENCODER=x264' };
  else {
    const tries = want === 'auto' ? (AUTO_USES.has(use) ? hwCandidates(platform) : []) : [want];
    const key = tries.length ? encoderKey({ run, platform }) : '';
    for (const kind of tries) {
      const r = encoderUsable(kind, { env, key, run, cachePath: cachePath || encoderCachePath(env) });
      if (r.ok) { res = { kind, why: want === 'auto' ? 'auto' : `AVS_ENCODER=${want}` }; break; }
      if (want !== 'auto') note(`${ENCODERS[kind]} không dùng được (${r.err}), dùng libx264`);
    }
    res ||= { kind: 'x264', why: tries.length ? 'không có encoder phần cứng dùng được' : 'auto' };
  }
  if (real) picked.set(memo, res);
  return res;
}

// ---------- CLI: what would this machine do? ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { default: puppeteer } = await import('puppeteer-core');
  const { findChrome } = await import('./platform.mjs');
  const { browser, mode, renderer, executablePath, shell } = await launchChrome(puppeteer, { executablePath: findChrome() });
  const version = await browser.version().catch(() => '');
  await browser.close();
  const p = renderPlan({ W: 1080, H: 1920, n: 900, fps: 30 });
  console.log(JSON.stringify({
    chrome: mode, renderer, executable: shell ? 'chrome-headless-shell' : 'chrome', executable_path: executablePath, version,
    vsync: novsyncWanted() ? 'off (--disable-gpu-vsync --disable-frame-rate-limit)' : 'on',
    gpu_env: process.env.AVS_RENDER_GPU ?? null, novsync_env: process.env.AVS_RENDER_NOVSYNC ?? null, shell_env: process.env.AVS_CHROME_SHELL ?? null,
    physical: physicalCores(), logical: logicalCores(), render_1080p: p,
    encoder_env: process.env.AVS_ENCODER ?? null, encoder_cache: encoderCachePath(),
    encoder: Object.fromEntries(['segment', 'final', 'derive'].map(u => [u, pickEncoder({ use: u })])),
  }, null, 2));
}
