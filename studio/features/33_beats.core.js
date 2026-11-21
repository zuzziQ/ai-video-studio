// S28 M210 · Lõi vạch nhịp (không DOM; Studio nạp như feature, node --test nạp qua require). Feature: 33_beats.js, route 33_beats.mjs.
//   parse(raw)                 → { bpm, t:[s], strong:[s], dur } từ JSON của scripts/beats.py ({bpm, beats, downbeats, dur}); null nếu hỏng
//   grid(music, level, end)    → [{ t, strong }] theo thời gian VIDEO, từ mọi khối nhạc có m.beats (giờ nguồn): t = m.t0 + (b − offset),
//                                 nhạc lặp lại (mix_audio.py -stream_loop -1) thì nhịp lặp theo m.beats.dur; level 'bar' (1/1, chỉ phách mạnh),
//                                 'half' (1/2 ô nhịp), 'beat' (mỗi phách)
//   snapTimes(grid)            → mốc cho nam châm (Studio._snap)
//   cutPoints(t0, t1, grid, o) → mốc cắt nằm trong (t0, t1), cách mép và cách nhau ≥ o.gap (mặc định 2 khung)
//   brief(music, end)          → { bpm, strong:[s ≤ 40 mốc] } cho prompt AI dựng / Hỏi Claude; null khi chưa có nhịp
// Nhịp lưu TRÊN từng khối nhạc (TL.audio.music[i].beats, giờ nguồn của file) để kéo / cắt khối nhạc thì vạch đi theo.
'use strict';
(function (root) {
  const r3 = v => Math.round(v * 1000) / 1000;
  const LEVELS = ['bar', 'half', 'beat'];
  const nums = a => (Array.isArray(a) ? a : []).map(Number).filter(v => Number.isFinite(v) && v >= 0).sort((x, y) => x - y);
  function parse(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const t = nums(raw.beats ?? raw.t).map(r3), bpm = +raw.bpm;
    if (!t.length || !(bpm > 20 && bpm < 400)) return null;
    const set = new Set(t), strong = nums(raw.downbeats ?? raw.strong).map(r3).filter(v => set.has(v));
    const dur = +raw.dur > 0 ? r3(+raw.dur) : 0;
    return { bpm: Math.round(bpm * 10) / 10, t, strong, ...(dur ? { dur } : {}) };
  }
  // vị trí của từng phách trong ô nhịp: 0 tại phách mạnh, đếm lên; trước phách mạnh đầu tiên thì đếm ngược từ nó
  function phases(b) {
    const strong = new Set(b.strong || []), out = new Array(b.t.length).fill(-1);
    let k = -1;
    b.t.forEach((v, i) => { if (strong.has(v)) k = 0; else if (k >= 0) k++; out[i] = k; });
    const first = out.indexOf(0);
    if (first > 0) for (let i = first - 1, n = 1; i >= 0; i--, n++) out[i] = (4 - (n % 4)) % 4;
    if (first < 0) out.forEach((_, i) => { out[i] = i % 4; }); // không có phách mạnh: coi phách đầu là phách 1
    return out;
  }
  const keep = (lv, ph) => lv === 'bar' ? ph === 0 : lv === 'half' ? ph % 2 === 0 : true;
  function grid(music, level = 'beat', end = Infinity) {
    const lv = LEVELS.includes(level) ? level : 'beat', out = [];
    for (const m of music || []) {
      const b = m && !m.hidden ? parse(m.beats) : null; if (!b) continue; // timeline.json sửa tay / nhận từ máy khác: chỉ số hợp lệ
      const t0 = +m.t0 || 0, t1 = Math.min(+m.t1 || 0, end), off = +m.offset || 0, loop = +b.dur > 1 ? +b.dur : 0;
      if (!(t1 > t0)) continue;
      const ph = phases(b), strong = new Set(b.strong || []);
      // giờ nguồn liên tục s = off + (t − t0); file lặp thì vị trí trong file = s mod loop → phách v của vòng k ở s = v + k·loop
      for (let k = 0; k < 2000; k++) {
        const base = t0 - off + k * (loop || 0);
        if (k && (!loop || base > t1)) break;
        for (let i = 0; i < b.t.length; i++) {
          const v = b.t[i]; if (k && v >= loop) break;
          const t = r3(base + v);
          if (t > t1 + 1e-6) break;
          if (t >= t0 - 1e-6 && keep(lv, ph[i])) out.push({ t, strong: strong.has(v) });
        }
      }
    }
    out.sort((a, b) => a.t - b.t);
    const merged = []; // hai khối nhạc chồng nhau: mốc gần nhau gộp một, giữ "mạnh"
    for (const x of out) { const p = merged[merged.length - 1]; if (p && x.t - p.t < 0.01) p.strong = p.strong || x.strong; else merged.push({ ...x }); }
    return merged;
  }
  const snapTimes = g => (g || []).map(x => x.t);
  function cutPoints(t0, t1, g, o = {}) {
    const gap = o.gap ?? 2 / 30, list = (g || []).filter(x => (!o.strong || x.strong) && x.t > t0 + gap && x.t < t1 - gap).map(x => x.t);
    const every = Math.max(1, Math.round(+o.every || 1)), out = [];
    list.forEach((t, i) => { if (i % every) return; if (out.length && t - out[out.length - 1] < gap) return; out.push(t); });
    return out;
  }
  function brief(music, end = Infinity) {
    const withB = (music || []).filter(m => m && !m.hidden && parse(m.beats));
    if (!withB.length) return null;
    const g = grid(withB, 'beat', end), strong = g.filter(x => x.strong).map(x => x.t);
    return { bpm: parse(withB[0].beats).bpm, strong: (strong.length ? strong : g.filter((_, i) => i % 4 === 0).map(x => x.t)).slice(0, 40) };
  }
  const api = { LEVELS, parse, phases, grid, snapTimes, cutPoints, brief };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BeatsCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
