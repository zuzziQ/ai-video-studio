// Phong cách dựng của từng thương hiệu (S19 M133, trước là "hồ sơ kênh") cho Tự lái: ~/.ai-video-studio/styles.json (AVS_HOME đổi được),
// chuyển một lần từ profiles.json (giữ file cũ), cộng "Học từ chỉnh sửa". Spec: references/autopilot.md. CLI:
//   node scripts/profile.mjs list | show <id> | default <id> | learn <project_dir> | reset-learned <id>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { retryBusy, withFileLock } from './file_lock.mjs';
import { workspaceOfProject } from './workspace.mjs';

export const AVS_HOME = process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio');
const FILE = path.join(AVS_HOME, 'styles.json'), LOCK = FILE + '.lock', OLD = path.join(AVS_HOME, 'profiles.json'), BRANDS = path.join(AVS_HOME, 'brands.json');

export const DEFAULT_PROFILE = {
  id: 'mac-dinh', name: 'Mặc định',
  brand: '',                 // brand kit id (~/.ai-video-studio/brands.json), '' = none
  pack: 'auto',              // 'auto' = AI chọn · 'keep' · pack id
  template: '',              // template id (templates/*.json) instead of AI dựng giúp; '' = AI
  caption_style: '',         // force a caption style ('' = what the pack/AI chooses)
  goal: 'Chia sẻ', tone: 'Tự nhiên, gần gũi', ai_density: 'vua', extra: '',
  ai: true,                  // AI dựng giúp (claude -p)
  broll_density: 'vua',      // off | thua | vua | day | ratday
  broll_src: ['preset', 'hf', 'text', 'emoji', 'logo', 'aroll', 'lib'],
  broll_goal: 'auto',
  broll_claude: false,
  sound: 'vua',              // off | nhe | vua | phongphu  (auto_sfx.py --level)
  music: 'auto',             // auto (AI's pick, else a bed per section) | off | <mood>
  clean: 'vua',              // off | nhe | vua | manh  (TL.audio.clean)
  fillers: true, fillers_claude: false,
  whisper: 'large-v3-turbo', lang: 'vi', orient: 'auto',
  aspects: ['9:16'],         // formats to deliver; the native one is always rendered
  quality: '1080',
  qc: true,                  // A2's scripts/ai_qc.mjs --fix when present
  cta: '',                   // call to action (outro + publish texts)
  platforms: ['tiktok', 'youtube', 'facebook'],
  slot: '19:00',             // default schedule slot (Lịch đăng, A4)
  learn: true,               // learn from the user's edits of autopilot projects
  learned: null,
};
const STEPS_DENS = ['off', 'thua', 'vua', 'day', 'ratday'];
const STEPS_SOUND = ['off', 'nhe', 'vua', 'phongphu'];
const STEPS_AI = ['thua', 'vua', 'day'];

// ---------- Phong cách dựng theo thương hiệu (S19 M133) ----------
// styles.json: { version, default, styles: { chung: {...}, <brand id>: {...} }, aliases: { <id hồ sơ cũ>: <id phong cách> }, migrated }
// Mỗi thương hiệu một phong cách (id = id thương hiệu), "chung" = không thương hiệu. Thương hiệu chưa lưu phong cách thì
// mượn các trường của Chung (không mượn điều đã học / phản hồi). Ghi luôn dưới khoá styles.json.lock (Studio, hàng đợi,
// Telegram, CLI cùng ghi). Lần đầu chạy: chuyển từ profiles.json (giữ nguyên file cũ).
export const CHUNG = 'chung';
const FIELDS = Object.keys(DEFAULT_PROFILE).filter(k => !['id', 'name', 'brand', 'learned'].includes(k));
const pickFields = (src = {}) => Object.fromEntries(FIELDS.filter(k => k in src).map(k => [k, src[k]]));
const brandList = () => { try { const b = JSON.parse(fs.readFileSync(BRANDS, 'utf8')).brands; return Array.isArray(b) ? b.filter(x => x && x.id) : []; } catch { return []; } };
const brandName = b => b?.title || b?.name || b?.id || '';
function writeAtomic(f, obj) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  try { retryBusy(() => fs.renameSync(tmp, f)); } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
}
// null = chưa có file. File hỏng thì ném lỗi: không coi là rỗng rồi ghi đè điều đã học (bài học queue.json, ai-video-studio-005).
function readRaw() {
  let txt; try { txt = retryBusy(() => fs.readFileSync(FILE, 'utf8'), 20); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  try { return JSON.parse(txt); } catch { throw new Error(`styles.json hỏng (${FILE}): sửa tay hoặc xoá để chuyển lại từ profiles.json`); }
}
const stamp = p => p.updated || p.created || '';
const trimProjects = projects => Object.fromEntries(Object.entries(projects).sort((a, b) => (b[1].t || '').localeCompare(a[1].t || '')).slice(0, 20));
// profiles.json → styles. Hồ sơ có brand (còn trong brands.json) → phong cách của thương hiệu đó, không có → Chung.
// Nhiều hồ sơ cùng chỗ: lấy hồ sơ mặc định, không thì hồ sơ sửa gần nhất; điều đã học của cả nhóm gộp lại (khoá theo dự án, không đếm đôi).
export function migrateProfiles(old, brands = brandList()) {
  const profs = Array.isArray(old?.profiles) ? old.profiles.filter(p => p && typeof p === 'object' && typeof p.id === 'string') : [];
  const ids = new Map(brands.map(b => [b.id, b])), notes = [], groups = new Map();
  const s = { version: 1, default: CHUNG, styles: {}, aliases: {}, migrated: profs.length ? { at: new Date().toISOString(), from: 'profiles.json', notes } : null };
  for (const p of profs) {
    const key = p.brand && ids.has(p.brand) ? p.brand : CHUNG;
    if (p.brand && !ids.has(p.brand)) notes.push(`Hồ sơ “${p.name || p.id}” gắn thương hiệu đã xoá (${p.brand}) → Chung`);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p); s.aliases[p.id] = key;
  }
  for (const [key, list] of groups) {
    const pick = list.find(p => p.id === old.default) || [...list].sort((a, b) => stamp(b).localeCompare(stamp(a)))[0];
    const st = { ...pickFields({ ...DEFAULT_PROFILE, ...pick }), from: pick.id };
    if (stamp(pick)) st.updated = stamp(pick);
    if (pick.fb) st.fb = pick.fb;
    const projects = {};
    for (const p of [...list.filter(x => x !== pick), pick]) Object.assign(projects, p.learned?.projects || {});
    if (Object.keys(projects).length) st.learned = { projects: trimProjects(projects), updated: Object.values(projects).map(o => o.t || '').sort().pop() };
    s.styles[key] = st;
    if (list.length > 1) notes.push(`${key === CHUNG ? 'Chung' : `Thương hiệu “${brandName(ids.get(key))}”`} có ${list.length} hồ sơ (${list.map(p => p.name || p.id).join(', ')}): lấy “${pick.name || pick.id}” (${pick.id === old.default ? 'hồ sơ mặc định' : 'sửa gần nhất'}), gộp điều đã học của cả nhóm; bản cũ vẫn trong profiles.json`);
  }
  if (old?.default && s.aliases[old.default]) s.default = s.aliases[old.default];
  return s;
}
function normalize(s) {
  if (!s || typeof s !== 'object') s = {};
  if (!s.styles || typeof s.styles !== 'object') s.styles = {};
  if (!s.styles[CHUNG]) s.styles[CHUNG] = {};
  if (!s.aliases || typeof s.aliases !== 'object') s.aliases = {};
  if (!s.aliases[DEFAULT_PROFILE.id]) s.aliases[DEFAULT_PROFILE.id] = CHUNG; // 'mac-dinh': id hồ sơ mặc định cũ, có trong autopilot.json / queue.json cũ
  if (typeof s.default !== 'string' || !s.default) s.default = CHUNG;
  return s;
}
// Đọc cho lần chuyển (chỉ chạy một lần, ghi nhầm là vĩnh viễn): chưa có file = null; file bận (Windows) thử lại; hỏng / lỗi khác
// thì ném lỗi và không ghi styles.json (review M133: brands.json bận lúc chuyển từng làm hồ sơ có thương hiệu rơi về Chung).
function readStrict(f) {
  let txt; try { txt = retryBusy(() => fs.readFileSync(f, 'utf8'), 20); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  try { return JSON.parse(txt); } catch { throw new Error(`${path.basename(f)} hỏng (${f}): chưa chuyển hồ sơ kênh sang thương hiệu`); }
}
const fresh = () => { const b = readStrict(BRANDS)?.brands; return migrateProfiles(readStrict(OLD), Array.isArray(b) ? b.filter(x => x && x.id) : []); };
export function loadStyles() {
  let s = readRaw();
  if (!s) { // lần đầu: chuyển một lần, ghi trong khoá (tiến trình khác có thể vừa ghi xong)
    s = withFileLock(LOCK, () => { const cur = readRaw(); if (cur) return cur; const m = normalize(fresh()); writeAtomic(FILE, m); return m; });
  }
  return normalize(s);
}
// Đọc-sửa-ghi trong khoá; fn ném lỗi thì không ghi.
export function mutateStyles(fn) { return withFileLock(LOCK, () => { const s = normalize(readRaw() || fresh()); const r = fn(s); writeAtomic(FILE, s); return r; }); }
// Id phong cách từ id thương hiệu, 'chung' / '__none', id hồ sơ cũ (--profile, queue.json, autopilot.json) hoặc ''/undefined (mặc định).
// null = không biết. Thương hiệu đã xoá → Chung.
export function resolveStyleId(ref, s = loadStyles(), brands = brandList()) {
  const has = id => id === CHUNG || brands.some(b => b.id === id);
  if (ref == null || ref === '') return has(s.default) ? s.default : CHUNG;
  ref = String(ref);
  if (ref === CHUNG || ref === '__none') return CHUNG;
  if (brands.some(b => b.id === ref)) return ref;
  if (Object.hasOwn(s.aliases, ref)) return has(s.aliases[ref]) ? s.aliases[ref] : CHUNG;
  if (Object.hasOwn(s.styles, ref)) return CHUNG; // phong cách còn lại của thương hiệu đã xoá
  return null;
}
// Thương hiệu chưa lưu phong cách: các trường của Chung (không mượn learned / fb)
const baseOf = (s, id) => s.styles[id] || (id === CHUNG ? {} : pickFields(s.styles[CHUNG]));
function view(s, id, brands) {
  const st = baseOf(s, id), b = brands.find(x => x.id === id);
  return { ...DEFAULT_PROFILE, ...pickFields(st), learned: s.styles[id]?.learned || null, ...(s.styles[id]?.fb ? { fb: s.styles[id].fb } : {}),
    id, brand: id === CHUNG ? '' : id, name: id === CHUNG ? 'Chung' : brandName(b), saved: !!s.styles[id], updated: s.styles[id]?.updated };
}
// Danh sách kiểu cũ {default, profiles} (queue khoInboxes, Telegram, Agent, phản hồi): Chung trước, rồi từng thương hiệu.
export function loadStore() {
  const s = loadStyles(), brands = brandList();
  return { version: 2, default: resolveStyleId('', s, brands), aliases: { ...s.aliases }, migrated: s.migrated || null, profiles: [view(s, CHUNG, brands), ...brands.map(b => view(s, b.id, brands))] };
}
// Ghi lại các phong cách đã đổi trong một store kiểu cũ (feedback.mjs đặt p.fb / đổi trường). Ghi cả các trường của bản đọc:
// gọi ngay sau loadStore (không giữ bản đọc qua await), kẻo hoàn tác chỉnh sửa làm ở Studio giữa chừng. learned không ghi ở đây:
// chỉ learnFromProject / resetLearned đụng tới nó, nên một bản đọc cũ không xoá được điều vừa học.
export function saveStore(store) {
  return mutateStyles(s => {
    const brands = brandList();
    for (const p of store?.profiles || []) {
      const id = resolveStyleId(p.id, s, brands); if (!id) continue;
      const cur = view(s, id, brands), next = { ...pickFields(p), ...(p.fb ? { fb: p.fb } : {}) };
      if (JSON.stringify([pickFields(cur), cur.fb || null]) === JSON.stringify([pickFields({ ...cur, ...next }), next.fb || cur.fb || null])) continue;
      s.styles[id] = { ...baseOf(s, id), ...next, learned: s.styles[id]?.learned || null, updated: new Date().toISOString() };
    }
  });
}
const notFound = ref => Object.assign(new Error(`Không có thương hiệu / phong cách "${ref}"`), { status: 404 });
export function getProfile(ref) {
  const s = loadStyles(), brands = brandList(), id = resolveStyleId(ref, s, brands);
  if (!id) throw notFound(ref);
  return view(s, id, brands);
}
const CLEAN = (src, cur = {}) => {
  const o = { ...cur };
  for (const k of FIELDS) if (k in src) o[k] = src[k];
  for (const k of ['broll_src', 'aspects', 'platforms']) if (typeof o[k] === 'string') o[k] = o[k].split(',').map(x => x.trim()).filter(Boolean);
  for (const k of ['ai', 'fillers', 'fillers_claude', 'broll_claude', 'qc', 'learn']) if (k in o) o[k] = !!o[k];
  if ('cta' in o) o.cta = String(o.cta || '').slice(0, 200);
  if ('extra' in o) o.extra = String(o.extra || '').slice(0, 600);
  // S19 M138: 'kho:<rel>' = một bài trong Kho; rel tương đối, không thoát ra ngoài (kho_media.resolveRel kiểm lại khi dùng)
  if ('music' in o) { const m = String(o.music || 'auto').slice(0, 300).replace(/\\/g, '/'); o.music = /^kho:/.test(m) && (m.length <= 4 || m.slice(4).split('/').some(x => x === '..' || x.startsWith('.')) || /^[a-z]:|^\//i.test(m.slice(4))) ? 'kho' : m; }
  return o;
};
// Lưu phong cách dựng của một thương hiệu (src.id = id thương hiệu / 'chung' / id hồ sơ cũ). Không tạo "hồ sơ" mới nữa.
export function upsertProfile(src = {}) {
  return mutateStyles(s => {
    const brands = brandList(), id = src.id == null || src.id === '' ? null : resolveStyleId(src.id, s, brands);
    if (!id) throw notFound(src.id ?? '');
    s.styles[id] = { ...CLEAN(src, baseOf(s, id)), learned: s.styles[id]?.learned || null, ...(s.styles[id]?.fb ? { fb: s.styles[id].fb } : {}), updated: new Date().toISOString() };
    return view(s, id, brands);
  });
}
// Sửa trực tiếp phong cách (fn(style, id) đổi tại chỗ); thương hiệu chưa lưu thì bắt đầu từ các trường của Chung.
export function patchStyle(ref, fn) {
  return mutateStyles(s => {
    const brands = brandList(), id = resolveStyleId(ref, s, brands); if (!id) throw notFound(ref);
    const st = s.styles[id] || (s.styles[id] = { ...baseOf(s, id) });
    fn(st, id); return view(s, id, brands);
  });
}
// Xoá thương hiệu (51_brands) → bỏ phong cách của nó, để lại bí danh id → Chung: mục cũ trong queue.json / autopilot.json /
// Telegram còn mang id thương hiệu này vẫn chạy (theo Chung) thay vì báo lỗi. Id hồ sơ cũ trỏ tới nó cũng về Chung.
export const deleteStyle = id => mutateStyles(s => { if (typeof id === 'string' && id && id !== CHUNG) { delete s.styles[id]; s.aliases[id] = CHUNG; } return true; });
export function setDefault(ref) { return mutateStyles(s => { const id = ref == null || ref === '' ? null : resolveStyleId(ref, s); if (!id) throw notFound(ref ?? ''); s.default = id; return true; }); }
export const resetLearned = ref => patchStyle(ref, st => { st.learned = null; });

// ---------- "Học từ chỉnh sửa" ----------
// Observation of ONE project where AI inserted things: what AI delivered (.studio/ai_result.json — AI dựng, Tự động, Tự lái;
// projects from before S19 M134: .studio/autopilot_result.json) vs the timeline the user saved.
// scenes AI inserted: b-roll pass (_auto) and AI dựng giúp (_ai, except long _base backgrounds)
const KIND = s => s.type === 'emoji_pop' ? 'emoji' : s.type === 'text' ? 'text' : s.type === 'photo' ? 'photo' : 'preset';
const MINE = s => (s._auto || s._ai) && !s._base;
// S19 M134: câu khẳng định (claim) trong graphic AI chèn: số %, "nhất", "số 1", cam kết / đảm bảo, chữa khỏi…
export const CLAIM = /\d\s*%|\bnhất\b|số\s*1\b|cam\s*kết|đảm\s*bảo|tuyệt\s*đối|100\s*%|chữa\s*(khỏi|dứt)|khỏi\s*hẳn|hiệu\s*quả\s*ngay|không\s*tác\s*dụng\s*phụ|rẻ\s*nhất|tốt\s*nhất/i;
const strings = (o, out = [], d = 0) => {
  if (d > 4 || out.length > 20) return out;
  if (typeof o === 'string') { if (o.trim() && o.length <= 200) out.push(o.trim()); }
  else if (Array.isArray(o)) for (const x of o) strings(x, out, d + 1);
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!/^(_|src|file|url|icon|font|color|bg|type|anim|kind|pos|align)/i.test(k)) strings(v, out, d + 1);
  return out;
};
const claimsOf = tl => (tl.scenes || []).filter(MINE).flatMap(s => strings({ text: s.text, title: s.title, params: s.params })).filter(t => CLAIM.test(t));
// một từ của phụ đề: bỏ dấu câu ở hai đầu (giống cleanSide của dict.mjs)
const bare = w => String(w || '').normalize('NFC').trim().replace(/^[,.!?:;"'“”…()[\]-]+|[,.!?:;"'“”…()[\]-]+$/g, '').trim();
// Chữ phụ đề bị sửa: ghép từng dòng (cùng t0, cùng số từ), từng từ khác nhau → cặp [sai, đúng] (≤ 40)
export function captionFixes(before = [], after = []) {
  const out = [], seen = new Set();
  if (!Array.isArray(before) || !Array.isArray(after)) return out;
  for (const c of after) {
    const b = before.find(x => Math.abs((x.t0 ?? -9) - (c.t0 ?? -1)) < .05 && (x.words || []).length === (c.words || []).length);
    if (!b) continue;
    c.words.forEach((w, j) => {
      const f = bare(b.words[j]?.w), t = bare(w?.w);
      if (!f || !t || f === t || f.length > 40 || t.length > 40 || /[=;]/.test(f + t)) return;
      const k = f.toLocaleLowerCase('vi') + '\u0000' + t;
      if (!seen.has(k) && out.length < 40) { seen.add(k); out.push([f, t]); }
    });
  }
  return out;
}
const ctaOf = tl => String(tl?.brand?.outro || '').trim();
// extra (S19 M134, không bắt buộc): { capsBefore, capsAfter } — giữ chữ ký cũ observe(before, after)
export function observe(before, after, extra = {}) {
  const count = (tl, pred) => (tl.scenes || []).filter(pred);
  const o = { auto: {}, ai: [0, 0], sfx: [0, 0], moved: 0 };
  for (const k of ['emoji', 'text', 'photo', 'preset']) o.auto[k] = [count(before, s => MINE(s) && KIND(s) === k).length, count(after, s => MINE(s) && KIND(s) === k).length];
  o.moved = count(after, s => (s._auto || s._ai) && s._orig).length;
  o.ai = [count(before, s => s._ai && !s._base).length, count(after, s => s._ai && !s._base).length];
  const sfxN = tl => (tl.audio?.sfx || []).filter(x => x._auto || x._ai).length;
  o.sfx = [sfxN(before), sfxN(after)];
  const mus = tl => (tl.audio?.music || []).filter(m => !m.hidden && !m.mute);
  o.music = { before: mus(before).length, after: mus(after).length, gain: mus(after).length && mus(before).length ? +(mus(after)[0].gain ?? -20) - +(mus(before)[0].gain ?? -20) : 0 };
  if ((after.caption_style || '') !== (before.caption_style || '')) o.caption_style = after.caption_style || '';
  if ((after.pack || '') !== (before.pack || '')) o.pack = after.pack || '';
  // S19 M134: lời kết / CTA đổi, câu khẳng định của AI bị xoá, chữ phụ đề bị sửa
  if (ctaOf(after) && ctaOf(after) !== ctaOf(before)) o.cta = ctaOf(after).slice(0, 200);
  const cb = claimsOf(before), ca = new Set(claimsOf(after));
  if (cb.length) o.claims = [cb.length, cb.filter(t => ca.has(t)).length, cb.filter(t => !ca.has(t)).slice(0, 3)];
  const fx = captionFixes(extra.capsBefore, extra.capsAfter);
  if (fx.length) o.words = fx;
  o.edited = !!fx.length || JSON.stringify({ s: after.scenes, a: after.audio, c: after.caption_style, p: after.pack, b: ctaOf(after) }) !== JSON.stringify({ s: before.scenes, a: before.audio, c: before.caption_style, p: before.pack, b: ctaOf(before) });
  return o;
}
// Aggregate the newest ≤ 10 observations into small, explainable adjustments.
// S19 M134: mỗi điều là một "thói quen" có khoá (items[]) — learned.off[] tắt hẳn, learned.forgot{khoá: thời điểm} quên các
// quan sát trước thời điểm đó (học lại được từ video mới), opts.skip tắt cho riêng một lần chạy (panel AI dựng).
export function deriveRules(learned, { skip = [] } = {}) {
  const all = Object.values(learned?.projects || {}).filter(o => o && o.edited).sort((a, b) => (b.t || '').localeCompare(a.t || '')).slice(0, 10);
  const off = new Set([...(Array.isArray(learned?.off) ? learned.off : []), ...skip]), forgot = learned?.forgot && typeof learned.forgot === 'object' ? learned.forgot : {};
  const rules = { n: all.length, adjust: {}, notes: [], items: [] };
  if (!all.length) return rules;
  const use = key => all.filter(o => !forgot[key] || (o.t || '') > forgot[key]);
  const add = (key, note, adj) => {
    const it = { key, note, off: off.has(key) }; rules.items.push(it);
    if (it.off) return;
    for (const [k, v] of Object.entries(adj)) rules.adjust[k] = Array.isArray(v) ? [...(rules.adjust[k] || []), ...v] : v;
    rules.notes.push(note);
  };
  const sum = (obs, f) => obs.reduce((a, o) => [a[0] + f(o)[0], a[1] + f(o)[1]], [0, 0]);
  const rem = ([b, a]) => (b ? Math.max(0, b - a) / b : 0);
  const pct = x => Math.round(x * 100) + '%';
  for (const [k, label] of [['emoji', 'emoji pop'], ['text', 'chữ nổi'], ['photo', 'ảnh']]) {
    const obs = use('drop_' + k), s = sum(obs, o => o.auto?.[k] || [0, 0]), r = rem(s);
    if (obs.length >= 2 && s[0] >= 4 && r >= .6) add('drop_' + k, `Bạn thường xoá ${label} tự động (${pct(r)} trong ${obs.length} video) → không chèn ${label} nữa`, { drop_src: [k] });
  }
  { const obs = use('broll_step'), s = sum(obs, o => Object.values(o.auto || {}).reduce((a, x) => [a[0] + x[0], a[1] + x[1]], [0, 0])), r = rem(s);
    if (obs.length >= 2 && s[0] >= 6 && r >= .45) add('broll_step', `Bạn xoá ${pct(r)} b-roll tự động → giảm mật độ b-roll một bậc`, { broll_step: -1 }); }
  { const obs = use('ai_step'), s = sum(obs, o => o.ai || [0, 0]), r = rem(s);
    if (obs.length >= 2 && s[0] >= 6 && r >= .45) add('ai_step', `Bạn xoá ${pct(r)} graphic của AI → AI đặt thưa hơn một bậc`, { ai_step: -1 }); }
  { const obs = use('sound_step'), s = sum(obs, o => o.sfx || [0, 0]), r = rem(s);
    if (obs.length >= 2 && s[0] >= 6 && r >= .5) add('sound_step', `Bạn xoá ${pct(r)} SFX tự động → giảm mức âm thanh một bậc`, { sound_step: -1 }); }
  { const obs = use('music_off'), n = obs.filter(o => o.music?.before && !o.music?.after).length;
    if (n >= 2 && n / obs.length >= .6) add('music_off', `Bạn tắt nhạc nền ở ${n}/${obs.length} video → không thêm nhạc`, { music: 'off' }); }
  { const gains = use('music_gain').filter(o => o.music?.after && o.music?.gain).map(o => o.music.gain);
    if (gains.length >= 2 && gains.every(g => Math.sign(g) === Math.sign(gains[0]))) { const g = +(gains.reduce((a, b) => a + b, 0) / gains.length).toFixed(1); add('music_gain', `Bạn thường chỉnh nhạc ${g > 0 ? 'to' : 'nhỏ'} hơn ${Math.abs(g)} dB → áp sẵn`, { music_gain: g }); } }
  for (const [k, label] of [['caption_style', 'kiểu phụ đề'], ['pack', 'gói style']]) {
    const v = use(k).slice(0, 3).map(o => o[k]).filter(x => x != null);
    if (v.length >= 2 && v.every(x => x === v[0]) && v[0]) add(k, `Bạn đổi ${label} sang “${v[0]}” ở ${v.length} video gần nhất → dùng luôn`, { [k]: v[0] });
  }
  // CTA / lời kết: 2 lần đổi gần nhất cùng một câu
  { const v = use('cta').map(o => o.cta).filter(Boolean).slice(0, 2);
    if (v.length >= 2 && v[0].toLocaleLowerCase('vi') === v[1].toLocaleLowerCase('vi')) add('cta', `Bạn đổi lời kết / CTA thành “${v[0]}” ở ${v.length} video gần nhất → dùng luôn`, { cta: v[0] }); }
  // câu khẳng định của AI bị xoá ở ≥ 2 video, tổng ≥ 50 %
  { const obs = use('no_claims').filter(o => o.claims?.[0]), del = obs.filter(o => o.claims[1] < o.claims[0]), s = sum(obs, o => o.claims), r = rem(s);
    if (del.length >= 2 && r >= .5) { const ex = del.flatMap(o => o.claims[2] || [])[0]; add('no_claims', `Bạn hay xoá câu khẳng định AI chèn (đã xoá ${pct(r)}${ex ? `, vd “${ex.slice(0, 50)}”` : ''}) → AI không viết số liệu, cam kết tuyệt đối`, { no_claims: true }); } }
  // chữ phụ đề: cùng một cặp sai → đúng ở ≥ 2 video → từ điển chính tả của thương hiệu (mỗi cặp một điều, tối đa 12)
  { const cnt = new Map();
    for (const o of all) for (const [f, t] of new Map((o.words || []).map(([f, t]) => [f.toLocaleLowerCase('vi') + '\u0000' + t, [f, t]])).values()) {
      const key = 'dict:' + f.toLocaleLowerCase('vi');
      if (forgot[key] && (o.t || '') <= forgot[key]) continue;
      const k = key + '\u0000' + t, c = cnt.get(k) || { key, f, t, n: 0 }; c.n++; cnt.set(k, c);
    }
    const best = new Map();
    for (const c of cnt.values()) if (c.n >= 2 && (!best.has(c.key) || best.get(c.key).n < c.n)) best.set(c.key, c);
    for (const c of [...best.values()].sort((a, b) => b.n - a.n).slice(0, 12)) add(c.key, `Bạn sửa chữ phụ đề “${c.f}” thành “${c.t}” ở ${c.n} video → thêm vào từ điển chính tả của thương hiệu`, { dict: [{ from: c.f, to: c.t }] });
  }
  const moved = all.reduce((a, o) => a + (o.moved || 0), 0);
  if (moved) rules.notes.push(`(Thống kê) ${moved} cảnh tự động đã bị bạn chỉnh vị trí/nội dung — chưa tự áp, chỉ ghi nhận`);
  return rules;
}
// Ratings/tags/comments from Telegram & Studio (scripts/feedback.mjs improve() → p.fb) on top of the profile.
function applyFeedback(p, out) {
  const f = p.fb; if (!f || p.learn === false) return out;
  const step = (list, v, d) => list[Math.max(1, Math.min(list.length - 1, list.indexOf(v) + d))] || v;
  if (f.broll_step && p.broll_density !== 'off') out.broll_density = step(STEPS_DENS, p.broll_density, f.broll_step);
  if (f.ai_step) out.ai_density = STEPS_AI[Math.max(0, Math.min(STEPS_AI.length - 1, STEPS_AI.indexOf(p.ai_density) + f.ai_step))] || p.ai_density;
  if (f.sound_step && p.sound !== 'off') out.sound = step(STEPS_SOUND, p.sound, f.sound_step);
  if (f.music_gain) out.music_gain = (out.music_gain || 0) + f.music_gain;
  if (f.caption_style && !p.caption_style) out.caption_style = f.caption_style;
  if (f.extra) out.extra = [out.extra, f.extra].filter(Boolean).join(' ');
  out.applied = [...(out.applied || []), ...(f.notes || []).map(n => '[phản hồi] ' + n)];
  return out;
}
const NO_SRC = { emoji: 'emoji_pop/emoji', text: 'chữ nổi to (text pop)', photo: 'ảnh' };
export const CLAIM_RULE = 'Không viết câu khẳng định tuyệt đối, cam kết, "nhất" / "số 1" hay số liệu không có trong lời thoại (người dùng hay xoá).';
// Profile with learned adjustments applied (+ list of what changed). Explicit profile fields always win for caption_style/pack.
// opts.skip: khoá thói quen tắt cho riêng lần chạy này.
export function effectiveProfile(p, opts = {}) {
  const out = applyFeedback(p, { ...p, applied: [] });
  if (!p.learn || !p.learned) return out;
  const r = deriveRules(p.learned, opts), a = r.adjust;
  const step = (list, v, d) => list[Math.max(1, Math.min(list.length - 1, list.indexOf(v) + d))] || v;
  if (a.drop_src) {
    out.broll_src = (p.broll_src || []).filter(x => !a.drop_src.includes(x));
    out.extra = [out.extra, `Không chèn ${a.drop_src.map(k => NO_SRC[k]).filter(Boolean).join(', ')} (người dùng hay xoá).`].filter(Boolean).join(' ');
  }
  if (a.broll_step && p.broll_density !== 'off') out.broll_density = step(STEPS_DENS, p.broll_density, a.broll_step);
  if (a.ai_step) out.ai_density = STEPS_AI[Math.max(0, STEPS_AI.indexOf(p.ai_density) + a.ai_step)] || p.ai_density;
  if (a.sound_step && p.sound !== 'off') out.sound = step(STEPS_SOUND, p.sound, a.sound_step);
  if (a.music) out.music = a.music;
  if (a.music_gain) out.music_gain = (out.music_gain || 0) + a.music_gain;
  if (a.caption_style && !p.caption_style) out.caption_style = a.caption_style;
  if (a.pack && (p.pack === 'auto' || !p.pack)) out.pack = a.pack;
  if (a.cta) out.cta = a.cta;
  if (a.no_claims) out.extra = [out.extra, CLAIM_RULE].filter(Boolean).join(' ');
  if (a.dict) out.dict_learned = a.dict;
  out.applied = [...out.applied, ...r.notes];
  out.habits = r.items;
  return out;
}
// Thói quen của một thương hiệu cho AI dựng / Cắt clip / từ điển (ref = id thương hiệu, '' / 'chung' = Chung).
// → { id, name, items:[{key, note, off}], active, adjust, dict:[{from,to}], extra } (không ném lỗi: thương hiệu lạ → Chung)
export function habitsFor(ref, { skip = [] } = {}) {
  let p; try { p = getProfile(ref || CHUNG); } catch { p = getProfile(CHUNG); }
  const empty = { id: p.id, name: p.name, learn: !!p.learn, items: [], active: 0, adjust: {}, dict: [], extra: '' };
  if (!p.learn || !p.learned) return empty;
  const r = deriveRules(p.learned, { skip }), a = r.adjust;
  const extra = [a.drop_src?.length ? `Không chèn ${a.drop_src.map(k => NO_SRC[k]).filter(Boolean).join(', ')} (người dùng hay xoá).` : '', a.no_claims ? CLAIM_RULE : '',
    a.cta ? `Lời kêu gọi (CTA) người dùng hay dùng: "${a.cta}".` : '', a.dict?.length ? `Chính tả người dùng hay sửa: ${a.dict.map(e => `"${e.from}" → "${e.to}"`).join(', ')}.` : ''].filter(Boolean).join(' ');
  return { ...empty, items: r.items, active: r.items.filter(i => !i.off && !skip.includes(i.key)).length, adjust: a, dict: a.dict || [], extra };
}
// Từ điển chính tả đã học của một thương hiệu (dict.mjs gộp vào --fix của captions.py; không bao giờ ném lỗi)
export function learnedDict(ref) { try { return habitsFor(ref).dict; } catch { return []; } }

// Bản AI giao của dự án (S19 M134): AI dựng (sau khi áp kế hoạch và lưu), Tự động (cuối job), Tự lái (bước export).
// Lưu lại timeline + phụ đề đúng lúc đó để "Học từ chỉnh sửa" so với các lần lưu sau.
const rdJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const capsOf = (dir, tl) => typeof tl?.captions === 'string' ? (rdJ(path.join(dir, tl.captions)) || []) : Array.isArray(tl?.captions) ? tl.captions : (rdJ(path.join(dir, 'work/captions.json')) || []);
export function saveDelivered(dir, source = 'ai') {
  const tl = rdJ(path.join(dir, 'timeline.json')); if (!tl) return false;
  let mt = 0; try { mt = fs.statSync(path.join(dir, 'timeline.json')).mtimeMs; } catch {}
  const f = path.join(dir, '.studio', 'ai_result.json'); fs.mkdirSync(path.dirname(f), { recursive: true });
  writeAtomic(f, { version: 1, source: String(source).slice(0, 20), at: new Date().toISOString(), ms: Math.max(Date.now(), Math.ceil(mt)), timeline: tl, captions: capsOf(dir, tl) });
  return true;
}
// Learn from one project where AI inserted things (called by the Studio lane after the user saves it, or by CLI).
// S19 M134: ghi vào phong cách của thương hiệu của Kho chứa dự án (workspaceOfProject: .kho.json, không có thì TL.brand.kit,
// không có nữa thì Chung). Dự án Tự lái cũ chỉ có autopilot_result.json vẫn học được (không có phụ đề gốc → bỏ phần chữ phụ đề).
export function learnFromProject(dir) {
  const st = path.join(dir, '.studio');
  const after = rdJ(path.join(dir, 'timeline.json')), ai = rdJ(path.join(st, 'ai_result.json')), ap = rdJ(path.join(st, 'autopilot.json'));
  let before = null, ms = 0, capsBefore = null;
  if (ai?.timeline) { before = ai.timeline; ms = Math.max(+ai.ms || 0, ai.source === 'autopilot' ? +ap?.finishedMs || 0 : 0); capsBefore = Array.isArray(ai.captions) ? ai.captions : null; }
  else if (ap?.profile) { before = rdJ(path.join(st, 'autopilot_result.json')); ms = ap.finishedMs || 0; }
  if (!before || !after) return { ok: false, why: 'dự án chưa có bản AI giao (AI dựng, Tự động hoặc Tự lái)' };
  const mt = fs.statSync(path.join(dir, 'timeline.json')).mtimeMs;
  if (mt <= ms + 1000) return { ok: false, why: 'chưa có chỉnh sửa sau bản AI giao' };
  let id; try { id = resolveStyleId(workspaceOfProject(dir, after).brand || CHUNG); } catch { id = null; }
  if (!id) id = CHUNG; // thương hiệu của Kho đã bị xoá
  if (!getProfile(id).learn) return { ok: false, why: 'phong cách tắt “Học từ chỉnh sửa”' };
  const key = crypto.createHash('md5').update(path.resolve(dir)).digest('hex').slice(0, 10);
  const o = { ...observe(before, after, { capsBefore, capsAfter: capsBefore ? capsOf(dir, after) : null }), t: new Date().toISOString(), dir: path.resolve(dir), name: path.basename(dir), source: ai?.source || 'autopilot' };
  const p = patchStyle(id, s => {
    s.learned = s.learned || { projects: {} };
    s.learned.projects = s.learned.projects || {};
    s.learned.projects[key] = o; // re-saving the same project replaces its observation (never double counts)
    s.learned.projects = trimProjects(s.learned.projects);
    s.learned.updated = o.t;
  });
  return { ok: true, profile: id, brand: p.brand, name: p.name, observation: o, rules: deriveRules(p.learned) };
}
// Tắt / bật / quên một thói quen của một thương hiệu (trang Thương hiệu). forget: bỏ qua các quan sát tới lúc này cho khoá đó.
export function setHabit(ref, key, op) {
  if (typeof key !== 'string' || !/^[a-z_]{2,20}(:.{1,40})?$/.test(key)) throw Object.assign(new Error('Thói quen không hợp lệ'), { status: 400 });
  if (!['off', 'on', 'forget'].includes(op)) throw Object.assign(new Error('Thao tác lạ'), { status: 400 });
  return patchStyle(ref, s => {
    s.learned = s.learned || { projects: {} };
    const off = new Set(Array.isArray(s.learned.off) ? s.learned.off : []);
    if (op === 'off') off.add(key); else off.delete(key);
    s.learned.off = [...off].slice(-100);
    if (op === 'forget') s.learned.forgot = { ...(s.learned.forgot && typeof s.learned.forgot === 'object' ? s.learned.forgot : {}), [key]: new Date().toISOString() };
  });
}
// Danh sách cho Studio (trang Thương hiệu, panel Tự lái): phong cách + điều đã học + giá trị sau khi áp.
export function stylesOut() {
  const s = loadStore();
  return { default: s.default, aliases: s.aliases, migrated: s.migrated, list: s.profiles.map(p => { const e = effectiveProfile(p); const r = deriveRules(p.learned);
    return { ...p, learnedNotes: r.notes, learnedN: r.n, habits: r.items, effective: { broll_density: e.broll_density, broll_src: e.broll_src, sound: e.sound, music: e.music, caption_style: e.caption_style, pack: e.pack, ai_density: e.ai_density, cta: e.cta } }; }) };
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  const [cmd, a] = process.argv.slice(2);
  try {
    if (cmd === 'list') { const s = loadStore(); for (const p of s.profiles) console.log(`${p.id === s.default ? '*' : ' '} ${p.id}  ${p.name}${p.saved ? '' : '  (theo Chung)'}`); }
    else if (cmd === 'show') { const p = getProfile(a); const e = effectiveProfile(p); console.log(JSON.stringify({ ...p, effective: e.applied }, null, 1)); }
    else if (cmd === 'default') { setDefault(a); console.log('ok'); }
    else if (cmd === 'learn') console.log(JSON.stringify(learnFromProject(path.resolve(a)), null, 1));
    else if (cmd === 'reset-learned') { resetLearned(a); console.log('ok'); }
    else { console.error('usage: node scripts/profile.mjs list | show [thương hiệu|chung|id hồ sơ cũ] | default <id> | learn <project_dir> | reset-learned <id>'); process.exit(2); }
  } catch (e) { console.error('LỖI: ' + e.message); process.exit(1); }
}
