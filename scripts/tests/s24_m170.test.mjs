// S24 M170: nền tab Claude ở cột phải (docs/plans/S24-tab-claude-va-chu-thich.md mục 2, 4; C34, C35).
// Lõi 76_layout.core.js (right = panel | none cả hai chế độ, revealRight, askKey), 68_right.core.js / 01_level.core.js (tab Claude),
// chỗ nối ở 75_ask.js (một dạng: tab), 78_cols.js (] ở Cơ bản), studio.js (thân tab), studio.css (bỏ khối M161 / M163).
// Chạy: node --test scripts/tests/s24_m170.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const req = createRequire(import.meta.url);
const L = req('../../studio/features/76_layout.core.js');
const R = req('../../studio/features/68_right.core.js');
const V = req('../../studio/features/01_level.core.js');
const AC = req('../../studio/features/75_ask.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('Cơ bản có cột phải giống Chuyên nghiệp: cùng right, cùng gấp ], cùng ⤢ (C35)', () => {
  for (const width of [1024, 1279, 1280, 1440, 1920]) for (const ratio of [9 / 16, 16 / 9]) {
    const b = L.compute({ ratio, mode: 'basic', width }), p = L.compute({ ratio, mode: 'pro', width });
    assert.equal(b.right, 'panel'); assert.equal(b.right, p.right);
    for (const o of [{ foldRight: true }, { focus: true }])
      assert.equal(L.compute({ ratio, mode: 'basic', width, ...o }).right, L.compute({ ratio, mode: 'pro', width, ...o }).right);
    assert.equal(b.lib, 'flyout'); // khác nhau ở thư viện (ngăn trượt) và số mục chỉnh tay, không ở cột phải
  }
});

test('revealRight: lệnh cần chạy để thấy cột phải (phím /, nút ✦)', () => {
  assert.deepEqual(L.revealRight({ focus: false, foldRight: false }), []);
  assert.deepEqual(L.revealRight({ focus: true, foldRight: false }), [['focus', false]]);
  assert.deepEqual(L.revealRight({ focus: true, foldRight: true }), [['focus', false], ['foldRight', false]]);
  assert.deepEqual(L.revealRight(null), []);
  // sau khi chạy lệnh, compute ra cột phải hiện
  const st = { ratio: 9 / 16, mode: 'basic', width: 1440, focus: true, foldRight: true };
  for (const [k, v] of L.revealRight(L.compute(st))) st[k] = v;
  assert.equal(L.compute(st).right, 'panel');
});

test('askKey: chỉ phím / trần', () => {
  assert.equal(L.askKey({ key: '/' }), true);
  assert.equal(L.askKey({ key: '/', mod: true }), false);
  assert.equal(L.askKey({ key: '/', alt: true }), false);
  assert.equal(L.askKey({ key: '?' }), false);
});

test('tab Claude ở cả hai chế độ, thứ tự Thuộc tính · Lớp · Claude (Dự án còn tới M174)', () => {
  assert.deepEqual(R.KEYS, ['props', 'layers', 'claude', 'project']);
  assert.deepEqual(V.rightTabs('basic'), ['props', 'claude', 'project']);
  assert.deepEqual(V.rightTabs('pro'), ['props', 'layers', 'claude', 'project']);
  assert.ok(R.valid('claude', V.rightTabs('basic')));
  // Claude giữ nguyên khi chọn / bỏ chọn (chip phạm vi đổi theo element), như Lớp
  assert.equal(R.nextTab({ tab: 'claude', had: false, has: true }), 'claude');
  assert.equal(R.nextTab({ tab: 'claude', had: true, has: false }), 'claude');
  assert.equal(R.initialTab('claude', false, V.rightTabs('basic')), 'claude');
});

test('hợp đồng việc của 75_ask.core.js không đổi; bỏ formOf / colParts', () => {
  assert.ok(AC.actionsOf(AC.scopeOf({ step: 'build' })).some(a => a.id === 'ai_build'));
  for (const k of ['scopeOf', 'actionsOf', 'quickOf', 'checkPick']) assert.equal(typeof AC[k], 'function');
  assert.equal(AC.formOf, undefined); assert.equal(AC.colParts, undefined);
});

test('75_ask.js: một dạng trong tab Claude, ✦ ở thanh nút phát, / mở tab, #rvbar dưới khung', () => {
  const a = read('studio/features/75_ask.js');
  assert.match(a, /S\.right\?\.addTab\?\.\('claude', el =>/);
  assert.match(a, /el\.replaceChildren\(bar, none\)/);
  assert.match(a, /btn\.id = 'askbtn'/);
  assert.match(a, /\$\('#expand'\)\?\.before\(btn\)/); // thanh nút phát, không #top (ai-video-studio-039, 045)
  assert.match(a, /S\.layout\?\.revealRight\?\.\(\);\s+if \(S\.right\?\.tab !== 'claude'\) S\.right\?\.show\?\.\('claude'\);\s+inp\.focus\(\)/);
  assert.match(a, /if \(rv && c && rv\.nextElementSibling !== c\) c\.before\(rv\)/);
  for (const k of ['formOf', 'colParts', 'slotRv', 'slotIn', "'#controls') || $('#stagewrap')).after(bar)"]) assert.ok(!a.includes(k), `còn ${k}`);
  assert.match(read('studio/features/74_review.js'), /\$\('#controls'\)\.before\(bar\)/);
  assert.match(read('studio/studio.js'), /if \(tab === 'claude'\) \{ if \(RT\.ext\.claude\) RT\.ext\.claude\(el\);/);
});

test('78_cols.js: ] gấp cột phải ở Cơ bản; [ ở Cơ bản vẫn là ngăn trượt', () => {
  const c = read('studio/features/78_cols.js');
  assert.match(c, /if \(which === 'lib' && st\.lib === 'flyout'\) \{ e\.preventDefault\(\); setOpen\(!open\); return; \}/);
  assert.match(c, /if \(st\.focus \|\| \(which === 'lib' && st\.mode !== 'pro'\)\) return;/);
});

test('76_layout.js / CSS: bỏ ghim Claude cạnh / dưới khung, data-ask và khối M161 / M163', () => {
  const j = read('studio/features/76_layout.js'), css = read('studio/studio.css');
  for (const k of ['data-ask', 'layout.pin', 'data-lay-pin', 'PIN_LABEL']) assert.ok(!j.includes(k), `76_layout.js còn ${k}`);
  assert.match(j, /revealRight, refresh: apply/);
  for (const k of ['data-ask', '#askbar', '/* S23 M163', 'data-right="claude"', ':not(.wf-basic)[data-right']) assert.ok(!css.includes(k), `studio.css còn ${k}`);
  assert.match(css, /body\[data-lib="flyout"\]\[data-right="none"\] main \{ grid-template-columns: 68px minmax\(0, 1fr\); \}/);
});
