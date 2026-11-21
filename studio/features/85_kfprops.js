// S29 M209: keyframe theo từng thuộc tính cho clip Video chính và khối nhạc — nút hình thoi cạnh thanh trượt trong Thuộc tính.
// Dữ liệu + nội suy: engine/kf.js (window.KF; clip.kf t = giây trong clip, music.kf t = giây từ t0). Engine vẽ ở engine.js clipLayer,
// âm lượng: scripts/kf_env.py (mix_audio.py) khi xuất, studio.js syncClipAudio / tick khi xem trước.
//   Thoi rỗng = thuộc tính chưa có key; thoi viền = có key nơi khác; thoi đặc = có key tại playhead. Bấm = đặt / xoá key tại playhead.
//   Thuộc tính đã có key: kéo thanh = sửa (hoặc tạo) key tại playhead, giá trị tĩnh không đổi. Tab Keyframe: Dời / Tỉ lệ / Xoay / Mờ
//   của clip, kiểu chuyển động (7 easing cũ + 5 bezier), key trước / sau. Chấm keyframe trên khối clip và khối nhạc.
'use strict';
(() => {
  const S = window.Studio, KF = window.KF;
  if (!S || !KF) return;
  const { esc, fmt, sect } = S;
  const r2 = v => Math.round(v * 100) / 100;
  const able = c => c && (c.kind === 'clip' || c.kind === 'music');
  const sel = () => (able(S.sel) ? S.sel : null);
  const lt = c => Math.max(0, r2(S.T - c.t0)); // giây trong clip / khối nhạc
  // ô nhập trong Thuộc tính → [thuộc tính keyframe, đổi giá trị ô → dữ liệu, dữ liệu → ô]
  const ID = [v => v, v => v];
  function propOf(el, c = sel()) {
    if (!c || !el?.dataset) return null;
    const d = el.dataset;
    if (d.kfx && KF.prop(d.kfx)) return [d.kfx, ...ID];
    if (c.kind === 'music') return d.f === 'gain' && el.closest('#insp') ? ['gain', ...ID] : null;
    if (d.mk && /^(x|y|w|h|feather)$/.test(d.mk) && el.closest('#mkpanel') && c.obj.mask) return ['mask_' + d.mk, ...ID];
    if (d.col && el.closest('#colpanel') && KF.prop(d.col)) return [d.col, ...ID];
    if (d.cf === 'volume') return ['volume', v => v / 100, v => Math.round(v * 100)];
    return null;
  }
  const cur = (o, p, t) => KF.valueAt(o.kf, p, t) ?? KF.prop(p).base(o);
  const lab = (p, v) => { const u = KF.prop(p).unit; return (p === 'volume' ? Math.round(v * 100) + '%' : r2(v) + (u === '×' && p !== 'scale' ? '' : u)); };

  // ---- nút thoi: gắn sau mỗi lần vẽ Thuộc tính ----
  function paintDia(b, o, p, t) {
    const on = KF.keyAt(o, t)?.[p] != null, has = KF.has(o.kf, p);
    b.classList.toggle('on', on); b.classList.toggle('has', has && !on);
    const h = `<i class="ti ti-diamond${on ? '-filled' : ''}"></i>`;
    if (b.innerHTML !== h) b.innerHTML = h; // chỉ đổi khi khác: MutationObserver của #insp gọi lại decorate()
    b.title = on ? 'Xoá keyframe tại playhead' : 'Đặt keyframe tại playhead';
    b.setAttribute('aria-pressed', on);
  }
  function decorate() {
    const c = sel(), root = document.querySelector('#insp'); if (!c || !root) return;
    const t = lt(c);
    for (const el of root.querySelectorAll('input[type="range"],input[type="number"]')) {
      const m = propOf(el, c); if (!m) continue;
      const row = el.closest('.slrow');
      let b = row ? row.querySelector(`:scope > .kfdia[data-kfd="${m[0]}"]`) : el.nextElementSibling?.matches?.('.kfdia') ? el.nextElementSibling : null;
      if (!b) {
        b = Object.assign(document.createElement('button'), { className: `kfdia icon${row ? '' : ' inl'}`, type: 'button' }); b.dataset.kfd = m[0];
        if (row) { row.appendChild(b); row.classList.add('haskf'); } else el.after(b);
      }
      paintDia(b, c.obj, m[0], t);
      if (KF.has(c.obj.kf, m[0]) && document.activeElement !== el) {
        const v = m[2](cur(c.obj, m[0], t)), s = String(el.type === 'number' ? r2(v) : v);
        if (el.value !== s) el.value = s;
        const out = row?.querySelector('b'), txt = lab(m[0], m[1](v)); if (out && out.textContent !== txt) out.textContent = txt;
      }
    }
  }
  S.onReady(() => {
    const root = document.querySelector('#insp'); if (!root) return;
    new MutationObserver(() => decorate()).observe(root, { childList: true, subtree: true });
  });
  let lastT = -1;
  setInterval(() => { if (sel() && S.T !== lastT) { lastT = S.T; decorate(); } }, 250);

  document.addEventListener('click', e => {
    const b = e.target.closest?.('.kfdia'); if (!b) return;
    const c = sel(); if (!c) return;
    e.preventDefault(); e.stopPropagation();
    const o = c.obj, p = b.dataset.kfd, t = lt(c);
    S.pushUndo();
    if (KF.keyAt(o, t)?.[p] != null) KF.delKey(o, p, t); else KF.setKey(o, p, t, cur(o, p, t));
    S.changed(true);
  }, true);
  // kéo thanh của thuộc tính có key (hoặc thanh của tab Keyframe): ghi vào key tại playhead, chặn trình xử lý giá trị tĩnh
  document.addEventListener('input', e => {
    const c = sel(), m = c && propOf(e.target, c); if (!m) return;
    const [p, toData] = m, o = c.obj;
    if (!e.target.dataset.kfx && !KF.has(o.kf, p)) return;
    e.stopImmediatePropagation();
    if (!Number.isFinite(+e.target.value) || e.target.value === '') return;
    S.pushUndo('kf' + p);
    const v = toData(+e.target.value); KF.setKey(o, p, lt(c), v);
    const out = e.target.parentNode.querySelector('b'); if (out && e.target.type === 'range') out.textContent = lab(p, v);
    S.changed(); decorate();
  }, true);
  document.addEventListener('change', e => {
    const c = sel(); if (!c) return;
    if (e.target.dataset?.kfease != null) {
      const k = prevKey(c.obj, lt(c)); if (!k) return;
      S.pushUndo(); k.ease = e.target.value; return S.changed(true);
    }
    const m = propOf(e.target, c); if (m && (e.target.dataset.kfx || KF.has(c.obj.kf, m[0]))) e.stopImmediatePropagation(); // không vẽ lại giữa chừng
  }, true);

  // ---- tab Keyframe của clip / nhạc ----
  const prevKey = (o, t) => KF.keyAt(o, t) || [...(o.kf || [])].reverse().find(k => k.t < t) || null;
  const names = k => Object.keys(k).filter(n => n !== 't' && n !== 'ease' && n !== 'bz').map(n => KF.prop(n)?.label || n);
  function tab(c) {
    if (!able(c)) return null;
    const o = c.obj, t = lt(c), ks = o.kf || [], k = prevKey(o, t), clip = c.kind === 'clip';
    const rng = p => { const d = KF.prop(p), v = cur(o, p, t); return `<div class="slrow"><span>${esc(d.label)}</span><input type="range" data-kfx="${p}" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}"><b>${lab(p, v)}</b></div>`; };
    const html = (clip ? sect('Biến đổi', KF.TR.map(rng).join('') + `<div class="help">${S.tip('Bấm hình thoi cạnh thuộc tính để đặt keyframe tại playhead; dời playhead rồi kéo thanh để tạo chuyển động. Hình thoi còn có ở Mặt nạ, Màu và Âm lượng.')}</div>`, 'ti-arrows-move') : '') +
      sect('Keyframe tại playhead', `<div class="kfbar"><button data-kfnav="-1" title="Keyframe trước"><i class="ti ti-chevron-left"></i></button>
        <span class="muted">${fmt(S.T)} · ${ks.length} keyframe</span><button data-kfnav="1" title="Keyframe sau"><i class="ti ti-chevron-right"></i></button></div>
        ${k ? `<span class="lbl">Kiểu chuyển động (từ ${fmt(c.t0 + k.t)})</span><select data-kfease>${KF.EASE_VI.map(([v, l]) => `<option value="${v}" ${(k.ease || 'linear') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
        ${ks.length ? `<div class="kflist">${ks.map(x => `<button data-kfgo="${x.t}" title="${esc(names(x).join(', '))}"><i class="ti ti-diamond-filled"></i>${fmt(c.t0 + x.t)}</button>`).join('')}</div>
        <div class="acts"><button data-kfclear class="danger"><i class="ti ti-eraser"></i> Xoá mọi keyframe</button></div>` : `<div class="help">${clip ? 'Chưa có keyframe.' : 'Bấm hình thoi cạnh Âm lượng (dB) ở tab Cơ bản để đặt keyframe âm lượng.'}</div>`}`, 'ti-diamond');
    return [clip ? 'kfclip' : 'kfmusic', 'Keyframe', `<div id="kfppanel">${html}</div>`];
  }
  S.addInspectorTab(tab);
  document.addEventListener('click', e => {
    const b = e.target.closest?.('#kfppanel [data-kfnav],#kfppanel [data-kfgo],#kfppanel [data-kfclear]'); if (!b) return;
    const c = sel(); if (!c) return; const o = c.obj, t = lt(c), ks = o.kf || [];
    if (b.dataset.kfgo != null) return S.setTime(c.t0 + +b.dataset.kfgo + 1e-3);
    if (b.dataset.kfnav != null) {
      const k = +b.dataset.kfnav < 0 ? [...ks].reverse().find(x => x.t < t - KF.EPS) : ks.find(x => x.t > t + KF.EPS);
      return k ? S.setTime(c.t0 + k.t + 1e-3) : S.toast(+b.dataset.kfnav < 0 ? 'Không còn keyframe phía trước' : 'Không còn keyframe phía sau');
    }
    S.pushUndo(); delete o.kf; S.changed(true);
  });
  // giá trị thanh của tab theo playhead (không vẽ lại cả Thuộc tính)
  // decorate() đã cập nhật thanh data-kfx có key; thanh chưa có key giữ mặc định

  // ---- chấm keyframe trên timeline (60_keyframes.js đặt --kf-x và bắt chuột cho .kfd) ----
  const dots = (o, t0, pps) => (o.kf || []).map(k => `<i class="kfd ${Math.abs(t0 + k.t - S.T) < KF.EPS ? 'on' : ''}" data-kft="${t0 + k.t}" data-kfx="${(k.t * pps).toFixed(1)}" title="Keyframe ${fmt(t0 + k.t)}: ${esc(names(k).join(', '))}"></i>`).join('');
  S._cblk.push((k, pps) => dots(k.c, k.t0, pps));
  S._blk.push((c, pps) => (c.kind === 'music' && c.obj.kf?.length ? dots(c.obj, c.t0, pps) : ''));

  const st = document.createElement('style');
  st.textContent = `
.clip .kfd { position:absolute; bottom:6px; left:var(--kf-x, 0); width:8px; height:8px; margin-left:-4px; background:rgb(var(--color-warning-text)); border:1px solid rgb(var(--color-black) / .6); transform:rotate(45deg); cursor:pointer; z-index:3; box-shadow:0 0 0 1px rgb(var(--color-white) / .25); }
.clip .kfd:hover, .clip .kfd.on { background:rgb(var(--color-accent-text)); }
#insp .haskf { position:relative; }
#insp .slrow.haskf { padding-right:calc(var(--space-5) + var(--space-1)); }
#insp .kfdia { position:absolute; right:0; top:50%; transform:translateY(-50%); width:var(--space-5); height:var(--space-5); min-width:0; padding:0; border:0; background:none; color:rgb(var(--color-fg-subtle)); }
#insp .kfdia.inl { position:static; transform:none; display:inline-flex; align-items:center; justify-content:center; vertical-align:middle; }
#insp .kfdia .ti { font-size:var(--text-xs); }
#insp .kfdia.has { color:rgb(var(--color-warning-text) / .7); }
#insp .kfdia.on { color:rgb(var(--color-warning-text)); }
#insp .kfdia:hover { color:rgb(var(--color-fg)); }
#kfppanel .kfbar { display:flex; gap:var(--space-2); align-items:center; }
#kfppanel .kflist { display:flex; flex-wrap:wrap; gap:var(--space-2); margin-top:var(--space-2); }
#kfppanel .kflist button { font-size:var(--text-2xs); padding:var(--space-1) var(--space-2); }
#kfppanel .kflist .ti { color:rgb(var(--color-warning-text)); font-size:var(--text-2xs); }`;
  document.head.appendChild(st);
})();
