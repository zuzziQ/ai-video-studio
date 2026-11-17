// S18 M128: dải "Cùng bộ" (studio/routes/57_clipset.mjs) — liệt kê clip cùng lần cắt, mở clip theo số thứ tự (không nhận đường dẫn).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const T = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m128-'));
process.env.AVS_HOME = path.join(T, 'home');
after(() => fs.rmSync(T, { recursive: true, force: true }));
const { clipSet, default: route } = await import('../../studio/routes/57_clipset.mjs');

// bộ cắt cũ ghi đường dẫn tuyệt đối ở chỗ khác (Kho đã dời): vẫn tìm theo tên thư mục trong thư mục cha
const RUN = path.join(T, 'Du an', 'livestream - clip ngắn (2)');
const mk = (name, { tl = true, mp4 = false } = {}) => {
  const d = path.join(RUN, name); fs.mkdirSync(path.join(d, '.studio'), { recursive: true });
  if (tl) fs.writeFileSync(path.join(d, 'timeline.json'), '{}');
  if (mp4) { fs.mkdirSync(path.join(d, 'out')); fs.writeFileSync(path.join(d, 'out', 'v.mp4'), 'x'); }
  return d;
};
const A = mk('01_meo-a', { mp4: true }), B = mk('02_meo-b'), C = mk('03_da-xoa', { tl: false });
fs.writeFileSync(path.join(RUN, 'highlights.json'), JSON.stringify([
  { dir: 'D:/cu/01_meo-a', title: 'Mẹo A', score: 88, dur: 31.2 },
  { dir: 'D:/cu/02_meo-b', title: 'Mẹo B', score: 70, dur: 40 },
  { dir: 'D:/cu/03_da-xoa', title: 'Đã xoá', score: 50, dur: 22 },
]));
fs.writeFileSync(path.join(RUN, 'source.json'), JSON.stringify({ name: 'livestream.mp4' }));

test('clipSet: đủ bộ, đánh dấu clip đang mở, đã xuất, đã xoá; tên bộ bỏ hậu tố', () => {
  const s = clipSet(B);
  assert.equal(s.n, 3); assert.equal(s.cur, 1); assert.equal(s.name, 'livestream'); assert.equal(s.source, 'livestream.mp4');
  assert.deepEqual(s.items.map(x => [x.title, x.current, x.exported, x.exists]),
    [['Mẹo A', false, true, true], ['Mẹo B', true, false, true], ['Đã xoá', false, false, false]]);
  assert.equal(s.items[0].dir, A, 'tìm theo tên thư mục trong thư mục cha');
});

test('clipSet: dự án thường (không có highlights.json) hoặc không thuộc bộ → null', () => {
  const lone = path.join(T, 'Du an', 'video-rieng'); fs.mkdirSync(lone, { recursive: true });
  assert.equal(clipSet(lone), null);
  assert.equal(clipSet(mk('99_la')), null);
  assert.equal(clipSet(null), null);
});

test('route: GET trả bộ không lộ đường dẫn thư mục; POST mở theo số thứ tự, chặn clip đã xoá, số lạ, đang có job', async () => {
  const out = []; let opened = null;
  const ctx = { project: { dir: B }, job: null, json: (r, o, c) => out.push({ o, c }), body: async q => q.b, openProject: d => { opened = d; } };
  const R = route(ctx);
  assert.equal(await R({ method: 'GET' }, {}, '/api/khac'), false);
  await R({ method: 'GET' }, {}, '/api/clipset');
  const set = out.at(-1).o.set;
  assert.equal(set.n, 3); assert.ok(!('dir' in set.items[0]) && !('thumb' in set.items[0]));
  for (const [b, code] of [[{ i: 2 }, 404], [{ i: 9 }, 400], [{ i: '0' }, 400], [{ dir: A }, 400]]) {
    await R({ method: 'POST', b }, {}, '/api/clipset/open');
    assert.equal(out.at(-1).c, code, JSON.stringify(b));
  }
  assert.equal(opened, null);
  ctx.job = { state: 'running' };
  await R({ method: 'POST', b: { i: 0 } }, {}, '/api/clipset/open');
  assert.equal(out.at(-1).c, 409); assert.equal(opened, null);
  ctx.job = null;
  await R({ method: 'POST', b: { i: 0 } }, {}, '/api/clipset/open');
  assert.equal(out.at(-1).o.ok, true); assert.equal(opened, A);
  ctx.project = null; await R({ method: 'GET' }, {}, '/api/clipset');
  assert.equal(out.at(-1).o.set, null, 'chưa mở dự án');
});
