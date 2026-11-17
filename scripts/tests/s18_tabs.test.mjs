// S18 M129: nhiều dự án mở cùng lúc. (1) studio/tabs.mjs: danh sách tab, mã băm từ đường dẫn, đẩy tab cũ nhất khi quá giới hạn,
// file danh sách bị sửa tay không lọt đường dẫn lạ. (2) server Studio thật: hai "tab" (header X-AVS-Project) đọc / lưu xen kẽ hai
// dự án không ghi nhầm, file dự án theo /p/<mã>/, tab đã đóng → 409. Không render. AVS_HOME trong thư mục tạm.
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
import { TabRegistry, tabId, MAX_TABS } from '../../studio/tabs.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-tabs-'));
const HOME = path.join(TMP, 'home'), USER = path.join(TMP, 'user');
const mkProj = (name, title) => {
  const d = path.join(TMP, 'Du an', name); fs.mkdirSync(path.join(d, 'media'), { recursive: true });
  fs.writeFileSync(path.join(d, 'timeline.json'), JSON.stringify({ width: 720, height: 1280, duration: 2, title, scenes: [] }));
  fs.writeFileSync(path.join(d, 'media', 'a.png'), `png-${name}`);
  return d;
};
fs.mkdirSync(HOME, { recursive: true }); fs.mkdirSync(USER, { recursive: true });
const A = mkProj('Clip A', 'A'), B = mkProj('Clip B', 'B');
const tl = d => JSON.parse(fs.readFileSync(path.join(d, 'timeline.json'), 'utf8'));

// ---------- (1) TabRegistry ----------
const fakeResolve = d => { if (!fs.existsSync(path.join(d, 'timeline.json'))) throw Object.assign(new Error('không thấy'), { status: 400 }); return { dir: path.resolve(d), tlFile: path.join(path.resolve(d), 'timeline.json') }; };

test('TabRegistry: mở, mã ổn định, lưu file, nạp lại; mở lại không nhân đôi', () => {
  const file = path.join(TMP, 'reg1.json');
  const r = new TabRegistry({ file, resolve: fakeResolve });
  const a = r.open(A, 1), b = r.open(B, 2), a2 = r.open(A, 3);
  assert.equal(a.id, tabId(A)); assert.equal(a2.id, a.id); assert.match(a.id, /^[a-f0-9]{12}$/);
  assert.deepEqual(r.list().map(x => x.name), ['Clip A', 'Clip B']);
  const r2 = new TabRegistry({ file, resolve: fakeResolve });
  assert.equal(r2.get(b.id).dir, path.resolve(B));
  assert.equal(r2.get('ffffffffffff'), null); assert.equal(r2.get('../x'), null);
});

test('TabRegistry: quá giới hạn thì đẩy tab dùng lâu nhất; đóng, đổi thứ tự', () => {
  const r = new TabRegistry({ file: path.join(TMP, 'reg2.json'), resolve: fakeResolve, max: 2 });
  const C = mkProj('Clip C', 'C');
  const a = r.open(A, 1), b = r.open(B, 2); r.touch(a.id, 70e3);
  const c = r.open(C, 80e3);
  assert.equal(c.evicted, b.id, 'B dùng lâu nhất (A vừa được chạm)');
  assert.deepEqual(r.list().map(x => x.id), [a.id, c.id]);
  r.reorder([c.id, 'xxx', a.id]); assert.deepEqual(r.list().map(x => x.id), [c.id, a.id]);
  assert.equal(r.close(c.id), true); assert.equal(r.close(c.id), false); assert.equal(r.get(c.id), null);
  assert.equal(MAX_TABS, 8);
});

test('TabRegistry: tab đang chạy tác vụ không bị đẩy ra; thư mục bị xoá khi tab đang mở → get null; đóng tab gọi onClose', () => {
  const closed = [], E = mkProj('Clip E', 'E'), F = mkProj('Clip F', 'F'), G = mkProj('Clip G', 'G');
  let busyId = null;
  const r = new TabRegistry({ file: path.join(TMP, 'reg4.json'), resolve: fakeResolve, max: 2, busy: id => id === busyId, onClose: id => closed.push(id) });
  const e = r.open(E, 1), f = r.open(F, 2); busyId = e.id;
  const g = r.open(G, 3);
  assert.equal(g.evicted, f.id, 'E cũ nhất nhưng đang chạy tác vụ → đẩy F');
  assert.deepEqual(closed, [f.id]);
  // chuyển clip tại chỗ: G thay E ở đúng vị trí, không đẩy tab nào
  const f2 = r.open(F, 4, { replace: g.id });
  assert.equal(f2.evicted, null); assert.deepEqual(r.list().map(x => x.id), [e.id, f.id]);
  fs.rmSync(F, { recursive: true });
  assert.equal(r.get(f.id), null, 'không "hồi sinh" dự án đã xoá');
});

test('TabRegistry: file danh sách bị sửa tay (mã không khớp đường dẫn, đường dẫn tương đối) bị bỏ; thư mục mất → get null', () => {
  const file = path.join(TMP, 'reg3.json'), D = mkProj('Clip D', 'D');
  fs.writeFileSync(file, JSON.stringify({ tabs: [{ id: tabId(A), dir: B }, { id: tabId('x'), dir: 'x' }, { id: tabId(D), dir: D }] }));
  const r = new TabRegistry({ file, resolve: fakeResolve });
  assert.deepEqual(r.list().map(x => x.name), ['Clip D']);
  fs.rmSync(D, { recursive: true });
  assert.equal(r.get(tabId(D)), null);
});

// ---------- (2) server thật ----------
let srv = null, PORT = 0, TOKEN = '';
const freePort = () => new Promise(ok => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
function api(p, body, tab) {
  return new Promise((ok, bad) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const h = { 'X-AVS-Token': TOKEN, ...(tab ? { 'X-AVS-Project': tab } : {}), ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) };
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method: data ? 'POST' : 'GET', headers: h }, res => {
      const c = []; res.on('data', d => c.push(d)); res.on('end', () => { const t = Buffer.concat(c).toString('utf8'); let json; try { json = JSON.parse(t); } catch {} ok({ status: res.statusCode, json, text: t, opened: res.headers['x-avs-opened'] }); });
    });
    r.on('error', bad); r.end(data);
  });
}
before(async () => {
  PORT = await freePort();
  const env = { ...process.env, AVS_HOME: HOME, USERPROFILE: USER, HOME: USER, AVS_NO_LAUNCHCTL: '1', AVS_DRY_OPEN: '1', AVS_NO_SCHEDULE_TIMER: '1' };
  srv = spawn(process.execPath, [path.join(SKILL, 'studio/server.mjs'), A, '--port', String(PORT)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  await new Promise((ok, bad) => {
    const t = setTimeout(() => bad(new Error('server không khởi động:\n' + out)), 20000);
    const on = d => { out += d; if (out.includes('AI Video Studio')) { clearTimeout(t); ok(); } };
    srv.stdout.on('data', on); srv.stderr.on('data', on);
    srv.on('exit', c => bad(new Error(`server thoát mã ${c}:\n${out}`)));
  });
  for (let i = 0; i < 50 && !fs.existsSync(tokenFile(PORT, HOME)); i++) await new Promise(r => setTimeout(r, 100));
  TOKEN = fs.readFileSync(tokenFile(PORT, HOME), 'utf8');
});
after(async () => {
  if (srv) await killTree(srv);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* file còn bị khoá */ }
});

test('server: hai tab đọc / lưu xen kẽ hai dự án, không ghi nhầm; file theo /p/<mã>/; tab đóng → 409', async () => {
  const p0 = await api('/api/project');
  assert.equal(p0.json.meta.name, 'Clip A');
  const idA = p0.json.meta.pid; assert.equal(idA, tabId(A)); assert.equal(p0.json.meta.base, `/p/${idA}/`);

  // tab A mở dự án B (như trang chủ / Cùng bộ): server báo mã mới qua X-AVS-Opened
  const op = await api('/api/open', { path: B }, idA);
  assert.equal(op.status, 200, op.text); const idB = op.opened; assert.equal(idB, tabId(B));

  // hai tab xen kẽ: mỗi tab thấy và lưu đúng dự án của nó
  assert.equal((await api('/api/project', undefined, idA)).json.meta.name, 'Clip A');
  assert.equal((await api('/api/project', undefined, idB)).json.meta.name, 'Clip B');
  const sA = await api('/api/save', { timeline: { ...tl(A), title: 'A2' }, captions: [], dir: A }, idA);
  const sB = await api('/api/save', { timeline: { ...tl(B), title: 'B2' }, captions: [], dir: B }, idB);
  assert.equal(sA.status, 200, sA.text); assert.equal(sB.status, 200, sB.text);
  assert.equal(tl(A).title, 'A2'); assert.equal(tl(B).title, 'B2');
  // tab A gửi nhầm timeline của B (dir khác dự án của tab) → 409 như M126, không ghi
  const bad = await api('/api/save', { timeline: { ...tl(B), title: 'nham' }, captions: [], dir: B }, idA);
  assert.equal(bad.status, 409); assert.equal(tl(A).title, 'A2');

  // file của từng tab
  assert.equal((await api(`/p/${idA}/media/a.png`)).text, 'png-Clip A');
  assert.equal((await api(`/p/${idB}/media/a.png`)).text, 'png-Clip B');
  const esc = await api(`/p/${idA}/..%2FClip%20B%2Fmedia%2Fa.png`); // thoát ra ngoài thư mục dự án của tab
  assert.notEqual(esc.text, 'png-Clip B'); assert.equal(esc.status, 403);

  const tabs = await api('/api/tabs', undefined, idB);
  assert.deepEqual(tabs.json.tabs.map(t => [t.name, t.current]), [['Clip A', false], ['Clip B', true]]);
  assert.ok(JSON.parse(fs.readFileSync(path.join(HOME, 'studio-tabs.json'), 'utf8')).tabs.length === 2, 'danh sách tab lưu trong AVS_HOME');

  // đóng tab B: request của tab đó bị từ chối, không rơi sang dự án khác
  assert.equal((await api('/api/tabs/close', { id: idB }, idA)).status, 200);
  const gone = await api('/api/project', undefined, idB);
  assert.equal(gone.status, 409); assert.equal(gone.json.tabClosed, true);
  assert.equal((await api('/api/save', { timeline: tl(A), captions: [], dir: A }, idB)).status, 409);
  assert.equal((await api(`/p/${idB}/media/a.png`)).status, 404);
  assert.equal((await api('/api/project', undefined, 'ffffffffffff')).status, 409, 'mã lạ');
  assert.equal((await api('/api/tabs', undefined, idB)).status, 200, '/api/tabs vẫn trả lời để trang đó tự mở lại');

  // đóng tab của dự án mặc định (dự án mở gần nhất là B, đã đóng ở trên): request không mã (CLI) không còn ghi vào nó
  assert.equal((await api('/api/project')).status, 404);
  // /api/job: X-AVS-Opened của job Video mới chỉ gửi một lần (mở lại tab cũ sau đó không bị kéo sang dự án mới)
  const src = fs.readFileSync(path.join(SKILL, 'studio/server.mjs'), 'utf8');
  assert.match(src, /!job\.openedSent && job\.tab === curPid\(\).*job\.openedSent = true/);
});
