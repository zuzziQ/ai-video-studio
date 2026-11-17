// S19 M135: "Áp cho các clip còn lại" (scripts/set_apply.mjs, POST /api/clipset/apply của studio/routes/57_clipset.mjs).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const T = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m135-'));
process.env.AVS_HOME = path.join(T, 'home');
after(() => fs.rmSync(T, { recursive: true, force: true }));
const { changesOf, applyOps, wordPairs, baseOf, captureBase, readClip } = await import('../set_apply.mjs');
const { default: route } = await import('../../studio/routes/57_clipset.mjs');
const { tabId } = await import('../../studio/tabs.mjs');

const caps = words => [{ t0: 0, t1: 2, words: words.map((w, k) => ({ w, s: k * 0.5, e: k * 0.5 + 0.4 })) }];
const tlOf = (extra = {}) => ({
  caption_style: 'slate', pack: 'p1', captions: 'work/captions.json',
  scenes: [
    { type: 'frame_grid', t0: 0, t1: 10 },
    { type: 'emoji_pop', t0: 1, t1: 2, _auto: true }, { type: 'emoji_pop', t0: 3, t1: 4, _ai: true },
    { type: 'text', t0: 2, t1: 3, _auto: true }, { type: 'text', t0: 5, t1: 6, _auto: true },
    { type: 'photo', t0: 0, t1: 9, _ai: true, _base: true }, { type: 'emoji_pop', t0: 7, t1: 8 }, // nền _base và emoji người dùng tự thêm: giữ
  ],
  audio: { music: [{ t0: 0, t1: 10, mood: 'tech', gain: -20 }], sfx: [] }, ...extra,
});

const RUN = path.join(T, 'Du an', 'live - clip ngắn');
const mk = (name, words, { tl = tlOf() } = {}) => {
  const d = path.join(RUN, name); fs.mkdirSync(path.join(d, 'work'), { recursive: true }); fs.mkdirSync(path.join(d, '.studio'), { recursive: true });
  fs.writeFileSync(path.join(d, 'timeline.json'), JSON.stringify(tl));
  fs.writeFileSync(path.join(d, 'work/captions.json'), JSON.stringify(caps(words)));
  return d;
};
const A = mk('01_a', ['tôi', 'dùng', 'cờ lốt', 'code']), B = mk('02_b', ['hôm', 'nay', 'cờ lốt', 'hay']), C = mk('03_c', ['cờ', 'lốt']), D = mk('04_d', ['x']);
fs.writeFileSync(path.join(RUN, 'highlights.json'), JSON.stringify(['01_a', '02_b', '03_c', '04_d', '05_xoa'].map(dir => ({ dir, title: dir }))));

test('wordPairs: cặp từ cùng mốc thời gian, bỏ dấu câu / hoa thường; một từ sửa thành hai chữ khác nhau thì bỏ', () => {
  assert.deepEqual(wordPairs(caps(['cờ lốt', 'ai', 'ai']), caps(['Claude', 'AI.', 'Ai'])), [{ from: 'cờ lốt', to: 'Claude' }]);
  assert.deepEqual(wordPairs(caps(['AI']), caps(['Claude'])), [{ from: 'AI', to: 'Claude' }], 'giữ chữ gốc để hiện');
  assert.deepEqual(wordPairs(caps(['a', 'b']), caps(['a', 'b'])), []);
  assert.deepEqual(wordPairs(caps(['a', 'x']), caps(['a', 'y'])).map(p => p.to), ['y']);
  assert.deepEqual(wordPairs(caps(['a', 'x', 'x']), caps(['a', 'y', 'z'])), [], 'x → y và x → z: mâu thuẫn, bỏ');
});

test('changesOf + applyOps: xoá hết loại tự động, đổi kiểu / gói, nhạc, sửa từ; xoá một phần chỉ báo', () => {
  const before = { timeline: tlOf(), captions: caps(['cờ lốt']) };
  const tl = tlOf({ caption_style: 'karaoke', pack: 'p2' });
  tl.scenes = tl.scenes.filter(s => !(s.type === 'emoji_pop' && s._auto || s.type === 'emoji_pop' && s._ai) && !(s.type === 'text' && s.t0 === 2));
  tl.audio.music[0].gain = -26;
  const { ops, notes } = changesOf(before, { timeline: tl, captions: caps(['Claude']) });
  assert.deepEqual(ops.map(o => o.op), ['drop', 'caption_style', 'pack', 'music_gain', 'words']);
  assert.equal(ops[0].kind, 'emoji'); assert.equal(ops[3].db, -6);
  assert.match(notes[0], /1\/2 chữ nổi tự động/);
  const other = { timeline: tlOf(), captions: caps(['hôm', 'cờ lốt']) };
  const r = applyOps(other, ops);
  assert.deepEqual(r.what.map(w => [w.op, w.n]), [['drop', 2], ['caption_style', 1], ['pack', 1], ['music_gain', 1], ['words', 1]]);
  assert.equal(r.timeline.scenes.filter(s => s.type === 'emoji_pop').length, 1, 'emoji người dùng tự thêm còn');
  assert.ok(r.timeline.scenes.some(s => s._base), 'nền _base còn');
  assert.equal(r.timeline.audio.music[0].gain, -26); assert.equal(r.captions[0].words[1].w, 'Claude');
  assert.equal(other.timeline.caption_style, 'slate', 'không sửa bản vào');
  assert.equal(applyOps(r, ops).n, 0, 'áp lần hai không đổi gì (nhạc không cộng dB hai lần)');
  const off = changesOf(before, { timeline: { ...tlOf(), audio: { music: [{ mood: 'tech', hidden: true }] } }, captions: [] });
  assert.deepEqual(off.ops.map(o => o.op), ['music_off']);
  assert.equal(applyOps(other, off.ops).timeline.audio.music[0].hidden, true);
});

test('baseOf: autopilot_result > set_base > lịch sử cũ nhất; captureBase chỉ chụp clip chưa lưu lần nào', () => {
  assert.equal(captureBase(A), true); assert.equal(captureBase(A), false, 'đã có thì thôi');
  assert.equal(baseOf(A).from, 'set_base'); assert.equal(baseOf(A).captions[0].words[2].w, 'cờ lốt');
  fs.mkdirSync(path.join(D, '.studio/history'), { recursive: true });
  fs.writeFileSync(path.join(D, '.studio/history/2026-01-01T00-00-00.json'), JSON.stringify({ timeline: tlOf({ pack: 'cu' }), captions: [] }));
  fs.writeFileSync(path.join(D, '.studio/history/2026-02-01T00-00-00.json'), JSON.stringify({ timeline: tlOf(), captions: [] }));
  assert.equal(captureBase(D), false, 'đã lưu rồi: không chụp bản đã sửa làm bản gốc');
  assert.equal(baseOf(D).from, 'history'); assert.equal(baseOf(D).timeline.pack, 'cu');
  fs.writeFileSync(path.join(D, '.studio/autopilot_result.json'), JSON.stringify(tlOf({ pack: 'tu-lai' })));
  assert.equal(baseOf(D).from, 'autopilot'); assert.equal(baseOf(D).timeline.pack, 'tu-lai');
  // unlinkSync: rmSync của Node 24 trên Windows không xoá đường dẫn có dấu ("clip ngắn")
  const H = path.join(D, '.studio/history');
  for (const f of fs.readdirSync(H)) fs.unlinkSync(path.join(H, f));
  fs.rmdirSync(H); fs.unlinkSync(path.join(D, '.studio/autopilot_result.json'));
});

test('route: GET chụp bản gốc; xem trước không ghi; áp ghi lịch sử bản cũ + mới, bỏ qua tab đang giữ khoá và job', async () => {
  const out = [];
  const ctx = { project: { dir: A }, pid: tabId(A), job: null, json: (r, o, c) => out.push({ o, c }), body: async q => q.b };
  const R = route(ctx);
  await R({ method: 'GET' }, {}, '/api/clipset');
  for (const d of [B, C, D]) assert.ok(fs.existsSync(path.join(d, '.studio/set_base.json')));
  // người dùng sửa clip A: xoá emoji tự động, đổi kiểu phụ đề, sửa "cờ lốt" → "Claude"
  const tl = tlOf({ caption_style: 'karaoke' }); tl.scenes = tl.scenes.filter(s => !(s.type === 'emoji_pop' && (s._auto || s._ai)));
  fs.writeFileSync(path.join(A, 'timeline.json'), JSON.stringify(tl));
  fs.writeFileSync(path.join(A, 'work/captions.json'), JSON.stringify(caps(['tôi', 'dùng', 'Claude', 'code'])));
  const bBefore = fs.readFileSync(path.join(B, 'timeline.json'), 'utf8');
  ctx.job = { state: 'running', tab: tabId(D), step: 'xuất' };
  const held = [tabId(C), '../../etc', 42];
  await R({ method: 'POST', b: { held } }, {}, '/api/clipset/apply');
  let r = out.at(-1).o;
  assert.equal(r.ok, true); assert.equal(r.from, 'set_base'); assert.equal(r.applied, 0);
  assert.deepEqual(r.ops.map(o => o.op), ['drop', 'caption_style', 'words']);
  assert.deepEqual(r.clips.map(c => [c.i, c.n, c.skip || '']), [[1, 4, ''], [2, 0, 'đang mở ở tab khác'], [3, 0, 'đang chạy tác vụ (xuất)'], [4, 0, 'đã xoá']]);
  assert.ok(!JSON.stringify(r).includes(RUN), 'không lộ đường dẫn');
  assert.equal(fs.readFileSync(path.join(B, 'timeline.json'), 'utf8'), bBefore, 'xem trước không ghi');
  await R({ method: 'POST', b: { held, apply: true } }, {}, '/api/clipset/apply');
  r = out.at(-1).o;
  assert.equal(r.applied, 1); assert.equal(r.clips[0].done, true);
  const b = readClip(B);
  assert.equal(b.timeline.caption_style, 'karaoke'); assert.equal(b.timeline.scenes.filter(s => s.type === 'emoji_pop').length, 1);
  assert.equal(b.captions[0].words[2].w, 'Claude');
  const hist = fs.readdirSync(path.join(B, '.studio/history')).sort();
  assert.equal(hist.length, 2); assert.equal(hist[0], r.clips[0].snapshot + '.json');
  assert.equal(JSON.parse(fs.readFileSync(path.join(B, '.studio/history', hist[0]), 'utf8')).timeline.caption_style, 'slate', 'bản cũ để quay lại');
  assert.equal(readClip(C).timeline.caption_style, 'slate', 'clip đang mở ở tab khác không bị ghi');
  // only: chọn clip; dự án không thuộc bộ → 400
  ctx.job = null;
  await R({ method: 'POST', b: { only: [1], apply: true } }, {}, '/api/clipset/apply');
  assert.equal(out.at(-1).o.applied, 0, 'B đã áp rồi; C, D không được chọn');
  assert.equal(readClip(D).timeline.caption_style, 'slate');
  ctx.project = { dir: path.join(T, 'le') };
  await R({ method: 'POST', b: {} }, {}, '/api/clipset/apply');
  assert.equal(out.at(-1).c, 400);
});
