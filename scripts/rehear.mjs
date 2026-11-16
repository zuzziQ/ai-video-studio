// Nghe lại một đoạn lời thoại bằng Whisper (ROADMAP M95; route studio/routes/22_rehear.mjs, panel Lời thoại).
// Chỗ AI chỉ đọc chữ (M90) không sửa được, vd số nghe nhầm "15 đến 3 phút" (thật ra "15 đến 30"): máy nghe lại
// [s - 1, e + 1] của tiếng nói trên timeline bằng model lớn hơn model đã tạo lời thoại, kèm câu trước/sau và từ điển.
// Kết quả chỉ là chữ + mốc thời gian từng từ; panel so với lời thoại (TranscriptCore.rehearDiff) và hiện đề xuất.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const MODELS = ['small', 'medium', 'large-v3-turbo', 'large-v3'];
export const PAD = 1; // giây nghe thêm mỗi bên
// Đoạn nghe tối thiểu (giây): đo trên clip mẫu, nghe một chữ "3" với 2 s âm thanh thì large-v3 ra "20" và bịa thêm câu
// "Hẹn gặp lại các bạn…"; đoạn ngắn được nới đều hai bên cho đủ dài.
export const MIN_WIN = 5;
export const MAX_SPAN = 30; // giây: nghe lại là cho một chỗ ngắn, không phải tạo lại cả lời thoại
export const MAX_SPANS = 20; // M96 "Soát kỹ": số đoạn tối đa một lượt nghe lại nhiều đoạn (panel mặc định 12)
const NEXT = { small: 'large-v3-turbo', medium: 'large-v3-turbo', 'large-v3-turbo': 'large-v3', 'large-v3': 'large-v3' };

/** Model nghe lại: model người dùng chọn, không thì bậc lớn hơn model đã tạo lời thoại (tl.asr.model, mặc định turbo). */
export function pickModel(used, asked) {
  if (asked != null) {
    if (!MODELS.includes(asked)) { const e = new Error(`Mô hình lạ “${String(asked).slice(0, 40)}” — chọn ${MODELS.join(', ')}`); e.status = 400; throw e; }
    return asked;
  }
  return NEXT[used] || 'large-v3';
}

/** Kiểm {s, e} từ trình duyệt; trả khoảng nghe [from, to] đã thêm PAD, kẹp trong [0, duration]. */
export function checkSpan(b, duration) {
  const s = +b?.s, e = +b?.e;
  const bad = m => { const x = new Error(m); x.status = 400; return x; };
  if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e <= s) throw bad('Cần đoạn {s, e} hợp lệ (giây, e > s)');
  if (e - s > MAX_SPAN) throw bad(`Đoạn dài ${Math.round(e - s)} giây: nghe lại chỉ cho đoạn ngắn (tối đa ${MAX_SPAN} giây). Chọn ít chữ hơn.`);
  const D = Number.isFinite(+duration) && +duration > 0 ? +duration : Infinity;
  if (s >= D) throw bad('Đoạn nằm ngoài video');
  const pad = Math.max(PAD, (MIN_WIN - (e - s)) / 2);
  let from = s - pad, to = e + pad;
  if (from < 0) { to -= from; from = 0; } // chạm đầu/cuối video: dồn phần thiếu sang bên kia
  if (to > D) { from = Math.max(0, from - (to - D)); to = D; }
  return { s, e, from, to };
}

/** Danh sách đoạn [{s, e}] (M96) → các khoảng nghe như checkSpan; 1–MAX_SPANS đoạn. */
export function checkSpans(list, duration) {
  if (!Array.isArray(list) || !list.length || list.length > MAX_SPANS) { const x = new Error(`Cần 1–${MAX_SPANS} đoạn {s, e}`); x.status = 400; throw x; }
  return list.map(b => checkSpan(b, duration));
}

/** Initial prompt cho Whisper: từ khoá (từ điển, thương hiệu, sản phẩm), câu sau, rồi câu trước sát đoạn nghe (≤ ~700 ký tự).
 *  Không đưa chữ của chính đoạn nghe vào: chữ sai đó sẽ kéo Whisper nghe sai lại. */
export function buildPrompt({ words = [], from, to, terms = [] }) {
  const before = words.filter(w => w.e <= from + 0.05).slice(-30).map(w => w.w).join(' ');
  const after = words.filter(w => w.s >= to - 0.05).slice(0, 15).map(w => w.w).join(' ');
  const kw = [...new Set(terms.map(t => String(t || '').trim()).filter(Boolean))].slice(0, 30).join(', ');
  const parts = [kw && `Từ khoá: ${kw}.`, after && `${after}.`, before].filter(Boolean);
  let p = parts.join(' ');
  if (p.length > 700) p = p.slice(-700).replace(/^\S*\s/, '');
  return p;
}

// Chữ ký phần âm thanh của timeline: đổi clip, cắt, tốc độ, làm sạch giọng → tạo lại tiếng nói.
export function voiceSig(tl, dir) {
  const files = new Set([tl.audio?.voice, ...(tl.clips || []).map(c => c.audio)].filter(Boolean));
  const mt = [...files].map(f => { try { return `${f}:${fs.statSync(path.resolve(dir, f)).mtimeMs}`; } catch { return `${f}:-`; } });
  return crypto.createHash('sha1').update(JSON.stringify([tl.clips || null, tl.audio?.voice || null, tl.audio?.clean || null, tl.duration, mt])).digest('hex');
}

/** Chạy một lệnh; dòng stdout/stderr gửi onLine; lỗi mang dòng cuối có chữ. */
export function spawnRun(cmd, args, { cwd, onLine, onProc } = {}) {
  return new Promise((ok, bad) => {
    const p = spawn(cmd, args, { cwd, windowsHide: true });
    onProc?.(p);
    let tail = '', rest = '';
    const feed = d => { const s = rest + d.toString(); const ls = s.split(/[\r\n]/); rest = ls.pop(); for (const l of ls) if (l.trim()) { tail = (tail + '\n' + l).slice(-2000); onLine?.(l); } };
    p.stdout.on('data', feed); p.stderr.on('data', feed);
    p.on('error', e => bad(new Error(e.code === 'ENOENT' ? `Không tìm thấy ${path.basename(cmd)} — chạy lại bộ cài (install)` : e.message)));
    p.on('close', code => {
      if (rest.trim()) tail += '\n' + rest;
      if (code === 0) return ok();
      const mod = /ModuleNotFoundError: No module named '([\w.]+)'/.exec(tail)?.[1];
      const last = tail.split('\n').map(l => l.trim()).filter(l => l && !/^(Traceback|File |\^|~)/.test(l)).pop();
      bad(new Error(mod ? `Thiếu thư viện Python "${mod.split('.')[0]}" — chạy lại bộ cài (install.cmd / install.sh)` : last || `${path.basename(cmd)} lỗi (mã ${code})`));
    });
  });
}

/** Tiếng nói đúng như trên timeline (mix_audio.py --stems, chỉ giọng: bỏ nhạc/SFX/track phụ cho nhanh), lưu
 *  .studio/rehear_voice.wav kèm chữ ký; timeline không đổi phần âm thanh thì dùng lại. Lỗi trộn thì dùng file giọng gốc. */
export async function voiceSource({ dir, tl, skill, py, run, onLine, onProc }) {
  const st = path.join(dir, '.studio'), wav = path.join(st, 'rehear_voice.wav'), sigF = path.join(st, 'rehear_voice.sig');
  const sig = voiceSig(tl, dir);
  try { if (fs.readFileSync(sigF, 'utf8') === sig && fs.existsSync(wav)) return { file: wav, cached: true }; } catch { /* chưa có */ }
  fs.mkdirSync(st, { recursive: true });
  const tmp = path.join(dir, `.rehear_${process.pid}.json`), stem = path.join(st, 'stem_voice.wav');
  const voiceOnly = { ...tl, audio: { ...(tl.audio || {}), music: [], sfx: [], tracks: [], mix: '.studio/rehear_mix.wav' } };
  try {
    fs.writeFileSync(tmp, JSON.stringify(voiceOnly));
    await run(py, ['-I', '-X', 'utf8', path.join(skill, 'scripts', 'mix_audio.py'), tmp, '--stems'], { cwd: dir, onLine, onProc });
    if (fs.existsSync(stem)) {
      fs.renameSync(stem, wav);
      fs.writeFileSync(sigF, sig);
      return { file: wav, cached: false };
    }
  } catch (e) { onLine?.(`(mix_audio: ${e.message})`); }
  finally { fs.rmSync(tmp, { force: true }); fs.rmSync(path.join(st, 'rehear_mix.wav'), { force: true }); }
  const v = tl.audio?.voice && path.resolve(dir, tl.audio.voice);
  if (v && fs.existsSync(v)) return { file: v, cached: false };
  throw new Error('Video chưa có tiếng nói để nghe lại (không có clip nào có tiếng).');
}

const cleanWords = list => (Array.isArray(list) ? list : []).filter(w => w && typeof w.w === 'string' && Number.isFinite(+w.s) && Number.isFinite(+w.e))
  .map(w => ({ w: w.w.slice(0, 80), s: +w.s, e: +w.e }));

/**
 * Nghe lại [s, e] của dự án. o: {dir, tl, words (lời thoại hiện có, [{w,s,e}]), terms, s, e, model?, lang?, skill, py}
 * env: {run (mặc định spawnRun), onProgress(p, bước), onProc(child), cancelled()}
 * → {model, device, from, to, prompt, words:[{w,s,e}], text, ms, load_ms, run_ms, stem_ms, cached}
 */
export async function rehear(o, env = {}) {
  const run = env.run || spawnRun, say = (p, st) => env.onProgress?.(p, st);
  const span = checkSpan(o, o.tl?.duration);
  const model = pickModel(o.tl?.asr?.model, o.model);
  const t = Date.now();
  say(0.05, 'Lấy tiếng nói trên timeline');
  const src = await voiceSource({ dir: o.dir, tl: o.tl, skill: o.skill, py: o.py, run, onProc: env.onProc });
  const stem_ms = Date.now() - t;
  if (env.cancelled?.()) throw Object.assign(new Error('Đã huỷ theo yêu cầu'), { kind: 'cancel' });
  const prompt = buildPrompt({ words: o.words || [], from: span.from, to: span.to, terms: o.terms || [] });
  const outF = path.join(o.dir, '.studio', `rehear_${process.pid}_${Date.now()}.json`);
  try {
    await run(o.py, ['-I', '-X', 'utf8', path.join(o.skill, 'scripts', 'rehear.py'), src.file, outF, '--from', span.from.toFixed(3), '--to', span.to.toFixed(3),
      '--model', model, '--lang', o.lang === 'auto' ? 'auto' : 'vi', `--prompt=${prompt}`], { // "=": chữ bắt đầu bằng "-" không thành cờ
      cwd: o.dir, onProc: env.onProc,
      onLine: l => { const m = /^@step ([\d.]+) (.*)$/.exec(l); if (m) say(0.1 + 0.85 * Math.min(1, +m[1]), m[2]); },
    });
    const r = JSON.parse(fs.readFileSync(outF, 'utf8'));
    const words = cleanWords(r.words);
    return { model: r.model || model, device: r.device || '', from: span.from, to: span.to, s: span.s, e: span.e, prompt, words, text: words.map(w => w.w).join(' '),
      ms: Date.now() - t, load_ms: r.load_ms | 0, run_ms: r.run_ms | 0, stem_ms, cached: src.cached };
  } finally { fs.rmSync(outF, { force: true }); }
}

/**
 * Nghe lại nhiều đoạn một lượt (M96 "Soát kỹ"): cùng tiếng nói (cache của rehear), cùng cách chọn model và prompt, nhưng
 * rehear.py nạp model MỘT lần rồi nghe lần lượt (--spans). o: như rehear nhưng spans [{s, e}] thay cho s, e.
 * env.onProgress(p, "Đoạn 3/9: …"). → {model, device, spans: [{s, e, from, to, prompt, words, text}], ms, load_ms, run_ms, stem_ms, cached}
 */
export async function rehearMany(o, env = {}) {
  const run = env.run || spawnRun, say = (p, st) => env.onProgress?.(p, st);
  const spans = checkSpans(o.spans, o.tl?.duration);
  const model = pickModel(o.tl?.asr?.model, o.model);
  const t = Date.now();
  say(0.03, 'Lấy tiếng nói trên timeline');
  const src = await voiceSource({ dir: o.dir, tl: o.tl, skill: o.skill, py: o.py, run, onProc: env.onProc });
  const stem_ms = Date.now() - t;
  if (env.cancelled?.()) throw Object.assign(new Error('Đã huỷ theo yêu cầu'), { kind: 'cancel' });
  const list = spans.map(sp => ({ ...sp, prompt: buildPrompt({ words: o.words || [], from: sp.from, to: sp.to, terms: o.terms || [] }) }));
  const tag = `${process.pid}_${Date.now()}`, inF = path.join(o.dir, '.studio', `rehear_spans_${tag}.json`), outF = path.join(o.dir, '.studio', `rehear_${tag}.json`);
  try {
    fs.writeFileSync(inF, JSON.stringify(list.map(x => ({ from: +x.from.toFixed(3), to: +x.to.toFixed(3), prompt: x.prompt }))));
    await run(o.py, ['-I', '-X', 'utf8', path.join(o.skill, 'scripts', 'rehear.py'), src.file, outF, '--spans', inF, '--model', model, '--lang', o.lang === 'auto' ? 'auto' : 'vi'], {
      cwd: o.dir, onProc: env.onProc,
      onLine: l => { const m = /^@step ([\d.]+) (.*)$/.exec(l); if (m) say(0.06 + 0.92 * Math.min(1, +m[1]), m[2]); },
    });
    const r = JSON.parse(fs.readFileSync(outF, 'utf8')), res = Array.isArray(r.results) ? r.results : [];
    const out = list.map((x, k) => { const words = cleanWords(res[k]?.words); return { s: x.s, e: x.e, from: x.from, to: x.to, prompt: x.prompt, words, text: words.map(w => w.w).join(' ') }; });
    return { model: r.model || model, device: r.device || '', spans: out, ms: Date.now() - t, load_ms: r.load_ms | 0, run_ms: r.run_ms | 0, stem_ms, cached: src.cached };
  } finally { fs.rmSync(inF, { force: true }); fs.rmSync(outF, { force: true }); }
}
