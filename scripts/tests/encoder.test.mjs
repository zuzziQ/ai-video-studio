// M52: hardware H.264 encoder chosen by a cached test encode, AVS_ENCODER override, libx264 fallback (scripts/render_hw.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AVS_CHROME_SHELL = '0';
const load = () => import(`../render_hw.mjs?enc=${Math.random()}`);

// Fake spawnSync: `ok` = encoders whose probe succeeds; records every encoder probed.
function fakeRun({ ok = ['nvenc'], ffmpeg = 'ffmpeg version 9.0.2', driver = '621.24' } = {}) {
  const probes = [];
  const run = (cmd, argv) => {
    if (cmd === 'nvidia-smi') return driver ? { status: 0, stdout: `${driver}\n` } : { error: new Error('ENOENT'), status: null };
    if (argv.includes('-version')) return { status: 0, stdout: `${ffmpeg} Copyright\nbuilt with gcc\n` };
    const codec = argv[argv.indexOf('-c:v') + 1], kind = { h264_nvenc: 'nvenc', h264_qsv: 'qsv', h264_videotoolbox: 'videotoolbox', libx264: 'x264' }[codec];
    probes.push(kind);
    return ok.includes(kind) ? { status: 0, stderr: '' } : { status: 1, stderr: `[${codec}] Cannot load nvcuda.dll\nError while opening encoder\n` };
  };
  return { run, probes };
}
const tmpCache = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-enc-')), 'encoders.json');

test('M52: AVS_ENCODER đọc tên và bí danh, sai/không đặt = auto', async () => {
  const { encoderWanted } = await load();
  assert.equal(encoderWanted({}), 'auto');
  for (const [v, k] of [['nvenc', 'nvenc'], ['H264_NVENC', 'nvenc'], ['qsv', 'qsv'], ['videotoolbox', 'videotoolbox'], ['vt', 'videotoolbox'],
    ['x264', 'x264'], ['libx264', 'x264'], ['0', 'x264'], [' auto ', 'auto'], ['vaapi', 'auto']]) assert.equal(encoderWanted({ AVS_ENCODER: v }), k, v);
});

test('M52: auto dùng NVENC khi dò được, lưu cache, lần sau không dò lại', async () => {
  const { pickEncoder } = await load();
  const cachePath = tmpCache(), f = fakeRun();
  assert.deepEqual(pickEncoder({ use: 'segment', env: {}, platform: 'win32', run: f.run, cachePath, quiet: true }), { kind: 'nvenc', why: 'auto' });
  assert.deepEqual(f.probes, ['nvenc']);
  const c = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  assert.match(c.key, /ffmpeg version 9\.0\.2.*nvidia 621\.24/);
  assert.equal(c.results.nvenc.ok, true);
  assert.equal(pickEncoder({ use: 'derive', env: {}, platform: 'win32', run: f.run, cachePath, quiet: true }).kind, 'nvenc');
  assert.deepEqual(f.probes, ['nvenc'], 'cache trùng khoá: không dò lại');
});

test('M52: đổi driver hoặc ffmpeg thì dò lại', async () => {
  const { pickEncoder } = await load();
  const cachePath = tmpCache();
  pickEncoder({ env: {}, platform: 'win32', run: fakeRun().run, cachePath, quiet: true });
  const newer = fakeRun({ driver: '630.10' });
  pickEncoder({ env: {}, platform: 'win32', run: newer.run, cachePath, quiet: true });
  assert.deepEqual(newer.probes, ['nvenc']);
  const ff = fakeRun({ driver: '630.10', ffmpeg: 'ffmpeg version 9.1' });
  pickEncoder({ env: {}, platform: 'win32', run: ff.run, cachePath, quiet: true });
  assert.deepEqual(ff.probes, ['nvenc']);
});

test('M52: NVENC dò lỗi → thử QSV → lùi libx264; kết quả lỗi cũng được cache', async () => {
  const { pickEncoder } = await load();
  const cachePath = tmpCache(), f = fakeRun({ ok: [] });
  const r = pickEncoder({ env: {}, platform: 'win32', run: f.run, cachePath, quiet: true });
  assert.equal(r.kind, 'x264');
  assert.deepEqual(f.probes, ['nvenc', 'qsv']);
  const c = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  assert.equal(c.results.nvenc.ok, false); assert.match(c.results.nvenc.err, /nvcuda/);
  pickEncoder({ env: {}, platform: 'win32', run: f.run, cachePath, quiet: true });
  assert.deepEqual(f.probes, ['nvenc', 'qsv'], 'lỗi đã cache: không dò lại');
  const q = fakeRun({ ok: ['qsv'] });
  assert.equal(pickEncoder({ env: {}, platform: 'win32', run: q.run, cachePath: tmpCache(), quiet: true }).kind, 'qsv');
});

test('M52: macOS chỉ thử VideoToolbox; ép encoder hỏng thì vẫn lùi libx264', async () => {
  const { pickEncoder } = await load();
  const mac = fakeRun({ ok: ['videotoolbox'] });
  assert.equal(pickEncoder({ env: {}, platform: 'darwin', run: mac.run, cachePath: tmpCache(), quiet: true }).kind, 'videotoolbox');
  assert.deepEqual(mac.probes, ['videotoolbox']);
  const f = fakeRun({ ok: ['nvenc'] });
  const forced = pickEncoder({ env: { AVS_ENCODER: 'qsv' }, platform: 'win32', run: f.run, cachePath: tmpCache(), quiet: true });
  assert.deepEqual(forced.kind, 'x264');
  assert.deepEqual(f.probes, ['qsv']);
});

test('M52: AVS_ENCODER=x264 không dò gì; ép nvenc thì chỉ dò nvenc', async () => {
  const { pickEncoder } = await load();
  const f = fakeRun();
  assert.deepEqual(pickEncoder({ env: { AVS_ENCODER: 'x264' }, platform: 'win32', run: f.run, cachePath: tmpCache(), quiet: true }), { kind: 'x264', why: 'AVS_ENCODER=x264' });
  assert.deepEqual(f.probes, []);
  assert.deepEqual(pickEncoder({ env: { AVS_ENCODER: 'nvenc' }, platform: 'linux', run: f.run, cachePath: tmpCache(), quiet: true }), { kind: 'nvenc', why: 'AVS_ENCODER=nvenc' });
});

test('M52: cache hỏng hoặc không ghi được thì vẫn chọn được', async () => {
  const { pickEncoder } = await load();
  const cachePath = tmpCache();
  fs.writeFileSync(cachePath, '{not json');
  assert.equal(pickEncoder({ env: {}, platform: 'win32', run: fakeRun().run, cachePath, quiet: true }).kind, 'nvenc');
  fs.writeFileSync(cachePath, JSON.stringify({ key: 'x', results: null }));
  assert.equal(pickEncoder({ env: {}, platform: 'win32', run: fakeRun().run, cachePath, quiet: true }).kind, 'nvenc');
  const dir = path.dirname(tmpCache()), blocked = path.join(dir, 'file');
  fs.writeFileSync(blocked, '');
  assert.equal(pickEncoder({ env: {}, platform: 'win32', run: fakeRun().run, cachePath: path.join(blocked, 'encoders.json'), quiet: true }).kind, 'nvenc');
});

test('M52: tham số ffmpeg theo encoder', async () => {
  const { encoderArgs, NVENC_CQ_OFFSET } = await load();
  const x = encoderArgs('x264', { preset: 'veryfast', crf: 17, threads: 3 });
  assert.deepEqual(x, ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-threads', '3']);
  const n = encoderArgs('nvenc', { preset: 'veryfast', crf: 17, threads: 3 });
  assert.equal(n[n.indexOf('-c:v') + 1], 'h264_nvenc');
  assert.equal(n[n.indexOf('-cq') + 1], String(17 + NVENC_CQ_OFFSET));
  assert.ok(n.includes('-b:v') && n[n.indexOf('-b:v') + 1] === '0' && n.includes('yuv420p') && !n.includes('-threads'));
  assert.equal(encoderArgs('nvenc', { crf: 18 })[encoderArgs('nvenc', { crf: 18 }).indexOf('-cq') + 1], String(18 + NVENC_CQ_OFFSET));
  assert.ok(encoderArgs('qsv').includes('h264_qsv'));
  assert.ok(encoderArgs('videotoolbox').includes('h264_videotoolbox'));
});
