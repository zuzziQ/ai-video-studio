// S21 M149: mục "Hỏi Claude" trong Thuộc tính (đứng sau mục đầu) cho element đang chọn — ô nhập + gợi ý nhanh, bản vá có kiểm
// (route studio/routes/72_elem_ai.mjs, lõi scripts/elem_ai.mjs), khác biệt cũ → mới; Nhận = một bước ⌘Z, Bỏ = về như cũ.
// "3 biến thể": một lượt mô hình trả 3 bản vá (kiểu chữ / hoạt ảnh / vị trí), ảnh dựng bằng engine headless (POST /api/elem/shots).
// S22 M152: kết quả xem qua Studio.review (74_review.js): dời playhead tới element + phát lặp, trước / sau, chia đôi, phóng to;
// bản xem trước vẽ ở khung riêng, không ghi vào timeline. C27: bấm biến thể (hoặc phím 1/2/3) chỉ xem trên khung, Nhận mới áp.
// Chỉ gọi mô hình khi người dùng bấm (C23), Huỷ được.
// "Gợi ý núm" (M148): element có trường núm (window.Knobs.allowed) → mô hình đề xuất 2–3 núm, server kiểm bằng KnobsCore.validateMap,
// ở đây kiểm lại bằng Knobs.validateMap; "Thêm núm" lưu vào obj.knob_map (một bước ⌘Z), mục Núm vẽ thêm các núm đó.
(() => {
  const S = window.Studio, esc = S.esc;
  const KINDS = new Set(['line', 'cap', 'node', 'badge', 'scene']);
  const QUICK = ['nổi hơn', 'hợp thương hiệu', 'gọn hơn'];
  const FOCUS_IC = { style: 'ti-typography', anim: 'ti-sparkles', pos: 'ti-arrows-move' };
  // st: idle | running | edit (bản vá đang xem trước) | variants | error. Một trạng thái cho cả trang, gắn với cid của element.
  const ST = { cid: null, st: 'idle', ask: '', step: '', res: null, err: null, errKind: '', shots: null, shotErr: '', run: 0 };
  const OWNER = 'elem_ai';
  const RV = () => S.review, mine = () => !!RV()?.active && RV().owner === OWNER;
  const css = document.createElement('style');
  css.textContent = `
#insp .eai { display: flex; flex-direction: column; gap: var(--space-2); }
#insp .eai textarea { min-height: 48px; }
#insp .eai .acts { margin-top: 0; }
#insp .eai-st { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); color: rgb(var(--color-fg-muted)); }
#insp .eai-st .ti-loader-2, #insp .eai-var .th .ti-loader-2 { animation: ui-spin 1s linear infinite; }
#insp .eai-err { font-size: var(--text-xs); color: rgb(var(--color-danger-text)); line-height: 1.45; }
#insp .eai-diff { display: flex; flex-direction: column; gap: var(--space-1); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); padding: var(--space-2); background: rgb(var(--color-surface-muted)); }
#insp .eai-diff .d { display: grid; grid-template-columns: minmax(64px, auto) 1fr; gap: var(--space-2); font-size: var(--text-xs); align-items: baseline; }
#insp .eai-diff .d span { color: rgb(var(--color-fg-muted)); }
#insp .eai-diff .d s { color: rgb(var(--color-fg-subtle)); }
#insp .eai-diff .d b { color: rgb(var(--color-accent-text-strong)); font-weight: 600; word-break: break-word; }
#insp .eai-why, #insp .eai-warn { font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); }
#insp .eai-warn { color: rgb(var(--color-warning-text)); }
#insp .eai-tag { font-size: var(--text-2xs); color: rgb(var(--color-accent-text)); display: flex; align-items: center; gap: var(--space-1); }
#insp .eai-vars { display: flex; flex-direction: column; gap: var(--space-2); }
#insp .eai-var { display: grid; grid-template-columns: 112px minmax(0, 1fr); align-items: start; gap: var(--space-1) var(--space-2); padding: var(--space-1); white-space: normal; border-radius: var(--radius-control); border: 1px solid rgb(var(--color-line)); background: rgb(var(--color-surface-raised)); text-align: left; min-width: 0; }
#insp .eai-vars.wide .eai-var { grid-template-columns: minmax(0, 1fr); }
#insp .eai-var:hover, #insp .eai-var:focus-visible { border-color: rgb(var(--color-line-hover)); }
#insp .eai-var[aria-pressed="true"] { border-color: rgb(var(--color-accent)); background: rgb(var(--color-accent-soft) / .22); }
#insp .eai-var .th { grid-row: span 3; width: 100%; aspect-ratio: 9 / 16; border-radius: var(--radius-control); overflow: hidden; background: rgb(var(--color-surface-muted)); display: flex; align-items: center; justify-content: center; color: rgb(var(--color-fg-subtle)); }
#insp .eai-vars.wide .eai-var .th { grid-row: auto; aspect-ratio: 16 / 9; }
#insp .eai-var .th img { width: 100%; height: 100%; object-fit: cover; display: block; }
#insp .eai-var b { font-size: var(--text-xs); color: rgb(var(--color-fg)); display: flex; align-items: center; gap: var(--space-1); min-width: 0; }
#insp .eai-var b kbd { font-size: var(--text-2xs); padding: 0 var(--space-1); border-radius: var(--radius-xs); border: 1px solid rgb(var(--color-line-strong)); color: rgb(var(--color-fg-muted)); font-weight: 400; }
#insp .eai-var small { font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); line-height: 1.35; overflow-wrap: anywhere; }`;
  document.head.appendChild(css);

  // ---------- đọc / áp trường trừu tượng (cùng hàm của inspector) ----------
  const hasText = c => c.kind === 'line' || c.kind === 'node' || (c.kind === 'scene' && (c.obj.text != null || ['led_text', 'neon_text'].includes(c.obj.type)));
  const canRot = c => !!window.StageCore?.canRotate?.(c.kind);
  function fieldsOf(c) {
    const o = c.obj, f = {}, p = S.getPos(c);
    if (hasText(c)) f.text = o.text || '';
    if (p) { f.x = Math.round(p.x); f.y = Math.round(p.y); f.size = Math.round(p.size * 10) / 10; }
    if (canRot(c)) f.rot = o.rot || 0;
    if (c.kind === 'line' || c.kind === 'scene') f.dur = Math.round((c.t1 - c.t0) * 100) / 100;
    if (['line', 'cap'].includes(c.kind)) { if (o.font) f.font = o.font; if (o.weight) f.weight = o.weight; }
    if (c.kind === 'line') { f.style = o.style || 'white'; f.italic = o.italic !== false; f.anim = o.anim || 'pop'; }
    if (['line', 'cap'].includes(c.kind) || (c.kind === 'scene' && hasText(c))) { if (o.color) f.color = o.color; }
    if (c.kind === 'badge') f.bg = o.bg || '#D97757'; // design-token-ok: màu huy hiệu mặc định của video (như inspector)
    return f;
  }
  function applyPatch(c, patch) {
    const o = c.obj;
    if (patch.x != null || patch.y != null || patch.size != null) {
      const p = S.getPos(c);
      if (p) { if (patch.x != null) p.x = patch.x; if (patch.y != null) p.y = patch.y; if (patch.size != null) p.size = patch.size; S.setPos(c, p); }
    }
    if (patch.rot != null && canRot(c)) { const d = window.StageCore?.rotNorm ? StageCore.rotNorm(patch.rot) : patch.rot; if (d) o.rot = d; else delete o.rot; }
    if (patch.dur != null && S.setTimes) S.setTimes(c, c.t0, c.t0 + patch.dur, false);
    for (const k of ['text', 'font', 'weight', 'style', 'anim', 'color', 'bg']) if (patch[k] != null) o[k] = patch[k];
    if (patch.italic != null) o.italic = patch.italic;
  }
  // Tìm lại element trong một bản sao timeline theo cid (s3, s3l1, s3n0, s3b, c5): lõi chung 74_review.core.js
  const locate = (tl, cap, cid) => window.ReviewCore.locate(tl, cap, cid);

  // ---------- xem lại qua Studio.review (S22 M152) ----------
  // Một mục của khung xem lại: áp bản vá lên bản timeline nào cũng được (bản sao để xem, timeline thật khi Nhận)
  function reviewItem(c, cid, patch, label, sub) {
    return { label, sub, t0: c.t0, t1: c.t1,
      apply(tl, cap, commit) {
        const at = locate(tl, cap, cid); if (!at?.obj) return false;
        if (commit) window.ReviewCore.markOrig(at.obj); // như touch(): lần sửa đầu giữ bản thiết kế
        applyPatch({ ...(S.compByCid(cid) || c), obj: at.obj, scene: at.scene }, patch);
        return true;
      } };
  }
  function openReview(mode, items) {
    const rv = RV(); if (!rv) return;
    rv.open({ owner: OWNER, title: mode === 'variants' ? 'Hỏi Claude · 3 biến thể' : 'Hỏi Claude', mode, items,
      onPick: () => paint(),
      onAccept: (its, n) => { S.toast(n ? `Đã áp “${its[0].label}” · ⌘Z để hoàn tác` : 'Element không còn trên timeline'); reset(); paint(); },
      onClose: reason => { if (reason !== 'accepted' && (ST.st === 'edit' || ST.st === 'variants')) { reset(); paint(); } } });
  }
  const closeMine = () => { if (mine()) RV().close('replaced'); };
  // Thêm núm gợi ý vào element: kiểm lại lần cuối, gộp theo id, tối đa 4 núm của AI; một bước hoàn tác
  function addKnobs(list) {
    const c = S.compByCid(ST.cid); if (!c || !window.Knobs) return;
    const v = window.Knobs.validateMap(list, c); if (!v.knobs.length) return S.toast('Núm không còn hợp lệ với element này');
    const o = c.obj, keep = (Array.isArray(o.knob_map) ? o.knob_map : []).filter(k => !v.knobs.some(n => n.id === k.id));
    S.touch(o); o.knob_map = [...keep, ...v.knobs].slice(-4); S.changed(true);
    S.toast(`Đã thêm ${v.knobs.length} núm vào mục Núm · ⌘Z để hoàn tác`);
  }
  function reset() { Object.assign(ST, { st: 'idle', res: null, err: null, errKind: '', step: '', shots: null, shotErr: '' }); }

  // ---------- gọi route ----------
  const payload = (c, mode) => ({ mode, kind: c.kind, type: c.obj.type || '', label: String(c.label || '').slice(0, 60), fields: fieldsOf(c), frame: { w: S.DW, h: S.DH },
    brand: (() => { const B = S.TL.brand || {}; return { name: B.name || B.title || '', primary: B.primary || '', accent: B.accent || '', font: B.font || '', voice: B.voice || '' }; })(), ask: ST.ask });
  const knobAllowed = c => (window.Knobs?.allowed ? window.Knobs.allowed(c) : null);
  const knobPayload = c => ({ mode: 'knobs', kind: c.kind, type: c.obj.type === 'hf' ? 'hf:' + (c.obj.block || '') : c.obj.type || '', label: String(c.label || '').slice(0, 60),
    allowed: knobAllowed(c), existing: window.Knobs.tableFor(c).map(k => ({ id: k.id, label: k.label })), ask: ST.ask });
  async function go(mode) {
    const c = S.sel; if (!c || ST.st === 'running') return;
    closeMine();
    if (mode === 'edit' && !ST.ask.trim()) { ST.st = 'error'; ST.err = 'Nhập điều muốn sửa, hoặc bấm một gợi ý nhanh.'; ST.errKind = 'input'; return paint(); }
    Object.assign(ST, { cid: c.obj.cid, st: 'running', step: 'Đang gửi…', res: null, err: null, errKind: '', shots: null, shotErr: '' });
    paint();
    const r = await S.api('/api/elem/ai', mode === 'knobs' ? knobPayload(c) : payload(c, mode)).catch(e => ({ error: e.message }));
    if (!r.ok) { ST.st = 'error'; ST.err = r.error || 'Không gửi được'; return paint(); }
    ST.run = r.run; poll(r.run);
  }
  async function poll(run) {
    const r = await S.api('/api/elem/ai').catch(() => null);
    if (run !== ST.run || ST.st !== 'running') return;
    if (!r || r.state === 'running') { if (r?.step && r.step !== ST.step) { ST.step = r.step; paintStep(); } return setTimeout(() => poll(run), 800); }
    if (r.state !== 'done') { ST.st = r.state === 'cancelled' ? 'idle' : 'error'; ST.err = r.error; ST.errKind = r.kind || ''; return paint(); }
    ST.res = r;
    if (r.mode === 'knobs') { // kiểm lại ở trình duyệt bằng đúng bảng trường của mục Núm
      const c = S.compByCid(ST.cid), v = c && window.Knobs ? window.Knobs.validateMap(r.knobs, c) : { knobs: [], errors: ['element không còn'] };
      if (!v.knobs.length) { ST.st = 'error'; ST.err = 'Núm gợi ý không hợp lệ: ' + (v.errors || []).slice(0, 2).join('; '); return paint(); }
      ST.res = { ...r, knobs: v.knobs }; ST.st = 'knobs'; return paint();
    }
    const c = S.compByCid(ST.cid);
    if (!c) { ST.st = 'error'; ST.err = 'Element không còn trên timeline'; return paint(); }
    if (r.mode === 'variants' || r.variants) {
      ST.st = 'variants';
      openReview('variants', r.variants.map(v => reviewItem(c, ST.cid, v.patch, v.label, v.diff.map(d => `${d.label}: ${d.from} → ${d.to}`).join(' · '))));
      paint(); shots(run);
    } else {
      ST.st = 'edit';
      openReview('list', [reviewItem(c, ST.cid, r.patch, String(c.label || 'Element').slice(0, 40), r.diff.map(d => `${d.label}: ${d.to}`).join(' · '))]);
      paint();
    }
  }
  async function cancel() { await S.api('/api/elem/ai/cancel', {}).catch(() => {}); ST.run++; reset(); paint(); }
  async function shots(run) {
    const c = S.compByCid(ST.cid); if (!c) return;
    // chụp lúc element đã vào xong (hoạt ảnh vào ~0,6 s): playhead nếu đã qua đoạn đó, không thì giữa khối
    const lead = c.t0 + Math.min(1, (c.t1 - c.t0) * 0.6), t = S.T >= lead && S.T < c.t1 ? S.T : lead;
    const tls = ST.res.variants.map(v => {
      const tl = JSON.parse(JSON.stringify(S.TL)), cap = JSON.parse(JSON.stringify(S.CAP)), at = locate(tl, cap, ST.cid);
      if (at?.obj) applyPatch({ ...c, obj: at.obj, scene: at.scene }, v.patch);
      return tl;
    });
    const r = await S.api('/api/elem/shots', { timelines: tls, captions: S.CAP, t }).catch(e => ({ error: e.message }));
    if (run !== ST.run || ST.st !== 'variants') return;
    ST.shots = r.shots || []; ST.shotErr = r.error ? 'Không dựng được ảnh nhỏ: ' + r.error : '';
    paint();
  }

  // ---------- vẽ ----------
  const BUSY = () => `<div class="eai-st" role="status"><i class="ti ti-loader-2"></i><span class="eai-step">${esc(ST.step || 'Đang chạy…')}</span></div>
    <div class="acts"><button data-eai="cancel"><i class="ti ti-x"></i> Huỷ</button></div>`;
  const diffHtml = diff => `<div class="eai-diff">${diff.map(d => `<div class="d"><span>${esc(d.label)}</span><div><s>${esc(d.from)}</s> → <b>${esc(d.to)}</b></div></div>`).join('')}</div>`;
  const warnHtml = w => (w || []).map(x => `<div class="eai-warn"><i class="ti ti-alert-triangle"></i> ${esc(x)}</div>`).join('');
  function outHtml() {
    if (ST.st === 'running') return BUSY();
    if (ST.st === 'error') {
      const setup = ['missing', 'login', 'quota', 'model', 'exit'].includes(ST.errKind);
      return `<div class="eai-err" role="alert"><i class="ti ti-alert-circle"></i> ${esc(ST.err || 'Có lỗi')}</div>${setup ? '<div class="acts"><button data-eai="engines"><i class="ti ti-cpu"></i> Mở Mô hình & giọng</button></div>' : ''}`;
    }
    const r = ST.res; if (!r) return '';
    const by = `<div class="eai-why">${esc(r.provider === 'ollama' ? 'Ollama' : 'Claude')} · ${Math.round((r.ms || 0) / 100) / 10} s</div>`;
    if (ST.st === 'edit') return `<div class="eai-tag"><i class="ti ti-eye"></i> ${mine() ? 'Đang phát lặp trên khung · giữ \\ để xem bản cũ' : 'Đã đóng xem trước'}</div>${diffHtml(r.diff)}${r.why ? `<div class="eai-why">${esc(r.why)}</div>` : ''}${warnHtml(r.warnings)}
      <div class="acts"><button class="primary" data-eai="accept"><i class="ti ti-check"></i> Nhận</button><button data-eai="reject"><i class="ti ti-x"></i> Bỏ</button></div>${by}`;
    if (ST.st === 'knobs') return `<div class="eai-diff">${r.knobs.map(k => `<div class="d"><span>${esc(k.label)}</span><div>${esc(k.fields.map(f => f.f.replace(/^vars\./, '')).join(' · '))}</div></div>`).join('')}</div>${warnHtml(r.warnings)}
      <div class="acts"><button class="primary" data-eai="addknobs"><i class="ti ti-adjustments-horizontal"></i> Thêm ${r.knobs.length} núm</button><button data-eai="reject"><i class="ti ti-x"></i> Bỏ</button></div>${by}`;
    if (ST.st === 'variants') {
      const wide = S.DW > S.DH, pk = mine() ? RV().picked : -1;
      return `<div class="eai-vars ${wide ? 'wide' : ''}" role="radiogroup" aria-label="Biến thể">${r.variants.map((v, i) => {
        const img = ST.shots?.[i], th = img ? `<img src="${img}" alt="">` : ST.shots ? `<i class="ti ${FOCUS_IC[v.focus] || 'ti-photo'}"></i>` : '<i class="ti ti-loader-2"></i>';
        return `<button class="eai-var" role="radio" data-eaivar="${i}" aria-checked="${pk === i}" aria-pressed="${pk === i}" title="${esc(v.why || v.label)}"><span class="th">${th}</span><b><kbd>${i + 1}</kbd>${esc(v.label)}</b><small>${esc(v.diff.map(d => `${d.label}: ${d.from} → ${d.to}`).join(' · '))}</small></button>`;
      }).join('')}</div><div class="eai-why">Bấm hoặc phím 1 / 2 / 3 để xem trên khung; Nhận mới áp.</div>${ST.shotErr ? `<div class="eai-warn">${esc(ST.shotErr)}</div>` : ''}${warnHtml(r.warnings)}
      <div class="acts">${pk >= 0 ? `<button class="primary" data-eai="accept"><i class="ti ti-check"></i> Nhận “${esc(r.variants[pk].label)}”</button>` : ''}<button data-eai="reject"><i class="ti ti-x"></i> ${pk >= 0 ? 'Bỏ' : 'Đóng'}</button></div>${by}`;
    }
    return '';
  }
  function html() {
    const run = ST.st === 'running';
    return `<div class="eai" data-eai-box>
      <textarea data-eai-in rows="2" placeholder="Ví dụ: chữ này nổi hơn, hợp tông thương hiệu" ${run ? 'disabled' : ''}>${esc(ST.ask)}</textarea>
      <div class="pills">${QUICK.map(q => `<button data-eaiq="${esc(q)}" ${run ? 'disabled' : ''}>${esc(q)}</button>`).join('')}</div>
      <div class="acts"><button class="primary" data-eai="send" ${run ? 'disabled' : ''}><i class="ti ti-send"></i> Gửi</button><button data-eai="variants" ${run ? 'disabled' : ''}><i class="ti ti-layout-grid"></i> 3 biến thể</button>${S.sel && knobAllowed(S.sel) ? `<button data-eai="knobs" ${run ? 'disabled' : ''} title="Mô hình đề xuất 2–3 núm điều chỉnh mới cho element này"><i class="ti ti-adjustments-horizontal"></i> Gợi ý núm</button>` : ''}</div>
      <div class="eai-out" aria-live="polite">${outHtml()}</div>
      <div class="help">Chỉ gọi mô hình khi bấm. Mô hình theo Mô hình & giọng (Claude hoặc Ollama). AI chỉ đổi vị trí, cỡ, màu, font, kiểu, hoạt ảnh, xoay, thời lượng, chữ; núm gợi ý chỉ dùng trường của mục Núm.</div></div>`;
  }
  const box = () => document.querySelector('#insp [data-eai-box]');
  function paint() { const b = box(); if (b) b.outerHTML = html(); }
  function paintStep() { const s = document.querySelector('#insp [data-eai-box] .eai-step'); if (s) s.textContent = ST.step; }

  S.addInspectorTab(c => {
    if (!KINDS.has(c.kind) || (c.kind === 'scene' && c.obj.type === 'hf' && !S.getPos(c))) return null;
    if (c.obj.cid !== ST.cid && !mine() && ST.st !== 'running') { ST.cid = c.obj.cid; reset(); }
    return ['ai', 'Hỏi Claude', S.sect('', html())];
  });

  const insp = document.getElementById('insp');
  insp.addEventListener('input', e => { if (e.target.matches?.('[data-eai-in]')) ST.ask = e.target.value.slice(0, 300); });
  insp.addEventListener('keydown', e => { if (e.target.matches?.('[data-eai-in]') && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go('edit'); } });
  insp.addEventListener('click', e => {
    const q = e.target.closest('[data-eaiq]');
    if (q) { ST.ask = q.dataset.eaiq; return go('edit'); }
    const v = e.target.closest('[data-eaivar]');
    if (v) { // C27: bấm biến thể = xem trên khung, chưa áp
      const i = +v.dataset.eaivar, it = ST.res?.variants?.[i]; if (!it) return;
      if (!mine()) { const c = S.compByCid(ST.cid); if (!c) return S.toast('Element không còn trên timeline'); openReview('variants', ST.res.variants.map(x => reviewItem(c, ST.cid, x.patch, x.label, ''))); }
      RV().pick(i); return paint();
    }
    const a = e.target.closest('[data-eai]')?.dataset.eai; if (!a) return;
    if (a === 'send') return go('edit');
    if (a === 'variants') return go('variants');
    if (a === 'knobs') return go('knobs');
    if (a === 'addknobs') { const ks = ST.res?.knobs || []; reset(); addKnobs(ks); return paint(); }
    if (a === 'cancel') return cancel();
    if (a === 'accept') { // Nhận qua khung xem lại = một bước ⌘Z; khung đã đóng thì mở lại rồi Nhận
      if (!mine() && ST.st === 'edit' && ST.res?.patch) { const c = S.compByCid(ST.cid); if (!c) return S.toast('Element không còn trên timeline'); openReview('list', [reviewItem(c, ST.cid, ST.res.patch, 'Sửa của AI', '')]); }
      if (mine()) RV().accept(); return paint();
    }
    if (a === 'reject') { if (mine()) RV().close('rejected'); reset(); return paint(); }
    if (a === 'engines') { const b = document.getElementById('eng-btn'); if (b) b.click(); else S.toast('Mở menu ⋯ → Mô hình & giọng'); }
  });
})();
