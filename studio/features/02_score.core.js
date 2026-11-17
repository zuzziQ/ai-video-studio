// Lõi thuần chấm điểm từng bước (S14 M114, docs/plans/S14-xuat-cot-phai-diem.md mục 3): điểm 0–100 cho Chuẩn bị, Nguồn,
// Dựng, Kiểm tra, Xuất, mỗi bước một danh sách tiêu chí đạt / thiếu. Không đụng DOM, không gọi Claude, không đọc file:
// cột phải (03_nextstep.js) gom dữ liệu sẵn có rồi gọi score(). Chạy trong trình duyệt (window.ScoreCore) và trong Node
// (module.exports) cho scripts/tests/s14_score.test.mjs.
//
// input = {
//   tl,                 // timeline.json (brand, clips, captions bật/tắt, scenes, audio, ads, burnin, face_track…)
//   caps,               // số câu lời thoại
//   needs, pack,        // needs: ['product'|'broll'|'music'] của gói (PACKS[].needs, xem references/packs.md); pack: mục PACKS
//   burn,               // .studio/burnin.json (M110) qua GET /api/source: { found } | null
//   fillers,            // đã dò lỗi nói (.studio/fillers.json, GET /api/ai/fillers) → true
//   quick, qc,          // GET /api/qc/quick (M105), GET /api/qc
//   latest, edited,     // bản xuất mới nhất (exportsView/latestExport của scripts/exports_log.mjs qua GET /api/exports) + mtime timeline
// }
// → { steps: { <bước>: { score, items: [{ id, label, w, v (0..1), ok, opt, lost, miss, at? }] } } }
// Điểm bước = Σ(w·v) / Σw · 100. Mục phụ thuộc gói (sản phẩm, b-roll, âm thanh) chỉ có khi gói cần; mục "QC đầy đủ" chỉ tính
// điểm khi đã chạy (chưa chạy: w = 0, hiện là việc nên làm).
'use strict';
(function (root) {
  const STEPS = ['prep', 'source', 'build', 'check', 'ship'];
  const NEEDS = ['product', 'broll', 'music'];
  const GAP = 8;         // giây không có graphic nào thì coi là khoảng trống dài
  const WARN_BELOW = 60; // C17: bấm Xuất khi bước Kiểm tra dưới mức này thì cảnh báo (không chặn)
  const BURN_MODES = ['off', 'move', 'mask'];

  const arr = v => (Array.isArray(v) ? v : []);
  const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  /** needs của gói (PACKS[].needs) ∪ 'product' khi dự án bật chế độ quảng cáo (tl.ads.on); bỏ giá trị lạ, không trùng. */
  function needsOf(tl, pack) {
    const s = new Set(arr(pack && pack.needs).filter(n => NEEDS.includes(n)));
    if (tl && tl.ads && tl.ads.on) s.add('product');
    return [...s];
  }

  /** Khoảng dài nhất trong [0, duration] không có scene nào: { at, len }. */
  function longestGap(tl) {
    const dur = +(tl && tl.duration) || 0;
    const R = arr(tl && tl.scenes).map(s => [Math.max(0, +s.t0 || 0), Math.min(dur, +s.t1 || 0)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
    let best = { at: 0, len: 0 }, end = 0;
    for (const [a, b] of R) { if (a - end > best.len) best = { at: end, len: a - end }; end = Math.max(end, b); }
    if (dur - end > best.len) best = { at: end, len: dur - end };
    return { at: Math.round(best.at * 100) / 100, len: Math.round(best.len * 100) / 100 };
  }

  /** Bản xuất còn file và không cũ hơn lần lưu timeline cuối (dư 2 s cho lần lưu ngay trước khi xuất). */
  function fresh(x, edited) {
    if (!x || x.missing) return false;
    const e = edited ? Date.parse(edited) : NaN;
    return !Number.isFinite(e) || Date.parse(x.at) >= e - 2000;
  }

  const SEV = { high: .3, med: .12, low: .05 };
  /** Điểm QC nhanh 0..1: mỗi chỗ trừ theo mức; kết quả cũ (đã sửa video sau đó) chỉ còn một nửa. */
  function quickValue(q) {
    if (!q || q.none || q.error) return 0;
    const v = Math.max(0, 1 - arr(q.issues).reduce((a, i) => a + (SEV[i && i.severity] ?? SEV.med), 0));
    return q.stale ? v / 2 : v;
  }

  function steps(I) {
    const tl = I.tl || {}, b = tl.brand || {}, needs = new Set([...arr(I.needs).filter(n => NEEDS.includes(n)), ...needsOf(tl, I.pack)]);
    const scenes = arr(tl.scenes), caps = +I.caps || 0, dur = +tl.duration || 0;
    const burnFound = !!(I.burn && I.burn.found), burnMode = BURN_MODES.includes(tl.burnin && tl.burnin.mode) ? tl.burnin.mode : null;
    const capOn = caps > 0 && tl.caption_style !== 'none' && burnMode !== 'off';
    const mute = !!(tl.speech && tl.speech.none); // S16 M119: video không lời (nhạc, sự kiện): không đòi lời thoại / phụ đề
    const it = (id, label, w, v, miss, o = {}) => ({ id, label, w, v: Math.max(0, Math.min(1, +v || 0)), miss, opt: false, ...o });

    const prep = [
      it('name', 'Tên thương hiệu', 3, !!(b.name || b.kit), 'Chưa đặt tên: mẫu và màn kết sẽ trống tên.'),
      it('logo', 'Logo', 3, !!b.logo, 'Chưa có logo: graphic và màn kết không có dấu thương hiệu.'),
      it('color', 'Màu thương hiệu', 2, !!b.primary, 'Chưa có màu riêng: mẫu dùng màu mặc định.', { opt: true }),
    ];
    if (needs.has('product')) prep.push(it('product', 'Hồ sơ sản phẩm', 3, !!(tl.ads && tl.ads.product),
      'Video quảng cáo chưa gắn hồ sơ sản phẩm: QC không đối chiếu được claim.'));

    const hasVideo = arr(tl.clips).length > 0 && dur > 0;
    const source = [
      it('video', 'Video nguồn', 4, hasVideo, 'Chưa có video quay sẵn.'),
      it('speech', mute ? 'Video không lời' : 'Lời thoại', 3, caps > 0 || mute, 'Chưa tách lời thoại: phụ đề và AI dựng cần lời thoại.'),
      it('clean', 'Lời thoại đã làm sạch', 2, mute || !!I.fillers || arr(tl.clips).length > 1, 'Chưa dò lỗi nói, lặp từ, ngắt dài.', { opt: true }),
      it('face', 'Vị trí mặt', 2, !!((tl.face_track && arr(tl.face_track.keys).length) || tl.face), 'Chưa dò mặt: graphic có thể che mặt người nói.', { opt: true }),
    ];
    if (burnFound) source.push(it('burn', 'Xử lý phụ đề cháy sẵn', 3, !!burnMode, 'Video gốc có chữ in sẵn: chọn tắt, dời hoặc che để phụ đề mới không chồng lên.'));

    const ai = scenes.filter(s => (s._ai || s._auto) && !s._base).length;
    const gap = longestGap(tl);
    const isBroll = s => s && (s.type === 'broll' || /broll/i.test(String(s.type || '')) || !!(s.screen && s.screen.broll) || !!s.broll);
    const audio = tl.audio || {};
    const build = [
      it('template', 'Mẫu hoặc AI dựng', 3, !!tl.pack || scenes.some(s => s._tpl || s._recipe) || ai > 0, 'Chưa có mẫu: bấm AI dựng để Claude dựng giúp, hoặc chọn một mẫu.'),
      it('captions', mute ? 'Không cần phụ đề (video không lời)' : 'Phụ đề bật', 3, mute || capOn || (burnFound && burnMode === 'off'), 'Phụ đề đang tắt hoặc chưa có: người xem tắt tiếng sẽ không hiểu.'),
      it('gap', 'Không có khoảng trống dài', 2, dur > 0 && gap.len < GAP,
        dur > 0 ? `Từ ${mmss(gap.at)} có ${Math.round(gap.len)} giây không có graphic nào.` : 'Chưa có video.', dur > 0 ? { at: gap.at } : {}),
    ];
    if (needs.has('broll')) build.push(it('broll', 'B-roll', 2, scenes.some(isBroll), 'Gói này cần b-roll minh hoạ mà video chưa có đoạn nào.'));
    if (needs.has('music')) build.push(it('music', 'Nhạc hoặc âm thanh', 2, arr(audio.music).length > 0 || arr(audio.sfx).length > 0, 'Gói này cần nhạc nền hoặc SFX mà video chưa có.'));

    const q = I.quick, qn = q && arr(q.issues).length;
    const full = I.qc, ran = !!full && !full.none && !full.error && Number.isFinite(+full.score);
    // S16 M120: QC đầy đủ còn mới (sau lần sửa cuối) đã kiểm cả vị trí graphic: thay cho QC nhanh, không trừ lần nữa
    const fullNew = ran && !full.stale;
    const check = [
      it('quick', fullNew ? 'QC nhanh (QC đầy đủ đã kiểm vị trí)' : 'QC nhanh', 2, fullNew ? 1 : quickValue(q), !q || q.none || q.error ? 'Chưa kiểm tra nhanh vị trí graphic (che mặt, đè phụ đề).'
        : q.stale ? `Đã sửa video sau lần kiểm tra nhanh${qn ? ` (còn ${qn} chỗ)` : ''}: kiểm tra lại.` : `QC nhanh còn ${qn} chỗ cần xem.`),
      ran ? it('qc', 'QC đầy đủ', 3, (+full.score) / 100, `QC đầy đủ được ${Math.round(+full.score)}/100: xem các chỗ chưa sửa.`)
        : it('qc', 'QC đầy đủ', 0, 0, 'Chưa chạy QC đầy đủ: chính tả, hook, nhịp, âm lượng.', { opt: true }),
    ];

    const x = I.latest || null, ok = fresh(x, I.edited);
    const ship = [
      it('export', 'Bản xuất mới nhất', 3, ok ? 1 : x && !x.missing ? .4 : 0,
        !x ? 'Chưa xuất video.' : x.missing ? 'File của bản xuất gần nhất đã bị xoá.' : 'Đã sửa video sau lần xuất gần nhất: xuất lại.'),
      it('deliver', 'Giao vào Thành phẩm', 1, !!(x && !x.missing && x.deliveredNow > 0),
        x ? 'Bản gần nhất chưa nằm trong Thành phẩm của Kho.' : 'Xuất xong thì giao vào Thành phẩm của Kho.', { opt: true }),
    ];
    return { prep, source, build, check, ship };
  }

  function score(input) {
    const all = steps(input || {}), out = {};
    for (const k of STEPS) {
      const items = all[k], W = items.reduce((a, i) => a + i.w, 0);
      out[k] = {
        score: W ? Math.round(items.reduce((a, i) => a + i.w * i.v, 0) / W * 100) : 100,
        items: items.map(i => ({ ...i, ok: i.v >= 1, lost: W ? Math.round(i.w * (1 - i.v) / W * 100) : 0, miss: i.v >= 1 ? '' : i.miss })),
      };
    }
    return { steps: out };
  }

  const T = { STEPS, NEEDS, GAP, WARN_BELOW, score, needsOf, longestGap, fresh, quickValue };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.ScoreCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
