// Giao thành phẩm vào <Kho>/Thanh pham/<YYYY-MM>/ (S12 M100, docs/plans/S12-kho-du-an.md mục 3 bước 5).
// Render vẫn ghi vào out/ của dự án; module này đưa bản giao sang Thanh pham/ bằng liên kết cứng (khác ổ thì chép) qua
// scripts/workspace.mjs, ghi sổ <dự án>/.studio/delivered.json (bản nào đã giao tới đâu) để gói quảng cáo, Đăng tra lại.
// Liên kết cứng: renderer xoá rồi ghi lại file trong out/ thì bản ở Thanh pham/ vẫn là bản đã giao (không ghi đè tại chỗ).
// Dùng bởi: studio/server.mjs (Xuất, ảnh bìa, .srt), scripts/batch.mjs, scripts/variants.mjs, scripts/ads_pack.mjs,
// studio/routes/52_publish.mjs, 18_schedule.mjs, 53_thanhpham.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { AVS_HOME, KINDS, deliveredDir, ensureWorkspace, freeName, inWorkspace, linkOrCopy, safeName, sub, workspaceFor, workspaceOfProject } from './workspace.mjs';
import { retryBusy } from './file_lock.mjs';

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

/** Tên file hiển thị an toàn, giữ đuôi: "<base><ext>" (base cắt 70 ký tự, ký tự cấm thay bằng khoảng trắng). */
export function fileName(base, ext) {
  const b = safeName(String(base || '').slice(0, 70));
  return `${b}${ext.startsWith('.') ? ext : '.' + ext}`;
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

/** Một file vào thư mục d với tên không trùng (thử lại khi hai bản song song lấy cùng tên). → { dst, how: 'link'|'copy' } */
function place(ws, src, d, name) {
  for (let i = 0; ; i++) {
    const dst = path.join(d, freeName(d, name));
    try { return { dst, how: linkOrCopy(src, dst, { ws }) }; }
    catch (e) { if (e.code !== 'EEXIST' || i >= 20) throw e; }
  }
}

// ---------- sổ giao của dự án: .studio/delivered.json ----------
const ledgerFile = dir => path.join(dir, '.studio', 'delivered.json');
export function readLedger(dir) { const j = readJson(ledgerFile(dir)); return Array.isArray(j?.items) ? j.items : []; }
function appendLedger(dir, recs) {
  const f = ledgerFile(dir), items = [...readLedger(dir), ...recs].slice(-500);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify({ version: 1, items }, null, 1)); retryBusy(() => fs.renameSync(t, f));
}
/** Bản giao còn trên đĩa của một file trong dự án (src tuyệt đối hoặc tương đối với dự án), mới nhất. → đường dẫn | null */
export function deliveredOf(dir, src) {
  const rel = path.relative(dir, path.resolve(dir, src)).split(path.sep).join('/');
  const hit = readLedger(dir).filter(r => r.src === rel && r.dst && fs.existsSync(r.dst)).pop();
  return hit ? hit.dst : null;
}

/**
 * Giao các file của một dự án. items: [{ src: tuyệt đối, name: tên hiển thị kèm đuôi }].
 * o: { tl, folder, date, home, ws } (ws mặc định workspaceOfProject(dir, tl)).
 * → { ws: gốc Kho, dir: thư mục giao, items: [{ src, dst, how }] }. Lỗi một file không chặn file khác (ghi .error).
 */
export function deliverProject(dir, items, { tl = null, folder = '', date = new Date(), home, ws = null } = {}) {
  const w = ws || workspaceOfProject(dir, tl, home ? { home } : {});
  const d = deliverFolder(w, { folder, date });
  const done = [];
  for (const it of items) {
    if (!it?.src || !fs.existsSync(it.src)) continue;
    try { const r = place(w, it.src, d, it.name || path.basename(it.src)); done.push({ src: it.src, ...r }); }
    catch (e) { done.push({ src: it.src, error: e.message }); }
  }
  const at = new Date().toISOString();
  const recs = done.filter(r => r.dst).map(r => ({ src: path.relative(dir, r.src).split(path.sep).join('/'), dst: r.dst, how: r.how, at }));
  if (recs.length) try { appendLedger(dir, recs); } catch (e) { console.error('[kho] không ghi được delivered.json:', e.message); }
  return { ws: w.root, dir: d, items: done };
}

/**
 * Giao các bản xuất video (xuất tại máy, nhiều khổ): tên "<tên dự án> <khổ>.mp4".
 * outs: [{ src, w, h } | { src, aspect: '9:16' }]. → như deliverProject.
 */
export function deliverExports(dir, outs, o = {}) {
  const name = o.name || projectName(dir);
  return deliverProject(dir, outs.map(x => {
    const asp = x.aspect ? String(x.aspect).replace(':', 'x') : aspectLabel(x.w, x.h);
    return { src: x.src, name: fileName(asp ? `${name} ${asp}` : name, path.extname(x.src) || '.mp4') };
  }), o);
}

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
/** Khoá inode để bỏ trùng bản ở out/ và liên kết cứng của nó trong Thanh pham/. */
export function fileKey(f) { try { const s = fs.statSync(f, { bigint: true }); return s.ino ? `${s.dev}:${s.ino}` : path.resolve(f); } catch { return path.resolve(f); } }
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
