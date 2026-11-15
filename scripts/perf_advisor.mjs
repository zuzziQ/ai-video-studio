// AI chọn profile hiệu năng (S08 · M68). Luật tất định sinh 2–4 ứng viên hợp lệ; LLM (qua llm.mjs, đúng lựa chọn
// Claude/Ollama của người dùng) chỉ CHỌN một ứng viên theo chỉ số và giải thích. LLM không đặt con số nào; lỗi, hết giờ
// hay trả rác → ứng viên đầu của luật, provider 'rules'. Không lưu gì: chỉ đề xuất (lưu bằng `perf.mjs set` / savePerf).
//
//   GOALS                         'nhanh' | 'song-song' (vừa render vừa làm việc khác) | 'chat-luong'
//   candidates({ hw, log, job, goal, load }) → [{ profile, overrides, workers, why, est }]   (2–4 phần tử, tất định)
//       hw: hwSnapshot(); log: readPerfLog(); job: { W, H, fps, sec, count }; load: { renders_running, cpu_busy_pct }
//       overrides: núm perf.custom (chỉ khác {} khi profile là 'tuy-chinh'); workers: số worker dự kiến (null = tự động)
//       est: { fps, sec, runs } trung vị fps của perf_log cùng profile (+ cùng worker với tuy-chinh) và cùng độ phân giải
//   advise({ goal, job, useLlm, timeout, hw?, log?, load?, run? }) → { profile, overrides, reason, provider, pick, candidates, llm_error? }
//   llmPayload({ hw, load, log, job, goal, cands }) → object gửi LLM (không đường dẫn, không chuỗi giống token)
import os from 'node:os';
import { PROFILES, ENCODER_CHOICES, X264_PRESETS, PRIORITIES, WHISPER_DEVICES, MAX_WORKERS, MAX_SLOTS, resolvePerf, hwSnapshot, readPerfLog, slotHolders } from './perf_profile.mjs';
import { askJSON, runLLM } from './llm.mjs';

export const GOALS = ['nhanh', 'song-song', 'chat-luong'];
export const GOAL_LABEL = { nhanh: 'xong nhanh nhất', 'song-song': 'vừa render vừa làm việc khác', 'chat-luong': 'file đẹp nhất' };
export const ADVISE_TIMEOUT_MS = 60e3;
const HW_ENC = new Set(['nvenc', 'qsv', 'videotoolbox']);
const LOW_RAM_GB = 6, GB_PER_WORKER_1080 = 0.7, RAM_RESERVE_GB = 1.5, BIG_BATCH = 5;

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const intIn = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
// job từ người gọi → chỉ số, kẹp vào giới hạn hợp lý.
export function cleanJob(job = {}) {
  const j = job && typeof job === 'object' && !Array.isArray(job) ? job : {};
  return { W: intIn(j.W, 64, 8192, 1080), H: intIn(j.H, 64, 8192, 1920), fps: intIn(j.fps, 1, 120, 30),
    sec: Math.min(36000, Math.max(0.1, num(j.sec, 30))), count: intIn(j.count, 1, 1000, 1) };
}
// Kẹp overrides vào đúng miền của perf.custom (cùng luật savePerf): núm lạ hoặc giá trị sai bị bỏ.
export function clampOverrides(o = {}) {
  const out = {};
  if (Number.isInteger(o.workers)) out.workers = Math.max(1, Math.min(MAX_WORKERS, o.workers));
  if (ENCODER_CHOICES.includes(o.encoder)) out.encoder = o.encoder;
  if (o.preset === null || X264_PRESETS.includes(o.preset)) out.preset = o.preset;
  if (PRIORITIES.includes(o.priority)) out.priority = o.priority;
  if (Number.isInteger(o.slots)) out.slots = Math.max(1, Math.min(MAX_SLOTS, o.slots));
  if (WHISPER_DEVICES.includes(o.whisperDevice)) out.whisperDevice = o.whisperDevice;
  return out;
}

// Số worker RAM trống còn chịu được (cùng ước lượng renderPlan: ~0,7 GB mỗi worker 1080p theo điểm ảnh, chừa 1,5 GB).
export function ramWorkerCap(freeGB, W = 1080, H = 1920) {
  const per = GB_PER_WORKER_1080 * (W * H) / (1080 * 1920);
  return Math.max(1, Math.floor((num(freeGB, 16) - RAM_RESERVE_GB) / per));
}
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r1 = x => Math.round(x * 10) / 10;
// Ước thời gian từ perf_log: trung vị fps của các lượt cùng profile, cùng W×H (tuy-chinh: thêm cùng số worker).
export function estimate(log, { profile, workers }, job) {
  const rows = (Array.isArray(log) ? log : []).filter(r => r && r.profile === profile && r.W === job.W && r.H === job.H && num(r.fps, 0) > 0
    && (profile !== 'tuy-chinh' || workers == null || r.workers === workers));
  if (!rows.length) return null;
  const fps = median(rows.map(r => r.fps)), frames = Math.round(job.sec * job.fps) * job.count;
  return { fps: r1(fps), sec: r1(frames / fps), runs: rows.length };
}

function effWorkers(profile, overrides, hw) {
  return resolvePerf({ profile, perf: { profile, custom: overrides }, hw: { physical: hw?.cores?.physical || 1 }, env: {}, job: {} }).workers;
}

/**
 * Luật tất định → 2–4 ứng viên khác nhau, ứng viên đầu là đề xuất của luật.
 */
export function candidates({ hw = {}, log = [], job = {}, goal = 'nhanh', load = {} } = {}) {
  const j = cleanJob(job), g = GOALS.includes(goal) ? goal : 'nhanh';
  const phys = Math.max(1, hw?.cores?.physical || 1), freeGB = num(hw?.ram?.free_gb, 16);
  // encoder đã dò (hwSnapshot) thắng; không dò được thì có GPU NVIDIA coi như có NVENC
  const hwEnc = hw?.encoder ? HW_ENC.has(hw.encoder.final) : Array.isArray(hw?.gpu) && hw.gpu.length > 0;
  const cap = ramWorkerCap(freeGB, j.W, j.H), lowRam = freeGB < LOW_RAM_GB;
  const busy = num(load?.renders_running, 0) > 0, cpuBusy = num(load?.cpu_busy_pct, 0) >= 60;
  const out = [];
  const add = (profile, overrides, why) => {
    const ov = profile === 'tuy-chinh' ? clampOverrides(overrides) : {};
    const key = profile + JSON.stringify(ov);
    if (out.some(c => c.key === key)) return;
    out.push({ key, profile, overrides: ov, why });
  };
  // Ứng viên profile có sẵn, nhưng hạ worker khi RAM trống không đủ cho số worker của profile.
  const fit = (profile, why) => {
    const w = effWorkers(profile, {}, hw);
    if (lowRam && w != null && w > cap) {
      const base = PROFILES[profile];
      return add('tuy-chinh', { workers: cap, encoder: base.encoder, preset: base.preset, priority: base.priority, slots: base.slots },
        `${why}; RAM trống ${freeGB} GB (< ${LOW_RAM_GB} GB) chỉ đủ ${cap} worker nên hạ từ ${w}`);
    }
    if (lowRam && w == null) {
      return add('tuy-chinh', { workers: Math.min(cap, Math.max(1, phys - 1)), encoder: PROFILES[profile].encoder, preset: PROFILES[profile].preset, priority: PROFILES[profile].priority, slots: 1 },
        `${why}; RAM trống ${freeGB} GB (< ${LOW_RAM_GB} GB) nên giữ tối đa ${Math.min(cap, Math.max(1, phys - 1))} worker`);
    }
    return add(profile, {}, why);
  };
  const noGpu = () => { const w = Math.max(1, Math.min(cap, phys - 1, 5));
    add('tuy-chinh', { workers: w, encoder: 'x264', preset: 'veryfast', priority: 'normal', slots: 1 },
      `không thấy encoder phần cứng (NVENC/QSV): x264 veryfast, ${w} worker${w < Math.min(phys - 1, 5) ? ` (RAM trống ${freeGB} GB chỉ đủ ${cap})` : ' (nhân thật − 1)'}`); };

  if (g === 'nhanh') {
    if (!hwEnc) noGpu();
    fit('toc-do', j.count >= BIG_BATCH ? `lô ${j.count} video: chạy hết nhân (nhân thật − 1, tối đa 5)` : 'nhanh nhất: worker = nhân thật − 1 (tối đa 5)');
    fit('can-bang', 'mặc định: tự chọn theo nhân, GPU và RAM, máy đỡ nặng hơn tốc độ');
    if (busy || cpuBusy) fit('tiet-kiem', busy ? 'đang có lượt render khác: 2 worker, ưu tiên thấp để không giành máy' : 'CPU đang bận: 2 worker, ưu tiên thấp');
  } else if (g === 'song-song') {
    fit('tiet-kiem', 'vừa làm việc khác: 2 worker, ưu tiên thấp, máy vẫn mượt');
    add('tuy-chinh', { workers: Math.max(1, Math.min(cap, Math.floor(phys / 2))), encoder: 'auto', preset: null, priority: 'below_normal', slots: 1 },
      `nửa số nhân thật (${Math.max(1, Math.min(cap, Math.floor(phys / 2)))} worker), ưu tiên thấp: nhanh hơn tiết kiệm, vẫn chừa máy`);
    fit('can-bang', 'mặc định: nhanh hơn nhưng máy nặng hơn khi render');
  } else {
    fit('chat-luong', 'file đẹp nhất: x264 medium cho mọi đoạn, chậm hơn');
    if (hwEnc) fit('can-bang', 'encoder phần cứng: nhanh hơn nhiều, chất lượng thấp hơn x264 medium một chút');
    else add('tuy-chinh', { workers: Math.max(1, Math.min(cap, phys - 1, 5)), encoder: 'x264', preset: 'slow', priority: 'normal', slots: 1 }, 'x264 slow: đẹp hơn medium, chậm hơn nữa');
    if (lowRam || busy) fit('tiet-kiem', 'máy đang thiếu RAM hoặc bận: 2 worker, ưu tiên thấp');
  }
  // Tối thiểu 2 ứng viên.
  for (const p of ['can-bang', 'tiet-kiem']) if (out.length < 2) fit(p, p === 'can-bang' ? 'mặc định: tự chọn theo nhân, GPU và RAM' : '2 worker, ưu tiên thấp');
  return out.slice(0, 4).map(({ key, ...c }) => {
    const workers = effWorkers(c.profile, c.overrides, hw);
    return { ...c, workers, est: estimate(log, { profile: c.profile, workers }, j) };
  });
}

// ---------- gói gửi LLM ----------
const PATHY = /[\\/]|^[a-z]:|\.(exe|cmd|json|mjs|py)$/i;
const TOKENY = /\b(sk-|ghp_|gho_|xox[bap]-|eyJ)|[A-Za-z0-9_\-]{32,}/;
const safeStr = s => typeof s === 'string' && s.length <= 80 && !PATHY.test(s) && !TOKENY.test(s);
// Chỉ giữ số, bool, null và chuỗi ngắn không giống đường dẫn hay token (phòng khi nguồn đổi về sau).
export function scrub(v, depth = 0) {
  if (depth > 6) return null;
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return safeStr(v) ? v : undefined;
  if (Array.isArray(v)) return v.map(x => scrub(x, depth + 1)).filter(x => x !== undefined);
  if (typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) { if (!safeStr(k) || /token|key|secret|pass|path|dir|file|url/i.test(k)) continue; const y = scrub(x, depth + 1); if (y !== undefined) o[k] = y; }
    return o;
  }
  return undefined;
}
export function llmPayload({ hw = {}, load = {}, log = [], job = {}, goal, cands = [] }) {
  const LOG_KEYS = ['profile', 'W', 'H', 'frames', 'workers', 'encoder', 'chrome', 'sec', 'fps', 'waited_s'];
  return scrub({
    goal, goal_meaning: GOAL_LABEL[goal],
    hw: { cores: hw.cores, ram: hw.ram, gpu: (hw.gpu || []).map(g => ({ name: g.name, vram_mb: g.vram_mb, vram_free_mb: g.vram_free_mb })),
      chrome: hw.chrome && { mode: hw.chrome.mode, headless_shell: hw.chrome.headless_shell }, encoder: hw.encoder && { final: hw.encoder.final, segment: hw.encoder.segment } },
    load: { renders_running: load.renders_running, cpu_busy_pct: load.cpu_busy_pct },
    perf_log: (Array.isArray(log) ? log : []).slice(-20).map(r => Object.fromEntries(LOG_KEYS.filter(k => r && r[k] !== undefined).map(k => [k, r[k]]))),
    job: cleanJob(job),
    candidates: cands.map((c, i) => ({ index: i, profile: c.profile, overrides: c.overrides, workers: c.workers, why: c.why, est: c.est })),
  });
}
export function buildPrompt(payload) {
  return [
    'Bạn tư vấn cấu hình render video cho một máy tính. Dữ liệu (JSON) gồm phần cứng, tải hiện tại, các lượt render gần đây (perf_log),',
    'việc sắp làm (job), mục tiêu của người dùng (goal) và danh sách ứng viên hợp lệ đã được luật tính sẵn.',
    'Chỉ được CHỌN một ứng viên theo "index"; không tự đặt cấu hình hay con số mới.',
    'Trả về DUY NHẤT JSON: {"pick": <index>, "reason": "<tiếng Việt, tối đa 2 câu, vì sao hợp mục tiêu trên máy này>"}',
    '', JSON.stringify(payload),
  ].join('\n');
}

// Lý do từ LLM → chuỗi một dòng, tối đa 2 câu / 300 ký tự.
export function cleanReason(s) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const sentences = t.match(/[^.!?。]+[.!?。]?/g) || [t];
  const two = sentences.slice(0, 2).join('').trim();
  return two.length > 300 ? two.slice(0, 297).trimEnd() + '…' : two;
}

// Tải hiện tại: số lượt render đang giữ chỗ + % CPU bận đo trong ~300 ms.
export async function currentLoad({ ms = 300 } = {}) {
  const snap = () => os.cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); return { idle: a.idle + c.times.idle, total: a.total + t }; }, { idle: 0, total: 0 });
  const a = snap(); await new Promise(r => setTimeout(r, ms)); const b = snap();
  const busy = b.total > a.total ? Math.round(100 * (1 - (b.idle - a.idle) / (b.total - a.total))) : null;
  let renders = 0; try { renders = slotHolders().length; } catch { /* không đọc được file chỗ */ }
  return { renders_running: renders, cpu_busy_pct: busy };
}

/**
 * Đề xuất profile. Không ghi gì.
 *  useLlm   false → chỉ luật (provider 'rules')
 *  timeout  ms cho cả lượt hỏi LLM (mặc định và tối đa 60 s)
 *  hw/log/load  dữ liệu đã đo sẵn (test, route); run: lời gọi nhà cung cấp (mặc định runLLM; test cắm vào đây)
 */
export async function advise({ goal = 'nhanh', job = {}, useLlm = true, timeout = ADVISE_TIMEOUT_MS, hw, log, load, run = runLLM, model = 'sonnet' } = {}) {
  if (!GOALS.includes(goal)) throw Object.assign(new Error('goal phải là: ' + GOALS.join(', ')), { status: 400 });
  hw ??= hwSnapshot();
  log ??= readPerfLog({ n: 20 });
  load ??= await currentLoad();
  const cands = candidates({ hw, log, job, goal, load });
  const pickOf = (i, reason, provider, extra = {}) => ({ profile: cands[i].profile, overrides: cands[i].overrides, reason, provider, pick: i, candidates: cands, ...extra });
  const rules = (extra = {}) => pickOf(0, cands[0].why[0].toUpperCase() + cands[0].why.slice(1) + '.', 'rules', extra);
  if (!useLlm) return rules();

  const ms = Math.max(1000, Math.min(ADVISE_TIMEOUT_MS, +timeout || ADVISE_TIMEOUT_MS));
  let provider = 'claude', proc = null, timer = null;
  const prompt = buildPrompt(llmPayload({ hw, load, log, job, goal, cands }));
  try {
    const ask = askJSON(prompt, {
      task: 'text', model, shape: 'object', retries: 0, timeout: ms, cwd: os.tmpdir(), onProc: p => { proc = p; },
      run: async (p, o) => { const r = await run(p, o); provider = r?.provider || provider; return r; },
      validate: v => {
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('không phải object');
        const i = typeof v.pick === 'string' && /^\d+$/.test(v.pick.trim()) ? +v.pick : v.pick;
        return { pick: Number.isInteger(i) && i >= 0 && i < cands.length ? i : null, reason: cleanReason(v.reason) };
      },
    });
    const guard = new Promise((_, bad) => { timer = setTimeout(() => { try { proc?.kill?.(); } catch { /* đã thoát */ } bad(Object.assign(new Error(`LLM quá ${Math.round(ms / 1000)} giây`), { kind: 'timeout' })); }, ms + 2000); });
    ask.catch(() => {}); // thua cuộc đua với guard: lỗi về sau không thành unhandled rejection
    const v = await Promise.race([ask, guard]);
    if (v.pick === null) return rules({ llm_error: 'LLM chọn chỉ số không hợp lệ' });
    return pickOf(v.pick, v.reason || cands[v.pick].why, provider);
  } catch (e) {
    return rules({ llm_error: String(e?.message || e).slice(0, 200) });
  } finally { if (timer) clearTimeout(timer); }
}
