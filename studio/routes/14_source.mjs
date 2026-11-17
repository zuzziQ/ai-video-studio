// Video nguồn của dự án đang mở (S13 M107, docs/plans/S13-luong-gon-qc-som.md mục 1.2): thẻ "Video nguồn" ở bước Nguồn.
//   GET  /api/source         → { name, rel, inKho, exists, size, kho: { brand, title, root, found }, inbox: <Kho>/Nguon/Tha vao day }
//                              Đọc source.json (S12 mục 2.2, scripts/workspace.mjs writeSource); dự án cũ không có thì name = null.
//   POST /api/source/reveal  → hiện video gốc trong Explorer/Finder (chỉ khi file nằm trong Kho của dự án và còn tồn tại).
//   GET trả thêm burnin: kết quả dò phụ đề cháy sẵn đã lưu (.studio/burnin.json, S13 M110) + design (px thiết kế), null khi chưa dò;
//   canScan: có video để dò (video gốc hoặc a-roll trong dự án).
//   POST /api/source/burnin  → dò phụ đề cháy sẵn (scripts/burnin.mjs, ffmpeg ~12 khung, vài giây), lưu, trả { burnin }.
// Như mọi /api/*, cần token phiên + cùng origin (studio/security.mjs). Không trả đường dẫn tuyệt đối ngoài Kho.
import fs from 'node:fs';
import path from 'node:path';
import { revealPath } from '../../scripts/platform.mjs';
import { inWorkspace, readSource, sub, workspaceOfProject } from '../../scripts/workspace.mjs';
import { readBurn, scanVideo, toDesign, videoOfProject, writeBurn } from '../../scripts/burnin.mjs';

let scanning = null; // một lượt dò mỗi lúc (dự án đang mở)

export default ctx => async (req, res, p) => {
  if (p !== '/api/source' && !p.startsWith('/api/source/')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  if (!ctx.project) return J({ error: 'Chưa mở dự án' }, 400);
  const tl = ctx.readProject().timeline || {};
  const ws = workspaceOfProject(ctx.project.dir, tl);
  const src = readSource(ctx.project.dir);
  // video trong Kho: source.json ghi đường dẫn tương đối; ngoài Kho chỉ ghi abs (không trả ra client, chỉ báo có hay không)
  const file = src?.video ? path.resolve(ws.root, ...String(src.video).split('/')) : typeof src?.abs === 'string' ? src.abs : null;
  const inKho = !!(src?.video && file && inWorkspace(ws, file));
  const exists = !!(file && fs.existsSync(file));
  const burn = b => (b ? { ...b, design: toDesign(b, tl) } : null);
  if (p === '/api/source' && req.method === 'GET')
    return J({
      name: src?.name || null, rel: inKho ? src.video : null, inKho, exists, size: src?.size || null,
      kho: { brand: ws.brand, title: ws.title, root: ws.root, found: ws.found }, inbox: sub(ws, 'inbox'),
      burnin: burn(readBurn(ctx.project.dir)), canScan: !!videoOfProject(ctx.project.dir, tl, exists ? file : null),
    });
  if (p === '/api/source/reveal' && req.method === 'POST') {
    if (!inKho || !exists) return J({ ok: false, error: 'Video gốc không còn trong Kho' }, 404);
    revealPath(file); return J({ ok: true });
  }
  if (p === '/api/source/burnin' && req.method === 'POST') {
    const dir = ctx.project.dir, video = videoOfProject(dir, tl, exists ? file : null);
    if (!video) return J({ error: 'Không thấy video để dò' }, 404);
    try {
      if (!scanning || scanning.dir !== dir) scanning = { dir, p: scanVideo(video).finally(() => { scanning = null; }) };
      const b = await scanning.p;
      return J({ burnin: burn(writeBurn(dir, b)) });
    } catch (e) { return J({ error: `Không dò được: ${String(e.message || e).slice(0, 200)}` }, 500); }
  }
  return false;
};
