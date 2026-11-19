// S27 M189: mẫu của thương hiệu. Mẫu người dùng (templates/user/<id>.json) mang `brand_id`; thư viện mẫu xếp mẫu của thương hiệu
// đang mở lên đầu (studio/library.js), trang chủ đếm mẫu theo thương hiệu (02_onboarding.js).
//   POST /api/templates/brand {id, brand}  → {ok, id, brand_id}  gán ('' = bỏ gán) mẫu người dùng cho một thương hiệu đã có.
//   Chỉ mẫu trong templates/user/ (mẫu có sẵn của repo không đổi); id chỉ gồm chữ thường, số, '-', '_'; thương hiệu lạ → 404.
// Lưu thành mẫu (POST /api/templates/save) gửi `brand_id` trong chính mẫu, không qua route này.
import fs from 'node:fs';
import path from 'node:path';
import * as W from '../../scripts/workspace.mjs';

const ID = /^[a-z0-9][a-z0-9_-]{0,80}$/;
const brandIds = () => { try { return (JSON.parse(fs.readFileSync(path.join(W.AVS_HOME(), 'brands.json'), 'utf8')).brands || []).map(b => b.id); } catch { return []; } };

// Hàm thuần cho test (scripts/tests/s27_m189.test.mjs): dir = templates/user, known = id các thương hiệu đang có.
export function setTemplateBrand(dir, id, brand, known) {
  id = String(id ?? ''); brand = String(brand ?? '');
  if (!ID.test(id)) return { error: 'Mẫu không hợp lệ', status: 400 };
  if (brand && !known.includes(brand)) return { error: 'Không thấy thương hiệu', status: 404 };
  const f = path.join(dir, id + '.json');
  let t; try { t = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { error: 'Chỉ gán được mẫu của bạn (Lưu thành mẫu, Tạo style)', status: 404 }; }
  if (!t || typeof t !== 'object' || Array.isArray(t)) return { error: 'Mẫu hỏng', status: 409 };
  if (brand) t.brand_id = brand; else delete t.brand_id;
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(t, null, 1)); fs.renameSync(tmp, f);
  return { ok: true, id, brand_id: brand };
}

export default ctx => async (req, res, p) => {
  if (p !== '/api/templates/brand') return false;
  if (req.method !== 'POST') return (ctx.json(res, { error: 'not found' }, 404), true);
  try {
    const b = await ctx.body(req);
    const r = setTemplateBrand(path.join(ctx.SKILL, 'templates', 'user'), b?.id, b?.brand, brandIds());
    const { status, ...out } = r;
    ctx.json(res, out, status || 200);
  } catch (e) { ctx.json(res, { error: e.message }, e.status || 500); }
  return true;
};
