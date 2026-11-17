// Bám mặt theo thời gian cho bubble / PIP (engine/vertical.js faceAt): chạy face_track.py trên khung hình a-roll của dự án
// và ghi timeline.face_track = {seq, keys:[{t, ox, oy, fs}]} (t = thời gian trong chuỗi khung, ox/oy/fs = % khung hình).
//   node scripts/face_track_project.mjs <project_dir | timeline.json> [--fps 5]
// Dùng cho dự án đã có (new_project.mjs tự gọi attachFaceTrack khi tạo dự án). Ghi timeline.json (+ .bak).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pyBin } from './platform.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Keys the smoother holds steady repeat the previous value: keep only the ones that change (plus the last).
export function compactKeys(keys) {
  const out = [];
  keys.forEach((k, i) => {
    const p = out[out.length - 1], same = p && p.ox === k.ox && p.oy === k.oy && p.fs === k.fs;
    if (!same || i === keys.length - 1) out.push({ t: k.t, ox: k.ox, oy: k.oy, fs: k.fs });
  });
  return out;
}

// The a-roll frame sequence: the first clip playing an image sequence, else timeline.aroll.frames.
export function arollSeq(tl) {
  const c = (tl.clips || []).find(x => x.src && typeof x.src === 'object' && x.src.seq);
  return c ? { seq: c.src.seq, fps: c.src.fps || tl.fps || 30 } : tl.aroll?.frames ? { seq: tl.aroll.frames, fps: tl.fps || 30 } : null;
}

// S13 · M103: where the speaker's head is over [t0, t1] (whole video by default), in % of the frame, for placing graphics.
// From timeline.face_track (hairline→chin box: centre ox/oy, height fs) with hair above and a little margin; 10th–90th
// percentile so one bad detection does not widen the zone. No track → the fixed timeline.face; no face at all → null.
// → { x0, x1, y0, y1 } (% of frame width / height)
export function faceZone(tl, t0 = 0, t1 = Infinity) {
  const vert = (tl.height || 1920) > (tl.width || 1080), ar = (tl.height || 1920) / (tl.width || 1080); // frame height / width (4:5, 1:1 too)
  let keys = (tl.face_track?.keys || []).filter(k => k.t >= t0 - .3 && k.t <= t1 + .3);
  if (!keys.length && tl.face_track?.keys?.length) keys = tl.face_track.keys; // range between two keys: use the whole track
  const box = k => { const w = k.fs * .85 * ar; return { x0: k.ox - w / 2, x1: k.ox + w / 2, y0: k.oy - k.fs * .65, y1: k.oy + k.fs * .5 }; };
  let boxes = keys.map(box);
  if (!boxes.length && tl.face) {
    const [DW, DH] = tl.design || (vert ? [720, 1280] : [1280, 720]); // timeline.face is in design px (find_face.py --design)
    boxes = [box({ ox: tl.face.x / DW * 100, oy: tl.face.y / DH * 100, fs: vert ? 24 : 40 })]; // typical talking-head face height
  }
  if (!boxes.length) return null;
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]; };
  const c = v => Math.round(Math.max(0, Math.min(100, v)));
  return { x0: c(q(boxes.map(b => b.x0), .1)), x1: c(q(boxes.map(b => b.x1), .9)), y0: c(q(boxes.map(b => b.y0), .1)), y1: c(q(boxes.map(b => b.y1), .9)) };
}

// Runs face_track.py on <dir>/<seq folder>; returns {seq, keys} or null (no person / no detector).
export async function faceTrack(dir, seq, { fps = 5, srcFps = 30, py = pyBin(SKILL) } = {}) {
  const out = path.join(os.tmpdir(), `avs_ft_${process.pid}_${Date.now()}.json`);
  await new Promise((res, rej) => {
    const p = spawn(py, ['-I', '-X', 'utf8', path.join(SKILL, 'scripts/face_track.py'), path.join(dir, path.dirname(seq)), '--src-fps', String(srcFps), '--fps', String(fps), '--out', out], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', d => { err += d; });
    p.on('error', rej); p.on('close', c => (c ? rej(new Error(err.trim().split('\n').pop() || `face_track.py thoát ${c}`)) : res()));
  });
  try {
    const j = JSON.parse(fs.readFileSync(out, 'utf8'));
    return j.found > .3 && j.keys?.length ? { seq, keys: compactKeys(j.keys) } : null;
  } finally { fs.rmSync(out, { force: true }); }
}

export async function attachFaceTrack(tlFile, o = {}) {
  const dir = path.dirname(tlFile), tl = JSON.parse(fs.readFileSync(tlFile, 'utf8')), a = arollSeq(tl);
  if (!a) throw new Error('Dự án không có chuỗi khung hình a-roll để bám mặt.');
  const ft = await faceTrack(dir, a.seq, { srcFps: a.fps, ...o });
  if (!ft) return null;
  fs.copyFileSync(tlFile, tlFile + '.bak');
  tl.face_track = ft;
  fs.writeFileSync(tlFile, JSON.stringify(tl, null, 1));
  return ft;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  // PowerShell / cmd hand "~" over literally: expand it here
  const a = process.argv.slice(2), src = a.find(x => !x.startsWith('--'))?.replace(/^~(?=$|[\\/])/, os.homedir());
  if (!src) { console.error('usage: node scripts/face_track_project.mjs <project_dir|timeline.json> [--fps 5]'); process.exit(2); }
  const i = a.indexOf('--fps'), tlFile = src.endsWith('.json') ? path.resolve(src) : path.resolve(src, 'timeline.json');
  try {
    const ft = await attachFaceTrack(tlFile, i >= 0 ? { fps: +a[i + 1] } : {});
    console.log(ft ? `Đã bám mặt: ${ft.keys.length} điểm → ${tlFile}` : 'Không thấy mặt người trong clip — giữ vị trí mặt cố định.');
  } catch (e) { console.error(e.message); process.exit(1); }
}
