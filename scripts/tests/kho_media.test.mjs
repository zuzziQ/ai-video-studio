// Bước 3 Dựng dùng tài nguyên Kho (S12 · M99): /api/kho/use, tên trùng, đường dẫn thoát Kho, junction, nhạc Kho,
// b-roll tự động ưu tiên Kho. run: node --test scripts/tests/kho_media.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TMP = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-khom-')));
const HOME = path.join(TMP, 'home'), KHO = path.join(TMP, 'Kho Nha Dep'), OUT = path.join(TMP, 'ngoai');
const PROJ = path.join(KHO, 'Du an', 'clip 1');
// thư mục cấu hình tạm: không đọc ~/.ai-video-studio thật (workspaceFor đọc brands.json/workspace.json)
process.env.AVS_HOME = HOME;
const K = await import('../kho_media.mjs');
const put = (rel, data = 'x') => { const f = path.join(KHO, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
fs.mkdirSync(HOME, { recursive: true }); fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(PROJ, { recursive: true });
fs.writeFileSync(path.join(KHO, '.kho.json'), JSON.stringify({ version: 1, brand: '', title: 'Nhà Đẹp' }));
put('Anh/logo.png', 'png-1'); put('BRoll/logo.png', 'png-2'); put('Anh/ca phe sang.jpg', 'jpg'); put('Nhac/hype_soi_dong.mp3', 'mp3');
put('Du an/clip 1/media/x.jpg', 'no'); put('Nguon/Tha vao day/ca phe tho.mp4', 'raw'); put('Thanh pham/2026-11/ca phe.mp4', 'out'); fs.writeFileSync(path.join(OUT, 'bi-mat.jpg'), 'secret');
const CAPS = [
  { t0: .5, t1: 4, words: [['Sáng', .5], ['nay', .8], ['tôi', 1.1], ['uống', 1.4], ['cà', 1.8], ['phê', 2.1], ['ở', 2.5], ['quán', 2.8], ['quen', 3.2]] },
  { t0: 4.2, t1: 8, words: [['Ly', 4.2], ['cà', 4.6], ['phê', 5], ['sáng', 5.4], ['thật', 5.9], ['thơm', 6.4], ['và', 6.9], ['đậm', 7.3]] },
  { t0: 8.2, t1: 11, words: [['Hẹn', 8.2], ['gặp', 8.7], ['lại', 9.2], ['các', 9.7], ['bạn', 10.2]] },
].map(c => ({ ...c, words: c.words.map(([w, s]) => ({ w, s, e: s + .3 })) }));
fs.writeFileSync(path.join(PROJ, 'timeline.json'), JSON.stringify({ width: 1080, height: 1920, duration: 12, pack: 'slate', scenes: [], captions: CAPS }));
const ws = K.khoOf(PROJ);
const media = (...p) => path.join(PROJ, 'media', ...p);

test('khoOf: dự án trong <Kho>/Du an/<tên> tìm ra Kho qua .kho.json', () => {
  assert.equal(ws.root, KHO); assert.equal(ws.found, 'kho');
});

test('useFromKho: liên kết vào media/kho_*, tên trùng → _2, dùng lại không tạo bản mới, ghi nguồn', async () => {
  const a = await K.useFromKho(PROJ, ws, 'Anh/logo.png');
  assert.equal(a.name, 'kho_logo.png'); assert.equal(a.path, 'media/kho_logo.png'); assert.equal(a.kind, 'image'); assert.equal(a.kho, 'Anh/logo.png');
  assert.ok(['link', 'copy'].includes(a.linked));
  if (a.linked === 'link') assert.equal(fs.statSync(media(a.name), { bigint: true }).ino, fs.statSync(path.join(KHO, 'Anh', 'logo.png'), { bigint: true }).ino);
  const b = await K.useFromKho(PROJ, ws, 'BRoll/logo.png');
  assert.equal(b.name, 'kho_logo_2.png'); assert.equal(fs.readFileSync(media(b.name), 'utf8'), 'png-2');
  const again = await K.useFromKho(PROJ, ws, 'Anh\\logo.png');
  assert.equal(again.name, 'kho_logo.png'); assert.equal(again.linked, 'reuse');
  const sp = await K.useFromKho(PROJ, ws, 'Anh/ca phe sang.jpg');
  assert.equal(sp.name, 'kho_ca_phe_sang.jpg'); // không khoảng trắng/ngoặc: url() CSS của engine
  const cr = JSON.parse(fs.readFileSync(media('credits.json'), 'utf8'));
  assert.deepEqual(cr.map(x => [x.file, x.kho, x.provider]), [['kho_logo.png', 'Anh/logo.png', 'Kho'], ['kho_logo_2.png', 'BRoll/logo.png', 'Kho'], ['kho_ca_phe_sang.jpg', 'Anh/ca phe sang.jpg', 'Kho']]);
  const list = K.khoItems(PROJ, ws);
  assert.equal(list.find(x => x.rel === 'Anh/logo.png').used, 'media/kho_logo.png');
  assert.equal(list.find(x => x.rel === 'Nhac/hype_soi_dong.mp3').used, null);
  assert.equal(list.find(x => x.rel === 'Nhac/hype_soi_dong.mp3').group, 'music');
  assert.ok(!list.some(x => x.rel.startsWith('Du an/') || x.rel.startsWith('Thanh pham/')));
  // thư mục con lồng nhau vẫn theo nhóm của thư mục cấp 1: video thô trong Nguon/Tha vao day không thành b-roll
  assert.equal(list.find(x => x.rel === 'Nguon/Tha vao day/ca phe tho.mp4').group, 'source');
  assert.deepEqual(K.searchKho(list, 'uống cà phê thô').map(x => x.rel).filter(r => r.startsWith('Nguon/')), []);
  // file đã có trong dự án bị xoá → dùng lại thì liên kết lần nữa; file Kho khác cùng tên không lấy lại tên đã ghi sổ
  fs.rmSync(media('kho_logo_2.png'));
  put('Anh/2025/logo.png', 'png-3');
  const c3 = await K.useFromKho(PROJ, ws, 'Anh/2025/logo.png');
  assert.equal(c3.name, 'kho_logo_3.png');
  const back = await K.useFromKho(PROJ, ws, 'BRoll/logo.png');
  assert.notEqual(back.linked, 'reuse'); assert.equal(fs.readFileSync(media(back.name), 'utf8'), 'png-2');
  assert.equal(K.usedName(PROJ, 'Anh/2025/logo.png'), 'kho_logo_3.png');
});

test('hai lần dùng cùng lúc (kể cả viết \\ và /) ra cùng một file', async () => {
  put('BRoll/song.png', 'p');
  const [a, b] = await Promise.all([K.useFromKho(PROJ, ws, 'BRoll/song.png'), K.useFromKho(PROJ, ws, 'BRoll\\song.png')]);
  assert.equal(a.name, 'kho_song.png'); assert.equal(b.name, 'kho_song.png');
  assert.ok(!fs.existsSync(media('kho_song_2.png')));
  // hai file Kho khác nhau cùng tên, chèn cùng lúc: hai tên khác nhau, không file nào bị ghi đè
  put('Anh/trung.png', 'A'); put('BRoll/trung.png', 'B');
  const [x, y] = await Promise.all([K.useFromKho(PROJ, ws, 'Anh/trung.png'), K.useFromKho(PROJ, ws, 'BRoll/trung.png')]);
  assert.notEqual(x.name, y.name);
  assert.equal(fs.readFileSync(media(x.name), 'utf8'), 'A'); assert.equal(fs.readFileSync(media(y.name), 'utf8'), 'B');
  assert.equal(fs.readFileSync(path.join(KHO, 'Anh', 'trung.png'), 'utf8'), 'A'); assert.equal(fs.readFileSync(path.join(KHO, 'BRoll', 'trung.png'), 'utf8'), 'B');
});

test('khác ổ (nhánh chép): ra bản chép riêng, không để lại tmp, nội dung đúng', async () => {
  put('Anh/chep.png', 'C');
  const it = await K.useFromKho(PROJ, ws, 'Anh/chep.png', { copy: true });
  assert.equal(it.linked, 'copy'); assert.equal(fs.readFileSync(media(it.name), 'utf8'), 'C');
  assert.notEqual(fs.statSync(media(it.name), { bigint: true }).ino, fs.statSync(path.join(KHO, 'Anh', 'chep.png'), { bigint: true }).ino);
  assert.ok(!fs.readdirSync(media()).some(f => f.endsWith('.tmp')));
  assert.equal((await K.useFromKho(PROJ, ws, 'Anh/chep.png', { copy: true })).linked, 'reuse');
});

test('credit(): ghi một dòng cho mỗi file kho_*, ghi file mới (không ghi đè inode cũ)', async () => {
  const { credit } = await import('../ai_broll.mjs');
  const d = path.join(TMP, 'cr'); fs.mkdirSync(d, { recursive: true });
  const f = path.join(d, 'credits.json'); fs.writeFileSync(f, '[]'); fs.linkSync(f, path.join(d, 'goc.json'));
  credit(d, { file: 'kho_a.png', kho: 'Anh/a.png' }); credit(d, { file: 'kho_a.png', kho: 'Anh/a.png' }); credit(d, { file: 'stock_b.jpg', provider: 'pexels' });
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')).map(x => x.file), ['kho_a.png', 'stock_b.jpg']);
  assert.equal(fs.readFileSync(path.join(d, 'goc.json'), 'utf8'), '[]'); // bản liên kết cứng của dự án gốc không đổi
});

test('resolveRel / useFromKho: đường dẫn thoát Kho, thư mục cấm, file lạ → 400; không thấy → 404', async () => {
  for (const rel of ['../ngoai/bi-mat.jpg', 'Anh/../../ngoai/bi-mat.jpg', path.join(OUT, 'bi-mat.jpg'), '/etc/passwd', 'C:\\Windows\\win.ini', 'Du an/clip 1/media/x.jpg', 'Du an./clip 1/media/x.jpg', 'Du an /clip 1/media/x.jpg', 'DUAN~1/clip 1/media/x.jpg', 'du an/clip 1/media/x.jpg', 'THANH PHAM/2026-11/ca phe.mp4', 'Anh/logo.png:x', '.kho.json', '', null, 42])
    await assert.rejects(K.useFromKho(PROJ, ws, rel), e => e.status === 400, String(rel));
  await assert.rejects(K.useFromKho(PROJ, ws, 'Anh/khong-co.jpg'), e => e.status === 404);
  // tmp chép dở: tiến trình còn sống → 409 (kể cả mtime cũ); tiến trình đã chết → dọn tmp, không khoá file mãi
  put('Anh/do.png', 'D');
  const map = path.join(PROJ, '.studio', 'kho_media.json'), m0 = JSON.parse(fs.readFileSync(map, 'utf8'));
  m0.items['Anh/do.png'] = 'kho_do.png'; fs.writeFileSync(map, JSON.stringify(m0));
  const liveTmp = media(`kho_do.png.${process.pid}.tmp`); fs.writeFileSync(liveTmp, 'half');
  const old = new Date(Date.now() - 3600000); fs.utimesSync(liveTmp, old, old);
  await assert.rejects(K.useFromKho(PROJ, ws, 'Anh/do.png'), e => e.status === 409);
  fs.rmSync(liveTmp);
  const tmp = media('kho_do.png.2147483646.tmp'); fs.writeFileSync(tmp, 'half');
  assert.equal((await K.useFromKho(PROJ, ws, 'Anh/do.png')).name, 'kho_do.png'); assert.ok(!fs.existsSync(tmp));
  assert.ok(!fs.readdirSync(media()).some(f => f.includes('bi-mat')));
});

test('junction/symlink trong Kho trỏ ra ngoài: không lấy được file qua liên kết', async t => {
  const j = path.join(KHO, 'BRoll', 'ngoai');
  try { fs.symlinkSync(OUT, j, process.platform === 'win32' ? 'junction' : 'dir'); } catch { return t.skip('không tạo được junction'); }
  await assert.rejects(K.useFromKho(PROJ, ws, 'BRoll/ngoai/bi-mat.jpg'), e => e.status === 400);
  assert.ok(!K.khoItems(PROJ, ws).some(x => x.rel.includes('bi-mat')));
  fs.rmSync(j, { recursive: false, force: true });
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
test('video từ Kho: chuỗi khung + audio.m4a như upload(), mục như mediaList()', { skip: !hasFfmpeg && 'không có ffmpeg' }, async () => {
  const v = path.join(KHO, 'BRoll', 'quay cafe.mp4');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', v]);
  assert.equal(r.status, 0, String(r.stderr));
  await assert.rejects(K.useFromKho(PROJ, ws, 'BRoll/quay cafe.mp4', { maxDur: .5 }), e => e.status === 400 && /quá 0.5 s/.test(e.message));
  assert.ok(!fs.existsSync(media('kho_quay_cafe.mp4'))); // b-roll tự động không tách video dài
  const it = await K.useFromKho(PROJ, ws, 'BRoll/quay cafe.mp4');
  assert.equal(it.kind, 'video'); assert.equal(it.name, 'kho_quay_cafe.mp4');
  assert.equal(it.seq.seq, 'media/kho_quay_cafe_frames/%05d.jpg'); assert.ok(it.seq.count >= 28, String(it.seq.count));
  assert.equal(it.thumb, 'media/kho_quay_cafe_frames/00001.jpg'); assert.equal(it.preview_audio, 'media/kho_quay_cafe_frames/audio.m4a');
  assert.ok(fs.existsSync(media('kho_quay_cafe_frames', 'audio.m4a')));
  // khung bị dọn (gửi máy render) → dùng lại thì tạo lại khung, không tạo kho_quay_cafe_2.mp4
  fs.rmSync(media('kho_quay_cafe_frames'), { recursive: true });
  const again = await K.useFromKho(PROJ, ws, 'BRoll/quay cafe.mp4');
  assert.equal(again.name, 'kho_quay_cafe.mp4'); assert.ok(again.seq.count >= 28);
  // hai tiến trình cùng dùng một video lần đầu: cùng một file, khung đủ, không file nào bị xoá
  const v2 = path.join(KHO, 'BRoll', 'hai ben.mp4'); fs.copyFileSync(v, v2);
  const code = `const K = await import(${JSON.stringify(pathToFileURL(path.join(SKILL, 'scripts/kho_media.mjs')).href)}); const ws = K.khoOf(${JSON.stringify(PROJ)}); const it = await K.useFromKho(${JSON.stringify(PROJ)}, ws, 'BRoll/hai ben.mp4'); console.log(it.name + ' ' + it.seq.count);`;
  const { spawn } = await import('node:child_process');
  const runOne = () => new Promise(ok => { const p = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, AVS_HOME: HOME } }); let o = ''; p.stdout.on('data', d => (o += d)); p.on('close', c => ok([c, o.trim()])); });
  const res = await Promise.all([runOne(), runOne()]);
  const ok = res.filter(([c]) => c === 0).map(([, o]) => o);
  assert.equal(ok.length, 2, JSON.stringify(res));
  for (const o of ok) assert.match(o, /^kho_hai_ben\.mp4 \d+$/);
  assert.ok(fs.existsSync(media('kho_hai_ben.mp4'))); assert.ok(!fs.existsSync(media('kho_hai_ben_2.mp4')));
  assert.ok(fs.readdirSync(media('kho_hai_ben_frames')).filter(f => f.endsWith('.jpg')).length >= 28);
});

test('route /api/kho/*: liệt kê kèm đã dùng, rel thoát Kho → 400, dùng → mục chèn được', async () => {
  const route = (await import(pathToFileURL(path.join(SKILL, 'studio/routes/61_kho_media.mjs')).href)).default;
  let bodyOf = null;
  const ctx = { SKILL, project: { dir: PROJ, tlFile: path.join(PROJ, 'timeline.json') }, json: (res, o, code = 200) => { res.code = code; res.o = o; }, body: async () => bodyOf, sendFile: (req, res, f) => { res.file = f; } };
  const h = route(ctx);
  const call = async (method, url, b) => { bodyOf = b; const res = {}, u = new URL(url, 'http://x'); const ok = await h({ method }, res, u.pathname, u); return { ok, ...res }; };
  const g = await call('GET', '/api/kho/media?group=image');
  assert.equal(g.code, 200); assert.equal(g.o.kho.title, 'Nhà Đẹp');
  assert.ok(g.o.items.every(x => x.group === 'image')); assert.equal(g.o.items.find(x => x.rel === 'Anh/logo.png').used, 'media/kho_logo.png');
  assert.equal((await call('GET', '/api/kho/media?group=lung-tung')).code, 400);
  assert.equal((await call('POST', '/api/kho/use', { rel: '../ngoai/bi-mat.jpg' })).code, 400);
  assert.equal((await call('POST', '/api/kho/use', {})).code, 400);
  assert.equal((await call('GET', '/api/kho/file?rel=' + encodeURIComponent('../ngoai/bi-mat.jpg'))).code, 400);
  assert.equal((await call('GET', '/api/kho/file?rel=Anh%2Flogo.png')).file, path.join(KHO, 'Anh', 'logo.png'));
  const u = await call('POST', '/api/kho/use', { rel: 'Anh/logo.png' });
  assert.equal(u.code, 200); assert.equal(u.o.path, 'media/kho_logo.png'); assert.equal(u.o.thumb, 'media/kho_logo.png');
  assert.equal(await h({ method: 'GET' }, {}, '/api/khac', new URL('http://x/api/khac')), false);
  assert.equal(await h({ method: 'GET' }, {}, '/api/kho/status', new URL('http://x/api/kho/status')), false); // của 12_workspace
});

test('nhạc nền: bài trong Nhac/ hợp mood → media/kho_*, không hợp → null; khoMusicBeds đổi đúng đoạn', async () => {
  assert.equal((await K.khoMusic(PROJ, null, 'sad')), null);
  assert.ok(!K.moodWords('hype').includes('dong')); // âm tiết lẻ không đủ để khớp mood
  const m = await K.khoMusic(PROJ, null, 'hype');
  assert.deepEqual(m, { file: 'media/kho_hype_soi_dong.mp3', kho: 'Nhac/hype_soi_dong.mp3', title: 'hype_soi_dong.mp3' });
  assert.equal(JSON.parse(fs.readFileSync(media('credits.json'), 'utf8')).find(x => x.file === 'kho_hype_soi_dong.mp3').provider, 'Kho · Nhac');
  const tlf = path.join(PROJ, 'timeline.json'), tl = JSON.parse(fs.readFileSync(tlf, 'utf8'));
  tl.audio = { music: [{ t0: 0, t1: 6, mood: 'hype', _auto: true }, { t0: 6, t1: 12, mood: 'sad', _auto: true }, { t0: 0, t1: 12, mood: 'hype' }] };
  fs.writeFileSync(tlf, JSON.stringify(tl));
  assert.equal(await K.khoMusicBeds(PROJ), 1);
  const mu = JSON.parse(fs.readFileSync(tlf, 'utf8')).audio.music;
  assert.equal(mu[0].file, 'media/kho_hype_soi_dong.mp3'); assert.equal(mu[1].file, undefined); assert.equal(mu[2].file, undefined);
  delete tl.audio; fs.writeFileSync(tlf, JSON.stringify(tl));
  // áp bản dựng AI: nhạc Kho đi vào timeline bằng "file" (mix_audio.py dùng "file" trước "mood")
  const { applyPlan } = await import('../ai_edit.mjs');
  const t2 = { duration: 12, scenes: [], audio: {} };
  applyPlan(t2, [], { pack: 'slate', scenes: [], captions: [], sfx: [], music: { t0: 0, t1: 12, mood: 'hype', gain: -20, _ai: true, ...m } });
  assert.equal(t2.audio.music[0].file, 'media/kho_hype_soi_dong.mp3');
  assert.match(fs.readFileSync(path.join(SKILL, 'scripts/mix_audio.py'), 'utf8'), /P\(m\["file"\]\) if "file" in m else/);
});

test('b-roll tự động: câu nhắc "cà phê" lấy ảnh Anh/ của Kho trước ảnh của dự án, qua media/kho_*', () => {
  fs.writeFileSync(media('zz_cua_toi.jpg'), 'mine');
  const r = spawnSync(process.execPath, [path.join(SKILL, 'scripts/auto_broll.mjs'), path.join(PROJ, 'timeline.json'), '--src', 'media', '--density', 'ratday', '--seed', '1'],
    { encoding: 'utf8', env: { ...process.env, AVS_HOME: HOME } });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const note = JSON.parse(r.stdout.trim().split('\n').filter(l => l.startsWith('{')).at(-1));
  assert.ok(note.sources.kho >= 1, JSON.stringify(note));
  const tl = JSON.parse(fs.readFileSync(path.join(PROJ, 'timeline.json'), 'utf8'));
  const kho = tl.scenes.filter(s => s._src === 'kho');
  assert.ok(kho.some(s => s.media === 'media/kho_ca_phe_sang.jpg'), JSON.stringify(kho));
  const first = tl.scenes.filter(s => s._src === 'kho' || s._src === 'media').sort((a, b) => a.t0 - b.t0)[0];
  assert.equal(first._src, 'kho');
  // không tham chiếu đường dẫn ngoài dự án
  assert.ok(!JSON.stringify(tl.scenes).includes(KHO.replace(/\\/g, '\\\\')));
});

test('b-roll tự động --src kho (không bật media): chỉ Kho, không lấy ảnh của dự án', () => {
  const r = spawnSync(process.execPath, [path.join(SKILL, 'scripts/auto_broll.mjs'), path.join(PROJ, 'timeline.json'), '--src', 'kho', '--density', 'ratday', '--seed', '2'],
    { encoding: 'utf8', env: { ...process.env, AVS_HOME: HOME } });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const tl = JSON.parse(fs.readFileSync(path.join(PROJ, 'timeline.json'), 'utf8'));
  const auto = tl.scenes.filter(s => s._auto);
  assert.ok(auto.some(s => s._src === 'kho')); assert.ok(!auto.some(s => s._src === 'media'));
});

test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
