// S22 M155 (C26): chữ giải thích dưới ô chỉ một dòng; phần dài vào (i) bằng Studio.tip(text).
// Test quét mã giao diện (studio/studio.js, studio/library.js, studio/features/*.js), tìm mọi phần tử
// class="help …" và đo chữ hiện ra (bỏ thẻ; biểu thức ${…} tính bằng nhánh chữ dài nhất bên trong).
// Chạy: node --test scripts/tests/s22_help.test.mjs   ·   in danh sách: node scripts/tests/s22_help.test.mjs --list
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAX = 120;

// Ngoại lệ vĩnh viễn: '<file>:<đoạn đầu chữ>' → lý do. Chỉ cảnh báo lỗi và ghi chú quyền riêng tư.
export const EXCEPTIONS = {
};

// Ngoại lệ TẠM: các file đang thuộc phiên khác (S22). Xoá dòng khi PR đó merge rồi rút gọn file.
// M156 (hướng dẫn đầu, khung hình, kiểm tra) và M152 PR #189 (xem trước, Hỏi Claude, Viết lại).
export const TEMP_FILES = {
  'studio/features/02_onboarding.js': 'TẠM — M156 đang sửa; gỡ khi M156 merge',
  'studio/features/01_setup.js': 'TẠM — M156 đang sửa; gỡ khi M156 merge',
  'studio/features/63_frames.js': 'TẠM — M156 đang sửa; gỡ khi M156 merge',
  'studio/features/16_qc.js': 'TẠM — M156 đang sửa; gỡ khi M156 merge',
  'studio/features/72_elem_ai.js': 'TẠM — M152 (PR #189) đang sửa; gỡ khi merge',
  'studio/features/06_ai_suggest.js': 'TẠM — M152 (PR #189) đang sửa; gỡ khi merge',
  // 74_review*.js là file mới của M152, khớp theo tiền tố
  'studio/features/74_review': 'TẠM — M152 (PR #189) file mới; gỡ khi merge',
};

export function uiFiles() {
  const f = path.join(ROOT, 'studio/features');
  return ['studio/studio.js', 'studio/library.js',
    ...fs.readdirSync(f).filter(n => n.endsWith('.js')).sort().map(n => 'studio/features/' + n)];
}

// Tìm cuối một chuỗi/biểu thức bắt đầu tại i (s[i] là ` ' " hoặc {). Trả chỉ số ký tự đóng.
function skipQuoted(s, i) {
  const q = s[i];
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (q === '`' && s[j] === '$' && s[j + 1] === '{') { j = skipExpr(s, j + 1); continue; }
    if (s[j] === q) return j;
  }
  return s.length;
}
function skipExpr(s, i) { // s[i] === '{'
  let d = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '`' || c === "'" || c === '"') { j = skipQuoted(s, j); continue; }
    if (c === '{') d++;
    else if (c === '}' && --d === 0) return j;
  }
  return s.length;
}

function skipParen(s, i) { // s[i] === '('
  let d = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '`' || c === "'" || c === '"') { j = skipQuoted(s, j); continue; }
    if (c === '(') d++;
    else if (c === ')' && --d === 0) return j;
  }
  return s.length;
}

// Chữ hiện ra của một đoạn template: ${expr} thay bằng chuỗi literal dài nhất trong expr (đệ quy).
function visible(t) {
  let out = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\') { out += t[i + 1] || ''; i++; continue; }
    if (t[i] === '$' && t[i + 1] === '{') {
      const e = skipExpr(t, i + 1);
      out += longestLiteral(t.slice(i + 2, e));
      i = e; continue;
    }
    out += t[i];
  }
  return out;
}
function longestLiteral(expr) {
  let best = '';
  for (let j = 0; j < expr.length; j++) {
    const c = expr[j];
    // chữ trong tip(…) nằm ở bóng (i), không hiện dưới ô: bỏ qua cả lời gọi
    if (c === 't' && expr.startsWith('tip(', j) && !/[\w$]/.test(expr[j - 1] || '')) { j = skipParen(expr, j + 3); continue; }
    if (c === '`' || c === "'" || c === '"') {
      const e = skipQuoted(expr, j);
      const v = visible(expr.slice(j + 1, e));
      if (text(v).length > text(best).length) best = v;
      j = e;
    }
  }
  return best;
}
const text = h => h.replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, 'x').replace(/\s+/g, ' ').trim();

// Mọi phần tử class="help…" trong một file: { file, line, len, text }.
export function scan(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const out = [];
  const re = /<(div|p|span|small|label)\b[^>]*\bclass=(["'])help(?:[\s"'][^>]*)?>/g;
  let m;
  while ((m = re.exec(src))) {
    const tag = m[1], start = m.index + m[0].length;
    // tìm thẻ đóng cùng tên, đếm lồng
    const tre = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
    tre.lastIndex = start;
    let d = 1, end = src.length, t;
    while ((t = tre.exec(src))) { if (t[1]) { if (--d === 0) { end = t.index; break; } } else d++; }
    const body = text(visible(src.slice(start, end)));
    out.push({ file, line: src.slice(0, m.index).split('\n').length, len: body.length, text: body });
  }
  return out;
}

const isTemp = f => Object.keys(TEMP_FILES).some(k => f === k || f.startsWith(k));
const excReason = h => Object.entries(EXCEPTIONS).find(([k]) => { const [f, ...p] = k.split(':'); return f === h.file && h.text.startsWith(p.join(':')); })?.[1];

if (process.argv.includes('--list')) {
  for (const f of uiFiles()) for (const h of scan(f)) if (h.len > (Number(process.argv[3]) || MAX))
    console.log(`${h.len}\t${h.file}:${h.line}${isTemp(f) ? ' [tạm]' : ''}${excReason(h) ? ' [ngoại lệ]' : ''}\t${h.text.slice(0, 90)}`);
}

test('không còn .help dài quá 120 ký tự trong mã giao diện (C26)', () => {
  const bad = [];
  for (const f of uiFiles()) {
    if (isTemp(f)) continue;
    for (const h of scan(f)) if (h.len > MAX && !excReason(h)) bad.push(`${h.file}:${h.line} (${h.len}) ${h.text.slice(0, 80)}…`);
  }
  assert.deepEqual(bad, [], 'Đổi phần dài sang Studio.tip(text) hoặc thêm vào EXCEPTIONS kèm lý do');
});

test('mỗi ngoại lệ có lý do và còn khớp một chỗ thật', () => {
  const all = uiFiles().flatMap(scan);
  for (const [k, why] of Object.entries(EXCEPTIONS)) {
    assert.ok(typeof why === 'string' && why.trim().length >= 10, `thiếu lý do: ${k}`);
    const [f, ...p] = k.split(':');
    assert.ok(all.some(h => h.file === f && h.text.startsWith(p.join(':')) && h.len > MAX), `ngoại lệ thừa: ${k}`);
  }
  for (const [k, why] of Object.entries(TEMP_FILES)) assert.match(why, /^TẠM/, k);
});

test('bộ đo: ${…} lấy nhánh dài nhất, bỏ thẻ', () => {
  assert.equal(text(visible('a <b>b</b> ${x ? `cc ${y ? "dddd" : ""}` : "e"}')), 'a b cc dddd');
  assert.equal(text(visible('ngắn ${S.tip(`dài ${a ? "rất dài rất dài" : ""}`)}${Studio.tip("x")}')), 'ngắn');
});

test('Studio.tip có trong studio.js, dùng aria-describedby', () => {
  const s = fs.readFileSync(path.join(ROOT, 'studio/studio.js'), 'utf8');
  assert.match(s, /function tip\(text/);
  assert.match(s, /const Studio = window\.Studio = \{[\s\S]*?\besc, tip,/);
  assert.match(s, /aria-describedby="\$\{id\}"[\s\S]*?role="tooltip" id="\$\{id\}"/);
});
