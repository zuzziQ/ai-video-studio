// S19 M133 — hồ sơ kênh gộp vào thương hiệu: styles.json (phong cách dựng + điều đã học theo thương hiệu, 'chung' = không thương hiệu),
// chuyển một lần từ profiles.json (giữ file cũ), id hồ sơ cũ (--profile, queue.json, autopilot.json) vẫn nhận, route trang Thương hiệu.
// run: node --test scripts/tests/s19_brand_style.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

const TMP = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m133-')));
const HOME = path.join(TMP, 'home'), USER = path.join(TMP, 'user');
fs.mkdirSync(HOME, { recursive: true }); fs.mkdirSync(USER, { recursive: true });
Object.assign(process.env, { AVS_HOME: HOME, USERPROFILE: USER, HOME: USER, AVS_NO_NOTIFY: '1', AVS_NO_LAUNCHCTL: '1' });
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const brands = [{ id: 'nha-dep', title: 'Nhà Đẹp' }, { id: 'bep-ngon', title: 'Bếp Ngon' }, { id: 'moi-tinh', title: 'Mới Tinh' }];
const obs = (n, t) => ({ edited: true, t, name: n, auto: { emoji: [4, 0], text: [0, 0], photo: [0, 0], preset: [0, 0] }, ai: [0, 0], sfx: [0, 0], moved: 0, music: { before: 1, after: 1, gain: 0 } });
const OLD = { version: 1, default: 'kenh-nha-2', profiles: [
  { id: 'mac-dinh', name: 'Mặc định', sound: 'nhe', updated: '2026-01-01T00:00:00Z' },
  { id: 'kenh-nha-1', name: 'Nhà TikTok', brand: 'nha-dep', broll_density: 'day', updated: '2026-09-01T00:00:00Z', learned: { projects: { a: obs('a', '2026-09-02') } } },
  { id: 'kenh-nha-2', name: 'Nhà YouTube', brand: 'nha-dep', broll_density: 'thua', updated: '2026-03-01T00:00:00Z', learned: { projects: { b: obs('b', '2026-03-02') } }, fb: { n: 3, notes: ['x'] } },
  { id: 'bep-1', name: 'Bếp cũ', brand: 'bep-ngon', sound: 'phongphu', created: '2026-02-01T00:00:00Z' },
  { id: 'bep-2', name: 'Bếp mới', brand: 'bep-ngon', sound: 'off', updated: '2026-10-01T00:00:00Z' },
  { id: 'mat-tich', name: 'Kênh đã xoá', brand: 'da-xoa', sound: 'vua' },
] };
fs.writeFileSync(path.join(HOME, 'brands.json'), JSON.stringify({ version: 1, brands }));
fs.writeFileSync(path.join(HOME, 'profiles.json'), JSON.stringify(OLD));
const oldText = fs.readFileSync(path.join(HOME, 'profiles.json'), 'utf8');

const R = (...p) => pathToFileURL(path.resolve(import.meta.dirname, '..', '..', ...p)).href;
const P = await import(R('scripts/profile.mjs'));

test('chuyển một lần: hồ sơ có brand → phong cách của thương hiệu, không brand / brand đã xoá → Chung; profiles.json giữ nguyên', () => {
  const s = P.loadStyles();
  assert.ok(fs.existsSync(path.join(HOME, 'styles.json')));
  assert.equal(fs.readFileSync(path.join(HOME, 'profiles.json'), 'utf8'), oldText, 'không sửa profiles.json');
  assert.deepEqual(Object.keys(s.styles).sort(), ['bep-ngon', 'chung', 'nha-dep']);
  // nhiều hồ sơ cùng thương hiệu: hồ sơ mặc định thắng (kenh-nha-2 dù cũ hơn), không có thì hồ sơ sửa gần nhất (bep-2)
  assert.equal(s.styles['nha-dep'].broll_density, 'thua'); assert.equal(s.styles['nha-dep'].from, 'kenh-nha-2');
  assert.deepEqual(s.styles['nha-dep'].fb, { n: 3, notes: ['x'] });
  assert.deepEqual(Object.keys(s.styles['nha-dep'].learned.projects).sort(), ['a', 'b'], 'gộp điều đã học của cả nhóm');
  assert.equal(s.styles['bep-ngon'].sound, 'off');
  // Chung: 'mac-dinh' và hồ sơ gắn thương hiệu đã xoá; mới nhất trong nhóm (mac-dinh có updated, mat-tich không)
  assert.equal(s.styles.chung.sound, 'nhe');
  assert.equal(s.default, 'nha-dep', 'mặc định = thương hiệu của hồ sơ mặc định cũ');
  assert.deepEqual(s.aliases, { 'mac-dinh': 'chung', 'kenh-nha-1': 'nha-dep', 'kenh-nha-2': 'nha-dep', 'bep-1': 'bep-ngon', 'bep-2': 'bep-ngon', 'mat-tich': 'chung' });
  const notes = s.migrated.notes.join('\n');
  assert.match(notes, /Nhà Đẹp” có 2 hồ sơ .*lấy “Nhà YouTube” \(hồ sơ mặc định\)/);
  assert.match(notes, /Bếp Ngon” có 2 hồ sơ .*lấy “Bếp mới” \(sửa gần nhất\)/);
  assert.match(notes, /Kênh đã xoá” gắn thương hiệu đã xoá/);
  // lần đọc sau không chuyển lại (đổi profiles.json không ảnh hưởng)
  fs.writeFileSync(path.join(HOME, 'profiles.json'), JSON.stringify({ version: 1, profiles: [] }));
  assert.equal(P.loadStyles().styles['nha-dep'].broll_density, 'thua');
  fs.writeFileSync(path.join(HOME, 'profiles.json'), oldText);
});

test('id hồ sơ cũ, id thương hiệu, chung / __none / rỗng đều ra đúng phong cách; id lạ ném 404', () => {
  assert.equal(P.getProfile('kenh-nha-1').id, 'nha-dep');
  assert.equal(P.getProfile('kenh-nha-1').brand, 'nha-dep');
  assert.equal(P.getProfile('nha-dep').name, 'Nhà Đẹp');
  assert.equal(P.getProfile('mac-dinh').id, 'chung');
  assert.equal(P.getProfile('__none').brand, '');
  assert.equal(P.getProfile('').id, 'nha-dep', 'rỗng = mặc định');
  assert.equal(P.getProfile(undefined).id, 'nha-dep');
  assert.throws(() => P.getProfile('khong-co'), e => e.status === 404);
  // thương hiệu chưa có phong cách riêng: mượn các trường của Chung, không mượn điều đã học
  const m = P.getProfile('moi-tinh');
  assert.equal(m.saved, false); assert.equal(m.sound, 'nhe'); assert.equal(m.learned, null);
  // danh sách kiểu cũ: Chung trước rồi từng thương hiệu (queue khoInboxes, Telegram, Agent)
  assert.deepEqual(P.loadStore().profiles.map(p => p.id), ['chung', 'nha-dep', 'bep-ngon', 'moi-tinh']);
});

test('lưu phong cách, saveStore (phản hồi) không xoá điều đã học, quên điều đã học', () => {
  const v = P.upsertProfile({ id: 'moi-tinh', sound: 'phongphu', broll_src: 'text,emoji', learn: 0, name: 'bỏ qua', brand: 'nha-dep' });
  assert.equal(v.saved, true); assert.equal(v.sound, 'phongphu'); assert.deepEqual(v.broll_src, ['text', 'emoji']); assert.equal(v.learn, false);
  assert.equal(v.name, 'Mới Tinh', 'tên lấy từ thương hiệu'); assert.equal(v.brand, 'moi-tinh', 'không đổi được thương hiệu của phong cách');
  assert.throws(() => P.upsertProfile({ sound: 'off' }), e => e.status === 404, 'phải có id');
  // bản đọc cũ (feedback.mjs) ghi lại sau khi có điều mới học: không mất điều mới học
  const store = P.loadStore();
  P.patchStyle('nha-dep', st => { st.learned.projects.c = obs('c', '2026-11-01'); });
  store.profiles.find(p => p.id === 'nha-dep').fb = { n: 5, notes: ['mới'] };
  P.saveStore(store);
  const nd = P.loadStyles().styles['nha-dep'];
  assert.deepEqual(nd.fb, { n: 5, notes: ['mới'] }); assert.ok(nd.learned.projects.c, 'giữ điều vừa học');
  assert.equal(P.loadStyles().styles['moi-tinh'].sound, 'phongphu');
  assert.ok(!P.loadStyles().styles.unknown);
  // điều đã học áp được (≥ 2 video xoá emoji)
  assert.ok(P.effectiveProfile(P.getProfile('nha-dep')).applied.some(n => /emoji/.test(n)));
  P.resetLearned('kenh-nha-2');
  assert.equal(P.getProfile('nha-dep').learned, null);
});

test('học từ dự án Tự lái cũ (chỉ autopilot_result.json) → ghi vào thương hiệu của dự án (M134: Kho / TL.brand.kit)', () => {
  const d = path.join(TMP, 'proj'); fs.mkdirSync(path.join(d, '.studio'), { recursive: true });
  const tl = { scenes: [{ type: 'emoji_pop', _auto: true }, { type: 'emoji_pop', _auto: true }], audio: { music: [] }, brand: { kit: 'bep-ngon' } };
  fs.writeFileSync(path.join(d, '.studio/autopilot_result.json'), JSON.stringify(tl));
  fs.writeFileSync(path.join(d, '.studio/autopilot.json'), JSON.stringify({ state: 'done', profile: 'bep-1', finishedMs: 0 }));
  fs.writeFileSync(path.join(d, 'timeline.json'), JSON.stringify({ ...tl, scenes: [] }));
  const r = P.learnFromProject(d);
  assert.equal(r.ok, true); assert.equal(r.profile, 'bep-ngon'); assert.equal(r.name, 'Bếp Ngon');
  assert.equal(Object.keys(P.getProfile('bep-ngon').learned.projects).length, 1);
  assert.equal(P.learnFromProject(d).ok, true); assert.equal(Object.keys(P.getProfile('bep-ngon').learned.projects).length, 1, 'lưu lại cùng dự án không đếm đôi');
});

test('styles.json hỏng: báo lỗi, không ghi đè bằng bản rỗng', () => {
  const f = path.join(HOME, 'styles.json'), keep = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, '{hỏng');
  assert.throws(() => P.patchStyle('chung', st => { st.sound = 'off'; }), /styles\.json hỏng/);
  assert.equal(fs.readFileSync(f, 'utf8'), '{hỏng');
  fs.writeFileSync(f, keep);
});

// fake ctx của server + gọi route như server.mjs
const mkCtx = () => { const ctx = { out: null, code: 200, json(res, o, c = 200) { ctx.out = o; ctx.code = c; }, body: async req => req._body || {}, project: null }; return ctx; };
const call = async (handler, ctx, method, url, body) => { const u = new URL('http://x' + url); const req = Object.assign(Readable.from([]), { method, _body: body }); await handler(req, {}, u.pathname, u); return { out: ctx.out, code: ctx.code }; };

test('route trang Thương hiệu: /api/brands/styles, /api/brands/style save|reset, xoá thương hiệu bỏ phong cách', async () => {
  const B = await import(R('studio/routes/51_brands.mjs'));
  const ctx = mkCtx(), h = B.default(ctx);
  const g = await call(h, ctx, 'GET', '/api/brands/styles');
  assert.equal(g.code, 200); assert.equal(g.out.list[0].id, 'chung'); assert.ok('learnedNotes' in g.out.list[0]); assert.ok(g.out.migrated.notes.length);
  const s = await call(h, ctx, 'POST', '/api/brands/style', { action: 'save', id: 'chung', style: { music: 'off' } });
  assert.equal(s.code, 200); assert.equal(s.out.styles.list[0].music, 'off');
  assert.equal((await call(h, ctx, 'POST', '/api/brands/style', { action: 'save', id: 'khong-co', style: {} })).code, 404);
  assert.equal((await call(h, ctx, 'POST', '/api/brands/style', { action: 'xoa', id: 'chung' })).code, 400);
  assert.equal((await call(h, ctx, 'POST', '/api/brands/style', { action: 'reset', id: 'bep-ngon' })).code, 200);
  assert.equal(P.getProfile('bep-ngon').learned, null);
  assert.ok(P.loadStyles().styles['moi-tinh']);
  assert.equal((await call(h, ctx, 'POST', '/api/brands/delete', { id: 'moi-tinh' })).code, 200);
  assert.ok(!P.loadStyles().styles['moi-tinh'], 'phong cách đi theo thương hiệu bị xoá');
  // review M133: id của thương hiệu đã xoá (mục cũ trong queue.json / autopilot.json / Telegram) → Chung, không ném lỗi
  assert.equal(P.getProfile('moi-tinh').id, 'chung');
  assert.equal(P.resolveStyleId('moi-tinh'), 'chung');
});

test('autopilot: --brand chọn phong cách của thương hiệu; --profile cũ vẫn nhận', async () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'autopilot.mjs'), 'utf8');
  assert.match(src, /const styleRef = typeof brandArg === 'string' \? \(brandArg && brandArg !== '__none' \? brandArg : 'chung'\) : profId;/);
  assert.match(src, /getProfile\(styleRef \|\| st\?\.profile\)/);
  assert.equal(P.getProfile('bep-2').id, 'bep-ngon');
});

test('brands.json hỏng lúc chuyển: báo lỗi, không ghi styles.json (không chuyển nhầm về Chung)', async () => {
  const { execFileSync } = await import('node:child_process');
  const H2 = path.join(TMP, 'home2'); fs.mkdirSync(H2, { recursive: true });
  fs.writeFileSync(path.join(H2, 'brands.json'), '{hỏng'); fs.writeFileSync(path.join(H2, 'profiles.json'), oldText);
  const code = `import(${JSON.stringify(R('scripts/profile.mjs'))}).then(P => { try { P.loadStyles(); console.log('ok'); } catch (e) { console.log('ERR ' + e.message); } })`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, AVS_HOME: H2 }, encoding: 'utf8' });
  assert.match(out, /^ERR brands\.json hỏng/);
  assert.ok(!fs.existsSync(path.join(H2, 'styles.json')));
});
