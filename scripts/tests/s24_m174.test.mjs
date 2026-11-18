// S24 M174 (C37): bỏ tab Dự án của cột phải — không chọn gì → tab Claude ở cả hai chế độ, tab cũ đã lưu 'project' → Claude,
// tiêu chí bước chỉ ở popover thanh bước (03_stepscore.js), "Cài đặt dự án" là panel wf-project ở bước Chuẩn bị.
// Chạy: node --test scripts/tests/s24_m174.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const R = req('../../studio/features/68_right.core.js');
const L = req('../../studio/features/01_level.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('không còn tab Dự án ở lõi cột phải và bảng tab theo chế độ', () => {
  assert.ok(!R.KEYS.includes('project'));
  assert.equal(R.valid('project'), false);
  for (const lv of ['basic', 'pro']) assert.ok(!L.rightTabs(lv).includes('project'), lv);
  assert.equal(R.IDLE, 'claude');
});

test('không chọn gì → Claude ở cả Cơ bản và Chuyên nghiệp', () => {
  for (const lv of ['basic', 'pro']) {
    const keys = L.rightTabs(lv);
    assert.equal(R.initialTab(null, false, keys), 'claude', `${lv}: lần đầu`);
    assert.equal(R.initialTab('props', false, keys), 'claude', `${lv}: Thuộc tính đã lưu mà không chọn gì`);
    assert.equal(R.nextTab({ tab: 'props', had: true, has: false, keys }), 'claude', `${lv}: bỏ chọn`);
    assert.equal(R.nextTab({ tab: 'props', had: false, has: false, keys }), 'claude', `${lv}: đổi bước`);
  }
});

test('tab cũ đã lưu là project → Claude (không rơi về luật tab hỏng)', () => {
  assert.equal(R.migrate('project'), 'claude');
  assert.equal(R.migrate('layers'), 'layers');
  for (const lv of ['basic', 'pro']) {
    const keys = L.rightTabs(lv);
    assert.equal(R.initialTab('project', false, keys), 'claude', lv);
    assert.equal(R.initialTab('project', true, keys), 'claude', `${lv}: đang chọn vẫn là Claude, chọn lại mới sang Thuộc tính`);
    assert.equal(R.nextTab({ tab: 'project', had: true, has: true, keys }), 'claude');
  }
});

test('Claude tự về (auto) + chọn element → Thuộc tính; Claude người dùng tự mở → giữ', () => {
  assert.equal(R.nextTab({ tab: 'claude', had: false, has: true, auto: true }), 'props');
  assert.equal(R.nextTab({ tab: 'claude', had: false, has: true }), 'claude');
  assert.equal(R.nextTab({ tab: 'claude', had: false, has: true, auto: false }), 'claude');
  assert.equal(R.nextTab({ tab: 'layers', had: false, has: true, auto: true }), 'layers', 'Lớp không bị giành');
});

test('studio.js: không vẽ Cài đặt dự án ở cột phải, cờ auto tiêu khi người dùng chọn tab, Studio.project cho panel trái', () => {
  const s = read('studio/studio.js');
  const ri = s.slice(s.indexOf('function renderInspector()'), s.indexOf('function projectPanel()'));
  assert.ok(!ri.includes('projectPanel()'), 'renderInspector không vẽ projectPanel');
  assert.ok(!s.includes("rtab = 'project'") && !s.includes("RT.tab = 'project'"));
  assert.match(s, /RT\.auto = false; rtStore\.set\(k\)/);
  assert.match(s, /auto: RT\.auto/);
  assert.match(s, /project: \{ html: \(\) => projectPanel\(\), mount: mountProject \}/);
  // sự kiện gắn lên khối .pp-panel, không lên #libbody (data-pf của 29_perf / 52_publish cũng ở đó)
  assert.match(s, /function mountProject\(root\) \{\n  const box = root\?\.querySelector\?\.\('\.pp-panel'\) \|\| root;/);
});

test('01_workflow.js: panel wf-project ở bước Chuẩn bị, có ở Cơ bản', () => {
  const w = read('studio/features/01_workflow.js');
  assert.match(w, /'wf-project': \['prep', 1\.5\]/);
  assert.match(w, /S\.addPanel\('wf-project', 'ti-settings', 'Dự án'/);
  assert.match(w, /S\.project\.mount\(body\)/);
  assert.equal(L.railLevel('wf-project', 'prep'), 'basic');
  assert.ok(L.railShown('wf-project', 'prep', 'basic'));
});

test('03_nextstep.js: gỡ danh sách việc + Sang bước, giữ state / fix / C17; hook _proj gỡ ở M173', () => {
  const n = read('studio/features/03_nextstep.js');
  for (const x of ['data-ns-i', 'data-ns="go"', 'data-proj', "'project'", 'MutationObserver', 'function wrap(', 'const NEXT']) assert.ok(!n.includes(x), x);
  assert.match(n, /S\.nextStep = \{[^}]*\bstate\b[^}]*\bfix\b[^}]*_paint: onPaint[^}]*editBrand \}/);
  assert.match(n, /async function guardExport\(\)/);
  assert.ok(!n.includes('_proj') && !read('studio/features/73_pins.js').includes('S._proj'), 'S24 M173: danh sách chú thích ở tab Claude, gỡ hook S._proj');
});

test('CSS mới ở khối cuối studio.css có chú thích S24 M174', () => {
  const c = read('studio/studio.css');
  const i = c.lastIndexOf('/* S24 M174');
  assert.ok(i > 0 && c.indexOf('.pp-panel section', i) > i);
});
