// S22 M153 (C25): thanh Hỏi Claude dưới khung xem trước — một lối vào cho mọi câu hỏi Claude, ở mọi bước trừ Cài đặt, cả hai chế độ.
//   Phạm vi (chip): khoảng chọn trên timeline (Shift + kéo trên thước) → element / clip đang chọn → bước. Lõi thuần 75_ask.core.js.
//   Gợi ý nhanh (3–4 theo phạm vi) chạy thẳng một việc, không gọi bộ định tuyến. Câu tự do → POST /api/ask: mô hình chọn một việc
//   trong danh sách của phạm vi (kiểm tham số ở server và ở đây), không khớp thì trả lời bằng chữ, không sửa gì.
//   Việc đã nối: Dựng cả video / một đoạn (AI dựng, Tự động b-roll / âm thanh, chuyển cảnh), element (luồng M149 của 72_elem_ai),
//   clip (chuyển cảnh vào clip). M154 — bước khác gọi hàm sẵn có của panel: Chuẩn bị (Studio.brandAi, Studio.products.ai → ô Gợi ý
//   bằng AI), Nguồn (S.ai.cleanup, S.transcript.review, kịch bản /api/script, Studio.longform.highlights, hook mở đầu = Studio.assist
//   'text' → 3 biến thể), Kiểm tra (S.qc.fixAll, giải thích lỗi qua bộ định tuyến, S.qc.variants, ghi chú ghim S.pins), Xuất và đăng
//   (Studio.publish.write / cover, Studio.schedule.next). Kết quả sửa video qua Studio.review: xem trước,
//   Nhận = một bước ⌘Z, Bỏ = như cũ. Chỉ gọi mô hình khi người dùng gửi (C23). Phím / mở thanh; ✦ trên thanh nổi và đầu Thuộc tính.
'use strict';
(() => {
  const S = window.Studio, AC = window.AskCore;
  if (!S || !AC) return;
  const { $, esc } = S;
  const OWNER = 'ask';
  const css = document.createElement('style');
  css.textContent = `
#askbar { flex: none; display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2) var(--space-3); border-top: 1px solid rgb(var(--color-line)); background: rgb(var(--color-surface)); min-width: 0; }
#askbar[hidden] { display: none; }
#askbar .ask-row { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
#askbar .ask-ic { color: rgb(var(--color-accent-text)); flex: none; }
#askbar .ask-chip { flex: none; display: inline-flex; align-items: center; gap: var(--space-1); max-width: 40%; height: 26px; padding: 0 var(--space-2); border-radius: var(--radius-pill);
  border: 1px solid rgb(var(--color-line-strong)); background: rgb(var(--color-surface-raised)); font-size: var(--text-2xs); font-weight: 600; color: rgb(var(--color-fg-muted)); }
#askbar .ask-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
#askbar .ask-chip button { border: 0; background: none; padding: 0; height: 18px; width: 18px; justify-content: center; color: rgb(var(--color-fg-subtle)); }
#askbar .ask-chip button:hover { color: rgb(var(--color-fg)); }
#askbar input[data-ask-in] { flex: 1; min-width: 0; height: 30px; }
#askbar .ask-quick { display: flex; flex-wrap: wrap; gap: var(--space-1); min-width: 0; }
#askbar .ask-quick button { height: 24px; padding: 0 var(--space-2); font-size: var(--text-2xs); border-radius: var(--radius-pill); }
#askbar .ask-out:empty { display: none; }
#askbar .ask-out { max-height: min(200px, 26vh); overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-1); } /* khung xem không bị ép mất */
#askbar .ask-st { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); color: rgb(var(--color-fg-muted)); }
#askbar .ask-st .ti-loader-2, #askbar .eai-st .ti-loader-2, #askbar .eai-var .th .ti-loader-2 { animation: ui-spin 1s linear infinite; }
#askbar .ask-reply { display: flex; align-items: flex-start; gap: var(--space-2); font-size: var(--text-xs); line-height: 1.45; color: rgb(var(--color-fg)); }
#askbar .ask-reply p { margin: 0; flex: 1; min-width: 0; overflow-wrap: anywhere; }
#askbar .ask-reply .ti { color: rgb(var(--color-accent-text)); margin-top: 2px; }
#askbar .ask-err { font-size: var(--text-xs); color: rgb(var(--color-danger-text)); }
#askbar .ask-warn { font-size: var(--text-2xs); color: rgb(var(--color-warning-text)); }
#askbar .acts { display: flex; gap: var(--space-2); flex-wrap: wrap; margin: 0; }
#askbar .eai-vars { flex-direction: row; }
#askbar .eai-var { flex: 1; grid-template-columns: 56px minmax(0, 1fr); }
#askbar .eai-vars.wide .eai-var { grid-template-columns: 96px minmax(0, 1fr); }
#askbar .eai-vars.wide .eai-var .th { grid-row: span 3; }
#insp .eai-note { font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); margin-top: var(--space-1); }
#insp [data-askopen] kbd, #askbar kbd { font-size: var(--text-2xs); padding: 0 var(--space-1); border-radius: var(--radius-xs); border: 1px solid rgb(var(--color-line-strong)); color: rgb(var(--color-fg-muted)); }
.cbar button.ask { color: rgb(var(--color-accent-text)); }
#tlinner .ask-range { position: absolute; top: 0; bottom: 0; z-index: 2; pointer-events: none; background: rgb(var(--color-accent-soft) / .18);
  border-left: 1px solid rgb(var(--color-accent)); border-right: 1px solid rgb(var(--color-accent)); }
#tlinner .ask-range[hidden] { display: none; }`;
  document.head.appendChild(css);

  // st: idle | running (đang hỏi bộ định tuyến) | working (đang chạy việc) | reply | error
  // acts: nút đi kèm câu trả lời [{ label, icon, run }] (vd. "Mở Lịch đăng", "Giao Claude sửa hết")
  const AS = { st: 'idle', step: '', reply: '', err: '', errKind: '', warnings: [], acts: [], run: 0, range: null, sig: '' };

  // ---------- phạm vi ----------
  const step = () => S.workflow?.step || 'build';
  function selInfo() {
    const c = S.sel; if (!c) return null;
    if (c.kind === 'clip') return { kind: 'clip', cid: c.obj.cid || '', idx: c.idx | 0, t0: c.t0, t1: c.t1 };
    if (!AC.ELEM_KINDS.includes(c.kind)) return null;
    const text = c.obj.text || (Array.isArray(c.obj.words) ? c.obj.words.map(w => w.w).join(' ') : '');
    return { kind: c.kind, cid: c.obj.cid || '', label: String(c.label || ''), text, t0: c.t0, t1: c.t1, knobs: !!S.elemAi?.knobsOk(c) };
  }
  const scope = () => AC.scopeOf({ step: step(), sel: selInfo(), range: AS.range, qc: !!S.qc?.last });
  const info = () => ({ duration: S.TL?.duration || 0, clips: S.TL?.clips?.length || 0, scenes: S.TL?.scenes?.length || 0, captions: (S.CAP || []).length, pack: S.TL?.pack || '',
    ...(step() === 'check' && S.qc?.brief ? { qc: S.qc.brief() } : {}) });
  const elemShown = sc => sc?.kind === 'elem' && S.elemAi && (S.elemAi.cid === sc.cid || S.review?.owner === 'elem_ai') && S.elemAi.st !== 'idle';

  // ---------- thanh ----------
  const bar = document.createElement('div');
  bar.id = 'askbar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Hỏi Claude');
  bar.innerHTML = `<div class="ask-row"><i class="ti ti-sparkles ask-ic" aria-hidden="true"></i><span class="ask-chip" title="Phạm vi đang hỏi"></span>
    <input data-ask-in type="text" maxlength="300" placeholder="Hỏi Claude…  ( / )" aria-label="Hỏi Claude">
    <button class="primary" data-ask="send" title="Gửi (Enter)" aria-label="Gửi"><i class="ti ti-send"></i></button></div>
    <div class="ask-quick" role="group" aria-label="Gợi ý nhanh"></div><div class="ask-out" aria-live="polite"></div>`;
  ($('#controls') || $('#stagewrap'))?.after(bar);
  const inp = bar.querySelector('[data-ask-in]'), chipEl = bar.querySelector('.ask-chip'), quickEl = bar.querySelector('.ask-quick'), outEl = bar.querySelector('.ask-out');
  const refit = () => window.dispatchEvent(new Event('resize'));
  requestAnimationFrame(refit);

  const busy = () => AS.st === 'running' || AS.st === 'working' || S.elemAi?.st === 'running';
  function paintScope(sc) {
    chipEl.innerHTML = sc ? `<i class="ti ${sc.icon}"></i><span>${esc(sc.chip)}</span>${sc.kind === 'range' ? '<button data-ask="unrange" title="Bỏ khoảng chọn (Esc)" aria-label="Bỏ khoảng chọn"><i class="ti ti-x"></i></button>' : ''}` : '';
    const b = busy();
    quickEl.innerHTML = sc ? AC.quickOf(sc).map((q, i) => `<button data-askq="${i}" ${b ? 'disabled' : ''}><i class="ti ${q.icon}"></i> ${esc(q.label)}</button>`).join('') : '';
    inp.placeholder = sc ? `Hỏi Claude về ${sc.kind === 'video' ? 'cả video' : sc.kind === 'step' ? 'bước này' : sc.chip}…  ( / )` : 'Hỏi Claude…';
    bar.querySelector('[data-ask="send"]').disabled = b;
  }
  const warnHtml = w => (w || []).length ? `<div class="ask-warn"><i class="ti ti-alert-triangle"></i> ${esc(w.slice(0, 3).join('; '))}</div>` : '';
  function outHtml(sc) {
    if (AS.st === 'running' || AS.st === 'working') return `<div class="ask-st" role="status"><i class="ti ti-loader-2"></i><span class="ask-step">${esc(AS.step || 'Đang chạy…')}</span></div>
      ${AS.st === 'running' ? '<div class="acts"><button data-ask="cancel"><i class="ti ti-x"></i> Huỷ</button></div>' : ''}`;
    if (AS.st === 'error') {
      const setup = ['missing', 'login', 'quota', 'model', 'exit'].includes(AS.errKind);
      return `<div class="ask-err" role="alert"><i class="ti ti-alert-circle"></i> ${esc(AS.err || 'Có lỗi')}</div><div class="acts">${setup ? '<button data-ask="engines"><i class="ti ti-cpu"></i> Mở Mô hình & giọng</button>' : ''}<button data-ask="dismiss">Đóng</button></div>`;
    }
    if (AS.st === 'reply') return `<div class="ask-reply"><i class="ti ti-message-circle"></i><p>${esc(AS.reply)}</p><button class="ghost icon" data-ask="dismiss" title="Đóng" aria-label="Đóng"><i class="ti ti-x"></i></button></div>${warnHtml(AS.warnings)}
      ${AS.acts.length ? `<div class="acts">${AS.acts.map((a, i) => `<button data-askact="${i}"><i class="ti ${a.icon || 'ti-arrow-right'}"></i> ${esc(a.label)}</button>`).join('')}</div>` : ''}`;
    if (elemShown(sc)) return S.elemAi.html();
    return '';
  }
  function paint(force) {
    const sc = scope();
    bar.hidden = !sc;
    if (!sc) return;
    paintScope(sc);
    const h = outHtml(sc);
    if (force || h !== outEl.dataset.h) { outEl.innerHTML = h; outEl.dataset.h = h; }
    paintRange();
  }
  // Vẽ lại khi phạm vi đổi (chọn element, đổi bước, khoảng chọn); rẻ: so một chuỗi
  function check() {
    const sc = scope(), sig = JSON.stringify([sc?.kind, sc?.chip, sc?.cid, sc?.knobs, sc?.qc, step(), busy(), S.PPS, AS.range]);
    const was = !bar.hidden;
    // đổi bước: câu trả lời / lỗi của bước trước không còn đúng chỗ (vd. "Dán link trang bán…" khi đã sang Kiểm tra)
    if (AS.at !== step()) { AS.at = step(); if (AS.st === 'reply' || AS.st === 'error') Object.assign(AS, { st: 'idle', reply: '', err: '', acts: [], warnings: [] }); }
    if (sig !== AS.sig) { AS.sig = sig; paint(); if (was === bar.hidden) refit(); } // hiện / ẩn thanh → khung xem co giãn lại
  }
  S._ov.push(check);
  document.addEventListener('click', () => requestAnimationFrame(check), true);
  document.addEventListener('keyup', () => requestAnimationFrame(check), true);

  // ---------- khoảng chọn trên timeline: Shift + kéo trên thước ----------
  const tlinner = $('#tlinner'), ruler = $('#ruler');
  const rangeEl = document.createElement('div'); rangeEl.className = 'ask-range'; rangeEl.hidden = true;
  tlinner?.appendChild(rangeEl);
  function paintRange() {
    const r = AS.range, pps = S.PPS || 0;
    if (!r || !pps || Math.abs(r.b - r.a) < 0.2) { rangeEl.hidden = true; return; }
    if (!rangeEl.isConnected) tlinner?.appendChild(rangeEl);
    rangeEl.hidden = false;
    rangeEl.style.left = Math.min(r.a, r.b) * pps + 'px'; rangeEl.style.width = Math.abs(r.b - r.a) * pps + 'px';
  }
  const tAt = x => { const b = tlinner.getBoundingClientRect(); return Math.max(0, Math.min(S.TL?.duration || 0, (x - b.left) / (S.PPS || 60))); };
  ruler?.addEventListener('mousedown', e => {
    if (!e.shiftKey || e.button !== 0) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const a = tAt(e.clientX); AS.range = { a, b: a }; paintRange();
    const mv = ev => { AS.range.b = tAt(ev.clientX); paintRange(); };
    const up = () => {
      window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
      const r = AS.range; if (!r || Math.abs(r.b - r.a) < 0.2) AS.range = null;
      else AS.range = { a: Math.round(Math.min(r.a, r.b) * 100) / 100, b: Math.round(Math.max(r.a, r.b) * 100) / 100 };
      check();
    };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  }, true);
  function clearRange() { AS.range = null; check(); }

  // ---------- chạy việc ----------
  const snap = () => JSON.stringify({ TL: S.TL, CAP: S.CAP || [] });
  const setOut = (st, o = {}) => { Object.assign(AS, { st, step: '', reply: '', err: '', errKind: '', warnings: [], acts: [] }, o); paint(true); check(); };
  // Thay nội dung một bản timeline / phụ đề bằng bản mới (giữ nguyên đối tượng: review áp lên bản sao hoặc S.TL / S.CAP thật)
  function replaceIn(tl, cap, A) {
    const t = JSON.parse(JSON.stringify(A.TL)), c = JSON.parse(JSON.stringify(A.CAP));
    for (const k of Object.keys(tl)) delete tl[k];
    Object.assign(tl, t); cap.splice(0, cap.length, ...c);
    return true;
  }
  function openReview(title, sub, items) {
    S.review?.open({ owner: OWNER, title, mode: 'list', items,
      onAccept: (its, n) => S.toast(n ? `Đã nhận “${its[0].label}” · ⌘Z để hoàn tác` : 'Không áp được'),
      onClose: () => check() });
    setOut('idle');
  }
  // Việc chạy bằng hàm sẵn có ghi thẳng vào timeline (AI dựng, Tự động): chạy, chụp bản mới, trả timeline về như cũ (lưu lại bản cũ
  // vì job phía server đã ghi bản mới), rồi đưa bản mới qua Studio.review.
  async function viaReview(title, run, then) {
    if (S.review?.active) S.review.close('replaced');
    const before = snap();
    setOut('working', { step: `Đang chạy ${title}…` });
    let res;
    try { res = await run(); } catch (e) { res = { error: e.message }; }
    const after = snap();
    if (after === before) return res?.error ? setOut('error', { err: res.error }) : setOut('reply', { reply: `${title}: không có gì thay đổi.` });
    const B = JSON.parse(before), A = JSON.parse(after);
    S.TL = B.TL; S.CAP = B.CAP; S.changed(true);
    await S.saveNow();
    const span = AC.changedSpan(B, A) || { t0: 0, t1: Math.min(6, S.TL.duration || 6) };
    openReview(title, '', [{ label: title, sub: res?.sub || '', t0: span.t0, t1: span.t1, apply: (tl, cap) => replaceIn(tl, cap, A) }]);
    then?.();
  }
  // Việc thuần (chuyển cảnh): áp trên bản sao để đếm, rồi mở xem lại
  function pureReview(title, t0, t1, apply) {
    const tl = JSON.parse(JSON.stringify(S.TL)), n = apply(tl);
    if (!n) return setOut('reply', { reply: `${title}: không có chỗ nào để đổi.` });
    const span = AC.changedSpan({ TL: S.TL, CAP: [] }, { TL: tl, CAP: [] }) || { t0, t1 }; // phát lặp đúng chỗ nối đổi đầu tiên → cuối
    openReview(title, '', [{ label: title, sub: typeof n === 'number' ? `${n} chỗ nối` : '', t0: span.t0, t1: span.t1, apply: tl2 => !!apply(tl2) }]);
  }
  const needCapQuiet = () => !(S.CAP || []).length;
  const needCap = () => (!(S.CAP || []).length ? (setOut('reply', { reply: 'Cần phụ đề trước: bước Nguồn → Lời thoại → Tạo phụ đề.' }), true) : false);

  // ---------- M154: việc của các bước khác Dựng ----------
  // Mở một panel của bước đang ở, không đổi chế độ (Cơ bản vẫn mở được panel Chuyên nghiệp: thanh trái hiện nó khi đang mở)
  const openP = id => (typeof window.openPanel === 'function' ? window.openPanel(id) : S.workflow?.focus(id));
  // Hàm của panel trả { started } | { need } | { error }: need / error → nói ngay trên thanh; started → một câu chỉ chỗ có kết quả
  async function viaPanel(fn, where) {
    if (typeof fn !== 'function') return setOut('error', { err: 'Chưa có công cụ này' });
    setOut('working', { step: 'Đang mở…' });
    let r; try { r = await fn(); } catch (e) { r = { error: e.message }; }
    if (r?.error) return setOut('error', { err: r.error });
    if (r?.need) return setOut('reply', { reply: r.need });
    return where ? setOut('reply', { reply: where }) : setOut('idle');
  }
  const speech = (t0, t1) => (S.CAP || []).flatMap(c => c.words || []).filter(w => w.s >= t0 && w.s < t1).map(w => w.w).join(' ').trim();
  // Hook mở đầu: Studio.assist('text', viết) theo lời thoại 15 s đầu → 3 câu thành 3 biến thể của Studio.review (chữ lớn 0–2,5 s)
  async function writeHook() {
    if (needCap()) return;
    if (!S.assist) return setOut('error', { err: 'Chưa có trợ lý AI' });
    const context = speech(0, 15) || speech(0, 60);
    if (!context) return setOut('reply', { reply: 'Chưa có lời thoại ở đầu video để viết hook.' });
    setOut('working', { step: 'Claude đang viết hook…' });
    let res;
    try {
      const purpose = (await S.onboardingPurpose?.().catch(() => '')) || '';
      res = await S.assist('text', { mode: 'write', context, brand: S.TL?.brand || {}, purpose, max: 40 }, { onStep: s => { AS.step = s; const el = outEl.querySelector('.ask-step'); if (el) el.textContent = s; } });
    } catch (e) { return setOut('error', { err: e.message, errKind: e.kind || '' }); }
    const lines = (res?.fields || []).map(f => String(typeof f.value === 'string' ? f.value : f.value?.text || '').trim()).filter(Boolean).slice(0, 3);
    if (!lines.length) return setOut('reply', { reply: 'Claude chưa viết được hook nào. Thử lại sau.' });
    const t1 = Math.min(S.TL?.duration || 2.5, 2.5), tall = S.DH > S.DW;
    // chữ của engine không tự xuống dòng (nowrap): cỡ chữ co theo độ dài để vừa ~90% bề ngang khung
    const fit = text => Math.max(28, Math.min(tall ? 72 : 64, Math.floor((S.DW || 720) * 0.9 / (Math.max(1, [...text].length) * 0.56))));
    const scene = text => ({ type: 'text', t0: 0, t1, added: true, _ai: true, lines: [{ text, t: 0, y: tall ? 520 : 300, ...(tall ? {} : { x: 640 }), style: 'yellow', size: fit(text), anim: 'pop' }] });
    S.review?.open({ owner: OWNER, title: 'Hook mở đầu', mode: 'variants', pick: 0,
      items: lines.map(l => ({ label: l, sub: 'chữ lớn 0–2,5 s', t0: 0, t1, apply: tl => { (tl.scenes ||= []).push(scene(l)); return true; } })),
      onAccept: (its, n) => S.toast(n ? `Đã thêm hook “${its[0].label}” · ⌘Z để hoàn tác` : 'Không áp được'), onClose: () => check() });
    setOut('idle');
  }
  // Phụ đề theo kịch bản đã lưu (19_script.js "Dùng kịch bản"): chạy lại qua /api/script rồi xem trước; chưa có kịch bản → mở ô Kịch bản
  async function matchScript() {
    const cur = await S.api('/api/script').catch(() => null), sc = cur?.script;
    if (!sc?.text) {
      openP('wf-new'); S.workflow?.focus?.('wf-new', '#wf-script textarea');
      return setOut('reply', { reply: 'Chưa có kịch bản: dán vào ô Kịch bản (bước Nguồn) rồi bấm Dùng kịch bản, hoặc hỏi lại sau khi dán.' });
    }
    if (needCap()) return;
    return viaReview('Phụ đề theo kịch bản', async () => {
      if (!await S.saveNow()) return { error: 'Chưa lưu được dự án' };
      const r = await S.api('/api/script', { text: sc.text, name: sc.name || '' });
      if (r.error) return { error: r.error };
      if (r.pending) return { error: 'Chưa có lời thoại nhận dạng: tạo phụ đề trước rồi khớp kịch bản.' };
      await S.reload?.();
      return { sub: `${r.captions} dòng phụ đề theo chữ kịch bản` };
    });
  }
  // Sửa hết lỗi kiểm tra (16_qc.js, job qc fix) → một mục xem lại; còn ghi chú ghim (M150) thì nhắc và giao luôn cho Claude
  function fixAll() {
    if (!S.qc?.fixAll) return setOut('error', { err: 'Chưa có công cụ Kiểm tra' });
    return viaReview('Sửa hết lỗi kiểm tra', async () => {
      const r = await S.qc.fixAll();
      if (r.error) return { error: r.error };
      const c = r.q?.counts || {};
      return { sub: `${c.fixed || 0} lỗi đã sửa${c.new ? `, ${c.new} phát sinh` : ''}${c.high ? `, còn ${c.high} lỗi nặng` : ''}` };
    }, () => {
      const n = S.pins?.open?.() || 0;
      if (n) setOut('reply', { reply: `Còn ${n} ghi chú ghim trên khung máy không tự sửa được.`, acts: [{ label: 'Giao Claude sửa hết', icon: 'ti-wand', run: () => S.pins.give() }] });
    });
  }
  async function postTime(p) {
    if (!S.schedule?.next) return setOut('error', { err: 'Chưa có Lịch đăng' });
    const r = await S.schedule.next(p.platform).catch(e => ({ error: e.message }));
    if (r.error) return setOut('error', { err: r.error });
    setOut('reply', { reply: `Giờ trống kế tiếp cho ${AC.PLAT_VI[p.platform] || p.platform}: ${r.label} (khung giờ của lịch: ${r.slots.join(', ')}).`,
      acts: [{ label: 'Mở Lịch đăng', icon: 'ti-calendar', run: () => openP('schedule') }] });
  }

  async function runAction(pick, sc) {
    const p = pick.params || {}, dur = S.TL?.duration || 0;
    switch (pick.action) {
      case 'answer': return setOut('reply', { reply: pick.reply || 'Chưa có việc nào khớp.', warnings: pick.warnings });
      case 'elem_edit': case 'elem_variants': case 'elem_knobs': {
        if (!S.elemAi || !S.sel || S.sel.obj.cid !== sc.cid) return setOut('error', { err: 'Element đã bỏ chọn. Chọn lại rồi hỏi.' });
        setOut('idle');
        return S.elemAi.go(pick.action === 'elem_edit' ? 'edit' : pick.action === 'elem_variants' ? 'variants' : 'knobs', p.ask);
      }
      case 'transitions': {
        const r = sc.kind === 'range' ? { a: sc.a, b: sc.b } : null, nm = p.type === 'none' ? 'Bỏ chuyển cảnh' : `Chuyển cảnh ${AC.TRANS_VI[p.type] || p.type}`;
        return pureReview(r ? `${nm} trong ${sc.chip}` : `${nm} mọi chỗ nối`, r ? r.a : 0, r ? r.b : Math.min(dur, 8), tl => AC.transitionsApply(tl, p, r));
      }
      case 'clip_transition': {
        const nm = p.type === 'none' ? 'Bỏ chuyển cảnh' : `Chuyển cảnh ${AC.TRANS_VI[p.type] || p.type}`;
        return pureReview(`${nm} vào ${sc.chip}`, Math.max(0, sc.t0 - 0.6), sc.t0 + 0.8, tl => AC.clipTransitionApply(tl, sc.idx, p));
      }
      case 'autofill': {
        if (!S.autofill) return setOut('error', { err: 'Chưa có công cụ Tự động' });
        if (p.mode !== 'sfx' && needCap()) return;
        const nm = { all: 'Thêm b-roll + âm thanh', broll: 'Thêm b-roll', sfx: 'Thêm nhạc & SFX' }[p.mode] || 'Tự động';
        return viaReview(nm, async () => { const out = await S.autofill.run(p.mode, { noUndo: true }); return out ? {} : { error: 'Chưa tự thêm được' }; });
      }
      case 'ai_build': {
        if (!S.ai?.build) return setOut('error', { err: 'Chưa có AI dựng' });
        if (needCap()) return;
        return viaReview('AI dựng', () => S.ai.build({ extra: p.extra || '', density: p.density }));
      }
      case 'open_panel': {
        setOut(pick.reply ? 'reply' : 'idle', { reply: pick.reply || '' });
        return S.workflow?.focus(p.panel);
      }
      // ---- M154 ----
      case 'brand_ai': return viaPanel(S.brandAi && (() => S.brandAi({ website: p.website })), 'Claude đang gợi ý bộ thương hiệu: đề xuất hiện ở ô Gợi ý bằng AI của panel Thương hiệu, Nhận từng mục rồi Lưu.');
      case 'product_ai': return viaPanel(S.products?.ai && (() => S.products.ai({ url: p.url })), 'Claude đang viết hồ sơ sản phẩm: đề xuất ở ô Điền bằng AI của panel Sản phẩm, Nhận từng mục rồi Lưu.');
      case 'clean_speech': return viaPanel(S.ai?.cleanup && (() => S.ai.cleanup({ claude: p.claude === 'co' })), 'Đang dò lỗi nói: chỗ cắt hiện ở panel Làm sạch lời nói, bỏ tick chỗ muốn giữ rồi bấm Cắt tất cả đã chọn.');
      case 'fix_words': return viaPanel(S.transcript?.review && (() => { if (needCapQuiet()) return { need: 'Cần phụ đề trước: bước Nguồn → Lời thoại → Tạo phụ đề.' }; openP('words'); S.transcript.review(); return { started: true }; }),
        'Claude đang soát lời thoại: đề xuất là chữ gạch sóng ở panel Lời thoại, Nhận hoặc Bỏ từng chỗ.');
      case 'match_script': return matchScript();
      case 'find_highlights': return viaPanel(S.longform?.highlights && (() => S.longform.highlights(p)), '');
      case 'write_hook': return writeHook();
      case 'qc_fix_all': return fixAll();
      case 'ab_hooks': return viaPanel(S.qc?.variants && (async () => { if (!await S.saveNow()) return { error: 'Chưa lưu được dự án' }; openP('wf-qc'); S.qc.variants(p.kind); return { started: true }; }), '');
      case 'publish_write': return viaPanel(S.publish?.write && (() => S.publish.write(p)), '');
      case 'cover': return viaPanel(S.publish?.cover && (() => S.publish.cover()), '');
      case 'post_time': return postTime(p);
    }
    return setOut('reply', { reply: pick.reply || 'Chưa làm được việc này.' });
  }

  // Câu tự do → bộ định tuyến (server), kiểm lại ở đây bằng đúng phạm vi đang hiện
  async function send() {
    const ask = inp.value.trim(), sc = scope();
    if (!sc || busy()) return;
    if (!ask) { inp.focus(); return; }
    setOut('running', { step: 'Đang gửi…' });
    const r = await S.api('/api/ask', { ask, step: step(), sel: selInfo(), range: AS.range, info: info() }).catch(e => ({ error: e.message }));
    if (!r.ok) return setOut('error', { err: r.error || 'Không gửi được' });
    AS.run = r.run; poll(r.run, sc);
  }
  async function poll(run, sc) {
    const r = await S.api('/api/ask').catch(() => null);
    if (run !== AS.run || AS.st !== 'running') return;
    if (!r || r.state === 'running') {
      if (r?.step && r.step !== AS.step) { AS.step = r.step; const s = outEl.querySelector('.ask-step'); if (s) s.textContent = r.step; }
      return setTimeout(() => poll(run, sc), 700);
    }
    if (r.state !== 'done') return setOut(r.state === 'cancelled' ? 'idle' : 'error', { err: r.error, errKind: r.kind || '' });
    const now = scope();
    if (!now || now.kind !== sc.kind || (now.cid || '') !== (sc.cid || '')) return setOut('reply', { reply: 'Phạm vi đã đổi trong lúc chờ nên chưa làm gì. Hỏi lại nhé.' });
    const pick = AC.checkPick(r, sc); // kiểm lần hai bằng bảng việc của trình duyệt
    inp.value = '';
    runAction(pick, sc);
  }
  async function cancel() { await S.api('/api/ask/cancel', {}).catch(() => {}); AS.run++; setOut('idle'); }

  // ---------- sự kiện ----------
  bar.addEventListener('click', e => {
    const q = e.target.closest('[data-askq]');
    if (q && !q.disabled) {
      const sc = scope(), it = AC.quickOf(sc)[+q.dataset.askq]; if (!it) return;
      if (it.ask) { inp.value = it.ask; return send(); } // gợi ý là một câu hỏi (vd. Giải thích lỗi): qua bộ định tuyến như khi gõ
      runAction({ action: it.action, params: it.params, reply: '' }, sc); return;
    }
    const ac = e.target.closest('[data-askact]');
    if (ac) { const f = AS.acts[+ac.dataset.askact]?.run; setOut('idle'); f?.(); return; }
    const a = e.target.closest('[data-ask]')?.dataset.ask; if (!a) return;
    if (a === 'send') return send();
    if (a === 'cancel') return cancel();
    if (a === 'unrange') return clearRange();
    if (a === 'dismiss') return setOut('idle');
    if (a === 'engines') { const b = document.getElementById('eng-btn'); if (b) b.click(); else S.toast('Mở menu ⋯ → Mô hình & giọng'); }
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (AS.range) clearRange(); inp.blur(); }
  });
  window.addEventListener('keydown', e => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const ae = document.activeElement;
    if (/INPUT|TEXTAREA|SELECT/.test(ae?.tagName || '') || ae?.isContentEditable || S.editing) return;
    if (!document.getElementById('modal')?.hidden) return;
    e.preventDefault(); open();
  });
  function open() {
    check();
    if (bar.hidden) return S.toast('Cài đặt không có thanh Hỏi Claude');
    inp.focus(); inp.select();
  }
  // S23 M164: giao một việc của bước từ nơi khác (popover điểm trên thanh bước, 03_stepscore.js), như bấm gợi ý nhanh.
  // Phạm vi là cả bước (không tính element đang chọn); việc không có trong phạm vi của bước, hoặc thanh đang chạy → false.
  function run(action, params = {}, st = step()) {
    const sc = AC.scopeOf({ step: st, qc: !!S.qc?.last });
    if (!sc || busy() || !AC.actionsOf(sc).some(a => a.id === action)) return false;
    check();
    runAction({ action, params: { ...params }, reply: '' }, sc);
    return true;
  }
  S.ask = { open, run, refresh: () => paint(true), get range() { return AS.range; }, clearRange };
  requestAnimationFrame(() => paint(true));
})();
