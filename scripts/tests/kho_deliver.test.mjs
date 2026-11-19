// Test S12 M100: giao thành phẩm vào <Kho>/Thanh pham/<YYYY-MM>/ (scripts/kho_deliver.mjs) sau Xuất, hàng loạt, biến thể;
// trùng tên, Kho ở thư mục khác, tắt giao, gói quảng cáo ghi kèm bản giao, Đăng / Lịch đăng thấy video trong Thanh pham/.
// Không render thật: file mp4 giả, render của batch.mjs giả (như batch_runjob.test.mjs).
// Chạy: node --test scripts/tests/kho_deliver.test.mjs
import test, { after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-kho-deliver-'));
const HOME = path.join(TMP, 'cfg'), USER = path.join(TMP, 'user');
fs.mkdirSync(HOME, { recursive: true }); fs.mkdirSync(USER, { recursive: true });
process.env.AVS_HOME = HOME; process.env.USERPROFILE = USER; process.env.HOME = USER; // Kho mặc định: USER/Videos|Movies/AI Video Studio/…
process.env.AVS_NO_SCHEDULE_TIMER = '1';
for (const k of ['AVS_PERF_PROFILE', 'AVS_ENCODER', 'AVS_RENDER_SLOTS', 'AVS_RENDER_PRIORITY', 'AVS_BATCH_PARALLEL']) delete process.env[k];
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const WS = await import('../workspace.mjs');
const K = await import('../kho_deliver.mjs');
const { runJob } = await import('../batch.mjs');
const { deliverVariants } = await import('../variants.mjs');
const A = await import('../ads_pack.mjs');
const { rmSync } = await import('../fs_rm.mjs');

const DATE = new Date(2026, 10, 16), MONTH = '2026-11';
const W = (f, s = 'x') => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof s === 'string' ? s : JSON.stringify(s)); return f; };
const ino = f => fs.statSync(f, { bigint: true }).ino;
const chung = () => WS.ensureWorkspace(WS.workspaceFor(''));
function project(ws, name, tl = {}) {
  const d = WS.projectDirFor(ws, name);
  W(path.join(d, 'timeline.json'), { width: 1080, height: 1920, duration: 10, captions: [], ...tl });
  return d;
}

test('Xuất tại máy: bản gốc + khổ phụ vào Thanh pham/<tháng>/ tên "<dự án> <khổ>.mp4", liên kết cứng, ghi sổ', () => {
  const ws = chung(), d = project(ws, 'Nhà Đẹp');
  const main = W(path.join(d, 'out', 'Nhà Đẹp_20261116-1010.mp4'), 'v916'), sq = W(path.join(d, 'out', 'Nhà Đẹp_20261116-1010_1x1.mp4'), 'v11');
  const r = K.deliverExports(d, [{ src: main, w: 1080, h: 1920 }, { src: sq, aspect: '1:1' }], { date: DATE });
  assert.equal(r.dir, path.join(ws.root, 'Thanh pham', MONTH));
  assert.deepEqual(r.items.map(x => path.basename(x.dst)), ['Nhà Đẹp 9x16.mp4', 'Nhà Đẹp 1x1.mp4']);
  for (const x of r.items) { assert.ok(['link', 'copy'].includes(x.how)); assert.equal(fs.readFileSync(x.dst, 'utf8'), fs.readFileSync(x.src, 'utf8')); }
  if (r.items[0].how === 'link') assert.equal(ino(r.items[0].dst), ino(main), 'cùng ổ: liên kết cứng, không tốn thêm dung lượng');
  assert.equal(K.deliveredOf(d, 'out/Nhà Đẹp_20261116-1010.mp4'), r.items[0].dst);
  assert.equal(K.deliveredOf(d, 'out/khong-co.mp4'), null);
  // render lại cùng tên: xoá rồi ghi file mới → bản đã giao giữ nội dung cũ
  rmSync(main); W(main, 'moi'); // fs.rmSync không xoá đường dẫn có dấu trên Windows (Node 24), xem scripts/fs_rm.mjs
  assert.equal(fs.readFileSync(r.items[0].dst, 'utf8'), 'v916');
});

test('render lại cùng tên: sổ không trả bản giao cũ; bản async + xuất một đoạn có hậu tố; tên rỗng có tên dự phòng', async () => {
  const ws = chung(), d = project(ws, 'Render Lai');
  const src = W(path.join(d, 'out', 'r.mp4'), 'cu');
  const r = await K.deliverExportsAsync(d, [{ src, w: 1080, h: 1920 }], { date: DATE, range: { from: 0, to: 2 } });
  assert.equal(path.basename(r.items[0].dst), 'Render Lai 9x16 đoạn 0-2s.mp4');
  assert.equal(K.deliveredOf(d, 'out/r.mp4'), r.items[0].dst);
  fs.rmSync(src); W(src, 'moi hon'); // render lại: file mới, cùng tên
  assert.equal(K.deliveredOf(d, 'out/r.mp4'), null, 'nguồn đã đổi: không trỏ vào bản giao cũ');
  assert.equal(fs.readFileSync(r.items[0].dst, 'utf8'), 'cu');
  assert.equal(K.fileName('', '.mp4'), 'Thanh pham.mp4');
  assert.equal(K.fileName('😀'.repeat(80), '.mp4'), '😀'.repeat(35) + '.mp4', 'không cắt đôi emoji');
  assert.ok(!fs.readdirSync(r.dir).some(f => f.includes('.part.')), 'không còn file tạm');
});

test('nhánh chép (khác ổ / ổ không có liên kết cứng): qua file tạm, không còn .part, trùng tên ra giờ máy, bản sync và async', async () => {
  const ws = chung(), d = project(ws, 'Chep Khac O');
  const a = W(path.join(d, 'out', 'a.mp4'), 'mot'), b = W(path.join(d, 'out', 'b.mp4'), 'hai');
  const real = fs.linkSync; let tn = ''; // tn: tên có giờ máy của lần giao thứ hai (khai báo trước để dùng ở các lần sau)
  // liên kết từ out/ sang Kho lỗi như khác ổ; liên kết file tạm → tên thật (cùng thư mục) vẫn chạy
  const m = mock.method(fs, 'linkSync', (s, t) => { if (!String(s).includes('.part.')) throw Object.assign(new Error('cross-device'), { code: 'EXDEV' }); return real(s, t); });
  try {
    const r1 = K.deliverExports(d, [{ src: a, w: 1080, h: 1920 }], { date: DATE });
    const r2 = await K.deliverExportsAsync(d, [{ src: b, w: 1080, h: 1920 }], { date: DATE });
    assert.deepEqual([r1.items[0].how, r2.items[0].how], ['copy', 'copy']);
    const [n1, n2] = [r1.items[0].dst, r2.items[0].dst].map(f => path.basename(f));
    assert.equal(n1, 'Chep Khac O 9x16.mp4'); assert.match(n2, /^Chep Khac O 9x16 \d\dh\d\d\.mp4$/); tn = n2.slice(0, -4);
    assert.deepEqual([r1.items[0].dst, r2.items[0].dst].map(f => fs.readFileSync(f, 'utf8')), ['mot', 'hai']);
    assert.ok(!fs.readdirSync(r1.dir).some(f => f.includes('.part.')), 'không còn file tạm');
    assert.equal(K.deliveredOf(d, 'out/a.mp4'), r1.items[0].dst, 'bản chép: sổ so cỡ + mtime của nguồn');
  } finally { m.mock.restore(); }
  // ổ không có liên kết cứng nào (FAT/exFAT): file tạm đổi tên sang tên thật
  const m2 = mock.method(fs, 'linkSync', () => { throw Object.assign(new Error('not supported'), { code: 'EPERM' }); });
  try {
    const r3 = K.deliverExports(d, [{ src: a, w: 1080, h: 1920 }], { date: DATE });
    assert.equal(r3.items[0].how, 'copy'); assert.equal(path.basename(r3.items[0].dst), `${tn} (2).mp4`);
    assert.equal(fs.readFileSync(r3.items[0].dst, 'utf8'), 'mot');
    assert.ok(!fs.readdirSync(r3.dir).some(f => f.includes('.part.')));
    // tên thật bị một lần giao khác lấy mất đúng lúc (giữ chỗ 'wx' báo EEXIST) → sang tên kế, không ghi đè
    const open0 = fs.openSync; let raced = false;
    const m3 = mock.method(fs, 'openSync', (p, fl, ...x) => { if (fl === 'wx' && !raced) { raced = true; open0(p, 'w'); fs.writeFileSync(p, 'cua nguoi khac'); throw Object.assign(new Error('exists'), { code: 'EEXIST' }); } return open0(p, fl, ...x); });
    try {
      const r4 = K.deliverExports(d, [{ src: b, w: 1080, h: 1920 }], { date: DATE });
      assert.equal(path.basename(r4.items[0].dst), `${tn} (4).mp4`);
      assert.equal(fs.readFileSync(path.join(r4.dir, `${tn} (3).mp4`), 'utf8'), 'cua nguoi khac');
    } finally { m3.mock.restore(); }
  } finally { m2.mock.restore(); }
});

test('bản giao bị xoá rồi dự án khác giao trùng tên: sổ của dự án cũ không nhận file đó', () => {
  const ws = chung(), a = project(ws, 'Trung Sau Xoa'), b = path.join(TMP, 'khac', 'Trung Sau Xoa');
  W(path.join(b, 'timeline.json'), { width: 1080, height: 1920 });
  const ra = K.deliverExports(a, [{ src: W(path.join(a, 'out', 'a.mp4'), 'A'), w: 1080, h: 1920 }], { date: DATE }).items[0].dst;
  fs.rmSync(ra);
  const rb = K.deliverExports(b, [{ src: W(path.join(b, 'out', 'b.mp4'), 'B khac co'), w: 1080, h: 1920 }], { date: DATE, ws }).items[0].dst;
  assert.equal(rb, ra, 'cùng tên do freeName');
  assert.equal(K.deliveredOf(a, 'out/a.mp4'), null);
  assert.ok(!K.deliveredKeys(a).has(K.fileKey(rb)));
  assert.ok(K.deliveredKeys(b).has(K.fileKey(rb)));
});

test('trùng tên: lần giao sau thêm giờ máy, không ghi đè bản đã giao', () => {
  const ws = chung(), d = project(ws, 'Trung Ten');
  const a = W(path.join(d, 'out', 'a.mp4'), '1'), b = W(path.join(d, 'out', 'b.mp4'), '2');
  const r1 = K.deliverExports(d, [{ src: a, w: 1080, h: 1920 }], { date: DATE }), r2 = K.deliverExports(d, [{ src: b, w: 1080, h: 1920 }], { date: DATE });
  assert.equal(path.basename(r1.items[0].dst), 'Trung Ten 9x16.mp4');
  assert.match(path.basename(r2.items[0].dst), /^Trung Ten 9x16 \d\dh\d\d\.mp4$/); // S26 M184: giờ máy thay "(2)"
  assert.equal(fs.readFileSync(r1.items[0].dst, 'utf8'), '1');
  assert.equal(K.readLedger(d).length, 2);
});

test('Kho ở thư mục khác (giả lập khác ổ): dự án ngoài Kho, giao theo thương hiệu; link hoặc copy đều được', () => {
  const other = path.join(TMP, 'o-dia-khac', 'Kho Brand');
  W(path.join(HOME, 'brands.json'), { version: 1, brands: [{ id: 'nha-dep', title: 'Nhà Đẹp' }] });
  WS.setWorkspace('nha-dep', other);
  const d = path.join(TMP, 'du-an-ngoai', 'clip'); W(path.join(d, 'timeline.json'), { width: 1280, height: 720, brand: { kit: 'nha-dep' } });
  const src = W(path.join(d, 'out', 'clip_1.mp4'), 'ngang');
  const r = K.deliverExports(d, [{ src, w: 1920, h: 1080 }], { tl: { brand: { kit: 'nha-dep' } }, date: DATE });
  assert.equal(r.ws, path.resolve(other));
  assert.equal(r.items[0].dst, path.join(path.resolve(other), 'Thanh pham', MONTH, 'clip 16x9.mp4'));
  assert.ok(['link', 'copy'].includes(r.items[0].how));
  assert.equal(fs.readFileSync(r.items[0].dst, 'utf8'), 'ngang');
});

test('không ghi ra ngoài Kho: thư mục con tên lạ được làm sạch, writeBeside chỉ cạnh video trong Thanh pham', () => {
  const ws = chung();
  const d = K.deliverFolder(ws, { folder: '../../ra ngoài', date: DATE });
  assert.ok(WS.inWorkspace(ws, d) && d.startsWith(path.join(ws.root, 'Thanh pham', MONTH)));
  const outside = W(path.join(TMP, 'x.mp4'));
  assert.throws(() => K.writeBeside(ws, outside, ' - nội dung đăng.txt', 'x'), /Thanh pham/);
});

// ---------- hàng loạt ----------
const PERF = { profile: 'tiet-kiem', encoder: 'auto', priority: 'normal', slots: 1, workers: null };
function batchJob(ws, lot, extra = {}) {
  const P = project(ws, `Lo ${lot}`), out = path.join(P, 'batch', lot);
  W(path.join(out, 'rows.csv'), 'title\nBan 1\nBan 2\n');
  const jf = W(path.join(out, 'job.json'), { source: { kind: 'template', id: 'x' }, sheet: path.join(out, 'rows.csv'), mapping: {}, quality: '720', out, ...extra });
  return { P, out, jf };
}
const fakes = {
  build: async (job, i) => { const d = path.join(job.out, `0${i + 1}_ban`); fs.mkdirSync(path.join(d, 'out'), { recursive: true }); return { dir: d, tl: { title: `Bản ${i + 1}` } }; },
  render: async dir => W(path.join(dir, 'out', `${path.basename(dir)}.mp4`), dir),
};

test('hàng loạt: mỗi dòng xong → Thanh pham/<tháng>/<tên lô>/<tiêu đề dòng>.mp4', async () => {
  const ws = chung(), J = batchJob(ws, 'khuyen-mai', { name: 'Khuyến mãi' });
  const mon = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const m0 = mon(), st = await runJob(J.jf, { ...fakes, perf: PERF, signals: false }), m1 = mon(); // runJob lấy tháng lúc giao
  assert.deepEqual(st.rows.map(r => r.state), ['done', 'done']);
  const m = path.basename(path.dirname(path.dirname(st.rows[0].delivered)));
  assert.ok([m0, m1].includes(m));
  assert.deepEqual(st.rows.map(r => r.delivered), [1, 2].map(i => path.join(ws.root, 'Thanh pham', m, 'Khuyến mãi', `Bản ${i}.mp4`)));
  for (const r of st.rows) assert.equal(fs.readFileSync(r.delivered, 'utf8'), r.dir);
  assert.equal(JSON.parse(fs.readFileSync(path.join(J.out, 'status.json'), 'utf8')).rows[0].delivered, st.rows[0].delivered);
});

test('hàng loạt: job.deliver = false → không giao gì', async () => {
  const ws = chung(), J = batchJob(ws, 'tat-giao', { deliver: false });
  const st = await runJob(J.jf, { ...fakes, perf: PERF, signals: false });
  assert.deepEqual(st.rows.map(r => r.state), ['done', 'done']);
  assert.ok(st.rows.every(r => !r.delivered));
  assert.ok(!fs.readdirSync(path.join(ws.root, 'Thanh pham'), { recursive: true }).some(f => String(f).includes('tat-giao')));
});

// ---------- biến thể + gói quảng cáo ----------
test('biến thể: Thanh pham/<tháng>/<dự án gốc>/; tắt giao thì không; gói quảng cáo ghi kèm đường dẫn Thanh pham', () => {
  const ws = chung(), base = project(ws, 'Serum', { title: 'Serum B5', ads: { on: true, landing_url: 'https://shop.vd/s' } });
  const list = [1, 2].map(i => {
    const d = `${base}_v${i}`;
    W(path.join(d, 'timeline.json'), { width: 1080, height: 1920, duration: 20, title: `Hook ${i}`, _variant: { base, i, kind: 'hook' } });
    W(path.join(d, 'out', `v${i}__1080x1920__20s.mp4`), `v${i}`);
    return { dir: d, kind: 'hook', name: `Hook ${i}`, video: `out/v${i}__1080x1920__20s.mp4` };
  });
  deliverVariants(base, {}, list.map(v => ({ ...v })), { deliver: false, date: DATE });
  assert.ok(!fs.existsSync(path.join(ws.root, 'Thanh pham', MONTH, 'Serum')));
  deliverVariants(base, {}, list, { date: DATE });
  assert.deepEqual(list.map(v => path.basename(v.delivered)), ['Serum v1 - Hook 1.mp4', 'Serum v2 - Hook 2.mp4']);
  assert.ok(list.every(v => path.dirname(v.delivered) === path.join(ws.root, 'Thanh pham', MONTH, 'Serum')));
  W(path.join(base, 'variants.json'), { base, created: '2026-11-16T00:00:00Z', kind: 'hook', variants: list.map(v => ({ ...v, delivered: undefined })) });
  const probe = f => { const m = /__(\d+)x(\d+)__([\d.]+)s/.exec(path.basename(f)); return { w: +m[1], h: +m[2], dur: +m[3], mb: 8 }; };
  const outDir = path.join(TMP, 'ads');
  const r = A.buildPack(base, { probe, platforms: ['meta'], outDir });
  const man = JSON.parse(fs.readFileSync(path.join(r.packs[0].dir, 'manifest.json'), 'utf8'));
  assert.equal(Object.keys(man.delivered).length, 2);
  assert.deepEqual(Object.values(man.delivered).sort(), list.map(v => v.delivered).sort());
});

// ---------- Đăng / Lịch đăng ----------
function fakeCtx(dir) {
  const out = { body: null };
  const tlFile = dir ? path.join(dir, 'timeline.json') : null;
  const ctx = {
    SKILL: path.resolve(import.meta.dirname, '../..'),
    project: dir ? { dir, tlFile } : null,
    json: (res, o, c = 200) => { res.code = c; res.data = o; },
    body: async req => req.body || {},
    under: (root, rel) => { const f = path.resolve(root, rel); return f.startsWith(root + path.sep) ? f : null; },
    P: rel => path.join(dir, rel),
    readProject: () => ({ timeline: JSON.parse(fs.readFileSync(tlFile, 'utf8')), captions: [] }),
    job: null, startJob: () => false,
  };
  return { ctx, out };
}
async function call(route, p, { method = 'GET', body } = {}) {
  const res = {}, u = new URL('http://x' + p); const handled = await route({ method, body }, res, u.pathname, u);
  return { handled, ...res };
}

test('Đăng: danh sách gồm out/ của dự án (đánh dấu đã giao) + Thanh pham của Kho, bỏ trùng liên kết cứng', async () => {
  const ws = chung(), d = project(ws, 'Dang Bai'), other = project(ws, 'Du An Khac');
  const mine = W(path.join(d, 'out', 'Dang Bai_1.mp4'), 'a');
  const given = K.deliverExports(d, [{ src: mine, w: 1080, h: 1920 }]).items[0].dst;
  const theirs = K.deliverExports(other, [{ src: W(path.join(other, 'out', 'k.mp4'), 'b'), w: 1080, h: 1920 }]).items[0].dst;
  const route = (await import('../../studio/routes/52_publish.mjs')).default(fakeCtx(d).ctx);
  const r = await call(route, '/api/publish/videos');
  const outs = r.data.filter(v => v.src === 'out'), kho = r.data.filter(v => v.src === 'kho');
  assert.deepEqual(outs.map(v => v.path), ['out/Dang Bai_1.mp4']);
  assert.equal(outs[0].delivered, given);
  assert.ok(kho.some(v => v.path === theirs), 'video của dự án khác trong Thanh pham');
  if (K.fileKey(given) === K.fileKey(mine)) assert.ok(!kho.some(v => v.path === given), 'bản liên kết cứng của out/ không hiện hai lần');
  // ngoài Thanh pham: không nhận đường dẫn tuyệt đối
  const bad = await call(route, '/api/publish/check?video=' + encodeURIComponent(W(path.join(TMP, 'la.mp4'))));
  assert.equal(bad.code, 404);
});

test('Đăng: nội dung đăng giao kèm cạnh video trong Thanh pham ("<tên> - nội dung đăng.txt")', async () => {
  const ws = chung(), d = project(ws, 'Noi Dung');
  const mine = W(path.join(d, 'out', 'nd.mp4'), 'a');
  const given = K.deliverExports(d, [{ src: mine, w: 1080, h: 1920 }]).items[0].dst;
  W(path.join(d, 'publish', 'publish.json'), { video: 'out/nd.mp4', platforms: { tiktok: { caption: 'Xin chào', hashtags: ['#a'] } } });
  const route = (await import('../../studio/routes/52_publish.mjs')).default(fakeCtx(d).ctx);
  const r = await call(route, '/api/publish/save', { method: 'POST', body: { platform: 'tiktok', data: { caption: 'Xin chào bạn' } } });
  assert.equal(r.data.ok, true);
  const txt = path.join(path.dirname(given), 'Noi Dung 9x16 - nội dung đăng.txt');
  assert.equal(r.data.delivered, txt);
  assert.match(fs.readFileSync(txt, 'utf8'), /Xin chào bạn/);
  assert.ok(fs.existsSync(path.join(d, 'publish', 'tiktok.txt')));
  // brand kit của timeline đổi sau khi giao (Kho hiện tại khác Kho của bản giao): nội dung vẫn vào cạnh bản giao
  const tl = JSON.parse(fs.readFileSync(path.join(d, 'timeline.json'), 'utf8')); tl.brand = { kit: 'nha-dep' };
  fs.writeFileSync(path.join(d, 'timeline.json'), JSON.stringify(tl)); fs.rmSync(txt);
  const r2 = await call(route, '/api/publish/save', { method: 'POST', body: { platform: 'tiktok', data: { caption: 'Lần hai' } } });
  assert.equal(r2.data.delivered, txt);
  assert.match(fs.readFileSync(txt, 'utf8'), /Lần hai/);
});

test('Đăng: video Thành phẩm của dự án khác không viết nội dung bằng AI; route Thành phẩm không mở đường dẫn lạ', async () => {
  const ws = chung(), d = project(ws, 'Mo Thanh Pham'), other = project(ws, 'Cua Nguoi Khac');
  const theirs = K.deliverExports(other, [{ src: W(path.join(other, 'out', 'k.mp4'), 'b'), w: 1080, h: 1920 }]).items[0].dst;
  const pub = (await import('../../studio/routes/52_publish.mjs')).default(fakeCtx(d).ctx);
  const g = await call(pub, '/api/publish/gen', { method: 'POST', body: { video: theirs } });
  assert.equal(g.code, 400); assert.match(g.data.error, /dự án khác/);
  const list = (await call(pub, '/api/publish/videos')).data;
  assert.equal(list.find(v => v.path === theirs)?.own, false);
  const th = (await import('../../studio/routes/54_thanhpham.mjs')).default(fakeCtx(d).ctx);
  const info = await call(th, '/api/thanhpham');
  assert.equal(info.data.root, path.join(ws.root, 'Thanh pham'));
  for (const bad of [W(path.join(TMP, 'ngoai.mp4')), 'out/x.mp4', path.join(ws.root, 'Nguon', 'a.mp4')]) {
    const r = await call(th, '/api/thanhpham/open', { method: 'POST', body: { path: bad } });
    assert.equal(r.code, 404, bad);
  }
});

test('Lịch đăng: thấy video trong Thanh pham của mọi Kho đã đăng ký (thương hiệu + Chung), không cần mở dự án', async () => {
  W(path.join(HOME, 'brands.json'), { version: 1, brands: [{ id: 'nha-dep', title: 'Nhà Đẹp' }] });
  WS.setWorkspace('nha-dep', path.join(TMP, 'o-dia-khac', 'Kho Brand'));
  const ws = chung(), d = project(ws, 'Lich');
  const a = K.deliverExports(d, [{ src: W(path.join(d, 'out', 'l.mp4'), 'l'), w: 1080, h: 1920 }]).items[0].dst;
  const brandWs = WS.workspaceFor('nha-dep');
  const b = K.deliverProject(path.join(TMP, 'du-an-ngoai', 'clip'), [{ src: W(path.join(TMP, 'du-an-ngoai', 'clip', 'out', 'z.mp4'), 'z'), name: 'Brand clip.mp4' }], { ws: brandWs }).items[0].dst;
  assert.deepEqual(K.knownWorkspaces().map(w => w.brand).sort(), ['', 'nha-dep']);
  const route = (await import('../../studio/routes/18_schedule.mjs')).default(fakeCtx(null).ctx);
  const r = await call(route, '/api/schedule/videos');
  const files = r.data.map(v => v.file);
  assert.ok(files.includes(a), 'Kho Chung');
  assert.ok(files.includes(b), 'Kho của thương hiệu');
  assert.match(r.data.find(v => v.file === b).src, /Thành phẩm · Nhà Đẹp/);
  // caption AI của dự án theo bản giao trong Thành phẩm (chỉ mục .giao.json)
  W(path.join(d, 'publish', 'publish.json'), { video: 'out/l.mp4', platforms: { tiktok: { caption: 'Caption của Lịch', hashtags: ['#lich'] } } });
  assert.deepEqual(K.originOf(a), { project: path.resolve(d), src: path.join(path.resolve(d), 'out', 'l.mp4') });
  const r2 = await call(route, '/api/schedule/videos');
  assert.equal(r2.data.find(v => v.file === a).hasCaptions, true);
  const cap = await call(route, '/api/schedule/captions?platform=tiktok&file=' + encodeURIComponent(a));
  assert.equal(cap.data.caption, 'Caption của Lịch');
  // lên lịch bản trong Thành phẩm → dòng out/ (liên kết cứng của nó) cũng hiện "đã lên lịch"
  const add = await call(route, '/api/schedule/add', { method: 'POST', body: { file: a, platforms: ['youtube'], when: '2099-01-01T08:00:00Z' } });
  assert.equal(add.data.ok, true, JSON.stringify(add.data));
  const route2 = (await import('../../studio/routes/18_schedule.mjs')).default(fakeCtx(d).ctx);
  const r3 = await call(route2, '/api/schedule/videos');
  const twin = r3.data.find(v => v.file === path.join(d, 'out', 'l.mp4') || v.file === a);
  assert.deepEqual(twin.scheduled, ['youtube']);
});
