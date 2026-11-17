// S19 M134 — học từ mọi dự án có AI chèn, theo thương hiệu: bản AI giao (.studio/ai_result.json), quan sát ghi vào thương hiệu
// của Kho chứa dự án, thói quen mới (chính tả phụ đề, CTA, câu khẳng định), tắt / quên từng điều, áp vào AI dựng, từ điển, Cắt clip.
// run: node --test scripts/tests/s19_brand_learn.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

const TMP = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m134-')));
const HOME = path.join(TMP, 'home'), USER = path.join(TMP, 'user');
fs.mkdirSync(HOME, { recursive: true }); fs.mkdirSync(USER, { recursive: true });
Object.assign(process.env, { AVS_HOME: HOME, USERPROFILE: USER, HOME: USER, AVS_NO_NOTIFY: '1', AVS_NO_LAUNCHCTL: '1' });
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
fs.writeFileSync(path.join(HOME, 'brands.json'), JSON.stringify({ version: 1, brands: [{ id: 'nha-dep', title: 'Nhà Đẹp' }] }));

const R = (...p) => pathToFileURL(path.resolve(import.meta.dirname, '..', '..', ...p)).href;
const P = await import(R('scripts/profile.mjs'));
const A = await import(R('scripts/ai_edit.mjs'));

// Kho của thương hiệu Nhà Đẹp: .kho.json ở thư mục gốc, dự án trong Du an/
const KHO = path.join(TMP, 'Kho Nha Dep');
fs.mkdirSync(path.join(KHO, 'Du an'), { recursive: true });
fs.writeFileSync(path.join(KHO, '.kho.json'), JSON.stringify({ brand: 'nha-dep', title: 'Nhà Đẹp' }));
const cap = (t0, words) => ({ t0, t1: t0 + 1, words: words.map((w, i) => ({ w, s: t0 + i * .2, e: t0 + i * .2 + .2 })) });
const delivered = () => ({
  duration: 10, brand: { outro: 'Follow kênh nhé' }, captions: 'work/captions.json',
  scenes: [{ type: 'emoji_pop', _ai: true, t0: 1, t1: 2 }, { type: 'text', _ai: true, t0: 3, t1: 4, params: { text: 'Giảm 50% chỉ hôm nay' } }, { type: 'text', _ai: true, t0: 5, t1: 6, params: { text: 'Cam kết hiệu quả tuyệt đối' } }],
  audio: { music: [{ t0: 0, t1: 10, mood: 'tech', gain: -20, _ai: true }] },
});
// một dự án: AI giao → lưu bản giao → người dùng sửa (xoá 2 câu khẳng định, sửa chữ "hàm" → "Hằm", đổi CTA) → học
function project(name, { brandCta = 'Nhắn tin để nhận báo giá' } = {}) {
  const d = path.join(KHO, 'Du an', name);
  fs.mkdirSync(path.join(d, 'work'), { recursive: true });
  fs.writeFileSync(path.join(d, 'timeline.json'), JSON.stringify(delivered()));
  fs.writeFileSync(path.join(d, 'work/captions.json'), JSON.stringify([cap(0, ['chào', 'hàm', 'nhé']), cap(2, ['nhà', 'đẹp'])]));
  assert.equal(P.saveDelivered(d, 'ai'), true);
  const st = JSON.parse(fs.readFileSync(path.join(d, '.studio/ai_result.json'), 'utf8'));
  st.ms = Date.now() - 60000; fs.writeFileSync(path.join(d, '.studio/ai_result.json'), JSON.stringify(st)); // bản giao 1 phút trước
  const tl = delivered(); tl.scenes = tl.scenes.slice(0, 1); tl.brand.outro = brandCta;
  fs.writeFileSync(path.join(d, 'timeline.json'), JSON.stringify(tl));
  fs.writeFileSync(path.join(d, 'work/captions.json'), JSON.stringify([cap(0, ['chào', 'Hằm,', 'nhé']), cap(2, ['nhà', 'đẹp'])]));
  return d;
}

test('quan sát: chữ phụ đề bị sửa, CTA đổi, câu khẳng định bị xoá (chữ ký cũ observe(before, after) vẫn chạy)', () => {
  const b = delivered(), a = delivered(); a.scenes = a.scenes.slice(0, 1); a.brand.outro = 'Gọi ngay';
  const o = P.observe(b, a, { capsBefore: [cap(0, ['chào', 'hàm'])], capsAfter: [cap(0, ['chào', 'Hằm.'])] });
  assert.deepEqual(o.words, [['hàm', 'Hằm']]);
  assert.equal(o.cta, 'Gọi ngay');
  assert.equal(o.claims[0], 2); assert.equal(o.claims[1], 0);
  assert.equal(o.edited, true);
  const old = P.observe(b, b); assert.equal(old.edited, false); assert.ok(!old.words);
  assert.deepEqual(P.captionFixes([cap(0, ['a', 'b'])], [cap(0, ['a', 'b', 'c'])]), [], 'khác số từ: không ghép');
});

test('học vào thương hiệu của Kho chứa dự án; ≥ 2 video mới thành thói quen', () => {
  const r1 = P.learnFromProject(project('clip-1'));
  assert.equal(r1.ok, true); assert.equal(r1.profile, 'nha-dep', 'Kho của Nhà Đẹp');
  assert.equal(r1.observation.source, 'ai');
  assert.equal(r1.rules.items.length, 0, 'một video chưa thành thói quen');
  const r2 = P.learnFromProject(project('clip-2'));
  const keys = r2.rules.items.map(i => i.key).sort();
  // + luật cũ: xoá 2/3 graphic AI (chữ) ở 2 video → bỏ chữ nổi, AI thưa hơn, b-roll ít hơn
  assert.deepEqual(keys, ['ai_step', 'broll_step', 'cta', 'dict:hàm', 'drop_text', 'no_claims']);
  assert.equal(r2.rules.adjust.cta, 'Nhắn tin để nhận báo giá');
  assert.deepEqual(r2.rules.adjust.dict, [{ from: 'hàm', to: 'Hằm' }]);
  assert.equal(P.getProfile('chung').learned, null, 'không ghi nhầm vào Chung');
  // chưa sửa gì sau bản giao → chưa học
  const d = path.join(KHO, 'Du an', 'clip-3'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'timeline.json'), JSON.stringify(delivered())); P.saveDelivered(d, 'autofill');
  assert.equal(P.learnFromProject(d).ok, false);
  assert.equal(P.learnFromProject(path.join(TMP, 'khong-co-ban-giao')).ok ?? false, false);
});

test('thói quen áp vào phong cách (Tự lái), habitsFor (AI dựng / Cắt clip), learnedDict (từ điển)', () => {
  const e = P.effectiveProfile(P.getProfile('nha-dep'));
  assert.equal(e.cta, 'Nhắn tin để nhận báo giá');
  assert.match(e.extra, /cam kết/);
  assert.deepEqual(e.dict_learned, [{ from: 'hàm', to: 'Hằm' }]);
  const h = P.habitsFor('nha-dep');
  assert.equal(h.name, 'Nhà Đẹp'); assert.equal(h.active, 6);
  assert.match(h.extra, /"hàm" → "Hằm"/); assert.match(h.extra, /Nhắn tin để nhận báo giá/);
  assert.equal(P.habitsFor('nha-dep', { skip: ['cta'] }).active, 5, 'tắt riêng cho lần chạy');
  assert.equal(P.habitsFor('khong-co').id, 'chung', 'thương hiệu lạ → Chung, không ném lỗi');
  assert.deepEqual(P.learnedDict('nha-dep'), [{ from: 'hàm', to: 'Hằm' }]);
});

test('tắt / bật / quên từng thói quen', () => {
  P.setHabit('nha-dep', 'cta', 'off');
  let it = P.habitsFor('nha-dep'); assert.equal(it.items.find(i => i.key === 'cta').off, true); assert.equal(it.adjust.cta, undefined); assert.equal(it.active, 5);
  P.setHabit('nha-dep', 'cta', 'on'); assert.equal(P.habitsFor('nha-dep').adjust.cta, 'Nhắn tin để nhận báo giá');
  P.setHabit('nha-dep', 'dict:hàm', 'forget');
  it = P.habitsFor('nha-dep'); assert.ok(!it.items.some(i => i.key === 'dict:hàm'), 'quên: bỏ các lần sửa tới giờ'); assert.deepEqual(it.dict, []);
  assert.throws(() => P.setHabit('nha-dep', '__proto__ x', 'off'), e => e.status === 400);
  assert.throws(() => P.setHabit('nha-dep', 'cta', 'xoa'), e => e.status === 400);
});

test('dict.mjs: chính tả đã học vào --fix, từ điển gõ tay của thương hiệu thắng', async () => {
  P.setHabit('nha-dep', 'dict:hàm', 'on');
  P.patchStyle('nha-dep', s => { s.learned.forgot = {}; });
  const D = await import(R('scripts/dict.mjs'));
  const d = path.join(KHO, 'Du an', 'clip-1');
  assert.match(D.projectFix({ dir: d, kit: 'nha-dep' }), /hàm=Hằm/);
  const b = JSON.parse(fs.readFileSync(path.join(HOME, 'brands.json'), 'utf8')); b.brands[0].dict = 'hàm=Hàm'; fs.writeFileSync(path.join(HOME, 'brands.json'), JSON.stringify(b));
  assert.match(D.projectFix({ dir: d, kit: 'nha-dep' }), /hàm=Hàm/); assert.doesNotMatch(D.projectFix({ dir: d, kit: 'nha-dep' }), /hàm=Hằm/);
  delete b.brands[0].dict; fs.writeFileSync(path.join(HOME, 'brands.json'), JSON.stringify(b));
});

test('ai_edit: applyLearned bỏ loại graphic hay xoá, không nhạc, chính tả; applyPlan không chồng nhạc khi music null', () => {
  const plan = { scenes: [{ type: 'emoji_pop', _ai: true }, { type: 'text', _ai: true }, { type: 'emoji_pop', _ai: true, _base: true }], dropped: [], music: { t0: 0, t1: 10, mood: 'tech', gain: -20, _ai: true }, sfx: [], captions: [], pack: 'slate' };
  A.applyLearned(plan, { drop: ['emoji', 'constructor'], music: 'off', dict: [{ from: 'hàm', to: 'Hằm' }], notes: ['a', 'b'] });
  assert.deepEqual(plan.scenes.map(s => s.type), ['text', 'emoji_pop']); assert.equal(plan.music, null); assert.deepEqual(plan.learned, ['a', 'b']);
  const tl = { duration: 10, scenes: [], audio: { music: [{ t0: 0, t1: 10, mood: 'chill', _ai: true }, { t0: 0, t1: 10, file: 'media/nhac.mp3' }] } };
  const caps = [cap(0, ['"hàm!', 'nhé'])];
  A.applyPlan(tl, caps, plan);
  assert.deepEqual(tl.audio.music, [{ t0: 0, t1: 10, file: 'media/nhac.mp3' }], 'bỏ nhạc _ai, giữ nhạc file của người dùng');
  assert.equal(caps[0].words[0].w, '"Hằm!');
  const p2 = { scenes: [], dropped: [], music: { gain: -20 } }; A.applyLearned(p2, { music_gain: -4 }); assert.equal(p2.music.gain, -24);
  assert.equal(A.applyLearned(p2, null), p2);
});

const mkCtx = dir => { const ctx = { out: null, code: 200, json(res, o, c = 200) { ctx.out = o; ctx.code = c; }, body: async req => req._body || {}, project: { dir, tlFile: path.join(dir, 'timeline.json') },
  P: (...p) => path.join(dir, ...p), SKILL: path.resolve(import.meta.dirname, '..', '..'), readProject: () => ({ timeline: JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8')) }),
  startJob: () => true }; return ctx; };
const call = async (handler, ctx, method, url, body) => { const u = new URL('http://x' + url); const req = Object.assign(Readable.from([]), { method, _body: body }); await handler(req, {}, u.pathname, u); return { out: ctx.out, code: ctx.code }; };

test('route AI dựng: /api/ai/habits theo Kho của dự án, /api/ai/edit gắn thói quen (trừ điều tắt), /api/ai/delivered', async () => {
  const d = path.join(KHO, 'Du an', 'clip-1'), ctx = mkCtx(d), h = (await import(R('studio/routes/20_ai.mjs'))).default(ctx);
  const g = await call(h, ctx, 'GET', '/api/ai/habits');
  assert.equal(g.out.name, 'Nhà Đẹp'); assert.equal(g.out.active, 6);
  await call(h, ctx, 'POST', '/api/ai/edit', { goal: 'Bán hàng', density: 'vua', skip: ['no_claims', 42] });
  const o = JSON.parse(fs.readFileSync(path.join(d, '.studio/ai_opts.json'), 'utf8'));
  assert.equal(o.learned.brand, 'Nhà Đẹp'); assert.equal(o.learned.notes.length, 5); assert.deepEqual(o.learned.drop, ['text']); assert.equal(o.density, 'thua', 'AI thưa hơn một bậc'); assert.doesNotMatch(o.learned.extra, /cam kết/);
  assert.deepEqual(o.learned.dict, [{ from: 'hàm', to: 'Hằm' }]);
  fs.rmSync(path.join(d, '.studio/ai_result.json'));
  assert.equal((await call(h, ctx, 'POST', '/api/ai/delivered', { source: 'ai' })).out.ok, true);
  assert.ok(JSON.parse(fs.readFileSync(path.join(d, '.studio/ai_result.json'), 'utf8')).captions.length);
});

test('route trang Thương hiệu: action habit; stylesOut có habits', async () => {
  const B = (await import(R('studio/routes/51_brands.mjs'))).default(mkCtx(KHO));
  const ctx = mkCtx(KHO), h = (await import(R('studio/routes/51_brands.mjs'))).default(ctx);
  const r = await call(h, ctx, 'POST', '/api/brands/style', { action: 'habit', id: 'nha-dep', key: 'no_claims', op: 'off' });
  assert.equal(r.code, 200); assert.equal(r.out.styles.list.find(s => s.id === 'nha-dep').habits.find(x => x.key === 'no_claims').off, true);
  assert.equal((await call(h, ctx, 'POST', '/api/brands/style', { action: 'habit', id: 'nha-dep', key: 'no_claims', op: 'lung-tung' })).code, 400);
  assert.ok(B);
});
