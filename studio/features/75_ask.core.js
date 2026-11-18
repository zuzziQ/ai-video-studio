// S22 M153: lõi thuần của thanh Hỏi Claude (giao diện 75_ask.js, route studio/routes/75_ask.mjs + scripts/ask_route.mjs).
// Không DOM: chạy trong trình duyệt (window.AskCore) và trong Node (scripts/tests/s22_ask.test.mjs, scripts/ask_route.mjs).
//   scopeOf(ctx)           → phạm vi đang hỏi { kind: video|range|elem|clip|step, step, chip, … } hoặc null (Cài đặt: không có thanh)
//   actionsOf(scope)       → danh sách việc mô hình được chọn (luôn có 'answer' = chỉ trả lời bằng chữ)
//   quickOf(scope)         → 3–4 gợi ý nhanh: chạy thẳng một việc với tham số cố định, không qua bộ định tuyến; gợi ý có `ask`
//                            (vd. "Giải thích lỗi") gửi đúng câu đó qua bộ định tuyến (vẫn chỉ gọi mô hình khi bấm, C23)
//   checkPick(raw, scope)  → { action, params, reply, warnings }: việc lạ → 'answer'; tham số lọc theo bảng, ngoài biên bị kẹp / bỏ
//   transitionsApply(tl, p, range) / changedSpan(a, b) → áp chuyển cảnh lên một bản timeline; khoảng thời gian đổi giữa hai bản
// Bảng mục 5 của docs/plans/S22-che-do-va-hoi-claude.md. M154: việc của Chuẩn bị / Nguồn / Kiểm tra / Xuất và đăng gọi hàm sẵn có
// của panel (75_ask.js runAction); kết quả qua Studio.review hoặc ô đề xuất Studio.assistPanel của panel đó.
'use strict';
(function (root) {
  const STEPS = { prep: 'Chuẩn bị', source: 'Nguồn', build: 'Dựng', check: 'Kiểm tra', ship: 'Xuất và đăng' };
  const ELEM_KINDS = ['line', 'cap', 'node', 'badge', 'scene'];
  // = TRANS_TYPES của studio/clips.js (id); đổi ở đó thì đổi ở đây
  const TRANS = ['fade', 'dissolve', 'slide_l', 'slide_r', 'slide_up', 'push', 'zoom', 'zoom_out', 'blur', 'whip', 'spin', 'wipe', 'circle', 'flash', 'glitch'];
  const TRANS_VI = { fade: 'mờ dần', dissolve: 'hoà tan', slide_l: 'trượt trái', slide_r: 'trượt phải', slide_up: 'trượt lên', push: 'đẩy', zoom: 'phóng vào',
    zoom_out: 'thu ra', blur: 'nhoè', whip: 'lia nhanh', spin: 'xoay', wipe: 'gạt', circle: 'vòng tròn', flash: 'loé sáng', glitch: 'nhiễu' };
  const AUTOFILL = ['all', 'broll', 'sfx'];
  const DENS = ['thua', 'vua', 'day'];
  // = /api/publish/platforms (scripts/publish.mjs); 'all' = mọi nền tảng đang tích ở hộp Đăng
  const PLATS = ['tiktok', 'youtube', 'facebook', 'instagram', 'zalo'];
  const PLAT_VI = { all: 'mọi nền tảng', tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', zalo: 'Zalo' };
  const VA_KINDS = ['hook', 'style', 'both']; // = #vakind của 16_qc.js
  // panel mở được theo bước (id của PANELS trong 01_workflow.js)
  const PANELS = {
    prep: { brands: 'Bộ thương hiệu', products: 'Sản phẩm', kho: 'Kho' },
    source: { words: 'Lời thoại', ai: 'Làm sạch lời nói', longform: 'Cắt clip từ video dài', 'wf-new': 'Video nguồn' },
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
  // ctx: { step, sel?: { kind, cid, label, text, idx, t0, t1, knobs }, range?: { a, b } }
  // Ưu tiên: khoảng chọn trên timeline (đặt có chủ đích, chỉ ở bước Dựng) → element / clip đang chọn → bước. Cài đặt: không có thanh.
  function scopeOf(ctx = {}) {
    const step = STEPS[ctx.step] ? ctx.step : ctx.step === 'settings' ? 'settings' : 'build';
    if (step === 'settings') return null;
    const r = ctx.range, sel = ctx.sel;
    if (step === 'build' && r && Number.isFinite(+r.a) && Number.isFinite(+r.b) && Math.abs(r.b - r.a) >= 0.2) {
      const a = Math.min(r.a, r.b), b = Math.max(r.a, r.b);
      return { kind: 'range', step, a: r2(a), b: r2(b), chip: `${stamp(a)}–${stamp(b)}`, icon: 'ti-arrows-horizontal' };
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
    transitions: { what: 'Đặt cùng một chuyển cảnh cho mọi chỗ nối giữa các clip (type "none" = bỏ hết).',
      params: { type: { t: 'enum', values: [...TRANS, 'none'] }, dur: { t: 'num', min: 0.1, max: 1.5 } } },
    elem_edit: { what: 'Sửa element đang chọn (kiểu, màu, font, vị trí, cỡ, hoạt ảnh, thời lượng, viết lại chữ). ask = câu yêu cầu ngắn gọn bằng tiếng Việt.',
      params: { ask: { t: 'str', max: 200 } } },
    elem_variants: { what: 'Đưa 3 biến thể của element đang chọn để người dùng xem và chọn.', params: {} },
    elem_knobs: { what: 'Gợi ý 2–3 núm điều chỉnh mới cho element đang chọn.', params: {} },
    clip_transition: { what: 'Đặt chuyển cảnh vào clip đang chọn (type "none" = bỏ).', params: { type: { t: 'enum', values: [...TRANS, 'none'] }, dur: { t: 'num', min: 0.1, max: 1.5 } } },
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
  function actionsOf(scope) {
    if (!scope) return [];
    const ids = scope.kind === 'video' || scope.kind === 'range' ? ['ai_build', 'autofill', 'transitions']
      : scope.kind === 'elem' ? ['elem_edit', 'elem_variants', ...(scope.knobs ? ['elem_knobs'] : [])]
        : scope.kind === 'clip' ? (scope.idx > 0 ? ['clip_transition', 'open_panel'] : ['open_panel'])
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
      case 'range': return [q('Chuyển cảnh trong đoạn', 'transitions', { type: 'fade', dur: 0.4 }, 'ti-transition-right'),
        q('Lia nhanh trong đoạn', 'transitions', { type: 'whip', dur: 0.3 }, 'ti-wind'), q('Thêm b-roll', 'autofill', { mode: 'broll' }, 'ti-photo-plus')];
      case 'elem': return [q('Nổi hơn', 'elem_edit', { ask: 'nổi hơn' }), q('Hợp thương hiệu', 'elem_edit', { ask: 'hợp thương hiệu' }),
        ...(scope.text ? [q('Viết lại chữ', 'elem_edit', { ask: 'viết lại chữ ngắn gọn, hấp dẫn hơn' }, 'ti-pencil')] : []),
        q('3 biến thể', 'elem_variants', {}, 'ti-layout-grid'), ...(scope.knobs ? [q('Gợi ý núm', 'elem_knobs', {}, 'ti-adjustments-horizontal')] : [])].slice(0, 4);
      case 'clip': return [...(scope.idx > 0 ? [q('Chuyển cảnh mờ dần', 'clip_transition', { type: 'fade', dur: 0.4 }, 'ti-transition-right'),
        q('Chuyển cảnh lia nhanh', 'clip_transition', { type: 'whip', dur: 0.3 }, 'ti-wind')] : []),
      q('Bộ lọc màu', 'open_panel', { panel: 'filter' }, 'ti-color-filter'), q('B-roll phủ', 'open_panel', { panel: 'wf-broll' }, 'ti-photo-plus')];
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
    const need = { elem_edit: ['ask'], transitions: ['type'], clip_transition: ['type'], open_panel: ['panel'] }[id] || [];
    if (need.some(k => params[k] == null)) { warnings.push(`thiếu ${need.filter(k => params[k] == null).join(', ')}`); return { action: 'answer', params: {}, reply: reply || 'Chưa rõ muốn làm gì, thử nói cụ thể hơn.', warnings }; }
    if (id === 'answer' && !reply) return { action: 'answer', params: {}, reply: 'Chưa có việc nào khớp câu hỏi trong phạm vi này.', warnings };
    if (id === 'autofill' && !params.mode) params.mode = 'all';
    if (id === 'publish_write' && !params.platform) params.platform = 'all';
    if (id === 'post_time' && !params.platform) params.platform = 'tiktok';
    if (id === 'ab_hooks' && !params.kind) params.kind = 'hook';
    if (id === 'clean_speech' && !params.claude) params.claude = 'khong';
    if (id === 'find_highlights' && params.n != null) params.n = Math.round(params.n);
    if ((id === 'transitions' || id === 'clip_transition') && params.type !== 'none' && params.dur == null) params.dur = 0.4;
    return { action: id, params, reply, warnings };
  }

  // ---------- áp lên một bản timeline (bản sao để xem, hoặc timeline thật khi Nhận) ----------
  // Chuyển cảnh: mọi chỗ nối (clip i > 0); range [a, b] → chỉ chỗ nối nằm trong đoạn. Trả số chỗ nối đã đổi.
  function clipStarts(tl) {
    let t = 0; const out = [];
    for (const c of tl.clips || []) { out.push(t); t += Math.max(1 / 30, ((c.out ?? 3) - (c.in || 0)) / (c.speed || 1)); }
    return out;
  }
  function transitionsApply(tl, p, range) {
    const starts = clipStarts(tl); let n = 0;
    (tl.clips || []).forEach((c, i) => {
      if (!i) return;
      if (range && (starts[i] < range.a - 0.05 || starts[i] > range.b + 0.05)) return;
      if (!p.type || p.type === 'none') { if (c.transition) { delete c.transition; n++; } return; }
      c.transition = { type: p.type, dur: r2(p.dur ?? 0.4) }; n++;
    });
    return n;
  }
  function clipTransitionApply(tl, idx, p) {
    const c = tl.clips?.[idx]; if (!c || idx <= 0) return false;
    if (!p.type || p.type === 'none') delete c.transition; else c.transition = { type: p.type, dur: r2(p.dur ?? 0.4) };
    return true;
  }
  // Khoảng thời gian có đổi giữa hai bản { TL, CAP }: cảnh / phụ đề / sfx / nhạc mới hoặc khác; chỗ nối đổi chuyển cảnh.
  function changedSpan(a, b) {
    let lo = Infinity, hi = -Infinity;
    const hit = (t0, t1) => { if (Number.isFinite(+t0)) { lo = Math.min(lo, +t0); hi = Math.max(hi, Number.isFinite(+t1) ? +t1 : +t0); } };
    const key = x => JSON.stringify(x, (k, v) => (k === '_orig' ? undefined : v));
    const diff = (xa = [], xb = []) => { const s = new Set(xa.map(key)); for (const x of xb) if (!s.has(key(x))) hit(x.t0 ?? x.t, x.t1 ?? x.t0 ?? x.t); };
    diff(a.TL?.scenes, b.TL?.scenes); diff(a.CAP, b.CAP); diff(a.TL?.audio?.sfx, b.TL?.audio?.sfx); diff(a.TL?.audio?.music, b.TL?.audio?.music);
    const sa = clipStarts(a.TL || {}), cb = b.TL?.clips || [], ca = a.TL?.clips || [];
    cb.forEach((c, i) => { if (key(c.transition) !== key(ca[i]?.transition)) hit(sa[i] - 0.5, sa[i] + 0.5); });
    if (!Number.isFinite(lo)) return null;
    return { t0: r2(Math.max(0, lo)), t1: r2(Math.max(lo, hi)) };
  }

  const api = { STEPS, ELEM_KINDS, TRANS, TRANS_VI, PANELS, PLATS, PLAT_VI, VA_KINDS, STEP_ACTS, stamp, scopeOf, actionsOf, quickOf, checkPick, transitionsApply, clipTransitionApply, changedSpan, clipStarts }; // S24 M170: bỏ formOf / colParts (một dạng: tab Claude cột phải)
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AskCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
