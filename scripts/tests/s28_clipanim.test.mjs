// S28 M204: hoạt ảnh clip Vào / Ra / Combo (engine/fx_registry.js nhóm clip_anim, ghép ở engine/engine.js animWrap).
// Timeline cũ (không anim) phải dựng ra giống hệt: so HTML của clipLayer / sceneFx mới với bản chép đông cứng trước M204.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';

const req = createRequire(import.meta.url);
const FX = req('../../engine/fx_registry.js');
const AC = req('../../studio/features/75_ask.core.js');
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ---- bản chép đông cứng của engine/engine.js trước M204 (đừng sửa: đây là "hình cũ") ----
const OLD_CLIPLAYER = "function clipLayer(c, srcT, t, extraFilter = '', style = '') {\n  const rf = reframeCss(c, srcT);\n  const tr = `${c.flip ? 'scaleX(-1) ' : ''}scale(${c.zoom || 1})`;\n  const img = `<img src=\"${url(srcFrame(c, srcT))}\" style=\"position:absolute;inset:0;width:100%;height:100%;object-fit:${c.fit === 'contain' || c.fit === 'blurfill' ? 'contain' : 'cover'};\n    transform:${tr};${rf || `transform-origin:${c.ox ?? 50}% ${c.oy ?? 45}%`};filter:${gradeBase(t)} ${extraFilter}\">`;\n  const bg = c.fit === 'blurfill' ? `<img src=\"${url(srcFrame(c, srcT))}\" style=\"position:absolute;inset:-40px;width:calc(100% + 80px);height:calc(100% + 80px);object-fit:cover;filter:blur(30px) brightness(.7)\">` : '';\n  // Background replace: person cutout (clip.cutouts) over blur / colour / image / nothing; frames without a cutout show the plain frame.\n  if (c.cutouts && c.bg?.type) {\n    const b = c.bg, raw = url(srcFrame(c, srcT)), fit = c.fit === 'contain' || c.fit === 'blurfill' ? 'contain' : 'cover';\n    const under = b.type === 'blur' ? `<img src=\"${raw}\" style=\"position:absolute;inset:-40px;width:calc(100% + 80px);height:calc(100% + 80px);object-fit:cover;filter:blur(${b.blur ?? 26}px) brightness(${b.dim ?? .8})\">`\n      : b.type === 'color' ? `<div class=\"full\" style=\"background:${b.color || '#151515'}\"></div>`\n      : b.type === 'image' && b.src ? `<img src=\"${media(b.src, t)}\" style=\"position:absolute;inset:0;width:100%;height:100%;object-fit:cover\">` : '';\n    const cut = `<img src=\"${url(srcFrame(c, srcT, true))}\" onerror=\"this.onerror=null;this.src='${raw}'\" style=\"position:absolute;inset:0;width:100%;height:100%;object-fit:${fit};\n      transform:${tr};${rf || `transform-origin:${c.ox ?? 50}% ${c.oy ?? 45}%`};filter:${gradeBase(t)} ${extraFilter}\">`;\n    return `<div class=\"full\" style=\"overflow:hidden;${style}${maskCss(c.mask)}\">${under}${cut}</div>`;\n  }\n  const inner = `<div class=\"full\" style=\"overflow:hidden;${style}${maskCss(c.mask)}\">${bg}${img}</div>`;\n  return c.mask?.bg ? `<div class=\"full\"><div class=\"full\" style=\"background:${c.mask.bg}\"></div>${inner}</div>` : inner;\n}\n";
const OLD_SCENEFX = "function sceneFx(s, html, t) {\n  if (!html) return html;\n  if (s.mask) html = `<div class=\"full\" style=\"${maskCss(s.mask)}\">${html}</div>`;\n  if (s.kf?.length) {\n    const v = kfAt(s.kf, t), [ax, ay] = s.anchor || [s.x ?? STAGE_WH[0] / 2, s.y ?? STAGE_WH[1] / 2];\n    html = `<div class=\"full\" style=\"transform-origin:${ax}px ${ay}px;transform:${kfTr(v)};opacity:${clamp(v.opacity).toFixed(3)}\">${html}</div>`;\n  }\n  return html;\n}\n";

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const eng = read('engine/engine.js');
const NEW_CLIP = eng.match(/\/\/ S28 M204: thứ tự ghép[\s\S]*?\nfunction clipBox\([\s\S]*?\n}\n/)[0];
const NEW_SCENEFX = eng.match(/function sceneFx\([\s\S]*?\n}\n/)[0];
const ctx = () => ({
  FX, clamp, STAGE_WH: [720, 1280],
  url: p => `u(${p})`, srcFrame: (c, s, cut) => `${cut ? 'cut' : 'f'}-${c.name}-${s.toFixed(3)}`,
  reframeCss: (c, s) => (c.reframe ? `--rf:1;object-position:${(40 + s).toFixed(2)}% 42%;transform-origin:50% 42%` : ''),
  colorOver: () => '', // S29 M208: clip không có filter → không phủ gì
  gradeBase: t => `g${t.toFixed(2)}`, maskCss: m => (m ? `mask:${m.shape};` : ''), media: b => `m-${b}`,
  kfAt: (kf, t) => ({ x: t * 10, y: 0, scale: 1 + t / 10, rot: 0, opacity: 1 }), kfTr: v => `kf(${v.x.toFixed(2)},${v.scale.toFixed(3)})`,
});
const run = (code, name) => { const c = vm.createContext(ctx()); vm.runInContext(code, c); return c[name]; };
const ts = (a, b, step = 0.0731) => { const o = []; for (let t = a; t < b; t += step) o.push(t); return o; };

const OLD_CLIPS = [
  { name: 'a', t0: 0, t1: 2 }, { name: 'b', t0: 2, t1: 4, flip: true, zoom: 1.3, ox: 30, oy: 60 },
  { name: 'c', t0: 4, t1: 6, fit: 'blurfill', reframe: [{ t: 0, ox: 40, oy: 40 }] }, { name: 'd', t0: 6, t1: 8, fit: 'contain', mask: { shape: 'circle', bg: '#123' } },
  { name: 'e', t0: 8, t1: 9, cutouts: 'cut/%05d.png', bg: { type: 'blur' } }, { name: 'f', t0: 9, t1: 10, cutouts: 'x', bg: { type: 'image', src: 'bg.jpg' }, mask: { shape: 'star' } },
  { name: 'g', t0: 10, t1: 11, anim: {} }, { name: 'h', t0: 11, t1: 12, anim: 'pop' }, { name: 'i', t0: 12, t1: 13, anim: { in: { type: 'khong_co' } } },
];

test('timeline cũ (không anim / anim rỗng / loại lạ): clipLayer dựng ra đúng HTML như trước M204', () => {
  const oldL = run(OLD_CLIPLAYER, 'clipLayer'), newL = run(NEW_CLIP, 'clipLayer');
  for (const c of OLD_CLIPS) for (const t of ts(c.t0 - .2, c.t1 + .5)) {
    const s = t - c.t0;
    assert.equal(newL(c, s, t, 'fx', 'opacity:.5'), oldL(c, s, t, 'fx', 'opacity:.5'), `${c.name} t ${t}`);
    assert.equal(newL(c, s, t), oldL(c, s, t), `${c.name} t ${t} (không style)`);
  }
});

test('timeline cũ: sceneFx (mặt nạ, keyframe) dựng ra đúng HTML như trước M204; anim chỉ cho photo / broll', () => {
  const oldF = run(OLD_SCENEFX, 'sceneFx'), newF = run(NEW_CLIP + NEW_SCENEFX, 'sceneFx');
  const scenes = [{ type: 'photo', t0: 1, t1: 4 }, { type: 'broll', t0: 1, t1: 4, mask: { shape: 'rect' } }, { type: 'photo', t0: 1, t1: 4, kf: [{ t: 1 }, { t: 3, x: 10 }] },
    { type: 'text', t0: 1, t1: 4, anim: { in: { type: 'fade', dur: .5 } } }, { type: 'stamp', t0: 1, t1: 4, anim: 'pop', mask: { shape: 'circle' } }];
  for (const s of scenes) for (const t of ts(.8, 4.4)) for (const h of ['<i>x</i>', '']) assert.equal(newF(s, h, t), oldF(s, h, t), `${s.type} t ${t}`);
});

test('đủ preset: Vào 12, Ra 10, Combo 8; mỗi mục có nhãn, icon, tham số, mô tả ai cho Claude', () => {
  assert.deepEqual(FX.ids('clip_in'), ['fade', 'zoom_in', 'zoom_out', 'slide_l', 'slide_r', 'slide_up', 'slide_down', 'rotate', 'shake', 'sway', 'bounce', 'blur']);
  assert.equal(FX.ids('clip_out').length, 10);
  assert.deepEqual(FX.ids('clip_combo'), ['ken_burns', 'pendulum', 'zoom_pulse', 'shake3d', 'breathe', 'drift', 'beat_shake', 'slow_spin']);
  for (const kind of ['clip_in', 'clip_out', 'clip_combo']) {
    const groups = FX.GROUPS[kind].map(g => g[0]);
    for (const x of FX.list(kind)) {
      assert.ok(x.label && /^ti-/.test(x.icon) && groups.includes(x.group) && typeof x.fn === 'function', `${kind}.${x.id}`);
      for (const f of ['mood', 'nhip', 'khi_nao', 'tranh']) assert.ok(x.ai?.[f]?.length, `${kind}.${x.id}.ai.${f}`);
    }
  }
  for (const x of FX.CLIP_OUT) assert.ok(FX.get('clip_in', x.id), `Ra ${x.id} có bản Vào cùng tên`);
});

test('Vào kết thúc ở trạng thái nghỉ, Ra bắt đầu ở trạng thái nghỉ (nối liền với clip), Ra = Vào đối xứng', () => {
  for (const x of FX.CLIP_IN) assert.equal(FX.clipAnimAt({ in: { type: x.id } }, 0.5, 3), null, `in ${x.id} xong ở 0,5 s`);
  for (const x of FX.CLIP_IN) {
    const v = FX.clipAnimAt({ in: { type: x.id } }, 0.4999, 3), near = (a, b, e) => Math.abs(a - b) <= e;
    assert.ok(near(v.x, 0, .5) && near(v.y, 0, .5) && near(v.scale, 1, .01) && near(v.rot, 0, .5) && v.opacity > .99 && v.blur < .3, `in ${x.id} k≈1 gần trạng thái nghỉ`);
  }
  for (const x of FX.CLIP_OUT) {
    assert.equal(FX.clipAnimAt({ out: { type: x.id, dur: 1 } }, 1.9, 3), null, `out ${x.id} chưa chạy`);
    const v = FX.clipAnimAt({ out: { type: x.id, dur: 1 } }, 2.0001, 3);
    assert.ok(Math.abs(v.x) < .5 && Math.abs(v.y) < .5 && Math.abs(v.scale - 1) < .01 && Math.abs(v.rot) < .5 && v.opacity > .99 && v.blur < .3, `out ${x.id} k≈0 gần trạng thái nghỉ`);
    assert.notEqual(FX.clipAnimCss(FX.clipAnimAt({ out: { type: x.id, dur: 1 } }, 2.99, 3)), '', `out ${x.id} k≈1`);
  }
  // trượt ra trái đi về phía trái (x âm), phóng ra thì to lên
  assert.ok(FX.clipAnimAt({ out: { type: 'slide_l', dur: 1 } }, 2.9, 3).x < -50);
  assert.ok(FX.clipAnimAt({ in: { type: 'slide_l', dur: 1 } }, 0.1, 3).x > 50);
  assert.ok(FX.clipAnimAt({ out: { type: 'zoom_in', dur: 1 } }, 2.9, 3).scale > 1.2);
});

test('hàm thuần theo t; clip ngắn chia thời gian Vào / Ra; giữa clip không combo → không bọc', () => {
  const a = { in: { type: 'bounce', dur: 2 }, out: { type: 'blur', dur: 2 }, combo: { type: 'beat_shake', speed: 2 } };
  for (const t of ts(0, 3, .137)) assert.equal(FX.clipAnimCss(FX.clipAnimAt(a, t, 3)), FX.clipAnimCss(FX.clipAnimAt(a, t, 3)));
  const s = { in: { type: 'fade', dur: 2 }, out: { type: 'fade', dur: 2 } };
  assert.equal(FX.clipAnimAt(s, 0.5, 2).opacity, 0.5); // dur 2 + 2 trên clip 2 s → mỗi bên 1 s
  assert.equal(FX.clipAnimAt(s, 1.5, 2).opacity, 0.5);
  assert.equal(FX.clipAnimAt({ in: { type: 'fade', dur: .5 } }, 1, 3), null);
  assert.equal(FX.clipAnimAt({ in: { type: 'fade', dur: .5 } }, 0.2, 3).edge, true);
  assert.equal(FX.clipAnimAt({ combo: { type: 'ken_burns' } }, 1, 3).edge, false);
  assert.equal(FX.clipAnimAt({ in: { type: 'fade', dur: .5 } }, 0.2, 0), null);
});

test('combo không lộ mép khung: phóng đủ bù phần trượt và góc xoay', () => {
  const need = deg => { const r = Math.abs(deg % 180) * Math.PI / 180; return Math.abs(Math.cos(r)) + 1.78 * Math.abs(Math.sin(r)); };
  for (const x of FX.CLIP_COMBO) for (const t of ts(0, 6, .05)) {
    const v = FX.clipAnimAt({ combo: { type: x.id, speed: 1 } }, t, 6);
    assert.ok(v.scale >= 1 - 1e-9, `${x.id} scale ${v.scale}`);
    assert.ok(Math.max(Math.abs(v.x), Math.abs(v.y)) <= (v.scale - 1) * 50 + 1e-9, `${x.id} t ${t} trượt quá mép`);
    if (v.rot) assert.ok(v.scale >= need(v.rot) - 1e-9 || Math.abs(v.rot) <= 3, `${x.id} xoay ${v.rot} cần ${need(v.rot)}`);
  }
});

test('thứ tự ghép: clip chính bọc hoạt ảnh NGOÀI mặt nạ / bám mặt; cảnh: mặt nạ → hoạt ảnh → keyframe, keyframe thắng thuộc tính trùng', () => {
  const L = run(NEW_CLIP, 'clipLayer');
  const c = { name: 'r', t0: 2, t1: 5, reframe: [{ t: 0, ox: 40, oy: 40 }], mask: { shape: 'circle' }, anim: { in: { type: 'zoom_in', dur: 1 } } };
  const h = L(c, .3, 2.3, '', 'opacity:.5');
  assert.match(h, /^<div class="full" style="transform-origin:50% 50%;transform:scale\([\d.]+\);opacity:[\d.]+;">/);
  const inner = h.slice(h.indexOf('>') + 1, -'</div>'.length), { anim, ...plain } = c;
  assert.equal(inner, L(plain, .3, 2.3, '', 'opacity:.5'), 'bên trong giữ nguyên HTML cũ (bám mặt + mặt nạ)');
  assert.ok(inner.includes('object-position:40.30%'), 'bám mặt vẫn theo srcT');
  // clip trước chạy dưới chuyển cảnh (t > t1): hoạt ảnh kẹp ở cuối clip, không chạy tiếp
  const o = { ...c, anim: { out: { type: 'fade', dur: .5 } } };
  assert.equal(L(o, 3.2, 5.3).replace(/g5\.30/g, 'g5.00'), L(o, 3.2, 5));

  const F = run(NEW_CLIP + NEW_SCENEFX, 'sceneFx');
  const s = { type: 'photo', mode: 'card', card: { x: 100, y: 200, w: 400, h: 300 }, t0: 1, t1: 4, mask: { shape: 'rect' }, kf: [{ t: 1, scale: 1 }, { t: 3, scale: 2 }], anim: { in: { type: 'zoom_in', dur: 1 } } };
  const out = F(s, '<i>x</i>', 1.3);
  const iKf = out.indexOf('kf('), iAnim = out.indexOf('transform-origin:300px 350px'), iMask = out.indexOf('mask:rect');
  assert.ok(iKf >= 0 && iKf < iAnim && iAnim < iMask, 'keyframe ngoài cùng, rồi hoạt ảnh (quanh tâm thẻ), rồi mặt nạ');
  const animDiv = out.slice(iAnim, out.indexOf('>', iAnim));
  assert.ok(!/scale\(/.test(animDiv) && /opacity:/.test(animDiv), 'keyframe giữ scale → hoạt ảnh chỉ còn độ mờ');
});

test('clipAnimSet: đặt / kẹp / bỏ slot; Claude biết clip_anim và áp thuần', () => {
  assert.deepEqual(FX.clipAnimSet(null, 'in', 'fade'), { in: { type: 'fade', dur: 0.5 } });
  assert.deepEqual(FX.clipAnimSet({ in: { type: 'fade', dur: 1 } }, 'in', 'blur'), { in: { type: 'blur', dur: 1 } }, 'đổi loại giữ thời lượng');
  assert.deepEqual(FX.clipAnimSet(null, 'combo', 'ken_burns', { speed: 9 }), { combo: { type: 'ken_burns', speed: 3 } });
  assert.equal(FX.clipAnimSet({ out: { type: 'fade', dur: 1 } }, 'out', 'none'), null);
  assert.deepEqual(FX.clipAnimSet({ out: { type: 'fade', dur: 1 } }, 'in', 'ken_burns'), { out: { type: 'fade', dur: 1 } }, 'loại không thuộc slot = bỏ slot đó');

  const act = AC.actionsOf({ kind: 'clip', idx: 0 }).find(a => a.id === 'clip_anim');
  assert.ok(act, 'clip đầu cũng có clip_anim');
  for (const x of [...FX.CLIP_IN, ...FX.CLIP_COMBO]) assert.ok(act.what.includes(`${x.id} (`) && act.what.includes(x.ai.khi_nao), `prompt thiếu ${x.id}`);
  const ok = AC.checkPick({ action: 'clip_anim', params: { slot: 'combo', type: 'ken_burns', speed: 0.8 } }, { kind: 'clip', idx: 1 });
  assert.equal(ok.action, 'clip_anim');
  assert.equal(AC.checkPick({ action: 'clip_anim', params: { type: 'fade' } }, { kind: 'clip', idx: 1 }).action, 'answer', 'thiếu slot → trả lời bằng chữ');
  const tl = { clips: [{ in: 0, out: 2 }, { in: 0, out: 2, anim: { in: { type: 'fade', dur: .5 } } }] };
  assert.equal(AC.clipAnimApply(tl, 1, ok.params), true);
  assert.deepEqual(tl.clips[1].anim, { in: { type: 'fade', dur: .5 }, combo: { type: 'ken_burns', speed: .8 } });
  assert.equal(AC.clipAnimApply(tl, 1, { slot: 'combo', type: 'zoom_in' }), false, 'loại Vào ở slot Combo: không áp');
  AC.clipAnimApply(tl, 1, { slot: 'in', type: 'none' }); AC.clipAnimApply(tl, 1, { slot: 'combo', type: 'none' });
  assert.equal(tl.clips[1].anim, undefined);
});

test('b-roll ảnh tĩnh do AI đặt toàn khung mặc định Combo Ken Burns; video giữ kb nhẹ', () => {
  for (const f of ['scripts/script_build.mjs', 'scripts/auto_broll.mjs']) {
    const s = read(f);
    assert.match(s, /const stillKb = \(seq, dir\) => \(seq \? \{ kb: \.04, kb_dir: dir \} : \{ kb: 0, anim: \{ combo: \{ type: 'ken_burns', speed: 1 \} \} \}\);/, f);
    assert.match(s, /mode: 'full', [^\n]*\.\.\.stillKb\(m\.seq, /, f);
  }
  assert.match(eng, /ANIM_SCENES = new Set\(\['photo', 'broll'\]\)/);
  assert.match(eng, /else if \(s\.anim && ANIM_SCENES\.has\(s\.type\)\)/, 'compose bọc hoạt ảnh cả khi cảnh không có keyframe / mặt nạ');
});
