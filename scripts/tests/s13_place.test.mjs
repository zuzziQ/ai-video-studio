// S13 M103–M104: vùng mặt cho AI dựng giúp (faceZone), chặn số liệu không có trong lời thoại (inventedNumbers),
// bộ giải đặt chỗ của QC né mặt + phụ đề và đưa chữ vào vùng an toàn (applyDeterministic). Không render, không gọi Claude.
// run: node --test scripts/tests/s13_place.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faceZone } from '../face_track_project.mjs';
import { saidNumbers, inventedNumbers } from '../ai_edit.mjs';
import { applyDeterministic, safeOf } from '../ai_qc.mjs';

const caps = [{ t0: 0, t1: 4, words: [{ w: 'Loại', s: 0, e: .4 }, { w: 'này', s: .4, e: .8 }, { w: 'có', s: .8, e: 1.2 }, { w: '84.000', s: 1.2, e: 2 }, { w: 'collagen', s: 2, e: 2.6 }, { w: '15ml', s: 2.6, e: 3.2 }, { w: 'tuổi', s: 3.2, e: 3.6 }, { w: '25', s: 3.6, e: 4 }] }];

test('inventedNumbers: số / % không có trong lời thoại bị bắt; số đã nói, số nhỏ, màu, id, thời gian thì không', () => {
  const said = saidNumbers(caps);
  assert.deepEqual(inventedNumbers({ type: 'rv_callout', text: '13% bổ sung collagen', sub: 'tuổi 25' }, said), ['13%']);
  assert.deepEqual(inventedNumbers({ text: '25%' }, said), ['25%']); // "tuổi 25" không phải 25%
  assert.deepEqual(inventedNumbers({ text: 'Giảm 30%' }, saidNumbers([{ words: [{ w: 'giảm' }, { w: '30' }, { w: 'phần' }, { w: 'trăm' }] }])), []);
  assert.deepEqual(inventedNumbers({ title: '84000 mg collagen', lines: [{ text: 'Uống 15ml mỗi ngày' }] }, said), []);
  assert.deepEqual(inventedNumbers({ text: '3 lý do nên dùng', score: 9, color: '#123456', bg: '#998877', broll: { id: 'cong-nghe--neural--ember' }, t0: 12.5, kf: [{ t: 33 }] }, said), []);
  assert.deepEqual(inventedNumbers({ pros: ['Sạc nhanh 45W'], cons: ['Giá 12.490.000'] }, said), ['45', '12.490.000']);
  // trường số hiển thị con số (thẻ thống kê, điểm, giá): kiểm như chữ; toạ độ, cỡ chữ, thời gian thì không
  assert.deepEqual(inventedNumbers({ value: 73, percent: 13, score: 87, price: 84000, x: 360, y: 470, size: 100, t1: 20.75 }, said), ['73', '13%', '87']);
  assert.deepEqual(inventedNumbers({ percent: 25 }, said), ['25%']);
  // số thập phân không trùng số nguyên: "2,5" không phải "25"
  assert.deepEqual(inventedNumbers({ text: 'Chỉ 2,5 giây' }, said), ['2,5']);
});

test('faceZone: theo face_track trong đoạn, cả video, điểm mặt cố định; không có mặt → null', () => {
  const keys = [{ t: 0, ox: 50, oy: 38, fs: 30 }, { t: 5, ox: 52, oy: 40, fs: 30 }, { t: 10, ox: 70, oy: 40, fs: 30 }];
  const tl = { width: 1080, height: 1920, face_track: { seq: 'f/%05d.jpg', keys } };
  const z = faceZone(tl, 0, 5);
  assert.ok(z.y0 >= 15 && z.y0 <= 20 && z.y1 >= 53 && z.y1 <= 56, JSON.stringify(z));
  assert.ok(z.x0 < 50 && z.x1 > 50 && z.x1 < 80, JSON.stringify(z));
  assert.ok(faceZone(tl).x1 > z.x1, 'cả video gồm cả lúc mặt dời sang phải');
  assert.deepEqual(faceZone(tl, 20, 30), faceZone(tl)); // ngoài mọi key: dùng cả track
  const f = faceZone({ width: 1080, height: 1920, face: { x: 360, y: 520 } });
  assert.ok(f.x0 < 50 && f.x1 > 50 && f.y0 < 40.6 && f.y1 > 40.6, JSON.stringify(f));
  assert.equal(faceZone({ width: 1080, height: 1920 }), null);
  // khung ngang: mặt cao 40% khung thì rộng ~0.85 × 40 × 9/16 ≈ 19% bề ngang
  const h = faceZone({ width: 1920, height: 1080, face_track: { keys: [{ t: 0, ox: 50, oy: 40, fs: 40 }] } });
  assert.ok(h.x1 - h.x0 >= 17 && h.x1 - h.x0 <= 21, JSON.stringify(h));
});

// một cảnh 300×150 trên khung 720×1280; mặt đang nói ở giữa trên; phụ đề ở dưới
const face = { x: 220, y: 280, w: 280, h: 320 }, cap = { x: 80, y: 820, w: 560, h: 120 };
const mk = (box, texts = []) => ({
  tl: { width: 1080, height: 1920, duration: 10, scenes: [{ type: 'rv_callout', t0: 1, t1: 3 }] },
  P: { DW: 720, DH: 1280, samples: [{ t: 2, face, m: { cap: { texts: [cap] }, scenes: { 0: { els: [box], texts } } } }] },
});
const moved = (s, box) => { const k = s.kf?.[0]; return k ? { x: box.x + k.x, y: box.y + k.y, w: box.w * k.scale, h: box.h * k.scale } : box; };
const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const hit = (a, b) => area(a, b) > b.w * b.h * .06; // bộ giải cho chạm mép tới 6% vùng cần tránh

test('applyDeterministic: graphic che mặt được dời khỏi mặt mà không rơi xuống phụ đề', () => {
  const box = { x: 210, y: 380, w: 300, h: 150 }, { tl, P } = mk(box);
  const fixed = applyDeterministic(tl, caps, [{ kind: 'face_cover', target: 's0', t: 2 }], P, new Set());
  assert.equal(fixed.size, 1);
  const r = moved(tl.scenes[0], box);
  assert.ok(!hit(r, face), 'không còn đè mặt: ' + JSON.stringify(r));
  assert.ok(!hit(r, cap), 'không đè phụ đề: ' + JSON.stringify(r));
});

test('applyDeterministic: chữ ngoài vùng an toàn được đưa vào vùng an toàn', () => {
  const box = { x: 200, y: 40, w: 320, h: 70 }, { tl, P } = mk(box, [{ x: 210, y: 50, w: 300, h: 50, s: 'GIẢM 15%' }]);
  const fixed = applyDeterministic(tl, caps, [{ kind: 'text_unsafe', target: 's0', t: 2 }], P, new Set());
  assert.equal(fixed.size, 1);
  const r = moved(tl.scenes[0], box), S = safeOf(tl);
  assert.ok(r.y >= S.y && r.y + r.h <= S.y + S.h && r.x >= S.x && r.x + r.w <= S.x + S.w, JSON.stringify(r));
  assert.ok(!hit(r, face), 'không đẩy vào mặt');
});
