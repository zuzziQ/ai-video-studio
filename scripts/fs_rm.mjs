// rmSync thay cho fs.rmSync: trên Windows, Node 24 (fs.rmSync viết lại bằng C++) im lặng KHÔNG xoá khi đường dẫn đầy đủ
// có ký tự ngoài ASCII (dự án "Nhà Đẹp", tên người dùng có dấu…): không ném lỗi, file vẫn còn. fs.unlinkSync, fs.rmdirSync và
// fs.promises.rm không dính lỗi này. Đường dẫn ASCII, macOS/Linux: gọi thẳng fs.rmSync như cũ.
// Cùng tuỳ chọn { recursive, force } với fs.rmSync; liên kết (symlink, junction) chỉ xoá chính liên kết, không đi vào trong.
import fs from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line no-control-regex
const ASCII = /^[\x00-\x7f]*$/;
const err = (code, msg, p) => Object.assign(new Error(`${code}: ${msg}, rm '${p}'`), { code, path: p, syscall: 'rm' });

export function rmSync(p, o = {}) {
  p = String(p);
  if (process.platform !== 'win32' || ASCII.test(p)) return fs.rmSync(p, o);
  let st;
  try { st = fs.lstatSync(p); } catch (e) { if (e.code === 'ENOENT' && o.force) return; throw e; }
  if (!st.isDirectory() || st.isSymbolicLink()) return fs.unlinkSync(p); // junction trên Windows: lstat báo symbolic link
  if (!o.recursive) throw err('ERR_FS_EISDIR', 'Path is a directory', p);
  for (const n of fs.readdirSync(p)) rmSync(path.join(p, n), o);
  fs.rmdirSync(p);
}
