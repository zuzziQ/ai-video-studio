// S20 M143: kéo mục thư viện (chữ, sticker, hiệu ứng / khối HyperFrames, media) thả vào khung xem trước hoặc vào track timeline.
// Nguồn kéo ở library.js (libDragItem, dataTransfer DropCore.MIME = {kind, id}); chèn bằng libInsert (cùng hàm của nút bấm).
//   Khung #stagebox: chèn tại playhead, tâm element ở điểm thả (px thiết kế, K = rộng khung / DW).
//   Timeline #tlinner: chèn tại giây thả, vị trí mặc định; media thả vào Video chính → clip track chính (như cũ), track khác → lớp phủ.
// Khi kéo: vùng thả sáng lên (.drophot, token --color-drop), dấu tâm theo con trỏ trên khung; thả ra ngoài thì không làm gì.
'use strict';
(() => {
  const S = window.Studio, D = window.DropCore;
  if (!S || !D || typeof libInsert !== 'function') return;
  const stage = S.$('#stagebox'), tl = S.$('#tlinner');
  if (!stage || !tl) return;
  const has = e => [...(e.dataTransfer?.types || [])].includes(D.MIME);
  let hot = null, dot = null;
  const mark = el => { if (hot !== el) { hot?.classList.remove('drophot'); hot = el; el?.classList.add('drophot'); } };
  const clear = () => { mark(null); dot?.remove(); dot = null; };
  const payload = e => D.decode(e.dataTransfer.getData(D.MIME));

  // ---- khung xem trước ----
  const designAt = e => { const box = stage.getBoundingClientRect(); return D.stageToDesign(e.clientX, e.clientY, box, box.width / S.DW, S.DW, S.DH); };
  stage.addEventListener('dragover', e => {
    if (!has(e) || !S.TL) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; mark(stage);
    if (!dot) { dot = document.createElement('i'); dot.className = 'dropdot'; stage.appendChild(dot); }
    const box = stage.getBoundingClientRect();
    dot.style.left = (e.clientX - box.left) + 'px'; dot.style.top = (e.clientY - box.top) + 'px';
  });
  stage.addEventListener('dragleave', e => { if (hot === stage && !stage.contains(e.relatedTarget)) clear(); });
  stage.addEventListener('drop', e => {
    if (!has(e)) return;
    e.preventDefault(); e.stopPropagation(); clear();
    const d = payload(e), p = designAt(e);
    if (d && p && S.TL) libInsert(d, 'stage', p);
  });

  // ---- timeline ----
  const trackAt = e => e.target.closest?.('[data-track]');
  tl.addEventListener('dragover', e => {
    if (!has(e) || !S.TL) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    mark(trackAt(e) || tl);
  });
  tl.addEventListener('dragleave', e => { if (hot && !tl.contains(e.relatedTarget)) clear(); });
  tl.addEventListener('drop', e => {
    if (!has(e)) return;
    e.preventDefault(); e.stopPropagation(); clear();
    const d = payload(e); if (!d || !S.TL) return;
    const t = D.timelineToSec(e.clientX, tl.getBoundingClientRect().left, typeof PPS === 'number' ? PPS : 60,S.TL.duration);
    libInsert(d, 'timeline', { t, track: trackAt(e)?.dataset.track || '' });
  });

  // kéo xong (thả ra ngoài, Esc) → tắt sáng
  document.addEventListener('dragend', clear);
  document.addEventListener('drop', clear);
})();
