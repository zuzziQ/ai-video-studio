// S27 M194: AI dựng theo kịch bản (không bảng để sửa): bảng nội bộ → sheetToPlan → validate, gộp vào kế hoạch của Claude (mergeScript),
// mục mang _sheet + _script (ghi chú trên khối), báo cáo plan.script, applyPlan server = client (một bước hoàn tác), QC dấu dựng mới.
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
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// bảng mẫu: 3 đoạn đã căn
const sheet0 = () => ({ version: 1, rows: [
  { seg: 0, t0: 0, t1: 4, kind: 'hook', say: 'Bạn có biết 90% người mua nhà bị hớ', mood: { v: 'suspense', text: 'hồi hộp', from: 'mark' }, music: { v: 'bed', from: 'auto' }, aroll: { frame: null, take: null, from: 'auto' },
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
const CTX = () => ({ tl: TL(), caps: CAPS, cat: CAT, lib: LIB });
// kế hoạch của Claude (đã validate) + phần dựng theo dấu, như main() của ai_edit.mjs
const aiPlan = () => ({ pack: 'slate', caption_style: 'slate', hook: 'Mới', captions: [], music: { t0: 0, t1: 12, mood: 'happy', gain: -20, _ai: true },
  scenes: [{ type: 'frame_grid', t0: 0, t1: 12, _ai: true, _base: true }, { type: 'stat', t0: 1, t1: 2, _ai: true }, { type: 'stat', t0: 5, t1: 6, _ai: true }],
  sfx: [{ t: 3, name: 'pop', _ai: true }, { t: .1, name: 'ding', _ai: true }], dropped: ['kịch bản: dấu B-ROLL “căn hộ” @4s chưa có cảnh'], cuts: [] });
function scriptPlan(media = MEDIA) {
  const plan = aiPlan(), sp = E.planFromSheet(sheet0(), CTX(), media);
  E.mergeScript(plan, sp);
  plan.script = B.scriptReport(B.scriptRequests(sheet0()), plan, sp.miss);
  return plan;
}

test('sheetToPlan: chữ, b-roll (Kho / động, A-ROLL bỏ phủ hết đoạn), SFX, mood; mỗi mục mang _sheet + _script, ô thiếu vào miss', () => {
  const p = B.sheetToPlan(sheet0(), TL(), { media: MEDIA, dynIds: new Set(DYN.map(x => x.id)) });
  assert.equal(p.text.length, 1); assert.equal(p.text[0]._sheet, 0); assert.equal(p.text[0].params.lines[0].text, '90% bị hớ');
  assert.deepEqual(p.text[0]._script, { id: '0:chu:0', kind: 'CHỮ', text: '90% bị hớ', note: 'chữ trên khung' });
  assert.equal(p.photos.length, 1); assert.equal(p.photos[0].media.seq, MEDIA['kho:BRoll/can-ho.mp4'].seq.seq);
  assert.equal(p.photos[0]._script.id, '1:broll:0'); assert.match(p.photos[0]._script.note, /cảnh Kho “can-ho\.mp4” · phủ cả khung/);
  assert.equal(p.dyn.length, 1); assert.equal(p.dyn[0]._script.id, '1:broll:1');
  // A-ROLL bỏ: hai cảnh chia đều cả đoạn 4–9 s
  assert.equal(p.photos[0].t0, 4); assert.equal(p.dyn[0].t0 + p.dyn[0].dur, 9);
  assert.equal(p.sfx.length, 1); assert.equal(p.sfx[0]._script.id, '0:sfx:0');
  assert.equal(p.music.mood, 'suspense'); assert.equal(p.music._script.id, '0:mood'); assert.equal(p.music._script.text, 'hồi hộp');
  assert.deepEqual(Object.keys(p.miss).sort(), ['2:broll:0', '2:sfx:0']);
  assert.match(p.miss['2:broll:0'], /Kho không có cảnh khớp/);
  // không media cho ô Kho → miss có lý do, không cảnh rỗng
  const n = B.sheetToPlan(sheet0(), TL(), { mediaErr: { 'kho:BRoll/can-ho.mp4': 'file Kho đã bị xoá' } });
  assert.equal(n.photos.length, 0); assert.match(n.miss['1:broll:0'], /file Kho đã bị xoá/);
  // chỉ ô luật (auto) → không đổi nhạc
  const s = sheet0(); s.rows.forEach(r => { r.mood = { v: 'tech', from: 'auto' }; });
  assert.equal(B.sheetToPlan(s, TL()).music, undefined);
});

test('scriptRequests / scriptReport: mỗi dấu một yêu cầu, đã dựng theo _script.id, A-ROLL bỏ theo cảnh phủ khung, lý do khi thiếu', () => {
  const reqs = B.scriptRequests(sheet0());
  assert.deepEqual(reqs.map(q => q.id), ['0:mood', '0:chu:0', '0:sfx:0', '1:aroll', '1:broll:0', '1:broll:1', '2:broll:0', '2:sfx:0']);
  const plan = scriptPlan();
  assert.equal(plan.script.total, 8); assert.equal(plan.script.done, 6);
  assert.deepEqual(plan.script.req.filter(q => !q.ok).map(q => q.id), ['2:broll:0', '2:sfx:0']);
  assert.ok(plan.script.req.every(q => q.ok || q.why));
  // không có media Kho: B-ROLL căn hộ thiếu, A-ROLL bỏ vẫn đạt nhờ b-roll động phủ khung
  const p2 = scriptPlan({});
  assert.equal(p2.script.req.find(q => q.id === '1:broll:0').ok, false);
  assert.equal(p2.script.req.find(q => q.id === '1:aroll').ok, true);
  // ô auto không thành yêu cầu
  const s = sheet0(); s.rows[0].sfx[0].from = 'auto'; assert.ok(!B.scriptRequests(s).some(q => q.id === '0:sfx:0'));
});

test('planFromSheet + mergeScript: qua validate, cảnh Claude chồng cảnh theo kịch bản bị bỏ, SFX trùng lúc bị bỏ, nhạc mang mood dấu', () => {
  const sp = E.planFromSheet(sheet0(), CTX(), MEDIA);
  assert.ok(sp.scenes.length === 3 && sp.scenes.every(s => s._ai && Number.isInteger(s._sheet) && s._script?.id && !s._base));
  assert.ok(sp.sfx.every(x => x._ai && x._sheet === 0 && x._script?.id === '0:sfx:0'));
  assert.equal(sp.music.mood, 'suspense'); assert.equal(sp.music._script.id, '0:mood');
  const plan = scriptPlan();
  assert.ok(plan.scenes[0]._base, 'cảnh nền của gói đứng đầu');
  assert.ok(!plan.scenes.some(s => s.type === 'stat' && s.t0 === 5), 'stat 5–6 s chồng đoạn A-ROLL bỏ 4–9 s');
  assert.ok(plan.scenes.some(s => s.type === 'stat' && s.t0 === 1) === false, 'stat 1–2 s chồng chữ của đoạn 0');
  assert.ok(plan.dropped.some(d => /chồng cảnh theo kịch bản \(đoạn 2\)/.test(d)));
  assert.ok(!plan.dropped.some(d => /^kịch bản: dấu B-ROLL/.test(d)), 'lời thiếu dấu của Claude thay bằng báo cáo');
  assert.ok(!plan.sfx.some(x => x.name === 'ding'), 'SFX của Claude trùng lúc SFX theo dấu');
  assert.ok(plan.sfx.some(x => x.name === 'pop' && x.t === 3));
  assert.equal(plan.music.mood, 'suspense'); assert.equal(plan.music._script.id, '0:mood');
});

// bản client của applyPlan (studio/features/20_ai.js) chạy trong node trên cùng đầu vào
function clientApply() {
  const src = read('studio/features/20_ai.js');
  const a = src.indexOf('  const userM = m =>'), b = src.indexOf('  // S13 · M104: what the placement step did');
  assert.ok(a > 0 && b > a, 'không tìm thấy applyPlan trong 20_ai.js');
  return (tl, caps, plan) => {
    const S = { pushUndo() {}, changed() {} };
    const f = new Function('S', 'TL', 'CAP', src.slice(a, b) + '\n;applyPlan(JSON.parse(JSON.stringify(arguments[3])), { noUndo: true }); return CAP;');
    return f(S, tl, caps, plan);
  };
}
const norm = tl => JSON.parse(JSON.stringify({ scenes: tl.scenes, audio: tl.audio, pack: tl.pack, title: tl.title }));
test('applyPlan server = client: AI dựng có / không kịch bản xen nhau; một nền nhạc, dựng lại thay mục cũ, không nhân đôi', () => {
  const client = clientApply(), sTl = TL(), cTl = TL(), sCaps = structuredClone(CAPS), cCaps = structuredClone(CAPS);
  const plain = aiPlan(), withScript = scriptPlan();
  for (const plan of [plain, withScript, withScript, plain, withScript]) {
    E.applyPlan(sTl, sCaps, structuredClone(plan)); client(cTl, cCaps, plan);
    assert.deepEqual(norm(cTl), norm(sTl));
    assert.equal(sTl.audio.music.filter(m => m.t0 <= .05 && m.t1 >= 11.9).length, 1, 'đúng một nền nhạc phủ cả video');
  }
  assert.equal(sTl.scenes.filter(s => s._sheet != null).length, 3, 'dựng lại thay, không nhân đôi');
  assert.equal(sTl.scenes.filter(s => s._base).length, 1);
  assert.ok(sTl.scenes.some(s => s.type === 'quote' && s._orig), 'cảnh bạn sửa tay giữ');
  assert.equal(sTl.audio.music[0].mood, 'suspense');
  assert.equal(sTl.audio.sfx.filter(x => x._sheet === 0).length, 1);
  // AI dựng không kèm kịch bản (kịch bản đã bỏ) giữ mục theo kịch bản và nền nhạc của nó
  E.applyPlan(sTl, sCaps, structuredClone(plain)); client(cTl, cCaps, plain);
  assert.deepEqual(norm(cTl), norm(sTl));
  assert.equal(sTl.scenes.filter(s => s._sheet != null).length, 3);
  assert.equal(sTl.audio.music.length, 1); assert.equal(sTl.audio.music[0].mood, 'suspense');
  // nhạc người dùng chọn (file) thắng nhạc theo dấu MOOD
  const u = TL(); u.audio.music = [{ t0: 0, t1: 12, file: 'media/a.mp3' }]; const u2 = structuredClone(u);
  E.applyPlan(u, [], structuredClone(withScript)); client(u2, [], withScript);
  assert.deepEqual(norm(u2), norm(u)); assert.deepEqual(u.audio.music, [{ t0: 0, t1: 12, file: 'media/a.mp3' }]);
});

test('applyPlan: dựng lại theo kịch bản không nhân đôi mục theo dấu bạn đã sửa tay (_orig), server = client', () => {
  const client = clientApply(), plan = scriptPlan(), a = TL(), b = TL();
  E.applyPlan(a, [], structuredClone(plan)); client(b, [], plan);
  for (const tl of [a, b]) { tl.scenes.find(s => s._sheet === 0 && s.type === 'text')._orig = { moved: 1 }; tl.audio.sfx.find(x => x._sheet === 0)._orig = {}; }
  E.applyPlan(a, [], structuredClone(plan)); client(b, [], plan);
  assert.deepEqual(norm(b), norm(a));
  assert.equal(a.scenes.filter(s => s._sheet === 0 && s.type === 'text').length, 1);
  assert.ok(a.scenes.find(s => s._sheet === 0 && s.type === 'text')._orig, 'bản sửa tay là bản giữ');
  assert.equal(a.audio.sfx.filter(x => x._sheet === 0 && x.name === 'whoosh').length, 1);
});

test('AI dựng đọc dấu: prompt có hàng DỰNG SẴN; lần có kịch bản không bỏ cảnh vì mục _sheet cũ; lần không có thì có', () => {
  const tl = TL(); tl.scenes.push({ type: 'text', t0: 0, t1: 2, _ai: true, _sheet: 0 });
  const script = { align: { mode: 'whisper' }, segments: D.parseScript('[HOOK] Bạn có biết 90% người mua nhà bị hớ').map(s => ({ ...s, t0: 0, t1: 4 })) };
  const ctx = { tl, caps: CAPS, cat: CAT, lib: LIB, o: { pack: 'keep', merge: true }, script, sheet: sheet0() };
  const prompt = E.buildPrompt(ctx);
  assert.match(prompt, /Kịch bản theo đoạn, đã đọc dấu/); assert.match(prompt, /Đ1 .*DỰNG SẴN/); assert.match(prompt, /CHỮ "90% bị hớ" kiểu so \(chốt\)/);
  assert.doesNotMatch(prompt, /Đ3 [^\n]*DỰNG SẴN/, 'đoạn chỉ có B-ROLL thiếu cảnh: Claude lấp');
  assert.deepEqual([...B.builtSegs(sheet0())], [0, 1]);
  const raw = { pack: 'slate', scenes: [{ type: 'text', t0: 1, dur: 1, params: {} }, { type: 'text', t0: 5, dur: 1, params: {}, _sheet: 3 }] };
  assert.equal(E.validate(raw, ctx).scenes.filter(s => !s._base).length, 2);
  const old = E.validate(raw, { ...ctx, o: { pack: 'keep' } });
  assert.ok(old.dropped.some(d => /chồng cảnh theo kịch bản/.test(d)));
  assert.equal(old.scenes.find(s => !s._base)._sheet, undefined, 'Claude không tự gắn _sheet');
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
  // AI dựng theo kịch bản xong (A-ROLL bỏ phủ khung): QC không báo A-ROLL
  const sc2 = { segments: [{ kind: 'body', say: 'Căn hộ', screen: [], broll: [], aroll: { off: true }, t0: 4, t1: 9 }] };
  const t2 = TL(); E.applyPlan(t2, [], scriptPlan());
  assert.doesNotMatch(Q.buildMarkIssues(sc2, t2, { sfx: SFX, moods: MOODS }).map(i => i.msg).join('\n'), /A-ROLL/);
});

test('sheetMedia: ô lỗi thử phương án kế rồi b-roll động; ô có nguồn ép từ dấu (want) không đổi nguồn, vào báo cáo', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'p-'));
  const s = sheet0();
  s.rows[1].broll = [{ q: 'căn hộ', src: 'lib', pick: 'khong-co', alts: ['lib:cung-khong-co'], from: 'mark' }, { q: 'sổ hồng', src: 'lib', pick: 'mat-roi', alts: [], want: 'lib', from: 'mark' }];
  const { media, err } = await E.sheetMedia(dir, TL(), s, () => {}, DYN);
  assert.deepEqual(media, {});
  assert.equal(s.rows[1].broll[0].src, 'dong', 'rơi xuống b-roll động'); assert.ok(DYN.some(x => x.id === s.rows[1].broll[0].pick));
  assert.equal(s.rows[1].broll[1].src, 'lib'); assert.match(err['lib:mat-roi'], /không còn trong thư viện/);
  const p = B.sheetToPlan(s, TL(), { media, mediaErr: err, dynIds: new Set(DYN.map(x => x.id)) });
  assert.match(p.miss['1:broll:1'], /không còn trong thư viện/);
  assert.ok(![...p.dyn, ...p.photos].some(x => x._script?.id === '1:broll:1'));
  assert.ok([...p.dyn, ...p.photos].some(x => x._script?.id === '1:broll:0' && /b-roll động/.test(x._script.note)));
});

test('ô ảnh AI theo dấu (| ảnh AI) có media thì dựng, ghi chú ảnh AI', () => {
  const s = sheet0(); s.rows[2].broll[0] = { q: 'sổ hồng', src: 'ai', pick: null, alts: [], pending: 'Ảnh AI tạo khi bấm hoặc lúc Áp', from: 'mark' };
  assert.equal(B.mediaKey(s.rows[2].broll[0]), 'ai:sổ hồng');
  const p = B.sheetToPlan(s, TL(), { media: { ...MEDIA, 'ai:sổ hồng': { path: 'media/ai_sheet_so_hong.png' } }, dynCat: new Map(DYN.map(x => [x.id, x])) });
  const ai = p.photos.find(x => x._sheet === 2);
  assert.equal(ai.media, 'media/ai_sheet_so_hong.png'); assert.match(ai._script.note, /ảnh AI/);
  assert.deepEqual(p.photos.filter(x => x._sheet === 1).map(x => [x.type, x.layout || x.mode]), [['photo', 'full'], ['broll', 'full']]);
});

test('Studio: không còn panel Bảng dựng; ghi chú trên khối, Sửa tay / Hỏi Claude, dòng Theo kịch bản ở AI dựng', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'studio/features/23_buildsheet.js')) && !fs.existsSync(path.join(ROOT, 'studio/routes/23_buildsheet.mjs')));
  for (const f of ['studio/features/01_workflow.js', 'studio/features/05_jobs.core.js', 'studio/features/19_script.js', 'studio/features/20_ai.js'])
    assert.doesNotMatch(read(f), /buildsheet|buildSheet|Mở bảng dựng/, f);
  const ui = read('studio/features/23_scriptnotes.js');
  assert.match(ui, /S\._tip\.push/); assert.match(ui, /S\._itop\.push/); assert.match(ui, /S\.openSect\(/); assert.match(ui, /S\.ask\.open\(false\)/);
  assert.match(ui, /Theo kịch bản: <b>\$\{st\.done\}\/\$\{st\.total\}<\/b> yêu cầu đã dựng/);
  const core = read('studio/studio.js');
  assert.match(core, /Studio\._tip\.map\(f => f\(c\)/); assert.match(core, /Studio\._itop\.map\(f => f\(c\)/); assert.match(core, /select, sect, openSect,/);
  assert.match(read('studio/features/20_ai.js'), /S\.scriptNotes\?\.line\(lastPlan\)/);
});
