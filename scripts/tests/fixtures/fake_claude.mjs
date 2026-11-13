// Giả lập Claude Code CLI cho scripts/tests/llm.test.mjs (không gọi Claude thật).
// Đọc prompt từ stdin, ghi {args, prompt, cwd} vào FAKE_CLAUDE_LOG (một dòng JSON mỗi lần gọi), rồi trả lời theo
// FAKE_CLAUDE_REPLIES: mảng JSON, lần gọi thứ n lấy phần tử n (hết thì lấy phần tử cuối). Mỗi phần tử:
//   { text }                    → {"type":"result","is_error":false,"result":text}, mã 0
//   { error, code }             → {"type":"result","is_error":true,"result":error}, mã code (mặc định 1)
//   { stderr, code }            → chỉ in stderr, mã code
//   { raw }                     → in nguyên văn raw, mã 0
//   { hang: true }              → treo (để thử timeout)
//   { stream: [events…] }       → mỗi event một dòng JSON (stream-json), mã 0
import fs from 'node:fs';
let input = '';
process.stdin.on('data', d => (input += d));
process.stdin.on('end', () => {
  const log = process.env.FAKE_CLAUDE_LOG;
  let n = 0;
  if (log) {
    try { n = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length; } catch { /* first call */ }
    fs.appendFileSync(log, JSON.stringify({ args: process.argv.slice(2), prompt: input, cwd: process.cwd() }) + '\n');
  }
  const all = JSON.parse(process.env.FAKE_CLAUDE_REPLIES || '[{"text":"{}"}]'), r = all[Math.min(n, all.length - 1)];
  if (r.hang) { setInterval(() => {}, 1000); return; }
  if (r.stream) { for (const e of r.stream) process.stdout.write(JSON.stringify(e) + '\n'); return; }
  if (r.raw != null) { process.stdout.write(r.raw); return; }
  if (r.stderr != null) { process.stderr.write(r.stderr); process.exitCode = r.code ?? 1; return; }
  if (r.error != null) { process.stdout.write(JSON.stringify({ type: 'result', is_error: true, result: r.error })); process.exitCode = r.code ?? 1; return; }
  process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: r.text, session_id: 'fake-session' }));
});
