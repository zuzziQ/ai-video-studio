// S26 M187 — khay việc thành nút chuông trên thanh đầu (không còn khay nổi che timeline / cột phải); nút kết quả "Xem …" mở đúng
// chỗ nhìn thấy được (qua Studio.workflow.focus: đổi bước, mở ngăn thư viện ở Cơ bản, mở lại thư viện đang gấp ở Chuyên nghiệp).
// run: node --test scripts/tests/s26_m187.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const J = createRequire(import.meta.url)(path.join(ROOT, 'studio/features/05_jobs.core.js'));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const card = (title, state, progress = 0, o = {}) => ({ title, job: { state, progress, step: '' }, ...o });

test('bell: số việc, tone, % của việc đang chạy', () => {
  assert.deepEqual(J.bell([], ''), { n: 0, tone: '', pct: 0, label: 'Việc nền' });
  const run = J.bell([card('Xuất video', 'running', .42)], '');
  assert.equal(run.n, 1); assert.equal(run.tone, 'run'); assert.equal(run.pct, 42);
  assert.match(run.label, /^Việc nền \(1\) · Xuất video 42%$/);
  // đang chạy thắng lỗi; lỗi thắng xong
  assert.equal(J.bell([card('A', 'error'), card('B', 'running', .1)], '').tone, 'run');
  assert.equal(J.bell([card('A', 'error'), card('B', 'done')], '').tone, 'err');
  assert.match(J.bell([card('A', 'error'), card('B', 'done')], '').label, /A: lỗi/);
  assert.equal(J.bell([card('B', 'done')], '').tone, 'ok');
  assert.equal(J.bell([card('B', 'cancelled')], '').tone, '');
  // dòng Tự lái tính là một việc
  const ap = J.bell([], 'Tự lái: 2 việc đang chờ');
  assert.equal(ap.n, 1); assert.match(ap.label, /Tự lái: 2 việc đang chờ/);
  // phase của thẻ thắng job.state (thẻ đã xong nhưng onDone báo lỗi)
  assert.equal(J.bell([card('C', 'done', 1, { phase: 'err' })], '').tone, 'err');
});

test('05_jobs.js: nút chuông trên #top, danh sách xổ, không còn khay nổi / chip / hẹn giờ thu khay', () => {
  const s = read('studio/features/05_jobs.js');
  assert.doesNotMatch(s, /#avs-jobs \{ position: fixed; right/, 'không còn khay nổi góc dưới phải');
  assert.doesNotMatch(s, /jt-chip|data-a="min"|data-a="max"|\bmini\b/, 'bỏ chip thu gọn');
  assert.doesNotMatch(s, /8000\)/, 'bỏ hẹn giờ 8 s thu khay');
  assert.match(s, /class="ghost jt-bell"/);
  assert.match(s, /aria-expanded/);
  assert.match(s, /cl\('save'\), cl\('export'\)/, 'nút nằm trên thanh đầu, trước Lưu / Xuất');
  assert.match(s, /cl\('onb-home'\)/, 'trang chủ che thanh đầu: nút nổi (jt-float)');
  assert.match(s, /#avs-jobs\.jt-float \{ position: fixed; top:/);
  assert.match(s, /new MutationObserver\(place\)\.observe\(document\.body, \{ childList: true \}\)/);
  assert.match(s, /e\.key === 'Escape'/, 'Esc đóng danh sách');
  assert.match(s, /pointerdown', e => \{ if \(isOpen && !host\.contains\(e\.target\)\) setOpen\(false\)/, 'bấm ra ngoài đóng danh sách');
  assert.match(s, /if \(c\.phase === 'err'\) setOpen\(true\)/, 'việc lỗi tự xổ danh sách');
  assert.match(s, /cards\.push\(c\); syncLock\(\); render\(\); ping\(\);/, 'bắt đầu việc không tự xổ');
  assert.match(s, /data-a="ap"/, 'dòng Tự lái trong danh sách xổ');
  assert.match(s, /\.jt-lock \{/, 'dải báo khoá giữ nguyên');
  assert.match(s, /J\.bell\(cards, ap\.line\)/);
});

test('nút kết quả mở đúng chỗ: jobs.open qua workflow.focus; không còn openPanel trần trên thẻ', () => {
  const s = read('studio/features/05_jobs.js');
  assert.match(s, /if \(wf\?\.focus && !wf\.hidden\?\.\(id\)\) return wf\.focus\(id\);/, 'qua focus; panel ẩn ở Cơ bản thì mở thẳng, không đổi mức');
  assert.match(s, /S\.layout\.set\('foldLib', false\)/, 'Chuyên nghiệp đang gấp thư viện: mở lại');
  assert.match(s, /S\.cols\?\.open\(\)/, 'không có workflow: vẫn mở ngăn thư viện');
  assert.match(read('studio/features/78_cols.js'), /S\.workflow\.focus = \(\.\.\.a\) => \{ unfoldLib\(\); return f\(\.\.\.a\); \}/, 'focus mở ngăn / bỏ gấp thư viện');
  assert.match(read('studio/features/20_ai.js'), /label: 'Xem chỗ cắt', icon: 'ti-scissors', primary: true, on: \(\) => S\.jobs\.open\('ai'\)/);
  assert.match(read('studio/features/17_longform.js'), /const view = \(\) => Studio\.jobs\.open\('longform'\)/);
  for (const [f, id] of [['25_transcribe', 'words'], ['12_workspace', 'kho'], ['30_audio', 'audioplus'], ['62_broll', 'aibroll'], ['80_autofill', 'autofill']])
    assert.match(read(`studio/features/${f}.js`), new RegExp(`S(tudio)?\\.jobs\\.open\\('${id}'\\)`), `${f} mở ${id}`);
  // mọi panel đích có trong bảng bước của quy trình (focus tra được bước)
  const wf = read('studio/features/01_workflow.js');
  for (const id of ['words', 'ai', 'longform', 'audioplus', 'aibroll', 'autofill']) assert.match(wf, new RegExp(`\\b${id}: \\['`), id);
  assert.match(read('studio/features/12_workspace.js'), /S\.addPanel\('kho'[^\n]*step: 'prep'/);
});

test('thanh đầu không tràn khi chuông hiện: công tắc mức chỉ còn biểu tượng ở ≤ 1400 px', () => {
  assert.match(read('studio/features/05_jobs.js'), /@media \(max-width: 1400px\) \{ #top:has\(> #avs-jobs:not\(\[hidden\]\)\) #wf-lvbar button span \{ display: none; \} \}/);
});
