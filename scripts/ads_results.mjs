// Kết quả quảng cáo → yếu tố thắng → lô kế tiếp (M31, M32). Spec: references/ads-results.md.
//   node scripts/ads_results.mjs import <dự án gốc> <báo cáo.csv>… [--platform meta|tiktok]   nhập CSV xuất từ Ads Manager
//   node scripts/ads_results.mjs learn  <dự án gốc> [--kpi auto|ctr|hook_rate|completion|cvr|cpa|roas] [--platform …] [--min-impr 1000]
//   node scripts/ads_results.mjs next   <dự án gốc> [--n 20] [--kpi …] [--explore 0.2]     trọng số + hook thắng cho lô kế tiếp
// Ghép dòng báo cáo về bản theo mã `<lô>-V<i>` trong ad_name / utm_content (scripts/ads_pack.mjs), trục của bản lấy từ
// manifest.json của các gói đã xuất. Lưu ở <dự án gốc>/ads_results.json (JSON, không cơ sở dữ liệu). Nhập lại cùng báo cáo
// thì ghi đè đúng dòng đó (khoá: nền tảng + quảng cáo + khoảng ngày), không cộng hai lần.
// Phép tính lift, ngưỡng thắng (n ≥ 2, lift > 10%), trọng số 0,5–2 và số hook mới chuyển từ AI Video Factory
// services/api/avf/scale.py (learnings, weights_from_learnings, next_batch), viết lại không SQLite.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTORS } from './ads_pack.mjs';
import { ANGLES, NARRATIVES, FORMATS, AUDIENCES } from './variant_matrix.mjs';
import { HOOK_REUSE_MAX } from './hooks_lib.mjs';

export const STORE = 'ads_results.json';
export const KPIS = {
  ctr: { label: 'CTR (click liên kết / hiển thị)', num: 'clicks', den: 'impressions' },
  hook_rate: { label: 'Tỷ lệ giữ 2–3 giây đầu', num: 'views_hook', den: 'impressions' },
  completion: { label: 'Xem hết (ThruPlay / 100%)', num: 'complete', den: 'impressions' },
  cvr: { label: 'Tỷ lệ chuyển đổi / click', num: 'conversions', den: 'clicks' },
  cpa: { label: 'Chi phí / chuyển đổi (thấp là tốt)', num: 'spend', den: 'conversions', lower: true },
  roas: { label: 'ROAS (doanh thu / chi tiêu)', num: 'revenue', den: 'spend' },
};
export const MATRIX_AXES = ['audience', 'angle', 'narrative', 'duration', 'format'];
export const WIN_LIFT = 0.1, MIN_N = 2, W_MIN = 0.5, W_MAX = 2;
export const MIN_IMPRESSIONS = 1000;
const METRICS = ['spend', 'impressions', 'clicks', 'conversions', 'revenue', 'views_hook', 'complete'];

// ---------- CSV ----------
/** RFC 4180, tự nhận dấu phân cách (, ; tab), bỏ BOM. → mảng object theo dòng tiêu đề. */
export function parseCsv(text) {
  text = String(text).replace(/^﻿/, '');
  const head = text.slice(0, text.search(/\r?\n/) >>> 0 || text.length);
  const delim = [',', ';', '\t'].map(d => [d, head.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const data = rows.filter(r => r.some(c => c.trim() !== ''));
  if (!data.length) return [];
  const hdr = data[0].map(h => h.trim());
  return data.slice(1).map(r => Object.fromEntries(hdr.map((h, i) => [h, (r[i] ?? '').trim()])));
}
/** "1,234.5" "1.234,5" "12%" "₫1.200.000" "-" → số hoặc null. Chỉ một dấu: dạng nhóm nghìn (1.234 / 1,234,567) là phần nghìn. */
export function num(v) {
  let s = String(v ?? '').trim().replace(/[\s %₫$€]|vnd|usd/gi, '');
  if (!s || s === '-' || s === '—') return null;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc >= 0) s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (ld >= 0 && /^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) s = s.replace(/\./g, '');
  else if (ld >= 0 && /^-?\d{1,3}\.\d{3}$/.test(s) && !/^-?0\./.test(s)) s = s.replace('.', '');   // 1.234 kiểu Việt = 1234
  const n = Number(s); return Number.isFinite(n) ? n : null;
}

// Tên cột của báo cáo xuất từ Meta Ads Manager (tiếng Anh, tiếng Việt) và TikTok Ads Manager, theo thứ tự ưu tiên.
export const COLUMNS = {
  ad_name: ['ad name', 'tên quảng cáo', 'ad_name'],
  ad_id: ['ad id', 'id quảng cáo', 'ad_id'],
  code: ['code', 'mã bản', 'utm_content', 'url tags', 'thẻ url', 'website url', 'url trang web'],
  start: ['reporting starts', 'bắt đầu báo cáo', 'date', 'ngày', 'by day', 'stat time day', 'start date'],
  end: ['reporting ends', 'kết thúc báo cáo', 'end date'],
  spend: ['amount spent', 'số tiền đã chi tiêu', 'cost', 'chi phí', 'spend', 'total cost'],
  impressions: ['impressions', 'lượt hiển thị', 'số lần hiển thị'],
  clicks: ['link clicks', 'lượt click vào liên kết', 'clicks (destination)', 'lượt nhấp (đích đến)', 'clicks', 'lượt nhấp', 'clicks (all)', 'số lượt click (tất cả)'],
  conversions: ['purchases', 'lượt mua', 'complete payment', 'thanh toán hoàn tất', 'conversions', 'chuyển đổi', 'results', 'kết quả'],
  revenue: ['purchases conversion value', 'giá trị chuyển đổi mua hàng', 'total complete payment value', 'complete payment value', 'purchase value', 'total purchase value', 'revenue', 'doanh thu'],
  views_hook: ['3-second video plays', 'lượt phát video 3 giây', '2-second video views', 'lượt xem video 2 giây'],
  complete: ['thruplays', 'lượt thruplay', 'video plays at 100%', 'lượt phát video đến 100%', 'video views at 100%', 'lượt xem video ở mức 100%'],
};
const CUR = /\s*\((vnd|usd|eur|thb|idr|php|myr|sgd|jpy|krw|cny|aud|gbp)\)\s*$/i;
const normH = h => String(h).normalize('NFC').replace(CUR, '').trim().toLowerCase();
/** Nền tảng đoán theo tên cột: TikTok có "Cost"/"Clicks (destination)"/"2-second", Meta có "Amount spent"/"Reporting starts". */
export function detectPlatform(headers) {
  const H = headers.map(normH);
  if (H.some(h => ['cost', 'clicks (destination)', '2-second video views', 'complete payment', 'stat time day'].includes(h))) return 'tiktok';
  if (H.some(h => ['amount spent', 'số tiền đã chi tiêu', 'reporting starts', 'bắt đầu báo cáo', 'thruplays', 'lượt thruplay', 'ad set name', 'tên nhóm quảng cáo'].includes(h))) return 'meta';
  return null;
}
export function columnMap(headers) {
  const byNorm = new Map(headers.map(h => [normH(h), h])), map = {};
  for (const [k, aliases] of Object.entries(COLUMNS)) { const a = aliases.find(x => byNorm.has(x)); if (a) map[k] = byNorm.get(a); }
  return map;
}
const CODE_RE = /(?:^|[^0-9a-z])([0-9a-f]{4}-v\d{2,3})(?![0-9])/i;
export function codeOf(...texts) {
  for (const t of texts) { const m = CODE_RE.exec(String(t || '')); if (m) return m[1].slice(0, 5).toLowerCase() + m[1].slice(5).toUpperCase(); }
  return null;
}
/** Dòng báo cáo → { code, ad_name, ad_id, start, end, metrics… }. Dòng tổng / không có tên → null. */
export function normalizeRow(r, map) {
  const name = map.ad_name ? r[map.ad_name] : '';
  if (/^(total|tổng|summary)\b/i.test(name || '') || /^(total|tổng)\b/i.test(Object.values(r)[0] || '')) return null;
  const code = codeOf(map.code ? r[map.code] : '', name);
  if (!name && !code) return null;
  const o = { code, ad_name: name || '', ad_id: map.ad_id ? r[map.ad_id] : '', start: map.start ? r[map.start] : '', end: map.end ? r[map.end] : '' };
  for (const k of METRICS) o[k] = map[k] ? num(r[map[k]]) : null;
  return o;
}

// ---------- kho ----------
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJ = (f, o) => { const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(o, null, 1)); fs.renameSync(t, f); };
export const storePath = base => path.join(base, STORE);
export function loadStore(base) {
  const s = readJ(storePath(base), null);
  return s && s.rows ? s : { version: 1, kind: 'ads_results', variants: {}, rows: {}, imports: [] };
}
/** Trục của từng mã bản từ mọi manifest.json trong <base>/out/ads/* (và các file thêm). */
export function loadManifests(base, extra = []) {
  const files = [...extra];
  try { for (const d of fs.readdirSync(path.join(base, 'out/ads'))) files.push(path.join(base, 'out/ads', d, 'manifest.json')); } catch { /* chưa có gói */ }
  const out = {};
  for (const f of files) { const m = readJ(f, null); if (m?.kind === 'ads_pack') for (const [code, v] of Object.entries(m.variants || {})) out[code] = { ...out[code], ...v, platform: m.platform }; }
  return out;
}

/**
 * Nhập một báo cáo. o: { platform (bỏ trống = đoán theo cột), file (tên ghi vào lịch sử), manifests (đường dẫn thêm), now }
 * → { platform, rows, matched, unknown_codes, no_code, skipped, store }
 */
export function importCsv(base, text, o = {}) {
  base = path.resolve(base);
  const data = parseCsv(text); if (!data.length) throw new Error('CSV rỗng hoặc không đọc được.');
  const headers = Object.keys(data[0]), map = columnMap(headers);
  const platform = o.platform || detectPlatform(headers);
  if (!['meta', 'tiktok'].includes(platform)) throw new Error('Không nhận ra báo cáo của Meta hay TikTok: thêm --platform meta|tiktok.');
  if (!map.ad_name && !map.code) throw new Error(`Thiếu cột tên quảng cáo (Ad name / Tên quảng cáo). Cột có: ${headers.join(', ')}`);
  if (!map.impressions) throw new Error('Thiếu cột lượt hiển thị (Impressions / Lượt hiển thị).');
  const st = loadStore(base), man = loadManifests(base, o.manifests || []), at = (o.now || new Date()).toISOString();
  const res = { platform, file: o.file || null, rows: 0, matched: 0, unknown_codes: [], no_code: [], skipped: 0, columns: map };
  for (const r of data) {
    const x = normalizeRow(r, map);
    if (!x) { res.skipped++; continue; }
    res.rows++;
    if (!x.code) { res.no_code.push(x.ad_name); continue; }
    const f = man[x.code] || st.variants[x.code];
    if (!f) { res.unknown_codes.push(x.code); continue; }
    // Trục chụp lại lúc nhập: lô sau ghi đè thư mục phiên bản cũ, kết quả vẫn phải nhớ bản đó là gì.
    st.variants[x.code] = { ...Object.fromEntries(FACTORS.concat(['hook_text', 'pack', 'dir']).map(k => [k, f[k] ?? ''])), batch: x.code.slice(0, 4) };
    const key = [platform, x.ad_id || x.ad_name, x.start, x.end].join('|');
    st.rows[key] = { ...x, platform, file: res.file, imported: at };
    res.matched++;
  }
  res.unknown_codes = [...new Set(res.unknown_codes)]; res.no_code = [...new Set(res.no_code)].slice(0, 50);
  st.base = base; st.updated = at;
  st.imports = [...st.imports, { at, file: res.file, platform, rows: res.rows, matched: res.matched, unknown_codes: res.unknown_codes.length, no_code: res.no_code.length }].slice(-50);
  if (!o.dryRun) writeJ(storePath(base), st);
  res.store = st;
  return res;
}

// ---------- lift (scale.learnings) ----------
const sum = (a, k) => a.reduce((s, r) => s + (Number.isFinite(r[k]) ? r[k] : 0), 0);
const r4 = v => Math.round(v * 1e4) / 1e4;
/** Tổng chỉ số của từng mã bản (lọc theo nền tảng nếu có). */
export function perVariant(st, { platform } = {}) {
  const by = {};
  for (const r of Object.values(st.rows)) {
    if (platform && r.platform !== platform) continue;
    (by[r.code] ||= []).push(r);
  }
  return Object.fromEntries(Object.entries(by).map(([code, rs]) => [code, { code, rows: rs.length, platforms: [...new Set(rs.map(r => r.platform))], ...Object.fromEntries(METRICS.map(k => [k, sum(rs, k)])) }]));
}
/** KPI tự chọn: có doanh thu → roas; ≥ 5 chuyển đổi → cpa; không thì ctr. */
export function autoKpi(vs) {
  const all = Object.values(vs);
  if (sum(all, 'revenue') > 0) return 'roas';
  if (sum(all, 'conversions') >= 5) return 'cpa';
  return 'ctr';
}
/** Điểm "cao là tốt" của một bản cho KPI; không tính được → null. */
export function score(v, kpi) {
  const K = KPIS[kpi];
  if (K.lower) return v.spend > 0 ? v.conversions / v.spend : null;   // cpa: so bằng chuyển đổi / tiền (nghịch đảo)
  return v[K.den] > 0 ? v[K.num] / v[K.den] : null;
}
export function label(d, val, f = {}) {
  if (d === 'angle') return ANGLES[val]?.label || val;
  if (d === 'audience') return AUDIENCES[val] || val;
  if (d === 'narrative') return NARRATIVES[val] || val;
  if (d === 'format') return FORMATS[val]?.label || val;
  if (d === 'duration') return val === '0' ? 'giữ độ dài gốc' : `${val}s`;
  if (d === 'hook') return f.hook_text || val;
  return val;
}
/**
 * → { kpi, kpi_label, variants_with_data, low_data, mean, dimensions: {trục: [{value,label,n,mean,lift}]}, winners, note }
 * Bản dưới o.minImpressions lượt hiển thị không được tính. Lift = trung bình KPI của nhóm / trung bình mọi bản − 1.
 */
export function learnings(st, o = {}) {
  const vs = perVariant(st, o), minImpr = o.minImpressions ?? MIN_IMPRESSIONS;
  const kpi = !o.kpi || o.kpi === 'auto' ? autoKpi(vs) : o.kpi;
  if (!KPIS[kpi]) throw new Error(`KPI không hợp lệ, chọn một trong auto, ${Object.keys(KPIS).join(', ')}`);
  const low = [], data = [];
  for (const v of Object.values(vs)) {
    const s = v.impressions >= minImpr ? score(v, kpi) : null;
    if (s == null) { low.push({ code: v.code, impressions: v.impressions }); continue; }
    data.push({ ...v, score: s, factors: st.variants[v.code] || {} });
  }
  const res = { kpi, kpi_label: KPIS[kpi].label, lower_is_better: !!KPIS[kpi].lower, platform: o.platform || 'all', min_impressions: minImpr,
    variants_with_data: data.length, low_data: low, mean: null, dimensions: {}, winners: [], variants: [],
    note: 'Tương quan không phải nhân quả. Giá trị có n < 2 bản không được tính là thắng. Số liệu do bạn nhập từ Ads Manager.' };
  if (!data.length) { res.note = `Chưa có bản nào đủ ${minImpr} lượt hiển thị với KPI ${kpi}. ` + res.note; return res; }
  const mean = data.reduce((a, v) => a + v.score, 0) / data.length;
  res.mean = r4(mean);
  const shown = s => (KPIS[kpi].lower ? (s > 0 ? Math.round(1 / s) : null) : r4(s));   // cpa hiển thị lại là tiền / chuyển đổi
  res.variants = data.map(v => ({ code: v.code, kpi: shown(v.score), score: r4(v.score), impressions: v.impressions, spend: v.spend, platforms: v.platforms }))
    .sort((a, b) => b.score - a.score);
  for (const d of FACTORS) {
    const g = {};
    for (const v of data) { const val = String(v.factors[d] ?? ''); if (val) (g[val] ||= []).push(v); }
    const items = Object.entries(g).map(([val, xs]) => {
      const m = xs.reduce((a, v) => a + v.score, 0) / xs.length;
      return { value: val, label: label(d, val, xs[0].factors), n: xs.length, mean: r4(m), kpi: shown(m), lift: mean ? Math.round((m / mean - 1) * 1000) / 1000 : 0, codes: xs.map(v => v.code) };
    }).sort((a, b) => b.mean - a.mean);
    if (items.length) res.dimensions[d] = items;
    res.winners.push(...items.filter(it => it.n >= MIN_N && it.lift > WIN_LIFT).map(it => ({ dimension: d, ...it })));
  }
  res.winners.sort((a, b) => b.lift - a.lift);
  return res;
}

// ---------- lô kế tiếp (scale.weights_from_learnings, next_batch) ----------
/** Trọng số 0,5–2 = 1 + lift cho từng giá trị trục của ma trận có n ≥ 2. */
export function weightsFromLearnings(learn) {
  const w = {};
  for (const d of MATRIX_AXES) {
    const items = (learn.dimensions[d] || []).filter(it => it.n >= MIN_N);
    if (items.length) w[d] = Object.fromEntries(items.map(it => [it.value, Math.round(Math.max(W_MIN, Math.min(W_MAX, 1 + it.lift)) * 100) / 100]));
  }
  return w;
}
/** Vị trí i (0…target−1) có dành cho hook mới không: rải đều ~target × explore vị trí. */
export const freshSlot = (i, explore) => explore > 0 && Math.floor((i + 1) * explore + 1e-9) > Math.floor(i * explore + 1e-9);
/**
 * Kế hoạch lô kế tiếp. o: { target, kpi, explore (0–1, mặc định 0,2), platform, minImpressions }
 * → { kpi, weights, preferred_hooks, explore, fresh_slots, new_hooks, learn, has_data }
 */
export function nextBatchPlan(base, o = {}) {
  const st = loadStore(path.resolve(base)), learn = learnings(st, o), target = Math.max(1, Math.round(+o.target || 10));
  const explore = Math.max(0, Math.min(1, o.explore ?? 0.2));
  const preferred = learn.winners.filter(w => w.dimension === 'hook').map(w => w.value);
  const slots = Array.from({ length: target }, (_, i) => i).filter(i => freshSlot(i, explore)).length;
  return { kpi: learn.kpi, has_data: learn.variants_with_data > 0, weights: weightsFromLearnings(learn), preferred_hooks: preferred, explore,
    fresh_slots: slots, new_hooks: explore > 0 ? Math.max(2, Math.ceil(target * explore / HOOK_REUSE_MAX)) : 0, learn };
}

// ---------- vòng phản hồi (scripts/feedback.mjs) ----------
/** Có yếu tố thắng → đề xuất "Lô kế tiếp có trọng số" trong ~/.ai-video-studio/suggestions.json. */
export async function suggestNextBatch(base, learn, { n = 10 } = {}) {
  if (!learn.winners.length) return null;
  const { addSuggestion } = await import('./feedback.mjs');
  const top = learn.winners.slice(0, 3).map(w => `${w.dimension} "${w.label}" +${Math.round(w.lift * 100)}%`).join(', ');
  return addSuggestion({ kind: 'ads', key: `ads-next-${path.resolve(base)}`, title: `Lô kế tiếp có trọng số cho ${path.basename(base)}`.slice(0, 60),
    detail: `Theo ${learn.kpi_label} của ${learn.variants_with_data} bản: ${top}. Tạo ${n} bản mới ưu tiên yếu tố thắng, ~20% hook mới.`,
    action: { type: 'next_batch', project: path.resolve(base), n, kpi: learn.kpi, explore: 0.2 } });
}

export function learnText(l) {
  if (!l.variants_with_data) return l.note;
  const pct = v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
  const L = [`KPI ${l.kpi_label} · ${l.variants_with_data} bản có số liệu (nền tảng ${l.platform})${l.low_data.length ? ` · ${l.low_data.length} bản dưới ${l.min_impressions} lượt hiển thị bị bỏ` : ''}`];
  for (const [d, items] of Object.entries(l.dimensions)) L.push(`${d}: ${items.map(it => `${it.label} ${pct(it.lift)} (n=${it.n})`).join(' · ')}`);
  L.push(l.winners.length ? `Thắng: ${l.winners.map(w => `${w.dimension}=${w.label} ${pct(w.lift)}`).join(', ')}` : 'Chưa có yếu tố thắng (cần n ≥ 2 và lift > 10%).', l.note);
  return L.join('\n');
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  const [cmd, base, ...a] = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const VAL = ['--platform', '--kpi', '--min-impr', '--n', '--explore', '--manifest'];
  const files = a.filter((x, i) => !x.startsWith('--') && !(i > 0 && VAL.includes(a[i - 1])));
  const common = { kpi: opt('--kpi'), platform: opt('--platform'), minImpressions: opt('--min-impr') != null ? +opt('--min-impr') : undefined };
  try {
    if (cmd === 'import' && base && files.length) {
      for (const f of files) {
        const r = importCsv(base, fs.readFileSync(f, 'utf8'), { platform: opt('--platform'), file: path.basename(f), manifests: opt('--manifest') ? [opt('--manifest')] : [] });
        console.log(`${path.basename(f)} (${r.platform}): ${r.matched}/${r.rows} dòng ghép được${r.unknown_codes.length ? ` · mã không có trong gói: ${r.unknown_codes.join(', ')}` : ''}${r.no_code.length ? ` · ${r.no_code.length} quảng cáo không có mã bản` : ''}`);
      }
      const l = learnings(loadStore(path.resolve(base)), common);
      console.log(learnText(l));
      const s = await suggestNextBatch(base, l, { n: +opt('--n', 10) }).catch(e => console.error('[đề xuất] ' + e.message));
      if (s) console.log('Đã thêm đề xuất "Lô kế tiếp có trọng số" (node scripts/feedback.mjs suggestions).');
    } else if (cmd === 'learn' && base) console.log(a.includes('--json') ? JSON.stringify(learnings(loadStore(path.resolve(base)), common), null, 1) : learnText(learnings(loadStore(path.resolve(base)), common)));
    else if (cmd === 'next' && base) { const p = nextBatchPlan(base, { ...common, target: +opt('--n', 10), explore: opt('--explore') != null ? +opt('--explore') : undefined }); delete p.learn; console.log(JSON.stringify(p, null, 1)); }
    else { console.error('usage: node scripts/ads_results.mjs import <dự án> <báo cáo.csv>… [--platform meta|tiktok] | learn <dự án> [--kpi …] [--json] | next <dự án> [--n 20] [--explore 0.2]'); process.exit(2); }
  } catch (e) { console.error(e.message); process.exit(1); }
}
