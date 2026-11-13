// node --test scripts/tests/export_multi.test.mjs
// ffFilterArg: the sendcmd file path must survive both levels of -filter_complex parsing (Windows drive colon and \).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ffFilterArg } from '../export_multi.mjs';

test('Windows path: escapes \\ and : for the option level, quotes for the graph level', () => {
  assert.equal(ffFilterArg('C:\\out\\.a_1x1.cmd'), "'C\\:\\\\out\\\\.a_1x1.cmd'");
});

test('POSIX path without specials is only quoted', () => {
  assert.equal(ffFilterArg('/tmp/out/.a_1x1.cmd'), "'/tmp/out/.a_1x1.cmd'");
});

test("apostrophe: option-level \\' then closed/escaped/reopened at the graph level", () => {
  assert.equal(ffFilterArg("/x/it's.cmd"), "'/x/it\\'\\''s.cmd'");
});

test('graph separators , ; [ ] stay inside the quotes', () => {
  assert.equal(ffFilterArg('/x/a,b;[c].cmd'), "'/x/a,b;[c].cmd'");
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
test('ffmpeg reads a sendcmd file from an absolute path with awkward characters', { skip: !hasFfmpeg && 'ffmpeg not on PATH' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avs em'x,[1]-"));
  try {
    const cmd = path.join(dir, '.v_1x1.cmd');
    fs.writeFileSync(cmd, '0.000 crop x 2, crop y 4;\n0.040 crop x 6, crop y 8;');
    const vf = `[0:v]sendcmd=f=${ffFilterArg(cmd)},crop=w=16:h=16:x=0:y=0,setsar=1[v]`;
    const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=32x32:d=0.1:r=25',
      '-filter_complex', vf, '-map', '[v]', '-f', 'null', '-'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
