// Bước 3 Dựng dùng tài nguyên trong Kho (S12 · M99, docs/plans/S12-kho-du-an.md mục 2.2).
// Một file của Kho vào dự án bằng liên kết cứng media/kho_<tên> (khác ổ thì chép, workspace.linkOrCopy); video kèm chuỗi khung
// media/kho_<tên>_frames/%05d.jpg + audio.m4a như upload() của server. Dự án không giữ đường dẫn ra ngoài: nguồn ghi ở
// .studio/kho_media.json (rel → tên trong media/) và media/credits.json (provider "Kho").
// Dùng chung cho route studio/routes/61_kho_media.mjs, b-roll tự động (auto_broll.mjs) và nhạc nền AI dựng giúp (ai_edit.mjs).
// Liên kết cứng dùng chung inode với file trong Kho: KHÔNG ghi đè tại chỗ media/kho_* (references/qc-variants.md) — chỉ tạo file mới.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { KHO_DIRS, kindOf, inWorkspace, listWorkspace, workspaceOfProject } from './workspace.mjs';
import { retryBusy, withFileLock } from './file_lock.mjs';
import { credit as writeCredit } from './ai_broll.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PREFIX = 'kho_';
const USE_KINDS = new Set(['image', 'video', 'audio']);
const fold = s => String(s).toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');
const key = s => (process.platform === 'win32' ? s.toLowerCase() : s);
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(o, null, 1)); retryBusy(() => fs.renameSync(t, f)); };
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

// ---------- nhóm hiển thị trong tab Kho ----------
export const GROUPS = Object.freeze({ image: KHO_DIRS.image, broll: KHO_DIRS.broll, music: KHO_DIRS.music, source: KHO_DIRS.source });
/** Nhóm của một mục listWorkspace: theo thư mục con cấp 1 của Kho, thư mục có sẵn không theo cấu trúc thì theo loại file. */
export function groupOf(it) {
  const d = key(it.dir || '');
  for (const [g, dir] of Object.entries(GROUPS)) if (d === key(dir.split('/')[0])) return g;
  return it.kind === 'image' ? 'image' : it.kind === 'audio' ? 'music' : it.kind === 'video' ? 'broll' : null;
}

/** Kho của dự án (đọc timeline.json để biết brand kit). */
export function khoOf(projectDir, tl = null) {
  if (!tl) tl = readJson(path.join(projectDir, 'timeline.json'));
  return workspaceOfProject(projectDir, tl);
}

// ---------- sổ ghi: file Kho nào đã vào media/ ----------
const mapFile = dir => path.join(dir, '.studio', 'kho_media.json');
export const readMap = dir => readJson(mapFile(dir))?.items || {};
/** Tên trong media/ của file Kho `rel` nếu đã dùng và còn đó, không thì null. */
export function usedName(dir, rel, map = readMap(dir)) {
  const n = map[rel]; return typeof n === 'string' && fs.existsSync(path.join(dir, 'media', n)) ? n : null;
}

/** Mục Kho cho tab Kho: listWorkspace + nhóm + đã có trong dự án chưa. group: một khoá GROUPS hoặc rỗng. */
export function khoItems(projectDir, ws, { group = '', q = '' } = {}) {
  const map = readMap(projectDir), f = fold(q).trim();
  return listWorkspace(ws).filter(it => USE_KINDS.has(it.kind)).map(it => ({ ...it, group: groupOf(it) }))
    .filter(it => it.group && (!group || it.group === group) && (!f || fold(it.rel).includes(f)))
    .map(it => { const n = usedName(projectDir, it.rel, map); return { ...it, used: n ? `media/${n}` : null }; });
}

/**
 * Kiểm `rel` rồi trả đường dẫn tuyệt đối của file trong Kho. Lỗi .status 400: không phải chuỗi, tuyệt đối, thoát Kho
 * (kể cả qua junction/symlink), thư mục ẩn, Du an/ hay Thanh pham/, loại file không chèn được; 404 không thấy file.
 */
export function resolveRel(ws, rel) {
  if (typeof rel !== 'string' || !rel.trim() || rel.length > 1000 || rel.includes('\0')) throw bad('Thiếu đường dẫn file trong Kho');
  if (path.isAbsolute(rel) || /^[\\/]/.test(rel) || /^[a-z]:/i.test(rel)) throw bad('Cần đường dẫn tương đối trong Kho');
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  if (parts.some(p => p === '..' || p.startsWith('.'))) throw bad('Đường dẫn ra ngoài Kho');
  // Windows bỏ dấu chấm/khoảng trắng cuối tên và hiểu tên ngắn 8.3 (DUAN~1), dấu ":" là luồng dữ liệu phụ: chặn để không vòng qua Du an/
  if (parts.some(p => /[. ]$/.test(p) || p.includes('~') || p.includes(':'))) throw bad('Tên thư mục/file không hợp lệ');
  // macOS (APFS) cũng không phân biệt hoa thường; tên có thể ở dạng NFD: so sau khi chuẩn hoá
  const top = s => s.normalize('NFC').toLowerCase();
  if ([KHO_DIRS.projects, KHO_DIRS.delivered].some(d => top(d) === top(parts[0]))) throw bad('Không lấy file từ Du an/ hay Thanh pham/');
  const abs = path.join(ws.root, ...parts);
  if (!inWorkspace(ws, abs)) throw bad('Đường dẫn ra ngoài Kho');
  if (!USE_KINDS.has(kindOf(abs))) throw bad('Chỉ chèn được ảnh, video hoặc âm thanh');
  let st; try { st = fs.statSync(abs); } catch { throw bad('Không thấy file trong Kho', 404); }
  if (!st.isFile()) throw bad('Không phải file', 400);
  return abs;
}

// Tên trong media/: kho_<tên gọn>, trùng thì _2, _3… (không dùng freeName "x (2)": ngoặc tròn làm hỏng url() CSS của engine,
// và <tên>_frames của video phải trống nên kiểm cả thư mục khung).
export function mediaName(md, src, taken = new Set()) {
  const ext = path.extname(src).toLowerCase();
  const stem = path.basename(src, path.extname(src)).normalize('NFC').replace(/[^\w.\-À-ỹ]+/g, '_').replace(/^[._]+|_+$/g, '').slice(0, 60) || 'file';
  const base = PREFIX + stem; let n = base;
  // taken: tên đã ghi trong sổ (file có thể đã bị xoá khỏi media/): không cấp lại cho file Kho khác
  for (let i = 2; fs.existsSync(path.join(md, n + ext)) || fs.existsSync(path.join(md, n + '_frames')) || taken.has(n + ext); i++) n = `${base}_${i}`;
  return n + ext;
}

/** Mục như mediaList() của server cho media/<name> (đọc chuỗi khung có sẵn). */
export function mediaItem(dir, name) {
  const kind = kindOf(name), it = { name, path: `media/${name}`, kind };
  if (kind === 'image') it.thumb = it.path;
  if (kind === 'video') {
    const frn = name.replace(/\.\w+$/, '') + '_frames', fr = path.join(dir, 'media', frn);
    if (fs.existsSync(fr)) {
      const n = fs.readdirSync(fr).filter(x => x.endsWith('.jpg')).length;
      it.seq = { seq: `media/${frn}/%05d.jpg`, fps: 30, count: n }; it.thumb = `media/${frn}/00001.jpg`; it.dur = +(n / 30).toFixed(2);
      if (fs.existsSync(path.join(fr, 'audio.m4a'))) it.preview_audio = `media/${frn}/audio.m4a`;
    }
  }
  return it;
}

const ff = (args, run) => (run ? run('ffmpeg', args) : new Promise((ok, no) => execFile('ffmpeg', args, { maxBuffer: 1 << 24 }, e => (e ? no(e) : ok()))));
/** Chuỗi khung 30 fps (≤ 1280 px) + audio.m4a cho một video trong media/, như upload() của server. Ghi vào thư mục mới. */
// Tách vào thư mục tạm rồi đổi tên: ffmpeg bị ngắt giữa chừng không để lại <tên>_frames dở (bị coi là đủ mãi).
export async function expandVideo(src, fr, { run } = {}) {
  const work = `${fr}.${process.pid}.tmp`;
  fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  try {
    await ff(['-v', 'error', '-y', '-i', src, '-vf', 'fps=30,scale=w=1280:h=1280:force_original_aspect_ratio=decrease', '-q:v', '3', path.join(work, '%05d.jpg')], run);
    const tmp = path.join(work, '.audio.tmp.m4a');
    try { await ff(['-v', 'error', '-y', '-i', src, '-map', '0:a:0?', '-vn', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', tmp], run); } catch {}
    if (fs.existsSync(tmp) && fs.statSync(tmp).size > 1024) fs.renameSync(tmp, path.join(work, 'audio.m4a')); else fs.rmSync(tmp, { force: true });
    // tiến trình khác (route / job auto_broll) tách xong trước: giữ bản của nó, bỏ bản này
    const done = () => { try { return fs.readdirSync(fr).some(f => f.endsWith('.jpg')); } catch { return false; } };
    if (done()) { fs.rmSync(work, { recursive: true, force: true }); return; }
    fs.rmSync(fr, { recursive: true, force: true });
    try { retryBusy(() => fs.renameSync(work, fr)); } catch (e) { if (!done()) throw e; fs.rmSync(work, { recursive: true, force: true }); }
  } catch (e) { fs.rmSync(work, { recursive: true, force: true }); throw e; }
}

const addCredit = (dir, rec) => writeCredit(path.join(dir, 'media'), rec); // một bản ghi cho mỗi file kho_* (có khoá, ghi file mới)

const pending = new Map();
/**
 * Đưa file Kho `rel` vào media/ của dự án → mục như mediaList() (+ kho: rel, linked: 'link'|'copy'|'reuse').
 * Đã dùng rồi thì trả lại file cũ (không tạo kho_x_2). Lỗi .status 400/404 như resolveRel; ffmpeg lỗi → dọn file vừa tạo.
 */
export function useFromKho(projectDir, ws, rel, o = {}) {
  const k = `${key(path.resolve(projectDir))}|${key(typeof rel === 'string' ? rel.split(/[\\/]+/).filter(Boolean).join('/') : String(rel))}`;
  if (pending.has(k)) return pending.get(k);
  const p = useOnce(projectDir, ws, rel, o).finally(() => pending.delete(k));
  pending.set(k, p); return p;
}
const probeDur = f => new Promise(ok => execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], (e, o) => ok(e ? NaN : +String(o).trim())));
async function useOnce(dir, ws, rel, { run, credit = 'Kho', maxDur = 0, why = 'b-roll tự động' } = {}) {
  const src = resolveRel(ws, rel), relN = rel.split(/[\\/]+/).filter(Boolean).join('/');
  // b-roll tự động chỉ dùng ~2 s đầu: video Kho dài (footage thô) không tách cả nghìn khung trong job (o.maxDur giây)
  if (maxDur > 0 && kindOf(src) === 'video' && !usedName(dir, relN)) {
    const d = await probeDur(src);
    if (!(d <= maxDur)) throw bad(`Video dài ${Number.isFinite(d) ? Math.round(d) + ' s' : 'không rõ'} (quá ${maxDur} s cho ${why})`);
  }
  const md = path.join(dir, 'media'); fs.mkdirSync(md, { recursive: true });
  const lock = mapFile(dir) + '.lock'; fs.mkdirSync(path.dirname(lock), { recursive: true });
  // Trong khoá (auto_broll chạy ở tiến trình khác) chỉ làm việc nhanh: đọc sổ, chọn tên, liên kết cứng (cùng ổ), ghi sổ ngay.
  // Khác ổ thì chép bất đồng bộ ra file tạm rồi đổi tên, ngoài khoá (không chặn server, không quá hạn khoá).
  // Như workspace.linkOrCopy: không bao giờ ghi đè đích (linkSync/COPYFILE_EXCL báo lỗi khi đã có).
  let had = null, name = null, linked = null;
  withFileLock(lock, () => {
    had = usedName(dir, relN);
    if (had) return;
    const map = readMap(dir), old = map[relN];
    // đang chép khác ổ ở tiến trình khác (sổ đã giữ tên, file đích chưa đổi tên xong): không cấp lại tên đó
    if (typeof old === 'string' && fs.readdirSync(md).some(f => f.startsWith(old + '.') && f.endsWith('.tmp')))
      throw bad('File này đang được đưa vào dự án, thử lại sau ít giây', 409);
    delete map[relN];
    name = mediaName(md, src, new Set(Object.values(map)));
    try { fs.linkSync(src, path.join(md, name)); linked = 'link'; } catch (e) { if (e.code === 'EEXIST') throw e; linked = 'copy'; }
    map[relN] = name; writeJson(mapFile(dir), { version: 1, items: map });
  });
  if (had) {
    const it = mediaItem(dir, had);
    if (it.kind !== 'video' || it.seq?.count) return { ...it, kho: relN, linked: 'reuse' };
    // khung bị xoá (dọn _frames để gửi máy render) hoặc tiến trình khác đang tách: tạo lại / chờ bản đó
    try { await expandVideo(path.join(md, had), path.join(md, had.replace(/\.\w+$/, '') + '_frames'), { run }); }
    catch (e) { throw bad('Không tách được khung hình của video: ' + String(e.message || e).split('\n')[0].slice(0, 200), 500); }
    const again = mediaItem(dir, had);
    if (!again.seq?.count) throw bad('Video không có hình để chèn');
    return { ...again, kho: relN, linked: 'reuse' };
  }
  const dst = path.join(md, name), fr = path.join(md, name.replace(/\.\w+$/, '') + '_frames');
  const undo = () => { fs.rmSync(fr, { recursive: true, force: true }); withFileLock(lock, () => { const m = readMap(dir); if (m[relN] === name) { delete m[relN]; writeJson(mapFile(dir), { version: 1, items: m }); } }); };
  if (linked === 'copy') {
    const tmp = `${dst}.${process.pid}.tmp`;
    try { await fs.promises.copyFile(src, tmp, fs.constants.COPYFILE_EXCL); retryBusy(() => fs.renameSync(tmp, dst)); }
    catch (e) { fs.rmSync(tmp, { force: true }); undo(); throw bad('Không chép được file từ Kho: ' + String(e.message || e).split('\n')[0].slice(0, 200), 500); }
  }
  try {
    if (kindOf(name) === 'video') { await expandVideo(dst, fr, { run }); if (!mediaItem(dir, name).seq?.count) throw Object.assign(new Error('Video không có hình để chèn'), { status: 400 }); }
  } catch (e) { fs.rmSync(dst, { force: true }); undo(); if (e.status === 400) throw e; throw bad('Không tách được khung hình của video: ' + String(e.message || e).split('\n')[0].slice(0, 200), 500); }
  withFileLock(lock, () => addCredit(dir, { file: name, provider: credit, kho: relN, title: path.basename(src) }));
  return { ...mediaItem(dir, name), kho: relN, linked };
}

// ---------- chấm khớp theo tên file / thư mục (b-roll tự động, nhạc tự chọn) ----------
const STOP = new Set(('la va thi ma cua cac nhung mot cai nay do day kia roi da se dang co duoc bi cho voi de tu den o tren duoi trong ngoai ' +
  'img dsc pxl screenshot video final copy new file broll nguon nhac thuong hieu mp4 mov jpg png').split(' '));
const words = s => fold(s).split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
/** Từ khoá của một file Kho: tên file + thư mục cha (bỏ thư mục chuẩn của Kho như Anh/, BRoll/). */
export function tagsOf(rel) {
  const parts = rel.split('/'), dirs = new Set(Object.values(KHO_DIRS).flatMap(d => d.split('/')).map(fold));
  const segs = parts.map((p, i) => (i === parts.length - 1 ? p.replace(/\.\w+$/, '') : p)).filter(p => !dirs.has(fold(p)));
  return segs.map(s => words(s.replace(/[_-]+/g, ' ')).join(' ')).filter(Boolean);
}
/** Điểm khớp của một file với câu nói: mỗi từ (1) và cụm hai từ liền nhau (+1.5) có trong câu. */
export function scoreRel(rel, text) {
  const f = ' ' + fold(text).replace(/[^a-z0-9]+/g, ' ') + ' ';
  let s = 0; const seen = new Set();
  for (const seg of tagsOf(rel)) {
    const ws = seg.split(' ');
    for (let i = 0; i < ws.length; i++) {
      if (!seen.has(ws[i]) && f.includes(' ' + ws[i] + ' ')) { s += 1; seen.add(ws[i]); }
      const bi = i + 1 < ws.length ? `${ws[i]} ${ws[i + 1]}` : null;
      if (bi && !seen.has(bi) && f.includes(' ' + bi + ' ')) { s += 1.5; seen.add(bi); }
    }
  }
  return s;
}
/**
 * File b-roll trong Kho (nhóm broll + image) khớp câu nói, tốt nhất trước. items: danh sách khoItems/listWorkspace dùng lại
 * giữa các câu (quét Kho một lần). → [{ ...item, score }]
 */
export function searchKho(items, text, { n = 3, exclude = new Set(), groups = ['broll', 'image'] } = {}) {
  const out = [];
  for (const it of items) {
    if (exclude.has(it.rel) || !groups.includes(it.group || groupOf(it)) || !['image', 'video'].includes(it.kind)) continue;
    const s = scoreRel(it.rel, text); if (s > 0) out.push({ ...it, score: s });
  }
  return out.sort((a, b) => b.score - a.score || b.mtime - a.mtime).slice(0, n);
}

// Từ của một mood nhạc: tên mood (hype, real_estate_luxury…) + vài từ tiếng Việt hay đặt tên file + cụm "use" của catalog.
// Cụm (phân cách bằng dấu phẩy), không tách âm tiết lẻ: "dong" một mình không được tính là "sôi động".
const MOOD_VI = {
  hype: 'soi dong, edm', tech: 'cong nghe, dien tu', sad: 'buon, tram buon', happy: 'vui tuoi, vui ve', mellow: 'nhe nhang, thu gian',
  lofi: 'lofi, chill', epic: 'hung trang, hoanh trang', suspense: 'cang thang, hoi hop', corporate: 'doanh nghiep, cong ty', inspire: 'truyen cam hung',
  lofi_hiphop: 'lofi, hiphop, chill', cinematic_epic: 'dien anh, hoanh trang, trailer', corporate_upbeat: 'doanh nghiep, tuoi sang',
  real_estate_luxury: 'bat dong san, sang trong', tiktok_trap: 'tiktok, trap', acoustic_warm: 'acoustic, guitar moc', ambient_calm: 'thien, spa, yen binh',
  news_bg: 'ban tin, tin tuc', kids_playful: 'tre em, vui nhon', piano_minimal: 'piano, tam su',
};
export function moodWords(mood) {
  let use = ''; try { use = (JSON.parse(fs.readFileSync(path.join(SKILL, 'assets/music/catalog.json'), 'utf8')).find(x => x.mood === mood)?.use) || ''; } catch {}
  const ws = new Set([...words(String(mood).replace(/_/g, ' ')), ...(MOOD_VI[mood] || '').split(',').map(p => words(p).join(' ')).filter(Boolean)]);
  for (const ph of use.split(/[,—–-]/)) { const w = words(ph); if (w.length >= 2 && w.length <= 3) ws.add(w.join(' ')); }
  return [...ws];
}
/** Bài trong Nhac/ (hoặc file âm thanh của Kho) hợp mood: tên file/thư mục có từ của mood. Không có bài hợp → null. */
export function musicFor(items, mood) {
  const mw = moodWords(mood); if (!mw.length) return null;
  let best = null;
  for (const it of items) {
    if (it.kind !== 'audio' || (it.group || groupOf(it)) !== 'music') continue;
    const tags = ' ' + tagsOf(it.rel).join(' ') + ' ';
    const s = mw.reduce((a, w) => a + (tags.includes(' ' + w + ' ') ? w.split(' ').length : 0), 0);
    if (s > 0 && (!best || s > best.score || (s === best.score && it.mtime > best.mtime))) best = { ...it, score: s };
  }
  return best;
}
/**
 * Nhạc nền tự chọn ưu tiên Kho: có bài hợp mood trong Nhac/ thì đưa vào media/kho_* và trả { file, kho, title }, không thì null.
 * Lỗi đọc Kho/ghi file không làm hỏng việc chọn nhạc (trả null, giữ mood của thư viện).
 */
export async function khoMusic(projectDir, tl, mood, o = {}) {
  try {
    const ws = o.ws || khoOf(projectDir, tl);
    const hit = musicFor(khoItems(projectDir, ws, { group: 'music' }), mood); if (!hit) return null;
    const it = await useFromKho(projectDir, ws, hit.rel, { ...o, credit: 'Kho · Nhac' });
    return { file: it.path, kho: hit.rel, title: hit.name };
  } catch { return null; }
}
/**
 * Nhạc theo đoạn của "Tự động" (auto_sfx.py --music auto đặt mood cho từng đoạn, mục _auto): đoạn nào có bài hợp trong Nhac/
 * của Kho thì gắn file media/kho_* (mix_audio.py ưu tiên "file" hơn "mood"). Ghi timeline.json khi có thay đổi. → số đoạn đổi.
 */
export async function khoMusicBeds(projectDir, o = {}) {
  const f = path.join(projectDir, 'timeline.json'), tl = readJson(f);
  const beds = (tl?.audio?.music || []).filter(m => m && m._auto && typeof m.mood === 'string' && !m.file);
  if (!beds.length) return 0;
  let ws; try { ws = o.ws || khoOf(projectDir, tl); } catch { return 0; }
  const byMood = new Map(); let n = 0;
  for (const m of beds) {
    if (!byMood.has(m.mood)) byMood.set(m.mood, await khoMusic(projectDir, tl, m.mood, { ...o, ws }));
    const k = byMood.get(m.mood); if (!k) continue;
    m.file = k.file; m.kho = k.kho; n++;
  }
  if (n) writeJson(f, tl);
  return n;
}
