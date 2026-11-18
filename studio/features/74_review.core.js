// S22 M152: lõi thuần của khung xem lại kết quả Claude (Studio.review, giao diện ở 74_review.js). Không DOM: chạy trong trình
// duyệt (window.ReviewCore) và trong Node (scripts/tests/s22_review.test.mjs).
//   Một phiên xem lại có các mục (thay đổi): mỗi mục có khoảng thời gian [t0, t1] và hàm apply(tl, cap, commit) áp nó lên một
//   bản timeline. Hai kiểu: 'variants' (chọn một trong vài phương án, C27: bấm là xem, Nhận mới áp) và 'list' (nhiều thay đổi
//   độc lập: Nhận / Bỏ từng cái hoặc tất cả). Bản xem trước luôn dựng trên bản sao, không đụng timeline thật cho tới khi Nhận.
'use strict';
(function (root) {
  const PAD = 0.3; // phát lặp ±PAD giây quanh khoảng đổi
  const MIN = 0.8; // đoạn lặp ngắn nhất (giây): element chỉ hiện 1–2 khung vẫn kịp nhìn
  const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

  // Đoạn phát lặp cho khoảng [t0, t1] trong video dài dur: nới ±pad, kẹp vào [0, dur], ngắn quá thì kéo dài tới MIN.
  function range(t0, t1, dur, pad = PAD) {
    const D = num(dur, Infinity) > 0 ? num(dur, Infinity) : Infinity;
    let s = num(t0), e = num(t1, s);
    if (e < s) [s, e] = [e, s];
    let a = Math.max(0, s - pad), b = Math.min(D, e + pad);
    if (b - a < MIN) { b = Math.min(D, a + MIN); a = Math.max(0, b - MIN); }
    return { a: Math.round(a * 1000) / 1000, b: Math.round(b * 1000) / 1000 };
  }
  // Khi đang phát lặp: playhead ra khỏi đoạn (qua cuối, hoặc người dùng tua về trước đầu đoạn) → trả điểm đầu để tua về.
  function loopStep(T, r) {
    if (!r) return null;
    return T >= r.b || T < r.a - 0.05 ? r.a : null;
  }
  // Điểm đặt playhead khi mới mở / bấm một dòng: đầu đoạn lặp.
  const seekOf = r => (r ? r.a : 0);

  // ---------- phiên ----------
  function create(opts) {
    const mode = opts && opts.mode === 'variants' ? 'variants' : 'list';
    const items = (opts && Array.isArray(opts.items) ? opts.items : []).filter(Boolean).map((it, i) => ({
      ...it, i, t0: num(it.t0), t1: Math.max(num(it.t0), num(it.t1, num(it.t0))), st: 'open' }));
    const pick = mode === 'variants' && items.length ? Math.min(Math.max(0, Math.trunc(num(opts.pick, 0))), items.length - 1) : -1;
    return { mode, items, pick, focus: items.length ? Math.max(0, pick) : -1 };
  }
  const openIdx = s => s.items.filter(it => it.st === 'open').map(it => it.i);
  // Mục áp lên bản xem trước: biến thể đang chọn, hoặc mọi thay đổi còn chờ của danh sách.
  function previewIdx(s) {
    if (s.mode === 'variants') return s.pick >= 0 && s.items[s.pick]?.st === 'open' ? [s.pick] : [];
    return openIdx(s);
  }
  // Chọn biến thể i (chỉ xem, chưa áp). Trả true khi đổi.
  function pick(s, i) {
    if (s.mode !== 'variants' || !s.items[i] || s.items[i].st !== 'open' || s.pick === i) return false;
    s.pick = i; s.focus = i; return true;
  }
  function focus(s, i) {
    if (!s.items[i]) return false;
    if (s.mode === 'variants') return pick(s, i);
    if (s.focus === i) return false;
    s.focus = i; return true;
  }
  // Đánh dấu mục i đã Nhận ('done') hoặc Bỏ ('skip'). Biến thể: Nhận một cái thì các cái còn lại thành bỏ, phiên xong.
  // Trả { finished, focus } — focus: mục còn chờ kế tiếp (sau i, rồi vòng lại đầu) hoặc -1.
  function settle(s, i, st) {
    const it = s.items[i]; if (!it || it.st !== 'open') return { finished: !openIdx(s).length, focus: s.focus, changed: false };
    it.st = st === 'done' ? 'done' : 'skip';
    if (s.mode === 'variants' && it.st === 'done') for (const o of s.items) if (o.st === 'open') o.st = 'skip';
    const left = openIdx(s);
    const next = left.find(k => k > i) ?? left[0] ?? -1;
    s.focus = next;
    if (s.mode === 'variants') s.pick = next;
    return { finished: !left.length, focus: next, changed: true };
  }
  // Nhận tất cả của danh sách: trả các mục còn chờ (theo thứ tự) và đánh dấu xong.
  function settleAll(s) {
    const left = openIdx(s);
    for (const k of left) s.items[k].st = 'done';
    s.focus = -1; if (s.mode === 'variants') s.pick = -1;
    return left;
  }
  const counts = s => ({ open: openIdx(s).length, done: s.items.filter(it => it.st === 'done').length, skip: s.items.filter(it => it.st === 'skip').length });

  // ---------- phím ----------
  // k: { key, typing, mod, repeat }. Trả 'before' (giữ \ để xem bản cũ), { pick: i } (1…9 đổi biến thể), hoặc null.
  function keyAction(k, s) {
    if (!k || !s || k.typing || k.mod) return null;
    if (k.key === '\\') return 'before';
    if (s.mode === 'variants' && /^[1-9]$/.test(k.key || '')) { const i = +k.key - 1; return i < s.items.length ? { pick: i } : null; }
    return null;
  }
  // Vị trí vạch chia đôi (0…1) theo toạ độ chuột trên khung: kẹp 5–95 % để hai bên luôn còn thấy.
  function splitX(clientX, left, width) {
    const w = num(width); if (!(w > 0)) return 0.5;
    return Math.min(0.95, Math.max(0.05, (num(clientX) - num(left)) / w));
  }
  // Mốc thời gian ngắn cho danh sách: 0:04.2
  function stamp(t) {
    const v = Math.max(0, num(t)), m = Math.floor(v / 60), s = v - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  }

  // ---------- tìm element trong bản sao timeline ----------
  // cid của Studio: s3 (cảnh), s3l1 / s3n0 (dòng / nút của cảnh), s3b (huy hiệu), c5 (phụ đề).
  function locate(tl, cap, cid) {
    let m = /^c(\d+)$/.exec(cid || ''); if (m) return cap && cap[+m[1]] ? { obj: cap[+m[1]] } : null;
    m = /^s(\d+)(?:(l|n)(\d+)|(b))?$/.exec(cid || ''); if (!m) return null;
    const s = tl && tl.scenes && tl.scenes[+m[1]]; if (!s) return null;
    if (m[4]) return s.badge ? { obj: s.badge, scene: s } : null;
    if (m[2]) { const o = (m[2] === 'l' ? s.lines : s.nodes)?.[+m[3]]; return o ? { obj: o, scene: s } : null; }
    return { obj: s, scene: s };
  }
  // Lần sửa đầu giữ bản thiết kế ở _orig (như touch() của studio.js) — gọi khi Nhận áp lên timeline thật.
  function markOrig(obj) {
    if (obj && typeof obj === 'object' && !obj._orig) obj._orig = JSON.parse(JSON.stringify(obj, (k, v) => (k === 'cid' || k === '_orig' ? undefined : v)));
    return obj;
  }

  // ---------- S23 M159: âm thanh của bản xem trước ----------
  // Khung chính chỉ phát âm thanh của timeline thật; bản xem trước thêm SFX / nhạc (Tự động, AI dựng) thì phải tự phát phần
  // thêm đó. So theo nội dung (bỏ cid / _orig): mục có trong bản xem trước mà không có trong timeline thật → phát thêm.
  const akey = o => JSON.stringify(o, (k, v) => (k === 'cid' || k === '_orig' ? undefined : v));
  function audioExtra(real, prev) {
    const out = {};
    for (const k of ['sfx', 'music']) {
      const have = new Map();
      for (const o of (real && real.audio && real.audio[k]) || []) { const s = akey(o); have.set(s, (have.get(s) || 0) + 1); }
      out[k] = ((prev && prev.audio && prev.audio[k]) || []).filter(o => {
        if (!o || o.hidden) return false;
        const s = akey(o), n = have.get(s) || 0;
        if (n) { have.set(s, n - 1); return false; }
        return true;
      });
    }
    return out;
  }
  // SFX cần phát khi playhead đi từ `from` tới `to` (nhảy lùi, vd. phát lặp quay về đầu đoạn → không phát gì lần này)
  const sfxDue = (list, from, to) => (to < from ? [] : (list || []).filter(x => num(x.t) > from && num(x.t) <= to));

  const api = { PAD, MIN, range, loopStep, seekOf, create, openIdx, previewIdx, pick, focus, settle, settleAll, counts, keyAction, splitX, stamp, locate, markOrig, audioExtra, sfxDue };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReviewCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
