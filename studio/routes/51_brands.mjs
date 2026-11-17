// Brand kit nhiều thương hiệu: ~/.ai-video-studio/brands.json + logo trong ~/.ai-video-studio/brands/<id>/ (AVS_HOME đổi được thư mục).
// S12 (M97): brands.json đọc-sửa-ghi dưới khoá withFileLock(brands.json.lock), cùng khoá với setWorkspace (scripts/workspace.mjs), nên
// khoá `workspace` (Kho của thương hiệu) không bị bản lưu khác ghi đè; mỗi thẻ trả thêm `ws` (Kho); logo gốc chép thêm vào <Kho>/Thuong hieu/.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { brandFields } from '../../scripts/batch.mjs';
import { dictString, parseDict, LIMITS } from '../../scripts/dict.mjs';
import { retryBusy, withFileLock } from '../../scripts/file_lock.mjs';
import * as W from '../../scripts/workspace.mjs';
import { stylesOut, upsertProfile, resetLearned, deleteStyle, CHUNG } from '../../scripts/profile.mjs';

// Cùng một AVS_HOME với setWorkspace (W.AVS_HOME = security.mjs) để hai bên dùng đúng một file khoá brands.json.lock
const AVS_HOME = W.AVS_HOME(), FILE = path.join(AVS_HOME, 'brands.json'), DIR = path.join(AVS_HOME, 'brands');
const KEYS = ['title', 'name', 'primary', 'accent', 'dark', 'light', 'font', 'disp', 'logo', 'handle', 'phone', 'website', 'pack', 'outro'];
const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')).brands || []; } catch { return []; } };
const store = list => { fs.mkdirSync(AVS_HOME, { recursive: true }); const t = `${FILE}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify({ version: 1, brands: list }, null, 1)); retryBusy(() => fs.renameSync(t, FILE)); };
// Đọc-sửa-ghi trong khoá. fn(list) trả kết quả; fn ném lỗi thì không ghi.
const mutate = fn => withFileLock(FILE + '.lock', () => { const list = load(); const r = fn(list); store(list); return r; });
const notFound = () => Object.assign(new Error('không thấy brand'), { status: 404 });
const newId = name => (String(name || 'brand').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'brand') + '-' + crypto.randomBytes(2).toString('hex');
// M91: trợ lý Thương hiệu đề xuất thêm slogan, CTA và giọng văn (dòng riêng để không đụng dòng KEYS ở trên)
KEYS.push('slogan', 'cta', 'voice');
const kho = b => { try { const ws = W.workspaceFor(b.id); return { root: ws.root, custom: ws.custom, exists: ws.exists, warning: ws.warning }; } catch { return null; } };
const pub = b => ({ ...b, ws: kho(b), logoUrl: b.logo && fs.existsSync(path.join(DIR, b.id, b.logo)) ? `/api/brands/logo/${b.id}?v=${Math.round(fs.statSync(path.join(DIR, b.id, b.logo)).mtimeMs)}` : null });
// Bản gốc logo vào <Kho>/Thuong hieu/ (chỗ đọc logo của brand kit giữ nguyên). File cùng tên, cùng cỡ đã có thì thôi. Lỗi → câu cảnh báo.
// Kho chưa tạo thì thôi (không tạo Kho ngầm): /api/kho/create|set chép logo của brand kit vào khi Kho được tạo/chọn (12_workspace).
export function logoToKho(id, src, name) {
  try {
    const ws0 = W.workspaceFor(id); if (!ws0.exists) return null;
    const ws = W.ensureWorkspace(ws0), d = W.sub(ws, 'brand', { mkdir: true });
    const raw = path.basename(String(name || 'logo').replace(/\\/g, '/'));
    const base = W.safeName(raw.slice(0, raw.length - path.extname(raw).length) || 'logo') + path.extname(src);
    const same = path.join(d, base);
    if (fs.existsSync(same) && fs.statSync(same).size === fs.statSync(src).size) return null;
    const dst = path.join(d, W.freeName(d, base));
    if (!W.inWorkspace(ws, dst)) return 'Không chép được logo vào Kho';
    fs.copyFileSync(src, dst, fs.constants.COPYFILE_EXCL);
    return null;
  } catch (e) { return `Chưa chép logo vào Kho: ${e.message}`; }
}

export default ctx => async (req, res, p, u) => {
  if (!p.startsWith('/api/brands')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  if (p === '/api/brands' && req.method === 'GET') return J(load().map(pub));
  // S19 M133: Phong cách dựng + Điều đã học của từng thương hiệu (scripts/profile.mjs, styles.json); 'chung' = không thương hiệu
  if (p === '/api/brands/styles' && req.method === 'GET') return J(stylesOut());
  if (p.startsWith('/api/brands/logo/') && req.method === 'GET') {
    const b = load().find(x => x.id === p.slice(17));
    return b?.logo ? (ctx.sendFile(req, res, path.join(DIR, b.id, b.logo)), true) : J({ error: 'không có logo' }, 404);
  }
  if (req.method !== 'POST') return false;
  try {
    if (p === '/api/brands/logo') {
      const id = u.searchParams.get('id');
      if (!load().some(x => x.id === id)) return J({ error: 'không thấy brand' }, 404);
      const ext = (path.extname(u.searchParams.get('name') || '.png').toLowerCase().match(/^\.(png|jpe?g|webp|svg|gif)$/) || ['.png'])[0];
      const d = path.join(DIR, id); fs.mkdirSync(d, { recursive: true });
      for (const f of fs.readdirSync(d).filter(f => f.startsWith('logo.'))) fs.rmSync(path.join(d, f));
      await new Promise((ok, bad) => { const w = fs.createWriteStream(path.join(d, 'logo' + ext)); req.pipe(w); w.on('finish', ok); w.on('error', bad); });
      const b = mutate(list => { const x = list.find(y => y.id === id); if (!x) throw notFound(); x.logo = 'logo' + ext; x.updated = new Date().toISOString(); return x; });
      const warn = logoToKho(id, path.join(d, 'logo' + ext), u.searchParams.get('name'));
      return J({ ...pub(b), ...(warn ? { khoWarning: warn } : {}) });
    }
    const body = await ctx.body(req);
    if (p === '/api/brands/save') {
      const src = body.brand;
      if (!src || typeof src !== 'object' || Array.isArray(src)) return J({ error: 'Thiếu dữ liệu thương hiệu' }, 400);
      if ((!src.id || 'title' in src) && !String(src.title || src.name || '').trim()) return J({ error: 'Đặt tên thương hiệu trước khi lưu' }, 400);
      // Pack ids are registered by the engine in the browser (window.PACKS); the server can only check the shape. The editor checks it exists.
      if (src.pack && !/^[A-Za-z0-9_-]{1,60}$/.test(String(src.pack))) return J({ error: 'Gói style không hợp lệ' }, 400);
      // chỉ khoá trong KEYS (+ dict) đổi được ở đây; `workspace` do /api/kho/set ghi nên bản gửi lên không đổi hay xoá được nó
      const b = mutate(list => {
        let b = src.id && list.find(x => x.id === src.id);
        if (!b) { b = { id: newId(src.title || src.name), created: new Date().toISOString() }; list.push(b); }
        for (const k of KEYS) if (k in src && k !== 'logo') { if (src[k] === '' || src[k] == null) delete b[k]; else b[k] = String(src[k]).slice(0, 300); }
        // M89: từ điển lời thoại "sai=đúng;…" của thương hiệu (chỉ thêm khoá; file cũ không có khoá này vẫn đọc được)
        if ('dict' in src) { const d = dictString(parseDict(String(src.dict ?? ''))).slice(0, LIMITS.arg); if (d) b.dict = d; else delete b.dict; }
        if (!b.title) b.title = b.name || 'Thương hiệu';
        b.updated = new Date().toISOString();
        return b;
      });
      return J(pub(b));
    }
    if (p === '/api/brands/style') {
      const id = String(body.id ?? '');
      if (id !== CHUNG && !load().some(x => x.id === id)) return J({ error: 'không thấy brand' }, 404);
      if (body.action === 'save') { const st = body.style && typeof body.style === 'object' && !Array.isArray(body.style) ? body.style : {}; upsertProfile({ ...st, id }); return J({ ok: true, styles: stylesOut() }); }
      if (body.action === 'reset') { resetLearned(id); return J({ ok: true, styles: stylesOut() }); }
      return J({ error: 'hành động lạ' }, 400);
    }
    if (p === '/api/brands/delete') {
      // Kho của thương hiệu là thư mục của người dùng: không xoá, chỉ bỏ thương hiệu khỏi brands.json
      const id = String(body.id ?? '');
      mutate(list => { const i = list.findIndex(x => x.id === id); if (i < 0) throw notFound(); list.splice(i, 1); });
      fs.rmSync(path.join(DIR, id), { recursive: true, force: true });
      try { deleteStyle(id); } catch (e) { console.error('style:', e.message); } // phong cách của thương hiệu (M133); lỗi không chặn việc xoá
      return J({ ok: true });
    }
    if (p === '/api/brands/duplicate') {
      // Một Kho thuộc đúng một thương hiệu (.kho.json): bản sao không mang `workspace`, dùng Kho mặc định theo tên mới
      const c = mutate(list => {
        const b = list.find(x => x.id === body.id); if (!b) throw notFound();
        const { workspace, ...rest } = b;
        const c = { ...rest, id: newId(b.title || b.name), title: (b.title || b.name) + ' (bản sao)', created: new Date().toISOString(), updated: new Date().toISOString() };
        if (b.logo && fs.existsSync(path.join(DIR, b.id, b.logo))) { fs.mkdirSync(path.join(DIR, c.id), { recursive: true }); fs.copyFileSync(path.join(DIR, b.id, b.logo), path.join(DIR, c.id, b.logo)); }
        list.push(c);
        return c;
      });
      return J(pub(c));
    }
    if (p === '/api/brands/apply') {
      // TL.brand fields for the open project; the logo is copied to <project>/media/brand_<id>.<ext>. The client sets TL.brand (undoable).
      if (!ctx.project) return J({ error: 'Chưa mở dự án' }, 400);
      const b = load().find(x => x.id === body.id);
      if (!b) return J({ error: 'không thấy brand' }, 404);
      return J({ brand: { ...brandFields(b, ctx.project.dir), kit: b.id }, pack: b.pack || null, title: b.title });
    }
  } catch (e) {
    if (!e.status) throw e;
    return J({ error: e.message }, e.status);
  }
  return false;
};
