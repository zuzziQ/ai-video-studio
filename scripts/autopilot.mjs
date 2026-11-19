// Tự lái (autopilot): one raw video → finished videos + cover + publish texts, following a channel profile (references/autopilot.md).
// usage: node scripts/autopilot.mjs <video | project_dir> [--profile <id>] [--brand <id>] [--product <id>] [--script <id | file.txt|.docx>] [--out <dir>] [--project <dir>] [--restart] [--from <step>]
//        [--qc-override "<lý do>"]   (QC chặn xuất vì lỗi claim / nguyên bản: ghi lý do rồi xuất tiếp; lỗi chính sách thì không)
//        node scripts/autopilot.mjs --steps            (list step ids)
// Chain (each optional step can be turned off in the profile; a failing optional step logs a warning and the chain goes on):
//   new → brand → clean → fillers → script → ai → broll → sfx → qc → export → publish → cover → deliver
// S17 M123: bước script áp kịch bản có sẵn (--script, hoặc .studio/script.json đã lưu ở bước Nguồn): phụ đề theo chữ kịch bản.
// Resumable: state in <project>/.studio/autopilot.json; re-running continues after the last finished step. Steps that rewrite
// timeline.json keep a backup (.studio/autopilot/pre_<step>.json) that is restored if that step was interrupted.
// QC gate (scripts/export_gate.mjs): ad issues of high severity left after QC stop the chain at the qc step (step 'error' + blocked:true, run state 'blocked',
// line "LỖI: … CHẶN XUẤT …", exit 1); re-running repeats QC.
// Output: progress "@@ <0..1> <text>", "PROJECT <dir>" once, and finally "RESULT {json}"; <project>/out/summary.json.
// S12 M98: dự án mới ở <Kho>/Du an/<tên>-<mã> (Kho của --brand, không có thì thương hiệu của hồ sơ, không có nữa thì Kho Chung);
// bước deliver đưa video, ảnh bìa, .srt, nội dung đăng vào <Kho>/Thanh pham/<YYYY-MM>/ (liên kết cứng), --out vẫn chép thêm như cũ.
import fs from 'node:fs';
import { rmSync } from './fs_rm.mjs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { newProject, PY, videoOrient, endCard } from './new_project.mjs';
import { rippleCut } from './ripple.mjs';
import { AVS_HOME, getProfile, effectiveProfile, saveDelivered } from './profile.mjs';
import { notify } from './notify.mjs';
import { findChrome } from './platform.mjs';
import { launchChrome } from './chrome_profile.mjs';
import { readGate, recordOverride, gateText } from './export_gate.mjs';
import { workspaceFor, ensureWorkspace, workspaceOfProject, sub, safeName } from './workspace.mjs';
import { deliverProject } from './kho_deliver.mjs';
import { recordExport, updateExport } from './exports_log.mjs';
import { applyScript, loadScriptArg, readScript, writeScript } from './script_doc.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = f => path.join(SKILL, 'scripts', f);
const VIDEO = /\.(mp4|mov|m4v|mkv|webm|avi|mts)$/i;

export const STEPS = [
  // id, label, weight (progress share), required
  ['new', 'Tạo dự án (nhận giọng, cắt lặng, khung hình, phụ đề)', 18, true],
  ['brand', 'Áp brand kit + CTA', 1],
  ['clean', 'Làm sạch giọng', 1],
  ['fillers', 'Cắt lỗi nói, từ lặp, chỗ ngắt dài', 4],
  ['script', 'Áp kịch bản (phụ đề theo chữ kịch bản)', 1],
  ['ai', 'AI dựng giúp (graphic, phụ đề, nhạc)', 14],
  ['broll', 'B-roll tự động', 5],
  ['sfx', 'SFX + nhạc nền', 4],
  ['qc', 'AI kiểm tra lỗi (QC)', 8],
  ['export', 'Xuất video (trộn tiếng −14 LUFS + render)', 30, true],
  ['publish', 'Viết nội dung đăng', 8],
  ['cover', 'Ảnh bìa', 4],
  ['deliver', 'Gom kết quả + thông báo', 3, true],
];
const MUTATES = new Set(['brand', 'clean', 'fillers', 'script', 'ai', 'broll', 'sfx', 'qc']);

const rd = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(o, null, 1)); fs.renameSync(t, f); };
const slug = s => String(s || 'video').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video';
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const r2 = v => Math.round(v * 100) / 100;

// Deterministic project folder for a video, so re-running the same file resumes it: <Kho>/Du an/<tên video>-<mã>.
// A run started before S12 lives in $AVS_HOME/autopilot/projects/<slug>-<mã>: keep resuming it there.
export function projectDirFor(video, ws = workspaceFor('')) {
  const st = fs.statSync(video);
  const h = crypto.createHash('md5').update(path.resolve(video) + ':' + st.size).digest('hex').slice(0, 6);
  const old = path.join(AVS_HOME, 'autopilot', 'projects', `${slug(path.basename(video, path.extname(video)))}-${h}`);
  if (fs.existsSync(old)) return old;
  ensureWorkspace(ws);
  return path.join(sub(ws, 'projects', { mkdir: true }), `${safeName(path.basename(video, path.extname(video))).slice(0, 60)}-${h}`);
}

let CUR = null; // running child (killed on SIGTERM)
function run(cmd, argv, onLine, { cwd } = {}) {
  return new Promise((ok, bad) => {
    const p = spawn(cmd, argv, { cwd: cwd || process.cwd(), env: process.env }); CUR = p;
    let log = '';
    const feed = d => { const s = d.toString(); log = (log + s).slice(-5000); s.split(/[\r\n]/).forEach(l => l && onLine && onLine(l)); };
    p.stdout.on('data', feed); p.stderr.on('data', feed);
    p.on('error', e => bad(new Error(e.code === 'ENOENT' ? `Không tìm thấy lệnh ${cmd}` : e.message)));
    p.on('close', code => {
      CUR = null;
      if (code === 0) return ok(log);
      const msg = (log.match(/^LỖI: .*$/m) || [])[0]?.slice(5) || log.trim().split('\n').slice(-2).join(' | ').slice(-300);
      bad(Object.assign(new Error(`${path.basename(argv.find(a => /\.(mjs|py)$/.test(a)) || cmd)} lỗi (mã ${code}): ${msg}`), { log }));
    });
  });
}

// ---------- project io ----------
function loadTL(dir) {
  const tlFile = path.join(dir, 'timeline.json'), tl = rd(tlFile);
  if (!tl) throw new Error('Không đọc được ' + tlFile);
  const capFile = typeof tl.captions === 'string' ? tl.captions : 'work/captions.json';
  const caps = typeof tl.captions === 'string' ? rd(path.join(dir, tl.captions), []) : (tl.captions || []);
  return { tlFile, tl, caps, capFile };
}
// S16 M120: hồ sơ để gói "tự chọn": video nguồn đã đúng khổ ra (dọc → dọc, ngang → ngang) thì a-roll tràn khung (gói basic);
// lệch khổ (ngang → dọc…) mới đặt video thành thẻ trên nền lưới (slate). Không đọc được khổ → basic.
export function autoPack(src, orient = 'auto') {
  if (!orient || orient === 'auto') return 'basic';
  try { return videoOrient(src) === orient ? 'basic' : 'slate'; } catch { return 'basic'; }
}
function saveTL(dir, tl, caps, capFile = 'work/captions.json') {
  if (caps) { fs.mkdirSync(path.dirname(path.join(dir, capFile)), { recursive: true }); fs.writeFileSync(path.join(dir, capFile), JSON.stringify(caps, null, 1)); tl.captions = capFile; }
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(tl, null, 1));
}
// S16 M118: Tự lái tự dựng cả video, nên bỏ `_starter` trước bước sửa timeline đầu tiên sau bước `ai`. Còn giữ thì lần đầu mở trong Studio
// sẽ áp lại công thức gói (studio.js boot) và xoá b-roll / chữ / SFX đã dựng.
export function dropStarter(dir) {
  const f = path.join(dir, 'timeline.json'), tl = rd(f);
  if (tl && tl._starter) { delete tl._starter; fs.writeFileSync(f, JSON.stringify(tl, null, 1)); }
}
const frameCount = (dir, tl) => { const d = tl.aroll?.frames && path.join(dir, path.dirname(tl.aroll.frames)); return d && fs.existsSync(d) ? fs.readdirSync(d).filter(f => /\.(jpe?g|png)$/i.test(f)).length : 0; };
function backup(dir, id) {
  const f = path.join(dir, '.studio/autopilot', `pre_${id}.json`);
  const { tl, capFile } = loadTL(dir);
  const capAbs = path.join(dir, capFile);
  if (fs.existsSync(f)) { // interrupted earlier: restore the state before this step
    const b = rd(f);
    if (b) { fs.writeFileSync(path.join(dir, 'timeline.json'), b.tl); if (b.caps != null) fs.writeFileSync(path.join(dir, b.capFile), b.caps); return 'restored'; }
  }
  wr(f, { tl: fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'), capFile, caps: fs.existsSync(capAbs) ? fs.readFileSync(capAbs, 'utf8') : null });
  void tl; return 'saved';
}
function probe(file) {
  try {
    const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height', '-of', 'json', file]).toString());
    const v = j.streams.find(s => s.codec_type === 'video'), a = j.streams.find(s => s.codec_type === 'audio');
    return { dur: +(+j.format.duration).toFixed(2), mb: +(+j.format.size / 1048576).toFixed(1), w: v?.width, h: v?.height, vcodec: v?.codec_name, acodec: a?.codec_name || null };
  } catch { return null; }
}
const srt = captions => {
  const ts = x => { const ms = Math.round(x * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s2 = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
  return captions.filter(c => !c.hidden).map((c, i) => `${i + 1}\n${ts(c.t0)} --> ${ts(c.t1)}\n${c.words.map(w => w.w).join(' ')}\n`).join('\n');
};

// Apply a template (templates/*.json or templates/user/*.json) with the engine's own window.applyTemplate (headless Chrome).
async function applyTemplate(dir, id) {
  const f = [path.join(SKILL, 'templates', `${id}.json`), path.join(SKILL, 'templates/user', `${id}.json`)].find(x => fs.existsSync(x));
  if (!f) throw new Error(`không thấy template ${id}`);
  const tpl = rd(f), { tl, caps, capFile } = loadTL(dir);
  delete tl._starter;
  const { default: puppeteer } = await import('puppeteer-core');
  const CHROME = findChrome();
  const b = await launchChrome(puppeteer, { executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
  try {
    const pg = await b.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(pathToFileURL(path.join(SKILL, 'engine/index.html')).href, { waitUntil: 'domcontentloaded' });
    const out = await pg.evaluate((t, tp, c) => { const x = { ...t, captions: c }; window.applyTemplate(x, tp, c, x.title || tp.title || ''); delete x.captions; return x; }, tl, tpl, caps);
    if (errs.length) throw new Error(errs.join(' | '));
    saveTL(dir, out, caps, capFile);
    return `${tpl.name || id}: ${out.scenes?.length || 0} cảnh`;
  } finally { await b.close(); }
}

// Export like studio/server.mjs exportVideo(): mix_audio.py → render.mjs --audio → export_multi deriveAspects for extra formats.
async function exportProject(dir, { quality = '1080', aspects = [] }, say) {
  const { tlFile, tl } = loadTL(dir);
  const P = rel => path.resolve(dir, rel);
  for (const f of [tl.aroll?.frames && path.dirname(tl.aroll.frames), tl.audio?.voice]) if (f && !fs.existsSync(P(f))) throw new Error(`Thiếu file nguồn: ${f}`);
  const [W, H] = quality === '720' ? [720, 1280] : quality === '4k' ? [2160, 3840] : [1080, 1920];
  const vert = (tl.height || 720) > (tl.width || 1280);
  let mix = null;
  if (tl.audio && (tl.audio.voice || tl.audio.music?.length || tl.audio.sfx?.length || tl.audio.tracks?.length || tl.clips?.some(c => c.audio))) {
    say(.03, 'Trộn âm thanh (giọng + nhạc + SFX, −14 LUFS)');
    await run(PY, ['-I', '-X', 'utf8', S('mix_audio.py'), tlFile]);
    mix = P(rd(tlFile)?.audio?.mix || tl.audio.mix || 'work/mix.wav');
    if (!fs.existsSync(mix)) throw new Error('Trộn âm thanh không tạo ra file ' + path.relative(dir, mix));
  }
  fs.mkdirSync(P('out'), { recursive: true });
  // leftovers of a run that was killed mid-export (temp timelines, half-written MP4)
  for (const x of fs.readdirSync(dir)) if (/^\.(export|cover)_\d+\.json$/.test(x)) rmSync(path.join(dir, x), { force: true });
  for (const x of fs.readdirSync(P('out'))) if (/^\.(part|render)_/.test(x)) rmSync(P('out/' + x), { recursive: true, force: true });
  const out = `out/${path.basename(dir)}_${stamp()}.mp4`, part = `out/.part_${path.basename(out)}`;
  const tmpTl = path.join(dir, `.export_${process.pid}.json`);
  fs.writeFileSync(tmpTl, JSON.stringify({ ...rd(tlFile), width: vert ? W : H, height: vert ? H : W }));
  const total = tl.duration;
  say(.08, 'Render khung hình');
  try {
    await run('node', [S('render.mjs'), tmpTl, P(part), ...(mix ? ['--audio', mix] : [])], l => { const m = /([\d.]+)s \/ ([\d.]+)s/.exec(l); if (m) say(.08 + .72 * Math.min(1, +m[1] / total), `Render ${(+m[1]).toFixed(0)}/${total.toFixed(0)}s`); });
  } finally { rmSync(tmpTl, { force: true }); }
  fs.renameSync(P(part), P(out));
  const native = vert ? '9:16' : '16:9';
  const outs = [{ aspect: native, out, note: 'Bản gốc (render thật)' }];
  const extra = (aspects || []).filter(a => a && a !== native);
  if (extra.length) {
    const { deriveAspects } = await import(pathToFileURL(S('export_multi.mjs')).href);
    const r = await deriveAspects(P(out), extra, { run: (c, a, l) => run(c, a, l), py: PY, onStep: s => say(.82, s), onProgress: k => say(.82 + .17 * k, 'Khổ phụ') });
    outs.push(...r.outs.map(o => ({ ...o, out: path.relative(dir, o.out) })));
  }
  return outs;
}

// ---------- main ----------
export async function autopilot(input, { profile: profId, brand: brandArg, product: productArg, script: scriptArg, out: outDir, project: projArg, restart, from, qcOverride } = {}) {
  const t00 = Date.now();
  const abs = path.resolve(input.replace(/^~(?=\/)/, os.homedir()));
  if (!fs.existsSync(abs)) throw new Error(`Không thấy ${abs}`);
  const isProj = fs.statSync(abs).isDirectory() && fs.existsSync(path.join(abs, 'timeline.json'));
  if (!isProj && !(fs.statSync(abs).isFile() && VIDEO.test(abs))) throw new Error('Chỉ nhận tệp video (mp4, mov, m4v, mkv…) hoặc thư mục dự án có timeline.json');
  // S19 M133: phong cách dựng là của thương hiệu: --brand chọn luôn phong cách ('' / '__none' = Chung); không có --brand thì
  // --profile (id thương hiệu, 'chung' hoặc id hồ sơ cũ, ánh xạ trong styles.json), rồi phong cách lần chạy trước, rồi mặc định.
  const styleRef = typeof brandArg === 'string' ? (brandArg && brandArg !== '__none' ? brandArg : 'chung') : profId;
  // Kho của dự án mới: --brand (thư mục canh của một Kho), không có thì thương hiệu của phong cách
  const khoOf = () => workspaceFor(typeof brandArg === 'string' ? brandArg : getProfile(profId).brand || '');
  const dir = path.resolve(projArg || (isProj ? abs : projectDirFor(abs, khoOf())));
  const stFile = path.join(dir, '.studio/autopilot.json');
  let st = rd(stFile);
  const prof0 = getProfile(styleRef || st?.profile);
  const prof = effectiveProfile(prof0);
  if (!st || restart) {
    if (restart) rmSync(path.join(dir, '.studio/autopilot'), { recursive: true, force: true });
    st = { version: 1, input: abs, steps: {} };
  }
  Object.assign(st, { profile: prof0.id, profileName: prof0.name, project: dir, out: outDir ? path.resolve(outDir) : st.out || null, state: 'running', pid: process.pid, started: st.started || new Date().toISOString(), learnedApplied: prof.applied });
  if (from) { let on = false; for (const [id] of STEPS) { if (id === from) on = true; if (on) { delete st.steps[id]; rmSync(path.join(dir, '.studio/autopilot', `pre_${id}.json`), { force: true }); } } }
  if (isProj && !st.steps.new) st.steps.new = { state: 'skipped', msg: 'dự án có sẵn', sec: 0 };
  fs.mkdirSync(path.join(dir, '.studio'), { recursive: true });
  const save = () => wr(stFile, st);
  save();
  console.log(`PROJECT ${dir}`);
  const W = STEPS.reduce((a, s) => a + s[2], 0);
  const base = id => STEPS.slice(0, STEPS.findIndex(s => s[0] === id)).reduce((a, s) => a + s[2], 0) / W;
  let cur = null;
  const say = (k, text) => {
    const [id, label, w] = cur, i = STEPS.findIndex(s => s[0] === id);
    const p = Math.min(.999, base(id) + (w / W) * Math.max(0, Math.min(1, k)));
    console.log(`@@ ${p.toFixed(3)} [${i + 1}/${STEPS.length}] ${label}${text ? ': ' + text : ''}`);
    st.steps[id] = { ...(st.steps[id] || {}), state: 'running', detail: text || '', progress: +k.toFixed(2) };
    st.progress = +p.toFixed(3);
  };
  let lastSave = 0;
  const sayS = (k, text) => { say(k, text); if (Date.now() - lastSave > 1500) { lastSave = Date.now(); save(); } };
  const P = rel => path.join(dir, rel);
  const res = st.result || (st.result = {});

  // S16 M119: transcribe.py không thấy lời thật (nhạc, tiếng ồn sự kiện) → new_project ghi timeline.speech.none
  // S17 M123: không lời nhưng có kịch bản (phụ đề chia đều theo đoạn) thì AI dựng / b-roll vẫn đọc được chữ
  const noSpeech = () => { const { tl, caps } = loadTL(dir); return !caps.length || (!!tl.speech?.none && !readScript(dir)?.align); };
  const impl = {
    async new() {
      await newProject({ video: abs, dir, model: prof.whisper || 'large-v3-turbo', pack: !['auto', 'keep', ''].includes(prof.pack) ? prof.pack : autoPack(abs, prof.orient), title: '', orient: prof.orient || 'auto', lang: prof.lang },
        { run: (c, a, l) => run(c, a, l), onStep: (s, p) => sayS(p, s) });
      const { tl, caps } = loadTL(dir);
      return `${caps.length} dòng phụ đề · ${tl.duration}s · ${tl.height > tl.width ? 'dọc' : 'ngang'}`;
    },
    async brand() {
      // S16 M121: thương hiệu chọn ở panel Tự lái (--brand; '' = không thương hiệu) thắng thương hiệu của hồ sơ; sản phẩm (--product) không bắt buộc
      const kitId = typeof brandArg === 'string' ? (brandArg === '__none' ? '' : brandArg) : prof.brand || '', productId = typeof productArg === 'string' ? productArg : '';
      if (!kitId && !prof.cta && !productId) return { skip: typeof brandArg === 'string' ? 'không thương hiệu (Kho Chung)' : 'phong cách không có thương hiệu / CTA' };
      const { tl, caps, capFile } = loadTL(dir); const notes = [];
      if (productId) {
        const { loadProduct } = await import('./products.mjs');
        // hồ sơ sản phẩm bị xoá sau khi chọn: ghi chú rồi vẫn áp thương hiệu, không để cả bước thành lỗi
        try {
          const pr = loadProduct(productId);
          tl.ads = { ...(tl.ads || {}), on: true, product: pr.id, ...(pr.industry && !tl.ads?.industry ? { industry: pr.industry } : {}) };
          notes.push(`sản phẩm ${pr.name || pr.id}`);
        } catch (e) { notes.push(`không gắn được sản phẩm: ${e.message}`); }
      }
      if (kitId) {
        const { loadBrand, brandFields } = await import('./batch.mjs');
        const kit = loadBrand(kitId);
        if (!kit) throw new Error(`không thấy brand kit "${kitId}"`);
        tl.brand = { ...(tl.brand || {}), ...brandFields(kit, dir), kit: kit.id }; notes.push(kit.title || kit.name);
        const card = (tl.scenes || []).filter(s => s.type === 'title_card' && !s._ai && !s._auto).pop(); if (card) Object.assign(card, endCard(tl.brand)); // S16 M120
      }
      if (prof.cta) { tl.brand = { ...(tl.brand || {}), outro: prof.cta }; const end = (tl.scenes || []).filter(s => s.type === 'title_card' && !s._ai && !s._auto).pop(); if (end) end.question = prof.cta; notes.push('CTA'); }
      saveTL(dir, tl, caps, capFile); return notes.join(' · ');
    },
    async clean() {
      if (!prof.clean || prof.clean === 'off') return { skip: 'tắt trong phong cách dựng' };
      const { tl, caps, capFile } = loadTL(dir);
      tl.audio = { ...(tl.audio || {}), clean: { preset: prof.clean } };
      saveTL(dir, tl, caps, capFile);
      return `preset ${prof.clean} (áp khi trộn)`;
    },
    async fillers() {
      if (!prof.fillers) return { skip: 'tắt trong phong cách dựng' };
      const { tl, caps, capFile } = loadTL(dir);
      if (!caps.length) return { skip: 'không có lời thoại' };
      const inF = P('.studio/autopilot/fillers_in.json'), outF = P('.studio/autopilot/fillers.json');
      fs.writeFileSync(inF, JSON.stringify(caps));
      sayS(.2, prof.fillers_claude ? 'Dò + hỏi Claude câu nói hỏng' : 'Dò tiếng đệm, lặp từ, chỗ ngắt');
      await run(PY, ['-I', '-X', 'utf8', S('fillers.py'), inF, outF, ...(prof.fillers_claude ? ['--claude'] : [])]);
      const cuts = (rd(outF)?.cuts || []).filter(c => c.conf >= .6);
      if (!cuts.length) return 'không có lỗi nói cần cắt';
      const r = rippleCut(tl, caps, cuts.map(c => [c.a, c.b]), frameCount(dir, tl));
      saveTL(dir, r.tl, r.caps, capFile);
      const kinds = {}; for (const c of cuts) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
      res.fillers = { cuts: cuts.length, removed: r.removed, kinds };
      return `cắt ${r.n} đoạn (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')}), ngắn đi ${r.removed.toFixed(1)}s`;
    },
    async script() {
      // S17 M123: kịch bản gửi kèm job (--script: id kịch bản chờ của panel Tự lái, hoặc file) thắng kịch bản đã lưu trong dự án
      if (typeof scriptArg === 'string' && scriptArg) { const s = loadScriptArg(scriptArg); writeScript(dir, s.text, { name: s.name }); }
      if (!readScript(dir)) return { skip: 'không có kịch bản' };
      const { tl, caps, capFile } = loadTL(dir);
      const r = applyScript(dir, { tl, caps });
      if (r.pending) return { skip: 'chưa có lời thoại để căn kịch bản' };
      saveTL(dir, r.tl, r.caps, capFile);
      const sc = r.script, A = sc.align, miss = sc.segments.filter(s => s.spoken === false).length;
      res.script = { segments: sc.segments.length, mode: A.mode, words: A.words, matched: A.matched, unspoken: miss, offscript: A.offscript.length };
      // dự án có sản phẩm (bước brand gắn timeline.ads): soát claim của chữ kịch bản; QC sẽ báo lại, bước này chỉ ghi chú
      let gateNote = '';
      try { const { gateScript } = await import('./script_doc.mjs'); const g = await gateScript(dir, r.tl); const hi = (g?.issues || []).filter(i => i.severity === 'high').length; if (hi) gateNote = ` · claim gate: ${hi} lỗi nặng trong kịch bản`; } catch (e) { gateNote = ` · chưa soát claim kịch bản (${e.message.slice(0, 80)})`; }
      return `${sc.segments.length} đoạn · ${r.caps.length} dòng phụ đề theo kịch bản${A.mode === 'even' ? ' (video không lời: chia đều theo đoạn)' : ` · ${A.matched}/${A.words} chữ khớp lời nói`}${miss ? ` · ${miss} đoạn chưa nói` : ''}${gateNote}`;
    },
    async ai() {
      if (!prof.template && noSpeech()) return { skip: 'video không lời: AI dựng giúp đọc lời thoại' }; // S16 M119
      if (prof.template) {
        sayS(.3, 'Áp template ' + prof.template); const m = await applyTemplate(dir, prof.template);
        // then fit the template's text / photos / timing to this clip's speech (scripts/tpl_fit.mjs)
        let fit = '';
        try {
          const { fitProject } = await import('./tpl_fit.mjs');
          const f = await fitProject(dir, { claude: prof.ai !== false, say: (p, s) => sayS(.3 + .65 * p, s) });
          fit = ` · bám lời thoại: ${f.texts} chữ, ${f.images} ảnh`;
        } catch (e) { fit = ` · chưa bám lời thoại (${e.message})`; }
        return 'template ' + m + fit;
      }
      if (!prof.ai) return { skip: 'tắt trong phong cách dựng' };
      const extra = [prof.extra, prof.cta && `Kết video bằng lời kêu gọi: "${prof.cta}".`].filter(Boolean).join(' ');
      const optF = P('.studio/autopilot/ai_opts.json');
      wr(optF, { goal: prof.goal || '', tone: prof.tone || '', pack: prof.pack || 'auto', density: prof.ai_density || 'vua', extra });
      let summary = '';
      await run('node', [S('ai_edit.mjs'), P('timeline.json'), '--opts', optF, '--out', P('.studio/ai_plan.json'), '--apply'], l => {
        const m = /^@@ ([\d.]+) (.*)$/.exec(l); if (m) sayS(+m[1], m[2]);
        if (/^plan: /.test(l)) summary = l.slice(6);
      });
      if (prof.caption_style) { const { tl, caps, capFile } = loadTL(dir); tl.caption_style = prof.caption_style; saveTL(dir, tl, caps, capFile); summary += ` · phụ đề ${prof.caption_style}`; }
      const plan = rd(P('.studio/ai_plan.json'));
      res.ai = plan ? { pack: plan.pack, scenes: plan.scenes?.length, hook: plan.hook, summary: plan.summary } : null;
      return summary || 'xong';
    },
    async broll() {
      if (!prof.broll_density || prof.broll_density === 'off') return { skip: 'tắt trong phong cách dựng' };
      if (noSpeech()) return { skip: 'video không lời: b-roll chọn theo lời thoại' }; // S16 M119
      const src = (prof.broll_src || []).join(',') || 'preset';
      // b-roll goal: the profile's own choice, else read from its free-text "Mục tiêu" (assets/broll/goals.json)
      const gf = String(prof.goal || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
      const goal = prof.broll_goal && prof.broll_goal !== 'auto' ? prof.broll_goal : [[/ban hang|chot don|san pham/, 'banhang'], [/bds|bat dong san|nha dat|can ho/, 'bds'], [/khoa hoc|huong dan|bai giang|day /, 'khoahoc'],
        [/review|danh gia/, 'review'], [/tin tuc|ban tin|thoi su/, 'tintuc'], [/doanh nghiep|cong ty|tuyen dung/, 'doanhnghiep'], [/am thuc|du lich|quan an|mon an/, 'amthuc'],
        [/giai tri|hai huoc|vui/, 'giaitri'], [/chia se|ke chuyen|tam su/, 'kechuyen']].find(([r]) => r.test(gf))?.[1] || 'auto';
      let info = null;
      await run('node', [S('auto_broll.mjs'), P('timeline.json'), '--goal', goal, '--density', prof.broll_density, '--src', src, ...(prof.broll_claude ? ['--claude'] : [])], l => {
        const m = /^@@ ([\d.]+) (.*)$/.exec(l); if (m) sayS(+m[1], m[2]);
        if (/^\{.*"added"/.test(l)) try { info = JSON.parse(l); } catch {}
      });
      res.broll = info ? { added: info.added, kinds: info.kinds, sources: info.sources, goal: info.goal?.id } : null;
      return info ? `${info.added} cảnh (${Object.entries(info.sources || info.kinds || {}).map(([k, n]) => `${n} ${k}`).join(', ')}) · mục tiêu ${info.goal?.name || goal} · mật độ ${prof.broll_density}` : `mật độ ${prof.broll_density}`;
    },
    async sfx() {
      const notes = [];
      // music "auto": the bed Claude chose in "AI dựng giúp" wins; without one, auto_sfx picks a mood per section.
      // (auto_sfx --music auto keeps _ai beds and would add its own on top → two overlapping beds.)
      const aiBed = (loadTL(dir).tl.audio?.music || []).some(m => m._ai);
      // S19 M138: nhạc riêng của thương hiệu (Nhac/ trong Kho). Kho chưa có bài nào → như 'auto' (vẫn có nhạc), ghi chú lại.
      let own = null;
      const { isKhoMusic, khoMusicPick } = await import('./kho_media.mjs');
      if (isKhoMusic(prof.music)) { own = await khoMusicPick(dir, loadTL(dir).tl, prof.music).catch(() => null); if (!own) notes.push('Kho chưa có nhạc của thương hiệu → nhạc tự chọn'); }
      const musicAuto = (prof.music === 'auto' || (isKhoMusic(prof.music) && !own)) && !aiBed;
      if (prof.sound && prof.sound !== 'off') {
        await run(PY, ['-I', '-X', 'utf8', S('auto_sfx.py'), P('timeline.json'), '--level', prof.sound, '--music', musicAuto ? 'auto' : 'keep']);
        notes.push(`SFX mức ${prof.sound}${musicAuto ? ' + nhạc theo đoạn' : aiBed && prof.music === 'auto' ? ' + nhạc AI chọn' : ''}`);
      }
      const { tl, caps, capFile } = loadTL(dir); tl.audio = tl.audio || {};
      if (prof.music === 'off') { tl.audio.music = []; notes.push('không nhạc'); }
      else if (own) { tl.audio.music = [...(tl.audio.music || []).filter(m => !m._ai && !m._auto), { t0: 0, t1: tl.duration, file: own.file, kho: own.kho, title: own.title, gain: -20, _auto: true }]; notes.push('nhạc thương hiệu: ' + own.title); }
      else if (isKhoMusic(prof.music)) { /* Kho chưa có nhạc: giữ nhạc tự chọn ở trên */ }
      else if (prof.music && prof.music !== 'auto') { tl.audio.music = [{ t0: 0, t1: tl.duration, mood: prof.music, gain: -20, _auto: true }]; notes.push('nhạc ' + prof.music); }
      if (prof.music_gain && tl.audio.music?.length) { for (const m of tl.audio.music) m.gain = r2((m.gain ?? -20) + prof.music_gain); notes.push(`nhạc ${prof.music_gain > 0 ? '+' : ''}${prof.music_gain} dB (đã học)`); }
      saveTL(dir, tl, caps, capFile);
      // S12 M99: đoạn nhạc tự chọn (_auto, theo mood) có bài hợp trong Nhac/ của Kho thì dùng bài đó (media/kho_*), như nút "Tự động"
      if (prof.music !== 'off' && tl.audio.music?.some(m => m._auto && !m.file)) {
        try { const { khoMusicBeds } = await import('./kho_media.mjs'); const n = await khoMusicBeds(dir); if (n) { notes.push(`${n} đoạn nhạc lấy từ Kho`); tl.audio = loadTL(dir).tl.audio || tl.audio; } }
        catch (e) { console.log(`! nhạc Kho: ${e.message}`); }
      }
      res.sfx = { sfx: tl.audio.sfx?.length || 0, music: (tl.audio.music || []).map(m => m.mood || path.basename(m.file || '')).filter(Boolean) };
      return notes.length ? `${notes.join(' · ')} · ${res.sfx.sfx} SFX, nhạc: ${res.sfx.music.join(', ') || '—'}` : { skip: 'tắt trong phong cách dựng' };
    },
    async qc() {
      if (!prof.qc) return { skip: 'tắt trong phong cách dựng' };
      if (!fs.existsSync(S('ai_qc.mjs'))) return { skip: 'chưa có scripts/ai_qc.mjs' };
      await run('node', [S('ai_qc.mjs'), dir, '--fix'], l => { const m = /^@@ ([\d.]+) (.*)$/.exec(l); if (m) sayS(+m[1], m[2]); });
      const q = rd(P('.studio/qc.json'));
      res.qc = q ? { score: q.score, issues: (q.issues || []).length, fixed: (q.issues || []).filter(i => i.fixed).length } : null;
      const msg = q ? `điểm ${q.score} · ${res.qc.issues} lỗi, đã sửa ${res.qc.fixed}` : 'xong';
      const g = readGate(dir);
      if (g.blocked) {
        if (qcOverride && g.overridable) { try { recordOverride(dir, qcOverride, { by: 'autopilot' }); } catch (err) { err.gate = g; throw err; } res.qc.override = qcOverride; return `${msg} · bỏ qua chặn xuất, lý do: ${qcOverride}`; }
        const e = new Error(`CHẶN XUẤT — ${gateText(g)}.${g.overridable ? ' Sửa trong Studio rồi chạy lại, hoặc chạy lại với --qc-override "<lý do>".' : ' Sửa lời thoại hoặc chữ trong Studio rồi chạy lại.'}`);
        e.gate = g; throw e;
      }
      return msg;
    },
    async export() {
      // QC turned off or crashed: an earlier QC result that still blocks export stops here too
      const g = readGate(dir);
      if (g.blocked) { const e = new Error(`CHẶN XUẤT — ${gateText(g)} (theo lần QC trước).`); e.gate = g; throw e; }
      // what the autopilot delivered — "Học từ chỉnh sửa" compares the user's later saves against this
      fs.copyFileSync(P('timeline.json'), P('.studio/autopilot_result.json'));
      saveDelivered(dir, 'autopilot'); // S19 M134: kèm phụ đề (chữ phụ đề bị sửa → từ điển chính tả của thương hiệu)
      const outs = await exportProject(dir, { quality: prof.quality || '1080', aspects: prof.aspects || [] }, sayS);
      res.videos = outs.map(o => ({ ...o, ...probe(P(o.out)) }));
      const { caps } = loadTL(dir);
      fs.writeFileSync(P(`out/${path.basename(dir)}.srt`), srt(caps)); res.srt = `out/${path.basename(dir)}.srt`;
      // S16 M118: bản xuất vào lịch sử của dự án (panel Xuất, cột phải, điểm Xuất), như khi xuất trong Studio
      try {
        const at = new Date().toISOString(), size = f => { try { return fs.statSync(P(f)).size; } catch { return null; } };
        const it = recordExport(dir, { id: `ap-${Date.now()}`, at, quality: prof.quality || '1080', range: null, delivered: [], deliverError: null,
          files: res.videos.map(v => ({ file: v.out, aspect: v.aspect, w: v.w, h: v.h, dur: v.dur, size: size(v.out) })) });
        res.exportId = it?.id || null;
      } catch (e) { console.log(`! không ghi được lịch sử xuất: ${e.message}`); }
      return res.videos.map(v => `${v.aspect} ${v.w}×${v.h} ${v.dur}s`).join(' · ');
    },
    async publish() {
      if (!prof.platforms?.length) return { skip: 'phong cách dựng không chọn nền tảng' };
      const v = res.videos?.[0]; if (!v) throw new Error('chưa có video');
      const { tl, caps } = loadTL(dir);
      const { generatePublish } = await import('./publish_texts.mjs');
      sayS(.2, 'Claude đang viết caption/hashtag');
      const notes = [prof.goal && `Mục tiêu: ${prof.goal}.`, prof.tone && `Giọng điệu: ${prof.tone}.`, prof.cta && `Lời kêu gọi hành động (CTA) cần có: ${prof.cta}`].filter(Boolean).join(' ');
      const doc = await generatePublish({ dir, tl, captions: caps, videoAbs: P(v.out), videoRel: v.out, platforms: prof.platforms, notes, model: 'sonnet', onProc: p => { CUR = p; } });
      res.publish = Object.keys(doc.platforms).map(k => `publish/${k}.txt`);
      res.thumb = Object.values(doc.platforms).find(d => d.thumb_time != null) || null;
      return `${Object.keys(doc.platforms).join(', ')}`;
    },
    async cover() {
      const { tl } = loadTL(dir);
      const t = Math.max(0, Math.min(tl.duration - .1, +res.thumb?.thumb_time || Math.min(1.5, tl.duration / 3)));
      const vert = (tl.height || 720) > (tl.width || 1280);
      const tmp = path.join(dir, `.cover_${process.pid}.json`);
      fs.writeFileSync(tmp, JSON.stringify({ ...tl, width: vert ? 1080 : 1920, height: vert ? 1920 : 1080 }));
      const out = P('out/cover.jpg');
      try { await run('node', [S('render.mjs'), tmp, out, '--still', String(t), out]); } finally { rmSync(tmp, { force: true }); }
      res.cover = 'out/cover.jpg';
      return `khung ${t.toFixed(1)}s`;
    },
    async deliver() {
      const name = path.basename(st.input || dir, path.extname(st.input || dir));
      const files = [];
      const summary = {
        input: st.input, project: dir, profile: { id: prof0.id, name: prof0.name }, learnedApplied: prof.applied || [],
        created: new Date().toISOString(), seconds: null,
        steps: Object.fromEntries(STEPS.map(([id, label]) => [id, { label, ...(st.steps[id] || {}) }])),
        videos: (res.videos || []).map(v => ({ ...v, out: P(v.out) })), cover: res.cover && P(res.cover), srt: res.srt && P(res.srt),
        publish: (res.publish || []).map(f => P(f)), qc: res.qc || null, ai: res.ai || null, fillers: res.fillers || null, broll: res.broll || null, sfx: res.sfx || null,
        schedule_slot: prof.slot || null,
      };
      // Thành phẩm vào <Kho>/Thanh pham/<YYYY-MM>/ (Kho chứa dự án, không thì theo brand kit của dự án)
      const ws = workspaceOfProject(dir, rd(P('timeline.json')));
      // deliverProject (M100) ghi sổ .studio/delivered.json + .giao.json: Đăng / Lịch đăng nhận bản giao là của dự án này
      const items = [], give = (src, base) => { if (src && fs.existsSync(src)) items.push({ src, name: base }); };
      for (const v of summary.videos) give(v.out, `${name} ${v.aspect.replace(':', 'x')}.mp4`);
      give(summary.cover, `${name} - ảnh bìa.jpg`); give(summary.srt, `${name}.srt`);
      if (summary.publish.length) { fs.writeFileSync(P('out/noi-dung-dang.txt'), summary.publish.filter(f => fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n\n-----\n\n')); give(P('out/noi-dung-dang.txt'), `${name} - nội dung đăng.txt`); }
      try { for (const r of deliverProject(dir, items, { ws }).items) r.dst ? files.push(r.dst) : console.log(`! không đưa được ${path.basename(r.src)} vào Thanh pham: ${r.error}`); }
      catch (e) { console.log(`! không đưa được thành phẩm vào Thanh pham: ${e.message}`); }
      const copies = []; // --out / thư mục "Đã xong" cũ: chép thêm, chỉ là kết quả chính khi Thanh pham không nhận được gì
      if (st.out) {
        fs.mkdirSync(st.out, { recursive: true });
        const cp = (src, base) => { if (!src || !fs.existsSync(src)) return; const dst = path.join(st.out, base); fs.copyFileSync(src, dst); copies.push(dst); };
        for (const v of summary.videos) cp(v.out, `${name} ${v.aspect.replace(':', 'x')}.mp4`);
        cp(summary.cover, `${name} - ảnh bìa.jpg`); cp(summary.srt, `${name}.srt`);
        if (summary.publish.length) { const txt = summary.publish.filter(f => fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n\n-----\n\n'); fs.writeFileSync(path.join(st.out, `${name} - nội dung đăng.txt`), txt); copies.push(path.join(st.out, `${name} - nội dung đăng.txt`)); }
      }
      if (!files.length) files.push(...copies);
      if (res.exportId) { try { updateExport(dir, res.exportId, { delivered: files.filter(f => VIDEO.test(f)) }); } catch (e) { console.log(`! không ghi được bản giao vào lịch sử xuất: ${e.message}`); } }
      try { (await import('../studio/routes/02_onboarding.mjs')).addRecent(dir); } catch (e) { console.log(`! không thêm được vào Dự án gần đây: ${e.message}`); }
      summary.delivered = files; summary.steps.deliver = { ...summary.steps.deliver, state: 'done', msg: `${summary.videos.length} video` };
      summary.seconds = Math.round((Date.now() - new Date(st.started).getTime()) / 1000);
      wr(P('out/summary.json'), summary);
      if (st.out) fs.copyFileSync(P('out/summary.json'), path.join(st.out, 'summary.json'));
      res.summary = P('out/summary.json'); res.delivered = files;
      const warn = Object.values(st.steps).filter(s => s.state === 'warn').length;
      await notify('Tự lái xong', `${name}: ${summary.videos.length} video${warn ? ` · ${warn} bước có cảnh báo` : ''}`);
      return `${summary.videos.length} video → ${files.length ? path.dirname(files[0]) : st.out || P('out')}`;
    },
  };

  for (const [id, label, , required] of STEPS) {
    const prev = st.steps[id];
    if (prev && ['done', 'skipped', 'warn'].includes(prev.state)) { console.log(`@@ ${(base(id)).toFixed(3)} [bỏ qua] ${label}: đã xong trước đó`); continue; }
    cur = STEPS.find(s => s[0] === id);
    say(0, prev?.state === 'running' || prev?.state === 'error' ? 'chạy tiếp' : '');
    const t0 = Date.now();
    try {
      // bước `ai` (ai_edit.mjs applyPlan) cần `_starter` để thay cảnh khởi tạo và tự xoá nó; các bước sau thì bỏ hẳn
      if (MUTATES.has(id) && STEPS.findIndex(s => s[0] === id) > STEPS.findIndex(s => s[0] === 'ai')) dropStarter(dir);
      if (MUTATES.has(id) && fs.existsSync(P('timeline.json'))) { const b = backup(dir, id); if (b === 'restored') console.log(`(khôi phục timeline trước bước ${id} sau lần chạy bị dừng)`); }
      const r = await impl[id]();
      const sec = +((Date.now() - t0) / 1000).toFixed(2);
      st.steps[id] = r && r.skip ? { state: 'skipped', msg: r.skip, sec } : { state: 'done', msg: String(r || ''), sec };
      console.log(`✓ ${label} (${sec}s)${st.steps[id].msg ? ' — ' + st.steps[id].msg : ''}`);
    } catch (e) {
      const sec = +((Date.now() - t0) / 1000).toFixed(2);
      if (required || e.gate) {
        st.steps[id] = { state: 'error', msg: e.message, sec, ...(e.gate ? { blocked: true } : {}) }; st.state = e.gate ? 'blocked' : 'error'; st.error = `${label}: ${e.message}`; save();
        await notify(e.gate ? 'Tự lái dừng ở bước QC' : 'Tự lái lỗi', `${path.basename(st.input)} — ${label}: ${e.message}`);
        throw new Error(`${label}: ${e.message}`);
      }
      st.steps[id] = { state: 'warn', msg: e.message, sec };
      console.log(`! ${label} lỗi, bỏ qua (${sec}s): ${e.message}`);
    }
    rmSync(path.join(dir, '.studio/autopilot', `pre_${id}.json`), { force: true });
    save();
  }
  st.state = 'done'; st.progress = 1; st.finished = new Date().toISOString(); st.finishedMs = Date.now(); delete st.pid; delete st.error; save();
  const outputs = [...(res.delivered?.length ? res.delivered : [...(res.videos || []).map(v => P(v.out)), res.cover && P(res.cover)])].filter(Boolean);
  const result = { project: dir, summary: res.summary, outputs, seconds: Math.round((Date.now() - t00) / 1000), steps: Object.fromEntries(Object.entries(st.steps).map(([k, v]) => [k, { state: v.state, sec: v.sec, ...(v.state === 'warn' && v.msg ? { msg: String(v.msg).slice(0, 160) } : {}) }])) };
  console.log('@@ 1.000 Xong');
  console.log('RESULT ' + JSON.stringify(result));
  return result;
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { CUR?.kill('SIGTERM'); } catch {} process.exit(130); });
  if (args.includes('--steps')) { for (const [id, l, , r] of STEPS) console.log(`${id.padEnd(8)} ${l}${r ? ' (bắt buộc)' : ''}`); process.exit(0); }
  const input = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--restart'].includes(args[i - 1])));
  if (!input) { console.error('usage: node scripts/autopilot.mjs <video|project_dir> [--profile <id>] [--brand <id>] [--product <id>] [--script <id|file>] [--out <dir>] [--project <dir>] [--restart] [--from <step>] [--qc-override "<lý do>"]'); process.exit(2); }
  autopilot(input, { profile: opt('--profile'), brand: opt('--brand'), product: opt('--product'), script: opt('--script'), out: opt('--out'), project: opt('--project'), restart: args.includes('--restart'), from: opt('--from'), qcOverride: opt('--qc-override') })
    .then(() => process.exit(0))
    .catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
}
