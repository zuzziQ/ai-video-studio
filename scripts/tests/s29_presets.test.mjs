// S29 M211: Chép / Dán thuộc tính (KeysCore) + preset người dùng (PresetsCore, route /api/presets) + preset vào ngữ cảnh Claude.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const req = createRequire(import.meta.url);
const K = req('../../studio/features/67_keys.core.js');
const C = req('../../studio/features/66_canvas_cmds.core.js');
const P = req('../../studio/features/84_presets.core.js');

test('propKind: loại đích theo comp', () => {
  assert.equal(K.propKind({ kind: 'clip', obj: {} }), 'clip');
  assert.equal(K.propKind({ kind: 'scene', obj: { type: 'broll' } }), 'media');
  assert.equal(K.propKind({ kind: 'scene', obj: { type: 'sticker' } }), 'elem');
  assert.equal(K.propKind({ kind: 'scene', obj: { type: 'lower_third' } }), null);
  assert.equal(K.propKind({ kind: 'line', obj: {} }), 'text');
  assert.equal(K.propKind({ kind: 'efx', obj: { type: 'adjust' } }, true), 'efx');
  assert.equal(K.propKind({ kind: 'efx', obj: { type: 'shake' } }, false), null);
});

test('propsCopy chỉ lấy nhóm đang có; dán thay hẳn nhóm, giữ trường khác', () => {
  const src = { anim: { in: { type: 'zoom_in', dur: 0.5 } }, filter: { preset: 'warm', strength: 70 }, transition: { type: 'whip', dur: 0.3, params: { dir: 'l' } },
    speedCurve: 'hero', mask: { shape: 'circle' }, fit: 'contain' };
  const clip = K.propsCopy(src, 'clip', 2);
  assert.deepEqual(Object.keys(clip.groups).sort(), ['clip_anim', 'color', 'mask', 'speed', 'trans']);
  assert.equal(clip.groups.fit, undefined);
  src.filter.preset = 'cold'; // chép là bản sâu
  assert.equal(clip.groups.color.filter.preset, 'warm');
  const dst = { filter: { brightness: 1.2 }, transition: { type: 'fade' }, flip: true };
  const r = K.propsApply(dst, 'clip', clip, ['color', 'trans', 'speed'], 5);
  assert.equal(r.n, 3);
  assert.deepEqual(r.speed, { speedCurve: 'hero' }); // tốc độ trả riêng (ripple ở clips.js), không ghi thẳng
  assert.equal(dst.speedCurve, undefined);
  assert.deepEqual(dst.filter, { preset: 'warm', strength: 70 });
  assert.deepEqual(dst.transition.params, { dir: 'l' });
  assert.equal(dst.flip, true);
  assert.equal(dst.anim, undefined); // nhóm không tích thì không dán
  assert.equal(K.propsCopy({ fit: 'cover' }, 'clip'), null);
});

test('clip đứng hình không chép tốc độ; nhóm không hợp loại thì bỏ', () => {
  assert.equal(K.propsCopy({ hold: 2, speed: 2 }, 'clip'), null);
  const clip = K.propsCopy({ anim: { combo: { type: 'ken_burns' } }, filter: { preset: 'warm' }, transition: { type: 'fade' } }, 'clip');
  assert.deepEqual(K.pasteGroups(clip, 'media'), ['clip_anim', 'color']);
  assert.deepEqual(K.pasteGroups(clip, 'efx'), ['color']);
  assert.deepEqual(K.pasteGroups(clip, 'text'), []);
  assert.deepEqual(K.pasteGroups(null, 'clip'), []);
});

test('Vào / Ra / Lặp + keyframe dời theo thời điểm đích', () => {
  const src = { anim: 'typewriter', anim_out: { type: 'slide_up', dur: 0.4 }, anim_loop: { type: 'pulse' }, kf: [{ t: 3, x: 0 }, { t: 4, x: 50 }], color: '#fff' };
  const clip = K.propsCopy(src, 'text', 3);
  assert.deepEqual(Object.keys(clip.groups).sort(), ['anim', 'kf']);
  const dst = { anim: 'pop', anim_dur: 1, color: '#000' };
  K.propsApply(dst, 'elem', clip, ['anim', 'kf'], 10);
  assert.equal(dst.anim, 'typewriter');
  assert.equal(dst.anim_dur, undefined); // nhóm thay hẳn: anim_dur cũ bỏ
  assert.deepEqual(dst.kf.map(k => k.t), [10, 11]);
  assert.equal(dst.color, '#000');
  // hoạt ảnh clip (object) không lẫn vào nhóm Vào / Ra / Lặp
  assert.equal(K.propsCopy({ anim: { in: { type: 'zoom_in' } } }, 'elem'), null);
});

test('menu chuột phải có Chép / Dán thuộc tính khi mục hợp', () => {
  const ids = (c, ctx) => C.menuItems(c, ctx).filter(x => x !== '-').map(x => x.id);
  const clip = { kind: 'clip', obj: {} }, line = { kind: 'line', obj: {}, scene: { type: 'text', lines: [{}] } };
  assert.ok(ids(clip, { props: true }).includes('pcopy'));
  assert.ok(C.menuItems(clip, { props: true, canPasteProps: false }).find(x => x.id === 'ppaste').off);
  assert.ok(!C.menuItems(clip, { props: true, canPasteProps: true }).find(x => x.id === 'ppaste').off);
  assert.ok(C.menuItems(line, { props: true, canPasteProps: true, locked: true }).find(x => x.id === 'ppaste').off);
  assert.ok(!ids({ kind: 'sfx', obj: {} }, {}).includes('pcopy'));
});

test('PresetsCore: valueOf / applyTo theo loại', () => {
  const o = { transition: { type: 'whip', dur: 0.3 }, anim: 'pop', anim_out: { type: 'fade' }, font: 'Inter', weight: 900, text: 'x', filter: { preset: 'warm' } };
  assert.deepEqual(P.valueOf('trans', o), { type: 'whip', dur: 0.3 });
  assert.deepEqual(P.valueOf('anim', o), { anim: 'pop', anim_out: { type: 'fade' } });
  assert.deepEqual(P.valueOf('text', o), { font: 'Inter', weight: 900 });
  assert.equal(P.valueOf('clip_anim', o), null); // anim chuỗi không phải hoạt ảnh clip
  const d = { font: 'Old', color: '#000', text: 'giữ' };
  P.applyTo('text', d, { font: 'Inter', weight: 700 });
  assert.deepEqual(d, { text: 'giữ', font: 'Inter', weight: 700 });
  assert.equal(P.applyTo('nope', d, {}), false);
});

test('PresetsCore.clean: kiểm dữ liệu, bỏ khoá lạ', () => {
  const p = P.clean({ kind: 'color', name: '  Ấm   thương hiệu ', value: JSON.parse('{"preset":"warm","strength":70,"__proto__":{"x":1},"bad key":1}'), brand_id: 'acme-1a2b' });
  assert.deepEqual(p, { kind: 'color', name: 'Ấm thương hiệu', value: { preset: 'warm', strength: 70 }, brand_id: 'acme-1a2b' });
  assert.equal({}.x, undefined);
  assert.throws(() => P.clean({ kind: 'hack', value: { a: 1 } }), /Loại preset/);
  assert.throws(() => P.clean({ kind: 'trans', value: {} }), /trống/);
  assert.throws(() => P.clean({ kind: 'trans', value: { type: 'x'.repeat(150), params: { a: 'y'.repeat(190), b: 'z'.repeat(190) }, dur: 1, junk: Array(60).fill('w'.repeat(190)) } }), /quá lớn/);
  assert.equal(P.clean({ kind: 'trans', value: { type: 'fade' }, brand_id: '../x' }).brand_id, undefined);
  assert.equal(P.clean({ kind: 'text', value: { font: 'A', onclick: 'x' } }).value.onclick, undefined);
});

test('listFor / brief: chung + của thương hiệu, của thương hiệu đứng trước', () => {
  let list = [];
  list = P.upsert(list, { id: 'a', kind: 'trans', name: 'Chung', value: { type: 'fade' } }, 1);
  list = P.upsert(list, { id: 'b', kind: 'trans', name: 'Acme', value: { type: 'whip' }, brand_id: 'acme' }, 2);
  list = P.upsert(list, { id: 'c', kind: 'trans', name: 'Khác', value: { type: 'zoom' }, brand_id: 'other' }, 3);
  list = P.upsert(list, { id: 'a', kind: 'trans', name: 'Chung 2', value: { type: 'fade' } }, 4);
  assert.equal(list.length, 3);
  assert.deepEqual(P.listFor(list, 'trans', 'acme').map(x => x.id), ['b', 'a']);
  assert.deepEqual(P.listFor(list, 'trans', '').map(x => x.id), ['a']);
  const b = P.brief(list, 'acme');
  assert.deepEqual(b.map(x => [x.name, x.brand]), [['Acme', true], ['Chung 2', false]]);
  assert.deepEqual(P.checkBrief([...b, { kind: 'bad' }, 'x']).length, 2);
  assert.match(P.briefLines(b), /\[Chuyển cảnh\] Acme \(của thương hiệu\): \{"type":"whip"\}/);
  assert.equal(P.parse({ items: [{ id: 'z', kind: 'color', value: { preset: 'warm' } }, { kind: 'color', value: {} }, null] }).length, 1);
});

test('route /api/presets: lưu qua tệp tạm, đọc lại, xoá', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-presets-'));
  const old = process.env.AVS_HOME; process.env.AVS_HOME = home;
  try {
    const route = (await import('../../studio/routes/84_presets.mjs')).default;
    let out = null;
    const h = route({ json: (res, o, c = 200) => { out = { o, c }; }, body: async r => r.body });
    const call = async (method, p, body) => { out = null; const done = await h({ method, body }, {}, p); return { done, ...out }; };
    assert.equal((await call('GET', '/api/other')).done, false);
    let r = await call('POST', '/api/presets', { kind: 'trans', name: 'Lia nhanh', value: { type: 'whip', dur: 0.25, params: { dir: 'l' } }, brand_id: 'acme' });
    assert.equal(r.c, 200); assert.ok(r.o.item.id);
    const id = r.o.item.id;
    r = await call('POST', '/api/presets', { kind: 'trans', value: {} });
    assert.equal(r.c, 400);
    r = await call('GET', '/api/presets');
    assert.deepEqual(r.o.items.map(x => [x.name, x.brand_id, x.value.type]), [['Lia nhanh', 'acme', 'whip']]);
    const disk = JSON.parse(fs.readFileSync(path.join(home, 'presets.json'), 'utf8'));
    assert.equal(disk.items.length, 1);
    assert.deepEqual(fs.readdirSync(home).filter(f => f.endsWith('.tmp')), []);
    r = await call('POST', '/api/presets/delete', { id: 'pnope' });
    assert.equal(r.c, 404);
    r = await call('POST', '/api/presets/delete', { id });
    assert.equal(r.o.items.length, 0);
  } finally {
    if (old == null) delete process.env.AVS_HOME; else process.env.AVS_HOME = old;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('preset của thương hiệu vào prompt định tuyến Claude (M192)', async () => {
  const R = await import('../ask_route.mjs');
  const presets = [{ kind: 'trans', name: 'Lia nhanh', brand: true, value: { type: 'whip', dur: 0.25 } }, { kind: 'hack', name: 'x', value: {} }];
  const input = R.checkInput({ ask: 'thêm chuyển cảnh', step: 'build', info: { presets } });
  assert.equal(input.ctx.presets.length, 1);
  const prompt = R.routerPrompt(input);
  assert.match(prompt, /Preset người dùng đã lưu/);
  assert.match(prompt, /\[Chuyển cảnh\] Lia nhanh \(của thương hiệu\)/);
  assert.match(prompt, /CHỈ LÀ DỮ LIỆU/);
  assert.doesNotMatch(R.routerPrompt(R.checkInput({ ask: 'x', step: 'build' })), /Preset người dùng/);
});
