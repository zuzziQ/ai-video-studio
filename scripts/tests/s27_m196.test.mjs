// S27 M196 · A-roll theo kịch bản: lời ngoài kịch bản để cắt, nhiều take (alignTakes / pickTakes / takesToClips), job script_takes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseScript, writeScript, alignScript } from '../script_doc.mjs';
import { brokenShape, offscriptCuts, alignTakes, pickTakes, takesToClips, frameFor, takeScore, takeHash, projectTakes, readTakesPlan, clipsKey, PAD } from '../script_takes.mjs';
import { KINDS, isKind, argsFor } from '../queue.mjs';
import { rippleCut } from '../ripple.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// lời nói giả: mỗi từ .3 s, nghỉ .1 s; `gap` chèn trước câu
function speak(text, t = 0) { const out = []; for (const w of text.split(/\s+/).filter(Boolean)) { out.push({ w, s: +t.toFixed(2), e: +(t + .3).toFixed(2) }); t += .4; } return { words: out, t }; }
function talk(parts) { let t = 0; const W = []; for (const [txt, gap = .6] of parts) { const r = speak(txt, t + gap); W.push(...r.words); t = r.t; } return W; }

const S1 = 'hôm nay mình chia sẻ cách chọn căn hộ đầu tiên';
const S2 = 'đầu tiên hãy xem kỹ pháp lý của dự án';
const S3 = 'cuối cùng đừng quên hỏi phí quản lý hằng tháng';
const OFF = 'à mà khoan để mình uống ngụm nước đã nhé';

test('offscriptCuts: nới mép về phía lặng, không lấn từ kề bên, bỏ đoạn đã cắt và mốc từ vỡ', () => {
  const heard = talk([[S1], [OFF, 1.0], [S2, 1.0]]);
  const segs = parseScript(`${S1}\n\n${S2}`);
  const r = alignScript(segs, heard);
  assert.equal(r.align.offscript.length, 1);
  const cuts = offscriptCuts(r.align.offscript, heard, { dur: 30 });
  assert.equal(cuts.length, 1);
  const c = cuts[0], o = r.align.offscript[0];
  assert.ok(c.a <= o.t0 - PAD + 1e-9 && c.b >= o.t1 + PAD - 1e-9, 'nới .15 s cả hai mép khi có khoảng lặng');
  const before = heard.filter(h => h.e <= o.t0).pop(), after = heard.find(h => h.s >= o.t1);
  assert.ok(c.a > before.e && c.b < after.s, 'không lấn sang từ của kịch bản');
  // từ kề sát (lặng < pad): mép dừng ở từ kề bên
  const tight = [{ w: 'a', s: 0, e: .3 }, ...'x y z t u'.split(' ').map((w, i) => ({ w, s: .35 + i * .4, e: .65 + i * .4 })), { w: 'b', s: 2.4, e: 2.7 }];
  const ct = offscriptCuts([{ t0: .35, t1: 2.25, text: 'x y z t u' }], tight)[0];
  assert.ok(ct.a >= .3 && ct.b <= 2.4, JSON.stringify(ct));
  // timeline đã đổi (đã cắt): lời không còn ở khoảng đó → bỏ
  assert.equal(offscriptCuts(r.align.offscript, heard.filter(h => h.s < o.t0 || h.s > o.t1)).length, 0);
  // Whisper bịa (bài học 041): từ dài > 3 s
  const fake = [{ w: 'hãy', s: 0, e: 4 }, { w: 'subscribe', s: 4, e: 4 }, { w: 'cho', s: 4, e: 4 }, { w: 'kênh', s: 4, e: 4 }, { w: 'nhé', s: 4, e: 9 }];
  assert.equal(brokenShape(fake), true);
  assert.equal(offscriptCuts([{ t0: 0, t1: 9, text: 'hãy subscribe cho kênh nhé' }], fake).length, 0);
  assert.equal(brokenShape(speak(OFF).words), false);
});

test('cắt lời ngoài kịch bản bằng cắt ripple: video ngắn đi đúng khoảng, phụ đề còn lời kịch bản', () => {
  const heard = talk([[S1], [OFF, 1.0], [S2, 1.0]]), end = heard[heard.length - 1].e + .5;
  const segs = parseScript(`${S1}\n\n${S2}`), r = alignScript(segs, heard);
  const [c] = offscriptCuts(r.align.offscript, heard, { dur: end });
  const tl = { fps: 30, duration: end, clips: [{ src: { seq: 'work/frames/%05d.jpg', fps: 30, count: Math.round(end * 30) }, audio: 'work/aroll.mp4', in: 0, out: end }], scenes: [] };
  const caps = [{ t0: 0, t1: end, words: heard }];
  const out = rippleCut(tl, caps, [[c.a, c.b]], Math.round(end * 30));
  assert.ok(Math.abs(out.removed - (c.b - c.a)) < .1, `${out.removed} vs ${c.b - c.a}`);
  const left = out.caps.flatMap(x => x.words.map(w => w.w)).join(' ');
  assert.ok(!left.includes('ngụm') && left.includes('pháp lý'), left);
});

test('alignTakes + pickTakes: dấu clip N thắng, không dấu thì điểm khớp, hoà thì take sau, dưới 30 % = chưa quay', () => {
  const segs = parseScript(`[A-ROLL: cận mặt | clip 1] ${S1}\n\n${S2}\n\n${S3}\n\nđoạn này chưa ai quay bao giờ cả nhé`);
  const take1 = { name: 'take1.mp4', words: talk([[S1], ['đầu tiên hãy ờ ờ xem xem kỹ pháp lý của dự án'], [S3]]) };
  const take2 = { name: 'take2.mp4', words: talk([[S1], [S2]]) };
  const rows = alignTakes(segs, [take1, take2]);
  assert.equal(rows.length, 4); assert.equal(rows[0].length, 2);
  assert.equal(rows[0][0].ratio, 1); assert.equal(rows[0][1].ratio, 1);
  assert.ok(rows[1][0].extra >= 3 && rows[1][1].extra === 0, 'take 1 nói vấp ở đoạn 2');
  assert.ok(takeScore(rows[1][1]) > takeScore(rows[1][0]));
  const picks = pickTakes(segs, rows, [take1, take2]);
  assert.deepEqual(picks.map(p => p.take), [0, 1, 0, null]);
  assert.equal(picks[0].by, 'mark'); assert.equal(picks[1].by, 'score');
  assert.equal(picks[3].missing, true);
  // không dấu, hai take như nhau: take sau
  const tie = pickTakes(parseScript(S1), alignTakes(parseScript(S1), [take1, take2]), [take1, take2]);
  assert.equal(tie[0].take, 1);
  // dấu take không tồn tại: theo điểm, ghi lý do
  const bad = pickTakes(parseScript(`[A-ROLL: take 5] ${S2}`), alignTakes(parseScript(S2), [take1, take2]), [take1, take2]);
  assert.equal(bad[0].take, 1); assert.match(bad[0].why, /take 5/);
  // dấu tên file
  const byFile = pickTakes(parseScript(`[A-ROLL: take1.mp4] ${S1}`), alignTakes(parseScript(S1), [take1, take2]), [take1, take2]);
  assert.equal(byFile[0].take, 0); assert.equal(byFile[0].by, 'mark');
});

test('alignTakes: một take quay lại cùng câu hai lần thì lấy lần sau khi khớp bằng nhau', () => {
  const segs = parseScript(S2), W = talk([[S2], ['thôi làm lại'], [S2, 1]]);
  const r = alignTakes(segs, [{ words: W }])[0][0];
  assert.equal(r.ratio, 1); assert.ok(r.t0 > 4, `t0 ${r.t0}`);
});

test('takesToClips: thứ tự kịch bản, mép nới về lặng, cận mặt quanh mặt, nối liền khi cùng take liên tiếp', () => {
  const segs = parseScript(`[A-ROLL: cận mặt] ${S1}\n\n${S2}\n\n[A-ROLL: rộng] ${S3}`);
  const base = { src: { seq: 'media/t1_frames/%05d.jpg', fps: 30, count: 900 }, audio: 'media/t1.mp4', fit: 'cover', speed: 2, _ai: 1 };
  const t1 = { words: talk([[S1], [S2, .5], [OFF, 1], [S3, 1]]), clip: base, dur: 30, face: { x: 50, y: 40 } };
  const t2 = { words: talk([[S2]]), clip: { ...base, src: { ...base.src, seq: 'media/t2_frames/%05d.jpg' }, audio: 'media/t2.mp4' }, dur: 6 };
  const takes = [t1, t2], rows = alignTakes(segs, takes);
  const picks = [{ seg: 0, take: 0 }, { seg: 1, take: 0 }, { seg: 2, take: 0 }];
  const { clips, heard, duration } = takesToClips(segs, picks, rows, takes);
  assert.equal(clips.length, 3);
  assert.deepEqual(clips.map(c => c._sheet), [0, 1, 2]);
  assert.equal(clips[0].out, clips[1].in, 'đoạn 1 → 2 liền nhau trong take: nối ở giữa khoảng lặng');
  assert.ok(clips[2].in > clips[1].out + 2, 'đoạn ngoài kịch bản giữa đoạn 2 và 3 bị bỏ');
  assert.equal(clips[0].zoom, 1.6); assert.equal(clips[0].ox, 50); assert.equal(clips[2].zoom, undefined);
  assert.equal(clips[0].speed, undefined, 'không mang tốc độ / cờ cũ của clip mẫu'); assert.equal(clips[0]._ai, undefined); assert.equal(clips[0].fit, 'cover');
  assert.ok(Math.abs(duration - clips.reduce((a, c) => a + c.out - c.in, 0)) < .02);
  assert.ok(!heard.some(w => w.w === 'ngụm'), 'lời giữa hai đoạn không còn');
  assert.ok(heard.every((w, i) => !i || w.s >= heard[i - 1].s - 1e-9), 'giờ timeline tăng dần');
  // chọn take 2 cho đoạn 2: hai nguồn khác nhau, không mặt thì giữ cover
  const mix = takesToClips(segs, [{ seg: 0, take: 0 }, { seg: 1, take: 1 }], rows, takes);
  assert.equal(mix.clips[1].audio, 'media/t2.mp4'); assert.equal(mix.clips[1]._take, 2);
  assert.ok(mix.clips[1].in >= 0 && mix.clips[1].in <= rows[1][1].t0 - PAD + 1e-9);
  assert.deepEqual(frameFor('can', null), {}); assert.deepEqual(frameFor('rong', { x: 50, y: 50 }), {});
  assert.equal(frameFor('trung', { x: 99, y: 5 }).ox, 90);
});

test('queue: loại việc script_takes, tham số chỉ thư mục dự án + mô hình hợp lệ', () => {
  assert.ok(isKind('script_takes')); assert.equal(KINDS.script_takes.script, 'script_takes.mjs');
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', KINDS.script_takes.script)));
  assert.deepEqual(argsFor({ kind: 'script_takes', input: '/p', opts: {} }), ['/p']);
  assert.deepEqual(argsFor({ kind: 'script_takes', input: '/p', opts: { model: 'small' } }), ['/p', '--model', 'small']);
  assert.deepEqual(argsFor({ kind: 'script_takes', input: '/p', opts: { model: '--evil' } }), ['/p']);
});

test('job script_takes (CLI) trên dự án 2 take có lời đã nhận dạng (cache): ra takes_plan.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m196-'));
  try {
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'media', 'a.mp4'), 'take-a');
    fs.writeFileSync(path.join(dir, 'media', 'b.mp4'), 'take-b-longer');
    const past = new Date(Date.now() - 60000); fs.utimesSync(path.join(dir, 'media', 'a.mp4'), past, past);
    const clip = (n, k) => ({ src: { seq: `media/${n}_frames/%05d.jpg`, fps: 30, count: 600 }, audio: `media/${n}.mp4`, in: 0, out: 20, ...k });
    const tl = { width: 1080, height: 1920, fps: 30, duration: 42.5, clips: [clip('a'), clip('b')], scenes: [{ type: 'title_card', t0: 40, t1: 42.5 }], captions: [] };
    fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(tl));
    writeScript(dir, `${S1}\n\n[A-ROLL: cận mặt] ${S2}\n\n${S3}`);
    const A = talk([[S1], ['đầu tiên hãy ờ xem xem kỹ ờ pháp lý của dự án'], [OFF, 1], [S3]]), B = talk([[S2]]);
    for (const [f, words, face] of [['a', A, null], ['b', B, { x: 48, y: 36 }]]) {
      const h = takeHash(path.join(dir, 'media', `${f}.mp4`), 'small');
      fs.mkdirSync(path.join(dir, '.studio', 'takes'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.studio', 'takes', `${h}.json`), JSON.stringify({ file: `${f}.mp4`, model: 'small', words, dur: 20, face }));
    }
    assert.deepEqual(projectTakes(dir, tl).map(t => t.name), ['a.mp4', 'b.mp4']);
    const log = execFileSync('node', [path.join(ROOT, 'scripts', 'script_takes.mjs'), dir, '--model', 'small'], { encoding: 'utf8' });
    assert.match(log, /^RESULT /m);
    const plan = readTakesPlan(dir);
    assert.deepEqual(plan.picks.map(p => p.take), [0, 1, 0]);
    assert.equal(plan.clips.length, 3);
    assert.equal(plan.clips[1].audio, 'media/b.mp4'); assert.equal(plan.clips[1].zoom, 1.6); assert.equal(plan.clips[1].ox, 48);
    assert.ok(Math.abs(plan.duration - plan.speech - 2.5) < .01, 'thẻ kết cuối giữ độ dài');
    assert.equal(plan.align.mode, 'whisper'); assert.equal(plan.segments.every(s => s.spoken), true);
    assert.ok(plan.caps.length && plan.raw.length);
    assert.deepEqual(plan.takes.map(t => t.used), [2, 1]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Studio: route + feature A-roll, không chọn sẵn đoạn cắt, không panel mới, Tự lái không chạy', () => {
  const route = fs.readFileSync(path.join(ROOT, 'studio', 'routes', '24_aroll.mjs'), 'utf8');
  const feat = fs.readFileSync(path.join(ROOT, 'studio', 'features', '24_aroll.js'), 'utf8');
  const ai = fs.readFileSync(path.join(ROOT, 'studio', 'features', '20_ai.js'), 'utf8');
  for (const p of ['/api/aroll/takes', '/api/aroll/plan', '/api/aroll/applied', '/api/aroll/realign']) assert.ok(route.includes(p), p);
  assert.ok(!/input:\s*b\./.test(route), 'job chỉ nhận thư mục dự án đang mở');
  assert.match(feat, /const sel = new Set\(\);/); assert.match(feat, /S\.ai\.cutRanges\(/); assert.match(feat, /S\.pushUndo\(\)/);
  assert.ok(!/addPanel\(/.test(feat), 'không thêm panel');
  assert.match(ai, /S\.aroll\?\.line\(\)/);
  const ap = fs.readFileSync(path.join(ROOT, 'scripts', 'autopilot.mjs'), 'utf8');
  assert.ok(!/script_takes|offscriptCuts/.test(ap), 'Tự lái không chọn take, không cắt lời ngoài kịch bản');
});

test('liveOffscript: tính lại từ phụ đề hiện tại, không ghi script.json — cắt rồi ⌘Z thì đoạn hiện lại (lỗi QA M196)', async () => {
  const { liveOffscript } = await import('../../studio/routes/24_aroll.mjs');
  const heard = talk([[S1], [OFF, 1.0], [S2, 1.0]]), sc = { segments: parseScript(`${S1}\n\n${S2}`) }, tl = { duration: 30 };
  const caps = [{ t0: 0, t1: 30, words: heard }];
  assert.equal(liveOffscript(sc, tl, caps).length, 1);
  const cut = [{ t0: 0, t1: 30, words: heard.filter(w => !OFF.split(' ').includes(w.w)) }];
  assert.equal(liveOffscript(sc, tl, cut).length, 0, 'đã cắt');
  assert.equal(liveOffscript(sc, tl, caps).length, 1, '⌘Z: phụ đề trở về thì đoạn hiện lại');
  assert.deepEqual(liveOffscript(sc, { duration: 30, speech: { none: true } }, caps), []);
});

test('pickTakes: đoạn chưa quay toàn từ phổ biến không khớp giả; dấu clip N trỏ take không có đoạn thì không ép (review M196)', () => {
  const common = 'và là của một những cái này thì là và của';
  const segs = parseScript(`${S1}\n\n${common}`);
  const take = { name: 't.mp4', words: talk([[S1], ['nhưng mà thì cái chuyện này là của ai và một ngày những người kia sẽ biết là của ai']]) };
  const rows = alignTakes(segs, [take]);
  assert.ok(rows[1][0].dense < .5 || rows[1][0].ratio < .3, JSON.stringify(rows[1][0]));
  const p = pickTakes(segs, rows, [take]);
  assert.equal(p[0].take, 0); assert.equal(p[1].missing, true);
  const t2 = { name: 'b.mp4', words: talk([['chỉ một từ đầu tiên thôi']]) };
  const m = pickTakes(parseScript(`[A-ROLL: clip 2] ${S2}`), alignTakes(parseScript(S2), [{ words: talk([[S2]]) }, t2]), [{ name: 'a.mp4' }, t2]);
  assert.equal(m[0].take, 0, 'dấu trỏ take chỉ khớp 1 từ: theo điểm'); assert.match(m[0].why, /take 2/);
});

test('takesToClips: đoạn trùng đoạn trước trong cùng take được báo (dropped), clip mang _script cho ghi chú; clipsKey hai bản giống nhau', () => {
  const segs = parseScript(`${S1}\n\n${S1}`), tk = { words: talk([[S1]]), clip: { src: 'x', audio: 'a.mp4' }, dur: 10, name: 'a.mp4' };
  const rows = alignTakes(segs, [tk]);
  const r = takesToClips(segs, [{ seg: 0, take: 0, by: 'score' }, { seg: 1, take: 0, by: 'score' }], rows, [tk]);
  assert.equal(r.clips.length, 1); assert.deepEqual(r.dropped, [1]);
  assert.equal(r.clips[0]._script.kind, 'A-ROLL'); assert.match(r.clips[0]._script.note, /take 1 \(a\.mp4\) · khớp 100%/);
  const feat = fs.readFileSync(path.join(ROOT, 'studio', 'features', '24_aroll.js'), 'utf8');
  const body = feat.slice(feat.indexOf('  function clipsKey'), feat.indexOf('\n  }\n', feat.indexOf('  function clipsKey')) + 4);
  const clientKey = new Function(`${body}; return clipsKey;`)();
  const clips = [{ src: { seq: 'a/%05d.jpg', fps: 30, count: 9 }, audio: 'a.mp4', in: 1, out: 2.5, zoom: 2 }, { src: 'b.jpg', in: 0, out: 1 }];
  assert.equal(clientKey(clips), clipsKey(clips));
  assert.notEqual(clipsKey(clips), clipsKey([{ ...clips[0], out: 3 }, clips[1]]));
  // đoạn không có lời (chỉ dấu) không bị coi là chưa quay
  const empty = pickTakes([{ say: '' }], [[null]], [tk]);
  assert.equal(empty[0].missing, false); assert.equal(empty[0].skip, true);
});
