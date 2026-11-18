// S24 M171: luồng hỏi đáp của tab Claude — lõi lịch sử (studio/features/75_ask.core.js: logEntry / logPush / logParse) và route
// /api/ask/log (studio/routes/75_ask.mjs, ghi .studio/ask_log.json của dự án đang mở). Chạy: node --test scripts/tests/s24_m171.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import route from '../../studio/routes/75_ask.mjs';

const AC = createRequire(import.meta.url)('../../studio/features/75_ask.core.js');
const entry = (id, o = {}) => ({ id, at: 1700000000000, step: 'build', scope: { kind: 'video', chip: 'Bước Dựng · cả video' }, src: 'ask', q: 'làm sôi động hơn', kind: 'reply', text: 'ok', ...o });

test('logEntry: giữ đúng trường, bỏ trường lạ, chặn ảnh, kẹp độ dài', () => {
  assert.equal(AC.logEntry(null), null);
  assert.equal(AC.logEntry({ id: 'x' }), null); // thiếu kind
  assert.equal(AC.logEntry({ id: '', kind: 'reply' }), null);
  const e = AC.logEntry(entry('a1', { extra: 'bỏ', img: 'data:image/png;base64,AAAA', text: 'x'.repeat(5000), scope: { kind: 'range', chip: '0:04–0:09', a: 4.123, b: 'x', cid: 'c 1' } }));
  assert.deepEqual(Object.keys(e).sort(), ['at', 'id', 'kind', 'q', 'scope', 'src', 'step', 'text']);
  assert.equal(e.text.length, 1200);
  assert.deepEqual(e.scope, { kind: 'range', chip: '0:04–0:09', cid: 'c1', a: 4.12 });
  assert.equal(AC.logEntry(entry('a2', { q: 'xem data:image/jpeg;base64,/9j/4AAQ' })).q, ''); // ảnh nhúng trong chữ: bỏ cả chuỗi
  const bad = AC.logEntry(entry('a3', { step: 'hack', src: 'evil', scope: { kind: 'hack' } }));
  assert.equal(bad.step, 'build'); assert.equal(bad.src, 'ask'); assert.equal(bad.scope.kind, 'step');
  assert.equal(AC.logEntry(entry('a<script>', {})).id, 'ascript');
});

test('logEntry: thẻ kết quả có title / sub / khoảng / trạng thái hợp lệ', () => {
  const c = AC.logEntry(entry('c1', { kind: 'card', card: { title: 'AI dựng', sub: '12 graphic', t0: 1.234, t1: 9, state: 'weird', fn: 'x' } }));
  assert.deepEqual(c.card, { title: 'AI dựng', sub: '12 graphic', t0: 1.23, t1: 9, state: 'open' });
  assert.equal(AC.logEntry(entry('c2', { kind: 'card', card: { state: 'accepted' } })).card.state, 'accepted');
  assert.equal(AC.logEntry(entry('c3', { kind: 'reply', card: { title: 'x' } })).card, undefined); // chỉ thẻ mới có card
  const w = AC.logEntry(entry('w', { warnings: ['a', '', 'b', 'c', 'd'] }));
  assert.deepEqual(w.warnings, ['a', 'b', 'c']);
});

test('logPush: thêm cuối, cùng id thì thay (đổi trạng thái thẻ), giữ 200 lượt gần nhất', () => {
  let L = [];
  for (let i = 0; i < 205; i++) L = AC.logPush(L, entry('e' + i));
  assert.equal(L.length, AC.LOG_MAX); assert.equal(AC.LOG_MAX, 200);
  assert.equal(L[0].id, 'e5'); assert.equal(L.at(-1).id, 'e204');
  L = AC.logPush(L, entry('e10', { kind: 'card', card: { title: 'T', state: 'accepted' } }));
  assert.equal(L.length, 200); assert.equal(L.find(x => x.id === 'e10').card.state, 'accepted');
  assert.equal(AC.logPush(L, { bad: 1 }).length, 200); // lượt sai: bỏ qua
});

test('logParse: chuỗi hỏng → rỗng; {items} hoặc mảng; bỏ lượt trùng, lượt sau thắng', () => {
  assert.deepEqual(AC.logParse('{hỏng'), []);
  assert.deepEqual(AC.logParse(null), []);
  const a = AC.logParse(JSON.stringify({ v: 1, items: [entry('x'), { nope: 1 }, entry('y'), entry('x', { text: 'mới' })] }));
  assert.deepEqual(a.map(e => e.id), ['x', 'y']); assert.equal(a[0].text, 'mới');
  assert.equal(AC.logParse([entry('z')]).length, 1);
});

function harness(dir) {
  const ctx = { json: (res, o, c = 200) => { res.code = c; res.out = o; }, body: async req => req.body,
    get project() { return dir ? { dir } : null; }, P: rel => path.join(dir, rel) };
  const h = route(ctx);
  return async (method, p, body) => { const res = {}; const hit = await h({ method, body }, res, p); return hit ? { code: res.code, ...res.out } : null; };
}

test('route /api/ask/log: đọc rỗng, ghi .studio/ask_log.json, thay theo id, từ chối lượt sai, chưa mở dự án', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m171-'));
  try {
    const call = harness(dir);
    assert.deepEqual((await call('GET', '/api/ask/log')).items, []);
    const r = await call('POST', '/api/ask/log', { entry: entry('k1', { img: 'data:image/png;base64,AA' }) });
    assert.equal(r.ok, true); assert.equal(r.n, 1);
    const f = path.join(dir, '.studio', 'ask_log.json');
    const disk = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.equal(disk.items.length, 1); assert.equal(disk.items[0].img, undefined);
    await call('POST', '/api/ask/log', { entry: entry('k2', { kind: 'card', card: { title: 'Thêm b-roll', state: 'open' } }) });
    await call('POST', '/api/ask/log', { entry: entry('k2', { kind: 'card', card: { title: 'Thêm b-roll', state: 'dropped' } }) });
    const g = await call('GET', '/api/ask/log');
    assert.deepEqual(g.items.map(e => e.id), ['k1', 'k2']); assert.equal(g.items[1].card.state, 'dropped');
    assert.equal((await call('POST', '/api/ask/log', { entry: { id: 'x' } })).code, 400);
    assert.equal((await call('POST', '/api/ask/log', {})).code, 400);
    fs.writeFileSync(f, '{hỏng'); // file hỏng: đọc như rỗng, ghi lại được
    assert.deepEqual((await call('GET', '/api/ask/log')).items, []);
    assert.equal((await call('POST', '/api/ask/log', { entry: entry('k3') })).n, 1);
    assert.deepEqual(fs.readdirSync(path.join(dir, '.studio')), ['ask_log.json']); // không sót tệp tạm
    assert.equal(await call('PUT', '/api/ask/log', {}), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const none = harness(null);
  assert.deepEqual((await none('GET', '/api/ask/log')).items, []);
  assert.equal((await none('POST', '/api/ask/log', { entry: entry('a') })).code, 404);
});

test('changeSummary: cảnh thêm / sửa / bỏ theo loại, phụ đề, SFX / nhạc, chỗ nối; tối đa 6 dòng', () => {
  const A = { TL: { scenes: [{ type: 'text', t0: 1 }, { type: 'broll', t0: 3 }, { type: 'x', t0: 5 }], audio: { sfx: [{ t: 1 }], music: [{ src: 'a' }] },
    clips: [{}, {}, { transition: { type: 'fade' } }] }, CAP: [{ t0: 0, text: 'a' }, { t0: 1, text: 'b' }] };
  const B = { TL: { scenes: [{ type: 'text', t0: 1.5 }, { type: 'broll', t0: 3 }, { type: 'broll', t0: 8 }], audio: { sfx: [{ t: 1 }, { t: 2 }, { t: 4 }], music: [{ src: 'b' }] },
    clips: [{}, { transition: { type: 'whip' } }, { transition: { type: 'fade' } }] }, CAP: [{ t0: 0, text: 'a' }, { t0: 1, text: 'B' }] };
  const s = AC.changeSummary(A, B);
  assert.deepEqual(s, ['sửa 1 chữ', '+1 b-roll', 'bỏ 1 graphic', '1 dòng phụ đề', '+2 SFX', 'sửa 1 nhạc nền']); // 7 dòng → cắt còn 6
  assert.deepEqual(AC.changeSummary(A, A), []);
  assert.deepEqual(AC.changeSummary({ TL: { clips: [{}, {}] } }, { TL: { clips: [{}, { transition: { type: 'fade' } }] } }), ['1 chỗ nối chuyển cảnh']);
  assert.deepEqual(AC.changeSummary({}, {}), []);
  const c = AC.logEntry(entry('w1', { kind: 'card', card: { title: 'T', what: [...s, 'x', 'data:image/png;base64,AA'], state: 'undone' } }));
  assert.equal(c.card.state, 'undone'); assert.equal(c.card.what.length, 6);
  assert.equal(AC.logEntry(entry('w2', { kind: 'card', card: { title: 'T', what: [] } })).card.what, undefined);
});
