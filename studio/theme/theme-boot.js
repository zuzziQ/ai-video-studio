// AI Video Studio: chọn nền sáng / tối (S25 M177, C38). Nạp ĐỒNG BỘ trong <head>, trước mọi <link> CSS, để trang không
// chớp màu: đặt <html data-theme="light|dark"> trước lần vẽ đầu.
// Lựa chọn lưu localStorage 'avs.theme' = 'system' (mặc định, theo hệ điều hành) | 'light' | 'dark'.
// API: AVSTheme.pref (lựa chọn), AVSTheme.mode (nền đang dùng), AVSTheme.set(v), AVSTheme.toggle() (công tắc: đổi
// sang nền kia, thành lựa chọn cố định). Mỗi lần nền đổi phát sự kiện 'avs:theme' trên document (detail { pref, mode })
// cho phần tự vẽ bằng canvas đọc lại màu từ token. Dùng chung cho studio/index.html và studio/ui.html.
'use strict';
(function () {
  var KEY = 'avs.theme', PREFS = ['system', 'light', 'dark'];
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var pref = 'system';
  try { var v = localStorage.getItem(KEY); if (PREFS.indexOf(v) >= 0) pref = v; } catch (e) { /* chế độ riêng tư: dùng mặc định */ }
  function resolve(p) { return p === 'system' ? (mq && mq.matches ? 'dark' : 'light') : p; }
  function apply(fire) {
    var mode = resolve(pref), root = document.documentElement, old = root.getAttribute('data-theme');
    root.setAttribute('data-theme', mode);
    if (fire && old !== mode) {
      try { document.dispatchEvent(new CustomEvent('avs:theme', { detail: { pref: pref, mode: mode } })); } catch (e) { /* trình duyệt cũ */ }
    }
  }
  var api = {
    PREFS: PREFS,
    get pref() { return pref; },
    get mode() { return resolve(pref); },
    set: function (v) {
      pref = PREFS.indexOf(v) >= 0 ? v : 'system';
      try { if (pref === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref); } catch (e) { /* không lưu được thì chỉ đổi lần này */ }
      apply(true);
      // đổi lựa chọn mà nền không đổi (vd. sáng cố định → theo hệ thống đang sáng) vẫn báo để nút / menu vẽ lại
      try { document.dispatchEvent(new CustomEvent('avs:themepref', { detail: { pref: pref, mode: resolve(pref) } })); } catch (e) { /* */ }
      return pref;
    },
    toggle: function () { return api.set(resolve(pref) === 'dark' ? 'light' : 'dark'); },
  };
  window.AVSTheme = api;
  apply(false);
  if (mq) {
    var onChange = function () { if (pref === 'system') apply(true); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }
  // tab khác đổi lựa chọn: theo luôn
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    pref = PREFS.indexOf(e.newValue) >= 0 ? e.newValue : 'system';
    apply(true);
    try { document.dispatchEvent(new CustomEvent('avs:themepref', { detail: { pref: pref, mode: resolve(pref) } })); } catch (er) { /* */ }
  });
})();
