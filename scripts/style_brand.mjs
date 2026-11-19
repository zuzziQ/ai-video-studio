// S27 M190: Style Lab nhận thương hiệu. Hàm thuần (không I/O ngoài loadBrand) dùng chung cho scripts/style_lab.mjs (CLI --brand)
// và studio/routes/70_stylelab.mjs: làm sạch màu / font / chữ của brand kit trước khi đưa vào prompt Claude và vào element engine.
// Bài học ai-video-studio-053: engine chèn font/màu thẳng vào style="…" viết bằng ngoặc kép, nên giá trị có " làm chữ biến mất.
// Vì vậy: font chỉ còn tên họ font (bỏ ngoặc, bỏ phần dự phòng sau dấu phẩy), màu chỉ còn #hex, chữ tự do không có ngoặc kép.
import fs from 'node:fs';
import path from 'node:path';

export const BRAND_ID = /^[a-z0-9][a-z0-9_-]{0,60}$/;

// '"Bungee", sans-serif' → 'Bungee'; 'var(--sans)' → '' (không phải tên font); giữ chữ có dấu, số, khoảng trắng, '-'.
export function cleanFont(s) {
  const first = String(s ?? '').split(',')[0];
  if (/var\(|[{}<>;:=]/.test(first)) return '';
  return first.replace(/["'`]/g, '').replace(/[^\p{L}\p{N} \-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

// Chuỗi hoặc mảng bất kỳ → '#AABBCC, #112233' (chỉ #hex 3/6/8 chữ số, viết hoa, không trùng, tối đa 6 màu).
export function cleanColors(v) {
  const src = Array.isArray(v) ? v.join(' ') : String(v ?? '');
  const out = [];
  for (const m of src.matchAll(/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/gi)) {
    const c = m[0].toUpperCase();
    if (!out.includes(c)) out.push(c);
    if (out.length >= 6) break;
  }
  return out.join(', ');
}

// Chữ tự do (giọng văn, slogan, CTA) cho prompt: một dòng, không ngoặc kép / backtick, tối đa n ký tự.
export const cleanText = (s, n = 200) => String(s ?? '').replace(/["`“”]/g, "'").replace(/\s+/g, ' ').trim().slice(0, n);

// Brand kit (một phần tử của brands.json hoặc của GET /api/brands) → gợi ý điền sẵn cho Style Lab.
export function brandHints(b) {
  if (!b || typeof b !== 'object') return null;
  return {
    brand_id: BRAND_ID.test(String(b.id || '')) ? b.id : '',
    title: cleanText(b.title || b.name || b.id, 60),
    colors: cleanColors([b.primary, b.accent, b.dark, b.light]),
    font: cleanFont(b.disp) || cleanFont(b.font),
    voice: cleanText(b.voice, 300),
    slogan: cleanText(b.slogan, 120),
    cta: cleanText(b.cta, 120),
    logo: !!(b.logo || b.logoUrl),
  };
}

// Đọc một thương hiệu trong <home>/brands.json; id lạ / file hỏng → null.
export function loadBrand(home, id) {
  if (!BRAND_ID.test(String(id || ''))) return null;
  try { return (JSON.parse(fs.readFileSync(path.join(home, 'brands.json'), 'utf8')).brands || []).find(b => b && b.id === id) || null; } catch { return null; }
}

// Gộp: giá trị người dùng sửa trong panel / cờ CLI (o) thắng brand kit (h). Mọi giá trị đều qua làm sạch.
export function mergeBrand(h, o = {}) {
  const pick = (k, clean) => (o[k] != null && String(o[k]).trim() !== '' ? clean(o[k]) : clean(h?.[k] ?? ''));
  return {
    brand_id: h?.brand_id || '', title: h?.title || '',
    colors: pick('colors', cleanColors), font: pick('font', cleanFont), voice: pick('voice', s => cleanText(s, 300)),
    slogan: h?.slogan || '', cta: h?.cta || '', logo: o.logo === false ? false : !!h?.logo,
  };
}

// Đoạn prompt về thương hiệu ('' khi không có gì để nói).
export function brandPrompt(m, kind) {
  if (!m) return '';
  const L = [];
  if (m.title) L.push(`Thương hiệu: ${m.title}.`);
  if (m.colors) L.push(`Màu thương hiệu (chỉ dùng đúng mã #hex này cho màu chính / nhấn / nền): ${m.colors}.${kind === 'clone' ? ' Thay bảng màu của video tham chiếu bằng các màu này, giữ bố cục và nhịp.' : ''}`);
  if (m.font) L.push(`Font tiêu đề của thương hiệu: ${m.font} (nạp bằng thẻ <link> Google Fonts nếu chưa có trong danh sách; trong CSS viết tên font bằng ngoặc đơn, không dùng ngoặc kép).`);
  if (m.voice) L.push(`Giọng văn cho chữ mẫu, tiêu đề, CTA: ${m.voice}.`);
  if (m.slogan) L.push(`Slogan: ${m.slogan}.`);
  if (m.cta) L.push(`Lời kêu gọi hành động: ${m.cta}.`);
  if (m.logo) L.push('Thương hiệu có logo: hiện logo bằng slIcon(BR().logo) (góc khung hoặc outro), không vẽ logo khác.');
  if (!L.length) return '';
  return `\n# Thương hiệu của người dùng\n${L.join('\n')}\nMàu và font lấy qua BR() (BR().primary, BR().accent, BR().font, BR().disp) khi có thể, để đổi thương hiệu là đổi theo.\n`;
}
