// S27 M191 · Kịch bản → mẫu dựng sẵn (trước khi quay). Thiết kế docs/plans/S27-dung-theo-kich-ban.md mục 5.1.
// Đầu vào: kịch bản (chữ / .docx / Excel có mốc giây của M197; có hoặc không dấu) + thương hiệu + khổ, chưa có video.
//   1. estimateTimes: giờ dự kiến mỗi đoạn theo tốc độ đọc (2,6 từ/giây, đổi 2,0–3,4; nghỉ 0,4 s), mốc giây của Excel thắng;
//      align.mode 'estimate' nên mọi luồng sau (bảng dựng, AI dựng, QC kịch bản) đọc như kịch bản đã căn.
//   2. Mỗi phương án là một thư mục dự án không video (v1..v3): timeline có ô chờ quay (work/placeholder.svg) + phụ đề dự kiến từ
//      chính chữ kịch bản; AI dựng (ai_edit.mjs --apply, bảng dựng ngầm của M194, nguồn người dùng M198) dựng khác nhau rõ
//      (gói / nhịp graphic / giọng), kiểm engine (engineIssues) + QC tĩnh (staticIssues), chụp 5 khung ảnh tĩnh.
//   3. Studio (studio/routes/32_scriptdraft.mjs): chọn một → dùng cho video mới (chép vào Du an/ của Kho rồi mở) hoặc lưu thành mẫu
//      của thương hiệu (brand_id của M189), kèm danh sách quay (shots.txt).
//   4. Quay xong: applyScript (script_doc.mjs) thấy kịch bản cũ là 'estimate' → retimeDraft dời mọi mục theo giờ thật.
// Job nền `script_draft` (scripts/queue.mjs): node scripts/script_draft.mjs <thư mục nháp>. Tiến độ "@@ <0..1> <bước>", cuối "RESULT {…}".
import fs from 'node:fs';
import { rmSync } from './fs_rm.mjs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AVS_HOME, captionsFrom, estimateTimes, fold, parseScript, MAX_TEXT, WPS, WPS_MIN, WPS_MAX, clampWps } from './script_doc.mjs';
export { estimateTimes, retimeDraft, WPS, WPS_MIN, WPS_MAX, clampWps } from './script_doc.mjs';
import { DEFAULT_DUCK, DEFAULT_MUSIC_GAIN } from './audio_defaults.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r2 = v => Math.round(v * 100) / 100;
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, typeof o === 'string' ? o : JSON.stringify(o, null, 1)); fs.renameSync(t, f); };

export const DRAFT_ID = /^d-[a-z0-9-]{6,40}$/;
export const draftsDir = (home = AVS_HOME) => path.join(home, 'drafts');
export const draftDir = (id, home = AVS_HOME) => { if (!DRAFT_ID.test(String(id || ''))) throw Object.assign(new Error('Mã bản nháp không hợp lệ'), { status: 400 }); return path.join(draftsDir(home), id); };
export const ASPECTS = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080] };

/** Ô chờ quay của A-roll (SVG một khung, engine vẽ như chuỗi khung có 1 ảnh): nền tối, khung người, chữ "Cảnh quay của bạn". */
export function placeholderSvg(w, h) {
  const s = Math.min(w, h), cx = w / 2, cy = h * .46;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2f3a"/><stop offset="1" stop-color="#14171d"/></linearGradient></defs>`
    + `<rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${cx}" cy="${cy - s * .16}" r="${s * .13}" fill="#3b4250"/><rect x="${cx - s * .26}" y="${cy + s * .02}" width="${s * .52}" height="${s * .34}" rx="${s * .2}" fill="#3b4250"/>`
    + `<rect x="${w * .06}" y="${h * .04}" width="${w * .88}" height="${h * .92}" fill="none" stroke="#5b6475" stroke-width="${Math.max(2, s * .006)}" stroke-dasharray="${s * .03} ${s * .02}" rx="${s * .03}"/>`
    + `<text x="${cx}" y="${cy + s * .5}" fill="#9aa3b2" font-family="Inter, Arial, sans-serif" font-size="${Math.round(s * .05)}" text-anchor="middle">Cảnh quay của bạn</text></svg>`;
}

/**
 * Timeline không video của một phương án: kích thước theo khổ, phụ đề dự kiến, ô chờ quay, thẻ kết theo thương hiệu, nhạc mặc định.
 * `_starter` để AI dựng thay cảnh khởi đầu; `draft` ghi chế độ trước khi quay (Studio báo "Chưa quay", retimeDraft đọc).
 */
export function draftTimeline({ aspect = '9:16', est, title = '', brand = null, pack = 'slate', wps = WPS }) {
  const [W, H] = ASPECTS[aspect] || ASPECTS['9:16'], D = est.duration, sp = r2(est.speech + .4);
  return {
    width: W, height: H, fps: 30, duration: D, pack, title: String(title || '').slice(0, 80),
    _starter: { pack, title, dur: D },
    aroll: { frames: 'work/placeholder.svg', count: 1, placeholder: true },
    face: W > H ? { x: 640, y: 300 } : { x: 360, y: 520 },
    caption_style: pack === 'slate' ? 'slate' : undefined, captions: 'work/captions.json',
    draft: { mode: 'estimate', wps: clampWps(wps), aspect, at: new Date().toISOString(), est: est.segments.map(x => [x.t0, x.t1]) }, // giờ ước của các mục (retimeDraft)
    scenes: [{ type: 'title_card', t0: sp, t1: D, question: 'Bạn thấy sao?', ...(brand?.name ? { title: brand.name } : {}), ...(W > H ? { y: 210 } : {}) }],
    audio: { music: [{ t0: 0, t1: D, mood: 'tech', gain: DEFAULT_MUSIC_GAIN }], sfx: [], duck: { ...DEFAULT_DUCK } },
    ...(brand ? { brand } : {}),
  };
}

/** 3 phương án khác nhau rõ: gói của thương hiệu / gói khác nhịp dày / gói khác thoáng. Phương án sau tránh gói phương án trước đã chọn. */
export const VARIANTS = [
  { id: 'brand', name: 'Theo thương hiệu', pack: 'keep', density: 'vua', tone: 'rõ ràng, đúng giọng thương hiệu', note: 'Gói của thương hiệu, nhịp vừa' },
  { id: 'fast', name: 'Nhịp nhanh', pack: 'auto', density: 'day', tone: 'năng lượng, cuốn, nhiều điểm nhấn', note: 'Nhiều graphic, đổi cảnh nhanh' },
  { id: 'calm', name: 'Thoáng, kể chuyện', pack: 'auto', density: 'thua', tone: 'kể chuyện, cảm xúc, ít chữ trên màn hình', note: 'Ít graphic, để lời dẫn dắt' },
];
/** Tham số ai_edit.mjs của phương án k; `used` = gói các phương án trước đã chọn (Claude chọn gói khác). */
export function variantArgs(v, used = []) {
  const A = ['--pack', v.pack, '--density', v.density, '--tone', v.tone, '--goal', 'mẫu dựng sẵn trước khi quay (chưa có video, A-roll là ô chờ quay)'];
  const extra = ['Video chưa quay: hình người nói là ô chờ, giờ mỗi đoạn là giờ dự kiến theo tốc độ đọc.',
    v.pack === 'auto' && used.length ? `Chọn gói khác ${used.map(p => `“${p}”`).join(', ')} để phương án khác rõ.` : ''].filter(Boolean).join(' ');
  return [...A, '--extra', extra, '--no-shorten'];
}

/** Kiểm engine thuần trên timeline (như checkTl của fx_audit.mjs): cảnh 0 giây, ngoài video, quá dài, fx ngoài video. */
const LONG_OK = /frame|layout|bg|backdrop|split|bubble_layout|screen|cinema_bars|letterbox|multicam|greenscreen|ticker|podcast|chrome|grid|watermark|progress|badge|bars|live|reaction|scrim|grade|facecam|strap/;
export function engineIssues(tl) {
  const D = +tl.duration || 0, out = [];
  for (const s of (tl.scenes || []).filter(x => !x.hidden)) {
    const d = s.t1 - s.t0, nm = s.type + (s.hf ? ':' + s.hf : '');
    if (!(d >= .12)) out.push({ kind: 'zero', severity: 'warn', t: r2(s.t0 || 0), msg: `${nm} dài ${(d || 0).toFixed(2)} s (không hiện)` });
    else if (s.t0 >= D - .05) out.push({ kind: 'outside', severity: 'warn', t: r2(s.t0), msg: `${nm} bắt đầu sau khi hết video` });
    else if (d > Math.max(9, D * .3) && !LONG_OK.test(s.type) && d < D - .5) out.push({ kind: 'long', severity: 'info', t: r2(s.t0), msg: `${nm} dài ${d.toFixed(1)} s` });
  }
  for (const f of tl.fx || []) if (f.t >= D - .05) out.push({ kind: 'fx_out', severity: 'warn', t: r2(f.t), msg: `hiệu ứng ${f.type} ngoài video` });
  return out;
}

/** n thời điểm chụp khung tĩnh: giữa các graphic (không tính cảnh nền), đủ n thì thôi; thiếu thì rải đều; luôn trước thẻ kết. */
export function stillTimes(tl, n = 5) {
  const D = +tl.duration || 0, end = (tl.scenes || []).find(s => s.type === 'title_card' && s.t1 >= D - .05)?.t0 ?? D;
  const sc = (tl.scenes || []).filter(s => !s.hidden && s.type !== 'title_card' && s.t1 > s.t0 && s.t0 < end && s.t1 - s.t0 < Math.max(8, D * .4)).sort((a, b) => a.t0 - b.t0);
  const pick = sc.length <= n ? sc : Array.from({ length: n }, (_, i) => sc[Math.round(i * (sc.length - 1) / (n - 1))]);
  const ts = [...new Set(pick.map(s => r2(Math.min(s.t1 - .05, s.t0 + Math.min(1, (s.t1 - s.t0) * .5)))))];
  for (let i = 0; ts.length < n && i < n * 2; i++) { const t = r2((i + .5) * end / n); if (!ts.some(x => Math.abs(x - t) < .6)) ts.push(t); }
  return ts.filter(t => t >= 0 && t < D).sort((a, b) => a - b).slice(0, n);
}

const FRAME_VI = { can: 'Cận mặt', trung: 'Trung cảnh', rong: 'Toàn cảnh' };
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
/**
 * Danh sách quay (shot list) từ đoạn đã ước giờ + bảng dựng (nếu có): mỗi đoạn lời + cỡ khung + B-roll cần tự quay
 * (dấu B-ROLL chưa tìm được cảnh trong Kho / thư viện / stock, hoặc chỉ có b-roll động). → { items, text }
 */
export function shotList(segments, sheet = null, { title = '' } = {}) {
  const rows = sheet?.rows || [];
  const items = (segments || []).map((s, k) => {
    const r = rows.find(x => x.seg === k) || {}, a = r.aroll || s.aroll || {};
    const frame = a.off ? 'Không cần quay người nói (chỉ hình minh hoạ)' : FRAME_VI[a.frame] || 'Trung cảnh';
    const need = (r.broll || (s.broll || []).map(q => ({ q, miss: true }))).filter(b => b.miss || !b.pick || b.src === 'dong').map(b => b.q).filter(Boolean);
    const notes = [...(s.note || [])];
    return { seg: k, t0: s.t0 ?? null, t1: s.t1 ?? null, kind: s.kind, say: s.say, frame, broll: [...new Set(need)], notes };
  });
  const dur = items.length ? items[items.length - 1].t1 || 0 : 0;
  const text = [`DANH SÁCH QUAY${title ? ` · ${title}` : ''}`, `${items.length} đoạn · khoảng ${Math.round(dur)} giây lời nói (ước theo tốc độ đọc)`, '',
    ...items.flatMap((x, i) => [
      `${i + 1}. [${x.t0 != null ? `${mmss(x.t0)}–${mmss(x.t1)}` : '--'}] ${x.kind === 'hook' ? 'MỞ ĐẦU · ' : x.kind === 'cta' ? 'KÊU GỌI · ' : ''}${x.frame}`,
      `   Lời: ${x.say}`,
      ...(x.broll.length ? [`   Quay thêm (B-roll): ${x.broll.join('; ')}`] : []),
      ...x.notes.map(n => `   Ghi chú: ${n}`), '']),
    'Quay xong: thả video vào dự án, bấm Tạo lời thoại; mẫu tự canh theo giọng thật.'].join('\n');
  return { items, text };
}

/**
 * Timeline phương án → mẫu người dùng (templates/user/<id>.json, như POST /api/templates/save) mang brand_id (M189).
 * Bỏ cờ nội bộ của AI dựng (_ai, _placed…), giữ ghi chú kịch bản (_script) để thẻ mẫu đọc lại "Kịch bản: …".
 */
const DROP = new Set(['_ai', '_orig', '_planned', '_qc', '__qi', '_was']);
const clean = o => Array.isArray(o) ? o.map(clean) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => !DROP.has(k)).map(([k, v]) => [k, clean(v)])) : o;
export function toTemplate(tl, { name, brand = '', variant = null, shots = null, text = '' } = {}) {
  const aspect = tl.width > tl.height ? '16:9' : tl.width === tl.height ? '1:1' : '9:16';
  const mood = (tl.audio?.music || []).find(m => !m.hidden)?.mood || 'tech';
  return {
    name: String(name || 'Mẫu từ kịch bản').trim().slice(0, 80), category: 'kich-ban', aspect, pack: tl.pack || 'slate',
    desc: `Dựng sẵn từ kịch bản trước khi quay${variant ? ` · ${variant.name}` : ''}.`, tags: ['kịch bản', 'dựng sẵn'],
    title: tl.title || '', music: mood, use_recipe: false, base_dur: tl.duration,
    needs: (shots?.items || []).map(x => `${x.frame}: ${x.say.slice(0, 60)}`).slice(0, 12),
    ...(brand ? { brand_id: brand } : {}),
    ...(tl.caption_style ? { caption_style: tl.caption_style } : {}),
    fx: clean(tl.fx || []), scenes: clean((tl.scenes || []).filter(s => !s.hidden)),
    script: { text: String(text || '').slice(0, MAX_TEXT), wps: tl.draft?.wps || WPS },
  };
}
const slug = s => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'mau';
/** Ghi mẫu vào `dir` (templates/user) với id không trùng (cả mẫu có sẵn ở `builtin`); trả id. */
export function saveTemplateFile(dir, builtin, tpl) {
  fs.mkdirSync(dir, { recursive: true });
  let id = 'u-' + slug(tpl.name);
  for (let k = 2; fs.existsSync(path.join(dir, id + '.json')) || fs.existsSync(path.join(builtin, id + '.json')); k++) id = `u-${slug(tpl.name)}-${k}`;
  wr(path.join(dir, id + '.json'), { ...tpl, id, created: new Date().toISOString() });
  return id;
}

// ---------- job ----------
const say = (p, s) => console.log(`@@ ${Math.max(0, Math.min(1, p)).toFixed(3)} ${s}`);
function runNode(args, onLine) {
  return new Promise((ok, bad) => {
    const p = spawn(process.execPath, args, { cwd: SKILL, windowsHide: true });
    let rest = '', err = '';
    p.stdout.on('data', d => { const ls = (rest + d).split(/\r?\n/); rest = ls.pop(); ls.forEach(l => l && onLine(l)); });
    p.stderr.on('data', d => { err = (err + d).slice(-2000); });
    p.on('error', bad);
    p.on('close', c => (c === 0 ? ok() : bad(new Error((err.match(/LỖI: [^\n]*/)?.[0] || err.trim().split('\n').pop() || `thoát mã ${c}`).slice(0, 300)))));
  });
}
async function brandOf(id) {
  if (!id) return { kit: null, fields: null, pack: null };
  const { loadBrand, brandFields } = await import('./batch.mjs');
  const kit = /^[a-z0-9][a-z0-9-]{0,39}$/.test(id) ? loadBrand(id) : null;
  if (!kit) throw new Error(`không thấy thương hiệu "${String(id).slice(0, 40)}"`);
  const tpl = typeof kit.tpl === 'string' && /^[a-z0-9][a-z0-9_-]{0,80}$/.test(kit.tpl) ? readJSON(path.join(SKILL, 'templates', 'user', kit.tpl + '.json')) || readJSON(path.join(SKILL, 'templates', kit.tpl + '.json')) : null;
  return { kit, pack: tpl?.pack || kit.pack || null, fieldsFor: d => ({ ...brandFields(kit, d), kit: kit.id }) };
}
/** Một phương án: dựng thư mục dự án, AI dựng, kiểm, chụp khung. → tóm tắt cho thẻ phương án. */
async function buildVariant(root, k, v, ctx, used, P) {
  const vd = path.join(root, `v${k + 1}`);
  rmSync(vd, { recursive: true, force: true });
  fs.mkdirSync(path.join(vd, 'work'), { recursive: true });
  const tl = draftTimeline({ aspect: ctx.aspect, est: ctx.est, title: ctx.name, brand: ctx.brand.fieldsFor?.(vd) || null, pack: ctx.brand.pack || 'slate', wps: ctx.wps });
  wr(path.join(vd, 'work', 'placeholder.svg'), placeholderSvg(tl.width > tl.height ? 1280 : 720, tl.width > tl.height ? 720 : 1280));
  wr(path.join(vd, 'work', 'captions.json'), ctx.caps);
  wr(path.join(vd, 'timeline.json'), tl);
  wr(path.join(vd, '.studio', 'script.json'), { version: 1, text: ctx.text, name: ctx.name, updated: ctx.updated, segments: ctx.est.segments, align: ctx.est.align });
  if (ctx.sources) wr(path.join(vd, '.studio', 'script_sources.json'), ctx.sources);
  const out = { k: k + 1, id: v.id, name: v.name, note: v.note, density: v.density };
  await runNode([path.join(SKILL, 'scripts', 'ai_edit.mjs'), vd, ...variantArgs(v, used), '--apply'], l => {
    const m = /^@@ ([\d.]+) (.*)$/.exec(l); if (m) say(P(+m[1] * .8), `Phương án ${k + 1}/${VARIANTS.length} · ${m[2]}`);
  });
  const done = readJSON(path.join(vd, 'timeline.json')) || tl, caps = readJSON(path.join(vd, 'work', 'captions.json')) || ctx.caps;
  const plan = readJSON(path.join(vd, '.studio', 'ai_plan.json')) || {};
  Object.assign(out, { pack: done.pack, scenes: (done.scenes || []).filter(s => !s.hidden).length, summary: String(plan.summary || '').slice(0, 300),
    script: plan.script ? { total: plan.script.total, done: plan.script.done } : null, music: (done.audio?.music || []).filter(m => !m.hidden).map(m => m.mood).filter(Boolean) });
  say(P(.82), `Phương án ${k + 1}: kiểm engine + QC`);
  let issues = engineIssues(done);
  let E = null;
  try {
    const Q = await import('./ai_qc.mjs');
    try { issues = [...issues, ...Q.staticIssues(done, caps, vd).filter(i => !/^script_/.test(i.kind) || i.kind === 'script_mark')]; } catch (e) { out.qcError = String(e.message || e).slice(0, 160); }
    say(P(.86), `Phương án ${k + 1}: chụp khung ảnh tĩnh`);
    E = await Q.openEngine(vd, { scale: .5 });
    await Q.engineInit(E, done, caps);
    const ts = stillTimes(done, 5), stills = [];
    for (const [i, t] of ts.entries()) { const f = path.join(vd, '.studio', 'draft_stills', `${i + 1}.jpg`); await Q.engineShot(E, t, f, false); stills.push({ n: i + 1, t }); say(P(.86 + .13 * (i + 1) / ts.length), `Phương án ${k + 1}: khung ${i + 1}/${ts.length}`); }
    out.stills = stills;
    if (E.errors.length) issues.push({ kind: 'engine_error', severity: 'warn', t: 0, msg: `Engine báo lỗi: ${E.errors[0]}` });
  } catch (e) { out.stillError = String(e.message || e).slice(0, 200); }
  finally { try { await E?.browser.close(); } catch { /* đã đóng */ } }
  out.issues = issues.slice(0, 20).map(i => ({ kind: i.kind, severity: i.severity || 'info', t: i.t ?? null, msg: String(i.msg || '').slice(0, 160) }));
  return out;
}
export const resultFile = root => path.join(root, 'result.json');
async function main() {
  const root = path.resolve(process.argv[2] || '');
  const d = readJSON(path.join(root, 'draft.json'));
  if (!d || typeof d.text !== 'string') throw new Error('Thiếu draft.json (kịch bản của bản nháp)');
  console.log(`PROJECT ${root}`);
  const segs = parseScript(d.text);
  if (!segs.length) throw new Error('Kịch bản không có chữ để nói');
  const wps = clampWps(d.wps), est = estimateTimes(segs, { wps }), aspect = ASPECTS[d.aspect] ? d.aspect : '9:16';
  const caps = captionsFrom(est.words, { max: 4 });
  const brand = await brandOf(d.brand || '');
  const ctx = { text: d.text, name: String(d.name || '').slice(0, 80) || 'Bản nháp', updated: d.created || new Date().toISOString(), est, caps, aspect, wps, brand, sources: Array.isArray(d.sources) ? d.sources : null };
  const res = { id: path.basename(root), at: new Date().toISOString(), state: 'running', wps, aspect, duration: est.duration, segments: est.segments.length, variants: [] };
  wr(resultFile(root), res);
  say(.02, `Ước giờ ${est.segments.length} đoạn theo ${wps} từ/giây (${Math.round(est.speech)} giây lời)`);
  const used = [];
  for (const [k, v] of VARIANTS.entries()) {
    const P = x => .03 + (k + x) * .95 / VARIANTS.length;
    let r;
    try { r = await buildVariant(root, k, v, ctx, used, P); if (r.pack) used.push(r.pack); }
    catch (e) { r = { k: k + 1, id: v.id, name: v.name, note: v.note, error: String(e.message || e).slice(0, 300) }; console.log(`Phương án ${k + 1} lỗi: ${r.error}`); }
    res.variants.push(r); wr(resultFile(root), res);
  }
  // danh sách quay theo bảng dựng của phương án đầu dựng được (B-roll chưa có cảnh = cần tự quay)
  const ok = res.variants.find(x => !x.error);
  const sheet = ok ? readJSON(path.join(root, `v${ok.k}`, '.studio', 'build_sheet.json')) : null;
  const shots = shotList(est.segments, sheet, { title: ctx.name });
  wr(path.join(root, 'shots.txt'), shots.text);
  Object.assign(res, { state: ok ? 'done' : 'error', shots: shots.items.length, finished: new Date().toISOString() });
  wr(resultFile(root), res);
  if (!ok) throw new Error(`Không dựng được phương án nào: ${res.variants[0]?.error || 'lỗi lạ'}`);
  say(1, `Xong ${res.variants.filter(x => !x.error).length}/${VARIANTS.length} phương án`);
  console.log('RESULT ' + JSON.stringify({ project: root, variants: res.variants.filter(x => !x.error).length }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  main().catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
}
