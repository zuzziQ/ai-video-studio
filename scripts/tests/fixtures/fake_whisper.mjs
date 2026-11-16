// Whisper giả cho scripts/tests/rehear.test.mjs: cùng giao diện dòng lệnh với scripts/rehear.py
// (<audio> <out.json> --from a --to b --model m --prompt=…), in "@step" như bản thật, ghi chữ "nghe được" trong FAKE_HEARD.
// FAKE_SLEEP_MS: chờ trước khi ghi (để thử huỷ); FAKE_FAIL: thoát mã 1 với dòng lỗi đó.
// --spans file (M96): chữ đoạn k lấy từ FAKE_HEARD_LIST (mảng JSON) phần tử k, không có thì FAKE_HEARD; ghi cả "results".
import fs from 'node:fs';

const [src, out, ...rest] = process.argv.slice(2);
const arg = k => { const i = rest.indexOf(k); if (i >= 0) return rest[i + 1]; const kv = rest.find(x => x.startsWith(k + '=')); return kv ? kv.slice(k.length + 1) : undefined; };
const from = +arg('--from'), to = +arg('--to'), model = arg('--model');
console.log('@step 0.10 Cắt đoạn âm thanh');
if (process.env.FAKE_FAIL) { console.error(process.env.FAKE_FAIL); process.exit(1); }
if (!fs.existsSync(src)) { console.error('không có ' + src); process.exit(1); }
await new Promise(ok => setTimeout(ok, +process.env.FAKE_SLEEP_MS || 0));
console.log(`@step 0.60 Đang nghe lại bằng Whisper ${model} (cpu)`);
const hear = (from, to, text) => {
  const toks = (text || '').split(/\s+/).filter(Boolean), d = (to - from) / Math.max(1, toks.length);
  return toks.map((w, i) => ({ w, s: +(from + i * d).toFixed(3), e: +(from + (i + 1) * d).toFixed(3) }));
};
if (arg('--spans')) {
  const spans = JSON.parse(fs.readFileSync(arg('--spans'), 'utf8')), list = JSON.parse(process.env.FAKE_HEARD_LIST || '[]');
  const results = spans.map((x, k) => { console.log(`@step ${(0.3 + 0.7 * k / spans.length).toFixed(2)} Đoạn ${k + 1}/${spans.length}: nghe lại`); const words = hear(x.from, x.to, list[k] ?? process.env.FAKE_HEARD); return { from: x.from, to: x.to, words, text: words.map(w => w.w).join(' '), run_ms: 3, prompt: x.prompt }; });
  fs.writeFileSync(out, JSON.stringify({ model, device: 'cpu int8', words: results[0].words, text: results[0].text, load_ms: 5, run_ms: 9, results }));
} else {
  const words = hear(from, to, process.env.FAKE_HEARD);
  fs.writeFileSync(out, JSON.stringify({ model, device: 'cpu int8', words, text: words.map(w => w.w).join(' '), load_ms: 5, run_ms: 7, prompt: arg('--prompt') }));
}
console.log('@step 1.00 Xong');
