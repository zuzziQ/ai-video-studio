// Test M95 "Nghe lại bằng AI": lõi so chữ (studio/features/21_transcript.core.js), scripts/rehear.mjs và route
// studio/routes/22_rehear.mjs. Không cần Whisper/ffmpeg thật: Whisper giả ở fixtures/fake_whisper.mjs chạy bằng node,
// bước trộn tiếng nói (mix_audio.py) giả bằng một hàm ghi file.
// Chạy: node --test scripts/tests/rehear.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '../..');
const C = createRequire(import.meta.url)('../../studio/features/21_transcript.core.js');
const R = await import('../rehear.mjs');
const FAKE = path.join(HERE, 'fixtures/fake_whisper.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-rehear-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// Lời thoại mẫu của clip-mau: Whisper turbo nghe nhầm "30" thành "3".
const SAID = 'các bạn chỉ cần là thời gian 15 đến 3 phút đã có một video clip';
const WORDS = SAID.split(' ').map((w, i) => ({ w, s: 11 + i * 0.3, e: 11 + i * 0.3 + 0.28 }));
const at = w => WORDS.find(x => x.w === w);

// run giả: mix_audio.py → ghi .studio/stem_voice.wav; rehear.py → node fixtures/fake_whisper.mjs (spawnRun thật)
function fakeRun(log) {
  return async (cmd, args, o) => {
    const script = args.find(a => /\.(py|mjs)$/.test(a));
    log.push({ script: path.basename(script), args });
    if (script.endsWith('mix_audio.py')) {
      const tl = JSON.parse(fs.readFileSync(args[args.indexOf(script) + 1], 'utf8'));
      log.at(-1).tl = tl;
      fs.writeFileSync(path.join(o.cwd, '.studio', 'stem_voice.wav'), 'RIFF');
      return;
    }
    const rest = args.slice(args.indexOf(script) + 1);
    return R.spawnRun(process.execPath, [FAKE, ...rest], o);
  };
}
function project(name, tl) {
  const dir = path.join(TMP, name);
  fs.mkdirSync(path.join(dir, 'work'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'work/aroll.mp4'), 'x');
  const T = { duration: 30, audio: { voice: 'work/aroll.mp4', music: [{ t0: 0, t1: 30, mood: 'hype' }] }, clips: [{ audio: 'work/aroll.mp4', in: 0, out: 30 }], ...tl };
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(T));
  return { dir, tl: T };
}

test('heardTokens: dạng lời thoại, khoảng số đọc "đến", dán %', () => {
  const h = C.heardTokens([{ w: ' Các', s: 1, e: 2 }, { w: '15', s: 2, e: 3 }, { w: '-30', s: 3, e: 3.5 }, { w: 'phút.', s: 3.5, e: 4 }, { w: '50', s: 4, e: 4.2 }, { w: '%', s: 4.2, e: 4.3 }, { w: '', s: 5, e: 6 }]);
  assert.deepEqual(h.map(x => x.w), ['Các', '15', 'đến', '30', 'phút', '50%']);
  assert.equal(h[2].s, 3); assert.equal(h[3].e, 3.5); assert.equal(h[5].e, 4.3);
  assert.deepEqual(C.heardTokens([{ w: '15-30', s: 0, e: 1 }]).map(x => x.w), ['15', 'đến', '30']);
});

test('rehearDiff: "15 đến 3 phút" nghe lại thành "15 đến 30 phút" → một đề xuất 3 → 30', () => {
  const old = SAID.split(' '), heard = 'Các bạn chỉ cần là thời gian 15 đến 30 phút đã có 1 video clip'.split(' ');
  const a = old.indexOf('15'), b = old.indexOf('phút');
  assert.deepEqual(C.rehearDiff(old, heard, a, b), [{ i: old.indexOf('3'), n: 1, from: '3', to: '30' }]);
  // "một" = "1", hoa thường, dấu câu: không thành đề xuất
  assert.deepEqual(C.rehearDiff(old, 'Các bạn, chỉ cần là thời gian 15 đến 3 phút. Đã có 1 video clip'.split(' '), 0, old.length - 1), []);
});

test('rehearDiff: chỉ chỗ chạm đoạn đã chọn, bỏ chỗ chỉ xoá, chỗ chỉ thêm gộp với từ kề', () => {
  const old = 'a b c d e'.split(' ');
  assert.deepEqual(C.rehearDiff(old, 'x b c d y'.split(' '), 1, 3), [], 'khác ở mép ngoài đoạn chọn: bỏ');
  assert.deepEqual(C.rehearDiff(old, 'a c d e'.split(' '), 1, 3), [], 'Whisper sót từ: không đề xuất xoá');
  assert.deepEqual(C.rehearDiff(old, 'a b z c d e'.split(' '), 1, 3), [{ i: 1, n: 1, from: 'b', to: 'b z' }]);
  assert.deepEqual(C.rehearDiff(old, 'a q d e'.split(' '), 1, 3), [{ i: 1, n: 2, from: 'b c', to: 'q' }]);
});

test('pickModel: bậc lớn hơn model đã tạo lời thoại; model lạ = 400', () => {
  assert.equal(R.pickModel('large-v3-turbo'), 'large-v3');
  assert.equal(R.pickModel(undefined), 'large-v3');
  assert.equal(R.pickModel('small'), 'large-v3-turbo');
  assert.equal(R.pickModel('large-v3'), 'large-v3');
  assert.equal(R.pickModel('small', 'medium'), 'medium');
  assert.throws(() => R.pickModel('small', 'huge; rm'), e => e.status === 400);
});

test('checkSpan: thêm ≥ 1 s mỗi bên, đoạn ngắn nới đủ MIN_WIN, kẹp trong video, từ chối đoạn sai hoặc quá dài', () => {
  assert.deepEqual(R.checkSpan({ s: 10, e: 20 }, 30), { s: 10, e: 20, from: 9, to: 21 });
  const one = R.checkSpan({ s: 13.22, e: 13.34 }, 30); // một chữ "3": nghe 5 s quanh nó
  assert.ok(Math.abs(one.to - one.from - R.MIN_WIN) < 1e-9 && Math.abs((one.from + one.to) / 2 - 13.28) < 1e-9);
  assert.deepEqual(R.checkSpan({ s: 0.4, e: 2 }, 30), { s: 0.4, e: 2, from: 0, to: R.MIN_WIN }, 'đầu video: dồn sang phải');
  assert.deepEqual(R.checkSpan({ s: 0.4, e: 2 }, 2.5), { s: 0.4, e: 2, from: 0, to: 2.5 }, 'video ngắn hơn MIN_WIN');
  for (const b of [{}, { s: 3, e: 2 }, { s: -1, e: 2 }, { s: 'x', e: 1 }, { s: 0, e: R.MAX_SPAN + 1 }, { s: 40, e: 41 }]) assert.throws(() => R.checkSpan(b, 30), e => e.status === 400, JSON.stringify(b));
});

test('buildPrompt: từ khoá + câu sau + câu trước, không có chữ của chính đoạn nghe', () => {
  const p = R.buildPrompt({ words: WORDS, from: at('15').s - 1, to: at('phút').e + 1, terms: ['Lychee', 'Lychee', '82X'] });
  assert.match(p, /^Từ khoá: Lychee, 82X\./);
  assert.match(p, /các bạn chỉ$/, 'câu trước dừng trước 1 s nghe thêm');
  assert.match(p, /. clip. /, 'câu sau sau 1 s nghe thêm');
  assert.doesNotMatch(p, /đến 3/);
  assert.ok(R.buildPrompt({ words: Array.from({ length: 300 }, (_, i) => ({ w: 'chữdài' + i, s: i, e: i + .5 })), from: 299, to: 300 }).length <= 700);
});

test('rehear: trộn tiếng nói chỉ giọng (có cache), gọi Whisper lớn hơn kèm prompt, trả chữ + mốc thời gian', async () => {
  const { dir, tl } = project('p1', { asr: { model: 'large-v3-turbo' } });
  process.env.FAKE_HEARD = 'Các bạn chỉ cần là thời gian 15 đến 30 phút đã có';
  const log = [], steps = [];
  const o = { dir, tl, words: WORDS, terms: ['Lychee'], s: at('15').s, e: at('phút').e, skill: SKILL, py: 'python' };
  const r = await R.rehear(o, { run: fakeRun(log), onProgress: (p, s) => steps.push([p, s]) });
  assert.equal(r.model, 'large-v3');
  assert.equal(r.text, process.env.FAKE_HEARD);
  const span = R.checkSpan(o, tl.duration);
  assert.ok(r.from === span.from && r.to === span.to && r.to - r.from >= R.MIN_WIN - 1e-9);
  assert.ok(r.words.every(w => w.s >= r.from - 1e-6 && w.e <= r.to + 1e-6));
  assert.equal(r.cached, false);
  assert.deepEqual(log.map(x => x.script), ['mix_audio.py', 'rehear.py']);
  assert.deepEqual(log[0].tl.audio.music, [], 'chỉ trộn giọng');
  assert.ok(log[0].args.includes('--stems'));
  const a = log[1].args;
  assert.equal(a[a.indexOf('--model') + 1], 'large-v3');
  assert.ok(a[a.indexOf(path.join(SKILL, 'scripts', 'rehear.py')) + 1].endsWith('rehear_voice.wav'));
  const pr = a.find(x => x.startsWith('--prompt='));
  assert.match(pr, /Lychee/); assert.doesNotMatch(pr, /đến 3/);
  assert.ok(steps.some(([, s]) => /Whisper large-v3/.test(s)) && steps.every(([p]) => p >= 0 && p <= 1));
  assert.deepEqual(fs.readdirSync(dir).filter(f => f.startsWith('.rehear_')), [], 'dọn timeline tạm');
  assert.deepEqual(fs.readdirSync(path.join(dir, '.studio')).filter(f => /^rehear_\d/.test(f)), [], 'dọn file kết quả');
  // cùng timeline: dùng lại tiếng nói đã trộn
  const log2 = [];
  const r2 = await R.rehear(o, { run: fakeRun(log2) });
  assert.equal(r2.cached, true);
  assert.deepEqual(log2.map(x => x.script), ['rehear.py']);
  // sửa clip (cắt): trộn lại
  const log3 = [];
  await R.rehear({ ...o, tl: { ...tl, clips: [{ audio: 'work/aroll.mp4', in: 2, out: 30 }] } }, { run: fakeRun(log3) });
  assert.deepEqual(log3.map(x => x.script), ['mix_audio.py', 'rehear.py']);
});

test('rehear: lỗi Whisper báo đúng dòng lỗi; trộn hỏng thì dùng file giọng gốc', async () => {
  const { dir, tl } = project('p2', {});
  const run = async (cmd, args, o) => { if (args.some(a => a.endsWith('mix_audio.py'))) throw new Error('mix hỏng'); return fakeRun([])(cmd, args, o); };
  process.env.FAKE_FAIL = 'Chưa nạp được model large-v3 (offline)';
  await assert.rejects(R.rehear({ dir, tl, s: 1, e: 2, skill: SKILL, py: 'python' }, { run }), /Chưa nạp được model large-v3/);
  delete process.env.FAKE_FAIL;
  process.env.FAKE_HEARD = 'xin chào';
  const r = await R.rehear({ dir, tl, s: 1, e: 2, skill: SKILL, py: 'python' }, { run });
  assert.equal(r.text, 'xin chào');
});

// ---------- route ----------
const { readJson } = await import('../../studio/security.mjs');
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
let cur = null, job = null;
const ctx = {
  SKILL, PY: 'python', json, body: req => readJson(req),
  get project() { return cur && { dir: cur.dir, tlFile: path.join(cur.dir, 'timeline.json') }; },
  get job() { return job; },
  readProject: () => ({ timeline: JSON.parse(fs.readFileSync(path.join(cur.dir, 'timeline.json'), 'utf8')), captions: [{ t0: 11, t1: 16, words: WORDS }] }),
  rehearLib: { ...R, rehear: (o, env) => R.rehear(o, { ...env, run: fakeRun([]) }) },
};
const handler = (await import('../../studio/routes/22_rehear.mjs')).default(ctx);
const app = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try { if (!(await handler(req, res, u.pathname, u))) json(res, { error: 'not found' }, 404); } catch (e) { json(res, { error: e.message }, e.status || 500); }
});
await new Promise(ok => app.listen(0, '127.0.0.1', ok));
after(() => app.close());
const base = `http://127.0.0.1:${app.address().port}`;
const call = async (p, body) => { const r = await fetch(base + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); return { code: r.status, j: await r.json() }; };
const until = async (pred, ms = 8000) => { const t = Date.now(); for (;;) { const s = (await call('/api/rehear')).j; if (pred(s)) return s; if (Date.now() - t > ms) throw new Error('hết giờ: ' + JSON.stringify(s)); await new Promise(ok => setTimeout(ok, 30)); } };

test('route: chưa mở dự án / đoạn sai = 400, chạy xong trả chữ nghe lại', async () => {
  assert.equal((await call('/api/rehear', { s: 1, e: 2 })).code, 400);
  cur = project('r1', {});
  assert.equal((await call('/api/rehear', { s: 2, e: 1 })).code, 400);
  assert.equal((await call('/api/rehear', { s: 1, e: 2, model: 'bad' })).code, 400);
  process.env.FAKE_HEARD = 'Các bạn chỉ cần là thời gian 15 đến 30 phút';
  const r = await call('/api/rehear', { s: at('15').s, e: at('phút').e });
  assert.equal(r.code, 200); assert.ok(r.j.run);
  const s = await until(x => x.run === r.j.run && x.state !== 'running');
  assert.equal(s.state, 'done'); assert.equal(s.model, 'large-v3'); assert.equal(s.text, process.env.FAKE_HEARD);
  assert.ok(Array.isArray(s.words) && s.words.length === 11);
  const sug = C.rehearDiff(WORDS.map(w => w.w), C.heardTokens(s.words).map(w => w.w), WORDS.indexOf(at('15')), WORDS.indexOf(at('phút')));
  assert.deepEqual(sug.map(x => [x.from, x.to]), [['3', '30']]);
});

test('route: một lượt một lúc (409), không chạy chồng "Tạo lời thoại", huỷ được', async () => {
  cur = project('r2', {});
  job = { kind: 'transcribe', state: 'running' };
  assert.equal((await call('/api/rehear', { s: 1, e: 2 })).code, 409);
  job = { kind: 'export', state: 'running' }; // xuất video không chặn nghe lại
  process.env.FAKE_SLEEP_MS = '3000';
  const r = await call('/api/rehear', { s: 1, e: 2 });
  assert.equal(r.code, 200);
  await until(x => x.run === r.j.run && /Cắt đoạn|Đang nghe/.test(x.step || ''));
  assert.equal((await call('/api/rehear', { s: 1, e: 2 })).code, 409);
  assert.deepEqual((await call('/api/rehear/cancel', {})).j, { ok: true, cancelled: true });
  const s = await until(x => x.run === r.j.run && x.state !== 'running');
  assert.equal(s.state, 'cancelled');
  delete process.env.FAKE_SLEEP_MS; job = null;
  assert.deepEqual((await call('/api/rehear/cancel', {})).j, { ok: true, cancelled: false });
});
