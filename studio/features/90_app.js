// Mac app glue (references/app-render.md): "Mở thư mục" button, and progress for a project the app started
// from a video dropped on its icon (job running before any project is open): shown in the job tray (05_jobs.js).
(() => {
  Studio.onReady(() => Studio.addTopButton('<button class="ghost" id="app-reveal" title="Mở thư mục dự án trong Finder"><i class="ti ti-folder-open"></i></button>',
    async () => { const r = await Studio.api('/api/app/reveal', {}); if (!r.ok) Studio.toast('Chưa mở dự án'); }));
  // S26 M186: tạo dự án từ video kéo vào icon app (job 'new' chạy khi chưa mở dự án nào), hay tải lại trang lúc đang tạo dự án mới:
  // khay việc (05_jobs.js) tự nhận lại lúc khởi động; xong thì tải lại trang để mở dự án mới (server gửi X-AVS-Opened)
  Studio.jobs.resumable('new', () => ({ onDone: () => { location.reload(); return { text: 'Đang mở dự án mới…' }; },
    onFail: j => ({ text: j.step || 'Chưa tạo được dự án', acts: [{ label: 'Tải lại trang', icon: 'ti-refresh', on: () => location.reload() }] }) }));
})();
