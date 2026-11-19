// Kịch bản có sẵn (S17 M123): ô "Kịch bản" (không bắt buộc) ở bước Nguồn và ở thẻ Chuẩn bị của Tự lái.
// Server: studio/routes/19_script.mjs · scripts/script_doc.mjs. Dán chữ hoặc mở .txt / .docx; dấu [HOOK] [CHỮ: …] [B-ROLL: …] [CTA].
//   Studio.scriptCard.mount(el)   bước Nguồn: lưu vào dự án đang mở (.studio/script.json), phụ đề theo đúng chữ kịch bản
//   Studio.scriptStage.mount(el)  panel Tự lái: giữ chữ cho video kế tiếp; .take() → id kịch bản chờ ('' khi để trống)
// S27 M193: dấu dựng [MOOD] [NHẠC] [A-ROLL] [SFX] (+ "| nguồn" của B-ROLL, "| kiểu" của CHỮ); nút "Gợi ý dấu" (chỉ khi có Claude):
// Claude chèn dấu vào chính chữ đó, hiện so sánh (dấu thêm tô màu), người dùng Nhận hết / Bỏ rồi mới Lưu. Bảng dựng: .studio/build_sheet.json.
// S27 M197: mở .xlsx / .csv (kịch bản theo đoạn giây): server tự nhận cột, cột lạ thì hiện bảng chọn vai trò cột; hàng thành đoạn
// có [MỐC: …] [GHI CHÚ: …]. Kịch bản đã lưu có chỉ dẫn: nút "Chỉ dẫn → bảng dựng" (luật + Claude) → chọn ô Nhận / Bỏ.
(() => {
  const { $, esc } = Studio;
  const css = document.createElement('style');
  css.textContent = `
  .sc-box { margin-top: var(--space-2); }
  .sc-box textarea { width: 100%; min-height: 96px; box-sizing: border-box; font-size: var(--text-xs); }
  .sc-row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-top: var(--space-2); }
  .sc-row .sc-gap { flex: 1 1 auto; }
  .sc-st { list-style: none; margin: var(--space-2) 0 0; padding: 0; font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); }
  .sc-st li { display: flex; gap: var(--space-1); align-items: baseline; margin: var(--space-1) 0; overflow-wrap: anywhere; }
  .sc-st .is-warn { color: rgb(var(--color-warning)); }
  .sc-hint { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); margin: var(--space-1) 0 0; }
  .sc-hint details { margin-top: var(--space-1); }
  .sc-diff { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 260px; overflow: auto; font-size: var(--text-xs); padding: var(--space-2);
    border: 1px solid rgb(var(--color-border)); border-radius: var(--radius-sm, 6px); }
  .sc-diff mark { background: rgb(var(--color-accent) / .22); color: inherit; border-radius: 3px; padding: 0 2px; }
  .sc-map { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 9rem); gap: var(--space-1) var(--space-2); align-items: center; margin-top: var(--space-2); font-size: var(--text-xs); }
  .sc-map .sc-col { min-width: 0; overflow-wrap: anywhere; }
  .sc-map .sc-col small { display: block; color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sc-map .is-new { color: rgb(var(--color-warning)); }
  .sc-map select { width: 100%; min-width: 0; }
  .sc-cells { list-style: none; margin: var(--space-2) 0 0; padding: 0; max-height: 300px; overflow: auto; font-size: var(--text-xs); }
  .sc-cells li { margin: 0 0 var(--space-1); }
  .sc-cells label { display: flex; gap: var(--space-2); align-items: baseline; min-width: 0; }
  .sc-cells label > span { min-width: 0; overflow-wrap: anywhere; }
  .sc-cells small { display: block; color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); }`;
  document.head.appendChild(css);
  const HINT = 'Không bắt buộc. Dấu tuỳ chọn: <code>[HOOK]</code> mở đầu · <code>[CHỮ: …]</code> chữ trên màn hình · <code>[B-ROLL: …]</code> hình minh hoạ · <code>[CTA]</code> kêu gọi. Không dấu: dòng trống tách đoạn. Mẫu quyết định giao diện, kịch bản quyết định chữ.'
    + '<details><summary>Dấu dựng</summary><code>[MOOD: hồi hộp]</code> nhạc từ đoạn này trở đi · <code>[NHẠC: tắt|bật|đổi|to|nhỏ|kho tên bài]</code> · <code>[A-ROLL: cận mặt|trung|rộng|clip 2|bỏ]</code> · '
    + '<code>[B-ROLL: căn hộ | kho|stock|ảnh AI|động]</code> · <code>[SFX: whoosh | đầu|cuối|@từ]</code> · <code>[CHỮ: 90% | số|danh sách|trích dẫn|tiêu đề|giá]</code></details>';
  // Claude Code có trên máy không: dùng kết quả Kiểm tra máy đã có, chưa có thì hỏi một lần (như 05_assist.js)
  let claudeP = null;
  const claudeOk = () => {
    const pick = R => (R?.items || []).find(i => i.id === 'claude'), now = pick(Studio.setupCheck?.());
    if (now) return Promise.resolve(now.status === 'ok');
    return (claudeP ||= Studio.api('/api/setup/check').then(r => pick(r)?.status === 'ok', () => false));
  };
  // dấu Claude thêm: mọi cụm [..] của bản mới vượt số lần có trong bản gốc thì tô màu
  function diffHtml(orig, out) {
    const have = new Map(); for (const m of String(orig).match(/\[[^\]\n]*\]/g) || []) have.set(m, (have.get(m) || 0) + 1);
    let html = '', last = 0;
    for (const m of String(out).matchAll(/\[[^\]\n]*\]/g)) {
      const n = have.get(m[0]) || 0; html += esc(out.slice(last, m.index));
      if (n) { have.set(m[0], n - 1); html += esc(m[0]); } else html += `<mark>${esc(m[0])}</mark>`;
      last = m.index + m[0].length;
    }
    return html + esc(out.slice(last));
  }

  // vai trò cột của kịch bản bảng (khớp ROLE_VI của scripts/script_table.mjs)
  const ROLE_VI = { time: 'Thời gian', start: 'Giây bắt đầu', end: 'Giây kết thúc', say: 'Lời / thoại', screen: 'Chữ trên màn hình',
    visual: 'Hình / source', transition: 'Chuyển cảnh', mood: 'Nhạc / mood', sfx: 'Âm thanh / SFX', note: 'Ghi chú / chỉ dẫn', skip: 'Bỏ qua' };
  const isTable = f => /\.(xlsx|csv|tsv)$/i.test(f.name);
  async function tableOf(f) {
    const r = await fetch('/api/script/table', { method: 'POST', body: f, headers: { 'x-file-name': encodeURIComponent(f.name) } }).then(x => x.json()).catch(e => ({ error: e.message }));
    if (r.error) throw new Error(r.error); return r;
  }
  const tableToast = t => Studio.toast(`Đã đọc ${t.segs} đoạn${t.timed ? `, ${t.timed} đoạn có mốc giây` : ''}${t.warn?.length ? ` · ${t.warn[0]}` : ''}: xem lại rồi bấm Lưu`);
  async function fileText(f) {
    if (isTable(f)) { const t = await tableOf(f); if (t.unknown?.length) Studio.toast(`Bỏ qua cột chưa nhận ra: ${t.unknown.slice(0, 3).join(', ')}`); return t.text; }
    if (/\.docx$/i.test(f.name)) {
      const r = await fetch('/api/script/docx', { method: 'POST', body: f }).then(x => x.json()).catch(e => ({ error: e.message }));
      if (r.error) throw new Error(r.error); return r.text;
    }
    if (/\.(txt|md)$/i.test(f.name) || f.type === 'text/plain') return (await f.text()).replace(/^﻿/, '');
    throw new Error('Chỉ nhận file .txt, .docx, .xlsx hoặc .csv');
  }
  // khung chung: ô chữ + Mở file; `extra` là nút riêng của từng nơi
  function frame(el, { text, extra = '', status = '' }) {
    el.innerHTML = `<div class="sc-box"><textarea data-sc="text" placeholder="Dán kịch bản vào đây…" aria-label="Kịch bản">${esc(text || '')}</textarea>
      <div class="sc-row"><button data-sc="file" title="Kịch bản chữ (.txt, .docx) hoặc bảng theo đoạn giây (.xlsx, .csv)"><i class="ti ti-file-text"></i>Mở .txt / .docx / .xlsx</button><span class="sc-gap"></span>${extra}</div>
      <input type="file" data-sc="pick" accept=".txt,.docx,.xlsx,.csv,text/plain,text/csv" hidden>${status}<div class="sc-hint">${HINT}</div></div>`;
    const pick = el.querySelector('[data-sc="pick"]'), ta = el.querySelector('[data-sc="text"]');
    el.querySelector('[data-sc="file"]').onclick = () => pick.click();
    return { ta, pick };
  }

  // ---------- bước Nguồn: kịch bản của dự án đang mở ----------
  let P = { dir: null, data: null, busy: false, draft: null, name: '', sugg: null, ai: false, sheet: null, table: null, dirs: null };
  const fmtPct = v => Math.round(v * 100) + '%';
  function statusOf(d) {
    const sc = d?.script; if (!sc) return '';
    const segs = sc.segments || [], miss = segs.filter(s => s.spoken === false), A = sc.align;
    const li = (warn, ic, t) => `<li class="${warn ? 'is-warn' : ''}"><i class="ti ${ic}"></i><span>${t}</span></li>`;
    const marks = segs.reduce((n, s) => n + (s.screen?.length || 0) + (s.broll?.length || 0) + (s.kind !== 'body' ? 1 : 0), 0);
    return `<ul class="sc-st">${li(false, 'ti-circle-check', `Đã lưu ${segs.length} đoạn${marks ? `, ${marks} dấu` : ''}${sc.name ? ` · ${esc(sc.name)}` : ''}`)}
      ${!A ? li(true, 'ti-clock', d.mute ? 'Chưa chia phụ đề' : 'Chưa có lời thoại: phụ đề theo kịch bản khi tạo lời thoại') : A.mode === 'even'
        ? li(false, 'ti-circle-check', 'Video không lời: phụ đề chia đều theo đoạn')
        : li(false, 'ti-circle-check', `Phụ đề theo chữ kịch bản · ${A.matched}/${A.words} chữ khớp lời nói (${fmtPct(A.matched / Math.max(1, A.words))})`)}
      ${miss.map(s => li(true, 'ti-alert-triangle', `Chưa nói: “${esc(s.say.slice(0, 60))}${s.say.length > 60 ? '…' : ''}”`)).join('')}
      ${(A?.offscript || []).slice(0, 3).map(o => li(true, 'ti-alert-triangle', `Nói ngoài kịch bản ${o.t0.toFixed(1)}s: “${esc(o.text.slice(0, 50))}…”`)).join('')}
      ${(sc.gate?.issues || []).filter(i => i.severity !== 'low').slice(0, 4).map(i => li(true, 'ti-shield-x', `Claim quảng cáo · ${esc(i.where)}: ${esc(i.msg.slice(0, 120))}`)).join('')}
      ${segs.some(s => s.at) ? li(false, 'ti-clock-hour-4', `Mốc giây từ bảng: ${segs.filter(s => s.at).length} đoạn${A?.mode === 'whisper' ? ' (giờ theo lời nói)' : ''}`) : ''}
      ${(A?.drift || []).slice(0, 3).map(x => li(true, 'ti-clock-exclamation', `Đoạn ${x.seg + 1} lệch mốc bảng ${x.d > 0 ? '+' : ''}${x.d}s (bảng ${x.sheet}s, nói ${x.heard}s)`)).join('')}
      ${A?.drift?.length > 3 ? li(true, 'ti-clock-exclamation', `… và ${A.drift.length - 3} đoạn lệch nữa`) : ''}
      ${segs.some(s => s.note?.length) ? li(false, 'ti-notes', `${segs.reduce((n, s) => n + (s.note?.length || 0), 0)} chỉ dẫn dựng: bấm “Chỉ dẫn → bảng dựng”`) : ''}
      ${segs.some(s => s.raw?.length) ? li(true, 'ti-alert-triangle', `Dấu chưa hiểu: ${esc(segs.flatMap(s => s.raw || []).slice(0, 3).join(' '))}`) : ''}
      ${P.sheet ? li(!!P.sheet.error, 'ti-table', P.sheet.error ? `Bảng dựng lỗi: ${esc(P.sheet.error)}` : `Bảng dựng: ${P.sheet.rows} đoạn${P.sheet.miss ? ` · ${P.sheet.miss} ô chưa có nguồn` : ''} <button class="ai-lnk" data-sc="sheet">Mở bảng dựng</button>`) : ''}</ul>`;
  }
  // luôn vẽ vào phần tử đang gắn (P.el): Studio.reload() vẽ lại panel Nguồn giữa lúc lưu, phần tử cũ bị gỡ
  function renderCard() {
    const el = P.el; if (!el?.isConnected) return;
    const sc = P.data?.script, text = P.draft ?? sc?.text ?? '';
    if (P.sugg) { // so sánh gợi ý dấu của Claude: Nhận hết vào ô chữ (chưa lưu) hoặc Bỏ
      el.innerHTML = `<div class="sc-box"><p class="sc-hint"><i class="ti ti-sparkles"></i> Claude thêm ${P.sugg.added} dấu (tô màu), lời giữ nguyên. Nhận rồi sửa tay nếu cần, bấm Lưu để dùng.</p>
        <div class="sc-diff" data-sc="diff" aria-label="Kịch bản kèm dấu gợi ý">${diffHtml(P.sugg.orig, P.sugg.text)}</div>
        <div class="sc-row"><span class="sc-gap"></span><button data-sc="sg-drop"><i class="ti ti-x"></i>Bỏ</button>
        <button class="primary" data-sc="sg-take"><i class="ti ti-check"></i>Nhận hết</button></div></div>`;
      el.querySelector('[data-sc="sg-drop"]').onclick = () => { P.sugg = null; renderCard(); };
      el.querySelector('[data-sc="sg-take"]').onclick = () => { P.draft = P.sugg.text; P.sugg = null; renderCard(); Studio.toast('Đã nhận dấu gợi ý: bấm Lưu lại để dùng'); };
      return;
    }
    if (P.table) return renderTable(el);
    if (P.dirs) return renderDirs(el);
    const { ta, pick } = frame(el, { text, status: P.data ? statusOf(P.data) : '',
      extra: `${sc?.segments?.some(s => s.note?.length) ? `<button data-sc="dirs" title="Chuyển ghi chú / chỉ dẫn của kịch bản thành ô bảng dựng (luật${P.ai ? ' + Claude' : ''}); bạn chọn ô nào nhận" ${P.busy ? 'disabled' : ''}><i class="ti ${P.busy === 'dirs' ? 'ti-loader-2 spin' : 'ti-arrows-transfer-down'}"></i>Chỉ dẫn → bảng dựng</button>` : ''}
        ${P.ai ? `<button data-sc="suggest" title="Claude chèn dấu MOOD, B-ROLL, SFX, CHỮ… vào chính chữ này, không sửa lời" ${P.busy ? 'disabled' : ''}><i class="ti ${P.busy === 'suggest' ? 'ti-loader-2 spin' : 'ti-sparkles'}"></i>Gợi ý dấu</button>` : ''}
        ${sc ? '<button data-sc="clear" title="Bỏ kịch bản, lấy lại phụ đề nhận dạng tự động"><i class="ti ti-trash"></i>Bỏ</button>' : ''}
        <button class="primary" data-sc="save" ${P.busy ? 'disabled' : ''}><i class="ti ${P.busy === true ? 'ti-loader-2 spin' : 'ti-device-floppy'}"></i>${sc ? 'Lưu lại' : 'Dùng kịch bản'}</button>` });
    ta.oninput = () => { P.draft = ta.value; };
    pick.onchange = async () => {
      const f = pick.files[0]; if (!f) return;
      try {
        if (isTable(f)) { // bảng: cột lạ thì hỏi vai trò trước khi đổ chữ vào ô
          const t = await tableOf(f); P.name = f.name;
          if (t.unknown?.length || !Object.values(t.roles).includes('say')) { P.table = t; renderCard(); return; }
          P.draft = t.text; renderCard(); tableToast(t); return;
        }
        P.draft = await fileText(f); P.name = f.name; renderCard();
      } catch (e) { Studio.toast(e.message); }
    };
    const dv = el.querySelector('[data-sc="dirs"]');
    if (dv) dv.onclick = async () => {
      P.busy = 'dirs'; renderCard();
      try {
        const r = await Studio.api('/api/script/directives', { claude: P.ai });
        if (r.error) throw new Error(r.error);
        if (r.claude?.error) Studio.toast(`Claude chưa chuyển được phần chỉ dẫn còn lại: ${r.claude.error}`);
        if (!r.cells.length) Studio.toast(r.rest ? 'Chưa chuyển được chỉ dẫn nào thành ô bảng dựng' : 'Kịch bản không có chỉ dẫn dựng');
        else P.dirs = { cells: r.cells, keep: r.cells.map(() => true), rest: r.rest, claude: r.claude };
      } catch (e) { Studio.toast(e.message); }
      P.busy = false; renderCard();
    };
    el.querySelector('[data-sc="save"]').onclick = async () => {
      const t = (P.draft ?? ta.value).trim(); if (!t) return Studio.toast('Kịch bản đang trống');
      P.busy = true; renderCard();
      try {
        if (Studio.saveNow && !await Studio.saveNow()) throw new Error('Chưa lưu được dự án — chọn bản giữ lại rồi thử lại'); // phụ đề đang sửa trong trình duyệt vào đĩa trước khi server thay
        const r = await Studio.api('/api/script', { text: t, name: P.name || sc?.name || '' });
        if (r.error) throw new Error(r.error);
        P.draft = null; P.data = { ...(P.data || {}), script: r.script }; loadSheet();
        if (!r.pending) await Studio.reload?.();
        Studio.toast(r.pending ? 'Đã lưu kịch bản: phụ đề theo kịch bản khi tạo lời thoại' : `Đã lưu kịch bản: ${r.captions} dòng phụ đề theo đúng chữ kịch bản`);
      } catch (e) { Studio.toast(e.message); }
      P.busy = false; renderCard();
    };
    const sg = el.querySelector('[data-sc="suggest"]');
    if (sg) sg.onclick = async () => {
      const t = (P.draft ?? ta.value).trim(); if (!t) return Studio.toast('Kịch bản đang trống');
      P.busy = 'suggest'; renderCard();
      try {
        const r = await Studio.api('/api/script/suggest', { text: t });
        if (r.error) throw new Error(r.error);
        if (!r.added) Studio.toast('Claude không thêm dấu nào'); else P.sugg = { orig: t, text: r.text, added: r.added };
      } catch (e) { Studio.toast(e.message); }
      P.busy = false; renderCard();
    };
    const sh = el.querySelector('[data-sc="sheet"]'); // S27 M194: panel Bảng dựng (23_buildsheet.js)
    if (sh) sh.onclick = () => (Studio.buildSheet ? Studio.buildSheet.open() : Studio.workflow?.focus?.('buildsheet'));
    const clr = el.querySelector('[data-sc="clear"]');
    if (clr) clr.onclick = async () => {
      if (!confirm('Bỏ kịch bản của dự án này? Phụ đề quay về bản nhận dạng tự động (nếu còn bản sao lưu).')) return;
      if (Studio.saveNow && !await Studio.saveNow()) return;
      const r = await Studio.api('/api/script/clear', {});
      if (r.error) return Studio.toast(r.error);
      P.data = { ...(P.data || {}), script: null }; P.draft = ''; P.sheet = null; if (r.restored) await Studio.reload?.();
      Studio.toast(r.restored ? 'Đã bỏ kịch bản, phụ đề quay về bản nhận dạng' : 'Đã bỏ kịch bản'); renderCard();
    };
  }
  // bảng chọn vai trò cột (kịch bản .xlsx / .csv có cột chưa nhận ra)
  function renderTable(el) {
    const t = P.table, sample = c => String(t.rows.find(r => String(r[c] ?? '').trim())?.[c] || '').slice(0, 60);
    const opts = c => '<option value="">— chưa gán —</option>' + Object.entries(ROLE_VI).map(([k, v]) => `<option value="${k}" ${t.roles[c] === k ? 'selected' : ''}>${esc(v)}</option>`).join('');
    el.innerHTML = `<div class="sc-box"><p class="sc-hint"><i class="ti ti-table"></i> ${esc(P.name)}: ${t.rows.length} hàng. Gán vai trò cho cột${t.unknown.length ? ' chưa nhận ra (tô vàng)' : ''}; cột “Bỏ qua” / chưa gán không dùng.</p>
      <div class="sc-map" role="group" aria-label="Vai trò cột của bảng">${t.columns.map((c, i) => `<div class="sc-col ${t.unknown.includes(c) ? 'is-new' : ''}">${esc(c)}<small>${esc(sample(c)) || '(trống)'}</small></div>
        <select data-col="${i}" aria-label="Vai trò cột ${esc(c)}">${opts(c)}</select>`).join('')}</div>
      <div class="sc-row"><span class="sc-gap"></span><button data-sc="tb-drop"><i class="ti ti-x"></i>Bỏ</button>
      <button class="primary" data-sc="tb-use" ${P.busy ? 'disabled' : ''}><i class="ti ti-check"></i>Dùng bảng</button></div></div>`;
    el.querySelectorAll('select[data-col]').forEach(s => { s.onchange = () => { t.roles[t.columns[+s.dataset.col]] = s.value || null; }; });
    el.querySelector('[data-sc="tb-drop"]').onclick = () => { P.table = null; renderCard(); };
    el.querySelector('[data-sc="tb-use"]').onclick = async () => {
      if (!Object.values(t.roles).includes('say')) return Studio.toast('Gán một cột là “Lời / thoại”');
      P.busy = true; renderCard();
      try {
        const r = await Studio.api('/api/script/table/text', { columns: t.columns, rows: t.rows, roles: t.roles });
        if (r.error) throw new Error(r.error);
        P.table = null; P.draft = r.text; tableToast(r);
      } catch (e) { Studio.toast(e.message); }
      P.busy = false; renderCard();
    };
  }
  // ô bảng dựng đề xuất từ chỉ dẫn: tick ô muốn nhận
  function renderDirs(el) {
    const d = P.dirs, segs = P.data?.script?.segments || [], n = d.keep.filter(Boolean).length;
    const head = d.claude?.cells != null ? ` (Claude thêm ${d.claude.cells})` : d.rest ? ` · ${d.rest} đoạn có chỉ dẫn luật chưa hiểu${P.ai ? '' : ' (cần Claude)'}` : '';
    el.innerHTML = `<div class="sc-box"><p class="sc-hint"><i class="ti ti-arrows-transfer-down"></i> ${d.cells.length} ô bảng dựng từ chỉ dẫn${head}. Lời giữ nguyên.</p>
      <ul class="sc-cells">${d.cells.map((c, i) => `<li><label><input type="checkbox" data-i="${i}" ${d.keep[i] ? 'checked' : ''}><span>Đoạn ${c.seg + 1}: ${esc(c.label)} <small>${c.by === 'claude' ? 'Claude' : 'luật'}${c.note ? ` · “${esc(c.note.slice(0, 80))}”` : ''} · ${esc(String(segs[c.seg]?.say || '').slice(0, 50))}</small></span></label></li>`).join('')}</ul>
      <div class="sc-row"><span class="sc-gap"></span><button data-sc="dv-drop"><i class="ti ti-x"></i>Bỏ</button>
      <button class="primary" data-sc="dv-take" ${n && !P.busy ? '' : 'disabled'}><i class="ti ti-check"></i>Nhận ${n} ô</button></div></div>`;
    el.querySelectorAll('input[data-i]').forEach(x => { x.onchange = () => { d.keep[+x.dataset.i] = x.checked; renderDirs(el); }; });
    el.querySelector('[data-sc="dv-drop"]').onclick = () => { P.dirs = null; renderCard(); };
    el.querySelector('[data-sc="dv-take"]').onclick = async () => {
      P.busy = true; renderDirs(el);
      try {
        const r = await Studio.api('/api/script/directives/accept', { cells: d.cells.filter((_, i) => d.keep[i]) });
        if (r.error) throw new Error(r.error);
        P.dirs = null; Studio.toast(`Đã thêm ${r.added} ô vào bảng dựng`); loadSheet();
      } catch (e) { Studio.toast(e.message); }
      P.busy = false; renderCard();
    };
  }
  // tóm tắt bảng dựng cho dòng trạng thái (sửa từng ô ở panel Bảng dựng, studio/features/23_buildsheet.js, M194)
  function loadSheet() {
    const dir = P.dir;
    Studio.api('/api/script/sheet').then(r => {
      if (P.dir !== dir || r.error) return;
      const rows = r.sheet?.rows || [];
      P.sheet = r.sheet ? { rows: rows.length, miss: rows.reduce((n, x) => n + (x.broll || []).filter(b => b.miss).length + (x.sfx || []).filter(b => b.miss).length, 0) } : null;
      renderCard();
    }).catch(() => {});
  }
  Studio.scriptCard = {
    mount(el) {
      const dir = Studio.META?.dir || '';
      if (P.dir !== dir) { P = { dir, data: null, busy: false, draft: null, name: '', sugg: null, ai: false, sheet: null, table: null, dirs: null }; }
      P.el = el; renderCard();
      if (!P.data) Studio.api('/api/script').then(r => { if (P.dir === dir && !r.error) { P.data = r; renderCard(); if (r.script) loadSheet(); } }).catch(() => {});
      claudeOk().then(ok => { if (P.dir === dir && ok !== P.ai) { P.ai = ok; renderCard(); } });
    },
  };

  // ---------- panel Tự lái: kịch bản cho video kế tiếp ----------
  const Q = { text: '', name: '' };
  Studio.scriptStage = {
    mount(el) {
      if (!el) return;
      const { ta, pick } = frame(el, { text: Q.text, extra: Q.text.trim() ? '<button data-sc="drop"><i class="ti ti-x"></i>Xoá</button>' : '',
        status: Q.text.trim() ? '<p class="sc-hint"><i class="ti ti-info-circle"></i> Dùng cho video kế tiếp thêm vào hàng đợi, rồi tự xoá.</p>' : '' });
      ta.oninput = () => { const had = !!Q.text.trim(); Q.text = ta.value; if (had !== !!Q.text.trim()) { const pos = ta.selectionStart; this.mount(el); const t2 = el.querySelector('textarea'); t2.focus(); t2.setSelectionRange(pos, pos); } };
      pick.onchange = async () => { const f = pick.files[0]; if (!f) return; try { Q.text = await fileText(f); Q.name = f.name; this.mount(el); } catch (e) { Studio.toast(e.message); } };
      const d = el.querySelector('[data-sc="drop"]'); if (d) d.onclick = () => { Q.text = ''; Q.name = ''; this.mount(el); };
      this.el = el;
    },
    /** Lưu kịch bản chờ → id cho job ('' khi ô trống). Lỗi thì ném ra để không chạy nhầm không kịch bản. */
    async take() {
      if (!Q.text.trim()) return '';
      const r = await Studio.api('/api/script/stage', { text: Q.text, name: Q.name });
      if (r.error) throw new Error('Kịch bản: ' + r.error);
      return r.id;
    },
    clear() { Q.text = ''; Q.name = ''; if (this.el?.isConnected) this.mount(this.el); },
  };
})();
