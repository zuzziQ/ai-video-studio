// Test M81: lint token của Studio (scripts/check_studio_tokens.mjs). Chạy: node --test scripts/tests/studio_tokens.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { countText, scan, compare, totals, ROOT, BASELINE_FILE } from '../check_studio_tokens.mjs';

test('đếm màu viết cứng: hex 3/4/6/8 số, rgb/rgba/hsl có số', () => {
  const css = `.a { color: #fff; background: #0620B6; border-color: #0620B6cc; }
.b { box-shadow: 0 0 0 1px rgba(0,0,0,.4); color: hsl(220 50% 40%); fill: #abcd; }`;
  assert.deepEqual(countText(css), { color: 6, style: 0 });
});

test('token không bị đếm: rgb(var(--…)), var(--acc), id #top, entity, URL', () => {
  const txt = `.a { color: rgb(var(--color-accent) / .2); background: var(--acc); }
document.querySelector('#top'); el.innerHTML = '&#123;'; a.href = 'x.html#abc';
#lib .x, #rail button { color: rgb(var(--color-fg)); }`;
  assert.deepEqual(countText(txt), { color: 0, style: 0 });
});

test('đếm style="" và bỏ qua dòng design-token-ok', () => {
  const html = `<div style="color:red"></div><i style="font-size:12px"></i>
<b style="color:#fff"></b> <!-- design-token-ok: preview màu người dùng chọn -->`;
  assert.deepEqual(countText(html), { color: 0, style: 2 });
});

test('compare: tăng thì báo, giảm hoặc bằng thì qua, file mới chỉ được 0', () => {
  const base = { 'studio/a.css': { color: 3, style: 1 } };
  assert.deepEqual(compare({ 'studio/a.css': { color: 2, style: 1 } }, base), []);
  assert.equal(compare({ 'studio/a.css': { color: 4, style: 1 } }, base).length, 1);
  assert.match(compare({ 'studio/new.js': { color: 0, style: 1 } }, base)[0], /studio\/new\.js: style 0 -> 1/);
  assert.deepEqual(totals({ a: { color: 1, style: 2 }, b: { color: 3, style: 0 } }), { color: 4, style: 2 });
});

test('scan: bỏ tokens.css và vendor, chỉ giữ file có số đếm', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-tokens-'));
  try {
    const w = (p, s) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), s); };
    w('studio/theme/tokens.css', ':root { --x: #ffffff; }');
    w('studio/vendor/lib.css', '.v { color: #000; }');
    w('studio/a.css', '.a { color: #000; }');
    w('studio/clean.js', 'const a = 1;');
    assert.deepEqual(scan(dir), { 'studio/a.css': { color: 1, style: 0 } });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('repo hiện tại không vượt mốc, và tokens.css không chứa màu tím cũ', () => {
  const base = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  assert.deepEqual(compare(scan(), base.files), []);
  const tokens = fs.readFileSync(path.join(ROOT, 'studio/theme/tokens.css'), 'utf8');
  assert.ok(!/139 123 255|8B7BFF/i.test(tokens));
  assert.match(tokens, /--color-accent: var\(--navy-600\)/);
});
