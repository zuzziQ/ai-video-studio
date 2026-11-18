// Tìm Python của .venv cho worktree (.claude/worktrees/<tên>/): venv của chính gốc trước, không có thì của thư mục chính.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { findVenvPython, mainCheckout, venvRel } from '../platform.mjs';
import { venvPy } from '../../studio/routes/01_setup.mjs';

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'avs-venv-')));
const rm = d => fs.rmSync(d, { recursive: true, force: true });
function makeVenv(root, platform = process.platform, cfg = true) {
  const py = path.join(root, 'scripts', venvRel(platform));
  fs.mkdirSync(path.dirname(py), { recursive: true });
  fs.writeFileSync(py, '');
  if (cfg) fs.writeFileSync(path.join(root, 'scripts', '.venv', 'pyvenv.cfg'), 'home = x\n');
  return py;
}

for (const platform of ['win32', 'linux']) {
  test(`findVenvPython (${platform}): venv của gốc thắng venv thư mục chính`, () => {
    const wt = tmp(), main = tmp();
    try {
      const own = makeVenv(wt, platform); makeVenv(main, platform);
      assert.equal(findVenvPython(wt, { main, platform }), own);
      assert.equal(findVenvPython(path.join(wt, 'scripts'), { main, platform }), own, 'gốc là scripts/ cũng tìm được');
    } finally { rm(wt); rm(main); }
  });

  test(`findVenvPython (${platform}): worktree không có venv → venv thư mục chính`, () => {
    const wt = tmp(), main = tmp();
    try {
      const shared = makeVenv(main, platform);
      assert.equal(findVenvPython(wt, { main, platform }), shared);
    } finally { rm(wt); rm(main); }
  });

  test(`findVenvPython (${platform}): cả hai nơi đều thiếu → null; setup báo thiếu ở scripts/.venv của gốc`, () => {
    const wt = tmp(), main = tmp();
    try {
      assert.equal(findVenvPython(wt, { main, platform }), null);
      assert.equal(findVenvPython(wt, { main: null, platform }), null, 'không phải checkout git');
      // venv dở dang (thiếu pyvenv.cfg) không tính
      makeVenv(wt, platform, false); makeVenv(main, platform, false);
      assert.equal(findVenvPython(wt, { main, platform }), null);
    } finally { rm(wt); rm(main); }
  });
}

test('venvPy (setup): không có venv ở đâu → đường dẫn scripts/.venv của skill để báo thiếu', () => {
  const d = tmp();
  try {
    // d không phải checkout git: không có thư mục chính
    assert.equal(venvPy(d, 'linux'), path.join(d, 'scripts', '.venv/bin/python'));
    assert.equal(fs.existsSync(venvPy(d, 'linux')), false);
  } finally { rm(d); }
});

let git = true;
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { git = false; }
test('git worktree thật: mainCheckout là thư mục chính, venv lấy từ đó', { skip: !git && 'không có git' }, () => {
  const main = tmp();
  try {
    const g = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, stdio: 'ignore' });
    g(main, 'init', '-q'); fs.writeFileSync(path.join(main, 'a'), 'a'); g(main, 'add', 'a'); g(main, 'commit', '-qm', 'a');
    const wt = path.join(main, '.claude', 'worktrees', 'w1');
    g(main, 'worktree', 'add', '-q', wt);
    assert.equal(path.resolve(mainCheckout(wt)), path.resolve(main));
    assert.equal(findVenvPython(wt), null, 'chưa có venv ở đâu');
    const shared = makeVenv(main);
    assert.equal(findVenvPython(wt), shared);
    assert.equal(venvPy(wt), shared, 'màn setup dùng cùng venv');
    g(main, 'worktree', 'remove', '--force', wt);
    assert.ok(fs.existsSync(shared), 'gỡ worktree không đụng venv thư mục chính');
  } finally { rm(main); }
});
