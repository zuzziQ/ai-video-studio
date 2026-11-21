// S27 M201 (sửa 2026-11-21): thêm video bằng hộp Video mới (tự làm) không tự cắt, không tự thêm nhạc, không tự dựng theo gói;
// chỉ Tự lái (scripts/autopilot.mjs, gọi newProject không kèm manual) mới cắt khoảng lặng và dựng hết. Không chạy whisper/ffmpeg:
// `run` giả ghi đúng các file mà từng bước để lại. Chạy: node --test scripts/tests/s27_m201_manual.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { newProject } from '../new_project.mjs';

const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const WORDS = [{ w: 'xin', s: 0.5, e: 0.8 }, { w: 'chào', s: 2.4, e: 2.9 }];

async function make(opts) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m201-'));
  const src = path.join(tmp, 'clip.mp4'); fs.writeFileSync(src, 'x');
  const d = path.join(tmp, 'proj'), calls = [];
  const run = async (cmd, argv) => {
    calls.push([path.basename(cmd), ...argv]);
    const script = path.basename(argv.find(a => /\.py$/.test(a)) || '');
    if (script === 'transcribe.py') fs.writeFileSync(path.join(d, 'work/words_raw.json'), JSON.stringify(WORDS));
    if (script === 'cut.py') fs.writeFileSync(path.join(d, 'work/words.json'), JSON.stringify(WORDS));
    if (script === 'captions.py') fs.writeFileSync(path.join(d, 'work/captions.json'), JSON.stringify([{ t0: 0.5, t1: 2.9, words: WORDS }]));
    if (path.basename(cmd) === 'ffmpeg') for (let i = 1; i <= 90; i++) fs.writeFileSync(path.join(d, `work/frames/${String(i).padStart(5, '0')}.jpg`), '');
    return '';
  };
  await newProject({ video: src, dir: d, orient: 'vertical', pack: 'slate', title: 'Thử', ...opts }, { run });
  return { tl: JSON.parse(fs.readFileSync(path.join(d, 'timeline.json'), 'utf8')), cut: calls.find(c => c.some(a => /cut\.py$/.test(a))) };
}

test('Video mới tự làm: giữ nguyên cả clip, không nhạc nền, đánh dấu manual để Studio không tự dựng', async () => {
  const { tl, cut } = await make({ manual: true });
  assert.ok(cut.includes('--keep'), 'cut.py chạy --keep (không cắt khoảng lặng)');
  assert.deepEqual(tl.audio.music, [], 'nhạc là việc người dùng chọn');
  assert.equal(tl.audio.voice, 'work/aroll.mp4');
  assert.equal(tl._starter.manual, true);
  assert.equal(tl.captions, 'work/captions.json', 'vẫn có phụ đề nháp từ lời thoại');
});

test('Tự lái / CLI (không manual): vẫn cắt khoảng lặng và có nhạc nền như cũ', async () => {
  const { tl, cut } = await make({});
  assert.ok(!cut.includes('--keep'));
  assert.equal(tl.audio.music.length, 1);
  assert.equal(tl._starter.manual, undefined);
  const { cut: c2 } = await make({ manual: 'true' }); // chỉ true thật mới là tự làm
  assert.ok(!c2.includes('--keep'));
});

test('Studio: hộp Video mới gửi manual, lúc mở không áp công thức gói cho dự án tự làm, có lối sang Tự lái', () => {
  const s = read('studio/studio.js');
  assert.match(s, /api\('\/api\/new', \{[^}]*manual: true \}/);
  assert.match(s, /if \(!built && st\.manual\) \{[^}]*\}[^\n]*saveNow\(\); \}\n\s*else if \(!built\)/);
  assert.match(s, /id="nap"[^<]*dùng Tự lái/);
  assert.doesNotMatch(s, /Tự làm: nhận giọng → cắt khoảng lặng/);
  assert.match(read('scripts/cut.py'), /--keep/);
});
