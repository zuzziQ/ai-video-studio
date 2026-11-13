// Kịch bản có claim gate (ROADMAP M22): scripts/script_gate.mjs với LLM giả lập + ad_gates.py thật.
// run: node --test scripts/tests/script_gate.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-sgate-'));
process.env.AVS_HOME = TMP; // trước khi nạp module: products.mjs và ad_gates.py đọc $AVS_HOME/products
const { gatedScript, checkScript, scriptBeats, templateScript, validateScript, claimRules } = await import('../script_gate.mjs');
const { saveProduct } = await import('../products.mjs');
const { LlmError } = await import('../llm.mjs');
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const APPROVED = 'Đầu nhỏ giọt giúp kiểm soát lượng dùng';
const P = saveProduct({ name: 'Serum B5', industry: 'cosmetics', blocked: ['tên đối thủ'],
  claims: [
    { text: APPROVED, status: 'approved', evidence: 'Thử nghiệm nội bộ 2026' },
    { text: 'Chai thuỷ tinh tái chế được', status: 'approved', evidence: 'Chứng nhận nhà cung cấp' },
    { text: 'Trị dứt điểm mụn sau một tuần', status: 'prohibited' },
    { text: 'Giúp da căng bóng sau 3 ngày', status: 'pending' },
  ], faq: [{ q: 'Dùng mấy lần?', a: 'Sáng và tối' }] });
const ADS = { on: true, product: P.id };

const script = (beats, extra = {}) => ({ title: 'Serum B5', caption: 'Serum B5 cho mùa khô', hashtags: ['serum'], mood: 'tech',
  hook: { say: 'Bạn dùng serum có hay bị đổ quá tay?', screen: 'ĐỔ QUÁ TAY?' },
  beats: beats.map(say => ({ say, screen: 'Serum B5', sub: '', visual: 'words', emoji: '💧' })),
  cta: { say: 'Theo dõi để xem thêm nhé.', screen: 'FOLLOW', button: 'FOLLOW' }, ...extra });
const GOOD = script([APPROVED + '.', 'Chai thuỷ tinh tái chế được.']);
const BAD = script(['Serum này trị dứt điểm mụn sau một tuần.', 'Cam kết hiệu quả 100%.']);
// LLM giả: trả lần lượt các câu trả lời, ghi lại prompt đã nhận
const fake = answers => { const prompts = []; let i = 0;
  const run = async p => { prompts.push(p); const a = answers[Math.min(i++, answers.length - 1)]; if (a instanceof Error) throw a; return { text: typeof a === 'string' ? a : JSON.stringify(a), provider: 'claude' }; };
  return { run, prompts }; };

test('scriptBeats: lời đọc và chữ trên màn hình, kèm ref', () => {
  const b = scriptBeats(script(['Một.'], { beats: [{ say: 'Một.', screen: 'A', items: ['x', 'y'] }] }));
  assert.deepEqual(b.map(x => x.ref), ['hook.say', 'hook.screen', 'beats[0].say', 'beats[0].screen', 'cta.say', 'cta.screen', 'title', 'caption']);
  assert.equal(b.find(x => x.ref === 'beats[0].screen').text, 'A · x · y');
  assert.throws(() => validateScript({ hook: { say: 'a' }, beats: [] }), /beats/);
});

test('checkScript: claim cấm, cụm từ cấm, chính sách bị chặn; claim đã duyệt qua', () => {
  const bad = checkScript(BAD, ADS);
  assert.equal(bad.blocked, true);
  const refs = bad.issues.filter(i => i.severity === 'high').map(i => i.ref);
  assert.ok(refs.includes('beats[0].say') && refs.includes('beats[1].say'));
  const ok = checkScript(GOOD, ADS);
  assert.equal(ok.blocked, false, JSON.stringify(ok.issues));
  assert.deepEqual(ok.approved.map(c => c.text), [APPROVED, 'Chai thuỷ tinh tái chế được']);
  assert.equal(checkScript(script(['Hơn hẳn tên đối thủ.']), ADS).blocked, true);
});

test('lần đầu đạt: dùng kịch bản LLM, prompt có luật claim của hồ sơ', async () => {
  const f = fake([GOOD]);
  const r = await gatedScript({ prompt: 'VIẾT', topic: 'serum', ads: ADS, run: f.run });
  assert.equal(r.gate.mode, 'llm');
  assert.equal(r.gate.attempts.length, 1);
  assert.equal(r.script.beats[0].say, APPROVED + '.');
  assert.equal(f.prompts.length, 1);
  assert.ok(f.prompts[0].startsWith('VIẾT'));
  for (const s of [APPROVED, 'Trị dứt điểm mụn sau một tuần', '“tên đối thủ”', 'Dùng mấy lần? → Sáng và tối']) assert.ok(f.prompts[0].includes(s), s);
  assert.ok(!f.prompts[0].includes('căng bóng'), 'claim chờ duyệt không được đưa vào như claim được nói');
});

test('sai lần đầu: sinh lại kèm danh sách lỗi', async () => {
  const f = fake([BAD, GOOD]);
  const steps = [];
  const r = await gatedScript({ prompt: 'VIẾT', ads: ADS, run: f.run, onStep: m => steps.push(m) });
  assert.equal(r.gate.mode, 'llm');
  assert.equal(r.gate.attempts.length, 2);
  assert.equal(r.gate.attempts[0].blocked, true);
  assert.match(f.prompts[1], /BẢN TRƯỚC BỊ MÁY SOÁT CHẶN/);
  assert.match(f.prompts[1], /beats\[0\]\.say/);
  assert.match(steps[1], /viết lại lần 2/);
});

test('vẫn sai: khuôn mẫu chỉ ghép claim đã duyệt', async () => {
  const f = fake([BAD, BAD]);
  const r = await gatedScript({ prompt: 'VIẾT', topic: 'serum', ads: ADS, run: f.run, nBeats: 4 });
  assert.equal(r.gate.mode, 'template');
  assert.equal(f.prompts.length, 2);
  assert.deepEqual(r.script.beats.map(b => b.say), [APPROVED + '.', 'Chai thuỷ tinh tái chế được.']);
  const said = scriptBeats(r.script).map(b => b.text).join(' | ');
  assert.ok(!/mụn|căng bóng|100%|cam kết/i.test(said), said);
  assert.equal(checkScript(r.script, ADS).blocked, false);
  assert.equal(r.script.title, 'Serum B5');
});

test('LLM không trả JSON: tính là một lần sai rồi tới khuôn mẫu; lỗi đăng nhập thì báo luôn', async () => {
  const r = await gatedScript({ prompt: 'VIẾT', ads: ADS, run: fake(['không phải json']).run });
  assert.equal(r.gate.mode, 'template');
  assert.equal(r.gate.attempts[0].issues[0].code, 'LLM-JSON');
  await assert.rejects(gatedScript({ prompt: 'VIẾT', ads: ADS, run: fake([new LlmError('Claude chưa đăng nhập', { kind: 'auth' })]).run }), /đăng nhập/);
});

test('hồ sơ thiếu hoặc id sai: dừng ngay, không gọi LLM', async () => {
  for (const product of ['khong-co', '../config']) {
    const f = fake([GOOD]);
    await assert.rejects(gatedScript({ prompt: 'VIẾT', ads: { on: true, product }, run: f.run }), /hồ sơ sản phẩm/);
    assert.equal(f.prompts.length, 0);
  }
});

test('claim đã duyệt tự dính luật chặn bị bỏ khỏi khuôn mẫu; không có claim nào vẫn ra kịch bản trung tính', async () => {
  const q = saveProduct({ name: 'Kem Y', claims: [{ text: 'An toàn 100% cho da', status: 'approved', evidence: 'x' }, { text: 'Tuýp 50 ml nhỏ gọn', status: 'approved', evidence: 'nhãn' }] });
  const r = await gatedScript({ prompt: 'VIẾT', ads: { on: true, product: q.id }, run: fake([BAD]).run, tries: 1 });
  assert.equal(r.gate.mode, 'template');
  assert.deepEqual(r.script.beats.map(b => b.say), ['Tuýp 50 ml nhỏ gọn.']);
  const t = templateScript({ topic: 'chủ đề', approved: [] });
  assert.equal(checkScript(t, { on: true }).blocked, false);
  assert.match(claimRules({ approved: [], prohibited: [], blocked_phrases: [], product: null }), /Chưa có claim nào được duyệt/);
});

test('--claim-gate không có hồ sơ: chỉ soát chính sách', async () => {
  const f = fake([script(['Cam kết hiệu quả, hết hẳn sau 7 ngày.']), GOOD]);
  const r = await gatedScript({ prompt: 'VIẾT', ads: { on: true }, run: f.run });
  assert.equal(r.gate.mode, 'llm');
  assert.equal(r.gate.attempts.length, 2);
  assert.equal(r.gate.product, null);
});
