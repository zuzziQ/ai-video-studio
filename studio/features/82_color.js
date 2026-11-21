// S29 M208: panel Màu dùng chung — tab Màu của clip Video chính, của b-roll / ảnh phủ, và của khối Điều chỉnh trên track Hiệu ứng.
// Dữ liệu: obj.filter = { preset, strength 0–100, …Adjust } (engine/fx_registry.js FX.colorFx / FX.ADJ); thanh kéo = một bước hoàn tác.
// "Claude chọn màu" (tab Claude, 75_ask.js case color_pick): Studio.color.pick(idx) → trợ lý 'color' (scripts/assist.mjs) đọc ảnh nhỏ
//   giữa clip + thương hiệu + thói quen đã học (GET /api/ai/habits, M192) → bộ filter; 75_ask.js đặt thẻ Nhận / Bỏ (AskCore.colorApply).
'use strict';
(() => {
  const S = window.Studio;
  if (!S || !window.FX?.colorFx) return;
  const { esc, sect } = S;
  const r2 = v => Math.round(v * 100) / 100;
  const SCENES = new Set(['photo', 'broll']);
  const css = document.createElement('style');
  css.textContent = `#colpanel .flmini span { transition: none; } #colpanel .col-why { margin-top: var(--space-1); }`;
  document.head.appendChild(css);

  // đối tượng đang chọn có tab Màu: clip, b-roll / ảnh phủ, khối Điều chỉnh (efx type adjust)
  function target(c = S.sel) {
    if (!c) return null;
    if (c.kind === 'clip') return { obj: c.obj, scope: 'clip' };
    if (c.kind === 'scene' && SCENES.has(c.obj.type)) return { obj: c.obj, scope: 'scene' };
    if (c.kind === 'efx' && c.blk?.src === 'efx' && FX.get('fx', c.obj.type)?.color) return { obj: c.obj, scope: 'efx' };
    return null;
  }
  // ảnh nhỏ cho ô bộ lọc: khung của clip chính tại t (ảnh phủ: ảnh của nó)
  function thumbAt(t, o) {
    if (o?.type === 'photo' && typeof (o.media || o.src) === 'string') return '/project/' + (o.media || o.src);
    try { const k = clipAtT(t); return k ? clipFrameUrl(k.c, srcAt(k, t)) : ''; } catch { return ''; }
  }
  const slider = (id, v, a, b, st, lab, unit = '') => `<div class="slrow"><span>${esc(lab)}</span><input type="range" data-col="${id}" min="${a}" max="${b}" step="${st}" value="${v}"><b>${r2(v)}${unit}</b></div>`;

  function panel(o, thumb, scope) {
    const f = o.filter || {}, k = f.strength ?? 100;
    const sw = FILTERS.map(([v, l]) => `<button class="${(f.preset || '') === v ? 'on' : ''}" data-colpreset="${v}"><span data-dbg="${esc(thumb || '')}" data-dfx="${esc(v ? FX.lutAt(v, k / 100) || 'none' : 'none')}"></span><small>${esc(l)}</small></button>`).join('');
    const str = f.preset ? slider('strength', k, 0, 100, 1, 'Cường độ', '%') : '<div class="help">Chọn một bộ lọc để chỉnh cường độ.</div>';
    const adj = FX.ADJ.map(a => slider(a.id, f[a.id] ?? a.def, a.min, a.max, a.step, a.label, a.unit)).join('');
    const all = scope === 'clip' ? 'Áp cho tất cả clip' : scope === 'scene' ? 'Áp cho mọi b-roll và ảnh phủ' : '';
    const help = scope === 'efx' ? `<div class="help">Áp lên mọi lớp bên dưới trong đoạn. ${S.tip('Phủ lên chọn ở tab Hiệu ứng; thanh Cường độ của khối kéo cả bộ về gốc.')}</div>` : '';
    return `<div id="colpanel">${sect('Bộ lọc', `<div class="flmini">${sw}</div>${str}`, 'ti-color-filter')}${sect('Điều chỉnh', `${adj}${help}
      <div class="acts"><button data-colreset><i class="ti ti-restore"></i> Đặt lại màu</button>${all ? `<button data-colall ${o.filter ? '' : 'disabled'}><i class="ti ti-copy-check"></i> ${all}</button>` : ''}</div>`, 'ti-adjustments')}</div>`;
  }
  S.colorPanel = (o, thumb, scope) => panel(o, thumb ?? thumbAt(o.t0 ?? o.start ?? S.T, o), scope);

  // ---------- sửa ----------
  const clean = o => { if (o.filter && !Object.keys(o.filter).length) delete o.filter; };
  const locked = T => { if (!T.obj.locked) return false; S.toast('Mục đang khoá · ⌥⇧L để mở khoá'); return true; };
  function setPreset(o, v) {
    o.filter = { ...(o.filter || {}) };
    if (v && FX.get('lut', v)) o.filter.preset = v; else { delete o.filter.preset; delete o.filter.strength; }
    clean(o);
  }
  function setVal(o, id, v) {
    o.filter = { ...(o.filter || {}) };
    if (id === 'strength') { if (o.filter.preset) o.filter.strength = Math.round(+v); if (o.filter.strength === 100) delete o.filter.strength; }
    else { const a = FX.ADJ.find(x => x.id === id); if (!a) return; const x = r2(Math.min(a.max, Math.max(a.min, +v))); if (x === a.def) delete o.filter[id]; else o.filter[id] = x; }
    clean(o);
  }
  document.addEventListener('click', e => {
    if (!e.target.closest?.('#colpanel')) return;
    const T = target(); if (!T) return;
    let b;
    if ((b = e.target.closest('[data-colpreset]'))) { if (locked(T)) return; S.pushUndo(); setPreset(T.obj, b.dataset.colpreset); return S.changed(true); }
    if (e.target.closest('[data-colreset]')) { if (locked(T)) return; S.pushUndo(); delete T.obj.filter; return S.changed(true); }
    if (e.target.closest('[data-colall]')) {
      if (!T.obj.filter) return;
      S.pushUndo();
      const list = T.scope === 'clip' ? S.TL.clips || [] : (S.TL.scenes || []).filter(s => SCENES.has(s.type));
      for (const o of list) if (o !== T.obj && !o.locked) o.filter = JSON.parse(JSON.stringify(T.obj.filter));
      S.toast(`Đã áp màu cho ${list.length} ${T.scope === 'clip' ? 'clip' : 'cảnh'}`);
      return S.changed(true);
    }
  });
  document.addEventListener('input', e => {
    const r = e.target.closest?.('#colpanel [data-col]'); if (!r) return;
    const T = target(); if (!T || locked(T)) return;
    S.pushUndo('col' + r.dataset.col); // kéo liền một thanh = một bước hoàn tác
    setVal(T.obj, r.dataset.col, r.value);
    const lab = r.parentNode.querySelector('b'), a = FX.ADJ.find(x => x.id === r.dataset.col);
    if (lab) lab.textContent = r2(+r.value) + (r.dataset.col === 'strength' ? '%' : a?.unit || '');
    S.changed();
  });
  // thả thanh: vẽ lại để ô bộ lọc theo cường độ mới
  document.addEventListener('change', e => { if (e.target.closest?.('#colpanel [data-col]')) S.renderInspector(); });

  // ---------- Claude chọn màu ----------
  // idx = clip trong TL.clips; trả { filter, why } (filter đã kẹp FX.colorClean) hoặc ném lỗi có thông điệp tiếng Việt
  async function pick(idx, onStep) {
    const c = S.TL?.clips?.[idx], k = clipLayout()[idx];
    if (!c || !k) throw new Error('Clip đã bỏ chọn. Chọn lại rồi hỏi.');
    const url = clipFrameUrl(c, srcAt(k, (k.t0 + k.t1) / 2));
    if (!url || !S.assist || !S.imagePayload) throw new Error('Chưa có trợ lý AI');
    const image = await S.imagePayload(url, { max: 512, type: 'image/jpeg', quality: 0.85 });
    const hab = await S.api('/api/ai/habits').catch(() => null);
    const taste = (Array.isArray(hab?.items) ? hab.items : []).filter(x => x && !x.off && x.note).map(x => String(x.note)).slice(0, 8);
    const b = S.TL.brand || {};
    const r = await S.assist('color', { image, taste, current: c.filter || {}, brand: { name: b.name || b.title, primary: b.primary, accent: b.accent, dark: b.dark, light: b.light, voice: b.voice } }, { onStep });
    const v = r?.fields?.[0]?.value;
    if (!v?.filter) throw new Error('Claude chưa đề xuất được màu');
    return { filter: FX.colorClean(v.filter), why: v.why || '' };
  }
  S.color = { pick, panel: S.colorPanel, target };
})();
