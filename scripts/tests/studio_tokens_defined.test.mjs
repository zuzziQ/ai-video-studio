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
const SHELL = ['studio/studio.css', 'studio/studio.js', 'studio/library.js', 'studio/theme/components.css'];
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

// S25 M177: light theme = the same ROLE names with other values. Every name the light block sets must exist in the dark
// :root block (a typo there would silently leave the dark value), and the block only overrides roles and shadows.
test('the light theme only overrides roles that the dark :root block defines', () => {
  const tokens = read('studio/theme/tokens.css');
  const dark = tokens.match(/\n:root \{([\s\S]*?)\n\}/)?.[1];
  const light = tokens.match(/:root\[data-theme="light"\] \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(dark && light, 'dark :root or light block not found');
  const names = t => [...t.matchAll(/\n\s*(--[\w-]+)\s*:/g)].map(m => m[1]);
  const darkSet = new Set(names(dark)), bad = [];
  for (const n of names(light)) {
    if (!darkSet.has(n)) bad.push(`${n}: not in the dark block`);
    else if (!/^--(color|shadow)-/.test(n)) bad.push(`${n}: not a role (palette, size and stage tokens do not change with the theme)`);
  }
  assert.deepEqual(bad, []);
  assert.match(light, /color-scheme:\s*light/);
  for (const keep of ['--stage-bg', '--track-1', '--color-fg-on-media']) assert.ok(!names(light).includes(keep), `${keep} must not change with the theme`);
});

test('index.html and ui.html run theme-boot.js before the first stylesheet (no flash of the wrong theme)', () => {
  for (const f of ['studio/index.html', 'studio/ui.html']) {
    const html = read(f), boot = html.indexOf('/studio/theme/theme-boot.js'), css = html.indexOf('rel="stylesheet"');
    assert.ok(boot > 0 && boot < css, `${f}: theme-boot.js must come before the stylesheets`);
    assert.doesNotMatch(html.slice(html.lastIndexOf('<script', boot), boot + 40), /\b(defer|async)\b/, `${f}: theme-boot.js must load synchronously`);
  }
});

test('theme-boot.js: system by default, remembers light / dark, toggle switches the resolved mode', async () => {
  const { runInNewContext } = await import('node:vm');
  const src = read('studio/theme/theme-boot.js');
  const boot = (stored, systemDark) => {
    const ls = new Map(stored ? [['avs.theme', stored]] : []), attrs = {}, events = [];
    const ctx = {
      localStorage: { getItem: k => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
      document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: k => attrs[k] ?? null }, dispatchEvent: e => events.push(e.type) },
      CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o?.detail; } },
      addEventListener() {},
    };
    ctx.window = ctx;
    ctx.matchMedia = () => ({ matches: systemDark, addEventListener() {} });
    runInNewContext(src, ctx);
    return { T: ctx.AVSTheme, attrs, ls, events };
  };
  let b = boot(null, true);
  assert.equal(b.T.pref, 'system'); assert.equal(b.attrs['data-theme'], 'dark');
  b = boot(null, false);
  assert.equal(b.attrs['data-theme'], 'light');
  b = boot('dark', false);
  assert.equal(b.attrs['data-theme'], 'dark');
  b = boot('nonsense', true);
  assert.equal(b.T.pref, 'system');
  b = boot(null, true);
  b.T.toggle();
  assert.equal(b.T.pref, 'light'); assert.equal(b.attrs['data-theme'], 'light'); assert.equal(b.ls.get('avs.theme'), 'light');
  assert.ok(b.events.includes('avs:theme'));
  b.T.set('system');
  assert.equal(b.ls.has('avs.theme'), false); assert.equal(b.attrs['data-theme'], 'dark');
});

test('the lock page of server.mjs copies its light colours from the light block of tokens.css', () => {
  const tokens = read('studio/theme/tokens.css'), server = read('studio/server.mjs');
  const block = server.match(/const LOCKED_LIGHT = `([\s\S]*?)`;/)?.[1];
  const light = tokens.match(/:root\[data-theme="light"\] \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(block && light, 'LOCKED_LIGHT or the light block not found');
  const val = (src, name) => { // one level of var(): --color-fg: var(--neutral-900) -> palette value from the dark :root
    let v = src.match(new RegExp(`\\n\\s*${name}:\\s*([^;]+);`))?.[1].trim();
    const ref = v?.match(/^var\((--[\w-]+)\)$/)?.[1];
    if (ref) v = tokens.match(new RegExp(`\\n\\s*${ref}:\\s*([^;]+);`))?.[1].trim();
    return v;
  };
  const pairs = [...block.matchAll(/(--color-[\w-]+):\s*([\d ]+);/g)];
  assert.ok(pairs.length >= 4);
  for (const m of pairs) assert.equal(m[2].trim(), val('\n' + light, m[1]), m[1]);
  assert.match(server, /@media not \(prefers-color-scheme: dark\) \{ :root:not\(\[data-theme="dark"\]\)/, 'lock page: same rule as theme-boot.js (light unless the system says dark)');
});

test('theme-boot.js: switching theme turns transitions off for two frames (.avs-theme-sw), not on first paint', async () => {
  const { runInNewContext } = await import('node:vm');
  const cls = new Set(), frames = [], attrs = {};
  const ctx = {
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { documentElement: { classList: { add: c => cls.add(c), remove: c => cls.delete(c) }, setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: k => attrs[k] ?? null }, dispatchEvent() {} },
    CustomEvent: class { constructor(type) { this.type = type; } },
    addEventListener() {},
    requestAnimationFrame: f => frames.push(f),
    matchMedia: () => ({ matches: true, addEventListener() {} }),
  };
  ctx.window = ctx;
  runInNewContext(read('studio/theme/theme-boot.js'), ctx);
  assert.equal(cls.has('avs-theme-sw'), false, 'first paint must not touch transitions');
  ctx.AVSTheme.toggle();
  assert.equal(cls.has('avs-theme-sw'), true);
  frames.shift()(); assert.equal(cls.has('avs-theme-sw'), true, 'still off after one frame');
  frames.shift()(); assert.equal(cls.has('avs-theme-sw'), false, 'back on after two frames');
  assert.match(read('studio/theme/tokens.css'), /:root\.avs-theme-sw \*[^{]*\{ transition: none !important; \}/);
});
