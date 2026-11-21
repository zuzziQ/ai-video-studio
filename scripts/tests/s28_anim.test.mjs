// S28 M205: bộ hoạt ảnh chung { in, out, loop } (engine/fx_registry.js) cho chữ, hình khối, element riêng, sticker.
// Timeline cũ không được đổi hình: so HTML của textLine / stickerHTML mới với bản chép đông cứng trước M205, và băm khung
// shape / celem cũ (băm lấy từ engine trước M205). Rồi kiểm Ra đối xứng, Lặp, thời lượng riêng, phong bì ENV.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const req = createRequire(import.meta.url);
const FX = req('../../engine/fx_registry.js');
const SH = req('../../engine/shape.js');
const CE = req('../../engine/celem.js');
const AC = req('../../studio/features/75_ask.core.js');
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ---- môi trường engine tối thiểu để chạy engine/vertical.js trong vm ----
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const E = {
  outCubic: k => 1 - Math.pow(1 - k, 3), inCubic: k => k * k * k,
  outExpo: k => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)), inOutSine: k => -(Math.cos(Math.PI * k) - 1) / 2,
  outBack: (k, s = 1.70158) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2),
};
const prog = (t, t0, dur) => clamp((t - t0) / dur);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const ENV0 = { clamp, lerp, E, prog, esc, FX, CDN: '', MODULES: {}, url: p => p, emoji: ch => `<e>${ch}</e>`, rnd: () => .5 };
const ctx = vm.createContext({ ...ENV0 });
vm.runInContext(read('engine/vertical.js') + '\n;globalThis.__v = { textLine, stickerHTML, lines, TEXT_STYLE };', ctx);
const V = ctx.__v;

// ---- bản chép đông cứng của engine/vertical.js trước M205 (đừng sửa: đây là "hình cũ") ----
const TEXT_STYLE = V.TEXT_STYLE; // kiểu chữ không đổi ở M205
function oldTextLine(L, t, sceneOut) {
  if (t < L.t || L.hidden) return '';
  const lt = t - L.t, size = L.size || 48, x = L.x ?? 720 / 2, y = L.y;
  const tout = L.out ?? sceneOut;
  let o = 1;
  if (tout != null) o *= 1 - E.inCubic(prog(t, tout - .12, .12));
  const style = (TEXT_STYLE[L.style || 'white'] || TEXT_STYLE.white)();
  const txt = L.upper === false ? L.text : (L.upper ? L.text.toUpperCase() : L.text);
  const base = `position:absolute;left:${x}px;top:${y}px;font-family:${L.font || 'var(--disp)'};font-weight:${L.weight || 900};font-style:${L.italic === false ? 'normal' : 'italic'};
    font-size:${size}px;line-height:1.05;white-space:nowrap;letter-spacing:-.01em;${style};${L.color ? `color:${L.color};` : ''}`;
  let tr = '', fl = '', inner = esc(txt);
  const a = L.anim || 'pop';
  if (a === 'pop') { const k = E.outBack(prog(lt, 0, .28), 2); tr = `scale(${lerp(.3, 1, k).toFixed(3)})`; o *= clamp(lt / .12); }
  if (a === 'fade') o *= E.outCubic(prog(lt, 0, .25));
  if (a === 'slide_l' || a === 'slide_r') {
    const k = E.outExpo(prog(lt, 0, .35)), dir = a === 'slide_l' ? -1 : 1;
    tr = `translateX(${(dir * (1 - k) * 420).toFixed(1)}px) skewX(${(dir * (1 - k) * -12).toFixed(1)}deg)`; fl = `blur(${((1 - k) * 10).toFixed(1)}px)`;
  }
  if (a === 'drop') { const k = E.outBack(prog(lt, 0, .3), 1.6); tr = `translateY(${((1 - k) * -90).toFixed(1)}px)`; o *= clamp(lt / .1); }
  if (a === 'blur_zoom') { const k = E.outCubic(prog(lt, 0, .35)); tr = `scale(${lerp(1.7, 1, k).toFixed(3)})`; fl = `blur(${((1 - k) * 16).toFixed(1)}px)`; o *= clamp(lt / .1); }
  if (a === 'fly') {
    const hold = L.hold ?? .25, fk = E.inOutSine(prog(lt, .2 + hold, .22)), pk = E.outBack(prog(lt, 0, .25), 2);
    const fx = (L.from_x ?? x) - x, fy = (L.from_y ?? y + 120) - y, fs = L.from_scale ?? .8;
    tr = `translate(${(fx * (1 - fk)).toFixed(1)}px,${(fy * (1 - fk)).toFixed(1)}px) scale(${(lerp(.3, fs, pk) * (1 - fk) + fk).toFixed(3)})`;
    o *= clamp(lt / .1);
  }
  if (a === 'tumble' || a === 'type') {
    const chars = [...txt], st = L.stagger ?? (a === 'type' ? .035 : .06);
    inner = chars.map((c, i) => {
      const k = prog(lt, i * st, a === 'type' ? .001 : .28);
      if (k <= 0) return `<span style="opacity:0">${esc(c)}</span>`;
      if (a === 'type') return esc(c);
      const e = E.outBack(k, 1.8);
      return `<span style="display:inline-block;white-space:pre;opacity:${clamp(k * 3).toFixed(2)};transform:perspective(300px) rotateX(${((1 - e) * -95).toFixed(1)}deg) translateY(${((1 - e) * 26).toFixed(1)}px)">${esc(c)}</span>`;
    }).join('');
  }
  return `<div${L.cid ? ` data-cid="${L.cid}"` : ''} style="${base}transform:translate(-50%,-50%) ${tr};filter:${fl || 'none'};opacity:${o.toFixed(3)}">${inner}</div>`;
}
function oldSticker(st, t) {
  if (!st || t < st.t) return '';
  const lt = t - st.t, sz = st.size || 320, x = st.x ?? 360, y = st.y ?? 960;
  const from = st.from || 'left', k = E.outCubic(prog(lt, 0, .3)), dir = from === 'left' ? -1 : from === 'right' ? 1 : 0;
  const trUp = from === 'up' || from === 'down'
    ? `translateY(${((from === 'up' ? 1 : -1) * (1 - E.outBack(prog(lt, 0, .35), 1.4)) * 420).toFixed(1)}px)` : '';
  let tr = trUp || (from === 'pop' ? `scale(${lerp(.2, 1, E.outBack(prog(lt, 0, .3), 2)).toFixed(3)})` : `translateX(${(dir * (1 - k) * 520).toFixed(1)}px)`);
  tr += ` ${st.bob === false ? '' : `rotate(${(Math.sin(lt * 2.2) * 2).toFixed(2)}deg)`}`;
  const blur = from === 'pop' ? 0 : trUp ? (1 - k) * 8 : (1 - k) * 18;
  const ol = st.outline ?? 7;
  const outline = Array.from({ length: 12 }, (_, i) => { const r = i / 12 * Math.PI * 2; return `drop-shadow(${(Math.cos(r) * ol).toFixed(1)}px ${(Math.sin(r) * ol).toFixed(1)}px 0 #fff)`; }).join(' ');
  const inner = /\.(png|jpe?g|webp|svg|gif)$/i.test(st.src || '') || /^(https?:|data:)/.test(st.src || '')
    ? `<img src="${st.src}" style="width:100%;height:100%;object-fit:contain">` : `<e>${st.src || '✅'}</e>`;
  return `<div class="abs" style="left:${x - sz / 2}px;top:${y - sz / 2}px;width:${sz}px;height:${sz}px;transform:${tr};filter:${st.outline === 0 ? '' : outline} drop-shadow(0 10px 18px rgba(0,0,0,.35)) blur(${blur.toFixed(1)}px);opacity:${clamp(lt / .08).toFixed(2)}">${inner}</div>`;
}

const TIMES = [0, .01, .05, .1, .13, .2, .27, .35, .5, .7, 1, 1.5, 2.85, 2.9, 2.95, 3, 3.1];
test('textLine: timeline cũ (anim chuỗi, không anim_out) dựng ra đúng HTML như trước M205', () => {
  const base = { text: 'Xin chào bạn', t: 0, y: 400, cid: 'c1' };
  const variants = [{}, { style: 'yellow', size: 72, upper: true }, { italic: false, x: 200, color: '#f00' }, { stagger: .02 }, { from_x: 100, from_y: 900, hold: .4, from_scale: .5 }];
  let n = 0;
  for (const anim of [undefined, ...FX.ids('anim_in'), 'la_lam']) for (const v of variants) for (const out of [undefined, 2]) {
    const L = { ...base, ...v, anim, out };
    for (const t of TIMES) for (const so of [3, null]) { assert.equal(V.textLine(L, t, so), oldTextLine(L, t, so), `${anim} t=${t}`); n++; }
  }
  assert.ok(n > 2000);
});

test('stickerHTML: sticker cũ (from, bob) dựng ra đúng như trước M205', () => {
  for (const from of [undefined, 'left', 'right', 'up', 'down', 'pop']) for (const v of [{}, { bob: false, outline: 0 }, { src: 'a.png', size: 200, x: 100 }])
    for (const t of TIMES) { const st = { t: 0, src: '🔥', from, ...v }; assert.equal(V.stickerHTML(st, t, 3), oldSticker(st, t), `${from} t=${t}`); }
});

test('shape / celem cũ: khung giống hệt bản trước M205 (băm)', () => {
  const out = [];
  const shapes = [{}, { anim: 'pop', shape: 'circle' }, { anim: 'wipe', shape: 'arrow', stroke_w: 10 }, { anim: 'spin', opacity: .5, shape: 'rounded' }];
  for (const s of shapes) for (const lt of [0, .05, .13, .2, .31, .5, 2]) out.push(SH.shape({ type: 'shape', t0: 1, t1: 4, cid: 'x', ...s }, 1 + lt, lt).front);
  const spec = { v: 1, name: 'A', w: 420, h: 160, in: 'pop', out: 'fade', layers: [{ k: 'round', x: 0, y: 0, w: 420, h: 160, r: 28, fill: '#ff0000' },
    { k: 'text', x: 20, y: 10, w: 380, h: 140, text: '{text}', size: 72, in: 'fade', delay: .15 }] };
  const B = { brand: { accent: '#FFD84A', primary: '#FF5A36', dark: '#111214', disp: 'Bungee', font: 'Inter' } };
  for (const sp of [spec, { ...spec, in: 'slide_u', out: 'none' }, { ...spec, in: 'wipe', out: 'slide_l' }])
    for (const t of [0, .1, .25, .5, 2, 2.8, 2.95, 3]) out.push(CE.render({ spec: sp, card: { x: 10, y: 20, w: 420, h: 160 }, text: 'Giá', t0: 0, t1: 3, cid: 'c' }, t, t, B).front);
  assert.equal(crypto.createHash('sha256').update(out.join('\n')).digest('hex').slice(0, 16), '53d92305dd6918cd');
});

test('registry: 9 Vào, 9 Ra đối xứng, 8 Lặp, đủ nhãn / nhóm / icon / mô tả ai', () => {
  assert.equal(FX.list('anim_in').length, 9);
  assert.deepEqual(FX.ids('anim_out'), FX.ids('anim_in'));
  assert.deepEqual(FX.ids('anim_loop'), ['pulse', 'sway', 'bounce', 'blink', 'float', 'spin', 'sparkle', 'wave']);
  for (const kind of ['anim_in', 'anim_out', 'anim_loop']) {
    const groups = FX.GROUPS[kind].map(g => g[0]);
    for (const x of FX.list(kind)) {
      assert.ok(x.label && x.icon && groups.includes(x.group) && typeof x.fn === 'function', `${kind}.${x.id}`);
      for (const f of ['mood', 'nhip', 'khi_nao', 'tranh']) assert.ok(x.ai[f], `${kind}.${x.id}.ai.${f}`);
    }
  }
  assert.equal(new Set(FX.animOutList().map(x => x[1])).size, 9);
});

test('animOf: dữ liệu cũ đọc thành in, kẹp thời lượng / tốc độ, loại lạ bỏ', () => {
  assert.deepEqual(FX.animOf({ anim: 'drop' }), { in: { type: 'drop', dur: 0 }, out: null, loop: null });
  assert.deepEqual(FX.animOf({}, 'pop').in, { type: 'pop', dur: 0 });
  assert.equal(FX.animOf({}).in, null);
  const a = FX.animOf({ anim: 'fade', anim_dur: 9, anim_out: { type: 'slide_l', dur: -1 }, anim_loop: { type: 'pulse', speed: 50 } });
  assert.deepEqual(a, { in: { type: 'fade', dur: 3 }, out: { type: 'slide_l', dur: 0 }, loop: { type: 'pulse', speed: 3 } });
  assert.equal(FX.animOf({ anim_out: { type: 'x' }, anim_loop: 'y' }).out, null);
  assert.equal(FX.animOf({ anim_loop: 'wave' }).loop.type, 'wave');
});

test('Ra đối xứng: ở lúc tắt bằng trạng thái đầu của Vào, xa lúc tắt thì không đổi gì', () => {
  const c = { x: 360, y: 400, n: 4, text: true };
  for (const id of FX.ids('anim_out')) {
    const an = { in: null, out: { type: id, dur: 0 }, loop: null };
    const far = FX.animAt(an, 5, 10, c), end = FX.animAt(an, 5, 0, c);
    const in0 = FX.animAt({ in: { type: id, dur: 0 }, out: null, loop: null }, 0, Infinity, c);
    assert.equal(end.tr, in0.tr, id);
    assert.equal(end.o, 0, `${id} tắt hẳn ở lúc tắt`);
    assert.ok(far.o === 1, `${id} còn xa lúc tắt thì hiện đủ`);
  }
  // thời lượng Ra riêng: dur 1 s thì 0.5 s trước lúc tắt mới đi nửa đường (mờ dần)
  const o1 = FX.animAt({ in: null, out: { type: 'fade', dur: 1 }, loop: null }, 5, .5).o;
  assert.ok(o1 > .3 && o1 < 1);
});

test('thời lượng Vào độc lập với thời lượng lớp: anim_dur co giãn đúng tỉ lệ', () => {
  const at = (dur, lt) => FX.animAt({ in: { type: 'blur_zoom', dur }, out: null, loop: null }, lt, Infinity, {}).tr;
  assert.equal(at(.7, .35), at(0, .175));
  assert.equal(at(1.4, 1.4), at(0, .35));
});

test('Lặp: hàm thuần theo t, chạy sau khi vào xong, sóng chữ theo từng ký tự', () => {
  const c = { n: 5, text: true };
  for (const id of FX.ids('anim_loop')) {
    const an = { in: { type: 'pop', dur: 0 }, out: null, loop: { type: id, speed: 1 } };
    assert.deepEqual(FX.animAt(an, 1.37, Infinity, c), FX.animAt(an, 1.37, Infinity, c), id);
    const at0 = FX.animAt(an, .2, Infinity, c), plain = FX.animAt({ ...an, loop: null }, .2, Infinity, c);
    if (id !== 'wave') assert.equal(at0.tr.startsWith(plain.tr), true, `${id}: chưa vào xong thì giữ hình vào`);
  }
  const w = FX.animAt({ in: null, out: null, loop: { type: 'wave', speed: 1 } }, 1, Infinity, c);
  assert.equal(w.chars.length, 5);
  assert.notEqual(w.chars[0].tr, w.chars[2].tr);
  // chữ: lặp + vào từng chữ gộp vào cùng một span
  const html = V.textLine({ text: 'ABC', t: 0, y: 100, anim: 'tumble', anim_loop: { type: 'wave' } }, 2, 5);
  assert.equal((html.match(/<span/g) || []).length, 3);
  assert.match(html, /rotateX\([^)]*\) translateY\([^)]*\) translateY/);
});

test('chữ có anim_out: không còn mờ 0.12 s cũ, Ra chạy tới đúng lúc tắt', () => {
  const L = { text: 'Hi', t: 0, y: 100, anim: 'pop', anim_out: { type: 'slide_r', dur: .5 } };
  assert.match(V.textLine(L, 2.9, 3), /translateX\(/);
  assert.match(V.textLine(L, 3, 3), /opacity:0\.000/);
  assert.match(V.textLine(L, 1, 3), /opacity:1\.000/);
});

test('hasOut + phong bì ENV: chỉ cảnh có Ra riêng mới bỏ nửa ra của ENV', () => {
  assert.equal(FX.hasOut({ type: 'text', lines: [{ anim: 'pop' }] }), false);
  assert.equal(FX.hasOut({ type: 'text', lines: [{ anim: 'pop' }, { anim_out: { type: 'fade' } }] }), true);
  assert.equal(FX.hasOut({ type: 'shape', anim_out: 'drop' }), true);
  assert.equal(FX.hasOut({ type: 'bubble_screen', sticker: { anim_out: { type: 'pop' } } }), true);
  assert.match(read('engine/engine.js'), /s\.keep \|\| \(!hand && FX\.hasOut\(s\)\) \? 0/);
});

test('shape / celem / sticker mới: vào lạ của bộ chung, Ra, Lặp; data-cid không pointer-events:none', () => {
  const s = { type: 'shape', t0: 0, t1: 3, cid: 'x', anim: 'slide_l', anim_out: { type: 'drop' }, anim_loop: { type: 'spin' } };
  const mid = SH.shape(s, 1.5, 1.5).front, end = SH.shape(s, 3, 3).front;
  assert.match(mid, /data-cid="x"/); assert.match(mid, /rotate\(/);
  assert.match(end, /opacity:0\.000/);
  assert.ok(!/pointer-events:\s*none/.test(mid));
  assert.match(SH.shape({ type: 'shape', t0: 0, t1: 3, anim: 'type' }, .1, .1).front, /clip-path:inset/);
  const spec = { v: 1, name: 'A', w: 100, h: 50, layers: [{ k: 'rect', x: 0, y: 0, w: 100, h: 50, fill: '#fff' }] };
  const ce = CE.render({ spec, card: { x: 0, y: 0, w: 100, h: 50 }, t0: 0, t1: 3, cid: 'c', anim: 'blur_zoom', anim_loop: { type: 'sparkle' } }, .1, .1).front;
  assert.match(ce, /transform:scale\(/); assert.match(ce, /filter:blur\([^;]*brightness/);
  assert.ok(!/pointer-events:\s*none/.test(ce));
  const st = V.stickerHTML({ t: 0, src: '🔥', anim: 'pop', anim_loop: { type: 'bounce' } }, 1, 3);
  assert.match(st, /scale\(1\.000\) translateY/); assert.ok(!/rotate\(/.test(st), 'lặp thay bob');
});

test('Claude biết đủ loại Vào / Ra / Lặp (75_ask.core.js)', () => {
  const p = AC.ANIM_GUIDE;
  for (const id of [...FX.ids('anim_in'), ...FX.ids('anim_loop')]) assert.ok(p.includes(id), id);
  assert.match(p, /anim_out/); assert.match(p, /anim_loop/);
});

test('elem_anim: chỉ có ở chữ / cảnh, checkPick lọc tham số, elemAnimApply ghi đúng trường', () => {
  const ids = sc => AC.actionsOf(sc).map(a => a.id);
  assert.ok(ids({ kind: 'elem', ek: 'line' }).includes('elem_anim'));
  assert.ok(ids({ kind: 'elem', ek: 'scene' }).includes('elem_anim'));
  assert.ok(!ids({ kind: 'elem', ek: 'cap' }).includes('elem_anim'));
  const pick = AC.checkPick({ action: 'elem_anim', params: { in: 'drop', out: 'fade', loop: 'lac_lu', speed: 9 } }, { kind: 'elem', ek: 'line' });
  assert.equal(pick.action, 'elem_anim'); assert.equal(pick.params.in, 'drop'); assert.equal(pick.params.loop, undefined);
  const tl = { scenes: [{ type: 'text', cid: 's1', lines: [{ cid: 'l1', text: 'A', anim: 'pop', anim_loop: { type: 'spin' } }] }] };
  assert.equal(AC.elemAnimApply(tl, 'l1', { in: 'fade', dur: 1, out: 'slide_l', loop: 'none' }), true);
  assert.deepEqual(tl.scenes[0].lines[0], { cid: 'l1', text: 'A', anim: 'fade', anim_dur: 1, anim_out: { type: 'slide_l' } });
  assert.equal(AC.elemAnimApply(tl, 'zz', { in: 'fade' }), false);
});
