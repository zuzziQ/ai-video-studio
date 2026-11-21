// S30 M214: ảnh nhỏ cho video trong Kho (bộ chọn media chung, bộ chọn video Nguồn, tab Kho của Media).
// Một khung ffmpeg (giây thứ 1, rộng 320 px) cho mỗi video, lưu ở $AVS_HOME/cache/kho_thumbs/<sha1>.jpg; khoá theo đường dẫn
// tuyệt đối + cỡ + giờ sửa nên đổi file thì có ảnh mới. Mỗi lúc một ffmpeg (xếp hàng), lỗi thì ghi <sha1>.none để không thử lại.
// Không đụng Kho của người dùng (không ghi gì vào thư mục Kho).
//   thumbKey(abs, st)        → sha1 (hàm thuần, test được)
//   videoThumb(abs, {dir})   → Promise<đường dẫn jpg | null>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { AVS_HOME } from './profile.mjs';

export const THUMB_DIR = path.join(AVS_HOME, 'cache', 'kho_thumbs');
export const VIDEO = /\.(mp4|mov|m4v|webm|mkv|avi|mts)$/i;

export function thumbKey(abs, st) {
  return crypto.createHash('sha1').update(`${path.resolve(abs).normalize('NFC').toLowerCase()}|${st.size}|${Math.round(st.mtimeMs)}`).digest('hex');
}

let chain = Promise.resolve();
const pending = new Map();
const run = (args, timeout) => new Promise(ok => execFile('ffmpeg', args, { timeout, windowsHide: true }, e => ok(!e)));

export function videoThumb(abs, { dir = THUMB_DIR, ffmpeg = run } = {}) {
  if (!VIDEO.test(abs)) return Promise.resolve(null);
  let st; try { st = fs.statSync(abs); } catch { return Promise.resolve(null); }
  if (!st.isFile()) return Promise.resolve(null);
  const k = thumbKey(abs, st), jpg = path.join(dir, k + '.jpg'), none = path.join(dir, k + '.none');
  if (fs.existsSync(jpg)) return Promise.resolve(jpg);
  if (fs.existsSync(none)) return Promise.resolve(null);
  if (pending.has(k)) return pending.get(k);
  const job = chain.then(async () => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `.${k}.${process.pid}.jpg`);
    const vf = 'scale=w=320:h=320:force_original_aspect_ratio=decrease';
    // video ngắn hơn 1 s: -ss 1 không ra khung nào, thử lại từ đầu
    let ok = await ffmpeg(['-v', 'error', '-y', '-ss', '1', '-i', abs, '-frames:v', '1', '-vf', vf, '-q:v', '5', tmp], 20000);
    if (!ok || !fs.existsSync(tmp)) ok = await ffmpeg(['-v', 'error', '-y', '-i', abs, '-frames:v', '1', '-vf', vf, '-q:v', '5', tmp], 20000);
    if (ok && fs.existsSync(tmp) && fs.statSync(tmp).size > 0) { fs.renameSync(tmp, jpg); return jpg; }
    try { fs.unlinkSync(tmp); } catch { /* không có file tạm */ }
    try { fs.writeFileSync(none, ''); } catch { /* cache không ghi được: lần sau thử lại */ }
    return null;
  }).finally(() => pending.delete(k));
  chain = job.catch(() => null);
  pending.set(k, job);
  return job;
}
