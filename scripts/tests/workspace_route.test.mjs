// Test M97: route Kho (studio/routes/12_workspace.mjs) — đặt/tạo Kho, tải lên đúng thư mục con, không ghi ra ngoài Kho.
// Chạy: node --test scripts/tests/workspace_route.test.mjs
// AVS_HOME và thư mục người dùng (HOME/USERPROFILE → Kho mặc định) đều là thư mục tạm; hộp chọn thư mục tắt bằng AVS_NO_FOLDER_DIALOG.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const TMP = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-kho-route-')));
const HOME = path.join(TMP, 'home'), USER = path.join(TMP, 'user');
fs.mkdirSync(HOME, { recursive: true }); fs.mkdirSync(USER, { recursive: true });
process.env.AVS_HOME = HOME; process.env.HOME = USER; process.env.USERPROFILE = USER; process.env.AVS_NO_FOLDER_DIALOG = '1';
fs.writeFileSync(path.join(HOME, 'brands.json'), JSON.stringify({ version: 1, brands: [{ id: 'nha-dep-ab12', title: 'Nhà Đẹp' }, { id: 'khac-cd34', title: 'Khác' }] }));

const { readJson } = await import('../../studio/security.mjs');
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const sendFile = (req, res, f) => { res.writeHead(200); fs.createReadStream(f).pipe(res); };
const mod = await import('../../studio/routes/12_workspace.mjs');
const handler = mod.default({ json, sendFile, body: req => readJson(req) });
const app = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try { if (!(await handler(req, res, u.pathname, u))) json(res, { error: 'not found' }, 404); }
  catch (e) { if (!res.headersSent) json(res, { error: e.message }, e.status || 500); }
});
await new Promise(ok => app.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${app.address().port}`;
after(() => { app.closeAllConnections?.(); app.close(); fs.rmSync(TMP, { recursive: true, force: true }); });
const get = async p => { const r = await fetch(BASE + p); return { status: r.status, j: await r.json() }; };
const post = async (p, b) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: Buffer.isBuffer(b) ? b : JSON.stringify(b ?? {}) });
  return { status: r.status, j: await r.json() };
};
const KHO = path.join(TMP, 'Kho Nha Dep');
const brands = () => JSON.parse(fs.readFileSync(path.join(HOME, 'brands.json'), 'utf8')).brands;

test('GET: Kho chưa có → exists false, danh sách rỗng; brand lạ 404, mã sai 400, kind lạ 400', async () => {
  let r = await get('/api/kho?brand=nha-dep-ab12');
  assert.equal(r.status, 200);
  assert.equal(r.j.ws.exists, false); assert.deepEqual(r.j.items, []);
  assert.ok(r.j.ws.root.startsWith(USER), 'Kho mặc định nằm trong thư mục người dùng tạm');
  assert.equal((await get('/api/kho?brand=khong-co')).status, 404);
  assert.equal((await get('/api/kho?brand=../x')).status, 400);
  assert.equal((await get('/api/kho?kind=exe')).status, 400);
  r = await get('/api/kho');
  assert.equal(r.j.ws.title, 'Chung');
  // tải lên khi Kho chưa tạo/chọn → 409, không sinh thư mục Kho chưa đăng ký
  const up = await post('/api/kho/upload?brand=nha-dep-ab12&name=a.mp4', Buffer.from('x'));
  assert.equal(up.status, 409);
  assert.equal(fs.existsSync(path.join(USER, process.platform === 'darwin' ? 'Movies' : 'Videos')), false);
});

test('set: thư mục không có 400, brand lạ 404, thư mục cấu hình 400, hợp lệ ghi brand kit; Kho của thương hiệu khác 409', async () => {
  assert.equal((await post('/api/kho/set', { brand: 'nha-dep-ab12', dir: KHO })).status, 400, 'mustExist');
  assert.equal(fs.existsSync(KHO), false, 'không tạo thư mục khi gõ nhầm');
  fs.mkdirSync(KHO);
  assert.equal((await post('/api/kho/set', { brand: 'khong-co', dir: KHO })).status, 404);
  assert.equal((await post('/api/kho/set', { brand: 'nha-dep-ab12', dir: HOME })).status, 400);
  assert.equal((await post('/api/kho/set', { brand: 'nha-dep-ab12' })).status, 400);
  assert.equal((await post('/api/kho/set', { brand: 'nha-dep-ab12', dir: 'tuong/doi' })).status, 400);
  const r = await post('/api/kho/set', { brand: 'nha-dep-ab12', dir: KHO });
  assert.equal(r.status, 200); assert.equal(r.j.ws.root, KHO); assert.equal(r.j.ws.custom, true);
  assert.equal(brands().find(b => b.id === 'nha-dep-ab12').workspace, KHO);
  const c = await post('/api/kho/set', { brand: 'khac-cd34', dir: KHO });
  assert.equal(c.status, 409);
  assert.equal(brands().find(b => b.id === 'khac-cd34').workspace, undefined);
});

test('create: Kho mặc định trong <Videos>/AI Video Studio, tạo thư mục con, ghi đường dẫn vào brand kit', async () => {
  const r = await post('/api/kho/create', { brand: 'khac-cd34' });
  assert.equal(r.status, 200);
  assert.ok(r.j.ws.root.startsWith(path.join(USER, process.platform === 'darwin' ? 'Movies' : 'Videos', 'AI Video Studio')));
  for (const d of ['Nguon', 'Anh', 'BRoll', 'Nhac', 'Thuong hieu', path.join('Nguon', 'Tha vao day')]) assert.ok(fs.existsSync(path.join(r.j.ws.root, d)), d);
  assert.equal(brands().find(b => b.id === 'khac-cd34').workspace, r.j.ws.root);
  assert.equal((await post('/api/kho/create', { brand: 'khong-co' })).status, 404);
});

test('upload: theo loại vào đúng thư mục con, to= chọn thư mục, tên trùng thêm (2), loại lạ 400', async () => {
  let r = await post('/api/kho/upload?brand=nha-dep-ab12&name=clip%20quay.MP4', Buffer.from('v1'));
  assert.equal(r.status, 200); assert.equal(r.j.rel, 'Nguon/clip quay.mp4'); assert.equal(r.j.kind, 'video');
  r = await post('/api/kho/upload?brand=nha-dep-ab12&name=clip%20quay.mp4', Buffer.from('v2'));
  assert.equal(r.j.rel, 'Nguon/clip quay (2).mp4');
  assert.equal(fs.readFileSync(path.join(KHO, 'Nguon', 'clip quay.mp4'), 'utf8'), 'v1', 'không ghi đè file cũ');
  r = await post('/api/kho/upload?brand=nha-dep-ab12&name=a.jpg', Buffer.from('i'));
  assert.equal(r.j.rel, 'Anh/a.jpg');
  r = await post('/api/kho/upload?brand=nha-dep-ab12&name=b.mp4&to=broll', Buffer.from('b'));
  assert.equal(r.j.rel, 'BRoll/b.mp4');
  r = await post('/api/kho/upload?brand=nha-dep-ab12&name=n.mp3', Buffer.from('n'));
  assert.equal(r.j.rel, 'Nhac/n.mp3');
  assert.equal((await post('/api/kho/upload?brand=nha-dep-ab12&name=x.exe', Buffer.from('x'))).status, 400);
  assert.equal((await post('/api/kho/upload?brand=nha-dep-ab12&name=x.mp4&to=projects', Buffer.from('x'))).status, 400);
  assert.equal((await post('/api/kho/upload?brand=khong-co&name=x.mp4', Buffer.from('x'))).status, 404);
  const g = await get('/api/kho?brand=nha-dep-ab12');
  assert.equal(g.j.items.length, 5);
  assert.deepEqual(new Set(g.j.items.map(i => i.dir)), new Set(['Nguon', 'Anh', 'BRoll', 'Nhac']));
  assert.equal((await get('/api/kho?brand=nha-dep-ab12&kind=video')).j.items.length, 3);
});

test('upload: tên có đường dẫn / ".." không ra ngoài Kho', async () => {
  const before = fs.readdirSync(TMP).sort();
  for (const n of ['../../thoat.mp4', '..\\..\\thoat.mp4', '/etc/thoat.mp4', 'C:\\Windows\\thoat.mp4']) {
    const r = await post(`/api/kho/upload?brand=nha-dep-ab12&name=${encodeURIComponent(n)}`, Buffer.from('x'));
    assert.equal(r.status, 200, n);
    assert.ok(path.resolve(r.j.path).startsWith(path.join(KHO, 'Nguon') + path.sep), n);
  }
  assert.deepEqual(fs.readdirSync(TMP).sort(), before);
  assert.equal(fs.existsSync(path.join(HOME, 'thoat.mp4')), false);
});

test('file: chỉ phục vụ ảnh trong Kho', async () => {
  let r = await fetch(`${BASE}/api/kho/file?brand=nha-dep-ab12&rel=${encodeURIComponent('Anh/a.jpg')}`);
  assert.equal(r.status, 200); assert.equal(await r.text(), 'i');
  for (const rel of ['Nguon/clip quay.mp4', '../home/brands.json', '.kho.json', '../Kho Nha Dep/Anh/a.jpg/../../../x.jpg']) {
    r = await fetch(`${BASE}/api/kho/file?brand=nha-dep-ab12&rel=${encodeURIComponent(rel)}`);
    assert.equal(r.status, 404, rel); await r.text();
  }
});

test('pick-folder: không có hộp chọn → unsupported; reveal Kho chưa có → 404', async () => {
  assert.deepEqual((await post('/api/kho/pick-folder', {})).j, { unsupported: true });
  assert.equal((await post('/api/kho/reveal', { brand: '' })).status, 404);
  assert.equal((await post('/api/kho/reveal', { brand: 'khong-co' })).status, 404);
});

test('51_brands: lưu giữ khoá workspace, thẻ có ws, nhân bản không mang Kho, logo gốc vào Thuong hieu/', async () => {
  const bh = (await import('../../studio/routes/51_brands.mjs')).default({ json, sendFile, body: req => readJson(req), project: null });
  const srv = http.createServer(async (req, res) => { const u = new URL(req.url, 'http://x'); if (!(await bh(req, res, u.pathname, u))) json(res, { error: 'nf' }, 404); });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const B = `http://127.0.0.1:${srv.address().port}`;
  const bp = async (p, b) => { const r = await fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: Buffer.isBuffer(b) ? b : JSON.stringify(b) }); return { status: r.status, j: await r.json() }; };
  try {
    let r = await bp('/api/brands/save', { brand: { id: 'nha-dep-ab12', title: 'Nhà Đẹp 2', workspace: path.join(TMP, 'khac') } });
    assert.equal(r.status, 200); assert.equal(r.j.ws.root, KHO);
    assert.equal(brands().find(b => b.id === 'nha-dep-ab12').workspace, KHO, 'save không đổi workspace');
    assert.equal(fs.existsSync(path.join(HOME, 'brands.json.lock')), false, 'nhả khoá');
    r = await bp('/api/brands/duplicate', { id: 'nha-dep-ab12' });
    assert.equal(r.status, 200); assert.equal(brands().find(b => b.id === r.j.id).workspace, undefined); assert.notEqual(r.j.ws.root, KHO);
    assert.equal((await bp('/api/brands/duplicate', { id: 'khong-co' })).status, 404);
    // Kho chưa tạo: tải logo không tạo Kho ngầm; tạo Kho thì logo của brand kit được chép vào Thuong hieu/
    const dup = r.j;
    const l = await bp(`/api/brands/logo?id=${dup.id}&name=x.png`, Buffer.from('dup'));
    assert.equal(l.status, 200); assert.equal(fs.existsSync(dup.ws.root), false);
    const c = await post('/api/kho/create', { brand: dup.id });
    assert.equal(c.status, 200);
    assert.equal(fs.readFileSync(path.join(c.j.ws.root, 'Thuong hieu', 'logo.png'), 'utf8'), 'dup');
    r = await bp('/api/brands/logo?id=nha-dep-ab12&name=Logo%20moi.png', Buffer.from('png'));
    assert.equal(r.status, 200); assert.equal(r.j.khoWarning, undefined);
    assert.equal(fs.readFileSync(path.join(KHO, 'Thuong hieu', 'Logo moi.png'), 'utf8'), 'png');
    await bp('/api/brands/logo?id=nha-dep-ab12&name=Logo%20moi.png', Buffer.from('png'));
    assert.deepEqual(fs.readdirSync(path.join(KHO, 'Thuong hieu')), ['Logo moi.png'], 'không chép trùng');
    assert.equal((await bp('/api/brands/delete', { id: '../x' })).status, 404);
    assert.ok(fs.existsSync(KHO));
  } finally { srv.closeAllConnections?.(); srv.close(); }
});

test('pickerCommand: lệnh theo hệ điều hành, tắt bằng biến môi trường', () => {
  assert.equal(mod.pickerCommand('win32', {})[0], 'powershell.exe');
  assert.ok(mod.pickerCommand('win32', {})[1].includes('-STA'));
  assert.equal(mod.pickerCommand('darwin', {})[0], 'osascript');
  assert.equal(mod.pickerCommand('linux', {})[0], 'zenity');
  assert.equal(mod.pickerCommand('aix', {}), null);
  assert.equal(mod.pickerCommand('win32', { AVS_NO_FOLDER_DIALOG: '1' }), null);
  const ps = Buffer.from(mod.pickerCommand('win32', {})[1].at(-1), 'base64').toString('utf16le');
  assert.match(ps, /FolderBrowserDialog/); assert.match(ps, /Chọn thư mục làm Kho/);
});
