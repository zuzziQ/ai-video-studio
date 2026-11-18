// S23 M159: còn sót của Hỏi Claude / xem lại — âm thanh của bản xem trước (74_review.core.js), Bỏ "Sửa hết lỗi" trả .studio/qc.json
// (route POST /api/qc/revert của studio/routes/16_qc.mjs), chỗ nối Bỏ → hoàn trả trong 75_ask.js.
// Chạy: node --test scripts/tests/s23_m159.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rmSync } from '../fs_rm.mjs';

const R = createRequire(import.meta.url)('../../studio/features/74_review.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('âm thanh thêm của bản xem trước: chỉ mục chưa có trong timeline thật, bỏ qua cid / _orig / mục ẩn', () => {
  const real = { audio: { sfx: [{ name: 'whoosh', t: 1, gain: -12, cid: 'a1' }], music: [{ mood: 'calm', t0: 0, t1: 10 }] } };
  const prev = { audio: {
    sfx: [{ name: 'whoosh', t: 1, gain: -12, cid: 'zz' }, { name: 'pop', t: 2.5, _ai: true }, { name: 'ding', t: 3, hidden: true }],
    music: [{ mood: 'calm', t0: 0, t1: 10 }, { mood: 'upbeat', t0: 4, t1: 8, _auto: true }] } };
  const ex = R.audioExtra(real, prev);
  assert.deepEqual(ex.sfx.map(x => x.name), ['pop']);
  assert.deepEqual(ex.music.map(x => x.mood), ['upbeat']);
  // hai SFX giống hệt nhau: timeline thật có một → bản xem trước thêm một
  const dup = R.audioExtra({ audio: { sfx: [{ name: 'pop', t: 2 }] } }, { audio: { sfx: [{ name: 'pop', t: 2 }, { name: 'pop', t: 2 }] } });
  assert.equal(dup.sfx.length, 1);
  assert.deepEqual(R.audioExtra({}, {}), { sfx: [], music: [] }, 'không có audio');
});

test('SFX đến lượt: (from, to], nhảy lùi thì không phát', () => {
  const L = [{ t: 1 }, { t: 2 }, { t: 3 }];
  assert.deepEqual(R.sfxDue(L, 0.9, 2).map(x => x.t), [1, 2]);
  assert.deepEqual(R.sfxDue(L, 2, 2.5), [], 'đầu khoảng không tính');
  assert.deepEqual(R.sfxDue(L, 3, 1), [], 'phát lặp quay về đầu đoạn');
});

test('POST /api/qc/revert: qc.json + qc_backup.json về bản chụp trước lần sửa', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m159-'));
  try {
    const st = path.join(dir, '.studio'); fs.mkdirSync(st);
    let last = null;
    const ctx = { project: { dir }, P: rel => path.join(dir, rel), SKILL: path.resolve('.'), json: (res, o, code = 200) => { last = { o, code }; }, body: async req => req.body || {} };
    const h = (await import('../../studio/routes/16_qc.mjs')).default(ctx);
    const j = f => JSON.parse(fs.readFileSync(path.join(st, f), 'utf8'));
    // chưa có bản chụp → 400, không đụng gì
    fs.writeFileSync(path.join(st, 'qc.json'), JSON.stringify({ score: 90, fixed: true }));
    await h({ method: 'POST', body: {} }, {}, '/api/qc/revert');
    assert.equal(last.code, 400);
    assert.equal(j('qc.json').score, 90);
    // có báo cáo cũ: trả về đúng báo cáo cũ, bản sao lưu cũ
    fs.writeFileSync(path.join(st, 'qc_backup.json'), JSON.stringify({ timeline: { v: 'new-backup' } }));
    fs.writeFileSync(path.join(st, 'qc_prev.json'), JSON.stringify({ report: { score: 61 }, backup: { timeline: { v: 'old' } } }));
    await h({ method: 'POST', body: {} }, {}, '/api/qc/revert');
    assert.equal(last.code, 200); assert.equal(last.o.ok, true);
    assert.equal(j('qc.json').score, 61);
    assert.equal(j('qc_backup.json').timeline.v, 'old');
    assert.ok(!fs.existsSync(path.join(st, 'qc_prev.json')), 'bản chụp dùng một lần');
    // trước lần sửa chưa từng kiểm: Bỏ thì xoá luôn qc.json + qc_backup.json
    fs.writeFileSync(path.join(st, 'qc_prev.json'), JSON.stringify({ report: null, backup: null }));
    await h({ method: 'POST', body: {} }, {}, '/api/qc/revert');
    assert.ok(!fs.existsSync(path.join(st, 'qc.json')));
    assert.ok(!fs.existsSync(path.join(st, 'qc_backup.json')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('job sửa chụp qc_prev.json trước khi chạy ai_qc, lần kiểm không sửa thì bỏ bản chụp', () => {
  const src = read('studio/routes/16_qc.mjs');
  const job = src.slice(src.indexOf("ctx.startJob('qc'"), src.indexOf("ctx.job.out = '.studio/qc.json'"));
  assert.ok(job.indexOf('qc_prev.json') >= 0 && job.indexOf('qc_prev.json') < job.indexOf('ctx.run('), 'chụp trước khi chạy');
  assert.match(job, /if \(b\.fix\) fs\.writeFileSync\(prev/);
  assert.match(job, /else rmSync\(prev/);
});

test('75_ask.js: Bỏ (đóng không Nhận) gọi hoàn trả của từng việc; 74_review.js ẩn khung chọn khi xem bản mới', () => {
  const a = read('studio/features/75_ask.js');
  // S24 M171: đóng mà không Nhận (thẻ của luồng hỏi đáp) gọi drop() một lần
  assert.match(a, /if \(!got\) \{\s+if \(!L\.dropped\) \{ L\.dropped = true; try \{ L\.spec\.drop\?\.\(\);/);
  assert.match(a, /\(\) => S\.qc\.revert\?\.\(\)\);/);
  assert.match(a, /S\.autofill\.forget\?\.\(\)/);
  assert.match(a, /S\.ai\.forget\?\.\(\)/);
  assert.match(a, /S\._rail\.push\(/, 'ẩn nút panel Chuyên nghiệp ở thanh trái Cơ bản');
  assert.match(a, /async function runAction\(pick, sc\) \{\r?\n {4}armUntil = /, 'chỉ panel do thanh Hỏi Claude mở');
  const v = read('studio/features/74_review.js');
  assert.match(v, /body\.rv-new #overlay, body\.rv-new \.cbar/);
  assert.match(v, /RC\.audioExtra\(S\.TL, tl\)/);
  assert.match(read('studio/features/16_qc.js'), /revert: async \(\) => \{ const r = await S\.api\('\/api\/qc\/revert'/);
  assert.match(read('studio/features/80_autofill.js'), /const forget = \(\) => \{ last = prevLast;/);
});
