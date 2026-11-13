// Source pins of the knowledge pack. A chunk or a guardrail is a summary written by hand; the text it was written
// from (a section of CLAUDE.md or an ADR, a range of lines in the code) can change under it without any test noticing,
// because the existence checks only see that the file and the line numbers are still there. A pin records a short hash of the
// cited text, so `sync.js --check` can say "this text changed, re-read the rule" (or "this range moved, fix the lines").
//
// Two kinds of ref:
//   { file, section: "Heading text" }  a markdown section (heading to the next heading of the same or higher level).
//                                      Found by heading, so text added elsewhere in the file never disturbs it.
//   { file, lines: "12-40" }           a line range (code, yml, sh). If the hash no longer matches but the same text
//                                      sits at other lines, it is reported as "moved" with the new range.
// Plain node, no dependency: it runs in CI without the engine.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const normalize = (text) =>
  text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();

export const hashText = (text) => createHash("sha256").update(normalize(text)).digest("hex").slice(0, 12);

const splitLines = (text) => text.split(/\r?\n/);

/** Headings of a markdown text (not those inside code fences) with the 1-based inclusive line range of each section. */
export function markdownSections(text) {
  const lines = splitLines(text);
  const heads = [];
  let fence = false;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return; }
    const m = !fence && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) heads.push({ level: m[1].length, title: m[2], start: i + 1 });
  });
  return heads.map((h, idx) => {
    const next = heads.slice(idx + 1).find((x) => x.level <= h.level);
    return { ...h, end: next ? next.start - 1 : lines.length };
  });
}

/** Resolve a ref to its text: { ok: true, start, end, text } or { ok: false, problem }. */
export function resolveRef(root, ref) {
  const abs = path.join(root, ref.file);
  if (!fs.existsSync(abs)) return { ok: false, problem: `${ref.file} does not exist` };
  const raw = fs.readFileSync(abs, "utf8");
  const lines = splitLines(raw);
  if (ref.section) {
    const sections = markdownSections(raw);
    const exact = sections.filter((s) => s.title === ref.section);
    const hits = exact.length ? exact : sections.filter((s) => s.title.includes(ref.section));
    if (hits.length === 0) return { ok: false, problem: `${ref.file} has no heading containing "${ref.section}"` };
    if (hits.length > 1) return { ok: false, problem: `${ref.file}: "${ref.section}" matches more than one heading (${hits.map((h) => h.title).join(" | ")})` };
    const h = hits[0];
    return { ok: true, start: h.start, end: h.end, text: lines.slice(h.start - 1, h.end).join("\n") };
  }
  const m = /^(\d+)-(\d+)$/.exec(ref.lines || "");
  if (!m) return { ok: false, problem: `${ref.file}: ref needs section or lines "12-40"` };
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (start < 1 || start > end || end > lines.length) return { ok: false, problem: `${ref.file} lines ${ref.lines} outside 1-${lines.length}` };
  return { ok: true, start, end, text: lines.slice(start - 1, end).join("\n") };
}

const describe = (ref) => `${ref.file} ${ref.section ? `§ "${ref.section}"` : `lines ${ref.lines}`}`;

/** Every cited text of the pack: each chunk (its file and lines) and each guardrail (its source refs). */
export function collectRefs(domains, guardrailSources) {
  const out = [];
  for (const [domain, d] of Object.entries(domains)) {
    for (const c of d.leaf_chunks) {
      out.push({ key: `chunk:${domain}/${c.id}`, kind: "chunk", label: `chunk ${domain}/${c.id} (${c.file_path}:${c.lines})`, ref: { file: c.file_path, lines: c.lines } });
    }
    (guardrailSources?.[domain] ?? []).forEach((entry, i) => {
      if (entry === "judgement") return;
      entry.forEach((ref, j) => {
        out.push({ key: `guardrail:${domain}#${i}/${j}`, kind: "guardrail", label: `guardrail ${domain}#${i} "${(d.guardrails[i] ?? "").slice(0, 60)}" cites ${describe(ref)}`, ref });
      });
    });
  }
  return out;
}

/** The pins of the given refs, as { key: { hash } }. Throws if a ref cannot be resolved. */
export function buildPins(root, refs) {
  const pins = {};
  for (const r of refs) {
    const res = resolveRef(root, r.ref);
    if (!res.ok) throw new Error(`${r.label}: ${res.problem}`);
    pins[r.key] = { hash: hashText(res.text) };
  }
  return pins;
}

/** Compare the refs with the pins: { changed, moved, missing, unpinned, stale }. */
export function checkPins(root, refs, pins) {
  const out = { changed: [], moved: [], missing: [], unpinned: [], stale: [] };
  const cited = new Set(refs.map((r) => r.key));
  for (const r of refs) {
    const pin = pins[r.key];
    if (!pin) { out.unpinned.push(r.key); continue; }
    const res = resolveRef(root, r.ref);
    if (!res.ok) { out.missing.push({ key: r.key, label: r.label, problem: res.problem }); continue; }
    if (hashText(res.text) === pin.hash) continue;
    const moved = r.ref.lines ? findMoved(root, r.ref, res, pin.hash) : null;
    if (moved) out.moved.push({ key: r.key, label: r.label, from: r.ref.lines, to: moved });
    else out.changed.push({ key: r.key, label: r.label });
  }
  out.stale = Object.keys(pins).filter((k) => !cited.has(k));
  return out;
}

/** The same text at other lines of the file (a pure shift): "start-end", or null. */
function findMoved(root, ref, res, hash) {
  const lines = splitLines(fs.readFileSync(path.join(root, ref.file), "utf8"));
  const n = res.end - res.start + 1;
  for (let s = 0; s + n <= lines.length; s += 1) {
    if (s + 1 === res.start) continue;
    if (hashText(lines.slice(s, s + n).join("\n")) === hash) return `${s + 1}-${s + n}`;
  }
  return null;
}

const IDENTIFIERS = [
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, // ENV_NAMES
  /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\b/g, // camelCase and PascalCase
  /[\w.-]+\/[\w./-]+|\b[\w-]+\.(?:ts|tsx|js|mjs|md|sh|json|yml|xml)\b/g, // paths and file names
  /`([^`]+)`/g, // anything the rule puts in backticks
];

/** Identifiers the rule names that none of the cited texts mention: { total, missing }. A rule whose source lacks most of its own identifiers is cited wrongly. */
export function evidenceGaps(rule, texts) {
  const found = new Set();
  for (const re of IDENTIFIERS) for (const m of rule.matchAll(re)) found.add((m[1] ?? m[0]).trim().replace(/[.,;:)]+$/, ""));
  const hay = texts.join("\n").toLowerCase();
  const all = [...found].filter((t) => t.length >= 4);
  const mentioned = (t) => hay.includes(t.toLowerCase()) || (t.includes("/") && t.split("/").pop().length >= 6 && hay.includes(t.split("/").pop().toLowerCase()));
  return { total: all.length, missing: all.filter((t) => !mentioned(t)) };
}
