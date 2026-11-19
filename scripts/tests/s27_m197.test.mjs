// S27 M197: kịch bản dạng Excel / CSV có mốc giây và chỉ dẫn dựng (scripts/script_table.mjs, dấu [MỐC] [GHI CHÚ] của script_doc.mjs).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-s27-m197-'));
process.env.AVS_HOME = TMP;
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const D = await import('../script_doc.mjs');
const B = await import('../script_build.mjs');
const T = await import('../script_table.mjs');
const FX = f => fs.readFileSync(new URL('./fixtures/' + f, import.meta.url));

test('mốc giây nhiều dạng', () => {
  const at = v => D.parseTimeRange(v);
  assert.deepEqual(at('00:05–00:12'), { t0: 5, t1: 12 });
  assert.deepEqual(at('5-12'), { t0: 5, t1: 12 });
  assert.deepEqual(at('5 → 12s'), { t0: 5, t1: 12 });
  assert.deepEqual(at('0:05'), { t0: 5, t1: null });
  assert.deepEqual(at('5s'), { t0: 5, t1: null });
  assert.deepEqual(at('5,5 - 8'), { t0: 5.5, t1: 8 });
  assert.deepEqual(at('1:02:03'), { t0: 3723, t1: null });
  assert.deepEqual(at(String(12 / 86400)), { t0: 12, t1: null }); // ô Excel định dạng giờ
  assert.deepEqual(at('12 - 5'), { t0: 12, t1: null }); // kết thúc trước bắt đầu: bỏ
  assert.equal(at('abc'), null); assert.equal(at(''), null);
  assert.equal(D.fmtTimeRange({ t0: 9.5, t1: 65 }), '0:09.5–1:05');
});

test('nhận cột theo tên (không dấu, nhiều cách viết), cột lạ = null', () => {
  const want = { STT: 'skip', 'Thời gian': 'time', 'Time (s)': 'time', 'Timecode': 'time', 'Giây': 'time', 'Bắt đầu': 'start', 'Thoi gian bat dau': 'start', 'Kết thúc': 'end',
    'Lời thoại': 'say', 'Voice over': 'say', 'Kịch bản': 'say', 'Chữ trên màn hình': 'screen', 'Text on screen': 'screen', 'Hình ảnh / Source': 'visual', 'B-roll': 'visual',
    'Chuyển cảnh': 'transition', 'Hiệu ứng chuyển cảnh': 'transition', 'Ghi chú': 'note', 'Chỉ dẫn dựng': 'note', 'Notes': 'note', 'Nhạc nền': 'mood', 'SFX': 'sfx', 'Âm thanh': 'sfx', 'Mã cảnh': 'skip', 'Cột lạ XYZ': null };
  for (const [c, r] of Object.entries(want)) assert.equal(T.roleOf(c), r, c);
  // không có cột tên "lời": cột chữ dài nhất thành lời
  const g = T.guessRoles(['Giây', 'Cái gì đó'], [{ 'Giây': '0-5', 'Cái gì đó': 'Một câu nói khá dài của người dẫn' }]);
  assert.equal(g.roles['Cái gì đó'], 'say'); assert.deepEqual(g.unknown, []);
});

test('.xlsx mẫu → kịch bản có dấu, mỗi hàng một đoạn, mốc giây là t0 / t1, cột lạ báo hỏi', () => {
  const t = T.readTable(FX('s27_m197_kich_ban.xlsx'), 'kb.xlsx');
  assert.deepEqual(t.unknown, ['Cột lạ XYZ']);
  assert.equal(t.roles['Thời gian'], 'time'); assert.equal(t.roles.STT, 'skip');
  assert.doesNotMatch(t.text, /abc|xyz/); // cột chưa gán không vào kịch bản
  assert.match(t.text, /^\[MỐC: 0:00–0:05\] \[A-ROLL: cận mặt\] \[CHỮ: XIN CHÀO\] \[GHI CHÚ: Chuyển cảnh mờ dần\]\nChào mừng/);
  assert.match(t.text, /\[B-ROLL: cảnh spa \| stock\]/);
  assert.match(t.text, /\[B-ROLL: clip_02 \| tệp clip_02\.mp4\]/);
  const segs = D.parseScript(t.text);
  assert.equal(segs.length, 4); // hàng chỉ có hình (không lời) gộp vào đoạn sau
  assert.deepEqual(segs.map(s => s.at), [{ t0: 0, t1: 5 }, { t0: 5, t1: 12 }, { t0: 12, t1: null }, { t0: 25, t1: null }]);
  assert.deepEqual(segs[0].note, ['Chuyển cảnh mờ dần']); assert.deepEqual(segs[0].aroll, { frame: 'can' });
  assert.deepEqual(segs[3].broll, ['clip_02']); assert.equal(segs[3].brollSrc[0], 'tep:clip_02.mp4');
  // lời giữ nguyên từng chữ: bỏ dấu ra là đúng cột lời
  assert.deepEqual(segs.map(s => s.say), ['Chào mừng các bạn đến với kênh', 'Hôm nay mình review hộp kem dưỡng', 'Kem này giúp da mịn sau một tuần', 'Đăng ký kênh nhé']);
  // người dùng gán cột lạ là ghi chú
  const r = T.tableToScript(t.columns, t.rows, { ...t.roles, 'Cột lạ XYZ': 'note' });
  assert.match(r.text, /\[GHI CHÚ: abc\]/);
  // chưa có cột lời: cảnh báo
  assert.match(T.tableToScript(t.columns, t.rows, { ...t.roles, 'Lời thoại': 'skip' }).warn.join(' '), /Chưa có cột lời/);
});

test('.csv mẫu (dấu ;, BOM, ô nhiều dòng, cột bắt đầu / kết thúc riêng, số thập phân dấu phẩy)', () => {
  const t = T.readTable(FX('s27_m197_kich_ban.csv'), 'kb.csv');
  assert.deepEqual(t.unknown, []);
  assert.deepEqual(t.roles, { 'Bắt đầu': 'start', 'Kết thúc': 'end', 'Voice over': 'say', 'Text on screen': 'screen', Notes: 'note' });
  const segs = D.parseScript(t.text);
  assert.deepEqual(segs.map(s => s.at), [{ t0: 0, t1: 4 }, { t0: 4, t1: 9.5 }, { t0: 9.5, t1: null }]);
  assert.equal(segs[1].say, 'Hôm nay thử món phở ở quán quen');
  assert.deepEqual(segs[0].screen, ['Lan · Reviewer']);
  // mốc sai và mốc đi lùi: cảnh báo
  const w = T.tableToScript(['t', 'loi'], [{ t: '0:10', loi: 'a' }, { t: '0:03', loi: 'b' }, { t: 'sớm', loi: 'c' }], { t: 'time', loi: 'say' }).warn.join(' | ');
  assert.match(w, /không đọc được mốc giây "sớm"/); assert.match(w, /đi lùi/);
});

test('[MỐC] / [GHI CHÚ] không phải chữ nói; không giá trị thì là chữ thường', () => {
  const s = D.parseScript('[MỐC: 0:05] [GHI CHÚ: zoom vào sản phẩm] Xin chào [giây] nhé');
  assert.equal(s[0].say, 'Xin chào [giây] nhé'); assert.deepEqual(s[0].at, { t0: 5, t1: null });
  assert.equal(D.stripMarks('[MỐC: 0:05] A [GHI CHÚ: b] C').replace(/\s+/g, ' ').trim(), 'A C');
  assert.deepEqual(D.parseScript('[MỐC: hôm qua] A')[0].raw, ['[MỐC: hôm qua]']); // mốc không đọc được: dấu lạ, QC báo
});

test('căn: không lời giữ mốc bảng, đoạn không mốc chia khoảng trống; có lời thì theo lời nói và báo đoạn lệch lớn', () => {
  const segs = D.parseScript('[MỐC: 0:02–0:06] Một hai ba\n\nBốn năm\n\n[MỐC: 0:20] Sáu bảy tám\n\nChín');
  const even = D.alignScript(segs, [], { dur: 30 });
  assert.deepEqual(even.segments.map(s => [s.t0, s.t1]), [[2, 6], [6, 20], [20, 25], [25, 30]]);
  assert.equal(even.align.sheet, 2);
  const W = (txt, t) => txt.split(' ').map((w, i) => ({ w, s: t + i * .3, e: t + i * .3 + .25 }));
  const heard = [...W('Một hai ba', 2.2), ...W('Bốn năm', 8), ...W('Sáu bảy tám', 10), ...W('Chín', 14)];
  const r = D.alignScript(segs, heard, { dur: 30 });
  assert.equal(r.segments[0].t0, 2.2); assert.equal(r.segments[2].t0, 10); // giờ theo lời nói thắng mốc bảng
  assert.deepEqual(r.align.drift, [{ seg: 2, sheet: 20, heard: 10, d: -10 }]);
  assert.equal(D.alignScript(D.parseScript('A b c'), heard).align.drift, undefined); // kịch bản thường: không có trường mới
});

test('luật chỉ dẫn → ô bảng dựng; vế lạ để cho Claude', () => {
  const say = 'Kem dưỡng da ban đêm giúp da mịn màng';
  const c = n => T.ruleCells(n, say);
  assert.deepEqual(c('Chuyển cảnh mờ dần, focus vào sản phẩm hộp kem').cells.map(x => [x.type, x.v || x.on, x.target]), [['transition', 'fade', undefined], ['focus', 'product', 'sản phẩm hộp kem']]);
  assert.deepEqual(c('Tìm thêm source cảnh phố Sài Gòn ban đêm').cells[0], { type: 'broll', q: 'cảnh phố Sài Gòn ban đêm', src: 'stock', note: 'Tìm thêm source cảnh phố Sài Gòn ban đêm', by: 'luat' });
  assert.equal(c('tìm cảnh biển').cells[0].q, 'cảnh biển');
  const ex = c('Thêm ví dụ khi giới thiệu cái này').cells[0];
  assert.equal(ex.type, 'graphic'); assert.equal(ex.text, 'Kem dưỡng da ban đêm giúp da mịn màng'); // chỉ dẫn mơ hồ: lấy ý từ lời
  assert.equal(c('thêm ví dụ về khách hàng thật').cells[0].text, 'khách hàng thật');
  assert.deepEqual(c('zoom vào người nói').cells.map(x => x.type), ['focus', 'aroll']);
  assert.equal(c('quay toàn cảnh').cells[0].frame, 'rong');
  assert.equal(c('chuyển cảnh trượt').cells[0].v, 'slide');
  const mix = c('cận mặt người nói; làm cho sang hơn');
  assert.deepEqual(mix.cells.map(x => x.frame), ['can']); assert.deepEqual(mix.rest, ['làm cho sang hơn']);
  const sc = { segments: D.parseScript('[GHI CHÚ: chuyển cảnh mờ dần] A b\n\n[GHI CHÚ: làm cho sang hơn] C d\n\nE') };
  const dr = T.directiveDraft(sc);
  assert.deepEqual(dr.cells.map(x => [x.seg, x.type]), [[0, 'transition']]);
  assert.deepEqual(dr.ask, [{ seg: 1, say: 'C d', note: 'làm cho sang hơn' }]);
  assert.match(T.directivePrompt(dr.ask, { brand: 'Nhà Xanh' }), /Nhà Xanh[\s\S]*KHÔNG viết lại lời[\s\S]*làm cho sang hơn/);
});

test('kiểm ô của Claude: chỉ loại biết, đúng đoạn được hỏi, tối đa 3 ô mỗi đoạn', () => {
  const ask = [{ seg: 1, say: 'x', note: 'làm sang' }];
  assert.throws(() => T.checkClaudeCells({ text: 'x' }, ask, 3), /cells/);
  const out = T.checkClaudeCells({ cells: [
    { seg: 1, type: 'transition', v: 'fade' }, { seg: 1, type: 'aroll', frame: 'xa' }, { seg: 0, type: 'broll', q: 'x' }, { seg: 1, type: 'say', text: 'lời mới' },
    { seg: 1, type: 'broll', q: 'sảnh khách sạn [sang]' }, { seg: 1, type: 'graphic', text: 'Ví dụ: khách VIP' }, { seg: 1, type: 'focus', on: 'product' },
  ] }, ask, 3);
  assert.deepEqual(out.map(x => x.type), ['transition', 'broll', 'graphic']);
  assert.equal(out[1].q, 'sảnh khách sạn (sang)'); assert.equal(out[0].by, 'claude'); assert.equal(out[0].note, 'làm sang');
});

// ---------- route với ctx giả (như s27_m193) ----------
function project({ mute = false } = {}) {
  const dir = fs.mkdtempSync(path.join(TMP, 'p-'));
  fs.mkdirSync(path.join(dir, 'work'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'work/captions.json'), '[]');
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({ duration: 30, width: 1080, height: 1920, captions: 'work/captions.json', scenes: [], ...(mute ? { speech: { none: true } } : {}) }));
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
const req = (method, json, buf, headers = {}) => Object.assign(Readable.from(buf ? [buf] : []), { method, _json: json, headers });

test('route: mở .xlsx, gán cột, lưu (video không lời giữ mốc), chỉ dẫn → ô bảng dựng, Nhận ghi from claude và giữ qua dựng lại', async () => {
  const route = (await import('../../studio/routes/19_script.mjs')).default;
  const L = await import('../llm.mjs');
  let prompts = [];
  const llm = { askJSON: (p, o) => L.askJSON(p, { ...o, run: async q => { prompts.push(q); return { text: JSON.stringify({ cells: [{ seg: 3, type: 'transition', v: 'zoom' }, { seg: 3, type: 'broll', q: 'sảnh sang trọng' }] }), provider: 'claude' }; } }) };
  const dir = project({ mute: true }), ctx = fakeCtx(dir, llm), h = route(ctx);
  // file không phải bảng
  await h(req('POST', null, Buffer.from('x'), { 'x-file-name': 'a.pdf' }), {}, '/api/script/table'); assert.equal(ctx.out.code, 400);
  await h(req('POST', null, FX('s27_m197_kich_ban.xlsx'), { 'x-file-name': encodeURIComponent('Kịch bản.xlsx') }), {}, '/api/script/table');
  assert.equal(ctx.out.code, 200, JSON.stringify(ctx.out.body));
  const t = ctx.out.body; assert.deepEqual(t.unknown, ['Cột lạ XYZ']); assert.equal(t.rows.length, 5);
  await h(req('POST', { columns: t.columns, rows: t.rows, roles: { ...t.roles, 'Cột lạ XYZ': 'skip', STT: 'hack' } }), {}, '/api/script/table/text');
  const text = ctx.out.body.text; assert.equal(ctx.out.body.segs, 5);
  await h(req('POST', { text, name: 'Kịch bản.xlsx' }), {}, '/api/script');
  assert.equal(ctx.out.code, 200, JSON.stringify(ctx.out.body));
  const sc = D.readScript(dir);
  assert.equal(sc.align.mode, 'even');
  assert.deepEqual(sc.segments.map(s => [s.t0, s.t1]), [[0, 5], [5, 12], [12, 25], [25, 30]]);
  let sheet = B.readSheet(dir); assert.equal(sheet.rows[1].t0, 5); assert.deepEqual(sheet.rows[1].note, ['focus vào sản phẩm hộp kem']);
  // chỉ dẫn: luật + Claude cho vế còn lại
  await h(req('POST', { claude: true }), {}, '/api/script/directives');
  assert.equal(ctx.out.code, 200, JSON.stringify(ctx.out.body));
  const cells = ctx.out.body.cells;
  assert.deepEqual(cells.map(c => [c.seg, c.type, c.by]), [[0, 'transition', 'luat'], [1, 'focus', 'luat'], [2, 'graphic', 'luat'], [3, 'transition', 'claude'], [3, 'broll', 'claude']]);
  assert.equal(cells[0].label, 'Chuyển cảnh mờ dần');
  assert.equal(prompts.length, 1); assert.match(prompts[0], /làm cho sang hơn/); assert.doesNotMatch(prompts[0], /Chuyển cảnh mờ dần/);
  // không Claude: chỉ ô của luật
  await h(req('POST', {}), {}, '/api/script/directives'); assert.equal(ctx.out.body.cells.length, 3); assert.equal(prompts.length, 1);
  // Nhận 4 ô (bỏ ô graphic); ô lạ bị loại
  await h(req('POST', { cells: [...cells.filter(c => c.type !== 'graphic'), { seg: 9, type: 'aroll', frame: 'can' }] }), {}, '/api/script/directives/accept');
  assert.equal(ctx.out.body.added, 4, JSON.stringify(ctx.out.body));
  sheet = B.readSheet(dir);
  assert.deepEqual(sheet.rows[0].transition, { v: 'fade', from: 'claude', by: 'luat', note: 'Chuyển cảnh mờ dần' });
  assert.equal(sheet.rows[1].focus.on, 'product');
  assert.deepEqual(sheet.rows[3].broll.find(b => b.from === 'claude'), { q: 'sảnh sang trọng', src: 'stock', pick: null, alts: [], miss: 'Cần tìm nguồn', from: 'claude', by: 'claude', note: 'làm cho sang hơn' });
  // nhận lại: không trùng
  await h(req('POST', { cells }), {}, '/api/script/directives/accept'); assert.equal(ctx.out.body.added, 1);
  // lưu lại kịch bản (lời không đổi) → dựng lại bảng vẫn giữ ô đã Nhận; lời không bị sửa
  await h(req('POST', { text, name: 'Kịch bản.xlsx' }), {}, '/api/script');
  sheet = B.readSheet(dir);
  assert.equal(sheet.rows[0].transition.v, 'fade'); assert.equal(sheet.rows[2].screen.find(x => x.kind === 'vidu').from, 'claude');
  assert.equal(sheet.rows[3].broll.filter(b => b.from === 'claude').length, 1);
  assert.deepEqual(D.readScript(dir).segments.map(s => s.say), ['Chào mừng các bạn đến với kênh', 'Hôm nay mình review hộp kem dưỡng', 'Kem này giúp da mịn sau một tuần', 'Đăng ký kênh nhé']);
});

test('acceptCells bỏ qua hàng khoá; mergeSheet giữ ô claude khi lời không đổi, bỏ khi lời đổi', () => {
  const sheet = { rows: [{ seg: 0, say: 'a b', broll: [], screen: [], aroll: { frame: null, from: 'auto' } }, { seg: 1, say: 'c', lock: true, broll: [], screen: [] }] };
  const r = T.acceptCells(sheet, [{ seg: 0, type: 'aroll', frame: 'can', by: 'luat' }, { seg: 1, type: 'transition', v: 'cut', by: 'luat' }]);
  assert.equal(r.added, 1); assert.equal(r.sheet.rows[0].aroll.frame, 'can'); assert.equal(r.sheet.rows[1].transition, undefined);
  assert.equal(sheet.rows[0].aroll.frame, null); // hàm thuần
  const fresh = [{ seg: 0, say: 'a b', aroll: { frame: null, from: 'auto' }, broll: [], sfx: [], screen: [] }, { seg: 1, say: 'khác', broll: [], sfx: [], screen: [] }];
  const kept = B.mergeSheet(fresh, { rows: [{ ...r.sheet.rows[0], transition: { v: 'fade', from: 'claude', by: 'luat' }, focus: { on: 'product', from: 'claude' } }, { seg: 1, say: 'c', transition: { v: 'cut', from: 'claude', by: 'luat' } }] });
  assert.equal(kept[0].focus, undefined); // ô claude không `by` (Dựng lại ô trống của M194): dựng lại thì bỏ như trước
  assert.equal(kept[0].aroll.frame, 'can'); assert.equal(kept[0].transition.v, 'fade'); assert.equal(kept[1].transition, undefined);
});
