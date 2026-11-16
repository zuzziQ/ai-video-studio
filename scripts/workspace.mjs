// Kho dự án theo thương hiệu (S12, docs/plans/S12-kho-du-an.md). Hợp đồng thư mục dùng chung cho mọi bước của Studio:
// Video mới, Tự lái, Video dài, Media, Xuất, Đăng đều tính đường dẫn Kho qua module này, không tự ghép tên thư mục.
//   <Kho>/Nguon/ (Tha vao day/)  Anh/  BRoll/  Nhac/  Thuong hieu/  Du an/<tên>/  Thanh pham/<YYYY-MM>/  .kho.json
// Kho của một thương hiệu: khoá `workspace` trong $AVS_HOME/brands.json; Kho "Chung" (không thương hiệu): $AVS_HOME/workspace.json.
// Mặc định: <Videos>/AI Video Studio/<tên thương hiệu> (Windows/Linux ~/Videos, macOS ~/Movies). Kho không bao giờ nằm trong
// $AVS_HOME, thư mục ẩn của người dùng hay thư mục hệ thống; mọi chỗ ghi phải đi qua inWorkspace()/sub().
// Một Kho thuộc đúng một thương hiệu (.kho.json): chọn thư mục đang là Kho của thương hiệu khác → 409.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AVS_HOME, forbiddenDir } from '../studio/security.mjs';
import { retryBusy, withFileLock } from './file_lock.mjs';

export { AVS_HOME };
export const LAYOUT_VERSION = 1;
// loại → thư mục con (tên không dấu để ffmpeg, Python, công cụ đồng bộ không vấp bảng mã)
export const KHO_DIRS = Object.freeze({
  source: 'Nguon', inbox: 'Nguon/Tha vao day', image: 'Anh', broll: 'BRoll', music: 'Nhac', brand: 'Thuong hieu',
  projects: 'Du an', delivered: 'Thanh pham',
});
// Thư mục người dùng tải file lên được (Du an / Thanh pham do Studio tự ghi, không liệt kê trong Kho)
export const UPLOAD_KINDS = Object.freeze(['source', 'inbox', 'image', 'broll', 'music', 'brand']);
export const KINDS = Object.freeze({
  video: /\.(mp4|mov|m4v|mkv|webm|avi|mts)$/i,
  image: /\.(jpe?g|png|webp|gif|heic|svg)$/i,
  audio: /\.(mp3|wav|m4a|aac|flac|ogg|aiff?)$/i,
  font: /\.(ttf|otf|woff2?)$/i,
});
const own = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);
export const kindOf = f => Object.keys(KINDS).find(k => KINDS[k].test(f)) || null;
/** Thư mục con khi tải lên: `want` (một UPLOAD_KINDS) hoặc theo loại file. Loại lạ → null (route trả 400). */
export function uploadDir(f, want) {
  if (want != null && want !== '') return UPLOAD_KINDS.includes(want) ? KHO_DIRS[want] : null;
  return { video: KHO_DIRS.source, image: KHO_DIRS.image, audio: KHO_DIRS.music, font: KHO_DIRS.brand }[kindOf(f)] || KHO_DIRS.source;
}

const key = p => (process.platform === 'win32' ? p.toLowerCase() : p);
// realpath của phần đã có + phần chưa có ghép lại: thấy được junction/symlink ở thư mục cha
function realish(p) {
  let a = path.resolve(p); const rest = [];
  for (;;) {
    try { return path.join(fs.realpathSync.native(a), ...rest.reverse()); } catch {}
    const up = path.dirname(a); if (up === a) return path.resolve(p);
    rest.push(path.basename(a)); a = up;
  }
}
const inside = (a, b) => { const A = key(a), B = key(b); return A === B || A.startsWith(B.endsWith(path.sep) ? B : B + path.sep); };
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
// Tên thư mục an toàn trên mọi hệ điều hành (giữ dấu tiếng Việt, bỏ ký tự cấm của Windows, tránh tên thiết bị CON/AUX…)
export function safeName(s) {
  let n = String(s || '').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).replace(/[. ]+$/, '');
  if (RESERVED.test(n)) n += '_';
  return n || 'Chung';
}

export function videosDir(home = os.homedir()) { return path.join(home, process.platform === 'darwin' ? 'Movies' : 'Videos'); }
export function defaultRoot(title, home = os.homedir()) { return path.join(videosDir(home), 'AI Video Studio', safeName(title)); }

// ---------- lưu / đọc ----------
const brandsFile = (h = AVS_HOME()) => path.join(h, 'brands.json');
const commonFile = (h = AVS_HOME()) => path.join(h, 'workspace.json');
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(o, null, 1)); retryBusy(() => fs.renameSync(t, f)); };
const ownerOf = root => readJson(path.join(root, '.kho.json'))?.brand ?? null; // null = chưa là Kho
const SYS = process.platform === 'win32'
  ? [process.env.SystemRoot || 'C:\\Windows', process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramData].filter(Boolean)
  : ['/bin', '/boot', '/dev', '/etc', '/lib', '/proc', '/sbin', '/sys', '/usr', '/var', '/System', '/Library', '/Applications'];

/**
 * Lý do một thư mục không làm Kho được, hoặc null. o.mustExist: chọn "thư mục có sẵn" thì thư mục phải có thật
 * (gõ nhầm không tạo cả cây thư mục rác).
 */
export function workspaceProblem(dir, h = AVS_HOME(), { mustExist = false } = {}) {
  if (typeof dir !== 'string' || !dir.trim()) return 'Thiếu đường dẫn thư mục';
  if (process.platform === 'win32' && /^[\\/]{2}/.test(dir.trim())) return 'Không dùng thư mục mạng (UNC) làm Kho';
  if (!path.isAbsolute(dir.trim())) return 'Cần đường dẫn đầy đủ (ví dụ D:\\Videos\\Nha Dep)';
  const abs = realish(dir.trim());
  if (abs === path.parse(abs).root) return 'Không dùng gốc ổ đĩa làm Kho';
  if (key(abs) === key(realish(os.homedir()))) return 'Không dùng cả thư mục người dùng làm Kho';
  if (inside(abs, realish(h)) || inside(realish(h), abs)) return 'thư mục cấu hình của Studio';
  if (SYS.some(s => inside(abs, realish(s)))) return 'thư mục hệ thống';
  const why = forbiddenDir(abs, h); if (why) return why;
  if (fs.existsSync(abs)) { if (!fs.statSync(abs).isDirectory()) return 'Đường dẫn này là file, không phải thư mục'; }
  else if (mustExist) return 'Không thấy thư mục này';
  if (fs.existsSync(path.join(abs, 'timeline.json'))) return 'Đây là thư mục của một dự án, chọn thư mục chứa nó';
  return null;
}

/**
 * Kho của một thương hiệu (brandId rỗng hoặc không còn = Kho "Chung").
 * → { root, brand: id|'', title, custom: người dùng tự chọn, exists, warning: Kho đã lưu không còn dùng được (đã về mặc định) }
 */
export function workspaceFor(brandId = '', { home = AVS_HOME(), userHome = os.homedir() } = {}) {
  let saved, title = 'Chung', brand = '';
  const b = brandId ? (readJson(brandsFile(home))?.brands || []).find(x => x.id === brandId) : null;
  if (b) { brand = b.id; title = b.title || b.name || b.id; saved = b.workspace; } else saved = readJson(commonFile(home))?.root;
  const bad = typeof saved === 'string' ? workspaceProblem(saved, home) : null;
  if (typeof saved === 'string' && !bad) { const root = path.resolve(saved); return { root, brand, title, custom: true, exists: fs.existsSync(root), warning: null }; }
  // mặc định theo tên; trùng tên với Kho của thương hiệu khác (hai tên giống nhau sau safeName) → thêm id vào tên
  let root = defaultRoot(title, userHome);
  const o = ownerOf(root); if (o !== null && o !== brand) root = defaultRoot(`${title} ${brand || 'chung'}`, userHome);
  return { root, brand, title, custom: false, exists: fs.existsSync(root), warning: bad ? `Kho đã chọn không dùng được (${bad}), đang dùng thư mục mặc định` : null };
}

/** Ghi Kho cho thương hiệu (hoặc Kho Chung). Lỗi có .status: 400 thư mục không hợp lệ, 404 không thấy thương hiệu, 409 Kho của thương hiệu khác. */
export function setWorkspace(brandId, dir, { home = AVS_HOME(), mustExist = false } = {}) {
  const why = workspaceProblem(dir, home, { mustExist });
  if (why) throw Object.assign(new Error(why), { status: 400 });
  const root = path.resolve(dir.trim()), o = ownerOf(root);
  if (o !== null && o !== (brandId || '')) throw Object.assign(new Error('Thư mục này đang là Kho của thương hiệu khác'), { status: 409 });
  const f = brandsFile(home);
  withFileLock(f + '.lock', () => {
    if (brandId) {
      const data = readJson(f) || { version: 1, brands: [] };
      const b = (data.brands || []).find(x => x.id === brandId);
      if (!b) throw Object.assign(new Error('không thấy thương hiệu'), { status: 404 });
      b.workspace = root; b.updated = new Date().toISOString(); writeJson(f, data);
    } else writeJson(commonFile(home), { version: 1, root });
  });
  return ensureWorkspace(workspaceFor(brandId, { home }));
}

/** Tạo gốc Kho + .kho.json (không tạo sẵn thư mục con: tạo khi cần ghi, để Kho trỏ vào thư mục có sẵn không bị rác). */
export function ensureWorkspace(ws) {
  const o = ownerOf(ws.root);
  if (o !== null && o !== ws.brand) throw Object.assign(new Error('Thư mục này đang là Kho của thương hiệu khác'), { status: 409 });
  fs.mkdirSync(ws.root, { recursive: true });
  const f = path.join(ws.root, '.kho.json'), old = readJson(f) || {};
  if (old.version !== LAYOUT_VERSION || old.brand !== ws.brand || old.title !== ws.title) writeJson(f, { ...old, version: LAYOUT_VERSION, brand: ws.brand, title: ws.title, created: old.created || new Date().toISOString() });
  return { ...ws, exists: true };
}

/** Đường dẫn thư mục con theo loại (tạo khi mkdir = true). Loại lạ → lỗi .status 400. */
export function sub(ws, kind, { mkdir = false } = {}) {
  if (!own(KHO_DIRS, kind)) throw Object.assign(new Error(`loại thư mục Kho lạ: ${String(kind).slice(0, 40)}`), { status: 400 });
  const d = path.join(ws.root, ...KHO_DIRS[kind].split('/'));
  if (mkdir) fs.mkdirSync(d, { recursive: true });
  return d;
}
/** p nằm trong Kho, đã giải junction/symlink (không ra ngoài qua liên kết). */
export const inWorkspace = (ws, p) => inside(realish(p), realish(ws.root));
/** Đường dẫn tương đối với Kho, dấu / (để ghi vào source.json, .kho.json). */
export const relTo = (ws, p) => path.relative(ws.root, path.resolve(p)).split(path.sep).join('/');

/** Tên chưa dùng trong thư mục d: "x.mp4" → "x (2).mp4"; thư mục cũng vậy. */
export function freeName(d, name) {
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  let n = name, i = 2;
  while (fs.existsSync(path.join(d, n))) n = `${base} (${i++})${ext}`;
  return n;
}
/** Thư mục dự án mới trong Du an/ (chưa tạo). */
export function projectDirFor(ws, name) { const d = sub(ws, 'projects', { mkdir: true }); return path.join(d, freeName(d, safeName(name))); }
/** Thư mục thành phẩm của tháng (tạo sẵn). */
export function deliveredDir(ws, date = new Date()) {
  const d = path.join(sub(ws, 'delivered'), `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  fs.mkdirSync(d, { recursive: true }); return d;
}

/**
 * Liên kết cứng src → dst (cùng ổ), không được thì chép. Không ghi đè dst có sẵn. → 'link' | 'copy'
 * Quy tắc như project_clone (M54): file liên kết dùng chung inode, KHÔNG ghi đè tại chỗ; muốn thay thì xoá rồi ghi file mới.
 * o.ws: dst phải nằm trong Kho này (ghi vào Thanh pham/, Nguon/…).
 */
export function linkOrCopy(src, dst, { ws = null } = {}) {
  if (ws && !inWorkspace(ws, dst)) throw Object.assign(new Error('Đích không nằm trong Kho'), { status: 400 });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (fs.existsSync(dst)) throw Object.assign(new Error(`đã có ${path.basename(dst)}`), { code: 'EEXIST' });
  try { fs.linkSync(src, dst); return 'link'; } catch { fs.copyFileSync(src, dst, fs.constants.COPYFILE_EXCL); return 'copy'; }
}

/**
 * Liệt kê file trong Kho theo loại, đọc cả thư mục có sẵn không theo cấu trúc. Mới nhất trước.
 * Bỏ: file/thư mục ẩn, Du an/, Thanh pham/, *_frames/, thư mục dự án (có timeline.json, kể cả gốc). Sâu tối đa `depth`;
 * duyệt tối đa `scan` file rồi mới sắp và cắt `max`.
 * → [{ rel, name, kind, dir: thư mục con cấp 1 ('' = gốc), size, mtime }]
 */
export function listWorkspace(ws, { kind = null, depth = 4, max = 5000, scan = 20000 } = {}) {
  const out = [], skip = new Set([KHO_DIRS.projects, KHO_DIRS.delivered].map(key));
  const walk = (d, rel, lv) => {
    if (out.length >= scan) return;
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    if (ents.some(e => e.name === 'timeline.json')) return; // một dự án Studio nằm lẫn trong thư mục có sẵn
    for (const e of ents) {
      if (out.length >= scan) return;
      if (e.name.startsWith('.')) continue;
      const r = rel ? `${rel}/${e.name}` : e.name, p = path.join(d, e.name);
      if (e.isDirectory()) { if ((lv === 0 && skip.has(key(e.name))) || /_frames$/i.test(e.name) || lv + 1 >= depth) continue; walk(p, r, lv + 1); continue; }
      if (!e.isFile()) continue;
      const k = kindOf(e.name); if (!k || (kind && k !== kind)) continue;
      let st; try { st = fs.statSync(p); } catch { continue; }
      out.push({ rel: r, name: e.name, kind: k, dir: r.includes('/') ? r.split('/')[0] : '', size: st.size, mtime: Math.round(st.mtimeMs) });
    }
  };
  if (fs.existsSync(ws.root)) walk(ws.root, '', 0);
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, max);
}
