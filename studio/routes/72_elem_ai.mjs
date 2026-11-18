// S21 M149: Hỏi Claude sửa element + 3 biến thể (lõi scripts/elem_ai.mjs, giao diện studio/features/72_elem_ai.js,
// references/assist.md mục "Sửa element"). Chỉ chạy khi người dùng bấm (C23); mô hình theo Mô hình & giọng (Claude hoặc Ollama).
//   POST /api/elem/ai        {mode: 'edit'|'variants', kind, type, label, fields, brand, frame:{w,h}, ask} → {ok, run}
//                            {mode: 'knobs', kind, type, label, allowed: {trường: {t, min, max | values}}, existing: [{id, label}], ask?}
//                            → "Gợi ý núm" (M148): kết quả knobs đã qua KnobsCore.validateMap
//                            400 dữ liệu sai · 409 đang có một lượt khác. Ô job riêng (không dùng ctx.startJob): chạy được khi đang xuất.
//   GET  /api/elem/ai        → {state: idle|running|done|error|cancelled, run, step, …kết quả: patch, diff, why | variants, warnings,
//                            | knobs, warnings, provider, ms | error, kind (theo LlmError: missing, login, quota, timeout, parse…)}
//   POST /api/elem/ai/cancel → {ok, cancelled}
//   POST /api/elem/shots     {timelines: [≤ 3 timeline đã áp bản vá], captions, t} → {shots: [data URL JPEG | null], error?}
//                            Ảnh nhỏ cho biến thể: cùng engine headless của QC (scripts/ai_qc.mjs openEngine / engineInit / engineShot).
// Route không ghi gì xuống đĩa; bản vá chỉ là đề xuất, giao diện áp khi người dùng bấm Nhận / chọn ảnh.
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { killTree } from '../../scripts/platform.mjs';

export default ctx => {
  let E = null, L = null, A = null, seq = 0, cur = null, shooting = false;
  const LAST = { state: 'idle' };
  process.once('exit', () => { if (cur?.proc) killTree(cur.proc); });
  const imp = rel => import(pathToFileURL(path.join(ctx.SKILL || path.resolve(import.meta.dirname, '../..'), rel)).href);
  const load = async () => { E ??= await imp('scripts/elem_ai.mjs'); L ??= await imp('scripts/llm.mjs'); A ??= await imp('scripts/assist.mjs'); };
  const timeout = () => (+process.env.AVS_ASSIST_TIMEOUT_S > 0 ? +process.env.AVS_ASSIST_TIMEOUT_S : 180) * 1000;

  async function ask(input, me, rec) {
    const prompt = A.assertCleanPrompt(input.mode === 'knobs' ? E.knobsPrompt(input) : input.mode === 'variants' ? E.variantsPrompt(input) : E.editPrompt(input));
    let provider = 'claude';
    const t0 = Date.now(), ms = timeout();
    const out = await L.askJSON(prompt, {
      shape: 'object', retries: 1, model: 'sonnet', task: 'text', cwd: os.tmpdir(), timeout: ms, timeoutMsg: `AI quá ${Math.round(ms / 1000)} giây chưa trả lời. Thử lại sau.`,
      onProc: pr => { me.proc = pr; if (me.cancelled) killTree(pr); },
      onTick: s => { if (rec.state === 'running') { rec.step = `AI đang nghĩ… ${Math.round(s)} s`; rec.progress = Math.min(0.9, 0.1 + 0.8 * (1 - Math.exp(-s / 25))); } },
      onAttempt: n => { if (n) rec.step = 'AI trả kết quả lỗi, đang hỏi lại…'; },
      run: async (p, o) => { const r = await (ctx.elemAiRun || L.runLLM)(p, o); provider = r?.provider || 'claude'; return r; },
      validate: v => (input.mode === 'knobs' ? E.normKnobs(v, input) : input.mode === 'variants' ? E.normVariants(v, input) : E.normEdit(v, input)),
    });
    return { ...out, provider, ms: Date.now() - t0 };
  }

  async function shots(b) {
    const list = Array.isArray(b.timelines) ? b.timelines.slice(0, 3) : [];
    if (!list.length || list.some(t => !t || typeof t !== 'object' || Array.isArray(t) || !Array.isArray(t.scenes ?? []))) throw Object.assign(new Error('timelines phải là mảng 1–3 timeline'), { status: 400 });
    const t = +b.t; if (!Number.isFinite(t) || t < 0) throw Object.assign(new Error('t không hợp lệ'), { status: 400 });
    const caps = Array.isArray(b.captions) ? b.captions : [];
    const Q = ctx.elemShotLib || await imp('scripts/ai_qc.mjs');
    const [DW, DH] = Q.designOf(list[0]), scale = 320 / (Math.max(DW, DH) * 1.5);
    const eng = await Q.openEngine(ctx.project.dir, { scale });
    try {
      const out = [];
      for (const tl of list) {
        try { await Q.engineInit(eng, tl, caps); await Q.engineShot(eng, t, null, false); out.push('data:image/jpeg;base64,' + await eng.page.screenshot({ type: 'jpeg', quality: 72, encoding: 'base64' })); }
        catch { out.push(null); }
      }
      return out;
    } finally { await eng.browser.close().catch(() => {}); }
  }

  return async (req, res, p) => {
    if (p !== '/api/elem/ai' && p !== '/api/elem/ai/cancel' && p !== '/api/elem/shots') return false;
    const J = (o, c) => (ctx.json(res, o, c), true);
    await load();
    if (p === '/api/elem/ai/cancel') {
      if (req.method !== 'POST') return false;
      if (!cur) return J({ ok: true, cancelled: false });
      cur.cancelled = true; if (cur.proc) killTree(cur.proc);
      return J({ ok: true, cancelled: true });
    }
    if (p === '/api/elem/shots') {
      if (req.method !== 'POST') return J({ error: 'Chỉ nhận POST' }, 405);
      if (!ctx.project) return J({ error: 'Chưa mở dự án' }, 400);
      if (shooting) return J({ error: 'Đang dựng ảnh biến thể, đợi xong rồi thử lại' }, 409);
      shooting = true;
      try { return J({ shots: await shots(await ctx.body(req)) }); }
      catch (e) { return J({ error: /puppeteer/i.test(e.message) ? 'máy chưa cài puppeteer-core (chạy bước cài của Studio)' : e.message.slice(0, 200) }, e.status || 500); }
      finally { shooting = false; }
    }
    if (req.method === 'GET') return J(LAST.rec || { state: 'idle' });
    if (req.method !== 'POST') return false;
    let input;
    try { input = E.checkInput(await ctx.body(req)); } catch (e) { return J({ error: e.message }, e.status || 400); }
    if (cur) return J({ error: 'AI đang sửa element. Đợi xong hoặc bấm Huỷ rồi thử lại.' }, 409);
    const rec = { state: 'running', run: ++seq, mode: input.mode, step: 'Bắt đầu', progress: 0, started: Date.now() };
    const me = cur = { run: rec.run, proc: null, cancelled: false };
    LAST.rec = rec;
    const stop = () => ({ state: 'cancelled', error: 'Đã huỷ theo yêu cầu', kind: 'cancel' });
    ask(input, me, rec)
      .then(out => Object.assign(rec, me.cancelled ? stop() : { ...out, state: 'done', step: 'Xong', progress: 1 }),
        e => Object.assign(rec, me.cancelled ? stop() : { state: 'error', error: e.message, kind: e.kind || 'error' }))
      .finally(() => { rec.ended = Date.now(); if (cur === me) cur = null; });
    return J({ ok: true, run: rec.run });
  };
};
