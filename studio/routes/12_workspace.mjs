// Kho dự án theo thương hiệu (S12 / M97, docs/plans/S12-kho-du-an.md): xem, đặt, tạo, tải lên, mở Kho ở bước Chuẩn bị.
//   GET  /api/kho?brand=&kind=            → { ws, items, warning, dirs, uploadKinds }   (kind: video|image|audio|font)
//   GET  /api/kho/file?brand=&rel=        → ảnh trong Kho (ô xem trước của lưới; chỉ ảnh, chỉ trong Kho)
//   POST /api/kho/set {brand, dir}        → { ws }  thư mục có sẵn (phải tồn tại); 400 / 404 / 409
//   POST /api/kho/create {brand}          → { ws }  Kho mặc định <Videos>/AI Video Studio/<tên>, ghi luôn vào brand kit
//   POST /api/kho/upload?brand=&name=&to= → { path, rel, name, kind, dir }  thân request là file thô; tên trùng → "x (2).mp4"
//   POST /api/kho/pick-folder             → { path } | { cancelled } | { unsupported }  hộp chọn thư mục của hệ điều hành
//   POST /api/kho/reveal {brand}          → { ok }  mở Kho trong Explorer / Finder
// Mọi đường dẫn Kho tính qua scripts/workspace.mjs; brand rỗng = Kho "Chung", brand lạ → 404 (không lặng lẽ ghi vào Kho Chung).
import fs from 'node:fs';
import { rmSync } from '../../scripts/fs_rm.mjs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import * as W from '../../scripts/workspace.mjs';
import { openPath } from '../../scripts/platform.mjs';

const fail = (msg, status) => Object.assign(new Error(msg), { status });
const BRAND_ID = /^[A-Za-z0-9_-]{1,60}$/;
export function brandOf(v) { // dùng chung với 13_kho_migrate.mjs
  if (v == null || v === '') return '';
  if (typeof v !== 'string' || !BRAND_ID.test(v)) throw fail('Mã thương hiệu không hợp lệ', 400);
  let list = [];
  try { list = JSON.parse(fs.readFileSync(path.join(W.AVS_HOME(), 'brands.json'), 'utf8')).brands || []; } catch {}
  if (!list.some(b => b.id === v)) throw fail('Không thấy thương hiệu', 404);
  return v;
}
// Logo của brand kit ($AVS_HOME/brands/<id>/logo.*) vào <Kho>/Thuong hieu/ khi Kho vừa tạo/chọn (51_brands chỉ chép khi Kho đã có).
async function seedLogo(brand) {
  if (!brand) return;
  let b = null;
  try { b = (JSON.parse(fs.readFileSync(path.join(W.AVS_HOME(), 'brands.json'), 'utf8')).brands || []).find(x => x.id === brand); } catch {}
  const src = b?.logo && /^logo\.[a-z]+$/.test(b.logo) ? path.join(W.AVS_HOME(), 'brands', brand, b.logo) : null;
  if (!src || !fs.existsSync(src)) return;
  const { logoToKho } = await import('./51_brands.mjs');
  logoToKho(brand, src, b.logo);
}
const pub = ws => ({ root: ws.root, brand: ws.brand, title: ws.title, custom: ws.custom, exists: ws.exists });

/**
 * Lệnh mở hộp chọn thư mục cho một hệ điều hành → [cmd, args] hoặc null (không có hộp, client chỉ còn ô dán).
 * AVS_NO_FOLDER_DIALOG=1 tắt hộp (máy không màn hình, test).
 */
export function pickerCommand(platform = process.platform, env = process.env) {
  if (env.AVS_NO_FOLDER_DIALOG === '1') return null;
  const title = 'Chọn thư mục làm Kho';
  if (platform === 'win32') {
    // -STA: WinForms cần luồng STA. Cửa sổ chủ TopMost để hộp nổi trên trình duyệt. -EncodedCommand (UTF-16LE) giữ tiếng Việt.
    const ps = `Add-Type -AssemblyName System.Windows.Forms;[Console]::OutputEncoding=[Text.Encoding]::UTF8;$o=New-Object System.Windows.Forms.Form;$o.TopMost=$true;` +
      `$d=New-Object System.Windows.Forms.FolderBrowserDialog;$d.Description='${title}';$d.ShowNewFolderButton=$true;` +
      `if($d.ShowDialog($o) -eq [System.Windows.Forms.DialogResult]::OK){[Console]::Out.Write($d.SelectedPath)};$o.Dispose()`;
    return ['powershell.exe', ['-NoProfile', '-STA', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')]];
  }
  if (platform === 'darwin') return ['osascript', ['-e', `POSIX path of (choose folder with prompt "${title}")`]];
  if (platform === 'linux') return ['zenity', ['--file-selection', '--directory', `--title=${title}`]];
  return null;
}
let picking = false;
function pickFolder() {
  const cmd = pickerCommand();
  if (!cmd) return Promise.resolve({ unsupported: true });
  if (picking) return Promise.reject(fail('Hộp chọn thư mục đang mở', 409));
  picking = true;
  return new Promise(ok => {
    execFile(cmd[0], cmd[1], { timeout: 10 * 60_000, windowsHide: true, encoding: 'utf8', maxBuffer: 1 << 16 }, (e, out) => {
      picking = false;
      if (e?.code === 'ENOENT') return ok({ unsupported: true }); // không có powershell / osascript / zenity
      const p = String(out || '').trim().replace(/[\\/]+$/, (m, i) => (i <= 2 ? m : '')); // bỏ "/" cuối của osascript, giữ "C:\"
      ok(p ? { path: p } : { cancelled: true }); // huỷ: Windows trả rỗng, macOS/zenity thoát mã 1
    });
  });
}

// Tên file an toàn trong Kho: giữ dấu tiếng Việt, bỏ ký tự cấm, giữ đuôi viết thường.
function fileName(raw) {
  const base = path.basename(String(raw || '').replace(/\\/g, '/')).normalize('NFC');
  const ext = path.extname(base).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
  return W.safeName(base.slice(0, base.length - path.extname(base).length)) + ext;
}

export default ctx => async (req, res, p, u) => {
  if (p !== '/api/kho' && !p.startsWith('/api/kho/')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  try {
    if (req.method === 'GET' && p === '/api/kho') {
      const ws = W.workspaceFor(brandOf(u.searchParams.get('brand')));
      const kind = u.searchParams.get('kind') || null;
      if (kind && !Object.hasOwn(W.KINDS, kind)) throw fail('Loại file lạ', 400);
      return J({ ws: pub(ws), items: W.listWorkspace(ws, { kind, max: 2000 }), warning: ws.warning, dirs: W.KHO_DIRS, uploadKinds: W.UPLOAD_KINDS });
    }
    if (req.method === 'GET' && p === '/api/kho/file') {
      const ws = W.workspaceFor(brandOf(u.searchParams.get('brand'))), rel = String(u.searchParams.get('rel') || '');
      const f = path.resolve(ws.root, rel);
      if (!rel || rel.split(/[\\/]/).some(s => s.startsWith('.')) || W.kindOf(f) !== 'image' || !W.inWorkspace(ws, f) || !fs.existsSync(f)) throw fail('Không thấy ảnh', 404);
      // Kho có thể là thư mục có sẵn chứa file tải từ mạng: SVG có script không được chạy với origin của Studio
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      ctx.sendFile(req, res, f);
      return true;
    }
    if (req.method !== 'POST') return false;

    if (p === '/api/kho/upload') {
      const ws = W.workspaceFor(brandOf(u.searchParams.get('brand')));
      const name = fileName(u.searchParams.get('name'));
      if (!W.kindOf(name)) throw fail('Loại file này không đưa vào Kho được (chỉ video, ảnh, nhạc, phông chữ)', 400);
      const rel = W.uploadDir(name, u.searchParams.get('to'));
      if (!rel) throw fail('Thư mục đích lạ', 400);
      // chỉ ghi vào Kho đã đăng ký (create/set): không tạo Kho "mồ côi" chưa ghi vào brand kit
      if (!ws.exists) throw fail('Kho chưa được tạo: bấm "Tạo Kho mặc định" hoặc chọn thư mục trước', 409);
      W.ensureWorkspace(ws);
      const dir = path.join(ws.root, ...rel.split('/'));
      if (!W.inWorkspace(ws, dir)) throw fail('Đích không nằm trong Kho', 400);
      fs.mkdirSync(dir, { recursive: true });
      // 'wx': hai lần tải cùng tên chạy song song không ghi đè nhau (lần sau lấy tên kế tiếp)
      for (let i = 0; ; i++) {
        const f = path.join(dir, W.freeName(dir, name));
        if (!W.inWorkspace(ws, f)) throw fail('Đích không nằm trong Kho', 400);
        let w;
        try { w = fs.createWriteStream(f, { flags: 'wx' }); await new Promise((ok, bad) => { w.once('open', ok); w.once('error', bad); }); }
        catch (e) { if (e.code === 'EEXIST' && i < 20) continue; throw e; }
        try { await pipeline(req, w); }
        catch (e) { rmSync(f, { force: true }); throw fail('Tải lên bị ngắt, chưa lưu file', 400); }
        if (req.aborted || req.readableAborted) { rmSync(f, { force: true }); throw fail('Tải lên bị ngắt, chưa lưu file', 400); }
        const r = W.relTo(ws, f);
        return J({ path: f, rel: r, name: path.basename(f), kind: W.kindOf(f), dir: r.split('/')[0], size: fs.statSync(f).size });
      }
    }
    if (p === '/api/kho/pick-folder') return J(await pickFolder());

    const b = await ctx.body(req);
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw fail('Dữ liệu gửi lên không hợp lệ', 400);
    if (p === '/api/kho/set') {
      const brand = brandOf(b.brand);
      if (typeof b.dir !== 'string') throw fail('Thiếu đường dẫn thư mục', 400);
      const ws = W.setWorkspace(brand, b.dir, { mustExist: true });
      await seedLogo(brand);
      return J({ ws: pub(ws) });
    }
    if (p === '/api/kho/create') {
      const brand = brandOf(b.brand), def = W.workspaceFor(brand);
      const fresh = !fs.existsSync(def.root);
      const ws = W.setWorkspace(brand, def.root); // ghi đường dẫn vào brand kit: đổi tên thương hiệu sau này không "mất" Kho
      // Kho mới tinh: tạo sẵn thư mục con để người dùng thấy chỗ thả file. Thư mục có sẵn thì để nguyên (không rác).
      if (fresh) for (const k of W.UPLOAD_KINDS) W.sub(ws, k, { mkdir: true });
      await seedLogo(brand);
      return J({ ws: pub(ws) });
    }
    if (p === '/api/kho/reveal') {
      const ws = W.workspaceFor(brandOf(b.brand));
      if (!fs.existsSync(ws.root)) throw fail('Kho chưa được tạo', 404);
      openPath(ws.root);
      return J({ ok: true });
    }
    return false;
  } catch (e) {
    if (res.headersSent) { res.destroy(); return true; }
    if (!req.readableEnded && !req.destroyed) req.resume(); // trả lỗi trước khi đọc hết file: xả phần còn lại để trình duyệt nhận được JSON
    return J({ error: e.message }, e.status || 500);
  }
};
