// AI Video Studio — main track (TL.clips, spec: references/clips.md).
// Layout, migration from TL.aroll, and ripple edits: every clip edit remaps the OUTPUT times of captions
// (and their words), scenes (incl. nested absolute times), sfx, music, fx, grade/zoom ranges.
'use strict';

// Shared helpers (loaded first; used by library.js and studio.js).
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const r2 = v => Math.round(v * 100) / 100;
const r3 =v => Math.round(v * 1000) / 1000;
const deep = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'cid' || k === '_orig' ? undefined : v)));
// S29 M207: thời lượng / giây nguồn theo tốc độ đều, đường cong, ngược, đứng hình: SpeedMap (engine/speed.js, chung với engine)
const clipDur = c => SpeedMap.dur(c, 30);
const srcLen = c => (typeof c.src === 'string' ? Infinity : (c.src?.count || 1) / (c.src?.fps || 30));
// S28 M202: chuyển cảnh, bộ lọc, hoạt ảnh chữ đọc từ engine/fx_registry.js (window.FX, nạp trước file này ở studio/index.html)
const TRANS_TYPES = FX.transTypes(); // [id, nhãn, icon]
const FILTERS = FX.filters(); // [preset, nhãn], '' = Gốc
const LUT_CSS = FX.lutCss();

function clipLayout() {
  let t = 0;
  return (TL.clips || []).map((c, i) => { const d = c.hidden ? 0 : clipDur(c); const k = { c, i, t0: t, t1: t + d }; t += d; return k; });
}
const clipsTotal = () => clipLayout().reduce((a, k) => Math.max(a, k.t1), 0);
function clipAtT(t) { const L = clipLayout().filter(k => k.t1 > k.t0); return L.find(k => t >= k.t0 - 1e-6 && t < k.t1) || L[L.length - 1] || null; }
// Source time inside clip k at output time t.
const srcAt = (k, t) => SpeedMap.srcAt(k.c, t - k.t0);
function clipFrameUrl(c, st) {
  if (!c?.src) return '';
  if (typeof c.src === 'string') return '/project/' + c.src;
  const fps = c.src.fps || 30, n = Math.min(c.src.count || 1e9, Math.max(1, Math.floor(st * fps + 1e-6) + 1));
  return '/project/' + c.src.seq.replace(/%0(\d)d/, (_, w) => String(n).padStart(+w, '0'));
}
// S29 M208: một nguồn với engine (FX.colorFx): thumbnail bỏ blur và lớp SVG (vùng sáng / tối, nét) như trước
function clipFilterCss(c) { return FX.colorCss(c?.filter, { blur: false }) || 'none'; }

// Old single-take projects → one clip covering the A-roll (TL.aroll stays for compatibility).
function migrateClips() {
  if (TL.clips?.length || !TL.aroll?.frames) return false;
  const fps = TL.fps || 30, count = META.frames || Math.round((TL.duration || 0) * fps);
  if (!count) return false;
  const out = r3(Math.min(count / fps, TL.duration || Infinity));
  TL.clips = [{ src: { seq: TL.aroll.frames, fps, count }, ...(TL.audio?.voice || META.audio ? { audio: TL.audio?.voice || META.audio } : {}), in: 0, out,
    ...(TL.aroll.cutouts ? { cutouts: TL.aroll.cutouts } : {}) }];
  return true;
}

// ---------- time remapping ----------
const ABS_KEYS = new Set(['t', 'out', 't0', 't1', 'reveal_t', 'strike_at', 'highlight_t']);
function mapScene(s, f) {
  const walk = (o, top) => {
    if (Array.isArray(o)) return o.forEach(x => walk(x, false));
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (k === '_orig' || k === 'cid') continue;
      if (!top && ABS_KEYS.has(k) && typeof v === 'number') o[k] = r2(f(v));
      else if (v && typeof v === 'object') walk(v, false);
    }
  };
  walk(s, true);
  s.t0 = r2(f(s.t0)); s.t1 = r2(f(s.t1));
  if (s.t1 < s.t0) [s.t0, s.t1] = [s.t1, s.t0]; // cảnh trong clip vừa đảo ngược
}
const fRemove = (a, b) => t => (t <= a ? t : t >= b ? t - (b - a) : a);
const fInsert = (p, d) => t => (t < p - 1e-6 ? t : t + d);
const fScale = (a, d0, d1) => t => (t <= a ? t : t >= a + d0 - 1e-6 ? t + (d1 - d0) : a + (t - a) * d1 / d0);
// Clip k đổi từ bản `old` sang k.c (tốc độ, đường cong, ngược, điểm vào/ra): giờ trong clip đi theo giây nguồn, phía sau dồn theo thời lượng mới.
function fClip(k, old) {
  const d0 = k.t1 - k.t0, d1 = clipDur(k.c);
  return t => (t <= k.t0 ? t : t >= k.t1 - 1e-6 ? t + (d1 - d0) : k.t0 + clamp(SpeedMap.ltAt(k.c, SpeedMap.srcAt(old, t - k.t0)), 0, d1));
}
// Apply f to every output time in the project. cut=[a,b] drops what lies inside the removed span.
function remapAll(f, cut) {
  const inCut = t => cut && t > cut[0] + 1e-3 && t < cut[1] - 1e-3;
  const span = (o, k0 = 't0', k1 = 't1') => { o[k0] = r2(f(o[k0])); o[k1] = r2(f(o[k1])); if (o[k1] < o[k0]) [o[k0], o[k1]] = [o[k1], o[k0]]; return o[k1] - o[k0] > .04; };
  CAP = CAP.filter(c => {
    c.words = (c.words || []).filter(w => !inCut((w.s + w.e) / 2));
    if (!c.words.length) return false;
    for (const w of c.words) { w.s = r2(f(w.s)); w.e = r2(f(w.e)); if (w.e < w.s) [w.s, w.e] = [w.e, w.s]; }
    c.words.sort((a, b) => a.s - b.s);
    const a = f(c.t0), b = f(c.t1);
    c.t0 = r2(Math.min(a, b, c.words[0].s)); c.t1 = r2(Math.max(a, b, c.words[c.words.length - 1].e));
    return c.t1 - c.t0 > .04;
  });
  TL.scenes = (TL.scenes || []).filter(s => {
    if (cut && s.t0 >= cut[0] - 1e-3 && s.t1 <= cut[1] + 1e-3) return false;
    mapScene(s, f); return s.t1 - s.t0 > .04;
  });
  const A = TL.audio || {};
  if (A.sfx) A.sfx = A.sfx.filter(x => !inCut(x.t) && ((x.t = r2(f(x.t))), true));
  if (A.music) A.music = A.music.filter(m => span(m));
  if (TL.fx) TL.fx = TL.fx.filter(x => !inCut(x.t) && ((x.t = r2(f(x.t))), true));
  for (const k of ['grade', 'zoom', 'captionsHide']) if (Array.isArray(TL[k])) TL[k] = TL[k].filter(r => span(r));
  CAP.sort((a, b) => a.t0 - b.t0);
}
// Duration = main track + the tail of any scene that ends after it (end cards).
function fixDuration() {
  if (!TL.clips?.length) return;
  const end = Math.max(clipsTotal(), ...(TL.scenes || []).filter(s => !s.hidden).map(s => s.t1 || 0));
  TL.duration = r2(end);
  for (const m of TL.audio?.music || []) if (m.t1 > TL.duration) m.t1 = TL.duration;
}

// ---------- operations ----------
function splitClipAt(t) {
  const k = clipAtT(t);
  if (!k) return null;
  if (t - k.t0 < 2 / 30 || k.t1 - t < 2 / 30) return null;
  const c = k.c, cut = r3(srcAt(k, t)), b = deep(c);
  delete b.transition;
  if (c.hold != null) { c.hold = r3(t - k.t0); b.hold = r3(k.t1 - t); }
  else {
    if (c.speedCurve) { const u = clamp(SpeedMap.fwd(c, t - k.t0) / (SpeedMap.span(c) || 1), 0, 1); b.speedCurve = SpeedMap.subCurve(c.speedCurve, u, 1); c.speedCurve = SpeedMap.subCurve(c.speedCurve, 0, u); }
    if (c.reverse) { c.in = cut; b.out = cut; } else { b.in = cut; c.out = cut; } // ngược: nửa đầu phát phần nguồn phía sau
  }
  if (c.kf?.length && window.KF) { const [x, y] = KF.split(c.kf, t - k.t0); if (x?.length) c.kf = x; else delete c.kf; if (y?.length) b.kf = y; else delete b.kf; } // S29 M209: key theo giây trong clip
  TL.clips.splice(k.i + 1, 0, b);
  return b;
}
function deleteClip(i) {
  if ((TL.clips || []).length <= 1) return false;
  const k = clipLayout()[i];
  TL.clips.splice(i, 1);
  if (TL.clips[0]) delete TL.clips[0].transition;
  remapAll(fRemove(k.t0, k.t1), [k.t0, k.t1]);
  fixDuration();
  return true;
}
function duplicateClip(i) {
  const k = clipLayout()[i], cp = deep(k.c);
  TL.clips.splice(i + 1, 0, cp);
  remapAll(fInsert(k.t1, k.t1 - k.t0));
  fixDuration();
  return cp;
}
function insertClipAt(clip, t) {
  const L = clipLayout();
  // nearest boundary to t
  let idx = L.length, at = L.length ? L[L.length - 1].t1 : 0, best = Infinity;
  for (const k of L) for (const [b, j] of [[k.t0, k.i], [k.t1, k.i + 1]]) if (Math.abs(b - t) < best) { best = Math.abs(b - t); idx = j; at = b; }
  TL.clips.splice(idx, 0, clip);
  remapAll(fInsert(at, clipDur(clip)));
  fixDuration();
  return at;
}
// Ripple trim. edge 'l'|'r', d = output-time delta of that edge (positive = to the right).
function trimClip(i, edge, d) {
  const k = clipLayout()[i], c = k.c, sp = c.speed || 1, min = 2 / 30 * sp;
  if (!SpeedMap.plain(c)) { // đường cong / ngược / đứng hình: đổi đoạn nguồn rồi dồn theo giây nguồn (không cắt bỏ phụ đề)
    const old = deep(c), d0 = k.t1 - k.t0;
    if (c.hold != null) { c.hold = r3(clamp((+c.hold || 0) + (edge === 'r' ? d : -d), .1, 60)); remapAll(fScale(k.t0, d0, clipDur(c))); fixDuration(); return; }
    const avg = SpeedMap.span(c) / d0 || 1, ds = (edge === 'r' ? d : -d) * avg; // ds > 0 = dài thêm
    const atIn = (edge === 'r') === !!c.reverse; // mép đang kéo là điểm vào của nguồn
    return setClipRange(i, atIn ? 'in' : 'out', atIn ? (c.in || 0) - ds : (c.out ?? 3) + ds, old);
  }
  if (edge === 'r') {
    const nOut = clamp((c.out ?? 3) + d * sp, (c.in || 0) + min, srcLen(c)), dd = (nOut - (c.out ?? 3)) / sp;
    c.out = r3(nOut);
    if (dd < 0) remapAll(fRemove(k.t1 + dd, k.t1), [k.t1 + dd, k.t1]); else if (dd > 0) remapAll(fInsert(k.t1, dd));
  } else {
    const nIn = clamp((c.in || 0) + d * sp, 0, (c.out ?? 3) - min), dd = (nIn - (c.in || 0)) / sp;
    c.in = r3(nIn);
    if (dd > 0) remapAll(fRemove(k.t0, k.t0 + dd), [k.t0, k.t0 + dd]); else if (dd < 0) remapAll(fInsert(k.t0, -dd));
  }
  fixDuration();
}
function setClipSpeed(i, sp) {
  const k = clipLayout()[i], old = deep(k.c);
  delete k.c.speedCurve; // tốc độ đều thay đường cong
  k.c.speed = clamp(+sp, .25, 4); if (k.c.speed === 1) delete k.c.speed;
  remapClip(k, old);
}
// S29 M207 ---------- đường cong tốc độ, ngược, đứng hình ----------
// Dòng phụ đề (và từ) vắt qua mép clip sắp đảo chiều: tách tại mép, nếu không phần trong clip nhảy sang đầu kia và dòng phủ cả clip,
// chồng lên các dòng khác (nghiệm thu S28). Chỉ tách giữa hai từ, giữ mọi trường khác của dòng.
function splitCapsAt(ts) {
  for (const t of ts) {
    const out = [];
    for (const c of CAP) {
      // từ vắt qua mép: kẹp về phía chứa giữa từ (lệch 1 ms để mốc không rơi đúng mép, nơi fClip không ánh xạ)
      for (const w of c.words || []) if (w.s < t && w.e > t) { if ((w.s + w.e) / 2 < t) w.e = Math.max(w.s, t - .001); else w.s = Math.min(w.e, t + .001); }
      const ws = c.words || [], j = ws.findIndex(w => (w.s + w.e) / 2 >= t);
      if (j <= 0 || (ws[0].s + ws[0].e) / 2 >= t) {
        if (ws.length && c.t0 < t && c.t1 > t) { if (j < 0) c.t1 = Math.min(c.t1, Math.max(t - .001, ws[ws.length - 1].e)); else c.t0 = Math.max(c.t0, Math.min(t + .001, ws[0].s)); } // mép dòng vắt qua
        out.push(c); continue;
      }
      const a = { ...c, words: ws.slice(0, j) }, b = { ...c, words: ws.slice(j) };
      a.t1 = a.words[a.words.length - 1].e; b.t0 = b.words[0].s; // mép dòng theo từ: mốc đúng mép clip không được ánh xạ (fClip giữ t ≤ t0)
      out.push(a, b);
    }
    CAP = out;
  }
}
function remapClip(k, old) {
  if (!!old.reverse !== !!k.c.reverse) splitCapsAt([k.t0, k.t1]);
  remapAll(fClip(k, old));
  fixDuration();
}
// pts: tên preset (SpeedMap.PRESETS) | [{x, y}] | null = về tốc độ đều
function setClipCurve(i, pts) {
  const k = clipLayout()[i], c = k?.c; if (!c || c.hold != null) return false;
  const old = deep(c);
  if (pts == null || pts === '') delete c.speedCurve;
  else if (typeof pts === 'string') { if (!SpeedMap.PRESETS[pts]) return false; c.speedCurve = pts; }
  else { const p = SpeedMap.norm(pts); if (!p) return false; c.speedCurve = p.map(q => ({ x: r3(q.x), y: r3(q.y) })); }
  if (c.speedCurve) delete c.speed;
  remapClip(k, old);
  return true;
}
function setClipReverse(i, on) {
  const k = clipLayout()[i], c = k?.c; if (!c || c.hold != null || typeof c.src === 'string') return false;
  const old = deep(c);
  if (on) c.reverse = true; else delete c.reverse;
  remapClip(k, old);
  return true;
}
// Điểm vào / ra (giây nguồn) của clip không phải tốc độ đều: giữ phụ đề theo giây nguồn.
function setClipRange(i, f, v, old) {
  const k = clipLayout()[i], c = k.c; old = old || deep(c);
  const min = 2 / 30 * Math.max(1, SpeedMap.span(c) / (k.t1 - k.t0 || 1));
  if (f === 'in') c.in = r3(clamp(+v, 0, (c.out ?? 3) - min)); else c.out = r3(clamp(+v, (c.in || 0) + min, srcLen(c)));
  remapClip(k, old);
}
// Freeze: chèn clip đứng hình d giây giữ nguyên khung tại t (tách clip nếu t ở giữa). Trả clip mới hoặc null.
function freezeAt(t, d = 3) {
  const k = clipAtT(t); if (!k || typeof k.c.src === 'string' || k.c.hold != null) return null;
  const s = r3(srcAt(k, Math.min(t, k.t1 - 1e-3))), fr = deep(k.c);
  for (const key of ['transition', 'speed', 'speedCurve', 'reverse', 'keys']) delete fr[key];
  Object.assign(fr, { in: s, out: s, hold: r3(clamp(+d || 3, .1, 60)) });
  let idx = k.i + 1, at = t;
  if (t - k.t0 < 2 / 30) { idx = k.i; at = k.t0; } else if (k.t1 - t < 2 / 30) at = k.t1; else splitClipAt(t);
  TL.clips.splice(idx, 0, fr);
  remapAll(fInsert(at, fr.hold));
  fixDuration();
  return fr;
}
// Reorder: clip i → index j. Captions/sfx/scenes that live inside a moved clip move with it.
function moveClip(i, j) {
  if (i === j) return;
  const L0 = clipLayout(), c = TL.clips[i];
  TL.clips.splice(i, 1); TL.clips.splice(j > i ? j - 1 : j, 0, c);
  delete TL.clips[0].transition;
  const L1 = clipLayout(), newOf = new Map(L1.map(k => [k.c, k]));
  const idxAt = t => L0.findIndex(k => t >= k.t0 - 1e-6 && t < k.t1);
  const f = t => { const n = idxAt(t); if (n < 0) return t; const k0 = L0[n], k1 = newOf.get(k0.c); return k1.t0 + (t - k0.t0); };
  // captions: split each caption by source clip, then map each part
  const caps = [];
  for (const cap of CAP) {
    const groups = new Map();
    for (const w of cap.words) { const n = idxAt((w.s + w.e) / 2); if (!groups.has(n)) groups.set(n, []); groups.get(n).push(w); }
    for (const ws of groups.values()) {
      const part = groups.size === 1 ? cap : { ...deep(cap), words: ws };
      for (const w of part.words) { const m = f((w.s + w.e) / 2) - (w.s + w.e) / 2; w.s = r2(w.s + m); w.e = r2(w.e + m); }
      const m0 = f(groups.size === 1 ? cap.t0 : ws[0].s) - (groups.size === 1 ? cap.t0 : ws[0].s);
      if (groups.size === 1) { part.t0 = r2(cap.t0 + m0); part.t1 = r2(cap.t1 + m0); } else { part.t0 = ws[0].s; part.t1 = ws[ws.length - 1].e; }
      part.t0 = Math.min(part.t0, part.words[0].s); part.t1 = Math.max(part.t1, part.words[part.words.length - 1].e);
      caps.push(part);
    }
  }
  CAP = caps.sort((a, b) => a.t0 - b.t0);
  for (const s of TL.scenes || []) {
    const a = idxAt(s.t0), b = idxAt(Math.max(s.t0, s.t1 - 1e-3));
    if (a >= 0 && a === b) { const d = f(s.t0) - s.t0; if (Math.abs(d) > 1e-4) mapScene(s, t => t + d); }
  }
  for (const x of TL.audio?.sfx || []) x.t = r2(f(x.t));
  for (const x of TL.fx || []) x.t = r2(f(x.t));
}
