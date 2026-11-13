// Nhân bản một dự án (dự án anh em của biến thể, M54) mà không chép lại khung hình.
// - macOS: clone APFS (`cp -cR`), không tốn thêm dung lượng; lỗi (ổ không phải APFS) thì đi đường dưới.
// - Nơi khác (Windows NTFS, Linux): liên kết cứng (hard link) cho phần coi là CHỈ ĐỌC — khung `work/frames/**`,
//   `media/*_frames/**` và video nguồn (`.mp4 .mov .m4v .webm .mkv` trong `media/` và `work/`); mọi file khác
//   (timeline.json, .studio/…, ảnh, work/mix.wav…) chép thật để bản anh em sửa thoải mái.
// - Liên kết lỗi (khác ổ đĩa EXDEV, FS không hỗ trợ, quá 1023 liên kết/ file trên NTFS EMLINK…) thì chép thật file đó.
//   `AVS_VARIANT_LINK=0` tắt hẳn liên kết (chép đủ như trước).
// Quy tắc đi kèm: file được liên kết dùng chung inode với bản gốc, nên KHÔNG được ghi đè tại chỗ; muốn thay thì xoá
// (hoặc ghi file tạm rồi rename) để tạo inode mới. Spec: references/qc-variants.md ("Dự án anh em và liên kết cứng").
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';

const VIDEO = /\.(mp4|mov|m4v|webm|mkv)$/i;
// Lỗi coi như "FS/ổ này không liên kết được": tắt liên kết cho phần còn lại của lần nhân bản.
const NO_LINK = new Set(['EXDEV', 'EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EACCES', 'EINVAL']);

/** rel: đường dẫn tương đối trong dự án (dấu / hoặc \). true = file chỉ đọc, được liên kết cứng thay vì chép. */
export function isShared(rel) {
  const p = String(rel).replace(/\\/g, '/').replace(/^\.\//, '');
  if (p.startsWith('work/frames/')) return true;
  if (/^media\/[^/]+_frames\//.test(p)) return true;
  return VIDEO.test(p) && /^(media|work)\/[^/]+$/.test(p);
}

const norm = r => r.replace(/\\/g, '/');
const skipped = (rel, skip) => skip.some(s => rel === s || rel.startsWith(s + '/'));

/**
 * Nhân bản thư mục dự án src → dst (dst chưa tồn tại).
 * o: { skip: ['out', '.studio/qc', …] (tương đối, bỏ qua cả cây), link: true, clone: process.platform === 'darwin' }
 * Trả { method: 'clone'|'link'|'copy', linked, copied, linkedBytes, copiedBytes, fallback: mã lỗi khiến phải chép | null }.
 */
export function cloneProject(src, dst, o = {}) {
  const skip = (o.skip || []).map(norm);
  const link = o.link ?? process.env.AVS_VARIANT_LINK !== '0';
  const clone = o.clone ?? process.platform === 'darwin';
  const st = { method: link ? 'link' : 'copy', linked: 0, copied: 0, linkedBytes: 0, copiedBytes: 0, fallback: null };
  if (fs.existsSync(dst)) throw new Error(`đích đã có: ${dst}`);
  if (clone && link) {
    try {
      execFileSync('cp', ['-cR', src, dst], { stdio: 'ignore' });
      for (const s of skip) fs.rmSync(path.join(dst, s), { recursive: true, force: true });
      return { ...st, method: 'clone' };
    } catch { fs.rmSync(dst, { recursive: true, force: true }); }
  }
  let canLink = link;
  const walk = rel => {
    const from = path.join(src, rel), to = path.join(dst, rel);
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (skipped(r, skip)) continue;
      const a = path.join(from, e.name), b = path.join(to, e.name);
      if (e.isDirectory()) { walk(r); continue; }
      if (e.isSymbolicLink()) { fs.cpSync(a, b, { verbatimSymlinks: true }); continue; }
      const size = fs.statSync(a).size;
      if (canLink && isShared(r)) {
        try { fs.linkSync(a, b); st.linked++; st.linkedBytes += size; continue; }
        catch (err) { st.fallback = st.fallback || err.code || 'ERR'; if (NO_LINK.has(err.code)) canLink = false; }
      }
      fs.copyFileSync(a, b); st.copied++; st.copiedBytes += size;
    }
  };
  walk('');
  if (link && !st.linked && st.fallback) st.method = 'copy';
  return st;
}
