// S13 M106: QC tự sửa mạnh hơn — dời cả cảnh có keyframe (cả đường đi), thẻ trống, số không có trong lời thoại, lấp khoảng
// trống dài bằng nhiều chữ nhấn, sửa chính tả phụ đề theo cách của AI soát lời thoại (M90). Số đo giả của domPass, không render.
// run: node --test scripts/tests/s13_fix.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { staticIssues, applyDeterministic, emptyCard, captionEdit, validatePatch, applyClaude, spellFromTranscript } from '../ai_qc.mjs';
import { quickIssues, quickFixRound, QUICK } from '../qc_quick.mjs';

const DIR = os.tmpdir();
const deep = o => JSON.parse(JSON.stringify(o));
const words = (t0, ws, step = .4) => ws.map((w, k) => ({ w, s: +(t0 + k * step).toFixed(2), e: +(t0 + k * step + step - .05).toFixed(2) }));
const cap = (t0, ws, step = .4) => ({ t0, t1: +(t0 + ws.length * step).toFixed(2), words: words(t0, ws, step) });
const noP = { DW: 720, DH: 1280, samples: [] };
const kinds = l => l.map(i => i.kind);

test('dời được cảnh có keyframe: cả đường đi dời cùng một khoảng, hình dạng đường giữ nguyên', () => {
  const face = { x: 220, y: 280, w: 280, h: 320 };
  const tl = { width: 1080, height: 1920, duration: 10, scenes: [{ type: 'rv_callout', t0: 1, t1: 4, text: 'ĐẸP DA', _ai: true,
    kf: [{ t: 1, x: 0, y: 0 }, { t: 3, x: 40, y: 20, ease: 'out' }] }] };
  const caps = [cap(1, ['da', 'mịn', 'hơn', 'rõ', 'rệt', 'luôn'])];
  const P = { DW: 720, DH: 1280, samples: [
    { t: 1.5, face, m: { cap: null, scenes: { 0: { els: [{ x: 230, y: 380, w: 260, h: 120 }], texts: [] } } } },
    { t: 3, face, m: { cap: null, scenes: { 0: { els: [{ x: 270, y: 400, w: 260, h: 120 }], texts: [] } } } },
  ] };
  const is = [{ t: 1.5, kind: 'face_cover', severity: 'high', target: 's0' }];
  const before = deep(tl.scenes[0].kf);
  const fixed = applyDeterministic(tl, caps, is, P, new Set());
  assert.equal(fixed.size, 1, 'cảnh có keyframe được sửa');
  const kf = tl.scenes[0].kf, dx = kf[0].x - before[0].x, dy = kf[0].y - before[0].y;
  assert.ok(dx || dy, 'có dời');
  assert.equal(kf.length, 2);
  assert.equal(kf[1].x - kf[0].x, 40); assert.equal(kf[1].y - kf[0].y, 20); // đường đi giữ nguyên
  assert.equal(kf[1].ease, 'out');
  assert.ok(tl.scenes[0]._qc);
});

test('emptyCard: thẻ không có chữ, không có ảnh/b-roll là thẻ trống; có nội dung thì không', () => {
  assert.equal(emptyCard({ type: 'media_card', t0: 1, t1: 3 }), true);
  assert.equal(emptyCard({ type: 'media_card', t0: 1, t1: 3, screen: {}, lines: [{ text: '', style: 'clean', font: 'var(--sans)' }] }), true);
  assert.equal(emptyCard({ type: 'rv_callout', t0: 1, t1: 3, text: '  ', color: '#fff' }), true);
  assert.equal(emptyCard({ type: 'media_card', t0: 1, t1: 3, screen: { broll: { id: 'cong-nghe-moi--neural--ember' } } }), false);
  assert.equal(emptyCard({ type: 'media_card', t0: 1, t1: 3, media: 'work/a.png' }), false);
  assert.equal(emptyCard({ type: 'rv_callout', t0: 1, t1: 3, text: 'Collagen' }), false);
  assert.equal(emptyCard({ type: 'light_leak', t0: 1, t1: 3 }), false, 'hiệu ứng trang trí không phải thẻ');
});

test('staticIssues: báo thẻ trống và số không có trong lời thoại; tự sửa ẩn thẻ trống + graphic AI có số bịa, cảnh người dùng chỉ đánh dấu', () => {
  const caps = [cap(1, ['tuổi', '25', 'da', 'bắt', 'đầu', 'lão', 'hoá']), cap(4, ['giảm', '30', 'phần', 'trăm', 'nếp', 'nhăn'])];
  const tl = { width: 1080, height: 1920, duration: 8, scenes: [
    { type: 'media_card', t0: 1, t1: 3, _ai: true },
    { type: 'rv_callout', t0: 2, t1: 4, text: '13% bổ sung collagen', _ai: true },
    { type: 'rv_badge', t0: 4, t1: 5.5, text: 'Giảm 30%', _ai: true },
    { type: 'text', t0: 5.5, t1: 7, lines: [{ text: '99% hài lòng' }] },
  ] };
  const is = staticIssues(tl, caps, DIR);
  assert.deepEqual(is.filter(i => i.kind === 'empty_card').map(i => i.target), ['s0']);
  assert.deepEqual(is.filter(i => i.kind === 'invented_number').map(i => i.target), ['s1', 's3']);
  assert.match(is.find(i => i.target === 's1' && i.kind === 'invented_number').msg, /13%/);
  const fixed = applyDeterministic(tl, caps, is, noP, new Set());
  assert.equal(tl.scenes[0].hidden, true);
  assert.equal(tl.scenes[1].hidden, true);
  assert.notEqual(tl.scenes[2].hidden, true, 'số đã nói thì giữ');
  assert.notEqual(tl.scenes[3].hidden, true, 'cảnh người dùng đặt chỉ đánh dấu');
  const user = is.find(i => i.target === 's3');
  assert.ok(!fixed.has(user) && /lời thoại/.test(user.note || ''), JSON.stringify(user));
});

test('lấp khoảng trống dài: chèn nhiều chữ nhấn từ khoá cho tới khi không còn đoạn > 6 s', () => {
  const caps = [];
  const W = ['collagen', 'thuỷ', 'phân', 'giúp', 'làn', 'da', 'căng', 'mịn', 'vóc', 'dáng', 'thon', 'gọn', 'uống', 'mỗi', 'sáng'];
  for (let t = 1, k = 0; t < 19; t += 2, k += 2) caps.push(cap(t, [W[k % W.length], W[(k + 1) % W.length], 'là'], .5));
  const tl = { width: 1080, height: 1920, duration: 20, scenes: [] };
  const is = staticIssues(tl, caps, DIR).filter(i => i.kind === 'empty');
  assert.equal(is.length, 1);
  const fixed = applyDeterministic(tl, caps, is, noP, new Set());
  assert.ok(fixed.has(is[0]));
  assert.ok(tl.scenes.filter(s => s.type === 'text').length >= 2, 'nhiều hơn một chữ nhấn cho 20 s');
  assert.deepEqual(kinds(staticIssues(tl, caps, DIR)).filter(k => k === 'empty'), [], JSON.stringify(tl.scenes.map(s => [s.t0, s.t1])));
});

test('lấp khoảng trống: đoạn không có lời thì thêm nhịp zoom, vẫn hết khoảng trống', () => {
  const tl = { width: 1080, height: 1920, duration: 14, scenes: [] };
  const is = staticIssues(tl, [], DIR).filter(i => i.kind === 'empty');
  applyDeterministic(tl, [], is, noP, new Set());
  assert.deepEqual(kinds(staticIssues(tl, [], DIR)).filter(k => k === 'empty'), []);
});

test('ẩn thẻ trống làm hở khoảng trống mới: lấp luôn trong cùng lượt', () => {
  const caps = [];
  for (let t = 1; t < 15; t += 2) caps.push(cap(t, ['làn', 'da', 'căng', 'mịn'], .4));
  const tl = { width: 1080, height: 1920, duration: 16, scenes: [
    { type: 'rv_callout', t0: .2, t1: 1.5, text: 'MỞ ĐẦU', _ai: true }, { type: 'media_card', t0: 5, t1: 7, _ai: true }, { type: 'rv_callout', t0: 11, t1: 15.8, text: 'KẾT', _ai: true },
  ] };
  const is = staticIssues(tl, caps, DIR);
  assert.ok(!is.some(i => i.kind === 'empty'), 'trước khi ẩn: không có khoảng trống');
  applyDeterministic(tl, caps, is, noP, new Set());
  assert.equal(tl.scenes[1].hidden, true);
  assert.deepEqual(kinds(staticIssues(tl, caps, DIR)).filter(k => k === 'empty'), []);
});

test('captionEdit: sửa chính tả phụ đề như AI soát lời thoại (qua hai khối, đổi số từ, chặn viết lại)', () => {
  const caps = [cap(1, ['giữ', 'được', 'bốc']), cap(2.2, ['dáng', 'thon', 'gọn']), cap(5, ['sau', 'bên', 'trong', 'cơ', 'thể'])];
  assert.equal(captionEdit(caps, 'bốc dáng', 'vóc dáng'), 1);
  assert.equal(caps[0].words[2].w, 'vóc'); assert.equal(caps[1].words[0].w, 'dáng');
  assert.equal(caps[0].words[2].s, 1.8, 'cùng số từ: giữ thời gian');
  assert.equal(captionEdit(caps, 'sau bên trong', 'sâu bên trong'), 1);
  assert.equal(caps[2].words[0].w, 'sâu');
  assert.equal(captionEdit(caps, 'cơ thể', 'cơ thể ta'), 1, 'thêm từ: chia lại thời gian trong khối');
  assert.deepEqual(caps[2].words.map(w => w.w), ['sâu', 'bên', 'trong', 'cơ', 'thể', 'ta']);
  assert.ok(caps[2].words.at(-1).e <= 7.01);
  assert.equal(captionEdit(caps, 'thon gọn', 'rất đẹp và trẻ trung hơn hẳn'), 0, 'viết lại câu bị chặn');
  assert.equal(captionEdit(caps, 'không có', 'có'), 0);
  const n = [cap(12, ['15', 'đến', '3', 'phút'])];
  assert.equal(captionEdit(n, '15 đến 3', '1 đến 3'), 0, 'không đoán lại con số');
  assert.equal(n[0].words[0].w, '15');
});

test('thẻ lớn che mặt, không còn chỗ giữa mặt và phụ đề: thẻ ngắn được đặt lên phụ đề và ẩn phụ đề lúc hiện', () => {
  const face = { x: 160, y: 180, w: 400, h: 560 }, capR = { x: 80, y: 760, w: 560, h: 120 };
  const tl = { width: 1080, height: 1920, duration: 10, scenes: [{ type: 'u_card', t0: 2, t1: 4.4, title: 'Edit mất vài tiếng', _ai: true }] };
  const caps = [cap(2, ['trước', 'kia', 'edit', 'mất', 'vài', 'tiếng'])];
  const P = { DW: 720, DH: 1280, samples: [{ t: 3, face, m: { cap: { texts: [capR] }, scenes: { 0: { els: [{ x: 60, y: 250, w: 600, h: 700 }], texts: [] } } } }] };
  const is = [{ t: 3, kind: 'face_cover', severity: 'high', target: 's0' }];
  const fixed = applyDeterministic(tl, caps, is, P, new Set());
  assert.equal(fixed.size, 1);
  assert.equal(tl.scenes[0].hideCaptions, true);
  assert.ok(tl.scenes[0].kf?.[0].y > 0, JSON.stringify(tl.scenes[0].kf));
  const long = { width: 1080, height: 1920, duration: 10, scenes: [{ ...deep(tl.scenes[0]), kf: undefined, hideCaptions: undefined, t1: 8 }] };
  applyDeterministic(long, caps, deep(is), P, new Set());
  assert.ok(!long.scenes[0].hideCaptions, 'thẻ dài không được ẩn phụ đề');
});

test('validatePatch + applyClaude: sửa chính tả phụ đề nhận cả khi Claude ghi sai khối hay đổi số từ', () => {
  const caps = [cap(1, ['giữ', 'được']), cap(2, ['bốc', 'dáng', 'đẹp'])];
  const tl = { duration: 6, scenes: [] };
  const p = validatePatch({ op: 'text', target: 'c0', from: 'bốc dáng', to: 'vóc dáng' }, tl, caps, []);
  assert.ok(p, 'khối sai vẫn nhận (tìm trong mọi phụ đề)');
  assert.equal(applyClaude(tl, caps, [p], noP).length, 1);
  assert.equal(caps[1].words[0].w, 'vóc');
  assert.equal(validatePatch({ op: 'text', target: 'c1', from: 'không có', to: 'x' }, tl, caps, []), null);
});

test('spellFromTranscript: nhận đề xuất của AI soát lời thoại gần chỗ QC báo chính tả, bỏ dấu câu và chỗ xa', () => {
  const caps = [cap(1, ['giữ', 'được', 'bốc', 'dáng']), cap(8, ['tiền', 'hóa', 'nhanh']), cap(15, ['xin', 'chào', 'bạn'])];
  const W = caps.flatMap(c => c.words.map(w => ({ w: w.w, s: w.s, e: w.e })));
  const issues = [{ t: 1.5, kind: 'spelling', src: 'claude', msg: 'Phụ đề sai chính tả “bốc dáng”' }, { t: 8.2, kind: 'spelling', src: 'claude', msg: 'sai chính tả' }];
  const sugs = [
    { start: 2, end: 3, old: 'bốc dáng', new: 'vóc dáng', kind: 'nhận dạng' },
    { start: 4, end: 5, old: 'tiền hóa', new: 'tiến hoá', kind: 'chính tả' },
    { start: 8, end: 8, old: 'chào', new: 'chào,', kind: 'dấu câu' },
    { start: 9, end: 9, old: 'bạn', new: 'bạn bè', kind: 'chính tả' },
  ];
  const n = spellFromTranscript(caps, issues, sugs, W);
  assert.equal(n, 2);
  assert.equal(caps[0].words[2].w, 'vóc'); assert.equal(caps[1].words[0].w, 'tiến');
  assert.equal(caps[2].words[1].w, 'chào'); assert.equal(caps[2].words.length, 3, 'chỗ không bị QC báo thì không đụng');
  assert.ok(issues.every(i => i.fixed && i.fix?.op === 'text'));
});

test('QC nhanh: thẻ trống và số bịa nằm trong kiểm tra nhanh, "Sửa ngay" ẩn được', () => {
  assert.ok(QUICK.has('empty_card') && QUICK.has('invented_number'));
  const caps = [cap(1, ['da', 'mịn', 'hơn'])];
  const tl = { width: 1080, height: 1920, duration: 5, scenes: [{ type: 'media_card', t0: 1, t1: 3, _ai: true }, { type: 'rv_badge', t0: 3, t1: 4.5, text: '45% khách quay lại', _ai: true }] };
  const is = quickIssues(tl, caps, noP, DIR);
  assert.ok(kinds(is).includes('empty_card') && kinds(is).includes('invented_number'), kinds(is).join());
  assert.ok(quickFixRound(tl, caps, is, noP) >= 2);
  assert.ok(tl.scenes[0].hidden && tl.scenes[1].hidden);
});
