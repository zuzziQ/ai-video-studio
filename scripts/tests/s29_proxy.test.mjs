// S29 M213: khung xem trước 540p — hàm thuần engine/preview_proxy.js, engine chọn chuỗi theo TL.preview_proxy (fmtSeq / srcFrame),
// route /api/frames/proxy (studio/routes/63_frames.mjs) báo chuỗi nào đã trích đủ.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PP = require('../../engine/preview_proxy.js');
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('proxySeq: thư mục anh em _540, giữ mẫu tên khung; chuỗi lạ → null', () => {
  assert.equal(PP.proxySeq('work/frames/%05d.jpg'), 'work/frames_540/%05d.jpg');
  assert.equal(PP.proxySeq('work/broll/b1/%04d.jpg'), 'work/broll/b1_540/%04d.jpg');
  for (const s of ['still.jpg', '%05d.jpg', 'work/frames_540/%05d.jpg', null, 7]) assert.equal(PP.proxySeq(s), null, String(s));
});

test('wanted: pref thắng; auto = profile tiet-kiem hoặc SwiftShader', () => {
  assert.equal(PP.wanted({ profile: 'tiet-kiem', chromeMode: 'gpu' }), true);
  assert.equal(PP.wanted({ profile: 'can-bang', chromeMode: 'swiftshader' }), true);
  assert.equal(PP.wanted({ profile: 'can-bang', chromeMode: 'gpu' }), false);
  assert.equal(PP.wanted({ pref: 'on', profile: 'toc-do', chromeMode: 'gpu' }), true);
  assert.equal(PP.wanted({ pref: 'off', profile: 'tiet-kiem', chromeMode: 'swiftshader' }), false);
  assert.equal(PP.wanted(), false);
});

test('pick / fallback: ảnh 540p lỗi → về ảnh gốc, chuỗi đó thôi dùng 540p', () => {
  const map = { 'work/frames/%05d.jpg': 'work/frames_540/%05d.jpg', 'work/b/%04d.jpg': 'work/b_540/%04d.jpg' };
  assert.equal(PP.pick(map, 'work/frames/%05d.jpg'), 'work/frames_540/%05d.jpg');
  assert.equal(PP.pick(map, 'work/other/%05d.jpg'), 'work/other/%05d.jpg');
  assert.equal(PP.pick(null, 'work/frames/%05d.jpg'), 'work/frames/%05d.jpg');
  assert.equal(PP.pick(map, 'toString'), 'toString', 'không đọc khoá kế thừa');
  const url = p => '/project/' + p;
  assert.equal(PP.fallback(map, '/project/work/frames_540/00012.jpg', url), '/project/work/frames/00012.jpg');
  assert.deepEqual(Object.keys(map), ['work/b/%04d.jpg']);
  assert.equal(PP.fallback(map, '/project/work/frames/00012.jpg', url), null, 'ảnh gốc lỗi: không phải việc của proxy');
});

test('ffArgs: -q:v 5, cạnh ngắn 540, số khung đầu giữ như bản gốc', () => {
  const a = PP.ffArgs('in/%05d.jpg', 'out/%05d.jpg', 3);
  assert.equal(a[a.indexOf('-q:v') + 1], '5');
  assert.deepEqual(a.filter((x, i) => a[i - 1] === '-start_number'), ['3', '3']);
  assert.ok(a.indexOf('-start_number') < a.indexOf('-i'), '-start_number trước -i áp cho đầu vào');
  assert.match(a[a.indexOf('-vf') + 1], /540/);
});

// đoạn engine.js từ `let TL` tới hết clipPath (chọn chuỗi khung) chạy trong vm, không cần DOM
function engine(withProxy = true) {
  const js = read('../../engine/engine.js'), i = js.indexOf('let TL = null;'), j = js.indexOf('\nconst LUT');
  assert.ok(i > 0 && j > i, 'engine.js: tìm được đoạn TL … clipPath');
  const src = js.slice(i, j) + '\n;globalThis.__E = { fmtSeq, srcFrame, setTL: t => { TL = t; } };';
  const ctx = vm.createContext({ window: {}, console, CDN: '', SpeedMap: require('../../engine/speed.js'), ...(withProxy ? { PreviewProxy: PP } : {}) });
  vm.runInContext(src, ctx);
  return ctx.__E;
}

test('engine chọn chuỗi 540p chỉ khi TL.preview_proxy có (xem trước); render đọc chuỗi gốc', () => {
  const E = engine(), clip = { src: { seq: 'work/frames/%05d.jpg', fps: 30, count: 100 }, in: 0, out: 3 };
  E.setTL({ fps: 30, base: '' });
  assert.equal(E.srcFrame(clip, 1), 'work/frames/00031.jpg', 'render: không có preview_proxy');
  E.setTL({ fps: 30, base: '', preview_proxy: { 'work/frames/%05d.jpg': 'work/frames_540/%05d.jpg' } });
  assert.equal(E.srcFrame(clip, 1), 'work/frames_540/00031.jpg');
  assert.equal(E.fmtSeq('work/frames/%05d.jpg', 7), 'work/frames_540/00007.jpg', 'a-roll / module đọc TL.aroll.frames cũng theo');
  assert.equal(E.srcFrame({ ...clip, cutouts: 'work/cut/%05d.png' }, 1, true), 'work/cut/00031.png', 'ảnh tách nền không có bản 540p');
  const E2 = engine(false); E2.setTL({ fps: 30, base: '', preview_proxy: { 'work/frames/%05d.jpg': 'work/frames_540/%05d.jpg' } });
  assert.equal(E2.srcFrame(clip, 1), 'work/frames/00031.jpg', 'trang không nạp preview_proxy.js vẫn chạy');
});

test('engine + Studio nạp preview_proxy.js; preview của Studio mang S.proxyMap', () => {
  const eng = read('../../engine/index.html');
  assert.ok(eng.indexOf('src="preview_proxy.js"') > 0 && eng.indexOf('src="preview_proxy.js"') < eng.indexOf('src="engine.js"'));
  assert.match(read('../../studio/studio.js'), /o\.preview_proxy = \{ \.\.\.window\.Studio\.proxyMap \}/);
});

// route với ctx giả: dự án tạm có 3 khung gốc
async function route(dir, tl) {
  const mod = await import('../../studio/routes/63_frames.mjs');
  const ctx = { project: { dir }, readProject: () => ({ timeline: tl }), json: (res, v, st = 200) => { res.v = v; res.st = st; } };
  const h = mod.default(ctx);
  return async (method, url) => { const res = {}; const hit = await h({ method, url }, res, url.split('?')[0]); return hit ? res : null; };
}
const ffmpeg = spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status === 0;

test('route /api/frames/proxy: thiếu → missing; .ok đúng số khung + mtime → ready vào map; khung gốc đổi → missing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-proxy-'));
  try {
    fs.mkdirSync(path.join(dir, 'work/frames'), { recursive: true });
    for (let i = 1; i <= 3; i++) fs.writeFileSync(path.join(dir, `work/frames/${String(i).padStart(5, '0')}.jpg`), 'x');
    const tl = { aroll: { frames: 'work/frames/%05d.jpg' }, clips: [{ src: { seq: 'work/frames/%05d.jpg' } }] };
    const call = await route(dir, tl);
    let r = await call('GET', '/api/frames/proxy?pref=on');
    assert.equal(r.v.on, true); assert.deepEqual(r.v.map, {}); assert.deepEqual(r.v.pending, [{ seq: 'work/frames/%05d.jpg', state: 'missing' }]);
    assert.equal((await call('GET', '/api/frames/proxy?pref=off')).v.on, false);
    const mtime = Math.round(fs.statSync(path.join(dir, 'work/frames/00001.jpg')).mtimeMs);
    fs.mkdirSync(path.join(dir, 'work/frames_540'));
    fs.writeFileSync(path.join(dir, 'work/frames_540', PP.OK), JSON.stringify({ count: 3, mtime }));
    r = await call('GET', '/api/frames/proxy?pref=on');
    assert.deepEqual(r.v.map, { 'work/frames/%05d.jpg': 'work/frames_540/%05d.jpg' }); assert.deepEqual(r.v.pending, []);
    fs.utimesSync(path.join(dir, 'work/frames/00001.jpg'), new Date(), new Date(Date.now() + 5000));
    r = await call('GET', '/api/frames/proxy?pref=on');
    assert.deepEqual(r.v.map, {}, 'khung gốc đã trích lại: bản 540p cũ không dùng');
    assert.equal(await call('GET', '/api/frames/other'), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('route POST trích lười bằng ffmpeg: 540p cùng số khung, ready', { skip: !ffmpeg && 'không có ffmpeg' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-proxy-'));
  try {
    fs.mkdirSync(path.join(dir, 'work/frames'), { recursive: true });
    const g = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=30', '-frames:v', '4', '-q:v', '3', path.join(dir, 'work/frames/%05d.jpg')], { windowsHide: true });
    assert.equal(g.status, 0);
    const call = await route(dir, { aroll: { frames: 'work/frames/%05d.jpg' } });
    assert.deepEqual((await call('POST', '/api/frames/proxy')).v.started, ['work/frames/%05d.jpg']);
    let r;
    for (let k = 0; k < 100; k++) { r = await call('GET', '/api/frames/proxy?pref=on'); if (!r.v.pending.length || r.v.pending[0].state === 'error') break; await new Promise(ok => setTimeout(ok, 100)); }
    assert.deepEqual(r.v.map, { 'work/frames/%05d.jpg': 'work/frames_540/%05d.jpg' });
    const out = fs.readdirSync(path.join(dir, 'work/frames_540')).filter(f => f.endsWith('.jpg')).sort();
    assert.deepEqual(out, ['00001.jpg', '00002.jpg', '00003.jpg', '00004.jpg']);
    const p = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(dir, 'work/frames_540/00001.jpg')], { encoding: 'utf8', windowsHide: true });
    if (p.status === 0) assert.equal(p.stdout.trim(), '540,960');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
