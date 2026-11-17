// Bước 3 Dựng: tab Kho của panel Media (S12 · M99, docs/plans/S12-kho-du-an.md). Logic ở scripts/kho_media.mjs.
//   GET  /api/media/kho?group=image|broll|music|source&q=  → { kho:{title, brand, root, exists, found, warning}, items:[{rel, name, kind, group, size, mtime, used}] }
//                                                            Kho của dự án đang mở (workspaceOfProject); used = media/kho_* đã có trong dự án
//   GET  /api/media/kho/file?rel=                                → ảnh / âm thanh trong Kho để xem trước (chỉ đọc)
//   POST /api/media/kho/use {rel}                                → liên kết vào media/kho_<tên> (+ khung + audio.m4a nếu là video),
//                                                            trả mục như /api/media để client chèn ngay; rel thoát Kho, video > 3 phút → 400
//   POST /api/media/kho/upload?name=  (thân = file âm thanh thô) → { rel, name } vào Nhac/ của Kho CHỨA DỰ ÁN (S19 M138, "Nhạc của
//                                                            bạn"). /api/kho/upload?brand= ghi theo thương hiệu, có thể là Kho khác với Kho
//                                                            của dự án (dự án trong Kho tự chọn / .kho.json) — nhạc tải lên sẽ không hiện.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { shortErr } from '../../scripts/err_text.mjs';
import * as W from '../../scripts/workspace.mjs';

const AUDIO = /\.(mp3|wav|m4a|aac|flac|ogg|aiff?)$/i, MUSIC_MAX = 1.5 * 1024 ** 3;
const fileName = raw => { // như 12_workspace: chỉ phần tên, NFC, đuôi chữ thường an toàn
  const base = path.basename(String(raw || '').replace(/\\/g, '/')).normalize('NFC');
  const ext = path.extname(base).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
  return W.safeName(base.slice(0, base.length - path.extname(base).length)) + ext;
};
const fail = (m, status) => Object.assign(new Error(m), { status });

export default ctx => {
  let KM = null;
  const km = async () => (KM ||= await import(pathToFileURL(path.join(ctx.SKILL, 'scripts/kho_media.mjs')).href));
  const tl = () => { try { return JSON.parse(fs.readFileSync(ctx.project.tlFile, 'utf8')); } catch { return null; } };
  return async (req, res, p, u) => {
    if (!['/api/media/kho', '/api/media/kho/file', '/api/media/kho/use', '/api/media/kho/upload'].includes(p)) return false; // không dùng /api/kho/*: 12_workspace (M97) nạp trước, bắt cả tiền tố đó và đọc body POST
    if (!ctx.project) return ctx.json(res, { error: 'Chưa mở dự án' }, 400), true;
    const K = await km();
    try {
      const ws = K.khoOf(ctx.project.dir, tl());
      if (p === '/api/media/kho' && req.method === 'GET') {
        const group = String(u.searchParams.get('group') || u.searchParams.get('kind') || '');
        if (group && !Object.hasOwn(K.GROUPS, group)) return ctx.json(res, { error: 'Nhóm lạ' }, 400), true;
        const items = fs.existsSync(ws.root) ? K.khoItems(ctx.project.dir, ws, { group, q: String(u.searchParams.get('q') || '').slice(0, 100) }) : [];
        const { title, brand, root, exists, found, warning } = ws;
        return ctx.json(res, { kho: { title, brand, root, exists: fs.existsSync(root) && exists, found, warning }, items }), true;
      }
      if (p === '/api/media/kho/file' && req.method === 'GET') {
        const f = K.resolveRel(ws, String(u.searchParams.get('rel') || ''));
        if (!/\.(jpe?g|png|webp|gif|mp3|wav|m4a|aac|flac|ogg)$/i.test(f)) return ctx.json(res, { error: 'Chỉ xem trước ảnh hoặc âm thanh' }, 400), true;
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return ctx.sendFile(req, res, f), true;
      }
      if (p === '/api/media/kho/use' && req.method === 'POST') {
        const b = await ctx.body(req);
        // tách khung chạy ngay trong request (~5 400 JPEG cho 3 phút): video dài hơn (footage thô của Nguon/) dùng ở bước Nguồn, không chèn thẳng
        return ctx.json(res, await K.useFromKho(ctx.project.dir, ws, b?.rel, { maxDur: 180, why: 'chèn từ Kho; video dài hãy tạo dự án ở bước Nguồn' })), true;
      }
      if (p === '/api/media/kho/upload' && req.method === 'POST') {
        const name = fileName(u.searchParams.get('name'));
        if (!AUDIO.test(name)) { req.resume(); throw fail('Chỉ nhận file nhạc (mp3, m4a, wav, aac, flac, ogg)', 400); }
        // trần riêng cho nhạc (trần chung của UPLOAD_ROUTES là cho video thô): WAV 2 giờ ~1,2 GB là quá đủ
        if (+req.headers?.['content-length'] > MUSIC_MAX) { req.resume(); throw fail('File nhạc quá lớn (tối đa 1,5 GB)', 413); }
        if (!ws.root || !fs.existsSync(ws.root)) { req.resume(); throw fail('Dự án chưa có Kho: tạo Kho ở bước ① Chuẩn bị', 409); }
        const dir = path.join(ws.root, W.KHO_DIRS.music);
        if (!W.inWorkspace(ws, dir)) { req.resume(); throw fail('Đích không nằm trong Kho', 400); }
        fs.mkdirSync(dir, { recursive: true });
        for (let i = 0; ; i++) { // 'wx': hai lần tải cùng tên song song không ghi đè nhau
          const f = path.join(dir, W.freeName(dir, name));
          if (!W.inWorkspace(ws, f)) throw fail('Đích không nằm trong Kho', 400);
          let w;
          try { w = fs.createWriteStream(f, { flags: 'wx' }); await new Promise((ok, bad) => { w.once('open', ok); w.once('error', bad); }); }
          catch (e) { if (e.code === 'EEXIST' && i < 20) continue; throw e; }
          try { await pipeline(req, w); } catch { fs.rmSync(f, { force: true }); throw fail('Tải lên bị ngắt, chưa lưu file', 400); }
          if (req.aborted || req.readableAborted) { fs.rmSync(f, { force: true }); throw fail('Tải lên bị ngắt, chưa lưu file', 400); }
          return ctx.json(res, { rel: W.relTo(ws, f), name: path.basename(f), size: fs.statSync(f).size }), true;
        }
      }
    } catch (e) {
      if (!e.status || e.status >= 500) console.error('kho:', e.message);
      return ctx.json(res, { error: shortErr(e.message, 'Lỗi Kho') }, e.status || 500), true;
    }
    return false;
  };
};
