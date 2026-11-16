// Quét chữ bị cắt trong mọi template: áp từng mẫu (engine applyTemplate) lên một dự án thật, render qua engine thật
// (cả khối HyperFrames trong iframe), đo từng dòng chữ: phần nào bị hộp cha overflow:hidden / clip-path / khung khối HF
// hay mép khung hình cắt mất. Hai lượt: chữ mẫu gốc, và --stretch k (mặc định 1.4) = mọi trường chữ dài gấp k lần
// (giống khi "Bám lời thoại" viết lại chữ dài hơn mẫu).
//   node scripts/tpl_text_audit.mjs <project_dir> [--only id1,id2] [--stretch 1.4] [--json out.json]
// Chỉ đọc dự án, không ghi gì vào đó.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { findChrome } from './platform.mjs';
import { interceptCdn } from './net_cache.mjs';
import { launchChrome } from './render_hw.mjs';
import { engineInit } from './ai_qc.mjs';
import { textSlots } from './tpl_fit.mjs';

const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const SKILL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const proj = path.resolve(a[0] || '.');
const base = JSON.parse(fs.readFileSync(path.join(proj, 'timeline.json'), 'utf8'));
const CAPS = typeof base.captions === 'string' ? JSON.parse(fs.readFileSync(path.join(proj, base.captions), 'utf8')) : base.captions || [];
const ONLY = opt('--only', '') ? new Set(opt('--only').split(',')) : null;
const STRETCH = +opt('--stretch', '1.4');
const SHOTS = opt('--shots', ''), PASSES = a.includes('--orig-only') ? ['gốc'] : ['gốc', `dài ×${STRETCH}`];
const tdirs = [path.join(SKILL, 'templates'), path.join(SKILL, 'templates/user')].filter(d => fs.existsSync(d));
const TPLS = tdirs.flatMap(d => fs.readdirSync(d).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'))))
  .filter(t => t.id && (!ONLY || ONLY.has(t.id)));
// Chữ cố ý chạy qua mép (ticker, marquee, chữ nền khổng lồ…): không tính là lỗi.
const SCROLL = /ticker|marquee|crawl|scroll|orbit|mega|slam_bg|mosaic_wall|kinetic|light_leak|flash_ring|iris|text-cloud|carousel/i;
// Known decorative cuts (checked on screenshots): ★ rows cut to a score, a repeated ✦ ticker strip (hook_card/media_card
// broll ticker), course_chapter's giant backdrop number "02", count-up's rolling digit wheels (cut vertically by design).
const DECOR = (nm, h) => !/[\p{L}\p{N}]/u.test(h.s) || /✦.*✦/.test(h.s) || (nm === 'course_chapter' && /^\d{1,2}$/.test(h.s))
  || (nm === 'hf:count-up' && h.dx === 0);
const PAD =' và nhiều điều thú vị khác nữa cho bạn';
const longer = (ex, k) => {
  const want = Math.ceil(ex.length * k); let v = ex;
  for (let i = 0; v.length < want; i++) v += PAD.split(' ')[(i % 9) + 1] ? ' ' + PAD.split(' ')[(i % 9) + 1] : '';
  return ex === ex.toUpperCase() && /\p{Lu}/u.test(ex) ? v.toUpperCase() : v;
};
const getP = (o, p) => p.reduce((x, k) => (x == null ? x : x[k]), o);
const setP = (o, p, v) => { let x = o; for (let i = 0; i < p.length - 1; i++) { if (x[p[i]] == null) x[p[i]] = {}; x = x[p[i]]; } x[p[p.length - 1]] = v; };

const { browser } = await launchChrome(puppeteer, { executablePath: findChrome() });
const page = (await browser.pages())[0] || await browser.newPage();
await interceptCdn(page).catch(() => {});
await page.goto(pathToFileURL(path.join(SKILL, 'engine', 'index.html')).href, { waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
await page.evaluate(() => {
  for (const k of Object.keys(MODULES)) {
    const f = MODULES[k];
    MODULES[k] = function (s, t, lt) {
      const r = f.call(this, s, t, lt) || {};
      if (s.__qi != null) for (const l of ['back', 'front']) if (r[l]) r[l] = `<div data-qs="${s.__qi}" style="display:contents">${r[l]}</div>`;
      return r;
    };
  }
  // [{qi, s, dx, dy, canvas}] — text whose visible part is smaller than its own box.
  window.__clipAudit = () => {
    const stage = document.getElementById('stage'), out = [];
    const opac = (el, stop) => { let o = 1; for (let e = el; e && e !== stop; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= +cs.opacity; } return o; };
    const inter = (r, b) => { const x0 = Math.max(r.x0, b.left), y0 = Math.max(r.y0, b.top), x1 = Math.min(r.x1, b.right), y1 = Math.min(r.y1, b.bottom); return { x0, y0, x1, y1 }; };
    const scan = (root, stop, outer, qi, k, extraOp) => {
      const tw = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
      while ((n = tw.nextNode())) {
        const s = n.nodeValue.trim(); if (!s || s.length < 2) continue;
        const el = n.parentElement; if (!el || el.closest('style,script,svg')) continue;
        if (opac(el, stop) * extraOp < .3) continue;
        // engine/fit.js's last resort: shrunk to 70 % and ended in "…" on purpose (the range still spans the full text)
        if (getComputedStyle(el).textOverflow === 'ellipsis' && getComputedStyle(el).overflowX !== 'visible') continue;
        const rg = root.ownerDocument.createRange(); rg.selectNodeContents(n);
        for (const r of rg.getClientRects()) {
          if (r.width < 2 || r.height < 2) continue;
          let v = { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }, scroll = false;
          for (let e = el; e && e !== stop; e = e.parentElement) if (getComputedStyle(e).animationName !== 'none') scroll = true;
          // same clip chain as engine/fit.js: an overflow box does not clip an abs-positioned child whose containing block is above it
          for (const e of window.__clipChain(el, stop) || []) { const b = e.getBoundingClientRect(); if (b.width || b.height) v = inter(v, b); }
          if (outer) v = inter(v, outer);
          const w = v.x1 - v.x0, h = v.y1 - v.y0;
          if (w <= 0 || h <= 0 || scroll) continue;           // fully hidden (scrolled away) or animated ticker
          const dx = (r.width - w) * k, dy = (r.height - h) * k;
          if (dx > 4 || dy > r.height * .3 * k) out.push({ qi, s: s.slice(0, 50), dx: Math.round(dx), dy: Math.round(dy) });
        }
      }
    };
    const sr = stage.getBoundingClientRect();
    for (const w of stage.querySelectorAll('[data-qs]')) scan(w, stage, sr, +w.dataset.qs, stage.offsetWidth / sr.width, 1);
    for (const host of document.querySelectorAll('#hfl > div')) {
      if (host.style.display === 'none' || +host.style.opacity < .3) continue;
      const ifr = host.querySelector('iframe'), slot = stage.querySelector(`.hfslot[data-hf="${CSS.escape(ifr.name)}"]`); if (!slot) continue;
      const qi = +(slot.closest('[data-qs]')?.dataset.qs ?? -1), d = ifr.contentDocument; if (!d?.body) continue;
      // the host div (overflow:hidden) shows the block's content box: map it back into iframe px
      const k = +slot.dataset.k, x0 = +(host.dataset.x0 ?? slot.dataset.ox), box = { left: x0, top: +slot.dataset.oy, right: x0 + host.offsetWidth / k, bottom: +slot.dataset.oy + host.offsetHeight / k };
      scan(d.body, null, box, qi, k, +host.style.opacity);
    }
    return out;
  };
});

const report = [];
let n = 0;
for (const tpl of TPLS) {
  n++;
  const tl = JSON.parse(JSON.stringify(base));
  tl.scenes = []; tl.fx = [];
  const applied = await page.evaluate((tl, tpl, caps) => { window.applyTemplate(tl, tpl, caps, tpl.title || ''); return tl; }, tl, tpl, CAPS);
  for (const pass of PASSES) {
    const t2 = JSON.parse(JSON.stringify(applied));
    if (pass !== 'gốc') for (const s of t2.scenes) for (const sl of textSlots(s)) if (!sl.emoji) setP(s, sl.path, longer(String(getP(s, sl.path) ?? sl.ex), STRETCH));
    const E = { page, dir: proj, scale: 2 / 3 };
    await engineInit(E, t2, CAPS);
    await page.evaluate(() => window.hfReset?.());
    const scenes = t2.scenes, times = new Set();
    scenes.forEach(s => { const L = s.t1 - s.t0; if (L < .3) return; for (const f of [.6, .9]) times.add(Math.round(Math.min(s.t1 - .15, s.t0 + Math.max(.55, L * f)) * 10) / 10); });
    const hits = new Map();
    for (const t of [...times].sort((x, y) => x - y)) {
      await page.evaluate(x => window.renderFrame(x), t);
      for (const h of await page.evaluate(() => window.__clipAudit())) {
        const s = scenes[h.qi]; if (!s) continue;
        const nm = s.type === 'hf' ? 'hf:' + s.block : s.type;
        if (SCROLL.test(nm) || DECOR(nm, h)) continue;
        const key = `${h.qi}|${h.s}`, o = hits.get(key) || { scene: nm, text: h.s, dx: 0, dy: 0, at: [] };
        o.dx = Math.max(o.dx, h.dx); o.dy = Math.max(o.dy, h.dy); o.at.push(t); hits.set(key, o);
      }
    }
    // a wipe/reveal clips text for a moment: count only text cut at ≥ 2 sampled times (or the scene's only sample)
    const found = [...hits.values()].filter(h => h.at.length >= 2 || scenes.filter(s => s.t0 <= h.at[0] && s.t1 >= h.at[0]).length === 1 && h.dx > 12);
    if (found.length) report.push({ id: tpl.id, name: tpl.name, pass, issues: found });
    // --shots-all: also frames of templates without findings (one per own scene, ≤ 8) to eyeball the fixes
    const shotAt = found.length ? [...new Set(found.map(f => f.at[f.at.length - 1]))].slice(0, 3)
      : a.includes('--shots-all') ? scenes.filter(s => s._tpl && s.t1 - s.t0 >= .3).map(s => Math.round(Math.min(s.t1 - .15, s.t0 + Math.max(.55, (s.t1 - s.t0) * .6)) * 10) / 10).slice(0, 8) : [];
    if (SHOTS) for (const t of shotAt) {
      await page.evaluate(x => window.renderFrame(x), t);
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, `${tpl.id}_${pass === 'gốc' ? 'goc' : 'dai'}_${t}.jpg`), type: 'jpeg', quality: 70 });
    }
    // M94: texts engine/fit.js shrank (data-fit-base) — with the sample text this should only be the ones that did not fit
    const shrunk = await page.evaluate(() => [...document.querySelectorAll('#hfl iframe')].flatMap(f => { try { return [...f.contentDocument.querySelectorAll('[data-fit-base]')]
      .map(e => `${f.name.split('~')[0]} "${e.textContent.trim().slice(0, 24)}" ${Math.round(parseFloat(e.style.fontSize) / +e.dataset.fitBase * 100)}%${e.dataset.fitEll ? '…' : ''}`); } catch { return []; } }));
    if (shrunk.length) console.log(`   co chữ: ${[...new Set(shrunk)].join(' · ')}`);
    console.log(`[${n}/${TPLS.length}] ${tpl.id} (${pass}): ${found.length ? found.map(f => `${f.scene} "${f.text}" −${f.dx}px`).join(' · ') : 'ok'}`);
  }
}
await browser.close();
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(report, null, 1));
