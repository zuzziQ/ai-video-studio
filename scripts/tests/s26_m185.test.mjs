// S26 M185 — khay việc: lõi thuần (làm sạch log, một dòng bước, trạng thái thẻ, khoá, hàng đợi Tự lái) + các chỗ nối trong studio.
// run: node --test scripts/tests/s26_m185.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const J = createRequire(import.meta.url)(path.join(ROOT, 'studio/features/05_jobs.core.js'));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('cleanLog: bỏ dòng tqdm, tiền tố "@@ 0.19", mã màu, dòng trống; gộp dòng lặp', () => {
  const raw = ['@@ 0.19 Đang nhận dạng giọng nói', ' 12%|█▏        | 25M/176M [00:03<00:20, 7MB/s]', '', 'Đang nhận dạng\u001b[0m', 'lặp', 'lặp', 'lặp', '100%|##########| 30/30 [00:01<00:00]'].join('\n');
  assert.deepEqual(J.cleanLog(raw), ['Đang nhận dạng giọng nói', 'Đang nhận dạng', 'lặp (×3)']);
  assert.deepEqual(J.cleanLog('a\rb\r\nc', 2), ['b', 'c']);
  assert.deepEqual(J.cleanLog(''), []); assert.deepEqual(J.cleanLog(null), []);
});

test('download: nhận tqdm tải file có đơn vị dung lượng, bỏ qua tqdm đếm khung hình', () => {
  assert.deepEqual(J.download(' 14%|█▍        | 25.0M/176M [00:03<00:20, 7MB/s]'), { pct: 14, total: '176 MB' });
  assert.deepEqual(J.download('  3%|▎ | 45.1MB/1.45GB [00:02<01:10]'), { pct: 3, total: '1,4 GB' });
  assert.equal(J.download('100%|##########| 30/120 [00:01<00:00, 30.0it/s]'), null);
  assert.equal(J.download('Đang tải 25M/176M'), null);
});

test('stepLine: tải mô hình ghi "Đang tải mô hình (176 MB, lần đầu) 14%"; không thì step sạch; không có step thì dòng log cuối', () => {
  const dl = { state: 'running', step: 'Nhận dạng giọng nói', log: 'x\r 14%|█▍  | 25M/176M [00:03<00:20]' };
  assert.equal(J.stepLine(dl), 'Đang tải mô hình (176 MB, lần đầu) 14%');
  assert.equal(J.stepLine({ state: 'running', step: '@@ 0.4 Dựng khung 3/9', log: '' }), 'Dựng khung 3/9');
  assert.equal(J.stepLine({ state: 'running', step: '', log: '@@ 0.2 Mix âm thanh\n 5%|#| 1/20 [00:00]' }), 'Mix âm thanh');
  assert.equal(J.stepLine({ state: 'error', step: 'Hết dung lượng', log: ' 14%|█| 25M/176M' }), 'Hết dung lượng', 'việc đã dừng thì không ghi "đang tải"');
  assert.equal(J.stepLine(null), '');
});

test('view: trạng thái thẻ chạy / xong / lỗi / huỷ', () => {
  const run = J.view({ job: { state: 'running', step: 'Dựng', progress: 0.426, log: '' } });
  assert.deepEqual([run.phase, run.pct, run.canStop, run.line], ['run', 43, true, 'Dựng']);
  const ok = J.view({ job: { state: 'done', step: 'Xong' }, phase: 'ok', result: { text: 'a.mp4 · 1080p' } });
  assert.deepEqual([ok.phase, ok.pct, ok.canStop, ok.line], ['ok', 100, false, 'a.mp4 · 1080p']);
  const err = J.view({ job: { state: 'error', step: 'Hết dung lượng', progress: 0.3 } });
  assert.deepEqual([err.phase, err.tone, err.line], ['err', 'err', 'Hết dung lượng']);
  const stop = J.view({ job: { state: 'cancelled', step: 'x' } });
  assert.deepEqual([stop.phase, stop.tone, stop.line], ['stop', 'warn', 'Đã huỷ'], 'huỷ không phải lỗi');
  assert.equal(J.phaseOf('paused'), 'stop'); assert.equal(J.phaseOf('???'), 'err');
});

test('locked: chỉ khoá khi còn thẻ đang chạy đặt lock (xuất video không khoá)', () => {
  const run = { title: 'AI dựng giúp', lock: true, job: { state: 'running' } };
  assert.equal(J.locked([]), false);
  assert.equal(J.locked([{ title: 'Xuất video', lock: false, job: { state: 'running' } }]), false);
  assert.equal(J.locked([run]), true); assert.equal(J.lockTitle([run]), 'AI dựng giúp');
  assert.equal(J.locked([{ ...run, phase: 'ok' }]), false, 'xong thì mở khoá');
  assert.equal(J.locked([{ ...run, job: { state: 'error' } }]), false);
});

test('busyMessage + queueLine (Tự lái)', () => {
  assert.equal(J.busyMessage('Xuất video'), 'Đang chạy: Xuất video (xem khay việc)');
  assert.match(J.busyMessage(''), /^Đang chạy: .+ \(xem khay việc\)$/);
  assert.equal(J.queueLine([]), ''); assert.equal(J.queueLine(undefined), '');
  assert.equal(J.queueLine([{ state: 'done' }]), '');
  assert.equal(J.queueLine([{ state: 'running', title: 'clip1', progress: 0.4 }, { state: 'queued' }, { state: 'queued' }]), 'Tự lái: đang chạy “clip1” 40% · 2 việc chờ');
  assert.equal(J.queueLine([{ state: 'queued' }]), 'Tự lái: 1 việc đang chờ');
  assert.equal(J.queueRunning([{ state: 'running', title: 'clip1' }]), 'clip1');
});

test('nối vào studio: khay thay hộp giữa màn hình ở xuất, AI dựng, QC, dự án mới; khoá + tạm dừng tự lưu', () => {
  const s = read('studio/studio.js'), css = read('studio/studio.css');
  assert.match(s, /Studio\.jobs\.track\(\{ kind: 'export'/); assert.doesNotMatch(s, /Đang xuất video…/);
  assert.match(s, /Studio\.jobs\.track\(\{ kind: 'new'/); assert.doesNotMatch(s, /Đang tạo dự án mới…<\/h3>/);
  assert.match(s, /function autoBusy[\s\S]*?Studio\?\.jobs\?\.locked\(\)/, 'khoá thì tạm dừng tự lưu M184');
  assert.match(s, /async function saveOnce[\s\S]*?if \(window\.Studio\?\.jobs\?\.locked\(\)\)/);
  assert.match(css, /body\.np-busy #center > :not\(#np-wait\)/); assert.doesNotMatch(css, /body\.np-busy > \*/);
  const ai = read('studio/features/20_ai.js'), qc = read('studio/features/16_qc.js');
  assert.match(ai, /kind: 'ai', title: 'AI dựng giúp', lock: true/); assert.doesNotMatch(ai, /AI đang dựng…/);
  assert.match(qc, /S\.jobs\.track\(\{ kind: 'qc'[^\n]*lock: !!\(fix \|\| only\)/); assert.doesNotMatch(qc, /Đang kiểm tra chất lượng…<\/h3>|Đang tạo 3 phiên bản…<\/h3>/);
  assert.match(read('studio/features/15_autopilot.js'), /Studio\.jobs\?\.autopilot\(st\)/);
  assert.match(read('studio/features/55_exports.js'), /async function finish\(j, o = \{\}\)/);
  assert.match(read('studio/features/05_jobs.js'), /\/api\/job\/cancel/);
});
