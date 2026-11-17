// S16 M118: dự án Tự lái mở trong Studio không bị áp lại công thức gói, bản xuất của Tự lái vào lịch sử, dự án vào "Dự án gần đây".
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-s16-keep-'));
const HOME = path.join(TMP, 'home');
process.env.AVS_HOME = HOME;
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const { dropStarter } = await import('../autopilot.mjs');
const { addRecent, loadState } = await import('../../studio/routes/02_onboarding.mjs');
const { recordExport, updateExport, readExports } = await import('../exports_log.mjs');

test('dropStarter bỏ _starter, giữ nguyên cảnh đã dựng', () => {
  const dir = path.join(TMP, 'p1'); fs.mkdirSync(dir, { recursive: true });
  const scenes = [{ type: 'frame_grid', t0: 0, t1: 10 }, { type: 'text', t0: 1, t1: 2, _auto: true }];
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({ duration: 10, _starter: { pack: 'slate', title: '' }, scenes }));
  dropStarter(dir);
  const tl = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  assert.equal(tl._starter, undefined);
  assert.deepEqual(tl.scenes, scenes);
  const m = fs.statSync(path.join(dir, 'timeline.json')).mtimeMs;
  dropStarter(dir); // không còn _starter: không ghi lại (ghi lại sẽ làm bản xuất bị coi là cũ)
  assert.equal(fs.statSync(path.join(dir, 'timeline.json')).mtimeMs, m);
});

test('bản xuất Tự lái ghi vào exports.json kèm file đã giao', () => {
  const dir = path.join(TMP, 'p2'); fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'out/a.mp4'), 'x');
  const it = recordExport(dir, { id: 'ap-1', at: new Date().toISOString(), quality: '1080', range: null, delivered: [], deliverError: null,
    files: [{ file: 'out/a.mp4', aspect: '9:16', w: 1080, h: 1920, dur: 5, size: 1 }] });
  const give = path.join(TMP, 'Thanh pham', 'a 9x16.mp4');
  updateExport(dir, it.id, { delivered: [give] });
  const [x] = readExports(dir);
  assert.equal(x.id, 'ap-1'); assert.deepEqual(x.delivered, [give]); assert.equal(x.legacy, undefined);
});

test('addRecent: thêm dự án lên đầu, không tạo onboarding.json cho người mới', () => {
  const dir = path.join(TMP, 'p3');
  assert.equal(addRecent(dir), false);
  assert.equal(fs.existsSync(path.join(HOME, 'onboarding.json')), false);
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(path.join(HOME, 'onboarding.json'), JSON.stringify({ version: 1, done: true, recent: [] }));
  assert.equal(addRecent(dir), true);
  assert.equal(loadState().recent[0].dir, dir);
  assert.equal(addRecent(dir), false); // đã ở đầu: không ghi lại
  assert.equal(addRecent('tuong-doi'), false);
});
