// Giao thành phẩm vào <Kho>/Thanh pham/<YYYY-MM>/ (S12 M100, docs/plans/S12-kho-du-an.md mục 3 bước 5).
// Render vẫn ghi vào out/ của dự án; module này đưa bản giao sang Thanh pham/ bằng liên kết cứng (khác ổ / ổ không có liên
// kết cứng thì chép) và ghi sổ <dự án>/.studio/delivered.json (bản nào đã giao tới đâu) để gói quảng cáo, Đăng tra lại.
// Liên kết cứng dùng chung inode: mọi chỗ render lại cùng tên trong out/ phải xoá (hoặc ghi file tạm rồi rename) trước,
// không ghi đè tại chỗ, để bản ở Thanh pham/ vẫn là bản đã giao. Sổ lưu dấu vân tay của nguồn (inode, cỡ, mtime): nguồn
// đã render lại thì deliveredOf không trả bản giao cũ nữa.
// Bản chép (khác ổ) đi qua "<tên>.part.<pid>" rồi mới lấy tên thật: Đăng / Lịch đăng không thấy file chép dở.
// Dùng bởi: studio/server.mjs (Xuất, ảnh bìa, .srt: bản async, không chặn server khi chép khác ổ), scripts/batch.mjs,
// scripts/variants.mjs (tiến trình riêng: bản sync), scripts/ads_pack.mjs, studio/routes/52_publish.mjs, 18_schedule.mjs,
// 54_thanhpham.mjs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AVS_HOME, KINDS, deliveredDir, ensureWorkspace, freeName, inWorkspace, safeName, sub, workspaceFor, workspaceOfProject } from './workspace.mjs';
import { retryBusy, withFileLock } from './file_lock.mjs';

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const VIDEO = KINDS.video;

/** Khổ dễ đọc từ kích thước: 9x16, 16x9, 1x1, 4x5, còn lại WxH. */
export function aspectLabel(w, h) {
  if (!(w > 0 && h > 0)) return '';
  const r = w / h, known = [['9x16', 9 / 16], ['16x9', 16 / 9], ['1x1', 1], ['4x5', 4 / 5], ['5x4', 5 / 4]];
  const k = known.find(([, v]) => Math.abs(r - v) < .02);
  return k ? k[0] : `${w}x${h}`;
}
/** Tên dự án để đặt tên bản giao: thư mục dự án (trong Du an/ là tên người dùng đặt). */
export const projectName = dir => path.basename(path.resolve(dir));

/** Tên file hiển thị an toàn, giữ đuôi: "<base><ext>" (base tối đa 70 đơn vị UTF-16, không cắt đôi emoji; rỗng → "Thanh pham"). */
export function fileName(base, ext) {
  let cut = ''; for (const ch of String(base || '')) { if (cut.length + ch.length > 70) break; cut += ch; } // safeName cắt theo 80 đơn vị UTF-16
  const b = safeName(cut), e = ext.startsWith('.') ? ext : '.' + ext;
  return `${b === 'Chung' && !String(base || '').trim() ? 'Thanh pham' : b}${e}`;
}

/**
 * Thư mục giao trong tháng, có thể kèm thư mục con (tên lô hàng loạt / tên dự án gốc của biến thể). Tạo sẵn.
 * folder rỗng → Thanh pham/<YYYY-MM>/.
 */
export function deliverFolder(ws, { folder = '', date = new Date() } = {}) {
  ensureWorkspace(ws);
  let d = deliveredDir(ws, date);
  if (folder) { d = path.join(d, safeName(folder)); fs.mkdirSync(d, { recursive: true }); }
  if (!inWorkspace(ws, d)) throw Object.assign(new Error('Thư mục giao không nằm trong Kho'), { status: 400 });
  return d;
}

// ---------- đặt một file vào thư mục giao ----------
// Tên không trùng: freeName rồi linkSync (EEXIST nếu hai bản song song lấy cùng tên → thử tên kế). Chép: vào tên tạm
// ".part" rồi linkSync sang tên thật (nguyên tử, không ghi đè); ổ không có liên kết cứng (FAT/exFAT) thì rename khi tên
// thật còn trống.
const nameIn = (d, name) => path.join(d, freeName(d, name));
// tên tạm riêng cho từng lần chép: hai lần giao song song trong cùng tiến trình (ảnh bìa + xuất) không dùng chung file tạm
const partOf = dst => `${dst}.part.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
function claim(tmp, d, name) {
  for (let i = 0; ; i++) {
    const dst = nameIn(d, name);
    try { fs.linkSync(tmp, dst); fs.rmSync(tmp, { force: true }); return dst; }
    catch (e) {
      if (e.code === 'EEXIST' && i < 20) continue;
      if (e.code === 'EEXIST') throw e;
      if (fs.existsSync(dst)) { if (i < 20) continue; throw e; }
      retryBusy(() => fs.renameSync(tmp, dst)); return dst;
    }
  }
}
function guard(ws, d) { if (!inWorkspace(ws, d)) throw Object.assign(new Error('Đích không nằm trong Kho'), { status: 400 }); }
function placeSync(ws, src, d, name) {
  guard(ws, d);
  for (let i = 0; i < 20; i++) {
    const dst = nameIn(d, name);
    try { fs.linkSync(src, dst); return { dst, how: 'link' }; } catch (e) { if (e.code === 'EEXIST') continue; break; }
  }
  const tmp = partOf(nameIn(d, name));
  try { fs.copyFileSync(src, tmp); return { dst: claim(tmp, d, name), how: 'copy' }; } finally { fs.rmSync(tmp, { force: true }); }
}
async function placeAsync(ws, src, d, name) {
  guard(ws, d);
  for (let i = 0; i < 20; i++) {
    const dst = nameIn(d, name);
    try { fs.linkSync(src, dst); return { dst, how: 'link' }; } catch (e) { if (e.code === 'EEXIST') continue; break; }
  }
  const tmp = partOf(nameIn(d, name));
  try { await fs.promises.copyFile(src, tmp); return { dst: claim(tmp, d, name), how: 'copy' }; } finally { fs.rmSync(tmp, { force: true }); }
}

// ---------- sổ giao của dự án: .studio/delivered.json ----------
const ledgerFile = dir => path.join(dir, '.studio', 'delivered.json');
export function readLedger(dir) { const j = readJson(ledgerFile(dir)); return Array.isArray(j?.items) ? j.items : []; }
function appendLedger(dir, recs) {
  const f = ledgerFile(dir);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  withFileLock(f + '.lock', () => {
    const items = [...readLedger(dir), ...recs].slice(-500);
    const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify({ version: 1, items }, null, 1)); retryBusy(() => fs.renameSync(t, f));
  });
}
/** Khoá inode để bỏ trùng bản ở out/ và liên kết cứng của nó trong Thanh pham/ (ổ không có inode: theo đường dẫn). */
export function fileKey(f) { try { const s = fs.statSync(f, { bigint: true }); return s.ino ? `${s.dev}:${s.ino}` : path.resolve(f); } catch { return path.resolve(f); } }
const stamp = f => { try { const s = fs.statSync(f); return { key: fileKey(f), size: s.size, mtime: Math.round(s.mtimeMs) }; } catch { return null; } };
const relOf = (dir, f) => path.relative(dir, path.resolve(dir, f)).split(path.sep).join('/');
/**
 * Bản giao còn đúng của một file trong dự án (src tuyệt đối hoặc tương đối với dự án), mới nhất. → đường dẫn | null
 * "Còn đúng": bản giao còn trên đĩa và nguồn chưa bị render lại (cùng inode, cỡ, mtime như lúc giao).
 */
export function deliveredOf(dir, src) {
  const rel = relOf(dir, src), now = stamp(path.resolve(dir, src));
  if (!now) return null;
  const hit = readLedger(dir).filter(r => r.src === rel && r.dst && fs.existsSync(r.dst) && (!r.from || (r.from.key === now.key && r.from.size === now.size && r.from.mtime === now.mtime))).pop();
  return hit ? hit.dst : null;
}
/** Mọi bản giao còn trên đĩa của dự án (để biết một file trong Thanh pham/ có phải của dự án này). → Set khoá */
export function deliveredKeys(dir) { return new Set(readLedger(dir).filter(r => r.dst && fs.existsSync(r.dst)).map(r => fileKey(r.dst))); }

function prepare(dir, items, { tl = null, folder = '', date = new Date(), home, ws = null } = {}) {
  const w = ws || workspaceOfProject(dir, tl, home ? { home } : {});
  return { w, d: deliverFolder(w, { folder, date }), todo: items.filter(it => it?.src && fs.existsSync(it.src)) };
}
function finish(dir, w, d, done) {
  const at = new Date().toISOString();
  const recs = done.filter(r => r.dst).map(r => ({ src: relOf(dir, r.src), dst: r.dst, how: r.how, at, from: r.from }));
  if (recs.length) try { appendLedger(dir, recs); } catch (e) { console.error('[kho] không ghi được delivered.json:', e.message); }
  return { ws: w.root, dir: d, items: done.map(({ from, ...r }) => r) };
}
/**
 * Giao các file của một dự án. items: [{ src: tuyệt đối, name: tên hiển thị kèm đuôi }].
 * o: { tl, folder, date, home, ws } (ws mặc định workspaceOfProject(dir, tl)).
 * → { ws: gốc Kho, dir: thư mục giao, items: [{ src, dst, how }] }. Lỗi một file không chặn file khác (ghi .error).
 * Bản sync cho tiến trình riêng (batch.mjs, variants.mjs); server Studio dùng deliverProjectAsync.
 */
export function deliverProject(dir, items, o = {}) {
  const { w, d, todo } = prepare(dir, items, o), done = [];
  for (const it of todo) {
    const from = stamp(it.src);
    try { done.push({ src: it.src, from, ...placeSync(w, it.src, d, it.name || path.basename(it.src)) }); } catch (e) { done.push({ src: it.src, error: e.message }); }
  }
  return finish(dir, w, d, done);
}
/** Như deliverProject nhưng chép khác ổ bằng I/O bất đồng bộ (không treo server Studio khi chép video vài GB). */
export async function deliverProjectAsync(dir, items, o = {}) {
  const { w, d, todo } = prepare(dir, items, o), done = [];
  for (const it of todo) {
    const from = stamp(it.src);
    try { done.push({ src: it.src, from, ...(await placeAsync(w, it.src, d, it.name || path.basename(it.src))) }); } catch (e) { done.push({ src: it.src, error: e.message }); }
  }
  return finish(dir, w, d, done);
}

/**
 * Tên bản xuất video (xuất tại máy, nhiều khổ): "<tên dự án> <khổ>[ đoạn A-Bs].mp4".
 * outs: [{ src, w, h } | { src, aspect: '9:16' }]; o.range: { from, to } khi chỉ xuất một đoạn.
 */
export function exportItems(dir, outs, o = {}) {
  const name = o.name || projectName(dir), r = o.range, n = v => String(+(+v).toFixed(1));
  const part = r && (r.from != null || r.to != null) ? ` đoạn ${n(r.from ?? 0)}-${r.to != null ? n(r.to) : 'hết'}s` : '';
  return outs.map(x => {
    const asp = x.aspect ? String(x.aspect).replace(':', 'x') : aspectLabel(x.w, x.h);
    return { src: x.src, name: fileName(`${name}${asp ? ' ' + asp : ''}${part}`, path.extname(x.src) || '.mp4') };
  });
}
export const deliverExports = (dir, outs, o = {}) => deliverProject(dir, exportItems(dir, outs, o), o);
export const deliverExportsAsync = (dir, outs, o = {}) => deliverProjectAsync(dir, exportItems(dir, outs, o), o);

// ---------- đọc Thanh pham/ (Đăng, Lịch đăng) ----------
/** Video trong Thanh pham/ của một Kho (sâu 3 cấp: tháng/lô/file), mới nhất trước. → [{ file, rel, name, size, mtime }] */
export function listDelivered(ws, { max = 200, depth = 3 } = {}) {
  const root = sub(ws, 'delivered'), out = [];
  const walk = (d, lv) => {
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (lv + 1 < depth) walk(p, lv + 1); continue; }
      if (!e.isFile() || !VIDEO.test(e.name) || /\.part\./.test(e.name)) continue;
      let st; try { st = fs.statSync(p); } catch { continue; }
      out.push({ file: p, rel: path.relative(root, p).split(path.sep).join('/'), name: e.name, size: st.size, mtime: st.mtimeMs });
    }
  };
  walk(root, 0);
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, max);
}
/** Mọi Kho đã đăng ký: thương hiệu trong brands.json + Kho Chung (gốc trùng thì một). Chỉ Kho có thật trên đĩa. */
export function knownWorkspaces({ home = AVS_HOME() } = {}) {
  const ids = ['', ...((readJson(path.join(home, 'brands.json'))?.brands || []).map(b => b?.id).filter(x => typeof x === 'string' && x))];
  const seen = new Set(), out = [];
  for (const id of ids) {
    const ws = workspaceFor(id, { home }), k = process.platform === 'win32' ? ws.root.toLowerCase() : ws.root;
    if (!seen.has(k) && fs.existsSync(ws.root)) { seen.add(k); out.push(ws); }
  }
  return out;
}
/** f nằm trong Thanh pham/ của Kho ws (đã giải liên kết). */
export const inDelivered = (ws, f) => inWorkspace(ws, f) && inWorkspace({ root: sub(ws, 'delivered') }, f);
/**
 * File chữ đặt cạnh một video đã giao (nội dung đăng): "<tên video không đuôi><suffix>". Ghi file mới (tmp + rename),
 * không ghi tại chỗ. video phải nằm trong Thanh pham/ của Kho ws. → đường dẫn
 */
export function writeBeside(ws, video, suffix, text) {
  if (!inDelivered(ws, video)) throw Object.assign(new Error('Video không nằm trong Thanh pham/ của Kho'), { status: 400 });
  const v = path.resolve(video), dst = path.join(path.dirname(v), path.basename(v, path.extname(v)) + suffix);
  const t = `${dst}.${process.pid}.tmp`; fs.writeFileSync(t, text); retryBusy(() => fs.renameSync(t, dst));
  return dst;
}
