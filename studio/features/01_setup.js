// Kiểm tra máy (ROADMAP S15 M115, references/studio.md): Studio cần những thư viện nào, máy này có chưa, cài bằng lệnh gì.
// - Dữ liệu: GET /api/setup/check (studio/routes/01_setup.mjs, danh sách lấy từ install.ps1 / scripts/setup.sh), có cache 5 phút.
// - S22 M156 (K2): lần mở đầu không bật hộp thoại nữa. Thiếu mục bắt buộc (mới so với lần bấm "Để sau") thì hiện dải báo
//   thông báo Studio.notice (chuông trên thanh đầu; bấm "Kiểm tra máy" mới mở màn đầy đủ); đủ cả thì chỉ ghi đã xem. Studio.setupGate xong ngay
//   để 02_onboarding.js mở màn chào luôn — lần đầu chỉ còn một màn.
// - Studio.notice(id, {tone, icon, text, acts}) / Studio.notice.clear(id): thông báo dùng chung (63_frames.js dùng khi tự tạo lại
//   khung hình). S23 M161: không đè khung xem nữa — nút chuông #avs-ntbtn trên thanh đầu (số + màu theo mức nặng nhất, rung khi có
//   thông báo mới), bấm mở ô #avs-notices dưới nút; hết thông báo thì nút ẩn.
// - Thiếu mục bắt buộc: chấm đỏ trên nút ⋯ + mục "Kiểm tra máy… (thiếu N)" tô đỏ trong menu (mở lại màn từ đó).
// - Bấm một tính năng (POST tới API của nó) khi thư viện nó cần đang thiếu, hoặc lỗi trả về nhắc tới thư viện thiếu
//   (No module named …, spawn ffmpeg ENOENT, puppeteer-core…): hiện thẻ #setup-need nêu đúng thư viện + lệnh cài.
// - M116 cài giúp: "Cài giúp đủ một lần" chạy lại trình cài, "Cài" trên từng dòng chạy lệnh cài lẻ (POST /api/setup/install {id}, job
//   của Studio, tiến trình + log hiện ngay trong màn qua /api/job); lệnh dạng chữ thu vào "Lệnh cho người rành máy".
// Không cài gì khi người dùng chưa bấm. File đứng trước 01_workflow.js: nút menu có class ghost để 01_workflow chuyển vào ⋯.
'use strict';
(() => {
  const { esc, api } = Studio;
  let R = null, gateDone = null;
  Studio.setupGate = new Promise(ok => { gateDone = ok; });
  const css = document.createElement('style');
  css.textContent = `
  #avs-setup { position: fixed; inset: 0; z-index: 52; /* trên #modal (50), dưới thẻ tác giả (55) và toast (60) */ display: flex; align-items: center; justify-content: center;
    padding: var(--space-4); background: rgb(var(--color-scrim) / .66); }
  #avs-setup .su-box { width: min(760px, 100%); max-height: calc(100vh - 2 * var(--space-4)); display: flex; flex-direction: column; min-width: 0;
    background: rgb(var(--color-surface-raised)); color: rgb(var(--color-fg)); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-modal); box-shadow: var(--shadow-overlay); }
  #avs-setup .su-head { padding: var(--space-4) var(--space-5) var(--space-3); border-bottom: 1px solid rgb(var(--color-line)); }
  #avs-setup h3 { margin: 0 0 var(--space-1); font-size: var(--text-lg); display: flex; align-items: center; gap: var(--space-2); }
  #avs-setup .su-sum { margin: 0; font-size: var(--text-sm); color: rgb(var(--color-fg-muted)); }
  #avs-setup .su-sum.bad { color: rgb(var(--color-danger-text)); font-weight: 600; }
  #avs-setup .su-sum.good { color: rgb(var(--color-success-text)); font-weight: 600; }
  #avs-setup .su-body { overflow: auto; padding: var(--space-3) var(--space-5); min-height: 0; }
  #avs-setup .su-all { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); margin-bottom: var(--space-3); border-radius: var(--radius-card);
    background: rgb(var(--color-surface)); border: 1px solid rgb(var(--color-line)); font-size: var(--text-sm); }
  #avs-setup .su-all.bad { border-color: rgb(var(--color-danger) / .6); }
  #avs-setup h4 { margin: var(--space-3) 0 var(--space-2); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: .04em; color: rgb(var(--color-fg-subtle)); }
  #avs-setup ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
  #avs-setup li { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: var(--space-1) var(--space-2); padding: var(--space-2); border-radius: var(--radius-control); }
  #avs-setup li.missing.req, #avs-setup li.old.req { background: rgb(var(--color-danger) / .1); }
  #avs-setup li .ti { font-size: 16px; line-height: 20px; }
  #avs-setup li.ok .ti { color: rgb(var(--color-success-text)); }
  #avs-setup li.na .ti { color: rgb(var(--color-fg-subtle)); }
  #avs-setup li.missing .ti, #avs-setup li.old .ti { color: rgb(var(--color-warning-text)); }
  #avs-setup li.req.missing .ti, #avs-setup li.req.old .ti { color: rgb(var(--color-danger-text)); }
  #avs-setup .su-name { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-2); font-size: var(--text-sm); min-width: 0; }
  #avs-setup .su-name b { font-weight: 600; overflow-wrap: anywhere; }
  #avs-setup .su-ver { color: rgb(var(--color-fg-subtle)); font-size: var(--text-xs); overflow-wrap: anywhere; }
  #avs-setup .su-feat { grid-column: 2; color: rgb(var(--color-fg-muted)); font-size: var(--text-xs); }
  .su-cmd { display: flex; align-items: flex-start; gap: var(--space-2); min-width: 0; }
  #avs-setup .su-cmd { grid-column: 2; }
  .su-cmd code { flex: 1; min-width: 0; padding: var(--space-1) var(--space-2); border-radius: var(--radius-xs); background: rgb(var(--color-canvas)); border: 1px solid rgb(var(--color-line));
    font: var(--text-xs)/1.5 var(--font-mono); overflow-wrap: anywhere; white-space: pre-wrap; user-select: all; }
  .su-cmd .ui-btn { flex: none; }
  #avs-setup .su-acts { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  #avs-setup .su-hint { color: rgb(var(--color-fg-subtle)); font-size: var(--text-xs); }
  #avs-setup details.su-adv { grid-column: 2; font-size: var(--text-xs); color: rgb(var(--color-fg-muted)); }
  #avs-setup .su-all details.su-adv { grid-column: auto; }
  #avs-setup details.su-adv summary { cursor: pointer; width: max-content; max-width: 100%; }
  #avs-setup details.su-adv .su-cmd { margin-top: var(--space-1); }
  #avs-setup .su-row-act { grid-column: 2; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  #avs-setup .su-prog { display: flex; flex-direction: column; gap: var(--space-1); }
  #avs-setup .su-step { font-weight: 600; overflow-wrap: anywhere; }
  #avs-setup .su-bar { height: 4px; border-radius: var(--radius-pill); background: rgb(var(--color-line)); overflow: hidden; }
  #avs-setup .su-bar i { display: block; height: 100%; width: var(--p, 5%); background: rgb(var(--color-accent)); transition: width var(--duration-base) var(--ease-standard); }
  #avs-setup pre.su-log { margin: 0; max-height: 120px; overflow: auto; padding: var(--space-2); border-radius: var(--radius-xs); background: rgb(var(--color-canvas));
    border: 1px solid rgb(var(--color-line)); font: var(--text-2xs)/1.5 var(--font-mono); white-space: pre-wrap; overflow-wrap: anywhere; color: rgb(var(--color-fg-muted)); }
  #avs-setup .su-res.bad { color: rgb(var(--color-danger-text)); } #avs-setup .su-res.good { color: rgb(var(--color-success-text)); }
  #avs-setup .su-foot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-5); border-top: 1px solid rgb(var(--color-line)); }
  #avs-setup .su-foot .grow { flex: 1; }
  #avs-setup .su-note { color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); }
  /* thanh trên đầy ở 1024–1440 px: báo thiếu bằng chấm đỏ trên nút ⋯ + mục "Kiểm tra máy… (thiếu N)" tô đỏ trong menu */
  #setup-btn.su-miss, #setup-btn.su-miss .ti { color: rgb(var(--color-danger-text)); }
  #wf-morebtn.su-dot { position: relative; }
  #wf-morebtn.su-dot::after { content: ''; position: absolute; top: var(--space-1); right: var(--space-1); width: 8px; height: 8px; border-radius: var(--radius-pill); background: rgb(var(--color-danger)); }
  #setup-need { position: fixed; right: var(--space-4); top: calc(var(--h-lg) + var(--space-6)); z-index: 58; width: min(420px, calc(100vw - 2 * var(--space-4)));
    display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3) var(--space-4); font-size: var(--text-sm);
    background: rgb(var(--color-surface-raised)); color: rgb(var(--color-fg)); border: 1px solid rgb(var(--color-danger) / .6); border-radius: var(--radius-card); box-shadow: var(--shadow-raised); }
  #setup-need .sn-t { margin: 0; padding-right: var(--space-6); font-weight: 600; }
  #setup-need .sn-f { margin: 0; color: rgb(var(--color-fg-muted)); font-size: var(--text-xs); }
  #setup-need .sn-x { position: absolute; top: var(--space-2); right: var(--space-2); }
  #setup-need .sn-act { display: flex; gap: var(--space-2); justify-content: flex-end; }
  /* S23 M161: chuông thông báo trên thanh đầu + ô bật ra (không chiếm chỗ của khung xem) */
  #avs-ntbtn { position: relative; flex: none; }
  #avs-ntbtn[hidden] { display: none; }
  #avs-ntbtn .nt-n { position: absolute; top: 1px; right: 0; min-width: 16px; height: 16px; padding: 0 var(--space-1); border-radius: var(--radius-pill); font-size: var(--text-2xs); font-weight: 700; line-height: 16px; text-align: center; background: rgb(var(--color-accent)); color: rgb(var(--color-white)); pointer-events: none; }
  #avs-ntbtn[data-tone="warn"] .nt-n { background: rgb(var(--color-warning)); color: rgb(var(--color-black)); }
  #avs-ntbtn[data-tone="err"] .nt-n { background: rgb(var(--color-danger)); }
  #avs-ntbtn[aria-expanded="true"] { background: rgb(var(--color-surface-muted)); color: rgb(var(--color-fg)); }
  #avs-ntbtn.ping .ti { animation: nt-ping var(--duration-slow) var(--ease-spring) 3; transform-origin: 50% 0; }
  @keyframes nt-ping { 0%, 100% { transform: rotate(0); } 30% { transform: rotate(-16deg); } 70% { transform: rotate(16deg); } }
  #avs-notices { position: fixed; top: calc(50px + var(--space-1)); right: var(--space-4); z-index: 45; /* dưới #modal (50) */
    width: min(440px, calc(100vw - 2 * var(--space-4))); max-height: calc(100vh - 50px - 2 * var(--space-4)); overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-2);
    padding: var(--space-2); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-card); background: rgb(var(--color-surface)); box-shadow: var(--shadow-raised); }
  #avs-notices:empty, #avs-notices:not([data-open]) { display: none; }
  #avs-notices .nt { border-radius: var(--radius-card); background: rgb(var(--color-surface-raised)); }
  #avs-notices .ui-banner { align-items: center; flex-wrap: wrap; font-size: var(--text-sm); }
  #avs-notices .nt-t { flex: 1 1 240px; min-width: 0; margin: 0; overflow-wrap: anywhere; color: rgb(var(--color-fg)); }
  #avs-notices .nt-t > .ti { margin-right: var(--space-1); }
  #avs-notices .ui-banner--warn .nt-t > .ti { color: rgb(var(--color-warning-text)); }
  #avs-notices .ui-banner--err .nt-t > .ti { color: rgb(var(--color-danger-text)); }
  #avs-notices .ui-banner--ok .nt-t > .ti { color: rgb(var(--color-success-text)); }
  #avs-notices .nt-act { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }`;
  document.head.appendChild(css);

  // ---------- dải báo dùng chung (M156) ----------
  // acts: [{ label, icon, primary, on }] — on() trả false thì giữ dải, còn lại bấm xong dải tự đóng. Gọi lại cùng id = thay nội dung.
  // S23 M161: nút chuông + ô thông báo. Số và màu (mức nặng nhất) theo các .nt trong ô; hết thì ẩn nút và đóng ô.
  let ntBtn = null;
  const ntBox = () => {
    let box = document.getElementById('avs-notices');
    if (!box) { box = document.createElement('div'); box.id = 'avs-notices'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Thông báo'); document.body.appendChild(box); }
    if (!ntBtn) {
      ntBtn = document.createElement('button'); ntBtn.id = 'avs-ntbtn'; ntBtn.className = 'icon'; ntBtn.hidden = true;
      ntBtn.setAttribute('aria-haspopup', 'true'); ntBtn.setAttribute('aria-expanded', 'false');
      ntBtn.innerHTML = '<i class="ti ti-bell"></i><span class="nt-n"></span>';
      const at = document.getElementById('wf-lvbar') || document.getElementById('wf-morebtn') || document.getElementById('save');
      if (at) at.before(ntBtn); else document.getElementById('top')?.appendChild(ntBtn);
      ntBtn.addEventListener('click', () => ntOpen(!box.hasAttribute('data-open')));
      ntBtn.addEventListener('animationend', () => ntBtn.classList.remove('ping'));
      new MutationObserver(ntSync).observe(box, { childList: true });
      document.addEventListener('mousedown', e => { if (box.hasAttribute('data-open') && !box.contains(e.target) && !ntBtn.contains(e.target)) ntOpen(false); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && box.hasAttribute('data-open')) ntOpen(false); });
      addEventListener('resize', () => box.hasAttribute('data-open') && ntPlace());
    }
    return box;
  };
  function ntPlace() {
    const box = ntBox(), r = ntBtn.getBoundingClientRect(), w = box.offsetWidth;
    box.style.right = 'auto'; box.style.top = r.bottom + 4 + 'px';
    box.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
  }
  function ntOpen(on) {
    const box = ntBox(); on = on && box.children.length > 0;
    box.toggleAttribute('data-open', on); ntBtn.setAttribute('aria-expanded', String(on));
    if (on) ntPlace();
  }
  function ntSync() {
    const box = ntBox(), list = [...box.children], n = list.length;
    ntBtn.hidden = !n; if (!n) ntOpen(false);
    const tone = list.some(e => e.querySelector('.ui-banner--err')) ? 'err' : list.some(e => e.querySelector('.ui-banner--warn')) ? 'warn' : '';
    if (tone) ntBtn.dataset.tone = tone; else delete ntBtn.dataset.tone;
    ntBtn.querySelector('.nt-n').textContent = n > 9 ? '9+' : String(n);
    const first = list[0]?.querySelector('.nt-t')?.textContent.trim() || '';
    ntBtn.title = n === 1 ? `Thông báo: ${first}` : `${n} thông báo`;
    ntBtn.setAttribute('aria-label', ntBtn.title);
  }
  function notice(id, o = {}) {
    const box = ntBox();
    let el = box.querySelector(`[data-nt="${CSS.escape(id)}"]`);
    if (!el) { el = document.createElement('div'); el.className = 'nt'; el.dataset.nt = id; box.appendChild(el); ntBtn.classList.add('ping'); }
    const acts = o.acts || [], tone = ['warn', 'err', 'ok'].includes(o.tone) ? ' ui-banner--' + o.tone : '';
    el.innerHTML = `<div class="ui-banner${tone}" role="${o.tone === 'err' ? 'alert' : 'status'}"><p class="nt-t">${o.icon ? `<i class="ti ${esc(o.icon)}" aria-hidden="true"></i>` : ''}${o.text || ''}</p>
      ${acts.length ? `<div class="nt-act">${acts.map((a, i) => `<button class="ui-btn ui-btn--${a.primary ? 'primary' : 'secondary'} ui-btn--sm" data-nti="${i}">${a.icon ? `<i class="ti ${esc(a.icon)}"></i> ` : ''}${esc(a.label)}</button>`).join('')}</div>` : ''}</div>`;
    el.onclick = async e => {
      const b = e.target.closest('[data-nti]'); if (!b) return;
      const r = await acts[+b.dataset.nti]?.on?.(); if (r !== false) el.remove();
    };
    ntSync();
    return el;
  }
  notice.clear = id => document.querySelector(`#avs-notices [data-nt="${CSS.escape(id)}"]`)?.remove();
  Studio.notice = notice;

  const bad = i => i.status === 'missing' || i.status === 'old';
  const missingReq = r => (r?.items || []).filter(i => i.need === 'required' && bad(i));
  const ICON = { ok: 'ti-circle-check', missing: 'ti-circle-x', old: 'ti-alert-triangle', na: 'ti-circle-minus' };
  const STATUS = { ok: 'Có', missing: 'Thiếu', old: 'Bản cũ', na: 'Không cần' };
  const cmdHtml = c => `<div class="su-cmd"><code>${esc(c)}</code><button class="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" data-copy="${esc(c)}" title="Sao chép lệnh" aria-label="Sao chép lệnh"><i class="ti ti-copy"></i></button></div>`;

  async function load(fresh) {
    const r = await api('/api/setup/check' + (fresh ? '?fresh=1' : ''));
    if (!r || r.error || !Array.isArray(r.items)) throw new Error(r?.error || 'không đọc được kết quả');
    R = r;
    syncChip();
    return R;
  }
  // ---------- báo thiếu trên nút ⋯ (không thêm thẻ vào #top: thanh trên đã đầy) ----------
  function syncChip() {
    const m = missingReq(R);
    const label = m.length ? `Kiểm tra máy… (thiếu ${m.length})` : 'Kiểm tra máy…';
    const sb = document.getElementById('setup-btn');
    if (sb) { sb.title = label; sb.classList.toggle('su-miss', !!m.length); const t = sb.querySelector('span'); if (t) t.textContent = label; }
    document.getElementById('wf-morebtn')?.classList.toggle('su-dot', !!m.length);
  }
  // ---------- màn Kiểm tra máy ----------
  // Việc cài đang chạy (M116): {id, running, step, progress, log, result: ''|'done'|'error', restart}
  let INST = null, poll = 0;
  const RESTART_IDS = ['node', 'chrome', 'ffmpeg', 'ffprobe'];
  const adv = c => `<details class="su-adv"><summary>Lệnh cho người rành máy</summary>${cmdHtml(c)}</details>`;
  function row(i) {
    const show = bad(i) && i.fix, run = INST?.running;
    const ver = [i.version && 'v' + i.version.replace(/^v/, ''), i.note].filter(Boolean).join(' · ');
    const act = !bad(i) ? '' : i.auto === 'item'
      ? `<div class="su-row-act"><button class="ui-btn ui-btn--secondary ui-btn--sm" data-inst="${esc(i.id)}" ${run ? 'disabled' : ''}><i class="ti ti-download"></i> Cài</button></div>`
      : i.auto === 'all' ? '<div class="su-row-act"><span class="su-hint">Có trong "Cài giúp đủ một lần"</span></div>'
        : '<div class="su-row-act"><span class="su-hint">Cài tay theo lệnh bên dưới</span></div>';
    return `<li class="${i.status} ${i.need === 'required' ? 'req' : 'opt'}" data-id="${esc(i.id)}">
      <i class="ti ${ICON[i.status] || 'ti-point'}" aria-hidden="true"></i>
      <div class="su-name"><b>${esc(i.label)}</b><span class="ui-chip ${i.status === 'ok' ? 'ui-chip--ok' : bad(i) ? (i.need === 'required' ? 'ui-chip--bad' : 'ui-chip--warn') : ''}">${STATUS[i.status] || i.status}</span>${ver ? `<span class="su-ver">${esc(ver)}</span>` : ''}</div>
      <div class="su-feat">${esc(i.features || '')}</div>
      ${act}${show ? adv(i.fix) : ''}</li>`;
  }
  function render(el, busy) {
    const m = missingReq(R), recMiss = R.items.filter(i => i.need === 'recommended' && bad(i));
    // M117: mục "cài sẵn" thiếu thì Studio vẫn chạy, nhưng lần đầu dùng tính năng đó phải chờ tải (mô hình whisper vài GB…)
    const recTxt = recMiss.length ? ` ${recMiss.length} mục nên cài sẵn chưa có: lần đầu dùng tính năng đó sẽ phải chờ tải lâu.` : '';
    const sum = m.length
      ? `<p class="su-sum bad">Thiếu ${m.length} thư viện bắt buộc: ${esc(m.map(i => i.label).join(', '))}. Tính năng cần chúng sẽ không chạy cho tới khi cài.</p>`
      : `<p class="su-sum ${recMiss.length ? '' : 'good'}">Đủ thư viện bắt buộc.${recTxt}</p>`;
    el.querySelector('.su-box').innerHTML = `
      <div class="su-head"><h3 id="su-title"><i class="ti ti-stethoscope"></i> Kiểm tra máy</h3>${sum}</div>
      <div class="su-body">
        <div class="su-all ${m.length ? 'bad' : ''}">${allBox(m)}</div>
        <h4>Bắt buộc</h4><ul>${R.items.filter(i => i.need === 'required').map(row).join('')}</ul>
        <h4>Cài sẵn (nên có)</h4><ul>${R.items.filter(i => i.need === 'recommended').map(row).join('')}</ul>
        <h4>Tuỳ chọn</h4><ul>${R.items.filter(i => i.need !== 'required' && i.need !== 'recommended').map(row).join('')}</ul>
      </div>
      <div class="su-foot"><span class="su-note">Kiểm lúc ${esc(new Date(R.at).toLocaleTimeString('vi-VN'))} · ${R.ms} ms${R.cached ? ' · kết quả đã lưu' : ''}</span><div class="grow"></div>
        <button class="ui-btn ui-btn--secondary ui-btn--md" data-su="again" ${busy || INST?.running ? 'disabled' : ''}><i class="ti ti-refresh"></i> ${busy ? 'Đang kiểm…' : 'Kiểm tra lại'}</button>
        <button class="ui-btn ${m.length ? 'ui-btn--ghost' : 'ui-btn--primary'} ui-btn--md" data-su="close">${m.length ? 'Để sau' : 'Tiếp tục'}</button></div>`;
  }
  function allBox(m) {
    if (INST?.running) {
      return `<div class="su-prog" aria-live="polite"><span class="su-step"><i class="ti ti-loader-2"></i> Đang cài: ${esc(INST.step || 'bắt đầu')}</span>
        <div class="su-bar"><i data-p="${Math.round((INST.progress || 0) * 100)}"></i></div>
        <span class="su-hint">Có thể mất vài phút. Windows có thể hỏi quyền cài đặt: bấm Yes. Đóng màn này vẫn cài tiếp.</span>
        ${INST.log ? `<pre class="su-log">${esc(INST.log)}</pre>` : ''}</div>`;
    }
    const res = INST?.result === 'error'
      ? `<p class="su-res bad"><i class="ti ti-alert-triangle"></i> Cài chưa xong: ${esc(INST.step || 'lỗi')}</p>${INST.log ? `<pre class="su-log">${esc(INST.log)}</pre>` : ''}`
      : INST?.result === 'done' ? `<p class="su-res good"><i class="ti ti-circle-check"></i> Cài xong, đã kiểm lại máy.${INST.restart ? ' Đóng cửa sổ Studio rồi mở lại để mọi tính năng dùng bản vừa cài.' : ''}</p>` : '';
    const winTip = R.platform === 'win32' ? 'hoặc bấm đúp <b>install.cmd</b> trong thư mục cài đặt' : 'hoặc chạy <b>install.sh</b> trong thư mục cài đặt';
    return `${res}<span>${m.length ? 'Bấm <b>Cài giúp đủ một lần</b>: Studio tự chạy trình cài, mục đã có sẽ bỏ qua. Lần đầu tải cả mô hình whisper và tách nền (~5 GB), có thể mất 10–30 phút.' : 'Muốn cài thêm phần tuỳ chọn hoặc cài lại: bấm <b>Cài giúp đủ một lần</b>.'}</span>
      <div class="su-acts"><button class="ui-btn ${m.length ? 'ui-btn--primary' : 'ui-btn--secondary'} ui-btn--md" data-inst="all"><i class="ti ti-download"></i> Cài giúp đủ một lần</button>
        <button class="ui-btn ui-btn--ghost ui-btn--md" data-su="reveal"><i class="ti ti-folder-open"></i> Mở thư mục cài đặt</button></div>
      <span class="su-hint">${winTip}.</span>${adv(R.install)}`;
  }
  // Thanh tiến trình: độ rộng đặt qua biến CSS (không viết thuộc tính style trong markup)
  const paint = el => { const b = el.querySelector('.su-bar i'); if (b) b.style.setProperty('--p', Math.max(5, +b.dataset.p || 0) + '%'); };
  async function install(id, el) {
    const before = new Set((R?.items || []).filter(bad).map(i => i.id));
    const r = await api('/api/setup/install', { id }).catch(e => ({ error: e.message }));
    if (!r?.ok) { Studio.toast(r?.error || 'Không bắt đầu cài được'); return; }
    INST = { id, running: true, step: r.steps?.[0] || '', progress: 0, log: '', result: '', before };
    follow(el);
  }
  // Theo dõi job "setup" qua /api/job; xong thì đọc kết quả kiểm mới (route đã kiểm lại) và vẽ lại.
  function follow(el) {
    clearInterval(poll);
    const draw = () => { const box = document.getElementById('avs-setup'); if (box && R) { render(box); paint(box); } };
    draw();
    poll = setInterval(async () => {
      const j = await api('/api/job').catch(() => undefined);
      if (j === undefined) return; // mạng chập chờn: thử lại lượt sau
      if (!j || j.kind !== 'setup') {
        // Server khởi động lại hoặc ô job đã thuộc việc khác: không kẹt ở "đang cài"
        clearInterval(poll); poll = 0;
        INST.running = false; INST.result = 'error'; INST.step = 'Không còn theo dõi được việc cài (Studio vừa khởi động lại?). Bấm Kiểm tra lại.';
        try { await load(true); } catch { /* giữ kết quả cũ */ }
        return draw();
      }
      INST.step = j.step; INST.progress = j.progress; INST.log = String(j.log || '').split(/[\r\n]+/).filter(Boolean).slice(-8).join('\n');
      if (j.state === 'running') return draw();
      clearInterval(poll); poll = 0;
      INST.running = false; INST.result = j.state === 'done' ? 'done' : 'error';
      try { await load(false); } catch { /* giữ kết quả cũ */ }
      const now = new Set((R?.items || []).filter(bad).map(i => i.id));
      INST.restart = INST.result === 'done' && RESTART_IDS.some(id => INST.before?.has(id) && !now.has(id));
      draw();
      Studio.toast(INST.result === 'done' ? 'Cài xong, đã kiểm lại máy' : 'Cài chưa xong: xem log trong màn Kiểm tra máy');
    }, 800);
  }
  async function open(opts = {}) {
    document.getElementById('avs-setup')?.remove();
    const el = document.createElement('div');
    el.id = 'avs-setup';
    el.innerHTML = '<div class="su-box" role="dialog" aria-modal="true" aria-labelledby="su-title"><div class="su-head"><h3 id="su-title"><i class="ti ti-stethoscope"></i> Kiểm tra máy</h3><p class="su-sum">Đang kiểm…</p></div></div>';
    document.body.appendChild(el);
    const close = () => {
      el.remove(); document.removeEventListener('keydown', key, true);
      if (R) api('/api/setup/seen', { missing: missingReq(R).map(i => i.id) }).catch(() => {});
      gateDone();
    };
    const key = e => { if (e.key === 'Escape' && document.getElementById('avs-setup') === el) { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', key, true);
    el.addEventListener('click', async e => {
      const c = e.target.closest('[data-copy]');
      if (c) { copy(c.dataset.copy, c); return; }
      const b = e.target.closest('[data-su]');
      if (b?.dataset.su === 'close') close();
      const ins = e.target.closest('[data-inst]');
      if (ins && !INST?.running) { install(ins.dataset.inst, el); return; }
      if (b?.dataset.su === 'reveal') { api('/api/setup/reveal', {}).catch(() => {}); return; }
      if (b?.dataset.su === 'again') { render(el, true); try { await load(true); } catch (err) { Studio.toast(err.message); } if (el.isConnected) { render(el); paint(el); } }
    });
    try {
      if (!R || opts.fresh) await load(!!opts.fresh);
      // Việc cài đang chạy (mở lại màn, tải lại trang): theo dõi tiếp
      const j = INST?.running ? null : await api('/api/job').catch(() => null);
      if (j?.kind === 'setup' && j.state === 'running') { INST = { id: '', running: true, step: j.step, progress: j.progress, log: '', result: '', before: new Set(R.items.filter(bad).map(i => i.id)) }; follow(el); }
      render(el); paint(el); el.querySelector('[data-su="close"]')?.focus();
      if (opts.install && !INST?.running) install(opts.install, el);
    }
    catch (err) { el.querySelector('.su-sum').textContent = 'Không kiểm được: ' + err.message; el.querySelector('.su-box').insertAdjacentHTML('beforeend', '<div class="su-foot"><div class="grow"></div><button class="ui-btn ui-btn--primary ui-btn--md" data-su="close">Đóng</button></div>'); }
  }
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); Studio.toast('Đã sao chép lệnh'); }
    catch { const code = btn.parentElement.querySelector('code'); const s = getSelection(); s.removeAllRanges(); const r = document.createRange(); r.selectNodeContents(code); s.addRange(r); Studio.toast('Đã chọn lệnh: bấm Ctrl+C để sao chép'); }
  }
  Studio.openSetup = () => open({ fresh: true });
  Studio.setupCheck = () => R;
  Studio.addTopButton('<button class="ghost" id="setup-btn" title="Kiểm tra máy…"><i class="ti ti-stethoscope"></i></button>', () => open({ fresh: true }));

  // ---------- thẻ "thiếu thư viện" khi bấm một tính năng ----------
  // Một mục cài lẻ được → cài mục đó; còn lại mà trình cài lo được → chạy trình cài
  const fixId = items => (items.length === 1 && items[0].auto === 'item' ? items[0].id : items.some(i => i.auto) ? 'all' : '');
  let lastNeed = '', lastAt = 0;
  function need(items, why) {
    items = items.filter(Boolean);
    if (!items.length) return;
    const k = items.map(i => i.id).join(',');
    if (k === lastNeed && Date.now() - lastAt < 15000) return;
    lastNeed = k; lastAt = Date.now();
    document.getElementById('setup-need')?.remove();
    const el = document.createElement('aside');
    el.id = 'setup-need'; el.setAttribute('role', 'alert');
    el.innerHTML = `<p class="sn-t"><i class="ti ti-alert-triangle"></i> ${why}: thiếu ${esc(items.map(i => i.label).join(', '))}</p>
      ${items.map(i => `<p class="sn-f">${esc(i.label)} — cần cho: ${esc(i.features || '')}</p>${i.fix ? adv(i.fix) : ''}`).join('')}
      <div class="sn-act">${fixId(items) ? `<button class="ui-btn ui-btn--primary ui-btn--sm" data-sn="fix" data-id="${esc(fixId(items))}"><i class="ti ti-download"></i> Cài giúp</button>` : ''}<button class="ui-btn ui-btn--secondary ui-btn--sm" data-sn="open"><i class="ti ti-stethoscope"></i> Kiểm tra máy</button></div>
      <button class="sn-x ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" data-sn="x" title="Đóng" aria-label="Đóng"><i class="ti ti-x"></i></button>`;
    el.addEventListener('click', e => {
      const c = e.target.closest('[data-copy]'); if (c) return copy(c.dataset.copy, c);
      const b = e.target.closest('[data-sn]'); if (!b) return;
      el.remove(); if (b.dataset.sn === 'open') open({ fresh: true }); if (b.dataset.sn === 'fix') open({ install: b.dataset.id });
    });
    document.body.appendChild(el);
  }
  // Trước khi gọi API của một tính năng: thư viện nó cần đang thiếu → báo luôn (vẫn gửi đi, để lỗi thật của server cũng hiện).
  const _fetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const method = String(init?.method || input?.method || 'GET').toUpperCase();
      if (R && method === 'POST') {
        const p = new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
        const miss = R.items.filter(i => bad(i) && (i.api || []).some(a => (a.endsWith('/') ? p.startsWith(a) : p === a)));
        if (miss.length) setTimeout(() => need(miss, 'Tính năng này chưa chạy được'));
      }
    } catch { /* không chặn request */ }
    return _fetch.apply(this, arguments);
  };
  // Lỗi hiện ra (toast, hộp thoại) nhắc tới một thư viện → nêu đúng tên và lệnh cài thay cho lỗi chung.
  const PATTERNS = [
    [/No module named '?faster_whisper/i, 'faster-whisper'], [/No module named '?numpy/i, 'numpy'], [/No module named '?scipy/i, 'scipy'],
    [/No module named '?PIL\b/i, 'pillow'], [/No module named '?rembg/i, 'rembg'], [/No module named '?edge_tts/i, 'edge-tts'],
    [/No module named '?onnxruntime/i, 'yunet'], [/cublas\w*\.(dll|so)|libcublas/i, 'cuda'],
    [/spawn ffmpeg ENOENT|'ffmpeg' is not recognized|ffmpeg: (command )?not found/i, 'ffmpeg'], [/spawn ffprobe ENOENT|'ffprobe' is not recognized|ffprobe: (command )?not found/i, 'ffprobe'],
    [/Cannot find (package|module) '?puppeteer-core/i, 'puppeteer-core'], [/Could not find (Chrome|expected browser)|Thiếu (Google )?Chrome/i, 'chrome'],
    [/\.venv[\\/](Scripts|bin)[\\/]python\S* ENOENT|spawn python3? ENOENT/i, 'venv'], [/spawn claude(\.exe)? ENOENT|Claude Code CLI (chưa|không)/i, 'claude'],
  ];
  function scan(text) {
    if (!R || !text || text.length > 20000) return;
    const hit = PATTERNS.filter(([re]) => re.test(text)).map(([, id]) => R.items.find(i => i.id === id)).filter(i => i && i.status !== 'na');
    if (hit.length) need([...new Set(hit)], 'Lỗi do thiếu thư viện');
  }
  new MutationObserver(ms => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType !== 1 || n.closest?.('#setup-need, #avs-setup')) continue;
      if (n.matches?.('.toast') || n.closest?.('#modalbox') || n.id === 'modalbox') scan(n.textContent);
    }
  }).observe(document.body, { childList: true, subtree: true });

  // ---------- lần đầu ----------
  Studio.onReady(() => { if (R) syncChip(); }); // nút ⋯ và nhãn menu do 01_workflow.js tạo sau file này
  load(false).then(r => {
    const m = missingReq(r).map(i => i.id);
    const fresh = m.filter(id => !(r.later || []).includes(id));
    gateDone(); // M156: không chặn màn chào bằng hộp thoại
    if (!fresh.length) { if (!r.seen) api('/api/setup/seen', { missing: m }).catch(() => {}); return; }
    const names = missingReq(r).map(i => i.label);
    notice('setup', { tone: 'err', icon: 'ti-stethoscope',
      text: `Máy còn thiếu ${names.length} thư viện Studio cần: <b>${esc(names.join(', '))}</b>`,
      acts: [{ label: 'Kiểm tra máy', icon: 'ti-tool', primary: true, on: () => open({ fresh: true }) },
        { label: 'Để sau', on: () => api('/api/setup/seen', { missing: m }).catch(() => {}) }] });
  }).catch(e => { console.error('setup', e); gateDone(); });
})();
