// S29 M212: nướng sẵn bằng ffmpeg (engine/bake.js, scripts/bake_job.mjs, scripts/queue.mjs kind `bake`, engine.js srcFrame).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checkSpec, readResult } from '../bake_job.mjs';
import { KINDS, argsFor } from '../queue.mjs';

const require = createRequire(import.meta.url), HERE = path.dirname(fileURLToPath(import.meta.url));
const B = require('../../engine/bake.js'), PP = require('../../engine/preview_proxy.js');
const read = rel => fs.readFileSync(path.join(HERE, rel), 'utf8');
const LUT = '.studio/bake/luts/abcdef123456.cube';
const clip = (bake, o = {}) => ({ src: { seq: 'work/frames/%05d.jpg', fps: 30, count: 300 }, in: 1, out: 3, bake, ...o });

test('ops kẹp tham số, bỏ thao tác không tác dụng; không còn gì → null', () => {
  assert.equal(B.ops({ hsl: { hue: 0, sat: 0 }, curves: { preset: 'none' }, stab: { strength: 0 } }), null);
  assert.equal(B.ops({ lut: { file: '../../x.cube' } }), null, 'LUT ngoài .studio/bake/luts bị bỏ');
  assert.equal(B.ops({ chroma: { color: 'green' } }), null, 'màu phải #rrggbb');
  const o = B.ops({ chroma: { color: '#00FF00', strength: 500 }, hsl: { band: 'zz', hue: 999 }, lut: { file: LUT, mix: 70 } });
  assert.deepEqual(o.chroma, { color: '#00ff00', strength: 100, edge: 10, spill: 50 });
  assert.deepEqual(o.hsl, { band: 'all', hue: 180, sat: 0, light: 0 });
  assert.equal(o.lut.mix, 70);
});

test('hash theo tham số + nguồn + khoảng in–out; cùng tham số thì cùng hash', () => {
  const a = B.spec(clip({ hsl: { hue: 20 } })), b = B.spec(clip({ hsl: { hue: 20, sat: 0 } }));
  assert.match(a.hash, /^[0-9a-f]{16}$/);
  assert.equal(a.hash, b.hash, 'giá trị mặc định không đổi hash');
  assert.notEqual(a.hash, B.spec(clip({ hsl: { hue: 21 } })).hash, 'đổi tham số');
  assert.notEqual(a.hash, B.spec(clip({ hsl: { hue: 20 } }, { out: 4 })).hash, 'đổi điểm ra');
  assert.notEqual(a.hash, B.spec(clip({ hsl: { hue: 20 } }, { src: { seq: 'work/f2/%05d.jpg', fps: 30, count: 300 } })).hash, 'đổi nguồn');
  assert.deepEqual([a.n0, a.n1, a.ext], [31, 91, 'jpg']);
  assert.equal(B.spec(clip({ chroma: { color: '#00b140' } })).ext, 'png', 'phông xanh cần kênh alpha');
  assert.equal(B.spec({ src: 'media/a.jpg', bake: { hsl: { hue: 9 } } }), null, 'ảnh tĩnh không nướng');
});

test('active: chỉ khi chuỗi nướng khớp hash hiện tại; lệch thì CSS gần đúng', () => {
  const c = clip({ hsl: { hue: 30, sat: 20 } }), sp = B.spec(c);
  assert.equal(B.state(c), 'stale');
  assert.match(B.approxCss(c), /hue-rotate\(30deg\) saturate\(1\.2\)/);
  Object.assign(c.bake, { seq: sp.out, hash: sp.hash });
  assert.deepEqual(B.active(c), { seq: sp.out, n0: 31, n1: 91, p540: false });
  assert.equal(B.approxCss(c), '');
  c.bake.hsl.hue = 31;
  assert.equal(B.active(c), null, 'đổi tham số sau khi nướng → chuỗi cũ thôi dùng');
  assert.equal(B.state(c), 'stale');
});

test('lệnh ffmpeg: giữ số khung gốc, đúng bộ lọc, LUT đường dẫn tương đối', () => {
  const sp = B.spec(clip({ stab: { strength: 50 }, chroma: { color: '#00ff00', spill: 40 }, lut: { file: LUT, mix: 60 }, hsl: { band: 'r', hue: 10 }, curves: { preset: 'vintage', shadows: 10 } }));
  const a = B.ffArgs(sp, 'out/%05d.png', { w: 1080, h: 1920 }), vf = a[a.indexOf('-vf') + 1];
  assert.deepEqual(a.filter((x, i) => a[i - 1] === '-start_number'), ['31', '31']);
  assert.equal(a[a.indexOf('-frames:v') + 1], '61');
  for (const re of [/^deshake=rx=48:ry=48/, /chromakey=color=0x00ff00/, /despill=type=green/, /split\[bk0\]\[bk1\];\[bk1\]lut3d=file=\.studio\/bake\/luts\/abcdef123456\.cube/,
    /\[bk2\]\[bk0\]blend=all_mode=normal:all_opacity=0\.6/, /huesaturation=hue=10:.*colors=r:strength=10/, /curves=preset=vintage:master='0\/0 0\.25\/0\.3 0\.75\/0\.75 1\/1'/, /format=rgba$/]) assert.match(vf, re);
  assert.ok(vf.indexOf('deshake') < vf.indexOf('chromakey') && vf.indexOf('chromakey') < vf.indexOf('lut3d'), 'ổn định → tách nền → màu');
  const j = B.ffArgs(B.spec(clip({ hsl: { hue: 5 } })), 'o/%05d.jpg');
  assert.ok(j.includes('-q:v') && /format=yuvj420p$/.test(j[j.indexOf('-vf') + 1]));
});

test('cubeOk nhận .cube đủ dòng, từ chối file lạ', () => {
  const cube = 'TITLE "x"\nLUT_3D_SIZE 2\n' + '0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n';
  assert.ok(B.cubeOk(cube));
  assert.ok(!B.cubeOk(cube.replace('1 1 1\n', '')), 'thiếu dòng');
  assert.ok(!B.cubeOk('<html>'), 'không phải cube');
});

test('queue: kind bake chạy scripts/bake_job.mjs với --spec JSON', () => {
  assert.equal(KINDS.bake.script, 'bake_job.mjs');
  assert.ok(fs.existsSync(path.join(HERE, '..', KINDS.bake.script)));
  const spec = { seq: 'work/frames/%05d.jpg', fps: 30, n0: 1, n1: 30, ops: { hsl: { hue: 5 } } };
  const a = argsFor({ kind: 'bake', input: 'D:/p', opts: { spec } });
  assert.equal(a[0], 'D:/p'); assert.equal(a[1], '--spec'); assert.deepEqual(JSON.parse(a[2]), spec);
});

test('checkSpec: hash tính lại, đường dẫn phải trong dự án; readResult đọc .ok', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bake-'));
  try {
    fs.mkdirSync(path.join(dir, 'work/frames'), { recursive: true });
    const ok = { seq: 'work/frames/%05d.jpg', fps: 30, n0: 1, n1: 30, ops: { hsl: { hue: 5 } } };
    const sp = checkSpec(dir, ok);
    assert.equal(sp.hash, B.spec({ src: { seq: ok.seq, fps: 30, count: 30 }, in: 0, out: 29 / 30, bake: ok.ops }).hash);
    assert.throws(() => checkSpec(dir, { ...ok, hash: '0000000000000000' }), /Thiết lập đã đổi/);
    assert.throws(() => checkSpec(dir, { ...ok, seq: '../x/%05d.jpg' }), /không nằm đúng chỗ/);
    assert.throws(() => checkSpec(dir, { ...ok, seq: 'nope/%05d.jpg' }), /Không thấy thư mục/);
    assert.throws(() => checkSpec(dir, { ...ok, ops: { lut: { file: LUT } } }), /Không thấy file LUT/);
    assert.throws(() => checkSpec(dir, { ...ok, ops: {} }), /Chưa bật hiệu chỉnh/);
    assert.equal(readResult(dir, sp.hash), null);
    fs.mkdirSync(path.join(dir, B.DIR, sp.hash), { recursive: true });
    fs.writeFileSync(path.join(dir, B.DIR, sp.hash, B.OK), JSON.stringify({ seq: sp.out, n: 30 }));
    assert.deepEqual({ ...readResult(dir, sp.hash), ms: 0 }, { seq: sp.out, n: 30, p540: false, ms: 0 });
    assert.equal(readResult(dir, '../../x'), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// đoạn engine.js từ `let TL` tới hết clipFilter chạy trong vm (như s29_proxy.test.mjs)
function engine() {
  const js = read('../../engine/engine.js'), i = js.indexOf('let TL = null;'), j = js.indexOf('\nconst colorOver');
  assert.ok(i > 0 && j > i);
  const src = js.slice(i, j) + '\n;globalThis.__E = { srcFrame, clipFilter, BAKE_BAD, setTL: t => { TL = t; } };';
  const ctx = vm.createContext({ window: {}, console, CDN: '', SpeedMap: require('../../engine/speed.js'), PreviewProxy: PP, BakeCore: B, FX: require('../../engine/fx_registry.js') });
  vm.runInContext(src, ctx);
  return ctx.__E;
}

test('engine: đọc chuỗi nướng trong đoạn đã nướng; lệch / lỗi / ngoài đoạn → chuỗi gốc; 540p nướng theo', () => {
  const E = engine(), c = clip({ curves: { preset: 'lighter' } }), sp = B.spec(c);
  E.setTL({ fps: 30, base: '' });
  assert.equal(E.srcFrame(c, 1.5), 'work/frames/00046.jpg', 'chưa nướng: chuỗi gốc');
  assert.match(E.clipFilter(c), /brightness\(1\.12\)/, 'chưa nướng: CSS gần đúng');
  Object.assign(c.bake, { seq: sp.out, hash: sp.hash });
  assert.equal(E.srcFrame(c, 1.5), `.studio/bake/${sp.hash}/00046.jpg`);
  assert.equal(E.clipFilter(c), '', 'đã nướng: không CSS thêm');
  assert.equal(E.srcFrame(c, 5), 'work/frames/00151.jpg', 'ngoài đoạn đã nướng');
  c.bake.p540 = true;
  E.setTL({ fps: 30, base: '', preview_proxy: { 'work/frames/%05d.jpg': 'work/frames_540/%05d.jpg' } });
  assert.equal(E.srcFrame(c, 1.5), `.studio/bake/${sp.hash}_540/00046.jpg`, 'xem trước 540p: bản nướng 540p');
  E.BAKE_BAD[sp.out + '_540'] = 1;
  assert.equal(E.srcFrame(c, 1.5), `.studio/bake/${sp.hash}/00046.jpg`, 'bản 540p lỗi → bản nướng đủ cỡ');
  E.BAKE_BAD[sp.out] = 1;
  assert.equal(E.srcFrame(c, 1.5), 'work/frames_540/00046.jpg', 'bản nướng lỗi → chuỗi gốc (540p của gốc)');
  assert.match(E.clipFilter(c), /brightness/, 'và CSS gần đúng trở lại');
});

test('engine + Studio nạp bake.js; Thuộc tính clip có tab Hiệu chỉnh; Claude có việc clip_bake', () => {
  const eng = read('../../engine/index.html'), st = read('../../studio/index.html');
  assert.ok(eng.indexOf('src="bake.js"') > 0 && eng.indexOf('src="bake.js"') < eng.indexOf('src="engine.js"'));
  assert.ok(st.includes('src="/engine/bake.js"'));
  assert.match(read('../../studio/studio.js'), /Studio\.bakeTab/);
  const AC = require('../../studio/features/75_ask.core.js');
  assert.ok(AC.actionsOf({ kind: 'clip', idx: 0 }).some(a => a.id === 'clip_bake'));
  const tl = { fps: 30, clips: [clip(undefined)] };
  assert.ok(AC.bakeApply(tl, 0, { op: 'hsl', hue: 15, sat: 10 }));
  assert.deepEqual(B.ops(tl.clips[0].bake).hsl, { band: 'all', hue: 15, sat: 10, light: 0 });
  assert.ok(AC.bakeApply(tl, 0, { op: 'chroma', color: '#00B140', strength: 50 }));
  assert.equal(tl.clips[0].bake.chroma.color, '#00b140');
  assert.ok(AC.bakeApply(tl, 0, { op: 'none' }));
  assert.equal(tl.clips[0].bake, undefined);
  const pick = AC.checkPick({ action: 'clip_bake', params: { op: 'curves', preset: 'vintage', hue: 999 } }, { kind: 'clip', idx: 0 });
  assert.equal(pick.action, 'clip_bake'); assert.equal(pick.params.preset, 'vintage');
});
