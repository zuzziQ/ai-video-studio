// S22 M156: gọn chỗ — một màn lần mở đầu (Kiểm tra máy và thiếu khung hình thành dải báo), cột phải không chọn gì thì về Dự án ở
// mọi bước và mọi chế độ, ô "Nhờ Claude xem khung hình" không vỡ hàng, chữ giải thích dài vào (i) (C26).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const req = createRequire(import.meta.url);
const R = req('../../studio/features/68_right.core.js');
const L = req('../../studio/features/01_level.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('cột phải: không chọn gì, không chi tiết thư viện → Claude ở mọi bước, mọi chế độ (S24 M174)', () => {
  for (const level of ['basic', 'pro']) {
    const keys = L.rightTabs(level);
    assert.equal(R.initialTab('props', false, keys), 'claude', `${level}: tab Thuộc tính đã lưu mà không chọn gì`);
    assert.equal(R.initialTab('props', true, keys), 'props');
    assert.equal(R.initialTab('props', false, keys, true), 'props', 'có chi tiết mục thư viện');
    // đổi bước = vẽ lại cột phải với had = has = false
    assert.equal(R.nextTab({ tab: 'props', had: false, has: false, keys }), 'claude', `${level}: đổi bước`);
    assert.equal(R.nextTab({ tab: 'props', had: false, has: false, detail: true, keys }), 'props');
    assert.equal(R.nextTab({ tab: 'claude', had: false, has: false, keys }), 'claude');
  }
  assert.equal(R.nextTab({ tab: 'layers', had: false, has: false, keys: L.rightTabs('pro') }), 'layers', 'Lớp không bị giành');
  assert.equal(R.nextTab({ tab: 'layers', had: false, has: false, keys: L.rightTabs('basic') }), 'claude', 'Cơ bản không có Lớp');
  assert.equal(R.propsUsable(false, false), false); assert.equal(R.propsUsable(true, false), true); assert.equal(R.propsUsable(false, true), true);
});

test('studio.js không còn ô "Chưa chọn element", tab Thuộc tính tắt khi không có gì để xem', () => {
  const s = read('studio/studio.js');
  assert.doesNotMatch(s, /<b>Chưa chọn element<\/b>/);
  assert.match(s, /C\.initialTab\(saved, has, keys, !!RT\.detail\)/);
  assert.match(s, /propsUsable\(!!sel, !!RT\.detail\)/);
});

test('lần mở đầu: Kiểm tra máy không tự mở hộp thoại, chỉ dải báo khi thiếu mục bắt buộc', () => {
  const s = read('studio/features/01_setup.js');
  const boot = s.slice(s.lastIndexOf('load(false).then'));
  assert.doesNotMatch(boot, /if \(auto\) open\(\)/);
  assert.match(boot, /gateDone\(\);/);
  assert.match(boot, /notice\('setup'/);
  assert.match(s, /Studio\.notice = notice/);
  assert.match(s, /#avs-notices \{[^}]*z-index: 45/, 'dải báo dưới #modal (50)');
  assert.doesNotMatch(s, /#top[^{]*#avs-notices|getElementById\('top'\)\.append/, 'không chèn vào #top (ai-video-studio-039)');
});

test('lần mở đầu: thiếu khung hình tự tạo lại kèm dải báo, không hộp thoại', () => {
  const s = read('studio/features/63_frames.js');
  assert.doesNotMatch(s, /S\.modal\(/);
  assert.match(s, /\/api\/frames\/rebuild/);
  assert.match(s, /S\.notice\('frames'/);
  assert.doesNotMatch(s, /S\.pollJob\(/, 'tự theo dõi /api/job, không giành bộ đếm dùng chung');
});

test('hướng dẫn đầu: không còn dòng giải thích dưới ô, lời giải thích vào (i)', () => {
  const s = read('studio/features/02_onboarding.js');
  assert.match(s, /const field = \(id, label, hint, input\) => `<div class="onb-f"><label for="\$\{id\}">\$\{label\}\$\{tip\(hint\)\}<\/label>\$\{input\}<\/div>`/);
  for (const t of ['Logo nền trong suốt', 'Đổi được cho từng video khi xuất', 'Chọn nhiều nơi được', 'Chỉ dùng nhạc bạn có quyền', 'Studio chỉ đọc và phân nhóm'])
    assert.doesNotMatch(s, new RegExp(`<p class="onb-hint">[^<]*${t}`), `còn dòng dưới ô: ${t}`);
  // placeholder vẫn giữ
  for (const ph of ['Ví dụ: Nhà Đẹp Sài Gòn', '0901 234 567', 'nhadep.vn', '@nhadep', '2,9 tỷ']) assert.ok(s.includes(ph), `mất placeholder ${ph}`);
});

test('bước Kiểm tra: ô "Nhờ Claude xem khung hình" sát chữ, chữ giải thích một dòng', () => {
  const s = read('studio/features/16_qc.js');
  assert.match(s, /\.ai-row\.qc-click > input\.qc-nf \{ flex: none; width: auto;/);
  assert.match(s, /<label class="ai-row qc-click"><input type="checkbox" id="qcclaude" class="qc-nf" checked><span>Nhờ Claude xem khung hình/);
  assert.doesNotMatch(s, /class="mini" data-qc="ads" class=/, 'trùng thuộc tính class');
  // C26: đoạn <p> của thẻ ≤ 1 dòng (≤ 60 ký tự chữ hiện, không tính tooltip)
  const ps = [...s.matchAll(/<p>([^<$]*)\$\{tip\(/g)].map(m => m[1]);
  assert.ok(ps.length >= 2);
  for (const p of ps) assert.ok(p.length <= 60, `đoạn dài: ${p}`);
});
