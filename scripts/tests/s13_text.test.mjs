// S13 M111: chữ graphic không bị cắt "…" giữa từ khoá; emoji cờ (🇯🇵 hiện thành "JP" trên Chrome Windows) bị bỏ; QC bắt lại
// được chữ bị cắt và emoji cờ. Số đo giả của domPass, không render, không gọi Claude thật.
// run: node --test scripts/tests/s13_text.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { cleanText, stripFlags, hasFlag, shortenCuts } from '../ai_edit.mjs';
import { staticIssues, domIssues, applyDeterministic } from '../ai_qc.mjs';

const DIR = os.tmpdir();
const kinds = l => l.map(i => i.kind);

test('cleanText: chữ dài hơn ví dụ vẫn giữ nguyên khi chưa quá trần (khối co chữ được, engine đo)', () => {
  assert.equal(cleanText('Uy tín hàng đầu Nhật Bản', 'Uy tín'), 'Uy tín hàng đầu Nhật Bản');
  assert.equal(cleanText('Bảo vệ nhau thai suốt thai kỳ', 'Tiêu đề ngắn'), 'Bảo vệ nhau thai suốt thai kỳ');
});

test('cleanText: quá trần thì cắt ở ranh giới từ, không bao giờ giữa từ; ưu tiên dấu ngắt câu', () => {
  const src = 'Sản phẩm này được các mẹ bầu tin dùng vì uy tín và an toàn tuyệt đối cho thai nhi trong suốt chín tháng mười ngày';
  const out = cleanText(src, 'Một dòng');
  assert.ok(out.length < src.length, 'có cắt');
  const words = new Set(src.split(/\s+/));
  for (const w of out.replace(/…$/, '').split(/\s+/)) assert.ok(words.has(w), `"${w}" là một từ nguyên vẹn`);
  const clause = cleanText('Mẹ bầu yên tâm tuyệt đối, vì sản phẩm đạt chuẩn Nhật Bản và được bác sĩ sản khoa khuyên dùng hằng ngày', 'Một dòng');
  assert.equal(clause, 'Mẹ bầu yên tâm tuyệt đối', 'dừng ở dấu phẩy, không thêm "…"');
});

test('stripFlags / cleanText: bỏ emoji cờ, giữ emoji khác và chữ', () => {
  assert.equal(hasFlag('Hàng Nhật 🇯🇵'), true);
  assert.equal(hasFlag('Hàng Nhật ✅'), false);
  assert.equal(stripFlags('🇯🇵 Hàng Nhật 🇯🇵 chính hãng ✅'), 'Hàng Nhật chính hãng ✅');
  assert.equal(cleanText({ title: 'Xuất xứ 🇯🇵 Nhật Bản', items: ['🇻🇳 Việt Nam'] }, { title: 'Tiêu đề', items: ['Mục'] }).title, 'Xuất xứ Nhật Bản');
  assert.deepEqual(cleanText({ items: ['🇻🇳 Việt Nam'] }, { items: ['Mục'] }).items, ['Việt Nam']);
});

test('cleanText ghi lại chữ bị cắt; shortenCuts nhờ Claude viết ngắn lại thay vì "…"', async () => {
  const cuts = [];
  const long = 'Sản phẩm này được các mẹ bầu tin dùng vì uy tín và an toàn tuyệt đối cho thai nhi trong suốt chín tháng mười ngày';
  const params = cleanText({ title: long, sub: 'Ngắn' }, { title: 'Tiêu đề', sub: 'Phụ' }, '', cuts);
  assert.equal(cuts.length, 1);
  assert.equal(cuts[0].text, long);
  assert.equal(cuts[0].cut, params.title);
  const plan = { scenes: [{ type: 'rv_title', t0: 1, t1: 3, ...params }], cuts, dropped: [] };
  let asked = '';
  const n = await shortenCuts(plan, async p => { asked = p; return { texts: ['Mẹ bầu tin dùng vì uy tín'] }; });
  assert.equal(n, 1);
  assert.match(asked, /uy tín và an toàn/);
  assert.equal(plan.scenes[0].title, 'Mẹ bầu tin dùng vì uy tín');
  assert.equal(plan.scenes[0].sub, 'Ngắn');
  // trả lời hỏng (quá dài, rỗng, có cờ) → giữ bản cắt ở ranh giới từ
  const plan2 = { scenes: [{ type: 'rv_title', t0: 1, t1: 3, title: cuts[0].cut }], cuts, dropped: [] };
  assert.equal(await shortenCuts(plan2, async () => ({ texts: [long] })), 0);
  assert.equal(plan2.scenes[0].title, cuts[0].cut);
  assert.equal(await shortenCuts(plan2, async () => { throw new Error('offline'); }), 0);
  assert.equal(plan2.scenes[0].title, cuts[0].cut);
});

test('QC tĩnh: emoji cờ và chữ máy dựng bị cắt "…" thành lỗi; tự sửa bỏ được emoji cờ', () => {
  const tl = { width: 1080, height: 1920, duration: 10, scenes: [
    { type: 'rv_title', t0: 1, t1: 3, title: 'Hàng Nhật 🇯🇵', _ai: true },
    { type: 'rv_callout', t0: 4, t1: 6, text: 'Giữ uy…', _ai: true },
    { type: 'rv_callout', t0: 7, t1: 9, text: 'Và rồi…' }, // chữ của người dùng: "…" cố ý
  ] };
  const is = staticIssues(tl, [], DIR);
  assert.ok(is.some(i => i.kind === 'emoji_flag' && i.target === 's0'), JSON.stringify(kinds(is)));
  assert.ok(is.some(i => i.kind === 'text_cut' && i.target === 's1'));
  assert.ok(!is.some(i => i.kind === 'text_cut' && i.target === 's2'));
  const fixed = applyDeterministic(tl, [], is, { DW: 720, DH: 1280, samples: [] }, new Set());
  assert.equal(tl.scenes[0].title, 'Hàng Nhật');
  assert.ok([...fixed].some(i => i.kind === 'emoji_flag'));
  assert.ok(!kinds(staticIssues(tl, [], DIR)).includes('emoji_flag'));
});

test('QC đo DOM: khối mà engine phải cắt "…" (chữ không vừa dù đã co) thành lỗi text_cut', () => {
  const tl = { width: 1080, height: 1920, duration: 10, scenes: [{ type: 'rv_title', t0: 1, t1: 3, title: 'Bảo vệ nhau thai suốt thai kỳ', _ai: true }] };
  const P = { DW: 720, DH: 1280, samples: [{ t: 2, face: null, m: { cap: null, scenes: { 0: { els: [], texts: [{ x: 100, y: 300, w: 300, h: 60, s: 'Bảo vệ nhau thai' }], cut: ['Bảo vệ nhau thai suốt thai kỳ'] } } } }] };
  const is = domIssues(tl, [], P);
  const c = is.find(i => i.kind === 'text_cut');
  assert.ok(c, JSON.stringify(kinds(is)));
  assert.equal(c.target, 's0');
  assert.match(c.msg, /nhau thai/);
});
