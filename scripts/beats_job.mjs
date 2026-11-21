// S28 M210 · Job nền `beats` (scripts/queue.mjs): phân tích nhịp một file nhạc của dự án bằng scripts/beats.py.
//   node scripts/beats_job.mjs <thư mục dự án> (--file <đường dẫn trong dự án> | --mood <tên nhạc thư viện>)
// Kết quả .studio/beats/<khoá>.json { src, size, mtime, bpm, beats, downbeats, dur, at } (cache theo cỡ + giờ sửa của file).
// Không ghi timeline.json: Studio đọc kết quả (GET /api/beats) rồi gắn vào khối nhạc một bước hoàn tác (studio/features/33_beats.js).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pyBin } from './platform.mjs';
import { rmSync } from './fs_rm.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|ogg|opus|mp4|mov|m4v|webm|mkv)$/i;
const inside = (root, f) => { const r = path.relative(path.resolve(root), path.resolve(f)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };

/** File nhạc cần phân tích: --file trong thư mục dự án (hoặc trong assets/music của app), --mood = assets/music/<mood>.* */
export function resolveSource(dir, { file, mood } = {}) {
  if (typeof mood === 'string' && mood) {
    if (!/^[a-z0-9_-]{1,40}$/i.test(mood)) return null;
    const d = path.join(SKILL, 'assets', 'music');
    const hit = ['.mp3', '.m4a', '.wav', '.ogg', '.flac'].map(x => path.join(d, mood + x)).find(f => fs.existsSync(f));
    return hit || null;
  }
  if (typeof file !== 'string' || !file || !AUDIO_EXT.test(file)) return null;
  const f = path.resolve(dir, file);
  if (!inside(dir, f) && !inside(path.join(SKILL, 'assets', 'music'), f)) return null;
  return fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
}
export function cacheFile(dir, src) {
  const st = fs.statSync(src), key = crypto.createHash('sha1').update(`${path.resolve(src).toLowerCase()}|${st.size}|${Math.round(st.mtimeMs)}`).digest('hex').slice(0, 16);
  return path.join(dir, '.studio', 'beats', key + '.json');
}
export function readResult(dir, src) {
  try { const f = cacheFile(dir, src); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; } catch { return null; }
}

function runPy(argv) {
  return new Promise((ok, bad) => {
    const p = spawn(pyBin(SKILL), argv, { cwd: SKILL });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
    p.on('error', bad);
    p.on('close', code => (code === 0 ? ok(out) : bad(new Error((err.trim().split('\n').pop() || `beats.py thoát mã ${code}`).slice(0, 300)))));
  });
}

async function main(args) {
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const dir = args[0] && !args[0].startsWith('--') ? path.resolve(args[0]) : null;
  if (!dir || !fs.existsSync(path.join(dir, 'timeline.json'))) { console.log('LỖI: Không thấy dự án (thiếu timeline.json)'); process.exit(2); }
  const src = resolveSource(dir, { file: opt('--file'), mood: opt('--mood') });
  if (!src) { console.log('LỖI: Không thấy file nhạc trong dự án'); process.exit(2); }
  const out = cacheFile(dir, src);
  if (fs.existsSync(out)) { console.log('@@ 0.99 Đã có nhịp (dùng lại)'); console.log('RESULT ' + JSON.stringify({ beats: path.relative(dir, out) })); return; }
  console.log('@@ 0.1 Đang phân tích nhịp');
  const tmp = `${out}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try { await runPy(['-I', '-X', 'utf8', path.join(SKILL, 'scripts', 'beats.py'), src, '-o', tmp]); }
  catch (e) { rmSync(tmp, { force: true }); throw e; }
  const r = JSON.parse(fs.readFileSync(tmp, 'utf8')), st = fs.statSync(src);
  delete r.levels; // độ to theo khung chỉ dùng cho gói beatslide; Studio không cần
  fs.writeFileSync(tmp, JSON.stringify({ src: path.relative(dir, src), size: st.size, mtime: Math.round(st.mtimeMs), ...r, at: new Date().toISOString() }));
  fs.renameSync(tmp, out);
  console.log(`@@ 0.99 ${r.bpm} BPM, ${(r.beats || []).length} phách`);
  console.log('RESULT ' + JSON.stringify({ beats: path.relative(dir, out), bpm: r.bpm }));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2)).catch(e => { console.log('LỖI: ' + String(e.message || e).slice(0, 300)); process.exit(1); });
