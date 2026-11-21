// S27 M201: "Bạn muốn làm gì?" — đầu panel AI dựng của bước Dựng (20_ai.js renderAi gọi Studio.tasks.html()). Chủ repo 2026-11-20:
// các bước rõ ràng: thêm video (Nguồn → Video nguồn) → thêm kịch bản (Nguồn → Kịch bản, mục riêng ngay dưới) → hỏi cần làm gì. Mỗi việc
// một ô chọn, không tick sẵn; Studio chỉ làm việc đã chọn, lần lượt trong khay việc nền, mỗi việc một bước hoàn tác. Chỉ Tự lái làm hết.
// Danh sách, điều kiện, thứ tự chạy: lõi 26_tasks.core.js (window.TasksCore). Việc gọi công cụ có sẵn, không thêm route:
//   cut     Studio.ai.detect() → danh sách chỗ cắt ở panel Làm sạch lời nói (bạn tự chọn rồi Cắt)
//   face    Studio.reframe.runMain() (40_reframe.js, POST /api/reframe)
//   graphic / caption (+ music khi có lượt Claude)  Studio.ai.runParts({ only }) → applyPlan chỉ áp phần đã chọn
//   broll   Studio.autofill.run('broll') · music (không có lượt Claude) Studio.autofill.run('sfx', { opts: { music: true } })
//   aroll   Studio.aroll.refresh() → dòng "đoạn nói ngoài kịch bản · Xem để cắt" / take (24_aroll.js)
//   look    mở Bộ lọc (Studio.workflow.focus, bài học ai-video-studio-062)
'use strict';
(() => {
  const S = Studio, C = window.TasksCore, esc = S.esc, $ = s => document.querySelector(s);
  if (!C) return;
  const css = document.createElement('style');
  css.textContent = `
  .bt { background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); padding: var(--space-3); margin: 0 0 var(--space-2); display: flex; flex-direction: column; gap: var(--space-2); }
  .bt h4 { margin: 0; font-size: var(--text-sm); display: flex; gap: var(--space-2); align-items: center; }
  .bt p { margin: 0; color: rgb(var(--color-fg-muted)); font-size: var(--text-2xs); line-height: 1.5; }
  .bt-list { display: flex; flex-direction: column; gap: var(--space-1); }
  .bt-it { display: grid; grid-template-columns: auto auto minmax(0, 1fr); gap: var(--space-2); align-items: center; padding: var(--space-2); border: 1px solid rgb(var(--color-line-strong));
    border-radius: var(--radius-control); background: rgb(var(--color-surface)); cursor: pointer; transition: border-color var(--duration-fast) var(--ease-standard); }
  .bt-it:has(input:checked) { border-color: rgb(var(--color-accent-text) / .5); background: rgb(var(--color-accent-soft) / .24); }
  .bt-it.is-off { cursor: default; opacity: .6; }
  .bt-it > .ti { font-size: 16px; color: rgb(var(--color-fg-muted)); }
  .bt-it b { display: block; font-size: var(--text-xs); font-weight: 600; color: rgb(var(--color-fg)); }
  .bt-it small { display: block; font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); line-height: 1.4; overflow-wrap: anywhere; }
  .bt-it small.bt-st { color: rgb(var(--color-fg-muted)); } .bt-it small.is-ok { color: rgb(var(--color-success)); } .bt-it small.is-err { color: rgb(var(--color-warning)); }
  .bt-it .ai-lnk, .bt-it .wf-lnk { font-size: var(--text-2xs); }
  .bt textarea { width: 100%; min-height: 48px; box-sizing: border-box; font-size: var(--text-xs); }
  .bt-auto { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); }
  `;
  document.head.appendChild(css);

  // trạng thái theo dự án: chọn gì, kết quả từng việc ({ st: 'run'|'ok'|'err', text, go }) — không lưu: mỗi lần mở dự án chọn lại
  let P = { dir: null };
  const fresh = () => { const dir = S.META?.dir || ''; if (P.dir !== dir) P = { dir, sel: new Set(), res: {}, busy: false, extra: '', script: null, claude: null, asked: false }; return P; };
  const onPanel = () => typeof panel !== 'undefined' && panel === 'wf-aihelp';
  const redraw = () => { if (onPanel()) S.ai?.renderBuild?.(); };
  function ask() { // kịch bản đã lưu? Claude sẵn sàng? (một lần mỗi dự án; chưa biết thì vẫn cho chọn, server từ chối thì báo lúc chạy)
    if (P.asked) return; P.asked = true; const dir = P.dir;
    S.api('/api/script').then(r => { if (P.dir === dir) { P.script = !!r?.script; redraw(); } }).catch(() => {});
    S.api('/api/setup/check').then(r => { const c = r?.items?.find(i => i.id === 'claude'); if (P.dir === dir && c) { P.claude = c.status === 'ok'; redraw(); } }).catch(() => {});
  }
  const ctx = () => ({ captions: (S.CAP || []).length > 0, script: !!P.script || !!S.aroll?.state?.script,
    video: (S.TL?.clips || []).some(k => k.src && typeof k.src !== 'string'), claude: P.claude });

  function stLine(id) {
    const r = P.res[id]; if (!r) return '';
    if (r.st === 'run') return '<small class="bt-st"><i class="ti ti-loader-2 spin"></i> Đang làm…</small>';
    if (r.st === 'wait') return '<small class="bt-st"><i class="ti ti-clock"></i> Chờ việc trước xong</small>';
    const go = r.go ? ` <button class="wf-lnk" data-bt-go="${esc(r.go)}">${esc(r.goLabel || 'Mở')}</button>` : '';
    return `<small class="${r.st === 'ok' ? 'is-ok' : 'is-err'}"><i class="ti ${r.st === 'ok' ? 'ti-circle-check' : 'ti-alert-triangle'}"></i> ${esc(r.text || '')}${go}</small>`;
  }
  function html() {
    fresh(); ask();
    const c = ctx();
    for (const id of [...P.sel]) if (!C.avail(id, c).ok) P.sel.delete(id); // điều kiện mất (xoá kịch bản…): bỏ chọn
    const items = C.TASKS.map(t => {
      const a = C.avail(t.id, c), on = P.sel.has(t.id);
      return `<label class="bt-it ${a.ok ? '' : 'is-off'}" title="${esc(a.ok ? t.hint : a.why)}"><input type="checkbox" data-bt="${t.id}" ${on ? 'checked' : ''} ${a.ok && !P.busy ? '' : 'disabled'}>
        <i class="ti ${t.icon}"></i><span><b>${esc(t.label)}${t.claude ? ' <span class="muted">· Claude</span>' : ''}</b><small>${esc(a.ok ? t.hint : a.why)}</small>${stLine(t.id)}</span></label>`;
    }).join('');
    const n = P.sel.size, needClaude = [...P.sel].some(id => C.byId(id)?.claude);
    const aroll = P.res.aroll?.st === 'ok' ? (S.aroll?.line() || '') : '';
    return `<div class="bt" id="bt-box"><h4><i class="ti ti-list-check"></i> Bạn muốn làm gì?</h4>
      <p>Chọn việc cần làm cho video này. Studio chỉ làm việc bạn chọn, lần lượt, mỗi việc hoàn tác được (⌘Z).</p>
      <div class="bt-list">${items}</div>
      ${needClaude ? `<textarea id="bt-extra" placeholder="Ghi chú cho Claude (không bắt buộc): vd. nhấn mạnh giá, giọng vui" ${P.busy ? 'disabled' : ''}>${esc(P.extra)}</textarea>` : ''}
      <button class="wide primary" data-bt-run ${n && !P.busy ? '' : 'disabled'}>${P.busy ? '<i class="ti ti-loader-2 spin"></i> Đang làm…' : `<i class="ti ti-player-play"></i> ${n ? `Làm ${n} việc đã chọn` : 'Chọn ít nhất một việc'}`}</button>
      ${aroll}
      <p class="bt-auto"><i class="ti ti-robot"></i> Muốn Studio tự làm hết theo mẫu: dùng Tự lái (nút trên thanh đầu).</p></div>`;
  }

  const ok = (text, extra) => ({ st: 'ok', text, ...extra }), err = text => ({ st: 'err', text });
  async function runStep(s, extra) {
    if (s.step === 'cut') {
      if (!S.ai?.detect) return { cut: err('Chưa có công cụ cắt lỗi nói') };
      await S.ai.detect();
      const f = S.ai.fillers;
      if (!f) return { cut: err('Chưa dò được lỗi nói') };
      return { cut: ok(f.cuts.length ? `${f.cuts.length} chỗ nên cắt: xem, bỏ chọn chỗ muốn giữ rồi Cắt` : 'Không thấy lỗi nói nào', f.cuts.length ? { go: 'ai', goLabel: 'Xem chỗ cắt' } : {}) };
    }
    if (s.step === 'face') {
      if (!S.reframe?.runMain) return { face: err('Chưa có công cụ bám mặt') };
      const r = await S.reframe.runMain();
      return { face: r.error ? err(r.error) : ok(r.text) };
    }
    if (s.step === 'claude') {
      const r = S.ai?.runParts ? await S.ai.runParts({ only: C.onlyOf(s.parts), extra }) : { error: 'Chưa có AI dựng' };
      const p = r.plan, out = {};
      for (const k of s.parts) {
        if (r.error) { out[k] = err(r.error); continue; }
        out[k] = ok(k === 'graphic' ? `${(p.scenes || []).filter(x => !x._base).length} graphic · gói ${p.pack || ''}`
          : k === 'caption' ? `Sửa ${p._applied ?? (p.captions || []).length} dòng phụ đề` : `Nhạc và ${(p.sfx || []).length} SFX theo cảnh`);
      }
      return out;
    }
    if (s.step === 'broll' || s.step === 'music') {
      if (!S.autofill) return { [s.step]: err('Chưa có công cụ Tự động') };
      const o = await (s.step === 'broll' ? S.autofill.run('broll') : S.autofill.run('sfx', { opts: { music: true } }));
      if (!o) return { [s.step]: err('Chưa xong: xem chuông việc nền') };
      return { [s.step]: s.step === 'broll' ? ok(`Thêm ${o.broll?.added ?? 0} b-roll`) : ok(o.sfx ? String(o.sfx).replace(/^level \d: /, '') : 'Đã đặt nhạc và SFX') };
    }
    if (s.step === 'aroll') {
      if (!S.aroll) return { aroll: err('Chưa có công cụ A-roll') };
      await S.aroll.refresh();
      const st = S.aroll.state || {}, off = (st.offscript || []).length, takes = (st.takes || []).length;
      return { aroll: ok([off ? `${off} đoạn nói ngoài kịch bản` : 'Lời nói khớp kịch bản', takes >= 2 ? `${takes} take` : ''].filter(Boolean).join(' · ') + (off || takes >= 2 ? ': xem bên dưới' : '')) };
    }
    if (s.step === 'look') { setTimeout(() => S.workflow?.focus('filter'), 0); return { look: ok('Đã mở Bộ lọc') }; }
    return {};
  }
  async function run() {
    fresh();
    const list = C.steps(P.sel); if (!list.length || P.busy) return;
    P.busy = true; P.extra = ($('#bt-extra')?.value || P.extra).trim();
    const ids = s => (s.step === 'claude' ? s.parts : [s.step]);
    P.res = {}; for (const s of list) for (const id of ids(s)) P.res[id] = { st: 'wait' };
    const dir = P.dir;
    for (const s of list) {
      if (P.dir !== dir) return; // đổi dự án giữa chừng: dừng
      for (const id of ids(s)) P.res[id] = { st: 'run' };
      redraw();
      let out;
      try { out = await runStep(s, P.extra); } catch (e) { console.error(e); out = Object.fromEntries(ids(s).map(id => [id, err(e.message)])); }
      if (P.dir !== dir) return;
      Object.assign(P.res, out);
    }
    P.busy = false; P.sel.clear(); redraw();
    const bad = Object.values(P.res).filter(r => r.st === 'err').length;
    S.toast(bad ? `Xong, ${bad} việc chưa làm được: xem panel AI dựng` : 'Đã làm xong các việc đã chọn');
  }

  document.addEventListener('change', e => {
    const t = e.target.closest?.('#bt-box [data-bt]'); if (!t) return;
    fresh(); if (t.checked) P.sel.add(t.dataset.bt); else P.sel.delete(t.dataset.bt);
    const x = $('#bt-extra'); if (x) P.extra = x.value;
    redraw();
  });
  document.addEventListener('input', e => { if (e.target.id === 'bt-extra') fresh().extra = e.target.value; });
  document.addEventListener('click', e => {
    const r = e.target.closest('#bt-box [data-bt-run]'); if (r) return run();
    const g = e.target.closest('#bt-box [data-bt-go]'); if (g) { e.preventDefault(); S.workflow?.focus(g.dataset.btGo); }
  });
  S.tasks = { html, run, get state() { return fresh(); } };
})();
