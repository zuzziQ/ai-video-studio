// S18 M131: "Học từ chỉnh sửa" của Tự lái (studio/routes/15_autopilot.mjs, timer 15 s) học cả dự án ở tab không phải dự án mặc định.
import test, { after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const T = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m131-'));
process.env.AVS_HOME = path.join(T, 'home'); process.env.AVS_NO_QUEUE = '1';
after(() => fs.rmSync(T, { recursive: true, force: true }));
const { default: route } = await import('../../studio/routes/15_autopilot.mjs');
const { loadStore } = await import('../../scripts/profile.mjs');

const mkAuto = name => {
  const d = path.join(T, name); fs.mkdirSync(path.join(d, '.studio'), { recursive: true });
  const before = { scenes: [{ type: 'emoji_pop', _auto: 1 }, { type: 'text', _auto: 1 }], audio: {} };
  fs.writeFileSync(path.join(d, '.studio/autopilot.json'), JSON.stringify({ state: 'done', profile: 'mac-dinh', finishedMs: 0 }));
  fs.writeFileSync(path.join(d, '.studio/autopilot_result.json'), JSON.stringify(before));
  fs.writeFileSync(path.join(d, 'timeline.json'), JSON.stringify({ ...before, scenes: [] })); // người dùng xoá hết cảnh tự động
  return d;
};

test('timer học từ mọi tab đang mở (qua tabs.get), không chỉ dự án mặc định', () => {
  const A = mkAuto('mac-dinh-A'), B = mkAuto('tab-B'), C = mkAuto('tab-da-mat');
  const got = [];
  const tabs = { list: () => [{ id: 'b', dir: B, exists: true }, { id: 'c', dir: C, exists: true }, { id: 'x', dir: path.join(T, 'khong-co'), exists: false }],
    get: id => (got.push(id), id === 'b' ? { dir: B } : null) };
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    route({ project: { dir: A }, tabs, SKILL: process.cwd(), json() {} });
    mock.timers.tick(15000);
  } finally { mock.timers.reset(); }
  const names = Object.values(loadStore().profiles[0].learned?.projects || {}).map(o => o.name).sort();
  assert.deepEqual(names, ['mac-dinh-A', 'tab-B'], 'C: tabs.get trả null (không qua resolveProject) → không đọc');
  assert.deepEqual(got, ['b', 'c'], 'chỉ hỏi tab còn timeline.json');
});
