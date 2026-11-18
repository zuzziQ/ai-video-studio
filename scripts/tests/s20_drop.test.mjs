// S20 M143: kéo mục thư viện thả vào khung / timeline. (1) Lõi thuần studio/features/65_drop.core.js: đổi điểm thả → px thiết kế /
// giây, mã hoá dataTransfer, dời tâm element. (2) Nối dây trong library.js / 65_drop.js kiểm bằng mã nguồn (giao diện), như s19_sidebar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = f => fs.readFileSync(path.join(SKILL, f), 'utf8');
const D = createRequire(import.meta.url)('../../studio/features/65_drop.core.js');

test('stageToDesign: điểm thả → px thiết kế ở 9:16 và 16:9, ngoài khung → null', () => {
  // 9:16, K = .5 → khung 360×640 tại (100, 50)
  const box = { left: 100, top: 50, width: 360, height: 640 };
  assert.deepEqual(D.stageToDesign(100 + 180, 50 + 320, box, .5, 720, 1280), { x: 360, y: 640 });
  assert.deepEqual(D.stageToDesign(100, 50, box, .5, 720, 1280), { x: 0, y: 0 });
  assert.deepEqual(D.stageToDesign(460, 690, box, .5, 720, 1280), { x: 720, y: 1280 });
  assert.equal(D.stageToDesign(99, 300, box, .5, 720, 1280), null);
  assert.equal(D.stageToDesign(300, 691, box, .5, 720, 1280), null);
  // 16:9, K = .4 → khung 512×288
  const h = { left: 0, top: 0, width: 512, height: 288 };
  assert.deepEqual(D.stageToDesign(128, 72, h, .4, 1280, 720), { x: 320, y: 180 });
  assert.equal(D.stageToDesign(10, 10, h, 0, 1280, 720), null);
});

test('timelineToSec: x → giây theo PPS (rect đã tính cuộn), kẹp trong [0, dài - 0.2]', () => {
  assert.equal(D.timelineToSec(300, 100, 60, 30), 3.33);
  assert.equal(D.timelineToSec(300, -1100, 60, 30), 23.33); // cuộn ngang 1200 px
  assert.equal(D.timelineToSec(50, 100, 60, 30), 0);
  assert.equal(D.timelineToSec(99999, 0, 60, 30), 29.8);
  assert.equal(D.timelineToSec(300, 0, 0, 30), 0);
});

test('encode/decode: chỉ nhận loại và id hợp lệ', () => {
  for (const [k, id] of [['text', -1], ['text', 3], ['sticker', '🔥'], ['fx', '2:15'], ['media', 0], ['kho', 7]]) {
    assert.deepEqual(D.decode(D.encode(k, id)), { kind: k, id: String(id) });
  }
  for (const bad of ['', 'x', '{}', D.encode('clip', 1), D.encode('fx', '2'), D.encode('media', 'a'), D.encode('text', ''), JSON.stringify({ kind: 'text', id: 3 })]) {
    assert.equal(D.decode(bad), null, bad);
  }
});

test('mediaHow: Video chính / ngoài track → clip (như cũ), track khác → lớp phủ', () => {
  assert.equal(D.mediaHow('video'), 'clip');
  assert.equal(D.mediaHow(''), 'clip');
  assert.equal(D.mediaHow(undefined), 'clip');
  for (const t of ['broll', 'gfx', 'add', 'scene', 'cap', 'audio']) assert.equal(D.mediaHow(t), 'overlay');
});

test('centerAt: tâm element về điểm thả; card dùng góc trên trái', () => {
  assert.deepEqual(D.centerAt({ x: 360, y: 640, size: 56 }, 100, 200), { x: 100, y: 200, size: 56 });
  const card = { x: 60, y: 100, w: 600, h: 400 };
  const p = D.centerAt({ x: 60, y: 100, size: 600, card }, 360, 640);
  assert.equal(p.x + card.w / 2, 360); assert.equal(p.y + card.h / 2, 640);
  assert.equal(D.centerAt(null, 1, 2), null);
});

test('nguồn kéo: library.js gắn draggable + MIME, hàm chèn nhận {t, x, y}; bấm vẫn gọi không tham số', () => {
  const L = read('studio/library.js');
  for (const s of ['id="addtext" draggable="true"', 'data-tp="${i}" draggable="true"', 'data-st="${ch}" title="${ch}" draggable="true"', 'data-fx="${i}:${j}" draggable="true"'])
    assert.ok(L.includes(s), s);
  assert.match(L, /e\.dataTransfer\.setData\(DropCore\.MIME, DropCore\.encode\(\.\.\.it\)\)/);
  for (const f of ['function addText(preset, o = {})', 'function addSticker(ch, o = {})', 'async function addPackItem(i, j, o = {})', 'function insertMedia(m, o = {})'])
    assert.ok(L.includes(f), f);
  // nút / bấm đúp giữ hành vi cũ (playhead, vị trí mặc định); S21 M147: chèn qua libAct
  for (const s of ["return addText();", "return addText(TEXT_PRESETS[+id]);", "return addSticker(id);", "addPackItem(i, j);"]) assert.ok(L.includes(s), s);
  assert.ok(!L.includes('text/x-avs-media'), 'bỏ MIME cũ, gộp vào DropCore.MIME');
});

test('đích thả: 65_drop.js nghe #stagebox và #tlinner, gọi libInsert; CSS dùng token, không màu cứng', () => {
  const F = read('studio/features/65_drop.js');
  assert.match(F, /libInsert\(d, 'stage', p\)/);
  assert.match(F, /libInsert\(d, 'timeline', \{ t, track: /);
  assert.match(F, /box\.width \/ S\.DW/);
  assert.ok(!/style="/.test(F), 'không style="..." trong markup');
  const css = read('studio/studio.css').split('\n').filter(l => /drophot|dropdot|libdrag/.test(l));
  assert.ok(css.length >= 4);
  for (const l of css) assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(\d/i.test(l), l);
  assert.match(read('studio/theme/tokens.css'), /--color-drop:/);
  // lõi nạp trước feature (thứ tự tên file)
  assert.ok(['65_drop.js', '65_drop.core.js'].sort()[0] === '65_drop.core.js');
});
