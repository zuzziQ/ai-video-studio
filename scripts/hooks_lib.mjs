// Thư viện hook (M19): kho câu mở đầu dùng lại được giữa nhiều dự án/phiên bản của cùng một sản phẩm.
// Hook mới sinh bằng LLM (lớp scripts/llm.mjs, task 'text') hoặc bằng mẫu; chỉ vào kho khi
//   - dài 3–16 từ, không có link/@/#,
//   - qua cổng chính sách + claim (gọi scripts/ad_gates.py qua CLI trên một dự án tạm, không có lỗi mức cao),
//   - khác mọi hook đã có trong kho: cosine (unigram + bigram, giống ad_gates.similarity) < 0,5.
// Mỗi hook dùng tối đa 5 bản (HOOK_REUSE_MAX); pickHook chọn hook ít dùng nhất.
// Phần lọc/chọn chuyển từ AI Video Factory services/api/avf/scale.py (dòng 127–196: filter_hooks, generate_hooks,
// pick_hook, mark_hook_used), viết lại cho Studio: kho là file JSON thay cho bảng SQLite. Spec: references/hook-library.md.
//
// usage:
//   node scripts/hooks_lib.mjs gen  <project_dir> [--n 10] [--angle how_to] [--no-llm] [--model sonnet] [--lib file.json]
//   node scripts/hooks_lib.mjs add  <project_dir> "câu hook" [...]        thêm tay (vẫn qua cổng + chống trùng)
//   node scripts/hooks_lib.mjs list <project_dir> [--all]
//   node scripts/hooks_lib.mjs pick <project_dir> [--angle x] [--seed 1] [--use <variant_dir>]
// Kho mặc định: ~/.ai-video-studio/hooks/<khoá>.json, khoá = timeline.ads.product (hồ sơ Product Brain) hoặc tên dự án.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pyBin } from './platform.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HOOK_SIM_MAX = 0.5;    // hook mới phải khác mọi hook đã có
export const HOOK_REUSE_MAX = 5;    // một hook dùng tối đa cho 5 bản
export const HOOK_WORDS = [3, 16];

export const AUDIENCES = {
  new_buyers: 'Người mua lần đầu', sensitive: 'Người cần sự an toàn', busy_professionals: 'Người bận rộn',
  ingredient_focused: 'Quan tâm thành phần', loyal: 'Khách hàng trung thành',
};
export const ANGLES = {
  how_to: 'Hướng dẫn', faq: 'Giải đáp', demo: 'Demo', comparison: 'So sánh', mistakes: 'Sai lầm thường gặp',
  feature: 'Phân tích tính năng', brand_story: 'Câu chuyện thương hiệu', checklist: 'Checklist', qa: 'Q&A', tips: 'Mẹo ứng dụng',
};
const HOOK_PATTERNS = [
  'Bạn đã biết cách dùng {name} đúng chưa?', '3 điều nên biết trước khi dùng {name}',
  'Đừng dùng {name} nếu chưa xem hết video này', 'Sai lầm phổ biến nhất khi dùng {name}',
  'Nếu bạn là {aud}, đây là cách mình dùng {name}', 'Câu hỏi mình nhận nhiều nhất về {name}',
  'Một ngày của mình với {name} trông như thế này', '{usp} — nghe đơn giản nhưng ít ai để ý',
  'Mình đã đổi cách dùng {name} sau khi biết điều này', 'Checklist 30 giây trước khi chọn {name}',
  'Điều mình ước biết sớm hơn về {name}', 'Thử trả lời nhanh: bạn dùng {name} lúc nào trong ngày?',
];
const HOOK_SYSTEM = 'Bạn viết câu mở đầu (hook) 1–2 giây cho video quảng cáo ngắn tiếng Việt. Chỉ dùng thông tin trong PRODUCT BRAIN. '
  + 'Hook không được nêu lợi ích/công dụng chưa có trong CLAIMS ĐÃ DUYỆT, không hứa kết quả, không so sánh trước/sau, '
  + 'không giật tít sai, không nói về ngoại hình hay tình trạng của người xem. Hook được phép: đặt câu hỏi, nêu tình huống '
  + 'sử dụng, nêu sai lầm khi dùng, nêu một điều ít người biết về cách dùng, kể trải nghiệm trung tính. '
  + 'Mỗi hook phải khác hẳn nhau về cấu trúc câu và ý. Tiếng Việt có dấu đúng chính tả.';

// ---------- độ giống (cùng công thức với ad_gates.py: norm → token → unigram + bigram → cosine) ----------
export const norm = s => String(s || '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}_\s%]/gu, ' ');
export const tokens = s => norm(s).split(/\s+/).filter(Boolean);
function vec(s) {
  const t = tokens(s), m = new Map();
  for (const k of [...t, ...t.slice(1).map((b, i) => t[i] + '_' + b)]) m.set(k, (m.get(k) || 0) + 1);
  return m;
}
export function similarity(a, b) {
  const va = vec(a), vb = vec(b);
  if (!va.size || !vb.size) return 0;
  let dot = 0; for (const [k, v] of va) if (vb.has(k)) dot += v * vb.get(k);
  const n = m => Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0));
  return Math.round(dot / (n(va) * n(vb)) * 1000) / 1000;
}
export const cleanHook = h => String(h || '').split(/\s+/).join(' ').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
export function hookOk(text) {
  const n = text.split(/\s+/).filter(Boolean).length;
  return n >= HOOK_WORDS[0] && n <= HOOK_WORDS[1] && !/https?:\/\/|@|#/.test(text);
}

// ---------- kho JSON ----------
const HOME = () => process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio');
export const libKey = s => String(s || 'chung').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'chung';
export const libPath = key => path.join(HOME(), 'hooks', libKey(key) + '.json');
export function loadLib(file, key = path.basename(file, '.json')) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (j && Array.isArray(j.hooks)) return { version: 1, key, ...j, file };
  } catch { /* chưa có kho hoặc hỏng: bắt đầu kho rỗng */ }
  return { version: 1, key, hooks: [], file };
}
export function saveLib(lib) {
  const { file, ...data } = lib;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...data, updated: new Date().toISOString() }, null, 1));
  fs.renameSync(tmp, file);   // ghi nguyên tử: tiến trình khác đọc giữa chừng không thấy file cụt
  return lib;
}
const hookId = text => 'h' + crypto.createHash('sha1').update(norm(text).split(/\s+/).join(' ')).digest('hex').slice(0, 10);
export const useCount = h => (h.used || []).length;

// ---------- lọc (scale.filter_hooks) ----------
/**
 * cands: chuỗi ứng viên; existing: chữ các hook đã có; gate(texts) → [{ok, reasons[]}] (cổng chính sách + claim).
 * → { kept: [chữ], rejected: { 'độ dài': n, 'chính sách/claim': n, 'trùng hook đã có': n }, reasons: [{text, why}] }
 */
export async function filterHooks(cands, existing, gate) {
  const rejected = {}, reasons = [], bump = (k, text, why) => { rejected[k] = (rejected[k] || 0) + 1; reasons.push({ text, why: why || k }); };
  const sized = [];
  for (const raw of cands) { const h = cleanHook(raw); if (!h) continue; if (!hookOk(h)) bump('độ dài', h); else sized.push(h); }
  const verdict = sized.length && gate ? await gate(sized) : sized.map(() => ({ ok: true }));
  const pool = [...existing], kept = [];
  sized.forEach((h, i) => {
    if (!verdict[i]?.ok) return bump('chính sách/claim', h, (verdict[i]?.reasons || []).join('; '));
    const near = pool.find(e => similarity(h, e) >= HOOK_SIM_MAX);
    if (near != null) return bump('trùng hook đã có', h, `giống “${near}” (${similarity(h, near)})`);
    kept.push(h); pool.push(h);
  });
  return { kept, rejected, reasons };
}

// ---------- cổng chính sách + claim: ad_gates.py trên một dự án tạm, mỗi hook là một scene chữ ----------
const SLOT = 10; // giây giữa hai hook trong dự án tạm (ad_gates trả lỗi theo t)
/** ads: { claims, blocked, industry, platforms } như timeline.ads. → [{ok, reasons}] cùng thứ tự texts. */
export async function gateHooks(texts, ads = {}, { py = pyBin(SKILL), script = path.join(SKILL, 'scripts/ad_gates.py') } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-hookgate-'));
  try {
    const tl = { width: 1080, height: 1920, duration: texts.length * SLOT, captions: [],
      ads: { on: true, claims: ads.claims || [], blocked: ads.blocked || [], ...(ads.industry ? { industry: ads.industry } : {}), ...(ads.platforms ? { platforms: ads.platforms } : {}) },
      scenes: texts.map((t, i) => ({ type: 'text', t0: i * SLOT, t1: i * SLOT + 2, text: t })) };
    fs.writeFileSync(path.join(tmp, 'timeline.json'), JSON.stringify(tl));
    const out = await new Promise((ok, bad) => {
      const p = spawn(py, ['-I', '-X', 'utf8', script, tmp], { stdio: ['ignore', 'pipe', 'pipe'] });
      let o = '', e = ''; p.stdout.on('data', d => (o += d)); p.stderr.on('data', d => (e += d));
      p.on('error', err => bad(new Error(`không chạy được ${py}: ${err.message}`)));
      p.on('close', c => (c ? bad(new Error(`ad_gates.py lỗi (mã ${c}): ${e.slice(-300)}`)) : ok(o)));
    });
    const res = JSON.parse(out), v = texts.map(() => ({ ok: true, reasons: [] }));
    for (const it of res.issues || []) {
      if (it.severity !== 'high' || it.kind === 'ad_originality') continue;
      const i = Math.round(it.t / SLOT); if (!v[i]) continue;
      v[i].ok = false; v[i].reasons.push(`${it.code}: ${String(it.msg || '').replace(/ \(chữ trên màn hình: .*$/, '')}`);
    }
    return v;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------- sinh hook (scale.generate_hooks) ----------
function seeded(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
/** Hook dựng sẵn từ mẫu: ctx { name, usp, audiences: [mã hoặc chữ] }. */
export function templateHooks(ctx, seed = 0) {
  const rnd = seeded(seed + 1), name = ctx.name || 'sản phẩm này';
  const auds = (ctx.audiences?.length ? ctx.audiences : Object.keys(AUDIENCES)).map(a => (AUDIENCES[a] || a).toLowerCase());
  return HOOK_PATTERNS.map(p => p.replaceAll('{name}', name).replaceAll('{aud}', auds[Math.floor(rnd() * auds.length)]).replaceAll('{usp}', ctx.usp || name));
}
export function hookPrompt(ctx, existing, n, angle) {
  const approved = (ctx.claims || []).filter(c => (c.status || 'approved') === 'approved');
  return `${HOOK_SYSTEM}

PRODUCT BRAIN
Tên: ${ctx.name || '(chưa có)'}${ctx.category ? ` | Danh mục: ${ctx.category}` : ''}
USP: ${ctx.usp || ''}
${ctx.usage ? `Hướng dẫn: ${ctx.usage}\n` : ''}CLAIMS ĐÃ DUYỆT:
${approved.map(c => `- ${c.text}`).join('\n') || '- (chưa có: không nêu lợi ích nào)'}
${(ctx.faq || []).length ? `FAQ:\n${ctx.faq.slice(0, 6).map(f => `- ${f.q || f}`).join('\n')}\n` : ''}${(ctx.blocked || []).length ? `CỤM TỪ CẤM: ${ctx.blocked.join(', ')}\n` : ''}${angle ? `GÓC NỘI DUNG: ${ANGLES[angle] || angle}\n` : ''}HOOK ĐÃ CÓ (phải khác hẳn):
${existing.slice(-30).map(e => `- ${e}`).join('\n') || '- (chưa có)'}

Viết ${n * 2} hook, mỗi hook ${HOOK_WORDS[0]}–${HOOK_WORDS[1]} từ. Chỉ trả về JSON: {"hooks": ["…", "…"]}`;
}

/**
 * Thêm tối đa n hook mới vào kho. o: { n, angle, useLlm, model, gate, ask, seed }
 *  gate(texts) mặc định gateHooks(texts, ctx); ask(prompt, opts) mặc định askJSON của llm.mjs (task 'text').
 * → { created, rejected, reasons, source, hooks: [hook mới], total_active }
 */
export async function generateHooks(lib, ctx, o = {}) {
  const n = Math.max(1, Math.min(50, +o.n || 10)), angle = o.angle || null;
  const existing = lib.hooks.map(h => h.text);
  let cands = [], source = 'template', llmError = null;
  if (o.useLlm !== false) {
    try {
      const ask = o.ask || (await import('./llm.mjs')).askJSON;
      cands = await ask(hookPrompt(ctx, existing, n, angle), {
        task: 'text', model: o.model || 'sonnet', cwd: os.tmpdir(), timeout: 180000, shape: 'object', retries: 1,
        validate: v => { const hs = (Array.isArray(v?.hooks) ? v.hooks : []).map(String).filter(s => s.trim()); if (hs.length < 3) throw new Error('cần mảng "hooks" ≥ 3 câu'); return hs; },
      });
      source = 'llm';
    } catch (e) { llmError = e.message; cands = []; }
  }
  if (!cands.length) { cands = templateHooks(ctx, (o.seed ?? 0) + existing.length); source = 'template'; }
  const gate = o.gate || (texts => gateHooks(texts, ctx));
  const { kept, rejected, reasons } = await filterHooks(cands, existing, gate);
  const now = new Date().toISOString();
  const added = kept.slice(0, n).map(text => ({ id: hookId(text), text, angle, source, status: 'active', created: now, used: [] }));
  lib.hooks.push(...added);
  return { created: added.length, rejected, reasons, source, ...(llmError ? { llm_error: llmError } : {}), hooks: added, total_active: activeHooks(lib).length };
}

// ---------- chọn và đánh dấu (scale.pick_hook / mark_hook_used) ----------
export const activeHooks = (lib, angle = null) => lib.hooks.filter(h => h.status !== 'retired' && useCount(h) < HOOK_REUSE_MAX && (!angle || !h.angle || h.angle === angle));
/** Hook ít dùng nhất cho góc này (ưu tiên `preferred` = hook thắng nếu có); hết hook còn lượt thì null. */
export function pickHook(lib, { angle = null, seed = 0, preferred = null, exclude = [] } = {}) {
  let hooks = activeHooks(lib, angle).filter(h => !exclude.includes(h.id));
  if (!hooks.length) return null;
  if (preferred?.length) { const p = hooks.filter(h => preferred.includes(h.id)); if (p.length) hooks = p; }
  const low = Math.min(...hooks.map(useCount)), cands = hooks.filter(h => useCount(h) === low);
  return cands[Math.floor(seeded(seed + 7)() * cands.length)];
}
export function markUsed(lib, id, variantDir) {
  const h = lib.hooks.find(x => x.id === id);
  if (!h) throw new Error(`không có hook ${id} trong kho`);
  if (useCount(h) >= HOOK_REUSE_MAX) throw new Error(`hook “${h.text}” đã dùng đủ ${HOOK_REUSE_MAX} bản`);
  h.used = [...(h.used || []), { dir: variantDir ? path.resolve(variantDir) : null, at: new Date().toISOString() }];
  return h;
}

// ---------- ngữ cảnh từ dự án ----------
/** Đọc timeline.ads (+ hồ sơ Product Brain nếu ads.product trỏ tới một file có thật) thành ngữ cảnh sinh hook. */
export function projectContext(dir) {
  const tl = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  const ads = tl.ads && typeof tl.ads === 'object' ? tl.ads : {};
  let prod = {};
  if (typeof ads.product === 'string' && ads.product) {
    for (const f of [path.join(HOME(), 'products', libKey(ads.product) + '.json'), path.join(HOME(), 'products', ads.product + '.json')]) {
      try { prod = JSON.parse(fs.readFileSync(f, 'utf8')) || {}; break; } catch { /* chưa có hồ sơ */ }
    }
  }
  const claims = [...(Array.isArray(prod.claims) ? prod.claims : []), ...(Array.isArray(ads.claims) ? ads.claims : [])]
    .filter(c => c && String(c.text || '').trim()).map((c, i) => ({ id: String(c.id || `c${i + 1}`), text: String(c.text), status: c.status || 'approved' }));
  return {
    key: ads.product || path.basename(path.resolve(dir)),
    name: prod.name || ads.name || tl.brand?.name || tl.title || path.basename(path.resolve(dir)),
    category: prod.category || '', usp: prod.usp || ads.usp || '', usage: prod.usage || '',
    audiences: prod.audiences || ads.audiences || [], faq: prod.faq || prod.faqs || [],
    claims, blocked: [...(prod.blocked || []), ...(ads.blocked || [])].map(String),
    industry: ads.industry || prod.industry || undefined, platforms: ads.platforms || undefined,
  };
}

// ---------- CLI ----------
async function main() {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const VAL = new Set(['--n', '--angle', '--model', '--lib', '--seed', '--use']);
  const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && VAL.has(args[i - 1])));
  const [cmd, dir, ...rest] = pos;
  if (!['gen', 'add', 'list', 'pick'].includes(cmd) || !dir) {
    console.error('usage: node scripts/hooks_lib.mjs gen|add|list|pick <project_dir> [--n 10] [--angle x] [--no-llm] [--lib file.json] [--seed n] [--use <variant_dir>]');
    process.exit(2);
  }
  const ctx = projectContext(dir), file = opt('--lib') || libPath(ctx.key), lib = loadLib(file, libKey(ctx.key));
  const show = h => `${h.id}  [${useCount(h)}/${HOOK_REUSE_MAX}]${h.angle ? ` (${h.angle})` : ''} ${h.status === 'retired' ? '(ngừng) ' : ''}${h.text}`;
  if (cmd === 'list') {
    for (const h of lib.hooks.filter(h => args.includes('--all') || activeHooks(lib).includes(h))) console.log(show(h));
    console.log(`kho: ${file} · còn lượt ${activeHooks(lib).length}/${lib.hooks.length}`);
  } else if (cmd === 'pick') {
    const h = pickHook(lib, { angle: opt('--angle'), seed: +opt('--seed', 0) });
    if (!h) { console.error(`Hết hook còn lượt dùng trong ${file}. Chạy "gen" để sinh thêm.`); process.exit(3); }
    if (opt('--use')) { markUsed(lib, h.id, opt('--use')); saveLib(lib); }
    console.log(JSON.stringify(h));
  } else {
    const r = cmd === 'add'
      ? await (async () => { const f = await filterHooks(rest, lib.hooks.map(h => h.text), t => gateHooks(t, ctx)); const now = new Date().toISOString();
        const hooks = f.kept.map(text => ({ id: hookId(text), text, angle: opt('--angle') || null, source: 'manual', status: 'active', created: now, used: [] }));
        lib.hooks.push(...hooks); return { ...f, created: hooks.length, hooks, source: 'manual' }; })()
      : await generateHooks(lib, ctx, { n: +opt('--n', 10), angle: opt('--angle'), useLlm: !args.includes('--no-llm'), model: opt('--model'), seed: +opt('--seed', 0) });
    saveLib(lib);
    for (const h of r.hooks) console.log('+ ' + show(h));
    for (const x of r.reasons) console.log(`- bỏ: ${x.text} — ${x.why}`);
    if (r.llm_error) console.error(`[hooks] LLM lỗi, dùng mẫu: ${r.llm_error}`);
    console.log(`kho: ${file} · thêm ${r.created} (${r.source}) · bỏ ${JSON.stringify(r.rejected)}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) main().catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
