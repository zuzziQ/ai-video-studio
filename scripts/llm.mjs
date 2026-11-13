// Lớp gọi LLM dùng chung (M25): "prompt → chữ" và "prompt → JSON có hàm kiểm và thử lại".
// Hôm nay chỉ có Claude Code CLI (`claude -p`, qua spawnClaude ở platform.mjs); nhà cung cấp khác thêm ở đây (M26).
//
//   runClaude(prompt, opts) → { text, result, code }    một lần gọi CLI, lỗi đã dịch sang câu tiếng Việt dễ hiểu
//   askJSON(prompt, opts)   → giá trị JSON đã kiểm        parse lỏng (bỏ ``` , lời dẫn, dấu phẩy thừa, ngoặc kép cong),
//                                                        validate(value) ném lỗi → hỏi lại tối đa `retries` lần
//   parseLooseJSON(text, { shape })                      'object' | 'array' | 'any'
//
// Prompt luôn đi qua stdin: làm tham số thì vượt giới hạn 32K ký tự dòng lệnh của Windows với video dài bình thường.
import { spawnClaude, killTree } from './platform.mjs';

export class LlmError extends Error {
  constructor(message, { kind = 'error', code = null, raw = '' } = {}) { super(message); this.name = 'LlmError'; this.kind = kind; this.code = code; this.raw = raw; }
}

const LOGIN = /not logged in|\/login|invalid api key|api key|authenticat|unauthorized|oauth token/i;
const QUOTA = /credit balance|usage limit|rate limit|quota/i;
export const MSG = {
  missing: 'Không tìm thấy lệnh "claude" (Claude Code CLI). Cài Claude Code (https://claude.com/claude-code) rồi chạy "claude" một lần để đăng nhập.',
  login: 'Claude Code chưa đăng nhập. Mở Terminal, chạy lệnh "claude" một lần để đăng nhập rồi thử lại.',
  quota: m => 'Tài khoản Claude đã hết lượt dùng tạm thời. Đợi một lúc rồi thử lại. (' + m.slice(0, 160) + ')',
};
// Exit code / is_error / stderr → one readable error. Login and quota problems get a sentence the user can act on.
function classify({ code, msg, isError }) {
  if (LOGIN.test(msg)) return new LlmError(MSG.login, { kind: 'login', code, raw: msg });
  if (QUOTA.test(msg)) return new LlmError(MSG.quota(msg), { kind: 'quota', code, raw: msg });
  if (isError) return new LlmError('Claude báo lỗi: ' + msg.slice(0, 300), { kind: 'model', code, raw: msg });
  return new LlmError(`claude -p lỗi (mã ${code}): ${(msg || 'không có kết quả').slice(-300)}`, { kind: 'exit', code, raw: msg });
}

/**
 * One `claude -p` call. opts:
 *  model      'sonnet' | 'opus' | … ('default' or empty = the CLI's own default)
 *  args       extra CLI args, e.g. ['--allowedTools', 'Read'] or ['--resume', id]
 *  cwd        working dir of the CLI (default: the caller's; text-only jobs pass os.tmpdir() so no project files leak in)
 *  env        env for the child (platform.mjs still strips Claude Code session variables)
 *  timeout    ms; 0 = none. On timeout the process tree is stopped and LlmError kind 'timeout' is thrown
 *  timeoutMsg message for that error (default "Claude quá N giây")
 *  onTick     called every tickMs (default 1000) with elapsed seconds — progress lines
 *  onProc     called with the child right after spawn, so a job can cancel it
 *  stream     true: --output-format stream-json --verbose --include-partial-messages; onEvent(e) sees every event
 * → { text: the model's answer, result: the CLI's final JSON object (or null), code }
 */
export function runClaude(prompt, opts = {}) {
  const { model = 'sonnet', args = [], cwd, env, timeout = 0, timeoutMsg, onTick, tickMs = 1000, onProc, stream = false, onEvent } = opts;
  const a = ['-p', '--output-format', stream ? 'stream-json' : 'json', ...(stream ? ['--verbose', '--include-partial-messages'] : [])];
  if (model && model !== 'default') a.push('--model', model);
  a.push(...args);
  return new Promise((ok, bad) => {
    let p;
    try { p = spawnClaude(a, { stdio: ['pipe', 'pipe', 'pipe'], ...(cwd ? { cwd } : {}), ...(env ? { env } : {}) }); }
    catch (e) { return bad(new LlmError(e.code === 'ENOENT' ? MSG.missing : e.message, { kind: 'missing' })); }
    onProc?.(p);
    let out = '', err = '', buf = '', last = null, timedOut = false, settled = false;
    const t0 = Date.now();
    const tick = onTick ? setInterval(() => onTick((Date.now() - t0) / 1000), tickMs) : null;
    const tm = timeout > 0 ? setTimeout(() => { timedOut = true; killTree(p); }, timeout) : null;
    const done = () => { if (tick) clearInterval(tick); if (tm) clearTimeout(tm); };
    const ev = line => { let e; try { e = JSON.parse(line); } catch { return; } if (e?.type === 'result') last = e; try { onEvent?.(e); } catch { /* a progress hook must not break the call */ } };
    p.stdout.on('data', d => {
      if (!stream) { out += d; return; }
      buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) ev(l); }
    });
    p.stderr.on('data', d => (err += d));
    p.stdin.on('error', () => {}); // CLI gone before reading stdin: 'close'/'error' reports it
    p.on('error', e => { done(); if (settled) return; settled = true; bad(new LlmError(e.code === 'ENOENT' ? MSG.missing : e.message, { kind: e.code === 'ENOENT' ? 'missing' : 'error' })); });
    p.on('close', code => {
      done(); if (settled) return; settled = true;
      if (timedOut) return bad(new LlmError(timeoutMsg || `Claude quá ${Math.round(timeout / 1000)} giây`, { kind: 'timeout', code }));
      let r = null;
      if (stream) { if (buf.trim()) ev(buf); r = last; }
      else try { r = JSON.parse(out); } catch { /* plain text (old CLI) or a crash: handled below */ }
      if (r && typeof r === 'object' && !Array.isArray(r)) {
        if (r.is_error || code) return bad(classify({ code, msg: String(r.result ?? err ?? ''), isError: !!r.is_error }));
        return ok({ text: String(r.result ?? ''), result: r, code });
      }
      if (code || stream) return bad(classify({ code, msg: String(err || out || ''), isError: false }));
      ok({ text: out, result: null, code }); // exit 0 but not JSON: hand back the raw text
    });
    p.stdin.end(prompt);
  });
}

// Relaxed JSON from model text (robust-llm skill): strip ``` fences, take the span from the first opening bracket of the
// wanted shape to the last matching closing one, then try the text as is, without trailing commas, with curly quotes
// straightened, and with raw control characters (newlines inside strings) turned into spaces.
export function parseLooseJSON(text, { shape = 'any' } = {}) {
  const s = String(text ?? '').replace(/```(?:json)?/gi, '').trim();
  const open = shape === 'object' ? ['{'] : shape === 'array' ? ['['] : ['{', '['];
  const starts = open.map(c => s.indexOf(c)).filter(i => i >= 0);
  if (!starts.length) throw new LlmError('không có JSON', { kind: 'parse', raw: s.slice(0, 500) });
  const a = Math.min(...starts), b = s.lastIndexOf(s[a] === '{' ? '}' : ']');
  if (b < a) throw new LlmError('không có JSON', { kind: 'parse', raw: s.slice(0, 500) });
  const body = s.slice(a, b + 1), noComma = x => x.replace(/,\s*([}\]])/g, '$1');
  const variants = [body, noComma(body), noComma(body).replace(/[“”]/g, '"'), noComma(body).replace(/[“”]/g, '"').replace(/[\u0000-\u001F]/g, ' ')];
  let first;
  for (const v of variants) { try { return JSON.parse(v); } catch (e) { first ??= e; } }
  throw new LlmError('JSON lỗi: ' + first.message, { kind: 'parse', raw: body.slice(0, 500) });
}

const defaultHint = msg => `\n\nLần trước bạn trả lời không phải JSON hợp lệ (${msg}). Chỉ trả về JSON.`;
/**
 * Prompt → checked JSON. All runClaude opts, plus:
 *  shape      'object' | 'array' | 'any' (default 'any')
 *  validate   (value) → value to return; throw to reject (the message goes into the retry prompt)
 *  retries    extra attempts after a parse/validate failure (default 0). CLI errors (login, timeout…) are not retried.
 *  retryHint  (errMessage, attempt) → text appended to the prompt on a retry
 *  onAttempt  (attempt) before each call;  onRaw (text, attempt) with each raw answer (e.g. to save it for debugging)
 *  run        the provider call (default runClaude) — tests and other providers plug in here
 */
export async function askJSON(prompt, opts = {}) {
  const { shape = 'any', validate, retries = 0, retryHint = defaultHint, onAttempt, onRaw, run = runClaude, ...runOpts } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    onAttempt?.(attempt);
    const ask = attempt ? prompt + retryHint(lastErr.message, attempt) : prompt;
    const { text } = await run(ask, runOpts);
    onRaw?.(text, attempt);
    try {
      const v = parseLooseJSON(text, { shape });
      return validate ? await validate(v) : v;
    } catch (e) { lastErr = e; }
  }
  throw new LlmError('Claude không trả về JSON hợp lệ: ' + lastErr.message, { kind: 'parse', raw: lastErr.raw || '' });
}
