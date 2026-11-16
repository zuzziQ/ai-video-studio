// Mô hình & giọng (M26, M27): hộp thoại chọn nhà cung cấp LLM cho việc chỉ có chữ (Claude / Ollama trên máy) và giọng VieNeu
// (máy chủ trên máy, 10 giọng có sẵn + giọng nhái có xác nhận quyền dùng giọng). API: studio/routes/28_engines.mjs.
// Cấu hình ở ~/.ai-video-studio/config.json.
(() => {
  const { $, esc } = Studio;
  const S = { tab: 'llm', cfg: null, st: null, loading: false, trying: false, tryRes: null, starting: false, playing: '', err: '', cloning: false, cloneOk: '' };
  const css = document.createElement('style');
  css.textContent = `
  .eng-tabs { margin: 0 0 var(--space-3); } .eng-tabs .ui-tab { display: inline-flex; align-items: center; gap: var(--space-1); }
  .eng-help { font-size: var(--text-xs); color: rgb(var(--color-fg-subtle)); line-height: 1.5; margin: var(--space-2) 0; }
  .eng-help code { font-size: var(--text-2xs); }
  .eng-st { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); padding: var(--space-2) var(--space-3); border-radius: var(--radius-control); background: rgb(var(--color-surface-muted)); border: 1px solid rgb(var(--color-line-strong)); margin: var(--space-2) 0; min-width: 0; }
  .eng-st > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .eng-st .dot { width: 8px; height: 8px; border-radius: var(--radius-pill); flex: none; background: rgb(var(--color-fg-subtle)); }
  .eng-st .dot.ok { background: rgb(var(--color-success)); } .eng-st .dot.bad { background: rgb(var(--color-danger)); }
  .eng-st button { flex: none; padding: var(--space-1) var(--space-3); font-size: var(--text-xs); }
  .eng-seg { display: flex; gap: var(--space-2); flex-wrap: wrap; } .eng-seg label { flex: 1 1 140px; min-width: 0; display: flex; gap: var(--space-2); align-items: flex-start; padding: var(--space-2) var(--space-3); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-control); cursor: pointer; font-size: var(--text-xs); line-height: 1.35; transition: border-color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard); }
  .eng-seg label:hover { border-color: rgb(var(--color-line-hover)); }
  .eng-seg label.on { border-color: rgb(var(--color-accent-text)); background: rgb(var(--color-accent-soft) / .14); }
  .eng-seg small { display: block; color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); }
  #modal .eng input[type=text], #modal .eng select { width: 100%; min-width: 0; box-sizing: border-box; }
  .eng-res { margin-top: var(--space-2); overflow-wrap: anywhere; line-height: 1.45; } .eng-res > div { min-width: 0; }
  .eng-voices { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--space-2); max-height: 300px; overflow-y: auto; margin-top: var(--space-1); }
  .eng-voice { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-control); min-width: 0; cursor: pointer; }
  .eng-voice.on { border-color: rgb(var(--color-accent-text)); background: rgb(var(--color-accent-soft) / .14); }
  .eng-voice .nm { flex: 1; min-width: 0; font-size: var(--text-xs); } .eng-voice .nm small { display: block; color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .eng-voice button { flex: none; padding: var(--space-1) var(--space-2); }
  .eng-warn { color: rgb(var(--color-warning-text)); }
  .eng label.check.eng-fbl { margin-top: var(--space-3); gap: var(--space-2); font-size: var(--text-xs); }
  .eng-clone { border: 1px dashed rgb(var(--color-line-strong)); border-radius: var(--radius-control); padding: var(--space-3); margin-top: var(--space-3); min-width: 0; }
  .eng-clone h4 { margin: 0 0 var(--space-2); font-size: var(--text-sm); }
  .eng-clone .row2 > div { min-width: 0; }
  #modal .eng-clone input[type=file] { width: 100%; min-width: 0; font-size: var(--text-xs); }
  #modal .eng-clone input[type=number] { width: 100%; box-sizing: border-box; }
  .eng-clone label.check { display: flex; gap: var(--space-2); align-items: flex-start; font-size: var(--text-xs); margin-top: var(--space-2); line-height: 1.4; }`;
  document.head.appendChild(css);

  const box = () => $('#modalbox');
  const isOpen = () => !!box()?.querySelector('.eng') && !$('#modal').hidden;
  async function load(withStatus = true) {
    S.cfg = await Studio.api('/api/engines').catch(e => ({ error: e.message }));
    if (S.cfg?.tts) Studio.ttsDefault = S.cfg.tts.default_engine || '';
    if (withStatus) { S.loading = true; if (isOpen()) render(); S.st = await Studio.api('/api/engines/status').catch(() => null); S.loading = false; }
  }
  async function open(tab) {
    if (tab) S.tab = tab;
    S.err = ''; S.tryRes = null;
    Studio.modal('<div class="eng"><div class="ui-state ui-state--loading" role="status"><i class="ti ti-loader-2 ui-state__icon"></i> Đang đọc cấu hình…</div></div>');
    await load(false); render(); await load(true); if (isOpen()) render();
  }
  const dot = ok => `<i class="dot ${ok == null ? '' : ok ? 'ok' : 'bad'}"></i>`;
  const envNote = on => on ? ' <span class="eng-warn" title="Biến môi trường đang ghi đè giá trị trong config.json">(biến môi trường)</span>' : '';

  function llmTab() {
    const c = S.cfg.llm, o = S.st?.ollama, ol = c.text === 'ollama';
    const stat = S.loading && !S.st ? `${dot(null)}<span>Đang kiểm Ollama…</span>`
      : o?.reachable ? `${dot(o.has_model)}<span>Ollama đang chạy ở <code>${esc(c.ollama.url)}</code>. ${o.has_model ? `Có model <b>${esc(c.ollama.model)}</b>.` : `<b>Chưa có model ${esc(c.ollama.model)}</b>: chạy <code>ollama pull ${esc(c.ollama.model)}</code>.`}</span>`
      : `${dot(false)}<span>Không kết nối được Ollama ở <code>${esc(c.ollama.url)}</code>${o?.error ? ` (${esc(o.error)})` : ''}. Cài Ollama (ollama.com) rồi mở ứng dụng hoặc chạy <code>ollama serve</code>.</span>`;
    const models = o?.models || [];
    const r = S.tryRes;
    return `<p class="eng-help">Việc <b>chỉ có chữ</b> (hook, kịch bản, caption đăng) chạy bằng nhà cung cấp chọn ở đây. Việc cần <b>xem ảnh</b> (QC khung hình, tạo style từ video) luôn dùng Claude.</p>
      <span class="lbl">Nhà cung cấp cho việc chỉ có chữ${envNote(c.env.text)}</span>
      <div class="eng-seg">${[['claude', 'Claude', 'Lệnh claude trên máy (tài khoản Claude của bạn)'], ['ollama', 'Ollama', 'Model chạy trên máy này, không gửi chữ ra ngoài']].map(([k, n, d]) =>
        `<label class="${c.text === k ? 'on' : ''}"><input type="radio" name="eng-text" value="${k}" ${c.text === k ? 'checked' : ''}><span><b>${n}</b><small>${d}</small></span></label>`).join('')}</div>
      <div class="eng-st" id="eng-ost">${stat}<button data-eng="recheck" title="Kiểm lại"><i class="ti ti-refresh"></i></button></div>
      <div class="row2"><div><span class="lbl">Địa chỉ Ollama (chỉ máy này)${envNote(c.env.url)}</span><input type="text" id="eng-url" value="${esc(c.ollama.url)}" placeholder="http://127.0.0.1:11434" autocomplete="off" spellcheck="false"></div>
        <div><span class="lbl">Model${envNote(c.env.model)}</span><input type="text" id="eng-model" value="${esc(c.ollama.model)}" list="eng-models" placeholder="qwen2.5:7b" autocomplete="off" spellcheck="false">
        <datalist id="eng-models">${models.map(m => `<option value="${esc(m)}">`).join('')}</datalist></div></div>
      <label class="check eng-fbl"><input type="checkbox" id="eng-fb" ${c.fallback === 'claude' ? 'checked' : ''}> Ollama không chạy hoặc thiếu model thì dùng Claude thay (không báo lỗi job)${envNote(c.env.fallback)}</label>
      ${ol && !o?.reachable && c.fallback !== 'claude' && S.st ? '<p class="eng-help eng-warn">Ollama đang không chạy: mọi việc chỉ có chữ sẽ báo lỗi cho tới khi bật Ollama hoặc tick ô dùng Claude thay.</p>' : ''}
      ${r ? `<div class="ui-banner eng-res ${r.ok ? 'ui-banner--ok' : 'ui-banner--err'}" role="status"><div>${r.ok ? `<b>Được</b> · ${esc(r.provider)} · ${r.sec}s${r.fallbackFrom ? ` · Ollama lỗi nên đã dùng Claude (${esc(r.fallbackFrom)})` : ''}<br>${esc(r.result?.loi_chao || JSON.stringify(r.result))}`
        : `<b>Lỗi</b>${r.provider ? ` (${esc(r.provider)}${r.sec != null ? ` · ${r.sec}s` : ''})` : ''}: ${esc(r.error || '')}`}</div></div>` : ''}
      <div class="actions"><button data-eng="close">Đóng</button><button data-eng="try" ${S.trying ? 'disabled' : ''}><i class="ti ti-player-play"></i> ${S.trying ? 'Đang thử…' : 'Thử'}</button><button class="primary" data-eng="save-llm"><i class="ti ti-device-floppy"></i> Lưu</button></div>
      <p class="eng-help">"Thử" lưu trước rồi hỏi một câu JSON ngắn, giống <code>node scripts/llm.mjs try</code>.</p>`;
  }

  function voiceTab() {
    const t = S.cfg.tts, v = S.st?.vieneu, voices = v?.voices || [], cur = t.vieneu.voice || v?.default || '';
    const nClone = voices.filter(x => x.kind === 'clone').length, nPreset = voices.length - nClone;
    const stat = S.loading && !S.st ? `${dot(null)}<span>Đang kiểm máy chủ giọng…</span>`
      : v?.running ? `${dot(true)}<span>Máy chủ VieNeu đang chạy ở <code>${esc(t.vieneu.url)}</code> · ${nPreset} giọng có sẵn${nClone ? ` · ${nClone} giọng nhái` : ''}${v.loaded ? '' : ' · model nạp ở câu đầu (chậm vài chục giây)'}</span>`
      : `${dot(false)}<span>Máy chủ VieNeu không chạy ở <code>${esc(t.vieneu.url)}</code>.${v?.installed ? '' : ' Chưa cài: chạy <code>scripts\\install_vieneu.ps1</code> một lần.'}</span>${v?.installed ? `<button data-eng="start" ${S.starting ? 'disabled' : ''}><i class="ti ti-power"></i> ${S.starting ? 'Đang bật…' : 'Bật máy chủ'}</button>` : ''}`;
    const engines = [['vieneu', 'VieNeu', 'Trên máy, tiếng Việt; không chạy thì lùi edge-tts'], ['edge', 'Edge', 'Microsoft, cần Internet'], ...(S.cfg.platform === 'darwin' ? [['say', 'macOS say', 'Offline']] : [])];
    const de = t.default_engine || (S.cfg.platform === 'darwin' ? 'say' : 'edge');
    return `<p class="eng-help">Giọng đọc tiếng Việt chạy trên máy (VieNeu, 10 giọng có sẵn, giấy phép Apache-2.0) và giọng nhái tạo từ một đoạn ghi âm.</p>
      <div class="eng-st" id="eng-vst">${stat}<button data-eng="recheck" title="Kiểm lại"><i class="ti ti-refresh"></i></button></div>
      <span class="lbl">Giọng VieNeu${voices.length ? '' : ' (bật máy chủ để xem danh sách)'}</span>
      ${voices.length ? `<div class="eng-voices">${voices.map(x => `<label class="eng-voice ${x.name === cur ? 'on' : ''}"><input type="radio" name="eng-voice" value="${esc(x.name)}" ${x.name === cur ? 'checked' : ''}>
          <span class="nm">${esc(x.name)}<small title="${esc(x.style || '')}">${esc(x.style || [x.gender, x.region].filter(Boolean).join(' · '))}</small></span>
          <button data-eng="play" data-v="${esc(x.name)}" title="Nghe thử" ${S.playing ? 'disabled' : ''}><i class="ti ${S.playing === x.name ? 'ti-loader-2' : 'ti-volume'}"></i></button>
          ${x.kind === 'clone' ? `<button data-eng="rmclone" data-v="${esc(x.name)}" title="Xoá giọng nhái"><i class="ti ti-trash"></i></button>` : ''}</label>`).join('')}</div>`
        : `<div class="eng-help">${cur ? `Đang chọn: <b>${esc(cur)}</b>` : 'Chưa chọn giọng (dùng giọng mặc định của máy chủ).'}</div>`}
      ${v?.running && v.clone ? cloneBox() : v?.running ? '<p class="eng-help eng-warn">Máy chủ VieNeu đang chạy bản cũ chưa có nhái giọng: tắt tiến trình máy chủ rồi bấm "Bật máy chủ" lại.</p>' : ''}
      <span class="lbl">Câu đọc thử</span><input type="text" id="eng-ptext" maxlength="200" placeholder="Xin chào, đây là giọng đọc thử của AI Video Studio.">
      <span class="lbl">Giọng mặc định cho job Hàng loạt, Lồng tiếng và Video từ chủ đề</span>
      <div class="eng-seg">${engines.map(([k, n, d]) => `<label class="${de === k ? 'on' : ''}"><input type="radio" name="eng-de" value="${k}" ${de === k ? 'checked' : ''}><span><b>${n}</b><small>${d}</small></span></label>`).join('')}</div>
      <span class="lbl">Địa chỉ máy chủ VieNeu (chỉ máy này)${envNote(t.env.url)}</span><input type="text" id="eng-vurl" value="${esc(t.vieneu.url)}" placeholder="http://127.0.0.1:8771" autocomplete="off" spellcheck="false">
      ${S.err ? `<div class="ui-banner ui-banner--err eng-res" role="alert">${esc(S.err)}</div>` : ''}
      <div class="actions"><button data-eng="close">Đóng</button><button class="primary" data-eng="save-voice"><i class="ti ti-device-floppy"></i> Lưu</button></div>`;
  }

  function cloneBox() {
    return `<div class="eng-clone"><h4><i class="ti ti-user-plus"></i> Tạo giọng nhái</h4>
      <p class="eng-help">Một file ghi âm hoặc video có <b>một người</b> nói rõ, ít tạp âm; lấy 3–30 giây từ mốc bắt đầu. Máy chủ chỉ lưu đặc trưng giọng ở
        <code>~/.ai-video-studio/vieneu/voices</code>, không giữ file mẫu. Lần đầu mất vài chục giây (nạp model).</p>
      <div class="row2"><div><span class="lbl">File mẫu</span><input type="file" id="eng-cfile" accept="audio/*,video/*,.m4a,.mp3,.wav,.mp4,.mov"></div>
        <div><span class="lbl">Tên giọng</span><input type="text" id="eng-cname" maxlength="40" placeholder="vd Giọng Minh" autocomplete="off"></div></div>
      <div class="row2"><div><span class="lbl">Bắt đầu từ giây</span><input type="number" id="eng-cstart" min="0" step="0.5" value="0"></div>
        <div><span class="lbl">Ghi chú đồng ý (ai, khi nào)</span><input type="text" id="eng-cnote" maxlength="300" placeholder="vd Chính tôi, 15/11/2026" autocomplete="off"></div></div>
      <label class="check"><input type="checkbox" id="eng-cconsent"> <span>Tôi là chủ giọng này hoặc đã được chủ giọng đồng ý cho dùng. Không dùng giọng nhái để mạo danh hay
        làm quảng cáo giả lời người khác; nền tảng (Meta, TikTok) có thể yêu cầu ghi rõ nội dung dùng giọng AI.</span></label>
      ${S.cloneOk ? `<div class="ui-banner ui-banner--ok eng-res" role="status">${esc(S.cloneOk)}</div>` : ''}
      <div class="actions"><button data-eng="clone" ${S.cloning ? 'disabled' : ''}><i class="ti ${S.cloning ? 'ti-loader-2' : 'ti-wand'}"></i> ${S.cloning ? 'Đang tạo giọng…' : 'Tạo giọng'}</button></div></div>`;
  }
  async function createClone() {
    const f = $('#eng-cfile')?.files?.[0], name = $('#eng-cname').value.trim();
    S.err = ''; S.cloneOk = '';
    if (!f) S.err = 'Chọn file mẫu giọng';
    else if (!name) S.err = 'Đặt tên cho giọng nhái';
    else if (!$('#eng-cconsent').checked) S.err = 'Cần tick ô xác nhận quyền dùng giọng';
    else if (f.size > 50 * 1024 * 1024) S.err = 'File mẫu quá lớn (tối đa 50 MB): cắt ngắn bớt trước';
    if (S.err) return render();
    const ext = (f.name.match(/\.([a-z0-9]{2,5})$/i) || [, 'wav'])[1].toLowerCase();
    const qs = new URLSearchParams({ name: name.normalize('NFC'), consent: '1', ext, start: String(+$('#eng-cstart').value || 0) });
    const headers = { 'X-AVS-Consent-Note': encodeURIComponent($('#eng-cnote').value.trim()) }; // ghi chú có thể chứa tên người: không đưa vào URL
    S.cloning = true; render();
    try {
      const r = await fetch('/api/engines/voice/clone?' + qs, { method: 'POST', body: f, headers }).then(x => x.json()).catch(e => ({ error: e.message }));
      if (r.error || !r.ok) throw new Error(r.error || 'Không tạo được giọng nhái');
      S.st = { ...(S.st || {}), vieneu: r.vieneu };
      S.cloneOk = `Đã tạo giọng "${r.name}" từ ${r.seconds} giây mẫu. Bấm loa để nghe thử, chọn rồi Lưu để dùng làm giọng mặc định.`;
      for (const id of ['#eng-cname', '#eng-cnote']) if ($(id)) $(id).value = '';
    } catch (e) { S.err = 'Tạo giọng lỗi: ' + e.message; }
    S.cloning = false; if (isOpen()) render();
  }
  async function removeClone(name) {
    if (!confirm(`Xoá giọng nhái "${name}"? Job đang đặt giọng này sẽ phải chọn giọng khác.`)) return;
    const r = await Studio.api('/api/engines/voice/rm', { name }).catch(e => ({ error: e.message }));
    if (r.error) { S.err = r.error; return render(); }
    S.st = { ...(S.st || {}), vieneu: r.vieneu }; if (r.cfg) S.cfg = r.cfg; S.err = ''; Studio.toast('Đã xoá giọng nhái'); render();
  }

  function render() {
    if (!S.cfg) return;
    if (S.cfg.error) return Studio.modal(`<div class="eng"><h3>Mô hình & giọng</h3><div class="ui-banner ui-banner--err eng-res" role="alert">${esc(S.cfg.error)}</div><div class="actions"><button data-eng="close">Đóng</button></div></div>`);
    // giữ những gì người dùng đang nhập/chọn mà chưa lưu (render lại sau lỗi, sau khi kiểm trạng thái…)
    const keep = { url: $('#eng-url')?.value, model: $('#eng-model')?.value, vurl: $('#eng-vurl')?.value, ptext: $('#eng-ptext')?.value,
      cname: $('#eng-cname')?.value, cnote: $('#eng-cnote')?.value, cstart: $('#eng-cstart')?.value };
    const cfile = $('#eng-cfile')?.files, cconsent = $('#eng-cconsent')?.checked;
    const radios = Object.fromEntries(['eng-text', 'eng-voice', 'eng-de'].map(n => [n, box()?.querySelector(`.eng input[name="${n}"]:checked`)?.value]));
    const fb = $('#eng-fb')?.checked;
    Studio.modal(`<div class="eng"><h3><i class="ti ti-cpu"></i> Mô hình & giọng</h3>
      <div class="ui-tabs eng-tabs" role="tablist">${[['llm', 'ti-message-chatbot', 'Mô hình chữ (LLM)'], ['voice', 'ti-microphone', 'Giọng VieNeu']].map(([k, i, n]) => `<button role="tab" data-engtab="${k}" class="ui-tab" aria-selected="${S.tab === k}"><i class="ti ${i}"></i> ${n}</button>`).join('')}</div>
      ${S.tab === 'llm' ? llmTab() : voiceTab()}</div>`);
    for (const [id, k] of [['#eng-url', 'url'], ['#eng-model', 'model'], ['#eng-vurl', 'vurl'], ['#eng-ptext', 'ptext'], ['#eng-cname', 'cname'], ['#eng-cnote', 'cnote'], ['#eng-cstart', 'cstart']])
      if (keep[k] != null && $(id)) $(id).value = keep[k];
    if (cfile?.length && $('#eng-cfile')) $('#eng-cfile').files = cfile; // giữ file đã chọn khi vẽ lại
    if (cconsent && $('#eng-cconsent')) $('#eng-cconsent').checked = true;
    for (const [n, v] of Object.entries(radios)) {
      const el = v != null && [...box().querySelectorAll(`.eng input[name="${n}"]`)].find(i => i.value === v);
      if (el) { el.checked = true; el.closest('.eng-seg, .eng-voices')?.querySelectorAll('label').forEach(l => l.classList.toggle('on', l.contains(el))); }
    }
    if (fb != null && $('#eng-fb')) $('#eng-fb').checked = fb;
  }

  const radio = n => box().querySelector(`input[name="${n}"]:checked`)?.value;
  async function saveLlm(quiet) {
    const r = await Studio.api('/api/engines/llm', { text: radio('eng-text'), fallback: $('#eng-fb').checked ? 'claude' : '', url: $('#eng-url').value.trim(), model: $('#eng-model').value.trim() });
    if (r.error) { S.tryRes = { ok: false, error: r.error }; render(); return false; }
    S.cfg = r; if (!quiet) Studio.toast('Đã lưu nhà cung cấp LLM');
    return true;
  }
  async function saveVoice() {
    const body = { default_engine: radio('eng-de'), url: $('#eng-vurl').value.trim() }, v = radio('eng-voice');
    if (v) body.voice = v;
    const r = await Studio.api('/api/engines/voice', body);
    if (r.error) { S.err = r.error; return render(); }
    S.cfg = r; S.err = ''; Studio.ttsDefault = r.tts.default_engine || ''; Studio.toast('Đã lưu giọng'); render();
  }
  async function play(voice) {
    S.playing = voice; S.err = ''; render();
    try {
      const r = await fetch('/api/engines/voice/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voice, text: $('#eng-ptext')?.value.trim() || undefined }) });
      if (!r.ok || !/audio/.test(r.headers.get('Content-Type') || '')) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'HTTP ' + r.status); }
      const url = URL.createObjectURL(await r.blob()), a = new Audio(url);
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
    } catch (e) { S.err = 'Nghe thử lỗi: ' + e.message; }
    S.playing = ''; if (isOpen()) render();
  }

  document.addEventListener('click', async e => {
    if (!e.target.closest?.('#modalbox .eng')) return;
    let b;
    if ((b = e.target.closest('[data-engtab]'))) { S.tab = b.dataset.engtab; S.err = ''; return render(); }
    if (!(b = e.target.closest('[data-eng]'))) return;
    const a = b.dataset.eng;
    if (b.closest('label')) e.preventDefault(); // nút trong thẻ chọn giọng: không đổi lựa chọn
    if (a === 'close') return Studio.closeModal();
    if (a === 'recheck') { S.st = null; await load(true); return isOpen() && render(); }
    if (a === 'save-llm') { if (await saveLlm()) render(); return; }
    if (a === 'try') {
      if (!(await saveLlm(true))) return;
      S.trying = true; S.tryRes = null; render();
      S.tryRes = await Studio.api('/api/engines/llm/try', {}).catch(err => ({ ok: false, error: err.message }));
      S.trying = false; return isOpen() && render();
    }
    if (a === 'save-voice') return saveVoice();
    if (a === 'play') return play(b.dataset.v);
    if (a === 'clone') return createClone();
    if (a === 'rmclone') return removeClone(b.dataset.v);
    if (a === 'start') {
      S.starting = true; S.err = ''; render();
      const r = await Studio.api('/api/engines/voice/start', {}).catch(err => ({ ok: false, error: err.message }));
      S.starting = false;
      if (r.ok) { S.st = { ...(S.st || {}), vieneu: r.vieneu }; Studio.toast('Đã bật máy chủ VieNeu'); } else S.err = r.error;
      return isOpen() && render();
    }
  });
  document.addEventListener('change', e => {
    const t = e.target; if (!t.closest?.('#modalbox .eng') || t.type !== 'radio') return;
    t.closest('.eng-seg, .eng-voices')?.querySelectorAll('label').forEach(l => l.classList.toggle('on', l.contains(t)));
  });

  Studio.onReady(() => {
    Studio.addTopButton('<button class="ghost" id="eng-btn" title="Mô hình chữ (Claude / Ollama) và giọng đọc VieNeu"><i class="ti ti-cpu"></i> Mô hình & giọng</button>', () => open());
    load(false).catch(() => {});
  });
})();
