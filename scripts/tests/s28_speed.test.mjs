// S29 M207: tốc độ cong, đứng hình (Freeze), tua ngược — hàm thuần engine/speed.js + ripple của studio/clips.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SM = require('../../engine/speed.js');
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const near = (a, b, eps = 1e-6, m = '') => assert.ok(Math.abs(a - b) <= eps, `${m} ${a} ≠ ${b}`);

// Thời lượng của mỗi preset khi đoạn nguồn dài 1 s (scripts/tests/test_speed_curve.py giữ cùng số: Python = JS)
const PRESET_DUR = Object.fromEntries(Object.keys(SM.PRESETS).map(k => [k, SM.dur({ in: 0, out: 1, speedCurve: k }, 1e9)]));

test('tốc độ đều giữ đúng công thức cũ', () => {
  const c = { in: 2, out: 8, speed: 2 };
  near(SM.dur(c), 3); near(SM.srcAt(c, 1.5), 5); near(SM.ltAt(c, 5), 1.5); assert.equal(SM.speedAt(c, 1), 2);
  near(SM.srcAt({ in: 1, out: 4 }, 3 + 0.5), 4.5, 1e-9, 'quá cuối vẫn đi tiếp (lớp dưới chuyển cảnh)');
  assert.ok(SM.plain(c) && !SM.plain({ ...c, reverse: true }));
});

test('đường cong: tích phân 1/tốc độ, đầu cuối khớp, đơn điệu, ltAt là nghịch đảo', () => {
  for (const k of Object.keys(SM.PRESETS)) {
    const c = { in: 1, out: 7, speedCurve: k }, d = SM.dur(c);
    near(d, 6 * PRESET_DUR[k], 1e-9, k);
    near(SM.srcAt(c, 0), 1, 1e-9, k); near(SM.srcAt(c, d), 7, 1e-6, k);
    let prev = -1;
    for (let i = 0; i <= 200; i++) {
      const lt = d * i / 200, s = SM.srcAt(c, lt);
      assert.ok(s >= prev - 1e-12, `${k} đơn điệu`); prev = s;
      near(SM.ltAt(c, s), lt, 1e-6, `${k} nghịch đảo`);
    }
  }
  // Hero: chậm 0,3× ở giữa → đoạn giữa chiếm phần lớn thời lượng; tốc độ tức thời ở giữa ≈ 0,3
  const h = { in: 0, out: 10, speedCurve: 'hero' }, mid = SM.ltAt(h, 5);
  near(SM.speedAt(h, mid), 0.3, 0.02, 'hero giữa');
  near(SM.dur({ in: 0, out: 4, speedCurve: [{ x: 0, y: 2 }, { x: 1, y: 2 }] }), 2, 1e-9, 'đường cong phẳng 2× = tốc độ đều 2×');
});

test('đường cong: điểm lạ bị kẹp, thiếu đầu thì thêm, rỗng = null', () => {
  assert.equal(SM.norm([]), null); assert.equal(SM.norm('khong_co'), null);
  const p = SM.norm([{ x: 0.5, y: 50 }, { x: 'a', y: 1 }, { x: -1, y: 0 }]);
  assert.deepEqual(p.map(q => [q.x, q.y]), [[0, SM.MIN], [0.5, SM.MAX], [1, SM.MAX]]);
});

test('tua ngược: đọc khung từ out về in, không đổi thời lượng', () => {
  const c = { in: 2, out: 6, reverse: true }, d = SM.dur(c);
  near(d, 4); near(SM.srcAt(c, 0), 6); near(SM.srcAt(c, 1), 5); near(SM.srcAt(c, d), 2); near(SM.ltAt(c, 5), 1);
  const r = { in: 0, out: 6, reverse: true, speedCurve: 'flash_in' }, dr = SM.dur(r);
  near(dr, 6 * PRESET_DUR.flash_in, 1e-9); near(SM.srcAt(r, 0), 6); near(SM.srcAt(r, dr), 0, 1e-6);
  near(SM.ltAt(r, SM.srcAt(r, 0.7)), 0.7, 1e-6);
});

test('đứng hình: giữ nguyên srcT trong hold giây', () => {
  const c = { in: 3.2, out: 3.2, hold: 3 };
  near(SM.dur(c), 3); near(SM.srcAt(c, 0), 3.2); near(SM.srcAt(c, 2.9), 3.2); assert.equal(SM.speedAt(c, 1), 0);
  assert.equal(SM.label(c), 'Đứng hình'); assert.equal(SM.label({ speedCurve: 'hero', reverse: true }), 'Hero · Ngược');
});

test('subCurve: tách đôi giữ tổng thời lượng', () => {
  const c = { in: 0, out: 8, speedCurve: 'montage' }, u = 0.37;
  const a = { in: 0, out: 8 * u, speedCurve: SM.subCurve('montage', 0, u) }, b = { in: 8 * u, out: 8, speedCurve: SM.subCurve('montage', u, 1) };
  near(SM.dur(a) + SM.dur(b), SM.dur(c), SM.dur(c) * 0.01, 'lệch < 1 %');
});

// ---------- ripple trong studio/clips.js ----------
function studio(tl, cap) {
  const ctx = vm.createContext({ SpeedMap: SM, FX: require('../../engine/fx_registry.js'), TL: tl, CAP: cap, META: {}, console });
  vm.runInContext(read('../../studio/clips.js'), ctx);
  return ctx;
}
const words = (cap, t0, n, step) => { const ws = []; for (let i = 0; i < n; i++) ws.push({ w: 'w' + i, s: t0 + i * step, e: t0 + i * step + step * 0.8 }); cap.push({ t0: ws[0].s, t1: ws[ws.length - 1].e, words: ws }); };

test('remapAll theo đường cong: từ trong clip giữ đúng giây nguồn, phía sau dồn theo thời lượng mới', () => {
  const tl = { fps: 30, duration: 14, clips: [{ src: { seq: 'f/%05d.jpg', fps: 30, count: 600 }, in: 0, out: 10 }, { src: { seq: 'f/%05d.jpg', fps: 30, count: 600 }, in: 10, out: 14 }],
    scenes: [{ t0: 11, t1: 12, type: 'x' }], audio: { sfx: [{ t: 12.5 }] } };
  const cap = []; words(cap, 1, 8, 1); words(cap, 10.5, 3, 1);
  const ctx = studio(tl, cap), before = cap[0].words.map(w => w.s);
  assert.ok(ctx.setClipCurve(0, 'hero'));
  const c0 = tl.clips[0], d1 = SM.dur(c0), shift = d1 - 10, after = ctx.CAP;
  after[0].words.forEach((w, i) => near(SM.srcAt(c0, w.s), before[i], 0.02, `từ ${i}`));
  near(after[1].words[0].s, 10.5 + shift, 0.01, 'clip sau dồn'); near(tl.scenes[0].t0, 11 + shift, 0.01); near(tl.audio.sfx[0].t, 12.5 + shift, 0.01);
  near(tl.duration, 14 + shift, 0.01, 'thời lượng');
  // về tốc độ đều: trả lại gần như vị trí cũ
  ctx.setClipCurve(0, null);
  ctx.CAP[0].words.forEach((w, i) => near(w.s, before[i], 0.03, `trả về ${i}`));
});

test('đảo ngược: phụ đề trong clip đổi chiều nhưng vẫn sắp theo thời gian, clip sau không dịch', () => {
  const tl = { fps: 30, clips: [{ src: { seq: 'f/%05d.jpg', fps: 30, count: 300 }, in: 0, out: 6 }, { src: { seq: 'f/%05d.jpg', fps: 30, count: 300 }, in: 6, out: 9 }] };
  const cap = []; words(cap, 0.5, 3, 1); words(cap, 7, 2, 0.5);
  const ctx = studio(tl, cap);
  assert.ok(ctx.setClipReverse(0, true));
  const ws = ctx.CAP[0].words;
  assert.deepEqual(ws.map(w => w.w), ['w2', 'w1', 'w0']); ws.forEach(w => assert.ok(w.e > w.s));
  near(ws[ws.length - 1].e, 5.5, 0.01, 'từ đầu (0,5 s nguồn) giờ kết thúc ở 5,5 s');
  near(ctx.CAP[1].words[0].s, 7, 1e-9, 'clip sau giữ nguyên');
  assert.equal(ctx.setClipReverse(0, false), true); near(ctx.CAP[0].words[0].s, 0.5, 0.01);
});

test('Freeze: chèn clip giữ khung 3 s tại đầu đọc, tách clip, phía sau dồn 3 s', () => {
  const tl = { fps: 30, clips: [{ src: { seq: 'f/%05d.jpg', fps: 30, count: 300 }, in: 0, out: 6, speed: 2, transition: { type: 'fade' } }] };
  const cap = []; words(cap, 0.2, 2, 0.3); words(cap, 2, 2, 0.3);
  const ctx = studio(tl, cap), fr = ctx.freezeAt(1.5);
  assert.equal(tl.clips.length, 3); assert.equal(tl.clips[1], fr);
  assert.deepEqual([fr.in, fr.out, fr.hold, fr.speed, fr.transition], [3, 3, 3, undefined, undefined]);
  assert.equal(tl.clips[0].out, 3); assert.equal(tl.clips[2].in, 3);
  near(vm.runInContext("clipsTotal()", ctx), 6, 1e-9); near(tl.duration, 6, 1e-9);
  near(ctx.CAP[0].words[0].s, 0.2, 1e-9); near(ctx.CAP[1].words[0].s, 5, 1e-9);
  assert.equal(ctx.freezeAt(2), null, 'không đứng hình chồng lên clip đứng hình');
  // cắt mép clip đứng hình = đổi hold
  ctx.trimClip(1, 'r', -1); near(tl.clips[1].hold, 2, 1e-9); near(ctx.CAP[1].words[0].s, 4, 1e-6);
});

test('tách clip ngược: nửa đầu phát phần nguồn phía sau', () => {
  const tl = { fps: 30, clips: [{ src: { seq: 'f/%05d.jpg', fps: 30, count: 300 }, in: 0, out: 6, reverse: true }] };
  const ctx = studio(tl, []);
  ctx.splitClipAt(2);
  assert.deepEqual(tl.clips.map(c => [c.in, c.out]), [[4, 6], [0, 4]]);
});

test('engine + Studio nạp speed.js trước mã dùng nó; engine lấy giây nguồn từ SpeedMap', () => {
  const eng = read('../../engine/index.html'), st = read('../../studio/index.html'), js = read('../../engine/engine.js');
  assert.ok(eng.indexOf('src="speed.js"') > 0 && eng.indexOf('src="speed.js"') < eng.indexOf('src="engine.js"'));
  assert.ok(st.indexOf('/engine/speed.js') > 0 && st.indexOf('/engine/speed.js') < st.indexOf('/studio/clips.js'));
  assert.match(js, /SpeedMap\.srcAt\(c, t - c\.t0\)/); assert.match(js, /SpeedMap\.dur\(c, TL\.fps\)/);
});



test('Hỏi Claude: việc clip_speed cho clip, thiếu mode thì về trả lời; frameAt đọc khung ngược', () => {
  const AC = require('../../studio/features/75_ask.core.js');
  const sc = AC.scopeOf({ step: 'build', sel: { kind: 'clip', idx: 0 } });
  assert.ok(AC.actionsOf(sc).some(a => a.id === 'clip_speed'));
  assert.deepEqual(AC.checkPick({ action: 'clip_speed', params: { mode: 'hero' } }, sc).params, { mode: 'hero' });
  assert.equal(AC.checkPick({ action: 'clip_speed', params: {} }, sc).action, 'answer');
  assert.equal(AC.checkPick({ action: 'clip_speed', params: { mode: 'xoay' } }, sc).action, 'answer');
  const tl = { clips: [{ src: { seq: 'f/%05d.jpg', fps: 30, count: 300 }, in: 0, out: 4, reverse: true }, { src: { seq: 'f/%05d.jpg', fps: 30, count: 300 }, in: 4, out: 4, hold: 3 }] };
  assert.equal(AC.frameAt(tl, 1).at, 3);
  assert.equal(AC.frameAt(tl, 5.5).at, 4, 'đứng hình giữ khung');
  assert.deepEqual(AC.clipStarts(tl), [0, 4]);
});
