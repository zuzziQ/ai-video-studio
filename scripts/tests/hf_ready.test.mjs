// M57: engine/hf.js must wait for HyperFrames blocks that publish buildReady as { [block]: Promise } (3D fonts/models built
// async); Promise.all on the plain object resolved at once, so frames were captured before the block was built.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const hfDir = path.join(root, 'engine', 'hf');

test('M57: hf.js chờ từng promise của buildReady dạng object', () => {
  const keyed = fs.readdirSync(hfDir).filter(b => {
    const f = path.join(hfDir, b, 'index.html');
    return fs.existsSync(f) && /buildReady\[["'][\w-]+["']\]\s*=/.test(fs.readFileSync(f, 'utf8'));
  });
  assert.ok(keyed.length > 0, 'không còn khối nào dùng buildReady dạng object');
  const src = fs.readFileSync(path.join(root, 'engine', 'hf.js'), 'utf8');
  assert.match(src, /Object\.values\(br \|\| \{\}\)/, 'hf.js phải chờ Object.values(buildReady)');
  assert.doesNotMatch(src, /Promise\.all\(\[d\.fonts\?\.ready, w\.__hf\?\.buildReady\]\)/);
});

// M57: some blocks assign buildReady only inside their module script, after a top-level await (font/model fetch), so the
// iframe's load event can fire before it exists; hf.js then seeked at once and the block's warm-up draws (other times)
// landed in the first captured frame (wireframe-portal-title showed its replacement phrase at t=1.6 s).
test('M57: hf.js chờ khối gán buildReady muộn trong module script', () => {
  const late = fs.readdirSync(hfDir).filter(b => {
    const f = path.join(hfDir, b, 'index.html');
    if (!fs.existsSync(f)) return false;
    const scripts = [...fs.readFileSync(f, 'utf8').matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    const sets = scripts.filter(m => /buildReady\[["'][\w-]+["']\]\s*=/.test(m[2]));
    return sets.length > 0 && sets.every(m => /type=["']module["']/.test(m[1]));
  });
  assert.ok(late.includes('wireframe-portal-title'), `khối gán buildReady trong module: ${late.join(', ')}`);
  const src = fs.readFileSync(path.join(root, 'engine', 'hf.js'), 'utf8');
  assert.match(src, /s\.text\.includes\('buildReady'\)/, 'hf.js phải nhận ra khối có buildReady qua nội dung script');
  assert.match(src, /!hasBuild\(w\) && performance\.now\(\) - t0 < 8000/, 'hf.js phải chờ buildReady xuất hiện (trần 8 s) trước khi seek');
});

// M52 (sửa kèm): hf_import.mjs (ảnh xem trước khi nhập khối) chờ buildReady như một promise (`r?.then`) nên bỏ qua dạng
// { [block]: Promise } và khối gán muộn; nay chờ giống engine/hf.js.
test('M57: hf_import.mjs chờ buildReady dạng object và gán muộn như hf.js', () => {
  const src = fs.readFileSync(path.join(root, 'scripts', 'hf_import.mjs'), 'utf8');
  assert.doesNotMatch(src, /if \(r\?\.then\) await Promise\.race\(\[r,/, 'không còn chỉ chờ buildReady khi nó là promise');
  assert.match(src, /s\.text\.includes\('buildReady'\)/, 'phải nhận ra khối có buildReady qua nội dung script');
  assert.match(src, /Object\.values\(br \|\| \{\}\)/, 'phải chờ mọi promise trong buildReady');
});
