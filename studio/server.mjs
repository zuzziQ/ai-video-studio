// AI Video Studio — local editor server (no dependencies beyond Node ≥ 18).
// usage: node studio/server.mjs [project_dir | timeline.json] [--port 5186] [--open]
//        node studio/server.mjs --new raw.mp4 [project_dir]      (build a starter project, then open it)
// Serves the editor UI (studio/, incl. studio/thumbs/), the render engine (engine/), the skill's sound/music library (assets/),
// the template gallery (templates/, override with --templates <dir>)
// and the project's files (/project/... = default project, /p/<tab id>/... = a tab's project, S18 M129). Saves timeline.json with history snapshots in <project>/.studio/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import { killTree, openPath, pyBin, revealPath } from '../scripts/platform.mjs';
import { cached } from '../scripts/net_cache.mjs';
import { shortErr } from '../scripts/err_text.mjs';
import { resolvePerf, PROFILES } from '../scripts/perf_profile.mjs';
import { workspaceOfProject } from '../scripts/workspace.mjs';
import { TabRegistry, tabId } from './tabs.mjs';
import { AVS_HOME, resolveProject, fileAllowed, newToken, tokenOk, writeTokenFile, tokenFile, sameOrigin, bodyStatus, readJson, cookieOk, sessionCookie, launchKeyOk, launchUrl } from './security.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '..');
const PY = pyBin(SKILL);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = +opt('--port', process.env.PORT || 5186);
const VERSION = '4.0';
// Template gallery (GET /api/templates): <skill>/templates/*.json + templates/user/*.json, previews in templates/previews/.
const TPL_DIR = path.resolve(opt('--templates', process.env.AVS_TEMPLATES || path.join(SKILL, 'templates')));

// S18 M129: nhiều dự án mở cùng lúc. Mỗi request chạy trong `als` với dự án của tab gửi nó (header X-AVS-Project = mã tab do
// server cấp, xem studio/tabs.mjs); job chạy nền giữ dự án của request đã khởi chạy nó, nên chuyển tab / mở dự án khác không làm
// job ghi nhầm chỗ. Request không gửi mã (CLI, script cũ) dùng dự án mặc định `active` (dự án mở gần nhất), như trước.
let active = null; // { dir, tlFile }
const als = new AsyncLocalStorage();
const cur = () => { const st = als.getStore(); return st ? st.project : active; };
const curPid = () => als.getStore()?.pid || null;
const setCur = (pr, pid) => { active = pr; const st = als.getStore(); if (st) { st.project = pr; st.pid = pid || null; if (pid) st.opened = pid; } };
// chỉ dự án của request này (không đổi dự án mặc định của CLI / tab khác): newProject đóng / khôi phục dự án cũ trong lúc tạo
const setReq = (pr, pid) => { const st = als.getStore(); if (st) { st.project = pr; st.pid = pid || null; } else active = pr; };
const TABS = new TabRegistry({ file: path.join(AVS_HOME(), 'studio-tabs.json'), resolve: resolveProject,
  busy: id => job?.state === 'running' && job.tab === id, // tab đang chạy tác vụ không bị đẩy ra khi quá 8 tab
  onClose: id => { if (active && tabId(active.dir) === id) active = null; } }); // CLI không còn ghi vào dự án đã đóng tab
// Only real projects (a timeline.json), never the config folder with the Telegram / YouTube / Claude tokens (studio/security.mjs).
function openProject(p, o) {
  const { id, project } = TABS.open(p, Date.now(), o);
  fs.mkdirSync(path.join(project.dir, '.studio/history'), { recursive: true });
  setCur(project, id);
  console.log(`project: ${project.dir}`);
  return id;
}
// Trước M129 mở dự án khác bị chặn khi có job chạy (job đọc biến dự án toàn cục). Nay job giữ dự án của nó (als), nên mở được.
const switchProject = (p, o) => openProject(p, o);

// ---------- helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.aac': 'audio/aac' };
function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    // Revalidate with ETag so a reload answers most of the ~200 editor/engine files with an empty 304.
    // Version-pinned libraries (folders named pkg@x.y.z) never change → cached outright.
    const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', ETag: etag, 'Cache-Control': /[\\/](vendor|_lib)[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache' };
    if (!range && req.headers['if-none-match'] === etag) { res.writeHead(304, head); return res.end(); }
    if (range) {
      const a = range[1] ? +range[1] : 0, b = range[2] ? +range[2] : st.size - 1;
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 });
      return fs.createReadStream(file, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { ...head, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}
// Resolve url path under root; refuses anything escaping it.
function under(root, rel) {
  let r; try { r = decodeURIComponent(rel); } catch { return null; }
  if (r.includes('\0')) return null;
  const p = path.resolve(root, r.replace(/^\/+/, ''));
  return p === root || p.startsWith(root + path.sep) ? p : null;
}
const json = (res, obj, code = 200) => {
  // S18 M129: request này vừa mở một dự án (tab mới) → trình duyệt ghi mã lên thanh địa chỉ trước khi tải lại (studio/auth.js)
  const st = als.getStore(); if (st?.opened && st.opened !== st.asked && !res.headersSent) res.setHeader('X-AVS-Opened', st.opened);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const body = req => readJson(req);
const P = rel => path.resolve(cur().dir, rel);
// URL tới file của dự án đang xử lý request: tab có mã → /p/<mã>/, không thì /project/ (dự án mặc định)
const purl = rel => (curPid() ? `/p/${curPid()}/` : '/project/') + rel;

function frameCount(tl) {
  if (!tl.aroll?.frames) return 0;
  const d = P(path.dirname(tl.aroll.frames));
  return fs.existsSync(d) ? fs.readdirSync(d).filter(f => /\.(jpe?g|png)$/i.test(f)).length : 0;
}
function readProject() {
  const tl = JSON.parse(fs.readFileSync(cur().tlFile, 'utf8'));
  let captions = tl.captions;
  if (typeof captions === 'string' && fs.existsSync(P(captions))) captions = JSON.parse(fs.readFileSync(P(captions), 'utf8'));
  const audioSrc = [tl.audio?.voice, tl.audio?.mix].find(a => a && fs.existsSync(P(a))) || null;
  return { timeline: tl, captions: Array.isArray(captions) ? captions : [], meta: {
    name: path.basename(cur().dir), dir: cur().dir, version: VERSION, frames: frameCount(tl), audio: audioSrc,
    mix: tl.audio?.mix && fs.existsSync(P(tl.audio.mix)) ? tl.audio.mix : null,
    saved: fs.statSync(cur().tlFile).mtimeMs, notes: fs.existsSync(P('.studio/notes.md')),
  } };
}
// S17 M126: Kho (và thương hiệu) của dự án đang mở cho thanh trên và hộp "Video mới" (chỉ GET /api/project, không phải mọi
// readProject của route); lỗi đọc Kho không làm hỏng việc mở dự án.
function khoOf(tl) {
  try { const ws = workspaceOfProject(cur().dir, tl); return { brand: ws.brand || '', title: ws.title, root: ws.root, found: ws.found }; } catch { return null; }
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
function writeNotes(tl, captions) {
  const out = [];
  const fmt = t => (t == null ? '' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`);
  if (tl.note) out.push(`## Ghi chú chung\n${tl.note}\n`);
  (tl.scenes || []).forEach((s, i) => {
    if (s.note) out.push(`- scenes[${i}] ${s.type} ${fmt(s.t0)}–${fmt(s.t1)}: ${s.note}`);
    (s.lines || []).forEach((l, j) => l.note && out.push(`- scenes[${i}].lines[${j}] "${l.text}" @${fmt(l.t)}: ${l.note}`));
    (s.nodes || []).forEach((n, j) => n.note && out.push(`- scenes[${i}].nodes[${j}] ${n.kind} "${n.text || ''}": ${n.note}`));
  });
  captions.forEach((c, k) => c.note && out.push(`- captions[${k}] "${c.words.map(w => w.w).join(' ')}" ${fmt(c.t0)}: ${c.note}`));
  (tl.audio?.sfx || []).forEach((x, k) => x.note && out.push(`- audio.sfx[${k}] ${x.name} @${fmt(x.t)}: ${x.note}`));
  const f = P('.studio/notes.md');
  if (out.length) fs.writeFileSync(f, `# Ghi chú cho Claude (từ AI Video Studio)\nDự án: ${cur().dir}\nCập nhật: ${new Date().toLocaleString('vi-VN')}\n\n${out.join('\n')}\n`);
  else if (fs.existsSync(f)) fs.unlinkSync(f);
  return out.length;
}
function save({ timeline, captions, dir }) {
  // S17 M126: trình chỉnh sửa gửi kèm thư mục dự án nó đang sửa; khác dự án đang mở (tab cũ còn mở sau "Video mới" hay mở dự án
  // khác) thì từ chối, không ghi timeline cũ đè lên dự án mới. Không gửi dir (script cũ) thì như trước.
  if (dir != null) {
    const k = d => { const r = path.resolve(String(d)); return process.platform === 'win32' ? r.toLowerCase() : r; };
    if (typeof dir !== 'string' || k(dir) !== k(cur().dir)) throw Object.assign(new Error('Studio đã chuyển sang dự án khác — tải lại trang trước khi lưu'), { status: 409 });
  }
  if (!timeline || typeof timeline !== 'object' || Array.isArray(timeline)) throw Object.assign(new Error('Thiếu timeline — không lưu'), { status: 400 });
  if (captions != null && !Array.isArray(captions)) throw Object.assign(new Error('captions phải là danh sách'), { status: 400 });
  const tl = timeline;
  const capFile = typeof tl.captions === 'string' ? tl.captions : (captions?.length ? 'work/captions.json' : null);
  if (capFile) { fs.mkdirSync(path.dirname(P(capFile)), { recursive: true }); fs.writeFileSync(P(capFile), JSON.stringify(captions || [], null, 1)); tl.captions = capFile; }
  fs.writeFileSync(cur().tlFile, JSON.stringify(tl, null, 1));
  fs.mkdirSync(path.join(cur().dir, '.studio/history'), { recursive: true });
  const snap = path.join(cur().dir, '.studio/history', `${stamp()}.json`);
  fs.writeFileSync(snap, JSON.stringify({ timeline: tl, captions }));
  // keep the newest 60 snapshots
  const all = fs.readdirSync(path.dirname(snap)).sort();
  for (const f of all.slice(0, Math.max(0, all.length - 60))) fs.unlinkSync(path.join(path.dirname(snap), f));
  return { ok: true, notes: writeNotes(tl, captions || []), saved: Date.now() };
}

// ---------- library (sound, music, fonts) ----------
function library() {
  const sfxDir = path.join(SKILL, 'assets/sfx'), musDir = path.join(SKILL, 'assets/music');
  const sfx = fs.existsSync(sfxDir) ? fs.readdirSync(sfxDir).filter(f => /\.(flac|wav|mp3)$/.test(f)).sort() : [];
  const music = fs.existsSync(musDir) ? fs.readdirSync(musDir).filter(f => f.endsWith('.mp3')).sort() : [];
  return { sfx, music };
}

// ---------- waveform (peaks per 1/50 s) ----------
function waveform(cb) {
  const tl = JSON.parse(fs.readFileSync(cur().tlFile, 'utf8'));
  const src = [tl.audio?.voice, tl.audio?.mix].find(a => a && fs.existsSync(P(a)));
  if (!src) return cb([]);
  const cache = P('.studio/wave.json');
  if (fs.existsSync(cache) && fs.statSync(cache).mtimeMs > fs.statSync(P(src)).mtimeMs) return cb(JSON.parse(fs.readFileSync(cache, 'utf8')));
  execFile('ffmpeg', ['-v', 'error', '-i', P(src), '-ac', '1', '-ar', '2000', '-f', 's16le', '-'], { encoding: 'buffer', maxBuffer: 1 << 29 }, (err, out) => {
    if (err) return cb([]);
    const n = out.length >> 1, step = 40, peaks = [];
    for (let i = 0; i < n; i += step) {
      let m = 0;
      for (let j = i; j < Math.min(n, i + step); j++) m = Math.max(m, Math.abs(out.readInt16LE(j * 2)));
      peaks.push(+(m / 32768).toFixed(3));
    }
    try { fs.mkdirSync(path.dirname(cache), { recursive: true }); fs.writeFileSync(cache, JSON.stringify(peaks)); } catch {}
    cb(peaks);
  });
}

// ---------- media library (<project>/media) ----------
const IMG = /\.(jpe?g|png|webp|gif|svg)$/i, VID = /\.(mp4|mov|m4v|webm|mkv)$/i, AUD = /\.(mp3|wav|m4a|aac|flac|ogg)$/i;
// Browsers play iPhone .mov (AAC + Apple spatial-audio track) silently, so the editor previews a clip's sound from
// <name>_frames/audio.m4a (first audio stream as AAC). Export still mixes the original file through ffmpeg.
const audioPending = new Set();
function extractAudio(src, fr, cb = () => {}) {
  const out = path.join(fr, 'audio.m4a');
  if (fs.existsSync(out) || audioPending.has(out)) return cb();
  audioPending.add(out);
  const tmp = path.join(fr, '.audio.tmp.m4a');
  execFile('ffmpeg', ['-v', 'error', '-y', '-i', src, '-map', '0:a:0?', '-vn', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', tmp], e => {
    audioPending.delete(out);
    if (!e && fs.existsSync(tmp) && fs.statSync(tmp).size > 1024) fs.renameSync(tmp, out); else fs.rmSync(tmp, { force: true });
    cb();
  });
}
function mediaList() {
  const d = P('media'); if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => !f.startsWith('.') && (IMG.test(f) || VID.test(f) || AUD.test(f))).sort().map(f => {
    const kind = IMG.test(f) ? 'image' : VID.test(f) ? 'video' : 'audio';
    const it = { name: f, path: `media/${f}`, kind };
    const fr = P(`media/${f.replace(/\.\w+$/, '')}_frames`);
    if (kind === 'video' && fs.existsSync(fr)) {
      const n = fs.readdirSync(fr).filter(x => x.endsWith('.jpg')).length;
      it.seq = { seq: `media/${path.basename(fr)}/%05d.jpg`, fps: 30, count: n }; it.thumb = `media/${path.basename(fr)}/00001.jpg`; it.dur = +(n / 30).toFixed(2);
      if (fs.existsSync(path.join(fr, 'audio.m4a'))) it.preview_audio = `media/${path.basename(fr)}/audio.m4a`;
      else extractAudio(P(`media/${f}`), fr); // videos imported before this existed: ready on the next list
    }
    if (kind === 'image') it.thumb = it.path;
    return it;
  });
}
// Stream the request body to media/<name>; videos are expanded to a 30 fps JPEG sequence the engine can seek.
function upload(req, name) {
  return new Promise((ok, bad) => {
    const safe = path.basename(name).replace(/[^\w.\-À-ỹ ]+/g, '_');
    fs.mkdirSync(P('media'), { recursive: true });
    // M54: xoá trước khi ghi (inode mới) — media/ của dự án anh em biến thể có thể là liên kết cứng tới bản gốc
    const dst = P(`media/${safe}`); fs.rmSync(dst, { force: true });
    const out = fs.createWriteStream(dst);
    req.pipe(out);
    out.on('error', bad);
    out.on('finish', () => {
      if (!VID.test(safe)) return ok({ name: safe });
      const fr = P(`media/${safe.replace(/\.\w+$/, '')}_frames`);
      fs.rmSync(fr, { recursive: true, force: true }); fs.mkdirSync(fr, { recursive: true });
      execFile('ffmpeg', ['-v', 'error', '-y', '-i', dst, '-vf', 'fps=30,scale=w=1280:h=1280:force_original_aspect_ratio=decrease', '-q:v', '3', path.join(fr, '%05d.jpg')],
        e => (e ? bad(e) : extractAudio(dst, fr, () => ok({ name: safe }))));
    });
  });
}
function srt(captions) {
  const ts = x => { const ms = Math.round(x * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s2 = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
  return captions.filter(c => !c.hidden).map((c, i) => `${i + 1}\n${ts(c.t0)} --> ${ts(c.t1)}\n${c.words.map(w => w.w).join(' ')}\n`).join('\n');
}
function still(t, dest) {
  return new Promise((ok, bad) => {
    const tl = JSON.parse(fs.readFileSync(cur().tlFile, 'utf8'));
    // Same source check as exportVideo: a moved project / deleted work/ must not surface as an fs.readdir stack.
    for (const f of [tl.aroll?.frames && path.dirname(tl.aroll.frames)]) if (f && !fs.existsSync(P(f))) return bad(Object.assign(new Error(`Thiếu file nguồn: ${f} — dự án bị di chuyển hoặc đã xoá thư mục work/`), { status: 400 }));
    const vert = (tl.height || 720) > (tl.width || 1280);
    const tmp = path.join(cur().dir, `.still_${process.pid}.json`);
    fs.writeFileSync(tmp, JSON.stringify({ ...tl, width: vert ? 1080 : 1920, height: vert ? 1920 : 1080 }));
    fs.mkdirSync(P('out'), { recursive: true });
    const out = dest || `out/cover_${String(t).replace('.', '_')}s.jpg`;
    const abs = path.isAbsolute(out) ? out : P(out);
    // Render to a temp name, then rename: the old file may be hard-linked into Thanh pham/ (M100) and ffmpeg -y would
    // overwrite that delivered copy in place; a failed render also keeps the old cover.
    const part = abs.replace(/(\.\w+)?$/, '.part$1');
    execFile('node', [path.join(SKILL, 'scripts/render.mjs'), tmp, part, '--still', String(t), part], (e, so, se) => {
      fs.rmSync(tmp, { force: true });
      if (!e) try { fs.renameSync(part, abs); } catch (er) { e = er; }
      fs.rmSync(part, { force: true });
      // Short reason for the user (render.mjs's last stderr line), never the command line or a Node stack with machine paths.
      if (e) console.error('still:', e.message);
      e ? bad(Object.assign(new Error('Không chụp được khung hình: ' + shortErr(se, 'render lỗi')), { status: 500 })) : ok(out);
    });
  });
}


// ---------- templates ----------
function templateList() {
  const out = [];
  const read = (dir, user) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json').sort()) {
      try {
        const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        t.id = t.id || f.replace(/\.json$/, '');
        const pv = ext => fs.existsSync(path.join(TPL_DIR, 'previews', `${t.id}.${ext}`)) ? `/templates/previews/${encodeURIComponent(t.id)}.${ext}` : null;
        out.push({ ...t, user, preview: { mp4: pv('mp4'), jpg: pv('jpg') } });
      } catch (e) { console.error('template', f, e.message); }
    }
  };
  read(TPL_DIR, false); read(path.join(TPL_DIR, 'user'), true);
  return out;
}
const slug = s => String(s || 'mau').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'mau';
// Save the current project as a user template (+ a small cover still rendered at time t).
async function saveTemplate({ tpl, t = 1 }) {
  if (!tpl || typeof tpl !== 'object' || Array.isArray(tpl) || !String(tpl.name || '').trim()) throw Object.assign(new Error('Thiếu mẫu hoặc tên mẫu'), { status: 400 });
  const dir = path.join(TPL_DIR, 'user');
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(TPL_DIR, 'previews'), { recursive: true });
  let id = 'u-' + slug(tpl.name);
  for (let k = 2; fs.existsSync(path.join(dir, id + '.json')) || fs.existsSync(path.join(TPL_DIR, id + '.json')); k++) id = 'u-' + slug(tpl.name) + '-' + k;
  const doc = { ...tpl, id, user: undefined, preview: undefined, created: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(doc, null, 1));
  const big = path.join(TPL_DIR, 'previews', `.${id}_big.jpg`), jpg = path.join(TPL_DIR, 'previews', `${id}.jpg`);
  try {
    await still(Math.max(0, +t || 0), big);
    await new Promise(ok => execFile('ffmpeg', ['-v', 'error', '-y', '-i', big, '-vf', 'scale=360:-2', '-q:v', '4', jpg], () => ok()));
  } catch (e) { console.error('template cover', e.message); }
  fs.rmSync(big, { force: true });
  return { ok: true, id, file: path.join(dir, id + '.json') };
}

// ---------- background jobs (export / new project) ----------
let job = null; // { kind, state: running|done|error, progress 0..1, step, log, out }
function run(cmd, argv, onLine) {
  return new Promise((ok, bad) => {
    const p = spawn(cmd, argv, { cwd: cur()?.dir || process.cwd() });
    job.proc = p;
    // Lines are reassembled across chunks so a long progress/JSON line never reaches onLine cut in half.
    let own = ''; // this process's output only (job.log spans every command of the job)
    const feeder = () => { let rest = ''; return d => { const s = d.toString(); job.log = (job.log + s).slice(-6000); own = (own + s).slice(-6000); const ls = (rest + s).split(/[\r\n]/); rest = ls.pop(); ls.forEach(line); }; };
    const line = l => { if (l && onLine) try { onLine(l); } catch (e) { console.error('onLine', e.message); } };
    p.stdout.on('data', feeder()); p.stderr.on('data', feeder());
    // Missing ffmpeg/python: reject the job instead of crashing the server with an unhandled 'error' event.
    p.on('error', e => bad(new Error(e.code === 'ENOENT' ? `Không tìm thấy ${path.basename(cmd)} — chạy lại bộ cài (install)` : e.message)));
    p.on('close', code => {
      if (code === 0) return ok();
      // Python without the installer's venv: name the missing module instead of a bare "python lỗi (mã 1)".
      const mod = /python/i.test(path.basename(cmd)) ? /ModuleNotFoundError: No module named '([\w.]+)'/.exec(own)?.[1] : null;
      bad(new Error(mod ? `Thiếu thư viện Python "${mod.split('.')[0]}" — chạy lại bộ cài (install.cmd / install.sh)` : `${path.basename(cmd)} lỗi (mã ${code})`));
    });
  });
}
async function exportVideo({ quality = '1080', from, to, aspects, profile, deliver: give }) {
  const tl = JSON.parse(fs.readFileSync(cur().tlFile, 'utf8'));
  // Missing source files (project moved / work/ deleted): say which one instead of a python/node stack trace.
  for (const f of [tl.aroll?.frames && path.dirname(tl.aroll.frames), tl.audio?.voice]) if (f && !fs.existsSync(P(f))) throw new Error(`Thiếu file nguồn: ${f} — dự án bị di chuyển hoặc đã xoá thư mục work/`);
  const [W, H] = quality === '720' ? [720, 1280] : quality === '4k' ? [2160, 3840] : [1080, 1920];
  const vert = (tl.height || 720) > (tl.width || 1280);
  const tmp = P('.studio/export.json');
  fs.writeFileSync(tmp, JSON.stringify({ ...tl, width: vert ? W : H, height: vert ? H : W }));
  // mix_audio.py writes tl.audio.mix (default work/mix.wav); hand that file to render.mjs explicitly so the MP4 always has sound.
  let mix = null;
  if (tl.audio?.voice || tl.audio?.music?.length || tl.audio?.sfx?.length || tl.audio?.tracks?.length || tl.clips?.some(c => c.audio)) {
    job.step = 'Trộn âm thanh (giọng + nhạc + SFX, -14 LUFS)';
    await run(PY, ['-I', '-X', 'utf8', path.join(SKILL, 'scripts/mix_audio.py'), cur().tlFile]);
    mix = P(tl.audio?.mix || 'work/mix.wav');
    if (!fs.existsSync(mix)) throw new Error('Trộn âm thanh không tạo ra file ' + path.relative(cur().dir, mix));
  }
  fs.mkdirSync(P('out'), { recursive: true });
  const out = `out/${path.basename(cur().dir)}_${stamp()}.mp4`;
  fs.rmSync(P(out), { force: true }); // same minute, same name: never render over a copy already hard-linked into Thanh pham/ (M100)
  job.step = 'Render khung hình';
  const total = (to ?? tl.duration) - (from ?? 0);
  // render.mjs resolves media against the timeline's folder, so the temp copy lives next to it via a relative symlink-free path.
  const tmpTl = path.join(cur().dir, `.export_${process.pid}.json`);
  fs.renameSync(tmp, tmpTl);
  try {
    // M64: profile hiệu năng (body.profile khi hợp lệ, không thì $AVS_HOME/config.json); render.mjs chờ lượt khi máy đang render.
    const perf = resolvePerf({ profile: typeof profile === 'string' && Object.hasOwn(PROFILES, profile) ? profile : undefined, job: { kind: 'export' } });
    await run('node', [path.join(SKILL, 'scripts/render.mjs'), tmpTl, P(out), '--profile', perf.profile, ...(mix ? ['--audio', mix] : []), ...(from != null ? ['--from', String(from)] : []), ...(to != null ? ['--to', String(to)] : [])], l => {
      if (/^Đang chờ lượt render/.test(l)) { job.step = 'Đang chờ lượt render khác…'; return; }
      const m = /([\d.]+)s \/ ([\d.]+)s/.exec(l);
      if (m) { job.step = 'Render khung hình'; job.progress = Math.min(.99, (+m[1] - (from ?? 0)) / total); }
    });
  } finally { fs.rmSync(tmpTl, { force: true }); }
  job.out = out;
  // Extra aspect ratios (references/reframe-dub.md): honest derivatives of the file just rendered.
  if (aspects?.length) {
    const { deriveAspects } = await import(pathToFileURL(path.join(SKILL, 'scripts/export_multi.mjs')).href);
    const r = await deriveAspects(P(out), aspects, { run, py: PY, onStep: s => { job.step = s; job.progress = 0; }, onProgress: k => { job.progress = Math.min(.99, k); } });
    job.outs = [{ aspect: r.native, out, note: 'Bản gốc (render thật)' }, ...r.outs.map(o => ({ ...o, out: path.relative(cur().dir, o.out) }))];
  }
  // S12 M100: bản giao vào <Kho>/Thanh pham/<YYYY-MM>/ (liên kết cứng). Lỗi giao không làm hỏng bản đã xuất trong out/.
  if (give !== false) {
    job.step = 'Giao vào Thành phẩm';
    await deliverFiles(job, () => (job.outs || [{ out }]).map((o, i) => ({ src: P(o.out), ...(i ? { aspect: o.aspect } : { w: vert ? W : H, h: vert ? H : W }) })), tl, { range: { from, to } });
  }
}
// async: copying to a Kho on another drive must not block the server (job polling, preview)
async function deliverFiles(into, outs, tl, { range, files = false } = {}) {
  try {
    const K = await import(pathToFileURL(path.join(SKILL, 'scripts/kho_deliver.mjs')).href);
    const list = typeof outs === 'function' ? outs() : outs; // built inside the try: a bad entry fails the delivery, not the export
    const r = files ? await K.deliverProjectAsync(cur().dir, list, { tl }) : await K.deliverExportsAsync(cur().dir, list, { tl, range });
    into.delivered = r.items.filter(x => x.dst).map(x => x.dst); into.deliveredDir = r.dir;
    const bad = r.items.find(x => x.error); if (bad) into.deliverError = bad.error;
  } catch (e) { into.deliverError = e.message; console.error('deliver:', e.message); }
  return into;
}
// "Video mới" pipeline lives in scripts/new_project.mjs (shared with scripts/autopilot.mjs).
// S17 M126: tạo video mới = đóng dự án đang mở (trình duyệt đã lưu nó trước khi gửi /api/new) rồi mở dự án mới sạch; trong lúc tạo
// không route nào ghi vào dự án cũ. Tạo hỏng thì mở lại dự án cũ để người dùng không bị bỏ ở màn trống.
async function newProject(o) {
  const { newProject: build } = await import(pathToFileURL(path.join(SKILL, 'scripts/new_project.mjs')).href);
  const prev = cur(), prevPid = curPid(); setReq(null);
  try {
    const d = await build(o, { run, onStep: (s, p) => { job.step = s; job.progress = p; } });
    job.pid = openProject(d); // tab đã tạo chuyển sang mã này khi job xong (X-AVS-Opened ở /api/job)
    job.out = d;
  } catch (e) {
    if (!cur() && prev) setReq(prev, prevPid);
    throw e;
  }
}
function startJob(kind, fn, payload) {
  if (job?.state === 'running') return false;
  job = { kind, state: 'running', progress: 0, step: 'Bắt đầu', log: '', out: null, started: Date.now(), tab: curPid(), dir: cur()?.dir || null };
  fn(payload).then(() => { job.state = 'done'; job.progress = 1; job.step = 'Xong'; })
    .catch(e => {
      // A stop the user asked for is not a failure: 'cancelled' / 'paused' (e.stopped from a route) so the UI shows it in amber, not red.
      const stopped = e?.stopped || (job.cancelled ? 'cancelled' : null);
      job.state = stopped || 'error';
      job.step = stopped && !e?.stopped ? 'Đã huỷ theo yêu cầu' : e.message;
      if (!stopped) console.error(e);
    });
  return true;
}
// Server stopped (app quit, Ctrl+C) while a job runs: stop it (render.mjs then closes its Chromes) and drop this run's temp timelines.
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => {
  if (job?.state === 'running') killTree(job.proc);
  for (const d of new Set([active?.dir, job?.dir].filter(Boolean))) for (const f of [`.export_${process.pid}.json`, `.still_${process.pid}.json`, `.cover_${process.pid}.json`]) fs.rmSync(path.join(d, f), { force: true });
  dropTokenFile();
  setTimeout(() => process.exit(0), 300);
});

// ---------- plugins: studio/routes/*.mjs ----------
// Each module: export default (ctx) => async (req, res, p, u) => true if handled. ctx gives access to the project, jobs and helpers.
const ctx = {
  HERE, SKILL, PY, json, body, under, sendFile, run, stamp, startJob, readProject, save, openProject: switchProject,
  get project() { return cur(); }, get job() { return job; }, P: rel => P(rel), purl, get pid() { return curPid(); }, tabs: TABS,
};
const ROUTES = [];
for (const f of fs.readdirSync(path.join(HERE, 'routes')).filter(f => f.endsWith('.mjs')).sort()) {
  try { ROUTES.push((await import(pathToFileURL(path.join(HERE, 'routes', f)).href)).default(ctx)); } catch (e) { console.error(`plugin ${f}:`, e.message); }
}
const FEATURES = () => fs.readdirSync(path.join(HERE, 'features')).filter(f => f.endsWith('.js')).sort();

// ---------- http ----------
// Session token: new each run, handed to the editor inside the main page (<meta name="avs-token">, read by studio/auth.js) and to
// local CLI clients through ~/.ai-video-studio/studio-<port>.token (mode 600). Every /api request must carry it.
const TOKEN = newToken();
// Browser session secret (cookie avs_s_<port>), separate from the API token: a cookie the browser also sends to other localhost
// ports (cookies are per host) does not work as X-AVS-Token. See references/studio.md for what it does and does not stop.
const SESSION = newToken();
function sendIndex(res) {
  const html = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8').replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta name="avs-token" content="${TOKEN}">`);
  res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  res.end(html);
}
// No session cookie (opened as a bare http://localhost:<port>, or the server restarted): explain how to get in, never the token.
// The page loads nothing else (no stylesheet), so it carries the few token values it needs, copied from studio/theme/tokens.css.
const LOCKED_CSS = `:root { color-scheme: dark;
  --color-canvas: 2 6 23; --color-fg: 248 250 252; --color-fg-muted: 203 213 225; --color-accent-text: 135 152 238; } /* design-token-ok: copy of tokens.css (canvas, fg, fg-muted, accent-text) */
body { max-width: 620px; margin: 12vh auto; padding: 0 16px; background: rgb(var(--color-canvas)); color: rgb(var(--color-fg)); font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
h2 { font-size: 22px; } .note { color: rgb(var(--color-fg-muted)); font-size: 13px; } a { color: rgb(var(--color-accent-text)); }`;
function sendLocked(res) {
  res.writeHead(401, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  res.end(`<!doctype html><meta charset="utf-8"><title>AI Video Studio</title><style>${LOCKED_CSS}</style><body>
<h2>Mở AI Video Studio bằng lối tắt</h2><p>Trang này cần mã phiên để bảo vệ dự án của bạn khỏi chương trình khác trên máy.</p>
<ul><li>Bấm đúp <b>AI Video Studio</b> ngoài Desktop (hoặc <code>studio.cmd</code> / <code>./studio.sh</code>). Studio đang chạy thì lối tắt chỉ mở lại trình duyệt đúng trang.</li>
<li>Hoặc mở link “Mở lại trong trình duyệt” in trong cửa sổ server.</li></ul>
<p class="note">Mã phiên nằm ở ~/.ai-video-studio/studio-${PORT}.token (chỉ tài khoản của bạn đọc được), đổi mỗi lần bật Studio.</p>
<p class="note">Tác giả: Nguyễn Tất Kiểm · <a href="https://nguyentatkiem.com.vn/aiplusntk/">Tặng khoá học AI miễn phí</a></p></body>`);
}
// S18 M129: dự án của request theo mã tab trong header X-AVS-Project; không có mã thì dự án mặc định. Mã của tab đã đóng (hay
// quá 8 tab nên bị đẩy ra) → 409 tabClosed với mọi /api trừ /api/tabs, để trang đó biết mà mở lại, không đọc / ghi nhầm dự án khác.
const server = http.createServer((req, res) => {
  const want = req.headers['x-avs-project'];
  let st;
  if (want) { const pr = TABS.get(String(want)); st = { project: pr, pid: pr ? String(want) : null, asked: String(want), closed: !pr }; if (pr) TABS.touch(st.pid); }
  else st = { project: active, pid: active ? tabId(active.dir) : null, asked: null };
  return als.run(st, () => handle(req, res));
});
async function handle(req, res) {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  // Local-only: this origin only (no other website, no other localhost port, no DNS-rebinding host).
  if (!sameOrigin(req, PORT)) return json(res, { error: 'forbidden' }, 403);
  if (p.startsWith('/api/') && !tokenOk(req, u, TOKEN)) return json(res, { error: 'Thiếu hoặc sai token phiên — tải lại trang Studio' }, 401);
  const bs = bodyStatus(req, p);
  if (bs) { res.setHeader('Connection', 'close'); return json(res, { error: bs === 413 ? 'Dữ liệu gửi lên quá lớn' : 'Cần Content-Length' }, bs); }
  if (als.getStore()?.closed && p.startsWith('/api/') && !p.startsWith('/api/tabs')) return json(res, { error: 'Tab dự án này đã đóng — mở lại từ thanh tab hoặc trang chủ', tabClosed: true }, 409);
  try {
    if (p === '/' || p === '/index.html') {
      // launch link ?k=<token> → session cookie, then drop the key from the address bar (history, screenshots)
      if (launchKeyOk(u, TOKEN)) { res.writeHead(302, { 'Set-Cookie': sessionCookie(PORT, SESSION), Location: '/', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); return res.end(); }
      return cookieOk(req, PORT, SESSION) ? sendIndex(res) : sendLocked(res);
    }
    if (p.startsWith('/studio/')) { const f = under(HERE, p.slice(8)); return f ? sendFile(req, res, f) : json(res, {}, 403); }
    if (p.startsWith('/engine/')) { const f = under(path.join(SKILL, 'engine'), p.slice(8)); return f ? sendFile(req, res, f) : json(res, {}, 403); }
    if (p.startsWith('/assets/')) { const f = under(path.join(SKILL, 'assets'), p.slice(8)); return f ? sendFile(req, res, f) : json(res, {}, 403); }
    if (p.startsWith('/templates/')) { const f = under(TPL_DIR, p.slice(11)); return f ? sendFile(req, res, f) : json(res, {}, 403); }
    if (p.startsWith('/cdn/')) { // jsDelivr through the disk cache: emoji/icons download once per machine
      const hit = await cached('https://cdn.jsdelivr.net/' + p.slice(5));
      if (!hit) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': hit.type, 'Content-Length': hit.body.length, 'Cache-Control': 'public, max-age=604800' }); return res.end(hit.body);
    }
    if (p === '/api/templates' && req.method === 'GET') return json(res, templateList());
    // Everything below that reads or writes project files needs an open project (plugin routes included).
    if (!cur() && /^\/api\/(save|history|waveform|export|autosfx|media|upload|still|srt|reveal|templates\/media|transcribe|reframe|dub(?!\/voices)|stock\/fetch|genimage|segment|sticker|audio|broll\/suggest)(\/|$)/.test(p)) return json(res, { error: 'Chưa mở dự án' }, 400);
    if (p === '/api/templates/media' && req.method === 'POST') {
      // Copy every "media/…" file a template references from the skill's examples/media into the project (never overwrites).
      const { id } = await body(req);
      const f = [path.join(SKILL, 'templates', `${id}.json`), path.join(SKILL, 'templates/user', `${id}.json`)].find(x => fs.existsSync(x));
      let copied = 0;
      if (f) for (const m of new Set(fs.readFileSync(f, 'utf8').match(/media\/[^"%]+?\.(?:jpe?g|png|webp)/g) || [])) {
        const src = under(path.join(SKILL, 'examples'), m), dst = under(cur().dir, m);
        if (src && dst && fs.existsSync(src) && !fs.existsSync(dst)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); copied++; }
      }
      // Frame-sequence folders ("media/sc_demo/%03d.jpg") are copied whole.
      if (f) for (const dir of new Set((fs.readFileSync(f, 'utf8').match(/media\/[^"%]+\/(?=%0\dd)/g) || []))) {
        const src = under(path.join(SKILL, 'examples'), dir), dst = under(cur().dir, dir);
        if (src && dst && fs.existsSync(src) && !fs.existsSync(dst)) { fs.cpSync(src, dst, { recursive: true }); copied++; }
      }
      return json(res, { copied });
    }
    if (p === '/api/templates/save' && req.method === 'POST') return json(res, await saveTemplate(await body(req)));
    if (p.startsWith('/project/')) {
      // project files: the editor's cookie (img/video/iframe/links send it) or the API token (CLI clients)
      if (!cookieOk(req, PORT, SESSION) && !tokenOk(req, u, TOKEN)) return json(res, { error: 'Thiếu phiên Studio — mở lại bằng lối tắt' }, 401);
      if (!cur()) return json(res, { error: 'no project' }, 404);
      const f = under(cur().dir, p.slice(9));
      return f && fileAllowed(f) ? sendFile(req, res, f) : json(res, {}, 403);
    }
    if (/^\/p\/[a-f0-9]{12}\//.test(p)) { // S18 M129: file của dự án một tab (img/video/audio không gửi được header)
      if (!cookieOk(req, PORT, SESSION) && !tokenOk(req, u, TOKEN)) return json(res, { error: 'Thiếu phiên Studio — mở lại bằng lối tắt' }, 401);
      const pr = TABS.get(p.slice(3, 15));
      if (!pr) return json(res, { error: 'Tab này đã đóng' }, 404);
      const f = under(pr.dir, p.slice(16));
      return f && fileAllowed(f) ? sendFile(req, res, f) : json(res, {}, 403);
    }
    if (p === '/api/project' && req.method === 'GET') {
      if (!cur()) return json(res, { error: 'Chưa mở dự án' }, 404);
      const rp = readProject(); rp.meta.kho = khoOf(rp.timeline);
      // mã tab của dự án này (trang mở không có ?p= nhận mã ở đây rồi ghi lên thanh địa chỉ) + gốc URL file của nó
      rp.meta.pid = curPid() || TABS.open(cur().dir).id; rp.meta.base = `/p/${rp.meta.pid}/`;
      return json(res, rp);
    }
    if (p === '/api/save' && req.method === 'POST') return json(res, save(await body(req)));
    if (p === '/api/history') {
      const d = path.join(cur().dir, '.studio/history');
      if (!fs.existsSync(d)) return json(res, []);
      return json(res, fs.readdirSync(d).filter(f => f.endsWith('.json')).sort().reverse().map(f => f.replace('.json', '')));
    }
    if (p.startsWith('/api/history/')) {
      const f = under(path.join(cur().dir, '.studio/history'), p.slice(13) + '.json');
      return f && fs.existsSync(f) ? json(res, JSON.parse(fs.readFileSync(f, 'utf8'))) : json(res, {}, 404);
    }
    if (p === '/api/library') return json(res, library());
    if (p === '/api/waveform') return waveform(w => json(res, w));
    if (p === '/api/broll') {
      const q = u.searchParams.get('q') || '';
      return execFile('node', [path.join(SKILL, 'scripts/broll.mjs'), 'search', q], { maxBuffer: 1 << 22 }, (e, out) =>
        json(res, (out || '').split('\n').filter(Boolean).slice(0, 30).map(l => { const m = l.trim().split(/\s{2,}/); return { id: m[1], template: m[2], text: m[3] }; }).filter(x => x.id)));
    }
    if (p === '/api/export' && req.method === 'POST') {
      const b = await body(req), num = v => v == null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
      if (b.quality != null && !['720', '1080', '4k'].includes(String(b.quality))) return json(res, { ok: false, error: 'Chất lượng phải là 720, 1080 hoặc 4k' }, 400);
      if (!num(b.from) || !num(b.to) || (b.from != null && b.to != null && b.to <= b.from)) return json(res, { ok: false, error: 'Đoạn xuất (from/to) không hợp lệ' }, 400);
      if (b.aspects != null && !Array.isArray(b.aspects)) return json(res, { ok: false, error: 'aspects phải là danh sách' }, 400);
      if (b.deliver != null && typeof b.deliver !== 'boolean') return json(res, { ok: false, error: 'deliver phải là true/false' }, 400);
      const ok = startJob('export', exportVideo, { ...b, quality: b.quality == null ? undefined : String(b.quality) });
      return json(res, ok ? { ok } : { ok, error: 'Đang có tác vụ khác chạy' }, ok ? 200 : 409);
    }
    if (p === '/api/new' && req.method === 'POST') {
      const b = await body(req);
      if (typeof b.video !== 'string' || !b.video.trim()) return json(res, { ok: false, error: 'Chọn video thô trước' }, 400);
      const ok = startJob('new', newProject, b); return json(res, ok ? { ok } : { ok, error: 'Đang có tác vụ khác chạy' }, ok ? 200 : 409);
    }
    if (p === '/api/autosfx' && req.method === 'POST') {
      const b = await body(req);
      return execFile(PY, ['-I', '-X', 'utf8', path.join(SKILL, 'scripts/auto_sfx.py'), cur().tlFile, ...(b.keep ? ['--keep-manual'] : [])], (e, out, err) =>
        e ? json(res, { error: (err || e.message).slice(-500) }, 500) : json(res, readProject()));
    }
    if (p === '/api/media') return json(res, mediaList());
    if (p === '/api/upload' && req.method === 'POST') { await upload(req, u.searchParams.get('name') || 'file.bin'); return json(res, mediaList()); }
    // Writing files: POST only (M37).
    // b.deliver: giao kèm vào Thanh pham/ của Kho (S12 M100)
    if (p === '/api/still' && req.method === 'POST') {
      const b = await body(req), t = Math.max(0, +b.t || 0);
      return still(t).then(async out => json(res, b.deliver === true ? await deliverFiles({ out }, [{ src: P(out), name: `${path.basename(cur().dir)} - ảnh bìa ${String(+t.toFixed(1)).replace('.', '_')}s.jpg` }], readProject().timeline, { files: true }) : { out }))
        .catch(e => json(res, { error: e.message }, e.status || 500));
    }
    if (p === '/api/srt' && req.method === 'POST') {
      const b = await body(req), { captions, timeline } = readProject(); fs.mkdirSync(P('out'), { recursive: true });
      // a delivered .srt is a hard link to this file: write a new file (rm, then write), never in place
      const out = `out/${path.basename(cur().dir)}.srt`; fs.rmSync(P(out), { force: true }); fs.writeFileSync(P(out), srt(captions));
      return json(res, b.deliver === true ? await deliverFiles({ out }, [{ src: P(out), name: `${path.basename(cur().dir)}.srt` }], timeline, { files: true }) : { out });
    }
    if (p === '/api/job') {
      // job tạo dự án (Video mới) xong: tab đã khởi chạy nó chuyển sang dự án mới (auth.js đọc X-AVS-Opened)
      // chỉ một lần: trang mở lại tab cũ sau đó (boot gọi /api/job) không bị kéo sang dự án mới
      if (job?.state === 'done' && job.pid && !job.openedSent && job.tab === curPid() && job.pid !== curPid()) { res.setHeader('X-AVS-Opened', job.pid); job.openedSent = true; }
      return json(res, job ? { ...job, proc: undefined } : null);
    }
    if (p === '/api/job/cancel' && req.method === 'POST') { if (job?.state === 'running') job.cancelled = true; killTree(job?.proc); return json(res, { ok: true }); }
    if (p === '/api/open' && req.method === 'POST') { const b = await body(req); switchProject(b.path); return json(res, { ok: true }); } // refused → 400/403
    if (p === '/api/reveal' && req.method === 'POST') { const b = await body(req); const f = under(cur().dir, b.path || ''); if (f) revealPath(f); return json(res, { ok: !!f }); }
    if (p === '/api/features') return json(res, FEATURES());
    for (const r of ROUTES) if (await r(req, res, p, u)) return;
    json(res, { error: 'not found' }, 404);
  } catch (e) { if (!e.status) console.error(e); if (!res.headersSent) json(res, { error: e.message }, e.status || 500); }
}

if (args[0] === '--new') {
  job = { kind: 'new', state: 'running', progress: 0, step: '', log: '' };
  // S16 M120: thiếu thư viện (faster-whisper…) hay video hỏng: báo một dòng rồi vẫn mở Studio (màn Kiểm tra máy cài giúp được),
  // không để lỗi bay ra ngoài làm sập server kèm stack trace
  try {
    await newProject({ video: args[1], dir: args[2] && !args[2].startsWith('--') ? args[2] : undefined });
    console.log(`starter project: ${active.dir}`);
  } catch (e) {
    console.error(`Không tạo được dự án từ ${path.basename(String(args[1] || ''))}: ${e.message}`);
    console.error(/Thiếu thư viện|Không tìm thấy|chạy lại bộ cài/.test(e.message)
      ? 'Studio vẫn mở: vào menu ⋯ → Kiểm tra máy để cài phần còn thiếu, rồi tạo lại dự án từ trang chủ.'
      : 'Studio vẫn mở: tạo lại dự án từ trang chủ.');
  }
  job = null; // otherwise every later job (export, AI…) is refused as "already running"
} else if (args[0] && !args[0].startsWith('--')) openProject(args[0]);

// Studio already running on this port (e.g. the shortcut was clicked twice): just show it instead of crashing.
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.log(`Cổng ${PORT} đang chạy AI Video Studio → mở trình duyệt`);
  // the running Studio's token file → the launch link (sets its session cookie); no file → plain address (shows how to get in)
  let tok = ''; try { tok = fs.readFileSync(tokenFile(PORT), 'utf8').trim(); } catch {}
  if (args.includes('--open')) openPath(tok ? launchUrl(PORT, tok) : `http://localhost:${PORT}`);
  setTimeout(() => process.exit(0), 1500);
});
let tokFile = null;
function dropTokenFile() { try { if (tokFile && fs.readFileSync(tokFile, 'utf8') === TOKEN) fs.rmSync(tokFile, { force: true }); } catch {} }
process.on('exit', dropTokenFile);
server.listen(PORT, '127.0.0.1', () => {
  try { tokFile = writeTokenFile(PORT, TOKEN); } catch (e) { console.error('token file', tokenFile(PORT), e.message); }
  const link = `http://localhost:${PORT}`;
  console.log(`AI Video Studio ${VERSION} → ${link}`);
  console.log(`Mở lại trong trình duyệt: ${launchUrl(PORT, TOKEN)}`);
  console.log('Tác giả: Nguyễn Tất Kiểm · Tặng khoá học AI miễn phí: https://nguyentatkiem.com.vn/aiplusntk/');
  if (args.includes('--open')) openPath(launchUrl(PORT, TOKEN));
});
