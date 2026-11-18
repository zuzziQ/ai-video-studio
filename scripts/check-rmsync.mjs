#!/usr/bin/env node
// check-rmsync.mjs — Guard (S23 M157): mã trong scripts/ và studio/ xoá file bằng rmSync của scripts/fs_rm.mjs, không gọi
// fs.rmSync trực tiếp. Lý do: Node 24 trên Windows, fs.rmSync im lặng không xoá khi đường dẫn có ký tự ngoài ASCII (dự án
// "Nhà Đẹp", tên người dùng có dấu), không ném lỗi. Bài devmem ai-video-studio-055.
//
// BÁO (exit 1) mỗi dòng của scripts/**, studio/** (.js, .mjs) có:
//   - fs.rmSync( … ) (hay fs.rmSync truyền như giá trị);
//   - rmSync lấy thẳng từ node:fs: `import { rmSync } from 'node:fs'`, `const { rmSync } = fs` / `require('fs')`.
// Bỏ qua: scripts/fs_rm.mjs (chỗ duy nhất được gọi), scripts/tests/ (dọn thư mục tạm ASCII của test), node_modules, vendor.
// Dòng có chú thích `rmsync-ok` được bỏ qua (một ngoại lệ có lý do, ghi lý do cạnh đó).
//
// Chạy:  node scripts/check-rmsync.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIR = new Set(['node_modules', 'vendor', 'thumbs', 'tests']);
const SKIP_FILE = new Set(['scripts/fs_rm.mjs']);
const EXTS = new Set(['.js', '.mjs']);
const BAD = [
  /\bfs\.rmSync\s*[(),;.\]}]/,
  /\bimport\s*\{[^}]*\brmSync\b[^}]*\}\s*from\s*['"](?:node:)?fs['"]/,
  /\{[^}]*\brmSync\b[^}]*\}\s*=\s*(?:fs\b|require\(\s*['"](?:node:)?fs['"]\s*\))/,
];

/** Dòng vi phạm trong một đoạn mã: [{ line, text }]. */
export function findRmSync(src) {
  const out = [];
  String(src).split(/\r?\n/).forEach((text, i) => {
    if (text.includes('rmsync-ok')) return;
    const code = text.replace(/^\s*\/\/.*$/, ''); // dòng chú thích không tính
    if (BAD.some(re => re.test(code))) out.push({ line: i + 1, text: text.trim() });
  });
  return out;
}

function* walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!SKIP_DIR.has(n)) yield* walk(p); }
    else if (EXTS.has(extname(n))) yield p;
  }
}

export function scan(root = ROOT) {
  const hits = [];
  for (const top of ['scripts', 'studio']) {
    for (const f of walk(join(root, top))) {
      const rel = relative(root, f).split('\\').join('/');
      if (SKIP_FILE.has(rel)) continue;
      for (const h of findRmSync(readFileSync(f, 'utf8'))) hits.push({ file: rel, ...h });
    }
  }
  return hits;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const hits = scan();
  for (const h of hits) console.log(`::error file=${h.file},line=${h.line}::fs.rmSync trực tiếp — dùng rmSync của scripts/fs_rm.mjs (Windows bỏ qua đường dẫn có dấu): ${h.text.slice(0, 160)}`);
  if (hits.length) { console.error(`check-rmsync: ${hits.length} chỗ gọi fs.rmSync ngoài scripts/fs_rm.mjs`); process.exit(1); }
  console.log('check-rmsync: không có fs.rmSync ngoài scripts/fs_rm.mjs');
}
