// S29 M211: lõi thuần của preset người dùng — lưu chuyển cảnh + tham số, hoạt ảnh clip, hoạt ảnh Vào / Ra / Lặp, màu, kiểu chữ
// để dùng lại (tab "Của tôi" của từng panel). File ~/.ai-video-studio/presets.json (route studio/routes/84_presets.mjs).
// Preset có brand_id tuỳ chọn (M189): preset của thương hiệu đưa vào ngữ cảnh Claude (gu thương hiệu M192, scripts/ask_route.mjs).
// Không DOM: chạy trong trình duyệt (window.PresetsCore), trong route và test Node (module.exports, scripts/tests/s29_presets.test.mjs).
'use strict';
(function (root) {
  // kind → nhãn + cách lấy / đặt giá trị trên obj (clip, cảnh, dòng chữ)
  const ANIM_KEYS = ['anim', 'anim_dur', 'anim_out', 'anim_loop'], TEXT_KEYS = ['font', 'weight', 'style', 'italic', 'color'];
  const pick = (o, ks) => Object.fromEntries(ks.filter(k => o[k] != null && o[k] !== '').map(k => [k, o[k]]));
  const deep = v => JSON.parse(JSON.stringify(v));
  const KINDS = {
    trans: { label: 'Chuyển cảnh', get: o => (o.transition?.type ? deep(o.transition) : null), set: (o, v) => { o.transition = deep(v); } },
    clip_anim: { label: 'Hoạt ảnh clip', get: o => (o.anim && typeof o.anim === 'object' && Object.keys(o.anim).length ? deep(o.anim) : null), set: (o, v) => { o.anim = deep(v); } },
    anim: { label: 'Hoạt ảnh', get: o => { const v = pick(o, ANIM_KEYS); if (typeof v.anim !== 'string') delete v.anim; return Object.keys(v).length ? deep(v) : null; },
      set: (o, v) => { for (const k of ANIM_KEYS) delete o[k]; Object.assign(o, deep(v)); } },
    color: { label: 'Màu', get: o => (o.filter && Object.keys(o.filter).length ? deep(o.filter) : null), set: (o, v) => { o.filter = deep(v); } },
    text: { label: 'Kiểu chữ', get: o => { const v = pick(o, TEXT_KEYS); return Object.keys(v).length ? v : null; },
      set: (o, v) => { for (const k of TEXT_KEYS) delete o[k]; Object.assign(o, deep(v)); } },
  };
  const valueOf = (kind, o) => (KINDS[kind] && o ? KINDS[kind].get(o) : null);
  function applyTo(kind, o, v) { if (!KINDS[kind] || !o || !v || typeof v !== 'object') return false; KINDS[kind].set(o, v); return true; }

  // ---- kiểm dữ liệu (route ghi đĩa và test) ----
  const MAX = 300, NAME = 40, VAL = 4000;
  const str = (v, n) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, n);
  const ID = /^[a-z0-9-]{1,40}$/;
  // giá trị chỉ còn chữ ngắn / số hữu hạn / bool / mảng / object thường, sâu ≤ 4; bỏ khoá lạ (__proto__…)
  function plain(v, d = 0) {
    if (v == null) return undefined;
    if (typeof v === 'string') return v.slice(0, 200);
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (typeof v === 'boolean') return v;
    if (d >= 4 || typeof v !== 'object') return undefined;
    if (Array.isArray(v)) return v.slice(0, 60).map(x => plain(x, d + 1)).filter(x => x !== undefined);
    const o = {};
    for (const [k, x] of Object.entries(v)) { if (!/^[A-Za-z_][\w]{0,30}$/.test(k) || k === '__proto__') continue; const y = plain(x, d + 1); if (y !== undefined) o[k] = y; }
    return o;
  }
  // raw → preset sạch {id?, kind, name, value, brand_id?} hoặc ném lỗi có thông điệp tiếng Việt
  function clean(raw) {
    const b = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const kind = String(b.kind || '');
    if (!KINDS[kind]) throw new Error('Loại preset không hợp lệ');
    const name = str(b.name, NAME) || KINDS[kind].label;
    const v = plain(b.value);
    // lọc lại theo đúng trường của loại: get trên một obj giả chỉ giữ trường loại đó có
    const probe = kind === 'trans' ? { transition: v } : kind === 'clip_anim' ? { anim: v } : kind === 'color' ? { filter: v } : { ...(v || {}) };
    const value = v && typeof v === 'object' && !Array.isArray(v) ? KINDS[kind].get(probe) : null;
    if (!value) throw new Error('Preset trống: chỉnh xong rồi lưu');
    if (JSON.stringify(value).length > VAL) throw new Error('Preset quá lớn');
    const out = { kind, name, value };
    if (b.id != null && ID.test(String(b.id))) out.id = String(b.id);
    if (b.brand_id != null && b.brand_id !== '' && ID.test(String(b.brand_id))) out.brand_id = String(b.brand_id);
    return out;
  }
  // đọc file: bỏ mục hỏng, giữ tối đa MAX
  function parse(v) {
    const list = Array.isArray(v?.items) ? v.items : Array.isArray(v) ? v : [];
    const out = [];
    for (const x of list) { try { const p = clean(x); if (p.id) out.push({ ...p, at: +x.at || 0 }); } catch { /* bỏ mục hỏng */ } }
    return out.slice(-MAX);
  }
  // thêm / thay (cùng id) — mới nhất ở cuối; quá MAX thì bỏ cái cũ nhất
  function upsert(list, p, at = Date.now()) {
    const rest = list.filter(x => x.id !== p.id);
    return [...rest, { ...p, at }].slice(-MAX);
  }
  // preset hiện cho thương hiệu brand: chung (không brand_id) + của brand đó; của thương hiệu đứng trước, mới trước
  function listFor(list, kind, brand) {
    return (list || []).filter(x => (!kind || x.kind === kind) && (!x.brand_id || x.brand_id === brand))
      .sort((a, b) => (b.brand_id ? 1 : 0) - (a.brand_id ? 1 : 0) || (b.at || 0) - (a.at || 0));
  }
  // Ngữ cảnh cho Claude (M192): tối đa 16 preset, giá trị JSON gọn. Trả [{kind, name, brand, value}].
  function brief(list, brand) {
    return listFor(list, '', brand).slice(0, 16).map(x => ({ kind: x.kind, name: x.name, brand: !!x.brand_id, value: x.value }));
  }
  // server kiểm lại brief do trình duyệt gửi
  function checkBrief(v) {
    if (!Array.isArray(v)) return [];
    const out = [];
    for (const x of v.slice(0, 16)) { try { const p = clean(x); out.push({ kind: p.kind, name: p.name, brand: !!x?.brand, value: p.value }); } catch { /* bỏ */ } }
    return out;
  }
  // dòng mô tả cho prompt: "- [Chuyển cảnh] Tên (thương hiệu): {…}"
  const briefLines = b => b.map(x => `- [${KINDS[x.kind]?.label || x.kind}] ${x.name}${x.brand ? ' (của thương hiệu)' : ''}: ${JSON.stringify(x.value)}`).join('\n');

  const T = { KINDS, valueOf, applyTo, clean, parse, upsert, listFor, brief, checkBrief, briefLines, MAX };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.PresetsCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
