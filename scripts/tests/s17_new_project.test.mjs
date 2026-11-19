// Test S17 M126: video mới không lẫn với dự án đang mở. Server Studio thật (studio/server.mjs, không render):
// /api/project trả meta.kho (thanh trên hiện tên dự án + Kho); "Video mới" đóng dự án đang mở trong lúc tạo, tạo hỏng thì mở lại
// dự án cũ; không có dự án mở thì /api/save từ chối (chốt chặn sẵn có của server.mjs). Phần giao diện kiểm bằng mã nguồn (hộp Video mới,
// Tự lái, trang chủ). Chạy: node --test scripts/tests/s17_new_project.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { killTree } from '../platform.mjs';
import { tokenFile } from '../../studio/security.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m126-'));
const HOME = path.join(TMP, 'home'), KHO = path.join(TMP, 'Kho Thu'), PROJ = path.join(KHO, 'Du an', 'Clip Cu');
fs.mkdirSync(HOME, { recursive: true }); fs.mkdirSync(PROJ, { recursive: true });
fs.writeFileSync(path.join(KHO, '.kho.json'), JSON.stringify({ version: 1, brand: '', title: 'Chung' }));
fs.writeFileSync(path.join(PROJ, 'timeline.json'), JSON.stringify({ width: 720, height: 1280, duration: 2, scenes: [], captions: [] }));
const read = f => fs.readFileSync(path.join(SKILL, f), 'utf8');

const freePort = () => new Promise(ok => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
async function startServer(args) {
  const port = await freePort();
  const env = { ...process.env, AVS_HOME: HOME, AVS_NO_LAUNCHCTL: '1', AVS_DRY_OPEN: '1', AVS_NO_SCHEDULE_TIMER: '1' };
  const proc = spawn(process.execPath, [path.join(SKILL, 'studio/server.mjs'), ...args, '--port', String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  await new Promise((ok, bad) => {
    const t = setTimeout(() => bad(new Error('server không khởi động:\n' + out)), 20000);
    const on = d => { out += d; if (out.includes('AI Video Studio')) { clearTimeout(t); ok(); } };
    proc.stdout.on('data', on); proc.stderr.on('data', on);
    proc.on('exit', c => bad(new Error(`server thoát mã ${c}:\n${out}`)));
  });
  for (let i = 0; i < 50 && !fs.existsSync(tokenFile(port, HOME)); i++) await new Promise(r => setTimeout(r, 100));
  const token = fs.readFileSync(tokenFile(port, HOME), 'utf8');
  const api = (p, body) => new Promise((ok, bad) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const h = { 'X-AVS-Token': token, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) };
    const r = http.request({ host: '127.0.0.1', port, path: p, method: data ? 'POST' : 'GET', headers: h }, res => {
      const c = []; res.on('data', d => c.push(d)); res.on('end', () => { const t = Buffer.concat(c).toString('utf8'); try { ok({ status: res.statusCode, json: JSON.parse(t) }); } catch { ok({ status: res.statusCode, text: t }); } });
    });
    r.on('error', bad); r.end(data);
  });
  return { proc, api };
}
let A = null, B = null;
before(async () => { [A, B] = await Promise.all([startServer([PROJ]), startServer([])]); });
after(async () => {
  for (const s of [A, B]) if (s) await killTree(s.proc);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* file còn bị khoá: bỏ qua */ }
});
const waitJob = async api => { for (let i = 0; i < 200; i++) { const j = (await api('/api/job')).json; if (j && j.state !== 'running') return j; await new Promise(r => setTimeout(r, 50)); } throw new Error('job không xong'); };

test('/api/project: meta.kho là Kho của dự án đang mở (thanh trên hiện tên dự án + Kho)', async () => {
  const r = await A.api('/api/project');
  assert.equal(r.status, 200);
  assert.equal(r.json.meta.name, 'Clip Cu');
  assert.deepEqual({ ...r.json.meta.kho, root: path.resolve(r.json.meta.kho.root) }, { brand: '', title: 'Chung', root: path.resolve(KHO), found: 'kho' });
});

test('Video mới tạo hỏng: dự án cũ được mở lại, timeline cũ không bị ghi', async () => {
  const before = fs.readFileSync(path.join(PROJ, 'timeline.json'), 'utf8');
  const r = await A.api('/api/new', { video: path.join(TMP, 'khong-co.mp4') });
  assert.equal(r.status, 200, JSON.stringify(r));
  const j = await waitJob(A.api);
  assert.equal(j.state, 'error', JSON.stringify(j));
  const p = await A.api('/api/project');
  assert.equal(p.status, 200); assert.equal(p.json.meta.dir, PROJ);
  assert.equal(fs.readFileSync(path.join(PROJ, 'timeline.json'), 'utf8'), before);
});

test('không có dự án mở (đang tạo video mới): /api/save từ chối, không ghi vào đâu', async () => {
  assert.equal((await B.api('/api/project')).status, 404);
  const r = await B.api('/api/save', { timeline: { scenes: [] }, captions: [] });
  assert.equal(r.status, 400, JSON.stringify(r)); assert.match(r.json.error, /Chưa mở dự án/);
});

test('/api/save kèm dir của dự án khác (tab cũ sau Video mới) → 409, timeline không bị ghi; dir đúng hoặc không gửi thì lưu', async () => {
  const f = path.join(PROJ, 'timeline.json'), before = fs.readFileSync(f, 'utf8');
  const tl = { width: 720, height: 1280, duration: 2, scenes: [], captions: [] };
  let r = await A.api('/api/save', { timeline: { ...tl, note: 'tab cu' }, captions: [], dir: path.join(KHO, 'Du an', 'Khac') });
  assert.equal(r.status, 409, JSON.stringify(r)); assert.match(r.json.error, /dự án khác/);
  assert.equal(fs.readFileSync(f, 'utf8'), before);
  r = await A.api('/api/save', { timeline: { ...tl, note: 'dung' }, captions: [], dir: PROJ });
  assert.equal(r.status, 200, JSON.stringify(r)); assert.match(fs.readFileSync(f, 'utf8'), /"dung"/);
  r = await A.api('/api/save', { timeline: { ...tl, note: 'khong dir' }, captions: [] });
  assert.equal(r.status, 200); assert.match(fs.readFileSync(f, 'utf8'), /khong dir/);
  assert.match(read('studio/studio.js'), /api\('\/api\/save', \{ timeline: TL, captions: CAP, dir: META\?\.dir, base: META\?\.saved/); // S18 M131: + base
});

test('server: newProject đóng dự án đang mở trước khi dựng, khôi phục khi lỗi', () => {
  const s = read('studio/server.mjs'), f = s.slice(s.indexOf('async function newProject'), s.indexOf('function startJob'));
  // S18 M129: dự án của request (cur / setReq: chỉ dự án của request) thay cho biến toàn cục `project`; cùng hành vi
  assert.match(f, /const prev = cur\(\), prevPid = curPid\(\); setReq\(null\);[\s\S]*await build\(/);
  assert.match(f, /catch \(e\) \{\s*if \(!cur\(\) && prev\) setReq\(prev, prevPid\);\s*throw e;/);
});

test('hộp Video mới: lưu dự án đang mở rồi che trình chỉnh sửa; dòng Thương hiệu · Kho; nhắc khi Kho khác, cho đổi lại', () => {
  const s = read('studio/studio.js'), f = s.slice(s.indexOf('async function openNewProject'), s.indexOf('function toast('));
  assert.ok(f.indexOf('await saveNow()') > -1 && f.indexOf('await saveNow()') < f.indexOf("api('/api/new'"), 'lưu trước khi gửi /api/new');
  assert.match(f, /np-busy/); assert.match(f, /newBusy = true; dirty = false/);
  assert.match(f, /Thương hiệu · Kho/); assert.match(f, /khác dự án đang mở/); assert.match(f, /Dùng Kho của dự án đang mở/);
  assert.match(f, /META\?\.kho/, 'thương hiệu mặc định theo dự án đang mở');
  assert.match(s, /async function saveOnce\(force(, quiet)?\) \{\n(  if \(readOnly\)[^\n]*\n)? {2}if \(newBusy\) return false;/);
  assert.match(s, /\$\('#pkho'\)/); assert.match(read('studio/index.html'), /id="pkho"/);
  assert.match(read('studio/studio.css'), /body\.np-busy > \*:not\(#modal\)/);
});

test('Tự lái: nhắc khi Kho khác dự án đang mở; trang chủ lưu dự án đang mở trước khi đổi', () => {
  const a = read('studio/features/15_autopilot.js');
  assert.match(a, /function offKho/); assert.match(a, /khác dự án đang mở/); assert.match(a, /ap-kho-back/);
  assert.match(read('studio/features/02_onboarding.js'), /await Studio\.saveNow\(\)[^\n]*if \(Studio\.dirty\)[^\n]*return; \} \}\n\s*const j = await api\('\/api\/onboarding\/open'/);
});
