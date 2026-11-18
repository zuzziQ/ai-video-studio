// S20 M144: hình khối — cảnh `shape` của engine (engine/shape.js), tay nắm cạnh qua StageCore, panel Hình khối của Studio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import { emptyCard } from '../ai_qc.mjs';

const req = createRequire(import.meta.url);
const SH = req('../../engine/shape.js');
const C = req('../../studio/features/09_stage.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('StageCore: shape là cảnh card, hộp mặc định khớp engine ở cả dọc và ngang', () => {
  assert.equal(C.GEO.shape, 'card');
  assert.ok(C.canResize('scene', 'shape'));
  assert.deepEqual(C.boxOf({ type: 'shape' }), SH.shapeBox({}, false));
  assert.deepEqual(C.boxOf({ type: 'shape' }, true), SH.shapeBox({}, true));
  // tay nắm cạnh ghi s.card, engine đọc đúng hộp đó
  const s = { type: 'shape', shape: 'rect' };
  C.setBox(s, C.resizeEdge(C.boxOf(s), 'e', 100, 0));
  assert.deepEqual(SH.shapeBox(s), { x: 210, y: 490, w: 400, h: 300 });
});

test('shapeProps: mặc định theo loại, màu lạ không lọt vào SVG', () => {
  assert.deepEqual(SH.shapeProps({}), { kind: 'rect', fill: '#FFD84A', stroke: '#FFFFFF', sw: 0, radius: 32, opacity: 1, anim: 'fade' });
  const l = SH.shapeProps({ shape: 'line', fill: '#ff0000' });
  assert.equal(l.fill, 'none'); assert.equal(l.stroke, '#ff0000'); assert.equal(l.sw, 8);
  const bad = SH.shapeProps({ shape: 'blob', fill: '"><script>x</script>', stroke: 'red" onload="x', opacity: 4, anim: 'spin' });
  assert.equal(bad.kind, 'rect'); assert.equal(bad.fill, '#FFD84A'); assert.equal(bad.stroke, '#FFFFFF');
  assert.equal(bad.opacity, 1); assert.equal(bad.anim, 'fade');
  assert.equal(SH.shapeProps({ fill: 'none' }).fill, 'none');
  assert.equal(SH.shapeProps({ fill: 'rgba(0,0,0,.5)' }).fill, 'rgba(0,0,0,.5)');
});

test('shapeSVG: mỗi loại vẽ đúng hình trong hộp', () => {
  const P = o => SH.shapeProps(o);
  assert.match(SH.shapeSVG(P({ shape: 'rect' }), 300, 200), /<rect x="0" y="0" width="300" height="200" fill="#FFD84A"\/>/);
  // bo góc không quá nửa cạnh ngắn; viền thụt vào trong hộp
  const r = SH.shapeSVG(P({ shape: 'rounded', radius: 999, stroke_w: 10, stroke: '#000' }), 300, 100);
  assert.match(r, /x="5" y="5" width="290" height="90" rx="45"/);
  assert.match(r, /stroke="#000" stroke-width="10"/);
  assert.match(SH.shapeSVG(P({ shape: 'circle' }), 200, 200), /<ellipse cx="100" cy="100" rx="100" ry="100"/);
  assert.match(SH.shapeSVG(P({ shape: 'line', stroke_w: 8 }), 400, 32), /<line x1="4" y1="16" x2="396" y2="16"[^>]*stroke-linecap="round"/);
  const a = SH.shapeSVG(P({ shape: 'arrow', stroke_w: 10 }), 400, 64);
  assert.match(a, /<polygon points="400,32 370,14 370,50"/);
  for (const k of SH.KINDS) assert.match(SH.shapeSVG(P({ shape: k }), 120, 80), /^<svg width="120" height="80" viewBox="0 0 120 80"/);
});

test('shapeAnim: fade / pop / wipe vào mượt rồi đứng yên', () => {
  assert.deepEqual(SH.shapeAnim('fade', 0), { o: 0, s: 1, reveal: 1 });
  assert.deepEqual(SH.shapeAnim('fade', 1), { o: 1, s: 1, reveal: 1 });
  const p0 = SH.shapeAnim('pop', 0), p1 = SH.shapeAnim('pop', 2);
  assert.ok(p0.s < .5 && p0.o === 0); assert.ok(Math.abs(p1.s - 1) < 1e-9 && p1.o === 1);
  assert.ok(SH.shapeAnim('pop', .2).s > 1, 'pop vượt nhẹ rồi về 1');
  assert.equal(SH.shapeAnim('wipe', 0).reveal, 0); assert.equal(SH.shapeAnim('wipe', 1).reveal, 1);
  assert.ok(SH.shapeAnim('wipe', .1).reveal < SH.shapeAnim('wipe', .2).reveal);
});

test('module shape: đăng ký vào MODULES, phần tử gốc mang data-cid, đúng hộp card, hướng ngang theo STAGE_WH', () => {
  const ctx = { MODULES: {}, STAGE_WH: [720, 1280] };
  vm.runInNewContext(read('engine/shape.js'), ctx);
  const fn = ctx.MODULES.shape; assert.equal(typeof fn, 'function');
  const s = { type: 'shape', shape: 'circle', cid: 's3', t0: 1, t1: 4, card: { x: 10, y: 20, w: 150, h: 150 }, opacity: .5 };
  const r = fn(s, 3, 2);
  assert.deepEqual(Object.keys(r), ['front']);
  assert.match(r.front, /^<div class="abs" data-cid="s3" style="left:10px;top:20px;width:150px;height:150px;opacity:0\.500;/);
  assert.match(fn({ ...s, anim: 'wipe' }, 1.1, .1).front, /clip-path:inset\(/);
  assert.match(fn({ ...s, anim: 'pop' }, 1.05, .05).front, /transform:scale\(/);
  ctx.STAGE_WH = [1280, 720];
  assert.match(fn({ type: 'shape' }, 1, 1).front, /left:490px;top:210px;width:300px;height:300px/);
});

test('engine/index.html nạp shape.js trước engine.js; Studio có panel, tab, tên loại', () => {
  const html = read('engine/index.html');
  assert.ok(html.indexOf('src="shape.js"') > 0 && html.indexOf('src="shape.js"') < html.indexOf('src="engine.js"'));
  const f = read('studio/features/64_shapes.js');
  assert.match(f, /addPanel\('shapes', 'ti-shape', 'Hình khối', panel, \{ step: 'build'/);
  assert.match(f, /addInspectorTab\(tab\)/);
  assert.match(f, /\['shape', 'Hình',/);
  assert.match(read('studio/studio.js'), /shape: 'Hình khối'/);
  assert.match(read('studio/features/01_workflow.js'), /shapes: \['build', /);
});

test('QC: hình khối không bị coi là thẻ trống', () => {
  assert.equal(emptyCard({ type: 'shape', shape: 'rect', card: { x: 0, y: 0, w: 10, h: 10 } }), false);
});
