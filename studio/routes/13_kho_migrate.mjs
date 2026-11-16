// Dọn file cũ vào Kho (S12 M101): liệt kê video nguồn còn nằm ở chỗ cũ, người dùng tích rồi mới chuyển; dự án cũ chỉ ghi vào Kho.
//   GET  /api/kho-migrate?brand=                       → { files:[{id,name,dir,size,mtime,from,dest,checked,busy?,note?}], more,
//                                                          projects:[{id,name,from,linked}], linked:[{id,name,from}] }
//   POST /api/kho-migrate {brand, files:[id], projects:[id]} → { started: true }; chạy như job (chép khác ổ có thể lâu),
//                                                          kết quả ở /api/job → out: { moved, failed, linked, skipped, warn }
//   POST /api/kho-migrate/open {brand, id}              → mở dự án cũ đã ghi vào Kho (đường dẫn lấy từ .kho.json, chỉ trong $AVS_HOME)
// Tiền tố riêng (không phải /api/kho/...): 12_workspace đọc thân request của mọi POST /api/kho/*. Giao diện nằm trong panel Kho
// (studio/features/12_workspace.js), nên route này không có file feature 13_* đi kèm.
// Đường dẫn không bao giờ nhận từ trình duyệt: chỉ id của một lượt liệt kê mới (scripts/kho_migrate.mjs).
import fs from 'node:fs';
import path from 'node:path';
import * as W from '../../scripts/workspace.mjs';
import * as M from '../../scripts/kho_migrate.mjs';
import { brandOf } from './12_workspace.mjs';

const fail = (msg, status) => Object.assign(new Error(msg), { status });
const HEX = /^[0-9a-f]{16}$/;
const ids = v => (Array.isArray(v) ? v.slice(0, 5000).filter(x => typeof x === 'string' && HEX.test(x)) : []);

export default ctx => async (req, res, p, u) => {
  if (p !== '/api/kho-migrate' && !p.startsWith('/api/kho-migrate/')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  try {
    if (req.method === 'GET' && p === '/api/kho-migrate') {
      const ws = W.workspaceFor(brandOf(u.searchParams.get('brand')));
      if (!ws.exists) return J({ files: [], more: 0, projects: [], linked: [], noKho: true });
      const plan = M.planMigration(ws);
      return J({
        files: plan.files.map(({ src, to, ...f }) => ({ ...f, dir: path.basename(path.dirname(src)) })), more: plan.more,
        projects: plan.projects.map(({ dir, ...x }) => x), linked: M.linkedProjects(ws).map(({ dir, ...x }) => x),
      });
    }
    if (req.method !== 'POST') return false;
    const b = await ctx.body(req);
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw fail('Dữ liệu gửi lên không hợp lệ', 400);
    const ws = W.workspaceFor(brandOf(b.brand));
    if (!ws.exists) throw fail('Kho chưa được tạo: tạo Kho hoặc chọn thư mục trước', 409);
    if (p === '/api/kho-migrate') {
      const pick = { files: ids(b.files), projects: ids(b.projects) };
      if (!pick.files.length && !pick.projects.length) throw fail('Chưa chọn mục nào', 400);
      const ok = ctx.startJob('kho-migrate', async () => {
        ctx.job.out = await M.applyMigration(ws, pick, { onProgress: (i, n, name) => {
          ctx.job.progress = n ? i / n : 1; ctx.job.step = name ? `Chuyển ${i + 1}/${n}: ${name}` : 'Xong';
        } });
      });
      if (!ok) throw fail('Đang có việc khác chạy (xuất, kiểm tra…): chờ xong rồi chuyển', 409);
      return J({ started: true });
    }
    if (p === '/api/kho-migrate/open') {
      const r = typeof b.id === 'string' && HEX.test(b.id) ? M.linkedProjects(ws).find(x => x.id === b.id) : null;
      if (!r) throw fail('Không thấy dự án này', 404);
      ctx.openProject(r.dir);
      return J({ ok: true });
    }
    return false;
  } catch (e) {
    return J({ error: e.message }, e.status || 500);
  }
};
