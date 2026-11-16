// Dọn file cũ vào Kho (S12 M101): liệt kê không đổi gì, chỉ chuyển mục đã tích theo id, bỏ qua phiên YouTube / hàng đợi /
// file vừa đổi, dự án cũ giữ chỗ và chỉ ghi vào .kho.json, source.json trỏ lại vào Kho, nhánh chép khác ổ và các đường lỗi.
// run: node --test scripts/tests/kho_migrate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as W from '../workspace.mjs';
import * as M from '../kho_migrate.mjs';

const TMP = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-mig-')));
const H = path.join(TMP, 'home'), U = path.join(TMP, 'user'), KHO = path.join(TMP, 'kho');
const OLD = new Date(Date.now() - 3600_000);
const put = (f, s = 'x') => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); fs.utimesSync(f, OLD, OLD); return f; };
fs.mkdirSync(U, { recursive: true });
put(path.join(H, 'brands.json'), JSON.stringify({ version: 1, brands: [{ id: 'nha-dep', title: 'Nhà Đẹp' }] }));
const o = { home: H, userHome: U };
const ws = () => W.workspaceFor('nha-dep', o);
const Q = items => put(path.join(H, 'queue.json'), JSON.stringify({ version: 1, items }));

const up = put(path.join(H, 'uploads', 'clip cu.mp4'), 'video-1');
const ytSess = put(path.join(H, 'uploads', 'abcdef0123456789.json'), '{}');
const inbox = put(path.join(H, 'autopilot', 'inbox', 'tu lai.mov'), 'video-22');
const queued = put(path.join(H, 'longform', '_uploads', 'dang cho.mp4'), 'video-333');
const paused = put(path.join(H, 'telegram', 'inbox', 'tam dung.mp4'), 'v-p');
const watch = put(path.join(U, 'Movies', 'AI Video Studio', 'Thả video vào đây', 'canh.mp4'), 'video-4444');
const mine = put(path.join(TMP, 'footage-cua-toi', 'rieng.mp4'), 'v5');
put(path.join(H, 'autopilot.json'), JSON.stringify({ watch: { on: false, folders: [{ in: path.join(U, 'Movies', 'AI Video Studio', 'Thả video vào đây') }, { in: path.join(TMP, 'footage-cua-toi') }] } }));
Q([{ id: 'a', kind: 'highlights', input: queued, state: 'queued' }, { id: 'p', kind: 'autopilot', input: paused, state: 'paused' }, { id: 'b', kind: 'autopilot', input: up, state: 'done' }]);
const proj = path.join(H, 'footage', 'clip cu_studio');
put(path.join(proj, 'timeline.json'), '{}');
put(path.join(proj, 'source.json'), JSON.stringify({ version: 1, kho: '', video: null, abs: up, name: 'clip cu.mp4', size: 7, sha256: 'abc' }));
put(path.join(H, 'footage', 'clip-mau', 'timeline.json'), '{}');
put(path.join(H, 'longform', 'Buoi live - clip ngan', '01_mo-dau', 'timeline.json'), '{}'); // bố cục thật: <lần chạy>/<NN_slug>
put(path.join(H, 'longform', 'chu-de-ai', 'timeline.json'), '{}'); // video chủ đề: timeline ở gốc lần chạy

test('planMigration: liệt kê video cũ, bỏ phiên YouTube, đánh dấu file trong hàng đợi / tạm dừng / vừa đổi, thư mục của người dùng không tích sẵn', () => {
  W.setWorkspace('nha-dep', KHO, { home: H });
  const fresh = put(path.join(H, 'uploads', 'dang chep.mp4'), 'v'); const now = new Date(); fs.utimesSync(fresh, now, now);
  const before = fs.readdirSync(path.join(H, 'uploads')).sort();
  const p = M.planMigration(ws(), o);
  const by = Object.fromEntries(p.files.map(f => [f.name, f]));
  assert.deepEqual(Object.keys(by).sort(), ['canh.mp4', 'clip cu.mp4', 'dang chep.mp4', 'dang cho.mp4', 'rieng.mp4', 'tam dung.mp4', 'tu lai.mov']);
  assert.equal(by['clip cu.mp4'].dest, 'Nguon'); assert.equal(by['canh.mp4'].dest, 'Nguon/Tha vao day');
  for (const n of ['dang cho.mp4', 'tam dung.mp4', 'dang chep.mp4']) assert.ok(by[n].busy && !by[n].checked, n);
  assert.equal(by['rieng.mp4'].checked, false, 'thư mục canh của người dùng: không tích sẵn');
  assert.equal(by['clip cu.mp4'].checked, true); assert.equal(by['canh.mp4'].checked, true, 'Tự lái tắt: thư mục canh cũ tích sẵn');
  assert.deepEqual(p.projects.map(x => x.name).sort(), ['01_mo-dau', 'chu-de-ai', 'clip cu_studio'], 'không có dự án mẫu clip-mau');
  assert.deepEqual(fs.readdirSync(path.join(H, 'uploads')).sort(), before, 'liệt kê không đổi gì');
  fs.rmSync(fresh);
  // Tự lái đang canh thư mục cũ → không tích sẵn, có ghi chú
  const ap = path.join(H, 'autopilot.json'), s = JSON.parse(fs.readFileSync(ap, 'utf8'));
  fs.writeFileSync(ap, JSON.stringify({ ...s, watch: { ...s.watch, on: true } }));
  const w = M.planMigration(ws(), o).files.find(f => f.name === 'canh.mp4');
  assert.equal(w.checked, false); assert.match(w.note, /đang canh/);
  fs.writeFileSync(ap, JSON.stringify(s));
});

test('applyMigration: chỉ chuyển id đã chọn, không ghi đè, bỏ qua file trong hàng đợi, id lạ không làm gì', async () => {
  const p = M.planMigration(ws(), o), id = n => p.files.find(f => f.name === n).id;
  put(path.join(KHO, 'Nguon', 'clip cu.mp4'), 'co-san'); // trùng tên trong Kho: không ghi đè
  const steps = [];
  const r = await M.applyMigration(ws(), { files: [id('clip cu.mp4'), id('canh.mp4'), id('dang cho.mp4'), 'deadbeefdeadbeef'], projects: [] }, { ...o, onProgress: (i, n) => steps.push(`${i}/${n}`) });
  assert.deepEqual(r.moved.map(m => m.to).sort(), ['Nguon/Tha vao day/canh.mp4', 'Nguon/clip cu (2).mp4']);
  assert.equal(r.failed.length, 1); assert.match(r.failed[0].error, /hàng đợi/);
  assert.equal(r.skipped, 1); assert.deepEqual(steps.at(-1), '3/3');
  assert.equal(fs.readFileSync(path.join(KHO, 'Nguon', 'clip cu.mp4'), 'utf8'), 'co-san');
  assert.equal(fs.readFileSync(path.join(KHO, 'Nguon', 'clip cu (2).mp4'), 'utf8'), 'video-1');
  assert.ok(!fs.existsSync(up) && !fs.existsSync(watch), 'bản cũ đã xoá');
  assert.ok(fs.existsSync(queued) && fs.existsSync(inbox) && fs.existsSync(mine), 'mục không chọn / đang chờ còn nguyên');
  assert.ok(fs.existsSync(ytSess), 'phiên YouTube không bị đụng');
  const s = W.readSource(proj); // source.json của dự án cũ trỏ lại vào Kho, giữ sha256
  assert.equal(s.video, 'Nguon/clip cu (2).mp4'); assert.equal(s.abs, null); assert.equal(s.sha256, 'abc'); assert.equal(s.kho, 'nha-dep');
  assert.deepEqual(r.warn, []);
});

test('applyMigration: file vào hàng đợi giữa lúc liệt kê và lúc chuyển → không chuyển (kiểm lại trong khoá hàng đợi)', async () => {
  const id = M.planMigration(ws(), o).files.find(f => f.name === 'tu lai.mov').id;
  Q([{ id: 'n', kind: 'autopilot', input: inbox, state: 'queued' }]);
  const realPlan = M.planMigration; // lượt liệt kê bên trong applyMigration đã thấy hàng đợi mới → mục bị đánh dấu bận
  const r = await M.applyMigration(ws(), { files: [id] }, o);
  assert.equal(r.moved.length, 0); assert.match(r.failed[0].error, /hàng đợi/); assert.ok(fs.existsSync(inbox));
  assert.equal(realPlan, M.planMigration);
  Q([]);
  // guard của moveFile chạy ngay trước bước chốt: nếu hàng đợi đổi đúng lúc đó thì huỷ, bản cũ còn nguyên
  await assert.rejects(M.moveFile(ws(), inbox, path.join(KHO, 'Nguon'), { guard: () => { throw new Error('vừa vào hàng đợi'); } }), /vừa vào hàng đợi/);
  assert.ok(fs.existsSync(inbox)); assert.ok(!fs.existsSync(path.join(KHO, 'Nguon', 'tu lai.mov')));
});

test('moveFile: khác ổ (không liên kết cứng được) → chép, giữ tên, xoá bản cũ; không để lại .part', async () => {
  const src = put(path.join(TMP, 'o-khac', 'xa.mp4'), 'xa-xa-xa');
  const link = fs.linkSync; fs.linkSync = () => { throw Object.assign(new Error('cross'), { code: 'EXDEV' }); };
  try {
    put(path.join(KHO, 'Nguon', 'xa.mp4'), 'cu');
    const dst = await M.moveFile(ws(), src, path.join(KHO, 'Nguon'));
    assert.equal(path.basename(dst), 'xa (2).mp4'); assert.equal(fs.readFileSync(dst, 'utf8'), 'xa-xa-xa');
    assert.ok(!fs.existsSync(src));
    assert.deepEqual(fs.readdirSync(path.join(KHO, 'Nguon')).filter(f => f.endsWith('.part')), []);
  } finally { fs.linkSync = link; }
});

test('moveFile: xoá bản cũ không được (file đang mở) → bỏ bản mới, bản cũ còn nguyên, báo lỗi 409', async () => {
  const src = put(path.join(TMP, 'dang-mo', 'mo.mp4'), 'mo');
  const unlink = fs.unlinkSync; fs.unlinkSync = f => { if (path.resolve(f) === src) throw Object.assign(new Error('busy'), { code: 'EBUSY' }); return unlink(f); };
  try {
    await assert.rejects(M.moveFile(ws(), src, path.join(KHO, 'Anh')), e => e.status === 409 && /đang được mở/.test(e.message));
    assert.ok(fs.existsSync(src)); assert.ok(!fs.existsSync(path.join(KHO, 'Anh', 'mo.mp4')), 'không để lại bản mới');
  } finally { fs.unlinkSync = unlink; }
});

test('applyMigration: dự án cũ giữ chỗ, ghi vào .kho.json linked một lần, giữ các khoá khác; linked ngoài $AVS_HOME bị bỏ', async () => {
  const p = M.planMigration(ws(), o), pid = p.projects.find(x => x.name === 'clip cu_studio').id;
  const r1 = await M.applyMigration(ws(), { projects: [pid] }, o), r2 = await M.applyMigration(ws(), { projects: [pid] }, o);
  assert.equal(r1.linked, 1); assert.equal(r2.linked, 0);
  const kf = path.join(KHO, '.kho.json'), k = JSON.parse(fs.readFileSync(kf, 'utf8'));
  assert.equal(k.brand, 'nha-dep'); assert.equal(k.linked.length, 1);
  assert.ok(fs.existsSync(path.join(proj, 'timeline.json')), 'dự án không bị chuyển');
  assert.deepEqual(M.linkedProjects(ws(), o).map(x => [x.name, x.id]), [['clip cu_studio', pid]]);
  assert.equal(M.planMigration(ws(), o).projects.find(x => x.id === pid).linked, true);
  // .kho.json nằm trong thư mục người dùng chọn: mục trỏ ra ngoài thư mục của Studio không được mở
  const ngoai = path.join(TMP, 'ngoai-du-an'); put(path.join(ngoai, 'timeline.json'), '{}');
  fs.writeFileSync(kf, JSON.stringify({ ...k, linked: [...k.linked, { dir: ngoai, name: 'la' }] }));
  assert.deepEqual(M.linkedProjects(ws(), o).map(x => x.name), ['clip cu_studio']);
  fs.rmSync(proj, { recursive: true });
  assert.deepEqual(M.linkedProjects(ws(), o), [], 'dự án đã xoá khỏi máy thì không hiện');
});

test('moveFile: đích ngoài Kho bị chặn, không tạo thư mục, file nguồn còn nguyên', async () => {
  const src = put(path.join(TMP, 'x', 'a.mp4'), 'a');
  await assert.rejects(M.moveFile(ws(), src, path.join(TMP, 'ngoai')), /không nằm trong Kho/);
  assert.ok(fs.existsSync(src)); assert.ok(!fs.existsSync(path.join(TMP, 'ngoai')));
});
