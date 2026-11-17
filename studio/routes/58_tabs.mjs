// S18 M129: thanh tab "Dự án đang mở" (studio/features/58_tabs.js). Danh sách do server giữ (studio/tabs.mjs, ctx.tabs); trình
// duyệt chỉ gửi mã tab, không gửi đường dẫn. Chuyển tab = trình duyệt lưu dự án đang sửa rồi tải trang với ?p=<mã>.
//   GET  /api/tabs                 → {max, tabs: [{id, name, parent, exists, current, busy, set?: {key, name, n, cur}}]}; tab cùng bộ clip (cắt
//                                    từ một video dài) đứng liền nhau để trình duyệt vẽ thành một nhóm
//   POST /api/tabs/close {id}      → bỏ tab (job của tab đó đang chạy → 409); tab đang xem tự chuyển sang tab khác ở trình duyệt
//   POST /api/tabs/order {ids}     → lưu thứ tự kéo thả
import path from 'node:path';
import { MAX_TABS, tabId } from '../tabs.mjs';
import { clipSet } from './57_clipset.mjs';

export default ctx => async (req, res, p) => {
  if (p !== '/api/tabs' && !p.startsWith('/api/tabs/')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  const T = ctx.tabs;
  try {
    if (p === '/api/tabs' && req.method === 'GET') {
      const job = ctx.job, me = ctx.pid;
      const tabs = T.list().map(t => {
        let set = null; try { const cs = t.exists && clipSet(t.dir); if (cs) set = { key: tabId(cs.dir), name: cs.name, n: cs.n, cur: cs.cur }; } catch { /* highlights.json hỏng */ }
        return { id: t.id, name: t.name, parent: path.basename(path.dirname(t.dir)), exists: t.exists, current: t.id === me,
          busy: job?.state === 'running' && job.tab === t.id ? (job.step || job.kind) : null, ...(set ? { set } : {}) };
      });
      // gom tab cùng bộ về vị trí tab đầu tiên của bộ (giữ thứ tự còn lại)
      const order = [], seen = new Map();
      for (const t of tabs) { const k = t.set?.key; if (!k) { order.push([t]); continue; } if (!seen.has(k)) { const g = []; seen.set(k, g); order.push(g); } seen.get(k).push(t); }
      return J({ max: MAX_TABS, tabs: order.flat() });
    }
    if (req.method !== 'POST') return J({ error: 'not found' }, 404);
    const b = await ctx.body(req);
    if (p === '/api/tabs/close') {
      const id = String(b?.id || '');
      if (!T.list().some(t => t.id === id)) return J({ ok: false, error: 'Không có tab này' }, 400);
      if (ctx.job?.state === 'running' && ctx.job.tab === id) return J({ ok: false, error: 'Dự án này đang chạy tác vụ (' + (ctx.job.step || ctx.job.kind) + ') — đợi xong rồi đóng' }, 409);
      T.close(id);
      return J({ ok: true });
    }
    if (p === '/api/tabs/order') { T.reorder(b?.ids); return J({ ok: true }); }
    return J({ error: 'not found' }, 404);
  } catch (e) { return J({ ok: false, error: e.message }, e.status || 500); }
};
