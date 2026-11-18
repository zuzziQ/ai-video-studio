// S23 M165: hai cột theo chế độ — lõi thuần (76_layout.core.js: gấp cột, phím [ ], ngăn trượt) + hợp đồng CSS / feature.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LC = createRequire(import.meta.url)(path.join(ROOT, 'studio/features/76_layout.core.js'));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('Chuyên nghiệp gấp thư viện / cột phải; Cơ bản bỏ qua gấp thư viện, gấp được cột phải (M170)', () => {
  const base = { ratio: 9 / 16, width: 1440 };
  assert.deepEqual([LC.compute({ ...base, mode: 'pro' }).lib, LC.compute({ ...base, mode: 'pro' }).right], ['panel', 'panel']);
  const f = LC.compute({ ...base, mode: 'pro', foldLib: true, foldRight: true });
  assert.deepEqual([f.lib, f.right, f.foldLib, f.foldRight], ['none', 'none', true, true]);
  const b = LC.compute({ ...base, mode: 'basic', foldLib: true, foldRight: true });
  assert.deepEqual([b.lib, b.right, b.foldLib, b.foldRight], ['flyout', 'none', false, true]);
  assert.equal(LC.compute({ ...base, mode: 'pro', focus: true }).lib, 'none');
});

test('nút phát luôn một dòng dưới khung (chốt 2026-11-18)', () => {
  for (const ratio of [9 / 16, 1, 16 / 9]) for (const mode of LC.MODES) for (const width of [1024, 1440, 1920])
    assert.equal(LC.compute({ ratio, mode, width }).controls, 'row', `${ratio} ${mode} ${width}`);
});

test('phím trần [ / ] → cột; có ⌘ / Ctrl / ⌥ thì không (đưa lớp lên / xuống)', () => {
  assert.equal(LC.foldKey({ code: 'BracketLeft', key: '[' }), 'lib');
  assert.equal(LC.foldKey({ code: 'BracketRight', key: ']' }), 'right');
  assert.equal(LC.foldKey({ code: 'BracketLeft', key: 'ư' }), 'lib'); // bàn phím Telex / khác: theo vị trí phím
  assert.equal(LC.foldKey({ code: 'BracketLeft', key: '[', mod: true }), null);
  assert.equal(LC.foldKey({ code: 'BracketRight', key: ']', alt: true }), null);
  assert.equal(LC.foldKey({ code: 'KeyA', key: 'a' }), null);
  assert.deepEqual(LC.toggleFold({ foldLib: false, foldRight: true }, 'lib'), { foldLib: true, foldRight: true });
  assert.deepEqual(LC.toggleFold({ foldLib: false, foldRight: true }, 'right'), { foldLib: false, foldRight: false });
});

test('ngăn trượt: bấm lại đúng panel đang mở thì đóng, còn lại mở', () => {
  assert.equal(LC.flyoutClick(false, false), true);
  assert.equal(LC.flyoutClick(false, true), true);  // đang đóng, bấm panel gần nhất → mở
  assert.equal(LC.flyoutClick(true, false), true);  // đổi panel → vẫn mở
  assert.equal(LC.flyoutClick(true, true), false);
});

test('CSS: ngăn trượt tuyệt đối, cột gấp, thư viện đủ rộng cho dòng ~70 ký tự (#192), không còn cột nút phát', () => {
  const css = read('studio/studio.css');
  assert.match(css, /body\[data-lib="flyout"\] #lib \{[^}]*position: absolute/);
  assert.match(css, /body\[data-lib="flyout"\]\[data-libopen\] #lib \{[^}]*visibility: visible/);
  assert.match(css, /body\[data-lib="flyout"\] #lib \{[^}]*width: min\(420px/);
  assert.match(css, /--libw: clamp\(312px, 22vw, 420px\)/);
  assert.match(css, /body\[data-lib="none"\] #lib, body\[data-right="none"\] #right \{ display: none; \}/);
  assert.ok(!/data-controls="column"/.test(css), 'không xếp nút phát thành cột dọc');
  // luật ⤢ đứng sau luật cột để thắng khi cùng độ ưu tiên (Cơ bản + ⤢)
  assert.ok(css.indexOf('body[data-focus] main') > css.indexOf('body[data-lib="flyout"] main'));
});

test('78_cols.js: dùng lõi, không chèn nút vào #top, phím bỏ qua ô nhập; bảng phím tắt có [ / ]', () => {
  const js = read('studio/features/78_cols.js');
  for (const k of ['LC.foldKey', 'LC.toggleFold', 'LC.flyoutClick', "S.layout.set(key", 'isContentEditable', 'dragend']) assert.ok(js.includes(k), k);
  assert.ok(!/addTopButton|#top'\)\.append|#top"\)\.append/.test(js));
  const K = createRequire(import.meta.url)(path.join(ROOT, 'studio/features/67_keys.core.js'));
  assert.ok(K.KEYMAP.flatMap(([, r]) => r.map(x => x[0])).includes('[ / ]'));
  assert.ok(read('studio/features/76_layout.js').includes("'col.lib'"));
});
