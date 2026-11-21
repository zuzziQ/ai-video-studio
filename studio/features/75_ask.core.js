// S22 M153: lõi thuần của thanh Hỏi Claude (giao diện 75_ask.js, route studio/routes/75_ask.mjs + scripts/ask_route.mjs).
// Không DOM: chạy trong trình duyệt (window.AskCore) và trong Node (scripts/tests/s22_ask.test.mjs, scripts/ask_route.mjs).
//   scopeOf(ctx)           → phạm vi đang hỏi { kind: video|range|region|elem|clip|step, step, chip, … } hoặc null (Cài đặt: không có thanh)
//   regionOf(raw, DW, DH)  → S24 M173: vùng chú thích { x, y, w, h, t } (px thiết kế, kẹp trong khung) hoặc null
//   frameAt(tl, t)         → khung hình gốc tại t: { at (giây trong nguồn), seq? (ảnh của dãy khung), video? } để server cắt vùng
//   actionsOf(scope)       → danh sách việc mô hình được chọn (luôn có 'answer' = chỉ trả lời bằng chữ)
//   quickOf(scope)         → 3–4 gợi ý nhanh: chạy thẳng một việc với tham số cố định, không qua bộ định tuyến; gợi ý có `ask`
//                            (vd. "Giải thích lỗi") gửi đúng câu đó qua bộ định tuyến (vẫn chỉ gọi mô hình khi bấm, C23)
//   checkPick(raw, scope)  → { action, params, reply, warnings }: việc lạ → 'answer'; tham số lọc theo bảng, ngoài biên bị kẹp / bỏ
//   transitionsApply(tl, p, range) / changedSpan(a, b) → áp chuyển cảnh lên một bản timeline; khoảng thời gian đổi giữa hai bản
//   logEntry / logPush / logParse  → S24 M171: lượt của luồng hỏi đáp (.studio/ask_log.json, 200 lượt, không lưu ảnh)
// Bảng mục 5 của docs/plans/S22-che-do-va-hoi-claude.md. M154: việc của Chuẩn bị / Nguồn / Kiểm tra / Xuất và đăng gọi hàm sẵn có
// của panel (75_ask.js runAction); kết quả qua Studio.review hoặc ô đề xuất Studio.assistPanel của panel đó.
'use strict';
(function (root) {
  // So hai bản timeline / phụ đề: bỏ _orig, sắp khoá — job phía server đọc lại timeline từ đĩa đổi thứ tự khoá (M175: thẻ
  // "Thêm nhạc & SFX" từng báo "1 dòng phụ đề" dù phụ đề không đổi).
  const sameKey = x => JSON.stringify(x, (k, v) => (k === '_orig' ? undefined
    : v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(kk => [kk, v[kk]])) : v));
  const STEPS = { prep: 'Chuẩn bị', source: 'Nguồn', build: 'Dựng', check: 'Kiểm tra', ship: 'Xuất và đăng' };
  const ELEM_KINDS = ['line', 'cap', 'node', 'badge', 'scene'];
  // S28 M202: chuyển cảnh đọc từ engine/fx_registry.js (trình duyệt: window.FX nạp trước clips.js; Node: require)
  const FX = typeof module === 'object' && module.exports ? require('../../engine/fx_registry.js') : root.FX;
  const TRANS = FX.ids('trans');
  const TRANS_VI = Object.fromEntries(FX.TRANS.map(x => [x.id, x.label.toLocaleLowerCase('vi')]));
  // Mô tả cho mô hình chọn chuyển cảnh theo nội dung (không chọn bừa): một dòng mỗi loại từ FX.TRANS[].ai
  const TRANS_GUIDE = `Chọn type theo nội dung và nhịp: ${FX.aiGuide('trans', ' | ')}.`;
  const TDUR = FX.TRANS[0].params.dur;
  // S29 M203: tham số riêng của chuyển cảnh (ease mọi loại; dir / color / intensity chỉ loại có) — Claude đặt kèm type
  const TP = FX.TRANS.find(x => x.id === 'whip').params, TPC = FX.get('trans', 'flash').params.color, TPI = FX.get('trans', 'glitch').params.intensity;
  const TPARAMS = { ease: { t: 'enum', values: TP.ease.values }, dir: { t: 'enum', values: TP.dir.values }, color: { t: 'enum', values: TPC.values }, intensity: { t: 'num', min: TPI.min, max: TPI.max } };
  const TPARAM_HELP = ' ease = nhịp (auto mặc định, smooth, accel, decel, snap); dir = hướng l/r/u/d (trượt, đẩy, gạt, lia, lật); color = màu (flash, dip, strobe); intensity = cường độ 0.2–2 (glitch, shake, rgb_split). Bỏ trống = mặc định.';
  // giữ các tham số loại `type` có (đã kẹp), bỏ dur và giá trị bằng mặc định; không còn gì → undefined
  function transParams(type, p) {
    const d = FX.get('trans', type); if (!d || !p) return undefined;
    const v = FX.params('trans', type, p), out = {};
    for (const [n, s] of Object.entries(d.params)) if (n !== 'dur' && p[n] != null && v[n] !== s.def) out[n] = v[n];
    return Object.keys(out).length ? out : undefined;
  }
  const transOf = p => { const params = transParams(p.type, p); return { type: p.type, dur: r2(p.dur ?? 0.4), ...(params ? { params } : {}) }; };
  const AUTOFILL = ['all', 'broll', 'sfx'];
  const DENS = ['thua', 'vua', 'day'];
  // = /api/publish/platforms (scripts/publish.mjs); 'all' = mọi nền tảng đang tích ở hộp Đăng
  const PLATS = ['tiktok', 'youtube', 'facebook', 'instagram', 'zalo'];
  const PLAT_VI = { all: 'mọi nền tảng', tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', zalo: 'Zalo' };
  const VA_KINDS = ['hook', 'style', 'both']; // = #vakind của 16_qc.js
  // panel mở được theo bước (id của PANELS trong 01_workflow.js)
  const PANELS = {
    prep: { brands: 'Bộ thương hiệu', products: 'Sản phẩm', kho: 'Kho' },
    source: { words: 'Lời thoại', ai: 'Làm sạch lời nói', longform: 'Cắt clip từ video dài', 'wf-new': 'Video nguồn', 'wf-script': 'Kịch bản' },
    check: { 'wf-qc': 'Kiểm tra' },
    ship: { 'wf-export': 'Xuất', 'wf-publish': 'Đăng', schedule: 'Lịch đăng' },
    clip: { trans: 'Chuyển cảnh', filter: 'Bộ lọc', 'wf-broll': 'B-roll' },
  };

  const str = (v, n) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, n);
  const num = v => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? +v.replace(',', '.') : NaN);
  const r2 = v => Math.round(v * 100) / 100;
  const stamp = t => { const s = Math.max(0, Math.round(+t || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

  // ---------- phạm vi ----------
  // ctx: { step, sel?: { kind, cid, label, text, idx, t0, t1, knobs }, range?: { a, b }, region?: { x, y, w, h, t } }
  // Ưu tiên: khoảng chọn trên timeline (đặt có chủ đích, chỉ ở bước Dựng) → vùng chú thích (M173: kéo trên khung rồi Hỏi ngay, chỉ
  // một lượt) → element / clip đang chọn → bước. Cài đặt: không có thanh.
  function scopeOf(ctx = {}) {
    const step = STEPS[ctx.step] ? ctx.step : ctx.step === 'settings' ? 'settings' : 'build';
    if (step === 'settings') return null;
    const r = ctx.range, sel = ctx.sel, g = ctx.region;
    if (step === 'build' && r && Number.isFinite(+r.a) && Number.isFinite(+r.b) && Math.abs(r.b - r.a) >= 0.2) {
      const a = Math.min(r.a, r.b), b = Math.max(r.a, r.b);
      return { kind: 'range', step, a: r2(a), b: r2(b), chip: `${stamp(a)}–${stamp(b)}`, icon: 'ti-arrows-horizontal' };
    }
    if (g && [g.x, g.y, g.w, g.h].every(v => Number.isFinite(+v)) && g.w > 0 && g.h > 0) {
      const t = r2(Math.max(0, +g.t || 0));
      return { kind: 'region', step, x: Math.round(g.x), y: Math.round(g.y), w: Math.round(g.w), h: Math.round(g.h), t, chip: `Vùng ${Math.round(g.w)}×${Math.round(g.h)} · ${stamp(t)}`, icon: 'ti-crop' };
    }
    if (sel && sel.kind === 'clip') return { kind: 'clip', step, idx: sel.idx | 0, cid: sel.cid || '', t0: +sel.t0 || 0, t1: +sel.t1 || 0, chip: `Clip ${(sel.idx | 0) + 1}`, icon: 'ti-movie' };
    if (sel && ELEM_KINDS.includes(sel.kind)) {
      const text = str(sel.text, 80), lab = str(sel.label, 40);
      const chip = sel.kind === 'cap' ? `Phụ đề «${clip(text || lab, 18)}»` : (sel.kind === 'line' || sel.kind === 'node') && text ? `Chữ «${clip(text, 18)}»`
        : sel.kind === 'badge' ? 'Huy hiệu' : clip(lab || 'Element', 24);
      return { kind: 'elem', step, ek: sel.kind, cid: sel.cid || '', text: !!text, knobs: !!sel.knobs, t0: +sel.t0 || 0, t1: +sel.t1 || 0, chip, icon: 'ti-pointer' };
    }
    if (step === 'build') return { kind: 'video', step, chip: 'Bước Dựng · cả video', icon: 'ti-movie' };
    // qc: đã có kết quả kiểm tra (gợi ý "Giải thích lỗi" chỉ có nghĩa khi đó)
    return { kind: 'step', step, chip: `Bước ${STEPS[step]}`, icon: 'ti-route', ...(step === 'check' ? { qc: !!ctx.qc } : {}) };
  }

  // ---------- danh sách việc của phạm vi ----------
  // Mỗi việc: id, mô tả cho mô hình, tham số { tên: { t: 'enum'|'num'|'str', values|min,max|max } } — chỉ chừng đó lọt qua checkPick.
  const A = {
    ai_build: { what: 'AI dựng lại cả video (gói style, graphic, phụ đề, nhạc). Dùng khi muốn đổi phong cách, nhịp, "sôi động hơn", "sang hơn".',
      params: { extra: { t: 'str', max: 200 }, density: { t: 'enum', values: DENS } } },
    autofill: { what: 'Tự thêm b-roll (broll), âm thanh SFX + nhạc (sfx) hoặc cả hai (all).', params: { mode: { t: 'enum', values: AUTOFILL } } },
    transitions: { what: `Đặt cùng một chuyển cảnh cho mọi chỗ nối giữa các clip (type "none" = bỏ hết). ${TRANS_GUIDE}${TPARAM_HELP}`,
      params: { type: { t: 'enum', values: [...TRANS, 'none'] }, dur: { t: 'num', min: TDUR.min, max: TDUR.max }, ...TPARAMS } },
    elem_edit: { what: 'Sửa element đang chọn (kiểu, màu, font, vị trí, cỡ, hoạt ảnh, thời lượng, viết lại chữ). ask = câu yêu cầu ngắn gọn bằng tiếng Việt.',
      params: { ask: { t: 'str', max: 200 } } },
    elem_variants: { what: 'Đưa 3 biến thể của element đang chọn để người dùng xem và chọn.', params: {} },
    elem_knobs: { what: 'Gợi ý 2–3 núm điều chỉnh mới cho element đang chọn.', params: {} },
    // S27 M199: Claude dựng element riêng (box, nền box chữ, khung, nhãn…) khi thư viện không có cái hợp (72_celem.js)
    elem_create: { what: 'Dựng MỚI một element đồ hoạ riêng theo thương hiệu (box chữ, nền chữ, khung, nhãn giá, thẻ…) rồi chèn tại playhead; 3 phương án xem bằng ảnh. ask = mô tả element bằng tiếng Việt.',
      params: { ask: { t: 'str', max: 300 } } },
    clip_transition: { what: `Đặt chuyển cảnh vào clip đang chọn (type "none" = bỏ). ${TRANS_GUIDE}${TPARAM_HELP}`, params: { type: { t: 'enum', values: [...TRANS, 'none'] }, dur: { t: 'num', min: TDUR.min, max: TDUR.max }, ...TPARAMS } },
    // ---- M154: Chuẩn bị ----
    brand_ai: { what: 'Dựng bộ thương hiệu (vai trò 4 màu, cặp font, giọng văn, slogan, CTA) từ logo đã tải, tên và website. website = link nếu người dùng đưa.',
      params: { website: { t: 'str', max: 200 } } },
    product_ai: { what: 'Viết hồ sơ / mô tả sản phẩm (tên, giá, ngành, điểm mạnh, claim chờ duyệt, FAQ) từ link trang bán hoặc ảnh. url = link nếu người dùng đưa.',
      params: { url: { t: 'str', max: 300 } } },
    // ---- Nguồn ----
    clean_speech: { what: 'Dò tiếng đệm (ờ, à, ừm…), từ nói lặp, chỗ ngắt quá dài để cắt. claude = "co" để nhờ Claude tìm thêm câu nói hỏng (chậm hơn).',
      params: { claude: { t: 'enum', values: ['co', 'khong'] } } },
    fix_words: { what: 'Soát chữ nhận dạng sai trong lời thoại / phụ đề, đưa đề xuất sửa từng chỗ.', params: {} },
    match_script: { what: 'Cho phụ đề theo đúng chữ của kịch bản đã dán ở bước Nguồn.', params: {} },
    find_highlights: { what: 'Tìm đoạn hay trong một video dài, cắt thành nhiều clip ngắn (mỗi clip một dự án). brief = hướng dẫn chọn đoạn; n = số clip.',
      params: { brief: { t: 'str', max: 300 }, n: { t: 'num', min: 3, max: 10 } } },
    write_hook: { what: 'Viết 3 câu hook mở đầu (chữ lớn ở giây đầu) theo lời thoại; người dùng xem từng câu trên khung rồi chọn.', params: {} },
    // ---- Kiểm tra ----
    qc_fix_all: { what: 'Kiểm tra chất lượng rồi sửa hết lỗi sửa được (chữ tràn khung, che mặt, đè phụ đề, phụ đề dài, âm lượng…); xem lại trước khi nhận.', params: {} },
    ab_hooks: { what: 'Tạo 3 phiên bản A/B để đăng thử: khác hook mở đầu (hook, Claude viết), khác gói style (style) hoặc cả hai (both).',
      params: { kind: { t: 'enum', values: VA_KINDS } } },
    // ---- Xuất và đăng ----
    publish_write: { what: 'Viết tiêu đề, mô tả / caption, hashtag theo từng nền tảng từ lời thoại của video đã xuất. platform = một nền tảng hoặc all; notes = ghi chú cho người viết.',
      params: { platform: { t: 'enum', values: ['all', ...PLATS] }, notes: { t: 'str', max: 200 } } },
    cover: { what: 'Gợi ý ảnh bìa: Claude xem 9 khung hình, chọn 3 khung kèm chữ bìa.', params: {} },
    post_time: { what: 'Tìm giờ đăng trống kế tiếp theo khung giờ của Lịch đăng.', params: { platform: { t: 'enum', values: PLATS } } },
    open_panel: { what: 'Mở đúng công cụ của bước để người dùng tự làm.', params: { panel: { t: 'enum', values: [] } } },
    answer: { what: 'Không việc nào khớp, hoặc chỉ là câu hỏi: trả lời ngắn bằng chữ, không sửa gì.', params: {} },
  };
  const STEP_ACTS = {
    prep: ['brand_ai', 'product_ai'],
    source: ['clean_speech', 'fix_words', 'match_script', 'find_highlights', 'write_hook'],
    check: ['qc_fix_all', 'ab_hooks'],
    ship: ['publish_write', 'cover', 'post_time'],
  };
  // S29 M207: tốc độ của clip đang chọn (preset đường cong, đều, Freeze, đảo ngược) — áp bằng Studio.speed.apply (59_speed.js)
  const SM = root.SpeedMap || (typeof require === 'function' ? require('../../engine/speed.js') : null);
  const SPEED_MODES = ['montage', 'hero', 'bullet', 'jump_cut', 'flash_in', 'flash_out', 'normal', 'freeze', 'reverse', 'forward'];
  A.clip_speed = { what: 'Đổi tốc độ clip đang chọn: preset đường cong (montage, hero = nhanh–chậm–nhanh khoe khoảnh khắc, bullet = chậm sâu ở giữa, jump_cut, flash_in, flash_out), normal = tốc độ đều speed×, freeze = đứng hình dur giây tại playhead (nhấn câu đinh), reverse = phát ngược, forward = bỏ phát ngược.',
    params: { mode: { t: 'enum', values: SPEED_MODES }, speed: { t: 'num', min: 0.25, max: 4 }, dur: { t: 'num', min: 0.5, max: 10 } } };
  // S28 M206: hiệu ứng khung hình trên track Hiệu ứng (nhóm fx của engine/fx_registry.js; áp bằng FxTrackCore.addApply, 81_fxtrack.core.js)
  // đọc lười: trình duyệt nạp feature theo tên (studio/server.mjs FEATURES), 81_fxtrack.core.js đến SAU file này (nghiệm thu S28)
  let FT0 = null;
  const FT = () => FT0 || (FT0 = root.FxTrackCore || (typeof require === 'function' ? require('./81_fxtrack.core.js') : null));
  const EFX = FX.ids('fx');
  const EFX_VI = Object.fromEntries(FX.list('fx').map(x => [x.id, x.label.toLocaleLowerCase('vi')]));
  A.fx_add = { what: `Thêm một khối hiệu ứng khung hình lên track Hiệu ứng: phạm vi đoạn → phủ đúng đoạn, cả video → tại playhead (dur giây). intensity / speed / range 0–1 (speed của pulse = nhịp mỗi giây); target main = chỉ video chính, all = cả khung. Nhấn ngắn (shake, punch, flash…) đặt đúng câu / nhịp cần nhấn. Chọn type theo nội dung: ${FX.aiGuide('fx', ' | ')}.`,
    params: { type: { t: 'enum', values: EFX }, dur: { t: 'num', min: 0.1, max: 30 }, intensity: { t: 'num', min: 0, max: 1 }, speed: { t: 'num', min: 0.1, max: 4 }, range: { t: 'num', min: 0, max: 1 }, target: { t: 'enum', values: ['all', 'main'] } } };
  const fxAddApply = (tl, p, range, at) => (FT() ? FT().addApply(tl, p, range, at) : 0);
  // S28 M210: hiệu ứng theo nhịp — khối ngắn tại mỗi phách mạnh thứ every (times = phách mạnh giờ video, Studio.beatTimes)
  A.fx_beats = { what: `Đặt khối hiệu ứng ngắn lên track Hiệu ứng tại MỖI phách mạnh thứ every của nhạc nền (phạm vi đoạn → chỉ trong đoạn, cả video → mọi phách mạnh); chỉ dùng khi ngữ cảnh có nhịp nhạc nền (phách mạnh). Hợp montage, nhạc sôi động, beat drop: punch / shake / flash / rgb / glitch / mirror / pulse; every 2–4 cho video có người nói để khỏi rối mắt. Làm lại thì thay khối theo nhịp cũ.`,
    params: { type: { t: 'enum', values: EFX }, every: { t: 'num', min: 1, max: 8 }, dur: { t: 'num', min: 0.1, max: 2 }, intensity: { t: 'num', min: 0, max: 1 }, amp: { t: 'num', min: 0, max: 40 } } };
  const fxBeatsApply = (tl, p, range, times) => (FT() ? FT().beatApply(tl, p, times, range) : 0);
  // S28 M204: hoạt ảnh clip (Vào / Ra / Combo) từ registry nhóm clip_anim (engine/fx_registry.js); áp thuần bằng clipAnimApply
  const CA_TYPES = [...new Set([...FX.ids('clip_in'), ...FX.ids('clip_out'), ...FX.ids('clip_combo')])];
  A.clip_anim = { what: `Đặt hoạt ảnh cho clip đang chọn. slot = in (vào, dur giây đầu clip) | out (ra, dur giây cuối) | combo (chạy suốt clip, speed ×); type "none" = bỏ slot đó. Ảnh tĩnh / b-roll đứng hình: combo ken_burns.
Vào: ${FX.aiGuide('clip_in', ' | ')}.
Ra: ${FX.aiGuide('clip_out', ' | ')}.
Combo: ${FX.aiGuide('clip_combo', ' | ')}.`,
    params: { slot: { t: 'enum', values: ['in', 'out', 'combo'] }, type: { t: 'enum', values: [...CA_TYPES, 'none'] }, dur: { t: 'num', min: 0.1, max: 3 }, speed: { t: 'num', min: 0.25, max: 3 } } };
  // Trả false khi type không thuộc slot (mô hình lẫn Vào / Combo) để không áp nhầm
  function clipAnimApply(tl, idx, p) {
    const c = tl.clips?.[idx], kind = FX.CLIP_SLOT[p.slot]; if (!c || !kind) return false;
    if (p.type && p.type !== 'none' && !FX.get(kind, p.type)) return false;
    const v = p.slot === 'combo' ? (p.speed != null ? { speed: p.speed } : {}) : (p.dur != null ? { dur: p.dur } : {});
    const a = FX.clipAnimSet(c.anim, p.slot, p.type, v);
    if (a) c.anim = a; else delete c.anim;
    return true;
  }
  // S28 M205: hoạt ảnh Vào / Ra / Lặp của element đang chọn (chữ, hình khối, element riêng, sticker) — bộ chung FX.animOf
  const ANIM_IN = FX.ids('anim_in'), ANIM_LOOP = FX.ids('anim_loop');
  const ANIM_GUIDE = `Vào (in, trường anim): ${FX.aiGuide('anim_in', ' | ')}. Ra (out, trường anim_out): cùng id với Vào, chạy ngược tới lúc element tắt, thay mờ dần chung; chỉ đặt khi element cần rời khung có chủ ý. Lặp (loop, trường anim_loop, chạy sau khi vào xong): ${FX.aiGuide('anim_loop', ' | ')}.`;
  A.elem_anim = { what: `Đặt hoạt ảnh cho element đang chọn: in = vào, out = ra ("none" = bỏ), loop = lặp ("none" = bỏ); dur / out_dur = giây (bỏ trống = mặc định), speed = tốc độ lặp. ${ANIM_GUIDE}`,
    params: { in: { t: 'enum', values: ANIM_IN }, out: { t: 'enum', values: [...ANIM_IN, 'none'] }, loop: { t: 'enum', values: [...ANIM_LOOP, 'none'] },
      dur: { t: 'num', min: 0.1, max: 3 }, out_dur: { t: 'num', min: 0.1, max: 3 }, speed: { t: 'num', min: 0.25, max: 3 } } };
  // Ghi vào element có cid (cảnh hoặc dòng chữ trong cảnh) của bản timeline tl. Trả true khi tìm thấy element.
  function elemAnimApply(tl, cid, p) {
    const all = (tl?.scenes || []).flatMap(s => [s, ...(s.lines || [])]), o = all.find(x => x && x.cid === cid);
    if (!o || !p) return false;
    if (p.in) { o.anim = p.in; if (p.dur) o.anim_dur = p.dur; else delete o.anim_dur; }
    if (p.out === 'none') delete o.anim_out; else if (p.out) o.anim_out = p.out_dur ? { type: p.out, dur: p.out_dur } : { type: p.out };
    if (p.loop === 'none') delete o.anim_loop; else if (p.loop) o.anim_loop = p.speed ? { type: p.loop, speed: p.speed } : { type: p.loop };
    return true;
  }
  // S29 M208: Claude chọn màu cho clip đang chọn — trợ lý 'color' (scripts/assist.mjs) đọc khung + gu thương hiệu, Studio.color.pick
  //   (82_color.js) trả bộ filter; colorApply đặt bộ đó lên bản timeline (thẻ Nhận / Bỏ). Không tham số: Claude tự chọn hết.
  A.color_pick = { what: 'Claude xem khung của clip đang chọn và gu thương hiệu rồi chọn màu: bộ lọc + cường độ + vài thanh Adjust (phơi sáng, vùng sáng / tối, nét, fade, vignette, hạt…). Dùng khi người dùng muốn chỉnh màu, làm đẹp màu, đổi tông, hợp thương hiệu.', params: {} };
  function colorApply(tl, idx, filter) {
    const c = tl.clips?.[idx], f = FX.colorClean ? FX.colorClean(filter) : null;
    if (!c || !f || !Object.keys(f).length) return false;
    c.filter = f;
    return true;
  }
  // S29 M209: keyframe của clip đang chọn (engine/kf.js) — một thuộc tính chạy from → to trong [start, end] giây của clip (bỏ trống = cả
  //   clip), thay key cũ của thuộc tính đó. Đọc lười: /engine/kf.js nạp trước features trong trình duyệt, Node cần require.
  let KF0 = null;
  const KFM = () => KF0 || (KF0 = root.KF || (typeof require === 'function' ? require('../../engine/kf.js') : null));
  const KF_PROPS = ['x', 'y', 'scale', 'rot', 'opacity', 'mask_x', 'mask_y', 'mask_w', 'mask_h', 'mask_feather', 'strength', ...(FX.ADJ || []).map(a => a.id), 'volume'];
  const KF_EASES = ['linear', 'inOut', 'in', 'out', 'back', 'bounce', 'hold', 'easeIn', 'easeOut', 'easeInOut', 'overshoot', 'elastic'];
  A.clip_kf = { what: 'Đặt keyframe cho clip đang chọn: thuộc tính prop chạy từ from tới to trong đoạn start → end giây TÍNH TỪ ĐẦU CLIP (bỏ trống = cả clip), ease = kiểu chuyển động. prop: x / y = dời (px), scale = tỉ lệ (1 = gốc; phóng chậm 1 → 1.15), rot = xoay (độ), opacity = mờ 0–1, mask_x / mask_y / mask_w / mask_h (% khung) và mask_feather = mặt nạ (chỉ khi clip có mặt nạ), strength = cường độ bộ lọc 0–100 (khi có bộ lọc), exposure / brightness / contrast / saturate / temp… = Adjust như trợ lý màu, volume = âm lượng clip × (0–2; 0 = tắt dần). ease: easeIn / easeOut / easeInOut = ease vào / ra / cả hai, overshoot = nảy, elastic = đàn hồi, hold = giữ rồi nhảy.',
    params: { prop: { t: 'enum', values: KF_PROPS }, from: { t: 'num', min: -1280, max: 1280 }, to: { t: 'num', min: -1280, max: 1280 }, start: { t: 'num', min: 0, max: 600 }, end: { t: 'num', min: 0, max: 600 }, ease: { t: 'enum', values: KF_EASES } } };
  function clipKfApply(tl, idx, p) {
    const c = tl.clips?.[idx], K = KFM(); if (!c || !K || !p?.prop || !K.prop(p.prop)) return false;
    if (p.prop.startsWith('mask_') && !c.mask) return false;
    const d = SM ? SM.dur(c, tl.fps || 30) : 3, a = Math.min(Math.max(0, +p.start || 0), Math.max(0, d - 0.1)), b = p.end != null && +p.end > a ? Math.min(+p.end, d) : d;
    return K.ramp(c, p.prop, p.from, p.to, a, b, p.ease);
  }
  // S29 M212: hiệu chỉnh nướng sẵn của clip đang chọn (engine/bake.js; tab Hiệu chỉnh 86_bake.js). Claude chỉ đặt tham số lên bản
  //   timeline: xem gần đúng bằng CSS, job nướng ffmpeg chỉ chạy khi người dùng Nhận. LUT phải do người dùng nhập file, Claude chỉ đổi mix.
  const BK = root.BakeCore || (typeof require === 'function' ? require('../../engine/bake.js') : null);
  const BAKE_OPS = ['chroma', 'hsl', 'curves', 'stab', 'lut', 'none'];
  A.clip_bake = { what: 'Hiệu chỉnh nướng sẵn cho clip đang chọn, mỗi lần một op: chroma = tách phông xanh / lục (color #rrggbb màu nền, strength 0–100 độ rộng màu bị xoá, edge 0–100 viền mềm, spill 0–100 khử ánh màu lem lên người); hsl = đổi một dải màu (band all|r|y|g|c|b|m, hue −180–180, sat −100–100, light −100–100); curves = đường cong (preset ' + (BK ? BK.CURVES.join('|') : '') + ', shadows / highlights −50–50); stab = ổn định hình rung (strength 0–100, 0 = tắt); lut = độ mạnh LUT .cube người dùng đã nhập (strength 0–100); none = bỏ mọi hiệu chỉnh nướng. Tác dụng thấy sau khi người dùng Nhận và máy nướng xong (vài giây).',
    params: { op: { t: 'enum', values: BAKE_OPS }, color: { t: 'str', max: 7 }, strength: { t: 'num', min: 0, max: 100 }, edge: { t: 'num', min: 0, max: 100 }, spill: { t: 'num', min: 0, max: 100 },
      band: { t: 'enum', values: BK ? BK.BANDS : ['all'] }, hue: { t: 'num', min: -180, max: 180 }, sat: { t: 'num', min: -100, max: 100 }, light: { t: 'num', min: -100, max: 100 },
      preset: { t: 'enum', values: BK ? BK.CURVES : ['none'] }, shadows: { t: 'num', min: -50, max: 50 }, highlights: { t: 'num', min: -50, max: 50 } } };
  // đặt một op lên clip idx của bản timeline tl (bỏ seq / hash cũ: Studio nướng lại khi Nhận). Trả false khi không áp được.
  function bakeApply(tl, idx, p) {
    const c = tl.clips?.[idx];
    if (!c || !BK || typeof c.src !== 'object' || !p || !BAKE_OPS.includes(p.op)) return false;
    if (p.op === 'none') { if (!c.bake) return false; delete c.bake; return true; }
    const b = { ...(c.bake || {}) }; delete b.seq; delete b.hash; delete b.p540;
    if (p.op === 'chroma') { const col = /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color.toLowerCase() : b.chroma?.color || '#00b140'; b.chroma = { ...(b.chroma || {}), color: col, ...['strength', 'edge', 'spill'].reduce((o, k) => (p[k] != null ? { ...o, [k]: p[k] } : o), {}) }; } // design-token-ok: màu phông xanh mặc định trong video
    if (p.op === 'hsl') b.hsl = { ...(b.hsl || {}), ...['band', 'hue', 'sat', 'light'].reduce((o, k) => (p[k] != null ? { ...o, [k]: p[k] } : o), {}) };
    if (p.op === 'curves') b.curves = { ...(b.curves || {}), ...['preset', 'shadows', 'highlights'].reduce((o, k) => (p[k] != null ? { ...o, [k]: p[k] } : o), {}) };
    if (p.op === 'stab') { if (p.strength) b.stab = { strength: p.strength }; else delete b.stab; }
    if (p.op === 'lut') { if (!b.lut?.file) return false; b.lut = { ...b.lut, mix: p.strength ?? 100 }; }
    const o = BK.ops(b);
    if (!o) { delete c.bake; return true; }
    c.bake = { ...b };
    return true;
  }
  function actionsOf(scope) {
    if (!scope) return [];
    const ids = scope.kind === 'region' ? (scope.step === 'build' ? ['ai_build'] : []) : scope.kind === 'video' || scope.kind === 'range' ? ['ai_build', 'autofill', 'transitions', 'fx_add', 'fx_beats', 'elem_create']
      : scope.kind === 'elem' ? ['elem_edit', ...(scope.ek === 'line' || scope.ek === 'scene' ? ['elem_anim'] : []), 'elem_variants', ...(scope.knobs ? ['elem_knobs'] : [])]
        : scope.kind === 'clip' ? [...(scope.idx > 0 ? ['clip_transition'] : []), 'clip_speed', 'clip_anim', 'clip_kf', 'color_pick', 'clip_bake', 'open_panel']
          : [...(STEP_ACTS[scope.step] || []), ...(PANELS[scope.step] ? ['open_panel'] : [])];
    return [...ids, 'answer'].map(id => {
      const a = A[id], params = { ...a.params };
      if (id === 'open_panel') params.panel = { t: 'enum', values: Object.keys(PANELS[scope.kind === 'clip' ? 'clip' : scope.step] || {}) };
      return { id, what: a.what, params };
    });
  }

  // ---------- gợi ý nhanh ----------
  function quickOf(scope) {
    if (!scope) return [];
    const q = (label, action, params = {}, icon = 'ti-sparkles') => ({ label, action, params, icon });
    const ask = (label, text, icon = 'ti-message-question') => ({ label, action: 'answer', params: {}, ask: text, icon });
    switch (scope.kind) {
      case 'video': return [q('AI dựng cả video', 'ai_build', { density: 'vua' }), q('Thêm b-roll', 'autofill', { mode: 'broll' }, 'ti-photo-plus'),
        q('Thêm nhạc & SFX', 'autofill', { mode: 'sfx' }, 'ti-music'), q('Chuyển cảnh mờ dần', 'transitions', { type: 'fade', dur: 0.4 }, 'ti-transition-right')];
      // M173: vùng chú thích — câu hỏi qua bộ định tuyến, mô hình xem ảnh vùng cắt từ khung tại t
      case 'region': return [ask('Vùng này có gì?', 'Mô tả ngắn những gì có trong vùng này của khung hình và gợi ý chỉnh cho đẹp hơn.', 'ti-eye'),
        ask('Vùng này có lỗi không?', 'Vùng này có lỗi gì không (chữ tràn, che mặt, mờ, lệch, khó đọc)? Nói ngắn và cách sửa.', 'ti-bug')];
      case 'range': return [q('Chuyển cảnh trong đoạn', 'transitions', { type: 'fade', dur: 0.4 }, 'ti-transition-right'),
        q('Lia nhanh trong đoạn', 'transitions', { type: 'whip', dur: 0.3 }, 'ti-wind'), q('Thêm b-roll', 'autofill', { mode: 'broll' }, 'ti-photo-plus')];
      case 'elem': return [q('Nổi hơn', 'elem_edit', { ask: 'nổi hơn' }), q('Hợp thương hiệu', 'elem_edit', { ask: 'hợp thương hiệu' }),
        ...(scope.text ? [q('Viết lại chữ', 'elem_edit', { ask: 'viết lại chữ ngắn gọn, hấp dẫn hơn' }, 'ti-pencil')] : []),
        q('3 biến thể', 'elem_variants', {}, 'ti-layout-grid'), ...(scope.knobs ? [q('Gợi ý núm', 'elem_knobs', {}, 'ti-adjustments-horizontal')] : [])].slice(0, 4);
      case 'clip': return [...(scope.idx > 0 ? [q('Chuyển cảnh mờ dần', 'clip_transition', { type: 'fade', dur: 0.4 }, 'ti-transition-right'),
        q('Chuyển cảnh lia nhanh', 'clip_transition', { type: 'whip', dur: 0.3 }, 'ti-wind')] : []),
      q('Claude chọn màu', 'color_pick', {}, 'ti-color-filter'), q('B-roll phủ', 'open_panel', { panel: 'wf-broll' }, 'ti-photo-plus')]; // S29 M208
      // M154: nút AI trùng của panel thành gợi ý ở đây (nút chính của panel vẫn giữ)
      default: switch (scope.step) {
        case 'prep': return [q('Dựng bộ thương hiệu', 'brand_ai', {}, 'ti-palette'), q('Viết mô tả sản phẩm', 'product_ai', {}, 'ti-package'),
          q('Mở kho tư liệu', 'open_panel', { panel: 'kho' }, 'ti-folder')];
        case 'source': return [q('Cắt lỗi nói', 'clean_speech', { claude: 'khong' }, 'ti-eraser'), q('Sửa chữ sai', 'fix_words', {}, 'ti-text-spellcheck'),
          q('Viết hook mở đầu', 'write_hook', {}, 'ti-bolt'), q('Tìm đoạn hay', 'find_highlights', {}, 'ti-scissors')];
        case 'check': return [q('Sửa hết lỗi', 'qc_fix_all', {}, 'ti-wand'),
          ...(scope.qc ? [ask('Giải thích lỗi', 'Giải thích ngắn các lỗi của lần kiểm tra gần nhất: vì sao là lỗi và nên sửa thế nào.')] : []),
          q('3 hook cho A/B', 'ab_hooks', { kind: 'hook' }, 'ti-versions')];
        case 'ship': return [q('Tiêu đề, mô tả, hashtag', 'publish_write', { platform: 'all' }, 'ti-hash'), q('Ảnh bìa', 'cover', {}, 'ti-photo'),
          q('Giờ đăng', 'post_time', { platform: 'tiktok' }, 'ti-calendar-time'), q('Khổ nên xuất', 'open_panel', { panel: 'wf-export' }, 'ti-aspect-ratio')];
        default: return [];
      }
    }
  }

  // ---------- kiểm kết quả của mô hình (robust-llm) ----------
  // Nhận cả tên trường lệch thường gặp: action|tool|name|việc, params|args|parameters|arguments, reply|answer|text|message.
  const pickKey = (o, ks) => { for (const k of ks) if (o[k] != null) return o[k]; return undefined; };
  function cleanParams(def, raw, warnings) {
    const out = {}, src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    for (const [k, d] of Object.entries(def)) {
      const v = src[k]; if (v == null || v === '') continue;
      if (d.t === 'enum') { const s = str(v, 40).toLowerCase(); if (d.values.includes(s)) out[k] = s; else warnings.push(`bỏ ${k}="${str(v, 20)}" (không có trong danh sách)`); }
      else if (d.t === 'num') { const n = num(v); if (Number.isFinite(n)) out[k] = r2(Math.min(d.max, Math.max(d.min, n))); else warnings.push(`bỏ ${k} (không phải số)`); }
      else if (d.t === 'str') { const s = str(v, d.max); if (s) out[k] = s; }
    }
    for (const k of Object.keys(src)) if (!def[k]) warnings.push(`bỏ tham số lạ "${str(k, 20)}"`);
    return out;
  }
  function checkPick(raw, scope) {
    const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const list = actionsOf(scope), warnings = [];
    let id = str(pickKey(o, ['action', 'tool', 'name', 'viec', 'việc']), 40).toLowerCase();
    const reply = str(pickKey(o, ['reply', 'answer', 'text', 'message', 'why']), 600);
    let act = list.find(a => a.id === id);
    if (!act) { if (id && id !== 'answer') warnings.push(`việc "${clip(id, 24)}" không có trong phạm vi này`); id = 'answer'; act = list.find(a => a.id === 'answer'); }
    const params = act ? cleanParams(act.params, pickKey(o, ['params', 'args', 'parameters', 'arguments']), warnings) : {};
    // thiếu tham số bắt buộc → về trả lời bằng chữ, không đoán
    const need = { elem_edit: ['ask'], elem_create: ['ask'], transitions: ['type'], fx_add: ['type'], fx_beats: ['type'], clip_transition: ['type'], clip_speed: ['mode'], clip_anim: ['slot', 'type'], clip_bake: ['op'], open_panel: ['panel'] }[id] || [];
    if (need.some(k => params[k] == null)) { warnings.push(`thiếu ${need.filter(k => params[k] == null).join(', ')}`); return { action: 'answer', params: {}, reply: reply || 'Chưa rõ muốn làm gì, thử nói cụ thể hơn.', warnings }; }
    if (id === 'answer' && !reply) return { action: 'answer', params: {}, reply: 'Chưa có việc nào khớp câu hỏi trong phạm vi này.', warnings };
    if (id === 'autofill' && !params.mode) params.mode = 'all';
    if (id === 'publish_write' && !params.platform) params.platform = 'all';
    if (id === 'post_time' && !params.platform) params.platform = 'tiktok';
    if (id === 'ab_hooks' && !params.kind) params.kind = 'hook';
    if (id === 'clean_speech' && !params.claude) params.claude = 'khong';
    if (id === 'find_highlights' && params.n != null) params.n = Math.round(params.n);
    if (id === 'fx_beats' && params.every != null) params.every = Math.round(params.every);
    if ((id === 'transitions' || id === 'clip_transition') && params.type !== 'none' && params.dur == null) params.dur = 0.4;
    return { action: id, params, reply, warnings };
  }

  // ---------- áp lên một bản timeline (bản sao để xem, hoặc timeline thật khi Nhận) ----------
  // Chuyển cảnh: mọi chỗ nối (clip i > 0); range [a, b] → chỉ chỗ nối nằm trong đoạn. Trả số chỗ nối đã đổi.
  function clipStarts(tl) {
    let t = 0; const out = [];
    for (const c of tl.clips || []) { out.push(t); t += SM ? SM.dur(c, 30) : Math.max(1 / 30, ((c.out ?? 3) - (c.in || 0)) / (c.speed || 1)); }
    return out;
  }
  function transitionsApply(tl, p, range) {
    const starts = clipStarts(tl); let n = 0;
    (tl.clips || []).forEach((c, i) => {
      if (!i) return;
      if (range && (starts[i] < range.a - 0.05 || starts[i] > range.b + 0.05)) return;
      if (!p.type || p.type === 'none') { if (c.transition) { delete c.transition; n++; } return; }
      c.transition = transOf(p); n++;
    });
    return n;
  }
  function clipTransitionApply(tl, idx, p) {
    const c = tl.clips?.[idx]; if (!c || idx <= 0) return false;
    if (!p.type || p.type === 'none') delete c.transition; else c.transition = transOf(p);
    return true;
  }
  // Khoảng thời gian có đổi giữa hai bản { TL, CAP }: cảnh / phụ đề / sfx / nhạc mới hoặc khác; chỗ nối đổi chuyển cảnh.
  function changedSpan(a, b) {
    let lo = Infinity, hi = -Infinity;
    const hit = (t0, t1) => { if (Number.isFinite(+t0)) { lo = Math.min(lo, +t0); hi = Math.max(hi, Number.isFinite(+t1) ? +t1 : +t0); } };
    const key = sameKey;
    const diff = (xa = [], xb = []) => { const s = new Set(xa.map(key)); for (const x of xb) if (!s.has(key(x))) hit(x.t0 ?? x.t ?? x.start, x.t1 ?? x.end ?? (x.dur != null ? x.t + x.dur : x.t0 ?? x.t)); };
    diff(a.TL?.scenes, b.TL?.scenes); diff(a.CAP, b.CAP); diff(a.TL?.efx, b.TL?.efx); diff(a.TL?.fx, b.TL?.fx); // efx / fx: S28 M206 diff(a.TL?.audio?.sfx, b.TL?.audio?.sfx); diff(a.TL?.audio?.music, b.TL?.audio?.music);
    const sa = clipStarts(a.TL || {}), cb = b.TL?.clips || [], ca = a.TL?.clips || [];
    cb.forEach((c, i) => { if (key(c.transition) !== key(ca[i]?.transition)) hit(sa[i] - 0.5, sa[i] + 0.5); });
    if (!Number.isFinite(lo)) return null;
    return { t0: r2(Math.max(0, lo)), t1: r2(Math.max(lo, hi)) };
  }

  // ---------- S24 M173: vùng chú thích ----------
  const MIN_REGION = 8;
  // raw { x, y, w, h, t } (w / h âm = kéo ngược) → kẹp trong khung DW×DH, làm tròn; nhỏ hơn MIN_REGION px → null
  function regionOf(raw, DW = 1280, DH = 1280) {
    const o = raw && typeof raw === 'object' ? raw : null;
    if (!o || ![o.x, o.y, o.w, o.h].every(v => v !== null && v !== '' && Number.isFinite(+v))) return null;
    let x0 = +o.x, y0 = +o.y, x1 = x0 + +o.w, y1 = y0 + +o.h;
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    const cx = v => Math.round(Math.max(0, Math.min(DW, v))), cy = v => Math.round(Math.max(0, Math.min(DH, v)));
    x0 = cx(x0); x1 = cx(x1); y0 = cy(y0); y1 = cy(y1);
    if (x1 - x0 < MIN_REGION || y1 - y0 < MIN_REGION) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, t: r2(Math.max(0, Math.min(36000, +o.t || 0))) };
  }
  // Khung hình gốc tại t (giây timeline): clip chứa t theo clipStarts, giây trong nguồn = in + (t − đầu clip) × tốc độ.
  // seq: tệp ảnh của dãy khung (work/frames/%05d.jpg, đánh số từ 1); video: tệp video nguồn (src chuỗi, hoặc audio của clip).
  function frameAt(tl, t) {
    const clips = (tl && tl.clips) || [];
    if (!clips.length) return null;
    const st = clipStarts(tl);
    let i = clips.length - 1;
    while (i > 0 && st[i] > t) i--;
    const c = clips[i] || {}, a = +c.in || 0, b = Number.isFinite(+c.out) ? +c.out : Infinity;
    const at = r2(Math.max(a, Math.min(b, SM ? SM.srcAt(c, (+t || 0) - st[i]) : a + Math.max(0, (+t || 0) - st[i]) * (+c.speed || 1))));
    const out = { at };
    const src = c.src && typeof c.src === 'object' ? c.src : null;
    if (src && typeof src.seq === 'string' && /%0\d+d/.test(src.seq)) {
      const fps = +src.fps > 0 ? +src.fps : 30, n = Math.max(1, Math.min(+src.count > 0 ? +src.count : Infinity, Math.floor(at * fps) + 1));
      out.seq = src.seq.replace(/%0(\d+)d/, (m, d) => String(n).padStart(+d, '0'));
    }
    const vid = typeof c.src === 'string' ? c.src : typeof c.audio === 'string' ? c.audio : '';
    if (vid) out.video = vid;
    return out.seq || out.video ? out : null;
  }

  // ---------- S24 M171: luồng hỏi đáp của dự án (.studio/ask_log.json) ----------
  // Mỗi lượt: { id, at, step, scope: { kind, chip, cid?, a?, b?, t0?, t1? }, src: ask|quick|run, q, kind: reply|error|card|info, text,
  //   warnings?, card?: { title, sub, what?: [≤ 6 dòng "đã đổi gì"], t0, t1, state: open|accepted|dropped|undone|stale } }. Chỉ chữ và số: trường lạ bị bỏ, chuỗi có ảnh
  //   (data:…;base64) bị xoá — không lưu ảnh. logPush giữ LOG_MAX lượt gần nhất, cùng id thì thay (đổi trạng thái thẻ).
  const LOG_MAX = 200;
  const LOG_KINDS = ['reply', 'error', 'card', 'info'], LOG_SRC = ['ask', 'quick', 'run'], CARD_ST = ['open', 'accepted', 'dropped', 'undone', 'stale'];
  const SCOPE_KINDS = ['video', 'range', 'region', 'elem', 'clip', 'step'];
  const noImg = s => (/data:[\w/+.-]+;base64,/i.test(s) ? '' : s);
  const ls = (v, n) => noImg(str(v, n));
  const fin = v => (v !== null && v !== '' && Number.isFinite(+v) ? r2(Math.max(0, Math.min(36000, +v))) : undefined);
  function logEntry(raw) {
    const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
    if (!o) return null;
    const id = String(o.id || '').replace(/[^\w-]/g, '').slice(0, 32), kind = LOG_KINDS.includes(o.kind) ? o.kind : '';
    if (!id || !kind) return null;
    const s = o.scope && typeof o.scope === 'object' ? o.scope : {};
    const scope = { kind: SCOPE_KINDS.includes(s.kind) ? s.kind : 'step', chip: ls(s.chip, 60) };
    if (s.cid) scope.cid = String(s.cid).replace(/[^\w.:-]/g, '').slice(0, 40);
    for (const k of ['a', 'b', 't0', 't1', 'x', 'y', 'w', 'h', 't']) { const v = fin(s[k]); if (v !== undefined) scope[k] = v; }
    const e = { id, at: Math.max(0, Math.round(+o.at || 0)), step: STEPS[o.step] ? o.step : 'build', scope, src: LOG_SRC.includes(o.src) ? o.src : 'ask',
      q: ls(o.q, 300), kind, text: ls(o.text, 1200) };
    const w = (Array.isArray(o.warnings) ? o.warnings : []).map(x => ls(x, 120)).filter(Boolean).slice(0, 3);
    if (w.length) e.warnings = w;
    if (kind === 'card') {
      const c = o.card && typeof o.card === 'object' ? o.card : {};
      e.card = { title: ls(c.title, 80) || 'Thay đổi', sub: ls(c.sub, 120), t0: fin(c.t0) ?? 0, t1: fin(c.t1) ?? 0, state: CARD_ST.includes(c.state) ? c.state : 'open' };
      const what = (Array.isArray(c.what) ? c.what : []).map(x => ls(x, 60)).filter(Boolean).slice(0, 6);
      if (what.length) e.card.what = what;
    }
    return e;
  }
  // Tóm tắt "đã đổi gì" giữa hai bản { TL, CAP } cho thẻ kết quả: cảnh thêm / sửa / bỏ theo loại, dòng phụ đề đổi, SFX / nhạc,
  //   chỗ nối đổi chuyển cảnh. Cảnh cùng loại vừa mất vừa thêm tính là "sửa". Tối đa 6 dòng ngắn.
  const SCENE_VI = { text: 'chữ', broll: 'b-roll', media: 'b-roll', media_card: 'thẻ ảnh', image: 'ảnh', video: 'video', lower_third: 'tên dưới' };
  function changeSummary(a, b) {
    const key = sameKey;
    const delta = (xa = [], xb = []) => {
      const m = new Map();
      for (const x of xa) m.set(key(x), (m.get(key(x)) || 0) + 1);
      const add = [];
      for (const x of xb) { const k = key(x), n = m.get(k) || 0; if (n) m.set(k, n - 1); else add.push(x); }
      const rem = [];
      for (const x of xa) { const k = key(x), n = m.get(k) || 0; if (n > 0) { rem.push(x); m.set(k, n - 1); } }
      return { add, rem };
    };
    const out = [], lab = sc => SCENE_VI[sc?.type] || 'graphic';
    const sc = delta(a?.TL?.scenes, b?.TL?.scenes), by = {};
    for (const x of sc.add) (by[lab(x)] ||= [0, 0])[0]++;
    for (const x of sc.rem) (by[lab(x)] ||= [0, 0])[1]++;
    for (const [l, [ad, rm]] of Object.entries(by)) {
      const ed = Math.min(ad, rm);
      if (ad - ed) out.push(`+${ad - ed} ${l}`);
      if (ed) out.push(`sửa ${ed} ${l}`);
      if (rm - ed) out.push(`bỏ ${rm - ed} ${l}`);
    }
    const cap = delta(a?.CAP, b?.CAP), nc = Math.max(cap.add.length, cap.rem.length);
    if (nc) out.push(`${nc} dòng phụ đề`);
    for (const [k, l] of [['sfx', 'SFX'], ['music', 'nhạc nền']]) {
      const d = delta(a?.TL?.audio?.[k], b?.TL?.audio?.[k]), ed = Math.min(d.add.length, d.rem.length);
      if (d.add.length - ed) out.push(`+${d.add.length - ed} ${l}`);
      if (ed) out.push(`sửa ${ed} ${l}`);
      if (d.rem.length - ed) out.push(`bỏ ${d.rem.length - ed} ${l}`);
    }
    const ca = a?.TL?.clips || [], cb = b?.TL?.clips || [];
    const nt = cb.filter((c, i) => i > 0 && key(c.transition) !== key(ca[i]?.transition)).length;
    if (nt) out.push(`${nt} chỗ nối chuyển cảnh`);
    const nf = cb.filter((c, i) => key(c.filter) !== key(ca[i]?.filter)).length; // S29 M208
    if (nf) out.push(`màu ${nf} clip`);
    const nb = cb.filter((c, i) => key(c.bake) !== key(ca[i]?.bake)).length; // S29 M212
    if (nb) out.push(`hiệu chỉnh ${nb} clip`);
    const ne = delta(a?.TL?.efx, b?.TL?.efx).add.length + delta(a?.TL?.fx, b?.TL?.fx).add.length; // S28 M206
    if (ne) out.push(`+${ne} hiệu ứng`);
    return out.slice(0, 6);
  }
  function logPush(list, raw, max = LOG_MAX) {
    const e = logEntry(raw), out = (Array.isArray(list) ? list : []).filter(x => x && x.id);
    if (!e) return out.slice(-max);
    const i = out.findIndex(x => x.id === e.id);
    if (i >= 0) out[i] = e; else out.push(e);
    return out.slice(-max);
  }
  // đọc file (chuỗi JSON hoặc đã parse; hỏng → rỗng): lọc từng lượt, bỏ lượt trùng id, giữ LOG_MAX lượt cuối
  function logParse(v, max = LOG_MAX) {
    let a = v;
    if (typeof v === 'string') { try { a = JSON.parse(v); } catch { a = null; } }
    if (a && !Array.isArray(a) && Array.isArray(a.items)) a = a.items;
    if (!Array.isArray(a)) return [];
    return a.reduce((acc, x) => logPush(acc, x, Infinity), []).slice(-max);
  }

  const api = { STEPS, ELEM_KINDS, TRANS, TRANS_VI, PANELS, PLATS, PLAT_VI, VA_KINDS, STEP_ACTS, LOG_MAX, stamp, transParams, scopeOf, actionsOf, quickOf, checkPick, transitionsApply, clipTransitionApply, clipAnimApply, colorApply, bakeApply, clipKfApply, KF_PROPS, changedSpan, clipStarts, EFX, EFX_VI, fxAddApply, fxBeatsApply,
    logEntry, logPush, logParse, changeSummary, regionOf, frameAt, ANIM_GUIDE, elemAnimApply }; // S24 M170: bỏ formOf / colParts (một dạng: tab Claude cột phải)
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AskCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
