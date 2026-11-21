// S28 M210 — vạch nhịp: đọc kết quả beats.py, lưới theo giờ video (offset, nhạc lặp, mức 1/1 · 1/2 · phách), mốc nam châm,
// cắt theo nhịp, job `beats` trong hàng đợi (tham số, file ngoài dự án bị từ chối), ngữ cảnh nhịp cho Hỏi Claude / AI dựng.
// Chạy: node --test scripts/tests/s28_beats.test.mjs   (không gọi beats.py, không cần numpy)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-beats-m210-'));
process.env.AVS_HOME = HOME;
process.env.AVS_NO_LAUNCHCTL = '1';
after(() => fs.rmSync(HOME, { recursive: true, force: true }));
const BC = createRequire(import.meta.url)('../../studio/features/33_beats.core.js');
const { argsFor, isKind, KINDS } = await import('../queue.mjs');
const { resolveSource, cacheFile } = await import('../beats_job.mjs');
const { checkBeats } = await import('../ask_route.mjs');

// 120 BPM: phách mỗi 0,5 s, phách mạnh mỗi 4 phách từ 0,5 s
const RAW = { bpm: 120.04, beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5], downbeats: [0.5, 2.5, 4.5], dur: 6, levels: [0.1] };

test('parse: chuẩn hoá kết quả beats.py, bỏ dữ liệu hỏng', () => {
  const b = BC.parse(RAW);
  assert.equal(b.bpm, 120);
  assert.equal(b.t.length, 12);
  assert.deepEqual(b.strong, [0.5, 2.5, 4.5]);
  assert.equal(b.dur, 6);
  assert.equal(BC.parse(null), null);
  assert.equal(BC.parse({ bpm: 0, beats: [1] }), null);
  assert.equal(BC.parse({ bpm: 120, beats: [] }), null);
  // phách mạnh không nằm trong danh sách phách bị bỏ; số âm / NaN bị bỏ; sắp tăng dần
  assert.deepEqual(BC.parse({ bpm: 100, beats: [1, -2, 'x', 0.5], downbeats: [0.7, 1] }), { bpm: 100, t: [0.5, 1], strong: [1] });
});

test('phases: phách mạnh = 0, phách trước phách mạnh đầu tiên đếm ngược', () => {
  assert.deepEqual(BC.phases(BC.parse(RAW)).slice(0, 6), [3, 0, 1, 2, 3, 0]);
});

test('grid: giờ video theo t0 / offset của khối nhạc, mức 1/1 · 1/2 · phách', () => {
  const beats = BC.parse(RAW);
  const m = { t0: 10, t1: 13, offset: 1, beats };
  const all = BC.grid([m], 'beat');
  // nguồn 1..4 s → video 10..13 s
  assert.deepEqual(all.map(x => x.t), [10, 10.5, 11, 11.5, 12, 12.5, 13]);
  assert.deepEqual(all.filter(x => x.strong).map(x => x.t), [11.5]);
  assert.deepEqual(BC.grid([m], 'bar').map(x => x.t), [11.5]);
  assert.deepEqual(BC.grid([m], 'half').map(x => x.t), [10.5, 11.5, 12.5]);
  // khối ẩn, khối chưa có nhịp, quá hết video: không có vạch
  assert.equal(BC.grid([{ ...m, hidden: true }]).length, 0);
  assert.equal(BC.grid([{ t0: 0, t1: 5 }]).length, 0);
  assert.deepEqual(BC.grid([m], 'beat', 11).map(x => x.t), [10, 10.5, 11]);
});

test('grid: nhạc ngắn hơn khối thì lặp (mix_audio.py -stream_loop), nhịp lặp theo dur', () => {
  const m = { t0: 0, t1: 13, beats: BC.parse(RAW) };
  const t = BC.grid([m], 'bar').map(x => x.t);
  assert.deepEqual(t, [0.5, 2.5, 4.5, 6.5, 8.5, 10.5, 12.5]);
  // không trùng mốc ở chỗ nối vòng lặp
  const b = BC.grid([m], 'beat').map(x => x.t);
  assert.equal(new Set(b).size, b.length);
  assert.ok(b.includes(6) && b.includes(12));
});

test('grid: hai khối nhạc trùng mốc thì gộp, giữ phách mạnh', () => {
  const beats = BC.parse(RAW);
  const g = BC.grid([{ t0: 0, t1: 3, beats }, { t0: 0, t1: 3, beats: { ...beats, strong: [1] } }], 'beat');
  assert.equal(g.filter(x => x.t === 1).length, 1);
  assert.ok(g.find(x => x.t === 1).strong && g.find(x => x.t === 0.5).strong);
});

test('cutPoints: chỉ mốc trong clip, cách mép ≥ 2 khung; every / strong', () => {
  const g = BC.grid([{ t0: 0, t1: 6, beats: BC.parse(RAW) }], 'beat');
  assert.deepEqual(BC.cutPoints(1, 3, g), [1.5, 2, 2.5]);
  assert.deepEqual(BC.cutPoints(0.98, 3.04, g), [1.5, 2, 2.5]); // 1.0 và 3.0 sát mép (< 2 khung) bị bỏ
  assert.deepEqual(BC.cutPoints(0, 6, g, { strong: true }), [0.5, 2.5, 4.5]);
  assert.deepEqual(BC.cutPoints(0, 3, g, { every: 2 }), [0.5, 1.5, 2.5]);
  assert.deepEqual(BC.cutPoints(1.1, 1.4, g), []);
});

test('snapTimes + brief: mốc nam châm, tóm tắt cho prompt', () => {
  const music = [{ t0: 0, t1: 6, beats: BC.parse(RAW) }];
  assert.deepEqual(BC.snapTimes(BC.grid(music, 'bar')), [0.5, 2.5, 4.5]);
  assert.deepEqual(BC.brief(music, 6), { bpm: 120, strong: [0.5, 2.5, 4.5] });
  assert.equal(BC.brief([{ t0: 0, t1: 6 }]), null);
});

test('queue: loại việc beats, tham số file / mood', () => {
  assert.ok(isKind('beats'));
  assert.equal(KINDS.beats.script, 'beats_job.mjs');
  assert.ok(fs.existsSync(path.join(import.meta.dirname, '..', KINDS.beats.script)));
  assert.deepEqual(argsFor({ kind: 'beats', input: '/p', opts: { file: 'media/a.mp3', src: '/x' } }), ['/p', '--file', 'media/a.mp3']);
  assert.deepEqual(argsFor({ kind: 'beats', input: '/p', opts: { mood: 'tech' } }), ['/p', '--mood', 'tech']);
  assert.deepEqual(argsFor({ kind: 'beats', input: '/p', opts: {} }), ['/p']);
});

test('beats_job: chỉ nhận file âm thanh trong dự án hoặc nhạc thư viện', () => {
  const dir = fs.mkdtempSync(path.join(HOME, 'proj-'));
  fs.mkdirSync(path.join(dir, 'media'));
  fs.writeFileSync(path.join(dir, 'media', 'a.mp3'), 'x');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
  const out = path.join(HOME, 'out.mp3'); fs.writeFileSync(out, 'x');
  assert.equal(resolveSource(dir, { file: 'media/a.mp3' }), path.join(dir, 'media', 'a.mp3'));
  assert.equal(resolveSource(dir, { file: 'notes.txt' }), null);
  assert.equal(resolveSource(dir, { file: '../out.mp3' }), null);
  assert.equal(resolveSource(dir, { file: out }), null);
  assert.equal(resolveSource(dir, { file: 'media/none.mp3' }), null);
  assert.equal(resolveSource(dir, { mood: '../../x' }), null);
  // cache theo cỡ + giờ sửa: sửa file thì khoá khác
  const f = path.join(dir, 'media', 'a.mp3'), k1 = cacheFile(dir, f);
  fs.writeFileSync(f, 'xyz');
  fs.utimesSync(f, new Date(), new Date(Date.now() + 5000));
  assert.notEqual(cacheFile(dir, f), k1);
  assert.ok(cacheFile(dir, f).startsWith(path.join(dir, '.studio', 'beats')));
});

test('Hỏi Claude: nhịp trong ngữ cảnh được kiểm, vào prompt', async () => {
  assert.equal(typeof checkBeats, 'function');
  assert.equal(checkBeats(null), null);
  assert.equal(checkBeats({ bpm: 9999, strong: [] }), null);
  const c = checkBeats({ bpm: 120.04, strong: [0.5, -1, 'x', 2.555, ...Array(60).fill(3)] });
  assert.equal(c.bpm, 120);
  assert.ok(c.strong.length <= 40 && c.strong[1] === 2.56 && !c.strong.includes(-1));
  const R = await import('../ask_route.mjs');
  const input = R.checkInput({ ask: 'đặt chuyển cảnh theo nhạc', step: 'build', info: { duration: 6, beats: { bpm: 120, strong: [0.5, 2.5] } } });
  assert.deepEqual(input.ctx.beats, { bpm: 120, strong: [0.5, 2.5] });
  assert.match(R.routerPrompt(input), /120 BPM, phách mạnh tại \(giây\): 0.5, 2.5/);
  assert.doesNotMatch(R.routerPrompt(R.checkInput({ ask: 'x', step: 'build', info: { duration: 6 } })), /BPM/);
});

test('AI dựng: phách mạnh của nền nhạc người dùng, cảnh hít vào phách ±0,2 s', async () => {
  const { beatGrid, onBeat } = await import('../ai_edit.mjs');
  const beats = BC.parse(RAW);
  assert.deepEqual(beatGrid({ duration: 6, audio: { music: [{ t0: 0, t1: 6, file: 'media/a.mp3', beats }] } }), [0.5, 2.5, 4.5]);
  // nền do AI chọn (_ai) sẽ bị thay: không hít
  assert.deepEqual(beatGrid({ duration: 6, audio: { music: [{ t0: 0, t1: 6, mood: 'tech', _ai: true, beats }] } }), []);
  assert.equal(onBeat(2.4, [0.5, 2.5]), 2.5);
  assert.equal(onBeat(2.2, [0.5, 2.5]), 2.2);
});

test('route /api/beats: file ngoài dự án 404, cache trả nhịp, xếp job một lần, GET trả job', async () => {
  const route = (await import('../../studio/routes/33_beats.mjs')).default;
  const dir = fs.mkdtempSync(path.join(HOME, 'rt-'));
  fs.writeFileSync(path.join(dir, 'timeline.json'), '{}');
  fs.mkdirSync(path.join(dir, 'media')); fs.writeFileSync(path.join(dir, 'media', 'a.mp3'), 'x'); fs.writeFileSync(path.join(dir, 'media', 'b.mp3'), 'y');
  let out = null;
  const ctx = { project: { dir }, json: (res, o, c) => { out = { o, c: c || 200 }; }, body: async req => req.b };
  const call = async (method, q, b) => { out = null; const u = new URL('http://x/api/beats' + (q ? '?' + new URLSearchParams(q) : '')); await route(ctx)({ method, b }, {}, '/api/beats', u); return out; };
  assert.equal((await call('POST', null, { file: '../x.mp3' })).c, 404);
  assert.equal(await route(ctx)({ method: 'GET' }, {}, '/api/other', new URL('http://x/api/other')), false);
  // cache có sẵn → POST trả nhịp ngay, không xếp job
  const cf = cacheFile(dir, path.join(dir, 'media', 'a.mp3')); fs.mkdirSync(path.dirname(cf), { recursive: true }); fs.writeFileSync(cf, JSON.stringify(RAW));
  const r1 = await call('POST', null, { file: 'media/a.mp3' });
  assert.equal(r1.o.beats.bpm, 120); assert.equal(r1.o.item, undefined);
  // chưa có cache → xếp job; bấm lại khi còn chờ → cùng job
  const r2 = await call('POST', null, { file: 'media/b.mp3' }), r3 = await call('POST', null, { file: 'media/b.mp3' });
  assert.equal(r2.o.item.state, 'queued'); assert.equal(r3.o.item.id, r2.o.item.id);
  const g = await call('GET', { file: 'media/b.mp3' });
  assert.equal(g.o.beats, null); assert.equal(g.o.job.id, r2.o.item.id);
  const { loadQueue } = await import('../queue.mjs');
  const it = loadQueue().items.find(x => x.id === r2.o.item.id);
  assert.deepEqual(argsFor(it), [dir, '--file', 'media/b.mp3']);
});

test('grid / brief: nhịp hỏng trong timeline.json (chuỗi, HTML) bị bỏ hoặc ép số', () => {
  assert.deepEqual(BC.grid([{ t0: 0, t1: 3, beats: { bpm: '<b>x</b>', t: [1] } }]), []);
  assert.deepEqual(BC.grid([{ t0: 1, t1: 3, beats: { bpm: 120, t: ['0.5', 'x'], strong: ['0.5'] } }]).map(x => [x.t, x.strong]), [[1.5, true]]);
  assert.equal(BC.brief([{ t0: 0, t1: 3, beats: { bpm: 'abc', t: [1] } }]), null);
});
