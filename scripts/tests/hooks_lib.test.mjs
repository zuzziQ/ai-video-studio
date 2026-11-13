// Test M19: thư viện hook (scripts/hooks_lib.mjs). Chạy: node --test scripts/tests/hooks_lib.test.mjs
// Không gọi LLM thật (ask giả); cổng chính sách + claim chạy scripts/ad_gates.py thật qua CLI (cần python trong PATH).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-hooks-'));
process.env.AVS_HOME = HOME;
const H = await import('../hooks_lib.mjs');
test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const PY = process.platform === 'win32' ? 'python' : 'python3';

test('similarity khớp ad_gates.similarity (unigram + bigram cosine)', () => {
  const pairs = [
    ['Bạn đã biết cách dùng Serum X đúng chưa?', 'Bạn đã biết cách dùng Serum X đúng chưa nhỉ?'],
    ['3 điều nên biết trước khi dùng Serum X', 'Sai lầm phổ biến nhất khi dùng Serum X'],
    ['Giảm 50% hôm nay!', 'giảm 50% HÔM NAY'],
    ['', 'abc'],
  ];
  const code = `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(HERE, '..'))}); import ad_gates as g; print(json.dumps([g.similarity(a, b) for a, b in json.loads(sys.stdin.read())]))`;
  const r = spawnSync(PY, ['-X', 'utf8', '-c', code], { input: JSON.stringify(pairs), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(pairs.map(([a, b]) => H.similarity(a, b)), JSON.parse(r.stdout));
  assert.ok(H.similarity(...pairs[0]) >= H.HOOK_SIM_MAX);
  assert.ok(H.similarity(...pairs[1]) < H.HOOK_SIM_MAX);
});

test('filterHooks: bỏ hook sai độ dài, trượt cổng, trùng kho hoặc trùng nhau trong cùng lô', async () => {
  const gate = async texts => texts.map(t => (/trị dứt điểm/.test(t) ? { ok: false, reasons: ['BLOCK-01'] } : { ok: true }));
  const r = await H.filterHooks([
    'Ngắn quá', '"Một câu hỏi về cách dùng sản phẩm"', 'Sản phẩm trị dứt điểm mụn ngay', 'Xem link https://x.y ngay bây giờ nhé',
    'Một câu hỏi về cách dùng sản phẩm nhé', 'Điều ít ai để ý khi bôi kem buổi tối', 'Bạn đã biết cách dùng Serum X đúng chưa nhỉ?',
  ], ['Bạn đã biết cách dùng Serum X đúng chưa?'], gate);
  assert.deepEqual(r.kept, ['Một câu hỏi về cách dùng sản phẩm', 'Điều ít ai để ý khi bôi kem buổi tối']);
  assert.deepEqual(r.rejected, { 'độ dài': 2, 'chính sách/claim': 1, 'trùng hook đã có': 2 });
});

test('gateHooks chạy ad_gates.py thật: chặn cụm từ rủi ro và cụm từ cấm riêng, cho qua hook trung tính', async () => {
  const v = await H.gateHooks(['Serum X trị dứt điểm mụn trong 3 ngày', 'Câu chuyện nhỏ phía sau chai Serum X', 'Đây là serum giá rẻ nhất Việt Nam'],
    { claims: [{ id: 'c1', text: 'Cấp ẩm cho da khô', status: 'approved' }], blocked: ['giá rẻ nhất'] }, { py: PY });
  assert.equal(v.length, 3);
  assert.equal(v[0].ok, false); assert.match(v[0].reasons.join(' '), /trị dứt điểm/);
  assert.equal(v[1].ok, true);
  assert.equal(v[2].ok, false); assert.match(v[2].reasons.join(' '), /giá rẻ nhất/);
});

test('generateHooks: LLM (giả) → lọc → vào kho; LLM lỗi thì dùng mẫu', async () => {
  const lib = H.loadLib(path.join(HOME, 'x.json'));
  const ctx = { name: 'Serum X', claims: [], blocked: [] };
  let prompt = '';
  const ask = async (p, o) => { prompt = p; assert.equal(o.task, 'text'); return o.validate({ hooks: ['Ba bước dùng Serum X buổi sáng', 'Bạn bôi Serum X trước hay sau kem?', 'Ba bước dùng Serum X buổi sáng nhé', 'ngắn'] }); };
  const r1 = await H.generateHooks(lib, ctx, { n: 5, ask, gate: async t => t.map(() => ({ ok: true })) });
  assert.equal(r1.source, 'llm'); assert.equal(r1.created, 2); assert.match(prompt, /Serum X/);
  const r2 = await H.generateHooks(lib, ctx, { n: 3, ask: async () => { throw new Error('hết lượt'); }, gate: async t => t.map(() => ({ ok: true })) });
  assert.equal(r2.source, 'template'); assert.equal(r2.created, 3); assert.equal(r2.llm_error, 'hết lượt');
  assert.equal(lib.hooks.length, 5);
  // lần sinh sau đưa hook đã có vào prompt và không thêm lại hook gần giống
  await H.generateHooks(lib, ctx, { n: 5, ask, gate: async t => t.map(() => ({ ok: true })) });
  assert.match(prompt, /HOOK ĐÃ CÓ[\s\S]*Ba bước dùng Serum X buổi sáng/);
  assert.equal(lib.hooks.length, 5);
  for (const a of lib.hooks) for (const b of lib.hooks) if (a !== b) assert.ok(H.similarity(a.text, b.text) < H.HOOK_SIM_MAX, `${a.text} ~ ${b.text}`);
});

test('pickHook/markUsed: hook ít dùng nhất, ưu tiên hook thắng, tối đa 5 bản mỗi hook', () => {
  const lib = { hooks: [
    { id: 'a', text: 'A', angle: 'faq', used: [] }, { id: 'b', text: 'B', angle: null, used: [] }, { id: 'c', text: 'C', angle: 'tips', used: [] },
  ] };
  for (let i = 0; i < 5; i++) H.markUsed(lib, 'a', `/p_v${i}`);
  assert.throws(() => H.markUsed(lib, 'a', '/p_v9'), /đủ 5 bản/);
  assert.equal(H.pickHook(lib, { angle: 'faq' }).id, 'b');           // a hết lượt; b không gắn góc nên hợp mọi góc
  assert.equal(H.pickHook(lib, { preferred: ['c'] }).id, 'c');
  H.markUsed(lib, 'b', '/p_v5');
  assert.equal(H.pickHook(lib).id, 'c');                              // c ít dùng nhất
  for (let i = 0; i < 4; i++) H.markUsed(lib, 'b', `/q${i}`);
  for (let i = 0; i < 5; i++) H.markUsed(lib, 'c', `/r${i}`);
  assert.equal(H.pickHook(lib), null);
});

test('kho JSON: lưu nguyên tử dưới AVS_HOME/hooks, đọc lại được; CLI gen --no-llm + pick --use', () => {
  const proj = fs.mkdtempSync(path.join(HOME, 'proj-'));
  fs.writeFileSync(path.join(proj, 'timeline.json'), JSON.stringify({ title: 'Kem Y', ads: { on: true, product: 'Kem Y 50ml', claims: [] }, scenes: [] }));
  const ctx = H.projectContext(proj);
  assert.equal(ctx.key, 'Kem Y 50ml');
  assert.equal(H.libPath(ctx.key), path.join(HOME, 'hooks', 'kem-y-50ml.json'));
  const run = (...a) => spawnSync(process.execPath, [path.join(HERE, '../hooks_lib.mjs'), ...a], { encoding: 'utf8', env: { ...process.env, AVS_HOME: HOME } });
  const g = run('gen', proj, '--no-llm', '--n', '4');
  assert.equal(g.status, 0, g.stderr);
  const lib = H.loadLib(H.libPath(ctx.key));
  assert.equal(lib.hooks.length, 4); assert.ok(lib.updated);
  const p = run('pick', proj, '--use', path.join(proj, '..', 'v1'));
  assert.equal(p.status, 0, p.stderr);
  const picked = JSON.parse(p.stdout);
  assert.equal(H.loadLib(H.libPath(ctx.key)).hooks.find(h => h.id === picked.id).used.length, 1);
  assert.deepEqual(fs.readdirSync(path.join(HOME, 'hooks')).filter(f => f.endsWith('.tmp')), []);
});
