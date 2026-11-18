// S19 M137: cột phải (chủ repo báo 2026-11-17). (1) Bấm thẻ điểm của bước thì thanh bước trên / panel trái phải nhảy theo
// (trước chỉ đổi phần xem của cột phải). (2) Nút "Sửa" của tên / logo / màu thương hiệu mở đúng biểu mẫu thương hiệu, không chỉ tô
// sáng (trước không thấy gì khi biểu mẫu chưa mở). (3) "Cài đặt dự án" không lặp lại thứ đã có nơi khác. Kiểm bằng mã nguồn
// (giao diện), như s17_new_project.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = f => fs.readFileSync(path.join(SKILL, f), 'utf8');
const NS = read('studio/features/03_nextstep.js'), JS = read('studio/studio.js'), BR = read('studio/features/51_brands.js');

test('thẻ điểm của bước gọi workflow.goStep (thanh bước trên + panel trái nhảy theo)', () => {
  assert.match(NS, /if \(b\.dataset\.nsStep\) \{ if \(S\.workflow\?\.goStep && S\.workflow\.step !== b\.dataset\.nsStep\) return S\.workflow\.goStep\(b\.dataset\.nsStep\);/);
});

test('nút Sửa của bước Chuẩn bị mở biểu mẫu thương hiệu; ô đích có thật trong panel Thương hiệu', () => {
  for (const k of ['name', 'logo', 'color']) assert.match(NS, new RegExp(`${k}: \\['brands', \\[\\], null, '${k}'\\]`));
  assert.match(NS, /const fix = t => \(t\.go\[3\] \? \(\) => editBrand\(t\.go\[3\]\)/);
  assert.match(NS, /root\.querySelector\('\.bk-card\.cur \[data-bke\]'\) \|\| \(!root\.querySelector\('\.bk-card'\) && root\.querySelector\('#bk-new2'\)\)/);
  // các selector editBrand dựa vào phải còn trong 51_brands.js (đổi tên ở đó thì test này đỏ)
  for (const s of ['data-bke=', 'id="bk-new2"', 'id="bk-logo"', "inp('name'", "col('primary'"]) assert.ok(BR.includes(s), s);
  assert.match(NS, /S\.nextStep = \{[^}]*editBrand \}/);
});

test('Cài đặt dự án: không tab, không lặp kiểu phụ đề / SFX / ô thương hiệu ngoài mục thu gọn; đường tắt sang nơi sửa', () => {
  const pp = JS.slice(JS.indexOf('function projectPanel()'), JS.indexOf('function applyRecipe'));
  assert.ok(!pp.includes('data-itab'), 'không còn tab Dự án / Thương hiệu');
  assert.ok(!pp.includes('data-pf="caption_style"'), 'kiểu phụ đề chỉ đổi ở panel Chữ');
  assert.ok(!pp.includes('data-pact="autosfx"'), 'SFX tự động ở panel Âm thanh');
  assert.match(pp, /<details class="pp-more"><summary>[^<]*<i class="ti ti-adjustments"><\/i>Chỉnh riêng cho video này<\/summary>[\s\S]*\$\{bf\('primary'[\s\S]*\$\{bf\('logo'[^`]*<\/details>/, 'ô thương hiệu riêng nằm trong mục thu gọn');
  assert.match(pp, /data-pact="brandkit"/); assert.match(pp, /data-pact="open-text"/); assert.match(pp, /data-pact="open-audio"/);
  assert.match(pp, /<div class="ihead" data-proj>/);
  for (const a of ['brandkit', 'open-text', 'open-audio']) assert.match(JS, new RegExp(`if \\(pa === '${a}'\\) return `));
  assert.match(NS, /insp\.querySelector\(':scope > \.ihead\[data-proj\]'\)/, '03_nextstep nhận ra panel dự án mới');
  // S21 M145: Cài đặt dự án nằm ở tab Dự án của cột phải (không còn là "không chọn gì")
  assert.match(NS, /if \(S\.TL && \(S\.right\?\.tab \? S\.right\.tab === 'project' : !S\.sel\) && S\.renderInspector\) S\.renderInspector\(\)/, 'đổi bước vẽ lại cả Cài đặt dự án khi tab Dự án đang mở, chỉ khi đã có dự án');
});
