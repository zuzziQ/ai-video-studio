// S13 · M105: QC nhanh sau "AI dựng giúp" — không gọi Claude, không trộn âm thanh. Một Chrome headless render các khung mẫu
// của QC (domPass), đo graphic che mặt đang nói, đè phụ đề, chữ ngoài khung / vùng an toàn, cộng khoảng trống dài trên timeline.
// Ba khung ở `times` được giữ lại làm ảnh cho hộp "Đã dựng xong". `--fix`: bộ giải của QC (applyDeterministic) dời / thu nhỏ
// graphic, lấp khoảng trống bằng chữ nhấn, đo lại (≤ 3 vòng), ghi timeline.json (có bản lịch sử). QC đầy đủ vẫn ở bước Kiểm tra.
//   node scripts/qc_quick.mjs <project_dir | timeline.json> [--times 1.2,5,9.4] [--fix]
// Ghi <project>/.studio/qc_quick.json {issues, stills, before, fixed, ms}; ảnh ở .studio/qc_quick/. Tiến độ "@@ <0..1> <bước>".
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { rmSync } from './fs_rm.mjs';
import { pathToFileURL } from 'node:url';
import { loadProject, saveProject, openEngine, domPass, domIssues, staticIssues, sampleTimes, applyDeterministic, isBase, qcKey, same, KIND_VI } from './ai_qc.mjs';
import { qcHash } from './export_gate.mjs';

const r2 = v => Math.round(v * 100) / 100;
const deep = o => JSON.parse(JSON.stringify(o));
// kiểm hình học của QC nhanh; mọi loại đều sửa được bằng applyDeterministic. S13 · M106: thêm thẻ trống và số không có trong
// lời thoại (ẩn khi graphic do máy tạo; graphic người dùng đặt chỉ được đánh dấu). S13 · M111: emoji cờ (bỏ khỏi chữ graphic)
export const QUICK = new Set(['face_cover', 'caption_overlap', 'text_unsafe', 'text_offcanvas', 'empty', 'empty_card', 'invented_number', 'emoji_flag']);

// Ba thời điểm cho ba ô ảnh: đầu, giữa, cuối các graphic AI (không có thì mọi graphic), lúc graphic đã hiện hẳn.
export function pickTimes(tl) {
  const over = (tl.scenes || []).filter(s => !s.hidden && !isBase(s, tl) && s.t1 > s.t0);
  const ai = over.filter(s => s._ai), sc = (ai.length ? ai : over).sort((a, b) => a.t0 - b.t0);
  const pick = sc.length >= 3 ? [sc[0], sc[Math.floor(sc.length / 2)], sc[sc.length - 1]] : sc;
  const ts = pick.map(s => r2(Math.min(s.t1 - .05, s.t0 + Math.min(1, (s.t1 - s.t0) * .5))));
  const D = tl.duration || 0;
  for (const k of [.2, .5, .8]) if (ts.length < 3 && D > 0) ts.push(r2(D * k));
  return ts.slice(0, 3).sort((a, b) => a - b);
}

// P = kết quả domPass (samples có hộp phần tử, phụ đề, mặt). Trả lỗi đã sắp theo thời gian, mỗi lỗi có key ổn định (qcKey).
export function quickIssues(tl, caps, P, dir) {
  const stat = staticIssues(tl, caps, dir).filter(i => QUICK.has(i.kind));
  const dom = domIssues(tl, caps, P).filter(i => QUICK.has(i.kind));
  return [...stat, ...dom].map(i => ({ ...i, src: 'auto' })).sort((a, b) => a.t - b.t);
}

// Một vòng sửa trên timeline trong bộ nhớ: trả số lỗi bộ giải nhận sửa. Cảnh người dùng đã chỉnh (_orig) hoặc có keyframe riêng
// được applyDeterministic để nguyên; lỗi đó còn trong danh sách sau khi đo lại.
export function quickFixRound(tl, caps, issues, P) {
  return applyDeterministic(tl, caps, issues.filter(i => QUICK.has(i.kind)), P, new Set()).size;
}

const view = i => ({ t: i.t, t1: i.t1, kind: i.kind, kind_vi: KIND_VI[i.kind] || i.kind, severity: i.severity, msg: i.msg, target: i.target || undefined, key: qcKey(i), note: i.note || undefined });

export async function quickQC(src, { times, fix = false, onP } = {}) {
  const T0 = Date.now(), proj = loadProject(src), { dir } = proj;
  let { tl, caps } = proj;
  const ts = (Array.isArray(times) && times.length ? times : pickTimes(tl)).map(Number).filter(t => t >= 0 && t < (tl.duration || 0)).slice(0, 3);
  const outDir = path.join(dir, '.studio/qc_quick'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-qcq-'));
  const say = (k, s) => onP && onP(Math.min(1, k), s);
  let E = null, P, issues, first, rounds = 0, changed = false;
  try {
    E = await openEngine(dir);
    const pass = async (tag, a, b) => domPass(E, tl, caps, sampleTimes(tl, caps, ts), tmp, tag, k => say(a + (b - a) * k, fix ? `Sửa và đo lại… ${Math.round(k * 100)}%` : `Render & đo khung hình… ${Math.round(k * 100)}%`));
    say(.02, 'Render khung hình kiểm tra (1 Chrome)');
    P = await pass('q0', .02, fix ? .3 : .95);
    issues = first = quickIssues(tl, caps, P, dir);
    if (fix && issues.length) {
      tl = deep(tl); caps = deep(caps);
      for (; rounds < 3; rounds++) {
        if (!quickFixRound(tl, caps, issues, P)) break;
        changed = true;
        P = await pass('q' + (rounds + 1), .3 + rounds * .22, .52 + rounds * .22);
        issues = quickIssues(tl, caps, P, dir);
        if (!issues.length) { rounds++; break; }
      }
      if (changed) saveProject(proj, tl, caps);
    }
    rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
    const near = t => P.samples.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a), P.samples[0]);
    const stills = [];
    for (const [k, t] of ts.entries()) {
      const s = near(t); if (!s) continue;
      const f = path.join(outDir, `${k}_t${t.toFixed(2)}.jpg`); fs.copyFileSync(s.file, f);
      stills.push({ t, file: path.relative(dir, f).split(path.sep).join('/') });
    }
    const result = {
      version: 1, created: new Date().toISOString(), hash: qcHash(tl, caps), fix, ms: Date.now() - T0,
      before: first.length, fixed: fix ? first.filter(i => !issues.some(r => same(r, i))).length : 0, rounds,
      issues: issues.map(view), stills, page_errors: E.errors.slice(0, 5),
    };
    fs.writeFileSync(path.join(dir, '.studio/qc_quick.json'), JSON.stringify(result, null, 1));
    say(1, 'Xong');
    return result;
  } finally {
    if (E) await E.browser.close().catch(() => {});
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  const args = process.argv.slice(2), src = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--times');
  if (!src) { console.error('usage: node scripts/qc_quick.mjs <project_dir|timeline.json> [--times a,b,c] [--fix]'); process.exit(2); }
  const ti = args.indexOf('--times'), times = ti >= 0 ? String(args[ti + 1] || '').split(',').map(Number).filter(Number.isFinite) : null;
  quickQC(src, { times, fix: args.includes('--fix'), onP: (k, s) => console.log(`@@ ${k.toFixed(2)} ${s}`) })
    .then(r => {
      for (const i of r.issues) console.log(`• ${i.t.toFixed(2).padStart(6)}s [${i.severity}] ${i.kind_vi}: ${i.msg}`);
      console.log(JSON.stringify({ before: r.before, left: r.issues.length, fixed: r.fixed, ms: r.ms }));
    })
    .catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
}
