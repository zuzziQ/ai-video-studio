// S22 M153: thanh Hỏi Claude — định tuyến câu hỏi tự do vào một việc của phạm vi (lõi scripts/ask_route.mjs + 75_ask.core.js,
// giao diện studio/features/75_ask.js). Chỉ chạy khi người dùng gửi (C23); mô hình theo Mô hình & giọng (Claude hoặc Ollama).
//   POST /api/ask         {ask, step, sel?, range?, region?, info?} → {ok, run} · 400 dữ liệu sai · 409 đang có một lượt khác
//   S24 M173: phạm vi region {x, y, w, h, t} (px thiết kế) → server cắt vùng đó từ khung hình gốc tại t (AskCore.frameAt: ảnh
//   của dãy khung, không có thì ffmpeg lấy từ video nguồn) ra <tmp>/avs-ask-<pid>/region.jpg, mô hình đọc ảnh bằng Read (chỉ
//   Claude xem được ảnh). Cắt không được (chưa mở dự án, thiếu khung / ffmpeg) thì hỏi bằng toạ độ.
//   GET  /api/ask         → {state: idle|running|done|error|cancelled, run, step, …kết quả: action, params, reply, warnings, scope,
//                            provider, ms | error, kind (theo LlmError)}
//   POST /api/ask/cancel  → {ok, cancelled}
//   S24 M171: luồng hỏi đáp của dự án đang mở (.studio/ask_log.json, AskCore.logPush: 200 lượt gần nhất, không lưu ảnh)
//   GET  /api/ask/log     → {items} · POST /api/ask/log {entry} → {ok, n} (cùng id thì thay: trạng thái thẻ) · 400 lượt sai · 404 chưa mở dự án
// /api/ask không ghi gì xuống đĩa và không sửa timeline: chỉ trả việc đã chọn; giao diện chạy việc bằng hàm sẵn có rồi đưa qua
// Studio.review (Nhận = một bước ⌘Z). Ô job riêng (không dùng ctx.startJob): hỏi được khi đang xuất.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { killTree } from '../../scripts/platform.mjs';

export default ctx => {
  let R = null, L = null, A = null, seq = 0, cur = null;
  const LAST = { rec: null };
  process.once('exit', () => { if (cur?.proc) killTree(cur.proc); });
  const imp = rel => import(pathToFileURL(path.join(ctx.SKILL || path.resolve(import.meta.dirname, '../..'), rel)).href);
  const load = async () => { R ??= await imp('scripts/ask_route.mjs'); L ??= await imp('scripts/llm.mjs'); A ??= await imp('scripts/assist.mjs'); };
  const timeout = () => (+process.env.AVS_ASSIST_TIMEOUT_S > 0 ? +process.env.AVS_ASSIST_TIMEOUT_S : 120) * 1000;

  // ---------- M173: cắt vùng từ khung hình gốc ----------
  const inProj = rel => {
    const root = ctx.project?.dir;
    if (!root || typeof rel !== 'string' || !rel || rel.includes('\0') || /^[a-z]+:\/\//i.test(rel)) return null;
    const p = path.resolve(root, rel.replace(/^\/+/, ''));
    return p.startsWith(path.resolve(root) + path.sep) && fs.existsSync(p) ? p : null;
  };
  const ffmpeg = (args, ms = 20000) => new Promise((ok, no) => execFile('ffmpeg', ['-v', 'error', '-y', ...args], { timeout: ms, windowsHide: true }, e => (e ? no(e) : ok())));
  async function cropRegion(input) {
    const g = input.scope, tl = ctx.readProject?.()?.timeline, f = tl && R.AskCore.frameAt(tl, g.t);
    if (!f) return null;
    const dir = path.join(os.tmpdir(), `avs-ask-${process.pid}`), out = path.join(dir, 'region.jpg');
    fs.mkdirSync(dir, { recursive: true });
    const vf = `scale=${input.ctx.dw}:${input.ctx.dh},crop=${g.w}:${g.h}:${g.x}:${g.y}`;
    const seq = inProj(f.seq), vid = !seq && inProj(f.video);
    if (!seq && !vid) return null;
    await (ctx.askCrop || ffmpeg)(seq ? ['-i', seq, '-frames:v', '1', '-vf', vf, out] : ['-ss', String(f.at), '-i', vid, '-frames:v', '1', '-vf', vf, out]);
    return fs.existsSync(out) ? { dir, file: 'region.jpg' } : null;
  }

  async function ask(input, me, rec) {
    let img = null;
    if (input.scope.kind === 'region') {
      rec.step = 'Đang cắt ảnh vùng…';
      img = await cropRegion(input).catch(() => null);
      input.ctx.image = img ? img.file : false;
    }
    const prompt = A.assertCleanPrompt(R.routerPrompt(input));
    let provider = 'claude';
    const t0 = Date.now(), ms = timeout();
    const out = await L.askJSON(prompt, {
      shape: 'object', retries: 1, model: 'sonnet', task: img ? 'vision' : 'text', cwd: img ? img.dir : os.tmpdir(), ...(img ? { args: ['--allowedTools', 'Read'] } : {}),
      timeout: ms, timeoutMsg: `AI quá ${Math.round(ms / 1000)} giây chưa trả lời. Thử lại sau.`,
      onProc: pr => { me.proc = pr; if (me.cancelled) killTree(pr); },
      onTick: s => { if (rec.state === 'running') rec.step = `Claude đang đọc câu hỏi… ${Math.round(s)} s`; },
      onAttempt: n => { if (n) rec.step = 'AI trả kết quả lỗi, đang hỏi lại…'; },
      run: async (p, o) => { const r = await (ctx.askRun || L.runLLM)(p, o); provider = r?.provider || 'claude'; return r; },
      validate: v => R.normPick(v, input),
    });
    return { ...out, scope: input.scope, provider, ms: Date.now() - t0, ...(input.scope.kind === 'region' ? { image: !!img } : {}) };
  }

  // ghi qua tệp tạm rồi đổi tên: đang ghi mà tắt máy không làm hỏng lịch sử cũ
  function logFile() { return ctx.project ? ctx.P('.studio/ask_log.json') : null; }
  function readLog(f) { try { return R.AskCore.logParse(fs.readFileSync(f, 'utf8')); } catch { return []; } }
  function writeLog(f, items) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = `${f}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, items }));
    fs.renameSync(tmp, f);
  }

  return async (req, res, p) => {
    if (p !== '/api/ask' && p !== '/api/ask/cancel' && p !== '/api/ask/log') return false;
    const J = (o, c) => (ctx.json(res, o, c), true);
    await load();
    if (p === '/api/ask/log') {
      const f = logFile();
      if (req.method === 'GET') return J({ items: f ? readLog(f) : [] });
      if (req.method !== 'POST') return false;
      if (!f) return J({ error: 'Chưa mở dự án' }, 404);
      const b = await ctx.body(req).catch(() => null), e = R.AskCore.logEntry(b?.entry);
      if (!e) return J({ error: 'Lượt hỏi đáp không hợp lệ' }, 400);
      const items = R.AskCore.logPush(readLog(f), e);
      try { writeLog(f, items); } catch (err) { return J({ error: `Không lưu được lịch sử: ${err.message}` }, 500); }
      return J({ ok: true, n: items.length });
    }
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
