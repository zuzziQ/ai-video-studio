// Bước 3 Dựng: tab Kho của panel Media (S12 · M99, docs/plans/S12-kho-du-an.md). Logic ở scripts/kho_media.mjs.
//   GET  /api/kho/media?group=image|broll|music|source&q=  → { kho:{title, brand, root, exists, found, warning}, items:[{rel, name, kind, group, size, mtime, used}] }
//                                                            Kho của dự án đang mở (workspaceOfProject); used = media/kho_* đã có trong dự án
//   GET  /api/kho/file?rel=                                → ảnh / âm thanh trong Kho để xem trước (chỉ đọc)
//   POST /api/kho/use {rel}                                → liên kết vào media/kho_<tên> (+ khung + audio.m4a nếu là video),
//                                                            trả mục như /api/media để client chèn ngay; rel thoát Kho → 400
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { shortErr } from '../../scripts/err_text.mjs';

export default ctx => {
  let KM = null;
  const km = async () => (KM ||= await import(pathToFileURL(path.join(ctx.SKILL, 'scripts/kho_media.mjs')).href));
  const tl = () => { try { return JSON.parse(fs.readFileSync(ctx.project.tlFile, 'utf8')); } catch { return null; } };
  return async (req, res, p, u) => {
    if (!['/api/kho/media', '/api/kho/file', '/api/kho/use'].includes(p)) return false; // /api/kho/* khác là của 12_workspace (M97)
    if (!ctx.project) return ctx.json(res, { error: 'Chưa mở dự án' }, 400), true;
    const K = await km();
    try {
      const ws = K.khoOf(ctx.project.dir, tl());
      if (p === '/api/kho/media' && req.method === 'GET') {
        const group = String(u.searchParams.get('group') || u.searchParams.get('kind') || '');
        if (group && !Object.hasOwn(K.GROUPS, group)) return ctx.json(res, { error: 'Nhóm lạ' }, 400), true;
        const items = fs.existsSync(ws.root) ? K.khoItems(ctx.project.dir, ws, { group, q: String(u.searchParams.get('q') || '').slice(0, 100) }) : [];
        const { title, brand, root, exists, found, warning } = ws;
        return ctx.json(res, { kho: { title, brand, root, exists: fs.existsSync(root) && exists, found, warning }, items }), true;
      }
      if (p === '/api/kho/file' && req.method === 'GET') {
        const f = K.resolveRel(ws, String(u.searchParams.get('rel') || ''));
        if (!/\.(jpe?g|png|webp|gif|mp3|wav|m4a|aac|flac|ogg)$/i.test(f)) return ctx.json(res, { error: 'Chỉ xem trước ảnh hoặc âm thanh' }, 400), true;
        return ctx.sendFile(req, res, f), true;
      }
      if (p === '/api/kho/use' && req.method === 'POST') {
        const b = await ctx.body(req);
        return ctx.json(res, await K.useFromKho(ctx.project.dir, ws, b?.rel)), true;
      }
    } catch (e) {
      if (!e.status || e.status >= 500) console.error('kho:', e.message);
      return ctx.json(res, { error: shortErr(e.message, 'Lỗi Kho') }, e.status || 500), true;
    }
    return false;
  };
};
