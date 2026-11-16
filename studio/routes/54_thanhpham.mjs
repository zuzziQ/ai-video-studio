// Thành phẩm của Kho (S12 M100, docs/plans/S12-kho-du-an.md): nơi Xuất / hàng loạt / biến thể giao bản xong.
//   GET  /api/thanhpham          → { root: <Kho>/Thanh pham, month: thư mục tháng này, title, brand, found, items: video mới nhất }
//   POST /api/thanhpham/open {path?} → path trong Thanh pham/ của Kho dự án: hiện file trong Explorer/Finder;
//                                     không có path: mở thư mục tháng này (chưa có thì Thanh pham/, chưa có nữa thì gốc Kho).
// Như mọi /api/*, cần token phiên + cùng origin (studio/security.mjs). Không mở gì ngoài Kho của dự án đang mở.
import fs from 'node:fs';
import path from 'node:path';
import { openPath, revealPath } from '../../scripts/platform.mjs';
import { sub, workspaceOfProject } from '../../scripts/workspace.mjs';
import { inDelivered, listDelivered } from '../../scripts/kho_deliver.mjs';

const month = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export default ctx => async (req, res, p) => {
  if (p !== '/api/thanhpham' && !p.startsWith('/api/thanhpham/')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  if (!ctx.project) return J({ error: 'Chưa mở dự án' }, 400);
  const ws = workspaceOfProject(ctx.project.dir, ctx.readProject().timeline);
  const root = sub(ws, 'delivered'), cur = path.join(root, month());
  if (p === '/api/thanhpham' && req.method === 'GET')
    return J({ root, month: cur, title: ws.title, brand: ws.brand, found: ws.found, items: listDelivered(ws, { max: 20 }).map(v => ({ rel: v.rel, name: v.name, size: v.size, mtime: v.mtime })) });
  if (p === '/api/thanhpham/open' && req.method === 'POST') {
    const b = await ctx.body(req);
    if (b.path != null) {
      if (typeof b.path !== 'string' || !path.isAbsolute(b.path) || !inDelivered(ws, b.path) || !fs.existsSync(b.path)) return J({ ok: false, error: 'Không thấy file trong Thành phẩm' }, 404);
      revealPath(b.path); return J({ ok: true });
    }
    const dir = [cur, root, ws.root].find(d => fs.existsSync(d));
    if (!dir) return J({ ok: false, error: 'Kho chưa có thành phẩm nào' }, 404);
    openPath(dir); return J({ ok: true, dir });
  }
  return false;
};
