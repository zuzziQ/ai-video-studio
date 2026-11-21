// S28 M205: khối "Hoạt ảnh" dùng chung — Vào / Ra / Lặp cho dòng chữ (studio.js animBlock), hình khối (64_shapes.js), element
// riêng (72_celem.js), sticker (inspector cảnh). Danh sách đọc từ engine/fx_registry.js (FX.ANIM_*), ghi qua CanvasCmds.animSet
// (lõi thuần, test s28_anim): anim (vào) · anim_dur · anim_out {type, dur} · anim_loop {type, speed}. Thời lượng hoạt ảnh độc lập
// với thời lượng lớp; Ra để trống = mờ dần chung của engine như cũ. Studio.animPick(o, { def, extra, inNone }) trả HTML.
'use strict';
(() => {
  const S = window.Studio, C = window.CanvasCmds, FX = window.FX;
  if (!S || !C || !FX) return;
  const { esc, sect } = S;
  const typeOf = v => (v && typeof v === 'object' ? v.type : v) || '';
  const numOf = (v, k) => (v && typeof v === 'object' && +v[k] > 0 ? +v[k] : 0);
  let tab = 'in'; // tab con đang mở (giữ qua các lần vẽ lại inspector)

  const cell = (which, id, label, on, demo) => `<button class="an ${on ? 'on' : ''}" data-anx="${which}" data-v="${esc(id)}" aria-pressed="${on}">` +
    `<span class="ad">${demo}</span><small>${esc(label)}</small></button>`;
  const none = (which, label, on) => cell(which, '', label, on, '<i class="ti ti-ban"></i>');
  const rng = (which, v, a, b, st, lab, show) => `<div class="slrow"><span>${lab}</span><input type="range" data-anr="${which}" min="${a}" max="${b}" step="${st}" value="${v}" aria-label="${lab}"><b data-anv="${which}">${show(v)}</b></div>`;
  const secs = v => (v > 0 ? `${v}s` : 'Mặc định');

  function animPick(o, opt = {}) {
    const def = opt.def ?? 'pop', cin = typeof o.anim === 'string' && o.anim ? o.anim : def;
    const cout = typeOf(o.anim_out), cloop = typeOf(o.anim_loop);
    const ins = [...(opt.extra || []), ...FX.list('anim_in').filter(x => !(opt.extra || []).some(e => e[0] === x.id)).map(x => [x.id, x.label])];
    const paneIn = `<div class="angrid">${opt.inNone ? none('in', opt.inNone, !cin) : ''}${ins.map(([k, l]) => cell('in', k, l, cin === k, `<b class="an-${k}">Aa</b>`)).join('')}</div>
      ${rng('in_dur', +o.anim_dur > 0 ? +o.anim_dur : 0, 0, 3, .05, 'Thời lượng vào', secs)}`;
    const paneOut = `<div class="angrid">${none('out', 'Mờ dần', !cout)}${FX.ANIM_OUT.map(x => cell('out', x.id, x.label, cout === x.id, `<i class="ti ${x.icon}"></i>`)).join('')}</div>
      ${cout ? rng('out_dur', numOf(o.anim_out, 'dur'), 0, 3, .05, 'Thời lượng ra', secs) : '<div class="help">Mờ dần = như cũ: engine mờ cả cảnh quanh lúc tắt.</div>'}`;
    const paneLoop = `<div class="angrid">${none('loop', 'Không', !cloop)}${FX.ANIM_LOOP.map(x => cell('loop', x.id, x.label, cloop === x.id, `<i class="ti ${x.icon}"></i>`)).join('')}</div>
      ${cloop ? rng('speed', numOf(o.anim_loop, 'speed') || 1, .25, 3, .05, 'Tốc độ', v => `${v}×`) : ''}`;
    const tabs = [['in', 'Vào', cin], ['out', 'Ra', cout], ['loop', 'Lặp', cloop], ...(S.presets ? [['mine', 'Của tôi', '']] : [])]; // S29 M211
    return sect('Hoạt ảnh', `<div class="antabs" role="tablist">${tabs.map(([k, l, cur]) => `<button role="tab" data-antab="${k}" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}">${l}${cur ? ' <i class="ti ti-point-filled"></i>' : ''}</button>`).join('')}</div>
      <div data-anpane="in" ${tab === 'in' ? '' : 'hidden'}>${paneIn}</div><div data-anpane="out" ${tab === 'out' ? '' : 'hidden'}>${paneOut}</div><div data-anpane="loop" ${tab === 'loop' ? '' : 'hidden'}>${paneLoop}</div>${S.presets ? `<div data-anpane="mine" ${tab === 'mine' ? '' : 'hidden'}>${S.presets.block('anim')}</div>` : ''}
      <div class="help">Thời lượng hoạt ảnh riêng, không đổi thời lượng hiển thị của lớp. Lặp chạy sau khi vào xong.</div>`, 'ti-sparkles');
  }
  S.animPick = animPick;

  const cur = () => (C.animCan(S.sel) ? S.sel.obj : null);
  document.addEventListener('click', e => {
    const t = e.target.closest?.('#insp [data-antab], #insp [data-anx]'); if (!t) return;
    if (t.dataset.antab) {
      tab = t.dataset.antab;
      const root = t.closest('#insp');
      root.querySelectorAll('[data-antab]').forEach(b => { const on = b.dataset.antab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      root.querySelectorAll('[data-anpane]').forEach(p => { p.hidden = p.dataset.anpane !== tab; });
      return;
    }
    const o = cur(); if (!o) return;
    S.touch(o, 'anim_' + t.dataset.anx); C.animSet(o, t.dataset.anx, t.dataset.v); S.changed(true);
  });
  document.addEventListener('input', e => {
    const t = e.target; if (!t.dataset?.anr || !t.closest('#insp')) return;
    const o = cur(); if (!o) return;
    const v = +t.value, lab = t.parentElement.querySelector(`[data-anv="${t.dataset.anr}"]`);
    if (lab) lab.textContent = t.dataset.anr === 'speed' ? `${v}×` : secs(v);
    S.touch(o, 'anim_' + t.dataset.anr); C.animSet(o, t.dataset.anr, v); S.changed(false);
  });

  const st = document.createElement('style');
  st.textContent = `
.antabs { display:grid; grid-template-columns:repeat(auto-fit,minmax(0,1fr)); gap:var(--space-1); margin-bottom:var(--space-2); }
.antabs button { font-size:var(--text-xs); }
.antabs button.on { background:rgb(var(--color-accent-soft) / .24); border-color:rgb(var(--color-accent-text) / .5); color:rgb(var(--color-fg)); }
.antabs .ti { font-size:var(--text-2xs); color:rgb(var(--color-accent-text)); }
[data-anpane] .an .ad .ti { font-size:var(--text-lg); color:rgb(var(--color-fg-muted)); }
[data-anpane] .slrow { margin-top:var(--space-2); }`;
  document.head.appendChild(st);
})();
