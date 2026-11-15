// Test M68 lô song song: batchPlan (công thức theo số đo M66), runPool, lô giữ một lượt render cả máy, huỷ dọn cả cây.
// Chạy: node --test scripts/tests/batch_parallel.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-batchpar-'));
process.env.AVS_HOME = HOME;
for (const k of ['AVS_PERF_PROFILE', 'AVS_ENCODER', 'AVS_RENDER_SLOTS', 'AVS_RENDER_PRIORITY']) delete process.env[k];
const B = await import('../batch_parallel.mjs');
const P = await import('../perf_profile.mjs');
const { killTree } = await import('../platform.mjs');
after(() => fs.rmSync(HOME, { recursive: true, force: true }));

// Máy đo M66: 6 nhân thật, GTX 1660 Ti 5,2 GB VRAM trống, RAM rộng, NVENC, Chrome GPU.
const HW = { cores: { physical: 6, logical: 12 }, ram: { total_gb: 32, free_gb: 12 }, gpu: [{ name: 'GTX 1660 Ti', vram_mb: 6144, vram_free_mb: 5300 }],
  chrome: { mode: 'gpu' }, encoder: { final: 'nvenc', segment: 'nvenc' } };
const PERF = { profile: 'can-bang', encoder: 'auto', priority: 'normal', slots: 1 };
const plan = (o = {}) => B.batchPlan({ n: 6, hw: HW, perf: PERF, load: {}, ...o });
const pw = r => [r.parallel, r.workersEach];

test('batchPlan theo công thức M66: P = min(N, B), W = clamp(B/P, 1, 4)', () => {
  assert.deepEqual(pw(plan()), [6, 1]);
  assert.deepEqual(pw(plan({ n: 10 })), [6, 1]);
  assert.deepEqual(pw(plan({ n: 3 })), [3, 2]);
  assert.deepEqual(pw(plan({ n: 2 })), [2, 2], 'W = 3 hạ về 2 (lệch pts NVENC, M66 mục 4)');
  assert.equal(plan().budget, 6);
  assert.match(plan().why, /6 bản cùng lúc × 1 worker/);
  // 8 nhân, lô 2 → W kẹp 4
  assert.deepEqual(pw(plan({ n: 2, hw: { ...HW, cores: { physical: 8 }, gpu: [{ vram_free_mb: 12000 }] } })), [2, 4]);
});

test('batchPlan: tuy-chinh có số worker là trần ngân sách; slots > 1 thì tắt', () => {
  const t = plan({ perf: { ...PERF, profile: 'tuy-chinh', workers: 2 } });
  assert.deepEqual(pw(t), [2, 1]); assert.match(t.why, /tuỳ chỉnh 2 worker/);
  assert.deepEqual(pw(plan({ perf: { ...PERF, profile: 'tuy-chinh', workers: null } })), [6, 1], 'tuy-chinh tự động: như can-bang');
  assert.equal(plan({ perf: { ...PERF, profile: 'tuy-chinh', workers: 1 } }).parallel, 1);
  assert.equal(plan({ perf: { ...PERF, slots: 2 } }).parallel, 1);
  assert.deepEqual(pw(plan({ perf: { ...PERF, slots: 0 } })), [6, 1], 'slots 0 (không điều phối) vẫn song song');
});

test('batchPlan tắt (1 bản, như cũ) khi: 1 bản, tiet-kiem, ưu tiên thấp, SwiftShader, x264, đang có render khác', () => {
  const offs = [plan({ n: 1 }), plan({ perf: { ...PERF, profile: 'tiet-kiem' } }), plan({ perf: { ...PERF, priority: 'below_normal' } }),
    plan({ hw: { ...HW, chrome: { mode: 'swiftshader' } } }), plan({ hw: { ...HW, encoder: { final: 'x264' } } }),
    plan({ perf: { ...PERF, profile: 'chat-luong', encoder: 'x264' } }), plan({ hw: { ...HW, encoder: null, gpu: [] } }), plan({ load: { renders_running: 1 } })];
  for (const r of offs) { assert.equal(r.parallel, 1, r.why); assert.equal(r.workersEach, null); assert.ok(r.why); }
});

test('batchPlan: cổng VRAM, RAM, 720p, 4K', () => {
  // (3 − 1) / 0,55 → 3 Chrome 1080p
  const v = plan({ hw: { ...HW, gpu: [{ vram_free_mb: 3 * 1024 }] } });
  assert.deepEqual(pw(v), [3, 1]); assert.match(v.why, /VRAM trống 3\.0 GB chỉ đủ 3 Chrome/);
  // 720p: (3 − 1) / 0,45 → 4
  assert.deepEqual(pw(plan({ W: 720, H: 1280, hw: { ...HW, gpu: [{ vram_free_mb: 3 * 1024 }] } })), [4, 1]);
  // RAM 4 GB trống: (4 − 1,5) / 0,7 → 3
  const r = plan({ hw: { ...HW, ram: { free_gb: 4 } } });
  assert.deepEqual(pw(r), [3, 1]); assert.match(r.why, /RAM trống 4 GB/);
  // VRAM chỉ đủ 1 → tắt
  assert.equal(plan({ hw: { ...HW, gpu: [{ vram_free_mb: 1600 }] } }).parallel, 1);
  // 4K: mỗi bản tối đa 3 worker
  const k = plan({ n: 2, W: 2160, H: 3840, hw: { ...HW, cores: { physical: 16 }, gpu: [{ vram_free_mb: 24000 }], ram: { free_gb: 64 } } });
  assert.ok(k.workersEach <= 3, JSON.stringify(k));
  assert.deepEqual(B.batchPixels('720'), [720, 1280]); assert.deepEqual(B.batchPixels('1080'), [1080, 1920]); assert.deepEqual(B.batchPixels(undefined), [1080, 1920]);
});

test('runPool: tối đa P cùng lúc, kết quả theo thứ tự, P = 1 tuần tự', async () => {
  for (const p of [1, 3]) {
    let now = 0, peak = 0;
    const out = await B.runPool([5, 1, 4, 2, 3, 0], p, async (x, i) => { now++; peak = Math.max(peak, now); await new Promise(r => setTimeout(r, x * 5)); now--; return i * 10; });
    assert.deepEqual(out, [0, 10, 20, 30, 40, 50]); assert.equal(peak, p);
  }
  assert.deepEqual(await B.runPool([], 4, async () => 1), []);
});

test('lô giữ MỘT lượt: export khác phải chờ, render con (AVS_RENDER_SLOTS=0) không xếp hàng', async () => {
  const env = { ...process.env, AVS_HOME: HOME };
  const hold = await B.holdBatchSlot({ perf: { slots: 1 }, env });
  assert.equal(P.slotHolders({ env }).length, 1);
  assert.equal(P.slotHolders({ env })[0].batch, true);
  assert.equal(P.tryTakeSlot({ slots: 1, env, pid: process.pid }), null, 'Studio export / hàng đợi khác phải chờ lô');
  // render con của lô: resolvePerf đọc AVS_RENDER_SLOTS=0 → acquireRenderSlot không điều phối, không chờ
  const childPerf = P.resolvePerf({ env: { ...hold.childEnv }, perf: { profile: 'can-bang', custom: {} } });
  assert.equal(childPerf.slots, 0);
  const t0 = Date.now(), s = await P.acquireRenderSlot({ slots: childPerf.slots, env });
  assert.ok(Date.now() - t0 < 200); s.release();
  assert.equal(P.slotHolders({ env }).length, 1, 'con không ghi thêm chỗ');
  hold.release();
  assert.equal(P.slotHolders({ env }).length, 0);
  const tok = P.tryTakeSlot({ slots: 1, env }); assert.ok(tok, 'hết lô thì lượt khác vào được'); P.releaseSlot(tok, { env });
});

const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
test('huỷ giữa chừng (killTree như hàng đợi): dọn hết lô + render con + cháu, chỗ được dọn', async () => {
  const pidsF = path.join(HOME, 'pids.txt'), envF = path.join(HOME, 'env.txt');
  fs.writeFileSync(pidsF, ''); fs.writeFileSync(envF, '');
  const p = spawn(process.execPath, [path.join(HERE, 'fixtures/fake_batch.mjs')], { detached: true, stdio: 'ignore',
    env: { ...process.env, AVS_HOME: HOME, FAKE_BATCH_PIDS: pidsF, FAKE_BATCH_ENV: envF } });
  const read = () => fs.readFileSync(pidsF, 'utf8').split('\n').filter(Boolean).map(l => l.split(' ')).map(([k, v]) => ({ k, pid: +v }));
  const t0 = Date.now();
  while (read().length < 7 && Date.now() - t0 < 20000) await new Promise(r => setTimeout(r, 100));
  const all = read();
  assert.equal(all.filter(x => x.k === 'child').length, 3, '3 render chạy cùng lúc');
  assert.equal(all.filter(x => x.k === 'grand').length, 3);
  assert.deepEqual(fs.readFileSync(envF, 'utf8').trim().split('\n'), ['0', '0', '0'], 'render con nhận AVS_RENDER_SLOTS=0');
  assert.equal(P.slotHolders({ env: { ...process.env, AVS_HOME: HOME } }).length, 1, 'lô giữ đúng một chỗ');
  await killTree(p, { group: true });
  const t1 = Date.now();
  while (all.some(x => alive(x.pid)) && Date.now() - t1 < 10000) await new Promise(r => setTimeout(r, 100));
  for (const x of all) assert.ok(!alive(x.pid), `${x.k} ${x.pid} còn sống`);
  assert.equal(P.slotHolders({ env: { ...process.env, AVS_HOME: HOME } }).length, 0, 'chỗ của pid chết được bỏ qua');
  assert.ok(P.tryTakeSlot({ slots: 1, env: { ...process.env, AVS_HOME: HOME } }), 'lượt sau vào được');
});

test('AVS_BATCH_PARALLEL: 1 tắt, N giới hạn số bản', () => {
  assert.equal(B.parallelLimit({ AVS_BATCH_PARALLEL: '1' }), 1); assert.equal(B.parallelLimit({ AVS_BATCH_PARALLEL: '3' }), 3);
  for (const v of ['', '0', 'abc', '-2', undefined]) assert.equal(B.parallelLimit({ AVS_BATCH_PARALLEL: v }), null, String(v));
  assert.equal(plan({ limit: 1 }).parallel, 1);
  assert.deepEqual(pw(plan({ limit: 3 })), [3, 2]);
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
test('pipeline: dựng lần lượt, render tối đa P, lỗi từng dòng không dừng dòng khác', async () => {
  for (const P of [1, 3]) {
    let building = 0, buildPeak = 0, rendering = 0, renderPeak = 0;
    const done = [], errs = [], order = [];
    const r = await B.pipeline({
      items: [0, 1, 2, 3, 4, 5, 6], parallel: P,
      build: async i => { building++; buildPeak = Math.max(buildPeak, building); order.push(i); await sleep(2); building--; if (i === 2) throw new Error('dựng hỏng'); return { i }; },
      render: async (i, b) => { assert.equal(b.i, i); rendering++; renderPeak = Math.max(renderPeak, rendering); await sleep(20 + (i % 3) * 5); rendering--; if (i === 4) throw new Error('render hỏng'); return 'out' + i; },
      onDone: (i, out) => done.push([i, out]), onError: (i, e) => errs.push([i, e.message]),
    });
    assert.equal(r.stopped, false);
    assert.equal(buildPeak, 1, 'dựng lần lượt'); assert.equal(renderPeak, P, `render tối đa ${P}`);
    assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(done.map(d => d[0]).sort(), [0, 1, 3, 5, 6]);
    assert.deepEqual(errs.sort(), [[2, 'dựng hỏng'], [4, 'render hỏng']]);
  }
});

test('pipeline: tạm dừng = không bắt đầu dòng mới, dòng đang render chạy xong; handler ném lỗi không vỡ vòng', async () => {
  let stop = false; const started = [], done = [];
  const r = await B.pipeline({
    items: [0, 1, 2, 3, 4, 5], parallel: 3, shouldStop: () => stop,
    build: async i => { started.push(i); if (i === 2) stop = true; return i; },
    render: async i => { await sleep(30); return i; },
    onDone: i => { done.push(i); throw new Error('ghi status hỏng'); },
  });
  assert.equal(r.stopped, true);
  assert.deepEqual(started, [0, 1, 2]); assert.deepEqual(done.sort(), [0, 1, 2], 'ba dòng đang render đều xong');
});
