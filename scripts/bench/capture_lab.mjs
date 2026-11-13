// M56 (S07): capture-path lab. Measures cheaper ways to get a frame out of headless Chrome WITHOUT touching the real
// render path (scripts/render.mjs, scripts/render_hw.mjs are only imported). Report: docs/perf/2026-11-13-m56-capture.md.
//
// usage (from the repo; project = a copy of sample/clip-mau with work/frames extracted, see the report §1):
//   node scripts/bench/capture_lab.mjs frames  <timeline.json> --out DIR [--n 60] [--modes cur,jpeg80,...] [--shell] [--pipe]
//        one Chrome, n frames spread over the video, every capture mode in turn (2 rounds, order reversed in round 2):
//        renderFrame ms, capture ms, bytes; SSIM of each mode against lossless PNG and against the current path (cur).
//   node scripts/bench/capture_lab.mjs full    <timeline.json> <out.mp4> [--mode cur] [--workers N] [--shell] [--pipe]
//        whole video like render.mjs (same worker split, same x264 settings, no audio) with capture mode M.
//   node scripts/bench/capture_lab.mjs screencast <timeline.json> --out DIR [--n 120] [--from 5]
//        Page.startScreencast driven by the existing seek (renderFrame(t) then wait for the next frame): frames kept,
//        timeouts (no frame = dropped), wrong frames (SSIM against a captureScreenshot PNG of the same t).
//   node scripts/bench/capture_lab.mjs beginframe <timeline.json> --out DIR [--n 60]
//        chrome-headless-shell + --enable-begin-frame-control + HeadlessExperimental.beginFrame with a screenshot.
//   node scripts/bench/capture_lab.mjs overlay <timeline.json> --out DIR [--n 60] [--run 150]
//        transparent page, A-roll images hidden, capture with alpha (PNG / WebP): capture ms, share of transparent
//        pixels, identical consecutive overlay frames over a run of `run` frames, ffmpeg composite on the A-roll frames
//        and its SSIM against the normal capture.
//   node scripts/bench/capture_lab.mjs overlay-full <timeline.json> <out.mp4> [--workers N] [--fmt png|webp]
//        whole video: alpha capture piped to ffmpeg, overlaid on the A-roll frame sequence (identity mapping: only valid
//        for one clip starting at 0, speed 1 — the real mapping would have to come from engine layoutClips).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { findChrome } from '../platform.mjs';
import { interceptCdn } from '../net_cache.mjs';
import { launchChrome, renderPlan, BACKGROUND_FLAGS, chromeArgs } from '../render_hw.mjs';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = k => args.includes(k);
const here = path.dirname(fileURLToPath(import.meta.url));
const engineUrl = pathToFileURL(path.join(here, '..', '..', 'engine', 'index.html')).href;

// ---------- capture modes (Page.captureScreenshot params) ----------
const FAST = { optimizeForSpeed: true, captureBeyondViewport: false, fromSurface: true };
export const MODES = {
  cur: { format: 'jpeg', quality: 93, ...FAST }, // what render.mjs does today
  'jpeg93-noopt': { format: 'jpeg', quality: 93, captureBeyondViewport: false, fromSurface: true },
  'jpeg93-beyond': { format: 'jpeg', quality: 93, optimizeForSpeed: true, fromSurface: true, captureBeyondViewport: true },
  'jpeg93-nosurface': { format: 'jpeg', quality: 93, optimizeForSpeed: true, captureBeyondViewport: false, fromSurface: false },
  jpeg85: { format: 'jpeg', quality: 85, ...FAST },
  jpeg80: { format: 'jpeg', quality: 80, ...FAST },
  jpeg70: { format: 'jpeg', quality: 70, ...FAST },
  webp90: { format: 'webp', quality: 90, ...FAST },
  webp75: { format: 'webp', quality: 75, ...FAST },
  png: { format: 'png', ...FAST },
  'png-noopt': { format: 'png', captureBeyondViewport: false, fromSurface: true },
  // Decomposition only (no SSIM): a 16×16 clip = fixed cost of producing a compositor frame + one CDP round trip;
  // cur-again = a second capture of the same, already painted frame (no new raster).
  tiny: { format: 'jpeg', quality: 93, ...FAST, clip: { x: 0, y: 0, width: 16, height: 16, scale: 1 } },
  'cur-again': { format: 'jpeg', quality: 93, ...FAST },
};
const NO_SSIM = new Set(['tiny', 'cur-again']);
const ext = m => (MODES[m]?.format || m).replace('jpeg', 'jpg');
const codec = f => ({ jpeg: 'mjpeg', png: 'png', webp: 'webp' }[f]);

// ---------- project ----------
function loadTimeline(tlPath) {
  const tlDir = path.dirname(path.resolve(tlPath));
  const tl = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
  tl.base = pathToFileURL(tlDir).href + '/';
  if (typeof tl.captions === 'string') tl.captions = JSON.parse(fs.readFileSync(path.resolve(tlDir, tl.captions), 'utf8'));
  if (tl.aroll && !tl.aroll.count) tl.aroll.count = fs.readdirSync(path.resolve(tlDir, path.dirname(tl.aroll.frames))).filter(f => f.endsWith('.jpg')).length;
  return { tl, tlDir, W: tl.width || 1280, H: tl.height || 720, fps: tl.fps || 30 };
}
const shellPath = () => {
  const root = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome-headless-shell');
  for (const v of fs.existsSync(root) ? fs.readdirSync(root).sort().reverse() : []) {
    for (const sub of ['chrome-headless-shell-win64', 'chrome-headless-shell-linux64', 'chrome-headless-shell-mac-x64', 'chrome-headless-shell-mac-arm64']) {
      for (const exe of ['chrome-headless-shell.exe', 'chrome-headless-shell']) { const p = path.join(root, v, sub, exe); if (fs.existsSync(p)) return p; }
    }
  }
  throw new Error('chrome-headless-shell not found (npx @puppeteer/browsers install chrome-headless-shell@stable)');
};

// Same launch as render.mjs (launchChrome: GPU when usable), optionally headless-shell or a pipe transport.
// --chrome-flags "--a --b": extra Chrome switches for this run (e.g. --disable-gpu-vsync --disable-frame-rate-limit).
const CLI_FLAGS = (opt('--chrome-flags', '') || '').split(/\s+/).filter(Boolean);
async function openPage(P, { shell = flag('--shell'), pipe = flag('--pipe'), extra = CLI_FLAGS } = {}) {
  const launchOpts = { executablePath: shell ? shellPath() : findChrome(), extra: [...BACKGROUND_FLAGS, ...extra], quiet: true, pipe };
  if (shell) launchOpts.headless = 'shell';
  const { browser, mode, renderer } = await launchChrome(puppeteer, launchOpts);
  const page = (await browser.pages())[0] || await browser.newPage();
  await setupPage(page, P);
  const cdp = await page.createCDPSession();
  return { browser, page, cdp, mode, renderer };
}
async function setupPage(page, P) {
  await page.setViewport({ width: P.W, height: P.H, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
  await interceptCdn(page);
  await page.goto(engineUrl, { waitUntil: 'networkidle0' });
  await page.evaluate(t => window.init(t), P.tl);
}
const renderFrame = (page, t) => page.evaluate(x => window.renderFrame(x), t);
const capture = async (cdp, mode) => Buffer.from((await cdp.send('Page.captureScreenshot', MODES[mode])).data, 'base64');

const now = () => performance.now();
const stats = a => {
  const s = [...a].sort((x, y) => x - y), sum = s.reduce((x, y) => x + y, 0);
  return { mean: +(sum / s.length).toFixed(1), med: +s[Math.floor(s.length / 2)].toFixed(1), p90: +s[Math.floor(s.length * 0.9)].toFixed(1) };
};
const sampleTimes = (P, n, from = 0, to = P.tl.duration) => Array.from({ length: n }, (_, i) => +(from + (i + 0.5) * (to - from) / n).toFixed(4));
const frameName = i => String(i + 1).padStart(5, '0');

// SSIM of two numbered image sequences in two dirs (ffmpeg ssim, per-frame stats) → { mean, min, below98, n }.
function ssimDirs(dirA, extA, dirB, extB, { fmt = 'yuv420p' } = {}) {
  const stat = path.join(os.tmpdir(), `avs-ssim-${process.pid}-${crypto.randomBytes(3).toString('hex')}.txt`);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', path.join(dirA, `%05d.${extA}`), '-i', path.join(dirB, `%05d.${extB}`),
    '-lavfi', `[0:v]format=${fmt}[a];[1:v]format=${fmt}[b];[a][b]ssim=stats_file='${stat.replace(/\\/g, '/').replace(':', '\\:')}'`, '-f', 'null', '-'], { encoding: 'utf8' });
  if (r.status) throw new Error(`ffmpeg ssim: ${r.stderr}`);
  const all = fs.readFileSync(stat, 'utf8').trim().split('\n').map(l => +/All:([\d.]+)/.exec(l)[1]);
  fs.rmSync(stat, { force: true });
  return { mean: +(all.reduce((x, y) => x + y, 0) / all.length).toFixed(4), min: +Math.min(...all).toFixed(4), below98: all.filter(x => x < 0.98).length, n: all.length };
}
const writeFrame = (dir, i, e, buf) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${frameName(i)}.${e}`), buf); };
const log = o => console.log(JSON.stringify(o));
const gpuLoad = () => { const r = spawnSync('nvidia-smi', ['--query-gpu=utilization.gpu,memory.used', '--format=csv,noheader'], { encoding: 'utf8' }); return (r.stdout || '').trim(); };

// ---------- frames: per-mode capture cost + quality ----------
async function cmdFrames() {
  const P = loadTimeline(args[1]);
  const out = path.resolve(opt('--out', 'capture_lab_out'));
  const n = +opt('--n', 60);
  const modes = opt('--modes', Object.keys(MODES).join(',')).split(',');
  for (const m of ['png', 'cur']) if (!modes.includes(m)) modes.push(m);
  const times = sampleTimes(P, n);
  const { browser, page, cdp, mode, renderer } = await openPage(P);
  log({ cmd: 'frames', W: P.W, H: P.H, n, chrome: mode, renderer, shell: flag('--shell'), pipe: flag('--pipe'), gpu_before: gpuLoad() });
  for (const t of times.slice(0, 3)) { await renderFrame(page, t); await capture(cdp, 'cur'); } // warm-up
  const res = Object.fromEntries(modes.map(m => [m, { render: [], cap: [], bytes: [] }]));
  for (const round of [0, 1]) {
    for (const m of round ? [...modes].reverse() : modes) {
      for (let i = 0; i < times.length; i++) {
        const a = now(); await renderFrame(page, times[i]);
        if (m === 'cur-again') await capture(cdp, 'cur');
        const b = now(); const buf = await capture(cdp, m);
        const c = now();
        res[m].render.push(b - a); res[m].cap.push(c - b); res[m].bytes.push(buf.length);
        if (round === 0 && !NO_SSIM.has(m)) writeFrame(path.join(out, m), i, ext(m), buf);
      }
    }
  }
  await browser.close();
  const rows = [];
  for (const m of modes) {
    const r = res[m], row = { mode: m, render_ms: stats(r.render).med, cap_ms: stats(r.cap), kb: Math.round(r.bytes.reduce((x, y) => x + y, 0) / r.bytes.length / 1024) };
    if (NO_SSIM.has(m)) { rows.push(row); log(row); continue; }
    row.ssim_vs_png = ssimDirs(path.join(out, 'png'), 'png', path.join(out, m), ext(m));
    if (m !== 'cur') row.ssim_vs_cur = ssimDirs(path.join(out, 'cur'), 'jpg', path.join(out, m), ext(m));
    rows.push(row); log(row);
  }
  fs.writeFileSync(path.join(out, 'frames.json'), JSON.stringify({ W: P.W, H: P.H, n, chrome: mode, rows }, null, 1));
}

// Split [0, n) like render.mjs and run one worker per chunk; worker(a, b, file) → Promise.
async function segmented(P, outPath, n, workers, worker) {
  const tmp = fs.mkdtempSync(path.join(path.dirname(outPath), '.lab_'));
  try {
    const per = Math.ceil(n / workers), segs = [];
    for (let w = 0; w < workers; w++) { const a = w * per, b = Math.min(n, a + per); if (a < b) segs.push({ a, b, file: path.join(tmp, `seg${w}.mp4`) }); }
    await Promise.all(segs.map(s => worker(s.a, s.b, s.file)));
    fs.writeFileSync(path.join(tmp, 'list.txt'), segs.map(s => `file '${s.file.replace(/'/g, "'\\''")}'`).join('\n'));
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', outPath]);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
const pipeFfmpeg = argv => {
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', ...argv], { stdio: ['pipe', 'inherit', 'inherit'] });
  const closed = new Promise((ok, bad) => ff.on('close', c => (c ? bad(new Error(`ffmpeg ${c}`)) : ok())));
  const write = async buf => { if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r)); };
  return { write, end: () => { ff.stdin.end(); return closed; } };
};

// ---------- full: whole video with one capture mode ----------
async function cmdFull() {
  const P = loadTimeline(args[1]), outPath = path.resolve(args[2]);
  const m = opt('--mode', 'cur'), fmt = MODES[m].format;
  const n = Math.round(P.tl.duration * P.fps);
  const { workers, threads, preset } = renderPlan({ W: P.W, H: P.H, n, fps: P.fps, workers: opt('--workers') });
  const venc = ['-c:v', 'libx264', '-preset', preset, '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(P.fps), ...(threads ? ['-threads', String(threads)] : [])];
  const started = now(); let capMs = 0, renMs = 0, chrome = '';
  await segmented(P, outPath, n, workers, async (a, b, file) => {
    const { browser, page, cdp, mode } = await openPage(P); chrome = mode;
    const ff = pipeFfmpeg(['-f', 'image2pipe', '-framerate', String(P.fps), '-c:v', codec(fmt), '-i', '-', ...venc, '-video_track_timescale', String(P.fps * 512), file]);
    for (let i = a; i < b; i++) {
      const t0 = now(); await renderFrame(page, i / P.fps);
      const t1 = now(); const buf = await capture(cdp, m); capMs += now() - t1; renMs += t1 - t0;
      await ff.write(buf);
    }
    await ff.end(); await browser.close();
  });
  const sec = (now() - started) / 1000;
  log({ cmd: 'full', mode: m, W: P.W, H: P.H, frames: n, workers, preset, chrome, shell: flag('--shell'), pipe: flag('--pipe'), sec: +sec.toFixed(1), fps: +(n / sec).toFixed(1), cap_ms_per_frame: +(capMs / n).toFixed(1), render_ms_per_frame: +(renMs / n).toFixed(1), mb: +(fs.statSync(outPath).size / 1048576).toFixed(1) });
}

// ---------- screencast: seek-driven Page.startScreencast ----------
async function cmdScreencast() {
  const P = loadTimeline(args[1]);
  const out = path.resolve(opt('--out', 'capture_lab_out'));
  const n = +opt('--n', 120), from = +opt('--from', 5), timeout = +opt('--timeout', 250);
  const times = Array.from({ length: n }, (_, i) => from + i / P.fps); // consecutive frames: the hard case
  const { browser, page, cdp, mode } = await openPage(P);
  // Reference: captureScreenshot PNG of each t.
  for (let i = 0; i < n; i++) { await renderFrame(page, times[i]); writeFrame(path.join(out, 'sc_ref'), i, 'png', await capture(cdp, 'png')); }
  let latest = null, waiter = null, received = 0;
  cdp.on('Page.screencastFrame', f => {
    received++;
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    latest = f; if (waiter) { const w = waiter; waiter = null; w(f); }
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 93, maxWidth: P.W, maxHeight: P.H, everyNthFrame: 1 });
  await new Promise(r => setTimeout(r, 300));
  const per = [], kinds = { fresh: 0, timeout: 0 }; let prev = null;
  const t0 = now();
  for (let i = 0; i < n; i++) {
    const a = now();
    latest = null;
    await renderFrame(page, times[i]);
    // A frame produced after the DOM swap: wait for the next screencastFrame (or time out = no damage / dropped).
    const f = latest || await Promise.race([new Promise(r => { waiter = r; }), new Promise(r => setTimeout(() => r(null), timeout))]);
    waiter = null;
    let buf;
    if (f) { kinds.fresh++; buf = Buffer.from(f.data, 'base64'); prev = buf; } else { kinds.timeout++; buf = prev || await capture(cdp, 'cur'); }
    writeFrame(path.join(out, 'sc'), i, 'jpg', buf);
    per.push(now() - a);
  }
  const total = now() - t0;
  await cdp.send('Page.stopScreencast');
  // Same consecutive frames through the current path, for the time comparison.
  const curPer = [];
  for (let i = 0; i < n; i++) { const a = now(); await renderFrame(page, times[i]); writeFrame(path.join(out, 'sc_cur'), i, 'jpg', await capture(cdp, 'cur')); curPer.push(now() - a); }
  await browser.close();
  log({ cmd: 'screencast', W: P.W, H: P.H, n, chrome: mode, ms_per_frame: stats(per), total_s: +(total / 1000).toFixed(1), cur_ms_per_frame: stats(curPer), received, ...kinds,
    ssim_sc_vs_ref: ssimDirs(path.join(out, 'sc_ref'), 'png', path.join(out, 'sc'), 'jpg'), ssim_cur_vs_ref: ssimDirs(path.join(out, 'sc_ref'), 'png', path.join(out, 'sc_cur'), 'jpg') });
}

// ---------- beginframe: chrome-headless-shell with begin-frame control ----------
async function cmdBeginFrame() {
  const P = loadTimeline(args[1]);
  const out = path.resolve(opt('--out', 'capture_lab_out'));
  const n = +opt('--n', 60);
  const times = sampleTimes(P, n);
  const flags = ['--enable-begin-frame-control', '--run-all-compositor-stages-before-draw', '--disable-new-content-rendering-timeout', '--disable-threaded-animation', '--disable-threaded-scrolling', '--disable-checker-imaging', '--deterministic-mode'];
  const res = { cmd: 'beginframe', W: P.W, H: P.H, n };
  let browser;
  try {
    const exe = shellPath(); res.exe = path.basename(path.dirname(path.dirname(exe)));
    const mode = opt('--gpu', '1') === '0' ? 'swiftshader' : 'gpu';
    browser = await puppeteer.launch({ headless: 'shell', executablePath: exe, args: chromeArgs(mode, [...BACKGROUND_FLAGS, ...flags]), protocolTimeout: 30000 });
    res.chrome = mode;
    const bs = await browser.target().createCDPSession();
    const { targetId } = await bs.send('Target.createTarget', { url: 'about:blank', enableBeginFrameControl: true });
    const target = await browser.waitForTarget(t => t._targetId === targetId, { timeout: 10000 });
    const page = await target.page();
    const cdp = await page.createCDPSession();
    // Nothing paints without beginFrame: keep ticking while the page loads (fonts, images).
    let ticking = true, tick = 0;
    const pump = (async () => { while (ticking) { await cdp.send('HeadlessExperimental.beginFrame', { interval: 1000 / P.fps, noDisplayUpdates: false }).catch(() => {}); tick++; await new Promise(r => setTimeout(r, 5)); } })();
    await setupPage(page, P);
    ticking = false; await pump;
    res.load_ticks = tick;
    const per = [], cap = []; let noShot = 0;
    for (let i = 0; i < n; i++) {
      const a = now(); await renderFrame(page, times[i]);
      const b = now(); let data = null;
      for (let k = 0; k < 4 && !data; k++) {
        const r = await cdp.send('HeadlessExperimental.beginFrame', { interval: 1000 / P.fps, screenshot: { format: 'jpeg', quality: 93, optimizeForSpeed: true } });
        data = r.screenshotData; if (!data) noShot++;
      }
      cap.push(now() - b); per.push(now() - a);
      if (data) writeFrame(path.join(out, 'bf'), i, 'jpg', Buffer.from(data, 'base64'));
    }
    Object.assign(res, { cap_ms: stats(cap), ms_per_frame: stats(per), empty_beginframes: noShot });
    await browser.close(); browser = null;
    // Reference of the same t from the normal path (new headless Chrome, captureScreenshot PNG).
    const ref = await openPage(P, { shell: false });
    for (let i = 0; i < n; i++) { await renderFrame(ref.page, times[i]); writeFrame(path.join(out, 'bf_ref'), i, 'png', await capture(ref.cdp, 'png')); }
    await ref.browser.close();
    if (fs.existsSync(path.join(out, 'bf'))) res.ssim_vs_ref = ssimDirs(path.join(out, 'bf_ref'), 'png', path.join(out, 'bf'), 'jpg');
  } catch (e) {
    res.error = String(e.message || e).split('\n')[0];
  } finally { await browser?.close().catch(() => {}); }
  log(res);
}

// ---------- overlay: transparent graphics layer, A-roll composited by ffmpeg ----------
const HIDE_AROLL = 'html,body,#stage{background:transparent!important}img[src*="work/frames/"]{visibility:hidden!important}';
async function makeTransparent(page, cdp) {
  await page.evaluate(css => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }, HIDE_AROLL);
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
}
const ALPHA = { png: { format: 'png', ...FAST }, webp: { format: 'webp', quality: 90, ...FAST } };
// Share of fully transparent pixels in an RGBA image file (ffmpeg → raw alpha plane).
function transparentShare(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'format=rgba,alphaextract', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 26 });
  const a = r.stdout; let z = 0; for (let i = 0; i < a.length; i++) if (a[i] === 0) z++;
  return a.length ? z / a.length : NaN;
}
async function cmdOverlay() {
  const P = loadTimeline(args[1]);
  const out = path.resolve(opt('--out', 'capture_lab_out'));
  const n = +opt('--n', 60), run = +opt('--run', 150);
  const times = sampleTimes(P, n);
  const res = { cmd: 'overlay', W: P.W, H: P.H, n };
  // Normal frames (reference) first, then the same t with a transparent page.
  const { browser, page, cdp, mode } = await openPage(P); res.chrome = mode;
  const refCap = [];
  for (let i = 0; i < n; i++) { await renderFrame(page, times[i]); const a = now(); const b = await capture(cdp, 'cur'); refCap.push(now() - a); writeFrame(path.join(out, 'ov_ref'), i, 'jpg', b); }
  await makeTransparent(page, cdp);
  for (const f of ['png', 'webp']) {
    const cap = [], bytes = [];
    for (let i = 0; i < n; i++) {
      await renderFrame(page, times[i]);
      const a = now(); const { data } = await cdp.send('Page.captureScreenshot', ALPHA[f]); cap.push(now() - a);
      const buf = Buffer.from(data, 'base64'); bytes.push(buf.length); writeFrame(path.join(out, `ov_${f}`), i, f, buf);
    }
    res[`cap_${f}`] = { ...stats(cap), kb: Math.round(bytes.reduce((x, y) => x + y, 0) / n / 1024) };
  }
  res.cap_cur = stats(refCap);
  const shares = fs.readdirSync(path.join(out, 'ov_png')).map(f => transparentShare(path.join(out, 'ov_png', f)));
  res.transparent_share = { mean: +(shares.reduce((x, y) => x + y, 0) / shares.length).toFixed(3), min: +Math.min(...shares).toFixed(3) };
  // Identical consecutive overlay frames over `run` consecutive frames from 5 s (what a "skip unchanged layer" could save).
  let same = 0, last = '';
  for (let i = 0; i < run; i++) {
    await renderFrame(page, 5 + i / P.fps);
    const h = crypto.createHash('sha1').update((await cdp.send('Page.captureScreenshot', ALPHA.png)).data).digest('hex');
    if (h === last) same++; last = h;
  }
  res.identical_consecutive = `${same}/${run - 1}`;
  await browser.close();
  // Composite on the A-roll frame of the same t (identity mapping) and compare with the normal capture.
  const comp = path.join(out, 'ov_comp'); fs.mkdirSync(comp, { recursive: true });
  for (let i = 0; i < n; i++) {
    const k = Math.min(P.tl.aroll?.count || 1e9, Math.floor(times[i] * P.fps + 1e-6) + 1);
    const under = path.join(P.tlDir, (P.tl.aroll?.frames || 'work/frames/%05d.jpg').replace('%05d', String(k).padStart(5, '0')));
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', under, '-i', path.join(out, 'ov_png', `${frameName(i)}.png`), '-filter_complex', `[0:v]scale=${P.W}:${P.H}[b];[b][1:v]overlay=format=auto`, '-q:v', '2', path.join(comp, `${frameName(i)}.jpg`)]);
  }
  res.ssim_composite_vs_cur = ssimDirs(path.join(out, 'ov_ref'), 'jpg', comp, 'jpg');
  res.ssim_webp_vs_png = ssimDirs(path.join(out, 'ov_png'), 'png', path.join(out, 'ov_webp'), 'webp', { fmt: 'yuva420p' });
  log(res);
}

// Whole video: alpha frames into ffmpeg, overlaid on the A-roll sequence, same worker split / x264 as render.mjs.
async function cmdOverlayFull() {
  const P = loadTimeline(args[1]), outPath = path.resolve(args[2]);
  const f = opt('--fmt', 'png');
  const n = Math.round(P.tl.duration * P.fps);
  const { workers, threads, preset } = renderPlan({ W: P.W, H: P.H, n, fps: P.fps, workers: opt('--workers') });
  const venc = ['-c:v', 'libx264', '-preset', preset, '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(P.fps), ...(threads ? ['-threads', String(threads)] : [])];
  const seq = path.join(P.tlDir, P.tl.aroll?.frames || 'work/frames/%05d.jpg');
  const started = now(); let capMs = 0;
  await segmented(P, outPath, n, workers, async (a, b, file) => {
    const { browser, page, cdp } = await openPage(P);
    await makeTransparent(page, cdp);
    const ff = pipeFfmpeg(['-f', 'image2pipe', '-framerate', String(P.fps), '-c:v', codec(f), '-i', '-',
      '-framerate', String(P.fps), '-start_number', String(Math.min(a + 1, P.tl.aroll?.count || a + 1)), '-i', seq,
      '-filter_complex', `[1:v]scale=${P.W}:${P.H},tpad=stop=-1:stop_mode=clone[b];[b][0:v]overlay=format=auto:shortest=1`, '-frames:v', String(b - a),
      ...venc, '-video_track_timescale', String(P.fps * 512), file]);
    for (let i = a; i < b; i++) {
      await renderFrame(page, i / P.fps);
      const t1 = now(); const buf = Buffer.from((await cdp.send('Page.captureScreenshot', ALPHA[f])).data, 'base64'); capMs += now() - t1;
      await ff.write(buf);
    }
    await ff.end(); await browser.close();
  });
  const sec = (now() - started) / 1000;
  log({ cmd: 'overlay-full', fmt: f, W: P.W, H: P.H, frames: n, workers, sec: +sec.toFixed(1), fps: +(n / sec).toFixed(1), cap_ms_per_frame: +(capMs / n).toFixed(1) });
}

const CMDS = { frames: cmdFrames, full: cmdFull, screencast: cmdScreencast, beginframe: cmdBeginFrame, overlay: cmdOverlay, 'overlay-full': cmdOverlayFull };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!CMDS[cmd] || !args[1]) { console.error(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(2); }
  await CMDS[cmd]();
  process.exit(0);
}
