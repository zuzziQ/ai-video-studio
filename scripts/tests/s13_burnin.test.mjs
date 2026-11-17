// Test S13 M110: video nguồn có phụ đề cháy sẵn (tải từ Reels / TikTok).
//   - scripts/burnin.mjs bandsOf: dò dải chữ đứng yên một chỗ mà nội dung đổi theo lời nói trên khung xám giả;
//     không báo nhầm nền trơn, logo / chữ tĩnh, nền nhiều chi tiết đứng yên.
//   - toDesign: đổi toạ độ khung nguồn sang toạ độ thiết kế (a-roll phủ kín khung).
//   - burnIssues / domIssues (scripts/ai_qc.mjs): QC báo `readability` khi phụ đề mới chồng lên dải chữ cũ, trừ khi đã chọn cách xử lý.
//   - route studio/routes/14_source.mjs: GET /api/source trả kết quả dò đã lưu ở .studio/burnin.json; POST /api/source/burnin dò thật
//     (chỉ chạy khi máy có ffmpeg: dựng video có chữ cháy bằng drawtext).
// Chạy: node --test scripts/tests/s13_burnin.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { bandsOf, toDesign, burnIssues, burnBand, readBurn, BURN_FILE } from '../burnin.mjs';
import { domIssues } from '../ai_qc.mjs';

const W = 180, H = 320;
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
// nền: dải sáng dần theo chiều dọc + nhiễu nhỏ; "mặt người" là khối mờ ở giữa (cạnh yếu)
function frame({ text = null, logo = false, busy = false } = {}) {
  const d = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 60 + y * .4 + rnd() * 6;
    if ((x - 90) ** 2 / 900 + (y - 120) ** 2 / 2500 < 1) v += 40;
    if (busy && y > 30 && y < 300) v = ((Math.floor(x / 3) + Math.floor(y / 5)) % 2 ? 210 : 40) + rnd() * 6; // kệ sách: nhiều cạnh, đứng yên
    d[y * W + x] = Math.min(255, v);
  }
  // chữ: các nét dọc trắng viền đen, mỗi câu một mẫu khác (nội dung đổi theo lời nói)
  const glyphs = (y0, y1, x0, x1, s) => {
    let r = s; const nx = () => ((r = (r * 69069 + 1) % 4294967296) / 4294967296);
    for (let x = x0; x < x1; x += 4) {
      if (nx() < .3) continue;
      for (let y = y0; y < y1; y++) { if (nx() < .15) continue; d[y * W + x] = 250; d[y * W + x + 1] = 245; d[y * W + x + 2] = 10; }
    }
  };
  if (text != null) glyphs(Math.round(H * .72), Math.round(H * .78), 25, 155, text);
  if (logo) glyphs(12, 26, 120, 170, 999);
  return { w: W, h: H, data: d };
}

test('bandsOf: dải chữ cháy sẵn đổi theo câu nói → tìm đúng dải 72–78% chiều cao', () => {
  const frames = [1, 2, null, 3, 4, 5, null, 6, 7, 8, 9, 10].map(t => frame({ text: t }));
  const b = bandsOf(frames);
  assert.equal(b.found, true, JSON.stringify(b));
  assert.ok(Math.abs(b.y0 - .72) < .025 && Math.abs(b.y1 - .78) < .025, `dải ${b.y0}–${b.y1}`);
  assert.ok(b.x0 < .2 && b.x1 > .8, `chiều ngang ${b.x0}–${b.x1}`);
  assert.ok(b.hits >= 8 && b.change >= .5);
});

test('bandsOf: nền trơn, logo / chữ tĩnh, nền nhiều chi tiết đứng yên → không báo', () => {
  assert.equal(bandsOf(Array.from({ length: 10 }, () => frame())).found, false, 'nền trơn');
  assert.equal(bandsOf(Array.from({ length: 10 }, () => frame({ logo: true }))).found, false, 'logo tĩnh');
  assert.equal(bandsOf(Array.from({ length: 10 }, () => frame({ text: 42 }))).found, false, 'một dòng chữ đứng yên cả video');
  assert.equal(bandsOf(Array.from({ length: 10 }, () => frame({ busy: true }))).found, false, 'kệ sách');
  assert.equal(bandsOf([]).found, false);
});

test('bandsOf: chữ cháy sẵn trên nền nhiều chi tiết + logo tĩnh vẫn tìm ra dải chữ', () => {
  const frames = [1, 2, 3, null, 4, 5, 6, 7, null, 8].map(t => frame({ text: t, logo: true, busy: true }));
  const b = bandsOf(frames);
  assert.equal(b.found, true);
  assert.ok(b.y0 > .6, `không lấy logo ở đầu khung: ${b.y0}`);
});

test('toDesign: khung nguồn cùng tỉ lệ và khác tỉ lệ (a-roll phủ kín khung)', () => {
  const tl = { width: 1080, height: 1920 };
  assert.deepEqual(toDesign({ found: true, y0: .7, y1: .8, x0: .1, x1: .9, w: 1080, h: 1920 }, tl), { x0: 72, x1: 648, y0: 896, y1: 1024 });
  // nguồn 1:1 phủ khung 9:16 → cao bằng khung, bị cắt hai bên
  const d = toDesign({ found: true, y0: .5, y1: .6, x0: 0, x1: 1, w: 1000, h: 1000 }, tl);
  assert.equal(d.y0, 640); assert.equal(d.y1, 768); assert.equal(d.x0, 0); assert.equal(d.x1, 720);
  assert.equal(toDesign({ found: false }, tl), null);
});

const capAt = (t, y) => ({ t, m: { scenes: {}, cap: { texts: [{ x: 150, y, w: 420, h: 60, s: 'phụ đề mới' }] } } });
const P = (ys) => ({ samples: ys.map((y, i) => capAt(i * 3, y)), DW: 720, DH: 1280 });
const burnTl = mode => ({ width: 1080, height: 1920, duration: 30, scenes: [], burnin: { x0: 60, x1: 660, y0: 900, y1: 990, ...(mode ? { mode } : {}) } });

test('burnIssues: phụ đề mới chồng dải chữ cũ → readability cao; đã chọn cách xử lý hoặc phụ đề ở chỗ khác → không báo', () => {
  const r = burnIssues(burnTl(), P([910, 920, 400]).samples);
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'readability'); assert.equal(r[0].severity, 'high'); assert.equal(r[0].t, 0);
  assert.match(r[0].msg, /cháy sẵn/);
  assert.equal(r[0].code, 'burnin');
  for (const m of ['off', 'mask']) assert.equal(burnIssues(burnTl(m), P([910]).samples).length, 0, m);
  assert.equal(burnIssues(burnTl('move'), P([800, 300]).samples).length, 0, 'đã dời khỏi dải');
  assert.match(burnIssues(burnTl('move'), P([910]).samples)[0].msg, /Đã dời phụ đề nhưng vẫn chồng/, 'dời rồi mà vẫn chồng thì vẫn báo');
  assert.equal(burnIssues(burnTl(), P([300, 400]).samples).length, 0, 'phụ đề ở trên');
  assert.equal(burnIssues({ scenes: [] }, P([910]).samples).length, 0, 'chưa dò');
  // chưa chọn cách xử lý: timeline chưa có burnin, dải lấy từ kết quả dò của dự án (domPass → P.burn)
  const band = { x0: 60, x1: 660, y0: 900, y1: 990 };
  assert.equal(burnIssues({ scenes: [] }, P([910]).samples, band).length, 1);
  assert.equal(burnIssues({ scenes: [], burnin: { ...band, mode: 'mask' } }, P([910]).samples, band).length, 0);
});

test('domIssues (ai_qc.mjs) có lỗi readability khi hai lớp chữ chồng nhau', () => {
  const kinds = domIssues(burnTl(), [], P([910, 920])).map(i => i.kind);
  assert.ok(kinds.includes('readability'), kinds.join(','));
  assert.ok(!domIssues(burnTl('move'), [], P([800])).map(i => i.kind).includes('readability'));
  const fromScan = { ...P([910]), burn: { x0: 60, x1: 660, y0: 900, y1: 990 } };
  assert.ok(domIssues({ width: 1080, height: 1920, duration: 30, scenes: [] }, [], fromScan).some(i => i.kind === 'readability'), 'dải từ .studio/burnin.json');
});

// ---------- route ----------
const TMP = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-burn-')));
const ENV0 = { ...process.env }; // ffmpeg drawtext cần HOME thật để nạp fontconfig
process.env.AVS_HOME = path.join(TMP, 'home'); process.env.HOME = path.join(TMP, 'user'); process.env.USERPROFILE = path.join(TMP, 'user');
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const proj = path.join(TMP, 'du-an');
fs.mkdirSync(path.join(proj, 'work'), { recursive: true });
const TL = { width: 1080, height: 1920, duration: 6, scenes: [], audio: { voice: 'work/aroll.mp4' } };
fs.writeFileSync(path.join(proj, 'timeline.json'), JSON.stringify(TL));
const ctx = { json: (res, o, code = 200) => { res.code = code; res.body = o; }, project: { dir: proj }, readProject: () => ({ timeline: TL }) };
const handler = (await import('../../studio/routes/14_source.mjs')).default(ctx);
const call = async (p, method = 'GET') => { const res = {}; const ok = await handler({ method }, res, p); return { ok, ...res }; };

test('GET /api/source: kết quả dò đã lưu + toạ độ thiết kế; chưa dò thì burnin = null', async () => {
  let r = await call('/api/source');
  assert.equal(r.body.burnin, null);
  fs.mkdirSync(path.join(proj, '.studio'), { recursive: true });
  fs.writeFileSync(path.join(proj, BURN_FILE), JSON.stringify({ version: 1, found: true, y0: .7, y1: .8, x0: .1, x1: .9, w: 1080, h: 1920 }));
  r = await call('/api/source');
  assert.equal(r.body.burnin.found, true);
  assert.deepEqual(r.body.burnin.design, { x0: 72, x1: 648, y0: 896, y1: 1024 });
  assert.equal(readBurn(proj).found, true);
  assert.deepEqual(burnBand(proj, TL), { x0: 72, x1: 648, y0: 896, y1: 1024 });
});

const FONTS = path.resolve(import.meta.dirname, '../../engine/hf/glass-shard-title/assets/fonts'); // fontconfig không chắc có trên Windows
const hasFF = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
test('POST /api/source/burnin: dò video có chữ cháy sẵn (drawtext đổi theo câu) và lưu cạnh dự án', { skip: !hasFF && 'không có ffmpeg' }, async () => {
  const lines = ['XIN CHAO CAC BAN', 'HOM NAY MINH SE', 'CHIA SE MEO HAY', 'LAM VIDEO NGAN', 'NHANH VA DE LAM', 'NHO THEO DOI NHE'];
  const dt = lines.map((s, i) => `drawtext=fontfile=Geist-Bold.ttf:text='${s}':fontsize=44:fontcolor=white:borderw=4:bordercolor=black:x=(w-tw)/2:y=h*0.74:enable='between(t,${i},${i + .9})'`).join(',');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:d=6:r=10', '-vf', `hue=s=0,boxblur=6,${dt}`, '-pix_fmt', 'yuv420p', path.join(proj, 'work/aroll.mp4')], { env: ENV0, stdio: 'ignore', cwd: FONTS });
  fs.rmSync(path.join(proj, BURN_FILE), { force: true });
  const r = await call('/api/source/burnin', 'POST');
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.burnin.found, true, JSON.stringify(r.body.burnin));
  assert.ok(r.body.burnin.y0 > .68 && r.body.burnin.y0 < .76, `y0 ${r.body.burnin.y0}`);
  assert.ok(fs.existsSync(path.join(proj, BURN_FILE)));
  assert.equal((await call('/api/source')).body.burnin.found, true);
});
