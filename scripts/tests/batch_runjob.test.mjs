// Test M68: vòng thật của batch.mjs runJob (lô song song) với build/render giả — kế hoạch, giữ/nhả lượt render cả máy,
// --workers + AVS_RENDER_SLOTS=0 cho render con, lỗi từng dòng, tạm dừng bằng .pause, status.parallel.
// Chạy: node --test scripts/tests/batch_runjob.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-runjob-'));
process.env.AVS_HOME = HOME;
// S12 M100: runJob giao từng dòng vào Thanh pham/ của Kho Chung mặc định (~/Videos/…): giữ trong thư mục tạm
process.env.USERPROFILE = HOME; process.env.HOME = HOME;
for (const k of ['AVS_PERF_PROFILE', 'AVS_ENCODER', 'AVS_RENDER_SLOTS', 'AVS_RENDER_PRIORITY', 'AVS_BATCH_PARALLEL']) delete process.env[k];
const { runJob } = await import('../batch.mjs');
const P = await import('../perf_profile.mjs');
after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const HW = { cores: { physical: 6, logical: 12 }, ram: { total_gb: 32, free_gb: 12 }, gpu: [{ name: 'GTX', vram_mb: 6144, vram_free_mb: 5300 }],
  chrome: { mode: 'gpu' }, encoder: { final: 'nvenc', segment: 'nvenc' } };
const CAN_BANG = { profile: 'can-bang', encoder: 'auto', priority: 'normal', slots: 1, workers: null };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let seq = 0;
function makeJob(n) {
  const dir = path.join(HOME, `lo${++seq}`); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'rows.csv'), 'title\n' + Array.from({ length: n }, (_, i) => `Ban ${i + 1}`).join('\n') + '\n');
  const jf = path.join(dir, 'job.json');
  fs.writeFileSync(jf, JSON.stringify({ source: { kind: 'template', id: 'x' }, sheet: path.join(dir, 'rows.csv'), mapping: {}, quality: '1080', out: dir }));
  return { dir, jf, status: () => JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf8')) };
}
// fake build/render: record concurrency, the opts render got, and the machine-wide slots while rendering
function fakes({ failRow = -1, onBuild = () => {}, ms = 25 } = {}) {
  const rec = { now: 0, peak: 0, opts: [], holders: [] };
  return {
    rec,
    build: async (job, i) => { onBuild(i, job); const d = path.join(job.out, `row${i}`); fs.mkdirSync(path.join(d, 'out'), { recursive: true }); return { dir: d, tl: { title: `Ban ${i + 1}` } }; },
    render: async (dir, tl, onProgress, opts) => {
      rec.now++; rec.peak = Math.max(rec.peak, rec.now); rec.opts.push(opts); rec.holders.push(P.slotHolders().map(h => !!h.batch));
      onProgress(.5, 'render'); await sleep(ms); rec.now--;
      if (dir.endsWith(`row${failRow}`)) throw new Error('render hỏng');
      const out = path.join(dir, 'out', 'v.mp4'); fs.writeFileSync(out, 'x'); return out;
    },
  };
}

test('song song: 6 dòng cùng lúc × 1 worker, lô giữ đúng một lượt, render con AVS_RENDER_SLOTS=0', async () => {
  const J = makeJob(6), f = fakes();
  const st = await runJob(J.jf, { build: f.build, render: f.render, hw: HW, perf: CAN_BANG, signals: false });
  assert.equal(f.rec.peak, 6);
  for (const o of f.rec.opts) { assert.equal(o.workers, 1); assert.equal(o.env.AVS_RENDER_SLOTS, '0'); }
  for (const h of f.rec.holders) assert.deepEqual(h, [true], 'trong lúc render: đúng một chỗ, của lô');
  assert.deepEqual(st.rows.map(r => r.state), Array(6).fill('done'));
  assert.deepEqual(J.status().parallel, { parallel: 6, workers: 1, why: J.status().parallel.why });
  assert.equal(P.slotHolders().length, 0, 'hết lô thì nhả lượt');
});

test('kế hoạch 1 (tiet-kiem): không giữ lượt, render như cũ (không --workers, không env), tuần tự', async () => {
  const J = makeJob(4), f = fakes();
  await runJob(J.jf, { build: f.build, render: f.render, hw: HW, perf: { ...CAN_BANG, profile: 'tiet-kiem', priority: 'below_normal', workers: 2 }, signals: false });
  assert.equal(f.rec.peak, 1);
  for (const o of f.rec.opts) { assert.equal(o.workers, null); assert.equal(o.env, null); }
  for (const h of f.rec.holders) assert.deepEqual(h, [], 'lô không giữ lượt: từng render.mjs tự xin');
  assert.equal(J.status().parallel, undefined);
});

test('kế hoạch 1 sau khi dò máy (VRAM thấp): lượt được nhả trước khi render', async () => {
  const J = makeJob(3), f = fakes();
  await runJob(J.jf, { build: f.build, render: f.render, hw: { ...HW, gpu: [{ vram_free_mb: 1500 }] }, perf: CAN_BANG, signals: false });
  assert.equal(f.rec.peak, 1);
  for (const h of f.rec.holders) assert.deepEqual(h, []);
});

test('một dòng lỗi không dừng dòng khác', async () => {
  const J = makeJob(5), f = fakes({ failRow: 2 });
  const st = await runJob(J.jf, { build: f.build, render: f.render, hw: HW, perf: CAN_BANG, signals: false });
  assert.deepEqual(st.rows.map(r => r.state), ['done', 'done', 'error', 'done', 'done']);
  assert.match(st.rows[2].error, /render hỏng/);
});

test('tạm dừng (.pause): không bắt đầu dòng mới, dòng đang render xong, dòng còn lại pending, .pause được dọn', async () => {
  const J = makeJob(9), pause = path.join(J.dir, '.pause');
  // 9 dòng, 6 cùng lúc: tạm dừng trong lúc dựng dòng thứ 3 → 3 dòng đã bắt đầu chạy xong, 6 dòng sau chờ
  const f = fakes({ ms: 60, onBuild: i => { if (i === 2) fs.writeFileSync(pause, ''); } });
  const st = await runJob(J.jf, { build: f.build, render: f.render, hw: HW, perf: CAN_BANG, signals: false });
  assert.deepEqual(st.rows.map(r => r.state), [...Array(3).fill('done'), ...Array(6).fill('pending')]);
  assert.ok(!fs.existsSync(pause));
  // Chạy tiếp: làm nốt 6 dòng
  const g = fakes();
  const st2 = await runJob(J.jf, { build: g.build, render: g.render, hw: HW, perf: CAN_BANG, signals: false });
  assert.deepEqual(st2.rows.map(r => r.state), Array(9).fill('done'));
  assert.equal(g.rec.opts.length, 6, 'chỉ render 6 dòng còn lại');
  assert.equal(J.status().parallel.parallel, 6);
});
