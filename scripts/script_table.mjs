// Kịch bản dạng bảng (Excel / CSV) và chỉ dẫn dựng chữ tự do (S27 M197, docs/plans/S27-dung-theo-kich-ban.md mục 7).
//   Bảng → chữ kịch bản có dấu (scripts/script_doc.mjs): mỗi hàng một đoạn; mốc giây → [MỐC: 0:05–0:12], lời → chữ nói,
//   chữ trên màn hình → [CHỮ: …], hình / source → [A-ROLL: …] hoặc [B-ROLL: …], nhạc → [MOOD: …], âm → [SFX: …],
//   chuyển cảnh / ghi chú → [GHI CHÚ: …]. Chữ kịch bản là bản người dùng sửa và lưu như mọi kịch bản khác.
//   Chỉ dẫn ([GHI CHÚ]) → ô bảng dựng đề xuất: luật thuần cho các mẫu câu hay gặp, phần còn lại hỏi Claude; người dùng Nhận / Bỏ,
//   ô nhận ghi vào .studio/build_sheet.json với from 'claude' (mergeSheet giữ qua các lần dựng lại). Không bao giờ sửa lời.
// Hàm thuần (trừ readTable / acceptCells đọc ghi file). Bộ đọc .xlsx / .csv dùng lại của scripts/batch.mjs, không thêm thư viện.
import { fold, fmtTimeRange, parseTimeRange } from './script_doc.mjs';
import { parseSheetBuf } from './batch.mjs';

export const ROLES = ['time', 'start', 'end', 'say', 'screen', 'visual', 'transition', 'mood', 'sfx', 'note', 'skip'];
export const ROLE_VI = { time: 'Thời gian', start: 'Giây bắt đầu', end: 'Giây kết thúc', say: 'Lời / thoại', screen: 'Chữ trên màn hình',
  visual: 'Hình / source', transition: 'Chuyển cảnh', mood: 'Nhạc / mood', sfx: 'Âm thanh / SFX', note: 'Ghi chú / chỉ dẫn', skip: 'Bỏ qua' };
const key = s => fold(s).replace(/[^a-z0-9#]+/g, ' ').trim();
// thứ tự có nghĩa: tên cụ thể trước tên chung ("thời gian bắt đầu" là start, "hiệu ứng chuyển cảnh" là transition, "chữ trên màn hình" không phải hình)
const ROLE_RX = [
  ['skip', /^(stt|#|no|so|so thu tu|tt|id|cot \d+|thu tu|ma|ma canh|canh so|scene|scene #|scene no)$/],
  ['start', /^((thoi gian|giay|time|tc|moc) )?(bat dau|start|begin|in|tu)( \(?s\)?| giay)?$|^time ?in$|^tc ?in$/],
  ['end', /^((thoi gian|giay|time|tc|moc) )?(ket thuc|end|out|den)( \(?s\)?| giay)?$|^time ?out$|^tc ?out$/],
  ['transition', /chuyen canh|transition|hieu ung chuyen/],
  ['sfx', /sfx|am thanh|hieu ung am|sound/],
  ['time', /thoi gian|thoi diem|timecode|^time|^tc$|^moc|giay|khung gio|^timeline|^doan$|^phan doan/],
  ['mood', /mood|nhac|music|khong khi|bgm/],
  ['screen', /chu tren|chu man hinh|man hinh|text|on ?screen|overlay|tieu de|title|caption|super|^chu$/],
  ['say', /loi|thoai|voice|^vo$|^vo |script|kich ban|dialog|noi dung|^mc$|dan chuyen|^doc$|narration/],
  ['visual', /hinh|source|nguon|visual|video|canh|b ?roll|a ?roll|footage|shot|anh|minh hoa|goc may|camera/],
  ['note', /ghi chu|chi dan|note|yeu cau|huong dan|direction|remark|luu y|edit|dung|y tuong|comment/],
];
/** Tên cột → vai trò (null khi không nhận ra). */
export function roleOf(name) { const k = key(name); if (!k) return null; for (const [r, rx] of ROLE_RX) if (rx.test(k)) return r; return null; }

/**
 * { columns, rows } (rows: [{cột: chữ}]) → { roles: {cột: vai trò|null}, unknown: [cột có chữ mà chưa nhận ra] }.
 * Hai cột cùng vai "time" mà một cột toàn mốc đơn: không đổi gì (người dùng gán lại nếu cần).
 */
export function guessRoles(columns, rows) {
  const roles = {}, filled = c => rows.some(r => String(r[c] ?? '').trim());
  for (const c of columns) roles[c] = roleOf(c);
  // không có cột lời: cột chưa nhận ra nào có chữ dài nhất (trung bình ≥ 12 ký tự) là lời
  if (!columns.some(c => roles[c] === 'say')) {
    const avg = c => rows.reduce((n, r) => n + String(r[c] ?? '').length, 0) / Math.max(1, rows.length);
    const cand = columns.filter(c => roles[c] == null && filled(c)).sort((a, b) => avg(b) - avg(a))[0];
    if (cand && avg(cand) >= 12) roles[cand] = 'say';
  }
  return { roles, unknown: columns.filter(c => roles[c] == null && filled(c)) };
}

const clean = v => String(v ?? '').replace(/[[\]]/g, m => (m === '[' ? '(' : ')')).replace(/\s+/g, ' ').trim(); // giá trị trong dấu: không ngoặc vuông, một dòng
const lines = v => String(v ?? '').split(/\r?\n|\s+\|\s+/).map(clean).filter(Boolean);
const FRAME_RX = [[/can mat|can canh|close ?up|\bcu\b/, 'cận mặt'], [/trung canh|medium|\bms\b/, 'trung'], [/toan canh|goc rong|canh rong|quay rong|wide|\bws\b/, 'rộng']];
const frameOf = k => FRAME_RX.find(([rx]) => rx.test(k))?.[1] || null;
const AROLL_RX = /nguoi noi|\bmc\b|a ?roll|talking|truoc (ong kinh|camera)|quay mat|host|speaker|nhan vat noi/;
const FIND_RX = /^(?:(?:can |hay )?(?:tim|kiem|search|lay|them|chen)(?: them)?((?: (?:source|nguon|canh|video|clip|hinh anh|hinh|anh|footage|b ?roll|tu lieu))+)|b ?roll|source|nguon)\s*(?:ve|cua|cho)?\s*:?\s*/;
// "tìm cảnh biển": giữ chữ "cảnh" trong từ khoá
const findQ = (t, k, m) => { const q = tail(t, k, m[0].length); return q && /canh$/.test(m[1] || '') ? 'cảnh ' + q : q; };
// cắt phần đầu của chữ gốc theo độ dài của phần đầu đã bỏ dấu (fold giữ độ dài với chữ Việt NFC)
const tail = (orig, k, head) => { const o = String(orig).normalize('NFC'); return (fold(o).length === o.length ? o.slice(head) : k.slice(head)).trim(); };
/** Một dòng của cột hình / source → dấu A-ROLL (người nói + cỡ khung) hoặc B-ROLL (tìm → nguồn stock; tên file → tệp). */
export function visualMark(text) {
  const t = clean(text), k = fold(t); if (!t) return '';
  if (AROLL_RX.test(k)) { const f = frameOf(k); return f ? `[A-ROLL: ${f}]` : `[GHI CHÚ: ${t}]`; }
  if (/\.(mp4|mov|m4v|webm|mkv|jpe?g|png|webp)$/i.test(t)) return `[B-ROLL: ${t.replace(/\.\w+$/, '')} | tệp ${t}]`;
  const m = FIND_RX.exec(k), q = m ? findQ(t, k, m) : t;
  return `[B-ROLL: ${q || t}${m && /tim|kiem|search|them|chen/.test(m[0]) ? ' | stock' : ''}]`;
}

/**
 * Bảng + vai trò từng cột → { text, segs, warn[] }. Mỗi hàng một đoạn (dòng trống tách), mốc thời gian thành [MỐC: …].
 * Hàng không có lời vẫn giữ dấu (gộp vào đoạn có lời kế bên khi phân tích). Cột 'skip' / null bỏ qua.
 */
export function tableToScript(columns, rows, roles = {}) {
  const of = r => columns.filter(c => roles[c] === r), val = (row, r) => of(r).map(c => String(row[c] ?? '').trim()).filter(Boolean);
  const warn = [], paras = []; let timed = 0;
  rows.forEach((row, i) => {
    const marks = [];
    let at = null;
    const tv = val(row, 'time')[0], sv = val(row, 'start')[0], ev = val(row, 'end')[0];
    if (tv) at = parseTimeRange(tv);
    if (sv) { const a = parseTimeRange(sv), b = ev ? parseTimeRange(ev) : null; if (a) at = { t0: a.t0, t1: b && b.t0 > a.t0 ? b.t0 : at?.t1 ?? null }; }
    if ((tv || sv) && !at) warn.push(`Hàng ${i + 2}: không đọc được mốc giây "${clean(tv || sv).slice(0, 30)}"`);
    if (at) { marks.push(`[MỐC: ${fmtTimeRange(at)}]`); timed++; }
    for (const v of val(row, 'mood')) marks.push(`[MOOD: ${clean(v)}]`);
    for (const v of val(row, 'visual')) for (const l of lines(v)) marks.push(visualMark(l));
    for (const v of val(row, 'screen')) for (const l of lines(v)) marks.push(`[CHỮ: ${l}]`);
    for (const v of val(row, 'sfx')) for (const l of lines(v)) marks.push(`[SFX: ${l}]`);
    for (const v of val(row, 'transition')) marks.push(`[GHI CHÚ: chuyển cảnh ${clean(v).replace(/^chuyển cảnh:?\s*/i, '')}]`);
    for (const v of val(row, 'note')) marks.push(`[GHI CHÚ: ${clean(v)}]`);
    const say = val(row, 'say').join('\n').replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim();
    if (!say && !marks.length) return;
    paras.push([marks.join(' '), say].filter(Boolean).join('\n'));
  });
  if (!of('say').length) warn.push('Chưa có cột lời / thoại: gán một cột là "Lời / thoại"');
  else if (!rows.some(r => val(r, 'say').length)) warn.push('Cột lời / thoại đang trống');
  // mốc đi lùi: thường do gõ nhầm hoặc cột gán nhầm
  const ts = paras.map(p => /\[MỐC: ([^\]]+)\]/.exec(p)?.[1]).filter(Boolean).map(x => parseTimeRange(x).t0);
  for (let i = 1; i < ts.length; i++) if (ts[i] < ts[i - 1]) { warn.push(`Mốc giây đi lùi ở đoạn ${i + 1} (${ts[i]} s sau ${ts[i - 1]} s)`); break; }
  return { text: paras.join('\n\n'), segs: paras.length, timed, warn };
}

/** Bytes .xlsx / .csv → { columns, rows, roles, unknown, text, segs, timed, warn }. rows cắt ở `max` hàng. */
export function readTable(buf, name = '', { max = 1000 } = {}) {
  const { columns, rows: all } = parseSheetBuf(buf, name);
  const rows = all.slice(0, max), { roles, unknown } = guessRoles(columns, rows);
  const out = tableToScript(columns, rows, roles);
  if (all.length > max) out.warn.unshift(`Bảng có ${all.length} hàng, chỉ lấy ${max} hàng đầu`);
  return { columns, rows, roles, unknown, ...out };
}

// ---------- chỉ dẫn dựng → ô bảng dựng ----------
export const CELL_TYPES = ['aroll', 'focus', 'transition', 'broll', 'graphic'];
const TRANS = [[/mo dan|fade|hoa tan|dissolve|mo/, 'fade'], [/truot|slide|lia|pan/, 'slide'], [/zoom|phong|day vao/, 'zoom'], [/whip|xoay|quet|lac/, 'whip'], [/glitch|nhieu|nhay/, 'glitch'], [/cat|cut|cung/, 'cut']];
const PRODUCT = /san pham|\bsp\b|product|hop|chai|lo |goi |mon an|mon |may |dien thoai|logo|bao bi/;
const SPEAKER = /nguoi noi|\bmc\b|speaker|khuon mat|mat nguoi|host|nhan vat|guong mat/;
const FOCUS = /focus|tap trung|nhan vao|zoom|phong (to )?(vao)?|can (canh )?vao|dua (cam|may|khung) vao|soi|lam noi/;
const EXAMPLE = /(?:them|chen|dua|cho|lay|neu)(?: vao)?(?: (?:mot|1|vai|cac))? (?:vi du|example|minh hoa|case)\s*(?:ve|cho|:)?\s*/;
const vague = s => !key(s) || /^(khi )?(gioi thieu|noi|nhac) (ve |toi |den )?(cai|cho|doan|y|phan) (nay|do|kia)$|^(cai|cho|doan) (nay|do)$/.test(key(s));
const snip = s => String(s || '').split(/\s+/).slice(0, 10).join(' ');
/**
 * Một chỉ dẫn chữ tự do (+ lời của đoạn) → { cells, rest }. cells: ô đề xuất { type, …, note, by: 'luat' }; rest: các vế không luật nào
 * hiểu (gửi Claude). Luật: chuyển cảnh (kiểu), focus sản phẩm / người nói, cỡ khung A-roll, tìm source (B-roll stock + từ khoá),
 * thêm ví dụ (graphic ví dụ).
 */
export function ruleCells(note, say = '') {
  const cells = [], rest = [];
  const parts = String(note || '').split(/[.;\n]+|,\s+|\s+(?:và|rồi|sau đó)\s+(?=(?:chuyển|focus|tập trung|tìm|thêm|chèn|cận|zoom|phóng|quay))/i).map(x => x.trim()).filter(Boolean);
  for (const p of parts) {
    const k = fold(p).replace(/\s+/g, ' ').trim(), at = cells.length;
    if (/chuyen canh|transition/.test(k)) {
      const v = TRANS.find(([rx]) => rx.test(k.replace(/chuyen canh|transition/, '')))?.[1] || 'auto';
      cells.push({ type: 'transition', v, note: p });
    } else if (FOCUS.test(k) && (PRODUCT.test(k) || SPEAKER.test(k))) {
      if (SPEAKER.test(k) && !PRODUCT.test(k)) { cells.push({ type: 'focus', on: 'speaker', note: p }); cells.push({ type: 'aroll', frame: 'can', note: p }); }
      else { const m = /\b(vao|len)\s+/.exec(k); cells.push({ type: 'focus', on: 'product', target: m ? tail(p, k, m.index + m[0].length).slice(0, 80) : '', note: p }); }
    } else if (frameOf(k) && !FIND_RX.test(k)) {
      cells.push({ type: 'aroll', frame: { 'cận mặt': 'can', trung: 'trung', 'rộng': 'rong' }[frameOf(k)], note: p });
    } else if (FIND_RX.test(k) && /tim|kiem|search|them|chen|lay/.test(k)) {
      const m = FIND_RX.exec(k), q = findQ(p, k, m);
      cells.push({ type: 'broll', q: (q || snip(say)).slice(0, 80), src: 'stock', note: p });
    } else if (EXAMPLE.test(k)) {
      const m = EXAMPLE.exec(k), q = tail(p, k, m.index + m[0].length);
      cells.push({ type: 'graphic', kind: 'vidu', text: (vague(q) ? snip(say) : q).slice(0, 80), note: p });
    }
    if (cells.length === at) rest.push(p);
  }
  return { cells: cells.map(c => ({ ...c, by: 'luat' })), rest };
}
/** Kịch bản đã lưu → ô đề xuất theo luật của mọi đoạn có [GHI CHÚ] + các vế còn lại cho Claude. */
export function directiveDraft(sc) {
  const cells = [], ask = [];
  (sc?.segments || []).forEach((s, seg) => {
    if (!s.note?.length) return;
    const r = ruleCells(s.note.join('. '), s.say);
    cells.push(...r.cells.map(c => ({ seg, ...c })));
    if (r.rest.length) ask.push({ seg, say: String(s.say).slice(0, 240), note: r.rest.join('. ').slice(0, 400) });
  });
  return { cells, ask };
}
/** Prompt Claude: chỉ lời + chỉ dẫn chưa hiểu của từng đoạn. Trả { "cells": [{ seg, type, … }] }. */
export function directivePrompt(ask, { brand = '', aspect = '' } = {}) {
  return `Bạn là dựng phim video ngắn${brand ? ` cho thương hiệu "${brand}"` : ''}${aspect ? `, khổ ${aspect}` : ''}. Mỗi đoạn dưới đây có lời người nói và chỉ dẫn dựng viết tay.
Chuyển chỉ dẫn thành ô bảng dựng. KHÔNG viết lại lời nói. Chỉ dùng các loại ô:
- {"seg": n, "type": "aroll", "frame": "can|trung|rong"}  cỡ khung người nói
- {"seg": n, "type": "focus", "on": "product|speaker", "target": "<vật cần phóng vào, ngắn>"}
- {"seg": n, "type": "transition", "v": "cut|fade|slide|zoom|whip|glitch|auto"}  chuyển cảnh vào đoạn này
- {"seg": n, "type": "broll", "q": "<từ khoá tìm cảnh minh hoạ, tiếng Việt cụ thể>", "src": "stock|kho"}
- {"seg": n, "type": "graphic", "kind": "vidu", "text": "<chữ ngắn của graphic ví dụ, ≤ 12 từ>"}
Tối đa 3 ô mỗi đoạn; chỉ dẫn không chuyển được thì bỏ qua (không bịa). Trả về DUY NHẤT JSON {"cells": [...]}.

CÁC ĐOẠN:
${JSON.stringify(ask.slice(0, 80), null, 1)}`;
}
const FRAMES = new Set(['can', 'trung', 'rong']), TRANS_V = new Set(['cut', 'fade', 'slide', 'zoom', 'whip', 'glitch', 'auto']);
const s80 = v => clean(v).slice(0, 80);
/** Chuẩn hoá một ô (của luật, Claude hay trình duyệt gửi lên) → ô hợp lệ hoặc null. `segs`: số đoạn của kịch bản. */
export function checkCell(c, segs) {
  if (!c || typeof c !== 'object' || !CELL_TYPES.includes(c.type)) return null;
  const seg = Number(c.seg); if (!Number.isInteger(seg) || seg < 0 || seg >= segs) return null;
  const by = c.by === 'luat' ? 'luat' : 'claude', note = c.note ? clean(c.note).slice(0, 300) : undefined, base = { seg, type: c.type, by, ...(note ? { note } : {}) };
  if (c.type === 'aroll') return FRAMES.has(c.frame) ? { ...base, frame: c.frame } : null;
  if (c.type === 'focus') return ['product', 'speaker'].includes(c.on) ? { ...base, on: c.on, target: s80(c.target || '') } : null;
  if (c.type === 'transition') return { ...base, v: TRANS_V.has(c.v) ? c.v : 'auto' };
  if (c.type === 'broll') return s80(c.q) ? { ...base, q: s80(c.q), src: c.src === 'kho' ? 'kho' : 'stock' } : null;
  if (c.type === 'graphic') return s80(c.text) ? { ...base, kind: 'vidu', text: s80(c.text) } : null;
  return null;
}
/** Kết quả Claude → các ô hợp lệ (tối đa 3 mỗi đoạn, chỉ đoạn có trong `ask`). Ném lỗi khi không phải { cells: [] }. */
export function checkClaudeCells(v, ask, segs) {
  if (!v || !Array.isArray(v.cells)) throw new Error('Claude không trả về {"cells": [...]}');
  const ok = new Set(ask.map(a => a.seg)), per = new Map(), out = [];
  for (const c of v.cells) {
    const x = checkCell({ ...c, by: 'claude', note: ask.find(a => a.seg === Number(c?.seg))?.note }, segs);
    if (!x || !ok.has(x.seg) || (per.get(x.seg) || 0) >= 3) continue;
    per.set(x.seg, (per.get(x.seg) || 0) + 1); out.push(x);
  }
  return out;
}

const TRANS_VI = { cut: 'cắt thẳng', fade: 'mờ dần', slide: 'trượt', zoom: 'phóng', whip: 'lia nhanh', glitch: 'nhiễu', auto: 'tự chọn' };
/** Ô → chữ ngắn cho người dùng. */
export function cellText(c) {
  if (c.type === 'aroll') return `A-roll ${{ can: 'cận mặt', trung: 'trung', rong: 'rộng' }[c.frame]}`;
  if (c.type === 'focus') return c.on === 'speaker' ? 'Focus người nói' : `Phóng vào sản phẩm${c.target ? `: ${c.target}` : ''}`;
  if (c.type === 'transition') return `Chuyển cảnh ${TRANS_VI[c.v] || c.v}`;
  if (c.type === 'broll') return `B-roll cần tìm: ${c.q}`;
  if (c.type === 'graphic') return `Graphic ví dụ: ${c.text}`;
  return c.type;
}
/**
 * Áp các ô đã Nhận vào bảng dựng (thuần: trả bảng mới + số ô thêm). Ô mang from 'claude' (+ by: luat|claude); ô trùng bỏ qua.
 * aroll → row.aroll.frame · focus → row.focus · transition → row.transition · broll → row.broll[] (chưa có nguồn: miss)
 * · graphic → row.screen[] kind 'vidu'.
 */
export function acceptCells(sheet, cells) {
  const rows = (sheet?.rows || []).map(r => ({ ...r })); let added = 0;
  for (const c of cells) {
    const row = rows.find(r => r.seg === c.seg); if (!row || row.lock) continue;
    const tag = { from: 'claude', by: c.by, ...(c.note ? { note: c.note } : {}) };
    if (c.type === 'aroll') { if (row.aroll?.frame === c.frame && row.aroll?.from === 'claude') continue; row.aroll = { ...(row.aroll || {}), frame: c.frame, ...tag }; }
    else if (c.type === 'focus') { if (row.focus?.on === c.on && row.focus?.target === c.target) continue; row.focus = { on: c.on, target: c.target, ...tag }; }
    else if (c.type === 'transition') { if (row.transition?.v === c.v) continue; row.transition = { v: c.v, ...tag }; }
    else if (c.type === 'broll') {
      if ((row.broll || []).some(b => key(b.q) === key(c.q))) continue;
      row.broll = [...(row.broll || []), { q: c.q, src: c.src, pick: null, alts: [], miss: 'Cần tìm nguồn', ...tag }];
    } else if (c.type === 'graphic') {
      if ((row.screen || []).some(x => key(x.text) === key(c.text))) continue;
      row.screen = [...(row.screen || []), { text: c.text, kind: 'vidu', ...tag }];
    } else continue;
    added++;
  }
  return { sheet: { ...(sheet || {}), rows }, added };
}
