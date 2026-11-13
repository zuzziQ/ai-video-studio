// Ma trận biến thể (M21), cổng đa dạng nguồn (M20) và ước tính lô lớn (M23) cho scripts/variants.mjs --kind matrix.
// Phần thuần, không mở engine: dùng được từ variants.mjs, route Studio và test.
//
//   sourceStats(dir, tl)                 → { sources, scenes, tags, list }   video nguồn khác nhau + đoạn hình của dự án
//   sourceRequirement(target)            → { sources, scenes }               ngưỡng của cổng đa dạng nguồn
//   checkSourceGate(stats, target, o)    → { ok, blocked, need, have, warnings }  thiếu nguồn: chặn, trừ khi o.allowLowSource
//   matrixBrief(tl, overrides)           → trục của lô: khán giả × góc × kết cấu × thời lượng × bố cục
//   planMatrix(brief, stats, ctx, target, o) → { theoretical, feasible_count, rejected_reasons, chosen, proposals, angle_distribution }
//   estimate({ dir, tl, target, plan, stats, lib, queueFile })  → số tổ hợp khả thi, giờ LLM/dựng/xuất, dung lượng
//
// Chuyển từ AI Video Factory services/api/avf/creative.py (plan_matrix, ANGLES/NARRATIVES/FORMATS) và scale.py
// (SOURCE_GATE, source_requirement, check_source_gate, estimate_plan), viết lại cho Studio: nguồn và cảnh đọc từ
// timeline.json, thời gian job đọc (chỉ đọc) từ ~/.ai-video-studio/queue.json, không có cơ sở dữ liệu. Spec: references/variant-matrix.md.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AUDIENCES, HOOK_REUSE_MAX, activeHooks } from './hooks_lib.mjs';

export { AUDIENCES };
// needs: thẻ cảnh cần có trong nguồn để góc này làm được
export const ANGLES = {
  how_to: { label: 'Hướng dẫn', needs: ['demonstration', 'hand'] }, faq: { label: 'Giải đáp', needs: [] },
  demo: { label: 'Demo', needs: ['demonstration'] }, comparison: { label: 'So sánh', needs: ['packshot'] },
  mistakes: { label: 'Sai lầm thường gặp', needs: [] }, feature: { label: 'Phân tích tính năng', needs: ['packshot'] },
  brand_story: { label: 'Câu chuyện thương hiệu', needs: ['face'] }, checklist: { label: 'Checklist', needs: [] },
  qa: { label: 'Q&A', needs: ['face'] }, tips: { label: 'Mẹo ứng dụng', needs: ['hand'] },
};
export const NARRATIVES = { problem_solution: 'Vấn đề → Giải pháp', how_to: 'How-to 3 bước', faq: 'Hỏi – Đáp', comparison: 'So sánh', product_story: 'Câu chuyện sản phẩm' };
// Bố cục → gói style của Studio (null = giữ gói đang dùng). Gói không có hoặc không hợp khổ hình thì giữ gói cũ và ghi chú.
export const FORMATS = { full: { label: 'Toàn màn hình', pack: null }, split: { label: 'Chia đôi', pack: 'split' },
  packshot_text: { label: 'Packshot + chữ', pack: 'review' }, pip: { label: 'Picture-in-picture', pack: 'podcast' } };
export const SOURCE_GATE = [[20, 3, 12], [100, 5, 25], [300, 8, 40]]; // (số bản lớn hơn, video nguồn tối thiểu, cảnh tối thiểu)
export const DIVERSITY = 6; // điểm trừ cho mỗi bản đã chọn trùng một giá trị trục
export const DEFAULTS = { llm_call_s: 30, hooks_per_call: 10, setup_s: 8, render_s: 90, file_mb: 12 };

const MEDIA = /\.(mp4|mov|m4v|mkv|webm|jpe?g|png|webp|gif)$/i;
const r1 = v => Math.round(v * 10) / 10, h2 = v => Math.round(v * 100) / 100;

// ---------- nguồn ----------
/** Video nguồn khác nhau và số đoạn hình (cảnh) của dự án; thẻ cảnh từ scene.tags/clip.tags, khuôn mặt, ads.source_tags. */
export function sourceStats(dir, tl) {
  const files = new Set(), tags = {};
  const addTag = (t, k = 1) => { t = String(t).trim().toLowerCase(); if (t) tags[t] = (tags[t] || 0) + k; };
  const fileOf = v => (typeof v === 'string' ? v : v && typeof v === 'object' ? v.seq || v.src || v.file || null : null);
  let scenes = 0;
  const ar = tl.aroll && typeof tl.aroll === 'object' ? fileOf(tl.aroll.src) || tl.aroll.frames || tl.aroll.file : tl.aroll;
  if (ar) files.add(String(ar));
  const clips = (tl.clips || []).filter(c => c && !c.hidden);
  for (const c of clips) { const f = fileOf(c.src); if (f) files.add(String(f)); scenes++; (c.tags || []).forEach(t => addTag(t)); }
  if (!clips.length && ar) scenes++;
  for (const s of tl.scenes || []) {
    if (!s || s.hidden) continue;
    const f = [s.src, s.file, s.video, s.image].map(fileOf).find(x => x && MEDIA.test(String(x)));
    if (!f) continue;
    files.add(String(f)); scenes++;
    (s.tags || []).forEach(t => addTag(t));
  }
  if (tl.face) { addTag('face'); addTag('presenter'); }   // A-roll có khuôn mặt (find_face.py)
  const extra = tl.ads?.source_tags;
  if (extra && typeof extra === 'object') for (const [t, k] of Object.entries(extra)) addTag(t, Math.max(0, +k || 0));
  return { sources: files.size, scenes, tags, list: [...files] };
}
export function sourceRequirement(target) {
  let sources = 1, scenes = 1;
  for (const [thr, a, s] of SOURCE_GATE) if (target > thr) { sources = a; scenes = s; }
  return { sources, scenes };
}
/** Cổng đa dạng nguồn. Thiếu nguồn: blocked = true; o.allowLowSource = true thì cho qua kèm cảnh báo. */
export function checkSourceGate(stats, target, { allowLowSource = false } = {}) {
  const need = sourceRequirement(target), have = { sources: stats.sources, scenes: stats.scenes };
  if (have.sources >= need.sources && have.scenes >= need.scenes) return { ok: true, blocked: false, need, have, warnings: [] };
  const message = `${target} bản cần ≥ ${need.sources} video nguồn và ≥ ${need.scenes} cảnh (đang có ${have.sources} video, ${have.scenes} cảnh)`;
  const hint = 'Quay thêm clip khác góc máy/bối cảnh rồi thêm vào dự án. Ít nguồn = nhiều bản trùng hình, nền tảng coi là nội dung lặp.';
  const w = { code: 'NEED_MORE_SOURCE', severity: allowLowSource ? 'warning' : 'critical', message: message + (allowLowSource ? ' — đã bỏ qua theo yêu cầu (--allow-low-source)' : ''), hint, need, have };
  return { ok: allowLowSource, blocked: !allowLowSource, need, have, warnings: [w] };
}

// ---------- ma trận ----------
const list = v => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map(x => String(x).trim()).filter(Boolean);
/** Trục của lô: timeline.ads.matrix, ghi đè bằng overrides (cờ CLI). Thời lượng 0 = giữ nguyên độ dài video. */
export function matrixBrief(tl, o = {}) {
  const m = { ...(tl.ads?.matrix || {}), ...Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '')) };
  const pick = (v, all, def) => { const l = list(v).filter(x => all.includes(x)); return l.length ? l : def; };
  const durs = list(m.durations).map(Number).filter(d => Number.isFinite(d) && d >= 0);
  return {
    audiences: list(m.audiences).length ? list(m.audiences) : list(tl.ads?.audiences).length ? list(tl.ads.audiences) : Object.keys(AUDIENCES).slice(0, 2),
    angles: pick(m.angles, Object.keys(ANGLES), Object.keys(ANGLES)),
    narratives: pick(m.narratives, Object.keys(NARRATIVES), Object.keys(NARRATIVES)),
    durations: durs.length ? [...new Set(durs)] : [0],
    formats: pick(m.formats, Object.keys(FORMATS), ['full']),
    quota_ratio: Number.isFinite(+m.quota_ratio) && +m.quota_ratio > 0 ? +m.quota_ratio : 0.25,
    seed: Number.isFinite(+m.seed) ? +m.seed : 42,
    // M32: học từ kết quả quảng cáo (scripts/ads_results.mjs). true hoặc { kpi, explore, platform }; bỏ trống/false = không học.
    learn: m.learn ? { kpi: m.learn.kpi || 'auto', explore: Number.isFinite(+m.learn.explore) ? Math.max(0, Math.min(1, +m.learn.explore)) : 0.2, platform: m.learn.platform || undefined } : null,
  };
}
function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function shuffle(a, seed) { const r = rng(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/**
 * creative.plan_matrix cho Studio. ctx: { duration (giây của video gốc), ads (bool: dự án bật cổng quảng cáo), claims }.
 * o: { seed, weights: {trục: {giá trị: 0.5–2}} }. Tổ hợp không khả thi có lý do; quota mỗi góc ≤ quota_ratio × target.
 */
export function planMatrix(brief, stats, ctx, target, o = {}) {
  const seed = o.seed ?? brief.seed ?? 42, weights = o.weights || null;
  const approved = (ctx.claims || []).filter(c => (c.status || 'approved') === 'approved');
  const combos = [];
  for (const audience of brief.audiences) for (const angle of brief.angles) for (const narrative of brief.narratives)
    for (const duration of brief.durations) for (const format of brief.formats) combos.push({ audience, angle, narrative, duration, format });
  shuffle(combos, seed);
  const quota = Math.max(1, Math.ceil(target * brief.quota_ratio)), perAngle = {}, rejected = {}, proposals = [];
  // M32: có trọng số thì quota của từng góc nhân theo trọng số góc đó (góc thắng được nhiều suất hơn, góc thua ít hơn).
  const qOf = a => (Number.isFinite(weights?.angle?.[a]) ? Math.max(1, Math.ceil(quota * weights.angle[a])) : quota);
  for (const c of combos) {
    const info = ANGLES[c.angle] || { needs: [] }, missing = info.needs.filter(t => !stats.tags[t]);
    let reason = null;
    if (!stats.scenes) reason = 'NEED_MORE_SOURCE: dự án chưa có hình';
    else if (missing.length) reason = `NEED_MORE_SOURCE: thiếu cảnh ${missing.join(', ')}`;
    else if (ctx.ads && !approved.length) reason = 'NO_CLAIM: chưa có claim đã duyệt';
    else if (c.duration && c.duration > (ctx.duration || 0) + 0.5) reason = `TOO_LONG: video gốc chỉ dài ${r1(ctx.duration || 0)}s`;
    if (reason) { const k = reason.split(':')[0]; rejected[k] = (rejected[k] || 0) + 1; proposals.push({ ...c, feasible: false, reason, score: 0 }); continue; }
    const coverage = info.needs.length ? Math.min(1, info.needs.reduce((s, t) => s + (stats.tags[t] || 0), 0) / (2 * info.needs.length)) : 1;
    const novelty = Math.max(0, 1 - (perAngle[c.angle] || 0) / qOf(c.angle));
    let score = Math.round(1000 * (0.45 * coverage + 0.35 * novelty + 0.2 * Math.min(1, (ctx.ads ? approved.length : 3) / 3))) / 10;
    if (weights) {
      const ws = Object.entries({ ...c, duration: String(c.duration) }).map(([d, v]) => weights[d]?.[v]).filter(w => Number.isFinite(w));
      if (ws.length) score = Math.round(score * ws.reduce((a, b) => a + b, 0) / ws.length * 10) / 10;
    }
    proposals.push({ ...c, feasible: true, reason: null, score, coverage: Math.round(coverage * 100) / 100 });
    perAngle[c.angle] = (perAngle[c.angle] || 0) + 1;
  }
  const feasible = proposals.filter(p => p.feasible).sort((a, b) => b.score - a.score);
  // Chọn tham lam: điểm trừ đi số bản đã chọn trùng giá trị ở từng trục (khác Factory: thêm phần này để lô nhỏ không dồn vào
  // một thời lượng/bố cục khi điểm bằng nhau). Quota mỗi góc giữ nguyên; thiếu bản thì lấp bằng tổ hợp vượt quota, có đánh dấu.
  const AX = ['audience', 'angle', 'narrative', 'duration', 'format'], seen = Object.fromEntries(AX.map(a => [a, {}]));
  const adj = p => p.score - DIVERSITY * AX.reduce((s, a) => s + (seen[a][p[a]] || 0), 0);
  const take = p => { for (const a of AX) seen[a][p[a]] = (seen[a][p[a]] || 0) + 1; };
  const chosen = [], used = {}, left = [...feasible];
  while (chosen.length < target && left.length) {
    let bi = -1;
    for (let i = 0; i < left.length; i++) if ((used[left[i].angle] || 0) < qOf(left[i].angle) && (bi < 0 || adj(left[i]) > adj(left[bi]))) bi = i;
    if (bi < 0) break;
    const [p] = left.splice(bi, 1); chosen.push(p); used[p.angle] = (used[p.angle] || 0) + 1; take(p);
  }
  while (chosen.length < target && left.length) {
    let bi = 0; for (let i = 1; i < left.length; i++) if (adj(left[i]) > adj(left[bi])) bi = i;
    const [p] = left.splice(bi, 1); chosen.push({ ...p, quota_overflow: true }); take(p);
  }
  const angle_distribution = {}; for (const p of chosen) angle_distribution[p.angle] = (angle_distribution[p.angle] || 0) + 1;
  return { theoretical: combos.length, feasible_count: feasible.length, rejected_count: combos.length - feasible.length,
    rejected_reasons: rejected, chosen, proposals, angle_distribution, quota,
    ...(weights?.angle ? { angle_quota: Object.fromEntries(brief.angles.map(a => [a, qOf(a)])) } : {}) };
}

// ---------- ước tính (scale.estimate_plan) ----------
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const secs = it => (it.started && it.finished ? (Date.parse(it.finished) - Date.parse(it.started)) / 1000 : NaN);
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
/** Thời gian mỗi bản đo từ job "variants" đã xong trong queue.json (chỉ đọc): có xuất video và không xuất. */
export function measuredJobTimes(queueFile) {
  const items = (readJ(queueFile, {})?.items || []).filter(it => it.kind === 'variants' && it.state === 'done');
  const per = it => { const n = Math.max(1, +it.result?.n || +it.opts?.n || it.outputs?.length || 1), s = secs(it); return Number.isFinite(s) && s > 0 ? s / n : null; };
  const noExp = items.filter(it => !it.opts?.export).map(per).filter(Boolean), exp = items.filter(it => it.opts?.export).map(per).filter(Boolean);
  const setup = avg(noExp), full = avg(exp);
  return { setup_s: setup, render_s: full != null ? Math.max(0, full - (setup ?? DEFAULTS.setup_s)) : null, jobs: { setup: noExp.length, render: exp.length } };
}
function dirBytes(d, skip = new Set(['out'])) {
  let n = 0;
  const walk = p => { let es; try { es = fs.readdirSync(p, { withFileTypes: true }); } catch { return; } for (const e of es) { const f = path.join(p, e.name); if (e.isDirectory()) { if (!(p === d && skip.has(e.name))) walk(f); } else { try { n += fs.statSync(f).size; } catch { /* file biến mất */ } } } };
  walk(d); return n;
}
function videoMb(dirs) {
  const sizes = [];
  for (const d of dirs) { let fs_ = []; try { fs_ = fs.readdirSync(path.join(d, 'out')).filter(f => f.endsWith('.mp4')); } catch { continue; } for (const f of fs_) { try { sizes.push(fs.statSync(path.join(d, 'out', f)).size / 1e6); } catch { /* bỏ */ } } }
  return avg(sizes);
}
/**
 * o: { dir, tl, target, plan, stats, gate, lib (kho hook), export (bool), queueFile, llmCallS }
 * Giờ LLM: số lần gọi để có đủ hook mới (mỗi hook ≤ 5 bản, mỗi lần ~10 hook) × thời gian một lần (đo trong kho hook nếu có).
 */
export function estimate(o) {
  const { dir, target, plan, stats, lib } = o;
  const queueFile = o.queueFile || path.join(process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio'), 'queue.json');
  const feasible = plan.feasible_count, n = Math.min(target, feasible);
  const warnings = [...(o.gate?.warnings || [])];
  if (feasible < target) warnings.push({ code: 'COMBOS_LOW', severity: 'critical', message: `Chỉ ${feasible} tổ hợp khả thi cho ${target} bản — thêm khán giả/góc/kết cấu/thời lượng/bố cục, gắn thẻ cảnh hoặc thêm nguồn` });
  const hooksNeed = Math.ceil(n / HOOK_REUSE_MAX), hooksHave = lib ? activeHooks(lib).length : 0;
  const hooksNew = Math.max(0, hooksNeed - hooksHave);
  if (hooksNew) warnings.push({ code: 'HOOKS_LOW', severity: 'warning', message: `Cần ≥ ${hooksNeed} hook còn lượt cho ${n} bản (đang có ${hooksHave}) — sẽ sinh thêm ${hooksNew}` });
  const llmTimes = (lib?.stats?.llm_s || []).filter(x => x > 0), llmCall = avg(llmTimes) ?? o.llmCallS ?? DEFAULTS.llm_call_s;
  const calls = Math.ceil(hooksNew / DEFAULTS.hooks_per_call);
  const m = measuredJobTimes(queueFile), setup = m.setup_s ?? DEFAULTS.setup_s, render = m.render_s ?? DEFAULTS.render_s;
  const projMb = dir ? dirBytes(dir) / 1e6 : 0, vid = (dir && videoMb([dir, ...(o.siblings || [])])) ?? DEFAULTS.file_mb;
  const llm_h = calls * llmCall / 3600, build_h = n * setup / 3600, render_h = o.export ? n * render / 3600 : 0;
  return {
    target, feasible_combos: feasible, will_make: n, theoretical: plan.theoretical, rejected_reasons: plan.rejected_reasons,
    source: { have: { sources: stats.sources, scenes: stats.scenes }, need: sourceRequirement(target) },
    hooks: { have: hooksHave, need: hooksNeed, to_generate: hooksNew, reuse_max: HOOK_REUSE_MAX },
    eta: { llm_hours: h2(llm_h), build_hours: h2(build_h), render_hours: h2(render_h), total_hours: h2(llm_h + build_h + render_h),
      per_variant_s: { setup: Math.round(setup), render: Math.round(render), llm_call: Math.round(llmCall) },
      measured: { setup: m.setup_s != null, render: m.render_s != null, llm: llmTimes.length > 0, jobs: m.jobs } },
    disk_gb: Math.round(n * (projMb + (o.export ? vid : 0)) / 1000 * 100) / 100,
    disk_per_variant_mb: { project: Math.round(projMb), video: o.export ? Math.round(vid) : 0 },
    warnings,
  };
}
export function estimateText(e) {
  const m = e.eta.measured, src = k => (m[k] ? 'đo' : 'mặc định');
  return [
    `Mục tiêu ${e.target} bản · ${e.feasible_combos}/${e.theoretical} tổ hợp khả thi · sẽ tạo ${e.will_make}`,
    `Nguồn: ${e.source.have.sources} video, ${e.source.have.scenes} cảnh (cần ≥ ${e.source.need.sources} và ${e.source.need.scenes})`,
    `Hook: còn lượt ${e.hooks.have}, cần ${e.hooks.need}, sinh thêm ${e.hooks.to_generate}`,
    `Thời gian ≈ ${e.eta.total_hours} giờ (LLM ${e.eta.llm_hours} · dựng ${e.eta.build_hours} · xuất ${e.eta.render_hours}); mỗi bản dựng ${e.eta.per_variant_s.setup}s (${src('setup')}), xuất ${e.eta.per_variant_s.render}s (${src('render')}), một lần LLM ${e.eta.per_variant_s.llm_call}s (${src('llm')})`,
    `Dung lượng ≈ ${e.disk_gb} GB (mỗi bản: dự án ${e.disk_per_variant_mb.project} MB + video ${e.disk_per_variant_mb.video} MB)`,
    ...e.warnings.map(w => `${w.severity === 'critical' ? '✗' : '!'} ${w.code}: ${w.message}`),
  ].join('\n');
}
