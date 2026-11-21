// S28 M206: track Hiệu ứng. Timeline cũ (TL.fx, TL.grade) phải dựng ra y hệt: so fxWrap / gradeBase cũ (bản chép đông cứng của
// engine.js trước M206) với bản mới ở nhiều t; khối mới (TL.efx) là hàm thuần theo t; lõi Studio ghi ngược đúng nguồn; Claude biết nhóm fx.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';

const req = createRequire(import.meta.url);
const FX = req('../../engine/fx_registry.js');
const FT = req('../../studio/features/81_fxtrack.core.js');
const AC = req('../../studio/features/75_ask.core.js');
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---- bản chép đông cứng của engine/engine.js trước M206 (đừng sửa: đây là "hình cũ") ----
const OLD = `const FX_DUR = { shake: .35, punch: .25, zoom_in: .6, whip: .3, blur_in: .35, glitch: .3, flash: .25, rgb: .3, push: 2, mono: 1.5 };
function fxWrap(t, html) {
  const list = (TL.fx || []).filter(f => t >= f.t && t < f.t + (f.dur ?? FX_DUR[f.type] ?? .3));
  if (!list.length) return html;
  let tr = '', fl = '', over = '';
  for (const f of list) {
    const d = f.dur ?? FX_DUR[f.type] ?? .3, k = (t - f.t) / d, j = Math.floor(t * 30);
    if (f.type === 'shake') { const m = (f.amp ?? 14) * (1 - k); tr += \` translate(\${(Math.sin(j * 2.1) * m).toFixed(1)}px,\${(Math.cos(j * 1.7) * m).toFixed(1)}px) scale(\${(1 + m / 300).toFixed(4)})\`; }
    if (f.type === 'punch') tr += \` scale(\${(1 + (f.amp ?? .12) * (1 - E.outCubic(k))).toFixed(4)})\`;
    if (f.type === 'zoom_in') tr += \` scale(\${(1 + (f.amp ?? .15) * E.inOutSine(k)).toFixed(4)})\`;
    if (f.type === 'push') tr += \` scale(\${(1 + (f.amp ?? .1) * E.inOutSine(clamp(k / .35)) * (1 - E.inOutSine(clamp((k - .75) / .25)))).toFixed(4)})\`;
    if (f.type === 'mono') { const m = 1 - E.inOutSine(clamp((k - .7) / .3)); fl += \` grayscale(\${m.toFixed(3)}) contrast(\${(1 + .25 * m).toFixed(3)})\`; }
    if (f.type === 'whip') {
      const x = k < .5 ? -E.inCubic(k * 2) * 420 : (1 - E.outCubic((k - .5) * 2)) * 420;
      tr += \` translateX(\${x.toFixed(1)}px) scale(\${(1 + Math.abs(x) / 620).toFixed(4)})\`; fl += \` blur(\${(Math.sin(Math.PI * k) * 22).toFixed(1)}px)\`;
    }
    if (f.type === 'blur_in') fl += \` blur(\${((1 - E.outCubic(k)) * 24).toFixed(1)}px) brightness(\${(1 + (1 - k) * .4).toFixed(2)})\`;
    if (f.type === 'glitch' || f.type === 'rgb') {
      const on = rnd(j) > .35;
      if (on) { tr += \` translateX(\${((rnd(j + 1) - .5) * 36).toFixed(1)}px) scale(1.03)\`; fl += \` hue-rotate(\${Math.round(rnd(j + 2) * 90)}deg) saturate(1.8)\`; }
      over += \`<div class="full" style="background:repeating-linear-gradient(transparent 0 \${2 + Math.round(rnd(j + 3) * 4)}px, rgba(255,255,255,.07) 0 \${4 + Math.round(rnd(j + 3) * 4)}px);mix-blend-mode:screen"></div>\`;
      if (on) over += \`<div class="abs" style="left:0;right:0;top:\${Math.round(rnd(j + 4) * 640)}px;height:\${20 + Math.round(rnd(j + 5) * 60)}px;background:rgba(255,40,90,.35);mix-blend-mode:screen;transform:translateX(\${Math.round((rnd(j + 6) - .5) * 80)}px)"></div>\`;
    }
    if (f.type === 'flash') over += \`<div class="full" style="background:#fff;opacity:\${(1 - E.outCubic(k)).toFixed(3)}"></div>\`;
  }
  return \`<div class="full" style="transform:\${tr || 'none'};filter:\${fl || 'none'};transform-origin:50% 45%">\${html}</div>\${over}\`;
}
function gradeBase(t) { const g = activeIn(TL.grade, t).pop(); return GRADES[g ? g.mode : 'normal'] || g.mode; }`;

const ctx0 = () => ({
  FX, Math,
  clamp: (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)),
  rnd: i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); },
  E: { outCubic: k => 1 - Math.pow(1 - k, 3), inCubic: k => k * k * k, inOutSine: k => -(Math.cos(Math.PI * k) - 1) / 2 },
  GRADES: { normal: 'n', bw: 'bw', sad: 's', mellow: 'm', blur: 'b' },
  activeIn: (list, t) => (list || []).filter(r => t >= r.t0 && t < r.t1),
});
function engineNew(TL) {
  const eng = read('engine/engine.js');
  const fx = eng.match(/\/\/ S28 M206: thời lượng mặc định[\s\S]*?\nfunction fxWrap\([\s\S]*?\n}\n/)[0];
  const gr = eng.match(/function gradeBase\(t\)[^\n]*\n/)[0];
  const c = vm.createContext({ ...ctx0(), TL }); vm.runInContext(fx + gr, c); return c;
}
function engineOld(TL) { const c = vm.createContext({ ...ctx0(), TL }); vm.runInContext(OLD, c); return c; }
const OLD_FX = ['shake', 'punch', 'zoom_in', 'whip', 'blur_in', 'glitch', 'flash', 'rgb', 'push', 'mono'];

test('timeline cũ (TL.fx, TL.grade) dựng ra y hệt bản trước M206', () => {
  const TL = {
    fx: [...OLD_FX.map((type, i) => ({ t: i * 2.1, type })), { t: 3, type: 'shake', amp: 30, dur: .8 }, { t: 9, type: 'punch', amp: .3 }, { t: 15, type: 'unknown' }],
    grade: [{ t0: 1, t1: 4, mode: 'bw' }, { t0: 3, t1: 6, mode: 'sad' }, { t0: 8, t1: 9, mode: 'filter:custom' }],
  };
  const a = engineOld(TL), b = engineNew(TL);
  let n = 0;
  for (let t = 0; t < 23; t += 0.0333) {
    assert.equal(b.fxWrap(t, '<X>'), a.fxWrap(t, '<X>'), `fxWrap t ${t}`);
    assert.equal(b.gradeBase(t), a.gradeBase(t), `gradeBase t ${t}`);
    n++;
  }
  assert.ok(n > 600);
  assert.deepEqual(FX.accentDur(), { shake: .35, punch: .25, zoom_in: .6, whip: .3, blur_in: .35, glitch: .3, flash: .25, rgb: .3, push: 2, mono: 1.5 });
  // không có khối main: lớp video chính y nguyên
  assert.equal(b.mainFx(2, '<V>'), '<V>');
  assert.match(read('engine/engine.js'), /fxWrap\(t, \(cover \? '' : mainFx\(t, arollImg\(t\)\) \+ burnMask\(\)\)/);
});

test('khối ẩn không dựng; khối mới phủ cả khung hoặc chỉ video chính', () => {
  const TL = { fx: [{ t: 0, type: 'flash', hidden: true }], grade: [{ t0: 0, t1: 5, mode: 'bw', hidden: true }],
    efx: [{ type: 'vignette', start: 1, end: 3, params: {}, target: 'all' }, { type: 'pulse', start: 1, end: 3, params: { intensity: 1 }, target: 'main' }, { type: 'grain', start: 0, end: 9, hidden: true }] };
  const e = engineNew(TL);
  assert.equal(e.fxWrap(.1, '<X>'), '<X>');
  assert.equal(e.gradeBase(1), 'n');
  const all = e.fxWrap(2, '<X>');
  assert.match(all, /radial-gradient\(ellipse at 50% 50%, transparent 45\.0%/);
  assert.doesNotMatch(all, /brightness/, 'pulse là main: không vào wrapper cả khung');
  assert.match(e.mainFx(1, '<V>'), /^<div class="full" style="transform: scale\(1\.0300\);filter: brightness\(1\.450\)[^"]*"><V><\/div>$/);
  assert.equal(e.mainFx(3, '<V>'), '<V>', 'end là mốc mở');
});

test('registry nhóm fx: 10 nhấn cũ + ≥ 10 khối mới, ≤ 3 thanh, hàm thuần theo t', () => {
  const list = FX.list('fx'), fresh = list.filter(x => !x.legacy);
  assert.deepEqual(list.filter(x => x.legacy).map(x => x.id).sort(), [...OLD_FX].sort());
  assert.ok(fresh.length >= 10);
  assert.ok(FX.GROUPS.fx.length >= 3);
  for (const x of list) {
    assert.ok(x.label && x.icon && x.ai?.mood && x.ai?.khi_nao && x.ai?.tranh, x.id);
    assert.ok(FX.GROUPS.fx.some(g => g[0] === x.group), x.id);
    assert.ok(Object.keys(x.params).length <= 3, x.id);
  }
  for (const x of fresh) {
    assert.equal(typeof x.fn, 'function', x.id);
    for (const n of Object.keys(x.params)) assert.ok(['intensity', 'speed', 'range'].includes(n), `${x.id}.${n}`);
    const b = { type: x.id, start: 1, end: 4, params: {}, ...(x.color ? { filter: { exposure: .3, vignette: .4 } } : {}) }; // S29 M208: khối Điều chỉnh mang bộ màu
    for (const t of [1, 1.37, 2.5, 3.99]) {
      const r1 = FX.fxApply([b], t, '<p data-cid="s1">x</p>'), r2 = FX.fxApply([b], t, '<p data-cid="s1">x</p>');
      assert.deepEqual(r1, r2, `${x.id} t ${t}`);
      assert.ok(r1.over || r1.fl || r1.tr || r1.html !== '<p data-cid="s1">x</p>', `${x.id} không làm gì`);
      assert.equal((r1.html.match(/data-cid=/g) || []).length, 1, `${x.id}: bản sao không mang data-cid`);
      assert.doesNotMatch(r1.over + r1.html, /animation|@keyframes|transition:/, `${x.id}: không CSS animation theo đồng hồ`);
      assert.doesNotMatch(r1.over + r1.html + r1.fl + r1.tr, /NaN|undefined/, x.id);
    }
  }
  // tham số kẹp theo bảng
  assert.deepEqual(FX.params('fx', 'vignette', { intensity: 9, range: -1 }), { intensity: 1, range: .1 });
});

test('lõi Studio: khối đọc từ ba nguồn, sửa ghi ngược đúng nguồn', () => {
  const tl = { duration: 20, fx: [{ t: 2, type: 'punch' }], grade: [{ t0: 5, t1: 8, mode: 'bw' }], efx: [{ type: 'grain', start: 1, end: 6, params: { intensity: .2 } }] };
  const bs = FT.blocks(tl);
  assert.deepEqual(bs.map(b => [b.src, b.type, b.start, b.end, b.target]), [['efx', 'grain', 1, 6, 'all'], ['fx', 'punch', 2, 2.25, 'all'], ['grade', 'grade', 5, 8, 'main']]);
  assert.equal(bs[1].label, 'Đấm zoom');
  assert.equal(bs[2].label, 'Màu: Đen trắng');
  FT.setTimes('fx', tl.fx[0], 3, 3.25, true);
  assert.deepEqual(tl.fx[0], { t: 3, type: 'punch' }, 'dời nhấn cũ không ghi thêm dur');
  FT.setTimes('fx', tl.fx[0], 3, 4, false);
  assert.deepEqual(tl.fx[0], { t: 3, type: 'punch', dur: 1 });
  FT.setTimes('grade', tl.grade[0], 4, 9, false); assert.deepEqual(tl.grade[0], { t0: 4, t1: 9, mode: 'bw' });
  FT.setTimes('efx', tl.efx[0], 2, 2.01, false); assert.equal(tl.efx[0].end, 2.05, 'khối ngắn nhất 0,05 s');
  FT.setParam('efx', tl.efx[0], 'intensity', 5); assert.equal(tl.efx[0].params.intensity, 1);
  FT.setParam('efx', tl.efx[0], 'type', 'shake'); assert.equal(tl.efx[0].type, 'grain', 'khối mới không đổi sang loại nhấn cũ');
  FT.setParam('efx', tl.efx[0], 'type', 'vhs'); assert.equal(tl.efx[0].type, 'vhs');
  FT.setParam('efx', tl.efx[0], 'target', 'x'); assert.equal(tl.efx[0].target, 'all');
  FT.setParam('fx', tl.fx[0], 'amp', .2); assert.equal(tl.fx[0].amp, .2);
  FT.setParam('grade', tl.grade[0], 'mode', 'lol'); assert.equal(tl.grade[0].mode, 'bw');
});

test('Claude: fx_add trong phạm vi video / đoạn, áp lên bản sao rồi xem lại', () => {
  const video = AC.scopeOf({ step: 'build' });
  assert.ok(AC.actionsOf(video).some(a => a.id === 'fx_add'));
  const fxa = AC.actionsOf(video).find(a => a.id === 'fx_add');
  assert.match(fxa.what, /light_leak \(rò sáng\)/);
  assert.deepEqual(fxa.params.type.values, FX.ids('fx'));
  const pk = AC.checkPick({ action: 'fx_add', params: { type: 'grain', intensity: 3, target: 'main' } }, video);
  assert.equal(pk.action, 'fx_add'); assert.equal(pk.params.intensity, 1); assert.equal(pk.params.target, 'main');
  assert.equal(AC.checkPick({ action: 'fx_add', params: { type: 'nope' } }, video).action, 'answer');
  const tl = { duration: 30 };
  assert.equal(AC.fxAddApply(tl, { type: 'letterbox', intensity: .5 }, { a: 4, b: 9 }, 0), 1);
  assert.deepEqual(tl.efx, [{ type: 'letterbox', start: 4, end: 9, params: { intensity: .5, speed: 1, range: .12 }, target: 'all' }]);
  AC.fxAddApply(tl, { type: 'shake', amp: 20 }, null, 7.5);
  assert.deepEqual(tl.fx, [{ t: 7.5, type: 'shake', dur: .35, amp: 20 }]);
  assert.deepEqual(AC.changedSpan({ TL: {}, CAP: [] }, { TL: tl, CAP: [] }), { t0: 4, t1: 9 });
  assert.ok(AC.changeSummary({ TL: {}, CAP: [] }, { TL: tl, CAP: [] }).includes('+2 hiệu ứng'));
  const src = { duration: 10 }, peek = FT.peekTL(src, { type: 'glow', dur: 2 }, 3);
  assert.equal(src.efx, undefined, 'xem thử không đổi timeline thật');
  assert.deepEqual([peek.efx[0].start, peek.efx[0].end], [3, 5]);
});

test('Studio: track Hiệu ứng khai báo, luôn hiện, ẩn track chỉ ở preview; thư viện thả được', () => {
  const st = read('studio/studio.js'), lib = read('studio/library.js');
  assert.match(st, /const TRACKS = \[\['efx', 'Hiệu ứng', 'ti-wand'\]/);
  assert.match(st, /\['cap', 'audio', 'efx'\]\.includes\(key\)/);
  assert.match(st, /if \(TRK\.efx\.hide\) for \(const k of \['fx', 'grade', 'efx'\]\)/);
  assert.match(lib, /\[data-efxadd\]'\)\)\) return \['efx'/);
  assert.match(lib, /d\.kind === 'efx'\) return window\.Studio\?\.fxtrack\?\.add/);
  const D = req('../../studio/features/65_drop.core.js');
  assert.deepEqual(D.decode(D.encode('efx', 'vhs')), { kind: 'efx', id: 'vhs' });
  for (const f of ['studio/features/81_fxtrack.js', 'studio/features/81_fxtrack.core.js']) assert.ok(fs.existsSync(new URL('../../' + f, import.meta.url)));
});
