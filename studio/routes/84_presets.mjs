// S29 M211: preset người dùng (chuyển cảnh + tham số, hoạt ảnh clip, hoạt ảnh Vào / Ra / Lặp, màu, kiểu chữ) ở
// $AVS_HOME/presets.json — dùng chung mọi dự án, có brand_id tuỳ chọn (M189). Lõi kiểm dữ liệu: studio/features/84_presets.core.js.
//   GET  /api/presets               → {items: [{id, kind, name, value, brand_id?, at}]}
//   POST /api/presets {kind, name, value, brand_id?, id?} → {ok, item, items} · 400 dữ liệu sai
//   POST /api/presets/delete {id}   → {ok, items} · 404 không thấy
// Đọc-sửa-ghi dưới khoá withFileLock(presets.json.lock), ghi qua tệp tạm rồi đổi tên (tắt máy giữa chừng không hỏng file cũ).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { AVS_HOME } from '../security.mjs';
import { retryBusy, withFileLock } from '../../scripts/file_lock.mjs';

const PC = createRequire(import.meta.url)('../features/84_presets.core.js');
const FILE = () => path.join(AVS_HOME(), 'presets.json');
const load = () => { try { return PC.parse(JSON.parse(fs.readFileSync(FILE(), 'utf8'))); } catch { return []; } };
function store(items) {
  const f = FILE(), tmp = `${f}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, items }, null, 1));
  retryBusy(() => fs.renameSync(tmp, f));
}
const mutate = fn => withFileLock(FILE() + '.lock', () => { const list = load(); const r = fn(list); store(r.items); return r; });

export default ctx => async (req, res, p) => {
  if (p !== '/api/presets' && p !== '/api/presets/delete') return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  if (req.method === 'GET' && p === '/api/presets') return J({ items: load() });
  if (req.method !== 'POST') return false;
  const body = await ctx.body(req);
  try {
    if (p === '/api/presets') {
      const item = PC.clean(body);
      if (!item.id) item.id = 'p' + crypto.randomBytes(5).toString('hex');
      const r = mutate(list => { const items = PC.upsert(list, item); return { items, item: items.find(x => x.id === item.id) }; });
      return J({ ok: true, ...r });
    }
    const id = String(body?.id || '');
    const r = mutate(list => { if (!list.some(x => x.id === id)) throw Object.assign(new Error('Không thấy preset'), { status: 404 }); return { items: list.filter(x => x.id !== id) }; });
    return J({ ok: true, items: r.items });
  } catch (e) {
    return J({ error: e.message }, e.status || (e.code ? 500 : 400));
  }
};
