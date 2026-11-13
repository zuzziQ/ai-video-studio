// Cấu hình giọng đọc phía Node (M27): đọc/ghi khoá "tts" của $AVS_HOME/config.json, cùng định dạng với scripts/tts.py.
//   { "tts": { "vieneu": { "url": "http://127.0.0.1:8771", "python": "<venv python>", "voice": "<tên giọng>" },
//              "default_engine": "vieneu" | "edge" | "say" } }
// default_engine là giọng của job batch/dub không ghi engine riêng. URL chỉ nhận máy này (loopbackUrl của llm.mjs).
// Ghi: gộp vào file (giữ mọi khoá khác: API key, llm…), ghi file tạm rồi đổi tên, quyền 600.
// Biến môi trường AVS_VIENEU_URL thắng file (như tts.py).
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, loopbackUrl } from './llm.mjs';

export const ENGINES = ['say', 'edge', 'vieneu'];
export const VIENEU_URL = 'http://127.0.0.1:8771';
// Tên giọng có sẵn của VieNeu: chữ (có dấu), số, khoảng trắng, - _ . ( ); không ký tự điều khiển.
export const VOICE_RE = /^[\p{L}\p{N} ._()-]{1,60}$/u;

export const readConfig = () => { try { return JSON.parse(fs.readFileSync(CONFIG(), 'utf8')) || {}; } catch { return {}; } };

export function ttsConfig() {
  const t = readConfig().tts || {}, v = t.vieneu || {};
  return {
    default_engine: ENGINES.includes(t.default_engine) ? t.default_engine : null,
    vieneu: { url: String(process.env.AVS_VIENEU_URL || v.url || VIENEU_URL).replace(/\/+$/, ''), voice: v.voice || null, has_python: !!v.python },
    env_url: !!process.env.AVS_VIENEU_URL,
  };
}
export const defaultEngine = () => ttsConfig().default_engine;

export function writeConfig(cur) {
  const f = CONFIG(), tmp = f + '.tmp';
  fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
  fs.writeFileSync(tmp, JSON.stringify(cur, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, f);
  try { fs.chmodSync(f, 0o600); } catch { /* Windows: ACL của thư mục người dùng */ }
}

// patch: { url?, voice?, default_engine? }. Sai thì ném Error có status 400; không ghi gì khi có lỗi.
export function saveTtsConfig(patch = {}) {
  const bad = m => Object.assign(new Error(m), { status: 400 });
  const cur = readConfig(), tts = { ...(cur.tts || {}) }, v = { ...(tts.vieneu || {}) };
  if (patch.url !== undefined) { try { v.url = loopbackUrl(patch.url); } catch (e) { throw bad(e.message); } }
  if (patch.voice !== undefined) {
    if (patch.voice === '' || patch.voice === null) delete v.voice;
    else if (typeof patch.voice !== 'string' || !VOICE_RE.test(patch.voice)) throw bad('Tên giọng không hợp lệ');
    else v.voice = patch.voice;
  }
  if (patch.default_engine !== undefined) {
    if (!ENGINES.includes(patch.default_engine)) throw bad('Giọng mặc định phải là: ' + ENGINES.join(', '));
    tts.default_engine = patch.default_engine;
  }
  tts.vieneu = v; cur.tts = tts;
  writeConfig(cur);
  return ttsConfig();
}

// GET /health của máy chủ VieNeu (chỉ loopback, không qua proxy: fetch của Node không dùng proxy hệ thống). null khi không gọi được.
export async function vieneuHealth(url = ttsConfig().vieneu.url, ms = 2000) {
  let u; try { u = loopbackUrl(url); } catch { return null; }
  try {
    const r = await fetch(u + '/health', { signal: AbortSignal.timeout(ms), redirect: 'error' });
    if (!r.ok) return null;
    const j = await r.json();
    return j && typeof j === 'object' ? j : null;
  } catch { return null; }
}
