// Test chọn ảnh của "Bám lời thoại" (scripts/fit_images.mjs): từ khoá, loại ảnh rác, hướng ảnh, ngưỡng khớp, chống trùng.
// Chạy: node --test scripts/tests/fit_images.test.mjs. Không cần mạng: kết quả tìm kiếm là dữ liệu giả theo đúng ca lỗi thật
// trên clip-mau (Ngân Hà cho "artificial intelligence", sạp báo cho "man tired editing video", bóng bay cho "success celebration").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { keywordsOf, stem, isJunk, orientation, scoreItem, rankImages, pickImage, queriesOf, needOf, imageSize, slotOrientation,
  mediaHashes, fileHash, dropMedia } from '../fit_images.mjs';

const it = (title, o = {}) => ({ url: 'https://x/' + encodeURIComponent(title), title, w: 1600, h: 1067, ...o });

test('keywordsOf bỏ stopword, số, trùng; stem gom biến thể', () => {
  assert.deepEqual(keywordsOf('A man on the laptop, editing the video 2024 video'), ['man', 'laptop', 'editing', 'video']);
  assert.deepEqual(keywordsOf(''), []);
  assert.equal(stem('editing'), stem('edited'));
  assert.equal(stem('celebrations'), stem('celebration'));
  assert.equal(stem('laptops'), 'laptop');
});

test('ca thật: ảnh không chứa từ khoá bị loại, giữ ảnh mẫu', () => {
  const kws = keywordsOf('artificial intelligence video editing');
  const items = [it('360-degree Panorama of the Southern Sky', { w: 6000, h: 3000 }),
    it('Timeline of artificial intelligence training computation for the last 8 decades')];
  assert.equal(pickImage(items, kws), null, 'Ngân Hà: 0 từ khoá; biểu đồ: rác');
  const kws2 = keywordsOf('man tired editing video late night');
  assert.equal(pickImage([it('London newsstand', { tags: ['newspaper', 'street'] })], kws2), null);
});

test('1 từ chung chung không đủ khi câu có ≥ 2 từ khoá', () => {
  const kws = keywordsOf('success celebration video creator');
  assert.equal(needOf(kws), 3);
  assert.deepEqual([[], ['a1'], ['a1', 'b1'], ['a1', 'b1', 'c1']].map(needOf), [0, 1, 2, 2]);
  assert.equal(pickImage([it('Video clips by a creator')], keywordsOf('video clip on laptop screen')), null, '2/4 không đủ');
  assert.equal(pickImage([it('Girl with balloons', { tags: ['celebration', 'party'] })], kws), null);
  const ok = it('YouTube creator celebration after editing video', { tags: ['creator'] });
  assert.equal(pickImage([it('Girl with balloons', { tags: ['celebration'] }), ok], kws).item, ok);
});

test('từ trừu tượng không tính là phần cụ thể; tên ảnh = từ khoá (ảnh không tên) không tính', () => {
  const kws = keywordsOf('success celebration video creator');
  assert.equal(pickImage([it('Actors at the success celebration of a film')], kws), null, 'chỉ 1 từ cụ thể');
  const ai = keywordsOf('artificial intelligence video editing');
  assert.equal(pickImage([it('Prisma', { tags: ['ai', 'artificial', 'intelligence', 'photoediting'] })], ai), null);
  assert.ok(pickImage([it('AI symposium', { tags: ['artificial', 'intelligence', 'technology'] })], keywordsOf('artificial intelligence technology')));
  const q = 'clock time hours working';
  assert.equal(pickImage([it(q, { untitled: true })], keywordsOf(q)), null);
  assert.ok(pickImage([it('Old clock', { untitled: false, tags: ['clock', 'hours', 'working'] })], keywordsOf(q)));
  assert.ok(isJunk(it('Opnamen video-clip, Bestanddeelnr 933-8125')));
});

test('chọn ứng viên điểm cao nhất, không phải kết quả đầu tiên', () => {
  const kws = keywordsOf('video editing laptop');
  const first = it('Laptop on a table'), best = it('Man editing video on laptop', { tags: ['video editing'] });
  assert.equal(pickImage([first, best], kws).item, best);
});

test('tag (Openverse/Commons) được tính, stem khớp editing/edit', () => {
  const kws = keywordsOf('woman editing video');
  const r = scoreItem(it('IMG_2041', { tags: ['woman', 'video edit', 'computer'] }), kws);
  assert.equal(r.matched, 3);
});

test('ảnh rác: bản đồ, sơ đồ, scan, logo, tài liệu — trừ khi từ khoá hỏi đúng thứ đó', () => {
  assert.ok(isJunk(it('Map of Hanoi 1890')));
  assert.ok(isJunk(it('Diagram_of_a_camera')));
  assert.ok(isJunk(it('Company logo'), keywordsOf('office desk')));
  assert.ok(isJunk(it('Scanned letter page 3')));
  assert.ok(isJunk(it('Coffee cup', { url: 'https://x/cup.svg' })));
  assert.ok(!isJunk(it('Old map on a wooden table'), keywordsOf('old map table')));
  assert.ok(!isJunk(it('Woman typing on laptop')));
  const kws = keywordsOf('laptop desk');
  assert.equal(pickImage([it('Laptop desk diagram'), it('Laptop on desk')], kws).item.title, 'Laptop on desk');
});

test('ảnh nhỏ (< 500 px) và URL đã dùng bị bỏ', () => {
  const kws = keywordsOf('coffee cup');
  const small = it('Coffee cup close up', { w: 320, h: 240 }), used = it('Coffee cup on table'), ok = it('Coffee cup morning');
  assert.equal(pickImage([small, used, ok], kws, { usedUrls: new Set([used.url]) }).item, ok);
});

test('hướng ảnh: cùng hướng ô ảnh được ưu tiên, lệch hướng bị phạt', () => {
  assert.equal(orientation(1080, 1920), 'v');
  assert.equal(orientation(1920, 1080), 'h');
  assert.equal(orientation(1000, 1050), 'sq');
  assert.equal(orientation(0, 0), '');
  const kws = keywordsOf('coffee cup');
  const wide = it('Coffee cup wide', { w: 1920, h: 1080 }), tall = it('Coffee cup tall', { w: 1080, h: 1920 });
  assert.equal(pickImage([wide, tall], kws, { want: 'v' }).item, tall);
  assert.equal(pickImage([tall, wide], kws, { want: 'h' }).item, wide);
  // hướng chỉ là điểm cộng/trừ: ảnh khớp đủ từ khoá vẫn được nếu chỉ có nó
  assert.equal(pickImage([wide], kws, { want: 'v' }).item, wide);
});

test('ảnh tư liệu cũ (năm trong tên) bị trừ điểm', () => {
  const kws = keywordsOf('city street');
  assert.equal(pickImage([it('City street 1925'), it('City street night')], kws).item.title, 'City street night');
});

test('queriesOf: cả câu rồi 2 từ đầu, không bao giờ lùi về 1 từ', () => {
  assert.deepEqual(queriesOf(['artificial', 'intelligence', 'video', 'editing']), ['artificial intelligence video editing', 'video editing']);
  assert.deepEqual(queriesOf(['artificial', 'intelligence', 'robot']), ['artificial intelligence robot', 'artificial intelligence']);
  assert.deepEqual(queriesOf(['laptop', 'desk']), ['laptop desk']);
  assert.deepEqual(queriesOf(['laptop']), ['laptop']);
  assert.deepEqual(queriesOf([]), []);
  assert.deepEqual(rankImages([it('x')], []), []);
});

// ---------- kích thước ảnh + hướng ô ảnh từ ảnh mẫu ----------
const png = (w, h) => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const jpg = (w, h) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0, 0, 0, 0, 0, 0, 0, 0]);

test('imageSize đọc PNG/JPEG không cần thư viện', () => {
  assert.deepEqual(imageSize(png(600, 1000)), { w: 600, h: 1000 });
  assert.deepEqual(imageSize(jpg(1200, 1500)), { w: 1200, h: 1500 });
  assert.equal(imageSize(Buffer.from('not an image at all, really')), null);
});

test('slotOrientation: bg theo khung video, thẻ (card) ngang, còn lại theo ảnh mẫu', () => {
  const skill = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-fitimg-'));
  try {
    fs.mkdirSync(path.join(skill, 'examples/media'), { recursive: true });
    fs.writeFileSync(path.join(skill, 'examples/media/tall.jpg'), jpg(1200, 1500));
    fs.writeFileSync(path.join(skill, 'examples/media/sq.png'), png(640, 640));
    assert.equal(slotOrientation(['bg'], 'media/sq.png', { vertical: true, skill }), 'v');
    assert.equal(slotOrientation(['bg'], 'media/sq.png', { vertical: false, skill }), 'h');
    assert.equal(slotOrientation(['cards', 0, 'src'], 'media/tall.jpg', { skill }), 'h');
    assert.equal(slotOrientation(['images', 2], 'media/tall.jpg', { skill }), 'v');
    assert.equal(slotOrientation(['image'], 'media/sq.png', { skill }), 'sq');
    assert.equal(slotOrientation(['image'], 'media/none.jpg', { skill }), '');
  } finally { fs.rmSync(skill, { recursive: true, force: true }); }
});

test('chống trùng theo nội dung: hash ảnh có sẵn, xoá bản trùng và dòng credits', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-fitimg-'));
  try {
    const md = path.join(dir, 'media'); fs.mkdirSync(md);
    fs.writeFileSync(path.join(md, 'fit-a.jpg'), 'SAME'); fs.writeFileSync(path.join(md, 'fit-a_1.jpg'), 'SAME');
    fs.writeFileSync(path.join(md, 'other.png'), 'OTHER'); fs.writeFileSync(path.join(md, 'notes.txt'), 'SAME?');
    fs.writeFileSync(path.join(md, 'credits.json'), JSON.stringify([{ file: 'fit-a.jpg' }, { file: 'fit-a_1.jpg' }]));
    const hs = mediaHashes(dir);
    assert.equal(hs.size, 2, 'hai file cùng byte = một hash, file không phải ảnh bỏ qua');
    assert.ok(hs.has(fileHash(path.join(md, 'fit-a_1.jpg'))));
    dropMedia(dir, 'media/fit-a_1.jpg');
    assert.ok(!fs.existsSync(path.join(md, 'fit-a_1.jpg')));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(md, 'credits.json'), 'utf8')).map(x => x.file), ['fit-a.jpg']);
    assert.equal(mediaHashes(path.join(dir, 'missing')).size, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
