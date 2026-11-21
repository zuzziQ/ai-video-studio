// Lõi thuần: điền graphic sản phẩm từ hồ sơ Product Brain của dự án (TL.ads.product, references/products.md).
// Công thức gói review và "AI dựng giúp" đặt khối rv_product với tên lấy từ tiêu đề video (thường là tên file) hoặc chữ Claude tự
// nghĩ; ở đây tên, thương hiệu, giá, ảnh lấy từ hồ sơ. "Điểm mạnh" chỉ lấy claim ĐÃ DUYỆT còn hạn (cùng luật effectiveStatus của
// scripts/products.mjs và ad_gates.py): claim chờ duyệt không bao giờ thành chữ khẳng định trên màn hình.
// Chỉ điền khối do máy dựng (_recipe, _ai, _auto) và mỗi khối một lần (cờ _prod = id hồ sơ): người dùng sửa tay sau đó thì giữ.
// Chạy trong trình duyệt (window.ProductsCore, features/53_products.js + 87_prodimg.js) và trong Node (scripts/ai_edit.mjs,
// scripts/autopilot.mjs, scripts/tests/product_fill.test.mjs).
'use strict';
(function (root) {
  const PLACEHOLDER = /^(ưu điểm|nhược điểm)\s*\d+$/i, POINT_MAX = 48;
  const str = v => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
  const machine = s => !!(s && (s._recipe || s._ai || s._auto));

  /** Claim đã duyệt còn hiệu lực hôm nay (approved + có bằng chứng + chưa quá expires). */
  function approvedClaims(p, today = new Date().toISOString().slice(0, 10)) {
    return (Array.isArray(p?.claims) ? p.claims : []).filter(c => c && c.status === 'approved' && str(c.evidence) && !(c.expires && c.expires < today) && str(c.text));
  }

  /** Hồ sơ → dữ liệu hiển thị của graphic sản phẩm. image: đường dẫn trong dự án (media/…) nếu đã có. */
  function heroOf(p, { today, image, logo } = {}) {
    if (!p || !str(p.name)) return null;
    const ok = approvedClaims(p, today);
    const pending = (Array.isArray(p.claims) ? p.claims : []).filter(c => c && c.status === 'pending').length;
    return { id: str(p.id), name: str(p.name), brand: str(p.brand), price: str(p.price), image: str(image || ''), logo: str(logo || ''), points: ok.map(c => str(c.text)), pending };
  }

  const TYPES = new Set(['rv_product', 'rv_proscons', 'rv_specs_vs']);
  const wants = s => !!(s && TYPES.has(s.type) && machine(s));

  /** Điền một cảnh. oldNames: tên rv_product trước khi điền (để nhận ra tên giữ chỗ ở rv_specs_vs). → true nếu có đổi. */
  // force: người dùng bấm "Điền lại theo hồ sơ" trên đúng khối này (kể cả khối tự thêm hoặc đã điền)
  function fillScene(s, h, oldNames = new Set(), force = false) {
    if (!h || !s || !TYPES.has(s.type)) return false;
    if (!force && (!machine(s) || s._prod === h.id)) return false;
    if (s.type === 'rv_product') {
      s.name = h.name;
      if (h.brand) s.brand = h.brand;
      if (h.price) s.price = h.price;
      else delete s.price; // giá Claude / ví dụ tự nghĩ không có trong hồ sơ: không hiện
      delete s.old_price; // hồ sơ không có giá cũ: giá gạch là số tự nghĩ
      delete s.badge; // nhãn "MỚI", "SỐ 1"… không có trong hồ sơ: dễ thành claim chưa duyệt
      if (h.logo) s.logo = h.logo; else if (/^si:/.test(str(s.logo))) delete s.logo; // logo ví dụ (si:samsung) không phải của sản phẩm
      if (h.image && !s.image) s.image = h.image;
    } else if (s.type === 'rv_proscons') {
      const pros = Array.isArray(s.pros) ? s.pros : [];
      // claim đã duyệt giữ NGUYÊN VĂN (cắt bớt dễ đổi nghĩa, claim gate so theo chữ): chỉ lấy câu vừa ô
      const fit = h.points.filter(x => x.length <= POINT_MAX).slice(0, 3);
      if (!(pros.length && pros.every(x => PLACEHOLDER.test(str(x)))) || !fit.length) return false;
      s.pros = fit;
    } else if (s.type === 'rv_specs_vs') {
      const a = s.a && typeof s.a === 'object' ? s.a : null;
      if (!a || !(oldNames.has(str(a.name)) || !str(a.name))) return false;
      a.name = h.name;
      if (h.image && !a.image) a.image = h.image;
    }
    s._prod = h.id;
    return true;
  }

  /** Điền mọi cảnh máy dựng của dự án. → số cảnh đã đổi. */
  function fillScenes(scenes, h) {
    if (!h || !Array.isArray(scenes)) return 0;
    const oldNames = new Set(scenes.filter(s => s && s.type === 'rv_product' && s._prod !== h.id).map(s => str(s.name)).filter(Boolean));
    let n = 0;
    for (const s of scenes) if (fillScene(s, h, oldNames)) n++;
    return n;
  }

  /** Còn khối sản phẩm máy dựng chưa điền theo hồ sơ này không (để client khỏi gọi API khi không cần). */
  const needsFill = (scenes, id) => (Array.isArray(scenes) ? scenes : []).some(s => wants(s) && s._prod !== id);

  /** Đoạn prompt cho Claude (scripts/ai_edit.mjs buildPrompt). */
  function promptBlock(h) {
    if (!h) return '';
    const pts = h.points.length ? h.points.map(x => `- ${x}`).join('\n') : '(chưa có claim nào được duyệt)';
    return `
# Sản phẩm của video (hồ sơ sản phẩm của người dùng)
Tên: ${h.name}${h.brand ? ` · Thương hiệu: ${h.brand}` : ''}${h.price ? ` · Giá: ${h.price}` : ''}${h.image ? ' · có ảnh sản phẩm' : ''}
Điểm mạnh ĐÃ DUYỆT (chỉ được khẳng định đúng các ý này trên màn hình):
${pts}
LUẬT SẢN PHẨM: khi giới thiệu sản phẩm dùng cảnh "rv_product" (nếu có trong danh sách); phần mềm tự điền tên, thương hiệu, giá, ảnh theo hồ sơ, bạn không cần viết. Không đặt tên sản phẩm khác, không tự nghĩ giá hay giá cũ. ${h.pending ? `Hồ sơ còn ${h.pending} claim CHỜ DUYỆT: không viết chúng thành chữ khẳng định trên graphic.` : ''}
`;
  }

  /** Chữ có số lấy từ hồ sơ (giá, claim đã duyệt): ai_edit coi như "đã nói" khi soát số tự nghĩ. */
  const factText = h => (h ? [h.name, h.price, ...h.points].filter(Boolean).join(' ') : '');

  const T = { heroOf, approvedClaims, fillScene, fillScenes, needsFill, promptBlock, factText, TYPES };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.ProductsCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
