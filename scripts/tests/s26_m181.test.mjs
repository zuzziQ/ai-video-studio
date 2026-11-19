// S26 M181: gói theo lĩnh vực cho "Video mới", nhạc mặc định đạt QC, gợi ý hook không lấy tên file.
// Chạy: node --test scripts/tests/s26_m181.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AVS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-s26-'));
const require = createRequire(import.meta.url);
const { defaultPack, PURPOSE_PACK } = require('../../studio/features/02_packpick.core.js');
const { DEFAULT_MUSIC_GAIN, DEFAULT_DUCK, defaultAudio } = await import('../audio_defaults.mjs');
const { applyDeterministic, hookText, fileLikeTitle } = await import('../ai_qc.mjs');

const PK = ['slate', 'realestate', 'course', 'kinetic', 'review', 'share', 'news', 'keynote'].map(id => ({ id, recipe() {} }));

test('gói mặc định: lĩnh vực bds → realestate khi thương hiệu chưa có pack', () => {
  assert.equal(defaultPack({ purpose: 'bds', packs: PK }), 'realestate');
  assert.equal(defaultPack({ purpose: 'khoahoc', packs: PK }), 'course');
});
test('gói mặc định: pack của thương hiệu thắng lĩnh vực; gói lần trước thắng lĩnh vực', () => {
  assert.equal(defaultPack({ brand: { pack: 'news' }, purpose: 'bds', packs: PK }), 'news');
  assert.equal(defaultPack({ last: 'review', purpose: 'bds', packs: PK }), 'review');
  assert.equal(defaultPack({ brand: { pack: 'khong_co' }, purpose: 'bds', packs: PK }), 'realestate');
});
test('gói mặc định: lĩnh vực "khac"/lạ/chưa chọn → gói đầu; danh sách rỗng → slate', () => {
  assert.equal(defaultPack({ purpose: 'khac', packs: PK }), 'slate');
  assert.equal(defaultPack({ purpose: '', packs: PK }), 'slate');
  assert.equal(defaultPack({ purpose: 'bds', packs: [] }), 'slate');
  for (const id of Object.values(PURPOSE_PACK)) assert.ok(PK.some(p => p.id === id), id);
});

test('nhạc mặc định: gain cao hơn -20 và có hạ nhạc theo lời nói', () => {
  assert.ok(DEFAULT_MUSIC_GAIN > -14 && DEFAULT_MUSIC_GAIN <= -6);
  assert.equal(DEFAULT_DUCK.on, true);
  const a = defaultAudio(32.5, 'tech');
  assert.equal(a.music[0].gain, DEFAULT_MUSIC_GAIN);
  assert.equal(a.music[0].t1, 32.5);
  assert.deepEqual(a.duck, DEFAULT_DUCK);
});

const tlOf = extra => ({ width: 1080, height: 1920, duration: 30, scenes: [], audio: { music: [{ t0: 0, t1: 30, mood: 'tech', gain: -20 }] }, ...extra });
test('QC nhạc quá nhỏ: Chọn tất cả (Claude đã chỉnh gain nhẹ) vẫn áp phần còn thiếu', () => {
  const tl = tlOf(), is = { kind: 'music_quiet', need_db: 17.5, severity: 'low', t: 0 };
  const touched = new Set(['gain']); touched.gainDb = 3; // gợi ý Claude +3 dB đã áp trước
  tl.audio.music[0].gain = -17;
  const fixed = applyDeterministic(tl, [], [is], { samples: [] }, touched);
  assert.ok(fixed.has(is));
  assert.equal(tl.audio.music[0].gain, -17 + 14.5);
});
test('QC nhạc quá nhỏ: Claude đã đủ thì đánh dấu đã sửa, không cộng thêm', () => {
  const tl = tlOf({ audio: { music: [{ t0: 0, t1: 30, mood: 'tech', gain: -3 }] } }), is = { kind: 'music_quiet', need_db: 5, severity: 'low', t: 0 };
  const touched = new Set(['gain']); touched.gainDb = 5;
  const fixed = applyDeterministic(tl, [], [is], { samples: [] }, touched);
  assert.ok(fixed.has(is));
  assert.equal(tl.audio.music[0].gain, -3);
});
test('QC nhạc: không có touched thì áp nguyên need_db như cũ', () => {
  const tl = tlOf(), is = { kind: 'music_quiet', need_db: 12, severity: 'low', t: 0 };
  applyDeterministic(tl, [], [is], { samples: [] }, new Set());
  assert.equal(tl.audio.music[0].gain, -8);
});

const caps = [{ t0: 0, t1: 3, words: ['Căn', 'hộ', 'view', 'sông', 'đẹp', 'nhất', 'quận'].map((w, i) => ({ w, s: i * .4, e: i * .4 + .3 })) }];
test('hook: tên file không làm hook khi có lời thoại', () => {
  assert.equal(hookText({ title: 'VIDEO-GOC', scenes: [] }, caps, null), 'Căn hộ view sông đẹp nhất');
  assert.equal(hookText({ title: 'Nha dep', title_auto: true, scenes: [] }, caps, null), 'Căn hộ view sông đẹp nhất');
});
test('hook: tiêu đề người dùng gõ vẫn thắng lời thoại; Claude thắng tất cả', () => {
  assert.equal(hookText({ title: '3 mẹo mua nhà', scenes: [] }, caps, null), '3 mẹo mua nhà');
  assert.equal(hookText({ title: '3 mẹo mua nhà', scenes: [] }, caps, 'Hook của Claude'), 'Hook của Claude');
});
test('hook: không còn gì khác thì mới dùng tên file', () => {
  assert.equal(hookText({ title: 'VIDEO-GOC', scenes: [] }, [], null), 'VIDEO-GOC');
});
test('fileLikeTitle', () => {
  assert.ok(fileLikeTitle('VIDEO-GOC', {}));
  assert.ok(fileLikeTitle('IMG_1234', {}));
  assert.ok(fileLikeTitle('clip.mp4', {}));
  assert.ok(fileLikeTitle('Nha dep quan 7', { title_auto: true, title: 'Nha dep quan 7' }));
  assert.ok(!fileLikeTitle('3 mẹo mua nhà', {}));
  assert.ok(!fileLikeTitle('Giảm giá', {}));
});
