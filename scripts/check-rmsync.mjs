#!/usr/bin/env node
// check-rmsync.mjs — Guard (S23 M157): mã trong scripts/ và studio/ xoá file bằng rmSync của scripts/fs_rm.mjs, không gọi
// fs.rmSync trực tiếp. Lý do: Node 24 trên Windows, fs.rmSync im lặng không xoá khi đường dẫn có ký tự ngoài ASCII (dự án
// "Nhà Đẹp", tên người dùng có dấu), không ném lỗi. Bài devmem ai-video-studio-055.
//
// BÁO (exit 1) mỗi chỗ trong scripts/**, studio/** (.js, .mjs, .cjs) có:
//   - <đối tượng bất kỳ>.rmSync / <đối tượng>['rmSync'] (fs.rmSync, nodeFs.rmSync, x.rmSync.call…);
//   - rmSync lấy thẳng từ fs: `import { rmSync } from 'node:fs'` (kể cả viết nhiều dòng), `const { rmSync } = fs`,
//     `= require('fs')`.
// rmSync của fs_rm.mjs được gọi trần (`rmSync(p, …)`), nên không bị bắt. Chú thích `// …` không tính.
// Bỏ qua: scripts/fs_rm.mjs (chỗ duy nhất được gọi), scripts/tests/ (dọn thư mục tạm của test), node_modules, vendor, thumbs,
// liên kết (junction, symlink). Dòng có `rmsync-ok` được bỏ qua (một ngoại lệ có lý do, ghi lý do cạnh đó).
//
// Chạy:  node scripts/check-rmsync.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIR = new Set(['node_modules', 'vendor', 'thumbs']);
const SKIP_REL = new Set(['scripts/fs_rm.mjs', 'scripts/tests']);
const EXTS = new Set(['.js', '.mjs', '.cjs']);
const FS = String.raw`['"](?:node:)?fs['"]`;
const BAD = [
  /\.\s*rmSync\s*(?:[(),;.\]}]|$)/gm, // gọi, truyền như giá trị, .call — không bắt chữ "fs.rmSync của Node" trong thông báo
  /\[\s*(['"`])rmSync\1\s*\]/g,
  new RegExp(String.raw`\bimport\s*\{[^}]*\brmSync\b[^}]*\}\s*from\s*${FS}`, 'g'),
  new RegExp(String.raw`\{[^}]*\brmSync\b[^}]*\}\s*=\s*(?:fs\b|require\(\s*${FS}\s*\))`, 'g'),
];

/** Chỗ vi phạm trong một đoạn mã: [{ line, text }] (dòng 1-based, mỗi dòng một lần). */
export function findRmSync(src) {
  const lines = String(src).split(/\r?\n/);
  // Bỏ chú thích dòng (giữ độ dài để vị trí khớp) và dòng có rmsync-ok
  const code = lines.map(l => (l.includes('rmsync-ok') ? '' : l.replace(/(^|\s)\/\/.*$/, (m, a) => a + ' '.repeat(m.length - a.length)))).join('\n');
  const hit = new Set();
  for (const re of BAD) for (const m of code.matchAll(re)) hit.add(code.slice(0, m.index + m[0].length).split('\n').length);
  return [...hit].sort((a, b) => a - b).map(line => ({ line, text: lines[line - 1].trim() }));
}

function* walk(dir, root) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name), rel = relative(root, p).split('\\').join('/');
    if (SKIP_REL.has(rel)) continue;
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) yield* walk(p, root); } // Dirent: liên kết không phải thư mục, không đi vào
    else if (e.isFile() && EXTS.has(extname(e.name))) yield [p, rel];
  }
}

export function scan(root = ROOT) {
  const hits = [];
  for (const top of ['scripts', 'studio']) {
    for (const [f, file] of walk(join(root, top), root)) for (const h of findRmSync(readFileSync(f, 'utf8'))) hits.push({ file, ...h });
  }
  return hits;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const hits = scan();
  for (const h of hits) console.log(`::error file=${h.file},line=${h.line}::gọi rmSync của node:fs trực tiếp, dùng rmSync của scripts/fs_rm.mjs (Windows bỏ qua đường dẫn có dấu): ${h.text.slice(0, 160)}`);
  if (hits.length) { console.error(`check-rmsync: ${hits.length} chỗ dùng rmSync của node:fs ngoài scripts/fs_rm.mjs`); process.exit(1); }
  console.log('check-rmsync: không có rmSync của node:fs ngoài scripts/fs_rm.mjs');
}
