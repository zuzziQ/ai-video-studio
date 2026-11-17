// M122: đọc link chắc chắn — trang ít chữ thì mở lại bằng Chrome chạy ngầm, vẫn chặn địa chỉ nội bộ cho TỪNG request.
// Phần đầu không cần Chrome (render giả). Phần "Chrome thật" tự bỏ qua khi máy không có puppeteer-core hoặc Chrome
// (CI không cài dependency); chạy trên máy: node --test scripts/tests/assist_render.test.mjs
// (worktree không có node_modules: AVS_PUPPETEER_DIR=<thư mục chứa node_modules/puppeteer-core>).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as A from '../assist.mjs';
import { findChrome } from '../platform.mjs';

const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }];
const HTML = { 'content-type': 'text/html; charset=utf-8' };
const LONG = 'Serum B5 30ml cấp ẩm cho da khô, chai thuỷ tinh, dùng sáng và tối sau bước làm sạch. '.repeat(4);
const site = (pages, seen = []) => ({ lookup: PUBLIC, fetchImpl: async u => {
  seen.push(u.href);
  const p = pages[u.pathname];
  if (p == null) return new Response('không có', { status: 404, headers: HTML });
  if (typeof p === 'function') return p(u);
  return new Response(p, { headers: /\.js$/.test(u.pathname) ? { 'content-type': 'text/javascript' } : HTML });
} });

test('trang tĩnh đủ chữ → không mở Chrome', async () => {
  let calls = 0;
  const p = await A.fetchPage('https://shop.vn/serum', { ...site({ '/serum': `<title>Serum</title><p>${LONG}</p>` }), render: async () => { calls++; return { html: '' }; } });
  assert.equal(calls, 0); assert.equal(p.rendered, undefined); assert.match(p.text, /Serum B5/);
});

test('trang ít chữ → mở lại bằng Chrome (render), lấy chữ đã dựng; 403 cũng thử Chrome', async () => {
  let got = null;
  const render = async (url, o) => { got = { url, o }; return { html: `<title>Serum</title><main>${LONG}</main>`, status: 200, blocked: 0 }; };
  const p = await A.fetchPage('https://shop.vn/serum', { ...site({ '/serum': '<title>Shop</title><div id="app"></div>' }), render });
  assert.equal(p.rendered, true); assert.match(p.text, /cấp ẩm/);
  assert.equal(got.url, 'https://shop.vn/serum'); assert.equal(typeof got.o.fetchImpl, 'function'); assert.equal(got.o.lookup, PUBLIC); // render dùng đúng lớp chặn
  const p2 = await A.fetchPage('https://shop.vn/serum', { ...site({ '/serum': () => new Response('Forbidden', { status: 403, headers: HTML }) }), render });
  assert.equal(p2.rendered, true);
  await assert.rejects(A.fetchPage('https://shop.vn/serum', { ...site({}), render }), /HTTP 404/); // 404 không cứu được bằng Chrome
});

test('vẫn trống → lỗi page-empty có tên trang + lý do; còn chút chữ thì trả kèm thin', async () => {
  const empty = async () => ({ html: '<title>Shopee Việt Nam</title><div id="main"></div>', status: 200, blocked: 0 });
  await assert.rejects(A.fetchPage('https://shopee.vn/abc-i.1.2', { ...site({ '/abc-i.1.2': '<title>Shopee Việt Nam</title><meta name="description" content="Mua sắm online"><div id="main"></div>' }), render: empty }),
    e => e instanceof A.AssistError && e.kind === 'page-empty' && e.host === 'shopee.vn' && /Shopee/.test(e.message) && /chặn trình duyệt tự động/.test(e.message) && /Dán mô tả/.test(e.message));
  await assert.rejects(A.fetchPage('https://x.vn/', { ...site({ '/': '<div id="r"></div>' }), render: async () => { throw Object.assign(new Error('máy chưa có Chrome để mở trang dựng bằng JavaScript'), { reason: 'no-chrome' }); } }),
    e => e.kind === 'page-empty' && /chưa có Chrome/.test(e.message));
  await assert.rejects(A.fetchPage('https://x.vn/', { ...site({ '/': '<div></div>' }), render: async () => ({ html: '<p>Vui lòng xác minh bạn không phải robot</p>', status: 200 }) }), /xác minh/);
  await assert.rejects(A.fetchPage('https://x.vn/', { ...site({ '/': '<div></div>' }), render: async () => ({ html: '', status: 200, blocked: 2 }) }), /nội bộ \(đã chặn 2/);
  const t = await A.fetchPage('https://x.vn/', { ...site({ '/': '<title>Serum B5</title><h1>Serum B5 30ml</h1><p>Giá: 350.000đ</p>' }), render: false });
  assert.equal(t.thin, true); assert.match(t.text, /350\.000đ/);
});

test('trợ lý: page-empty → lỗi kind page-empty / cờ pageEmpty; dán mô tả hoặc ảnh thì dùng phần dán', async () => {
  const net = { ...site({ '/p': '<div id="app"></div>' }), render: async () => ({ html: '', status: 200 }) };
  await assert.rejects(A.runAssist('product', A.check('product', { url: 'https://shopee.vn/p' }), { net, run: async () => { throw new Error('không được gọi'); } }),
    e => e.kind === 'page-empty' && /Shopee/.test(e.message));
  let prompt = '', opts = null;
  const run = async (p, o) => { prompt = p; opts = o; return { text: JSON.stringify({ name: 'Serum B5', price: '350.000đ', strengths: ['Chai 30ml'] }) }; };
  const r = await A.runAssist('product', A.check('product', { url: 'https://shopee.vn/p', pageText: 'Serum B5 30ml\r\n\r\n\r\nGiá 350.000đ' }), { net, run, py: 'không-có-python' });
  assert.match(prompt, /Mô tả người dùng dán từ trang sản phẩm/); assert.match(prompt, /Giá 350\.000đ/);
  assert.equal(r.fields.find(f => f.key === 'price')?.note, 'đúng như phần bạn dán');
  assert.ok(r.warnings.some(w => /dùng phần bạn dán/.test(w))); assert.equal(r.pageEmpty, undefined);
  // ảnh chụp trang: ghi page.png vào thư mục tạm, Claude được Read
  const png = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');
  await A.runAssist('product', A.check('product', { url: 'https://shopee.vn/p', pageShot: png }), { net, run, py: 'không-có-python' });
  assert.match(prompt, /file page\.png là ảnh chụp trang sản phẩm/); assert.ok(opts.args.includes('Read'));
  // thương hiệu: website trống vẫn chạy theo tên, kết quả có cờ pageEmpty để giao diện mở ô dán
  const b = await A.runAssist('brand', A.check('brand', { name: 'Nhà Đẹp', website: 'https://nhadep.vn/p' }), { net, run: async () => ({ text: JSON.stringify({ slogan: 'Nhà đẹp mỗi ngày' }) }) });
  assert.equal(b.pageEmpty.host, 'nhadep.vn'); assert.ok(b.warnings.some(w => /Không đọc được website.*Dán mô tả/.test(w)));
  assert.throws(() => A.check('product', { pageShot: 'data:image/png;base64,AAAA' }), /không khớp định dạng/);
});

// ---------------------------------------------------------------- Chrome thật
function loadPuppeteer() {
  const dirs = [path.resolve(import.meta.dirname, '..'), process.env.AVS_PUPPETEER_DIR].filter(Boolean);
  for (const d of dirs) { try { return createRequire(path.join(d, 'x.js'))('puppeteer-core'); } catch { /* thử chỗ khác */ } }
  return null;
}
const P = loadPuppeteer(), CHROME = findChrome();
const real = { skip: !P || !CHROME ? 'máy không có puppeteer-core hoặc Chrome' : false, timeout: 90_000 };
const render = (url, o) => A.renderPage(url, { ...o, puppeteer: P, executablePath: CHROME, timeoutMs: 20_000 });

test('Chrome thật: SPA giả (chữ chỉ có sau JS) đọc được; trang JS trống → page-empty', real, async () => {
  const app = `document.getElementById('app').innerHTML = '<h1>Serum B5</h1><p>' + ${JSON.stringify(LONG)} + '</p>';`;
  const seen = [];
  const p = await A.fetchPage('https://spa.test/sp', { ...site({ '/sp': '<title>SPA</title><div id="app"></div><script src="/app.js"></script>', '/app.js': app }, seen), render });
  assert.equal(p.rendered, true); assert.match(p.text, /Serum B5/); assert.match(p.text, /cấp ẩm/);
  assert.ok(seen.includes('https://spa.test/app.js'));
  await assert.rejects(A.fetchPage('https://spa.test/sp', { ...site({ '/sp': '<div id="app"></div><script src="/app.js"></script>', '/app.js': '/* không dựng gì */' }), render }),
    e => e.kind === 'page-empty' && /spa\.test/.test(e.message));
});

test('Chrome thật: chuyển hướng / gọi sang IP nội bộ trong lúc render bị chặn, Chrome không tự ra mạng', real, async () => {
  // máy chủ thật trên 127.0.0.1: nếu Chrome tự nối được (bỏ qua lớp chặn) thì hits > 0
  let hits = 0;
  const srv = http.createServer((q, s) => { hits++; s.end('BI-MAT-NOI-BO'); });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const port = srv.address().port, seen = [];
  const lookup = async h => (h === 'evil.test' ? [{ address: '10.0.0.7', family: 4 }] : PUBLIC());
  const app = `fetch('/api/data').then(r => r.text()).then(t => { document.body.insertAdjacentText('beforeend', t); }).catch(() => {});
    const s = document.createElement('script'); s.src = 'http://evil.test/x.js'; document.head.appendChild(s);
    try { new WebSocket('ws://127.0.0.1:${port}/'); } catch {}
    const i = document.createElement('img'); i.src = 'http://127.0.0.1:${port}/img.png'; document.body.appendChild(i);
    fetch('http://127.0.0.1:${port}/direct').catch(() => {});`;
  try {
    const net = { lookup, fetchImpl: async (u, init) => {
      seen.push(u.href);
      if (u.pathname === '/api/data') return new Response(null, { status: 302, headers: { location: `http://127.0.0.1:${port}/secret` } });
      return site({ '/sp': '<div id="app"></div><script src="/app.js"></script>', '/app.js': app }).fetchImpl(u, init);
    } };
    await assert.rejects(A.fetchPage('https://spa.test/sp', { ...net, render }), e => e.kind === 'page-empty' && /nội bộ/.test(e.message) && !/BI-MAT/.test(e.message));
    assert.equal(hits, 0, 'Chrome đã nối thẳng tới 127.0.0.1');
    assert.ok(!seen.some(u => /127\.0\.0\.1|evil\.test/.test(u)), 'lớp chặn để lọt: ' + seen.join(', '));
    // trang tự chuyển (JS) sang địa chỉ metadata đám mây: không lấy chữ trang lỗi của Chrome
    await assert.rejects(A.fetchPage('https://spa.test/sp', { ...site({ '/sp': '<div></div><script src="/go.js"></script>', '/go.js': "location.href = 'http://169.254.169.254/latest/meta-data/';" }), render }),
      e => e.kind === 'page-empty');
    assert.equal(hits, 0);
  } finally { srv.close(); }
});
