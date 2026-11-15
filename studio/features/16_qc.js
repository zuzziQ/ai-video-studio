// AI QC ("Kiểm tra chất lượng") + A/B variants ("Nhiều phiên bản") — references/qc-variants.md.
// Adds two cards to the AI panel (injected when the panel renders, no edit of 20_ai.js), a checkbox
// "AI kiểm tra & sửa trước khi xuất" in the export dialog, and a QC card in the "Xuất xong" dialog.
'use strict';
(() => {
  const S = Studio, $ = s => document.querySelector(s), esc = S.esc;
  const css = document.createElement('style');
  css.textContent = `
  .qc-score { display: flex; align-items: center; gap: 14px; margin: 6px 0 10px; }
  .qc-ring { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; font-size: 20px; font-weight: 800; flex: none;
    background: conic-gradient(var(--c) calc(var(--v) * 1%), var(--bg4) 0); position: relative; }
  .qc-ring::after { content: ''; position: absolute; inset: 6px; border-radius: 50%; background: var(--bg1); }
  .qc-ring b { position: relative; z-index: 1; }
  .qc-sum { color: var(--tx2); line-height: 1.5; font-size: 12.5px; }
  .qc-list { display: flex; flex-direction: column; gap: 4px; max-height: 46vh; overflow: auto; margin: 6px 0; }
  .qc-it { display: flex; gap: 8px; align-items: flex-start; padding: 7px 9px; border: 1px solid var(--line); border-radius: var(--rs); background: var(--bg1); cursor: pointer; }
  .qc-it:hover { border-color: var(--line3); }
  .qc-it.fixed { opacity: .62; }
  .qc-it input.qc-pick { flex: none; width: auto; margin: 2px 0 0; cursor: pointer; }
  .qc-it .sg { display: block; color: var(--acc); font-size: 11.5px; margin-top: 2px; }
  .qc-it .nw { color: var(--warn); font-size: 10px; border: 1px solid var(--warn); border-radius: 4px; padding: 0 4px; margin-left: 4px; }
  .qc-bulk { display: flex; gap: 10px; align-items: center; font-size: 12px; color: var(--tx2); margin: 4px 0 0; } .qc-bulk a { color: var(--acc); cursor: pointer; }
  .qc-it .tm { font-variant-numeric: tabular-nums; font-size: 11px; color: var(--tx3); width: 42px; flex: none; padding-top: 1px; }
  .qc-it .sv { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex: none; background: var(--tx3); }
  .qc-it .sv.high { background: var(--bad); } .qc-it .sv.med { background: var(--warn); } .qc-it .sv.low { background: var(--wave); }
  .qc-it .bd { flex: 1; min-width: 0; font-size: 12.5px; line-height: 1.45; }
  .qc-it .bd small { color: var(--tx3); font-size: 10.5px; margin-left: 4px; }
  .qc-it .ok { color: var(--ok); font-size: 11px; flex: none; }
  .qc-it .src { font-size: 9.5px; text-transform: uppercase; color: var(--tx3); border: 1px solid var(--line2); border-radius: 4px; padding: 0 4px; margin-right: 4px; }
  .qc-imgs { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; } .qc-imgs a { color: var(--acc); font-size: 12px; }
  .qc-cmp { width: 100%; border-radius: 6px; border: 1px solid var(--line2); margin-top: 6px; }
  label.qcx { display: flex; gap: 8px; align-items: center; margin-top: 12px; padding: 8px 10px; border: 1px solid var(--line2); border-radius: var(--rs); cursor: pointer; background: var(--bg1); }
  label.qcx:has(input:checked) { border-color: var(--acc-line); background: var(--acc-soft); }
  label.qcx small { color: var(--tx3); }
  .va-grid { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 10px; margin: 8px 0; }
  .va-col { background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r); padding: 8px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .va-col.cur { border-color: var(--acc-line); }
  .va-col video, .va-col img { width: 100%; aspect-ratio: 9/16; object-fit: cover; border-radius: 6px; background: #000; }
  body.landscape .va-col video, body.landscape .va-col img { aspect-ratio: 16/9; }
  .va-col b { font-size: 12.5px; } .va-col p { margin: 0; color: var(--tx2); font-size: 11.5px; line-height: 1.45; }
  .va-col .hk { color: var(--warn); font-weight: 700; font-size: 12px; }
  #modalbox:has(.va-grid) { width: min(1100px, 94vw); max-width: 94vw; }
  #modalbox:has(.qc-list) { width: min(640px, 94vw); }`;
  document.head.appendChild(css);

  const col = v => (v >= 80 ? 'var(--ok)' : v >= 55 ? 'var(--warn)' : 'var(--bad)');
  const ring = v => `<div class="qc-ring" style="--v:${v};--c:${col(v)}"><b>${v}</b></div>`;
  const KV = { hook: 'Hook', readability: 'Dễ đọc', spelling: 'Chính tả', variety: 'Đa dạng', pacing: 'Nhịp', brand: 'Thương hiệu' };
  let last = null, va = null, exportQc = null, passQc = false, saved = null;

  async function load() { const r = await S.api('/api/qc').catch(() => null); last = r && !r.none ? r : null; return last; }
  async function loadVa() { const r = await S.api('/api/variants').catch(() => null); va = r && !r.none ? r : null; return va; }
  const dirty = () => $('#status')?.classList.contains('dirty');

  // ---------- run QC as a job ----------
  async function runQc({ fix = false, claude = true, after, only } = {}) {
    if (dirty()) await S.saveNow();
    const r = await S.api('/api/qc/run', { fix, claude, ...(only ? { only } : {}) });
    if (!r.ok) return S.toast(r.error || 'Đang có tác vụ khác chạy');
    S.modal(`<h3><i class="ti ti-shield-check"></i> ${only ? `Đang áp dụng ${only.length} gợi ý sửa…` : fix ? 'Đang kiểm tra & tự sửa…' : 'Đang kiểm tra chất lượng…'}</h3>
      <div id="jobstep" class="muted">Bắt đầu</div><div class="bar"><i></i></div><pre id="joblog"></pre>
      <p class="muted">Render ảnh bằng engine, đo chữ/mặt/phụ đề, trộn thử âm thanh${claude ? ', rồi Claude xem các khung hình (30–120 giây)' : ''}.</p>`);
    S.pollJob(async j => {
      if (j.state !== 'done') return S.modal(`<h3>Lỗi kiểm tra</h3><p>${esc(j.error || j.step)}</p><pre>${esc((j.log || '').slice(-1200))}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
      await load();
      if (fix) await S.reload();
      if (after) return after(last);
      showResult();
      rerender();
    });
  }

  // ---------- result dialog ----------
  // What a fix will do, shown as a suggestion the user accepts (machine fixes by issue kind, Claude fixes by patch op).
  const AUTO_FIX = { text_offcanvas: 'Dời / thu nhỏ chữ vào trong khung', face_cover: 'Dời graphic khỏi khuôn mặt', caption_overlap: 'Dời graphic tránh phụ đề (hoặc ẩn phụ đề lúc đó)',
    overlap: 'Rút ngắn cảnh trước để hết chồng lớp', empty: 'Thêm chữ từ khoá vào đoạn trống', caption_long: 'Tách phụ đề thành dòng ≤ 4 từ', missing_media: 'Ẩn cảnh / bỏ SFX bị thiếu file',
    hook_missing: 'Thêm chữ hook lớn ở đầu video', music_masking: 'Hạ nhạc nền để nghe rõ giọng', music_quiet: 'Tăng nhạc nền cho nghe được' };
  // Claude patch ops (scripts/ai_qc.mjs validatePatch)
  const CL_FIX = {
    text: f => `Sửa chữ “${f.from}” → “${f.to}”`, move: f => `Dời ${f.target} (${f.dx || 0}, ${f.dy || 0} px)`, resize: f => `Đổi cỡ ${f.target} × ${f.scale}`,
    retime: f => `Cho ${f.target} hiện ${f.t0}–${f.t1}s`, shorten: f => `Rút ${f.target} kết thúc ở ${f.t1}s`, delete: f => `Ẩn cảnh ${f.target}`,
    caption_style: f => `Đổi kiểu phụ đề sang “${f.value}”`, gain: f => `${f.db > 0 ? 'Tăng' : 'Giảm'} nhạc ${Math.abs(f.db)} dB`, hook: f => `Đổi hook thành “${f.text}”`,
  };
  const suggestion = i => {
    if (i.fixed || i.new) return '';
    if (i.src === 'auto') return AUTO_FIX[i.kind] || '';
    if (!i.fix?.op) return '';
    return String(CL_FIX[i.fix.op]?.(i.fix) || 'Sửa theo gợi ý của Claude').slice(0, 160);
  };
  function showResult() {
    const q = last; if (!q) return;
    const fixedN = q.issues.filter(i => i.fixed).length, newN = q.issues.filter(i => i.new).length;
    // suggestions only on a plain check: after a fix the timeline changed, so ids would not match → "Kiểm tra lại" first
    const sug = q.fix ? [] : q.issues.filter(i => i.key && suggestion(i));
    const initial = q.counts?.initial ?? q.issues.length - newN;
    const sc = q.claude?.scores && Object.keys(q.claude.scores).length ? `<div class="ai-kv">${Object.entries(q.claude.scores).map(([k, v]) => `<span>${KV[k] || k} ${v}/10</span>`).join('')}</div>` : '';
    const sum = !q.issues.length ? 'Không thấy vấn đề nào'
      : q.fix ? `Ban đầu ${initial} vấn đề${fixedN ? ` · đã sửa <b style="color:var(--ok)">${fixedN}</b>` : ''}${q.selected ? ` <span class="muted">(bạn chọn ${q.selected} gợi ý)</span>` : ''}${newN ? ` · <b style="color:var(--warn)">${newN} phát sinh sau khi sửa</b>` : ''}${q.counts?.high ? ` · <b style="color:var(--bad)">${q.counts.high} nặng</b> còn lại` : ''}`
      : `${q.issues.length} vấn đề${sug.length ? ` · <b>${sug.length} gợi ý sửa</b>, tick mục muốn áp dụng` : ''}${q.counts?.high ? ` · <b style="color:var(--bad)">${q.counts.high} nặng</b>` : ''}`;
    S.modal(`<h3><i class="ti ti-shield-check"></i> Kiểm tra chất lượng</h3>
      <div class="qc-score">${q.after != null ? `${ring(q.before)}<i class="ti ti-arrow-right" style="color:var(--tx3)"></i>${ring(q.after)}` : ring(q.score)}
        <div class="qc-sum">${sum}
        ${q.fix && newN ? '<br><small class="muted">“Phát sinh” là vấn đề do chính lần sửa tạo ra (vd chữ dời chỗ thì đè lên thứ khác). Bấm Kiểm tra lại để có gợi ý sửa tiếp, hoặc Hoàn tác.</small>' : ''}
        ${q.audio?.lufs != null ? `<br>Âm thanh: ${q.audio.lufs} LUFS · đỉnh ${q.audio.true_peak} dBTP${q.audio.masked_pct != null ? ` · nhạc át giọng ${q.audio.masked_pct}%` : ''}` : ''}
        ${adsSummary(q)}
        ${q.undone ? '<br><i>Đã hoàn tác lần sửa trước.</i>' : ''}</div></div>
      ${q.claude?.summary ? `<div class="help"><b>Claude:</b> ${esc(q.claude.summary)}</div>${sc}` : q.claude?.error ? `<div class="help" style="color:var(--warn)">Không có nhận xét của Claude: ${esc(q.claude.error)}</div>` : ''}
      ${sug.length ? '<div class="qc-bulk"><a data-qcsel="all">Chọn tất cả</a><a data-qcsel="high">Chỉ lỗi nặng + vừa</a><a data-qcsel="none">Bỏ chọn</a></div>' : ''}
      <div class="qc-list">${q.issues.map(i => { const g = !q.fix && i.key && suggestion(i); return `<div class="qc-it ${i.fixed ? 'fixed' : ''}" data-qct="${i.t}" title="Bấm để tua tới ${S.fmt(i.t)}">
        ${g ? `<input type="checkbox" class="qc-pick" data-key="${esc(i.key)}" data-sv="${i.severity}" ${i.severity !== 'low' ? 'checked' : ''} title="Áp dụng gợi ý này">` : ''}
        <span class="tm">${S.fmt(i.t).replace(/^0:/, '')}</span><span class="sv ${i.severity}"></span>
        <span class="bd"><span class="src">${i.src === 'claude' ? 'Claude' : 'máy'}</span><b>${esc(i.kind_vi)}</b> — ${esc(i.msg)}${i.new ? '<span class="nw">phát sinh sau khi sửa</span>' : ''}${i.note ? `<small>(${esc(i.note)})</small>` : ''}
        ${g ? `<span class="sg"><i class="ti ti-wand"></i> Gợi ý: ${esc(g)}</span>` : ''}</span>
        ${i.fixed ? '<span class="ok"><i class="ti ti-check"></i> đã sửa</span>' : ''}</div>`; }).join('')}</div>
      ${q.compare_sheet ? `<details><summary class="muted" style="cursor:pointer">Ảnh trước / sau khi sửa (${q.compare.length} cặp)</summary><img class="qc-cmp" src="/project/${q.compare_sheet}?${Date.now()}"></details>` : ''}
      <div class="qc-imgs">${q.sheet ? `<a href="/project/${q.sheet}" target="_blank"><i class="ti ti-layout-grid"></i> Ảnh tổng quan các khung</a>` : ''}</div>
      <div class="actions">${q.can_undo && q.fix && !q.undone ? '<button id="qcundo"><i class="ti ti-arrow-back-up"></i> Hoàn tác sửa</button>' : ''}
        <button id="qcagain"><i class="ti ti-refresh"></i> Kiểm tra lại</button>
        ${sug.length ? '<button class="primary" id="qcfix"><i class="ti ti-wand"></i> <span>Áp dụng gợi ý đã chọn</span></button>' : ''}<button onclick="closeModal()">Đóng</button></div>`);
    const list = $('#modalbox .qc-list'), picks = () => [...list.querySelectorAll('.qc-pick')];
    const count = () => { const n = picks().filter(x => x.checked).length, b = $('#qcfix'); if (b) { b.disabled = !n; b.querySelector('span').textContent = n ? `Áp dụng ${n} gợi ý đã chọn` : 'Chưa chọn gợi ý nào'; } };
    list.addEventListener('click', e => { if (e.target.closest('.qc-pick')) return count(); const it = e.target.closest('[data-qct]'); if (it) { S.setTime(+it.dataset.qct); S.closeModal(); } });
    document.querySelectorAll('#modalbox [data-qcsel]').forEach(a => (a.onclick = () => { for (const x of picks()) x.checked = a.dataset.qcsel === 'all' || (a.dataset.qcsel === 'high' && x.dataset.sv !== 'low'); count(); }));
    count();
    $('#qcfix') && ($('#qcfix').onclick = () => { const only = picks().filter(x => x.checked).map(x => x.dataset.key); if (only.length) runQc({ fix: true, only, claude: !!q.claude?.used }); });
    $('#qcagain').onclick = () => runQc({ fix: false });
    $('#qcundo') && ($('#qcundo').onclick = async () => {
      const r = await S.api('/api/qc/undo', {}); if (r.error) return S.toast(r.error);
      await S.reload(); await load(); S.toast('Đã hoàn tác các sửa đổi của QC'); showResult(); rerender();
    });
  }

  // ---------- ad gates (references/ad-gates.md): settings live in TL.ads, checked by scripts/ad_gates.py during QC ----------
  const AD_IND = { '': 'Tự nhận diện', general: 'Chung', cosmetics: 'Mỹ phẩm / chăm sóc da', supplements: 'Thực phẩm chức năng', food: 'Thực phẩm & đồ uống', finance: 'Tài chính', health_device: 'Thiết bị sức khoẻ' };
  const AD_PLAT = { meta: 'Facebook / Instagram', tiktok: 'TikTok' };
  async function adsDialog() {
    const a = S.TL.ads || {}, plats = a.platforms?.length ? a.platforms : Object.keys(AD_PLAT), cl = a.claims || [];
    // Product Brain (M18, studio/features/53_products.js): claim, cụm từ cấm, ngành lấy từ hồ sơ sản phẩm dùng chung
    const prods = await S.api('/api/products').then(r => (Array.isArray(r) ? r : [])).catch(() => []);
    const lost = a.product && !prods.some(p => p.id === a.product);
    const lines = st => cl.filter(c => (c.status || 'approved') === st).map(c => c.text).join('\n');
    S.modal(`<h3><i class="ti ti-speakerphone"></i> Kiểm tra quảng cáo</h3>
      <p class="muted">Khi bật, “Kiểm tra chất lượng” soát thêm lời thoại và chữ trên màn hình theo chính sách quảng cáo Meta / TikTok, đối chiếu claim, và chấm điểm nguyên bản so với các phiên bản A/B. Chỉ báo, không tự sửa; không thay kiểm duyệt của nền tảng.</p>
      <label class="qcx" style="margin-top:0"><input type="checkbox" id="adon" ${a.on ? 'checked' : ''}><span><b>Video này dùng để chạy quảng cáo</b></span></label>
      <div class="ai-row" style="margin-top:10px"><span style="flex:none;width:86px">Sản phẩm</span><select id="adprod"><option value="">— nhập claim tay cho dự án này —</option>
        ${prods.map(p => `<option value="${esc(p.id)}" ${a.product === p.id ? 'selected' : ''}>${esc(p.name)} · ${p.claims?.approved || 0} claim đã duyệt</option>`).join('')}
        ${lost ? `<option value="${esc(a.product)}" selected>⚠ ${esc(a.product)} (không còn hồ sơ)</option>` : ''}</select></div>
      <p class="muted" id="adprodhint" style="margin:2px 0 0 94px;font-size:11.5px"></p>
      <div class="ai-row"><span style="flex:none;width:86px">Ngành</span><select id="adind">${Object.entries(AD_IND).map(([k, v]) => `<option value="${k}" ${(a.industry || '') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="ai-row"><span style="flex:none;width:86px">Nền tảng</span>${Object.entries(AD_PLAT).map(([k, v]) => `<label style="cursor:pointer;margin-right:12px"><input type="checkbox" data-adp="${k}" ${plats.includes(k) ? 'checked' : ''}> ${v}</label>`).join('')}</div>
      <p style="margin:10px 0 4px"><b id="adoklbl">Claim đã có bằng chứng</b> <span class="muted">· mỗi dòng một câu; có ít nhất một dòng thì câu nêu lợi ích hay số liệu không khớp sẽ bị nhắc</span></p>
      <textarea id="adok" rows="4" style="width:100%">${esc(lines('approved'))}</textarea>
      <p style="margin:10px 0 4px"><b>Claim bị cấm</b> <span class="muted">· mỗi dòng một câu; lời thoại gần giống sẽ bị chặn</span></p>
      <textarea id="adno" rows="2" style="width:100%">${esc(lines('prohibited'))}</textarea>
      <p style="margin:10px 0 4px"><b>Cụm từ không được dùng</b> <span class="muted">· mỗi dòng một cụm</span></p>
      <textarea id="adbl" rows="2" style="width:100%">${esc((a.blocked || []).join('\n'))}</textarea>
      <div class="actions"><button onclick="closeModal()">Huỷ</button><button class="primary" id="adsave">Lưu</button></div>`);
    const hint = () => {
      const id = $('#adprod').value, p = prods.find(x => x.id === id);
      $('#adprodhint').textContent = p ? `Đối chiếu theo hồ sơ: ${p.claims?.approved || 0} claim đã duyệt, ${(p.claims?.prohibited || 0) + (p.claims?.expired || 0)} cấm / hết hạn, ${p.blocked || 0} cụm từ cấm. Sửa hồ sơ ở panel Sản phẩm; ô dưới chỉ để thêm riêng cho dự án này.`
        : id ? 'Hồ sơ này không còn: kiểm tra quảng cáo sẽ chặn xuất cho tới khi chọn hồ sơ khác.' : 'Chưa có hồ sơ? Tạo ở panel Sản phẩm (thanh trái) để dùng lại cho nhiều dự án.';
      $('#adoklbl').textContent = id ? 'Claim thêm riêng dự án này' : 'Claim đã có bằng chứng';
    };
    $('#adprod').onchange = () => { const p = prods.find(x => x.id === $('#adprod').value); if (p?.industry && !$('#adind').value) $('#adind').value = p.industry; hint(); };
    hint();
    $('#adsave').onclick = () => {
      const rows = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean);
      const old = new Map(cl.map(c => [c.text, c.id])); let n = 0;
      const mk = (text, status) => ({ id: old.get(text) || `c${Date.now().toString(36)}${n++}`, text, status });
      const platforms = [...document.querySelectorAll('[data-adp]:checked')].map(i => i.dataset.adp);
      S.pushUndo('ads');
      S.TL.ads = { ...a, on: $('#adon').checked, industry: $('#adind').value || undefined, platforms: platforms.length ? platforms : Object.keys(AD_PLAT),
        claims: [...rows('#adok').map(t => mk(t, 'approved')), ...rows('#adno').map(t => mk(t, 'prohibited'))], blocked: rows('#adbl'),
        product: $('#adprod').value || undefined };
      S.changed(); S.closeModal(); rerender();
      S.toast(S.TL.ads.on ? 'Đã bật kiểm tra quảng cáo. Bấm Kiểm tra để soát.' : 'Đã tắt kiểm tra quảng cáo');
    };
  }
  function adsSummary(q) {
    const a = q.ads; if (!a) return '';
    if (a.error) return `<br><span style="color:var(--warn)">Kiểm tra quảng cáo không chạy được: ${esc(a.error)}</span>`;
    const o = a.originality;
    return `<br>Quảng cáo (${esc(a.industry_vi || '')} · ${(a.platforms || []).map(p => AD_PLAT[p] || p).join(', ')}${a.product?.name || S.TL.ads?.product ? ` · hồ sơ ${esc(a.product?.name || S.TL.ads.product)}` : ''}): ${a.blocked ? '<b style="color:var(--bad)">có lỗi chặn</b>' : '<b style="color:var(--ok)">không có lỗi chặn</b>'}`
      + (o ? ` · nguyên bản <b style="color:${o.ok ? 'var(--ok)' : o.ab ? 'var(--warn)' : 'var(--bad)'}">${o.score.toFixed(2)}</b> (ngưỡng ${o.min}, so ${o.compared} bản${o.ab ? ', nhóm A/B' : ''})` : ' · chưa có phiên bản khác để chấm nguyên bản')
      + (a.rechecked ? ' · đã soát lại sau khi sửa' : '')
      + (q.override ? `<br><span style="color:var(--warn)">Đã bỏ qua chặn xuất (${esc(new Date(q.override.at).toLocaleString('vi-VN'))}): ${esc(q.override.reason)}</span>` : '');
  }

  // ---------- variants ----------
  async function runVariants() {
    const kind = $('#vakind')?.value || 'hook', exp = $('#vaexp')?.checked;
    if (dirty()) await S.saveNow();
    const r = await S.api('/api/variants/run', { n: 3, kind, export: !!exp });
    if (!r.ok) return S.toast(r.error || 'Đang có tác vụ khác chạy');
    S.modal(`<h3><i class="ti ti-versions"></i> Đang tạo 3 phiên bản…</h3><div id="jobstep" class="muted">Bắt đầu</div><div class="bar"><i></i></div><pre id="joblog"></pre>
      <p class="muted">Mỗi phiên bản là một dự án riêng nằm cạnh dự án này${exp ? ', có xuất video (720p) để so sánh' : ''}.</p>`);
    S.pollJob(async j => {
      if (j.state !== 'done') return S.modal(`<h3>Lỗi tạo phiên bản</h3><p>${esc(j.error || j.step)}</p><pre>${esc((j.log || '').slice(-1200))}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
      await loadVa(); showVariants(); rerender();
    });
  }
  const vfile = (dir, f) => avsUrl(`/api/variants/file?dir=${encodeURIComponent(dir)}&f=${encodeURIComponent(f)}`);
  function showVariants() {
    const v = va; if (!v) return S.toast('Chưa có phiên bản nào');
    const cols = [{ dir: v.base, name: 'Gốc', desc: 'Dự án ban đầu', hook: v.base_hook, still: v.base_still, video: v.base_video }, ...v.variants];
    S.modal(`<h3><i class="ti ti-versions"></i> So sánh ${v.variants.length} phiên bản <span class="muted" style="font-weight:400;font-size:12px">· ${esc(v.kind_vi || v.kind)}</span></h3>
      <div class="va-grid" style="--n:${cols.length}">${cols.map(c => `<div class="va-col ${c.dir === v.current ? 'cur' : ''}">
        ${c.video ? `<video src="${vfile(c.dir, c.video)}" ${c.still ? `poster="${vfile(c.dir, c.still)}"` : ''} muted loop playsinline controls preload="metadata"></video>` : c.still ? `<img src="${vfile(c.dir, c.still)}">` : '<div class="muted">chưa có ảnh</div>'}
        <b>${esc(c.name)}</b>${c.hook ? `<span class="hk">“${esc(c.hook)}”</span>` : ''}<p>${esc(c.desc || '')}</p>
        ${c.dir === v.current ? '<button class="mini" disabled>Đang mở</button>' : `<button class="mini" data-vaopen="${esc(c.dir)}"><i class="ti ti-folder-open"></i> Mở</button>`}</div>`).join('')}</div>
      <div class="actions"><button id="vaplay"><i class="ti ti-player-play"></i> Phát cùng lúc</button><button onclick="closeModal()">Đóng</button></div>`);
    $('#vaplay').onclick = () => { for (const vd of document.querySelectorAll('#modalbox video')) { vd.currentTime = 0; vd.play().catch(() => {}); } };
    $('#modalbox .va-grid').addEventListener('click', async e => {
      const b = e.target.closest('[data-vaopen]'); if (!b) return;
      if (dirty()) await S.saveNow();
      const r = await S.api('/api/variants/open', { dir: b.dataset.vaopen });
      if (r.ok) location.reload(); else S.toast(r.error || 'Không mở được');
    });
  }

  // ---------- AI panel cards (inserted whenever 20_ai.js renders its "Dựng giúp" tab) ----------
  function cards() {
    const q = last, v = va;
    return `<div class="ai-card" id="qcbox"><h4><i class="ti ti-shield-check"></i> Kiểm tra chất lượng</h4>
      <p>Máy dò chữ tràn khung, graphic che mặt, phụ đề bị đè, đoạn trống > 6 giây, phụ đề quá dài, file thiếu, hook, độ to âm thanh; rồi Claude xem các khung hình để soi hook, chính tả, nhịp.</p>
      ${q ? `<div class="qc-score" style="margin:6px 0">${ring(q.score)}<div class="qc-sum">${q.counts?.initial ?? q.issues.length} vấn đề${q.counts?.fixed ? `, đã sửa ${q.counts.fixed}` : ''}${q.counts?.new ? `, ${q.counts.new} phát sinh` : ''}<br><span class="muted">${new Date(q.created).toLocaleString('vi-VN')}</span></div></div>` : ''}
      <label class="ai-row" style="cursor:pointer"><input type="checkbox" id="qcclaude" style="flex:none" checked><span>Nhờ Claude xem khung hình <span class="muted">· chậm hơn</span></span></label>
      <div class="acts"><button class="mini primary" data-qc="fix" title="Kiểm tra rồi liệt kê gợi ý sửa; bạn chọn mục nào thì mới sửa mục đó"><i class="ti ti-wand"></i> Kiểm tra & gợi ý sửa</button>
      ${q ? '<button class="mini" data-qc="show"><i class="ti ti-list-details"></i> Kết quả</button>' : ''}</div>
      <div class="ai-row" style="margin-top:8px"><span>Kiểm tra quảng cáo: <b>${S.TL.ads?.on ? 'bật' : 'tắt'}</b>${S.TL.ads?.on ? ` <span class="muted">· ${AD_IND[S.TL.ads.industry || '']}${S.TL.ads.product ? ` · hồ sơ ${esc(S.TL.ads.product)}` : ''}</span>` : ''}</span><button class="mini" data-qc="ads" style="margin-left:auto"><i class="ti ti-speakerphone"></i> Thiết lập</button></div></div>
      <div class="ai-card" id="vabox"><h4><i class="ti ti-versions"></i> Nhiều phiên bản (A/B)</h4>
      <p>Tạo 3 dự án anh em với hook mở đầu khác nhau (Claude viết) và/hoặc gói style khác nhau, để đăng thử xem bản nào giữ chân người xem tốt hơn.</p>
      <div class="ai-row"><select id="vakind"><option value="hook">Khác hook mở đầu</option><option value="style">Khác gói style</option><option value="both">Khác cả hai</option></select></div>
      <label class="ai-row" style="cursor:pointer"><input type="checkbox" id="vaexp" style="flex:none"><span>Xuất luôn video 720p để so sánh</span></label>
      <div class="acts"><button class="mini primary" data-qc="variants"><i class="ti ti-copy"></i> Tạo 3 phiên bản</button>${v ? '<button class="mini" data-qc="compare"><i class="ti ti-columns-3"></i> So sánh</button>' : ''}</div></div>`;
  }
  function inject() {
    const lib = $('#libbody'); if (!lib || !lib.querySelector('[data-ai="open"]') || lib.querySelector('#qcbox')) return;
    lib.insertAdjacentHTML('beforeend', cards());
  }
  function rerender() { const a = $('#qcbox'), b = $('#vabox'); if (a) { a.remove(); b?.remove(); inject(); } }
  new MutationObserver(inject).observe($('#libbody'), { childList: true });
  $('#libbody').addEventListener('click', e => {
    const b = e.target.closest('[data-qc]'); if (!b) return;
    const a = b.dataset.qc, claude = $('#qcclaude')?.checked !== false;
    if (a === 'run') runQc({ fix: false, claude });
    if (a === 'fix') runQc({ fix: false, claude });
    if (a === 'show') { if (last) showResult(); }
    if (a === 'ads') adsDialog();
    if (a === 'variants') runVariants();
    if (a === 'compare') loadVa().then(showVariants);
  });

  // ---------- export dialog: "AI kiểm tra & sửa trước khi xuất" ----------
  new MutationObserver(() => {
    const box = $('#modalbox'); if (!box) return;
    if (box.querySelector('#xgo') && !box.querySelector('#qcx')) {
      const act = box.querySelector('.actions');
      act?.insertAdjacentHTML('beforebegin', `<label class="qcx"><input type="checkbox" id="qcx" ${saved?.qc ? 'checked' : ''}><span><b>AI kiểm tra & sửa trước khi xuất</b><br><small>Tự sửa chữ tràn khung, graphic che mặt, đoạn trống, phụ đề dài…; Claude soát chính tả và hook. Hoàn tác được.</small></span></label>`);
      if (saved && passQc) { // re-opened by us after the QC run: restore the form, then export
        const q = box.querySelector(`[name=xq][value="${saved.quality}"]`); if (q) q.checked = true;
        if ($('#xfrom')) $('#xfrom').value = saved.from; if ($('#xto')) $('#xto').value = saved.to;
        for (const i of box.querySelectorAll('[name=xasp]')) i.checked = saved.aspects.includes(i.value);
        setTimeout(() => $('#xgo')?.click(), 0);
      }
    }
    // QC card in the "Xuất xong" dialog
    if (exportQc && box.querySelector('h3 .ti-circle-check') && !box.querySelector('#qcdone')) {
      const q = exportQc; exportQc = null;
      box.querySelector('.actions')?.insertAdjacentHTML('beforebegin', `<div class="ai-card" id="qcdone"><h4><i class="ti ti-shield-check"></i> AI đã kiểm tra trước khi xuất</h4>
        <div class="qc-score">${q.after != null ? `${ring(q.before)}<i class="ti ti-arrow-right" style="color:var(--tx3)"></i>${ring(q.after)}` : ring(q.score)}
        <div class="qc-sum">Đã sửa ${q.counts?.fixed || 0}/${q.issues.length} vấn đề${q.counts?.high ? ` · còn ${q.counts.high} lỗi nặng` : ''}.<br><a href="#" id="qcdetail">Xem chi tiết</a></div></div></div>`);
      $('#qcdetail').onclick = e => { e.preventDefault(); showResult(); };
    }
  }).observe($('#modalbox'), { childList: true, subtree: false });
  // ---------- export gate (M15, scripts/export_gate.mjs): QC still has high ad issues → ask, default = stop ----------
  let passGate = false;
  const KCODE = { ad_policy: 'Chính sách', ad_claim: 'Claim', ad_originality: 'Nguyên bản' };
  async function checkGate() {
    if (dirty()) await S.saveNow();
    const g = await S.api('/api/qc/gate').catch(() => null);
    if (!g?.blocked) { passGate = true; return $('#xgo')?.click(); }
    showGate(g);
  }
  function showGate(g) {
    const box = $('#modalbox'); if (!box || box.querySelector('#qcgate')) return;
    // hide the export form (kept, with its handlers) while the gate is open; #modal .actions sets display, so not [hidden]
    const form = [...box.children].map(el => [el, el.style.display]); form.forEach(([el]) => (el.style.display = 'none'));
    const wasQc = passQc; passQc = false; saved = null; // "Dừng" must not leave the QC-then-export pass armed
    box.insertAdjacentHTML('beforeend', `<div id="qcgate">
      <h3><i class="ti ti-shield-x" style="color:var(--bad)"></i> Chưa xuất: còn ${g.issues.length} lỗi quảng cáo mức cao</h3>
      <p class="muted" style="margin:0 0 6px">Lần kiểm tra chất lượng gần nhất${g.checked ? ` (${new Date(g.checked).toLocaleString('vi-VN')})` : ''} còn các lỗi sau. Mặc định là dừng để sửa.</p>
      ${g.stale ? '<div class="help" style="color:var(--warn)">Timeline đã đổi sau lần kiểm tra đó. Nếu đã sửa, bấm “Kiểm tra lại”.</div>' : ''}
      <div class="qc-list">${g.issues.map(i => `<div class="qc-it" data-qct="${i.t}"><span class="tm">${S.fmt(i.t).replace(/^0:/, '')}</span><span class="sv high"></span>
        <span class="bd"><span class="src">${esc(KCODE[i.kind] || i.kind)}</span>${esc(i.msg)}</span></div>`).join('')}</div>
      ${g.hard ? `<div class="help" style="color:var(--bad)"><b>Có lỗi chính sách quảng cáo mức cao: không bỏ qua được.</b> Sửa lời thoại hoặc chữ trên màn hình rồi kiểm tra lại.</div>`
        : `<label class="lbl" for="qcgwhy">Vẫn xuất? Ghi lý do (lưu vào .studio/qc.json và .studio/qc_overrides.log)</label>
           <textarea id="qcgwhy" rows="2" style="width:100%" placeholder="Ví dụ: claim đã có giấy chứng nhận số …, khách hàng đã duyệt"></textarea>`}
      <div class="actions"><button id="qcgqc"><i class="ti ti-refresh"></i> Kiểm tra lại</button>
        ${g.hard ? '' : '<button id="qcggo" disabled><i class="ti ti-upload"></i> Vẫn xuất</button>'}
        <button class="primary" id="qcgstop"><i class="ti ti-player-stop"></i> Dừng</button></div></div>`);
    const gate = $('#qcgate'), stop = $('#qcgstop'), why = $('#qcgwhy'), go = $('#qcggo');
    stop.focus();
    stop.onclick = () => S.closeModal();
    gate.querySelector('.qc-list').addEventListener('click', e => { const it = e.target.closest('[data-qct]'); if (it) { S.setTime(+it.dataset.qct); S.closeModal(); } });
    $('#qcgqc').onclick = () => runQc({ fix: false, claude: false });
    if (why) why.oninput = () => (go.disabled = why.value.trim().length < 10);
    if (go) go.onclick = async () => {
      const r = await S.api('/api/qc/override', { reason: why.value });
      if (r.error) return S.toast(r.error);
      S.toast('Đã ghi lý do bỏ qua chặn xuất');
      gate.remove(); form.forEach(([el, d]) => (el.style.display = d));
      passQc = wasQc; passGate = true; $('#xgo')?.click();
    };
  }
  document.addEventListener('click', e => {
    if (!e.target.closest?.('#xgo')) return;
    // the gate is checked on the export about to run: after the QC pass when "AI kiểm tra & sửa" is ticked, else now
    if (passGate) passGate = false;
    else if (passQc || !$('#qcx')?.checked) { e.preventDefault(); e.stopImmediatePropagation(); checkGate(); return; }
    if (passQc) { passQc = false; saved = null; return; } // second pass: let studio.js export
    if (!$('#qcx')?.checked) return;
    e.preventDefault(); e.stopImmediatePropagation();
    saved = { qc: true, quality: document.querySelector('[name=xq]:checked')?.value || '1080', from: $('#xfrom')?.value || '', to: $('#xto')?.value || '',
      aspects: [...document.querySelectorAll('[name=xasp]:checked')].map(i => i.value) };
    runQc({ fix: true, claude: true, after: q => { exportQc = q; passQc = true; $('#export').click(); } });
  }, true);

  S.onReady(() => { load().then(rerender); loadVa().then(rerender); });
})();
