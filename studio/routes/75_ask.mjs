// S22 M153: thanh Hỏi Claude — định tuyến câu hỏi tự do vào một việc của phạm vi (lõi scripts/ask_route.mjs + 75_ask.core.js,
// giao diện studio/features/75_ask.js). Chỉ chạy khi người dùng gửi (C23); mô hình theo Mô hình & giọng (Claude hoặc Ollama).
//   POST /api/ask         {ask, step, sel?, range?, info?} → {ok, run} · 400 dữ liệu sai · 409 đang có một lượt khác
//   GET  /api/ask         → {state: idle|running|done|error|cancelled, run, step, …kết quả: action, params, reply, warnings, scope,
//                            provider, ms | error, kind (theo LlmError)}
//   POST /api/ask/cancel  → {ok, cancelled}
// Route không ghi gì xuống đĩa và không sửa timeline: chỉ trả việc đã chọn; giao diện chạy việc bằng hàm sẵn có rồi đưa qua
// Studio.review (Nhận = một bước ⌘Z). Ô job riêng (không dùng ctx.startJob): hỏi được khi đang xuất.
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { killTree } from '../../scripts/platform.mjs';

export default ctx => {
  let R = null, L = null, A = null, seq = 0, cur = null;
  const LAST = { rec: null };
  process.once('exit', () => { if (cur?.proc) killTree(cur.proc); });
  const imp = rel => import(pathToFileURL(path.join(ctx.SKILL || path.resolve(import.meta.dirname, '../..'), rel)).href);
  const load = async () => { R ??= await imp('scripts/ask_route.mjs'); L ??= await imp('scripts/llm.mjs'); A ??= await imp('scripts/assist.mjs'); };
  const timeout = () => (+process.env.AVS_ASSIST_TIMEOUT_S > 0 ? +process.env.AVS_ASSIST_TIMEOUT_S : 120) * 1000;

  async function ask(input, me, rec) {
    const prompt = A.assertCleanPrompt(R.routerPrompt(input));
    let provider = 'claude';
    const t0 = Date.now(), ms = timeout();
    const out = await L.askJSON(prompt, {
      shape: 'object', retries: 1, model: 'sonnet', task: 'text', cwd: os.tmpdir(), timeout: ms, timeoutMsg: `AI quá ${Math.round(ms / 1000)} giây chưa trả lời. Thử lại sau.`,
      onProc: pr => { me.proc = pr; if (me.cancelled) killTree(pr); },
      onTick: s => { if (rec.state === 'running') rec.step = `Claude đang đọc câu hỏi… ${Math.round(s)} s`; },
      onAttempt: n => { if (n) rec.step = 'AI trả kết quả lỗi, đang hỏi lại…'; },
      run: async (p, o) => { const r = await (ctx.askRun || L.runLLM)(p, o); provider = r?.provider || 'claude'; return r; },
      validate: v => R.normPick(v, input),
    });
    return { ...out, scope: input.scope, provider, ms: Date.now() - t0 };
  }

  return async (req, res, p) => {
    if (p !== '/api/ask' && p !== '/api/ask/cancel') return false;
    const J = (o, c) => (ctx.json(res, o, c), true);
    await load();
    if (p === '/api/ask/cancel') {
      if (req.method !== 'POST') return false;
      if (!cur) return J({ ok: true, cancelled: false });
      cur.cancelled = true; if (cur.proc) killTree(cur.proc);
      return J({ ok: true, cancelled: true });
    }
    if (req.method === 'GET') return J(LAST.rec || { state: 'idle' });
    if (req.method !== 'POST') return false;
    let input;
    try { input = R.checkInput(await ctx.body(req)); } catch (e) { return J({ error: e.message }, e.status || 400); }
    if (cur) return J({ error: 'Claude đang trả lời câu trước. Đợi xong hoặc bấm Huỷ rồi thử lại.' }, 409);
    const rec = { state: 'running', run: ++seq, step: 'Bắt đầu', started: Date.now() };
    const me = cur = { run: rec.run, proc: null, cancelled: false };
    LAST.rec = rec;
    const stop = () => ({ state: 'cancelled', error: 'Đã huỷ theo yêu cầu', kind: 'cancel' });
    ask(input, me, rec)
      .then(out => Object.assign(rec, me.cancelled ? stop() : { ...out, state: 'done', step: 'Xong' }),
        e => Object.assign(rec, me.cancelled ? stop() : { state: 'error', error: e.message, kind: e.kind || 'error' }))
      .finally(() => { rec.ended = Date.now(); if (cur === me) cur = null; });
    return J({ ok: true, run: rec.run });
  };
};
