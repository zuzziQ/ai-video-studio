// Whisper giả cho scripts/tests/rehear.test.mjs: cùng giao diện dòng lệnh với scripts/rehear.py
// (<audio> <out.json> --from a --to b --model m --prompt=…), in "@step" như bản thật, ghi chữ "nghe được" trong FAKE_HEARD.
// FAKE_SLEEP_MS: chờ trước khi ghi (để thử huỷ); FAKE_FAIL: thoát mã 1 với dòng lỗi đó.
import fs from 'node:fs';

const [src, out, ...rest] = process.argv.slice(2);
const arg = k => { const i = rest.indexOf(k); if (i >= 0) return rest[i + 1]; const kv = rest.find(x => x.startsWith(k + '=')); return kv ? kv.slice(k.length + 1) : undefined; };
const from = +arg('--from'), to = +arg('--to'), model = arg('--model');
console.log('@step 0.10 Cắt đoạn âm thanh');
if (process.env.FAKE_FAIL) { console.error(process.env.FAKE_FAIL); process.exit(1); }
if (!fs.existsSync(src)) { console.error('không có ' + src); process.exit(1); }
await new Promise(ok => setTimeout(ok, +process.env.FAKE_SLEEP_MS || 0));
console.log(`@step 0.60 Đang nghe lại bằng Whisper ${model} (cpu)`);
const toks = (process.env.FAKE_HEARD || '').split(/\s+/).filter(Boolean), d = (to - from) / Math.max(1, toks.length);
const words = toks.map((w, i) => ({ w, s: +(from + i * d).toFixed(3), e: +(from + (i + 1) * d).toFixed(3) }));
fs.writeFileSync(out, JSON.stringify({ model, device: 'cpu int8', words, text: toks.join(' '), load_ms: 5, run_ms: 7, prompt: arg('--prompt') }));
console.log('@step 1.00 Xong');
