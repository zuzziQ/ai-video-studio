#!/usr/bin/env node
// Cài thư viện Node cho một checkout mới (worktree .claude/worktrees/<tên>/ không có scripts/node_modules):
// chạy `npm ci --prefer-offline` trong scripts/ CHỈ khi thiếu. Hook SessionStart (.claude/settings.json) gọi file này;
// chạy tay: `node scripts/worktree-setup.mjs`. Có node_modules thì thoát ngay, im lặng. Lỗi không chặn phiên (luôn exit 0).
// Python không cần cài: scripts/platform.mjs (findVenvPython) dùng scripts/.venv của thư mục chính khi worktree không có.
// KHÔNG mklink /J hay symlink node_modules/.venv sang thư mục chính: `git worktree remove --force` trên Windows đi theo
// junction và xoá sạch thư mục đích (đã mất node_modules thật một lần); npm ci vào một liên kết cũng xoá đích.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const NM = path.join(SCRIPTS, 'node_modules');
const say = s => process.stdout.write(`worktree-setup: ${s}\n`);

/** 'ok' | 'link' | 'missing' | 'nolock' — trạng thái scripts/node_modules (tách ra để test). */
export function nodeModulesState(scripts = SCRIPTS) {
  if (!fs.existsSync(path.join(scripts, 'package-lock.json'))) return 'nolock';
  const nm = path.join(scripts, 'node_modules');
  let st = null;
  try { st = fs.lstatSync(nm); } catch { return 'missing'; }
  // junction trên Windows: lstat báo isSymbolicLink()
  if (st.isSymbolicLink()) return 'link';
  return fs.existsSync(path.join(nm, '.package-lock.json')) ? 'ok' : 'missing';
}

function main() {
  const state = nodeModulesState();
  if (state === 'ok' || state === 'nolock') return;
  if (state === 'link') {
    say('scripts/node_modules là junction/symlink, không cài vào đó: chỉ gỡ liên kết (Windows: rmdir scripts\\node_modules, không /s; macOS/Linux: rm scripts/node_modules, không -r) rồi chạy "node scripts/worktree-setup.mjs".');
    return;
  }
  // một lần mỗi checkout: hai phiên mở cùng lúc thì phiên sau bỏ qua
  const lock = path.join(os.tmpdir(), `avs-worktree-setup-${crypto.createHash('sha1').update(SCRIPTS.toLowerCase()).digest('hex').slice(0, 12)}`);
  try { if (Date.now() - fs.statSync(lock).mtimeMs > 15 * 60e3) fs.rmdirSync(lock); } catch { /* không có khoá */ }
  try { fs.mkdirSync(lock); } catch { return; }
  try {
    const t = Date.now();
    // một chuỗi lệnh cố định (không có dữ liệu ngoài): shell để Windows chạy được npm.cmd
    const r = spawnSync('npm ci --prefer-offline --no-audit --no-fund --loglevel=error', { cwd: SCRIPTS, shell: true, encoding: 'utf8', windowsHide: true, timeout: 280e3 });
    if (r.status === 0 && nodeModulesState() === 'ok') say(`đã cài scripts/node_modules (npm ci, ${Math.round((Date.now() - t) / 1000)} s)`);
    else say(`npm ci trong scripts/ lỗi (${r.error?.message || `mã ${r.status}`}): chạy tay "cd scripts && npm ci". ${String(r.stderr || '').trim().split(/\r?\n/).slice(-2).join(' ')}`);
  } finally { try { fs.rmdirSync(lock); } catch { /* đã gỡ */ } }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { say(`bỏ qua: ${e.message}`); }
  process.exitCode = 0;
}
