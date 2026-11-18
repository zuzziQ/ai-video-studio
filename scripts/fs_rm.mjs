// rmSync thay cho fs.rmSync: trên Windows, Node 24 (fs.rmSync viết lại bằng C++) im lặng KHÔNG xoá khi đường dẫn đầy đủ
// có ký tự ngoài ASCII (dự án "Nhà Đẹp", tên người dùng có dấu…): không ném lỗi, file vẫn còn. fs.unlinkSync, fs.rmdirSync và
// fs.promises.rm không dính lỗi này. Đường dẫn ASCII, macOS/Linux: gọi thẳng fs.rmSync như cũ.
// Cùng tuỳ chọn { recursive, force, maxRetries, retryDelay } với fs.rmSync; liên kết (symlink, junction) chỉ xoá chính liên kết,
// không đi vào trong. Mã trong scripts/ và studio/ không gọi fs.rmSync trực tiếp (scripts/check-rmsync.mjs chặn trong CI).
import fs from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line no-control-regex
const ASCII = /^[\x00-\x7f]*$/;
const RETRY = new Set(['EBUSY', 'EMFILE', 'ENFILE', 'ENOTEMPTY', 'EPERM']); // như fs.rmSync: file đang bị giữ (antivirus, ffmpeg vừa thoát)
const err = (code, msg, p) => Object.assign(new Error(`${code}: ${msg}, rm '${p}'`), { code, path: p, syscall: 'rm' });
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function rmWin(p, o) {
  let st;
  try { st = fs.lstatSync(p); } catch (e) { if (e.code === 'ENOENT' && o.force) return; throw e; }
  if (!st.isDirectory() || st.isSymbolicLink()) { // junction trên Windows: lstat báo symbolic link
    try { return fs.unlinkSync(p); } catch (e) { if (e.code === 'ENOENT' && o.force) return; throw e; }
  }
  if (!o.recursive) throw err('ERR_FS_EISDIR', 'Path is a directory', p);
  for (const n of fs.readdirSync(p)) rmWin(path.join(p, n), o);
  try { fs.rmdirSync(p); } catch (e) { if (e.code === 'ENOENT' && o.force) return; throw e; }
}

export function rmSync(p, o = {}) {
  p = String(p);
  if (process.platform !== 'win32' || ASCII.test(p)) return fs.rmSync(p, o);
  const tries = Math.max(0, o.maxRetries | 0), delay = o.retryDelay ?? 100;
  for (let i = 0; ; i++) {
    try { return rmWin(p, o); } catch (e) { if (i >= tries || !RETRY.has(e.code)) throw e; sleep(delay * (i + 1)); }
  }
}
