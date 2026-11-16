// "Video dài / Chủ đề": video dài → nhiều clip ngắn (scripts/highlights.mjs) · chủ đề → video không cần quay (scripts/topic_video.mjs).
// Server: studio/routes/17_longform.mjs (references/longform-topic.md). "Tự lái tất cả" uses the Tự lái queue (/api/autopilot/enqueue) when present.
'use strict';
(() => {
  const { $, esc } = Studio;
  const LS = k => { try { return localStorage.getItem('lf_' + k); } catch { return null; } };
  const LSset = (k, v) => { try { localStorage.setItem('lf_' + k, v); } catch {} };
  const S = { tab: LS('tab') || 'long', video: LS('video') || '', dir: LS('dir') || '', list: null, runs: [], queue: false, topicOut: null, uploading: 0 };
  const css = document.createElement('style');
  css.textContent = `
  .lf-card { background: rgb(var(--color-surface-raised)); border: 1px solid rgb(var(--color-line)); border-radius: var(--radius-control); padding: var(--space-3); margin: var(--space-2) 0; }
  .lf-card h4 { margin: 0 0 var(--space-2); font-size: var(--text-xs); display: flex; align-items: center; gap: var(--space-2); color: rgb(var(--color-fg)); }
  .lf-card h4 .r { margin-left: auto; font-weight: 500; color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); }
  .lf-lbl { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); display: block; margin: var(--space-2) 0 var(--space-1); }
  .lf-drop { border: 1.5px dashed rgb(var(--color-line-hover)); border-radius: var(--radius-card); padding: var(--space-4) var(--space-3); text-align: center; color: rgb(var(--color-fg-muted)); cursor: pointer; font-size: var(--text-xs); transition: border-color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard); }
  .lf-drop i { font-size: 24px; color: rgb(var(--color-accent-text)); display: block; margin-bottom: var(--space-1); }
  .lf-drop small { font-size: var(--text-2xs); }
  .lf-drop.over, .lf-drop:hover { border-color: rgb(var(--color-accent-text)); background: rgb(var(--color-accent-soft) / .24); }
  .lf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-1) var(--space-2); }
  .lf-grid .full { grid-column: 1 / 3; }
  .lf-go { width: 100%; justify-content: center; margin-top: var(--space-3); }
  .lf-help { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); line-height: 1.5; margin-top: var(--space-2); }
  .lf-el { font-size: var(--text-2xs); margin-top: var(--space-1); }
  .lf-vid { width: 100%; max-height: 70vh; border-radius: var(--radius-control); background: rgb(var(--color-black)); }
  .ap-tog.lf-tog { display: flex; gap: var(--space-2); align-items: center; font-size: var(--text-xs); margin-top: var(--space-2); } .lf-tog input { width: auto; }
  .lf-c-ok { color: rgb(var(--color-success)); } .lf-strong { font-weight: 600; } .lf-bulk.lf-mt { margin-top: var(--space-2); }
  .lf-it { display: grid; grid-template-columns: 64px minmax(0,1fr); gap: var(--space-2); padding: var(--space-2) 0; border-top: 1px solid rgb(var(--color-line)); }
  .lf-it img, .lf-it .ph { width: 64px; height: 100px; object-fit: cover; border-radius: var(--radius-control); background: rgb(var(--color-surface-hover)); display: block; }
  .lf-it.h img, .lf-it.h .ph { height: 36px; }
  .lf-it .tt { font-weight: 600; font-size: var(--text-xs); line-height: 1.35; }
  .lf-it .hk { font-size: var(--text-2xs); color: rgb(var(--color-accent-text)); margin: var(--space-1) 0; }
  .lf-it .mt { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-2); align-items: center; }
  .lf-it .sc { font-weight: 700; padding: 1px var(--space-2); border-radius: var(--radius-pill); background: rgb(var(--color-accent-soft) / .24); color: rgb(var(--color-accent-text-strong)); }
  .lf-it .rs { font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); margin-top: var(--space-1); line-height: 1.4; }
  .lf-it .b { display: flex; gap: var(--space-1); margin-top: var(--space-1); }
  .lf-bulk { display: flex; gap: var(--space-2); } .lf-bulk button { flex: 1; justify-content: center; font-size: var(--text-xs); }
  .lf-runs { width: 100%; font-size: var(--text-2xs); }`;
  document.head.appendChild(css);
  const active = () => document.querySelector('#rail .on')?.dataset.p === 'longform';
  const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const api = (u, b) => Studio.api(u, b).catch(e => ({ error: e.message }));

  async function refresh() {
    const r = await api('/api/longform/runs');
    S.runs = r.runs || []; S.queue = !!r.queue;
    if (S.dir) { const l = await api('/api/longform/list?dir=' + encodeURIComponent(S.dir)); S.list = l.items || null; if (!l.items) S.dir = ''; }
    if (active()) render();
  }

  function render() {
    const body = $('#libbody'); if (!body) return;
    body.innerHTML = `<div class="seg" id="lf-tabs"><button data-t="long" class="${S.tab === 'long' ? 'on' : ''}"><i class="ti ti-scissors"></i> Video dài</button>
      <button data-t="topic" class="${S.tab === 'topic' ? 'on' : ''}"><i class="ti ti-bulb"></i> Chủ đề</button></div>
      <div id="lf-body">${S.tab === 'long' ? longHTML() : topicHTML()}</div>`;
    body.querySelectorAll('#lf-tabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.t; LSset('tab', S.tab); render(); });
    S.tab === 'long' ? bindLong() : bindTopic();
  }

  // ---------- tab 1: long video → shorts ----------
  function longHTML() {
    const hl = S.runs.filter(r => r.kind === 'highlights');
    return `<div class="lf-card"><h4><i class="ti ti-scissors"></i> Video dài → nhiều clip ngắn</h4>
      <div class="lf-drop" id="lf-drop"><i class="ti ti-movie"></i><b>${S.uploading ? `Đang tải lên ${S.uploading}%…` : 'Thả video dài vào đây'}</b><br><small>hoặc bấm để chọn · 30–90 phút vẫn được</small></div>
      <input type="file" id="lf-file" accept="video/*" hidden>
      <label class="lf-lbl">Hoặc đường dẫn video trên máy</label><input id="lf-video" placeholder="/Users/…/livestream.mp4" value="${esc(S.video)}">
      <div class="lf-grid">
        <div><label class="lf-lbl">Số clip</label><select id="lf-n">${[3, 4, 5, 6, 8, 10].map(n => `<option ${n === +(LS('n') || 6) ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div><label class="lf-lbl">Khung</label><select id="lf-or"><option value="vertical">Dọc 9:16</option><option value="horizontal" ${LS('or') === 'horizontal' ? 'selected' : ''}>Ngang 16:9</option></select></div>
        <div><label class="lf-lbl">Dài tối thiểu (giây)</label><input id="lf-min" type="number" min="5" max="120" value="${LS('min') || 20}"></div>
        <div><label class="lf-lbl">Dài tối đa (giây)</label><input id="lf-max" type="number" min="10" max="180" value="${LS('max') || 60}"></div>
        <div class="full"><label class="lf-lbl">Nhận giọng</label><select id="lf-model"><option value="large-v3-turbo">Chính xác (large-v3-turbo)</option><option value="small" ${LS('model') === 'small' ? 'selected' : ''}>Nhanh (small, sai nhiều hơn)</option></select></div>
      </div>
      <button class="primary lf-go" id="lf-go"><i class="ti ti-sparkles"></i> Tìm khoảnh khắc hay</button>
      <div class="lf-help">Máy nghe cả video một lần (lưu lại, lần sau không nghe lại), Claude chọn các đoạn tự đứng được — hook mạnh 3 giây đầu, trọn ý — rồi dựng mỗi đoạn thành một dự án (cắt lặng, phụ đề; video ngang vào khung dọc thì tự bám mặt).</div></div>
      ${hl.length ? `<label class="lf-lbl">Lần chạy trước</label><select class="lf-runs" id="lf-runs"><option value="">— chọn —</option>${hl.map(r => `<option value="${esc(r.dir)}" ${r.dir === S.dir ? 'selected' : ''}>${esc(r.name)} · ${r.n} clip · ${new Date(r.at).toLocaleString('vi-VN')}</option>`).join('')}</select>` : ''}
      ${S.list ? listHTML() : ''}`;
  }
  function listHTML() {
    const L = S.list;
    if (!L.length) return '<div class="lf-card muted">Chưa có clip nào.</div>';
    return `<div class="lf-card"><h4><i class="ti ti-list-check"></i> ${L.length} khoảnh khắc <span class="r">${L.filter(x => x.mp4).length} đã xuất</span></h4>
      <div class="lf-bulk"><button id="lf-auto" ${S.queue ? '' : 'disabled title="Chưa có tính năng Tự lái (hàng đợi)"'}><i class="ti ti-rocket"></i> Tự lái tất cả</button>
      <button id="lf-exp"><i class="ti ti-upload"></i> Xuất tất cả</button></div>
      ${L.map(it => `<div class="lf-it ${it.mode === 'blurfill' || (it.mode === 'crop' && LS('or') === 'horizontal') ? 'h' : ''}">
        ${it.thumbUrl ? `<img src="${avsUrl(it.thumbUrl)}" alt="">` : '<div class="ph"></div>'}
        <div><div class="tt">${esc(it.title)}</div>${it.hook ? `<div class="hk">“${esc(it.hook)}”</div>` : ''}
        <div class="mt"><span class="sc" title="Điểm Claude chấm">${it.score}</span><span><i class="ti ti-clock"></i> ${mmss(it.t0)}–${mmss(it.t1)}</span><span>${Math.round(it.dur)} s</span>${it.mode === 'reframe' ? '<span title="Video ngang → khung dọc, bám mặt"><i class="ti ti-focus-centered"></i> bám mặt</span>' : ''}</div>
        ${it.reason ? `<div class="rs">${esc(it.reason)}</div>` : ''}
        <div class="b"><button class="ui-btn ui-btn--sm" data-open="${it.i}" ${it.exists ? '' : 'disabled'}><i class="ti ti-edit"></i> Mở</button>${it.mp4Url ? `<button class="ui-btn ui-btn--sm" data-play="${it.i}"><i class="ti ti-player-play"></i> Xem</button>` : ''}</div></div></div>`).join('')}</div>`;
  }
  function bindLong() {
    const drop = $('#lf-drop'), file = $('#lf-file');
    drop.onclick = () => file.click();
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) upload(f); };
    file.onchange = () => file.files[0] && upload(file.files[0]);
    $('#lf-video').onchange = e => { S.video = e.target.value.trim(); LSset('video', S.video); };
    $('#lf-go').onclick = startLong;
    const runs = $('#lf-runs'); if (runs) runs.onchange = async () => { S.dir = runs.value; LSset('dir', S.dir); S.list = null; await refresh(); };
    const auto = $('#lf-auto'); if (auto) auto.onclick = autopilotAll;
    const exp = $('#lf-exp'); if (exp) exp.onclick = exportAll;
    document.querySelectorAll('#lf-body [data-open]').forEach(b => b.onclick = () => openProject(S.list[+b.dataset.open].dir));
    document.querySelectorAll('#lf-body [data-play]').forEach(b => b.onclick = () => play(S.list[+b.dataset.play]));
  }
  function upload(f) {
    if (!/\.(mp4|mov|m4v|mkv|webm)$/i.test(f.name)) return Studio.toast('Chỉ nhận file video');
    const x = new XMLHttpRequest();
    x.open('POST', '/api/longform/upload?name=' + encodeURIComponent(f.name));
    x.upload.onprogress = e => { if (e.lengthComputable) { S.uploading = Math.round(e.loaded / e.total * 100); const d = $('#lf-drop b'); if (d) d.textContent = `Đang tải lên ${S.uploading}%…`; } };
    x.onload = () => { S.uploading = 0; let r = {}; try { r = JSON.parse(x.responseText); } catch {} if (r.path) { S.video = r.path; LSset('video', S.video); Studio.toast('Đã tải video lên'); } else Studio.toast(r.error || 'Tải lên lỗi'); render(); };
    x.onerror = () => { S.uploading = 0; Studio.toast('Tải lên lỗi'); render(); };
    x.send(f);
  }
  function progress(title, onDone) {
    const t0 = Date.now();
    Studio.modal(`<h3><i class="ti ti-loader-2 spin"></i> ${esc(title)}</h3><div id="jobstep" class="muted">Bắt đầu</div><div class="bar"><i></i></div>
      <div class="muted lf-el" id="lf-el"></div><div class="actions"><button id="lf-cancel">Dừng</button></div>`);
    const tick = setInterval(() => { const el = $('#lf-el'); if (el) el.textContent = `Đã chạy ${mmss((Date.now() - t0) / 1000)}`; else clearInterval(tick); }, 1000);
    $('#lf-cancel').onclick = () => api('/api/job/cancel', {});
    Studio.pollJob(j => {
      clearInterval(tick);
      if (j.state !== 'done') return Studio.modal(`<h3>Chưa xong</h3><p>${esc(j.step)}</p><pre>${esc((j.log || '').split('\n').filter(l => !l.startsWith('@@')).slice(-12).join('\n'))}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
      onDone(j);
    });
  }
  async function startLong() {
    const video = ($('#lf-video').value || S.video).trim();
    if (!video) return Studio.toast('Chọn video dài trước');
    const b = { video, n: +$('#lf-n').value, min: +$('#lf-min').value, max: +$('#lf-max').value, orient: $('#lf-or').value, model: $('#lf-model').value };
    if (!(b.min > 3 && b.max > b.min)) return Studio.toast('Độ dài tối đa phải lớn hơn tối thiểu');
    for (const [k, v] of [['video', video], ['n', b.n], ['min', b.min], ['max', b.max], ['or', b.orient], ['model', b.model]]) LSset(k, v);
    S.video = video;
    const r = await api('/api/longform/highlights', b);
    if (!r.ok) return Studio.toast(r.error || 'Không chạy được');
    progress('Đang tìm khoảnh khắc hay…', async j => {
      Studio.closeModal(); S.dir = j.out?.dir || r.dir; LSset('dir', S.dir);
      await refresh(); Studio.toast(`Đã dựng ${S.list?.length || 0} dự án clip ngắn`);
    });
  }
  async function exportAll() {
    const r = await api('/api/longform/export', { dir: S.dir });
    if (!r.ok) return Studio.toast(r.error || 'Không xuất được');
    progress(`Đang xuất ${S.list.length} video…`, async () => { Studio.closeModal(); await refresh(); Studio.toast('Đã xuất tất cả'); });
  }
  async function autopilotAll() {
    let n = 0, err = '';
    for (const it of S.list) { const r = await api('/api/autopilot/enqueue', { input: it.dir, kind: 'autopilot', source: 'ui' }); if (r.ok) n++; else err = r.error || err; }
    Studio.toast(n ? `Đã thêm ${n} dự án vào hàng đợi Tự lái` : `Không thêm được: ${err}`);
  }
  async function openProject(dir) {
    if (Studio.TL && Studio.saveNow) await Studio.saveNow().catch(() => {});
    const r = await api('/api/longform/open', { dir });
    if (!r.ok) return Studio.toast(r.error || 'Không mở được');
    location.reload();
  }
  function play(it) {
    Studio.modal(`<h3><i class="ti ti-player-play"></i> ${esc(it.title || 'Video')}</h3><video src="${avsUrl(it.mp4Url)}" controls autoplay class="lf-vid"></video>
      <div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
  }

  // ---------- tab 2: topic → video ----------
  function topicHTML() {
    const tp = S.runs.filter(r => r.kind === 'topic').slice(0, 6);
    return `<div class="lf-card"><h4><i class="ti ti-bulb"></i> Chủ đề → video (không cần quay)</h4>
      <label class="lf-lbl">Chủ đề</label><textarea id="lf-topic" rows="3" placeholder="VD: 3 mẹo dùng ChatGPT cho người bán hàng online">${esc(LS('topic') || '')}</textarea>
      <div class="lf-grid">
        <div><label class="lf-lbl">Độ dài</label><select id="lf-dur">${[30, 45, 60, 90].map(d => `<option value="${d}" ${d === +(LS('dur') || 45) ? 'selected' : ''}>${d} giây</option>`).join('')}</select></div>
        <div><label class="lf-lbl">Khung</label><select id="lf-tor"><option value="vertical">Dọc 9:16</option><option value="horizontal" ${LS('tor') === 'horizontal' ? 'selected' : ''}>Ngang 16:9</option></select></div>
        <div class="full"><label class="lf-lbl">Giọng đọc</label><select id="lf-voice"><option value="Linh">Linh — macOS, offline</option>
          <option value="edge:vi-VN-HoaiMyNeural" ${LS('voice') === 'edge:vi-VN-HoaiMyNeural' ? 'selected' : ''}>Hoài My — edge-tts (cần Internet, cài edge-tts)</option>
          <option value="edge:vi-VN-NamMinhNeural" ${LS('voice') === 'edge:vi-VN-NamMinhNeural' ? 'selected' : ''}>Nam Minh — edge-tts (cần Internet, cài edge-tts)</option>
          <option value="vieneu" ${LS('voice') === 'vieneu' ? 'selected' : ''}>VieNeu — trên máy (giọng chọn ở Mô hình & giọng)</option></select></div>
        <div class="full"><label class="lf-lbl">Tên kênh trên nút Follow (tuỳ chọn)</label><input id="lf-handle" placeholder="@kenh.cua.ban" value="${esc(LS('handle') || '')}"></div>
      </div>
      <label class="ap-tog lf-tog"><input type="checkbox" id="lf-texp" ${LS('texp') === '0' ? '' : 'checked'}> Xuất MP4 luôn</label>
      <button class="primary lf-go" id="lf-tgo"><i class="ti ti-wand"></i> Tạo video</button>
      <div class="lf-help">Claude viết kịch bản (hook, 3–5 ý, CTA) → giọng đọc → căn thời gian từng chữ → b-roll động + chữ kinetic + nhạc/SFX. Ra một dự án mở được trong Studio để chỉnh tiếp.</div></div>
      ${S.topicOut ? topicResult(S.topicOut) : ''}
      ${tp.length ? `<div class="lf-card"><h4><i class="ti ti-history"></i> Đã tạo gần đây</h4>${tp.map((r, i) => `<div class="lf-it"><${r.thumbUrl ? `img src="${avsUrl(r.thumbUrl)}" alt=""` : 'div class="ph"'}>${r.thumbUrl ? '' : '</div>'}
        <div><div class="tt">${esc(r.name)}</div><div class="mt">${new Date(r.at).toLocaleString('vi-VN')}</div>
        <div class="b"><button class="ui-btn ui-btn--sm" data-topen="${i}"><i class="ti ti-edit"></i> Mở</button>${r.mp4Url ? `<button class="ui-btn ui-btn--sm" data-tplay="${i}"><i class="ti ti-player-play"></i> Xem</button>` : ''}</div></div></div>`).join('')}</div>` : ''}`;
  }
  const topicResult = o => `<div class="lf-card"><h4><i class="ti ti-circle-check lf-c-ok"></i> Đã tạo xong</h4><div class="tt lf-strong">${esc(o.title || '')}</div>
    <div class="lf-bulk lf-mt"><button id="lf-topen"><i class="ti ti-edit"></i> Mở dự án</button>${o.mp4 ? '<button id="lf-tplay"><i class="ti ti-player-play"></i> Xem video</button>' : ''}</div></div>`;
  function bindTopic() {
    $('#lf-tgo').onclick = startTopic;
    const tp = S.runs.filter(r => r.kind === 'topic').slice(0, 6);
    document.querySelectorAll('#lf-body [data-topen]').forEach(b => b.onclick = () => openProject(tp[+b.dataset.topen].dir));
    document.querySelectorAll('#lf-body [data-tplay]').forEach(b => b.onclick = () => play({ title: tp[+b.dataset.tplay].name, mp4Url: tp[+b.dataset.tplay].mp4Url }));
    const o = S.topicOut;
    if (o) { $('#lf-topen').onclick = () => openProject(o.dir); const p = $('#lf-tplay'); if (p) p.onclick = () => play({ title: o.title, mp4Url: '/api/longform/file?p=' + encodeURIComponent(o.mp4) }); }
  }
  async function startTopic() {
    const topic = $('#lf-topic').value.trim();
    if (topic.length < 4) return Studio.toast('Nhập chủ đề trước');
    const b = { topic, dur: +$('#lf-dur').value, orient: $('#lf-tor').value, voice: $('#lf-voice').value, handle: $('#lf-handle').value.trim(), export: $('#lf-texp').checked };
    for (const [k, v] of [['topic', topic], ['dur', b.dur], ['tor', b.orient], ['voice', b.voice], ['handle', b.handle], ['texp', b.export ? '1' : '0']]) LSset(k, v);
    const r = await api('/api/longform/topic', b);
    if (!r.ok) return Studio.toast(r.error || 'Không chạy được');
    progress('Đang tạo video từ chủ đề…', async j => { Studio.closeModal(); S.topicOut = j.out; await refresh(); Studio.toast('Đã tạo video'); });
  }

  Studio.addPanel('longform', 'ti-scissors', 'Video dài', () => { render(); refresh(); });
})();
