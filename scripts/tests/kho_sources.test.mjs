// S12 M98 — bước Nguồn lấy video từ Kho: /api/pick (tải lên vào Nguon/, danh sách video), new_project (dự án trong Du an/ +
// source.json), Video dài/Chủ đề (tải lên, lần chạy trong Du an/), Tự lái (thư mục dự án, thư mục canh Tha vao day/, giao
// hàng vào Thanh pham/), Telegram (Kho nhận video).
// run: node --test scripts/tests/kho_sources.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

const TMP = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m98-')));
const HOME = path.join(TMP, 'home'), USER = path.join(TMP, 'user');
fs.mkdirSync(HOME, { recursive: true }); fs.mkdirSync(USER, { recursive: true });
// Kho mặc định nằm dưới thư mục người dùng: trỏ sang thư mục tạm trước khi nạp module (không đụng ~/Videos thật)
Object.assign(process.env, { AVS_HOME: HOME, USERPROFILE: USER, HOME: USER, AVS_NO_NOTIFY: '1', AVS_NO_LAUNCHCTL: '1' });
fs.writeFileSync(path.join(HOME, 'brands.json'), JSON.stringify({ version: 1, brands: [{ id: 'nha-dep', title: 'Nhà Đẹp' }] }));
fs.writeFileSync(path.join(HOME, 'profiles.json'), JSON.stringify({ version: 1, default: 'mac-dinh', profiles: [{ id: 'mac-dinh', name: 'Mặc định' }, { id: 'kenh-nha', name: 'Kênh nhà', brand: 'nha-dep' }] }));

const R = (...p) => pathToFileURL(path.resolve(import.meta.dirname, '..', '..', ...p)).href;
const W = await import(R('scripts/workspace.mjs'));
const pick = await import(R('studio/routes/26_pick.mjs'));
const { resolveProject, forbiddenDir } = await import(R('studio/security.mjs'));
const VID = path.join(TMP, 'quay', 'clip goc.mp4'); fs.mkdirSync(path.dirname(VID), { recursive: true }); fs.writeFileSync(VID, Buffer.alloc(4096, 7));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// fake ctx của server + gọi route như server.mjs
function mkCtx(extra = {}) {
  const ctx = { out: null, code: 200, json(res, o, c = 200) { ctx.out = o; ctx.code = c; }, body: async req => req._body || {}, SKILL: path.resolve(import.meta.dirname, '..', '..'), HERE: path.resolve(import.meta.dirname, '..', '..', 'studio'), ...extra };
  return ctx;
}
const reqOf = (method, buf = null, body = null) => Object.assign(Readable.from(buf ? [buf] : []), { method, _body: body });
const call = async (handler, ctx, method, url, buf, body) => { const u = new URL('http://x' + url); const ok = await handler(reqOf(method, buf, body), {}, u.pathname, u); return { ok, out: ctx.out, code: ctx.code }; };

test('pick: tải lên vào <Kho>/Nguon/, tên trùng thêm (2), không còn H/uploads', async () => {
  const ctx = mkCtx(), h = pick.default(ctx);
  const a = await call(h, ctx, 'POST', '/api/pick/upload?name=' + encodeURIComponent('Buổi 1.mp4'), Buffer.from('abc'));
  const ws = W.workspaceFor('');
  assert.equal(a.code, 200); assert.equal(a.out.path, path.join(ws.root, 'Nguon', 'Buổi 1.mp4')); assert.equal(a.out.rel, 'Nguon/Buổi 1.mp4'); assert.equal(a.out.size, 3);
  const b = await call(h, ctx, 'POST', '/api/pick/upload?name=' + encodeURIComponent('Buổi 1.mp4'), Buffer.from('abcd'));
  assert.equal(path.basename(b.out.path), 'Buổi 1 (2).mp4');
  assert.ok(!fs.existsSync(path.join(HOME, 'uploads')));
  assert.deepEqual(fs.readdirSync(path.join(ws.root, 'Nguon')).filter(f => f.startsWith('.')), [], 'không còn file .part');
  assert.equal(JSON.parse(fs.readFileSync(path.join(ws.root, '.kho.json'), 'utf8')).brand, '');
  // thương hiệu → Kho riêng
  const c = await call(h, ctx, 'POST', '/api/pick/upload?brand=nha-dep&name=x.mov', Buffer.from('1'));
  assert.equal(path.dirname(c.out.path), path.join(W.workspaceFor('nha-dep').root, 'Nguon'));
  assert.equal((await call(h, ctx, 'POST', '/api/pick/upload?name=a.txt', Buffer.from('1'))).code, 400);
  assert.equal((await call(h, ctx, 'POST', '/api/pick/upload?brand=../x&name=a.mp4', Buffer.from('1'))).code, 400);
});

test('pick: /sources liệt kê video trong Kho, Nguon/ trước, lọc không dấu, bỏ Du an/', async () => {
  const ws = W.workspaceFor('');
  fs.mkdirSync(path.join(ws.root, 'Cu'), { recursive: true }); fs.writeFileSync(path.join(ws.root, 'Cu', 'moi nhat.mp4'), '1');
  fs.mkdirSync(path.join(ws.root, 'Du an', 'p1', 'out'), { recursive: true }); fs.writeFileSync(path.join(ws.root, 'Du an', 'p1', 'out', 'xuat.mp4'), '1');
  const ctx = mkCtx(), h = pick.default(ctx);
  const r = await call(h, ctx, 'GET', '/api/pick/sources');
  assert.equal(r.out.kho.root, ws.root);
  const rels = r.out.items.map(x => x.rel);
  assert.ok(rels.indexOf('Cu/moi nhat.mp4') > rels.indexOf('Nguon/Buổi 1.mp4'), 'Nguon/ đứng trước dù cũ hơn');
  assert.ok(!rels.some(x => x.startsWith('Du an/')));
  assert.equal(r.out.items[0].path, path.join(ws.root, 'Nguon', r.out.items[0].name));
  assert.deepEqual((await call(h, ctx, 'GET', '/api/pick/sources?q=buoi')).out.items.map(x => x.name).sort(), ['Buổi 1 (2).mp4', 'Buổi 1.mp4']);
});

// new_project với bộ chạy giả: không cần whisper/ffmpeg thật
const fakeRun = async (cmd, argv) => {
  const s = argv.find(a => /\.py$/.test(a)) || '';
  if (cmd === 'ffmpeg') { const out = argv[argv.length - 1]; for (let i = 1; i <= 3; i++) fs.writeFileSync(out.replace('%05d', String(i).padStart(5, '0')), 'x'); }
  if (s.endsWith('captions.py')) fs.writeFileSync(argv[argv.indexOf(s) + 2], JSON.stringify([{ words: [{ w: 'Chào.' }] }]));
  if (s.endsWith('find_face.py')) throw new Error('không có mặt');
  return '';
};

test('new_project: không có dir → <Kho>/Du an/<tiêu đề>, ghi source.json (rel, size, sha256), Studio mở được', async () => {
  const { newProject } = await import(R('scripts/new_project.mjs'));
  const ws = W.workspaceFor('nha-dep');
  const inKho = path.join(ws.root, 'Nguon', 'quay 2.mp4'); fs.mkdirSync(path.dirname(inKho), { recursive: true }); fs.writeFileSync(inKho, Buffer.alloc(100, 1));
  const d = await newProject({ video: inKho, title: '3 mẹo: nhà?', brand: 'nha-dep', orient: 'vertical' }, { run: fakeRun });
  assert.equal(d, path.join(ws.root, 'Du an', '3 mẹo nhà'));
  const src = W.readSource(d);
  assert.equal(src.video, 'Nguon/quay 2.mp4'); assert.equal(src.kho, 'nha-dep'); assert.equal(src.abs, null);
  assert.equal(src.size, 100); assert.equal(src.sha256, sha(Buffer.alloc(100, 1)));
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'timeline.json'), 'utf8')).brand.kit, 'nha-dep');
  assert.equal(resolveProject(d).dir, d); assert.equal(forbiddenDir(d), null);
  // không tiêu đề → tên video; lần hai cùng tên → (2); video ngoài Kho → abs
  const d2 = await newProject({ video: VID, orient: 'vertical' }, { run: fakeRun });
  assert.equal(d2, path.join(W.workspaceFor('').root, 'Du an', 'clip goc'));
  assert.equal(W.readSource(d2).abs, VID);
  assert.equal(path.basename(await newProject({ video: VID, orient: 'vertical' }, { run: fakeRun })), 'clip goc (2)');
  // lỗi giữa chừng (vd. whisper): thư mục Studio tự đặt bị dọn, lần thử lại không thành "(3)"
  await assert.rejects(newProject({ video: VID, orient: 'vertical' }, { run: async () => { throw new Error('thiếu numpy'); } }), /numpy/);
  assert.ok(!fs.existsSync(path.join(W.workspaceFor('').root, 'Du an', 'clip goc (3)')));
  // tiêu đề chỉ có dấu chấm không trỏ ra ngoài Du an/, lỗi thì chỉ dọn đúng thư mục đó (Kho còn nguyên)
  const ws0 = W.workspaceFor('');
  await assert.rejects(newProject({ video: VID, title: '..', orient: 'vertical' }, { run: async () => { throw new Error('x'); } }));
  assert.ok(fs.existsSync(path.join(ws0.root, 'Nguon')) && fs.existsSync(path.join(ws0.root, 'Du an', 'clip goc')));
});

test('saveUpload: luồng tải lên bị ngắt → lỗi, không treo, không để lại .part', async () => {
  const d = path.join(TMP, 'up');
  const bad = new Readable({ read() { this.push(Buffer.from('abc')); this.destroy(new Error('ngắt')); } });
  await assert.rejects(W.saveUpload(bad, d, 'a.mp4'), /ngắt/);
  assert.deepEqual(fs.readdirSync(d), []);
});

test('new_project: CLI cũ (kho:false) vẫn tạo cạnh video; video trong H → H/footage', async () => {
  const { newProject } = await import(R('scripts/new_project.mjs'));
  assert.equal(await newProject({ video: VID, orient: 'vertical', kho: false }, { run: fakeRun }), path.join(path.dirname(VID), 'clip goc_studio'));
  const inH = path.join(HOME, 'uploads', 'a.mp4'); fs.mkdirSync(path.dirname(inH), { recursive: true }); fs.writeFileSync(inH, '1');
  assert.equal(await newProject({ video: inH, orient: 'vertical', kho: false }, { run: fakeRun }), path.join(HOME, 'footage', 'a_studio'));
  fs.rmSync(path.join(HOME, 'uploads'), { recursive: true });
});

test('autopilot: dự án mới trong Du an/ của Kho, dự án cũ trong H/autopilot/projects vẫn chạy tiếp ở đó', async () => {
  const A = await import(R('scripts/autopilot.mjs'));
  const ws = W.workspaceFor('nha-dep');
  const d = A.projectDirFor(VID, ws);
  assert.equal(path.dirname(d), path.join(ws.root, 'Du an'));
  assert.match(path.basename(d), /^clip goc-[0-9a-f]{6}$/);
  assert.equal(A.projectDirFor(VID, ws), d, 'cố định để chạy tiếp');
  const old = path.join(HOME, 'autopilot', 'projects', `clip-goc-${path.basename(d).slice(-6)}`); fs.mkdirSync(old, { recursive: true });
  assert.equal(A.projectDirFor(VID, ws), old);
  fs.rmSync(path.join(HOME, 'autopilot'), { recursive: true });
});

test('autopilot deliver: thành phẩm vào <Kho>/Thanh pham/<YYYY-MM>/, --out vẫn chép thêm', async () => {
  const A = await import(R('scripts/autopilot.mjs'));
  const ws = W.workspaceFor('nha-dep'), dir = path.join(ws.root, 'Du an', 'giao');
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({ duration: 3, scenes: [], brand: { kit: 'nha-dep' } }));
  fs.writeFileSync(path.join(dir, 'out', 'giao.mp4'), 'mp4'); fs.writeFileSync(path.join(dir, 'out', 'cover.jpg'), 'jpg');
  const steps = Object.fromEntries(A.STEPS.filter(s => s[0] !== 'deliver').map(([id]) => [id, { state: 'done' }]));
  fs.mkdirSync(path.join(dir, '.studio'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.studio', 'autopilot.json'), JSON.stringify({ version: 1, input: VID, steps, profile: 'kenh-nha', result: { videos: [{ out: 'out/giao.mp4', aspect: '9:16' }], cover: 'out/cover.jpg' } }));
  const extra = path.join(TMP, 'da-xong');
  const r = await A.autopilot(dir, { profile: 'kenh-nha', out: extra });
  const month = new Date().toISOString().slice(0, 7);
  const got = fs.readdirSync(path.join(ws.root, 'Thanh pham', month)).filter(f => !f.startsWith('.')).sort();
  assert.deepEqual(got, ['clip goc - ảnh bìa.jpg', 'clip goc 9x16.mp4']);
  // sổ giao của M100: Đăng / Lịch đăng nhận bản giao của Tự lái là của dự án này
  const K = await import(R('scripts/kho_deliver.mjs'));
  assert.ok(K.deliveredOf(dir, 'out/giao.mp4'), 'delivered.json có bản giao');
  assert.equal(K.originOf(path.join(ws.root, 'Thanh pham', month, 'clip goc 9x16.mp4'))?.project, path.resolve(dir));
  assert.ok(r.outputs.every(f => f.startsWith(path.join(ws.root, 'Thanh pham'))), 'kết quả chính là Thanh pham');
  assert.ok(fs.existsSync(path.join(extra, 'clip goc 9x16.mp4')), '--out vẫn được chép');
});

test('queue: canh Tha vao day/ của mọi Kho đã có, chuyển bản gốc sang Nguon/, hàng đợi mang brand + hồ sơ của thương hiệu', async () => {
  const Q = await import(R('scripts/queue.mjs'));
  assert.deepEqual(Q.loadSettings().watch.folders, [], 'không còn tự canh ~/Movies/… khi thư mục đó chưa có');
  const ws = W.ensureWorkspace(W.workspaceFor('nha-dep'));
  const box = Q.khoInboxes().find(f => f.brand === 'nha-dep');
  assert.equal(box.in, path.join(ws.root, 'Nguon', 'Tha vao day')); assert.equal(box.processed, path.join(ws.root, 'Nguon')); assert.equal(box.profile, 'kenh-nha');
  assert.equal(box.exists, false);
  const st0 = Q.loadSettings(); new Q.Runner({ role: 'test', daemon: true, log: () => {} }).scan(st0);
  assert.ok(!fs.existsSync(box.in), 'lượt quét không tạo thư mục trong Kho');
  fs.mkdirSync(box.in, { recursive: true }); const f = path.join(box.in, 'tha.mp4'); fs.writeFileSync(f, 'v');
  fs.writeFileSync(path.join(ws.root, 'Nguon', 'tha.mp4'), 'cu'); // trùng tên với video gốc đã có: không ghi đè
  const run = new Q.Runner({ role: 'test', daemon: true, log: () => {} });
  const st = Q.loadSettings();
  run.scan(st); for (const v of run.seen.values()) v.since -= 6000; run.scan(st);
  assert.ok(!fs.existsSync(f)); assert.equal(fs.readFileSync(path.join(ws.root, 'Nguon', 'tha.mp4'), 'utf8'), 'cu');
  const it = Q.loadQueue().items.find(x => x.source === 'watch');
  assert.equal(it.input, path.join(ws.root, 'Nguon', 'tha (2).mp4'));
  assert.deepEqual(it.opts, { profile: 'kenh-nha', brand: 'nha-dep' });
  Q.removeItem(it.id);
  // thư mục canh cũ đã có trên máy thì vẫn canh
  fs.mkdirSync(Q.DEFAULT_FOLDER.in, { recursive: true });
  assert.equal(Q.loadSettings().watch.folders[0].in, Q.DEFAULT_FOLDER.in);
  fs.rmSync(path.join(USER, 'Movies'), { recursive: true, force: true });
});

test('Video dài / Chủ đề: tải lên vào Nguon/, lần chạy trong Du an/ được liệt kê và trả file', async () => {
  const lf = await import(R('studio/routes/17_longform.mjs'));
  const ws = W.workspaceFor('nha-dep');
  const ctx = mkCtx({ stamp: () => 'x', startJob: () => false, sendFile: (req, res, f) => { ctx.out = { sent: f }; } }), h = lf.default(ctx);
  const up = await call(h, ctx, 'POST', '/api/longform/upload?brand=nha-dep&name=dai.mp4', Buffer.from('video'));
  assert.equal(up.out.path, path.join(ws.root, 'Nguon', 'dai.mp4'));
  assert.ok(!fs.existsSync(path.join(HOME, 'longform')));
  // job bận → 409, nhưng thư mục định chạy nằm trong Du an/
  const run = path.join(ws.root, 'Du an', 'dai - clip ngắn'); fs.mkdirSync(path.join(run, '01_a', 'out'), { recursive: true });
  fs.writeFileSync(path.join(run, 'highlights.json'), JSON.stringify([{ dir: path.join(run, '01_a'), source: up.out.path, title: 'a' }]));
  fs.writeFileSync(path.join(run, '01_a', 'out', 'a.mp4'), 'mp4');
  const runs = (await call(h, ctx, 'GET', '/api/longform/runs')).out.runs;
  assert.ok(runs.some(r => r.kind === 'highlights' && r.dir === run));
  const list = (await call(h, ctx, 'GET', '/api/longform/list?dir=' + encodeURIComponent(run))).out.items;
  assert.ok(list[0].mp4Url.startsWith('/api/longform/file?p='));
  const okFile = await call(h, ctx, 'GET', '/api/longform/file?p=' + encodeURIComponent(path.join(run, '01_a', 'out', 'a.mp4')));
  assert.equal(okFile.out.sent, path.join(run, '01_a', 'out', 'a.mp4'));
  const bad = await call(h, ctx, 'GET', '/api/longform/file?p=' + encodeURIComponent(path.join(ws.root, 'Nguon', 'dai.mp4')));
  assert.equal(bad.code, 403, 'chỉ Du an/ của Kho, không trả bất kỳ file nào trong Kho');
  const busy = await call(h, ctx, 'POST', '/api/longform/highlights', null, { video: up.out.path, brand: 'nha-dep' });
  assert.equal(busy.code, 409);
});

test('Telegram: video nhận qua bot vào Nguon/ của Kho theo hồ sơ của bot (Kho Chung khi hồ sơ không có thương hiệu)', async () => {
  const T = await import(R('scripts/telegram.mjs'));
  assert.deepEqual(T.khoDrop('kenh-nha'), { brand: 'nha-dep', dir: path.join(W.workspaceFor('nha-dep').root, 'Nguon') });
  assert.equal(T.khoDrop('').dir, path.join(W.workspaceFor('').root, 'Nguon'));
  const v = path.join(W.workspaceFor('nha-dep').root, 'Nguon', 'tele.mp4'); fs.writeFileSync(v, 'v');
  assert.equal(T.safeVideoPath(v), fs.realpathSync(v), 'đường dẫn trong Kho được bot nhận');
});
