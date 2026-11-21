// M18: mục "Ảnh sản phẩm" trong Thuộc tính của khối có trường ảnh `image` (hero sản phẩm rv_product của gói review và khối
// cùng kiểu): chọn ảnh từ Media của dự án, tải ảnh mới lên (vào media/ như ô Media), hoặc bỏ ảnh (khối hiện ô giữ chỗ).
// Dự án trỏ hồ sơ sản phẩm (TL.ads.product) thì có thêm nút "Điền lại theo hồ sơ" (tên, thương hiệu, giá; 53_products.js fill).
// Đổi ảnh = một bước hoàn tác. Không gọi Claude.
'use strict';
(() => {
  const S = window.Studio;
  if (!S?._itop) return;
  const { esc, sect } = S;

  // loại khối có trường ảnh `image` ở cấp đầu (đọc từ ví dụ make() của gói style trong engine)
  const IMG_TYPES = new Map();
  function hasImage(type) {
    if (IMG_TYPES.has(type)) return IMG_TYPES.get(type);
    let ok = false;
    for (const p of S.win?.PACKS || []) for (const it of p.items || []) {
      if (it?.type !== type) continue;
      try { ok = Object.prototype.hasOwnProperty.call(it.make(0) || {}, 'image'); } catch { /* ví dụ hỏng: bỏ qua */ }
    }
    if (S.win?.PACKS) IMG_TYPES.set(type, ok);
    return ok;
  }
  const images = () => (typeof MEDIA !== 'undefined' ? MEDIA : []).filter(m => m.kind === 'image');
  const target = (c = S.sel) => (c?.kind === 'scene' && c.obj && hasImage(c.obj.type) ? c.obj : null);

  // đầu Thuộc tính (_itop), không phải một mục: ở chế độ Cơ bản mục ngoài "Cơ bản" bị thu sau "Thêm thuộc tính" (01_level.core.js)
  S._itop.push(c => {
    const o = target(c); if (!o) return '';
    const cur = typeof o.image === 'string' ? o.image : '', list = images();
    const known = !cur || list.some(m => m.path === cur);
    const opts = [['', '— Chưa có ảnh (ô giữ chỗ) —'], ...(known ? [] : [[cur, cur]]), ...list.map(m => [m.path, m.name])]
      .map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const thumb = cur && !/^(si:|https?:)/.test(cur) ? `<img class="pi-thumb" src="/project/${esc(cur)}" alt="">` : '';
    const prod = o.type === 'rv_product' && S.TL?.ads?.product
      ? `<button data-piact="refill"><i class="ti ti-package"></i> Điền lại theo hồ sơ</button>` : '';
    return sect(o.type === 'rv_product' ? 'Ảnh sản phẩm' : 'Ảnh', `<div id="pipanel">${thumb}
      <select data-pi="pick" aria-label="Ảnh của khối">${opts}</select>
      <div class="acts"><button data-piact="up" class="primary"><i class="ti ti-upload"></i> Tải ảnh lên</button>${cur ? '<button data-piact="clear"><i class="ti ti-x"></i> Bỏ ảnh</button>' : ''}${prod}</div>
      <input type="file" id="pi-file" accept="image/png,image/jpeg,image/webp" hidden>
      <div class="help">Ảnh nền trong suốt (PNG) hoặc nền trơn trông đẹp nhất. Ảnh mới vào mục Media của dự án.</div></div>`, 'ti-photo');
  });

  const css = document.createElement('style');
  css.textContent = `#pipanel .pi-thumb { display: block; max-width: 100%; max-height: 140px; margin: 0 auto var(--space-2); object-fit: contain; border-radius: var(--radius-sm); }
  #pipanel select { width: 100%; }`;
  document.head.appendChild(css);

  function setImage(o, v) {
    if (o.locked) return S.toast('Mục đang khoá · ⌥⇧L để mở khoá');
    if ((o.image || '') === v) return;
    S.pushUndo(); if (v) o.image = v; else o.image = '';
    S.changed(true);
  }
  async function upload(o, f) {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return S.toast('Chỉ nhận ảnh PNG, JPG hoặc WebP');
    S.toast('Đang tải ' + f.name + '…');
    try {
      const before = new Set(images().map(x => x.path));
      const list = await (await fetch('/api/upload?name=' + encodeURIComponent(f.name), { method: 'POST', body: f })).json();
      if (!Array.isArray(list)) throw new Error(list?.error || 'tải lên lỗi');
      if (typeof MEDIA !== 'undefined') MEDIA = list; // eslint-disable-line no-global-assign
      const m = list.find(x => x.kind === 'image' && !before.has(x.path)) || list.find(x => x.kind === 'image' && x.name === f.name);
      if (!m) throw new Error('không thấy ảnh vừa tải trong Media');
      setImage(o, m.path);
    } catch (e) { S.toast('Chưa tải được ảnh: ' + e.message); }
  }
  document.addEventListener('change', e => {
    const o = target(); if (!o) return;
    if (e.target.closest?.('#pipanel [data-pi="pick"]')) return setImage(o, e.target.value);
    if (e.target.id === 'pi-file' && e.target.closest('#pipanel')) { const f = e.target.files?.[0]; e.target.value = ''; upload(o, f); }
  });
  document.addEventListener('click', async e => {
    const b = e.target.closest?.('#pipanel [data-piact]'); if (!b) return;
    const o = target(); if (!o) return;
    if (b.dataset.piact === 'up') return document.getElementById('pi-file')?.click();
    if (b.dataset.piact === 'clear') return setImage(o, '');
    if (b.dataset.piact === 'refill') { // tên, thương hiệu, giá theo hồ sơ, kể cả khối tự thêm hoặc đã sửa tay (hoàn tác được)
      if (o.locked) return S.toast('Mục đang khoá · ⌥⇧L để mở khoá');
      S.pushUndo();
      if (!await S.products?.fill?.(o)) S.toast('Chưa đọc được hồ sơ sản phẩm của dự án');
    }
  });
})();
