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

  S.onReady(async () => {
    let list; try { list = await S.api('/api/frames/check'); } catch { return; }
    if (!Array.isArray(list) || !list.length) return;
    if (list.some(m => m.src)) return start();
    note({ tone: 'err', icon: 'ti-photo-off', text: `Thiếu khung hình video và không còn video nguồn (${names(list)}): tạo dự án mới bằng “Video mới”.`, acts: [{ label: 'Đóng' }] });
  });
})();
