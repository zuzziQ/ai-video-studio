// M63: Low build bugs from the end-to-end run on sample/video-goc.mov (qa-reports/2026-11-15/video-e2e.md L1, L2).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { applyDeterministic } from '../ai_qc.mjs';
import frames from '../../studio/routes/63_frames.mjs';

test('M63 L1: QC "nhạc quá nhỏ" tự tăng gain nhạc, "nhạc át giọng" vẫn hạ', () => {
  const tl = { width: 1080, height: 1920, duration: 20, scenes: [], audio: { music: [{ t0: 0, t1: 20, mood: 'tech', gain: -18 }] } };
  const P = { samples: [] };
  let fixed = applyDeterministic(tl, [], [{ t: 0, kind: 'music_quiet', severity: 'low', target: 'music', need_db: 8.2 }], P, new Set());
  assert.equal(tl.audio.music[0].gain, -9.8);
  assert.deepEqual([...fixed][0].fix, { op: 'gain', db: 8.2 });
  fixed = applyDeterministic(tl, [], [{ t: 0, kind: 'music_masking', severity: 'med', target: 'music', need_db: 4 }], P, new Set());
  assert.equal(tl.audio.music[0].gain, -13.8);
  const src = fs.readFileSync(new URL('../ai_qc.mjs', import.meta.url), 'utf8');
  assert.match(src, /music_vs_voice_db < -30/, 'audioPass phải báo music_quiet khi nhạc thấp hơn giọng > 30 dB');
});

function fakeCtx(dir) {
  const out = {};
  const ctx = {
    project: { dir, tlFile: path.join(dir, 'timeline.json') }, job: { step: '', progress: 0 },
    // same as studio/server.mjs under(): it URL-decodes, which broke "%05d" frame patterns in the first version of the route
    under: (root, rel) => { let r; try { r = decodeURIComponent(rel); } catch { return null; } const p = path.resolve(root, r); return p.startsWith(root + path.sep) ? p : null; },
    readProject: () => ({ timeline: JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8')) }),
    json: (res, o, c = 200) => { out.body = o; out.code = c; },
    run: (cmd, argv) => { execFileSync(cmd, argv, { cwd: dir, stdio: 'pipe' }); return Promise.resolve(); },
    startJob: (k, fn, b) => { out.done = fn(b); return true; },
  };
  return { ctx, out };
}
const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'pipe' }); return true; } catch { return false; } })();

test('M63 L2: dự án thiếu work/frames được phát hiện và tạo lại từ video', { skip: !hasFfmpeg && 'không có ffmpeg' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m63-'));
  try {
    fs.mkdirSync(path.join(dir, 'work'));
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x568:rate=30:duration=1', '-pix_fmt', 'yuv420p', path.join(dir, 'work', 'aroll.mp4')]);
    fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({ width: 1080, height: 1920, fps: 30, aroll: { frames: 'work/frames/%05d.jpg' },
      audio: { voice: 'work/aroll.mp4' }, clips: [{ src: { seq: 'work/frames/%05d.jpg', fps: 30, count: 30 }, audio: 'work/aroll.mp4', in: 0, out: 1 }, { src: { seq: '../x/%05d.jpg' } }] }));
    const { ctx, out } = fakeCtx(dir), h = frames(ctx);
    assert.equal(await h({ method: 'GET' }, null, '/api/other'), false);
    await h({ method: 'GET' }, null, '/api/frames/check');
    assert.deepEqual(out.body, [{ seq: 'work/frames/%05d.jpg', fps: 30, src: 'work/aroll.mp4' }], 'chuỗi ngoài dự án phải bị bỏ qua');
    await h({ method: 'GET' }, null, '/api/frames/rebuild');
    assert.equal(out.code, 405);
    await h({ method: 'POST' }, null, '/api/frames/rebuild');
    await out.done;
    const jpg = fs.readdirSync(path.join(dir, 'work', 'frames'));
    assert.ok(jpg.length >= 29 && jpg.length <= 31, `${jpg.length} khung`);
    await h({ method: 'GET' }, null, '/api/frames/check');
    assert.deepEqual(out.body, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
