// S21 M146: Thuộc tính dạng mục xếp chồng (studio/features/68_sections.core.js) + chỗ nối trong studio.js / 01_workflow / 66_canvas_cmds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const C = createRequire(import.meta.url)('../../studio/features/68_sections.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('tab cũ [key, label, html] thành mục theo đúng thứ tự, bỏ phần tử hỏng, khoá trùng có hậu tố', () => {
  const s = C.normalize([['basic', 'Cơ bản', '<a>'], null, ['', 'x', ''], ['pos', 'Vị trí', '<b>'], ['kf', 'Keyframe', '<k>'], ['basic', 'Cơ bản', '<c>']]);
  assert.deepEqual(s.map(x => x.key), ['basic', 'pos', 'kf', 'basic-2']);
  assert.equal(s[0].html, '<a>'); assert.equal(s[3].html, '<c>');
  assert.equal(s[2].pro, true); assert.equal(s[0].pro, false);
  assert.equal(s[1].icon, 'ti-arrows-move'); assert.equal(s[3].icon, 'ti-forms'); // hậu tố giữ icon
  assert.equal(C.iconOf('la'), 'ti-point');
});

test('chế độ Cơ bản ẩn Keyframe / Mặt nạ / Nâng cao', () => {
  assert.deepEqual(C.PRO, ['kf', 'mask', 'json']);
  const s = C.normalize([['basic', 'B', ''], ['json', 'Nâng cao', ''], ['mask', 'Mặt nạ', ''], ['kf', 'K', ''], ['reframe', 'Bám mặt', '']]);
  assert.deepEqual(C.visible(s, true).map(x => x.key), ['basic', 'reframe']);
  assert.equal(C.visible(s, false).length, 5);
});

test('mở / đóng nhớ theo loại element; mặc định chỉ mục đầu mở', () => {
  let st = C.parse(null);
  assert.deepEqual(st, {});
  assert.equal(C.isOpen(st, 'line', 'basic', true), true);
  assert.equal(C.isOpen(st, 'line', 'pos', false), false);
  st = C.setOpen(st, 'line', 'basic', false);
  st = C.setOpen(st, 'line', 'pos', true);
  assert.equal(C.isOpen(st, 'line', 'basic', true), false);
  assert.equal(C.isOpen(st, 'line', 'pos', false), true);
  assert.equal(C.isOpen(st, 'cap', 'pos', false), false, 'loại khác không bị ảnh hưởng');
  assert.deepEqual(C.parse(JSON.stringify(st)), st);
  assert.deepEqual(C.parse('{hỏng'), {}); assert.deepEqual(C.parse('[1]'), {});
  const a = {}; C.setOpen(a, 'x', 'y', true); assert.deepEqual(a, {}, 'không sửa trạng thái cũ');
});

test('mục đang thấy theo vị trí cuộn', () => {
  const tops = [['basic', 100], ['pos', 400], ['kf', 900]];
  assert.equal(C.active(tops, 120), 'basic');
  assert.equal(C.active([['basic', 150], ['pos', 400]], 120), 'basic', 'chưa mục nào chạm đáy phần dính: mục đầu');
  assert.equal(C.active([['basic', -300], ['pos', 121], ['kf', 600]], 120), 'pos');
  assert.equal(C.active(tops, 120, true), 'kf', 'chạm đáy vùng cuộn: mục cuối');
  assert.equal(C.active([], 0), null);
});

test('studio.js vẽ mục xếp chồng, bỏ tab con; tính năng nối đúng', () => {
  const s = read('studio/studio.js');
  assert.doesNotMatch(s, /data-itab|class="itabs"|ITAB\[/);
  for (const x of ['window.SectCore', 'class="isecbar"', 'data-secgo=', 'data-sect=', 'class="isec-h"', "'avs.isec'", 'data-act="more"', "Studio.cmdMenu?.(", "if (a === 'lock') toggleLock();", "openSect('trans')", 'addInspectorTab(fn) { Studio._insp.push(fn); }'])
    assert.ok(s.includes(x), `studio.js thiếu ${x}`);
  // Ghi chú cho Claude + hàng Ẩn / Nhân bản / Xoá vẫn ở cuối thân
  // (S22 M151: nút "Thêm thuộc tính" của chế độ Cơ bản đứng ngay trước hàng này)
  assert.match(s, /\.join\(''\)\}\$\{moreBtn\}\$\{clip \? '' : actions\(c\) \+ noteBlock\(o\)\}<\/div>`;/);
  const wf = read('studio/features/01_workflow.js');
  // S22 M151: Cơ bản không ẩn hẳn Keyframe / Mặt nạ / Nâng cao bằng CSS nữa — chúng thu sau "Thêm thuộc tính" (s22_level.test.mjs)
  assert.doesNotMatch(wf, /PRO_TABS|body\.wf-basic #insp \.isec\[data-sec=/);
  assert.doesNotMatch(wf, /\.itabs/);
  const cm = read('studio/features/66_canvas_cmds.js');
  assert.match(cm, /S\.cmdMenu = openMenu;/);
  assert.doesNotMatch(cm, /data-itab/);
  assert.doesNotMatch(read('studio/studio.css'), /\.itabs/);
});
