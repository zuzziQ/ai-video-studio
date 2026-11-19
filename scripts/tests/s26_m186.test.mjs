// S26 M186 — các việc nền còn lại (cắt lỗi nói, lời thoại, cắt clip, bám mẫu, trộn, bám mặt, tách nền, b-roll, Tự động, Kho…) chạy trong
// khay việc thay cho hộp chờ giữa màn hình; tải lại trang giữa chừng thì khay tự nhận lại việc đang chạy theo job.kind.
// run: node --test scripts/tests/s26_m186.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const J = createRequire(import.meta.url)(path.join(ROOT, 'studio/features/05_jobs.core.js'));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const MOVED = ['12_workspace', '17_longform', '25_transcribe', '27_tplfit', '30_audio', '40_reframe', '57_clipset', '61_mask', '62_broll', '80_autofill', '90_app'];
// loại việc có màn theo dõi riêng: khay không nhận lại
const OWN_UI = ['setup', 'perf-bench', 'batch', 'publish', 'frames', 'stylelab'];

test('kindInfo / resumeOf: tên + khoá theo loại việc; chỉ nhận lại việc đang chạy, bỏ loại có màn riêng', () => {
  assert.deepEqual(J.kindInfo('transcribe'), { kind: 'transcribe', title: 'Tạo lời thoại', lock: true });
  assert.equal(J.kindInfo('fillers').lock, false, 'dò lỗi nói chỉ đọc: không khoá');
  assert.equal(J.kindInfo('highlights').lock, false, 'cắt clip tạo dự án mới cạnh dự án đang mở');
  for (const k of ['ai', 'qc', 'qc_quick', 'tplfit', 'autofill', 'dub']) assert.equal(J.kindInfo(k).lock, true, k);
  assert.equal(J.kindInfo('toString'), null, 'không lấy thuộc tính kế thừa');
  assert.deepEqual(J.resumeOf({ kind: 'ai', state: 'running' }), { kind: 'ai', title: 'AI dựng giúp', lock: true });
  assert.equal(J.resumeOf({ kind: 'ai', state: 'done' }), null);
  for (const k of OWN_UI) assert.equal(J.resumeOf({ kind: k, state: 'running' }), null, k);
  assert.equal(J.resumeOf(null), null);
});

test('mọi loại việc server (ctx.startJob / startJob) có tên trong khay, trừ loại có màn riêng', () => {
  const src = [read('studio/server.mjs'), ...fs.readdirSync(path.join(ROOT, 'studio/routes')).filter(f => f.endsWith('.mjs')).map(f => read('studio/routes/' + f))].join('\n');
  const kinds = new Set([...src.matchAll(/startJob\('([\w-]+)'/g)].map(m => m[1]));
  for (const m of src.matchAll(/'\/api\/[\w/]+': \['([\w-]+)', \w+\]/g)) kinds.add(m[1]); // 60_media.mjs: { '/api/segment': ['segment', segment], … }
  assert.ok(kinds.size > 15);
  for (const k of kinds) assert.ok(OWN_UI.includes(k) || J.kindInfo(k), `thiếu loại việc "${k}" trong JobsCore.KINDS`);
});

test('các việc đã chuyển không còn hộp chờ #jobstep / Studio.pollJob', () => {
  for (const f of MOVED) {
    const s = read(`studio/features/${f}.js`);
    assert.doesNotMatch(s, /pollJob\(/, f);
    assert.doesNotMatch(s, /id="jobstep"|id="joblog"/, f);
  }
  // 20_ai.js: dò lỗi nói chạy trong khay; chỉ còn kiểm tra nhanh hiện tiến độ ngay trong hộp kết quả người dùng mở
  const ai = read('studio/features/20_ai.js');
  assert.doesNotMatch(ai, /Đang dò lỗi nói…/);
  assert.match(ai, /S\.jobs\.start\('\/api\/ai\/fillers'/);
  assert.equal((ai.match(/pollJob\(/g) || []).length, 1);
});

test('khoá timeline đúng việc ghi lại timeline / phụ đề; kết quả là nút trên thẻ', () => {
  const uses = { '25_transcribe': 'transcribe', '27_tplfit': 'tplfit', '80_autofill': 'autofill', '40_reframe': 'dub', '17_longform': 'highlights', '30_audio': 'mix', '61_mask': 'segment', '62_broll': 'broll_suggest', '12_workspace': 'kho-migrate' };
  for (const [f, kind] of Object.entries(uses)) assert.match(read(`studio/features/${f}.js`), new RegExp(`'${kind}'`), `${f} dùng kind ${kind}`);
  assert.match(read('studio/features/25_transcribe.js'), /label: 'Xem lời thoại'/);
  assert.match(read('studio/features/20_ai.js'), /label: 'Xem chỗ cắt'/);
  assert.match(read('studio/features/17_longform.js'), /label: 'Xem các clip'/);
  assert.match(read('studio/features/27_tplfit.js'), /label: 'Xem chi tiết'/, 'lưu ý sau khi bám mẫu: hộp chỉ mở khi bấm');
});

test('05_jobs.js: start() POST rồi refuse/track; tải lại trang thì nhận lại việc đang chạy, kể cả khi chưa mở dự án', () => {
  const s = read('studio/features/05_jobs.js');
  assert.match(s, /async function start\(path, body, o = \{\}\)/);
  assert.match(s, /refuse\(r\)/);
  assert.match(s, /J\.resumeOf\(j\)/);
  assert.match(s, /if \(!info \|\| running\(\)\) return;/, 'không nhận lại khi khay đã theo dõi việc đó');
  assert.match(s, /addEventListener\('load'/, 'không đợi onReady: boot không gọi onReady khi chưa mở dự án');
  assert.match(s, /S\.jobs = \{[^}]*\bstart\b[^}]*\bresumable\b/);
  for (const [f, k] of [['20_ai', 'ai'], ['20_ai', 'fillers'], ['25_transcribe', 'transcribe'], ['90_app', 'new'], ['17_longform', 'highlights']])
    assert.match(read(`studio/features/${f}.js`), new RegExp(`resumable\\('${k}'`), `${f} đăng ký nhận lại ${k}`);
  assert.doesNotMatch(read('studio/features/90_app.js'), /watchNew/);
});
