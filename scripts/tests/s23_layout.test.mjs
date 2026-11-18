// S23 M161: nền bố cục — lõi studio/features/76_layout.core.js (khổ × chế độ × bề rộng → vùng) và chỗ nối ở 76_layout.js,
// studio.js, studio.css. Kế hoạch: docs/plans/S23-bo-cuc-theo-kho-video.md mục 2, 4; C29 (timeline mặc định), C31 (ngưỡng).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const req = createRequire(import.meta.url);
const L = req('../../studio/features/76_layout.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

const RATIO = { '9:16': 9 / 16, '4:5': 0.8, '1:1': 1, '16:9': 16 / 9 };

test('bảng khổ × chế độ × bề rộng (C29, C31)', () => {
  // [khổ, chế độ, bề rộng] → [askPos, tl, lib, right, controls]
  const rows = [
    ['9:16', 'basic', 1920, 'side', 'strip', 'flyout', 'claude', 'row'],
    ['9:16', 'pro', 1920, 'side', 'full', 'panel', 'panel', 'column'],
    ['9:16', 'basic', 1440, 'side', 'strip', 'flyout', 'claude', 'row'],
    ['9:16', 'pro', 1440, 'side', 'full', 'panel', 'panel', 'column'],
    ['9:16', 'basic', 1280, 'side', 'strip', 'flyout', 'claude', 'row'],
    ['9:16', 'basic', 1279, 'bottom', 'compact', 'flyout', 'none', 'row'],
    ['9:16', 'pro', 1024, 'bottom', 'compact', 'panel', 'panel', 'row'],
    ['4:5', 'basic', 1600, 'bottom', 'strip', 'flyout', 'none', 'row'], // 0,8 không < 0,8
    ['1:1', 'pro', 1600, 'bottom', 'full', 'panel', 'panel', 'row'],
    ['16:9', 'basic', 1920, 'bottom', 'strip', 'flyout', 'none', 'row'],
    ['16:9', 'pro', 1920, 'bottom', 'full', 'panel', 'panel', 'row'],
    ['16:9', 'pro', 1024, 'bottom', 'compact', 'panel', 'panel', 'row'],
  ];
  for (const [k, mode, width, ask, tl, lib, right, controls] of rows) {
    const r = L.compute({ ratio: RATIO[k], mode, width });
    assert.deepEqual([r.askPos, r.tl, r.lib, r.right, r.controls], [ask, tl, lib, right, controls], `${k} ${mode} ${width}`);
    assert.equal(r.narrow, width < 1280);
  }
});

test('ghim kiểu ở ⋯ → Bố cục thắng Tự động, trừ cửa sổ hẹp', () => {
  assert.equal(L.compute({ ratio: RATIO['16:9'], mode: 'basic', width: 1600, pin: 'side' }).askPos, 'side');
  assert.equal(L.compute({ ratio: RATIO['9:16'], mode: 'pro', width: 1600, pin: 'bottom' }).askPos, 'bottom');
  assert.equal(L.compute({ ratio: RATIO['16:9'], mode: 'basic', width: 1200, pin: 'side' }).askPos, 'bottom');
  assert.equal(L.compute({ ratio: RATIO['9:16'], mode: 'pro', width: 1600, pin: 'lạ' }).pin, 'auto');
  // tỉ lệ chưa biết (khung chưa tải) → dưới khung
  assert.equal(L.askPos(undefined, 1600, 'auto'), 'bottom');
  assert.equal(L.askPos(0, 1600, 'auto'), 'bottom');
});

test('mức timeline nhớ theo chế độ, cửa sổ hẹp nhớ riêng', () => {
  assert.equal(L.tlKey('basic', false), 'tl.basic');
  assert.equal(L.tlKey('pro', false), 'tl.pro');
  assert.equal(L.tlKey('lạ', false), 'tl.pro');
  assert.equal(L.tlKey('basic', true), 'tl.narrow');
  assert.equal(L.tlKey('pro', true), 'tl.narrow');
  // mô phỏng localStorage: đổi ở Chuyên nghiệp không đổi Cơ bản
  const store = {};
  const at = (mode, width) => { const n = L.isNarrow(width); return L.compute({ ratio: RATIO['9:16'], mode, width, tl: store[L.tlKey(mode, n)] }).tl; };
  assert.equal(at('pro', 1600), 'full');
  store[L.tlKey('pro', false)] = L.cycle(at('pro', 1600)); // ` ở Chuyên nghiệp: đầy đủ → dải tua
  assert.equal(at('pro', 1600), 'strip');
  assert.equal(at('basic', 1600), 'strip');
  store[L.tlKey('basic', false)] = 'compact';
  assert.equal(at('basic', 1600), 'compact');
  assert.equal(at('pro', 1600), 'strip');
  assert.equal(at('pro', 1100), 'compact'); // hẹp: mặc định gọn, không lấy mức của chế độ
  store['tl.narrow'] = 'full';
  assert.equal(at('basic', 1100), 'full');
  assert.equal(L.compute({ mode: 'pro', width: 1600, tl: 'rác' }).tl, 'full');
});

test('phím ` xoay vòng ba mức, Shift ngược', () => {
  assert.equal(L.cycle('strip'), 'compact');
  assert.equal(L.cycle('compact'), 'full');
  assert.equal(L.cycle('full'), 'strip');
  assert.equal(L.cycle('strip', true), 'full');
  assert.equal(L.cycle('full', true), 'compact');
  assert.equal(L.cycle(null), 'strip');
});

test('kéo mép trên bắt về mức gần nhất, đầy đủ kẹp theo cửa sổ', () => {
  assert.deepEqual(L.snap(10, 900), { tl: 'strip', h: 40 });
  assert.deepEqual(L.snap(79, 900), { tl: 'strip', h: 40 });
  assert.deepEqual(L.snap(80, 900), { tl: 'compact', h: 120 });
  assert.deepEqual(L.snap(149, 900), { tl: 'compact', h: 120 });
  assert.deepEqual(L.snap(150, 900), { tl: 'full', h: 180 });
  assert.deepEqual(L.snap(420, 900), { tl: 'full', h: 420 });
  assert.deepEqual(L.snap(900, 900), { tl: 'full', h: 580 }); // 900 − 320
  assert.equal(L.tlHeight('strip', 500, 900), 40);
  assert.equal(L.tlHeight('compact', 500, 900), 120);
  assert.equal(L.tlHeight('full', undefined, 900), 300);
  assert.equal(L.tlHeight('full', 9999, 700), 380);
  assert.equal(L.tlHeight('full', 9999, 400), 180); // cửa sổ rất thấp: vẫn tối thiểu 180
});

test('nút ⤢ (focus): ẩn thanh thư viện và cột Thuộc tính, cột Claude ở lại', () => {
  const p = L.compute({ ratio: RATIO['9:16'], mode: 'pro', width: 1600, focus: true });
  assert.deepEqual([p.lib, p.right, p.focus], ['none', 'none', true]);
  const b = L.compute({ ratio: RATIO['9:16'], mode: 'basic', width: 1600, focus: true });
  assert.deepEqual([b.lib, b.right], ['none', 'claude']);
});

test('chỗ nối: Studio.layout thay body.expanded, CSS theo data-*', () => {
  const js = read('studio/features/76_layout.js');
  for (const k of ['S.layout =', 'get()', 'set(', 'on(', "'data-ask'", "'data-tl'", 'LayoutCore', 'avs-notices', 'wf-more'])
    assert.ok(js.includes(k), `76_layout.js thiếu ${k}`);
  const st = read('studio/studio.js');
  assert.ok(!/classList\.(toggle|contains|add)\('expanded'\)/.test(st), 'studio.js còn body.expanded');
  assert.ok(st.includes('Studio.layout'), 'studio.js phải gọi Studio.layout (kéo mép, nút ⤢)');
  assert.ok(/\bfit,/.test(st.slice(st.indexOf('const Studio = window.Studio'))), 'Studio.fit phải có cho 76_layout.js');
  assert.ok(!read('studio/library.js').includes("classList.contains('expanded')"));
  assert.ok(!read('studio/features/74_review.js').includes("classList.contains('expanded')"));
  const css = read('studio/studio.css');
  assert.ok(!css.includes('body.expanded'), 'studio.css còn body.expanded');
  for (const k of ['body[data-ask="side"] #center', 'body[data-tl="strip"]', 'body[data-tl="compact"]', 'body[data-focus] main', '#center > #avs-notices'])
    assert.ok(css.includes(k), `studio.css thiếu ${k}`);
});
