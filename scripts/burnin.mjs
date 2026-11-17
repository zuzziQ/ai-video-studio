// Phụ đề cháy sẵn trong video nguồn (S13 M110): video tải từ Reels / TikTok thường đã có chữ in vào hình; phụ đề mới của Studio
// chồng lên thì không đọc được. Dò nhanh, chạy cục bộ, chỉ cần ffmpeg (không OCR, không thư viện Python):
//   lấy ~12 khung xám nhỏ (180 px ngang) rải đều video → mỗi hàng điểm ảnh đếm cạnh dọc mạnh (nét chữ trắng viền đen) →
//   dải chữ = các hàng có nhiều cạnh ở phần lớn khung (đứng yên một chỗ) VÀ nội dung trong dải đổi giữa các khung (đổi theo lời nói).
//   Logo, chữ tĩnh, nền nhiều chi tiết đứng yên không đổi nên không bị báo.
// Kết quả lưu <dự án>/.studio/burnin.json {version, found, y0, y1, x0, x1 (tỉ lệ khung nguồn), w, h, hits, change, frames, file, at}.
// Studio đọc ở thẻ "Video nguồn" (studio/routes/14_source.mjs); cách xử lý người dùng chọn ghi vào timeline.burnin
// {x0, x1, y0, y1 (px thiết kế), mode: off | move | mask} và engine áp (engine/engine.js captionHTML / burnMask / placeBurn).
// QC (scripts/ai_qc.mjs domIssues) báo `readability` khi phụ đề mới chồng dải chữ cũ mà chưa chọn cách xử lý.
// CLI: node scripts/burnin.mjs <thư mục dự án | video> [--save]   → in JSON kết quả.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BURN_FILE = '.studio/burnin.json';
const r3 = v => Math.round(v * 1000) / 1000;
const VIDEO_RE = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;

// ---------- dò trên khung xám {w, h, data: Uint8Array} ----------
const EDGE = 80;        // chênh sáng giữa hai điểm ảnh liền nhau coi là một cạnh (chữ cháy: nền trắng viền đen, chênh > 200; kính, cổ áo, tay < 80 ở 180 px)
const ROW_TEXT = .06;   // tỉ lệ cạnh trên một hàng để coi hàng đó có chữ
export function bandsOf(frames, { minFrac = .4, minChange = .4, edge = EDGE } = {}) {
  const none = { found: false, frames: frames.length };
  if (frames.length < 4) return none;
  const { w, h } = frames[0];
  // bản đồ cạnh dọc (|p[x+1] − p[x]|) và mật độ cạnh từng hàng
  const maps = frames.map(f => {
    const e = new Uint8Array(w * h), rows = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      let n = 0;
      for (let x = 0; x < w - 1; x++) if (Math.abs(f.data[y * w + x + 1] - f.data[y * w + x]) > edge) { e[y * w + x] = 1; n++; }
      rows[y] = n / w;
    }
    return { e, rows };
  });
  // hàng "có chữ" ở ít nhất minFrac số khung VÀ nội dung hàng đổi giữa hai khung liền nhau (nền tĩnh nhiều chi tiết không đổi)
  const frac = new Float32Array(h), dens = new Float32Array(h), chg = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let k = 0, s = 0, pr = 0, df = 0;
    maps.forEach((m, i) => {
      const on = m.rows[y] > ROW_TEXT; if (on) k++; s += m.rows[y];
      if (!i) return; const q = maps[i - 1], was = q.rows[y] > ROW_TEXT;
      if (!on && !was) return; pr++;
      if (on !== was) { df++; return; }
      let x = 0, o = 0; for (let c = y * w, e = c + w; c < e; c++) if (m.e[c] || q.e[c]) { o++; if (m.e[c] !== q.e[c]) x++; }
      if (o && x / o > .2) df++;
    });
    frac[y] = k / maps.length; dens[y] = s / maps.length; chg[y] = pr ? df / pr : 0;
  }
  // dải liền nhau (cho hở ≤ 2 hàng)
  const runs = []; let a = -1, gap = 0;
  for (let y = 0; y <= h; y++) {
    const on = y < h && frac[y] >= minFrac && chg[y] >= minChange;
    if (on) { if (a < 0) a = y; gap = 0; }
    else if (a >= 0 && (++gap > 2 || y === h)) { runs.push([a, y - gap + 1]); a = -1; gap = 0; }
  }
  let best = null;
  for (const [y0, y1] of runs) {
    const bh = y1 - y0;
    if (bh < h * .015 || bh > h * .3) continue;          // quá mảnh (một đường kẻ) hoặc quá cao (cả khung rung / đổi cảnh)
    let dsum = 0; for (let y = y0; y < y1; y++) dsum += dens[y];
    const dm = dsum / bh;
    // khung nào có chữ trong dải, và nội dung có đổi giữa hai khung liền nhau không
    const present = maps.map(m => { let s = 0; for (let y = y0; y < y1; y++) s += m.rows[y]; return s / bh > ROW_TEXT; });
    let pairs = 0, diff = 0;
    for (let i = 1; i < maps.length; i++) {
      if (!present[i] && !present[i - 1]) continue;
      pairs++;
      if (present[i] !== present[i - 1]) { diff++; continue; }   // chữ hiện / tắt theo câu nói
      let x = 0, o = 0;
      for (let y = y0; y < y1; y++) for (let c = 0; c < w; c++) {
        const p = maps[i].e[y * w + c], q = maps[i - 1].e[y * w + c];
        if (p || q) { o++; if (p !== q) x++; }
      }
      if (o && x / o > .2) diff++;
    }
    const change = pairs ? diff / pairs : 0, hits = present.filter(Boolean).length;
    if (change < minChange || hits < Math.max(3, maps.length * minFrac)) continue;
    // chiều ngang: phân vị 5–95 của cột có cạnh trong dải
    const col = new Float32Array(w); let tot = 0;
    for (const m of maps) for (let y = y0; y < y1; y++) for (let c = 0; c < w; c++) if (m.e[y * w + c]) { col[c]++; tot++; }
    let acc = 0, x0 = 0, x1 = w;
    for (let c = 0; c < w; c++) { acc += col[c]; if (acc < tot * .05) x0 = c + 1; if (acc <= tot * .95) x1 = c + 1; }
    const score = dm * change;
    if (!best || score > best.score) best = { y0, y1, x0, x1, hits, change, score };
  }
  if (!best) return none;
  // nới nhẹ để phủ cả viền chữ và dấu tiếng Việt
  const pad = Math.max(1, Math.round((best.y1 - best.y0) * .25));
  return { found: true, y0: r3(Math.max(0, best.y0 - pad) / h), y1: r3(Math.min(h, best.y1 + pad) / h),
    x0: r3(Math.max(0, best.x0 - 2) / w), x1: r3(Math.min(w, best.x1 + 2) / w), hits: best.hits, change: r3(best.change), frames: frames.length };
}

// ---------- toạ độ thiết kế (engine: khung 720×1280 dọc / 1280×720 ngang, a-roll phủ kín khung) ----------
const designOf = tl => tl.design || ((tl.height || 1920) > (tl.width || 1080) ? [720, 1280] : [1280, 720]);
export function toDesign(b, tl) {
  if (!b?.found) return null;
  const [DW, DH] = designOf(tl), sw = b.w || DW, sh = b.h || DH, k = Math.max(DW / sw, DH / sh);
  const ox = (DW - sw * k) / 2, oy = (DH - sh * k) / 2, cl = (v, m) => Math.round(Math.min(m, Math.max(0, v)));
  return { x0: cl(ox + b.x0 * sw * k, DW), x1: cl(ox + b.x1 * sw * k, DW), y0: cl(oy + b.y0 * sh * k, DH), y1: cl(oy + b.y1 * sh * k, DH) };
}

// ---------- QC: hai lớp chữ chồng nhau ----------
// Dải chữ cũ (px thiết kế): cách xử lý đã chọn (timeline.burnin) hoặc kết quả dò của dự án (.studio/burnin.json).
export const burnBand = (dir, tl) => tl?.burnin || (dir ? toDesign(readBurn(dir), tl || {}) : null);
// samples: ảnh kiểm tra của ai_qc.domPass ({t, m: {cap: {texts: [{x, y, w, h}]}}}, toạ độ thiết kế).
export function burnIssues(tl, samples, band = tl?.burnin) {
  // che dải / tắt phụ đề mới: hết chồng; dời phụ đề: đo vị trí phụ đề thật trong ảnh kiểm tra (engine placeBurn đã dời)
  const B = band, mode = tl?.burnin?.mode;
  if (!B || B.y1 == null || mode === 'mask' || mode === 'off') return [];
  const ts = [];
  for (const s of samples || []) {
    const tx = s.m?.cap?.texts || []; if (!tx.length) continue;
    const y0 = Math.min(...tx.map(r => r.y)), y1 = Math.max(...tx.map(r => r.y + r.h));
    // chỉ xét chiều dọc: mỗi câu cũ dài ngắn khác nhau, dải ngang đo được chỉ là phần chung của vài khung
    const oy = Math.min(y1, B.y1) - Math.max(y0, B.y0);
    if (oy > 0 && oy / Math.max(1, Math.min(y1 - y0, B.y1 - B.y0)) > .3) ts.push(s.t);
  }
  if (!ts.length) return [];
  return [{ t: ts[0], kind: 'readability', severity: 'high', target: null, code: 'burnin',
    msg: mode === 'move' ? `Đã dời phụ đề nhưng vẫn chồng phụ đề cháy sẵn của video gốc (${ts.length} ảnh kiểm tra): chọn che dải chữ cũ hoặc tắt phụ đề mới` : `Phụ đề mới chồng lên phụ đề cháy sẵn của video gốc (${ts.length} ảnh kiểm tra): chọn tắt phụ đề mới, dời phụ đề hoặc che dải chữ cũ ở thẻ Video nguồn` }];
}

// ---------- đọc khung bằng ffmpeg ----------
const run = (bin, args, enc = 'buffer') => new Promise((ok, no) => execFile(bin, args, { encoding: enc, maxBuffer: 1 << 26, windowsHide: true },
  (e, out, err) => (e ? no(new Error(String(err || e.message).trim().split('\n').pop() || 'ffmpeg lỗi')) : ok(out))));
export async function probe(file) {
  const j = JSON.parse(await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], 'utf8'));
  return { w: j.streams?.[0]?.width || 0, h: j.streams?.[0]?.height || 0, dur: +j.format?.duration || 0 };
}
export async function scanVideo(file, { n = 12, width = 180 } = {}) {
  const info = await probe(file);
  if (!info.w || !info.h) throw new Error('Không đọc được khung hình của video');
  const w = width, h = Math.max(2, Math.round(info.h * w / info.w / 2) * 2), D = info.dur || 1;
  const ts = Array.from({ length: n }, (_, i) => D * (.05 + .9 * (i + .5) / n));
  const grab = t => run('ffmpeg', ['-v', 'error', '-ss', t.toFixed(2), '-i', file, '-frames:v', '1', '-vf', `scale=${w}:${h},format=gray`, '-f', 'rawvideo', '-'])
    .then(b => (b.length >= w * h ? { w, h, data: new Uint8Array(b.buffer, b.byteOffset, w * h) } : null)).catch(() => null);
  const frames = [];
  for (let i = 0; i < ts.length; i += 4) frames.push(...(await Promise.all(ts.slice(i, i + 4).map(grab))));
  const ok = frames.filter(Boolean);
  return { ...bandsOf(ok), w: info.w, h: info.h, dur: r3(D), file: path.basename(file) };
}

// ---------- lưu cạnh dự án ----------
export function readBurn(dir) {
  try { const j = JSON.parse(fs.readFileSync(path.join(dir, BURN_FILE), 'utf8')); return j && typeof j === 'object' ? j : null; } catch { return null; }
}
export function writeBurn(dir, b) {
  const o = { version: 1, ...b, at: new Date().toISOString() };
  fs.mkdirSync(path.join(dir, '.studio'), { recursive: true });
  fs.writeFileSync(path.join(dir, BURN_FILE), JSON.stringify(o, null, 1));
  return o;
}
// video để dò: video gốc (source.json) nếu còn, không thì video a-roll trong dự án (giọng / clip đầu)
export function videoOfProject(dir, tl, srcFile) {
  if (srcFile && fs.existsSync(srcFile)) return srcFile;
  const c = [tl?.audio?.voice, ...(tl?.clips || []).map(x => (typeof x.src === 'string' ? x.src : x.audio))].filter(v => typeof v === 'string' && VIDEO_RE.test(v));
  for (const v of c) { const f = path.resolve(dir, v); if (f.startsWith(path.resolve(dir) + path.sep) && fs.existsSync(f)) return f; }
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2]; if (!arg) { console.error('usage: node scripts/burnin.mjs <thư mục dự án | video> [--save]'); process.exit(2); }
  const isDir = fs.statSync(arg).isDirectory();
  const tl = isDir ? JSON.parse(fs.readFileSync(path.join(arg, 'timeline.json'), 'utf8')) : {};
  const file = isDir ? videoOfProject(arg, tl) : arg;
  if (!file) { console.error('Không thấy video trong dự án'); process.exit(1); }
  const t0 = Date.now(), b = await scanVideo(file);
  const out = { ...b, ms: Date.now() - t0, design: isDir ? toDesign(b, tl) : null };
  if (isDir && process.argv.includes('--save')) writeBurn(arg, b);
  console.log(JSON.stringify(out, null, 1));
}
