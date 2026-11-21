// S29 M212 · Job nền `bake` (scripts/queue.mjs): nướng chuỗi khung của đoạn in–out của một clip bằng ffmpeg (C39) — phông xanh,
// LUT .cube, HSL, curves, ổn định hình. Lõi thuần (tham số, hash, lệnh ffmpeg): engine/bake.js.
//   node scripts/bake_job.mjs <thư mục dự án> --spec '<JSON { seq, fps, n0, n1, ops, hash }>'
// Kết quả .studio/bake/<hash>/%05d.jpg|png (+ .ok); chuỗi gốc có bản 540p (M213, work/frames_540/.ok) thì nướng luôn bản 540p
// .studio/bake/<hash>_540/. Không ghi timeline.json: Studio đọc kết quả (GET /api/bake) rồi gắn clip.bake.seq (86_bake.js).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { rmSync } from './fs_rm.mjs';

const require = createRequire(import.meta.url);
const B = require('../engine/bake.js'), PP = require('../engine/preview_proxy.js');
const inside = (root, f) => { const r = path.relative(path.resolve(root), path.resolve(f)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
export const HASH = /^[0-9a-f]{16}$/;
const SEQ = /^[\p{L}\p{N} _./-]+\/%05d\.jpg$/u;

/** spec từ route / dòng lệnh → spec đã kiểm lại từ đầu (hash tính lại từ tham số; đường dẫn phải nằm trong dự án) hoặc ném lỗi */
export function checkSpec(dir, raw) {
  const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!s || typeof s.seq !== 'string' || !SEQ.test(s.seq) || s.seq.includes('..')) throw new Error('Chuỗi khung lạ (cần …/%05d.jpg trong dự án)');
  const fps = +s.fps, n0 = Math.floor(+s.n0), n1 = Math.floor(+s.n1);
  if (!(fps > 0 && fps <= 240) || !(n0 >= 1) || !(n1 >= n0) || n1 - n0 > 30 * 60 * 120) throw new Error('Khoảng khung lạ');
  // dựng lại clip tối thiểu rồi để lõi tính hash: không tin hash của bên gọi
  const sp = B.spec({ src: { seq: s.seq, fps, count: n1 }, in: (n0 - 1) / fps, out: (n1 - 1) / fps, bake: s.ops }, fps);
  if (!sp || sp.n0 !== n0 || sp.n1 !== n1) throw new Error('Không có thao tác nào để nướng');
  if (s.hash && s.hash !== sp.hash) throw new Error('Tham số đã đổi (hash lệch), xếp lại việc');
  const frames = path.resolve(dir, path.dirname(sp.seq));
  if (!inside(dir, frames) || !fs.existsSync(frames)) throw new Error('Không thấy thư mục khung của clip trong dự án');
  if (sp.ops.lut) { const f = path.resolve(dir, sp.ops.lut.file); if (!inside(path.join(dir, B.DIR, 'luts'), f) || !fs.existsSync(f)) throw new Error('Không thấy file LUT đã nhập'); }
  return sp;
}
export const outDir = (dir, hash, p540 = false) => path.join(dir, B.DIR, hash + (p540 ? PP.SUFFIX : ''));
/** kết quả đã nướng đủ: { seq, p540, n } hoặc null */
export function readResult(dir, hash) {
  if (!HASH.test(hash || '')) return null;
  try {
    const ok = JSON.parse(fs.readFileSync(path.join(outDir(dir, hash), B.OK), 'utf8'));
    return { seq: ok.seq, n: ok.n, p540: fs.existsSync(path.join(outDir(dir, hash, true), B.OK)), ms: ok.ms };
  } catch { return null; }
}
// cỡ ảnh JPEG (SOF0/SOF2) — ổn định hình cần cỡ gốc để phóng giấu mép
function jpegSize(f) {
  const b = fs.readFileSync(f);
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return {};
}
function ff(args, cwd, onLine) {
  return new Promise((ok, bad) => {
    const p = spawn('ffmpeg', args, { cwd });
    let err = '';
    p.stderr.on('data', d => { err = (err + d).slice(-2000); });
    p.stdout.on('data', d => onLine?.(String(d)));
    p.on('error', bad);
    p.on('close', code => (code === 0 ? ok() : bad(new Error((err.trim().split('\n').pop() || `ffmpeg thoát mã ${code}`).slice(0, 300)))));
  });
}
const count = d => { try { return fs.readdirSync(d).filter(f => /^\d{5}\.(jpg|png)$/.test(f)).length; } catch { return 0; } };

async function bakeInto(dir, final, want, args, p0, p1, msg) {
  const tmp = `${final}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const rel = path.relative(dir, tmp).split(path.sep).join('/');
  const tick = setInterval(() => console.log(`@@ ${(p0 + (p1 - p0) * Math.min(1, count(tmp) / want)).toFixed(3)} ${msg} ${count(tmp)}/${want} khung`), 1000);
  try { await ff(args(rel), dir); } catch (e) { rmSync(tmp, { recursive: true, force: true }); throw e; } finally { clearInterval(tick); }
  if (count(tmp) < want) { rmSync(tmp, { recursive: true, force: true }); throw new Error(`ffmpeg chỉ ra ${count(tmp)}/${want} khung`); }
  rmSync(final, { recursive: true, force: true });
  fs.renameSync(tmp, final);
}

async function main(args) {
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const dir = args[0] && !args[0].startsWith('--') ? path.resolve(args[0]) : null;
  if (!dir || !fs.existsSync(path.join(dir, 'timeline.json'))) { console.log('LỖI: Không thấy dự án (thiếu timeline.json)'); process.exit(2); }
  const sp = checkSpec(dir, opt('--spec'));
  const want = sp.n1 - sp.n0 + 1, final = outDir(dir, sp.hash);
  // việc huỷ / hỏng để lại thư mục tạm: dọn trước
  try { for (const f of fs.readdirSync(path.join(dir, B.DIR))) if (/\.tmp-\d+$/.test(f) && f.startsWith(sp.hash)) rmSync(path.join(dir, B.DIR, f), { recursive: true, force: true }); } catch {}
  const t0 = Date.now();
  if (!readResult(dir, sp.hash)) {
    const first = path.join(dir, path.dirname(sp.seq), String(sp.n0).padStart(5, '0') + '.jpg');
    const dims = sp.ops.stab && fs.existsSync(first) ? jpegSize(first) : {};
    console.log(`@@ 0.02 Nướng ${B.label(sp.ops)} (${want} khung)`);
    await bakeInto(dir, final, want, rel => B.ffArgs(sp, `${rel}/%05d.${sp.ext}`, dims), 0.02, 0.85, 'Đang nướng');
  } else console.log('@@ 0.85 Đã có chuỗi nướng (dùng lại)');
  // M213: nguồn có chuỗi 540p đã trích đủ → nướng luôn bản 540p từ chuỗi vừa nướng (cùng số khung)
  const px = PP.proxySeq(sp.seq), pxOk = px && fs.existsSync(path.join(dir, path.dirname(px), PP.OK));
  if (pxOk && !fs.existsSync(path.join(outDir(dir, sp.hash, true), B.OK))) {
    const f540 = outDir(dir, sp.hash, true), src = `${B.DIR}/${sp.hash}/%05d.${sp.ext}`;
    const pa = PP.ffArgs(src, 'x', sp.n0), scale = pa[pa.indexOf('-vf') + 1]; // cùng cỡ 540p với chuỗi gốc
    await bakeInto(dir, f540, want, rel => ['-v', 'error', '-y', '-start_number', String(sp.n0), '-i', src, '-frames:v', String(want), '-vf', scale,
      ...(sp.ext === 'png' ? ['-compression_level', '3'] : ['-q:v', String(PP.Q)]), '-start_number', String(sp.n0), `${rel}/%05d.${sp.ext}`], 0.85, 0.98, 'Bản 540p');
    fs.writeFileSync(path.join(f540, B.OK), JSON.stringify({ n: want }));
  }
  // .ok của chuỗi chính ghi sau cùng (sau cả bản 540p): Studio thấy "xong" là đã đủ mọi bản
  if (!readResult(dir, sp.hash)) fs.writeFileSync(path.join(final, B.OK), JSON.stringify({ seq: sp.out, n: want, n0: sp.n0, n1: sp.n1, ops: sp.ops, ms: Date.now() - t0, at: new Date().toISOString() }));
  const r = readResult(dir, sp.hash);
  console.log(`@@ 0.99 Xong ${want} khung trong ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log('RESULT ' + JSON.stringify({ hash: sp.hash, seq: r.seq, p540: r.p540, n: r.n }));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2)).catch(e => { console.log('LỖI: ' + String(e.message || e).slice(0, 300)); process.exit(1); });
