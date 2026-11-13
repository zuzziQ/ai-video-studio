// Gói Ads Manager (M30): gom video đã xuất của một lô phiên bản thành thư mục để tải lên Meta / TikTok Ads Manager bằng tay.
// Không đăng, không gọi API quảng cáo. Spec: references/ads-pack.md.
//   node scripts/ads_pack.mjs <dự án gốc | phiên bản> [--platform meta,tiktok] [--campaign tên] [--landing https://…]
//        [--cta LEARN_MORE] [--out thư-mục] [--dry-run]
// Mỗi nền tảng một thư mục <dự án gốc>/out/ads/<nền tảng>_<YYYYMMDD-HHMM>/ gồm:
//   <ad_name>.mp4        tên theo quy ước <chiến dịch>_<nền tảng>_<mã bản>_<khổ>_<giây>s
//   ads_mapping.csv      ad_name, file, code, primary_text, headline, cta, landing_url (UTM theo mã bản), trục của bản, cảnh báo
//   manifest.json        mã bản → trục (hook, góc, khán giả, kết cấu, bố cục, thời lượng, giọng, nhạc): M31 dùng để ghép kết quả
//   README.txt           cách tải lên, bản bị loại và lý do
// Bản bị loại: QC quảng cáo đang chặn xuất (scripts/export_gate.mjs), chưa có video, sai spec bắt buộc của nền tảng.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readGate, gateText } from './export_gate.mjs';

// Spec theo tài liệu công bố của Meta và TikTok đến 2025: kiểm lại trên Ads Manager trước khi chạy tiền lớn.
// hard: sai là nền tảng từ chối file (bản bị loại khỏi gói). soft: khuyến nghị (giữ bản, ghi cảnh báo).
export const PRESETS = {
  meta: {
    name: 'Meta Ads Manager (Facebook, Instagram)', utm_source: 'facebook', url: 'https://adsmanager.facebook.com/',
    aspects: ['9:16', '4:5', '1:1', '16:9'],
    hard: { min_s: 1, max_s: 241 * 60, max_mb: 4096, min_w: 120 },
    soft: { max_s: 90, min_short: 1080, primary_max: 125, headline_max: 40 },
    ctas: ['LEARN_MORE', 'SHOP_NOW', 'ORDER_NOW', 'SIGN_UP', 'CONTACT_US', 'SEND_MESSAGE', 'BOOK_NOW', 'GET_OFFER', 'SUBSCRIBE', 'DOWNLOAD', 'APPLY_NOW', 'GET_QUOTE'],
    cta_default: 'LEARN_MORE',
  },
  tiktok: {
    name: 'TikTok Ads Manager', utm_source: 'tiktok', url: 'https://ads.tiktok.com/',
    aspects: ['9:16', '1:1', '16:9'],
    hard: { min_s: 5, max_s: 600, max_mb: 500, min_w: 360, text_max: 100 },
    soft: { max_s: 60, min_short: 720, primary_max: 100, headline_max: 0, aspect: '9:16' },
    ctas: ['LEARN_MORE', 'SHOP_NOW', 'ORDER_NOW', 'SIGN_UP', 'CONTACT_US', 'BOOK_NOW', 'DOWNLOAD', 'APPLY_NOW', 'GET_QUOTE', 'SUBSCRIBE', 'VIEW_NOW'],
    cta_default: 'LEARN_MORE',
  },
};
// Tên nền tảng của gói đăng (publish/publish.json do scripts/publish_texts.mjs viết) dùng làm chữ quảng cáo.
const TEXT_SRC = { meta: ['facebook', 'instagram'], tiktok: ['tiktok'] };
export const FACTORS = ['hook', 'angle', 'audience', 'narrative', 'format', 'duration', 'voice', 'music'];

const readJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const r1 = v => Math.round(v * 10) / 10;
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** "1080x1920" → "9:16"; khổ lệch ≤ 2% được làm tròn về khổ chuẩn gần nhất. */
export function aspectOf(w, h) {
  const r = w / h, std = { '9:16': 9 / 16, '4:5': 4 / 5, '1:1': 1, '16:9': 16 / 9 };
  for (const [k, v] of Object.entries(std)) if (Math.abs(r / v - 1) <= 0.02) return k;
  const g = gcd(w, h) || 1; return `${w / g}:${h / g}`;
}
/** Chữ ASCII thường, gạch nối: dùng trong tên file và utm_campaign. */
export function slug(s, max = 32) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '') || 'camp';
}
/** Thêm UTM vào trang đích, giữ tham số sẵn có. Không phải http(s) → null. */
export function withUtm(url, { source, campaign, content, term }) {
  let u; try { u = new URL(String(url || '').trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const set = { utm_source: source, utm_medium: 'paid_social', utm_campaign: campaign, utm_content: content, utm_term: term };
  for (const [k, v] of Object.entries(set)) if (v) u.searchParams.set(k, v);
  return u.toString();
}
export function csvRow(cells) {
  return cells.map(v => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',');
}

/** Kích thước, thời lượng, dung lượng của file. ffprobe không có thì lấy theo timeline (ghi rõ nguồn). */
export function probeVideo(file, tl = {}) {
  const mb = fs.statSync(file).size / 1e6;
  try {
    const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], { encoding: 'utf8' }));
    return { w: j.streams[0].width, h: j.streams[0].height, dur: +j.format.duration, mb, src: 'ffprobe' };
  } catch {
    return { w: tl.width || 1080, h: tl.height || 1920, dur: +tl.duration || 0, mb, src: 'timeline' };
  }
}

// ---------- lô ----------
/** Dự án gốc của một phiên bản (timeline._variant.base) hoặc chính nó. */
export function baseOf(dir) {
  const b = readJ(path.join(dir, 'timeline.json'))?._variant?.base;
  return b && fs.existsSync(path.join(b, 'timeline.json')) ? path.resolve(b) : path.resolve(dir);
}
/** Mã lô 4 ký tự: ổn định cho cùng dự án gốc + cùng lần tạo phiên bản, nên kết quả quảng cáo ghép lại đúng lô. */
export function batchId(base, created = '') {
  return crypto.createHash('sha1').update(`${path.resolve(base)}|${created}`).digest('hex').slice(0, 4);
}
const newestMp4 = d => {
  let fs_ = []; try { fs_ = fs.readdirSync(path.join(d, 'out')).filter(f => f.endsWith('.mp4')); } catch { return []; }
  return fs_.map(f => path.join(d, 'out', f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
};
/** Video của một bản: bản chính (variants.json `video` hoặc mp4 mới nhất trong out/) + các khổ phụ của export_multi (<tên>_9x16.mp4…). */
export function videosOf(dir, hinted) {
  const all = newestMp4(dir), main = hinted && fs.existsSync(path.resolve(dir, hinted)) ? path.resolve(dir, hinted) : all.find(f => !/_\d+x\d+\.mp4$/.test(f));
  if (!main) return [];
  const stem = path.basename(main, '.mp4');
  return [main, ...all.filter(f => f !== main && new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\d+x\\d+\\.mp4$`).test(path.basename(f)))];
}
/** Trục của một bản (FACTORS). Bản gốc và bản kiểu hook/style không có góc/khán giả: để trống. */
export function factorsOf(tl, v = {}) {
  const ax = v.axes || tl._variant?.axes || {}, a = tl.audio || {};
  const music = (a.music || [])[0];
  const voice = tl.voice_name || tl.tts?.voice || (typeof a.voice === 'string' ? path.basename(a.voice).replace(/\.[a-z0-9]+$/i, '') : '');
  return {
    hook: v.hook_id || tl._variant?.hook_id || v.hook || tl._variant?.hook || '',
    hook_text: v.hook || tl._variant?.hook || '',
    angle: ax.angle || '', audience: ax.audience || '', narrative: ax.narrative || '', format: ax.format || '',
    duration: ax.duration ? String(ax.duration) : '', pack: v.pack || tl.pack || '',
    voice, music: music ? String(music.mood || (music.src || music.file ? path.basename(music.src || music.file) : '')) : '',
  };
}
/** Danh sách bản của lô: bản gốc (V00) + variants.json của dự án gốc (V01…). Có variants.json mà bản gốc không có video thì bỏ bản gốc. */
export function collectBatch(input) {
  const base = baseOf(input), vj = readJ(path.join(base, 'variants.json'));
  const batch = batchId(base, vj?.created || ''), out = [];
  const one = (dir, i, v) => {
    const tl = readJ(path.join(dir, 'timeline.json')); if (!tl) return null;
    return { dir, i, code: `${batch}-V${String(i).padStart(2, '0')}`, tl, v: v || {}, factors: factorsOf(tl, v || {}),videos: videosOf(dir, v?.video) };
  };
  const b = one(base, 0, null); if (b) out.push(b);
  (vj?.variants || []).forEach((v, k) => { const d = path.resolve(base, v.dir); const it = fs.existsSync(path.join(d, 'timeline.json')) ? one(d, readJ(path.join(d, 'timeline.json'))?._variant?.i || k + 1, v) : null; if (it) out.push(it); });
  return { base, batch, created: vj?.created || null, items: out };
}

// ---------- chữ quảng cáo ----------
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
/** primary_text + headline: gói đăng của bản (publish/publish.json) theo nền tảng, không có thì dựng từ hook/tiêu đề. */
export function adTexts(dir, tl, platform, factors) {
  const pub = readJ(path.join(dir, 'publish/publish.json')) || {}, P = pub.platforms || pub;
  const d = TEXT_SRC[platform].map(k => P[k]).find(x => x && (x.caption || x.title)) || {};
  const tags = Array.isArray(d.hashtags) ? d.hashtags.slice(0, 3).join(' ') : '';
  const primary = clean([d.caption || factors.hook_text || tl.title || '', tags && !String(d.caption || '').includes('#') ? tags : ''].filter(Boolean).join(' '));
  const headline = clean(d.title || tl.ads?.headline || tl.title || factors.hook_text || '').replace(/\s*#shorts\b/i, '');
  return { primary_text: primary, headline, from: d.caption || d.title ? 'publish.json' : 'hook/tiêu đề' };
}

// ---------- kiểm spec ----------
/** → { errors: [...] (loại khỏi gói), warnings: [...] } */
export function checkSpec(info, platform, texts = {}) {
  const P = PRESETS[platform], errors = [], warnings = [], aspect = aspectOf(info.w, info.h), short = Math.min(info.w, info.h);
  if (!P.aspects.includes(aspect)) errors.push(`khổ ${aspect} không dùng được (chỉ ${P.aspects.join(', ')})`);
  if (!(info.dur >= P.hard.min_s)) errors.push(`dài ${r1(info.dur)}s, tối thiểu ${P.hard.min_s}s`);
  if (info.dur > P.hard.max_s) errors.push(`dài ${r1(info.dur)}s, tối đa ${P.hard.max_s}s`);
  if (info.mb > P.hard.max_mb) errors.push(`nặng ${Math.round(info.mb)} MB, tối đa ${P.hard.max_mb} MB`);
  if (short < P.hard.min_w) errors.push(`cạnh ngắn ${short}px, tối thiểu ${P.hard.min_w}px`);
  if (P.hard.text_max && (texts.primary_text || '').length > P.hard.text_max) errors.push(`chữ quảng cáo ${texts.primary_text.length} ký tự, tối đa ${P.hard.text_max}`);
  if (!errors.length) {
    if (info.dur > P.soft.max_s) warnings.push(`dài ${r1(info.dur)}s, nên ≤ ${P.soft.max_s}s`);
    if (short < P.soft.min_short) warnings.push(`cạnh ngắn ${short}px, nên ≥ ${P.soft.min_short}px`);
    if (P.soft.aspect && aspect !== P.soft.aspect) warnings.push(`khổ ${aspect}, nền tảng ưu tiên ${P.soft.aspect}`);
    if ((texts.primary_text || '').length > P.soft.primary_max) warnings.push(`chữ chính ${texts.primary_text.length} ký tự, nên ≤ ${P.soft.primary_max} (bị cắt "Xem thêm")`);
    if (P.soft.headline_max && (texts.headline || '').length > P.soft.headline_max) warnings.push(`tiêu đề ${texts.headline.length} ký tự, nên ≤ ${P.soft.headline_max}`);
    if (!texts.primary_text) warnings.push('chưa có chữ quảng cáo (chạy "Gói đăng" hoặc điền tay trong Ads Manager)');
  }
  if (info.src === 'timeline') warnings.push('không có ffprobe: khổ và thời lượng lấy theo timeline');
  return { errors, warnings, aspect };
}

// ---------- gói ----------
const stamp = (d = new Date()) => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
/**
 * Dựng gói. o: { platforms, campaign, landing, cta, outDir, dryRun, probe, now }
 * → { base, batch, packs: [{ platform, dir, rows, excluded, warnings }] }
 */
export function buildPack(input, o = {}) {
  const B = collectBatch(input), probe = o.probe || probeVideo;
  const baseTl = B.items[0]?.tl || readJ(path.join(B.base, 'timeline.json')) || {};
  const platforms = (o.platforms?.length ? o.platforms : baseTl.ads?.platforms?.length ? baseTl.ads.platforms : ['meta', 'tiktok']).filter(p => PRESETS[p]);
  if (!platforms.length) throw new Error(`Nền tảng không hợp lệ (chỉ ${Object.keys(PRESETS).join(', ')}).`);
  const campaign = slug(o.campaign || baseTl.ads?.campaign || baseTl.ads?.product || path.basename(B.base));
  const landingRaw = o.landing || baseTl.ads?.landing_url || baseTl.brand?.website || '';
  const landingOk = landingRaw && withUtm(/^https?:/i.test(landingRaw) ? landingRaw : `https://${landingRaw}`, {}) ? (/^https?:/i.test(landingRaw) ? landingRaw : `https://${landingRaw}`) : '';
  const res = { base: B.base, batch: B.batch, campaign, packs: [] };
  // Cổng QC theo từng bản: mỗi phiên bản có qc.json riêng; bản chưa có QC mà dự án gốc bị chặn thì cũng chặn (cùng lời thoại).
  const baseGate = readGate(B.base);
  for (const platform of platforms) {
    const P = PRESETS[platform], cta = (o.cta || baseTl.ads?.cta || P.cta_default).toUpperCase().replace(/\s+/g, '_');
    const outDir = path.resolve(o.outDir || path.join(B.base, 'out/ads'), `${platform}_${stamp(o.now)}`);
    const rows = [], excluded = [], warnings = [];
    if (!P.ctas.includes(cta)) warnings.push(`CTA ${cta} không có trong danh sách của ${P.name}; chọn lại khi tải lên`);
    if (!landingOk) warnings.push(landingRaw ? `trang đích "${landingRaw}" không hợp lệ` : 'chưa có trang đích (--landing hoặc timeline.ads.landing_url): cột landing_url để trống');
    const names = new Set();
    for (const it of B.items) {
      if (!it.videos.length && it.i === 0 && B.items.length > 1) continue;   // lô có phiên bản: bản gốc chưa xuất thì không tính
      const hasQc = fs.existsSync(path.join(it.dir, '.studio/qc.json'));
      const g = hasQc ? readGate(it.dir) : baseGate;
      if (g.blocked) { excluded.push({ code: it.code, dir: it.dir, reason: `QC quảng cáo chặn xuất: ${gateText(g)}${hasQc ? '' : ' (theo dự án gốc)'}` }); continue; }
      if (!it.videos.length) { excluded.push({ code: it.code, dir: it.dir, reason: 'chưa xuất video (out/*.mp4)' }); continue; }
      const itWarn = [];
      if (it.tl.ads?.on && !hasQc) itWarn.push('chưa chạy QC quảng cáo cho bản này');
      if (g.override) itWarn.push(`đã bỏ qua lỗi QC có lý do: ${g.override.reason}`);
      if (g.stale) itWarn.push('timeline đã đổi sau lần QC, nên kiểm tra lại');
      const texts = adTexts(it.dir, it.tl, platform, it.factors);
      for (const file of it.videos) {
        const info = probe(file, it.tl), spec = checkSpec(info, platform, texts);
        const adName = `${campaign}_${platform}_${it.code}_${spec.aspect.replace(':', 'x')}_${Math.round(info.dur)}s`;
        if (spec.errors.length) { excluded.push({ code: it.code, dir: it.dir, file, reason: `sai spec ${platform}: ${spec.errors.join('; ')}` }); continue; }
        let name = adName, k = 2; while (names.has(name)) name = `${adName}-${k++}`; names.add(name);
        const landing = landingOk ? withUtm(landingOk, { source: P.utm_source, campaign, content: it.code, term: it.factors.angle || undefined }) : '';
        rows.push({ ad_name: name, file: `${name}.mp4`, code: it.code, src: file, aspect: spec.aspect, duration_s: r1(info.dur), size_mb: r1(info.mb),
          primary_text: texts.primary_text, headline: platform === 'tiktok' ? '' : texts.headline, cta, landing_url: landing, ...it.factors, text_from: texts.from,
          warnings: [...itWarn, ...spec.warnings] });
      }
    }
    const pack = { platform, dir: outDir, rows, excluded, warnings, campaign, batch: B.batch };
    if (!o.dryRun) writePack(pack, B, P);
    res.packs.push(pack);
  }
  return res;
}

const COLS = ['ad_name', 'file', 'code', 'aspect', 'duration_s', 'size_mb', 'primary_text', 'headline', 'cta', 'landing_url',
  'hook', 'hook_text', 'angle', 'audience', 'narrative', 'format', 'duration', 'pack', 'voice', 'music', 'warnings'];
function writePack(pack, B, P) {
  fs.mkdirSync(pack.dir, { recursive: true });
  for (const r of pack.rows) fs.copyFileSync(r.src, path.join(pack.dir, r.file));
  const csv = [csvRow(COLS), ...pack.rows.map(r => csvRow(COLS.map(c => (c === 'warnings' ? r.warnings.join(' | ') : r[c]))))].join('\r\n');
  fs.writeFileSync(path.join(pack.dir, 'ads_mapping.csv'), '﻿' + csv + '\r\n');   // BOM: Excel đọc đúng tiếng Việt
  const byCode = {};
  for (const r of pack.rows) byCode[r.code] ||= { dir: path.relative(B.base, B.items.find(i => i.code === r.code).dir) || '.', ...Object.fromEntries(FACTORS.concat(['hook_text', 'pack']).map(f => [f, r[f]])), ads: [] };
  for (const r of pack.rows) byCode[r.code].ads.push(r.ad_name);
  fs.writeFileSync(path.join(pack.dir, 'manifest.json'), JSON.stringify({ kind: 'ads_pack', version: 1, platform: pack.platform, campaign: pack.campaign, batch: pack.batch,
    base: B.base, created: new Date().toISOString(), factors: FACTORS, variants: byCode, excluded: pack.excluded.map(e => ({ ...e, file: e.file ? path.basename(e.file) : undefined })) }, null, 1));
  fs.writeFileSync(path.join(pack.dir, 'README.txt'), readme(pack, P).replace(/\n/g, '\r\n'));
}
function readme(pack, P) {
  const L = [`GÓI QUẢNG CÁO ${P.name.toUpperCase()}`, `Chiến dịch: ${pack.campaign} · lô ${pack.batch} · ${pack.rows.length} file`, '',
    'Gói này chỉ để tải lên bằng tay. Studio không đăng quảng cáo và không gọi API của nền tảng.', '',
    'CÁCH DÙNG', `1. Mở ${P.url} và tạo chiến dịch / nhóm quảng cáo như thường lệ.`,
    '2. Mỗi dòng trong ads_mapping.csv là một quảng cáo: tải file .mp4 cùng tên, đặt tên quảng cáo đúng cột ad_name,',
    '   dán primary_text, headline, chọn CTA, dán landing_url (đã gắn UTM, utm_content = mã bản).',
    '3. Giữ nguyên ad_name: khi xuất báo cáo từ Ads Manager, Studio ghép kết quả về đúng bản theo mã trong tên.',
    '4. Các bản cùng lô dùng chung lời thoại: chạy chung một nhóm quảng cáo để so (A/B), đừng đăng như quảng cáo độc lập.',
    '5. Chữ quảng cáo do AI viết hoặc lấy từ hook: đọc lại trước khi chạy; Studio chỉ dò ngôn ngữ rủi ro, không bảo đảm được duyệt.', ''];
  if (pack.warnings.length) L.push('LƯU Ý CHUNG', ...pack.warnings.map(w => `- ${w}`), '');
  const warned = pack.rows.filter(r => r.warnings.length);
  if (warned.length) L.push('CẢNH BÁO TỪNG FILE', ...warned.map(r => `- ${r.ad_name}: ${r.warnings.join('; ')}`), '');
  if (pack.excluded.length) L.push('BẢN BỊ LOẠI KHỎI GÓI', ...pack.excluded.map(e => `- ${e.code}${e.file ? ` (${path.basename(e.file)})` : ''}: ${e.reason}`), '');
  L.push('Spec dùng để kiểm theo tài liệu công bố đến 2025; kiểm lại trên Ads Manager.',
    'Dựa trên AI Video Studio của Nguyễn Tất Kiểm (https://github.com/nguyentatkiem/ai-video-studio).');
  return L.join('\n') + '\n';
}

export function packText(r) {
  return r.packs.map(p => [`${p.platform}: ${p.rows.length} file → ${p.dir}`,
    ...p.excluded.map(e => `  ✗ ${e.code}${e.file ? ` ${path.basename(e.file)}` : ''}: ${e.reason}`),
    ...p.warnings.map(w => `  ! ${w}`)].join('\n')).join('\n');
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  if (!a[0] || a[0].startsWith('--')) { console.log('usage: node scripts/ads_pack.mjs <dự án> [--platform meta,tiktok] [--campaign tên] [--landing https://…] [--cta LEARN_MORE] [--out dir] [--dry-run]'); process.exit(2); }
  try {
    const r = buildPack(path.resolve(a[0]), { platforms: opt('--platform')?.split(',').map(s => s.trim()), campaign: opt('--campaign'), landing: opt('--landing'),
      cta: opt('--cta'), outDir: opt('--out'), dryRun: a.includes('--dry-run') });
    console.log(packText(r));
    if (!r.packs.some(p => p.rows.length)) process.exit(1);
  } catch (e) { console.error(e.message); process.exit(1); }
}
