// claudeEnv (scripts/platform.mjs): CLI claude con vẫn thấy đăng nhập khi Studio chạy với USERPROFILE/HOME/AVS_HOME giả
// (lượt kiểm "người dùng mới" của worktree, subagent). Chạy: node --test scripts/tests/claude_env.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { claudeEnv, realHome } from '../platform.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'avs-claude-env-'));

test('realHome không theo USERPROFILE/HOME của tiến trình', () => {
  assert.ok(path.isAbsolute(realHome()));
});

test('home giả: CLI con chạy với home thật, token lấy ở home thật', () => {
  const home = tmp(), fake = tmp();
  try {
    fs.mkdirSync(path.join(home, '.ai-video-studio'));
    fs.writeFileSync(path.join(home, '.ai-video-studio', 'claude-token'), 'tok-that\n');
    const e = claudeEnv({ USERPROFILE: fake, HOME: fake, AVS_HOME: path.join(fake, '.ai-video-studio'), CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'x' }, { home });
    assert.equal(e.HOME, home);
    if (process.platform === 'win32') assert.equal(e.USERPROFILE, home);
    assert.equal(e.CLAUDE_CODE_OAUTH_TOKEN, 'tok-that');
    assert.equal(e.CLAUDECODE, undefined);
    assert.equal(e.CLAUDE_CODE_ENTRYPOINT, undefined);
    assert.equal(e.AVS_HOME, path.join(fake, '.ai-video-studio'), 'AVS_HOME của Studio giữ nguyên');
  } finally { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(fake, { recursive: true, force: true }); }
});

test('token ở AVS_HOME thắng home thật; CLAUDE_CONFIG_DIR hay token có sẵn được giữ', () => {
  const home = tmp(), fake = tmp();
  try {
    fs.writeFileSync(path.join(fake, 'claude-token'), 'tok-avs');
    fs.mkdirSync(path.join(home, '.ai-video-studio'));
    fs.writeFileSync(path.join(home, '.ai-video-studio', 'claude-token'), 'tok-that');
    assert.equal(claudeEnv({ AVS_HOME: fake }, { home }).CLAUDE_CODE_OAUTH_TOKEN, 'tok-avs');
    assert.equal(claudeEnv({ AVS_HOME: fake, CLAUDE_CODE_OAUTH_TOKEN: 'env' }, { home }).CLAUDE_CODE_OAUTH_TOKEN, 'env');
    const cfg = path.join(fake, 'cfg');
    const e = claudeEnv({ USERPROFILE: fake, HOME: fake, CLAUDE_CONFIG_DIR: cfg, AVS_HOME: fake }, { home });
    assert.equal(e.HOME, fake, 'đã chỉ CLAUDE_CONFIG_DIR thì không đổi home');
    assert.equal(e.CLAUDE_CONFIG_DIR, cfg);
  } finally { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(fake, { recursive: true, force: true }); }
});

test('home thật: env giữ nguyên', () => {
  const home = tmp();
  try {
    const e = claudeEnv({ USERPROFILE: home, HOME: home, AVS_HOME: path.join(home, 'x') }, { home });
    assert.equal(e.HOME, home);
    assert.equal(e.USERPROFILE, home);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
