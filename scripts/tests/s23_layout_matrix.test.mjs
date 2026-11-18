// S23 M166: nghiệm thu bố cục — ma trận cửa sổ 1024 / 1440 / 1920 × khổ 9:16 / 1:1 / 16:9 (+ 4:5 ở ngưỡng) × Cơ bản / Chuyên nghiệp
// × 3 mức timeline, chạy trên lõi thuần studio/features/76_layout.core.js. Số đo Studio thật (khung, nút phát, tràn ngang, cuộn kép)
// ở docs/plans/S23-bo-cuc-theo-kho-video.md mục 8; test này giữ các bất biến mà lần đo đó dựa vào.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const req = createRequire(import.meta.url);
const L = req('../../studio/features/76_layout.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

const VPS = [[1024, 768], [1440, 900], [1920, 1080]];
const RATIO = { '9:16': 9 / 16, '4:5': 0.8, '1:1': 1, '16:9': 16 / 9 };
const MODES = ['basic', 'pro'];

function* cells() {
  for (const [w, h] of VPS) for (const [asp, ratio] of Object.entries(RATIO)) for (const mode of MODES)
    for (const tl of [null, ...L.TLS]) yield { w, h, asp, ratio, mode, tl };
}

test('mọi ô: nút phát một dòng dưới khung, giá trị vùng hợp lệ', () => {
  let n = 0;
  for (const c of cells()) {
    const r = L.compute({ ratio: c.ratio, mode: c.mode, width: c.w, tl: c.tl });
    const at = `${c.asp} ${c.w} ${c.mode} ${c.tl}`;
    assert.equal(r.controls, 'row', at); // ai-video-studio-058: thanh nút phát không xếp dọc
    assert.ok(['side', 'bottom'].includes(r.askPos), at);
    assert.ok(L.TLS.includes(r.tl), at);
    assert.ok(['panel', 'flyout', 'none'].includes(r.lib), at);
    assert.ok(['panel', 'claude', 'none'].includes(r.right), at);
    n++;
  }
  assert.equal(n, VPS.length * 4 * 2 * 4);
});

test('Hỏi Claude cạnh khung chỉ khi video dọc (< 0,8) và cửa sổ ≥ 1280 px (C30, C31)', () => {
  for (const c of cells()) {
    const r = L.compute({ ratio: c.ratio, mode: c.mode, width: c.w, tl: c.tl });
    const side = c.ratio < 0.8 && c.w >= 1280;
    assert.equal(r.askPos, side ? 'side' : 'bottom', `${c.asp} ${c.w}`);
    // Cơ bản: cột Claude thay cột phải khi cạnh khung, không cột phải khi dưới khung; Chuyên nghiệp luôn Thuộc tính
    assert.equal(r.right, c.mode === 'pro' ? 'panel' : side ? 'claude' : 'none', `${c.asp} ${c.w} ${c.mode}`);
    assert.equal(r.lib, c.mode === 'pro' ? (c.w < 1280 ? 'none' : 'panel') : 'flyout'); // M168: Chuyên nghiệp hẹp tự gấp thư viện
  }
});

test('mức timeline mặc định theo chế độ, cửa sổ hẹp mặc định gọn (C29, C31)', () => {
  for (const [w] of VPS) for (const mode of MODES) {
    const r = L.compute({ ratio: 9 / 16, mode, width: w });
    assert.equal(r.tl, w < 1280 ? 'compact' : mode === 'basic' ? 'strip' : 'full', `${w} ${mode}`);
  }
});

test('timeline mọi mức chừa đủ chỗ cho thanh trên + khung + nút phát (không đè khung)', () => {
  for (const [, h] of VPS) for (const tl of L.TLS) for (const fullH of [L.FULL.min, L.FULL.def, 2000]) {
    const px = L.tlHeight(tl, fullH, h);
    assert.ok(px >= L.TL_H.strip, `${tl} ${h}`);
    assert.ok(h - px >= L.FULL.keep, `${tl} ${h}: còn ${h - px} px`); // 768 px cao: đầy đủ tối đa 448 px, còn 320 px
  }
  assert.equal(L.tlHeight('strip', 999, 768), 40);
  assert.equal(L.tlHeight('compact', 999, 768), 120);
});

test('gấp cột (M165) và ⤢ chỉ bớt cột, không đổi vị trí Hỏi Claude hay nút phát', () => {
  for (const c of cells()) {
    const base = L.compute({ ratio: c.ratio, mode: c.mode, width: c.w, tl: c.tl });
    for (const o of [{ foldLib: true }, { foldRight: true }, { focus: true }]) {
      const r = L.compute({ ratio: c.ratio, mode: c.mode, width: c.w, tl: c.tl, ...o });
      assert.equal(r.askPos, base.askPos); assert.equal(r.controls, 'row'); assert.equal(r.tl, base.tl);
      if (c.mode === 'basic' && !o.focus) assert.deepEqual([r.lib, r.right], [base.lib, base.right]); // Cơ bản bỏ qua [ / ]
      if (o.focus) { assert.equal(r.lib, 'none'); assert.notEqual(r.right, 'panel'); }
    }
  }
});

test('bấm chỗ nối chuyển cảnh mở tab Thuộc tính khi cột phải đang ở Lớp / Dự án (M166)', () => {
  const src = read('studio/studio.js');
  const fn = src.match(/function openSect\(key\) \{[^\n]*\}/)?.[0] || '';
  assert.match(fn, /RT\.tab !== 'props' && sel\) showRightTab\('props'\)/);
  assert.match(src, /select\(compOf\(TL\.clips\[i\]\)\); openSect\('trans'\)/);
});
