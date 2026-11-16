// Bám mặt cho bubble / PIP: chọn đúng chuỗi khung a-roll và gọn key trước khi ghi vào timeline.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compactKeys, arollSeq } from '../face_track_project.mjs';

test('compactKeys bỏ key lặp lại, giữ key đổi và key cuối', () => {
  const k = [{ t: 0, ox: 41, oy: 54, fs: 32 }, { t: .2, ox: 41, oy: 54, fs: 32 }, { t: .4, ox: 40, oy: 54, fs: 32 }, { t: .6, ox: 40, oy: 54, fs: 32 }];
  assert.deepEqual(compactKeys(k).map(x => x.t), [0, .4, .6]);
});

test('arollSeq: clip chuỗi khung trước, rồi aroll.frames', () => {
  assert.deepEqual(arollSeq({ fps: 30, clips: [{ src: 'media/a.jpg' }, { src: { seq: 'work/frames/%05d.jpg', fps: 25 } }] }), { seq: 'work/frames/%05d.jpg', fps: 25 });
  assert.deepEqual(arollSeq({ fps: 30, aroll: { frames: 'work/frames/%05d.jpg' } }), { seq: 'work/frames/%05d.jpg', fps: 30 });
  assert.equal(arollSeq({ clips: [] }), null);
});
