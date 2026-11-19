// AI Video Studio — ghi chú kịch bản trên chính chỗ đã dựng (S27 M194, docs/plans/S27-dung-theo-kich-ban.md mục 2.3). Không route, không panel.
// AI dựng (scripts/ai_edit.mjs) có kịch bản đã căn thì tự dựng theo dấu; mỗi mục dựng theo dấu mang `_script` { id, kind, text, note, auto? }
// và kế hoạch mang `script` { total, done, req: [{ id, seg, t0, kind, text, ok, why? }] }.
// - Trỏ khối timeline: tooltip thêm "Kịch bản: [B-ROLL: căn hộ] · Đã dựng: cảnh Kho “a.mp4”" (Studio._tip), khối có dấu nhỏ (Studio._blk).
// - Chọn khối: dòng ghi chú đầu Thuộc tính (Studio._itop) + Sửa tay (mở mục đầu của Thuộc tính qua Studio.openSect, tự sang tab
//   Thuộc tính: bài học ai-video-studio-059) / Hỏi Claude (Studio.ask: tab Claude, câu hỏi điền sẵn về element đang chọn, chưa gửi).
// - Studio.scriptNotes.line(plan): một dòng "Theo kịch bản: 12/14 yêu cầu đã dựng · 2 cần xem" ở panel AI dựng (20_ai.js); bấm = tua tới
//   yêu cầu cần xem kế tiếp, chọn khối cùng đoạn nếu có, báo lý do. Đếm trên timeline hiện tại (mục đã xoá thành "cần xem").
'use strict';
(() => {
  const S = window.Studio; if (!S) return;
  const esc = S.esc;
  const css = document.createElement('style');
  css.textContent = `
  .scn { display: flex; gap: var(--space-2); align-items: flex-start; margin: 0 0 var(--space-2); padding: var(--space-2); min-width: 0;
    border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-card); background: rgb(var(--color-surface-raised)); font-size: var(--text-xs); }
  .scn > .ti { flex: none; font-size: var(--text-md); color: rgb(var(--color-accent-text)); }
  .scn-tx { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: var(--space-1); }
  .scn-tx b { font-weight: 600; overflow-wrap: anywhere; }
  .scn-tx small { color: rgb(var(--color-fg-muted)); font-size: var(--text-2xs); overflow-wrap: anywhere; }
  .scn-acts { display: flex; flex-wrap: wrap; gap: var(--space-1); }
  .scn-acts button { font-size: var(--text-2xs); padding: 0 var(--space-2); min-height: var(--h-sm, 24px); }
  .blk .scn-b { font-size: var(--text-2xs); opacity: .8; margin-left: var(--space-1); }
  .scn-sum { display: flex; gap: var(--space-2); align-items: center; width: 100%; text-align: left; margin: var(--space-2) 0; font-size: var(--text-xs); min-width: 0; }
  .scn-sum > span { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
  .scn-sum em { font-style: normal; color: rgb(var(--color-warning)); }
  `;
  document.head.appendChild(css);

  const label = x => `[${x.kind}${x.text ? `: ${x.text}` : ''}]`;
  const did = x => (x.auto ? `AI tự thêm theo lời: ${x.note}` : `Đã dựng: ${x.note}`);
  // khối chữ (kind 'line') có obj là dòng chữ, ghi chú nằm ở cảnh của nó (c.scene)
  const noteOf = c => { const x = c?.obj?._script || c?.scene?._script; return x && typeof x === 'object' && x.kind ? x : null; };

  S._tip.push(c => { const x = noteOf(c); return x ? ` · Kịch bản: ${label(x)} · ${did(x)}` : ''; });
  S._blk.push(c => (noteOf(c) ? '<i class="ti ti-notes scn-b" aria-hidden="true"></i>' : ''));
  S._itop.push(c => {
    const x = noteOf(c); if (!x) return '';
    return `<div class="scn" data-scn-box><i class="ti ti-notes" aria-hidden="true"></i><div class="scn-tx"><b>Kịch bản: ${esc(label(x))}</b><small>${esc(did(x))}</small>
      <div class="scn-acts"><button data-scn="edit" title="Mở thuộc tính của khối này để sửa"><i class="ti ti-pencil"></i> Sửa tay</button>
      <button data-scn="ask" title="Hỏi Claude sửa khối này theo kịch bản"><i class="ti ti-sparkles"></i> Hỏi Claude</button></div></div></div>`;
  });

  function editHere() {
    const k = document.querySelector('#insp .isec[data-sec]')?.dataset.sec;
    if (k) S.openSect(k);
    requestAnimationFrame(() => document.querySelector('#insp .isec.open .isec-b :is(textarea, input:not([type="checkbox"]), select)')?.focus());
  }
  function askHere() {
    const x = noteOf(S.sel); if (!x || !S.ask) return S.toast('Chưa có Hỏi Claude ở bước này');
    if (!S.ask.open(false)) return;
    const q = `Kịch bản yêu cầu ${label(x)} ở đoạn này (${did(x).toLowerCase()}). Sửa khối này cho đúng yêu cầu: `;
    const inp = S.ask.input; inp.value = q; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus(); inp.setSelectionRange(q.length, q.length);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest?.('#insp [data-scn]'); if (!b) return;
    e.preventDefault();
    if (b.dataset.scn === 'edit') editHere(); else askHere();
  });

  // ---------- dòng tóm tắt ở panel AI dựng ----------
  const fullCover = s => s._sheet != null && ((s.type === 'photo' && s.mode === 'full') || (s.type === 'broll' && s.layout === 'full'));
  function stat(plan) {
    const req = plan?.script?.req; if (!Array.isArray(req) || !req.length || !S.TL) return null;
    const TL = S.TL, have = new Map();
    for (const x of [...(TL.scenes || []), ...(TL.audio?.sfx || []), ...(TL.audio?.music || [])]) if (x?._script?.id && !x.hidden && !have.has(x._script.id)) have.set(x._script.id, x);
    for (const s of TL.scenes || []) if (fullCover(s) && !s.hidden && !have.has(`${s._sheet}:aroll`)) have.set(`${s._sheet}:aroll`, s);
    const all = req.map(q => (have.has(q.id) ? { ...q, ok: true } : { ...q, ok: false, why: q.ok ? 'đã xoá hoặc ẩn khỏi timeline' : q.why || 'chưa dựng được' }));
    return { total: all.length, done: all.filter(q => q.ok).length, need: all.filter(q => !q.ok).sort((a, b) => a.t0 - b.t0) };
  }
  let cur = null, at = -1; // kế hoạch của dòng đang hiện, yêu cầu cần xem vừa nhảy tới
  function line(plan) {
    const st = stat(plan); cur = plan; if (!st) return '';
    const n = st.need.length;
    return `<button class="ghost scn-sum" data-scnj ${n ? '' : 'disabled'} title="${n ? 'Tua tới yêu cầu kịch bản cần xem kế tiếp' : 'Mọi yêu cầu của kịch bản đã có trên timeline'}">
      <i class="ti ${n ? 'ti-alert-triangle' : 'ti-circle-check'}" aria-hidden="true"></i><span>Theo kịch bản: <b>${st.done}/${st.total}</b> yêu cầu đã dựng${n ? ` · <em>${n} cần xem</em>` : ''}</span>${n ? '<i class="ti ti-arrow-right" aria-hidden="true"></i>' : ''}</button>`;
  }
  function jump(plan) { // S27 M200: plan = kế hoạch từ tiêu chí `script` của bước Dựng (03_nextstep), khi panel AI dựng chưa vẽ dòng
    if (plan) cur = plan;
    const st = stat(cur); if (!st?.need.length) return;
    at = (at + 1) % st.need.length;
    const q = st.need[at];
    S.setTime(Math.max(0, q.t0 + .05));
    const near = (S.comps || []).find(c => c.obj && c.obj._sheet === q.seg && c.kind !== 'clip');
    if (near) S.select(near, false);
    S.toast(`⚠ Chưa dựng được ${label(q)}: ${q.why}`);
  }
  document.addEventListener('click', e => { if (e.target.closest?.('#libbody [data-scnj]')) jump(); });
  S.scriptNotes = { line, stat, jump };
})();
