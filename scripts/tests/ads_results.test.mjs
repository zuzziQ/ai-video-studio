// Test M31 (nhập CSV kết quả Meta/TikTok, lift theo trục) và M32 (lô kế tiếp có trọng số, hook mới, nối feedback.mjs).
// Chạy: node --test scripts/tests/ads_results.test.mjs. CSV mẫu tự tạo ở scripts/tests/fixtures/ads_results/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-adsres-'));
process.env.AVS_HOME = HOME;
process.env.AVS_NO_NOTIFY = '1';
const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/ads_results');
const R = await import('../ads_results.mjs');
const M = await import('../variant_matrix.mjs');
test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const csv = f => fs.readFileSync(path.join(FX, f), 'utf8');
// trục của 7 bản (như manifest.json do ads_pack.mjs viết)
const AX = {
  'ab12-V01': { angle: 'demo', audience: 'new_buyers', hook: 'h1', hook_text: 'Hook một', narrative: 'how_to', format: 'full', duration: '15', voice: 'minh', music: 'upbeat' },
  'ab12-V02': { angle: 'demo', audience: 'loyal', hook: 'h1', hook_text: 'Hook một', narrative: 'faq', format: 'full', duration: '0', voice: 'minh', music: 'upbeat' },
  'ab12-V03': { angle: 'faq', audience: 'new_buyers', hook: 'h2', hook_text: 'Hook hai', narrative: 'how_to', format: 'split', duration: '15', voice: 'minh', music: 'calm' },
  'ab12-V04': { angle: 'faq', audience: 'loyal', hook: 'h2', hook_text: 'Hook hai', narrative: 'faq', format: 'split', duration: '0', voice: 'lan', music: 'calm' },
  'ab12-V05': { angle: 'tips', audience: 'new_buyers', hook: 'h3', hook_text: 'Hook ba', narrative: 'how_to', format: 'full', duration: '15', voice: 'lan', music: 'upbeat' },
  'ab12-V06': { angle: 'tips', audience: 'loyal', hook: 'h3', hook_text: 'Hook ba', narrative: 'faq', format: 'split', duration: '0', voice: 'lan', music: 'calm' },
  'ab12-V07': { angle: 'mistakes', audience: 'loyal', hook: 'h4', hook_text: 'Hook bốn', narrative: 'faq', format: 'full', duration: '0', voice: 'lan', music: 'calm' },
};
function base(name) {
  const d = path.join(HOME, name);
  fs.mkdirSync(path.join(d, 'out/ads/meta_20261101-0900'), { recursive: true });
  fs.writeFileSync(path.join(d, 'timeline.json'), JSON.stringify({ duration: 30, scenes: [] }));
  fs.writeFileSync(path.join(d, 'out/ads/meta_20261101-0900/manifest.json'), JSON.stringify({ kind: 'ads_pack', version: 1, platform: 'meta', batch: 'ab12',
    variants: Object.fromEntries(Object.entries(AX).map(([c, v]) => [c, { dir: `../${name}_v${+c.slice(-2)}`, pack: 'split', ...v, ads: [] }])) }));
  return d;
}

test('CSV và số: dấu phân cách, ngoặc kép, BOM, kiểu số Việt / Anh', () => {
  const rows = R.parseCsv('﻿a;b;c\r\n"x;y";"say ""hi""";3\r\n\r\n');
  assert.deepEqual(rows, [{ a: 'x;y', b: 'say "hi"', c: '3' }]);
  assert.deepEqual(R.parseCsv('a,b\n1,"dòng\nhai"\n'), [{ a: '1', b: 'dòng\nhai' }]);
  const cases = [['1,000,000', 1e6], ['1.200.000', 1.2e6], ['12.500', 12500], ['1.234,5', 1234.5], ['1,234.5', 1234.5], ['2,5', 2.5], ['0.75', 0.75], ['1.5', 1.5], ['12%', 12], ['-', null], ['', null], ['₫150000', 150000]];
  for (const [s, v] of cases) assert.equal(R.num(s), v, s);
  assert.equal(R.codeOf('serum-b5_meta_ab12-V01_9x16_15s'), 'ab12-V01');
  assert.equal(R.codeOf('https://shop.vd/?utm_content=AB12-v03&x=1'), 'ab12-V03');
  assert.equal(R.codeOf('Quảng cáo tay'), null);
});

test('nhập báo cáo Meta (EN) + TikTok: ghép mã bản, bỏ dòng tổng, mã lạ, không mã; nhập lại không cộng hai lần', () => {
  const d = base('serum');
  const m = R.importCsv(d, csv('meta_en.csv'), { file: 'meta_en.csv' });
  assert.equal(m.platform, 'meta');
  assert.equal(m.rows, 6); assert.equal(m.matched, 4);
  assert.deepEqual(m.unknown_codes, ['ffff-V09']); assert.deepEqual(m.no_code, ['Quảng cáo tay, không có mã']);
  assert.equal(m.columns.clicks, 'Link clicks'); assert.equal(m.columns.conversions, 'Purchases'); assert.equal(m.columns.spend, 'Amount spent (VND)');
  const t = R.importCsv(d, csv('tiktok.csv'), { file: 'tiktok.csv' });
  assert.equal(t.platform, 'tiktok'); assert.equal(t.matched, 3); assert.equal(t.skipped, 1);   // dòng "Total of 3 results"
  assert.equal(t.columns.clicks, 'Clicks (destination)');
  const st = R.loadStore(d);
  assert.equal(Object.keys(st.rows).length, 7);
  const v1 = Object.values(st.rows).find(r => r.code === 'ab12-V01');
  assert.deepEqual([v1.spend, v1.impressions, v1.clicks, v1.conversions, v1.revenue, v1.views_hook, v1.complete], [1e6, 10000, 300, 3, 900000, 4000, 1500]);
  assert.equal(st.variants['ab12-V04'].angle, 'faq');   // trục chụp lại lúc nhập
  R.importCsv(d, csv('meta_en.csv'), { file: 'meta_en.csv' });
  assert.equal(Object.keys(R.loadStore(d).rows).length, 7);
  assert.equal(R.loadStore(d).imports.length, 3);
  // báo cáo Meta tiếng Việt, chấm phẩy, số kiểu Việt; tuần khác → dòng mới cho V01
  const vi = R.importCsv(d, csv('meta_vi.csv'), { file: 'meta_vi.csv' });
  assert.equal(vi.platform, 'meta'); assert.equal(vi.matched, 1);
  const rows = Object.values(R.loadStore(d).rows).filter(r => r.code === 'ab12-V01');
  assert.equal(rows.length, 2); assert.equal(rows.find(r => r.start === '2026-11-08').impressions, 12500);
  assert.throws(() => R.importCsv(d, 'foo,bar\n1,2\n'), /Không nhận ra báo cáo/);
  assert.throws(() => R.importCsv(d, 'Ad name,Cost\nx,1\n'), /Thiếu cột lượt hiển thị/);
});

test('lift theo trục: n ≥ 2 mới thắng, bản ít hiển thị bị bỏ, KPI tự chọn, CPA nghịch đảo', () => {
  const d = base('lift');
  R.importCsv(d, csv('meta_en.csv')); R.importCsv(d, csv('tiktok.csv'));
  const st = R.loadStore(d);
  // CTR: V01 3%, V02 2,5%, V03 1%, V04 1%, V05 2%, V06 0,5% → trung bình 1,6667%
  const l = R.learnings(st, { kpi: 'ctr' });
  assert.equal(l.variants_with_data, 6);
  assert.deepEqual(l.low_data, [{ code: 'ab12-V07', impressions: 200 }]);
  assert.equal(l.mean, 0.0167);
  const lift = (d_, v) => l.dimensions[d_].find(x => x.value === v);
  assert.equal(lift('angle', 'demo').lift, 0.65); assert.equal(lift('angle', 'demo').n, 2); assert.equal(lift('angle', 'demo').label, 'Demo');
  assert.equal(lift('angle', 'faq').lift, -0.4);
  assert.equal(lift('audience', 'new_buyers').lift, 0.2);
  assert.equal(lift('duration', '15').lift, 0.2); assert.equal(lift('duration', '0').label, 'giữ độ dài gốc');
  assert.equal(lift('hook', 'h1').label, 'Hook một');
  assert.ok(l.dimensions.voice && l.dimensions.music && l.dimensions.narrative && l.dimensions.format);
  assert.deepEqual(l.winners.map(w => `${w.dimension}=${w.value}`).slice(0, 2).sort(), ['angle=demo', 'hook=h1']);
  assert.ok(l.winners.every(w => w.n >= 2 && w.lift > 0.1));
  assert.deepEqual(l.variants.map(v => v.code).slice(0, 2), ['ab12-V01', 'ab12-V02']);
  // một bản duy nhất cho một giá trị: không thắng dù lift cao
  const st1 = { ...st, variants: { ...st.variants, 'ab12-V01': { ...st.variants['ab12-V01'], music: 'solo' } } };
  const solo = R.learnings(st1, { kpi: 'ctr' }).dimensions.music.find(x => x.value === 'solo');
  assert.equal(solo.n, 1); assert.ok(solo.lift > 0.1);
  assert.ok(!R.learnings(st1, { kpi: 'ctr' }).winners.some(w => w.value === 'solo'));
  // có doanh thu → auto chọn roas; cpa: thấp là tốt, hiển thị tiền / chuyển đổi
  assert.equal(R.learnings(st).kpi, 'roas');
  const c = R.learnings(st, { kpi: 'cpa' });
  assert.equal(c.lower_is_better, true);
  assert.equal(c.variants[0].code, 'ab12-V01'); assert.equal(c.variants[0].kpi, 333333);   // 1.000.000 / 3
  assert.equal(c.variants.at(-1).code, 'ab12-V06');   // 0 chuyển đổi = tệ nhất
  assert.equal(R.learnings(st, { kpi: 'ctr', platform: 'tiktok' }).variants_with_data, 3);
  assert.throws(() => R.learnings(st, { kpi: 'likes' }), /KPI không hợp lệ/);
  assert.match(R.learnings(R.loadStore(base('empty'))).note, /Chưa có bản nào/);
  assert.match(R.learnText(l), /Thắng: .*angle=Demo \+65%/);
});

test('lô kế tiếp: trọng số 0,5–2 chỉ cho trục ma trận, hook thắng, tỷ lệ hook mới; ma trận nghiêng về yếu tố thắng', () => {
  const d = base('next');
  R.importCsv(d, csv('meta_en.csv')); R.importCsv(d, csv('tiktok.csv'));
  const l = R.learnings(R.loadStore(d), { kpi: 'ctr' }), w = R.weightsFromLearnings(l);
  assert.deepEqual(Object.keys(w).sort(), ['angle', 'audience', 'duration', 'format', 'narrative']);
  assert.equal(w.angle.demo, 1.65); assert.equal(w.angle.faq, 0.6); assert.equal(w.audience.new_buyers, 1.2);
  assert.ok(!('mistakes' in w.angle));   // V07 ít hiển thị
  for (const v of Object.values(w).flatMap(Object.values)) assert.ok(v >= 0.5 && v <= 2);
  const p = R.nextBatchPlan(d, { target: 20, kpi: 'ctr', explore: 0.2 });
  assert.equal(p.has_data, true); assert.deepEqual(p.preferred_hooks, ['h1']);
  assert.equal(p.fresh_slots, 4); assert.equal(p.new_hooks, 2);
  assert.equal(R.nextBatchPlan(d, { target: 100, kpi: 'ctr', explore: 0.3 }).new_hooks, 6);
  assert.equal(R.nextBatchPlan(d, { target: 10, kpi: 'ctr', explore: 0 }).new_hooks, 0);
  assert.deepEqual(Array.from({ length: 10 }, (_, i) => i).filter(i => R.freshSlot(i, 0.2)), [4, 9]);
  assert.equal(R.nextBatchPlan(base('nodata'), { target: 10 }).has_data, false);

  // planMatrix: cùng seed, có trọng số thì góc demo được chọn nhiều hơn faq
  const stats = { sources: 3, scenes: 12, tags: { demonstration: 2, hand: 2, packshot: 2, face: 1 } };
  const brief = M.matrixBrief({ ads: { matrix: { audiences: 'new_buyers,loyal', angles: 'demo,faq,tips', narratives: 'how_to,faq', formats: 'full,split' } } });
  const ctx = { duration: 30, ads: false, claims: [] }, count = (pl, a) => pl.chosen.filter(c => c.angle === a).length;
  const plain = M.planMatrix(brief, stats, ctx, 6), weighted = M.planMatrix(brief, stats, ctx, 6, { weights: p.weights });
  assert.ok(count(weighted, 'demo') > count(weighted, 'faq'), JSON.stringify(weighted.angle_distribution));
  assert.ok(count(weighted, 'demo') >= count(plain, 'demo'));
  assert.ok(weighted.angle_quota.demo > weighted.angle_quota.faq);   // góc thắng được nhiều suất hơn quota 25%
  assert.equal(plain.angle_quota, undefined);
  // timeline.ads.matrix.learn → brief.learn
  assert.deepEqual(M.matrixBrief({ ads: { matrix: { learn: { kpi: 'cpa', explore: 0.5 } } } }).learn, { kpi: 'cpa', explore: 0.5, platform: undefined });
  assert.equal(M.matrixBrief({}).learn, null);
});

test('vòng phản hồi: có yếu tố thắng → đề xuất; áp dụng → xếp hàng việc variants matrix --learn', async () => {
  const F = await import('../feedback.mjs'), Q = await import('../queue.mjs');
  const d = base('fb');
  R.importCsv(d, csv('meta_en.csv')); R.importCsv(d, csv('tiktok.csv'));
  const l = R.learnings(R.loadStore(d), { kpi: 'ctr' });
  await R.suggestNextBatch(d, l, { n: 12 });
  const s = F.loadSuggestions().items.find(x => x.action?.type === 'next_batch');
  assert.ok(s); assert.match(s.detail, /angle "Demo" \+65%/); assert.equal(s.action.project, path.resolve(d));
  await R.suggestNextBatch(d, l, { n: 12 });   // cùng dự án: cập nhật, không nhân đôi
  assert.equal(F.loadSuggestions().items.filter(x => x.action?.type === 'next_batch').length, 1);
  const r = await F.actSuggestion(s.id, 'apply');
  assert.match(r.msg, /lô kế tiếp có trọng số/);
  const it = Q.loadQueue().items.find(x => x.kind === 'variants');
  assert.equal(it.input, path.resolve(d));
  assert.deepEqual(it.opts, { n: 12, kind: 'matrix', args: ['--learn', '--kpi', 'ctr', '--explore', '0.2'] });
  assert.equal(await R.suggestNextBatch(d, { winners: [] }), null);
});
