// S20 M141: bảng phím tắt — phím ? (studio.js gọi Studio.showKeys) và mục "Phím tắt" trong menu ⋯ của thanh trên (01_workflow.js).
// Danh sách phím ở 67_keys.core.js (KeysCore.KEYMAP); ⌘ / ⌥ / ⇧ đổi thành Ctrl / Alt / Shift trên Windows và Linux.
'use strict';
(() => {
  const S = window.Studio, K = window.KeysCore;
  if (!S || !K) return;
  const { esc } = S;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const kbd = k => k.split(' / ').map(p => `<kbd>${esc(K.keyLabel(p, mac))}</kbd>`).join('<span class="kh-or">/</span>');

  function showKeys() {
    if (!$('#modal').hidden && $('#modalbox .keyhelp')) return S.closeModal();
    S.modal(`<h3><i class="ti ti-keyboard"></i> Phím tắt</h3>
      <div class="keyhelp">${K.KEYMAP.map(([g, rows]) => `<section><h4>${esc(g)}</h4><dl>${rows.map(([k, d]) => `<dt>${kbd(k)}</dt><dd>${esc(d)}</dd>`).join('')}</dl></section>`).join('')}</div>
      <p class="muted">Mũi tên: vừa bấm chọn element trên khung thì dời element; vừa bấm timeline hoặc không chọn gì thì lùi / tiến khung. Element khoá: bấm khối của nó trên timeline để chọn rồi mở khoá.</p>
      <div class="actions"><button id="kh-close" class="primary">Đóng</button></div>`);
    $('#kh-close').onclick = S.closeModal;
  }
  function $(q) { return document.querySelector(q); }
  S.showKeys = showKeys;
  // Esc đóng bảng (trước Esc = bỏ chọn của studio.js)
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modal').hidden && $('#modalbox .keyhelp')) { e.preventDefault(); e.stopImmediatePropagation(); S.closeModal(); }
  }, true);
  S.addTopButton(`<button class="ghost" id="keys-btn" title="Phím tắt (?)"><i class="ti ti-keyboard"></i></button>`, showKeys);
})();
