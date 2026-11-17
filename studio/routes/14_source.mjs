// Video nguồn của dự án đang mở (S13 M107, docs/plans/S13-luong-gon-qc-som.md mục 1.2): thẻ "Video nguồn" ở bước Nguồn.
//   GET  /api/source         → { name, rel, inKho, exists, size, kho: { brand, title, root, found }, inbox: <Kho>/Nguon/Tha vao day }
//                              Đọc source.json (S12 mục 2.2, scripts/workspace.mjs writeSource); dự án cũ không có thì name = null.
//   POST /api/source/reveal  → hiện video gốc trong Explorer/Finder (chỉ khi file nằm trong Kho của dự án và còn tồn tại).
// Như mọi /api/*, cần token phiên + cùng origin (studio/security.mjs). Không trả đường dẫn tuyệt đối ngoài Kho.
import fs from 'node:fs';
import path from 'node:path';
import { revealPath } from '../../scripts/platform.mjs';
import { inWorkspace, readSource, sub, workspaceOfProject } from '../../scripts/workspace.mjs';

export default ctx => async (req, res, p) => {
  if (p !== '/api/source' && !p.startsWith('/api/source/')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  if (!ctx.project) return J({ error: 'Chưa mở dự án' }, 400);
  const ws = workspaceOfProject(ctx.project.dir, ctx.readProject().timeline);
  const src = readSource(ctx.project.dir);
  // video trong Kho: source.json ghi đường dẫn tương đối; ngoài Kho chỉ ghi abs (không trả ra client, chỉ báo có hay không)
  const file = src?.video ? path.resolve(ws.root, ...String(src.video).split('/')) : typeof src?.abs === 'string' ? src.abs : null;
  const inKho = !!(src?.video && file && inWorkspace(ws, file));
  const exists = !!(file && fs.existsSync(file));
  if (p === '/api/source' && req.method === 'GET')
    return J({
      name: src?.name || null, rel: inKho ? src.video : null, inKho, exists, size: src?.size || null,
      kho: { brand: ws.brand, title: ws.title, root: ws.root, found: ws.found }, inbox: sub(ws, 'inbox'),
    });
  if (p === '/api/source/reveal' && req.method === 'POST') {
    if (!inKho || !exists) return J({ ok: false, error: 'Video gốc không còn trong Kho' }, 404);
    revealPath(file); return J({ ok: true });
  }
  return false;
};
