// "Nhiều phiên bản" — A/B variants of a project: sibling full projects <project>_v1.._vN with a different opening hook
// (Claude writes N hook texts with different angles; optionally a cold-open teaser = the strongest sentence copied to the front
// when the transcript gives a clean cut) and/or a different style pack (the pack's own recipe). Spec: references/qc-variants.md.
// usage: node scripts/variants.mjs <project_dir> [--n 3] [--kind hook|style|both] [--export [--no-deliver]] [--quality 720|1080] [--model sonnet] [--no-claude]
// Writes <project>/variants.json {base, kind, variants:[{dir, name, hook, pack, desc, still, video}]}. Progress: "@@ <0..1> <step>".
// Ma trận (M21): --kind matrix --n 40 [--audiences a,b] [--angles faq,tips] [--narratives …] [--durations 0,15,30] [--formats full,split]
//   [--seed 42] [--allow-low-source] [--estimate]: tổ hợp khán giả × góc × kết cấu × thời lượng × bố cục (scripts/variant_matrix.mjs),
//   hook lấy từ thư viện hook (scripts/hooks_lib.mjs), cổng đa dạng nguồn (M20) và ước tính (M23) in ra trước khi chạy.
//   Mỗi bản ghi trục vào variants.json (variants[].axes) và timeline._variant.axes. Spec: references/variant-matrix.md.
import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readGate, gateText } from './export_gate.mjs';
import { SKILL, PY, loadProject, saveProject, designOf, isBase, openEngine, engineInit, engineShot, askClaude, parseJson } from './ai_qc.mjs';
import { loadLib, saveLib, libPath, libKey, projectContext, pickHook, markUsed, generateHooks } from './hooks_lib.mjs';
import { AUDIENCES, ANGLES as M_ANGLES, NARRATIVES, FORMATS, sourceStats, checkSourceGate, matrixBrief, planMatrix, estimate, estimateText } from './variant_matrix.mjs';
import { nextBatchPlan, freshSlot } from './ads_results.mjs';
import { cloneProject } from './project_clone.mjs';
import { resolvePerf, hwSnapshot } from './perf_profile.mjs';
import { killTree } from './platform.mjs';
import { batchGate, batchPlan, batchPixels, holdBatchSlot, otherRenders, parallelLimit, runPool } from './batch_parallel.mjs';
import { workspaceOfProject } from './workspace.mjs';
import { deliverProject, fileName } from './kho_deliver.mjs';

const r2 = v => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const deep = o => JSON.parse(JSON.stringify(o));
const say = (p, s) => console.log(`@@ ${clamp(p, 0, 1).toFixed(2)} ${s}`);
const capText = c => (c.words || []).map(w => w.w).join(' ');
const SPECIAL = new Set(['hypecam', 'beatslide', 'multicam', 'screencast', 'greenscreen', 'transform']);
const PACK_ORDER = ['share', 'neon', 'luxury', 'kinetic', 'glow', 'slate', 'course', 'review', 'keynote', 'podcast', 'cinema', 'news', 'qa', 'topn', 'realestate', 'split'];
// Hook looks: deliberately different per variant (style/anim/position/sfx of the opening text).
const LOOKS = [
  { style: 'yellow', anim: 'pop', y: .2, sfx: 'impact', fx: 'punch' },
  { style: 'ink', anim: 'tumble', y: .24, sfx: 'whoosh', fx: 'shake' },
  { style: 'glow', anim: 'blur_zoom', y: .17, sfx: 'cinematic_hit', fx: 'flash' },
  { style: 'neon', anim: 'slide_l', y: .22, sfx: 'whoosh_fast', fx: 'whip' },
  { style: 'fire', anim: 'drop', y: .19, sfx: 'boom', fx: 'punch' },
];
const ANGLES = ['câu hỏi gây tò mò', 'tuyên bố mạnh / con số', 'nỗi đau hoặc lợi ích trực tiếp của người xem', 'phản trực giác / bất ngờ', 'lời hứa kết quả'];

// ---------- hooks from Claude ----------
function hookPrompt(tl, caps, n, oldHook) {
  return `Bạn là biên tập viên video ngắn tiếng Việt (TikTok/Reels/Shorts). Viết ${n} câu HOOK mở đầu KHÁC NHAU cho cùng một video, để chạy A/B test.
Lời thoại (id phụ đề, giây, chữ):
${caps.map((c, k) => `c${k} ${c.t0.toFixed(1)}s: ${capText(c)}`).join('\n')}
Tiêu đề hiện tại: ${tl.title || '(chưa có)'} · hook đang dùng: ${oldHook || '(không có)'} · dài ${tl.duration}s.
Yêu cầu:
- Mỗi hook ≤ 7 từ, tiếng Việt CÓ DẤU đúng chính tả, đúng nội dung video (không bịa con số không có trong lời thoại), mỗi cái một góc: ${ANGLES.slice(0, n).join('; ')}.
- "teaser" (tuỳ chọn, tối đa 1 phiên bản): nếu có một câu nói mạnh nhất, trọn ý, nằm sau giây thứ 5, dài 1,5–5 giây, bắt đầu và kết thúc đúng ranh giới câu (c0 = id phụ đề đầu, c1 = id phụ đề cuối), thì đưa ra để chèn lên đầu video làm đoạn mở (cold open). Không chắc cắt sạch thì để null.
Chỉ trả về JSON: {"variants":[{"name":"tên ngắn 2–3 từ","hook":"…","why":"1 câu vì sao hook này giữ chân","teaser":{"c0":12,"c1":13} hoặc null}]}`;
}
function fallbackHooks(tl, caps, n) {
  const first = []; for (const c of caps) { first.push(...c.words.map(w => w.w)); if (first.length >= 6) break; }
  const kw = caps.flatMap(c => c.words.filter(w => w.hl).map(w => w.w))[0] || first.slice(0, 2).join(' ');
  return [tl.title || first.slice(0, 6).join(' '), `Bạn đã biết ${kw}?`, `Đừng bỏ qua điều này`, `Sự thật về ${kw}`, 'Xem hết sẽ bất ngờ'].slice(0, n)
    .map((h, i) => ({ name: ['Tiêu đề', 'Câu hỏi', 'Cảnh báo', 'Sự thật', 'Bất ngờ'][i], hook: h, why: 'Hook dựng sẵn (không dùng Claude)', teaser: null }));
}
function validHooks(raw, caps, n, dur) {
  const out = [];
  for (const v of (raw?.variants || []).slice(0, n)) {
    const hook = String(v.hook || '').trim().replace(/^["“]|["”]$/g, '');
    if (!hook || hook.split(/\s+/).length > 9) continue;
    let teaser = null;
    const c0 = +v.teaser?.c0, c1 = +v.teaser?.c1;
    if (Number.isInteger(c0) && Number.isInteger(c1) && caps[c0] && caps[c1] && c1 >= c0 && caps[c0].t0 >= 4 && caps[c1].t1 <= dur) {
      const a = caps[c0].t0, b = caps[c1].t1;
      if (b - a >= 1.2 && b - a <= 6.5 && !out.some(o => o.teaser)) teaser = { c0, c1, a: r2(a), b: r2(b) };
    }
    out.push({ name: String(v.name || '').slice(0, 30) || `Hook ${out.length + 1}`, hook: hook.slice(0, 60), why: String(v.why || '').slice(0, 200), teaser });
  }
  return out;
}

// ---------- timeline edits ----------
const ABS = new Set(['t', 'out', 't0', 't1', 'reveal_t', 'strike_at', 'highlight_t']);
function shiftAll(tl, caps, d) {
  // everything after 0 moves by d; long layers / music that start at 0 stay at 0 and get longer (they cover the teaser too)
  const walk = (o, top) => { if (Array.isArray(o)) return o.forEach(x => walk(x, false)); if (!o || typeof o !== 'object') return; for (const [k, v] of Object.entries(o)) { if (k === '_orig') continue; if (!top && ABS.has(k) && typeof v === 'number') o[k] = r2(v + d); else if (v && typeof v === 'object') walk(v, false); } };
  for (const s of tl.scenes || []) { const long = s.t0 <= .05 && isBase(s, tl); walk(s, true); if (long) s.t1 = r2(s.t1 + d); else { s.t0 = r2(s.t0 + d); s.t1 = r2(s.t1 + d); } }
  for (const c of caps) { c.t0 = r2(c.t0 + d); c.t1 = r2(c.t1 + d); for (const w of c.words) { w.s = r2(w.s + d); w.e = r2(w.e + d); } }
  const A = tl.audio || {};
  for (const x of A.sfx || []) x.t = r2(x.t + d);
  for (const m of A.music || []) { if (m.t0 <= .05) m.t1 = r2(m.t1 + d); else { m.t0 = r2(m.t0 + d); m.t1 = r2(m.t1 + d); } }
  for (const f of tl.fx || []) f.t = r2(f.t + d);
  for (const k of ['grade', 'zoom', 'captionsHide']) for (const r of tl[k] || []) { if (r.t0 <= .05 && k === 'grade') r.t1 = r2(r.t1 + d); else { r.t0 = r2(r.t0 + d); r.t1 = r2(r.t1 + d); } }
  tl.duration = r2((tl.duration || 0) + d);
}
function framesCount(dir, tl) { const d = path.resolve(dir, path.dirname(tl.aroll?.frames || 'work/frames/x')); return fs.existsSync(d) ? fs.readdirSync(d).filter(f => /\.jpe?g$/.test(f)).length : 0; }
// Cold open: copy output range [a, b] of the main track to the very front (flash cut into the original start).
function addTeaser(dir, tl, caps, a, b) {
  const fps = tl.fps || 30;
  if (!tl.clips?.length) {
    if (!tl.aroll?.frames) return false;
    const n = framesCount(dir, tl); if (!n) return false;
    tl.clips = [{ src: { seq: tl.aroll.frames, fps, count: n }, ...(tl.audio?.voice ? { audio: tl.audio.voice } : {}), in: 0, out: r2(Math.min(n / fps, tl.duration)) }];
  }
  let t = 0, pick = null;
  for (const c of tl.clips) { if (c.hidden) continue; const d = ((c.out ?? 3) - (c.in || 0)) / (c.speed || 1); if (a >= t && b <= t + d + .02 && typeof c.src !== 'string') { pick = { c, t }; break; } t += d; }
  if (!pick) return false; // range spans a cut between clips: not a clean teaser
  const sp = pick.c.speed || 1, srcA = (pick.c.in || 0) + (a - pick.t) * sp, srcB = (pick.c.in || 0) + (b - pick.t) * sp;
  const teaser = { ...deep(pick.c), in: r2(srcA), out: r2(srcB), _teaser: true }; delete teaser.transition;
  const d = (srcB - srcA) / sp;
  const tc = caps.filter(c => c.t0 >= a - .02 && c.t1 <= b + .02).map(c => ({ ...deep(c), _teaser: true }));
  shiftAll(tl, caps, d);
  for (const c of tc) { c.t0 = r2(c.t0 - a); c.t1 = r2(c.t1 - a); for (const w of c.words) { w.s = r2(w.s - a); w.e = r2(w.e - a); } }
  caps.unshift(...tc);
  tl.clips[0].transition = { type: 'flash', dur: .3 };
  tl.clips.unshift(teaser);
  tl.fx = [...(tl.fx || []), { t: r2(d), type: 'flash', _variant: true }];
  return r2(d);
}
function splitHook(text, DW, width = DW * .8) {
  const T = text.toUpperCase(), w = T.split(/\s+/);
  const lines = T.length > (width < 700 ? 12 : 16) && w.length > 2 ? [w.slice(0, Math.ceil(w.length / 2)).join(' '), w.slice(Math.ceil(w.length / 2)).join(' ')] : [T];
  const longest = Math.max(...lines.map(l => l.length)), size = Math.round(clamp(width / (longest * .62), 34, DW > 1000 ? 84 : 76));
  return { lines, size };
}
// the old opening overlay(s) with text go away (user-edited ones stay)
const dropOldHook = tl => { tl.scenes = (tl.scenes || []).filter(s => isBase(s, tl) || s._orig || s.t0 >= 2.2 || !(s.text || s.lines || s.value || s.question || s.title)); };
function setHook(tl, caps, v, look, sfxOk) {
  const [DW, DH] = designOf(tl);
  const vert = DH > DW, face = tl.face || (vert ? { x: DW / 2, y: DH * .42 } : { x: DW / 2, y: DH * .42 });
  // vertical: above the face (or lower third); horizontal: beside the face, on the emptier side
  const x = vert ? DW / 2 : face.x > DW / 2 ? DW * .27 : DW * .73;
  const { lines, size } = splitHook(v.hook, DW, vert ? DW * .8 : DW * .42), t0 = .05, t1 = Math.min(2.8, tl.duration - .1);
  const y0 = vert ? (face.y > DH * .38 ? DH * look.y : DH * .64) : DH * .36 - (lines.length - 1) * size * .56;
  tl.scenes.push({ type: 'text', t0, t1, hideCaptions: true, _variant: true,
    lines: lines.map((L, i) => ({ text: L, t: r2(t0 + i * .18), x: Math.round(x), y: Math.round(y0 + i * size * 1.12), size, style: look.style, anim: look.anim, upper: false })) });
  tl.fx = [...(tl.fx || []).filter(f => !(f._variant && f.t < .2)), { t: .05, type: look.fx, _variant: true }];
  tl.audio = tl.audio || {};
  tl.audio.sfx = [...(tl.audio.sfx || []).filter(x => x.t > .3), ...(sfxOk(look.sfx) ? [{ t: .05, name: look.sfx, gain: -10, _variant: true }] : [])];
  tl.title = v.hook;
}

// ---------- style packs (engine recipes, run in the same headless Chrome) ----------
async function recipes(E, tl, caps, want, ids = null) {
  return E.page.evaluate((ctx, want, SPECIAL, ORDER, ids) => {
    const ok = PACKS.filter(p => p.recipe && !SPECIAL.includes(p.id) && (ids ? ids.includes(p.id) : p.id !== ctx.cur) && !(p.horizontal && ctx.vertical));
    ok.sort((a, b) => (ORDER.indexOf(a.id) + 1 || 99) - (ORDER.indexOf(b.id) + 1 || 99));
    return ok.slice(0, want).map(p => { try { const r = p.recipe({ ...ctx, brand: BR() }); return { id: p.id, name: p.name, caption_style: r.caption_style, scenes: r.scenes || [], fx: r.fx || null, music: r.music || null }; } catch (e) { return null; } }).filter(Boolean);
  }, { dur: tl.duration, captions: caps, vertical: (tl.height || 1920) > (tl.width || 1080), title: tl.title || '', cur: tl.pack }, want, [...SPECIAL], PACK_ORDER, ids);
}
function setStyle(tl, r) {
  tl.pack = r.id;
  if (r.caption_style != null) tl.caption_style = r.caption_style || undefined;
  // keep the user's own overlays and universal text/b-roll; drop the old pack's AI/recipe graphics
  tl.scenes = [...(tl.scenes || []).filter(s => s._orig || (!s._ai && !s._recipe && !s._base && !isBase(s, tl) && ['text', 'broll', 'emoji_pop', 'sticker'].includes(s.type))), ...r.scenes.map(s => ({ ...s, _recipe: true }))];
  if (r.fx) tl.fx = [...(tl.fx || []).filter(f => !f._recipe), ...r.fx.map(f => ({ ...f, _recipe: true }))];
  if (r.music) { tl.audio = tl.audio || {}; tl.audio.music = [{ t0: 0, t1: tl.duration, mood: r.music, gain: -20 }]; }
}

// ---------- export (same steps as the Studio's exportVideo: mix_audio.py → render.mjs) ----------
const PROCS = new Set(); // child processes of the export (several when variants render in parallel, M68)
function run(cmd, argv, cwd, onLine, env = null) {
  return new Promise((ok, bad) => { const p = spawn(cmd, argv, { cwd, ...(env ? { env: { ...process.env, ...env } } : {}) }); PROCS.add(p); p.on('close', () => PROCS.delete(p)); let err = ''; p.stdout.on('data', d => d.toString().split(/[\r\n]/).forEach(l => l && onLine && onLine(l))); p.stderr.on('data', d => (err = (err + d).slice(-2000))); p.on('close', c => (c ? bad(new Error(`${path.basename(cmd)} lỗi (mã ${c}): ${err.slice(-300)}`)) : ok())); });
}
async function exportProject(dir, quality, onP, { workers = null, env = null } = {}) {
  const tlFile = path.join(dir, 'timeline.json'), tl = JSON.parse(fs.readFileSync(tlFile, 'utf8'));
  const vert = (tl.height || 720) > (tl.width || 1280), [W, H] = quality === '1080' ? [1080, 1920] : [720, 1280];
  let mix = null;
  if (tl.audio && (tl.audio.voice || tl.audio.music?.length || tl.clips?.some(c => c.audio))) {
    await run(PY, ['-I', '-X', 'utf8', path.join(SKILL, 'scripts/mix_audio.py'), tlFile], dir);
    mix = path.resolve(dir, tl.audio.mix || 'work/mix.wav');
  }
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  const out = `out/${path.basename(dir)}.mp4`, tmp = path.join(dir, `.export_${process.pid}.json`);
  fs.rmSync(path.join(dir, out), { force: true }); // bản cũ có thể đã liên kết cứng sang Thanh pham/ (M100): ffmpeg -y sẽ ghi đè tại chỗ
  fs.writeFileSync(tmp, JSON.stringify({ ...tl, width: vert ? W : H, height: vert ? H : W }));
  try { await run('node', [path.join(SKILL, 'scripts/render.mjs'), tmp, path.join(dir, out), ...(mix ? ['--audio', mix] : []), ...(workers ? ['--workers', String(workers)] : [])], dir, l => { const m = /([\d.]+)s \/ ([\d.]+)s/.exec(l); if (m) onP(+m[1] / +m[2]); }, env); }
  finally { fs.rmSync(tmp, { force: true }); }
  return out;
}

// Xuất mọi phiên bản (M68 lô song song): nhiều bản → lô giữ một lượt render cả máy, batchPlan chọn P bản × W worker,
// render.mjs con chạy AVS_RENDER_SLOTS=0. Plan 1 → nhả chỗ, xuất lần lượt như cũ. Một bản lỗi thì lỗi cả lượt như cũ:
// không bắt đầu bản mới, các bản đang chạy chạy xong rồi mới ném lỗi đầu tiên. Huỷ: queue/route giết cả cây tiến trình (killTree, taskkill /t trên Windows).
async function exportAll(out, quality, label) {
  const q = quality || '720', n = out.length;
  let plan = { parallel: 1, workersEach: null }, hold = null;
  const perf = resolvePerf();
  if (!batchGate({ n, perf, limit: parallelLimit() })) {
    hold = await holdBatchSlot({ perf, info: { variants: n }, onWait: () => say(.58, 'Đang chờ lượt render khác…') });
    const [W, H] = batchPixels(q);
    plan = batchPlan({ n, hw: hwSnapshot({ env: { ...process.env, AVS_ENCODER: perf.encoder } }), perf, load: { renders_running: otherRenders() }, W, H, limit: parallelLimit() });
    if (plan.parallel > 1) console.error(`[variants] ${plan.why}`); else { hold.release(); hold = null; }
  }
  const prog = new Array(n).fill(0), tick = i => say(.58 + prog.reduce((a, b) => a + b, 0) / n * .4, `${label} ${i + 1}/${n} · ${Math.round(prog[i] * 100)}%`);
  const errs = [];
  // SIGTERM/SIGINT while exporting (POSIX caller that does not kill the group): stop every render.mjs tree (killTree,
  // never process.kill(-pid)) instead of leaving them running. The queue/route on Windows kill the whole tree anyway.
  const stop = async () => { await Promise.all([...PROCS].map(p => killTree(p))); hold?.release(); process.exit(130); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  try {
    await runPool(out, plan.parallel, async (v, i) => {
      if (errs.length) return; // một bản đã lỗi: không bắt đầu bản mới
      say(.58 + prog.reduce((a, b) => a + b, 0) / n * .4, `${label} ${i + 1}/${n}`);
      try { v.video = await exportProject(v.dir, q, k => { prog[i] = k; tick(i); }, plan.parallel > 1 ? { workers: plan.workersEach, env: hold.childEnv } : {}); prog[i] = 1; }
      catch (e) { errs.push(e); if (plan.parallel === 1) throw e; }
    });
  } finally { hold?.release(); process.off('SIGTERM', stop); process.off('SIGINT', stop); }
  if (errs.length) throw errs[0];
}

// S12 M100: mỗi phiên bản đã xuất → <Kho>/Thanh pham/<YYYY-MM>/<tên dự án gốc>/<dự án gốc> v<i> - <tên bản>.mp4 (liên kết cứng).
// Kho theo dự án gốc (biến thể nằm cạnh nó trong Du an/). Lỗi giao ghi vào v.deliver_error, không làm hỏng lượt xuất.
export function deliverVariants(dir, tl, list, o = {}) {
  if (o.deliver === false) return list;
  let ws; try { ws = workspaceOfProject(dir, tl, o.home ? { home: o.home } : {}); } catch (e) { console.error(`[variants] không giao được vào Thanh pham: ${e.message}`); return list; }
  const base = path.basename(dir);
  list.forEach((v, i) => {
    if (!v.video) return;
    const vd = path.resolve(dir, v.dir);
    try {
      const d = deliverProject(vd, [{ src: path.resolve(vd, v.video), name: fileName(`${base} v${i + 1}${v.name ? ' - ' + v.name : ''}`, '.mp4') }], { ws, folder: base, date: o.date }).items[0];
      if (d?.dst) v.delivered = d.dst; else if (d?.error) v.deliver_error = d.error;
    } catch (e) { v.deliver_error = e.message; }
  });
  return list;
}

// ---------- sibling project <base>_v<i+1> (a full copy; a stale copy of this same base is replaced) ----------
function newSibling(dir, i) {
  let dst = `${dir}_v${i + 1}`;
  if (fs.existsSync(dst)) {
    const prev = (() => { try { return JSON.parse(fs.readFileSync(path.join(dst, 'timeline.json'), 'utf8'))._variant?.base; } catch { return null; } })();
    if (prev && path.resolve(prev) === dir) fs.rmSync(dst, { recursive: true, force: true });
    else { let k = 2; while (fs.existsSync(`${dir}_v${i + 1}_${k}`)) k++; dst = `${dir}_v${i + 1}_${k}`; }
  }
  // M54: clone APFS trên macOS, nơi khác liên kết cứng khung + video nguồn (chỉ đọc), chép thật phần còn lại (scripts/project_clone.mjs)
  const c = cloneProject(dir, dst, { skip: ['out', 'batch', 'variants.json', '.studio/history', '.studio/qc', '.studio/qc.json', '.studio/qc_backup.json'] });
  if (c.method !== 'clone') console.log(`[variants] ${path.basename(dst)}: liên kết ${c.linked} file (${(c.linkedBytes / 1e6).toFixed(1)} MB), chép ${c.copied} file (${(c.copiedBytes / 1e6).toFixed(1)} MB)${c.fallback ? ` · lùi về chép: ${c.fallback}` : ''}`);
  return dst;
}

// ---------- cut the timeline to `dur` seconds (matrix duration axis); 0 or ≥ length = keep ----------
export function trimTo(tl, caps, dur) {
  if (!(dur > 0) || dur >= (tl.duration || 0) - .3) return false;
  const cut = arr => (arr || []).filter(x => (x.t0 ?? x.t ?? 0) < dur - .05).map(x => (x.t1 > dur ? { ...x, t1: dur } : x));
  tl.scenes = cut(tl.scenes);
  const kept = caps.filter(c => c.t0 < dur - .1).map(c => ({ ...c, t1: Math.min(c.t1, dur), words: (c.words || []).filter(w => w.s < dur).map(w => (w.e > dur ? { ...w, e: dur } : w)) })).filter(c => c.words.length);
  caps.splice(0, caps.length, ...kept);
  if (tl.clips?.length) {
    const out = []; let t = 0;
    for (const c of tl.clips) {
      if (t >= dur - .05) break;
      if (c.hidden) { out.push(c); continue; }
      const sp = c.speed || 1, d = ((c.out ?? 3) - (c.in || 0)) / sp;
      out.push(t + d > dur ? { ...c, out: r2((c.in || 0) + (dur - t) * sp) } : c); t += d;
    }
    tl.clips = out;
  }
  const A = tl.audio || {};
  if (A.sfx) A.sfx = A.sfx.filter(x => x.t < dur - .05);
  if (A.music) A.music = cut(A.music);
  if (tl.fx) tl.fx = tl.fx.filter(f => f.t < dur - .05);
  for (const k of ['grade', 'zoom', 'captionsHide']) if (tl[k]) tl[k] = cut(tl[k]);
  tl.duration = r2(dur);
  return true;
}

// ---------- matrix (M21) ----------
export async function makeMatrix(src, o = {}) {
  const base = loadProject(src), dir = base.dir, target = clamp(Math.round(+o.n || 10), 1, 1000);
  const [DW, DH] = designOf(base.tl);
  const stats = sourceStats(dir, base.tl), gate = checkSourceGate(stats, target, { allowLowSource: !!o.allowLowSource });
  const brief = matrixBrief(base.tl, { audiences: o.audiences, angles: o.angles, narratives: o.narratives, durations: o.durations, formats: o.formats, seed: o.seed });
  const ctx = projectContext(dir), lib = loadLib(libPath(ctx.key), libKey(ctx.key));
  // M32: lô kế tiếp có trọng số theo kết quả quảng cáo đã nhập (ads_results.json): yếu tố thắng nặng điểm hơn, hook thắng
  // được ưu tiên, ~explore × target bản dùng hook mới sinh.
  const learnO = o.learn || brief.learn, nb = learnO ? nextBatchPlan(dir, { target, ...learnO }) : null;
  if (nb) console.log(nb.has_data ? `Học từ kết quả (${nb.kpi}): trọng số ${JSON.stringify(nb.weights)} · hook thắng ${nb.preferred_hooks.length} · ${nb.fresh_slots} bản hook mới` : `Học từ kết quả: ${nb.learn.note}`);
  const plan = planMatrix(brief, stats, { duration: base.tl.duration, ads: !!base.tl.ads?.on, claims: ctx.claims }, target, nb?.has_data ? { weights: nb.weights } : {});
  const est = estimate({ dir, tl: base.tl, target, plan, stats, gate, lib, export: !!o.export });
  console.log(estimateText(est));
  const summary = { theoretical: plan.theoretical, feasible: plan.feasible_count, rejected: plan.rejected_reasons, angles: plan.angle_distribution, quota: plan.quota, brief,
    ...(nb ? { learn: { kpi: nb.kpi, has_data: nb.has_data, weights: nb.weights, preferred_hooks: nb.preferred_hooks, explore: nb.explore, fresh_slots: nb.fresh_slots, new_hooks: nb.new_hooks, angle_quota: plan.angle_quota } } : {}) };
  if (o.estimateOnly) { console.log('RESULT ' + JSON.stringify({ estimate: est, plan: summary })); return { estimate: est, plan: summary, variants: [] }; }
  if (gate.blocked) throw new Error(`Cổng đa dạng nguồn: ${gate.warnings[0].message}. ${gate.warnings[0].hint} Vẫn muốn chạy: thêm --allow-low-source.`);
  if (!plan.chosen.length) throw new Error(`Không có tổ hợp khả thi (${Object.entries(plan.rejected_reasons).map(([k, v]) => `${k} ${v}`).join(', ')}).`);
  const chosen = plan.chosen, sfxOk = name => ['.flac', '.wav', '.mp3'].some(e => fs.existsSync(path.join(SKILL, 'assets/sfx', name + e)));
  const out = [];
  say(.04, 'Mở engine');
  const E = await openEngine(dir);
  try {
    const want = [...new Set(chosen.map(c => FORMATS[c.format]?.pack).filter(Boolean))], packMap = {};
    if (want.length) { await engineInit(E, base.tl, base.caps); for (const r of await recipes(E, base.tl, base.caps, want.length, want)) packMap[r.id] = r; }
    let freshIds = [];
    if (nb?.new_hooks) {
      say(.05, `Sinh ${nb.new_hooks} hook mới cho phần khám phá`);
      const g = await generateHooks(lib, ctx, { n: nb.new_hooks, useLlm: !o.noClaude, model: o.model, seed: brief.seed });
      if (g.llm_error) console.error(`[variants] LLM: ${g.llm_error} — dùng hook mẫu`);
      freshIds = g.hooks.map(x => x.id);
    }
    for (let i = 0; i < chosen.length; i++) {
      const c = chosen[i];
      say(.06 + i / chosen.length * (o.export ? .5 : .9), `Tạo bản ${i + 1}/${chosen.length}: ${M_ANGLES[c.angle]?.label || c.angle}`);
      const fresh = !!nb && freshSlot(i, nb.explore), preferred = fresh ? freshIds : nb?.preferred_hooks;
      let h = pickHook(lib, { angle: c.angle, seed: brief.seed + i, preferred });
      if (!h) {
        const g = await generateHooks(lib, ctx, { n: Math.max(3, Math.ceil((chosen.length - i) / 5)), angle: c.angle, useLlm: !o.noClaude, model: o.model, seed: brief.seed + i });
        if (g.llm_error) console.error(`[variants] LLM: ${g.llm_error} — dùng hook mẫu`);
        h = pickHook(lib, { angle: c.angle, seed: brief.seed + i });
      }
      if (!h) throw new Error(`Thư viện hook ${lib.file} hết hook còn lượt cho góc ${c.angle} và không sinh được hook mới qua cổng.`);
      const dst = newSibling(dir, i);
      markUsed(lib, h.id, dst);
      const P = loadProject(dst), { tl, caps } = P;
      const axes = { audience: c.audience, angle: c.angle, narrative: c.narrative, duration: c.duration || 0, format: c.format };
      const v = { dir: dst, kind: 'matrix', axes, hook: h.text, hook_id: h.id, pack: tl.pack, score: c.score, name: `${M_ANGLES[c.angle]?.label || c.angle} · ${AUDIENCES[c.audience] || c.audience}` };
      const packId = FORMATS[c.format]?.pack, notes = [];
      if (packId) { if (packMap[packId]) { setStyle(tl, packMap[packId]); v.pack = packId; } else notes.push(`không có gói ${packId} hợp khổ hình này, giữ gói ${tl.pack || 'cũ'}`); }
      dropOldHook(tl);
      setHook(tl, caps, { hook: h.text }, LOOKS[Object.keys(NARRATIVES).indexOf(c.narrative) % LOOKS.length] || LOOKS[0], sfxOk);
      if (c.duration && !trimTo(tl, caps, c.duration)) notes.push(`video đã ≤ ${c.duration}s, giữ nguyên độ dài`);
      v.desc = [`Kết cấu ${NARRATIVES[c.narrative] || c.narrative}`, `bố cục ${FORMATS[c.format]?.label || c.format}`, c.duration ? `${c.duration}s` : 'giữ độ dài', ...notes].join(' · ');
      if (c.quota_overflow) v.quota_overflow = true;
      if (nb) v.learn_hook = freshIds.includes(h.id) ? 'new' : nb.preferred_hooks.includes(h.id) ? 'winner' : 'library';
      tl._variant = { base: dir, i: i + 1, kind: 'matrix', hook: h.text, hook_id: h.id, pack: v.pack, axes, created: new Date().toISOString() };
      saveProject(P, tl, caps);
      await engineInit(E, tl, caps);
      v.still = '.studio/hook.jpg'; await engineShot(E, 1.2, path.join(dst, v.still), false);
      out.push(v);
    }
    await engineInit(E, base.tl, base.caps); await engineShot(E, 1.2, path.join(dir, '.studio/hook.jpg'), false);
  } finally { await E.browser.close().catch(() => {}); saveLib(lib); }
  const g2 = o.export ? readGate(dir) : null;
  if (g2?.blocked) console.error(`[variants] không xuất video: QC của dự án gốc đang chặn xuất (${gateText(g2)})`);
  if (o.export && !g2?.blocked) { await exportAll(out, o.quality, 'Xuất bản'); deliverVariants(dir, base.tl, out, o); }
  const oldHook = (base.tl.scenes || []).filter(s => !s.hidden && !isBase(s, base.tl) && s.t0 < 1.5).map(s => s.text || s.lines?.map(L => L.text).join(' ') || s.value || '').filter(Boolean)[0] || '';
  const res = { base: dir, created: new Date().toISOString(), kind: 'matrix', kind_vi: 'ma trận khán giả × góc × kết cấu × thời lượng × bố cục', n: out.length,
    ab_test: true, base_hook: oldHook || base.tl.title || '', base_still: '.studio/hook.jpg', size: `${DW}x${DH}`, hook_library: lib.file,
    axes: ['audience', 'angle', 'narrative', 'duration', 'format'], plan: summary, source_gate: { ok: gate.ok, need: gate.need, have: gate.have, warnings: gate.warnings },
    estimate: est, variants: out };
  if (nb) res.learn = { kpi: nb.kpi, has_data: nb.has_data, weights: nb.weights, preferred_hooks: nb.preferred_hooks, explore: nb.explore,
    new_hooks: out.filter(v => v.learn_hook === 'new').length, winner_hooks: out.filter(v => v.learn_hook === 'winner').length, source: 'ads_results.json' };
  fs.writeFileSync(path.join(dir, 'variants.json'), JSON.stringify(res, null, 1));
  return res;
}

// ---------- main ----------
export async function makeVariants(src, o = {}) {
  if (o.kind === 'matrix') return makeMatrix(src, o);
  const base = loadProject(src), dir = base.dir, n = clamp(+o.n || 3, 1, 5), kind = ['hook', 'style', 'both'].includes(o.kind) ? o.kind : 'hook';
  if (!base.caps.length && kind !== 'style') throw new Error('Dự án chưa có phụ đề — cần lời thoại để viết hook.');
  const [DW, DH] = designOf(base.tl);
  const sfxOk = name => ['.flac', '.wav', '.mp3'].some(e => fs.existsSync(path.join(SKILL, 'assets/sfx', name + e)));
  const oldHook = (base.tl.scenes || []).filter(s => !s.hidden && !isBase(s, base.tl) && s.t0 < 1.5).map(s => s.text || s.lines?.map(L => L.text).join(' ') || s.value || '').filter(Boolean)[0] || '';
  // 1. hooks
  let hooks = [];
  if (kind !== 'style') {
    if (!o.noClaude) {
      say(.04, `Claude viết ${n} hook mở đầu (15–40 giây)`);
      try {
        const t0 = Date.now(), raw = await askClaude(hookPrompt(base.tl, base.caps, n, oldHook), { model: o.model || 'sonnet', onTick: s => say(.04 + .2 * (1 - Math.exp(-s / 30)), `Claude đang viết hook… ${Math.round(s)}s`) });
        fs.mkdirSync(path.join(dir, '.studio'), { recursive: true }); fs.writeFileSync(path.join(dir, '.studio/variants_raw.txt'), raw);
        hooks = validHooks(parseJson(raw), base.caps, n, base.tl.duration);
        console.log(`hooks (${((Date.now() - t0) / 1000).toFixed(0)}s): ${hooks.map(h => h.hook).join(' | ')}`);
      } catch (e) { console.error('[variants] Claude: ' + e.message + ' — dùng hook dựng sẵn'); }
    }
    if (hooks.length < n) hooks.push(...fallbackHooks(base.tl, base.caps, n).slice(hooks.length));
  }
  say(.26, 'Mở engine');
  const E = await openEngine(dir);
  const out = [];
  try {
    // 2. packs
    let packs = [];
    if (kind !== 'hook') { await engineInit(E, base.tl, base.caps); packs = await recipes(E, base.tl, base.caps, n); if (!packs.length) throw new Error('Không tìm được gói style nào khác phù hợp khổ hình này.'); }
    // 3. sibling projects
    for (let i = 0; i < n; i++) {
      say(.3 + i / n * .25, `Tạo phiên bản ${i + 1}/${n}`);
      const dst = newSibling(dir, i);
      const P = loadProject(dst); let { tl, caps } = P;
      const v = { dir: dst, kind, name: '', desc: '', hook: '', pack: tl.pack };
      if (kind !== 'hook') { const r = packs[i % packs.length]; setStyle(tl, r); v.pack = r.id; v.name = r.name; v.desc = `Gói ${r.name}`; }
      if (kind !== 'style') {
        const h = hooks[i % hooks.length];
        dropOldHook(tl);
        if (h.teaser) { const d = addTeaser(dst, tl, caps, h.teaser.a, h.teaser.b); if (d) { v.teaser = { from: h.teaser.a, to: h.teaser.b, dur: d }; } }
        setHook(tl, caps, h, LOOKS[i % LOOKS.length], sfxOk);
        v.hook = h.hook; v.name = kind === 'both' ? `${h.name} · ${v.name}` : h.name;
        v.desc = [h.why, v.teaser ? `Mở bằng câu nói ở ${v.teaser.from.toFixed(1)}s (${v.teaser.dur.toFixed(1)}s) rồi cắt flash về đầu.` : '', kind === 'both' ? v.desc : ''].filter(Boolean).join(' ');
      }
      tl._variant = { base: dir, i: i + 1, kind, hook: v.hook, pack: v.pack, created: new Date().toISOString() };
      saveProject(P, tl, caps);
      // hook still (t = 1.2 s, or inside the teaser)
      await engineInit(E, tl, caps);
      v.still = '.studio/hook.jpg'; await engineShot(E, 1.2, path.join(dst, v.still), false);
      out.push(v);
    }
    await engineInit(E, base.tl, base.caps); await engineShot(E, 1.2, path.join(dir, '.studio/hook.jpg'), false);
  } finally { await E.browser.close().catch(() => {}); }
  // 4. optional export of every variant (not while the base project's QC blocks export: the variants share its words)
  const gate = o.export ? readGate(dir) : null;
  if (gate?.blocked) console.error(`[variants] không xuất video: QC của dự án gốc đang chặn xuất (${gateText(gate)})`);
  if (o.export && !gate?.blocked) { await exportAll(out, o.quality, 'Xuất phiên bản'); deliverVariants(dir, base.tl, out, o); }
  const baseVid = fs.existsSync(path.join(dir, 'out')) ? fs.readdirSync(path.join(dir, 'out')).filter(f => f.endsWith('.mp4')).map(f => `out/${f}`).sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs)[0] : null;
  const res = { base: dir, created: new Date().toISOString(), kind, kind_vi: { hook: 'khác hook mở đầu', style: 'khác gói style', both: 'khác hook + gói style' }[kind], n: out.length,
    ab_test: true, base_hook: oldHook || base.tl.title || '', base_still: '.studio/hook.jpg', base_video: baseVid || undefined, size: `${DW}x${DH}`, variants: out };
  fs.writeFileSync(path.join(dir, 'variants.json'), JSON.stringify(res, null, 1));
  return res;
}

async function main() {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const VAL = ['--n', '--kind', '--model', '--quality', '--audiences', '--angles', '--narratives', '--durations', '--formats', '--seed', '--kpi', '--explore'];
  const src = args.find((a, i) => !a.startsWith('--') && !(i > 0 && VAL.includes(args[i - 1])));
  if (!src) { console.error('usage: node scripts/variants.mjs <project_dir> [--n 3] [--kind hook|style|both|matrix] [--export [--no-deliver]] [--quality 720|1080] [--no-claude]\n  matrix: [--audiences a,b] [--angles x,y] [--narratives …] [--durations 0,15,30] [--formats full,split] [--seed 42] [--allow-low-source] [--estimate] [--learn [--kpi auto|ctr|cpa|roas…] [--explore 0.2]]'); process.exit(2); }
  const r = await makeVariants(src, { n: +opt('--n', 3), kind: opt('--kind', 'hook'), export: args.includes('--export'), deliver: !args.includes('--no-deliver'), quality: opt('--quality', '720'), model: opt('--model', 'sonnet'), noClaude: args.includes('--no-claude'),
    audiences: opt('--audiences'), angles: opt('--angles'), narratives: opt('--narratives'), durations: opt('--durations'), formats: opt('--formats'), seed: opt('--seed') != null ? +opt('--seed') : undefined,
    allowLowSource: args.includes('--allow-low-source'), estimateOnly: args.includes('--estimate'),
    learn: args.includes('--learn') ? { kpi: opt('--kpi', 'auto'), explore: opt('--explore') != null ? +opt('--explore') : 0.2 } : undefined });
  for (const v of r.variants) console.log(`${path.basename(v.dir)}: ${v.name} · hook “${v.hook}” · ${v.pack}${v.axes ? ` · ${v.desc}` : ''}${v.teaser ? ` · teaser ${v.teaser.dur}s` : ''}${v.video ? ` → ${v.video}` : ''}`);
  if (r.base) console.log(`variants: ${path.join(r.base, 'variants.json')}`);
  say(1, 'Xong');
  process.exit(0);
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) main().catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
