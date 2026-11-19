// S27 M196 · A-roll theo kịch bản (docs/plans/S27-dung-theo-kich-ban.md mục 4).
//   4.1 Lời ngoài kịch bản: offscriptCuts(align.offscript, lời nghe được) → khoảng nên cắt (nới .15 s về phía khoảng lặng, bỏ đoạn
//       có mốc thời gian từ vỡ kiểu Whisper bịa: bài học ai-video-studio-041). Không chọn sẵn, không chạy trong Tự lái: người dùng
//       tick rồi Studio cắt bằng cutRanges của 20_ai.js (một bước hoàn tác).
//   4.2 Nhiều take: job nền `script_takes` (scripts/queue.mjs) chạy file này với thư mục dự án. Mỗi take (nguồn có tiếng khác nhau
//       trong TL.clips) nhận dạng lời một lần, cache .studio/takes/<hash>.json; alignTakes căn từng take với mọi đoạn;
//       pickTakes chọn take mỗi đoạn (dấu [A-ROLL: clip N] / take N / tên file thắng, không thì điểm khớp, hoà thì take sau);
//       takesToClips ra TL.clips theo thứ tự kịch bản, cỡ khung quanh mặt theo [A-ROLL: cận mặt|trung|rộng].
//       Kết quả .studio/takes_plan.json { clips, duration, caps, segments, align, picks, takes, missing }; Studio áp một bước hoàn tác.
//   node scripts/script_takes.mjs <thư mục dự án> [--model small|medium|large-v3-turbo|large-v3]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { alignScript, captionsFrom, fold, lcs, norm, readScript } from './script_doc.mjs';
import { pyBin } from './platform.mjs';
import { rmSync } from './fs_rm.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r2 = v => Math.round(v * 100) / 100;
const toks = s => String(s ?? '').split(/\s+/).map(norm).filter(Boolean);
export const PAD = .15;            // nới mép cắt / mép clip về phía khoảng lặng để không mất âm đầu / cuối từ
export const MIN_RATIO = .3;       // đoạn không take nào khớp tới mức này = "chưa quay"
export const FRAME_ZOOM = { can: 1.6, trung: 1.25, rong: 1 };

// ---------- 4.1 lời ngoài kịch bản ----------
/** Mốc thời gian từ trông như Whisper bịa (bài học 041): từ dài > 3 s, nhiều từ dài 0, hoặc mật độ quá thấp. */
export function brokenShape(words) {
  const W = (words || []).filter(w => Number.isFinite(+w.s) && Number.isFinite(+w.e));
  if (!W.length) return true;
  if (W.some(w => w.e - w.s > 3)) return true;
  if (W.filter(w => w.e - w.s < .02).length >= Math.max(2, W.length * .4)) return true;
  const span = W[W.length - 1].e - W[0].s;
  return span > 4 && W.length / span < .8;
}
/**
 * align.offscript [{t0,t1,text}] + lời nghe được hiện có trên timeline [{w,s,e}] → [{i, t0, t1, a, b, text, dur}] nên cắt.
 * a/b = mép cắt đã nới `pad` về phía khoảng lặng (không lấn sang từ kề bên). Đoạn đã không còn trên timeline (đã cắt, timeline đổi)
 * hoặc có mốc từ vỡ thì bỏ.
 */
export function offscriptCuts(offscript, heard, { pad = PAD, dur = Infinity } = {}) {
  const H = (heard || []).filter(h => h && Number.isFinite(+h.s) && Number.isFinite(+h.e)).map(h => ({ w: String(h.w ?? ''), s: +h.s, e: +h.e })).sort((x, y) => x.s - y.s);
  const out = [];
  (offscript || []).forEach((o, i) => {
    if (!o || !(o.t1 > o.t0)) return;
    const inn = H.filter(h => h.s >= o.t0 - .05 && h.e <= o.t1 + .05);
    if (inn.length < 5 || toks(inn.map(h => h.w).join(' ')).join(' ') !== toks(o.text).join(' ')) return; // timeline đã đổi: mốc cũ
    if (brokenShape(inn)) return;
    const before = H.filter(h => h.e <= o.t0 + .01 && !inn.includes(h)).pop(), after = H.find(h => h.s >= o.t1 - .01 && !inn.includes(h));
    const a = Math.max(0, o.t0 - pad, before ? before.e + .02 : 0), b = Math.min(dur, o.t1 + pad, after ? after.s - .02 : Infinity);
    out.push({ i, t0: o.t0, t1: o.t1, a: r2(Math.min(a, o.t0)), b: r2(Math.max(b, o.t1)), text: String(o.text || ''), dur: r2(Math.max(b, o.t1) - Math.min(a, o.t0)) });
  });
  return out;
}

// ---------- 4.2 nhiều take ----------
/**
 * Căn từng take với mọi đoạn. takes[i] = { words: [{w,s,e}] (giờ của nguồn) }. Trả rows[k][i] = { ratio, hits, n, t0, t1, j0, j1,
 * extra (từ nghe được thừa trong khoảng, gồm nói lặp / ờ à), head, tail (số từ đầu / cuối đoạn không khớp = bị cắt cụt) } hoặc null.
 * Tìm theo cửa sổ: mỗi lần quay lại cùng câu trong một take là một ứng viên; khớp nhiều hơn thắng, bằng nhau thì ít từ thừa hơn, rồi lần sau.
 */
export function alignTakes(segments, takes) {
  const H = (takes || []).map(t => (t.words || []).filter(w => w && Number.isFinite(+w.s) && Number.isFinite(+w.e)).map(w => ({ n: norm(w.w), s: +w.s, e: +w.e })));
  return (segments || []).map(seg => {
    const sw = toks(seg.say), n = sw.length;
    return H.map(h => {
      if (!n || !h.length) return null;
      const head = new Set(sw.slice(0, Math.min(n, 4))), any = new Set(sw), L = Math.ceil(n * 1.5) + 4;
      let starts = h.map((x, j) => (head.has(x.n) ? j : -1)).filter(j => j >= 0);
      if (!starts.length) starts = h.map((x, j) => (any.has(x.n) ? j : -1)).filter(j => j >= 0);
      let best = null;
      for (const j of starts) {
        const pairs = lcs(sw, h.slice(j, j + L).map(x => x.n));
        if (!pairs.length) continue;
        const j0 = j + pairs[0][1], j1 = j + pairs[pairs.length - 1][1];
        const cand = { hits: pairs.length, j0, j1, head: pairs[0][0], tail: n - 1 - pairs[pairs.length - 1][0], extra: j1 - j0 + 1 - pairs.length };
        if (!best || cand.hits > best.hits || (cand.hits === best.hits && (cand.extra < best.extra || (cand.extra === best.extra && cand.j0 > best.j0)))) best = cand;
      }
      if (!best) return { ratio: 0, hits: 0, n };
      return { ratio: r2(best.hits / n), hits: best.hits, n, t0: h[best.j0].s, t1: h[best.j1].e, j0: best.j0, j1: best.j1, extra: best.extra, head: best.head, tail: best.tail };
    });
  });
}
/** Điểm một cặp (đoạn, take): ratio − phạt lỗi nói (từ thừa) − phạt đoạn bị cắt cụt ở đầu / cuối. */
export const takeScore = r => (!r || !r.hits ? 0 : r2(r.ratio - Math.min(.2, .02 * (r.extra || 0)) - .05 * Math.min(2, r.head || 0) - .05 * Math.min(2, r.tail || 0)));
const baseName = f => fold(path.basename(String(f || ''))).replace(/\.\w{2,4}$/, '');
/**
 * Chọn take mỗi đoạn → [{ seg, take (chỉ số 0.. hoặc null), by: mark|score, score, ratio, missing, why }].
 * Dấu [A-ROLL: clip N | take N] (N đếm từ 1 theo thứ tự take) hoặc tên file thắng; không có thì điểm cao nhất, chênh ≤ .02 thì take sau.
 * Không take nào đạt MIN_RATIO → missing ("chưa quay").
 */
export function pickTakes(segments, rows, takes = [], { min = MIN_RATIO } = {}) {
  return (segments || []).map((seg, k) => {
    const R = rows[k] || [], m = seg.aroll || {};
    let want = null, why = '';
    if (m.take) { want = m.take - 1; if (!takes[want]) { why = `không có take ${m.take}`; want = null; } }
    else if (m.file) { const f = baseName(m.file); want = takes.findIndex(t => baseName(t.name || t.file) === f || baseName(t.name || t.file).includes(f)); if (want < 0) { why = `không thấy tệp ${m.file}`; want = null; } }
    if (want != null && R[want]?.hits) return { seg: k, take: want, by: 'mark', score: takeScore(R[want]), ratio: R[want].ratio, missing: false };
    if (want != null) why = `take ${want + 1} không có đoạn này`;
    const sc = R.map(r => (r?.hits ? takeScore(r) : null)), top = Math.max(-1, ...sc.filter(v => v != null));
    let bi = null; sc.forEach((v, i) => { if (v != null && v >= top - .02) bi = i; }); // hoà (chênh ≤ .02): take sau
    const bs = bi != null ? sc[bi] : 0;
    const ok = bi != null && R[bi].ratio >= min;
    return { seg: k, take: ok ? bi : null, by: ok ? 'score' : null, score: ok ? bs : 0, ratio: bi != null ? R[bi].ratio : 0, missing: !ok, ...(why ? { why } : {}) };
  });
}
/** Cỡ khung → { zoom, ox, oy } quanh mặt của take (face: {x,y} theo % khung). Chưa dò mặt hoặc khung rộng: không phóng (cover). */
export function frameFor(frame, face) {
  const z = FRAME_ZOOM[frame] || 1;
  if (z <= 1 || !face || !Number.isFinite(+face.x) || !Number.isFinite(+face.y)) return {};
  const clamp = v => Math.round(Math.min(90, Math.max(10, v)) * 10) / 10;
  return { zoom: z, ox: clamp(+face.x), oy: clamp(+face.y - (frame === 'can' ? 4 : 0)) }; // cận mặt: lấy cả trán, chừa phụ đề dưới cằm
}
const SKIP = new Set(['in', 'out', 'speed', 'transition', 'zoom', 'ox', 'oy', 'cid', 'keys', 'hidden']);
/**
 * Lựa chọn → TL.clips nối theo thứ tự kịch bản. takes[i] = { words, clip (clip mẫu của nguồn đó trong TL.clips), dur, face }.
 * Hai đoạn liền nhau cùng take và nối tiếp trong nguồn (ở giữa < 5 từ) thì nối liền ở giữa khoảng lặng (không nhảy hình);
 * còn lại mỗi đoạn một clip, mép nới PAD về phía lặng. Trả { clips, heard (lời theo giờ timeline mới), duration }.
 */
export function takesToClips(segments, picks, rows, takes, { pad = PAD } = {}) {
  const out = [], heard = [];
  for (const p of picks || []) {
    if (p.take == null) continue;
    const r = rows[p.seg]?.[p.take], tk = takes[p.take]; if (!r?.hits || !tk) continue;
    const W = (tk.words || []).filter(w => Number.isFinite(+w.s) && Number.isFinite(+w.e)), end = tk.dur || (W.length ? W[W.length - 1].e + 1 : r.t1 + 1);
    const prevW = W[r.j0 - 1], nextW = W[r.j1 + 1];
    let a = Math.max(0, r.t0 - pad, prevW ? prevW.e + .02 : 0), b = Math.min(end, r.t1 + pad, nextW ? nextW.s - .02 : Infinity);
    a = Math.min(a, r.t0); b = Math.max(b, r.t1);
    const last = out[out.length - 1];
    if (last && last._take === p.take + 1 && last._j1 < r.j0 && r.j0 - last._j1 - 1 < 5 && W[last._j1]) { // nối tiếp trong cùng take
      const mid = r2((W[last._j1].e + W[r.j0].s) / 2);
      last.out = mid; a = mid;
    } else if (last && last._take === p.take + 1 && a < last.out) a = last.out; // cùng take quay ngược / chồng: không lặp lại
    if (b - a < .2) continue;
    const base = Object.fromEntries(Object.entries(tk.clip || {}).filter(([k2]) => !SKIP.has(k2) && !k2.startsWith('_')));
    out.push({ ...base, in: r2(a), out: r2(b), ...frameFor(segments[p.seg]?.aroll?.frame, tk.face), _sheet: p.seg, _take: p.take + 1, _j1: r.j1 });
  }
  let t = 0;
  for (const c of out) {
    const tk = takes[c._take - 1];
    for (const w of tk.words || []) if (w.s >= c.in - .01 && w.e <= c.out + .01) heard.push({ w: w.w, s: r2(t + w.s - c.in), e: r2(t + w.e - c.in) });
    t += c.out - c.in; delete c._j1;
  }
  return { clips: out, heard, duration: r2(t) };
}

// ---------- job: nhận dạng từng take, căn, chọn, ghi kế hoạch ----------
const rd = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(o, null, 1)); fs.renameSync(t, f); };
export const plansFile = dir => path.join(dir, '.studio', 'takes_plan.json');
export const readTakesPlan = dir => rd(plansFile(dir));
const srcKey = c => (typeof c?.audio === 'string' && c.audio ? c.audio : null);
/** Các take của dự án: mỗi nguồn có tiếng khác nhau trong TL.clips một take, xếp theo giờ quay (mtime), cùng giờ thì theo thứ tự trên timeline. */
export function projectTakes(dir, tl) {
  const seen = new Map();
  (tl?.clips || []).forEach((c, i) => { const k = srcKey(c); if (k && !c.hidden && !seen.has(k)) seen.set(k, { file: k, clip: c, order: i }); });
  const list = [...seen.values()].map(t => { let mt = 0; try { mt = fs.statSync(path.resolve(dir, t.file)).mtimeMs; } catch { /* thiếu file */ } return { ...t, name: path.basename(t.file), mtime: mt }; });
  return list.sort((x, y) => x.mtime - y.mtime || x.order - y.order);
}
/** Hash nội dung (cỡ + 1 MB đầu + 1 MB cuối) + mô hình: đổi tên / chuyển chỗ file không nhận dạng lại. */
export function takeHash(file, model = '') {
  const st = fs.statSync(file), h = crypto.createHash('sha1').update(`${st.size}|${model}|`), fd = fs.openSync(file, 'r');
  try {
    const n = Math.min(st.size, 1 << 20), buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, 0); h.update(buf);
    if (st.size > n) { fs.readSync(fd, buf, 0, n, st.size - n); h.update(buf); }
  } finally { fs.closeSync(fd); }
  return h.digest('hex').slice(0, 20);
}
function run(cmd, argv, onLine) {
  return new Promise((ok, bad) => {
    const p = spawn(cmd, argv, { cwd: SKILL, env: process.env }); let log = '';
    const feed = d => { const s = d.toString(); log = (log + s).slice(-4000); s.split(/[\r\n]/).forEach(l => l && onLine?.(l)); };
    p.stdout.on('data', feed); p.stderr.on('data', feed);
    p.on('error', e => bad(e));
    p.on('close', code => (code === 0 ? ok(log) : bad(new Error(`${path.basename(argv.find(a => /\.py$/.test(a)) || cmd)} lỗi (mã ${code}): ${log.trim().split('\n').slice(-2).join(' | ').slice(-300)}`))));
  });
}
async function main() {
  const A = process.argv.slice(2), dir = path.resolve(A[0] || '.');
  const opt = k => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : null; };
  const model = ['small', 'medium', 'large-v3-turbo', 'large-v3'].includes(opt('model')) ? opt('model') : 'large-v3-turbo';
  const say = (p, s) => console.log(`@@ ${p.toFixed(3)} ${s}`);
  console.log(`PROJECT ${dir}`);
  const tl = rd(path.join(dir, 'timeline.json')); if (!tl) throw new Error('Không thấy timeline.json trong ' + dir);
  const sc = readScript(dir); if (!sc) throw new Error('Không thấy kịch bản trong dự án: nhập kịch bản ở bước Nguồn trước');
  const list = projectTakes(dir, tl); if (!list.length) throw new Error('Không thấy clip quay nào có tiếng trên track chính');
  const PY = pyBin(SKILL), S = f => path.join(SKILL, 'scripts', f), takes = [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i], file = path.resolve(dir, t.file);
    if (!fs.existsSync(file)) throw new Error(`Không thấy tệp take ${t.name}`);
    const cache = path.join(dir, '.studio', 'takes', `${takeHash(file, model)}.json`);
    let c = rd(cache);
    if (!c?.words) {
      say(.05 + .85 * i / list.length, `Nhận dạng lời take ${i + 1}/${list.length} (${t.name})`);
      const wf = cache.replace(/\.json$/, '.words.json');
      fs.mkdirSync(path.dirname(cache), { recursive: true });
      await run(PY, ['-I', '-X', 'utf8', S('transcribe.py'), file, wf, '--model', model]);
      const words = rd(wf, []), meta = rd(`${wf}.meta.json`) || {};
      rmSync(wf, { force: true }); rmSync(`${wf}.meta.json`, { force: true });
      let face = null; // mặt theo % khung: dò trên khung đã tách của take (nếu có)
      const seq = t.clip?.src?.seq, W0 = +tl.width || 1080, H0 = +tl.height || 1920;
      if (typeof seq === 'string') await run(PY, ['-I', '-X', 'utf8', S('find_face.py'), path.resolve(dir, path.dirname(seq)), '--design', `${W0}x${H0}`], l => { try { const f = JSON.parse(l); if (f.x != null) face = { x: r2(f.x / W0 * 100), y: r2(f.y / H0 * 100) }; } catch { /* dòng log */ } }).catch(() => {});
      const fr = t.clip?.src?.count && t.clip?.src?.fps ? t.clip.src.count / t.clip.src.fps : meta.dur || null;
      c = { file: t.name, model, words: words.map(w => ({ w: w.w, s: w.s, e: w.e })), dur: fr, face, at: new Date().toISOString() };
      wr(cache, c);
    } else say(.05 + .85 * i / list.length, `Take ${i + 1}/${list.length}: dùng lời đã nhận dạng`);
    takes.push({ ...c, name: t.name, file: t.file, clip: t.clip });
  }
  say(.92, 'Căn kịch bản với từng take');
  const segs = sc.segments, rows = alignTakes(segs, takes), picks = pickTakes(segs, rows, takes);
  const { clips, heard, duration } = takesToClips(segs, picks, rows, takes);
  if (!clips.length) throw new Error('Không take nào khớp kịch bản (dưới 30 % chữ mỗi đoạn)');
  const r = alignScript(segs, heard, { dur: duration });
  const caps = captionsFrom(r.words, { offWords: r.offWords || [] }), raw = captionsFrom(heard.map(w => ({ ...w, k: 0 })));
  const end = (tl.scenes || []).find(s => s.type === 'title_card' && s.t1 >= (tl.duration || 0) - .05);
  const tail = end ? r2(end.t1 - end.t0) : 0; // thẻ kết cuối giữ độ dài
  const plan = { version: 1, at: new Date().toISOString(), model, duration: r2(duration + tail), speech: duration, clips, caps, raw,
    segments: r.segments, align: r.align, picks, missing: picks.filter(p => p.missing).map(p => p.seg),
    takes: takes.map((t, i) => ({ n: i + 1, name: t.name, file: t.file, words: t.words.length, dur: t.dur, face: !!t.face, used: picks.filter(p => p.take === i).length })),
    rows: rows.map(R => R.map(x => (x ? { ratio: x.ratio, score: takeScore(x), t0: x.t0 ?? null, t1: x.t1 ?? null } : null))), scriptAt: sc.updated || null };
  wr(plansFile(dir), plan);
  say(1, `A-roll: ${clips.length} clip từ ${new Set(clips.map(c => c._take)).size} take${plan.missing.length ? ` · ${plan.missing.length} đoạn chưa quay` : ''}`);
  console.log('RESULT ' + JSON.stringify({ project: dir, clips: clips.length, missing: plan.missing.length, takes: takes.length }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) main().catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
