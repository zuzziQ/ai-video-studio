// Product Brain (ROADMAP M18, references/products.md): hồ sơ sản phẩm dùng chung ở $AVS_HOME/products/<id>.json.
//   GET  /api/products            → [{id, name, brand, industry, claims:{approved,pending,prohibited,expired}, blocked, faq}]
//   GET  /api/products/<id>       → hồ sơ đầy đủ (kèm `image` khi có ảnh)
//   POST /api/products/save {product}  → ghi (không có id = tạo mới); claim đã duyệt thiếu bằng chứng → 400
//   POST /api/products/delete {id}  → xoá luôn thư mục products/<id>/ (ảnh)
//   POST /api/products/image?id=  (thân = ảnh PNG/JPG/WebP thô, ≤ 8 MB, kiểm byte đầu) → hồ sơ có `image`; quá cỡ → 413
//   GET  /api/products/image?id=  → ảnh của hồ sơ; không có → 404
//   POST /api/products/use-image {id} → chép ảnh hồ sơ vào media/product_<id>.<ext> của dự án đang mở → {image: rel | ''}
// Như mọi /api/*, cần token phiên (studio/security.mjs). Id ngoài [a-z0-9_-] → 400; file trỏ ra ngoài products/ → 403.
import { productsDir, listProducts, loadProduct, saveProduct, deleteProduct, saveProductImage, productImage, copyProductImage, IMAGE_MAX, ProductError } from '../../scripts/products.mjs';

// thân ảnh thô, dừng đọc khi quá IMAGE_MAX (bodyStatus đã chặn Content-Length quá trần upload chung)
function readImage(req) {
  return new Promise((ok, bad) => {
    if (+(req.headers['content-length'] || 0) > IMAGE_MAX) { req.resume(); return bad(new ProductError('ảnh sản phẩm tối đa 8 MB', 413)); }
    const parts = []; let n = 0, over = false;
    req.on('data', c => { if (over) return; n += c.length; if (n > IMAGE_MAX) { over = true; parts.length = 0; return; } parts.push(c); });
    req.on('error', bad);
    req.on('end', () => (over ? bad(new ProductError('ảnh sản phẩm tối đa 8 MB', 413)) : ok(Buffer.concat(parts))));
  });
}

export default ctx => async (req, res, p, u) => {
  if (p !== '/api/products' && !p.startsWith('/api/products/')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  const dir = ctx.productsDir || productsDir();
  try {
    if (p === '/api/products/image') {
      const id = u.searchParams.get('id') || '';
      if (req.method === 'POST') return J(saveProductImage(id, await readImage(req), dir));
      if (req.method !== 'GET') return false;
      const img = productImage(id, dir);
      return img ? (ctx.sendFile(req, res, img.file), true) : J({ error: 'hồ sơ chưa có ảnh' }, 404);
    }
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
    if (p === '/api/products/use-image') {
      if (!ctx.project?.dir) return J({ error: 'Chưa mở dự án' }, 400);
      return J({ image: copyProductImage(ctx.project.dir, String(b.id ?? ''), dir) });
    }
    return false;
  } catch (e) {
    if (e.status) return J({ error: e.message }, e.status);
    return J({ error: `hồ sơ sản phẩm hỏng: ${e.message}` }, 500);
  }
};
