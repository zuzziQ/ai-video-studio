// S28 M202: registry hiệu ứng chung (engine/fx_registry.js). Timeline cũ không được đổi hình: so chuỗi style của mọi id cũ
// (bản chép đông cứng của engine.js trước M202) với registry ở nhiều k, và mainTrack cũ / mới trên cùng timeline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';

const req = createRequire(import.meta.url);
const FX = req('../../engine/fx_registry.js');
const AC = req('../../studio/features/75_ask.core.js');
const PC = req('../../studio/features/79_transpeek.core.js');
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ---- bản chép đông cứng của engine/engine.js trước M202 (đừng sửa: đây là "hình cũ") ----
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const E = {
  outCubic: k => 1 - Math.pow(1 - k, 3), inCubic: k => k * k * k,
  outExpo: k => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)), inOutSine: k => -(Math.cos(Math.PI * k) - 1) / 2,
};
const OLD = {
  fade: k => [`opacity:${k}`, ''],
  dissolve: k => [`opacity:${k}`, ''],
  slide_l: k => [`transform:translateX(${((1 - E.outCubic(k)) * 100).toFixed(2)}%)`, ''],
  slide_r: k => [`transform:translateX(${(-(1 - E.outCubic(k)) * 100).toFixed(2)}%)`, ''],
  slide_up: k => [`transform:translateY(${((1 - E.outCubic(k)) * 100).toFixed(2)}%)`, ''],
  push: k => [`transform:translateX(${((1 - E.inOutSine(k)) * 100).toFixed(2)}%)`, `transform:translateX(${(-E.inOutSine(k) * 100).toFixed(2)}%)`],
  zoom: k => [`opacity:${k};transform:scale(${lerp(1.35, 1, E.outCubic(k)).toFixed(3)})`, `transform:scale(${lerp(1, .85, k).toFixed(3)})`],
  zoom_out: k => [`opacity:${k};transform:scale(${lerp(.7, 1, E.outCubic(k)).toFixed(3)})`, `transform:scale(${lerp(1, 1.25, k).toFixed(3)})`],
  blur: k => [`opacity:${k};filter:blur(${((1 - k) * 22).toFixed(1)}px)`, `filter:blur(${(k * 22).toFixed(1)}px)`],
  whip: k => [`transform:translateX(${((1 - E.outExpo(k)) * 110).toFixed(2)}%);filter:blur(${((1 - k) * 26).toFixed(1)}px)`, `transform:translateX(${(-E.inCubic(k) * 110).toFixed(2)}%);filter:blur(${(k * 26).toFixed(1)}px)`],
  spin: k => [`opacity:${k};transform:rotate(${((1 - E.outCubic(k)) * -25).toFixed(1)}deg) scale(${lerp(1.4, 1, E.outCubic(k)).toFixed(3)})`, ''],
  wipe: k => [`clip-path:inset(0 ${((1 - E.inOutSine(k)) * 100).toFixed(2)}% 0 0)`, ''],
  circle: k => [`clip-path:circle(${(E.outCubic(k) * 75).toFixed(2)}% at 50% 50%)`, ''],
  flash: k => [`opacity:${k > .5 ? 1 : 0}`, ''],
  glitch: k => [`opacity:${k > .3 ? 1 : 0};transform:translateX(${k < .9 ? ((rnd(Math.floor(k * 20)) - .5) * 60).toFixed(0) : 0}px)`, ''],
};
const OLD_LUT = {
  warm: 'sepia(.22) saturate(1.2) hue-rotate(-8deg)', cool: 'saturate(1.05) hue-rotate(12deg) brightness(1.02)',
  vivid: 'saturate(1.45) contrast(1.1)', bw: 'grayscale(1) contrast(1.15)', film: 'sepia(.3) contrast(1.08) saturate(.85)',
  fade: 'contrast(.86) brightness(1.08) saturate(.8)', night: 'brightness(.8) saturate(1.2) hue-rotate(195deg) contrast(1.1)',
  pop: 'saturate(1.6) contrast(1.15) brightness(1.04)',
};
const OLD_TYPES = [['fade', 'Mờ dần', 'ti-blur'], ['dissolve', 'Hoà tan', 'ti-droplet-half-2'], ['slide_l', 'Trượt trái', 'ti-arrow-big-left-lines'], ['slide_r', 'Trượt phải', 'ti-arrow-big-right-lines'],
  ['slide_up', 'Trượt lên', 'ti-arrow-big-up-lines'], ['push', 'Đẩy', 'ti-arrows-right'], ['zoom', 'Phóng vào', 'ti-zoom-in'], ['zoom_out', 'Thu ra', 'ti-zoom-out'], ['blur', 'Nhoè', 'ti-blur-off'],
  ['whip', 'Lia nhanh', 'ti-wind'], ['spin', 'Xoay', 'ti-rotate-clockwise-2'], ['wipe', 'Gạt', 'ti-layout-sidebar-left-expand'], ['circle', 'Vòng tròn', 'ti-circle-dashed'], ['flash', 'Loé sáng', 'ti-bolt'], ['glitch', 'Nhiễu', 'ti-wave-saw-tool']];
const OLD_FILTERS = [['', 'Gốc'], ['warm', 'Ấm'], ['cool', 'Lạnh'], ['vivid', 'Rực rỡ'], ['bw', 'Đen trắng'], ['film', 'Phim'], ['fade', 'Phai'], ['night', 'Đêm'], ['pop', 'Pop']];
const OLD_ANIM = [['pop', 'Bật'], ['fade', 'Mờ dần'], ['slide_l', 'Trượt trái'], ['slide_r', 'Trượt phải'], ['drop', 'Rơi'], ['blur_zoom', 'Nhoè'], ['fly', 'Bay'], ['tumble', 'Lật'], ['type', 'Đánh máy']];
const OLD_VI = { fade: 'mờ dần', dissolve: 'hoà tan', slide_l: 'trượt trái', slide_r: 'trượt phải', slide_up: 'trượt lên', push: 'đẩy', zoom: 'phóng vào',
  zoom_out: 'thu ra', blur: 'nhoè', whip: 'lia nhanh', spin: 'xoay', wipe: 'gạt', circle: 'vòng tròn', flash: 'loé sáng', glitch: 'nhiễu' };
const OLD_MAIN = `function mainTrack(t, extraFilter = '', extraStyle = '') {
  const k = clipAt(t);
  if (!k) return '<div class="full" style="background:#000"></div>';
  const { c, i, lt, src } = k, tr = c.transition, prev = CLIPS[i - 1];
  const cur = clipLayer(c, src, t, \`\${clipFilter(c)} \${extraFilter}\`, extraStyle);
  if (!tr || !prev || lt >= (tr.dur ?? .4)) return cur;
  const p = clamp(lt / (tr.dur ?? .4)), [inS, outS] = (TRANS[tr.type] || TRANS.fade)(p);
  const pSrc = (prev.out ?? 0) + lt * (prev.speed || 1);
  const flash = tr.type === 'flash' ? \`<div class="full" style="background:#fff;opacity:\${(1 - Math.abs(p - .5) * 2).toFixed(3)}"></div>\` : '';
  return \`<div class="full">\${clipLayer(prev, pSrc, t, clipFilter(prev), outS)}<div class="full" style="\${inS}">\${cur}</div>\${flash}</div>\`;
}`;

const KS = [0, 1e-4, .001, .01, .049, .05, .1, .2, .25, .29, .3, .31, .333, .4, .45, .499, .5, .501, .55, .6, .7, .75, .8, .89, .9, .91, .95, .99, .999, 1];
for (let i = 0; i <= 200; i++) KS.push(i / 200);

test('mọi id chuyển cảnh cũ vẫn có, cùng k cho cùng chuỗi [in, out] như engine trước M202', () => {
  assert.deepEqual(FX.ids('trans').slice(0, 15), Object.keys(OLD)); // S29 M203: loại mới nối sau, id cũ giữ thứ tự
  const NEW = FX.transFns();
  for (const id of Object.keys(OLD)) for (const k of KS) assert.deepEqual(NEW[id](k, FX.params('trans', id)), OLD[id](k), `${id} @ ${k}`);
  for (const k of KS) {
    assert.equal(FX.transOverlay('flash', k), `<div class="full" style="background:#fff;opacity:${(1 - Math.abs(k - .5) * 2).toFixed(3)}"></div>`);
    for (const id of Object.keys(OLD)) if (id !== 'flash') assert.equal(FX.transOverlay(id, k), '');
  }
  assert.equal(FX.transOverlay('nope', .5), '');
});

test('hàm thuần: gọi lại cùng k cho cùng chuỗi (glitch tất định)', () => {
  for (const x of FX.TRANS) for (const k of [.12, .37, .64]) assert.deepEqual(x.fn(k), x.fn(k));
});

test('mainTrack mới (engine.js đọc FX) dựng ra đúng HTML như mainTrack cũ', () => {
  const eng = read('engine/engine.js');
  const src = eng.match(/function mainTrack\([\s\S]*?\n}\n/)[0];
  const CLIPS = [{ in: 0, out: 2, name: 'a', t0: 0, t1: 2 }, { in: 0, out: 2, name: 'b', t0: 2, t1: 4 }];
  const ctx = {
    clamp, CLIPS, FX, SpeedMap: createRequire(import.meta.url)('../../engine/speed.js'), // S29 M207: pSrc của clip trước qua SpeedMap
    clipFilter: c => `f-${c.name}`,
    clipLayer: (c, s, t, f, st = '') => `<L ${c.name} ${s.toFixed(4)} ${t.toFixed(4)} ${f}|${st}>`,
    clipAt: t => { const i = t < 2 ? 0 : 1; return { c: CLIPS[i], i, lt: t - i * 2, src: t - i * 2 }; },
  };
  const run = (code, TRANS) => { const c = vm.createContext({ ...ctx, TRANS }); vm.runInContext(code, c); return c.mainTrack; };
  const oldMain = run(OLD_MAIN, OLD), newMain = run(src, FX.transFns());
  for (const type of [...Object.keys(OLD), 'unknown_type']) for (const dur of [.1, .4, 1.5, undefined]) {
    CLIPS[1].transition = dur === undefined ? { type } : { type, dur };
    for (let t = 1.9; t < 3.6; t += 0.0137) assert.equal(newMain(t, 'x', 'y'), oldMain(t, 'x', 'y'), `${type} dur ${dur} t ${t}`);
  }
  assert.match(eng, /const TRANS = FX\.transFns\(\);/);
  assert.match(eng, /const LUT = FX\.lutCss\(\);/);
  assert.doesNotMatch(eng, /slide_l: k =>/, 'engine.js không còn chép danh sách chuyển cảnh');
});

test('LUT, TRANS_TYPES, FILTERS, ANIM_LIST giữ đúng dữ liệu cũ', () => {
  assert.deepEqual(FX.lutCss(), OLD_LUT);
  for (const x of FX.LUT) assert.equal(x.fn(1, {}), OLD_LUT[x.id]);
  assert.deepEqual(FX.transTypes().slice(0, 15), OLD_TYPES);
  assert.deepEqual(FX.filters(), OLD_FILTERS);
  assert.deepEqual(FX.animList(), OLD_ANIM);
  const clips = read('studio/clips.js'), lib = read('studio/library.js');
  assert.match(clips, /const TRANS_TYPES = FX\.transTypes\(\);/);
  assert.match(clips, /const FILTERS = FX\.filters\(\);/);
  assert.match(clips, /const LUT_CSS = FX\.lutCss\(\);/);
  assert.match(lib, /const ANIM_LIST = FX\.animList\(\);/);
  // M205: hình 9 hoạt ảnh vào đã gom vào registry, vertical.js gọi FX.animAt (so khung cũ ở s28_anim.test.mjs)
  for (const x of FX.TEXT_IN) assert.equal(typeof x.fn, 'function', `registry thiếu hàm anim ${x.id}`);
  assert.match(read('engine/vertical.js'), /FX\.animAt\(/);
});

test('mỗi mục đủ trường: nhãn, nhóm hợp lệ, icon, tham số, mô tả ai cho Claude', () => {
  for (const kind of ['trans', 'text_in', 'lut']) {
    const groups = FX.GROUPS[kind].map(g => g[0]), seen = new Set();
    for (const x of FX.list(kind)) {
      assert.ok(!seen.has(x.id), `${kind} trùng id ${x.id}`); seen.add(x.id);
      assert.ok(x.label && /^ti-/.test(x.icon) && groups.includes(x.group), `${kind}.${x.id}`);
      assert.equal(typeof x.params, 'object');
      for (const f of ['mood', 'nhip', 'khi_nao', 'tranh']) assert.ok(typeof x.ai?.[f] === 'string' && x.ai[f].length, `${kind}.${x.id}.ai.${f}`);
      if (kind === 'trans') assert.equal(typeof x.fn, 'function');
    }
  }
  assert.deepEqual(FX.params('trans', 'zoom', { dur: 9 }), { dur: 3, ease: 'auto' }); // S29 M203: 0.1–3 s + nhịp
  assert.deepEqual(FX.params('trans', 'zoom', {}), { dur: 0.4, ease: 'auto' });
  assert.deepEqual(FX.params('trans', 'zoom', { dur: '0.05' }), { dur: 0.1, ease: 'auto' });
});

test('Claude (75_ask.core.js) đọc chuyển cảnh và mô tả ai từ registry', () => {
  assert.deepEqual(AC.TRANS, FX.ids('trans'));
  for (const [id, vi] of Object.entries(OLD_VI)) assert.equal(AC.TRANS_VI[id], vi);
  const acts = AC.actionsOf({ kind: 'video' });
  const tr = acts.find(a => a.id === 'transitions');
  assert.ok(tr, 'có việc transitions');
  for (const x of FX.TRANS) assert.ok(tr.what.includes(`${x.id} (`) && tr.what.includes(x.ai.khi_nao), `prompt thiếu ${x.id}`);
  assert.deepEqual(tr.params.type.values, [...FX.ids('trans'), 'none']);
  assert.equal(tr.params.dur.max, 3); // S29 M203
  assert.ok(!/const TRANS = \['fade'/.test(read('studio/features/75_ask.core.js')));
});

test('index.html của engine và Studio nạp fx_registry.js trước nơi dùng', () => {
  const eh = read('engine/index.html'), sh = read('studio/index.html');
  assert.ok(eh.indexOf('src="fx_registry.js"') > 0 && eh.indexOf('src="fx_registry.js"') < eh.indexOf('src="registry.js"'));
  assert.ok(eh.indexOf('src="fx_registry.js"') < eh.indexOf('src="engine.js"'));
  assert.ok(sh.indexOf('src="/engine/fx_registry.js"') > 0 && sh.indexOf('src="/engine/fx_registry.js"') < sh.indexOf('src="/studio/clips.js"'));
});

test('references/clips.md khớp registry (node scripts/fx_doc.mjs)', async () => {
  const { render } = await import('../fx_doc.mjs');
  const md = read('references/clips.md');
  assert.equal(render(md), md);
  for (const id of FX.ids('trans')) assert.ok(md.includes(`| \`${id}\` |`));
});

test('xem thử: TL tạm không đụng timeline thật, đoạn ±1 s quanh chỗ nối', () => {
  const tl = { duration: 6, clips: [{ in: 0, out: 3 }, { in: 0, out: 3, transition: { type: 'fade', dur: .4 } }] };
  const snap = JSON.stringify(tl);
  const p = PC.peekTL(tl, 1, 'whip', .55);
  assert.deepEqual(p.clips[1].transition, { type: 'whip', dur: .55 });
  assert.equal(JSON.stringify(tl), snap, 'bản gốc không đổi');
  assert.equal(PC.peekTL(tl, 1, '', .4).clips[1].transition, undefined);
  assert.equal(JSON.stringify(PC.peekTL(tl, 0, 'zoom', .4)), snap, 'clip đầu không có chuyển cảnh vào');
  assert.deepEqual(PC.span(3, 6), { a: 2, b: 4 });
  assert.deepEqual(PC.span(.4, 6), { a: 0, b: 1.4 });
  assert.deepEqual(PC.span(5.5, 6), { a: 4.5, b: 6 });
  assert.equal(PC.frameT({ a: 2, b: 4 }, 500), 2.5);
  assert.equal(PC.frameT({ a: 2, b: 4 }, 2500), 2.5);
  assert.equal(PC.durOf({ transition: { dur: .8 } }, '.3'), .8);
  assert.equal(PC.durOf({}, '.3'), .3);
  assert.equal(PC.durOf({}, undefined), .4);
  assert.equal(PC.durOf({}, '9'), 3); // S29 M203: 0.1–3 s
  const ui = read('studio/features/79_transpeek.js').replace(/^\s*\/\/.*$/gm, ''); // chỉ mã, bỏ chú thích
  assert.doesNotMatch(ui, /pushUndo|markDirty|changed\(|saveNow/, 'xem thử không ghi hoàn tác / không tự lưu');
  assert.match(ui, /S\.previewTL\(PC\.peekTL\(S\.TL/);
  assert.match(ui, /S\.redraw\(\)/);
  const st = read('studio/studio.js');
  assert.match(st, /previewTL: src => previewTL\(src\), redraw\(\) \{ needInit = true; draw\(\); \}/);
});
