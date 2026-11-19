// S27 M196 · A-roll theo kịch bản (scripts/script_takes.mjs; feature studio/features/24_aroll.js).
//   GET  /api/aroll              → { script, offscript: [{i,t0,t1,a,b,text,dur}], takes: [{n,name}], job, plan }
//                                  offscript: lời ngoài kịch bản còn trên timeline, nên cắt (người dùng tick; không chọn sẵn)
//                                  job: việc `script_takes` mới nhất của dự án trong hàng đợi; plan: tóm tắt .studio/takes_plan.json
//   GET  /api/aroll/plan         → { plan }  kế hoạch đầy đủ (clips, caps) để Studio áp một bước hoàn tác
//   POST /api/aroll/takes {model} → { ok, item }  xếp job nền `script_takes` cho dự án đang mở (chỉ thư mục của dự án, không nhận đường dẫn)
//   POST /api/aroll/applied      → { ok }  Studio đã áp kế hoạch: script.json nhận segments/align theo take, sao lưu lời nhận dạng của
//                                  các take (captions_noscript.json + heardDur) để sửa kịch bản lần sau căn đúng
//   POST /api/aroll/realign      → { ok, offscript }  sau khi cắt (đã lưu): danh sách tính lại từ phụ đề đã cắt; không ghi script.json
//                                  (⌘Z rồi lưu thì đoạn hiện lại; lưu kịch bản / Tạo lời thoại vẫn căn lại như cũ)
// Không chạy trong Tự lái: chọn take và cắt lời ngoài kịch bản cần người duyệt.
import fs from 'node:fs';
import path from 'node:path';
import { alignScript, heardOf, readScript } from '../../scripts/script_doc.mjs';
import { offscriptCuts, plansFile, projectTakes, readTakesPlan } from '../../scripts/script_takes.mjs';
import { addItem, loadQueue } from '../../scripts/queue.mjs';

const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(o, null, 1)); fs.renameSync(t, f); };
const MODELS = ['small', 'medium', 'large-v3-turbo', 'large-v3'];
const same = (a, b) => path.resolve(String(a || '')).toLowerCase() === path.resolve(String(b || '')).toLowerCase();
export function lastJob(dir) {
  try { return loadQueue().items.filter(x => x.kind === 'script_takes' && same(x.input, dir)).pop() || null; } catch { return null; }
}
// lời ngoài kịch bản tính lại từ phụ đề đang có trên timeline mỗi lần đọc (không ghi script.json): cắt rồi ⌘Z thì đoạn hiện lại
export function liveOffscript(sc, tl, captions) {
  if (!sc?.segments?.length || tl?.speech?.none) return [];
  const heard = heardOf(captions || []); if (!heard.length) return [];
  return offscriptCuts(alignScript(sc.segments, heard).align.offscript, heard, { dur: tl.duration || Infinity });
}
export function planSummary(plan, sc) {
  if (!plan?.clips?.length) return null;
  return { at: plan.at, clips: plan.clips.length, takes: plan.takes, missing: plan.missing || [], duration: plan.duration, applied: plan.applied || null,
    stale: !!(sc?.updated && plan.scriptAt && sc.updated !== plan.scriptAt) }; // kịch bản đã sửa sau khi dựng: dựng lại
}

export default ctx => async (req, res, p) => {
  if (p !== '/api/aroll' && !p.startsWith('/api/aroll/')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  try {
    const dir = ctx.project.dir;
    if (p === '/api/aroll' && req.method === 'GET') {
      const sc = readScript(dir), { timeline: tl, captions } = ctx.readProject();
      const offscript = liveOffscript(sc, tl, captions);
      const j = lastJob(dir);
      return J({ script: !!sc, offscript, takes: projectTakes(dir, tl).map((t, i) => ({ n: i + 1, name: t.name })),
        job: j && { id: j.id, state: j.state, step: j.step, progress: j.progress, error: j.error }, plan: planSummary(readTakesPlan(dir), sc) });
    }
    if (p === '/api/aroll/plan' && req.method === 'GET') return J({ plan: readTakesPlan(dir) });
    if (req.method !== 'POST') return false;
    const b = await ctx.body(req);
    if (p === '/api/aroll/takes') {
      if (!readScript(dir)) return J({ error: 'Dự án chưa có kịch bản' }, 400);
      const { timeline: tl } = ctx.readProject();
      if (!projectTakes(dir, tl).length) return J({ error: 'Không thấy clip quay nào có tiếng trên track chính' }, 400);
      const j = lastJob(dir); if (j && ['queued', 'running'].includes(j.state)) return J({ ok: true, item: j });
      const model = MODELS.includes(b.model) ? b.model : undefined;
      return J({ ok: true, item: addItem({ kind: 'script_takes', input: dir, opts: model ? { model } : {}, source: 'ui' }) });
    }
    if (p === '/api/aroll/applied') {
      const plan = readTakesPlan(dir), sc = readScript(dir);
      if (!plan?.clips?.length || !sc) return J({ error: 'Chưa có kế hoạch A-roll' }, 400);
      const backup = path.join(dir, '.studio', 'captions_noscript.json');
      if (plan.raw?.length) wr(backup, plan.raw);
      wr(path.join(dir, '.studio', 'script.json'), { ...sc, segments: plan.segments, align: plan.align, heardDur: plan.duration });
      wr(plansFile(dir), { ...plan, applied: new Date().toISOString() });
      return J({ ok: true });
    }
    if (p === '/api/aroll/realign') {
      const { timeline: tl, captions } = ctx.readProject();
      return J({ ok: true, offscript: liveOffscript(readScript(dir), tl, captions) });
    }
    return false;
  } catch (e) { return J({ error: String(e.message || e).slice(0, 300) }, e.status || 500); }
};
