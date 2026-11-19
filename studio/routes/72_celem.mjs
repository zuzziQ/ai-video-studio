// S27 M199: Claude dựng element riêng (spec khai báo, khối engine/celem.js; lõi scripts/elem_make.mjs, giao diện
// studio/features/72_celem.js, thiết kế docs/plans/S27-element-claude.md). Chỉ gọi mô hình khi người dùng bấm / hỏi (C23).
//   POST /api/elem/make        {ask, brand:{màu, font}, brand_id, frame:{w,h}, style?, text?, base?: spec đang sửa, refs?: ≤ 4 data URL ảnh ví dụ
//                              (JPEG/PNG/WebP ≤ 1,5 MB), elem_id?: dùng lại ảnh ví dụ đã lưu, brand_first?: màu thương hiệu trước màu ảnh} → {ok, run}
//                              Có ảnh: chép ref_N vào thư mục tạm, Claude chạy cwd đó với --allowedTools Read (như Style Lab "Từ mô tả")
//                              400 dữ liệu sai · 409 đang có một lượt khác
//   GET  /api/elem/make        → {state: idle|running|done|error|cancelled, run, step, variants: [{name, why, text, spec}], warnings, provider, ms | error, kind}
//   POST /api/elem/make/cancel → {ok, cancelled}
//   GET  /api/elem/lib?brand=  → {items}  thư viện element riêng của thương hiệu ('' = Chung), $AVS_HOME/elements/<id>.json
//   POST /api/elem/lib         {brand, id?, name, spec, text?, thumb?: data URL JPEG, ask?, refs?: ảnh ví dụ} → {ok, item}  (spec qua CELEM.check;
//                              ảnh ví dụ lưu ở elements/refs/<brand>/<id>/ref_N, item.refs = số ảnh)
//   POST /api/elem/lib/delete  {brand, id} → {ok, deleted}
// Ảnh 3 phương án: giao diện gọi POST /api/elem/shots của 72_elem_ai.mjs (cùng engine headless) với timeline đã chèn cảnh celem.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { killTree } from '../../scripts/platform.mjs';
import { rmSync } from '../../scripts/fs_rm.mjs';
import { AVS_HOME } from '../security.mjs';

const brandIds = home => { try { return (JSON.parse(fs.readFileSync(path.join(home, 'brands.json'), 'utf8')).brands || []).map(b => b.id); } catch { return []; } };

export default ctx => {
  let M = null, L = null, A = null, seq = 0, cur = null;
  const LAST = { rec: null };
  process.once('exit', () => { if (cur?.proc) killTree(cur.proc); });
  const imp = rel => import(pathToFileURL(path.join(ctx.SKILL || path.resolve(import.meta.dirname, '../..'), rel)).href);
  const load = async () => { M ??= await imp('scripts/elem_make.mjs'); L ??= await imp('scripts/llm.mjs'); A ??= await imp('scripts/assist.mjs'); };
  const timeout = () => (+process.env.AVS_ASSIST_TIMEOUT_S > 0 ? +process.env.AVS_ASSIST_TIMEOUT_S : 180) * 1000;

  async function ask(input, me, rec) {
    // ảnh ví dụ: mới gửi lên, hoặc ảnh đã lưu cạnh element đang sửa (elem_id) → thư mục làm việc tạm, Claude đọc bằng Read
    const refs = input.refs.length ? input.refs : input.elem_id ? M.libRefs(AVS_HOME(), input.brand_id, input.elem_id) : [];
    const dir = refs.length ? fs.mkdtempSync(path.join(os.tmpdir(), 'avs-celem-')) : null;
    try {
      input.files = dir ? M.writeRefs(dir, refs) : [];
      return await askIn(input, me, rec, dir);
    } finally { if (dir) rmSync(dir, { recursive: true, force: true }); }
  }
  async function askIn(input, me, rec, dir) {
    const prompt = A.assertCleanPrompt(M.makePrompt(input));
    let provider = 'claude';
    const t0 = Date.now(), ms = timeout();
    const out = await L.askJSON(prompt, {
      shape: 'object', retries: 1, model: 'sonnet', task: dir ? 'vision' : 'text', cwd: dir || os.tmpdir(), ...(dir ? { args: ['--allowedTools', 'Read'] } : {}), timeout: ms, timeoutMsg: `AI quá ${Math.round(ms / 1000)} giây chưa trả lời. Thử lại sau.`,
      onProc: pr => { me.proc = pr; if (me.cancelled) killTree(pr); },
      onTick: s => { if (rec.state === 'running') { rec.step = `Claude đang dựng element… ${Math.round(s)} s`; rec.progress = Math.min(0.9, 0.1 + 0.8 * (1 - Math.exp(-s / 30))); } },
      onAttempt: n => { if (n) rec.step = 'Spec chưa hợp lệ, đang hỏi lại…'; },
      run: async (p, o) => { const r = await (ctx.celemRun || L.runLLM)(p, o); provider = r?.provider || 'claude'; return r; },
      validate: v => M.normMake(v, input),
    });
    return { ...out, provider, ms: Date.now() - t0, refs: input.files.length };
  }

  return async (req, res, p, u) => {
    if (!p.startsWith('/api/elem/make') && !p.startsWith('/api/elem/lib')) return false;
    if (!['/api/elem/make', '/api/elem/make/cancel', '/api/elem/lib', '/api/elem/lib/delete'].includes(p)) return false;
    const J = (o, c) => (ctx.json(res, o, c), true);
    await load();
    const home = AVS_HOME();
    try {
      if (p === '/api/elem/lib') {
        if (req.method === 'GET') return J({ items: M.listLib(home, (u?.searchParams?.get('brand') || '').trim()) });
        if (req.method !== 'POST') return J({ error: 'Chỉ nhận GET / POST' }, 405);
        const b = await ctx.body(req), brand = String(b?.brand ?? '');
        if (brand && !brandIds(home).includes(brand)) return J({ error: 'Không thấy thương hiệu' }, 404);
        return J({ ok: true, item: M.saveLib(home, brand, b) });
      }
      if (p === '/api/elem/lib/delete') {
        if (req.method !== 'POST') return J({ error: 'Chỉ nhận POST' }, 405);
        const b = await ctx.body(req);
        return J({ ok: true, deleted: M.delLib(home, String(b?.brand ?? ''), String(b?.id ?? '')) });
      }
    } catch (e) { return J({ error: e.message }, e.status || 500); }

    if (p === '/api/elem/make/cancel') {
      if (req.method !== 'POST') return J({ error: 'Chỉ nhận POST' }, 405);
      if (!cur) return J({ ok: true, cancelled: false });
      cur.cancelled = true; if (cur.proc) killTree(cur.proc);
      return J({ ok: true, cancelled: true });
    }
    if (req.method === 'GET') return J(LAST.rec || { state: 'idle' });
    if (req.method !== 'POST') return J({ error: 'Chỉ nhận GET / POST' }, 405);
    let input;
    try { input = M.checkMakeInput(await ctx.body(req)); } catch (e) { return J({ error: e.message }, e.status || 400); }
    if (cur) return J({ error: 'Claude đang dựng element. Đợi xong hoặc bấm Huỷ rồi thử lại.' }, 409);
    const rec = { state: 'running', run: ++seq, step: 'Bắt đầu', progress: 0, started: Date.now(), ask: input.ask, edit: !!input.base };
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
