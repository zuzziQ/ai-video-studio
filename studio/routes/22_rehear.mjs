// Nghe lại bằng AI (ROADMAP M95; logic ở scripts/rehear.mjs + scripts/rehear.py; panel Lời thoại 21_transcript.js).
//   POST /api/rehear {s, e, model?}  → {ok, run}: cắt tiếng nói [s-1, e+1] trên timeline, Whisper model lớn hơn model đã
//                                    tạo lời thoại (hoặc `model`), initial prompt = câu trước/sau + từ điển. Ô job RIÊNG
//                                    (như /api/assist): chạy được khi đang xuất video, một lượt nghe lại một lúc.
//                                    400 đoạn sai · 409 đang nghe lại / đang tạo lời thoại
//   GET  /api/rehear                 → {state: idle|running|done|error|cancelled, run, step, progress, …kết quả: model, device,
//                                    words [{w,s,e}], text, from, to, ms, load_ms, run_ms | error}
//   POST /api/rehear/batch {spans: [{s, e}], model?} → {ok, run}: M96 "Soát kỹ", nghe lần lượt 1–20 đoạn nghi trong CÙNG ô job,
//                                    nạp model một lần (scripts/rehear.mjs rehearMany), tiến độ "Đoạn 3/9: …"; GET /api/rehear trả
//                                    thêm batch: true, spans [{s, e, from, to, words, text}]. Model mặc định như trên (turbo → large-v3).
//   POST /api/rehear/cancel          → {ok, cancelled}
// Kết quả chỉ là chữ nghe được; route không sửa lời thoại. Panel so với lời thoại rồi hiện đề xuất để người dùng Nhận / Bỏ.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { killTree } from '../../scripts/platform.mjs';
import { dictSources } from '../../scripts/dict.mjs';

export default ctx => {
  let mod = null, seq = 0, cur = null, last = { state: 'idle' };
  process.once('exit', () => { if (cur?.proc) killTree(cur.proc); });
  // ctx.rehearLib: test cắm thư viện giả vào đây
  const load = async () => (mod ??= ctx.rehearLib || await import(pathToFileURL(path.join(ctx.SKILL, 'scripts/rehear.mjs')).href));
  return async (req, res, p) => {
    if (p !== '/api/rehear' && p !== '/api/rehear/cancel' && p !== '/api/rehear/batch') return false;
    const J = (o, c) => (ctx.json(res, o, c), true);
    if (p === '/api/rehear/cancel') {
      if (req.method !== 'POST') return false;
      if (!cur) return J({ ok: true, cancelled: false });
      cur.cancelled = true; killTree(cur.proc);
      return J({ ok: true, cancelled: true });
    }
    if (req.method === 'GET') return p === '/api/rehear' ? J(last) : false;
    if (req.method !== 'POST') return false;
    const batch = p === '/api/rehear/batch';
    if (!ctx.project) return J({ error: 'Chưa mở dự án' }, 400);
    const R = await load();
    const b = await ctx.body(req);
    let tl, captions;
    try { ({ timeline: tl, captions } = ctx.readProject()); } catch (e) { return J({ error: 'Không đọc được dự án: ' + e.message }, 400); }
    try { if (batch) R.checkSpans(b?.spans, tl.duration); else R.checkSpan(b, tl.duration); R.pickModel(tl.asr?.model, b?.model ?? undefined); } catch (e) { return J({ error: e.message }, e.status || 400); }
    if (cur) return J({ error: 'Đang nghe lại một đoạn khác. Đợi xong hoặc bấm Huỷ rồi thử lại.' }, 409);
    // "Tạo lời thoại" cũng ghi .studio/stem_voice.wav: không chạy chồng
    if (ctx.job?.state === 'running' && ctx.job.kind === 'transcribe') return J({ error: 'Đang tạo lời thoại, đợi xong rồi nghe lại.' }, 409);
    let terms = [];
    try { const d = dictSources({ dir: ctx.project.dir, timeline: tl }); terms = [...d.auto, ...d.brand, ...d.project].map(x => x.to); } catch { /* từ điển hỏng: nghe không có từ khoá */ }
    const words = captions.flatMap(c => c.words || []).filter(w => typeof w?.w === 'string');
    const rec = last = batch ? { state: 'running', run: ++seq, batch: true, step: 'Bắt đầu', progress: 0, n: b.spans.length, started: Date.now() }
      : { state: 'running', run: ++seq, step: 'Bắt đầu', progress: 0, s: +b.s, e: +b.e, started: Date.now() };
    const me = cur = { run: rec.run, proc: null, cancelled: false };
    const o = { dir: ctx.project.dir, tl, words, terms, model: b.model ?? undefined, lang: b.lang, skill: ctx.SKILL, py: ctx.PY };
    (batch ? R.rehearMany({ ...o, spans: b.spans.map(x => ({ s: +x.s, e: +x.e })) }, env()) : R.rehear({ ...o, s: +b.s, e: +b.e }, env()))
      .then(out => { Object.assign(rec, me.cancelled ? { state: 'cancelled', error: 'Đã huỷ theo yêu cầu' } : { ...out, state: 'done', step: 'Xong', progress: 1 }); },
        e => { Object.assign(rec, me.cancelled ? { state: 'cancelled', error: 'Đã huỷ theo yêu cầu' } : { state: 'error', error: e.message }); })
      .finally(() => { rec.ended = Date.now(); if (cur === me) cur = null; });
    return J({ ok: true, run: rec.run });
    function env() { return {
      onProgress: (k, st) => { if (rec.state === 'running') { rec.progress = k; rec.step = st; } },
      onProc: pr => { me.proc = pr; if (me.cancelled) killTree(pr); },
      cancelled: () => me.cancelled,
    }; }
  };
};
