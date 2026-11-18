// S23 M164 (C32): điểm từng bước trên thanh bước — dữ liệu popover từ ScoreCore + state(step) của 03_nextstep, mục chưa đạt →
// việc của thanh Hỏi Claude (75_ask.core.js) hoặc mở chỗ sửa; tab Dự án không còn chip + thanh. Chạy:
// node --test scripts/tests/s23_score_stepper.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const req = createRequire(import.meta.url);
const P = req('../../studio/features/03_stepscore.core.js');
const SC = req('../../studio/features/02_score.core.js');
const AC = req('../../studio/features/75_ask.core.js');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// state(step) như 03_nextstep.js dựng từ ScoreCore (tasks: id, label, done, opt, miss, lost)
const stateOf = (input, step) => {
  const s = SC.score(input).steps[step];
  return { step, score: s.score, tasks: s.items.map(i => ({ id: i.id, label: i.label, done: i.ok, opt: i.opt, miss: i.miss, lost: i.lost, go: ['wf-' + step, []] })) };
};
const allowed = step => AC.actionsOf(AC.scopeOf({ step })).map(a => a.id);

test('tone theo ScoreCore.WARN_BELOW và điểm đầy', () => {
  assert.equal(P.tone(SC.WARN_BELOW - 1, SC.WARN_BELOW), 'low');
  assert.equal(P.tone(SC.WARN_BELOW, SC.WARN_BELOW), 'mid');
  assert.equal(P.tone(100, SC.WARN_BELOW), 'full');
});

test('popover: tiêu đề "Kiểm tra x/100", mục chưa đạt kèm vì sao + điểm mất, việc chính trước, mục đạt thu gọn riêng', () => {
  const input = { tl: { duration: 20, clips: [{}], scenes: [] }, quick: { issues: [{ severity: 'high' }, { severity: 'med' }] }, qc: null };
  const st = stateOf(input, 'check'), v = P.view(st, { name: 'Kiểm tra', warnBelow: SC.WARN_BELOW, allowed: allowed('check') });
  assert.equal(v.title, `Kiểm tra ${st.score}/100`);
  assert.equal(v.tone, st.score < SC.WARN_BELOW ? 'low' : 'mid');
  assert.deepEqual(v.fail.map(f => f.id), ['quick', 'qc'], 'QC nhanh (việc chính) trước QC đầy đủ (nên làm)');
  assert.ok(v.fail[0].miss.includes('2 chỗ'), 'có vì sao');
  assert.ok(v.fail[0].lost > 0, 'có điểm mất');
  assert.equal(v.fail[1].opt, true);
  assert.equal(v.pass.length, 0);
  // index trỏ đúng tasks của state (bấm mục → st.tasks[i])
  for (const f of v.fail) assert.equal(st.tasks[f.i].id, f.id);
});

test('popover: điểm mất nhiều trước, mục đã đạt sang pass; đang đọc thì tiêu đề không có số', () => {
  const input = { tl: { brand: { name: 'A' } } };
  const st = stateOf(input, 'prep'), v = P.view(st, { name: 'Chuẩn bị', allowed: allowed('prep') });
  assert.deepEqual(v.pass.map(p => p.id), ['name']);
  assert.deepEqual(v.fail.map(f => f.id), ['logo', 'color']);
  assert.equal(P.view(st, { name: 'Chuẩn bị', ready: false }).title, 'Chuẩn bị · đang đọc…');
  const full = P.view({ step: 'ship', score: 100, tasks: [{ id: 'export', label: 'X', done: true }] }, { name: 'Xuất và đăng' });
  assert.equal(full.tone, 'full'); assert.equal(full.fail.length, 0);
});

test('mục → việc Hỏi Claude: mọi việc trong bảng ASK có trong phạm vi của bước; tham số qua checkPick không bị đổi', () => {
  for (const [step, m] of Object.entries(P.ASK)) {
    const ids = allowed(step), sc = AC.scopeOf({ step });
    for (const [id, [action, params]] of Object.entries(m)) {
      assert.ok(ids.includes(action), `${step}.${id} → ${action} phải có trong AskCore.actionsOf của bước`);
      const pick = AC.checkPick({ action, params }, sc);
      assert.equal(pick.action, action); assert.deepEqual(pick.warnings, []);
      for (const [k, v] of Object.entries(params)) assert.equal(pick.params[k], v);
    }
  }
  // id tiêu chí trong bảng phải là id thật của ScoreCore (đổi tên ở đó thì test đỏ)
  const all = SC.score({ tl: { ads: { on: true }, burnin: {} }, needs: ['broll', 'music'], burn: { found: true } }).steps;
  for (const [step, m] of Object.entries(P.ASK)) for (const id of Object.keys(m)) assert.ok(all[step].items.some(i => i.id === id), `${step}.${id}`);
});

test('mục → việc Hỏi Claude hoặc mở chỗ sửa', () => {
  assert.equal(P.askOf('source', 'clean', allowed('source')).action, 'clean_speech');
  assert.equal(P.askOf('build', 'music', allowed('build')).params.mode, 'sfx');
  assert.equal(P.askOf('check', 'quick', allowed('check')).action, 'qc_fix_all');
  assert.equal(P.askOf('prep', 'logo', allowed('prep')), null, 'logo phải tự tải: mở chỗ sửa');
  assert.equal(P.askOf('ship', 'export', allowed('ship')), null);
  assert.equal(P.askOf('check', 'quick', []), null, 'thanh Hỏi Claude chưa có (allowed rỗng) → mở chỗ sửa');
  const v = P.view(stateOf({ tl: {} }, 'source'), { allowed: allowed('source') });
  assert.equal(v.fail.find(f => f.id === 'clean').ask.action, 'clean_speech');
  assert.equal(v.fail.find(f => f.id === 'video').ask, null);
});

test('giao diện nối đúng: thanh bước có popover aria-describedby + Esc; tab Dự án bỏ hẳn (S24 M174), giữ C17', () => {
  const UI = read('studio/features/03_stepscore.js'), NS = read('studio/features/03_nextstep.js'), ASK = read('studio/features/75_ask.js'), CSS = read('studio/studio.css');
  assert.match(UI, /setAttribute\('aria-describedby', 'wf-sp-sum'\)/);
  assert.match(UI, /e\.key === 'Escape'/);
  assert.match(UI, /S\.ask\.run\(f\.ask\.action, f\.ask\.params, step\)/);
  assert.match(UI, /S\.nextStep\.fix\(t\)\(\)/);
  assert.match(UI, /#wf-steps button\[data-step\]/);
  assert.ok(!NS.includes('data-ns-step'), 'không còn dải chip 5 bước');
  assert.ok(!NS.includes('ns-bar'), 'không còn thanh tiến độ');
  assert.ok(!NS.includes("data-ns-i") && !NS.includes('data-ns="go"'), 'M174: không còn danh sách việc + nút Sang bước ở cột phải');
  assert.match(NS, /list\(st, 'data-nsx-i', true\)/, 'hộp cảnh báo Xuất vẫn liệt kê chỗ thiếu');
  assert.match(NS, /async function guardExport\(\)/, 'giữ cảnh báo Xuất C17');
  assert.match(NS, /S\.nextStep = \{[^}]*\bfix\b[^}]*_paint: onPaint/);
  assert.match(ASK, /S\.ask = \{ open, run,/);
  assert.match(CSS, /\/\* S23 M164[\s\S]*#wf-steps button b\.sp-ring::after/);
  assert.match(CSS, /@media \(max-width: 1180px\) \{ #wf-steps button span \{ display: none; \}/);
  // thứ tự nạp (server đọc features theo tên): lõi trước giao diện, sau 02_score.core / 03_nextstep
  const F = fs.readdirSync(path.join(ROOT, 'studio/features')).filter(f => f.endsWith('.js')).sort();
  assert.ok(F.indexOf('02_score.core.js') < F.indexOf('03_nextstep.js') && F.indexOf('03_nextstep.js') < F.indexOf('03_stepscore.core.js') && F.indexOf('03_stepscore.core.js') < F.indexOf('03_stepscore.js'));
});
