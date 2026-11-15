// Profile hiệu năng (S08 · M64): một chỗ quyết định render chạy bao nhiêu worker, encoder nào, ưu tiên tiến trình, bao
// nhiêu lượt render cùng lúc trên cả máy, whisper dùng thiết bị nào. Hợp đồng cho panel 29_perf (M67) và AI chọn profile
// (M68): giữ tên và chữ ký các hàm export dưới đây.
//
//   Cấu hình: khoá "perf" của $AVS_HOME/config.json (gộp, giữ mọi khoá khác, quyền 600):
//     { "perf": { "profile": "can-bang", "custom": { "workers": 3, "encoder": "x264", "preset": "medium",
//                 "priority": "below_normal", "slots": 1, "whisperDevice": "cpu" } } }   (custom chỉ dùng cho tuy-chinh)
//   Thứ tự thắng: cờ CLI (--workers/--preset/--fast) > biến môi trường > profile.
//     AVS_ENCODER (render_hw.mjs), AVS_WHISPER_DEVICE (whisper_device.py), AVS_RENDER_SLOTS (0 = không điều phối),
//     AVS_RENDER_PRIORITY=normal|below_normal, AVS_PERF_PROFILE=<tên profile>.
//   Điều phối: $AVS_HOME/render_slots.json (khoá qua file_lock.mjs): mỗi lượt render.mjs giữ một chỗ; chỗ của pid đã chết
//   được dọn. Nhật ký số đo: $AVS_HOME/perf_log.jsonl, giữ 500 dòng cuối.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { withFileLock, retryBusy } from './file_lock.mjs';
import { readConfig, writeConfig } from './tts_config.mjs';
import { CONFIG } from './llm.mjs';
import { avsHome, physicalCores, renderPlan, encoderWanted, pickEncoder, gpuWanted, novsyncWanted, findHeadlessShell } from './render_hw.mjs';

// ---------- profiles ----------
// workers: số cố định, null = tự động (renderPlan), 'physical-1' = nhân thật − 1 (tối đa maxWorkers).
// encoder: 'auto' = pickEncoder như cũ; preset: null = mặc định của renderPlan (veryfast khi song song, medium khi 1 worker).
export const PROFILES = {
  'tiet-kiem': { label: 'Tiết kiệm', hint: '2 worker, ưu tiên thấp: máy vẫn mượt khi đang render', workers: 2, encoder: 'auto', preset: null, priority: 'below_normal', slots: 1, whisperDevice: 'auto' },
  'can-bang': { label: 'Cân bằng', hint: 'Mặc định: tự chọn theo nhân thật, GPU và encoder phần cứng', workers: null, encoder: 'auto', preset: null, priority: 'normal', slots: 1, whisperDevice: 'auto' },
  'toc-do': { label: 'Tốc độ', hint: 'Worker = nhân thật − 1 (tối đa 5): nhanh nhất, máy nặng khi render', workers: 'physical-1', maxWorkers: 5, encoder: 'auto', preset: null, priority: 'normal', slots: 1, whisperDevice: 'auto' },
  'chat-luong': { label: 'Chất lượng', hint: 'x264 medium cho mọi đoạn: file đẹp nhất, chậm hơn', workers: null, encoder: 'x264', preset: 'medium', priority: 'normal', slots: 1, whisperDevice: 'auto' },
  'tuy-chinh': { label: 'Tuỳ chỉnh', hint: 'Tự đặt từng núm (perf.custom)', workers: null, encoder: 'auto', preset: null, priority: 'normal', slots: 1, whisperDevice: 'auto' },
};
export const DEFAULT_PROFILE = 'can-bang';
export const ENCODER_CHOICES = ['auto', 'nvenc', 'qsv', 'videotoolbox', 'x264'];
export const X264_PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'];
export const PRIORITIES = ['normal', 'below_normal'];
export const WHISPER_DEVICES = ['auto', 'cuda', 'cpu'];
export const MAX_WORKERS = 16, MAX_SLOTS = 4;

const bad = m => Object.assign(new Error(m), { status: 400 });
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
// One custom field → normalized value, or throws (strict) / undefined (lenient read of a hand-edited file).
const FIELDS = {
  workers: v => (v === null ? null : intIn(v, 1, MAX_WORKERS) ? v : undefined),
  encoder: v => (ENCODER_CHOICES.includes(v) ? v : undefined),
  preset: v => (v === null ? null : X264_PRESETS.includes(v) ? v : undefined),
  priority: v => (PRIORITIES.includes(v) ? v : undefined),
  slots: v => (intIn(v, 1, MAX_SLOTS) ? v : undefined),
  whisperDevice: v => (WHISPER_DEVICES.includes(v) ? v : undefined),
};
const FIELD_MSG = {
  workers: `workers phải là số nguyên 1–${MAX_WORKERS} hoặc null`, encoder: 'encoder phải là: ' + ENCODER_CHOICES.join(', '),
  preset: 'preset phải là null hoặc: ' + X264_PRESETS.join(', '), priority: 'priority phải là: ' + PRIORITIES.join(', '),
  slots: `slots phải là số nguyên 1–${MAX_SLOTS}`, whisperDevice: 'whisperDevice phải là: ' + WHISPER_DEVICES.join(', '),
};
function cleanCustom(c, strict) {
  const out = {};
  if (c == null) return out;
  if (typeof c !== 'object' || Array.isArray(c)) { if (strict) throw bad('custom phải là object'); return out; }
  for (const [k, v] of Object.entries(c)) {
    if (!Object.hasOwn(FIELDS, k)) { if (strict) throw bad(`Không có núm "${k}"`); continue; }
    const x = FIELDS[k](v);
    if (x === undefined) { if (strict) throw bad(FIELD_MSG[k]); continue; }
    out[k] = x;
  }
  return out;
}

// loadPerf() → { profile, custom }: always valid (unknown profile → can-bang, bad custom fields dropped).
export function loadPerf() {
  const p = readConfig().perf;
  const o = p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  return { profile: Object.hasOwn(PROFILES, o.profile) ? o.profile : DEFAULT_PROFILE, custom: cleanCustom(o.custom, false) };
}
// savePerf({ profile?, custom? }) → loadPerf(). custom is merged field by field (null clears workers/preset to auto).
// Wrong type or value → Error with status 400 and nothing written. Every other key of config.json is kept.
export function savePerf(obj = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw bad('perf phải là object');
  for (const k of Object.keys(obj)) if (k !== 'profile' && k !== 'custom') throw bad(`Không có khoá perf.${k}`);
  if (obj.profile !== undefined && !Object.hasOwn(PROFILES, obj.profile)) throw bad('profile phải là: ' + Object.keys(PROFILES).join(', '));
  const patch = obj.custom !== undefined ? cleanCustom(obj.custom, true) : {};
  withFileLock(CONFIG() + '.lock', () => {
    const cur = readConfig(), was = loadPerf();
    cur.perf = { ...(cur.perf && typeof cur.perf === 'object' && !Array.isArray(cur.perf) ? cur.perf : {}),
      profile: obj.profile ?? was.profile, custom: { ...was.custom, ...patch } };
    writeConfig(cur);
  });
  return loadPerf();
}

// ---------- resolve ----------
const envStr = (env, k) => String(env[k] ?? '').trim().toLowerCase();
const cliInt = v => { const n = Math.floor(+v); return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_WORKERS) : null; };
// resolvePerf({ profile?, hw?, job?, env?, perf? })
//   profile: tên profile (thắng config và AVS_PERF_PROFILE); hw: { physical } (mặc định đo máy này, chỉ cần cho toc-do);
//   job: { kind?, cli: { workers?, preset?, fast? } }; perf: loadPerf() đã đọc sẵn (test).
//   → { profile, workers, encoder, preset, priority, slots, whisperDevice, from }
//      workers: số worker hoặc null (= renderPlan tự chọn); encoder: một trong ENCODER_CHOICES; preset: x264 preset hoặc null;
//      slots: số lượt render cùng lúc trên cả máy (0 = không điều phối); from: nguồn từng núm ('cli' | 'env' | 'profile').
export function resolvePerf({ profile, hw = null, job = {}, env = process.env, perf = null } = {}) {
  const cfg = perf || loadPerf();
  const envProfile = envStr(env, 'AVS_PERF_PROFILE');
  const name = [profile, Object.hasOwn(PROFILES, envProfile) ? envProfile : null, cfg.profile].find(p => p && Object.hasOwn(PROFILES, p)) || DEFAULT_PROFILE;
  const base = { ...PROFILES[name], ...(name === 'tuy-chinh' ? cfg.custom : {}) };
  const from = { workers: 'profile', encoder: 'profile', preset: 'profile', priority: 'profile', slots: 'profile', whisperDevice: 'profile' };
  const cli = job?.cli || {};

  let workers = base.workers;
  if (workers === 'physical-1') workers = Math.max(1, Math.min(base.maxWorkers || MAX_WORKERS, (hw?.physical || physicalCores()) - 1));
  if (cliInt(cli.workers)) { workers = cliInt(cli.workers); from.workers = 'cli'; }

  let encoder = base.encoder;
  if (envStr(env, 'AVS_ENCODER')) { encoder = encoderWanted(env); from.encoder = 'env'; }

  let preset = base.preset;
  if (X264_PRESETS.includes(cli.preset)) { preset = cli.preset; from.preset = 'cli'; }
  else if (cli.fast) { preset = 'veryfast'; from.preset = 'cli'; }

  let priority = base.priority;
  const ep = envStr(env, 'AVS_RENDER_PRIORITY');
  if (PRIORITIES.includes(ep)) { priority = ep; from.priority = 'env'; }

  let slots = base.slots;
  const es = envStr(env, 'AVS_RENDER_SLOTS');
  if (/^\d+$/.test(es)) { slots = Math.min(+es, MAX_SLOTS); from.slots = 'env'; }

  let whisperDevice = base.whisperDevice;
  const ew = envStr(env, 'AVS_WHISPER_DEVICE');
  if (WHISPER_DEVICES.includes(ew)) { whisperDevice = ew; from.whisperDevice = 'env'; }

  return { profile: name, workers, encoder, preset, priority, slots, whisperDevice, from };
}
// Biến môi trường cho tiến trình con (job hàng đợi): chỉ những núm mà con tự đọc từ env và profile đổi khác mặc định.
export function perfEnv(r) {
  const e = { AVS_PERF_PROFILE: r.profile };
  if (r.whisperDevice !== 'auto') e.AVS_WHISPER_DEVICE = r.whisperDevice;
  return e;
}

// ---------- process priority ----------
// lowerPriority(pid, priority): 'below_normal' → os.setPriority BelowNormal (Windows: lớp BELOW_NORMAL, tiến trình con tạo
// sau đó thừa hưởng; POSIX: nice 10). 'normal' không làm gì. → true khi đã hạ.
export function lowerPriority(pid, priority) {
  if (priority !== 'below_normal' || !pid) return false;
  try { os.setPriority(pid, os.constants.priority.PRIORITY_BELOW_NORMAL); return true; } catch { return false; }
}

// ---------- render slots ----------
export const slotFile = (env = process.env) => path.join(avsHome(env), 'render_slots.json');
const alive = pid => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const readSlots = f => { try { const j = JSON.parse(retryBusy(() => fs.readFileSync(f, 'utf8'))); return Array.isArray(j?.holders) ? j.holders : []; } catch { return []; } };
const writeSlots = (f, holders) => { const tmp = `${f}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify({ holders }, null, 1)); retryBusy(() => fs.renameSync(tmp, f)); };
// Người giữ chỗ ghi lại `beat` mỗi SLOT_BEAT_MS; chỗ không nhịp quá SLOT_STALE_MS là của tiến trình bị giết cứng mà pid đã
// được tiến trình khác dùng lại (Windows dùng lại pid rất nhanh), nên cũng được dọn.
export const SLOT_BEAT_MS = 30e3, SLOT_STALE_MS = 5 * 60e3;
const fresh = h => Date.now() - Date.parse(h.beat || h.at) < SLOT_STALE_MS;
const live = h => !!h && typeof h === 'object' && fresh(h) && (h.host !== os.hostname() || alive(h.pid));
// slotHolders() → lượt render đang giữ chỗ (đã bỏ pid chết), không ghi gì.
export function slotHolders({ env = process.env } = {}) { return readSlots(slotFile(env)).filter(live); }
// Một lần thử: dọn chỗ của pid đã chết, lấy chỗ khi còn trống (< slots). → token hoặc null.
export function tryTakeSlot({ slots = 1, env = process.env, pid = process.pid, info = {} } = {}) {
  const f = slotFile(env);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  return withFileLock(f + '.lock', () => {
    const all = readSlots(f), holders = all.filter(live);
    if (holders.length >= Math.max(1, slots)) { if (holders.length !== all.length) writeSlots(f, holders); return null; }
    const tok = crypto.randomBytes(6).toString('hex');
    const at = new Date().toISOString();
    writeSlots(f, [...holders, { ...info, pid, host: os.hostname(), tok, at, beat: at }]);
    return tok;
  });
}
// Nhịp của người giữ chỗ: ghi lại `beat`. → false khi chỗ đã bị dọn, true khi còn.
export function beatSlot(tok, { env = process.env } = {}) {
  const f = slotFile(env);
  return withFileLock(f + '.lock', () => {
    const all = readSlots(f), me = all.find(h => h?.tok === tok);
    if (!me) return false;
    me.beat = new Date().toISOString();
    writeSlots(f, all);
    return true;
  });
}
export function releaseSlot(tok, { env = process.env } = {}) {
  if (!tok) return;
  const f = slotFile(env);
  try { withFileLock(f + '.lock', () => { const all = readSlots(f); if (all.some(h => h?.tok === tok)) writeSlots(f, all.filter(h => h?.tok !== tok && live(h))); }); } catch { /* best effort: pid chết sẽ được dọn */ }
}
// acquireRenderSlot({ slots, onWait, pollMs }) → { release(), waited_s }. slots 0 → không điều phối.
// Chờ tới khi có chỗ; onWait(holders) gọi một lần khi phải chờ. Chỗ tự nhả khi tiến trình thoát (exit, lỗi, SIGTERM qua
// process.exit); bị giết cứng (taskkill /f) thì lượt sau dọn vì pid đã chết.
export async function acquireRenderSlot({ slots = 1, onWait = null, pollMs = 1000, env = process.env, info = {} } = {}) {
  const t0 = Date.now();
  if (!slots) return { release() {}, waited_s: 0 };
  let tok = null, told = false;
  while (!(tok = tryTakeSlot({ slots, env, info }))) {
    if (!told) { told = true; try { onWait?.(slotHolders({ env })); } catch { /* chỉ là thông báo */ } }
    await new Promise(r => setTimeout(r, pollMs));
  }
  // Chỗ bị dọn nhầm (máy treo quá SLOT_STALE_MS): ghi lại chỗ của mình, kể cả khi vượt slots (lượt này đã đang render).
  const retake = () => { const t = tryTakeSlot({ slots: slotHolders({ env }).length + 1, env, info }); if (t) tok = t; };
  const beat = setInterval(() => { try { if (tok && !beatSlot(tok, { env })) retake(); } catch { /* lần nhịp sau */ } }, SLOT_BEAT_MS);
  beat.unref();
  const release = () => { clearInterval(beat); if (tok) { const t = tok; tok = null; releaseSlot(t, { env }); } process.off('exit', release); };
  process.on('exit', release);
  return { release, waited_s: Math.round((Date.now() - t0) / 100) / 10 };
}

// ---------- perf log ----------
export const perfLogFile = (env = process.env) => path.join(avsHome(env), 'perf_log.jsonl');
export const PERF_LOG_KEEP = 500;
// appendPerfLog({ at, profile, W, H, frames, workers, encoder, chrome, sec, fps, waited_s }) — một dòng JSON, giữ 500 dòng cuối.
export function appendPerfLog(entry, { env = process.env, keep = PERF_LOG_KEEP } = {}) {
  const f = perfLogFile(env);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  withFileLock(f + '.lock', () => {
    let lines = [];
    try { lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean); } catch { /* first entry */ }
    lines.push(JSON.stringify({ at: new Date().toISOString(), ...entry }));
    const tmp = `${f}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, lines.slice(-keep).join('\n') + '\n');
    retryBusy(() => fs.renameSync(tmp, f));
  });
}
// readPerfLog({ n }) → n dòng cuối (mới nhất cuối), bỏ dòng hỏng.
export function readPerfLog({ n = 20, env = process.env } = {}) {
  let lines = [];
  try { lines = fs.readFileSync(perfLogFile(env), 'utf8').split('\n').filter(Boolean); } catch { return []; }
  return lines.slice(-Math.max(1, n)).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// ---------- hardware snapshot ----------
const GB = 2 ** 30, r1 = x => Math.round(x * 10) / 10;
export function parseNvidiaSmi(text) {
  return String(text || '').split(/\r?\n/).map(l => l.split(',').map(s => s.trim())).filter(c => c.length >= 4 && c[0])
    .map(([name, total, free, driver]) => ({ name, vram_mb: +total || null, vram_free_mb: +free || null, driver }));
}
// hwSnapshot({ run, env, encoders }) → máy này lúc gọi, không có đường dẫn:
//   { cores: { physical, logical }, ram: { total_gb, free_gb }, gpu: [{ name, vram_mb, vram_free_mb, driver }],
//     chrome: { mode: 'gpu' | 'swiftshader', headless_shell, novsync }, encoder: { want, final, segment } | null }
// chrome.mode là chế độ sẽ thử (AVS_RENDER_GPU); launchChrome vẫn lùi về SwiftShader khi GPU không dựng được.
export function hwSnapshot({ run = spawnSync, env = process.env, encoders = true } = {}) {
  let gpu = [];
  if (process.platform !== 'darwin') {
    try {
      const r = run('nvidia-smi', ['--query-gpu=name,memory.total,memory.free,driver_version', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
      if (r && !r.error && r.status === 0) gpu = parseNvidiaSmi(r.stdout);
    } catch { /* no NVIDIA */ }
  }
  let encoder = null;
  if (encoders) {
    try {
      encoder = { want: encoderWanted(env), final: pickEncoder({ use: 'final', env, quiet: true }).kind, segment: pickEncoder({ use: 'segment', env, quiet: true }).kind };
    } catch { encoder = null; }
  }
  return {
    cores: { physical: physicalCores(), logical: (os.availableParallelism ? os.availableParallelism() : os.cpus().length) || 1 },
    ram: { total_gb: r1(os.totalmem() / GB), free_gb: r1(os.freemem() / GB) },
    gpu,
    chrome: { mode: gpuWanted(env) ? 'gpu' : 'swiftshader', headless_shell: !!findHeadlessShell(env), novsync: novsyncWanted(env) },
    encoder,
  };
}

// planFor({ W, H, fps, sec, perf, hw }) → kế hoạch render.mjs sẽ dùng (cho doctor/M67), cùng phép tính với render.mjs.
export function planFor({ W = 1080, H = 1920, fps = 30, sec = 30, perf = resolvePerf(), hw = null } = {}) {
  const p = renderPlan({ W, H, n: Math.round(sec * fps), fps, workers: perf.workers, preset: perf.preset,
    ...(hw?.cores ? { physical: hw.cores.physical, logical: hw.cores.logical } : {}), freeMemGB: hw?.ram?.free_gb ?? os.freemem() / GB });
  return { W, H, fps, sec, ...p, encoder: perf.encoder, priority: perf.priority, slots: perf.slots };
}
