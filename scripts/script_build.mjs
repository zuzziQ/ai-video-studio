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
import { fold, norm, parseScript, stripMarks, readScript } from './script_doc.mjs';
import { rmSync } from './fs_rm.mjs';

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
  return { q, src: first.src, pick: first.id, alts };
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
    const s = segs[k], t0 = s.t0 ?? null, t1 = s.t1 ?? null;
    const row = { seg: k, t0, t1, kind: s.kind, say: s.say, ...(s.spoken === false ? { spoken: false } : {}) };
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
    row.lock = false;
    rows.push(row);
  }
  return { version: SHEET_VERSION, script_updated: sc?.updated || null, at: new Date().toISOString(), rows: mergeSheet(rows, o.prev) };
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
    for (const f of ['mood', 'music', 'aroll']) if (p[f]?.from === 'user') out[f] = p[f];
    for (const f of ['broll', 'sfx', 'screen']) {
      const mine = (p[f] || []).filter(x => x?.from === 'user'); if (!mine.length) continue;
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

// ---------- S27 M194: sửa ô, áp bảng lên timeline (mục 2.3, 2.4) ----------
export const CELL_ONE = ['mood', 'music', 'aroll'], CELL_LIST = ['broll', 'sfx', 'screen'];
const SCREEN_STY = { so: ['yellow', 120], gia: ['yellow', 110], tieude: ['white', 96], trichdan: ['white', 60], danhsach: ['white', 64] };
/**
 * Sửa một ô của bảng (panel Bảng dựng): ô sửa tay thành nguồn `user` (lần dựng lại giữ). Hàm thuần, sửa `sheet` tại chỗ.
 * field mood|music|aroll: value = object ô ({v} / {frame, take, off}); null = về luật (`auto`, giá trị rỗng).
 * field broll|sfx|screen: i = chỉ số mục (bỏ trống = thêm mục mới), value null = bỏ mục đó. field lock: value true/false.
 * → hàng đã sửa, hoặc { error }
 */
export function editCell(sheet, seg, field, value, i = null) {
  const row = (sheet?.rows || []).find(r => r.seg === seg);
  if (!row) return { error: 'Không có hàng này trong bảng dựng' };
  if (field === 'lock') { row.lock = !!value; return row; }
  if (row.lock) return { error: 'Hàng đang khoá: mở khoá rồi sửa' };
  const clean = v => Object.fromEntries(Object.entries(v || {}).filter(([k, x]) => !['from', 'inherit'].includes(k) && x !== undefined));
  if (CELL_ONE.includes(field)) {
    if (value == null) row[field] = field === 'aroll' ? { frame: null, take: null, from: 'auto' } : { v: field === 'music' ? 'bed' : null, from: 'auto' };
    else if (typeof value !== 'object') return { error: 'Giá trị ô không hợp lệ' };
    else row[field] = { ...clean(value), from: 'user' };
    return row;
  }
  if (!CELL_LIST.includes(field)) return { error: 'Cột lạ' };
  const list = Array.isArray(row[field]) ? row[field] : (row[field] = []);
  if (i != null && !(Number.isInteger(i) && i >= 0 && i < list.length)) return { error: 'Mục không có' };
  if (value == null) { if (i != null) list.splice(i, 1); return row; }
  if (typeof value !== 'object') return { error: 'Giá trị ô không hợp lệ' };
  const v = clean(value);
  if (i == null) { if (list.length >= 4) return { error: 'Tối đa 4 mục mỗi ô' }; list.push({ ...v, from: 'user' }); }
  else list[i] = { ...v, from: 'user' }; // thay hẳn: trường của nguồn cũ (miss, pending, alts…) không sót lại
  return row;
}
const chosen = c => !!c && c.from !== 'auto';
/** Mood chốt của cả bảng (ô mark / user / claude): mood phủ nhiều giây nhất; null khi chỉ có ô luật. */
export function sheetMood(sheet) {
  const sec = new Map();
  for (const r of sheet?.rows || []) if (chosen(r.mood) && r.mood.v && r.t0 != null && r.spoken !== false) sec.set(r.mood.v, (sec.get(r.mood.v) || 0) + Math.max(.1, (r.t1 ?? r.t0) - r.t0));
  return [...sec].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
/** Hàng nào đã có mục trên timeline (cảnh / SFX mang `_sheet`). → Set<seg> */
export const appliedSegs = tl => new Set([...(tl?.scenes || []), ...(tl?.audio?.sfx || [])].filter(x => Number.isInteger(x?._sheet)).map(x => x._sheet));
/** Khoá media của một ô B-roll ("kho:<rel>", "lib:<id>", "stock:<url>", "ai:<mô tả>"); null với b-roll động / ô trống. */
export const mediaKey = b => (!b || b.miss ? null : b.src === 'ai' ? `ai:${b.q}` : b.pick && ['kho', 'lib', 'stock'].includes(b.src) ? `${b.src}:${b.pick}` : null);
/**
 * Bảng dựng → kế hoạch thô cùng dạng Claude trả cho ai_edit.mjs (đi tiếp qua validate rồi applyPlan, như AI dựng). Hàm thuần.
 * o: { design: [DW, DH], media: { [mediaKey]: { seq } | { path } } (media đã đưa vào dự án lúc Áp), dynIds: Set id b-roll động,
 *      dynCat: Map id → mục catalog b-roll động (A-ROLL bỏ: b-roll động phủ toàn khung) }
 * → { text: [cảnh chữ thô], dyn: [cảnh b-roll động thô], photos: [cảnh ảnh / clip đủ media], sfx: [{name, t, _sheet}],
 *     music: {mood, gain} | undefined, dropped: [lý do], clips: [] (A-roll theo kịch bản là M196) }
 */
export function sheetToPlan(sheet, tl = {}, o = {}) {
  const vert = (tl.height || 1920) > (tl.width || 1080), [, DH] = o.design || (vert ? [720, 1280] : [1280, 720]);
  const dur = tl.duration || Infinity, media = o.media || {}, out = { text: [], dyn: [], photos: [], sfx: [], dropped: [], clips: [] };
  for (const r of sheet?.rows || []) {
    if (r.t0 == null || r.spoken === false) continue;
    const t0 = r.t0, t1 = Math.min(dur, Math.max(t0 + .8, r.t1 ?? t0 + 2)), len = t1 - t0, tag = { _sheet: r.seg }, at = `bảng dựng đoạn ${r.seg + 1}`;
    const scr = (r.screen || []).filter(x => String(x?.text || '').trim());
    scr.forEach((x, i) => {
      const [style, size] = SCREEN_STY[x.kind] || ['yellow', 84], a = t0 + i * len / scr.length;
      out.text.push({ type: 'text', t0: r2(a), dur: r2(Math.min(3.5, Math.max(1.2, len / scr.length))), ...tag,
        params: { hideCaptions: false, lines: [{ text: String(x.text).trim(), t: 0, style, size, y: Math.round(DH * .3), anim: 'pop' }] } });
    });
    const ok = b => b && (b.pick || b.src === 'ai') && !b.miss, br = (r.broll || []).filter(ok), cover = !!r.aroll?.off;
    for (const b of (r.broll || []).filter(b => !ok(b))) out.dropped.push(`${at}: B-ROLL “${String(b?.q || '').slice(0, 40)}” chưa có cảnh (${b?.miss || 'ô trống'})`);
    br.forEach((b, i) => {
      const step = len / br.length, a = cover ? t0 + i * step : Math.min(t1 - .8, t0 + .15 + i * step), d = cover ? step : Math.min(2.5, Math.max(1, step - .15));
      if (b.src === 'dong') {
        if (o.dynIds && !o.dynIds.has(b.pick)) { out.dropped.push(`${at}: b-roll động “${b.pick}” không có trong thư viện`); return; }
        const e = cover && o.dynCat?.get(b.pick);
        if (e) { // A-ROLL bỏ: phủ toàn khung như b-roll tự động (auto_broll sceneFor 'full')
          const params = Object.fromEntries(Object.entries(e).filter(([k]) => !['id', 'topic', 'tags'].includes(k)));
          out.photos.push({ type: 'broll', ...params, t0: r2(a), t1: r2(Math.min(dur, a + d)), layout: 'full', ...(vert ? { fit: 'portrait' } : {}), _ai: true, ...tag });
        } else out.dyn.push({ type: 'media_card', t0: r2(a), dur: r2(d), ...tag, params: { screen: { broll: { id: b.pick } } } });
        return;
      }
      const m = media[mediaKey(b)];
      if (!m) { out.dropped.push(`${at}: B-ROLL “${String(b.q || b.pick).slice(0, 40)}” chưa đưa được vào dự án`); return; }
      const credit = { kho: 'Kho', lib: 'Thư viện của tôi', stock: 'Stock', ai: 'Ảnh AI' }[b.src];
      out.photos.push({ type: 'photo', mode: 'full', t0: r2(a), t1: r2(Math.min(dur, a + d)), media: m.seq ? { ...m.seq, t0: r2(a) } : m.path, kb: m.seq ? .04 : .12, kb_dir: i % 2 ? -1 : 1, credit, _ai: true, ...tag });
    });
    for (const x of r.sfx || []) {
      if (!x?.name) { out.dropped.push(`${at}: SFX “${String(x?.q || '').slice(0, 30)}” không có trong thư viện`); continue; }
      out.sfx.push({ name: x.name, t: r2(Math.max(0, Math.min(dur - .2, x.at ?? t0))), ...tag });
    }
  }
  const mood = sheetMood(sheet);
  if (mood) out.music = { mood, gain: -20 };
  return out;
}
/** Bảng dựng cho prompt AI dựng (thay dấu thô): ô mark / user là ràng buộc cứng; hàng đã áp (`applied`) Claude không đặt graphic chồng. */
export function sheetPrompt(sheet, applied = new Set()) {
  const fx = n => (n == null ? '?' : Number(n).toFixed(1)), cut = (s, n) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));
  const hard = c => (c && (c.from === 'mark' || c.from === 'user') ? ' (chốt)' : '');
  return (sheet?.rows || []).filter(r => r.t0 != null && r.spoken !== false).map(r => {
    const parts = [];
    if (r.mood?.v) parts.push(`MOOD ${r.mood.v}${hard(r.mood)}`);
    if (r.music?.v && r.music.v !== 'bed') parts.push(`NHẠC ${r.music.v}${hard(r.music)}`);
    if (r.aroll?.off) parts.push('A-ROLL bỏ: hình minh hoạ phủ hết đoạn');
    else if (r.aroll?.frame) parts.push(`A-ROLL ${r.aroll.frame}`);
    for (const s of r.screen || []) parts.push(`CHỮ "${cut(s.text, 60)}"${s.kind ? ` kiểu ${s.kind}` : ''}${hard(s)}`);
    for (const b of r.broll || []) parts.push(`B-ROLL "${cut(b.q || '', 50)}"${b.src ? ` nguồn ${b.src}` : ''}${hard(b)}`);
    for (const x of r.sfx || []) if (x.name) parts.push(`SFX ${x.name}${x.at != null ? ` @${fx(x.at)}s` : ''}${hard(x)}`);
    const head = `Đ${r.seg + 1} [${fx(r.t0)}–${fx(r.t1)}] ${r.kind !== 'body' ? r.kind.toUpperCase() + ' ' : ''}"${cut(r.say, 90)}"`;
    return head + (r.lock ? ' · khoá cả hàng' : '') + (applied.has(r.seg) ? ' · ĐÃ TRÊN TIMELINE' : '') + (parts.length ? '\n   · ' + parts.join('\n   · ') : '');
  }).join('\n');
}

const MUSIC_V = new Set(['bed', 'tat', 'bat', 'doi', 'to', 'nho']), FRAME_V = new Set(['can', 'trung', 'rong']);
const SRC_V = new Set(['kho', 'lib', 'stock', 'ai', 'dong']), KIND_V = new Set(['so', 'gia', 'tieude', 'trichdan', 'danhsach']);
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
/**
 * Làm sạch giá trị một ô người dùng gửi lên (route 23_buildsheet) trước editCell. o: { moods: Set, sfx: Set tên SFX,
 * kho: Set rel trong Kho, lib: Set id thư viện, dyn: Set id b-roll động }. → value sạch | null (xoá / về luật) | { error }
 */
export function cleanCell(field, v, o = {}) {
  if (v == null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return { error: 'Giá trị ô không hợp lệ' };
  const bad = m => ({ error: m });
  if (field === 'mood') { const m = str(v.v, 40); if (!m) return null; return o.moods && !o.moods.has(m) ? bad('Mood không có trong thư viện nhạc') : { v: m }; }
  if (field === 'music') { const m = str(v.v, 130); if (!MUSIC_V.has(m) && !/^kho(:.+)?$/.test(m)) return bad('Giá trị nhạc lạ'); return { v: m }; }
  if (field === 'aroll') {
    const frame = v.frame == null || v.frame === '' ? null : str(v.frame, 8);
    if (frame && !FRAME_V.has(frame)) return bad('Cỡ khung lạ');
    const take = v.take == null || v.take === '' ? null : Number.isInteger(+v.take) && +v.take > 0 && +v.take < 100 ? +v.take : NaN;
    if (Number.isNaN(take)) return bad('Take phải là số 1–99');
    return { frame, take, ...(v.off ? { off: true } : {}) };
  }
  if (field === 'screen') { const text = str(v.text, 120); if (!text) return bad('Chữ trống'); const kind = v.kind ? str(v.kind, 12) : null; if (kind && !KIND_V.has(kind)) return bad('Kiểu chữ lạ'); return { text, kind }; }
  if (field === 'sfx') {
    const name = str(v.name, 60); if (!name) return bad('Chưa chọn SFX');
    if (o.sfx && !o.sfx.has(name)) return bad('SFX không có trong thư viện');
    const at = v.at == null || v.at === '' ? null : Number(v.at);
    if (at != null && !(Number.isFinite(at) && at >= 0)) return bad('Thời điểm SFX lạ');
    return { name, q: str(v.q || name, 60), at: at == null ? null : r2(at), pos: str(v.pos || 'dau', 40) };
  }
  if (field === 'broll') {
    const q = str(v.q, 120), src = str(v.src, 8), pick = v.pick == null ? null : str(v.pick, 600);
    if (!SRC_V.has(src)) return bad('Nguồn B-roll lạ');
    if (src === 'ai') { if (!q) return bad('Ảnh AI cần mô tả'); return { q, src, pick: null, alts: [], pending: 'Ảnh AI tạo lúc Áp' }; }
    if (!pick) return bad('Chưa chọn cảnh');
    const set = { kho: o.kho, lib: o.lib, dong: o.dyn }[src];
    if (set && !set.has(pick)) return bad(src === 'kho' ? 'File không có trong Kho' : src === 'lib' ? 'Không có trong thư viện' : 'Không có b-roll động này');
    if (src === 'stock' && !/^https:\/\/\S+$/i.test(pick)) return bad('Link stock phải là https');
    const alts = Array.isArray(v.alts) ? v.alts.filter(x => typeof x === 'string').slice(0, 4).map(x => x.slice(0, 600)) : undefined;
    return { q: q || pick.split(/[\\/]/).pop(), src, pick, ...(alts ? { alts } : {}) };
  }
  return bad('Cột lạ');
}
/** "Dựng lại ô trống": prompt một lần cho cả bảng (không mỗi hàng một lần). Claude trả {rows:[{seg, mood, sfx:[tên], broll:[mô tả]}]}. */
export function fillPrompt(sheet, { moods = [], sfx = [], brand = '' } = {}) {
  const rows = (sheet?.rows || []).filter(r => !r.lock && r.t0 != null && r.spoken !== false);
  const need = r => [r.mood?.from === 'auto' ? 'mood' : '', !(r.sfx || []).length ? 'sfx' : '', !(r.broll || []).length && r.kind === 'body' ? 'broll' : ''].filter(Boolean);
  const list = rows.filter(r => need(r).length).map(r => `Đ${r.seg} [${((r.t1 ?? r.t0) - r.t0).toFixed(1)}s] cần: ${need(r).join(', ')} · "${String(r.say).slice(0, 160)}"`);
  return { n: list.length, prompt: `Bạn là editor video ngắn${brand ? ` cho thương hiệu "${brand}"` : ''}. Lấp các ô còn trống của bảng dựng theo đoạn bên dưới.
- mood: một mood trong danh sách: ${moods.join(', ')}. Cả video nên dùng 1–2 mood, đổi tối đa một lần mỗi ~10 giây.
- sfx: 0–1 tên SFX trong danh sách, chỉ ở chỗ thật cần nhấn: ${sfx.slice(0, 60).join(', ')}.
- broll: 0–1 mô tả cảnh minh hoạ ngắn, cụ thể bằng tiếng Việt (vd "căn hộ chung cư ban đêm"); đoạn nói về con người / cảm xúc thì để trống.
Chỉ trả ô được hỏi. Trả về DUY NHẤT JSON: {"rows":[{"seg":0,"mood":"…","sfx":["…"],"broll":["…"]}]}

CÁC ĐOẠN:
${list.join('\n')}` };
}
/** Áp kết quả "Dựng lại ô trống" vào ô `auto` / trống (ô mark / user / hàng khoá không đổi). Ô Claude lấp ghi `from: claude`.
 *  pick(q) → Promise<ô B-roll của pickBroll>. → số ô đã lấp */
export async function applyFill(sheet, out, { moods = [], sfx = [], pick } = {}) {
  let n = 0;
  for (const x of Array.isArray(out?.rows) ? out.rows : []) {
    const r = (sheet.rows || []).find(y => y.seg === +x.seg); if (!r || r.lock || r.t0 == null) continue;
    const m = moodOf(x.mood || '', moods); if (m && r.mood?.from === 'auto') { r.mood = { v: m, from: 'claude' }; n++; }
    if (!(r.sfx || []).length) for (const name of (Array.isArray(x.sfx) ? x.sfx : []).slice(0, 1)) { const s2 = sfxOf(name, sfx); if (s2) { r.sfx = [{ name: s2, q: str(name, 60), at: r.t0, pos: 'dau', from: 'claude' }]; n++; } }
    if (!(r.broll || []).length && r.kind === 'body' && pick) for (const q of (Array.isArray(x.broll) ? x.broll : []).slice(0, 1).map(v => str(v, 120)).filter(Boolean)) { r.broll = [{ ...(await pick(q)), from: 'claude' }]; n++; }
  }
  return n;
}
