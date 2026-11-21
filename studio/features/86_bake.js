// S29 M212: tab Hiệu chỉnh trong Thuộc tính clip — Phông xanh (ống hút màu), LUT .cube, HSL, Curves, Ổn định hình. Nướng sẵn bằng ffmpeg
// (C39): lõi engine/bake.js (window.BakeCore), route studio/routes/86_bake.mjs, job nền `bake` của scripts/queue.mjs.
// Kéo thanh: tham số đổi ngay trên clip.bake, engine thấy hash lệch nên đọc chuỗi gốc + CSS gần đúng (HSL / curves). Thả tay: xếp việc
// nướng; xong thì gắn clip.bake.seq / hash (/p540) cho mọi clip cùng hash. Tiến độ + Huỷ ở ô trạng thái của tab (việc nằm trong hàng đợi).
// Studio.bake = { tab(c), run(idx), state(idx) } — 75_ask.js gọi run sau khi người dùng Nhận đề xuất của Claude (clip_bake).
'use strict';
(() => {
  const S = window.Studio, BK = window.BakeCore;
  if (!S || !BK) return;
  const { esc, sect } = S;
  const JOBS = new Map(); // hash → { id, state, step, progress, error }
  const css = document.createElement('style');
  css.textContent = `#bkpanel .bkrow { display:flex; gap:var(--space-2); align-items:center; flex-wrap:wrap; margin:var(--space-2) 0; }
#bkpanel .bkrow input[type=color] { width:var(--h-md); height:var(--h-md); padding:0; border:1px solid rgb(var(--color-line)); border-radius:var(--radius-sm); background:none; }
#bkpanel .bkframe { position:relative; width:100%; aspect-ratio:var(--bk-ar, 9/16); max-height:220px; background:rgb(var(--color-surface-sunken)); border-radius:var(--radius-sm); overflow:hidden; cursor:crosshair; }
#bkpanel .bkframe img { width:100%; height:100%; object-fit:contain; display:block; }
#bkpanel .bkstat { display:flex; gap:var(--space-2); align-items:center; font-size:var(--text-xs); color:rgb(var(--color-fg-muted)); margin-bottom:var(--space-2); }
#bkpanel .bkstat .bar { flex:1; height:4px; border-radius:var(--radius-pill); background:rgb(var(--color-line)); overflow:hidden; }
#bkpanel .bkstat .bar i { display:block; height:100%; width:var(--w, 0%); background:rgb(var(--color-accent-text)); }
#bkpanel .bkstat.ok { color:rgb(var(--color-success-text)); }
#bkpanel .bkstat.err { color:rgb(var(--color-danger-text)); }
#bkpanel button.on { background:rgb(var(--color-accent-soft) / .24); border-color:rgb(var(--color-accent-text) / .5); }`;
  document.head.appendChild(css);

  const GREEN = '#00b140'; // design-token-ok: màu phông xanh mặc định (màu trong video, không phải màu giao diện)
  const fps = () => S.TL?.fps || 30;
  const cur = () => (S.sel?.kind === 'clip' ? S.sel : null);
  const get = (o, k) => k.split('.').reduce((x, p) => (x == null ? x : x[p]), o);
  const DEF = { 'chroma.strength': 40, 'chroma.edge': 10, 'chroma.spill': 50, 'lut.mix': 100 };
  const val = (b, k) => get(b, k) ?? DEF[k] ?? 0;
  const slider = (b, k, a, z, lab, unit = '') => `<div class="slrow"><span>${esc(lab)}</span><input type="range" data-bk="${k}" min="${a}" max="${z}" step="1" value="${val(b, k)}"><b>${val(b, k)}${unit}</b></div>`;
  // ảnh khung gốc của clip tại playhead (nằm trong clip) hoặc giữa clip — để hút màu nền
  function frameUrl(c) {
    try {
      const k = clipLayout()[c.idx]; if (!k) return '';
      const t = S.T >= k.t0 && S.T < k.t1 ? S.T : (k.t0 + k.t1) / 2;
      return clipFrameUrl({ ...c.obj, bake: undefined }, srcAt(k, t));
    } catch { return ''; }
  }

  function status(o) {
    const sp = BK.spec(o, fps()), st = BK.state(o, fps());
    if (st === 'none') return `<div class="bkstat" id="bkstat">${typeof o.src === 'string' ? 'Ảnh tĩnh: chưa nướng được, chỉ clip video.' : 'Chưa có hiệu chỉnh nào.'}</div>`;
    if (st === 'ready') return `<div class="bkstat ok" id="bkstat"><i class="ti ti-circle-check"></i> Đã nướng ${BK.label(BK.ops(o.bake))} · ${sp.n1 - sp.n0 + 1} khung${o.bake.p540 ? ' · có 540p' : ''}</div>`;
    const j = JOBS.get(sp.hash);
    if (j && ['queued', 'running'].includes(j.state)) return `<div class="bkstat" id="bkstat"><i class="ti ti-loader-2 spin"></i><span>${esc(j.state === 'queued' ? 'Đang chờ lượt…' : j.step || 'Đang nướng…')}</span>
      <span class="bar" style="--w:${Math.round((j.progress || 0) * 100)}%"><i></i></span><!-- design-token-ok: % tiến độ --><button data-bkact="cancel" title="Huỷ việc nướng"><i class="ti ti-x"></i> Huỷ</button></div>`;
    if (j?.state === 'error') return `<div class="bkstat err" id="bkstat"><i class="ti ti-alert-triangle"></i> ${esc(j.error || 'Nướng lỗi')} <button data-bkact="run">Thử lại</button></div>`;
    return `<div class="bkstat" id="bkstat"><i class="ti ti-eye"></i> Đang xem gần đúng (chưa nướng). <button data-bkact="run"><i class="ti ti-flame"></i> Nướng</button></div>`;
  }

  function tab(c) {
    const o = c.obj, b = o.bake || {}, still = typeof o.src === 'string';
    if (still) return sect('', '<div class="help">Hiệu chỉnh nướng sẵn chỉ cho clip video (chuỗi khung). Ảnh tĩnh dùng tab Màu.</div>');
    const k = b.chroma, band = b.hsl?.band || 'all';
    const chroma = `<div class="bkrow"><button data-bkact="chroma" class="${k ? 'on' : ''}"><i class="ti ti-${k ? 'toggle-right' : 'toggle-left'}"></i> ${k ? 'Đang tách nền' : 'Bật tách nền'}</button>
        <input type="color" data-bk="chroma.color" value="${esc(k?.color || GREEN)}" title="Màu nền cần xoá"><button data-bkact="pick" title="Hút màu nền trên khung"><i class="ti ti-color-picker"></i> Hút màu</button></div>
      <div class="bkframe" data-bkpick hidden style="--bk-ar:${(S.TL?.width || 9) / (S.TL?.height || 16)}"><img alt="Khung gốc để hút màu" data-bkimg></div><!-- design-token-ok: tỉ lệ khung -->
      ${k ? slider(b, 'chroma.strength', 0, 100, 'Cường độ') + slider(b, 'chroma.edge', 0, 100, 'Viền mềm') + slider(b, 'chroma.spill', 0, 100, 'Khử ánh màu') : ''}
      <div class="help">Phần nền xoá đi lộ lớp bên dưới. ${S.tip('Bấm Hút màu rồi chọn điểm nền trên khung xem trước (hoặc trên ảnh khung hiện ra).')}</div>`;
    const lut = `<div class="bkrow"><button data-bkact="lut"><i class="ti ti-file-upload"></i> ${b.lut ? 'Đổi file .cube' : 'Nhập file .cube'}</button>${b.lut ? `<span class="muted">${esc(b.lut.name || 'LUT')}</span><button data-bkact="lutoff" title="Bỏ LUT"><i class="ti ti-x"></i></button>` : ''}
      <input type="file" accept=".cube" data-bklut hidden></div>${b.lut ? slider(b, 'lut.mix', 0, 100, 'Độ mạnh', '%') : ''}`;
    const hsl = `<div class="bkrow">${BK.BANDS.map(x => `<button class="${band === x ? 'on' : ''}" data-bkband="${x}">${esc(BK.BAND_VI[x])}</button>`).join('')}</div>
      ${slider(b, 'hsl.hue', -180, 180, 'Sắc độ', '°')}${slider(b, 'hsl.sat', -100, 100, 'Bão hoà')}${slider(b, 'hsl.light', -100, 100, 'Độ sáng')}`;
    const pre = b.curves?.preset || 'none';
    const curves = `<div class="bkrow"><select data-bk="curves.preset">${BK.CURVES.map(x => `<option value="${x}" ${pre === x ? 'selected' : ''}>${esc(BK.CURVES_VI[x])}</option>`).join('')}</select></div>
      ${slider(b, 'curves.shadows', -50, 50, 'Vùng tối')}${slider(b, 'curves.highlights', -50, 50, 'Vùng sáng')}`;
    const stab = `${slider(b, 'stab.strength', 0, 100, 'Mức ổn định')}<div class="help">0 = tắt. Khung phóng nhẹ để giấu mép.</div>`;
    return `<div id="bkpanel">${status(o)}${sect('Phông xanh', chroma, 'ti-background')}${sect('LUT .cube', lut, 'ti-file-lambda')}${sect('HSL', hsl, 'ti-color-swatch')}
      ${sect('Curves', curves, 'ti-chart-line')}${sect('Ổn định hình', stab, 'ti-focus-centered')}
      <div class="acts"><button data-bkact="reset" ${o.bake ? '' : 'disabled'}><i class="ti ti-restore"></i> Bỏ mọi hiệu chỉnh</button></div></div>`;
  }

  // ---------- sửa ----------
  const locked = o => { if (!o.locked) return false; S.toast('Mục đang khoá · ⌥⇧L để mở khoá'); return true; };
  function setKey(o, k, v) {
    const [g, f] = k.split('.');
    o.bake = { ...(o.bake || {}) };
    o.bake[g] = { ...(o.bake[g] || {}), [f]: ['color', 'preset', 'band'].includes(f) ? v : +v };
    if (g === 'stab' && !+v) delete o.bake.stab; // tham số chưa có tác dụng vẫn giữ (vd. dải màu HSL đã chọn); BK.ops bỏ qua
  }
  const paintStat = () => { const el = document.getElementById('bkstat'), c = cur(); if (el && c) el.outerHTML = status(c.obj); };
  let timer = 0;
  const later = idx => { clearTimeout(timer); timer = setTimeout(() => run(idx), 350); };

  document.addEventListener('input', e => {
    const r = e.target.closest?.('#bkpanel [data-bk]'), c = cur(); if (!r || !c || locked(c.obj)) return;
    if (r.type === 'file') return;
    S.pushUndo('bk' + r.dataset.bk); // kéo liền một thanh = một bước hoàn tác
    setKey(c.obj, r.dataset.bk, r.value);
    const lab = r.parentNode.querySelector('b'); if (lab) lab.textContent = r.value + (/mix/.test(r.dataset.bk) ? '%' : /hue/.test(r.dataset.bk) ? '°' : '');
    S.changed(); paintStat();
  });
  // thả thanh / chọn màu / chọn preset → nướng
  document.addEventListener('change', e => {
    const c = cur();
    const f = e.target.closest?.('#bkpanel [data-bklut]');
    if (f && c) return importLut(c, f.files?.[0]);
    if (!e.target.closest?.('#bkpanel [data-bk]') || !c) return;
    later(c.idx);
  });
  document.addEventListener('click', async e => {
    if (!e.target.closest?.('#bkpanel')) return;
    const c = cur(); if (!c) return;
    const o = c.obj;
    const bd = e.target.closest('[data-bkband]');
    if (bd) { if (locked(o)) return; S.pushUndo(); setKey(o, 'hsl.band', bd.dataset.bkband); S.changed(true); return later(c.idx); }
    const img = e.target.closest('[data-bkimg]');
    if (img) return pickFromImg(c, img, e);
    const a = e.target.closest('[data-bkact]')?.dataset.bkact; if (!a) return;
    if (a === 'cancel') { const j = JOBS.get(BK.spec(o, fps())?.hash); if (j?.id) await S.api('/api/autopilot/item', { id: j.id, action: 'cancel' }).catch(() => {}); return; }
    if (a === 'run') return run(c.idx);
    if (locked(o)) return;
    if (a === 'chroma') { S.pushUndo(); if (o.bake?.chroma) { delete o.bake.chroma; if (!BK.ops(o.bake)) delete o.bake; } else setKey(o, 'chroma.color', GREEN); S.changed(true); return later(c.idx); }
    if (a === 'pick') return eyedrop(c);
    if (a === 'lut') return document.querySelector('#bkpanel [data-bklut]')?.click();
    if (a === 'lutoff') { S.pushUndo(); delete o.bake.lut; if (!BK.ops(o.bake)) delete o.bake; S.changed(true); return later(c.idx); }
    if (a === 'reset') { S.pushUndo(); delete o.bake; S.changed(true); }
  });

  // ---------- ống hút màu ----------
  const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  function setColor(c, col) {
    S.pushUndo(); setKey(c.obj, 'chroma.color', col.toLowerCase()); S.changed(true); S.toast(`Màu nền ${col}`); later(c.idx);
  }
  async function eyedrop(c) {
    // Chrome / Edge: hút ngay trên khung xem trước (EyeDropper API); không có thì hiện ảnh khung trong panel để bấm
    if (window.EyeDropper) {
      try { const r = await new window.EyeDropper().open(); if (r?.sRGBHex) return setColor(c, r.sRGBHex.length === 7 ? r.sRGBHex : GREEN); return; } catch { return; }
    }
    const box = document.querySelector('#bkpanel [data-bkpick]'), im = box?.querySelector('img'); if (!box || !im) return;
    im.src = frameUrl(c); box.hidden = false;
  }
  function pickFromImg(c, im, e) {
    if (!im.naturalWidth) return;
    const r = im.getBoundingClientRect(), s = Math.min(r.width / im.naturalWidth, r.height / im.naturalHeight);
    const ox = (r.width - im.naturalWidth * s) / 2, oy = (r.height - im.naturalHeight * s) / 2;
    const x = Math.floor((e.clientX - r.left - ox) / s), y = Math.floor((e.clientY - r.top - oy) / s);
    if (x < 0 || y < 0 || x >= im.naturalWidth || y >= im.naturalHeight) return;
    const cv = document.createElement('canvas'); cv.width = 5; cv.height = 5;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(im, x - 2, y - 2, 5, 5, 0, 0, 5, 5);
    const d = g.getImageData(0, 0, 5, 5).data; let R = 0, G = 0, B = 0;
    for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
    im.closest('[data-bkpick]').hidden = true;
    setColor(c, hex(Math.round(R / 25), Math.round(G / 25), Math.round(B / 25)));
  }

  // ---------- LUT ----------
  async function importLut(c, file) {
    if (!file) return;
    if (file.size > 8e6) return S.toast('File .cube quá lớn (tối đa 8 MB)');
    const text = await file.text();
    if (!BK.cubeOk(text)) return S.toast('File .cube không hợp lệ (cần LUT_3D_SIZE và đủ dòng màu)');
    const r = await S.api('/api/bake/lut', { name: file.name, text }).catch(e => ({ error: e.message }));
    if (!r?.ok) return S.toast(r?.error || 'Chưa lưu được LUT');
    S.pushUndo();
    c.obj.bake = { ...(c.obj.bake || {}), lut: { file: r.file, name: r.name, mix: c.obj.bake?.lut?.mix ?? 100 } };
    S.changed(true); later(c.idx);
  }

  // ---------- nướng ----------
  // gắn kết quả cho mọi clip có cùng hash (clip nhân bản, bản timeline sau hoàn tác)
  function attach(hash, r) {
    let n = 0;
    for (const o of S.TL?.clips || []) {
      const sp = BK.spec(o, fps()); if (!sp || sp.hash !== hash) continue;
      if (o.bake.seq === r.seq && o.bake.hash === hash && !!o.bake.p540 === !!r.p540) continue;
      Object.assign(o.bake, { seq: r.seq, hash }); if (r.p540) o.bake.p540 = true; else delete o.bake.p540;
      n++;
    }
    if (n) S.changed(true);
    return n;
  }
  async function run(idx) {
    const o = S.TL?.clips?.[idx], sp = o && BK.spec(o, fps());
    if (!sp || BK.state(o, fps()) === 'ready') return;
    const old = JOBS.get(sp.hash); if (old && ['queued', 'running'].includes(old.state)) return;
    const pid = S.META?.pid;
    JOBS.set(sp.hash, { state: 'queued', step: 'Đang xếp việc…', progress: 0 }); paintStat();
    const r = await S.api('/api/bake', { spec: { seq: sp.seq, fps: sp.fps, n0: sp.n0, n1: sp.n1, ops: sp.ops, hash: sp.hash } }).catch(e => ({ error: e.message }));
    if (!r?.ok) { JOBS.set(sp.hash, { state: 'error', error: r?.error || 'Chưa xếp được việc' }); paintStat(); return; }
    if (r.ready) { JOBS.delete(sp.hash); attach(sp.hash, r.ready); return; }
    JOBS.set(sp.hash, r.item || { state: 'queued' }); paintStat();
    for (let i = 0; i < 900; i++) { // ≤ ~20 phút
      await new Promise(ok => setTimeout(ok, 1300));
      if (S.META?.pid !== pid) return JOBS.delete(sp.hash); // đổi dự án giữa lúc chờ
      const g = await S.api('/api/bake?hash=' + sp.hash).catch(() => null);
      if (g?.ready) { JOBS.delete(sp.hash); if (attach(sp.hash, g.ready)) S.toast(`Đã nướng ${BK.label(sp.ops)}`); paintStat(); return; }
      const j = g?.job; if (!j) continue;
      JOBS.set(sp.hash, j); paintStat();
      if (j.state === 'cancelled') { JOBS.delete(sp.hash); paintStat(); return S.toast('Đã huỷ nướng hiệu chỉnh'); }
      if (j.state === 'error') return S.toast('Nướng lỗi: ' + (j.error || ''));
    }
  }
  S.bakeTab = tab;
  S.bake = { tab, run, state: idx => BK.state(S.TL?.clips?.[idx], fps()) };
})();
