// S28 M210 · Vạch nhịp và hít nhịp (docs/plans/S28-edit-kieu-capcut.md mục 4 `M210`; lõi 33_beats.core.js, route 33_beats.mjs).
//   Thuộc tính khối nhạc → tab "Nhịp": Phân tích nhịp (job nền `beats` → scripts/beats.py), mức vạch 1/1 · 1/2 · mỗi phách, Xoá nhịp.
//   Nhịp gắn vào khối nhạc (TL.audio.music[i].beats, giờ nguồn của file) một bước hoàn tác; vạch vẽ trong khối nhạc trên timeline
//   (phách mạnh đậm hơn); nam châm bật thì mép clip / element / chỗ nối hít vào vạch đang hiện (Studio._snap).
//   Nút "Cắt theo nhịp" cạnh nút tách: chia clip đang chọn (không thì clip tại playhead) tại các vạch trong khoảng của nó, một bước hoàn tác.
//   Hiệu ứng theo nhịp (tab Nhịp): khối Hiệu ứng ngắn (track Hiệu ứng M206, FxTrackCore.beatApply) tại mỗi phách mạnh thứ N
//   trong khoảng của khối nhạc đang chọn, một bước hoàn tác; bấm lại thay khối theo nhịp cũ chưa sửa tay. Hỏi Claude: việc fx_beats.
'use strict';
(function () {
  const S = window.Studio, BC = window.BeatsCore; if (!S || !BC) return;
  const LV = [['bar', '1/1', 'Mỗi ô nhịp (phách mạnh)'], ['half', '1/2', 'Nửa ô nhịp'], ['beat', 'Phách', 'Mỗi phách']];
  const KEY = 'avs.beatLevel';
  let level = 'beat';
  try { const v = localStorage.getItem(KEY); if (BC.LEVELS.includes(v)) level = v; } catch { /* không có localStorage */ }
  const music = () => S.TL?.audio?.music || [];
  const srcOf = m => (m.file ? { file: m.file } : m.mood ? { mood: m.mood } : null);
  const sameSrc = (a, b) => !!a && !!b && (a.file ? a.file === b.file : a.mood === b.mood && !b.file);
  // lưới theo giờ video, tính lại khi nhạc / mức đổi (nam châm gọi mỗi lần kéo chuột)
  let memo = { k: '', g: [] };
  function grid() {
    const list = music(), k = level + '|' + (S.TL?.duration || 0) + '|' + list.map(m => [m.t0, m.t1, m.offset || 0, m.hidden ? 1 : 0, m.beats?.t?.length || 0, m.beats?.bpm || 0, m.beats?.dur || 0, m.beats?.strong?.length || 0, m.file || m.mood || ''].join(',')).join(';');
    if (k !== memo.k) memo = { k, g: BC.grid(list, level, S.TL?.duration || Infinity) };
    return memo.g;
  }
  S._snap.push(() => BC.snapTimes(grid()));
  // phách mạnh (giờ video) của mọi khối nhạc có nhịp, không phụ thuộc mức vạch đang xem: hiệu ứng theo nhịp, Hỏi Claude (fx_beats)
  const strongTimes = () => BC.grid(music(), 'beat', S.TL?.duration || Infinity).filter(x => x.strong).map(x => x.t);
  S.beatTimes = strongTimes;

  // ---------- vạch trong khối nhạc ----------
  S._blk.push((c, pps) => {
    if (c.kind !== 'music' || !c.obj.beats) return '';
    const g = BC.grid([c.obj], level, S.TL?.duration || Infinity);
    if (g.length * 3 > (c.t1 - c.t0) * pps) return `<i class="bmk-dense" title="Phóng to timeline để thấy vạch nhịp"></i>`; // dày hơn 3 px / vạch: không vẽ
    return g.map(x => `<i class="bmk${x.strong ? ' s' : ''}" data-bmx="${((x.t - c.t0) * pps).toFixed(1)}"></i>`).join('');
  });
  const place = root => root.querySelectorAll('.bmk[data-bmx]').forEach(d => d.style.setProperty('--bm-x', d.dataset.bmx + 'px'));
  S.onReady(() => {
    const tl = document.querySelector('#tlinner'); if (!tl) return;
    place(tl); new MutationObserver(() => place(tl)).observe(tl, { childList: true, subtree: true });
    const sp = document.querySelector('#tsplit');
    if (sp && !document.querySelector('#tbeatcut')) {
      const b = document.createElement('button');
      b.className = 'icon'; b.id = 'tbeatcut'; b.title = 'Cắt theo nhịp: chia clip đang chọn tại các vạch nhịp'; b.setAttribute('aria-label', 'Cắt theo nhịp');
      b.innerHTML = '<i class="ti ti-slice"></i>'; b.addEventListener('click', cutByBeats); sp.after(b);
    }
  });

  // ---------- cắt theo nhịp ----------
  function cutByBeats() {
    if (!S.TL.clips?.length) return S.toast('Chưa có clip');
    if (S.trackLocked({ track: 'video' })) return S.toast('Track video đang khoá');
    const g = grid(); if (!g.length) return S.toast('Chưa có nhịp: chọn khối nhạc → tab Nhịp → Phân tích nhịp');
    const L = clipLayout(), k = S.sel?.kind === 'clip' ? L[S.sel.idx] : clipAtT(S.T);
    if (!k) return S.toast('Chọn một clip trên track chính');
    const cuts = BC.cutPoints(k.t0, k.t1, g, { gap: 2 / (S.TL.fps || 30) });
    if (!cuts.length) return S.toast('Không có vạch nhịp nào trong clip này');
    S.pushUndo();
    let n = 0; for (const t of cuts) if (splitClipAt(t)) n++;
    if (!n) { S.toast('Không cắt được'); return; }
    S.changed(true); S.select(S.compOf(S.TL.clips[k.i]));
    S.toast(`Đã chia clip thành ${n + 1} đoạn theo nhịp`);
  }
  S.cutByBeats = cutByBeats;

  // ---------- tab Nhịp của khối nhạc ----------
  const ST = { busy: new Map() }; // khoá nguồn → chữ trạng thái
  const keyOf = src => src ? (src.file ? 'f:' + src.file : 'm:' + src.mood) : '';
  S.addInspectorTab(c => {
    if (c.kind !== 'music') return null;
    const m = c.obj, src = srcOf(m), b = BC.parse(m.beats), busy = ST.busy.get(keyOf(src));
    const lv = LV.map(([k, l, t]) => `<button data-bmlv="${k}" class="${k === level ? 'on' : ''}" title="${t}">${l}</button>`).join('');
    const body = !src ? '<div class="help">Khối nhạc chưa có file.</div>'
      : `${b ? `<div class="help"><b>${b.bpm} BPM</b> · ${b.t.length} phách, ${b.strong.length} phách mạnh</div>` : '<div class="help">Tìm phách trong bài để vạch nhịp hiện trên track nhạc và các mép hít vào nhịp.</div>'}
        <div class="bmrow"><button data-bmact="run" ${busy ? 'disabled' : ''}><i class="ti ti-wave-sine"></i>${busy ? S.esc(busy) : b ? 'Phân tích lại' : 'Phân tích nhịp'}</button>${b ? '<button data-bmact="clear" title="Bỏ nhịp của khối này"><i class="ti ti-trash"></i></button>' : ''}</div>
        <div class="bmrow" role="group" aria-label="Mức vạch nhịp"><span class="lbl">Vạch</span>${lv}</div>
        <div class="help">Nam châm bật thì kéo clip, chữ, hình hít vào vạch. Chọn clip rồi bấm <i class="ti ti-slice"></i> cạnh nút tách để cắt theo nhịp.</div>
        ${b ? `<span class="lbl">Hiệu ứng theo nhịp</span><div class="bmrow"><select data-bmfx aria-label="Loại hiệu ứng">${fxOpts()}</select>
          <select data-bmevery aria-label="Mỗi mấy phách mạnh">${[1, 2, 4].map(n => `<option value="${n}" ${n === fxEvery ? 'selected' : ''}>${n === 1 ? 'Mỗi phách mạnh' : `Mỗi ${n} phách mạnh`}</option>`).join('')}</select>
          <button data-bmact="fx" title="Đặt khối Hiệu ứng ngắn tại các phách mạnh trong khối nhạc này (bấm lại thì thay)"><i class="ti ti-sparkles"></i>Đặt</button></div>` : ''}`;
    return ['beats', 'Nhịp', S.sect('Nhịp nhạc', body, 'ti-wave-sine')];
  });
  // ---------- hiệu ứng theo nhịp ----------
  const FT = () => window.FxTrackCore; // 81_fxtrack.core.js nạp sau file này
  let fxType = 'punch', fxEvery = 2;
  const fxOpts = () => (window.FX?.list('fx') || []).map(x => `<option value="${x.id}" ${x.id === fxType ? 'selected' : ''}>${S.esc(x.label)}</option>`).join('');
  function fxOnBeats(m) {
    if (!FT()) return S.toast('Chưa có track Hiệu ứng');
    if (S.trackLocked?.({ track: 'efx' })) return S.toast('Track Hiệu ứng đang khoá');
    const times = strongTimes().filter(t => t >= m.t0 && t < m.t1);
    if (!times.length) return S.toast('Khối nhạc này chưa có phách mạnh');
    const peek = JSON.parse(JSON.stringify({ duration: S.TL.duration, fx: S.TL.fx || [], efx: S.TL.efx || [] }));
    if (!FT().beatApply(peek, { type: fxType, every: fxEvery }, times, { a: m.t0, b: m.t1 })) return S.toast('Không có phách mạnh nào đặt được');
    S.pushUndo();
    const n = FT().beatApply(S.TL, { type: fxType, every: fxEvery }, times, { a: m.t0, b: m.t1 });
    S.changed(true);
    S.toast(`Đã đặt ${n} khối “${window.FX.get('fx', fxType)?.label || fxType}” theo nhịp`);
  }
  S.fxOnBeats = fxOnBeats;
  document.addEventListener('change', e => {
    const t = e.target.closest?.('#insp [data-bmfx]'), ev = e.target.closest?.('#insp [data-bmevery]');
    if (t && window.FX?.get('fx', t.value)) fxType = t.value;
    if (ev) fxEvery = Math.max(1, +ev.value || 1);
  });
  async function analyse(m) {
    const src = srcOf(m), key = keyOf(src); if (!src || ST.busy.has(key)) return;
    const pid = S.META?.pid, same = () => S.META?.pid === pid; // đổi dự án giữa lúc chờ: bỏ kết quả
    const done = beats => {
      ST.busy.delete(key);
      beats = same() ? BC.parse(beats) : null;
      if (beats) {
        S.pushUndo();
        for (const x of music()) if (sameSrc(src, srcOf(x))) x.beats = beats;
        S.changed(true); S.toast(`Nhịp: ${beats.bpm} BPM, ${beats.t.length} phách`);
      } else S.renderInspector();
    };
    ST.busy.set(key, 'Đang xếp việc…'); S.renderInspector();
    const r = await S.api('/api/beats', src).catch(e => ({ error: e.message }));
    if (r?.error) { ST.busy.delete(key); S.renderInspector(); return S.toast(r.error); }
    if (r.beats) return done(r.beats);
    const qs = new URLSearchParams(src).toString();
    for (let i = 0; i < 400; i++) { // ≤ ~10 phút
      await new Promise(ok => setTimeout(ok, 1500));
      if (!same()) return done(null);
      const g = await S.api('/api/beats?' + qs).catch(() => null);
      if (g?.beats) return done(g.beats);
      const j = g?.job;
      if (j && ['error', 'cancelled'].includes(j.state)) { done(null); return S.toast(j.state === 'cancelled' ? 'Đã huỷ phân tích nhịp' : 'Phân tích nhịp lỗi: ' + (j.error || '')); }
      const step = j ? `${j.state === 'queued' ? 'Đang chờ lượt' : j.step || 'Đang chạy'}…` : 'Đang chạy…';
      if (ST.busy.get(key) !== step) { ST.busy.set(key, step); if (S.sel?.kind === 'music') S.renderInspector(); }
    }
    done(null);
  }
  document.addEventListener('click', e => {
    const lv = e.target.closest?.('[data-bmlv]'), act = e.target.closest?.('[data-bmact]');
    if (lv) { level = lv.dataset.bmlv; try { localStorage.setItem(KEY, level); } catch { /* bỏ qua */ } S.renderTimeline(); S.renderInspector(); return; }
    if (!act || S.sel?.kind !== 'music') return;
    if (act.dataset.bmact === 'run') analyse(S.sel.obj);
    if (act.dataset.bmact === 'fx') fxOnBeats(S.sel.obj);
    if (act.dataset.bmact === 'clear') { S.pushUndo(); const src = srcOf(S.sel.obj); for (const x of music()) if (sameSrc(src, srcOf(x))) delete x.beats; S.changed(true); }
  });

  const st = document.createElement('style');
  st.textContent = `
.blk .bmk { position:absolute; top:3px; bottom:3px; left:var(--bm-x, 0); width:1px; background:rgb(var(--color-fg) / .28); pointer-events:none; }
.blk .bmk.s { width:2px; top:0; bottom:0; background:rgb(var(--color-warning-text) / .85); }
.blk .bmk-dense { position:absolute; inset:auto 0 0 0; height:2px; background:repeating-linear-gradient(90deg, rgb(var(--color-fg) / .3) 0 1px, transparent 1px 4px); pointer-events:none; }
#insp .bmrow { display:flex; gap:var(--space-2); align-items:center; flex-wrap:wrap; margin:var(--space-2) 0; }
#insp .bmrow button.on { background:rgb(var(--color-accent-soft) / .24); border-color:rgb(var(--color-accent-text) / .5); color:rgb(var(--color-fg)); }
`;
  document.head.appendChild(st);
})();
