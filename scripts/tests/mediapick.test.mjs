// S30 M214: bộ chọn media dùng chung (lõi studio/features/07_mediapick.core.js) và ảnh nhỏ video Kho (scripts/kho_thumb.mjs).
// node --test scripts/tests/mediapick.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { thumbKey, videoThumb } from '../kho_thumb.mjs';

const C = createRequire(import.meta.url)('../../studio/features/07_mediapick.core.js');

test('label: bỏ tiền tố nguồn, tên người dùng đứng đầu', () => {
  assert.deepEqual(C.label('kho_Placenta 82X.png'), { title: 'Placenta 82X.png', src: 'Từ Kho' });
  assert.deepEqual(C.label('stock_pexels-123.mp4'), { title: 'pexels-123.mp4', src: 'Stock' });
  assert.deepEqual(C.label('logo.png'), { title: 'logo.png', src: '' });
  assert.deepEqual(C.label('media/ai_ảnh nền.webp'), { title: 'ảnh nền.webp', src: 'Ảnh AI' });
});

test('filter: theo loại và ô tìm không dấu', () => {
  const items = [{ name: 'Sản phẩm.png', kind: 'image' }, { name: 'clip.mp4', kind: 'video' }, { name: 'nhac.mp3', kind: 'audio' }, { rel: 'Anh/kem dưỡng.jpg', name: 'kem dưỡng.jpg' }];
  assert.deepEqual(C.filter(items, { kinds: ['image'] }).map(x => x.name), ['Sản phẩm.png', 'kem dưỡng.jpg']);
  assert.deepEqual(C.filter(items, { kinds: ['image', 'video'], q: 'san pham' }).map(x => x.name), ['Sản phẩm.png']);
  assert.deepEqual(C.filter(items, { kinds: ['image'], q: 'anh/kem' }).map(x => x.name), ['kem dưỡng.jpg']);
  assert.deepEqual(C.filter(null), []);
});

test('thumbOf: dự án dùng thumb sẵn có, Kho: ảnh xem thẳng, video qua /api/media/kho/thumb', () => {
  assert.equal(C.thumbOf({ name: 'a.mp4', kind: 'video', thumb: 'media/a_frames/00001.jpg' }), 'media/a_frames/00001.jpg');
  assert.equal(C.thumbOf({ name: 'a.mp3', kind: 'audio' }), '');
  assert.equal(C.thumbOf({ rel: 'Anh/x y.png', name: 'x y.png', kind: 'image' }, 'kho'), '/api/media/kho/file?rel=Anh%2Fx%20y.png');
  assert.equal(C.thumbOf({ rel: 'Nguon/c.mov', name: 'c.mov', kind: 'video' }, 'kho'), '/api/media/kho/thumb?rel=Nguon%2Fc.mov');
});

test('videoThumb: một khung, có cache, lỗi thì ghi .none và không thử lại', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-kthumb-')), cache = path.join(d, 'cache');
  const v = path.join(d, 'Video gốc.mp4'); fs.writeFileSync(v, 'x');
  let calls = 0;
  const ok = async args => { calls++; fs.writeFileSync(args.at(-1), 'jpg'); return true; };
  const a = await videoThumb(v, { dir: cache, ffmpeg: ok });
  assert.ok(a && fs.existsSync(a));
  assert.equal(path.basename(a), thumbKey(v, fs.statSync(v)) + '.jpg');
  assert.equal(await videoThumb(v, { dir: cache, ffmpeg: ok }), a);
  assert.equal(calls, 1, 'lần hai lấy từ cache');
  assert.deepEqual(fs.readdirSync(cache).filter(f => f.startsWith('.')), [], 'không để lại file tạm');

  const w = path.join(d, 'hong.mov'); fs.writeFileSync(w, 'y');
  let fails = 0; const bad = async () => { fails++; return false; };
  assert.equal(await videoThumb(w, { dir: cache, ffmpeg: bad }), null);
  assert.equal(fails, 2, 'thử -ss 1 rồi khung đầu');
  assert.equal(await videoThumb(w, { dir: cache, ffmpeg: bad }), null);
  assert.equal(fails, 2, 'đã ghi .none');

  assert.equal(await videoThumb(path.join(d, 'a.png'), { dir: cache, ffmpeg: ok }), null, 'không phải video');
  assert.equal(await videoThumb(path.join(d, 'mat.mp4'), { dir: cache, ffmpeg: ok }), null, 'file không có');
  fs.rmSync(d, { recursive: true, force: true });
});
