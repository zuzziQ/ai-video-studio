// S27 M192 · Claude nhớ gu của từng thương hiệu: khối / SFX / nhạc bị xoá sau AI dựng, phương án mẫu dựng sẵn được chọn / bỏ,
// element Claude dựng được giữ → thói quen có khoá (xem / tắt / xoá ở Thương hiệu), gu vào prompt có giới hạn độ dài.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
process.env.AVS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-m192-'));
const P = await import('../profile.mjs');
const { applyLearned } = await import('../ai_edit.mjs');
const { variantArgs, VARIANTS } = await import('../script_draft.mjs');
const { makePrompt, checkMakeInput } = await import('../elem_make.mjs');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const sc = (type, extra = {}) => ({ type, t0: 1, t1: 3, _ai: true, ...extra });
const tl = (scenes, sfx = [], music = []) => ({ scenes, audio: { sfx, music } });
// một video: AI đặt 2 counter + 1 lower_third + 1 celem, người dùng xoá cả 2 counter, giữ celem, bỏ nhạc mood "tech", xoá SFX whoosh
const before = tl([sc('counter'), sc('counter', { t0: 5, t1: 7 }), sc('lower_third'), sc('celem'), sc('frame', { _base: true })],
  [{ t: 1, name: 'whoosh', _ai: true }, { t: 4, name: 'pop', _ai: true }], [{ t0: 0, t1: 30, mood: 'tech', _ai: true }]);
const after = tl([sc('lower_third', { _orig: { t0: 1 } }), sc('celem'), sc('frame', { _base: true })], [{ t: 4, name: 'pop', _ai: true }], []);

test('tasteDiff: đếm khối theo loại (bỏ _base), SFX theo tên, mood nhạc AI bị bỏ, khối sửa tay', () => {
  const d = P.tasteDiff(before, after);
  assert.deepEqual(d.types.counter, [2, 0]);
  assert.deepEqual(d.types.lower_third, [1, 1]);
  assert.deepEqual(d.types.celem, [1, 1]);
  assert.equal(d.types.frame, undefined, 'lớp nền _base không tính');
  assert.deepEqual(d.sfxs.whoosh, [1, 0]);
  assert.deepEqual(d.moods, [['tech'], ['tech']]);
  assert.equal(d.touched, 1);
  // khối theo kịch bản (_script, không _ai) cũng là khối Claude đặt
  assert.deepEqual(P.tasteDiff(tl([{ type: 'quote', t0: 0, t1: 2, _script: { id: 'a' } }]), tl([])).types.quote, [1, 0]);
  const o = P.observe(before, after);
  assert.ok(o.types && o.sfxs && o.edited, 'observe kèm phần gu');
});

const obs = (t, b = before, a = after) => ({ ...P.observe(b, a), t });

test('deriveRules: xoá cùng loại ở ≥ 2 video → avoid:/avoid_sfx:/avoid_mood:, giữ celem → elem_keep; 1 video chưa đủ', () => {
  const one = P.deriveRules({ projects: { a: obs('2026-11-01') } });
  assert.ok(!one.items.some(i => i.key.startsWith('avoid')), 'một video chưa thành gu');
  const L = { projects: { a: obs('2026-11-01'), b: obs('2026-11-02') } };
  const r = P.deriveRules(L), keys = r.items.map(i => i.key);
  assert.ok(keys.includes('avoid:counter'));
  assert.ok(!keys.includes('avoid:lower_third'), 'khối được giữ không bị tránh');
  assert.ok(keys.includes('avoid_sfx:whoosh') && !keys.includes('avoid_sfx:pop'));
  assert.ok(keys.includes('avoid_mood:tech'));
  assert.ok(keys.includes('elem_keep'));
  assert.deepEqual(r.adjust.avoid, ['counter']);
  assert.deepEqual(r.adjust.avoid_sfx, ['whoosh']);
  // xoá được (forget) và tắt được (off): khoá khớp setHabit
  for (const k of keys) assert.match(k, /^[a-z_]{2,20}(:.{1,40})?$/);
  const f = P.deriveRules({ ...L, forgot: { 'avoid:counter': '2026-11-05' } });
  assert.ok(!f.items.some(i => i.key === 'avoid:counter'), 'quên = bỏ các quan sát tới lúc đó');
  const off = P.deriveRules({ ...L, off: ['avoid:counter'] });
  assert.equal(off.items.find(i => i.key === 'avoid:counter').off, true);
  assert.ok(!(off.adjust.avoid || []).includes('counter'));
  // emoji / chữ / ảnh đã có luật drop_* riêng: không lặp thành avoid:
  const e = tl([sc('emoji_pop'), sc('emoji_pop'), sc('emoji_pop')]);
  assert.ok(!P.deriveRules({ projects: { a: obs('1', e, tl([])), b: obs('2', e, tl([])) } }).items.some(i => i.key === 'avoid:emoji_pop'));
});

test('phương án mẫu dựng sẵn: chọn cùng nhịp / gói ≥ 2 lần → pick_pace / pick_pack; gói bị bỏ qua ≥ 3 lần → skip_pack:', () => {
  const pk = (t, pack, density, skipped) => ({ t, draft: 'd' + t, id: 'x', pack, density, skipped });
  const S = [{ id: 'brand', pack: 'slate', density: 'vua' }, { id: 'calm', pack: 'luxury', density: 'thua' }];
  const L = { picks: [pk('1', 'kinetic', 'day', S), pk('2', 'kinetic', 'day', S), pk('3', 'neon', 'day', S)] };
  const r = P.deriveRules(L), keys = r.items.map(i => i.key);
  assert.equal(r.adjust.pace, 'day');
  assert.equal(r.adjust.pick_pack, 'kinetic');
  assert.ok(keys.includes('skip_pack:slate') && keys.includes('skip_pack:luxury'));
  assert.ok(!keys.includes('skip_pack:kinetic'), 'gói đã chọn không bị coi là bỏ');
});

test('recordPick / recordElem / setHabit ghi vào phong cách thương hiệu; habitsFor: extra có gu, giới hạn độ dài', () => {
  const V = [{ k: 1, id: 'brand', name: 'Theo thương hiệu', pack: 'slate', density: 'vua' }, { k: 2, id: 'fast', name: 'Nhịp nhanh', pack: 'kinetic', density: 'day' },
    { k: 3, id: 'calm', name: 'Thoáng', pack: 'luxury', density: 'thua' }];
  P.recordPick('chung', { draft: 'd1', pick: V[1], others: [V[0], V[2]] });
  P.recordPick('chung', { draft: 'd1', pick: V[1], others: [V[0], V[2]] }); // chọn lại cùng bản nháp: thay, không đếm đôi
  assert.equal(P.getProfile('chung').learned.picks.length, 1);
  P.recordPick('chung', { draft: 'd2', pick: V[1], others: [V[0], V[2]] });
  P.recordElem('chung', 'Nhãn giá <b>"đỏ"</b>'); P.recordElem('chung', 'Khung bo');
  const h = P.habitsFor('chung');
  assert.equal(h.adjust.pace, 'day');
  assert.ok(h.items.some(i => i.key === 'elem_keep'));
  assert.match(h.extra, /Nhịp người dùng hay chọn: dày/);
  assert.match(h.extra, /element riêng/);
  assert.ok(!/[<>"]/.test(P.getProfile('chung').learned.elems.map(e => e.name).join('')), 'tên element lọc ký tự lạ');
  const L = P.learnedOf(h);
  assert.equal(L.brand, 'Chung'); assert.ok(L.notes.length >= 2);
  assert.match(P.elemTaste('chung'), /Element người dùng đã giữ/);
  // xoá từng mục ở Thương hiệu: forget → mất khỏi danh sách
  P.setHabit('chung', 'pick_pace', 'forget');
  assert.ok(!P.habitsFor('chung').items.some(i => i.key === 'pick_pace'));
  // tắt "Học từ chỉnh sửa" → không ghi
  P.upsertProfile({ id: 'chung', learn: false });
  assert.equal(P.recordPick('chung', { draft: 'd3', pick: V[0] }), null);
  P.upsertProfile({ id: 'chung', learn: true });
  // giới hạn độ dài
  assert.ok(P.capText(Array.from({ length: 50 }, (_, i) => 'Câu gu số ' + i + ' khá dài để vượt giới hạn.')).length <= P.TASTE_MAX);
});

test('applyLearned: bỏ khối / SFX người dùng hay xoá, giữ mục theo kịch bản và lớp nền', () => {
  const plan = { scenes: [sc('counter'), sc('counter', { _sheet: 0 }), sc('frame', { _base: true }), sc('quote')], sfx: [{ name: 'whoosh_2' }, { name: 'pop' }], music: null, dropped: [] };
  const out = applyLearned(plan, { avoid: ['counter', 'frame'], avoid_sfx: ['whoosh'], notes: ['x'] });
  assert.deepEqual(out.scenes.map(s => s.type), ['counter', 'frame', 'quote']);
  assert.equal(out.scenes[0]._sheet, 0);
  assert.deepEqual(out.sfx.map(x => x.name), ['pop']);
  assert.ok(out.dropped.some(d => /gu thương hiệu/.test(d)));
});

test('mẫu dựng sẵn: --taste cho mọi phương án, phương án thương hiệu theo nhịp hay chọn', () => {
  const a = variantArgs(VARIANTS[0], [], { brand: 'chung', pace: 'day' });
  assert.equal(a[a.indexOf('--density') + 1], 'day');
  assert.equal(a[a.indexOf('--taste') + 1], 'chung');
  const c = variantArgs(VARIANTS[2], [], { brand: 'chung', pace: 'day' });
  assert.equal(c[c.indexOf('--density') + 1], 'thua', 'phương án thoáng giữ nhịp riêng');
  assert.ok(!variantArgs(VARIANTS[0]).includes('--taste'));
});

test('element riêng: gu vào prompt, có giới hạn', () => {
  const input = checkMakeInput({ ask: 'nhãn giá', frame: { w: 1080, h: 1920 } });
  input.taste = 'Element người dùng đã giữ: “Khung bo”.' + 'x'.repeat(900);
  const p = makePrompt(input);
  assert.match(p, /Gu của thương hiệu/);
  assert.ok(!p.includes('x'.repeat(400)), 'cắt ở 300 ký tự');
  assert.doesNotMatch(makePrompt({ ...input, taste: '' }), /Gu của thương hiệu/);
});

test('nối dây: route ghi gu khi dùng / lưu phương án và khi Nhận element; AI dựng đọc gu; ai_edit --taste', () => {
  const d = src('studio/routes/32_scriptdraft.mjs');
  assert.match(d, /recordPick\(/); assert.match(d, /saveDelivered\(dest, 'draft'\)/);
  assert.equal((d.match(/^\s+taste\(d, id, info, r/gm) || []).length, 2, 'cả Dùng cho video mới lẫn Lưu thành mẫu');
  const e = src('studio/routes/72_celem.mjs');
  assert.match(e, /recordElem\(/); assert.match(e, /input\.taste = P\.elemTaste/);
  const a = src('studio/routes/20_ai.mjs');
  assert.match(a, /learnedOf\(h/); assert.match(a, /a\.pace/);
  assert.match(src('scripts/ai_edit.mjs'), /opt\('--taste'\)/);
  // không thêm panel cài đặt: hiện ở Thương hiệu qua habitRows sẵn có
  assert.match(src('studio/features/51_brands.js'), /habitRows/);
});
