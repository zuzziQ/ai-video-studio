// S29 M209: keyframe mở rộng — clip chính (biến đổi, mặt nạ, màu, âm lượng), nhạc nền, easing bezier.
// Dữ liệu cũ (scene.kf / line.kf, clip không kf) phải dựng ra y hệt: so kfAt và clipLayer mới với bản chép đông cứng trước M209.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';

const req = createRequire(import.meta.url);
const KF = req('../../engine/kf.js');
const FX = req('../../engine/fx_registry.js');
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const E = {
  inCubic: k => k * k * k, outCubic: k => 1 - Math.pow(1 - k, 3), inOutSine: k => -(Math.cos(Math.PI * k) - 1) / 2,
  outBack: (k, s = 1.70158) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2),
};

// ---- bản chép đông cứng trước M209 (đừng sửa: đây là "hình cũ") ----
const OLD_EASE = { linear: k => k, in: E.inCubic, out: E.outCubic, inOut: E.inOutSine, back: k => E.outBack(k, 1.7), hold: () => 0,
  bounce: k => { const n = 7.5625, d = 2.75; return k < 1 / d ? n * k * k : k < 2 / d ? n * (k -= 1.5 / d) * k + .75 : k < 2.5 / d ? n * (k -= 2.25 / d) * k + .9375 : n * (k -= 2.625 / d) * k + .984375; } };
const KF_DEF = { x: 0, y: 0, scale: 1, rot: 0, opacity: 1 };
function oldKfAt(kf, t) {
  const ks = [...kf].sort((a, b) => a.t - b.t), v = k => ({ ...KF_DEF, ...k });
  const i = ks.findIndex(k => k.t > t);
  if (i === 0 || i < 0) return v(ks[i === 0 ? 0 : ks.length - 1]);
  const a = v(ks[i - 1]), b = v(ks[i]), e = (OLD_EASE[a.ease] || OLD_EASE.linear)(clamp((t - a.t) / Math.max(1e-6, b.t - a.t)));
  const o = { ...a }; for (const p in KF_DEF) o[p] = a[p] + (b[p] - a[p]) * e; return o;
}
const oldClipLayer = (c, srcT, t, extraFilter = '', style = '', clipBox, animWrap) => {
  const html = clipBox(c, srcT, t, extraFilter, style);
  return c.anim && c.t1 != null ? animWrap(c.anim, t - c.t0, c.t1 - c.t0, html) : html;
};
const KS = Array.from({ length: 41 }, (_, i) => i / 40);

// đoạn engine.js từ `const KF_EASE` tới hết kfAt + kfTr, chạy trong vm
function engineKf() {
  const js = read('engine/engine.js'), i = js.indexOf('const KF_EASE'), j = js.indexOf('\nconst kfTr');
  assert.ok(i > 0 && j > i);
  const ctx = vm.createContext({ E, clamp, KF });
  vm.runInContext(js.slice(i, js.indexOf('\n', j + 1)) + '\n;globalThis.__K = { kfAt, kfTr, KF_EASE };', ctx);
  return ctx.__K;
}

test('easing cũ của engine/kf.js trùng công thức cũ; preset bezier đúng mốc', () => {
  for (const [n, f] of Object.entries(OLD_EASE)) for (const k of KS) assert.equal(KF.EASE[n](k), f(k), `${n} @ ${k}`);
  for (const n of [...Object.keys(KF.BZ), 'elastic']) { assert.equal(KF.EASE[n](0), 0); assert.equal(KF.EASE[n](1), 1); assert.ok(!(n in OLD_EASE)); }
  assert.ok(Math.abs(KF.EASE.easeInOut(.5) - .5) < 1e-6);
  assert.ok(KF.EASE.easeIn(.25) < .25 && KF.EASE.easeOut(.25) > .25);
  assert.ok(Math.max(...KS.map(KF.EASE.overshoot)) > 1.05, 'nảy vượt rồi về');
  assert.ok(KS.some(k => KF.EASE.elastic(k) > 1) && KS.some((k, i) => i && KF.EASE.elastic(k) < KF.EASE.elastic(KS[i - 1])), 'đàn hồi dao động');
  const bz = KF.bezier(.25, .1, .25, 1); // CSS ease
  assert.ok(Math.abs(bz(.5) - .8024) < 2e-3);
  assert.equal(KF.easeOf({ ease: 'nope' }), KF.EASE.linear);
  assert.ok(Math.abs(KF.easeOf({ bz: [.42, 0, .58, 1] })(.3) - KF.EASE.easeInOut(.3)) < 1e-9, 'bz thắng ease');
  assert.deepEqual(KF.EASE_VI.map(e => e[0]).sort(), Object.keys(KF.EASE).sort());
});

test('kfAt của cảnh / dòng chữ: dữ liệu cũ dựng ra y hệt (so khung), thêm được easing mới', () => {
  const { kfAt, KF_EASE } = engineKf();
  for (const n of Object.keys(OLD_EASE)) assert.equal(KF_EASE[n], KF_EASE[n]); // tồn tại
  const sets = Object.keys(OLD_EASE).flatMap(ease => [
    [{ t: 1, x: 0, y: 0, scale: 1, rot: 0, opacity: 1, ease }, { t: 3, x: 120, y: -40, scale: 1.6, rot: 30, opacity: .2 }],
    [{ t: 2, x: 40, ease }, { t: .5, scale: 2, ease: 'out' }, { t: 4, rot: -90 }], // thiếu thuộc tính = mặc định, không theo thứ tự
    [{ t: 1, opacity: 0, ease: 'mystery' }, { t: 2, opacity: 1 }],
  ]);
  for (const kf of sets) for (let t = 0; t < 4.6; t += 0.0173) assert.equal(JSON.stringify(kfAt(kf, t)), JSON.stringify(oldKfAt(kf, t)), `t ${t}`);
  const v = kfAt([{ t: 0, x: 0, ease: 'easeInOut' }, { t: 2, x: 100 }], 1);
  assert.ok(Math.abs(v.x - 50) < 1e-4);
  const w = kfAt([{ t: 0, x: 0, bz: [0, 0, 1, 1] }, { t: 2, x: 100 }], .5);
  assert.ok(Math.abs(w.x - 25) < 1e-3, 'bz tuyến tính');
});

test('clipLayer: clip không keyframe dựng ra y hệt; keyframe bọc ngoài hoạt ảnh và thắng phần trùng', () => {
  const js = read('engine/engine.js'), i = js.indexOf('const kfClip'), j = js.indexOf('\nfunction clipBox');
  assert.ok(i > 0 && j > i);
  const clipBox = (c, s, t, f, st) => `<B ${c.mask ? JSON.stringify(c.mask) : '-'} ${s.toFixed(3)} ${t.toFixed(3)} [${f}] ${st}>`;
  const calls = [];
  const animWrap = (a, lt, D, html, origin = '50% 50%', kf = null) => { calls.push(kf); return `<A ${a.in?.type} ${lt.toFixed(3)} ${D} ${origin}>${html}</A>`; };
  const ctx = vm.createContext({ KF, clamp, clipBox, animWrap, clipFilter: c => FX.colorFx(c.filter).filter, kfTr: v => `T(${v.x},${v.y},${v.scale},${v.rot})` });
  vm.runInContext(js.slice(i, j) + '\n;globalThis.__L = clipLayer;', ctx);
  const L = ctx.__L;
  const clips = [{ t0: 2, t1: 5 }, { t0: 2, t1: 5, anim: { in: { type: 'fade', dur: .5 } } }, { t0: 2, t1: 5, mask: { shape: 'circle', x: 40 }, filter: { preset: 'warm' } }, { anim: { in: { type: 'fade' } } }, { t0: 2, t1: 5, kf: [] }];
  for (const c of clips) for (let t = 2; t < 5; t += .37) assert.equal(L(c, t - 2, t, `${FX.colorFx(c.filter).filter} x`, 's'), oldClipLayer(c, t - 2, t, `${FX.colorFx(c.filter).filter} x`, 's', clipBox, animWrap));
  // keyframe: biến đổi ngoài hoạt ảnh, own báo cho anim
  calls.length = 0;
  const c = { t0: 2, t1: 6, anim: { in: { type: 'fade', dur: .5 } }, mask: { shape: 'circle', x: 50 }, filter: { preset: 'warm' },
    kf: [{ t: 0, x: 0, mask_x: 20, strength: 0, ease: 'linear' }, { t: 2, x: 100, mask_x: 80, strength: 100 }] };
  const h = L(c, 1, 3, `${FX.colorFx(c.filter).filter} x`, '');
  assert.match(h, /^<div class="full" style="transform-origin:50% 50%;transform:T\(50,0,1,0\);opacity:1\.000"><A fade/);
  assert.match(h, /"x":50/, 'tâm mặt nạ nội suy 20 → 80');
  assert.ok(h.includes(`[${FX.colorFx({ preset: 'warm', strength: 50 }).filter} x]`), 'cường độ LUT theo key');
  assert.equal(calls[0], c.kf);
});

test('KF: nội suy theo từng thuộc tính, hai mép giữ, hold nhảy', () => {
  const kf = [{ t: 0, x: 0, ease: 'linear' }, { t: 1, scale: 2, ease: 'hold' }, { t: 2, x: 100 }, { t: 3, scale: 1 }];
  assert.equal(KF.valueAt(kf, 'x', 1), 50, 'x bỏ qua key không có x');
  assert.equal(KF.valueAt(kf, 'scale', .5), 2, 'trước key đầu giữ giá trị');
  assert.equal(KF.valueAt(kf, 'scale', 2.9), 2, 'hold');
  assert.equal(KF.valueAt(kf, 'scale', 3), 1);
  assert.equal(KF.valueAt(kf, 'x', 9), 100);
  assert.equal(KF.valueAt(kf, 'rot', 1), null);
  const r = KF.clipAt({ kf: [{ t: 0, strength: 20 }, { t: 1, exposure: .5 }] }, .5);
  assert.equal(r.c.filter.strength, undefined, 'không có bộ lọc thì bỏ cường độ');
  assert.equal(r.c.filter.exposure, .5);
  assert.equal(r.tr, null);
  const m = KF.clipAt({ kf: [{ t: 0, mask_w: 30 }] }, 0);
  assert.equal(m.c.mask, undefined, 'chưa có mặt nạ thì key mặt nạ không tạo mặt nạ');
  assert.ok(KF.prop('exposure') && KF.prop('vignette').g === 'color' && !KF.prop('nope'));
  assert.ok(KF.propsOf('color').includes('strength') && KF.propsOf('tr').length === 5);
});

test('KF: đặt / xoá key theo thuộc tính, tách clip, ramp cho Claude', () => {
  const o = {};
  KF.setKey(o, 'x', 1, 30); KF.setKey(o, 'scale', 1.005, 1.5); KF.setKey(o, 'x', 0, 0);
  assert.deepEqual(o.kf.map(k => k.t), [0, 1], 'cùng mốc (±½ khung) chung một key');
  assert.equal(o.kf[1].scale, 1.5);
  KF.setKey(o, 'opacity', 2, 7);
  assert.equal(o.kf[2].opacity, 1, 'kẹp theo bảng');
  assert.ok(KF.delKey(o, 'x', 1) && o.kf[1].scale === 1.5 && o.kf[1].x == null);
  KF.delKey(o, 'opacity', 2); KF.delKey(o, 'scale', 1); KF.delKey(o, 'x', 0);
  assert.equal(o.kf, undefined, 'hết key thì bỏ kf');
  const kf = [{ t: 0, x: 0, ease: 'linear' }, { t: 4, x: 100 }, { t: 3, volume: .5 }];
  const [a, b] = KF.split(kf, 1);
  assert.equal(KF.valueAt(a, 'x', 1), 25); assert.equal(KF.valueAt(b, 'x', 0), 25); assert.equal(KF.valueAt(b, 'x', 3), 100);
  assert.equal(KF.valueAt(b, 'volume', 2), .5);
  for (let t = 1; t < 4; t += .25) assert.ok(Math.abs(KF.valueAt(b, 'x', t - 1) - KF.valueAt(kf, 'x', t)) < 1e-3, `phần sau giữ chuyển động @ ${t}`);
  const c = { kf: [{ t: 0, scale: 3 }] };
  assert.ok(KF.ramp(c, 'scale', 1, 1.2, 0, 2, 'easeOut'));
  assert.deepEqual(c.kf, [{ t: 0, ease: 'easeOut', scale: 1 }, { t: 2, ease: 'easeOut', scale: 1.2 }]);
  assert.equal(KF.ramp(c, 'nope', 0, 1, 0, 1), false);
});

test('Claude (75_ask.core.js): việc clip_kf, đọc engine/kf.js lười theo thứ tự nạp của trình duyệt', () => {
  const AC = req('../../studio/features/75_ask.core.js');
  const acts = AC.actionsOf({ kind: 'clip', idx: 0 }).map(a => a.id);
  assert.ok(acts.includes('clip_kf'));
  const tl = { fps: 30, clips: [{ in: 0, out: 4 }, { in: 0, out: 2, mask: { shape: 'circle' } }] };
  assert.ok(AC.clipKfApply(tl, 0, { prop: 'scale', from: 1, to: 1.15, ease: 'easeInOut' }));
  assert.deepEqual(tl.clips[0].kf.map(k => [k.t, k.scale]), [[0, 1], [4, 1.15]]);
  assert.equal(AC.clipKfApply(tl, 0, { prop: 'mask_x', from: 10, to: 90 }), false, 'clip không mặt nạ');
  assert.ok(AC.clipKfApply(tl, 1, { prop: 'mask_x', from: 10, to: 90, start: .5, end: 9 }));
  assert.deepEqual(tl.clips[1].kf.map(k => k.t), [.5, 2]);
  assert.equal(AC.clipKfApply(tl, 5, { prop: 'x', from: 0, to: 1 }), false);
  assert.ok(AC.KF_PROPS.includes('volume') && AC.KF_PROPS.includes('exposure'));
  // trình duyệt: lõi nạp khi chưa có window.KF vẫn chạy được khi gọi (đọc lười)
  const win = { FX, SpeedMap: req('../../engine/speed.js') };
  const ctx = vm.createContext({ window: win, console });
  vm.runInContext(read('studio/features/75_ask.core.js'), ctx);
  win.KF = KF;
  const tl2 = { fps: 30, clips: [{ in: 0, out: 2 }] };
  assert.ok(win.AskCore.clipKfApply(tl2, 0, { prop: 'volume', from: 1, to: 0 }));
  assert.equal(tl2.clips[0].kf[1].volume, 0);
});

test('nạp kf.js trước mã dùng nó (engine, Studio); Studio có nút thoi, chấm clip, âm lượng xem trước', () => {
  const eng = read('engine/index.html'), st = read('studio/index.html');
  assert.ok(eng.indexOf('src="kf.js"') > eng.indexOf('src="fx_registry.js"') && eng.indexOf('src="kf.js"') < eng.indexOf('src="engine.js"'));
  assert.ok(st.indexOf('/engine/kf.js') > st.indexOf('/engine/fx_registry.js') && st.indexOf('/engine/kf.js') < st.indexOf('/studio/clips.js'));
  const s = read('studio/studio.js'), f = read('studio/features/85_kfprops.js');
  assert.match(s, /Studio\._cblk\.map\(f => f\(k, PPS\)\)/);
  assert.match(s, /KF\?\.valueAt\(k\.c\.kf, 'volume'/);
  assert.match(s, /KF\?\.valueAt\(m\.kf, 'gain'/);
  assert.match(read('studio/clips.js'), /KF\.split\(c\.kf, t - k\.t0\)/);
  assert.match(f, /S\._cblk\.push/);
  assert.match(f, /S\.addInspectorTab\(tab\)/);
});
