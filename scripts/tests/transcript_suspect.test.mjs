// Test M96 "Soát kỹ" (soát lời thoại hai lớp): lõi thuần studio/features/21_transcript.core.js
//   lớp 1 suspectScores / suspectSpans (gom, nới, cắt, giới hạn), lớp 2 triage (so ba nguồn: gốc, AI chữ, nghe lại).
// Chạy: node --test scripts/tests/transcript_suspect.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../../studio/features/21_transcript.core.js');
const R = await import('../rehear.mjs');

// từ đều 0,3 s, bắt đầu ở t0; p mặc định 0,95 (chắc)
const mk = (text, t0 = 0, p = {}) => text.split(' ').map((w, i) => ({ w, s: +(t0 + i * 0.3).toFixed(3), e: +(t0 + i * 0.3 + 0.28).toFixed(3), p: p[i] ?? 0.95 }));

test('suspectScores: p thấp, con số và cụm số, từ lặp, độ dài lạ, AI nghi / AI sửa; từ đã sửa tay không nghi', () => {
  const W = mk('thời gian 15 đến 3 phút là là xong', 0, { 7: 0.2 });
  W.push({ w: 'aaaaaaaaaaaaaaa', s: 3, e: 3.2, p: 0.9 });
  const sc = C.suspectScores(W);
  assert.deepEqual(sc.map(x => x.score), [0, 0, 2, 2, 2, 0, 1, 4, 0, 1]);
  assert.ok(sc[7].why.includes('Whisper không chắc') && sc[7].why.includes('từ lặp'));
  assert.deepEqual(sc[9].why, ['độ dài lạ']);
  const ai = C.suspectScores(W, { uncertain: [{ start: 0, end: 1 }], aiEdits: [{ start: 8, end: 8 }] });
  assert.equal(ai[0].score, 3); assert.equal(ai[8].score, 4);
  W[3].ed = true;
  assert.equal(C.suspectScores(W)[3].score, 0, 'từ người dùng đã sửa: không nghi');
  // dữ liệu cũ không có p: chỉ còn tín hiệu khác
  assert.equal(C.suspectScores([{ w: 'chào', s: 0, e: .3 }])[0].score, 0);
});

test('suspectSpans: gom chỗ gần nhau, nới đủ MIN_WIN, kẹp ở đầu/cuối video', () => {
  const W = mk('một hai ba bốn năm sáu bảy tám chín mười', 0, { 1: 0.3, 3: 0.3 });
  const { spans, total, cut } = C.suspectSpans(W, { duration: 10 });
  assert.equal(total, 1); assert.equal(cut, 0);
  const [sp] = spans;
  assert.deepEqual([sp.a, sp.b], [1, 3], 'hai chỗ cách 0,32 s gom thành một đoạn');
  assert.ok(sp.to - sp.from >= C.SUSPECT.minWin - 1e-9, 'nới đủ minWin');
  assert.equal(sp.from, 0, 'chạm đầu video: dồn sang phải');
  // xa nhau hơn gap → hai đoạn
  const W2 = [...mk('a b', 0, { 0: 0.2 }), ...mk('c d', 10, { 1: 0.2 })];
  assert.equal(C.suspectSpans(W2).spans.length, 2);
  // cùng khoảng nghe với checkSpan của scripts/rehear.mjs
  for (const [s, e, D] of [[3, 3.3, 60], [0.2, 0.5, 60], [58, 59.5, 60], [10, 22, 60]]) {
    const a = C.hearWindow(s, e, D), b = R.checkSpan({ s, e }, D);
    assert.ok(Math.abs(a.from - b.from) < 1e-3 && Math.abs(a.to - b.to) < 1e-3, `${s}-${e}`);
  }
  assert.equal(C.SUSPECT.minWin, R.MIN_WIN); assert.equal(C.SUSPECT.pad, R.PAD); assert.ok(C.SUSPECT.maxCore <= R.MAX_SPAN);
});

test('suspectSpans: đoạn dài bị cắt ở maxCore, giữ `limit` đoạn điểm cao nhất theo thời gian', () => {
  // 100 từ liền nhau đều nghi (p thấp), mỗi từ 0,3 s → 30 s: tách theo maxCore 20 s
  const long = mk(Array.from({ length: 100 }, (_, i) => 'x' + i).join(' '), 0, Object.fromEntries(Array.from({ length: 100 }, (_, i) => [i, 0.1])));
  const r = C.suspectSpans(long);
  assert.equal(r.spans.length, 2);
  for (const sp of r.spans) assert.ok(sp.e - sp.s <= C.SUSPECT.maxCore && sp.e - sp.s <= R.MAX_SPAN);
  // 15 chỗ nghi rời nhau (cách 10 s), điểm khác nhau → giữ 12 chỗ điểm cao nhất, xếp theo thời gian
  const many = [];
  for (let i = 0; i < 15; i++) many.push(...mk(i % 5 === 0 ? 'a 12' : 'a b', i * 10, { 0: i % 5 === 0 ? 0.6 : 0.2 }));
  const m = C.suspectSpans(many);
  assert.equal(m.total, 15); assert.equal(m.cut, 3); assert.equal(m.spans.length, C.SUSPECT.limit);
  assert.deepEqual(m.spans.map(x => x.s), [...m.spans.map(x => x.s)].sort((a, b) => a - b));
  assert.ok(!m.spans.some(x => x.score < 3), 'bỏ đoạn điểm thấp');
  assert.equal(C.suspectSpans(many, { limit: 4 }).spans.length, 4);
});

// "thời gian 15 đến 3 phút đã có thuyết tiền hóa" — lỗi thật của clip-mau: "3" là "30", "tiền hóa" là "tiến hoá"
const SAID = 'các bạn chỉ cần thời gian 15 đến 3 phút đã có thuyết tiền hóa rồi';
const W = mk(SAID, 10);
const ix = w => SAID.split(' ').indexOf(w);
const span = (a, b) => ({ a, b, s: W[a].s, e: W[b].e, ...C.hearWindow(W[a].s, W[b].e, 60) });
const heardOf = text => text.split(' ').map((w, i) => ({ w, s: 10 + i * 0.3, e: 10 + i * 0.3 + 0.28 }));

test('triage: nghe lại = đề xuất AI → "cao" (2 nguồn đồng ý), xếp đầu', () => {
  const aiEdits = [{ start: ix('tiền'), end: ix('hóa'), old: 'tiền hóa', new: 'tiến hoá', kind: 'nhận dạng', reason: 'thuyết tiến hoá' }];
  const spans = [span(ix('15'), ix('phút')), span(ix('tiền'), ix('hóa'))];
  const heard = [heardOf('các bạn chỉ cần thời gian 15 đến 30 phút đã có thuyết tiến hóa rồi'), heardOf('các bạn chỉ cần thời gian 15 đến 30 phút đã có thuyết tiến hoá rồi')];
  const r = C.triage({ words: W, spans, aiEdits, heard });
  assert.equal(r.suggestions[0].conf, 'cao');
  assert.equal(r.suggestions[0].to, 'tiến hoá', 'giữ chữ của AI (cách đặt dấu)');
  assert.match(r.suggestions[0].reason, /2 nguồn đồng ý/);
  const num = r.suggestions.find(x => x.from === '3');
  assert.equal(num.to, '30'); assert.equal(num.conf, 'vừa', 'chỉ nghe lại thấy khác, chạm từ nghi (con số)');
  assert.equal(r.counts.agree, 1); assert.equal(r.counts.heardOnly, 1);
});

test('triage: nghe lại = gốc → bỏ đề xuất đoán của AI; chỉ khác hoa thường thì giữ ở "vừa"', () => {
  const aiEdits = [
    { start: ix('3'), end: ix('3'), old: '3', new: '1,5', kind: 'nhận dạng', reason: 'đoán số' },
    { start: ix('thuyết'), end: ix('thuyết'), old: 'thuyết', new: 'Thuyết', kind: 'tên riêng', reason: 'hoa' },
  ];
  const spans = [span(ix('15'), ix('thuyết'))];
  const r = C.triage({ words: W, spans, aiEdits, heard: [heardOf(SAID)] });
  assert.equal(r.counts.dropAi, 1);
  assert.deepEqual(r.dropped.map(x => x.to), ['1,5']);
  assert.deepEqual(r.suggestions.map(x => [x.to, x.conf]), [['Thuyết', 'vừa']]);
});

test('triage: nghe lại = gốc nhưng AI sửa chữ (không phải số) → hạ xuống "cần nghe", không bỏ', () => {
  // đo trên clip mẫu: large-v3 cũng nghe "tiền hóa", AI sửa đúng "tiến hoá" theo nghĩa câu
  const aiEdits = [{ start: ix('tiền'), end: ix('hóa'), old: 'tiền hóa', new: 'tiến hoá', kind: 'chính tả', reason: 'thuyết tiến hoá' }];
  const r = C.triage({ words: W, spans: [span(ix('thuyết'), ix('hóa'))], aiEdits, heard: [heardOf(SAID)] });
  assert.equal(r.counts.dropAi, 0);
  assert.deepEqual(r.suggestions.map(x => [x.to, x.conf]), [['tiến hoá', 'nghe']]);
  assert.match(r.suggestions[0].reason, /nghe lại vẫn ra/);
});

test('triage: chỉ nghe lại thấy khác — "vừa" khi chạm số / chỗ AI nghi, "cần nghe" khi AI đã đọc và thấy ổn', () => {
  const heard = [heardOf('các bạn chỉ cần thời gian 15 đến 30 phút đã có thuyết tiến hoá rồi'.replace('đã có', 'mới có'))];
  const spans = [span(ix('15'), ix('có'))];
  // AI đã chạy, nghi "15 đến 3", không nói gì về "đã"
  const r = C.triage({ words: W, spans, heard, uncertain: [{ start: ix('15'), end: ix('3') }], aiRan: true });
  assert.deepEqual(r.suggestions.map(x => [x.from, x.to, x.conf]), [['3', '30', 'vừa'], ['đã', 'mới', 'nghe']]);
  // AI không chạy (thiếu claude): chỗ Whisper không chắc thì "vừa"
  const P = W.map((x, k) => (k === ix('đã') ? { ...x, p: 0.3 } : x));
  const r2 = C.triage({ words: P, spans, heard, aiRan: false });
  assert.deepEqual(r2.suggestions.map(x => [x.from, x.conf]), [['3', 'vừa'], ['đã', 'vừa']]);
});

test('triage: ba nguồn khác nhau → "cần nghe" với hai bản (có số thì "vừa", tin bản nghe lại); AI không nghe lại được → "vừa"', () => {
  const aiEdits = [
    { start: ix('thuyết'), end: ix('thuyết'), old: 'thuyết', new: 'thiết', kind: 'nhận dạng', reason: '' },
    { start: ix('rồi'), end: ix('rồi'), old: 'rồi', new: 'rùi', kind: 'chính tả', reason: '' },
  ];
  const spans = [span(ix('thuyết'), ix('thuyết'))];
  const r = C.triage({ words: W, spans, aiEdits, heard: [heardOf(SAID.replace('thuyết', 'tuyết'))] });
  const n = r.suggestions.find(x => x.conf === 'nghe');
  assert.equal(n.to, 'tuyết'); assert.equal(n.alt, 'thiết'); assert.match(n.reason, /Cần nghe/);
  assert.deepEqual(r.suggestions.filter(x => x.conf === 'vừa').map(x => x.to), ['rùi'], 'đoạn ngoài vùng nghe lại: chỉ AI');
  assert.deepEqual(r.suggestions.map(x => x.conf), ['vừa', 'nghe'], 'xếp vừa trước cần nghe');
  // đo trên clip mẫu: AI đoán "15 đến 3" → "1 đến 3", nghe lại ra "15 đến 30": số → "vừa", Nhận = bản nghe lại
  const num = C.triage({ words: W, spans: [span(ix('15'), ix('phút'))], heard: [heardOf(SAID.replace(' 3 ', ' 30 '))],
    aiEdits: [{ start: ix('15'), end: ix('3'), old: '15 đến 3', new: '1 đến 3', kind: 'nhận dạng', reason: '' }] }).suggestions;
  assert.deepEqual(num.map(x => [x.from, x.to, x.alt, x.conf]), [['15 đến 3', '15 đến 30', '1 đến 3', 'vừa']]);
});

test('triage: nghe lại bịa câu dài hoặc lặp → bỏ cả đoạn; đổi quá 3 từ → bỏ chỗ đó', () => {
  const aiEdits = [{ start: ix('3'), end: ix('3'), old: '3', new: '30', kind: 'nhận dạng', reason: '' }];
  const spans = [span(ix('15'), ix('phút'))];
  const loop = heardOf('các bạn chỉ cần thời gian 15 đến 30 phút phút phút phút phút đã có');
  let r = C.triage({ words: W, spans, aiEdits, heard: [loop] });
  assert.equal(r.counts.madeUp, 1);
  assert.deepEqual(r.suggestions.map(x => [x.to, x.conf]), [['30', 'vừa']], 'AI vẫn còn, nhưng không được nâng độ tin');
  const long = heardOf(`${SAID} hẹn gặp lại các bạn trong những video tiếp theo cảm ơn các bạn đã theo dõi nhé`);
  assert.ok(C.madeUp(long.map(x => x.w), W.filter(x => x.e > spans[0].from && x.s < spans[0].to).map(x => x.w)));
  r = C.triage({ words: W, spans, aiEdits: [], heard: [heardOf(SAID.replace(' 3 ', ' 3 một hai ba bốn năm '))] });
  assert.equal(r.counts.wild, 1); assert.equal(r.suggestions.length, 0);
  assert.equal(C.madeUp(heardOf(SAID).map(x => x.w), SAID.split(' ')), false);
});

test('triage: đoạn chưa nghe (null) hoặc khác ngoài đoạn nghi → không thành đề xuất nghe lại', () => {
  const spans = [span(ix('15'), ix('phút'))];
  assert.deepEqual(C.triage({ words: W, spans, heard: [null] }).suggestions, []);
  // khác ở "các bạn" (mép, ngoài [a, b]) → bỏ
  const r = C.triage({ words: W, spans, heard: [heardOf(SAID.replace('các bạn', 'cả bàn'))] });
  assert.deepEqual(r.suggestions, []);
});
