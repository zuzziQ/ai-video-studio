// "Tạo style" (references/style-lab.md): clone a style from any edited reference video, or create one from a description.
// Claude Code CLI writes a new pack + template + Claude skill; the server validates it in the engine before installing.
'use strict';
(() => {
  const S = Studio;
  const css = document.createElement('style');
  css.textContent = `
  .sl-card { background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); padding: var(--space-3); margin: var(--space-2) 0; }
  .sl-card h4 { margin: 0 0 var(--space-2); font-size: var(--text-sm); display: flex; gap: var(--space-2); align-items: center; }
  .sl-card p { margin: var(--space-1) 0; color: rgb(var(--color-fg-muted)); line-height: 1.5; }
  .sl-card p.sl-sm { font-size: var(--text-xs); } .sl-card p.sl-xs { font-size: var(--text-2xs); margin-top: var(--space-2); }
  .sl-kv { display: flex; flex-wrap: wrap; gap: var(--space-1); margin: var(--space-2) 0; }
  .sl-sw { display: flex; gap: var(--space-050); margin: var(--space-2) 0; } .sl-sw i { flex: 1; height: 24px; border-radius: var(--radius-xs); border: 1px solid rgb(var(--color-overlay) / .12); background: var(--sw); } .sl-sw i.acc { flex: .6; }
  .sl-sheet { width: 100%; border-radius: var(--radius-control); border: 1px solid rgb(var(--color-line-strong)); cursor: zoom-in; background: rgb(var(--color-black)); display: block; }
  .sl-zoom { max-width: 100%; max-height: 80vh; display: block; margin: auto; }
  .sl-nav { display: flex; gap: var(--space-1); justify-content: center; margin-top: var(--space-1); }
  .sl-drop { border: 1px dashed rgb(var(--color-line-hover)); border-radius: var(--radius-control); padding: var(--space-4) var(--space-3); text-align: center; color: rgb(var(--color-fg-subtle)); cursor: pointer; transition: border-color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard); }
  .sl-drop:hover, .sl-drop.over { border-color: rgb(var(--color-accent-text) / .5); color: rgb(var(--color-fg-muted)); background: rgb(var(--color-accent-soft) / .24); }
  .sl-row { display: flex; gap: var(--space-2); align-items: center; margin: var(--space-2) 0; } .sl-row > * { flex: 1; min-width: 0; } .sl-row > .sl-nf { flex: none; }
  .sl-wrap { margin-top: var(--space-2); } .seg.sl-mt { margin-top: var(--space-2); } .sl-full { width: 100%; justify-content: center; }
  .sl-prog .bar { height: var(--space-1); background: rgb(var(--color-surface-hover)); border-radius: var(--radius-pill); overflow: hidden; margin: var(--space-2) 0 var(--space-1); } .sl-prog .bar i { display: block; height: 100%; width: var(--w, 0%); background: rgb(var(--color-accent-text)); transition: width var(--duration-slow) var(--ease-standard); }
  .sl-step { font-size: var(--text-xs); } .sl-push { margin-left: auto; } .sl-push.sl-n { font-weight: 400; }
  .sl-steps { margin: var(--space-2) 0 0; padding: 0; list-style: none; font-size: var(--text-xs); color: rgb(var(--color-fg-subtle)); } .sl-steps li { padding: var(--space-050) 0; } .sl-steps li.on { color: rgb(var(--color-fg)); } .sl-steps li.ok { color: rgb(var(--color-success)); }
  .sl-err { color: rgb(var(--color-danger-text)); white-space: pre-wrap; font-size: var(--text-xs); }
  .sl-c-bad { color: rgb(var(--color-danger)); } .sl-c-ok { color: rgb(var(--color-success)); }
  details > summary.sl-sum { font-size: var(--text-2xs); cursor: pointer; }
  .sl-vid { width: 100%; max-height: 340px; border-radius: var(--radius-control); background: rgb(var(--color-black)); display: block; border: 1px solid rgb(var(--color-line-strong)); }
  .sl-thumbs { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-1); margin: var(--space-2) 0; } .sl-thumbs img { width: 100%; border-radius: var(--radius-xs); border: 1px solid rgb(var(--color-line-strong)); cursor: zoom-in; }
  .sl-acts { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); } .sl-acts button { flex: 1 1 auto; }
  .sl-spec { max-height: 260px; overflow: auto; white-space: pre-wrap; font-size: var(--text-2xs); color: rgb(var(--color-fg-muted)); background: rgb(var(--color-surface)); border-radius: var(--radius-control); padding: var(--space-2); margin: var(--space-2) 0 0; }
  .sl-mine { display: flex; gap: var(--space-2); align-items: center; padding: var(--space-2); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); margin: var(--space-1) 0; background: rgb(var(--color-surface)); }
  .sl-mine img { width: 40px; height: 56px; object-fit: cover; border-radius: var(--radius-xs); background: rgb(var(--color-black)); flex: none; }
  .sl-mine .tx { flex: 1; min-width: 0; } .sl-mine .tx b { display: block; font-size: var(--text-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sl-mine .tx small { color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); }
  .sl-warn { border-color: rgb(var(--color-danger)); } .sl-warn h4 { color: rgb(var(--color-danger-text)); } .sl-warn p { font-size: var(--text-xs); }
  .sl-imgs { display: flex; gap: var(--space-1); flex-wrap: wrap; margin: var(--space-1) 0; } .sl-imgs img { width: 44px; height: 44px; object-fit: cover; border-radius: var(--radius-xs); }`;
  document.head.appendChild(css);
  // Data-driven values (progress width, swatches of the analysed video's palette) arrive as data-v="--w:40%" and are set with style.setProperty after insert.
  const applyVars = root => (root || document).querySelectorAll('[data-v]').forEach(el => el.dataset.v.split(';').forEach(p => { const i = p.indexOf(':'); if (i > 0) el.style.setProperty(p.slice(0, i).trim(), p.slice(i + 1).trim()); }));

  const FONTS = ['', 'Be Vietnam Pro', 'Montserrat', 'Inter', 'Playfair Display', 'DM Serif Display', 'Bungee', 'Lexend', 'Oswald', 'Nunito', 'Pacifico'];
  const STEPS = { clone: ['Phân tích video (cắt cảnh, màu, chữ, lời, nhạc)', 'Claude xem contact sheet + viết gói', 'Kiểm tra gói trong engine (sửa tối đa 2 vòng)', 'Cài gói, template, skill, video xem trước'],
    describe: ['Claude thiết kế style + viết gói', 'Kiểm tra gói trong engine (sửa tối đa 2 vòng)', 'Cài gói, template, skill, video xem trước'] };
  const st = { tab: 'clone', w: null, an: null, sheet: 0, src: '', job: null, kind: null, result: null, styles: null, check: null, d: { desc: '', orient: 'vertical', industry: '', colors: '', font: '', images: [] }, name: '', model: 'default', timer: null };
  const $b = () => document.getElementById('libbody');
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const fileUrl = (w, f) => avsUrl(`/api/stylelab/file?w=${encodeURIComponent(w)}&f=${encodeURIComponent(f)}`);

  async function loadStyles() { st.styles = await S.api('/api/stylelab/list').catch(() => []); if (st.visible) render(); }
  // M38: user packs run as plain JS (Studio preview + every render). Warn about packs that neither ship with the repo nor were
  // made by Style Lab on this machine, until the user says they trust them (or deletes them).
  async function loadPacks() { st.packs = await S.api('/api/stylelab/packs').catch(() => []); if (st.visible) render(); return st.packs; }
  const foreign = () => (st.packs || []).filter(x => !x.trusted);
  const warnCard = () => !foreign().length ? '' : `<div class="sl-card sl-warn"><h4><i class="ti ti-alert-triangle"></i> Gói style không rõ nguồn (${foreign().length})</h4>
      <p>Các gói dưới đây không đi kèm bản cài và không do Style Lab trên máy này tạo (chép từ nơi khác, khôi phục từ máy khác hoặc đã bị sửa).
      Mã JS của gói chạy với toàn quyền trong Studio (gọi được API của Studio) và khi xuất video. Chỉ giữ gói bạn tin nguồn.</p>
      ${foreign().map(x => `<div class="sl-mine"><div class="tx"><b>${S.esc(x.name)}</b><small>${S.esc(x.file)}</small></div>
        <button data-trust="${S.esc(x.id)}" title="Tôi tin nguồn gói này">Tin gói này</button>
        ${/^u_[a-z0-9_]+$/.test(x.id) ? `<button class="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" data-del="${S.esc(x.id)}" title="Xoá gói"><i class="ti ti-trash"></i></button>` : ''}</div>`).join('')}</div>`;
  async function trustPack(id) {
    const x = (st.packs || []).find(p => p.id === id);
    if (!confirm(`Tin gói “${x?.name || id}” (${x?.file || id})? Mã của gói sẽ chạy trong Studio và khi xuất video mà không cảnh báo nữa (đến khi nội dung gói đổi).`)) return;
    const r = await S.api('/api/stylelab/trust', { id });
    if (!r.ok) return S.toast('Lỗi: ' + (r.error || ''));
    await loadPacks(); render();
  }
  async function checkCli() { st.check = await S.api('/api/stylelab/check').catch(e => ({ error: e.message })); if (st.visible) render(); }

  function render() {
    const b = $b(); if (!b) return;
    if (st.visible && b.querySelector('#sltab')) save(); // keep what the user typed when the panel re-renders
    st.visible = true;
    if (!st.styles) loadStyles();
    if (!st.check) checkCli();
    if (!st.packs) loadPacks();
    const running = st.job && st.job.state === 'running';
    b.innerHTML = `<div class="seg" id="sltab">${[['clone', 'ti-movie', 'Clone từ video'], ['describe', 'ti-writing', 'Từ mô tả']].map(([k, i, l]) => `<button data-t="${k}" class="${st.tab === k ? 'on' : ''}"><i class="ti ${i}"></i> ${l}</button>`).join('')}</div>
      ${warnCard()}
      ${st.check?.error ? `<div class="sl-card"><p class="sl-err"><i class="ti ti-alert-triangle"></i> ${S.esc(st.check.error)}</p></div>` : ''}
      ${running || (st.job && st.job.state === 'error' && !st.result) ? progCard() : ''}
      ${!running && st.result ? resultCard(st.result) : ''}
      ${st.tab === 'clone' ? cloneTab(running) : descTab(running)}
      <div class="sl-card"><h4><i class="ti ti-dna-2"></i> Style của tôi ${st.styles ? `<span class="muted">(${st.styles.length})</span>` : ''}</h4>
        ${!st.styles ? '<p class="muted">Đang tải…</p>' : !st.styles.length ? '<p class="muted">Chưa có style nào. Clone từ một video bạn thích, hoặc mô tả style bạn muốn.</p>' : st.styles.map(mineRow).join('')}</div>`;
    applyVars(b); bind();
  }
  const opts = running => `<div class="sl-row"><input id="slname" placeholder="Tên style (tuỳ chọn)" value="${S.esc(st.name)}" ${running ? 'disabled' : ''}>
      <select id="slmodel" title="Model Claude" ${running ? 'disabled' : ''}>${[['default', 'Model mặc định của CLI'], ['sonnet', 'Sonnet (nhanh)'], ['opus', 'Opus (kỹ hơn)']].map(([v, l]) => `<option value="${v}" ${st.model === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  function cloneTab(running) {
    const an = st.an;
    return `<div class="sl-card"><h4><i class="ti ti-movie"></i> Video mẫu đã edit (TikTok / Reels / YouTube)</h4>
      <p class="muted sl-sm">Đưa vào video bất kỳ có style bạn thích. Máy phân tích cắt cảnh, màu, vị trí chữ, lời nói, nhạc; Claude xem contact sheet rồi viết một gói style mới tái tạo phong cách đó (không chép logo/nội dung).</p>
      <div class="sl-drop" id="sldrop"><i class="ti ti-upload"></i> Kéo thả hoặc bấm để chọn video<input type="file" id="slfile" accept="video/*" hidden></div>
      <div class="sl-row"><input id="slpath" placeholder="…hoặc đường dẫn: ~/Downloads/video.mp4" value="${S.esc(st.src)}" ${running ? 'disabled' : ''}><button id="slan" class="sl-nf" ${running ? 'disabled' : ''}><i class="ti ti-scan"></i> Phân tích</button></div>
      ${an ? anCard(an) + opts(running) + `<button class="primary sl-full" id="slgo" ${running || st.check?.error ? 'disabled' : ''}><i class="ti ti-sparkles"></i> Tạo style bằng Claude</button>
        <p class="muted sl-xs">Mất khoảng 2–8 phút (Claude CLI trên máy bạn, dùng gói Claude của bạn). Gói chỉ được cài khi qua kiểm tra trong engine.</p>` : ''}</div>`;
  }
  function anCard(an) {
    const sh = an.sheets || [], cur = sh[st.sheet] || sh[0];
    const tz = (an.text_zones || [])[0];
    return `<div class="sl-wrap">${cur ? `<img class="sl-sheet" id="slsheet" src="${fileUrl(st.w, cur.file)}" title="Contact sheet ${cur.from}s–${cur.to}s (bấm để phóng to)">
        <div class="sl-nav">${sh.map((s, i) => `<button data-sh="${i}" class="ui-chip ${i === st.sheet ? 'is-active' : ''}" aria-pressed="${i === st.sheet}">${Math.round(s.from)}–${Math.round(s.to)}s</button>`).join('')}</div>` : ''}
      <div class="sl-sw" title="Bảng màu chủ đạo">${(an.palette || []).slice(0, 6).map(p => `<i data-v="--sw:${S.esc(p.hex)}" title="${p.hex} · ${Math.round(p.share * 100)}%"></i>`).join('')}${(an.accents || []).slice(0, 3).map(p => `<i class="acc" data-v="--sw:${S.esc(p.hex)}" title="nhấn ${p.hex}"></i>`).join('')}</div>
      <div class="sl-kv"><span class="ui-chip">${S.fmt(an.duration)} · ${an.aspect}</span><span class="ui-chip">${an.n_cuts} cắt cảnh · ${an.cut_rate_per_min}/phút</span><span class="ui-chip">cảnh TB ${an.avg_shot_s}s</span>
        <span class="ui-chip">${an.audio?.music_likely ? `có nhạc${an.audio.bpm ? ' ~' + Math.round(an.audio.bpm) + ' BPM' : ''}` : 'ít/không nhạc'}</span><span class="ui-chip">lời nói ${Math.round(an.speech_ratio * 100)}%</span>
        ${tz ? `<span class="ui-chip">chữ ở ${Math.round(tz.y0 * 100)}–${Math.round(tz.y1 * 100)}% chiều cao</span>` : ''}${an.audio?.transients?.length ? `<span class="ui-chip">${an.audio.transients.length} tiếng động mạnh</span>` : ''}</div>
      ${an.text_zones_image ? `<details><summary class="muted sl-sum">Vùng chữ / phụ đề</summary><img class="sl-sheet" src="${fileUrl(st.w, an.text_zones_image)}"></details>` : ''}</div>`;
  }
  function descTab(running) {
    const d = st.d;
    return `<div class="sl-card"><h4><i class="ti ti-writing"></i> Mô tả style bạn muốn</h4>
      <textarea id="sldesc" rows="5" placeholder="VD: Video bất động sản sang trọng tông đen – vàng gold, chữ serif, intro tên dự án, thẻ giá, bản đồ vị trí, CTA gọi điện" ${running ? 'disabled' : ''}>${S.esc(d.desc)}</textarea>
      <div class="seg sl-mt" id="slor">${[['vertical', 'Dọc 9:16'], ['horizontal', 'Ngang 16:9']].map(([k, l]) => `<button data-o="${k}" class="${d.orient === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="sl-row"><input id="slind" placeholder="Ngành (BĐS, mỹ phẩm…)" value="${S.esc(d.industry)}"><input id="slcol" placeholder="Màu thương hiệu: #111111, #C9A44C" value="${S.esc(d.colors)}"></div><!-- design-token-ok: placeholder shows the hex format the user types -->

      <div class="sl-row"><select id="slfont">${FONTS.map(f => `<option value="${f}" ${d.font === f ? 'selected' : ''}>${f || 'Font: để Claude chọn'}</option>`).join('')}</select>
        <button id="slimg" class="sl-nf"><i class="ti ti-photo-plus"></i> Ảnh tham khảo</button><input type="file" id="slimgf" accept="image/*" multiple hidden></div>
      ${d.images.length ? `<div class="sl-imgs">${d.images.map((f, i) => `<img src="${f.url}" title="Bấm để bỏ" data-rmimg="${i}">`).join('')}</div>` : ''}
      ${opts(running)}<button class="primary sl-full" id="slgo" ${running || st.check?.error ? 'disabled' : ''}><i class="ti ti-sparkles"></i> Tạo style bằng Claude</button>
      <p class="muted sl-xs">Claude viết gói style + template + skill; mất khoảng 2–8 phút (Sonnet nhanh hơn).</p></div>`;
  }
  function progCard() {
    const j = st.job, steps = STEPS[st.kind] || [], p = j.progress || 0;
    const si = st.kind === 'analyze' ? -1 : st.kind === 'clone' ? (p < .23 ? 0 : p < .61 ? 1 : p < .87 ? 2 : 3) : (p < .61 ? 0 : p < .87 ? 1 : 2);
    const el = (Date.now() - (j.started || Date.now())) / 1000;
    return `<div class="sl-card sl-prog"><h4>${j.state === 'error' ? '<i class="ti ti-alert-triangle sl-c-bad"></i> Chưa tạo được' : '<i class="ti ti-loader-2 spin"></i> ' + (st.kind === 'analyze' ? 'Đang phân tích video' : 'Đang tạo style')}<span class="muted sl-push">${mmss(el)}</span></h4>
      ${j.state === 'error' ? `<p class="sl-err">${S.esc(j.step)}</p>` : `<div class="bar"><i data-v="--w:${Math.round(p * 100)}%"></i></div><div class="muted sl-step" id="slstep">${S.esc(j.step || '')}</div>
      ${si >= 0 ? `<ul class="sl-steps">${steps.map((s, i) => `<li class="${i < si ? 'ok' : i === si ? 'on' : ''}"><i class="ti ${i < si ? 'ti-check' : i === si ? 'ti-point-filled' : 'ti-point'}"></i> ${s}</li>`).join('')}</ul>` : ''}
      <div class="sl-acts"><button id="slcancel"><i class="ti ti-player-stop"></i> Dừng</button></div>`}</div>`;
  }
  function resultCard(r) {
    if (!r.ok) return `<div class="sl-card"><h4><i class="ti ti-alert-triangle sl-c-bad"></i> Chưa tạo được style</h4><p class="sl-err">${S.esc(r.error || 'Lỗi không rõ')}</p>
      ${r.validation?.problems?.length ? `<ul class="sl-steps">${r.validation.problems.slice(0, 8).map(p => `<li>• ${S.esc(p)}</li>`).join('')}</ul>` : ''}
      ${r.stills?.length ? `<div class="sl-thumbs">${r.stills.slice(0, 8).map(s => `<img src="${fileUrl(st.w, s)}">`).join('')}</div>` : ''}</div>`;
    const v = r.files?.preview?.ok ? `/templates/previews/${encodeURIComponent(r.id)}.mp4?${Date.now()}` : null;
    return `<div class="sl-card"><h4><i class="ti ti-circle-check sl-c-ok"></i> ${S.esc(r.name)} <span class="muted sl-push sl-n">${mmss(r.sec || 0)}</span></h4>
      ${v ? `<video class="sl-vid" src="${v}" autoplay loop muted playsinline></video>` : ''}
      ${r.meta?.summary ? `<p>${S.esc(r.meta.summary)}</p>` : ''}
      <div class="sl-kv"><span class="ui-chip">gói ${S.esc(r.id)}</span><span class="ui-chip">${r.validation?.meta?.items?.length || 0} graphic</span><span class="ui-chip">${r.validation?.recipe?.scenes || 0} cảnh tự dựng</span><span class="ui-chip">${r.turns?.length > 1 ? `${r.turns.length - 1} vòng sửa` : 'qua kiểm tra ngay'}</span></div>
      ${r.seen ? `<p class="muted sl-sm"><i class="ti ti-eye"></i> Claude thấy: ${S.esc(r.seen)}</p>` : ''}
      ${r.compare ? `<details><summary class="muted sl-sum">So sánh: video mẫu (trên) · style mới (dưới)</summary><img class="sl-sheet" src="${fileUrl(st.w, r.compare)}"></details>` : ''}
      <details><summary class="muted sl-sum">Style spec</summary><div class="sl-spec">${S.esc(r.spec || '')}</div></details>
      <div class="sl-acts"><button class="primary" data-apply="${S.esc(r.id)}"><i class="ti ti-wand"></i> Áp dụng cho dự án</button><button data-lib="${S.esc(r.id)}"><i class="ti ti-layout-grid"></i> Mở trong thư viện mẫu</button><button data-del="${S.esc(r.id)}" title="Xoá style"><i class="ti ti-trash"></i></button></div>
      ${r.files?.skill ? `<p class="muted sl-xs">Skill Claude Code: ${S.esc(r.files.skill.replace(/^\/Users\/[^/]+/, '~'))}</p>` : ''}</div>`;
  }
  const mineRow = s => `<div class="sl-mine">${s.thumb ? `<img src="${s.thumb}">` : '<img>'}<div class="tx"><b>${S.esc(s.name)}</b><small>${s.kind === 'clone' ? 'clone từ video' : 'từ mô tả'} · ${S.esc(s.aspect)} · ${S.esc(String(s.created || '').slice(0, 10))}</small></div>
    <button class="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" data-apply="${S.esc(s.id)}" title="Áp dụng cho dự án"><i class="ti ti-wand"></i></button><button class="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" data-lib="${S.esc(s.id)}" title="Mở trong thư viện mẫu"><i class="ti ti-layout-grid"></i></button><button class="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" data-del="${S.esc(s.id)}" title="Xoá style"><i class="ti ti-trash"></i></button></div>`;

  function bind() {
    const b = $b(), q = s => b.querySelector(s);
    q('#sltab').onclick = e => { const x = e.target.closest('[data-t]'); if (x) { save(); st.tab = x.dataset.t; render(); } };
    b.onclick = e => {
      let x;
      if ((x = e.target.closest('[data-apply]'))) return applyStyle(x.dataset.apply);
      if ((x = e.target.closest('[data-lib]'))) return openLib(x.dataset.lib);
      if ((x = e.target.closest('[data-del]'))) return delStyle(x.dataset.del);
      if ((x = e.target.closest('[data-trust]'))) return trustPack(x.dataset.trust);
      if ((x = e.target.closest('[data-sh]'))) { st.sheet = +x.dataset.sh; return render(); }
      if ((x = e.target.closest('[data-rmimg]'))) { save(); st.d.images.splice(+x.dataset.rmimg, 1); return render(); }
      if (e.target.matches('.sl-sheet, .sl-thumbs img')) return S.modal(`<img class="sl-zoom" src="${e.target.src}"><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
    };
    q('#slcancel') && (q('#slcancel').onclick = () => S.api('/api/job/cancel', {}).then(() => S.toast('Đã dừng')));
    if (st.tab === 'clone') {
      const drop = q('#sldrop'), fi = q('#slfile');
      drop.onclick = () => fi.click();
      fi.onchange = () => fi.files[0] && upload(fi.files[0]);
      drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) upload(f); };
      q('#slan').onclick = () => { st.src = q('#slpath').value.trim(); if (!st.src) return S.toast('Chọn video hoặc nhập đường dẫn'); analyze(st.src); };
    } else {
      q('#slor').onclick = e => { const x = e.target.closest('[data-o]'); if (x) { save(); st.d.orient = x.dataset.o; render(); } };
      q('#slimg').onclick = () => q('#slimgf').click();
      q('#slimgf').onchange = async () => { save(); for (const f of [...q('#slimgf').files].slice(0, 4 - st.d.images.length)) { const r = await put(f); if (r.path) st.d.images.push({ path: r.path, url: URL.createObjectURL(f) }); } render(); };
    }
    q('#slgo') && (q('#slgo').onclick = generate);
  }
  function save() {
    const b = $b(), v = s => b.querySelector(s)?.value;
    if (v('#slname') != null) st.name = v('#slname').trim(); if (v('#slmodel')) st.model = v('#slmodel');
    if (st.tab === 'describe' && b.querySelector('#sldesc')) Object.assign(st.d, { desc: v('#sldesc'), industry: v('#slind').trim(), colors: v('#slcol').trim(), font: v('#slfont') });
    if (st.tab === 'clone' && b.querySelector('#slpath')) st.src = v('#slpath').trim();
  }
  const put = f => fetch('/api/stylelab/upload?name=' + encodeURIComponent(f.name), { method: 'POST', body: f }).then(r => r.json());
  async function upload(f) {
    S.toast(`Đang tải lên ${f.name} (${(f.size / 1e6).toFixed(1)} MB)…`);
    const r = await put(f).catch(e => ({ error: e.message }));
    if (!r.path) return S.toast('Tải lên lỗi: ' + (r.error || ''));
    st.src = r.path; analyze(r.path);
  }
  async function analyze(p) {
    st.result = null; st.an = null;
    const r = await S.api('/api/stylelab/analyze', { path: p });
    if (!r.ok) return S.toast(r.error || 'Không phân tích được');
    st.w = r.w; st.kind = 'analyze'; st.sheet = 0; watch(async j => {
      if (j.state === 'done') { st.an = await S.api('/api/stylelab/analysis?w=' + encodeURIComponent(st.w)); st.job = null; }
      render();
    });
  }
  async function generate() {
    save();
    const body = { mode: st.tab, name: st.name, model: st.model };
    if (st.tab === 'clone') { if (!st.w || !st.an) return S.toast('Phân tích video trước'); body.w = st.w; }
    else { if (!st.d.desc?.trim()) return S.toast('Hãy mô tả style bạn muốn'); Object.assign(body, { desc: st.d.desc, orient: st.d.orient, industry: st.d.industry, colors: st.d.colors, font: st.d.font, images: st.d.images.map(i => i.path) }); }
    const r = await S.api('/api/stylelab/generate', body);
    if (!r.ok) return S.toast(r.error || 'Không chạy được');
    st.w = r.w; st.kind = st.tab; st.result = null;
    watch(async j => {
      st.result = await S.api('/api/stylelab/result?w=' + encodeURIComponent(st.w));
      if (st.result.none) st.result = { ok: false, error: j.step };
      if (st.result.ok) { st.job = null; S.toast(`Đã tạo style “${st.result.name}”`); await loadPack(st.result.id, true); refreshTemplates(); }
      else if (j.state === 'error') st.result.error = j.step || st.result.error;
      st.styles = null; render();
    });
  }
  // Poll the shared job (one at a time on the server) and re-render the progress card every second.
  function watch(onDone) {
    clearInterval(st.timer);
    st.job = { state: 'running', progress: 0, step: 'Bắt đầu', started: Date.now() };
    render();
    st.timer = setInterval(async () => {
      const j = await S.api('/api/job').catch(() => null); if (!j || j.kind !== 'stylelab') return;
      st.job = j;
      if (j.state !== 'running') { clearInterval(st.timer); st.timer = null; return onDone(j); }
      if (st.visible && $b()?.querySelector('.sl-prog')) { const c = $b().querySelector('.sl-prog'); const tmp = document.createElement('div'); tmp.innerHTML = progCard(); applyVars(tmp); c.replaceWith(tmp.firstElementChild); $b().querySelector('#slcancel') && ($b().querySelector('#slcancel').onclick = () => S.api('/api/job/cancel', {}).then(() => S.toast('Đã dừng'))); }
    }, 1000);
  }
  // A newly installed pack is injected into the preview iframe (no reload needed); after a reload it comes from packs/user/_all.js.
  function loadPack(id, force) {
    const w = S.win; if (!w?.document) return Promise.resolve(false);
    if (!force && w.PACKS?.some(p => p.id === id)) return Promise.resolve(true);
    if (w.PACKS) for (let i = w.PACKS.length - 1; i >= 0; i--) if (w.PACKS[i].id === id) w.PACKS.splice(i, 1);
    return new Promise(ok => { const s = w.document.createElement('script'); s.src = `/engine/packs/user/${encodeURIComponent(id)}.js?v=${Date.now()}`; s.onload = () => ok(true); s.onerror = () => ok(false); w.document.body.appendChild(s); });
  }
  function refreshTemplates() { try { TEMPLATES = null; } catch {} }
  async function applyStyle(id) {
    if (!S.TL) return S.toast('Mở một dự án trước');
    if (!(await loadPack(id))) return S.toast('Không nạp được gói ' + id);
    const list = await S.api('/api/templates'); const tpl = list.find(t => t.id === id);
    if (!tpl) return S.toast('Không thấy template của style ' + id);
    refreshTemplates();
    await applyTemplate(tpl);
  }
  function openLib(id) { try { TEMPLATES = null; tplCat = 'Tất cả'; } catch {} st.visible = false; openPanel('tpl'); setTimeout(() => { const s = document.getElementById('search'); if (s) { s.value = id; s.dispatchEvent(new Event('input')); } }, 300); }
  async function delStyle(id) {
    if (!confirm(`Xoá style ${id}? Gói, template, spec, video xem trước và skill Claude của style này sẽ bị xoá.`)) return;
    const r = await S.api('/api/stylelab/delete', { id });
    if (!r.ok) return S.toast('Lỗi: ' + (r.error || ''));
    const w = S.win; if (w?.PACKS) for (let i = w.PACKS.length - 1; i >= 0; i--) if (w.PACKS[i].id === id) w.PACKS.splice(i, 1);
    if (st.result?.id === id) st.result = null;
    refreshTemplates(); st.styles = null; st.packs = null; S.toast('Đã xoá style ' + id); render();
  }

  S.addPanel('stylelab', 'ti-dna', 'Tạo style', render);
  // other panels re-render #libbody; stop live updates when they do
  document.addEventListener('click', e => { if (e.target.closest('#rail [data-p]') && !e.target.closest('[data-p="stylelab"]')) st.visible = false; }, true);
  S.onReady(() => loadPacks().then(l => { const n = l.filter(x => !x.trusted).length; if (n) S.toast(`Cảnh báo: ${n} gói style không rõ nguồn chạy trong Studio — xem panel “Tạo style”.`); }));
  S.onReady(() => { fetch('/api/job').then(r => r.json()).then(j => { if (j?.kind === 'stylelab' && j.state === 'running') { st.w = j.w; st.kind = /describe/.test(j.w || '') ? 'describe' : /analyze|^\d+_clone/.test(j.w || '') && j.progress < .3 ? 'analyze' : 'clone'; watch(async jj => { st.result = await S.api('/api/stylelab/result?w=' + encodeURIComponent(st.w)); if (st.result.none) { st.result = null; st.an = await S.api('/api/stylelab/analysis?w=' + encodeURIComponent(st.w)); if (st.an.error) st.an = null; } render(); }); } }).catch(() => {}); });
})();
