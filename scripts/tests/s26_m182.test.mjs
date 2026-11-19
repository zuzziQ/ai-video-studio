// S26 M182: AI dựng giữ nhạc người dùng đã chọn/chỉnh (không thay bằng 'tech' -18); chỉ nhạc _ai/_auto hoặc nhạc khởi đầu chưa ai đụng bị thay.
// M134: plan.music null = không nhạc. Hộp AI dựng kiểm Claude khi mở, lỗi in một lần, mục tiêu theo purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPlan, isUserMusic } from '../ai_edit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plan = (music = { t0: 0, t1: 30, mood: 'tech', gain: -18, _ai: true }) => ({ pack: 'slate', scenes: [], sfx: [], captions: [], music });
const tl = music => ({ duration: 30, scenes: [], audio: { music } });

test('nhạc khởi đầu chưa ai đụng bị AI thay', () => {
  const t = tl([{ t0: 0, t1: 32.5, mood: 'tech', gain: -20 }]);
  applyPlan(t, [], plan());
  assert.equal(t.audio.music.length, 1); assert.equal(t.audio.music[0]._ai, true);
});
test('người dùng đổi mood corporate −8 (có _orig) → giữ, không thêm nhạc AI', () => {
  const m = { t0: 0, t1: 32.5, mood: 'corporate', gain: -8, _orig: { t0: 0, t1: 32.5, mood: 'tech', gain: -20 } };
  const t = tl([m]); applyPlan(t, [], plan());
  assert.deepEqual(t.audio.music, [m]);
});
test('chỉ đổi gain của nhạc khởi đầu (Studio ghi _orig) → giữ', () => {
  const t = tl([{ t0: 0, t1: 32.5, mood: 'tech', gain: -8, _orig: {} }]); applyPlan(t, [], plan());
  assert.equal(t.audio.music.length, 1); assert.equal(t.audio.music[0].gain, -8);
});
test('nhạc file / Kho / mood khác tech không _orig vẫn là của người dùng; _ai, _auto thì không', () => {
  assert.ok(isUserMusic({ t0: 0, t1: 9, file: 'media/a.mp3' })); assert.ok(isUserMusic({ mood: 'chill' }));
  assert.ok(!isUserMusic({ mood: 'chill', _ai: true })); assert.ok(!isUserMusic({ mood: 'chill', _auto: true }));
  assert.ok(!isUserMusic({ mood: 'tech', gain: -20 })); assert.ok(isUserMusic({ mood: 'chill', _ai: true, _orig: {} }));
});
test('M134: plan.music null → bỏ nhạc _ai cũ, không thêm; nhạc người dùng giữ', () => {
  const u = { t0: 0, t1: 30, mood: 'corporate', gain: -8, _orig: {} };
  const t = tl([{ t0: 0, t1: 30, mood: 'tech', gain: -18, _ai: true }, u]); applyPlan(t, [], plan(null));
  assert.deepEqual(t.audio.music, [u]);
});
test('ai_edit ghi "Giữ nhạc bạn chọn" vào tóm tắt; hộp AI dựng kiểm Claude, lỗi một lần, purpose', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts/ai_edit.mjs'), 'utf8'), /Giữ nhạc bạn chọn\./);
  const ui = fs.readFileSync(path.join(ROOT, 'studio/features/20_ai.js'), 'utf8');
  assert.match(ui, /presetGoal\(\); checkClaude\(\);/); assert.match(ui, /i\.id === 'claude'/); assert.match(ui, /S\.openSetup/);
  assert.match(ui, /\/api\/onboarding'/); assert.match(ui, /\$\{rest \? `<pre>/);
});

// S26 M182: AI dựng giữ nhạc người dùng nhưng bước "b-roll + âm thanh" (auto_sfx --music auto) lại thay nền _auto đã chỉnh tay
test('auto_sfx --music auto giữ nền nhạc người dùng đã chỉnh (_orig), kể cả nền _auto cũ', async () => {
  const { execFileSync } = await import('node:child_process');
  const os = await import('node:os');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m182-'));
  try {
    const caps = Array.from({ length: 10 }, (_, i) => ({ t0: i * 2, t1: i * 2 + 2, words: [{ w: 'xin', s: i * 2, e: i * 2 + 1 }, { w: 'chào', s: i * 2 + 1, e: i * 2 + 2 }] }));
    fs.writeFileSync(path.join(d, 'captions.json'), JSON.stringify(caps));
    const mine = { t0: 0, t1: 20, mood: 'corporate', gain: -8, _auto: true, _was: [{ t0: 0, t1: 20, mood: 'tech', gain: -20, _ai: true }], _orig: { mood: 'tech', gain: -18 } };
    const tlf = path.join(d, 'timeline.json');
    fs.writeFileSync(tlf, JSON.stringify({ width: 720, height: 1280, fps: 30, duration: 20, pack: 'slate', captions: 'captions.json', scenes: [], audio: { music: [mine], sfx: [] } }));
    const py = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    execFileSync(py, ['-I', '-X', 'utf8', path.join(import.meta.dirname, '..', 'auto_sfx.py'), tlf, '--level', 'vua', '--music', 'auto'], { stdio: 'pipe' });
    const music = JSON.parse(fs.readFileSync(tlf, 'utf8')).audio.music;
    assert.equal(music.length, 1);
    assert.equal(music[0].mood, 'corporate');
    assert.equal(music[0].gain, -8);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
