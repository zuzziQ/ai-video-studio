// "AI dựng giúp": Claude reads the transcript and plans the edit (pack, caption fixes, hook, 6–15 graphics on word starts, music, SFX).
// usage: node scripts/ai_edit.mjs <project_dir | timeline.json> [--out .studio/ai_plan.json] [--goal "khoá học"] [--tone "vui"]
//          [--pack keep|auto|<pack id>] [--density thua|vua|day] [--extra "…"] [--model sonnet] [--apply]
// Output plan (references/ai-edit.md): { pack, caption_style, hook, captions:[{i,t0,words:[{w,hl?,br?}]}], scenes:[…full scenes, _ai:true],
//   music:{mood,gain}, sfx:[{t,name,gain}], summary, dropped:[…] }. --apply writes it into timeline.json (replaces earlier _ai items only).
// S27 M194: dự án có kịch bản đã căn → dấu của kịch bản dựng thẳng (mục mang _sheet + _script ghi chú), Claude lấp phần còn lại;
//   plan.script = { total, done, req:[{id, seg, t0, kind, text, ok, why?}] } (dòng "Theo kịch bản" ở Studio). --no-stock: không tìm stock.
// Progress lines on stdout: "@@ <0..1> <step>" (read by studio/routes/20_ai.mjs).
import fs from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { findChrome } from './platform.mjs';
import { launchChrome } from './chrome_profile.mjs';
import { runLLM, askJSON, parseLooseJSON } from './llm.mjs';
import { faceZone } from './face_track_project.mjs';
import { safeOf, designOf } from './ai_qc.mjs'; // ai_qc runs its CLI only when executed directly; Chrome opens only in placePlan
import { readScript, scriptMarks, scriptPrompt, markMissing } from './script_doc.mjs';
// S27 M194: AI dựng theo kịch bản — bảng dựng nội bộ (.studio/build_sheet.json) dựng lại mỗi lần, áp cùng kế hoạch của Claude
import { DEFAULT_DUCK } from './audio_defaults.mjs';
import { readSheet, sheetFor, sheetToPlan, sheetPrompt, builtSegs, mediaKey, dynamicFor, scriptRequests, scriptReport, sheetMood as sheetMoodOf } from './script_build.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const say = (p, s) => console.log(`@@ ${p.toFixed(2)} ${s}`);
const r2 = v => Math.round(v * 100) / 100;
const BeatsCore = createRequire(import.meta.url)('../studio/features/33_beats.core.js');
// S28 M210: phách mạnh (giờ video) của nền nhạc người dùng có nhịp (Studio → tab Nhịp); AI dựng giữ nền đó nên cảnh hít vào phách mạnh
export function beatGrid(tl) {
  const m = tl?.audio?.music || [];
  if (!hasUserBed(m, tl?.duration || 0)) return [];
  return BeatsCore.grid(m.filter(isUserMusic), 'beat', tl.duration).filter(x => x.strong).map(x => x.t);
}
export const onBeat = (t, g, tol = .2) => { let best = t, d = tol; for (const x of g || []) { const e = Math.abs(x - t); if (e <= d) { d = e; best = x; } } return best; };
function beatText(tl) {
  const g = beatGrid(tl); if (!g.length) return '';
  const bpm = BeatsCore.brief(tl.audio.music.filter(isUserMusic), tl.duration)?.bpm;
  return `
# Nhịp nhạc nền (của người dùng, giữ nguyên): ${bpm} BPM, phách mạnh tại (giây): ${g.slice(0, 60).join(', ')}
Chọn từ khoá cho cảnh graphic / b-roll gần phách mạnh nhất có thể; phần mềm kéo mép cảnh vào phách mạnh trong ±0,2 s.
`;
}
// Packs that need footage the AI cannot invent (second camera, screen recording, cutouts, before/after photos, photo slideshows).
const SPECIAL = new Set(['hypecam', 'beatslide', 'multicam', 'screencast', 'greenscreen', 'transform']);
const LONG_TEXT = new Set(['code', 'definition', 'text', 'example', 'quote', 'body', 'desc', 'question', 'answer']);

export function loadProject(p) {
  const tlFile = p.endsWith('.json') ? path.resolve(p) : path.resolve(p, 'timeline.json');
  const dir = path.dirname(tlFile), tl = JSON.parse(fs.readFileSync(tlFile, 'utf8'));
  let caps = tl.captions;
  if (typeof caps === 'string') caps = JSON.parse(fs.readFileSync(path.join(dir, caps), 'utf8'));
  return { dir, tlFile, tl, caps: Array.isArray(caps) ? caps : [] };
}

// Pack catalog straight from the engine: every item's make(0) output, caption styles, and each recipe's long background scenes.
export async function engineCatalog(tl, caps, dir) {
  const { default: puppeteer } = await import('puppeteer-core');
  const CHROME = findChrome();
  const b = await launchChrome(puppeteer, { executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
  try {
    const pg = await b.newPage();
    await pg.goto(pathToFileURL(path.join(SKILL, 'engine/index.html')).href, { waitUntil: 'domcontentloaded' });
    const t = { ...tl, captions: caps, scenes: [], base: pathToFileURL(dir).href + '/' };
    await pg.evaluate(x => Promise.race([window.init(x), new Promise(r => setTimeout(r, 4000))]), t);
    return await pg.evaluate(ctx => ({
      captionStyles: Object.keys(CAPTION_STYLES),
      packs: PACKS.map(p => {
        let base = [], music = null;
        try { const r = p.recipe?.({ ...ctx, brand: BR() }); if (r) { music = r.music || null; base = (r.scenes || []).filter(s => s.t1 - s.t0 >= ctx.dur * .4); } } catch {}
        return { id: p.id, name: p.name, desc: p.desc || '', caption: p.caption || '', horizontal: !!p.horizontal, music, base,
          items: p.items.map(it => { try { return { type: it.type, label: it.label, ex: it.make(0) }; } catch { return null; } }).filter(Boolean) };
      }),
    }), { dur: tl.duration, captions: caps, vertical: (tl.height || 1920) > (tl.width || 1080), title: tl.title || '' });
  } finally { await b.close(); }
}

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
export function libraries() {
  const broll = readJson(path.join(SKILL, 'assets/broll/catalog.json')) || [];
  const sfx = readJson(path.join(SKILL, 'assets/sfx/catalog.json')) || [];
  const music = readJson(path.join(SKILL, 'assets/music/catalog.json')) || [];
  const tpls = readJson(path.join(SKILL, 'templates/index.json')) || [];
  return { broll, sfx, music, tpls };
}

// Example params made compact for the prompt: no t0/t1/type, long arrays cut to 3, long strings to 60 chars.
function compact(o, top = true) {
  if (Array.isArray(o)) return o.slice(0, 3).map(x => compact(x, false));
  if (o && typeof o === 'object') {
    const r = {};
    for (const [k, v] of Object.entries(o)) if (!(top && ['type', 't0', 't1'].includes(k))) r[k] = compact(v, false);
    return r;
  }
  return typeof o === 'string' && o.length > 60 ? o.slice(0, 57) + '…' : o;
}
const usesMedia = ex => /"(?:src|media|image)":""|"(?:media|broll|ui)\/[^"]+\.(?:jpe?g|png|mp4)"|"src":"media\//.test(JSON.stringify(ex));

export function buildPrompt({ tl, caps, cat, lib, o, script, sheet }) {
  const vertical = (tl.height || 1920) > (tl.width || 1080);
  const keep = o.pack && o.pack !== 'auto';
  const want = keep ? (o.pack === 'keep' ? tl.pack || 'slate' : o.pack) : null;
  const packs = cat.packs.filter(p => p.id === want || (!keep && !SPECIAL.has(p.id) && !(vertical && p.horizontal)) || p.id === 'basic');
  const items = new Map();
  for (const p of packs) for (const it of p.items) if (!usesMedia(it.ex)) items.set(it.type, { ...it, pack: p.id });
  const n = { thua: [5, 7], vua: [8, 11], day: [12, 15] }[o.density] || [8, 11];
  const transcript = caps.map((c, i) => `C${i} [${c.t0.toFixed(2)}–${c.t1.toFixed(2)}] ` + c.words.map((w, j) => `${j}:${w.w}`).join(' ')).join('\n');
  const topics = [...new Set(lib.broll.map(x => x.topic))].join(', ');
  const brTpl = [...new Set(lib.broll.map(x => x.template))].join(', ');
  const sfxNames = [...new Map(lib.sfx.map(x => [x.name.replace(/_\d+$/, ''), x])).values()].map(x => `${x.name.replace(/_\d+$/, '')} (${x.use || x.cat})`.slice(0, 70)).join('; ');
  const moods = [...new Set(lib.music.map(m => m.mood))].map(m => `${m}: ${(lib.music.find(x => x.mood === m)?.use || '').slice(0, 50)}`).join('; ');
  const packList = packs.filter(p => p.id !== 'basic').map(p => `- ${p.id}: ${p.name} — ${p.desc.slice(0, 120)} (phụ đề: ${p.caption || 'mặc định'})`).join('\n');
  const itemList = packs.map(p => `## Gói ${p.id}\n` + p.items.filter(it => items.get(it.type)?.pack === p.id).map(it => `- ${it.type} (${it.label}) ví dụ params: ${JSON.stringify(compact(it.ex))}`).join('\n')).join('\n');
  const tpl = lib.tpls.slice(0, 60).map(t => `${t.name} → ${t.pack}`).join('; ');
  const fz = faceZone(tl); // S13 · M103/M104: where the head is, so graphics are not planned over it
  const [DW, DH] = designOf(tl), SF = safeOf(tl), pc = (v, d) => Math.round(v / d * 100);
  const safe = `Vùng an toàn để đặt chữ (ngoài vùng này bị nút / mô tả của app che): x ${pc(SF.x, DW)}–${pc(SF.x + SF.w, DW)}%, y ${pc(SF.y, DH)}–${pc(SF.y + SF.h, DH)}%. Phụ đề nằm ở phần dưới khung (khoảng y ${vertical ? '62–80' : '75–92'}%).`;
  const layout = (fz ? `Mặt người nói nằm khoảng x ${fz.x0}–${fz.x1}%, y ${fz.y0}–${fz.y1}% của khung (tính từ góc trên trái). ` : 'Không dò được mặt người nói. ') + safe;
  // S17 M123: kịch bản có sẵn của người dùng — nội dung và dấu của nó thắng việc tự nghĩ
  // S27 M194: có bảng dựng thì prompt nhận bảng thay cho dấu thô: ô (chốt) là ràng buộc cứng; hàng DỰNG SẴN studio tự đặt, Claude lấp phần còn lại
  const sheetTxt = script && sheet?.rows?.length ? `
# Kịch bản theo đoạn, đã đọc dấu (thay cho dấu thô của kịch bản)
${sheetPrompt(sheet, builtSegs(sheet))}
LUẬT DẤU KỊCH BẢN (bắt buộc, thắng cả LUẬT KỊCH BẢN bên dưới khi mâu thuẫn): ô ghi "(chốt)" là ràng buộc cứng (dấu người dùng ghi trong kịch bản), không đổi, không bỏ.
- Hàng "DỰNG SẴN": studio tự đặt chữ / b-roll / SFX của hàng đó theo dấu; KHÔNG đặt graphic nào trong khoảng giờ của hàng đó.
- Hàng có CHỮ / B-ROLL nhưng không "DỰNG SẴN": đặt đúng nội dung đó trong khoảng giờ của hàng.
- MOOD chốt là mood của "music" (chọn mood gần nhất trong danh sách nhạc nền). Hàng không có ô chốt thì bạn dựng như bình thường.
` : '';
  const scr = script ? `
# Kịch bản của người dùng (phụ đề đã đúng NGUYÊN VĂN kịch bản; mỗi đoạn Đ có giờ đã khớp lời nói)
${sheetTxt || scriptPrompt(script)}
LUẬT KỊCH BẢN (bắt buộc, thắng các mục bên dưới khi mâu thuẫn): mẫu/gói quyết định GIAO DIỆN (bố cục, màu, kiểu chữ, hiệu ứng), kịch bản quyết định NỘI DUNG.
- Đoạn [HOOK]: "hook" lấy đúng chữ CHỮ của đoạn đó (không có thì rút gọn lời của đoạn), không tự nghĩ câu khác.
- Mỗi dòng CHỮ: một cảnh graphic chữ bắt đầu trong khoảng giờ của đoạn đó, ghi ĐÚNG nguyên văn chữ đó (chỉ rút gọn khi dài hơn ô cho phép).
- Mỗi dòng B-ROLL: một cảnh b-roll / hình minh hoạ trong khoảng giờ của đoạn đó, chủ đề khớp mô tả.
- Đoạn [CTA]: cảnh cuối là CTA/kết, chữ lấy từ đoạn CTA.
- Trong khoảng giờ của đoạn đã có dấu, KHÔNG thêm graphic chữ khác do bạn tự nghĩ. Đoạn không dấu thì dựng như bình thường.
- KHÔNG sửa chữ phụ đề ("captions" chỉ dùng để đặt "hl" / "br", giữ nguyên "words").
` : '';
  return `Bạn là editor video ngắn tiếng Việt chuyên nghiệp. Hãy lên bản dựng cho video người nói (talking-head) ${vertical ? 'dọc 9:16' : 'ngang 16:9'}, dài ${tl.duration}s.
Mục tiêu video: ${o.goal || 'khác'}. Giọng điệu: ${o.tone || 'tự nhiên'}. Mật độ graphic: ${n[0]}–${n[1]} cảnh.${o.extra ? `\nYêu cầu thêm của người dùng: ${o.extra}` : ''}${o.learned?.extra ? `\nThói quen đã học của thương hiệu ${o.learned.brand || ''} (người dùng hay sửa bản AI như vậy, làm theo): ${o.learned.extra}` : ''}
Brand: ${JSON.stringify(tl.brand || {})}

# Lời thoại (mỗi dòng là một phụ đề C<chỉ số> [giây bắt đầu–kết thúc], từng từ dạng <chỉ số từ>:<từ>; ${script ? 'chữ theo kịch bản của người dùng' : 'giọng nói nhận dạng tự động nên có thể sai chính tả'})
${transcript}
${scr}
# Gói style ${keep ? `(BẮT BUỘC dùng gói "${want}")` : '(chọn 1 gói hợp nhất với nội dung)'}
${packList}
Tham khảo mẫu có sẵn (tên mẫu → gói): ${tpl}

# Các loại graphic dùng được (chỉ dùng đúng type trong danh sách; gói "basic" dùng chung được với mọi gói)
${itemList}

# B-roll động (dùng trong params có {"broll":{"id":"<chủ đề>--<template>--<bảng màu>"}})
Chủ đề: ${topics}
Template: ${brTpl}
Bảng màu: ember, light, neon, ocean, violet, gold, forest, sunset, candy, mono

# Bố cục khung hình
${layout}

# Nhạc nền (mood): ${moods}${beatText(tl)}
# SFX: ${sfxNames}

# Việc cần làm
1. Chọn "pack" và "caption_style" (một trong: ${cat.captionStyles.join(', ')}; thường dùng kiểu phụ đề của gói).
2. Sửa phụ đề để hiển thị: sửa lỗi nhận dạng (tên riêng, chính tả, dấu), viết hoa tên riêng, có thể rút gọn từ thừa bằng cách để chuỗi rỗng "" cho từ đó. KHÔNG được đổi số lượng từ của dòng (mỗi từ giữ nguyên thời gian). "hl" = chỉ số các từ cần nhấn mạnh (1–2 từ khoá/dòng, không phải dòng nào cũng cần), "br" = chỉ số từ mà sau đó xuống dòng. Chỉ trả về các dòng có thay đổi.
3. Viết "hook": câu mở đầu giật tít ≤ 40 ký tự dựa trên nội dung. Cảnh đầu tiên (c=0,w=0) là cảnh hook hiển thị câu này.
4. Đặt ${n[0]}–${n[1]} cảnh graphic: mỗi cảnh bắt đầu ĐÚNG lúc người nói nói từ khoá liên quan, chỉ định bằng "c" (chỉ số dòng) và "w" (chỉ số từ). "dur" 1.5–6 giây. Các cảnh không chồng lên nhau về thời gian. Cảnh cuối nên là CTA/kết. "params" theo đúng cấu trúc ví dụ của type đó, viết nội dung thật bằng tiếng Việt có dấu, ngắn gọn: mỗi trường chữ dài xấp xỉ chữ trong ví dụ (graphic được thiết kế cho độ dài đó; trường số/giá trị chỉ vài ký tự; một dòng chữ ngắn tối đa 20 ký tự, dài hơn sẽ bị cắt nên tự rút gọn). Mọi trường thời gian bên trong params (t, reveal_t, …) tính bằng giây KỂ TỪ khi cảnh bắt đầu. Dùng b-roll có chủ đề khớp nội dung.
4b. Chất lượng (bắt buộc): graphic không được che mặt người nói khi họ đang nói — ưu tiên khối gọn, đặt trên đầu hoặc giữa mặt và phụ đề; không tạo thẻ/khung không có nội dung; mọi con số, %, giá, số liệu trong graphic PHẢI có nguyên văn trong lời thoại (không tự suy ra, không bịa); không để quá 6 giây liền không có graphic hay hiệu ứng nào (trừ khi cả video ngắn hơn).
5. Chọn nhạc nền "music": {"mood": "...", "gain": -18 đến -22} và 3–8 SFX đặt tại từ khoá/chỗ graphic xuất hiện: {"name": "...", "c": số, "w": số}.

Chỉ trả về DUY NHẤT một object JSON (không markdown, không giải thích ngoài JSON) theo dạng:
{"pack":"…","caption_style":"…","hook":"…","captions":[{"c":0,"words":["…"],"hl":[1],"br":[]}],"scenes":[{"type":"…","c":0,"w":0,"dur":2.5,"params":{}}],"music":{"mood":"…","gain":-20},"sfx":[{"name":"…","c":0,"w":0}],"summary":"1–2 câu tiếng Việt: vì sao chọn gói và cách dựng"}`;
}

// Kept for highlights.mjs, topic_video.mjs and tpl_fit.mjs: prompt → the model's text (text-only: Claude or the Ollama
// model picked in config.json), and relaxed JSON object parsing.
// extra: more runLLM options, e.g. { onProc } so a Studio job cancel can stop the call
export async function callClaude(prompt, model = 'sonnet', onTick, extra = {}) {
  return (await runLLM(prompt, { task: 'text', model, cwd: os.tmpdir(), ...extra, onTick: onTick && (() => onTick()) })).text;
}
export const parseJson = s => parseLooseJSON(s, { shape: 'object' });

// ---------- validation: everything the model says is checked against the engine catalog and the transcript ----------
const TKEY = /^(t|t0|t1|out|strike_at|[a-z_]*_t)$/;
function shiftRel(o, t0, t1, top = true) {
  if (Array.isArray(o)) return o.map(x => shiftRel(x, t0, t1, false));
  if (!o || typeof o !== 'object') return o;
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (!top && TKEY.test(k) && typeof v === 'number') r[k] = r2(Math.min(t1, Math.max(t0, v <= t1 - t0 + .01 ? t0 + v : v)));
    else if (top && TKEY.test(k) && typeof v === 'number' && !['t0', 't1'].includes(k)) r[k] = r2(Math.min(t1, Math.max(t0, t0 + v)));
    else r[k] = shiftRel(v, t0, t1, false);
  }
  return r;
}
function clampT(o, t0, t1, top = true) {
  if (Array.isArray(o)) return o.forEach(x => clampT(x, t0, t1, false));
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (TKEY.test(k) && typeof v === 'number' && !(top && (k === 't0' || k === 't1'))) o[k] = r2(Math.min(t1, Math.max(t0, v)));
    else if (v && typeof v === 'object') clampT(v, t0, t1, false);
  }
}
// S13 · M111: flag emoji (regional-indicator pairs 🇯🇵, tag flags 🏴) have no glyph in Segoe UI Emoji, so Chrome on Windows
// draws them as the letters "JP". They are dropped from graphic text (an emoji image would need a new asset set per flag).
const FLAG_RE = /[\u{1F1E6}-\u{1F1FF}]|\u{1F3F4}[\u{E0020}-\u{E007F}]+/gu;
export const hasFlag = s => typeof s === 'string' && /[\u{1F1E6}-\u{1F1FF}]|\u{1F3F4}[\u{E0020}-\u{E007F}]/u.test(s);
export const stripFlags = s => s.replace(FLAG_RE, '').replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/g, '');
// Text length follows the example of the same field (graphics are designed for that much text), with a hard cap.
// M62: cut at a word boundary. S13 · M111: the cap is looser (≥ 28 characters, 2.5× the example): the engine shrinks text to
// 70 % to fit its block before it would add "…", and QC reports a block the engine still had to cut (text_cut). Past the cap
// the text ends at a clause (",", ";", "–"…) when one is far enough in, else at a word; cuts = [] collects {text, max, cut}
// so Claude can write a shorter line instead (shortenCuts).
export function cleanText(o, ex, key = '', cuts) {
  if (Array.isArray(o)) return o.slice(0, 8).map(x => cleanText(x, Array.isArray(ex) ? ex[0] : undefined, key, cuts));
  if (o && typeof o === 'object') { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = cleanText(v, ex && typeof ex === 'object' ? ex[k] : undefined, k, cuts); return r; }
  if (typeof o === 'string') {
    if (hasFlag(o)) o = stripFlags(o);
    const max = Math.min(LONG_TEXT.has(key) ? 160 : 90, typeof ex === 'string' && ex.length ? Math.max(28, Math.ceil(ex.length * 2.5)) : 90);
    if (o.length <= max) return o;
    const cut = cutWords(o, max);
    if (cuts) cuts.push({ text: o, max, cut });
    return cut;
  }
  return o;
}
// Keep whole words (only a single word longer than the cap is cut inside) and drop a dangling separator before the ellipsis;
// a clause end in the second half of the cap is a clean stop without "…".
function cutWords(s, max) {
  const head = s.slice(0, max + 1), clause = Math.max(-1, ...[...head.matchAll(/[,;:.!?–—](?=\s)/gu)].map(m => m.index));
  if (clause >= max * .5 && clause < max) return s.slice(0, clause).trim();
  const cut = s.slice(0, max - 1), sp = cut.search(/\s\S*$/);
  const keep = /\s/.test(s[max - 1] || '') ? cut : sp > 0 ? cut.slice(0, sp) : cut;
  return keep.replace(/[\s,.;:+&/–—-]+$/u, '') + '…';
}
// S13 · M111: ask the model once for shorter lines in place of the word-boundary cuts cleanText made (plan.cuts). ask(prompt)
// → parsed JSON {texts:[…]}; a reply that is missing, not shorter, well past the cap, empty, cut or has a flag keeps the cut.
// → number replaced.
export async function shortenCuts(plan, ask) {
  const cuts = (plan.cuts || []).filter(c => c.cut !== c.text);
  if (!cuts.length) return 0;
  const prompt = `Các dòng chữ sau dài hơn ô graphic cho phép. Viết lại MỖI dòng ngắn hơn, giữ trọn ý và từ khoá (tiếng Việt có dấu, không cắt giữa từ, không dùng "…", không emoji cờ), độ dài tối đa ghi trong ngoặc:
${cuts.map((c, i) => `${i + 1}. (≤ ${c.max} ký tự) ${c.text}`).join('\n')}
Chỉ trả về DUY NHẤT một object JSON (không markdown): {"texts":["dòng 1", "dòng 2", …]} đúng ${cuts.length} dòng, đúng thứ tự.`;
  let r;
  try { r = await ask(prompt); } catch { return 0; }
  const texts = Array.isArray(r?.texts) ? r.texts : [];
  const map = new Map();
  // the cap is soft (the engine still shrinks text to fit, QC reports a block it had to cut): a rewrite a little over it is kept
  cuts.forEach((c, i) => { const t = typeof texts[i] === 'string' ? texts[i].trim() : ''; if (t && t.length < c.text.length && t.length <= Math.ceil(c.max * 1.25) && !hasFlag(t) && !t.endsWith('…')) map.set(c.cut, t); });
  let n = 0;
  const walk = o => {
    if (Array.isArray(o)) return o.forEach((v, i) => { if (typeof v === 'string' && map.has(v)) { o[i] = map.get(v); n++; } else walk(v); });
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) { if (typeof v === 'string' && map.has(v)) { o[k] = map.get(v); n++; } else walk(v); }
  };
  walk(plan.scenes);
  return n;
}
// S13 · M111: the text strings a graphic shows (same rule as inventedNumbers: no colours, ids, files, timing)
export function sceneStrings(scene) {
  const out = [];
  const walk = (v, k = '') => {
    if (Array.isArray(v)) return v.forEach(x => walk(x, k));
    if (v && typeof v === 'object') return Object.entries(v).forEach(([kk, x]) => { if (!NOT_TEXT.test(kk) && !/^(t|t0|t1|type|_.*)$/.test(kk)) walk(x, kk); });
    if (typeof v === 'string' && !v.startsWith('#')) out.push(v);
  };
  walk(scene);
  return out;
}
function fixBroll(o, lib, used) {
  if (Array.isArray(o)) return o.forEach(x => fixBroll(x, lib, used));
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (k === 'broll' && v && typeof v === 'object' && typeof v.id === 'string') v.id = resolveBroll(v.id, lib, used);
    else fixBroll(v, lib, used);
  }
}
function resolveBroll(id, lib, used) {
  const all = lib.broll;
  if (all.some(x => x.id === id)) return id;
  const [topic, tpl, pal] = id.split('--');
  const c = all.filter(x => x.topic === topic || x.tags?.some(t => t === topic?.replace(/-/g, ' ')));
  const pick = c.find(x => x.template === tpl && x.pal === pal) || c.find(x => x.template === tpl) || c.find(x => x.pal === pal && !used.has(x.id)) || c.find(x => !used.has(x.id)) || c[0];
  return pick ? (used.add(pick.id), pick.id) : 'cong-nghe-moi--neural--ember';
}
// S13 · M104: numbers a graphic shows that the speaker never said (a stat "13%" made up from "tuổi 25", or a leftover from the
// catalog example). Only text values are read (colours, ids, files, timing are not); 0–10 without % is allowed (step / list
// numbers, scores). Thousand separators are ignored ("84.000" = "84000"). → the offending tokens
const NUM = /\d+(?:[.,]\d+)*\s*%?/g, NOT_TEXT = /color|colour|bg|fill|font|src|file|id$|broll|url|anim|style|ease|icon|kf|anchor/i;
// "84.000" / "84,000" = "84000" (thousand groups); "2,5" stays "2,5" (decimal) so it never matches "25"
const numKey = t => t.replace(/\s/g, '').replace(/(\d)[.,](?=\d{3}(?!\d))/g, '$1');
// number fields that show a figure on screen (stat cards, scores, prices…): checked like text; coordinates / sizes / timing are not
const FIGURE = /value|percent|pct|score|stat|num|count|price|amount|total|number|rating/i, PCT_KEY = /percent|pct/i;
// numbers said, as "84000" and, when said as a percentage ("15%", "15 phần trăm"), also "15%"
export function saidNumbers(caps) {
  const text = caps.map(c => (c.words || []).map(w => w.w).join(' ')).join(' ').replace(/(\d[\d.,]*)\s*phần\s*trăm/giu, '$1%');
  return new Set((text.match(NUM) || []).flatMap(t => { const n = numKey(t); return n.endsWith('%') ? [n, n.slice(0, -1)] : [n]; }));
}
export function inventedNumbers(scene, said) {
  const bad = [];
  const walk = (v, k = '') => {
    if (Array.isArray(v)) return v.forEach(x => walk(x, k));
    if (v && typeof v === 'object') return Object.entries(v).forEach(([kk, x]) => { if (!NOT_TEXT.test(kk) && !/^(t|t0|t1|_.*)$/.test(kk)) walk(x, kk); });
    if (typeof v === 'number' && FIGURE.test(k)) {
      const pct = PCT_KEY.test(k), d = numKey(String(v));
      if ((pct || Math.abs(v) > 10) && !said.has(pct ? d + '%' : d)) bad.push(pct ? d + '%' : d);
      return;
    }
    if (typeof v !== 'string' || v.startsWith('#')) return;
    for (const tok of v.match(NUM) || []) {
      const n = numKey(tok), pct = n.endsWith('%'), d = n.replace(/%$/, '');
      if (!pct && +d <= 10) continue;
      if (!said.has(pct ? n : d)) bad.push(tok.trim()); // a % must have been said as a % ("tuổi 25" is not "25%")
    }
  };
  walk(scene);
  return bad;
}
const sheetTag = x => (Number.isInteger(x?._sheet) ? { _sheet: x._sheet, ...(x._script && typeof x._script === 'object' ? { _script: x._script } : {}) } : {});
export function validate(raw, { tl, caps, cat, lib, o, script }) {
  const fromSheet = !!o.sheet; // S27 M194: kế hoạch từ bảng dựng (planFromSheet): giữ _sheet + _script, không giới hạn 15 cảnh
  const dropped = [], cuts = []; // cuts: graphic text cut to fit (S13 · M111, shortenCuts)
  const BG = fromSheet ? [] : beatGrid(tl);
  const dur = tl.duration;
  const keep = o.pack && o.pack !== 'auto';
  const vertical = (tl.height || 1920) > (tl.width || 1080);
  const packIds = new Set(cat.packs.map(p => p.id));
  let pack = keep ? (o.pack === 'keep' ? tl.pack || 'slate' : o.pack) : String(raw.pack || '');
  if (!packIds.has(pack) || (!keep && SPECIAL.has(pack))) { dropped.push(`gói "${raw.pack}" không hợp lệ → giữ ${tl.pack || 'slate'}`); pack = tl.pack || 'slate'; }
  const P = cat.packs.find(p => p.id === pack);
  const caption_style = cat.captionStyles.includes(raw.caption_style) ? raw.caption_style : (P.caption || tl.caption_style || 'slate');
  const items = new Map();
  for (const p of cat.packs) if (p.id === pack || p.id === 'basic') for (const it of p.items) if (!usesMedia(it.ex)) items.set(it.type, it);
  const wordT = (c, w) => { const cap = caps[+c]; if (!cap) return null; const ws = cap.words; return (ws[Math.min(ws.length - 1, Math.max(0, +w || 0))] || {}).s ?? cap.t0; };
  // captions: same word count, timings untouched
  const capOut = [];
  for (const e of Array.isArray(raw.captions) ? raw.captions : []) {
    const i = +e.c, cap = caps[i];
    if (!cap || !Array.isArray(e.words) || e.words.length !== cap.words.length) { dropped.push(`phụ đề C${e.c}: sai số từ`); continue; }
    const hl = new Set((e.hl || []).map(Number)), br = new Set((e.br || []).map(Number));
    // S17 M123: phụ đề theo kịch bản giữ nguyên chữ, chỉ nhận nhấn từ (hl) và xuống dòng (br)
    const words = e.words.map((w, j) => ({ w: script ? cap.words[j].w : String(w ?? '').trim().slice(0, 24), ...(hl.has(j) ? { hl: true } : {}), ...(br.has(j) && j < e.words.length - 1 ? { br: true } : {}) }));
    if (words.every(w => !w.w)) { dropped.push(`phụ đề C${i}: rỗng`); continue; }
    capOut.push({ i, t0: cap.t0, n: cap.words.length, words });
  }
  const said = saidNumbers(caps); // numbers the speaker said (recognised words, not Claude's caption edits: those could "make" a number)
  // scenes: known types only, start on a word, clamp to the video, no overlaps
  const used = new Set(), sc = [];
  for (const s of Array.isArray(raw.scenes) ? raw.scenes : []) {
    const it = items.get(s.type);
    if (!it) { dropped.push(`cảnh "${s.type}" không có trong gói`); continue; }
    let t0 = wordT(s.c, s.w);
    if (t0 == null) t0 = typeof s.t0 === 'number' ? s.t0 : null;
    if (t0 == null) { dropped.push(`cảnh ${s.type}: thiếu thời điểm`); continue; }
    t0 = r2(Math.max(0, Math.min(dur - .8, t0 - .05)));
    if (BG.length) t0 = r2(Math.min(dur - .8, onBeat(t0, BG))); // S28 M210: mở cảnh đúng phách mạnh
    let t1 = r2(Math.min(dur, t0 + Math.min(8, Math.max(.8, +s.dur || (it.ex.t1 - it.ex.t0) || 2.5))));
    if (BG.length) { const b = onBeat(t1, BG); if (b - t0 >= .8 && b <= dur) t1 = r2(b); }
    const params = cleanText(s.params && typeof s.params === 'object' ? s.params : {}, it.ex, '', cuts);
    for (const k of ['type', 't0', 't1', 'cid', '_orig', '_ai']) delete params[k];
    const ex = shiftRel(it.ex, t0, t1);
    const scene = { ...ex, ...shiftRel(params, t0, t1), type: s.type, t0, t1, _ai: true, ...(fromSheet ? sheetTag(s) : {}) };
    fixBroll(scene, lib, used);
    const made = inventedNumbers(scene, said);
    if (made.length) { dropped.push(`cảnh ${s.type} @${t0}s: số liệu "${made.slice(0, 3).join('", "')}" không có trong lời thoại`); continue; }
    sc.push(scene);
  }
  sc.sort((a, b) => a.t0 - b.t0);
  // S27 M194: cảnh theo kịch bản đã trên timeline mà lần này không dựng lại (applyPlan giữ): cảnh AI chồng giờ đó bị bỏ.
  // o.merge = lần AI dựng có kịch bản: mục _sheet cũ được thay, cảnh chồng cảnh mới bị bỏ ở mergeScript
  const fixed = fromSheet || o.merge ? [] : (tl.scenes || []).filter(s => Number.isInteger(s._sheet) && !s._base && !s.hidden);
  const scenes = [];
  for (const s of sc) {
    const f = fixed.find(x => x.t0 < s.t1 - .05 && x.t1 > s.t0 + .05);
    if (f) { dropped.push(`cảnh ${s.type} @${s.t0}s chồng cảnh theo kịch bản (đoạn ${f._sheet + 1})`); continue; }
    const prev = scenes[scenes.length - 1];
    if (prev && s.t0 < prev.t1 - .05) {
      if (prev.t1 + .8 <= s.t1) { s.t0 = r2(prev.t1); clampT(s, s.t0, s.t1); }
      else { dropped.push(`cảnh ${s.type} @${s.t0}s chồng lên cảnh trước`); continue; }
    }
    scenes.push(s);
  }
  if (!fromSheet && scenes.length > 15) dropped.push(`bớt ${scenes.length - 15} cảnh thừa`), scenes.splice(15);
  // base layer from the chosen pack's recipe (frame, progress bar …) so the AI graphics sit on the right background
  const base = (P.base || []).map(s => ({ ...s, _ai: true, _base: true }));
  const moods = new Set(lib.music.map(m => m.mood));
  const mood = moods.has(raw.music?.mood) ? raw.music.mood : (P.music && moods.has(P.music) ? P.music : 'tech');
  const music = { t0: 0, t1: dur, mood, gain: Math.max(-26, Math.min(-14, +raw.music?.gain || -20)), _ai: true };
  const sfxNames = new Set(lib.sfx.map(x => x.name));
  const sfx = [];
  for (const x of Array.isArray(raw.sfx) ? raw.sfx.slice(0, fromSheet ? 60 : 10) : []) {
    const name = sfxNames.has(x.name) ? x.name : sfxNames.has(String(x.name).replace(/_\d+$/, '')) ? String(x.name).replace(/_\d+$/, '') : null;
    const t = wordT(x.c, x.w) ?? (typeof x.t === 'number' ? x.t : null);
    if (!name || t == null || t >= dur) { dropped.push(`SFX "${x.name}" không hợp lệ`); continue; }
    sfx.push({ t: r2(Math.max(0, t - .05)), name, gain: -12, _ai: true, ...(fromSheet ? sheetTag(x) : {}) });
  }
  const marks = script ? scriptMarks(script) : [], hookMark = marks.find(m => m.kind === 'hook');
  const cut60 = s => { s = String(s).trim(); if (s.length <= 60) return s; const w = s.slice(0, 61).split(/\s+/); w.pop(); return w.join(' ') || s.slice(0, 60); };
  const hook = hookMark ? cut60(hookMark.text) : String(raw.hook || '').slice(0, 60); // S17 M123: hook theo [HOOK] của kịch bản
  // S17 M123: dấu của kịch bản chưa có cảnh tương ứng → ghi lại (QC báo "dấu kịch bản chưa đặt")
  const miss = script ? markMissing(marks, [...base, ...scenes], { strings: sceneStrings, title: hook }) : [];
  for (const m of miss) dropped.push(`kịch bản: dấu ${m.kind === 'broll' ? 'B-ROLL' : m.kind === 'screen' ? 'CHỮ' : m.kind.toUpperCase()} “${String(m.text).slice(0, 40)}” @${m.t0}s chưa có cảnh`);
  return { pack, caption_style, hook, captions: capOut, scenes: [...base, ...scenes], music, sfx, summary: String(raw.summary || '').slice(0, 400), dropped, cuts, created: new Date().toISOString(),
    ...(script ? { script: { marks: marks.length, missing: miss.map(m => ({ kind: m.kind, text: m.text, t0: m.t0 })) } } : {}) };
}

// S19 M134: chính tả đã học "sai → đúng" (từng từ, không phân biệt hoa thường, giữ dấu câu hai đầu). Trả số từ đã sửa.
export function applyDict(caps, dict) {
  const m = new Map((Array.isArray(dict) ? dict : []).filter(e => e && typeof e.from === 'string' && typeof e.to === 'string' && !/\s/.test(e.from)).map(e => [e.from.normalize('NFC').toLocaleLowerCase('vi'), e.to]));
  if (!m.size) return 0;
  let n = 0;
  for (const c of caps || []) for (const w of c.words || []) {
    const x = /^([,.!?:;"'“”…()[\]-]*)(.*?)([,.!?:;"'“”…()[\]-]*)$/su.exec(String(w.w ?? '').normalize('NFC'));
    const to = x && m.get(x[2].toLocaleLowerCase('vi'));
    if (to && to !== x[2]) { w.w = x[1] + to + x[3]; n++; }
  }
  return n;
}
// S19 M134: thói quen đã học (opts.learned của 20_ai.mjs) áp lên kế hoạch: bỏ loại graphic người dùng hay xoá, không nhạc /
// chỉnh dB, kiểu phụ đề hay đổi, chính tả (plan.dict, Studio áp cho mọi dòng phụ đề). Ghi plan.learned = các điều đã áp.
const KIND_OF = { emoji: t => t === 'emoji_pop', text: t => t === 'text', photo: t => t === 'photo' };
export function applyLearned(plan, L) {
  if (!L || typeof L !== 'object') return plan;
  const drop = (Array.isArray(L.drop) ? L.drop : []).filter(k => Object.hasOwn(KIND_OF, k));
  if (drop.length) {
    const before = plan.scenes.length;
    plan.scenes = plan.scenes.filter(s => s._base || !drop.some(k => KIND_OF[k](s.type)));
    if (plan.scenes.length < before) plan.dropped.push(`bỏ ${before - plan.scenes.length} cảnh theo thói quen của thương hiệu`);
  }
  // S27 M192: khối / SFX người dùng hay xoá (gu thương hiệu) bỏ khỏi kế hoạch, trừ mục theo kịch bản (_sheet: dấu người dùng viết)
  const avoid = new Set(Array.isArray(L.avoid) ? L.avoid : []), avoidSfx = new Set(Array.isArray(L.avoid_sfx) ? L.avoid_sfx : []);
  if (avoid.size) {
    const before = plan.scenes.length;
    plan.scenes = plan.scenes.filter(s => s._base || s._sheet != null || !avoid.has(s.type));
    if (plan.scenes.length < before) plan.dropped.push(`bỏ ${before - plan.scenes.length} khối người dùng hay xoá (gu thương hiệu)`);
  }
  if (avoidSfx.size && Array.isArray(plan.sfx)) plan.sfx = plan.sfx.filter(x => x._sheet != null || !avoidSfx.has(String(x.name || '').replace(/_\d+$/, '')));
  if (L.music === 'off') plan.music = null;
  else if (plan.music && Number.isFinite(+L.music_gain) && +L.music_gain) plan.music.gain = Math.max(-30, Math.min(-8, +(plan.music.gain + +L.music_gain).toFixed(1)));
  if (typeof L.caption_style === 'string' && L.caption_style) plan.caption_style = L.caption_style;
  if (Array.isArray(L.dict) && L.dict.length) plan.dict = L.dict.slice(0, 50);
  plan.learned = (Array.isArray(L.notes) ? L.notes : []).slice(0, 30);
  return plan;
}
// S26 M182: nhạc nào là của người dùng. Studio ghi _orig khi người dùng sửa một phần tử (đổi mood, gain…); nhạc có file/Kho (tự tải, tự chọn) cũng là
// của họ. Nhạc khởi đầu (new_project / highlights: mood 'tech', không file, không _orig) và nhạc _ai/_auto chưa ai đụng thì AI được thay.
// Không xét gain để đổi gain mặc định không làm hỏng nhận diện.
export const isUserMusic = m => !!m && (!!m._orig || (!m._ai && !m._auto && (!!m.file || !!m.kho || !!m.title || (!!m.mood && m.mood !== 'tech'))));
export const hasUserBed = (music, dur) => (music || []).some(m => isUserMusic(m) && m.t0 <= .05 && m.t1 >= dur - .1);
// S27 M194 / M195: nền nhạc theo kịch bản (một hoặc nhiều khúc _sheet): AI dựng không kèm kịch bản giữ như nhạc người dùng chọn
export const hasSheetBed = music => (music || []).some(m => m._sheet != null && !m.hidden);
// S27 M195: nền nhạc theo kịch bản (mảng khúc _sheet) → (music mới, kept). Bài học ai-video-studio-020: nền tự sinh (_ai, _auto, _sheet,
// nhạc khởi đầu) bị thay và cất vào _was của khúc đầu (nền _sheet cũ thì lấy lại _was của nó, không lồng nền trong nền); nhạc người dùng
// (isUserMusic: file / tay) giữ song song, nền người dùng phủ cả video thì không thêm; khúc _sheet đã chỉnh tay (_orig) → giữ CẢ nền.
// Bản client: studio/features/20_ai.js sheetMusic (cùng luật; scripts/tests/s27_m195.test.mjs so hai bản).
export function sheetMusic(music, plan, dur) {
  music = music || [];
  if (music.some(m => m._sheet != null && m._orig)) return { music, kept: 'orig' };
  const full = Array.isArray(plan) || !!plan, keepUser = music.some(m => isUserMusic(m) && m.t0 <= .05 && m.t1 >= dur - .1);
  const gone = m => !isUserMusic(m) && (m._ai || m._auto || m._sheet != null || (full && m.t0 <= .05 && m.t1 >= dur - .1));
  const stay = music.filter(m => !gone(m)), was = music.filter(gone).flatMap(m => (m._sheet != null ? m._was || [] : [m]));
  if (keepUser || !plan) return { music: stay, kept: keepUser ? 'user' : null };
  const beds = (Array.isArray(plan) ? plan : [{ ...plan, t0: 0, t1: dur }]).filter(m => m.t0 < dur - .05).map(m => ({ ...m, t1: Math.min(m.t1, dur) }));
  if (beds.length) { beds[beds.length - 1].t1 = dur; if (was.length) beds[0]._was = was; }
  return { music: [...stay, ...beds], kept: null };
}
/** Hoàn tác nhạc theo kịch bản: bỏ các khúc _sheet, trả lại nền đã cất trong _was. */
export const dropSheetMusic = music => [...(music || []).filter(m => m._sheet == null), ...(music || []).filter(m => m._sheet != null).flatMap(m => m._was || [])];
/** Nhạc của kế hoạch cho người đọc: "hype → sad (2 khúc)" / "tắt" / tên bài Kho. */
export function musicLabel(music) {
  const list = Array.isArray(music) ? music : music ? [music] : [];
  if (!list.length) return 'tắt';
  const names = list.map(m => (m.kho ? `${m.title || m.kho} (Kho)` : String(m.mood || '').replace(/_\d+$/, ''))).filter((x, i, a) => x && x !== a[i - 1]);
  return names.join(' → ') + (list.length > 1 ? ` (${list.length} khúc)` : '');
}

// Apply a plan: earlier AI items (and untouched recipe items) are replaced; anything the user edited (_orig) or added stays.
// S27 M194: kế hoạch theo kịch bản (plan.script) thay cả mục _sheet cũ chưa sửa tay; mục _sheet bạn đã sửa tay (_orig) giữ, và mục mới
// cùng đoạn cùng loại không thêm lần nữa. Kế hoạch không kèm kịch bản giữ mục _sheet và nền nhạc của nó (như nhạc người dùng chọn).
// Bản client: studio/features/20_ai.js applyPlan (cùng luật; scripts/tests/s27_m194.test.mjs so hai bản).
export function applyPlan(tl, caps, plan) {
  const starter = !!tl._starter; delete tl._starter; // never-opened "Video mới" project: its starter scenes are placeholders
  const merged = !!plan.script, key = x => `${x._sheet}|${x.type || x.name}`;
  const mine = s => starter || ((s._ai || s._recipe) && !s._orig && (merged || s._sheet == null));
  const mineS = new Set(merged ? (tl.scenes || []).filter(s => s._sheet != null && s._orig).map(key) : []);
  const mineX = new Set(merged ? (tl.audio?.sfx || []).filter(x => x._sheet != null && x._orig).map(key) : []);
  tl.pack = plan.pack; tl.caption_style = plan.caption_style || undefined;
  if (plan.hook) tl.title = plan.hook;
  tl.scenes = [...(tl.scenes || []).filter(s => !mine(s)), ...plan.scenes.filter(s => s._sheet == null || !mineS.has(key(s)))];
  tl.audio = tl.audio || {};
  // plan.music null (thói quen "không nhạc", M134): bỏ nhạc _ai cũ, không thêm nhạc mới
  // S26 M182: nhạc người dùng đã chọn / chỉnh (isUserMusic) được giữ và thắng nhạc AI; chỉ nhạc _ai/_auto hoặc nhạc khởi đầu chưa ai đụng bị thay
  const keep = hasUserBed(tl.audio.music, tl.duration) || (!merged && hasSheetBed(tl.audio.music, tl.duration));
  // S27 M195: nhạc theo kịch bản nhiều khúc (hoặc nền theo kịch bản đã chỉnh tay) đi sheetMusic; nền theo kịch bản luôn có duck (tự hạ nhạc dưới giọng)
  if (merged && (Array.isArray(plan.music) || (tl.audio.music || []).some(m => m._sheet != null && m._orig))) {
    const r = sheetMusic(tl.audio.music, plan.music, tl.duration);
    tl.audio.music = r.music;
    if (!r.kept && plan.music && (!tl.audio.duck || typeof tl.audio.duck !== 'object')) tl.audio.duck = { ...DEFAULT_DUCK };
  } else tl.audio.music = [...(tl.audio.music || []).filter(m => isUserMusic(m) || (!merged && m._sheet != null) || !(m._ai || m._auto || m._sheet != null || (plan.music && m.t0 <= .05 && m.t1 >= tl.duration - .1))), ...(plan.music && !keep ? [plan.music] : [])];
  tl.audio.sfx = [...(tl.audio.sfx || []).filter(x => !x._ai || (x._sheet != null && (!merged || x._orig))), ...plan.sfx.filter(x => x._sheet == null || !mineX.has(key(x)))];
  let n = 0;
  for (const e of plan.captions) {
    const c = caps[e.i];
    if (!c || c.words.length !== e.n || Math.abs(c.t0 - e.t0) > .02) continue;
    e.words.forEach((w, j) => { const cw = c.words[j]; cw.w = w.w; if (w.hl) cw.hl = true; else delete cw.hl; if (w.br) cw.br = true; else delete cw.br; });
    c.words = c.words.filter(w => w.w); n++;
  }
  applyDict(caps, plan.dict);
  return n;
}
/**
 * S27 M194: dấu của kịch bản (bảng dựng nội bộ) → phần kế hoạch đi qua validate như bản của Claude. ctx = { tl, caps, cat, lib };
 * media = { [mediaKey]: {seq}|{path} } đã liên kết vào dự án (Kho, thư viện, stock, ảnh AI), mediaErr = { [mediaKey]: lý do }.
 * Chữ và b-roll động validate riêng (hai lớp được chồng nhau), ảnh / clip thêm thẳng. Cảnh nền của gói (_base) không lặp lại.
 * → { scenes, music: [khúc] | undefined, sfx, clips, miss: { [id yêu cầu]: lý do }, notes: [ghi chú nhạc], dropped, cuts }
 */
export function planFromSheet(sheet, { tl, caps, cat, lib }, media = {}, mediaErr = {}) {
  const raw = sheetToPlan(sheet, tl, { design: designOf(tl), media, mediaErr, dynIds: new Set(lib.broll.map(x => x.id)), dynCat: new Map(lib.broll.map(x => [x.id, x])),
    catalog: lib.music, mood: (tl.audio?.music || []).find(m => m.mood && !m.file)?.mood?.replace(/_\d+$/, '') });
  const ctx = { tl, caps, cat, lib, o: { pack: 'keep', sheet: true }, script: null };
  const head = { pack: tl.pack, caption_style: tl.caption_style };
  const a = validate({ ...head, scenes: raw.text, sfx: raw.sfx, music: null }, ctx), b = validate({ ...head, scenes: raw.dyn }, ctx);
  const scenes = [...a.scenes, ...b.scenes].filter(s => !s._base).concat(raw.photos).sort((x, y) => x.t0 - y.t0);
  const music = raw.music; // S27 M195: nền nhiều khúc (musicFromSheet đã kiểm mood theo catalog), undefined = giữ nhạc
  return { scenes, music, sfx: a.sfx, clips: raw.clips, miss: raw.miss, notes: raw.notes || [], dropped: [...raw.dropped, ...a.dropped, ...b.dropped], cuts: a.cuts };
}
/**
 * S27 M194: gộp phần dựng theo dấu kịch bản (planFromSheet) vào kế hoạch của Claude, sửa `plan` tại chỗ: cảnh của Claude chồng giờ cảnh
 * theo kịch bản bị bỏ (dấu thắng), SFX của Claude trùng lúc SFX theo kịch bản bị bỏ, nhạc nền mang mood + ghi chú của dấu MOOD.
 * Lời "kịch bản: dấu B-ROLL / CHỮ … chưa có cảnh" của Claude thay bằng lý do của từng yêu cầu (báo cáo plan.script).
 */
export function mergeScript(plan, sp) {
  const own = [];
  for (const s of plan.scenes) {
    const f = !s._base && sp.scenes.find(x => x.t0 < s.t1 - .05 && x.t1 > s.t0 + .05);
    if (f) { plan.dropped.push(`cảnh ${s.type} @${s.t0}s chồng cảnh theo kịch bản (đoạn ${f._sheet + 1})`); continue; }
    own.push(s);
  }
  plan.scenes = [...own.filter(s => s._base), ...[...own.filter(s => !s._base), ...sp.scenes].sort((x, y) => x.t0 - y.t0)];
  plan.sfx = [...plan.sfx.filter(x => !sp.sfx.some(y => Math.abs(y.t - x.t) < .3)), ...sp.sfx].sort((x, y) => x.t - y.t);
  // S27 M195: nhạc theo kịch bản = một nền nhiều khúc thay nền Claude chọn (plan.music null = thói quen "không nhạc" giữ nguyên)
  if (plan.music && sp.music) plan.music = sp.music.map(m => ({ ...m }));
  plan.dropped = [...plan.dropped.filter(d => !/^kịch bản: dấu (B-ROLL|CHỮ) /.test(d)), ...sp.dropped, ...(sp.notes || [])];
  return plan;
}

// ---------- CLI ----------
async function main() {
  const src = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--apply'));
  if (!src) { console.error('usage: node scripts/ai_edit.mjs <project_dir|timeline.json> [--out plan.json] [--goal …] [--pack keep|auto|id] [--density thua|vua|day] [--apply]'); process.exit(2); }
  const o = { goal: opt('--goal', ''), tone: opt('--tone', ''), pack: opt('--pack', 'auto'), density: opt('--density', 'vua'), extra: opt('--extra', '') };
  const optFile = opt('--opts'); if (optFile) Object.assign(o, readJson(optFile) || {});
  // S27 M192: --taste <thương hiệu> (mẫu dựng sẵn): gu đã học của thương hiệu, như opts.learned của 20_ai.mjs
  if (opt('--taste') && !o.learned) { const P = await import('./profile.mjs'); o.learned = P.learnedOf(P.habitsFor(opt('--taste'))); }
  const { dir, tlFile, tl, caps } = loadProject(src);
  if (!caps.length) throw new Error('Dự án chưa có phụ đề (cần lời thoại để AI đọc).');
  say(.05, 'Đọc danh sách gói style từ engine');
  const cat = await engineCatalog(tl, caps, dir);
  const lib = libraries();
  const sc = readScript(dir), script = sc?.align ? sc : null; // S17 M123: chỉ kịch bản đã căn với phụ đề
  // S27 M194: kịch bản đã căn → dựng lại bảng nội bộ (giờ đã căn, Kho / thư viện / stock), Claude lấp phần dấu không có
  let sheet = null;
  if (script) {
    say(.08, 'Đọc dấu của kịch bản, tìm cảnh trong Kho / thư viện');
    try { sheet = await sheetFor(dir, { tl, captions: caps, stock: !args.includes('--no-stock') }); } catch (e) { console.log('Bảng dựng: ' + String(e.message || e).slice(0, 200)); sheet = readSheet(dir); }
    if (!sheet?.rows?.length) sheet = null;
  }
  // S27 M198: nguồn người dùng đưa ở ô Kịch bản: đoạn ghi file đã có ô (sheetFor); file chưa gắn đoạn → Claude xem khung ảnh rồi chọn đoạn
  const sources = sheet ? await userSources(dir, tl, sheet, opt('--model', o.model || 'sonnet')) : [];
  const ctx = { tl, caps, cat, lib, o: { ...o, merge: !!sheet }, script, sheet };
  const prompt = buildPrompt(ctx);
  fs.mkdirSync(path.join(dir, '.studio'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.studio/ai_prompt.txt'), prompt);
  let p = .15, t0 = 0;
  const model = opt('--model', o.model || 'sonnet');
  const raw = await askJSON(prompt, { task: 'text', model, cwd: os.tmpdir(), shape: 'object', retries: 1,
    onAttempt: attempt => { if (attempt) p = .5; t0 = Date.now(); say(p, attempt ? 'Claude trả lời chưa đúng JSON — hỏi lại' : `Claude đang đọc lời thoại và lên bản dựng (${Math.round(prompt.length / 1000)}k ký tự, 20–90 giây)`); },
    onTick: () => { const s = (Date.now() - t0) / 1000; say(Math.min(.88, p + .7 * (1 - Math.exp(-s / 45))), `Claude đang lên bản dựng… ${Math.round(s)}s`); },
    onRaw: res => fs.writeFileSync(path.join(dir, '.studio/ai_raw.txt'), res) });
  say(.92, 'Kiểm tra và sửa kết quả');
  const plan = applyLearned(validate(raw, ctx), o.learned);
  // S13 · M111: text too long for its graphic → one short call for shorter lines instead of a "…" cut (cut kept if it fails)
  if (plan.cuts.length && !args.includes('--no-shorten')) {
    say(.925, `Viết ngắn lại ${plan.cuts.length} dòng chữ quá dài`);
    const n = await shortenCuts(plan, p => askJSON(p, { task: 'text', model, cwd: os.tmpdir(), shape: 'object', retries: 0 }));
    console.log(`chữ quá dài: ${plan.cuts.length} · Claude viết ngắn lại ${n}`);
  }
  // S27 M194: dựng theo dấu kịch bản (media vào dự án, planFromSheet) rồi gộp vào kế hoạch của Claude: một kế hoạch, một bước hoàn tác
  let sp = null;
  if (sheet) {
    const media = await sheetMedia(dir, tl, sheet, (k, t) => say(.925 + k * .005, t), lib.broll);
    sp = planFromSheet(sheet, { tl, caps, cat, lib }, media.media, media.err);
    mergeScript(plan, sp);
  }
  // mood chốt của kịch bản thắng mood Claude chọn
  const sm = sheet && sheetMoodOf(sheet);
  if (plan.music && !Array.isArray(plan.music) && sm && lib.music.some(m => m.mood === sm)) plan.music.mood = sm;
  // S26 M182: đã có nhạc phủ cả video do người dùng chọn/chỉnh → giữ, không đề xuất nhạc mới
  if (plan.music && hasUserBed(tl.audio?.music, tl.duration)) { plan.music = null; plan.keptMusic = true; plan.summary = (plan.summary ? plan.summary.replace(/\s*$/, ' ') : '') + 'Giữ nhạc bạn chọn.'; }
  // S12 · M99: nhạc nền ưu tiên Nhac/ của Kho khi có bài hợp mood → media/kho_* (nguồn ghi ở media/credits.json); không có thì nhạc thư viện
  // S19 M138: phong cách thương hiệu chọn nhạc riêng (opts.music_pick = 'kho' | 'kho:<rel>') → bài đó thắng bài hợp mood
  if (plan.music && !Array.isArray(plan.music)) try { const K = await import('./kho_media.mjs'); const k = (o.music_pick && await K.khoMusicPick(dir, tl, o.music_pick)) || await K.khoMusic(dir, tl, plan.music.mood); if (k) plan.music = { ...plan.music, file: k.file, kho: k.kho, title: k.title }; } catch (e) { console.log('Kho: bỏ qua nhạc Kho (' + e.message + ')'); }
  // S27 M195: nền theo kịch bản: mỗi khúc NHẠC: kho … → khoMusicPick; còn lại bài Kho hợp mood (khoMusic), không có thì nhạc thư viện.
  // opts.music_pick (một bài cho mọi video của phong cách) không áp: kịch bản đã chọn nhạc theo đoạn.
  if (Array.isArray(plan.music) && plan.music.length) try {
    const K = await import('./kho_media.mjs'), byMood = new Map();
    for (const m of plan.music) {
      const pick = m.pick, mood = String(m.mood).replace(/_\d+$/, ''); delete m.pick;
      let k = pick ? await K.khoMusicPick(dir, tl, pick).catch(() => null) : null;
      if (pick && !k) plan.dropped.push(`Nhạc: Kho chưa có bài “${pick.slice(4) || 'nhạc'}”, dùng nhạc thư viện ${mood}`);
      if (!k) { if (!byMood.has(mood)) byMood.set(mood, await K.khoMusic(dir, tl, mood).catch(() => null)); k = byMood.get(mood); }
      if (k) Object.assign(m, { file: k.file, kho: k.kho, title: k.title });
    }
  } catch (e) { console.log('Kho: bỏ qua nhạc Kho (' + e.message + ')'); }
  // S13 · M104: render the plan once and move graphics off the speaking face / captions / unsafe edges before it is applied
  if (!args.includes('--no-place')) {
    say(.93, 'Đặt graphic né mặt, phụ đề và mép khung');
    try {
      const { placePlan } = await import('./ai_qc.mjs');
      const kept = (tl.scenes || []).filter(s => !(tl._starter || ((s._ai || s._recipe) && !s._orig && (!!sp || s._sheet == null)))); // what applyPlan keeps
      // the plan's scenes go in as tagged copies (a failed placement leaves plan.scenes untouched, no tag leaks into the plan)
      const r = await placePlan(dir, tl, caps, { ...plan, scenes: [...kept, ...plan.scenes.map(s => ({ ...s, _planned: true }))] },
        { only: s => s._planned && !(s._sheet != null && (s.type === 'photo' || s.layout === 'full')), tag: { _ai: true, _planned: true }, onP: k => say(.93 + k * .06, `Đặt graphic né mặt và phụ đề… ${Math.round(k * 100)}%`) });
      plan.scenes = r.scenes.filter(s => s._planned).map(({ _planned, ...s }) => s); plan.placed = { moved: r.moved, left: r.left.map(i => ({ t: i.t, kind: i.kind, msg: i.msg })) };
    } catch (e) { console.log('Bỏ qua bước đặt chỗ: ' + e.message.slice(0, 200)); plan.placed = { error: e.message.slice(0, 200) }; }
  }
  if (sp) { // báo cáo cuối cùng (sau nhạc, đặt chỗ): "Theo kịch bản: x/y yêu cầu đã dựng"
    if (plan.keptMusic && sp.music) { for (const m of sp.music) if (m._script?.id) sp.miss[m._script.id] = 'giữ nhạc bạn đã chọn cho video'; }
    else if (sp.music && (tl.audio?.music || []).some(m => m._sheet != null && m._orig)) for (const m of sp.music) if (m._script?.id) sp.miss[m._script.id] = 'nhạc theo kịch bản đã chỉnh tay: giữ nguyên (xoá khúc đã sửa để dựng lại nhạc)';
    plan.script = scriptReport(scriptRequests(sheet), plan, sp.miss);
    plan.summary = (plan.summary ? plan.summary.replace(/\s*$/, ' ') : '') + `Theo kịch bản: ${plan.script.done}/${plan.script.total} yêu cầu đã dựng.`;
  }
  if (sources.length) { // S27 M198: nguồn bạn đưa đã dùng / chưa dùng (dòng tóm tắt của bước Dựng nhắc phần chưa dùng)
    const { sourceReport } = await import('./script_sources.mjs');
    plan.sources = sourceReport(sources, plan.scenes);
    if (plan.sources.unused.length) plan.summary = (plan.summary ? plan.summary.replace(/\s*$/, ' ') : '') + `${plan.sources.unused.length} nguồn bạn đưa chưa dùng.`;
  }
  const out = path.resolve(dir, opt('--out', '.studio/ai_plan.json'));
  fs.writeFileSync(out, JSON.stringify(plan, null, 1));
  console.log(`plan: ${plan.pack} · ${plan.scenes.length} cảnh · ${plan.captions.length} dòng phụ đề sửa · ${plan.sfx.length} sfx · nhạc ${plan.music === undefined ? 'giữ' : musicLabel(plan.music)} · bỏ ${plan.dropped.length}`);
  if (args.includes('--apply')) {
    const n = applyPlan(tl, caps, plan);
    const capFile = typeof tl.captions === 'string' ? tl.captions : 'work/captions.json';
    fs.writeFileSync(path.join(dir, capFile), JSON.stringify(caps, null, 1)); tl.captions = capFile;
    fs.writeFileSync(tlFile, JSON.stringify(tl, null, 1));
    console.log(`applied → ${tlFile} (${n} dòng phụ đề)`);
  }
  say(1, 'Xong');
}
// S27 M198: nguồn người dùng đưa (.studio/script_sources.json) còn trong Kho. Đánh dấu ô `mine`, gán file chưa có đoạn (Claude xem khung
// ảnh qua Read, tối đa MAX_IMAGES ảnh; lỗi / --no-ai-sources → khớp tên với lời), ghi lại bảng dựng. Sửa `sheet` tại chỗ. → [nguồn]
export async function userSources(dir, tl, sheet, model = 'sonnet') {
  let SS, K; try { SS = await import('./script_sources.mjs'); K = await import('./kho_media.mjs'); } catch { return []; }
  const ws = K.khoOf(dir, tl), abs = rel => { try { return K.resolveRel(ws, rel); } catch { return null; } };
  const sources = SS.readSources(dir).filter(s => abs(s.rel));
  if (!sources.length) return [];
  SS.markMine(sheet, sources);
  say(.1, `Xem ${sources.length} nguồn bạn đưa`);
  const ask = args.includes('--no-ai-sources') ? null : (p, { cwd }) => askJSON(p, { model, args: ['--allowedTools', 'Read'], cwd, shape: 'object', retries: 1, timeout: 240000, timeoutMsg: 'Claude quá 4 phút chưa chọn đoạn cho nguồn bạn đưa' });
  const r = await SS.assignSources(sheet, sources, { abs, ask, score: K.scoreRel, onP: t => say(.11, t) });
  if (r.error) console.log('Nguồn bạn đưa: Claude chưa chọn được đoạn (' + r.error + '), khớp theo tên file');
  if (r.assigned.length) console.log(`Nguồn bạn đưa: ${r.assigned.length}/${sources.length} file gắn vào đoạn (${r.by})`);
  try { const { writeSheet } = await import('./script_build.mjs'); writeSheet(dir, sheet); } catch { /* bảng chỉ nhớ trong lần dựng này */ }
  return sources;
}
// S27 M194: đưa media của các ô B-roll theo kịch bản vào dự án (Kho: useFromKho, thư viện, stock tải về, ảnh AI khi dấu ghi
// `| ảnh AI` và có khoá). Ô lỗi (tải stock 429, file Kho mất…) thử lần lượt phương án kế (`alts`, không tự tạo ảnh AI) rồi b-roll động
// khớp chữ nhất; ô có nguồn ép từ dấu (`want`) chỉ thử nguồn đó. Ô đổi nguồn được sửa trong `sheet` đang nhớ (không ghi file).
// Lỗi không chặn lần dựng: ô đó vào báo cáo "cần xem". → { media: { [mediaKey]: {seq}|{path} }, err: { [mediaKey gốc]: lý do } }
export async function sheetMedia(dir, tl, sheet, onP = () => {}, dynCat = []) {
  const cells = [];
  const lens = new Map(); // S27 M198: độ dài đoạn của ô (cắt đoạn con của video bạn đưa)
  for (const r of sheet.rows || []) if (r.t0 != null && r.spoken !== false) for (const b of r.broll || []) if (mediaKey(b)) { cells.push(b); lens.set(b, Math.max(1, (r.t1 ?? r.t0 + 3) - r.t0)); }
  const media = {}, err = {}, done = new Map(), vertical = (tl.height || 1920) > (tl.width || 1080);
  let K = null, L = null, A = null, SS = null, i = 0;
  const fetchOne = async (c, q, b = {}) => {
    if (c.src === 'kho' && b.mine && c.pick === b.pick) { // file bạn đưa: không giới hạn 30 s, video dài cắt đoạn con hợp với đoạn kịch bản
      K ||= await import('./kho_media.mjs'); SS ||= await import('./script_sources.mjs');
      return SS.useSource(dir, K.khoOf(dir, tl), K, c.pick, { clip: b.clip || 0, len: lens.get(b) || 4 });
    }
    if (c.src === 'kho') { K ||= await import('./kho_media.mjs'); const it = await K.useFromKho(dir, K.khoOf(dir, tl), c.pick, { credit: 'Kho · kịch bản', maxDur: 30, why: 'kịch bản' }); return it.seq ? { seq: it.seq } : { path: it.path }; }
    if (c.src === 'lib') { L ||= await import('./broll_lib.mjs'); const it = L.load().find(x => x.id === c.pick); if (!it) throw new Error('không còn trong thư viện'); const r = L.useIn(it, dir); return typeof r === 'string' ? { path: r } : { seq: r }; }
    if (c.src === 'stock') { A ||= await import('./ai_broll.mjs'); const kind = /\.(jpe?g|png|webp)(\?|$)/i.test(c.pick) ? 'photo' : 'video'; const r = await A.fetchMedia(c.pick, dir, { kind, name: q || 'broll', dur: 3, vertical, meta: { provider: 'stock · kịch bản', url: c.pick } }); return r.seq ? { seq: r.seq } : { path: r.path }; }
    if (c.src === 'ai') {
      A ||= await import('./ai_broll.mjs');
      const name = `ai_sheet_${String(q).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9]+/gi, '_').slice(0, 40).toLowerCase() || 'anh'}.png`;
      const out = path.join(dir, 'media', name);
      if (!fs.existsSync(out)) await A.genImage(`${q}. Ảnh minh hoạ thật, không chữ, không logo.`, out, { vertical });
      return { path: `media/${name}` };
    }
    throw new Error('nguồn lạ');
  };
  for (const b of cells) {
    onP(i++ / cells.length, `Đưa cảnh theo kịch bản vào dự án (${i}/${cells.length}): ${String(b.q || b.pick).slice(0, 40)}`);
    const key0 = mediaKey(b), alt = s => { const j = s.indexOf(':'); return { src: s.slice(0, j), pick: s.slice(j + 1) }; };
    const cands = [{ src: b.src, pick: b.pick }, ...(b.want ? [] : (b.alts || []).filter(s => typeof s === 'string' && !s.startsWith('ai:')).map(alt))];
    if (!b.want) { const d = dynamicFor(b.q || '', dynCat)[0]; if (d) cands.push({ src: 'dong', pick: d.id }); }
    let first = null, ok = false;
    for (const c of cands) {
      if (c.src === 'dong') { Object.assign(b, c); ok = true; break; } // b-roll động: không cần đưa file vào dự án
      const k = mediaKey({ ...c, q: b.q });
      if (!k) continue;
      if (!done.has(k)) try { done.set(k, { m: await fetchOne(c, b.q, b) }); } catch (e) { done.set(k, { err: String(e.message || e).slice(0, 120) }); }
      const d = done.get(k);
      if (d.m) { media[k] = d.m; Object.assign(b, c); ok = true; break; }
      first ||= d.err; console.log(`B-roll ${k.slice(0, 80)}: ${d.err}`);
    }
    if (!ok) err[key0] = first || 'chưa đưa được cảnh vào dự án';
  }
  return { media, err };
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) main().catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
