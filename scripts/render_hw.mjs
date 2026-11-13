// Hardware choices for headless rendering in one place (S07: M50, M51).
//   M50: headless Chrome draws with the GPU when there is a usable one (Windows: ANGLE on D3D11), else SwiftShader (CPU).
//        The first launch checks which WebGL renderer it really got; a software renderer (SwiftShader, WARP, llvmpipe)
//        or a failed launch falls back to SwiftShader for this process. AVS_RENDER_GPU=0 forces SwiftShader.
//   M51: render workers follow physical cores, not logical threads, and each parallel ffmpeg gets a share of the threads.
// usage: node scripts/render_hw.mjs   → prints the Chrome mode, WebGL renderer, cores and the default worker plan.
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
export const gpuWanted = (env = process.env) => !/^(0|false|off|no)$/i.test(String(env.AVS_RENDER_GPU ?? '').trim());
export const isSoftwareRenderer = r => !r || /swiftshader|llvmpipe|softpipe|software|basic render|\bwarp\b/i.test(r);
export const chromeArgs = (mode, extra = [], platform = process.platform) =>
  [...new Set([...BASE_FLAGS, ...extra, ...(mode === 'gpu' ? gpuFlags(platform) : SWIFTSHADER_FLAGS)])];

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

// One decision per process, shared by every worker: the first GPU launch that comes back as software settles it.
let decided = null;
export const chromeMode = () => decided;
// launchChrome(puppeteer, { executablePath, extra: [flags], …puppeteer.launch options }) → { browser, mode, renderer }
export async function launchChrome(puppeteer, { extra = [], quiet = false, ...opts } = {}) {
  const note = m => { if (!quiet) console.error(`[chrome] ${m}`); };
  if ((decided || (gpuWanted() ? 'gpu' : 'swiftshader')) === 'gpu') {
    let browser = null;
    try {
      browser = await puppeteer.launch({ headless: true, ...opts, args: chromeArgs('gpu', extra) });
      const renderer = await webglRenderer(browser);
      if (!isSoftwareRenderer(renderer)) { decided = 'gpu'; return { browser, mode: 'gpu', renderer }; }
      if (decided !== 'swiftshader') note(`GPU không dùng được (${renderer || 'không có WebGL'}), dùng SwiftShader`);
    } catch (e) {
      if (decided !== 'swiftshader') note(`mở Chrome với GPU lỗi (${String(e.message || e).split('\n')[0]}), dùng SwiftShader`);
    }
    await browser?.close().catch(() => {});
    decided = 'swiftshader';
  }
  const browser = await puppeteer.launch({ headless: true, ...opts, args: chromeArgs('swiftshader', extra) });
  return { browser, mode: 'swiftshader', renderer: 'SwiftShader' };
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

// ---------- CLI: what would this machine do? ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { default: puppeteer } = await import('puppeteer-core');
  const { findChrome } = await import('./platform.mjs');
  const { browser, mode, renderer } = await launchChrome(puppeteer, { executablePath: findChrome() });
  await browser.close();
  const p = renderPlan({ W: 1080, H: 1920, n: 900, fps: 30 });
  console.log(JSON.stringify({ chrome: mode, renderer, gpu_env: process.env.AVS_RENDER_GPU ?? null, physical: physicalCores(), logical: logicalCores(), render_1080p: p }, null, 2));
}
