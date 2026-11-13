// Test M54 (dự án anh em không chép khung): liên kết cứng khung + video nguồn, chép thật phần sửa được, đường lùi về chép.
// Chạy: node --test scripts/tests/project_clone.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloneProject, isShared } from '../project_clone.mjs';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-clone-'));
test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));
const W = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0;
function mkProject() {
  const d = path.join(ROOT, `p${++n}`);
  W(path.join(d, 'timeline.json'), '{"duration":3}');
  W(path.join(d, 'work/frames/00001.jpg'), 'F1'); W(path.join(d, 'work/frames/00002.jpg'), 'F2');
  W(path.join(d, 'work/aroll.mp4'), 'AROLL'); W(path.join(d, 'work/mix.wav'), 'MIX'); W(path.join(d, 'work/captions.json'), '[]');
  W(path.join(d, 'media/clip.mov'), 'MOV'); W(path.join(d, 'media/clip_frames/00001.jpg'), 'C1'); W(path.join(d, 'media/clip_frames/audio.m4a'), 'AAC');
  W(path.join(d, 'media/photo.jpg'), 'PHOTO');
  W(path.join(d, '.studio/history/1.json'), '{}'); W(path.join(d, '.studio/notes.json'), '{}');
  W(path.join(d, 'out/old.mp4'), 'OUT');
  return d;
}
const SKIP = ['out', '.studio/history'];
const ino = f => fs.statSync(f, { bigint: true }).ino;

test('isShared: khung, media/*_frames và video nguồn; không gồm file sửa được', () => {
  for (const p of ['work/frames/00001.jpg', 'media/a_frames/00001.jpg', 'media/a_frames/audio.m4a', 'media/a.MP4', 'work/aroll.mp4', 'work\\frames\\00002.jpg'])
    assert.equal(isShared(p), true, p);
  for (const p of ['timeline.json', 'work/mix.wav', 'work/captions.json', 'media/photo.jpg', '.studio/x.json', 'out/a.mp4', 'media/sub/a.mp4', 'frames/a.jpg'])
    assert.equal(isShared(p), false, p);
});

test('liên kết cứng khung + video, chép thật phần còn lại, bỏ qua skip', () => {
  const src = mkProject(), dst = src + '_v1';
  const st = cloneProject(src, dst, { skip: SKIP, clone: false });
  assert.equal(st.method, 'link'); assert.equal(st.fallback, null);
  assert.equal(st.linked, 6); // 2 khung + aroll.mp4 + clip.mov + clip_frames/{00001.jpg,audio.m4a}
  for (const f of ['work/frames/00001.jpg', 'work/frames/00002.jpg', 'work/aroll.mp4', 'media/clip.mov', 'media/clip_frames/00001.jpg', 'media/clip_frames/audio.m4a']) {
    assert.equal(ino(path.join(dst, f)), ino(path.join(src, f)), f);
    assert.ok(fs.statSync(path.join(src, f)).nlink >= 2, f);
  }
  for (const f of ['timeline.json', 'work/mix.wav', 'work/captions.json', 'media/photo.jpg', '.studio/notes.json']) {
    assert.notEqual(ino(path.join(dst, f)), ino(path.join(src, f)), f);
    assert.equal(fs.statSync(path.join(src, f)).nlink, 1, f);
  }
  assert.equal(fs.existsSync(path.join(dst, 'out')), false);
  assert.equal(fs.existsSync(path.join(dst, '.studio/history')), false);
  assert.equal(fs.existsSync(path.join(dst, '.studio/notes.json')), true);
});

test('sửa file chép thật hoặc thay khung đúng cách không đụng bản gốc; xoá bản anh em giữ bản gốc', () => {
  const src = mkProject(), dst = src + '_v1';
  cloneProject(src, dst, { skip: SKIP, clone: false });
  fs.writeFileSync(path.join(dst, 'timeline.json'), '{"duration":1}');
  fs.writeFileSync(path.join(dst, 'work/mix.wav'), 'MIX2');
  // thay khung đúng quy tắc: xoá rồi tạo mới (hoặc ghi tạm rồi rename)
  fs.rmSync(path.join(dst, 'work/frames/00001.jpg')); fs.writeFileSync(path.join(dst, 'work/frames/00001.jpg'), 'NEW');
  fs.writeFileSync(path.join(dst, 'work/frames/.tmp.jpg'), 'NEW2'); fs.renameSync(path.join(dst, 'work/frames/.tmp.jpg'), path.join(dst, 'work/frames/00002.jpg'));
  assert.equal(fs.readFileSync(path.join(src, 'timeline.json'), 'utf8'), '{"duration":3}');
  assert.equal(fs.readFileSync(path.join(src, 'work/mix.wav'), 'utf8'), 'MIX');
  assert.equal(fs.readFileSync(path.join(src, 'work/frames/00001.jpg'), 'utf8'), 'F1');
  assert.equal(fs.readFileSync(path.join(src, 'work/frames/00002.jpg'), 'utf8'), 'F2');
  fs.rmSync(dst, { recursive: true, force: true });
  assert.equal(fs.readFileSync(path.join(src, 'media/clip.mov'), 'utf8'), 'MOV');
  assert.equal(fs.statSync(path.join(src, 'media/clip.mov')).nlink, 1);
});

test('đường lùi: liên kết lỗi (EXDEV) → chép thật, tắt liên kết cho phần còn lại', t => {
  const src = mkProject(), dst = src + '_v1';
  let calls = 0;
  t.mock.method(fs, 'linkSync', () => { calls++; throw Object.assign(new Error('cross-device link'), { code: 'EXDEV' }); });
  const st = cloneProject(src, dst, { skip: SKIP, clone: false });
  assert.equal(calls, 1);
  assert.equal(st.method, 'copy'); assert.equal(st.fallback, 'EXDEV'); assert.equal(st.linked, 0);
  assert.notEqual(ino(path.join(dst, 'work/frames/00001.jpg')), ino(path.join(src, 'work/frames/00001.jpg')));
  assert.equal(fs.readFileSync(path.join(dst, 'media/clip_frames/00001.jpg'), 'utf8'), 'C1');
});

test('đường lùi theo file: EMLINK (quá số liên kết) chỉ chép file đó', t => {
  const src = mkProject(), dst = src + '_v1', real = fs.linkSync;
  t.mock.method(fs, 'linkSync', (a, b) => { if (a.endsWith('aroll.mp4')) throw Object.assign(new Error('too many links'), { code: 'EMLINK' }); return real(a, b); });
  const st = cloneProject(src, dst, { skip: SKIP, clone: false });
  assert.equal(st.method, 'link'); assert.equal(st.fallback, 'EMLINK'); assert.equal(st.linked, 5);
  assert.notEqual(ino(path.join(dst, 'work/aroll.mp4')), ino(path.join(src, 'work/aroll.mp4')));
  assert.equal(ino(path.join(dst, 'work/frames/00002.jpg')), ino(path.join(src, 'work/frames/00002.jpg')));
});

test('AVS_VARIANT_LINK=0 / link:false chép đủ; đích đã có thì báo lỗi', () => {
  const src = mkProject();
  const st = cloneProject(src, src + '_v1', { skip: SKIP, clone: false, link: false });
  assert.equal(st.method, 'copy'); assert.equal(st.linked, 0); assert.equal(st.copied, 11);
  assert.throws(() => cloneProject(src, src + '_v1', { clone: false }), /đích đã có/);
});
