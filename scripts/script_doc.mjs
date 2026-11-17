// Kịch bản có sẵn của người dùng (S17 M123, docs/ROADMAP.md; references/script.md).
// Người dùng dán chữ hoặc mở .txt / .docx ở bước Nguồn hoặc thẻ Chuẩn bị của Tự lái. Dấu tuỳ chọn:
//   [HOOK] …            đoạn mở đầu           [CTA] …               đoạn kêu gọi (cuối video)
//   [CHỮ: …]            chữ trên màn hình của đoạn đang viết (cũng nhận [CHU: …], [TEXT: …])
//   [B-ROLL: …]         hình minh hoạ của đoạn đang viết (cũng nhận [BROLL: …])
// Không dấu vẫn dùng được: dòng trống tách đoạn; chữ không có dòng trống nào thì mỗi dòng là một đoạn.
// Lưu ở <dự án>/.studio/script.json: { version, text, name, updated, segments: [{ kind, say, screen[], broll[], t0, t1, spoken, ratio }],
//   align: { mode: whisper|even, at, words, matched, offscript: [{ t0, t1, text }] } }.
// Dùng cho: phụ đề theo đúng chữ kịch bản, thời điểm lấy từ lời nghe được (căn LCS như topic_video.mjs alignLine; không lời
// thì chia đều theo đoạn), dấu cho ai_edit.mjs / tpl_fit.mjs, QC (đoạn chưa nói / nói lệch, ai_qc.mjs scriptIssues), claim gate.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

export const AVS_HOME = process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio');
export const MAX_TEXT = 60000; // ~10 000 từ: đủ cho video dài, chặn dán nhầm cả cuốn sách
const r2 = v => Math.round(v * 100) / 100;
export const fold = s => String(s ?? '').toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const norm = w => fold(w).replace(/[^a-z0-9]/g, '');

// ---------- tách dấu ----------
const MARK = /\[\s*(hook|cta|chữ|chu|text|b-?roll)\s*(?::\s*([^\]]*))?\]/giu;
const kindOf = k => { const f = fold(k).replace('-', ''); return f === 'hook' ? 'hook' : f === 'cta' ? 'cta' : f === 'broll' ? 'broll' : 'screen'; };

/** Chữ kịch bản → các đoạn { kind: hook|body|cta, say, screen[], broll[] }. Không có chữ nói thì trả []. */
export function parseScript(text) {
  const src = String(text ?? '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/^[\t ]*(?:[-*•–]|\d+[.)])[\t ]+/gm, '');
  const lines = src.split('\n');
  const blank = /\S[^\n]*\n[ \t]*\n\s*\S/.test(src); // có dòng trống giữa hai dòng chữ
  const segs = []; let cur = null, pend = { screen: [], broll: [] };
  const open = kind => { close(); cur = { kind, say: [], screen: [...pend.screen], broll: [...pend.broll] }; pend = { screen: [], broll: [] }; };
  const close = () => { if (cur && (cur.say.length || cur.screen.length || cur.broll.length)) segs.push(cur); cur = null; };
  for (const line of lines) {
    if (!line.trim()) { if (blank) close(); continue; }
    if (!blank && cur && cur.say.length) close(); // không có dòng trống: mỗi dòng một đoạn ([HOOK] đứng riêng một dòng thì nhận dòng sau)
    let last = 0, m; MARK.lastIndex = 0;
    const put = s => { s = s.replace(/\s+/g, ' ').trim(); if (!s) return; if (!cur) open('body'); cur.say.push(s); };
    while ((m = MARK.exec(line))) {
      put(line.slice(last, m.index)); last = MARK.lastIndex;
      const k = kindOf(m[1]), v = String(m[2] || '').replace(/\s+/g, ' ').trim();
      if (k === 'hook' || k === 'cta') { open(k); if (v) cur.say.push(v); }
      else if (v) (cur ? cur : pend)[k].push(v.slice(0, 200));
    }
    put(line.slice(last));
  }
  close();
  if (pend.screen.length || pend.broll.length) { const L = segs[segs.length - 1]; if (L) { L.screen.push(...pend.screen); L.broll.push(...pend.broll); } }
  const out = segs.map(s => ({ kind: s.kind, say: s.say.join(' ').trim(), screen: s.screen, broll: s.broll }));
  // đoạn chỉ có dấu (không lời) gắn vào đoạn có lời kế bên
  for (let i = 0; i < out.length; i++) if (!out[i].say) {
    const to = out[i + 1] && out[i + 1].say ? out[i + 1] : out.slice(0, i).reverse().find(x => x.say);
    if (to) { to.screen.unshift(...out[i].screen); to.broll.unshift(...out[i].broll); if (to.kind === 'body' && out[i].kind !== 'body') to.kind = out[i].kind; }
  }
  return out.filter(s => s.say);
}

// ---------- .docx (zip + word/document.xml), không cần thư viện ----------
/** Buffer .docx → chữ: mỗi đoạn Word một dòng, đoạn trống thành dòng trống. */
export function docxText(buf) {
  buf = Buffer.from(buf);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Không phải file .docx (zip)');
  const n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16), xml = null;
  for (let k = 0; k < n && p + 46 <= buf.length; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    if (name === 'word/document.xml') {
      if (buf.readUInt32LE(off) !== 0x04034b50) throw new Error('File .docx hỏng');
      const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), data = buf.subarray(start, start + size);
      xml = (method === 8 ? zlib.inflateRawSync(data, { maxOutputLength: 64 << 20 }) : method === 0 ? data : null)?.toString('utf8');
      if (xml == null) throw new Error('File .docx nén kiểu lạ');
      break;
    }
    p += 46 + nl + xl + cl;
  }
  if (xml == null) throw new Error('File .docx không có nội dung chữ (word/document.xml)');
  const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e) => ent[e] ?? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- căn chữ kịch bản với lời nghe được ----------
function lcs(a, b) { // a, b: token đã chuẩn hoá → các cặp [i, j] khớp (giống topic_video.mjs lcsAlign)
  const n = a.length, m = b.length, W = m + 1, L = new Uint16Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * W + j] = a[i] && a[i] === b[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
  const pairs = []; let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] && a[i] === b[j]) { pairs.push([i, j]); i++; j++; } else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) i++; else j++; }
  return pairs;
}
// video dài: căn từng khúc ~400 từ kịch bản với khúc lời nghe được tương ứng (có lề), giữ thứ tự
function lcsLong(a, b, cap = 4e6) {
  if (a.length * b.length <= cap) return lcs(a, b);
  const out = []; let j0 = 0;
  for (let i0 = 0; i0 < a.length; i0 += 400) {
    const i1 = Math.min(a.length, i0 + 400), j1 = Math.min(b.length, Math.round(i1 / a.length * b.length) + 200);
    const pr = lcs(a.slice(i0, i1), b.slice(j0, j1)).map(([i, j]) => [i + i0, j + j0]);
    out.push(...pr); if (pr.length) j0 = pr[pr.length - 1][1] + 1;
  }
  return out;
}
const toks = s => String(s).split(/\s+/).filter(Boolean);
const clean = w => w.replace(/^["“'(]+/, '').replace(/[.,!?;:…"”')]+$/g, '');

/**
 * Kịch bản + lời nghe được (whisper: [{w,s,e}], theo giờ timeline) → { segments (thêm t0/t1/spoken/ratio), words, align }.
 * Không có lời nghe được (video không lời) → chia đều thời lượng `dur` cho các đoạn, trong đoạn chia theo số ký tự.
 */
export function alignScript(segments, heard, { dur = 0, minRatio = .3 } = {}) {
  const segs = segments.map(s => ({ ...s, screen: [...(s.screen || [])], broll: [...(s.broll || [])] }));
  const W = segs.flatMap((s, k) => toks(s.say).map(w => ({ w, k, s: null, e: null })));
  heard = (heard || []).filter(h => h && Number.isFinite(+h.s) && Number.isFinite(+h.e)).map(h => ({ w: String(h.w ?? ''), s: +h.s, e: +h.e }));
  const len = w => norm(w).length + 1;
  if (!heard.length) { // ---- không lời: chia đều theo đoạn
    const D = Math.max(1, dur || 0), each = D / Math.max(1, segs.length);
    segs.forEach((s, k) => {
      const ws = W.filter(x => x.k === k), tot = ws.reduce((a, x) => a + len(x.w), 0) || 1; let t = k * each;
      for (const x of ws) { const d = each * len(x.w) / tot; x.s = r2(t); x.e = r2(t + d); t += d; }
      Object.assign(s, { t0: r2(k * each), t1: r2((k + 1) * each), spoken: true, ratio: null });
    });
    return { segments: segs, words: W, align: { mode: 'even', at: new Date().toISOString(), words: W.length, matched: 0, offscript: [] } };
  }
  heard.sort((a, b) => a.s - b.s);
  const pairs = lcsLong(W.map(x => norm(x.w)), heard.map(h => norm(h.w)));
  const hit = new Set();
  for (const [i, j] of pairs) { W[i].s = heard[j].s; W[i].e = heard[j].e; W[i].hit = true; hit.add(j); }
  // đoạn gần như không có chữ nào nghe được = chưa nói: không đặt phụ đề cho nó
  segs.forEach((s, k) => { const ws = W.filter(x => x.k === k), m = ws.filter(x => x.hit).length; s.ratio = ws.length ? r2(m / ws.length) : 0; s.spoken = !(ws.length >= 3 ? s.ratio < minRatio : m === 0); });
  const live = W.filter(x => segs[x.k].spoken);
  const end = heard[heard.length - 1].e;
  // chữ không khớp: chia theo số ký tự giữa hai chữ khớp kề bên (topic_video.mjs alignLine)
  for (let k = 0; k < live.length;) {
    if (live[k].s != null) { k++; continue; }
    let j = k; while (j < live.length && live[j].s == null) j++;
    const a = k ? live[k - 1].e : Math.max(0, Math.min(heard[0].s, (live[j]?.s ?? heard[0].s) - .25 * (j - k)));
    const b = j < live.length ? live[j].s : Math.max(end, a + .3 * (j - k));
    const tot = live.slice(k, j).reduce((x, w) => x + len(w.w), 0) || 1; let t = a;
    for (let q = k; q < j; q++) { const d = Math.max(0, b - a) * len(live[q].w) / tot; live[q].s = r2(t); live[q].e = r2(t + d); t += d; }
    k = j;
  }
  for (const x of live) { x.s = r2(Math.max(0, x.s)); x.e = r2(Math.max(x.e, x.s + .05)); }
  segs.forEach((s, k) => { const ws = live.filter(x => x.k === k); if (ws.length) { s.t0 = ws[0].s; s.t1 = ws[ws.length - 1].e; } else { s.t0 = s.t1 = null; } });
  // lời nói ngoài kịch bản: ≥ 5 từ nghe được liền nhau không khớp và không có chữ kịch bản nào rơi vào khoảng đó
  const offscript = [];
  for (let j = 0; j < heard.length;) {
    if (hit.has(j)) { j++; continue; }
    let q = j; while (q < heard.length && !hit.has(q)) q++;
    const t0 = heard[j].s, t1 = heard[q - 1].e;
    if (q - j >= 5 && !live.some(x => !x.hit && x.s < t1 - .05 && x.e > t0 + .05)) offscript.push({ t0: r2(t0), t1: r2(t1), text: heard.slice(j, q).map(h => h.w).join(' ').trim(), words: heard.slice(j, q) });
    j = q;
  }
  return { segments: segs, words: live, align: { mode: 'whisper', at: new Date().toISOString(), words: W.length, matched: pairs.length, offscript: offscript.map(({ words, ...o }) => o) }, offWords: offscript.flatMap(o => o.words) };
}

/** Chữ đã căn → phụ đề kiểu captions.py ({t0,t1,words:[{w,s,e}]}): ≤ max từ, ngắt ở dấu câu, cuối đoạn và chỗ nghỉ > 0,7 s. */
export function captionsFrom(words, { max = 4, offWords = [] } = {}) {
  const all = [...words.map(x => ({ w: x.w, s: x.s, e: x.e, k: x.k })), ...offWords.map(h => ({ w: h.w, s: h.s, e: h.e, k: 'off', off: true }))].sort((a, b) => a.s - b.s);
  const caps = []; let cur = [];
  const push = () => { const ws = cur.map(x => ({ w: clean(x.w), s: x.s, e: x.e })).filter(x => x.w); if (ws.length) caps.push({ t0: ws[0].s, t1: ws[ws.length - 1].e, words: ws, ...(cur.some(x => x.off) ? { _offscript: true } : {}) }); cur = []; };
  for (const x of all) {
    const prev = cur[cur.length - 1];
    if (prev && (prev.k !== x.k || x.s - prev.e > .7)) push();
    cur.push(x);
    if (cur.length >= max || /[.,!?;:…]["”')]*$/.test(x.w)) push();
  }
  push();
  return caps;
}

// ---------- lưu / đọc ----------
export const scriptFile = dir => path.join(dir, '.studio', 'script.json');
export function readScript(dir) {
  try { const s = JSON.parse(fs.readFileSync(scriptFile(dir), 'utf8')); return s && Array.isArray(s.segments) && s.segments.length ? s : null; } catch { return null; }
}
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(o, null, 1)); fs.renameSync(t, f); };
/** Chữ người dùng → .studio/script.json (chưa căn). Trả bản đã lưu. */
export function writeScript(dir, text, { name = '' } = {}) {
  const raw = String(text ?? '');
  if (raw.length > MAX_TEXT) throw Object.assign(new Error(`Kịch bản dài quá (${raw.length} ký tự, tối đa ${MAX_TEXT})`), { status: 400 });
  const segments = parseScript(raw);
  if (!segments.length) throw Object.assign(new Error('Kịch bản không có chữ để nói'), { status: 400 });
  const doc = { version: 1, text: raw, name: String(name || '').slice(0, 120), updated: new Date().toISOString(), segments };
  wr(scriptFile(dir), doc); return doc;
}

// đọc / ghi captions của dự án như ai_edit.mjs loadProject
function projCaps(dir, tl) {
  if (Array.isArray(tl.captions)) return tl.captions;
  try { return JSON.parse(fs.readFileSync(path.join(dir, tl.captions || 'work/captions.json'), 'utf8')); } catch { return []; }
}
/** Thời lượng phần video (không tính thẻ kết cuối) để chia đều khi không lời. */
export function speechSpan(tl) {
  const end = (tl.scenes || []).filter(s => s.type === 'title_card' && s.t1 >= (tl.duration || 0) - .05).map(s => s.t0)[0];
  return end > 1 ? end : tl.duration || 0;
}
/** Lời nghe được để căn: chữ của phụ đề hiện có (whisper, hoặc kịch bản đã căn trước đó: vẫn đúng giờ). */
export const heardOf = caps => caps.flatMap(c => (c.words || []).filter(w => w && String(w.w || '').trim()).map(w => ({ w: w.w, s: w.s ?? c.t0, e: w.e ?? c.t1 })));

/**
 * Căn kịch bản đã lưu của dự án với phụ đề hiện có và thay phụ đề bằng chữ kịch bản (sao lưu phụ đề whisper lần đầu ở
 * .studio/captions_noscript.json để Bỏ kịch bản lấy lại). Trả { tl, caps, script } hoặc null khi dự án không có kịch bản.
 * `heard` (tuỳ chọn) thay cho phụ đề hiện có (vd words.json vừa nhận dạng lại; `fresh` = caps là phụ đề whisper mới, sao lưu lại).
 */
export function applyScript(dir, { tl, caps, heard, max = 4, fresh = false } = {}) {
  const sc = readScript(dir); if (!sc) return null;
  const tlFile = path.join(dir, 'timeline.json');
  tl = tl || JSON.parse(fs.readFileSync(tlFile, 'utf8'));
  caps = caps || projCaps(dir, tl);
  const mute = !!tl.speech?.none;
  const H = mute ? [] : heard || heardOf(caps);
  const backup = path.join(dir, '.studio', 'captions_noscript.json');
  if (!mute && !H.length) return { tl, caps, script: sc, pending: true }; // chưa tách lời thoại: căn khi có (25_transcribe)
  if (caps.length && (fresh || (!sc.align && !fs.existsSync(backup)))) wr(backup, caps);
  const r = alignScript(sc.segments, H, { dur: speechSpan(tl) });
  const out = captionsFrom(r.words, { max, offWords: r.offWords || [] });
  Object.assign(sc, { segments: r.segments, align: r.align });
  wr(scriptFile(dir), sc);
  return { tl, caps: out, script: sc };
}
/** Bỏ kịch bản: xoá script.json, trả phụ đề whisper đã sao lưu (null khi không có bản sao lưu). */
export function removeScript(dir) {
  fs.rmSync(scriptFile(dir), { force: true });
  const backup = path.join(dir, '.studio', 'captions_noscript.json');
  let caps = null; try { caps = JSON.parse(fs.readFileSync(backup, 'utf8')); } catch { /* chưa áp lần nào */ }
  fs.rmSync(backup, { force: true });
  return caps;
}

// ---------- kịch bản chờ cho Tự lái (gửi kèm job như brand / product của M121) ----------
export const STAGE_ID = /^s-[a-z0-9]{6,40}$/;
const stageDir = () => path.join(AVS_HOME, 'scripts');
/** Lưu kịch bản dán ở panel Tự lái → id (`--script <id>` của autopilot.mjs). Kiểm như writeScript. */
export function stageScript(text, { name = '' } = {}) {
  const raw = String(text ?? '');
  if (raw.length > MAX_TEXT) throw Object.assign(new Error(`Kịch bản dài quá (${raw.length} ký tự, tối đa ${MAX_TEXT})`), { status: 400 });
  if (!parseScript(raw).length) throw Object.assign(new Error('Kịch bản không có chữ để nói'), { status: 400 });
  const id = 's-' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  wr(path.join(stageDir(), id + '.json'), { text: raw, name: String(name || '').slice(0, 120), at: new Date().toISOString() });
  return id;
}
/** `--script` của autopilot: id kịch bản chờ, hoặc đường dẫn file .txt / .docx / .json ({text}). → { text, name } */
export function loadScriptArg(v) {
  const s = String(v || '');
  if (STAGE_ID.test(s)) {
    const f = path.join(stageDir(), s + '.json');
    try { const o = JSON.parse(fs.readFileSync(f, 'utf8')); return { text: String(o.text || ''), name: o.name || '' }; } catch { throw new Error(`không thấy kịch bản ${s}`); }
  }
  const f = path.resolve(s.replace(/^~(?=[\\/])/, os.homedir()));
  if (!fs.existsSync(f)) throw new Error(`không thấy file kịch bản ${s}`);
  const ext = path.extname(f).toLowerCase(), name = path.basename(f);
  if (ext === '.docx') return { text: docxText(fs.readFileSync(f)), name };
  if (ext === '.json') { const o = JSON.parse(fs.readFileSync(f, 'utf8')); return { text: String(o.text || ''), name: o.name || name }; }
  return { text: fs.readFileSync(f, 'utf8').replace(/^﻿/, ''), name };
}

// ---------- dấu cho AI dựng / Bám lời thoại / QC ----------
/** Danh sách dấu có thời điểm: [{ kind: hook|screen|broll|cta, text, t0, t1, seg }] (đoạn chưa nói thì bỏ). */
export function scriptMarks(sc) {
  const out = [];
  (sc?.segments || []).forEach((s, k) => {
    if (s.spoken === false || s.t0 == null) return;
    const at = { t0: s.t0, t1: s.t1, seg: k };
    if (s.kind === 'hook') out.push({ kind: 'hook', text: s.screen[0] || s.say, ...at });
    if (s.kind === 'cta') out.push({ kind: 'cta', text: s.screen[0] || s.say, ...at });
    for (const t of s.screen.slice(s.kind === 'body' ? 0 : 1)) out.push({ kind: 'screen', text: t, ...at });
    for (const t of s.broll) out.push({ kind: 'broll', text: t, ...at });
  });
  return out;
}
/** Kịch bản → dạng của topic_video (hook/beats/cta) cho script_gate.checkScript (claim gate M22). */
export function gateShape(sc) {
  const segs = (sc?.segments || []).map((s, k) => ({ ...s, k }));
  const hook = segs.find(s => s.kind === 'hook'), cta = [...segs].reverse().find(s => s.kind === 'cta');
  const body = segs.filter(s => s !== hook && s !== cta);
  return {
    hook: { say: hook?.say || body[0]?.say || '', screen: (hook?.screen || []).join(' · ') },
    beats: body.map(s => ({ say: s.say, screen: [...s.screen].join(' · ') })),
    cta: { say: cta?.say || '', screen: (cta?.screen || []).join(' · ') },
    _seg: { hook: hook?.k ?? null, beats: body.map(s => s.k), cta: cta?.k ?? null },
  };
}
/** Prompt cho ai_edit / tpl_fit: các đoạn có giờ và dấu. Trả '' khi không có kịch bản. */
export function scriptPrompt(sc) {
  if (!sc?.segments?.length) return '';
  const f = t => (t == null ? '?' : (+t).toFixed(2));
  return sc.segments.map((s, k) => `Đ${k + 1}${s.kind !== 'body' ? ` [${s.kind.toUpperCase()}]` : ''} ${s.spoken === false ? '(CHƯA NÓI — bỏ qua)' : `[${f(s.t0)}–${f(s.t1)}s]`}: "${s.say.slice(0, 300)}"`
    + s.screen.map(t => `\n   · CHỮ: "${t}"`).join('') + s.broll.map(t => `\n   · B-ROLL: "${t}"`).join('')).join('\n');
}

/** Dấu chưa được đặt trên timeline: chữ (hook / CHỮ / CTA) không thấy trong cảnh nào quanh đoạn đó, B-ROLL không có cảnh hình nào.
 *  `strings(scene)` = các chữ graphic hiện (ai_edit.mjs sceneStrings); `title` = tiêu đề / hook của timeline. */
export function markMissing(marks, scenes, { strings = () => [], title = '' } = {}) {
  const key = s => fold(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const covers = (have, want) => { if (have.includes(want)) return true; const w = want.split(' '), h = new Set(have.split(' ')); return w.length >= 2 && w.filter(x => h.has(x)).length / w.length >= .6; };
  const isPic = s => !!(s.broll || s.screen?.broll || s.media || s.image || s.images || /broll|media|photo|image|kinetic_broll/.test(String(s.type)));
  return (marks || []).filter(m => {
    const win = (scenes || []).filter(s => !s.hidden && s.t0 < m.t1 + 1.5 && s.t1 > m.t0 - 1.5);
    if (m.kind === 'broll') return !win.some(isPic);
    const want = key(m.text); if (!want) return false;
    const pool = [...win.flatMap(s => strings(s)), ...(m.kind === 'hook' ? [title] : [])].map(key).join(' | ');
    return !covers(pool, want);
  });
}

// ---------- claim gate cho chữ kịch bản (M22) khi dự án quảng cáo có sản phẩm ----------
/** Soát lời + chữ màn hình của kịch bản bằng script_gate.checkScript (ad_gates.py --script). Ghi vào script.json `gate`.
 *  Trả null khi dự án không bật quảng cáo hoặc không có kịch bản. `check` thay checkScript (test). */
export async function gateScript(dir, tl, { check } = {}) {
  const sc = readScript(dir); if (!sc || !tl?.ads?.on) return null;
  const shape = gateShape(sc), seg = shape._seg;
  check = check || (await import('./script_gate.mjs')).checkScript;
  const r = check(shape, tl.ads);
  const segOf = ref => { const m = /^beats\[(\d+)\]/.exec(ref || ''); return m ? seg.beats[+m[1]] : /^hook/.test(ref || '') ? seg.hook : /^cta/.test(ref || '') ? seg.cta : null; };
  const issues = (r.issues || []).map(i => { const k = segOf(i.ref), s = k != null ? sc.segments[k] : null;
    return { seg: k, t: s?.t0 ?? 0, kind: String(i.kind || '').startsWith('ad_') ? i.kind : 'ad_claim', severity: i.severity || 'med', code: i.code, ref: i.ref, where: i.where || 'kịch bản', screen: /\.screen$/.test(i.ref || ''), msg: String(i.msg || '') }; });
  sc.gate = { at: new Date().toISOString(), blocked: !!r.blocked, issues };
  wr(scriptFile(dir), sc);
  return sc.gate;
}
