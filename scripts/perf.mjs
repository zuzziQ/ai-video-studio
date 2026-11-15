// CLI profile hiệu năng (M64). Spec: scripts/perf_profile.mjs.
// usage:
//   node scripts/perf.mjs doctor [--json]          máy này + profile hiện tại + kế hoạch render 1080p 30 s
//   node scripts/perf.mjs set <profile>            tiet-kiem | can-bang | toc-do | chat-luong | tuy-chinh
//        [--workers N|auto] [--encoder E] [--preset P|auto] [--priority normal|below_normal] [--slots N] [--whisper auto|cuda|cpu]
//                                                  (các núm chỉ dùng khi profile là tuy-chinh)
//   node scripts/perf.mjs log [--n 20] [--json]    các lượt render gần nhất ($AVS_HOME/perf_log.jsonl)
import { PROFILES, loadPerf, savePerf, resolvePerf, hwSnapshot, planFor, readPerfLog, slotHolders } from './perf_profile.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
const asJson = rest.includes('--json');
const die = m => { console.error(m); process.exit(2); };

if (cmd === 'doctor') {
  const perf = resolvePerf(), hw = hwSnapshot({ env: { ...process.env, AVS_ENCODER: perf.encoder } }); // encoder theo profile
  const out = { hw, config: loadPerf(), perf, plan_1080p: planFor({ perf, hw }), render_slots: slotHolders().map(({ pid, at, W, H }) => ({ pid, at, W, H })) };
  if (asJson) console.log(JSON.stringify(out, null, 1));
  else {
    const g = hw.gpu[0];
    console.log(`Máy: ${hw.cores.physical} nhân / ${hw.cores.logical} luồng, RAM ${hw.ram.free_gb}/${hw.ram.total_gb} GB trống, GPU ${g ? `${g.name} ${g.vram_free_mb}/${g.vram_mb} MB (driver ${g.driver})` : 'không thấy NVIDIA'}`);
    console.log(`Chrome: ${hw.chrome.mode}${hw.chrome.headless_shell ? ' + headless-shell' : ''}; encoder: ${hw.encoder ? `${hw.encoder.final} (bản cuối), ${hw.encoder.segment} (đoạn)` : '?'}`);
    console.log(`Profile: ${perf.profile} (${PROFILES[perf.profile].label}) → workers ${perf.workers ?? 'tự động'}, encoder ${perf.encoder}, preset ${perf.preset ?? 'mặc định'}, ưu tiên ${perf.priority}, ${perf.slots || 'không giới hạn'} lượt render cùng lúc, whisper ${perf.whisperDevice}`);
    const p = out.plan_1080p;
    console.log(`Render 1080p 30 s: ${p.workers} worker, preset ${p.preset}${p.ramCap ? ` (RAM thấp, hạ từ ${p.ramCap})` : ''}`);
    if (out.render_slots.length) console.log(`Đang render: ${out.render_slots.length} lượt`);
  }
} else if (cmd === 'set') {
  const profile = rest[0];
  if (!profile || !Object.hasOwn(PROFILES, profile)) die('Chọn profile: ' + Object.keys(PROFILES).join(', '));
  const custom = {};
  const num = v => (v === 'auto' ? null : /^\d+$/.test(String(v)) ? +v : v);
  for (const [flag, key, conv] of [['--workers', 'workers', num], ['--encoder', 'encoder', String], ['--preset', 'preset', v => (v === 'auto' ? null : v)],
    ['--priority', 'priority', String], ['--slots', 'slots', num], ['--whisper', 'whisperDevice', String]]) {
    const v = opt(flag);
    if (v !== undefined) custom[key] = conv(v);
  }
  try {
    const r = savePerf({ profile, ...(Object.keys(custom).length ? { custom } : {}) });
    console.log(asJson ? JSON.stringify(r) : `Đã chọn profile ${r.profile} (${PROFILES[r.profile].label})`);
  } catch (e) { die(e.message); }
} else if (cmd === 'log') {
  const rows = readPerfLog({ n: Math.max(1, parseInt(opt('--n', '20'), 10) || 20) });
  if (asJson) console.log(JSON.stringify(rows, null, 1));
  else if (!rows.length) console.log('Chưa có lượt render nào trong perf_log.jsonl');
  else for (const r of rows) console.log(`${r.at}  ${r.profile}  ${r.W}x${r.H}  ${r.frames} khung  ${r.workers}w  ${r.encoder}  ${r.chrome}  ${r.sec}s  ${r.fps} fps${r.waited_s ? `  chờ ${r.waited_s}s` : ''}`);
} else {
  die('usage: node scripts/perf.mjs doctor [--json] | set <profile> [--workers N] … | log [--n 20] [--json]');
}
