// S29 M212 · Nướng hiệu chỉnh clip (phông xanh, LUT .cube, HSL, curves, ổn định hình) qua job nền `bake` của scripts/queue.mjs
// (scripts/bake_job.mjs, lõi engine/bake.js; feature studio/features/86_bake.js).
//   GET  /api/bake?hash=<16 hex>   → { ready: { seq, p540, n } | null, job }   job: việc `bake` mới nhất của hash đó
//   POST /api/bake { spec }        → { ok, ready } khi đã nướng, không thì { ok, item } (xếp việc; trùng việc đang chờ thì trả việc đó)
//   POST /api/bake/lut { name, text } → { ok, file, name }  lưu .cube vào .studio/bake/luts/<sha>.cube của dự án (không ghi ngoài dự án)
// Huỷ: POST /api/autopilot/item { id, action: 'cancel' } như mọi việc của hàng đợi. Không ghi timeline.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { addItem, loadQueue } from '../../scripts/queue.mjs';
import { checkSpec, readResult, HASH } from '../../scripts/bake_job.mjs';

const B = createRequire(import.meta.url)('../../engine/bake.js');
const same = (a, b) => path.resolve(String(a || '')).toLowerCase() === path.resolve(String(b || '')).toLowerCase();
export function lastJob(dir, hash) {
  try { return loadQueue().items.filter(x => x.kind === 'bake' && same(x.input, dir) && x.opts?.spec?.hash === hash).pop() || null; } catch { return null; }
}
const jobOf = j => j && { id: j.id, state: j.state, step: j.step, progress: j.progress, error: j.error };

export default ctx => async (req, res, p, u) => {
  if (p !== '/api/bake' && p !== '/api/bake/lut') return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  try {
    const dir = ctx.project?.dir; if (!dir) return J({ error: 'Chưa mở dự án' }, 400);
    if (p === '/api/bake/lut') {
      if (req.method !== 'POST') return false;
      const b = await ctx.body(req);
      if (!B.cubeOk(b?.text)) return J({ error: 'File .cube không hợp lệ (cần LUT_3D_SIZE 2–65 và đủ dòng màu)' }, 400);
      const sha = crypto.createHash('sha1').update(b.text).digest('hex').slice(0, 16);
      const rel = `${B.DIR}/luts/${sha}.cube`, f = path.join(dir, ...rel.split('/'));
      fs.mkdirSync(path.dirname(f), { recursive: true });
      if (!fs.existsSync(f)) fs.writeFileSync(f, b.text);
      const name = String(b.name || 'LUT').replace(/[^\p{L}\p{N} ._()-]+/gu, '').slice(0, 60) || 'LUT';
      return J({ ok: true, file: rel, name });
    }
    if (req.method === 'GET') {
      const hash = u.searchParams.get('hash') || '';
      if (!HASH.test(hash)) return J({ error: 'hash lạ' }, 400);
      return J({ ready: readResult(dir, hash), job: jobOf(lastJob(dir, hash)) });
    }
    if (req.method !== 'POST') return false;
    const sp = checkSpec(dir, (await ctx.body(req))?.spec);
    const ready = readResult(dir, sp.hash);
    if (ready) return J({ ok: true, ready });
    const j = lastJob(dir, sp.hash); if (j && ['queued', 'running'].includes(j.state)) return J({ ok: true, item: jobOf(j) });
    const spec = { seq: sp.seq, fps: sp.fps, n0: sp.n0, n1: sp.n1, ops: sp.ops, hash: sp.hash };
    return J({ ok: true, item: jobOf(addItem({ kind: 'bake', input: dir, opts: { spec }, source: 'ui' })) });
  } catch (e) { return J({ error: String(e.message || e).slice(0, 300) }, e.status || 400); }
};
