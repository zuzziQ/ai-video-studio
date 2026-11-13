// M39 — lịch đăng và tự tải lên YouTube (scripts/publish.mjs): giờ Việt Nam, xếp khung giờ không trùng, khoá run-due,
// nhắc trước 10 phút, tải lên YouTube resumable theo chunk qua máy chủ HTTP giả cục bộ (AVS_YT_API / AVS_YT_TOKEN_URI),
// lỗi quota, token bị thu hồi, publish_last_run.json. Chạy: node --test scripts/tests/*.test.mjs
// Không mở trình duyệt (AVS_DRY_OPEN=1), không đụng clipboard (chỉ đăng nền tảng khác khi đến giờ — các test không tới đó),
// không gọi Google thật, AVS_HOME là thư mục tạm.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-publish-m39-'));
process.env.AVS_HOME = HOME;
process.env.AVS_NO_LAUNCHCTL = '1';
process.env.AVS_DRY_OPEN = '1';
process.env.AVS_YT_CHUNK = String(256 * 1024); // tối thiểu 256 KB → video 600 KB sẽ có 3 chunk
process.env.AVS_YT_BACKOFF_MS = '1';
delete process.env.AVS_NOW;

let P;
let base = '';
const CHUNK_SIZE = 256 * 1024;
const T_VN = '2026-11-05T11:30:00.000Z'; // 18:30 giờ Việt Nam ngày 05/11/2026
const fake = { init: [], received: Buffer.alloc(0), total: 0, initStatus: 200, initReason: '', tokenError: null, fault503: false, puts: 0 };

// Máy chủ giả: token endpoint + khởi tạo/tải tiếp resumable của YouTube Data API
const server = http.createServer((req, res) => {
  const chunks = []; req.on('data', d => chunks.push(d));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const json = (code, obj, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(obj)); };
    if (req.url === '/token') {
      if (fake.tokenError) return json(400, { error: fake.tokenError });
      return json(200, { access_token: 'ACCESS-FAKE-2', expires_in: 3600, token_type: 'Bearer' });
    }
    if (req.url.startsWith('/upload/youtube/v3/videos')) {
      fake.init.push({ headers: req.headers, body: JSON.parse(body.toString('utf8')) });
      if (fake.initStatus !== 200) return json(fake.initStatus, { error: { message: 'máy chủ giả từ chối', errors: [{ reason: fake.initReason }] } });
      fake.received = Buffer.alloc(0);
      fake.total = +req.headers['x-upload-content-length'];
      return json(200, {}, { Location: `${base}/session/S1` });
    }
    if (req.url === '/session/S1' && req.method === 'PUT') {
      const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(req.headers['content-range'] || ''));
      if (!m) { // "bytes */N": hỏi đã nhận bao nhiêu
        if (fake.received.length) res.writeHead(308, { Range: `bytes=0-${fake.received.length - 1}` });
        else res.writeHead(308);
        return res.end();
      }
      if (fake.fault503) { fake.fault503 = false; res.writeHead(503); return res.end(); }
      fake.puts++;
      if (+m[1] !== fake.received.length) { res.writeHead(400); return res.end(); }
      fake.received = Buffer.concat([fake.received, body]);
      if (fake.received.length >= fake.total) return json(200, { id: 'VID123', status: { uploadStatus: 'uploaded' } });
      res.writeHead(308, { Range: `bytes=0-${fake.received.length - 1}` });
      return res.end();
    }
    res.writeHead(404); res.end();
  });
});

before(async () => {
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
  process.env.AVS_YT_API = base;
  process.env.AVS_YT_TOKEN_URI = base + '/token';
  P = await import('../publish.mjs');
});
after(() => { server.close(); fs.rmSync(HOME, { recursive: true, force: true }); });

const SCHED = path.join(HOME, 'schedule.json');
const setNow = iso => { process.env.AVS_NOW = iso; };
function reset() {
  for (const f of ['schedule.json', 'publish_open.log', 'publish_last_run.json', 'publish.lock', 'youtube_token.json', 'youtube_client.json']) fs.rmSync(path.join(HOME, f), { force: true });
  fs.rmSync(path.join(HOME, 'uploads'), { recursive: true, force: true });
  Object.assign(fake, { init: [], received: Buffer.alloc(0), total: 0, initStatus: 200, initReason: '', tokenError: null, fault503: false, puts: 0 });
  delete process.env.AVS_NOW;
}
function connectYouTube({ expired = false } = {}) {
  fs.writeFileSync(path.join(HOME, 'youtube_client.json'), JSON.stringify({ installed: { client_id: 'fake-1.apps.googleusercontent.com', client_secret: 'fake-secret' } }));
  fs.writeFileSync(path.join(HOME, 'youtube_token.json'), JSON.stringify({ refresh_token: 'fake-refresh', access_token: 'ACCESS-FAKE-1', expires_at: expired ? 0 : Date.now() + 3600e3 }));
}
function mkVideo(name, size) {
  const f = path.join(HOME, 'media', name);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const buf = crypto.randomBytes(size);
  fs.writeFileSync(f, buf);
  return { file: f, buf };
}
const openLog = () => fs.existsSync(path.join(HOME, 'publish_open.log')) ? fs.readFileSync(path.join(HOME, 'publish_open.log'), 'utf8') : '';
const readSched = () => JSON.parse(fs.readFileSync(SCHED, 'utf8')).items;

test('giờ Việt Nam: nhập không múi giờ được hiểu là UTC+7 và lưu dạng ISO UTC', () => {
  assert.equal(P.parseWhen('2026-11-05 19:30').toISOString(), '2026-11-05T12:30:00.000Z');
  assert.equal(P.parseWhen('2026-11-05T19:30').toISOString(), '2026-11-05T12:30:00.000Z');
  assert.equal(P.parseWhen('2026-11-05T12:30:00Z').toISOString(), '2026-11-05T12:30:00.000Z');
  assert.throws(() => P.parseWhen('ngày mai lúc tám giờ'), /Thời điểm không hợp lệ/);
});

test('fmtVN: hiển thị thứ, ngày, giờ theo Việt Nam (05/11/2026 là thứ Năm)', () => {
  assert.equal(P.fmtVN('2026-11-05T12:30:00Z'), 'T5 05/11 19:30');
});

test('thêm lịch: lưu đường dẫn tuyệt đối, cần file có thật và nền tảng hợp lệ; mục không có thì xoá báo lỗi', () => {
  reset();
  const { file } = mkVideo('a.mp4', 1000);
  const it = P.addItem({ file, platform: 'youtube', when: '2026-11-05 19:30', title: 'Clip A' });
  assert.equal(it.state, 'planned');
  assert.equal(it.privacy, 'public');
  assert.equal(it.when, '2026-11-05T12:30:00.000Z');
  assert.equal(path.resolve(file), it.file);
  assert.throws(() => P.addItem({ file: path.join(HOME, 'khong-co.mp4'), platform: 'youtube', when: '2026-11-05 19:30' }), /Không thấy file video/);
  assert.throws(() => P.addItem({ file, platform: 'myspace', when: '2026-11-05 19:30' }), /Nền tảng lạ/);
  assert.throws(() => P.removeItem('khong-co-id'), /Không thấy mục lịch/);
  assert.equal(P.removeItem(it.id), true);
  assert.deepEqual(readSched(), []);
});

test('xếp lịch tự động: video mới không trùng khung giờ đã có, sang ngày sau khi hết khung', () => {
  reset();
  setNow('2026-11-05T01:00:00Z'); // 08:00 giờ Việt Nam
  const v1 = mkVideo('v1.mp4', 500).file, v2 = mkVideo('v2.mp4', 500).file;
  P.addItem({ file: v1, platform: 'youtube', when: '2026-11-05 11:30', title: 'Đã có sẵn' }); // chiếm khung 11:30 hôm nay
  const added = P.autoSchedule([v2, v1].map(f => ({ file: f })), ['youtube']);
  assert.deepEqual(added.map(x => x.when), ['2026-11-05T12:30:00.000Z', '2026-11-06T04:30:00.000Z']);
  const whens = readSched().map(x => x.when);
  assert.equal(new Set(whens).size, whens.length, 'không có hai mục cùng giờ trên cùng nền tảng');
});

test('xếp lịch tự động: thiếu video hoặc nền tảng thì báo lỗi', () => {
  reset();
  assert.throws(() => P.autoSchedule([], ['youtube']), /Chọn ít nhất 1 video/);
  assert.throws(() => P.autoSchedule(['x.mp4'], ['myspace']), /Chọn ít nhất 1 nền tảng/);
});

test('khoá run-due: đang có tiến trình sống giữ khoá thì lượt này bỏ qua; khoá của tiến trình đã chết bị dọn', async () => {
  reset();
  const lock = path.join(HOME, 'publish.lock');
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
  const skipped = await P.runDue({ log: () => {} });
  assert.equal(skipped.skipped, 'locked');
  assert.ok(fs.existsSync(lock), 'không xoá khoá của tiến trình còn sống');
  fs.writeFileSync(lock, JSON.stringify({ pid: 2147483601, started: new Date().toISOString() }));
  const ran = await P.runDue({ log: () => {} });
  assert.equal(ran.skipped, undefined);
  assert.ok(!fs.existsSync(lock), 'khoá sau khi chạy xong được nhả');
});

test('run-due: nhắc trước 10 phút đúng một lần, không nhắc lặp; ghi publish_last_run.json', async () => {
  reset();
  const { file } = mkVideo('tt.mp4', 500);
  P.addItem({ file, platform: 'tiktok', when: '2026-11-05 18:35', title: 'TT-NHAC-1' }); // 5 phút nữa
  setNow(T_VN);
  const r1 = await P.runDue({ log: () => {} });
  assert.equal(r1.preReminded.length, 1);
  const r2 = await P.runDue({ log: () => {} });
  assert.equal(r2.preReminded.length, 0);
  const lines = openLog().split('\n').filter(l => l.includes('NOTIFY') && l.includes('TT-NHAC-1'));
  assert.equal(lines.length, 1);
  const last = JSON.parse(fs.readFileSync(path.join(HOME, 'publish_last_run.json'), 'utf8'));
  assert.equal(last.now, T_VN);
});

test('YouTube: tải lên resumable theo chunk, đặt lịch công khai đúng giờ, lần chạy sau không đăng trùng', async () => {
  reset(); connectYouTube();
  const { file, buf } = mkVideo('yt.mp4', 600 * 1024);
  P.addItem({ file, platform: 'youtube', when: '2026-11-05 19:30', title: 'Clip YT' }); // 60 phút nữa, nằm trong ytLeadMin
  setNow(T_VN);
  const r = await P.runDue({ log: () => {} });
  assert.equal(r.uploaded.length, 1, JSON.stringify(r.errors));
  const it = readSched()[0];
  assert.equal(it.state, 'done');
  assert.equal(it.url, 'https://youtu.be/VID123');
  assert.equal(it.publishAt, '2026-11-05T12:30:00.000Z');
  const sent = fake.init[0].body;
  assert.equal(sent.snippet.title, 'Clip YT');
  assert.equal(sent.status.privacyStatus, 'private'); // có lịch thì YouTube giữ riêng tư đến giờ hẹn
  assert.equal(sent.status.publishAt, '2026-11-05T12:30:00.000Z');
  assert.equal(fake.init[0].headers['x-upload-content-length'], String(600 * 1024));
  assert.equal(fake.puts, Math.ceil((600 * 1024) / CHUNK_SIZE));
  assert.ok(fake.received.equals(buf), 'nội dung nhận được khớp file gốc');
  assert.ok(!fs.existsSync(path.join(HOME, 'uploads')) || fs.readdirSync(path.join(HOME, 'uploads')).length === 0, 'phiên tải dở đã dọn');
  const again = await P.runDue({ log: () => {} });
  assert.equal(again.uploaded.length, 0);
  assert.equal(fake.init.length, 1, 'không khởi tạo lại phiên khi đã đăng xong');
});

test('YouTube: lỗi 503 tạm thời được thử lại, vẫn tải xong đủ nội dung', async () => {
  reset(); connectYouTube();
  const { file, buf } = mkVideo('flaky.mp4', 300 * 1024);
  P.addItem({ file, platform: 'youtube', when: '2026-11-05 19:30', title: 'Clip flaky' });
  setNow(T_VN);
  fake.fault503 = true;
  const r = await P.runDue({ log: () => {} });
  assert.equal(r.uploaded.length, 1, JSON.stringify(r.errors));
  assert.ok(fake.received.equals(buf));
});

test('YouTube: hết quota → mục giữ ở "planned", lỗi ghi rõ là quota, thử lại sau 60 phút', async () => {
  reset(); connectYouTube();
  const { file } = mkVideo('quota.mp4', 1000);
  const it = P.addItem({ file, platform: 'youtube', when: '2026-11-05 19:30', title: 'Clip quota' });
  setNow(T_VN);
  fake.initStatus = 403; fake.initReason = 'quotaExceeded';
  const r = await P.runDue({ log: () => {} });
  assert.equal(r.uploaded.length, 0);
  assert.equal(r.errors.length, 1);
  const saved = readSched().find(x => x.id === it.id);
  assert.equal(saved.state, 'planned');
  assert.match(saved.error, /quota/i);
  assert.equal(Date.parse(saved.retryAfter) - Date.parse(T_VN), 60 * 60e3);
});

test('YouTube: refresh token bị thu hồi → mục thành "error" kèm lời nhắc kết nối lại, không thử lại', async () => {
  reset(); connectYouTube({ expired: true });
  fake.tokenError = 'invalid_grant';
  const { file } = mkVideo('revoked.mp4', 1000);
  const it = P.addItem({ file, platform: 'youtube', when: '2026-11-05 19:30', title: 'Clip thu hồi' });
  setNow(T_VN);
  const r = await P.runDue({ log: () => {} });
  assert.equal(r.uploaded.length, 0);
  const saved = readSched().find(x => x.id === it.id);
  assert.equal(saved.state, 'error');
  assert.match(saved.error, /Kết nối YouTube/);
  assert.equal(saved.retryAfter, null);
  assert.equal(fake.init.length, 0);
});

test('captionsFor: lấy chú thích đúng nền tảng, thiếu thì dùng YouTube, không có gì thì dùng tên file', () => {
  reset();
  const proj = path.join(HOME, 'du-an');
  fs.mkdirSync(path.join(proj, 'out'), { recursive: true });
  fs.mkdirSync(path.join(proj, 'publish'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'timeline.json'), JSON.stringify({ title: 'Tên dự án' }));
  fs.writeFileSync(path.join(proj, 'publish/publish.json'), JSON.stringify({ platforms: { youtube: { title: 'Tiêu đề YT', caption: 'Mô tả', hashtags: ['a b', '#c'] } } }));
  const f = path.join(proj, 'out', 'ban_cuoi-1.mp4');
  const yt = P.captionsFor(f, 'youtube');
  assert.equal(yt.title, 'Tiêu đề YT');
  assert.deepEqual(yt.hashtags, ['#ab', '#c']);
  assert.equal(P.captionsFor(f, 'tiktok').title, 'Tiêu đề YT'); // không có tiktok → lấy youtube
  fs.rmSync(path.join(proj, 'publish'), { recursive: true, force: true });
  assert.equal(P.captionsFor(f, 'youtube').title, 'Tên dự án'); // không có publish.json → tiêu đề dự án
  assert.equal(P.captionsFor(path.join(HOME, 'le', 'ban_cuoi-2.mp4'), 'youtube').title, 'ban cuoi 2');
});

// Ví dụ trong RFC 7636 phụ lục B
test('PKCE khớp ví dụ trong RFC 7636; URL xin quyền có code_challenge S256 và access_type offline', () => {
  const { challenge, method } = P.pkce('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
  assert.equal(challenge, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  assert.equal(method, 'S256');
  const u = new URL(P.buildAuthUrl({ clientId: 'cid', redirectUri: 'http://127.0.0.1:9/', challenge, state: 'st' }));
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.ok(u.searchParams.get('scope').includes('youtube.upload'));
});

// ---------- M40: khoá schedule.json giữa các tiến trình ----------
// Mỗi tiến trình con nạp publish.mjs với cùng AVS_HOME, chờ đến cùng một mốc giờ rồi mới ghi, để các lần ghi chồng lên nhau.
const PUB_URL = pathToFileURL(path.resolve(import.meta.dirname, '../publish.mjs')).href;
function child(body, { startAt, env = {} }) {
  const src = `const P = await import(${JSON.stringify(PUB_URL)}); while (Date.now() < ${startAt}) {}\n${body}`;
  return new Promise((ok, fail) => {
    const ch = spawn(process.execPath, ['--input-type=module', '-e', src], { env: { ...process.env, AVS_HOME: HOME, AVS_DRY_OPEN: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    ch.stdout.on('data', d => (out += d)); ch.stderr.on('data', d => (err += d));
    ch.on('close', code => (code === 0 ? ok(out) : fail(new Error(`tiến trình con thoát ${code}: ${err.slice(-500)}`))));
  });
}

test('M40: hai tiến trình cùng thêm rồi sửa lịch một lúc không mất mục nào', async () => {
  reset();
  const { file } = mkVideo('song-song.mp4', 500);
  const N = 25, startAt = Date.now() + 1500;
  const body = tag => `
    const ids = [];
    for (let i = 0; i < ${N}; i++) ids.push(P.addItem({ file: ${JSON.stringify(file)}, platform: 'tiktok', when: '2026-12-01 19:30', title: '${tag}-' + i }).id);
    for (const id of ids) P.updateItem(id, { caption: 'sửa bởi ${tag}' });`;
  await Promise.all([child(body('A'), { startAt }), child(body('B'), { startAt })]);
  const items = readSched();
  assert.equal(items.length, 2 * N, 'đủ mục của cả hai tiến trình');
  for (const tag of ['A', 'B']) {
    const mine = items.filter(x => x.title.startsWith(tag + '-'));
    assert.equal(mine.length, N);
    assert.ok(mine.every(x => x.caption === 'sửa bởi ' + tag), `mọi mục của ${tag} giữ bản sửa`);
  }
  assert.ok(!fs.existsSync(SCHED + '.lock'), 'khoá được nhả');
  assert.deepEqual(fs.readdirSync(HOME).filter(f => f.endsWith('.tmp')), [], 'không còn file tạm');
});

test('M40: run-due chạy song song với Studio sửa lịch: cả cờ nhắc lẫn bản sửa đều còn', async () => {
  reset();
  const { file } = mkVideo('nhac.mp4', 500);
  const N = 25, ids = [];
  for (let i = 0; i < N; i++) ids.push(P.addItem({ file, platform: 'tiktok', when: '2026-11-05 18:35', title: 'NHAC-' + i }).id); // 5 phút sau T_VN
  const startAt = Date.now() + 1500;
  const studio = `
    const ids = ${JSON.stringify(ids)};
    for (const id of ids) P.updateItem(id, { caption: 'sửa từ Studio' });
    for (let i = 0; i < 15; i++) P.addItem({ file: ${JSON.stringify(file)}, platform: 'youtube', when: '2026-12-02 11:30', title: 'MOI-' + i });
    P.setSettings({ slots: '11:30,19:30,21:00' });`;
  const [due] = await Promise.all([
    child(`console.log(JSON.stringify(await P.runDue({ log: () => {} })));`, { startAt, env: { AVS_NOW: T_VN } }),
    child(studio, { startAt }),
  ]);
  const r = JSON.parse(due.trim().split('\n').pop());
  assert.equal(r.preReminded.length, N, 'run-due nhắc trước đủ mục');
  const items = readSched();
  assert.equal(items.length, N + 15, 'mục Studio thêm trong lúc run-due chạy vẫn còn');
  for (const id of ids) {
    const x = items.find(y => y.id === id);
    assert.equal(x.preReminded, true, 'cờ nhắc của run-due còn');
    assert.equal(x.caption, 'sửa từ Studio', 'bản sửa của Studio còn');
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(SCHED, 'utf8')).settings.slots, ['11:30', '19:30', '21:00']);
});

test('M40: autoSchedule giữ khoá suốt lượt (gọi lồng addItem không tự chờ chính mình); schedule.json hỏng được giữ lại', () => {
  reset();
  setNow('2026-11-05T01:00:00Z');
  const v = mkVideo('auto.mp4', 500).file;
  const t0 = Date.now();
  assert.equal(P.autoSchedule([{ file: v }], ['youtube', 'tiktok']).length, 2);
  assert.ok(Date.now() - t0 < 5000, 'không kẹt chờ khoá của chính mình');
  fs.writeFileSync(SCHED, '{ hỏng');
  P.addItem({ file: v, platform: 'zalo', when: '2026-11-06 19:30' });
  assert.equal(readSched().length, 1);
  assert.ok(fs.readdirSync(HOME).some(f => f.startsWith('schedule.json.bad-')), 'bản hỏng được giữ thành schedule.json.bad-*');
});
