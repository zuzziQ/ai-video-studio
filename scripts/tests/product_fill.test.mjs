// M18: graphic sản phẩm (rv_product…) lấy tên, giá, ảnh từ hồ sơ Product Brain của dự án; claim chờ duyệt không thành chữ khẳng định.
// node --test scripts/tests/product_fill.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../../studio/features/53_products.core.js');

const PROFILE = {
  id: 'placenta-82x-c22c', name: 'Placenta 82X 450000 Sakura Premium', brand: '82x Beauty', price: '2.815.000đ', industry: 'supplements',
  claims: [
    { id: 'c1', text: 'Chứa 450.000mg chiết xuất nhau thai', status: 'pending', evidence: '' },
    { id: 'c2', text: 'Sản xuất tại Nhật Bản theo tiêu chuẩn GMP', status: 'approved', evidence: 'Giấy GMP 2026' },
    { id: 'c3', text: 'Tem chống giả có QR', status: 'approved', evidence: '' }, // thiếu bằng chứng: không tính
    { id: 'c4', text: 'Giao nhanh 2 giờ', status: 'approved', evidence: 'Hợp đồng vận chuyển', expires: '2020-01-01' }, // quá hạn
  ],
};
// cảnh do công thức gói review dựng: tên = tiêu đề dự án (tên file video)
const recipeScenes = () => [
  { type: 'rv_product', t0: 0, t1: 3, image: '', name: 'snaptik.vn_7535031826797071624', brand: '82x Beauty', logo: 'media/brand.jpg', price: '', _recipe: true },
  { type: 'rv_proscons', t0: 4, t1: 8, pros: ['Ưu điểm 1', 'Ưu điểm 2', 'Ưu điểm 3'], cons: ['Nhược điểm 1'], _recipe: true },
  { type: 'rv_specs_vs', t0: 9, t1: 12, a: { name: 'snaptik.vn_7535031826797071624', image: '' }, b: { name: 'Đối thủ' }, _recipe: true },
  { type: 'rv_score', t0: 20, t1: 24, score: 8.5, _recipe: true },
];

test('heroOf: chỉ claim đã duyệt, có bằng chứng, còn hạn là điểm mạnh; đếm claim chờ duyệt', () => {
  const h = C.heroOf(PROFILE, { today: '2026-11-21', logo: 'media/brand.jpg', image: 'media/sp.png' });
  assert.equal(h.name, PROFILE.name); assert.equal(h.price, '2.815.000đ'); assert.equal(h.brand, '82x Beauty');
  assert.deepEqual(h.points, ['Sản xuất tại Nhật Bản theo tiêu chuẩn GMP']);
  assert.equal(h.pending, 1); assert.equal(h.image, 'media/sp.png'); assert.equal(h.logo, 'media/brand.jpg');
  assert.equal(C.heroOf({ name: '' }), null);
});

test('fillScenes: khối của công thức gói lấy tên, giá, ảnh của hồ sơ; điền một lần, chữ người dùng sửa sau đó được giữ', () => {
  const h = C.heroOf(PROFILE, { today: '2026-11-21', image: 'media/sp.png' }), sc = recipeScenes();
  assert.equal(C.needsFill(sc, h.id), true);
  assert.equal(C.fillScenes(sc, h), 3);
  assert.equal(sc[0].name, PROFILE.name); assert.equal(sc[0].price, '2.815.000đ'); assert.equal(sc[0].image, 'media/sp.png'); assert.equal(sc[0]._prod, h.id);
  assert.deepEqual(sc[1].pros, ['Sản xuất tại Nhật Bản theo tiêu chuẩn GMP']);
  assert.equal(sc[2].a.name, PROFILE.name); assert.equal(sc[2].a.image, 'media/sp.png'); assert.equal(sc[2].b.name, 'Đối thủ');
  assert.equal(sc[3]._prod, undefined);
  sc[0].name = 'Tên tôi tự sửa';
  assert.equal(C.needsFill(sc, h.id), false);
  assert.equal(C.fillScenes(sc, h), 0); assert.equal(sc[0].name, 'Tên tôi tự sửa');
  // "Điền lại theo hồ sơ" trên đúng khối đó
  assert.equal(C.fillScene(sc[0], h, undefined, true), true); assert.equal(sc[0].name, PROFILE.name);
});

test('fillScene: không đè ảnh đã chọn, bỏ giá cũ / nhãn / logo ví dụ do máy tự nghĩ; khối người dùng tự thêm không bị điền tự động', () => {
  const h = C.heroOf({ ...PROFILE, price: '' }, { logo: '' });
  const ai = { type: 'rv_product', name: 'Galaxy S25 Ultra', brand: 'Samsung', logo: 'si:samsung', price: '27.990.000đ', old_price: '33.990.000đ', badge: 'SỐ 1', image: 'media/da_chon.png', _ai: true };
  assert.equal(C.fillScene(ai, h), true);
  assert.equal(ai.name, PROFILE.name); assert.equal(ai.brand, '82x Beauty'); assert.equal(ai.image, 'media/da_chon.png');
  for (const k of ['price', 'old_price', 'badge', 'logo']) assert.equal(k in ai, false, k);
  const mine = { type: 'rv_product', name: 'Của tôi', price: '1đ' };
  assert.equal(C.fillScene(mine, h), false); assert.equal(mine.name, 'Của tôi');
});

test('không có claim đã duyệt: ô ưu điểm giữ chỗ không bị điền claim chờ duyệt', () => {
  const h = C.heroOf({ ...PROFILE, claims: PROFILE.claims.filter(c => c.status === 'pending') });
  const sc = recipeScenes();
  C.fillScenes(sc, h);
  assert.deepEqual(sc[1].pros, ['Ưu điểm 1', 'Ưu điểm 2', 'Ưu điểm 3']);
  assert.doesNotMatch(JSON.stringify(sc), /450\.000mg/);
});

test('promptBlock: tên, giá, điểm mạnh đã duyệt; claim chờ duyệt chỉ được đếm, không liệt kê', () => {
  const p = C.promptBlock(C.heroOf(PROFILE, { today: '2026-11-21' }));
  assert.match(p, /Placenta 82X 450000 Sakura Premium/); assert.match(p, /2\.815\.000đ/); assert.match(p, /Nhật Bản/);
  assert.match(p, /1 claim CHỜ DUYỆT/); assert.doesNotMatch(p, /nhau thai/);
  assert.equal(C.promptBlock(null), '');
});

test('productHero: đọc hồ sơ theo timeline.ads.product, logo của bộ thương hiệu dự án', async () => {
  const { productHero, saveProduct } = await import('../products.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-pf-'));
  try {
    const saved = saveProduct({ name: 'Serum B5', price: '350.000đ', claims: [{ text: 'Dịu da', status: 'approved', evidence: 'Thử nội bộ' }] }, dir);
    const h = productHero('.', { ads: { product: saved.id }, brand: { logo: 'media/logo.png' } }, dir);
    assert.equal(h.name, 'Serum B5'); assert.equal(h.price, '350.000đ'); assert.equal(h.logo, 'media/logo.png'); assert.deepEqual(h.points, ['Dịu da']);
    assert.equal(productHero('.', { ads: {} }, dir), null);
    assert.throws(() => productHero('.', { ads: { product: 'khong-co' } }, dir), /không thấy/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('ai_edit validate: dự án có hồ sơ thì rv_product dùng được, giá hồ sơ không bị coi là số tự nghĩ, tên theo hồ sơ', async () => {
  const { validate, buildPrompt } = await import('../ai_edit.mjs');
  const ex = { type: 'rv_product', t0: 0, t1: 3, x: 360, y: 520, size: 100, image: '', name: 'Galaxy S25 Ultra', brand: 'Samsung', logo: 'si:samsung', price: '27.990.000đ', old_price: '33.990.000đ', badge: 'MỚI' };
  const cat = { packs: [{ id: 'review', name: 'Review', desc: '', items: [{ type: 'rv_product', label: 'Sản phẩm (hero)', ex }], base: [] }, { id: 'basic', name: 'Cơ bản', desc: '', items: [], base: [] }], captionStyles: ['review'] };
  const lib = { broll: [], sfx: [], music: [{ mood: 'tech' }], tpls: [] };
  const caps = [{ t0: 0, t1: 3, words: [{ w: 'sản', s: 0 }, { w: 'phẩm', s: .4 }, { w: 'mới', s: .8 }] }];
  const tl = { duration: 6, width: 1080, height: 1920 };
  const raw = { pack: 'review', scenes: [{ type: 'rv_product', c: 0, w: 0, dur: 3, params: { name: 'Kem dưỡng', price: '999.000đ' } }] };
  const none = validate(raw, { tl, caps, cat, lib, o: { pack: 'review' } });
  assert.equal(none.scenes.length, 0, 'không có hồ sơ: khối cần ảnh vẫn bị loại như cũ');
  const product = C.heroOf(PROFILE, { today: '2026-11-21', image: 'media/sp.png' });
  const o = { pack: 'review', product };
  const plan = validate(raw, { tl, caps, cat, lib, o });
  assert.equal(plan.scenes.length, 1, JSON.stringify(plan.dropped));
  const s = plan.scenes[0];
  assert.equal(s.name, PROFILE.name); assert.equal(s.price, '2.815.000đ'); assert.equal(s.image, 'media/sp.png');
  assert.equal(s.old_price, undefined); assert.equal(s.badge, undefined); assert.equal(s.logo, undefined);
  const prompt = buildPrompt({ tl, caps, cat, lib: { ...lib, tpls: [] }, o });
  assert.match(prompt, /rv_product \(Sản phẩm \(hero\)\)/); assert.match(prompt, /LUẬT SẢN PHẨM/);
});
