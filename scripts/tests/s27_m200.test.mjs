// S27 M200: tiêu chí `script` của bước Dựng (phần chính của M200 đã vào qua #246, M194 đổi hướng): "Theo kịch bản: x/y yêu cầu đã dựng ·
// n cần xem" trong điểm bước Dựng (02_score.core.js), sửa = mở panel AI dựng rồi Studio.scriptNotes.jump (03_nextstep.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const SC = createRequire(import.meta.url)('../../studio/features/02_score.core.js');
const tl = { duration: 12, pack: 'slate', scenes: [{ type: 'text', t0: 0, t1: 2, _ai: true }], audio: { music: [], sfx: [] } };
const item = script => SC.score({ tl, caps: 3, script }).steps.build.items.find(i => i.id === 'script');

test('ScoreCore: tiêu chí script nên làm, nhãn x/y + cần xem, at = yêu cầu cần xem đầu', () => {
  const it = item({ total: 8, done: 7, need: [{ id: '1:broll:0', t0: 4.52, seg: 1 }] });
  assert.equal(it.label, 'Theo kịch bản: 7/8 yêu cầu đã dựng · 1 cần xem');
  assert.equal(it.opt, true); assert.equal(it.ok, false); assert.equal(it.at, 4.52);
  assert.match(it.miss, /1 yêu cầu của kịch bản chưa dựng được/);
  const ok = item({ total: 3, done: 3, need: [] });
  assert.equal(ok.label, 'Theo kịch bản: 3/3 yêu cầu đã dựng'); assert.equal(ok.ok, true); assert.equal(ok.at, undefined);
  assert.equal(item(null), undefined, 'không dựng theo kịch bản: không có tiêu chí');
  assert.equal(item({ total: 0, done: 0, need: [] }), undefined);
});

test('03_nextstep: đọc kế hoạch AI dựng, sửa tiêu chí script = workflow.focus panel AI dựng rồi scriptNotes.jump(kế hoạch)', () => {
  const ns = read('studio/features/03_nextstep.js');
  assert.match(ns, /script: \['wf-aihelp', \['\.scn-sum'\]\]/);
  assert.match(ns, /get\('\/api\/ai\/plan'\)/);
  assert.match(ns, /script: \(D\.plan && S\.scriptNotes\?\.stat\(D\.plan\)\) \|\| null/);
  assert.match(ns, /t\.id === 'script' && S\.scriptNotes \? \(\) => \{ go\(t\.go\[0\], t\.go\[1\]\)\(\); S\.scriptNotes\.jump\(D\.plan\); \}/);
  const sn = read('studio/features/23_scriptnotes.js');
  assert.match(sn, /function jump\(plan\) \{[^\n]*\n\s+if \(plan\) cur = plan;/);
  assert.doesNotMatch(sn + ns, /addTopButton/);
});
