// Test S19 M136 + M132: thẻ dự án của trang chủ (scripts/home_cards.mjs, /api/onboarding, /api/onboarding/thumb) và Tự lái rời
// thanh trên (chỉ báo việc nền ở 15_autopilot.js, thẻ thả nhiều video ở 02_onboarding.js).
// Chạy: node --test scripts/tests/s19_home.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-s19-'));
process.env.AVS_HOME = HOME;
after(() => fs.rmSync(HOME, { recursive: true, force: true }));
const H = await import('../home_cards.mjs');
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);

let n = 0;
function proj(tl = { width: 1080, height: 1920, duration: 31.5 }, files = {}) {
  const d = path.join(HOME, 'footage', `p${++n}`);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'timeline.json'), JSON.stringify(tl));
  for (const [rel, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), body); }
  return d;
}

test('durOf: duration, không có thì cộng các đoạn clip', () => {
  assert.equal(H.durOf({ duration: 12.345 }), 12.35);
  assert.equal(H.durOf({ clips: [{ in: 1, out: 4 }, { in: 0, out: 2.5 }, { in: 5, out: 3 }] }), 5.5);
  assert.equal(H.durOf(null), 0);
});

test('cardOf: thời lượng, Kho Chung, khổ dọc, đã xuất theo out/*.mp4; thư mục mất → null', () => {
  const d = proj(undefined, { 'out/video.mp4': 'x', 'out/video2.mp4.part': 'x' });
  const c = H.cardOf(d);
  assert.equal(c.dur, 31.5); assert.equal(c.brand, ''); assert.equal(c.aspect, 'v'); assert.equal(c.exported, true); assert.equal(c.thumb, null);
  assert.ok(Date.parse(c.edited) > 0);
  assert.equal(H.cardOf(path.join(HOME, 'khong-co')), null);
  assert.equal(H.cardOf(proj({ width: 1920, height: 1080, clips: [] })).exported, false);
});

test('thumbOf: ảnh bìa đã xuất (out/cover.jpg) thắng .studio/thumb.jpg', () => {
  const d = proj(undefined, { '.studio/thumb.jpg': JPG });
  assert.equal(H.thumbOf(d), path.join(d, '.studio/thumb.jpg'));
  fs.mkdirSync(path.join(d, 'out'), { recursive: true }); fs.writeFileSync(path.join(d, 'out/cover.jpg'), JPG);
  assert.equal(H.thumbOf(d), path.join(d, 'out/cover.jpg'));
  assert.ok(H.cardOf(d).thumb.v > 0);
});

test('frameSource: khung ~1 s của chuỗi ảnh, video trong dự án; đường dẫn ngoài dự án bị bỏ', () => {
  const seq = { src: { seq: 'work/frames/%05d.jpg', fps: 30, count: 100 }, in: 0, out: 3 };
  const d = proj({ clips: [seq] }, { 'work/frames/00031.jpg': JPG, 'work/frames/00001.jpg': JPG });
  assert.deepEqual(H.frameSource(d), [path.join(d, 'work/frames/00031.jpg'), 0]);
  const outside = path.join(HOME, 'ngoai.mp4'); fs.writeFileSync(outside, 'x');
  const e = proj({ clips: [{ src: outside, in: 0, out: 2 }] });
  assert.equal(H.frameSource(e), null, 'video nằm ngoài thư mục dự án không được đọc');
  const f = proj({ clips: [{ src: '../ngoai.mp4', in: 0, out: 2 }] }, { 'work/aroll.mp4': 'x' });
  assert.deepEqual(H.frameSource(f), [path.join(f, 'work/aroll.mp4'), 1], 'đường dẫn ../ bị bỏ, dùng work/aroll.mp4');
  const g = proj({ clips: [{ src: 'media/a.mp4', in: 4, out: 6 }] }, { 'media/a.mp4': 'x' });
  assert.deepEqual(H.frameSource(g), [path.join(g, 'media/a.mp4'), 5]);
});

test('queueThumb: tạo một lần ở nền vào .studio/thumb.jpg; lỗi → thumb.none, không thử lại', async () => {
  const d = proj({ clips: [{ src: 'media/a.mp4', in: 0, out: 2 }] }, { 'media/a.mp4': 'x' });
  const calls = [];
  const run = async args => { calls.push(args); fs.writeFileSync(args.at(-1), JPG); return true; };
  assert.equal(H.queueThumb(d, { run }), true);
  assert.equal(H.thumbPending(d), true);
  assert.equal(H.queueThumb(d, { run }), false, 'đang chờ: không xếp hàng lần hai');
  await H.thumbsIdle();
  assert.equal(calls.length, 1); assert.ok(calls[0].includes('-frames:v'));
  assert.ok(fs.existsSync(path.join(d, '.studio/thumb.jpg')));
  assert.deepEqual(fs.readdirSync(path.join(d, '.studio')).filter(f => f.includes('.tmp')), []);
  assert.equal(H.queueThumb(d, { run }), false, 'đã có ảnh: không tạo lại');

  const bad = proj({ clips: [{ src: 'media/a.mp4', in: 0, out: 2 }] }, { 'media/a.mp4': 'x' });
  let k = 0; const fail = async () => (k++, false);
  H.queueThumb(bad, { run: fail }); await H.thumbsIdle();
  assert.equal(k, 2, 'thử ở giây 1 rồi giây 0');
  assert.ok(fs.existsSync(path.join(bad, H.NONE)));
  assert.equal(H.queueThumb(bad, { run: fail }), false); assert.equal(k, 2);
});

// ---------- route ----------
const { readJson } = await import('../../studio/security.mjs');
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const sendFile = (req, res, f) => { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); res.end(fs.readFileSync(f)); };
const A = proj(undefined, { 'out/cover.jpg': JPG, 'out/a.mp4': 'x' }), B = proj({ width: 1920, height: 1080, clips: [{ in: 0, out: 7 }] });
let tabs = [{ dir: B }];
const ctx = { json, sendFile, body: req => readJson(req), project: { dir: A }, openProject() {}, tabs: { list: () => tabs } };
const handler = (await import('../../studio/routes/02_onboarding.mjs')).default(ctx);
const app = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try { if (!(await handler(req, res, u.pathname, u))) json(res, { error: 'not found' }, 404); } catch (e) { json(res, { error: e.message }, 500); }
});
await new Promise(ok => app.listen(0, '127.0.0.1', ok));
after(() => { app.closeAllConnections?.(); app.close(); });
const BASE = `http://127.0.0.1:${app.address().port}`;

test('GET /api/onboarding: mỗi mục kèm thẻ (thời lượng, Kho, đã xuất, ảnh bìa, đang mở trên thanh tab), không lộ đường dẫn', async () => {
  fs.writeFileSync(path.join(HOME, 'onboarding.json'), JSON.stringify({ done: true, recent: [{ dir: B, name: 'b' }] }));
  const j = await (await fetch(BASE + '/api/onboarding')).json();
  const [a, b] = j.recent;
  assert.equal(a.current, true); assert.equal(a.exported, true); assert.ok(a.thumb?.v); assert.equal(a.dur, 31.5); assert.equal(a.kho.length > 0, true);
  assert.equal(b.open, true); assert.equal(a.open, false); assert.equal(b.dur, 7); assert.equal(b.aspect, 'h'); assert.equal(b.exported, false);
  assert.equal(JSON.stringify(j).includes(HOME.replace(/\\/g, '\\\\')), false, 'không trả đường dẫn đầy đủ');
});

test('GET /api/onboarding/thumb?i=: trả ảnh theo số thứ tự; không có ảnh / số lạ → 404; không nhận đường dẫn', async () => {
  const r = await fetch(BASE + '/api/onboarding/thumb?i=0');
  assert.equal(r.status, 200); assert.deepEqual(Buffer.from(await r.arrayBuffer()), JPG);
  await H.thumbsIdle(); // B không có nguồn khung hình → thumb.none
  assert.equal((await fetch(BASE + '/api/onboarding/thumb?i=1')).status, 404);
  assert.ok(fs.existsSync(path.join(B, H.NONE)));
  for (const q of ['i=9', 'i=-1', 'i=x', `p=${encodeURIComponent(path.join(A, 'out/cover.jpg'))}`]) assert.equal((await fetch(BASE + '/api/onboarding/thumb?' + q)).status, 404, q);
});

// ---------- M132: Tự lái rời thanh trên ----------
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
test('M132: nút Tự lái trên thanh trên thành chỉ báo việc nền (ẩn khi trống, không còn chữ), bắt đầu ở thẻ trang chủ', () => {
  const ap = src('studio/features/15_autopilot.js'), onb = src('studio/features/02_onboarding.js');
  const btn = ap.match(/addTopButton\('(<button[^']*)'/)[1];
  assert.match(btn, /id="ap-topbtn" hidden/); assert.doesNotMatch(btn, /> Tự lái</);
  assert.match(ap, /b\.hidden = !cls/);
  assert.match(onb, /id="onb-apfile"[^>]*multiple/); assert.match(onb, /\/api\/autopilot\/upload\?name=/); assert.match(onb, /id="onb-apbrand"/);
  assert.match(onb, /card\('new',[\s\S]{0,400}apCard\(/, 'thẻ Video mới cạnh thẻ Tự lái');
});
