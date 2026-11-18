// rmSync thay cho fs.rmSync: trên Windows, Node 24 (fs.rmSync viết lại bằng C++) im lặng KHÔNG xoá khi đường dẫn truyền vào
// có ký tự ngoài ASCII (dự án "Nhà Đẹp", tên người dùng có dấu…): không ném lỗi, file vẫn còn. Gốc ASCII có con có dấu thì vẫn
// xoá đúng. fs.unlinkSync, fs.rmdirSync và fs.promises.rm không dính lỗi này. Đường dẫn ASCII, macOS/Linux: gọi thẳng fs.rmSync.
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
  const gone = e => { if (e.code === 'ENOENT' && o.force) return; throw e; }; // tiến trình khác vừa xoá trước
  let st;
  try { st = fs.lstatSync(p); } catch (e) { return gone(e); }
  if (!st.isDirectory() || st.isSymbolicLink()) { try { return fs.unlinkSync(p); } catch (e) { return gone(e); } } // junction: lstat báo symbolic link
  if (!o.recursive) throw err('ERR_FS_EISDIR', 'Path is a directory', p);
  let names;
  try { names = fs.readdirSync(p); } catch (e) { return gone(e); }
  for (const n of names) rmWin(path.join(p, n), o);
  try { fs.rmdirSync(p); } catch (e) { gone(e); }
}

export function rmSync(p, o = {}) {
  p = String(p);
  // path.resolve: đường dẫn tương đối ASCII dưới thư mục hiện tại có dấu cũng dính lỗi
  if (process.platform !== 'win32' || ASCII.test(path.resolve(p))) return fs.rmSync(p, o);
  const tries = Math.max(0, o.maxRetries | 0), delay = o.retryDelay ?? 100;
  for (let i = 0; ; i++) {
    try { return rmWin(p, o); } catch (e) { if (i >= tries || !RETRY.has(e.code)) throw e; sleep(delay * (i + 1)); }
  }
}
