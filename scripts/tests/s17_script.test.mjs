// S17 M123: kịch bản có sẵn — tách dấu, .docx, căn chữ với whisper, chia đều khi không lời, lưu / bỏ, route, Tự lái, AI dựng, QC, claim gate.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-s17-script-'));
process.env.AVS_HOME = TMP;
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const D = await import('../script_doc.mjs');

const W = s => s.split(' ').map((w, i) => ({ w, s: +(i * .3).toFixed(2), e: +(i * .3 + .25).toFixed(2) }));
const SCRIPT = '[HOOK] Bạn có biết 90% người mua nhà bị hớ?\n[CHỮ: 90% bị hớ]\n\nHôm nay mình chia sẻ ba kinh nghiệm quý.\n[B-ROLL: căn hộ chung cư]\n\nĐoạn này người nói đã bỏ qua hoàn toàn không đọc.\n\n[CTA] Theo dõi kênh để xem tiếp nhé.';

test('parseScript: dấu [HOOK] [CHỮ] [B-ROLL] [CTA], dòng trống tách đoạn', () => {
  const s = D.parseScript(SCRIPT);
  assert.deepEqual(s.map(x => x.kind), ['hook', 'body', 'body', 'cta']);
  assert.equal(s[0].say, 'Bạn có biết 90% người mua nhà bị hớ?');
  assert.deepEqual(s[0].screen, ['90% bị hớ']);
  assert.deepEqual(s[1].broll, ['căn hộ chung cư']);
  assert.equal(s[3].say, 'Theo dõi kênh để xem tiếp nhé.');
});

test('parseScript: không dấu, không dòng trống → mỗi dòng một đoạn; [HOOK] đứng riêng nhận dòng sau; dấu trước chữ gắn vào đoạn kế', () => {
  assert.deepEqual(D.parseScript('Dòng một.\nDòng hai.').map(x => x.say), ['Dòng một.', 'Dòng hai.']);
  const h = D.parseScript('[HOOK]\nMở đầu nè\nThân bài');
  assert.deepEqual(h.map(x => [x.kind, x.say]), [['hook', 'Mở đầu nè'], ['body', 'Thân bài']]);
  const p = D.parseScript('[chu: Giá chỉ 99k]\n\nMón này giá chỉ 99k thôi');
  assert.deepEqual(p[0].screen, ['Giá chỉ 99k']);
  assert.deepEqual(D.parseScript('[CHỮ: chỉ dấu]'), []);
  assert.deepEqual(D.parseScript('- gạch đầu dòng\n1. đánh số').map(x => x.say), ['gạch đầu dòng', 'đánh số']);
});

// .docx tối thiểu: zip một file word/document.xml (nén deflate)
function docx(paras) {
  const xml = Buffer.from(`<?xml version="1.0"?><w:document><w:body>${paras.map(p => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`);
  const data = zlib.deflateRawSync(xml), name = Buffer.from('word/document.xml');
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(xml.length, 22); lh.writeUInt16LE(name.length, 26);
  const local = Buffer.concat([lh, name, data]);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(xml.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(0, 42);
  const cd = Buffer.concat([ch, name]);
  const eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(1, 8); eo.writeUInt16LE(1, 10); eo.writeUInt32LE(cd.length, 12); eo.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, cd, eo]);
}

test('docxText: đọc đoạn Word, giải mã &amp;, đoạn trống thành dòng trống', () => {
  const t = D.docxText(docx(['[HOOK] Mua &amp; bán', '', 'Thân bài']));
  assert.equal(t, '[HOOK] Mua & bán\n\nThân bài');
  assert.throws(() => D.docxText(Buffer.from('không phải zip')), /docx/);
});

test('alignScript: chữ kịch bản lấy giờ của whisper (khớp sau khi bỏ dấu), số đọc thành chữ vẫn có giờ, đoạn không nói bị đánh dấu', () => {
  const heard = W('bạn có biết chín mươi phần trăm người mua nhà bị hớ hôm nay mình chia sẽ ba kinh nghiệm quý theo dõi kênh để xem tiếp nhé');
  const r = D.alignScript(D.parseScript(SCRIPT), heard);
  assert.equal(r.align.mode, 'whisper');
  assert.deepEqual(r.segments.map(s => s.spoken), [true, true, false, true]);
  assert.ok(r.segments[1].ratio >= .85, 'chia sẽ ≈ chia sẻ: lệch một chữ');
  const caps = D.captionsFrom(r.words);
  const text = caps.flatMap(c => c.words.map(w => w.w)).join(' ');
  assert.match(text, /^Bạn có biết 90% người mua nhà bị hớ Hôm nay mình chia sẻ/); // chữ kịch bản, không phải "chia sẽ"
  assert.doesNotMatch(text, /bỏ qua/);
  const w90 = r.words.find(x => x.w === '90%');
  assert.ok(w90.s >= .85 && w90.e <= 2.1, `90% nằm giữa "biết" và "người": ${w90.s}–${w90.e}`);
  assert.ok(caps.every(c => c.words.length <= 4));
  for (let i = 1; i < caps.length; i++) assert.ok(caps[i].t0 >= caps[i - 1].t0);
});

test('alignScript: ≥ 5 từ nói ngoài kịch bản → giữ phụ đề nghe được ở đó, báo offscript', () => {
  const segs = D.parseScript('Xin chào các bạn.\n\nCảm ơn đã xem.');
  const heard = W('xin chào các bạn hôm nay trời đẹp quá đi thôi cảm ơn đã xem');
  const r = D.alignScript(segs, heard);
  assert.equal(r.align.offscript.length, 1);
  assert.match(r.align.offscript[0].text, /hôm nay trời đẹp quá đi thôi/);
  const caps = D.captionsFrom(r.words, { offWords: r.offWords });
  assert.ok(caps.some(c => c._offscript && c.words.some(w => w.w === 'trời')));
});

test('alignScript: video không lời → chia đều thời lượng theo đoạn', () => {
  const r = D.alignScript(D.parseScript('Một hai ba.\n\nBốn năm sáu bảy.'), [], { dur: 10 });
  assert.equal(r.align.mode, 'even');
  assert.deepEqual(r.segments.map(s => [s.t0, s.t1]), [[0, 5], [5, 10]]);
  assert.ok(Math.abs(r.words[r.words.length - 1].e - 10) < .02);
});

function project(o = {}) {
  const dir = fs.mkdtempSync(path.join(TMP, 'p-'));
  fs.mkdirSync(path.join(dir, 'work'), { recursive: true });
  const caps = o.caps ?? [{ t0: 0, t1: 1.15, words: W('xin chào các bạn') }, { t0: 1.2, t1: 2.35, words: W('cảm ơn đã xem').map(w => ({ ...w, s: w.s + 1.2, e: w.e + 1.2 })) }];
  fs.writeFileSync(path.join(dir, 'work/captions.json'), JSON.stringify(caps));
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({ duration: o.duration || 6, captions: 'work/captions.json', scenes: o.scenes || [{ type: 'title_card', t0: 4, t1: 6 }], ...(o.tl || {}) }));
  return dir;
}

test('writeScript / applyScript / removeScript: phụ đề theo kịch bản, sao lưu phụ đề whisper, bỏ thì lấy lại', () => {
  const dir = project();
  D.writeScript(dir, 'Xin chào các bạn!\n\nCảm ơn đã xem.', { name: 'kb.txt' });
  const r = D.applyScript(dir);
  assert.deepEqual(r.caps.flatMap(c => c.words.map(w => w.w)), ['Xin', 'chào', 'các', 'bạn', 'Cảm', 'ơn', 'đã', 'xem']);
  assert.equal(D.readScript(dir).align.matched, 8);
  assert.ok(fs.existsSync(path.join(dir, '.studio/captions_noscript.json')));
  const back = D.removeScript(dir);
  assert.equal(back[0].words[0].w, 'xin');
  assert.equal(D.readScript(dir), null);
  assert.throws(() => D.writeScript(dir, '   '), /không có chữ/);
  assert.throws(() => D.writeScript(dir, 'a'.repeat(D.MAX_TEXT + 1)), /dài quá/);
});

test('applyScript: không lời (timeline.speech.none) chia đều trên phần video, chưa có lời thoại thì chờ', () => {
  const mute = project({ caps: [], tl: { speech: { none: true } }, duration: 8, scenes: [{ type: 'title_card', t0: 6, t1: 8 }] });
  D.writeScript(mute, 'Một.\n\nHai.\n\nBa.');
  const r = D.applyScript(mute);
  assert.equal(r.script.align.mode, 'even');
  assert.equal(r.caps.length, 3); assert.equal(r.caps[2].t1, 6); // không phủ lên thẻ kết
  const none = project({ caps: [] });
  D.writeScript(none, 'Một câu.');
  assert.equal(D.applyScript(none).pending, true);
});

test('stageScript / loadScriptArg: kịch bản chờ của Tự lái theo id, hoặc file .txt / .docx', () => {
  const id = D.stageScript('Chào cả nhà.', { name: 'a.txt' });
  assert.match(id, D.STAGE_ID);
  assert.equal(D.loadScriptArg(id).text, 'Chào cả nhà.');
  const f = path.join(TMP, 'kb.docx'); fs.writeFileSync(f, docx(['Một', 'Hai']));
  assert.equal(D.loadScriptArg(f).text, 'Một\nHai');
  const t = path.join(TMP, 'kb.txt'); fs.writeFileSync(t, '\uFEFFCó BOM');
  assert.equal(D.loadScriptArg(t).text, 'Có BOM');
  assert.throws(() => D.loadScriptArg('s-khongcoidnay'), /không thấy/);
  assert.throws(() => D.stageScript(''), /không có chữ/);
});

test('argsFor: opts.script → --script; route Tự lái chỉ nhận id kịch bản chờ', async () => {
  const Q = await import('../queue.mjs');
  const A = Q.argsFor({ kind: 'autopilot', input: 'C:/v/a.mp4', opts: { script: 's-abc123def' } });
  assert.equal(A[A.indexOf('--script') + 1], 's-abc123def');
  assert.equal(Q.argsFor({ kind: 'autopilot', input: 'x.mp4', opts: {} }).includes('--script'), false);
  const R = fs.readFileSync(new URL('../../studio/routes/15_autopilot.mjs', import.meta.url), 'utf8');
  assert.match(R, /okScript\(script\)/); assert.match(R, /okScript\(opts\.script\)/); assert.match(R, /okScript\(b\.script\)/);
  for (const bad of ['../x', '--profile', 's-ABC', 'x']) assert.equal(D.STAGE_ID.test(bad), false, bad);
});

test('autopilot: bước script nằm sau fillers, trước ai', async () => {
  const { STEPS } = await import('../autopilot.mjs');
  const ids = STEPS.map(s => s[0]);
  assert.equal(ids.indexOf('script'), ids.indexOf('fillers') + 1);
  assert.equal(ids.indexOf('ai'), ids.indexOf('script') + 1);
});

test('scriptMarks + markMissing: dấu có giờ; CHỮ chưa có cảnh nào ghi chữ đó thì báo', () => {
  const r = D.alignScript(D.parseScript(SCRIPT), W('bạn có biết chín mươi phần trăm người mua nhà bị hớ hôm nay mình chia sẻ ba kinh nghiệm quý theo dõi kênh để xem tiếp nhé'));
  const marks = D.scriptMarks(r);
  assert.deepEqual(marks.map(m => m.kind), ['hook', 'broll', 'cta']); // CHỮ của đoạn HOOK là chữ của hook
  assert.equal(marks[0].text, '90% bị hớ');
  const strings = s => [s.text].filter(Boolean);
  const miss = D.markMissing(marks, [{ type: 'text_pop', t0: 0, t1: 2, text: '90% BỊ HỚ' }], { strings });
  assert.deepEqual(miss.map(m => m.kind), ['broll', 'cta']);
  assert.deepEqual(D.markMissing(marks, [{ type: 'x', t0: 0, t1: 2 }, { type: 'media_card', t0: 4, t1: 5, image: 'media/a.jpg' }, { type: 'x', t0: 6, t1: 9, text: 'Theo dõi kênh để xem tiếp' }], { strings, title: '90% bị hớ' }), []);
});

test('ai_edit validate: có kịch bản thì giữ nguyên chữ phụ đề (chỉ nhận hl/br), hook theo [HOOK], báo dấu chưa có cảnh', async () => {
  const { validate } = await import('../ai_edit.mjs');
  const caps = [{ t0: 0, t1: 1, words: [{ w: 'Bạn', s: 0, e: .3 }, { w: 'có', s: .3, e: .6 }, { w: 'biết', s: .6, e: 1 }] }];
  const sc = { segments: [{ kind: 'hook', say: 'Bạn có biết', screen: ['90% bị hớ'], broll: ['nhà phố'], t0: 0, t1: 1, spoken: true }], align: { mode: 'whisper' } };
  const cat = { packs: [{ id: 'basic', items: [{ type: 'text_pop', ex: { t0: 0, t1: 2, text: 'Chữ' } }], base: [] }], captionStyles: ['slate'] };
  const lib = { broll: [], sfx: [], music: [{ mood: 'tech' }], tpls: [] };
  const raw = { pack: 'basic', hook: 'Hook Claude tự nghĩ', captions: [{ c: 0, words: ['BẠN', 'có', 'bít'], hl: [2] }], scenes: [{ type: 'text_pop', c: 0, w: 0, dur: 2, params: { text: '90% bị hớ' } }] };
  const plan = validate(raw, { tl: { duration: 5, width: 1080, height: 1920 }, caps, cat, lib, o: { pack: 'basic' }, script: sc });
  assert.deepEqual(plan.captions[0].words.map(w => w.w), ['Bạn', 'có', 'biết']);
  assert.equal(plan.captions[0].words[2].hl, true);
  assert.equal(plan.hook, '90% bị hớ');
  assert.deepEqual(plan.script.missing.map(m => m.kind), ['broll']);
  const free = validate(raw, { tl: { duration: 5, width: 1080, height: 1920 }, caps, cat, lib, o: { pack: 'basic' } });
  assert.equal(free.hook, 'Hook Claude tự nghĩ'); assert.equal(free.captions[0].words[2].w, 'bít'); // không kịch bản: như cũ
});

test('ai_qc scriptIssues: đoạn chưa nói, nói lệch, lời ngoài kịch bản, dấu chưa đặt; không kịch bản thì không báo gì', async () => {
  const { scriptIssues, KIND_VI } = await import('../ai_qc.mjs');
  const dir = project();
  assert.deepEqual(scriptIssues({ scenes: [] }, dir), []);
  D.writeScript(dir, '[HOOK] Xin chào các bạn\n\nĐoạn không ai đọc tới cả nha\n\n[CTA] Cảm ơn đã xem nhé bạn ơi');
  D.applyScript(dir);
  const kinds = scriptIssues({ scenes: [], title: '' }, dir).map(i => i.kind);
  assert.ok(kinds.includes('script_unspoken'));
  assert.ok(kinds.includes('script_drift')); // CTA: 4/7 chữ khớp
  assert.ok(kinds.includes('script_mark'));
  for (const k of kinds) assert.ok(KIND_VI[k], k);
});

test('gateScript: dự án quảng cáo soát lời + chữ của kịch bản, gắn lỗi về đúng đoạn; không bật quảng cáo thì bỏ qua', async () => {
  const dir = project();
  D.writeScript(dir, '[HOOK] Mở đầu\n\nKem này trị mụn 100%\n[CHỮ: Khỏi mụn vĩnh viễn]');
  D.applyScript(dir);
  assert.equal(await D.gateScript(dir, { ads: { on: false } }), null);
  let seen = null;
  const check = sc => { seen = sc; return { blocked: true, issues: [{ kind: 'ad_policy', severity: 'high', code: 'POLICY-MEDICAL', msg: 'nói chữa bệnh', ref: 'beats[0].screen', where: 'chữ ý 1' }] }; };
  const g = await D.gateScript(dir, { ads: { on: true, product: 'kem' } }, { check });
  assert.equal(seen.hook.say, 'Mở đầu'); assert.equal(seen.beats[0].screen, 'Khỏi mụn vĩnh viễn');
  assert.equal(g.issues[0].seg, 1); assert.equal(g.issues[0].screen, true);
  assert.equal(D.readScript(dir).gate.blocked, true);
});

// route 19_script với ctx giả (như server.mjs: readProject / save / body / json)
function fakeCtx(dir) {
  const P = rel => path.join(dir, rel), out = {};
  return {
    out, project: { dir, tlFile: P('timeline.json') },
    json: (res, o, c = 200) => { out.body = o; out.code = c; },
    body: async req => req._json || {},
    readProject: () => { const tl = JSON.parse(fs.readFileSync(P('timeline.json'), 'utf8')); return { timeline: tl, captions: JSON.parse(fs.readFileSync(P(tl.captions), 'utf8')) }; },
    save: ({ timeline, captions }) => { fs.writeFileSync(P(timeline.captions), JSON.stringify(captions)); fs.writeFileSync(P('timeline.json'), JSON.stringify(timeline)); },
  };
}
const req = (method, json, raw) => Object.assign(raw ? Readable.from([raw]) : Readable.from([]), { method, _json: json });

test('route /api/script: lưu + thay phụ đề, GET, docx, stage, clear', async () => {
  const route = (await import('../../studio/routes/19_script.mjs')).default;
  const dir = project(), ctx = fakeCtx(dir), h = route(ctx);
  assert.equal(await h(req('POST', { text: 'Xin chào các bạn.\n\nCảm ơn đã xem.' }), {}, '/api/script'), true);
  assert.equal(ctx.out.code, 200, JSON.stringify(ctx.out.body)); assert.equal(ctx.out.body.pending, false); assert.equal(ctx.out.body.gate, null);
  assert.equal(ctx.readProject().captions[0].words[0].w, 'Xin');
  await h(req('GET'), {}, '/api/script'); assert.equal(ctx.out.body.script.segments.length, 2);
  await h(req('POST', null, docx(['Một', 'Hai'])), {}, '/api/script/docx'); assert.equal(ctx.out.body.text, 'Một\nHai');
  await h(req('POST', { text: 'Chờ chạy' }), {}, '/api/script/stage'); assert.match(ctx.out.body.id, D.STAGE_ID);
  await h(req('POST', { text: '' }), {}, '/api/script'); assert.equal(ctx.out.code, 400);
  await h(req('POST', {}), {}, '/api/script/clear'); assert.equal(ctx.out.body.restored, true);
  assert.equal(ctx.readProject().captions[0].words[0].w, 'xin');
  assert.equal(await h(req('GET'), {}, '/api/other'), false);
});
