// Test M27: giọng VieNeu trong scripts/batch.mjs (ttsEngine, ttsFile → scripts/tts.py). Chạy: node --test scripts/tests/tts_batch.test.mjs
// Không cần VieNeu thật: máy chủ HTTP giả trên 127.0.0.1 trả /health và /tts (WAV ngắn); AVS_HOME là thư mục tạm.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-tts-batch-'));
process.env.AVS_HOME = HOME;
delete process.env.AVS_VIENEU_URL;

function wav(sec = 0.3, sr = 24000) {
  const n = Math.round(sec * sr), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 220 * i / sr)), 44 + i * 2);
  return b;
}
const calls = [];
const server = http.createServer((req, res) => {
  let body = ''; req.on('data', d => (body += d)); req.on('end', () => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ready: true, clone: false, voices: [{ name: 'Hải Đăng' }, { name: 'Trúc Ly' }], default: 'Hải Đăng' }));
    }
    const j = JSON.parse(body || '{}'); calls.push(j);
    res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(wav());
  });
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const URL_ = `http://127.0.0.1:${server.address().port}`;
after(() => { server.closeAllConnections?.(); server.close(); fs.rmSync(HOME, { recursive: true, force: true }); });

const { ttsEngine, ttsFile } = await import('../batch.mjs');
const PY = process.platform === 'win32' ? 'python' : 'python3';

test('ttsEngine: mặc định như cũ, nhận vieneu/edge, bỏ say ngoài macOS', () => {
  const def = process.platform === 'darwin' ? 'say' : 'edge';
  assert.equal(ttsEngine({}), def);
  assert.equal(ttsEngine({ tts_engine: 'vieneu' }), 'vieneu');
  assert.equal(ttsEngine({ tts_engine: 'edge' }), 'edge');
  assert.equal(ttsEngine({ tts_engine: 'lạ' }), def);
  assert.equal(ttsEngine({ tts_engine: 'say' }), def);
});

test('ttsFile vieneu: đọc qua máy chủ trên 127.0.0.1, giọng trong config.json', async () => {
  fs.writeFileSync(path.join(HOME, 'config.json'), JSON.stringify({ other: 1, tts: { vieneu: { url: URL_, voice: 'Trúc Ly' } } }));
  const logs = [];
  const f = await ttsFile('vieneu', undefined, 'Xin chào các bạn', path.join(HOME, 'voice'), s => logs.push(s), PY);
  assert.ok(f.endsWith('voice.wav') && fs.readFileSync(f).subarray(0, 4).toString() === 'RIFF');
  assert.deepEqual(calls.at(-1), { text: 'Xin chào các bạn', voice: 'Trúc Ly' });
  assert.ok(logs.some(l => /VieNeu/.test(l)));
});

test('ttsFile vieneu: giọng của dòng (tts_voice) thắng config', async () => {
  await ttsFile('vieneu', 'Hải Đăng', 'Một hai ba', path.join(HOME, 'voice2'), () => {}, PY);
  assert.equal(calls.at(-1).voice, 'Hải Đăng');
});

test('ttsFile vieneu: không có máy chủ thì báo rõ và lùi về edge-tts', async () => {
  const port = await new Promise(ok => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
  fs.writeFileSync(path.join(HOME, 'config.json'), JSON.stringify({ tts: { vieneu: { url: `http://127.0.0.1:${port}` } } }));
  // edge-tts giả (fixtures/fake_edge_tts, nạp qua PYTHONPATH): không gọi mạng thật
  process.env.PYTHONPATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake_edge_tts');
  const logs = [];
  const n = calls.length;
  try {
    const f = await ttsFile('vieneu', undefined, 'Xin chào', path.join(HOME, 'voice3'), s => logs.push(s), PY);
    assert.ok(f.endsWith('voice3.mp3'), f);
    assert.match(fs.readFileSync(f, 'utf8'), /^FAKE-MP3 vi-VN-HoaiMyNeural/);
  } finally { delete process.env.PYTHONPATH; }
  assert.equal(calls.length, n, 'không gọi máy chủ giả');
  assert.ok(logs.some(l => /Máy chủ giọng VieNeu không chạy/.test(l) && /edge-tts/.test(l)), logs.join('\n'));
  assert.ok(logs.some(l => /đã đọc bằng edge-tts/.test(l)), logs.join('\n'));
});
