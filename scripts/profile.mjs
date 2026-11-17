// Phong cách dựng của từng thương hiệu (S19 M133, trước là "hồ sơ kênh") cho Tự lái: ~/.ai-video-studio/styles.json (AVS_HOME đổi được),
// chuyển một lần từ profiles.json (giữ file cũ), cộng "Học từ chỉnh sửa". Spec: references/autopilot.md. CLI:
//   node scripts/profile.mjs list | show <id> | default <id> | learn <project_dir> | reset-learned <id>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { retryBusy, withFileLock } from './file_lock.mjs';

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
// Observation of ONE autopilot project: what the autopilot delivered (.studio/autopilot_result.json) vs the timeline the user saved.
// scenes the autopilot inserted: b-roll pass (_auto) and AI dựng giúp (_ai, except long _base backgrounds)
const KIND = s => s.type === 'emoji_pop' ? 'emoji' : s.type === 'text' ? 'text' : s.type === 'photo' ? 'photo' : 'preset';
const MINE = s => (s._auto || s._ai) && !s._base;
export function observe(before, after) {
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
  o.edited = JSON.stringify({ s: after.scenes, a: after.audio, c: after.caption_style, p: after.pack }) !== JSON.stringify({ s: before.scenes, a: before.audio, c: before.caption_style, p: before.pack });
  return o;
}
// Aggregate the newest ≤ 10 observations into small, explainable adjustments.
export function deriveRules(learned) {
  const obs = Object.values(learned?.projects || {}).filter(o => o.edited).sort((a, b) => (b.t || '').localeCompare(a.t || '')).slice(0, 10);
  const rules = { n: obs.length, adjust: {}, notes: [] };
  if (!obs.length) return rules;
  const sum = (f) => obs.reduce((a, o) => [a[0] + f(o)[0], a[1] + f(o)[1]], [0, 0]);
  const rem = ([b, a]) => (b ? Math.max(0, b - a) / b : 0);
  const pct = x => Math.round(x * 100) + '%';
  const enough = obs.length >= 2;
  for (const [k, label] of [['emoji', 'emoji pop'], ['text', 'chữ nổi'], ['photo', 'ảnh']]) {
    const s = sum(o => o.auto[k] || [0, 0]), r = rem(s);
    if (enough && s[0] >= 4 && r >= .6) { rules.adjust.drop_src = [...(rules.adjust.drop_src || []), k]; rules.notes.push(`Bạn thường xoá ${label} tự động (${pct(r)} trong ${obs.length} video) → không chèn ${label} nữa`); }
  }
  const all = sum(o => Object.values(o.auto).reduce((a, x) => [a[0] + x[0], a[1] + x[1]], [0, 0])), rAll = rem(all);
  if (enough && all[0] >= 6 && rAll >= .45) { rules.adjust.broll_step = -1; rules.notes.push(`Bạn xoá ${pct(rAll)} b-roll tự động → giảm mật độ b-roll một bậc`); }
  const ai = sum(o => o.ai), rAi = rem(ai);
  if (enough && ai[0] >= 6 && rAi >= .45) { rules.adjust.ai_step = -1; rules.notes.push(`Bạn xoá ${pct(rAi)} graphic của AI → AI đặt thưa hơn một bậc`); }
  const sf = sum(o => o.sfx), rSf = rem(sf);
  if (enough && sf[0] >= 6 && rSf >= .5) { rules.adjust.sound_step = -1; rules.notes.push(`Bạn xoá ${pct(rSf)} SFX tự động → giảm mức âm thanh một bậc`); }
  const musOff = obs.filter(o => o.music.before && !o.music.after).length;
  if (musOff >= 2 && musOff / obs.length >= .6) { rules.adjust.music = 'off'; rules.notes.push(`Bạn tắt nhạc nền ở ${musOff}/${obs.length} video → không thêm nhạc`); }
  const gains = obs.filter(o => o.music.after && o.music.gain).map(o => o.music.gain);
  if (gains.length >= 2 && gains.every(g => Math.sign(g) === Math.sign(gains[0]))) { const g = +(gains.reduce((a, b) => a + b, 0) / gains.length).toFixed(1); rules.adjust.music_gain = g; rules.notes.push(`Bạn thường chỉnh nhạc ${g > 0 ? 'to' : 'nhỏ'} hơn ${Math.abs(g)} dB → áp sẵn`); }
  for (const [k, label] of [['caption_style', 'kiểu phụ đề'], ['pack', 'gói style']]) {
    const v = obs.slice(0, 3).map(o => o[k]).filter(x => x != null);
    if (v.length >= 2 && v.every(x => x === v[0]) && v[0]) { rules.adjust[k] = v[0]; rules.notes.push(`Bạn đổi ${label} sang “${v[0]}” ở ${v.length} video gần nhất → dùng luôn`); }
  }
  const moved = obs.reduce((a, o) => a + o.moved, 0);
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
// Profile with learned adjustments applied (+ list of what changed). Explicit profile fields always win for caption_style/pack.
export function effectiveProfile(p) {
  const out = applyFeedback(p, { ...p, applied: [] });
  if (!p.learn || !p.learned) return out;
  const r = deriveRules(p.learned), a = r.adjust;
  const step = (list, v, d) => list[Math.max(1, Math.min(list.length - 1, list.indexOf(v) + d))] || v;
  if (a.drop_src) {
    out.broll_src = (p.broll_src || []).filter(x => !a.drop_src.includes(x));
    const no = { emoji: 'emoji_pop/emoji', text: 'chữ nổi to (text pop)', photo: 'ảnh' };
    out.extra = [out.extra, `Không chèn ${a.drop_src.map(k => no[k]).filter(Boolean).join(', ')} (người dùng hay xoá).`].filter(Boolean).join(' ');
  }
  if (a.broll_step && p.broll_density !== 'off') out.broll_density = step(STEPS_DENS, p.broll_density, a.broll_step);
  if (a.ai_step) out.ai_density = STEPS_AI[Math.max(0, STEPS_AI.indexOf(p.ai_density) + a.ai_step)] || p.ai_density;
  if (a.sound_step && p.sound !== 'off') out.sound = step(STEPS_SOUND, p.sound, a.sound_step);
  if (a.music) out.music = a.music;
  if (a.music_gain) out.music_gain = (out.music_gain || 0) + a.music_gain;
  if (a.caption_style && !p.caption_style) out.caption_style = a.caption_style;
  if (a.pack && (p.pack === 'auto' || !p.pack)) out.pack = a.pack;
  out.applied = [...out.applied, ...r.notes];
  return out;
}
// Learn from one project the autopilot produced (called by the Studio lane after the user saves it, or by CLI).
// S19 M133: ap.profile là id phong cách (thương hiệu / 'chung'), hoặc id hồ sơ cũ (ánh xạ qua aliases).
export function learnFromProject(dir) {
  const st = path.join(dir, '.studio');
  const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const ap = rd(path.join(st, 'autopilot.json')), before = rd(path.join(st, 'autopilot_result.json')), after = rd(path.join(dir, 'timeline.json'));
  if (!ap?.profile || !before || !after) return { ok: false, why: 'không phải dự án Tự lái hoặc chưa chạy xong' };
  const mt = fs.statSync(path.join(dir, 'timeline.json')).mtimeMs;
  if (mt <= (ap.finishedMs || 0) + 1000) return { ok: false, why: 'chưa có chỉnh sửa sau Tự lái' };
  const id = resolveStyleId(ap.profile);
  if (!id) return { ok: false, why: 'thương hiệu / hồ sơ đã bị xoá' };
  if (!getProfile(id).learn) return { ok: false, why: 'phong cách tắt “Học từ chỉnh sửa”' };
  const key = crypto.createHash('md5').update(path.resolve(dir)).digest('hex').slice(0, 10);
  const o = { ...observe(before, after), t: new Date().toISOString(), dir: path.resolve(dir), name: path.basename(dir) };
  const p = patchStyle(id, s => {
    s.learned = s.learned || { projects: {} };
    s.learned.projects[key] = o; // re-saving the same project replaces its observation (never double counts)
    s.learned.projects = trimProjects(s.learned.projects);
    s.learned.updated = o.t;
  });
  return { ok: true, profile: id, brand: p.brand, name: p.name, observation: o, rules: deriveRules(p.learned) };
}
// Danh sách cho Studio (trang Thương hiệu, panel Tự lái): phong cách + điều đã học + giá trị sau khi áp.
export function stylesOut() {
  const s = loadStore();
  return { default: s.default, aliases: s.aliases, migrated: s.migrated, list: s.profiles.map(p => { const e = effectiveProfile(p); const r = deriveRules(p.learned);
    return { ...p, learnedNotes: r.notes, learnedN: r.n, effective: { broll_density: e.broll_density, broll_src: e.broll_src, sound: e.sound, music: e.music, caption_style: e.caption_style, pack: e.pack, ai_density: e.ai_density } }; }) };
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
