// Kịch bản có sẵn của người dùng (S17 M123, docs/ROADMAP.md; references/script.md).
// Người dùng dán chữ hoặc mở .txt / .docx ở bước Nguồn hoặc thẻ Chuẩn bị của Tự lái. Dấu tuỳ chọn:
//   [HOOK] …            đoạn mở đầu           [CTA] …               đoạn kêu gọi (cuối video)
//   [CHỮ: …]            chữ trên màn hình của đoạn đang viết (cũng nhận [CHU: …], [TEXT: …])
//   [B-ROLL: …]         hình minh hoạ của đoạn đang viết (cũng nhận [BROLL: …])
//   S27 M193: [MOOD: …] [NHẠC: tắt|bật|đổi|to|nhỏ|kho …] [A-ROLL: cận mặt|rộng|clip N|bỏ] [SFX: … | đầu|cuối|@từ],
//   [B-ROLL: … | kho|stock|ảnh AI|động|tệp …], [CHỮ: … | số|danh sách|trích dẫn|tiêu đề|giá]. Bảng dựng: script_build.mjs.
// Không dấu vẫn dùng được: dòng trống tách đoạn; chữ không có dòng trống nào thì mỗi dòng là một đoạn.
// Lưu ở <dự án>/.studio/script.json: { version, text, name, updated, segments: [{ kind, say, screen[], broll[], t0, t1, spoken, ratio }],
//   align: { mode: whisper|even, at, words, matched, offscript: [{ t0, t1, text }] } }.
// Dùng cho: phụ đề theo đúng chữ kịch bản, thời điểm lấy từ lời nghe được (căn LCS như topic_video.mjs alignLine; không lời
// thì chia đều theo đoạn), dấu cho ai_edit.mjs / tpl_fit.mjs, QC (đoạn chưa nói / nói lệch, ai_qc.mjs scriptIssues), claim gate.
import fs from 'node:fs';
import { rmSync } from './fs_rm.mjs';
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
// S27 M193 (docs/plans/S27-dung-theo-kich-ban.md mục 1): thêm [MOOD: …] [NHẠC: …] [A-ROLL: …] [SFX: …], tuỳ chọn sau "|" của
// [B-ROLL: … | nguồn] và [CHỮ: … | kiểu]. Tên dấu không phân biệt hoa / thường, nhận cả không dấu. Ngoặc vuông không phải dấu
// (vd "[cười]") vẫn là chữ nói như trước. Giá trị lạ: giữ chữ gốc trong `raw` (QC báo), không làm hỏng việc tách.
const MARK = /\[\s*([^[\]:|\n]{1,24}?)\s*(?::\s*([^\]\n]*))?\]/gu;
const NAMES = { hook: 'hook', cta: 'cta', chu: 'screen', text: 'screen', broll: 'broll', mood: 'mood', khongkhi: 'mood',
  nhac: 'music', music: 'music', aroll: 'aroll', quay: 'aroll', sfx: 'sfx', am: 'sfx', hieuung: 'sfx',
  moc: 'time', giay: 'time', time: 'time', timecode: 'time', ghichu: 'note', note: 'note', chidan: 'note' }; // S27 M197: kịch bản dạng bảng
export const markName = k => NAMES[fold(k).replace(/[^a-z]/g, '')] || null;
const NEED_VALUE = new Set(['mood', 'music', 'aroll', 'sfx', 'time', 'note']); // dấu mới không có giá trị = chữ thường (không nuốt "[âm]")
const key = s => fold(s).replace(/[^a-z0-9]+/g, ' ').trim();
const MUSIC = { tat: 'tat', off: 'tat', bat: 'bat', on: 'bat', doi: 'doi', 'doi bai': 'doi', to: 'to', 'to len': 'to', nho: 'nho', 'nho lai': 'nho' };
export const BROLL_SRC = { kho: 'kho', stock: 'stock', 'anh ai': 'ai', ai: 'ai', dong: 'dong', 'broll dong': 'dong' };
export const SCREEN_KIND = { so: 'so', 'so lieu': 'so', 'danh sach': 'danhsach', 'trich dan': 'trichdan', 'tieu de': 'tieude', gia: 'gia', 'vi du': 'vidu' };
const FRAME = { 'can mat': 'can', can: 'can', 'can canh': 'can', trung: 'trung', 'trung canh': 'trung', rong: 'rong', 'toan canh': 'rong' };
const cut = (v, n = 200) => String(v).slice(0, n);
// ---------- mốc giây (S27 M197) ----------
const TOK = /\d{1,3}:\d{1,2}(?::\d{1,2})?(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g;
function secOf(t) {
  t = t.replace(',', '.');
  if (!t.includes(':')) return +t;
  const p = t.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}
/**
 * Chữ mốc giây của kịch bản bảng → { t0, t1 } (giây; t1 null khi chỉ có mốc đầu), null khi không đọc được.
 * Nhận "00:05–00:12", "5-12", "0:05", "5s", "1:02:03", "5,5 - 8" và số Excel kiểu giờ (phân số của ngày, vd 0.0000578…).
 */
export function parseTimeRange(v) {
  const s = String(v ?? '').trim(); if (!s) return null;
  if (/^0?\.\d{4,}$/.test(s)) { const x = +s * 86400; return Number.isFinite(x) ? { t0: r2(x), t1: null } : null; } // ô Excel định dạng giờ
  const t = s.match(TOK); if (!t?.length) return null;
  const a = secOf(t[0]), b = t.length > 1 ? secOf(t[1]) : null;
  if (!Number.isFinite(a) || a < 0 || a > 86400) return null;
  return { t0: r2(a), t1: b != null && Number.isFinite(b) && b > a ? r2(b) : null };
}
const mmss = x => { const m = Math.floor(x / 60), s = x - m * 60; return `${m}:${s < 10 ? '0' : ''}${+s.toFixed(2)}`; };
/** { t0, t1 } → chữ của dấu [MỐC: …] ("0:05–0:12"). */
export const fmtTimeRange = at => mmss(at.t0) + (at.t1 != null ? '–' + mmss(at.t1) : '');
/** Một dấu (không phải HOOK / CTA) → các trường của đoạn. Trả false khi giá trị lạ (dấu gốc vào raw). */
function putMark(seg, k, v) {
  if (k === 'note') { const n = v.replace(/\s+/g, ' ').trim(); if (!n) return false; seg.note.push(cut(n, 300)); return true; }
  if (k === 'time') { const at = parseTimeRange(v); if (!at) return false; seg.at = spanAt(seg.at, at); return true; }
  const [main = '', ...opts] = v.split('|').map(x => x.replace(/\s+/g, ' ').trim()), opt = opts.join(' | ');
  if (k === 'screen') {
    if (!main) return true;
    const kind = opt ? SCREEN_KIND[key(opt)] || null : null;
    seg.screen.push({ text: cut(main), kind }); return !opt || !!kind;
  }
  if (k === 'broll') {
    if (!main) return true;
    const o = key(opt), src = !opt ? null : BROLL_SRC[o] || (/^(tep|file) \S/.test(o) ? 'tep:' + opt.replace(/^\S+\s+/, '').slice(0, 120) : null);
    seg.broll.push({ q: cut(main), src }); return !opt || !!src;
  }
  if (k === 'mood') { if (!main) return false; seg.mood = cut(main, 60); seg.moodN = (seg.moodN || 0) + 1; return true; }
  if (k === 'music') {
    const m = key(main);
    if (MUSIC[m]) { seg.music = MUSIC[m]; return true; }
    if (/^kho( |$)/.test(m)) { const name = main.replace(/^\S+\s*/, '').trim(); seg.music = name ? 'kho:' + name.slice(0, 120) : 'kho'; return true; }
    return false;
  }
  if (k === 'aroll') {
    const a = { ...(seg.aroll || {}) }; let ok = true;
    for (const part of [main, ...opts].filter(Boolean)) {
      const p = key(part), n = /^(?:clip|take) ?(\d{1,3})$/.exec(p);
      if (p === 'bo' || p === 'tat') a.off = true;
      else if (FRAME[p]) a.frame = FRAME[p];
      else if (n) a.take = +n[1];
      else if (/\.\w{2,4}$/.test(part)) a.file = part.slice(0, 160);
      else ok = false;
    }
    if (!Object.keys(a).length) return false;
    seg.aroll = a; seg.arollN = (seg.arollN || 0) + 1; return ok;
  }
  if (k === 'sfx') {
    if (!main) return false;
    const o = key(opt), t = opt.trim();
    const at = !opt ? 'dau' : o === 'dau' || o === 'cuoi' ? o : t.startsWith('@') && t.length > 1 ? '@' + t.slice(1).trim().slice(0, 40) : null;
    seg.sfx.push({ name: cut(main, 80), at: at || 'dau' }); return !opt || !!at;
  }
  return false;
}
// hai mốc giây gộp một đoạn: bắt đầu ở mốc sớm, kết thúc theo mốc muộn (null = tới đoạn sau)
function spanAt(a, b) {
  if (!a || !b) return a || b ? { ...(a || b) } : null;
  const [x, y] = a.t0 <= b.t0 ? [a, b] : [b, a];
  return { t0: x.t0, t1: y.t1 ?? (x.t1 != null && x.t1 > y.t0 ? x.t1 : null) };
}
const blankSeg = kind => ({ kind, say: [], screen: [], broll: [], sfx: [], raw: [], note: [] });
const hasAny = s => !!(s.say.length || s.screen.length || s.broll.length || s.sfx.length || s.raw.length || s.note.length || s.mood || s.music || s.aroll || s.at);
// gộp dấu của `from` vào `to`; front = dấu của `from` đứng trước (đoạn chỉ có dấu gắn vào đoạn có lời ngay sau nó)
function mergeInto(to, from, front) {
  for (const k of ['screen', 'broll', 'sfx', 'raw', 'note']) to[k] = front ? [...from[k], ...to[k]] : [...to[k], ...from[k]];
  if (from.at) to.at = spanAt(to.at, from.at); // hàng không lời của bảng gộp vào hàng kế bên: mốc giây trải ra cả hai
  for (const k of ['mood', 'music']) if (from[k] && (!to[k] || !front)) to[k] = from[k];
  if (from.aroll) to.aroll = front ? { ...from.aroll, ...(to.aroll || {}) } : { ...(to.aroll || {}), ...from.aroll };
  for (const k of ['moodN', 'arollN']) if (from[k]) to[k] = (to[k] || 0) + from[k];
}
// đoạn nội bộ → dạng lưu: trường cũ y như trước; trường mới chỉ có khi có dấu (tpl_fit, gateShape, QC cũ chạy như cũ)
function outSeg(s, stats) {
  const o = { kind: s.kind, say: s.say.join(' ').trim(), screen: s.screen.map(x => x.text), broll: s.broll.map(x => x.q) };
  if (s.mood) o.mood = s.mood;
  if (s.music) o.music = s.music;
  if (s.aroll) o.aroll = { ...s.aroll };
  if (s.broll.some(x => x.src)) o.brollSrc = s.broll.map(x => x.src);
  if (s.sfx.length) o.sfx = s.sfx.map(x => ({ ...x }));
  if (s.screen.some(x => x.kind)) o.screenKind = s.screen.map(x => x.kind);
  if (s.raw.length) o.raw = [...s.raw];
  if (s.note.length) o.note = [...s.note];
  if (s.at) o.at = { ...s.at };
  if (stats) o.n = { mood: s.moodN || 0, aroll: s.arollN || 0 };
  return o;
}

/**
 * Chữ kịch bản → các đoạn { kind: hook|body|cta, say, screen[], broll[] } (+ khi có dấu mới: mood, music, aroll {frame, take,
 * file, off}, brollSrc[] song song broll, sfx[{name, at: dau|cuoi|@từ}], screenKind[] song song screen, raw[] dấu lạ).
 * Không có chữ nói thì trả []. `stats`: thêm n = { mood, aroll } số dấu MOOD / A-ROLL của đoạn (checkSuggested).
 */
export function parseScript(text, { stats = false } = {}) {
  const src = String(text ?? '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/^[\t ]*(?:[-*•–]|\d+[.)])[\t ]+/gm, '');
  const lines = src.split('\n');
  const blank = /\S[^\n]*\n[ \t]*\n\s*\S/.test(src); // có dòng trống giữa hai dòng chữ
  const segs = []; let cur = null, pend = blankSeg('body');
  const close = () => { if (cur && hasAny(cur)) segs.push(cur); cur = null; };
  const open = kind => { close(); cur = blankSeg(kind); mergeInto(cur, pend, true); pend = blankSeg('body'); };
  for (const line of lines) {
    if (!line.trim()) { if (blank) close(); continue; }
    if (!blank && cur && cur.say.length) close(); // không có dòng trống: mỗi dòng một đoạn ([HOOK] đứng riêng một dòng thì nhận dòng sau)
    let last = 0, m; MARK.lastIndex = 0;
    const put = s => { s = s.replace(/\s+/g, ' ').trim(); if (!s) return; if (!cur) open('body'); cur.say.push(s); };
    while ((m = MARK.exec(line))) {
      const k = markName(m[1]);
      if (!k || (NEED_VALUE.has(k) && m[2] == null)) continue; // không phải dấu: giữ là chữ nói
      put(line.slice(last, m.index)); last = MARK.lastIndex;
      const v = String(m[2] ?? '').replace(/\s+/g, ' ').trim();
      if (k === 'hook' || k === 'cta') { open(k); if (v) cur.say.push(v); continue; }
      const to = cur || pend;
      if (!putMark(to, k, v)) to.raw.push(cut(m[0].replace(/\s+/g, ' '), 120));
    }
    put(line.slice(last));
  }
  close();
  if (hasAny(pend)) { const L = segs[segs.length - 1]; if (L) mergeInto(L, pend, false); }
  // đoạn chỉ có dấu (không lời) gắn vào đoạn có lời kế bên
  for (let i = 0; i < segs.length; i++) if (!segs[i].say.length) {
    const next = segs[i + 1] && segs[i + 1].say.length ? segs[i + 1] : null, to = next || segs.slice(0, i).reverse().find(x => x.say.length);
    if (to) { mergeInto(to, segs[i], to === next); if (to.kind === 'body' && segs[i].kind !== 'body') to.kind = segs[i].kind; }
  }
  return segs.filter(s => s.say.length).map(s => outSeg(s, stats));
}
/** Bỏ mọi dấu (cũ và mới) khỏi chữ kịch bản; giữ chữ của [HOOK: …] / [CTA: …] vì đó là lời nói. */
export function stripMarks(text) {
  return String(text ?? '').normalize('NFC').replace(MARK, (m0, k, v) => {
    const n = markName(k); if (!n || (NEED_VALUE.has(n) && v == null)) return m0;
    return n === 'hook' || n === 'cta' ? ` ${v || ''} ` : ' ';
  });
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
      xml = (method === 8 ? zlib.inflateRawSync(data, { maxOutputLength: 16 << 20 }) : method === 0 ? data : null)?.toString('utf8');
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
export function lcs(a, b) { // a, b: token đã chuẩn hoá → các cặp [i, j] khớp (giống topic_video.mjs lcsAlign)
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

/** Đoạn → [t0, t1] khi không có lời nghe được: đoạn có mốc bảng giữ mốc, các đoạn không mốc chia đều khoảng trống giữa hai mốc. */
function sheetSpans(segs, D) {
  const n = segs.length, a = segs.map(s => s.at?.t0 ?? null), b = segs.map((s, k) => s.at ? s.at.t1 ?? segs.slice(k + 1).find(x => x.at)?.at.t0 ?? null : null);
  const end = Math.max(D, ...a.filter(x => x != null).map(x => x + .5), ...b.filter(x => x != null));
  for (let k = 0; k < n;) {
    if (a[k] != null) { if (b[k] == null || b[k] <= a[k]) b[k] = k + 1 < n && a[k + 1] != null && a[k + 1] > a[k] ? a[k + 1] : a[k] + Math.max(.5, (end - a[k]) / Math.max(1, n - k)); k++; continue; }
    let j = k; while (j < n && a[j] == null) j++;
    const from = k ? b[k - 1] : 0, to = j < n ? a[j] : end, each = Math.max(.3, (to - from) / (j - k));
    for (let q = k; q < j; q++) { a[q] = from + each * (q - k); b[q] = a[q] + each; }
    k = j;
  }
  return a.map((x, k) => [x, Math.max(b[k], x + .3)]);
}
/**
 * Kịch bản + lời nghe được (whisper: [{w,s,e}], theo giờ timeline) → { segments (thêm t0/t1/spoken/ratio), words, align }.
 * Không có lời nghe được (video không lời) → chia đều thời lượng `dur` cho các đoạn, trong đoạn chia theo số ký tự.
 */
export function alignScript(segments, heard, { dur = 0, minRatio = .3, driftMax = 2 } = {}) {
  const segs = segments.map(s => ({ ...s, screen: [...(s.screen || [])], broll: [...(s.broll || [])] }));
  const W = segs.flatMap((s, k) => toks(s.say).map(w => ({ w, k, s: null, e: null })));
  heard = (heard || []).filter(h => h && Number.isFinite(+h.s) && Number.isFinite(+h.e)).map(h => ({ w: String(h.w ?? ''), s: +h.s, e: +h.e }));
  const len = w => norm(w).length + 1;
  if (!heard.length) { // ---- không lời: chia đều theo đoạn; đoạn có mốc giây của bảng (M197) giữ mốc đó, phần còn lại chia đều
    const span = sheetSpans(segs, Math.max(1, dur || 0));
    segs.forEach((s, k) => {
      const [a, b] = span[k], ws = W.filter(x => x.k === k), tot = ws.reduce((q, x) => q + len(x.w), 0) || 1; let t = a;
      for (const x of ws) { const d = (b - a) * len(x.w) / tot; x.s = r2(t); x.e = r2(t + d); t += d; }
      Object.assign(s, { t0: r2(a), t1: r2(b), spoken: true, ratio: null });
    });
    const sheet = segs.some(s => s.at) ? { sheet: segs.filter(s => s.at).length, drift: [] } : {};
    return { segments: segs, words: W, align: { mode: 'even', at: new Date().toISOString(), words: W.length, matched: 0, offscript: [], ...sheet } };
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
  // mốc giây của bảng (M197): giờ theo lời nói thắng, chỉ báo đoạn lệch mốc quá `drift` giây
  const drift = segs.flatMap((s, k) => s.at && s.t0 != null && Math.abs(s.t0 - s.at.t0) > driftMax ? [{ seg: k, sheet: s.at.t0, heard: s.t0, d: r2(s.t0 - s.at.t0) }] : []);
  const sheet = segs.some(s => s.at) ? { sheet: segs.filter(s => s.at).length, drift } : {};
  return { segments: segs, words: live, align: { mode: 'whisper', at: new Date().toISOString(), words: W.length, matched: pairs.length, offscript: offscript.map(({ words, ...o }) => o), ...sheet }, offWords: offscript.flatMap(o => o.words) };
}

// ---------- S27 M191: giờ dự kiến trước khi quay (scripts/script_draft.mjs) ----------
export const WPS = 2.6, WPS_MIN = 2.0, WPS_MAX = 3.4, GAP = .4, LEAD = .3, END_CARD = 2.5;
export const clampWps = v => (Number.isFinite(+v) && +v > 0 ? Math.min(WPS_MAX, Math.max(WPS_MIN, +v)) : WPS);
const estToks = s => String(s || '').split(/\s+/).filter(w => norm(w));
/**
 * Đoạn của parseScript → giờ dự kiến theo tốc độ đọc. Đoạn có mốc giây của bảng (M197, `at`) giữ mốc đó (không lùi trước đoạn trước);
 * đoạn không mốc đọc liền sau đoạn trước, nghỉ `gap`. Chữ chia theo số ký tự trong đoạn (như alignScript chế độ 'even').
 * → { segments (thêm t0/t1/spoken/ratio), words [{w,k,s,e}], speech (giây cuối lời), duration (+ thẻ kết), align {mode:'estimate', wps…} }
 */
export function estimateTimes(segments, { wps = WPS, gap = GAP, lead = LEAD, end = END_CARD } = {}) {
  wps = clampWps(wps);
  const segs = (segments || []).map(s => ({ ...s, screen: [...(s.screen || [])], broll: [...(s.broll || [])] }));
  const W = []; let cur = lead;
  const len = w => norm(w).length + 1;
  segs.forEach((s, k) => {
    const ws = estToks(s.say), read = Math.max(.8, ws.length / wps);
    const num = v => (v == null || v === '' ? null : Number.isFinite(+v) ? +v : null), at0 = num(s.at?.t0), at1 = num(s.at?.t1); // +null = 0: mốc trống không phải giây 0
    const t0 = at0 != null ? Math.max(cur, at0) : cur;
    const t1 = at1 != null && at1 > t0 + .3 ? at1 : t0 + read;
    const tot = ws.reduce((q, w) => q + len(w), 0) || 1; let t = t0;
    for (const w of ws) { const d = (t1 - t0) * len(w) / tot; W.push({ w, k, s: r2(t), e: r2(t + d) }); t += d; }
    Object.assign(s, { t0: r2(t0), t1: r2(t1), spoken: true, ratio: null });
    cur = t1 + gap;
  });
  const speech = r2(segs.length ? segs[segs.length - 1].t1 : 0);
  const timed = segs.filter(s => s.at).length;
  return { segments: segs, words: W, speech, duration: r2(speech + .4 + end),
    align: { mode: 'estimate', wps, at: new Date().toISOString(), words: W.length, matched: 0, offscript: [], ...(timed ? { sheet: timed, drift: [] } : {}) } };
}

/**
 * Quay xong (kịch bản từng là 'estimate', giờ căn theo giọng thật): dời mọi mục của timeline theo đoạn. Mục mang `_sheet` dời theo
 * đoạn của nó; mục khác theo đoạn chứa thời điểm của nó (khoảng nghỉ sau đoạn thuộc đoạn đó); sau đoạn cuối dời bằng độ lệch cuối.
 * Trong đoạn, giờ co giãn tuyến tính. Sửa `tl` tại chỗ (25_transcribe lưu chính đối tượng này). → số mục đã dời.
 */
const estOf = tl => (Array.isArray(tl.draft?.est) && tl.draft.est.length ? tl.draft.est.map(([t0, t1]) => ({ t0, t1 })) : null);
export function retimeDraft(tl, from, to, { shot = true } = {}) {
  const F = (from || []).map(s => [s.t0, s.t1]), T = (to || []).map(s => [s.t0, s.t1]);
  if (!F.length || F.length !== T.length || F.some(x => x[0] == null)) return 0;
  const map = (t, k = null) => {
    if (!Number.isFinite(t)) return t;
    let i = k != null && F[k] ? k : F.findIndex((f, j) => t < (F[j + 1]?.[0] ?? Infinity));
    if (i < 0) i = F.length - 1;
    while (i >= 0 && (T[i][0] == null || T[i][1] == null)) i--; // đoạn chưa nói: theo đoạn đã nói trước nó
    if (i < 0) return t;
    const [a, b] = F[i], [c, d] = T[i];
    if (t <= b) return r2(Math.max(0, c + (t - a) * ((d - c) / Math.max(.05, b - a))));
    const n = F[i + 1], m = T[i + 1]; // khoảng nghỉ trước đoạn kế: co giãn tới đầu đoạn kế
    if (n && m?.[0] != null && t <= n[0]) return r2(Math.max(0, d + (t - b) * ((m[0] - d) / Math.max(.05, n[0] - b))));
    return r2(Math.max(0, t + (d - b)));
  };
  let n = 0;
  const one = (x, keys) => { if (!x || typeof x !== 'object') return; const k = Number.isInteger(x._sheet) ? x._sheet : null; for (const key of keys) if (Number.isFinite(x[key])) x[key] = map(x[key], k); n++; };
  for (const s of tl.scenes || []) { one(s, ['t0', 't1']); if (s.t1 <= s.t0) s.t1 = r2(s.t0 + .3); }
  for (const f of tl.fx || []) one(f, ['t']);
  for (const x of tl.audio?.sfx || []) one(x, ['t']);
  // nhạc theo đoạn (M195): khúc đầu giữ mốc 0, chỉ dời mốc cuối; nền phủ cả video (không _sheet) để nguyên
  for (const m of tl.audio?.music || []) { if (m._sheet == null && m.t0 <= .05) continue; one(m, m.t0 <= .05 ? ['t1'] : ['t0', 't1']); }
  if (tl.draft) tl.draft = { ...tl.draft, est: (to || []).map(x => [x.t0, x.t1]), ...(shot ? { mode: 'shot', shot: new Date().toISOString() } : {}) };
  return n;
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
  const prev = readScript(dir); // heardDur: độ dài timeline lúc sao lưu phụ đề nhận dạng (applyScript)
  const doc = { version: 1, text: raw, name: String(name || '').slice(0, 120), updated: new Date().toISOString(), segments, ...(prev?.heardDur != null ? { heardDur: prev.heardDur } : {}) };
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
  const mute = !!tl.speech?.none, D = +tl.duration || 0;
  const backup = path.join(dir, '.studio', 'captions_noscript.json');
  // sửa kịch bản lần sau: căn với phụ đề nhận dạng đã sao lưu (không phải phụ đề đã theo kịch bản, vốn luôn "khớp"), khi timeline
  // chưa đổi độ dài kể từ lúc sao lưu (cắt / tốc độ làm lệch giờ của bản sao lưu → dùng phụ đề hiện có)
  let saved = null;
  if (!heard && !fresh && sc.heardDur != null && Math.abs(sc.heardDur - D) < .01) try { saved = JSON.parse(fs.readFileSync(backup, 'utf8')); } catch { /* không có bản sao lưu */ }
  // S27 M191: mẫu dựng sẵn chưa quay (timeline.draft.mode 'estimate'): phụ đề hiện có là chữ kịch bản theo giờ ước, không phải lời
  // nghe được → sửa kịch bản thì ước lại giờ theo tốc độ đọc. Có lời thật (fresh: Tạo lời thoại, heard) thì căn rồi dời mọi mục (retimeDraft).
  const draft = tl.draft?.mode === 'estimate';
  if (draft && !fresh && !heard) {
    const est = estimateTimes(sc.segments, { wps: tl.draft.wps });
    // giờ ước cũ của các mục nằm ở tl.draft.est (script.json vừa ghi lại không còn giờ): cùng số đoạn thì dời mục sang giờ ước mới
    const old = estOf(tl);
    if (old?.length === est.segments.length) retimeDraft(tl, old, est.segments, { shot: false });
    else tl.draft = { ...tl.draft, est: est.segments.map(x => [x.t0, x.t1]) };
    Object.assign(sc, { segments: est.segments, align: est.align }); wr(scriptFile(dir), sc);
    if (est.duration > D) tl.duration = est.duration;
    return { tl, caps: captionsFrom(est.words, { max }), script: sc };
  }
  const prevSegs = draft || sc.align?.mode === 'estimate' ? estOf(tl) || sc.segments : null;
  const H = mute ? [] : heard || heardOf(saved || caps);
  if (!mute && !H.length) return { tl, caps, script: sc, pending: true }; // chưa tách lời thoại: căn khi có (25_transcribe)
  if (caps.length && (fresh || (!sc.align && !fs.existsSync(backup)))) { wr(backup, caps); sc.heardDur = D; }
  const r = alignScript(sc.segments, H, { dur: speechSpan(tl) });
  const out = captionsFrom(r.words, { max, offWords: r.offWords || [] });
  Object.assign(sc, { segments: r.segments, align: r.align });
  // S27 M191: mẫu dựng sẵn trước khi quay (giờ ước theo tốc độ đọc) vừa có giọng thật: dời mọi mục theo giờ thật (tại chỗ)
  if (prevSegs && r.align.mode !== 'estimate') sc.retimed = retimeDraft(tl, prevSegs, r.segments);
  wr(scriptFile(dir), sc);
  return { tl, caps: out, script: sc };
}
/** Bỏ kịch bản: xoá script.json, trả phụ đề whisper đã sao lưu (null khi không có bản sao lưu). */
export function removeScript(dir) {
  rmSync(scriptFile(dir), { force: true });
  const backup = path.join(dir, '.studio', 'captions_noscript.json');
  let caps = null; try { caps = JSON.parse(fs.readFileSync(backup, 'utf8')); } catch { /* chưa áp lần nào */ }
  rmSync(backup, { force: true });
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
  try { for (const f of fs.readdirSync(stageDir())) { const p = path.join(stageDir(), f); if (/^s-.*\.json$/.test(f) && Date.now() - fs.statSync(p).mtimeMs > 30 * 864e5) rmSync(p, { force: true }); } } catch { /* chưa có thư mục */ }
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
const FRAME_VI = { can: 'cận mặt', trung: 'trung', rong: 'rộng' }, MUSIC_VI = { tat: 'tắt', bat: 'bật lại', doi: 'đổi bài', to: 'to hơn', nho: 'nhỏ hơn' };
export const arollText = a => [a?.off ? 'bỏ hình người nói' : '', FRAME_VI[a?.frame] || '', a?.take ? `take ${a.take}` : '', a?.file || ''].filter(Boolean).join(' · ');
export const musicText = v => MUSIC_VI[v] || (v === 'kho' ? 'bài trong Kho' : String(v).startsWith('kho:') ? `Kho: ${String(v).slice(4)}` : String(v));
/** Danh sách dấu có thời điểm: [{ kind: hook|screen|broll|cta|mood|music|aroll|sfx, text, t0, t1, seg }] (đoạn chưa nói thì bỏ).
 *  screen có thể kèm `style` (kiểu khối), broll kèm `src` (nguồn ép), sfx kèm `pos` (dau|cuoi|@từ), aroll kèm `aroll`. */
export function scriptMarks(sc) {
  const out = [];
  (sc?.segments || []).forEach((s, k) => {
    if (s.spoken === false || s.t0 == null) return;
    const at = { t0: s.t0, t1: s.t1, seg: k };
    if (s.kind === 'hook') out.push({ kind: 'hook', text: s.screen[0] || s.say, ...at });
    if (s.kind === 'cta') out.push({ kind: 'cta', text: s.screen[0] || s.say, ...at });
    s.screen.forEach((t, i) => { if (s.kind === 'body' || i) out.push({ kind: 'screen', text: t, ...(s.screenKind?.[i] ? { style: s.screenKind[i] } : {}), ...at }); });
    s.broll.forEach((t, i) => out.push({ kind: 'broll', text: t, ...(s.brollSrc?.[i] ? { src: s.brollSrc[i] } : {}), ...at }));
    // S27 M193: dấu dựng (không phải chữ trên màn hình: markMissing bỏ qua; QC dấu mới thuộc M194)
    if (s.mood) out.push({ kind: 'mood', text: s.mood, ...at });
    if (s.music) out.push({ kind: 'music', text: s.music, ...at });
    if (s.aroll) out.push({ kind: 'aroll', text: arollText(s.aroll), aroll: { ...s.aroll }, ...at });
    for (const x of s.sfx || []) out.push({ kind: 'sfx', text: x.name, pos: x.at, ...at });
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
    + (s.mood ? `\n   · MOOD: "${s.mood}"` : '') + (s.music ? `\n   · NHẠC: ${musicText(s.music)}` : '') + (s.aroll ? `\n   · A-ROLL: ${arollText(s.aroll)}` : '')
    + s.screen.map((t, i) => `\n   · CHỮ: "${t}"${s.screenKind?.[i] ? ` (kiểu ${s.screenKind[i]})` : ''}`).join('')
    + s.broll.map((t, i) => `\n   · B-ROLL: "${t}"${s.brollSrc?.[i] ? ` (nguồn ${s.brollSrc[i]})` : ''}`).join('')
    + (s.sfx || []).map(x => `\n   · SFX: "${x.name}" (${x.at === 'cuoi' ? 'cuối đoạn' : String(x.at).startsWith('@') ? `lúc nói "${x.at.slice(1)}"` : 'đầu đoạn'})`).join('')).join('\n');
}

/** Dấu chưa được đặt trên timeline: chữ (hook / CHỮ / CTA) không thấy trong cảnh nào quanh đoạn đó, B-ROLL không có cảnh hình nào.
 *  `strings(scene)` = các chữ graphic hiện (ai_edit.mjs sceneStrings); `title` = tiêu đề / hook của timeline. */
export function markMissing(marks, scenes, { strings = () => [], title = '' } = {}) {
  const key = s => fold(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const covers = (have, want) => { if (have.includes(want)) return true; const w = want.split(' '), h = new Set(have.split(' ')); return w.length >= 2 && w.filter(x => h.has(x)).length / w.length >= .6; };
  const isPic = s => !!(s.broll || s.screen?.broll || s.media || s.image || s.images || /broll|media|photo|image|kinetic_broll/.test(String(s.type)));
  return (marks || []).filter(m => {
    if (!['hook', 'screen', 'broll', 'cta'].includes(m.kind)) return false; // dấu dựng (MOOD, NHẠC, A-ROLL, SFX): không có cảnh chữ / hình để soát
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
  const sc = readScript(dir); if (!sc) return null;
  if (!tl?.ads?.on) { if (sc.gate) { delete sc.gate; wr(scriptFile(dir), sc); } return null; } // tắt quảng cáo: bỏ kết quả soát cũ
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
