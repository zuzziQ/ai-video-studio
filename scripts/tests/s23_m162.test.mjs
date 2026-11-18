// S23 M162: dải tua 40 px — lõi studio/features/77_scrub.core.js (ô ảnh nhỏ, vạch cắt / cảnh, tua, bắt dính) và chỗ nối
// ở 77_scrub.js / studio.css / 76_layout.js. Kế hoạch: docs/plans/S23-bo-cuc-theo-kho-video.md mục 2, 4.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const req = createRequire(import.meta.url);
const C = req('../../studio/features/77_scrub.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('bề rộng ô theo khổ', () => {
  assert.equal(C.tileW(9 / 16), 18);
  assert.equal(C.tileW(1), 32);
  assert.equal(C.tileW(16 / 9), 57);
  assert.equal(C.tileW(0), 18); // thiếu khổ: coi như dọc
});

test('ô ảnh nhỏ phủ kín bề rộng, thời điểm giữa ô tăng dần trong [0, dur]', () => {
  for (const [ratio, W] of [[9 / 16, 1000], [16 / 9, 1000], [1, 333]]) {
    const t = C.tiles(30, W, ratio);
    assert.ok(t.length > 0);
    assert.equal(t[0].x, 0);
    const last = t[t.length - 1];
    assert.ok(Math.abs(last.x + last.w - W) < 0.01, 'ô cuối chạm mép phải');
    for (let i = 1; i < t.length; i++) assert.ok(t[i].t > t[i - 1].t);
    assert.ok(t.every(x => x.t >= 0 && x.t <= 30 && x.w > 0));
  }
  assert.equal(C.tiles(30, 1000, 9 / 16).length, Math.ceil(1000 / 18));
  assert.equal(C.tiles(30, 1e5, 9 / 16).length, C.MAX_TILES, 'cửa sổ rất rộng: trần số ô');
  assert.deepEqual(C.tiles(0, 1000, 1), []);
  assert.deepEqual(C.tiles(30, 0, 1), []);
});

test('vạch cắt / cảnh: bỏ 0 và cuối, bỏ clip ẩn, cảnh ẩn, gộp vạch sát nhau (cắt thắng)', () => {
  const layout = [{ t0: 0, t1: 4 }, { t0: 4, t1: 4 }, { t0: 4, t1: 10 }, { t0: 10, t1: 12 }];
  const scenes = [{ t0: 0, type: 'title' }, { t0: 4.02, type: 'lower' }, { t0: 7, type: 'cta' }, { t0: 8, hidden: true }, { t0: 11.99 }];
  const m = C.marks(layout, scenes, 12);
  assert.deepEqual(m.map(x => [x.t, x.kind]), [[4, 'cut'], [7, 'scene'], [10, 'cut']]);
  assert.equal(m[0].i, 1); // clip thứ hai (đếm từ 0) bắt đầu ở vạch cắt đầu
  assert.equal(m[1].type, 'cta');
  assert.deepEqual(C.marks(null, null, 10), []);
  assert.deepEqual(C.marks([{ t0: 0, t1: 10 }], [], 10), [], 'một clip: không có vạch cắt');
});

test('thời điểm dưới con trỏ kẹp trong [0, dur]', () => {
  assert.equal(C.timeAt(150, 100, 200, 20), 5);
  assert.equal(C.timeAt(50, 100, 200, 20), 0);
  assert.equal(C.timeAt(900, 100, 200, 20), 20);
  assert.equal(C.timeAt(150, 100, 0, 20), 0);
});

test('bắt dính vạch trong 6 px', () => {
  const m = [{ t: 5, kind: 'cut' }, { t: 9, kind: 'scene' }];
  // dải 600 px, 30 s → 6 px = 0,3 s
  assert.deepEqual(C.snap(5.2, m, 600, 30), { t: 5, mark: m[0] });
  assert.equal(C.snap(5.4, m, 600, 30).mark, null);
  assert.equal(C.snap(5.4, m, 600, 30).t, 5.4);
  assert.equal(C.snap(8.8, m, 600, 30).mark.kind, 'scene');
  assert.equal(C.snap(3, [], 600, 30).t, 3);
});

test('chữ ký đổi khi clip / cảnh / bề rộng / khổ đổi', () => {
  const L = [{ t0: 0, t1: 4 }, { t0: 4, t1: 8 }], sc = [{ t0: 2 }];
  const a = C.sig(8, 800, 9 / 16, L, sc);
  assert.equal(a, C.sig(8, 800.4, 9 / 16, L, sc));
  assert.notEqual(a, C.sig(8, 900, 9 / 16, L, sc));
  assert.notEqual(a, C.sig(8, 800, 16 / 9, L, sc));
  assert.notEqual(a, C.sig(8, 800, 9 / 16, [{ t0: 0, t1: 5 }, { t0: 5, t1: 8 }], sc));
  assert.notEqual(a, C.sig(8, 800, 9 / 16, L, [{ t0: 3 }]));
});

test('chỗ nối: 77_scrub.js dùng Studio.layout, CSS khối riêng, 76_layout.js không còn dải tạm', () => {
  const js = read('studio/features/77_scrub.js'), css = read('studio/studio.css'), lay = read('studio/features/76_layout.js');
  assert.match(js, /S\.layout\.on\(/);
  assert.match(js, /S\.layout\.set\('tl', 'compact'\)/, 'bấm đúp mở mức gọn');
  assert.match(js, /ResizeObserver/, 'bề rộng theo container');
  assert.doesNotMatch(js, /innerWidth/, 'không đo theo cửa sổ');
  assert.doesNotMatch(js, /#top\b/, 'không chèn vào thanh trên');
  assert.match(css, /\/\* S23 M162:[\s\S]*body\[data-tl="strip"\] #tlstrip \{ display: block; \}/);
  assert.doesNotMatch(lay, /tls-head|paintStrip/);
});
