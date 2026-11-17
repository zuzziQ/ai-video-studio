// Lớp gọi LLM dùng chung (M25): "prompt → chữ" và "prompt → JSON có hàm kiểm và thử lại".
// Nhà cung cấp: Claude Code CLI (`claude -p`, qua spawnClaude ở platform.mjs) và Ollama (M26, máy chủ HTTP trên máy).
// Việc chỉ có chữ (task 'text': hook, kịch bản, caption, gợi ý b-roll) chạy bằng nhà cung cấp chọn trong
// ~/.ai-video-studio/config.json; việc cần xem ảnh hay dùng công cụ (không có task 'text', hoặc có --allowedTools) luôn dùng Claude.
//
//   runClaude(prompt, opts) → { text, result, code }    một lần gọi CLI, lỗi đã dịch sang câu tiếng Việt dễ hiểu
//   runOllama(prompt, opts) → { text, result, code }    POST /api/generate (không stream)
//   runLLM(prompt, opts)    → { text, …, provider }      chọn nhà cung cấp theo opts.task + cấu hình, rồi gọi
//   askJSON(prompt, opts)   → giá trị JSON đã kiểm        parse lỏng (bỏ ``` , lời dẫn, dấu phẩy thừa, ngoặc kép cong),
//                                                        validate(value) ném lỗi → hỏi lại tối đa `retries` lần
//   parseLooseJSON(text, { shape })                      'object' | 'array' | 'any'
//
// Prompt luôn đi qua stdin: làm tham số thì vượt giới hạn 32K ký tự dòng lệnh của Windows với video dài bình thường.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
 *  timeout    ms (default DEFAULT_TIMEOUT: 15 min, AVS_LLM_TIMEOUT_S); 0 = none. On timeout the process tree is stopped and LlmError kind 'timeout' is thrown
 *  timeoutMsg message for that error (default "Claude quá N giây")
 *  onTick     called every tickMs (default 1000) with elapsed seconds — progress lines
 *  onProc     called with the child right after spawn, so a job can cancel it
 *  stream     true: --output-format stream-json --verbose --include-partial-messages; onEvent(e) sees every event
 * → { text: the model's answer, result: the CLI's final JSON object (or null), code }
 */
export const DEFAULT_TIMEOUT = () => (+process.env.AVS_LLM_TIMEOUT_S > 0 ? +process.env.AVS_LLM_TIMEOUT_S : 900) * 1000;
export function runClaude(prompt, opts = {}) {
  // no timeout given → DEFAULT_TIMEOUT (a hung CLI must not hold the job slot until the server restarts); 0 = none, on purpose
  const { model = 'sonnet', args = [], cwd, env, timeout = DEFAULT_TIMEOUT(), timeoutMsg, onTick, tickMs = 1000, onProc, stream = false, onEvent } = opts;
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
 *  task       'text' → the provider picked in config.json (Claude or Ollama); otherwise Claude (see runLLM)
 *  run        the provider call (default runLLM) — tests plug in here
 */
export async function askJSON(prompt, opts = {}) {
  const { shape = 'any', validate, retries = 0, retryHint = defaultHint, onAttempt, onRaw, run = runLLM, ...runOpts } = opts;
  let lastErr, who = 'Claude';
  for (let attempt = 0; attempt <= retries; attempt++) {
    onAttempt?.(attempt);
    const ask = attempt ? prompt + retryHint(lastErr.message, attempt) : prompt;
    const { text, provider } = await run(ask, { ...runOpts, jsonShape: shape });
    if (provider === 'ollama') who = 'Ollama';
    onRaw?.(text, attempt);
    try {
      const v = parseLooseJSON(text, { shape });
      return validate ? await validate(v) : v;
    } catch (e) { lastErr = e; }
  }
  throw new LlmError(who + ' không trả về JSON hợp lệ: ' + lastErr.message, { kind: 'parse', raw: lastErr.raw || '' });
}

// ---------- cấu hình nhà cung cấp (M26) ----------
// ~/.ai-video-studio/config.json, khoá "llm" (cùng file với API key ảnh/stock, quyền 600):
//   { "llm": { "text": "claude" | "ollama", "fallback": "claude" | "",
//              "ollama": { "url": "http://127.0.0.1:11434", "model": "qwen2.5:7b", "timeout": 600000 } } }
// Biến môi trường thắng file: AVS_LLM_TEXT, AVS_LLM_FALLBACK, OLLAMA_HOST, AVS_OLLAMA_MODEL.
// M117: Ollama tắt mặc định (Studio dùng Claude Code). "ollama_enabled": true (nút "Bật Ollama" của Mô hình & giọng) hoặc
// AVS_OLLAMA=1 mới hiện lựa chọn Ollama. Máy đã chọn text "ollama" từ trước được coi là đang bật (không đổi hành vi cũ).
export const CONFIG = () => path.join(process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio'), 'config.json');
export const PROVIDERS = ['claude', 'ollama'];
const DEF_OLLAMA = { url: 'http://127.0.0.1:11434', model: 'qwen2.5:7b', timeout: 600000 };
const readConfig = () => { try { return JSON.parse(fs.readFileSync(CONFIG(), 'utf8')) || {}; } catch { return {}; } };
const hostUrl = h => (/^https?:\/\//i.test(h) ? h : 'http://' + h).replace(/\/+$/, '');
// Máy chủ chạy trên máy (Ollama, VieNeu): chỉ nhận http://127.0.0.1|localhost|[::1][:cổng], không user/pass, không đường dẫn.
// Trả origin đã chuẩn hoá; sai thì ném LlmError (kind 'url'). Dùng cho mọi URL người dùng nhập (CLI set, Studio).
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
export function loopbackUrl(raw) {
  let u = null; try { u = new URL(hostUrl(String(raw || '').trim())); } catch { /* not a URL */ }
  if (!u || u.protocol !== 'http:' || !LOOPBACK.has(u.hostname.toLowerCase()) || u.username || u.password || (u.pathname && u.pathname !== '/') || u.search || u.hash)
    throw new LlmError(`Địa chỉ phải là máy này: http://127.0.0.1:<cổng> (nhận: ${String(raw || '').slice(0, 80)})`, { kind: 'url' });
  return u.origin;
}
export function llmConfig() {
  const c = readConfig().llm || {}, o = { ...DEF_OLLAMA, ...(c.ollama || {}) }, env = process.env;
  const text = String(env.AVS_LLM_TEXT || c.text || 'claude').toLowerCase();
  const fallback = String(env.AVS_LLM_FALLBACK ?? c.fallback ?? '').toLowerCase();
  const t = PROVIDERS.includes(text) ? text : 'claude';
  const enabled = env.AVS_OLLAMA === '1' || c.ollama_enabled === true || t === 'ollama';
  return {
    text: t,
    fallback: fallback === 'claude' ? 'claude' : '',
    ollama: { url: hostUrl(env.OLLAMA_HOST || o.url), model: env.AVS_OLLAMA_MODEL || o.model, timeout: +o.timeout || DEF_OLLAMA.timeout, enabled },
  };
}
// Merge a patch into config.json's "llm" (other keys untouched; mode 600 like the API keys).
export function saveLlmConfig(patch = {}) {
  const f = CONFIG(), cur = readConfig(), llm = { ...(cur.llm || {}) };
  if (patch.text !== undefined) { if (!PROVIDERS.includes(patch.text)) throw new LlmError('Nhà cung cấp phải là: ' + PROVIDERS.join(', ')); llm.text = patch.text; }
  if (patch.fallback !== undefined) llm.fallback = patch.fallback === 'claude' ? 'claude' : '';
  // Tắt Ollama: quay về Claude cho việc chỉ có chữ
  if (patch.enabled !== undefined) { llm.ollama_enabled = patch.enabled === true; if (!llm.ollama_enabled && llm.text === 'ollama') llm.text = 'claude'; }
  if (patch.ollama) {
    const o = Object.entries(patch.ollama).filter(([k, v]) => ['url', 'model', 'timeout'].includes(k) && v !== undefined && v !== '');
    for (const kv of o) if (kv[0] === 'url') kv[1] = loopbackUrl(kv[1]);
    if (o.length) llm.ollama = { ...(llm.ollama || {}), ...Object.fromEntries(o) };
  }
  cur.llm = llm;
  fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
  fs.writeFileSync(f, JSON.stringify(cur, null, 1), { mode: 0o600 }); try { fs.chmodSync(f, 0o600); } catch { /* Windows */ }
  return llmConfig();
}

// Which provider runs this call. Vision / tool use (Read on stills…) is Claude-only; so is anything not marked task 'text'.
export function pickProvider({ task, provider, args = [] } = {}) {
  if (task !== 'text' || args.includes('--allowedTools')) return 'claude';
  if (provider) return PROVIDERS.includes(provider) ? provider : 'claude';
  return llmConfig().text;
}

const CLAUDE_MODEL = /^(sonnet|opus|haiku|default|claude[\w.-]*)$/i;
// Ollama's default context (2–4k tokens) silently drops the start of long prompts (ai_edit catalog, highlights, publish):
// size it to the prompt (~2.5 chars per token for Vietnamese) plus room for the answer, 4k–32k.
export const numCtx = prompt => Math.min(32768, Math.max(4096, 1024 * Math.ceil((String(prompt).length / 2.5 + 2048) / 1024)));
/**
 * One Ollama call (POST {url}/api/generate, stream:false). opts: model / ollamaModel, url, timeout, timeoutMsg, onTick,
 * tickMs, onProc, jsonShape ('object' → Ollama's JSON mode). onProc gets a handle with kill(), so a job cancel (killTree)
 * aborts the request. Claude model names (sonnet, opus, haiku, default) are not Ollama models: the configured one is used.
 */
export async function runOllama(prompt, opts = {}) {
  const cfg = llmConfig().ollama;
  const url = hostUrl(opts.url || cfg.url), timeout = opts.timeout || cfg.timeout;
  const model = opts.ollamaModel || (opts.model && !CLAUDE_MODEL.test(opts.model) ? opts.model : cfg.model);
  const ac = new AbortController(); let why = '';
  const handle = { pid: undefined, exitCode: null, signalCode: null, kill() { why ||= 'cancel'; handle.signalCode = 'SIGTERM'; ac.abort(); return true; } };
  opts.onProc?.(handle);
  const t0 = Date.now(), tick = opts.onTick ? setInterval(() => opts.onTick((Date.now() - t0) / 1000), opts.tickMs || 1000) : null;
  const tm = timeout > 0 ? setTimeout(() => { why ||= 'timeout'; ac.abort(); }, timeout) : null;
  const aborted = () => why === 'timeout'
    ? new LlmError(opts.timeoutMsg || `Ollama quá ${Math.round(timeout / 1000)} giây`, { kind: 'timeout' })
    : new LlmError('Đã huỷ', { kind: 'cancel' });
  try {
    let r, body;
    try {
      r = await fetch(url + '/api/generate', { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false, options: { num_ctx: numCtx(prompt) }, ...(opts.jsonShape === 'object' ? { format: 'json' } : {}) }) });
      body = await r.text();
    } catch (e) {
      if (why) throw aborted();
      throw new LlmError(`Không kết nối được Ollama ở ${url}. Mở Ollama (hoặc chạy "ollama serve") rồi thử lại.`, { kind: 'missing', raw: String(e.cause?.code || e.message) });
    }
    let j = null; try { j = JSON.parse(body); } catch { /* not JSON */ }
    if (!r.ok) {
      const msg = String(j?.error || body || r.status);
      if (r.status === 404 || /model .*not found|try pulling/i.test(msg)) throw new LlmError(`Ollama chưa có model "${model}". Chạy: ollama pull ${model}`, { kind: 'model', code: r.status, raw: msg });
      throw new LlmError(`Ollama lỗi (HTTP ${r.status}): ${msg.slice(0, 300)}`, { kind: 'exit', code: r.status, raw: msg });
    }
    if (!j || typeof j.response !== 'string') throw new LlmError('Kết quả Ollama không đọc được', { kind: 'exit', raw: body.slice(0, 300) });
    return { text: j.response, result: j, code: 0 };
  } finally { if (tick) clearInterval(tick); if (tm) clearTimeout(tm); handle.exitCode ??= 0; }
}

// Provider-routed call → { text, result, code, provider }. With llm.fallback = "claude", an unreachable or model-less
// Ollama falls back to Claude instead of failing the job.
export async function runLLM(prompt, opts = {}) {
  const provider = pickProvider(opts);
  if (provider === 'ollama') {
    try { return { ...(await runOllama(prompt, opts)), provider }; }
    catch (e) {
      if (!(e instanceof LlmError) || !['missing', 'model'].includes(e.kind) || llmConfig().fallback !== 'claude') throw e;
      return { ...(await runClaude(prompt, opts)), provider: 'claude', fallbackFrom: e.message };
    }
  }
  return { ...(await runClaude(prompt, opts)), provider: 'claude' };
}

// ---------- CLI: node scripts/llm.mjs status | set text=ollama model=… url=… fallback=claude | try "prompt" ----------
async function cli(argv) {
  const [cmd, ...rest] = argv, kv = Object.fromEntries(rest.filter(a => /^\w+=/.test(a)).map(a => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]));
  if (cmd === 'set') {
    const c = saveLlmConfig({ text: kv.text, fallback: kv.fallback, ollama: { url: kv.url, model: kv.model, timeout: kv.timeout && +kv.timeout } });
    console.log(JSON.stringify(c, null, 1)); return;
  }
  if (cmd === 'status') {
    const c = llmConfig(); let models = null, err = '';
    try { const r = await fetch(c.ollama.url + '/api/tags', { signal: AbortSignal.timeout(3000) }); models = ((await r.json()).models || []).map(m => m.name); }
    catch (e) { err = String(e.cause?.code || e.message); }
    const has = models ? models.some(m => m === c.ollama.model || m === c.ollama.model + ':latest') : null;
    console.log(JSON.stringify({ config: CONFIG(), ...c, ollama_reachable: !!models, ollama_models: models, has_model: has, ...(err ? { ollama_error: err } : {}) }, null, 1));
    return;
  }
  // ask: prompt on stdin → model text on stdout, through runLLM (provider choice, Claude env cleanup, --setting-sources "",
  // Windows claude.cmd resolution, timeout). For the Python scripts (scripts/llm_bridge.py) so they never spawn claude
  // themselves. Exit 3 = timeout, 4 = no model available (CLI missing / not logged in / Ollama down), 1 = other error.
  if (cmd === 'ask') {
    const prompt = await new Promise((ok, bad) => { let s = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', d => (s += d)); process.stdin.on('end', () => ok(s)); process.stdin.on('error', bad); });
    if (!prompt.trim()) { console.error('Thiếu prompt (gửi qua stdin)'); process.exit(1); }
    const timeout = Math.max(5, Math.min(3600, +kv.timeout || 600)) * 1000;
    try {
      // cwd = temp folder: no project CLAUDE.md / files reach a text prompt
      const r = await runLLM(prompt, { task: kv.task || 'text', model: kv.model || 'sonnet', timeout, cwd: os.tmpdir(), ...(kv.provider ? { provider: kv.provider } : {}),
        ...(kv.shape === 'object' ? { jsonShape: 'object' } : {}) });
      process.stdout.write(r.text);
      if (r.fallbackFrom) console.error(`(Ollama không dùng được, chuyển sang Claude: ${r.fallbackFrom})`);
      return;
    } catch (e) {
      console.error(e.message);
      process.exit(e?.kind === 'timeout' ? 3 : ['missing', 'login', 'quota'].includes(e?.kind) || (e?.kind === 'model' && /ollama/i.test(e.message)) ? 4 : 1);
    }
  }
  if (cmd === 'try') {
    const prompt = rest.filter(a => !/^\w+=/.test(a)).join(' ') || 'Trả về DUY NHẤT JSON {"ok": true, "loi_chao": "<một câu chào tiếng Việt ngắn>"}';
    const t0 = Date.now(), r = await askJSON(prompt, { task: 'text', provider: kv.provider, shape: 'object', retries: 1 });
    console.log(JSON.stringify({ sec: Math.round((Date.now() - t0) / 100) / 10, result: r }, null, 1)); return;
  }
  console.log('Dùng: node scripts/llm.mjs status | set text=claude|ollama [model=qwen2.5:7b] [url=http://127.0.0.1:11434] [fallback=claude|none] | try [provider=ollama] "prompt"');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(1); });
