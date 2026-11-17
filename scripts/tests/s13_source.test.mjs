// Test S13 M107: route thẻ "Video nguồn" (studio/routes/14_source.mjs) — đọc source.json, video trong / ngoài Kho,
// dự án cũ chưa ghi video gốc, đường dẫn trong source.json trỏ ra ngoài Kho không bị coi là trong Kho.
// Chạy: node --test scripts/tests/s13_source.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-source-')));
const HOME = path.join(TMP, 'home'), USER = path.join(TMP, 'user'), KHO = path.join(TMP, 'Kho');
process.env.AVS_HOME = HOME; process.env.HOME = USER; process.env.USERPROFILE = USER;
const put = (f, s = 'x') => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); return f; };
put(path.join(HOME, 'brands.json'), JSON.stringify({ version: 1, brands: [{ id: 'nha-dep', title: 'Nhà Đẹp', workspace: KHO }] }));
put(path.join(KHO, '.kho.json'), JSON.stringify({ version: 1, brand: 'nha-dep', title: 'Nhà Đẹp' }));
put(path.join(KHO, 'Nguon', 'quay 1.mp4'), 'video');
const proj = path.join(KHO, 'Du an', 'quay 1');
put(path.join(proj, 'timeline.json'), '{}');
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

let project = { dir: proj };
const ctx = { json: (res, o, code = 200) => { res.code = code; res.body = o; }, get project() { return project; }, readProject: () => ({ timeline: {} }) };
const handler = (await import('../../studio/routes/14_source.mjs')).default(ctx);
const call = async (p, method = 'GET') => { const res = {}; const ok = await handler({ method }, res, p); return { ok, ...res }; };
const src = o => fs.writeFileSync(path.join(proj, 'source.json'), JSON.stringify({ version: 1, kho: 'nha-dep', ...o }));

test('video trong Kho: tên, đường dẫn tương đối, dung lượng, thư mục Thả vào đây', async () => {
  src({ video: 'Nguon/quay 1.mp4', abs: null, name: 'quay 1.mp4', size: 5 });
  const r = await call('/api/source');
  assert.equal(r.code, 200);
  assert.equal(r.body.name, 'quay 1.mp4'); assert.equal(r.body.rel, 'Nguon/quay 1.mp4');
  assert.equal(r.body.inKho, true); assert.equal(r.body.exists, true); assert.equal(r.body.size, 5);
  assert.equal(r.body.kho.title, 'Nhà Đẹp'); assert.equal(r.body.kho.found, 'kho');
  assert.equal(r.body.inbox, path.join(KHO, 'Nguon', 'Tha vao day'));
});

test('video ngoài Kho: không trả đường dẫn tuyệt đối, không mở thư mục', async () => {
  const out = put(path.join(TMP, 'ngoai.mp4'));
  src({ video: null, abs: out, name: 'ngoai.mp4' });
  const r = await call('/api/source');
  assert.equal(r.body.inKho, false); assert.equal(r.body.rel, null); assert.equal(r.body.exists, true);
  assert.ok(!JSON.stringify(r.body).includes(out.replace(/\\/g, '\\\\')));
  const v = await call('/api/source/reveal', 'POST');
  assert.equal(v.code, 404);
});

test('source.json trỏ ra ngoài Kho bằng ../ thì không tính là trong Kho', async () => {
  put(path.join(TMP, 'tron.mp4'));
  src({ video: '../tron.mp4', name: 'tron.mp4' });
  const r = await call('/api/source');
  assert.equal(r.body.inKho, false); assert.equal(r.body.rel, null);
  assert.equal((await call('/api/source/reveal', 'POST')).code, 404);
});

test('dự án cũ không có source.json, chưa mở dự án, đường khác', async () => {
  fs.rmSync(path.join(proj, 'source.json'));
  const r = await call('/api/source');
  assert.equal(r.body.name, null); assert.equal(r.body.inKho, false);
  assert.equal((await call('/api/other')).ok, false);
  project = null;
  assert.equal((await call('/api/source')).code, 400);
});
