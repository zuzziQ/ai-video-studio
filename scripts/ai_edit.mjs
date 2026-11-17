// "AI dựng giúp": Claude reads the transcript and plans the edit (pack, caption fixes, hook, 6–15 graphics on word starts, music, SFX).
// usage: node scripts/ai_edit.mjs <project_dir | timeline.json> [--out .studio/ai_plan.json] [--goal "khoá học"] [--tone "vui"]
//          [--pack keep|auto|<pack id>] [--density thua|vua|day] [--extra "…"] [--model sonnet] [--apply]
// Output plan (references/ai-edit.md): { pack, caption_style, hook, captions:[{i,t0,words:[{w,hl?,br?}]}], scenes:[…full scenes, _ai:true],
//   music:{mood,gain}, sfx:[{t,name,gain}], summary, dropped:[…] }. --apply writes it into timeline.json (replaces earlier _ai items only).
// Progress lines on stdout: "@@ <0..1> <step>" (read by studio/routes/20_ai.mjs).
import fs from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome } from './platform.mjs';
import { runLLM, askJSON, parseLooseJSON } from './llm.mjs';
import { faceZone } from './face_track_project.mjs';
import { safeOf, designOf } from './ai_qc.mjs'; // ai_qc runs its CLI only when executed directly; Chrome opens only in placePlan
import { readScript, scriptMarks, scriptPrompt, markMissing } from './script_doc.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const say = (p, s) => console.log(`@@ ${p.toFixed(2)} ${s}`);
const r2 = v => Math.round(v * 100) / 100;
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
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
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

export function buildPrompt({ tl, caps, cat, lib, o, script }) {
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
  const scr = script ? `
# Kịch bản của người dùng (phụ đề đã đúng NGUYÊN VĂN kịch bản; mỗi đoạn Đ có giờ đã khớp lời nói)
${scriptPrompt(script)}
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

# Nhạc nền (mood): ${moods}
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
export function validate(raw, { tl, caps, cat, lib, o, script }) {
  const dropped = [], cuts = []; // cuts: graphic text cut to fit (S13 · M111, shortenCuts)
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
    const t1 = r2(Math.min(dur, t0 + Math.min(8, Math.max(.8, +s.dur || (it.ex.t1 - it.ex.t0) || 2.5))));
    const params = cleanText(s.params && typeof s.params === 'object' ? s.params : {}, it.ex, '', cuts);
    for (const k of ['type', 't0', 't1', 'cid', '_orig', '_ai']) delete params[k];
    const ex = shiftRel(it.ex, t0, t1);
    const scene = { ...ex, ...shiftRel(params, t0, t1), type: s.type, t0, t1, _ai: true };
    fixBroll(scene, lib, used);
    const made = inventedNumbers(scene, said);
    if (made.length) { dropped.push(`cảnh ${s.type} @${t0}s: số liệu "${made.slice(0, 3).join('", "')}" không có trong lời thoại`); continue; }
    sc.push(scene);
  }
  sc.sort((a, b) => a.t0 - b.t0);
  const scenes = [];
  for (const s of sc) {
    const prev = scenes[scenes.length - 1];
    if (prev && s.t0 < prev.t1 - .05) {
      if (prev.t1 + .8 <= s.t1) { s.t0 = r2(prev.t1); clampT(s, s.t0, s.t1); }
      else { dropped.push(`cảnh ${s.type} @${s.t0}s chồng lên cảnh trước`); continue; }
    }
    scenes.push(s);
  }
  if (scenes.length > 15) dropped.push(`bớt ${scenes.length - 15} cảnh thừa`), scenes.splice(15);
  // base layer from the chosen pack's recipe (frame, progress bar …) so the AI graphics sit on the right background
  const base = (P.base || []).map(s => ({ ...s, _ai: true, _base: true }));
  const moods = new Set(lib.music.map(m => m.mood));
  const mood = moods.has(raw.music?.mood) ? raw.music.mood : (P.music && moods.has(P.music) ? P.music : 'tech');
  const music = { t0: 0, t1: dur, mood, gain: Math.max(-26, Math.min(-14, +raw.music?.gain || -20)), _ai: true };
  const sfxNames = new Set(lib.sfx.map(x => x.name));
  const sfx = [];
  for (const x of Array.isArray(raw.sfx) ? raw.sfx.slice(0, 10) : []) {
    const name = sfxNames.has(x.name) ? x.name : sfxNames.has(String(x.name).replace(/_\d+$/, '')) ? String(x.name).replace(/_\d+$/, '') : null;
    const t = wordT(x.c, x.w) ?? (typeof x.t === 'number' ? x.t : null);
    if (!name || t == null || t >= dur) { dropped.push(`SFX "${x.name}" không hợp lệ`); continue; }
    sfx.push({ t: r2(Math.max(0, t - .05)), name, gain: -12, _ai: true });
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
  if (L.music === 'off') plan.music = null;
  else if (plan.music && Number.isFinite(+L.music_gain) && +L.music_gain) plan.music.gain = Math.max(-30, Math.min(-8, +(plan.music.gain + +L.music_gain).toFixed(1)));
  if (typeof L.caption_style === 'string' && L.caption_style) plan.caption_style = L.caption_style;
  if (Array.isArray(L.dict) && L.dict.length) plan.dict = L.dict.slice(0, 50);
  plan.learned = (Array.isArray(L.notes) ? L.notes : []).slice(0, 30);
  return plan;
}
// Apply a plan: earlier AI items (and untouched recipe items) are replaced; anything the user edited (_orig) or added stays.
export function applyPlan(tl, caps, plan) {
  const starter = !!tl._starter; delete tl._starter; // never-opened "Video mới" project: its starter scenes are placeholders
  const mine = s => starter || ((s._ai || s._recipe) && !s._orig);
  tl.pack = plan.pack; tl.caption_style = plan.caption_style || undefined;
  if (plan.hook) tl.title = plan.hook;
  tl.scenes = [...(tl.scenes || []).filter(s => !mine(s)), ...plan.scenes];
  tl.audio = tl.audio || {};
  // plan.music null (thói quen "không nhạc", M134): bỏ nhạc _ai cũ, không thêm nhạc mới
  tl.audio.music = [...(tl.audio.music || []).filter(m => !m._ai && !(plan.music && m.t0 <= .05 && m.t1 >= tl.duration - .1)), ...(plan.music ? [plan.music] : [])];
  tl.audio.sfx = [...(tl.audio.sfx || []).filter(x => !x._ai), ...plan.sfx];
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

// ---------- CLI ----------
async function main() {
  const src = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--apply'));
  if (!src) { console.error('usage: node scripts/ai_edit.mjs <project_dir|timeline.json> [--out plan.json] [--goal …] [--pack keep|auto|id] [--density thua|vua|day] [--apply]'); process.exit(2); }
  const o = { goal: opt('--goal', ''), tone: opt('--tone', ''), pack: opt('--pack', 'auto'), density: opt('--density', 'vua'), extra: opt('--extra', '') };
  const optFile = opt('--opts'); if (optFile) Object.assign(o, readJson(optFile) || {});
  const { dir, tlFile, tl, caps } = loadProject(src);
  if (!caps.length) throw new Error('Dự án chưa có phụ đề (cần lời thoại để AI đọc).');
  say(.05, 'Đọc danh sách gói style từ engine');
  const cat = await engineCatalog(tl, caps, dir);
  const lib = libraries();
  const sc = readScript(dir), script = sc?.align ? sc : null; // S17 M123: chỉ kịch bản đã căn với phụ đề
  const ctx = { tl, caps, cat, lib, o, script };
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
  // S12 · M99: nhạc nền ưu tiên Nhac/ của Kho khi có bài hợp mood → media/kho_* (nguồn ghi ở media/credits.json); không có thì nhạc thư viện
  if (plan.music) try { const k = await (await import('./kho_media.mjs')).khoMusic(dir, tl, plan.music.mood); if (k) plan.music = { ...plan.music, file: k.file, kho: k.kho, title: k.title }; } catch (e) { console.log('Kho: bỏ qua nhạc Kho (' + e.message + ')'); }
  // S13 · M104: render the plan once and move graphics off the speaking face / captions / unsafe edges before it is applied
  if (!args.includes('--no-place')) {
    say(.93, 'Đặt graphic né mặt, phụ đề và mép khung');
    try {
      const { placePlan } = await import('./ai_qc.mjs');
      const kept = (tl.scenes || []).filter(s => !(tl._starter || ((s._ai || s._recipe) && !s._orig))); // what applyPlan keeps
      // the plan's scenes go in as tagged copies (a failed placement leaves plan.scenes untouched, no tag leaks into the plan)
      const r = await placePlan(dir, tl, caps, { ...plan, scenes: [...kept, ...plan.scenes.map(s => ({ ...s, _planned: true }))] },
        { only: s => s._planned, tag: { _ai: true, _planned: true }, onP: k => say(.93 + k * .06, `Đặt graphic né mặt và phụ đề… ${Math.round(k * 100)}%`) });
      plan.scenes = r.scenes.filter(s => s._planned).map(({ _planned, ...s }) => s); plan.placed = { moved: r.moved, left: r.left.map(i => ({ t: i.t, kind: i.kind, msg: i.msg })) };
    } catch (e) { console.log('Bỏ qua bước đặt chỗ: ' + e.message.slice(0, 200)); plan.placed = { error: e.message.slice(0, 200) }; }
  }
  const out = path.resolve(dir, opt('--out', '.studio/ai_plan.json'));
  fs.writeFileSync(out, JSON.stringify(plan, null, 1));
  console.log(`plan: ${plan.pack} · ${plan.scenes.length} cảnh · ${plan.captions.length} dòng phụ đề sửa · ${plan.sfx.length} sfx · bỏ ${plan.dropped.length}`);
  if (args.includes('--apply')) {
    const n = applyPlan(tl, caps, plan);
    const capFile = typeof tl.captions === 'string' ? tl.captions : 'work/captions.json';
    fs.writeFileSync(path.join(dir, capFile), JSON.stringify(caps, null, 1)); tl.captions = capFile;
    fs.writeFileSync(tlFile, JSON.stringify(tl, null, 1));
    console.log(`applied → ${tlFile} (${n} dòng phụ đề)`);
  }
  say(1, 'Xong');
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) main().catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
