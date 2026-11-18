// S21 M149: mục "Hỏi Claude" trong Thuộc tính (đứng sau mục đầu) cho element đang chọn — ô nhập + gợi ý nhanh, bản vá có kiểm
// (route studio/routes/72_elem_ai.mjs, lõi scripts/elem_ai.mjs), xem trước khác biệt cũ → mới và áp tạm lên preview; Nhận = một bước
// ⌘Z, Bỏ = về như cũ. "3 biến thể": một lượt mô hình trả 3 bản vá (kiểu chữ / hoạt ảnh / vị trí), ảnh nhỏ dựng bằng engine headless
// (POST /api/elem/shots), bấm một ảnh = áp (một bước ⌘Z). Chỉ gọi mô hình khi người dùng bấm (C23), Huỷ được.
// "Gợi ý núm" (M148): element có trường núm (window.Knobs.allowed) → mô hình đề xuất 2–3 núm, server kiểm bằng KnobsCore.validateMap,
// ở đây kiểm lại bằng Knobs.validateMap; "Thêm núm" lưu vào obj.knob_map (một bước ⌘Z), mục Núm vẽ thêm các núm đó.
(() => {
  const S = window.Studio, esc = S.esc;
  const KINDS = new Set(['line', 'cap', 'node', 'badge', 'scene']);
  const QUICK = ['nổi hơn', 'hợp thương hiệu', 'gọn hơn'];
  const FOCUS_IC = { style: 'ti-typography', anim: 'ti-sparkles', pos: 'ti-arrows-move' };
  // st: idle | running | edit (bản vá đang xem trước) | variants | error. Một trạng thái cho cả trang, gắn với cid của element.
  const ST = { cid: null, st: 'idle', ask: '', step: '', res: null, err: null, errKind: '', pv: null, shots: null, shotErr: '', run: 0 };
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
#insp .eai-vars { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
#insp .eai-var { display: flex; flex-direction: column; align-items: stretch; gap: var(--space-1); padding: var(--space-1); white-space: normal; border-radius: var(--radius-control); border: 1px solid rgb(var(--color-line)); background: rgb(var(--color-surface-raised)); text-align: left; min-width: 0; }
#insp .eai-var:hover, #insp .eai-var:focus-visible { border-color: rgb(var(--color-accent)); }
#insp .eai-var .th { width: 100%; aspect-ratio: 9 / 16; border-radius: var(--radius-control); overflow: hidden; background: rgb(var(--color-surface-muted)); display: flex; align-items: center; justify-content: center; color: rgb(var(--color-fg-subtle)); }
#insp .eai-vars.wide .eai-var .th { aspect-ratio: 16 / 9; }
#insp .eai-var .th img { width: 100%; height: 100%; object-fit: cover; display: block; }
#insp .eai-var b { font-size: var(--text-2xs); color: rgb(var(--color-fg)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#insp .eai-var small { font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); line-height: 1.3; overflow-wrap: anywhere; }`;
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
  // Tìm lại element trong một bản sao timeline theo cid (s3, s3l1, s3n0, s3b, c5) — để dựng ảnh biến thể mà không đụng preview.
  function locate(tl, cap, cid) {
    let m = /^c(\d+)$/.exec(cid); if (m) return { obj: cap[+m[1]] };
    m = /^s(\d+)(?:(l|n)(\d+)|(b))?$/.exec(cid); if (!m) return null;
    const s = tl.scenes?.[+m[1]]; if (!s) return null;
    if (m[4]) return { obj: s.badge, scene: s };
    if (m[2]) return { obj: (m[2] === 'l' ? s.lines : s.nodes)?.[+m[3]], scene: s };
    return { obj: s, scene: s };
  }

  // ---------- trạng thái xem trước ----------
  const snap = () => ({ tl: JSON.stringify(S.TL), cap: JSON.stringify(S.CAP) });
  let reverting = false;
  function restore(sn, cid) {
    reverting = true;
    try { S.TL = JSON.parse(sn.tl); S.CAP = JSON.parse(sn.cap); S.changed(true); const c = cid && S.compByCid(cid); if (c) S.select(c); }
    finally { reverting = false; }
  }
  function startPreview(patch) {
    const c = S.sel; if (!c) return;
    if (ST.pv) restore(ST.pv.sn, ST.cid);
    const cur = S.compByCid(ST.cid) || c;
    ST.pv = { sn: snap(), patch };
    applyPatch(cur, patch); S.changed(true);
  }
  function dropPreview(cid = ST.cid) { const pv = ST.pv; ST.pv = null; if (pv) restore(pv.sn, cid); }
  // Nhận: về đúng trạng thái trước khi xem, chụp một bước hoàn tác (touch), rồi áp bản vá
  function commit(patch, msg) {
    if (ST.pv) dropPreview();
    const c = S.compByCid(ST.cid); if (!c) return S.toast('Element không còn trên timeline');
    S.touch(c.obj); applyPatch(c, patch); S.changed(true);
    S.toast(msg + ' · ⌘Z để hoàn tác');
  }
  // Thêm núm gợi ý vào element: kiểm lại lần cuối, gộp theo id, tối đa 4 núm của AI; một bước hoàn tác
  function addKnobs(list) {
    const c = S.compByCid(ST.cid); if (!c || !window.Knobs) return;
    const v = window.Knobs.validateMap(list, c); if (!v.knobs.length) return S.toast('Núm không còn hợp lệ với element này');
    const o = c.obj, keep = (Array.isArray(o.knob_map) ? o.knob_map : []).filter(k => !v.knobs.some(n => n.id === k.id));
    S.touch(o); o.knob_map = [...keep, ...v.knobs].slice(-4); S.changed(true);
    S.toast(`Đã thêm ${v.knobs.length} núm vào mục Núm · ⌘Z để hoàn tác`);
  }
  // Chọn element khác / bỏ chọn khi đang xem trước → bỏ bản xem trước (giữ lựa chọn mới)
  S._ov.push(() => {
    if (!ST.pv || reverting) return;
    const now = S.sel?.obj?.cid || null;
    if (now !== ST.cid) setTimeout(() => { if (ST.pv && (S.sel?.obj?.cid || null) !== ST.cid) { dropPreview(now); reset(); } }, 0);
  });
  function reset() { Object.assign(ST, { st: 'idle', res: null, err: null, errKind: '', step: '', shots: null, shotErr: '' }); }

  // ---------- gọi route ----------
  const payload = (c, mode) => ({ mode, kind: c.kind, type: c.obj.type || '', label: String(c.label || '').slice(0, 60), fields: fieldsOf(c), frame: { w: S.DW, h: S.DH },
    brand: (() => { const B = S.TL.brand || {}; return { name: B.name || B.title || '', primary: B.primary || '', accent: B.accent || '', font: B.font || '', voice: B.voice || '' }; })(), ask: ST.ask });
  const knobAllowed = c => (window.Knobs?.allowed ? window.Knobs.allowed(c) : null);
  const knobPayload = c => ({ mode: 'knobs', kind: c.kind, type: c.obj.type === 'hf' ? 'hf:' + (c.obj.block || '') : c.obj.type || '', label: String(c.label || '').slice(0, 60),
    allowed: knobAllowed(c), existing: window.Knobs.tableFor(c).map(k => ({ id: k.id, label: k.label })), ask: ST.ask });
  async function go(mode) {
    const c = S.sel; if (!c || ST.st === 'running') return;
    if (ST.pv) dropPreview();
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
    if (r.mode === 'variants' || r.variants) { ST.st = 'variants'; paint(); shots(run); }
    else { ST.st = 'edit'; if (S.sel?.obj?.cid === ST.cid) startPreview(r.patch); paint(); }
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
    if (ST.st === 'edit') return `<div class="eai-tag"><i class="ti ti-eye"></i> Đang xem trước trên khung</div>${diffHtml(r.diff)}${r.why ? `<div class="eai-why">${esc(r.why)}</div>` : ''}${warnHtml(r.warnings)}
      <div class="acts"><button class="primary" data-eai="accept"><i class="ti ti-check"></i> Nhận</button><button data-eai="reject"><i class="ti ti-x"></i> Bỏ</button></div>${by}`;
    if (ST.st === 'knobs') return `<div class="eai-diff">${r.knobs.map(k => `<div class="d"><span>${esc(k.label)}</span><div>${esc(k.fields.map(f => f.f.replace(/^vars\./, '')).join(' · '))}</div></div>`).join('')}</div>${warnHtml(r.warnings)}
      <div class="acts"><button class="primary" data-eai="addknobs"><i class="ti ti-adjustments-horizontal"></i> Thêm ${r.knobs.length} núm</button><button data-eai="reject"><i class="ti ti-x"></i> Bỏ</button></div>${by}`;
    if (ST.st === 'variants') {
      const wide = S.DW > S.DH;
      return `<div class="eai-vars ${wide ? 'wide' : ''}">${r.variants.map((v, i) => {
        const img = ST.shots?.[i], th = img ? `<img src="${img}" alt="">` : ST.shots ? `<i class="ti ${FOCUS_IC[v.focus] || 'ti-photo'}"></i>` : '<i class="ti ti-loader-2"></i>';
        return `<button class="eai-var" data-eaivar="${i}" title="${esc(v.diff.map(d => `${d.label}: ${d.from} → ${d.to}`).join('\n') + (v.why ? '\n' + v.why : ''))}"><span class="th">${th}</span><b>${esc(v.label)}</b><small>${esc(v.diff.map(d => d.label).join(', '))}</small></button>`;
      }).join('')}</div><div class="eai-why">Bấm một phương án để áp (⌘Z để hoàn tác).</div>${ST.shotErr ? `<div class="eai-warn">${esc(ST.shotErr)}</div>` : ''}${warnHtml(r.warnings)}
      <div class="acts"><button data-eai="reject"><i class="ti ti-x"></i> Đóng</button></div>${by}`;
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
    if (c.obj.cid !== ST.cid && !ST.pv && ST.st !== 'running') { ST.cid = c.obj.cid; reset(); }
    return ['ai', 'Hỏi Claude', S.sect('', html())];
  });

  const insp = document.getElementById('insp');
  insp.addEventListener('input', e => { if (e.target.matches?.('[data-eai-in]')) ST.ask = e.target.value.slice(0, 300); });
  insp.addEventListener('keydown', e => { if (e.target.matches?.('[data-eai-in]') && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go('edit'); } });
  insp.addEventListener('click', e => {
    const q = e.target.closest('[data-eaiq]');
    if (q) { ST.ask = q.dataset.eaiq; return go('edit'); }
    const v = e.target.closest('[data-eaivar]');
    if (v) { const it = ST.res?.variants?.[+v.dataset.eaivar]; if (it) { commit(it.patch, 'Đã áp “' + it.label + '”'); reset(); paint(); } return; }
    const a = e.target.closest('[data-eai]')?.dataset.eai; if (!a) return;
    if (a === 'send') return go('edit');
    if (a === 'variants') return go('variants');
    if (a === 'knobs') return go('knobs');
    if (a === 'addknobs') { const ks = ST.res?.knobs || []; reset(); addKnobs(ks); return paint(); }
    if (a === 'cancel') return cancel();
    if (a === 'accept') { const p = ST.pv?.patch || ST.res?.patch; reset(); if (p) commit(p, 'Đã nhận sửa của AI'); return paint(); }
    if (a === 'reject') { dropPreview(); reset(); return paint(); }
    if (a === 'engines') { const b = document.getElementById('eng-btn'); if (b) b.click(); else S.toast('Mở menu ⋯ → Mô hình & giọng'); }
  });
})();
