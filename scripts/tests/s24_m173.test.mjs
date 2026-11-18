// S24 M173 (C37): chế độ chú thích — phạm vi vùng (studio/features/75_ask.core.js: regionOf / scopeOf / frameAt), chú thích vùng
// trong ghim (studio/features/73_pins.core.js: collect / dragRect), route /api/ask cắt ảnh vùng (studio/routes/75_ask.mjs, ffmpeg
// giả qua ctx.askCrop, mô hình giả qua ctx.askRun). Chạy: node --test scripts/tests/s24_m173.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as R from '../ask_route.mjs';
import route from '../../studio/routes/75_ask.mjs';
import { rmSync } from '../fs_rm.mjs';

const req = createRequire(import.meta.url);
const AC = req('../../studio/features/75_ask.core.js');
const P = req('../../studio/features/73_pins.core.js');
const read = rel => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');

test('regionOf: kẹp trong khung, kéo ngược, quá nhỏ → null', () => {
  assert.deepEqual(AC.regionOf({ x: 100, y: 50, w: -40, h: 20, t: 2.345 }, 720, 1280), { x: 60, y: 50, w: 40, h: 20, t: 2.35 });
  assert.deepEqual(AC.regionOf({ x: 700, y: -10, w: 100, h: 50, t: 1 }, 720, 1280), { x: 700, y: 0, w: 20, h: 40, t: 1 });
  assert.equal(AC.regionOf({ x: 1, y: 1, w: 5, h: 50 }, 720, 1280), null);
  assert.equal(AC.regionOf({ x: 'a', y: 1, w: 50, h: 50 }), null);
  assert.equal(AC.regionOf(null), null);
});

test('scopeOf: khoảng chọn > vùng > element; vùng có ở mọi bước trừ Cài đặt; việc + gợi ý của vùng', () => {
  const g = { x: 10, y: 20, w: 300, h: 200, t: 5 };
  const s = AC.scopeOf({ step: 'build', region: g, sel: { kind: 'cap', cid: 'c1', text: 'xin chào' } });
  assert.equal(s.kind, 'region'); assert.equal(s.chip, 'Vùng 300×200 · 0:05'); assert.equal(s.icon, 'ti-crop');
  assert.equal(AC.scopeOf({ step: 'build', region: g, range: { a: 1, b: 4 } }).kind, 'range');
  assert.equal(AC.scopeOf({ step: 'check', region: g }).kind, 'region');
  assert.equal(AC.scopeOf({ step: 'settings', region: g }), null);
  assert.deepEqual(AC.actionsOf(s).map(a => a.id), ['ai_build', 'answer']);
  assert.deepEqual(AC.actionsOf(AC.scopeOf({ step: 'check', region: g })).map(a => a.id), ['answer']); // không AI dựng ngoài bước Dựng
  const q = AC.quickOf(s);
  assert.equal(q.length, 2); assert.ok(q.every(i => i.ask && i.action === 'answer')); // gợi ý là câu hỏi: vẫn chỉ gọi mô hình khi bấm (C23)
  assert.equal(AC.checkPick({ action: 'transitions', params: { type: 'fade' } }, s).action, 'answer');
});

test('frameAt: clip chứa t, giây trong nguồn, ảnh của dãy khung (đánh số từ 1), video nguồn', () => {
  const tl = { clips: [{ src: { seq: 'work/frames/%05d.jpg', fps: 30, count: 300 }, audio: 'work/a.mp4', in: 2, out: 6 },
    { src: 'media/b.mp4', in: 10, out: 20, speed: 2 }] };
  assert.deepEqual(AC.frameAt(tl, 1), { at: 3, seq: 'work/frames/00091.jpg', video: 'work/a.mp4' });
  assert.deepEqual(AC.frameAt(tl, 5), { at: 12, video: 'media/b.mp4' }); // clip 2 bắt đầu ở 4 s, tốc độ 2
  assert.equal(AC.frameAt(tl, 99).at, 20); // kẹp ở out
  assert.equal(AC.frameAt({ clips: [{ src: { seq: 'f/%03d.png', fps: 10, count: 5 }, in: 0, out: 9 }] }, 8).seq, 'f/005.png'); // kẹp ở count
  assert.equal(AC.frameAt({}, 1), null);
});

test('logEntry giữ phạm vi vùng (toạ độ, không ảnh)', () => {
  const e = AC.logEntry({ id: 'r1', kind: 'reply', text: 'ok', scope: { kind: 'region', chip: 'Vùng 30×40 · 0:03', x: 1, y: 2, w: 30, h: 40, t: 3, img: 'data:image/png;base64,AA' } });
  assert.deepEqual(e.scope, { kind: 'region', chip: 'Vùng 30×40 · 0:03', x: 1, y: 2, w: 30, h: 40, t: 3 });
});

test('PinsCore: chú thích vùng (TL.pins có w, h) + ghim cũ kiểu điểm; dragRect', () => {
  const L = P.collect([], [{ x: 10, y: 20, t: 1, text: 'điểm' }, { x: 50, y: 60, w: 200, h: 100, t: 2, text: 'vùng' }, { x: 1, y: 1, w: 0, h: 5, t: 3, text: 'w = 0 là điểm' }]);
  assert.deepEqual(L.map(i => [i.label, i.w ?? null]), [['Cả video', null], ['Vùng 200×100', 200], ['Cả video', null]]);
  assert.notEqual(P.sig([L[1]]), P.sig([{ ...L[1], w: 201 }]));
  assert.deepEqual(P.dragRect({ x: 300, y: 200 }, { x: 100, y: 50 }, 720, 1280), { x: 100, y: 50, w: 200, h: 150 });
  assert.equal(P.dragRect({ x: 10, y: 10 }, { x: 15, y: 200 }, 720, 1280), null); // hẹp hơn DRAG = bấm
  assert.deepEqual(P.dragRect({ x: 700, y: 10 }, { x: 900, y: 60 }, 720, 1280), { x: 700, y: 10, w: 20, h: 50 });
});

function harness(dir, run, crop) {
  const tl = { width: 720, height: 1280, clips: [{ src: { seq: 'work/frames/%05d.jpg', fps: 30, count: 300 }, audio: 'work/a.mp4', in: 0, out: 10 }] };
  const ctx = { askRun: run, askCrop: crop, json: (res, o, c = 200) => { res.code = c; res.out = o; }, body: async q => q.body,
    get project() { return dir ? { dir } : null; }, P: rel => path.join(dir, rel), readProject: () => ({ timeline: tl }) };
  const h = route(ctx);
  return async (method, p, body) => { const res = {}; const hit = await h({ method, body }, res, p); return hit ? { code: res.code, ...res.out } : null; };
}
const wait = async (call, n = 200) => { for (let k = 0; k < n; k++) { const r = await call('GET', '/api/ask'); if (r.state !== 'running') return r; await new Promise(o => setTimeout(o, 10)); } throw new Error('treo'); };

test('route: vùng → cắt ảnh khung tại t, mô hình đọc ảnh bằng Read; không cắt được → hỏi bằng toạ độ', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m173-'));
  try {
    fs.mkdirSync(path.join(dir, 'work/frames'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'work/frames/00151.jpg'), 'x');
    const seen = [], crops = [];
    const run = async (p, o) => { seen.push({ p, o }); return { text: JSON.stringify({ action: 'answer', reply: 'Một bức tường trắng.' }), provider: 'claude' }; };
    const crop = async args => { crops.push(args); fs.writeFileSync(args.at(-1), 'jpg'); };
    const call = harness(dir, run, crop);
    const body = { ask: 'vùng này có gì?', step: 'build', region: { x: 10, y: 20, w: 300, h: 200, t: 5 }, info: { dw: 720, dh: 1280 } };
    assert.ok((await call('POST', '/api/ask', body)).ok);
    const r = await wait(call);
    assert.equal(r.state, 'done'); assert.equal(r.action, 'answer'); assert.equal(r.image, true); assert.equal(r.scope.kind, 'region');
    assert.equal(crops.length, 1);
    assert.equal(path.normalize(crops[0][crops[0].indexOf('-i') + 1]), path.join(dir, 'work/frames/00151.jpg'));
    assert.ok(crops[0].includes('scale=720:1280,crop=300:200:10:20'));
    const o = seen[0].o;
    assert.deepEqual(o.args, ['--allowedTools', 'Read']); assert.equal(o.task, 'vision'); assert.ok(fs.existsSync(path.join(o.cwd, 'region.jpg')));
    assert.match(seen[0].p, /x 10, y 20, rộng 300, cao 200/); assert.match(seen[0].p, /tệp region\.jpg/);

    // thiếu ảnh dãy khung và video nguồn → không cắt, prompt nói không có ảnh, hỏi bằng chữ
    fs.unlinkSync(path.join(dir, 'work/frames/00151.jpg'));
    seen.length = 0;
    assert.ok((await call('POST', '/api/ask', body)).ok);
    const r2 = await wait(call);
    assert.equal(r2.state, 'done'); assert.equal(r2.image, false);
    assert.equal(seen[0].o.task, 'text'); assert.equal(seen[0].o.args, undefined); assert.match(seen[0].p, /Không có ảnh của vùng/);
    assert.equal(crops.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('checkInput: vùng kẹp theo khung thiết kế; khung lạ → 1280; câu hỏi không vùng giữ phạm vi cũ', () => {
  const a = R.checkInput({ ask: 'x', step: 'build', region: { x: 1000, y: 0, w: 900, h: 100 }, info: { dw: 1280, dh: 720 } });
  assert.deepEqual([a.scope.kind, a.scope.x, a.scope.w], ['region', 1000, 280]);
  assert.equal(R.checkInput({ ask: 'x', step: 'build', region: { x: 0, y: 0, w: 5000, h: 50 }, info: { dw: 999 } }).scope.w, 1280);
  assert.equal(R.checkInput({ ask: 'x', step: 'build' }).scope.kind, 'video');
  assert.match(R.routerPrompt(a), /Không có ảnh của vùng/); // ctx.image chỉ do route đặt khi đã cắt
});

test('nguồn: danh sách chú thích ở tab Claude, gỡ hook S._proj; Hỏi ngay qua Studio.ask.askNow', () => {
  const pins = read('studio/features/73_pins.js'), ns = read('studio/features/03_nextstep.js'), ask = read('studio/features/75_ask.js');
  assert.ok(!pins.includes('S._proj') && !ns.includes('_proj'), 'còn hook S._proj');
  assert.match(pins, /S\.ask\?\.notes/); assert.match(pins, /S\.ask\.askNow\(/); assert.match(pins, /data-pp="ask"/);
  assert.match(ask, /function askNow\(/); assert.match(ask, /notes: bar\.querySelector\('\.ask-notes'\)/);
  assert.match(pins, /S\.right\?\.show\?\.\('claude'\)/); // mở tab qua Studio.right.show, không gán RT.tab
  assert.match(pins, /\.pinlayer \{ position: absolute; inset: 0; z-index: 3; pointer-events: none; \}/); // không chặn chuột khi tắt chế độ
});
