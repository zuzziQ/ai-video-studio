// M62: build quality bugs found by the end-to-end run on sample/video-goc.mov (qa-reports/2026-11-15/video-e2e.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanText } from '../ai_edit.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// engine/slate.js in a sandbox with the few engine globals it touches while rendering.
function slate(TL) {
  const ctx = {
    TL, CDN: '', MODULES: {}, CAPTION_STYLES: {}, TEXT_STYLE: {},
    E: { inCubic: x => x, outCubic: x => x, outBack: x => x },
    prog: (t, a, d) => Math.min(1, Math.max(0, (t - a) / (d || 1))), clamp: x => Math.min(1, Math.max(0, x)),
    esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;'),
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'engine', 'slate.js'), 'utf8'), ctx);
  return ctx.MODULES;
}

test('M62 M1: thẻ kết dùng tiêu đề dự án thay vì chữ mẫu "SKILL AI EDIT VIDEO"', () => {
  const html = slate({ title: 'Test video gốc' }).title_card({ type: 'title_card', t0: 0, t1: 3 }, 2, 2).front;
  assert.match(html, /TEST /);
  assert.match(html, /VIDEO GỐC/);
  assert.doesNotMatch(html, /EDIT VIDEO/);
  // an explicit title (string or parts) still wins; nothing at all keeps the sample title
  assert.match(slate({ title: 'x' }).title_card({ t0: 0, t1: 3, title: 'Chốt đơn' }, 2, 2).front, /CHỐT /);
  assert.match(slate({ title: 'x' }).title_card({ t0: 0, t1: 3, title: [{ text: 'A' }] }, 2, 2).front, />A</);
  assert.match(slate({}).title_card({ t0: 0, t1: 3 }, 2, 2).front, /LL AI EDIT VIDEO/);
});

test('M62 M1: tiêu đề dài thu nhỏ rồi xuống dòng, không tràn khung 720', () => {
  const M = slate({ title: 'AI ĐÃ TIẾN HÓA QUÁ XA RỒI' });
  const fz = +/font-size:(\d+)px;letter-spacing:\.01em/.exec(M.title_card({ t0: 0, t1: 3 }, 2, 2).front)[1];
  assert.ok(fz < 50 && fz * 25 * .62 <= 640, `cỡ ${fz}px vẫn tràn`);
  const long = slate({ title: 'Một tiêu đề rất dài để thử chuyện xuống dòng của thẻ kết video' }).title_card({ t0: 0, t1: 3 }, 2, 2).front;
  assert.match(long, /white-space:normal;max-width:640px/);
});

test('M62 M3: chữ LED chừa chỗ cho dấu chồng (Ế, Ậ) trong vùng mặt nạ', () => {
  const html = slate({}).led_text({ type: 'led_text', t0: 0, t1: 3, text: 'AI TIẾN HÓA' }, 1, 1).front;
  assert.match(html, /mask-image/);
  assert.match(html, /padding:\.45em 0 \.3em;margin:-\.45em 0 -\.3em/);
});

test('M62 M2: chữ AI chỉ bị cắt ở ranh giới từ, sàn 20 ký tự', () => {
  assert.equal(cleanText('Chọn hiệu ứng', 'Bước'), 'Chọn hiệu ứng');
  assert.equal(cleanText('TRƯỚC: VÀI TIẾNG', 'CHỮ', 'text'), 'TRƯỚC: VÀI TIẾNG');
  assert.equal(cleanText('CHUYỂN ĐỘNG + PHÔNG CHỮ ĐẸP', 'CHỮ', 'text'), 'CHUYỂN ĐỘNG + PHÔNG…');
  assert.equal(cleanText('CHUYỂN ĐỘNG + PHÔNGCHỮ ĐẸP', 'CHỮ', 'text'), 'CHUYỂN ĐỘNG…'); // dangling "+" dropped
  assert.equal(cleanText('MỘT HAI BA BỐN NĂM SÁU BẢY', 'CHỮ', 'text'), 'MỘT HAI BA BỐN NĂM…');
  const one = cleanText('x'.repeat(40), 'CHỮ', 'text');
  assert.equal(one.length, 20);
  assert.ok(one.endsWith('…'));
});

test('M62 M4: nhạc tự động thay nhạc của AI dựng giúp, Xoá tự động trả lại', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m62-'));
  try {
    const caps = Array.from({ length: 10 }, (_, i) => ({ t0: i * 2, t1: i * 2 + 2, words: [{ w: 'xin', s: i * 2, e: i * 2 + 1 }, { w: 'chào', s: i * 2 + 1, e: i * 2 + 2 }] }));
    fs.writeFileSync(path.join(d, 'captions.json'), JSON.stringify(caps));
    const ai = { t0: 0, t1: 20, mood: 'tech', gain: -20, _ai: true };
    const mine = { t0: 0, t1: 5, mood: 'epic', gain: -20, manual: true };
    const tlf = path.join(d, 'timeline.json');
    fs.writeFileSync(tlf, JSON.stringify({ width: 720, height: 1280, fps: 30, duration: 20, pack: 'slate', captions: 'captions.json', scenes: [], audio: { music: [ai, mine], sfx: [] } }));
    const py = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    const run = (...a) => execFileSync(py, ['-I', '-X', 'utf8', path.join(root, 'scripts', 'auto_sfx.py'), tlf, ...a], { stdio: 'pipe' });
    run('--level', 'vua', '--music', 'auto');
    let music = JSON.parse(fs.readFileSync(tlf, 'utf8')).audio.music;
    assert.equal(music.filter(m => m._ai).length, 0, 'nhạc _ai vẫn chạy chồng dưới nhạc tự động');
    assert.ok(music.some(m => m.manual), 'nhạc tự đặt tay phải được giữ');
    const auto = music.filter(m => m._auto);
    assert.ok(auto.length >= 1);
    assert.equal(auto[0].mood.replace(/_\d+$/, ''), 'tech', 'mood gốc lấy theo nhạc AI đã chọn');
    run('--level', 'vua', '--clear'); // what POST /api/autofill {mode:'clear'} runs
    music = JSON.parse(fs.readFileSync(tlf, 'utf8')).audio.music;
    assert.equal(music.filter(m => m._auto).length, 0);
    assert.equal(music.filter(m => m._ai).length, 1, '"Xoá phần tự động" phải trả lại nhạc AI');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
