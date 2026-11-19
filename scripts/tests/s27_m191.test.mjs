// S27 M191 · Kịch bản → mẫu dựng sẵn trước khi quay: estimateTimes, 3 phương án, kiểm engine, khung tĩnh, danh sách quay,
// mẫu của thương hiệu, dời giờ khi quay xong (retimeDraft qua applyScript), job script_draft, route + feature Studio.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseScript, writeScript, applyScript, readScript, captionsFrom } from '../script_doc.mjs';
import { estimateTimes, retimeDraft, clampWps, WPS, draftTimeline, variantArgs, VARIANTS, engineIssues, stillTimes, shotList, toTemplate, saveTemplateFile, placeholderSvg, draftDir, DRAFT_ID } from '../script_draft.mjs';
import { KINDS, isKind, argsFor } from '../queue.mjs';
import { checkDraftInput } from '../../studio/routes/32_scriptdraft.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m191-'));
const TEXT = `[HOOK] Bạn có biết chín mươi phần trăm người mua nhà lần đầu bị hớ

Lý do thứ nhất là không xem pháp lý dự án [B-ROLL: sổ hồng] [CHỮ: 90% bị hớ]

[CTA] Theo dõi để xem phần hai nhé`;

test('estimateTimes: 2,6 từ/giây mặc định, nghỉ .4 s, mode estimate, chữ chia trong đoạn', () => {
  const segs = parseScript(TEXT), e = estimateTimes(segs);
  assert.equal(e.align.mode, 'estimate'); assert.equal(e.align.wps, WPS); assert.equal(e.segments.length, 3);
  const n0 = segs[0].say.split(/\s+/).length;
  assert.ok(Math.abs((e.segments[0].t1 - e.segments[0].t0) - n0 / 2.6) < .02, 'đoạn đầu dài đúng số từ / tốc độ đọc');
  assert.ok(Math.abs(e.segments[1].t0 - (e.segments[0].t1 + .4)) < .02, 'nghỉ .4 s giữa hai đoạn');
  assert.ok(e.words.every((w, i) => i === 0 || w.s >= e.words[i - 1].s), 'giờ chữ tăng dần');
  assert.equal(e.words.filter(w => w.k === 1).length, segs[1].say.split(/\s+/).length);
  assert.ok(e.duration > e.speech + 2, 'thời lượng có thẻ kết');
  // đọc nhanh hơn → ngắn hơn; ngoài khoảng 2,0–3,4 bị kẹp
  assert.ok(estimateTimes(segs, { wps: 3.4 }).speech < e.speech);
  assert.equal(clampWps(9), 3.4); assert.equal(clampWps(1), 2); assert.equal(clampWps('x'), WPS);
  const caps = captionsFrom(e.words, { max: 4 });
  assert.ok(caps.length >= 6 && caps.every(c => c.words.length <= 4), 'phụ đề dự kiến từ chính chữ kịch bản');
});

test('estimateTimes: mốc giây của Excel (M197) thắng tốc độ đọc, không lùi trước đoạn trước', () => {
  const segs = parseScript('[MỐC: 0:00-0:05] Xin chào các bạn\n\n[MỐC: 0:12] Hôm nay nói về pháp lý\n\nCâu không có mốc');
  assert.ok(segs[0].at && segs[1].at, 'dấu MỐC đọc được');
  const e = estimateTimes(segs);
  assert.equal(e.segments[0].t1, 5); assert.equal(e.segments[1].t0, 12);
  assert.ok(e.segments[2].t0 >= e.segments[1].t1); assert.equal(e.align.sheet, 2);
});

test('draftTimeline: không video, ô chờ quay, khổ theo lựa chọn, thẻ kết sau lời', () => {
  const est = estimateTimes(parseScript(TEXT));
  const v = draftTimeline({ aspect: '9:16', est, title: 'Mua nhà' }), h = draftTimeline({ aspect: '16:9', est });
  assert.deepEqual([v.width, v.height], [1080, 1920]); assert.deepEqual([h.width, h.height], [1920, 1080]);
  assert.equal(v.aroll.placeholder, true); assert.equal(v.draft.mode, 'estimate'); assert.ok(v._starter);
  assert.ok(!v.audio.voice, 'không trỏ tới giọng chưa có'); assert.equal(v.audio.music.length, 1);
  const end = v.scenes.find(s => s.type === 'title_card'); assert.ok(end.t0 >= est.speech && end.t1 === v.duration);
  assert.match(placeholderSvg(720, 1280), /^<svg[^>]+width="720"/);
});

test('3 phương án khác nhau rõ: gói thương hiệu / nhịp dày / thoáng; phương án sau tránh gói đã dùng', () => {
  assert.equal(VARIANTS.length, 3);
  assert.deepEqual(VARIANTS.map(v => v.density), ['vua', 'day', 'thua']);
  assert.equal(VARIANTS[0].pack, 'keep');
  const a = variantArgs(VARIANTS[2], ['slate', 'kinetic']);
  assert.equal(a[a.indexOf('--pack') + 1], 'auto'); assert.equal(a[a.indexOf('--density') + 1], 'thua');
  assert.match(a[a.indexOf('--extra') + 1], /“slate”, “kinetic”/);
  assert.doesNotMatch(variantArgs(VARIANTS[0], ['slate']).join(' '), /Chọn gói khác/);
});

test('engineIssues + stillTimes: bắt cảnh 0 giây / ngoài video; khung tĩnh trong video, trước thẻ kết', () => {
  const tl = { duration: 30, scenes: [{ type: 'lower_third', t0: 2, t1: 2.05 }, { type: 'stat', t0: 31, t1: 33 }, { type: 'quote', t0: 5, t1: 8 }, { type: 'title_card', t0: 27, t1: 30 }], fx: [{ t: 40, type: 'punch' }] };
  const k = engineIssues(tl).map(i => i.kind);
  assert.ok(k.includes('zero') && k.includes('outside') && k.includes('fx_out'));
  const ts = stillTimes(tl, 5);
  assert.equal(ts.length, 5); assert.ok(ts.every(t => t >= 0 && t < 30));
  assert.ok(ts.some(t => t >= 5 && t <= 8), 'có khung lúc graphic đang hiện');
});

test('shotList: mỗi đoạn lời + cỡ khung + B-roll cần tự quay (chưa tìm được cảnh hoặc chỉ b-roll động)', () => {
  const segs = estimateTimes(parseScript(TEXT)).segments;
  const sheet = { rows: [{ seg: 0, aroll: { frame: 'can' }, broll: [] }, { seg: 1, broll: [{ q: 'sổ hồng', miss: 'Kho không có cảnh khớp' }, { q: 'căn hộ', src: 'kho', pick: 'BRoll/a.mp4' }] }, { seg: 2, aroll: { off: true }, broll: [{ q: 'logo', src: 'dong', pick: 'x' }] }] };
  const s = shotList(segs, sheet, { title: 'Mua nhà' });
  assert.equal(s.items.length, 3);
  assert.equal(s.items[0].frame, 'Cận mặt'); assert.deepEqual(s.items[1].broll, ['sổ hồng']); assert.deepEqual(s.items[2].broll, ['logo']);
  assert.match(s.items[2].frame, /Không cần quay người nói/);
  assert.match(s.text, /^DANH SÁCH QUAY · Mua nhà/); assert.match(s.text, /Quay thêm \(B-roll\): sổ hồng/);
  // không có bảng dựng: dấu B-ROLL của kịch bản đều là cảnh cần quay
  assert.deepEqual(shotList(segs).items[1].broll, ['sổ hồng']);
});

test('toTemplate + saveTemplateFile: mẫu của thương hiệu (brand_id), bỏ cờ nội bộ, giữ ghi chú kịch bản, id không trùng', () => {
  const tl = { width: 1080, height: 1920, duration: 20, pack: 'kinetic', title: 'Mua nhà', draft: { wps: 2.8 },
    scenes: [{ type: 'stat', t0: 1, t1: 3, _ai: true, _sheet: 1, _script: { kind: 'CHỮ', text: '90%' } }, { type: 'x', t0: 1, t1: 2, hidden: true }],
    audio: { music: [{ t0: 0, t1: 20, mood: 'suspense', _ai: true }] } };
  const t = toTemplate(tl, { name: 'Mẫu mua nhà', brand: 'acme', variant: VARIANTS[1], shots: { items: [{ frame: 'Cận mặt', say: 'Bạn có biết' }] }, text: TEXT });
  assert.equal(t.brand_id, 'acme'); assert.equal(t.aspect, '9:16'); assert.equal(t.pack, 'kinetic'); assert.equal(t.music, 'suspense');
  assert.equal(t.scenes.length, 1); assert.equal(t.scenes[0]._ai, undefined); assert.deepEqual(t.scenes[0]._script, { kind: 'CHỮ', text: '90%' });
  assert.equal(t.script.wps, 2.8); assert.deepEqual(t.needs, ['Cận mặt: Bạn có biết']);
  const d = tmp(), user = path.join(d, 'user'), builtin = d;
  fs.writeFileSync(path.join(builtin, 'u-mau-mua-nha.json'), '{}');
  const id1 = saveTemplateFile(user, builtin, t), id2 = saveTemplateFile(user, builtin, t);
  assert.equal(id1, 'u-mau-mua-nha-2'); assert.equal(id2, 'u-mau-mua-nha-3');
  assert.equal(JSON.parse(fs.readFileSync(path.join(user, id1 + '.json'), 'utf8')).brand_id, 'acme');
});

test('retimeDraft: mục theo đoạn (_sheet) co giãn theo giờ thật; mục sau đoạn cuối dời bằng độ lệch cuối', () => {
  const from = [{ t0: 0, t1: 4 }, { t0: 4.4, t1: 8 }], to = [{ t0: 1, t1: 7 }, { t0: 8, t1: 10 }];
  const tl = { draft: { mode: 'estimate' }, scenes: [{ type: 'a', t0: 1, t1: 3, _sheet: 0 }, { type: 'b', t0: 5, t1: 7 }, { type: 'title_card', t0: 8.4, t1: 11 }], fx: [{ t: 2 }], audio: { sfx: [{ t: 4.4, _sheet: 1 }] } };
  const n = retimeDraft(tl, from, to);
  assert.ok(n >= 5);
  assert.deepEqual([tl.scenes[0].t0, tl.scenes[0].t1], [2.5, 5.5]);
  assert.equal(tl.audio.sfx[0].t, 8); assert.equal(tl.fx[0].t, 4);
  assert.equal(tl.scenes[2].t0, 10.4); assert.equal(tl.draft.mode, 'shot');
  assert.equal(retimeDraft({ scenes: [] }, from, [to[0]]), 0, 'số đoạn lệch: không dời');
  // nhạc: nền phủ cả video để nguyên, khúc theo đoạn (M195) dời; khúc đầu giữ mốc 0
  const t3 = { audio: { music: [{ t0: 0, t1: 12, mood: 'a' }, { t0: 0, t1: 4.4, _sheet: 0 }, { t0: 4.4, t1: 12, _sheet: 1 }] } };
  retimeDraft(t3, from, to);
  assert.deepEqual(t3.audio.music.map(m => [m.t0, m.t1]), [[0, 12], [0, 8], [8, 14]]);
});

test('applyScript: mẫu chưa quay ước lại theo tốc độ đọc; có lời thật (Tạo lời thoại) thì căn rồi dời mọi mục', () => {
  const dir = tmp();
  const est = estimateTimes(parseScript(TEXT));
  const tl = draftTimeline({ est }); tl.scenes.push({ type: 'stat', t0: est.segments[1].t0 + .2, t1: est.segments[1].t1, _sheet: 1 });
  fs.mkdirSync(path.join(dir, 'work'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(tl));
  fs.writeFileSync(path.join(dir, 'work/captions.json'), JSON.stringify(captionsFrom(est.words)));
  writeScript(dir, TEXT.replace('Lý do thứ nhất', 'Lý do thứ nhất và quan trọng nhất'));
  const r = applyScript(dir, { tl: JSON.parse(JSON.stringify(tl)) });
  assert.ok(!r.pending); assert.equal(readScript(dir).align.mode, 'estimate', 'chưa quay: vẫn giờ ước');
  assert.ok(r.caps.some(c => c.words.some(w => w.w === 'trọng')), 'phụ đề theo chữ mới');
  // reviewer: sửa kịch bản trước khi quay → mục dời sang giờ ước mới, vị trí tương đối trong đoạn giữ nguyên ở cả hai bước
  const rel = (t, sg) => (t.scenes.find(x => x._sheet === 1).t0 - sg.t0) / (sg.t1 - sg.t0);
  const r0 = rel(tl, est.segments[1]), seg1 = readScript(dir).segments[1];
  assert.ok(Math.abs(rel(r.tl, seg1) - r0) < .02, 'sửa kịch bản: mục theo giờ ước mới');
  assert.deepEqual(r.tl.draft.est[1], [seg1.t0, seg1.t1]);
  // quay xong: lời thật chậm gấp đôi → mục của đoạn 1 dời theo
  const sc = readScript(dir), heard = sc.segments.flatMap(s => s.say.split(/\s+/).map(w => ({ w }))).map((h, i) => ({ ...h, s: 1 + i * .8, e: 1 + i * .8 + .6 }));
  const tl2 = JSON.parse(JSON.stringify(r.tl)), before = tl2.scenes.find(s => s._sheet === 1).t0;
  const r2 = applyScript(dir, { tl: tl2, caps: [], heard, fresh: true });
  const after = readScript(dir);
  assert.equal(after.align.mode, 'whisper'); assert.ok(after.retimed >= 1);
  assert.ok(r2.tl.scenes.find(s => s._sheet === 1).t0 > before + 3, 'graphic của đoạn 1 dời theo giờ thật');
  assert.equal(r2.tl.draft.mode, 'shot');
  assert.ok(Math.abs(rel(r2.tl, after.segments[1]) - r0) < .03, 'quay xong: mục theo giờ thật, đúng chỗ trong đoạn');
});

test('checkDraftInput: kiểm chữ, thương hiệu, khổ, tốc độ; tên mặc định từ câu đầu', () => {
  assert.throws(() => checkDraftInput({ text: '  ' }), e => e.status === 400);
  assert.throws(() => checkDraftInput({ text: TEXT, brand: 'la' }, ['acme']), e => e.status === 404);
  assert.throws(() => checkDraftInput({ text: TEXT, brand: 'la' }, id => id === 'acme'), e => e.status === 404, 'nhận cả hàm kiểm (loadBrand)');
  const { draft, est } = checkDraftInput({ text: TEXT, brand: 'acme', aspect: '4:3', wps: 9 }, ['acme']);
  assert.equal(draft.aspect, '9:16'); assert.equal(draft.wps, 3.4); assert.equal(draft.brand, 'acme');
  assert.match(draft.name, /^Bạn có biết/); assert.equal(est.segments.length, 3);
  assert.ok(DRAFT_ID.test('d-20261119-a1b2c3')); assert.throws(() => draftDir('../x'), e => e.status === 400);
});

test('job script_draft: một loại job, tham số chỉ là thư mục nháp', () => {
  assert.ok(isKind('script_draft')); assert.equal(KINDS.script_draft.script, 'script_draft.mjs');
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', KINDS.script_draft.script)));
  assert.deepEqual(argsFor({ kind: 'script_draft', input: '/tmp/d-1', opts: {} }), ['/tmp/d-1']);
});

test('Studio: route + feature, lối vào gọn (trang chủ, ô Kịch bản), vùng thả stopPropagation, không bảng cài đặt', () => {
  const route = fs.readFileSync(path.join(ROOT, 'studio/routes/32_scriptdraft.mjs'), 'utf8');
  const feat = fs.readFileSync(path.join(ROOT, 'studio/features/32_scriptdraft.js'), 'utf8');
  for (const api of ['/api/draft/use', '/api/draft/template', '/api/draft/still', '/api/draft/shots', '/api/draft/list']) assert.ok(route.includes(api), api);
  assert.match(feat, /S\.scriptDraft = \{ open/);
  assert.match(feat, /ta\.ondragover = e => \{[^}]*e\.stopPropagation\(\)/); assert.match(feat, /ta\.ondrop = e => \{[^}]*e\.stopPropagation\(\)/);
  assert.doesNotMatch(feat, /addPanel\(/, 'không thêm panel');
  assert.match(fs.readFileSync(path.join(ROOT, 'studio/features/02_onboarding.js'), 'utf8'), /card\('draft'/);
  assert.match(fs.readFileSync(path.join(ROOT, 'studio/features/19_script.js'), 'utf8'), /data-sc=\\?"draft\\?"/);
  assert.ok(!fs.readFileSync(path.join(ROOT, 'studio/server.mjs'), 'utf8').includes('script_draft'), 'không sửa server.mjs');
});
