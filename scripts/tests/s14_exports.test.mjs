// Test S14 M112: lịch sử xuất (.studio/exports.json, scripts/exports_log.mjs) và route studio/routes/55_exports.mjs.
// Nhặt bản cũ trong out/, ghi job xuất vừa xong (GET + POST không trùng), file bị xoá chỉ đánh dấu, exports.json bị sửa tay
// trỏ ra ngoài dự án / Kho thì bị lọc, giao lại vào Thành phẩm đi qua kho_deliver (có ghi sổ delivered.json).
// Chạy: node --test scripts/tests/s14_exports.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-exports-')));
const HOME = path.join(TMP, 'home'), USER = path.join(TMP, 'user'), KHO = path.join(TMP, 'Kho');
process.env.AVS_HOME = HOME; process.env.HOME = USER; process.env.USERPROFILE = USER;
const put = (f, s = 'x') => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); return f; };
put(path.join(KHO, '.kho.json'), JSON.stringify({ version: 1, brand: 'nha-dep', title: 'Nhà Đẹp' }));
const proj = path.join(KHO, 'Du an', 'quay 1');
put(path.join(proj, 'timeline.json'), JSON.stringify({ width: 1080, height: 1920, duration: 10 }));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const LOG = path.join(proj, '.studio', 'exports.json');
const age = (f, sec) => { const t = new Date(Date.now() - sec * 1000); fs.utimesSync(f, t, t); };

let project = { dir: proj }, job = null;
const ctx = {
  json: (res, o, code = 200) => { res.code = code; res.body = o; },
  body: async req => req.body || {},
  get project() { return project; }, get job() { return job; },
  readProject: () => ({ timeline: JSON.parse(fs.readFileSync(path.join(proj, 'timeline.json'), 'utf8')) }),
};
const handler = (await import('../../studio/routes/55_exports.mjs')).default(ctx);
const call = async (p, method = 'GET', body) => { const res = {}; const ok = await handler({ method, body }, res, p); return { ok, ...res }; };

test('dự án chưa có exports.json: nhặt video cũ trong out/ (mới nhất trước), ghi file', async () => {
  age(put(path.join(proj, 'out', 'cu.mp4'), 'aaaa'), 300);
  age(put(path.join(proj, 'out', 'moi.mp4'), 'bbbbbb'), 60);
  put(path.join(proj, 'out', 'cover.jpg'));
  const r = await call('/api/exports');
  assert.equal(r.code, 200);
  assert.ok(['win', 'mac', 'linux'].includes(r.body.os));
  assert.deepEqual(r.body.items.map(x => x.files[0].file), ['out/moi.mp4', 'out/cu.mp4']);
  const x = r.body.items[0];
  assert.equal(x.legacy, true); assert.equal(x.files[0].size, 6); assert.equal(x.files[0].exists, true); assert.equal(x.missing, false);
  assert.equal(x.files[0].abs, path.join(proj, 'out', 'moi.mp4'));
  assert.ok(fs.existsSync(LOG));
});

test('job xuất vừa xong: GET và POST record cùng lúc chỉ ghi một bản; giao diện bổ sung chất lượng và đoạn', async () => {
  put(path.join(proj, 'out', 'quay 1_2026.mp4'), 'cccccccc');
  put(path.join(proj, 'out', 'quay 1_2026_1x1.mp4'), 'dd');
  job = { kind: 'export', state: 'done', started: 1763350000000, out: 'out/quay 1_2026.mp4',
    outs: [{ aspect: '9:16', out: 'out/quay 1_2026.mp4', note: 'Bản gốc (render thật)' }, { aspect: '1:1', out: 'out/quay 1_2026_1x1.mp4', note: 'cắt bám mặt' }],
    delivered: [], deliverError: 'Kho đầy' };
  const [g, p] = await Promise.all([call('/api/exports'), call('/api/exports/record', 'POST', { quality: '720', from: 2, to: 8 })]);
  assert.equal(g.code, 200); assert.equal(p.code, 200); assert.equal(p.body.ok, true);
  const items = (await call('/api/exports')).body.items;
  const mine = items.filter(x => x.id === '1763350000000');
  assert.equal(mine.length, 1);
  const x = mine[0];
  assert.equal(items[0].id, x.id, 'bản mới nhất đứng đầu');
  assert.equal(x.quality, '720'); assert.deepEqual(x.range, { from: 2, to: 8 });
  assert.deepEqual(x.files.map(f => [f.file, f.aspect, f.size]), [['out/quay 1_2026.mp4', '9:16', 8], ['out/quay 1_2026_1x1.mp4', '1:1', 2]]);
  assert.equal(x.deliverError, 'Kho đầy'); assert.equal(x.deliveredNow, 0);
  // gọi lại không thêm bản
  await call('/api/exports/record', 'POST', {});
  assert.equal(JSON.parse(fs.readFileSync(LOG, 'utf8')).items.filter(y => y.id === x.id).length, 1);
});

test('job không phải xuất / chưa xong: không ghi', async () => {
  const before = fs.readFileSync(LOG, 'utf8');
  job = { kind: 'export', state: 'running', started: 1, out: null };
  assert.equal((await call('/api/exports/record', 'POST', {})).code, 404);
  job = { kind: 'new', state: 'done', started: 2, out: proj };
  assert.equal((await call('/api/exports/record', 'POST', {})).code, 404);
  assert.equal(fs.readFileSync(LOG, 'utf8'), before);
});

test('file bị xoá ngoài Studio: đánh dấu, không lỗi', async () => {
  fs.rmSync(path.join(proj, 'out', 'cu.mp4'));
  const r = await call('/api/exports');
  assert.equal(r.code, 200);
  const x = r.body.items.find(y => y.files[0].file === 'out/cu.mp4');
  assert.equal(x.files[0].exists, false); assert.equal(x.missing, true);
});

test('exports.json bị sửa tay trỏ ra ngoài dự án / Kho: bị lọc', async () => {
  const outside = put(path.join(TMP, 'ngoai.mp4'));
  const j = JSON.parse(fs.readFileSync(LOG, 'utf8'));
  j.items.push({ id: 'xau', at: new Date().toISOString(), files: [{ file: '../../../ngoai.mp4' }, { file: outside }] });
  j.items.push({ id: 'xau2', at: '2020-01-01T00:00:00.000Z', files: [{ file: 'out/moi.mp4' }], delivered: [outside, path.join(KHO, 'Thanh pham', '..', '..', 'ngoai.mp4')] });
  fs.writeFileSync(LOG, JSON.stringify(j));
  const items = (await call('/api/exports')).body.items;
  assert.ok(!items.some(x => x.id === 'xau'));
  assert.deepEqual(items.find(x => x.id === 'xau2').delivered, []);
  assert.ok(!JSON.stringify(items).includes('ngoai.mp4'));
});

test('giao lại vào Thành phẩm: qua kho_deliver, ghi sổ, bản giao hiện ở deliveredTo', async () => {
  const r = await call('/api/exports/deliver', 'POST', { id: '1763350000000' });
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.ok, true);
  const x = r.body.item;
  assert.equal(x.deliverError, null); assert.equal(x.deliveredNow, 2); assert.equal(x.delivered.length, 2);
  for (const f of x.files) { assert.ok(f.deliveredTo.startsWith(path.join(KHO, 'Thanh pham'))); assert.ok(fs.existsSync(f.deliveredTo)); }
  const ledger = JSON.parse(fs.readFileSync(path.join(proj, '.studio', 'delivered.json'), 'utf8')).items;
  assert.ok(ledger.some(l => l.src === 'out/quay 1_2026.mp4'));
  // bản giao bị xoá / đổi tên trong Thành phẩm: không còn tính là đã giao (Windows: rmSync ngay sau khi giao có thể còn "chờ xoá")
  fs.renameSync(x.files[1].deliveredTo, x.files[1].deliveredTo + ".bo");
  const y = (await call('/api/exports')).body.items.find(z => z.id === x.id);
  assert.equal(y.deliveredNow, 1); assert.equal(y.files[1].deliveredTo, null);
});

test('id lạ, file đã mất, chưa mở dự án, đường khác', async () => {
  assert.equal((await call('/api/exports/reveal', 'POST', { id: 'khong-co' })).code, 404);
  assert.equal((await call('/api/exports/copy', 'POST', { id: 'khong-co' })).code, 404);
  assert.equal((await call('/api/exports/deliver', 'POST', { id: 'khong-co' })).code, 404);
  const old = (await call('/api/exports')).body.items.find(y => y.files[0].file === 'out/cu.mp4');
  assert.equal((await call('/api/exports/deliver', 'POST', { id: old.id })).code, 404);
  assert.equal((await call('/api/other')).ok, false);
  project = null;
  assert.equal((await call('/api/exports')).code, 400);
  project = { dir: proj };
});

test('latestExport cho M113/M114: bản mới nhất, null khi chưa có', async () => {
  const { latestExport } = await import('../exports_log.mjs');
  assert.equal(latestExport(proj).id, '1763350000000');
  assert.equal(latestExport(path.join(TMP, 'khong-co')), null);
});
