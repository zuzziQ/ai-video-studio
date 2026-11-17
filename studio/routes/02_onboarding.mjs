// Lần đầu mở Studio (ROADMAP M83): trạng thái hướng dẫn 3 bước + danh sách dự án gần đây, lưu ở $AVS_HOME/onboarding.json.
//   GET  /api/onboarding            → {done, skipped, step, purpose, aspect, platforms, brand, updated, recent:[{i, name, parent, t, …thẻ}], project}
//                                     (có dự án đang mở thì ghi nó lên đầu `recent`, tối đa 24). S19 M136: mỗi mục kèm thẻ của
//                                     scripts/home_cards.mjs {dur, brand, kho, edited, exported, aspect, thumb:{v}|null, thumbPending,
//                                     open (có trên thanh tab)}; chưa có ảnh bìa thì xếp hàng tạo nền (không chờ)
//   GET  /api/onboarding/thumb?i=   → ảnh bìa của mục thứ i (đường dẫn lấy từ file, không nhận từ trình duyệt)
//   POST /api/onboarding {…}        → gộp các khoá cho phép vào file; khoá lạ hoặc sai kiểu → 400, body > 8 KB → 413
//   POST /api/onboarding/open {i}   → mở dự án thứ i của `recent` (đường dẫn lấy từ file, không nhận từ trình duyệt)
//   POST /api/onboarding/sample     → S17 M125: chép dự án mẫu (sample/clip-mau của repo) vào $AVS_HOME/footage/clip-mau khi
//                                     chưa có, rồi mở nó (nút "Xem thử dự án mẫu" trên trang chủ; trình cài không tạo sẵn nữa)
// "Dự án gần đây" không ghi và không hiện dự án mẫu (`clip-mau`) và dự án trong thư mục tạm của máy (ngoài $AVS_HOME).
// Thương hiệu và sản phẩm ghi qua API sẵn có (/api/brands/*, /api/products/*); file này chỉ nhớ id kit đã chọn.
// Không chứa token hay khoá; ghi qua file tạm rồi đổi tên để không để lại file dở.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AVS_HOME, fileAllowed } from '../security.mjs';
import { cardOf, queueThumb, thumbOf, thumbPending } from '../../scripts/home_cards.mjs';

export const PURPOSES = ['bds', 'khoahoc', 'banhang', 'review', 'chiase', 'tintuc', 'doanhnghiep', 'khac'];
export const ASPECTS = ['9:16', '16:9', '1:1'];
export const PLATFORMS = ['tiktok', 'youtube', 'facebook', 'instagram', 'zalo'];
const MAX_BODY = 8192, MAX_RECENT = 24;
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
export const SAMPLE_NAME = 'clip-mau';
const norm = p => { const r = path.resolve(p); return process.platform === 'win32' ? r.toLowerCase() : r; };
const inDir = (p, root) => { const a = norm(p), b = norm(root); return a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep); };
/** S17 M125: dự án không đưa vào "Dự án gần đây": dự án mẫu, hoặc nằm trong thư mục tạm của máy (trừ khi ở trong $AVS_HOME). */
export function hiddenRecent(dir) {
  if (typeof dir !== 'string' || !dir) return true;
  if (path.basename(path.resolve(dir)).toLowerCase() === SAMPLE_NAME) return true;
  let tmp = os.tmpdir(); try { tmp = fs.realpathSync.native(tmp); } catch { /* giữ nguyên */ }
  const cands = [path.resolve(dir)]; try { cands.push(fs.realpathSync.native(dir)); } catch { /* thư mục đã mất */ }
  return cands.some(d => (inDir(d, os.tmpdir()) || inDir(d, tmp)) && !inDir(d, AVS_HOME()));
}
// Ghi dự án đang mở lên đầu danh sách (chỉ ghi file khi thứ tự đổi).
function touchRecent(s, dir) {
  if (!dir || hiddenRecent(dir) || s.recent[0]?.dir === dir) return false;
  // mục cũ bị ẩn (dự án mẫu, dự án tạm ghi trước M125) bỏ luôn khi ghi, để không chiếm chỗ trong danh sách
  s.recent = [{ dir, name: path.basename(dir), t: new Date().toISOString() }, ...s.recent.filter(r => r.dir !== dir && !hiddenRecent(r.dir))].slice(0, MAX_RECENT);
  return true;
}
/** Thêm dự án vào "Dự án gần đây" từ ngoài Studio (Tự lái tạo dự án mà chưa mở lần nào, S16 M118). */
export function addRecent(dir) {
  if (!dir || !path.isAbsolute(dir)) return false;
  // chưa có onboarding.json (chạy Tự lái bằng dòng lệnh trước khi mở Studio): không tạo file, để người mới vẫn thấy hướng dẫn
  const s = loadState(); if (!s.exists || !touchRecent(s, dir)) return false;
  storeState(s); return true;
}
/** Chép dự án mẫu của repo vào $AVS_HOME/footage/clip-mau. timeline.json và work/captions.json đã có thì giữ (người dùng đã sửa);
 *  words.json, aroll.mp4 chép lại khi khác kích thước. Khung hình (work/frames) không chép: Studio hỏi dựng lại từ work/aroll.mp4
 *  khi mở (M63). Chép bất đồng bộ (video vài MB không chặn server). Trả thư mục dự án. */
let sampleBusy = false;
export async function ensureSample(skill) {
  const src = path.join(skill || '', 'sample', SAMPLE_NAME);
  if (!skill || !fs.existsSync(path.join(src, 'timeline.json'))) throw Object.assign(new Error('Bản cài này không có dự án mẫu (thiếu sample/clip-mau)'), { status: 404 });
  const dst = path.join(AVS_HOME(), 'footage', SAMPLE_NAME), w = path.join(dst, 'work');
  fs.mkdirSync(path.join(w, 'frames'), { recursive: true });
  const cp = async (rel, keep) => {
    const a = path.join(src, rel), b = path.join(dst, rel); if (!fs.existsSync(a)) return;
    let have = null; try { have = fs.statSync(b).size; } catch { /* chưa có */ }
    if (have === null || (!keep && have !== fs.statSync(a).size)) await fs.promises.copyFile(a, b);
  };
  if (sampleBusy) throw Object.assign(new Error('Đang chép dự án mẫu, đợi một chút'), { status: 409 });
  sampleBusy = true;
  try { await cp('timeline.json', true); await cp('work/captions.json', true); await cp('work/words.json'); await cp('work/aroll.mp4'); }
  finally { sampleBusy = false; }
  return dst;
}
const dkey = d => { const r = path.resolve(d); return process.platform === 'win32' ? r.toLowerCase() : r; };
// S19 M136: thẻ của một mục (null khi thư mục không còn timeline.json); chưa có ảnh bìa thì xếp hàng tạo nền
function card(dir, open) {
  const c = cardOf(dir); if (!c) return { gone: true };
  if (!c.thumb) queueThumb(dir);
  return { ...c, thumbPending: !c.thumb && thumbPending(dir), open: open.has(dkey(dir)) };
}
const pub = (s, project, tabs) => { const open = new Set((tabs?.list?.() || []).map(t => dkey(t.dir))); return {
  done: s.done, skipped: s.skipped, step: s.step, purpose: s.purpose, aspect: s.aspect, platforms: s.platforms, brand: s.brand, updated: s.updated,
  isNew: !s.exists, project: !!project,
  // `i` giữ vị trí trong file (POST /open nhận nó) nên lọc sau khi đánh số
  // S18 M128: clip của một lần cắt (thư mục cha có highlights.json) mang `set` để trang chủ gom thành một bộ
  recent: s.recent.map((r, i) => ({ i, name: r.name, parent: path.basename(path.dirname(r.dir)), t: r.t, current: r.dir === project?.dir, hide: hiddenRecent(r.dir),
    ...(fs.existsSync(path.join(path.dirname(r.dir), 'highlights.json')) ? { set: path.basename(path.dirname(r.dir)) } : {}) }))
    .filter(r => !r.hide).map(r => { const { hide, ...x } = r; return { ...x, ...card(s.recent[r.i].dir, open) }; }),
}; };

export default ctx => async (req, res, p) => {
  if (p !== '/api/onboarding' && !p.startsWith('/api/onboarding/')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  try {
    if (p === '/api/onboarding' && req.method === 'GET') {
      const s = loadState();
      if (ctx.project && touchRecent(s, ctx.project.dir)) storeState(s);
      return J(pub(s, ctx.project, ctx.tabs));
    }
    if (p === '/api/onboarding/thumb' && req.method === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams.get('i'), r = /^\d{1,3}$/.test(q || '') ? loadState().recent[+q] : null;
      const f = r && !hiddenRecent(r.dir) ? thumbOf(r.dir) : null;
      if (!f || !fileAllowed(f)) return J({ error: 'Chưa có ảnh bìa' }, 404);
      ctx.sendFile(req, res, f); return true;
    }
    if (req.method !== 'POST') return false;
    if (+req.headers['content-length'] > MAX_BODY) { req.resume(); return J({ error: 'Dữ liệu gửi lên quá lớn' }, 413); }
    const body = await ctx.body(req);
    if (p === '/api/onboarding') {
      const s = applyPatch(loadState(), body);
      storeState(s);
      return J(pub(loadState(), ctx.project, ctx.tabs));
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
    if (p === '/api/onboarding/sample') {
      const dir = await ensureSample(ctx.SKILL);
      ctx.openProject(dir);
      return J({ ok: true });
    }
    return false;
  } catch (e) {
    return J({ error: e.message }, e.status || 500);
  }
};
