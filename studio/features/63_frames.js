// Missing video frames (M63): when the project's frame folder is empty (copied without work/frames), rebuild it from the
// project's video instead of previewing black. Route: studio/routes/63_frames.mjs.
// S22 M156 (K2): no dialog any more. Frames that can be rebuilt are rebuilt right away, with a notice strip (Studio.notice,
// 01_setup.js) showing progress; when done the page reloads (frame <img> URLs that 404'd are cached) unless a dialog or the
// welcome screen is open, then the strip offers "Tải lại". Frames whose source video is gone: a strip saying so.
// Polls /api/job itself (not Studio.pollJob, which is a single shared timer another flow may take over).
(() => {
  const S = window.Studio, esc = S.esc;
  const note = o => (S.notice ? S.notice('frames', o) : S.toast(o.text.replace(/<[^>]+>/g, '')));
  const busy = () => document.getElementById('modal')?.hidden === false || !!document.getElementById('onb-home') || !!document.getElementById('onb-wiz');
  const names = list => list.map(m => `<code>${esc(m.seq)}</code>`).join(', ');
  const retry = () => ({ label: 'Thử lại', icon: 'ti-refresh', primary: true, on: () => { start(); return false; } });

  async function follow() {
    for (;;) {
      await new Promise(ok => setTimeout(ok, 800));
      let j; try { j = await S.api('/api/job'); } catch { continue; }
      if (!j || j.state === 'running') {
        if (j) note({ tone: 'warn', icon: 'ti-loader-2', text: `Đang tạo lại khung hình video… ${Math.round((j.progress || 0) * 100)}%` });
        continue;
      }
      if (j.state === 'done') {
        if (!busy()) return location.reload();
        return note({ tone: 'ok', icon: 'ti-check', text: 'Đã tạo lại khung hình. Tải lại trang để preview hết đen.',
          acts: [{ label: 'Tải lại', icon: 'ti-refresh', primary: true, on: () => location.reload() }, { label: 'Để sau' }] });
      }
      return note({ tone: 'err', icon: 'ti-alert-triangle', text: `Chưa tạo lại được khung hình: ${esc(j.step || j.state)}`, acts: [retry(), { label: 'Đóng' }] });
    }
  }
  async function start() {
    let r; try { r = await S.api('/api/frames/rebuild', {}); } catch (e) { r = { error: e.message }; }
    if (!r?.ok) {
      return note({ tone: 'warn', icon: 'ti-photo-off', text: `Dự án thiếu khung hình video, chưa tạo lại được: ${esc(r?.error || 'đang có tác vụ khác chạy')}`,
        acts: [retry(), { label: 'Để sau' }] });
    }
    note({ tone: 'warn', icon: 'ti-loader-2', text: 'Dự án thiếu khung hình video: đang tạo lại từ video gốc…' });
    follow();
  }

  // ---- S29 M213: khung xem trước 540p (engine/preview_proxy.js, route /api/frames/proxy) ----
  // Nút "540p" cạnh nút phóng to: Tự động → Bật → Tắt (lưu trên máy này). Bật thì trích lười chuỗi 540p còn thiếu (chạy nền,
  // không chiếm job), xong thì S.proxyMap = {chuỗi gốc: chuỗi 540p} và preview dựng lại; render không dùng S.proxyMap.
  const KEY = 'avs.proxy540', NEXT = { auto: 'on', on: 'off', off: 'auto' };
  const prefGet = () => { try { const v = localStorage.getItem(KEY); return NEXT[v] ? v : 'auto'; } catch { return 'auto'; } };
  const prefSet = v => { try { localStorage.setItem(KEY, v); } catch {} };
  let btn = null, gen = 0;
  const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
  function apply(map) {
    if (same(S.proxyMap, map)) return;
    S.proxyMap = map; S.redraw?.();
  }
  function paint(info) {
    if (!btn) return;
    const pref = prefGet(), on = !!info?.on, ready = on && Object.keys(info.map || {}).length, wait = on && info.pending?.some(m => m.state === 'running');
    btn.classList.toggle('on', !!ready);
    btn.setAttribute('aria-pressed', String(on));
    btn.innerHTML = `<span class="aspect sm">${wait ? '540…' : '540p'}</span>`;
    const why = pref !== 'auto' ? '' : on ? (info.profile === 'tiet-kiem' ? ' (profile Tiết kiệm)' : ' (máy render bằng SwiftShader)') : ' (máy đủ mạnh: dùng khung gốc)';
    btn.title = `Khung xem trước 540p: ${{ auto: 'Tự động', on: 'Bật', off: 'Tắt' }[pref]}${why}. Chỉ preview nhẹ hơn, video xuất vẫn đủ nét. Bấm để đổi.`;
  }
  async function proxySync() {
    const my = ++gen;
    let info; try { info = await S.api('/api/frames/proxy?pref=' + prefGet()); } catch { return; }
    if (my !== gen) return;
    paint(info);
    apply(info.on && Object.keys(info.map || {}).length ? info.map : null);
    if (!info.on || !info.pending?.length) return;
    if (info.pending.some(m => m.state === 'missing')) { try { await S.api('/api/frames/proxy', {}); } catch { return; } }
    else if (!info.pending.some(m => m.state === 'running')) return; // trích lỗi: giữ khung gốc, không thử lại liên tục
    setTimeout(() => { if (my === gen) proxySync(); }, 1500);
  }
  S.proxySync = proxySync;

  S.onReady(async () => {
    const cr = document.querySelector('#controls .cr');
    if (cr && !document.getElementById('proxy540')) {
      btn = document.createElement('button');
      btn.className = 'icon tog'; btn.id = 'proxy540';
      btn.onclick = () => { prefSet(NEXT[prefGet()]); proxySync(); };
      cr.prepend(btn);
    }
    proxySync();
    let list; try { list = await S.api('/api/frames/check'); } catch { return; }
    if (!Array.isArray(list) || !list.length) return;
    if (list.some(m => m.src)) return start();
    note({ tone: 'err', icon: 'ti-photo-off', text: `Thiếu khung hình video và không còn video nguồn (${names(list)}): tạo dự án mới bằng “Video mới”.`, acts: [{ label: 'Đóng' }] });
  });
})();
