// S27 M196 · A-roll theo kịch bản (server: studio/routes/24_aroll.mjs, lõi scripts/script_takes.mjs). Không panel, không bảng cài đặt:
//   Studio.aroll.line()  dòng gọn trong hộp AI dựng (20_ai.js): "3 đoạn nói ngoài kịch bản · Xem để cắt" và, khi dự án có ≥ 2 clip quay
//                        (nguồn có tiếng khác nhau), "2 take · Dựng A-roll theo kịch bản" → job nền script_takes → "Áp" (một bước hoàn tác).
//   Lời ngoài kịch bản: hộp danh sách, mặc định không chọn đoạn nào, nghe thử từng đoạn, "Cắt các đoạn đã chọn" đi qua Studio.ai.cutRanges
//   (cắt ripple, một bước hoàn tác), lưu rồi căn lại kịch bản (/api/aroll/realign). Không chạy trong Tự lái.
//   Mỗi clip A-roll đã dựng mang _sheet (đoạn kịch bản) + _take (số take): ghi chú kịch bản trên khối dùng chung cơ chế _sheet.
(() => {
  const S = window.Studio, { $, esc } = S;
  const css = document.createElement('style');
  css.textContent = `.ar-line{display:flex;align-items:center;gap:var(--space-1);flex-wrap:wrap;margin:var(--space-2) 0;font-size:var(--text-xs);color:var(--color-fg-muted)}
.ar-line i{font-size:14px}.ar-line b{color:var(--color-fg);font-weight:600}.ar-line.warn i{color:var(--color-warning)}
.ar-list{max-height:52vh;overflow:auto;display:flex;flex-direction:column;gap:var(--space-1);margin:var(--space-2) 0}
.ar-it{display:grid;grid-template-columns:auto auto 1fr auto;gap:var(--space-2);align-items:start;padding:var(--space-1) var(--space-2);border:1px solid var(--color-line-strong);border-radius:var(--radius-control)}
.ar-it .t{font-variant-numeric:tabular-nums;color:var(--color-fg-muted);white-space:nowrap}.ar-it .x{min-width:0;overflow-wrap:anywhere}
.ar-tk{font-size:9px;padding:0 3px;margin-left:4px;border-radius:3px;background:var(--color-line-strong)}`;
  document.head.appendChild(css);
  const A = { st: null, busy: false, timer: null, at: 0 };
  const s1 = v => (+v || 0).toFixed(1).replace('.', ',');
  const inAi = () => !!$('#libbody [data-ai="build"]');
  const redraw = () => { if (inAi()) S.ai?.renderBuild?.(); };
  async function refresh() {
    clearTimeout(A.timer); A.at = Date.now(); A.busy = true;
    try { const r = await S.api('/api/aroll'); if (!r.error) A.st = r; } catch { /* server cũ: không có route */ }
    A.busy = false; redraw();
    const j = A.st?.job; if (j && ['queued', 'running'].includes(j.state) && inAi()) A.timer = setTimeout(refresh, 3000);
  }
  function line() {
    if (!A.busy && Date.now() - A.at > 5000) setTimeout(refresh, 0); // mở lại hộp AI dựng / đổi dự án: đọc lại trạng thái
    const st = A.st; if (!st?.script) return '';
    const out = [], off = st.offscript || [], tot = off.reduce((a, o) => a + o.dur, 0);
    if (off.length) out.push(`<div class="ar-line warn"><i class="ti ti-scissors"></i><b>${off.length} đoạn nói ngoài kịch bản</b> · ${s1(tot)}s <button class="ai-lnk" data-ar="off">Xem để cắt</button></div>`);
    const j = st.job, pl = st.plan, nT = (st.takes || []).length;
    if (j && ['queued', 'running'].includes(j.state)) out.push(`<div class="ar-line"><i class="ti ti-loader-2"></i>A-roll theo kịch bản: ${esc(j.step || 'đang chờ')}${j.progress ? ` ${Math.round(j.progress * 100)}%` : ''}</div>`);
    else if (pl && !pl.applied && !pl.stale) {
      const used = (pl.takes || []).filter(t => t.used).length;
      out.push(`<div class="ar-line${pl.missing.length ? ' warn' : ''}"><i class="ti ti-movie"></i><b>A-roll theo kịch bản</b> · ${pl.clips} đoạn từ ${used} take${pl.missing.length ? ` · ${pl.missing.length} đoạn chưa quay` : ''} <button class="ai-lnk" data-ar="apply">Áp</button> <button class="ai-lnk" data-ar="plan">Xem</button></div>`);
    } else if (nT >= 2) out.push(`<div class="ar-line"><i class="ti ti-movie"></i>${nT} clip quay${j?.state === 'error' ? ` · lỗi: ${esc(String(j.error || '').slice(0, 80))}` : pl?.stale ? ' · kịch bản đã sửa' : ''} <button class="ai-lnk" data-ar="takes">${pl ? 'Dựng lại' : 'Dựng'} A-roll theo kịch bản</button></div>`);
    return out.join('');
  }
  // ---------- lời ngoài kịch bản ----------
  function openOff() {
    const off = A.st?.offscript || []; if (!off.length) return;
    const sel = new Set();
    const body = () => `<h3><i class="ti ti-scissors"></i> Lời nói ngoài kịch bản</h3>
      <p class="muted">Những câu nghe được mà kịch bản không có. Có thể là câu ứng biến hay, nên không chọn sẵn: tick đoạn muốn bỏ, nghe thử rồi cắt. Cắt dồn cả video, phụ đề, graphic như cắt trên timeline; hoàn tác được (⌘Z).</p>
      <div class="ar-list">${off.map((o, k) => `<label class="ar-it"><input type="checkbox" data-ark="${k}" ${sel.has(k) ? 'checked' : ''}><span class="t">${S.fmt ? S.fmt(o.a) : s1(o.a)} · ${s1(o.dur)}s</span><span class="x">“${esc(o.text)}”</span><button class="mini" data-arp="${k}" title="Nghe thử"><i class="ti ti-player-play"></i></button></label>`).join('')}</div>
      <div class="acts"><button class="primary" data-ar="cut" ${sel.size ? '' : 'disabled'}><i class="ti ti-scissors"></i> Cắt ${sel.size || ''} đoạn đã chọn</button><button data-ar="close">Đóng</button></div>`;
    S.modal(body());
    const box = $('#modalbox');
    box.onclick = async e => {
      const ck = e.target.closest('[data-ark]'), pv = e.target.closest('[data-arp]'), b = e.target.closest('[data-ar]');
      if (ck) { const k = +ck.dataset.ark; ck.checked ? sel.add(k) : sel.delete(k); const c = box.querySelector('[data-ar="cut"]'); if (c) { c.disabled = !sel.size; c.innerHTML = `<i class="ti ti-scissors"></i> Cắt ${sel.size || ''} đoạn đã chọn`; } return; }
      if (pv) { e.preventDefault(); const o = off[+pv.dataset.arp]; return S.ai?.previewRange?.(o.a, o.b); }
      if (!b) return;
      if (b.dataset.ar === 'close') { box.onclick = null; return S.closeModal(); }
      if (b.dataset.ar === 'cut' && sel.size) {
        const n = S.ai.cutRanges([...sel].map(k => [off[k].a, off[k].b]), 'Đã cắt lời ngoài kịch bản');
        box.onclick = null; S.closeModal(); if (!n) return;
        await S.saveNow(true, true);
        try { const r = await S.api('/api/aroll/realign', {}); if (r.ok && A.st) A.st.offscript = r.offscript; } catch { /* căn lại lần mở sau */ }
        refresh();
      }
    };
  }
  // ---------- nhiều take ----------
  async function startTakes() {
    const r = await S.api('/api/aroll/takes', {});
    if (r.error) return S.toast(r.error);
    S.toast('Đang dựng A-roll theo kịch bản (chạy nền: nhận dạng lời từng take, lần sau dùng lại)');
    refresh();
  }
  async function loadPlan() { const r = await S.api('/api/aroll/plan'); if (!r.plan?.clips?.length) { S.toast('Chưa có kế hoạch A-roll'); return null; } return r.plan; }
  function planText(pl) {
    const segs = pl.segments || [];
    return (pl.picks || []).map(p => `<div class="ar-it"><span class="t">Đoạn ${p.seg + 1}</span><span class="t">${p.take != null ? `take ${p.take + 1}` : '—'}</span><span class="x">${esc(String(segs[p.seg]?.say || '').slice(0, 90))}${p.missing ? ' <b class="bad">· chưa quay</b>' : p.by === 'mark' ? ' <span class="muted">· theo dấu</span>' : ` <span class="muted">· khớp ${Math.round((p.ratio || 0) * 100)}%</span>`}${p.why ? ` <span class="muted">(${esc(p.why)})</span>` : ''}</span><span></span></div>`).join('');
  }
  async function showPlan() {
    const pl = await loadPlan(); if (!pl) return;
    S.modal(`<h3><i class="ti ti-movie"></i> A-roll theo kịch bản</h3>
      <p class="muted">${(pl.takes || []).map(t => `Take ${t.n}: ${esc(t.name)}`).join(' · ')}</p><div class="ar-list">${planText(pl)}</div>
      <div class="acts"><button class="primary" data-ar="apply2"><i class="ti ti-check"></i> Áp</button><button data-ar="close2">Đóng</button></div>`);
    const box = $('#modalbox');
    box.onclick = e => { const b = e.target.closest('[data-ar]'); if (!b) return; if (b.dataset.ar === 'close2' || b.dataset.ar === 'apply2') { box.onclick = null; S.closeModal(); } if (b.dataset.ar === 'apply2') apply(pl); };
  }
  // Thay track chính bằng các clip theo kịch bản + phụ đề theo giờ mới: một bước hoàn tác (snapshot TL + CAP)
  async function apply(pl) {
    pl = pl || await loadPlan(); if (!pl) return;
    const TL = S.TL; S.pushUndo();
    const oldSpeech = (TL.scenes || []).filter(s => s.type === 'title_card' && s.t1 >= (TL.duration || 0) - .05).map(s => s.t0)[0] ?? TL.duration;
    TL.clips = JSON.parse(JSON.stringify(pl.clips));
    const d = pl.speech - oldSpeech;
    for (const s of TL.scenes || []) if (s.type === 'title_card' && s.t0 >= oldSpeech - .05) { s.t0 = +(s.t0 + d).toFixed(2); s.t1 = +(s.t1 + d).toFixed(2); }
    TL.duration = pl.duration;
    S.CAP = JSON.parse(JSON.stringify(pl.caps || []));
    S.build?.(); S.changed(true);
    const nAi = (TL.scenes || []).filter(s => (s._ai || s._auto || s._sheet != null) && !s._base).length;
    S.toast(`Đã áp A-roll: ${pl.clips.length} đoạn${pl.missing?.length ? `, ${pl.missing.length} đoạn chưa quay` : ''}${nAi ? ' · bấm AI dựng lại để graphic theo giờ mới' : ''} (⌘Z để hoàn tác)`);
    await S.saveNow(true, true);
    try { await S.api('/api/aroll/applied', {}); } catch { /* lần sau */ }
    refresh();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('#libbody [data-ar]'); if (!b) return;
    const a = b.dataset.ar;
    if (a === 'off') openOff(); else if (a === 'takes') startTakes(); else if (a === 'apply') apply(); else if (a === 'plan') showPlan();
  });
  // khối clip trên timeline: nhãn take nhỏ (T2) cho clip do A-roll theo kịch bản dựng
  S._blk.push(c => (c.kind === 'clip' && c.obj._take ? `<span class="ar-tk" title="Take ${c.obj._take} · đoạn kịch bản ${(c.obj._sheet ?? 0) + 1}">T${c.obj._take}</span>` : ''));
  S.aroll = { line, refresh, apply, get state() { return A.st; } };
  // AI dựng hiện dòng này khi mở hộp; tải trạng thái khi dự án mở và sau mỗi lần lưu kịch bản
  S.onReady?.(refresh);
})();
