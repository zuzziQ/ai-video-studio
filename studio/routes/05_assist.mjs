// Lớp trợ lý LLM dùng chung (ROADMAP M91, references/assist.md, logic ở scripts/assist.mjs).
//   GET  /api/assist           → [{name, label}]
//   POST /api/assist/<tên>     {…đầu vào của trợ lý} → {ok, run}: khởi job 'assist' bằng ctx.startJob (một job một lúc như
//                              xuất video; huỷ bằng POST /api/job/cancel). 400 dữ liệu sai · 404 không có trợ lý · 409 đang có tác vụ khác
//   GET  /api/assist/<tên>     → {state: idle|running|done|error|cancelled, run, step, progress, …kết quả: fields, warnings,
//                              provider, ms | error, kind}. Kết quả chỉ là đề xuất: route không ghi gì xuống đĩa.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ctx => {
  let mod = null, seq = 0;
  const LAST = new Map(); // tên → bản ghi lượt chạy gần nhất (trong bộ nhớ, mất khi tắt server)
  // ctx.assistLib: test cắm thư viện giả vào đây
  const load = async () => (mod ??= ctx.assistLib || await import(pathToFileURL(path.join(ctx.SKILL, 'scripts/assist.mjs')).href));
  return async (req, res, p) => {
    if (p !== '/api/assist' && !p.startsWith('/api/assist/')) return false;
    const J = (o, c) => (ctx.json(res, o, c), true);
    const A = await load();
    if (p === '/api/assist') return req.method === 'GET' ? J(A.list()) : false;
    const name = p.slice('/api/assist/'.length);
    if (!A.has(name)) return J({ error: 'Không có trợ lý “' + name.slice(0, 40) + '”' }, 404);
    if (req.method === 'GET') return J(LAST.get(name) || { state: 'idle' });
    if (req.method !== 'POST') return false;
    let input;
    try { input = A.check(name, await ctx.body(req)); }
    catch (e) { return J({ error: e.message }, e.status || 400); }
    const rec = { state: 'running', run: ++seq, step: 'Bắt đầu', progress: 0, started: Date.now() };
    const ok = ctx.startJob('assist', async () => {
      const job = ctx.job; // startJob gọi hàm này ngay sau khi đặt job mới
      job.assist = name; job.run = rec.run;
      try {
        const out = await A.runAssist(name, input, {
          py: ctx.PY,
          onProgress: (k, s) => { job.progress = rec.progress = k; job.step = rec.step = s; },
          onProc: pr => { job.proc = pr; },
        });
        Object.assign(rec, out, { state: 'done', step: 'Xong', progress: 1 });
      } catch (e) {
        Object.assign(rec, job.cancelled ? { state: 'cancelled', error: 'Đã huỷ theo yêu cầu', kind: 'cancel' } : { state: 'error', error: e.message, kind: e.kind || 'error' });
        throw e;
      }
    });
    if (!ok) return J({ error: 'Đang có tác vụ khác chạy (xuất video, AI…). Đợi xong rồi thử lại.' }, 409);
    LAST.set(name, rec);
    return J({ ok: true, run: rec.run });
  };
};
