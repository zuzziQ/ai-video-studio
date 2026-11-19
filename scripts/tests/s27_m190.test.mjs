// S27 M190: Style Lab nhận thương hiệu — làm sạch màu / font / chữ của brand kit, tham số route, CLI --brand --dry (không gọi Claude).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanFont, cleanColors, cleanText, brandHints, mergeBrand, brandPrompt, loadBrand } from '../style_brand.mjs';
import { brandArgv } from '../../studio/routes/70_stylelab.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const KIT = { id: 'nha-dep-1a2b', title: 'Nhà "Đẹp"', primary: '#c9a44c', accent: '#FF5A36', dark: 'rgb(0,0,0)', light: '#fff', font: '"Be Vietnam Pro", sans-serif', disp: "'Bungee', cursive", voice: 'Sang trọng, "ngắn gọn"\nxưng mình', slogan: 'Sống đẹp', cta: 'Gọi ngay', logo: 'logo.png' };
const home = () => { const h = fs.mkdtempSync(path.join(os.tmpdir(), 'm190-')); fs.writeFileSync(path.join(h, 'brands.json'), JSON.stringify({ version: 1, brands: [KIT] })); return h; };

test('cleanFont: bỏ ngoặc và font dự phòng, bỏ var(), giữ chữ có dấu', () => {
  assert.equal(cleanFont('"Bungee", sans-serif'), 'Bungee');
  assert.equal(cleanFont("'Playfair Display', serif"), 'Playfair Display');
  assert.equal(cleanFont('var(--sans)'), '');
  assert.equal(cleanFont('Be Vietnam Pro'), 'Be Vietnam Pro');
  assert.equal(cleanFont('x"; color:red'), '');
  assert.equal(cleanFont(null), '');
  assert.equal(cleanFont('Đậm Nét'), 'Đậm Nét');
});

test('cleanColors: chỉ #hex, viết hoa, không trùng, tối đa 6', () => {
  assert.equal(cleanColors('#111, #c9a44c; red rgb(1,2,3) #C9A44C'), '#111, #C9A44C');
  assert.equal(cleanColors(['#abcdef', undefined, '#12345', '#1234567g']), '#ABCDEF');
  assert.equal(cleanColors('"#ff0000" onerror=x'), '#FF0000');
  assert.equal(cleanColors('#1 #2 #3 #4 #5 #6 #7 #8 #9 #a #b #c #d #e #f'.replace(/#(\w)/g, '#$1$1$1')).split(', ').length, 6);
  assert.equal(cleanText('a "b"\n`c`', 5), "a 'b'");
});

test('brandHints + mergeBrand: điền sẵn từ brand kit, người dùng sửa thì thắng, không còn ngoặc kép', () => {
  const h = brandHints({ ...KIT, logo: '', logoUrl: '/api/brands/logo/x' });
  assert.equal(h.brand_id, 'nha-dep-1a2b');
  assert.equal(h.colors, '#C9A44C, #FF5A36, #FFF');
  assert.equal(h.font, 'Bungee'); // disp (font tiêu đề) trước font
  assert.equal(h.logo, true);
  for (const v of Object.values(h)) assert.ok(!String(v).includes('"'), 'không còn ngoặc kép: ' + v);
  assert.equal(brandHints({ id: '../x' }).brand_id, '');
  const m = mergeBrand(h, { colors: 'xanh #00aa00', font: '"Oswald"', voice: '', logo: false });
  assert.deepEqual([m.colors, m.font, m.voice, m.logo], ['#00AA00', 'Oswald', h.voice, false]);
  assert.equal(mergeBrand(null, {}).brand_id, '');
});

test('brandPrompt: có mục thương hiệu, font không ngoặc kép, clone thay bảng màu', () => {
  const m = mergeBrand(brandHints(KIT), {});
  const p = brandPrompt(m, 'clone');
  assert.match(p, /# Thương hiệu của người dùng/);
  assert.match(p, /#C9A44C, #FF5A36, #FFF/);
  assert.match(p, /Thay bảng màu của video tham chiếu/);
  assert.match(p, /Font tiêu đề của thương hiệu: Bungee \(/);
  assert.match(p, /slIcon\(BR\(\)\.logo\)/);
  assert.doesNotMatch(p, /"Bungee"|"ngắn gọn"|Nhà "Đẹp"/);
  assert.equal(brandPrompt(mergeBrand(null, {}), 'describe'), '');
  assert.doesNotMatch(brandPrompt(m, 'describe'), /video tham chiếu/);
});

test('loadBrand + brandArgv (route): thương hiệu lạ báo lỗi, giá trị làm sạch, dry/no-logo', () => {
  const h = home();
  assert.equal(loadBrand(h, 'nha-dep-1a2b').id, 'nha-dep-1a2b');
  assert.equal(loadBrand(h, 'khong-co'), null);
  assert.equal(loadBrand(h, '../brands'), null);
  assert.match(brandArgv({ brand: 'khong-co' }, h).error, /Không thấy thương hiệu/);
  const { argv } = brandArgv({ brand: 'nha-dep-1a2b', colors: '"#111" , #c9a44c', font: '"Bungee", sans-serif', voice: 'vui "tươi"', logo: false, dry: true }, h);
  assert.deepEqual(argv, ['--brand', 'nha-dep-1a2b', '--colors', '#111, #C9A44C', '--font', 'Bungee', '--voice', "vui 'tươi'", '--no-logo', '--dry']);
  assert.deepEqual(brandArgv({ dry: 'yes', logo: 0 }, h).argv, []);
});

test('CLI describe --brand --dry: ghi prompt có thương hiệu + result.json brand_id, không gọi Claude', () => {
  const h = home(), work = path.join(h, 'w');
  const out = execFileSync('node', [path.join(ROOT, 'scripts/style_lab.mjs'), 'describe', 'BĐS sang trọng đen vàng', '--work', work, '--brand', 'nha-dep-1a2b', '--font', '"Oswald", sans-serif', '--dry'],
    { env: { ...process.env, AVS_HOME: h, CLAUDE_BIN: path.join(h, 'khong-co-claude') }, encoding: 'utf8', timeout: 60e3 });
  assert.match(out, /"ok": true/);
  const r = JSON.parse(fs.readFileSync(path.join(work, 'result.json'), 'utf8'));
  assert.equal(r.dry, true); assert.equal(r.brand_id, 'nha-dep-1a2b'); assert.equal(r.font, 'Oswald'); assert.equal(r.colors, '#C9A44C, #FF5A36, #FFF');
  const p = fs.readFileSync(path.join(work, 'prompt.txt'), 'utf8');
  assert.match(p, /# Thương hiệu của người dùng[\s\S]*Font tiêu đề của thương hiệu: Oswald/);
  assert.doesNotMatch(p, /"Oswald"|"Bungee"/);
  assert.ok(!fs.existsSync(path.join(work, 'claude_1.txt')));
  // thương hiệu lạ → lỗi, không chạy tiếp
  assert.throws(() => execFileSync('node', [path.join(ROOT, 'scripts/style_lab.mjs'), 'describe', 'x', '--work', path.join(h, 'w2'), '--brand', 'khong-co', '--dry'], { env: { ...process.env, AVS_HOME: h }, stdio: 'pipe', timeout: 60e3 }));
});

test('template của style ghi brand_id; route chuyển brand cho cả clone và describe; panel có ô thương hiệu', () => {
  const lab = read('scripts/style_lab.mjs');
  assert.match(lab, /brandId \? \{ brand_id: brandId \}/);
  assert.match(lab, /footageDir: ft\?\.dir, brandId: brand\.brand_id/);
  assert.match(lab, /'--brand', '--voice'/);
  const rt = read('studio/routes/70_stylelab.mjs');
  assert.ok(rt.indexOf('brandArgv(b, HOME)') < rt.indexOf("if (mode === 'clone')"), 'tham số thương hiệu đặt trước nhánh clone/describe');
  const fe = read('studio/features/70_stylelab.js');
  assert.match(fe, /S\.api\('\/api\/brands'\)/);
  assert.match(fe, /S\.META\?\.kho\?\.brand/);
  assert.match(fe, /\$\{an \? anCard\(an\) : ''\}\$\{brandBlock\(running\)\}/); // tab Clone: chọn thương hiệu được cả trước khi phân tích
  // render() tự save() từ các ô: chỉ đọc ô vẽ từ đúng lần điền sẵn hiện tại (lần tải đầu, đổi thương hiệu)
  assert.match(fe, /st\.bv = \(st\.bv \|\| 0\) \+ 1/);
  assert.match(fe, /querySelector\(`\.sl-brand\[data-bv="\$\{st\.bv \|\| 0\}"\]`\)\) Object\.assign\(st\.b/);
  assert.match(fe, /\$\{brandBlock\(running\)\}\$\{opts\(running\)\}/);
  assert.match(fe, /\.\.\.brandBody\(\)/);
});
