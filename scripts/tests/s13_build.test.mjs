// Test S13 M108: bước Dựng một nút "AI dựng" (bảng PANELS / GROUPS của studio/features/01_workflow.js), Tự lái ra khỏi
// bước Dựng thành màn hàng đợi riêng mở từ nút trên thanh đầu (C15), hai tuỳ chọn chạy nối sau AI dựng (80_autofill.js).
// Chạy: node --test scripts/tests/s13_build.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = f => fs.readFileSync(new URL(`../../studio/features/${f}`, import.meta.url), 'utf8');
const WF = read('01_workflow.js');
const lit = (src, name, open, close) => {
  const i = src.indexOf(`const ${name} = ${open}`); assert.ok(i >= 0, name);
  let d = 0, j = src.indexOf(open, i);
  for (let k = j; k < src.length; k++) { if (src[k] === open) d++; else if (src[k] === close && !--d) return Function(`return ${src.slice(j, k + 1)}`)(); }
  throw new Error('unclosed ' + name);
};
const PANELS = lit(WF, 'PANELS', '{', '}'), GROUPS = lit(WF, 'GROUPS', '[', ']'), TOPS = lit(WF, 'TOPS', '{', '}');
const groupOf = id => GROUPS.find(g => g.tabs.some(t => t[0] === id));

test('bước Dựng: AI dựng là một mục riêng, đứng đầu, không còn nhóm 3 tab Dựng nhanh AI', () => {
  assert.deepEqual(PANELS['wf-aihelp'], ['build', 1]);
  assert.equal(groupOf('wf-aihelp'), undefined);
  assert.equal(GROUPS.find(g => g.id === 'quick'), undefined);
  const build = Object.entries(PANELS).filter(([, v]) => v[0] === 'build').sort((a, b) => a[1][1] - b[1][1]);
  assert.equal(build[0][0], 'wf-aihelp');
  assert.equal(build.filter(([, v]) => v[1] === 1).length, 1, 'chỉ một mục thứ tự 1 ở bước Dựng');
});

test('Tự động (tuỳ chỉnh b-roll + âm thanh) là tab của mục B-roll', () => {
  assert.equal(groupOf('autofill')?.id, 'broll');
  assert.equal(PANELS.autofill[0], 'build');
});

test('C15: Tự lái không thuộc bước nào trên thanh bước, nút giữ trên thanh đầu', () => {
  assert.equal(PANELS.autopilot[0], 'queue');
  assert.equal(groupOf('autopilot'), undefined);
  assert.equal(TOPS['ap-topbtn'], 'bar');
  assert.match(WF, /stepIds = \[\.\.\.STEPS\.map\(s => s\[0\]\), 'settings', 'queue'\]/);
  assert.doesNotMatch(WF.match(/const STEPS = [^;]+;/)[0], /queue/);
});

test('hai tuỳ chọn Thêm b-roll / Thêm âm thanh chọn đúng chế độ Tự động', () => {
  const AF = read('80_autofill.js');
  const body = AF.match(/const afterMode = \(\) => ([^;]+);/)[1];
  const mode = (ai_broll, ai_sfx) => Function('O', `return ${body}`)({ ai_broll, ai_sfx });
  assert.equal(mode(true, true), 'all'); assert.equal(mode(true, false), 'broll');
  assert.equal(mode(false, true), 'sfx'); assert.equal(mode(false, false), '');
  const AI = read('20_ai.js');
  assert.match(AI, /S\.autofill\.run\(af, \{ noUndo: true \}\)/, 'chạy nối trong cùng bước hoàn tác');
  assert.match(AI, /showResult\(plan, /, 'xong mở hộp Đã dựng xong (QC nhanh M105)');
});
