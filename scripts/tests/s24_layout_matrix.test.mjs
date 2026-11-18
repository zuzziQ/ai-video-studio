// S24 M175: nghiệm thu đợt S24 — ma trận cửa sổ 1024 / 1440 / 1920 × khổ 9:16 / 16:9 × Cơ bản / Chuyên nghiệp × cột phải mở / gấp,
// chạy trên lõi thuần (76_layout.core.js, 01_level.core.js, 68_right.core.js). Số đo Studio thật (khung, nút phát, cột phải, tràn
// ngang, cuộn kép) ở docs/plans/S24-tab-claude-va-chu-thich.md mục 8; test này giữ các bất biến mà lần đo đó dựa vào.
// Chạy: node --test scripts/tests/s24_layout_matrix.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const LC = req('../../studio/features/76_layout.core.js');
const LV = req('../../studio/features/01_level.core.js');
const R = req('../../studio/features/68_right.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

const VPS = [1024, 1440, 1920];
const RATIO = { '9:16': 9 / 16, '16:9': 16 / 9 };
const MODES = ['basic', 'pro'];

function* cells() {
  for (const width of VPS) for (const [asp, ratio] of Object.entries(RATIO)) for (const mode of MODES)
    for (const foldRight of [false, true]) yield { width, asp, ratio, mode, foldRight, at: `${asp} ${width} ${mode} ${foldRight ? 'gấp' : 'mở'}` };
}

test('24 ô: nút phát một dòng, cột phải mở = panel, gấp ] = none, ở cả hai chế độ (C34, C35)', () => {
  let n = 0;
  for (const c of cells()) {
    const r = LC.compute({ ratio: c.ratio, mode: c.mode, width: c.width, foldRight: c.foldRight });
    assert.equal(r.controls, 'row', c.at); // ai-video-studio-058
    assert.equal(r.right, c.foldRight ? 'none' : 'panel', c.at);
    assert.equal(r.askPos, undefined, c.at); // không còn thanh Hỏi Claude dưới khung / cột cạnh khung
    n++;
  }
  assert.equal(n, 24);
});

test('tab cột phải: Thuộc tính · Lớp · Claude, Cơ bản ẩn Lớp, không còn Dự án', () => {
  assert.deepEqual(R.KEYS, ['props', 'layers', 'claude']);
  assert.deepEqual(LV.rightTabs('pro'), ['props', 'layers', 'claude']);
  assert.deepEqual(LV.rightTabs('basic'), ['props', 'claude']);
  for (const lv of MODES) assert.ok(!LV.rightTabs(lv).includes('project'), lv);
  assert.equal(R.migrate('project'), 'claude');
});

test('mọi ô: không chọn gì → Claude, Claude tự về mà chọn element → Thuộc tính (RT.auto), người dùng tự mở Claude thì giữ', () => {
  for (const c of cells()) {
    const keys = LV.rightTabs(c.mode);
    assert.equal(R.initialTab(null, false, keys), 'claude', c.at);
    assert.equal(R.nextTab({ tab: 'claude', had: false, has: true, keys, auto: true }), 'props', c.at);
    assert.equal(R.nextTab({ tab: 'claude', had: false, has: true, keys, auto: false }), 'claude', c.at); // / hoặc ✦ rồi chọn: giữ Claude
    assert.equal(R.nextTab({ tab: 'props', had: true, has: false, keys }), 'claude', c.at);
    if (c.mode === 'basic') assert.equal(R.nextTab({ tab: 'layers', had: false, has: true, keys }), 'props', c.at); // Lớp không có ở Cơ bản
  }
});

test('/ và ✦ mở tab Claude cả khi cột phải đang gấp hoặc đang ⤢', () => {
  assert.equal(LC.askKey({ key: '/' }), true);
  assert.equal(LC.askKey({ key: '/', mod: true }), false);
  assert.deepEqual(LC.revealRight({ foldRight: true }), [['foldRight', false]]);
  assert.deepEqual(LC.revealRight({ focus: true, foldRight: true }), [['focus', false], ['foldRight', false]]);
  assert.deepEqual(LC.revealRight({}), []);
  assert.equal(LC.foldKey({ code: 'BracketRight', key: ']' }), 'right');
});

test('/ và ✦ luôn đi qua Studio.right.show (tiêu cờ RT.auto) cả khi tab Claude đang mở sẵn (M175)', () => {
  const src = read('studio/features/75_ask.js');
  const fn = src.match(/function open\(focus = true\) \{[\s\S]*?\n {2}\}/)?.[0] || '';
  assert.match(fn, /\n\s*S\.right\?\.show\?\.\('claude'\);/);
  assert.doesNotMatch(fn, /if \(S\.right\?\.tab !== 'claude'\) S\.right\?\.show/);
  // showRightTab là chỗ duy nhất tiêu cờ
  assert.match(read('studio/studio.js'), /RT\.tab = k; RT\.had = !!sel; RT\.auto = false;/);
});

test('changeSummary / changedSpan không coi đổi thứ tự khoá là sửa (job đọc lại timeline từ đĩa, M175)', () => {
  const AC = req('../../studio/features/75_ask.core.js');
  const a = { t0: 1, t1: 2, words: [{ w: 'a', s: 1 }], cid: 'c2', x: 360, _orig: { y: 1 } };
  const b = { t0: 1, t1: 2, x: 360, words: [{ s: 1, w: 'a' }], cid: 'c2' };
  const sfx = [{ t: 3, name: 'whoosh', gain: -6 }], sfx2 = [{ gain: -6, name: 'whoosh', t: 3 }];
  assert.deepEqual(AC.changeSummary({ TL: { audio: { sfx } }, CAP: [a] }, { TL: { audio: { sfx: sfx2 } }, CAP: [b] }), []);
  assert.equal(AC.changedSpan({ TL: {}, CAP: [a] }, { TL: {}, CAP: [b] }), null);
  assert.deepEqual(AC.changeSummary({ TL: {}, CAP: [a] }, { TL: {}, CAP: [{ ...b, x: 1 }] }), ['1 dòng phụ đề']);
});

test('thẻ kết quả đổi trạng thái thì cuộn cho đáy thẻ nằm trên ô hỏi dính đáy (M175)', () => {
  const src = read('studio/features/75_ask.js');
  const set = src.match(/function setCard\(id, state\) \{[\s\S]*?\n {2}\}/)?.[0] || '';
  assert.match(set, /reveal\(id\)/);
  const rev = src.match(/function reveal\(id\) \{[\s\S]*?\n {2}\}/)?.[0] || '';
  assert.match(rev, /\.ask-comp/);
  assert.match(rev, /scrollTop \+= b - lim/);
});
