// Render lô song song (S08 · M68, theo số đo M66: docs/perf/2026-11-15-m66-batch-parallel.md). Dùng cho batch.mjs
// (Hàng loạt từ bảng tính) và variants.mjs (xuất các phiên bản). Spec: references/perf-profile.md mục "Lô song song".
//
//   batchPlan({ n, hw, perf, load, W, H }) → { parallel, workersEach, budget, why }     hàm thuần
//       n: số bản còn phải render; hw: hwSnapshot(); perf: resolvePerf(); load: { renders_running }; W×H: khổ render.
//       Ngân sách worker (= Chrome) B = nhân thật, kẹp theo VRAM trống (~0,55 GB mỗi Chrome 1080p, ~0,45 GB 720p, chừa 1 GB)
//       và RAM trống (~0,7 GB mỗi worker 1080p, chừa 1,5 GB). P = min(n, B), W = clamp(floor(B / P), 1, 4) (4K: tối đa 3).
//       tuy-chinh có số worker → ngân sách tối đa bằng số đó. W = 3 hạ về 2 (NVENC + 3 worker lệch pts sau ghép, M66 mục 4).
//       Tắt (parallel 1, workersEach null = như cũ): n ≤ 1, profile tiet-kiem hoặc ưu tiên below_normal, Chrome SwiftShader,
//       encoder x264 (gồm chat-luong), perf.slots > 1 (lô chỉ giữ một lượt), đang có lượt render khác, ngân sách < 2.
//   holdBatchSlot({ perf, info, onWait }) → { release(), childEnv }   một lô = một lượt trong render_slots.json (M64): lô xin
//       chỗ một lần (chờ như render.mjs), render con chạy với AVS_RENDER_SLOTS=0 để không xếp hàng lẫn nhau; Studio export
//       hay hàng đợi khác vẫn phải chờ lô. Chỗ tự nhả khi tiến trình lô thoát; bị giết cứng thì lượt sau dọn (pid chết).
//   runPool(items, parallel, fn) → kết quả theo thứ tự items; tối đa `parallel` fn(item, i) chạy cùng lúc; lỗi của một
//       item không dừng các item khác (fn tự bắt lỗi của nó nếu muốn ghi theo dòng).
//   pipeline({ items, parallel, build, render, onDone, onError, shouldStop }) → { stopped }   vòng của batch.mjs: dựng lần lượt
//       (build dùng chung một trình duyệt), render tối đa `parallel` cùng lúc (item kế dựng trong lúc các item khác render);
//       shouldStop() kiểm trước mỗi item mới (tạm dừng: item đang render chạy xong). Lỗi build/render của một item →
//       onError, không dừng item khác; lỗi trong chính onDone/onError cũng không làm vỡ vòng.
//   batchPixels(quality) → [W, H] dọc cho '720' | '1080' | '4k'
import { acquireRenderSlot, slotHolders, MAX_WORKERS } from './perf_profile.mjs';

const HW_ENC = new Set(['nvenc', 'qsv', 'videotoolbox']);
const PX1080 = 1080 * 1920, PX720 = 720 * 1280;
export const VRAM_PER_CHROME_GB = { p1080: 0.55, p720: 0.45 }, VRAM_RESERVE_GB = 1;
export const RAM_PER_WORKER_1080_GB = 0.7, RAM_RESERVE_GB = 1.5, MAX_WORKERS_EACH = 4;

export const batchPixels = q => (q === '4k' ? [2160, 3840] : q === '720' ? [720, 1280] : [1080, 1920]);
const finite = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// AVS_BATCH_PARALLEL: 1 = luôn lần lượt (như trước M68), N = tối đa N bản cùng lúc; trống/sai = tự động.
export const parallelLimit = (env = process.env) => { const v = String(env.AVS_BATCH_PARALLEL ?? '').trim(); return /^\d+$/.test(v) && +v >= 1 ? +v : null; };
//   limit: tối đa số bản cùng lúc (parallelLimit(env) đọc AVS_BATCH_PARALLEL; 1 = tắt).
const off = why => ({ parallel: 1, workersEach: null, budget: 0, why });
// batchGate({ n, perf, limit }) → kế hoạch "tắt" khi đã biết chắc không chạy song song mà chưa cần dò máy, ngược lại null.
// batch.mjs / variants.mjs gọi trước holdBatchSlot: lô sẽ chạy lần lượt thì không giữ lượt (giữ hành vi trước M68).
export function batchGate({ n = 1, perf = {}, limit = null } = {}) {
  const N = Math.max(0, Math.floor(finite(n, 1)));
  if (N <= 1) return off('một bản: render như thường');
  if (limit === 1) return off('AVS_BATCH_PARALLEL=1: render lần lượt');
  if (perf.profile === 'tiet-kiem') return off('profile tiết kiệm: render lần lượt');
  if (perf.priority === 'below_normal') return off('ưu tiên thấp (chừa máy cho việc khác): render lần lượt');
  if (perf.encoder && perf.encoder !== 'auto' && !HW_ENC.has(perf.encoder)) return off(`encoder ${perf.encoder} (không phải mã hoá phần cứng): render lần lượt`);
  if (finite(perf.slots, 1) > 1) return off(`đã cho ${perf.slots} lượt render cùng lúc trên cả máy: lô render lần lượt`);
  return null;
}
export function batchPlan({ n = 1, hw = {}, perf = {}, load = {}, W = 1080, H = 1920, limit = null } = {}) {
  const gate = batchGate({ n, perf, limit });
  if (gate) return gate;
  const N = Math.floor(finite(n, 1));
  if (hw?.chrome?.mode === 'swiftshader') return off('Chrome không có GPU (SwiftShader): chụp khung ăn CPU, render lần lượt');
  const enc = perf.encoder && perf.encoder !== 'auto' ? perf.encoder : hw?.encoder?.final;
  if (!HW_ENC.has(enc)) return off(`encoder ${enc || 'chưa rõ'} (không phải mã hoá phần cứng): render lần lượt`);
  if (finite(load?.renders_running, 0) > 0) return off('đang có lượt render khác: render lần lượt để không chồng tải');

  const px = W * H, phys = Math.max(1, Math.floor(finite(hw?.cores?.physical, 1)));
  const caps = [`${phys} nhân thật`];
  let budget = phys;
  const g = Array.isArray(hw?.gpu) ? hw.gpu[0] : null;
  if (g && finite(g.vram_free_mb, 0) > 0) {
    const v = px <= PX720 ? VRAM_PER_CHROME_GB.p720 : px <= PX1080 ? VRAM_PER_CHROME_GB.p1080 : VRAM_PER_CHROME_GB.p1080 * px / PX1080;
    const free = g.vram_free_mb / 1024, cap = Math.floor((free - VRAM_RESERVE_GB) / v);
    if (cap < budget) { budget = cap; caps.push(`VRAM trống ${free.toFixed(1)} GB chỉ đủ ${Math.max(0, cap)} Chrome`); }
  }
  const ramFree = finite(hw?.ram?.free_gb, null);
  if (ramFree != null) {
    const cap = Math.floor((ramFree - RAM_RESERVE_GB) / (RAM_PER_WORKER_1080_GB * px / PX1080));
    if (cap < budget) { budget = cap; caps.push(`RAM trống ${ramFree} GB chỉ đủ ${Math.max(0, cap)} worker`); }
  }
  if (perf.profile === 'tuy-chinh' && Number.isInteger(perf.workers) && perf.workers < budget) { budget = perf.workers; caps.push(`tuỳ chỉnh ${perf.workers} worker`); }
  budget = Math.min(budget, MAX_WORKERS);
  if (budget < 2) return { ...off(`ngân sách worker < 2 (${caps.join(', ')}): render lần lượt`), budget: Math.max(0, budget) };
  const parallel = Math.min(N, budget, limit || Infinity);
  const maxEach = px > PX1080 ? 3 : MAX_WORKERS_EACH;
  let workersEach = Math.max(1, Math.min(maxEach, Math.floor(budget / parallel)));
  if (workersEach === 3) workersEach = 2; // M66 mục 4: NVENC + 3 đoạn → pts lệch ~0,33 ms sau concat
  return { parallel, workersEach, budget, why: `${parallel} bản cùng lúc × ${workersEach} worker (ngân sách ${budget} Chrome: ${caps.join(', ')})` };
}

// Một lô = một lượt render cả máy. slots 0 (AVS_RENDER_SLOTS=0 hay perf.slots 0) → không điều phối.
export async function holdBatchSlot({ perf = {}, info = {}, onWait = null, env = process.env, pollMs = 1000 } = {}) {
  const slot = await acquireRenderSlot({ slots: perf.slots ?? 1, onWait, pollMs, env, info: { batch: true, ...info } });
  return { release: slot.release, waited_s: slot.waited_s, childEnv: { AVS_RENDER_SLOTS: '0' } };
}
// Lượt render khác (không phải của tiến trình này) đang giữ chỗ.
export function otherRenders({ env = process.env, pid = process.pid } = {}) {
  try { return slotHolders({ env }).filter(h => h.pid !== pid).length; } catch { return 0; }
}

export async function runPool(items, parallel, fn) {
  const out = new Array(items.length);
  let next = 0;
  const lane = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(parallel | 0 || 1, items.length)) }, lane));
  return out;
}

export async function pipeline({ items, parallel = 1, build, render, onDone = () => {}, onError = () => {}, shouldStop = () => false }) {
  const safe = (f, ...a) => { try { f(...a); } catch (e) { console.error('[batch] ' + (e?.message || e)); } };
  const renders = new Set();
  let stopped = false;
  for (const it of items) {
    while (renders.size >= Math.max(1, parallel)) await Promise.race(renders);
    if (shouldStop()) { stopped = true; break; }
    let built;
    try { built = await build(it); } catch (e) { safe(onError, it, e); continue; }
    const t = Promise.resolve().then(() => render(it, built))
      .then(res => safe(onDone, it, res), e => safe(onError, it, e))
      .finally(() => renders.delete(t));
    renders.add(t);
  }
  await Promise.all(renders);
  return { stopped };
}
