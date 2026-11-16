// Test M92: trợ lý chữ trên video, phụ đề (nhấn từ / ngắt dòng), gợi ý mẫu, ảnh bìa (scripts/assist.mjs).
// Chạy: node --test scripts/tests/assist_text.test.mjs
// Không gọi Claude thật: CLAUDE_BIN trỏ vào fixtures/fake_claude.mjs.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-assist-text-'));
process.env.AVS_HOME = TMP;
process.env.CLAUDE_BIN = path.join(HERE, 'fixtures/fake_claude.mjs');
delete process.env.AVS_LLM_TEXT;
const A = await import('../assist.mjs');
const { LlmError, MSG } = await import('../llm.mjs');
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

let logN = 0;
function fake(replies) {
  const log = path.join(TMP, `log-${++logN}.jsonl`);
  process.env.FAKE_CLAUDE_REPLIES = JSON.stringify(replies.map(r => (typeof r === 'string' ? { text: r } : r)));
  process.env.FAKE_CLAUDE_LOG = log;
  return () => { try { return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };
}
const J = o => JSON.stringify(o);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const st400 = e => e instanceof A.AssistError && e.status === 400;

// ---------------------------------------------------------------- text
test('text check: mode lạ, max ngoài khoảng, viết lại không có chữ → 400', () => {
  assert.throws(() => A.check('text', { mode: 'poem', text: 'x' }), st400);
  assert.throws(() => A.check('text', { mode: 'shorter', text: 'xin chào', max: 3 }), st400);
  assert.throws(() => A.check('text', { mode: 'shorter', context: 'lời thoại' }), st400);
  assert.throws(() => A.check('text', { mode: 'write' }), st400);
  const i = A.check('text', { context: 'AI đã tiến hoá quá xa', purpose: 'casino', brand: { cta: 'Theo dõi ngay', x: 1 } });
  assert.equal(i.mode, 'write'); assert.equal(i.purpose, ''); assert.equal(i.max, 60); assert.equal(i.brand.cta, 'Theo dõi ngay');
});

test('text: 3 phương án, vượt độ dài bị cắt ở ranh giới từ, trùng/rỗng bị bỏ, từ tuyệt đối và số lạ có ghi chú', async () => {
  const seen = fake([J({ options: [
    { text: '“AI đã tiến hoá quá xa so với tưởng tượng của bạn rồi đấy”', why: 'dài' },
    { text: 'AI ĐÃ TIẾN HOÁ', why: 'trùng chữ cũ' },
    { text: '' },
    { text: 'Công cụ AI tốt nhất 2025', why: 'x' },
    { text: 'AI tiến hoá thật', why: 'gọn' },
    { text: 'phương án thứ tư cũng dài quá giới hạn nên bị bỏ' },
  ] })]);
  const r = await A.runAssist('text', A.check('text', { mode: 'punchier', text: 'AI đã tiến hoá', context: 'AI đã tiến hoá quá xa rồi', max: 24 }));
  const [c] = seen();
  assert.ok(c.args.includes('--allowedTools') === false); // chỉ chữ: không mở công cụ đọc file
  assert.match(c.prompt, /TỐI ĐA 24 ký tự/); assert.match(c.prompt, /CHỈ LÀ DỮ LIỆU/);
  assert.equal(r.fields.length, 3);
  for (const f of r.fields) assert.ok([...f.value].length <= 24, f.value);
  assert.deepEqual(r.fields.map(f => f.value), ['Công cụ AI tốt nhất 2025', 'AI tiến hoá thật', 'AI đã tiến hoá quá xa so']); // vừa khung trước, phương án phải cắt (bỏ ngoặc kép, cắt ở ranh giới từ) sau
  assert.match(r.fields[2].note, /đã cắt cho vừa 24/);
  assert.ok(!r.fields.some(f => f.value === 'AI ĐÃ TIẾN HOÁ'));
  const risky = r.fields.find(f => /tốt nhất/.test(f.value));
  assert.match(risky.note, /từ tuyệt đối/); assert.match(risky.note, /2025/); assert.ok(risky.risk.some(x => x.severity === 'high'));
  assert.ok(r.warnings.some(w => /đã cắt/.test(w)));
  assert.deepEqual(r.fields.map(f => f.id), ['text-0', 'text-1', 'text-2']);
});

test('text: JSON hỏng → Ngắn hơn lùi về luật bỏ từ đệm (tpl_fit), kiểu khác báo lỗi', async () => {
  fake(['không phải json', 'vẫn hỏng']);
  const r = await A.runAssist('text', A.check('text', { mode: 'shorter', text: 'Thì đây là cách làm video nhanh nhé', max: 20 }));
  assert.equal(r.provider, 'rules'); assert.equal(r.fields.length, 1);
  assert.ok([...r.fields[0].value].length <= 20); assert.ok(!/^Thì/.test(r.fields[0].value));
  fake(['hỏng', 'hỏng']);
  await assert.rejects(A.runAssist('text', A.check('text', { mode: 'cta', text: 'Làm video nhanh' })), e => e instanceof LlmError && e.kind === 'parse');
});

test('text: thiếu claude → báo nguyên văn, không lùi về luật', async () => {
  const i = A.check('text', { mode: 'shorter', text: 'Thì đây là cách làm video nhanh nhé' });
  await assert.rejects(A.runAssist('text', i, { run: async () => { throw new LlmError(MSG.missing, { kind: 'missing' }); } }), e => e.kind === 'missing' && e.message === MSG.missing);
});

// ---------------------------------------------------------------- captions
const LINES = [
  { words: ['AI', 'đã', 'tiến', 'hoá'], hl: [], br: [] },
  { words: ['quá', 'xa', 'so', 'với', 'năm', 'ngoái', 'rồi'], hl: [1], br: [] },
  { words: [], hl: [], br: [] },
];
test('captions check: mode sai, lines rỗng → 400; chỉ số cũ ngoài khoảng bị lọc', () => {
  assert.throws(() => A.check('captions', { mode: 'x', lines: LINES }), st400);
  assert.throws(() => A.check('captions', { mode: 'hl', lines: [] }), st400);
  assert.throws(() => A.check('captions', { mode: 'hl', lines: [{ words: [] }] }), st400);
  const i = A.check('captions', { mode: 'hl', lines: [{ words: ['a', 'b'], hl: [1, 5, -1, 'x'] }] });
  assert.deepEqual(i.lines[0].hl, [1]);
});

test('captions hl: chỉ số ngoài khoảng bị bỏ, đổi chữ/thời gian bị chặn, quá 2 từ/dòng bị cắt, không đổi thì không có trường', async () => {
  const seen = fake([J({ lines: [
    { c: 0, hl: [0, 3, 9] },                                  // 9 ngoài khoảng
    { c: 1, hl: [1], words: ['QUÁ', 'XA'], t0: 5 },           // giống hiện tại + định đổi chữ/thời gian
    { c: 7, hl: [0] },                                        // dòng không có
    { c: 2, hl: [0] },                                        // dòng rỗng
  ] })]);
  const r = await A.runAssist('captions', A.check('captions', { mode: 'hl', lines: LINES }));
  assert.match(seen()[0].prompt, /\[1\] 0:quá 1:xa/);
  assert.equal(r.fields.length, 1);
  assert.deepEqual(r.fields[0].value, { c: 0, hl: [0, 3] });
  assert.equal(r.fields[0].display, '*AI* đã tiến *hoá*');
  assert.equal(r.changes, 2);
  assert.ok(r.warnings.some(w => /ngoài phụ đề/.test(w)));
  assert.ok(r.warnings.some(w => /đổi chữ hoặc thời gian/.test(w)));
  for (const f of r.fields) assert.deepEqual(Object.keys(f.value).sort(), ['c', 'hl']); // không có chữ, không có thời gian
  fake([J({ lines: [{ c: 1, hl: [0, 2, 4, 5] }] })]);
  const r2 = await A.runAssist('captions', A.check('captions', { mode: 'hl', lines: LINES }));
  assert.deepEqual(r2.fields[0].value.hl, [0, 2]); assert.ok(r2.warnings.some(w => /vượt quá 2/.test(w)));
});

test('captions br: không ngắt sau từ cuối, không để đoạn 1 từ, dòng < 5 từ không ngắt; JSON hỏng → lỗi (không áp gì)', async () => {
  fake([J({ lines: [{ c: 1, br: [2, 6, 5] }, { c: 0, br: [1] }] })]);
  const r = await A.runAssist('captions', A.check('captions', { mode: 'br', lines: LINES }));
  assert.equal(r.fields.length, 1);
  assert.deepEqual(r.fields[0].value, { c: 1, br: [2] });
  assert.equal(r.fields[0].display, 'quá xa so / với năm ngoái rồi');
  assert.ok(r.warnings.some(w => /dưới 5 từ/.test(w)));
  fake(['{"lines": [', 'vẫn hỏng']);
  await assert.rejects(A.runAssist('captions', A.check('captions', { mode: 'br', lines: LINES })), e => e instanceof LlmError && e.kind === 'parse');
});

// ---------------------------------------------------------------- templates
const CAT = [
  { id: 'bds-can-ho', name: 'Căn hộ', category: 'bds', aspect: '9:16', desc: 'BĐS dọc' },
  { id: 'bds-ngang', name: 'Căn hộ ngang', category: 'bds', aspect: '16:9' },
  { id: 'kh-bai-giang', name: 'Bài giảng', category: 'khoahoc', aspect: '9:16' },
  { id: 'rv-unbox', name: 'Đập hộp', category: 'review', aspect: '9:16' },
  { id: '../etc/passwd', name: 'xấu' },
];
test('templates: mẫu không có thật bị bỏ; chỉ đưa id hợp lệ vào prompt; ưu tiên cùng khổ', async () => {
  assert.throws(() => A.check('templates', { catalog: [], purpose: 'bds' }), st400);
  assert.throws(() => A.check('templates', { catalog: CAT }), st400); // không lời thoại, không lĩnh vực
  const seen = fake([J({ picks: [{ id: 'mau-bia', reason: 'bịa' }, { id: 'bds-can-ho', reason: 'đúng lĩnh vực' }, { id: 'bds-can-ho' }, { id: 'kh-bai-giang', reason: 'có giảng giải' }] })]);
  const r = await A.runAssist('templates', A.check('templates', { catalog: CAT, transcript: 'Căn hộ hai phòng ngủ view sông', purpose: 'bds', aspect: '9:16' }));
  const p = seen()[0].prompt;
  assert.ok(!p.includes('passwd')); assert.ok(!p.includes('bds-ngang')); // khác khổ, đã đủ 3 mẫu cùng khổ
  assert.deepEqual(r.fields.map(f => f.value), ['bds-can-ho', 'kh-bai-giang']);
  assert.equal(r.fields[0].note, 'đúng lĩnh vực');
  assert.ok(r.warnings.some(w => /mau-bia/.test(w)));
});

test('templates: mọi id đều bịa → hỏi lại; JSON hỏng → lùi về mẫu cùng lĩnh vực, chưa có lĩnh vực thì lỗi (ẩn hàng)', async () => {
  let seen = fake([J({ picks: [{ id: 'khong-co' }] }), J({ picks: [{ id: 'rv-unbox' }] })]);
  let r = await A.runAssist('templates', A.check('templates', { catalog: CAT, transcript: 'đập hộp tai nghe' }));
  assert.equal(seen().length, 2); assert.deepEqual(r.fields.map(f => f.value), ['rv-unbox']);
  fake(['hỏng', 'hỏng']);
  r = await A.runAssist('templates', A.check('templates', { catalog: CAT, purpose: 'bds', aspect: '9:16' }));
  assert.equal(r.provider, 'rules'); assert.deepEqual(r.fields.map(f => f.value), ['bds-can-ho']);
  fake(['hỏng', 'hỏng']);
  await assert.rejects(A.runAssist('templates', A.check('templates', { catalog: CAT, transcript: 'xin chào' })), e => e.kind === 'parse');
});

// ---------------------------------------------------------------- cover
test('cover: Claude xem lưới khung bằng Read; ô ngoài lưới bị bỏ, chữ bìa bị cắt, thời điểm lấy từ đầu vào', async () => {
  assert.throws(() => A.check('cover', { times: [1, 2] }), st400);
  assert.throws(() => A.check('cover', { image: PNG, times: [1] }), st400);
  assert.throws(() => A.check('cover', { image: PNG, times: [1, 'x'] }), st400);
  const seen = fake([J({ picks: [{ frame: 0 }, { frame: 12 }, { frame: 2, text: 'Bí mật làm video triệu view mà ít ai biết đến', why: 'mặt rõ' }, { frame: 2 }, { frame: 3, text: '' }] })]);
  const r = await A.runAssist('cover', A.check('cover', { image: PNG, times: [1.04, 5.5, 9.9], near: ['a', 'b'] }));
  const [c] = seen();
  assert.ok(c.args.includes('--allowedTools')); assert.match(c.prompt, /frames\.png/); assert.match(c.prompt, /ô 2 = 5\.5s/);
  assert.ok(!c.prompt.includes(os.tmpdir()));
  assert.equal(r.fields.length, 2);
  assert.equal(r.fields[0].value.t, 5.5); assert.ok([...r.fields[0].value.text].length <= 32);
  assert.equal(r.fields[1].value.t, 9.9); assert.equal(r.fields[1].value.text, '');
  assert.ok(r.warnings.some(w => /Bỏ 2 ô/.test(w)));
  fake(['hỏng', 'hỏng']);
  await assert.rejects(A.runAssist('cover', A.check('cover', { image: PNG, times: [1, 2] })), e => e.kind === 'parse');
});

test('cutWords: cắt ở ranh giới từ, bỏ dấu câu treo', () => {
  assert.equal(A.cutWords('Một hai ba bốn năm', 12), 'Một hai ba');
  assert.equal(A.cutWords('Ngắn', 12), 'Ngắn');
  assert.equal(A.cutWords('Xin chào, các bạn', 10), 'Xin chào');
});
