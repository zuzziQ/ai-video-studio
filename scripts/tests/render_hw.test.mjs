// M50/M51: Chrome GPU flags with SwiftShader fallback, worker plan by physical cores (scripts/render_hw.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import(`../render_hw.mjs?x=${Math.random()}`); // fresh module: the GPU decision is per process

test('M50: AVS_RENDER_GPU=0/false/off tắt GPU, mặc định bật', async () => {
  const { gpuWanted } = await load();
  assert.equal(gpuWanted({}), true);
  assert.equal(gpuWanted({ AVS_RENDER_GPU: '1' }), true);
  for (const v of ['0', 'false', 'OFF', ' no ']) assert.equal(gpuWanted({ AVS_RENDER_GPU: v }), false, v);
});

test('M50: renderer phần mềm bị nhận ra, GPU thật thì không', async () => {
  const { isSoftwareRenderer } = await load();
  for (const r of ['', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
    'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)', 'llvmpipe (LLVM 15.0.7, 256 bits)'])
    assert.equal(isSoftwareRenderer(r), true, r);
  for (const r of ['ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti (0x00002182) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)'])
    assert.equal(isSoftwareRenderer(r), false, r);
});

test('M50: cờ Chrome theo chế độ và hệ điều hành', async () => {
  const { chromeArgs, BACKGROUND_FLAGS } = await load();
  const win = chromeArgs('gpu', BACKGROUND_FLAGS, 'win32');
  assert.ok(win.includes('--use-angle=d3d11') && !win.includes('--use-angle=swiftshader'));
  assert.ok(win.includes('--disable-renderer-backgrounding') && win.includes('--force-color-profile=srgb'));
  assert.ok(!chromeArgs('gpu', [], 'darwin').some(f => f.startsWith('--use-angle')));
  const sw = chromeArgs('swiftshader', [], 'win32');
  assert.ok(sw.includes('--use-angle=swiftshader') && sw.includes('--enable-unsafe-swiftshader'));
  assert.equal(new Set(win).size, win.length);
});

// Fake puppeteer: every launch records its args; the page reports `renderer` (or launch throws).
function fakePuppeteer({ renderer = 'ANGLE (NVIDIA, GeForce D3D11)', fail = false } = {}) {
  const launches = [];
  return {
    launches,
    async launch(o) {
      const gpu = !o.args.includes('--use-angle=swiftshader');
      launches.push(gpu ? 'gpu' : 'swiftshader');
      if (gpu && fail) throw new Error('GPU process crashed');
      const b = { closed: false, async pages() { return [{ evaluate: async () => (gpu ? renderer : 'SwiftShader') }]; }, async close() { b.closed = true; } };
      return b;
    },
  };
}

test('M50: có GPU thật thì giữ trình duyệt GPU, mở một lần', async () => {
  delete process.env.AVS_RENDER_GPU;
  const { launchChrome, chromeMode } = await load();
  const pp = fakePuppeteer();
  const r = await launchChrome(pp, { quiet: true });
  assert.equal(r.mode, 'gpu'); assert.deepEqual(pp.launches, ['gpu']); assert.equal(chromeMode(), 'gpu');
});

test('M50: renderer phần mềm → đóng, lùi SwiftShader, các worker sau mở thẳng SwiftShader', async () => {
  delete process.env.AVS_RENDER_GPU;
  const { launchChrome } = await load();
  const pp = fakePuppeteer({ renderer: 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11, D3D11)' });
  assert.equal((await launchChrome(pp, { quiet: true })).mode, 'swiftshader');
  assert.equal((await launchChrome(pp, { quiet: true })).mode, 'swiftshader');
  assert.deepEqual(pp.launches, ['gpu', 'swiftshader', 'swiftshader']);
});

test('M50: mở Chrome GPU lỗi → SwiftShader; AVS_RENDER_GPU=0 không thử GPU', async () => {
  delete process.env.AVS_RENDER_GPU;
  let m = await load(), pp = fakePuppeteer({ fail: true });
  assert.equal((await m.launchChrome(pp, { quiet: true })).mode, 'swiftshader');
  assert.deepEqual(pp.launches, ['gpu', 'swiftshader']);
  process.env.AVS_RENDER_GPU = '0';
  try {
    m = await load(); pp = fakePuppeteer();
    assert.equal((await m.launchChrome(pp, { quiet: true })).mode, 'swiftshader');
    assert.deepEqual(pp.launches, ['swiftshader']);
  } finally { delete process.env.AVS_RENDER_GPU; }
});

test('M51: worker theo nhân thật, tối đa 4 (3 trên 1080p), --workers ghi đè', async () => {
  const { renderPlan } = await load();
  const v = { W: 1080, H: 1920, n: 947, fps: 30 };
  assert.deepEqual(renderPlan({ ...v, physical: 6, logical: 12 }), { workers: 4, threads: 3, preset: 'veryfast' });
  assert.equal(renderPlan({ ...v, physical: 16, logical: 32 }).workers, 4);
  assert.equal(renderPlan({ ...v, physical: 4, logical: 8 }).workers, 2);
  assert.deepEqual(renderPlan({ ...v, physical: 2, logical: 4 }), { workers: 1, threads: 0, preset: 'medium' });
  assert.equal(renderPlan({ W: 2160, H: 3840, n: 900, fps: 30, physical: 16, logical: 32 }).workers, 3);
  assert.equal(renderPlan({ ...v, workers: '6', physical: 6, logical: 12 }).workers, 6);
  assert.equal(renderPlan({ ...v, workers: '6', physical: 6, logical: 12 }).threads, 2);
  assert.equal(renderPlan({ ...v, n: 45, physical: 6, logical: 12 }).workers, 2); // ≥ ~1 s of frames per worker
});

test('M51: preset: đoạn song song veryfast, một worker giữ medium, --fast/--preset ghi đè', async () => {
  const { renderPlan } = await load();
  const v = { W: 720, H: 1280, n: 947, fps: 30, physical: 6, logical: 12 };
  assert.equal(renderPlan({ ...v, workers: 1 }).preset, 'medium');
  assert.equal(renderPlan({ ...v, workers: 1, fast: true }).preset, 'veryfast');
  assert.equal(renderPlan({ ...v, preset: 'medium' }).preset, 'medium');
  assert.equal(renderPlan(v).preset, 'veryfast');
});

test('M51: đếm nhân thật từ /proc/cpuinfo (2 socket, SMT)', async () => {
  const { parseCpuinfo } = await load();
  const cpu = (p, c) => `processor\t: x\nphysical id\t: ${p}\ncore id\t\t: ${c}\n\n`;
  const text = [0, 1].flatMap(p => [0, 1, 2, 3].flatMap(c => [cpu(p, c), cpu(p, c)])).join('');
  assert.equal(parseCpuinfo(text), 8);
  assert.equal(parseCpuinfo('processor : 0\n'), 0);
});
