// S22 M151: chế độ Cơ bản / Chuyên nghiệp thật (studio/features/01_level.core.js) + chỗ nối ở 01_workflow, 68_right, 68_sections,
// 04_cmdk và studio.js. Kế hoạch: docs/plans/S22-che-do-va-hoi-claude.md mục 4; C13 (mặc định), C24 (mục ẩn vẫn mở được).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const req = createRequire(import.meta.url);
const L = req('../../studio/features/01_level.core.js');
const R = req('../../studio/features/68_right.core.js');
const SC = req('../../studio/features/68_sections.core.js');
const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('thanh trái Cơ bản theo bảng mục 4', () => {
  assert.deepEqual(L.BASIC_RAIL, {
    prep: ['brands', 'wf-project'], source: ['wf-new', 'wf-script'], build: ['wf-aihelp', 'tpl', 'text', 'audio', 'audioplus'],
    check: ['wf-qc'], ship: ['wf-export', 'wf-publish'], settings: ['wf-mode', 'wf-engines'],
  });
  for (const [st, id] of [['prep', 'products'], ['prep', 'kho'], ['source', 'words'], ['source', 'ai'], ['source', 'longform'],
    ['build', 'media'], ['build', 'comp'], ['build', 'aibroll'], ['build', 'fx'], ['build', 'sticker'], ['build', 'shapes'],
    ['build', 'trans'], ['build', 'filter'], ['build', 'dub'], ['ship', 'schedule'], ['ship', 'batch'],
    ['settings', 'perf'], ['settings', 'agent'], ['settings', 'stylelab']])
    assert.equal(L.railLevel(id, st), 'pro', `${st}/${id} phải là Chuyên nghiệp`);
  for (const [st, ids] of Object.entries(L.BASIC_RAIL)) for (const id of ids) assert.equal(L.railLevel(id, st), 'basic');
});

test('mức của panel: opts.level pro luôn thắng, bước lạ (Tự lái) hiện ở mọi chế độ', () => {
  assert.equal(L.railLevel('brands', 'prep', 'pro'), 'pro');
  assert.equal(L.railLevel('shapes', 'build', 'basic'), 'pro'); // bảng của kế hoạch thắng opts.level 'basic'
  assert.equal(L.railLevel('autopilot', 'queue'), 'basic');
  assert.equal(L.railShown('fx', 'build', 'pro'), true);
  assert.equal(L.railShown('fx', 'build', 'basic'), false);
  assert.equal(L.railShown('text', 'build', 'basic'), true);
});

test('cột phải: Cơ bản không có tab Lớp', () => {
  assert.deepEqual(L.rightTabs('basic'), ['props', 'claude']);
  assert.deepEqual(L.rightTabs('pro'), ['props', 'layers', 'claude']);
  assert.deepEqual(L.rightTabs('lạ'), ['props', 'layers', 'claude']);
  const kb = L.rightTabs('basic');
  assert.deepEqual(R.tabsFor(kb).map(t => t[0]), ['props', 'claude']);
  assert.equal(R.valid('layers', kb), false); assert.equal(R.valid('layers'), true);
  assert.equal(R.initialTab('layers', false, kb), 'claude'); // tab Lớp đã lưu nhưng đang Cơ bản
  assert.equal(R.initialTab('layers', true, kb), 'props');
  assert.equal(R.nextTab({ tab: 'layers', had: true, has: true, keys: kb }), 'props'); // vừa đổi sang Cơ bản khi đang ở Lớp
  assert.equal(R.nextTab({ tab: 'layers', had: true, has: true }), 'layers');
});

test('Thuộc tính Cơ bản: Núm + mục chính (S24 M172: không còn Hỏi Claude), còn lại sau "Thêm thuộc tính"', () => {
  const secs = SC.normalize([['basic', 'Cơ bản', ''], ['anim', 'Hoạt ảnh', ''], ['pos', 'Vị trí', ''], ['kf', 'Keyframe', ''],
    ['mask', 'Mặt nạ', ''], ['json', 'Nâng cao', ''], ['knobs', 'Núm', '']]);
  const b = L.splitSections(secs, 'basic');
  assert.deepEqual(b.main.map(s => s.key), ['knobs', 'basic']);
  assert.deepEqual(b.more.map(s => s.key), ['anim', 'pos', 'kf', 'mask', 'json']); // không mục nào mất
  const p = L.splitSections(secs, 'pro');
  assert.equal(p.main.length, 7); assert.equal(p.more.length, 0);
  // không có mục 'basic' (clip, element của tính năng): mục đầu không phải Núm là mục chính
  const clip = L.splitSections(SC.normalize([['speed', 'Tốc độ', ''], ['color', 'Màu', ''], ['audio', 'Âm thanh', '']]), 'basic');
  assert.deepEqual(clip.main.map(s => s.key), ['speed']); assert.deepEqual(clip.more.map(s => s.key), ['color', 'audio']);
  assert.deepEqual(L.splitSections([], 'basic'), { main: [], more: [] });
  // SectCore.split dùng lõi khi có, không có lõi thì như trước S22 (mục Pro vào phần thêm)
  assert.deepEqual(SC.split(secs, true, L).more.map(s => s.key), ['anim', 'pos', 'kf', 'mask', 'json']);
  assert.deepEqual(SC.split(secs, true, null).more.map(s => s.key), ['kf', 'mask', 'json']);
  assert.equal(SC.split(secs, false, L).more.length, 0);
});

test('C13: chưa chọn chế độ thì người mới vào Cơ bản, người đang dùng giữ Chuyên nghiệp', () => {
  assert.equal(L.initialLevel('', true), 'basic');
  assert.equal(L.initialLevel('', false), 'pro');
  assert.equal(L.initialLevel(null, null), 'pro'); // chưa đọc được trạng thái
  assert.equal(L.initialLevel('pro', true), 'pro'); // đã chọn thì giữ
  assert.equal(L.initialLevel('basic', false), 'basic');
  assert.equal(L.initialLevel('xyz', true), 'basic');
  // isNew của GET /api/onboarding = chưa có onboarding.json
  assert.match(read('studio/routes/02_onboarding.mjs'), /isNew: !s\.exists/);
});

test('chỗ nối: workflow, studio.js, ⌘K', () => {
  const wf = read('studio/features/01_workflow.js');
  for (const x of ['const L = window.LevelCore', 'L.railLevel(id, st, opt)', "L.initialLevel(savedLevel, null)", "S.api('/api/onboarding')", 'L.initialLevel(\'\', !!r.isNew)',
    "lvBar.id = 'wf-lvbar'", 'moreBtn.before(lvBar)', 'hidden, get step()', 'if (hidden(id)) setLevel(\'pro\')'])
    assert.ok(wf.includes(x), `01_workflow.js thiếu ${x}`);
  assert.doesNotMatch(wf, /DEFAULT_LEVEL|class="wf-lv"/); // công tắc rời menu ⋯ lên thanh đầu
  const s = read('studio/studio.js');
  for (const x of ['LevelCore.rightTabs(uiLevel())', 'C.tabsFor(rtKeys())', 'SC.split(all,', "data-act=\"secmore\"", "a === 'secmore'", "Studio.workflow.setLevel('pro')"])
    assert.ok(s.includes(x), `studio.js thiếu ${x}`);
  const ck = read('studio/features/04_cmdk.js');
  assert.doesNotMatch(ck, /m\.level === 'pro' && W\(\)\.level === 'basic'\) continue/); // không còn bỏ công cụ Pro khỏi ⌘K
  for (const x of ['W()?.hidden?.(id)', 'Mở ở Chuyên nghiệp', 'Chỉ mở lần này', "W()?.setLevel('pro')"]) assert.ok(ck.includes(x), `04_cmdk.js thiếu ${x}`);
  // lõi nạp trước 01_workflow (server nạp features/*.js theo tên)
  const files = fs.readdirSync(new URL('../../studio/features/', import.meta.url)).filter(f => f.endsWith('.js')).sort();
  assert.ok(files.indexOf('01_level.core.js') < files.indexOf('01_workflow.js'));
  assert.ok(files.indexOf('01_level.core.js') < files.indexOf('68_sections.core.js'));
});
