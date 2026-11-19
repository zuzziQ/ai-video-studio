// S22 M153 (C25): thanh Hỏi Claude dưới khung xem trước — một lối vào cho mọi câu hỏi Claude, ở mọi bước trừ Cài đặt, cả hai chế độ.
//   Phạm vi (chip): khoảng chọn trên timeline (Shift + kéo trên thước) → element / clip đang chọn → bước. Lõi thuần 75_ask.core.js.
//   Gợi ý nhanh (3–4 theo phạm vi) chạy thẳng một việc, không gọi bộ định tuyến. Câu tự do → POST /api/ask: mô hình chọn một việc
//   trong danh sách của phạm vi (kiểm tham số ở server và ở đây), không khớp thì trả lời bằng chữ, không sửa gì.
//   Việc đã nối: Dựng cả video / một đoạn (AI dựng, Tự động b-roll / âm thanh, chuyển cảnh), element (luồng M149 của 72_elem_ai),
//   clip (chuyển cảnh vào clip). M154 — bước khác gọi hàm sẵn có của panel: Chuẩn bị (Studio.brandAi, Studio.products.ai → ô Gợi ý
//   bằng AI), Nguồn (S.ai.cleanup, S.transcript.review, kịch bản /api/script, Studio.longform.highlights, hook mở đầu = Studio.assist
//   'text' → 3 biến thể), Kiểm tra (S.qc.fixAll, giải thích lỗi qua bộ định tuyến, S.qc.variants, ghi chú ghim S.pins), Xuất và đăng
//   (Studio.publish.write / cover, Studio.schedule.next). Kết quả sửa video qua Studio.review: xem trước,
//   Nhận = một bước ⌘Z, Bỏ = như cũ. Chỉ gọi mô hình khi người dùng gửi (C23).
// S24 M170 (C34, C35): một dạng — nội dung nằm trong tab Claude của cột phải (Studio.right.addTab('claude'), mọi khổ × chế độ);
//   bỏ dòng dưới khung và cột cạnh khung của M163. #askbar giữ nguyên id (72_elem_ai.js vẽ bên trong), không dời #insp / #rvbar
//   nữa: thanh Nhận / Bỏ của Studio.review luôn ngay dưới khung (place()). Phím / và nút ✦ (#askbtn, thanh nút phát) mở tab
//   Claude (bỏ ⤢ / mở cột phải đang gấp qua Studio.layout.revealRight) rồi đặt con trỏ vào ô hỏi.
// S24 M171: tab là một luồng hỏi đáp của dự án — mỗi lượt (câu hỏi / gợi ý nhanh / việc giao từ nơi khác) thành một mục xếp theo
//   thời gian, cuộn được, lưu .studio/ask_log.json qua /api/ask/log (AskCore.logPush: 200 lượt, không lưu ảnh). Kết quả sửa video là
//   thẻ có nút Xem: mở lại Studio.review (thanh Nhận / Bỏ #rvbar vẫn dưới khung); thẻ nhớ Đã nhận / Đã bỏ; việc ghi đè cả timeline
//   (AI dựng, Tự động, Sửa hết lỗi) không Xem lại được khi video đã đổi. Ô đề xuất (đang chạy, đề xuất element của 72_elem_ai)
//   nằm ngay dưới luồng; ô hỏi + chip phạm vi + gợi ý nhanh dính đáy tab.
// S24 M173 (C37): phạm vi vùng (AS.region, đặt bởi Hỏi ngay của chế độ chú thích 73_pins.js qua Studio.ask.askNow; một lượt rồi
//   bỏ); server cắt ảnh vùng tại t. Danh sách chú thích (73_pins.js vẽ) nằm ở .ask-notes ngay dưới đầu tab.
'use strict';
(() => {
  const S = window.Studio, AC = window.AskCore;
  if (!S || !AC) return;
  const { $, esc } = S;
  const OWNER = 'ask';
  const css = document.createElement('style');
  css.textContent = `
#askbar { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); background: rgb(var(--color-surface)); min-width: 0; }
#askbar[hidden] { display: none; }
#askbar .ask-head { display: flex; align-items: baseline; gap: var(--space-2); font-size: var(--text-sm); }
#askbar .ask-head .ti { color: rgb(var(--color-accent-text)); align-self: center; }
#askbar .ask-head span { font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); }
#insp .ask-none { padding: var(--space-4); font-size: var(--text-xs); color: rgb(var(--color-fg-muted)); }
#insp .ask-none[hidden] { display: none; }
#askbtn { color: rgb(var(--color-accent-text)); }
#askbar .ask-row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); min-width: 0; }
#askbar .ask-chip { order: -1; flex: none; display: inline-flex; align-items: center; gap: var(--space-1); max-width: 100%; height: 26px; padding: 0 var(--space-2); border-radius: var(--radius-pill);
  border: 1px solid rgb(var(--color-line-strong)); background: rgb(var(--color-surface-raised)); font-size: var(--text-2xs); font-weight: 600; color: rgb(var(--color-fg-muted)); }
#askbar .ask-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
#askbar .ask-chip button { border: 0; background: none; padding: 0; height: 18px; width: 18px; justify-content: center; color: rgb(var(--color-fg-subtle)); }
#askbar .ask-chip button:hover { color: rgb(var(--color-fg)); }
#askbar input[data-ask-in] { flex: 1; min-width: 0; height: 30px; }
#askbar .ask-quick { display: flex; flex-wrap: wrap; gap: var(--space-1); min-width: 0; }
#askbar .ask-quick:empty { display: none; }
#askbar .ask-quick button { max-width: 100%; height: 26px; padding: 0 var(--space-2); font-size: var(--text-2xs); border-radius: var(--radius-pill); }
#askbar .ask-out:empty { display: none; }
#askbar .ask-out { display: flex; flex-direction: column; gap: var(--space-1); } /* cột phải cuộn cả tab: không giới hạn cao */
#askbar .ask-st { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); color: rgb(var(--color-fg-muted)); }
#askbar .ask-st .ti-loader-2, #askbar .eai-st .ti-loader-2, #askbar .eai-var .th .ti-loader-2 { animation: ui-spin 1s linear infinite; }
#askbar .ask-reply { display: flex; align-items: flex-start; gap: var(--space-2); font-size: var(--text-xs); line-height: 1.45; color: rgb(var(--color-fg)); }
#askbar .ask-reply p { margin: 0; flex: 1; min-width: 0; overflow-wrap: anywhere; }
#askbar .ask-reply .ti { color: rgb(var(--color-accent-text)); margin-top: 2px; }
#askbar .ask-err { font-size: var(--text-xs); color: rgb(var(--color-danger-text)); }
#askbar .ask-warn { font-size: var(--text-2xs); color: rgb(var(--color-warning-text)); }
#askbar .acts { display: flex; gap: var(--space-2); flex-wrap: wrap; margin: 0; }
#askbar .eai-vars { flex-direction: column; }
#askbar .eai-var { grid-template-columns: 56px minmax(0, 1fr); }
#askbar .eai-vars.wide .eai-var { grid-template-columns: 96px minmax(0, 1fr); }
#askbar .eai-vars.wide .eai-var .th { grid-row: span 3; }
#insp .eai-note { font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); margin-top: var(--space-1); }
#insp [data-askopen] kbd, #askbar kbd { font-size: var(--text-2xs); padding: 0 var(--space-1); border-radius: var(--radius-xs); border: 1px solid rgb(var(--color-line-strong)); color: rgb(var(--color-fg-muted)); }
.cbar button.ask { color: rgb(var(--color-accent-text)); }
#tlinner .ask-range { position: absolute; top: 0; bottom: 0; z-index: 2; pointer-events: none; background: rgb(var(--color-accent-soft) / .18);
  border-left: 1px solid rgb(var(--color-accent)); border-right: 1px solid rgb(var(--color-accent)); }
#tlinner .ask-range[hidden] { display: none; }
/* S24 M171: luồng hỏi đáp — cuộn cùng cột phải (#right), ô đề xuất dưới luồng, ô hỏi + chip + gợi ý nhanh dính đáy cột; câu hỏi bên phải */
#insp[data-rtab="claude"] { display: flex; flex-direction: column; min-height: calc(100% - var(--rtabs-h)); }
#insp[data-rtab="claude"] > #askbar { flex: 1; padding-bottom: 0; }
#askbar .ask-notes:empty { display: none; }
#askbar .ask-thread { flex: 1; display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; padding: var(--space-1) 0; }
#askbar .ask-empty { margin: auto 0; display: flex; flex-direction: column; gap: var(--space-2); font-size: var(--text-xs); line-height: 1.45; color: rgb(var(--color-fg-muted)); }
#askbar .ask-empty p { margin: 0; }
#askbar .ask-msg { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
#askbar .ask-q { align-self: flex-end; max-width: 92%; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
#askbar .ask-q p { margin: 0; padding: var(--space-1) var(--space-2); border-radius: var(--radius-control); background: rgb(var(--color-accent-soft) / .22); font-size: var(--text-xs); line-height: 1.4; color: rgb(var(--color-fg)); overflow-wrap: anywhere; }
#askbar .ask-meta { display: inline-flex; align-items: center; gap: var(--space-1); max-width: 100%; font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#askbar .ask-msg.pending .ask-q p { opacity: .8; }
#askbar .ask-reply.info { color: rgb(var(--color-fg-muted)); }
#askbar .ask-reply.info .ti { color: rgb(var(--color-success-text)); }
#askbar .ask-card { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2); border-radius: var(--radius-control); border: 1px solid rgb(var(--color-line-strong)); background: rgb(var(--color-surface-raised)); min-width: 0; }
#askbar .ask-card .ttl { display: flex; align-items: center; gap: var(--space-2); min-width: 0; font-size: var(--text-xs); }
#askbar .ask-card .ttl .ti { color: rgb(var(--color-accent-text)); }
#askbar .ask-card .ttl b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#askbar .ask-card .st { flex: none; font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); }
#askbar .ask-card[data-st="accepted"] .st { color: rgb(var(--color-success-text)); }
#askbar .ask-card[data-st="view"] { border-color: rgb(var(--color-accent)); }
#askbar .ask-card[data-st="view"] .st { color: rgb(var(--color-accent-text)); }
#askbar .ask-card .sub { font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); overflow-wrap: anywhere; }
#askbar .ask-card .what { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: var(--space-1); }
#askbar .ask-card .what li { padding: 0 var(--space-1); border-radius: var(--radius-xs); background: rgb(var(--color-surface-muted)); font-size: var(--text-2xs); color: rgb(var(--color-fg)); }
#askbar .ask-comp { position: sticky; bottom: 0; z-index: 3; display: flex; flex-direction: column; gap: var(--space-2); margin: 0 calc(-1 * var(--space-3)); padding: var(--space-2) var(--space-3) var(--space-3);
  background: rgb(var(--color-surface)); border-top: 1px solid rgb(var(--color-line)); }`;
  document.head.appendChild(css);

  // st: idle | running (đang hỏi bộ định tuyến) | working (đang chạy việc) | reply | error
  // acts: nút đi kèm câu trả lời [{ label, icon, run }] (vd. "Mở Lịch đăng", "Giao Claude sửa hết")
  const AS = { st: 'idle', step: '', run: 0, range: null, region: null, sig: '' };
  // M171: luồng của dự án. items = các lượt đã xong (AskCore.logEntry); turn = lượt đang chạy (chưa lưu); live: id → { spec, base,
  //   dropped } của thẻ còn Xem được trong phiên này; acts: id → nút đi kèm câu trả lời (hàm, không lưu); viewing = thẻ đang mở xem
  const TH = { items: [], turn: null, live: new Map(), acts: new Map(), viewing: '', h: '', n: 0, saveErr: false };

  // ---------- phạm vi ----------
  const step = () => S.workflow?.step || 'build';
  function selInfo() {
    const c = S.sel; if (!c) return null;
    if (c.kind === 'clip') return { kind: 'clip', cid: c.obj.cid || '', idx: c.idx | 0, t0: c.t0, t1: c.t1 };
    if (!AC.ELEM_KINDS.includes(c.kind)) return null;
    const text = c.obj.text || (Array.isArray(c.obj.words) ? c.obj.words.map(w => w.w).join(' ') : '');
    return { kind: c.kind, cid: c.obj.cid || '', label: String(c.label || ''), text, t0: c.t0, t1: c.t1, knobs: !!S.elemAi?.knobsOk(c) };
  }
  const scope = () => AC.scopeOf({ step: step(), sel: selInfo(), range: AS.range, region: AS.region, qc: !!S.qc?.last });
  const info = () => ({ dw: S.DW || 720, dh: S.DH || 1280, duration: S.TL?.duration || 0, clips: S.TL?.clips?.length || 0, scenes: S.TL?.scenes?.length || 0, captions: (S.CAP || []).length, pack: S.TL?.pack || '',
    ...(step() === 'check' && S.qc?.brief ? { qc: S.qc.brief() } : {}) });
  const elemShown = sc => sc?.kind === 'elem' && S.elemAi && (S.elemAi.cid === sc.cid || S.review?.owner === 'elem_ai') && S.elemAi.st !== 'idle';

  // ---------- thanh ----------
  const bar = document.createElement('div');
  bar.id = 'askbar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Hỏi Claude');
  bar.innerHTML = `<div class="ask-head"><i class="ti ti-sparkles" aria-hidden="true"></i><b>Claude</b><span>làm thay, bạn duyệt</span></div><div class="ask-notes"></div>
    <div class="ask-thread" role="log" aria-label="Hỏi đáp với Claude"></div><div class="ask-out" aria-live="polite"></div>
    <div class="ask-comp"><div class="ask-quick" role="group" aria-label="Gợi ý nhanh"></div><div class="ask-row"><span class="ask-chip" title="Phạm vi đang hỏi"></span>
    <input data-ask-in type="text" maxlength="300" placeholder="Hỏi Claude…  ( / )" aria-label="Hỏi Claude">
    <button class="primary" data-ask="send" title="Gửi (Enter)" aria-label="Gửi"><i class="ti ti-send"></i></button></div></div>`;
  const inp = bar.querySelector('[data-ask-in]'), chipEl = bar.querySelector('.ask-chip'), quickEl = bar.querySelector('.ask-quick'), outEl = bar.querySelector('.ask-out'),
    threadEl = bar.querySelector('.ask-thread');
  // bước không có Hỏi Claude (Cài đặt): tab hiện một dòng thay thanh
  const none = document.createElement('div'); none.className = 'ask-none'; none.hidden = true;
  none.textContent = 'Bước Cài đặt không có Hỏi Claude. Sang một bước khác để hỏi.';

  // ---------- thanh Nhận / Bỏ ngay dưới khung ----------
  // M170: #rvbar (74_review.js) luôn nằm giữa #stagewrap và #controls ở mọi bố cục; 74_review.js gọi place() khi tạo thanh.
  function place() {
    const rv = $('#rvbar'), c = $('#controls');
    if (rv && c && rv.nextElementSibling !== c) c.before(rv);
  }

  // ---------- nút ✦ ở thanh nút phát (cạnh ⤢; thanh co theo container, ai-video-studio-058) ----------
  const btn = document.createElement('button');
  btn.id = 'askbtn'; btn.className = 'icon'; btn.title = 'Hỏi Claude (/): mở tab Claude ở cột phải'; btn.setAttribute('aria-label', 'Hỏi Claude');
  btn.innerHTML = '<i class="ti ti-sparkles"></i>';
  btn.addEventListener('click', () => open());
  $('#expand')?.before(btn);

  const busy = () => AS.st === 'running' || AS.st === 'working' || S.elemAi?.st === 'running';
  function paintScope(sc) {
    chipEl.innerHTML = sc ? `<i class="ti ${sc.icon}"></i><span>${esc(sc.chip)}</span>${sc.kind === 'range' ? '<button data-ask="unrange" title="Bỏ khoảng chọn (Esc)" aria-label="Bỏ khoảng chọn"><i class="ti ti-x"></i></button>' : sc.kind === 'region' ? '<button data-ask="unregion" title="Bỏ vùng (Esc)" aria-label="Bỏ vùng"><i class="ti ti-x"></i></button>' : ''}` : '';
    const b = busy();
    quickEl.innerHTML = sc ? AC.quickOf(sc).map((q, i) => `<button data-askq="${i}" ${b ? 'disabled' : ''}><i class="ti ${q.icon}"></i> ${esc(q.label)}</button>`).join('') : '';
    inp.placeholder = sc ? `Hỏi Claude về ${sc.kind === 'video' ? 'cả video' : sc.kind === 'step' ? 'bước này' : sc.chip}…  ( / )` : 'Hỏi Claude…';
    bar.querySelector('[data-ask="send"]').disabled = b;
  }
  const warnHtml = w => (w || []).length ? `<div class="ask-warn"><i class="ti ti-alert-triangle"></i> ${esc(w.slice(0, 3).join('; '))}</div>` : '';
  // ô đề xuất dưới luồng: việc đang chạy (+ Huỷ), hoặc đề xuất element của 72_elem_ai (cũ → mới, 3 biến thể, Nhận / Bỏ)
  function outHtml(sc) {
    if (AS.st === 'running' || AS.st === 'working') return `<div class="ask-st" role="status"><i class="ti ti-loader-2"></i><span class="ask-step">${esc(AS.step || 'Đang chạy…')}</span></div>
      ${AS.st === 'running' ? '<div class="acts"><button data-ask="cancel"><i class="ti ti-x"></i> Huỷ</button></div>' : ''}`;
    if (elemShown(sc)) return S.elemAi.html();
    return '';
  }
  function paint(force) {
    const sc = scope();
    bar.hidden = !sc; none.hidden = !!sc;
    if (!sc) return;
    paintScope(sc);
    const h = outHtml(sc);
    if (force || h !== outEl.dataset.h) { outEl.innerHTML = h; outEl.dataset.h = h; }
    paintThread(force);
    paintRange();
  }

  // ---------- M171: luồng hỏi đáp ----------
  const hhmm = at => { const d = new Date(at), p = n => String(n).padStart(2, '0'), now = new Date();
    return `${d.toDateString() === now.toDateString() ? '' : `${p(d.getDate())}/${p(d.getMonth() + 1)} `}${p(d.getHours())}:${p(d.getMinutes())}`; };
  const SCOPE_ICON = { region: 'ti-crop', video: 'ti-movie', range: 'ti-arrows-horizontal', elem: 'ti-pointer', clip: 'ti-movie', step: 'ti-route' };
  const CARD_LABEL = { open: 'Chưa nhận', accepted: 'Đã nhận', dropped: 'Đã bỏ', undone: 'Đã hoàn tác', stale: 'Video đã đổi' };
  const spanTxt = c => (c.t1 > c.t0 ? `${c.sub ? ' · ' : ''}${AC.stamp(c.t0)}–${AC.stamp(c.t1)}` : '');
  function qHtml(e) {
    const meta = `<span class="ask-meta"><i class="ti ${SCOPE_ICON[e.scope?.kind] || 'ti-route'}"></i>${esc(e.scope?.chip || '')}${e.at ? ` · ${hhmm(e.at)}` : ''}</span>`;
    return `<div class="ask-q">${meta}${e.q ? `<p>${esc(e.q)}</p>` : ''}</div>`;
  }
  // lượt về một element / clip: nút mở lại đúng mục đó ở tab Thuộc tính để xem giá trị thật sau khi Nhận
  const propsBtn = e => ((e.scope?.kind === 'elem' || e.scope?.kind === 'clip') && e.scope.cid && e.kind !== 'error'
    ? `<button class="ghost" data-askprops="${esc(e.scope.cid)}" title="Chọn lại mục này và mở tab Thuộc tính"><i class="ti ti-adjustments-horizontal"></i> Xem ở Thuộc tính</button>` : '');
  function aHtml(e) {
    const acts = TH.acts.get(e.id) || [], pb = propsBtn(e);
    const actsHtml = acts.length || pb ? `<div class="acts">${acts.map((a, i) => `<button data-askact="${e.id}:${i}"><i class="ti ${a.icon || 'ti-arrow-right'}"></i> ${esc(a.label)}</button>`).join('')}${pb}</div>` : '';
    if (e.kind === 'card') {
      const c = e.card, viewing = TH.viewing === e.id && S.review?.active, L = TH.live.get(e.id);
      const can = !!L && !L.after && (c.state === 'open' || c.state === 'dropped' || c.state === 'undone');
      // Hoàn tác = ⌘Z / nút ↶ của thanh trên, chỉ khi bước hoàn tác trên cùng đúng là lần Nhận này (timeline chưa đổi thêm)
      const undo = !!L?.after && c.state === 'accepted' && snap() === L.after;
      const st = viewing ? 'Đang xem' : CARD_LABEL[c.state] || '';
      return `<div class="ask-card" data-st="${viewing ? 'view' : c.state}"><div class="ttl"><i class="ti ti-movie"></i><b>${esc(c.title)}</b><span class="st">${esc(st)}</span></div>
        ${c.sub || c.t1 > c.t0 ? `<div class="sub">${esc(c.sub)}${spanTxt(c)}</div>` : ''}
        ${c.what?.length ? `<ul class="what" aria-label="Đã đổi">${c.what.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
        ${(can && !viewing) || undo ? `<div class="acts">${can && !viewing ? `<button data-askview="${e.id}"><i class="ti ti-eye"></i> Xem</button>` : ''}${undo ? `<button data-askundo="${e.id}" title="Hoàn tác lần Nhận này (⌘Z)"><i class="ti ti-arrow-back-up"></i> Hoàn tác</button>` : ''}</div>` : ''}</div>${actsHtml}`;
    }
    if (e.kind === 'error') return `<div class="ask-err" role="alert"><i class="ti ti-alert-circle"></i> ${esc(e.text || 'Có lỗi')}</div>${actsHtml}`;
    const icon = e.kind === 'info' ? 'ti-check' : 'ti-message-circle';
    return `<div class="ask-reply${e.kind === 'info' ? ' info' : ''}"><i class="ti ${icon}"></i><p>${esc(e.text)}</p></div>${warnHtml(e.warnings)}${actsHtml}`;
  }
  function threadHtml() {
    const rows = TH.items.map(e => `<div class="ask-msg" data-askid="${e.id}">${qHtml(e)}${aHtml(e)}</div>`);
    if (TH.turn) rows.push(`<div class="ask-msg pending">${qHtml(TH.turn)}</div>`);
    if (!rows.length) return `<div class="ask-empty"><p>Hỏi về cả video, một khoảng thời gian (Shift + kéo trên thước), element hay clip đang chọn, hoặc bấm một gợi ý bên dưới.</p>
      <p>Claude chỉ chạy khi bạn gửi; thay đổi trên video luôn xem trước rồi mới Nhận.</p></div>`;
    return rows.join('');
  }
  // vẽ lại khi luồng đổi; có lượt mới thì cuộn cột phải xuống cuối
  function paintThread(force) {
    const h = threadHtml(), n = TH.items.length + (TH.turn ? 1 : 0);
    if (!force && h === TH.h) return;
    threadEl.innerHTML = h; TH.h = h;
    if (n !== TH.n) { TH.n = n; scrollEnd(); }
  }
  function scrollEnd() {
    requestAnimationFrame(() => { const r = document.getElementById('right'); if (r && bar.isConnected && S.right?.tab === 'claude') r.scrollTop = r.scrollHeight; });
  }
  const newId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const scopeRec = sc => {
    const o = { kind: sc?.kind || 'step', chip: sc?.chip || '' };
    for (const k of ['cid', 'a', 'b', 't0', 't1', 'x', 'y', 'w', 'h', 't']) if (sc?.[k] != null && sc[k] !== '') o[k] = sc[k];
    return o;
  };
  // bắt đầu một lượt: câu hỏi hiện ngay trong luồng (chưa lưu)
  function begin(sc, src, q) { TH.turn = { id: newId(), at: Date.now(), step: step(), scope: scopeRec(sc), src, q: String(q || '') }; paintThread(); }
  // kết thúc lượt (hoặc một mục không có câu hỏi, vd. lời nhắc sau Sửa hết lỗi): lưu và vẽ; trả id
  function finish(kind, o = {}) {
    const t = TH.turn || { id: newId(), at: Date.now(), step: step(), scope: scopeRec(scope()), src: 'run', q: '' };
    TH.turn = null;
    if (t.scope?.kind === 'region' && AS.region) AS.region = null; // M173: vùng chỉ cho một lượt
    const e = AC.logEntry({ ...t, kind, text: o.text || '', warnings: o.warnings, card: o.card });
    if (!e) return '';
    if (o.acts?.length) TH.acts.set(e.id, o.acts);
    save(e);
    return e.id;
  }
  function save(e) {
    TH.items = AC.logPush(TH.items, e);
    for (const id of TH.live.keys()) if (!TH.items.some(x => x.id === id)) TH.live.delete(id);
    paintThread();
    S.api('/api/ask/log', { entry: e }).then(r => { if (r?.error) throw new Error(r.error); TH.saveErr = false; }).catch(err => {
      if (!TH.saveErr) { TH.saveErr = true; S.toast(`Chưa lưu được lịch sử hỏi đáp: ${err.message}`); }
    });
  }
  function setCard(id, state) {
    const e = TH.items.find(x => x.id === id);
    if (!e?.card || e.card.state === state) return paintThread(true);
    save({ ...e, card: { ...e.card, state } });
    reveal(id);
  }
  // M175: thẻ đổi trạng thái (Nhận thêm Hoàn tác, Bỏ thêm Xem) thì cao lên; cuộn cho đáy thẻ nằm trên ô hỏi dính đáy, không thì
  // nút mới bị ô hỏi che và bấm chuột trúng chip phạm vi.
  function reveal(id) {
    requestAnimationFrame(() => {
      const r = document.getElementById('right'), el = threadEl.querySelector(`[data-askid="${id}"]`), comp = bar.querySelector('.ask-comp');
      if (!r || !el || S.right?.tab !== 'claude') return;
      const lim = (comp ? comp.getBoundingClientRect().top : r.getBoundingClientRect().bottom) - 8, b = el.getBoundingClientRect().bottom;
      if (b > lim) r.scrollTop += b - lim;
    });
  }
  // Thẻ kết quả: spec = { title, sub?, what?, mode, items, pick?, drop?, strict?, accept? } (what = AskCore.changeSummary). strict: việc ghi đè cả timeline (bản mới chụp
  //   lúc chạy) → chỉ Xem lại được khi timeline còn như lúc tạo thẻ. drop(): đóng mà không Nhận lần đầu (trả phần ngoài timeline).
  function cardReview(spec) {
    const its = spec.items || [];
    if (!its.length) return;
    const t0 = Math.min(...its.map(i => +i.t0 || 0)), t1 = Math.max(...its.map(i => +i.t1 || 0));
    const sub = spec.sub ?? (its.length > 1 ? `${its.length} phương án` : its[0].sub || '');
    const id = finish('card', { card: { title: spec.title, sub, what: spec.what, t0, t1, state: 'open' } });
    TH.live.set(id, { spec, base: snap(), dropped: false });
    view(id);
  }
  function view(id) {
    const L = TH.live.get(id);
    if (!L) return;
    if (L.spec.strict && snap() !== L.base) { TH.live.delete(id); setCard(id, 'stale'); return S.toast('Video đã đổi từ lúc đó nên không xem lại được. Hỏi lại để có bản mới.'); }
    if (S.review?.active) S.review.close('replaced');
    TH.viewing = id;
    let got = false;
    S.review?.open({ owner: OWNER, title: L.spec.title, mode: L.spec.mode || 'list', items: L.spec.items, ...(L.spec.pick != null ? { pick: L.spec.pick } : {}),
      onAccept: (its, n) => {
        if (L.spec.accept) L.spec.accept(its, n); else S.toast(n ? `Đã nhận “${its[0].label}” · ⌘Z để hoàn tác` : 'Không áp được');
        if (n) { got = true; L.after = snap(); setCard(id, 'accepted'); }
      },
      onClose: () => {
        if (TH.viewing === id) TH.viewing = '';
        if (!got) {
          if (!L.dropped) { L.dropped = true; try { L.spec.drop?.(); } catch (e) { console.error(e); } }
          setCard(id, 'dropped');
        }
        paintThread(true); check();
      } });
    paintThread(true);
  }
  function undoCard(id) {
    const L = TH.live.get(id);
    if (!L?.after || snap() !== L.after) { if (L) L.after = null; paintThread(true); return S.toast('Đã có thay đổi khác sau lần Nhận này: dùng ⌘Z hoặc Lịch sử.'); }
    const u = document.getElementById('undo');
    if (!u) return S.toast('Bấm ⌘Z để hoàn tác');
    u.click(); L.after = null; setCard(id, 'undone'); check();
  }
  // Vẽ lại khi phạm vi đổi (chọn element, đổi bước, khoảng chọn); rẻ: so một chuỗi
  function check() {
    place();
    const sc = scope(), sig = JSON.stringify([sc?.kind, sc?.chip, sc?.cid, sc?.knobs, sc?.qc, step(), busy(), S.PPS, AS.range, AS.region]);
    if (sig !== AS.sig) { AS.sig = sig; paint(); }
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
  // st: running / working = ô đề xuất hiện tiến độ; reply / error / idle = xong lượt → một mục trong luồng (idle: o.note, vd. "Đã mở …")
  const SETUP = ['missing', 'login', 'quota', 'model', 'exit'];
  const openEngines = () => { const b = document.getElementById('eng-btn'); if (b) b.click(); else S.toast('Mở menu ⋯ → Mô hình & giọng'); };
  function setOut(st, o = {}) {
    AS.st = st === 'running' || st === 'working' ? st : 'idle'; AS.step = o.step || '';
    if (st === 'reply') finish('reply', { text: o.reply, warnings: o.warnings, acts: o.acts });
    else if (st === 'error') finish('error', { text: o.err || 'Có lỗi', acts: SETUP.includes(o.errKind) ? [{ label: 'Mở Mô hình & giọng', icon: 'ti-cpu', run: openEngines }] : [] });
    else if (st === 'idle' && TH.turn) finish('info', { text: o.note || 'Đã giao việc.' });
    paint(true); check();
  }
  // Thay nội dung một bản timeline / phụ đề bằng bản mới (giữ nguyên đối tượng: review áp lên bản sao hoặc S.TL / S.CAP thật)
  function replaceIn(tl, cap, A) {
    const t = JSON.parse(JSON.stringify(A.TL)), c = JSON.parse(JSON.stringify(A.CAP));
    for (const k of Object.keys(tl)) delete tl[k];
    Object.assign(tl, t); cap.splice(0, cap.length, ...c);
    return true;
  }
  // drop(): S23 M159 — đóng mà không Nhận (Bỏ, hoặc bị phiên xem lại khác thay) thì trả nốt phần ngoài timeline về như cũ
  //   (.studio/qc.json của Sửa hết lỗi, dòng tóm tắt của panel Tự động / AI dựng)
  // M171: mở qua thẻ của luồng (Xem lại được); strict = bản mới thay cả timeline
  function openReview(title, sub, items, drop, strict, what) {
    AS.st = 'idle';
    cardReview({ title, ...(sub ? { sub } : {}), mode: 'list', items, drop, strict, what });
    paint(true); check();
  }
  // Việc chạy bằng hàm sẵn có ghi thẳng vào timeline (AI dựng, Tự động): chạy, chụp bản mới, trả timeline về như cũ (lưu lại bản cũ
  // vì job phía server đã ghi bản mới), rồi đưa bản mới qua Studio.review.
  async function viaReview(title, run, then, drop) {
    if (S.review?.active) S.review.close('replaced');
    const before = snap();
    setOut('working', { step: `Đang chạy ${title}…` });
    let res;
    try { res = await run(); } catch (e) { res = { error: e.message }; }
    const after = snap();
    if (after === before) { if (res?.error) drop?.(); return res?.error ? setOut('error', { err: res.error }) : setOut('reply', { reply: `${title}: không có gì thay đổi.` }); }
    const B = JSON.parse(before), A = JSON.parse(after);
    S.TL = B.TL; S.CAP = B.CAP; S.changed(true);
    await S.saveNow();
    const span = AC.changedSpan(B, A) || { t0: 0, t1: Math.min(6, S.TL.duration || 6) };
    openReview(title, '', [{ label: title, sub: res?.sub || '', t0: span.t0, t1: span.t1, apply: (tl, cap) => replaceIn(tl, cap, A) }], drop, true, AC.changeSummary(B, A));
    then?.();
  }
  // Việc thuần (chuyển cảnh): áp trên bản sao để đếm, rồi mở xem lại
  function pureReview(title, t0, t1, apply) {
    const tl = JSON.parse(JSON.stringify(S.TL)), n = apply(tl);
    if (!n) return setOut('reply', { reply: `${title}: không có chỗ nào để đổi.` });
    const span = AC.changedSpan({ TL: S.TL, CAP: [] }, { TL: tl, CAP: [] }) || { t0, t1 }; // phát lặp đúng chỗ nối đổi đầu tiên → cuối
    openReview(title, '', [{ label: title, sub: typeof n === 'number' ? `${n} chỗ nối` : '', t0: span.t0, t1: span.t1, apply: tl2 => !!apply(tl2) }], null, false,
      AC.changeSummary({ TL: S.TL, CAP: [] }, { TL: tl, CAP: [] }));
  }
  const needCapQuiet = () => !(S.CAP || []).length;
  const needCap = () => (!(S.CAP || []).length ? (setOut('reply', { reply: 'Cần phụ đề trước: bước Nguồn → Lời thoại → Tạo phụ đề.' }), true) : false);

  // ---------- M154: việc của các bước khác Dựng ----------
  // Mở một panel của bước đang ở, không đổi chế độ. S23 M159: ở Cơ bản, panel Chuyên nghiệp do thanh mở (openP, hoặc hàm của panel
  //   như Studio.products.ai tự gọi openPanel trong vài giây sau khi giao việc) không hiện nút trên thanh trái: 01_workflow.js giữ
  //   nút của panel đang mở, hook _rail này chạy sau đó ẩn lại; đổi panel khác là hết. Mở từ chỗ khác (thả file, liên kết) giữ như cũ.
  const openP = id => (typeof window.openPanel === 'function' ? window.openPanel(id) : S.workflow?.focus(id));
  let armUntil = 0, proOpen = '';
  S._rail.push(rail => {
    const cur = typeof panel !== 'undefined' ? panel : '', basic = S.workflow?.level === 'basic';
    if (basic && performance.now() < armUntil && cur && S.workflow.hidden?.(cur)) proOpen = cur;
    if (!proOpen) return;
    if (cur !== proOpen || !basic) { proOpen = ''; return; }
    const b = rail.querySelector(`button[data-p="${cur}"]`); if (b) b.hidden = true;
  });
  // Hàm của panel trả { started } | { need } | { error }: need / error → nói ngay trên thanh; started → một câu chỉ chỗ có kết quả
  async function viaPanel(fn, where) {
    if (typeof fn !== 'function') return setOut('error', { err: 'Chưa có công cụ này' });
    setOut('working', { step: 'Đang mở…' });
    let r; try { r = await fn(); } catch (e) { r = { error: e.message }; }
    if (r?.error) return setOut('error', { err: r.error });
    if (r?.need) return setOut('reply', { reply: r.need });
    return where ? setOut('reply', { reply: where }) : setOut('idle', { note: 'Đã giao việc: kết quả hiện ở panel vừa mở.' });
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
    AS.st = 'idle';
    cardReview({ title: 'Hook mở đầu', sub: `${lines.length} câu, chọn một · chữ lớn`, mode: 'variants', pick: 0,
      items: lines.map(l => ({ label: l, sub: 'chữ lớn 0–2,5 s', t0: 0, t1, apply: tl => { (tl.scenes ||= []).push(scene(l)); return true; } })),
      accept: (its, n) => S.toast(n ? `Đã thêm hook “${its[0].label}” · ⌘Z để hoàn tác` : 'Không áp được') });
    paint(true); check();
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
      if (n) setOut('reply', { reply: `Còn ${n} chú thích Để sau trên khung máy không tự sửa được.`, acts: [{ label: 'Giao Claude sửa hết', icon: 'ti-wand', run: () => S.pins.give() }] });
    }, () => S.qc.revert?.());
  }
  async function postTime(p) {
    if (!S.schedule?.next) return setOut('error', { err: 'Chưa có Lịch đăng' });
    const r = await S.schedule.next(p.platform).catch(e => ({ error: e.message }));
    if (r.error) return setOut('error', { err: r.error });
    setOut('reply', { reply: `Giờ trống kế tiếp cho ${AC.PLAT_VI[p.platform] || p.platform}: ${r.label} (khung giờ của lịch: ${r.slots.join(', ')}).`,
      acts: [{ label: 'Mở Lịch đăng', icon: 'ti-calendar', run: () => openP('schedule') }] });
  }

  async function runAction(pick, sc) {
    armUntil = performance.now() + 5000; // panel mà việc này mở trong 5 s tới: xem hook _rail ở trên
    const p = pick.params || {}, dur = S.TL?.duration || 0;
    switch (pick.action) {
      case 'answer': return setOut('reply', { reply: pick.reply || 'Chưa có việc nào khớp.', warnings: pick.warnings });
      case 'elem_create': { // S27 M199: dựng element riêng ở panel Element riêng (72_celem.js)
        if (!S.celem) return setOut('error', { err: 'Chưa có Element riêng' });
        const ok = await S.celem.make(p.ask);
        return setOut(ok ? 'idle' : 'error', ok ? { note: 'Claude đang dựng element: 3 phương án hiện ở panel Element riêng, bấm Nhận để chèn.' } : { err: 'Chưa gửi được (Claude đang dựng element khác?)' });
      }
      case 'elem_edit': case 'elem_variants': case 'elem_knobs': {
        if (!S.elemAi || !S.sel || S.sel.obj.cid !== sc.cid) return setOut('error', { err: 'Element đã bỏ chọn. Chọn lại rồi hỏi.' });
        if (S.sel.obj.type === 'celem' && S.celem) { // element riêng: Claude dựng lại spec (3 phương án), không vá trường
          if (pick.action === 'elem_knobs') return setOut('reply', { reply: 'Element riêng chưa có Gợi ý núm; dùng núm Cỡ / Thời lượng hoặc nhờ Claude sửa.' });
          const ok = await S.celem.make(pick.action === 'elem_edit' ? p.ask : 'ba biến thể khác hẳn nhau của element này', { cid: sc.cid });
          return setOut(ok ? 'idle' : 'error', ok ? { note: 'Claude đang sửa element: 3 phương án hiện ở panel Element riêng.' } : { err: 'Chưa gửi được (Claude đang dựng element khác?)' });
        }
        setOut('idle', { note: 'Đề xuất hiện ngay bên dưới: xem trước trên khung rồi Nhận hoặc Bỏ.' });
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
        return viaReview(nm, async () => { const out = await S.autofill.run(p.mode, { noUndo: true }); return out ? {} : { error: 'Chưa tự thêm được' }; }, null, () => S.autofill.forget?.());
      }
      case 'ai_build': {
        if (!S.ai?.build) return setOut('error', { err: 'Chưa có AI dựng' });
        if (needCap()) return;
        return viaReview('AI dựng', () => S.ai.build({ extra: p.extra || '', density: p.density }), null, () => S.ai.forget?.());
      }
      case 'open_panel': {
        const nm = AC.PANELS[sc.kind === 'clip' ? 'clip' : sc.step]?.[p.panel];
        setOut(pick.reply ? 'reply' : 'idle', { reply: pick.reply || '', note: nm ? `Đã mở ${nm}.` : 'Đã mở công cụ.' });
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
  // text: câu của gợi ý có `ask` (label = nhãn gợi ý hiện trong luồng); không có → chữ trong ô hỏi
  async function send(text, label, src) {
    const ask = (text || inp.value).trim(), sc = scope();
    if (!sc || busy()) return;
    if (!ask) { inp.focus(); return; }
    begin(sc, src || (label ? 'quick' : 'ask'), label || ask);
    if (!text) inp.value = '';
    setOut('running', { step: 'Đang gửi…' });
    const r = await S.api('/api/ask', { ask, step: step(), sel: selInfo(), range: AS.range, region: AS.region, info: info() }).catch(e => ({ error: e.message }));
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
    if (r.state !== 'done') return setOut(r.state === 'cancelled' ? 'idle' : 'error', { err: r.error, errKind: r.kind || '', note: 'Đã huỷ.' });
    const now = scope();
    if (!now || now.kind !== sc.kind || (now.cid || '') !== (sc.cid || '')) return setOut('reply', { reply: 'Phạm vi đã đổi trong lúc chờ nên chưa làm gì. Hỏi lại nhé.' });
    const pick = AC.checkPick(r, sc); // kiểm lần hai bằng bảng việc của trình duyệt
    runAction(pick, sc);
  }
  async function cancel() { await S.api('/api/ask/cancel', {}).catch(() => {}); AS.run++; setOut('idle', { note: 'Đã huỷ.' }); }

  // ---------- sự kiện ----------
  bar.addEventListener('click', e => {
    const q = e.target.closest('[data-askq]');
    if (q && !q.disabled) {
      const sc = scope(), it = AC.quickOf(sc)[+q.dataset.askq]; if (!it || busy()) return;
      if (it.ask) return send(it.ask, it.label); // gợi ý là một câu hỏi (vd. Giải thích lỗi): qua bộ định tuyến như khi gõ
      begin(sc, 'quick', it.label);
      runAction({ action: it.action, params: it.params, reply: '' }, sc); return;
    }
    const ac = e.target.closest('[data-askact]');
    if (ac) { const [id, i] = ac.dataset.askact.split(':'), f = TH.acts.get(id)?.[+i]?.run; TH.acts.delete(id); paintThread(true); f?.(); return; }
    const v = e.target.closest('[data-askview]');
    if (v) return view(v.dataset.askview);
    const u = e.target.closest('[data-askundo]');
    if (u) return undoCard(u.dataset.askundo);
    const pr = e.target.closest('[data-askprops]');
    if (pr) {
      const c = S.compByCid?.(pr.dataset.askprops);
      if (!c) return S.toast('Mục này không còn trên timeline');
      S.select?.(c, true); S.right?.show?.('props'); return;
    }
    const a = e.target.closest('[data-ask]')?.dataset.ask; if (!a) return;
    if (a === 'send') return send();
    if (a === 'cancel') return cancel();
    if (a === 'unrange') return clearRange();
    if (a === 'unregion') { AS.region = null; return check(); }
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (AS.range) clearRange(); if (AS.region) { AS.region = null; check(); } inp.blur(); }
  });
  window.addEventListener('keydown', e => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const ae = document.activeElement;
    if (/INPUT|TEXTAREA|SELECT/.test(ae?.tagName || '') || ae?.isContentEditable || S.editing) return;
    if (!document.getElementById('modal')?.hidden) return;
    e.preventDefault(); open();
  });
  // M170: / và ✦ — bỏ ⤢ / mở cột phải đang gấp, sang tab Claude, đặt con trỏ vào ô hỏi
  function open(focus = true) {
    check();
    if (bar.hidden) { S.toast('Cài đặt không có Hỏi Claude'); return false; }
    S.layout?.revealRight?.();
    // M175: gọi show cả khi đang ở Claude — tab tự về lúc không chọn gì mang cờ RT.auto, không tiêu cờ thì / rồi bấm element để
    // lấy chip lại nhảy sang Thuộc tính
    S.right?.show?.('claude');
    if (focus) { inp.focus(); inp.select(); }
    return true;
  }
  // M173: Hỏi ngay từ ô hỏi nổi trên khung. o.region { x, y, w, h, t } = hỏi về vùng; không có = phạm vi đang hiện (element vừa
  //   chọn). Mở tab Claude rồi gửi như gõ (C23: người dùng đã bấm). false khi đang bận / không có Hỏi Claude ở bước này.
  function askNow(text, o = {}) {
    const q = String(text || '').trim();
    if (!q || busy()) { if (busy()) S.toast('Claude đang trả lời câu trước'); return false; }
    AS.region = o.region ? AC.regionOf(o.region, S.DW || 720, S.DH || 1280) : null;
    if (!open(false)) { AS.region = null; return false; }
    send(q, q, 'ask');
    return true;
  }
  // S23 M164: giao một việc của bước từ nơi khác (popover điểm trên thanh bước, 03_stepscore.js), như bấm gợi ý nhanh.
  // Phạm vi là cả bước (không tính element đang chọn); việc không có trong phạm vi của bước, hoặc thanh đang chạy → false.
  function run(action, params = {}, st = step()) {
    const sc = AC.scopeOf({ step: st, qc: !!S.qc?.last });
    if (!sc || busy() || !AC.actionsOf(sc).some(a => a.id === action)) return false;
    check();
    begin(sc, 'run', AC.quickOf(sc).find(q => q.action === action)?.label || action);
    runAction({ action, params: { ...params }, reply: '' }, sc);
    return true;
  }
  // M170: thân tab Claude. renderInspector gọi mỗi lần vẽ cột phải; chỉ gắn lại khi tab vừa mở (giữ chữ đang gõ và focus)
  S.right?.addTab?.('claude', el => { if (bar.parentNode !== el || none.parentNode !== el) el.replaceChildren(bar, none); paint(); });
  S.ask = { open, run, askNow, refresh: () => paint(true), get range() { return AS.range; }, get region() { return AS.region; }, clearRange, place, bar, input: inp,
    notes: bar.querySelector('.ask-notes'), get log() { return TH.items; } };
  requestAnimationFrame(() => paint(true));
  // M171: lịch sử của dự án đang mở (mỗi trang một dự án). Lượt vừa xong trước khi tải về đứng sau (cùng id: bản ở đây thắng)
  const loadLog = () => S.api('/api/ask/log').then(r => { TH.items = AC.logParse([...(r?.items || []), ...TH.items]); paintThread(true); }).catch(() => {});
  if (S.onReady) S.onReady(loadLog); else loadLog();
})();
