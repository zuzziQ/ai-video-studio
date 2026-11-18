// S24 M172 (C36): Thuộc tính chỉ chỉnh tay — không còn mục "Hỏi Claude" của element (72_elem_ai.js) và ✦ trên thanh nổi
// (66_canvas_cmds.js); một nút "Hỏi Claude về mục này" đầu thân Thuộc tính mở tab Claude (Studio.ask.open, chip theo S.sel);
// luồng bản vá / 3 biến thể của M149 gọi từ việc element của tab Claude. Chạy: node --test scripts/tests/s24_m172.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const req = createRequire(import.meta.url);
const L = req('../../studio/features/01_level.core.js');
const SC = req('../../studio/features/68_sections.core.js');
const AC = req('../../studio/features/75_ask.core.js');

test('72_elem_ai.js không thêm mục nào vào Thuộc tính, vẫn cho tab Claude Studio.elemAi', () => {
  const f = read('studio/features/72_elem_ai.js');
  assert.doesNotMatch(f, /\['ai', 'Hỏi Claude'/);
  assert.doesNotMatch(f, /data-askopen/);
  const hook = f.slice(f.indexOf('S.addInspectorTab('));
  assert.match(hook.slice(0, hook.indexOf('});')), /return null;/, 'hook chỉ bỏ kết quả cũ khi đổi element');
  assert.match(f, /S\.elemAi = \{ go, html, cancel, knobsOk/);
});

test('thanh nổi không còn ✦ Hỏi Claude', () => {
  const f = read('studio/features/66_canvas_cmds.js');
  assert.doesNotMatch(f, /btn\('ask'/);
  assert.doesNotMatch(f, /case 'ask'/);
  assert.doesNotMatch(f, /S\.ask\?\.open/);
});

test('nút "Hỏi Claude về mục này" đầu thân Thuộc tính, gọi Studio.ask.open, không ở đầu inspector', () => {
  const s = read('studio/studio.js');
  assert.match(s, /<div class="ibody">\$\{askRow\(c\)\}/);
  assert.match(s, /const askRow = c => \(Studio\.ask && \(c\.kind === 'clip' \|\| window\.AskCore\?\.ELEM_KINDS\?\.includes\(c\.kind\)\)/);
  assert.match(s, /class="iask" data-act="ask"[^`]*Hỏi Claude về mục này/);
  assert.match(s, /if \(a === 'ask'\) Studio\.ask\?\.open\(\);/);
  const head = s.slice(s.indexOf('<div class="ihbtn">'), s.indexOf('<div class="ibody">'));
  assert.doesNotMatch(head, /data-act="ask"/, 'đầu inspector không còn ✦ riêng');
  assert.match(read('studio/studio.css'), /\/\* S24 M172[^]*#insp \.iask \{/);
});

test('bảng mục Thuộc tính theo mức không còn Hỏi Claude', () => {
  assert.deepEqual(L.BASIC_SECS, ['knobs']);
  assert.equal(SC.ICON.ai, undefined);
  const secs = SC.normalize([['basic', 'Cơ bản'], ['anim', 'Hoạt ảnh'], ['knobs', 'Núm']]);
  assert.deepEqual(L.splitSections(secs, 'basic').main.map(s => s.key), ['knobs', 'basic']);
});

test('tab Claude: phạm vi element có gợi ý nhanh và "3 biến thể" nối vào luồng M149', () => {
  const sc = AC.scopeOf({ step: 'build', sel: { kind: 'line', cid: 'c1', label: 'Tiêu đề', text: 'Xin chào', t0: 1, t1: 3, knobs: true } });
  assert.equal(sc.kind, 'elem');
  const ids = AC.actionsOf(sc).map(a => a.id);
  for (const id of ['elem_edit', 'elem_variants', 'elem_knobs']) assert.ok(ids.includes(id), id);
  const q = AC.quickOf(sc).map(x => x.action);
  assert.ok(q.includes('elem_variants') && q.includes('elem_edit'));
  const clip = AC.scopeOf({ step: 'build', sel: { kind: 'clip', cid: 'v1', idx: 0, t0: 0, t1: 4 } });
  assert.equal(clip.kind, 'clip');
  const ask = read('studio/features/75_ask.js');
  assert.match(ask, /return S\.elemAi\.go\(pick\.action === 'elem_edit' \? 'edit' : pick\.action === 'elem_variants' \? 'variants' : 'knobs'/);
});
