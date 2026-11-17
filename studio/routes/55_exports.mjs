// Lịch sử xuất của dự án (S14 M112, docs/plans/S14-xuat-cot-phai-diem.md; dữ liệu và hàm đọc: scripts/exports_log.mjs).
//   GET  /api/exports               → { os: 'win'|'mac'|'linux', items: bản xuất mới → cũ (exportsView), edited: mtime timeline.json (M113) }
//                                     Job xuất vừa xong mà chưa ghi (tab bị đóng, trang bị thay) thì ghi luôn ở đây.
//                                     Dự án chưa có exports.json: nhặt video cũ trong out/ (legacy).
//   POST /api/exports/record {quality?, from?, to?} → ghi job xuất vừa xong (giao diện gọi khi pollJob báo done) → { ok, item }
//   POST /api/exports/reveal {id, i?}  → hiện file trong Explorer/Finder; file đã bị xoá thì mở thư mục out/ → { ok, missing }
//   POST /api/exports/deliver {id}     → giao lại các file còn trên đĩa vào Thành phẩm (kho_deliver, có ghi sổ) → { ok, item }
//   POST /api/exports/copy {id, i?}    → chép đường dẫn tuyệt đối vào clipboard của máy (khi trình duyệt không cho) → { ok }
// Như mọi /api/*, cần token phiên + cùng origin. Chỉ nhận id (không nhận đường dẫn từ client); đường dẫn trong exports.json
// được kiểm lại: file phải nằm trong dự án, bản giao phải nằm trong Thanh pham/ của Kho dự án.
import fs from 'node:fs';
import path from 'node:path';
import { copyText, openPath, revealPath } from '../../scripts/platform.mjs';
import { workspaceOfProject } from '../../scripts/workspace.mjs';
import { deliverExportsAsync, inDelivered } from '../../scripts/kho_deliver.mjs';
import { exportsView, hasLog, inProject, itemFromJob, readExports, recordExport, seedFromOut, updateExport } from '../../scripts/exports_log.mjs';

const OS = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';

export default ctx => {
  // job xuất đang được ghi, theo <dự án>|job.started: GET và POST record tới cùng lúc chỉ ghi một lần
  const pending = new Map();
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  async function recordJob(dir, o = {}) {
    const j = ctx.job;
    if (!j || j.kind !== 'export' || j.state !== 'done' || !j.out) return null;
    const id = String(j.started), key = dir + '|' + id;
    if (!pending.has(key)) pending.set(key, (async () => {
      const had = readExports(dir).find(x => x.id === id); if (had) return had;
      if (!hasLog(dir)) await seedFromOut(dir); // bản cũ trong out/ vào trước; recordExport bỏ file trùng khỏi bản cũ
      const it = await itemFromJob(dir, j, o);
      return it ? recordExport(dir, it) : null;
    })().catch(e => (console.error('exports:', e.message), null)));
    const had = await pending.get(key); if (!had) return null;
    // GET ghi trước (đoán chất lượng theo cạnh ngắn, không biết đoạn): bổ sung những gì giao diện gửi
    const fix = {};
    if (['720', '1080', '4k'].includes(String(o.quality)) && had.quality !== String(o.quality)) fix.quality = String(o.quality);
    if (!had.range && (num(o.from) != null || num(o.to) != null)) fix.range = { from: num(o.from), to: num(o.to) };
    return Object.keys(fix).length ? updateExport(dir, id, fix) || had : readExports(dir).find(x => x.id === id) || had;
  }
  const pick = (items, b) => {
    const x = typeof b.id === 'string' ? items.find(y => y.id === b.id) : null;
    const i = Number.isInteger(b.i) && b.i >= 0 ? b.i : 0;
    return x && x.files[i] ? { x, f: x.files[i] } : null;
  };

  return async (req, res, p) => {
    if (p !== '/api/exports' && !p.startsWith('/api/exports/')) return false;
    const J = (o, c) => (ctx.json(res, o, c), true);
    if (!ctx.project) return J({ error: 'Chưa mở dự án' }, 400);
    const dir = ctx.project.dir;
    const ws = () => workspaceOfProject(dir, ctx.readProject().timeline);
    const view = () => { const w = ws(); return exportsView(dir, { keep: f => inDelivered(w, f) }); };

    if (p === '/api/exports' && req.method === 'GET') {
      await recordJob(dir).catch(e => console.error('exports:', e.message));
      if (!hasLog(dir)) await seedFromOut(dir).catch(e => console.error('exports seed:', e.message));
      // M113: lần lưu cuối của timeline, cột phải so với bản xuất gần nhất ("đã sửa sau lần xuất này")
      let edited = null; try { edited = fs.statSync(path.join(dir, 'timeline.json')).mtime.toISOString(); } catch { /* dự án chưa lưu */ }
      return J({ os: OS, items: view(), edited });
    }
    if (req.method !== 'POST') return false;
    const b = await ctx.body(req);
    if (p === '/api/exports/record') {
      // S18 M129: job xuất của tab khác (pollJob của trang này nhận nhầm) không được ghi vào dự án của tab này
      if (ctx.job?.tab && ctx.pid && ctx.job.tab !== ctx.pid) return J({ ok: false, error: 'Bản xuất vừa xong thuộc dự án ở tab khác' }, 409);
      const it = await recordJob(dir, { quality: b.quality, from: b.from, to: b.to });
      if (!it) return J({ ok: false, error: 'Không có bản xuất vừa xong để ghi' }, 404);
      return J({ ok: true, item: view().find(x => x.id === it.id) || null });
    }
    if (p === '/api/exports/reveal') {
      const hit = pick(view(), b); if (!hit) return J({ ok: false, error: 'Không thấy bản xuất' }, 404);
      if (hit.f.exists) { revealPath(hit.f.abs); return J({ ok: true, missing: false }); }
      const out = inProject(dir, 'out');
      if (out && fs.existsSync(out)) openPath(out);
      return J({ ok: true, missing: true });
    }
    if (p === '/api/exports/copy') {
      const hit = pick(view(), b); if (!hit) return J({ ok: false, error: 'Không thấy bản xuất' }, 404);
      return J({ ok: await copyText(hit.f.abs) });
    }
    if (p === '/api/exports/deliver') {
      if (ctx.job?.state === 'running') return J({ ok: false, error: 'Đang có tác vụ khác chạy' }, 409);
      const x = view().find(y => y.id === b.id); if (!x) return J({ ok: false, error: 'Không thấy bản xuất' }, 404);
      const live = x.files.filter(f => f.exists);
      if (!live.length) return J({ ok: false, error: 'File đã bị xoá khỏi thư mục out/' }, 404);
      const into = {};
      try {
        // M100 / devmem ai-video-studio-034: giao qua kho_deliver (deliverExportsAsync → deliverProjectAsync, ghi sổ delivered.json)
        const r = await deliverExportsAsync(dir, live.map((f, i) => ({ src: f.abs, ...(i || !f.w ? { aspect: f.aspect } : { w: f.w, h: f.h }) })), { tl: ctx.readProject().timeline, range: x.range || undefined });
        into.delivered = r.items.filter(y => y.dst).map(y => y.dst);
        into.deliverError = r.items.find(y => y.error)?.error || null;
      } catch (e) { into.deliverError = e.message; }
      updateExport(dir, x.id, { delivered: [...new Set([...x.delivered, ...(into.delivered || [])])], deliverError: into.deliverError });
      const item = view().find(y => y.id === x.id);
      return J({ ok: !into.deliverError, error: into.deliverError || undefined, item });
    }
    return false;
  };
};
