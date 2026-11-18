// scripts/worktree-setup.mjs: chỉ cài khi thiếu, không bao giờ cài vào junction/symlink (npm ci sẽ xoá thư mục đích).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nodeModulesState } from '../worktree-setup.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'avs-wts-'));

test('nodeModulesState: nolock / missing / ok / link', () => {
  const d = tmp(), target = tmp();
  try {
    assert.equal(nodeModulesState(d), 'nolock', 'không có package-lock.json thì không làm gì');
    fs.writeFileSync(path.join(d, 'package-lock.json'), '{}');
    assert.equal(nodeModulesState(d), 'missing');
    fs.mkdirSync(path.join(d, 'node_modules'));
    assert.equal(nodeModulesState(d), 'missing', 'node_modules dở dang (chưa có .package-lock.json) thì cài lại');
    fs.writeFileSync(path.join(d, 'node_modules', '.package-lock.json'), '{}');
    assert.equal(nodeModulesState(d), 'ok');
    fs.rmSync(path.join(d, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(target, '.package-lock.json'), '{}');
    fs.symlinkSync(target, path.join(d, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(nodeModulesState(d), 'link', 'junction sang thư mục khác: báo, không cài');
    fs.unlinkSync(path.join(d, 'node_modules')); // chỉ gỡ liên kết
    assert.ok(fs.existsSync(path.join(target, '.package-lock.json')), 'thư mục đích còn nguyên');
  } finally {
    try { fs.unlinkSync(path.join(d, 'node_modules')); } catch { /* đã gỡ */ }
    fs.rmSync(d, { recursive: true, force: true }); fs.rmSync(target, { recursive: true, force: true });
  }
});
