// S21 M148: mục "Núm" đứng đầu Thuộc tính (học Claude Design): 2–4 thanh trượt mức cao cho element đang chọn, mỗi núm đổi nhiều
// trường một lúc theo bảng ánh xạ có kiểm của 71_knobs.core.js (chữ: Độ nổi, Năng lượng · sticker / cảnh: Kích cỡ, Năng lượng ·
// hình khối: Độ đậm, Bo góc, Kích cỡ · khối HyperFrames: Kích cỡ, Năng lượng + biến số của catalog · gói style: item.knobs).
// Kéo một lần = một bước hoàn tác; preview vẽ lại theo khung hình (khối HyperFrames: giãn 120 ms); bấm đúp thanh hoặc ↺ để đặt lại.
// Không gọi Claude, không gọi server (C23). Trạng thái núm lưu trên element: obj.knobs = { base: giá trị gốc, v: { id: giá trị } }.
// Ra ngoài: window.Knobs.validateMap(map, comp?) — kiểm một bảng núm JSON lạ theo danh sách trường cho phép (M149 "Gợi ý núm"),
// tableFor(comp?), allowed(comp?). Núm M149 thêm lưu ở obj.knob_map, đọc lại cùng núm của gói style.
'use strict';
(() => {
  const S = window.Studio, K = window.KnobsCore;
  if (!S || !K) return;
  const { esc, sect } = S;
  const r2 = v => Math.round(v * 100) / 100;

  const css = document.createElement('style');
  css.textContent = `
  #knpanel .knrow { margin: var(--space-1) 0; }
  #knpanel .knrow > span { width: 84px; }
  #knpanel .knrow input[type=range] { flex: 1; min-width: 0; }
  #knpanel .knrow.is-moved > b { color: rgb(var(--color-accent-text)); }
  #knpanel .knrs { width: var(--h-sm); height: var(--h-sm); padding: 0; flex: none; justify-content: center; color: rgb(var(--color-fg-subtle)); background: transparent; border-color: transparent; }
  #knpanel .knrs:hover:not(:disabled) { color: rgb(var(--color-fg)); background: rgb(var(--color-surface-hover)); }
  #knpanel .knrs:disabled { visibility: hidden; }`;
  document.head.appendChild(css);

  const packKnobs = o => (S.win?.PACKS || []).flatMap(p => p.items || []).find(i => i && i.type === o.type && Array.isArray(i.knobs))?.knobs;
  // Bảng núm + danh sách trường cho phép của element; null = không có núm. Cảnh bố cục / b-roll (phủ kín khung, nối sát nhau) không có.
  function ctx(c) {
    const target = K.targetOf(c); if (!target) return null;
    if (target === 'scene' && (c.track === 'scene' || c.track === 'broll')) return null;
    const o = c.obj, block = target === 'hf' ? S.win?.HF_CATALOG?.[o.block] : null;
    if (target === 'hf' && !block) return null;
    if (!S.getPos(c)?.size) return null;
    const allowed = K.allowedFor(target, block);
    // M149: núm do "Gợi ý núm" thêm nằm ở obj.knob_map (đã kiểm lại ở đây qua tableFor → validateMap)
    const extra = [...(packKnobs(o) || []), ...(Array.isArray(o.knob_map) ? o.knob_map : [])];
    return { allowed, knobs: K.tableFor(target, { block, varLabel: S.hfVarLabel, extra }) };
  }
  // Giá trị hiện có của các trường cho phép (size, dur là trường ảo; vars.<id> là biến của khối).
  function readRaw(c, allowed) {
    const o = c.obj, raw = {};
    for (const f of Object.keys(allowed)) {
      if (f === 'size') raw.size = c.obj.type === 'hf' ? o.size ?? 100 : S.getPos(c)?.size ?? null; // khối HF: size là % của engine/hf.js
      else if (f === 'dur') raw.dur = r2(c.t1 - c.t0);
      else if (f.startsWith('vars.')) raw[f] = o.vars?.[f.slice(5)] ?? null;
      else raw[f] = o[f] ?? null;
    }
    return raw;
  }
  function write(c, patch) {
    const o = c.obj;
    for (const [f, v] of Object.entries(patch)) {
      if (f === 'size' || f === 'dur') continue;
      if (f.startsWith('vars.')) {
        const id = f.slice(5); o.vars = { ...(o.vars || {}) };
        if (v == null) delete o.vars[id]; else o.vars[id] = v;
        if (!Object.keys(o.vars).length) delete o.vars;
      } else if (v == null) delete o[f]; else o[f] = v;
    }
    if (patch.size != null && o.type === 'hf') { if (patch.size === 100) delete o.size; else o.size = patch.size; } else if (patch.size != null) {
      const p = S.getPos(c);
      if (p?.size && Math.abs(p.size - patch.size) > 0.01) {
        if (p.card) { const k = patch.size / p.size; p.x = p.card.x + p.card.w * (1 - k) / 2; p.y = p.card.y + p.card.h * (1 - k) / 2; } // giữ tâm
        p.size = patch.size; S.setPos(c, p);
      }
    }
    if (patch.dur != null) {
      const d = Math.min(patch.dur, Math.max(0.3, (S.TL.duration || Infinity) - c.t0));
      if (Math.abs((c.t1 - c.t0) - d) > 0.005) S.setTimes(c, c.t0, c.t0 + d);
    }
  }
  // Trạng thái núm còn dùng được (khớp trường hiện có); lệch vì người dùng sửa tay ở mục khác thì lấy giá trị hiện có làm gốc mới.
  function stateOf(c, cx) {
    const o = c.obj, now = readRaw(c, cx.allowed), st = o.knobs;
    const ok = st && st.base && typeof st.base === 'object' && st.v && K.inSync(cx.knobs, st.v, st.base, cx.allowed, now);
    const base = ok ? st.base : now, v = {};
    for (const k of cx.knobs) v[k.id] = Number.isFinite(ok ? st.v[k.id] : NaN) ? st.v[k.id] : K.initValue(k, base, cx.allowed);
    return { base, v, moved: !!ok };
  }
  const shown = (k, v) => (k.min < 0 ? (v > 0 ? '+' + v : v < 0 ? '−' + -v : '0') : v + '%');

  S.addInspectorTab(c => {
    const cx = ctx(c); if (!cx) return null;
    const st = stateOf(c, cx), vis = K.visibleKnobs(cx.knobs, st.base, cx.allowed);
    if (!vis.length) return null;
    const rows = vis.map(k => {
      const v = st.v[k.id], init = K.initValue(k, st.base, cx.allowed), moved = v !== init;
      return `<div class="slrow knrow ${moved ? 'is-moved' : ''}"><span title="${esc(k.fields.map(f => f.f.replace(/^vars\./, '')).join(' · '))}">${esc(k.label)}</span>
        <input type="range" data-kn="${esc(k.id)}" min="${k.min}" max="${k.max}" step="1" value="${v}" aria-label="${esc(k.label)}">
        <b data-knv="${esc(k.id)}">${shown(k, v)}</b><button class="icon knrs" data-knrs="${esc(k.id)}" ${moved ? '' : 'disabled'} title="Đặt lại ${esc(k.label)}" aria-label="Đặt lại ${esc(k.label)}"><i class="ti ti-restore"></i></button></div>`;
    }).join('');
    const any = vis.some(k => st.v[k.id] !== K.initValue(k, st.base, cx.allowed));
    return ['knobs', 'Núm', `<div id="knpanel">${sect('', rows)}
      <div class="acts"><button data-knall ${any ? '' : 'disabled'}><i class="ti ti-restore"></i> Đặt lại tất cả</button></div>
      <div class="help">Mỗi núm đổi nhiều trường một lúc (rê vào tên núm để xem trường). Kéo một lần là một bước hoàn tác (⌘Z); bấm đúp thanh để đặt lại núm đó.</div></div>`];
  });

  // ---- kéo núm ----
  let drag = null, raf = 0, tm = 0;
  const isHf = c => c?.kind === 'scene' && c.obj.type === 'hf';
  function begin(c) {
    const cx = ctx(c); if (!cx) return null;
    const st = stateOf(c, cx);
    S.touch(c.obj); // một bước hoàn tác cho cả lần kéo (+ _orig cho "Về thiết kế")
    c.obj.knobs = { base: st.base, v: st.v };
    return (drag = { obj: c.obj, cx });
  }
  function redraw(c) { // preview mượt: gom theo khung hình; khối HyperFrames dựng lại iframe nên giãn ra
    if (isHf(c)) { clearTimeout(tm); tm = setTimeout(() => S.changed(false), 120); return; }
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; S.changed(false); });
  }
  function setKnob(el) {
    const c = S.sel; if (!c) return;
    const d = drag && drag.obj === c.obj ? drag : begin(c); if (!d) return;
    const id = el.dataset.kn, k = d.cx.knobs.find(x => x.id === id); if (!k) return;
    const v = Math.max(k.min, Math.min(k.max, Math.round(+el.value)));
    c.obj.knobs.v[id] = v;
    write(c, K.patchOf(d.cx.knobs, c.obj.knobs.v, c.obj.knobs.base, d.cx.allowed));
    const b = el.parentNode.querySelector(`[data-knv="${CSS.escape(id)}"]`); if (b) b.textContent = shown(k, v);
    redraw(c);
  }
  function end() {
    if (!drag) return;
    drag = null; cancelAnimationFrame(raf); raf = 0; clearTimeout(tm);
    S.changed(true);
  }
  function reset(id) {
    const c = S.sel; if (!c) return;
    const d = begin(c); if (!d) return;
    const o = c.obj;
    if (id) { const k = d.cx.knobs.find(x => x.id === id); if (k) o.knobs.v[id] = K.initValue(k, o.knobs.base, d.cx.allowed); }
    const patch = K.patchOf(d.cx.knobs, id ? o.knobs.v : {}, o.knobs.base, d.cx.allowed);
    if (!id) for (const f of Object.keys(patch)) patch[f] = o.knobs.base[f] ?? null; // tất cả: trả đúng giá trị gốc
    write(c, patch);
    if (!id) delete o.knobs;
    drag = null; S.changed(true);
  }
  document.addEventListener('input', e => { const el = e.target.closest?.('#knpanel input[data-kn]'); if (el) setKnob(el); });
  document.addEventListener('change', e => { if (e.target.closest?.('#knpanel input[data-kn]')) end(); });
  document.addEventListener('dblclick', e => { const el = e.target.closest?.('#knpanel input[data-kn]'); if (el) reset(el.dataset.kn); });
  document.addEventListener('click', e => {
    const b = e.target.closest?.('#knpanel [data-knrs], #knpanel [data-knall]'); if (!b || b.disabled) return;
    reset(b.dataset.knrs || null);
  });

  window.Knobs = {
    validateMap: (map, c = S.sel) => K.validateMap(map, ctx(c)?.allowed || null),
    tableFor: (c = S.sel) => ctx(c)?.knobs || [],
    allowed: (c = S.sel) => ctx(c)?.allowed || null, // M149: danh sách trường núm cho "Gợi ý núm"
    targetOf: K.targetOf,
  };
})();
