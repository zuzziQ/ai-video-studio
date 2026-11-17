// S13 M105: QC nhanh sau AI dựng giúp — kiểm hình học (che mặt, đè phụ đề, ngoài vùng an toàn, khoảng trống) trên số đo giả
// của domPass, một vòng sửa bằng bộ giải QC, chọn 3 khung cho hộp "Đã dựng xong". Không render, không gọi Claude.
// run: node --test scripts/tests/s13_quick.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { quickIssues, quickFixRound, pickTimes, QUICK } from '../qc_quick.mjs';

const DIR = os.tmpdir();
const face = { x: 220, y: 280, w: 280, h: 320 }, cap = { x: 80, y: 820, w: 560, h: 120 };
const words = (t0, ws) => ws.map((w, k) => ({ w, s: t0 + k * .4, e: t0 + k * .4 + .35 }));
const caps = [
  { t0: 1, t1: 3, words: words(1, ['Da', 'mịn', 'hơn']) },
  { t0: 8, t1: 10, words: words(8, ['collagen', 'thuỷ', 'phân', 'đậm']) },
];
// khung 720×1280; cảnh 0 che mặt lúc 2 s, cảnh 1 có chữ sát mép trên (ngoài vùng an toàn); 4–20 s không có graphic
const mk = () => ({
  tl: { width: 1080, height: 1920, duration: 20, scenes: [{ type: 'rv_callout', t0: 1, t1: 3, text: 'ĐẸP DA', _ai: true }, { type: 'rv_badge', t0: 2.5, t1: 4, text: 'GIẢM 15%', _ai: true }] },
  P: { DW: 720, DH: 1280, samples: [
    { t: 2, face, m: { cap: { texts: [cap] }, scenes: { 0: { els: [{ x: 210, y: 380, w: 300, h: 150 }], texts: [] } } } },
    { t: 3.25, m: { cap: null, scenes: { 1: { els: [{ x: 200, y: 40, w: 320, h: 70 }], texts: [{ x: 210, y: 50, w: 300, h: 50, s: 'GIẢM 15%' }] } } } },
  ] },
});

test('quickIssues: chỉ các lỗi hình học + khoảng trống, có key, sắp theo thời gian; không có hook_missing', () => {
  const { tl, P } = mk(), is = quickIssues(tl, caps, P, DIR), kinds = is.map(i => i.kind);
  assert.ok(kinds.includes('face_cover'), kinds.join());
  assert.ok(kinds.includes('text_unsafe'), kinds.join());
  assert.ok(kinds.includes('empty'), kinds.join());
  assert.ok(is.every(i => QUICK.has(i.kind) && i.src === 'auto'));
  assert.deepEqual(is.map(i => i.t), [...is.map(i => i.t)].sort((a, b) => a - b));
  assert.equal(is.find(i => i.kind === 'face_cover').target, 's0');
});

test('quickFixRound: dời graphic khỏi mặt, đưa chữ vào vùng an toàn, lấp khoảng trống bằng chữ nhấn', () => {
  const { tl, P } = mk(), c = JSON.parse(JSON.stringify(caps)), n0 = tl.scenes.length;
  const n = quickFixRound(tl, c, quickIssues(tl, c, P, DIR), P);
  assert.ok(n >= 3, 'sửa ' + n);
  assert.ok(tl.scenes[0].kf?.length && tl.scenes[0]._qc, 'cảnh che mặt có keyframe dời');
  assert.ok(tl.scenes[1].kf?.length, 'chữ ngoài vùng an toàn được dời');
  const add = tl.scenes.slice(n0);
  assert.ok(add.some(s => s.type === 'text' && s.t0 > 4 && /collagen/i.test(JSON.stringify(s.lines))),JSON.stringify(add));
});

test('quickFixRound: cảnh người dùng đã chỉnh (_orig) không bị dời', () => {
  const { tl, P } = mk(); tl.scenes[0]._orig = { x: 1 };
  quickFixRound(tl, caps.map(x => ({ ...x })), quickIssues(tl, caps, P, DIR).filter(i => i.target === 's0'), P);
  assert.equal(tl.scenes[0].kf, undefined);
});

test('pickTimes: đầu / giữa / cuối graphic AI, lúc graphic đã hiện; ít graphic thì bù theo độ dài video', () => {
  const tl = { duration: 30, scenes: [
    { type: 'frame', t0: 0, t1: 30, _base: true },
    { type: 'rv_callout', t0: 2, t1: 4, _ai: true }, { type: 'rv_badge', t0: 10, t1: 10.6, _ai: true },
    { type: 'text', t0: 15, t1: 17 }, { type: 'rv_callout', t0: 20, t1: 23, _ai: true }, { type: 'rv_callout', t0: 25, t1: 27, _ai: true, hidden: true },
  ] };
  assert.deepEqual(pickTimes(tl), [3, 10.3, 21]);
  assert.deepEqual(pickTimes({ duration: 10, scenes: [{ type: 'text', t0: 4, t1: 5 }] }), [2, 4.5, 5]);
  assert.deepEqual(pickTimes({ duration: 0, scenes: [] }), []);
});
