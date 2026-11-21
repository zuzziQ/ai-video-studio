// S29 M203: chuyển cảnh v2 — tham số (dur 0.1–3 s, ease 5 preset, dir / color / intensity), 25 loại CSS mới, nhóm 6–12 loại.
// Dữ liệu cũ (không params) phải dựng ra giống hệt: s28_registry so với bản chép đông cứng; ở đây so thêm params mặc định = không params.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';

const req = createRequire(import.meta.url);
const FX = req('../../engine/fx_registry.js');
const AC = req('../../studio/features/75_ask.core.js');
const PC = req('../../studio/features/79_transpeek.core.js');
const SpeedMap = req('../../engine/speed.js');
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const OLD_IDS = ['fade', 'dissolve', 'slide_l', 'slide_r', 'slide_up', 'push', 'zoom', 'zoom_out', 'blur', 'whip', 'spin', 'wipe', 'circle', 'flash', 'glitch'];
const KS = Array.from({ length: 101 }, (_, i) => i / 100);

function mainTrackOf() {
  const src = read('engine/engine.js').match(/function mainTrack\([\s\S]*?\n}\n/)[0];
  const CLIPS = [{ in: 0, out: 2, name: 'a', t0: 0, t1: 2 }, { in: 0, out: 2, name: 'b', t0: 2, t1: 4 }];
  const ctx = vm.createContext({
    clamp: (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), CLIPS, FX, SpeedMap, TRANS: FX.transFns(),
    clipFilter: c => `f-${c.name}`,
    clipLayer: (c, s, t, f, st = '') => `<L data-cid="${c.name}" ${s.toFixed(4)} ${f}|${st}>`,
    clipAt: t => { const i = t < 2 ? 0 : 1; return { c: CLIPS[i], i, lt: t - i * 2, src: t - i * 2 }; },
  });
  vm.runInContext(src, ctx);
  return { main: ctx.mainTrack, CLIPS };
}

test('id cũ giữ nguyên thứ tự, thêm ≥ 15 loại mới, mỗi nhóm 6–12 loại (C43)', () => {
  const ids = FX.ids('trans');
  assert.deepEqual(ids.slice(0, OLD_IDS.length), OLD_IDS);
  assert.ok(ids.length - OLD_IDS.length >= 15, `mới ${ids.length - OLD_IDS.length}`);
  assert.equal(new Set(ids).size, ids.length, 'không trùng id');
  for (const [g, l] of FX.GROUPS.trans) {
    const n = FX.TRANS.filter(x => x.group === g).length;
    assert.ok(n >= 6 && n <= 12, `nhóm ${l}: ${n} loại`);
  }
  for (const id of ['pull_in', 'zoom_blur', 'shake', 'flash', 'dip', 'leak', 'burn', 'rgb_split', 'ripple', 'heart', 'star', 'diamond', 'diagonal', 'curtain', 'grid', 'flip', 'page'])
    assert.ok(FX.get('trans', id), `thiếu ${id}`);
});

test('mỗi loại: hàm thuần theo k, đủ mô tả ai, không NaN / undefined trong CSS', () => {
  for (const x of FX.TRANS) {
    for (const f of ['mood', 'nhip', 'khi_nao', 'tranh']) assert.ok(x.ai[f]?.length, `${x.id}.ai.${f}`);
    assert.ok(x.params.dur && x.params.ease, `${x.id} có dur + ease`);
    for (const k of KS) {
      const r = x.fn(k), r2 = x.fn(k, {});
      assert.ok(Array.isArray(r) && r.length === 2 && r.every(s => typeof s === 'string'), `${x.id} @ ${k}`);
      assert.deepEqual(r, r2, `${x.id} gọi lại cùng k cho cùng chuỗi`);
      const o = FX.transOverlay(x.id, k);
      assert.equal(o, FX.transOverlay(x.id, k));
      for (const s of [...r, o, FX.transWrap(x.id, k, undefined, '<i data-cid="z">')]) assert.doesNotMatch(s, /NaN|undefined|Infinity/, `${x.id} @ ${k}: ${s}`);
    }
  }
  assert.doesNotMatch(read('engine/fx_registry.js').split('const TEXT_IN')[0], /Math\.random|Date\.now|performance\.now/, 'không random / đồng hồ');
});

test('tham số: kẹp, dur 0.1–3 s, ease 5 preset (auto = giữ nguyên k)', () => {
  assert.deepEqual(FX.params('trans', 'push', { dur: 9, ease: 'x', dir: 'q' }), { dur: 3, ease: 'auto', dir: 'l' });
  assert.deepEqual(FX.params('trans', 'glitch', { intensity: 5 }), { dur: 0.4, ease: 'auto', intensity: 2 });
  assert.deepEqual(FX.TRANS[0].params.ease.values, ['auto', 'smooth', 'accel', 'decel', 'snap']);
  for (const e of FX.TRANS[0].params.ease.values) {
    assert.ok(FX.ease(e, 0) === 0, e); assert.ok(Math.abs(FX.ease(e, 1) - 1) < 1e-9, e);
    let last = -1; for (const k of KS) { const v = FX.ease(e, k); assert.ok(v >= last - 1e-12, `${e} tăng dần`); last = v; }
  }
  for (const k of KS) assert.equal(FX.ease('auto', k), k), assert.equal(FX.ease(undefined, k), k);
});

test('hướng, màu, cường độ đổi đúng hình', () => {
  const push = FX.get('trans', 'push');
  assert.match(push.fn(.3, { dir: 'r' })[0], /translateX\(-/);
  assert.match(push.fn(.3, { dir: 'u' })[0], /translateY\(\d/);
  assert.match(push.fn(.3, { dir: 'd' })[1], /translateY\(\d/);
  assert.match(FX.get('trans', 'wipe').fn(.3, { dir: 'l' })[0], /inset\(0 0 0 [\d.]+%\)/);
  assert.match(FX.get('trans', 'whip').fn(.3, { dir: 'u' })[0], /translateY/);
  assert.match(FX.get('trans', 'flip').fn(.8, { dir: 'u' })[0], /rotateX/);
  assert.match(FX.transOverlay('flash', .5, { color: 'black' }), /background:#000/);
  assert.match(FX.transOverlay('dip', .5), /background:#000/);
  assert.match(FX.transOverlay('dip', .5, { color: 'white' }), /background:#fff/);
  const gx = (k, i) => +FX.get('trans', 'glitch').fn(k, { intensity: i })[0].match(/translateX\((-?\d+)px/)[1];
  assert.ok(Math.abs(gx(.12, .2)) < Math.abs(gx(.12, 2)), 'cường độ nhỏ lệch ít hơn');
  assert.ok(Math.abs(gx(.42, 2)) >= Math.abs(gx(.42, 1)));
});

test('tách RGB: 3 bản sao lệch màu, chỉ bản giữa giữ data-cid', () => {
  const h = FX.transWrap('rgb_split', .5, {}, '<i data-cid="a">');
  assert.equal((h.match(/ data-cid=/g) || []).length, 1);
  assert.equal((h.match(/ data-mcid=/g) || []).length, 2);
  for (const c of ['#f00', '#0f0', '#00f']) assert.ok(h.includes(`background:${c}`));
  assert.equal(FX.transWrap('rgb_split', 0, {}, '<i>'), '<i>', 'đầu đoạn không lệch = không nhân bản');
  assert.equal(FX.transWrap('fade', .5, {}, '<i>'), '<i>');
});

test('mainTrack: params mặc định dựng giống hệt không params; params được truyền vào fn / overlay / wrap', () => {
  const { main, CLIPS } = mainTrackOf();
  for (const x of FX.TRANS) for (const dur of [.1, .4, 2.5]) {
    const def = Object.fromEntries(Object.entries(x.params).filter(([n]) => n !== 'dur').map(([n, s]) => [n, s.def]));
    for (let t = 1.95; t < 2 + dur + .05; t += dur / 37) {
      CLIPS[1].transition = { type: x.id, dur }; const a = main(t, 'x', 'y');
      CLIPS[1].transition = { type: x.id, dur, params: def }; const b = main(t, 'x', 'y');
      assert.equal(b, a, `${x.id} dur ${dur} t ${t}`);
    }
  }
  CLIPS[1].transition = { type: 'push', dur: 1, params: { dir: 'r' } };
  assert.match(main(2.3), /translateX\(-[\d.]+%\)">/);
  CLIPS[1].transition = { type: 'flash', dur: 1, params: { color: 'black' } };
  assert.match(main(2.5), /background:#000/);
  CLIPS[1].transition = { type: 'rgb_split', dur: 1 };
  assert.equal((main(2.5).match(/data-cid="b"/g) || []).length, 1);
  CLIPS[1].transition = { type: 'fade', dur: 1, params: { ease: 'accel' } };
  assert.match(main(2.5), /opacity:0\.25"/, 'ease accel: k .5 → .25');
  CLIPS[1].transition = { type: 'fade', dur: 3 };
  assert.match(main(4.5), /opacity:0\.83/, 'dur 3 s chạy đủ');
});

test('Claude đặt được tham số; chỉ lưu giá trị khác mặc định', () => {
  const tr = AC.actionsOf({ kind: 'video' }).find(a => a.id === 'transitions');
  assert.ok(tr.params.ease && tr.params.dir && tr.params.color && tr.params.intensity);
  for (const x of FX.TRANS) assert.ok(tr.what.includes(`${x.id} (`), `prompt thiếu ${x.id}`);
  const tl = { clips: [{}, {}, {}] };
  assert.equal(AC.transitionsApply(tl, { type: 'whip', dur: .3, dir: 'r', ease: 'auto', color: 'black' }), 2);
  assert.deepEqual(tl.clips[1].transition, { type: 'whip', dur: .3, params: { dir: 'r' } });
  AC.clipTransitionApply(tl, 2, { type: 'fade' });
  assert.deepEqual(tl.clips[2].transition, { type: 'fade', dur: .4 });
  assert.deepEqual(AC.transParams('glitch', { intensity: 9 }), { intensity: 2 });
});

test('xem thử mang tham số; Studio dùng giao diện chung, thời lượng tới 3 s', () => {
  const tl = { duration: 6, clips: [{}, { transition: { type: 'push', dur: .4, params: { dir: 'u' } } }] }, snap = JSON.stringify(tl);
  const p = PC.peekTL(tl, 1, 'whip', .5, { dir: 'u' });
  assert.deepEqual(p.clips[1].transition, { type: 'whip', dur: .5, params: { dir: 'u' } });
  assert.deepEqual(PC.peekTL(tl, 1, 'fade', .5, {}).clips[1].transition, { type: 'fade', dur: .5 });
  assert.equal(JSON.stringify(tl), snap);
  assert.equal(PC.durOf({ transition: { dur: 2.4 } }), 2.4);
  const lib = read('studio/library.js'), st = read('studio/studio.js'), ui = read('studio/features/83_transui.js'), peek = read('studio/features/79_transpeek.js');
  assert.match(lib, /Studio\.transUI\.grid\(cur, 'tr', query\)/);
  assert.match(lib, /max="3" step="\.05" value="\$\{c\?\.obj\.transition\?\.dur/);
  assert.match(st, /Studio\.transUI \? Studio\.transUI\.insp\(c\)/);
  assert.match(peek, /PC\.peekTL\(S\.TL, idx, type, dur, params\)/);
  assert.match(ui, /FX\.GROUPS\.trans/);
  assert.match(ui, /data-trpall/);
});
