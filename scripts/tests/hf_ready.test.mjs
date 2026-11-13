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
