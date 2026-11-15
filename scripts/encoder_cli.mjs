#!/usr/bin/env node
// M65: encoder tự dò (render_hw.mjs pickEncoder) cho các khâu mã hoá phụ: cắt A-roll, b-roll, highlight.
// Không mở Chrome, chỉ dùng export có sẵn của render_hw.mjs (pickEncoder, encoderArgs).
//
//   import { videoArgs } from './encoder_cli.mjs';
//   const v = videoArgs({ crf: 20, x264: ['-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p'] });
//   // v.args: args NVENC/QSV/VideoToolbox khi dùng được, không thì đúng nguyên `x264` (args libx264 cũ của khâu đó).
//   // v.hw: true khi là encoder phần cứng → lỗi lúc chạy thì gọi lại với v.fallback (= x264).
//
// CLI cho Python (scripts/encoder_args.py):
//   node scripts/encoder_cli.mjs args --use derive --crf 16 [--preset fast]  → in JSON mảng args (libx264 khi không có GPU)
//   AVS_ENCODER=x264 ép CPU; AVS_ENCODER=nvenc|qsv|videotoolbox ép loại đó (dò hỏng vẫn lùi libx264).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickEncoder, encoderArgs } from './render_hw.mjs';

// kind → args video; 'x264' trả lại args cũ của khâu (giữ nguyên preset, crf, pix_fmt như trước M65).
export function argsFor(kind, { crf, preset = 'medium', x264 = null } = {}) {
  if (kind === 'x264') return x264 ? [...x264] : encoderArgs('x264', { crf, preset });
  return encoderArgs(kind, { crf, preset });
}

// use: 'derive' (mặc định, có trong AUTO_USES nên auto dùng phần cứng). crf theo thang x264; NVENC cộng NVENC_CQ_OFFSET.
export function videoArgs({ use = 'derive', crf = 20, preset = 'medium', x264 = null, pick = pickEncoder } = {}) {
  let kind = 'x264';
  try { kind = pick({ use }).kind; } catch { /* dò lỗi bất kỳ → libx264 */ }
  const fallback = argsFor('x264', { crf, preset, x264 });
  return { kind, hw: kind !== 'x264', args: argsFor(kind, { crf, preset, x264 }), fallback };
}

// argv: ['args', '--use', 'derive', '--crf', '16', '--preset', 'fast'] → { use, crf, preset } (crf ngoài 0–51 → lỗi).
export function parseCli(argv) {
  if (argv[0] !== 'args') throw new Error('cách dùng: encoder_cli.mjs args --use derive --crf 16 [--preset fast]');
  const opt = (k, d) => { const i = argv.indexOf(k); return i > 0 && argv[i + 1] != null ? argv[i + 1] : d; };
  const crf = Number(opt('--crf', 20));
  if (!Number.isInteger(crf) || crf < 0 || crf > 51) throw new Error(`--crf phải là số nguyên 0–51, nhận ${opt('--crf')}`);
  const preset = String(opt('--preset', 'medium'));
  if (!/^[a-z]+$/.test(preset)) throw new Error(`--preset không hợp lệ: ${preset}`);
  return { use: String(opt('--use', 'derive')), crf, preset };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = parseCli(process.argv.slice(2));
    const v = videoArgs(o);
    console.error(`[encoder] ${o.use}: ${v.kind}`);
    process.stdout.write(JSON.stringify(v.args) + '\n');
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
