#!/usr/bin/env node
/**
 * Kiểm hoặc cập nhật knowledge pack của AI Video Studio so với repo thật. Node thuần, không dependency: chạy được trong CI.
 *   node .rag/sync.js --check   # thoát 1 khi lệch (CI, ship-checks)
 *   node .rag/sync.js --pin     # ghi .rag/pins.json từ nguồn hiện tại (sau khi đã đọc lại luật bị đổi)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DOMAINS, CONFIG_CATALOG, GUARDRAIL_SOURCES } from "./index.js";
import { collectRefs, buildPins, checkPins } from "./sources.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PINS_PATH = path.join(HERE, "pins.json");
const args = new Set(process.argv.slice(2));

const refs = collectRefs(DOMAINS, GUARDRAIL_SOURCES);

if (args.has("--pin")) {
  const pins = buildPins(ROOT, refs);
  fs.writeFileSync(PINS_PATH, `${JSON.stringify(pins, null, 2)}\n`);
  console.log(`pinned ${Object.keys(pins).length} source refs in .rag/pins.json`);
  process.exit(0);
}

const drift = [];
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const lineCount = (rel) => read(rel).split(/\r?\n/).length;

for (const [key, d] of Object.entries(DOMAINS)) {
  if (!exists(d.ssot_path)) drift.push(`domain ${key}: ssot_path missing: ${d.ssot_path}`);
  if ((GUARDRAIL_SOURCES[key] || []).length !== d.guardrails.length) {
    drift.push(`domain ${key}: ${d.guardrails.length} guardrails but ${(GUARDRAIL_SOURCES[key] || []).length} source entries`);
  }
  for (const c of d.leaf_chunks) {
    if (!exists(c.file_path)) {
      drift.push(`chunk ${key}/${c.id}: file_path missing: ${c.file_path}`);
      continue;
    }
    const m = /^(\d+)-(\d+)$/.exec(c.lines || "");
    if (!m) {
      drift.push(`chunk ${key}/${c.id}: lines "${c.lines}" not in "start-end" form`);
      continue;
    }
    const total = lineCount(c.file_path);
    const [start, end] = [Number(m[1]), Number(m[2])];
    if (start < 1 || start > end || end > total) drift.push(`chunk ${key}/${c.id}: lines ${c.lines} outside ${c.file_path} (1-${total})`);
  }
}

// Cổng mặc định của Studio phải khớp với studio/server.mjs.
const port = CONFIG_CATALOG.microservices_ports_matrix.find((p) => p.service === "studio")?.port;
const portMatch = /PORT\s*\|\|\s*(\d+)/.exec(read("studio/server.mjs"));
if (!portMatch) drift.push("studio/server.mjs: default port pattern `PORT || <n>` not found");
else if (Number(portMatch[1]) !== port) drift.push(`studio port: server.mjs has ${portMatch[1]}, CONFIG_CATALOG has ${port}`);

// Ghi công repo gốc: LICENSE (MIT bắt buộc) và NOTICE phải còn, README giữ dòng "Dựa trên" (AGENTS.md mục 1-2).
for (const f of ["LICENSE", "NOTICE"]) {
  if (!exists(f)) drift.push(`attribution file missing: ${f}`);
}
if (exists("LICENSE") && !/Copyright \(c\) 2026 Nguyễn Tất Kiểm/.test(read("LICENSE"))) drift.push("LICENSE: author copyright line missing");
if (!/Dựa trên AI Video Studio của Nguyễn Tất Kiểm/.test(read("README.md"))) drift.push("README.md: missing 'Dựa trên AI Video Studio của Nguyễn Tất Kiểm' line");

if (!fs.existsSync(PINS_PATH)) {
  drift.push(".rag/pins.json missing (run `node .rag/sync.js --pin`)");
} else {
  const pins = JSON.parse(fs.readFileSync(PINS_PATH, "utf8"));
  const p = checkPins(ROOT, refs, pins);
  for (const x of p.missing) drift.push(`source missing: ${x.label} -> ${x.problem}`);
  for (const x of p.moved) drift.push(`source lines moved: ${x.label} was ${x.from}, now at lines ${x.to} (update the line range, then --pin)`);
  for (const x of p.changed) drift.push(`source text changed under ${x.label} (re-read the source, update the summary/guardrail if needed, then --pin)`);
  for (const k of p.unpinned) drift.push(`source not pinned: ${k} (run \`node .rag/sync.js --pin\`)`);
  for (const k of p.stale) drift.push(`stale pin in .rag/pins.json: ${k} (run \`node .rag/sync.js --pin\`)`);
}

if (drift.length) {
  console.error(`knowledge pack drift (${drift.length}):`);
  for (const d of drift) console.error(`  - ${d}`);
  process.exit(1);
}
console.log(`knowledge pack in sync: ${Object.keys(DOMAINS).length} domains, ${refs.length} pinned source refs, studio port ${port}`);
