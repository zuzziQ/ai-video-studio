// Khoá file giữa các tiến trình cho các tệp JSON dùng chung (queue.json — M24, schedule.json — M40).
// Tách nguyên văn từ scripts/queue.mjs để publish.mjs dùng chung; hành vi không đổi.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Windows: renaming over a file another process has open for reading fails for a moment (EPERM/EACCES/EBUSY), and so does
// opening a file that is being replaced. Those errors are retried instead of being read as "no file".
export const BUSY = new Set(['EPERM', 'EACCES', 'EBUSY']);
export const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export function retryBusy(fn, tries = 40) { for (let k = 0; ; k++) { try { return fn(); } catch (e) { if (!BUSY.has(e.code) || k >= tries) throw e; sleepSync(10 + k * 5); } } }
const alive = pid => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// Exclusive create of <file>.lock holding {pid, host, t}. A holder keeps it only while it reads, edits and renames the
// JSON (milliseconds; at worst the busy-file retries, ~10 s), so a lock whose pid is gone, or older than staleMs, is left
// over from a crash and is removed. Each lock carries a random token: a holder only deletes its own lock, and a stale lock
// is only deleted if it still holds the same content that was judged stale (two waiters cannot delete each other's new lock
// unless they interleave within microseconds).
const lockText = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
export function withFileLock(lockFile, fn, { timeoutMs = 15000, staleMs = 30000 } = {}) {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const t0 = Date.now();
  for (let k = 0; ; k++) {
    let fd = null;
    try { fd = fs.openSync(lockFile, 'wx'); } catch (e) { if (e.code !== 'EEXIST' && !BUSY.has(e.code)) throw e; }
    if (fd !== null) {
      const mine = JSON.stringify({ pid: process.pid, host: os.hostname(), t: Date.now(), tok: crypto.randomBytes(6).toString('hex') });
      try { fs.writeSync(fd, mine); } finally { fs.closeSync(fd); }
      try { return fn(); } finally { try { if (lockText(lockFile) === mine) retryBusy(() => fs.rmSync(lockFile, { force: true })); } catch {} }
    }
    let info = null, age = 0, raw = null;
    try { age = Date.now() - fs.statSync(lockFile).mtimeMs; raw = lockText(lockFile); info = JSON.parse(raw); } catch {}
    const dead = info?.pid && info.host === os.hostname() && info.pid !== process.pid && !alive(info.pid);
    if (dead || age > staleMs) { try { if (lockText(lockFile) === raw) fs.rmSync(lockFile, { force: true }); } catch {} continue; }
    if (Date.now() - t0 > timeoutMs) throw new Error(`${path.basename(lockFile).replace(/\.lock$/, '')} đang bị khoá quá ${Math.round(timeoutMs / 1000)} s (${lockFile})`);
    sleepSync(Math.min(50, 2 + k * 2) + Math.random() * 5);
  }
}
