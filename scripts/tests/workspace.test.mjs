// Kho dự án theo thương hiệu (S12): đường dẫn, lưu theo brand kit, chặn thư mục cấu hình, liệt kê, liên kết cứng.
// run: node --test scripts/tests/workspace.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as W from '../workspace.mjs';

const TMP = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-ws-')));
const H = path.join(TMP, 'home'), U = path.join(TMP, 'user');
fs.mkdirSync(H, { recursive: true }); fs.mkdirSync(U, { recursive: true });
fs.writeFileSync(path.join(H, 'brands.json'), JSON.stringify({ version: 1, brands: [{ id: 'nha-dep-ab12', title: 'Nhà Đẹp: Sài Gòn?' }] }));
const opt = { home: H, userHome: U };

test('workspaceFor: mặc định <Videos>/AI Video Studio/<tên an toàn>, Kho Chung khi không có thương hiệu', () => {
  const ws = W.workspaceFor('nha-dep-ab12', opt);
  assert.equal(ws.root, path.join(U, process.platform === 'darwin' ? 'Movies' : 'Videos', 'AI Video Studio', 'Nhà Đẹp Sài Gòn'));
  assert.equal(ws.custom, false); assert.equal(ws.brand, 'nha-dep-ab12');
  assert.equal(W.workspaceFor('', opt).title, 'Chung');
  assert.equal(W.workspaceFor('khong-co', opt).brand, '');
});

test('setWorkspace: lưu vào brand kit, tạo .kho.json, không tạo sẵn thư mục con', () => {
  const dir = path.join(TMP, 'kho-nha-dep');
  const ws = W.setWorkspace('nha-dep-ab12', dir, { home: H });
  assert.equal(ws.root, dir); assert.equal(ws.custom, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(H, 'brands.json'), 'utf8')).brands[0].workspace, dir);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.kho.json'), 'utf8')).brand, 'nha-dep-ab12');
  assert.deepEqual(fs.readdirSync(dir), ['.kho.json']);
  assert.equal(W.workspaceFor('nha-dep-ab12', opt).root, dir);
  W.setWorkspace('', path.join(TMP, 'kho-chung'), { home: H });
  assert.equal(W.workspaceFor('', opt).root, path.join(TMP, 'kho-chung'));
});

test('workspaceProblem: chặn thư mục cấu hình, đường dẫn tương đối, gốc ổ đĩa, file', () => {
  assert.ok(W.workspaceProblem(H, H));
  assert.ok(W.workspaceProblem(path.join(H, 'uploads'), H));
  assert.ok(W.workspaceProblem('kho', H));
  assert.ok(W.workspaceProblem(path.parse(TMP).root, H));
  assert.ok(W.workspaceProblem('', H));
  fs.writeFileSync(path.join(TMP, 'f.txt'), 'x'); assert.ok(W.workspaceProblem(path.join(TMP, 'f.txt'), H));
  if (process.platform === 'win32') assert.ok(W.workspaceProblem('\\\\server\\share\\kho', H));
  assert.equal(W.workspaceProblem(path.join(TMP, 'kho-moi'), H), null);
  assert.throws(() => W.setWorkspace('nha-dep-ab12', path.join(H, 'x'), { home: H }), e => e.status === 400);
  assert.throws(() => W.setWorkspace('khong-co', path.join(TMP, 'k2'), { home: H }), e => e.status === 404);
});

test('sub / projectDirFor / deliveredDir / freeName / inWorkspace', () => {
  const ws = W.workspaceFor('nha-dep-ab12', opt);
  assert.equal(W.sub(ws, 'inbox'), path.join(ws.root, 'Nguon', 'Tha vao day'));
  assert.throws(() => W.sub(ws, 'lạ'));
  const p1 = W.projectDirFor(ws, 'clip 1'); fs.mkdirSync(p1);
  assert.equal(path.basename(W.projectDirFor(ws, 'clip 1')), 'clip 1 (2)');
  assert.equal(path.basename(W.deliveredDir(ws, new Date(2026, 10, 16))), '2026-11');
  assert.ok(W.inWorkspace(ws, p1)); assert.ok(!W.inWorkspace(ws, path.join(ws.root, '..', 'x')));
  assert.equal(W.relTo(ws, p1), 'Du an/clip 1');
});

test('listWorkspace: theo loại, bỏ dự án, thành phẩm, khung hình, file ẩn; đọc thư mục có sẵn không theo cấu trúc', () => {
  const ws = W.workspaceFor('nha-dep-ab12', opt), r = ws.root;
  const put = (rel, s = 'x') => { const f = path.join(r, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
  put('Nguon/a.mp4'); put('Anh/sp.jpg'); put('Nhac/nen.mp3'); put('tu-do/cu/b.MOV'); put('.an.mp4');
  put('Du an/clip 1/media/x.jpg'); put('Thanh pham/2026-11/v.mp4'); put('BRoll/c_frames/00001.jpg'); put('lan/du-an-cu/timeline.json'); put('lan/du-an-cu/y.mp4');
  const all = W.listWorkspace(ws).map(i => i.rel).sort();
  assert.deepEqual(all, ['Anh/sp.jpg', 'Nguon/a.mp4', 'Nhac/nen.mp3', 'tu-do/cu/b.MOV']);
  assert.deepEqual(W.listWorkspace(ws, { kind: 'video' }).map(i => i.rel).sort(), ['Nguon/a.mp4', 'tu-do/cu/b.MOV']);
  assert.equal(W.listWorkspace(ws, { max: 2 }).length, 2);
  assert.equal(W.uploadDir('a.MP4'), 'Nguon'); assert.equal(W.uploadDir('a.png'), 'Anh'); assert.equal(W.uploadDir('a.wav'), 'Nhac'); assert.equal(W.uploadDir('a.mp4', 'broll'), 'BRoll');
});

test('linkOrCopy: liên kết cứng cùng ổ, không ghi đè', () => {
  const a = path.join(TMP, 'src.bin'), b = path.join(TMP, 'proj', 'media', 'kho_src.bin');
  fs.writeFileSync(a, 'data');
  assert.ok(['link', 'copy'].includes(W.linkOrCopy(a, b)));
  assert.equal(fs.readFileSync(b, 'utf8'), 'data');
  assert.throws(() => W.linkOrCopy(a, b), e => e.code === 'EEXIST');
});

test('review: không nằm trong H kể cả H/footage, không thư mục dự án, mustExist', () => {
  assert.ok(W.workspaceProblem(path.join(H, 'footage', 'abc'), H));
  assert.ok(W.workspaceProblem(path.join(H, 'autopilot', 'projects', 'x'), H));
  const pj = path.join(TMP, 'mot-du-an'); fs.mkdirSync(pj); fs.writeFileSync(path.join(pj, 'timeline.json'), '{}');
  assert.ok(W.workspaceProblem(pj, H));
  assert.ok(W.workspaceProblem(path.join(TMP, 'go-nham'), H, { mustExist: true }));
  if (process.platform === 'win32') assert.ok(W.workspaceProblem((process.env.SystemRoot || 'C:\\Windows') + '\\Temp\\kho', H));
});

test('review: thương hiệu không còn → Kho Chung đã chọn; Kho đã lưu hỏng → mặc định + cảnh báo', () => {
  W.setWorkspace('', path.join(TMP, 'kho-chung-2'), { home: H });
  assert.equal(W.workspaceFor('da-xoa', opt).root, path.join(TMP, 'kho-chung-2'));
  const f = path.join(H, 'brands.json'), d = JSON.parse(fs.readFileSync(f, 'utf8'));
  d.brands.push({ id: 'hong-1', title: 'Hỏng', workspace: path.join(H, 'x') }); fs.writeFileSync(f, JSON.stringify(d));
  const ws = W.workspaceFor('hong-1', opt); assert.equal(ws.custom, false); assert.ok(ws.warning);
});

test('review: một Kho thuộc một thương hiệu; tên mặc định trùng thì thêm id', () => {
  const f = path.join(H, 'brands.json'), d = JSON.parse(fs.readFileSync(f, 'utf8'));
  d.brands.push({ id: 'a-1', title: 'Trùng Tên' }, { id: 'b-2', title: 'Trùng: Tên' }); fs.writeFileSync(f, JSON.stringify(d));
  const a = W.ensureWorkspace(W.workspaceFor('a-1', opt)), b = W.workspaceFor('b-2', opt);
  assert.notEqual(a.root, b.root); assert.match(path.basename(b.root), /b-2$/);
  assert.throws(() => W.setWorkspace('b-2', a.root, { home: H }), e => e.status === 409);
  assert.throws(() => W.ensureWorkspace({ ...b, root: a.root }), e => e.status === 409);
});

test('review: khoá prototype, Du an/Thanh pham không tải lên được, tên dành riêng của Windows', () => {
  const ws = W.workspaceFor('nha-dep-ab12', opt);
  for (const k of ['constructor', 'toString', '__proto__']) { assert.throws(() => W.sub(ws, k), e => e.status === 400); assert.equal(W.uploadDir('a.mp4', k), null); }
  assert.equal(W.uploadDir('a.mp4', 'projects'), null); assert.equal(W.uploadDir('a.mp4', 'delivered'), null);
  assert.equal(W.safeName('Con'), 'Con_'); assert.equal(W.safeName('aux.txt'), 'aux.txt_'); assert.equal(W.safeName('lpt1'), 'lpt1_');
  assert.ok(!/[. ]$/.test(W.safeName('a'.repeat(79) + '. b')));
});

test('review: junction trong Kho trỏ ra ngoài không qua inWorkspace; linkOrCopy kiểm đích', () => {
  const ws = W.ensureWorkspace(W.workspaceFor('nha-dep-ab12', opt)), out = path.join(TMP, 'ngoai'); fs.mkdirSync(out, { recursive: true });
  const j = path.join(ws.root, 'loi-tat');
  try { fs.symlinkSync(out, j, process.platform === 'win32' ? 'junction' : 'dir'); } catch { return; }
  assert.equal(W.inWorkspace(ws, path.join(j, 'x.mp4')), false);
  fs.writeFileSync(path.join(TMP, 's.bin'), 'x');
  assert.throws(() => W.linkOrCopy(path.join(TMP, 's.bin'), path.join(j, 's.bin'), { ws }), e => e.status === 400);
  assert.equal(W.inWorkspace(ws, path.join(ws.root, 'Nguon', 'moi.mp4')), true);
});

test('review: gốc Kho là dự án → không liệt kê; max cắt sau khi sắp', () => {
  const ws = { root: path.join(TMP, 'goc-du-an') }; fs.mkdirSync(path.join(ws.root, 'media'), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'timeline.json'), '{}'); fs.writeFileSync(path.join(ws.root, 'media', 'a.jpg'), 'x');
  assert.deepEqual(W.listWorkspace(ws), []);
  const w2 = { root: path.join(TMP, 'sap') }; fs.mkdirSync(path.join(w2.root, 'a'), { recursive: true }); fs.mkdirSync(path.join(w2.root, 'z'));
  fs.writeFileSync(path.join(w2.root, 'a', 'cu.jpg'), 'x'); fs.utimesSync(path.join(w2.root, 'a', 'cu.jpg'), 1e6, 1e6);
  fs.writeFileSync(path.join(w2.root, 'z', 'moi.jpg'), 'x');
  assert.equal(W.listWorkspace(w2, { max: 1 })[0].name, 'moi.jpg');
});

test('workspaceOfProject / deliver / writeSource', () => {
  const ws = W.ensureWorkspace(W.workspaceFor('nha-dep-ab12', opt));
  const pd = W.projectDirFor(ws, 'clip x'); fs.mkdirSync(path.join(pd, 'out'), { recursive: true });
  assert.equal(W.workspaceOfProject(pd, null, opt).root, ws.root);
  assert.equal(W.workspaceOfProject(pd, null, opt).found, 'kho');
  const lone = path.join(TMP, 'le', 'p'); fs.mkdirSync(lone, { recursive: true });
  assert.equal(W.workspaceOfProject(lone, { brand: { kit: 'nha-dep-ab12' } }, opt).root, ws.root);
  assert.equal(W.workspaceOfProject(lone, null, opt).found, 'chung');
  const mp4 = path.join(pd, 'out', 'v.mp4'); fs.writeFileSync(mp4, 'v');
  const a = W.deliver(ws, mp4, { name: 'Clip X.mp4', date: new Date(2026, 10, 1) }), b = W.deliver(ws, mp4, { name: 'Clip X.mp4', date: new Date(2026, 10, 1) });
  assert.equal(path.relative(ws.root, a).split(path.sep).join('/'), 'Thanh pham/2026-11/Clip X.mp4');
  assert.equal(path.basename(b), 'Clip X (2).mp4');
  const v = path.join(W.sub(ws, 'source', { mkdir: true }), 'goc.mp4'); fs.writeFileSync(v, 'g');
  assert.equal(W.writeSource(pd, ws, v, { size: 1 }).video, 'Nguon/goc.mp4');
  assert.equal(W.readSource(pd).name, 'goc.mp4');
  assert.equal(W.writeSource(pd, ws, path.join(TMP, 'src.bin')).video, null);
});

test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('M98: allWorkspaces gồm Kho Chung + từng thương hiệu, không trùng gốc', () => {
  const all = W.allWorkspaces(opt);
  assert.ok(all.some(w => w.brand === '') && all.some(w => w.brand === 'nha-dep-ab12'));
  assert.equal(new Set(all.map(w => w.root.toLowerCase())).size, all.length);
});
test('M98: hashFile = sha256 đọc bằng stream', async () => {
  const f = path.join(TMP, 'h.bin'); fs.writeFileSync(f, 'abc');
  assert.equal(await W.hashFile(f), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
