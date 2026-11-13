// Test M20 + M21 + M23: scripts/variant_matrix.mjs (cổng đa dạng nguồn, ma trận, ước tính) và trimTo của variants.mjs.
// Chạy: node --test scripts/tests/variant_matrix.test.mjs. Không mở engine, không gọi LLM; queue.json là file giả (chỉ đọc).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-matrix-'));
process.env.AVS_HOME = HOME;
const M = await import('../variant_matrix.mjs');
test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const TL = {
  duration: 31.6, face: { x: 540, y: 800 },
  aroll: { frames: 'work/frames/%05d.jpg' },
  clips: [{ src: 'media/a.mp4', in: 0, out: 10, tags: ['demonstration'] }, { src: 'media/b.mp4', in: 0, out: 10, tags: ['hand', 'demonstration'] },
    { src: 'media/a.mp4', in: 12, out: 20 }, { src: 'media/c.mp4', in: 0, out: 5, hidden: true }],
  scenes: [{ type: 'broll', t0: 3, t1: 5, src: 'broll/pack.jpg', tags: ['packshot'] }, { type: 'text', t0: 0, t1: 2, text: 'Xin chào' }],
};

test('cổng đa dạng nguồn: ngưỡng > 20 / > 100 / > 300, chặn khi thiếu, --allow-low-source cho qua kèm cảnh báo', () => {
  assert.deepEqual(M.sourceRequirement(20), { sources: 1, scenes: 1 });
  assert.deepEqual(M.sourceRequirement(21), { sources: 3, scenes: 12 });
  assert.deepEqual(M.sourceRequirement(101), { sources: 5, scenes: 25 });
  assert.deepEqual(M.sourceRequirement(301), { sources: 8, scenes: 40 });
  const st = { sources: 3, scenes: 12, tags: {} };
  assert.equal(M.checkSourceGate(st, 100).ok, true);
  const g = M.checkSourceGate(st, 101);
  assert.equal(g.blocked, true); assert.equal(g.warnings[0].code, 'NEED_MORE_SOURCE'); assert.equal(g.warnings[0].severity, 'critical');
  assert.match(g.warnings[0].message, /≥ 5 video nguồn và ≥ 25 cảnh \(đang có 3 video, 12 cảnh\)/);
  const o = M.checkSourceGate(st, 101, { allowLowSource: true });
  assert.equal(o.ok, true); assert.equal(o.blocked, false); assert.equal(o.warnings[0].severity, 'warning'); assert.match(o.warnings[0].message, /bỏ qua/);
});

test('sourceStats: video nguồn khác nhau, đoạn hình hiện, thẻ cảnh và khuôn mặt', () => {
  const s = M.sourceStats('/p', { ...TL, ads: { source_tags: { packshot: 2 } } });
  assert.equal(s.sources, 4);          // frames A-roll, a.mp4, b.mp4, pack.jpg (clip ẩn không tính)
  assert.equal(s.scenes, 4);           // 3 clip hiện + 1 b-roll
  assert.equal(s.tags.demonstration, 2); assert.equal(s.tags.hand, 1); assert.equal(s.tags.packshot, 3); assert.equal(s.tags.face, 1);
});

test('planMatrix: tổ hợp đủ 5 trục, lý do không khả thi, quota mỗi góc, trục đa dạng', () => {
  const brief = M.matrixBrief(TL, { audiences: 'new_buyers,loyal', durations: '0,15,45', formats: 'full,split' });
  assert.equal(brief.angles.length, 10); assert.equal(brief.narratives.length, 5);
  const noTags = { sources: 1, scenes: 1, tags: { face: 1 } };
  const p = M.planMatrix(brief, noTags, { duration: 31.6, ads: false }, 20);
  assert.equal(p.theoretical, 2 * 10 * 5 * 3 * 2);
  // 45 s > video 31,6 s; how_to/demo/comparison/feature/tips thiếu thẻ cảnh
  assert.ok(p.rejected_reasons.TOO_LONG > 0 && p.rejected_reasons.NEED_MORE_SOURCE > 0);
  assert.ok(p.proposals.filter(x => !x.feasible).every(x => x.reason));
  assert.ok(p.chosen.every(c => c.duration !== 45 && !['how_to', 'demo', 'comparison', 'feature', 'tips'].includes(c.angle)));
  assert.equal(p.chosen.length, 20);
  for (const [a, k] of Object.entries(p.angle_distribution)) assert.ok(k <= p.quota || p.chosen.some(c => c.angle === a && c.quota_overflow), `${a} ${k}`);
  const count = key => new Set(p.chosen.map(c => c[key])).size;
  assert.equal(count('duration'), 2); assert.equal(count('format'), 2); assert.equal(count('audience'), 2); assert.ok(count('narrative') >= 4);
  // dự án quảng cáo chưa có claim đã duyệt: không tổ hợp nào khả thi
  const q = M.planMatrix(brief, noTags, { duration: 31.6, ads: true, claims: [{ text: 'x', status: 'pending' }] }, 5);
  assert.equal(q.feasible_count, 0); assert.ok(q.rejected_reasons.NO_CLAIM > 0);
  // cùng seed → cùng kết quả
  assert.deepEqual(M.planMatrix(brief, noTags, { duration: 31.6 }, 20).chosen, p.chosen);
});

test('planMatrix: trọng số yếu tố thắng nâng tổ hợp lên đầu', () => {
  const brief = M.matrixBrief({ duration: 30 }, { angles: 'faq,mistakes', narratives: 'faq', audiences: 'loyal', formats: 'full' });
  const p = M.planMatrix(brief, { sources: 1, scenes: 1, tags: {} }, { duration: 30 }, 1, { weights: { angle: { mistakes: 2, faq: 0.5 } } });
  assert.equal(p.chosen[0].angle, 'mistakes');
});

test('estimate: đo thời gian từ queue.json (chỉ đọc), hook cần sinh, dung lượng, cảnh báo tổ hợp thiếu', () => {
  const proj = fs.mkdtempSync(path.join(HOME, 'proj-'));
  fs.mkdirSync(path.join(proj, 'work')); fs.writeFileSync(path.join(proj, 'work/a.bin'), Buffer.alloc(2e6));
  fs.mkdirSync(path.join(proj, 'out')); fs.writeFileSync(path.join(proj, 'out/x.mp4'), Buffer.alloc(5e6));
  const qf = path.join(HOME, 'queue.json'), at = (s, sec) => [new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString(), new Date(Date.UTC(2026, 0, 1, 0, 0, s + sec)).toISOString()];
  const job = (sec, n, exp, state = 'done') => { const [started, finished] = at(0, sec); return { kind: 'variants', state, started, finished, opts: { n, export: exp }, result: null }; };
  const items = [job(30, 3, false), job(60, 3, false), job(300, 3, true), job(999, 3, true, 'error'), { kind: 'autopilot', state: 'done', ...Object.fromEntries([['started', at(0, 1)[0]], ['finished', at(0, 500)[1]]]) }];
  fs.writeFileSync(qf, JSON.stringify({ items }));
  const before = fs.readFileSync(qf, 'utf8');
  const plan = { feasible_count: 12, theoretical: 40, rejected_reasons: { TOO_LONG: 28 } };
  const lib = { hooks: [{ id: 'a', text: 'A', used: [] }], stats: { llm_s: [20, 40] } };
  const e = M.estimate({ dir: proj, target: 30, plan, stats: { sources: 1, scenes: 3, tags: {} }, gate: M.checkSourceGate({ sources: 1, scenes: 3 }, 30), lib, export: true, queueFile: qf });
  assert.equal(fs.readFileSync(qf, 'utf8'), before);           // không ghi queue.json
  assert.equal(e.will_make, 12);
  assert.equal(e.eta.per_variant_s.setup, 15);                  // (30/3 + 60/3) / 2
  assert.equal(e.eta.per_variant_s.render, 85);                 // 300/3 − 15
  assert.equal(e.eta.per_variant_s.llm_call, 30);
  assert.deepEqual(e.eta.measured.jobs, { setup: 2, render: 1 });
  assert.deepEqual(e.hooks, { have: 1, need: 3, to_generate: 2, reuse_max: 5 });
  assert.equal(e.disk_per_variant_mb.project, 2); assert.equal(e.disk_per_variant_mb.video, 5);
  assert.equal(e.disk_gb, 0.08);                                 // 12 × 7 MB
  assert.ok(Math.abs(e.eta.total_hours - (30 + 12 * 15 + 12 * 85) / 3600) < 0.01);
  assert.deepEqual(e.warnings.map(w => w.code), ['NEED_MORE_SOURCE', 'COMBOS_LOW', 'HOOKS_LOW']);
  assert.match(M.estimateText(e), /Mục tiêu 30 bản · 12\/40 tổ hợp khả thi/);
  // không có job nào đã chạy: dùng số mặc định và nói rõ
  const d = M.estimate({ dir: proj, target: 5, plan: { feasible_count: 40, theoretical: 40, rejected_reasons: {} }, stats: { sources: 1, scenes: 1, tags: {} }, lib: null, queueFile: path.join(HOME, 'none.json') });
  assert.equal(d.eta.per_variant_s.setup, M.DEFAULTS.setup_s); assert.equal(d.eta.measured.setup, false); assert.match(M.estimateText(d), /mặc định/);
});

test('trimTo (variants.mjs): cắt phụ đề, scene, clip, âm thanh về đúng thời lượng', async () => {
  const { trimTo } = await import('../variants.mjs');
  const tl = { duration: 30, scenes: [{ t0: 0, t1: 30, type: 'bg' }, { t0: 5, t1: 18 }, { t0: 20, t1: 25 }],
    clips: [{ src: 'a', in: 0, out: 10 }, { src: 'b', in: 2, out: 12, speed: 2 }, { src: 'c', in: 0, out: 10 }],
    audio: { sfx: [{ t: 1 }, { t: 16 }], music: [{ t0: 0, t1: 30 }] }, fx: [{ t: 2 }, { t: 20 }], zoom: [{ t0: 14, t1: 18 }] };
  const caps = [{ t0: 1, t1: 3, words: [{ w: 'a', s: 1, e: 3 }] }, { t0: 14, t1: 16, words: [{ w: 'b', s: 14, e: 14.8 }, { w: 'c', s: 14.9, e: 16 }, { w: 'x', s: 15.2, e: 16 }] }, { t0: 20, t1: 22, words: [{ w: 'd', s: 20, e: 22 }] }];
  assert.equal(trimTo(tl, caps, 15), true);
  assert.equal(tl.duration, 15);
  assert.deepEqual(tl.scenes.map(s => [s.t0, s.t1]), [[0, 15], [5, 15]]);
  assert.deepEqual(tl.clips.map(c => c.out), [10, 12]);         // clip 2 dài 5 s (tốc độ 2) vừa hết ở 15 s; clip 3 bỏ
  assert.deepEqual(caps.map(c => c.words.map(w => w.w).join('')), ['a', 'bc']);
  assert.equal(caps[1].t1, 15); assert.equal(caps[1].words[1].e, 15);
  assert.deepEqual(tl.audio.sfx, [{ t: 1 }]); assert.deepEqual(tl.audio.music, [{ t0: 0, t1: 15 }]);
  assert.deepEqual(tl.fx, [{ t: 2 }]); assert.deepEqual(tl.zoom, [{ t0: 14, t1: 15 }]);
  assert.equal(trimTo(tl, caps, 0), false); assert.equal(trimTo(tl, caps, 20), false);
});
