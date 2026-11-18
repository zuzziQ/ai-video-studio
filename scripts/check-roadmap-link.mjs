#!/usr/bin/env node
// Every PR that changes code says which roadmap item it moves, or that it is
// work outside the plan. A PR naming an item updates its state in the same PR:
// docs/ROADMAP.md, or the plan that item links to (plans/<dir>/, the phase
// table). Work outside the plan needs no file: the tracker reads the line from
// the PR body. Keeping ROADMAP optional for most PRs keeps it from becoming the
// file every open PR conflicts on.
//
//   node scripts/check-roadmap-link.mjs --body-file body.md --base origin/main [--title "..."] [--author dependabot[bot]]
//
// A line in the PR body, either of:
//   Roadmap: S01, M05, M157  IDs as written in docs/ROADMAP.md (**`S01`**, **`M157`**)
//   Phát sinh: <why>         work that no roadmap item planned
// Exit code 0 = ok, 1 = missing or wrong, 2 = usage error.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROADMAP = 'docs/ROADMAP.md';

// A PR touching only these is a docs PR. Same pattern as code-rag-mcp doc_impact.js (isDocFile).
export const DOCS_ONLY = /^(docs|plans|\.rag|\.devmem|\.claude|\.agents)\/|\.md$/i;
// Dependency bumps move no roadmap item.
const EXEMPT_TITLE = /^(chore|build|ci)\(deps[^)]*\)!?:/;
const EXEMPT_AUTHOR = /\[bot\]$/;

const ROADMAP_LINE = /^[ \t>*-]*(?:Roadmap|Lộ trình)\s*:\s*(.+)$/im;
const OUTSIDE_LINE = /^[ \t>*-]*Phát sinh\s*:\s*(\S.*)$/im;
// Two or three digits: S01, M05, M157 (the roadmap passed M99 in S12).
const ID = /\b[A-Z]\d{2,3}\b/g;

/** IDs the roadmap defines, written as **`S01`** or **`M157`**. */
export function roadmapIds(text) {
  return new Set([...String(text).matchAll(/\*\*`([A-Z]\d{2,3})`\*\*/g)].map((m) => m[1]));
}

/** The plan folder each roadmap item links to: { S01: "plans/261028-1200-parent-topics/" }. */
export function planDirs(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const id = line.match(/\*\*`([A-Z]\d{2,3})`\*\*/)?.[1];
    const dir = line.match(/\((?:\.\.\/|\/)?(plans\/[^/)\s]+\/)/)?.[1];
    if (id && dir) out[id] = dir;
  }
  return out;
}

/**
 * @param {{ body: string, files: string[], roadmap: string, title?: string, author?: string }} pr
 * @returns {{ ok: true, skipped?: string, ids?: string[], outside?: string } | { ok: false, reason: string }}
 */
export function checkRoadmapLink({ body, files, roadmap, title = '', author = '' }) {
  if (EXEMPT_AUTHOR.test(author)) return { ok: true, skipped: `author ${author}` };
  if (EXEMPT_TITLE.test(title)) return { ok: true, skipped: 'dependency bump' };
  if (!files.some((f) => !DOCS_ONLY.test(f))) return { ok: true, skipped: 'docs-only PR' };

  const text = String(body ?? '');
  const outside = text.match(OUTSIDE_LINE)?.[1].trim();
  const named = text.match(ROADMAP_LINE)?.[1] ?? '';
  const known = roadmapIds(roadmap);
  // Only letters the roadmap uses as an ID prefix (S, M, C…): "H264" or "A11" on the line are words, not items.
  const prefixes = new Set([...known].map((id) => id[0]));
  const ids = [...new Set(named.match(ID) ?? [])].filter((id) => prefixes.has(id[0]));
  if (!ids.length && !outside) {
    return {
      ok: false,
      reason:
        'the PR body names no roadmap item. Add a line "Roadmap: <ID>" with the ID from docs/ROADMAP.md ' +
        '(e.g. "Roadmap: S01"), or "Phát sinh: <why>" for work outside the plan',
    };
  }
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) {
    return { ok: false, reason: `${unknown.join(', ')} is not an item of docs/ROADMAP.md (add it there, or fix the ID)` };
  }
  if (ids.length) {
    const dirs = planDirs(roadmap);
    const plans = ids.map((id) => dirs[id]).filter(Boolean);
    if (!files.includes(ROADMAP) && !files.some((f) => plans.some((d) => f.startsWith(d)))) {
      const where = plans.length ? `docs/ROADMAP.md or ${plans.join(', ')} (its phase table)` : 'docs/ROADMAP.md';
      return { ok: false, reason: `the PR moves ${ids.join(', ')} but changes neither ${where}: mark the state of the item or its phase` };
    }
  }
  return { ok: true, ids, outside };
}

function changedFiles(base) {
  return execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean);
}

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const bodyFile = arg('--body-file');
  const base = arg('--base');
  if (!bodyFile || !base) {
    console.error('usage: check-roadmap-link.mjs --body-file <file> --base <ref> [--title <t>] [--author <login>]');
    return 2;
  }
  const r = checkRoadmapLink({
    body: readFileSync(bodyFile, 'utf8'),
    files: changedFiles(base),
    roadmap: readFileSync(ROADMAP, 'utf8'),
    title: arg('--title') ?? '',
    author: arg('--author') ?? '',
  });
  if (!r.ok) {
    console.error(`roadmap link: ${r.reason}`);
    return 1;
  }
  console.log(
    r.skipped ? `roadmap link: not needed (${r.skipped})` : `roadmap link: ${r.ids?.length ? r.ids.join(', ') : `phát sinh (${r.outside})`}`,
  );
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
