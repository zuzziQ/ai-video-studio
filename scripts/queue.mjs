// Hàng đợi nền + Thư mục tự động (references/autopilot.md).
// Store: ~/.ai-video-studio/queue.json (AVS_HOME overrides); settings: ~/.ai-video-studio/autopilot.json; lock: queue.lock.
// One runner at a time (Studio server lane, `queue.mjs run`, or the LaunchAgent) holds queue.lock; the others stay passive and
// take over when the holder exits. The runner executes at most ONE item at a time, retries a failed item once, scans the watch
// folders and calls `node scripts/publish.mjs run-due` every 60 s when that script exists.
// usage:
//   node scripts/queue.mjs add <kind> <input> [--profile id] [--out dir] [--batch lô] [--opts '{"n":6}']   kinds: autopilot|highlights|topic|variants|publish
//   node scripts/queue.mjs list | cancel <id> | retry <id> [--qc-override "<lý do>"] | remove <id> | up <id> | down <id> | clear-done
//   node scripts/queue.mjs pause|resume|cancel-all [<lô>]   (cả lô: mọi mục có cùng `batch`; không ghi lô = cả hàng đợi)
// queue.json is shared by several processes (Studio, runner, Telegram bot, CLI): every read-modify-write goes through
// mutate(), which holds queue.json.lock (exclusive create) for the few milliseconds it takes — see withFileLock().
//   node scripts/queue.mjs run [--daemon]        (run until the queue is empty; --daemon: keep running + watch folders)
//   node scripts/queue.mjs agent install|uninstall|status      (LaunchAgent com.aivideostudio.watch)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { notify } from './notify.mjs';
import { killTree } from './platform.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const AVS_HOME = process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio');
const QFILE = path.join(AVS_HOME, 'queue.json'), SFILE = path.join(AVS_HOME, 'autopilot.json'), LOCK = path.join(AVS_HOME, 'queue.lock'), QLOCK = QFILE + '.lock';
export const VIDEO_EXT = /\.(mp4|mov|m4v|mkv)$/i;
const MOVIES = path.join(os.homedir(), 'Movies', 'AI Video Studio');
export const DEFAULT_FOLDER = { in: path.join(MOVIES, 'Thả video vào đây'), done: path.join(MOVIES, 'Đã xong'), processed: path.join(MOVIES, 'Đã xử lý'), profile: '' };
const LA_LABEL = 'com.aivideostudio.watch';
const LA_DIR = process.env.AVS_LA_DIR || path.join(os.homedir(), 'Library/LaunchAgents');

// Windows: renaming over a file another process has open for reading fails for a moment (EPERM/EACCES/EBUSY), and so does
// opening a file that is being replaced. Those errors are retried instead of being read as "no file".
const BUSY = new Set(['EPERM', 'EACCES', 'EBUSY']);
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function retryBusy(fn, tries = 40) { for (let k = 0; ; k++) { try { return fn(); } catch (e) { if (!BUSY.has(e.code) || k >= tries) throw e; sleepSync(10 + k * 5); } } }
const rd = (f, d) => { try { return JSON.parse(retryBusy(() => fs.readFileSync(f, 'utf8'), 10)); } catch { return d; } };
function wr(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`; fs.writeFileSync(t, JSON.stringify(o, null, 1)); try { retryBusy(() => fs.renameSync(t, f)); } catch (e) { fs.rmSync(t, { force: true }); throw e; } }
const slug = s => String(s || 'x').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';
const alive = pid => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// ---------- settings ----------
export function loadSettings() {
  const s = rd(SFILE, {}) || {};
  return { notify: s.notify !== false, appDrop: !!s.appDrop, agent: !!s.agent, profile: s.profile || '',
    watch: { on: !!s.watch?.on, folders: (s.watch?.folders?.length ? s.watch.folders : [DEFAULT_FOLDER]).map(f => ({ ...DEFAULT_FOLDER, ...f })) } };
}
export function saveSettings(patch) {
  const cur = loadSettings(), next = { ...cur, ...patch, watch: { ...cur.watch, ...(patch.watch || {}) } };
  next.watch.folders = next.watch.folders.map(f => ({ in: String(f.in || '').replace(/^~(?=\/)/, os.homedir()), done: String(f.done || '').replace(/^~(?=\/)/, os.homedir()), processed: String(f.processed || '').replace(/^~(?=\/)/, os.homedir()), profile: f.profile || '' })).filter(f => f.in);
  if (!next.watch.folders.length) next.watch.folders = [DEFAULT_FOLDER];
  wr(SFILE, next); return next;
}

// ---------- queue store ----------
// A job that gave up is in state FAILED ('error'). Builds before M34 had readers that looked for 'failed', and a queue.json
// edited by hand or by an old build may still say 'failed': loadQueue() maps it to FAILED so every reader sees one name.
export const FAILED = 'error';
export const isFailed = it => it?.state === FAILED || it?.state === 'failed';
const normQueue = q => { if (!q || !Array.isArray(q.items)) return { version: 1, items: [] }; for (const it of q.items) if (it && it.state === 'failed') it.state = FAILED; return q; };
export function loadQueue() { return normQueue(rd(QFILE, null)); }
// Before a write: missing file = empty queue; a file that is not JSON is kept as queue.json.bad-<time> (not silently
// overwritten); a read that keeps failing for another reason throws, so a busy file never turns into an empty queue.
function readForWrite() {
  let txt;
  try { txt = retryBusy(() => fs.readFileSync(QFILE, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return normQueue(null); throw e; }
  try { return normQueue(JSON.parse(txt)); } catch {
    try { fs.copyFileSync(QFILE, `${QFILE}.bad-${Date.now()}`); } catch {}
    return normQueue(null);
  }
}

// ---------- lock for queue.json writes (M24) ----------
// Exclusive create of <file>.lock holding {pid, host, t}. A holder keeps it only while it reads, edits and renames the
// JSON (milliseconds), so a lock whose pid is gone, or older than staleMs, is left over from a crash and is removed.
export function withFileLock(lockFile, fn, { timeoutMs = 15000, staleMs = 10000 } = {}) {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const t0 = Date.now();
  for (let k = 0; ; k++) {
    let fd = null;
    try { fd = fs.openSync(lockFile, 'wx'); } catch (e) { if (e.code !== 'EEXIST' && !BUSY.has(e.code)) throw e; }
    if (fd !== null) {
      try { fs.writeSync(fd, JSON.stringify({ pid: process.pid, host: os.hostname(), t: Date.now() })); } finally { fs.closeSync(fd); }
      try { return fn(); } finally { try { retryBusy(() => fs.rmSync(lockFile, { force: true })); } catch {} }
    }
    let info = null, age = 0;
    try { age = Date.now() - fs.statSync(lockFile).mtimeMs; info = JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch {}
    const dead = info?.pid && info.host === os.hostname() && info.pid !== process.pid && !alive(info.pid);
    if (dead || age > staleMs) { try { fs.rmSync(lockFile, { force: true }); } catch {} continue; }
    if (Date.now() - t0 > timeoutMs) throw new Error(`queue.json đang bị khoá quá ${Math.round(timeoutMs / 1000)} s (${lockFile})`);
    sleepSync(Math.min(50, 2 + k * 2) + Math.random() * 5);
  }
}
// read-modify-write with the freshest file, under the lock (Studio, the runner, the Telegram bot and the CLI all write it)
export function mutate(fn) { return withFileLock(QLOCK, () => { const q = readForWrite(); const r = fn(q); wr(QFILE, q); return r; }); }
export const KINDS = {
  autopilot: { name: 'Tự lái', script: 'autopilot.mjs' },
  highlights: { name: 'Video dài → shorts', script: 'highlights.mjs' },
  topic: { name: 'Chủ đề → video', script: 'topic_video.mjs' },
  variants: { name: 'Biến thể A/B', script: 'variants.mjs' },
  publish: { name: 'Đăng / lên lịch', script: 'publish.mjs' },
};
// own keys only: KINDS['constructor'] / KINDS['toString'] are inherited functions, not job kinds
export const isKind = kind => typeof kind === 'string' && Object.hasOwn(KINDS, kind);
export function addItem({ kind, input, opts = {}, source = 'ui', batch }) {
  if (!isKind(kind)) throw new Error(`Loại việc lạ: ${kind}`);
  if (!input) throw new Error('Thiếu đầu vào');
  const it = { id: crypto.randomBytes(4).toString('hex'), kind, input: String(input), opts, source, state: 'queued', progress: 0, step: 'Đang chờ', created: new Date().toISOString(),
    started: null, finished: null, outputs: [], error: null, attempt: 0, title: kind === 'topic' ? String(input).slice(0, 60) : path.basename(String(input)), ...(batch ? { batch: String(batch) } : {}) };
  mutate(q => q.items.push(it));
  return it;
}
export function cancelItem(id) {
  return mutate(q => { const it = q.items.find(x => x.id === id); if (!it) return false;
    if (it.state === 'queued') { it.state = 'cancelled'; it.step = 'Đã huỷ'; it.finished = new Date().toISOString(); }
    else if (it.state === 'running') it.cancel = true;
    return true; });
}
// qcOverride: retry an autopilot job stopped by the QC export gate, recording this reason (only for non-policy issues).
export function retryItem(id, { qcOverride } = {}) {
  return mutate(q => { const it = q.items.find(x => x.id === id); if (!it || it.state === 'running') return false;
    if (qcOverride) it.opts = { ...(it.opts || {}), qc_override: String(qcOverride) };
    Object.assign(it, { state: 'queued', step: 'Đang chờ (thử lại)', error: null, blocked: undefined, attempt: 0, progress: 0, cancel: false, finished: null }); return true; });
}
// The autopilot stopped at its QC step because QC blocks export (scripts/export_gate.mjs): no automatic retry.
export const isGateStop = errLine => /CHẶN XUẤT/.test(errLine || '');
export function removeItem(id) { return mutate(q => { const it = q.items.find(x => x.id === id); if (!it || it.state === 'running') return false; q.items = q.items.filter(x => x.id !== id); return true; }); }
export function moveItem(id, d) { return mutate(q => { const i = q.items.findIndex(x => x.id === id), j = i + d; if (i < 0 || j < 0 || j >= q.items.length) return false; [q.items[i], q.items[j]] = [q.items[j], q.items[i]]; return true; }); }
// Whole batch (items sharing `batch`; no batch = the whole queue): pause = waiting items become 'paused' (the runner only
// takes 'queued'; a running item finishes), resume = back to 'queued' in the same order, cancel = waiting/paused items
// become 'cancelled' and a running one gets the cancel flag. Returns how many items changed.
export function batchControl(action, batch) {
  if (!['pause', 'resume', 'cancel'].includes(action)) throw new Error(`Lệnh lô lạ: ${action}`);
  return mutate(q => {
    let n = 0; const now = new Date().toISOString();
    for (const it of q.items) {
      if (batch && it.batch !== batch) continue;
      if (action === 'pause' && it.state === 'queued') { Object.assign(it, { state: 'paused', step: 'Tạm dừng' }); n++; }
      else if (action === 'resume' && it.state === 'paused') { Object.assign(it, { state: 'queued', step: 'Đang chờ' }); n++; }
      else if (action === 'cancel' && (it.state === 'queued' || it.state === 'paused')) { Object.assign(it, { state: 'cancelled', step: 'Đã huỷ (cả lô)', finished: now }); n++; }
      else if (action === 'cancel' && it.state === 'running' && !it.cancel) { it.cancel = true; n++; }
    }
    return n;
  });
}
export function clearDone() { return mutate(q => { const n = q.items.length; q.items = q.items.filter(x => !['done', 'cancelled'].includes(x.state)); return n - q.items.length; }); }

function argsFor(it) {
  const o = it.opts || {}, k = it.kind, A = [];
  if (k === 'autopilot') { A.push(it.input); if (o.profile) A.push('--profile', o.profile); if (o.out) A.push('--out', o.out); if (o.project) A.push('--project', o.project); if (o.qc_override) A.push('--qc-override', String(o.qc_override)); }
  else if (k === 'highlights') { A.push(it.input, '--out', o.out || path.join(AVS_HOME, 'autopilot/highlights', `${slug(path.basename(it.input, path.extname(it.input)))}-${it.id}`)); for (const f of ['n', 'min', 'max', 'orient']) if (o[f] != null) A.push('--' + f, String(o[f])); }
  else if (k === 'topic') { A.push(it.input, '--out', o.out || path.join(AVS_HOME, 'autopilot/topics', it.id)); /* fresh folder per item: topic_video nests into an existing one */ for (const f of ['dur', 'voice', 'orient']) if (o[f] != null) A.push('--' + f, String(o[f])); }
  else if (k === 'variants') { A.push(it.input, '--n', String(o.n || 3)); if (o.kind) A.push('--kind', o.kind); }
  else if (k === 'publish') { A.push(o.action || 'youtube-upload', it.input); if (o.meta) A.push('--meta', o.meta); if (o.schedule) A.push('--schedule', o.schedule); }
  if (Array.isArray(o.args)) A.push(...o.args.map(String));
  return A;
}

// ---------- leftovers of a killed render ----------
// render.mjs splits work into <out dir>/.render_XXXX/ and removes it itself — unless it is killed (cancel: taskkill /f on
// Windows skips its cleanup) or crashes. After a job ends badly, remove the .render_* folders it left in its own output
// folders. Only folders created since the job started are touched, so a render running elsewhere (Studio export) is safe.
export function renderRoots(it) {
  const o = it?.opts || {}, roots = [it?.project, it?.result?.project, o.out, ...(it?.outputs || []).map(f => path.dirname(f))];
  return [...new Set(roots.filter(r => typeof r === 'string' && r && path.isAbsolute(r)).map(r => path.resolve(r)))];
}
export function sweepRenderTmp(roots, sinceMs = 0, depth = 2) {
  const gone = [];
  const walk = (dir, d) => {
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      const abs = path.join(dir, e.name);
      if (e.name.startsWith('.render_')) {
        let st; try { st = fs.statSync(abs); } catch { continue; }
        if (Math.max(st.birthtimeMs || 0, st.ctimeMs || 0) + 2000 < sinceMs) continue;
        try { fs.rmSync(abs, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); gone.push(abs); } catch { /* still locked: next sweep */ }
      } else if (d > 0 && e.name !== 'node_modules' && !e.name.startsWith('.git')) walk(abs, d - 1);
    }
  };
  for (const r of roots) walk(r, depth);
  return gone;
}

// ---------- lock ----------
function readLock() { return rd(LOCK, null); }
function tryLock(role) {
  const l = readLock();
  if (l && l.pid !== process.pid && alive(l.pid)) return false;
  if (l?.pid === process.pid) return true;
  wr(LOCK, { pid: process.pid, role, host: os.hostname(), since: new Date().toISOString() });
  return readLock()?.pid === process.pid;
}
function unlock() { const l = readLock(); if (l?.pid === process.pid) fs.rmSync(LOCK, { force: true }); }

// ---------- runner ----------
export class Runner {
  constructor({ role = 'cli', daemon = true, log = (...a) => console.log(...a) } = {}) {
    Object.assign(this, { role, daemon, log, child: null, item: null, active: false, timer: null, seen: new Map(), lastDue: 0, due: null, watchErr: null, idleSince: Date.now() });
  }
  status() {
    const l = readLock();
    return { active: this.active, role: this.role, lock: l && alive(l.pid) ? l : null, running: this.item?.id || null, watchError: this.watchErr, due: this.due,
      agent: agentStatus() };
  }
  start() { if (!this.timer) { this.timer = setInterval(() => this.tick().catch(e => this.log('queue:', e.message)), 2000); this.tick().catch(() => {}); } return this; }
  stop({ requeue = true } = {}) {
    clearInterval(this.timer); this.timer = null;
    if (this.child) killTree(this.child, { group: true }); // Windows: taskkill /t — process.kill(-pid) does nothing there
    if (this.item && requeue) mutate(q => { const it = q.items.find(x => x.id === this.item.id); if (it && it.state === 'running') Object.assign(it, { state: 'queued', step: 'Bị dừng — sẽ chạy tiếp', runner: null }); });
    unlock();
  }
  async tick() {
    if (this.busy) return; this.busy = true;
    try {
      this.active = tryLock(this.role);
      if (!this.active) return;
      // items left "running" by a runner that died → back to the queue (autopilot resumes where it stopped)
      mutate(q => { for (const it of q.items) if (it.state === 'running' && it.runner !== process.pid && !alive(it.runner)) Object.assign(it, { state: 'queued', step: 'Chạy tiếp sau khi bị dừng', runner: null }); });
      const st = loadSettings();
      if (this.daemon && st.watch.on) this.scan(st);
      if (this.child) {
        const it = loadQueue().items.find(x => x.id === this.item.id);
        if (it?.cancel && !this.cancelled) { this.cancelled = true; killTree(this.child, { group: true }); }
      } else {
        const next = loadQueue().items.find(x => x.state === 'queued');
        if (next) this.runItem(next); else if (!this.daemon && Date.now() - this.idleSince > 1500) { this.stop(); this.onIdle?.(); }
      }
      if (this.daemon && Date.now() - this.lastDue > 60000) { this.lastDue = Date.now(); this.runDue(); }
    } finally { this.busy = false; }
  }
  runDue() {
    const f = path.join(SKILL, 'scripts/publish.mjs');
    if (!fs.existsSync(f)) { this.due = { at: new Date().toISOString(), skipped: 'chưa có scripts/publish.mjs' }; return; }
    execFile('node', [f, 'run-due'], { timeout: 50 * 60000, cwd: SKILL }, (e, out, err) => {
      this.due = { at: new Date().toISOString(), ok: !e, msg: String(e ? (err || e.message) : out).trim().split('\n').pop()?.slice(0, 200) || '' };
    });
  }
  runItem(it0) {
    const upd = patch => mutate(q => { const it = q.items.find(x => x.id === it0.id); if (it) Object.assign(it, patch); return it; });
    // a kind written into queue.json by hand or by another build: fail this item, the ones behind it still run
    if (!isKind(it0.kind)) { upd({ state: FAILED, error: `Loại việc lạ: ${it0.kind}`, step: 'Lỗi', finished: new Date().toISOString() }); return; }
    const spec = KINDS[it0.kind], script = path.join(SKILL, 'scripts', spec.script);
    if (!fs.existsSync(script)) { upd({ state: FAILED, error: `Tính năng “${spec.name}” chưa được cài (thiếu scripts/${spec.script})`, step: 'Lỗi', finished: new Date().toISOString() }); return; }
    const attempt = (it0.attempt || 0) + 1;
    this.item = upd({ state: 'running', started: new Date().toISOString(), progress: 0, step: attempt > 1 ? 'Thử lại lần 2' : 'Bắt đầu', runner: process.pid, attempt, error: null, cancel: false });
    this.cancelled = false;
    const argv = argsFor(it0), startedMs = Date.now();
    this.log(`queue: chạy ${it0.kind} ${it0.input} (lần ${attempt})`);
    const p = spawn('node', [script, ...argv], { cwd: SKILL, detached: true, env: process.env });
    this.child = p;
    let log = '', last = 0, pending = {}, result = null;
    const flush = (force) => { if (force || Date.now() - last > 1000) { last = Date.now(); upd({ ...pending, log: log.slice(-1500) }); pending = {}; } };
    const onLine = l => {
      const m = /^@@ ([\d.]+) (.*)$/.exec(l);
      if (m) { pending.progress = Math.min(.999, +m[1]); pending.step = m[2]; }
      else if (/^PROJECT /.test(l)) { pending.project = l.slice(8).trim(); flush(true); }
      else if (/^RESULT /.test(l)) { try { result = JSON.parse(l.slice(7)); } catch {} }
      flush();
    };
    const feed = d => { const s = d.toString(); log = (log + s).slice(-8000); s.split(/[\r\n]/).forEach(l => l && onLine(l)); };
    p.stdout.on('data', feed); p.stderr.on('data', feed);
    p.on('error', e => feed('LỖI: ' + e.message));
    p.on('close', code => {
      this.child = null; this.item = null; this.idleSince = Date.now();
      if (code !== 0) { const cur = loadQueue().items.find(x => x.id === it0.id); sweepRenderTmp(renderRoots(cur || it0), startedMs); }
      const errLine = (log.match(/^LỖI: .*$/gm) || []).pop()?.slice(5) || log.trim().split('\n').slice(-2).join(' | ').slice(-300);
      const outputs = result?.outputs || (it0.opts?.out ? [it0.opts.out] : []);
      if (code === 0) { upd({ state: 'done', progress: 1, step: 'Xong', finished: new Date().toISOString(), outputs, result, log: log.slice(-1500) }); if (it0.kind !== 'autopilot') notify(`${spec.name} xong`, it0.title); }
      else if (this.cancelled) upd({ state: 'cancelled', step: 'Đã huỷ', finished: new Date().toISOString(), log: log.slice(-1500) });
      else if (isGateStop(errLine)) { upd({ state: FAILED, blocked: true, step: 'Dừng ở bước QC: chặn xuất', error: errLine, finished: new Date().toISOString(), log: log.slice(-1500) }); notify(`${spec.name} dừng ở bước QC`, `${it0.title}: ${errLine}`); }
      else if (attempt < 2 && !/chưa được cài|Chỉ nhận tệp|Không thấy /.test(errLine)) upd({ state: 'queued', step: `Lỗi, sẽ thử lại: ${errLine}`.slice(0, 300), error: errLine, log: log.slice(-1500) });
      else { upd({ state: FAILED, step: 'Lỗi', error: errLine, finished: new Date().toISOString(), log: log.slice(-1500) }); if (it0.kind !== 'autopilot') notify(`${spec.name} lỗi`, `${it0.title}: ${errLine}`); }
      this.log(`queue: ${it0.kind} ${it0.input} → ${code === 0 ? 'xong' : this.cancelled ? 'huỷ' : 'lỗi ' + errLine}`);
    });
  }
  // Watch folders: a video whose size+mtime stayed the same for 5 s is moved to "Đã xử lý" and queued for Tự lái.
  scan(st) {
    this.watchErr = null;
    for (const f of st.watch.folders) {
      try {
        for (const d of [f.in, f.done, f.processed]) fs.mkdirSync(d, { recursive: true });
        for (const name of fs.readdirSync(f.in)) {
          const abs = path.join(f.in, name);
          if (name.startsWith('.') || /\.(download|crdownload|part|tmp)$/i.test(name) || !VIDEO_EXT.test(name)) continue;
          let s; try { s = fs.statSync(abs); } catch { continue; }
          if (!s.isFile() || s.size === 0) continue;
          const sig = `${s.size}:${s.mtimeMs}`, prev = this.seen.get(abs);
          if (!prev || prev.sig !== sig) { this.seen.set(abs, { sig, since: Date.now() }); continue; }
          if (Date.now() - prev.since < 5000) continue;
          this.seen.delete(abs);
          let dst = path.join(f.processed, name);
          for (let k = 2; fs.existsSync(dst); k++) dst = path.join(f.processed, `${path.basename(name, path.extname(name))} (${k})${path.extname(name)}`);
          fs.renameSync(abs, dst);
          const base = path.basename(dst, path.extname(dst));
          const it = addItem({ kind: 'autopilot', input: dst, opts: { profile: f.profile || st.profile || undefined, out: path.join(f.done, base) }, source: 'watch' });
          this.log(`watch: ${name} → hàng đợi (${it.id})`);
        }
      } catch (e) { this.watchErr = `${f.in}: ${e.message}`; }
    }
  }
}

// ---------- LaunchAgent (only when the user turns on "Chạy cả khi tắt app") ----------
const plistPath = () => path.join(LA_DIR, `${LA_LABEL}.plist`);
const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Windows: a Task Scheduler task at logon running a hidden wscript launcher (no admin rights needed).
const WIN_TASK = 'AIVideoStudio-watch', winVbs = () => path.join(AVS_HOME, 'agent.vbs');
export function agentStatus() { return process.platform === 'win32' ? { installed: fs.existsSync(winVbs()), task: WIN_TASK } : { installed: fs.existsSync(plistPath()), plist: plistPath() }; }
export function agentInstall() {
  if (process.platform === 'win32') {
    const q = s => String(s).replace(/"/g, '""'), cmd = `"${process.execPath}" "${path.join(SKILL, 'scripts/queue.mjs')}" run --daemon --role agent`;
    fs.mkdirSync(AVS_HOME, { recursive: true });
    fs.writeFileSync(winVbs(), [`Set sh = CreateObject("WScript.Shell")`, `sh.CurrentDirectory = "${q(SKILL)}"`, `sh.Run "${q(cmd)}", 0, False`, ''].join('\r\n'));
    saveSettings({ agent: true });
    if (process.env.AVS_NO_LAUNCHCTL) return Promise.resolve({ ok: true, task: WIN_TASK, scheduler: false });
    return new Promise(ok => execFile('schtasks', ['/create', '/f', '/tn', WIN_TASK, '/sc', 'onlogon', '/rl', 'limited', '/tr', `wscript.exe "${winVbs()}"`], e =>
      execFile('schtasks', ['/run', '/tn', WIN_TASK], () => ok({ ok: !e, error: e?.message, task: WIN_TASK }))));
  }
  const node = process.execPath, logf = path.join(os.homedir(), 'Library/Logs/AIVideoStudio-watch.log');
  const PATH = ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local/bin'), path.dirname(node), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
  const env = { PATH, ...(process.env.AVS_HOME ? { AVS_HOME: process.env.AVS_HOME } : {}) };
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
 <key>Label</key><string>${LA_LABEL}</string>
 <key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(path.join(SKILL, 'scripts/queue.mjs'))}</string><string>run</string><string>--daemon</string><string>--role</string><string>agent</string></array>
 <key>WorkingDirectory</key><string>${xml(SKILL)}</string>
 <key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k, v]) => `<key>${k}</key><string>${xml(v)}</string>`).join('')}</dict>
 <key>RunAtLoad</key><true/>
 <key>KeepAlive</key><true/>
 <key>ThrottleInterval</key><integer>30</integer>
 <key>ProcessType</key><string>Background</string>
 <key>StandardOutPath</key><string>${xml(logf)}</string>
 <key>StandardErrorPath</key><string>${xml(logf)}</string>
</dict></plist>
`;
  fs.mkdirSync(LA_DIR, { recursive: true });
  fs.writeFileSync(plistPath(), plist);
  if (!process.env.AVS_NO_LAUNCHCTL && process.platform === 'darwin') {
    const uid = process.getuid();
    return new Promise(ok => execFile('launchctl', ['bootout', `gui/${uid}/${LA_LABEL}`], () => execFile('launchctl', ['bootstrap', `gui/${uid}`, plistPath()], e => { saveSettings({ agent: true }); ok({ ok: !e, error: e?.message, plist: plistPath() }); })));
  }
  saveSettings({ agent: true });
  return Promise.resolve({ ok: true, plist: plistPath(), launchctl: false });
}
export function agentUninstall() {
  saveSettings({ agent: false });
  if (process.platform === 'win32') {
    const done = () => { fs.rmSync(winVbs(), { force: true }); return { ok: true }; };
    return process.env.AVS_NO_LAUNCHCTL ? Promise.resolve(done()) : new Promise(ok => execFile('schtasks', ['/delete', '/f', '/tn', WIN_TASK], () => ok(done())));
  }
  const done = () => { fs.rmSync(plistPath(), { force: true }); return { ok: true }; };
  if (!process.env.AVS_NO_LAUNCHCTL && process.platform === 'darwin' && fs.existsSync(plistPath()))
    return new Promise(ok => execFile('launchctl', ['bootout', `gui/${process.getuid()}/${LA_LABEL}`], () => ok(done())));
  return Promise.resolve(done());
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const [cmd, a, b] = args;
  const fmt = it => `${it.id}  ${it.state.padEnd(9)} ${it.kind.padEnd(10)} ${Math.round((it.progress || 0) * 100).toString().padStart(3)}%  ${it.title}  ${isFailed(it) ? '— ' + it.error : it.step || ''}`;
  try {
    if (cmd === 'add') {
      const opts = { ...(opt('--opts') ? JSON.parse(opt('--opts')) : {}) };
      if (opt('--profile')) opts.profile = opt('--profile'); if (opt('--out')) opts.out = path.resolve(opt('--out'));
      const input = a === 'topic' ? b : path.resolve(b.replace(/^~(?=\/)/, os.homedir()));
      console.log(fmt(addItem({ kind: a, input, opts, source: 'cli', batch: opt('--batch') })));
    } else if (cmd === 'list') { const q = loadQueue(); if (!q.items.length) console.log('(hàng đợi trống)'); q.items.forEach(it => console.log(fmt(it))); const l = readLock(); console.log(l && alive(l.pid) ? `runner: pid ${l.pid} (${l.role})` : 'runner: không chạy'); }
    else if (cmd === 'cancel') console.log(cancelItem(a) ? 'ok' : 'không thấy');
    else if (cmd === 'retry') console.log(retryItem(a, { qcOverride: opt('--qc-override') }) ? 'ok' : 'không thể');
    else if (cmd === 'remove') console.log(removeItem(a) ? 'ok' : 'không thể');
    else if (cmd === 'up' || cmd === 'down') console.log(moveItem(a, cmd === 'up' ? -1 : 1) ? 'ok' : 'không thể');
    else if (cmd === 'clear-done') console.log(clearDone());
    else if (cmd === 'pause' || cmd === 'resume' || cmd === 'cancel-all') console.log(batchControl(cmd === 'cancel-all' ? 'cancel' : cmd, a));
    else if (cmd === 'run') {
      const daemon = args.includes('--daemon');
      const r = new Runner({ role: opt('--role', daemon ? 'daemon' : 'cli'), daemon, log: m => console.log(`[${new Date().toLocaleTimeString('vi-VN')}] ${m}`) });
      r.onIdle = () => { console.log('Hàng đợi trống — xong.'); process.exit(0); };
      for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { r.stop(); process.exit(0); });
      r.start();
      setInterval(() => { if (!r.active && !daemon) { const l = readLock(); console.log(`Đang có runner khác (pid ${l?.pid}, ${l?.role}) — chờ…`); } }, 30000);
    } else if (cmd === 'agent') {
      const f = { install: agentInstall, uninstall: agentUninstall, status: async () => agentStatus() }[a];
      if (!f) throw new Error('agent install|uninstall|status');
      console.log(JSON.stringify(await f()));
    } else { console.error('usage: node scripts/queue.mjs add <kind> <input> [--profile id] [--out dir] | list | cancel|retry|remove|up|down <id> | clear-done | pause|resume|cancel-all [lô] | run [--daemon] | agent install|uninstall|status'); process.exit(2); }
  } catch (e) { console.error('LỖI: ' + e.message); process.exit(1); }
}
