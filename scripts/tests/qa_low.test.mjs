// Test M59: lỗi mức Thấp từ đợt test Studio trên localhost (qa-reports/2026-11-15/SUMMARY.md): mã trạng thái, kiểm input,
// thông báo lỗi không lộ lệnh/đường dẫn máy. Chạy: node --test scripts/tests/qa_low.test.mjs
// Server Studio thật trên cổng trống, AVS_HOME tạm, không runner hàng đợi, không bot Telegram, không render.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { shortErr, scrubPaths } from '../err_text.mjs';
import { tokenFile } from '../../studio/security.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-low-'));
const HOME = path.join(TMP, 'home'), PROJ = path.join(HOME, 'footage', 'du-an');
fs.mkdirSync(path.join(PROJ, 'out'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'timeline.json'), JSON.stringify({ width: 720, height: 1280, duration: 4, scenes: [], aroll: { frames: 'work/frames/%05d.jpg' } }));
fs.writeFileSync(path.join(PROJ, 'out', 'v.mp4'), 'x');
fs.writeFileSync(path.join(PROJ, 'notes.txt'), 'x');

test('shortErr: dòng cuối traceback, gợi ý cài lại khi thiếu thư viện, bỏ đường dẫn máy và stack Node', () => {
  const tb = 'Traceback (most recent call last):\n  File "C:\\Users\\an\\x\\mix_audio.py", line 26, in <module>\n    import numpy as np\nModuleNotFoundError: No module named \'numpy\'\n';
  assert.match(shortErr(tb), /Thiếu thư viện Python "numpy"/);
  const node = 'Error: ENOENT: no such file or directory, scandir \'C:\\Users\\an\\proj\\work\\frames\'\n    at Object.readdirSync (node:fs:1507:3)\n    at file:///D:/ai/x/render.mjs:40:9\nNode.js v24.0.0';
  const s = shortErr(node);
  assert.match(s, /ENOENT/); assert.doesNotMatch(s, /Users|render\.mjs:40|Node\.js/);
  assert.equal(scrubPaths('mở /Users/an/Movies/a.mov và D:\\ai\\b.mp4 lỗi'), 'mở … và … lỗi');
  assert.equal(shortErr(''), 'lỗi không rõ');
});

let srv, PORT, TOKEN;
const freePort = () => new Promise(ok => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
function call(p, { method = 'POST', body, raw } = {}) {
  return new Promise((ok, bad) => {
    const data = raw ?? (body === undefined ? undefined : JSON.stringify(body));
    const h = { 'X-AVS-Token': TOKEN, Host: `localhost:${PORT}` };
    if (data !== undefined) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: h }, res => {
      const c = []; res.on('data', d => c.push(d));
      res.on('end', () => { const text = Buffer.concat(c).toString(); let j = null; try { j = JSON.parse(text); } catch {} ok({ status: res.statusCode, j, text }); });
    });
    r.on('error', bad); r.end(data);
  });
}
before(async () => {
  PORT = await freePort();
  srv = spawn(process.execPath, [path.join(SKILL, 'studio/server.mjs'), PROJ, '--port', String(PORT)],
    { env: { ...process.env, AVS_HOME: HOME, AVS_NO_QUEUE: '1', AVS_NO_TELEGRAM: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  await new Promise((ok, bad) => {
    const t = setTimeout(() => bad(new Error('server did not start:\n' + out)), 20000);
    const on = d => { out += d; if (out.includes('AI Video Studio')) { clearTimeout(t); ok(); } };
    srv.stdout.on('data', on); srv.stderr.on('data', on);
    srv.on('exit', c => bad(new Error(`server exited ${c}:\n${out}`)));
  });
  for (let i = 0; i < 50 && !fs.existsSync(tokenFile(PORT, HOME)); i++) await new Promise(r => setTimeout(r, 100));
  TOKEN = fs.readFileSync(tokenFile(PORT, HOME), 'utf8');
});
after(() => { srv?.kill(); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

test('input sai trả 400 thay vì 500 hoặc chạy job: save, templates/save, export, new', async () => {
  assert.equal((await call('/api/save', { body: {} })).status, 400);
  assert.equal((await call('/api/save', { body: { timeline: {}, captions: 'x' } })).status, 400);
  assert.equal((await call('/api/templates/save', { body: {} })).status, 400);
  assert.equal((await call('/api/export', { body: { quality: 'bogus' } })).status, 400);
  assert.equal((await call('/api/export', { body: { from: 'x' } })).status, 400);
  assert.equal((await call('/api/export', { body: { from: 3, to: 1 } })).status, 400);
  assert.equal((await call('/api/new', { body: {} })).status, 400);
  assert.equal((await call('/api/job', { method: 'GET' })).j?.kind ?? null, null); // none of the above started a job
});

test('/api/still thiếu khung hình: 400 và không lộ đường dẫn máy hay stack', async () => {
  const r = await call('/api/still', { body: { t: 1 } });
  assert.equal(r.status, 400);
  assert.match(r.j.error, /Thiếu file nguồn: work\/frames/);
  assert.doesNotMatch(r.text, new RegExp(os.homedir().replace(/[\\^$.*+?()[\]{}|]/g, '\\$&').slice(0, 12)));
  assert.doesNotMatch(r.text, /\bat \w+ \(/);
});

test('lịch đăng: chỉ nhận file video; copy id sai trả 404', async () => {
  assert.equal((await call('/api/schedule/add', { body: { file: path.join(PROJ, 'notes.txt'), platforms: ['tiktok'] } })).status, 400);
  assert.equal((await call('/api/schedule/add', { body: { file: 'C:/Windows/win.ini', platforms: ['tiktok'] } })).status, 400);
  assert.equal((await call('/api/schedule/copy', { body: { id: 'khong-co' } })).status, 404);
});

test('transcribe mô hình lạ, fillers từ thiếu s/e, agent yêu cầu lạ, hồ sơ lạ', async () => {
  const t = await call('/api/transcribe', { body: { model: 'tiny-lạ' } });
  assert.equal(t.status, 400); assert.match(t.j.error, /Mô hình lạ/);
  assert.equal((await call('/api/ai/fillers', { body: { words: [{ w: 'à' }] } })).status, 400);
  assert.equal((await call('/api/ai/fillers', { body: { words: 'x' } })).status, 400);
  assert.equal((await call('/api/agent/khong-co', { body: {} })).status, 404);
  for (const action of ['duplicate', 'default', 'delete', 'reset'])
    assert.equal((await call('/api/autopilot/profile', { body: { action, id: 'khong-co' } })).status, 404, action);
});

test('hàng loạt: status/targets không có trả 404, bảng tính hỏng báo dễ hiểu, danh sách mới nhất trước', async () => {
  assert.equal((await call('/api/batch/status?dir=khong-co', { method: 'GET' })).status, 404);
  assert.equal((await call('/api/batch/targets', { body: { source: 'file:khong-co.template.json' } })).status, 404);
  const sh = await call('/api/batch/sheet?name=bang.xlsx', { raw: 'not a spreadsheet' });
  assert.equal(sh.status, 400); assert.doesNotMatch(sh.j.error, /buffer bounds|offset/i);
  const root = path.join(PROJ, 'batch');
  for (const [name, age] of [['a-moi', 0], ['z-cu', 3600]]) {
    fs.mkdirSync(path.join(root, name), { recursive: true });
    const f = path.join(root, name, 'job.json'); fs.writeFileSync(f, '{}');
    const t = new Date(Date.now() - age * 1000); fs.utimesSync(f, t, t);
  }
  const list = (await call('/api/batch/list', { method: 'GET' })).j;
  assert.deepEqual(list.map(x => x.name), ['a-moi', 'z-cu']);
});

test('thư viện b-roll: gắn thẻ id lạ trả 404', async () => {
  assert.equal((await call('/api/brolllib/tags', { body: { id: 'khong-co', tags: ['a'] } })).status, 404);
});
