// Lịch sử xuất của dự án (S14 M112, docs/plans/S14-xuat-cot-phai-diem.md): <dự án>/.studio/exports.json.
// Bản xuất là dữ liệu của dự án, không chỉ là một hộp thoại: panel Xuất (studio/features/55_exports.js), cột phải (M113)
// và điểm bước Xuất (M114) cùng đọc qua readExports / exportsView / latestExport.
//
// { version: 1, items: [ {               // cũ → mới, tối đa MAX bản
//     id,                                // chuỗi duy nhất (lúc job bắt đầu, ms; bản cũ trước M112: "old-<mtime>")
//     at,                                // ISO, lúc xuất xong
//     quality: '720' | '1080' | '4k' | null,
//     range: { from, to } | null,        // chỉ xuất một đoạn
//     files: [ { file: 'out/….mp4', aspect: '9:16', w, h, dur, size, note? } ],   // file đầu là bản gốc (render thật)
//     delivered: [ <đường dẫn tuyệt đối trong Thanh pham/> ], deliverError: string | null,
//     legacy?: true                      // nhặt lại từ out/ khi dự án chưa có exports.json
// } ] }
// Đường dẫn file luôn tương đối với dự án, không ra ngoài dự án (đọc lại cũng kiểm). Trạng thái "còn trên đĩa" và
// "đã giao" tính lúc đọc (exportsView), không lưu, nên file bị xoá ngoài Studio chỉ được đánh dấu, không gây lỗi.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { deliveredOf } from './kho_deliver.mjs';

export const MAX = 100;
const fileOf = dir => path.join(dir, '.studio', 'exports.json');
const VID = /\.(mp4|mov|m4v|webm)$/i;

/** Đường dẫn tuyệt đối của một file tương đối trong dự án; ra ngoài dự án hoặc không hợp lệ → null. Không giải mã URL. */
export function inProject(dir, rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\0') || path.isAbsolute(rel)) return null;
  const root = path.resolve(dir), p = path.resolve(root, rel);
  return p.startsWith(root + path.sep) ? p : null;
}
const relOf = (dir, f) => path.relative(path.resolve(dir), path.resolve(dir, f)).split(path.sep).join('/');

/** Khổ hình dễ đọc: 9:16, 16:9, 1:1, 4:5, 5:4; khác thì "W×H". */
export function aspectOf(w, h) {
  if (!(w > 0 && h > 0)) return null;
  const r = w / h, k = [['9:16', 9 / 16], ['16:9', 16 / 9], ['1:1', 1], ['4:5', 4 / 5], ['5:4', 5 / 4]].find(([, v]) => Math.abs(r - v) < .02);
  return k ? k[0] : `${w}×${h}`;
}
/** Chất lượng theo cạnh ngắn của bản gốc. */
export function qualityOf(w, h) {
  const s = Math.min(w || 0, h || 0);
  return s === 720 ? '720' : s === 1080 ? '1080' : s === 2160 ? '4k' : null;
}

/** Kích thước + thời lượng bằng ffprobe (bất đồng bộ, không treo server); không có ffprobe thì null. */
export function probe(file) {
  return new Promise(ok => {
    execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], { windowsHide: true, timeout: 20000 }, (e, out) => {
      if (e) return ok(null);
      try { const j = JSON.parse(out), s = j.streams?.[0] || {}; ok({ w: +s.width || null, h: +s.height || null, dur: +(+j.format?.duration).toFixed(2) || null }); } catch { ok(null); }
    });
  });
}

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = v => (typeof v === 'string' && v ? v : null);
// Chuẩn hoá một bản đọc từ đĩa (file có thể bị sửa tay): bỏ file ra ngoài dự án, bỏ trường lạ.
function clean(dir, x) {
  if (!x || typeof x !== 'object' || !str(x.id)) return null;
  const files = (Array.isArray(x.files) ? x.files : []).filter(f => f && inProject(dir, f.file)).map(f => ({
    file: relOf(dir, f.file), aspect: str(f.aspect), w: num(f.w), h: num(f.h), dur: num(f.dur), size: num(f.size), ...(str(f.note) ? { note: f.note } : {}),
  }));
  if (!files.length) return null;
  const r = x.range && typeof x.range === 'object' ? { from: num(x.range.from), to: num(x.range.to) } : null;
  return {
    id: x.id, at: str(x.at) || new Date(0).toISOString(), quality: ['720', '1080', '4k'].includes(x.quality) ? x.quality : null,
    range: r && (r.from != null || r.to != null) ? r : null, files,
    delivered: (Array.isArray(x.delivered) ? x.delivered : []).filter(p => typeof p === 'string' && path.isAbsolute(p)),
    deliverError: str(x.deliverError), ...(x.legacy ? { legacy: true } : {}),
  };
}

/** Các bản xuất của dự án, cũ → mới, đã chuẩn hoá. Chưa có file → []. */
export function readExports(dir) {
  let j = null; try { j = JSON.parse(fs.readFileSync(fileOf(dir), 'utf8')); } catch { return []; }
  return (Array.isArray(j?.items) ? j.items : []).map(x => clean(dir, x)).filter(Boolean).sort((a, b) => a.at.localeCompare(b.at));
}
export const hasLog = dir => fs.existsSync(fileOf(dir));
function writeAll(dir, items) {
  const f = fileOf(dir), t = `${f}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(t, JSON.stringify({ version: 1, items: items.slice(-MAX) }, null, 1));
  fs.renameSync(t, f);
}
/** Thêm (hoặc thay bản cùng id). → bản đã chuẩn hoá | null khi không hợp lệ. */
export function recordExport(dir, item) {
  const c = clean(dir, item); if (!c) return null;
  // bản cũ nhặt từ out/ (legacy) trùng file với bản mới ghi: bỏ file đó khỏi bản cũ, bản cũ rỗng thì bỏ luôn
  const mine = new Set(c.files.map(f => f.file));
  const items = readExports(dir).filter(x => x.id !== c.id)
    .map(x => (x.legacy && !c.legacy ? { ...x, files: x.files.filter(f => !mine.has(f.file)) } : x)).filter(x => x.files.length);
  items.push(c); items.sort((a, b) => a.at.localeCompare(b.at));
  writeAll(dir, items); return c;
}
/** Sửa một bản theo id (vd. sau khi giao lại vào Thành phẩm). → bản mới | null */
export function updateExport(dir, id, patch) {
  const items = readExports(dir), i = items.findIndex(x => x.id === id); if (i < 0) return null;
  const c = clean(dir, { ...items[i], ...patch }); if (!c) return null;
  items[i] = c; writeAll(dir, items); return c;
}

/** Thông tin một file vừa xuất: dung lượng + ffprobe (thiếu ffprobe thì lấy khổ theo timeline nếu có). */
export async function describe(dir, rel, { aspect, note, tl } = {}) {
  const abs = inProject(dir, rel); if (!abs) return null;
  let size = null; try { size = fs.statSync(abs).size; } catch { return null; }
  const p = await probe(abs) || {};
  const w = p.w || null, h = p.h || null;
  return { file: relOf(dir, rel), aspect: aspect || aspectOf(w, h) || (tl ? aspectOf(tl.width, tl.height) : null), w, h, dur: p.dur ?? null, size, ...(note ? { note } : {}) };
}

/**
 * Bản ghi từ job xuất của server Studio (job.out, job.outs, job.delivered, job.deliverError, job.started).
 * o: { quality, from, to } do giao diện gửi (không có thì đoán chất lượng theo cạnh ngắn bản gốc).
 */
export async function itemFromJob(dir, job, o = {}) {
  if (!job || job.kind !== 'export' || job.state !== 'done' || !str(job.out)) return null;
  const outs = Array.isArray(job.outs) && job.outs.length ? job.outs : [{ out: job.out }];
  const files = (await Promise.all(outs.map(x => describe(dir, x.out, { aspect: x.aspect, note: x.note })))).filter(Boolean);
  if (!files.length) return null;
  const q = ['720', '1080', '4k'].includes(String(o.quality)) ? String(o.quality) : qualityOf(files[0].w, files[0].h);
  const from = num(o.from), to = num(o.to);
  return {
    id: String(job.started || Date.now()), at: new Date().toISOString(), quality: q, range: from != null || to != null ? { from, to } : null,
    files, delivered: Array.isArray(job.delivered) ? job.delivered : [], deliverError: str(job.deliverError),
  };
}

/** Dự án chưa có exports.json: nhặt các video trong out/ (mới nhất trước, tối đa max) làm bản cũ. Ghi file luôn. */
export async function seedFromOut(dir, { max = 20 } = {}) {
  if (hasLog(dir)) return readExports(dir);
  const out = path.join(dir, 'out');
  let names = []; try { names = fs.readdirSync(out).filter(f => VID.test(f) && !f.startsWith('.')); } catch {}
  const stats = names.map(f => { try { return { f, s: fs.statSync(path.join(out, f)) }; } catch { return null; } }).filter(x => x?.s.isFile())
    .sort((a, b) => b.s.mtimeMs - a.s.mtimeMs).slice(0, max);
  const items = [];
  for (const { f, s } of stats) {
    const d = await describe(dir, 'out/' + f);
    if (d) items.push({ id: 'old-' + Math.round(s.mtimeMs) + '-' + f, at: new Date(s.mtimeMs).toISOString(), quality: qualityOf(d.w, d.h), range: null, files: [d], delivered: [], deliverError: null, legacy: true });
  }
  if (hasLog(dir)) return readExports(dir); // ghi song song trong lúc probe: giữ bản đã có
  writeAll(dir, items.reverse().map(x => clean(dir, x)).filter(Boolean));
  return readExports(dir);
}

/**
 * Bản xem cho giao diện, mới → cũ: mỗi file thêm abs, exists, deliveredTo (bản giao còn đúng theo sổ .studio/delivered.json);
 * mỗi bản thêm missing (mọi file đã mất), deliveredNow (số file còn bản giao).
 * keep(p): lọc đường dẫn giao được trả ra (vd. chỉ trong Thanh pham/ của Kho dự án).
 */
export function exportsView(dir, { keep = () => true, items = readExports(dir) } = {}) {
  return items.slice().reverse().map(x => {
    const files = x.files.map(f => {
      const abs = inProject(dir, f.file), exists = !!abs && fs.existsSync(abs);
      const to = exists ? deliveredOf(dir, f.file) : null;
      return { ...f, abs, exists, deliveredTo: to && keep(to) ? to : null };
    });
    return { ...x, delivered: x.delivered.filter(keep), files, missing: files.every(f => !f.exists), deliveredNow: files.filter(f => f.deliveredTo).length };
  });
}
/** Bản xuất mới nhất (dạng exportsView) | null — cho cột phải (M113) và điểm bước Xuất (M114). */
export const latestExport = (dir, o) => exportsView(dir, o)[0] || null;
