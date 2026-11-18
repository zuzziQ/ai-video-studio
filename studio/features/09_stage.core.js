// Lõi thuần chỉnh tay trên sân khấu (S17 M124): loại cảnh nào đổi được riêng rộng / cao, kéo tay nắm cạnh, đường gióng,
// căn nhiều element, kiểm nhanh vùng an toàn / che mặt trên vị trí mới, kéo / zoom khung cắt video chính (a-roll).
// S20 M139: góc của tay nắm xoay, loại element sửa chữ tại chỗ được, kiểu chữ của ô gõ, cuộn timeline tới khối đang chọn.
// Không DOM, không gọi server: studio.js đo hộp phần tử (rectOf) rồi gọi các hàm ở đây. Chạy trong trình duyệt
// (window.StageCore) và trong Node (module.exports) cho scripts/tests/m124_stage.test.mjs. Mọi toạ độ là px thiết kế
// (720×1280 dọc, 1280×720 ngang); rect = {x, y, w, h} với x, y là góc trên trái.
'use strict';
(function (root) {
  // Rà engine/ (S17 M124): cảnh đọc được rộng / cao riêng.
  //   card: s.card = {x, y, w, h} góc trên trái — slate.js frame_grid, media_card; vertical.js hook_card, bubble_screen.
  //   wh:   s.w, s.h, tâm ngang cố định, s.y là tâm dọc — vertical.js follow_cta (nút Follow có khung).
  // Loại khác (chữ, sticker, emoji, logo…) chỉ có cỡ (size) nên chỉ có tay nắm góc phóng đều.
  const GEO = { frame_grid: 'card', media_card: 'card', hook_card: 'card', bubble_screen: 'card', follow_cta: 'wh', shape: 'card' };
  const CARD_DEF = {
    frame_grid: [{ x: 80, y: 140, w: 560, h: 1000 }, { x: 150, y: 96, w: 980, h: 551 }],
    media_card: [{ x: 110, y: 360, w: 500, h: 290 }],
    hook_card: [{ x: 50, y: 78, w: 620, h: 407 }],
    bubble_screen: [{ x: 8, y: 545, w: 704, h: 455 }],
    shape: [{ x: 210, y: 490, w: 300, h: 300 }, { x: 490, y: 210, w: 300, h: 300 }], // engine/shape.js DEF (S20 M144)
  };
  const WH_DEF = { follow_cta: { cx: 360, y: 858, w: 306, h: 98 } };
  // Cảnh tự đọc s.rot theo nghĩa riêng (engine/modules.js stamp, ui_showcase; engine/broll.js) — engine không xoay chồng.
  const NATIVE_ROT = new Set(['stamp', 'ui_showcase', 'broll']);
  const MIN = 24;
  const r1 = v => Math.round(v * 10) / 10;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const geoOf = type => GEO[type] || null;
  const canResize = (kind, type) => kind === 'scene' && !!GEO[type];
  function cardOf(s, landscape = false) {
    const d = CARD_DEF[s.type]; if (!d) return null;
    return { ...(landscape && d[1] ? d[1] : d[0]), ...(s.card || {}) };
  }
  // Hộp của cảnh rộng / cao (px thiết kế) — dùng cho ô số và tay nắm.
  function boxOf(s, landscape = false) {
    if (GEO[s.type] === 'card') { const c = cardOf(s, landscape); return { x: c.x, y: c.y, w: c.w, h: c.h }; }
    if (GEO[s.type] === 'wh') { const d = WH_DEF[s.type], w = s.w ?? d.w, h = s.h ?? d.h, y = s.y ?? d.y; return { x: d.cx - w / 2, y: y - h / 2, w, h }; }
    return null;
  }
  // Ghi hộp mới vào cảnh, đúng trường engine đọc. Trả cảnh (đã sửa tại chỗ).
  function setBox(s, b, landscape = false) {
    const R = Math.round;
    if (GEO[s.type] === 'card') { const c = cardOf(s, landscape); s.card = { ...c, x: R(b.x), y: R(b.y), w: R(Math.max(MIN, b.w)), h: R(Math.max(MIN, b.h)) }; }
    else if (GEO[s.type] === 'wh') { s.w = R(Math.max(MIN, b.w)); s.h = R(Math.max(MIN, b.h)); s.y = R(b.y + b.h / 2); }
    return s;
  }

  // Kéo tay nắm cạnh: edge 'n' | 's' | 'e' | 'w' (góc 'ne'… cũng được: đổi cả hai trục). sym = khối căn giữa (rộng đổi hai bên).
  function resizeEdge(r, edge, dx, dy, { min = MIN, sym = false } = {}) {
    let { x, y, w, h } = r;
    if (edge.includes('e')) { w = Math.max(min, w + (sym ? 2 * dx : dx)); if (sym) x = r.x + r.w / 2 - w / 2; }
    if (edge.includes('w')) { const nw = Math.max(min, w - (sym ? 2 * dx : dx)); x = sym ? r.x + r.w / 2 - nw / 2 : r.x + r.w - nw; w = nw; }
    if (edge.includes('s')) h = Math.max(min, h + dy);
    if (edge.includes('n')) { const nh = Math.max(min, h - dy); y = r.y + r.h - nh; h = nh; }
    return { x, y, w, h };
  }

  // Đường gióng: mép và giữa khung, mép vùng an toàn, mép và tâm các element khác đang hiện.
  function guideLines({ DW, DH, safe, rects = [] }) {
    const x = [0, DW / 2, DW], y = [0, DH / 2, DH];
    if (safe) { x.push(safe.x, safe.x + safe.w); y.push(safe.y, safe.y + safe.h); }
    for (const r of rects) { if (!r) continue; x.push(r.x, r.x + r.w / 2, r.x + r.w); y.push(r.y, r.y + r.h / 2, r.y + r.h); }
    return { x, y };
  }
  // Giá trị gần nhất trong lines (≤ thr): {d (độ dời), at (vị trí đường)} | null.
  function nearest(vals, lines, thr) {
    let best = null;
    for (const v of vals) for (const L of lines) { const d = L - v; if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: L }; }
    return best;
  }
  // Hộp đang kéo dính vào đường gióng: trả độ dời thêm và các đường đang khớp (để vẽ).
  function snapMove(r, lines, thr = 6) {
    const bx = nearest([r.x, r.x + r.w / 2, r.x + r.w], lines.x, thr), by = nearest([r.y, r.y + r.h / 2, r.y + r.h], lines.y, thr);
    const dx = bx ? bx.d : 0, dy = by ? by.d : 0, m = { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
    const hit = (vals, ls) => ls.filter(L => vals.some(v => Math.abs(v - L) < .5));
    return { dx, dy, gx: bx ? [...new Set(hit([m.x, m.x + m.w / 2, m.x + m.w], lines.x))] : [], gy: by ? [...new Set(hit([m.y, m.y + m.h / 2, m.y + m.h], lines.y))] : [] };
  }
  // Cạnh đang kéo dính vào đường gióng (tay nắm cạnh): sửa hộp sau resizeEdge.
  function snapEdge(r, edge, lines, thr = 6) {
    const o = { ...r }, gx = [], gy = [];
    if (edge.includes('e')) { const b = nearest([r.x + r.w], lines.x, thr); if (b) { o.w = Math.max(MIN, r.w + b.d); gx.push(b.at); } }
    if (edge.includes('w')) { const b = nearest([r.x], lines.x, thr); if (b) { o.x = r.x + b.d; o.w = Math.max(MIN, r.w - b.d); gx.push(b.at); } }
    if (edge.includes('s')) { const b = nearest([r.y + r.h], lines.y, thr); if (b) { o.h = Math.max(MIN, r.h + b.d); gy.push(b.at); } }
    if (edge.includes('n')) { const b = nearest([r.y], lines.y, thr); if (b) { o.y = r.y + b.d; o.h = Math.max(MIN, r.h - b.d); gy.push(b.at); } }
    return { r: o, gx, gy };
  }

  function union(rects) {
    const rs = rects.filter(Boolean); if (!rs.length) return null;
    const l = Math.min(...rs.map(r => r.x)), t = Math.min(...rs.map(r => r.y)), R = Math.max(...rs.map(r => r.x + r.w)), B = Math.max(...rs.map(r => r.y + r.h));
    return { x: l, y: t, w: R - l, h: B - t };
  }
  // Căn nhiều element theo khung bao của nhóm (như công cụ thiết kế): độ dời {dx, dy} cho từng hộp, cùng thứ tự.
  const ALIGN = ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'];
  function alignDeltas(rects, how) {
    const u = union(rects); if (!u || !ALIGN.includes(how)) return rects.map(() => ({ dx: 0, dy: 0 }));
    return rects.map(r => {
      if (!r) return { dx: 0, dy: 0 };
      if (how === 'left') return { dx: u.x - r.x, dy: 0 };
      if (how === 'right') return { dx: u.x + u.w - (r.x + r.w), dy: 0 };
      if (how === 'hcenter') return { dx: u.x + u.w / 2 - (r.x + r.w / 2), dy: 0 };
      if (how === 'top') return { dx: 0, dy: u.y - r.y };
      if (how === 'bottom') return { dx: 0, dy: u.y + u.h - (r.y + r.h) };
      return { dx: 0, dy: u.y + u.h / 2 - (r.y + r.h / 2) };
    });
  }

  // Phần của b bị a che (0..1).
  function coverFrac(a, b) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? (w * h) / Math.max(1, b.w * b.h) : 0;
  }
  // Hộp mặt từ faceAt() của engine ({x, y, h} px thiết kế, h có thể thiếu khi chỉ có TL.face cố định).
  function faceBox(f) {
    if (!f || !Number.isFinite(f.x) || !Number.isFinite(f.y)) return null;
    const h = f.h > 0 ? f.h * 1.2 : 288, w = h * .8;
    return { x: f.x - w / 2, y: f.y - h / 2, w, h };
  }
  // QC nhanh trên vị trí mới (cùng ngưỡng với scripts/ai_qc.mjs: che mặt > 15 %): text_offcanvas, text_unsafe, face_cover.
  // cover = cảnh phủ cả khung (bố cục) thì không xét che mặt.
  function quickCheck(r, { DW, DH, safe, face, cover = false } = {}) {
    if (!r) return [];
    const out = [];
    if (r.x < -1 || r.y < -1 || r.x + r.w > DW + 1 || r.y + r.h > DH + 1) out.push({ kind: 'text_offcanvas', msg: 'Tràn ra ngoài khung hình' });
    else if (safe && (r.x < safe.x || r.y < safe.y || r.x + r.w > safe.x + safe.w || r.y + r.h > safe.y + safe.h)) out.push({ kind: 'text_unsafe', msg: 'Ra ngoài vùng an toàn (bị nút TikTok/Reels che)' });
    const fb = cover ? null : faceBox(face);
    if (fb) { const f = coverFrac(r, fb); if (f > .15) out.push({ kind: 'face_cover', msg: `Che ${Math.round(f * 100)}% khuôn mặt`, frac: Math.round(f * 100) / 100 }); }
    return out;
  }

  // Khung cắt video chính chỉnh tay (clip.crop_manual): ox / oy (% nguồn) vừa là object-position vừa là tâm zoom.
  // Kéo nội dung sang phải dx px = lộ thêm phần bên trái = ox giảm. ar = rộng/cao nguồn, boxAr = rộng/cao khung.
  function panCrop({ ox = 50, oy = 45, zoom = 1 }, dx, dy, { ar = 16 / 9, boxAr = 9 / 16, DW = 720, DH = 1280 } = {}) {
    const overX = Math.max(0, ar / boxAr - 1) * DW + (zoom - 1) * DW, overY = Math.max(0, boxAr / ar - 1) * DH + (zoom - 1) * DH;
    const nx = overX > 1 ? ox - dx / overX * 100 : ox, ny = overY > 1 ? oy - dy / overY * 100 : oy;
    return { ox: r1(clamp(nx, 0, 100)), oy: r1(clamp(ny, 0, 100)) };
  }
  const zoomCrop = (z0, f) => Math.round(clamp((z0 || 1) * f, 1, 3) * 100) / 100;
  // Góc xoay về (-180, 180], một chữ số lẻ; không phải số → 0.
  function rotNorm(v) {
    let d = Number(v); if (!Number.isFinite(d)) return 0;
    d = ((d % 360) + 360) % 360; if (d > 180) d -= 360;
    return r1(d) || 0;
  }
  // Xoay: chữ graphic, node sơ đồ, cảnh (engine applyRot); phụ đề và huy hiệu thì không.
  const canRotate = kind => kind === 'line' || kind === 'node' || kind === 'scene';

  // S20 M139: tay nắm xoay — góc mới khi kéo từ p0 tới p quanh tâm c (px bất kỳ, cùng hệ). step > 0 (Shift) bắt theo bội step;
  // không có step thì hít 0 / 90 / 180 / -90 khi lệch ≤ snap độ.
  function rotFromDrag(c, p0, p, rot0 = 0, { step = 0, snap = 3 } = {}) {
    const a = q => Math.atan2(q.y - c.y, q.x - c.x) * 180 / Math.PI;
    let d = rotNorm((+rot0 || 0) + a(p) - a(p0));
    if (step > 0) d = rotNorm(Math.round(d / step) * step);
    else for (const k of [-180, -90, 0, 90, 180]) if (Math.abs(d - k) <= snap) { d = rotNorm(k); break; }
    return d;
  }
  // Sửa chữ tại chỗ: loại element có ô `text` chính (chữ thêm, chữ graphic, node sơ đồ, chữ LED / neon).
  // Phụ đề không: từng từ có mốc giờ riêng (sửa ở tab Lời thoại / inspector).
  const TEXT_SCENES = new Set(['led_text', 'neon_text']);
  const canEditText = (kind, obj) => !!obj && typeof obj.text === 'string' && (kind === 'line' || kind === 'node' || (kind === 'scene' && TEXT_SCENES.has(obj.type)));
  // Kiểu chữ của ô gõ tại chỗ, chép từ getComputedStyle của phần tử engine; cỡ chữ / giãn chữ / bóng nhân K (tỉ lệ preview).
  // Màu trong suốt (chữ gradient kiểu background-clip) thì dùng trắng để vẫn thấy chữ đang gõ.
  function editStyle(cs, K = 1) {
    const px = v => { const n = parseFloat(v); return Number.isFinite(n) ? `${r1(n * K)}px` : null; };
    const shadow = s => (!s || s === 'none' ? null : s.replace(/(-?\d*\.?\d+)px/g, (_, n) => `${r1(+n * K)}px`));
    const clear = c => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
    const out = {
      fontFamily: cs.fontFamily || null, fontWeight: cs.fontWeight || null, fontStyle: cs.fontStyle || null,
      fontSize: px(cs.fontSize), letterSpacing: cs.letterSpacing && cs.letterSpacing !== 'normal' ? px(cs.letterSpacing) : null,
      lineHeight: cs.lineHeight && cs.lineHeight !== 'normal' ? px(cs.lineHeight) : null,
      textTransform: cs.textTransform && cs.textTransform !== 'none' ? cs.textTransform : null,
      textShadow: shadow(cs.textShadow), color: clear(cs.color) ? '#fff' : cs.color, // design-token-ok: chữ của video, không phải UI
    };
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v != null));
  }
  // Cuộn timeline để thấy khối: view / box = {l, r, t, b} (px màn hình). Trả {dx, dy} cần cộng vào scrollLeft / scrollTop.
  function revealDelta(view, box, pad = 24) {
    const ax = (lo, hi, a, b) => {
      if (b - a > hi - lo - 2 * pad) return a < lo + pad || a > hi - pad ? a - (lo + pad) : 0; // khối dài hơn tầm nhìn: chỉ cần thấy đầu khối
      if (a < lo + pad) return a - (lo + pad);
      if (b > hi - pad) return b - (hi - pad);
      return 0;
    };
    return { dx: Math.round(ax(view.l, view.r, box.l, box.r)), dy: Math.round(ax(view.t, view.b, box.t, box.b)) };
  }

  // S23 M160 (PR 175): vị trí mới của cảnh không có thẻ (x, y, size). Chỉ ghi size khi người dùng đổi cỡ thật (khác cỡ đang thấy):
  // dời bằng chuột / phím mang theo size mặc định của getPos, ghi nó vào cảnh chưa có size làm khối HF (size = % cỡ vừa khung,
  // mặc định 100) co lại. def = cỡ mặc định của loại cảnh (0 = loại không có cỡ). Trả patch {x, y, size?}.
  function posPatch(o, p, def) {
    const out = { x: Math.round(p.x), y: Math.round(p.y) };
    const cur = o.size ?? def;
    if (p.size && def !== 0 && !(Math.abs(p.size - cur) < 1e-3)) out.size = Math.round(p.size * 10) / 10;
    return out;
  }
  // S23 M160 (PR 174): khung chọn xoay theo element. r = hộp chưa xoay (px thiết kế), rot (độ), K (px màn / px thiết kế), pad (px màn).
  // Trả {l, t, w, h, rot} (px màn, rot = 0 khi không xoay) để vẽ div rồi CSS rotate quanh tâm (tâm hộp không đổi khi xoay).
  function selFrame(r, rot, K, pad = 3) {
    const d = rotNorm(rot);
    return { l: r.x * K - pad, t: r.y * K - pad, w: r.w * K + pad * 2, h: r.h * K + pad * 2, rot: d };
  }
  // Kéo cạnh của element đã xoay: đổi độ dời trên màn (dx, dy) sang hệ trục của element (xoay ngược rot độ).
  function unrotate(dx, dy, rot) {
    const a = -(rotNorm(rot) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return { dx: dx * c - dy * s, dy: dx * s + dy * c };
  }

  const T = { GEO, CARD_DEF, WH_DEF, NATIVE_ROT, ALIGN, TEXT_SCENES, geoOf, canResize, cardOf, boxOf, setBox, resizeEdge, guideLines, snapMove, snapEdge, union, alignDeltas, coverFrac, faceBox, quickCheck, panCrop, zoomCrop, rotNorm, canRotate,
    rotFromDrag, canEditText, editStyle, revealDelta, posPatch, selFrame, unrotate };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.StageCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
