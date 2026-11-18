// Dọn file cũ vào Kho (S12 M101, docs/plans/S12-kho-du-an.md mục 5): trước S12 video nguồn nằm rải trong thư mục ẩn của Studio
// (H/uploads, H/autopilot/inbox, H/longform/_uploads, H/telegram/inbox) và thư mục canh cũ của Tự lái (~/Movies/AI Video Studio/…).
// planMigration() chỉ liệt kê (không đụng file); applyMigration() chuyển những mục người dùng đã tích, theo id của một lượt liệt kê
// mới (không nhận đường dẫn từ trình duyệt). Dự án cũ (H/footage, H/autopilot/projects, H/longform) giữ nguyên chỗ, chỉ ghi vào
// danh sách `linked` của .kho.json để panel Kho mở lại được.
// Không đụng: file *.json phiên tải YouTube trong H/uploads, file đang trong hàng đợi (chờ, tạm dừng, đang chạy, lỗi chờ thử lại),
// file ẩn / .part, file vừa đổi trong 10 giây (có thể đang chép hoặc đang tải dở).
// Chuyển: cùng ổ → liên kết cứng sang tên mới rồi xoá bản cũ (không ghi đè file sẵn có); khác ổ → chép (bất đồng bộ, không treo
// server) vào tên tạm rồi đổi tên, đúng dung lượng mới xoá bản cũ. Bước chốt (kiểm lại hàng đợi → đặt tên → xoá bản cũ) chạy trong
// khoá queue.json.lock của scripts/queue.mjs, nên Tự lái không nhận đúng file đang bị chuyển. Xoá bản cũ không được (file đang mở)
// → bỏ bản mới, báo lỗi, bản cũ còn nguyên.
import fs from 'node:fs';
import { rmSync } from './fs_rm.mjs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { AVS_HOME, KINDS, ensureWorkspace, freeName, inWorkspace, readSource, relTo, safeName, sub, writeSource } from './workspace.mjs';
import { retryBusy, withFileLock } from './file_lock.mjs';

const VIDEO = KINDS.video;
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
// Windows / macOS không phân biệt hoa thường; Linux có (A.mp4 và a.mp4 là hai file)
const keyOf = p => (process.platform === 'linux' ? path.resolve(p) : path.resolve(p).toLowerCase());
export const idOf = p => crypto.createHash('sha1').update(keyOf(p)).digest('hex').slice(0, 16);
const SAMPLE = new Set(['clip-mau']); // dự án mẫu đi kèm Studio: không đưa vào danh sách
const FRESH_MS = 10_000;
// trạng thái mục hàng đợi còn cần file đầu vào (scripts/queue.mjs: queued, paused, running, error; 'failed' là tên cũ của error)
const LIVE = new Set(['queued', 'paused', 'running', 'error', 'failed']);

/** Thư mục canh cũ của Tự lái (mặc định ~/Movies/AI Video Studio + thư mục người dùng tự thêm). */
function oldWatchFolders(home, userHome) {
  const movies = path.join(userHome, 'Movies', 'AI Video Studio');
  const def = { in: path.join(movies, 'Thả video vào đây'), processed: path.join(movies, 'Đã xử lý') };
  const s = readJson(path.join(home, 'autopilot.json')) || {}, on = !!s.watch?.on;
  const list = Array.isArray(s.watch?.folders) ? s.watch.folders : [];
  const out = [{ ...def, mine: false, watched: on && (!list.length || list.some(f => f && path.resolve(String(f.in || '')) === path.resolve(def.in))) }];
  for (const f of list) if (f && typeof f.in === 'string' && path.isAbsolute(f.in) && path.resolve(f.in) !== path.resolve(def.in))
    out.push({ in: f.in, processed: typeof f.processed === 'string' && path.isAbsolute(f.processed) ? f.processed : '', mine: true, watched: on });
  return out;
}

/** Nguồn cũ: [{ dir, from (nhãn), to (loại thư mục Kho), mine (thư mục của người dùng), watched (Tự lái đang canh) }]. */
export function legacyPlaces({ home = AVS_HOME(), userHome = os.homedir() } = {}) {
  const P = [
    { dir: path.join(home, 'uploads'), from: 'Tải lên cũ', to: 'source' },
    { dir: path.join(home, 'autopilot', 'inbox'), from: 'Tự lái (tải lên cũ)', to: 'source' },
    { dir: path.join(home, 'longform', '_uploads'), from: 'Video dài (tải lên cũ)', to: 'source' },
    { dir: path.join(home, 'telegram', 'inbox'), from: 'Telegram (cũ)', to: 'source' },
  ];
  for (const w of oldWatchFolders(home, userHome)) {
    P.push({ dir: w.in, from: w.mine ? 'Thư mục canh của bạn' : 'Thư mục canh cũ', to: 'inbox', mine: w.mine, watched: w.watched });
    if (w.processed) P.push({ dir: w.processed, from: w.mine ? 'Đã xử lý (thư mục của bạn)' : 'Đã xử lý (cũ)', to: 'source', mine: w.mine });
  }
  return P;
}

/** Khoá đầu vào của mục hàng đợi còn cần file (chuyển đi thì mục đó hỏng). Mọi loại job lưu đầu vào ở `input`. */
function busyInputs(home) {
  const q = readJson(path.join(home, 'queue.json'));
  return new Set((Array.isArray(q?.items) ? q.items : []).filter(it => it && LIVE.has(it.state) && typeof it.input === 'string').map(it => keyOf(it.input)));
}
const queueLock = home => path.join(home, 'queue.json.lock');
const BUSY_MSG = 'Đang trong hàng đợi Tự lái: chờ chạy xong rồi chuyển';

/** Dự án cũ trong thư mục của Studio (có timeline.json): footage/<x>, autopilot/projects/<x>, longform/<lần chạy>/<NN_x>. */
export function legacyProjects({ home = AVS_HOME() } = {}) {
  const out = [], seen = new Set();
  const walk = (d, depth, from) => {
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_') || /_frames$/.test(e.name) || ['work', 'media', 'out', 'publish'].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (fs.existsSync(path.join(p, 'timeline.json'))) {
        if (!SAMPLE.has(e.name) && !seen.has(p)) { seen.add(p); let t = 0; try { t = fs.statSync(path.join(p, 'timeline.json')).mtimeMs; } catch {} out.push({ id: idOf(p), dir: p, name: e.name, from, mtime: t }); }
      } else if (depth > 1) walk(p, depth - 1, from);
    }
  };
  walk(path.join(home, 'footage'), 1, 'Dự án từ video tải lên');
  walk(path.join(home, 'autopilot', 'projects'), 1, 'Tự lái');
  walk(path.join(home, 'longform'), 3, 'Video dài');
  return out.sort((a, b) => b.mtime - a.mtime);
}

/** Dự án cũ đã ghi vào Kho (.kho.json `linked`), chỉ những dự án còn trên máy và nằm trong thư mục của Studio. */
export function linkedProjects(ws, { home = AVS_HOME() } = {}) {
  const j = readJson(path.join(ws.root, '.kho.json')), H = keyOf(home) + path.sep;
  return (Array.isArray(j?.linked) ? j.linked : [])
    .filter(r => r && typeof r.dir === 'string' && path.isAbsolute(r.dir) && keyOf(r.dir).startsWith(H) && fs.existsSync(path.join(r.dir, 'timeline.json')))
    .map(r => ({ id: idOf(r.dir), dir: r.dir, name: String(r.name || path.basename(r.dir)).slice(0, 120), from: String(r.from || '').slice(0, 60), t: String(r.t || '').slice(0, 30) }));
}

/**
 * Lập danh sách (không đổi gì trên đĩa).
 * → { files: [{ id, src, name, size, mtime, from, to, dest (thư mục Kho tương đối), checked, busy? }], more, projects: [{ id, dir, name, from, linked }] }
 */
export function planMigration(ws, { home = AVS_HOME(), userHome = os.homedir(), max = 500, now = Date.now() } = {}) {
  const busy = busyInputs(home), files = [], seen = new Set();
  for (const pl of legacyPlaces({ home, userHome })) {
    let es = []; try { es = fs.readdirSync(pl.dir, { withFileTypes: true }); } catch { continue; }
    if (inWorkspace(ws, pl.dir)) continue; // thư mục canh nằm sẵn trong Kho
    for (const e of es) {
      if (!e.isFile() || e.name.startsWith('.') || !VIDEO.test(e.name) || /\.part(\.|$)/.test(e.name)) continue;
      const src = path.join(pl.dir, e.name), key = keyOf(src);
      if (seen.has(key)) continue; seen.add(key);
      let st; try { st = fs.statSync(src); } catch { continue; }
      const why = busy.has(key) ? BUSY_MSG : now - st.mtimeMs < FRESH_MS ? 'File vừa thay đổi (đang chép?): thử lại sau ít giây' : '';
      const note = pl.watched ? 'Tự lái đang canh thư mục này' : '';
      files.push({ id: idOf(src), src, name: e.name, size: st.size, mtime: st.mtimeMs, from: pl.from, to: pl.to, dest: relTo(ws, sub(ws, pl.to)),
        checked: !why && !pl.mine && !pl.watched, ...(why ? { busy: why } : {}), ...(note ? { note } : {}) });
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  const have = new Set(linkedProjects(ws, { home }).map(r => keyOf(r.dir)));
  const projects = legacyProjects({ home }).map(p => ({ id: p.id, dir: p.dir, name: p.name, from: p.from, linked: have.has(keyOf(p.dir)) }));
  return { files: files.slice(0, max), more: Math.max(0, files.length - max), projects };
}

const CROSS = new Set(['EXDEV', 'ENOTSUP', 'EINVAL', 'ENOSYS', 'EPERM']); // EPERM: FAT/exFAT không có liên kết cứng
const fileNameIn = src => { const ext = path.extname(src); return (safeName(path.basename(src, ext)) || 'video') + ext.toLowerCase(); };
function dropSource(src, dst, linked) {
  try { retryBusy(() => fs.unlinkSync(src), 10); }
  catch (e) {
    if (e.code === 'ENOENT') return;
    if (!linked || fs.existsSync(src)) rmSync(dst, { force: true });
    throw Object.assign(new Error('File cũ đang được mở ở chương trình khác: đóng nó rồi thử lại'), { status: 409 });
  }
}
/**
 * Chuyển một file vào thư mục d của Kho (không ghi đè). → đường dẫn mới. Lỗi → bản cũ còn nguyên, không để lại bản mới.
 * o.guard(): gọi ngay trước bước chốt, ném lỗi để huỷ (vd. file vừa vào hàng đợi). o.lock: file khoá giữ quanh bước chốt.
 */
export async function moveFile(ws, src, d, { guard = () => {}, lock = null } = {}) {
  if (!inWorkspace(ws, d)) throw Object.assign(new Error('Đích không nằm trong Kho'), { status: 400 });
  fs.mkdirSync(d, { recursive: true });
  if (!inWorkspace(ws, d)) throw Object.assign(new Error('Đích không nằm trong Kho'), { status: 400 }); // sau khi tạo: giải junction
  const name = fileNameIn(src), size = fs.statSync(src).size;
  const locked = fn => (lock ? withFileLock(lock, fn) : fn());
  // cùng ổ: liên kết cứng rồi xoá bản cũ, cả bước trong khoá (nhanh, không chép dữ liệu)
  const same = locked(() => {
    guard();
    for (let i = 0; i < 20; i++) {
      const t = path.join(d, freeName(d, name));
      try { fs.linkSync(src, t); } catch (e) { if (e.code === 'EEXIST') continue; if (CROSS.has(e.code)) return null; throw e; }
      dropSource(src, t, true);
      return t;
    }
    throw new Error('Không tìm được tên trống trong Kho');
  });
  if (same) return same;
  // khác ổ: chép ngoài khoá (có thể vài GB), rồi trong khoá kiểm lại → giữ chỗ tên 'wx' → đổi tên đè lên chỗ đã giữ → xoá bản cũ
  const tmp = path.join(d, `.${crypto.randomBytes(4).toString('hex')}.part`);
  try {
    await fs.promises.copyFile(src, tmp, fs.constants.COPYFILE_EXCL);
    if ((await fs.promises.stat(tmp)).size !== size) throw new Error('Chép thiếu dữ liệu');
    return locked(() => {
      guard();
      let dst = null;
      for (let i = 0; i < 20 && !dst; i++) {
        const t = path.join(d, freeName(d, name));
        try { fs.closeSync(fs.openSync(t, 'wx')); dst = t; } catch (e) { if (e.code !== 'EEXIST') throw e; }
      }
      if (!dst) throw new Error('Không tìm được tên trống trong Kho');
      try { retryBusy(() => fs.renameSync(tmp, dst)); } catch (e) { rmSync(dst, { force: true }); throw e; }
      dropSource(src, dst, false);
      return dst;
    });
  } finally { rmSync(tmp, { force: true }); }
}

// .kho.json: thêm dự án cũ vào `linked` (giữ các khoá khác), ghi qua file tạm trong khoá.
function addLinked(ws, recs) {
  const f = path.join(ws.root, '.kho.json');
  withFileLock(f + '.lock', () => {
    const j = readJson(f) || {}, list = Array.isArray(j.linked) ? j.linked : [];
    const have = new Set(list.map(r => keyOf(String(r?.dir || ''))));
    for (const r of recs) if (!have.has(keyOf(r.dir))) list.push({ dir: r.dir, name: r.name, from: r.from, t: new Date().toISOString() });
    const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify({ ...j, linked: list.slice(-500) }, null, 1)); retryBusy(() => fs.renameSync(t, f));
  });
}

/**
 * Chuyển các mục đã chọn. pick: { files: [id], projects: [id] } (id của planMigration; id lạ hoặc file đang bận bị bỏ qua).
 * o.onProgress(done, total, name). → { moved: [{ id, from, to }], failed: [{ id, name, error }], linked, skipped, warn: [chuỗi] }
 */
export async function applyMigration(ws, pick = {}, o = {}) {
  ws = ensureWorkspace(ws);
  const home = o.home || AVS_HOME(), plan = planMigration(ws, { ...o, max: Infinity });
  const want = new Set((Array.isArray(pick.files) ? pick.files : []).map(String)), wantP = new Set((Array.isArray(pick.projects) ? pick.projects : []).map(String));
  const todo = plan.files.filter(f => want.has(f.id));
  const moved = [], failed = [], warn = [], map = new Map();
  for (const [n, f] of todo.entries()) {
    want.delete(f.id);
    o.onProgress?.(n, todo.length, f.name);
    if (f.busy) { failed.push({ id: f.id, name: f.name, error: f.busy }); continue; }
    try {
      const guard = () => { if (busyInputs(home).has(keyOf(f.src))) throw new Error(BUSY_MSG); };
      const dst = await moveFile(ws, f.src, sub(ws, f.to, { mkdir: true }), { guard, lock: queueLock(home) });
      map.set(keyOf(f.src), dst);
      moved.push({ id: f.id, from: f.src, to: relTo(ws, dst) });
    } catch (e) { failed.push({ id: f.id, name: f.name, error: e.message }); }
  }
  // source.json của dự án cũ trỏ tuyệt đối tới file vừa chuyển → trỏ lại vào Kho (giữ sha256/dung lượng)
  if (map.size) for (const p of legacyProjects({ home })) {
    const s = readSource(p.dir), to = s?.abs && map.get(keyOf(s.abs));
    if (!to) continue;
    try { const { version, kho, video, abs, name, ...extra } = s; writeSource(p.dir, ws, to, extra); }
    catch (e) { warn.push(`Dự án ${p.name}: chưa ghi lại được nguồn (${e.message})`); }
  }
  const recs = plan.projects.filter(p => wantP.has(p.id) && !p.linked);
  for (const p of plan.projects) wantP.delete(p.id);
  if (recs.length) addLinked(ws, recs);
  o.onProgress?.(todo.length, todo.length, '');
  return { moved, failed, linked: recs.length, skipped: want.size + wantP.size, warn };
}
