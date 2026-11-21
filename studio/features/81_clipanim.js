// S28 M204: tab Hoạt ảnh trong Thuộc tính của clip Video chính và cảnh b-roll / ảnh phủ: 3 tab con Vào / Ra / Combo, lưới preset
// (mục "Không" bỏ slot), thanh thời lượng (Vào / Ra) hoặc tốc độ (Combo), Áp cho tất cả. Dữ liệu: obj.anim = {in, out, combo}
// (engine/fx_registry.js nhóm clip_anim, FX.clipAnimSet; engine ghép ở engine.js animWrap). studio.js gọi Studio.animTab(c).
// Xem thử như M202 (79_transpeek.js): rê / focus một ô → khung chính phát lặp đúng đoạn có hoạt ảnh bằng TL TẠM (Studio.previewTL),
// không pushUndo, không markDirty; rời ô / bấm phát là Studio.redraw() dựng lại từ timeline thật.
'use strict';
(() => {
  const S = window.Studio, PC = window.TransPeekCore;
  if (!S || !window.FX?.clipAnimSet) return;
  const { esc, sect, tip } = S;
  const SLOTS = [['in', 'Vào', 'ti-login-2'], ['out', 'Ra', 'ti-logout-2'], ['combo', 'Combo', 'ti-repeat'], ['mine', 'Của tôi', 'ti-bookmark']]; // S29 M211: mine = preset
  const r2 = v => Math.round(v * 100) / 100;
  const SCENES = new Set(['photo', 'broll']);
  let slot = 'in';

  // mục đang chọn có hoạt ảnh clip được không; trả { obj, t0, t1, key } (key = chỗ trong TL để TL tạm đặt anim)
  function target(c = S.sel) {
    if (!c) return null;
    if (c.kind === 'clip') { const k = clipLayout()[c.idx]; return k ? { obj: c.obj, t0: k.t0, t1: k.t1, key: ['clips', c.idx], scope: 'clip' } : null; }
    if (c.kind === 'scene' && SCENES.has(c.obj.type)) { const i = S.TL.scenes.indexOf(c.obj); return i < 0 ? null : { obj: c.obj, t0: c.obj.t0, t1: c.obj.t1, key: ['scenes', i], scope: 'scene' }; }
    return null;
  }
  const kindOf = s => FX.CLIP_SLOT[s];

  S.animTab = c => {
    const T = target(c); if (!T) return '';
    const a = T.obj.anim && typeof T.obj.anim === 'object' ? T.obj.anim : {}, cur = a[slot], list = FX.list(kindOf(slot)), D = T.t1 - T.t0;
    const tabs = `<div class="ca-tabs" role="tablist">${SLOTS.filter(s => s[0] !== 'mine' || S.presets).map(([k, l, ic]) => `<button role="tab" aria-selected="${k === slot}" data-caslot="${k}" class="${k === slot ? 'on' : ''}"><i class="ti ${ic}"></i> ${l}${a[k] ? ' <b class="ca-dot"></b>' : ''}</button>`).join('')}</div>`;
    if (slot === 'mine') return `<div id="capanel">${tabs}${S.presets ? sect('Hoạt ảnh của tôi', S.presets.block('clip_anim'), 'ti-bookmark') : ''}</div>`;
    const grid = `<div class="ca-grid"><button class="ca ${cur ? '' : 'on'}" data-catype=""><span class="ca-ic"><i class="ti ti-ban"></i></span><small>Không</small></button>${list.map(x =>
      `<button class="ca ${cur?.type === x.id ? 'on' : ''}" data-catype="${x.id}" title="${esc(x.ai.khi_nao)}"><span class="ca-ic"><i class="ti ${x.icon}"></i></span><small>${esc(x.label)}</small></button>`).join('')}</div>`;
    const p = slot === 'combo' ? FX.CLIP_COMBO[0].params.speed : FX.CLIP_IN[0].params.dur;
    const v = cur ? (slot === 'combo' ? cur.speed : cur.dur) : p.def, max = slot === 'combo' ? p.max : Math.min(p.max, Math.max(p.min, r2(D)));
    const slider = cur ? `<div class="slrow"><span>${slot === 'combo' ? 'Tốc độ' : 'Thời lượng'}</span><input type="range" data-caval min="${p.min}" max="${max}" step="${slot === 'combo' ? .05 : .1}" value="${v}"><b>${r2(v)}${slot === 'combo' ? '×' : 's'}</b></div>` : '';
    const help = slot === 'combo' ? `Chạy suốt ${r2(D)}s của ${T.scope === 'clip' ? 'clip' : 'cảnh'}, cộng với Vào / Ra.` : `${slot === 'in' ? 'Chạy ở đầu' : 'Chạy ở cuối'}. Vào + Ra dài hơn clip thì tự chia theo tỉ lệ.`;
    const all = T.scope === 'clip' ? 'Áp cho tất cả clip' : 'Áp cho mọi b-roll và ảnh phủ';
    return `<div id="capanel">${tabs}${sect(`Hoạt ảnh ${SLOTS.find(s => s[0] === slot)[1].toLowerCase()}`, `${grid}${slider}
      <div class="help">${help} ${tip('Rê chuột lên một ô để xem thử trên khung. Hoạt ảnh cộng với keyframe; thuộc tính nào keyframe đã đặt (vị trí, cỡ, xoay, độ mờ) thì keyframe thắng.')}</div>
      <div class="acts"><button data-caall ${a[slot] ? '' : 'disabled'}><i class="ti ti-copy-check"></i> ${all}</button></div>`, 'ti-movie')}</div>`;
  };

  // ---------- áp ----------
  function setSlot(obj, s, type, v) { const n = FX.clipAnimSet(obj.anim, s, type, v); if (n) obj.anim = n; else delete obj.anim; }
  function run(fn, key) { const T = target(); if (!T) return; S.pushUndo(key); fn(T); S.changed(true); }
  document.addEventListener('click', e => {
    if (!e.target.closest('#capanel')) return;
    let b;
    if ((b = e.target.closest('[data-caslot]'))) { stop(false); slot = b.dataset.caslot; return S.renderInspector(); }
    if ((b = e.target.closest('[data-catype]'))) { stop(false); return run(T => setSlot(T.obj, slot, b.dataset.catype)); }
    if ((b = e.target.closest('[data-caall]'))) {
      return run(T => {
        const v = T.obj.anim?.[slot]; if (!v) return;
        const list = T.scope === 'clip' ? S.TL.clips || [] : (S.TL.scenes || []).filter(s => SCENES.has(s.type));
        for (const o of list) if (o !== T.obj) setSlot(o, slot, v.type, v);
        S.toast(`Đã áp cho ${list.length} ${T.scope === 'clip' ? 'clip' : 'cảnh'}`);
      });
    }
  });
  document.addEventListener('input', e => {
    const r = e.target.closest('#capanel [data-caval]'); if (!r) return;
    const T = target(); if (!T?.obj.anim?.[slot]) return;
    S.pushUndo('caval' + slot); setSlot(T.obj, slot, T.obj.anim[slot].type, { [slot === 'combo' ? 'speed' : 'dur']: +r.value });
    r.nextElementSibling.textContent = r2(+r.value) + (slot === 'combo' ? '×' : 's'); S.changed();
  });

  // ---------- xem thử (cơ chế M202: TL tạm + vòng renderFrame) ----------
  let P = null, wait = 0, gen = 0;
  const ok = () => target() && !S.playing && !S.dragging && !S.review?.active && !S.transPeek?.active && S.win?.init && S.win?.renderFrame;
  function peekTL(T, type) {
    const o = JSON.parse(JSON.stringify(S.TL)), obj = o[T.key[0]]?.[T.key[1]];
    if (obj) { const cur = T.obj.anim?.[slot]; setSlot(obj, slot, type, cur ? { [slot === 'combo' ? 'speed' : 'dur']: slot === 'combo' ? cur.speed : cur.dur } : null); }
    return o;
  }
  function spanOf(T, type) {
    const d = (T.obj.anim?.[slot]?.dur ?? FX.CLIP_IN[0].params.dur.def) + .6;
    if (!type || slot === 'combo') return { a: T.t0, b: Math.min(T.t1, T.t0 + 3) };
    return slot === 'in' ? { a: T.t0, b: Math.min(T.t1, T.t0 + d) } : { a: Math.max(T.t0, T.t1 - d), b: T.t1 - .02 };
  }
  async function start(btn) {
    if (P?.btn === btn) return;
    if (P) stop(false);
    if (!ok()) return;
    const T = target(), type = btn.dataset.catype || '', my = ++gen;
    P = { btn, sp: spanOf(T, type), t0: 0 };
    tag(`Xem thử: ${type ? FX.get(kindOf(slot), type)?.label || type : 'Không hoạt ảnh'}`);
    try { await S.win.init(S.previewTL(peekTL(T, type))); } catch (err) { console.error(err); }
    if (my !== gen) return;
    P.t0 = performance.now();
    const frameT = PC ? PC.frameT : (sp, ms) => sp.a + ((ms / 1000) % Math.max(1e-3, sp.b - sp.a));
    const loop = async () => {
      if (my !== gen) return;
      if (!ok()) return stop();
      try { await S.win.renderFrame(frameT(P.sp, performance.now() - P.t0)); } catch (err) { console.error(err); }
      if (my === gen) setTimeout(loop, 16);
    };
    loop();
  }
  function stop(redraw = true) {
    clearTimeout(wait);
    if (!P) return;
    P = null; gen++; tag('');
    if (redraw) S.redraw();
  }
  function tag(text) {
    let el = document.querySelector('#stagebox .tp-tag');
    if (!el) { el = document.createElement('div'); el.className = 'tp-tag'; el.setAttribute('aria-live', 'polite'); document.querySelector('#stagebox')?.appendChild(el); }
    el.textContent = text; el.hidden = !text;
  }
  const SEL = '#capanel [data-catype]';
  const enter = btn => { clearTimeout(wait); wait = setTimeout(() => start(btn), 120); };
  const leave = (btn, to) => { if (to && btn.contains(to)) return; clearTimeout(wait); if (P?.btn === btn) stop(); };
  document.addEventListener('mouseover', e => { const b = e.target.closest?.(SEL); if (b) enter(b); });
  document.addEventListener('mouseout', e => { const b = e.target.closest?.(SEL); if (b) leave(b, e.relatedTarget); });
  document.addEventListener('focusin', e => { const b = e.target.closest?.(SEL); if (b) enter(b); });
  document.addEventListener('focusout', e => { const b = e.target.closest?.(SEL); if (b) leave(b, e.relatedTarget); });
  S.clipAnim = { get active() { return !!P; }, stop, get slot() { return slot; } };

  const st = document.createElement('style');
  st.textContent = `
#capanel .ca-tabs { display:grid; grid-template-columns:repeat(3,1fr); gap:var(--space-1); margin-bottom:var(--space-2); }
#capanel .ca-tabs button { gap:var(--space-050); }
#capanel .ca-tabs button.on, #capanel .ca.on { background:rgb(var(--color-accent-soft) / .24); border-color:rgb(var(--color-accent-text) / .5); color:rgb(var(--color-accent-text-strong)); }
#capanel .ca-dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:rgb(var(--color-accent-text)); }
#capanel .ca-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(68px,1fr)); gap:var(--space-1); margin-bottom:var(--space-2); }
#capanel .ca { flex-direction:column; gap:var(--space-050); padding:var(--space-1); min-width:0; font-size:var(--text-2xs); color:rgb(var(--color-fg-muted)); }
#capanel .ca small { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#capanel .ca-ic { font-size:var(--text-lg); line-height:1; }`;
  document.head.appendChild(st);
})();
