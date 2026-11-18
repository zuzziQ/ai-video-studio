// Kiểm tra máy (ROADMAP S15 M115): Studio có đủ thư viện để chạy chưa. Danh sách lấy từ chính trình cài.
//   GET  /api/setup/check[?fresh=1]  → {ready, platform, install, items:[{id, label, need, status, version, note, features, api, fix}], seen, ms, at}
//        status: ok | missing | old (phiên bản thấp) | na (không cần trên máy này, vd không có GPU NVIDIA; Ollama đang tắt)
//        need: required (thiếu thì Studio hỏng) | recommended (M117: trình cài cài sẵn, thiếu thì lần đầu dùng phải chờ tải) | optional
//        Kết quả giữ trong bộ nhớ 5 phút (fresh=1 kiểm lại). Không cài gì, không chạy trình cài.
//   POST /api/setup/seen {missing:[id…]} → ghi $AVS_HOME/setup.json (đã xem màn này, các mục bắt buộc còn thiếu lúc bấm "Để sau")
//   POST /api/setup/install {id}         → M116: cài giúp, chạy như job của Studio (theo dõi qua /api/job). id = "all" chạy lại trình cài
//        (install.ps1 -Yes / install.sh), id của một mục chạy lệnh cài lẻ (item.auto === 'item'). Lệnh do server dựng từ danh sách cho phép
//        (fixPlan), trình duyệt chỉ gửi id. Xong thì (Windows) đọc lại PATH của máy vào tiến trình server và xoá cache để kiểm lại.
//        AVS_SETUP_DRY=1: chỉ in lệnh sẽ chạy (thử giao diện mà không cài thật).
//   POST /api/setup/reveal               → mở thư mục chứa install.cmd / install.sh (Finder / Explorer)
// Gói pip đọc từ các dòng `pip install` của install.ps1 (Windows) / scripts/setup.sh (macOS, Linux): thêm gói vào trình cài là
// màn này thấy ngay. META chỉ thêm nhãn, mức bắt buộc và tính năng; gói không có META hiện thành mục tuỳ chọn.
// Không trả token, nội dung .env hay đường dẫn tới file bí mật: chỉ phiên bản, có/thiếu và lệnh cài.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { AVS_HOME } from '../security.mjs';
import { findVenvPython, venvRel } from '../../scripts/platform.mjs';

const TTL = 5 * 60 * 1000, STEP_MS = 2500;
const IS_WIN = process.platform === 'win32';

// Gói pip: tên dist → mục. `items` gộp nhiều dist vào một mục (cuBLAS + cuDNN).
export const PIP_META = {
  'faster-whisper': { id: 'faster-whisper', label: 'faster-whisper', need: 'required', features: 'Tách lời thoại, phụ đề, làm sạch lời nói', api: ['/api/transcribe', '/api/new', '/api/longform/upload', '/api/autopilot'] },
  numpy: { id: 'numpy', label: 'numpy', need: 'required', features: 'Âm thanh (lọc ồn, nhịp, tự chèn SFX), bám mặt', api: ['/api/audio/', '/api/autosfx'] },
  scipy: { id: 'scipy', label: 'scipy', need: 'required', features: 'Âm thanh: lọc, nhận nhịp, tự chèn SFX', api: ['/api/audio/', '/api/autosfx'] },
  pillow: { id: 'pillow', label: 'pillow', need: 'required', features: 'Ảnh: sticker, ảnh bìa, màu logo', api: ['/api/sticker', '/api/publish/cover'] },
  rembg: { id: 'rembg', label: 'rembg', need: 'recommended', features: 'Tách nền người / vật (sticker, cắt nền)', api: ['/api/segment', '/api/sticker'] },
  'edge-tts': { id: 'edge-tts', label: 'edge-tts', need: 'recommended', features: 'Giọng đọc online (lồng tiếng edge-tts)', api: ['/api/dub'] },
  'nvidia-cublas-cu12': { id: 'cuda', label: 'cuBLAS (CUDA 12) cho whisper GPU', need: 'recommended', features: 'Tách lời thoại bằng GPU NVIDIA (nhanh hơn nhiều lần)', api: [], gpu: true },
  // onnxruntime (M117, cài rõ trong trình cài): thuộc mục "yunet" (bám mặt), kiểm ở đó
  onnxruntime: { id: 'yunet', label: 'onnxruntime', need: 'recommended', features: 'Bám mặt YuNet, lọc giọng nói (VAD) của whisper', api: ['/api/reframe'] },
  'nvidia-cudnn-cu12': { id: 'cuda', label: 'cuBLAS (CUDA 12) cho whisper GPU', need: 'recommended', features: 'Tách lời thoại bằng GPU NVIDIA (nhanh hơn nhiều lần)', api: [], gpu: true },
};

/** Gói pip trình cài của hệ điều hành này cài: [{dist, spec}] (spec là chữ đưa cho pip, vd "rembg[cpu]"). */
export function pipFromInstallers(skill, platform = process.platform) {
  const file = platform === 'win32' ? path.join(skill, 'install.ps1') : path.join(skill, 'scripts/setup.sh');
  let txt = '';
  try { txt = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [], seen = new Set();
  for (const line of txt.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/pip(?:\.exe)?\s+(?:-\S+\s+)*install\s+(.+?)(?:;|\|\||&&|$)/);
    if (!m) continue;
    for (const tok of m[1].trim().split(/\s+/)) {
      const spec = tok.replace(/^['"]|['"]$/g, '');
      if (!spec || spec.startsWith('-') || spec === 'pip') continue;
      const dist = spec.replace(/\[.*$/, '').replace(/[<>=!~].*$/, '').toLowerCase();
      if (/^[a-z0-9][a-z0-9._-]*$/.test(dist) && !seen.has(dist)) { seen.add(dist); out.push({ dist, spec }); }
    }
  }
  return out;
}

// ---------- helpers ----------
// Python của .venv dùng được: của skill, hoặc (worktree) của thư mục chính; chưa có ở đâu thì scripts/.venv của skill
// (để báo thiếu và để lệnh cài tạo venv ở đó).
export const venvPy = (skill, platform = process.platform) => findVenvPython(skill, { platform }) || path.join(skill, 'scripts', venvRel(platform));
// Tìm lệnh trên PATH mà không chạy shell (nhanh, không spawn).
export function which(cmd, env = process.env) {
  const exts = IS_WIN ? (env.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(Boolean) : [''];
  for (const dir of String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean)) {
    for (const e of exts) {
      const f = path.join(dir, cmd + e);
      try { if (fs.statSync(f).isFile()) return f; } catch {
        // App alias của Windows (WindowsApps\winget.exe) là reparse point: stat lỗi, lstat đọc được
        try { if (fs.lstatSync(f).isSymbolicLink()) return f; } catch { /* không có */ }
      }
    }
  }
  return null;
}
const exec = (cmd, args, timeout = STEP_MS) => new Promise(ok => {
  try {
    execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 1 << 20, encoding: 'utf8' }, (e, out, err) => ok({ ok: !e, out: String(out || ''), err: String(err || '') }));
  } catch (e) { ok({ ok: false, out: '', err: e.message }); }
});
const major = v => parseInt(String(v || '').split('.')[0], 10) || 0;
const verGe = (v, [a, b]) => { const [x, y] = String(v || '').split('.').map(n => parseInt(n, 10) || 0); return x > a || (x === a && y >= b); };
const q = s => (/[\s()&]/.test(s) ? `"${s}"` : s);

// Lệnh cài theo hệ điều hành. Lệnh chung là chạy lại trình cài (cài đủ mọi thứ, mục có rồi thì bỏ qua).
function commands(skill, platform) {
  const win = platform === 'win32', mac = platform === 'darwin';
  const vpy = q(venvPy(skill, platform));
  const pip = spec => `${vpy} -m pip install ${/[[<>]/.test(spec) ? `"${spec}"` : spec}`;
  const pick = (w, m, l) => (win ? w : mac ? m : l);
  return {
    install: win ? `powershell -ExecutionPolicy Bypass -File ${q(path.join(skill, 'install.ps1'))}` : `bash ${q(path.join(skill, 'install.sh'))}`,
    pip,
    prefetch: name => `${vpy} -I ${q(path.join(skill, 'scripts', 'prefetch_models.py'))} --model ${name}`,
    ffmpeg: pick('winget install --id Gyan.FFmpeg -e', 'brew install ffmpeg', 'sudo apt install ffmpeg'),
    node: pick('winget install --id OpenJS.NodeJS.LTS -e', 'brew install node', 'Cài Node.js LTS tại https://nodejs.org'),
    venv: pick(`py -3 -m venv ${q(path.join(skill, 'scripts', '.venv'))}  (chưa có Python 3.10+: winget install --id Python.Python.3.12 -e)`,
      `python3 -m venv ${q(path.join(skill, 'scripts', '.venv'))}  (chưa có Python 3.10+: brew install python)`,
      `python3 -m venv ${q(path.join(skill, 'scripts', '.venv'))}  (chưa có: sudo apt install python3 python3-venv)`),
    chrome: pick('winget install --id Google.Chrome -e', 'brew install --cask google-chrome', 'Cài Google Chrome tại https://www.google.com/chrome/'),
    npm: `npm install --prefix ${q(path.join(skill, 'scripts'))}`,
    headless: `node ${q(path.join(skill, 'scripts', 'install_headless_shell.mjs'))}`,
    ollama: pick('winget install --id Ollama.Ollama -e', 'brew install ollama', 'curl -fsSL https://ollama.com/install.sh | sh'),
    vieneu: win ? `powershell -ExecutionPolicy Bypass -File ${q(path.join(skill, 'scripts', 'install_vieneu.ps1'))}` : 'Xem references/engines.md mục VieNeu (bản cài một lệnh hiện chỉ có cho Windows)',
    claude: 'npm install -g @anthropic-ai/claude-code  (rồi chạy claude một lần để đăng nhập)',
  };
}

// ---------- mô hình tải sẵn (M117): danh sách ở scripts/models.json, tải bằng scripts/prefetch_models.py ----------
export function loadModels(skill) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(skill, 'scripts/models.json'), 'utf8'));
    return [...(m.whisper || []).map(x => ({ ...x, kind: 'whisper' })), ...(m.rembg || []).map(x => ({ ...x, kind: 'rembg' }))]
      .filter(x => typeof x.name === 'string' && /^[\w.-]{1,40}$/.test(x.name));
  } catch { return []; }
}
const homeOf = env => env.USERPROFILE || env.HOME || os.homedir();
// Cache Hugging Face mà faster_whisper.download_model dùng (mặc định của huggingface_hub)
export const hfCache = env => env.HF_HUB_CACHE || (env.HF_HOME ? path.join(env.HF_HOME, 'hub') : path.join(env.XDG_CACHE_HOME || path.join(homeOf(env), '.cache'), 'huggingface', 'hub'));
/** Mô hình đã có trên máy chưa (chỉ xem file, không import thư viện). */
export function modelPresent(m, env = process.env) {
  if (m.kind === 'whisper') {
    const snaps = path.join(hfCache(env), `models--${String(m.repo || '').replace(/\//g, '--')}`, 'snapshots');
    try { return fs.readdirSync(snaps).some(d => fs.existsSync(path.join(snaps, d, 'model.bin'))); } catch { return false; }
  }
  // rembg: bản cũ ~/.u2net/<tên>.onnx (U2NET_HOME), bản mới <REMBG_HOME | XDG_DATA_HOME/rembg | ~/.rembg>/models/<tên>…
  const dirs = [env.U2NET_HOME, path.join(homeOf(env), '.u2net'), env.REMBG_HOME && path.join(env.REMBG_HOME, 'models'),
    env.XDG_DATA_HOME && path.join(env.XDG_DATA_HOME, 'rembg', 'models'), path.join(homeOf(env), '.rembg', 'models')].filter(Boolean);
  return dirs.some(d => { try { return fs.readdirSync(d).some(f => f.startsWith(m.name)); } catch { return false; } });
}
const modelId = m => `${m.kind}-${m.name}`;

// ---------- cài giúp (M116) ----------
// npm của chính Node đang chạy Studio (npm.cmd trên Windows không spawn được nếu không qua shell).
export function npmCli(exec = process.execPath) {
  const d = path.dirname(exec);
  return [path.join(d, 'node_modules/npm/bin/npm-cli.js'), path.join(d, '../lib/node_modules/npm/bin/npm-cli.js')].find(f => fs.existsSync(f)) || null;
}
const PIP_IDS = new Set(Object.values(PIP_META).map(m => m.id));
/** Spec pip (như trình cài viết) của một mục. */
export function pipSpecs(id, skill, platform = process.platform) {
  if (id === 'yunet') return ['onnxruntime'];
  return pipFromInstallers(skill, platform).filter(p => (PIP_META[p.dist]?.id || p.dist) === id).map(p => p.spec);
}
// Mục trình cài lo được (chạy lại trình cài là có): ffmpeg/Node qua winget (Windows), .venv + pip, npm, headless-shell.
const BY_INSTALLER = new Set(['ffmpeg', 'ffprobe', 'node', 'venv', 'puppeteer-core', 'headless-shell', 'claude', 'yunet', ...PIP_IDS]);
const isModelId = id => /^(whisper|rembg)-[\w.-]+$/.test(id);
/**
 * Các bước [{cmd, argv, label}] để cài một mục, hoặc null khi không cài lẻ được (dùng trình cài hoặc cài tay).
 * o: {skill, platform, venv (có scripts/.venv chạy được), winget, brew (đường dẫn hoặc null), npm (npm-cli.js), node, puppeteer}
 */
// Đường dẫn tuyệt đối: ctx.run chạy với cwd = thư mục dự án, và Windows tìm tên lệnh trần ở cwd trước (dự án lạ có powershell.exe giả).
export const POWERSHELL = path.win32.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const PKG = { ffmpeg: ['Gyan.FFmpeg', 'ffmpeg'], ffprobe: ['Gyan.FFmpeg', 'ffmpeg'], chrome: ['Google.Chrome', '--cask google-chrome'], ollama: ['Ollama.Ollama', 'ollama'], node: ['OpenJS.NodeJS.LTS', 'node'] };
export function fixPlan(id, o) {
  const win = o.platform === 'win32', mac = o.platform === 'darwin', node = o.node || process.execPath;
  if (id === 'all') return win
    ? [{ cmd: POWERSHELL, argv: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(o.skill, 'install.ps1'), '-Yes'], label: 'Chạy trình cài (install.ps1)' }]
    : [{ cmd: '/bin/bash', argv: [path.join(o.skill, 'install.sh')], label: 'Chạy trình cài (install.sh)' }];
  const vpy = venvPy(o.skill, o.platform);
  // mô hình: tải bằng prefetch_models.py trong .venv (cần thư viện của nó: faster-whisper / rembg)
  if (isModelId(id)) {
    const m = loadModels(o.skill).find(x => modelId(x) === id);
    return m && o.venv && (o.pkgs?.[m.kind === 'whisper' ? 'faster-whisper' : 'rembg'] ?? true)
      ? [{ cmd: vpy, argv: ['-I', path.join(o.skill, 'scripts', 'prefetch_models.py'), '--model', m.name], label: `Tải mô hình ${m.name} (~${m.gb} GB)` }] : null;
  }
  if (PIP_IDS.has(id) || id === 'yunet') {
    const specs = pipSpecs(id, o.skill, o.platform);
    return o.venv && specs.length ? [{ cmd: vpy, argv: ['-m', 'pip', 'install', ...specs], label: `pip install ${specs.join(' ')}` }] : null;
  }
  const pkg = Object.hasOwn(PKG, id) ? PKG[id] : null;
  // winget trả mã khác 0 khi gói đã có / không có bản nâng: coi là xong (okText)
  if (pkg && win && o.winget) return [{ cmd: o.winget, argv: ['install', '--id', pkg[0], '-e', '--silent', '--accept-source-agreements', '--accept-package-agreements'], label: `winget install ${pkg[0]}`,
    okText: /already installed|No available upgrade|No applicable upgrade|No newer package/i }];
  if (pkg && mac && o.brew) return [{ cmd: o.brew, argv: ['install', ...pkg[1].split(' ')], label: `brew install ${pkg[1]}` }];
  if (id === 'puppeteer-core' && o.npm) return [{ cmd: node, argv: [o.npm, 'install', '--prefix', path.join(o.skill, 'scripts')], label: 'npm install (scripts)' }];
  if (id === 'headless-shell' && o.puppeteer) return [{ cmd: node, argv: [path.join(o.skill, 'scripts', 'install_headless_shell.mjs')], label: 'Tải chrome-headless-shell' }];
  if (id === 'claude' && o.npm) return [{ cmd: node, argv: [o.npm, 'install', '-g', '@anthropic-ai/claude-code'], label: 'npm install -g @anthropic-ai/claude-code' }];
  return null;
}
// Windows: winget ghi PATH mới vào registry, tiến trình server vẫn giữ PATH cũ → nối thêm các thư mục mới để ffmpeg… dùng được ngay.
function refreshPathWin() {
  if (!IS_WIN) return Promise.resolve(false);
  const ps = "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')";
  return exec(POWERSHELL, ['-NoProfile', '-Command', ps], 5000).then(r => {
    if (!r.ok) return false;
    const key = Object.keys(process.env).find(k => k.toUpperCase() === 'PATH') || 'Path';
    const cur = String(process.env[key] || '').split(';').filter(Boolean), low = new Set(cur.map(d => d.toLowerCase()));
    const add = r.out.trim().split(';').map(d => d.trim()).filter(d => d && !low.has(d.toLowerCase()));
    if (add.length) process.env[key] = [...cur, ...add].join(';');
    return add.length > 0;
  });
}

const PROBE = `import sys, json
from importlib import metadata as m
import importlib.util as u
o = {"py": "%d.%d.%d" % sys.version_info[:3], "d": {}, "ort": u.find_spec("onnxruntime") is not None}
for d in sys.argv[1:]:
    try: o["d"][d] = m.version(d)
    except Exception: o["d"][d] = None
print(json.dumps(o))`;

/** Kiểm cả máy. env/skill/platform truyền vào được để test. Mỗi bước có timeout; các bước chạy song song. */
export async function checkAll({ skill, env = process.env, platform = process.platform, avsHome = AVS_HOME() } = {}) {
  const t0 = Date.now(), C = commands(skill, platform);
  const pipList = pipFromInstallers(skill, platform);
  const item = (id, label, need, features, api = []) => ({ id, label, need, status: 'missing', version: '', note: '', features, api, fix: '' });

  const ffmpegP = (async () => {
    const out = [];
    for (const [id, label] of [['ffmpeg', 'ffmpeg'], ['ffprobe', 'ffprobe']]) {
      const it = item(id, label, 'required', id === 'ffmpeg' ? 'Mở và nhập video, tách khung hình, sóng âm, xuất video' : 'Đọc thời lượng, kích thước video nguồn',
        ['/api/upload', '/api/new', '/api/export', '/api/waveform', '/api/frames/', '/api/still', '/api/longform/', '/api/batch/start']);
      it.fix = C.ffmpeg;
      const exe = which(id, env);
      if (exe) {
        const r = await exec(exe, ['-version']);
        const v = (r.out.match(/version\s+n?([\w.-]+)/) || [])[1] || '';
        if (r.ok) { it.status = 'ok'; it.version = v; } else it.note = 'Có trên PATH nhưng không chạy được';
      }
      out.push(it);
    }
    return out;
  })();

  const node = item('node', 'Node.js ≥ 18', 'required', 'Chạy Studio, render, các script', []);
  node.version = process.versions.node; node.status = major(process.versions.node) >= 18 ? 'ok' : 'old'; node.fix = C.node;

  // Python của .venv + mọi gói pip trong một lần chạy (không import gói nặng: chỉ đọc metadata).
  const vpy = venvPy(skill);
  const pyP = (async () => {
    if (!fs.existsSync(vpy)) return null;
    const dists = [...new Set(pipList.map(p => p.dist))];
    const r = await exec(vpy, ['-I', '-c', PROBE, ...dists]);
    try { return JSON.parse(r.out.trim().split(/\r?\n/).pop()); } catch { return { py: '', d: {}, ort: false, broken: true }; }
  })();

  const chrome = item('chrome', 'Google Chrome hoặc Microsoft Edge', 'required', 'Render và xuất video, ảnh bìa, khung xem trước', ['/api/export', '/api/still', '/api/publish/cover', '/api/batch/start', '/api/longform/export']);
  chrome.fix = C.chrome;
  const chromeP = (async () => {
    const { findChrome } = await import(pathToFileURL(path.join(skill, 'scripts/platform.mjs')).href);
    const exe = findChrome();
    if (exe) { chrome.status = 'ok'; chrome.note = /msedge|Edge/i.test(exe) ? 'Microsoft Edge' : /chromium/i.test(exe) ? 'Chromium' : 'Google Chrome'; }
  })().catch(() => {});

  const pup = item('puppeteer-core', 'puppeteer-core (node_modules)', 'required', 'Điều khiển Chrome để render và xuất video', chrome.api);
  pup.fix = C.npm;
  try { pup.version = JSON.parse(fs.readFileSync(path.join(skill, 'scripts/node_modules/puppeteer-core/package.json'), 'utf8')).version || ''; pup.status = 'ok'; } catch { /* chưa npm install */ }

  // ---------- cài sẵn (nên có) và tuỳ chọn ----------
  const hs = item('headless-shell', 'chrome-headless-shell', 'recommended', 'Render nhanh hơn (không có thì render bằng Chrome đã cài)');
  hs.fix = C.headless;
  try {
    const { findHeadlessShell } = await import(pathToFileURL(path.join(skill, 'scripts/render_hw.mjs')).href);
    const f = findHeadlessShell({ ...env, AVS_HOME: avsHome });
    if (f) { hs.status = 'ok'; hs.version = (f.match(/\d+(\.\d+){2,3}/) || [''])[0]; }
  } catch { /* render_hw lỗi: coi như chưa có */ }

  const ollama = item('ollama', 'Ollama', 'optional', 'LLM chạy trên máy cho việc chỉ có chữ (thay Claude khi chọn trong Mô hình & giọng)', []);
  ollama.fix = C.ollama;
  const ollamaP = (async () => {
    const exe = which('ollama', env);
    let url = 'http://127.0.0.1:11434', on = false;
    try { const L = await import(pathToFileURL(path.join(skill, 'scripts/llm.mjs')).href); const c = L.llmConfig(); url = L.loopbackUrl(c.ollama.url); on = !!c.ollama.enabled; } catch { /* mặc định */ }
    // M117: Ollama tắt mặc định (dùng Claude Code); không dò máy chủ khi đang tắt
    if (!on) { ollama.status = 'na'; ollama.note = 'Đang tắt: Studio dùng Claude Code (bật trong Mô hình & giọng)'; return; }
    try {
      const r = await fetch(url + '/api/version', { signal: AbortSignal.timeout(800), redirect: 'error' });
      ollama.version = String((await r.json()).version || ''); ollama.status = 'ok'; ollama.note = 'Đang chạy';
    } catch { if (exe) { ollama.status = 'ok'; ollama.note = 'Đã cài, chưa chạy (mở Ollama khi cần)'; } }
  })();

  const vieneu = item('vieneu', 'VieNeu (giọng Việt trên máy)', 'optional', 'Giọng đọc tiếng Việt trên máy, nhái giọng', []);
  vieneu.fix = C.vieneu;
  try {
    const T = await import(pathToFileURL(path.join(skill, 'scripts/tts_config.mjs')).href);
    const vp = T.readConfig().tts?.vieneu?.python;
    if (vp && fs.existsSync(vp)) { vieneu.status = 'ok'; vieneu.note = 'Đã cài'; }
  } catch { /* chưa có config */ }

  const claude = item('claude', 'Claude Code CLI', 'recommended', 'AI dựng giúp, Tạo style, trợ lý điền, QC bằng AI, lồng tiếng có kịch bản', ['/api/ai/', '/api/assist', '/api/stylelab/analyze', '/api/stylelab/generate', '/api/agent/']);
  claude.fix = C.claude;
  if (env.CLAUDE_BIN ? fs.existsSync(env.CLAUDE_BIN) : which('claude', env)) claude.status = 'ok';
  else if (!env.CLAUDE_BIN) {
    const home = env.USERPROFILE || env.HOME || '';
    const extra = IS_WIN ? [path.join(home, '.local/bin/claude.exe'), path.join(env.APPDATA || '', 'npm/claude.cmd')] : [path.join(home, '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
    if (extra.some(f => f && fs.existsSync(f))) claude.status = 'ok';
  }
  if (claude.status === 'ok') claude.note = 'Mô hình AI mặc định (lần đầu chạy claude một lần để đăng nhập)';

  const gpu = !!which('nvidia-smi', env);
  const [ff, py] = await Promise.all([ffmpegP, pyP, chromeP, ollamaP]);

  const venv = item('venv', 'Python 3.10+ trong scripts/.venv', 'required', 'Mọi script Python: tách lời thoại, âm thanh, ảnh, bám mặt', ['/api/transcribe', '/api/audio/', '/api/autosfx', '/api/reframe', '/api/segment', '/api/sticker', '/api/dub']);
  venv.fix = C.venv;
  if (py) {
    venv.version = py.py;
    venv.status = py.broken ? 'missing' : verGe(py.py, [3, 10]) ? 'ok' : 'old';
    if (py.broken) venv.note = '.venv hỏng, không chạy được: xoá scripts/.venv rồi chạy lại trình cài';
    else if (!vpy.startsWith(path.join(skill, 'scripts'))) venv.note = `Dùng .venv của thư mục chính: ${path.dirname(path.dirname(vpy))}`;
  }

  // pip: một mục cho mỗi id (cuBLAS + cuDNN chung một mục)
  const pipItems = new Map();
  for (const { dist, spec } of pipList) {
    if (PIP_META[dist]?.id === 'yunet') continue; // onnxruntime: kiểm trong mục bám mặt bên dưới
    const meta = PIP_META[dist] || { id: dist, label: dist, need: 'optional', features: 'Thư viện Python trình cài có cài', api: [] };
    let it = pipItems.get(meta.id);
    if (!it) { it = item(meta.id, meta.label, meta.need, meta.features, meta.api); it.specs = []; it.dists = []; pipItems.set(meta.id, it); }
    it.specs.push(spec); it.dists.push(dist);
  }
  for (const it of pipItems.values()) {
    it.fix = C.pip(it.specs.join(' '));
    const vers = it.dists.map(d => py?.d?.[d]).filter(Boolean);
    if (PIP_META[it.dists[0]]?.gpu && !gpu) { it.status = 'na'; it.note = 'Máy không có GPU NVIDIA: whisper chạy CPU'; }
    else if (py && !py.broken && vers.length === it.dists.length) { it.status = 'ok'; it.version = vers[0]; }
    else if (!py) it.note = 'Chưa có scripts/.venv';
    delete it.specs; delete it.dists;
  }

  const yunet = item('yunet', 'Bám mặt: mô hình YuNet + onnxruntime', 'recommended', 'Bám mặt: né mặt khi đặt chữ, reframe theo mặt, QC che mặt', ['/api/reframe']);
  const model = fs.existsSync(path.join(skill, 'assets/models/face_detection_yunet_2023mar.onnx'));
  yunet.fix = model ? C.pip('onnxruntime') : `git -C ${q(skill)} checkout -- assets/models  (file mô hình đi kèm repo)`;
  if (model && py?.ort) { yunet.status = 'ok'; yunet.note = 'onnxruntime có sẵn'; }
  else if (model) yunet.note = py ? 'Có file mô hình, thiếu onnxruntime trong .venv' : 'Có file mô hình, chưa có .venv';
  else yunet.note = 'Thiếu assets/models/face_detection_yunet_2023mar.onnx';

  // mô hình nặng (M117)
  const models = loadModels(skill).map(m => {
    const it = item(modelId(m), `Mô hình ${m.kind === 'whisper' ? 'whisper' : 'tách nền'} ${m.name} (~${m.gb} GB)`, 'recommended', m.for,
      m.kind === 'whisper' ? (m.name === 'large-v3' ? ['/api/rehear'] : ['/api/transcribe', '/api/new']) : ['/api/segment', '/api/sticker']);
    it.fix = C.prefetch(m.name);
    if (modelPresent(m, env)) it.status = 'ok'; else it.note = 'Chưa tải: lần đầu dùng sẽ phải chờ tải';
    return it;
  });

  const req = [...ff, node, venv, ...[...pipItems.values()].filter(i => i.need === 'required'), chrome, pup];
  const rec = [...models, yunet, ...[...pipItems.values()].filter(i => i.need === 'recommended'), claude, hs];
  const opt = [...[...pipItems.values()].filter(i => i.need === 'optional'), ollama, vieneu];
  const items = [...req, ...rec, ...opt];
  // M116: mục nào cài lẻ được ('item'), mục nào chạy lại trình cài là có ('all'), còn lại cài tay ('').
  const pkgs = Object.fromEntries(items.map(i => [i.id, i.status === 'ok']));
  const plan = { skill, platform, venv: !!py && !py.broken && verGe(py.py, [3, 10]), winget: which('winget', env), brew: which('brew', env), npm: npmCli(), puppeteer: pup.status === 'ok', pkgs };
  for (const i of items) i.auto = !(i.status === 'missing' || i.status === 'old') ? '' : fixPlan(i.id, plan) ? 'item' : BY_INSTALLER.has(i.id) || isModelId(i.id) ? 'all' : '';
  const installer = platform === 'win32' ? 'install.cmd' : 'install.sh';
  return { ready: req.every(i => i.status === 'ok'), platform, install: C.install, installer, items, ms: Date.now() - t0, at: new Date().toISOString() };
}

const stateFile = () => path.join(AVS_HOME(), 'setup.json');
export function loadSeen() {
  try { const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')); return { seen: !!s.seen, later: Array.isArray(s.later) ? s.later.filter(x => typeof x === 'string').slice(0, 40) : [] }; }
  catch { return { seen: false, later: [] }; }
}
function storeSeen(later) {
  const f = stateFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, seen: true, later, updated: new Date().toISOString() }, null, 1));
  fs.renameSync(tmp, f);
}

export default ctx => {
  let cache = null, pending = null;
  const run = () => (pending ||= checkAll({ skill: ctx.SKILL }).then(r => (cache = { at: Date.now(), r }, r)).finally(() => { pending = null; }));
  return async (req, res, p, u) => {
    if (!/^\/api\/setup\/(check|seen|install|reveal)$/.test(p)) return false;
    try {
      if (p === '/api/setup/check' && req.method === 'GET') {
        const fresh = u?.searchParams?.get('fresh') === '1';
        const hit = !fresh && cache && Date.now() - cache.at < TTL;
        const r = hit ? cache.r : await run();
        ctx.json(res, { ...r, ...loadSeen(), cached: !!hit });
        return true;
      }
      if (p === '/api/setup/install' && req.method === 'POST') {
        if (+req.headers['content-length'] > 1024) { req.resume(); ctx.json(res, { error: 'Dữ liệu gửi lên quá lớn' }, 413); return true; }
        const { id } = (await ctx.body(req)) || {};
        if (typeof id !== 'string' || !/^[\w.-]{1,40}$/.test(id)) { ctx.json(res, { error: 'Thiếu id mục cần cài' }, 400); return true; }
        const r = await run(); // kiểm mới: quyết định .venv / puppeteer theo trạng thái lúc bấm, không theo cache 5 phút
        const item = r.items.find(i => i.id === id);
        if (id !== 'all' && !item) { ctx.json(res, { error: 'Không có mục này trong danh sách kiểm' }, 400); return true; }
        const steps = fixPlan(id, { skill: ctx.SKILL, platform: process.platform, venv: r.items.find(i => i.id === 'venv')?.status === 'ok' && fs.existsSync(venvPy(ctx.SKILL)),
          winget: which('winget'), brew: which('brew'), npm: npmCli(), puppeteer: r.items.find(i => i.id === 'puppeteer-core')?.status === 'ok',
          pkgs: Object.fromEntries(r.items.map(i => [i.id, i.status === 'ok'])) });
        if (!steps) { ctx.json(res, { error: `Chưa cài giúp được ${item?.label || id} trên máy này: chạy lại trình cài hoặc dùng lệnh trong mục "Cho người rành máy"` }, 400); return true; }
        const dry = process.env.AVS_SETUP_DRY === '1';
        const ok = ctx.startJob('setup', async () => {
          const job = ctx.job;
          for (const [n, s] of steps.entries()) {
            job.step = s.label; job.progress = n / steps.length;
            const [cmd, argv] = dry ? [process.execPath, ['-e', `console.log(${JSON.stringify('▸ (chạy thử) ' + s.label)});setTimeout(()=>console.log('▸ Xong bước chạy thử'),1500)`]] : [s.cmd, s.argv];
            // Dòng "▸ …" của trình cài là tên bước: đưa lên thanh tiến trình
            const from = job.log.length;
            try {
              await ctx.run(cmd, argv, line => { const m = /^\s*▸\s*(.+)/.exec(line); if (m) { job.step = m[1].slice(0, 160); job.progress = Math.min(0.95, job.progress + 0.07); } });
            } catch (e) { if (!(s.okText && s.okText.test(job.log.slice(Math.max(0, from - 200))))) throw e; }
          }
          // Cài đã xong: bước kiểm lại lỗi thì không biến kết quả thành "cài lỗi"
          job.step = 'Kiểm lại máy';
          try { if (!dry) await refreshPathWin(); cache = null; await run(); } catch (e) { console.error('setup re-check:', e.message); }
          job.step = 'Xong';
        }, { id });
        if (!ok) { ctx.json(res, { error: 'Studio đang chạy một việc khác (xuất video, tách lời thoại…): chờ xong rồi cài' }, 409); return true; }
        ctx.json(res, { ok: true, steps: steps.map(s => s.label) });
        return true;
      }
      if (p === '/api/setup/reveal' && req.method === 'POST') {
        const { revealPath } = await import(pathToFileURL(path.join(ctx.SKILL, 'scripts/platform.mjs')).href);
        revealPath(path.join(ctx.SKILL, IS_WIN ? 'install.cmd' : 'install.sh'));
        ctx.json(res, { ok: true });
        return true;
      }
      if (p === '/api/setup/seen' && req.method === 'POST') {
        if (+req.headers['content-length'] > 4096) { req.resume(); ctx.json(res, { error: 'Dữ liệu gửi lên quá lớn' }, 413); return true; }
        const b = await ctx.body(req);
        const later = Array.isArray(b?.missing) ? b.missing.filter(x => typeof x === 'string' && /^[\w.-]{1,40}$/.test(x)).slice(0, 40) : [];
        storeSeen(later);
        ctx.json(res, { ok: true, ...loadSeen() });
        return true;
      }
      return false;
    } catch (e) {
      ctx.json(res, { error: e.message }, e.status || 500);
      return true;
    }
  };
};
