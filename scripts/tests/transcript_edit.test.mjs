// M89: chia lại thời gian khi sửa lời thoại (studio/features/21_transcript.core.js) và từ điển "sai=đúng" (scripts/dict.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fixArg, fixArgs, parseDict, normalizeEntries, dictSources, projectFix, saveProjectDict, loadProjectDict, fixWords, LIMITS } from '../dict.mjs';

const T = createRequire(import.meta.url)('../../studio/features/21_transcript.core.js');
const w = (x, s, e, o = {}) => ({ w: x, s, e, ...o });

test('cùng số từ: giữ thời gian và nhấn mạnh từng từ, chỉ từ đổi chữ có dấu đã sửa', () => {
  const old = [w('tiền', 1, 1.4, { hl: true }), w('hóa', 1.4, 1.9)];
  const out = T.retime(old, ['tiến', 'hóa']);
  assert.deepEqual(out, [w('tiến', 1, 1.4, { hl: true, ed: true }), w('hóa', 1.4, 1.9)]);
});

test('2 từ thành 3 từ: chia trong [s đầu, e cuối] theo độ dài chữ, liền nhau', () => {
  const out = T.retime([w('ai', 2, 2.5), w('video', 2.5, 3.1, { br: true })], ['AI', 'Video', 'Studio']);
  assert.equal(out.length, 3);
  assert.equal(out[0].s, 2); assert.equal(out[2].e, 3.1);
  for (let i = 1; i < 3; i++) assert.equal(out[i].s, out[i - 1].e);
  assert.ok(out[0].e - out[0].s < out[2].e - out[2].s, 'từ ngắn được ít thời gian hơn');
  assert.ok(out.every(x => x.ed));
  assert.equal(out[2].br, true);
});

test('sửa trải hai khối: không từ nào vượt khối của nó', () => {
  const g1 = [w('a', 0, 0.5), w('b', 0.5, 1)], g2 = [w('c', 1.2, 1.6)];
  const out = T.planEdit([g1, g2], ['x', 'y', 'z', 't', 'u']);
  assert.equal(out.flat().length, 5);
  assert.ok(out[0].every(x => x.s >= 0 && x.e <= 1));
  assert.ok(out[1].every(x => x.s >= 1.2 && x.e <= 1.6));
  assert.ok(out[1].length >= 1);
  // cùng tổng số từ: giữ nguyên thời gian
  const same = T.planEdit([g1, g2], ['p', 'q', 'r']);
  assert.deepEqual(same.flat().map(x => [x.s, x.e]), [[0, 0.5], [0.5, 1], [1.2, 1.6]]);
});

test('distribute: đủ n, mỗi khối ≥ 1 khi đủ từ', () => {
  assert.deepEqual(T.distribute([1, 1], 4), [2, 2]);
  const d = T.distribute([3, 0.2, 1], 5);
  assert.equal(d.reduce((a, b) => a + b, 0), 5);
  assert.ok(d.every(x => x >= 1));
  assert.deepEqual(T.distribute([1, 1, 1], 0), [0, 0, 0]);
});

test('findMatches: không phân biệt hoa thường, dấu thanh đặt khác chỗ vẫn khớp; không dấu là tuỳ chọn', () => {
  const words = ['Thuyết', 'tiền', 'hóa,', 'và', 'tiến', 'hoá'];
  assert.deepEqual(T.findMatches(words, 'tiền hoá'), [{ i: 1, n: 2 }]);
  assert.deepEqual(T.findMatches(words, 'TIẾN HÓA'), [{ i: 4, n: 2 }]);
  assert.deepEqual(T.findMatches(words, 'tien hoa', { noAccent: true }), [{ i: 1, n: 2 }, { i: 4, n: 2 }]);
  assert.deepEqual(T.findMatches(words, 'tien hoa'), []);
  assert.deepEqual(T.findMatches(words, '  '), []);
});

test('từ điển: dòng hỏng được báo, cặp hợp lệ giữ, cặp sau thắng', () => {
  const { entries, bad } = T.parseDict('tiền hóa = tiến hoá\nkhông có dấu bằng\nly chi → Lychee\nTiền Hóa=tiến hóa');
  assert.deepEqual(entries, [{ from: 'ly chi', to: 'Lychee' }, { from: 'Tiền Hóa', to: 'tiến hóa' }]);
  assert.deepEqual(bad, ['không có dấu bằng']);
  assert.equal(T.dictString(entries), 'ly chi=Lychee;Tiền Hóa=tiến hóa');
});

test('dict.mjs: chuỗi --fix an toàn (không chèn tham số, giới hạn độ dài)', () => {
  assert.deepEqual(normalizeEntries([{ from: '--max', to: '9' }, { from: 'a;b', to: 'c' }, { from: 'x\u0000', to: 'y' }, { from: 'a'.repeat(81), to: 'b' }, { from: 'ok', to: 'OK' }]), [{ from: 'ok', to: 'OK' }]);
  assert.deepEqual(fixArgs(''), []);
  assert.deepEqual(fixArgs('a=b'), ['--fix=a=b']);
  const many = Array.from({ length: 600 }, (_, i) => ({ from: `sai${i} ${'x'.repeat(40)}`, to: `đúng${i}` }));
  const s = fixArg(many);
  assert.ok(s.length <= LIMITS.arg);
  assert.ok(s.split(';').every(p => p.split('=').length === 2));
  assert.deepEqual(parseDict('a = b;c→d;e'), [{ from: 'a', to: 'b' }, { from: 'c', to: 'd' }]);
});

test('dict.mjs: gộp tên thương hiệu + sản phẩm + từ điển kit + từ điển dự án', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-dict-'));
  const dir = path.join(home, 'proj');
  fs.mkdirSync(path.join(home, 'products'), { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(home, 'brands.json'), JSON.stringify({ version: 1, brands: [{ id: 'lychee-ab12', title: 'Lychee Group', dict: 'li chi=Lychee' }] }));
  fs.writeFileSync(path.join(home, 'products', 'koharu.json'), JSON.stringify({ version: 1, id: 'koharu', name: 'Koharu Collagen', claims: [] }));
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({ brand: { kit: 'lychee-ab12' }, ads: { product: 'koharu' } }));
  assert.deepEqual(saveProjectDict(dir, [{ from: 'tiền hóa', to: 'tiến hoá' }, { from: 'bad', to: 1 }]), [{ from: 'tiền hóa', to: 'tiến hoá' }]);
  assert.deepEqual(loadProjectDict(dir), [{ from: 'tiền hóa', to: 'tiến hoá' }]);
  const s = dictSources({ dir, h: home });
  assert.deepEqual(s.kit, { id: 'lychee-ab12', title: 'Lychee Group' });
  assert.deepEqual(s.auto.map(e => e.to).sort(), ['Koharu Collagen', 'Lychee Group']);
  assert.deepEqual(s.brand, [{ from: 'li chi', to: 'Lychee' }]);
  const prev = process.env.AVS_HOME; process.env.AVS_HOME = home;
  try {
    const fix = projectFix({ dir });
    assert.match(fix, /lychee group=Lychee Group/);
    assert.match(fix, /li chi=Lychee/);
    assert.match(fix, /tiền hóa=tiến hoá/);
    assert.ok(fixWords(fix).has('Lychee'));
    // hỏng file: không ném lỗi
    fs.writeFileSync(path.join(dir, '.studio', 'dict.json'), '{');
    assert.equal(typeof projectFix({ dir }), 'string');
  } finally { if (prev === undefined) delete process.env.AVS_HOME; else process.env.AVS_HOME = prev; fs.rmSync(home, { recursive: true, force: true }); }
});
