// S23 M167 (C33): chặn tạo dự án 1:1 — Studio chỉ soạn 9:16 / 16:9, khổ vuông là bản xuất thêm. Dự án 1:1 cũ vẫn mở:
// khổ soạn 9:16 theo luật LayoutCore.frameOf (rộng > cao → 16:9, còn lại → 9:16) kèm dải báo trên khung (#lay-band).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const req = createRequire(import.meta.url);
const L = req('../../studio/features/76_layout.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('frameOf: hai khổ soạn, dự án khổ lạ đánh dấu legacy và có cỡ đổi', () => {
  assert.deepEqual(L.CREATE_ASPECTS, ['9:16', '16:9']);
  for (const [w, h, asp] of [[1080, 1920, '9:16'], [720, 1280, '9:16'], [1920, 1080, '16:9'], [1280, 720, '16:9'], [2160, 3840, '9:16']]) {
    const f = L.frameOf(w, h);
    assert.equal(f.aspect, asp, `${w}×${h}`); assert.equal(f.legacy, false); assert.equal(f.to, null); assert.equal(f.source, asp);
  }
  const sq = L.frameOf(1080, 1080);
  assert.equal(sq.aspect, '9:16'); assert.equal(sq.legacy, true); assert.equal(sq.source, '1:1');
  assert.deepEqual(sq.to, { width: 1080, height: 1920 });
  assert.equal(sq.ratio, 9 / 16);
  const p45 = L.frameOf(1080, 1350);
  assert.equal(p45.legacy, true); assert.equal(p45.aspect, '9:16'); assert.equal(p45.source, '1080×1350');
  const wide = L.frameOf(2560, 1080); // 21:9 → soạn 16:9, giữ chiều cao
  assert.equal(wide.aspect, '16:9'); assert.deepEqual(wide.to, { width: 1920, height: 1080 });
  assert.equal(L.frameOf().aspect, '9:16'); // thiếu cỡ → mặc định dọc như studio.js
});

test('createAspect: mọi khổ ngoài 16:9 → 9:16', () => {
  assert.equal(L.createAspect('16:9'), '16:9');
  for (const v of ['9:16', '1:1', '4:5', '', undefined, 'x']) assert.equal(L.createAspect(v), '9:16');
});

test('dự án 1:1 cũ xếp theo khổ soạn 9:16 (không theo tỉ lệ thật 1)', () => {
  const r = L.compute({ ratio: L.frameOf(1080, 1080).ratio, mode: 'basic', width: 1600 });
  assert.equal(r.askPos, 'side'); assert.equal(r.right, 'claude');
  // cùng ô với dự án 9:16 thật
  assert.deepEqual(r, L.compute({ ratio: L.frameOf(1080, 1920).ratio, mode: 'basic', width: 1600 }));
});

test('76_layout.js: tỉ lệ từ frameOf, dải báo #lay-band đầu #center, nút đổi khổ lưu rồi tải lại', () => {
  const s = read('studio/features/76_layout.js');
  assert.match(s, /LC\.frameOf\(S\.TL\.width, S\.TL\.height\)/);
  assert.doesNotMatch(s, /S\.DW \/ S\.DH/); // không đọc DW/DH (chỉ dọc / ngang) làm tỉ lệ
  assert.match(s, /band\.id = 'lay-band'/);
  assert.match(s, /c\.prepend\(band\)/); // vùng riêng trên khung, không chèn vào #top (ai-video-studio-039, 045)
  assert.match(s, /S\.saveNow\?\.\(\)\) \{ location\.reload\(\)/);
  assert.match(s, /Object\.assign\(S\.TL, was\)/); // lưu hỏng thì trả cỡ cũ
});

test('chỗ tạo dự án chỉ còn 9:16 / 16:9; xuất thêm khổ vẫn có 1:1', async () => {
  const onb = read('studio/features/02_onboarding.js');
  assert.doesNotMatch(onb, /\['1:1', 'Vuông 1:1'/);
  const { ASPECTS } = await import('../../studio/routes/02_onboarding.mjs');
  assert.deepEqual(ASPECTS, ['9:16', '16:9']);
  assert.match(read('studio/routes/02_onboarding.mjs'), /LEGACY_ASPECT = \{ '1:1': '9:16' \}/);
  assert.match(read('scripts/assist.mjs'), /const ASPECTS = \['9:16', '16:9'\]/);
  assert.match(read('scripts/build_templates.mjs'), /\['9:16', '16:9'\]\.includes\(tpl\.aspect\)/);
  const batch = read('scripts/batch.mjs');
  assert.match(batch, /const vertOf = t => !\(\(t\.width \|\| 1080\) > \(t\.height \|\| 1920\)\)/);
  assert.match(read('scripts/new_project.mjs'), /orient === 'horizontal' \? 1920 : 1080/);
  // xuất nhiều khổ giữ vuông
  assert.match(read('studio/studio.js'), /\['1:1', 'Vuông 1:1', 'cắt bám mặt'\]/);
  assert.match(read('scripts/export_multi.mjs'), /'9:16>1:1'/);
});
