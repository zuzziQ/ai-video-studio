#!/usr/bin/env node
// check_studio_tokens.mjs — Guard (M81): the Studio UI takes its colours from studio/theme/tokens.css.
//
// Based on the hub's D:/ai/templates/design-system/check-design-tokens.mjs, but with a BASELINE: the Studio still has
// ~300 colours written into studio.css and the CSS-in-JS of studio/features/*.js (moved onto tokens in M85), so
// instead of failing on every one it counts, per file, and fails when a count goes UP.
//
// COUNTS, in studio/**/*.{css,js,mjs,html} (studio/vendor and studio/thumbs skipped, studio/theme/tokens.css exempt):
//   - color: a literal colour, i.e. a hex (#0620B6, #fff, #0620B6cc) or rgb()/rgba()/hsl()/hsla() with a number inside.
//            rgb(var(--color-accent) / .2) is a token and does not count;
//   - style: an inline `style="` attribute (layout belongs in a class).
// A line with a `design-token-ok` comment is skipped (one valid exception, say why next to it).
//
// FAILS (exit 1) when a file has more of either than scripts/studio_tokens_baseline.json allows. A file missing from
// the baseline is allowed 0, so new files (new features) must use tokens and classes from the start.
//
// Run:  node scripts/check_studio_tokens.mjs            check against the baseline
//       node scripts/check_studio_tokens.mjs --write    rewrite the baseline (only to LOWER it after moving CSS onto
//                                                       tokens; a PR that raises it needs the owner's OK)
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE_FILE = join(ROOT, 'scripts', 'studio_tokens_baseline.json');
const TOKENS_FILE = 'studio/theme/tokens.css';
const SKIP_DIR = new Set(['vendor', 'thumbs', 'node_modules']);
const EXTS = new Set(['.css', '.js', '.mjs', '.html']);

// A hex colour not glued to a word, an entity (&#123;) or a URL fragment; 3, 4, 6 or 8 digits.
const HEX = /(?<![\w&/#-])#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3,4})(?![\w-])/g;
const FUNC = /\b(?:rgba?|hsla?)\(\s*[\d.]/g;
const STYLE = /\bstyle="/g;

/** Counts for one file's text. */
export function countText(text) {
  let color = 0, style = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.includes('design-token-ok')) continue;
    color += (line.match(HEX) || []).length + (line.match(FUNC) || []).length;
    style += (line.match(STYLE) || []).length;
  }
  return { color, style };
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!SKIP_DIR.has(name)) walk(p, out); }
    else if (EXTS.has(extname(name))) out.push(p);
  }
  return out;
}

/** { 'studio/x.css': { color, style } } for every scanned file with a non-zero count, sorted by path. */
export function scan(root = ROOT) {
  const result = {};
  for (const f of walk(join(root, 'studio'), []).sort()) {
    const rel = relative(root, f).split('\\').join('/');
    if (rel === TOKENS_FILE) continue;
    const c = countText(readFileSync(f, 'utf8'));
    if (c.color || c.style) result[rel] = c;
  }
  return result;
}

/** Lines describing every count above the baseline (empty = pass). */
export function compare(current, baseline) {
  const out = [];
  for (const [file, c] of Object.entries(current)) {
    const b = baseline[file] || { color: 0, style: 0 };
    for (const k of ['color', 'style']) {
      if (c[k] > (b[k] || 0)) out.push(`${file}: ${k} ${b[k] || 0} -> ${c[k]} (+${c[k] - (b[k] || 0)})`);
    }
  }
  return out;
}

export function totals(counts) {
  return Object.values(counts).reduce((t, c) => ({ color: t.color + c.color, style: t.style + c.style }), { color: 0, style: 0 });
}

function main() {
  const current = scan();
  const t = totals(current);
  if (process.argv.includes('--write')) {
    writeFileSync(BASELINE_FILE, JSON.stringify({ _note: 'Mốc của scripts/check_studio_tokens.mjs (M81): chỉ được giảm.', total: t, files: current }, null, 2) + '\n');
    console.log(`[OK] baseline written: ${t.color} colours, ${t.style} style="" in ${Object.keys(current).length} files.`);
    return;
  }
  const base = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
  const up = compare(current, base.files || {});
  const bt = base.total || totals(base.files || {});
  if (up.length === 0) {
    const lower = t.color < bt.color || t.style < bt.style;
    console.log(`[OK] check_studio_tokens: ${t.color} colours (baseline ${bt.color}), ${t.style} style="" (baseline ${bt.style}).` +
      (lower ? ' Below the baseline: lower it with --write in this PR.' : ''));
    return;
  }
  for (const line of up) console.error(`[x] ${line}`);
  console.error(`check_studio_tokens: ${up.length} count(s) went up. Use the tokens of ${TOKENS_FILE} (rgb(var(--color-...))) and the ` +
    'ui- classes of studio/theme/components.css instead of raw colours and style="".');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
