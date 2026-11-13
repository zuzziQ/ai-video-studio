// Product Brain (ROADMAP M18, references/products.md): hồ sơ sản phẩm dùng chung ở $AVS_HOME/products/<id>.json.
//   GET  /api/products            → [{id, name, brand, industry, claims:{approved,pending,prohibited,expired}, blocked, faq}]
//   GET  /api/products/<id>       → hồ sơ đầy đủ
//   POST /api/products/save {product}  → ghi (không có id = tạo mới); claim đã duyệt thiếu bằng chứng → 400
//   POST /api/products/delete {id}
// Như mọi /api/*, cần token phiên (studio/security.mjs). Id ngoài [a-z0-9_-] → 400; file trỏ ra ngoài products/ → 403.
import { productsDir, listProducts, loadProduct, saveProduct, deleteProduct } from '../../scripts/products.mjs';

export default ctx => async (req, res, p) => {
  if (p !== '/api/products' && !p.startsWith('/api/products/')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  const dir = ctx.productsDir || productsDir();
  try {
    if (req.method === 'GET') {
      if (p === '/api/products') return J(listProducts(dir));
      let id = p.slice('/api/products/'.length);
      try { id = decodeURIComponent(id); } catch { /* chuỗi % hỏng: để loadProduct báo id không hợp lệ */ }
      return J(loadProduct(id, dir));
    }
    if (req.method !== 'POST') return false;
    const b = await ctx.body(req);
    if (p === '/api/products/save') return J(saveProduct(b.product || {}, dir));
    if (p === '/api/products/delete') return J(deleteProduct(b.id, dir));
    return false;
  } catch (e) {
    if (e.status) return J({ error: e.message }, e.status);
    return J({ error: `hồ sơ sản phẩm hỏng: ${e.message}` }, 500);
  }
};
