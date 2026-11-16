// Bộ chọn video dùng chung của bước Nguồn (S12 M98): Video mới, Video dài đọc video trong Kho của thương hiệu và tải video
// từ máy vào <Kho>/Nguon/ (không còn vào ~/.ai-video-studio/uploads/). Kho tính qua scripts/workspace.mjs.
//   GET  /api/pick/sources?brand=&q=           → { kho: {root, brand, title, exists}, items: [{rel, path, name, dir, size, mtime}] }
//                                                video trong Kho, Nguon/ trước rồi mới tới thư mục khác, trong mỗi nhóm mới nhất trước
//   POST /api/pick/upload?name=clip.mp4&brand= (raw body) → { path, rel, size } — chép vào <Kho>/Nguon/, tên trùng thì "clip (2).mp4"
import fs from 'node:fs';
import path from 'node:path';
import { workspaceFor, ensureWorkspace, listWorkspace, sub, saveUpload, relTo, KHO_DIRS, KINDS } from '../../scripts/workspace.mjs';

const BRAND = /^[a-z0-9][a-z0-9-]{0,39}$/;
// brand rỗng = Kho Chung; id sai định dạng → 400 (không đoán)
export const brandParam = v => { const b = String(v || '').trim(); if (b && !BRAND.test(b)) throw Object.assign(new Error('Mã thương hiệu không hợp lệ'), { status: 400 }); return b; };
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Video trong Kho cho bộ chọn: Nguon/ (kể cả thư mục con) trước, mới nhất trước, bỏ Nguon/Tha vao day/; q lọc theo tên/đường dẫn (không dấu). */
export function sourceList(ws, { q = '', max = 300 } = {}) {
  const src = KHO_DIRS.source.toLowerCase(), f = fold(q).trim(), inbox = KHO_DIRS.inbox.toLowerCase() + '/';
  return listWorkspace(ws, { kind: 'video' })
    .filter(x => !x.rel.toLowerCase().startsWith(inbox)) // thư mục canh của Tự lái: file sắp được nhận và chuyển đi
    .filter(x => !f || fold(x.rel).includes(f))
    .sort((a, b) => (b.dir.toLowerCase() === src) - (a.dir.toLowerCase() === src) || b.mtime - a.mtime)
    .slice(0, max)
    .map(x => ({ rel: x.rel, path: path.join(ws.root, ...x.rel.split('/')), name: x.name, dir: x.dir, size: x.size, mtime: x.mtime }));
}

/** Nhận một video tải lên vào thư mục `kind` của Kho (mặc định Nguon/). Tên không phải video → lỗi 400. */
export async function uploadVideo(req, brand, name, kind = 'source') {
  const n = path.basename(String(name || 'video.mp4'));
  if (!KINDS.video.test(n)) throw Object.assign(new Error('Chỉ nhận file video (mp4, mov, m4v, mkv, webm…)'), { status: 400 });
  const ws = ensureWorkspace(workspaceFor(brand));
  const f = await saveUpload(req, sub(ws, kind, { mkdir: true }), n);
  return { ws, path: f, rel: relTo(ws, f), size: fs.statSync(f).size };
}

export default ctx => async (req, res, p, u) => {
  if (p !== '/api/pick/upload' && p !== '/api/pick/sources') return false;
  try {
    const brand = brandParam(u.searchParams.get('brand'));
    if (p === '/api/pick/sources') {
      const ws = workspaceFor(brand);
      ctx.json(res, { kho: { root: ws.root, brand: ws.brand, title: ws.title, exists: fs.existsSync(ws.root), warning: ws.warning }, items: sourceList(ws, { q: u.searchParams.get('q') || '' }) });
      return true;
    }
    if (req.method !== 'POST') return false;
    const r = await uploadVideo(req, brand, u.searchParams.get('name'));
    ctx.json(res, { path: r.path, rel: r.rel, size: r.size });
  } catch (e) { ctx.json(res, { error: e.message }, e.status || 500); }
  return true;
};
