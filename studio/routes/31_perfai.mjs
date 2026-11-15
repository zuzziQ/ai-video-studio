// AI chọn profile hiệu năng (M68, scripts/perf_advisor.mjs, references/perf-profile.md mục "AI chọn profile").
//   POST /api/perf/advise {goal: 'nhanh'|'song-song'|'chat-luong', job?: {W, H, fps, sec, count}, llm?: false}
//     → {profile, overrides, reason, provider: 'claude'|'ollama'|'rules', pick, candidates, llm_error?}
//   Chỉ đề xuất, không lưu (lưu qua route của panel 29_perf hoặc `node scripts/perf.mjs set`). Sai kiểu → 400;
//   đang có một lượt hỏi khác → 409. Chỉ xử lý đúng đường dẫn này để không đè các /api/perf/* của 29_perf.mjs.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const JOB_FIELDS = { W: [64, 8192, true], H: [64, 8192, true], fps: [1, 120, true], sec: [0.1, 36000, false], count: [1, 1000, true] };
const bad = m => Object.assign(new Error(m), { status: 400 });
export function checkBody(b, goals) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw bad('Body phải là object JSON');
  if (!goals.includes(b.goal)) throw bad('goal phải là: ' + goals.join(', '));
  if (b.llm !== undefined && typeof b.llm !== 'boolean') throw bad('llm phải là true/false');
  if (b.job === undefined || b.job === null) return { goal: b.goal, job: {}, useLlm: b.llm !== false };
  if (typeof b.job !== 'object' || Array.isArray(b.job)) throw bad('job phải là object');
  const job = {};
  for (const [k, v] of Object.entries(b.job)) {
    const f = JOB_FIELDS[k];
    if (!f) throw bad(`job không có trường "${k}"`);
    const [lo, hi, int] = f;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi || (int && !Number.isInteger(v))) throw bad(`job.${k} phải là ${int ? 'số nguyên' : 'số'} ${lo}–${hi}`);
    job[k] = v;
  }
  return { goal: b.goal, job, useLlm: b.llm !== false };
}

export default ctx => {
  let busy = false, mod = null;
  // ctx.perfAdvisor: test cắm { advise, GOALS } giả vào đây
  const load = async () => (mod ??= ctx.perfAdvisor || await import(pathToFileURL(path.join(ctx.SKILL, 'scripts/perf_advisor.mjs')).href));
  return async (req, res, p) => {
    if (p !== '/api/perf/advise' || req.method !== 'POST') return false;
    const { advise, GOALS } = await load();
    const args = checkBody(await ctx.body(req), GOALS);
    if (busy) return ctx.json(res, { error: 'Đang có một lượt AI chọn profile khác, đợi xong rồi thử lại.' }, 409), true;
    busy = true;
    try { ctx.json(res, await advise(args)); }
    finally { busy = false; }
    return true;
  };
};
