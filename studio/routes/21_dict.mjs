// Từ điển sửa lời thoại "sai=đúng" (ROADMAP M89, scripts/dict.mjs). Panel Lời thoại (features/21_transcript.js) xem/sửa.
//   GET  /api/dict[?kit=<id>]  → {project:[{from,to}], brand:[…], auto:[…], kit:{id,title}|null}
//                               (kit mặc định = TL.brand.kit đã lưu; editor gửi kit đang chọn khi chưa lưu)
//   POST /api/dict {entries}   → ghi <dự án>/.studio/dict.json (kiểm kiểu, ghi nguyên tử, chỉ trong thư mục dự án)
// Từ điển của thương hiệu ghi qua POST /api/brands/save {brand:{id, dict:"sai=đúng;…"}} (51_brands).
import { dictSources, saveProjectDict, LIMITS } from '../../scripts/dict.mjs';

const KIT_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export default ctx => async (req, res, p, u) => {
  if (p !== '/api/dict') return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  if (!ctx.project) return J({ error: 'Chưa mở dự án' }, 400);
  const dir = ctx.project.dir;
  if (req.method === 'GET') {
    const kit = u.searchParams.get('kit');
    let timeline = null;
    try { timeline = ctx.readProject().timeline; } catch { /* dự án hỏng: vẫn trả từ điển dự án */ }
    const s = dictSources({ dir, timeline, kit: kit && KIT_RE.test(kit) ? kit : undefined });
    return J(s);
  }
  if (req.method !== 'POST') return false;
  const body = await ctx.body(req);
  const list = body?.entries;
  if (!Array.isArray(list) || list.length > LIMITS.entries) return J({ error: `Cần danh sách tối đa ${LIMITS.entries} cặp “sai = đúng”` }, 400);
  if (!list.every(e => e && typeof e === 'object' && typeof e.from === 'string' && typeof e.to === 'string')) return J({ error: 'Mỗi cặp cần hai chữ “sai” và “đúng”' }, 400);
  return J({ project: saveProjectDict(dir, list) });
};
