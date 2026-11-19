// AI Video Studio — nền sáng / tối (S25 M177, C38).
// Nền được đặt trước khi vẽ bởi studio/theme/theme-boot.js (AVSTheme). File này chỉ gắn chỗ chọn:
// - công tắc trên thanh đầu, ngay trước ⋯: bấm là đổi sang nền kia (thành lựa chọn cố định);
// - mục "Giao diện" trong menu ⋯: Hệ thống · Sáng · Tối (mặc định Hệ thống);
// - lệnh trong ⌘K (04_cmdk.js gọi Studio.theme).
// Studio.theme = { get pref, get mode, set(v), toggle() }. Phần tự vẽ bằng canvas nghe 'avs:theme' để vẽ lại.
// Khung xem trước, màu track và engine không đổi theo nền (token --stage-*, --track-* giữ nguyên).
'use strict';
(() => {
  const S = Studio, T = window.AVSTheme;
  if (!T) return;
  const LABEL = { system: 'Hệ thống', light: 'Sáng', dark: 'Tối' };
  const ICON = { system: 'ti-device-desktop', light: 'ti-sun', dark: 'ti-moon' };
  S.theme = { get pref() { return T.pref; }, get mode() { return T.mode; }, set: v => T.set(v), toggle: () => T.toggle(), LABEL };

  const css = document.createElement('style');
  css.textContent = `
  #theme-sw { position: relative; }
  #theme-sw .ti { font-size: 18px; }
  #wf-more .th-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-1) var(--space-2); font-size: var(--text-sm); color: rgb(var(--color-fg-muted)); }
  #wf-more .th-row .wf-seg button { display: inline-flex; align-items: center; gap: var(--space-1); }
  `;
  document.head.appendChild(css);

  // công tắc: icon là nền sẽ chuyển sang (đang tối → mặt trời)
  const sw = document.createElement('button');
  sw.id = 'theme-sw'; sw.className = 'icon'; sw.type = 'button';
  function paintSwitch() {
    const next = T.mode === 'dark' ? 'light' : 'dark';
    sw.innerHTML = `<i class="ti ${ICON[next]}"></i>`;
    const tip = `Chuyển sang nền ${LABEL[next].toLowerCase()}` + (T.pref === 'system' ? ' (đang theo hệ thống)' : '');
    sw.title = tip; sw.setAttribute('aria-label', tip);
    sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', String(T.mode === 'dark'));
  }
  sw.addEventListener('click', () => { T.toggle(); S.toast?.(`Nền ${LABEL[T.mode].toLowerCase()}. Đổi lại "Theo hệ thống" trong menu ⋯`); });

  const row = document.createElement('div');
  row.className = 'th-row'; row.dataset.wf = 'theme';
  function paintRow() {
    row.innerHTML = `<span>Giao diện</span><span class="wf-seg" role="radiogroup" aria-label="Nền giao diện">${T.PREFS.map(p =>
      `<button type="button" data-theme-pref="${p}" class="${T.pref === p ? 'on' : ''}" role="radio" aria-checked="${T.pref === p}" title="${p === 'system' ? 'Theo nền của hệ điều hành' : 'Luôn nền ' + LABEL[p].toLowerCase()}"><i class="ti ${ICON[p]}"></i><span>${LABEL[p]}</span></button>`).join('')}</span>`;
  }
  row.addEventListener('click', e => { const b = e.target.closest('[data-theme-pref]'); if (b) T.set(b.dataset.themePref); });

  const paint = () => { paintSwitch(); paintRow(); };
  document.addEventListener('avs:theme', paint);
  document.addEventListener('avs:themepref', paint);
  paint();

  // thanh đầu và menu ⋯ do 01_workflow.js dựng sau file này
  S.onReady(() => {
    const more = document.getElementById('wf-morebtn');
    if (more) more.before(sw); else document.getElementById('save')?.before(sw);
    const menu = document.getElementById('wf-more'), anchor = menu?.querySelector('[data-wf="settings"]');
    if (anchor) anchor.before(row);
  });
})();
