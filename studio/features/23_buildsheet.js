// Bảng dựng theo đoạn (S27 M194, docs/plans/S27-dung-theo-kich-ban.md mục 2.3–2.4). Route: studio/routes/23_buildsheet.mjs.
// Panel trái "Bảng dựng" (bước Dựng): mỗi đoạn của kịch bản một thẻ: Lời (bấm = tua tới), Mood, Nhạc, A-roll, B-roll (ảnh nhỏ + nguồn,
// Đổi / Tìm khác / Chọn từ Kho), SFX (nghe thử), Chữ. Ô sửa tay thành nguồn `user` (dựng lại bảng giữ), khoá cả hàng.
// Đầu panel: Dựng lại ô trống (Claude, một lần cho cả bảng), Áp lên timeline (job `buildsheet` trong khay việc → Studio.ai.applyPlan
// với plan.sheet: một bước hoàn tác), Hoàn tác lần áp. Mở từ dòng "Bảng dựng" của ô Kịch bản (19_script) và từ tab Claude.
// Studio.buildSheet: { open(), refresh() }
(() => {
  const S = window.Studio, { esc } = S;
  const st = document.createElement('style');
  st.textContent = `
  .bs { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
  .bs-top { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .bs-top .bs-gap { flex: 1 1 auto; }
  .bs-help { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); margin: 0; }
  .bs-rows { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
  .bs-row { border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-card); padding: var(--space-2); background: rgb(var(--color-surface-raised)); min-width: 0; }
  .bs-row.is-lock { opacity: .75; }
  .bs-head { display: flex; gap: var(--space-2); align-items: baseline; min-width: 0; }
  .bs-t { flex: none; font-variant-numeric: tabular-nums; font-size: var(--text-2xs); }
  .bs-say { flex: 1 1 auto; min-width: 0; font-size: var(--text-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .bs-say:hover { color: rgb(var(--color-accent-text)); }
  .bs-tag { flex: none; font-size: var(--text-2xs); padding: 0 var(--space-1); border-radius: var(--radius-pill); background: rgb(var(--color-accent) / .16); color: rgb(var(--color-accent-text)); }
  .bs-grid { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: var(--space-1) var(--space-2); margin-top: var(--space-2); align-items: start; }
  .bs-k { font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); padding-top: var(--space-1); }
  .bs-v { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
  .bs-v select, .bs-v input { min-width: 0; width: 100%; box-sizing: border-box; font-size: var(--text-xs); }
  .bs-it { display: flex; gap: var(--space-1); align-items: center; min-width: 0; }
  .bs-it > :not(button) { flex: 1 1 auto; min-width: 0; }
  .bs-it button, .bs-add { flex: none; font-size: var(--text-2xs); padding: 0 var(--space-1); min-height: var(--h-sm, 24px); }
  .bs-th { flex: none !important; width: 40px; height: 40px; border-radius: var(--radius-sm, 6px); object-fit: cover; background: rgb(var(--color-line)); display: inline-flex; align-items: center; justify-content: center; }
  .bs-bq { font-size: var(--text-2xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bs-bq b { font-weight: 600; }
  .bs-from { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); }
  .bs-from.is-user { color: rgb(var(--color-accent-text)); }
  .bs-miss { color: rgb(var(--color-danger-text)); font-size: var(--text-2xs); }
  .bs-find { border: 1px dashed rgb(var(--color-line)); border-radius: var(--radius-sm, 6px); padding: var(--space-1); display: flex; flex-direction: column; gap: var(--space-1); max-height: 220px; overflow-y: auto; }
  .bs-find button { text-align: left; font-size: var(--text-2xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bs-drop { font-size: var(--text-2xs); color: rgb(var(--color-warning)); }
  .bs-drop li { overflow-wrap: anywhere; }
  .bs-empty { font-size: var(--text-xs); color: rgb(var(--color-fg-muted)); padding: var(--space-3); text-align: center; }
  .bs-ask { margin: var(--space-1) var(--space-2); }`;
  document.head.appendChild(st);

  const FROM = { mark: 'dấu', claude: 'Claude', auto: 'tự động', user: 'bạn sửa' };
  const MUSIC = [['bed', 'Nền như cũ'], ['tat', 'Tắt nhạc'], ['bat', 'Bật lại'], ['doi', 'Đổi bài'], ['to', 'To hơn'], ['nho', 'Nhỏ hơn']];
  const FRAME = [['', 'Như video'], ['can', 'Cận mặt'], ['trung', 'Trung'], ['rong', 'Rộng'], ['off', 'Bỏ (B-roll phủ hết)']];
  const KIND = [['', 'Kiểu: gói chọn'], ['so', 'Số'], ['gia', 'Giá'], ['tieude', 'Tiêu đề'], ['trichdan', 'Trích dẫn'], ['danhsach', 'Danh sách']];
  const SRC = { kho: 'Kho', lib: 'Thư viện', stock: 'Stock', ai: 'Ảnh AI', dong: 'B-roll động' };
  let D = null, busy = '', find = null, dropped = [], mark = -1, wantAi = false, dirOf = null;
  const fmt = t => (t == null ? '–' : `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`);
  const opts = (list, v) => list.map(([k, l]) => `<option value="${esc(k)}" ${String(v ?? '') === k ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const from = c => (c?.from ? `<span class="bs-from ${c.from === 'user' ? 'is-user' : ''}">${esc(FROM[c.from] || c.from)}</span>` : '');
  const isOpen = () => typeof panel !== 'undefined' && panel === 'buildsheet';
  const applied = () => new Set([...(S.TL?.scenes || []), ...(S.TL?.audio?.sfx || [])].filter(x => Number.isInteger(x?._sheet)).map(x => x._sheet));
  const sfxUrl = n => { const f = (typeof LIB !== 'undefined' ? LIB.sfx : []).find(x => x.replace(/\.\w+$/, '') === n); return f ? '/assets/sfx/' + f : ''; };

  async function load() {
    const dir = S.META?.dir || '';
    try { const r = await S.api('/api/buildsheet'); if (!r.error) D = r; } catch { /* mất kết nối: giữ bản cũ */ }
    dirOf = dir; // cả khi lỗi: paint không gọi lại load vòng vòng
    paint(); askLink();
  }
  function thumb(b) {
    if (b.src === 'kho' && /\.(jpe?g|png|webp|gif)$/i.test(b.pick || '')) return `<img class="bs-th" loading="lazy" alt="" src="${esc(avsUrl('/api/kho/file?rel=' + encodeURIComponent(b.pick)))}">`;
    const ic = { kho: 'ti-movie', lib: 'ti-photo', stock: 'ti-world', ai: 'ti-sparkles', dong: 'ti-chart-dots' }[b.src] || 'ti-photo-off';
    return `<span class="bs-th"><i class="ti ${ic}"></i></span>`;
  }
  function rowHtml(r, on) {
    const L = r.lock ? 'disabled' : '', seg = r.seg;
    const mood = r.mood || {}, aroll = r.aroll || {};
    const frameV = aroll.off ? 'off' : aroll.frame || '';
    const br = (r.broll || []).map((b, i) => `<div class="bs-it">${thumb(b)}<span class="bs-bq"><b>${esc(SRC[b.src] || 'Chưa có')}</b> · ${esc(b.q || '')}${b.pick && b.src !== 'dong' ? ` · ${esc(String(b.pick).split(/[\\/]/).pop().slice(0, 40))}` : b.src === 'dong' ? ` · ${esc(b.pick || '')}` : ''}
        ${b.miss ? `<br><span class="bs-miss">${esc(b.miss)}</span>` : b.pending ? `<br><span class="bs-from">${esc(b.pending)}</span>` : ''} ${from(b)}</span>
        ${(b.alts || []).length && !r.lock ? `<button data-bs="alt" data-i="${i}" title="Phương án kế: ${esc(b.alts[0])}"><i class="ti ti-switch-horizontal"></i>Đổi</button>` : ''}
        <button data-bs="find" data-i="${i}" ${L} title="Tìm cảnh khác cho ô này"><i class="ti ti-search"></i></button><button data-bs="rm" data-f="broll" data-i="${i}" ${L} aria-label="Bỏ B-roll"><i class="ti ti-x"></i></button></div>`).join('');
    const fx = (r.sfx || []).map((x, i) => `<div class="bs-it"><select data-bs="sfx" data-i="${i}" ${L} aria-label="SFX">${x.name ? '' : `<option value="" selected>${esc(x.q || '?')} (không có)</option>`}${opts((D.sfx || []).map(n => [n, n]), x.name)}</select>
        <button data-bs="play" data-n="${esc(x.name || '')}" aria-label="Nghe thử" ${x.name ? '' : 'disabled'}><i class="ti ti-player-play"></i></button><button data-bs="rm" data-f="sfx" data-i="${i}" ${L} aria-label="Bỏ SFX"><i class="ti ti-x"></i></button></div>`).join('');
    const scr = (r.screen || []).map((x, i) => `<div class="bs-it"><input data-bs="text" data-i="${i}" value="${esc(x.text || '')}" maxlength="120" ${L} aria-label="Chữ trên màn hình">
        <button data-bs="rm" data-f="screen" data-i="${i}" ${L} aria-label="Bỏ chữ"><i class="ti ti-x"></i></button></div>
        <div class="bs-it"><select data-bs="kind" data-i="${i}" ${L} aria-label="Kiểu chữ">${opts(KIND, x.kind || '')}</select>${from(x)}</div>`).join('');
    const findBox = find && find.seg === seg ? `<div class="bs-find" data-bs-find>${find.busy ? '<span class="bs-from">Đang tìm…</span>' : find.items.length ? find.items.map((it, k) => `<button data-bs="pick" data-k="${k}" title="${esc(it.id)}">${esc(SRC[it.src])} · ${esc(it.name)}${it.used ? ' (đã dùng)' : ''}</button>`).join('') : '<span class="bs-from">Không thấy cảnh khớp</span>'}
        <div class="bs-it"><input data-bs="fq" value="${esc(find.q || '')}" placeholder="Tìm trong Kho, thư viện, b-roll động" aria-label="Từ khoá b-roll"><button data-bs="fgo"><i class="ti ti-search"></i></button><button data-bs="fclose" aria-label="Đóng"><i class="ti ti-x"></i></button></div>
        ${D.ai ? '<button data-bs="fai"><i class="ti ti-sparkles"></i>Dùng ảnh AI theo từ khoá (tạo lúc Áp)</button>' : ''}</div>` : '';
    return `<div class="bs-row ${r.lock ? 'is-lock' : ''}" data-seg="${seg}">
      <div class="bs-head"><span class="bs-t">${fmt(r.t0)}</span><span class="bs-say" data-bs="seek" title="${esc(r.say)}">${r.kind !== 'body' ? `<b>${esc(r.kind.toUpperCase())}</b> ` : ''}${esc(r.say)}</span>
        ${r.spoken === false ? '<span class="bs-miss">chưa nói</span>' : ''}${on ? '<span class="bs-tag">đã áp</span>' : ''}
        <button data-bs="lock" class="bs-add" title="${r.lock ? 'Mở khoá hàng' : 'Khoá cả hàng: dựng lại bảng không đổi'}" aria-label="Khoá hàng"><i class="ti ${r.lock ? 'ti-lock' : 'ti-lock-open'}"></i></button></div>
      <div class="bs-grid">
        <span class="bs-k">Mood</span><div class="bs-v"><select data-bs="mood" ${L} aria-label="Mood">${opts([['', mood.from === 'auto' && mood.v ? `Như dự án (${mood.v})` : 'Như dự án'], ...(D.moods || []).map(m => [m, m])], mood.from === 'auto' ? '' : mood.v)}</select>${mood.from !== 'auto' ? from(mood) : ''}</div>
        <span class="bs-k">Nhạc</span><div class="bs-v"><select data-bs="music" ${L} aria-label="Nhạc">${opts([...MUSIC, ...(/^kho/.test(r.music?.v || '') ? [[r.music.v, 'Kho: ' + r.music.v.slice(4)]] : [])], r.music?.v || 'bed')}</select></div>
        <span class="bs-k">A-roll</span><div class="bs-v"><select data-bs="aroll" ${L} aria-label="A-roll">${opts(FRAME, frameV)}</select>${aroll.take ? `<span class="bs-from">take ${aroll.take} (nhiều take: sắp có)</span>` : ''}</div>
        <span class="bs-k">B-roll</span><div class="bs-v">${br}${findBox}${r.lock ? '' : `<div class="bs-it"><button class="bs-add" data-bs="add-broll"><i class="ti ti-plus"></i>Tìm cảnh</button><button class="bs-add" data-bs="kho"><i class="ti ti-folder"></i>Chọn từ Kho</button></div>`}</div>
        <span class="bs-k">SFX</span><div class="bs-v">${fx}${r.lock ? '' : '<button class="bs-add" data-bs="add-sfx"><i class="ti ti-plus"></i>SFX</button>'}</div>
        <span class="bs-k">Chữ</span><div class="bs-v">${scr}${r.lock ? '' : '<button class="bs-add" data-bs="add-text"><i class="ti ti-plus"></i>Chữ</button>'}</div>
      </div></div>`;
  }
  function paint() {
    if (!isOpen()) return;
    const box = document.getElementById('libbody'); if (!box) return;
    if (dirOf !== (S.META?.dir || '')) { box.innerHTML = '<div class="bs-empty">Đang đọc bảng dựng…</div>'; return void load(); }
    const rows = D?.sheet?.rows || [];
    if (!D?.script || !rows.length) {
      box.innerHTML = `<div class="bs"><div class="bs-empty"><i class="ti ti-table"></i><p>${D?.script ? 'Bảng dựng chưa có hàng nào.' : 'Dự án chưa có kịch bản.'} Dán kịch bản ở bước Nguồn (ô Kịch bản), Lưu thì bảng tự dựng theo đoạn.</p>
        <button data-bs="go-src"><i class="ti ti-video"></i>Mở ô Kịch bản</button></div></div>`;
      box.querySelector('[data-bs="go-src"]').onclick = () => S.workflow?.goStep?.('source');
      return;
    }
    const on = applied(), hasAi = rows.some(r => (r.broll || []).some(b => b.src === 'ai'));
    const canUndo = mark >= 0 && typeof undoStack !== 'undefined' && undoStack.length === mark;
    box.innerHTML = `<div class="bs"><div class="bs-top">
        <button data-bs="fill" ${busy ? 'disabled' : ''} title="Claude lấp mood, SFX, B-roll còn trống (một lần cho cả bảng); ô dấu / bạn sửa / hàng khoá giữ nguyên"><i class="ti ${busy === 'fill' ? 'ti-loader-2 spin' : 'ti-sparkles'}"></i>Dựng lại ô trống</button>
        <span class="bs-gap"></span>
        <button data-bs="undo" ${canUndo ? '' : 'disabled'} title="Trả timeline về trước lần Áp gần nhất"><i class="ti ti-arrow-back-up"></i>Hoàn tác lần áp</button>
        <button class="primary" data-bs="apply" ${busy || S.jobs?.locked?.() ? 'disabled' : ''}><i class="ti ${busy === 'apply' ? 'ti-loader-2 spin' : 'ti-player-play'}"></i>Áp lên timeline</button></div>
      ${hasAi && D.ai ? `<label class="bs-help"><input type="checkbox" data-bs="ai" ${wantAi ? 'checked' : ''}> Tạo ảnh AI lúc Áp (${rows.reduce((n, r) => n + (r.broll || []).filter(b => b.src === 'ai').length, 0)} ảnh, tính phí theo khoá của bạn, khoảng 0,04 USD / ảnh)</label>` : ''}
      <p class="bs-help">${rows.length} đoạn · ${on.size} đoạn đã áp. Áp lại chỉ thay phần bảng đặt; phần bạn sửa trên timeline được giữ. Ô bạn sửa ở đây được giữ khi dựng lại bảng.</p>
      ${dropped.length ? `<details class="bs-drop"><summary>${dropped.length} ô chưa áp được</summary><ul>${dropped.slice(0, 20).map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
      <div class="bs-rows">${rows.map(r => rowHtml(r, on.has(r.seg))).join('')}</div></div>`;
    wire(box);
  }
  async function cell(seg, field, value, i = null) {
    const r = await S.api('/api/buildsheet/cell', { seg, field, value, i });
    if (r.error) { S.toast(r.error); return false; }
    const rows = D.sheet.rows, k = rows.findIndex(x => x.seg === seg); if (k >= 0) rows[k] = r.row;
    paint(); return true;
  }
  async function search(seg, q, src, i) {
    find = { seg, q, src, i, items: [], busy: true }; paint();
    const r = await S.api('/api/buildsheet/find', { q, src }).catch(e => ({ error: e.message }));
    if (!find || find.seg !== seg) return;
    find.busy = false; find.items = r.items || []; if (r.error) S.toast(r.error);
    paint();
  }
  function wire(box) {
    box.onclick = async e => {
      const b = e.target.closest('[data-bs]'); if (!b || b.disabled) return;
      const rowEl = b.closest('[data-seg]'), seg = rowEl ? +rowEl.dataset.seg : null, row = D.sheet.rows.find(x => x.seg === seg), i = b.dataset.i != null ? +b.dataset.i : null;
      const act = b.dataset.bs;
      if (busy === 'fill' && act !== 'seek' && act !== 'play') return S.toast('Claude đang lấp ô trống: chờ xong rồi sửa');
      if (act === 'seek' && row?.t0 != null) return typeof setTime === 'function' && setTime(row.t0);
      if (act === 'lock') return cell(seg, 'lock', !row.lock);
      if (act === 'rm') return cell(seg, b.dataset.f, null, i);
      if (act === 'play') { const u = sfxUrl(b.dataset.n); if (u) new Audio(u).play().catch(() => {}); return; }
      if (act === 'alt') {
        const x = row.broll[i], [nx, ...rest] = x.alts, c = nx.indexOf(':'), src = nx.slice(0, c), id = nx.slice(c + 1);
        if (c <= 0) return S.toast('Phương án này không đọc được');
        const back = x.pick ? [`${x.src}:${x.pick}`] : [];
        return cell(seg, 'broll', src === 'ai' ? { q: id || x.q, src: 'ai' } : { q: x.q, src, pick: id, alts: [...rest, ...back] }, i);
      }
      if (act === 'find') return search(seg, row.broll[i]?.q || row.say.slice(0, 60), null, i);
      if (act === 'add-broll') return search(seg, row.say.slice(0, 60), null, null);
      if (act === 'kho') return search(seg, '', 'kho', null);
      if (act === 'fgo') return search(seg, box.querySelector('[data-bs="fq"]')?.value || '', find?.src, find?.i);
      if (act === 'fclose') { find = null; return paint(); }
      if (act === 'pick') {
        const it = find.items[+b.dataset.k], q = find.q || row.say.slice(0, 60), at = find.i; find = null;
        return cell(seg, 'broll', { q, src: it.src, pick: it.id }, at);
      }
      if (act === 'fai') { const q = (box.querySelector('[data-bs="fq"]')?.value || find.q || row.say).slice(0, 120), at = find.i; find = null; return cell(seg, 'broll', { q, src: 'ai' }, at); }
      if (act === 'add-sfx') { const n = (D.sfx || []).find(x => /whoosh|pop|ding/.test(x)) || D.sfx?.[0]; if (!n) return S.toast('Thư viện SFX trống'); return cell(seg, 'sfx', { name: n, at: row.t0, pos: 'dau' }); }
      if (act === 'add-text') return cell(seg, 'screen', { text: row.say.split(/\s+/).slice(0, 4).join(' ') });
      if (act === 'fill') return fill();
      if (act === 'apply') return apply();
      if (act === 'undo') { undo(); mark = -1; S.toast('Đã hoàn tác lần áp bảng dựng'); return paint(); }
    };
    box.onchange = e => {
      const b = e.target.closest('[data-bs]'); if (!b) return;
      if (busy === 'fill' && b.dataset.bs !== 'ai') { S.toast('Claude đang lấp ô trống: chờ xong rồi sửa'); return paint(); }
      if (b.dataset.bs === 'ai') { wantAi = b.checked; return; }
      const seg = +b.closest('[data-seg]')?.dataset.seg, row = D.sheet.rows.find(x => x.seg === seg), i = b.dataset.i != null ? +b.dataset.i : null, v = b.value;
      if (!row) return;
      if (b.dataset.bs === 'mood') return cell(seg, 'mood', v ? { v } : null);
      if (b.dataset.bs === 'music') return cell(seg, 'music', v === 'bed' ? null : { v });
      if (b.dataset.bs === 'aroll') return cell(seg, 'aroll', !v ? null : v === 'off' ? { frame: null, take: row.aroll?.take ?? null, off: true } : { frame: v, take: row.aroll?.take ?? null });
      if (b.dataset.bs === 'sfx') { const x = row.sfx[i]; return cell(seg, 'sfx', { name: v, q: v, at: x.at ?? row.t0, pos: x.pos || 'dau' }, i); }
      if (b.dataset.bs === 'text') return v.trim() ? cell(seg, 'screen', { text: v, kind: row.screen[i].kind || null }, i) : cell(seg, 'screen', null, i);
      if (b.dataset.bs === 'kind') return cell(seg, 'screen', { text: row.screen[i].text, kind: v || null }, i);
    };
    box.onkeydown = e => { if (e.key === 'Enter' && e.target.dataset?.bs === 'fq') { e.preventDefault(); box.querySelector('[data-bs="fgo"]')?.click(); } };
  }
  async function fill() {
    busy = 'fill'; paint();
    try {
      const r = await S.api('/api/buildsheet/fill', {});
      if (r.error) throw new Error(r.error);
      D.sheet = r.sheet; S.toast(r.n ? `Claude lấp ${r.n} ô trống` : 'Không còn ô trống để lấp');
    } catch (e) { S.toast('Dựng lại ô trống chưa được: ' + e.message); }
    busy = ''; paint();
  }
  // Áp: job nền trong khay việc (khoá sửa timeline); xong thì áp kế hoạch ở trình duyệt = một bước hoàn tác
  const sameDir = (a, b) => String(a || '').replace(/[\\/]+$/, '').toLowerCase() === String(b || '').replace(/[\\/]+$/, '').toLowerCase();
  async function done(j) {
    if (j?.dir && S.META?.dir && !sameDir(j.dir, S.META.dir)) return { error: true, text: 'Đã đổi dự án trong lúc áp: mở lại dự án đó rồi bấm Áp lần nữa' };
    const plan = await S.api('/api/buildsheet/plan');
    if (plan.error) return { error: true, text: plan.error };
    if ((plan.dir && S.META?.dir && !sameDir(plan.dir, S.META.dir)) || (j?.started && Date.parse(plan.created) < j.started - 2000)) return { error: true, text: 'Kế hoạch áp không phải của lần chạy này: bấm Áp lần nữa' };
    if (!S.ai?.applyPlan) return { error: true, text: 'Thiếu tính năng AI dựng (20_ai) để áp' };
    S.ai.applyPlan(plan);
    mark = typeof undoStack !== 'undefined' ? undoStack.length : -1;
    dropped = plan.dropped || [];
    busy = ''; paint();
    return { text: `Đã áp bảng dựng · ${plan.summary || ''}${dropped.length ? ` ${dropped.length} ô chưa áp (xem ở panel).` : ''}`, toast: 'Đã áp bảng dựng lên timeline',
      acts: [{ label: 'Mở bảng', icon: 'ti-table', on: () => S.jobs.open('buildsheet') },
        { label: 'Hoàn tác', icon: 'ti-arrow-back-up', on: () => {
          if (mark < 0 || typeof undoStack === 'undefined' || undoStack.length !== mark) { S.toast('Đã sửa thêm sau lần áp: dùng ⌘Z / Ctrl Z để lùi từng bước'); return; }
          undo(); mark = -1; S.toast('Đã hoàn tác lần áp bảng dựng'); paint(); return 'close'; } }] };
  }
  async function apply() {
    if (!await S.saveNow()) return;
    busy = 'apply'; paint();
    let r; try { r = await S.api('/api/buildsheet/apply', { ai: wantAi }); } catch (e) { r = { error: e.message }; }
    if (!r.ok) { busy = ''; paint(); if (r.error && !/tác vụ/i.test(r.error)) return S.toast(r.error); return S.jobs.refuse(r); }
    S.jobs.track({ kind: 'buildsheet', title: 'Áp bảng dựng', lock: true, onDone: done,
      onFail: j => { busy = ''; paint(); return { text: 'Áp bảng dựng chưa được: ' + (j.step || '') }; } }).then(() => { if (busy) { busy = ''; paint(); } });
  }
  S.jobs?.resumable?.('buildsheet', () => ({ onDone: done }));
  // tab Claude (75_ask): một dòng mở bảng khi dự án có bảng dựng
  function askLink() {
    const notes = document.querySelector('#askbar .ask-notes'); if (!notes) return;
    let el = document.querySelector('#askbar .bs-ask');
    if (!D?.sheet?.rows?.length) { el?.remove(); return; }
    if (!el) { el = document.createElement('div'); el.className = 'bs-ask'; notes.after(el); }
    el.innerHTML = `<button class="bs-add" data-bs-open><i class="ti ti-table"></i>Bảng dựng theo kịch bản (${D.sheet.rows.length} đoạn)</button>`;
    el.querySelector('[data-bs-open]').onclick = () => open();
  }
  function open() { if (S.workflow?.focus) S.workflow.focus('buildsheet'); else if (typeof openPanel === 'function') openPanel('buildsheet'); }
  S.addPanel('buildsheet', 'ti-table', 'Bảng dựng', () => { find = null; paint(); load(); }, { step: 'build' });
  S.onReady?.(() => { D = null; dirOf = null; dropped = []; mark = -1; load(); });
  S.buildSheet = { open, refresh: load };
})();
