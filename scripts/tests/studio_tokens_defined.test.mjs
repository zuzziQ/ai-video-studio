// M85: the Studio shell takes every value from studio/theme/tokens.css. A misspelt custom property is dropped by the
// browser without a word, and check_studio_tokens.mjs only counts raw colours, so this test checks that each var(--x)
// used by the shell files (and by the features, for the old alias names) is defined somewhere in the Studio's CSS
// or set from JS, and that the lock page of server.mjs carries the same values as tokens.css.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../check_studio_tokens.mjs';

const read = rel => readFileSync(join(ROOT, rel), 'utf8');
const SHELL = ['studio/studio.css', 'studio/studio.js', 'studio/library.js', 'studio/features/00_author.js', 'studio/theme/components.css'];
const FEATURES = readdirSync(join(ROOT, 'studio/features')).filter(f => f.endsWith('.js')).map(f => 'studio/features/' + f);
// Set inside the engine iframe (fonts the video uses), not by the Studio's CSS.
const ENGINE = new Set(['--sans', '--disp']);

function defined() {
  const names = new Set();
  const files = ['studio/theme/tokens.css', 'studio/theme/components.css', 'studio/studio.css', ...FEATURES, 'studio/studio.js', 'studio/library.js'];
  for (const f of files) {
    const t = read(f);
    for (const m of t.matchAll(/(--[\w-]+)\s*:/g)) names.add(m[1]);                       // --x: value (CSS or CSS-in-JS)
    for (const m of t.matchAll(/setProperty\(\s*'(--[\w-]+)'/g)) names.add(m[1]);         // el.style.setProperty('--x', …)
  }
  return names;
}

const used = text => [...text.matchAll(/var\(\s*(--[\w-]*\w)\s*[,)]/g)].map(m => m[1]); // "var(--color-...)" in a comment is not a use

test('every var(--x) of the Studio shell is defined (tokens, components, studio.css or set from JS)', () => {
  const names = defined(), missing = [];
  for (const f of SHELL) for (const v of new Set(used(read(f)))) if (!names.has(v) && !ENGINE.has(v)) missing.push(`${f}: ${v}`);
  assert.deepEqual(missing, []);
});

test('old alias names still used by the features (M86/M87) are defined in tokens.css', () => {
  const tokens = read('studio/theme/tokens.css'), missing = [];
  const OLD = /^--(bg[0-4]|line[23]?|tx[23]?|acc(2|-soft|-line)?|ok|warn|bad|wave|ph|t-\w+|ui|mono|rs?)$/;
  for (const f of FEATURES) for (const v of new Set(used(read(f)))) if (OLD.test(v) && !new RegExp(`${v}\\s*:`).test(tokens)) missing.push(`${f}: ${v}`);
  assert.deepEqual(missing, []);
});

test('the lock page of server.mjs copies its colours from tokens.css', () => {
  const tokens = read('studio/theme/tokens.css'), server = read('studio/server.mjs');
  const block = server.match(/const LOCKED_CSS = `([\s\S]*?)`;/)?.[1];
  assert.ok(block, 'LOCKED_CSS not found');
  const tok = name => { // resolve one level of var(): --color-fg: var(--neutral-50) -> "248 250 252"
    let v = tokens.match(new RegExp(`\\n\\s*${name}:\\s*([^;]+);`))?.[1].trim();
    const ref = v?.match(/^var\((--[\w-]+)\)$/)?.[1];
    if (ref) v = tokens.match(new RegExp(`\\n\\s*${ref}:\\s*([^;]+);`))?.[1].trim();
    return v;
  };
  for (const m of block.matchAll(/(--color-[\w-]+):\s*([\d ]+);/g)) assert.equal(m[2].trim(), tok(m[1]), m[1]);
});
