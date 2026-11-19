// Nguồn cho bản dựng (S27 M198, docs/plans/S27-dung-theo-kich-ban.md mục 8; references/script.md mục 10).
// Người dùng thả thêm video / ảnh ở ô Kịch bản: file nằm trong Kho của thương hiệu (Nguon/, qua /api/kho/upload), danh sách ghi ở
// <dự án>/.studio/script_sources.json { version: 1, items: [{ rel, name, kind, at }] } (rel = đường dẫn tương đối trong Kho của dự án).
// AI dựng (scripts/ai_edit.mjs) ưu tiên các file này trước Kho chung → thư viện → stock → b-roll động:
//  - đoạn có ghi file (dấu `[B-ROLL: … | tệp a.mp4]`, cột source của Excel) dùng đúng file đó (findSource);
//  - file chưa gắn đoạn: Claude xem tên + khung ảnh nhỏ (contactSheet: vài khung mỗi video, ảnh thu nhỏ, tối đa MAX_IMAGES ảnh) rồi chọn
//    đoạn hợp nhất và, với video dài, giây bắt đầu của đoạn con (assignPrompt / checkAssign / applyAssign); không có Claude thì khớp tên.
// Tên do người dùng ghi (Excel, dấu) chỉ phân giải trong danh sách nguồn / Kho: chặn tuyệt đối, UNC, `..`, `:` (bài học ai-video-studio-002);
// file thật kiểm bằng resolveRel của kho_media (realpath). Thư mục tạm xoá bằng rmSync của fs_rm (ai-video-studio-055).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fold } from './script_doc.mjs';
import { rmSync } from './fs_rm.mjs';

export const MAX_SOURCES = 40, MAX_IMAGES = 12, CLIP_MAX = 60; // video ≤ CLIP_MAX giây: dùng cả file (dời khung); dài hơn: cắt đoạn con
const KIND = { video: /\.(mp4|mov|m4v|mkv|webm|avi|mts)$/i, image: /\.(jpe?g|png|webp|gif|heic)$/i };
export const kindOfName = f => (KIND.video.test(f) ? 'video' : KIND.image.test(f) ? 'image' : null);
const key = s => fold(String(s || '')).replace(/[^a-z0-9]+/g, ' ').trim();
const r2 = v => Math.round(v * 100) / 100;

// ---------- danh sách nguồn của dự án ----------
export const sourcesFile = dir => path.join(dir, '.studio', 'script_sources.json');
export function readSources(dir) {
  try { const j = JSON.parse(fs.readFileSync(sourcesFile(dir), 'utf8')); return (Array.isArray(j?.items) ? j.items : []).filter(x => x && typeof x.rel === 'string' && kindOfName(x.rel)); } catch { return []; }
}
export function writeSources(dir, items) {
  const f = sourcesFile(dir); fs.mkdirSync(path.dirname(f), { recursive: true });
  const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify({ version: 1, items }, null, 1)); fs.renameSync(t, f);
  return items;
}
export const dropSources = dir => rmSync(sourcesFile(dir), { force: true });

/** Lý do một tên / đường dẫn người dùng ghi không được dùng (null = được). Chỉ nhận tên file hoặc đường dẫn tương đối. */
export function unsafeName(s) {
  const t = String(s ?? '');
  if (!t.trim() || t.length > 300 || t.includes('\0')) return 'tên trống hoặc quá dài';
  if (/^[\\/]{2}/.test(t) || /^[\\/]/.test(t) || /^[a-z]:/i.test(t) || path.isAbsolute(t)) return 'chỉ nhận tên file hoặc đường dẫn trong Kho';
  const parts = t.split(/[\\/]+/).filter(Boolean);
  if (parts.some(p => p === '..' || p === '.' || p.startsWith('.') || p.includes(':'))) return 'đường dẫn ra ngoài Kho';
  return null;
}
/**
 * Tên file / đường dẫn tương đối (cột source Excel, dấu `| tệp …`) → mục nguồn hoặc Kho, nguồn bạn đưa thắng. So bỏ dấu, không phân biệt
 * hoa thường: cả đường dẫn, tên file, hoặc tên không đuôi. → { rel, name, kind, mine } | null (cũng null khi tên không an toàn).
 */
export function findSource(name, { sources = [], items = [] } = {}) {
  if (unsafeName(name)) return null;
  const n = key(String(name).replace(/\\/g, '/')), stem = s => key(path.posix.basename(String(s)).replace(/\.\w+$/, ''));
  const hit = list => list.find(x => key(x.rel) === n) || list.find(x => key(path.posix.basename(x.rel)) === n) || list.find(x => stem(x.rel) === n || key(x.name) === n);
  const a = hit(sources); if (a) return { rel: a.rel, name: a.name || path.posix.basename(a.rel), kind: a.kind || kindOfName(a.rel), mine: true };
  const b = hit(items.filter(x => ['video', 'image'].includes(x.kind))); if (b) return { rel: b.rel, name: b.name || path.posix.basename(b.rel), kind: b.kind, mine: false };
  return null;
}
/**
 * Thêm file Kho vào danh sách nguồn. `resolve(rel)` (kho_media.resolveRel(ws, ·), ném lỗi khi thoát Kho / không thấy) kiểm từng file.
 * → { items, added: [rel], skipped: [{ rel, why }] }. Trùng thì bỏ qua; tối đa MAX_SOURCES.
 */
export function addSources(dir, rels, resolve) {
  const items = readSources(dir), have = new Set(items.map(x => x.rel)), added = [], skipped = [];
  for (const r of (Array.isArray(rels) ? rels : []).slice(0, MAX_SOURCES)) {
    const rel = typeof r === 'string' ? r.split(/[\\/]+/).filter(Boolean).join('/') : '';
    const bad = unsafeName(rel) || (!kindOfName(rel) && 'chỉ nhận video hoặc ảnh');
    if (bad) { skipped.push({ rel: String(r).slice(0, 120), why: bad }); continue; }
    try { resolve(rel); } catch (e) { skipped.push({ rel, why: String(e.message || e).slice(0, 120) }); continue; }
    if (have.has(rel)) continue;
    if (items.length >= MAX_SOURCES) { skipped.push({ rel, why: `tối đa ${MAX_SOURCES} nguồn` }); continue; }
    items.push({ rel, name: path.posix.basename(rel), kind: kindOfName(rel), at: new Date().toISOString() }); have.add(rel); added.push(rel);
  }
  if (added.length) writeSources(dir, items);
  return { items, added, skipped };
}
export function removeSource(dir, rel) {
  const items = readSources(dir), next = items.filter(x => x.rel !== rel);
  if (next.length !== items.length) writeSources(dir, next);
  return next;
}
/** Tên file kịch bản ghi (`tep:<tên>` của dấu B-ROLL) mà không thấy trong nguồn / Kho → [tên] (ô Kịch bản báo một dòng). */
export function missingFiles(text, ctx) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/\|\s*(?:tệp|tep|file)\s+([^\]|]+?)\s*\]/gi)) if (!findSource(m[1], ctx)) out.add(m[1].trim().slice(0, 80));
  return [...out];
}

// ---------- khung ảnh nhỏ cho Claude ----------
const run = (cmd, args, timeout = 60000) => new Promise((ok, no) => execFile(cmd, args, { timeout, killSignal: 'SIGKILL', maxBuffer: 1 << 20, windowsHide: true }, (e, o) => (e ? no(e) : ok(String(o)))));
export const probeDur = async f => { try { return +(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], 30000)).trim() || 0; } catch { return 0; } };
/** Ảnh nhỏ một file: video → một hàng `frames` khung đều (tile), ảnh → thu nhỏ 480 px. → đường dẫn ảnh, hoặc null khi ffmpeg lỗi. */
export async function contactSheet(abs, out, { kind = kindOfName(abs), dur = 0, frames = 4 } = {}) {
  try {
    if (kind === 'video') {
      const fps = dur > 0 ? Math.max(.01, frames / dur) : 1;
      await run('ffmpeg', ['-v', 'error', '-y', '-i', abs, '-vf', `fps=${fps.toFixed(4)},scale=240:-2,tile=${frames}x1`, '-frames:v', '1', '-q:v', '5', out], 120000);
    } else await run('ffmpeg', ['-v', 'error', '-y', '-i', abs, '-vf', 'scale=480:480:force_original_aspect_ratio=decrease', '-frames:v', '1', '-q:v', '5', out]);
    return fs.existsSync(out) ? out : null;
  } catch { return null; }
}

// ---------- gán nguồn chưa có đoạn ----------
/** Nguồn chưa có ô B-roll nào trong bảng dựng (đoạn có ghi file đã có ô `pick` = rel). */
export const unboundSources = (sources, sheet) => {
  const used = new Set((sheet?.rows || []).flatMap(r => (r.broll || []).filter(b => b.src === 'kho' && b.pick).map(b => b.pick)));
  return sources.filter(s => !used.has(s.rel));
};
const rowsOf = sheet => (sheet?.rows || []).filter(r => r.t0 != null && r.spoken !== false && r.t1 != null && r.t1 > r.t0);
/**
 * Prompt cho Claude chọn đoạn của từng nguồn. list: [{ id, name, kind, dur, img }] (img = tên ảnh trong thư mục hiện tại hoặc null).
 */
export function assignPrompt(list, sheet) {
  const segs = rowsOf(sheet).map(r => `- đoạn ${r.seg}: ${r.t0.toFixed(1)}–${r.t1.toFixed(1)} s (${(r.t1 - r.t0).toFixed(1)} s)${r.kind && r.kind !== 'body' ? ` [${r.kind}]` : ''}: “${String(r.say || '').slice(0, 160)}”` +
    `${(r.broll || []).length ? ` · đã có b-roll: ${r.broll.map(b => b.q).join(', ').slice(0, 80)}` : ''}${(r.note || []).length ? ` · chỉ dẫn: ${r.note.join('; ').slice(0, 120)}` : ''}`);
  const src = list.map(x => `- ${x.id}: “${x.name}” (${x.kind === 'video' ? `video ${x.dur ? x.dur.toFixed(1) + ' s' : 'chưa rõ dài'}` : 'ảnh'})${x.img ? ` · khung ảnh: ${x.img}` : ''}`);
  return `Người dùng đưa thêm các file dưới đây để dựng video theo kịch bản. Dùng công cụ Read mở các file "khung ảnh" (ảnh trong thư mục hiện tại; với video là một hàng vài khung cắt đều từ đầu tới cuối) rồi chọn cho MỖI file một đoạn kịch bản hợp nhất về nội dung (dựa vào hình và tên file).
Luật: mỗi file một đoạn; ưu tiên đoạn chưa có b-roll; không đặt vào đoạn hook nếu không thật hợp; video dài hơn đoạn thì ghi "from" = giây bắt đầu trong video của phần hợp nhất (phần dài bằng đoạn); file không hợp đoạn nào thì bỏ ra khỏi danh sách và ghi lý do vào "skip".
Trả về DUY NHẤT JSON {"assign":[{"id":"S1","seg":0,"from":0,"why":"…"}],"skip":[{"id":"S2","why":"…"}]}.

Đoạn kịch bản:
${segs.join('\n')}

File của người dùng:
${src.join('\n')}`;
}
/** Kiểm kết quả của Claude: id có thật, đoạn có thật (đã căn, có lời), mỗi file một lần; `from` kẹp trong [0, dur − dài đoạn]. */
export function checkAssign(raw, list, sheet) {
  const rows = new Map(rowsOf(sheet).map(r => [r.seg, r])), byId = new Map(list.map(x => [x.id, x])), seen = new Set(), out = [];
  for (const a of Array.isArray(raw?.assign) ? raw.assign : []) {
    const x = byId.get(String(a?.id || '').trim()), r = rows.get(+a?.seg);
    if (!x || !r || seen.has(x.id)) continue;
    seen.add(x.id);
    const len = r.t1 - r.t0, max = x.kind === 'video' && x.dur > len ? x.dur - len : 0;
    out.push({ rel: x.rel, name: x.name, kind: x.kind, seg: r.seg, from: x.kind === 'video' ? r2(Math.max(0, Math.min(max, +a.from || 0))) : 0, why: String(a.why || '').slice(0, 120) });
  }
  return out;
}
/** Không có Claude (hoặc lỗi): khớp tên file với lời của đoạn (scoreRel của kho_media); file không khớp gì thì để trống. */
export function assignByName(list, sheet, score) {
  const rows = rowsOf(sheet), out = [], took = new Set();
  for (const x of list) {
    const best = rows.map(r => ({ r, s: score(x.rel, r.say || '') - (took.has(r.seg) ? .5 : 0) })).filter(y => y.s > 0).sort((a, b) => b.s - a.s)[0];
    if (!best) continue;
    took.add(best.r.seg);
    const len = best.r.t1 - best.r.t0;
    out.push({ rel: x.rel, name: x.name, kind: x.kind, seg: best.r.seg, from: x.kind === 'video' && x.dur > len ? r2((x.dur - len) / 2) : 0, why: 'tên file khớp lời' });
  }
  return out;
}
/** Thêm ô B-roll `from: 'claude'` (hoặc 'auto' khi khớp tên) vào bảng dựng đang nhớ cho từng file đã gán. Sửa `sheet` tại chỗ. */
export function applyAssign(sheet, assign, from = 'claude') {
  for (const a of assign) {
    const r = (sheet?.rows || []).find(x => x.seg === a.seg); if (!r) continue;
    r.broll ||= [];
    if (r.broll.some(b => b.src === 'kho' && b.pick === a.rel)) continue;
    r.broll.push({ q: a.name.replace(/\.\w+$/, ''), src: 'kho', pick: a.rel, alts: [], mine: true, ...(a.from ? { clip: a.from } : {}), from, ...(a.why ? { why: a.why } : {}) });
  }
  return sheet;
}
/** Đánh dấu ô B-roll của bảng dựng đang dùng file của người dùng (đoạn ghi file, Kho tự khớp). */
export function markMine(sheet, sources) {
  const mine = new Set(sources.map(s => s.rel));
  for (const r of sheet?.rows || []) for (const b of r.broll || []) if (b.src === 'kho' && mine.has(b.pick)) b.mine = true;
  return sheet;
}
/**
 * Gán các nguồn chưa có đoạn (Claude xem khung ảnh; lỗi / không Claude → khớp tên). Sửa `sheet` tại chỗ.
 * o: { abs(rel) → đường dẫn tuyệt đối, ask(prompt, { cwd }) → JSON (askJSON có Read), score (scoreRel), onP(text) }
 * → { assigned: [{ rel, name, seg, from, why }], by: 'claude' | 'name' | null, error? }
 */
export async function assignSources(sheet, sources, o = {}) {
  const free = unboundSources(sources, sheet);
  if (!free.length || !rowsOf(sheet).length) return { assigned: [], by: null };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-src-'));
  try {
    const list = [];
    for (let i = 0; i < free.length; i++) {
      const s = free[i], id = `S${i + 1}`, abs = o.abs?.(s.rel), kind = s.kind || kindOfName(s.rel);
      const dur = kind === 'video' && abs ? await probeDur(abs) : 0;
      let img = null;
      if (abs && i < MAX_IMAGES && o.ask) { o.onP?.(`Xem khung ảnh nguồn bạn đưa (${i + 1}/${Math.min(free.length, MAX_IMAGES)}): ${s.name}`); img = await contactSheet(abs, path.join(tmp, `${id}.jpg`), { kind, dur }) ? `${id}.jpg` : null; }
      list.push({ id, rel: s.rel, name: s.name || path.posix.basename(s.rel), kind, dur, img });
    }
    let assigned = [], by = null, error;
    if (o.ask) try { assigned = checkAssign(await o.ask(assignPrompt(list, sheet), { cwd: tmp }), list, sheet); by = 'claude'; } catch (e) { error = String(e.message || e).slice(0, 160); }
    if (!by && o.score) { assigned = assignByName(list, sheet, o.score); by = 'name'; }
    applyAssign(sheet, assigned, by === 'claude' ? 'claude' : 'auto');
    return { assigned, by, ...(error ? { error } : {}) };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// ---------- đưa file vào dự án ----------
/**
 * File nguồn `rel` vào media/ của dự án cho một ô B-roll dài `len` giây bắt đầu ở giây `clip` của video. Video ≤ CLIP_MAX: cả file
 * (useFromKho), trả `off` = clip để cảnh dời khung; dài hơn: cắt đoạn con (ffmpeg) vào media/kho_<tên>_<giây>s.mp4 rồi tách khung.
 * → { seq, off? } | { path }. K = kho_media.mjs, ws = Kho của dự án.
 */
export async function useSource(dir, ws, K, rel, { clip = 0, len = 4 } = {}) {
  const abs = fs.realpathSync.native(K.resolveRel(ws, rel));
  if (kindOfName(abs) !== 'video') { const it = await K.useFromKho(dir, ws, rel, { credit: 'Nguồn bạn đưa · kịch bản' }); return { path: it.path }; }
  const dur = await probeDur(abs);
  if (dur > 0 && dur <= CLIP_MAX) {
    const it = await K.useFromKho(dir, ws, rel, { credit: 'Nguồn bạn đưa · kịch bản' });
    if (!it.seq) throw new Error('video không có hình');
    return { seq: it.seq, off: Math.max(0, Math.min(clip, Math.max(0, dur - .5))) };
  }
  const from = Math.max(0, Math.min(clip, Math.max(0, dur - len))), stem = K.mediaName(path.join(dir, 'media'), abs).replace(/\.\w+$/, '');
  const name = `${stem}_${Math.round(from)}s.mp4`, out = path.join(dir, 'media', name), fr = path.join(dir, 'media', `${stem}_${Math.round(from)}s_frames`);
  if (!fs.existsSync(fr)) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const tmp = `${out}.${process.pid}.tmp.mp4`;
    try {
      await run('ffmpeg', ['-v', 'error', '-y', '-ss', String(from), '-i', abs, '-t', String(Math.min(30, len + 1)), '-an', '-vf', 'scale=w=1280:h=1280:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', tmp], 300000);
      fs.renameSync(tmp, out);
    } finally { rmSync(tmp, { force: true }); }
    await K.expandVideo(out, fr);
  }
  const it = K.mediaItem(dir, name);
  if (!it.seq?.count) throw new Error('không cắt được đoạn video');
  return { seq: it.seq };
}

// ---------- báo cáo ----------
/** Nguồn nào đã có cảnh (`_script.mine` = rel) trong danh sách cảnh. → { total, used: [tên], unused: [tên], items: [{ rel, name }] } */
export function sourceReport(sources, scenes = []) {
  const have = new Set(scenes.filter(s => !s.hidden).map(s => s?._script?.mine).filter(Boolean));
  const items = sources.map(s => ({ rel: s.rel, name: s.name || path.posix.basename(s.rel) }));
  return { total: items.length, used: items.filter(x => have.has(x.rel)).map(x => x.name), unused: items.filter(x => !have.has(x.rel)).map(x => x.name), items };
}
