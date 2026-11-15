// Hiệu năng (S08 · M67): panel chọn profile hiệu năng (scripts/perf_profile.mjs, M64) trong Studio.
//   GET  /api/perf                    profile đang lưu + custom, danh sách profile (nhãn + mô tả tiếng Việt), máy này (hwSnapshot,
//                                     không đường dẫn), kế hoạch render 720p/1080p/4k theo profile, biến môi trường đang ghi đè
//                                     (chỉ tên + có/không)
//   POST /api/perf {profile?, custom?} kiểm kiểu bằng các hằng của perf_profile.mjs, sai → 400 {error}; ghi bằng savePerf
//   GET  /api/perf/log?n=20           readPerfLog (mới nhất cuối)
//   POST /api/perf/bench {profiles?}  job "Đo thử": render 10 s của bản chép tạm sample/clip-mau với 1–3 profile (mỗi lượt
//                                     render.mjs --profile), kết quả ở job.bench của GET /api/job; huỷ bằng /api/job/cancel
// Chỉ xử lý đúng ba đường dẫn trên: mọi đường dẫn khác dưới /api/perf/ (vd /api/perf/advise của 31_perfai.mjs, M68) trả false
// để route sau xử lý.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MINE = new Set(['/api/perf', '/api/perf/log', '/api/perf/bench']);
// Biến môi trường thắng profile (references/perf-profile.md). Chỉ đưa ra tên + có/không, không đưa giá trị.
export const PERF_ENV = ['AVS_PERF_PROFILE', 'AVS_ENCODER', 'AVS_WHISPER_DEVICE', 'AVS_RENDER_SLOTS', 'AVS_RENDER_PRIORITY', 'AVS_RENDER_GPU', 'AVS_BATCH_PARALLEL'];
export const BENCH_SEC = 10, BENCH_MAX = 3, BENCH_DEFAULT = ['tiet-kiem', 'can-bang', 'toc-do'];
const QUAL = [['720', 720, 1280], ['1080', 1080, 1920], ['4k', 2160, 3840]];
const HW_TTL_MS = 30e3;
const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);

// Kiểm body của POST /api/perf bằng hằng của perf_profile.mjs → { profile?, custom? } đã sạch, hoặc ném 400.
export function checkPerfBody(b, M) {
  if (!isObj(b)) throw bad('Body phải là object {profile, custom?}');
  for (const k of Object.keys(b)) if (k !== 'profile' && k !== 'custom') throw bad(`Không có trường "${k}" (chỉ nhận profile, custom)`);
  if (b.profile === undefined && b.custom === undefined) throw bad('Cần profile hoặc custom');
  const out = {};
  if (b.profile !== undefined) {
    if (typeof b.profile !== 'string' || !Object.hasOwn(M.PROFILES, b.profile)) throw bad('profile phải là: ' + Object.keys(M.PROFILES).join(', '));
    out.profile = b.profile;
  }
  if (b.custom !== undefined) {
    if (!isObj(b.custom)) throw bad('custom phải là object');
    const c = {}, int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    const rule = {
      workers: v => v === null || int(v, 1, M.MAX_WORKERS) || `workers phải là số nguyên 1–${M.MAX_WORKERS} hoặc null (tự động)`,
      encoder: v => M.ENCODER_CHOICES.includes(v) || 'encoder phải là: ' + M.ENCODER_CHOICES.join(', '),
      preset: v => v === null || M.X264_PRESETS.includes(v) || 'preset phải là null (mặc định) hoặc: ' + M.X264_PRESETS.join(', '),
      priority: v => M.PRIORITIES.includes(v) || 'priority phải là: ' + M.PRIORITIES.join(', '),
      slots: v => int(v, 1, M.MAX_SLOTS) || `slots phải là số nguyên 1–${M.MAX_SLOTS}`,
      whisperDevice: v => M.WHISPER_DEVICES.includes(v) || 'whisperDevice phải là: ' + M.WHISPER_DEVICES.join(', '),
    };
    for (const [k, v] of Object.entries(b.custom)) {
      if (!Object.hasOwn(rule, k)) throw bad(`Không có núm "${k}" (núm: ${Object.keys(rule).join(', ')})`);
      const r = rule[k](v);
      if (r !== true) throw bad(r);
      c[k] = v;
    }
    out.custom = c;
  }
  return out;
}
// Danh sách profile cho UI: nhãn + mô tả + núm (đã bỏ trường nội bộ).
export const profileList = M => Object.entries(M.PROFILES).map(([id, p]) => ({ id, label: p.label, hint: p.hint, workers: p.workers, maxWorkers: p.maxWorkers ?? null,
  encoder: p.encoder, preset: p.preset, priority: p.priority, slots: p.slots, whisperDevice: p.whisperDevice }));
// hwSnapshot chỉ có tên/số; giữ đúng các trường đã biết để không lỡ đưa ra trường mới có đường dẫn.
const cleanHw = h => ({
  cores: { physical: h.cores?.physical ?? null, logical: h.cores?.logical ?? null },
  ram: { total_gb: h.ram?.total_gb ?? null, free_gb: h.ram?.free_gb ?? null },
  gpu: (h.gpu || []).slice(0, 4).map(g => ({ name: String(g.name || '').slice(0, 80), vram_mb: g.vram_mb ?? null, vram_free_mb: g.vram_free_mb ?? null, driver: String(g.driver || '').slice(0, 30) })),
  chrome: { mode: h.chrome?.mode === 'gpu' ? 'gpu' : 'swiftshader', headless_shell: !!h.chrome?.headless_shell, novsync: !!h.chrome?.novsync },
  encoder: h.encoder ? { want: h.encoder.want ?? null, final: h.encoder.final ?? null, segment: h.encoder.segment ?? null } : null,
});
const planView = p => ({ W: p.W, H: p.H, workers: p.workers, threads: p.threads ?? null, preset: p.preset ?? null, encoder: p.encoder, priority: p.priority, slots: p.slots, ...(p.ramCap ? { ramCap: p.ramCap } : {}) });

export default ctx => {
  let M = null, hwCache = { at: 0, v: null, fresh: null };
  const mod = async () => (M ||= await import(pathToFileURL(path.join(ctx.SKILL, 'scripts/perf_profile.mjs')).href));
  // nvidia-smi + dò encoder mất vài giây: giữ 30 s, ?fresh=1 đo lại.
  function hw(force) {
    if (!force && hwCache.v && Date.now() - hwCache.at < HW_TTL_MS) return hwCache.v;
    hwCache = { at: Date.now(), v: cleanHw(M.hwSnapshot()) };
    return hwCache.v;
  }
  function view(force) {
    const env = process.env, h = hw(force), saved = M.loadPerf(), r = M.resolvePerf({ hw: { physical: h.cores.physical } });
    const plans = {};
    for (const [k, W, H] of QUAL) plans[k] = planView(M.planFor({ W, H, fps: 30, sec: 30, perf: r, hw: h }));
    return {
      profile: saved.profile, custom: saved.custom, active: r.profile, resolved: { workers: r.workers, encoder: r.encoder, preset: r.preset, priority: r.priority, slots: r.slots, whisperDevice: r.whisperDevice, from: r.from },
      profiles: profileList(M), choices: { encoder: M.ENCODER_CHOICES, preset: M.X264_PRESETS, priority: M.PRIORITIES, whisperDevice: M.WHISPER_DEVICES, maxWorkers: M.MAX_WORKERS, maxSlots: M.MAX_SLOTS },
      hw: h, plans, env: Object.fromEntries(PERF_ENV.map(k => [k, String(env[k] ?? '').trim() !== ''])),
    };
  }

  // Job "Đo thử": chép sample/clip-mau vào thư mục tạm, tách 10 s khung hình từ work/aroll.mp4, render từng profile, dọn.
  async function bench({ profiles }) {
    const job = ctx.job, src = path.join(ctx.SKILL, 'sample/clip-mau');
    job.bench = profiles.map(id => ({ profile: id, label: M.PROFILES[id].label, state: 'chờ' }));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-bench-'));
    try {
      job.step = 'Chép dự án mẫu';
      fs.cpSync(src, tmp, { recursive: true, filter: f => !/[\\/]out([\\/]|$)/.test(f.slice(src.length)) });
      const tlFile = path.join(tmp, 'timeline.json'), tl = JSON.parse(fs.readFileSync(tlFile, 'utf8'));
      const W = tl.width || 1080, H = tl.height || 1920, fps = tl.fps || 30, frames = path.join(tmp, 'work/frames');
      fs.mkdirSync(frames, { recursive: true });
      job.step = 'Tách khung hình mẫu';
      await ctx.run('ffmpeg', ['-v', 'error', '-y', '-t', String(BENCH_SEC + 0.5), '-i', path.join(tmp, 'work/aroll.mp4'),
        '-vf', `fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`, '-q:v', '3', path.join(frames, '%05d.jpg')]);
      for (const [i, row] of job.bench.entries()) {
        if (job.cancelled) throw Object.assign(new Error('Đã huỷ theo yêu cầu'), { stopped: 'cancelled' });
        job.step = `Đo ${row.label} (${i + 1}/${profiles.length})`; row.state = 'đang đo';
        const out = path.join(tmp, `bench_${row.profile}.mp4`), t0 = Date.now(), since = new Date(t0).toISOString();
        await ctx.run('node', [path.join(ctx.SKILL, 'scripts/render.mjs'), tlFile, out, '--profile', row.profile, '--to', String(BENCH_SEC)], l => {
          if (/^Đang chờ lượt render/.test(l)) { job.step = `${row.label}: đang chờ lượt render khác…`; return; }
          const m = /([\d.]+)s \/ ([\d.]+)s/.exec(l);
          if (m) job.progress = Math.min(0.99, (i + Math.min(1, +m[1] / BENCH_SEC)) / profiles.length);
        });
        const wall = +((Date.now() - t0) / 1000).toFixed(1);
        const log = M.readPerfLog({ n: 5 }).reverse().find(e => e.profile === row.profile && String(e.at) >= since);
        Object.assign(row, { state: 'xong', wall_s: wall, sec: log?.sec ?? wall, fps: log?.fps ?? +(BENCH_SEC * fps / wall).toFixed(1),
          workers: log?.workers ?? null, encoder: log?.encoder ?? null, chrome: log?.chrome ?? null, waited_s: log?.waited_s ?? 0 });
        fs.rmSync(out, { force: true });
      }
      job.step = 'Xong';
    } catch (e) {
      for (const r of job.bench) if (r.state !== 'xong') r.state = job.cancelled ? 'đã huỷ' : 'lỗi';
      throw e;
    } finally {
      // Windows giữ khoá file vài trăm ms sau khi tiến trình bị giết: thử lại khi xoá.
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
    }
  }

  return async (req, res, p, u) => {
    if (!MINE.has(p)) return false;
    await mod();
    if (p === '/api/perf' && req.method === 'GET') { ctx.json(res, view(u?.searchParams?.get('fresh') === '1')); return true; }
    if (p === '/api/perf' && req.method === 'POST') {
      const clean = checkPerfBody(await ctx.body(req), M);
      try { M.savePerf(clean); } catch (e) { throw bad(e.message, e.status || 500); }
      ctx.json(res, view(false)); return true;
    }
    if (p === '/api/perf/log' && req.method === 'GET') {
      const n = Math.max(1, Math.min(500, Math.floor(+(u?.searchParams?.get('n') ?? 20)) || 20));
      ctx.json(res, M.readPerfLog({ n })); return true;
    }
    if (p === '/api/perf/bench' && req.method === 'POST') {
      const b = await ctx.body(req);
      if (!isObj(b)) throw bad('Body phải là object {profiles?}');
      let list = b.profiles ?? BENCH_DEFAULT;
      if (!Array.isArray(list) || list.length < 1 || list.length > BENCH_MAX) throw bad(`profiles phải là danh sách 1–${BENCH_MAX} profile`);
      for (const id of list) if (typeof id !== 'string' || !Object.hasOwn(M.PROFILES, id)) throw bad('profile phải là: ' + Object.keys(M.PROFILES).join(', '));
      list = [...new Set(list)];
      if (!fs.existsSync(path.join(ctx.SKILL, 'sample/clip-mau/work/aroll.mp4'))) throw bad('Thiếu dự án mẫu sample/clip-mau', 500);
      const ok = ctx.startJob('perf-bench', bench, { profiles: list });
      ctx.json(res, ok ? { ok, profiles: list } : { ok, error: 'Đang có tác vụ khác chạy' }, ok ? 200 : 409); return true;
    }
    return false;
  };
};
