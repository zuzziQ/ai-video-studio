// S14 M114: điểm 0–100 từng bước (studio/features/02_score.core.js) — hàm thuần, không DOM, không gọi Claude.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../../studio/features/02_score.core.js');

const AT = '2026-11-17T10:00:00.000Z', LATER = '2026-11-17T11:00:00.000Z';
const fullTl = (o = {}) => ({
  duration: 30, clips: [{ src: 'a.mp4' }, { src: 'a.mp4' }], caption_style: 'bold', pack: 'share',
  brand: { name: 'Tiệm Bánh Mây', logo: 'logo.png', primary: '#f60' }, face_track: { keys: [{ t: 0 }] },
  scenes: [{ type: 'a', t0: 0, t1: 6 }, { type: 'broll', t0: 6, t1: 12 }, { type: 'b', t0: 12, t1: 20 }, { type: 'c', t0: 20, t1: 30 }],
  audio: { music: [{ t0: 0, t1: 30, mood: 'chill' }] }, ...o,
});
const fullIn = (o = {}) => ({
  tl: fullTl(o.tl), caps: 12, fillers: true, burn: { found: false },
  quick: { issues: [] }, qc: { score: 100, issues: [] },
  latest: { at: LATER, missing: false, deliveredNow: 1, files: [{}] }, edited: AT, ...o, ...(o.tl ? { tl: fullTl(o.tl) } : {}),
});
const item = (r, step, id) => r.steps[step].items.find(i => i.id === id);

test('dự án đủ mọi thứ: mọi bước 100', () => {
  const r = C.score(fullIn());
  for (const s of C.STEPS) assert.equal(r.steps[s].score, 100, s);
  assert.deepEqual(C.STEPS, ['prep', 'source', 'build', 'check', 'ship']);
});

test('dự án trống: không lỗi, điểm thấp, mỗi mục thiếu có câu vì sao', () => {
  const r = C.score({ tl: { duration: 0, scenes: [] } });
  for (const s of C.STEPS) {
    assert.ok(r.steps[s].score >= 0 && r.steps[s].score <= 100);
    for (const it of r.steps[s].items) if (!it.ok) assert.ok(it.miss && typeof it.miss === 'string', `${s}.${it.id}`);
  }
  assert.equal(r.steps.prep.score, 0);
  assert.equal(r.steps.source.score, 0);
  assert.equal(r.steps.ship.score, 0);
  assert.equal(r.steps.check.score, 0);
});

test('Chuẩn bị: thiếu logo trừ điểm; sản phẩm chỉ tính khi gói cần', () => {
  const noLogo = C.score(fullIn({ tl: { brand: { name: 'X', primary: '#000' } } }));
  assert.ok(noLogo.steps.prep.score < 100 && noLogo.steps.prep.score > 0);
  assert.equal(item(noLogo, 'prep', 'logo').ok, false);
  assert.equal(item(C.score(fullIn()), 'prep', 'product'), undefined, 'gói không cần sản phẩm thì không có mục sản phẩm');
  const ad = C.score(fullIn({ tl: { ads: { on: true } } }));
  assert.equal(item(ad, 'prep', 'product').ok, false);
  assert.ok(ad.steps.prep.score < 100);
  assert.equal(item(C.score(fullIn({ tl: { ads: { on: true, product: 'kem-a' } } })), 'prep', 'product').ok, true);
  // gói khai báo needs (đọc từ PACKS, không viết cứng theo id)
  const rv = C.score(fullIn({ needs: ['product'] }));
  assert.equal(item(rv, 'prep', 'product').ok, false);
});

test('needsOf: gộp needs của gói và chế độ quảng cáo, bỏ giá trị lạ', () => {
  assert.deepEqual(C.needsOf({}, null), []);
  assert.deepEqual(C.needsOf({ ads: { on: true } }, null), ['product']);
  assert.deepEqual(C.needsOf({}, { needs: ['broll', 'music', 'xyz', 'broll'] }).sort(), ['broll', 'music']);
  assert.deepEqual(C.needsOf({ ads: { on: true } }, { needs: ['product'] }), ['product']);
});

test('Nguồn: phụ đề cháy sẵn chưa chọn cách xử lý thì trừ điểm, chọn rồi thì đạt', () => {
  const burn = C.score(fullIn({ burn: { found: true } }));
  assert.equal(item(burn, 'source', 'burn').ok, false);
  assert.ok(burn.steps.source.score < 100);
  for (const mode of ['off', 'move', 'mask']) {
    const r = C.score(fullIn({ burn: { found: true }, tl: { burnin: { mode } } }));
    assert.equal(item(r, 'source', 'burn').ok, true, mode);
    assert.equal(r.steps.source.score, 100, mode);
  }
  assert.equal(item(C.score(fullIn()), 'source', 'burn'), undefined, 'không có chữ cháy sẵn thì không có mục này');
});

test('Nguồn: lời thoại chưa làm sạch (chưa dò, chưa cắt) trừ điểm; đã cắt clip thì coi là đã làm sạch', () => {
  const r = C.score(fullIn({ fillers: false, tl: { clips: [{ src: 'a.mp4' }] } }));
  assert.equal(item(r, 'source', 'clean').ok, false);
  assert.equal(item(C.score(fullIn({ fillers: false })), 'source', 'clean').ok, true);
  const noCap = C.score(fullIn({ caps: 0 }));
  assert.equal(item(noCap, 'source', 'speech').ok, false);
});

test('Dựng: khoảng trống dài không graphic bị báo kèm thời điểm', () => {
  const r = C.score(fullIn({ tl: { scenes: [{ type: 'a', t0: 0, t1: 4 }, { type: 'broll', t0: 20, t1: 30 }] } }));
  const g = item(r, 'build', 'gap');
  assert.equal(g.ok, false);
  assert.equal(g.at, 4);
  assert.match(g.miss, /0:04/);
  assert.deepEqual(C.longestGap({ duration: 30, scenes: [{ t0: 0, t1: 4 }, { t0: 20, t1: 30 }] }), { at: 4, len: 16 });
  assert.deepEqual(C.longestGap({ duration: 10, scenes: [{ t0: 2, t1: 5 }, { t0: 3, t1: 10 }] }), { at: 0, len: 2 });
});

test('Dựng: b-roll và âm thanh chỉ tính khi gói cần; phụ đề tắt trừ điểm', () => {
  const plain = C.score(fullIn({ tl: { scenes: [{ type: 'a', t0: 0, t1: 30 }], audio: {} } }));
  assert.equal(item(plain, 'build', 'broll'), undefined);
  assert.equal(item(plain, 'build', 'music'), undefined);
  const need = C.score(fullIn({ needs: ['broll', 'music'], tl: { scenes: [{ type: 'a', t0: 0, t1: 30 }], audio: {} } }));
  assert.equal(item(need, 'build', 'broll').ok, false);
  assert.equal(item(need, 'build', 'music').ok, false);
  assert.ok(need.steps.build.score < plain.steps.build.score);
  const capOff = C.score(fullIn({ tl: { caption_style: 'none' } }));
  assert.equal(item(capOff, 'build', 'captions').ok, false);
  assert.equal(item(C.score(fullIn({ tl: { burnin: { mode: 'off' } } })), 'build', 'captions').ok, false, 'tắt phụ đề mà video không có chữ cũ');
  assert.equal(item(C.score(fullIn({ burn: { found: true }, tl: { burnin: { mode: 'off' } } })), 'build', 'captions').ok, true, 'giữ phụ đề cháy sẵn của video gốc');
});

test('Kiểm tra: điểm theo QC nhanh; QC đầy đủ chỉ tính khi đã chạy', () => {
  const onlyQuick = C.score(fullIn({ qc: { none: true } }));
  assert.equal(onlyQuick.steps.check.score, 100);
  assert.equal(item(onlyQuick, 'check', 'qc').opt, true);
  const bad = C.score(fullIn({ qc: { none: true }, quick: { issues: [{ severity: 'high' }, { severity: 'high' }, { severity: 'med' }] } }));
  assert.ok(bad.steps.check.score < 60, String(bad.steps.check.score));
  const stale = C.score(fullIn({ qc: { none: true }, quick: { issues: [], stale: true } }));
  assert.ok(stale.steps.check.score < 100 && stale.steps.check.score >= 40);
  const never = C.score(fullIn({ quick: { none: true }, qc: { none: true } }));
  assert.equal(never.steps.check.score, 0);
  const lowFull = C.score(fullIn({ qc: { score: 40, issues: [] } }));
  assert.ok(lowFull.steps.check.score < 100 && lowFull.steps.check.score > 40);
  assert.equal(C.WARN_BELOW, 60);
});

test('Xuất: bản cũ hơn lần sửa cuối, file mất, chưa giao Thành phẩm', () => {
  const old = C.score(fullIn({ latest: { at: AT, missing: false, deliveredNow: 1 }, edited: LATER }));
  assert.equal(item(old, 'ship', 'export').ok, false);
  assert.match(item(old, 'ship', 'export').miss, /sửa/);
  const gone = C.score(fullIn({ latest: { at: LATER, missing: true, deliveredNow: 0 } }));
  assert.equal(item(gone, 'ship', 'export').ok, false);
  const notGiven = C.score(fullIn({ latest: { at: LATER, missing: false, deliveredNow: 0 } }));
  assert.equal(item(notGiven, 'ship', 'deliver').ok, false);
  assert.ok(notGiven.steps.ship.score < 100 && notGiven.steps.ship.score >= 60);
  // lưu timeline ngay trước khi xuất (≤ 2 s sau mốc xuất) vẫn là bản mới
  assert.equal(C.fresh({ at: '2026-11-17T10:00:00.000Z' }, '2026-11-17T10:00:01.500Z'), true);
});

test('mỗi mục có id, nhãn, điểm bị trừ (lost) cộng lại bằng 100 − điểm bước', () => {
  const r = C.score(fullIn({ burn: { found: true }, caps: 0, tl: { brand: {} } }));
  for (const s of C.STEPS) {
    const st = r.steps[s];
    for (const it of st.items) { assert.ok(it.id && it.label); assert.ok(it.lost >= 0); }
    const lost = st.items.reduce((a, i) => a + i.lost, 0);
    assert.ok(Math.abs(100 - st.score - lost) <= st.items.length, `${s}: ${st.score} + ${lost}`);
  }
});

test('S16 M119: video không lời không bị trừ điểm lời thoại, làm sạch, phụ đề', () => {
  const r = C.score(fullIn({ caps: 0, fillers: false, tl: { speech: { none: true, dropped: 3 }, clips: [{ src: 'a.mp4' }] } }));
  assert.equal(item(r, 'source', 'speech').ok, true);
  assert.equal(item(r, 'source', 'speech').label, 'Video không lời');
  assert.equal(item(r, 'source', 'clean').ok, true);
  assert.equal(item(r, 'build', 'captions').ok, true);
  assert.equal(r.steps.source.score, 100);
  // có lời mà chưa tách: vẫn trừ như cũ
  const r2 = C.score(fullIn({ caps: 0 }));
  assert.equal(item(r2, 'source', 'speech').ok, false);
});
