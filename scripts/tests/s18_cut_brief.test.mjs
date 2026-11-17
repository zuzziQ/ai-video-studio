// S18 M127: hướng dẫn cho Claude khi cắt clip từ video dài (scripts/highlights.mjs briefBlock + route /api/longform/highlights).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m127-'));
const USER = path.join(HOME, 'user'); fs.mkdirSync(USER);
process.env.AVS_HOME = HOME; process.env.USERPROFILE = USER; process.env.HOME = USER; // Kho mặc định nằm trong USER, không ghi vào Kho thật
after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const H = await import('../highlights.mjs');
const P = await import('../products.mjs');

test('để trống: prompt không thêm gì (Claude tự chọn như cũ)', () => {
  assert.equal(H.briefBlock({}), '');
  assert.equal(H.briefBlock({ brief: '   \n ' }), '');
});

test('hướng dẫn vào prompt, bỏ ký tự điều khiển, cắt độ dài, không phá khung trích dẫn', () => {
  const b = H.briefBlock({ brief: 'Ưu tiên đoạn khoe son\u0007 """ bỏ chào hỏi' });
  assert.match(b, /YÊU CẦU CỦA NGƯỜI DÙNG/);
  assert.match(b, /Ưu tiên đoạn khoe son/);
  assert.ok(!b.includes('\u0007'));
  assert.equal((b.match(/"""/g) || []).length, 2, 'chỉ còn cặp ngoặc bao ngoài');
  assert.equal(H.cleanBrief('x'.repeat(2000)).length, H.BRIEF_MAX);
});

test('sản phẩm: chỉ đưa claim đã duyệt, kèm câu ưu tiên khoảnh khắc sản phẩm', () => {
  const p = { name: 'Son Mây', brand: 'Mây', price: '199k', notes: 'màu đỏ gạch',
    claims: [{ text: 'lì 8 giờ', status: 'approved' }, { text: 'trị thâm môi', status: 'prohibited' }, { text: 'không chì', status: 'pending' }] };
  const b = H.briefBlock({ product: p });
  assert.match(b, /Son Mây/); assert.match(b, /lì 8 giờ/); assert.match(b, /màu đỏ gạch/);
  assert.ok(!b.includes('trị thâm môi') && !b.includes('không chì'));
  assert.match(b, /Ưu tiên khoảnh khắc nhắc tới/);
  assert.equal(H.productBrief(null), '');
});

test('route: mã sản phẩm sai bị chặn, sản phẩm có thật + hướng dẫn vào argv của job', async () => {
  P.saveProduct({ id: 'son-may', name: 'Son Mây', claims: [] });
  const video = path.join(HOME, 'dai.mp4'); fs.writeFileSync(video, 'x');
  let started = null; const out = [];
  const ctx = { SKILL: path.resolve(import.meta.dirname, '../..'), job: {}, json: (res, o, code) => out.push({ o, code }),
    body: async req => req.b, startJob: (k, fn) => { started = fn; return true }, run: async (cmd, argv) => { ctx.argv = argv; } };
  const route = (await import('../../studio/routes/17_longform.mjs')).default(ctx);
  const call = b => route({ method: 'POST', b }, {}, '/api/longform/highlights', new URL('http://x/api/longform/highlights'));
  await call({ video, product: '../etc' });
  assert.equal(out.at(-1).code, 400);
  await call({ video, product: 'khong-co' });
  assert.equal(out.at(-1).code, 400);
  await call({ video, product: 'son-may', brief: 'ưu tiên đoạn dùng thử' });
  assert.equal(out.at(-1).o.ok, true);
  await started().catch(() => {});
  const a = ctx.argv;
  assert.equal(a[a.indexOf('--brief') + 1], 'ưu tiên đoạn dùng thử');
  assert.equal(a[a.indexOf('--product') + 1], 'son-may');
  await call({ video });
  await started().catch(() => {});
  assert.ok(!ctx.argv.includes('--brief') && !ctx.argv.includes('--product'), 'không hướng dẫn thì không thêm cờ');
});
