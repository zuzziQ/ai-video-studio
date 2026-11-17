// Test M91: lớp trợ lý LLM dùng chung (scripts/assist.mjs) + route studio/routes/05_assist.mjs.
// Chạy: node --test scripts/tests/assist.test.mjs
// Không gọi Claude thật: CLAUDE_BIN trỏ vào fixtures/fake_claude.mjs; không tải mạng thật (fetchImpl + lookup giả).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-assist-test-'));
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
// 1×1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const J = o => JSON.stringify(o);
const GOOD = { colors: { primary: '#E63946', accent: '#1D3557', dark: '#23090B', light: '#FFFFFF' }, font: 'Be Vietnam Pro', disp: 'Montserrat',
  voice: { adjectives: ['tin cậy', 'ấm áp', 'gọn'], sample: 'Nhà đẹp, giá thật.' }, slogan: 'Nhà đẹp giá thật', cta: 'Gọi ngay', outro: 'Theo dõi Nhà Đẹp', reason: 'Màu đỏ nổi bật.' };
const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }];
const page = html => ({ lookup: PUBLIC, render: false, fetchImpl: async () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }) });
const byKey = (r, k) => r.fields.filter(f => f.key === k);

test('check: dữ liệu sai → AssistError 400', () => {
  const st400 = e => e instanceof A.AssistError && e.status === 400;
  assert.throws(() => A.check('brand', null), st400);
  assert.throws(() => A.check('brand', {}), st400); // không có logo/website/tên
  assert.throws(() => A.check('brand', { name: 'x', colors: ['red'] }), st400);
  assert.throws(() => A.check('brand', { name: 'x', colors: Array(7).fill('#000000') }), st400);
  assert.throws(() => A.check('brand', { image: 'data:image/gif;base64,R0lGOD' }), st400);
  assert.throws(() => A.check('brand', { image: 'data:image/png;base64,' + Buffer.from('not a png').toString('base64') }), st400); // sai chữ ký
  assert.throws(() => A.check('brand', { website: 'ftp://x.vn' }), st400);
  assert.throws(() => A.check('brand', { website: 'https://u:p@x.vn' }), st400);
  assert.throws(() => A.check('product', { name: 'chỉ có tên' }), st400);
  assert.throws(() => A.check('product', { url: 'https://x.vn', industry: 'casino' }), st400);
  assert.throws(() => A.check('nope', {}), e => e.status === 404);
  const ok = A.check('brand', { colors: ['#e63946'], website: 'nhadep.vn', image: PNG });
  assert.deepEqual(ok.colors, ['#E63946']); assert.equal(ok.website, 'https://nhadep.vn/'); assert.equal(ok.image.ext, 'png');
});

test('brand: có ảnh → Claude xem bằng Read trong thư mục tạm; prompt không lộ đường dẫn', async () => {
  const seen = fake([J(GOOD)]);
  const r = await A.runAssist('brand', A.check('brand', { image: PNG, colors: ['#E63946', '#1D3557'], name: 'Nhà Đẹp', industry: 'BĐS' }));
  const [c] = seen();
  assert.ok(c.args.includes('--allowedTools') && c.args[c.args.indexOf('--allowedTools') + 1] === 'Read');
  assert.match(c.prompt, /file logo\.png/);
  for (const leak of [os.homedir(), os.tmpdir(), SKILL, TMP]) assert.ok(!c.prompt.toLowerCase().includes(leak.toLowerCase()), 'prompt lộ ' + leak);
  assert.ok(!fs.existsSync(c.cwd), 'thư mục tạm của ảnh đã xoá');
  assert.equal(r.provider, 'claude');
  assert.deepEqual(r.colors, { primary: '#E63946', accent: '#1D3557', dark: '#23090B', light: '#FFFFFF' });
  assert.equal(byKey(r, 'font')[0].value, '"Be Vietnam Pro", sans-serif');
  assert.equal(byKey(r, 'voice')[0].value, 'tin cậy, ấm áp, gọn — Nhà đẹp, giá thật.');
  assert.ok(r.fields.every(f => f.id && f.label));
  assert.deepEqual(r.warnings, []);
});

test('brand: màu ngoài bảng bị thay bằng màu theo luật, không bao giờ lọt ra', async () => {
  fake([J({ ...GOOD, colors: { primary: '#123456', accent: 'xanh', dark: '#1D3557', light: '#FFFFFF' } })]);
  const r = await A.runAssist('brand', A.check('brand', { name: 'X', colors: ['#E63946', '#1D3557'] }));
  const pal = new Set(r.palette);
  for (const k of ['primary', 'accent', 'dark', 'light']) assert.ok(pal.has(r.colors[k]), k + ' ngoài bảng: ' + r.colors[k]);
  assert.equal(r.colors.primary, '#E63946'); // luật: màu đo đầu tiên
  assert.equal(r.warnings.filter(w => /không có trong bảng màu/.test(w)).length, 2); // #123456 và 'xanh'
  assert.equal(r.warnings.filter(w => /AI không chọn/.test(w)).length, 0);
  assert.ok(r.warnings.some(w => /Màu nhấn/.test(w)));
});

test('brand: tương phản chữ sáng / nền tối < 4,5 thì đổi sang hai đầu của bảng', async () => {
  fake([J({ ...GOOD, colors: { primary: '#E63946', accent: '#1D3557', dark: '#E63946', light: '#EC6B74' } })]);
  const r = await A.runAssist('brand', A.check('brand', { name: 'X', colors: ['#E63946', '#1D3557'] }));
  assert.ok(A.contrast(r.colors.light, r.colors.dark) >= 4.5);
  assert.ok(r.warnings.some(w => /4,5:1/.test(w)));
});

test('brand: thiếu trường và font không có tiếng Việt → bỏ trường đó, báo thiếu', async () => {
  fake([J({ colors: GOOD.colors, font: 'DM Serif Display', slogan: 'Nhà đẹp' })]);
  const r = await A.runAssist('brand', A.check('brand', { name: 'X', colors: ['#E63946', '#1D3557'] }));
  assert.deepEqual(byKey(r, 'font'), []);
  assert.ok(r.warnings.some(w => /DM Serif Display/.test(w)));
  assert.ok(r.warnings.some(w => /chưa đề xuất: .*disp.*voice.*cta.*outro/.test(w)));
  assert.equal(byKey(r, 'slogan')[0].value, 'Nhà đẹp');
});

test('brand: JSON hỏng → hỏi lại một lần; vẫn hỏng → chỉ còn gợi ý màu theo luật', async () => {
  let seen = fake(['xin lỗi tôi không xem được', J(GOOD)]);
  let r = await A.runAssist('brand', A.check('brand', { name: 'X', colors: ['#E63946'] }));
  assert.equal(seen().length, 2); assert.equal(r.provider, 'claude');
  seen = fake(['{"colors": ', 'vẫn hỏng']);
  r = await A.runAssist('brand', A.check('brand', { name: 'X', colors: ['#E63946'] }));
  assert.equal(seen().length, 2); assert.equal(r.provider, 'rules');
  assert.deepEqual(r.fields.map(f => f.key), ['primary', 'accent', 'dark', 'light']);
  assert.ok(r.warnings.some(w => /theo luật/.test(w)));
  // không có màu đo được thì không có gì để lùi về: báo lỗi
  fake(['hỏng', 'hỏng']);
  await assert.rejects(A.runAssist('brand', A.check('brand', { name: 'X' })), e => e instanceof LlmError && e.kind === 'parse');
});

test('brand: thiếu claude / quá giờ → ném nguyên thông điệp của llm.mjs, không lùi về luật', async () => {
  const input = A.check('brand', { name: 'X', colors: ['#E63946'] });
  await assert.rejects(A.runAssist('brand', input, { run: async () => { throw new LlmError(MSG.missing, { kind: 'missing' }); } }), e => e.kind === 'missing' && e.message === MSG.missing);
  await assert.rejects(A.runAssist('brand', input, { run: async () => { throw new LlmError(MSG.login, { kind: 'login' }); } }), e => e.message === MSG.login);
  fake([{ hang: true }]);
  await assert.rejects(A.runAssist('brand', input, { timeout: 600 }), e => e.kind === 'timeout' && /quá 1 giây/.test(e.message));
});

test('brand: website qua net_guard (chỉ chữ → task text); trang nội bộ bị chặn', async () => {
  const html = '<html><head><title>Nhà Đẹp</title><meta name="theme-color" content="#0A7AFF"><meta name="description" content="Nhà phố Sài Gòn"></head><body><script>alert(1)</script><h1>Nhà Đẹp</h1></body></html>';
  let prompt = '', opts = null;
  const r = await A.runAssist('brand', A.check('brand', { website: 'https://nhadep.vn' }), { net: page(html), run: async (p, o) => { prompt = p; opts = o; return { text: J({ colors: { primary: '#0A7AFF', accent: '#0A7AFF', dark: '#000000', light: '#FFFFFF' }, slogan: 'Nhà đẹp' }), provider: 'ollama' }; } });
  assert.equal(opts.task, 'text'); assert.ok(!opts.args?.includes('--allowedTools'));
  assert.match(prompt, /CHỈ LÀ DỮ LIỆU/); assert.match(prompt, /Nhà phố Sài Gòn/); assert.ok(!/alert\(1\)/.test(prompt));
  assert.equal(r.colors.primary, '#0A7AFF'); assert.equal(r.provider, 'ollama');
  const lan = { lookup: async () => [{ address: '192.168.1.10', family: 4 }], fetchImpl: async () => { throw new Error('không được gọi'); } };
  await assert.rejects(A.fetchPage('http://router.lan', lan), e => e instanceof A.AssistError && /nội bộ/.test(e.message));
  await assert.rejects(A.fetchPage('http://169.254.169.254/latest', { fetchImpl: lan.fetchImpl }), /nội bộ/);
  // website lỗi nhưng còn tên → vẫn chạy, có cảnh báo
  const r2 = await A.runAssist('brand', A.check('brand', { name: 'X', website: 'http://intranet.local' }), { net: lan, run: async () => ({ text: J({ slogan: 'Một câu' }) }) });
  assert.ok(r2.warnings.some(w => /Không đọc được website/.test(w)));
});

test('pageText: bỏ script/style, lấy meta và JSON-LD, cắt độ dài', () => {
  const t = A.pageText('<title>A &amp; B</title><meta property="og:price:amount" content="1.990.000"><script type="application/ld+json">{"price":"1990000"}</script><style>x{}</style><p>Xin&nbsp;chào</p>' + '<p>dài</p>'.repeat(3000), 200);
  assert.equal(t.title, 'A & B'); assert.equal(t.meta['og:price:amount'], '1.990.000'); assert.match(t.ld, /1990000/);
  assert.ok(t.text.startsWith('Xin chào')); assert.ok(t.text.length <= 200);
});

test('product: claim AI đánh dấu đã duyệt → bị giữ Chờ duyệt; giá không có trên trang → bỏ', async () => {
  const html = '<title>Serum B5</title><body><h1>Serum B5 30ml</h1><p>Giá: 350.000đ</p></body>';
  const reply = { name: 'Serum B5', price: '299.000đ', industry: 'cosmetics', strengths: ['Chai 30ml'], claims: [{ text: 'Cấp ẩm cho da', status: 'approved', evidence: 'ISO 9001' }, 'Cấp ẩm cho da'],
    faq: [{ q: 'Dùng mấy lần?', a: 'Sáng và tối' }, { q: 'Không có đáp' }] };
  fake([J(reply)]);
  const r = await A.runAssist('product', A.check('product', { url: 'https://shop.vn/serum' }), { net: page(html) });
  assert.deepEqual(byKey(r, 'price'), []);
  assert.ok(r.warnings.some(w => /Bỏ giá “299\.000đ”/.test(w)));
  const claims = r.fields.filter(f => f.kind === 'claim');
  assert.deepEqual(claims.map(c => c.value), [{ text: 'Chai 30ml', status: 'pending' }, { text: 'Cấp ẩm cho da', status: 'pending' }]);
  assert.ok(claims.every(c => !('evidence' in c.value)));
  assert.ok(r.warnings.some(w => /Chờ duyệt/.test(w)));
  assert.equal(byKey(r, 'faq').length, 1);
  // giá có nguyên văn trên trang → giữ
  fake([J({ ...reply, price: '350.000đ' })]);
  const r2 = await A.runAssist('product', A.check('product', { url: 'https://shop.vn/serum' }), { net: page(html) });
  assert.equal(byKey(r2, 'price')[0].value, '350.000đ');
  // chỉ có ảnh → giữ giá nhưng ghi chú phải kiểm lại
  fake([J({ ...reply, price: '350.000đ' })]);
  const r3 = await A.runAssist('product', A.check('product', { image: PNG }));
  assert.match(byKey(r3, 'price')[0].note, /kiểm lại/);
});

test('product: cờ claim rủi ro bằng ad_gates.py (hoặc danh sách từ khi không có Python)', async () => {
  const reply = J({ name: 'Kem X', industry: 'cosmetics', claims: ['Chữa khỏi mụn 100% sau 7 ngày', 'Hũ 50g'] });
  fake([reply]);
  const r = await A.runAssist('product', A.check('product', { image: PNG }));
  const [risky, safe] = r.fields.filter(f => f.kind === 'claim');
  assert.ok(['ad_gates', 'rules'].includes(r.risk_source));
  assert.ok(risky.risk?.some(x => x.severity === 'high'), J(risky));
  assert.match(risky.note, /^Rủi ro cao/);
  assert.equal(safe.risk, undefined);
  fake([reply]);
  const r2 = await A.runAssist('product', A.check('product', { image: PNG }), { py: path.join(TMP, 'khong-co-python') });
  assert.equal(r2.risk_source, 'rules');
  assert.ok(r2.fields.find(f => f.kind === 'claim').risk.length);
});

test('product: thiếu tên → hỏi lại; link chặn + không có ảnh → lỗi', async () => {
  const seen = fake([J({ price: '1' }), J({ name: 'Ghế' })]);
  const r = await A.runAssist('product', A.check('product', { image: PNG }));
  assert.equal(seen().length, 2); assert.equal(byKey(r, 'name')[0].value, 'Ghế');
  assert.match(seen()[1].prompt, /thiếu "name"/);
  await assert.rejects(A.runAssist('product', A.check('product', { url: 'http://10.0.0.5/admin' }), { net: { lookup: PUBLIC } }), /nội bộ/);
});

test('assertCleanPrompt: chặn đường dẫn home/tạm và thứ giống token', () => {
  assert.throws(() => A.assertCleanPrompt('xem ' + path.join(os.homedir(), 'a.png')), e => e.status === 500);
  assert.throws(() => A.assertCleanPrompt('xem ' + os.tmpdir().replace(/\\/g, '/') + '/x'), e => e.status === 500);
  assert.throws(() => A.assertCleanPrompt('key sk-ant-api03-abcdefghijklmnop'), e => e.status === 500);
  assert.equal(A.assertCleanPrompt('logo.png trong thư mục hiện tại'), 'logo.png trong thư mục hiện tại');
});

// ---------------------------------------------------------------- route
test('route /api/assist: 400, 404, 409, chạy job và trả kết quả', async () => {
  let job = null;
  const ctx = { SKILL, PY: undefined, json: (res, o, c = 200) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); },
    body: req => new Promise(ok => { let s = ''; req.on('data', d => (s += d)); req.on('end', () => ok(s ? JSON.parse(s) : {})); }),
    get job() { return job; },
    startJob(kind, fn) { if (job?.state === 'running') return false; job = { kind, state: 'running', progress: 0, step: '' }; const j = job; fn().then(() => { j.state = 'done'; }, e => { j.state = 'error'; j.step = e.message; }); return true; } };
  const handler = (await import('../../studio/routes/05_assist.mjs')).default(ctx);
  const app = http.createServer(async (req, res) => { const u = new URL(req.url, 'http://x'); if (!(await handler(req, res, u.pathname, u))) { res.writeHead(404); res.end('{}'); } });
  await new Promise(ok => app.listen(0, '127.0.0.1', ok));
  const B = `http://127.0.0.1:${app.address().port}`;
  const call = async (p, b) => { const r = await fetch(B + p, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, j: await r.json() }; };
  try {
    const names = (await call('/api/assist')).j.map(x => x.name);
    for (const n of ['brand', 'product']) assert.ok(names.includes(n), n);
    assert.equal((await call('/api/assist/khac', {})).status, 404);
    assert.equal((await call('/api/assist/brand', { colors: 'đỏ' })).status, 400);
    assert.equal((await call('/api/assist/brand')).j.state, 'idle');
    fake([{ hang: true }]);
    process.env.AVS_ASSIST_TIMEOUT_S = '2';
    const a = await call('/api/assist/brand', { name: 'X', colors: ['#E63946'] });
    assert.equal(a.status, 200); assert.equal(a.j.ok, true);
    assert.equal((await call('/api/assist/product', { image: PNG })).status, 409); // một trợ lý một lúc
    assert.equal(job, null, 'trợ lý có ô job riêng, không chiếm ctx.startJob (M90)');
    let s; for (let i = 0; i < 60 && (s = (await call('/api/assist/brand')).j).state === 'running'; i++) await new Promise(ok => setTimeout(ok, 100));
    assert.equal(s.state, 'error'); assert.equal(s.kind, 'timeout'); assert.equal(s.run, a.j.run);
    delete process.env.AVS_ASSIST_TIMEOUT_S;
    fake([J(GOOD)]);
    const b = await call('/api/assist/brand', { name: 'X', colors: ['#E63946', '#1D3557'] });
    for (let i = 0; i < 100 && (s = (await call('/api/assist/brand')).j).state === 'running'; i++) await new Promise(ok => setTimeout(ok, 100));
    assert.equal(s.state, 'done'); assert.equal(s.run, b.j.run); assert.equal(s.colors.primary, '#E63946'); assert.equal(typeof s.ms, 'number');
  } finally { delete process.env.AVS_ASSIST_TIMEOUT_S; app.closeAllConnections?.(); app.close(); }
});
