// "Video mới": raw talking-head video → starter project (shared by studio/server.mjs /api/new and scripts/autopilot.mjs).
// usage: node scripts/new_project.mjs <video> [project_dir] [--model large-v3-turbo] [--lang vi|auto] [--pack slate] [--title "…"]
//                                     [--orient vertical|horizontal|auto] [--brand <id>]
// Không có project_dir: kèm --brand → <Kho của thương hiệu>/Du an/<tên>; không kèm → cạnh video (như bản cũ).
// Steps: whisper (transcribe.py) → cut silences (cut.py) → 30 fps frames → face position (find_face.py) → captions (captions.py)
// → timeline.json (frame_grid + title_card, music bed). Progress lines "@@ <0..1> <step>" on stdout; exit ≠ 0 + Vietnamese error.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pyBin } from './platform.mjs';
import { projectFix, fixArgs, fixWords } from './dict.mjs';
import { faceTrack } from './face_track_project.mjs';
import { forbiddenDir, AVS_HOME } from '../studio/security.mjs';
import { freeName, workspaceFor, ensureWorkspace, projectDirFor, workspaceOfProject, writeSource, hashFile, sub } from './workspace.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PY = pyBin(SKILL);

// Plain runner (the server passes its own, which also records job.proc for "Dừng").
export function runCmd(cmd, argv, onLine, { cwd } = {}) {
  return new Promise((ok, bad) => {
    const p = spawn(cmd, argv, { cwd: cwd || process.cwd() });
    let log = '';
    const feed = d => { const s = d.toString(); log = (log + s).slice(-4000); s.split(/[\r\n]/).forEach(l => l && onLine && onLine(l)); };
    p.stdout.on('data', feed); p.stderr.on('data', feed);
    p.on('error', bad);
    p.on('close', code => (code === 0 ? ok(log) : bad(Object.assign(new Error(`${path.basename(cmd)} lỗi (mã ${code})`), { log }))));
  });
}

// Display orientation of a video (rotation metadata included): 'vertical' | 'horizontal'.
/** Tiêu đề + viên thương hiệu cho thẻ kết (title_card) theo brand kit; không có thì tiêu đề trống, không viên. S16 M120. */
export function endCard(brand, title = '') {
  const name = String(brand?.name || '').trim();
  return { title: name || String(title || '').trim() || [{ text: '' }], pill: name ? { icon: brand.logo || '', text: name } : false };
}
export function videoOrient(src) {
  try {
    const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation:stream_tags=rotate', '-of', 'json', src]).toString());
    const s = j.streams?.[0] || {};
    const rot = Math.abs(+(s.side_data_list?.find(x => x.rotation != null)?.rotation ?? s.tags?.rotate ?? 0)) % 180;
    const [w, h] = rot === 90 ? [s.height, s.width] : [s.width, s.height];
    return h > w ? 'vertical' : 'horizontal';
  } catch { return 'vertical'; }
}

/**
 * Build the starter project. Returns the project dir.
 * o: { video, dir?, model='large-v3-turbo', pack='slate', title='', orient='vertical'|'horizontal'|'auto', lang?, brand? (brand kit id),
 *      kho=true (không có dir → <Kho>/Du an/<tên>; false = cạnh video như bản cũ) }
 * env: { run(cmd, argv, onLine) → Promise, onStep(text, progress) }
 */
export async function newProject({ video, dir, model = 'large-v3-turbo', pack = 'slate', title = '', orient = 'vertical', lang, brand, kho = true },{ run = runCmd, onStep = () => {} } = {}) {
  const src = path.resolve(String(video).trim().replace(/^["']|["']$/g, '').replace(/^~(?=[\\/]|$)/, os.homedir()));
  if (!fs.existsSync(src)) throw new Error(`không thấy video ${src}`);
  if (orient === 'auto') orient = videoOrient(src);
  let kit = null;
  if (brand) {
    const { loadBrand } = await import('./batch.mjs');
    kit = /^[a-z0-9][a-z0-9-]{0,39}$/.test(String(brand)) ? loadBrand(String(brand)) : null;
    if (!kit) throw new Error(`không thấy thương hiệu "${String(brand).slice(0, 40)}"`);
  }
  // S12 M98: không có `dir` → <Kho của thương hiệu>/Du an/<tiêu đề hoặc tên video> (Kho Chung khi không có thương hiệu).
  // kho:false (CLI cũ gọi không kèm --brand) giữ đường cũ: cạnh video, video trong thư mục cấu hình → ~/.ai-video-studio/footage/.
  let ws = null, d;
  if (dir) d = path.resolve(dir);
  else if (kho) { ws = ensureWorkspace(workspaceFor(brand || '')); d = projectDirFor(ws, String(title || '').trim() || path.basename(src, path.extname(src))); }
  else {
    const base = path.basename(src, path.extname(src)) + '_studio';
    const foot = path.join(AVS_HOME(), 'footage'); // two uploads with the same name must not overwrite each other's project
    d = path.resolve(forbiddenDir(path.dirname(src)) ? path.join(foot, fs.existsSync(foot) ? freeName(foot, base) : base) : path.join(path.dirname(src), base));
  }
  const why = forbiddenDir(d); // check before whisper runs, not after minutes of work
  if (why) throw new Error(`Không tạo dự án ở ${d}: ${why} — chọn thư mục dự án khác`);
  fs.mkdirSync(path.join(d, 'work/frames'), { recursive: true });
  try { return await build(d, ws, { src, model, pack, title, orient, lang, kit }, { run, onStep }); }
  catch (e) {
    // thư mục Studio tự đặt trong Du an/: lỗi giữa chừng thì không để lại thư mục rỗng (chỉ đúng một cấp dưới Du an/, chưa có timeline)
    if (ws && path.dirname(d) === sub(ws, 'projects') && !['', '.', '..'].includes(path.basename(d)) && !fs.existsSync(path.join(d, 'timeline.json'))) fs.rmSync(d, { recursive: true, force: true });
    throw e;
  }
}
async function build(d, ws, { src, model, pack, title, orient, lang, kit }, { run, onStep }) {
  const sha = hashFile(src).catch(() => null); // song song với whisper: video vài GB không làm chậm thêm
  const S = f => path.join(SKILL, 'scripts', f);
  onStep('Nhận dạng giọng nói (whisper)', .05);
  await run(PY, ['-I', '-X', 'utf8', S('transcribe.py'), src, path.join(d, 'work/words_raw.json'), '--model', model, ...(lang && lang !== 'vi' ? ['--lang', lang] : [])]);
  // S16 M119: transcribe.py đã bỏ lời whisper bịa; không còn lời thật → dự án "không lời" (không phụ đề, không cắt theo lời)
  let speech = null;
  try { const m = JSON.parse(fs.readFileSync(path.join(d, 'work/words_raw.json.meta.json'), 'utf8')); if (m && m.speech === false) speech = { none: true, dropped: (m.dropped || []).length, ...(m.noAudio ? { noAudio: true } : {}) }; } catch { /* bản cũ của transcribe.py: không có meta */ }
  onStep(speech ? 'Video không có lời nói: giữ nguyên cả clip' : 'Cắt khoảng lặng', .45);
  fs.rmSync(path.join(d, 'work/aroll.mp4'), { force: true }); // M54: không ghi đè tại chỗ (có thể là liên kết cứng của bản anh em)
  await run(PY, ['-I', '-X', 'utf8', S('cut.py'), src, path.join(d, 'work/words_raw.json'), path.join(d, 'work')]);
  onStep(`Trích khung hình ${orient === 'horizontal' ? '16:9' : '9:16'}`, .6);
  const [FW, FH] = orient === 'horizontal' ? [1280, 720] : [720, 1280];
  // stale frames from an interrupted earlier run would make the clip longer than the audio
  for (const f of fs.readdirSync(path.join(d, 'work/frames'))) if (f.endsWith('.jpg')) fs.rmSync(path.join(d, 'work/frames', f));
  await run('ffmpeg', ['-v', 'error', '-y', '-i', path.join(d, 'work/aroll.mp4'), '-vf', `scale=${FW}:${FH}:force_original_aspect_ratio=increase,crop=${FW}:${FH}`, '-q:v', '3', path.join(d, 'work/frames/%05d.jpg')]);
  // timeline.face (bubble / PIP / hook anchor): find_face.py on a few frames; keep the default if no person is found.
  onStep('Tìm vị trí mặt', .75);
  let face = orient === 'horizontal' ? { x: 640, y: 300 } : { x: 360, y: 520 };
  await run(PY, ['-I', '-X', 'utf8', S('find_face.py'), path.join(d, 'work/frames'), '--design', `${FW}x${FH}`], l => { try { const f = JSON.parse(l); if (f.x != null) face = f; } catch {} }).catch(() => {});
  // face over time for bubble / PIP (engine/vertical.js faceAt); none → the fixed face above
  const faceTr = await faceTrack(d, 'work/frames/%05d.jpg', { py: PY }).catch(() => null);
  onStep('Tạo phụ đề', .85);
  const fix = projectFix({ dir: d }), keep = fixWords(fix); // M89: dictionary of the default brand kit
  await run(PY, ['-I', '-X', 'utf8', S('captions.py'), path.join(d, 'work/words.json'), path.join(d, 'work/captions.json'), '--max', '4', ...fixArgs(fix)]);
  const caps = JSON.parse(fs.readFileSync(path.join(d, 'work/captions.json'), 'utf8'));
  for (const c of caps) for (const w of c.words) { w.w = w.w.replace(/[.,!?]+$/, ''); if (!keep.has(w.w)) w.w = w.w.toLowerCase(); }
  fs.writeFileSync(path.join(d, 'work/captions.json'), JSON.stringify(caps, null, 1));
  const dur = +(fs.readdirSync(path.join(d, 'work/frames')).length / 30).toFixed(2);
  const tl = {
    width: orient === 'horizontal' ? 1920 : 1080, height: orient === 'horizontal' ? 1080 : 1920, fps: 30, duration: +(dur + 2.5).toFixed(2),
    pack, _starter: { pack, title, dur: +(dur + 2.5).toFixed(2) },
    aroll: { frames: 'work/frames/%05d.jpg' }, face, ...(faceTr ? { face_track: faceTr } : {}),
    caption_style: 'slate', captions: 'work/captions.json', ...(speech ? { speech } : {}),
    scenes: [
      // slate's card / title positions are laid out for 720x1280; a 1280x720 design needs its own (else they spill off the bottom)
      // S16 M120: khung thẻ trên nền lưới chỉ thuộc gói slate; gói khác để a-roll tràn khung. Huy hiệu = logo thương hiệu (thêm ở dưới), không có thì không hiện
      ...(pack === 'slate' ? [{ type: 'frame_grid', t0: 0, t1: dur, badge: false, ...(orient === 'horizontal' ? { card: { x: 120, y: 70, w: 1040, h: 585, r: 8 } } : {}) }] : []),
      { type: 'title_card', t0: dur, t1: +(dur + 2.5).toFixed(2), question: 'Bạn thấy sao?', ...(orient === 'horizontal' ? { y: 210 } : {}) },
    ],
    audio: { voice: 'work/aroll.mp4', mix: 'work/mix.wav', music: [{ t0: 0, t1: +(dur + 2.5).toFixed(2), mood: 'tech', gain: -20 }], sfx: [] },
  };
  // Brand kit chosen in the onboarding / "Video mới" dialog: applied here so the project does not ask for it again.
  if (kit) { const { brandFields } = await import('./batch.mjs'); tl.brand = { ...brandFields(kit, d), kit: kit.id }; }
  const grid = tl.scenes.find(s => s.type === 'frame_grid');
  if (grid && tl.brand?.logo) grid.badge = { icon: tl.brand.logo, ...(orient === 'horizontal' ? { x: 640 } : {}) };
  // Thẻ kết mặc định của engine là bản trình diễn ("SKILL AI EDIT VIDEO" + viên Claude): dùng tên / logo thương hiệu, không có thì để trống
  const end = tl.scenes.find(s => s.type === 'title_card');
  if (end) Object.assign(end, endCard(tl.brand, title));
  fs.writeFileSync(path.join(d, 'timeline.json'), JSON.stringify(tl, null, 1));
  // source.json (S12 mục 2.2): video gốc theo đường dẫn tương đối với Kho + dung lượng + sha256
  writeSource(d, ws || workspaceOfProject(d, tl), src, { size: fs.statSync(src).size, sha256: await sha });
  return d;
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  if (!pos[0]) { console.error('usage: node scripts/new_project.mjs <video> [project_dir] [--model large-v3-turbo] [--lang vi|auto] [--pack slate] [--title …] [--orient vertical|horizontal|auto]'); process.exit(2); }
  newProject({ video: pos[0], dir: pos[1], model: opt('--model', 'large-v3-turbo'), pack: opt('--pack', 'slate'), title: opt('--title', ''), orient: opt('--orient', 'vertical'), lang: opt('--lang'), brand: opt('--brand'), kho: !!opt('--brand') },
    { onStep: (s, p) => console.log(`@@ ${p.toFixed(2)} ${s}`) })
    .then(d => { console.log(`@@ 1.00 Xong`); console.log(JSON.stringify({ dir: d })); })
    .catch(e => { console.error('LỖI: ' + e.message + (e.log ? '\n' + e.log.slice(-600) : '')); process.exit(1); });
}
