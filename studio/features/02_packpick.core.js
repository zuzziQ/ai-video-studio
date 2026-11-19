// Lõi thuần chọn gói style mặc định cho "Video mới" (S26 M181): thương hiệu đã có pack thì dùng; chưa thì gói đã chọn lần trước;
// chưa có nữa thì gói theo lĩnh vực chọn ở hướng dẫn đầu (onboarding.json purpose); cuối cùng gói đầu danh sách. Không đụng DOM.
// Chạy trong trình duyệt (window.PackPick) và trong Node (module.exports) cho scripts/tests/s26_m181.test.mjs.
'use strict';
(function (root) {
  // lĩnh vực (PURPOSES ở 02_onboarding.js) → id gói trong engine/packs; gói không có recipe trong danh sách thì bỏ qua
  const PURPOSE_PACK = { bds: 'realestate', khoahoc: 'course', banhang: 'kinetic', review: 'review', chiase: 'share', tintuc: 'news', doanhnghiep: 'keynote' };

  /** packs: [{id, recipe?}] đã lọc có recipe; trả id gói mặc định. */
  function defaultPack({ brand, purpose, last, packs } = {}) {
    const ok = id => id && (packs || []).some(p => p.id === id);
    return [brand?.pack, last, PURPOSE_PACK[purpose]].find(ok) || packs?.[0]?.id || 'slate';
  }

  const T = { PURPOSE_PACK, defaultPack };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.PackPick = T;
})(typeof window !== 'undefined' ? window : globalThis);
