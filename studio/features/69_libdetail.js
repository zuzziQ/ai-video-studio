// S21 M147: chi tiết mục thư viện ở cột phải. Bấm (hoặc Enter / Space) một mục của thư viện trái — mẫu, mẫu chữ, kiểu phụ đề, hiệu ứng /
// khối HyperFrames, sticker, hình khối, nhạc / SFX, chuyển cảnh, bộ lọc — thì tab Thuộc tính hiện chi tiết (xem trước lớn, tên, gói,
// thời lượng, thông tin theo loại; lõi thuần 69_libdetail.core.js) và nút Thêm tại playhead / Áp dụng / Áp cho cả video. library.js:
// libItemOf (mục nào), libAct (chèn / áp như bấm cũ), bấm đúp = chèn ngay.
//   Không chọn element: Studio.right.setDetail (renderInspector vẽ chi tiết). Có chọn: inspector giữ nguyên, khối ghim "Áp lên element
//   đang chọn" chèn lên đầu #insp (theo dõi bằng MutationObserver, không sửa renderInspector) khi mục cùng loại với element (nút Thay)
//   hoặc mục vừa bấm lúc đang chọn element đó.
//   Esc, nút đóng, đổi panel trái → setDetail(null). Mục đang xem có viền nổi bật (.libsel) ở thư viện.
'use strict';
(() => {
  const S = window.Studio, C = window.LibDetailCore;
  if (!S || !C || !S.right || typeof libAct !== 'function') return;
  const { $, esc } = S;
  const insp = $('#insp'), body = $('#libbody');
  let cur = null, pinFor = null, lastPanel = typeof panel === 'string' ? panel : '';
  const ATTR = Object.fromEntries(LIB_ITEMS);
  const selInfo = () => { const c = S.sel; return c ? { kind: c.kind, type: c.obj?.type, idx: c.idx } : null; };
  const capLabels = () => (S.win && S.win.CAPTION_LABELS) || {};

  // ---- dữ liệu của mục (chỉ dữ liệu có sẵn trong trang) ----
  function info(kind, id) {
    const ctx = { sel: selInfo() };
    if (kind === 'tpl') {
      const t = (TEMPLATES || []).find(x => x.id === id); if (!t) return null;
      return ['tpl', t, { ...ctx, pack: pk(t.pack), catName: catName(t), capLabel: capLabels()[t.caption_style], moodVi: MOOD_VI, nameOf: s => sceneName(s), vertical: S.DH > S.DW, layout: LAYOUT }];
    }
    if (kind === 'text') { const p = TEXT_PRESETS[+id]; return p && ['text', p, { ...ctx, anims: ANIM_LIST }]; }
    if (kind === 'cs') {
      const own = packs().find(p => p.caption === id || p.id === id);
      const label = id === '' ? 'Karaoke cơ bản' : id === 'none' ? 'Tắt phụ đề' : capLabels()[id] || id;
      return ['cs', { id, label, pack: own, current: (S.TL?.caption_style ?? '') === id }, ctx];
    }
    if (kind === 'fx') {
      const [i, j] = String(id).split(':').map(Number), p = packs()[i], it = p?.items[j]; if (!it) return null;
      let dur = 0; try { const s = it.make(0); dur = (s.t1 || 0) - (s.t0 || 0); } catch { /* item lỗi: bỏ thời lượng */ }
      const k = `${p.id}__${j}`, has = THUMBS && (Array.isArray(THUMBS.items) ? THUMBS.items.some(x => x.key === k) : THUMBS[k]);
      const block = it.type === 'hf' ? S.win?.HF_CATALOG?.[it.block] : null;
      return [block ? 'hf' : 'fx', { pack: p, item: it, block, dur, thumb: has ? `/studio/thumbs/${k}.jpg` : '' },
        { ...ctx, horizontal: S.DW > S.DH, nameOf: s => sceneName(s), varLabel: S.hfVarLabel }];
    }
    if (kind === 'sticker') return STICKERS.includes(id) && ['sticker', { ch: id, url: fluentUrl(id) }, ctx];
    if (kind === 'shape') { const k = (S.SHAPE_KINDS || []).find(x => x[0] === id); return k && ['shape', { label: k[1], svg: k[2] }, ctx]; }
    if (kind === 'music') return ['music', { id, src: `/assets/music/${id}.mp3`, ic: MOOD_IC[id.replace(/_\d+$/, '')] }, { ...ctx, moodVi: MOOD_VI }];
    if (kind === 'sfx') return ['sfx', { id, src: sfxUrl(id), file: LIB.sfx.find(x => x.replace(/\.\w+$/, '') === id) }, ctx];
    if (kind === 'trans') { const t = TRANS_TYPES.find(x => x[0] === id) || ['', 'Không', 'ti-ban']; return ['trans', { id, label: t[1], ic: t[2] }, { ...ctx, dur: transDur }]; }
    if (kind === 'filter') {
      const f = FILTERS.find(x => x[0] === id); if (!f) return null;
      const k = S.sel?.kind === 'clip' ? clipLayout()[S.sel.idx] : clipAtT(S.T);
      const img = k ? clipFrameUrl(k.c, srcAt(k, Math.max(k.t0, Math.min(S.T, k.t1 - .05)))) : '';
      return ['filter', { label: f[1], img, css: id ? LUT_CSS[id] : 'none' }, ctx];
    }
    return null;
  }
  const describe = () => { if (!cur) return null; const x = info(cur.kind, cur.id); return x ? C.describe(x[0], cur.id, x[1], x[2]) : null; };

  // ---- vẽ ----
  function preview(p, small) {
    if (!p) return '';
    if (p.t === 'video') return `<video src="${esc(p.src)}" poster="${esc(p.poster || '')}" ${small ? '' : 'autoplay'} muted loop playsinline${small ? '' : ' controls'}></video>`;
    if (p.t === 'img') return `<img src="${esc(p.src)}" alt="" draggable="false">`;
    if (p.t === 'emoji') return `<span class="ldemoji">${esc(p.ch)}</span>`;
    if (p.t === 'text') return `<b class="ldtext"><span data-dcss="${esc(p.css)}">${esc(p.text)}</span></b>`;
    if (p.t === 'svg') return `<svg viewBox="0 0 24 24" class="ldsvg">${p.svg}</svg>`; // svg: hằng số KINDS của 64_shapes.js
    if (p.t === 'audio') return small ? `<i class="ti ${esc(p.ic)} ldic"></i>` : `<i class="ti ${esc(p.ic)} ldic"></i><audio controls preload="metadata" src="${esc(p.src)}"></audio>`;
    if (p.t === 'trans') return `<span class="tr ldtr"><span class="demo t-${esc(p.k)}"><i class="a"></i><i class="b"></i><i class="ti ${esc(p.ic)} ic"></i></span></span>`;
    if (p.t === 'filter') return `<span class="ldfl" data-dbg="${esc(p.img)}" data-dfx="${esc(p.css)}"></span>`;
    return `<i class="ti ${esc(p.ic || 'ti-sparkles')} ldic"></i>`;
  }
  const btns = d => d.actions.map(a => `<button data-ldact="${a.a}" class="${a.primary ? 'primary' : ''}"><i class="ti ${a.ic}"></i> ${esc(a.label)}</button>`).join('');
  const pvCls = p => `ldpv ld-${p?.t || 'icon'}${p?.h ? ' h' : ''}${p?.sq ? ' sq' : ''}`;
  function fullHtml() {
    const d = describe(); if (!d) return '<div class="rempty"><b>Mục này không còn trong thư viện</b></div>';
    const row = ([k, v]) => `<dt>${esc(k)}</dt><dd${v === '…' ? ' data-ldlen' : ''}>${esc(v)}</dd>`;
    return `<div class="ld" data-ldkey="${esc(d.key)}">
      <div class="ldhead"><span class="pill">${esc(d.kindLabel)}</span><span class="grow"></span><button class="icon" data-ldact="close" title="Đóng chi tiết (Esc)"><i class="ti ti-x"></i></button></div>
      <div class="${pvCls(d.preview)}">${preview(d.preview)}</div>
      <h3>${esc(d.title)}</h3>
      ${d.chips.length ? `<div class="ldchips">${d.chips.map(c => `<span class="pill">${esc(c)}</span>`).join('')}</div>` : ''}
      ${d.desc ? `<p class="lddesc">${esc(d.desc)}</p>` : ''}
      ${d.warn ? `<div class="help warn"><i class="ti ti-alert-triangle"></i> ${esc(d.warn)}</div>` : ''}
      <div class="acts ldacts">${btns(d)}</div>
      ${d.rows.length ? `<dl class="ldrows">${d.rows.map(row).join('')}</dl>` : ''}
      ${d.colors.length ? `<div class="ldcolors">${d.colors.map(c => `<span><i data-dfill="${esc(c.v)}"></i>${esc(c.k)}</span>`).join('')}</div>` : ''}
      ${d.lists.map(l => `<div class="ldlist"><b><i class="ti ${l.ic}"></i> ${esc(l.title)}</b><ul>${l.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}
      ${d.note ? `<div class="help">${esc(d.note)}</div>` : ''}
      <div class="help muted">Bấm đúp vào ô ở thư viện hoặc kéo vào khung / timeline để chèn ngay.</div></div>`;
  }
  function pinHtml(d) {
    return `<div class="ldpin" data-ldkey="${esc(d.key)}"><div class="ldpinh"><i class="ti ti-pin"></i><b>Áp lên element đang chọn</b><span class="grow"></span>
        <button class="icon" data-ldact="close" title="Đóng (Esc)"><i class="ti ti-x"></i></button></div>
      <div class="ldpinb"><span class="${pvCls(d.preview)}">${preview(d.preview, true)}</span><div><b>${esc(d.title)}</b><small>${esc([d.kindLabel, ...d.chips].filter((c, i, a) => c && a.indexOf(c) === i).slice(0, 2).join(' · '))}</small></div></div>
      <div class="acts">${btns(d)}<button data-ldact="full" class="ghost" title="Bỏ chọn element để xem đủ chi tiết"><i class="ti ti-info-circle"></i> Chi tiết</button></div></div>`;
  }
  // mount: độ dài nhạc / SFX đọc từ thẻ audio (preload=metadata, không gọi server)
  function mount(el) {
    const a = el.querySelector('.ld audio'), len = el.querySelector('[data-ldlen]');
    if (a && len) a.addEventListener('loadedmetadata', () => { len.textContent = isFinite(a.duration) ? `${Math.round(a.duration * 10) / 10} giây` : '—'; }, { once: true });
  }
  const DETAIL = { get html() { return fullHtml(); }, mount };

  // khối ghim khi có element đang chọn
  const pinShown = () => { const d = cur && S.sel && insp.dataset.rtab === 'props' ? describe() : null; return d && (d.replace || pinFor === S.sel.obj) ? d : null; };
  function syncPin() {
    const old = insp.querySelector(':scope > .ldpin'), d = pinShown();
    if (!d) { old?.remove(); return; }
    if (old?.dataset.ldkey === d.key && old.dataset.sel === String(S.sel.obj.cid ?? '')) return;
    const w = document.createElement('div'); w.innerHTML = pinHtml(d);
    const el = w.firstElementChild; el.dataset.sel = String(S.sel.obj.cid ?? '');
    old ? old.replaceWith(el) : insp.prepend(el);
  }
  new MutationObserver(() => syncPin()).observe(insp, { childList: true });

  // viền nổi bật của mục đang xem
  function mark() {
    for (const el of body.querySelectorAll('.libsel')) el.classList.remove('libsel');
    if (!cur) return;
    const a = ATTR[cur.kind], el = a && body.querySelector(`[${a}="${CSS.escape(cur.id)}"]`);
    el?.classList.add('libsel');
  }
  new MutationObserver(() => { if (cur && !body.querySelector('.libsel')) mark(); }).observe(body, { childList: true });

  function pick(kind, id) {
    if (!info(kind, id)) return;
    cur = { kind, id }; pinFor = S.sel?.obj || null;
    mark(); S.right.setDetail(DETAIL); syncPin();
    const sc = insp.closest('#right') || insp; sc.scrollTop = 0; // chi tiết / khối ghim nằm ở đầu cột phải
  }
  function clear() {
    if (!cur) return;
    cur = null; pinFor = null; mark();
    insp.querySelector(':scope > .ldpin')?.remove();
    S.right.setDetail(null);
  }

  // ---- nút ----
  async function replace() {
    const d = describe(), c = S.sel; if (!d?.replace || !c) return;
    const o = c.obj, id = cur.id;
    if (d.replace === 'clip') return libAct(cur.kind, id);
    if (d.replace === 'scene') {
      const i = S.TL.scenes.indexOf(o), [pi, j] = id.split(':').map(Number), it = packs()[pi]?.items[j]; if (i < 0 || !it) return;
      S.pushUndo();
      const s = await fillDemoMedia(JSON.parse(JSON.stringify(it.make(o.t0))));
      s.t0 = o.t0; s.t1 = o.t1; // giữ thời gian; cùng loại cảnh (hoặc cùng là khối HF) thì giữ cả vị trí, cỡ
      if (s.type === o.type) for (const k of ['x', 'y', 'size']) if (o[k] != null) s[k] = o[k];
      if (o.added) s.added = true;
      S.TL.scenes[i] = s; S.changed();
      S.select(S.compOf(s) || S.compOf(s.lines?.[0]));
    } else {
      S.pushUndo();
      if (d.replace === 'sticker') o.src = id;
      else if (d.replace === 'text') { const p = TEXT_PRESETS[+id].p; for (const k of ['style', 'size', 'anim', 'italic', 'weight', 'font', 'upper']) delete o[k]; Object.assign(o, p); }
      else if (d.replace === 'shape') S.shapeKind?.(o, id);
      else if (d.replace === 'music') { o.mood = id; delete o.file; }
      else if (d.replace === 'sfx') o.name = id;
      S.changed(true);
    }
    S.toast(`Đã thay bằng “${d.title}” · ⌘Z để hoàn tác`);
  }
  insp.addEventListener('click', e => {
    const b = e.target.closest('[data-ldact]'); if (!b || !cur) return;
    const a = b.dataset.ldact, { kind, id } = cur;
    if (a === 'close') return clear();
    if (a === 'full') return S.select(null);
    if (a === 'big') return openTplDetail(id, tplFilter(tplCat, query));
    if (a === 'replace') return replace();
    if (a === 'add' || a === 'apply' || a === 'all') {
      const r = libAct(kind, id, a === 'all' ? 'all' : undefined);
      if (a !== 'add' && !S.sel) Promise.resolve(r).then(() => S.right.detail && S.right.refresh()); // "đang dùng" của kiểu phụ đề…
    }
  });
  // Esc: đóng chi tiết (sau Esc của studio.js = bỏ chọn element). Popup mẫu tự chặn Esc (capture); đang gõ thì bỏ qua.
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !cur) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
    clear();
  });
  // đổi panel trái → đóng chi tiết
  S._rail.push(() => { const p = typeof panel === 'string' ? panel : ''; if (p !== lastPanel) { lastPanel = p; clear(); } });

  S.libDetail = { pick, clear, get cur() { return cur; } };

  const st = document.createElement('style');
  st.textContent = `
#libbody .libsel { outline: 2px solid rgb(var(--color-accent)); outline-offset: 1px; border-radius: var(--radius-control); }
#libbody .tpl.libsel .tv, #libbody .fx.libsel .fth { border-color: rgb(var(--color-accent)); }
#insp .ld { padding: var(--space-3) var(--space-3) var(--space-6); display: flex; flex-direction: column; gap: var(--space-2); }
#insp .ld h3 { margin: 0; font-size: var(--text-md); color: rgb(var(--color-fg)); }
#insp .ldhead, #insp .ldpinh { display: flex; align-items: center; gap: var(--space-2); }
#insp .ldhead .grow, #insp .ldpinh .grow { flex: 1; }
#insp .ldpv { position: relative; border-radius: var(--radius-card); overflow: hidden; border: 1px solid rgb(var(--color-line)); background: radial-gradient(ellipse at 50% 40%, rgb(var(--color-surface-muted)), rgb(var(--color-surface)));
  display: flex; align-items: center; justify-content: center; min-height: 120px; }
#insp .ld .ldpv.ld-video, #insp .ld .ldpv.ld-img { aspect-ratio: 9/16; max-height: 240px; }
#insp .ld .ldpv.h { aspect-ratio: 16/9; }
#insp .ld .ldpv.sq { aspect-ratio: 1; max-height: 200px; }
#insp .ldpv video, #insp .ldpv img { width: 100%; height: 100%; object-fit: contain; display: block; }
#insp .ld-audio { flex-direction: column; gap: var(--space-2); padding: var(--space-3); min-height: 0; }
#insp .ld-audio audio { width: 100%; }
#insp .ldic { font-size: 44px; color: rgb(var(--color-fg-muted)); }
#insp .ldemoji { font-size: 72px; line-height: 1; }
#insp .ldtext { display: inline-block; transform: scale(1.7); font-weight: inherit; }
#insp .ldsvg { width: 96px; height: 96px; fill: rgb(var(--color-accent)); color: rgb(var(--color-accent)); }
#insp .ld-trans { aspect-ratio: 16/10; min-height: 0; border: 0; background: none; }
#insp .ldtr { display: block; width: 100%; }
#insp .ldtr .demo { width: 100%; }
#insp .ldfl { width: 100%; aspect-ratio: 9/16; max-height: 320px; background: rgb(var(--color-surface-muted)) center / cover no-repeat; }
#insp .ldchips { display: flex; flex-wrap: wrap; gap: var(--space-1); }
#insp .lddesc { margin: 0; color: rgb(var(--color-fg-muted)); font-size: var(--text-xs); }
#insp .ldacts, #insp .ldpin .acts { display: flex; flex-wrap: wrap; gap: var(--space-2); }
#insp .ldrows { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-1) var(--space-3); margin: var(--space-1) 0; font-size: var(--text-xs); }
#insp .ldrows dt { color: rgb(var(--color-fg-subtle)); }
#insp .ldrows dd { margin: 0; color: rgb(var(--color-fg)); overflow-wrap: anywhere; }
#insp .ldcolors { display: flex; flex-wrap: wrap; gap: var(--space-2); font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); }
#insp .ldcolors span { display: inline-flex; align-items: center; gap: var(--space-1); }
#insp .ldcolors i { width: 16px; height: 16px; border-radius: var(--radius-xs); border: 1px solid rgb(var(--color-line-strong)); }
#insp .ldlist { font-size: var(--text-xs); }
#insp .ldlist b { display: flex; align-items: center; gap: var(--space-1); color: rgb(var(--color-fg)); }
#insp .ldlist ul { margin: var(--space-1) 0 0; padding-left: var(--space-4); color: rgb(var(--color-fg-muted)); max-height: 180px; overflow: auto; }
#insp > .ldpin { margin: var(--space-2) var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid rgb(var(--color-accent-text) / .5); border-radius: var(--radius-card);
  background: rgb(var(--color-accent-soft) / .12); display: flex; flex-direction: column; gap: var(--space-2); font-size: var(--text-xs); }
#insp .ldpinh b { color: rgb(var(--color-fg)); }
#insp .ldpinb { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
#insp .ldpinb > div { min-width: 0; display: flex; flex-direction: column; }
#insp .ldpinb b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: rgb(var(--color-fg)); }
#insp .ldpinb small { color: rgb(var(--color-fg-subtle)); }
#insp .ldpinb .ldpv { width: 48px; height: 48px; min-height: 0; flex: none; }
#insp .ldpinb .ldpv img, #insp .ldpinb .ldpv video { object-fit: cover; }
#insp .ldpinb .ldemoji { font-size: 28px; } #insp .ldpinb .ldic { font-size: 22px; } #insp .ldpinb .ldsvg { width: 30px; height: 30px; }
#insp .ldpinb .ldtext { transform: scale(.6); } #insp .ldpinb .ldfl { aspect-ratio: auto; height: 100%; }`;
  document.head.appendChild(st);
})();
