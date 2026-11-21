// S28 M202: sinh bảng chuyển cảnh / bộ lọc / hoạt ảnh chữ của references/clips.md từ engine/fx_registry.js.
//   node scripts/fx_doc.mjs          ghi lại các khối giữa <!-- fx:<kind> --> … <!-- /fx:<kind> -->
//   node scripts/fx_doc.mjs --check  chỉ kiểm, thoát 1 nếu tài liệu lệch registry (scripts/tests/s28_registry.test.mjs gọi)
import fs from 'node:fs';
import { createRequire } from 'node:module';

const FX = createRequire(import.meta.url)('../engine/fx_registry.js');
const DOC = new URL('../references/clips.md', import.meta.url);
export const KINDS = ['trans', 'lut', 'text_in'];

export function render(md) {
  let out = md;
  for (const k of KINDS) {
    const re = new RegExp(`(<!-- fx:${k} -->)[\\s\\S]*?(<!-- /fx:${k} -->)`);
    if (!re.test(out)) throw new Error(`references/clips.md thiếu khối <!-- fx:${k} -->`);
    out = out.replace(re, (_, a, b) => `${a}\n${FX.docTable(k)}\n${b}`);
  }
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const md = fs.readFileSync(DOC, 'utf8'), next = render(md);
  if (process.argv.includes('--check')) {
    if (next !== md) { console.error('references/clips.md lệch engine/fx_registry.js: chạy node scripts/fx_doc.mjs'); process.exit(1); }
    console.log('fx_doc: khớp');
  } else if (next !== md) { fs.writeFileSync(DOC, next); console.log('fx_doc: đã ghi references/clips.md'); }
  else console.log('fx_doc: không đổi');
}
