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

// S18 M131: cùng một dự án mở ở hai cửa sổ — cửa sổ lưu sau mà chưa thấy bản mới của cửa sổ kia thì bị báo xung đột, không đè
test('server: cùng dự án ở hai cửa sổ — lưu với mốc cũ → 409 conflict, ghi đè có chủ ý (force) được, mốc mới trả về sau khi lưu', async () => {
  const op = await api('/api/open', { path: A }); assert.equal(op.status, 200, op.text);
  const id = op.opened || tabId(A);
  const w1 = (await api('/api/project', undefined, id)).json.meta.saved, w2 = w1; // hai cửa sổ tải cùng một bản
  await new Promise(r => setTimeout(r, 30));
  const s1 = await api('/api/save', { timeline: { ...tl(A), title: 'cua-so-1' }, captions: [], dir: A, base: w1 }, id);
  assert.equal(s1.status, 200, s1.text); assert.ok(s1.json.saved > w1, 'trả mốc giờ sửa mới của timeline.json');
  const s2 = await api('/api/save', { timeline: { ...tl(A), title: 'cua-so-2' }, captions: [], dir: A, base: w2 }, id);
  assert.equal(s2.status, 409); assert.equal(s2.json.conflict, true); assert.equal(tl(A).title, 'cua-so-1', 'không đè bản của cửa sổ 1');
  const s3 = await api('/api/save', { timeline: { ...tl(A), title: 'cua-so-1b' }, captions: [], dir: A, base: s1.json.saved }, id);
  assert.equal(s3.status, 200, 'cửa sổ 1 lưu tiếp bằng mốc vừa nhận');
  const s4 = await api('/api/save', { timeline: { ...tl(A), title: 'cua-so-2' }, captions: [], dir: A, base: w2, force: true }, id);
  assert.equal(s4.status, 200); assert.equal(tl(A).title, 'cua-so-2');
  assert.equal((await api('/api/save', { timeline: tl(A), captions: [], dir: A }, id)).status, 200, 'không gửi base (script cũ) thì như trước');
});

test('trình duyệt: saveNow trả đã lưu hay chưa, xếp hàng; chỗ gọi rồi chạy việc phía server không bỏ qua kết quả', () => {
  const js = fs.readFileSync(path.join(SKILL, 'studio/studio.js'), 'utf8');
  assert.match(js, /function saveNow\(force(, quiet)?\) \{ const p = saveQ\.then/, 'lần lưu sau chờ lần trước (mốc saved mới), không xung đột giả với chính cửa sổ này');
  assert.match(js, /META\.saved = r\.saved;[^\n]*return true; \}\n( {2}if \(quiet\)[^\n]*\n)? {2}if \(r\.conflict\) saveConflict\(\);/);
  assert.match(js, /\$\('#save'\)\.addEventListener\('click', \(\) => (saveNow\(\)\)|\{ autoOff = false; saveNow\(\); \}\))/, 'event không lọt vào tham số force');
  const bad = [];
  for (const f of ['studio/studio.js', 'studio/library.js', ...fs.readdirSync(path.join(SKILL, 'studio/features')).filter(x => x.endsWith('.js')).map(x => 'studio/features/' + x)])
    fs.readFileSync(path.join(SKILL, f), 'utf8').split('\n').forEach((l, i) => { if (/(^|[;{]\s*)await (S\.|Studio\.)?saveNow\??\.?\(\)(\.catch\([^)]*\))?;/.test(l) && !/dirty\)? *\{? *if|if \((S\.|Studio\.)?dirty\)/.test(l)) bad.push(`${f}:${i + 1}`); });
  assert.deepEqual(bad, [], 'gọi saveNow rồi bỏ qua kết quả');
});

// S18 M131: dự án chỉ sửa ở một tab; tab thứ hai mở cùng video nguồn thì tạo dự án mới (bản sao, cùng thư mục cha = cùng Kho)
test('server: /api/project/duplicate chép dự án của tab sang "<tên> (2)" (bỏ out/, lịch sử, dấu vết Tự lái) rồi mở ở tab gọi', async () => {
  const id = (await api('/api/open', { path: A })).opened || tabId(A);
  fs.mkdirSync(path.join(A, 'out'), { recursive: true }); fs.writeFileSync(path.join(A, 'out', 'v.mp4'), 'x');
  fs.writeFileSync(path.join(A, '.studio', 'autopilot.json'), '{}');
  const r = await api('/api/project/duplicate', {}, id);
  assert.equal(r.status, 200, r.text);
  const D = path.join(path.dirname(A), 'Clip A (2)');
  assert.equal(r.json.name, 'Clip A (2)'); assert.equal(r.json.id, tabId(D)); assert.equal(r.opened, tabId(D), 'tab gọi chuyển sang bản mới');
  assert.deepEqual(tl(D), tl(A)); assert.equal(fs.readFileSync(path.join(D, 'media', 'a.png'), 'utf8'), 'png-Clip A');
  for (const x of ['out', '.studio/autopilot.json']) assert.ok(!fs.existsSync(path.join(D, x)), x);
  assert.equal(fs.readdirSync(path.join(D, '.studio', 'history')).length, 0, 'không chép lịch sử');
  assert.ok(!fs.readdirSync(path.dirname(A)).some(x => x.includes('.tao-')), 'không còn thư mục tạm');
  // sửa bản mới không đụng bản gốc (file chép thật, không liên kết cứng)
  fs.writeFileSync(path.join(D, 'media', 'a.png'), 'doi'); assert.equal(fs.readFileSync(path.join(A, 'media', 'a.png'), 'utf8'), 'png-Clip A');
  const r2 = await api('/api/project/duplicate', {}, id); assert.equal(r2.json.name, 'Clip A (3)');
});

test('trình duyệt: dự án giữ khoá Web Locks suốt đời trang; tab thứ hai bị chặn, chỉ xem, có nút tạo dự án mới', () => {
  const js = fs.readFileSync(path.join(SKILL, 'studio/studio.js'), 'utf8');
  assert.match(js, /if \(!await holdProject\(META\.pid \|\| META\.dir\)\) return projectBusy\(\);/);
  assert.match(js, /navigator\.locks\.request\('avs-project:' \+ id, \{ ifAvailable: true \}/);
  assert.match(js, /if \(readOnly\) \{ projectBusy\(\); return false; \}/, 'trang bị chặn không lưu được');
  assert.match(js, /api\('\/api\/project\/duplicate'/);
});

test('nhân bản: hai lần bấm cùng lúc ra hai dự án khác tên, không chép chồng', async () => {
  const { duplicateProject } = await import('../../studio/routes/59_projcopy.mjs');
  const S = mkProj('Clip S', 'S');
  const [x, y] = await Promise.all([duplicateProject(S), duplicateProject(S)]);
  assert.deepEqual([path.basename(x), path.basename(y)].sort(), ['Clip S (2)', 'Clip S (3)']);
  for (const d of [x, y]) assert.deepEqual(tl(d), tl(S));
});

// S19 M138: thẻ <audio>/<img> không gửi được header → window.avsUrl thêm ?avs_p=<mã tab>; server nhận với GET, bỏ qua với POST
test('server: GET mang ?avs_p=<mã> đọc dự án của tab đó; POST không nhận avs_p', async () => {
  const idA = (await api('/api/open', { path: A })).opened || tabId(A);
  const idB = (await api('/api/open', { path: B }, idA)).opened || tabId(B);
  assert.equal((await api(`/api/project?avs_p=${idA}`)).json.meta.name, 'Clip A', 'không header, có avs_p của A');
  assert.equal((await api(`/api/project?avs_p=${idB}`)).json.meta.name, 'Clip B');
  assert.equal((await api(`/api/project?avs_p=${idB}`, undefined, idA)).json.meta.name, 'Clip A', 'header thắng tham số');
  assert.equal((await api('/api/project?avs_p=ffffffffffff')).status, 409, 'mã lạ như header lạ');
  const r = await api(`/api/save?avs_p=${idA}`, { timeline: tl(A), captions: [], dir: A }); // POST: avs_p bị bỏ qua → dự án mặc định (B)
  assert.equal(r.status, 409, 'dir của A gửi vào dự án mặc định B → bị từ chối, không ghi nhờ avs_p');
});
