// S27 M195: nhạc theo đoạn kịch bản mà vẫn một nền nhạc tự sinh: musicFromSheet (nhiều khúc, xfade / offset, 10 s / lần đổi, NHẠC tắt /
// bật / đổi / to / nhỏ / kho), sheetMusic (_was, nhạc người dùng giữ, khúc _orig giữ cả nền), duck mặc định, server = client,
// AI dựng ↔ Áp bảng theo mọi thứ tự luôn còn đúng một nền. music_auto bỏ qua nền _sheet: scripts/tests/test_music_sheet.py.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-s27-m195-'));
process.env.AVS_HOME = TMP;
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const B = await import('../script_build.mjs');
const E = await import('../ai_edit.mjs');
const { DEFAULT_DUCK, DEFAULT_MUSIC_GAIN } = await import('../audio_defaults.mjs');
const CATALOG = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/music/catalog.json'), 'utf8'));

const cell = (v, from = 'mark') => ({ v, from });
const row = (seg, t0, t1, mood, music) => ({ seg, t0, t1, kind: 'body', say: `đoạn ${seg}`, mood: mood ? cell(mood) : cell(null, 'auto'),
  music: music ? cell(music) : cell('bed', 'auto'), aroll: { frame: null, take: null, from: 'auto' }, broll: [], sfx: [], screen: [] });
// hai mood: hype 0–14 s (2 đoạn), sad 14–30 s (2 đoạn)
const rows2 = () => [row(0, 0, 6, 'hype'), row(1, 6, 14, 'hype'), row(2, 14, 22, 'sad'), row(3, 22, 30, 'sad')];
const brief = m => m.map(x => [x.t0, x.t1, x.mood, x._sheet]);

test('musicFromSheet: hai mood → hai khúc nối liền phủ cả video, xfade + offset, gain mặc định, _ai + _sheet', () => {
  const m = B.musicFromSheet(rows2(), 30, CATALOG);
  assert.deepEqual(brief(m), [[0, 14, 'hype', 0], [14, 30, 'sad', 2]]);
  assert.ok(m.every(x => x._ai && x.gain === DEFAULT_MUSIC_GAIN && x.xfade === .8 && x.offset === 0));
  assert.equal(m[0].fade_in, .3); assert.equal(m[1].fade_in, .8); assert.equal(m[0].fade_out, .8); assert.equal(m[1].fade_out, 1.5);
  // hàng trước dấu MOOD đầu lấy mood chốt đầu tiên; hàng kề cùng mood gộp
  const r = rows2(); r[0].mood = cell(null, 'auto');
  assert.deepEqual(brief(B.musicFromSheet(r, 30, CATALOG)), [[0, 14, 'hype', 0], [14, 30, 'sad', 2]]);
  // không ô chốt mood / nhạc → undefined (giữ nhạc đang có)
  assert.equal(B.musicFromSheet(rows2().map(x => ({ ...x, mood: cell('tech', 'auto') })), 30, CATALOG), undefined);
  // mood lạ với catalog → lấy mood hợp lệ kế
  const odd = rows2(); odd[2].mood = cell('khong_co');
  assert.deepEqual(brief(B.musicFromSheet(odd, 30, CATALOG)), [[0, 22, 'hype', 0], [22, 30, 'sad', 3]]);
});

test('musicFromSheet: tối đa một lần đổi / 10 s: dời tới ranh giới đoạn kế, ghi chú; quay lại mood cũ thì bỏ lần đổi', () => {
  const notes = [], r = [row(0, 0, 5, 'hype'), row(1, 5, 8, 'sad'), row(2, 8, 12, null), row(3, 12, 30, null)];
  const m = B.musicFromSheet(r, 30, CATALOG, { notes });
  assert.deepEqual(brief(m), [[0, 12, 'hype', 0], [12, 30, 'sad', 3]]);
  assert.ok(notes.some(n => /dưới 10 s/.test(n)) && notes.some(n => /12\.0 s/.test(n)), notes.join(' | '));
  const back = [row(0, 0, 5, 'hype'), row(1, 5, 8, 'sad'), row(2, 8, 30, 'hype')];
  assert.deepEqual(brief(B.musicFromSheet(back, 30, CATALOG)), [[0, 30, 'hype', 0]]);
  // đổi sát cuối video (< 5 s) bị bỏ, có ghi chú
  const n2 = [], end = [row(0, 0, 27, 'hype'), row(1, 27, 30, 'sad')];
  assert.deepEqual(brief(B.musicFromSheet(end, 30, CATALOG, { notes: n2 })), [[0, 30, 'hype', 0]]);
  assert.ok(n2.some(n => /bỏ lần đổi/.test(n)));
});

test('musicFromSheet: NHẠC tắt / bật, đổi bài, to / nhỏ, kho', () => {
  const off = B.musicFromSheet([row(0, 0, 12, 'hype'), row(1, 12, 18, null, 'tat'), row(2, 18, 30, null, 'bat')], 30, CATALOG);
  assert.deepEqual(brief(off), [[0, 12, 'hype', 0], [18, 30, 'hype', 2]]);
  assert.equal(off[0].fade_out, .5); assert.equal(off[0].xfade, 0); assert.equal(off[1].fade_in, .5);
  assert.ok(off[1].offset > 0, 'bật lại phát tiếp, không về đầu bài');
  // đổi: bài khác cùng mood (hype_2) khi catalog có
  const doi = B.musicFromSheet([row(0, 0, 12, 'hype'), row(1, 12, 30, null, 'doi')], 30, CATALOG);
  assert.deepEqual(brief(doi), [[0, 12, 'hype', 0], [12, 30, 'hype_2', 1]]);
  // đổi khi mood chỉ có một bài: cùng bài, offset khác
  const one = [{ name: 'calm', mood: 'calm', dur: 60 }];
  const d1 = B.musicFromSheet([row(0, 0, 12, 'calm'), row(1, 12, 30, null, 'doi')], 30, one);
  assert.equal(d1[1].mood, 'calm'); assert.ok(d1[1].offset !== d1[0].offset + 12 && d1[1].offset > 0);
  // to / nhỏ: ±4 dB, trong −30…−10, phát tiếp cùng bài
  const lv = B.musicFromSheet([row(0, 0, 12, 'hype'), row(1, 12, 20, null, 'nho'), row(2, 20, 30, null, 'to')], 30, CATALOG);
  assert.deepEqual(lv.map(x => x.gain), [-10, -14, -10]);
  assert.equal(lv[1].mood, 'hype'); assert.equal(lv[1].offset, 12);
  const quiet = B.musicFromSheet([row(0, 0, 30, 'hype', 'nho')], 30, CATALOG, { gain: -28 });
  assert.equal(quiet[0].gain, -30);
  // kho: khúc mang pick (sheetMain tìm bài trong Kho)
  const k = B.musicFromSheet([row(0, 0, 12, 'hype'), row(1, 12, 30, null, 'kho:lofi chill')], 30, CATALOG);
  assert.equal(k[1].pick, 'kho:lofi chill'); assert.equal(k[0].pick, undefined);
});

test('ghi chú _script: khúc trỏ dấu MOOD của đoạn (trùng scriptRequests), dấu NHẠC thì kind NHẠC; báo cáo đếm từng khúc; MOOD bị bỏ có lý do', () => {
  const r = rows2(); r[1].mood = { v: 'hype', from: 'mark', inherit: 0 }; r[3].mood = { v: 'sad', from: 'mark', inherit: 2 }; r[0].mood.text = 'sôi động';
  const sheet = { rows: [...r, row(4, 30, 40, null, 'doi')] }, m = B.musicFromSheet(sheet.rows, 40, CATALOG);
  assert.deepEqual(m.map(x => x._script.id), ['0:mood', '2:mood', '4:music']);
  assert.equal(m[0]._script.kind, 'MOOD'); assert.equal(m[0]._script.text, 'sôi động'); assert.equal(m[2]._script.kind, 'NHẠC');
  const rep = B.scriptReport(B.scriptRequests(sheet), { music: m });
  assert.ok(rep.req.filter(q => q.kind === 'MOOD').every(q => q.ok), JSON.stringify(rep.req));
  // MOOD sát cuối video không đổi được: yêu cầu chưa làm, có lý do
  const raw = B.sheetToPlan({ rows: [row(0, 0, 27, 'hype'), row(1, 27, 30, 'sad')] }, { duration: 30 }, { catalog: CATALOG });
  const rep2 = B.scriptReport(B.scriptRequests({ rows: [row(0, 0, 27, 'hype'), row(1, 27, 30, 'sad')] }), { music: raw.music }, raw.miss);
  const q = rep2.req.find(x => x.id === '1:mood');
  assert.equal(q.ok, false); assert.match(q.why, /dưới 10 s/);
});

test('sheetToPlan / planFromSheet: plan.music là nền nhiều khúc, ghi chú nhạc ra plan.notes', () => {
  const sheet = { version: 1, rows: [row(0, 0, 5, 'hype'), row(1, 5, 12, 'sad'), row(2, 12, 30, null)] };
  const raw = B.sheetToPlan(sheet, { width: 1080, height: 1920, duration: 30 }, { catalog: CATALOG });
  assert.deepEqual(brief(raw.music), [[0, 12, 'hype', 0], [12, 30, 'sad', 2]]);
  // không có ranh giới đoạn nào sau 10 s: giữ một bài, ghi chú
  const short = B.sheetToPlan({ rows: [row(0, 0, 5, 'hype'), row(1, 5, 30, 'sad')] }, { duration: 30 }, { catalog: CATALOG });
  assert.deepEqual(brief(short.music), [[0, 30, 'hype', 0]]); assert.ok(short.notes.some(n => /bỏ lần đổi/.test(n)));
  assert.ok(raw.notes.length >= 1);
  assert.equal(E.musicLabel(raw.music), 'hype → sad (2 khúc)');
  assert.equal(E.musicLabel([]), 'tắt');
});

// bản client (studio/features/20_ai.js) chạy trong node trên cùng đầu vào, như s27_m194.test.mjs
function clientApply() {
  const src = fs.readFileSync(path.join(ROOT, 'studio/features/20_ai.js'), 'utf8');
  const a = src.indexOf('  const userM = m =>'), b = src.indexOf('  // S13 · M104: what the placement step did');
  assert.ok(a > 0 && b > a && src.slice(a, b).includes('function sheetMusic'), 'không tìm thấy sheetMusic / applyPlan trong 20_ai.js');
  return (tl, caps, plan) => {
    const S = { pushUndo() {}, changed() {} };
    return new Function('S', 'TL', 'CAP', src.slice(a, b) + '\n;applyPlan(JSON.parse(JSON.stringify(arguments[3])), { noUndo: true }); return CAP;')(S, tl, caps, plan);
  };
}
const TL = () => ({ width: 1080, height: 1920, duration: 30, pack: 'slate', title: 'x', scenes: [],
  audio: { music: [{ t0: 0, t1: 30, mood: 'tech', gain: -10 }], sfx: [] } }); // nhạc khởi đầu, chưa đặt duck
// kế hoạch AI dựng có kịch bản (main của ai_edit.mjs: mergeScript + plan.script), nhạc là nền nhiều khúc theo dấu
const sheetPlan = () => ({ pack: 'slate', caption_style: 'slate', hook: '', captions: [], scenes: [], sfx: [], dropped: [], script: { total: 0, done: 0, req: [] }, music: B.musicFromSheet(rows2(), 30, CATALOG) });
const aiPlan = () => ({ pack: 'slate', caption_style: 'slate', hook: '', captions: [], scenes: [], sfx: [], music: { t0: 0, t1: 30, mood: 'happy', gain: -20, _ai: true } });
const autoBeds = () => [{ t0: 0, t1: 16, mood: 'tech', gain: -18, _auto: true }, { t0: 16, t1: 30, mood: 'sad', gain: -18, _auto: true }];
// kế hoạch đầy đủ dạng kế hoạch có kịch bản, đổi mỗi nhạc
const withMusic = music => ({ ...sheetPlan(), music });
// mỗi thời điểm (trừ chỗ xfade) có đúng một khúc nhạc tự sinh / khởi đầu phát; nhạc người dùng không tính
const coverOnce = (music, dur = 30) => {
  const auto = music.filter(m => !E.isUserMusic(m) && !m.hidden);
  for (let t = .25; t < dur; t += .5) assert.equal(auto.filter(m => m.t0 <= t && t < m.t1).length, 1, `t=${t}: ${JSON.stringify(auto.map(m => [m.t0, m.t1, m.mood]))}`);
};
const norm = tl => JSON.parse(JSON.stringify(tl.audio));

test('Áp bảng: nền cũ (_ai / _auto / khởi đầu) vào _was, duck mặc định, server = client; mọi thứ tự AI dựng ↔ Tự động ↔ Áp bảng còn một nền', () => {
  const client = clientApply();
  const s = TL(), c = TL();
  E.applyPlan(s, [], sheetPlan()); client(c, [], sheetPlan());
  assert.deepEqual(norm(c), norm(s));
  assert.deepEqual(brief(s.audio.music), [[0, 14, 'hype', 0], [14, 30, 'sad', 2]]);
  assert.deepEqual(s.audio.music[0]._was, [{ t0: 0, t1: 30, mood: 'tech', gain: -10 }]);
  assert.deepEqual(s.audio.duck, DEFAULT_DUCK);
  // duck đã đặt (người dùng tắt) thì giữ
  const d = TL(); d.audio.duck = { on: false, amount_db: -6 }; E.applyPlan(d, [], sheetPlan());
  assert.deepEqual(d.audio.duck, { on: false, amount_db: -6 });
  // AI dựng sau Áp bảng: giữ nền bảng, không thêm nền AI
  E.applyPlan(s, [], aiPlan()); client(c, [], aiPlan());
  assert.deepEqual(norm(c), norm(s)); coverOnce(s.audio.music);
  assert.ok(s.audio.music.every(m => m._sheet != null));
  // Tự động chạy trước (nền _auto cất _ai) rồi Áp bảng: thay cả nền _auto
  const t2 = TL(), c2 = TL();
  for (const tl of [t2, c2]) tl.audio.music = autoBeds().map((m, i) => (i ? m : { ...m, _was: [{ t0: 0, t1: 30, mood: 'happy', _ai: true }] }));
  E.applyPlan(t2, [], sheetPlan()); client(c2, [], sheetPlan());
  assert.deepEqual(norm(c2), norm(t2)); coverOnce(t2.audio.music);
  assert.equal(t2.audio.music[0]._was.length, 2, 'hai khúc _auto (mỗi khúc giữ _was của nó)');
  // Áp bảng lần nữa: thay nền bảng cũ, _was mang tiếp (không lồng nền bảng trong nền bảng)
  const was0 = structuredClone(t2.audio.music[0]._was);
  E.applyPlan(t2, [], sheetPlan()); client(c2, [], sheetPlan());
  assert.deepEqual(norm(c2), norm(t2)); coverOnce(t2.audio.music);
  assert.deepEqual(t2.audio.music[0]._was, was0);
  // Hoàn tác nhạc của bảng: trả đúng _was
  assert.deepEqual(E.dropSheetMusic(t2.audio.music), was0);
  // mọi thứ tự AI / bảng (Tự động bỏ qua nền _sheet: test_music_sheet.py)
  for (const order of [['ai', 'sheet'], ['sheet', 'ai'], ['ai', 'sheet', 'ai', 'sheet'], ['sheet', 'sheet', 'ai']]) {
    const x = TL(), y = TL();
    for (const k of order) { const p = k === 'ai' ? aiPlan() : sheetPlan(); E.applyPlan(x, [], structuredClone(p)); client(y, [], p); }
    assert.deepEqual(norm(y), norm(x), order.join('→')); coverOnce(x.audio.music);
  }
});

test('Áp bảng: nhạc người dùng giữ song song / thắng; khúc _sheet chỉnh tay (_orig) → giữ cả nền; bảng tắt nhạc', () => {
  const client = clientApply();
  // nhạc file của người dùng phủ cả video: bảng không thêm nền
  const u = TL(), u2 = TL(); u.audio.music = u2.audio.music = undefined;
  for (const tl of [u, u2]) tl.audio.music = [{ t0: 0, t1: 30, file: 'media/a.mp3', gain: -18 }];
  E.applyPlan(u, [], sheetPlan()); client(u2, [], sheetPlan());
  assert.deepEqual(norm(u2), norm(u)); assert.deepEqual(u.audio.music, [{ t0: 0, t1: 30, file: 'media/a.mp3', gain: -18 }]);
  // nhạc đặt tay một đoạn (manual) giữ song song với nền bảng
  const m = TL(), m2 = TL();
  for (const tl of [m, m2]) tl.audio.music.push({ t0: 3, t1: 6, mood: 'epic', gain: -16, manual: true });
  E.applyPlan(m, [], sheetPlan()); client(m2, [], sheetPlan());
  assert.deepEqual(norm(m2), norm(m)); assert.ok(m.audio.music.some(x => x.manual)); coverOnce(m.audio.music);
  // khúc thứ hai của nền bảng chỉnh tay → lần Áp sau giữ cả nền (không ghép nửa cũ nửa mới)
  const o = TL(); E.applyPlan(o, [], sheetPlan()); o.audio.music[1] = { ...o.audio.music[1], gain: -16, _orig: { gain: -10 } };
  const before = structuredClone(o.audio.music), o2 = structuredClone(o);
  const other = withMusic(B.musicFromSheet([row(0, 0, 30, 'calm')], 30, CATALOG));
  E.applyPlan(o, [], structuredClone(other)); client(o2, [], other);
  assert.deepEqual(o.audio.music, before); assert.deepEqual(norm(o2), norm(o));
  // bảng tắt nhạc cả video: nền tự sinh cũ cất, không phát gì
  const z = TL(); E.applyPlan(z, [], withMusic(B.musicFromSheet([row(0, 0, 30, 'hype', 'tat')], 30, CATALOG)));
  assert.deepEqual(z.audio.music, []);
  // bảng không chốt nhạc (music undefined): giữ nguyên
  // kịch bản không chốt nhạc: mergeScript giữ nền Claude chọn (một nền như trước M195)
  const k = TL(); E.applyPlan(k, [], withMusic({ t0: 0, t1: 30, mood: 'happy', gain: -20, _ai: true }));
  assert.deepEqual(k.audio.music, [{ t0: 0, t1: 30, mood: 'happy', gain: -20, _ai: true }]);
});
