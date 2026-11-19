// S27 M194: panel Bảng dựng (sửa ô), Áp bảng = sheetToPlan → validate + applyPlan (mục _ai + _sheet), applyPlan server = client,
// AI dựng đọc bảng làm ràng buộc, QC dấu dựng mới (buildMarkIssues).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-s27-m194-'));
process.env.AVS_HOME = TMP;
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const D = await import('../script_doc.mjs');
const B = await import('../script_build.mjs');
const E = await import('../ai_edit.mjs');
const Q = await import('../ai_qc.mjs');
const SFX = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/catalog.json'), 'utf8'));
const MOODS = [...new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/music/catalog.json'), 'utf8')).map(x => x.mood))];
const DYN = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/broll/catalog.json'), 'utf8'));

// bảng mẫu: 3 đoạn đã căn
const sheet0 = () => ({ version: 1, rows: [
  { seg: 0, t0: 0, t1: 4, kind: 'hook', say: 'Bạn có biết 90% người mua nhà bị hớ', mood: { v: 'suspense', from: 'mark' }, music: { v: 'bed', from: 'auto' }, aroll: { frame: null, take: null, from: 'auto' },
    broll: [], sfx: [{ name: 'whoosh', q: 'whoosh', at: 0, pos: 'dau', from: 'mark' }], screen: [{ text: '90% bị hớ', kind: 'so', from: 'mark' }], lock: false },
  { seg: 1, t0: 4, t1: 9, kind: 'body', say: 'Căn hộ chung cư ở trung tâm', mood: { v: 'suspense', from: 'mark', inherit: 0 }, music: { v: 'bed', from: 'auto' }, aroll: { frame: null, take: null, off: true, from: 'mark' },
    broll: [{ q: 'căn hộ', src: 'kho', pick: 'BRoll/can-ho.mp4', alts: ['lib:x1'], from: 'mark' }, { q: 'biểu đồ giá', src: 'dong', pick: DYN[0].id, alts: [], from: 'mark' }], sfx: [], screen: [], lock: false },
  { seg: 2, t0: 9, t1: 12, kind: 'cta', say: 'Theo dõi kênh nhé', mood: { v: 'suspense', from: 'mark', inherit: 0 }, music: { v: 'bed', from: 'auto' }, aroll: { frame: null, take: null, from: 'auto' },
    broll: [{ q: 'sổ hồng', src: 'kho', pick: null, alts: [], miss: 'Kho không có cảnh khớp', from: 'mark' }], sfx: [{ name: null, q: 'tiếng lạ', at: 11.4, pos: 'cuoi', miss: 'Không có SFX khớp', from: 'mark' }], screen: [], lock: false },
] });
const word = (w, s) => ({ w, s, e: s + .4 });
const CAPS = [{ t0: 0, t1: 4, words: ['Bạn', 'có', 'biết', '90%', 'người', 'mua', 'nhà', 'bị', 'hớ'].map((w, i) => word(w, i * .4)) },
  { t0: 4, t1: 9, words: ['Căn', 'hộ', 'chung', 'cư'].map((w, i) => word(w, 4 + i)) }, { t0: 9, t1: 12, words: ['Theo', 'dõi', 'kênh'].map((w, i) => word(w, 9 + i)) }];
const CAT = { captionStyles: ['slate'], packs: [
  { id: 'basic', name: 'Cơ bản', desc: '', caption: '', base: [], items: [
    { type: 'text', label: 'Chữ', ex: { type: 'text', t0: 0, t1: 2, lines: [{ text: 'CHỮ MỚI', t: 0, style: 'yellow', size: 56, y: 640, anim: 'pop' }] } },
    { type: 'media_card', label: 'B-roll', ex: { type: 'media_card', t0: 0, t1: 3, screen: { broll: { id: DYN[0].id } } } }] },
  { id: 'slate', name: 'Slate', desc: '', caption: 'slate', music: 'tech', base: [{ type: 'frame_grid', t0: 0, t1: 12 }], items: [] }] };
const LIB = { broll: DYN, sfx: SFX, music: MOODS.map(m => ({ mood: m })), tpls: [] };
const TL = () => ({ width: 1080, height: 1920, duration: 12, pack: 'slate', caption_style: 'slate', title: 'Cũ',
  scenes: [{ type: 'frame_grid', t0: 0, t1: 12, _ai: true, _base: true }, { type: 'stat', t0: 4.5, t1: 7, _ai: true }, { type: 'quote', t0: 10, t1: 11, _ai: true, _orig: {} }],
  audio: { music: [{ t0: 0, t1: 12, mood: 'tech', _ai: true }], sfx: [{ t: 2, name: 'pop', _ai: true }] } });
const MEDIA = { 'kho:BRoll/can-ho.mp4': { seq: { seq: 'media/kho_can-ho_frames/%05d.jpg', fps: 30, count: 60 } } };

test('editCell: ô sửa tay thành user, khoá hàng chặn sửa, xoá / thêm mục; mergeSheet giữ ô user khi dựng lại', async () => {
  const s = sheet0();
  assert.equal(B.editCell(s, 0, 'mood', { v: 'happy', from: 'mark' }).mood.from, 'user');
  assert.deepEqual(B.editCell(s, 0, 'music', null).music, { v: 'bed', from: 'auto' });
  B.editCell(s, 1, 'broll', { q: 'căn hộ', src: 'lib', pick: 'x1' }, 0);
  assert.equal(s.rows[1].broll[0].from, 'user'); assert.equal(s.rows[1].broll[0].pick, 'x1');
  B.editCell(s, 2, 'screen', { text: 'Theo dõi' }); assert.equal(s.rows[2].screen.length, 1);
  B.editCell(s, 2, 'screen', null, 0); assert.equal(s.rows[2].screen.length, 0);
  B.editCell(s, 2, 'lock', true);
  assert.match(B.editCell(s, 2, 'mood', { v: 'sad' }).error, /khoá/);
  assert.match(B.editCell(s, 9, 'mood', { v: 'sad' }).error, /Không có hàng/);
  // dựng lại bảng từ kịch bản: ô user giữ, hàng khoá giữ nguyên
  const sc = { segments: D.parseScript('[MOOD: hồi hộp] [HOOK] Bạn có biết 90% người mua nhà bị hớ\n\nCăn hộ chung cư ở trung tâm [B-ROLL: căn hộ | kho]\n\n[CTA] Theo dõi kênh nhé') };
  sc.segments.forEach((x, k) => { x.t0 = [0, 4, 9][k]; x.t1 = [4, 9, 12][k]; });
  const again = await B.buildSheet(sc, { prev: s, moods: MOODS, sfx: SFX, src: { dyn: q => B.dynamicFor(q, DYN) } });
  assert.equal(again.rows[0].mood.v, 'happy'); assert.equal(again.rows[0].mood.from, 'user');
  assert.equal(again.rows[1].broll.find(b => b.from === 'user')?.pick, 'x1');
  assert.equal(again.rows[2].lock, true);
});

test('cleanCell: chỉ nhận giá trị trong thư viện / Kho, link stock https, bỏ trường lạ', () => {
  const o = { moods: new Set(MOODS), sfx: new Set(SFX.map(x => x.name)), kho: new Set(['BRoll/a.mp4']), lib: new Set(['x1']), dyn: new Set([DYN[0].id]) };
  assert.deepEqual(B.cleanCell('mood', { v: MOODS[0], from: 'mark', evil: 1 }, o), { v: MOODS[0] });
  assert.ok(B.cleanCell('mood', { v: 'khong-co' }, o).error);
  assert.ok(B.cleanCell('broll', { q: 'x', src: 'kho', pick: '../../etc/passwd' }, o).error);
  assert.deepEqual(B.cleanCell('broll', { q: 'x', src: 'kho', pick: 'BRoll/a.mp4' }, o), { q: 'x', src: 'kho', pick: 'BRoll/a.mp4' });
  assert.ok(B.cleanCell('broll', { q: 'x', src: 'stock', pick: 'http://a/b.mp4' }, o).error);
  assert.equal(B.cleanCell('broll', { q: 'bàn', src: 'ai' }, o).pending, 'Ảnh AI tạo lúc Áp');
  assert.ok(B.cleanCell('sfx', { name: 'khong_co' }, o).error);
  assert.ok(B.cleanCell('aroll', { frame: 'xa' }, o).error);
  assert.deepEqual(B.cleanCell('aroll', { frame: '', off: true }, o), { frame: null, take: null, off: true });
  assert.ok(B.cleanCell('music', { v: 'rm -rf' }, o).error);
  assert.equal(B.cleanCell('screen', { text: '  90%  ', kind: 'so' }, o).text, '90%');
  assert.equal(B.cleanCell('mood', null, o), null);
});

test('sheetToPlan: chữ, b-roll (Kho / động, A-ROLL bỏ phủ hết đoạn), SFX, mood chốt; ô thiếu vào dropped', () => {
  const p = B.sheetToPlan(sheet0(), TL(), { media: MEDIA, dynIds: new Set(DYN.map(x => x.id)) });
  assert.equal(p.text.length, 1); assert.equal(p.text[0]._sheet, 0); assert.equal(p.text[0].params.lines[0].text, '90% bị hớ');
  assert.equal(p.photos.length, 1); assert.equal(p.photos[0]._sheet, 1); assert.equal(p.photos[0].media.seq, MEDIA['kho:BRoll/can-ho.mp4'].seq.seq);
  assert.equal(p.dyn.length, 1);
  // A-ROLL bỏ: hai cảnh chia đều cả đoạn 4–9 s
  assert.equal(p.photos[0].t0, 4); assert.equal(p.dyn[0].t0 + p.dyn[0].dur, 9);
  assert.deepEqual(p.sfx, [{ name: 'whoosh', t: 0, _sheet: 0 }]);
  assert.deepEqual(p.music, { mood: 'suspense', gain: -20 });
  assert.equal(p.dropped.length, 2); // B-ROLL sổ hồng (Kho không có), SFX lạ
  // không media cho ô Kho → dropped, không cảnh rỗng
  assert.equal(B.sheetToPlan(sheet0(), TL(), {}).photos.length, 0);
  // chỉ ô luật (auto) → không đổi nhạc
  const s = sheet0(); s.rows.forEach(r => { r.mood = { v: 'tech', from: 'auto' }; });
  assert.equal(B.sheetToPlan(s, TL()).music, undefined);
});

test('planFromSheet: đi qua validate, mục có _ai + _sheet, không lặp cảnh nền của gói', () => {
  const tl = TL(), plan = E.planFromSheet(sheet0(), { tl, caps: CAPS, cat: CAT, lib: LIB }, MEDIA);
  assert.equal(plan.sheet, true);
  assert.ok(plan.scenes.length === 3 && plan.scenes.every(s => s._ai && Number.isInteger(s._sheet) && !s._base));
  assert.ok(plan.sfx.every(x => x._ai && x._sheet === 0));
  assert.equal(plan.music.mood, 'suspense'); assert.equal(plan.music._sheet, 0);
  assert.match(plan.summary, /1 chữ, 2 b-roll/);
});

// bản client của applyPlan (studio/features/20_ai.js) chạy trong node trên cùng đầu vào
function clientApply() {
  const src = fs.readFileSync(path.join(ROOT, 'studio/features/20_ai.js'), 'utf8');
  const a = src.indexOf('  const userM = m =>'), b = src.indexOf('  // S13 · M104: what the placement step did');
  assert.ok(a > 0 && b > a, 'không tìm thấy applyPlan / applySheet trong 20_ai.js');
  return (tl, caps, plan) => {
    const S = { pushUndo() {}, changed() {} };
    const f = new Function('S', 'TL', 'CAP', src.slice(a, b) + '\n;applyPlan(JSON.parse(JSON.stringify(arguments[3])), { noUndo: true }); return CAP;');
    return f(S, tl, caps, plan);
  };
}
const norm = tl => JSON.parse(JSON.stringify({ scenes: tl.scenes, audio: tl.audio, pack: tl.pack, title: tl.title }));
test('applyPlan server = client: AI dựng → Áp bảng → AI dựng lại → Áp bảng lại; một nền nhạc, mục _sheet / _orig giữ', () => {
  const client = clientApply(), sTl = TL(), cTl = TL(), sCaps = structuredClone(CAPS), cCaps = structuredClone(CAPS);
  const sheetPlan = E.planFromSheet(sheet0(), { tl: TL(), caps: CAPS, cat: CAT, lib: LIB }, MEDIA);
  const aiPlan = { pack: 'slate', caption_style: 'slate', hook: 'Mới', captions: [], music: { t0: 0, t1: 12, mood: 'happy', gain: -20, _ai: true },
    scenes: [{ type: 'stat', t0: 1, t1: 2, _ai: true }, { type: 'stat', t0: 5, t1: 6, _ai: true }], sfx: [{ t: 3, name: 'pop', _ai: true }] };
  for (const plan of [aiPlan, sheetPlan, aiPlan, sheetPlan]) {
    E.applyPlan(sTl, sCaps, structuredClone(plan)); client(cTl, cCaps, plan);
    assert.deepEqual(norm(cTl), norm(sTl));
    const beds = sTl.audio.music.filter(m => m.t0 <= .05 && m.t1 >= 11.9);
    assert.equal(beds.length, 1, 'đúng một nền nhạc phủ cả video');
  }
  // sau Áp bảng: gói / tiêu đề không đổi, cảnh AI chồng cảnh bảng (stat 5–6 s, đoạn 1 phủ 4–9 s) bị bỏ, cảnh sửa tay giữ
  assert.equal(sTl.title, 'Mới'); assert.equal(sTl.pack, 'slate');
  assert.ok(!sTl.scenes.some(s => s.type === 'stat' && s.t0 === 5));
  assert.ok(sTl.scenes.some(s => s.type === 'quote' && s._orig));
  assert.equal(sTl.scenes.filter(s => s._sheet != null).length, 3, 'Áp lại thay, không nhân đôi');
  assert.equal(sTl.audio.music[0].mood, 'suspense');
  assert.equal(sTl.audio.sfx.filter(x => x._sheet === 0).length, 1);
  // AI dựng sau Áp bảng giữ mục _sheet và nền nhạc của bảng
  E.applyPlan(sTl, sCaps, structuredClone(aiPlan)); client(cTl, cCaps, aiPlan);
  assert.deepEqual(norm(cTl), norm(sTl));
  assert.equal(sTl.scenes.filter(s => s._sheet != null).length, 3);
  assert.equal(sTl.audio.music.length, 1); assert.equal(sTl.audio.music[0].mood, 'suspense');
  // nhạc người dùng chọn (file) thắng nền bảng
  const u = TL(); u.audio.music = [{ t0: 0, t1: 12, file: 'media/a.mp3' }]; const u2 = structuredClone(u);
  E.applyPlan(u, [], structuredClone(sheetPlan)); client(u2, [], sheetPlan);
  assert.deepEqual(norm(u2), norm(u)); assert.deepEqual(u.audio.music, [{ t0: 0, t1: 12, file: 'media/a.mp3' }]);
  // Áp bảng không có mood chốt: giữ nhạc như cũ
  const keep = TL(), k2 = structuredClone(keep), noMusic = { ...structuredClone(sheetPlan), music: undefined };
  E.applyPlan(keep, [], structuredClone(noMusic)); client(k2, [], noMusic);
  assert.deepEqual(keep.audio.music, TL().audio.music); assert.deepEqual(norm(k2), norm(keep));
});

test('AI dựng đọc bảng: prompt có bảng thay dấu thô, cảnh AI chồng cảnh bảng đã trên timeline bị bỏ', () => {
  const tl = TL(); tl.scenes.push({ type: 'text', t0: 0, t1: 2, _ai: true, _sheet: 0 });
  const script = { align: { mode: 'whisper' }, segments: D.parseScript('[HOOK] Bạn có biết 90% người mua nhà bị hớ').map(s => ({ ...s, t0: 0, t1: 4 })) };
  const ctx = { tl, caps: CAPS, cat: CAT, lib: LIB, o: { pack: 'keep' }, script, sheet: sheet0() };
  const prompt = E.buildPrompt(ctx);
  assert.match(prompt, /Bảng dựng theo đoạn/); assert.match(prompt, /ĐÃ TRÊN TIMELINE/); assert.match(prompt, /CHỮ "90% bị hớ" kiểu so \(chốt\)/);
  assert.match(B.sheetPrompt(sheet0()), /A-ROLL bỏ/);
  const plan = E.validate({ pack: 'slate', scenes: [{ type: 'text', t0: 1, dur: 1, params: {} }, { type: 'text', t0: 5, dur: 1, params: {}, _sheet: 3 }] }, ctx);
  assert.ok(plan.dropped.some(d => /chồng cảnh của bảng dựng/.test(d)));
  assert.equal(plan.scenes.filter(s => !s._base).length, 1);
  assert.equal(plan.scenes.find(s => !s._base)._sheet, undefined, 'Claude không tự gắn _sheet');
});

test('QC dấu dựng mới: SFX thiếu / lạ, A-ROLL bỏ chưa phủ, B-ROLL sai nguồn, MOOD lệch nhạc, dấu chưa hiểu', () => {
  const sc = { segments: D.parseScript('[MOOD: hồi hộp] Mở đầu [SFX: whoosh] [SFX: tiếng lạ quá]\n\nĐoạn hai [A-ROLL: bỏ] [B-ROLL: căn hộ | kho] [NHẠC: lạ]').map((s, k) => ({ ...s, t0: k * 5, t1: k * 5 + 5 })) };
  const tl = { duration: 10, scenes: [{ type: 'media_card', t0: 5, t1: 6, screen: { broll: { id: 'a' } } }], audio: { music: [{ t0: 0, t1: 10, mood: 'happy' }], sfx: [] } };
  const msgs = Q.buildMarkIssues(sc, tl, { sfx: SFX, moods: MOODS }).map(i => i.msg).join('\n');
  assert.match(msgs, /SFX: whoosh\] chưa có tiếng/);
  assert.match(msgs, /không có trong thư viện SFX/);
  assert.match(msgs, /A-ROLL: bỏ\] nhưng đoạn/);
  assert.match(msgs, /B-ROLL: căn hộ \| Kho\] nhưng cảnh quanh .* lấy từ b-roll động/);
  assert.match(msgs, /MOOD: hồi hộp\] \(≈ suspense\) nhưng nhạc nền/);
  assert.match(msgs, /dấu chưa hiểu/);
  // đã đặt đúng: không báo
  tl.scenes = [{ type: 'photo', mode: 'full', t0: 5, t1: 10, media: { seq: 'media/kho_a_frames/%05d.jpg' } }];
  tl.audio = { music: [{ t0: 0, t1: 10, mood: 'suspense' }], sfx: [{ t: 0, name: 'whoosh' }] };
  const left = Q.buildMarkIssues(sc, tl, { sfx: SFX, moods: MOODS }).map(i => i.msg).join('\n');
  assert.doesNotMatch(left, /A-ROLL|B-ROLL|MOOD|chưa có tiếng/);
});

test('Studio: route + feature theo hợp đồng, panel ở bước Dựng, khay việc nhận lại job buildsheet', () => {
  const route = fs.readFileSync(path.join(ROOT, 'studio/routes/23_buildsheet.mjs'), 'utf8');
  for (const p of ['/api/buildsheet/cell', '/api/buildsheet/find', '/api/buildsheet/fill', '/api/buildsheet/apply', '/api/buildsheet/plan']) assert.ok(route.includes(p), p);
  assert.match(route, /startJob\('buildsheet'/); assert.match(route, /'--sheet'/); assert.match(route, /cleanCell\(/);
  const ui = fs.readFileSync(path.join(ROOT, 'studio/features/23_buildsheet.js'), 'utf8');
  assert.match(ui, /addPanel\('buildsheet'/); assert.match(ui, /S\.jobs\.track\(\{ kind: 'buildsheet'/); assert.match(ui, /S\.ai\.applyPlan\(plan\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'studio/features/01_workflow.js'), 'utf8'), /buildsheet: \['build'/);
  assert.match(fs.readFileSync(path.join(ROOT, 'studio/features/05_jobs.core.js'), 'utf8'), /buildsheet: \['Áp bảng dựng', 1\]/);
  assert.match(fs.readFileSync(path.join(ROOT, 'studio/features/19_script.js'), 'utf8'), /data-sc="sheet"/);
});

test('review: ô miss đổi sang ảnh AI được áp; A-ROLL bỏ phủ toàn khung và QC không báo sau khi Áp', () => {
  const s = sheet0();
  B.editCell(s, 2, 'broll', B.cleanCell('broll', { q: 'sổ hồng', src: 'ai' }, {}), 0);
  assert.equal(s.rows[2].broll[0].miss, undefined);
  assert.equal(B.mediaKey(s.rows[2].broll[0]), 'ai:sổ hồng');
  const p = B.sheetToPlan(s, TL(), { media: { ...MEDIA, 'ai:sổ hồng': { path: 'media/ai_sheet_so_hong.png' } }, dynCat: new Map(DYN.map(x => [x.id, x])) });
  assert.ok(p.photos.some(x => x._sheet === 2 && x.media === 'media/ai_sheet_so_hong.png'));
  const cov = p.photos.filter(x => x._sheet === 1);
  assert.deepEqual(cov.map(x => [x.type, x.layout || x.mode]), [['photo', 'full'], ['broll', 'full']]);
  const sc = { segments: [{ kind: 'body', say: 'Căn hộ', screen: [], broll: [], aroll: { off: true }, t0: 4, t1: 9 }] };
  const tl = TL(); E.applyPlan(tl, [], E.planFromSheet(sheet0(), { tl: TL(), caps: CAPS, cat: CAT, lib: LIB }, MEDIA));
  assert.doesNotMatch(Q.buildMarkIssues(sc, tl, { sfx: SFX, moods: MOODS }).map(i => i.msg).join('\n'), /A-ROLL/);
});

test('review: Áp lại không nhân đôi mục bảng bạn đã sửa tay (_orig), server = client', () => {
  const client = clientApply(), plan = E.planFromSheet(sheet0(), { tl: TL(), caps: CAPS, cat: CAT, lib: LIB }, MEDIA);
  const a = TL(), b = TL();
  E.applyPlan(a, [], structuredClone(plan)); client(b, [], plan);
  for (const tl of [a, b]) { tl.scenes.find(s => s._sheet === 0 && s.type === 'text')._orig = { moved: 1 }; tl.audio.sfx.find(x => x._sheet === 0)._orig = {}; }
  E.applyPlan(a, [], structuredClone(plan)); client(b, [], plan);
  assert.deepEqual(norm(b), norm(a));
  assert.equal(a.scenes.filter(s => s._sheet === 0 && s.type === 'text').length, 1);
  assert.equal(a.audio.sfx.filter(x => x._sheet === 0 && x.name === 'whoosh').length, 1);
});

test('applyFill: chỉ lấp ô auto / rỗng, ô mark / user / hàng khoá giữ, ô lấp ghi from claude', async () => {
  const s = sheet0(); s.rows[2].mood = { v: 'tech', from: 'auto' }; s.rows[1].lock = true;
  const { n, prompt } = B.fillPrompt(s, { moods: MOODS, sfx: ['whoosh'] });
  assert.equal(n, 1); assert.match(prompt, /Đ2 .*cần: mood/); assert.doesNotMatch(prompt, /Đ1 /);
  const got = await B.applyFill(s, { rows: [{ seg: 0, mood: 'happy', sfx: ['ding'] }, { seg: 1, mood: 'happy', sfx: ['ding'] }, { seg: 2, mood: 'vui', sfx: ['whoosh', 'ding'], broll: ['x'] }] },
    { moods: MOODS, sfx: SFX, pick: async q => ({ q, src: 'dong', pick: DYN[0].id, alts: [] }) });
  assert.equal(s.rows[0].mood.v, 'suspense'); assert.equal(s.rows[0].sfx.length, 1); // ô mark giữ
  assert.equal(s.rows[1].mood.from, 'mark'); assert.equal(s.rows[1].sfx.length, 0); // hàng khoá
  assert.deepEqual(s.rows[2].mood, { v: 'happy', from: 'claude' });
  assert.equal(s.rows[2].broll.length, 1); // ô B-roll của hàng 2 đã có (miss) nên không lấp; hàng CTA cũng không
  assert.equal(got, 1);
});
