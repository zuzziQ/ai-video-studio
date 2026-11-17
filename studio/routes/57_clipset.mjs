// S18 M128: "Cùng bộ" — dự án đang mở thuộc một lần cắt clip từ video dài (thư mục cha có highlights.json) thì liệt kê cả bộ
// để chuyển sang clip khác mà không phải quay lại tab Cắt clip. Đường dẫn clip lấy từ file trên máy (thư mục cha + tên thư mục
// trong highlights.json), không nhận đường dẫn từ trình duyệt; Kho bị dời chỗ vẫn tìm đúng.
//   GET  /api/clipset            → {set: null} | {set: {name, dir, n, cur, items: [{i, title, hook, score, dur, thumbUrl, exported, current, exists}]}}
//   POST /api/clipset/open {i, keep?} → lưu ở trình duyệt trước; server mở clip thứ i của bộ đang mở. S18 M129: thay tab đang xem tại
//                                  chỗ (nhóm tab của bộ không phình ra); keep: chỉ thêm tab (mở ở cửa sổ mới) → {ok, id}
import fs from 'node:fs';
import path from 'node:path';
import { readExports } from '../../scripts/exports_log.mjs';

const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const key = d => { const r = path.resolve(d); return process.platform === 'win32' ? r.toLowerCase() : r; };
const furl = f => f && fs.existsSync(f) ? `/api/longform/file?p=${encodeURIComponent(f)}&v=${Math.round(fs.statSync(f).mtimeMs)}` : null;

/** Bộ clip chứa `projectDir` (hoặc null). Hàm thuần trên hệ thống file, test được không cần server. */
export function clipSet(projectDir) {
  if (!projectDir) return null;
  const parent = path.dirname(path.resolve(projectDir));
  const list = rd(path.join(parent, 'highlights.json'));
  if (!Array.isArray(list) || !list.length) return null;
  const items = list.map((it, i) => {
    const name = path.basename(String(it?.dir || ''));
    const dir = name ? path.join(parent, name) : null;
    const exists = !!dir && fs.existsSync(path.join(dir, 'timeline.json'));
    const out = dir && path.join(dir, 'out');
    let exported = false;
    try { exported = readExports(dir).length > 0 || fs.readdirSync(out).some(f => f.endsWith('.mp4') && !f.includes('.part')); } catch {}
    return { i, dir, title: String(it?.title || name || `Clip ${i + 1}`).slice(0, 120), hook: String(it?.hook || '').slice(0, 80),
      score: Number.isFinite(+it?.score) ? Math.round(+it.score) : null, dur: +it?.dur || 0,
      thumb: dir && path.join(dir, '.studio/thumb.jpg'), exported, exists, current: !!dir && key(dir) === key(projectDir) };
  });
  const cur = items.findIndex(x => x.current);
  if (cur < 0) return null; // thư mục cha có highlights.json nhưng dự án này không thuộc bộ
  const src = rd(path.join(parent, 'source.json'));
  return { name: path.basename(parent).replace(/ - clip ngắn( \(\d+\))?$/, ''), dir: parent, n: items.length, cur, source: src?.name || '', items };
}

export default ctx => async (req, res, p) => {
  if (p !== '/api/clipset' && p !== '/api/clipset/open') return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  try {
    const set = clipSet(ctx.project?.dir);
    if (p === '/api/clipset' && req.method === 'GET') {
      if (!set) return J({ set: null });
      return J({ set: { ...set, items: set.items.map(({ dir, thumb, ...x }) => ({ ...x, thumbUrl: furl(thumb) })) } });
    }
    if (p === '/api/clipset/open' && req.method === 'POST') {
      const b = await ctx.body(req), it = set && Number.isInteger(b?.i) ? set.items[b.i] : null;
      if (!it) return J({ ok: false, error: 'Không thấy clip này trong bộ' }, 400);
      if (!it.exists) return J({ ok: false, error: 'Thư mục clip không còn trên máy' }, 404);
      if (b.keep === true && ctx.tabs) return J({ ok: true, id: ctx.tabs.open(it.dir).id }); // cửa sổ mới: trang này giữ nguyên dự án
      const old = ctx.pid, job = ctx.job;
      // thay tab đang xem tại chỗ; tab cũ đang chạy tác vụ (xuất…) thì giữ lại, thêm tab mới
      const id = ctx.openProject(it.dir, old && !(job?.state === 'running' && job.tab === old) ? { replace: old } : undefined);
      return J({ ok: true, id });
    }
    return false;
  } catch (e) { return J({ ok: false, error: e.message }, e.status || 500); }
};
