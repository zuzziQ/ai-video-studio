// S19 M135: "Áp cho các clip còn lại" — sửa xong một clip của bộ (các clip cắt từ cùng một video dài, studio/routes/57_clipset.mjs)
// thì đem những thay đổi đếm được của clip đó sang các clip khác của bộ. Hàm thuần trên dữ liệu + vài hàm đọc / ghi file của dự án,
// test được không cần server (scripts/tests/s19_clipset_apply.test.mjs). Spec: references/studio.md mục "Áp cho các clip còn lại".
//
// "Trước" của clip đang sửa (bản máy giao), theo thứ tự:
//   1. .studio/autopilot_result.json — Tự lái đã chạy trên clip (cảnh _auto / _ai do máy chèn);
//   2. .studio/set_base.json — {timeline, captions} do Cắt clip (scripts/highlights.mjs) ghi lúc dựng clip, hoặc chụp lúc mở bộ
//      lần đầu khi clip chưa được lưu lần nào (chưa có .studio/history);
//   3. bản lịch sử cũ nhất .studio/history/*.json (đã là bản sau lần lưu đầu — kém chính xác nhất).
//   Phụ đề "trước" lấy từ 2 rồi 3 (autopilot_result.json chỉ có timeline).
//
// Thay đổi đếm được (giống observe() của scripts/profile.mjs, nhưng ra việc cụ thể để áp):
//   drop:<kind>   — xoá HẾT emoji / chữ nổi / ảnh tự động (cảnh _auto/_ai, không _base) → xoá loại đó ở clip khác. Xoá một phần: chỉ báo.
//   caption_style / pack — đổi kiểu phụ đề / gói style → đặt giống.
//   music_off     — tắt nhạc nền (xoá, ẩn hoặc tắt tiếng hết) → ẩn nhạc (hidden) ở clip khác.
//   music_gain    — đổi dB nhạc → cộng cùng số dB vào nhạc của clip khác.
//   words         — sửa chữ phụ đề: cặp từ cũ → mới (cùng mốc thời gian), áp như thay thế từ (không phân biệt hoa thường).
import fs from 'node:fs';
import path from 'node:path';

const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const KIND = s => s.type === 'emoji_pop' ? 'emoji' : s.type === 'text' ? 'text' : s.type === 'photo' ? 'photo' : null;
const MINE = s => !!(s && (s._auto || s._ai) && !s._base);
export const KIND_LABEL = { emoji: 'emoji tự động', text: 'chữ nổi tự động', photo: 'ảnh tự động' };
const liveMusic = tl => (tl?.audio?.music || []).filter(m => m && !m.hidden && !m.mute);
const gainOf = m => Number.isFinite(+m?.gain) ? +m.gain : -20;
const norm = w => String(w ?? '').trim().replace(/^[\s"'“”‘’(]+|[\s"'“”‘’)…:;.,!?]+$/g, '').normalize('NFC').toLowerCase();
const flatWords = caps => (Array.isArray(caps) ? caps : []).flatMap(c => Array.isArray(c?.words) ? c.words : []);

/** Cặp từ cũ → mới giữa phụ đề trước / sau: từ cùng mốc bắt đầu (±20 ms) mà chữ khác. Một từ cũ sửa thành hai chữ khác nhau thì bỏ. */
export function wordPairs(capsBefore, capsAfter) {
  const before = flatWords(capsBefore).filter(w => Number.isFinite(+w.s));
  const pairs = new Map(), bad = new Set();
  for (const w of flatWords(capsAfter)) {
    if (!Number.isFinite(+w.s)) continue;
    const o = before.find(b => Math.abs(+b.s - +w.s) <= 0.02);
    if (!o) continue;
    const a = norm(o.w), b = norm(w.w);
    if (!a || !b || a === b) continue;
    if (pairs.has(a) && norm(pairs.get(a).to) !== b) bad.add(a);
    else pairs.set(a, { from: String(o.w).trim(), to: String(w.w).trim() }); // giữ chữ gốc để hiện; khi áp so không phân biệt hoa thường
  }
  for (const k of bad) pairs.delete(k);
  return [...pairs.values()];
}

/** Những gì người dùng đã đổi ở clip này (before → after) thành danh sách việc áp được. `notes`: điều thấy nhưng không áp. */
export function changesOf(before, after) {
  const B = before?.timeline || {}, A = after?.timeline || {};
  const ops = [], notes = [];
  for (const k of ['emoji', 'text', 'photo']) {
    const nb = (B.scenes || []).filter(s => MINE(s) && KIND(s) === k).length, na = (A.scenes || []).filter(s => MINE(s) && KIND(s) === k).length;
    if (nb && !na) ops.push({ op: 'drop', kind: k, label: `Xoá ${KIND_LABEL[k]}` });
    else if (nb > na) notes.push(`Bạn xoá ${nb - na}/${nb} ${KIND_LABEL[k]} — chỉ xoá một phần nên không áp`);
  }
  for (const [k, label] of [['caption_style', 'Kiểu phụ đề'], ['pack', 'Gói style']]) {
    const v = A[k] || '';
    if (v && v !== (B[k] || '')) ops.push({ op: k, value: v, label: `${label} → “${v}”` });
  }
  const mb = liveMusic(B), ma = liveMusic(A);
  if (mb.length && !ma.length) ops.push({ op: 'music_off', label: 'Tắt nhạc nền' });
  else if (mb.length && ma.length) {
    const d = +(gainOf(ma[0]) - gainOf(mb[0])).toFixed(1);
    if (d) ops.push({ op: 'music_gain', db: d, to: gainOf(ma[0]), label: `Nhạc nền ${d > 0 ? 'to' : 'nhỏ'} hơn ${Math.abs(d)} dB` });
  }
  const pairs = wordPairs(before?.captions, after?.captions);
  if (pairs.length) ops.push({ op: 'words', pairs, label: `Sửa chữ phụ đề: ${pairs.slice(0, 4).map(p => `${p.from} → ${p.to}`).join(', ')}${pairs.length > 4 ? ` (+${pairs.length - 4})` : ''}` });
  return { ops, notes };
}

/** Áp `ops` lên một clip khác ({timeline, captions}); trả bản mới (không sửa bản vào) và số chỗ đổi theo từng việc. */
export function applyOps(project, ops) {
  const tl = JSON.parse(JSON.stringify(project?.timeline || {}));
  const caps = JSON.parse(JSON.stringify(Array.isArray(project?.captions) ? project.captions : []));
  const what = [];
  for (const o of ops || []) {
    let n = 0;
    if (o.op === 'drop') {
      const keep = (tl.scenes || []).filter(s => !(MINE(s) && KIND(s) === o.kind));
      n = (tl.scenes || []).length - keep.length; if (n) tl.scenes = keep;
    } else if (o.op === 'caption_style' || o.op === 'pack') {
      if ((tl[o.op] || '') !== o.value) { tl[o.op] = o.value; n = 1; }
    } else if (o.op === 'music_off') {
      for (const m of liveMusic(tl)) { m.hidden = true; n++; }
    } else if (o.op === 'music_gain') {
      // clip đã ở đúng mức (áp rồi, hoặc tự chỉnh giống) thì thôi: bấm áp lần nữa từ clip khác không cộng dB hai lần
      const ms = liveMusic(tl);
      if (ms.length && !(o.to != null && gainOf(ms[0]) === o.to)) for (const m of ms) { m.gain = +(gainOf(m) + o.db).toFixed(1); n++; }
    } else if (o.op === 'words') {
      const map = new Map(o.pairs.map(p => [norm(p.from), p.to]));
      for (const w of flatWords(caps)) { const to = map.get(norm(w.w)); if (to != null && w.w !== to) { w.w = to; n++; } }
    }
    if (n) what.push({ op: o.op, label: o.label, n });
  }
  return { timeline: tl, captions: caps, what, n: what.reduce((a, x) => a + x.n, 0) };
}

// ---------- đọc / ghi dự án (thư mục do server có, không nhận từ trình duyệt) ----------
const inside = (dir, rel) => { const f = path.resolve(dir, String(rel)); const r = path.relative(path.resolve(dir), f); return r && !r.startsWith('..') && !path.isAbsolute(r) ? f : null; };
/** {timeline, captions, capFile} của một dự án; phụ đề là file (work/captions.json) hoặc nằm sẵn trong timeline. */
export function readClip(dir) {
  const timeline = rd(path.join(dir, 'timeline.json'));
  if (!timeline) return null;
  let captions = timeline.captions, capFile = null;
  if (typeof captions === 'string') { capFile = inside(dir, captions); captions = capFile ? rd(capFile) : null; }
  return { timeline, captions: Array.isArray(captions) ? captions : [], capFile };
}
const histDir = dir => path.join(dir, '.studio/history');
const histList = dir => { try { return fs.readdirSync(histDir(dir)).filter(f => f.endsWith('.json')).sort(); } catch { return []; } };
/** Chụp bản máy giao của clip khi chưa có (clip chưa được lưu lần nào); đã có thì thôi. */
export function captureBase(dir) {
  const f = path.join(dir, '.studio/set_base.json');
  if (fs.existsSync(f) || histList(dir).length) return false;
  const p = readClip(dir); if (!p) return false;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ timeline: p.timeline, captions: p.captions, t: new Date().toISOString(), from: 'open' }));
  return true;
}
/** Bản "trước" của clip: {timeline, captions, from} hoặc null. Thứ tự ở đầu file. */
export function baseOf(dir) {
  const ap = rd(path.join(dir, '.studio/autopilot_result.json'));
  const sb = rd(path.join(dir, '.studio/set_base.json'));
  const h0 = histList(dir)[0], first = h0 ? rd(path.join(histDir(dir), h0)) : null;
  const caps = [sb, first].find(x => Array.isArray(x?.captions))?.captions || null;
  if (ap && typeof ap === 'object') return { timeline: ap, captions: caps, from: 'autopilot' };
  if (sb?.timeline) return { timeline: sb.timeline, captions: caps, from: 'set_base' };
  if (first?.timeline) return { timeline: first.timeline, captions: caps, from: 'history' };
  return null;
}
const stampAt = ms => new Date(ms).toISOString().replace(/[:.]/g, '-').slice(0, 19); // như stamp() của studio/server.mjs
function snap(dir, ms, data) {
  fs.mkdirSync(histDir(dir), { recursive: true });
  let t = ms, f;
  do { f = path.join(histDir(dir), `${stampAt(t)}.json`); t += 1000; } while (fs.existsSync(f));
  fs.writeFileSync(f, JSON.stringify(data));
  return path.basename(f, '.json');
}
/** Ghi bản đã áp của một clip: ảnh chụp bản cũ (để "Lịch sử" mở lại) rồi bản mới vào .studio/history, như save() của server
 *  (giữ 60 bản mới nhất). Trả tên ảnh chụp bản cũ. */
export function writeClip(dir, old, next, now = Date.now()) {
  const was = snap(dir, now - 1000, { timeline: old.timeline, captions: old.captions, note: 'trước khi áp từ clip cùng bộ' });
  const tl = next.timeline;
  if (old.capFile) fs.writeFileSync(old.capFile, JSON.stringify(next.captions, null, 1));
  else if (Array.isArray(tl.captions)) tl.captions = next.captions;
  const tmp = path.join(dir, `timeline.json.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(tl, null, 1)); fs.renameSync(tmp, path.join(dir, 'timeline.json'));
  snap(dir, now, { timeline: tl, captions: next.captions });
  const all = histList(dir);
  // unlinkSync, không rmSync: Node 24 trên Windows rmSync bỏ qua im lặng đường dẫn có chữ có dấu (thư mục bộ "… - clip ngắn")
  for (const f of all.slice(0, Math.max(0, all.length - 60))) try { fs.unlinkSync(path.join(histDir(dir), f)); } catch { /* lần sau dọn */ }
  return was;
}

/**
 * Xem trước / áp cho cả bộ. `set` = clipSet() của dự án đang mở; `skip(item)` → lý do bỏ qua (đang mở ở tab khác, đang chạy tác vụ) hoặc ''.
 * `only`: chỉ số clip được chọn (mặc định mọi clip áp được). → {from, ops, notes, clips: [{i, title, n, what, skip?}], applied}
 */
export function planSet(set, { skip = () => '', only = null, write = false, now = Date.now() } = {}) {
  const me = set.items[set.cur];
  const before = baseOf(me.dir), after = readClip(me.dir);
  if (!before || !after) return { from: null, ops: [], notes: ['Chưa có bản máy giao của clip này để so — mở lại bộ rồi sửa, hoặc lưu clip một lần'], clips: [], applied: 0 };
  const { ops, notes } = changesOf(before, after);
  const clips = [];
  let applied = 0;
  for (const it of set.items) {
    if (it.current) continue;
    const row = { i: it.i, title: it.title, n: 0, what: [] };
    if (!it.exists) { clips.push({ ...row, skip: 'đã xoá' }); continue; }
    const why = skip(it); if (why) { clips.push({ ...row, skip: why }); continue; }
    const cur = readClip(it.dir); if (!cur) { clips.push({ ...row, skip: 'không đọc được timeline' }); continue; }
    const next = applyOps(cur, ops);
    Object.assign(row, { n: next.n, what: next.what });
    if (write && next.n && (!only || only.includes(it.i))) { row.snapshot = writeClip(it.dir, cur, next, now); row.done = true; applied++; }
    clips.push(row);
  }
  return { from: before.from, ops: ops.map(({ op, label }) => ({ op, label })), notes, clips, applied };
}
