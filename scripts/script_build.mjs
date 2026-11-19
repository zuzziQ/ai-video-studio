// Bảng dựng theo đoạn của kịch bản (S27 M193, docs/plans/S27-dung-theo-kich-ban.md mục 1.1, 2.1, 2.2; references/script.md mục 7).
// <dự án>/.studio/build_sheet.json: mỗi đoạn của kịch bản đã căn (t0/t1) một hàng: mood, nhạc, A-roll, B-roll, SFX, chữ.
// Mỗi ô có `from`: mark (dấu trong kịch bản) | claude | auto (luật) | user (sửa trên bảng). Dựng lại chỉ thay ô claude / auto,
// ô mark theo dấu mới, ô user giữ khi lời của hàng không đổi; `lock: true` giữ nguyên cả hàng.
// B-roll tìm theo thứ tự Kho của thương hiệu → thư viện cá nhân → stock (chỉ khi được bật, cần mạng) → b-roll động của catalog;
// ảnh AI không tự sinh lúc dựng bảng (chỉ khi người dùng bấm hoặc lúc Áp, M194). Không lưu đường dẫn ra ngoài dự án: `pick` của
// Kho là đường dẫn tương đối trong Kho, chỉ liên kết vào media/kho_* lúc Áp (useFromKho).
// Cũng ở đây: Claude gợi ý dấu cho kịch bản trơn (suggestPrompt + checkSuggested: Claude không được sửa lời).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fold, norm, parseScript, stripMarks, readScript, musicText } from './script_doc.mjs';
import { rmSync } from './fs_rm.mjs';
import { ruleCells } from './script_table.mjs';
import { DEFAULT_MUSIC_GAIN } from './audio_defaults.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r2 = v => Math.round(v * 100) / 100;
const key = s => fold(s).replace(/[^a-z0-9]+/g, ' ').trim();
export const WPS = 2.6; // tốc độ đọc ước lượng (từ / giây), như estimateTimes của M191
export const SHEET_VERSION = 1;

// ---------- mood ----------
// chữ tự do của [MOOD: …] → mood của assets/music/catalog.json. Bảng đồng nghĩa trước, rồi từ của mood (kho_media moodWords).
const MOOD_SYN = [
  ['suspense', 'hoi hop, cang thang, bi an, gay can, ky bi, rung ron, kinh di'], ['happy', 'vui, vui ve, vui tuoi, phan khoi, ho hoi, tuoi vui'],
  ['sad', 'buon, tram, xuc dong, tiec nuoi, nghen ngao, u buon'], ['mellow', 'nhe nhang, thu gian, em diu, binh yen, diu dang'],
  ['epic', 'hung trang, hoanh trang, manh me, bung no, cao trao'], ['hype', 'soi dong, nang dong, sung, quay, nhanh, manh'],
  ['inspire', 'truyen cam hung, dong luc, tich cuc, hy vong'], ['tech', 'cong nghe, hien dai, dien tu, so hoa'],
  ['corporate', 'doanh nghiep, chuyen nghiep, cong ty, trang trong'], ['lofi', 'lofi, chill, tam su nhe'],
  ['real_estate_luxury', 'sang trong, dang cap, cao cap, bat dong san'], ['ambient_calm', 'yen tinh, thien, spa, tinh lang'],
  ['piano_minimal', 'piano, sau lang, tam su'], ['kids_playful', 'tre em, vui nhon, ngo nghinh, tinh nghich'],
  ['news_bg', 'tin tuc, ban tin, thoi su'], ['acoustic_warm', 'am ap, moc mac, acoustic, guitar'],
  ['cinematic_epic', 'dien anh, trailer, ky vi'], ['tiktok_trap', 'trap, tiktok, bat tai'], ['corporate_upbeat', 'tuoi sang, lac quan'],
].map(([m, w]) => [m, w.split(',').map(x => x.trim())]);
/** Chữ mood → mood của catalog (null khi không đoán được: Claude chọn ở bảng dựng, M194). `moods` = các mood có trong catalog. */
export function moodOf(text, moods = [], wordsOf = null) {
  const k = key(text).replace(/ /g, '_'), f = ' ' + key(text) + ' ';
  if (!k) return null;
  const have = new Set(moods), ok = m => !have.size || have.has(m);
  if (have.has(k)) return k;
  let best = null, bs = 0;
  const score = (m, ws) => { for (const w of ws) if (w && f.includes(' ' + w + ' ') && w.length > bs && ok(m)) { best = m; bs = w.length; } };
  for (const [m, ws] of MOOD_SYN) score(m, ws);
  if (!best && wordsOf) for (const m of moods) score(m, wordsOf(m));
  return best;
}

// ---------- SFX ----------
/** Tên / mô tả SFX → tên trong assets/sfx/catalog.json (null khi không khớp). */
export function sfxOf(text, catalog = []) {
  const k = key(text); if (!k) return null;
  const exact = catalog.find(x => x.name === String(text).trim() || key(x.name) === k);
  if (exact) return exact.name;
  let best = null, bs = 0;
  for (const x of catalog) for (const t of [x.name.replace(/_\d+$/, '').replace(/_/g, ' '), ...(x.tags || [])]) {
    const tk = key(t); if (!tk) continue;
    const s = (' ' + k + ' ').includes(' ' + tk + ' ') ? tk.length + 1 : tk.includes(k) && k.length >= 3 ? k.length : 0;
    if (s > bs) { best = x.name; bs = s; }
  }
  return best;
}

// ---------- B-roll ----------
const MISS = { kho: 'Kho không có cảnh khớp', lib: 'Thư viện không có cảnh khớp', stock: 'Stock không có kết quả (cần mạng)', dong: 'Không có b-roll động khớp', tep: 'Kho không có tệp này' };
/** B-roll động của catalog khớp chữ nhất (luôn trả một mục khi catalog không rỗng: chốt chặn cuối). → [{ id, score }] tốt nhất trước */
export function dynamicFor(q, catalog = [], n = 3) {
  const f = ' ' + key(q) + ' ';
  const sc = catalog.map((x, i) => {
    let s = 0; for (const t of [x.topic && x.topic.replace(/-/g, ' '), x.text, ...(x.tags || [])]) { const tk = key(t || ''); if (tk && f.includes(' ' + tk + ' ')) s += 1 + (tk.split(' ').length - 1) * 1.5; }
    return { id: x.id, score: s, i };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.i - b.i);
  if (sc.length || !catalog.length) return sc.slice(0, n);
  let h = 0; for (const c of key(q)) h = (h * 31 + c.charCodeAt(0)) >>> 0; // không khớp gì: một mục cố định theo chữ (dựng lại không đổi)
  return [{ id: catalog[h % catalog.length].id, score: 0 }];
}
/**
 * Một ô B-roll: tìm theo thứ tự nguồn (mục 2.2), dừng ở nguồn đầu có kết quả; 2–3 kết quả kế vào `alts` ("nguồn:mã").
 * `want` = nguồn ép từ dấu (kho|stock|ai|dong|tep:<tên>): chỉ dùng nguồn đó, không có thì `miss` (ô đỏ), không rơi xuống nguồn khác.
 * src: { kho(q, exclude) → [{rel, score}], lib(q, exclude) → [{id, score}], stock(q) → Promise<[{url}]>|null, dyn(q) → [{id}], ai: bool }
 */
export async function pickBroll(q, want, src, taken = new Set()) {
  const order = want ? [want.startsWith('tep:') ? 'tep' : want] : ['kho', 'lib', ...(src.stock ? ['stock'] : []), 'dong'];
  const hits = [];
  for (const s of order) {
    let got = [];
    if (s === 'kho') got = (src.kho?.(q, taken) || []).map(x => ({ src: 'kho', id: x.rel }));
    else if (s === 'tep') { const name = key(want.slice(4)); got = (src.files?.() || []).filter(x => key(x.name) === name || key(x.rel) === name || key(x.name.replace(/\.\w+$/, '')) === name).map(x => ({ src: 'kho', id: x.rel })); }
    else if (s === 'lib') got = (src.lib?.(q, taken) || []).map(x => ({ src: 'lib', id: x.id }));
    else if (s === 'stock' && src.stock) { try { got = ((await src.stock(q)) || []).filter(x => x?.url).map(x => ({ src: 'stock', id: x.url })); } catch { got = []; } }
    else if (s === 'dong') got = (src.dyn?.(q) || []).map(x => ({ src: 'dong', id: x.id }));
    else if (s === 'ai') return { q, src: 'ai', pick: null, alts: [], pending: 'Ảnh AI tạo khi bấm hoặc lúc Áp' };
    got = got.filter(x => !taken.has(`${x.src}:${x.id}`));
    hits.push(...got);
    if (!want && hits.length >= 3) break;
  }
  if (!hits.length) return { q, src: want || null, pick: null, alts: [], miss: MISS[want?.startsWith('tep:') ? 'tep' : want] || MISS.dong };
  const [first, ...rest] = hits;
  const alts = rest.slice(0, 3).map(x => `${x.src}:${x.id}`);
  if (src.ai && !want && alts.length < 3) alts.push(`ai:${q}`);
  return { q, src: first.src, pick: first.id, alts, ...(want ? { want } : {}) }; // want: nguồn ép từ dấu (AI dựng không đổi sang nguồn khác)
}

// ---------- bảng dựng ----------
const wordAt = (words, w, t0, t1) => { const n = norm(w); if (!n) return null; const x = (words || []).find(h => h.s >= t0 - .2 && h.s <= t1 + .2 && norm(h.w).startsWith(n)); return x ? x.s : null; };
const sayKey = s => (String(s || '').split(/\s+/).map(norm).filter(Boolean).join(' '));
/**
 * Kịch bản (script.json, đã hoặc chưa căn) → bảng dựng { version, script_updated, at, rows }. Hàm thuần: mọi dữ liệu ngoài qua `o`.
 * o: { prev (bảng cũ), moods [mood catalog], moodWords(m), mood (mood nhạc hiện tại của dự án), sfx [catalog SFX], words [{w,s,e}]
 *      lời đã căn (SFX @từ), src (pickBroll) }
 */
export async function buildSheet(sc, o = {}) {
  const segs = sc?.segments || [], src = o.src || {}, taken = new Set(), rows = [];
  let mood = null, moodFrom = null;
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k], t0 = s.t0 ?? s.at?.t0 ?? null, t1 = s.t1 ?? s.at?.t1 ?? null; // chưa căn: mốc giây của kịch bản bảng (M197)
    const row = { seg: k, t0, t1, kind: s.kind, say: s.say, ...(s.spoken === false ? { spoken: false } : {}), ...(s.note?.length ? { note: [...s.note] } : {}) };
    // mood: dấu MOOD áp cho đoạn đó và các đoạn sau tới dấu MOOD kế (kế thừa khi dựng bảng, không chép vào script.json)
    if (s.mood) { mood = s.mood; moodFrom = k; }
    row.mood = mood != null
      ? { v: moodOf(mood, o.moods, o.moodWords), text: mood, from: 'mark', ...(moodFrom !== k ? { inherit: moodFrom } : {}) }
      : { v: o.mood || null, from: 'auto' };
    row.music = s.music ? { v: s.music, from: 'mark' } : { v: 'bed', from: 'auto' };
    row.aroll = s.aroll ? { frame: s.aroll.frame || null, take: s.aroll.take ?? null, ...(s.aroll.file ? { file: s.aroll.file } : {}), ...(s.aroll.off ? { off: true } : {}), from: 'mark' }
      : { frame: null, take: null, from: 'auto' };
    row.broll = [];
    for (let i = 0; i < s.broll.length; i++) {
      const b = await pickBroll(s.broll[i], s.brollSrc?.[i] || null, src, taken);
      if (b.pick) taken.add(`${b.src}:${b.pick}`);
      row.broll.push({ ...b, from: 'mark' });
    }
    if (!s.broll.length && s.kind === 'body' && s.spoken !== false && !s.aroll?.off) { // luật đơn giản: Kho / thư viện khớp rõ lời của đoạn
      const strong = [...(src.kho?.(s.say, taken) || []).filter(x => x.score >= 2.5).map(x => ({ src: 'kho', id: x.rel })),
        ...(src.lib?.(s.say, taken) || []).filter(x => x.score >= 2.5).map(x => ({ src: 'lib', id: x.id }))].filter(x => !taken.has(`${x.src}:${x.id}`));
      if (strong.length) { taken.add(`${strong[0].src}:${strong[0].id}`); row.broll.push({ q: s.say.slice(0, 80), src: strong[0].src, pick: strong[0].id, alts: strong.slice(1, 3).map(x => `${x.src}:${x.id}`), from: 'auto' }); }
    }
    row.sfx = (s.sfx || []).map(x => {
      const name = sfxOf(x.name, o.sfx), word = String(x.at).startsWith('@') ? x.at.slice(1) : null;
      const at = t0 == null ? null : x.at === 'cuoi' ? r2(Math.max(t0, (t1 ?? t0) - .6)) : word ? (wordAt(o.words, word, t0, t1 ?? t0) ?? t0) : t0;
      return { name, q: x.name, at, pos: x.at, ...(name ? {} : { miss: 'Không có SFX khớp' }), from: 'mark' };
    });
    if (!row.sfx.length && k === 0 && s.kind === 'hook' && (o.sfx || []).some(x => x.name === 'whoosh')) row.sfx.push({ name: 'whoosh', q: 'whoosh', at: t0, pos: 'dau', from: 'auto' });
    row.screen = s.screen.map((t, i) => ({ text: t, kind: s.screenKind?.[i] || null, from: 'mark' }));
    if (s.note?.length) await noteCells(row, s, src, taken);
    row.lock = false;
    rows.push(row);
  }
  return { version: SHEET_VERSION, script_updated: sc?.updated || null, at: new Date().toISOString(), rows: mergeSheet(rows, o.prev) };
}
/**
 * Chỉ dẫn [GHI CHÚ] của đoạn (kịch bản Excel, M197) → ô bảng dựng ngầm, không bước Nhận / Bỏ: luật thuần (ruleCells) cho mẫu câu hay
 * gặp; ô mang `from: 'note'` + `note` = nguyên văn câu người dùng viết (ghi chú "Kịch bản yêu cầu …" trên timeline đọc lại).
 * Không đè ô của dấu / người dùng; chỉ dẫn luật chưa hiểu vẫn nằm ở row.note, AI dựng đọc trong prompt (sheetPrompt).
 */
async function noteCells(row, s, src, taken) {
  for (const note of s.note) {
    const tag = { from: 'note', note };
    for (const c of ruleCells(note, s.say).cells) {
      if (c.type === 'aroll') { if (row.aroll?.from === 'auto') row.aroll = { ...row.aroll, frame: c.frame, ...tag }; }
      else if (c.type === 'focus') { if (!row.focus) row.focus = { on: c.on, ...(c.target ? { target: c.target } : {}), ...tag }; }
      else if (c.type === 'transition') { if (!row.transition) row.transition = { v: c.v, ...tag }; }
      else if (c.type === 'broll') {
        if (row.broll.some(b => key(b.q) === key(c.q))) continue;
        const b = await pickBroll(c.q, null, src, taken); // nguồn theo thứ tự thường (Kho → thư viện → stock khi bật → động)
        if (b.pick) taken.add(`${b.src}:${b.pick}`);
        row.broll.push({ ...b, ...tag });
      } else if (c.type === 'graphic') { if (!row.screen.some(x => key(x.text) === key(c.text))) row.screen.push({ text: c.text, kind: 'vidu', ...tag }); }
    }
  }
}
/** Giữ phần người dùng đã sửa của bảng cũ: hàng khoá giữ cả hàng; ô `user` giữ khi lời của hàng không đổi (so norm(say)). */
export function mergeSheet(rows, prev) {
  const old = Array.isArray(prev?.rows) ? prev.rows : [];
  if (!old.length) return rows;
  const pool = new Map(); for (const r of old) { const k = sayKey(r.say); if (!pool.has(k)) pool.set(k, []); pool.get(k).push(r); }
  return rows.map(r => {
    const list = pool.get(sayKey(r.say)), p = list?.length ? list.shift() : null;
    if (!p) return r;
    if (p.lock) return { ...p, seg: r.seg, t0: r.t0, t1: r.t1, kind: r.kind };
    const out = { ...r };
    const kept = x => x?.from === 'user';
    for (const f of ['mood', 'music', 'aroll', 'focus', 'transition']) if (kept(p[f])) out[f] = p[f];
    for (const f of ['broll', 'sfx', 'screen']) {
      const mine = (p[f] || []).filter(kept); if (!mine.length) continue;
      const id = x => (f === 'broll' ? key(x.q) : f === 'sfx' ? key(x.q || x.name) : key(x.text));
      const ids = new Set(mine.map(id));
      out[f] = [...(r[f] || []).filter(x => x.from === 'mark' && !ids.has(id(x))), ...mine];
    }
    return out;
  });
}

// ---------- lưu / đọc ----------
export const sheetFile = dir => path.join(dir, '.studio', 'build_sheet.json');
export function readSheet(dir) { try { const s = JSON.parse(fs.readFileSync(sheetFile(dir), 'utf8')); return s && Array.isArray(s.rows) ? s : null; } catch { return null; } }
export function writeSheet(dir, sheet) { const f = sheetFile(dir); fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(sheet, null, 1)); fs.renameSync(t, f); return sheet; }
export const dropSheet = dir => rmSync(sheetFile(dir), { force: true });
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/**
 * Dựng bảng cho dự án: đọc kịch bản, Kho của thương hiệu, thư viện, catalog; ghi .studio/build_sheet.json. Trả bảng, hoặc null khi
 * dự án không có kịch bản. o: { tl, captions, stock: bool (tìm stock qua mạng), ai: bool (có khoá ảnh AI: thêm phương án ảnh AI) }
 */
export async function sheetFor(dir, o = {}) {
  const sc = readScript(dir); if (!sc) return null;
  const tl = o.tl || readJSON(path.join(dir, 'timeline.json')) || {};
  const { src, music, sfx, K } = await sheetSources(dir, tl, o);
  const words = (o.captions || []).flatMap(c => (c.words || []).map(w => ({ w: w.w, s: w.s ?? c.t0, e: w.e ?? c.t1 })));
  const sheet = await buildSheet(sc, { prev: readSheet(dir), moods: [...new Set(music.map(x => x.mood))], moodWords: K?.moodWords, mood: tl.music?.mood || null, sfx, words, src });
  return writeSheet(dir, sheet);
}
/** Nguồn B-roll của pickBroll cho dự án (Kho của thương hiệu, thư viện, stock khi o.stock, b-roll động) + catalog nhạc / SFX / b-roll động. */
export async function sheetSources(dir, tl = {}, o = {}) {
  const music = readJSON(path.join(SKILL, 'assets/music/catalog.json')) || [], sfx = readJSON(path.join(SKILL, 'assets/sfx/catalog.json')) || [];
  const dyn = readJSON(path.join(SKILL, 'assets/broll/catalog.json')) || [];
  let K = null, items = [];
  try { K = await import('./kho_media.mjs'); items = K.khoItems(dir, K.khoOf(dir, tl)).filter(it => ['broll', 'image'].includes(it.group) && it.kind !== 'audio'); } catch { /* chưa có Kho */ }
  const unused = items.filter(it => !it.used); // file Kho đã vào video thì không chọn lại
  let L = null; try { L = await import('./broll_lib.mjs'); } catch { /* không có thư viện */ }
  let S = null; if (o.stock) try { S = await import('./ai_broll.mjs'); } catch { /* không có module stock */ }
  const src = {
    kho: (q, taken) => (K ? K.searchKho(unused, q, { n: 4, exclude: new Set([...taken].filter(x => x.startsWith('kho:')).map(x => x.slice(4))) }) : []),
    files: () => items,
    lib: (q, taken) => (L ? L.search(q, { n: 4, exclude: new Set([...taken].filter(x => x.startsWith('lib:')).map(x => x.slice(4))) }) : []),
    stock: S ? async q => (await S.search(q, { kind: 'video', n: 4 })).items : null,
    dyn: q => dynamicFor(q, dyn),
    ai: !!o.ai,
  };
  return { src, music, sfx, dyn, items, libItems: L ? L.load() : [], K };
}

// ---------- Claude gợi ý dấu cho kịch bản trơn (mục 1.1) ----------
const spoken = t => stripMarks(t).split(/\s+/).map(norm).filter(Boolean);
const LIMIT = { mood: 1, screen: 2, broll: 2, sfx: 2 };
/**
 * Kiểm bản Claude trả về so với bản gốc. → { ok, text, added, issues[], error }
 *  1. bỏ mọi dấu ở cả hai bản rồi so chữ nói (norm): lệch → không áp ("Claude đã sửa lời").
 *  2. mỗi đoạn tối đa 1 MOOD, 2 CHỮ, 2 B-ROLL, 2 SFX (không tính dấu người dùng đã có); MOOD đổi tối đa một lần / ~10 s đọc;
 *     không dấu A-ROLL clip / take / tệp (Claude không biết các take).
 */
export function checkSuggested(orig, out, { wps = WPS, gap = 10 } = {}) {
  orig = String(orig ?? ''); out = String(out ?? '').replace(/\r\n?/g, '\n').trim();
  if (!out) return { ok: false, error: 'Claude không trả về kịch bản', issues: [] };
  const a = spoken(orig), b = spoken(out);
  if (a.length !== b.length || a.some((w, i) => w !== b[i])) {
    const i = a.findIndex((w, j) => w !== b[j]);
    return { ok: false, error: 'Claude đã sửa lời, không áp', issues: [`lệch từ thứ ${(i < 0 ? a.length : i) + 1}`] };
  }
  const so = parseScript(out, { stats: true }), sa = parseScript(orig, { stats: true }), same = so.length === sa.length;
  const issues = []; let t = 0, cur = null, lastT = null;
  so.forEach((s, k) => {
    const base = same ? sa[k] : null, n = { mood: s.n.mood, screen: s.screen.length, broll: s.broll.length, sfx: (s.sfx || []).length };
    const had = { mood: base?.n.mood || 0, screen: base?.screen.length || 0, broll: base?.broll.length || 0, sfx: (base?.sfx || []).length };
    for (const f of Object.keys(LIMIT)) if (n[f] > Math.max(LIMIT[f], had[f])) issues.push(`đoạn ${k + 1}: ${n[f]} dấu ${f === 'screen' ? 'CHỮ' : f === 'broll' ? 'B-ROLL' : f.toUpperCase()} (tối đa ${LIMIT[f]})`);
    if ((s.aroll?.take != null || s.aroll?.file) && !(base?.aroll?.take != null || base?.aroll?.file)) issues.push(`đoạn ${k + 1}: dấu A-ROLL chọn clip / take (Claude không biết các take)`);
    if (s.mood && key(s.mood) !== key(cur || '')) {
      if (lastT != null && t - lastT < gap && !(base?.mood && key(base.mood) === key(s.mood))) issues.push(`đoạn ${k + 1}: đổi MOOD sau ${Math.round(t - lastT)} s (tối thiểu ~${gap} s)`);
      cur = s.mood; lastT = t;
    }
    t += s.say.split(/\s+/).filter(Boolean).length / wps;
  });
  const br = x => (x.match(/\[[^\]\n]*\]/g) || []).length, count = x => br(x) - br(stripMarks(x)); // số dấu = ngoặc bị stripMarks bỏ
  const added = Math.max(0, count(out) - count(orig));
  return issues.length ? { ok: false, error: 'Gợi ý dấu chưa đúng luật: ' + issues.slice(0, 3).join('; '), issues, text: out, added } : { ok: true, text: out, added, issues: [] };
}
/** Prompt gợi ý dấu: chỉ chữ kịch bản (không gửi video) + thương hiệu, lĩnh vực, khổ. Claude trả { "text": "<chính chữ đó + dấu>" }. */
export function suggestPrompt(text, { brand = '', field = '', aspect = '', moods = [], sfx = [] } = {}) {
  return `Bạn là biên tập viên video ngắn. Dưới đây là kịch bản người dùng sẽ đọc${brand ? ` cho thương hiệu "${brand}"` : ''}${field ? `, lĩnh vực ${field}` : ''}${aspect ? `, khổ ${aspect}` : ''}.
Chèn thêm DẤU DỰNG vào kịch bản. TUYỆT ĐỐI giữ nguyên từng chữ nói, dấu câu và thứ tự; không thêm, bớt, sửa chữ nói; giữ nguyên các dấu đã có và dòng trống.
Dấu (đặt ở đầu hoặc cuối câu của đoạn mà nó thuộc về):
- [MOOD: <không khí nhạc>] mood nhạc từ đoạn đó trở đi; tối đa 1 mỗi đoạn, đổi tối đa một lần mỗi ~10 giây đọc. Mood có: ${moods.join(', ') || 'hồi hộp, vui, buồn, nhẹ nhàng, hùng tráng, sôi động'}.
- [NHẠC: tắt|bật|đổi|to|nhỏ] chỉ khi thật cần (vd tắt nhạc ở câu cao trào).
- [A-ROLL: cận mặt|trung|rộng|bỏ] cỡ khung người nói ("bỏ" = phủ hết bằng hình minh hoạ). KHÔNG ghi clip / take.
- [B-ROLL: <cảnh cần minh hoạ, tiếng Việt cụ thể>] tối đa 2 mỗi đoạn; thêm "| động" khi là số liệu / biểu đồ.
- [SFX: <tên hoặc mô tả âm> | đầu|cuối|@<từ>] tối đa 2 mỗi đoạn, chỉ ở chỗ nhấn. Tên có: ${sfx.slice(0, 40).join(', ')}.
- [CHỮ: <chữ ngắn trên màn hình> | số|danh sách|trích dẫn|tiêu đề|giá] tối đa 2 mỗi đoạn, chỉ ý đáng nhấn.
- [HOOK] đầu đoạn mở, [CTA] đầu đoạn kêu gọi cuối, nếu chưa có.
Trả về DUY NHẤT JSON: {"text": "<toàn bộ kịch bản kèm dấu>"}

KỊCH BẢN:
"""
${String(text).slice(0, 20000)}
"""`;
}

// ---------- S27 M194: AI dựng theo kịch bản (mục 2.3, 2.4): bảng nội bộ → kế hoạch, ghi chú _script trên mục đã dựng ----------
const SCREEN_STY = { so: ['yellow', 120], gia: ['yellow', 110], tieude: ['white', 96], trichdan: ['white', 60], danhsach: ['white', 64] };
const chosen = c => !!c && c.from !== 'auto';
/** Mood chốt của cả bảng (ô mark / user / claude): mood phủ nhiều giây nhất; null khi chỉ có ô luật. */
export function sheetMood(sheet) {
  const sec = new Map();
  for (const r of sheet?.rows || []) if (chosen(r.mood) && r.mood.v && r.t0 != null && r.spoken !== false) sec.set(r.mood.v, (sec.get(r.mood.v) || 0) + Math.max(.1, (r.t1 ?? r.t0) - r.t0));
  return [...sec].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
/**
 * S27 M195: bảng dựng → một nền nhạc gồm nhiều khúc nối liền (cùng dạng music_auto của auto_sfx.py; mix_audio.py phát `offset`,
 * `xfade`, `fade_in`, `fade_out`). Hàm thuần. Mood kế thừa theo hàng (hàng trước dấu MOOD đầu lấy mood chốt đầu tiên), gộp hàng kề
 * cùng mood, tối đa một lần đổi bài mỗi 10 s (ngắn hơn thì dời mốc đổi tới ranh giới đoạn kế, ghi vào `notes`), dấu NHẠC: `tat` → khoảng
 * lặng (fade 0,5 s), `bat` → nhạc lại, `doi` → khúc mới cùng mood (bài khác cùng mood nếu có, không thì `offset` khác), `to` / `nho` →
 * gain ±4 dB (−30…−10), `kho` / `kho:<tên>` → khúc có `pick` (ai_edit sheetMain tìm bài trong Kho).
 * rows: hàng của bảng; dur: thời lượng video; catalog: [{name, mood, dur}] (assets/music/catalog.json);
 * o: { gain, base, notes: [] (ghi chú dời / bỏ lần đổi), miss: {} (yêu cầu MOOD chưa làm được → lý do) }.
 * → [{t0, t1, mood, gain, offset, xfade, fade_in, fade_out, _ai: true, _sheet: <seg mở khúc>, _script: {id, kind, text, note}, pick?}]
 *   | undefined (bảng không chốt nhạc). `_script.id` = `<đoạn có dấu>:mood` (trùng yêu cầu MOOD của scriptRequests) hoặc `<đoạn>:music`.
 */
export const SHEET_GAP = 10;
export function musicFromSheet(rows, dur, catalog = [], o = {}) {
  const notes = o.notes || [], miss = o.miss || {}, base = Number.isFinite(+o.gain) ? +o.gain : DEFAULT_MUSIC_GAIN;
  const rs = (rows || []).filter(r => r && r.t0 != null && r.spoken !== false && r.t0 < dur - .05).sort((a, b) => a.t0 - b.t0);
  const ctl = r => (r.music && r.music.from !== 'auto' && r.music.v && r.music.v !== 'bed' ? r.music.v : null);
  const first = rs.find(r => chosen(r.mood) && r.mood.v)?.mood.v;
  if (!first && !rs.some(ctl)) return undefined;
  const cat = (catalog || []).map(x => ({ name: x.name || x.mood, mood: x.mood || x.name, dur: +x.dur || 60 })).filter(x => x.name);
  const names = m => cat.filter(x => x.mood === m).map(x => x.name);
  const moodOk = m => !!m && (!cat.length || names(m).length > 0);
  let mood = moodOk(first) ? first : moodOk(o.base) ? o.base : cat[0]?.mood || first || o.base || 'tech';
  const len = n => cat.find(x => x.name === n)?.dur || 60, pos = new Map(), out = [];
  const gainAt = lv => Math.max(-30, Math.min(-10, base + lv * 4));
  const isKho = c => /^kho(:|$)/.test(c || '');
  const fr = rs.find(r => r.mood?.v === first && chosen(r.mood));
  let cur = null, on = true, level = 0, pend = null, src = fr ? { seg: fr.mood.inherit ?? fr.seg, text: fr.mood.text || first } : null;
  const own = r => (chosen(r.mood) && moodOk(r.mood.v) && r.mood.inherit == null ? { seg: r.seg, text: r.mood.text || r.mood.v } : null);
  const open = (t, m, seg, how = {}) => {
    const list = names(m), name = how.name || list[0] || m, off = how.offset ?? (pos.get(name) || 0), s = how.src || src;
    const _script = how.ctl ? { id: `${seg}:music`, kind: 'NHẠC', text: musicText(how.ctl), note: `nhạc ${m}${how.ctl.startsWith('kho') ? ' (Kho)' : ''} từ ${r2(t)} s` }
      : { id: `${s ? s.seg : seg}:mood`, kind: 'MOOD', text: cut(s?.text || m, 80), note: `nhạc nền mood ${m} từ ${r2(t)} s` };
    cur = { t0: r2(t), mood: name, base: m, gain: gainAt(level), offset: r2(off % len(name)), xfade: .8, fade_in: how.fade ?? .8, _ai: true, _sheet: seg, _script, ...(how.pick ? { pick: how.pick } : {}) };
  };
  const close = (t, fade = .8, xfade = .8) => {
    if (!cur) return;
    Object.assign(cur, { t1: r2(t), fade_out: fade, xfade });
    pos.set(cur.mood, cur.offset + (cur.t1 - cur.t0));
    if (cur.t1 - cur.t0 >= .3) out.push(cur);
    cur = null;
  };
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i], t = i ? r.t0 : 0, c = ctl(r), want = chosen(r.mood) && moodOk(r.mood.v) ? r.mood.v : null, mine = own(r);
    const prevSrc = src; if (mine) src = mine;
    if (c === 'to' || c === 'nho') level = Math.max(-5, Math.min(5, level + (c === 'to' ? 1 : -1)));
    if (c === 'tat') { if (cur) close(t, .5, 0); on = false; if (want) mood = want; pend = null; continue; }
    if (!on && !c) { if (want) mood = want; continue; } // đang tắt: chờ dấu NHẠC kế (bật / đổi / kho…)
    if (!cur) { on = true; if (want) mood = want; open(t, mood, r.seg, { fade: i ? .5 : .3, ...(isKho(c) ? { pick: c, offset: 0 } : {}), ...(c && i ? { ctl: c } : {}) }); continue; }
    const target = want || pend?.m || cur.base, doi = c === 'doi' || (!!pend?.doi && target === cur.base);
    if (isKho(c)) { close(t); open(t, target, r.seg, { pick: c, offset: 0, ctl: c }); mood = target; pend = null; continue; }
    if (target !== cur.base || doi) {
      if (t - cur.t0 < SHEET_GAP - .01 || dur - t < 5) { // quá gần lần đổi trước / cuối video: dời tới ranh giới đoạn kế
        if (pend?.m !== target) notes.push(`Nhạc: đoạn ${r.seg + 1} (${r.t0.toFixed(1)} s) cách lần đổi trước dưới ${SHEET_GAP} s, dời mốc đổi nhạc tới đoạn kế`);
        pend = { m: target, doi, src: want ? src : pend?.src || src, ctl: c === 'doi' ? c : pend?.ctl, seg: pend?.seg ?? r.seg }; if (mine) src = prevSrc; continue;
      }
      if (pend && !want && c !== 'doi') notes.push(`Nhạc: đổi sang “${target}” ở ${t.toFixed(1)} s (đoạn ${r.seg + 1})`);
      const prev = cur, alt = names(target).find(n => n !== prev.mood);
      close(t);
      const how = pend ? { src: pend.src, ...(pend.ctl ? { ctl: pend.ctl } : {}) } : c === 'doi' ? { ctl: c } : {};
      if (target === prev.base) open(t, target, r.seg, { ...how, ...(alt ? { name: alt } : { name: prev.mood, offset: (pos.get(prev.mood) || 0) + len(prev.mood) * .5 }) });
      else open(t, target, r.seg, how);
      mood = target; pend = null; continue;
    }
    pend = null; // mood quay lại như khúc đang phát: bỏ lần đổi đang chờ
    if (gainAt(level) !== cur.gain) { const p = cur; close(t, .3, .3); open(t, p.base, r.seg, { name: p.mood, offset: pos.get(p.mood), fade: .3, ctl: c, ...(p.pick ? { pick: p.pick } : {}) }); }
  }
  if (pend && cur) {
    notes.push(`Nhạc: bỏ lần đổi sang “${pend.m}” ở cuối video (khúc ngắn hơn ${SHEET_GAP} s)`);
    if (pend.src && !pend.ctl && `${pend.src.seg}:mood` !== cur._script?.id) miss[`${pend.src.seg}:mood`] = `gần lần đổi nhạc trước (dưới ${SHEET_GAP} s) và không còn đoạn nào sau đó để đổi`;
  }
  close(dur, 1.5, .8);
  return out.map(({ base: _b, ...m }) => m);
}
/** Hàng mà bảng tự dựng (có CHỮ, hoặc B-ROLL đã có nguồn): AI dựng không đặt graphic chồng giờ các hàng này. → Set<seg> */
export const builtSegs = sheet => new Set((sheet?.rows || []).filter(r => r.t0 != null && r.spoken !== false
  && ((r.screen || []).some(x => String(x?.text || '').trim()) || (r.broll || []).some(b => b && (b.pick || b.src === 'ai') && !b.miss))).map(r => r.seg));
/** Khoá media của một ô B-roll ("kho:<rel>", "lib:<id>", "stock:<url>", "ai:<mô tả>"); null với b-roll động / ô trống. */
export const mediaKey = b => (!b || b.miss ? null : b.src === 'ai' ? `ai:${b.q}` : b.pick && ['kho', 'lib', 'stock'].includes(b.src) ? `${b.src}:${b.pick}` : null);
const cut = (s, n) => { s = String(s ?? '').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const base = p => String(p || '').split(/[\\/?#]/).filter(Boolean).pop() || '';
/**
 * Yêu cầu của kịch bản mà AI dựng phải làm (ô `mark` / `user` / `claude`; ô luật `auto` không tính). Mỗi yêu cầu một `id`
 * ("<đoạn>:chu|broll|sfx:<i>", "<đoạn>:mood", "<đoạn>:aroll") trùng `_script.id` của mục dựng được. → [{ id, seg, t0, kind, text }]
 */
export function scriptRequests(sheet) {
  const out = [];
  for (const r of sheet?.rows || []) {
    if (r.t0 == null || r.spoken === false) continue;
    const add = (id, kind, text) => out.push({ id: `${r.seg}:${id}`, seg: r.seg, t0: r.t0, kind, text: cut(text, 80) });
    if (chosen(r.mood) && r.mood.v && r.mood.inherit == null) add('mood', 'MOOD', r.mood.text || r.mood.v);
    if (r.aroll?.off && r.aroll.from !== 'auto') add('aroll', 'A-ROLL', 'bỏ');
    (r.screen || []).forEach((x, i) => { if (chosen(x) && String(x?.text || '').trim()) add(`chu:${i}`, 'CHỮ', x.text); });
    (r.broll || []).forEach((b, i) => { if (chosen(b)) add(`broll:${i}`, 'B-ROLL', b.q || b.pick); });
    (r.sfx || []).forEach((x, i) => { if (chosen(x)) add(`sfx:${i}`, 'SFX', x.q || x.name); });
  }
  return out;
}
/**
 * Bảng dựng → kế hoạch thô cùng dạng Claude trả cho ai_edit.mjs (đi tiếp qua validate rồi applyPlan). Hàm thuần.
 * Mỗi mục mang `_sheet` (đoạn) và `_script` { id, kind, text, note } (ghi chú kịch bản trên khối timeline / Thuộc tính).
 * o: { design: [DW, DH], media: { [mediaKey]: { seq } | { path } } (media đã đưa vào dự án), mediaErr: { [mediaKey]: lý do },
 *      dynIds: Set id b-roll động, dynCat: Map id → mục catalog b-roll động (A-ROLL bỏ: b-roll động phủ toàn khung) }
 * → { text: [cảnh chữ thô], dyn: [cảnh b-roll động thô], photos: [cảnh ảnh / clip đủ media], sfx: [{name, t, _sheet, _script}],
 *     music: [khúc] | undefined (nền nhiều khúc, musicFromSheet M195), notes: [ghi chú nhạc], dropped: [lý do], miss: { [id yêu cầu]: lý do }, clips: [] (A-roll là M196) }
 */
export function sheetToPlan(sheet, tl = {}, o = {}) {
  const vert = (tl.height || 1920) > (tl.width || 1080), [, DH] = o.design || (vert ? [720, 1280] : [1280, 720]);
  const dur = tl.duration || Infinity, media = o.media || {}, out = { text: [], dyn: [], photos: [], sfx: [], dropped: [], miss: {}, clips: [] };
  const fail = (id, what, why, at) => { out.miss[id] = why; out.dropped.push(`${at}: ${what}: ${why}`); };
  for (const r of sheet?.rows || []) {
    if (r.t0 == null || r.spoken === false) continue;
    const t0 = r.t0, t1 = Math.min(dur, Math.max(t0 + .8, r.t1 ?? t0 + 2)), len = t1 - t0, at = `kịch bản đoạn ${r.seg + 1}`;
    const tag = (id, kind, text, note, from) => ({ _sheet: r.seg, _script: { id: `${r.seg}:${id}`, kind, text: cut(text, 80), note, ...(from === 'auto' ? { auto: true } : {}) } });
    const scr = (r.screen || []).map((x, i) => ({ x, i })).filter(({ x }) => String(x?.text || '').trim());
    scr.forEach(({ x, i }, k) => {
      const [style, size] = SCREEN_STY[x.kind] || ['yellow', 84], a = t0 + k * len / scr.length;
      out.text.push({ type: 'text', t0: r2(a), dur: r2(Math.min(3.5, Math.max(1.2, len / scr.length))), ...tag(`chu:${i}`, 'CHỮ', x.text, 'chữ trên khung', x.from),
        params: { hideCaptions: false, lines: [{ text: String(x.text).trim(), t: 0, style, size, y: Math.round(DH * .3), anim: 'pop' }] } });
    });
    const ok = b => b && (b.pick || b.src === 'ai') && !b.miss, cover = !!r.aroll?.off;
    const all = (r.broll || []).map((b, i) => ({ b, i })), br = all.filter(({ b }) => ok(b));
    for (const { b, i } of all.filter(({ b }) => !ok(b))) fail(`${r.seg}:broll:${i}`, `B-ROLL “${cut(b?.q, 40)}”`, b?.miss || 'chưa có cảnh hợp', at);
    br.forEach(({ b, i }, k) => {
      const step = len / br.length, a = cover ? t0 + k * step : Math.min(t1 - .8, t0 + .15 + k * step), d = cover ? step : Math.min(2.5, Math.max(1, step - .15));
      const id = `broll:${i}`, full = cover ? ' · phủ cả khung (A-ROLL bỏ)' : '';
      if (b.src === 'dong') {
        if (o.dynIds && !o.dynIds.has(b.pick)) { fail(`${r.seg}:${id}`, `B-ROLL “${cut(b.q || b.pick, 40)}”`, `b-roll động “${b.pick}” không có trong thư viện`, at); return; }
        const e = cover && o.dynCat?.get(b.pick), t = tag(id, 'B-ROLL', b.q || b.pick, `b-roll động “${b.pick}”${full}`, b.from);
        if (e) { // A-ROLL bỏ: phủ toàn khung như b-roll tự động (auto_broll sceneFor 'full')
          const params = Object.fromEntries(Object.entries(e).filter(([k2]) => !['id', 'topic', 'tags'].includes(k2)));
          out.photos.push({ type: 'broll', ...params, t0: r2(a), t1: r2(Math.min(dur, a + d)), layout: 'full', ...(vert ? { fit: 'portrait' } : {}), _ai: true, ...t });
        } else out.dyn.push({ type: 'media_card', t0: r2(a), dur: r2(d), ...t, params: { screen: { broll: { id: b.pick } } } });
        return;
      }
      const m = media[mediaKey(b)];
      if (!m) { fail(`${r.seg}:${id}`, `B-ROLL “${cut(b.q || b.pick, 40)}”`, o.mediaErr?.[mediaKey(b)] || 'chưa đưa được cảnh vào dự án', at); return; }
      const credit = { kho: 'Kho', lib: 'Thư viện của tôi', stock: 'Stock', ai: 'Ảnh AI' }[b.src];
      const note = b.src === 'ai' ? `ảnh AI tạo theo mô tả${full}` : `${b.src === 'stock' ? 'video stock' : `cảnh ${credit}`} “${cut(base(b.pick), 40)}”${full}`;
      out.photos.push({ type: 'photo', mode: 'full', t0: r2(a), t1: r2(Math.min(dur, a + d)), media: m.seq ? { ...m.seq, t0: r2(a) } : m.path, kb: m.seq ? .04 : .12, kb_dir: k % 2 ? -1 : 1, credit, _ai: true,
        ...tag(id, 'B-ROLL', b.q || b.pick, note, b.from) });
    });
    if (cover && !br.length && r.aroll.from !== 'auto') fail(`${r.seg}:aroll`, 'A-ROLL bỏ', 'không có cảnh minh hoạ để phủ đoạn', at);
    (r.sfx || []).forEach((x, i) => {
      if (!x?.name) { fail(`${r.seg}:sfx:${i}`, `SFX “${cut(x?.q, 30)}”`, 'không có tiếng này trong thư viện SFX', at); return; }
      out.sfx.push({ name: x.name, t: r2(Math.max(0, Math.min(dur - .2, x.at ?? t0))), ...tag(`sfx:${i}`, 'SFX', x.q || x.name, `tiếng “${x.name}”`, x.from) });
    });
  }
  // S27 M195: nhạc theo đoạn: một nền nhiều khúc (musicFromSheet; undefined = kịch bản không chốt nhạc, giữ nhạc đang có)
  const end = Number.isFinite(dur) ? dur : Math.max(0, ...(sheet?.rows || []).map(r => r.t1 ?? r.t0 ?? 0));
  out.notes = [];
  const music = end > 0 ? musicFromSheet(sheet?.rows, end, o.catalog, { notes: out.notes, miss: out.miss, base: o.mood }) : undefined;
  if (music) out.music = music;
  return out;
}
/** A-ROLL bỏ đã làm khi đoạn có cảnh phủ cả khung (ảnh / b-roll động `full`). Gắn vào kế hoạch đã dựng để scriptReport đếm. */
export const coverIds = scenes => new Set(scenes.filter(s => s._sheet != null && ((s.type === 'photo' && s.mode === 'full') || (s.type === 'broll' && s.layout === 'full'))).map(s => `${s._sheet}:aroll`));
/**
 * Báo cáo "theo kịch bản" của một lần AI dựng: yêu cầu nào đã có mục (theo `_script.id` của cảnh / SFX / nhạc, A-ROLL bỏ theo cảnh
 * phủ khung), yêu cầu nào chưa và vì sao. → { total, done, req: [{ id, seg, t0, kind, text, ok, why? }] }
 */
export function scriptReport(reqs, { scenes = [], sfx = [], music = null } = {}, miss = {}) {
  const have = new Set([...scenes, ...sfx, ...[].concat(music || [])].map(x => x?._script?.id).filter(Boolean)); // M195: nhạc nhiều khúc
  for (const id of coverIds(scenes)) have.add(id);
  const why = q => miss[q.id] || (q.kind === 'MOOD' ? 'chưa đổi được nhạc ở đoạn này'
    : q.kind === 'CHỮ' ? 'chữ chưa đặt được (chồng cảnh khác hoặc quá dài)' : 'chưa dựng được');
  const req = reqs.map(q => (have.has(q.id) ? { ...q, ok: true } : { ...q, ok: false, why: why(q) }));
  return { total: req.length, done: req.filter(x => x.ok).length, req };
}
/** Bảng dựng cho prompt AI dựng (thay dấu thô): ô mark / user là ràng buộc cứng; hàng `built` (bảng tự dựng) Claude không đặt graphic chồng. */
export function sheetPrompt(sheet, built = new Set()) {
  const fx = n => (n == null ? '?' : Number(n).toFixed(1)), cut = (s, n) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));
  const hard = c => (c && (c.from === 'mark' || c.from === 'user') ? ' (chốt)' : c?.from === 'note' ? ' (theo chỉ dẫn)' : '');
  return (sheet?.rows || []).filter(r => r.t0 != null && r.spoken !== false).map(r => {
    const parts = [];
    if (r.mood?.v) parts.push(`MOOD ${r.mood.v}${hard(r.mood)}`);
    if (r.music?.v && r.music.v !== 'bed') parts.push(`NHẠC ${r.music.v}${hard(r.music)}`);
    if (r.aroll?.off) parts.push('A-ROLL bỏ: hình minh hoạ phủ hết đoạn');
    else if (r.aroll?.frame) parts.push(`A-ROLL ${r.aroll.frame}`);
    for (const s of r.screen || []) parts.push(`CHỮ "${cut(s.text, 60)}"${s.kind ? ` kiểu ${s.kind}` : ''}${hard(s)}`);
    for (const b of r.broll || []) parts.push(`B-ROLL "${cut(b.q || '', 50)}"${b.src ? ` nguồn ${b.src}` : ''}${hard(b)}`);
    for (const x of r.sfx || []) if (x.name) parts.push(`SFX ${x.name}${x.at != null ? ` @${fx(x.at)}s` : ''}${hard(x)}`);
    if (r.transition?.v) parts.push(`CHUYỂN CẢNH vào đoạn: ${r.transition.v}${hard(r.transition)}`);
    if (r.focus?.on) parts.push(`FOCUS ${r.focus.on === 'speaker' ? 'người nói' : `sản phẩm${r.focus.target ? ` "${cut(r.focus.target, 40)}"` : ''}`}${hard(r.focus)}`);
    for (const n of r.note || []) parts.push(`KỊCH BẢN YÊU CẦU (nguyên văn, làm theo khi dựng): "${cut(n, 160)}"`);
    const head = `Đ${r.seg + 1} [${fx(r.t0)}–${fx(r.t1)}] ${r.kind !== 'body' ? r.kind.toUpperCase() + ' ' : ''}"${cut(r.say, 90)}"`;
    return head + (r.lock ? ' · khoá cả hàng' : '') + (built.has(r.seg) ? ' · DỰNG SẴN' : '') + (parts.length ? '\n   · ' + parts.join('\n   · ') : '');
  }).join('\n');
}
