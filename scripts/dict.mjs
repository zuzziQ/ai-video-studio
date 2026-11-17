// Từ điển sửa lời thoại "sai=đúng" (ROADMAP M89). Whisper không biết tên riêng, nên sau mỗi lần nhận dạng
// các cặp này được áp bằng `captions.py --fix=...` (giữ thời gian gốc của từ).
//
// Ba nguồn, gộp theo thứ tự (nguồn sau thắng khi trùng chữ sai):
//   1. tự có: tên thương hiệu (brand kit `title`/`name`) và tên sản phẩm của dự án (`timeline.ads.product`)
//      → cặp "chữ thường=Đúng Hoa" (sửa cách viết hoa, Whisper viết thường tên riêng);
//   2. thương hiệu: khoá `dict` của brand kit trong `$AVS_HOME/brands.json` (chuỗi "sai=đúng;sai=đúng");
//   3. dự án: `<dự án>/.studio/dict.json` = {version: 1, entries: [{from, to}]}.
//   (S19 M134) giữa 1 và 2: chính tả đã học của thương hiệu (scripts/profile.mjs learnedDict: chữ phụ đề người dùng hay sửa),
//   nên từ điển gõ tay của thương hiệu và của dự án vẫn thắng.
// Chuỗi đi vào dòng lệnh nên được kiểm: không ký tự điều khiển, không `=`/`;` trong một vế, mỗi vế ≤ 80 ký tự,
// tối đa 500 cặp, cả chuỗi ≤ 8000 ký tự; truyền dạng một tham số `--fix=<chuỗi>` (không thể thành tham số khác).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProduct } from './products.mjs';
import { learnedDict } from './profile.mjs';

export const LIMITS = { side: 80, entries: 500, arg: 8000 };
const home = () => process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio');
// eslint-disable-next-line no-control-regex
const BAD = /[=;\u0000-\u001f\u007f]/;

/** Một vế: NFC, gộp khoảng trắng, bỏ dấu câu ở hai đầu; null nếu rỗng, quá dài hoặc có ký tự cấm. */
export function cleanSide(v) {
  if (typeof v !== 'string') return null;
  const s = v.normalize('NFC').replace(/\s+/g, ' ').trim().replace(/^[,.!?:"'“”]+|[,.!?:"'“”]+$/g, '').trim();
  if (!s || s.length > LIMITS.side || BAD.test(s) || s.startsWith('-')) return null;
  return s;
}
const keyOf = s => s.toLocaleLowerCase('vi');

/** Danh sách cặp sạch: bỏ cặp hỏng, cặp không đổi gì, trùng chữ sai thì cặp sau thắng; tối đa 500. */
export function normalizeEntries(list) {
  if (!Array.isArray(list)) return [];
  const m = new Map();
  for (const it of list) {
    const from = cleanSide(it?.from), to = cleanSide(it?.to);
    if (!from || !to || from === to) continue;
    m.delete(keyOf(from)); m.set(keyOf(from), { from, to });
  }
  return [...m.values()].slice(-LIMITS.entries);
}

/** "sai=đúng;sai 2=đúng 2" (hoặc mỗi dòng một cặp, `→` cũng được) → [{from, to}]. */
export function parseDict(str) {
  if (typeof str !== 'string') return [];
  return normalizeEntries(str.split(/[;\n]+/).map(p => { const m = p.split(/=|→/); return m.length === 2 ? { from: m[0], to: m[1] } : null; }).filter(Boolean));
}
export const dictString = entries => normalizeEntries(entries).map(e => `${e.from}=${e.to}`).join(';');

/** Chuỗi cho `--fix=`: gộp các nguồn, cắt ở 8000 ký tự (bỏ cặp cuối thay vì cắt giữa cặp). */
export function fixArg(...sources) {
  const all = normalizeEntries(sources.flat());
  let out = '';
  for (const e of all) { const p = `${e.from}=${e.to}`; if (out.length + p.length + 1 > LIMITS.arg) break; out += (out ? ';' : '') + p; }
  return out;
}
/** Tham số dòng lệnh cho captions.py: [] khi không có cặp nào. */
export const fixArgs = fix => (fix ? [`--fix=${fix}`] : []);

/** Tên riêng → cặp "chữ thường=Tên" (chỉ khi tên có chữ hoa, tức là có gì để sửa). */
export function nameEntries(names) {
  const out = [];
  for (const n of names) {
    const to = cleanSide(n);
    if (to && keyOf(to) !== to) out.push({ from: keyOf(to), to });
  }
  return out;
}

// ---------- đọc / ghi ----------
export const projectDictFile = dir => path.join(dir, '.studio', 'dict.json');
export function loadProjectDict(dir) {
  try { return normalizeEntries(JSON.parse(fs.readFileSync(projectDictFile(dir), 'utf8')).entries); } catch { return []; }
}
/** Ghi nguyên tử (file tạm cùng thư mục rồi đổi tên). */
export function saveProjectDict(dir, entries) {
  const clean = normalizeEntries(entries), f = projectDictFile(dir);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, entries: clean }, null, 1));
  fs.renameSync(tmp, f);
  return clean;
}
export function loadKit(id, h = home()) {
  if (!id || typeof id !== 'string') return null;
  try { return JSON.parse(fs.readFileSync(path.join(h, 'brands.json'), 'utf8')).brands.find(b => b.id === id) || null; } catch { return null; }
}
/** Id brand kit mặc định (chọn ở hướng dẫn lần đầu). */
export function defaultKitId(h = home()) {
  try { const o = JSON.parse(fs.readFileSync(path.join(h, 'onboarding.json'), 'utf8')); return typeof o.brand === 'string' ? o.brand : null; } catch { return null; }
}
function productName(id, h) {
  if (!id) return [];
  try { const p = loadProduct(id, path.join(h, 'products')); return [p.name, p.brand].filter(Boolean); } catch { return []; }
}

/**
 * Mọi nguồn của một dự án: {auto, brand, project, kit:{id,title}|null}.
 * `dir`: thư mục dự án (đọc timeline.json nếu có để lấy brand.kit và ads.product); `kit`/`product` ghi đè.
 */
export function dictSources({ dir, kit, product, timeline, h = home() } = {}) {
  let tl = timeline;
  if (!tl && dir) { try { tl = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8')); } catch { tl = null; } }
  const kitObj = typeof kit === 'object' && kit ? kit : loadKit(kit || tl?.brand?.kit || defaultKitId(h), h);
  const names = [kitObj?.title, kitObj?.name, tl?.brand?.name, ...productName(product || tl?.ads?.product, h)];
  return {
    auto: nameEntries([...new Set(names.filter(Boolean))]),
    brand: parseDict(kitObj?.dict || ''),
    learned: normalizeEntries(learnedDict(kitObj?.id || 'chung')),
    project: dir ? loadProjectDict(dir) : [],
    kit: kitObj ? { id: kitObj.id, title: kitObj.title || kitObj.name || '' } : null,
  };
}
/** Chuỗi `--fix` của một dự án (gọi ngay trước captions.py). Không bao giờ ném lỗi: từ điển hỏng = không sửa. */
export function projectFix(opts = {}) {
  try { const s = dictSources(opts); return fixArg(s.auto, s.learned, s.brand, s.project); } catch { return ''; }
}
/** Các từ đích (đúng) của chuỗi fix: giữ nguyên chữ hoa khi bước sau hạ chữ thường cả phụ đề. */
export function fixWords(fix) {
  return new Set(parseDict(fix).flatMap(e => e.to.split(' ')));
}
