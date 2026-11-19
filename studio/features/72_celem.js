// S27 M199: Element riêng do Claude dựng (docs/plans/S27-element-claude.md). Panel "Element riêng" ở bước Dựng: ô mô tả →
// Claude dựng 3 phương án (spec khai báo, POST /api/elem/make của routes/72_celem.mjs), ảnh dựng bằng engine headless
// (POST /api/elem/shots), Nhận = chèn cảnh `celem` tại playhead (một bước ⌘Z) + lưu vào thư viện của thương hiệu
// ($AVS_HOME/elements/<brand>.json); bên dưới là thư viện đó (bấm Chèn). Tab Thuộc tính "Element riêng": chữ, màu biến, Claude sửa.
// Engine: engine/celem.js (cổng kiểm spec chạy lại lúc vẽ). Tab Claude gọi Studio.celem.make (việc elem_create của 75_ask.core.js).
(() => {
  const S = Studio, { $, esc, sect } = S;
  const ST = { st: 'idle', run: 0, step: '', res: null, shots: [], shotErr: '', err: '', ask: '', cid: '', t0: 0, lib: null, libBrand: null, libErr: '' };
  const r2 = v => Math.round(v * 100) / 100;
  const brandId = () => S.META?.kho?.brand || '';
  const isCe = c => c && c.kind === 'scene' && c.obj.type === 'celem';
  const onPanel = () => document.querySelector('#rail .on')?.dataset.p === 'celem';
  const repaint = () => { if (onPanel()) S.renderPanel(); };
  // giống CELEM.settle của engine/celem.js: lúc mọi lớp đã vào xong (giây)
  const settle = spec => Math.max(spec?.dur || 0.4, ...(spec?.layers || []).map(L => (L.in && L.in !== 'none' ? (L.delay || 0) + (L.dur || 0.4) : 0)));
  const hasText = spec => !!spec?.layers?.some(L => L.k === 'text' && String(L.text || '').includes('{text}'));

  // hộp giữa khung theo tỉ lệ spec: rộng tối đa 80 % khung, cao tối đa 45 %
  function cardOf(spec) {
    const DW = S.DW, DH = S.DH;
    let w = Math.min(spec.w, DW * 0.8), h = w * spec.h / spec.w;
    if (h > DH * 0.45) { h = DH * 0.45; w = h * spec.w / spec.h; }
    return { x: Math.round((DW - w) / 2), y: Math.round((DH - h) / 2), w: Math.round(w), h: Math.round(h) };
  }
  function sceneOf(v, t0) {
    const D = S.TL.duration || 0, len = Math.max(3, settle(v.spec) + 1.5);
    let a = t0, b = Math.min(D || t0 + len, t0 + len);
    if (b - a < 0.5) a = Math.max(0, b - len);
    return { type: 'celem', t0: r2(a), t1: r2(b), added: true, card: cardOf(v.spec), spec: JSON.parse(JSON.stringify(v.spec)), text: v.text || '', ...(brandId() ? { brand_id: brandId() } : {}) };
  }

  // ---------- Claude dựng ----------
  // make(ask, {cid}): cid = sửa element riêng đang có (spec làm nền), không có = dựng mới tại playhead
  async function make(ask, o = {}) {
    ask = String(ask || '').trim();
    if (!ask) { S.toast('Mô tả element muốn dựng'); return false; }
    if (ST.st === 'busy') { S.toast('Claude đang dựng element khác'); return false; }
    const c = o.cid ? S.compByCid?.(o.cid) : null;
    if (o.cid && !isCe(c)) { S.toast('Element đã bỏ chọn'); return false; }
    Object.assign(ST, { st: 'busy', step: 'Đang gửi…', res: null, shots: [], shotErr: '', err: '', ask, cid: o.cid || '', t0: c ? c.t0 : S.T });
    S.workflow?.focus?.('celem'); repaint();
    const B = S.TL.brand || {};
    const r = await S.api('/api/elem/make', { ask, brand: { name: B.name || B.title || '', primary: B.primary || '', accent: B.accent || '', dark: B.dark || '', light: B.light || '', font: B.font || '', disp: B.disp || '', voice: B.voice || '' },
      brand_id: brandId(), frame: { w: S.DW, h: S.DH }, style: S.TL.pack || '', ...(c ? { base: c.obj.spec, text: c.obj.text || '' } : {}) }).catch(e => ({ error: e.message }));
    if (!r.ok) { Object.assign(ST, { st: 'error', err: r.error || 'Không gửi được' }); repaint(); return false; }
    ST.run = r.run; poll(r.run);
    return true;
  }
  async function poll(run) {
    const r = await S.api('/api/elem/make').catch(() => null);
    if (run !== ST.run || ST.st !== 'busy') return;
    if (r && r.run !== run) return; // lượt khác (tab khác) đang giữ ô job
    if (!r || r.state === 'running') {
      if (r?.step && r.step !== ST.step) { ST.step = r.step; const s = document.querySelector('#libbody .ce-step'); if (s) s.textContent = r.step; }
      return setTimeout(() => poll(run), 700);
    }
    if (r.state !== 'done') { Object.assign(ST, { st: r.state === 'cancelled' ? 'idle' : 'error', err: r.error || '' }); repaint(); return; }
    Object.assign(ST, { st: 'variants', res: r }); repaint(); shots(run);
  }
  async function cancel() { await S.api('/api/elem/make/cancel', {}).catch(() => {}); ST.run++; ST.st = 'idle'; repaint(); }
  // ảnh từng phương án: bản sao timeline có cảnh celem (mới tại t0, hoặc thay spec của cảnh đang sửa), chụp lúc đã vào xong
  async function shots(run) {
    const D = S.TL.duration || 0, list = ST.res?.variants || [], c = ST.cid ? S.compByCid?.(ST.cid) : null;
    // chủ repo 2026-11-19: ảnh chỉ có element — timeline chụp bỏ mọi cảnh khác và phụ đề, phủ một nền trơn che video
    const DW = S.DW, DH = S.DH;
    const backdrop = { type: 'celem', t0: 0, t1: D, card: { x: 0, y: 0, w: DW, h: DH },
      spec: { v: 1, name: 'nền ảnh xem trước', w: DW, h: DH, in: 'none', layers: [{ k: 'rect', x: 0, y: 0, w: DW, h: DH, fill: '#26282D' }] } }; // design-token-ok: nền của ảnh chụp trong engine (dữ liệu render), không phải màu giao diện
    const tls = list.map(v => {
      const tl = JSON.parse(JSON.stringify(S.TL));
      const sc = c ? { ...JSON.parse(JSON.stringify(c.obj)), spec: v.spec, text: c.obj.text || v.text || '' } : sceneOf(v, ST.t0);
      delete sc.cid;
      tl.scenes = [backdrop, sc];
      return tl;
    });
    // chụp sau khi mọi lớp đã vào xong (phương án vào lâu nhất), trước khi cảnh ra
    const sc0 = c ? c.obj : sceneOf(list[0], ST.t0), lead = Math.max(...list.map(v => settle(v.spec))) + 0.15;
    const t = Math.min(Math.max(0, D - 0.05), sc0.t0 + Math.min(lead, Math.max(0.3, sc0.t1 - sc0.t0 - 0.1)));
    const r = await S.api('/api/elem/shots', { timelines: tls, captions: [], t, px: 720 }).catch(e => ({ error: e.message }));
    if (run !== ST.run || ST.st !== 'variants') return;
    // chủ repo 2026-11-19: ảnh chỉ là vùng element (cắt theo card), không cả khung — gọn chỗ, cũng là ảnh lưu vào thư viện
    const boxes = list.map(v => (c ? c.obj.card : sceneOf(v, ST.t0).card));
    ST.shots = await Promise.all((r.shots || []).map((u, i) => (u && boxes[i] ? crop(u, boxes[i]).catch(() => u) : u)));
    ST.shotErr = r.error ? 'Chưa có ảnh: ' + r.error : '';
    if (run !== ST.run || ST.st !== 'variants') return;
    repaint();
  }
  // cắt ảnh khung (data URL) theo hộp element (px thiết kế) + lề 6 %, ra JPEG rộng tối đa 360 px
  function crop(url, b) {
    return new Promise((ok, no) => {
      const im = new Image();
      im.onload = () => {
        const k = im.naturalWidth / S.DW, pad = Math.max(b.w, b.h) * 0.06;
        const x = Math.max(0, (b.x - pad) * k), y = Math.max(0, (b.y - pad) * k);
        const w = Math.min(im.naturalWidth - x, (b.w + 2 * pad) * k), h = Math.min(im.naturalHeight - y, (b.h + 2 * pad) * k);
        if (!(w > 4 && h > 4)) return no(new Error('hộp ngoài khung'));
        const z = Math.min(1, 360 / w), cv = document.createElement('canvas');
        cv.width = Math.round(w * z); cv.height = Math.round(h * z);
        cv.getContext('2d').drawImage(im, x, y, w, h, 0, 0, cv.width, cv.height);
        ok(cv.toDataURL('image/jpeg', 0.8));
      };
      im.onerror = () => no(new Error('ảnh lỗi'));
      im.src = url;
    });
  }
  // Nhận phương án i: một bước hoàn tác (chèn hoặc thay spec), rồi lưu vào thư viện của thương hiệu
  async function accept(i) {
    const v = ST.res?.variants?.[i]; if (!v) return;
    S.pushUndo();
    let obj;
    if (ST.cid) {
      const c = S.compByCid?.(ST.cid); if (!isCe(c)) { S.toast('Element đã bị xoá'); return; }
      obj = c.obj; obj.spec = JSON.parse(JSON.stringify(v.spec)); if (v.text && !obj.text) obj.text = v.text;
      S.changed(); S.select(S.compOf(obj));
    } else {
      obj = sceneOf(v, ST.t0); S.TL.scenes.push(obj); S.changed();
      if (S.T < obj.t0 + 0.6) S.setTime(Math.min(obj.t1 - 0.05, obj.t0 + 0.6));
      S.select(S.compOf(obj));
    }
    const thumb = ST.shots[i] || '', ask = ST.ask, edit = !!ST.cid;
    Object.assign(ST, { st: 'idle', res: null, shots: [] });
    S.toast(`Đã ${edit ? 'sửa' : 'chèn'} “${v.name}” · ⌘Z để hoàn tác`);
    const r = await S.api('/api/elem/lib', { brand: brandId(), name: v.name, spec: v.spec, text: v.text, thumb, ask }).catch(e => ({ error: e.message }));
    if (r.ok) { obj.elem_id = r.item.id; ST.lib = null; } else S.toast('Chưa lưu vào thư viện: ' + (r.error || 'lỗi'));
    repaint();
  }
  function insertSaved(id) {
    const it = (ST.lib || []).find(x => x.id === id); if (!it) return;
    S.pushUndo();
    const obj = { ...sceneOf(it, S.T), elem_id: it.id };
    S.TL.scenes.push(obj); S.changed();
    if (S.T < obj.t0 + 0.6) S.setTime(Math.min(obj.t1 - 0.05, obj.t0 + 0.6));
    S.select(S.compOf(obj));
    S.toast(`Đã chèn “${it.name}” · ⌘Z để hoàn tác`);
  }
  async function loadLib() {
    const b = brandId(); ST.libBrand = b; ST.lib = 'loading';
    const r = await S.api('/api/elem/lib?brand=' + encodeURIComponent(b)).catch(e => ({ error: e.message }));
    ST.lib = Array.isArray(r.items) ? r.items : []; ST.libErr = r.error || '';
    repaint();
  }
  async function delSaved(id) {
    const it = (ST.lib || []).find(x => x.id === id); if (!it || !confirm(`Xoá “${it.name}” khỏi thư viện? Element đã chèn vào video vẫn giữ.`)) return;
    const r = await S.api('/api/elem/lib/delete', { brand: brandId(), id }).catch(e => ({ error: e.message }));
    if (r.ok) { ST.lib = ST.lib.filter(x => x.id !== id); repaint(); } else S.toast(r.error || 'Không xoá được');
  }

  // ---------- panel ----------
  const EX = ['box chữ nền vàng bo góc cho giá', 'khung viền mảnh vàng gold cho tiêu đề', 'nhãn pill đỏ "MỚI" có bóng'];
  function variantsHTML() {
    const L = ST.res.variants;
    return `<div class="ce-head"><b>${ST.cid ? 'Claude sửa element' : 'Claude dựng'}: ${L.length} phương án</b><button data-ce="drop" title="Bỏ các phương án"><i class="ti ti-x"></i></button></div>
      ${ST.shotErr ? `<div class="help">${esc(ST.shotErr)}</div>` : ''}${(ST.res.warnings || []).map(w => `<div class="help">${esc(w)}</div>`).join('')}
      <div class="ce-vars">${L.map((v, i) => `<div class="ce-var">
        <div class="th">${ST.shots[i] ? `<img src="${esc(ST.shots[i])}" alt="">` : ST.shots.length || ST.shotErr ? '<i class="ti ti-photo-off"></i>' : '<i class="ti ti-loader-2"></i>'}</div>
        <div class="ce-tx"><b>${esc(v.name)}</b>${v.why ? `<small>${esc(v.why)}</small>` : ''}</div>
        <button class="primary" data-ce="ok" data-i="${i}"><i class="ti ti-check"></i> Nhận</button></div>`).join('')}</div>`;
  }
  function libHTML() {
    if (ST.lib == null || ST.libBrand !== brandId()) { loadLib(); return '<div class="loading"><i class="ti ti-loader-2 spin"></i> Đang đọc thư viện…</div>'; }
    if (ST.lib === 'loading') return '<div class="loading"><i class="ti ti-loader-2 spin"></i> Đang đọc thư viện…</div>';
    if (ST.libErr) return `<div class="help">${esc(ST.libErr)}</div>`;
    if (!ST.lib.length) return '<div class="help">Chưa có element riêng. Element bạn Nhận sẽ lưu ở đây, dùng lại cho mọi video của thương hiệu.</div>';
    return `<div class="ce-lib">${ST.lib.map(it => `<div class="ce-it" title="${esc(it.ask || it.name)}">
      <button class="th" data-ce="ins" data-id="${esc(it.id)}" title="Chèn tại playhead">${it.thumb ? `<img src="${esc(it.thumb)}" alt="">` : '<i class="ti ti-box"></i>'}</button>
      <div class="ce-tx"><b>${esc(it.name)}</b><button class="ce-del" data-ce="del" data-id="${esc(it.id)}" title="Xoá khỏi thư viện"><i class="ti ti-trash"></i></button></div></div>`).join('')}</div>`;
  }
  function panel() {
    const own = brandId() ? `thương hiệu <b>${esc(S.META?.kho?.title || brandId())}</b>` : '<b>Chung</b> (dự án không thuộc thương hiệu)';
    let top;
    if (ST.st === 'busy') top = `<div class="ce-st" role="status"><i class="ti ti-loader-2"></i><span class="ce-step">${esc(ST.step || 'Đang chạy…')}</span></div><button data-ce="cancel"><i class="ti ti-x"></i> Huỷ</button>`;
    else if (ST.st === 'variants') top = variantsHTML();
    else top = `<textarea id="ce-ask" rows="3" maxlength="300" placeholder="Ví dụ: ${esc(EX[0])}">${esc(ST.st === 'error' ? ST.ask : '')}</textarea>
      ${ST.st === 'error' ? `<div class="help ce-err"><i class="ti ti-alert-triangle"></i> ${esc(ST.err)}</div>` : ''}
      <button class="wide primary" data-ce="make"><i class="ti ti-sparkles"></i> Claude dựng 3 phương án</button>
      <div class="ce-ex">${EX.map(x => `<button data-ce="ex" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
    $('#libbody').innerHTML = `<div class="help">Mô tả box, nền chữ, khung, nhãn… Claude dựng theo màu và font của thương hiệu. ${S.tip('Element riêng là dữ liệu khai báo (lớp hình, chữ, màu, hoạt ảnh có sẵn), được kiểm trước khi chèn. Mỗi lần dựng gọi Claude một lượt.')}</div>
      <div class="ce-box">${top}</div>
      <div class="lbl ce-libh">Thư viện của ${own}</div>${libHTML()}`;
  }
  S.addPanel('celem', 'ti-box-model', 'Element riêng', panel, { step: 'build', level: 'basic' });

  // ---------- tab Thuộc tính ----------
  const HEX6 = /^#[0-9a-f]{6}$/i;
  function tab(c) {
    if (!isCe(c)) return null;
    const o = c.obj, vars = Object.entries(o.spec?.vars || {}).filter(([, v]) => HEX6.test(v));
    let h = '';
    if (hasText(o.spec)) h += sect('Chữ', `<input data-cetext value="${esc(o.text || '')}" maxlength="120" placeholder="Chữ trong element">`, 'ti-typography');
    if (vars.length) h += sect('Màu', `<div class="ce-vrow">${vars.map(([n, v]) => `<label><input type="color" data-cevar="${esc(n)}" value="${esc(v)}"><small>${esc(n)}</small></label>`).join('')}</div>`, 'ti-palette');
    h += sect('Claude sửa', `<div class="row"><input data-ceask maxlength="300" placeholder="Ví dụ: nền đỏ, chữ to hơn"><button data-ce="edit"><i class="ti ti-sparkles"></i> Sửa</button></div>
      <div class="help">Ra 3 phương án ở panel Element riêng, Nhận thì thay element này (⌘Z được).</div>`, 'ti-message-chatbot');
    return ['celem', 'Element riêng', `<div id="cepanel">${h}</div>`];
  }
  S.addInspectorTab(tab);
  const cur = () => (isCe(S.sel) ? S.sel : null);
  const set = (fn, key) => { const c = cur(); if (!c) return; S.pushUndo(key); fn(c.obj); S.changed(!key); };

  document.addEventListener('click', e => {
    const b = e.target.closest('#libbody [data-ce], #cepanel [data-ce]'); if (!b) return;
    const a = b.dataset.ce;
    if (a === 'make') return make($('#ce-ask')?.value);
    if (a === 'ex') { const t = $('#ce-ask'); if (t) { t.value = b.dataset.v; t.focus(); } return; }
    if (a === 'cancel') return cancel();
    if (a === 'drop') { ST.run++; ST.st = 'idle'; ST.res = null; return repaint(); }
    if (a === 'ok') return accept(+b.dataset.i);
    if (a === 'ins') return insertSaved(b.dataset.id);
    if (a === 'del') return delSaved(b.dataset.id);
    if (a === 'edit') { const c = cur(); if (c) make(document.querySelector('#cepanel [data-ceask]')?.value, { cid: c.obj.cid }); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.id === 'ce-ask') { e.preventDefault(); make(e.target.value); }
    if (e.key === 'Enter' && e.target.matches?.('#cepanel [data-ceask]')) { e.preventDefault(); const c = cur(); if (c) make(e.target.value, { cid: c.obj.cid }); }
  });
  document.addEventListener('input', e => {
    const t = e.target; if (!t.closest?.('#cepanel')) return;
    if (t.dataset.cetext != null) return set(o => { o.text = t.value.replace(/[<>]/g, ''); }, 'cetext');
    if (t.dataset.cevar && HEX6.test(t.value)) return set(o => { o.spec.vars[t.dataset.cevar] = t.value; }, 'cevar' + t.dataset.cevar);
  });

  S.celem = { make, open: () => S.workflow?.focus?.('celem'), get state() { return ST.st; } };

  const st = document.createElement('style');
  st.textContent = `
.ce-box { display:flex; flex-direction:column; gap:var(--space-2); margin:var(--space-2) 0 var(--space-3); }
.ce-box textarea { width:100%; resize:vertical; }
.ce-ex { display:flex; flex-wrap:wrap; gap:var(--space-1); }
.ce-ex button { font-size:var(--text-2xs); padding:var(--space-050) var(--space-2); min-height:0; color:rgb(var(--color-fg-muted)); }
.ce-st { display:flex; align-items:center; gap:var(--space-2); font-size:var(--text-xs); color:rgb(var(--color-fg-muted)); }
.ce-st .ti-loader-2, .ce-var .th .ti-loader-2 { animation:ui-spin 1s linear infinite; }
.ce-err { color:rgb(var(--color-danger-text)); }
.ce-head { display:flex; align-items:center; justify-content:space-between; gap:var(--space-2); }
.ce-head button { min-height:0; padding:var(--space-050) var(--space-1); }
.ce-vars { display:flex; flex-direction:column; gap:var(--space-2); }
.ce-var { display:grid; grid-template-columns:1fr auto; gap:var(--space-1) var(--space-2); align-items:center; padding:var(--space-2); border:1px solid rgb(var(--color-line)); border-radius:var(--radius-control); }
.ce-var .th, .ce-it .th { display:flex; align-items:center; justify-content:center; height:64px; background:rgb(var(--color-surface-muted)); border-radius:var(--radius-xs); overflow:hidden; color:rgb(var(--color-fg-muted)); }
.ce-var .th { grid-column:1 / -1; }
.ce-var .th img, .ce-it .th img { max-width:100%; max-height:100%; object-fit:contain; display:block; }
.ce-var .ce-tx, .ce-it .ce-tx { display:flex; flex-direction:column; gap:var(--space-050); min-width:0; font-size:var(--text-xs); }
.ce-var .ce-tx small { color:rgb(var(--color-fg-muted)); }
.ce-var button.primary { align-self:center; }
.ce-libh { margin-top:var(--space-2); }
.ce-lib { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:var(--space-2); margin-top:var(--space-1); }
.ce-it { display:flex; flex-direction:column; gap:var(--space-1); min-width:0; }
.ce-it .th { padding:0; width:100%; min-height:0; height:56px; }
.ce-it .ce-tx { flex-direction:row; align-items:center; justify-content:space-between; }
.ce-it .ce-tx b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500; }
.ce-it .ce-del { min-height:0; padding:0 var(--space-050); border:0; background:none; color:rgb(var(--color-fg-muted)); }
#cepanel .ce-vrow { display:flex; flex-wrap:wrap; gap:var(--space-2); }
#cepanel .ce-vrow label { display:flex; flex-direction:column; align-items:center; gap:var(--space-050); font-size:var(--text-2xs); color:rgb(var(--color-fg-muted)); }
#cepanel input[type=color] { width:44px; height:var(--h-md); padding:var(--space-050); }
#cepanel .row { display:flex; gap:var(--space-1); align-items:center; }
#cepanel .row input { flex:1; min-width:0; }`;
  document.head.appendChild(st);
})();
