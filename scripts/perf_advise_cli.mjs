// CLI AI chọn profile hiệu năng (M68). Spec: scripts/perf_advisor.mjs, references/perf-profile.md.
// usage:
//   node scripts/perf_advise_cli.mjs [--goal nhanh|song-song|chat-luong] [--no-llm] [--json]
//        [--W 1080 --H 1920 --fps 30 --sec 30 --count 1]       việc sắp render (mặc định 1080×1920, 30 s, 1 video)
// Chỉ đề xuất, không lưu. Lưu: node scripts/perf.mjs set <profile> [--workers …] (với tuy-chinh).
import { advise, GOALS } from './perf_advisor.mjs';
import { PROFILES } from './perf_profile.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const die = m => { console.error(m); process.exit(2); };
const goal = opt('--goal', 'nhanh');
if (!GOALS.includes(goal)) die('--goal phải là: ' + GOALS.join(', '));
const job = {};
for (const k of ['W', 'H', 'fps', 'sec', 'count']) { const v = opt('--' + k); if (v !== undefined) { if (!Number.isFinite(+v)) die(`--${k} phải là số`); job[k] = +v; } }

const setCmd = r => {
  const o = r.overrides, flags = [];
  if (r.profile === 'tuy-chinh') {
    if ('workers' in o) flags.push('--workers', o.workers ?? 'auto');
    if ('encoder' in o) flags.push('--encoder', o.encoder);
    if ('preset' in o) flags.push('--preset', o.preset ?? 'auto');
    if ('priority' in o) flags.push('--priority', o.priority);
    if ('slots' in o) flags.push('--slots', o.slots);
    if ('whisperDevice' in o) flags.push('--whisper', o.whisperDevice);
  }
  return ['node scripts/perf.mjs set', r.profile, ...flags].join(' ');
};

const t0 = Date.now();
const r = await advise({ goal, job, useLlm: !args.includes('--no-llm') });
const out = { ...r, set_command: setCmd(r), sec: Math.round((Date.now() - t0) / 100) / 10 };
if (args.includes('--json')) console.log(JSON.stringify(out, null, 1));
else {
  const who = { claude: 'Claude chọn', ollama: 'Ollama chọn', rules: 'Luật chọn' }[r.provider] || r.provider;
  console.log(`Mục tiêu: ${goal}. ${who} (${out.sec} s): ${r.profile} (${PROFILES[r.profile]?.label || r.profile})${Object.keys(r.overrides).length ? ' ' + JSON.stringify(r.overrides) : ''}`);
  console.log(`Lý do: ${r.reason}`);
  if (r.llm_error) console.log(`(Không dùng được LLM: ${r.llm_error})`);
  console.log('Ứng viên:');
  r.candidates.forEach((c, i) => console.log(`  ${i === r.pick ? '→' : ' '} [${i}] ${c.profile}${Object.keys(c.overrides).length ? ' ' + JSON.stringify(c.overrides) : ''}  worker ${c.workers ?? 'tự động'}${c.est ? `  ~${c.est.sec} s (${c.est.fps} fps, ${c.est.runs} lượt đo)` : ''}  — ${c.why}`));
  console.log(`Áp dụng: ${out.set_command}`);
}
