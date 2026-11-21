// S27 M201: thêm video → Kịch bản (mục riêng ngay dưới Video nguồn) → bước Dựng hỏi "Bạn muốn làm gì?" (mỗi việc một lựa chọn,
// không tick sẵn, chỉ làm việc đã chọn); Tự lái vẫn tự động hết. Lõi: studio/features/26_tasks.core.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const req = createRequire(import.meta.url);
const C = req('../../studio/features/26_tasks.core.js');
const L = req('../../studio/features/01_level.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('đủ các việc chủ repo nêu, id không trùng', () => {
  const ids = C.TASKS.map(t => t.id);
  assert.deepEqual(ids, ['cut', 'face', 'look', 'aroll', 'broll', 'music', 'graphic', 'caption']);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of C.TASKS) assert.ok(t.label && t.hint && t.icon && ['run', 'list', 'open'].includes(t.kind), t.id);
});

test('điều kiện chọn được: lời thoại, kịch bản, clip video, Claude', () => {
  const full = { captions: true, script: true, video: true, claude: true };
  for (const t of C.TASKS) assert.equal(C.avail(t.id, full).ok, true, t.id);
  assert.match(C.avail('aroll', { ...full, script: false }).why, /kịch bản/);
  assert.match(C.avail('cut', { ...full, captions: false }).why, /lời thoại/);
  assert.equal(C.avail('face', { ...full, video: false }).ok, false);
  assert.match(C.avail('graphic', { ...full, claude: false }).why, /Claude/);
  assert.equal(C.avail('graphic', { ...full, claude: null }).ok, true, 'chưa kiểm xong Claude vẫn cho chọn');
  assert.equal(C.avail('music', {}).ok, true, 'nhạc không cần gì trước');
  assert.equal(C.avail('look', {}).ok, true);
  assert.equal(C.avail('xyz', full).ok, false);
});

test('chỉ chạy việc đã chọn, theo thứ tự cố định', () => {
  assert.deepEqual(C.steps([]), []);
  assert.deepEqual(C.steps(['broll']), [{ step: 'broll' }]);
  assert.deepEqual(C.steps(['look', 'music', 'cut', 'face']).map(s => s.step), ['cut', 'face', 'music', 'look']);
  // nhạc không có lượt Claude → Tự động; có lượt Claude → đi kèm lượt đó (theo dấu MOOD của kịch bản), không chạy hai nguồn nhạc
  assert.deepEqual(C.steps(['music', 'graphic']), [{ step: 'claude', parts: ['graphic', 'music'] }]);
  assert.deepEqual(C.steps(new Set(['caption', 'graphic', 'aroll', 'bogus'])), [{ step: 'claude', parts: ['graphic', 'caption'] }, { step: 'aroll' }]);
});

test('lượt Claude chỉ áp phần đã chọn', () => {
  assert.deepEqual(C.onlyOf(['caption']), { graphic: false, caption: true, music: false });
  assert.deepEqual(C.onlyOf(['graphic', 'music']), { graphic: true, caption: false, music: true });
  assert.deepEqual(C.onlyOf(), { graphic: true, caption: true, music: true }, 'không parts = như AI dựng cũ');
  const ai = read('studio/features/20_ai.js');
  assert.match(ai, /if \(!only\.graphic\) plan = \{ \.\.\.plan, pack: TL\.pack, caption_style: TL\.caption_style, hook: null, scenes: null \}/);
  assert.match(ai, /if \(plan\.scenes\) TL\.scenes =/);
  assert.match(ai, /if \(plan\.sfx\) \{\s*TL\.audio\.sfx =/); // M210: khối nhịp cùng nhánh "Nhạc và SFX"
  assert.match(ai, /if \(plan\.sfx\) \{[^}]*?\n[^]*?for \(const k of \['fx', 'efx'\]\)/);
  assert.match(ai, /applyPlan\(plan, \{ only \}\)/);
});

test('Kịch bản là mục riêng ngay dưới Video nguồn; panel AI dựng mở bằng Bạn muốn làm gì?', () => {
  const wf = read('studio/features/01_workflow.js');
  assert.match(wf, /'wf-new': \['source', 1\], 'wf-script': \['source', 1\.5\]/);
  assert.match(wf, /S\.addPanel\('wf-script', 'ti-file-text', 'Kịch bản', renderScript\)/);
  assert.doesNotMatch(wf.slice(wf.indexOf('function renderSource'), wf.indexOf('function renderScript')), /id="wf-script"/, 'Video nguồn không còn ô kịch bản');
  assert.deepEqual(L.BASIC_RAIL.source, ['wf-new', 'wf-script']);
  assert.equal(L.railLevel('wf-script', 'source'), 'basic');
  const ai = read('studio/features/20_ai.js');
  assert.match(ai, /S\.tasks \? S\.tasks\.html\(\)/);
  const t = read('studio/features/26_tasks.js');
  assert.match(t, /sel: new Set\(\)/, 'không tick sẵn');
  assert.doesNotMatch(t, /localStorage/, 'không nhớ lựa chọn sang lần sau');
});
