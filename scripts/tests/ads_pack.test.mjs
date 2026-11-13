// Test M30 (gói Ads Manager): tên file, ads_mapping.csv + UTM, kiểm spec, loại bản bị QC chặn, README, manifest.
// Chạy: node --test scripts/tests/ads_pack.test.mjs. Không cần ffmpeg: probe được giả lập theo tên file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-adspack-'));
process.env.AVS_HOME = HOME;
const A = await import('../ads_pack.mjs');
const { qcHash } = await import('../export_gate.mjs');
test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

// probe giả: <tên>__<w>x<h>__<giây>s[__<MB>mb].mp4
// (khổ phụ của export_multi <tên>_1x1.mp4 → vuông)
const probe = f => { const b = path.basename(f), m = /__(\d+)x(\d+)__([\d.]+)s(?:__(\d+)mb)?/.exec(b), sq = /_1x1\.mp4$/.test(b);
  return { w: +m[1], h: sq ? +m[1] : +m[2], dur: +m[3], mb: +(m[4] || 8), src: 'test' }; };
const W = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof o === 'string' ? o : JSON.stringify(o)); };
function proj(dir, tl, { video, qcIssues } = {}) {
  W(path.join(dir, 'timeline.json'), { width: 1080, height: 1920, duration: 20, scenes: [], captions: [], ...tl });
  if (video) W(path.join(dir, 'out', video), 'x');
  if (qcIssues) {
    const h = qcHash({ width: 1080, height: 1920, duration: 20, scenes: [], captions: [], ...tl }, []);
    W(path.join(dir, '.studio/qc.json'), { created: new Date().toISOString(), hash: h, hash_now: h, ads: { enabled: true }, issues: qcIssues });
  }
}
const hi = (kind, code) => ({ t: 1, kind, code, severity: 'high', msg: code });

function batch(name) {
  const base = path.join(HOME, name);
  const ads = { on: true, product: 'serum-b5', landing_url: 'https://shop.vd/serum?ref=x', platforms: ['meta', 'tiktok'] };
  proj(base, { title: 'Serum B5', ads });
  const vs = [];
  const mk = (i, axes, video, extra = {}) => {
    const d = `${base}_v${i}`;
    proj(d, { title: `Hook ${i}`, ads, pack: 'split', audio: { voice: 'work/voice_minh.wav', music: [{ t0: 0, t1: 20, mood: 'upbeat' }] },
      _variant: { base, i, kind: 'matrix', hook: `Hook số ${i}`, hook_id: `h${i}`, axes } }, { video, ...extra });
    vs.push({ dir: d, kind: 'matrix', axes, hook: `Hook số ${i}`, hook_id: `h${i}`, pack: 'split', video: video ? `out/${video}` : undefined });
  };
  mk(1, { audience: 'gen_z', angle: 'demo', narrative: 'how_to', duration: 15, format: 'split' }, 'a__1080x1920__15s.mp4', { qcIssues: [] });
  mk(2, { audience: 'moms', angle: 'faq', narrative: 'faq', duration: 0, format: 'full' }, 'b__1080x1920__20s.mp4', { qcIssues: [hi('ad_policy', 'POLICY-MEDICAL')] });
  mk(3, { audience: 'moms', angle: 'tips', narrative: 'faq', duration: 0, format: 'full' }, null, {});
  mk(4, { audience: 'gen_z', angle: 'mistakes', narrative: 'faq', duration: 0, format: 'full' }, 'd__1080x1080__3s.mp4', { qcIssues: [] });
  W(path.join(`${base}_v1`, 'out/a__1080x1920__15s_1x1.mp4'), 'x');   // khổ phụ của export_multi
  W(path.join(`${base}_v1`, 'publish/publish.json'), { platforms: { facebook: { title: 'Serum B5 #Shorts', caption: 'Thấm nhanh, không bết. Xem cách dùng', hashtags: ['#serum'] },
    tiktok: { caption: 'Mẹo dùng serum đúng cách', hashtags: ['#skincare'] } } });
  W(path.join(base, 'variants.json'), { base, created: '2026-11-13T00:00:00Z', kind: 'matrix', ab_test: true, variants: vs });
  return base;
}

test('hàm phụ: khổ, slug, UTM, CSV', () => {
  assert.equal(A.aspectOf(1080, 1920), '9:16'); assert.equal(A.aspectOf(720, 1280), '9:16'); assert.equal(A.aspectOf(1080, 1350), '4:5');
  assert.equal(A.aspectOf(1000, 1000), '1:1'); assert.equal(A.aspectOf(800, 1000), '4:5'); assert.equal(A.aspectOf(1200, 1000), '6:5');
  assert.equal(A.slug('Serum B5 – Đầu nhỏ giọt!'), 'serum-b5-dau-nho-giot');
  const u = new URL(A.withUtm('https://shop.vd/p?ref=x', { source: 'tiktok', campaign: 'c', content: 'ab12-V01', term: 'demo' }));
  assert.equal(u.searchParams.get('ref'), 'x'); assert.equal(u.searchParams.get('utm_content'), 'ab12-V01'); assert.equal(u.searchParams.get('utm_medium'), 'paid_social');
  assert.equal(A.withUtm('javascript:alert(1)', {}), null); assert.equal(A.withUtm('không phải url', {}), null);
  assert.equal(A.csvRow(['a', 'b,c', 'say "hi"', 'x\ny', null]), 'a,"b,c","say ""hi""","x\ny",');
});

test('kiểm spec: lỗi bắt buộc loại bản, khuyến nghị chỉ cảnh báo', () => {
  assert.deepEqual(A.checkSpec({ w: 1080, h: 1920, dur: 20, mb: 10 }, 'tiktok', { primary_text: 'ok' }).errors, []);
  assert.match(A.checkSpec({ w: 1080, h: 1920, dur: 3, mb: 10 }, 'tiktok').errors.join(), /tối thiểu 5s/);
  assert.match(A.checkSpec({ w: 1080, h: 1920, dur: 20, mb: 600 }, 'tiktok').errors.join(), /tối đa 500 MB/);
  assert.match(A.checkSpec({ w: 1080, h: 1350, dur: 20, mb: 10 }, 'tiktok').errors.join(), /khổ 4:5/);
  assert.deepEqual(A.checkSpec({ w: 1080, h: 1350, dur: 20, mb: 10 }, 'meta', { primary_text: 'x' }).errors, []);
  assert.match(A.checkSpec({ w: 1080, h: 1920, dur: 20, mb: 10 }, 'tiktok', { primary_text: 'x'.repeat(101) }).errors.join(), /tối đa 100/);
  const w = A.checkSpec({ w: 720, h: 1280, dur: 95, mb: 10 }, 'meta', { primary_text: 'x'.repeat(130), headline: 'y'.repeat(41) }).warnings.join(' | ');
  assert.match(w, /nên ≤ 90s/); assert.match(w, /nên ≥ 1080px/); assert.match(w, /nên ≤ 125/); assert.match(w, /tiêu đề 41/);
  assert.match(A.checkSpec({ w: 1080, h: 1080, dur: 20, mb: 10 }, 'tiktok', { primary_text: 'x' }).warnings.join(), /ưu tiên 9:16/);
});

test('gói Meta + TikTok từ một lô phiên bản', () => {
  const base = batch('serum');
  const now = new Date(2026, 10, 13, 8, 30);
  const r = A.buildPack(`${base}_v2`, { probe, now });   // mở từ một phiên bản: vẫn tìm về dự án gốc
  assert.equal(r.base, path.resolve(base)); assert.equal(r.campaign, 'serum-b5');
  assert.deepEqual(r.packs.map(p => p.platform), ['meta', 'tiktok']);
  const meta = r.packs[0], tik = r.packs[1], code = n => `${r.batch}-V0${n}`;
  assert.equal(meta.dir, path.join(path.resolve(base), 'out/ads', 'meta_20261113-0830'));

  // bản 2 bị QC chặn (lỗi chính sách), bản 3 chưa xuất, bản 4 quá ngắn với TikTok (3 s < 5 s) nhưng Meta nhận
  const why = p => Object.fromEntries(p.excluded.map(e => [e.code, e.reason]));
  assert.match(why(meta)[code(2)], /QC quảng cáo chặn xuất/); assert.match(why(meta)[code(3)], /chưa xuất video/);
  assert.match(why(tik)[code(4)], /sai spec tiktok: dài 3s, tối thiểu 5s/);
  assert.deepEqual(meta.rows.map(x => x.ad_name), [`serum-b5_meta_${code(1)}_9x16_15s`, `serum-b5_meta_${code(1)}_1x1_15s`, `serum-b5_meta_${code(4)}_1x1_3s`]);
  assert.deepEqual(tik.rows.map(x => x.ad_name), [`serum-b5_tiktok_${code(1)}_9x16_15s`, `serum-b5_tiktok_${code(1)}_1x1_15s`]);
  assert.ok(!meta.rows.some(x => x.code === code(0)), 'bản gốc chưa xuất thì không vào gói');

  // file trên đĩa
  const files = fs.readdirSync(meta.dir).sort();
  assert.deepEqual(files, ['README.txt', 'ads_mapping.csv', `${meta.rows[1].ad_name}.mp4`, `${meta.rows[0].ad_name}.mp4`, `${meta.rows[2].ad_name}.mp4`, 'manifest.json'].sort());
  const csv = fs.readFileSync(path.join(meta.dir, 'ads_mapping.csv'), 'utf8');
  assert.ok(csv.startsWith('﻿ad_name,file,code,'));
  const row1 = csv.split('\r\n')[1];
  assert.match(row1, /Thấm nhanh, không bết\. Xem cách dùng #serum/); assert.match(row1, /,Serum B5,LEARN_MORE,/);
  const url = new URL(meta.rows[0].landing_url);
  assert.equal(url.searchParams.get('utm_source'), 'facebook'); assert.equal(url.searchParams.get('utm_content'), code(1));
  assert.equal(url.searchParams.get('utm_term'), 'demo'); assert.equal(url.searchParams.get('ref'), 'x');
  assert.equal(tik.rows[0].headline, ''); assert.equal(tik.rows[0].primary_text, 'Mẹo dùng serum đúng cách #skincare');
  assert.equal(new URL(tik.rows[0].landing_url).searchParams.get('utm_source'), 'tiktok');
  assert.equal(meta.rows[2].primary_text, 'Hook số 4');   // không có gói đăng → hook

  const man = JSON.parse(fs.readFileSync(path.join(meta.dir, 'manifest.json'), 'utf8'));
  assert.equal(man.batch, r.batch);
  assert.deepEqual({ ...man.variants[code(1)], ads: undefined }, { dir: '../serum_v1'.replace('/', path.sep), hook: 'h1', angle: 'demo', audience: 'gen_z', narrative: 'how_to', format: 'split',
    duration: '15', voice: 'voice_minh', music: 'upbeat', hook_text: 'Hook số 1', pack: 'split', ads: undefined });
  assert.ok(!man.variants[code(2)]);
  const rd = fs.readFileSync(path.join(meta.dir, 'README.txt'), 'utf8');
  assert.match(rd, /không đăng quảng cáo/); assert.match(rd, /BẢN BỊ LOẠI KHỎI GÓI/); assert.match(rd, /Nguyễn Tất Kiểm/);
});

test('mã lô ổn định, dry-run không ghi, thiếu trang đích thì cảnh báo, bản có lý do bỏ qua được giữ', () => {
  const base = batch('nolanding');
  const tl = JSON.parse(fs.readFileSync(path.join(base, 'timeline.json'), 'utf8')); delete tl.ads.landing_url; W(path.join(base, 'timeline.json'), tl);
  // bản 2: lỗi claim (bỏ qua được) + có lý do → giữ, ghi cảnh báo
  const qf = path.join(`${base}_v2`, '.studio/qc.json'), qc = JSON.parse(fs.readFileSync(qf, 'utf8'));
  qc.issues = [hi('ad_claim', 'BLOCK-01')]; qc.override = { reason: 'Đã có giấy chứng nhận', hash: qc.hash }; W(qf, qc);
  const r1 = A.buildPack(base, { probe, platforms: ['meta'], dryRun: true }), r2 = A.buildPack(base, { probe, platforms: ['meta'], dryRun: true });
  assert.equal(r1.batch, r2.batch);
  assert.ok(!fs.existsSync(path.join(base, 'out/ads')));
  const p = r1.packs[0];
  assert.match(p.warnings.join(), /chưa có trang đích/); assert.equal(p.rows[0].landing_url, '');
  const v2 = p.rows.find(x => x.code.endsWith('V02'));
  assert.ok(v2); assert.match(v2.warnings.join(), /bỏ qua lỗi QC có lý do/);
  assert.throws(() => A.buildPack(base, { probe, platforms: ['youtube'], dryRun: true }), /Nền tảng không hợp lệ/);
});
