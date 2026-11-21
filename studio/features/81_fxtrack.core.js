// S28 M206: lõi thuần của track Hiệu ứng (giao diện 81_fxtrack.js). Không DOM: window.FxTrackCore / Node (s28_fxtrack.test.mjs).
// Track đọc ba nguồn, mỗi khối ghi ngược về đúng nguồn của nó (AI / template vẫn ghi TL.fx, TL.grade như cũ):
//   TL.fx    [{ t, type, dur?, amp?, hidden?, locked? }]          → khối nhấn (FX nhóm fx, legacy), phủ cả khung
//   TL.grade [{ t0, t1, mode, hidden?, locked? }]                  → khối "Màu" (GRADES của engine.js), chỉ video chính
//   TL.efx   [{ type, start, end, params, target, hidden?, locked? }] → khối mới (FX.fxApply)
//   blocks(tl)                     → [{ src, obj, type, start, end, params, target, label, icon }]
//   setTimes(src, obj, t0, t1, moved) · setParam(src, obj, name, v) · make(type, t, total) → khối efx mới
//   addApply(tl, p, range, at)     → Claude (75_ask.core.js): thêm một khối vào bản timeline; trả 1 nếu thêm được
//   peekTL(tl, p, at)              → BẢN SAO timeline thêm khối p (dạng của addApply) tại at, để xem thử ±1 s; tl không đổi
//   beatApply(tl, p, times, range) → S28 M210: khối ngắn loại p.type tại mỗi phách mạnh thứ p.every (times = giờ video, BeatsCore)
//                                    trong range { a, b } (thiếu = cả video); khối _beat cũ trong range bị thay; trả số khối đặt
'use strict';
(function (root) {
  const FX = typeof module === 'object' && module.exports ? require('../../engine/fx_registry.js') : root.FX;
  const r2 = v => Math.round(v * 100) / 100;
  // engine/engine.js GRADES (khoá mode → nhãn)
  const GRADE_VI = { normal: 'Màu chuẩn', bw: 'Đen trắng', sad: 'Trầm buồn', mellow: 'Ấm dịu', blur: 'Nhoè nền' };
  const DUR = FX.accentDur();
  const def = id => FX.get('fx', id);
  const legacy = id => !!def(id)?.legacy;
  const fresh = id => !!def(id) && !legacy(id);
  const accentEnd = f => f.t + (f.dur ?? DUR[f.type] ?? .3);

  function blocks(tl) {
    const out = [];
    for (const f of tl?.fx || []) {
      const d = def(f.type);
      out.push({ src: 'fx', obj: f, type: f.type, start: f.t, end: accentEnd(f), params: { dur: f.dur ?? DUR[f.type] ?? .3, ...(f.amp != null ? { amp: f.amp } : {}) },
        target: 'all', label: d?.label || f.type, icon: d?.icon || 'ti-sparkles' });
    }
    for (const g of tl?.grade || []) out.push({ src: 'grade', obj: g, type: 'grade', start: g.t0, end: g.t1, params: { mode: g.mode }, target: 'main', label: 'Màu: ' + (GRADE_VI[g.mode] || g.mode), icon: 'ti-color-filter' });
    for (const e of tl?.efx || []) {
      const d = def(e.type);
      out.push({ src: 'efx', obj: e, type: e.type, start: e.start, end: e.end, params: FX.params('fx', e.type, e.params), target: e.target === 'main' ? 'main' : 'all', label: d?.label || e.type, icon: d?.icon || 'ti-sparkles' });
    }
    return out.sort((a, b) => a.start - b.start);
  }
  // Kéo / kéo mép: nhấn cũ dời thì giữ nguyên dur (không ghi thêm trường), kéo mép mới ghi dur
  function setTimes(src, o, t0, t1, moved) {
    t0 = r2(Math.max(0, t0)); t1 = r2(Math.max(t0 + .05, t1));
    if (src === 'fx') { o.t = t0; if (!moved) o.dur = r2(t1 - t0); }
    else if (src === 'grade') { o.t0 = t0; o.t1 = t1; }
    else { o.start = t0; o.end = t1; }
  }
  function setParam(src, o, name, v) {
    if (src === 'grade') { if (name === 'mode' && GRADE_VI[v]) o.mode = v; return; }
    if (src === 'fx') {
      if (name === 'type' && legacy(v)) { o.type = v; delete o.amp; return; }
      const s = def(o.type)?.params?.[name]; if (!s || !Number.isFinite(+v)) return;
      o[name] = r2(Math.min(s.max, Math.max(s.min, +v))); return;
    }
    if (name === 'type') { if (fresh(v)) { o.type = v; o.params = FX.params('fx', v, o.params); } return; }
    if (name === 'target') { o.target = v === 'main' ? 'main' : 'all'; return; }
    const s = def(o.type)?.params?.[name]; if (!s || !Number.isFinite(+v)) return;
    o.params = { ...(o.params || {}), [name]: Math.round(Math.min(s.max, Math.max(s.min, +v)) * 1000) / 1000 };
  }
  function make(type, t, total, dur = 2, target = 'all') {
    const start = r2(Math.max(0, Math.min(t, (total || 1e9) - .2)));
    return { type, start, end: r2(Math.min(total || 1e9, start + dur)), params: FX.params('fx', type, {}), target: target === 'main' ? 'main' : 'all' };
  }
  // Claude: p = { type, dur?, intensity?, speed?, range?, amp?, target? }; range = { a, b } của phạm vi đoạn; at = playhead
  function addApply(tl, p, range, at = 0) {
    if (!p?.type || !def(p.type)) return 0;
    const total = tl.duration || 1e9, t = r2(Math.max(0, range ? range.a : at));
    if (legacy(p.type)) {
      const f = { t, type: p.type };
      f.dur = r2(p.dur != null ? +p.dur : range ? Math.max(.1, Math.min(4, range.b - range.a)) : DUR[p.type]);
      if (p.amp != null && def(p.type).params.amp) f.amp = +p.amp;
      (tl.fx ||= []).push(f); return 1;
    }
    const dur = range ? Math.max(.2, range.b - range.a) : Math.max(.2, +p.dur || 2);
    const b = make(p.type, t, total, dur, p.target);
    for (const k of ['intensity', 'speed', 'range']) if (p[k] != null) setParam('efx', b, k, p[k]);
    (tl.efx ||= []).push(b); return 1;
  }
  function peekTL(tl, p, at) {
    const o = JSON.parse(JSON.stringify(tl));
    if (p) addApply(o, p, null, at);
    return o;
  }
  // Nhấn cũ (shake, punch, flash…) dùng dur mặc định của nó; hiệu ứng mới mặc định 0,4 s. Hai khối cách nhau ≥ dur + 0,05 s để không
  // chồng; tối đa BEAT_MAX khối mỗi lần. p.tag (vd { _ai: true }) gắn thêm vào từng khối (AI dựng thay được lần sau).
  const BEAT_MAX = 60;
  const BEAT_TYPES = FX.list('fx').filter(x => x.legacy || x.group === 'light' || x.id === 'mirror').map(x => x.id).filter(id => id !== 'push' && id !== 'mono'); // khối ngắn hợp nhịp
  function beatApply(tl, p, times, range) {
    if (!p?.type || !def(p.type) || !tl) return 0;
    const total = tl.duration || 1e9, a = range ? Math.max(0, +range.a || 0) : 0, b = range ? Math.min(total, +range.b) : total;
    if (!(b > a)) return 0;
    const every = Math.max(1, Math.min(8, Math.round(+p.every || 1))), old = legacy(p.type);
    const dur = r2(Math.max(.1, Math.min(old ? 4 : 2, +p.dur || (old ? DUR[p.type] ?? .3 : .4))));
    const inR = t => t >= a - 1e-6 && t < b - .05;
    tl.fx = (tl.fx || []).filter(f => !(f._beat && !f.locked && !f._orig && inR(f.t)));
    tl.efx = (tl.efx || []).filter(e => !(e._beat && !e.locked && !e._orig && inR(e.start)));
    if (!tl.efx.length) delete tl.efx;
    const list = [...new Set((times || []).map(Number).filter(t => Number.isFinite(t) && inR(t)))].sort((x, y) => x - y);
    let n = 0, last = -1e9;
    list.forEach((t, i) => {
      if (i % every || n >= BEAT_MAX || t - last < dur + .05 || t > total - .1) return;
      const tag = { _beat: true, ...(p.tag || {}) };
      if (old) {
        const f = { t: r2(t), type: p.type, ...(p.dur != null ? { dur } : {}), ...tag };
        if (p.amp != null && def(p.type).params.amp) { const s = def(p.type).params.amp; f.amp = r2(Math.min(s.max, Math.max(s.min, +p.amp))); }
        (tl.fx ||= []).push(f);
      } else {
        const e = Object.assign(make(p.type, t, total, Math.min(dur, b - t), p.target), tag);
        for (const k of ['intensity', 'speed', 'range']) if (p[k] != null) setParam('efx', e, k, p[k]);
        (tl.efx ||= []).push(e);
      }
      last = t; n++;
    });
    return n;
  }
  const api = { GRADE_VI, BEAT_MAX, BEAT_TYPES, blocks, setTimes, setParam, make, addApply, peekTL, beatApply, legacy, fresh };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FxTrackCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
