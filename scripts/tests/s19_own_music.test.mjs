// S19 M138: nhạc riêng. (1) scripts/kho_media.mjs khoMusicPick: 'kho' = một bài trong Nhac/ của Kho (cố định theo dự án),
// 'kho:<rel>' = đúng bài đó (cả ngoài Nhac/), mất thì như 'kho', Kho không có nhạc → null. (2) Phong cách dựng lưu `music` an toàn
// (kho:../ → kho). (3) Tự lái, AI dựng, panel Âm thanh, trang Phong cách nối đúng. AVS_HOME / Kho trong thư mục tạm.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TMP = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-mus-')));
const HOME = path.join(TMP, 'home'), USER = path.join(TMP, 'user'), KHO = path.join(TMP, 'Kho Thu');
Object.assign(process.env, { AVS_HOME: HOME, USERPROFILE: USER, HOME: USER });
fs.mkdirSync(HOME, { recursive: true }); fs.mkdirSync(USER, { recursive: true });
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const K = await import('../kho_media.mjs');
const P = await import('../profile.mjs');
const put = (rel, data = 'x') => { const f = path.join(KHO, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
fs.mkdirSync(KHO, { recursive: true }); fs.writeFileSync(path.join(KHO, '.kho.json'), JSON.stringify({ version: 1, brand: '', title: 'Thử' }));
put('Nhac/b bai hai.mp3', 'b'); put('Nhac/a bai mot.mp3', 'a'); put('Nguon/loi doc.m4a', 'v');
const proj = name => { const d = path.join(KHO, 'Du an', name); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'timeline.json'), JSON.stringify({ duration: 10, scenes: [] })); return d; };
const read = f => fs.readFileSync(path.join(SKILL, f), 'utf8');

test('isKhoMusic', () => {
  assert.deepEqual(['kho', 'kho:Nhac/a.mp3', 'kho:', 'tech', 'auto', null].map(K.isKhoMusic), [true, true, false, false, false, false]);
});

test('khoMusicPick: "kho" lấy một bài trong Nhac/, cố định theo dự án; bài đích danh thắng; bài mất → như "kho"', async () => {
  const A = proj('clip 1');
  const r1 = await K.khoMusicPick(A, null, 'kho'), r2 = await K.khoMusicPick(A, null, 'kho');
  assert.ok(['Nhac/a bai mot.mp3', 'Nhac/b bai hai.mp3'].includes(r1.kho)); assert.equal(r2.kho, r1.kho, 'chạy lại không đổi bài');
  assert.match(r1.file, /^media\/kho_/); assert.ok(fs.existsSync(path.join(A, r1.file)), 'đã đưa vào media của dự án');
  assert.equal((await K.khoMusicPick(A, null, 'kho:Nhac/b bai hai.mp3')).kho, 'Nhac/b bai hai.mp3');
  assert.equal((await K.khoMusicPick(A, null, 'kho:Nguon/loi doc.m4a')).kho, 'Nguon/loi doc.m4a', 'bài đích danh ngoài Nhac/ vẫn dùng được');
  assert.match((await K.khoMusicPick(A, null, 'kho:Nhac/da xoa.mp3')).kho, /^Nhac\//, 'bài mất → một bài trong Nhac/');
  fs.writeFileSync(path.join(TMP, 'ngoai.mp3'), 'n');
  assert.match((await K.khoMusicPick(A, null, 'kho:../../ngoai.mp3')).kho, /^Nhac\//, 'đường dẫn thoát Kho không được dùng');
  assert.equal(await K.khoMusicPick(A, null, 'tech'), null);
});

test('khoMusicPick: Kho không có nhạc → null (Tự lái quay về nhạc tự chọn)', async () => {
  const E = path.join(TMP, 'Kho Rong'); fs.mkdirSync(path.join(E, 'Du an', 'x'), { recursive: true });
  fs.writeFileSync(path.join(E, '.kho.json'), JSON.stringify({ version: 1, brand: '', title: 'Rỗng' }));
  fs.writeFileSync(path.join(E, 'Du an', 'x', 'timeline.json'), '{}');
  assert.equal(await K.khoMusicPick(path.join(E, 'Du an', 'x'), null, 'kho'), null);
});

test('Phong cách dựng: music "kho:<rel>" lưu được; đường dẫn thoát / tuyệt đối / ẩn → "kho"', () => {
  for (const [v, want] of [['kho:Nhac/a bai mot.mp3', 'kho:Nhac/a bai mot.mp3'], ['kho:../x.mp3', 'kho'], ['kho:C:/x.mp3', 'kho'], ['kho:/etc/x.mp3', 'kho'], ['kho:.an/x.mp3', 'kho'], ['kho:', 'kho'], ['tech', 'tech'], ['kho', 'kho']]) {
    P.upsertProfile({ id: 'chung', music: v });
    assert.equal(P.getProfile('chung').music, want, v);
  }
});

test('nối vào Tự lái, AI dựng, panel Âm thanh, trang Phong cách, mã tab cho thẻ media', () => {
  const ap = read('scripts/autopilot.mjs');
  assert.match(ap, /if \(isKhoMusic\(prof\.music\)\) \{ own = await khoMusicPick\(dir, loadTL\(dir\)\.tl, prof\.music\)/);
  assert.match(ap, /const musicAuto = \(prof\.music === 'auto' \|\| \(isKhoMusic\(prof\.music\) && !own\)\) && !aiBed;/, 'Kho chưa có nhạc → nhạc tự chọn');
  assert.match(ap, /else if \(own\) \{ tl\.audio\.music = \[\.\.\.\(tl\.audio\.music \|\| \[\]\)\.filter\(m => !m\._ai && !m\._auto\), \{ t0: 0, t1: tl\.duration, file: own\.file/);
  assert.match(read('scripts/ai_edit.mjs'), /const k = \(o\.music_pick && await K\.khoMusicPick\(dir, tl, o\.music_pick\)\) \|\| await K\.khoMusic\(dir, tl, plan\.music\.mood\)/);
  assert.match(read('studio/routes/20_ai.mjs'), /m\.startsWith\('kho:'\)\) && o\.learned\?\.music !== 'off'\) o\.music_pick = m;/);
  const lib = read('studio/library.js');
  assert.match(lib, /\$\{myMusicBlock\(\)\}/); assert.match(lib, /api\('\/api\/media\/kho\?group=music'\)/);
  assert.match(lib, /fetch\('\/api\/media\/kho\/upload\?' \+ new URLSearchParams\(\{ name: f\.name \}\)/, 'tải vào Kho của dự án, không theo id thương hiệu');
  assert.match(lib, /if \(\(b = q\('\[data-mymus\]'\)\)\) return useMyMusic\(b\.dataset\.rel, b\.dataset\.mymus\);/);
  assert.match(lib, /kind === 'kho' \? avsUrl\('\/api\/media\/kho\/file\?rel=' \+ encodeURIComponent\(n\)\)/);
  const br = read('studio/features/51_brands.js');
  assert.match(br, /\['kho', songs\.length \?/); assert.match(br, /\.\.\.songs\.map\(it => \['kho:' \+ it\.rel/);
  assert.match(read('studio/auth.js'), /if \(PID && x\.pathname\.startsWith\('\/api\/'\)\) x\.searchParams\.set\('avs_p', PID\);/);
  assert.match(read('studio/server.mjs'), /if \(!want && req\.method === 'GET'\) \{ const q = \/\[\?&\]avs_p=\(\[a-f0-9\]\{12\}\)\(\?:&\|\$\)\/\.exec/);
});

test('POST /api/media/kho/upload: ghi vào Nhac/ của Kho chứa dự án (kể cả Kho tự chọn), chỉ file nhạc, tên không thoát thư mục', async () => {
  const { Readable } = await import('node:stream');
  const { default: route } = await import('../../studio/routes/61_kho_media.mjs');
  const A = proj('clip up'), out = [];
  const R = route({ SKILL, project: { dir: A, tlFile: path.join(A, 'timeline.json') }, json: (res, o, c) => out.push({ o, c: c || 200 }) });
  const send = async (name, data = 'mp3-data') => { const req = Object.assign(Readable.from([Buffer.from(data)]), { method: 'POST' }); await R(req, {}, '/api/media/kho/upload', new URL('http://x/api/media/kho/upload?' + new URLSearchParams({ name }))); return out.at(-1); };
  let r = await send('Bài của tôi.mp3');
  assert.equal(r.c, 200, JSON.stringify(r.o)); assert.equal(r.o.rel, 'Nhac/' + r.o.name);
  assert.equal(fs.readFileSync(path.join(KHO, 'Nhac', r.o.name), 'utf8'), 'mp3-data', 'đúng Kho của dự án');
  assert.notEqual((await send('Bài của tôi.mp3')).o.name, r.o.name, 'trùng tên → tên kế tiếp, không ghi đè');
  assert.equal((await send('video.mp4')).c, 400, 'chỉ nhận file nhạc');
  r = await send('../../thoat.mp3'); assert.equal(r.c, 200); assert.ok(!fs.existsSync(path.join(TMP, 'thoat.mp3')) && fs.existsSync(path.join(KHO, 'Nhac', r.o.name)), 'chỉ lấy phần tên');
});

test('tải nhạc qua server: route nằm trong UPLOAD_ROUTES (không dính trần JSON 32 MB); bài đích danh tìm theo tên file khi khác Kho', async () => {
  const { UPLOAD_ROUTES, bodyStatus } = await import('../../studio/security.mjs');
  assert.ok(UPLOAD_ROUTES.test('/api/media/kho/upload'));
  assert.equal(bodyStatus({ headers: { 'content-length': String(200 * 1024 ** 2) } }, '/api/media/kho/upload'), 0, 'WAV 200 MB qua được cổng chung');
  const A = proj('clip ten');
  assert.equal((await K.khoMusicPick(A, null, 'kho:Nhac nha/B BAI HAI.mp3')).kho, 'Nhac/b bai hai.mp3', 'đường dẫn của Kho khác, cùng tên file');
});
