// M38 — cảnh báo gói style không rõ nguồn (studio/routes/70_stylelab.mjs: /api/stylelab/packs, /api/stylelab/trust).
// Route được gọi thẳng với ctx giả: SKILL là một repo git tạm, AVS_HOME là thư mục tạm. Chạy: node --test scripts/tests/*.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-packs-m38-'));
const SKILL = path.join(TMP, 'skill'), HOME = path.join(TMP, 'home'), UP = path.join(SKILL, 'engine/packs/user');
const HEADER = '// Gói style của người dùng (Style Lab, scripts/style_lab.mjs) — file tự sinh, đừng sửa tay: sửa engine/packs/user/<id>.js rồi chạy "node scripts/style_lab.mjs sync".\n';
const allOf = files => HEADER + files.map(f => `// ---- ${f} ----\ntry {\n${fs.readFileSync(path.join(UP, f), 'utf8')}\n} catch (e) { console.error('user pack ${f}', e); }\n`).join('\n');
const writeAll = () => fs.writeFileSync(path.join(UP, '_all.js'), allOf(fs.readdirSync(UP).filter(f => f.endsWith('.js') && f !== '_all.js').sort()));
const git = (...a) => execFileSync('git', ['-C', SKILL, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.autocrlf=false', ...a], { stdio: 'pipe' });
let handle;

// ctx giả: chỉ những gì 70_stylelab.mjs dùng cho hai route này
async function call(p, method = 'GET', body = {}) {
  let out = null, code = 200;
  const ctx = { json: (res, d, c = 200) => { out = d; code = c; } };
  const ok = await handle(ctx)({ method }, {}, p, new URL('http://x' + p), body);
  return { ok, out, code };
}

before(async () => {
  process.env.AVS_HOME = HOME;
  fs.mkdirSync(UP, { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(path.join(UP, 'u_repo.js'), '// gói đi kèm repo\n');
  writeAll();
  git('init', '-q'); git('add', '.'); git('commit', '-q', '-m', 'init');
  const mod = (await import(pathToFileURL(path.join(REPO, 'studio/routes/70_stylelab.mjs')).href)).default;
  // mỗi lần gọi dựng route với ctx mới (json ghi vào biến của lần gọi đó)
  handle = c => mod({ SKILL, ...c, body: async () => c.__body || {} });
});
after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

async function list() { const r = await call('/api/stylelab/packs'); assert.equal(r.ok, true); return r.out; }
async function trust(id) {
  let out = null, code = 200;
  const ctx = { json: (res, d, c = 200) => { out = d; code = c; }, __body: { id } };
  await handle(ctx)({ method: 'POST' }, {}, '/api/stylelab/trust', new URL('http://x/api/stylelab/trust'));
  return { out, code };
}
const byId = (l, id) => l.find(x => x.id === id);

test('gói đi kèm repo (đã theo dõi, chưa sửa) được tin, không có mục _all', async () => {
  const l = await list();
  assert.deepEqual(l.map(x => [x.id, x.origin, x.trusted]), [['u_repo', 'repo', true]]);
});

test('gói chép từ nơi khác (kể cả tên không ASCII) bị cảnh báo; tin rồi thì hết; sửa nội dung thì cảnh báo lại', async () => {
  for (const f of ['u_la.js', 'u_phở.js']) fs.writeFileSync(path.join(UP, f), '// gói lạ\n');
  writeAll();
  let l = await list();
  for (const id of ['u_la', 'u_phở']) assert.deepEqual([byId(l, id).origin, byId(l, id).trusted], ['other', false], id);
  assert.equal(byId(l, '_all'), undefined, '_all.js khớp bản dựng lại thì không liệt kê');
  assert.deepEqual((await trust('u_phở')).out, { ok: true });
  l = await list();
  assert.equal(byId(l, 'u_phở').trusted, true);
  fs.appendFileSync(path.join(UP, 'u_phở.js'), 'fetch("/api/x")\n'); writeAll();
  assert.equal(byId(await list(), 'u_phở').trusted, false);
  for (const f of ['u_la.js', 'u_phở.js']) fs.rmSync(path.join(UP, f)); writeAll();
});

test('gói của repo bị sửa thì mất tin cậy', async () => {
  fs.appendFileSync(path.join(UP, 'u_repo.js'), '// sửa\n'); writeAll();
  assert.deepEqual(byId(await list(), 'u_repo'), { id: 'u_repo', file: 'engine/packs/user/u_repo.js', name: 'u_repo', origin: 'other', trusted: false });
  git('checkout', '--', '.');
});

test('_all.js bị sửa tay (khác bản dựng từ các gói lẻ) thì bị liệt kê và cảnh báo', async () => {
  fs.appendFileSync(path.join(UP, '_all.js'), 'alert(1)\n');
  let l = await list();
  assert.deepEqual([byId(l, '_all')?.origin, byId(l, '_all')?.trusted], ['other', false]);
  assert.deepEqual((await trust('_all')).out, { ok: true });
  assert.equal(byId(await list(), '_all').trusted, true);
  git('checkout', '--', '.');
  assert.equal(byId(await list(), '_all'), undefined);
});

test('gói Style Lab tạo trên máy này: tin lần đầu và ghim sha; template đi kèm gói không đủ để được tin', async () => {
  fs.writeFileSync(path.join(UP, 'u_moi.js'), '// Style Lab\n');
  fs.mkdirSync(path.join(SKILL, 'templates/user'), { recursive: true });
  // template giả mạo trỏ work vào một thư mục có thật: không được tin
  fs.mkdirSync(path.join(HOME, 'stylelab/x'), { recursive: true });
  fs.writeFileSync(path.join(SKILL, 'templates/user/u_moi.json'), JSON.stringify({ name: 'Mới', style_lab: { work: path.join(HOME, 'stylelab/x') } }));
  writeAll();
  assert.deepEqual([byId(await list(), 'u_moi').origin, byId(await list(), 'u_moi').trusted], ['other', false]);
  // result.json của một lần chạy Style Lab trên máy này nêu id
  fs.writeFileSync(path.join(HOME, 'stylelab/x/result.json'), JSON.stringify({ ok: true, id: 'u_moi' }));
  let m = byId(await list(), 'u_moi');
  assert.deepEqual([m.origin, m.trusted, m.name], ['stylelab', true, 'Mới']);
  assert.ok(JSON.parse(fs.readFileSync(path.join(HOME, 'packs-trust.json'), 'utf8')).u_moi, 'sha được ghim');
  fs.appendFileSync(path.join(UP, 'u_moi.js'), 'x()\n'); writeAll();
  assert.equal(byId(await list(), 'u_moi').trusted, false, 'sửa sau khi ghim thì cảnh báo');
});

test('/api/stylelab/trust: id không phải gói có thật (đường dẫn, rỗng) → 400', async () => {
  for (const id of ['../../x', '..', '', 'u_khong_co', 'C:\\x']) assert.equal((await trust(id)).code, 400, JSON.stringify(id));
});
