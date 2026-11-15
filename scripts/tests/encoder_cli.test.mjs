// M65: encoder tự dò cho các khâu mã hoá phụ (scripts/encoder_cli.mjs). Không cần GPU: pickEncoder giả.
// Chạy: node --test scripts/tests/encoder_cli.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { videoArgs, argsFor, parseCli } from '../encoder_cli.mjs';
import { NVENC_CQ_OFFSET } from '../render_hw.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), SCRIPTS = path.join(HERE, '..');
const X264 = ['-c:v', 'libx264', '-crf', '16', '-preset', 'fast'];
const pick = kind => () => ({ kind, why: 'test' });

test('M65: có NVENC → args h264_nvenc, cq = crf + NVENC_CQ_OFFSET, fallback = args x264 cũ nguyên văn', () => {
  const v = videoArgs({ crf: 16, preset: 'fast', x264: X264, pick: pick('nvenc') });
  assert.equal(v.kind, 'nvenc'); assert.equal(v.hw, true);
  assert.equal(v.args[v.args.indexOf('-c:v') + 1], 'h264_nvenc');
  assert.equal(v.args[v.args.indexOf('-cq') + 1], String(16 + NVENC_CQ_OFFSET));
  assert.deepEqual(v.fallback, X264);
});

test('M65: x264 (AVS_ENCODER=x264 hoặc không có GPU) → đúng args cũ, không thêm cờ', () => {
  const v = videoArgs({ crf: 16, x264: X264, pick: pick('x264') });
  assert.equal(v.hw, false);
  assert.deepEqual(v.args, X264);
  assert.notEqual(v.args, X264, 'bản sao, không trả mảng gốc');
});

test('M65: pickEncoder ném lỗi → libx264, không vỡ khâu', () => {
  const v = videoArgs({ crf: 20, x264: X264, pick: () => { throw new Error('ffmpeg missing'); } });
  assert.equal(v.kind, 'x264'); assert.deepEqual(v.args, X264);
});

test('M65: argsFor không có args cũ → encoderArgs libx264 theo crf/preset', () => {
  assert.deepEqual(argsFor('x264', { crf: 18, preset: 'veryfast' }), ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p']);
});

test('M65: parseCli kiểm input', () => {
  assert.deepEqual(parseCli(['args', '--use', 'derive', '--crf', '16', '--preset', 'fast']), { use: 'derive', crf: 16, preset: 'fast' });
  assert.deepEqual(parseCli(['args']), { use: 'derive', crf: 20, preset: 'medium' });
  assert.throws(() => parseCli(['args', '--crf', '99']));
  assert.throws(() => parseCli(['args', '--crf', '1.5']));
  assert.throws(() => parseCli(['args', '--preset', 'fast;rm']));
  assert.throws(() => parseCli(['probe']));
});

test('M65: CLI với AVS_ENCODER=x264 in JSON args libx264, không mở Chrome', () => {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'encoder_cli.mjs'), 'args', '--use', 'derive', '--crf', '16', '--preset', 'fast'],
    { env: { ...process.env, AVS_ENCODER: 'x264' }, encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), ['-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p']);
  const bad = spawnSync(process.execPath, [path.join(SCRIPTS, 'encoder_cli.mjs'), 'args', '--crf', 'x'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});

test('M65: các khâu mã hoá phụ không còn gọi cứng libx264 ngoài args dự phòng', () => {
  for (const f of ['broll.mjs', 'ai_broll.mjs', 'broll_lib.mjs', 'highlights.mjs']) {
    assert.match(fs.readFileSync(path.join(SCRIPTS, f), 'utf8'), /videoArgs\(/, f);
  }
  for (const f of ['cut.py', 'broll_fetch.py']) assert.match(fs.readFileSync(path.join(SCRIPTS, f), 'utf8'), /run_encode\(/, f);
});
