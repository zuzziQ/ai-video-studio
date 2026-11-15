// Request guards for studio/server.mjs (ROADMAP M33, M37). Pure functions so scripts/tests/studio_security.test.mjs can test them.
//  - which folders may be opened as a project (never the config folder ~/.ai-video-studio that holds the Telegram / YouTube / Claude tokens),
//  - the per-run session token every /api request must carry,
//  - same-origin checks (Host, Origin, Sec-Fetch-Site) and request body size limits.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const AVS_HOME = () => path.resolve(process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio'));
// Sub-folders of AVS_HOME where the Studio's own pipelines create projects (autopilot queue, long videos, the sample clip).
export const HOME_PROJECT_DIRS = ['autopilot', 'longform', 'footage'];

const real = p => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
const key = p => (process.platform === 'win32' ? p.toLowerCase() : p);
// true when a is b or lies inside b
const inside = (a, b) => { const A = key(a), B = key(b); return A === B || A.startsWith(B.endsWith(path.sep) ? B : B + path.sep); };

// Why a folder may not be served as a project, or null when it may. Symlinks are resolved first.
export function forbiddenDir(dir, home = AVS_HOME()) {
  const d = real(dir), h = real(home);
  if (inside(h, d)) return 'thư mục cấu hình của Studio (hoặc thư mục cha của nó)';
  if (inside(d, h)) {
    const rel = path.relative(h, d).split(path.sep);
    if (rel.length < 2 || !HOME_PROJECT_DIRS.includes(key(rel[0]))) return 'thư mục cấu hình của Studio';
  }
  // other dot-folders directly in the user's home (~/.ssh, ~/.claude, ~/.config, …) hold credentials too
  const u = real(os.homedir());
  if (inside(d, u) && key(d) !== key(u)) {
    const top = path.relative(u, d).split(path.sep)[0];
    if (top.startsWith('.') && !inside(d, h)) return 'thư mục ẩn trong thư mục người dùng';
  }
  return null;
}

// project_dir | path/to/timeline.json → { dir, tlFile }, or throws (err.status = 403 when refused).
export function resolveProject(p, home = AVS_HOME()) {
  const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
  if (typeof p !== 'string' || !p.trim()) throw fail('Thiếu đường dẫn dự án');
  // UNC paths (\\localhost\c$\…) are not resolved to drive letters by realpath, so the folder checks could not see through them.
  if (process.platform === 'win32' && /^[\\/]{2}/.test(p.trim())) throw fail('Không mở dự án qua đường dẫn mạng (UNC)', 403);
  const abs = path.resolve(p.trim());
  const isFile = /\.json$/i.test(abs);
  const tlFile = isFile ? abs : path.join(abs, 'timeline.json');
  if (!fs.existsSync(tlFile) || !fs.statSync(tlFile).isFile()) throw fail(`không thấy ${tlFile}`);
  const dir = path.dirname(tlFile);
  // the timeline itself may be a symlink into the config folder
  const why = forbiddenDir(dir, home) || forbiddenDir(path.dirname(real(tlFile)), home);
  if (why) throw fail(`Không mở được ${dir}: ${why}`, 403);
  if (isFile && path.basename(tlFile).toLowerCase() !== 'timeline.json') {
    // another file name is fine only when it really is a timeline (not config.json & co.)
    let tl = null; try { tl = JSON.parse(fs.readFileSync(tlFile, 'utf8')); } catch {}
    if (!tl || typeof tl !== 'object' || Array.isArray(tl) || !(Array.isArray(tl.scenes) || typeof tl.duration === 'number')) throw fail(`${path.basename(tlFile)} không phải timeline`, 403);
  }
  return { dir, tlFile };
}

// /project/<file>: a symlink inside the project must not lead into the config folder.
export const fileAllowed = (f, home = AVS_HOME()) => forbiddenDir(path.dirname(real(f)), home) === null;

// ---------- session token ----------
export const newToken = () => crypto.randomBytes(24).toString('base64url');
export const TOKEN_HEADER = 'x-avs-token', TOKEN_PARAM = 'avs_token';
// Header for every request; the query parameter only for GET/HEAD (media elements and links cannot send headers).
export function tokenOk(req, u, token) {
  const h = req.headers[TOKEN_HEADER];
  const v = typeof h === 'string' && h ? h : (req.method === 'GET' || req.method === 'HEAD') ? u.searchParams.get(TOKEN_PARAM) : null;
  if (!v || !token) return false;
  const a = Buffer.from(v), b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function tokenFile(port, home = AVS_HOME()) { return path.join(home, `studio-${port}.token`); }
// For local CLI clients (scripts/app/launcher.sh): readable by this OS user only.
export function writeTokenFile(port, token, home = AVS_HOME()) {
  fs.mkdirSync(home, { recursive: true });
  const f = tokenFile(port, home);
  fs.writeFileSync(f, token, { mode: 0o600 });
  try { fs.chmodSync(f, 0o600); } catch {}
  return f;
}

// ---------- same origin ----------
// Host must be this server on loopback (DNS rebinding); Origin, when sent, exactly this origin (not another localhost port);
// Sec-Fetch-Site, when sent, same-origin or a typed URL — blocks <img src> / links from other sites, which send no Origin.
export function sameOrigin(req, port) {
  const host = String(req.headers.host || '');
  const m = /^(localhost|127\.0\.0\.1|\[::1\])(?::(\d+))?$/i.exec(host);
  if (!m || (m[2] ? +m[2] : 80) !== +port) return false;
  const o = req.headers.origin;
  if (o !== undefined && o.toLowerCase() !== 'http://' + host.toLowerCase()) return false;
  const s = req.headers['sec-fetch-site'];
  if (s !== undefined && s !== 'same-origin' && s !== 'none') return false;
  return true;
}

// ---------- body size ----------
const MB = 1 << 20;
export const limits = () => ({
  json: (+process.env.AVS_MAX_JSON_MB || 32) * MB, // timelines with long captions stay far below
  upload: (+process.env.AVS_MAX_UPLOAD_MB || 20 * 1024) * MB, // raw 4K phone footage
});
// Routes that stream the raw request body to disk. Routes that buffer it in memory (/api/batch/sheet) keep the JSON cap.
export const UPLOAD_ROUTES = /^\/api\/(upload|pick\/upload|autopilot\/upload|longform\/upload|stylelab\/upload|brolllib\/upload|brands\/logo|engines\/voice\/clone)$/;
// 0 when the body may be read, else the HTTP status to answer. Node's parser stops a body at its Content-Length, so the
// declared length is the real ceiling; bodies without one (chunked) are refused.
export function bodyStatus(req, p, lim = limits()) {
  if (req.headers['transfer-encoding']) return 411;
  const n = +(req.headers['content-length'] || 0);
  if (!Number.isFinite(n) || n < 0) return 400;
  return n > (UPLOAD_ROUTES.test(p) ? lim.upload : lim.json) ? 413 : 0;
}
// JSON body reader with its own byte cap (defence in depth for callers that bypass bodyStatus).
export function readJson(req, max = limits().json) {
  return new Promise((ok, bad) => {
    const parts = []; let n = 0, over = false;
    req.on('data', c => { if (over) return; n += c.length; if (n > max) { over = true; parts.length = 0; return; } parts.push(c); });
    req.on('error', bad);
    req.on('end', () => {
      if (over) return bad(Object.assign(new Error('Dữ liệu gửi lên quá lớn'), { status: 413 }));
      const b = Buffer.concat(parts).toString('utf8');
      try { ok(b ? JSON.parse(b) : {}); } catch { bad(Object.assign(new Error('Dữ liệu gửi lên không phải JSON hợp lệ'), { status: 400 })); }
    });
  });
}
