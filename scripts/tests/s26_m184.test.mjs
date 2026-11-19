// S26 M184 — tên thành phẩm đọc được (tiêu đề, giờ máy thay "(2)"), stamp giờ máy của server, clip ép trong --max.
// run: node --test scripts/tests/s26_m184.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TMP = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m184-')));
Object.assign(process.env, { AVS_HOME: path.join(TMP, 'home'), USERPROFILE: path.join(TMP, 'user'), HOME: path.join(TMP, 'user'), AVS_NO_NOTIFY: '1' });
fs.mkdirSync(process.env.AVS_HOME, { recursive: true });
const R = (...p) => pathToFileURL(path.resolve(import.meta.dirname, '..', '..', ...p)).href;
const K = await import(R('scripts/kho_deliver.mjs'));
const H = await import(R('scripts/highlights.mjs'));
after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

test('readableName: tiêu đề có dấu thắng, bỏ đuôi băm và số thứ tự khi không có tiêu đề', () => {
  assert.equal(K.readableName('/x/video-goc', { title: '  Nhà   mẫu tự lái ' }), 'Nhà mẫu tự lái');
  assert.equal(K.readableName('/x/nha-mau-tu-lai-31827a', {}), 'nha mau tu lai');
  assert.equal(K.readableName('/x/01_edit-video-mat-vai-tieng-gio', null), 'edit video mat vai tieng gio');
  assert.equal(K.readableName('/x/abc', null), 'abc');
});

test('exportItems: tên theo tiêu đề; alt có giờ máy', () => {
  const [it] = K.exportItems('/x/p-31827a', [{ src: '/o/a.mp4', aspect: '9:16' }], { tl: { title: 'Tiêu đề' }, now: new Date(2026, 10, 19, 9, 21) });
  assert.equal(it.name, 'Tiêu đề 9x16.mp4');
  assert.equal(it.alt, 'Tiêu đề 9x16 09h21.mp4');
});

test('lần xuất thứ hai dùng giờ thay "(2)", lần thứ ba cùng phút vẫn không đè', () => {
  const dir = path.join(TMP, 'du-an-1a2b3c'); fs.mkdirSync(dir, { recursive: true });
  const src = path.join(dir, 'a.mp4'); fs.writeFileSync(src, 'v');
  const ws = { root: path.join(TMP, 'kho') };
  const tl = { title: 'Bài thử' }, now = new Date(2026, 10, 19, 9, 21);
  const run = () => K.deliverExports(dir, [{ src, aspect: '9:16' }], { tl, now, folder: 'lo' }).items[0].dst;
  const a = run(), b = run(), c = run();
  assert.equal(path.basename(a), 'Bài thử 9x16.mp4');
  assert.equal(path.basename(b), 'Bài thử 9x16 09h21.mp4');
  assert.equal(path.basename(c), 'Bài thử 9x16 09h21 (2).mp4');
  assert.ok(fs.existsSync(a) && fs.existsSync(b) && fs.existsSync(c));
  void ws;
});

test('stamp của server là giờ máy', () => {
  const m = fs.readFileSync(path.resolve(import.meta.dirname, '../../studio/server.mjs'), 'utf8').match(/const localStamp = \(d = new Date\(\)\) => \{[^\n]*\};/);
  assert.ok(m, 'không thấy localStamp');
  const stamp = new Function(`${m[0]}; return localStamp;`)();
  assert.equal(stamp(new Date(2026, 10, 19, 9, 21, 39)), '2026-11-19T09-21-39');
  assert.match(stamp(), /^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d$/);
});

test('fitMax: clip không vượt max dù snap thêm khoảng đệm', () => {
  const words = [], sents = [];
  for (let s = 0; s < 4; s++) { // 4 câu x 5 từ, mỗi từ 0.6 s, nghỉ 0.4 s giữa câu → mỗi câu ~3 s
    const w0 = words.length;
    for (let i = 0; i < 5; i++) { const st = s * 3.4 + i * .6; words.push({ w: 'a', s: st, e: st + .55 }); }
    sents.push({ i: s, w0, w1: words.length - 1, s: words[w0].s, e: words.at(-1).e, text: 'x' });
  }
  const max = 9.5, r = H.fitMax(words, [], sents, 0, 3, sents[3].w1, max, 20);
  assert.ok(r.t1 - r.t0 <= max + 1e-6, `dur ${r.t1 - r.t0}`);
  assert.ok(r.t < 3);
  const one = H.fitMax(words, [], sents, 0, 0, sents[0].w1, 1.5, 20); // một câu dài hơn max: lùi từ cuối
  assert.ok(one.t1 - one.t0 <= 1.5 + 1e-6 && one.w1 < sents[0].w1);
});
