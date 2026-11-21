// S28 M210 · Vạch nhịp (scripts/beats_job.mjs qua hàng đợi; feature studio/features/33_beats.js, lõi 33_beats.core.js).
//   GET  /api/beats?file=<trong dự án>|mood=<nhạc thư viện> → { beats, job }  beats: { bpm, t, strong, dur } đã phân tích (cache .studio/beats/)
//                                                            job: việc `beats` mới nhất cho file đó trong hàng đợi
//   POST /api/beats {file|mood} → { ok, beats } khi đã có, không thì { ok, item } (xếp job nền `beats`; trùng việc đang chờ thì trả việc đó)
// Không ghi timeline.json: Studio gắn nhịp vào khối nhạc (TL.audio.music[i].beats) một bước hoàn tác rồi lưu như mọi chỉnh sửa.
import path from 'node:path';
import { createRequire } from 'node:module';
import { addItem, loadQueue } from '../../scripts/queue.mjs';
import { readResult, resolveSource } from '../../scripts/beats_job.mjs';

const BeatsCore = createRequire(import.meta.url)('../features/33_beats.core.js');
const same = (a, b) => path.resolve(String(a || '')).toLowerCase() === path.resolve(String(b || '')).toLowerCase();
const pick = o => (typeof o?.mood === 'string' && o.mood && !o.file ? { mood: o.mood } : { file: typeof o?.file === 'string' ? o.file : '' });
export function lastJob(dir, src) {
  try { return loadQueue().items.filter(x => x.kind === 'beats' && same(x.input, dir) && same(x.opts?.src, src)).pop() || null; } catch { return null; }
}
const jobOf = j => j && { id: j.id, state: j.state, step: j.step, progress: j.progress, error: j.error };

export default ctx => async (req, res, p, u) => {
  if (p !== '/api/beats') return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  try {
    const dir = ctx.project?.dir; if (!dir) return J({ error: 'Chưa mở dự án' }, 400);
    const q = req.method === 'POST' ? pick(await ctx.body(req)) : pick({ file: u.searchParams.get('file'), mood: u.searchParams.get('mood') });
    const src = resolveSource(dir, q);
    if (!src) return J({ error: 'Không thấy file nhạc của khối này trong dự án' }, 404);
    const beats = BeatsCore.parse(readResult(dir, src));
    if (req.method === 'GET') return J({ beats, job: jobOf(lastJob(dir, src)) });
    if (req.method !== 'POST') return false;
    if (beats) return J({ ok: true, beats });
    const j = lastJob(dir, src); if (j && ['queued', 'running'].includes(j.state)) return J({ ok: true, item: jobOf(j) });
    // opts.src chỉ để tìm lại việc (lastJob); beats_job.mjs tự kiểm lại file / mood
    return J({ ok: true, item: jobOf(addItem({ kind: 'beats', input: dir, opts: { ...q, src }, source: 'ui' })) });
  } catch (e) { return J({ error: String(e.message || e).slice(0, 300) }, e.status || 500); }
};
