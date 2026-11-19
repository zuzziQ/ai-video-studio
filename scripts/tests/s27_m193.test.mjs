// S27 M193: dấu dựng trong kịch bản (MOOD, NHẠC, A-ROLL, SFX, nguồn B-ROLL, kiểu CHỮ), bảng dựng theo đoạn, Claude gợi ý dấu.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-s27-m193-'));
process.env.AVS_HOME = TMP;
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const D = await import('../script_doc.mjs');
const B = await import('../script_build.mjs');
const SFX = JSON.parse(fs.readFileSync(new URL('../../assets/sfx/catalog.json', import.meta.url), 'utf8'));
const MOODS = [...new Set(JSON.parse(fs.readFileSync(new URL('../../assets/music/catalog.json', import.meta.url), 'utf8')).map(x => x.mood))];

const SCRIPT = `[MOOD: hồi hộp]
[HOOK] Bạn có biết [cười] 90% người mua nhà bị hớ?
[CHỮ: 90% bị hớ | số] [SFX: whoosh]

Hôm nay mình chia sẻ ba kinh nghiệm quý. [nhac: doi] [A-ROLL: rộng | take 3]
[B-ROLL: căn hộ chung cư | kho] [SFX: tiếng chuông | @kinh] [NHẠC: lạ]

[Không khí: vui] Kinh nghiệm thứ nhất là xem pháp lý. [B-ROLL: sổ hồng] [b-roll: biểu đồ giá | động]

[CTA] Theo dõi kênh để xem tiếp nhé. [QUAY: bỏ] [âm: ding | cuối]`;

test('parseScript: dấu mới, tên khác, không dấu, giá trị lạ vào raw, ngoặc thường vẫn là lời', () => {
  const s = D.parseScript(SCRIPT);
  assert.deepEqual(s.map(x => x.kind), ['hook', 'body', 'body', 'cta']);
  assert.equal(s[0].say, 'Bạn có biết [cười] 90% người mua nhà bị hớ?');
  assert.equal(s[0].mood, 'hồi hộp');
  assert.deepEqual(s[0].screen, ['90% bị hớ']); assert.deepEqual(s[0].screenKind, ['so']);
  assert.deepEqual(s[0].sfx, [{ name: 'whoosh', at: 'dau' }]);
  assert.equal(s[1].music, 'doi'); assert.deepEqual(s[1].aroll, { frame: 'rong', take: 3 });
  assert.deepEqual(s[1].broll, ['căn hộ chung cư']); assert.deepEqual(s[1].brollSrc, ['kho']);
  assert.deepEqual(s[1].sfx, [{ name: 'tiếng chuông', at: '@kinh' }]);
  assert.deepEqual(s[1].raw, ['[NHẠC: lạ]']);
  assert.equal(s[1].mood, undefined, 'mood không chép vào từng đoạn (kế thừa ở bảng dựng)');
  assert.equal(s[2].mood, 'vui'); assert.deepEqual(s[2].brollSrc, [null, 'dong']);
  assert.deepEqual(s[3].aroll, { off: true }); assert.deepEqual(s[3].sfx, [{ name: 'ding', at: 'cuoi' }]);
  // trường cũ giữ y nguyên khi không có dấu mới
  assert.deepEqual(D.parseScript('[HOOK] Mở\n[CHỮ: Giá 99k]'), [{ kind: 'hook', say: 'Mở', screen: ['Giá 99k'], broll: [] }]);
  // NHẠC kho, A-ROLL cận mặt / clip / tệp, B-ROLL ảnh AI / stock / tệp, dấu mới không giá trị là chữ thường
  const k = D.parseScript('Một câu. [NHẠC: kho Bài A] [A-ROLL: cận mặt] [A-ROLL: clip 2] [B-ROLL: bàn | ảnh AI] [B-ROLL: phố | stock] [B-ROLL: logo | tệp logo.png] [âm]');
  assert.equal(k[0].music, 'kho:Bài A'); assert.deepEqual(k[0].aroll, { frame: 'can', take: 2 });
  assert.deepEqual(k[0].brollSrc, ['ai', 'stock', 'tep:logo.png']);
  assert.equal(k[0].say, 'Một câu. [âm]');
  assert.deepEqual(D.parseScript('[MOOD: buồn]'), [], 'chỉ dấu, không lời');
  assert.deepEqual(D.parseScript('A [SFX: x | giữa]')[0].raw, ['[SFX: x | giữa]']);
});

test('stripMarks: bỏ mọi dấu, giữ lời của [HOOK: …], giữ ngoặc thường', () => {
  assert.equal(D.stripMarks('[HOOK: Xin chào] bạn [MOOD: vui] [cười] nhé [B-ROLL: a | kho]').replace(/\s+/g, ' ').trim(), 'Xin chào bạn [cười] nhé');
});

test('scriptMarks / scriptPrompt / markMissing: có dấu dựng, markMissing bỏ qua dấu dựng', () => {
  const segs = D.parseScript(SCRIPT).map((s, i) => ({ ...s, t0: i * 3, t1: i * 3 + 2.5, spoken: true }));
  const sc = { segments: segs };
  const marks = D.scriptMarks(sc);
  for (const k of ['mood', 'music', 'aroll', 'sfx']) assert.ok(marks.some(m => m.kind === k), k);
  assert.equal(marks.find(m => m.kind === 'screen' && m.text === '90% bị hớ'), undefined, 'CHỮ đầu của HOOK là chữ hook');
  assert.equal(marks.find(m => m.kind === 'broll' && m.text === 'căn hộ chung cư').src, 'kho');
  assert.equal(marks.find(m => m.kind === 'sfx' && m.text === 'tiếng chuông').pos, '@kinh');
  const p = D.scriptPrompt(sc);
  assert.match(p, /· MOOD: "hồi hộp"/); assert.match(p, /· NHẠC: đổi bài/); assert.match(p, /· A-ROLL: rộng · take 3/);
  assert.match(p, /· SFX: "tiếng chuông" \(lúc nói "kinh"\)/); assert.match(p, /B-ROLL: "căn hộ chung cư" \(nguồn kho\)/); assert.match(p, /CHỮ: "90% bị hớ" \(kiểu so\)/);
  const miss = D.markMissing(marks, [], {});
  assert.ok(miss.length && miss.every(m => ['hook', 'screen', 'broll', 'cta'].includes(m.kind)));
});

test('moodOf / sfxOf: chữ tự do → mood / SFX của catalog', () => {
  assert.equal(B.moodOf('hồi hộp', MOODS), 'suspense');
  assert.equal(B.moodOf('Vui vẻ', MOODS), 'happy');
  assert.equal(B.moodOf('suspense', MOODS), 'suspense');
  assert.equal(B.moodOf('xyz lạ', MOODS), null);
  assert.equal(B.sfxOf('whoosh_2', SFX), 'whoosh_2');
  assert.equal(B.sfxOf('tiếng chuông', SFX), 'ding');
  assert.equal(B.sfxOf('zzzqqq', SFX), null);
});

// nguồn giả: Kho có "can ho", thư viện có "so hong", stock rỗng
const DYN = [{ id: 'gia--bar_chart', tags: ['biểu đồ giá', 'giá'] }, { id: 'chung', tags: ['chung'] }];
const SRC = (extra = {}) => ({
  kho: (q, taken) => (/căn hộ/.test(q) ? [{ rel: 'BRoll/can-ho-01.mp4', score: 3.5 }, { rel: 'BRoll/can-ho-02.mp4', score: 3.5 }].filter(x => !taken.has('kho:' + x.rel)) : []),
  files: () => [{ rel: 'Anh/logo.png', name: 'logo.png' }],
  lib: q => (/sổ hồng/.test(q) ? [{ id: 'lib1', score: 2 }] : []),
  stock: null, dyn: q => B.dynamicFor(q, DYN), ...extra,
});

test('pickBroll: Kho → thư viện → stock → b-roll động; nguồn ép không rơi xuống nguồn khác', async () => {
  const a = await B.pickBroll('căn hộ chung cư', null, SRC());
  assert.equal(a.src, 'kho'); assert.equal(a.pick, 'BRoll/can-ho-01.mp4'); assert.ok(a.alts.includes('kho:BRoll/can-ho-02.mp4'));
  assert.equal((await B.pickBroll('sổ hồng', null, SRC())).src, 'lib');
  const st = await B.pickBroll('bãi biển', null, SRC({ stock: async () => [{ url: 'https://x/1.mp4' }] }));
  assert.equal(st.src, 'stock'); assert.equal(st.pick, 'https://x/1.mp4');
  const dn = await B.pickBroll('bãi biển', null, SRC());
  assert.equal(dn.src, 'dong', 'b-roll động là chốt chặn cuối');
  const forced = await B.pickBroll('bãi biển', 'kho', SRC());
  assert.equal(forced.pick, null); assert.equal(forced.miss, 'Kho không có cảnh khớp');
  assert.equal((await B.pickBroll('biểu đồ giá', 'dong', SRC())).pick, 'gia--bar_chart');
  assert.equal((await B.pickBroll('logo', 'tep:logo.png', SRC())).pick, 'Anh/logo.png');
  const ai = await B.pickBroll('bàn làm việc', 'ai', SRC());
  assert.equal(ai.src, 'ai'); assert.equal(ai.pick, null); assert.ok(ai.pending, 'ảnh AI không tự sinh lúc dựng bảng');
  assert.ok((await B.pickBroll('sổ hồng', null, SRC({ ai: true }))).alts.some(x => x.startsWith('ai:')));
});

test('buildSheet: mood kế thừa, nhạc / A-roll / SFX / chữ theo dấu, ô auto khi không dấu, nguồn từng ô', async () => {
  const segs = D.parseScript(SCRIPT).map((s, i) => ({ ...s, t0: i * 3, t1: i * 3 + 2.5, spoken: true }));
  const words = [{ w: 'kinh', s: 4.2, e: 4.5 }];
  const sh = await B.buildSheet({ updated: 'u1', segments: segs }, { moods: MOODS, sfx: SFX, words, src: SRC() });
  assert.equal(sh.version, 1); assert.equal(sh.script_updated, 'u1'); assert.equal(sh.rows.length, 4);
  const [r0, r1, r2, r3] = sh.rows;
  assert.deepEqual(r0.mood, { v: 'suspense', text: 'hồi hộp', from: 'mark' });
  assert.equal(r1.mood.v, 'suspense'); assert.equal(r1.mood.inherit, 0, 'kế thừa từ đoạn 0');
  assert.equal(r2.mood.v, 'happy'); assert.equal(r3.mood.v, 'happy');
  assert.deepEqual(r0.music, { v: 'bed', from: 'auto' }); assert.deepEqual(r1.music, { v: 'doi', from: 'mark' });
  assert.deepEqual(r1.aroll, { frame: 'rong', take: 3, from: 'mark' }); assert.equal(r3.aroll.off, true); assert.equal(r0.aroll.from, 'auto');
  assert.equal(r1.broll[0].src, 'kho'); assert.equal(r1.broll[0].from, 'mark');
  assert.equal(r2.broll[0].src, 'lib'); assert.equal(r2.broll[1].pick, 'gia--bar_chart');
  assert.deepEqual(r0.sfx[0], { name: 'whoosh', q: 'whoosh', at: 0, pos: 'dau', from: 'mark' });
  assert.equal(r1.sfx[0].name, 'ding'); assert.equal(r1.sfx[0].at, 4.2, '@từ → lúc nói từ đó');
  assert.equal(r3.sfx[0].at, 10.9, 'cuối đoạn');
  assert.deepEqual(r0.screen, [{ text: '90% bị hớ', kind: 'so', from: 'mark' }]);
  assert.ok(sh.rows.every(r => r.lock === false));
  // kịch bản trơn: ô auto theo luật (SFX whoosh ở hook, Kho khớp rõ lời)
  const plain = D.parseScript('[HOOK] Mở đầu nè\n\nGiới thiệu căn hộ chung cư mới').map((s, i) => ({ ...s, t0: i * 2, t1: i * 2 + 1.5 }));
  const p = await B.buildSheet({ segments: plain }, { moods: MOODS, sfx: SFX, mood: 'tech', src: SRC() });
  assert.deepEqual(p.rows[0].mood, { v: 'tech', from: 'auto' });
  assert.equal(p.rows[0].sfx[0].from, 'auto'); assert.equal(p.rows[1].broll[0].from, 'auto'); assert.equal(p.rows[1].broll[0].src, 'kho');
});

test('buildSheet dựng lại: giữ ô user khi lời không đổi, hàng khoá giữ nguyên, hàng đổi lời dựng lại', async () => {
  const mk = t => D.parseScript(t).map((s, i) => ({ ...s, t0: i * 3, t1: i * 3 + 2 }));
  const o = { moods: MOODS, sfx: SFX, src: SRC() };
  const first = await B.buildSheet({ segments: mk('Câu một.\n\nCâu hai.\n\nCâu ba.') }, o);
  first.rows[0].mood = { v: 'epic', from: 'user' };
  first.rows[0].broll = [{ q: 'cảnh tự chọn', src: 'kho', pick: 'BRoll/x.mp4', alts: [], from: 'user' }];
  first.rows[1].lock = true; first.rows[1].music = { v: 'tat', from: 'user' };
  first.rows[2].mood = { v: 'sad', from: 'user' };
  const again = await B.buildSheet({ segments: mk('Câu một. [MOOD: vui]\n\nCâu hai.\n\nCâu ba đã sửa.') }, { ...o, prev: first });
  assert.deepEqual(again.rows[0].mood, { v: 'epic', from: 'user' }, 'ô user thắng dấu mới');
  assert.equal(again.rows[0].broll[0].from, 'user');
  assert.equal(again.rows[1].lock, true); assert.equal(again.rows[1].music.v, 'tat');
  assert.equal(again.rows[2].mood.from, 'mark', 'hàng đổi lời dựng lại');
});

test('checkSuggested: Claude không được sửa lời; giới hạn số dấu, MOOD đổi ≥ ~10 s, không A-ROLL clip', () => {
  const orig = 'Bạn có biết không?\n\nThân bài nè, giá tốt.\n\nTheo dõi nhé.';
  const ok = B.checkSuggested(orig, '[HOOK] Bạn có biết không? [MOOD: hồi hộp]\n\nThân bài nè, giá tốt. [B-ROLL: căn hộ] [SFX: ding | cuối]\n\n[CTA] Theo dõi nhé.');
  assert.equal(ok.ok, true); assert.equal(ok.added, 5);
  const bad = B.checkSuggested(orig, 'Bạn có biết chưa? [MOOD: vui]\n\nThân bài nè, giá tốt.\n\nTheo dõi nhé.');
  assert.equal(bad.ok, false); assert.equal(bad.error, 'Claude đã sửa lời, không áp');
  assert.equal(B.checkSuggested(orig, 'Bạn có biết không?').ok, false, 'thiếu lời');
  const many = B.checkSuggested(orig, 'Bạn có biết không? [B-ROLL: a] [B-ROLL: b] [B-ROLL: c]\n\nThân bài nè, giá tốt.\n\nTheo dõi nhé.');
  assert.equal(many.ok, false); assert.match(many.error, /B-ROLL/);
  const take = B.checkSuggested(orig, 'Bạn có biết không? [A-ROLL: clip 2]\n\nThân bài nè, giá tốt.\n\nTheo dõi nhé.');
  assert.equal(take.ok, false); assert.match(take.error, /take/);
  assert.equal(B.checkSuggested(orig, 'Bạn có biết không? [A-ROLL: cận mặt]\n\nThân bài nè, giá tốt.\n\nTheo dõi nhé.').ok, true);
  const fast = B.checkSuggested(orig, '[MOOD: vui] Bạn có biết không?\n\n[MOOD: buồn] Thân bài nè, giá tốt.\n\nTheo dõi nhé.');
  assert.equal(fast.ok, false); assert.match(fast.error, /đổi MOOD/);
  // dấu người dùng đã có không bị tính vượt giới hạn
  const mine = 'A [CHỮ: 1] [CHỮ: 2] [CHỮ: 3]';
  assert.equal(B.checkSuggested(mine, mine + ' [SFX: whoosh]').ok, true);
  assert.match(B.suggestPrompt('Xin chào', { brand: 'Nhà Xanh', moods: ['happy'] }), /Nhà Xanh[\s\S]*happy[\s\S]*Xin chào/);
});

// ---------- route 19_script với ctx giả ----------
const W = s => s.split(' ').map((w, i) => ({ w, s: +(i * .3).toFixed(2), e: +(i * .3 + .25).toFixed(2) }));
function project() {
  const dir = fs.mkdtempSync(path.join(TMP, 'p-'));
  fs.mkdirSync(path.join(dir, 'work'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'work/captions.json'), JSON.stringify([{ t0: 0, t1: 1.15, words: W('xin chào các bạn') }, { t0: 1.2, t1: 2.35, words: W('cảm ơn đã xem').map(w => ({ ...w, s: w.s + 1.2, e: w.e + 1.2 })) }]));
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({ duration: 6, width: 1080, height: 1920, brand: { name: 'Nhà Xanh' }, captions: 'work/captions.json', scenes: [] }));
  return dir;
}
function fakeCtx(dir, llm) {
  const P = rel => path.join(dir, rel), out = {};
  return {
    out, llm, project: { dir, tlFile: P('timeline.json') },
    json: (res, o, c = 200) => { out.body = o; out.code = c; },
    body: async req => req._json || {},
    readProject: () => { const tl = JSON.parse(fs.readFileSync(P('timeline.json'), 'utf8')); return { timeline: tl, captions: JSON.parse(fs.readFileSync(P(tl.captions), 'utf8')) }; },
    save: ({ timeline, captions }) => { fs.writeFileSync(P(timeline.captions), JSON.stringify(captions)); fs.writeFileSync(P('timeline.json'), JSON.stringify(timeline)); },
  };
}
const req = (method, json) => Object.assign(Readable.from([]), { method, _json: json });

test('route: lưu kịch bản dựng bảng dựng, GET / POST /api/script/sheet, Bỏ kịch bản xoá bảng', async () => {
  const route = (await import('../../studio/routes/19_script.mjs')).default;
  const dir = project(), ctx = fakeCtx(dir), h = route(ctx);
  await h(req('POST', { text: '[MOOD: vui] [SFX: whoosh] Xin chào các bạn\n\nCảm ơn đã xem [B-ROLL: biểu đồ | động]' }), {}, '/api/script');
  assert.equal(ctx.out.code, 200, JSON.stringify(ctx.out.body));
  assert.equal(ctx.out.body.sheet.rows, 2);
  await h(req('GET'), {}, '/api/script/sheet');
  const sh = ctx.out.body.sheet;
  assert.equal(sh.rows[0].mood.v, 'happy'); assert.equal(sh.rows[1].mood.inherit, 0);
  assert.equal(sh.rows[0].sfx[0].at, 0); assert.equal(sh.rows[1].broll[0].src, 'dong');
  assert.equal(sh.script_updated, D.readScript(dir).updated);
  await h(req('POST', {}), {}, '/api/script/sheet'); assert.equal(ctx.out.body.ok, true);
  await h(req('POST', {}), {}, '/api/script/clear');
  assert.equal(fs.existsSync(B.sheetFile(dir)), false);
  await h(req('POST', {}), {}, '/api/script/sheet'); assert.equal(ctx.out.code, 400);
});

test('route /api/script/suggest: nhận dấu khi lời giữ nguyên, hỏi lại một lần rồi báo lỗi khi Claude sửa lời; không lưu', async () => {
  const route = (await import('../../studio/routes/19_script.mjs')).default;
  const L = await import('../llm.mjs');
  const text = 'Xin chào các bạn\n\nCảm ơn đã xem';
  let prompts = [];
  const llm = answers => ({ askJSON: (p, o) => L.askJSON(p, { ...o, run: async q => { prompts.push(q); return { text: JSON.stringify({ text: answers.shift() }), provider: 'claude' }; } }) });
  const dir = project();
  let ctx = fakeCtx(dir, llm(['[MOOD: vui] Xin chào các bạn\n\nCảm ơn đã xem [SFX: ding | cuối]']));
  await route(ctx)(req('POST', { text }), {}, '/api/script/suggest');
  assert.equal(ctx.out.code, 200, JSON.stringify(ctx.out.body)); assert.equal(ctx.out.body.added, 2);
  assert.match(prompts[0], /Nhà Xanh[\s\S]*dọc 9:16/);
  assert.equal(D.readScript(dir), null, 'gợi ý không tự lưu');
  prompts = [];
  ctx = fakeCtx(dir, llm(['Xin chào mọi người\n\nCảm ơn đã xem', 'Xin chào bạn\n\nCảm ơn']));
  await route(ctx)(req('POST', { text }), {}, '/api/script/suggest');
  assert.equal(ctx.out.code, 422); assert.equal(ctx.out.body.error, 'Claude đã sửa lời, không áp');
  assert.equal(prompts.length, 2); assert.match(prompts[1], /Giữ nguyên từng chữ nói/);
  ctx = fakeCtx(dir, llm([]));
  await route(ctx)(req('POST', { text: ' ' }), {}, '/api/script/suggest'); assert.equal(ctx.out.code, 400);
});
