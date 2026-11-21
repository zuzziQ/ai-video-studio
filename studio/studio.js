// AI Video Studio — editor UI. The preview is the real render engine (engine/index.html) in an iframe,
// so what you see is frame-exact what render.mjs exports. Every edit mutates timeline.json in memory;
// "Lưu" writes it (plus captions + notes for Claude) through studio/server.mjs.
// Files: clips.js (main track model + ripple), library.js (left rail panels), this file (everything else).
'use strict';
let DW = 720, DH = 1280; const FPS = 30;

let TL = null, CAP = [], META = {}, LIB = { sfx: [], music: [] }, WAVE = [];
let T = 0, playing = false, sel = null, comps = [], dirty = false, undoStack = [], redoStack = [];
// S18 M129: gốc URL file của dự án trong tab này (/p/<mã tab>/ do server cấp; chưa nạp thì /project/ = dự án mặc định)
const PB = () => META?.base || '/project/';
let multi = [], guides = null; // S17 M124: element chọn thêm bằng Shift (sel là element chính); đường gióng khi kéo
let drag = null, hoverC = null, inEdit = null; // kéo trên preview (M124); S20 M139: element dưới chuột, ô gõ chữ tại chỗ đang mở
let kzone = null, CLIPB = null; // S20 M141: vùng vừa bấm (mũi tên dời hay tua, C19); clipboard trong trang
let query = '', K = .5, win = null, needInit = true, busy = false, pending = false, SNAP = true;

// ---------- dynamic geometry (M85) ----------
// Markup carries no inline style attribute: values that come from data (position and size on the timeline / preview, a clip's
// thumbnail and colour filter, a swatch colour, a text-preset preview) ride on data-d* attributes and are put on
// el.style here, right after the HTML is inserted. A MutationObserver covers every insertion (library panels,
// features); hot paths that measure right after inserting call applyDyn() themselves. The observer skips elements already
// done, so a node that is only moved in the DOM keeps any style code set on it later (e.g. while dragging).
// data-dcss replaces the whole inline style (cssText): do not combine it with the other data-d* on one element.
const DYN_SEL = '[data-dl],[data-dt],[data-dw],[data-dh],[data-dbg],[data-dfx],[data-dbc],[data-dfill],[data-dcss]';
const DYN_DONE = new WeakSet();
function applyDyn(root = document, again = true) {
  const list = root.matches?.(DYN_SEL) ? [root, ...root.querySelectorAll(DYN_SEL)] : root.querySelectorAll(DYN_SEL);
  for (const el of list) {
    if (!again && DYN_DONE.has(el)) continue;
    DYN_DONE.add(el);
    const d = el.dataset, s = el.style;
    if (d.dcss != null) s.cssText = d.dcss; // text-preset preview: the preset's own CSS (video data)
    if (d.dl != null) s.left = d.dl + 'px';
    if (d.dt != null) s.top = d.dt + 'px';
    if (d.dw != null) s.width = d.dw + 'px';
    if (d.dh != null) s.height = d.dh + 'px';
    if (d.dbg) s.backgroundImage = `url("${d.dbg.replace(/["\\]/g, '\\$&')}")`;
    if (d.dfx) s.filter = d.dfx;
    if (d.dbc) s.setProperty('--bc', d.dbc);
    if (d.dfill) s.background = d.dfill;
  }
}
new MutationObserver(recs => { for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1) applyDyn(n, false); })
  .observe(document.documentElement, { childList: true, subtree: true });

// ---------- vocabulary ----------
const TRACKS = [['cap', 'Phụ đề', 'ti-badge-cc'], ['add', 'Chữ thêm', 'ti-letter-t'], ['gline', 'Chữ graphic', 'ti-text-size'], ['gfx', 'Graphic', 'ti-sparkles'],
  ['broll', 'B-roll', 'ti-photo'], ['scene', 'Cảnh', 'ti-layout-board'], ['video', 'Video chính', 'ti-movie'], ['audio', 'Âm thanh', 'ti-music'], ['wave', 'Giọng', 'ti-wave-sine']];
const TCOL = { scene: 'rgb(var(--track-2))', cap: 'rgb(var(--track-3))', add: 'rgb(var(--track-4))', gline: 'rgb(var(--track-5))', gfx: 'rgb(var(--track-6))', broll: 'rgb(var(--track-7))', audio: 'rgb(var(--track-8))', video: 'rgb(var(--track-1))' };
const TRK = Object.fromEntries(TRACKS.map(([k]) => [k, { lock: false, hide: false }]));
const LAYOUT = new Set(['frame_grid', 'title_card', 'spotlight', 'bubble_screen', 'hook_card', 'grid_bg', 'end_card', 'slam_bg', 'split', 'mega']);
const BROLL = new Set(['broll', 'media_card', 'mosaic', 'mosaic_wall', 'photo', 're_gallery']);
const TYPE_VI = {
  frame_grid: 'Khung video lưới', title_card: 'Thẻ kết', media_card: 'Thẻ media', led_text: 'Chữ LED', neon_text: 'Chữ neon', logo_row: 'Hàng logo',
  diagram: 'Sơ đồ', text: 'Chữ thêm', spotlight: 'Spotlight', bubble_screen: 'Bubble + màn hình', hook_card: 'Thẻ mở đầu', grid_bg: 'Nền lưới',
  icon_tap: 'Logo + tay bấm', sticker: 'Sticker', follow_cta: 'Nút Follow', broll: 'B-roll', emoji_pop: 'Emoji', photo: 'Ảnh / clip phủ',
  shape: 'Hình khối', // S20 M144 (engine/shape.js), track Graphic qua trackOf
  celem: 'Element riêng', // S27 M199 (engine/celem.js, features/72_celem.js)
};
const FONTS = [['', 'Mặc định'], ['var(--sans)', 'Be Vietnam Pro'], ['var(--disp)', 'Montserrat'], ["'Inter'", 'Inter'], ["'Playfair Display',serif", 'Playfair Display'],
  ["'DM Serif Display',serif", 'DM Serif Display'], ["'Lexend'", 'Lexend'], ["'Oswald'", 'Oswald'], ["'Nunito'", 'Nunito'], ["'Bungee'", 'Bungee'], ["'Pacifico'", 'Pacifico']];
const STYLES = [['white', 'Trắng'], ['yellow', 'Vàng'], ['clean', 'Sạch'], ['muted', 'Dịu'], ['ink', 'Mực'], ['fire', 'Lửa'], ['glow', 'Phát sáng'], ['neon', 'Neon'], ['dark', 'Tối'], ['hl', 'Nhấn'], ['grad_blue', 'Gradient xanh'], ['grad_teal', 'Gradient ngọc']];
const SWATCH = ['#FFFFFF', '#FCDB36', '#F3E35A', '#151515', '#FF8A1E', '#E8432A', '#FF3348', '#5EE6C8', '#8CCBFF', '#A78BFA']; // design-token-ok: text colours of the video, not UI
const NODE_SIZE = { person: 64, chip: 22, pill: 30, pill_outline: 32, big: 120, label: 26 };

// ---------- component model ----------
const typeName = ty => TYPE_VI[ty] || (win?.PACKS || []).flatMap(p => p.items).find(i => i.type === ty)?.label || ty;
const sceneName = s => (s.type === 'hf' ? win?.HF_CATALOG?.[s.block]?.label || 'Khối HyperFrames' : typeName(s.type));
function trackOf(s) { return s.type === 'text' ? 'add' : LAYOUT.has(s.type) ? 'scene' : BROLL.has(s.type) ? 'broll' : 'gfx'; }
function build() {
  comps = [];
  clipLayout().forEach(k => { k.c.cid = 'k' + k.i; comps.push({ obj: k.c, kind: 'clip', track: 'video', t0: k.t0, t1: k.t1, idx: k.i, label: `Clip ${k.i + 1}`, sub: typeof k.c.src === 'string' ? k.c.src : k.c.src?.seq }); });
  (TL.scenes || []).forEach((s, i) => {
    s.cid = 's' + i;
    if (s.type !== 'text') comps.push({ obj: s, kind: 'scene', track: trackOf(s), t0: s.t0, t1: s.t1, label: sceneName(s), sub: s.text || s.question || '', scene: s });
    (s.lines || []).forEach((L, j) => {
      L.cid = `s${i}l${j}`;
      comps.push({ obj: L, kind: 'line', track: s.type === 'text' ? 'add' : 'gline', t0: L.t ?? s.t0, t1: L.out ?? s.t1, label: L.text, scene: s });
    });
    (s.nodes || []).forEach((n, j) => {
      n.cid = `s${i}n${j}`;
      comps.push({ obj: n, kind: 'node', track: 'gline', t0: n.t ?? s.t0, t1: n.out ?? s.t1, label: n.text || n.kind, scene: s });
    });
    if (s.badge && typeof s.badge === 'object') { s.badge.cid = `s${i}b`; comps.push({ obj: s.badge, kind: 'badge', track: null, t0: s.t0, t1: s.t1, label: 'Huy hiệu', scene: s }); }
  });
  CAP.forEach((c, k) => { c.cid = 'c' + k; comps.push({ obj: c, kind: 'cap', track: 'cap', t0: c.t0, t1: c.t1, label: c.words.map(w => w.w).join(' ') }); });
  (TL.audio?.sfx || []).forEach((x, k) => { x.cid = 'a' + k; comps.push({ obj: x, kind: 'sfx', track: 'audio', t0: x.t, t1: x.t + .45, label: x.name }); });
  (TL.audio?.music || []).forEach((m, k) => { m.cid = 'm' + k; comps.push({ obj: m, kind: 'music', track: 'audio', t0: m.t0, t1: m.t1, label: m.mood || m.file }); });
  for (const f of window.Studio?._build || []) f(comps); // features add their own components (e.g. 30_audio.js: extra audio tracks)
}
const compOf = obj => comps.find(c => c.obj === obj);
const compByCid = cid => comps.find(c => c.obj.cid === cid);

// ---------- undo / dirty ----------
const strip = (k, v) => (k === 'cid' ? undefined : v);
const snapshot = () => JSON.stringify({ TL, CAP }, strip);
let lastPush = { key: '', at: 0 };
function pushUndo(key = '') {
  // S26 M185: AI dựng / áp gợi ý QC đang chạy sẽ ghi lại timeline lúc xong: chặn mọi sửa mới (thêm từ thư viện, lệnh…) trước khi nó đổi TL
  if (window.Studio?.jobs?.locked()) { toast('Đang chạy ' + Studio.jobs.running() + ': chờ xong rồi sửa (bấm chuông việc nền)'); throw Object.assign(new Error('Đang có việc ghi lại timeline'), { avsLocked: true }); }
  const now = Date.now();
  if (key && key === lastPush.key && now - lastPush.at < 900) { lastPush.at = now; return; }
  lastPush = { key, at: now };
  undoStack.push(snapshot()); if (undoStack.length > 150) undoStack.shift();
  redoStack = [];
}
function restore(s) {
  const o = JSON.parse(s); TL = o.TL; CAP = o.CAP;
  const cid = sel?.obj.cid, mc = multi.map(m => m.obj.cid); build(); sel = cid ? compByCid(cid) || null : null; multi = mc.map(compByCid).filter(Boolean); changed(true);
}
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); }
// First edit of an element keeps its designed state in _orig ("Về thiết kế" restores it).
function touch(obj, key) {
  pushUndo(key ? obj.cid + key : '');
  if (!obj._orig) obj._orig = JSON.parse(JSON.stringify(obj, (k, v) => (k === 'cid' || k === '_orig' ? undefined : v)));
}
const setStatus = (t, d) => { const s = $('#status'); s.textContent = t; s.title = d ? `${t} (⌘S để lưu)` : t; s.setAttribute('aria-label', t); s.classList.toggle('dirty', d); };
let editSeq = 0; // S26 M184: đếm lần sửa; lưu xong mà có sửa mới trong lúc gửi thì vẫn "Chưa lưu"
function markDirty() { dirty = true; editSeq++; setStatus('Chưa lưu', true); autoSaveSoon(); }
function changed(inspector = false) {
  markDirty();
  if (T > TL.duration) { T = TL.duration; $('#time').textContent = fmt(T); }
  build();
  if (sel) sel = compOf(sel.obj) || null;
  multi = sel && sel.kind !== 'clip' ? multi.map(m => compOf(m.obj)).filter(m => m && m !== sel) : [];
  needInit = true; draw(); renderList(); renderTimeline();
  if (inspector) renderInspector();
  $('#durtc').textContent = '/ ' + fmt(TL.duration);
}

// ---------- preview ----------
function previewTL(src = TL) { // S28 M202: src = TL tạm của xem thử chuyển cảnh (79_transpeek.js)
  const o = JSON.parse(JSON.stringify(src));
  o.captions = JSON.parse(JSON.stringify(CAP)); o.base = PB(); o.width = DW; o.height = DH;
  if (o.aroll) o.aroll.count = META.frames || undefined;
  // Track "hide" toggles only affect the preview, never the saved timeline.
  if (TRK.video.hide) for (const c of o.clips || []) c.filter = { ...(c.filter || {}), brightness: 0 };
  if (TRK.cap.hide) o.caption_style = 'none';
  (o.scenes || []).forEach(s => {
    if (s.type === 'text' ? TRK.add.hide : TRK[trackOf(s)]?.hide) s.hidden = true;
    if (s.type !== 'text' && TRK.gline.hide) for (const L of s.lines || []) L.hidden = true;
  });
  return o;
}
async function draw() {
  if (!win?.renderFrame) return;
  if (busy) { pending = true; return; }
  busy = true;
  try {
    // Image decode can stall in a hidden window; never let one frame block the editor.
    const capped = p => Promise.race([p, new Promise(r => setTimeout(r, 1200))]);
    if (needInit) { needInit = false; await capped(win.init(previewTL())); }
    await capped(win.renderFrame(T));
    if (inEdit) { const el = elFor(inEdit.c.obj); if (el) el.style.visibility = 'hidden'; } // S20 M139: chữ gốc ẩn khi đang gõ tại chỗ
  } catch (e) { console.error(e); }
  busy = false;
  drawOverlay();
  if (pending) { pending = false; draw(); }
}
function fit() {
  const w = $('#stagewrap').clientWidth - 40, h = $('#stagewrap').clientHeight - 32;
  K = Math.max(.1, Math.min(w / DW, h / DH));
  $('#stagebox').style.width = DW * K + 'px'; $('#stagebox').style.height = DH * K + 'px';
  const f = $('#frame'); f.style.width = DW + 'px'; f.style.height = DH + 'px'; f.style.transform = `scale(${K})`;
  drawOverlay();
}
function elFor(obj) { try { return win?.document.querySelector(`[data-cid="${obj.cid}"]`); } catch { return null; } }
function rectOf(obj) {
  const el = elFor(obj); if (!el) return null;
  if (el.id === 'cap') { // union of visible words
    let r = null;
    for (const s of el.querySelectorAll('span')) {
      if (+getComputedStyle(s).opacity < .05) continue;
      const b = s.getBoundingClientRect();
      r = r ? { l: Math.min(r.l, b.left), t: Math.min(r.t, b.top), r: Math.max(r.r, b.right), b: Math.max(r.b, b.bottom) } : { l: b.left, t: b.top, r: b.right, b: b.bottom };
    }
    return r && { x: r.l, y: r.t, w: r.r - r.l, h: r.b - r.t };
  }
  const b = el.getBoundingClientRect();
  return { x: b.left, y: b.top, w: b.width, h: b.height };
}
// S23 M160 (PR 174): hộp chưa xoay + góc của element xoay tay (engine đặt el.style.rotate) để khung chọn xoay theo element.
// Không xoay thì như rectOf (rot 0). Chỉ dùng để vẽ; gióng, quét chọn, QC vẫn dùng hộp bao rectOf.
function frameOf(obj) {
  const el = elFor(obj), rot = el?.style.rotate || '', a = parseFloat(rot) || 0;
  if (!a || el.id === 'cap') { const r = rectOf(obj); return r && { ...r, rot: 0 }; }
  el.style.rotate = ''; const r = rectOf(obj); el.style.rotate = rot;
  return r && { ...r, rot: a };
}
let SAFE = { x: 40, y: 130, w: 600, h: 870 };
function drawOverlay() {
  const ov = $('#overlay'); let h = '';
  const box = (x, y, w, hh) => `data-dl="${x}" data-dt="${y}" data-dw="${w}" data-dh="${hh}"`;
  const fbox = (r, pad) => { const f = StageCore.selFrame(r, r.rot, K, pad); return box(f.l, f.t, f.w, f.h) + (f.rot ? ` data-drot="${f.rot}"` : ''); }; // S23 M160 (PR 174)
  if ($('#safe').checked) h += `<div class="safe" ${box(SAFE.x * K, SAFE.y * K, SAFE.w * K, SAFE.h * K)}><span>vùng an toàn</span></div>`;
  if ($('[id=face]').checked) { const f = TL?.face || { x: 360, y: 520 }; const r = 120 * K; h += `<div class="facezone" ${box(f.x * K - r, f.y * K - r * 1.2, r * 2, r * 2.4)}></div>`; }
  const corners = '<i class="nw" data-h="nw"></i><i class="ne" data-h="ne"></i><i class="sw" data-h="sw"></i><i class="se" data-h="se"></i>';
  // S20 M139: viền mảnh quanh element dưới chuột (chưa chọn)
  if (hoverC && hoverC !== sel && !multi.includes(hoverC) && !drag && !inEdit) { const r = frameOf(hoverC.obj); if (r) h += `<div class="hoverbox" ${fbox(r, 2)}></div>`; }
  const lockMark = '<span class="lockmark ti ti-lock" title="Đã khoá · ⌥⇧L để mở"></span>'; // S20 M141
  for (const m of multi) { const r = frameOf(m.obj); if (r) h += `<div class="selbox multi${m.obj.locked ? ' locked' : ''}" ${fbox(r, 3)}>${m.obj.locked ? lockMark : ''}</div>`; }
  if (sel && sel.kind === 'clip' && !TRK.video.lock) {
    // S17 M124: khung cắt video chính — kéo để dời, tay nắm góc để zoom (đè bám mặt ở clip này)
    h += `<div class="selbox crop ${sel.obj.crop_manual ? 'on' : ''}" ${box(0, 0, DW * K, DH * K)}>${corners}<span>${sel.obj.crop_manual ? 'Khung cắt chỉnh tay' : 'Kéo để dời khung cắt · góc để zoom'}</span></div>`;
  } else if (sel && inEdit?.c !== sel) {
    const r = frameOf(sel.obj), lk = !!sel.obj.locked; // S20 M141: element khoá không có tay nắm
    const edges = !lk && !multi.length && window.StageCore?.canResize(sel.kind, sel.obj.type) ? '<i class="n" data-h="n"></i><i class="s" data-h="s"></i><i class="e" data-h="e"></i><i class="w" data-h="w"></i>' : '';
    const rot = !lk && !multi.length && window.StageCore?.canRotate(sel.kind) ? '<b class="rotstem"></b><i class="rot" data-h="rot" title="Kéo để xoay · Shift: bắt 15°"></i>' : ''; // S20 M139
    const tip = drag?.rot && drag.moved ? `<span class="rottip">${sel.obj.rot || 0}°</span>` : '';
    if (r) h += `<div class="selbox${lk ? ' locked' : ''}" ${fbox(r, 3)}>${multi.length || lk ? '' : corners + edges + rot}${lk ? lockMark : ''}${tip}</div>`;
  }
  if (marq?.box) h += `<div class="marq" ${box(marq.box.x * K, marq.box.y * K, marq.box.w * K, marq.box.h * K)}></div>`; // S20 M142: hộp quét chọn
  if (guides) {
    for (const x of guides.gx || []) h += `<div class="guide v" ${box(x * K, 0, 0, DH * K)}></div>`;
    for (const y of guides.gy || []) h += `<div class="guide h" ${box(0, y * K, DW * K, 0)}></div>`;
  }
  ov.innerHTML = h; applyDyn(ov);
  for (const el of ov.querySelectorAll('[data-drot]')) el.style.rotate = el.dataset.drot + 'deg'; // S23 M160 (PR 174): khung xoay quanh tâm
  for (const f of window.Studio?._ov || []) f(); // S20 M140: thanh nổi theo khung chọn (66_canvas_cmds.js)
}
function pick(px, py) {
  if (!win) return null;
  for (const el of win.document.elementsFromPoint(px, py)) {
    const c = el.closest('[data-cid]');
    if (c) { const cp = compByCid(c.getAttribute('data-cid')); if (cp && !TRK[cp.track]?.lock && !cp.obj.locked) return cp; } // S20 M141: element khoá bấm xuyên qua
  }
  return null;
}

// S20 M142: mọi element tại điểm (trên cùng ở đầu), bỏ element khoá / track khoá — cho bấm lặp chọn lớp dưới. Không thay pick().
function pickAll(px, py) {
  if (!win) return [];
  const out = [];
  for (const el of win.document.elementsFromPoint(px, py)) {
    const cp = compByCid(el.closest('[data-cid]')?.getAttribute('data-cid'));
    if (cp && !out.includes(cp) && !cp.obj.locked && !TRK[cp.track]?.lock) out.push(cp);
  }
  return out;
}
// S20 M142: quét chọn — element tại playhead có hộp chạm hộp quét (bỏ ẩn, khoá, track khoá, element đầy khung).
let marq = null;
function marqUpdate(px, py) {
  marq.box = Layers.normBox(marq.x0, marq.y0, px, py);
  const items = comps.filter(c => c.kind !== 'clip' && c.kind !== 'sfx' && c.kind !== 'music' && T >= c.t0 - 1e-3 && T < c.t1 && !c.obj.hidden && !c.obj.locked && !TRK[c.track]?.lock)
    .map(c => ({ c, r: rectOf(c.obj) }));
  const m = Layers.mergeSel(marq.base, Layers.marqueeHits(items, marq.box, { DW, DH }));
  sel = m.sel; multi = m.multi;
}

// ---------- geometry (design px) ----------
function activeKey(n) {
  if (!n.keys?.length) return null;
  let k = n.keys[0];
  for (const x of n.keys) if (x.t <= T + 1e-3) k = x;
  return k;
}
const SCENE_DEF = { led_text: [360, 400, 74], neon_text: [360, 400, 80], logo_row: [360, 310, 60], title_card: [360, 560, 50], icon_tap: [360, 985, 200], sticker: [360, 960, 320], follow_cta: [360, 858, 0], emoji_pop: [360, 640, 160],
  hf: [360, 640, 100] }; // S23 M160 (PR 175): khối HF hiểu size là % cỡ vừa khung (engine/hf.js, mặc định 100)
function getPos(c) {
  const o = c.obj;
  if (c.kind === 'line') return { x: o.x ?? DW / 2, y: o.y ?? DH / 2, size: o.size || 48 };
  if (c.kind === 'cap') return { x: o.x ?? 360, y: o.y ?? 790, size: o.size || 31 };
  if (c.kind === 'node') { const k = activeKey(o); return { x: k ? k.x : o.x ?? 360, y: k ? k.y : o.y ?? 600, size: o.size || NODE_SIZE[o.kind] || 24 }; }
  if (c.kind === 'badge') return { x: o.x ?? 360, y: o.y ?? (c.scene.card?.y ?? 140), size: o.size || 118 };
  if (c.kind === 'scene') {
    const cd = window.StageCore?.geoOf(o.type) === 'card' ? StageCore.cardOf(o, DW > DH) : null; // S17 M124: mọi cảnh có s.card
    if (cd) return { x: cd.x, y: cd.y, size: cd.w, card: cd };
    const d = SCENE_DEF[o.type] || [360, 640, 60];
    return { x: o.x ?? d[0], y: o.y ?? d[1], size: o.size || d[2] };
  }
  return null;
}
function setPos(c, p) {
  const o = c.obj;
  if (c.kind === 'node') { const k = activeKey(o); if (k) { k.x = Math.round(p.x); k.y = Math.round(p.y); } else { o.x = Math.round(p.x); o.y = Math.round(p.y); } if (p.size) o.size = Math.round(p.size); return; }
  if (c.kind === 'scene' && window.StageCore?.geoOf(o.type) === 'card') {
    const cur = getPos(c).card, f = p.size / cur.w;
    o.card = { ...cur, x: Math.round(p.x), y: Math.round(p.y), w: Math.round(cur.w * f), h: Math.round(cur.h * f) };
    return;
  }
  const d = SCENE_DEF[o.type] || [360, 640, 60]; // S23 M160 (PR 175): dời không ghi cỡ mặc định vào cảnh chưa có size
  if (window.StageCore?.posPatch) { Object.assign(o, StageCore.posPatch(o, p, d[2])); return; }
  o.x = Math.round(p.x); o.y = Math.round(p.y);
  if (p.size && d[2] !== 0) o.size = Math.round(p.size * 10) / 10;
}
const origSize = c => { const o = c.obj._orig; if (!o) return getPos(c)?.size; const tmp = { ...c, obj: { ...o, keys: c.obj.keys } }; return getPos(tmp)?.size; };

// ---------- timing ----------
const ABS_T = new Set(['t', 'out', 't0', 't1', 'reveal_t', 'strike_at', 'highlight_t']);
function shiftScene(s, d) {
  const walk = (o, top) => {
    if (Array.isArray(o)) return o.forEach(x => walk(x, false));
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (k === '_orig' || k === 'cid') continue;
      if (!top && ABS_T.has(k) && typeof v === 'number') o[k] = r2(v + d);
      else if (v && typeof v === 'object') walk(v, false);
    }
  };
  walk(s, true);
}
function setTimes(c, t0, t1, moved) {
  const o = c.obj; t0 = r2(Math.max(0, t0)); t1 = r2(Math.max(t0 + 1 / FPS, t1));
  if (c.kind === 'scene') { if (moved) shiftScene(o, t0 - o.t0); o.t0 = t0; o.t1 = t1; }
  else if (c.kind === 'line' || c.kind === 'node') {
    const s = c.scene;
    if (s.type === 'text' && s.lines.length === 1) { s.t0 = t0; s.t1 = t1; o.t = t0; delete o.out; }
    else {
      if (t0 < s.t0) s.t0 = t0; if (t1 > s.t1) s.t1 = t1;
      o.t = t0; if (Math.abs(t1 - s.t1) < .02) delete o.out; else o.out = t1;
      if (c.kind === 'node' && moved && o.keys) { const d = t0 - (c.t0); for (const k of o.keys) k.t = r2(k.t + d); }
    }
  } else if (c.kind === 'cap') {
    const d = t0 - o.t0, sc = moved ? 1 : (t1 - t0) / Math.max(.01, o.t1 - o.t0);
    for (const w of o.words) { if (moved) { w.s = r2(w.s + d); w.e = r2(w.e + d); } else { w.s = r2(t0 + (w.s - o.t0) * sc); w.e = r2(t0 + (w.e - o.t0) * sc); } }
    o.t0 = t0; o.t1 = t1;
  } else if (c.kind === 'sfx') o.t = t0;
  else if (c.kind === 'music') { o.t0 = t0; o.t1 = t1; }
  else if (c.setTimes) c.setTimes(t0, t1, moved);
}

function select(c, seek) {
  sel = c; multi = [];
  if (seek && c && (T < c.t0 || T >= c.t1)) setTime(c.t0 + Math.min(.4, (c.t1 - c.t0) / 2));
  renderList(); renderTimeline(); renderInspector(); drawOverlay();
  if (panel === 'trans' || panel === 'filter') renderPanel();
}

// ---------- inspector ----------
const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('');
const fontOpt = cur => (window.KnobsCore ? KnobsCore.fontOptions(FONTS, TL?.brand, cur, esc) : opt(FONTS, cur)); // S21 M148
const num = (f, v, step = 1) => `<input type="number" data-f="${f}" value="${v ?? ''}" step="${step}">`;
const sect = (title, body, ic = '') => `<section>${title ? `<div class="sh">${ic ? `<i class="ti ${ic}"></i>` : ''}${title}</div>` : ''}${body}</section>`;
// S17 M124: QC nhanh trên vị trí hiện tại (vùng an toàn, tràn khung, che mặt đang nói), đo ngay trong preview, không gọi server.
function qcOf(c) {
  const SC = window.StageCore, r = c && c.kind !== 'clip' ? rectOf(c.obj) : null; if (!SC || !r) return null;
  const face = (TL.clips?.length || TL.aroll) && win?.faceAt ? (() => { try { return win.faceAt(T); } catch { return null; } })() : null;
  return SC.quickCheck(r, { DW, DH, safe: SAFE, face, cover: c.kind === 'scene' && LAYOUT.has(c.obj.type) });
}
function qcHtml(c) {
  const q = qcOf(c); if (!q) return '';
  return q.length ? q.map(i => `<div class="warn"><i class="ti ti-alert-triangle"></i> ${esc(i.msg)}</div>`).join('') : '<div class="ok"><i class="ti ti-circle-check"></i> Trong vùng an toàn, không che mặt</div>';
}
function refreshQc() { const el = $('#insp .stqc'); if (el && sel) el.innerHTML = qcHtml(sel); }
// Rộng / cao: hộp engine đọc được (StageCore.boxOf) hoặc hộp đo trên preview (đổi thì phóng đều).
function sizeOf(c) {
  const b = window.StageCore?.canResize(c.kind, c.obj.type) ? StageCore.boxOf(c.obj, DW > DH) : rectOf(c.obj);
  return b ? { w: Math.round(b.w), h: Math.round(b.h) } : null;
}
function alignBlock() {
  const B = [['left', 'ti-layout-align-left', 'Trái'], ['hcenter', 'ti-layout-align-center', 'Giữa ngang'], ['right', 'ti-layout-align-right', 'Phải'],
    ['top', 'ti-layout-align-top', 'Trên'], ['vcenter', 'ti-layout-align-middle', 'Giữa dọc'], ['bottom', 'ti-layout-align-bottom', 'Dưới']];
  return sect(`Căn ${multi.length + 1} element`, `<div class="algrid">${B.map(([k, ic, l]) => `<button data-align="${k}" title="${l}"><i class="ti ${ic}"></i></button>`).join('')}</div>
    <div class="help">Shift + bấm trên preview để thêm / bỏ element. ${tip('Kéo một element là dời cả nhóm.')}</div><div class="acts"><button data-align="none"><i class="ti ti-x"></i> Bỏ chọn nhóm</button></div>`, 'ti-layout-align-center');
}
function posBlock(c) {
  const p = getPos(c); if (!p) return '';
  const os = origSize(c) || p.size, pct = Math.round(p.size / os * 100), sz = sizeOf(c), rot = window.StageCore?.canRotate(c.kind);
  return sect('Vị trí và cỡ', `<div class="row"><div><span class="lbl">X</span>${num('x', Math.round(p.x))}</div><div><span class="lbl">Y</span>${num('y', Math.round(p.y))}</div><div><span class="lbl">Cỡ %</span>${num('pct', pct)}</div></div>
    ${sz ? `<div class="row"><div><span class="lbl">Rộng</span>${num('w', sz.w)}</div><div><span class="lbl">Cao</span>${num('h', sz.h)}</div>${rot ? `<div><span class="lbl">Xoay °</span>${num('rot', c.obj.rot || 0, 1)}</div>` : ''}</div>` : ''}
    <div class="slrow"><span>Cỡ</span><input type="range" data-f="pct" min="20" max="300" value="${pct}"><b>${pct}%</b></div>
    <div class="stqc">${qcHtml(c)}</div>`, 'ti-arrows-move');
}
// S21 M148: thương hiệu trước tiên — màu của TL.brand (bộ đang dùng) thành hàng "Thương hiệu" đứng đầu ô màu; font của bộ đứng đầu ô font.
function colorBlock(cur) {
  const bc = window.KnobsCore?.brandColors(TL.brand) || [], up = String(cur || '').toUpperCase();
  const brand = bc.length ? `<span class="lbl">Thương hiệu</span><div class="sw sw-brand">${bc.map(c => `<button data-dfill="${c.v}" class="${up === c.v ? 'on' : ''}" data-color="${c.v}" title="${c.label} ${c.v}" aria-label="${c.label} ${c.v}"></button>`).join('')}</div>` : '';
  return `${brand}<span class="lbl">Màu</span><div class="sw"><button class="orig ${cur ? '' : 'on'}" data-color="">Gốc</button>
    ${SWATCH.map(c => `<button data-dfill="${c}" class="${cur === c ? 'on' : ''}" data-color="${c}" title="${c}"></button>`).join('')}
    <input type="color" data-f="color" value="${cur || '#ffffff'}"></div>`; // design-token-ok: default text colour of the video
}
function timeBlock(c) {
  return sect('Thời gian (giây)', `<div class="row"><div><span class="lbl">Bắt đầu</span>${num('t0', r2(c.t0), .01)}</div>
    ${c.kind === 'sfx' ? '' : `<div><span class="lbl">Kết thúc</span>${num('t1', r2(c.t1), .01)}</div>`}</div>`, 'ti-clock');
}
const noteBlock = o => sect('Ghi chú cho Claude', `<textarea data-f="note" placeholder="Ví dụ: đổi chữ này sang màu cam, to hơn…">${esc(o.note || '')}</textarea>
  <div class="help">Lưu cùng chỉnh sửa. Lần sau nói với Claude “xem ghi chú trong editor”.</div>`, 'ti-message-2');
const actions = c => `<div class="acts"><button data-act="hide"><i class="ti ${c.obj.hidden ? 'ti-eye' : 'ti-eye-off'}"></i> ${c.obj.hidden ? 'Hiện' : 'Ẩn'}</button><button data-act="dup"><i class="ti ti-copy"></i> Nhân bản</button>
  <button data-act="del" class="danger"><i class="ti ti-trash"></i> Xoá</button>${c.obj._orig ? '<button data-act="reset"><i class="ti ti-restore"></i> Về thiết kế</button>' : ''}</div>`;
function textBlock(o, withStyle) {
  return sect('Nội dung', `<textarea data-f="text" rows="2" class="big">${esc(o.text || '')}</textarea>`, 'ti-letter-t') +
    sect('Chữ', `<div class="row"><div><span class="lbl">Font</span><select data-f="font">${fontOpt(o.font || '')}</select></div>
    <div><span class="lbl">Độ đậm</span><select data-f="weight">${opt([['', 'Mặc định'], ['500', '500'], ['600', '600'], ['700', '700'], ['800', '800'], ['900', '900']], o.weight || '')}</select></div></div>
    ${withStyle ? `<span class="lbl">Kiểu chữ</span><div class="pills">${STYLES.map(([v, l]) => `<button class="${(o.style || 'white') === v ? 'on' : ''}" data-sty="${v}">${l}</button>`).join('')}</div>
    <label class="check"><input type="checkbox" data-f="italic" ${o.italic === false ? '' : 'checked'}> Nghiêng</label>` : ''}
    ${colorBlock(o.color)}`, 'ti-typography');
}
function animBlock(c) {
  const o = c.obj, cur = o.anim || 'pop', d = r2(c.t1 - c.t0);
  return sect('Hoạt ảnh vào', `<div class="angrid">${ANIM_LIST.map(([k, l]) => `<button class="an ${cur === k ? 'on' : ''}" data-anim="${k}"><span class="ad"><b class="an-${k}">Aa</b></span><small>${l}</small></button>`).join('')}</div>`, 'ti-sparkles') +
    sect('Thời lượng', `<div class="slrow"><span>Hiển thị</span><input type="range" data-f="dur" min=".3" max="10" step=".1" value="${d}"><b>${d}s</b></div>
    <div class="help">Chữ hiện từ ${fmt(c.t0)}. Kéo mép khối trên timeline để chỉnh chính xác.</div>`, 'ti-clock');
}
function capText(c) { return c.words.map(w => (w.hl ? `*${w.w}*` : w.w) + (w.br ? ' /' : '')).join(' '); }

// Clip inspector (main track): Cơ bản / Tốc độ / Âm thanh / Màu / Chuyển cảnh.
function clipTabs(c) {
  const o = c.obj, k = clipLayout()[c.idx], f = o.filter || {}, still = typeof o.src === 'string';
  const rng = (fld, v, a, b, st, lab, unit = '', show = x => x) => `<div class="slrow"><span>${lab}</span><input type="range" data-cf="${fld}" min="${a}" max="${b}" step="${st}" value="${v}"><b data-v="${fld}">${show(v)}${unit}</b></div>`;
  const thumb = clipFrameUrl(o, srcAt(k, k.t0 + Math.min(.5, (k.t1 - k.t0) / 2)));
  return [
    ['basic', 'Cơ bản', `<div class="clipcard"><span class="cth" data-dbg="${esc(thumb)}" data-dfx="${esc(clipFilterCss(o))}"></span><div><b>Clip ${c.idx + 1} / ${TL.clips.length}</b>
        <small>${still ? 'Ảnh tĩnh' : 'Video'} · nguồn ${r2(o.in || 0)}–${r2(o.out ?? 3)}s</small><small>Trên timeline ${fmt(k.t0)} – ${fmt(k.t1)}</small></div></div>` +
      sect('Khung hình', `<div class="seg3">${[['cover', 'Lấp đầy', 'ti-arrows-maximize'], ['contain', 'Vừa khung', 'ti-box-padding'], ['blurfill', 'Nền mờ', 'ti-blur']].map(([v, l, ic]) => `<button class="${(o.fit || 'cover') === v ? 'on' : ''}" data-cfit="${v}"><i class="ti ${ic}"></i>${l}</button>`).join('')}</div>
        ${rng('zoom', o.zoom || 1, 1, 3, .05, 'Phóng to', '×')}${rng('ox', o.ox ?? 50, 0, 100, 1, 'Tâm X', '%')}${rng('oy', o.oy ?? 45, 0, 100, 1, 'Tâm Y', '%')}
        <div class="acts"><button data-cact="flip" class="${o.flip ? 'on' : ''}"><i class="ti ti-flip-vertical"></i> Lật ngang</button></div>`, 'ti-crop') +
      sect('Cắt nguồn (giây)', `<div class="row"><div><span class="lbl">Vào</span><input type="number" step=".05" data-cf="in" value="${r2(o.in || 0)}"></div><div><span class="lbl">Ra</span><input type="number" step=".05" data-cf="out" value="${r2(o.out ?? 3)}"></div></div>
        <div class="help">Đổi điểm vào/ra sẽ tự dồn phụ đề, graphic, SFX phía sau (ripple).</div>`, 'ti-cut') +
      `<div class="acts"><button data-cact="split"><i class="ti ti-scissors"></i> Tách tại playhead</button><button data-cact="dup"><i class="ti ti-copy"></i> Nhân bản</button><button data-cact="del" class="danger"><i class="ti ti-trash"></i> Xoá (dồn)</button></div>`],
    ['speed', 'Tốc độ', (h => (Studio.speedTab ? Studio.speedTab(o, k, h) : h))(sect('Tốc độ phát', `<div class="seg4">${[.5, 1, 1.5, 2].map(v => `<button class="${(o.speed || 1) === v ? 'on' : ''}" data-cspeed="${v}">${v}×</button>`).join('')}</div>
        ${rng('speed', o.speed || 1, .25, 4, .05, 'Tốc độ', '×')}
        <div class="stat"><span>Thời lượng</span><b>${r2(k.t1 - k.t0)}s</b><span class="muted">gốc ${r2((o.out ?? 3) - (o.in || 0))}s</span></div>
        <div class="help">Phụ đề, graphic giãn/co theo clip; phía sau tự dồn. ${tip('Tiếng đổi tốc độ theo clip nhưng giữ cao độ.')}</div>`, 'ti-brand-speedtest'))],
    ['audio', 'Âm thanh', sect('Âm lượng clip', still || !o.audio ? '<div class="help">Clip này không có tiếng.</div>'
      : `${rng('volume', Math.round((o.volume ?? 1) * 100), 0, 200, 1, 'Âm lượng', '%')}<div class="acts"><button data-cact="mute" class="${o.mute ? 'on' : ''}"><i class="ti ${o.mute ? 'ti-volume-off' : 'ti-volume'}"></i> ${o.mute ? 'Đang tắt tiếng' : 'Tắt tiếng'}</button></div>`, 'ti-volume')],
    ['color', 'Màu', sect('Bộ lọc', `<div class="flmini">${FILTERS.map(([v, l]) => `<button class="${(f.preset || '') === v ? 'on' : ''}" data-cpreset="${v}"><span data-dbg="${esc(thumb)}" data-dfx="${esc(v ? LUT_CSS[v] : 'none')}"></span><small>${l}</small></button>`).join('')}</div>`, 'ti-color-filter') +
      sect('Điều chỉnh', `${rng('brightness', f.brightness ?? 1, .5, 1.5, .01, 'Độ sáng')}${rng('contrast', f.contrast ?? 1, .5, 1.5, .01, 'Tương phản')}${rng('saturate', f.saturate ?? 1, 0, 2, .01, 'Bão hoà')}
        ${rng('temp', f.temp ?? 0, -1, 1, .01, 'Nhiệt độ')}${rng('hue', f.hue ?? 0, -180, 180, 1, 'Sắc độ', '°')}${rng('blur', f.blur ?? 0, 0, 20, .5, 'Làm mờ', 'px')}
        <div class="acts"><button data-cact="resetcolor"><i class="ti ti-restore"></i> Đặt lại màu</button></div>`, 'ti-adjustments')],
    ['trans', 'Chuyển cảnh', c.idx === 0 ? sect('', `<div class="help">Clip đầu tiên không có chuyển cảnh vào. ${tip('Chọn clip phía sau, hoặc kéo hiệu ứng từ thư viện Chuyển cảnh thả vào chỗ nối giữa hai clip.')}</div>`)
      : sect('Chuyển cảnh vào clip này', `<div class="trgrid sm"><button class="tr ${o.transition ? '' : 'on'}" data-ctr=""><span class="demo none"><i class="ti ti-ban"></i></span><small>Không</small></button>
        ${TRANS_TYPES.map(([kk, l, ic]) => `<button class="tr ${o.transition?.type === kk ? 'on' : ''}" data-ctr="${kk}"><span class="demo t-${kk}"><i class="a"></i><i class="b"></i><i class="ti ${ic} ic"></i></span><small>${l}</small></button>`).join('')}</div>
        ${o.transition ? rng('tdur', o.transition.dur ?? .4, .1, 1.5, .05, 'Thời lượng', 's') : ''}`, 'ti-transition-right')],
  ];
}
function inspTabs(c) {
  const o = c.obj;
  if (c.kind === 'clip') return clipTabs(c);
  if (c.tabs) return c.tabs(c); // feature components bring their own inspector tabs
  if (c.kind === 'line') return [['basic', 'Cơ bản', textBlock(o, true)], ['anim', 'Hoạt ảnh', animBlock(c)], ['pos', 'Vị trí', posBlock(c) + timeBlock(c)]];
  if (c.kind === 'cap') return [['basic', 'Cơ bản', sect('Nội dung', `<textarea data-f="captext" rows="2" class="big">${esc(capText(o))}</textarea>
      <div class="help">*từ* = từ khoá nổi bật · dấu / = xuống dòng. ${tip('Bấm một từ bên dưới để bật/tắt nổi bật, Shift+bấm để xuống dòng sau từ đó.')}</div>
      <div class="wchips">${o.words.map((w, i) => `<span data-w="${i}" class="${w.hl ? 'hl' : ''} ${w.br ? 'br' : ''}">${esc(w.w)}</span>`).join('')}</div>`, 'ti-badge-cc') +
    sect('Chữ', `<div class="row"><div><span class="lbl">Font</span><select data-f="font">${fontOpt(o.font || '')}</select></div>
      <div><span class="lbl">Độ đậm</span><select data-f="weight">${opt([['', 'Mặc định'], ['600', '600'], ['700', '700'], ['800', '800'], ['900', '900']], o.weight || '')}</select></div></div>
      ${colorBlock(o.color)}<div class="acts"><button data-act="capall"><i class="ti ti-copy-check"></i> Áp dụng font/cỡ/màu/vị trí cho mọi phụ đề</button></div>`, 'ti-typography')],
    ['pos', 'Vị trí', posBlock(c) + timeBlock(c)]];
  if (c.kind === 'node') return [['basic', 'Cơ bản', sect('Nút sơ đồ', `<div class="row"><div><span class="lbl">Loại</span><select data-f="nkind">${opt(Object.keys(NODE_SIZE).map(k => [k, k]), o.kind)}</select></div>
      <div><span class="lbl">Icon</span><input data-f="icon" value="${esc(o.icon || '')}" placeholder="si:openai / 🚀"></div></div>
      <span class="lbl">Nội dung</span><input data-f="text" value="${esc(o.text || '')}">
      ${o.keys ? `<div class="help">Nút này di chuyển theo ${o.keys.length} mốc; kéo trên khung hình sẽ sửa mốc đang hiệu lực (${fmt(activeKey(o).t)}).</div>` : ''}`, 'ti-hierarchy')],
    ['pos', 'Vị trí', posBlock(c) + timeBlock(c)]];
  if (c.kind === 'badge') return [['basic', 'Cơ bản', sect('Huy hiệu', `<span class="lbl">Icon (si:slug, emoji, ảnh)</span><input data-f="icon" value="${esc(o.icon || 'si:claude')}"><span class="lbl">Màu nền</span><input type="color" data-f="bg" value="${o.bg || '#D97757'}">`) + posBlock(c)]]; // design-token-ok: default badge colour of the video
  if (c.kind === 'sfx') return [['basic', 'Cơ bản', sect('Hiệu ứng âm thanh', `<span class="lbl">Tiếng</span><div class="row"><select data-f="sfxname">${opt(LIB.sfx.map(f => [f.replace(/\.\w+$/, ''), f.replace(/\.\w+$/, '')]), o.name)}</select><button data-act="audition" class="fixed"><i class="ti ti-player-play-filled"></i></button></div>
    <span class="lbl">Âm lượng (dB)</span>${num('gain', o.gain ?? -12, 1)}`, 'ti-bell') + timeBlock(c)]];
  if (c.kind === 'music') return [['basic', 'Cơ bản', sect('Nhạc nền', `<span class="lbl">Nhạc</span><select data-f="mood">${opt([...(o.file ? [['', o.file]] : []), ...LIB.music.map(f => [f.replace('.mp3', ''), f.replace('.mp3', '')])], o.mood || '')}</select>
    <span class="lbl">Âm lượng (dB)</span>${num('gain', o.gain ?? -16, 1)}`, 'ti-music') + timeBlock(c)]];
  // scene
  let basic = '';
  if (o.text != null || ['led_text', 'neon_text'].includes(o.type)) basic += sect('Nội dung', `<input data-f="text" value="${esc(o.text || '')}">${colorBlock(o.color)}`, 'ti-letter-t');
  if (o.type === 'emoji_pop') basic += sect('Emoji', `<input data-f="emoji" value="${esc(o.src || '')}"><div class="help">Dán một emoji bất kỳ. Thư viện Sticker bên trái có sẵn emoji 3D.</div>`, 'ti-mood-smile');
  if (o.type === 'logo_row') basic += sect('Logo (cách nhau dấu phẩy)', `<input data-f="icons" value="${esc((o.icons || []).map(i => (typeof i === 'object' ? i.icon : i)).join(', '))}"><div class="help">si:openai, si:claude, si:googlegemini, emoji 🤖…</div>`, 'ti-brand-apple');
  if (o.type === 'title_card') basic += sect('Thẻ kết', `<span class="lbl">Câu hỏi</span><input data-f="question" value="${esc(o.question ?? '')}"><span class="lbl">Chữ trong nhãn</span><input data-f="pilltext" value="${esc(o.pill?.text || 'Claude')}">`);
  if (o.type === 'photo') { const cur = o.media || o.src, list = (typeof MEDIA !== 'undefined' ? MEDIA : []).filter(m => m.kind !== 'audio');
    basic += sect('Ảnh / clip', `<select data-f="pmedia">${opt([['', typeof cur === 'object' && cur ? 'Video đã chọn' : '— Chọn từ Media —'], ...list.map(m => [m.path, m.name])], typeof cur === 'string' ? cur : '')}</select><div class="help">Nhập ảnh/video mới ở mục Media bên trái.</div>`, 'ti-photo'); }
  if (o.type === 'frame_grid') basic += sect('Khung video', `<span class="lbl">Làm mờ video (px)</span>${num('blur', typeof o.blur === 'number' ? o.blur : Array.isArray(o.blur) ? o.blur[o.blur.length - 1].v : 0)}<span class="lbl">Vào cảnh</span><select data-f="enter">${opt([['cut', 'Cắt'], ['blur', 'Mờ dần'], ['zoom', 'Phóng to']], o.enter || 'cut')}</select>`);
  basic += timeBlock(c);
  return [['basic', 'Cơ bản', basic], ['pos', 'Vị trí', posBlock(c) || sect('', `<div class="help">Thành phần này không kéo thả được trên preview. ${tip('Sửa vị trí trong tab Nâng cao (JSON).')}</div>`)],
    ['json', 'Nâng cao', sect('Tham số đầy đủ (JSON)', `<textarea class="code" data-f="json">${esc(JSON.stringify(o, (k, v) => (k === 'cid' || k === '_orig' || k === 'lines' || k === 'nodes' ? undefined : v), 1))}</textarea>
      <div class="acts"><button data-act="json" class="primary"><i class="ti ti-check"></i> Áp dụng JSON</button></div>`, 'ti-code')]];
}
const KIND_IC = { clip: 'ti-movie', line: 'ti-letter-t', cap: 'ti-badge-cc', node: 'ti-hierarchy', badge: 'ti-badge', sfx: 'ti-bell', music: 'ti-music', scene: 'ti-sparkles' };
// S21 M145: cột phải = nhóm tab Thuộc tính · Lớp · Claude (S24 M170; tab Dự án bỏ ở M174) (lõi features/68_right.core.js). #insp vẫn là thân của
// tab đang mở, nên mọi selector cũ (#insp [data-f=…], workflow.focus) chạy như trước. Chưa nạp lõi thì giữ hành vi cũ (không có dải tab).
// auto (M174): tab đang mở do Studio tự đổi tới (không chọn gì → Claude); người dùng bấm tab / Studio.right.show thì tiêu cờ.
const RT = { tab: null, had: false, auto: false, detail: null, ext: {} };
const rtStore = { get() { try { return localStorage.getItem('avs.rtab'); } catch { return null; } }, set(v) { try { localStorage.setItem('avs.rtab', v); } catch { /* chế độ riêng tư */ } } };
// S22 M151: chế độ Cơ bản / Chuyên nghiệp (01_workflow.js đặt body.wf-basic; lõi features/01_level.core.js): Cơ bản không có tab Lớp.
const uiLevel = () => (document.body.classList.contains('wf-basic') ? 'basic' : 'pro');
const rtKeys = () => (window.LevelCore ? LevelCore.rightTabs(uiLevel()) : window.RightCore?.KEYS || []);
function rightTab() {
  const C = window.RightCore; if (!C) return sel ? 'props' : 'claude';
  const has = !!sel, keys = rtKeys();
  if (RT.tab == null) { const saved = rtStore.get(); RT.tab = C.initialTab(saved, has, keys, !!RT.detail); RT.auto = RT.tab !== saved; }
  else { const t = C.nextTab({ tab: RT.tab, had: RT.had, has, detail: !!RT.detail, keys, auto: RT.auto }); if (t !== RT.tab) RT.auto = true; RT.tab = t; }
  RT.had = has;
  return RT.tab;
}
function rightTabsBar(tab) {
  const bar = $('#rtabs'), C = window.RightCore; if (!bar) return;
  if (!C) { bar.hidden = true; return; }
  bar.hidden = false;
  // M156: không chọn gì, không chi tiết thư viện → Thuộc tính không có gì để xem: tắt nút, chú thích cách mở
  const off = k => k === 'props' && C.propsUsable && !C.propsUsable(!!sel, !!RT.detail);
  bar.innerHTML = C.tabsFor(rtKeys()).map(([k, l, ic]) => `<button role="tab" data-rtab="${k}" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}" tabindex="${k === tab ? 0 : -1}"${off(k) ? ' disabled title="Bấm một element trên khung, timeline hoặc một mục thư viện để xem thuộc tính"' : ''}><i class="ti ${ic}"></i><span>${l}</span>${k === 'props' && sel ? '<b class="dot" aria-hidden="true"></b>' : ''}</button>`).join('');
}
function showRightTab(k) {
  if (!window.RightCore?.valid(k)) return;
  // C24: tab chỉ có ở Chuyên nghiệp (Lớp) mở từ nút / lệnh khi đang Cơ bản → đổi sang Chuyên nghiệp rồi mở, không mất tính năng
  if (!RightCore.valid(k, rtKeys())) { if (Studio.workflow?.setLevel) Studio.workflow.setLevel('pro'); else return; }
  if (k === 'props' && RightCore.propsUsable && !RightCore.propsUsable(!!sel, !!RT.detail)) return; // M156: không có gì để xem
  RT.tab = k; RT.had = !!sel; RT.auto = false; rtStore.set(k); renderInspector();
}
$('#insp').addEventListener('click', e => { const b = e.target.closest('[data-rtgo]'); if (b) showRightTab(b.dataset.rtgo); });
$('#rtabs')?.addEventListener('click', e => { const b = e.target.closest('[data-rtab]'); if (b) showRightTab(b.dataset.rtab); });
$('#rtabs')?.addEventListener('keydown', e => { // ← → giữa các tab (role=tablist)
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const K = rtKeys().filter(k => k !== 'props' || !RightCore.propsUsable || RightCore.propsUsable(!!sel, !!RT.detail)), i = K.indexOf(RT.tab), n = K[(i + (e.key === 'ArrowRight' ? 1 : K.length - 1)) % K.length];
  e.preventDefault(); e.stopPropagation(); showRightTab(n); $(`#rtabs [data-rtab="${n}"]`)?.focus();
});
// S21 M146: Thuộc tính dạng mục xếp chồng (lõi features/68_sections.core.js). Mỗi tab cũ ([key, label, html] của inspTabs và
// Studio.addInspectorTab) thành một mục thu gọn được; mở / đóng nhớ theo loại element (avs.isec). Mục đóng không vẽ thân (tính năng
// như 60_keyframes chỉ chạy khi thân mục có trong DOM). Dải mục .isecbar dính dưới đầu: bấm = mở + cuộn tới, tô mục đang thấy.
const SECT = { state: null, go: null, pin: 0, more: false };
const sectKind = c => (c.kind === 'scene' ? 'scene:' + (c.obj.type || '') : c.kind);
function sectState() {
  if (!SECT.state) { let v = null; try { v = localStorage.getItem('avs.isec'); } catch { /* chế độ riêng tư */ } SECT.state = window.SectCore ? SectCore.parse(v) : {}; }
  return SECT.state;
}
function setSect(key, on) {
  if (!sel || !window.SectCore) return;
  SECT.state = SectCore.setOpen(sectState(), sectKind(sel), key, on);
  try { localStorage.setItem('avs.isec', JSON.stringify(SECT.state)); } catch { /* chế độ riêng tư */ }
}
// mở + cuộn tới (dải mục, chỗ nối chuyển cảnh). Mục nằm ở tab Thuộc tính: đang ở Lớp / Claude thì sang Thuộc tính (S23 M166:
// bấm chỗ nối trên timeline khi cột phải ở Lớp không thấy gì đổi, vì nextTab giữ Lớp)
function openSect(key) { setSect(key, true); SECT.go = key; if (RT.tab !== 'props' && sel) showRightTab('props'); else renderInspector(); }
const sectLine = () => $('#insp .itop')?.getBoundingClientRect().bottom ?? 0;
function sectAfter() {
  const go = SECT.go && $(`#insp .isec[data-sec="${CSS.escape(SECT.go)}"]`), sc = $('#right');
  if (SECT.obj !== sel?.obj) { SECT.obj = sel?.obj; SECT.pin = 0; if (sc && !go) sc.scrollTop = 0; } // element khác: về đầu
  if (go && sc) { sc.scrollTop += go.getBoundingClientRect().top - sectLine(); SECT.pin = SECT.go; }
  SECT.go = null; sectSpy();
}
function sectSpy() {
  const bar = $('#insp .isecbar'), sc = $('#right'); if (!bar || !sc || !window.SectCore) return;
  const tops = [...document.querySelectorAll('#insp .isec')].map(x => [x.dataset.sec, x.getBoundingClientRect().top]);
  const k = SECT.pin || SectCore.active(tops, sectLine(), sc.scrollTop > 0 && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2);
  for (const b of bar.children) {
    const on = b.dataset.secgo === k; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'true' : 'false');
  }
}
$('#right')?.addEventListener('scroll', sectSpy, { passive: true });
for (const ev of ['wheel', 'touchmove', 'keydown']) $('#right')?.addEventListener(ev, () => { SECT.pin = 0; }, { passive: true });
// S24 M172 (C36): Thuộc tính chỉ chỉnh tay. Một lối vào Claude cho element / clip đang chọn, ở đầu thân Thuộc tính (chỗ mục
// "Hỏi Claude" cũ của 72_elem_ai.js): mở tab Claude, chip phạm vi lấy theo S.sel (75_ask.js selInfo). Âm thanh không có chip riêng.
const askRow = c => (Studio.ask && (c.kind === 'clip' || window.AskCore?.ELEM_KINDS?.includes(c.kind))
  ? `<button class="iask" data-act="ask" title="Mở tab Claude, phạm vi là ${c.kind === 'clip' ? 'clip' : 'element'} này (/)"><i class="ti ti-sparkles"></i><span>Hỏi Claude về mục này</span><kbd>/</kbd></button>` : '');
function renderInspector() {
  const el = $('#insp'), tab = rightTab();
  rightTabsBar(tab); el.dataset.rtab = tab;
  if (tab === 'layers') { if (RT.ext.layers) RT.ext.layers(el); else el.innerHTML = '<div class="rempty">Chưa có bảng Lớp.</div>'; return; }
  if (tab === 'claude') { if (RT.ext.claude) RT.ext.claude(el); else el.innerHTML = '<div class="rempty">Chưa có Hỏi Claude.</div>'; return; } // S24 M170: 75_ask.js
  if (!sel) {
    if (RT.detail) { el.innerHTML = RT.detail.html; RT.detail.mount?.(el); return; } // M147: chi tiết mục thư viện
    RT.tab = window.RightCore?.IDLE || 'claude'; RT.auto = true; return renderInspector(); // M156 / M174: không còn ô "Chưa chọn element", về tab Claude
  }
  const c = sel, o = c.obj;
  const tag = { clip: 'Video', line: c.scene?.type === 'text' ? 'Chữ thêm' : 'Chữ graphic', cap: 'Phụ đề', node: 'Sơ đồ', badge: 'Huy hiệu', sfx: 'Âm thanh', music: 'Nhạc nền', scene: sceneName(o) }[c.kind] || c.tag || c.kind;
  const tabs = inspTabs(c);
  for (const h of Studio._insp) { const t = h(c); if (t) tabs.push(...(Array.isArray(t[0]) ? t : [t])); }
  const SC = window.SectCore, kind = sectKind(c), st = sectState();
  // S22 M151: Cơ bản chỉ hiện Núm + mục chính (S24 M172: bỏ Hỏi Claude); mục khác thu sau "Thêm thuộc tính" (bấm mở, nhớ trong phiên: SECT.more)
  const all = SC ? SC.normalize(tabs) : tabs.map(([key, label, html]) => ({ key, label, html, icon: 'ti-point' }));
  const sp = SC?.split ? SC.split(all, uiLevel() === 'basic') : { main: all, more: [] };
  if (SECT.go && sp.more.some(s => s.key === SECT.go)) SECT.more = true; // mở mục ẩn từ chỗ khác (chuyển cảnh, dải mục): mở luôn phần thêm
  const secs = SECT.more ? [...sp.main, ...sp.more] : sp.main, nMore = sp.more.length;
  const open = secs.map((s, i) => (SC ? SC.isOpen(st, kind, s.key, i === 0) : true));
  const moreBtn = nMore ? `<button class="isec-more" data-act="secmore" aria-expanded="${!!SECT.more}"><i class="ti ${SECT.more ? 'ti-chevron-up' : 'ti-dots-circle-horizontal'}"></i><span>${SECT.more ? 'Ẩn bớt thuộc tính' : `Thêm thuộc tính (${nMore})`}</span></button>` : '';
  const clip = c.kind === 'clip', ic = (act, on, icn, tip) => `<button class="icon ${on ? 'on' : ''}" data-act="${act}" aria-pressed="${on}" title="${tip}" aria-label="${tip}"><i class="ti ${icn}"></i></button>`;
  el.innerHTML = `<div class="itop"><div class="ihead"><span class="iic"><i class="ti ${KIND_IC[c.kind]}"></i></span><div class="it"><h3>${esc(c.kind === 'line' && c.scene.type === 'text' ? (o.text || 'Chữ thêm') : c.label)}</h3>
      <div class="sub"><span class="pill">${esc(tag)}</span><a class="time" data-act="seek"><i class="ti ti-clock-play"></i> ${fmt(c.t0)} – ${fmt(c.t1)}</a></div></div>
      <div class="ihbtn">${clip ? '' : ic('lock', !!o.locked, o.locked ? 'ti-lock' : 'ti-lock-open', o.locked ? 'Mở khoá (⌥⇧L)' : 'Khoá (⌥⇧L)') + ic('hide', !!o.hidden, o.hidden ? 'ti-eye-off' : 'ti-eye', o.hidden ? 'Hiện' : 'Ẩn')}
      <button class="icon" data-act="more" title="Lệnh khác" aria-label="Lệnh khác" aria-haspopup="menu"><i class="ti ti-dots"></i></button>
      <button class="icon" data-act="desel" title="Bỏ chọn (Esc)" aria-label="Bỏ chọn"><i class="ti ti-x"></i></button></div></div>
    ${secs.length > 1 ? `<nav class="isecbar" aria-label="Mục thuộc tính">${secs.map((s, i) => `<button data-secgo="${esc(s.key)}" class="${open[i] ? 'open' : ''}">${esc(s.label)}</button>`).join('')}</nav>` : ''}</div>
    <div class="ibody">${askRow(c)}${Studio._itop.map(f => f(c) || '').join('')}${multi.length && !clip ? alignBlock() : ''}${secs.map((s, i) => `<div class="isec ${open[i] ? 'open' : ''}" data-sec="${esc(s.key)}">
      <button class="isec-h" data-sect="${esc(s.key)}" aria-expanded="${open[i]}"><i class="ti ${s.icon}"></i><span>${esc(s.label)}</span><i class="ti ti-chevron-down car"></i></button>
      ${open[i] ? `<div class="isec-b">${s.html}</div>` : ''}</div>`).join('')}${moreBtn}${clip ? '' : actions(c) + noteBlock(o)}</div>`;
  requestAnimationFrame(sectAfter);
}
// Cài đặt dự án: panel wf-project ở bước Chuẩn bị của thanh trái (S24 M174, 01_workflow.js; trước ở tab Dự án của cột phải).
// Studio.project = { html, mount(el) }: mount gắn sự kiện lên chính khối .pp-panel (không lên #libbody: data-pf của 29_perf, 52_publish
// cũng ở đó). Chủ repo báo 2026-11-17: phần này
// trùng nhiều chỗ khác. Mỗi thứ chỉ một nơi sửa: bộ thương hiệu dùng chung ở bước ① (ở đây chỉ thẻ tóm tắt + chỉnh riêng cho video
// này, thu gọn), kiểu phụ đề ở panel Chữ, SFX tự động ở panel Âm thanh (ở đây là đường tắt). Còn lại là việc chỉ có ở đây: gói style
// + dựng tự động theo gói, hiện từng từ, ghi chú cho Claude; vị trí mặt vào "Nâng cao".
function projectPanel() {
  const B = TL.brand || {};
  const bf = (k, label, type = 'text', ph = '') => `<div><span class="lbl">${label}</span><input ${type === 'color' ? 'type="color"' : ''} data-brand="${k}" value="${esc(B[k] ?? (type === 'color' ? (k === 'primary' ? '#FF5A36' : '#FFD84A') : ''))}" placeholder="${esc(ph)}"></div>`; // design-token-ok: brand-kit defaults are video colours
  const capLabel = TL.caption_style === 'none' ? 'Tắt phụ đề' : !TL.caption_style ? 'Karaoke cơ bản' : ((win && win.CAPTION_LABELS || {})[TL.caption_style] || TL.caption_style);
  const pk = packs().find(p => p.id === TL.pack);
  const brandName = B.name || B.title || '';
  const brand = sect('Thương hiệu', `<div class="pp-brand"><span class="pp-sw">${['primary', 'accent'].map(k => `<i data-dfill="${esc(B[k] || '')}" title="${k === 'primary' ? 'Màu chính' : 'Màu nhấn'}"></i>`).join('')}</span>
      <div class="pp-bn"><b>${esc(brandName || 'Chưa có thương hiệu')}</b><small>${esc([B.handle, B.website].filter(Boolean).join(' · ') || (B.kit ? 'bộ thương hiệu đang dùng' : 'video này chưa dùng bộ thương hiệu nào'))}</small></div></div>
    <div class="acts"><button data-pact="brandkit" class="primary"><i class="ti ti-pencil"></i> ${B.kit ? 'Sửa bộ thương hiệu' : 'Chọn thương hiệu'}</button></div>
    <details class="pp-more"><summary><i class="ti ti-adjustments"></i>Chỉnh riêng cho video này</summary>
      <div class="help">Chỉ đổi ở video này, bộ thương hiệu dùng chung không đổi.</div>
      <div class="row">${bf('primary', 'Màu chính', 'color')}${bf('accent', 'Màu nhấn', 'color')}</div>
      <div class="row">${bf('name', 'Tên hiển thị', 'text', 'Kiệm AI')}${bf('handle', 'Kênh', 'text', '@kiem.ai')}</div>
      <div class="row">${bf('phone', 'Điện thoại', 'text', '09xx…')}${bf('website', 'Website', 'text', 'nguyentatkiem.com')}</div>
      ${bf('logo', 'Logo (đường dẫn trong dự án, si:tên-biểu-tượng hoặc emoji; tải ảnh logo ở bộ thương hiệu)', 'text', 'media/logo.png')}</details>`, 'ti-palette');
  const style = sect('Gói style' + tip('Dựng tự động: thêm intro, graphic theo từ khoá trong lời nói, CTA cuối, nhạc. Bám lời thoại: canh các graphic của mẫu đúng lúc nói, viết lại chữ và thay ảnh mẫu theo nội dung clip. Hoàn tác được.'), `<select data-pf="pack">${opt([['', '— chọn —'], ...packs().map(p => [p.id, p.icon + ' ' + p.name])], TL.pack || '')}</select>
      <div class="help">${esc(pk?.desc || 'Gói quyết định kiểu phụ đề, graphic gợi ý và bản dựng tự động.')}</div>
      <div class="acts"><button data-pact="recipe" class="primary"><i class="ti ti-wand"></i> Dựng tự động theo gói</button><button data-pact="tplfit"><i class="ti ti-text-recognition"></i> Bám lời thoại</button></div>`, 'ti-layout-grid');
  const caps = sect('Phụ đề', `<div class="pp-line"><span>Kiểu: <b>${esc(capLabel)}</b></span><button data-pact="open-text" class="ghost"><i class="ti ti-arrow-right"></i> Đổi ở panel Chữ</button></div>
      <label class="check"><input type="checkbox" data-pf="caption_reveal" ${TL.caption_reveal === false ? '' : 'checked'}> Hiện từng từ theo lời nói</label>`, 'ti-badge-cc');
  const sfx = sect('Âm thanh', `<div class="pp-line"><span>${(TL.audio?.sfx || []).length} SFX · ${(TL.audio?.music || []).length} nhạc nền</span><button data-pact="open-audio" class="ghost"><i class="ti ti-arrow-right"></i> Mở panel Âm thanh</button></div>`, 'ti-volume');
  const note = sect('Ghi chú chung cho Claude', `<textarea data-pf="note" placeholder="Ví dụ: thêm b-roll ở đoạn 0:12, nhạc sôi động hơn…">${esc(TL.note || '')}</textarea>
      <div class="help">Bấm chữ / khung trên preview hoặc khối timeline để chỉnh. ${tip('Kéo để di chuyển, kéo góc để đổi cỡ.')}</div>`, 'ti-message-2');
  const adv = `<details class="pp-more pp-adv"><summary><i class="ti ti-settings-2"></i>Nâng cao</summary>${sect('Vị trí mặt (bubble / PIP / vùng mặt)', `<div class="row"><div><span class="lbl">X</span><input type="number" data-pf="facex" value="${TL.face?.x ?? 360}"></div><div><span class="lbl">Y</span><input type="number" data-pf="facey" value="${TL.face?.y ?? 520}"></div></div>`, 'ti-face-id')}</details>`;
  const meta = `<div class="meta"><span><i class="ti ti-movie"></i> ${(TL.clips || []).length} clip</span><span><i class="ti ti-photo"></i> ${META.frames} khung</span><span><i class="ti ti-clock"></i> ${fmt(TL.duration)}</span><span><i class="ti ti-aspect-ratio"></i> ${DW > DH ? '16:9' : '9:16'}</span></div>`;
  return `<div class="pp-panel" data-proj><div class="pp-head"><i class="ti ti-movie"></i><b>${esc(META.name || 'Dự án')}</b></div>${meta}
    ${brand}${style}${caps}${sfx}${note}${adv}</div>`;
}
// sự kiện của Cài đặt dự án (trước nằm trong các listener của #insp)
function mountProject(root) {
  const box = root?.querySelector?.('.pp-panel') || root; if (!box || box._pp) return; box._pp = 1;
  box.addEventListener('input', e => {
    const t = e.target, pf = t.dataset.pf, bk = t.dataset.brand;
    if (bk) { pushUndo('brand' + bk); TL.brand = { ...(TL.brand || {}), [bk]: t.value || undefined }; return changed(); }
    if (pf && t.tagName !== 'SELECT' && t.type !== 'checkbox') return projectField(pf, t);
  });
  box.addEventListener('change', e => { const t = e.target, pf = t.dataset.pf; if (pf && (t.tagName === 'SELECT' || t.type === 'checkbox')) projectField(pf, t); });
  box.addEventListener('click', e => {
    const pa = e.target.closest('[data-pact]')?.dataset.pact; if (!pa) return;
    if (pa === 'recipe') {
      if (!TL.pack) return toast('Chọn gói style trước');
      // recipes place their graphics on keywords of the speech — without captions they would only add intro/CTA
      if (!CAP.length && Studio.needCaptions) return Studio.needCaptions(() => { pushUndo(); applyRecipe(TL.pack); }, 'Dựng tự động theo gói');
      pushUndo(); return applyRecipe(TL.pack);
    }
    if (pa === 'autosfx') return autoSfx();
    // đường tắt của Cài đặt dự án sang nơi sửa duy nhất (S19 M137)
    if (pa === 'brandkit') return TL.brand?.kit && Studio.nextStep?.editBrand ? Studio.nextStep.editBrand('name') : Studio.workflow?.focus('brands', ['.bk-card.cur', '.bk-card', '#bk-new2']);
    if (pa === 'open-text') return Studio.workflow?.focus('text', ['.cslist .on', '.cslist']);
    if (pa === 'open-audio') return Studio.workflow?.focus('audio');
  });
}
// gói vừa đổi: vẽ lại panel Cài đặt dự án nếu đang mở (mô tả gói)
const redrawProject = () => { const b = $('#libbody'); if (b?.querySelector('.pp-panel')) { b.innerHTML = projectPanel(); mountProject(b); } };
// Starter edit from a pack recipe (also used once for projects made by "Video mới").
function applyRecipe(packId, title, replace = false) {
  const p = packs().find(x => x.id === packId);
  if (!p?.recipe) return toast('Gói này chưa có bản dựng tự động');
  const r = p.recipe({ dur: TL.duration, captions: CAP, brand: (win.BR ? win.BR() : TL.brand || {}), vertical: DH > DW, title: title ?? TL.title ?? '' });
  TL.pack = packId;
  if (r.caption_style != null) TL.caption_style = r.caption_style || undefined;
  TL.scenes = [...(replace ? [] : (TL.scenes || []).filter(s => !s._recipe)), ...(r.scenes || []).map(s => ({ ...s, _recipe: true }))];
  if (r.fx) TL.fx = [...(replace ? [] : (TL.fx || []).filter(f => !f._recipe)), ...r.fx.map(f => ({ ...f, _recipe: true }))];
  if (r.music) { TL.audio = TL.audio || {}; TL.audio.music = [{ t0: 0, t1: TL.duration, mood: r.music, gain: -10 }];
    if (TL.audio.duck == null || TL.audio.duck === true) TL.audio.duck = { on: true, amount_db: -10, attack: 60, release: 400, hold: 250 }; } // cùng số với scripts/audio_defaults.mjs (S26 M181)
  needInit = true; changed(true); toast(`Đã dựng theo gói ${p.name}: ${(r.scenes || []).length} thành phần`);
}
function applyField(f, v, el) {
  const c = sel, o = c?.obj;
  if (f === 'note') { o.note = v || undefined; markDirty(); renderList(); return; }
  if (f === 'rot') { touch(o, 'rot'); const d = StageCore.rotNorm(v); if (d) o.rot = d; else delete o.rot; changed(); refreshQc(); return; }
  if (f === 'w' || f === 'h') {
    if (!(+v > 0)) return;
    touch(o, 'pos');
    if (StageCore.canResize(c.kind, o.type)) { const b = StageCore.boxOf(o, DW > DH); b[f] = +v; StageCore.setBox(o, b, DW > DH); }
    else { const r = rectOf(o), p = getPos(c); if (!r || !p?.size) return; p.size *= +v / (f === 'w' ? r.w : r.h); setPos(c, p); }
    changed(); syncPosInputs(f); refreshQc(); return;
  }
  if (['x', 'y', 'pct'].includes(f)) {
    touch(o, 'pos'); const p = getPos(c);
    if (f === 'x') p.x = +v; if (f === 'y') p.y = +v; if (f === 'pct') p.size = (origSize(c) || p.size) * (+v / 100);
    setPos(c, p); changed(); syncPosInputs(); refreshQc(); return;
  }
  if (f === 't0' || f === 't1') { pushUndo(o.cid + f); setTimes(c, f === 't0' ? +v : c.t0, f === 't1' ? +v : c.t1, false); changed(); return; }
  if (f === 'dur') { pushUndo(o.cid + f); setTimes(c, c.t0, c.t0 + +v, false); changed(); const b = el.parentNode.querySelector('b'); if (b) b.textContent = r2(+v) + 's'; return; }
  touch(o, f);
  if (f === 'text') o.text = v;
  else if (f === 'font' || f === 'weight' || f === 'style' || f === 'anim') { if (v === '') delete o[f]; else o[f] = f === 'weight' ? +v : v; }
  else if (f === 'italic') o.italic = el.checked;
  else if (f === 'color') o.color = v;
  else if (f === 'icon') o.icon = v;
  else if (f === 'emoji') o.src = v;
  else if (f === 'bg') o.bg = v;
  else if (f === 'nkind') { o.kind = v; }
  else if (f === 'gain') o.gain = +v;
  else if (f === 'sfxname') o.name = v;
  else if (f === 'mood') { if (v) { o.mood = v; delete o.file; } }
  else if (f === 'question') o.question = v;
  else if (f === 'pilltext') o.pill = { ...(o.pill || {}), text: v };
  else if (f === 'icons') o.icons = v.split(',').map(s => s.trim()).filter(Boolean);
  else if (f === 'enter') o.enter = v;
  else if (f === 'blur') o.blur = +v;
  else if (f === 'pmedia') { const m = MEDIA.find(x => x.path === v); if (m) { o.media = m.kind === 'video' ? { ...m.seq, t0: o.t0 } : m.path; delete o.src; } }
  else if (f === 'captext') setCapText(o, v);
  changed(f === 'captext' || f === 'nkind');
}
function syncPosInputs() {
  const p = sel && getPos(sel); if (!p) return;
  const set = (f, v) => { for (const i of document.querySelectorAll(`#insp [data-f="${f}"]`)) if (document.activeElement !== i) i.value = v; };
  set('x', Math.round(p.x)); set('y', Math.round(p.y)); set('pct', Math.round(p.size / (origSize(sel) || p.size) * 100));
  // rộng / cao đo sau khi preview vẽ lại (draw() bất đồng bộ)
  const sz = () => { const z = sel && sizeOf(sel); if (z) { set('w', z.w); set('h', z.h); } set('rot', sel?.obj.rot || 0); };
  sz(); setTimeout(sz, 120);
}
// "những thông tin / *gây shock*" → words with br/hl; keeps timings when the word count is unchanged, else spreads evenly.
function setCapText(c, v) {
  const toks = []; let hl = false, buf = [];
  for (const raw of v.trim().split(/\s+/)) {
    if (raw === '/') { if (toks.length) toks[toks.length - 1].br = true; continue; }
    let w = raw;
    if (w.startsWith('*')) { hl = true; w = w.slice(1); }
    const end = w.endsWith('*'); if (end) w = w.slice(0, -1);
    if (hl) { buf.push(w); if (end) { toks.push({ w: buf.join(' '), hl: true }); buf = []; hl = false; } }
    else if (w) toks.push({ w });
  }
  if (buf.length) toks.push({ w: buf.join(' '), hl: true });
  const old = c.words, same = old.length === toks.length;
  c.words = toks.map((tk, i) => {
    const s = same ? old[i].s : r2(c.t0 + (c.t1 - c.t0) * i / toks.length), e = same ? old[i].e : r2(c.t0 + (c.t1 - c.t0) * (i + 1) / toks.length);
    return { w: tk.w, s, e, ...(tk.hl ? { hl: true } : {}), ...(tk.br ? { br: true } : {}) };
  });
}
// Clip field edits from the inspector (sliders coalesce into one undo step).
function clipField(f, v, el) {
  const c = sel; if (c?.kind !== 'clip') return;
  const o = c.obj, i = c.idx;
  pushUndo('clip' + i + f);
  const lab = el?.parentNode?.querySelector(`[data-v="${f}"]`);
  if (f === 'speed') { setClipSpeed(i, +v); if (lab) lab.textContent = r2(+v) + '×'; changed(); return; }
  if ((f === 'in' || f === 'out') && !SpeedMap.plain(o)) { setClipRange(i, f, +v); changed(true); return; } // S29 M207: đường cong / ngược
  if (f === 'in' || f === 'out') {
    const sp = o.speed || 1, cur = f === 'in' ? (o.in || 0) : (o.out ?? 3);
    trimClip(i, f === 'in' ? 'l' : 'r', (+v - cur) / sp); changed(true); return;
  }
  if (f === 'zoom' || f === 'ox' || f === 'oy') { o[f] = +v; if (f === 'zoom' && +v === 1) delete o.zoom; }
  else if (f === 'volume') { o.volume = +v / 100; if (o.volume === 1) delete o.volume; }
  else if (f === 'tdur') { if (o.transition) o.transition.dur = +v; }
  else { o.filter = { ...(o.filter || {}), [f]: +v }; }
  if (lab) lab.textContent = (f === 'volume' ? Math.round(+v) : r2(+v)) + ({ zoom: '×', ox: '%', oy: '%', volume: '%', hue: '°', blur: 'px', tdur: 's' }[f] || '');
  changed();
}
$('#insp').addEventListener('input', e => {
  const t = e.target, f = t.dataset.f, cf = t.dataset.cf;
  if (cf) { if (t.type === 'range') clipField(cf, t.value, t); return; }
  if (!f || f === 'json' || f === 'captext') return;
  if (t.tagName === 'SELECT' || t.type === 'checkbox') return;
  if (t.type === 'range' && f === 'pct') { const b = t.parentNode.querySelector('b'); if (b) b.textContent = t.value + '%'; }
  applyField(f, t.value, t);
});
$('#insp').addEventListener('change', e => {
  const t = e.target, f = t.dataset.f, cf = t.dataset.cf;
  if (cf && t.type === 'number') return clipField(cf, t.value, t);
  if (cf && t.type === 'range') return renderInspector();
  if (f === 'captext' || t.tagName === 'SELECT' || t.type === 'checkbox') applyField(f, t.value, t);
});
function projectField(pf, el) {
  pushUndo('proj' + pf);
  if (pf === 'caption_style') TL.caption_style = el.value || undefined;
  if (pf === 'pack') { TL.pack = el.value || undefined; redrawProject(); }
  if (pf === 'caption_reveal') TL.caption_reveal = el.checked ? undefined : false;
  if (pf === 'facex' || pf === 'facey') TL.face = { ...(TL.face || { x: 360, y: 520 }), [pf === 'facex' ? 'x' : 'y']: +el.value };
  if (pf === 'note') TL.note = el.value || undefined;
  changed();
}
async function autoSfx() {
  if (!await saveNow()) return; pushUndo();
  const p = await api('/api/autosfx', { keep: true });
  if (p.error) return toast('Lỗi: ' + p.error);
  TL = p.timeline; CAP = p.captions; migrateClips(); changed(true); return toast(`Đã đặt ${TL.audio?.sfx?.length || 0} SFX`);
}
$('#insp').addEventListener('click', async e => {
  const t = e.target;
  const sg = t.closest('[data-secgo]');
  if (sg) return openSect(sg.dataset.secgo);
  const sh = t.closest('[data-sect]');
  if (sh) { setSect(sh.dataset.sect, sh.getAttribute('aria-expanded') !== 'true'); SECT.pin = 0; return renderInspector(); }
  const al = t.closest('[data-align]')?.dataset.align;
  if (al) return alignSel(al);
  if (!sel) return;
  const c = sel, o = c.obj;
  // clip controls
  let b;
  if ((b = t.closest('[data-cfit]'))) { pushUndo(); o.fit = b.dataset.cfit; if (o.fit === 'cover') delete o.fit; return changed(true); }
  if ((b = t.closest('[data-cspeed]'))) { pushUndo(); setClipSpeed(c.idx, +b.dataset.cspeed); return changed(true); }
  if ((b = t.closest('[data-cpreset]'))) { return setFilter(c.idx, b.dataset.cpreset); }
  if ((b = t.closest('[data-ctr]'))) { return setTransition(c.idx, b.dataset.ctr, o.transition?.dur ?? transDur); }
  if ((b = t.closest('[data-cact]'))) {
    const a = b.dataset.cact;
    if (a === 'flip') { pushUndo(); o.flip = !o.flip || undefined; return changed(true); }
    if (a === 'mute') { pushUndo(); o.mute = !o.mute || undefined; return changed(true); }
    if (a === 'resetcolor') { pushUndo(); delete o.filter; return changed(true); }
    if (a === 'split') return splitAtPlayhead();
    if (a === 'dup') return duplicateSel();
    if (a === 'del') return removeSel();
  }
  if ((b = t.closest('[data-anim]'))) { touch(o, 'anim'); o.anim = b.dataset.anim; changed(true); return; }
  if ((b = t.closest('[data-sty]'))) { touch(o, 'style'); o.style = b.dataset.sty; changed(true); return; }
  b = t.closest('[data-act],[data-color],[data-w]'); if (!b) return;
  if (b.dataset.color != null) { touch(o, 'color'); if (b.dataset.color) o.color = b.dataset.color; else delete o.color; changed(true); return; }
  if (b.dataset.w != null) { touch(o, 'w'); const w = o.words[+b.dataset.w]; if (e.shiftKey) w.br = !w.br || undefined; else w.hl = !w.hl || undefined; changed(true); return; }
  const a = b.dataset.act;
  if (a === 'seek') setTime(c.t0);
  if (a === 'desel') select(null);
  if (a === 'secmore') { SECT.more = !SECT.more; renderInspector(); return; } // S22 M151: "Thêm thuộc tính" ở Cơ bản
  if (a === 'lock') toggleLock();
  if (a === 'more') { const r = b.getBoundingClientRect(); Studio.cmdMenu?.(r.right - 200, r.bottom + 4); }
  if (a === 'ask') Studio.ask?.open(); // S24 M172: nút "Hỏi Claude về mục này" → tab Claude, phạm vi = element / clip đang chọn
  if (a === 'hide') { touch(o); o.hidden = !o.hidden || undefined; changed(true); }
  if (a === 'del') removeSel();
  if (a === 'dup') duplicateSel();
  if (a === 'reset') { pushUndo(); const orig = o._orig; for (const k of Object.keys(o)) if (k !== 'cid' && k !== 'note' && k !== 'note_at') delete o[k]; Object.assign(o, orig); changed(true); }
  if (a === 'audition') new Audio(sfxUrl(o.name)).play();
  if (a === 'json') {
    try {
      const v = JSON.parse($('#insp [data-f="json"]').value);
      // Only an object with the same kind of block: an array or a value used to wipe every field ({"0":…,"1":…}).
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('cần một object {…}');
      for (const k of ['t0', 't1', 't']) if (k in o && k in v && !Number.isFinite(v[k])) throw new Error(`${k} phải là số`);
      if (o.type != null && v.type == null) throw new Error('thiếu "type"');
      touch(o);
      for (const k of Object.keys(o)) if (!['cid', '_orig', 'lines', 'nodes', 'note', 'note_at'].includes(k)) delete o[k];
      Object.assign(o, v); changed(true); toast('Đã áp dụng');
    } catch (err) { toast('JSON lỗi: ' + err.message); }
  }
  if (a === 'capall') {
    pushUndo();
    for (const x of CAP) for (const k of ['font', 'size', 'color', 'weight', 'x', 'y']) { if (o[k] != null) x[k] = o[k]; else delete x[k]; }
    changed(true); toast('Đã áp dụng cho ' + CAP.length + ' phụ đề');
  }
});
const LOCK_MSG = 'Element đang khoá · ⌥⇧L để mở khoá';
function dropComp(c) {
  const o = c.obj, drop = (arr, x) => { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); };
  if (c.kind === 'scene') drop(TL.scenes, o);
  else if (c.kind === 'line') { drop(c.scene.lines, o); if (c.scene.type === 'text' && !c.scene.lines.length) drop(TL.scenes, c.scene); }
  else if (c.kind === 'node') { drop(c.scene.nodes, o); c.scene.edges = (c.scene.edges || []).filter(e => e.from !== o.id && e.to !== o.id); }
  else if (c.kind === 'badge') c.scene.badge = false;
  else if (c.kind === 'cap') drop(CAP, o);
  else if (c.kind === 'sfx') drop(TL.audio.sfx, o);
  else if (c.kind === 'music') drop(TL.audio.music, o);
  else if (c.remove) c.remove();
}
function removeSel() {
  if (!sel) return;
  const c = sel;
  if (c.kind === 'clip') {
    if (TRK.video.lock) return toast('Track video đang khoá');
    pushUndo();
    if (!deleteClip(c.idx)) { undoStack.pop(); return toast('Không thể xoá clip duy nhất'); }
    sel = null; changed(true); return toast('Đã xoá clip · phần sau tự dồn lại');
  }
  const list = [sel, ...multi]; // S20 M141: xoá cả nhóm đang chọn
  if (list.some(x => x.obj.locked)) return toast(LOCK_MSG);
  pushUndo();
  for (const x of list) dropComp(x);
  sel = null; multi = []; changed(true);
}
function duplicateSel() {
  if (!sel) return; pushUndo();
  const c = sel;
  if (c.kind === 'clip') { const cp = duplicateClip(c.idx); changed(); return select(compOf(cp)); }
  const cp = JSON.parse(JSON.stringify(c.obj, (k, v) => (k === 'cid' || k === '_orig' ? undefined : v)));
  const d = Math.min(1, c.t1 - c.t0);
  let nw = cp;
  if (c.kind === 'scene') { shiftScene(cp, d); cp.t0 += d; cp.t1 += d; TL.scenes.push(cp); }
  else if (c.kind === 'line') { const s = JSON.parse(JSON.stringify(c.scene, (k, v) => (k === 'cid' || k === '_orig' ? undefined : v))); if (c.scene.type === 'text') { s.lines = [nw = { ...cp, y: (cp.y ?? 640) + 70 }]; TL.scenes.push(s); } else { cp.y = (cp.y ?? 640) + 70; c.scene.lines.push(cp); } }
  else if (c.kind === 'node') { cp.id = (cp.id || 'n') + '_2'; if (cp.keys) cp.keys.forEach(k => (k.y += 60)); else cp.y = (cp.y ?? 600) + 60; c.scene.nodes.push(cp); }
  else if (c.kind === 'sfx') { cp.t += .5; TL.audio.sfx.push(cp); }
  else if (c.kind === 'cap') { cp.y = (cp.y ?? 790) + 60; CAP.push(cp); }
  else if (c.dup) c.dup(cp);
  else { undoStack.pop(); return; }
  changed(); const n = compOf(nw) || comps.find(x => JSON.stringify(x.obj, strip) === JSON.stringify(cp, strip)); select(n || null);
}
function splitAtPlayhead() {
  if (!TL.clips?.length) return toast('Chưa có clip');
  if (TRK.video.lock) return toast('Track video đang khoá');
  pushUndo();
  const b = splitClipAt(T);
  if (!b) { undoStack.pop(); return toast('Đặt playhead vào giữa một clip để tách'); }
  changed(); select(compOf(b)); toast('Đã tách clip');
}

// ---------- S20 M141: clipboard trong trang, khoá, thứ tự lớp, chọn tất cả ----------
// Chép giữ bản độc lập (không trỏ vào timeline); dán tại playhead giữ vị trí, dán lặp lệch 24 px (KeysCore.pasteStep).
// Clip chính: chép rồi dán = nhân bản ngay sau clip (ripple), không cắt. Chữ graphic / node dán lại vào graphic gốc.
const cloneObj = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'cid' || k === '_orig' || k === 'locked' ? undefined : v)));
function clipItems(list) {
  return list.filter(c => KeysCore.COPYABLE.has(c.kind)).map(c => {
    const solo = c.kind === 'line' && c.scene?.type === 'text' && c.scene.lines.length === 1, par = c.kind === 'line' || c.kind === 'node' ? c.scene : null;
    return { kind: c.kind, solo, t0: c.t0, t1: c.t1, obj: cloneObj(solo ? c.scene : c.obj), parent: solo ? null : par, pcid: par?.cid, ptype: par?.type };
  });
}
// Thêm bản sao vào timeline, dời thời gian dt (giây) và lệch off (px thiết kế). Trả các obj mới (đã build).
function insertItems(items, dt, off) {
  const added = [];
  for (const it of items) {
    const cp = JSON.parse(JSON.stringify(it.obj)); let obj = cp;
    if (it.solo || it.kind === 'scene') { TL.scenes.push(cp); if (it.solo) obj = cp.lines[0]; }
    else if (it.kind === 'line' || it.kind === 'node') {
      const par = TL.scenes.includes(it.parent) ? it.parent : TL.scenes.find(x => x.cid === it.pcid && x.type === it.ptype);
      if (!par) continue; // graphic gốc đã bị xoá
      if (it.kind === 'node') { let id = cp.id || 'n'; while ((par.nodes || []).some(n => n.id === id)) id += '_2'; cp.id = id; (par.nodes ||= []).push(cp); }
      else (par.lines ||= []).push(cp);
    } else if (it.kind === 'cap') { const t = it.t0 + dt, i = CAP.findIndex(x => x.t0 > t); CAP.splice(i < 0 ? CAP.length : i, 0, cp); }
    else if (it.kind === 'sfx' || it.kind === 'music') { TL.audio ||= {}; (TL.audio[it.kind] ||= []).push(cp); }
    else continue;
    added.push({ obj, it });
  }
  build();
  for (const { obj, it } of added) {
    if (dt) { const c = compOf(obj); if (c) { setTimes(c, it.t0 + dt, it.t1 + dt, true); build(); } }
    const c = off && compOf(obj), p = c && getPos(c);
    if (p) setPos(c, KeysCore.clampPos({ ...p, x: p.x + off, y: p.y + off }, DW, DH));
  }
  build();
  return added.map(a => a.obj);
}
function selectGroup(objs) {
  const cs = objs.map(compOf).filter(Boolean);
  sel = cs[0] || null; multi = sel && sel.kind !== 'clip' ? cs.slice(1) : [];
  renderList(); renderTimeline(); renderInspector(); drawOverlay();
  return cs.length;
}
function copySel(cut) {
  if (!sel) return toast('Chọn element để chép');
  if (sel.kind === 'clip') {
    if (cut) return toast('Clip chính không cắt được · ⌘C rồi ⌘V để nhân bản, Delete để xoá');
    CLIPB = { clip: sel.obj, cj: JSON.stringify(sel.obj, strip) };
    return toast('Đã chép clip · ⌘V nhân bản ngay sau clip');
  }
  const list = [sel, ...multi], items = clipItems(list);
  if (!items.length) return toast('Chưa chép được loại này · dùng ⌘D để nhân bản');
  if (cut && list.some(c => c.obj.locked)) return toast(LOCK_MSG);
  const t0 = Math.min(...items.map(i => i.t0));
  CLIPB = { items, t0, st: { srcT0: t0, cut: !!cut, lastT: null, n: 0 } };
  const skip = list.length - items.length, n = items.length > 1 ? `${items.length} element` : 'element';
  if (!cut) return toast(`Đã chép ${n}${skip ? ` (bỏ qua ${skip} không chép được)` : ''} · ⌘V dán tại playhead`);
  pushUndo(); for (const c of list.filter(c => KeysCore.COPYABLE.has(c.kind))) dropComp(c);
  sel = null; multi = []; changed(true); toast(`Đã cắt ${n} · ⌘V dán tại playhead`);
}
function pasteClip() {
  if (!CLIPB) return toast('Chưa chép gì · chọn element rồi ⌘C');
  if (CLIPB.clip) {
    if (TRK.video.lock) return toast('Track video đang khoá');
    let i = TL.clips.indexOf(CLIPB.clip); if (i < 0) i = TL.clips.findIndex(c => JSON.stringify(c, strip) === CLIPB.cj);
    if (i < 0) return toast('Clip đã chép không còn trên timeline');
    pushUndo(); const cp = duplicateClip(i); CLIPB.clip = cp; changed(); select(compOf(cp)); return toast('Đã dán clip ngay sau clip gốc');
  }
  pushUndo();
  const st = KeysCore.pasteStep(CLIPB.st, T), objs = insertItems(CLIPB.items, r2(T - CLIPB.t0), st.off);
  if (!objs.length) { undoStack.pop(); return toast('Graphic chứa chữ đã chép không còn trên timeline'); }
  CLIPB.st = st; changed(); kzone = 'stage';
  const n = selectGroup(objs); toast(n > 1 ? `Đã dán ${n} element` : 'Đã dán');
}
function toggleLock() {
  if (!sel) return toast('Chọn element để khoá');
  if (sel.kind === 'clip') return toast('Clip chính: khoá cả track video ở nhãn track');
  const list = [sel, ...multi], on = !sel.obj.locked;
  pushUndo(); for (const c of list) { if (on) c.obj.locked = true; else delete c.obj.locked; }
  changed(true); toast(on ? `Đã khoá${list.length > 1 ? ` ${list.length} element` : ''} · bấm khối trên timeline rồi ⌥⇧L để mở` : 'Đã mở khoá');
}
function layerSel(how) {
  if (!sel) return;
  if (sel.obj.locked) return toast(LOCK_MSG);
  const L = CanvasCmds.layerOf(sel, TL.scenes || []);
  if (!L) return toast('Element này không có thứ tự lớp');
  if (CanvasCmds.layerTarget(L.arr, L.item, how) < 0) return toast(how === 'up' || how === 'top' ? 'Đã ở lớp trên cùng' : 'Đã ở lớp dưới cùng');
  pushUndo(); CanvasCmds.moveLayer(L.arr, L.item, how); changed(true);
}
function selectAll() {
  const idx = KeysCore.selectAllAt(comps.map(c => ({ kind: c.kind, t0: c.t0, t1: c.t1, hidden: !!c.obj.hidden, locked: !!c.obj.locked,
    trackOff: !!(TRK[c.track]?.lock || TRK[c.track]?.hide), hasPos: !!getPos(c) })), T);
  if (!idx.length) return toast('Không có element nào đang hiện ở thời điểm này');
  kzone = 'stage'; selectGroup(idx.map(i => comps[i].obj)); toast(`Đã chọn ${idx.length} element`);
}
// ⌥ + kéo: nhân bản tại chỗ rồi kéo bản sao (một bước hoàn tác; bấm không kéo = bỏ bản sao). Trả cid nhóm cũ để chọn lại.
function dupInPlace(list) {
  const items = window.KeysCore ? clipItems(list) : []; if (!items.length) return null;
  const prev = [sel, ...multi].map(c => c.obj.cid);
  pushUndo(); const objs = insertItems(items, 0, 0);
  if (!objs.length) { undoStack.pop(); return null; }
  selectGroup(objs); return prev;
}
// Phím mới của M141 (KeysCore.actionOf). Trả true khi đã xử lý.
function runKey(act, e) {
  if (act === 'help') { if (!Studio.showKeys) return false; e.preventDefault(); Studio.showKeys(); return true; }
  if ((act === 'copy' || act === 'cut') && String(window.getSelection?.() || '')) return false; // đang bôi đen chữ trong trang: để trình duyệt chép
  e.preventDefault();
  if (act === 'copy' || act === 'cut') copySel(act === 'cut');
  else if (act === 'paste') pasteClip();
  else if (act === 'all') selectAll();
  else if (act === 'lock') toggleLock();
  else layerSel(act);
  return true;
}
function nudge(list, dx, dy) {
  pushUndo('nudge' + list.map(c => c.obj.cid).join()); for (const c of list) if (!c.obj._orig) c.obj._orig = JSON.parse(JSON.stringify(c.obj, (k, v) => (k === 'cid' || k === '_orig' ? undefined : v)));
  for (const c of list) { const p = getPos(c); if (p) setPos(c, { ...p, x: p.x + dx, y: p.y + dy }); }
  changed(); syncPosInputs(); setTimeout(refreshQc, 150);
}
// Vùng vừa bấm (C19): khung → dời, timeline / chỗ khác → tua; inspector, thanh nổi, menu giữ vùng cũ
document.addEventListener('mousedown', e => {
  const t = e.target.closest ? e.target : e.target.parentElement;
  const region = t?.closest('#overlay') ? 'stage' : t?.closest('#tl, #tlhead') ? 'timeline' : t?.closest('#insp, .cbar, .cbar-pop, .cmenu, #modal') ? 'keep' : 'other';
  kzone = window.KeysCore ? KeysCore.zoneAfter(kzone, region) : region;
}, true);

// ---------- add text / graphics ----------
// Graphic library = every pack registered in the engine (engine/packs/*.js); see library.js (Hiệu ứng).
// Chưa mở dự án thì `win` chưa có: lấy danh sách gói từ khung preview đã nạp sẵn ở trang chủ (cùng engine, S26 M181).
const packs = () => (win && win.PACKS) || document.getElementById('frame')?.contentWindow?.PACKS || [];

// ---------- stage interactions ----------
// S17 M124: kéo dời (cả nhóm Shift), tay nắm góc phóng đều, tay nắm cạnh đổi riêng rộng / cao (cảnh StageCore.canResize),
// đường gióng tới mép / giữa khung, vùng an toàn và element khác (Alt = tắt), khung cắt video chính khi đang chọn clip.
const touchAll = list => { pushUndo(); for (const c of list) if (!c.obj._orig) c.obj._orig = JSON.parse(JSON.stringify(c.obj, (k, v) => (k === 'cid' || k === '_orig' ? undefined : v))); };
function otherRects(skip) {
  return comps.filter(c => c.kind !== 'clip' && c.kind !== 'sfx' && c.kind !== 'music' && !skip.includes(c) && T >= c.t0 && T < c.t1 && !c.obj.hidden)
    .slice(0, 60).map(c => rectOf(c.obj)).filter(r => r && r.w > 2 && r.h > 2 && r.w < DW * .98);
}
function stageLines(skip) { return StageCore.guideLines({ DW, DH, safe: $('#safe').checked ? SAFE : null, rects: otherRects(skip) }); }
function toggleMulti(c) {
  if (c === sel) return;
  const i = multi.indexOf(c); if (i >= 0) multi.splice(i, 1); else multi.push(c);
  renderInspector(); drawOverlay();
}
function alignSel(how) {
  if (how === 'none') { multi = []; renderInspector(); return drawOverlay(); }
  const list = [sel, ...multi].filter(c => c && getPos(c)), rs = list.map(c => rectOf(c.obj));
  if (list.length < 2) return;
  touchAll(list);
  StageCore.alignDeltas(rs, how).forEach(({ dx, dy }, i) => { if (!dx && !dy) return; const p = getPos(list[i]); p.x += dx; p.y += dy; setPos(list[i], p); });
  changed(); syncPosInputs(); setTimeout(refreshQc, 150);
}
function cropAr(o) {
  const im = win && [...win.document.querySelectorAll('#stage img')].find(i => i.naturalWidth && i.offsetWidth >= DW * .9);
  return im ? im.naturalWidth / im.naturalHeight : o.ar || 16 / 9;
}
$('#overlay').addEventListener('mousedown', e => {
  const box = $('#stagebox').getBoundingClientRect();
  const px = (e.clientX - box.left) / K, py = (e.clientY - box.top) / K;
  const handle = e.target.closest('.selbox i')?.dataset.h || null, onCrop = e.target.closest('.selbox.crop');
  let cyc = e.detail < 2 && !handle && !onCrop && !e.shiftKey && !multi.length && !!sel && sel.kind !== 'clip' && !sel.obj.locked && !!e.target.closest('.selbox'); // S20 M142: bấm lại element đang chọn
  if (!handle && (!e.target.closest('.selbox') || onCrop || e.shiftKey || sel?.obj.locked)) { // S20 M141: element khoá bấm xuyên qua
    const c = pick(px, py);
    if (e.shiftKey && c && sel && sel.kind !== 'clip' && c.kind !== 'clip') { toggleMulti(c); e.preventDefault(); return; }
    if (c) { if (c === sel && !multi.length && e.detail < 2) cyc = true; else if (c !== sel && !multi.includes(c)) { select(c); revealOnTimeline(c); } }
    else if (!onCrop && window.Layers) { // S20 M142: kéo trên khoảng trống = quét chọn; Shift cộng thêm
      if (sel && !e.shiftKey) select(null);
      marq = { x0: px, y0: py, base: e.shiftKey && sel?.kind !== 'clip' ? [sel, ...multi] : [] };
      drag = { marq: true, sx: e.clientX, sy: e.clientY, moved: false };
      e.preventDefault(); return;
    } else if (!onCrop) { if (sel) select(null); }
  }
  if (!sel || sel.obj.locked) return; // S20 M141: element khoá chỉ chọn, không kéo / đổi cỡ / xoay
  if (sel.kind === 'clip') {
    if (TRK.video.lock || (!onCrop && !handle)) return;
    const o = sel.obj;
    drag = { crop: true, sx: e.clientX, sy: e.clientY, handle, z0: o.zoom || 1, ox0: o.ox ?? 50, oy0: o.oy ?? 45, ar: cropAr(o), moved: false };
    e.preventDefault(); return;
  }
  if (handle === 'rot') { // S20 M139: tay nắm xoay quanh tâm hộp đang thấy
    const r = rectOf(sel.obj); if (!r) return;
    drag = { rot: true, sx: e.clientX, sy: e.clientY, c: { x: r.x + r.w / 2, y: r.y + r.h / 2 }, p0: { x: px, y: py }, rot0: sel.obj.rot || 0, moved: false };
    e.preventDefault(); return;
  }
  let dup = null;
  if (e.altKey && !handle) { dup = dupInPlace([sel, ...multi].filter(c => !c.obj.locked)); if (dup) revealOnTimeline(sel); } // S20 M141: ⌥ + kéo = nhân bản
  const group = [sel, ...multi].filter(c => !c.obj.locked).map(c => ({ c, p0: getPos(c) })).filter(g => g.p0);
  if (!group.length) return;
  const r = rectOf(sel.obj), edge = handle && /^[nsew]$/.test(handle) ? handle : null;
  drag = { sx: e.clientX, sy: e.clientY, group, handle: edge ? null : handle, edge, b0: edge ? StageCore.boxOf(sel.obj, DW > DH) : null,
    r0: StageCore.union(group.map(g => rectOf(g.c.obj))), lines: stageLines(group.map(g => g.c)),
    cx: r ? r.x + r.w / 2 : group[0].p0.x, cy: r ? r.y + r.h / 2 : group[0].p0.y, moved: false, cyc: cyc && !handle && !dup ? { px, py } : null, dup };
  e.preventDefault();
});
function cropMove(e, dx, dy) {
  const o = sel.obj;
  if (!drag.moved) {
    pushUndo('crop' + Date.now()); drag.moved = true;
    // đè bám mặt từ chỗ khung đang đứng, không nhảy
    if (!o.crop_manual && o.reframe?.length && !o.reframe_off && win?.reframeAt) {
      const k = clipLayout()[sel.idx], f = win.reframeAt(o.reframe, srcAt(k, T));
      if (f) { drag.ox0 = Math.round(f.ox * 10) / 10; drag.oy0 = Math.round(f.oy * 10) / 10; }
    }
    o.crop_manual = true; if (!o.fit) o.fit = 'cover';
  }
  if (drag.handle) {
    const box = $('#stagebox').getBoundingClientRect(), cx = DW / 2, cy = DH / 2;
    const d = (x, y) => Math.hypot((x - box.left) / K - cx, (y - box.top) / K - cy);
    o.zoom = StageCore.zoomCrop(drag.z0, d(e.clientX, e.clientY) / Math.max(4, d(drag.sx, drag.sy)));
    o.ox = drag.ox0; o.oy = drag.oy0;
  } else Object.assign(o, StageCore.panCrop({ ox: drag.ox0, oy: drag.oy0, zoom: o.zoom || 1 }, dx, dy, { ar: drag.ar, boxAr: DW / DH, DW, DH }));
  if (o.zoom === 1) delete o.zoom;
  needInit = true; draw(); drawOverlay();
}
window.addEventListener('mousemove', e => {
  if (!drag) return;
  const dx = (e.clientX - drag.sx) / K, dy = (e.clientY - drag.sy) / K;
  if (!drag.moved && Math.hypot(dx, dy) < 2) return;
  if (drag.marq) { drag.moved = true; const box = $('#stagebox').getBoundingClientRect(); marqUpdate((e.clientX - box.left) / K, (e.clientY - box.top) / K); return drawOverlay(); }
  if (drag.crop) return cropMove(e, dx, dy);
  if (drag.rot) return rotMove(e);
  if (!drag.moved) { if (!drag.dup) touchAll(drag.group.map(g => g.c)); drag.moved = true; }
  const thr = 6 / K, snap = drag.dup ? true : !e.altKey; // ⌥ đang giữ để nhân bản: vẫn gióng
  guides = null;
  if (drag.edge) {
    const u = sel.obj.rot ? StageCore.unrotate(dx, dy, sel.obj.rot) : { dx, dy }; // S23 M160 (PR 174): cạnh theo trục của element đã xoay
    let b = StageCore.resizeEdge(drag.b0, drag.edge, u.dx, u.dy, { sym: StageCore.geoOf(sel.obj.type) === 'wh' });
    if (snap) { const s = StageCore.snapEdge(b, drag.edge, drag.lines, thr); b = s.r; guides = s; }
    StageCore.setBox(sel.obj, b, DW > DH);
  } else if (drag.handle) {
    const box = $('#stagebox').getBoundingClientRect(), g = drag.group[0];
    const mx = (e.clientX - box.left) / K, my = (e.clientY - box.top) / K, ox = (drag.sx - box.left) / K, oy = (drag.sy - box.top) / K;
    const f = Math.max(.15, Math.hypot(mx - drag.cx, my - drag.cy) / Math.max(4, Math.hypot(ox - drag.cx, oy - drag.cy)));
    setPos(g.c, { ...g.p0, size: g.p0.size * f });
  } else {
    let mx = dx, my = dy;
    if (snap && drag.r0) { const s = StageCore.snapMove({ ...drag.r0, x: drag.r0.x + dx, y: drag.r0.y + dy }, drag.lines, thr); mx += s.dx; my += s.dy; guides = s; }
    for (const g of drag.group) setPos(g.c, { ...g.p0, x: g.p0.x + mx, y: g.p0.y + my });
  }
  needInit = true; build(); draw(); syncPosInputs();
});
window.addEventListener('mouseup', () => {
  const d = drag; drag = null; guides = null;
  if (d?.dup && !d.moved) { restore(undoStack.pop()); sel = compByCid(d.dup[0]) || null; multi = d.dup.slice(1).map(compByCid).filter(Boolean); renderList(); renderTimeline(); renderInspector(); drawOverlay(); return; } // ⌥ bấm không kéo: bỏ bản sao
  if (d?.marq) { marq = null; renderList(); renderTimeline(); renderInspector(); drawOverlay(); return; }
  if (d && !d.moved && d.cyc) { // S20 M142: bấm (không kéo) lại đúng element đang chọn → lớp kế tiếp bên dưới tại điểm đó
    const nx = Layers.nextBelow(pickAll(d.cyc.px, d.cyc.py), sel);
    if (nx && nx !== sel) { select(nx); revealOnTimeline(nx); }
    return;
  }
  if (!d?.moved) return;
  if (d.crop) { changed(true); return; }
  changed();
  // QC nhanh chạy lại trên vị trí mới (sau khi preview vẽ xong khung)
  setTimeout(() => {
    refreshQc();
    const bad = [sel, ...multi].flatMap(c => qcOf(c) || []);
    if (bad.length) toast(bad[0].msg + (bad.length > 1 ? ` (+${bad.length - 1})` : ''));
  }, 180);
});
function rotMove(e) {
  const o = sel.obj, box = $('#stagebox').getBoundingClientRect();
  if (!drag.moved) { touch(o, 'rot'); drag.moved = true; }
  const d = StageCore.rotFromDrag(drag.c, drag.p0, { x: (e.clientX - box.left) / K, y: (e.clientY - box.top) / K }, drag.rot0, { step: e.shiftKey ? 15 : 0 });
  if (d) o.rot = d; else delete o.rot;
  needInit = true; build(); draw(); syncPosInputs();
}
// S20 M139: rê chuột trên preview → viền mảnh quanh element dưới chuột (một lần mỗi khung hình)
let hoverRaf = 0;
$('#overlay').addEventListener('mousemove', e => {
  if (drag || e.buttons || playing || inEdit || hoverRaf) return;
  const { clientX: x, clientY: y } = e;
  hoverRaf = requestAnimationFrame(() => {
    hoverRaf = 0;
    const box = $('#stagebox').getBoundingClientRect(), c = pick((x - box.left) / K, (y - box.top) / K);
    if (c !== hoverC) { hoverC = c; drawOverlay(); }
  });
});
$('#overlay').addEventListener('mouseleave', () => { if (hoverC) { hoverC = null; drawOverlay(); } });
// Chọn trên preview: cuộn timeline tới khối của element (nếu đang khuất) và nháy khối một lần.
function revealOnTimeline(c) {
  const sc = $('#tlscroll'), b = c && (c.kind === 'clip' ? $(`#tlinner .clip[data-ci="${c.idx}"]`) : $(`#tlinner .blk[data-cid="${c.obj.cid}"]`));
  if (!sc || !b) return;
  const v = sc.getBoundingClientRect(), r = b.getBoundingClientRect();
  const { dx, dy } = StageCore.revealDelta({ l: v.left, r: v.right, t: v.top + RULER_H, b: v.bottom }, { l: r.left, r: r.right, t: r.top, b: r.bottom });
  if (dx) sc.scrollLeft += dx; if (dy) sc.scrollTop += dy;
  b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
  setTimeout(() => b.classList.remove('flash'), 900);
}
// S20 M139: bấm đúp chữ trên preview → gõ ngay tại chỗ (ô gõ đè đúng hộp, cùng font / cỡ / màu). Enter hoặc bấm ra ngoài = xong,
// Esc = huỷ; một bước hoàn tác. Phụ đề và element khác: đưa con trỏ vào ô chữ của inspector như trước.
$('#overlay').addEventListener('dblclick', e => {
  const box = $('#stagebox').getBoundingClientRect(), c = pick((e.clientX - box.left) / K, (e.clientY - box.top) / K) || sel;
  if (c && StageCore.canEditText(c.kind, c.obj) && !TRK[c.track]?.lock && !c.obj.locked) { if (c !== sel) select(c); return startInlineEdit(c); }
  const i = $('#insp [data-f="text"], #insp [data-f="captext"]'); if (i) { i.focus(); i.select?.(); }
});
async function startInlineEdit(c) {
  if (inEdit) finishInlineEdit(true);
  if (playing) stop();
  // hoạt ảnh vào (pop, slide, fly…) đang chạy thì hộp đo lệch: đứng sau lúc vào xong
  if (T < c.t0 + .45 && c.t1 - c.t0 > .5) { setTime(Math.min(c.t0 + .45, c.t1 - .05)); await new Promise(r => setTimeout(r, 160)); }
  const el = elFor(c.obj); if (!el) return toast('Chữ chưa hiện ở thời điểm này');
  const rot = el.style.rotate; el.style.rotate = ''; // đo hộp chưa xoay; ô gõ xoay cùng góc
  const r = rectOf(c.obj), cs = win.getComputedStyle(el), st = StageCore.editStyle(cs, K);
  el.style.rotate = rot;
  if (!r) return;
  const ta = document.createElement('textarea');
  ta.id = 'inedit'; ta.rows = 1; ta.spellcheck = false; ta.value = c.obj.text || ''; ta.setAttribute('aria-label', 'Sửa chữ');
  Object.assign(ta.style, st, { textAlign: cs.textAlign === 'start' ? 'center' : cs.textAlign });
  if (c.obj.rot) ta.style.rotate = `${c.obj.rot}deg`;
  inEdit = { c, ta, orig: ta.value, cx: (r.x + r.w / 2) * K, cy: (r.y + r.h / 2) * K, minW: r.w * K, h: r.h * K };
  $('#stagebox').appendChild(ta);
  const fitBox = () => { // giãn theo chữ, giữ tâm hộp
    ta.style.width = '0px'; const w = Math.max(inEdit.minW, ta.scrollWidth + 8 * K); ta.style.width = w + 'px';
    const h = Math.max(inEdit.h, (parseFloat(ta.style.lineHeight) || 0) + 4); ta.style.height = h + 'px'; // một dòng (Enter = xong)
    ta.style.left = (inEdit.cx - w / 2) + 'px'; ta.style.top = (inEdit.cy - h / 2) + 'px';
  };
  fitBox();
  el.style.visibility = 'hidden'; hoverC = null; drawOverlay();
  ta.addEventListener('input', () => { if (ta.value.includes('\n')) { ta.value = ta.value.replace(/\n/g, ''); return finishInlineEdit(); } fitBox(); });
  ta.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finishInlineEdit(true); }
    else if (ev.key === 'Enter') { ev.preventDefault(); finishInlineEdit(); }
  });
  ta.addEventListener('blur', () => finishInlineEdit());
  ta.focus(); ta.select();
}
function finishInlineEdit(cancel = false) {
  const ed = inEdit; if (!ed) return; inEdit = null;
  const v = ed.ta.value.trim(); ed.ta.remove();
  const el = elFor(ed.c.obj); if (el) el.style.visibility = '';
  if (!cancel && v && v !== ed.orig) {
    touch(ed.c.obj, 'text'); ed.c.obj.text = v; changed(true); // inspector, nhãn khối timeline, danh sách cùng đổi
    toast('Đã sửa chữ · ⌘Z để hoàn tác');
  } else { if (!cancel && !v) toast('Chữ trống: giữ nội dung cũ'); drawOverlay(); }
}

// ---------- timeline ----------
let PPS = 60, lastTrackSig = '';
const RULER_H = 28, VIDEO_H = 64, WAVE_H = 40;
const lanes = list => { const ends = []; for (const c of list) { let l = ends.findIndex(e => e <= c.t0 + .001); if (l < 0) { l = ends.length; ends.push(0); } ends[l] = c.t1; c.lane = l; } return Math.max(1, ends.length); };
function rulerStep() { for (const s of [.25, .5, 1, 2, 5, 10, 15, 30, 60, 120]) if (s * PPS >= 64) return s; return 300; }
function clipStrip(k, w) {
  const tw = Math.max(18, Math.round((VIDEO_H - 2) * DW / DH)), n = Math.min(400, Math.ceil(w / tw)), f = clipFilterCss(k.c);
  let h = '';
  const fx = esc(f);
  for (let j = 0; j < n; j++) h += `<i data-dw="${tw}" data-dbg="${esc(clipFrameUrl(k.c, srcAt(k, k.t0 + (j + .5) * tw / PPS)))}" data-dfx="${fx}"></i>`;
  return h;
}
function renderTimeline() {
  if (!TL) return;
  const dur = TL.duration, W = dur * PPS + 240;
  $('#tlinner').style.width = W + 'px';
  const step = rulerStep(), minor = step / 4;
  let rh = '';
  for (let s = 0; s <= dur + step; s += minor) {
    const major = Math.abs(s / step - Math.round(s / step)) < 1e-6;
    rh += `<i class="${major ? 'mj' : ''}" data-dl="${s * PPS}"></i>`;
    if (major) rh += `<span data-dl="${s * PPS}">${step < 1 ? fmt(s).replace(/0$/, '') : fmt(s).replace(/\.\d+$/, '')}</span>`;
  }
  rh += `<div class="endmark" data-dl="${dur * PPS}"></div>`;
  $('#ruler').innerHTML = rh; applyDyn($('#ruler'));
  let th = '', lh = '';
  const label = (key, name, ic, h, tools = true) => `<div class="lrow ${key === 'video' ? 'main' : ''}" data-lk="${key}" data-dh="${h}"><i class="ti ${ic}"></i><span>${name}</span>
    ${tools ? `<button class="lt ${TRK[key].hide ? 'on' : ''}" data-thide="${key}" title="Ẩn trên preview"><i class="ti ${TRK[key].hide ? 'ti-eye-off' : 'ti-eye'}"></i></button><button class="lt ${TRK[key].lock ? 'on' : ''}" data-tlock="${key}" title="Khoá track"><i class="ti ${TRK[key].lock ? 'ti-lock' : 'ti-lock-open'}"></i></button>` : ''}</div>`;
  for (const [key, name, ic] of TRACKS) {
    const lk = TRK[key]?.lock ? ' locked' : '', hd = TRK[key]?.hide ? ' hid' : '';
    if (key === 'wave') { th += `<div class="track wave" data-dh="${WAVE_H}"><canvas class="wave" id="wave" width="${Math.min(32000, Math.ceil(W))}" height="${WAVE_H}"></canvas></div>`; lh += label(key, name, ic, WAVE_H, false); continue; }
    if (key === 'video') {
      const L = clipLayout();
      th += `<div class="track video${lk}${hd}" data-track="video" data-dh="${VIDEO_H + 8}">` + L.map(k => {
        const w = Math.max(6, (k.t1 - k.t0) * PPS - 1), c = k.c, on = sel?.obj === c;
        return `<div class="clip ${on ? 'sel' : ''}" data-ci="${k.i}" data-dl="${k.t0 * PPS}" data-dw="${w}">
          <div class="strip">${clipStrip(k, w)}</div>
          <div class="ctop"><span class="cn">${k.i + 1}</span>${SpeedMap.label(c) ? `<span class="cb"><i class="ti ${c.hold != null ? 'ti-snowflake' : c.reverse ? 'ti-arrow-back-up' : 'ti-brand-speedtest'}"></i>${esc(SpeedMap.label(c))}</span>` : ''}${c.mute ? '<span class="cb"><i class="ti ti-volume-off"></i></span>' : ''}${c.filter ? '<span class="cb"><i class="ti ti-color-filter"></i></span>' : ''}${c.flip ? '<span class="cb"><i class="ti ti-flip-vertical"></i></span>' : ''}<span class="cd">${r2(k.t1 - k.t0)}s</span></div>
          <span class="h l"></span><span class="h r"></span></div>`;
      }).join('') + L.slice(1).map(k => `<button class="tb ${k.c.transition ? 'on' : ''}" data-tbi="${k.i}" data-dl="${k.t0 * PPS}" title="${k.c.transition ? 'Chuyển cảnh: ' + (TRANS_TYPES.find(x => x[0] === k.c.transition.type)?.[1] || k.c.transition.type) : 'Thêm chuyển cảnh'}"><i class="ti ${k.c.transition ? 'ti-transition-right' : 'ti-plus'}"></i></button>`).join('') + '</div>';
      lh += label(key, name, ic, VIDEO_H + 8);
      continue;
    }
    const list = comps.filter(c => c.track === key).sort((a, b) => a.t0 - b.t0);
    if (!list.length && !['cap', 'audio'].includes(key) && !key.startsWith('xa:') && !TRK[key].lock && !TRK[key].hide) continue; // empty optional tracks stay out of the way
    const n = lanes(list), h = Math.max(28, n * 24 + 5);
    th += `<div class="track${lk}${hd}" data-track="${key}" data-dh="${h}">` + list.map(c => `<div class="blk ${sel?.obj === c.obj ? 'sel' : ''} ${c.obj.hidden ? 'off' : ''} ${c.obj.locked ? 'lockd' : ''} k-${c.kind}" data-cid="${c.obj.cid}"
      data-dl="${c.t0 * PPS}" data-dw="${Math.max(8, (c.t1 - c.t0) * PPS - 2)}" data-dt="${3 + c.lane * 24}" data-dbc="${TCOL[key]}" title="${esc(c.label)} · ${fmt(c.t0)}–${fmt(c.t1)}${esc(Studio._tip.map(f => f(c) || '').join(''))}">
      <span class="h l"></span>${c.obj.locked ? '<i class="ti ti-lock lk" title="Đã khoá"></i>' : ''}${c.obj.note ? '<span class="note"></span>' : ''}${c.kind === 'sfx' ? '<i class="ti ti-bell"></i>' : c.kind === 'music' ? '<i class="ti ti-music"></i>' : c.icon ? `<i class="ti ${c.icon}"></i>` : ''}${esc(c.label)}${Studio._blk.map(f => f(c, PPS)).join('')}<span class="h r"></span></div>`).join('') + '</div>';
    lh += label(key, name, ic, h);
  }
  $('#tracks').innerHTML = th; $('#tllabels').innerHTML = `<div class="lhead" data-dh="${RULER_H}"></div><div class="lrows" id="lrows">${lh}</div>`;
  applyDyn($('#tracks')); applyDyn($('#tllabels')); // before measuring track offsets below
  // When the set of tracks changes, keep the main video track (and voice) in view.
  const sig = [...document.querySelectorAll('#tracks .track')].map(t => t.dataset.track || 'w').join();
  if (sig !== lastTrackSig) {
    lastTrackSig = sig;
    const sc = $('#tlscroll'), tv = $('.track.video');
    if (tv) { const want = tv.offsetTop + tv.offsetHeight + WAVE_H + 40 - sc.clientHeight; if (want > sc.scrollTop) sc.scrollTop = want; }
  }
  $('#lrows').scrollTop = $('#tlscroll').scrollTop;
  drawWave(); placeHead();
  const n = comps.filter(c => c.track && c.track !== 'audio' && c.kind !== 'clip').length;
  $('#tlinfo').textContent = `${(TL.clips || []).length} clip · ${n} thành phần · ${fmt(dur)}`;
}
function drawWave() {
  const cv = $('#wave'); if (!cv || !WAVE.length) return;
  const g = cv.getContext('2d'), H = cv.height, mid = H / 2;
  const src = TL.audio?.voice || META.audio;
  const cs = getComputedStyle(document.body), ch = n => cs.getPropertyValue(n).trim();
  const col = `rgb(${ch('--color-audio')})`, mutedCol = `rgb(${ch('--color-fg-subtle')} / .35)`; // canvas: read the tokens
  if (!TL.clips?.length) { g.fillStyle = col; for (let x = 0; x < cv.width; x += 3) { const v = WAVE[Math.floor(x / PPS * 50)] || 0, h = Math.max(1, v * (H - 6)); g.fillRect(x, mid - h / 2, 2, h); } return; }
  for (const k of clipLayout()) {
    if (k.c.audio !== src) continue;
    g.fillStyle = k.c.mute ? mutedCol : col;
    const vol = k.c.mute ? .6 : clamp(k.c.volume ?? 1, .2, 1.6);
    for (let x = Math.ceil(k.t0 * PPS); x < k.t1 * PPS && x < cv.width; x += 3) {
      const v = WAVE[Math.floor(srcAt(k, x / PPS) * 50)] || 0, h = Math.max(1, Math.min(H - 4, v * (H - 6) * vol));
      g.fillRect(x, mid - h / 2, 2, h);
    }
  }
}
function placeHead() { $('#playhead').style.left = T * PPS + 'px'; }
function setZoom(v) { PPS = clamp(v, 8, 300); $('#zoom').value = PPS; renderTimeline(); autoScroll(); }
$('#zoom').addEventListener('input', e => setZoom(+e.target.value));
$('#zin').addEventListener('click', () => setZoom(PPS * 1.3));
$('#zout').addEventListener('click', () => setZoom(PPS / 1.3));
// S23 M161: timeline đang ẩn (mức dải tua) thì bề rộng = 0 → không đặt PPS nhỏ nhất; 76_layout.js gọi lại khi timeline hiện
let ZFIT = false;
function zoomFit() { const w = $('#tlscroll').clientWidth; if (!w) { ZFIT = true; return; } ZFIT = false; setZoom((w - 60) / Math.max(1, TL.duration)); $('#tlscroll').scrollLeft = 0; }
$('#zfit').addEventListener('click', zoomFit);
$('#tsnap').addEventListener('click', () => { SNAP = !SNAP; $('#tsnap').classList.toggle('on', SNAP); toast(SNAP ? 'Bật nam châm' : 'Tắt nam châm'); });
$('#tsplit').addEventListener('click', splitAtPlayhead);
$('#tdel').addEventListener('click', removeSel);
$('#tdup').addEventListener('click', duplicateSel);
$('#tlscroll').addEventListener('scroll', () => { const l = $('#lrows'); if (l) l.scrollTop = $('#tlscroll').scrollTop; });
$('#tlscroll').addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(PPS * (e.deltaY < 0 ? 1.12 : 1 / 1.12)); } }, { passive: false });
$('#tllabels').addEventListener('click', e => {
  const h = e.target.closest('[data-thide]'), l = e.target.closest('[data-tlock]');
  if (h) { const k = h.dataset.thide; TRK[k].hide = !TRK[k].hide; needInit = true; draw(); renderTimeline(); }
  if (l) { const k = l.dataset.tlock; TRK[k].lock = !TRK[k].lock; if (TRK[k].lock && sel?.track === k) select(null); renderTimeline(); }
});
function seekFromX(clientX) { const r = $('#tlinner').getBoundingClientRect(); setTime(clamp((clientX - r.left) / PPS, 0, TL.duration - 1 / FPS)); }
function snap(t, self) {
  if (!SNAP) return t;
  const cands = [T, 0, ...clipLayout().flatMap(k => [k.t0, k.t1]), ...comps.filter(c => c.obj !== self && c.track && c.kind !== 'clip').flatMap(c => [c.t0, c.t1])];
  for (const x of cands) if (Math.abs(x - t) * PPS < 7) return x;
  return t;
}
let tdrag = null;
$('#tlinner').addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  if (e.target.closest('.tb')) return;
  const cl = e.target.closest('.clip');
  if (cl) {
    const i = +cl.dataset.ci, c = TL.clips[i];
    if (TRK.video.lock) return;
    if (sel?.obj !== c) select(compOf(c));
    const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
    const k = clipLayout()[i];
    tdrag = { clip: true, i, mode, sx: e.clientX, moved: false, base: snapshot(), k };
    e.preventDefault(); return;
  }
  const b = e.target.closest('.blk');
  if (!b || b.closest('.locked')) { seekFromX(e.clientX); tdrag = { scrub: true }; return; }
  const c = compByCid(b.dataset.cid); if (!c) return;
  if (sel?.obj !== c.obj) select(c);
  if (c.obj.locked) { e.preventDefault(); return; } // S20 M141: khối khoá chỉ chọn (để mở khoá), không dời / kéo mép
  const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
  tdrag = { c, mode, sx: e.clientX, t0: c.t0, t1: c.t1, moved: false };
  e.preventDefault();
});
$('#ruler').addEventListener('mousedown', e => { seekFromX(e.clientX); tdrag = { scrub: true }; e.stopPropagation(); });
function clipDragMove(e) {
  const d = (e.clientX - tdrag.sx) / PPS;
  if (!tdrag.moved && Math.abs(e.clientX - tdrag.sx) < 3) return;
  if (!tdrag.moved) { pushUndo(); tdrag.moved = true; }
  const { i, mode, k } = tdrag;
  if (mode === 'move') {
    // reorder: show a drop marker at the nearest boundary
    const L = clipLayout(), x = (e.clientX - $('#tlinner').getBoundingClientRect().left) / PPS;
    let j = L.length; for (const q of L) if (x < (q.t0 + q.t1) / 2) { j = q.i; break; }
    tdrag.target = j;
    const at = j < L.length ? L[j].t0 : L[L.length - 1].t1;
    let m = $('#dropmark'); if (!m) { m = document.createElement('div'); m.id = 'dropmark'; $('#tracks').appendChild(m); }
    const tv = $('.track.video'); m.style.left = at * PPS - 2 + 'px'; m.style.top = tv.offsetTop + 'px'; m.style.height = tv.offsetHeight + 'px';
    const g = document.querySelector(`.clip[data-ci="${i}"]`); if (g) { g.classList.add('dragging'); g.style.transform = `translateX(${e.clientX - tdrag.sx}px)`; }
    return;
  }
  // ripple trim from the drag-start state
  const o = JSON.parse(tdrag.base); TL = o.TL; CAP = o.CAP;
  const edgeT = mode === 'r' ? k.t1 : k.t0;
  let target = edgeT + d;
  if (SNAP) { for (const x of [T, ...clipLayout().filter(q => q.i !== i).flatMap(q => [q.t0, q.t1])]) if (Math.abs(x - target) * PPS < 7) { target = x; break; } }
  trimClip(i, mode, target - edgeT);
  build(); sel = compOf(TL.clips[i]); renderTimeline(); needInit = true; draw();
}
window.addEventListener('mousemove', e => {
  if (!tdrag) return;
  if (tdrag.scrub) return seekFromX(e.clientX);
  if (tdrag.clip) return clipDragMove(e);
  const d = (e.clientX - tdrag.sx) / PPS;
  if (!tdrag.moved && Math.abs(e.clientX - tdrag.sx) < 3) return;
  if (!tdrag.moved) { pushUndo(); touch(tdrag.c.obj); tdrag.moved = true; }
  const { c, mode, t0, t1 } = tdrag;
  const cur = compOf(c.obj) || c;
  if (mode === 'move') { let n0 = snap(t0 + d, c.obj); if (n0 === t0 + d) n0 = snap(t1 + d, c.obj) - (t1 - t0); setTimes(cur, n0, n0 + (t1 - t0), true); }
  if (mode === 'l') setTimes(cur, Math.min(snap(t0 + d, c.obj), t1 - .05), t1, false);
  if (mode === 'r') setTimes(cur, t0, Math.max(snap(t1 + d, c.obj), t0 + .05), false);
  build(); sel = compOf(c.obj); tdrag.c = sel; renderTimeline(); needInit = true; draw();
});
window.addEventListener('mouseup', () => {
  if (tdrag?.clip && tdrag.moved) {
    $('#dropmark')?.remove();
    if (tdrag.mode === 'move') {
      const { i, target: j } = tdrag;
      if (j != null && j !== i && j !== i + 1) { const c = TL.clips[i]; moveClip(i, j); changed(true); select(compOf(c)); toast('Đã đổi thứ tự clip'); }
      else { undoStack.pop(); renderTimeline(); }
    } else changed(true);
  } else if (tdrag?.moved) changed(true);
  tdrag = null;
});
$('#tlinner').addEventListener('dblclick', e => { const b = e.target.closest('.blk,.clip'); if (b) { const c = b.dataset.ci != null ? compOf(TL.clips[+b.dataset.ci]) : compByCid(b.dataset.cid); if (c) setTime(c.t0); } });
$('#tlinner').addEventListener('click', e => {
  const tb = e.target.closest('.tb'); if (!tb) return;
  const i = +tb.dataset.tbi; select(compOf(TL.clips[i])); openSect('trans');
});
// Transitions dragged from the library onto a clip boundary.
function nearestBoundary(clientX) {
  const x = (clientX - $('#tlinner').getBoundingClientRect().left) / PPS, L = clipLayout();
  let best = null; for (const k of L.slice(1)) if (!best || Math.abs(k.t0 - x) < Math.abs(best.t0 - x)) best = k;
  return best;
}
$('#tlinner').addEventListener('dragover', e => {
  if (![...e.dataTransfer.types].includes('text/x-trans')) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  const k = nearestBoundary(e.clientX);
  for (const b of document.querySelectorAll('.tb')) b.classList.toggle('hot', !!k && +b.dataset.tbi === k.i);
});
$('#tlinner').addEventListener('drop', e => {
  const ty = e.dataTransfer.getData('text/x-trans'); if (ty == null || ![...e.dataTransfer.types].includes('text/x-trans')) return;
  e.preventDefault(); e.stopPropagation();
  const k = nearestBoundary(e.clientX); if (!k) return toast('Cần ít nhất 2 clip để có chuyển cảnh');
  setTransition(k.i, ty, transDur); select(compOf(TL.clips[k.i])); toast('Đã thêm chuyển cảnh');
});
// resizable timeline height
(() => {
  let rs = null;
  // S23 M161: kéo tự do (từ dải tua 40 px), thả thì Studio.layout bắt về mức gần nhất (dải tua / gọn / đầy đủ) và nhớ theo chế độ
  $('#tlwrap').addEventListener('mousedown', e => { const r = $('#tlwrap').getBoundingClientRect(); if (e.clientY - r.top < 6) { rs = { y: e.clientY, h: r.height, last: r.height }; Studio.layout?.dragStart(); e.preventDefault(); } });
  window.addEventListener('mousemove', e => {
    if (!rs) return;
    const h = rs.h - (e.clientY - rs.y);
    if (Studio.layout) rs.last = Studio.layout.drag(h); else { rs.last = clamp(h, 180, innerHeight - 320); document.documentElement.style.setProperty('--tlh', rs.last + 'px'); }
    fit();
  });
  window.addEventListener('mouseup', () => { if (rs) Studio.layout?.dragEnd(rs.last); rs = null; });
})();

// ---------- playback ----------
const voice = $('#voice');
// A timer, not rAF: rAF stalls when the window is hidden, and draw() is already throttled by `busy`.
const nextFrame = f => setTimeout(f, 16);
const sfxUrl = name => { const f = LIB.sfx.find(x => x.replace(/\.\w+$/, '') === name); return f ? '/assets/sfx/' + f : ''; };
const dbVol = g => clamp(Math.pow(10, (g ?? -12) / 20) * 2.2, 0, 1);
let musicEls = [], lastT = 0, clock0 = 0, curClip = -1;
const clipAud = new Map();
// Preview from the AAC copy the server extracts (browsers play iPhone .mov audio silently); export keeps the original.
const previewSrc = src => (typeof MEDIA !== 'undefined' && MEDIA.find(m => m.path === src)?.preview_audio) || src;
const audFor = src => { const p = previewSrc(src); if (!clipAud.has(p)) clipAud.set(p, Object.assign(new Audio(PB() + p), { preload: 'auto' })); return clipAud.get(p); };
// Main-track audio follows the clips: right source time, speed (pitch kept), volume, mute.
function syncClipAudio(force) {
  let want = null;
  const k = playing && TL.clips?.length ? clipAtT(T) : null;
  const rate = k ? SpeedMap.speedAt(k.c, T - k.t0) : 0; // S29 M207: đứng hình / ngược / nhanh hơn 4× = im lặng (như bản xuất)
  if (k && k.c.audio && !k.c.mute && !k.c.reverse && rate > 0 && rate <= 4 && T < k.t1 - .02) {
    want = audFor(k.c.audio);
    const st = srcAt(k, T);
    want.playbackRate = clamp(rate, .25, 4); want.volume = clamp(k.c.volume ?? 1, 0, 1);
    if (want.paused || force || curClip !== k.i || Math.abs(want.currentTime - st) > .25) { want.currentTime = st; want.play().catch(() => {}); }
  }
  curClip = k ? k.i : -1;
  for (const a of clipAud.values()) if (a !== want && !a.paused) a.pause();
}
const useClipAudio = () => !!TL.clips?.length;
function setTime(t) {
  T = clamp(t, 0, TL.duration);
  if (playing) { if (!useClipAudio() && META.audio) voice.currentTime = T; clock0 = performance.now() / 1000 - T; for (const m of musicEls) m.el.pause(); syncClipAudio(true); }
  $('#time').textContent = fmt(T); placeHead(); draw();
  renderList();
  autoScroll();
}
function autoScroll() {
  const sc = $('#tlscroll'), x = T * PPS;
  if (x < sc.scrollLeft + 20 || x > sc.scrollLeft + sc.clientWidth - 60) sc.scrollLeft = Math.max(0, x - sc.clientWidth * .3);
}
function setPlayIcon() { $('#play').innerHTML = `<i class="ti ${playing ? 'ti-player-pause-filled' : 'ti-player-play-filled'}"></i>`; }
function play() {
  if (playing) return stop();
  if (T >= TL.duration - .05) T = 0;
  playing = true; setPlayIcon(); lastT = T; clock0 = performance.now() / 1000 - T;
  if (useClipAudio()) syncClipAudio(true);
  else if (META.audio) { voice.currentTime = T; voice.play().catch(() => {}); }
  musicEls = TRK.audio.hide ? [] : (TL.audio?.music || []).filter(m => !m.hidden).map(m => ({ m, el: Object.assign(new Audio(m.file ? PB() + m.file : `/assets/music/${m.mood}.mp3`), { loop: true, volume: dbVol((m.gain ?? -16) + 4) }) }));
  nextFrame(tick);
}
function stop() {
  playing = false; setPlayIcon(); voice.pause(); syncClipAudio();
  for (const m of musicEls) m.el.pause(); musicEls = [];
  for (const f of Studio._play) f('stop', T);
  renderList();
}
let lastList = 0;
function tick() {
  if (!playing) return;
  const now = !useClipAudio() && META.audio && !voice.paused ? voice.currentTime : performance.now() / 1000 - clock0;
  T = Math.min(now, TL.duration);
  if (useClipAudio()) syncClipAudio();
  if (!TRK.audio.hide) for (const x of TL.audio?.sfx || []) if (x.t > lastT && x.t <= T && !x.hidden) { const a = new Audio(sfxUrl(x.name)); a.volume = dbVol(x.gain); a.play().catch(() => {}); }
  for (const { m, el } of musicEls) {
    const inside = T >= m.t0 && T < m.t1;
    if (inside && el.paused) { el.currentTime = (T - m.t0 + (m.offset || 0)) % (el.duration || 1e9); el.play().catch(() => {}); }
    if (!inside && !el.paused) el.pause();
  }
  for (const f of Studio._play) f('tick', T);
  lastT = T;
  $('#time').textContent = fmt(T); placeHead(); autoScroll(); draw();
  if (panel === 'comp' && performance.now() - lastList > 400) { lastList = performance.now(); renderList(); }
  if (T >= TL.duration) return stop();
  nextFrame(tick);
}
$('#play').addEventListener('click', play);
$('#stepb').addEventListener('click', () => setTime(T - 1 / FPS));
$('#stepf').addEventListener('click', () => setTime(T + 1 / FPS));
const toggleOv = (id, btn) => { $(id).checked = !$(id).checked; $(btn).classList.toggle('on', $(id).checked); drawOverlay(); };
$('#safebtn').addEventListener('click', () => toggleOv('#safe', '#safebtn'));
// '[id=face]' rather than the id selector: check_studio_tokens.mjs would read "hash + face" as a 4-digit hex colour.
$('#facebtn').addEventListener('click', () => toggleOv('[id=face]', '#facebtn'));
$('#safe').addEventListener('change', drawOverlay);
$('[id=face]').addEventListener('change', drawOverlay);
// S23 M161: nút ⤢ = Studio.layout 'focus' (ẩn thư viện + cột phải; features/76_layout.js vẽ lại nút và gọi fit)
function toggleExpand() {
  if (Studio.layout) return Studio.layout.set('focus', !Studio.layout.get().focus);
  setTimeout(fit, 0);
}
$('#expand').addEventListener('click', toggleExpand);
$('#fitall').addEventListener('click', () => { fit(); zoomFit(); });

// ---------- keyboard ----------
window.addEventListener('keydown', e => {
  const ae = document.activeElement; // S23 M160 (PR 185): thanh trượt (Núm) giữ mũi tên / Home / End cho chính nó
  const typing = window.KeysCore ? KeysCore.fieldOwnsKey(ae, e.key) : /INPUT|TEXTAREA|SELECT/.test(ae?.tagName) && ae.type !== 'checkbox' && ae.type !== 'range';
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); autoOff = false; return saveNow(); }
  if (typing) return;
  if (window.Studio?.jobs?.locked() && !(e.key === ' ' || e.key === 'Escape' || (!mod && /^[=+\-]$/.test(e.key)) || (!mod && e.shiftKey && e.key.toLowerCase() === 'z'))) return; // S26 M185: khoá sửa timeline khi việc nền chạy
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); return duplicateSel(); }
  if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); return splitAtPlayhead(); }
  if (!mod && (e.key === '=' || e.key === '+')) return setZoom(PPS * 1.25);
  if (!mod && e.key === '-') return setZoom(PPS / 1.25);
  if (!mod && e.shiftKey && e.key.toLowerCase() === 'z') { fit(); return zoomFit(); }
  const act = window.KeysCore?.actionOf(e); // S20 M141: chép / dán, thứ tự lớp, khoá, chọn tất cả, bảng phím tắt
  if (act && runKey(act, e)) return;
  if (e.key === ' ') { e.preventDefault(); return play(); }
  if (e.key === 'Escape') { if (Studio.layout?.get().focus) return toggleExpand(); return select(null); }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return removeSel(); }
  if (e.key.startsWith('Arrow') && !mod && window.KeysCore) { // S20 M141 (C19): dời khi vừa chọn trên khung, tua khi vừa bấm timeline; ⌥ luôn dời
    e.preventDefault();
    const list = [sel, ...multi].filter(c => c && c.kind !== 'clip' && getPos(c)), free = list.filter(c => !c.obj.locked);
    const a = KeysCore.arrowAction({ key: e.key, alt: e.altKey, shift: e.shiftKey, zone: kzone, movable: free.length > 0, locked: list.length > 0 && !free.length, fps: FPS });
    if (!a) return;
    if (a.type === 'locked') return toast(LOCK_MSG);
    if (a.type === 'seek') return setTime(T + a.dt);
    return nudge(free, a.dx, a.dy); // S17 M124: dời cả nhóm
  }
});

// ---------- save / history / export / new ----------
async function api(path, body) {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body, strip) });
  return r.json();
}
// S18 M131: trả true khi đã lưu. Các lần lưu xếp hàng (Ctrl+S khi lần trước còn bay): lần sau gửi mốc `saved` lần trước vừa nhận,
// không báo xung đột giả với chính cửa sổ này. Chỗ gọi rồi chạy việc phía server / tải lại timeline phải dừng khi false.
let saveQ = Promise.resolve(true);
function saveNow(force, quiet) { const p = saveQ.then(() => saveOnce(force, quiet), () => saveOnce(force, quiet)); saveQ = p.catch(() => false); return p; }
async function saveOnce(force, quiet) {
  if (readOnly) { projectBusy(); return false; } // dự án đang mở ở tab khác (S18 M131)
  if (newBusy) return false; // đang tạo video mới: dự án cũ đã đóng phía server (S17 M126)
  if (window.Studio?.jobs?.locked()) { if (!quiet) toast('Đang chạy ' + Studio.jobs.running() + ': lưu sau khi xong'); return false; } // S26 M185: việc nền sắp ghi lại timeline.json
  // dir: server từ chối khi đã sang dự án khác (S17 M126). base: mốc lưu lần cuối mà trang này biết (S18 M131: cùng dự án ở hai cửa sổ)
  const seq = editSeq;
  let r;
  try { r = await api('/api/save', { timeline: TL, captions: CAP, dir: META?.dir, base: META?.saved, ...(force ? { force: true } : {}), ...(quiet ? { auto: true } : {}) }); }
  catch (e) { if (quiet) { autoOff = true; return false; } throw e; } // mất kết nối khi tự lưu: dừng tự lưu, giữ "Chưa lưu"
  if (r.ok && editSeq !== seq) { autoOff = false; if (META) META.saved = r.saved; loadHistory(); autoSaveSoon(); return true; } // sửa thêm trong lúc gửi: còn "Chưa lưu", hẹn lưu tiếp
  if (r.ok) { autoOff = false; dirty = false; if (META) META.saved = r.saved; setStatus('Đã lưu', false); if (!quiet) toast(r.notes ? `Đã lưu · ${r.notes} ghi chú cho Claude` : 'Đã lưu'); loadHistory(); return true; }
  if (quiet) { autoOff = true; return false; } // tự lưu gặp xung đột / lỗi: không bật hộp thoại, giữ "Chưa lưu"; Ctrl+S sẽ hỏi (S26 M184)
  if (r.conflict) saveConflict();
  else toast('Lỗi lưu: ' + (r.error || ''));
  return false;
}
// S26 M184: tự lưu. Sau AUTOSAVE_MS không thao tác khi còn "Chưa lưu", và ngay khi tab bị ẩn. Dùng đúng saveNow (kiểm xung đột 409 sẵn có),
// không toast: chỉ chỉ báo "Đã lưu". Không lưu khi đang gõ dở, đang kéo, đang xem lại (Studio.review), đang tạo video mới, đang khôi phục.
const AUTOSAVE_MS = 4000;
let autoT = 0, autoOff = false;
function autoBusy(typing = true) {
  if (!TL || readOnly || newBusy || drag || window.Studio?._restoring || window.Studio?.review?.active || window.Studio?.jobs?.locked()) return true; // S26 M185: AI dựng / áp gợi ý QC đang ghi timeline.json: không tự lưu đè
  const a = document.activeElement;
  return typing && !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !/^(checkbox|radio|button|range|color)$/.test(a.type || ''));
}
function autoSaveSoon() {
  clearTimeout(autoT);
  if (autoOff) return; // lần tự lưu trước thất bại (xung đột): chờ người dùng lưu tay
  autoT = setTimeout(() => { if (!dirty) return; if (autoBusy()) return autoSaveSoon(); saveNow(false, true); }, AUTOSAVE_MS);
}
document.addEventListener('visibilitychange', () => { if (document.hidden && dirty && !autoOff && !autoBusy(false)) { clearTimeout(autoT); saveNow(false, true); } });
// Bản trên đĩa mới hơn bản trang này đã tải: hỏi giữ bản nào, không âm thầm đè. Chưa chọn thì vẫn "chưa lưu".
function saveConflict() {
  modal(`<h3><i class="ti ti-alert-triangle"></i> Dự án vừa được lưu ở chỗ khác</h3>
    <p>Dự án này đang mở ở một cửa sổ hoặc tab khác và bản ở đó đã được lưu sau khi trang này tải. <b>Tải bản mới nhất</b> bỏ các sửa đổi chưa lưu ở trang này; <b>Ghi đè</b> thay bản bên kia bằng bản ở đây.</p>
    <p class="muted">Bản nào bị thay vẫn còn trong Lịch sử.</p>
    <div class="actions"><button id="scf-load" class="primary">Tải bản mới nhất</button><button id="scf-over" class="danger">Ghi đè bằng bản ở đây</button><button id="scf-no">Để sau</button></div>`);
  $('#scf-load').onclick = () => { dirty = false; location.reload(); };
  $('#scf-over').onclick = () => { closeModal(); saveNow(true); };
  $('#scf-no').onclick = closeModal;
}
$('#save').addEventListener('click', () => { autoOff = false; saveNow(); });
$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);
async function loadHistory() {
  let list = []; try { list = await api('/api/history'); } catch {}
  if (!Array.isArray(list)) list = [];
  $('#history').innerHTML = '<option value="">Lịch sử</option>' + list.map(id => `<option value="${id}">${id.slice(0, 10)} ${id.slice(11).replace(/-/g, ':')}</option>`).join('');
}
$('#history').addEventListener('change', async e => {
  const id = e.target.value; e.target.value = ''; if (!id) return;
  if (!confirm('Mở lại phiên bản ' + id + '? (vẫn hoàn tác được)')) return;
  const s = await api('/api/history/' + id); pushUndo();
  TL = s.timeline; CAP = s.captions || []; migrateClips(); sel = null; changed(true);
});
function modal(html) { $('#modalbox').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' && !pollTimer && !readOnly) closeModal(); });
let pollTimer = null;
function pollJob(onDone) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const j = await api('/api/job'); if (!j) return;
    const bar = $('#modal .bar i'); if (bar) bar.style.width = Math.round(j.progress * 100) + '%';
    const st = $('#jobstep'); if (st) st.textContent = j.step + (j.state === 'running' ? ` · ${Math.round(j.progress * 100)}%` : '');
    const lg = $('#joblog'); if (lg) lg.textContent = j.log.split(/[\r\n]+/).slice(-8).join('\n');
    if (j.state !== 'running') { clearInterval(pollTimer); pollTimer = null; new Promise(ok => ok(onDone(j))).catch(e => console.error(e)).finally(() => stoppedNotice(j)); }
  }, 700);
}
// A job the user cancelled or paused is not an error: replace whatever "Lỗi…" modal/toast the caller showed with a neutral (amber) notice.
const STOPPED = { cancelled: ['ti-player-stop', 'Đã huỷ'], paused: ['ti-player-pause', 'Đã tạm dừng'] };
function stoppedNotice(j) {
  const s = STOPPED[j.state]; if (!s) return;
  for (const o of document.querySelectorAll('.toast')) o.remove();
  modal(`<h3><i class="ti ${s[0]} ui-text-warn"></i> ${s[1]}</h3><p>${esc(j.step || s[1])}</p><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
}
// S12 M100: "Giao vào Thành phẩm" (bản xong vào <Kho>/Thanh pham/<YYYY-MM>/), nhớ theo máy; localStorage có thể bị chặn → mặc định bật.
const GIVE_KEY = 'avs.export.deliver';
const giveOn = () => { try { return localStorage.getItem(GIVE_KEY) !== '0'; } catch { return true; } };
const giveSet = on => { try { localStorage.setItem(GIVE_KEY, on ? '1' : '0'); } catch { /* chỉ là tiện ích */ } };
const giveNote = r => (r.delivered?.length ? ' · đã giao vào Thành phẩm' : r.deliverError ? ' · chưa giao được vào Thành phẩm: ' + r.deliverError : '');
$('#export').addEventListener('click', () => {
  const v = DH > DW, q = (a, b) => (v ? `${a}×${b}` : `${b}×${a}`);
  modal(`<h3><i class="ti ti-upload"></i> Xuất video</h3>
    <label class="lbl">Chất lượng</label><div class="qual">
      <label><input type="radio" name="xq" value="1080" checked><b>1080p</b><small>${q(1080, 1920)} · Full HD</small></label>
      <label><input type="radio" name="xq" value="720"><b>720p</b><small>${q(720, 1280)} · nhanh</small></label>
      <label><input type="radio" name="xq" value="4k"><b>4K</b><small>${q(2160, 3840)}</small></label></div>
    <div class="row2"><div><label class="lbl">Từ (giây)</label><input id="xfrom" type="number" placeholder="0"></div><div><label class="lbl">Đến (giây)</label><input id="xto" type="number" placeholder="${TL.duration}"></div></div>
    <label class="lbl">Xuất thêm khổ khác (cùng lúc)</label><div class="xasp">${(v ? [['1:1', 'Vuông 1:1', 'cắt bám mặt'], ['16:9', 'Ngang 16:9', 'video giữa, nền mờ']] : [['9:16', 'Dọc 9:16', 'cắt bám mặt'], ['1:1', 'Vuông 1:1', 'cắt bám mặt']]).map(([k, l, d]) => `<label><input type="checkbox" name="xasp" value="${k}"> <b>${l}</b> <small>${d}</small></label>`).join('')}</div>
    <label class="lbl">Thành phẩm</label><div class="xasp"><label title="Bản xuất xong (kèm ảnh bìa, .srt khi bấm) được liên kết sang Thanh pham/<tháng> của Kho thương hiệu, không tốn thêm dung lượng"><input type="checkbox" id="xgive" ${giveOn() ? 'checked' : ''}> <b>Giao vào Thành phẩm</b> <small>Thanh pham/&lt;tháng&gt; của Kho</small></label></div>
    <div class="acts acts--spaced"><button id="xcover"><i class="ti ti-photo"></i> Ảnh bìa (khung ${fmt(T)})</button><button id="xsrt"><i class="ti ti-file-text"></i> Phụ đề .srt</button></div>
    <p class="muted">Âm thanh được trộn lại (giọng + nhạc + SFX, chuẩn −14 LUFS) rồi render từng khung bằng đúng engine của preview.</p>
    <div class="actions"><button onclick="closeModal()">Huỷ</button><button class="primary" id="xgo"><i class="ti ti-upload"></i> Xuất</button></div>`);
  $('#xcover').onclick = async () => { if (dirty && !await saveNow()) return; toast('Đang render ảnh bìa…'); const r = await api('/api/still', { t: T, deliver: $('#xgive').checked }); if (r.out) { window.open(PB() + r.out); api('/api/reveal', { path: r.out }); if (giveNote(r)) toast('Ảnh bìa' + giveNote(r)); } else toast('Lỗi: ' + r.error); };
  $('#xsrt').onclick = async () => { if (dirty && !await saveNow()) return; const r = await api('/api/srt', { deliver: $('#xgive').checked }); toast('Đã lưu ' + r.out + giveNote(r)); api('/api/reveal', { path: r.out }); };
  $('#xgive').onchange = e => giveSet(e.target.checked);
  $('#xgo').onclick = async () => {
    if (dirty && !await saveNow()) return;
    const from = $('#xfrom').value, to = $('#xto').value;
    const xo = { quality: document.querySelector('[name=xq]:checked').value, from: from === '' ? undefined : +from, to: to === '' ? undefined : +to };
    const r = await api('/api/export', { ...xo, aspects: [...document.querySelectorAll('[name=xasp]:checked')].map(i => i.value), deliver: $('#xgive').checked });
    if (!r.ok) return Studio.jobs ? Studio.jobs.refuse(r) : toast(r.error || 'Đang có tác vụ khác chạy');
    // S26 M185: chạy nền trong khay việc (features/05_jobs.js), không hộp giữa màn hình: sửa tiếp được, server render bản đã lưu lúc bấm Xuất
    closeModal();
    Studio.jobs.track({ kind: 'export', title: 'Xuất video', note: Studio.jobs.exportNote,
      // S14 M112: ghi .studio/exports.json; kết quả (Xem / Hiện trong thư mục / Mở Thành phẩm) lấy từ features/55_exports.js
      onDone: async j => (Studio.exports && await Studio.exports.finish(j, xo).catch(() => null)) || { text: j.out ? String(j.out).split('/').pop() : 'Xong', acts: [{ label: /Mac/.test(navigator.platform) ? 'Hiện trong Finder' : 'Hiện trong thư mục', icon: 'ti-folder', on: () => api('/api/reveal', { path: j.out }) }, { label: 'Mở video', icon: 'ti-player-play', primary: true, on: () => window.open(PB() + j.out) }] } });
  };
});
// ---------- bộ chọn video dùng chung của bước Nguồn (S12 M98): Video mới, Video dài ----------
// Trên cùng: video trong Kho của thương hiệu (Nguon/ trước, có ô tìm, bấm để chọn) · "Chọn từ máy…" (chép vào <Kho>/Nguon/) ·
// ô dán đường dẫn; thả file video vào cũng được. videoPicker(host, { brand, value, onChange(path, name) }) → { setBrand(id), value, focus() }.
function videoPicker(host, o = {}) {
  if (!document.getElementById('vp-css')) {
    const st = document.createElement('style'); st.id = 'vp-css';
    st.textContent = `.vp-head { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); margin-bottom: var(--space-1); min-width: 0; }
    .vp-head .vp-kho { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .vp-q { width: 100%; margin-bottom: var(--space-1); }
    .vp-list { max-height: 184px; overflow-y: auto; border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); margin-bottom: var(--space-2); }
    .vp-it { display: flex; gap: var(--space-2); align-items: center; width: 100%; padding: var(--space-1) var(--space-2); background: none; border: 0; border-bottom: 1px solid rgb(var(--color-line)); border-radius: 0; text-align: left; color: rgb(var(--color-fg)); font-size: var(--text-xs); cursor: pointer; min-width: 0; }
    .vp-it:last-child { border-bottom: 0; } .vp-it:hover { background: rgb(var(--color-surface-hover)); }
    .vp-it.on { background: rgb(var(--color-accent-soft) / .24); }
    .vp-it .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .vp-it small { flex: none; color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); }
    .vp-empty { padding: var(--space-3); font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); text-align: center; line-height: 1.5; }
    .vp-row { display: flex; gap: var(--space-2); min-width: 0; } .vp-row > button { flex: none; } .vp-row > input { flex: 1; min-width: 0; }`;
    document.head.appendChild(st);
  }
  const ph = /Win/.test(navigator.platform) ? 'hoặc dán đường dẫn: C:\\Users\\ban\\Videos\\clip.mp4' : 'hoặc dán đường dẫn: /Users/ban/Movies/clip.mp4';
  host.innerHTML = `<div class="vp-head"><i class="ti ti-building-warehouse"></i><span class="vp-kho">Đang đọc Kho…</span></div>
    <input class="vp-q" placeholder="Tìm video trong Kho"><div class="vp-list" role="listbox"></div>
    <div class="vp-row"><button class="vp-pick primary" type="button"><i class="ti ti-folder-open"></i> Chọn từ máy…</button><input type="file" accept="video/*,.mov,.mkv,.m4v" hidden>
    <input class="vp-path" placeholder="${esc(ph)}" value="${esc(o.value || '')}"></div>`;
  const q = host.querySelector('.vp-q'), list = host.querySelector('.vp-list'), pathIn = host.querySelector('.vp-path'), pick = host.querySelector('.vp-pick'), file = host.querySelector('[type=file]');
  let brand = o.brand || '', items = [], seq = 0;
  const size = b => b >= 1 << 30 ? (b / (1 << 30)).toFixed(1) + ' GB' : b >= 1 << 20 ? Math.round(b / (1 << 20)) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const fold = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const set = (p, name) => { pathIn.value = p; draw(); o.onChange?.(p, name); };
  function draw() {
    const f = fold(q.value.trim()), shown = items.filter(x => !f || fold(x.rel).includes(f)), cur = pathIn.value.trim();
    list.innerHTML = shown.length ? shown.slice(0, 200).map(x => `<button type="button" role="option" class="vp-it ${x.path === cur ? 'on' : ''}" data-i="${items.indexOf(x)}" title="${esc(x.rel)}"><i class="ti ti-movie"></i><span class="n">${esc(x.dir && x.dir !== 'Nguon' ? x.rel : x.name)}</span><small>${size(x.size)} · ${new Date(x.mtime).toLocaleDateString('vi-VN')}</small></button>`).join('')
      : `<div class="vp-empty">${items.length ? 'Không có video khớp' : 'Kho chưa có video. Bấm “Chọn từ máy…” để chép video vào thư mục Nguon của Kho, hoặc chép thẳng vào thư mục đó.'}</div>`;
    list.querySelectorAll('[data-i]').forEach(b => (b.onclick = () => { const x = items[+b.dataset.i]; set(x.path, x.name); }));
  }
  async function load() {
    const my = ++seq; list.innerHTML = '<div class="vp-empty"><i class="ti ti-loader-2 spin"></i></div>';
    const r = await api('/api/pick/sources?brand=' + encodeURIComponent(brand)).catch(e => ({ error: e.message }));
    if (my !== seq) return; // đổi thương hiệu nhanh: bỏ kết quả cũ
    items = r.items || [];
    const k = host.querySelector('.vp-kho'); k.textContent = r.kho ? `Kho ${r.kho.title}: ${r.kho.root}` : (r.error || 'Không đọc được Kho'); k.title = r.kho?.warning || r.kho?.root || '';
    draw(); o.onKho?.(r.kho || null);
  }
  q.oninput = draw;
  pathIn.onchange = () => { draw(); o.onChange?.(pathIn.value.trim(), pathIn.value.trim().split(/[\\/]/).pop()); };
  pick.onclick = () => file.click();
  file.onchange = () => { const f = file.files[0]; file.value = ''; if (f) upload(f); };
  // kéo thả file video vào bộ chọn = "Chọn từ máy" (stopPropagation: không để editor chép vào media/ của dự án đang mở)
  host.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
  host.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) upload(f); });
  function upload(f) {
    if (!/\.(mp4|mov|m4v|mkv|webm|avi|mts)$/i.test(f.name)) return toast('Chỉ nhận file video');
    if (pick.disabled) return toast('Đang chép một video khác');
    const x = new XMLHttpRequest(), label = pick.innerHTML; pick.disabled = true;
    pick.innerHTML = '<i class="ti ti-loader-2 spin"></i> Đang chép…';
    x.open('POST', `/api/pick/upload?brand=${encodeURIComponent(brand)}&name=${encodeURIComponent(f.name)}`);
    x.upload.onprogress = e => { if (e.lengthComputable) pick.innerHTML = `<i class="ti ti-loader-2 spin"></i> Đang chép ${Math.round(e.loaded / e.total * 100)}%`; };
    const done = () => { pick.disabled = false; pick.innerHTML = label; };
    x.onload = async () => { done(); let r = {}; try { r = JSON.parse(x.responseText); } catch {} if (!r.path) return toast('Không chép được video: ' + (r.error || x.status)); await load(); set(r.path, f.name); toast('Đã chép vào Kho: ' + r.rel); };
    x.onerror = () => { done(); toast('Không chép được video'); };
    x.send(f);
  }
  load();
  return { setBrand(b) { if ((b || '') !== brand) { brand = b || ''; load(); } }, get value() { return pathIn.value.trim(); }, focus: () => q.focus() };
}
// newBusy: đang tạo video mới (S17 M126), không lưu dự án cũ nữa; newOpening: hai lần bấm nhanh không mở hai hộp (hộp chờ /api/onboarding + /api/brands)
let newOpening = false, newBusy = false;
const newProject = async (opt = {}) => {
  if (newOpening) return; newOpening = true;
  try { await openNewProject(opt); } finally { newOpening = false; }
};
$('#newproj').addEventListener('click', () => newProject());
// S17 M126: video mới không lẫn với dự án đang mở. Thương hiệu mặc định = thương hiệu (Kho) của dự án đang mở, chưa mở thì theo
// hướng dẫn đầu; dòng "Thương hiệu · Kho" luôn hiện, chọn Kho khác dự án đang mở thì nhắc và cho đổi lại. Bấm Tạo: lưu dự án đang mở,
// che trình chỉnh sửa (server đóng dự án cũ trong lúc tạo), xong thì nạp lại trang với dự án mới sạch.
const khoLabel = k => (k ? `${k.brand ? 'Thương hiệu ' + k.title : 'Không thương hiệu'} · Kho: ${k.brand ? k.title : 'Chung'}` : '');
async function openNewProject(opt = {}) {
  // S26 M188: trang chủ mở hộp này từ thẻ thương hiệu (opt.brand) thì chọn sẵn thương hiệu đó.
  // Thương hiệu, gói style và khổ hình đã chọn ở hướng dẫn đầu / brand kit: lấy sẵn, không hỏi lại. Muốn khác thì mở "Đổi".
  const ls = { get: (k, d) => { try { return localStorage.getItem('avs.' + k) || d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('avs.' + k, v); } catch {} } };
  const [onb, brands, tpls] = await Promise.all([api('/api/onboarding').catch(() => null), api('/api/brands').catch(() => []),
    TEMPLATES ? Promise.resolve(TEMPLATES) : api('/api/templates').catch(() => [])]);
  for (let i = 0; i < 20 && !packs().length; i++) await new Promise(r => setTimeout(r, 150)); // khung preview còn đang nạp engine
  const BR = Array.isArray(brands) ? brands : [], PK = packs().filter(p => p.recipe);
  const cur = TL ? META?.kho || null : null; // Kho của dự án đang mở (server đọc từ .kho.json / brand kit)
  const brand0 = (typeof opt.brand === 'string' && (opt.brand === '' || BR.some(b => b.id === opt.brand)) ? opt.brand : null) ?? (cur && (cur.brand === '' || BR.some(b => b.id === cur.brand)) ? cur.brand : null) ?? (BR.find(b => b.id === onb?.brand)?.id || (BR.length === 1 ? BR[0].id : ''));
  const packFor = id => window.PackPick.defaultPack({ brand: BR.find(x => x.id === id), purpose: onb?.purpose, last: ls.get('newPack', ''), packs: PK });
  const orient0 = { '16:9': 'horizontal', '9:16': 'vertical' }[onb?.aspect] || 'auto';
  const OR = [['auto', 'Theo video'], ['vertical', 'Dọc 9:16 (Reels, TikTok, Shorts)'], ['horizontal', 'Ngang 16:9 (YouTube)']];
  modal(`<h3><i class="ti ti-video-plus"></i> Tạo dự án từ video thô</h3>
    <div id="nkho" class="nkho"><i class="ti ti-building-warehouse"></i><span></span></div>
    <label class="check ntpl" id="ntplrow" hidden><input type="checkbox" id="ntpl" checked> <span></span></label>
    <label class="lbl">Video</label><div id="nvp"></div>
    <label class="lbl">Tiêu đề / chủ đề (dùng cho intro)</label><input id="ntitle" placeholder="VD: 3 mẹo dùng ChatGPT">
    <details id="nopts"><summary><span class="muted">Dùng thiết lập sẵn:</span> <b id="nsum"></b> <span class="muted">· Đổi</span></summary>
    <label class="lbl">Thương hiệu · Kho</label><select id="nbrand"><option value="">Không thương hiệu · Kho Chung</option>${BR.map(b => `<option value="${esc(b.id)}" ${b.id === brand0 ? 'selected' : ''}>${esc(b.title || b.name || b.id)} · Kho: ${esc(b.title || b.name || b.id)}</option>`).join('')}</select>
    <label class="lbl">Gói style</label><div class="packs">${PK.map(p => `<label><input type="radio" name="npack" value="${p.id}" ${p.id === packFor(brand0) ? 'checked' : ''}><b>${p.icon} ${esc(p.name)}</b><span class="muted">${esc(p.desc || '')}</span></label>`).join('')}</div>
    <div class="row2"><div><label class="lbl">Khổ hình</label><select id="norient">${OR.map(([v, l]) => `<option value="${v}" ${v === orient0 ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div><label class="lbl">Độ chính xác nhận giọng</label><select id="nmodel">${[['large-v3-turbo', 'large-v3-turbo (chính xác, khuyên dùng)'], ['small', 'small (nhanh, sai nhiều hơn)'], ['large-v3', 'large-v3 (chậm nhất)']].map(([v, l]) => `<option value="${v}" ${v === ls.get('newModel', 'large-v3-turbo') ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <label class="lbl">Thư mục dự án (để trống = Kho của thương hiệu, thư mục Du an)</label><input id="ndir" placeholder=""></details>
    <p class="muted">Tự làm: nhận giọng → cắt khoảng lặng → cắt khung → phụ đề → bản dựng theo gói (intro, graphic theo từ khoá, CTA, nhạc). Sau đó bạn (hoặc Claude) chỉnh tiếp.${TL ? ` Dự án đang mở (<b>${esc(META.name)}</b>) được lưu rồi đóng lại; video mới mở trong một dự án riêng.` : ''}</p>
    <div class="actions"><button onclick="closeModal()">Huỷ</button><button class="primary" id="ngo">Tạo</button></div>`);
  const sum = () => {
    const b = BR.find(x => x.id === $('#nbrand').value), pv = document.querySelector('[name=npack]:checked')?.value, p = PK.find(x => x.id === pv);
    $('#nsum').textContent = [b ? (b.title || b.name) : 'không thương hiệu', p ? p.name : pv, OR.find(o => o[0] === $('#norient').value)?.[1].replace(/ \(.*/, '')].filter(Boolean).join(' · ');
  };
  // dòng "Thương hiệu · Kho" (luôn hiện) + nhắc khi Kho khác dự án đang mở, kèm nút đổi lại
  let kho = null;
  const khoLine = () => {
    const box = $('#nkho'); if (!box) return;
    const b = BR.find(x => x.id === $('#nbrand').value), k = kho || { brand: b?.id || '', title: b ? (b.title || b.name || b.id) : 'Chung' };
    const off = cur && (cur.brand || '') !== ($('#nbrand').value || '');
    box.classList.toggle('warn', !!off);
    box.querySelector('span').innerHTML = `<b>${esc(khoLabel(k))}</b>${kho?.root ? ` <small>${esc(kho.root)}</small>` : ''}`
      + (off ? `<br>Video này sẽ vào Kho <b>${esc(k.brand ? k.title : 'Chung')}</b> của ${k.brand ? `thương hiệu <b>${esc(k.title)}</b>` : '<b>không thương hiệu</b>'}, khác dự án đang mở (${esc(khoLabel(cur))}). <button type="button" class="wf-lnk" id="nkho-back">Dùng Kho của dự án đang mở</button>` : '');
    $('#nkho-back')?.addEventListener('click', () => { $('#nbrand').value = cur.brand || ''; $('#nbrand').onchange(); });
  };
  const vp = videoPicker($('#nvp'), { brand: brand0, onKho: k => { kho = k; khoLine(); }, onChange: (p, name) => { if (p && !$('#ntitle').value) { $('#ntitle').value = String(name || '').replace(/\.\w+$/, ''); dirPh(); } } });
  const dirPh = () => { const b = BR.find(x => x.id === $('#nbrand').value); $('#ndir').placeholder = `Kho ${b ? (b.title || b.name) : 'Chung'} › Du an › ${$('#ntitle').value.trim() || 'tên video'}`; };
  $('#ntitle').oninput = dirPh; dirPh();
  // S27 M189: mẫu chọn ở trang chủ (opt.tpl, cho đúng thương hiệu đó) hoặc mẫu mặc định của thương hiệu: áp sau khi dự án mở
  const TP_ = Array.isArray(tpls) ? tpls : [];
  const tplFor = id => { const want = opt.tpl && id === (opt.brand ?? id) ? opt.tpl : BR.find(x => x.id === id)?.tpl; return TP_.find(t => t.id === want) || null; };
  const tplLine = () => {
    const t = tplFor($('#nbrand').value), row = $('#ntplrow'); row.hidden = !t;
    if (t) row.querySelector('span').textContent = `Áp mẫu “${t.name || t.id}” sau khi tạo${t.id === opt.tpl ? '' : ' (mẫu mặc định của thương hiệu)'}`;
  };
  tplLine();
  $('#nbrand').onchange = () => { tplLine(); const v = packFor($('#nbrand').value), r = document.querySelector(`[name=npack][value="${CSS.escape(v)}"]`); if (r) r.checked = true; kho = null; khoLine(); vp.setBrand($('#nbrand').value); dirPh(); sum(); };
  $('#nopts').onchange = sum; sum(); khoLine();
  $('#ngo').onclick = async () => {
    if (!vp.value) return toast('Chọn video trước');
    const pack = document.querySelector('[name=npack]:checked')?.value || 'slate';
    ls.set('newPack', pack); ls.set('newModel', $('#nmodel').value);
    // lưu dự án đang mở trước khi server đóng nó; lưu hỏng thì dừng, không bỏ mất chỉnh sửa
    if (TL && dirty) { await saveNow(); if (dirty) return toast('Chưa lưu được dự án đang mở — chưa tạo video mới'); }
    const useTpl = !$('#ntplrow').hidden && $('#ntpl').checked ? tplFor($('#nbrand').value)?.id || '' : '';
    const r = await api('/api/new', { video: vp.value, dir: $('#ndir').value.trim() || undefined, model: $('#nmodel').value,
      pack, title: $('#ntitle').value.trim(), orient: $('#norient').value, brand: $('#nbrand').value || undefined });
    if (!r.ok) return Studio.jobs.refuse(r);
    // dự án cũ đã đóng phía server: che trình chỉnh sửa (chỗ chờ #np-wait), không để thấy (hay lưu) timeline cũ trong lúc tạo.
    // S26 M185: chạy nền trong khay việc, không hộp chặn cả trang: trang chủ và Tự lái vẫn dùng được; xong thì chuyển như cũ (X-AVS-Opened)
    newBusy = true; dirty = false; document.body.classList.add('np-busy'); closeModal();
    Studio.jobs.track({ kind: 'new', title: 'Tạo dự án mới', note: khoLabel(kho) || '',
      onDone: () => { if (useTpl) try { sessionStorage.setItem('avs-apply-tpl', useTpl); } catch { /* không có sessionStorage: bỏ qua mẫu */ } location.reload(); return { text: 'Đang mở dự án mới…' }; },
      onFail: j => { newBusy = false; document.body.classList.remove('np-busy'); return { text: j.step || 'Chưa tạo được dự án mới', acts: [{ label: 'Tải lại trang', icon: 'ti-refresh', on: () => location.reload() }] }; } });
  };
}
function toast(m) {
  for (const o of document.querySelectorAll('.toast')) o.remove();
  const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = `<i class="ti ti-info-circle"></i>${esc(m)}`; document.body.appendChild(d); setTimeout(() => d.remove(), 2400);
}
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('resize', fit);

// ---------- boot ----------

// ---------- S22 M155 (C26): (i) giải thích ----------
// Studio.tip(text[, label]) → HTML một biểu tượng (i); rê chuột hoặc Tab tới thì hiện chữ (role=tooltip, aria-describedby).
// text là chữ thường (tự esc). Bóng chữ đặt position: fixed theo biểu tượng để không bị panel cuộn cắt; Esc ẩn.
let tipSeq = 0;
function tip(text, label = 'Giải thích') {
  const id = 'tip-' + (++tipSeq);
  return `<span class="tip" tabindex="0" role="button" aria-label="${esc(label)}" aria-describedby="${id}"><i class="ti ti-info-circle" aria-hidden="true"></i><span class="tip-pop" role="tooltip" id="${id}">${esc(text)}</span></span>`;
}
function placeTip(t) {
  const pop = t.querySelector('.tip-pop'); if (!pop) return;
  t.classList.remove('tip--off');
  const r = t.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight, m = 8;
  const x = Math.max(m, Math.min(r.left + r.width / 2 - pw / 2, innerWidth - pw - m));
  const y = r.bottom + 6 + ph > innerHeight - m ? Math.max(m, r.top - 6 - ph) : r.bottom + 6;
  pop.style.setProperty('--tip-x', x + 'px'); pop.style.setProperty('--tip-y', y + 'px');
  // tổ tiên có transform / backdrop-filter thì fixed tính theo tổ tiên đó: bù phần lệch
  const a = pop.getBoundingClientRect(), dx = a.left - x, dy = a.top - y;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) { pop.style.setProperty('--tip-x', (x - dx) + 'px'); pop.style.setProperty('--tip-y', (y - dy) + 'px'); }
}
for (const ev of ['mouseover', 'focusin']) document.addEventListener(ev, e => { const t = e.target.closest?.('.tip'); if (t && !t.contains(e.relatedTarget)) placeTip(t); });
// Esc ẩn bóng chữ đang hiện (WCAG 1.4.13); bấm vào (i) chỉ focus, không kích hoạt nhãn / mục chứa nó
document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; const t = document.activeElement?.closest?.('.tip') || document.querySelector('.tip:hover'); if (t && !t.classList.contains('tip--off')) { t.classList.add('tip--off'); e.stopPropagation(); } }, true);
document.addEventListener('click', e => { const t = e.target.closest?.('.tip'); if (t && !e.target.closest('.tip-pop a, .tip-pop button')) { e.preventDefault(); e.stopPropagation(); t.focus(); placeTip(t); } }, true);

// ---------- feature API (studio/features/*.js) ----------
// Features are plain scripts loaded after boot; they read/mutate TL/CAP through this object and call changed() after edits.
const Studio = window.Studio = {
  get TL() { return TL; }, set TL(v) { TL = v; }, purl: rel => PB() + rel, get pbase() { return PB(); }, saveTabUI, get dirty() { return dirty; }, get CAP() { return CAP; }, set CAP(v) { CAP = v; }, get META() { return META; },
  get T() { return T; }, get PPS() { return PPS; }, get win() { return win; }, get sel() { return sel; }, get DW() { return DW; }, get DH() { return DH; },
  $, esc, tip, fmt, api, toast, modal, closeModal, pollJob, videoPicker, setTime, saveNow, newProject, openTemplates: openTemplatesFor, pushUndo, changed, renderTimeline, renderInspector, renderPanel, build, draw, fit, zoomFit, get zoomPending() { return ZFIT; },
  select, sect, openSect, typeName, compOf: obj => compOf(obj),
  // S20 M140: bảng lệnh trên khung (66_canvas_cmds.js): đọc trạng thái preview, gọi lại đúng hàm của inspector / phím tắt
  // S28 M202: xem thử trên khung chính bằng TL tạm (79_transpeek.js): previewTL(tl) = bản engine của tl; redraw() = dựng lại từ TL thật
  previewTL: src => previewTL(src), redraw() { needInit = true; draw(); },
  get K() { return K; }, get playing() { return playing; }, get dragging() { return !!drag; }, get editing() { return !!inEdit; }, get multi() { return multi; },
  FONTS, SWATCH, ANIM_LIST, fontOpt, setTimes: (c, t0, t1) => setTimes(c, t0, t1, false), rectOf: obj => rectOf(obj), pick: (x, y) => pick(x, y), getPos: c => getPos(c), setPos: (c, p) => setPos(c, p), touch,
  removeSel, duplicateSel, splitAtPlayhead,
  // S21 M145: cột phải. addTab(key, render(el)): vẽ thân tab (layers: 67_layers.js). setDetail({html, mount?} | null): chi tiết mục thư viện (M147).
  project: { html: () => projectPanel(), mount: mountProject }, // S24 M174: Cài đặt dự án ở bước Chuẩn bị (01_workflow.js)
  right: { get tab() { return RT.tab; }, show: showRightTab, addTab(key, render) { RT.ext[key] = render; if (RT.tab === key) renderInspector(); }, refresh: () => renderInspector(),
    setDetail(d) { RT.detail = d || null; if (d) showRightTab(window.RightCore?.tabForDetail() || 'props'); else if (RT.tab === 'props' && !sel) renderInspector(); }, get detail() { return RT.detail; } }, copySel, pasteClip, toggleLock, layerSel, selectAll, get canPaste() { return !!CLIPB; }, // S20 M141
  startInlineEdit: c => startInlineEdit(c), compByCid: cid => compByCid(cid), _ov: [],
  // S20 M142: bảng Lớp (67_layers.js): tab thêm của panel Thành phần, danh sách element, track khoá, cuộn timeline tới khối
  get comps() { return comps; }, trackLocked: c => !!TRK[c?.track]?.lock, revealOnTimeline: c => revealOnTimeline(c), pickAll: (x, y) => pickAll(x, y),
  addCompTab(key, label, fn, title, first) { if (!COMP_EXT[key]) { COMP_TABS[first ? 'unshift' : 'push']([key, label, title]); if (first) tab = key; } COMP_EXT[key] = fn; if (panel === 'comp') renderComps(); },
  _insp: [], _ready: [], _blk: [], // _blk: fn(comp, PPS) -> extra HTML inside a timeline block (keyframe diamonds…)
  _tip: [], _itop: [], // S27 M194: _tip: fn(comp) -> chữ thêm vào tooltip khối timeline; _itop: fn(comp) -> HTML đầu Thuộc tính (dưới hàng Hỏi Claude)
  _build: [], _play: [], // build(comps) hooks add timeline components; play('tick'|'stop', T) hooks follow playback
  // left rail panel: Studio.addPanel('ai', 'ti-robot', 'AI', () => { $('#libbody').innerHTML = … }, { step: 'build', level: 'basic' })
  // opts (optional, M82): step 'prep'|'source'|'build'|'check'|'ship'|'settings', level 'basic'|'pro' — read by features/01_workflow.js
  _popts: {}, _top: [], _rail: [], // _top: fn(el, opts) after addTopButton; _rail: fn(railEl) after renderRail
  addPanel(id, icon, name, fn, opts) { RAIL.push([id, icon, name]); PANEL_TITLE[id] = name; SEARCH_PH[id] = ''; EXTRA_PANELS[id] = fn; if (opts) Studio._popts[id] = opts; renderRail(); },
  // top bar button inserted before "Xuất" (01_workflow.js may move it into the ⋯ menu or a step)
  addTopButton(html, onClick, opts) { const b = document.createElement('span'); b.innerHTML = html; const el = b.firstElementChild; $('#export').before(el); el.addEventListener('click', onClick); for (const h of Studio._top) h(el, opts || {}); return el; },
  // inspector tab(s) for the selected component: fn(c) -> [key, label, html] | [[…], …] | null
  addInspectorTab(fn) { Studio._insp.push(fn); },
  onReady(fn) { if (Studio._isReady) fn(); else Studio._ready.push(fn); },
  // reload project from disk (after a server-side job rewrote timeline.json)
  async reload() { const p = await api('/api/project'); TL = p.timeline; CAP = p.captions; META = p.meta; TL.scenes = TL.scenes || []; migrateClips(); needInit = true; build(); renderTimeline(); renderInspector(); renderPanel(); draw(); $('#durtc').textContent = '/ ' + fmt(TL.duration); if (META.audio) voice.src = PB() + META.audio + '?' + Date.now(); WAVE = await api('/api/waveform'); renderTimeline(); },
};
// All feature scripts download in parallel; async=false keeps them executing in file order.
async function loadFeatures() {
  await Promise.all((await api('/api/features')).map(f => new Promise(ok => { const s = document.createElement('script'); s.async = false; s.src = '/studio/features/' + f; s.onload = s.onerror = ok; document.body.appendChild(s); })));
}
// S18 M129: trạng thái giao diện từng tab (playhead, zoom timeline, cuộn, panel trái, element đang chọn, hoàn tác / làm lại),
// giữ khi chuyển tab (trang tải lại với ?p=<mã>) hoặc tải lại trang. sessionStorage: riêng cửa sổ trình duyệt, mất khi đóng cửa sổ.
const tabKey = () => (META?.pid ? 'avs.tabui.' + META.pid : null);
function saveTabUI() {
  const k = tabKey(); if (!k || !TL) return;
  const ui = { t: T, pps: PPS, sx: $('#tlscroll')?.scrollLeft || 0, panel: document.querySelector('#rail .on')?.dataset.p || '', sel: sel?.obj?.cid || null, at: Date.now() };
  for (const n of [30, 10, 0]) { // hoàn tác lớn quá chỗ thì giữ ít bước hơn, cuối cùng chỉ giữ vị trí
    try { sessionStorage.setItem(k, JSON.stringify({ ...ui, undo: undoStack.slice(-n), redo: redoStack.slice(-n), saved: META.saved })); return; } catch { /* đầy */ }
  }
}
function loadTabUI() {
  const k = tabKey(); if (!k) return;
  let ui = null; try { ui = JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { /* không có sessionStorage */ }
  if (!ui) return;
  // hoàn tác chỉ dùng lại khi timeline trên đĩa vẫn là bản tab này đã thấy (không bị tab / cửa sổ khác sửa)
  if (ui.saved === META.saved && Array.isArray(ui.undo)) { undoStack = ui.undo.filter(x => typeof x === 'string'); redoStack = (ui.redo || []).filter(x => typeof x === 'string'); }
  // S23 M168: mở lại panel của tab không phải lần người dùng mở thư viện (78_cols.js bỏ qua, thư viện gấp / tự gấp giữ nguyên)
  if (ui.panel) { Studio._restoring = true; try { document.querySelector(`#rail [data-p="${CSS.escape(ui.panel)}"]`)?.click(); } finally { Studio._restoring = false; } }
  if (+ui.pps > 0) setZoom(+ui.pps);
  if (ui.sel) { const c = compByCid(ui.sel); if (c) select(c); }
  if (+ui.t >= 0) setTime(Math.min(+ui.t, TL.duration || 0));
  requestAnimationFrame(() => { const sc = $('#tlscroll'); if (sc && +ui.sx >= 0) sc.scrollLeft = +ui.sx; });
}
window.addEventListener('pagehide', saveTabUI);
// S18 M131: mỗi dự án chỉ mở ở một tab / cửa sổ của trình duyệt (chủ repo chốt 2026-11-17: mở trùng thì cảnh báo, không cho mở
// tiếp). Khoá Web Locks theo mã dự án, giữ suốt đời trang; tab đóng, tải lại hay treo thì trình duyệt tự nhả nên không kẹt khoá.
// Thử lại vài lần ~2 s: tải lại / "Tải bản mới nhất" có khi trang mới chạy trước khi trang cũ kịp nhả. Hai trình duyệt khác nhau
// không chung khoá: chốt chặn còn lại là xung đột khi lưu (base, M131). Trình duyệt không có Web Locks thì cho mở như cũ.
let readOnly = false;
async function holdProject(id) {
  if (!navigator.locks || !id) return true;
  const once = () => new Promise(ok => navigator.locks.request('avs-project:' + id, { ifAvailable: true }, lock => { ok(!!lock); return lock ? new Promise(() => {}) : null; }).catch(() => ok(true)));
  for (let i = 0; i < 8; i++) { if (await once()) return true; await new Promise(r => setTimeout(r, 250)); }
  return false;
}
function projectBusy() {
  readOnly = true; document.body.classList.add('proj-busy');
  modal(`<h3><i class="ti ti-lock"></i> Dự án đang mở ở tab khác</h3>
    <p><b>${esc(META.name || '')}</b> đang được sửa ở một tab hoặc cửa sổ khác của trình duyệt. Mỗi dự án chỉ sửa ở một chỗ để hai bên không ghi đè nhau.</p>
    <p class="muted">Muốn làm thêm một bản khác từ cùng video nguồn: tạo dự án mới (bản sao, cùng Kho / thương hiệu, sửa độc lập). Hoặc quay lại tab kia, đóng nó rồi bấm Thử lại.</p>
    <div class="actions"><button id="pb-dup" class="primary"><i class="ti ti-copy-plus"></i> Tạo dự án mới từ video này</button><button id="pb-retry">Thử lại</button><button id="pb-home">Mở dự án khác</button></div>`);
  $('#pb-dup').onclick = async e => {
    e.target.disabled = true; e.target.textContent = 'Đang tạo…';
    const r = await api('/api/project/duplicate', {}).catch(err => ({ error: err.message }));
    if (r.ok && r.id && window.avsProject) return location.replace(window.avsProject.url(r.id));
    e.target.disabled = false; e.target.textContent = 'Tạo dự án mới từ video này'; toast(r.error || 'Chưa tạo được dự án mới');
  };
  $('#pb-retry').onclick = () => location.reload();
  $('#pb-home').onclick = () => { if (!Studio.openHome) return toast('Trang chủ chưa sẵn sàng'); closeModal(); Studio.openHome(); }; // trang chủ che trình chỉnh sửa; mở dự án nào thì trang tải lại
}
async function boot() {
  renderRail();
  const proj = fetch('/api/project'), lib = api('/api/library').catch(() => ({ sfx: [], music: [] }));
  await loadFeatures().catch(e => console.error(e));
  const r = await proj;
  // S18 M129: tab của địa chỉ này đã đóng (hay bị đẩy ra khi quá 8 tab) → mở dự án mặc định thay vì báo lỗi
  if (r.status === 409 && window.avsProject?.id) { location.replace(window.avsProject.url('')); return; }
  if (!r.ok) { modal(`<h3>Chưa mở dự án</h3><p>Chạy <code>node studio/server.mjs &lt;thư mục dự án&gt;</code> hoặc bấm “Video mới”.</p><div class="actions"><button onclick="closeModal()">Đóng</button></div>`); return; }
  const p = await r.json();
  TL = p.timeline; CAP = p.captions; META = p.meta;
  if (META.pid) window.avsProject?.set(META.pid); // S18 M129: mã tab lên thanh địa chỉ, các request sau mang X-AVS-Project
  if (!await holdProject(META.pid || META.dir)) return projectBusy(); // S18 M131: một dự án chỉ sửa ở một tab
  TL.scenes = TL.scenes || [];
  if ((TL.width || 1080) > (TL.height || 1920)) { DW = 1280; DH = 720; SAFE = { x: 60, y: 40, w: 1160, h: 620 }; document.body.classList.add('landscape'); }
  migrateClips();
  $('#ver').textContent = META.version; $('#ptag').textContent = META.name;
  { const k = $('#pkho'); if (k && META.kho) { k.hidden = false; k.textContent = 'Kho ' + (META.kho.brand ? META.kho.title : 'Chung'); k.title = `${khoLabel(META.kho)}\n${META.kho.root}\n${META.dir}`; } }
  for (const a of ['#aspect', '#aspect2']) $(a).textContent = DW > DH ? '16:9' : '9:16';
  $('#durtc').textContent = '/ ' + fmt(TL.duration);
  if (META.audio) voice.src = PB() + META.audio;
  // The waveform can take ffmpeg a few seconds on a new project: draw the editor first, add the wave when it arrives.
  LIB = await lib;
  api('/api/waveform').then(w => { WAVE = Array.isArray(w) ? w : []; renderTimeline(); }).catch(() => {});
  build(); fit(); renderPanel(); renderTimeline(); renderInspector(); loadHistory();
  requestAnimationFrame(() => zoomFit());
  loadThumbs();
  const f = $('#frame');
  const ready = () => {
    win = f.contentWindow; needInit = true; FLU = null; build(); renderPanel(); renderTimeline(); renderInspector(); draw();
    MEDIA_LOAD();
    if (!Studio._isReady) { Studio._isReady = true; loadTabUI(); Studio._ready.splice(0).forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }
    // S16 M118: chỉ áp công thức gói lên bản khởi tạo còn nguyên; timeline đã có cảnh máy dựng (Tự lái, AI dựng, b-roll, QC)
    // hoặc SFX thì bỏ _starter trong bộ nhớ, không áp lại, không lưu (lưu sẽ coi bản xuất là cũ).
    if (TL._starter) {
      const st = TL._starter; delete TL._starter;
      const built = (TL.scenes || []).some(s => s._auto || s._ai || s._qc || s._recipe) || (TL.audio?.sfx || []).length > 0;
      // S26 M181: tiêu đề chỉ là tên file (title_auto) thì thẻ tiêu đề của gói lấy câu đầu lời thoại, không hiện "video-goc"
      const capTitle = () => { const w = CAP.slice(0, 3).flatMap(c => (c.words || []).map(x => x.w).concat(c.words ? [] : String(c.text || '').split(/\s+/))).filter(Boolean).slice(0, 7).join(' '); return w ? w[0].toUpperCase() + w.slice(1) : ''; };
      if (!built) { if (st.title) { TL.title = st.title; if (st.title_auto) TL.title_auto = true; } pushUndo(); applyRecipe(st.pack, (st.title_auto && capTitle()) || st.title, true); saveNow(); }
    }
  };
  if (f.contentWindow?.renderFrame) ready(); else f.addEventListener('load', ready);
}
// S27 M189: mẫu chọn ở hộp Video mới áp sau bản khởi đầu của gói (setTimeout: chạy sau khối _starter ở trên), ⌘Z về bản khởi đầu
Studio.onReady(() => setTimeout(applyPendingTemplate, 0));
boot();
