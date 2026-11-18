// S21 M147: lõi thuần của "Chi tiết mục thư viện" ở cột phải. Không DOM, không gọi server: nhận dữ liệu có sẵn của mục (mẫu từ
// GET /api/templates, mẫu chữ TEXT_PRESETS, item gói PACKS, khối HF_CATALOG, sticker, hình, nhạc / SFX, chuyển cảnh, bộ lọc,
// kiểu phụ đề) và trả mô tả chi tiết { key, kind, kindLabel, title, chips, preview, desc, rows, lists, actions } để
// features/69_libdetail.js vẽ. Chạy trong trình duyệt (window.LibDetailCore) và trong Node (scripts/tests/s21_libdetail.test.mjs).
//   actions: add = Thêm tại playhead · apply = Áp dụng (cả video / clip) · all = Áp cho mọi clip · replace = Thay element đang chọn.
'use strict';
(function (root) {
  const KINDS = { tpl: 'Mẫu', text: 'Mẫu chữ', cs: 'Kiểu phụ đề', fx: 'Hiệu ứng', hf: 'Khối HyperFrames', sticker: 'Sticker', shape: 'Hình khối',
    music: 'Nhạc nền', sfx: 'Hiệu ứng âm thanh', trans: 'Chuyển cảnh', filter: 'Bộ lọc' };
  // Mục áp cho cả video / clip (không chèn element mới).
  const WHOLE = new Set(['tpl', 'cs', 'trans', 'filter']);
  const keyOf = (kind, id) => `${kind}:${id}`;
  const parseKey = k => { const i = String(k || '').indexOf(':'); return i < 0 ? null : { kind: k.slice(0, i), id: k.slice(i + 1) }; };
  const r1 = v => Math.round(v * 10) / 10;
  const secs = v => (v > 0 ? `${r1(v)} giây` : '');
  const uniq = a => [...new Set(a.filter(Boolean))];

  // Element đang chọn có "cùng loại" với mục không → cách thay (hoặc null). sel = { kind, type, idx } (kind của comp, type của cảnh).
  const NOT_GFX = new Set(['emoji_pop', 'shape', 'photo', 'text']);
  function replaceMode(kind, sel) {
    if (!sel) return null;
    const scene = sel.kind === 'scene';
    switch (kind) {
      case 'sticker': return scene && sel.type === 'emoji_pop' ? 'sticker' : null;
      case 'text': return sel.kind === 'line' ? 'text' : null;
      case 'shape': return scene && sel.type === 'shape' ? 'shape' : null;
      case 'fx': case 'hf': return scene && !NOT_GFX.has(sel.type) ? 'scene' : null;
      case 'music': return sel.kind === 'music' ? 'music' : null;
      case 'sfx': return sel.kind === 'sfx' ? 'sfx' : null;
      case 'trans': return sel.kind === 'clip' && sel.idx > 0 ? 'clip' : null;
      case 'filter': return sel.kind === 'clip' ? 'clip' : null;
      default: return null; // mẫu, kiểu phụ đề: áp cả video, không thay element
    }
  }
  const REPLACE_LABEL = { text: 'Áp kiểu lên chữ đang chọn', clip: 'Áp cho clip đang chọn', music: 'Thay nhạc đang chọn', sfx: 'Thay SFX đang chọn' };
  function actionsOf(kind, sel) {
    const rm = replaceMode(kind, sel), a = [];
    if (kind === 'tpl') a.push({ a: 'apply', label: 'Áp dụng mẫu', ic: 'ti-wand', primary: true }, { a: 'big', label: 'Xem lớn', ic: 'ti-arrows-maximize' });
    else if (kind === 'cs') a.push({ a: 'apply', label: 'Áp cho cả video', ic: 'ti-badge-cc', primary: true });
    else if (kind === 'trans' || kind === 'filter') {
      if (rm) a.push({ a: 'replace', label: REPLACE_LABEL.clip, ic: 'ti-check', primary: true });
      else a.push({ a: 'apply', label: kind === 'trans' ? 'Áp dụng tại playhead' : 'Áp cho clip tại playhead', ic: 'ti-check', primary: true });
      a.push({ a: 'all', label: 'Áp cho cả video', ic: 'ti-copy' });
    } else {
      if (rm) a.push({ a: 'replace', label: REPLACE_LABEL[rm] || 'Thay element đang chọn', ic: 'ti-replace', primary: true });
      a.push({ a: 'add', label: 'Thêm tại playhead', ic: 'ti-plus', primary: !rm });
    }
    return a;
  }

  // Phông chữ dùng trong một cây dữ liệu (cảnh của mẫu): mọi trường "font" / "disp" dạng chuỗi.
  function fontsIn(obj) {
    const out = [];
    JSON.stringify(obj || {}, (k, v) => { if ((k === 'font' || k === 'disp') && typeof v === 'string') out.push(v); return v; });
    return uniq(out.map(fontName));
  }
  const fontName = f => String(f).replace(/var\(--sans\)/, 'Be Vietnam Pro').replace(/var\(--disp\)/, 'Montserrat').split(',')[0].replace(/['"]/g, '').trim();
  const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
  const COLOR_VI = { primary: 'Chính', accent: 'Nhấn', dark: 'Tối', light: 'Sáng', paper: 'Giấy', good: 'Tốt' };

  // ---- từng loại ----
  function tpl(t, c) {
    const p = c.pack || {}, sc = Array.isArray(t.scenes) ? t.scenes : [], fx = Array.isArray(t.fx) ? t.fx : [], nameOf = c.nameOf || (x => x);
    const h = (t.aspect || '9:16') === '16:9', B = t.brand || {};
    const layers = sc.slice().sort((a, b) => (a.t0 || 0) - (b.t0 || 0)).map(s => `${nameOf(s)} · ${r1(s.t0 || 0)}–${r1(s.t1 || 0)}s`);
    const full = sc.filter(s => s.mode === 'full' || (c.layout && c.layout.has(s.type))).length;
    const colors = Object.keys(COLOR_VI).filter(k => HEX.test(B[k] || '')).map(k => ({ k: COLOR_VI[k], v: B[k] }));
    const fonts = uniq([B.font, B.disp].filter(Boolean).map(fontName).concat(fontsIn(sc)));
    return {
      title: t.name || t.id, desc: t.desc || '',
      chips: uniq([c.catName, `${p.icon || ''} ${p.name || t.pack || ''}`.trim(), t.aspect || '9:16', t.base_dur ? `~${Math.round(t.base_dur)} giây` : '', t.user ? 'Của tôi' : '']),
      preview: t.preview?.mp4 ? { t: 'video', src: t.preview.mp4, poster: t.preview.jpg || '', h } : t.preview?.jpg ? { t: 'img', src: t.preview.jpg, h } : { t: 'emoji', ch: p.icon || '🎬' },
      rows: [
        ['Bố cục', `${h ? 'Ngang 16:9' : 'Dọc 9:16'} · ${sc.length} lớp graphic${full ? ` (${full} phủ kín khung)` : ''}${fx.length ? ` · ${fx.length} hiệu ứng` : ''}`],
        ['Gói style', p.name ? `${p.icon || ''} ${p.name}`.trim() : t.pack || '—'],
        ['Kiểu phụ đề', t.caption_style === 'none' ? 'Tắt phụ đề' : t.caption_style ? (c.capLabel || t.caption_style) : t.use_recipe ? 'Theo gói' : 'Giữ như hiện tại'],
        ['Nhạc', t.music ? (c.moodVi?.[t.music] || t.music) : 'Không đổi'],
        ['Font', fonts.join(', ') || 'Theo gói'],
        ['Dựng tự động', t.use_recipe ? 'Có: thêm intro, graphic theo lời nói, CTA cuối theo gói' : 'Không, chỉ các lớp của mẫu'],
      ],
      colors,
      lists: [
        layers.length ? { title: 'Lớp sẽ thêm', ic: 'ti-stack-2', items: layers } : null,
        t.needs?.length ? { title: 'Bạn cần chuẩn bị', ic: 'ti-checklist', items: t.needs } : null,
      ].filter(Boolean),
      warn: c.vertical != null && h === c.vertical ? `Mẫu làm cho khổ ${h ? 'ngang 16:9' : 'dọc 9:16'}, dự án đang là ${c.vertical ? 'dọc 9:16' : 'ngang 16:9'}: bố cục tự đổi theo khổ dự án.` : '',
      note: 'Mẫu chỉ thay graphic, phụ đề, nhạc, hiệu ứng; video và lời nói giữ nguyên. Hoàn tác được (⌘Z).',
    };
  }
  const STYLE_VI = { yellow: 'Vàng viền đen', white: 'Trắng nổi', ink: 'Mực vàng', fire: 'Lửa', glow: 'Phát sáng', neon: 'Neon', dark: 'Chữ tối nền trắng' };
  function text(p, c) {
    const q = p.p || {}, anim = (c.anims || []).find(a => a[0] === q.anim)?.[1] || q.anim || 'Bật';
    const kieu = uniq([STYLE_VI[q.style] || q.style, q.italic === false ? '' : 'nghiêng', q.weight ? `đậm ${q.weight}` : 'đậm 900', q.upper === false ? '' : 'IN HOA']).join(' · ');
    return {
      title: p.name, chips: [KINDS.text, anim],
      preview: { t: 'text', text: p.text, css: p.css || '' },
      rows: [['Font', q.font ? fontName(q.font) : 'Montserrat'], ['Cỡ', `${q.size || 56} px`], ['Kiểu', kieu], ['Hoạt ảnh', anim], ['Chữ mẫu', p.text], ['Thời lượng', '2 giây']],
      note: 'Chèn một dòng chữ tại playhead; sửa chữ bằng bấm đúp trên khung. "Áp kiểu" giữ nguyên chữ, vị trí và thời gian của chữ đang chọn.',
    };
  }
  function cs(x, c) {
    return {
      title: x.label || x.id, chips: [KINDS.cs, 'cả video', x.pack?.name ? `${x.pack.icon || ''} ${x.pack.name}`.trim() : ''].filter(Boolean),
      preview: { t: 'icon', ic: x.id === 'none' ? 'ti-badge-cc-off' : 'ti-badge-cc' },
      rows: [['Áp cho', 'Mọi câu phụ đề của video'], ['Đang dùng', x.current ? 'Có' : 'Không'], x.pack ? ['Thuộc gói', x.pack.name] : null].filter(Boolean),
      note: x.id === 'none' ? 'Tắt phụ đề cho cả video (lời thoại vẫn giữ để sửa sau).' : 'Đổi kiểu chữ của toàn bộ phụ đề; nội dung và thời gian các câu giữ nguyên.',
    };
  }
  function fx(x, c) {
    const p = x.pack || {}, it = x.item || {}, b = x.block; // b: mục HF_CATALOG (khối HyperFrames) hoặc không có
    const base = {
      chips: uniq([`${p.icon || ''} ${p.name || ''}`.trim(), x.dur ? secs(x.dur) : '']),
      preview: x.thumb ? { t: 'img', src: x.thumb, h: !!c.horizontal } : { t: 'emoji', ch: p.icon || '✦' },
    };
    if (!b) return { ...base, title: it.label || it.type, desc: p.desc || '', rows: [['Gói', p.name || '—'], ['Loại cảnh', c.nameOf ? c.nameOf({ type: it.type }) : it.type], ['Thời lượng', secs(x.dur) || '—']],
      note: 'Chèn tại playhead; chữ, màu, vị trí chỉnh ở Thuộc tính sau khi thêm.' };
    const vars = (b.vars || []).map(v => `${c.varLabel ? c.varLabel(v) : v.label || v.id}${v.type ? ` (${v.type === 'color' ? 'màu' : v.type === 'number' ? 'số' : v.type === 'boolean' ? 'bật/tắt' : 'chữ'})` : ''}`);
    return { ...base, title: b.label || it.label, desc: b.title ? `${b.title} · HyperFrames (HeyGen, Apache-2.0)` : '',
      chips: uniq([...base.chips, b.layer === 'full' ? 'phủ kín khung' : 'nền trong suốt']),
      rows: [['Nhóm', p.name || b.group || '—'], ['Thời lượng gốc', secs(b.dur) || '—'], ['Khung', `${b.w}×${b.h}`], ['Chữ đổi được', `${(b.texts || []).length}`]],
      lists: [vars.length ? { title: 'Biến đổi được', ic: 'ti-adjustments', items: vars } : null, b.tags?.length ? { title: 'Thẻ', ic: 'ti-tag', items: [b.tags.join(' · ')] } : null].filter(Boolean),
      note: 'Biến và chữ của khối sửa ở tab Khối (Thuộc tính) sau khi thêm.' };
  }
  function sticker(x) {
    return { title: x.ch, chips: [KINDS.sticker, '1,6 giây'], preview: x.url ? { t: 'img', src: x.url, sq: true } : { t: 'emoji', ch: x.ch },
      rows: [['Loại', 'Emoji 3D bật lên'], ['Cỡ', '160 px'], ['Thời lượng', '1,6 giây']], note: '"Thay" giữ vị trí, cỡ và thời gian của sticker đang chọn.' };
  }
  function shape(x) {
    return { title: x.label, chips: [KINDS.shape, '3 giây'], preview: { t: 'svg', svg: x.svg },
      rows: [['Vị trí', 'Giữa khung tại playhead'], ['Màu', 'Màu nhấn của thương hiệu'], ['Hoạt ảnh', 'Mờ dần']], note: '"Thay" đổi loại hình, giữ vị trí, màu và thời gian.' };
  }
  function music(x, c) {
    const b = String(x.id).replace(/_\d+$/, ''), n = String(x.id).match(/_(\d+)$/)?.[1];
    return { title: `${c.moodVi?.[b] || b}${n ? ' ' + n : ''}`, chips: [KINDS.music, c.moodVi?.[b] || b], preview: { t: 'audio', src: x.src, ic: x.ic || 'ti-music' },
      rows: [['Tâm trạng', c.moodVi?.[b] || b], ['File', `${x.id}.mp3`], ['Độ dài', '…'], ['Đặt', 'Từ playhead tới hết video, −18 dB']], note: '"Thay" giữ đoạn và âm lượng của nhạc đang chọn.' };
  }
  function sfx(x) {
    return { title: String(x.id).replace(/_/g, ' '), chips: [KINDS.sfx], preview: { t: 'audio', src: x.src, ic: 'ti-bell' },
      rows: [['File', x.file || x.id], ['Độ dài', '…'], ['Đặt', 'Tại playhead, −14 dB']], note: '"Thay" giữ thời điểm và âm lượng của SFX đang chọn.' };
  }
  function trans(x, c) {
    return { title: x.label, chips: [KINDS.trans, secs(c.dur || .4)], preview: { t: 'trans', k: x.id, ic: x.ic },
      rows: [['Thời lượng', secs(c.dur || .4)], ['Áp cho', x.id ? 'Chỗ nối vào clip' : 'Bỏ chuyển cảnh'], ['Đổi thời lượng', 'Thanh trượt ở panel Chuyển cảnh']], note: 'Rê chuột lên ảnh để xem thử. "Áp cho cả video" đặt cho mọi chỗ nối giữa các clip.' };
  }
  function filter(x) {
    return { title: x.label, chips: [KINDS.filter], preview: { t: 'filter', img: x.img || '', css: x.css || 'none' },
      rows: [['Áp cho', 'Một clip của track chính'], ['Tinh chỉnh', 'Tab Màu của clip ở Thuộc tính']], note: '"Áp cho cả video" đặt bộ lọc này cho mọi clip.' };
  }
  const BUILD = { tpl, text, cs, fx, hf: fx, sticker, shape, music, sfx, trans, filter };

  // data: dữ liệu của mục theo loại; ctx: { sel, nameOf, capLabel, moodVi, anims, vertical, horizontal, varLabel, pack, catName, dur, layout }
  function describe(kind, id, data, ctx = {}) {
    const f = BUILD[kind]; if (!f || !data) return null;
    const d = f(data, ctx);
    return { key: keyOf(kind, id), kind, kindLabel: KINDS[kind], whole: WHOLE.has(kind), desc: '', chips: [], rows: [], lists: [], colors: [], warn: '', note: '', ...d,
      rows: (d.rows || []).filter(r => r && r[1] !== '' && r[1] != null), actions: actionsOf(kind, ctx.sel), replace: replaceMode(kind, ctx.sel) };
  }

  const T = { KINDS, WHOLE, keyOf, parseKey, replaceMode, actionsOf, fontsIn, fontName, describe };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.LibDetailCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
