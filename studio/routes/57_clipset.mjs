// S18 M128: "Cùng bộ" — dự án đang mở thuộc một lần cắt clip từ video dài (thư mục cha có highlights.json) thì liệt kê cả bộ
// để chuyển sang clip khác mà không phải quay lại tab Cắt clip. Đường dẫn clip lấy từ file trên máy (thư mục cha + tên thư mục
// trong highlights.json), không nhận đường dẫn từ trình duyệt; Kho bị dời chỗ vẫn tìm đúng.
//   GET  /api/clipset            → {set: null} | {set: {name, dir, n, cur, items: [{i, title, hook, score, dur, thumbUrl, exported, current, exists}]}}
//   POST /api/clipset/open {i, keep?} → lưu ở trình duyệt trước; server mở clip thứ i của bộ đang mở. S18 M129: thay tab đang xem tại
//                                  chỗ (nhóm tab của bộ không phình ra); keep: chỉ thêm tab (mở ở cửa sổ mới) → {ok, id}
//   POST /api/clipset/apply {held?, only?, apply?} → S19 M135 "Áp cho các clip còn lại": so clip đang mở với bản máy giao, áp các thay đổi
//                                  đếm được sang clip khác của bộ (scripts/set_apply.mjs). Không `apply` = chỉ xem trước. `held`: mã các tab
//                                  trình duyệt đang giữ khoá Web Locks (M131, navigator.locks.query) → clip đó bỏ qua; `only`: chỉ số clip
//                                  được chọn. → {ok, from, ops, notes, clips: [{i, title, n, what, skip?, done?}], applied}
import fs from 'node:fs';
import path from 'node:path';
import { readExports } from '../../scripts/exports_log.mjs';
import { captureBase, planSet } from '../../scripts/set_apply.mjs';
import { ID_RE, tabId } from '../tabs.mjs';

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
  if (p !== '/api/clipset' && p !== '/api/clipset/open' && p !== '/api/clipset/apply') return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  try {
    const set = clipSet(ctx.project?.dir);
    if (p === '/api/clipset' && req.method === 'GET') {
      if (!set) return J({ set: null });
      for (const it of set.items) if (it.exists) try { captureBase(it.dir); } catch { /* chỉ mất bản so cho M135 */ }
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
    if (p === '/api/clipset/apply' && req.method === 'POST') {
      if (!set) return J({ ok: false, error: 'Dự án đang mở không thuộc bộ clip nào' }, 400);
      const b = (await ctx.body(req)) || {};
      const held = new Set((Array.isArray(b.held) ? b.held : []).filter(x => typeof x === 'string' && ID_RE.test(x)).slice(0, 64));
      const only = Array.isArray(b.only) ? b.only.filter(Number.isInteger) : null;
      const job = ctx.job;
      const skip = it => { const id = tabId(it.dir);
        if (held.has(id)) return 'đang mở ở tab khác';
        if (job?.state === 'running' && job.tab === id) return 'đang chạy tác vụ (' + (job.step || job.kind || '') + ')';
        return ''; };
      return J({ ok: true, ...planSet(set, { skip, only, write: b.apply === true }) });
    }
    return false;
  } catch (e) { return J({ ok: false, error: e.message }, e.status || 500); }
};
