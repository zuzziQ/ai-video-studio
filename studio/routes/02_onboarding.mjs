// Lần đầu mở Studio (ROADMAP M83): trạng thái hướng dẫn 3 bước + danh sách dự án gần đây, lưu ở $AVS_HOME/onboarding.json.
//   GET  /api/onboarding            → {done, skipped, step, purpose, aspect, platforms, brand, updated, recent:[{i, name, parent, t}], project}
//                                     (có dự án đang mở thì ghi nó lên đầu `recent`, tối đa 8)
//   POST /api/onboarding {…}        → gộp các khoá cho phép vào file; khoá lạ hoặc sai kiểu → 400, body > 8 KB → 413
//   POST /api/onboarding/open {i}   → mở dự án thứ i của `recent` (đường dẫn lấy từ file, không nhận từ trình duyệt)
// Thương hiệu và sản phẩm ghi qua API sẵn có (/api/brands/*, /api/products/*); file này chỉ nhớ id kit đã chọn.
// Không chứa token hay khoá; ghi qua file tạm rồi đổi tên để không để lại file dở.
import fs from 'node:fs';
import path from 'node:path';
import { AVS_HOME } from '../security.mjs';

export const PURPOSES = ['bds', 'khoahoc', 'banhang', 'review', 'chiase', 'tintuc', 'doanhnghiep', 'khac'];
export const ASPECTS = ['9:16', '16:9', '1:1'];
export const PLATFORMS = ['tiktok', 'youtube', 'facebook', 'instagram', 'zalo'];
const MAX_BODY = 8192, MAX_RECENT = 8;
const DEF = { done: false, skipped: false, step: 0, purpose: '', aspect: '', platforms: [], brand: '' };
// Mỗi khoá: hàm kiểm trả về giá trị sạch, hoặc undefined khi sai kiểu.
const CHECK = {
  done: v => (typeof v === 'boolean' ? v : undefined),
  skipped: v => (typeof v === 'boolean' ? v : undefined),
  step: v => (Number.isInteger(v) && v >= 0 && v <= 3 ? v : undefined),
  purpose: v => (v === '' || PURPOSES.includes(v) ? v : undefined),
  aspect: v => (v === '' || ASPECTS.includes(v) ? v : undefined),
  platforms: v => (Array.isArray(v) && v.length <= PLATFORMS.length && v.every(x => PLATFORMS.includes(x)) ? [...new Set(v)] : undefined),
  brand: v => (typeof v === 'string' && /^([a-z0-9][a-z0-9-]{0,39})?$/.test(v) ? v : undefined),
};

const file = () => path.join(AVS_HOME(), 'onboarding.json');
export function loadState() {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { /* chưa có hoặc hỏng: như người mới */ }
  const out = { ...DEF };
  for (const k of Object.keys(CHECK)) { const v = s && CHECK[k](s[k]); if (v !== undefined) out[k] = v; }
  out.recent = (Array.isArray(s?.recent) ? s.recent : []).filter(r => r && typeof r.dir === 'string' && path.isAbsolute(r.dir)).slice(0, MAX_RECENT)
    .map(r => ({ dir: r.dir, name: String(r.name || path.basename(r.dir)).slice(0, 120), t: String(r.t || '').slice(0, 30) }));
  out.updated = typeof s?.updated === 'string' ? s.updated.slice(0, 30) : '';
  out.exists = !!s && Object.keys(s).length > 0;
  return out;
}
export function storeState(s) {
  const f = file(), { exists, ...data } = s;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, ...data, updated: new Date().toISOString() }, null, 1));
  fs.renameSync(tmp, f);
}
/** Gộp `patch` (đã parse JSON) vào trạng thái; ném lỗi có .status khi khoá lạ hoặc sai kiểu. */
export function applyPatch(s, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw Object.assign(new Error('Dữ liệu hướng dẫn phải là một object'), { status: 400 });
  const out = { ...s };
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in CHECK)) throw Object.assign(new Error(`Khoá không hỗ trợ: ${k.slice(0, 40)}`), { status: 400 });
    const c = CHECK[k](v);
    if (c === undefined) throw Object.assign(new Error(`Giá trị sai cho ${k}`), { status: 400 });
    out[k] = c;
  }
  return out;
}
// Ghi dự án đang mở lên đầu danh sách (chỉ ghi file khi thứ tự đổi).
function touchRecent(s, dir) {
  if (!dir || s.recent[0]?.dir === dir) return false;
  s.recent = [{ dir, name: path.basename(dir), t: new Date().toISOString() }, ...s.recent.filter(r => r.dir !== dir)].slice(0, MAX_RECENT);
  return true;
}
/** Thêm dự án vào "Dự án gần đây" từ ngoài Studio (Tự lái tạo dự án mà chưa mở lần nào, S16 M118). */
export function addRecent(dir) {
  if (!dir || !path.isAbsolute(dir)) return false;
  // chưa có onboarding.json (chạy Tự lái bằng dòng lệnh trước khi mở Studio): không tạo file, để người mới vẫn thấy hướng dẫn
  const s = loadState(); if (!s.exists || !touchRecent(s, dir)) return false;
  storeState(s); return true;
}
const pub = (s, project) => ({
  done: s.done, skipped: s.skipped, step: s.step, purpose: s.purpose, aspect: s.aspect, platforms: s.platforms, brand: s.brand, updated: s.updated,
  isNew: !s.exists, project: !!project,
  recent: s.recent.map((r, i) => ({ i, name: r.name, parent: path.basename(path.dirname(r.dir)), t: r.t, current: r.dir === project?.dir })),
});

export default ctx => async (req, res, p) => {
  if (p !== '/api/onboarding' && !p.startsWith('/api/onboarding/')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  try {
    if (p === '/api/onboarding' && req.method === 'GET') {
      const s = loadState();
      if (ctx.project && touchRecent(s, ctx.project.dir)) storeState(s);
      return J(pub(s, ctx.project));
    }
    if (req.method !== 'POST') return false;
    if (+req.headers['content-length'] > MAX_BODY) { req.resume(); return J({ error: 'Dữ liệu gửi lên quá lớn' }, 413); }
    const body = await ctx.body(req);
    if (p === '/api/onboarding') {
      const s = applyPatch(loadState(), body);
      storeState(s);
      return J(pub(loadState(), ctx.project));
    }
    if (p === '/api/onboarding/open') {
      const s = loadState(), r = Number.isInteger(body?.i) ? s.recent[body.i] : null;
      if (!r) return J({ error: 'Không thấy dự án này trong danh sách gần đây' }, 400);
      if (!fs.existsSync(r.dir)) {
        s.recent = s.recent.filter(x => x.dir !== r.dir); storeState(s);
        return J({ error: 'Thư mục dự án không còn trên máy — đã bỏ khỏi danh sách' }, 404);
      }
      ctx.openProject(r.dir); // từ chối (thư mục cấu hình, không có timeline) → lỗi có .status
      return J({ ok: true });
    }
    return false;
  } catch (e) {
    return J({ error: e.message }, e.status || 500);
  }
};
