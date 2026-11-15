// Lô giả cho scripts/tests/batch_parallel.test.mjs: giữ lượt render cấp lô (holdBatchSlot), chạy 3 "render" song song qua
// runPool; mỗi render là một node con mở thêm một node cháu (như render.mjs → Chrome/ffmpeg) rồi treo. Ghi pid từng tiến
// trình vào FAKE_BATCH_PIDS (một dòng mỗi pid) và env AVS_RENDER_SLOTS mà con nhận được vào FAKE_BATCH_ENV.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { holdBatchSlot, runPool } from '../../batch_parallel.mjs';

const pids = process.env.FAKE_BATCH_PIDS;
const hold = await holdBatchSlot({ perf: { slots: 1 } });
fs.appendFileSync(pids, `batch ${process.pid}\n`);
const child = `
const { spawn } = require('node:child_process'); const fs = require('node:fs');
const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
fs.appendFileSync(process.env.FAKE_BATCH_PIDS, 'child ' + process.pid + '\\ngrand ' + g.pid + '\\n');
fs.appendFileSync(process.env.FAKE_BATCH_ENV, String(process.env.AVS_RENDER_SLOTS) + '\\n');
setInterval(() => {}, 1000);`;
await runPool([0, 1, 2], 3, () => new Promise(ok => {
  const p = spawn(process.execPath, ['-e', child], { stdio: 'ignore', env: { ...process.env, ...hold.childEnv } });
  p.on('close', ok);
}));
hold.release();
