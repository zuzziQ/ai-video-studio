// S29 M211: preset người dùng — khối "Của tôi" dùng chung cho panel Chuyển cảnh (83_transui.js tab nhóm), Hoạt ảnh clip
// (81_clipanim.js tab con), Hoạt ảnh Vào / Ra / Lặp (83_anim.js tab con), Màu (82_color.js) và Chữ (studio.js textBlock).
//   Studio.presets.block(kind) → HTML: preset hợp (chung + của thương hiệu đang mở), bấm = áp cho mục đang chọn (cả nhóm Shift),
//   × = xoá, ô tên + Lưu = lưu thuộc tính hiện tại (tích "Của thương hiệu" → brand_id, M189).
//   Studio.presets.brief() → ngữ cảnh cho Claude (75_ask.js info.presets → scripts/ask_route.mjs, gu thương hiệu M192).
// Dữ liệu ở $AVS_HOME/presets.json qua /api/presets (routes/84_presets.mjs); lõi thuần 84_presets.core.js. Áp = một bước hoàn tác.
'use strict';
(() => {
  const S = window.Studio, P = window.PresetsCore;
  if (!S || !P) return;
  const { esc } = S;
  const MEDIA = new Set(['photo', 'broll']);
  let items = [];
  const brand = () => S.META?.kho?.brand || '';

  // obj của comp c nhận được preset loại kind (null = không hợp)
  function objFor(kind, c) {
    if (!c?.obj) return null;
    if (kind === 'trans') return c.kind === 'clip' && c.idx > 0 ? c.obj : null;
    if (kind === 'clip_anim') return c.kind === 'clip' || (c.kind === 'scene' && MEDIA.has(c.obj.type)) ? c.obj : null;
    if (kind === 'anim') return window.CanvasCmds?.animCan(c) ? c.obj : null;
    if (kind === 'color') return S.color?.target(c)?.obj || null;
    if (kind === 'text') return c.kind === 'line' ? c.obj : null;
    return null;
  }
  const HINT = { trans: 'Chọn một clip (không phải clip đầu) để áp', clip_anim: 'Chọn clip, b-roll hoặc ảnh phủ để áp', anim: 'Chọn chữ, hình khối hoặc sticker để áp', color: 'Chọn clip, b-roll hoặc khối Điều chỉnh để áp', text: 'Chọn một dòng chữ để áp' };

  function block(kind) {
    if (!P.KINDS[kind] || (kind === 'text' && S.sel?.kind !== 'line')) return '';
    const list = P.listFor(items, kind, brand()), cur = objFor(kind, S.sel), val = cur ? P.valueOf(kind, cur) : null;
    const chips = list.length ? `<div class="pre-list">${list.map(x => `<span class="pre-chip${x.brand_id ? ' br' : ''}"><button data-preapply="${esc(x.id)}" title="Áp “${esc(x.name)}”${x.brand_id ? ' (của thương hiệu)' : ''}">${x.brand_id ? '<i class="ti ti-building-store"></i>' : ''}${esc(x.name)}</button><button data-predel="${esc(x.id)}" title="Xoá preset" aria-label="Xoá preset ${esc(x.name)}"><i class="ti ti-x"></i></button></span>`).join('')}</div>`
      : `<div class="help">Chưa có preset ${esc(P.KINDS[kind].label.toLocaleLowerCase('vi'))}. Chỉnh xong rồi bấm Lưu để dùng lại ở dự án khác.</div>`;
    const save = `<div class="pre-save"><input data-prename maxlength="40" placeholder="Tên preset" aria-label="Tên preset" ${val ? '' : 'disabled'}>
      <button data-presave ${val ? '' : 'disabled'} title="${val ? 'Lưu thuộc tính đang đặt' : esc(cur ? 'Mục này chưa đặt gì để lưu' : HINT[kind])}"><i class="ti ti-device-floppy"></i> Lưu</button></div>
      ${brand() ? `<label class="check"><input type="checkbox" data-prebrand checked> Của thương hiệu đang mở (Claude ưu tiên dùng)</label>` : ''}`;
    return `<div class="pre-mine" data-prek="${kind}">${chips}${save}${cur ? '' : `<div class="help">${esc(HINT[kind])}.</div>`}</div>`;
  }

  const rerender = () => { S.renderInspector?.(); if (document.querySelector('#libbody .pre-mine')) S.renderPanel?.(); };
  const snap = o => { if (!o._orig) o._orig = JSON.parse(JSON.stringify(o, (k, v) => (k === 'cid' || k === '_orig' ? undefined : v))); };
  function apply(id) {
    const p = items.find(x => x.id === id); if (!p) return;
    const list = [S.sel, ...(S.multi || [])].filter(Boolean).map(c => ({ c, o: objFor(p.kind, c) })).filter(x => x.o && !x.o.locked);
    if (!list.length) return S.toast(HINT[p.kind]);
    S.pushUndo();
    for (const { c, o } of list) { if (c.kind !== 'clip') snap(o); P.applyTo(p.kind, o, p.value); }
    S.changed(true); rerender();
    S.toast(`Đã áp “${p.name}”${list.length > 1 ? ` cho ${list.length} mục` : ''}`);
  }
  async function save(box) {
    const kind = box.dataset.prek, o = objFor(kind, S.sel), value = o && P.valueOf(kind, o);
    if (!value) return S.toast(HINT[kind]);
    const name = box.querySelector('[data-prename]')?.value.trim() || `${P.KINDS[kind].label} ${items.filter(x => x.kind === kind).length + 1}`;
    const own = box.querySelector('[data-prebrand]')?.checked;
    const r = await S.api('/api/presets', { kind, name, value, ...(own && brand() ? { brand_id: brand() } : {}) }).catch(e => ({ error: e.message }));
    if (!r?.ok) return S.toast('Chưa lưu được preset: ' + (r?.error || 'lỗi mạng'));
    items = r.items; rerender(); S.toast(`Đã lưu preset “${r.item?.name || name}”`);
  }
  async function del(id) {
    const r = await S.api('/api/presets/delete', { id }).catch(e => ({ error: e.message }));
    if (!r?.ok) return S.toast('Chưa xoá được: ' + (r?.error || 'lỗi mạng'));
    items = r.items; rerender();
  }
  document.addEventListener('click', e => {
    const box = e.target.closest?.('.pre-mine'); if (!box) return;
    let b;
    if ((b = e.target.closest('[data-preapply]'))) return apply(b.dataset.preapply);
    if ((b = e.target.closest('[data-predel]'))) return del(b.dataset.predel);
    if (e.target.closest('[data-presave]')) return save(box);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.matches?.('.pre-mine [data-prename]')) return;
    e.preventDefault(); save(e.target.closest('.pre-mine'));
  });

  async function load() {
    const r = await S.api('/api/presets').catch(() => null);
    if (Array.isArray(r?.items)) { items = r.items; rerender(); }
  }
  load();
  S.presets = { block, load, objFor, brief: () => P.brief(items, brand()), get items() { return items; } };

  const css = document.createElement('style');
  css.textContent = `
.pre-mine { display: flex; flex-direction: column; gap: var(--space-2); }
.pre-list { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.pre-chip { display: inline-flex; align-items: stretch; border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); overflow: hidden; max-width: 100%; }
.pre-chip.br { border-color: rgb(var(--color-accent-text) / .5); }
.pre-chip button { border: 0; border-radius: 0; background: transparent; padding: var(--space-050) var(--space-2); font-size: var(--text-xs); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pre-chip button + button { padding: var(--space-050) var(--space-1); color: rgb(var(--color-fg-subtle)); border-left: 1px solid rgb(var(--color-line)); }
.pre-chip button:hover { background: rgb(var(--color-accent-soft) / .3); }
.pre-chip .ti { margin-right: 2px; color: rgb(var(--color-accent-text)); }
.pre-save { display: flex; gap: var(--space-1); }
.pre-save input { flex: 1 1 auto; min-width: 0; }`;
  document.head.appendChild(css);
})();
