// Lớp trợ lý LLM phía giao diện (ROADMAP M91, references/assist.md). Route: studio/routes/05_assist.mjs, logic: scripts/assist.mjs.
//   Studio.assist(name, input, { onStep(step, progress) }) → Promise<kết quả {fields, warnings, provider, ms, …}>; lỗi ném Error
//     với đúng thông điệp của server (thiếu claude, chưa đăng nhập, quá giờ… lấy nguyên văn từ scripts/llm.mjs).
//   Studio.assistPanel({ name, label, hint, input, current, onAccept, filter }) → { mount(el), start(), state }
//     Ô đề xuất dùng chung: nút gọi AI → tiến độ (Huỷ) → danh sách đề xuất từng trường với Nhận / Bỏ / Nhận tất cả.
//     Trạng thái nằm trong đối tượng trả về nên phần gọi vẽ lại giao diện thì chỉ cần mount(el) lại. Không tự ghi đè gì:
//     chỉ gọi onAccept(field) khi người dùng bấm Nhận.
//   Studio.assistCancel() → dừng trợ lý đang chạy (POST /api/assist/cancel; không dừng xuất video).
//   Studio.imagePayload(src, { max, type }) → data URL ảnh vẽ lại qua canvas (thu nhỏ, bỏ EXIF/vị trí chụp) để gửi cho trợ lý.
'use strict';
(() => {
  const { esc, api } = Studio;
  const css = document.createElement('style');
  css.textContent = `
  .as-box { margin: var(--space-3) 0 0; padding: var(--space-3); border: 1px solid rgb(var(--color-line-strong)); border-radius: var(--radius-control); background: rgb(var(--color-surface)); font-size: var(--text-xs); min-width: 0; }
  .as-head { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .as-head .as-hint { flex: 1 1 160px; min-width: 0; color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); line-height: 1.4; }
  .as-run { display: flex; gap: var(--space-2); align-items: center; color: rgb(var(--color-fg-muted)); } .as-run span { min-width: 0; overflow-wrap: anywhere; } .as-run .grow { flex: 1; }
  .as-bar { height: 4px; margin-top: var(--space-2); border-radius: var(--radius-pill); background: rgb(var(--color-surface-hover)); overflow: hidden; }
  .as-bar i { display: block; height: 100%; width: calc(var(--as-p, 0) * 100%); background: rgb(var(--color-accent-text)); transition: width var(--duration-base) var(--ease-standard); }
  .as-err { margin: 0 0 var(--space-2); color: rgb(var(--color-danger-text)); display: flex; gap: var(--space-1); align-items: flex-start; line-height: 1.5; overflow-wrap: anywhere; }
  .as-top { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-2); align-items: center; } .as-top b { font-size: var(--text-sm); } .as-top small { color: rgb(var(--color-fg-subtle)); } .as-top .grow { flex: 1; }
  .as-reason { margin: var(--space-2) 0 0; color: rgb(var(--color-fg-muted)); line-height: 1.5; }
  .as-warn { margin: var(--space-2) 0 0; padding: 0 0 0 var(--space-4); color: rgb(var(--color-warning-text)); font-size: var(--text-2xs); line-height: 1.5; } .as-warn li { overflow-wrap: anywhere; }
  .as-rows { margin-top: var(--space-2); }
  .as-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-050) var(--space-2); padding: var(--space-2) 0; border-top: 1px solid rgb(var(--color-line)); }
  .as-k { grid-column: 1; font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); }
  .as-v { grid-column: 1; min-width: 0; overflow-wrap: anywhere; line-height: 1.5; color: rgb(var(--color-fg)); }
  .as-v code { font-family: var(--font-mono); font-size: var(--text-2xs); }
  .as-a { grid-column: 2; grid-row: 1 / span 2; align-self: center; display: flex; gap: var(--space-1); align-items: center; }
  .as-a button { padding: var(--space-1) var(--space-2); font-size: var(--text-2xs); }
  .as-note, .as-cur { display: block; font-size: var(--text-2xs); color: rgb(var(--color-fg-subtle)); }
  .as-note.med { color: rgb(var(--color-warning-text)); } .as-note.high { color: rgb(var(--color-danger-text)); }
  .as-sw { display: inline-block; width: 14px; height: 14px; vertical-align: -2px; margin-right: var(--space-1); border-radius: var(--radius-xs); border: 1px solid rgb(var(--color-white) / .2); background: var(--as-c); }
  .as-row.done .as-v, .as-row.skip .as-v { color: rgb(var(--color-fg-subtle)); } .as-row.skip .as-v { text-decoration: line-through; }
  .as-ok { color: rgb(var(--color-success-text)); font-size: var(--text-2xs); white-space: nowrap; } .as-no { color: rgb(var(--color-fg-subtle)); font-size: var(--text-2xs); white-space: nowrap; }
  .as-foot { display: flex; gap: var(--space-2); margin-top: var(--space-2); }`;
  document.head.appendChild(css);

  const sleep = ms => new Promise(ok => setTimeout(ok, ms));
  // POST rồi hỏi kết quả mỗi 0,8 s (setTimeout, không dựa vào animation: trang chạy nền vẫn đi tiếp).
  async function assist(name, input, { onStep } = {}) {
    const r = await api('/api/assist/' + encodeURIComponent(name), input);
    if (!r || r.error) throw new Error(r?.error || 'Không gọi được trợ lý');
    for (;;) {
      await sleep(800);
      let s; try { s = await api('/api/assist/' + encodeURIComponent(name)); } catch { continue; } // mạng chập chờn: hỏi lại
      if (!s || s.run !== r.run) continue;
      if (s.state === 'running') { onStep?.(s.step, s.progress); continue; }
      if (s.state === 'done') return s;
      const e = new Error(s.error || 'Trợ lý lỗi'); e.kind = s.kind; e.state = s.state; throw e;
    }
  }

  // Trợ lý có ô job riêng (routes/05_assist.mjs): Huỷ chỉ dừng trợ lý, không đụng job xuất video.
  const cancel = () => api('/api/assist/cancel', {});

  // Vẽ lại ảnh qua canvas: thu nhỏ (cạnh dài ≤ max), đổi về PNG/JPEG, bỏ metadata. src: File, Blob hoặc URL cùng origin.
  async function imagePayload(src, { max = 768, type = 'image/png', quality = 0.9 } = {}) {
    let url = typeof src === 'string' ? src : URL.createObjectURL(src);
    const own = typeof src !== 'string';
    try {
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Không đọc được ảnh')); i.src = url; });
      const w = img.naturalWidth || 512, h = img.naturalHeight || 512, k = Math.min(1, max / Math.max(w, h));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL(type, quality);
    } finally { if (own) URL.revokeObjectURL(url); }
  }

  const PROV = { claude: 'Claude', ollama: 'Ollama', rules: 'Theo luật' };
  function valueHtml(f) {
    const v = f.value;
    if (f.kind === 'color') return `<span class="as-sw" data-asc="${esc(v)}"></span><code>${esc(v)}</code>`;
    if (f.kind === 'claim') return esc(v.text);
    if (f.kind === 'faq') return `<b>Hỏi:</b> ${esc(v.q)}<br><b>Đáp:</b> ${esc(v.a)}`;
    return esc(f.display || v);
  }
  const sev = f => (f.risk?.some(r => r.severity === 'high') ? 'high' : f.risk?.length ? 'med' : '');

  function panel(o) {
    const st = { state: 'idle', step: '', progress: 0, error: '', res: null, mark: {} }; // mark[id] = 'done' | 'skip'
    let el = null;
    const fields = () => (st.res?.fields || []).filter(f => !o.filter || o.filter(f));
    const paint = () => {
      if (!el || !el.isConnected) return;
      el.className = 'as-box';
      if (st.state === 'running') {
        el.innerHTML = `<div class="as-run"><i class="ti ti-loader-2 spin"></i><span>${esc(st.step || 'Đang gửi…')}</span><span class="grow"></span><button class="ghost mini" data-as="stop">Huỷ</button></div><div class="as-bar"><i></i></div>`;
        el.querySelector('.as-bar').style.setProperty('--as-p', String(st.progress || 0));
      } else if (st.state === 'done') {
        const fs = fields(), open = fs.filter(f => !st.mark[f.id]);
        el.innerHTML = `<div class="as-top"><b><i class="ti ti-sparkles"></i> Đề xuất của AI</b><small>${esc(PROV[st.res.provider] || st.res.provider || '')} · ${Math.max(1, Math.round((st.res.ms || 0) / 1000))} s</small><span class="grow"></span>
          ${open.length ? '<button class="primary mini" data-as="all"><i class="ti ti-checks"></i> Nhận tất cả</button>' : ''}</div>
          ${st.res.reason ? `<p class="as-reason">${esc(st.res.reason)}</p>` : ''}
          ${st.res.warnings?.length ? `<ul class="as-warn">${st.res.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
          <div class="as-rows">${fs.map(f => {
            const m = st.mark[f.id], cur = o.current ? o.current(f) : '';
            return `<div class="as-row ${m || ''}" data-id="${esc(f.id)}"><div class="as-k">${esc(f.label)}</div>
              <div class="as-v">${valueHtml(f)}${f.note ? `<small class="as-note ${sev(f)}">${esc(f.note)}</small>` : ''}${cur && !m ? `<small class="as-cur">Hiện tại: ${esc(cur)}</small>` : ''}</div>
              <div class="as-a">${m === 'done' ? '<span class="as-ok"><i class="ti ti-check"></i> Đã nhận</span>' : m === 'skip' ? '<span class="as-no">Đã bỏ</span>'
                : `<button class="mini" data-ok="${esc(f.id)}">Nhận</button><button class="ghost mini" data-no="${esc(f.id)}">Bỏ</button>`}</div></div>`;
          }).join('') || '<p class="as-reason">AI không có đề xuất nào cho phần này.</p>'}</div>
          <div class="as-foot"><button class="ghost mini" data-as="go"><i class="ti ti-refresh"></i> Hỏi lại</button></div>`;
        el.querySelectorAll('[data-asc]').forEach(s => s.style.setProperty('--as-c', s.dataset.asc));
      } else {
        el.innerHTML = `${st.state === 'error' || st.state === 'cancelled' ? `<p class="as-err"><i class="ti ti-alert-circle"></i><span>${esc(st.error)}</span></p>` : ''}
          <div class="as-head"><button data-as="go"><i class="ti ti-sparkles"></i> ${esc(st.state === 'error' ? 'Thử lại' : o.label || 'Gợi ý bằng AI')}</button><span class="as-hint">${esc(o.hint || 'AI chỉ đề xuất, bạn chọn Nhận hoặc Bỏ từng mục.')}</span></div>`;
      }
      el.querySelector('[data-as=go]')?.addEventListener('click', start);
      el.querySelector('[data-as=stop]')?.addEventListener('click', cancel);
      el.querySelector('[data-as=all]')?.addEventListener('click', async () => { for (const f of fields()) if (!st.mark[f.id]) await accept(f); });
      el.querySelectorAll('[data-ok]').forEach(b => b.addEventListener('click', () => accept(fields().find(f => f.id === b.dataset.ok))));
      el.querySelectorAll('[data-no]').forEach(b => b.addEventListener('click', () => { st.mark[b.dataset.no] = 'skip'; paint(); }));
    };
    async function accept(f) {
      if (!f || st.mark[f.id]) return;
      try { await o.onAccept(f); st.mark[f.id] = 'done'; } catch (e) { Studio.toast(e.message); }
      paint();
    }
    async function start() {
      if (st.state === 'running') return;
      Object.assign(st, { state: 'running', step: 'Đang chuẩn bị…', progress: 0, error: '', res: null, mark: {} }); paint();
      try {
        const input = await o.input();
        st.res = await assist(o.name, input, { onStep: (s, k) => { st.step = s; st.progress = k; paint(); } });
        st.state = 'done';
      } catch (e) { st.state = e.state === 'cancelled' ? 'cancelled' : 'error'; st.error = e.message; }
      paint();
    }
    return { mount(e) { el = e; paint(); }, start, state: st };
  }

  Object.assign(Studio, { assist, assistCancel: cancel, assistPanel: panel, imagePayload });
})();
