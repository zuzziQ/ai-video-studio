// M94: graphic text is never cut by its box. engine/fit.js shrinks text that spills its clip (HyperFrames blocks once per
// iframe, pack modules' .fit boxes each frame); hf.js widens overlay blocks to the frame; applyTemplate re-places a 16:9
// template's cards on a vertical video. Full check needs Chrome: node scripts/tpl_text_audit.mjs <dự án> --stretch 1.15.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('M94: engine nạp fit.js trước hf.js và gọi co chữ ở cả khối HF lẫn module pack', () => {
  const html = read('engine/index.html');
  assert.ok(html.indexOf('src="fit.js"') > 0 && html.indexOf('src="fit.js"') < html.indexOf('src="hf.js"'), 'fit.js phải nạp trước hf.js');
  assert.match(read('engine/hf.js'), /hfFit\(w, \{ x0: cx\.x0/, 'hf.js phải co chữ theo vùng hiển thị của khối');
  assert.match(read('engine/engine.js'), /fitStage\(stage\)/, 'renderFrame phải co các hộp .fit');
});

// cta-lockup: a static .mount-card with overflow:hidden wraps an absolute #root whose containing block is above it, so it
// clips nothing; counting it as a clip made fit.js shrink the CTA to 70 % and the audit report −240 px.
test('M94: __clipChain bỏ qua hộp overflow không phải containing block của con absolute', () => {
  const win = { getComputedStyle: e => e.cs };
  const el = (cs, parent) => ({ cs: { position: 'static', overflowX: 'visible', overflowY: 'visible', clipPath: 'none', display: 'block', visibility: 'visible',
    transform: 'none', filter: 'none', perspective: 'none', contain: 'none', willChange: 'auto', ...cs }, parentElement: parent, ownerDocument: doc });
  const doc = { defaultView: win, documentElement: null };
  const ctx = { window: {} };
  vm.runInNewContext(read('engine/fit.js'), ctx);
  const outer = el({ position: 'relative', overflowX: 'hidden', overflowY: 'hidden' }, null);
  const card = el({ overflowX: 'hidden', overflowY: 'hidden' }, outer);            // static: not the CB of #root
  const inner = el({ position: 'absolute', overflowX: 'hidden', overflowY: 'hidden' }, card);
  const text = el({}, inner);
  assert.deepEqual([...ctx.window.__clipChain(text, null)], [inner, outer]);
  card.cs.position = 'relative';                                                    // now it is the CB: it clips
  assert.deepEqual([...ctx.window.__clipChain(text, null)], [inner, card, outer]);
});

test('M94: mẫu 16:9 áp vào video dọc: thẻ về giữa khung, y theo tỉ lệ, on_vertical thắng', () => {
  const ctx = { window: {}, MODULES: {}, PACKS: [], BR: () => ({}), console };
  const src = read('engine/packs/core.js'), i = src.indexOf('function applyTemplate');
  vm.runInNewContext(src.slice(i, src.indexOf('window.applyTemplate', i)) + ';this.applyTemplate = applyTemplate;', ctx);
  const tpl = { aspect: '16:9', base_dur: 20, use_recipe: false, scenes: [
    { type: 'rv_coupon', t0: 1, t1: 2, x: 900, y: 360 },
    { type: 'hf', block: 'notification-stack', t0: 1, t1: 2, on_vertical: { size: 175 } }] };
  const vert = ctx.applyTemplate({ duration: 20, width: 1080, height: 1920 }, tpl, [], '');
  assert.equal(vert.scenes[0].x, undefined);
  assert.equal(vert.scenes[0].y, 640);
  assert.equal(vert.scenes[1].size, 175);
  assert.equal(vert.scenes[1].on_vertical, undefined);
  const land = ctx.applyTemplate({ duration: 20, width: 1920, height: 1080 }, tpl, [], '');
  assert.equal(land.scenes[0].x, 900);
  assert.equal(land.scenes[1].size, undefined);
});
