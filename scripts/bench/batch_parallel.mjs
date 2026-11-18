// M66 (S08): batch-parallel lab. Does a batch of N renders finish sooner as P renders at once × W workers each than as
// one render at a time × 4 workers? Measures only: each render is `node scripts/render.mjs <tl> <out> --workers W` as a
// child process, exactly as variants.mjs / batch.mjs would run it. Report: docs/perf/2026-11-15-m66-batch-parallel.md.
//
// usage (from the repo; project = a copy of sample/clip-mau with work/frames extracted, docs/perf/2026-11-13-baseline.md §5):
//   node scripts/bench/batch_parallel.mjs <timeline.json> --out DIR [--n 6] [--configs 1x4,2x2,3x1,2x3,3x2] [--reps 3]
//        [--ref ref.mp4] [--busy <timeline.json>] [--busy-workers 4] [--idle 15] [--idle-wait 900] [--tag name]
//   --configs PxW: P renders at once, W workers each. Reps run round-robin over the configs (order rotated each rep) so
//                  slow drift of the machine load spreads over every config.
//   --ref:         file to compare every output with (md5, else SSIM). Missing → the first output of the first config
//                  is copied there and becomes the reference.
//   --busy TL:     keep one extra render of TL (--busy-workers W) looping in the background during each batch (busy
//                  machine). Its own times are reported too.
//   --idle P:      before each batch wait until whole-machine CPU stays < P % over 10 s (and NVENC < 10 %); after
//                  --idle-wait seconds run anyway and mark the batch noisy.
// Writes <out>/<tag>.jsonl (one line per batch) and prints a median table. Outputs are deleted after they are checked.
import fs from 'node:fs';
import { rmSync } from '../fs_rm.mjs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const here = path.dirname(fileURLToPath(import.meta.url));
const RENDER = path.join(here, '..', 'render.mjs');
const tlPath = path.resolve(args[0] || '');
if (!args[0] || !fs.existsSync(tlPath)) { console.error('usage: batch_parallel.mjs <timeline.json> --out DIR [...]'); process.exit(2); }
const outDir = path.resolve(opt('--out', 'bench_out'));
fs.mkdirSync(outDir, { recursive: true });
const N = +opt('--n', 6), reps = +opt('--reps', 3);
const configs = opt('--configs', '1x4,2x2,3x1,2x3,3x2').split(',').map(s => { const [p, w] = s.split('x').map(Number); return { p, w, name: s }; });
const tag = opt('--tag', path.basename(tlPath, '.json'));
const refPath = path.resolve(opt('--ref', path.join(outDir, `${tag}_ref.mp4`)));
const busyTl = opt('--busy') ? path.resolve(opt('--busy')) : null;
const idlePct = +opt('--idle', 15), idleWait = +opt('--idle-wait', 900);
const log = path.join(outDir, `${tag}.jsonl`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- machine sampling ----------
const cpuTimes = () => os.cpus().reduce((a, c) => { const t = c.times; a.busy += t.user + t.nice + t.sys + t.irq; a.all += t.user + t.nice + t.sys + t.irq + t.idle; return a; }, { busy: 0, all: 0 });
const cpuPct = (a, b) => (b.all > a.all ? (100 * (b.busy - a.busy)) / (b.all - a.all) : 0);
const gpuNow = () => {
  const r = spawnSync('nvidia-smi', ['--query-gpu=utilization.gpu,utilization.encoder,memory.used', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
  const [gpu, enc, mem] = String(r.stdout || '').split(',').map(Number);
  return { gpu: gpu || 0, enc: enc || 0, mem: mem || 0 };
};
async function waitIdle() {
  const t0 = Date.now();
  for (;;) {
    const a = cpuTimes(); await sleep(10000); const cpu = cpuPct(a, cpuTimes()), g = gpuNow();
    if (cpu < idlePct && g.enc < 10) return { cpu: +cpu.toFixed(1), gpu: g.gpu, enc: g.enc, waited: Math.round((Date.now() - t0) / 1000), noisy: false };
    if ((Date.now() - t0) / 1000 > idleWait) return { cpu: +cpu.toFixed(1), gpu: g.gpu, enc: g.enc, waited: Math.round((Date.now() - t0) / 1000), noisy: true };
    process.stderr.write(`  [idle] CPU ${cpu.toFixed(0)} %, NVENC ${g.enc} % — chờ\n`);
  }
}
// Samples every second: CPU %, free RAM, and (from a long-running nvidia-smi) VRAM / GPU / encoder utilisation.
function sampler() {
  const s = { cpu: [], freeMb: [], vram: [], gpu: [], enc: [] };
  let last = cpuTimes();
  const iv = setInterval(() => { const now = cpuTimes(); s.cpu.push(cpuPct(last, now)); last = now; s.freeMb.push(os.freemem() / 2 ** 20); }, 1000);
  const smi = spawn('nvidia-smi', ['--query-gpu=utilization.gpu,utilization.encoder,memory.used', '--format=csv,noheader,nounits', '-lms', '500'], { windowsHide: true });
  let buf = '';
  smi.stdout.on('data', d => {
    buf += d; const lines = buf.split(/\r?\n/); buf = lines.pop();
    for (const l of lines) { const [g, e, m] = l.split(',').map(Number); if (Number.isFinite(m)) { s.gpu.push(g); s.enc.push(e); s.vram.push(m); } }
  });
  smi.on('error', () => {});
  return () => {
    clearInterval(iv); smi.kill();
    const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null), max = a => (a.length ? Math.max(...a) : null);
    return { cpuAvg: +avg(s.cpu)?.toFixed(1), cpuMax: +max(s.cpu)?.toFixed(1), freeMinMb: Math.round(Math.min(...s.freeMb)),
      vramMaxMb: max(s.vram), gpuAvg: +avg(s.gpu)?.toFixed(1), encMax: max(s.enc), encAvg: +avg(s.enc)?.toFixed(1) };
  };
}

// ---------- one render as a child process ----------
function render(tl, out, workers) {
  return new Promise(ok => {
    const t0 = Date.now(), err = [];
    // M64 render slots (default 1 run at a time, max 4) would serialise the batch: 0 = no coordination. Profile pinned to
    // can-bang so a profile saved in $AVS_HOME/config.json (e.g. chat-luong = x264) does not change what is measured.
    const env = { ...process.env, AVS_RENDER_SLOTS: process.env.AVS_RENDER_SLOTS ?? '0', AVS_PERF_PROFILE: process.env.AVS_PERF_PROFILE ?? 'can-bang' };
    const p = spawn(process.execPath, [RENDER, tl, out, '--workers', String(workers)], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, env });
    let tail = '';
    p.stderr.on('data', d => { tail += d; const ls = tail.split(/\r?\n/); tail = ls.pop(); err.push(...ls.filter(Boolean)); });
    p.on('close', code => ok({ out, code, sec: (Date.now() - t0) / 1000, stderr: [...err, tail].filter(Boolean) }));
  });
}
// stderr lines that mean an NVENC session failed or the render fell back to libx264.
const ENC_FAIL = /OpenEncodeSession|nvenc|NVENC|No capable devices|out of memory|\[encoder\]|ffmpeg exit/i;

// ---------- checks ----------
const md5 = f => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
function probe(f) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=codec_name,width,height,nb_read_packets:format=duration', '-of', 'json', f], { encoding: 'utf8', timeout: 60000 });
  try { const j = JSON.parse(r.stdout); const s = j.streams[0]; return { ok: r.status === 0 && !r.stderr.trim(), codec: s.codec_name, w: s.width, h: s.height, frames: +s.nb_read_packets, dur: +(+j.format.duration).toFixed(3) }; }
  catch { return { ok: false, err: String(r.stderr || '').trim().split('\n')[0] }; }
}
function ssim(a, b) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-lavfi', 'ssim', '-f', 'null', '-'], { encoding: 'utf8', timeout: 300000 });
  const m = /All:([\d.]+)/.exec(r.stderr || '');
  return m ? +m[1] : null;
}
const ssimCache = new Map();

// ---------- one batch ----------
async function batch(cfg, rep) {
  const idle = await waitIdle();
  const dir = path.join(outDir, `${tag}_${cfg.name}_r${rep}`);
  rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  let busyStop = false; const busyRuns = [];
  const busyLoop = busyTl ? (async () => { let i = 0; while (!busyStop) busyRuns.push(await render(busyTl, path.join(dir, `busy${i++}.mp4`), +opt('--busy-workers', 4))); })() : null;
  if (busyTl) await sleep(3000); // let the busy render get past Chrome start-up
  const stop = sampler(), t0 = Date.now(), jobs = [...Array(N).keys()], done = [];
  await Promise.all([...Array(cfg.p)].map(async () => { while (jobs.length) { const i = jobs.shift(); done.push({ i, ...(await render(tlPath, path.join(dir, `v${i}.mp4`), cfg.w)) }); } }));
  const total = (Date.now() - t0) / 1000, res = stop();
  busyStop = true; if (busyLoop) await busyLoop;
  // checks (after the clock stops)
  if (!fs.existsSync(refPath)) { const first = done.find(d => d.code === 0); if (first) fs.copyFileSync(first.out, refPath); }
  const refMd5 = fs.existsSync(refPath) ? md5(refPath) : null;
  const outs = done.sort((a, b) => a.i - b.i).map(d => {
    const pr = d.code === 0 && fs.existsSync(d.out) ? probe(d.out) : { ok: false };
    const h = pr.ok ? md5(d.out) : null;
    if (h && h !== refMd5 && !ssimCache.has(h)) ssimCache.set(h, ssim(d.out, refPath));
    return { i: d.i, sec: +d.sec.toFixed(2), code: d.code, ...pr, md5: h, sameAsRef: h === refMd5, ssim: h === refMd5 ? 1 : ssimCache.get(h) ?? null,
      encFail: d.stderr.filter(l => ENC_FAIL.test(l)).slice(0, 5) };
  });
  rmSync(dir, { recursive: true, force: true });
  const row = { tag, cfg: cfg.name, p: cfg.p, w: cfg.w, rep, at: new Date().toISOString(), idle, total: +total.toFixed(2), perVideo: +(total / N).toFixed(2), ...res,
    failed: outs.filter(o => !o.ok).length, encFail: outs.reduce((a, o) => a + o.encFail.length, 0), sameMd5: outs.filter(o => o.sameAsRef).length,
    ssimMin: Math.min(...outs.map(o => o.ssim ?? 0)), frames: [...new Set(outs.map(o => o.frames))], outs,
    busy: busyTl ? busyRuns.map(b => ({ sec: +b.sec.toFixed(2), code: b.code })) : undefined };
  fs.appendFileSync(log, JSON.stringify(row) + '\n');
  console.log(`${tag} ${cfg.name} r${rep}: ${row.total} s (${row.perVideo} s/bản) CPU ${row.cpuAvg} % RAM trống min ${row.freeMinMb} MB VRAM max ${row.vramMaxMb} MB NVENC max ${row.encMax} % ` +
    `hỏng ${row.failed} encFail ${row.encFail} md5=ref ${row.sameMd5}/${N} SSIM min ${row.ssimMin}${idle.noisy ? ' [NHIỄU]' : ''}${busyTl ? ` busy ${row.busy.map(b => b.sec).join('/')}` : ''}`);
  return row;
}

const rows = [];
for (let r = 1; r <= reps; r++) {
  const order = configs.map((_, i) => configs[(i + r - 1) % configs.length]);
  for (const c of order) rows.push(await batch(c, r));
}
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
console.log('\ncấu hình | tổng s (trung vị) | s/bản | CPU % | RAM trống min MB | VRAM max MB | NVENC max % | hỏng | encFail | md5=ref | SSIM min');
for (const c of configs) {
  const rs = rows.filter(x => x.cfg === c.name);
  console.log([c.name, med(rs.map(x => x.total)), med(rs.map(x => x.perVideo)), med(rs.map(x => x.cpuAvg)), Math.min(...rs.map(x => x.freeMinMb)),
    Math.max(...rs.map(x => x.vramMaxMb)), Math.max(...rs.map(x => x.encMax)), rs.reduce((a, x) => a + x.failed, 0), rs.reduce((a, x) => a + x.encFail, 0),
    rs.reduce((a, x) => a + x.sameMd5, 0) + '/' + rs.length * N, Math.min(...rs.map(x => x.ssimMin))].join(' | '));
}
