// M64: profile hiệu năng (scripts/perf_profile.mjs): config gộp, thứ tự thắng, RAM, slot render giữa các tiến trình, nhật ký.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-perf-'));
process.env.AVS_HOME = HOME;
for (const k of ['AVS_ENCODER', 'AVS_WHISPER_DEVICE', 'AVS_RENDER_SLOTS', 'AVS_RENDER_PRIORITY', 'AVS_PERF_PROFILE']) delete process.env[k];
const MOD = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'perf_profile.mjs');
const P = await import(pathToFileURL(MOD).href);
const { renderPlan } = await import(pathToFileURL(path.join(path.dirname(MOD), 'render_hw.mjs')).href);
const CFG = path.join(HOME, 'config.json');
test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

test('M64: savePerf gộp vào config.json, giữ khoá khác, kiểm kiểu từng trường', () => {
  fs.writeFileSync(CFG, JSON.stringify({ llm: { provider: 'ollama' }, tts: { default_engine: 'edge' }, perf: { extra: 1 } }));
  assert.deepEqual(P.loadPerf(), { profile: 'can-bang', custom: {} });
  const r = P.savePerf({ profile: 'tuy-chinh', custom: { workers: 3, encoder: 'x264', slots: 2 } });
  assert.deepEqual(r, { profile: 'tuy-chinh', custom: { workers: 3, encoder: 'x264', slots: 2 } });
  P.savePerf({ custom: { preset: 'medium', workers: null } });
  const c = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  assert.deepEqual(c.llm, { provider: 'ollama' });
  assert.deepEqual(c.tts, { default_engine: 'edge' });
  assert.equal(c.perf.extra, 1);
  assert.deepEqual(c.perf.custom, { workers: null, encoder: 'x264', slots: 2, preset: 'medium' });
  const before = fs.readFileSync(CFG, 'utf8');
  for (const bad of [{ profile: 'nhanh' }, { custom: { workers: '3' } }, { custom: { workers: 99 } }, { custom: { encoder: 'h265' } },
    { custom: { slots: 0 } }, { custom: { priority: 'high' } }, { custom: { whisperDevice: 'gpu' } }, { custom: { foo: 1 } }, { other: 1 }, [], null]) {
    assert.throws(() => P.savePerf(bad), e => e.status === 400, JSON.stringify(bad));
  }
  assert.equal(fs.readFileSync(CFG, 'utf8'), before, 'lỗi thì không ghi gì');
  // file sửa tay sai kiểu: đọc vẫn ra giá trị hợp lệ
  fs.writeFileSync(CFG, JSON.stringify({ perf: { profile: 'xyz', custom: { workers: 'a', encoder: 'nvenc' } } }));
  assert.deepEqual(P.loadPerf(), { profile: 'can-bang', custom: { encoder: 'nvenc' } });
});

test('M64: resolvePerf theo profile; cờ CLI và biến môi trường thắng profile', () => {
  const perf = { profile: 'can-bang', custom: {} }, hw = { physical: 6 };
  const cb = P.resolvePerf({ perf, hw, env: {} });
  assert.deepEqual({ ...cb, from: undefined }, { profile: 'can-bang', workers: null, encoder: 'auto', preset: null, priority: 'normal', slots: 1, whisperDevice: 'auto', from: undefined });
  assert.equal(P.resolvePerf({ profile: 'tiet-kiem', perf, hw, env: {} }).workers, 2);
  assert.equal(P.resolvePerf({ profile: 'tiet-kiem', perf, hw, env: {} }).priority, 'below_normal');
  assert.equal(P.resolvePerf({ profile: 'toc-do', perf, hw, env: {} }).workers, 5);
  assert.equal(P.resolvePerf({ profile: 'toc-do', perf, hw: { physical: 4 }, env: {} }).workers, 3);
  assert.equal(P.resolvePerf({ profile: 'toc-do', perf, hw: { physical: 16 }, env: {} }).workers, 5);
  const q = P.resolvePerf({ profile: 'chat-luong', perf, hw, env: {} });
  assert.equal(q.encoder, 'x264'); assert.equal(q.preset, 'medium');
  // env thắng profile
  const e = P.resolvePerf({ profile: 'chat-luong', perf, hw, env: { AVS_ENCODER: 'nvenc', AVS_WHISPER_DEVICE: 'CPU', AVS_RENDER_SLOTS: '2', AVS_RENDER_PRIORITY: 'below_normal' } });
  assert.deepEqual([e.encoder, e.whisperDevice, e.slots, e.priority], ['nvenc', 'cpu', 2, 'below_normal']);
  assert.equal(e.from.encoder, 'env');
  assert.equal(P.resolvePerf({ perf, hw, env: { AVS_RENDER_SLOTS: '0' } }).slots, 0);
  assert.equal(P.resolvePerf({ perf, hw, env: { AVS_PERF_PROFILE: 'tiet-kiem' } }).profile, 'tiet-kiem');
  assert.equal(P.resolvePerf({ profile: 'toc-do', perf, hw, env: { AVS_PERF_PROFILE: 'tiet-kiem' } }).profile, 'toc-do');
  // CLI thắng profile
  const c = P.resolvePerf({ profile: 'tiet-kiem', perf, hw, env: {}, job: { cli: { workers: '4', preset: 'slow' } } });
  assert.deepEqual([c.workers, c.preset, c.from.workers], [4, 'slow', 'cli']);
  assert.equal(P.resolvePerf({ profile: 'chat-luong', perf, hw, env: {}, job: { cli: { fast: true } } }).preset, 'veryfast');
  // tuy-chinh lấy custom; profile lạ → can-bang
  const t = P.resolvePerf({ perf: { profile: 'tuy-chinh', custom: { workers: 3, priority: 'below_normal', whisperDevice: 'cpu' } }, hw, env: {} });
  assert.deepEqual([t.workers, t.priority, t.whisperDevice], [3, 'below_normal', 'cpu']);
  assert.equal(P.resolvePerf({ profile: 'abc', perf, hw, env: {} }).profile, 'can-bang');
  assert.deepEqual(P.perfEnv(t), { AVS_PERF_PROFILE: 'tuy-chinh', AVS_WHISPER_DEVICE: 'cpu' });
});

test('M64: renderPlan với can-bang giữ nguyên; RAM trống thấp hạ worker', () => {
  const v = { W: 1080, H: 1920, n: 900, fps: 30 };
  const cb = P.resolvePerf({ perf: { profile: 'can-bang', custom: {} }, hw: { physical: 6 }, env: {} });
  const plan = o => renderPlan({ ...v, workers: cb.workers, preset: cb.preset, ...o });
  assert.deepEqual(plan({ physical: 6, logical: 12 }), { workers: 4, threads: 3, preset: 'veryfast' });
  assert.deepEqual(plan({ physical: 2, logical: 4 }), { workers: 1, threads: 0, preset: 'medium' });
  assert.deepEqual(plan({ physical: 6, logical: 12, freeMemGB: 20 }), { workers: 4, threads: 3, preset: 'veryfast' });
  // 1,5 GB chừa + 0,7 GB/worker 1080p: 3 GB trống → 2 worker
  assert.deepEqual(plan({ physical: 6, logical: 12, freeMemGB: 3 }), { workers: 2, threads: 6, preset: 'veryfast', ramCap: 4 });
  assert.equal(plan({ physical: 6, logical: 12, freeMemGB: 0.5 }).workers, 1);
  // 720p cần ít RAM hơn mỗi worker
  assert.equal(renderPlan({ W: 720, H: 1280, n: 900, fps: 30, physical: 6, logical: 12, freeMemGB: 3 }).workers, 4);
});

test('M64: slot của pid đã chết được dọn', () => {
  const dead = spawnSync(process.execPath, ['-e', '0']).pid;
  fs.writeFileSync(P.slotFile(), JSON.stringify({ holders: [{ pid: dead, host: os.hostname(), tok: 'x', at: new Date().toISOString() }] }));
  assert.equal(P.slotHolders().length, 0);
  const tok = P.tryTakeSlot({ slots: 1 });
  assert.ok(tok, 'chỗ của pid chết không giữ lượt');
  assert.equal(P.tryTakeSlot({ slots: 1 }), null, 'đầy rồi');
  assert.ok(P.tryTakeSlot({ slots: 2 }), 'slots 2 cho lượt thứ hai');
  P.releaseSlot(tok);
  assert.equal(P.slotHolders().length, 1);
  fs.rmSync(P.slotFile(), { force: true });
});

test('M64: hai tiến trình cùng render, slots 1 → chỉ một lượt chạy một lúc', async () => {
  fs.rmSync(P.slotFile(), { force: true });
  const out = path.join(HOME, 'spans.jsonl');
  const code = `import { acquireRenderSlot } from ${JSON.stringify(pathToFileURL(MOD).href)};
import fs from 'node:fs';
const s = await acquireRenderSlot({ slots: 1, pollMs: 50, onWait: () => process.stdout.write('Đang chờ lượt render khác…\\n') });
const a = Date.now(); await new Promise(r => setTimeout(r, 700)); const b = Date.now();
fs.appendFileSync(${JSON.stringify(out)}, JSON.stringify({ a, b, w: s.waited_s }) + '\\n');
process.exit(0);`;
  const run = () => new Promise((ok, bad) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, AVS_HOME: HOME } });
    let so = ''; p.stdout.on('data', d => { so += d; }); p.stderr.on('data', d => { so += d; });
    p.on('close', c => (c ? bad(new Error(so)) : ok(so)));
  });
  const logs = await Promise.all([run(), run()]);
  const [x, y] = fs.readFileSync(out, 'utf8').trim().split('\n').map(l => JSON.parse(l)).sort((p, q) => p.a - q.a);
  assert.ok(y.a >= x.b, `chồng nhau: ${JSON.stringify([x, y])}`);
  assert.equal(logs.filter(l => l.includes('Đang chờ lượt render khác')).length, 1);
  assert.ok(y.w > 0.3);
  assert.equal(P.slotHolders().length, 0, 'thoát thì nhả chỗ');
});

test('M64: perf_log.jsonl giữ N dòng cuối', () => {
  for (let i = 0; i < 7; i++) P.appendPerfLog({ profile: 'can-bang', W: 1080, H: 1920, frames: i, workers: 4, encoder: 'nvenc', chrome: 'gpu', sec: 1, fps: 30, waited_s: 0 }, { keep: 5 });
  const rows = P.readPerfLog({ n: 50 });
  assert.deepEqual(rows.map(r => r.frames), [2, 3, 4, 5, 6]);
  assert.ok(rows.every(r => typeof r.at === 'string'));
  assert.deepEqual(P.readPerfLog({ n: 2 }).map(r => r.frames), [5, 6]);
});

test('M64: hwSnapshot đọc nvidia-smi, không lộ đường dẫn máy', () => {
  const run = (cmd) => (cmd === 'nvidia-smi' ? { status: 0, stdout: 'NVIDIA GeForce GTX 1660 Ti, 6144, 5000, 621.24\n' } : { status: 1, stdout: '' });
  const s = P.hwSnapshot({ run, env: { AVS_HOME: HOME, AVS_CHROME_SHELL: '0' }, encoders: false });
  assert.deepEqual(s.gpu, process.platform === 'darwin' ? [] : [{ name: 'NVIDIA GeForce GTX 1660 Ti', vram_mb: 6144, vram_free_mb: 5000, driver: '621.24' }]);
  assert.ok(s.cores.physical >= 1 && s.cores.logical >= s.cores.physical);
  assert.ok(s.ram.total_gb > 0);
  assert.equal(s.chrome.headless_shell, false);
  const text = JSON.stringify(s);
  assert.ok(!text.includes(os.homedir()) && !text.includes(HOME) && !/[A-Z]:\\\\/.test(text), text);
});
