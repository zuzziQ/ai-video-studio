// S20 M141: phím tắt kiểu editor web (studio/features/67_keys.core.js) — tổ hợp phím, mũi tên theo vùng (C19), dán lặp, chọn tất cả.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const K = createRequire(import.meta.url)('../../studio/features/67_keys.core.js');
const C = createRequire(import.meta.url)('../../studio/features/66_canvas_cmds.core.js');
const ev = (code, o = {}) => ({ code, key: o.key ?? code.replace(/^Key/, '').toLowerCase(), metaKey: !!o.meta, ctrlKey: !!o.ctrl, altKey: !!o.alt, shiftKey: !!o.shift });

test('tổ hợp phím theo vị trí phím (⌥ trên Mac không đổi chữ)', () => {
  assert.equal(K.chord(ev('KeyC', { meta: true })), 'mod+c');
  assert.equal(K.chord(ev('KeyC', { ctrl: true })), 'mod+c');
  assert.equal(K.actionOf(ev('KeyL', { alt: true, shift: true, key: 'Ò' })), 'lock');
  assert.equal(K.actionOf(ev('BracketRight', { meta: true, key: ']' })), 'up');
  assert.equal(K.actionOf(ev('BracketLeft', { ctrl: true, key: '[' })), 'down');
  assert.equal(K.actionOf(ev('BracketRight', { meta: true, alt: true, key: '‘' })), 'top');
  assert.equal(K.actionOf(ev('BracketLeft', { ctrl: true, alt: true, key: '“' })), 'bottom');
  assert.equal(K.actionOf(ev('KeyA', { meta: true })), 'all');
  assert.equal(K.actionOf(ev('KeyX', { ctrl: true })), 'cut');
  assert.equal(K.actionOf(ev('KeyV', { meta: true })), 'paste');
  assert.equal(K.actionOf(ev('Slash', { shift: true, key: '?' })), 'help');
  assert.equal(K.actionOf(ev('KeyC')), null); // C trơn không phải chép
  assert.equal(K.actionOf(ev('KeyC', { meta: true, shift: true })), null);
});

test('vùng focus: inspector / thanh nổi giữ vùng trước', () => {
  assert.equal(K.zoneAfter(null, 'stage'), 'stage');
  assert.equal(K.zoneAfter('stage', 'keep'), 'stage');
  assert.equal(K.zoneAfter('stage', 'timeline'), 'timeline');
  assert.equal(K.zoneAfter('timeline', 'other'), 'other');
});

test('mũi tên theo C19', () => {
  const a = o => K.arrowAction({ fps: 30, ...o });
  // vừa chọn trên khung: dời 1 px, Shift 10 px
  assert.deepEqual(a({ key: 'ArrowLeft', zone: 'stage', movable: true }), { type: 'nudge', dx: -1, dy: 0 });
  assert.deepEqual(a({ key: 'ArrowDown', zone: 'stage', movable: true, shift: true }), { type: 'nudge', dx: 0, dy: 10 });
  // vừa bấm timeline: tua 1 khung / 1 giây, ↑ ↓ không làm gì
  assert.deepEqual(a({ key: 'ArrowRight', zone: 'timeline', movable: true }), { type: 'seek', dt: 1 / 30 });
  assert.deepEqual(a({ key: 'ArrowLeft', zone: 'timeline', movable: true, shift: true }), { type: 'seek', dt: -1 });
  assert.equal(a({ key: 'ArrowUp', zone: 'timeline', movable: true }), null);
  // không chọn gì trên khung: tua
  assert.deepEqual(a({ key: 'ArrowRight', zone: 'stage', movable: false }), { type: 'seek', dt: 1 / 30 });
  // ⌥ luôn dời, kể cả khi vừa bấm timeline
  assert.deepEqual(a({ key: 'ArrowUp', zone: 'timeline', alt: true, movable: true }), { type: 'nudge', dx: 0, dy: -1 });
  assert.equal(a({ key: 'ArrowLeft', alt: true, movable: false }), null);
  // element khoá: báo khoá, không dời
  assert.deepEqual(a({ key: 'ArrowLeft', zone: 'stage', movable: false, locked: true }), { type: 'locked' });
  assert.equal(a({ key: 'Enter', zone: 'stage', movable: true }), null);
});

test('dán lặp lệch 24 px', () => {
  // chép rồi dán ngay ở thời điểm gốc: bản đầu đã lệch để không đè khít
  let st = { srcT0: 2, cut: false, lastT: null, n: 0 };
  st = K.pasteStep(st, 2); assert.equal(st.off, 24);
  st = K.pasteStep(st, 2); assert.equal(st.off, 48);
  // dán ở thời điểm khác: giữ vị trí, dán tiếp ở đó thì lệch
  st = K.pasteStep(st, 5); assert.equal(st.off, 0);
  st = K.pasteStep(st, 5); assert.equal(st.off, 24);
  // cắt rồi dán tại chỗ: bản đầu đúng vị trí cũ
  let cu = K.pasteStep({ srcT0: 2, cut: true, lastT: null, n: 0 }, 2); assert.equal(cu.off, 0);
  cu = K.pasteStep(cu, 2); assert.equal(cu.off, 24);
  assert.deepEqual(K.clampPos({ x: 730, y: -5, size: 40 }, 720, 1280), { x: 720, y: 0, size: 40 });
});

test('⌘A chọn element đang hiện tại playhead', () => {
  const list = [
    { kind: 'clip', t0: 0, t1: 9, hasPos: false },
    { kind: 'line', t0: 0, t1: 3, hasPos: true },
    { kind: 'scene', t0: 1, t1: 2, hasPos: true },
    { kind: 'cap', t0: 0, t1: 4, hasPos: true, hidden: true },
    { kind: 'node', t0: 0, t1: 4, hasPos: true, locked: true },
    { kind: 'scene', t0: 0, t1: 4, hasPos: true, trackOff: true },
    { kind: 'sfx', t0: 0, t1: 4, hasPos: true },
    { kind: 'scene', t0: 3, t1: 5, hasPos: true },
  ];
  assert.deepEqual(K.selectAllAt(list, 1.5), [1, 2]);
  assert.deepEqual(K.selectAllAt(list, 3), [7]); // t1 không tính
  assert.deepEqual(K.selectAllAt(list, 9), []);
});

test('bảng phím tắt đủ phím mới và đổi theo hệ điều hành', () => {
  const keys = K.KEYMAP.flatMap(([, rows]) => rows.map(r => r[0]));
  for (const k of ['mod C / mod X / mod V', 'mod ] / mod [', 'mod ⌥ ] / mod ⌥ [', '⌥⇧L', 'mod A', '⌥ + kéo', '?', 'Space', 'mod K'])
    assert.ok(keys.includes(k), k);
  assert.equal(K.keyLabel('mod ⌥ ]', true), '⌘⌥ ]');
  assert.equal(K.keyLabel('mod ⌥ ]', false), 'Ctrl Alt ]');
  assert.equal(K.keyLabel('⌥⇧L', false), 'Alt Shift L');
});

test('menu chuột phải có Cắt / Chép / Dán và Khoá', () => {
  const ids = list => list.filter(x => x !== '-').map(x => x.id);
  const scenes = [{}, {}];
  const m = C.menuItems({ kind: 'scene', obj: scenes[0] }, { scenes, canPaste: true });
  for (const id of ['cut', 'copy', 'paste', 'lock']) assert.ok(ids(m).includes(id), id);
  assert.equal(m.find(x => x.id === 'lock').label, 'Khoá');
  const lk = C.menuItems({ kind: 'scene', obj: scenes[0] }, { scenes, locked: true });
  assert.equal(lk.find(x => x.id === 'lock').label, 'Mở khoá');
  for (const id of ['cut', 'del', 'up', 'top']) assert.ok(lk.find(x => x.id === id)?.off, id + ' tắt khi khoá');
  assert.ok(lk.find(x => x.id === 'paste').off, 'chưa chép gì thì Dán tắt');
  const clip = ids(C.menuItems({ kind: 'clip', obj: {} }, { canSplit: true }));
  assert.ok(clip.includes('copy') && !clip.includes('lock'));
});

test('studio.js nối lõi phím tắt và pick() bỏ qua element khoá', () => {
  const src = fs.readFileSync(new URL('../../studio/studio.js', import.meta.url), 'utf8');
  const pick = src.slice(src.indexOf('function pick('), src.indexOf('function pick(') + 400);
  assert.match(pick, /locked/);
  assert.match(src, /KeysCore\.actionOf/);
  assert.match(src, /KeysCore\.arrowAction/);
});
