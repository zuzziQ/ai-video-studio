// S27 M198: nguồn cho bản dựng (video / ảnh người dùng thả ở ô Kịch bản): danh sách trong .studio/script_sources.json, tên file của
// Excel / dấu `| tệp …` chỉ phân giải trong nguồn / Kho (chặn tuyệt đối, UNC, `..`), AI dựng ưu tiên nguồn bạn đưa, Claude gán đoạn
// cho file chưa gắn (khung ảnh nhỏ), video dài cắt đoạn con, ghi chú "Đã dùng: <tên file>", báo nguồn chưa dùng.
// run: node --test scripts/tests/s27_m198.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TMP = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-s27-m198-')));
process.env.AVS_HOME = path.join(TMP, 'home');
const KHO = path.join(TMP, 'Kho Nhà Đẹp'), PROJ = path.join(KHO, 'Du an', 'clip một');
const { rmSync } = await import('../fs_rm.mjs');
after(() => rmSync(TMP, { recursive: true, force: true }));
const SS = await import('../script_sources.mjs');
const K = await import('../kho_media.mjs');
const B = await import('../script_build.mjs');
const T = await import('../script_table.mjs');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const put = (rel, data = 'x') => { const f = path.join(KHO, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
fs.mkdirSync(process.env.AVS_HOME, { recursive: true }); fs.mkdirSync(PROJ, { recursive: true });
fs.writeFileSync(path.join(KHO, '.kho.json'), JSON.stringify({ version: 1, brand: '', title: 'Nhà Đẹp' }));
put('Nguon/san pham.jpg', 'jpg'); put('Nguon/Quán cà phê.mp4', 'mp4'); put('BRoll/san pham.jpg', 'other'); put('Nhac/nen.mp3', 'mp3');
fs.writeFileSync(path.join(TMP, 'bi-mat.jpg'), 'secret');
fs.writeFileSync(path.join(PROJ, 'timeline.json'), JSON.stringify({ width: 1080, height: 1920, duration: 12, scenes: [] }));
const ws = K.khoOf(PROJ);

test('unsafeName: chỉ nhận tên file / đường dẫn tương đối (chặn tuyệt đối, UNC, .., ADS, thư mục ẩn)', () => {
  for (const bad of ['../x.mp4', 'Nguon/../../x.mp4', '/etc/a.jpg', 'C:\\a.jpg', 'c:a.jpg', '\\\\srv\\share\\a.mp4', '//srv/share/a.mp4', 'a.mp4:zone', '.git/a.jpg', '', 'x\0.jpg'])
    assert.ok(SS.unsafeName(bad), bad);
  for (const ok of ['a.mp4', 'Nguon/san pham.jpg', 'Nguon\\Quán cà phê.mp4']) assert.equal(SS.unsafeName(ok), null, ok);
});

test('findSource: nguồn bạn đưa thắng Kho, khớp tên / tên không đuôi / bỏ dấu; tên không an toàn → null', () => {
  const sources = [{ rel: 'Nguon/san pham.jpg', name: 'san pham.jpg', kind: 'image' }];
  const items = K.khoItems(PROJ, ws).filter(it => ['video', 'image'].includes(it.kind));
  assert.deepEqual(SS.findSource('san pham.jpg', { sources, items }), { rel: 'Nguon/san pham.jpg', name: 'san pham.jpg', kind: 'image', mine: true });
  assert.equal(SS.findSource('quan ca phe', { sources, items }).rel, 'Nguon/Quán cà phê.mp4');
  assert.equal(SS.findSource('BRoll/san pham.jpg', { sources, items }).rel, 'BRoll/san pham.jpg');
  assert.equal(SS.findSource('../bi-mat.jpg', { sources, items }), null);
  assert.equal(SS.findSource('\\\\localhost\\c$\\bi-mat.jpg', { sources, items }), null);
  assert.equal(SS.findSource('khong co.mp4', { sources, items }), null);
  assert.deepEqual(SS.missingFiles('[B-ROLL: a | tệp san pham.jpg] [B-ROLL: b | tệp khong co.mp4] [B-ROLL: c | tep ../bi-mat.jpg]', { sources, items }), ['khong co.mp4', '../bi-mat.jpg']);
});

test('addSources / removeSource: kiểm bằng resolveRel (realpath), bỏ trùng, bỏ âm thanh và file thoát Kho', () => {
  const r = SS.addSources(PROJ, ['Nguon/san pham.jpg', 'Nguon\\Quán cà phê.mp4', 'Nguon/san pham.jpg', 'Nhac/nen.mp3', '../../bi-mat.jpg', 'Nguon/mat.jpg'], rel => K.resolveRel(ws, rel));
  assert.deepEqual(r.added, ['Nguon/san pham.jpg', 'Nguon/Quán cà phê.mp4']);
  assert.deepEqual(r.skipped.map(x => x.rel), ['Nhac/nen.mp3', '../../bi-mat.jpg', 'Nguon/mat.jpg']);
  const saved = SS.readSources(PROJ);
  assert.deepEqual(saved.map(x => [x.rel, x.kind]), [['Nguon/san pham.jpg', 'image'], ['Nguon/Quán cà phê.mp4', 'video']]);
  assert.equal(SS.removeSource(PROJ, 'Nguon/san pham.jpg').length, 1);
  SS.addSources(PROJ, ['Nguon/san pham.jpg'], rel => K.resolveRel(ws, rel));
  assert.equal(SS.readSources(PROJ).length, 2);
});

test('Excel: cột source ghi tên file / đường dẫn trong Kho → dấu `| tệp …`', () => {
  const t = T.tableToScript(['Thời gian', 'Lời thoại', 'Source'], [{ 'Thời gian': '0:00-0:04', 'Lời thoại': 'Sản phẩm mới', Source: 'Nguon/san pham.jpg' },
    { 'Thời gian': '0:04-0:08', 'Lời thoại': 'Ghé quán', Source: 'Quán cà phê.mp4' }], { 'Thời gian': 'time', 'Lời thoại': 'say', Source: 'visual' });
  assert.match(t.text, /\[B-ROLL: Nguon\/san pham \| tệp Nguon\/san pham\.jpg\]/);
  assert.match(t.text, /\[B-ROLL: Quán cà phê \| tệp Quán cà phê\.mp4\]/);
});

const rows = () => ({ version: 1, rows: [
  { seg: 0, t0: 0, t1: 3, kind: 'hook', say: 'Mở đầu thật hấp dẫn', broll: [], sfx: [], screen: [] },
  { seg: 1, t0: 3, t1: 8, kind: 'body', say: 'Ghé quán cà phê buổi sáng', broll: [], sfx: [], screen: [] },
  { seg: 2, t0: 8, t1: 12, kind: 'body', say: 'Sản phẩm mới ra mắt', broll: [], sfx: [], screen: [] },
] });

test('pickBroll: nguồn bạn đưa trước Kho chung; `tệp` tìm qua findSource', async () => {
  const src = { mine: () => [{ rel: 'Nguon/san pham.jpg', score: 1 }], kho: () => [{ rel: 'BRoll/san pham.jpg', score: 3 }], dyn: () => [{ id: 'd1' }],
    find: n => (n === 'Quán cà phê.mp4' ? { rel: 'Nguon/Quán cà phê.mp4' } : null), files: () => [] };
  const a = await B.pickBroll('sản phẩm', null, src);
  assert.equal(a.pick, 'Nguon/san pham.jpg'); assert.ok(a.alts.includes('kho:BRoll/san pham.jpg'));
  const b = await B.pickBroll('quán', 'tep:Quán cà phê.mp4', src);
  assert.equal(b.pick, 'Nguon/Quán cà phê.mp4');
  const c = await B.pickBroll('x', 'tep:khong co.mp4', src);
  assert.ok(c.miss);
});

test('checkAssign / assignByName / applyAssign: id, đoạn có thật, mỗi file một lần, from kẹp theo độ dài', () => {
  const list = [{ id: 'S1', rel: 'Nguon/Quán cà phê.mp4', name: 'Quán cà phê.mp4', kind: 'video', dur: 90 }, { id: 'S2', rel: 'Nguon/san pham.jpg', name: 'san pham.jpg', kind: 'image', dur: 0 }];
  const sh = rows();
  const got = SS.checkAssign({ assign: [{ id: 'S1', seg: 1, from: 200 }, { id: 'S1', seg: 2 }, { id: 'S9', seg: 1 }, { id: 'S2', seg: 7 }] }, list, sh);
  assert.deepEqual(got.map(x => [x.rel, x.seg, x.from]), [['Nguon/Quán cà phê.mp4', 1, 85]]);
  const byName = SS.assignByName(list, sh, K.scoreRel);
  assert.deepEqual(byName.map(x => [x.rel, x.seg]), [['Nguon/Quán cà phê.mp4', 1], ['Nguon/san pham.jpg', 2]]);
  SS.applyAssign(sh, got);
  assert.deepEqual(sh.rows[1].broll[0], { q: 'Quán cà phê', src: 'kho', pick: 'Nguon/Quán cà phê.mp4', alts: [], mine: true, clip: 85, from: 'claude' });
  SS.applyAssign(sh, got); assert.equal(sh.rows[1].broll.length, 1);
  assert.deepEqual(SS.unboundSources(SS.readSources(PROJ), sh).map(x => x.rel), ['Nguon/san pham.jpg']);
  assert.ok(B.scriptRequests(sh).some(q => q.id === '1:broll:0' && q.kind === 'B-ROLL'));
});

test('assignSources: Claude nhận prompt có tên + khung ảnh, kết quả gắn vào bảng; Claude lỗi → khớp tên; dọn thư mục tạm', async () => {
  const sources = SS.readSources(PROJ), abs = rel => K.resolveRel(ws, rel);
  let seen = null, cwd = null;
  const sh = rows();
  const r = await SS.assignSources(sh, sources, { abs, score: K.scoreRel, ask: async (p, o) => { seen = p; cwd = o.cwd; assert.ok(fs.existsSync(cwd)); return { assign: [{ id: 'S1', seg: 2 }, { id: 'S2', seg: 1, from: 3 }] }; } });
  assert.equal(r.by, 'claude'); assert.equal(r.assigned.length, 2);
  assert.match(seen, /san pham\.jpg/); assert.match(seen, /đoạn 1: 3\.0–8\.0 s/); assert.match(seen, /công cụ Read/);
  assert.equal(fs.existsSync(cwd), false, 'thư mục khung ảnh tạm đã xoá');
  assert.equal(sh.rows[2].broll[0].pick, 'Nguon/Quán cà phê.mp4'); assert.equal(sh.rows[1].broll[0].pick, 'Nguon/san pham.jpg'); // S1 = file đầu danh sách
  const sh2 = rows();
  const r2 = await SS.assignSources(sh2, sources, { abs, score: K.scoreRel, ask: async () => { throw new Error('không có Claude'); } });
  assert.equal(r2.by, 'name'); assert.match(r2.error, /không có Claude/);
  assert.equal(sh2.rows[1].broll[0].pick, 'Nguon/Quán cà phê.mp4'); assert.equal(sh2.rows[1].broll[0].from, 'auto');
  // đoạn đã ghi file → không gán lại
  const sh3 = rows(); sh3.rows[0].broll.push({ q: 'x', src: 'kho', pick: 'Nguon/san pham.jpg', from: 'mark' }); sh3.rows[0].broll.push({ q: 'y', src: 'kho', pick: 'Nguon/Quán cà phê.mp4', from: 'mark' });
  assert.deepEqual(await SS.assignSources(sh3, sources, { abs, ask: async () => { throw new Error('không được gọi'); } }), { assigned: [], by: null });
});

test('sheetToPlan: cảnh từ file bạn đưa ghi "Đã dùng", dời khung theo đoạn con; sourceReport đếm chưa dùng', () => {
  const sh = rows(); SS.applyAssign(sh, [{ rel: 'Nguon/Quán cà phê.mp4', name: 'Quán cà phê.mp4', seg: 1, from: 12 }]);
  SS.markMine(sh, SS.readSources(PROJ));
  const media = { 'kho:Nguon/Quán cà phê.mp4': { seq: { seq: 'media/kho_q_frames/%05d.jpg', fps: 30, count: 900 }, off: 12 } };
  const p = B.sheetToPlan(sh, { width: 1080, height: 1920, duration: 12 }, { media });
  const s = p.photos.find(x => x._sheet === 1);
  assert.equal(s.credit, 'Nguồn bạn đưa'); assert.equal(s._script.mine, 'Nguon/Quán cà phê.mp4'); assert.equal(s._script.file, 'Quán cà phê.mp4');
  assert.match(s._script.note, /file bạn đưa “Quán cà phê\.mp4” từ giây 12/);
  assert.equal(s.media.t0, +(s.t0 - 12).toFixed(2)); assert.ok(s.t1 - s.t0 > 2.5, 'file bạn đưa giữ lâu hơn b-roll thường');
  const rep = SS.sourceReport(SS.readSources(PROJ), p.photos);
  assert.deepEqual(rep.used, ['Quán cà phê.mp4']); assert.deepEqual(rep.unused, ['san pham.jpg']); assert.equal(rep.total, 2);
  assert.deepEqual(SS.sourceReport(SS.readSources(PROJ), p.photos.map(x => ({ ...x, hidden: true }))).unused.length, 2);
});

const hasFF = spawnSync('ffmpeg', ['-version']).status === 0;
test('useSource: video ngắn dùng cả file (off), video dài cắt đoạn con vào media/; contactSheet một hàng khung', { skip: !hasFF && 'không có ffmpeg' }, async () => {
  const mk = (rel, sec) => { const f = path.join(KHO, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true });
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=160x120:rate=30:duration=${sec}`, '-pix_fmt', 'yuv420p', f]); assert.equal(r.status, 0, String(r.stderr)); };
  mk('Nguon/ngắn.mp4', 3); mk('Nguon/dài.mp4', 65);
  const a = await SS.useSource(PROJ, ws, K, 'Nguon/ngắn.mp4', { clip: 1.5, len: 2 });
  assert.equal(a.off, 1.5); assert.ok(a.seq.count >= 80);
  const b = await SS.useSource(PROJ, ws, K, 'Nguon/dài.mp4', { clip: 40, len: 3 });
  assert.equal(b.off, undefined); assert.ok(b.seq.count >= 90 && b.seq.count <= 130, `đoạn con ~4 s, có ${b.seq.count} khung`);
  assert.match(b.seq.seq, /_40s_frames/);
  assert.equal(fs.readdirSync(path.join(PROJ, 'media')).filter(f => f.endsWith('.tmp.mp4')).length, 0, 'không sót file tạm');
  const out = path.join(TMP, 'cs.jpg');
  assert.equal(await SS.contactSheet(path.join(KHO, 'Nguon', 'dài.mp4'), out, { dur: 65 }), out);
  assert.equal(await SS.contactSheet(path.join(KHO, 'Nguon', 'khong co.mp4'), path.join(TMP, 'x.jpg'), { dur: 5 }), null);
});

test('Studio: route nguồn + vùng thả ở ô Kịch bản + ghi chú "Đã dùng" + nhắc nguồn chưa dùng', () => {
  const r = read('studio/routes/19_script.mjs'), f = read('studio/features/19_script.js'), n = read('studio/features/23_scriptnotes.js'), sc = read('studio/features/02_score.core.js');
  assert.match(r, /p === '\/api\/script\/sources'/); assert.match(r, /K\.resolveRel\(ws, rel\)/); assert.match(r, /Không thấy trong Kho/);
  assert.match(f, /data-sc="src"/); assert.ok(f.includes('box.ondrop = e => { e.preventDefault(); e.stopPropagation();'), 'thả vào vùng nguồn không rơi xuống trình thả Media'); assert.match(f, /\/api\/kho\/upload\?/); assert.match(f, /to: 'source'/); assert.match(f, /multiple/);
  assert.match(n, /Đã dùng: \$\{x\.file\}/); assert.match(n, /nguồn bạn đưa chưa dùng/);
  assert.match(sc, /nguồn bạn đưa chưa dùng/);
  const e = read('scripts/ai_edit.mjs');
  assert.match(e, /userSources\(dir, tl, sheet/); assert.match(e, /'--allowedTools', 'Read'/); assert.match(e, /SS\.useSource\(/);
});
