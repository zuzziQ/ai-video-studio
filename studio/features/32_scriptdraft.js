// S27 M191 · Kịch bản → mẫu dựng sẵn, trước khi quay (server: studio/routes/32_scriptdraft.mjs, lõi scripts/script_draft.mjs).
// Không panel, không bảng cài đặt: một hộp gọn mở từ thẻ trang chủ "Dựng trước khi quay" (02_onboarding.js) hoặc nút cùng tên trong
// ô Kịch bản khi dự án chưa có lời thoại (19_script.js). Nhập: ô chữ (dán / thả .docx, Excel có mốc giây, .txt) + thương hiệu + khổ
// + tốc độ đọc (2,6 từ/giây, đổi 2,0–3,4). Bấm Dựng → job nền `script_draft` → 3 thẻ phương án hiện dần, mỗi thẻ 5 khung ảnh tĩnh,
// số graphic, "Theo kịch bản x/y", lưu ý của kiểm engine + QC. Mỗi thẻ: Dùng cho video mới (chép vào Du an/ của Kho rồi mở; chỉnh tiếp
// ở tab Claude: Xem / Hoàn tác; mỗi khối mang ghi chú kịch bản _script với Sửa tay / Hỏi Claude của 23_scriptnotes.js) hoặc Lưu thành
// mẫu của thương hiệu (brand_id, M189). Danh sách quay tải về .txt. Quay xong: thả video, Tạo lời thoại → mẫu dời theo giờ thật.
(() => {
  const S = window.Studio, { esc } = S;
  const css = document.createElement('style');
  css.textContent = `#modalbox:has(.sd) { width: min(1120px, calc(100vw - 2 * var(--space-4))); max-width: calc(100vw - 2 * var(--space-4)); }
.sd h3{display:flex;align-items:center;gap:var(--space-2);margin:0 0 var(--space-1)}
.sd .sd-sub{margin:0 0 var(--space-3);color:var(--color-fg-muted);font-size:var(--text-sm)}
.sd textarea{width:100%;min-height:200px;resize:vertical;box-sizing:border-box;font:inherit;font-size:var(--text-sm);padding:var(--space-2);border:1px solid var(--color-line-strong);border-radius:var(--radius-control);background:var(--color-surface);color:var(--color-fg)}
.sd textarea.is-over{border-color:var(--color-accent);outline:2px dashed var(--color-accent)}
.sd-row{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2);margin-top:var(--space-2)}
.sd-row .grow{flex:1 1 auto}.sd-row label{display:inline-flex;align-items:center;gap:var(--space-1);font-size:var(--text-xs);color:var(--color-fg-muted)}
.sd-row select,.sd-row input[type=number]{font:inherit;font-size:var(--text-sm)}.sd-row input[type=number]{width:4.5em}
.sd-seg{display:inline-flex;border:1px solid var(--color-line-strong);border-radius:var(--radius-control);overflow:hidden}
.sd-seg button{border:0;border-radius:0;padding:var(--space-1) var(--space-2);background:transparent;color:var(--color-fg-muted)}
.sd-seg button.on{background:var(--color-surface-hover);color:var(--color-fg);font-weight:600}
.sd-est{font-size:var(--text-xs);color:var(--color-fg-muted);font-variant-numeric:tabular-nums}
.sd-prog{display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);color:var(--color-fg-muted);margin:var(--space-2) 0}
.sd-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--space-3);margin-top:var(--space-2)}
@media (max-width:860px){.sd-cards{grid-template-columns:minmax(0,1fr)}}
.sd-card{display:flex;flex-direction:column;gap:var(--space-2);min-width:0;padding:var(--space-2);border:1px solid var(--color-line-strong);border-radius:var(--radius-card);background:var(--color-surface)}
.sd-card.wait{opacity:.7}.sd-card h4{margin:0;font-size:var(--text-md);display:flex;align-items:baseline;gap:var(--space-1);flex-wrap:wrap}
.sd-card h4 small{font-weight:400;color:var(--color-fg-muted);font-size:var(--text-xs)}
.sd-strip{display:flex;gap:var(--space-050);overflow-x:auto;min-height:60px}
.sd-strip img{flex:0 0 auto;height:150px;border-radius:var(--radius-xs);background:var(--color-surface-muted);cursor:zoom-in}
.sd-strip.h img{height:84px}.sd-strip.sq img{height:110px}
.sd-meta{font-size:var(--text-xs);color:var(--color-fg-muted);display:flex;flex-direction:column;gap:var(--space-050);overflow-wrap:anywhere}
.sd-meta .warn{color:var(--color-warning-text)}.sd-meta .ok{color:var(--color-success-text)}.sd-meta .bad{color:var(--color-danger-text)}
.sd-card .sd-act{display:flex;flex-wrap:wrap;gap:var(--space-1);margin-top:auto}
.sd-recent{font-size:var(--text-xs);color:var(--color-fg-muted);margin-top:var(--space-2);display:flex;flex-wrap:wrap;gap:var(--space-1);align-items:center}
.sd-big{display:block;max-width:100%;max-height:78vh;margin:0 auto;border-radius:var(--radius-control)}`;
  document.head.appendChild(css);

  const D = { text: '', name: '', brand: '', aspect: '9:16', wps: 2.6, id: null, timer: null, brands: null, last: null };
  const WPS_MIN = 2, WPS_MAX = 3.4;
  const s1 = v => (+v || 0).toFixed(1).replace('.', ',');
  const box = () => document.querySelector('#modalbox .sd');
  // ước nhanh ở trình duyệt (server ước lại bằng estimateTimes): bỏ dấu [ … ], đếm từ, + nghỉ giữa đoạn
  function quickEst(text, wps) {
    const segs = String(text || '').replace(/\[[^\]\n]{0,200}\]/g, ' ').split(/\n\s*\n|\n/).map(x => x.trim()).filter(Boolean);
    const words = segs.reduce((n, x) => n + x.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length, 0);
    return { segs: segs.length, sec: words ? words / wps + .4 * Math.max(0, segs.length - 1) : 0 };
  }
  async function brands() {
    if (D.brands) return D.brands;
    try { const b = await S.api('/api/brands'); D.brands = Array.isArray(b) ? b : []; } catch { D.brands = []; }
    return D.brands;
  }
  async function open(o = {}) {
    clearTimeout(D.timer);
    if (o.text != null) { D.text = o.text; D.name = o.name || ''; D.id = null; }
    if (o.brand != null) D.brand = o.brand;
    if (o.id) D.id = o.id;
    const bl = await brands();
    if (!D.brand && bl.length) D.brand = S.TL?.brand?.kit && bl.some(b => b.id === S.TL.brand.kit) ? S.TL.brand.kit : bl[0].id;
    if (D.id) return showDraft();
    renderInput(bl);
    S.api('/api/draft/list').then(r => { D.last = r?.drafts || []; const el = box()?.querySelector('[data-sd="recent"]'); if (el) el.innerHTML = recentHtml(); }).catch(() => {});
  }
  const recentHtml = () => (D.last || []).length ? `<i class="ti ti-history"></i>Bản nháp gần đây: ${D.last.slice(0, 3).map(d => `<button class="ai-lnk" data-sd="view" data-id="${esc(d.id)}">${esc(d.name || d.id)}</button>`).join(' · ')}` : '';
  function renderInput(bl) {
    S.modal(`<div class="sd"><h3><i class="ti ti-layout-board-split"></i> Dựng trước khi quay</h3>
      <p class="sd-sub">Chưa có video: dán kịch bản (có hoặc không dấu [B-ROLL: …], [CHỮ: …]) hoặc thả file .docx / Excel có mốc giây. Claude dựng sẵn 3 phương án để xem trước, kèm danh sách cảnh cần quay.</p>
      <textarea data-sd="text" placeholder="[HOOK] Bạn có biết 90% người mua nhà lần đầu bị hớ?&#10;&#10;Lý do thứ nhất… [B-ROLL: căn hộ]&#10;&#10;[CTA] Theo dõi để xem phần 2" aria-label="Kịch bản">${esc(D.text)}</textarea>
      <div class="sd-row">
        ${bl.length ? `<label>Thương hiệu <select data-sd="brand" aria-label="Thương hiệu">${bl.map(b => `<option value="${esc(b.id)}"${b.id === D.brand ? ' selected' : ''}>${esc(b.title || b.name || b.id)}</option>`).join('')}</select></label>` : ''}
        <span class="sd-seg" role="group" aria-label="Khổ video">${['9:16', '16:9', '1:1'].map(a => `<button type="button" data-sd="aspect" data-a="${a}" class="${a === D.aspect ? 'on' : ''}" aria-pressed="${a === D.aspect}">${a}</button>`).join('')}</span>
        <label title="Tốc độ đọc để ước thời lượng mỗi đoạn (Excel có mốc giây thì theo mốc)">Đọc <input type="number" data-sd="wps" min="${WPS_MIN}" max="${WPS_MAX}" step=".1" value="${D.wps}" aria-label="Tốc độ đọc, từ mỗi giây"> từ/giây</label>
        <span class="sd-est" data-sd="est"></span><span class="grow"></span>
        <button type="button" data-sd="pick" title="Kịch bản chữ (.txt, .docx) hoặc bảng theo đoạn giây (.xlsx, .csv)"><i class="ti ti-file-upload"></i> Mở file</button><input type="file" data-sd="file" accept=".txt,.md,.docx,.xlsx,.csv,.tsv" hidden>
        <button onclick="closeModal()">Đóng</button>
        <button class="primary" data-sd="go"><i class="ti ti-sparkles"></i> Dựng 3 phương án</button></div>
      <div class="sd-recent" data-sd="recent">${recentHtml()}</div></div>`);
    const el = box(), ta = el.querySelector('[data-sd="text"]');
    const est = () => { const e = quickEst(ta.value, D.wps); el.querySelector('[data-sd="est"]').textContent = e.segs ? `≈ ${Math.round(e.sec)} giây · ${e.segs} đoạn` : ''; };
    est();
    ta.oninput = () => { D.text = ta.value; est(); };
    // vùng thả riêng: stopPropagation ở cả dragover lẫn drop, không để trình thả của cửa sổ chép file vào Media dự án (ai-video-studio-067)
    ta.ondragover = e => { if (![...(e.dataTransfer?.types || [])].includes('Files')) return; e.preventDefault(); e.stopPropagation(); ta.classList.add('is-over'); };
    ta.ondragleave = () => ta.classList.remove('is-over');
    ta.ondrop = e => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); e.stopPropagation(); ta.classList.remove('is-over'); document.getElementById('drop')?.remove(); readFile(e.dataTransfer.files[0], ta, est); };
    el.querySelector('[data-sd="pick"]').onclick = () => el.querySelector('[data-sd="file"]').click();
    el.querySelector('[data-sd="file"]').onchange = e => { const f = e.target.files[0]; if (f) readFile(f, ta, est); };
    el.querySelector('[data-sd="brand"]')?.addEventListener('change', e => { D.brand = e.target.value; });
    el.querySelector('[data-sd="wps"]').onchange = e => { const v = Math.min(WPS_MAX, Math.max(WPS_MIN, +e.target.value || 2.6)); D.wps = Math.round(v * 10) / 10; e.target.value = D.wps; est(); };
    el.addEventListener('click', onClick);
    el.querySelector('[data-sd="go"]').onclick = start;
    ta.focus();
  }
  async function readFile(f, ta, est) {
    try {
      if (!S.scriptFileText) throw new Error('Chưa nạp được bộ đọc file kịch bản');
      const t = await S.scriptFileText(f); // bảng không nhận ra cột lời: báo lỗi của /api/script/table (gán cột ở ô Kịch bản của dự án)
      D.text = t; D.name = f.name.replace(/\.[a-z0-9]+$/i, ''); ta.value = t; est();
    } catch (e) { S.toast(e.message); }
  }
  async function start(e) {
    const b = e.currentTarget, text = D.text.trim(); if (!text) return S.toast('Kịch bản đang trống');
    b.disabled = true;
    try {
      const r = await S.api('/api/draft', { text, name: D.name, brand: D.brand, aspect: D.aspect, wps: D.wps });
      if (r.error) throw new Error(r.error);
      D.id = r.id; showDraft();
    } catch (err) { b.disabled = false; S.toast(err.message); }
  }
  function onClick(e) {
    const t = e.target.closest('[data-sd]'); if (!t) return;
    const a = t.dataset.sd;
    if (a === 'aspect') { D.aspect = t.dataset.a; box().querySelectorAll('[data-sd="aspect"]').forEach(x => { x.classList.toggle('on', x === t); x.setAttribute('aria-pressed', x === t); }); }
    else if (a === 'view') { D.id = t.dataset.id; showDraft(); }
  }

  // ---------- 3 thẻ phương án ----------
  const stripCls = asp => (asp === '16:9' ? 'h' : asp === '1:1' ? 'sq' : '');
  function cardHtml(v, asp, id) {
    if (!v) return '<div class="sd-card wait"><h4><i class="ti ti-loader-2 spin"></i> Đang dựng…</h4><div class="sd-strip"></div></div>';
    if (v.error) return `<div class="sd-card"><h4>${esc(v.name)}</h4><div class="sd-meta"><span class="bad"><i class="ti ti-alert-triangle"></i> Không dựng được: ${esc(v.error)}</span></div></div>`;
    const warn = (v.issues || []).filter(i => i.severity !== 'info');
    const imgs = (v.stills || []).map(s => `<img src="${esc(window.avsUrl(`/api/draft/still?id=${encodeURIComponent(id)}&v=${v.k}&n=${s.n}`))}" alt="Khung ${s.n} lúc ${s1(s.t)} giây" data-sd="zoom" loading="lazy">`).join('');
    return `<div class="sd-card"><h4>${esc(v.name)} <small>gói ${esc(v.pack || '?')} · ${esc(v.note || '')}</small></h4>
      <div class="sd-strip ${stripCls(asp)}">${imgs || `<span class="sd-meta">${esc(v.stillError || 'Không có khung ảnh')}</span>`}</div>
      <div class="sd-meta"><span>${v.scenes || 0} graphic${v.script ? ` · Theo kịch bản ${v.script.done}/${v.script.total}` : ''}${v.music?.length ? ` · nhạc ${esc([...new Set(v.music)].join(', '))}` : ''}</span>
        ${warn.length ? `<span class="warn" title="${esc(warn.map(i => i.msg).join('\n'))}"><i class="ti ti-alert-triangle"></i> ${warn.length} lưu ý kiểm engine / QC: ${esc(warn[0].msg)}</span>` : '<span class="ok"><i class="ti ti-circle-check"></i> Qua kiểm engine + QC</span>'}
        ${v.summary ? `<span>${esc(v.summary.slice(0, 160))}</span>` : ''}</div>
      <div class="sd-act"><button class="primary" data-sd="use" data-v="${v.k}"><i class="ti ti-video-plus"></i> Dùng cho video mới</button>
        <button data-sd="tpl" data-v="${v.k}" title="Lưu vào thư viện mẫu, gắn với thương hiệu của bản nháp"><i class="ti ti-template"></i> Lưu thành mẫu</button></div></div>`;
  }
  async function showDraft() {
    clearTimeout(D.timer);
    let r; try { r = await S.api(`/api/draft?id=${encodeURIComponent(D.id)}`); } catch (e) { r = { error: e.message }; }
    if (r.error) { S.toast(r.error); D.id = null; return open(); }
    const res = r.result, j = r.job, asp = r.draft.aspect, vs = res?.variants || [];
    const running = j && ['queued', 'running'].includes(j.state);
    const failed = !running && (j?.state === 'error' || res?.state === 'error') && !vs.some(v => !v.error);
    const prog = running ? `<div class="sd-prog"><i class="ti ti-loader-2 spin"></i><span>${esc(j.step || 'Đang chờ trong hàng đợi')}${j.progress ? ` · ${Math.round(j.progress * 100)}%` : ''}</span></div>`
      : failed ? `<div class="sd-prog"><i class="ti ti-alert-triangle"></i><span>${esc(j?.error || 'Không dựng được')}</span></div>` : '';
    const n = 3, cards = Array.from({ length: n }, (_, i) => vs[i] ? cardHtml(vs[i], asp, D.id) : running ? cardHtml(null) : '').join('');
    const est = res ? ` · ${res.segments} đoạn · ≈ ${Math.round(res.duration)} giây theo ${s1(res.wps)} từ/giây` : '';
    S.modal(`<div class="sd"><h3><i class="ti ti-layout-board-split"></i> ${esc(r.draft.name || 'Bản nháp')}</h3>
      <p class="sd-sub">Khổ ${esc(asp)}${est}. Chọn một phương án: Dùng cho video mới mở dự án chưa quay (ô chờ quay), chỉnh tiếp ở tab Claude; quay xong thả video vào, bấm Tạo lời thoại để mẫu dời theo giọng thật.</p>
      ${prog}<div class="sd-cards">${cards}</div>
      <div class="sd-row"><button data-sd="new"><i class="ti ti-arrow-left"></i> Bản nháp mới</button>
        ${res?.shots ? '<button data-sd="shots" title="Mỗi đoạn lời, cỡ khung và B-roll cần tự quay"><i class="ti ti-list-check"></i> Danh sách quay (.txt)</button>' : ''}
        <span class="grow"></span><button onclick="closeModal()">Đóng</button></div></div>`);
    const el = box();
    el.addEventListener('click', e => onCard(e, asp));
    if (running) D.timer = setTimeout(() => { if (box() && D.id) showDraft(); }, 3000); // đóng hộp thì thôi đọc lại
  }
  async function onCard(e, asp) {
    const t = e.target.closest('[data-sd]'); if (!t) return;
    const a = t.dataset.sd;
    if (a === 'shots') { const l = document.createElement('a'); l.href = window.avsUrl(`/api/draft/shots?id=${encodeURIComponent(D.id)}`); l.download = 'danh-sach-quay.txt'; document.body.appendChild(l); l.click(); l.remove(); return; }
    if (a === 'new') { D.id = null; clearTimeout(D.timer); return open(); }
    if (a === 'zoom') { const back = D.id; clearTimeout(D.timer); S.modal(`<div class="sd"><img class="sd-big" src="${esc(t.src)}" alt="${esc(t.alt)}"><div class="sd-row"><span class="grow"></span><button data-sd="back"><i class="ti ti-arrow-left"></i> Về 3 phương án</button></div></div>`); box().querySelector('[data-sd="back"]').onclick = () => { D.id = back; showDraft(); }; return; }
    if (a === 'use') {
      t.disabled = true;
      try {
        // lưu dự án đang mở trước khi đổi sang dự án mới (như mở dự án gần đây ở trang chủ)
        if (S.META?.dir && S.TL) { await S.saveNow?.().catch(() => {}); if (S.dirty) throw new Error('Chưa lưu được dự án đang mở'); }
        const r = await S.api('/api/draft/use', { id: D.id, v: +t.dataset.v });
        if (r.error) throw new Error(r.error);
        try { sessionStorage.setItem('avs-draft-opened', '1'); } catch { /* trình duyệt chặn lưu: bỏ qua lời nhắc */ }
        return location.reload();
      } catch (err) { t.disabled = false; return S.toast(err.message); }
    }
    if (a === 'tpl') {
      t.disabled = true;
      try { const r = await S.api('/api/draft/template', { id: D.id, v: +t.dataset.v }); if (r.error) throw new Error(r.error); S.toast('Đã lưu thành mẫu của thương hiệu (thư viện Mẫu, đứng đầu khi mở thương hiệu này)'); t.innerHTML = '<i class="ti ti-check"></i> Đã lưu mẫu'; }
      catch (err) { t.disabled = false; S.toast(err.message); }
    }
  }
  S.scriptDraft = { open, quickEst };
  // vừa mở dự án từ một phương án: nhắc chỉnh tiếp ở tab Claude (Xem / Hoàn tác) và danh sách quay
  S.onReady(() => {
    let k = null; try { k = sessionStorage.getItem('avs-draft-opened'); sessionStorage.removeItem('avs-draft-opened'); } catch { /* không đọc được: thôi */ }
    if (!k || !S.TL?.draft) return;
    S.right?.show?.('claude');
    S.toast('Mẫu dựng sẵn đã mở (chưa quay). Chỉnh tiếp ở tab Claude; danh sách quay ở “Danh sach quay.txt” trong thư mục dự án.');
  });
})();
