// S23 M168: Chuyên nghiệp, cửa sổ < 1280 px → thư viện tự gấp (như phím [, M165); mở tay nhớ ở avs.col.libNarrow, không tự gấp lại
// cho tới khi bề rộng qua ngưỡng 1280 px. Lõi thuần 76_layout.core.js (autoFoldLib, foldStore, compute narrowLib).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const req = createRequire(import.meta.url);
const L = req('../../studio/features/76_layout.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('autoFoldLib: chỉ Chuyên nghiệp và cửa sổ < 1280 px', () => {
  assert.equal(L.autoFoldLib('pro', 1024), true);
  assert.equal(L.autoFoldLib('pro', 1279), true);
  assert.equal(L.autoFoldLib('pro', 1280), false);
  assert.equal(L.autoFoldLib('pro', 1440), false);
  assert.equal(L.autoFoldLib('basic', 1024), false); // Cơ bản là ngăn trượt (flyout)
});

test('compute: cửa sổ hẹp gấp thư viện, mở tay giữ mở; cửa sổ rộng theo foldLib của M165', () => {
  const at = (width, o = {}) => L.compute({ mode: 'pro', ratio: 16 / 9, width, ...o });
  assert.equal(at(1024).lib, 'none'); assert.equal(at(1024).foldLib, true); assert.equal(at(1024).autoFold, true);
  assert.equal(at(1024, { narrowLib: 'open' }).lib, 'panel');
  // trạng thái gấp của cửa sổ rộng không ảnh hưởng khi hẹp, và ngược lại
  assert.equal(at(1024, { foldLib: true, narrowLib: 'open' }).lib, 'panel');
  assert.equal(at(1440).lib, 'panel'); assert.equal(at(1440, { narrowLib: 'open' }).lib, 'panel');
  assert.equal(at(1440, { foldLib: true }).lib, 'none');
  assert.equal(at(1280).lib, 'panel');
  // cột phải không tự gấp
  assert.equal(at(1024).right, 'panel');
  // Cơ bản không đổi
  assert.equal(L.compute({ mode: 'basic', ratio: 16 / 9, width: 1024 }).lib, 'flyout');
});

test('foldStore: hẹp ghi col.libNarrow, rộng ghi col.lib', () => {
  assert.deepEqual(L.foldStore(true, false), { key: 'col.libNarrow', val: 'open' });
  assert.deepEqual(L.foldStore(true, true), { key: 'col.libNarrow', val: null });
  assert.deepEqual(L.foldStore(false, true), { key: 'col.lib', val: 'off' });
  assert.deepEqual(L.foldStore(false, false), { key: 'col.lib', val: null });
});

test('phím [ ở cửa sổ hẹp: gấp → mở (nhớ) → gấp lại', () => {
  let narrowLib = null;
  const st = () => L.compute({ mode: 'pro', width: 1024, narrowLib });
  for (const want of [false, true, false]) {
    const nx = L.toggleFold(st(), 'lib');
    assert.equal(nx.foldLib, want);
    const f = L.foldStore(st().autoFold, nx.foldLib); assert.equal(f.key, 'col.libNarrow'); narrowLib = f.val;
    assert.equal(st().foldLib, want);
  }
});

test('76_layout.js / 78_cols.js / studio.js: nối lõi, xoá lần mở tay khi qua ngưỡng, mở lại panel lúc tải không tính là mở tay', () => {
  const s = read('studio/features/76_layout.js');
  assert.match(s, /narrowLib: store\.get\('col\.libNarrow', ''\) \|\| null/);
  assert.match(s, /LC\.foldStore\(LC\.autoFoldLib\(mode\(\), innerWidth\), !!v\)/);
  assert.match(s, /if \(!LC\.isNarrow\(innerWidth\)\) store\.set\('col\.libNarrow', null\)/);
  assert.match(read('studio/features/78_cols.js'), /if \(!b \|\| S\._restoring\) return;/);
  assert.match(read('studio/studio.js'), /Studio\._restoring = true; try \{/);
});
