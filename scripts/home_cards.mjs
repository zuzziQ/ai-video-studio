// S19 M136: thẻ "Dự án gần đây" của trang chủ (studio/routes/02_onboarding.mjs). Hàm thuần trên hệ thống file, test được
// không cần server (scripts/tests/s19_home.test.mjs).
//   cardOf(dir)     → {dur, brand, kho, edited, exported, thumb: {v} | null}
//   thumbOf(dir)    → ảnh bìa có sẵn: out/cover.jpg (Tự lái xuất), rồi .studio/thumb.jpg (Cắt clip, Chủ đề, hoặc tạo ở đây)
//   queueThumb(dir) → chưa có ảnh: tạo NỀN một lần bằng ffmpeg vào .studio/thumb.jpg từ một khung hình của dự án
//                     (work/frames, hoặc video đầu tiên trong timeline, hoặc work/aroll.mp4; chỉ file nằm trong thư mục dự án).
//                     Lỗi thì ghi .studio/thumb.none để không thử lại mỗi lần mở trang chủ. Mỗi lúc chỉ chạy một ffmpeg.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { workspaceOfProject } from './workspace.mjs';
import { readExports } from './exports_log.mjs';

const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const mtime = f => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
const inside = (dir, f) => { const r = path.relative(path.resolve(dir), path.resolve(f)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
export const THUMB = '.studio/thumb.jpg', NONE = '.studio/thumb.none';

/** Thời lượng (giây) của timeline: `duration`, không có thì cộng các đoạn clip. */
export function durOf(tl) {
  if (Number.isFinite(+tl?.duration) && +tl.duration > 0) return +(+tl.duration).toFixed(2);
  const s = (Array.isArray(tl?.clips) ? tl.clips : []).reduce((a, c) => a + Math.max(0, (+c?.out || 0) - (+c?.in || 0)), 0);
  return +s.toFixed(2);
}
export function thumbOf(dir) {
  for (const rel of ['out/cover.jpg', THUMB]) { const f = path.join(dir, rel); if (mtime(f)) return f; }
  return null;
}
export function exportedOf(dir) {
  try { if (readExports(dir).length) return true; } catch { /* sổ hỏng */ }
  try { return fs.readdirSync(path.join(dir, 'out')).some(f => f.endsWith('.mp4') && !f.includes('.part')); } catch { return false; }
}
/** Siêu dữ liệu một thẻ; không có timeline.json → null (thư mục mất / không còn là dự án). */
export function cardOf(dir) {
  const tf = path.join(dir, 'timeline.json'), edited = mtime(tf);
  if (!edited) return null;
  const tl = rd(tf) || {};
  let ws = null; try { ws = workspaceOfProject(dir, tl); } catch { /* brands.json hỏng */ }
  const th = thumbOf(dir);
  return { dur: durOf(tl), brand: ws?.brand || '', kho: String(ws?.title || 'Chung').slice(0, 60), edited: new Date(edited).toISOString(),
    exported: exportedOf(dir), aspect: tl.width && tl.height ? (tl.width > tl.height ? 'h' : tl.width < tl.height ? 'v' : 's') : '',
    thumb: th ? { v: Math.round(mtime(th)) } : null };
}

/** Nguồn khung hình để tạo ảnh bìa: [file, giây cần lấy] hoặc null. Chỉ file nằm trong thư mục dự án. */
export function frameSource(dir, tl = rd(path.join(dir, 'timeline.json'))) {
  const ok = f => f && inside(dir, f) && fs.existsSync(f) ? f : null;
  const c = (Array.isArray(tl?.clips) ? tl.clips : []).find(x => x?.src);
  const seq = c?.src && typeof c.src === 'object' && typeof c.src.seq === 'string' ? c.src : null;
  if (seq && /%0?\d*d/.test(seq.seq)) {
    // khung ~1 giây sau điểm vào (khung đầu hay là màu đen / đang mở miệng); khung đánh số từ 1
    const fps = +seq.fps || 30, n = Math.max(1, Math.min(+seq.count || 1, Math.round(((+c.in || 0) + 1) * fps) + 1));
    for (const k of [n, 1]) { const f = ok(path.join(dir, seq.seq.replace(/%0?(\d*)d/, (_, w) => String(k).padStart(+w || 0, '0')))); if (f) return [f, 0]; }
  }
  if (typeof c?.src === 'string' && /\.(mp4|mov|m4v|mkv|webm|jpe?g|png|webp)$/i.test(c.src)) {
    const f = ok(path.isAbsolute(c.src) ? c.src : path.join(dir, c.src));
    if (f) return [f, /\.(jpe?g|png|webp)$/i.test(f) ? 0 : Math.max(0, (+c.in || 0) + 1)];
  }
  const a = ok(path.join(dir, 'work/aroll.mp4'));
  return a ? [a, 1] : null;
}

const pending = new Set(), waiting = [];
let busy = false;
const ffmpeg = (args, ms = 20000) => new Promise(ok => execFile('ffmpeg', args, { timeout: ms, windowsHide: true }, e => ok(!e)));
/** Tạo ảnh bìa một lần (gọi lại khi đang chờ / đã có / đã thử hỏng thì bỏ qua). → true khi vừa xếp hàng. */
export function queueThumb(dir, { run = ffmpeg } = {}) {
  const k = path.resolve(dir);
  if (pending.has(k) || thumbOf(dir) || mtime(path.join(dir, NONE)) || !mtime(path.join(dir, 'timeline.json'))) return false;
  pending.add(k); waiting.push([k, run]); drain();
  return true;
}
export const thumbPending = dir => pending.has(path.resolve(dir));
async function drain() {
  if (busy) return; busy = true;
  try {
    while (waiting.length) {
      const [dir, run] = waiting.shift();
      try { await makeThumb(dir, run); } catch { /* ghi marker bên trong */ } finally { pending.delete(dir); }
    }
  } finally { busy = false; }
}
async function makeThumb(dir, run) {
  const st = path.join(dir, '.studio'), out = path.join(dir, THUMB), tmp = `${out}.${process.pid}.tmp.jpg`;
  fs.mkdirSync(st, { recursive: true });
  const src = frameSource(dir);
  let ok = false;
  if (src) {
    const [f, t] = src, img = /\.(jpe?g|png|webp)$/i.test(f);
    ok = await run(['-v', 'error', '-y', ...(img ? [] : ['-ss', String(t)]), '-i', f, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', tmp]);
    if (!(ok && mtime(tmp)) && !img && t) ok = await run(['-v', 'error', '-y', '-i', f, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', tmp]); // video ngắn hơn t
    ok = ok && mtime(tmp) > 0;
  }
  if (ok) fs.renameSync(tmp, out);
  else { fs.rmSync(tmp, { force: true }); fs.writeFileSync(path.join(dir, NONE), new Date().toISOString()); }
  return ok;
}
/** Chờ hàng tạo ảnh chạy hết (dùng trong test). */
export async function thumbsIdle() { while (busy || waiting.length) await new Promise(r => setTimeout(r, 20)); }
