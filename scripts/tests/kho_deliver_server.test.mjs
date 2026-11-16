// Test S12 M100 cấp route trên server Studio thật (studio/server.mjs): /api/srt giao kèm vào Thanh pham/ của Kho, ghi lại
// cùng tên không đổi bản đã giao (liên kết cứng: xoá rồi ghi file mới), deliver vắng/false thì không giao; /api/thanhpham.
// Không render (srt không cần render.mjs); AVS_HOME và Kho nằm trong thư mục tạm. Chạy: node --test scripts/tests/kho_deliver_server.test.mjs
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-kho-srv-'));
const HOME = path.join(TMP, 'home'), KHO = path.join(TMP, 'Kho Thu'), PROJ = path.join(KHO, 'Du an', 'Clip Thu');
const caps = w => [{ t0: 0, t1: 1, words: [{ w }] }];
fs.mkdirSync(HOME, { recursive: true }); fs.mkdirSync(PROJ, { recursive: true });
fs.writeFileSync(path.join(KHO, '.kho.json'), JSON.stringify({ version: 1, brand: '', title: 'Chung' }));
const writeTl = w => fs.writeFileSync(path.join(PROJ, 'timeline.json'), JSON.stringify({ width: 720, height: 1280, duration: 2, scenes: [], captions: caps(w) }));
writeTl('mot');

let srv = null, PORT = 0, TOKEN = '';
const freePort = () => new Promise(ok => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
function api(p, body) {
  return new Promise((ok, bad) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const h = { 'X-AVS-Token': TOKEN, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) };
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method: data ? 'POST' : 'GET', headers: h }, res => {
      const c = []; res.on('data', d => c.push(d)); res.on('end', () => { const t = Buffer.concat(c).toString('utf8'); try { ok({ status: res.statusCode, json: JSON.parse(t) }); } catch { ok({ status: res.statusCode, text: t }); } });
    });
    r.on('error', bad); r.end(data);
  });
}
before(async () => {
  PORT = await freePort();
  const env = { ...process.env, AVS_HOME: HOME, AVS_NO_LAUNCHCTL: '1', AVS_DRY_OPEN: '1', AVS_NO_SCHEDULE_TIMER: '1' };
  srv = spawn(process.execPath, [path.join(SKILL, 'studio/server.mjs'), PROJ, '--port', String(PORT)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
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
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* file còn bị khoá: bỏ qua */ }
});

test('/api/srt: deliver → Thanh pham/<tháng>/<dự án>.srt; ghi lại không đổi bản đã giao; không deliver thì không giao', async () => {
  const r1 = await api('/api/srt', { deliver: true });
  assert.equal(r1.status, 200, JSON.stringify(r1));
  assert.equal(r1.json.out, 'out/Clip Thu.srt');
  assert.equal(r1.json.delivered.length, 1);
  const d1 = r1.json.delivered[0];
  assert.equal(path.dirname(path.dirname(d1)), path.join(KHO, 'Thanh pham'));
  assert.equal(path.basename(d1), 'Clip Thu.srt');
  assert.match(fs.readFileSync(d1, 'utf8'), /mot/);

  writeTl('hai');
  const r2 = await api('/api/srt', {});
  assert.equal(r2.json.delivered, undefined, 'không bấm giao thì không giao');
  assert.match(fs.readFileSync(path.join(PROJ, 'out', 'Clip Thu.srt'), 'utf8'), /hai/);
  assert.match(fs.readFileSync(d1, 'utf8'), /mot/, 'bản đã giao giữ nội dung cũ (không ghi tại chỗ qua liên kết cứng)');

  const r3 = await api('/api/srt', { deliver: true });
  assert.equal(path.basename(r3.json.delivered[0]), 'Clip Thu (2).srt');
  assert.match(fs.readFileSync(r3.json.delivered[0], 'utf8'), /hai/);

  const th = await api('/api/thanhpham');
  assert.equal(th.json.root, path.join(KHO, 'Thanh pham'));
  assert.equal(th.json.found, 'kho');
  const bad = await api('/api/thanhpham/open', { path: path.join(PROJ, 'out', 'Clip Thu.srt') });
  assert.equal(bad.status, 404);
});
