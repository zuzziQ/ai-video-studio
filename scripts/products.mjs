// Product Brain (ROADMAP M18): hồ sơ sản phẩm dùng chung nhiều dự án, mỗi sản phẩm một file
// `$AVS_HOME/products/<id>.json` (mặc định ~/.ai-video-studio/products). Spec: references/products.md.
// Dự án trỏ tới hồ sơ bằng `timeline.ads.product = "<id>"`; scripts/ad_gates.py tự giải hồ sơ khi soát quảng cáo.
//
// Hồ sơ: {version, id, name, brand, industry, price (chuỗi giữ nguyên như người dùng/trang ghi, M91), claims:[{id, text, status, evidence, source, expires}],
//         blocked:[cụm từ], faq:[{q, a}], notes, created, updated}
// claims[].status: approved (phải có evidence) | pending | prohibited | expired. `expires` (YYYY-MM-DD) đã qua
// thì claim approved được coi là expired.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const INDUSTRIES = ['general', 'cosmetics', 'supplements', 'food', 'finance', 'health_device'];
export const STATUSES = ['approved', 'pending', 'prohibited', 'expired'];
// Một đoạn chữ thường, số, gạch ngang/dưới; không dấu chấm, không gạch chéo: không thể thoát khỏi thư mục products/.
export const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const LIM = { name: 120, brand: 120, price: 60, text: 400, evidence: 600, source: 300, phrase: 120, q: 300, a: 1200, notes: 4000 };
const MAX = { claims: 200, blocked: 200, faq: 100 };

export const productsDir = (home = process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio')) => path.join(home, 'products');

export class ProductError extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

export const validId = id => typeof id === 'string' && ID_RE.test(id);

/** Đường dẫn file của hồ sơ `id`, chỉ khi id hợp lệ và file (kể cả qua symlink) nằm trong thư mục products/. */
export function productFile(id, dir = productsDir()) {
  if (!validId(id)) throw new ProductError(`id hồ sơ sản phẩm không hợp lệ: ${JSON.stringify(String(id).slice(0, 80))}`);
  const f = path.join(dir, id + '.json');
  if (fs.existsSync(f)) {
    // so sau realpath (symlink, tên ngắn 8.3) và không phân biệt hoa/thường trên Windows, không so chuỗi thô
    const nc = s => (process.platform === 'win32' ? s.toLowerCase() : s);
    const real = fs.realpathSync.native(f), root = fs.realpathSync.native(dir);
    if (nc(path.dirname(real)) !== nc(root)) throw new ProductError('hồ sơ sản phẩm trỏ ra ngoài thư mục products/', 403);
  }
  return f;
}

export function newId(name) {
  const base = String(name || 'san-pham').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'san-pham';
  return `${base}-${crypto.randomBytes(2).toString('hex')}`;
}

const str = (v, n) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, n);
const date = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');

/** Chuẩn hoá một hồ sơ từ client hoặc từ đĩa. `strict` = ném lỗi khi claim đã duyệt thiếu bằng chứng. */
export function normalizeProduct(raw, { strict = true } = {}) {
  if (!raw || typeof raw !== 'object') throw new ProductError('hồ sơ sản phẩm phải là một object');
  const name = str(raw.name, LIM.name);
  if (!name) throw new ProductError('hồ sơ sản phẩm cần tên');
  const seen = new Set();
  const claims = [];
  for (const [i, c] of (Array.isArray(raw.claims) ? raw.claims : []).slice(0, MAX.claims).entries()) {
    if (!c || typeof c !== 'object') continue;
    const text = str(c.text, LIM.text);
    if (!text) continue;
    let id = str(c.id, 40).replace(/[^\w-]/g, '') || `c${i + 1}`;
    while (seen.has(id)) id += 'x';
    seen.add(id);
    const status = STATUSES.includes(c.status) ? c.status : 'pending';
    const evidence = str(c.evidence, LIM.evidence);
    if (strict && status === 'approved' && !evidence) throw new ProductError(`claim đã duyệt cần bằng chứng: “${text.slice(0, 60)}”`);
    claims.push({ id, text, status, evidence, source: str(c.source, LIM.source), expires: date(c.expires) });
  }
  const blocked = [...new Set((Array.isArray(raw.blocked) ? raw.blocked : String(raw.blocked || '').split('\n'))
    .map(b => str(b, LIM.phrase)).filter(Boolean))].slice(0, MAX.blocked);
  const faq = (Array.isArray(raw.faq) ? raw.faq : []).filter(x => x && typeof x === 'object')
    .map(x => ({ q: str(x.q, LIM.q), a: str(x.a, LIM.a) })).filter(x => x.q).slice(0, MAX.faq);
  return {
    version: 1, id: raw.id, name, brand: str(raw.brand, LIM.brand), price: str(raw.price, LIM.price),
    industry: INDUSTRIES.includes(raw.industry) ? raw.industry : '',
    claims, blocked, faq, notes: String(raw.notes || '').slice(0, LIM.notes),
    created: raw.created, updated: raw.updated,
  };
}

/** Trạng thái thực của claim hôm nay: approved đã quá `expires` thành expired. */
export function effectiveStatus(c, today = new Date().toISOString().slice(0, 10)) {
  return c.status === 'approved' && c.expires && c.expires < today ? 'expired' : c.status;
}

export function loadProduct(id, dir = productsDir()) {
  const f = productFile(id, dir);
  if (!fs.existsSync(f)) throw new ProductError(`không thấy hồ sơ sản phẩm “${id}”`, 404);
  const p = normalizeProduct(JSON.parse(fs.readFileSync(f, 'utf8')), { strict: false });
  return { ...p, id };
}

export function listProducts(dir = productsDir()) {
  let names = [];
  try { names = fs.readdirSync(dir).filter(f => f.endsWith('.json') && validId(f.slice(0, -5))); } catch { return []; }
  const out = [];
  for (const f of names) {
    try {
      const p = loadProduct(f.slice(0, -5), dir), n = s => p.claims.filter(c => effectiveStatus(c) === s).length;
      out.push({ id: p.id, name: p.name, brand: p.brand, industry: p.industry, updated: p.updated,
        claims: { approved: n('approved'), pending: n('pending'), prohibited: n('prohibited'), expired: n('expired') },
        blocked: p.blocked.length, faq: p.faq.length });
    } catch { /* file hỏng hoặc symlink ra ngoài: bỏ qua */ }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

/** Ghi hồ sơ (tạo mới khi chưa có id). Ghi qua file tạm rồi đổi tên để không để lại file dở. */
export function saveProduct(raw, dir = productsDir()) {
  const p = normalizeProduct(raw);
  const now = new Date().toISOString();
  let id = raw.id;
  if (id == null || id === '') { do id = newId(p.name); while (fs.existsSync(path.join(dir, id + '.json'))); }
  const f = productFile(id, dir);
  let created = now;
  if (fs.existsSync(f)) { try { created = JSON.parse(fs.readFileSync(f, 'utf8')).created || now; } catch { /* ghi đè file hỏng */ } }
  const out = { ...p, id, created, updated: now };
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 1));
  fs.renameSync(tmp, f);
  return out;
}

export function deleteProduct(id, dir = productsDir()) {
  const f = productFile(id, dir);
  if (!fs.existsSync(f)) throw new ProductError(`không thấy hồ sơ sản phẩm “${id}”`, 404);
  fs.rmSync(f);
  return { ok: true };
}
