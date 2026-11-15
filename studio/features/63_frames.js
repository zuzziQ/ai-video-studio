// Missing video frames (M63): when the project's frame folder is empty (copied without work/frames), offer to rebuild it
// from the project's video instead of previewing black. Route: studio/routes/63_frames.mjs.
(() => {
  const S = window.Studio;
  S.onReady(async () => {
    let list; try { list = await S.api('/api/frames/check'); } catch { return; }
    if (!Array.isArray(list) || !list.length) return;
    const can = list.filter(m => m.src), esc = S.esc;
    const rows = list.map(m => `<li><code>${esc(m.seq)}</code> ${m.src ? `← <code>${esc(m.src)}</code>` : '<span class="muted">(không còn video nguồn)</span>'}</li>`).join('');
    S.modal(`<h3><i class="ti ti-photo-off"></i> Dự án thiếu khung hình video</h3>
      <p>Thư mục khung hình đang trống nên preview và bản xuất sẽ bị đen. Thường do dự án được chép thiếu thư mục <code>work/frames</code>.</p>
      <ul style="font-size:12px;margin:6px 0 0 18px">${rows}</ul>
      ${can.length ? '<p class="muted">Tạo lại bằng ffmpeg từ video trong dự án, mất khoảng vài giây cho mỗi phút video.</p>' : '<p class="muted">Không còn video nguồn: hãy tạo dự án mới bằng “Video mới”.</p>'}
      <div class="actions"><button onclick="closeModal()">Để sau</button>${can.length ? '<button class="primary" id="frgo"><i class="ti ti-refresh"></i> Tạo lại khung hình</button>' : ''}</div>`);
    const go = S.$('#frgo'); if (!go) return;
    go.onclick = async () => {
      const r = await S.api('/api/frames/rebuild', {});
      if (!r.ok) return S.toast(r.error || 'Đang có tác vụ khác chạy');
      S.modal('<h3>Đang tạo lại khung hình…</h3><div id="jobstep" class="muted"></div><div class="bar"><i></i></div><pre id="joblog"></pre>');
      S.pollJob(j => {
        if (j.state === 'done') return location.reload(); // frame <img> URLs that 404'd are cached: a full reload is the simple way
        S.modal(`<h3>Chưa tạo lại được</h3><p>${esc(j.step)}</p><pre>${esc((j.log || '').slice(-1200))}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
      });
    };
  });
})();
