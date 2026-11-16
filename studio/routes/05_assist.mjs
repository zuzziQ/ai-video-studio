// Lớp trợ lý LLM dùng chung (ROADMAP M91, M90; references/assist.md, logic ở scripts/assist.mjs).
//   GET  /api/assist           → [{name, label}]
//   POST /api/assist/<tên>     {…đầu vào của trợ lý} → {ok, run}. Trợ lý có ô job RIÊNG (không dùng ctx.startJob): chạy được
//                              khi đang xuất video; vẫn chỉ một trợ lý một lúc. 400 dữ liệu sai · 404 không có trợ lý ·
//                              409 đang có trợ lý khác chạy
//   POST /api/assist/cancel    → {ok, cancelled}: dừng trợ lý đang chạy (không đụng job xuất video; /api/job/cancel không dừng trợ lý)
//   GET  /api/assist/<tên>     → {state: idle|running|done|error|cancelled, run, step, progress, …kết quả: fields | suggestions,
//                              warnings, provider, ms | error, kind}. Kết quả chỉ là đề xuất: route không ghi gì xuống đĩa.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { killTree } from '../../scripts/platform.mjs';

export default ctx => {
  let mod = null, seq = 0, cur = null; // cur = lượt đang chạy { name, run, proc, cancelled }
  const LAST = new Map(); // tên → bản ghi lượt chạy gần nhất (trong bộ nhớ, mất khi tắt server)
  process.once('exit', () => { if (cur?.proc) killTree(cur.proc); }); // server tắt: không bỏ lại tiến trình claude
  // ctx.assistLib: test cắm thư viện giả vào đây
  const load = async () => (mod ??= ctx.assistLib || await import(pathToFileURL(path.join(ctx.SKILL, 'scripts/assist.mjs')).href));
  return async (req, res, p) => {
    if (p !== '/api/assist' && !p.startsWith('/api/assist/')) return false;
    const J = (o, c) => (ctx.json(res, o, c), true);
    const A = await load();
    if (p === '/api/assist') return req.method === 'GET' ? J(A.list()) : false;
    const name = p.slice('/api/assist/'.length);
    if (name === 'cancel') {
      if (req.method !== 'POST') return false;
      if (!cur) return J({ ok: true, cancelled: false });
      cur.cancelled = true; killTree(cur.proc);
      return J({ ok: true, cancelled: true });
    }
    if (!A.has(name)) return J({ error: 'Không có trợ lý “' + name.slice(0, 40) + '”' }, 404);
    if (req.method === 'GET') return J(LAST.get(name) || { state: 'idle' });
    if (req.method !== 'POST') return false;
    let input;
    try { input = A.check(name, await ctx.body(req)); }
    catch (e) { return J({ error: e.message }, e.status || 400); }
    if (cur) return J({ error: `Trợ lý AI “${A.list().find(x => x.name === cur.name)?.label || cur.name}” đang chạy. Đợi xong hoặc bấm Huỷ rồi thử lại.` }, 409);
    const rec = { state: 'running', run: ++seq, step: 'Bắt đầu', progress: 0, started: Date.now() };
    const me = cur = { name, run: rec.run, proc: null, cancelled: false };
    LAST.set(name, rec);
    A.runAssist(name, input, {
      py: ctx.PY,
      onProgress: (k, s) => { if (rec.state === 'running') { rec.progress = k; rec.step = s; } },
      onProc: pr => { me.proc = pr; if (me.cancelled) killTree(pr); },
      cancelled: () => me.cancelled,
    }).then(out => { Object.assign(rec, me.cancelled ? { state: 'cancelled', error: 'Đã huỷ theo yêu cầu', kind: 'cancel' } : { ...out, state: 'done', step: 'Xong', progress: 1 }); },
      e => { Object.assign(rec, me.cancelled ? { state: 'cancelled', error: 'Đã huỷ theo yêu cầu', kind: 'cancel' } : { state: 'error', error: e.message, kind: e.kind || 'error' }); })
      .finally(() => { rec.ended = Date.now(); if (cur === me) cur = null; });
    return J({ ok: true, run: rec.run });
  };
};
