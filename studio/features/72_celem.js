// S27 M199: Element riêng do Claude dựng (docs/plans/S27-element-claude.md). Panel "Element riêng" ở bước Dựng: ô mô tả →
// Claude dựng 3 phương án (spec khai báo, POST /api/elem/make của routes/72_celem.mjs), ảnh dựng bằng engine headless
// (POST /api/elem/shots), Nhận = chèn cảnh `celem` tại playhead (một bước ⌘Z) + lưu vào thư viện của thương hiệu
// ($AVS_HOME/elements/<brand>.json); bên dưới là thư viện đó (bấm Chèn). Tab Thuộc tính "Element riêng": chữ, màu biến, Claude sửa.
// Engine: engine/celem.js (cổng kiểm spec chạy lại lúc vẽ). Tab Claude gọi Studio.celem.make (việc elem_create của 75_ask.core.js).
(() => {
  const S = Studio, { $, esc, sect } = S;
  const ST = { st: 'idle', run: 0, step: '', res: null, shots: [], shotErr: '', err: '', ask: '', cid: '', t0: 0, lib: null, libBrand: null, libErr: '', refs: [], sent: null, brandFirst: true, fromId: '' };
  const ASKREFS = []; // ảnh đính vào câu hỏi ở tab Claude (dùng khi việc là dựng / sửa element riêng)
  const MAXR = 4;
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
    // ảnh ví dụ: o.refs (tab Claude) hoặc ảnh ở ô của panel khi dựng mới; sửa element đã lưu mà không có ảnh mới → server dùng ảnh đã lưu
    const refs = (o.refs?.length ? o.refs : c ? [] : ST.refs).slice(0, MAXR), fromId = c?.obj.elem_id || '';
    Object.assign(ST, { st: 'busy', step: 'Đang gửi…', res: null, shots: [], shotErr: '', err: '', ask, cid: o.cid || '', t0: c ? c.t0 : S.T, sent: refs.length ? refs : null, fromId });
    S.workflow?.focus?.('celem'); repaint();
    const B = S.TL.brand || {};
    const r = await S.api('/api/elem/make', { ask, brand: { name: B.name || B.title || '', primary: B.primary || '', accent: B.accent || '', dark: B.dark || '', light: B.light || '', font: B.font || '', disp: B.disp || '', voice: B.voice || '' },
      brand_id: brandId(), frame: { w: S.DW, h: S.DH }, style: S.TL.pack || '', ...(c ? { base: c.obj.spec, text: c.obj.text || '' } : {}),
      ...(refs.length ? { refs } : {}), ...(fromId ? { elem_id: fromId } : {}), brand_first: ST.brandFirst }).catch(e => ({ error: e.message }));
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
    const thumb = ST.shots[i] || '', ask = ST.ask, edit = !!ST.cid, sent = ST.sent, fromId = ST.fromId;
    Object.assign(ST, { st: 'idle', res: null, shots: [], sent: null, ...(sent && !edit ? { refs: [] } : {}) });
    S.toast(`Đã ${edit ? 'sửa' : 'chèn'} “${v.name}” · ⌘Z để hoàn tác`);
    const r = await S.api('/api/elem/lib', { brand: brandId(), name: v.name, spec: v.spec, text: v.text, thumb, ask,
      ...(sent ? { refs: sent } : fromId ? { refs_from: fromId } : {}) }).catch(e => ({ error: e.message }));
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
  // ô ảnh ví dụ: kéo thả / chọn file / dán (⌘V khi con trỏ ở ô mô tả)
  function refsHTML() {
    const B = S.TL.brand || {}, hasBrand = !!(B.primary || B.accent);
    return `<div class="ce-refs" data-ce-drop>${ST.refs.map((u, i) => `<span class="ce-ref"><img src="${esc(u)}" alt="Ảnh ví dụ ${i + 1}"><button data-ce="rmref" data-i="${i}" title="Bỏ ảnh"><i class="ti ti-x"></i></button></span>`).join('')}
      ${ST.refs.length < MAXR ? `<label class="ce-addref" title="Ảnh chụp video khác, ảnh thiết kế, logo: Claude bắt chước hình khối, bố cục, màu, kiểu chữ"><i class="ti ti-photo-plus"></i><span>${ST.refs.length ? `${ST.refs.length}/${MAXR}` : 'Ảnh ví dụ (kéo thả, dán, chọn)'}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-ce-file></label>` : ''}</div>
      ${ST.refs.length && hasBrand ? `<label class="check ce-bf"><input type="checkbox" data-ce-bf ${ST.brandFirst ? 'checked' : ''}> Màu theo thương hiệu (bỏ tick: lấy màu từ ảnh)</label>` : ''}`;
  }
  async function addRefs(files, into = ST.refs) {
    const imgs = [...files].filter(f => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (!imgs.length) { S.toast('Chỉ nhận ảnh JPEG, PNG hoặc WebP'); return 0; }
    let n = 0;
    for (const f of imgs) {
      if (into.length >= MAXR) { S.toast(`Tối đa ${MAXR} ảnh ví dụ`); break; }
      try { into.push(await S.imagePayload(f, { max: 1024, type: 'image/jpeg', quality: 0.85 })); n++; } catch { S.toast('Không đọc được ảnh ' + f.name); }
    }
    return n;
  }
  function panel() {
    const own = brandId() ? `thương hiệu <b>${esc(S.META?.kho?.title || brandId())}</b>` : '<b>Chung</b> (dự án không thuộc thương hiệu)';
    let top;
    if (ST.st === 'busy') top = `<div class="ce-st" role="status"><i class="ti ti-loader-2"></i><span class="ce-step">${esc(ST.step || 'Đang chạy…')}</span></div><button data-ce="cancel"><i class="ti ti-x"></i> Huỷ</button>`;
    else if (ST.st === 'variants') top = variantsHTML();
    else top = `<textarea id="ce-ask" rows="3" maxlength="300" placeholder="Ví dụ: ${esc(EX[0])}">${esc(ST.st === 'error' ? ST.ask : '')}</textarea>
      ${ST.st === 'error' ? `<div class="help ce-err"><i class="ti ti-alert-triangle"></i> ${esc(ST.err)}</div>` : ''}
      ${refsHTML()}
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
    if (vars.length) h += sect('Màu chung', `<div class="ce-vrow">${vars.map(([n, v]) => `<label><input type="color" data-cevar="${esc(n)}" value="${esc(v)}"><small>${esc(n)}</small></label>`).join('')}</div>`, 'ti-palette');
    h += sect('Các lớp', layersHTML(o), 'ti-stack-2');
    h += sect('Claude sửa', `<div class="row"><input data-ceask maxlength="300" placeholder="Ví dụ: nền đỏ, chữ to hơn"><button data-ce="edit"><i class="ti ti-sparkles"></i> Sửa</button></div>
      <div class="help">Ra 3 phương án ở panel Element riêng, Nhận thì thay element này (⌘Z được).${o.elem_id ? ' ' + S.tip('Claude dùng lại ảnh ví dụ đã lưu cùng element trong thư viện (nếu có). Đính ảnh mới ở tab Claude để thay.') : ''}</div>`, 'ti-message-chatbot');
    return ['celem', 'Element riêng', `<div id="cepanel">${h}</div>`];
  }
  S.addInspectorTab(tab);

  // ---------- sửa từng lớp (chủ repo 2026-11-19: element Claude dựng phải tách rõ khối / chữ để sửa ở Thuộc tính) ----------
  // Mỗi ô ghi thẳng vào o.spec.layers[i] bằng giá trị trong biên của CELEM.check (màu #hex từ ô màu, số từ thanh trượt),
  // engine kiểm lại lúc vẽ. Màu '@primary' / '$biến' hiện màu đã giải; đổi màu thì lớp đó thành #hex riêng.
  const KIND_VI = { rect: 'Khối vuông', round: 'Khối bo góc', pill: 'Khối viên thuốc', line: 'Đường', text: 'Chữ', image: 'Logo' };
  const DFILL = '#FFD84A'; // design-token-ok: màu nền mặc định của lớp trong video (dữ liệu render)
  const SHAPES = [['rect', 'Vuông', 'ti-square'], ['round', 'Bo góc', 'ti-square-rounded'], ['pill', 'Viên thuốc', 'ti-pill']];
  function hexOf(v, spec, d = '#FFFFFF') { // design-token-ok: màu mặc định của lớp trong video (dữ liệu render)
    if (typeof v !== 'string') return d;
    if (v.startsWith('$')) v = spec.vars?.[v.slice(1)] ?? '';
    if (v.startsWith('@')) v = (S.TL.brand || {})[v.slice(1)] || '';
    if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + [...v.slice(1)].map(c => c + c).join('');
    return HEX6.test(v) ? v : d;
  }
  const rngL = (i, f, v, a, b, st, l, u = '') => `<div class="slrow"><span>${l}</span><input type="range" data-cel="${i}" data-f="${f}" min="${a}" max="${b}" step="${st}" value="${v}"><b>${v}${u}</b></div>`;
  const colL = (i, f, v, l) => `<label class="ce-col"><input type="color" data-cel="${i}" data-f="${f}" value="${v}"><small>${l}</small></label>`;
  function layersHTML(o) {
    const spec = o.spec || {}, sm = Math.min((o.card?.w || spec.w) / spec.w, (o.card?.h || spec.h) / spec.h) || 1;
    return (spec.layers || []).map((L, i) => {
      let b = '';
      if (L.k === 'rect' || L.k === 'round' || L.k === 'pill') {
        b += `<div class="ce-seg">${SHAPES.map(([k, l, ic]) => `<button data-celk="${i}" data-k="${k}" class="${L.k === k ? 'on' : ''}" title="${l}"><i class="ti ${ic}"></i>${l}</button>`).join('')}</div>`;
        if (L.k === 'round') b += rngL(i, 'r', Math.round(L.r ?? 24), 0, Math.round(Math.min(spec.w, spec.h) / 2), 1, 'Bo góc', 'px');
        b += `<div class="ce-cols">${typeof L.fill === 'object' && L.fill ? colL(i, 'fill.from', hexOf(L.fill.from, spec), 'Nền (đầu)') + colL(i, 'fill.to', hexOf(L.fill.to, spec), 'Nền (cuối)')
          : colL(i, 'fill', hexOf(L.fill, spec, DFILL), 'Nền')}${colL(i, 'stroke', hexOf(L.stroke, spec), 'Viền')}</div>`;
        b += rngL(i, 'sw', L.sw || 0, 0, 30, 1, 'Độ dày viền', 'px');
      } else if (L.k === 'text') {
        if (!String(L.text).includes('{text}')) b += `<input data-celt="${i}" value="${esc(L.text)}" maxlength="200" placeholder="Chữ">`;
        else b += '<div class="help">Chữ chính: sửa ở ô Chữ phía trên.</div>';
        b += `<div class="ce-cols">${colL(i, 'color', hexOf(L.color, spec), 'Màu chữ')}</div>`;
        b += rngL(i, 'size', Math.round(L.size || 40), 8, Math.max(200, Math.round(L.size || 40)), 1, 'Cỡ chữ', '');
        b += rngL(i, 'weight', L.weight || 800, 300, 900, 100, 'Độ đậm', '');
      } else if (L.k === 'line') {
        b += `<div class="ce-cols">${colL(i, 'stroke', hexOf(L.stroke || L.fill, spec), 'Màu')}</div>` + rngL(i, 'sw', L.sw || 4, 1, 30, 1, 'Độ dày', 'px');
      }
      b += rngL(i, 'opacity', Math.round((L.opacity ?? 1) * 100), 0, 100, 1, 'Độ mờ', '%');
      const title = L.k === 'text' ? `Chữ «${esc(String(L.text).replace('{text}', o.text || '…').slice(0, 24))}»` : KIND_VI[L.k];
      return `<details class="ce-layer"${i === 0 ? ' open' : ''}><summary>${i + 1}. ${title}</summary>${b}</details>`;
    }).join('') + (sm ? '' : '');
  }
  // ghi một trường của lớp i (f có thể là 'fill.from')
  function setLayer(o, i, f, v) {
    const L = o.spec?.layers?.[i]; if (!L) return;
    if (f === 'fill.from' || f === 'fill.to') { if (typeof L.fill === 'object' && L.fill) L.fill[f.slice(5)] = v; return; }
    if (f === 'opacity') { L.opacity = v / 100; return; }
    if (f === 'sw' && v > 0 && L.k !== 'line' && !L.stroke) L.stroke = '#FFFFFF'; // design-token-ok: màu viền mặc định của lớp trong video
    L[f] = v;
  }
  const cur = () => (isCe(S.sel) ? S.sel : null);
  const set = (fn, key) => { const c = cur(); if (!c) return; S.pushUndo(key); fn(c.obj); S.changed(!key); };

  document.addEventListener('click', e => {
    const k = e.target.closest('#cepanel [data-celk]');
    if (k) return set(o => { const L = o.spec.layers[+k.dataset.celk]; if (!L) return; L.k = k.dataset.k; if (L.k === 'round' && L.r == null) L.r = 24; if (L.k !== 'round') delete L.r; });
    const b = e.target.closest('#libbody [data-ce], #cepanel [data-ce]'); if (!b) return;
    const a = b.dataset.ce;
    if (a === 'make') return make($('#ce-ask')?.value);
    if (a === 'rmref') { ST.refs.splice(+b.dataset.i, 1); return repaint(); }
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
    if (t.dataset.cel != null) {
      const i = +t.dataset.cel, f = t.dataset.f, v = t.type === 'color' ? t.value : +t.value;
      if (t.type === 'color' && !HEX6.test(v)) return;
      const lab = t.nextElementSibling; if (t.type === 'range' && lab) lab.textContent = v + (f === 'opacity' ? '%' : f === 'r' || f === 'sw' ? 'px' : '');
      return set(o => setLayer(o, i, f, v), `cel${i}${f}`);
    }
    if (t.dataset.celt != null) return set(o => { const L = o.spec.layers[+t.dataset.celt]; if (L) L.text = t.value.replace(/[<>]/g, '').slice(0, 200) || ' '; }, 'celt' + t.dataset.celt);
  });

  // nhận ảnh: chọn file, kéo thả vào ô, dán khi con trỏ ở ô mô tả của panel
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.matches?.('#libbody [data-ce-file]')) { const keep = $('#ce-ask')?.value; const n = await addRefs(t.files); t.value = ''; if (n) { repaint(); if (keep && $('#ce-ask')) $('#ce-ask').value = keep; } }
    if (t.matches?.('#libbody [data-ce-bf]')) ST.brandFirst = t.checked;
  });
  document.addEventListener('dragover', e => { const z = e.target.closest?.('#libbody [data-ce-drop]'); if (z && e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); e.stopPropagation(); z.classList.add('over'); } }, true);
  document.addEventListener('dragleave', e => e.target.closest?.('#libbody [data-ce-drop]')?.classList.remove('over'), true);
  document.addEventListener('drop', async e => {
    const z = e.target.closest?.('#libbody [data-ce-drop]');
    if (z && e.dataTransfer?.files?.length) { e.preventDefault(); e.stopPropagation(); z.classList.remove('over'); const keep = $('#ce-ask')?.value; if (await addRefs(e.dataTransfer.files)) { repaint(); if (keep && $('#ce-ask')) $('#ce-ask').value = keep; } return; }
    // tab Claude: thả ảnh vào ô hỏi = đính ảnh
    if (e.target.closest?.('#askbar') && e.dataTransfer?.files?.length && [...e.dataTransfer.files].some(f => f.type.startsWith('image/'))) { e.preventDefault(); e.stopPropagation(); if (await addRefs(e.dataTransfer.files, ASKREFS)) paintAsk(); }
  }, true);
  document.addEventListener('paste', async e => {
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    if (e.target.id === 'ce-ask') { e.preventDefault(); const keep = e.target.value; if (await addRefs(files)) { repaint(); const t = $('#ce-ask'); if (t) { t.value = keep; t.focus(); } } }
    else if (e.target.matches?.('#askbar [data-ask-in]')) { e.preventDefault(); if (await addRefs(files, ASKREFS)) paintAsk(); }
  });
  // dải ảnh đính dưới ô hỏi của tab Claude (gắn vào S.ask.bar khi có ảnh)
  function paintAsk() {
    const bar = S.ask?.bar; if (!bar) return;
    let el = bar.querySelector('.ce-askrefs');
    if (!ASKREFS.length) { el?.remove(); return; }
    if (!el) { el = document.createElement('div'); el.className = 'ce-askrefs'; bar.querySelector('.ask-row')?.after(el); }
    el.innerHTML = ASKREFS.map((u, i) => `<span class="ce-ref"><img src="${esc(u)}" alt="Ảnh đính ${i + 1}"><button data-ce-askrm="${i}" title="Bỏ ảnh"><i class="ti ti-x"></i></button></span>`).join('') +
      '<small>Ảnh ví dụ cho Claude dựng / sửa element riêng</small>';
  }
  document.addEventListener('click', e => { const b = e.target.closest?.('[data-ce-askrm]'); if (b) { ASKREFS.splice(+b.dataset.ceAskrm, 1); paintAsk(); } });
  // 75_ask.js lấy ảnh đính khi việc là elem_create / sửa element riêng (lấy xong thì xoá dải)
  const takeAskRefs = () => { const r = ASKREFS.splice(0); paintAsk(); return r; };

  S.celem = { make, takeAskRefs, open: () => S.workflow?.focus?.('celem'), get state() { return ST.st; } };

  const st = document.createElement('style');
  st.textContent = `
.ce-box { display:flex; flex-direction:column; gap:var(--space-2); margin:var(--space-2) 0 var(--space-3); }
.ce-box textarea { width:100%; resize:vertical; }
.ce-refs { display:flex; flex-wrap:wrap; gap:var(--space-1); align-items:center; padding:var(--space-1); border:1px dashed rgb(var(--color-line-hover)); border-radius:var(--radius-control); }
.ce-refs.over { border-color:rgb(var(--color-accent-text) / .5); background:rgb(var(--color-accent-soft) / .24); }
.ce-ref { position:relative; display:inline-flex; }
.ce-ref img { width:44px; height:44px; object-fit:cover; border-radius:var(--radius-xs); display:block; }
.ce-ref button { position:absolute; top:-6px; right:-6px; min-height:0; width:18px; height:18px; padding:0; border-radius:50%; font-size:var(--text-2xs); }
.ce-addref { display:flex; align-items:center; gap:var(--space-1); flex:1; min-width:0; font-size:var(--text-2xs); color:rgb(var(--color-fg-muted)); cursor:pointer; padding:var(--space-1); }
.ce-bf { font-size:var(--text-2xs); color:rgb(var(--color-fg-muted)); }
#askbar .ce-askrefs { display:flex; flex-wrap:wrap; align-items:center; gap:var(--space-1); margin-top:var(--space-1); }
#askbar .ce-askrefs small { color:rgb(var(--color-fg-muted)); font-size:var(--text-2xs); }
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
#cepanel .ce-layer { border:1px solid rgb(var(--color-line)); border-radius:var(--radius-control); padding:var(--space-1) var(--space-2); margin-bottom:var(--space-1); }
#cepanel .ce-layer summary { cursor:pointer; font-size:var(--text-xs); padding:var(--space-050) 0; }
#cepanel .ce-layer[open] summary { margin-bottom:var(--space-1); }
#cepanel .ce-layer > input { width:100%; margin-bottom:var(--space-1); }
#cepanel .ce-seg { display:grid; grid-template-columns:repeat(3,1fr); gap:var(--space-1); margin-bottom:var(--space-1); }
#cepanel .ce-seg button { flex-direction:column; gap:var(--space-050); padding:var(--space-1) var(--space-050); font-size:var(--text-2xs); }
#cepanel .ce-seg button.on { background:rgb(var(--color-accent-soft) / .24); border-color:rgb(var(--color-accent-text) / .5); }
#cepanel .ce-cols { display:flex; flex-wrap:wrap; gap:var(--space-2); margin-bottom:var(--space-1); }
#cepanel .ce-col { display:flex; flex-direction:column; align-items:center; gap:var(--space-050); font-size:var(--text-2xs); color:rgb(var(--color-fg-muted)); }
#cepanel .ce-vrow { display:flex; flex-wrap:wrap; gap:var(--space-2); }
#cepanel .ce-vrow label { display:flex; flex-direction:column; align-items:center; gap:var(--space-050); font-size:var(--text-2xs); color:rgb(var(--color-fg-muted)); }
#cepanel input[type=color] { width:44px; height:var(--h-md); padding:var(--space-050); }
#cepanel .row { display:flex; gap:var(--space-1); align-items:center; }
#cepanel .row input { flex:1; min-width:0; }`;
  document.head.appendChild(st);
})();
