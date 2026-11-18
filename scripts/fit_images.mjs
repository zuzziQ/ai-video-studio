// Picking stock photos for "Bám lời thoại" (scripts/tpl_fit.mjs step 4, spec: references/tpl-fit.md).
// Pure helpers (no network) so tests can run offline: keywords, junk filter, orientation, scoring, choice, image size, content hash.
// A photo only replaces a template sample when its title/tags really contain the keywords; otherwise the sample stays (missing).
import fs from 'node:fs';
import { rmSync } from './fs_rm.mjs';
import path from 'node:path';
import crypto from 'node:crypto';

const STOP_EN = new Set(('a an the of on in at to for with and or by from is are be being been this that these those it its as into onto over ' +
  'under up down out off very some any about while during after before near next than then there here his her their our your my ' +
  'photo photos image images picture pictures stock concept background illustration vector free hd').split(' '));

// light English stem: editing/edited/edits -> edit, celebration(s) -> celebrat, laptops -> laptop
export const stem = w => {
  let s = String(w).toLowerCase();
  for (const suf of ['ations', 'ation', 'ions', 'ion', 'ings', 'ing', 'ers', 'er', 'ed', 'es', 's']) {
    if (s.length - suf.length >= 3 && s.endsWith(suf)) { s = s.slice(0, -suf.length); break; }
  }
  return s;
};
const tokens = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean);

// Abstract words a photo cannot show: they may match, but never count as the concrete part of a match
// ("success celebration" → any party photo, "artificial intelligence" → any tag soup).
export const ABSTRACT = new Set(('ai artificial intelligence success successful productivity productive growth motivation inspiration idea ideas ' +
  'future innovation innovative strategy solution solutions quality value efficiency efficient happiness freedom power concept ' +
  'technology digital modern smart business tips tip benefit benefits problem problems result results').split(' '));
export const concreteOf = kws => kws.filter(k => !ABSTRACT.has(k));

// "man tired editing video late night" -> ['man','tired','editing','video','late','night'] (stopwords and 1-letter words out, unique)
export function keywordsOf(q) {
  return [...new Set(tokens(q).filter(w => w.length > 1 && !STOP_EN.has(w) && !/^\d+$/.test(w)))];
}

// Commons/Openverse return many maps, diagrams, scans, logos, charts and historical documents: never what a sentence shows.
const JUNK = /\b(maps?|atlas|diagrams?|charts?|graphs?|plots?|schematics?|blueprints?|scan(ned)?|logos?|logotype|icons?|emblems?|insignia|coat of arms|flags?|seals?|stamps?|manuscripts?|documents?|letters?|page|pages|newspapers?|gazette|engravings?|lithographs?|woodcuts?|etchings?|plates?|infographics?|timeline of|screenshots?|signatures?|census|svg|wordmark|banners?|posters?|bestanddeelnr|archief|archives?)\b/gi;
// A junk word the query itself asks for ("old map", "poster design") does not count.
export function isJunk(item, kws = []) {
  const t = `${item?.title || ''} ${(item?.tags || []).join(' ')}`.replace(/[_-]+/g, ' ');
  const asked = new Set(kws.map(stem));
  return [...t.matchAll(JUNK)].some(m => !m[0].toLowerCase().split(' ').some(w => asked.has(stem(w))))
    || /\.(svg|pdf|tiff?|djvu)$/i.test(item?.url || '');
}
// old dated titles ("1890", "c. 1925") are mostly archive photos
const OLD = /\b(1[5-8]\d\d|19[0-5]\d)s?\b/;

// 'v' portrait (h > 1.15 w), 'h' landscape (w > 1.15 h), 'sq' close to square, '' unknown
export function orientation(w, h) {
  if (!(w > 0 && h > 0)) return '';
  const r = w / h;
  return r > 1.15 ? 'h' : r < 1 / 1.15 ? 'v' : 'sq';
}

// A title the provider filled in with the query itself (untitled Openverse/Pexels photo) proves nothing.
const hayOf = item => tokens(`${item?.untitled ? '' : item?.title || ''} ${(item?.tags || []).join(' ')}`.replace(/[_-]+/g, ' '));
// Score one search result against the keywords. Returns {score, matched, concrete}: keywords found in title/tags, and how many
// of those are not abstract.
export function scoreItem(item, kws, want = '') {
  const hay = hayOf(item);
  const hs = new Set(hay.map(stem)), raw = new Set(hay);
  let matched = 0, concrete = 0;
  for (const k of kws) {
    const sk = stem(k);
    if (raw.has(k) || hs.has(sk) || (sk.length >= 4 && [...hs].some(h => h.startsWith(sk) || (h.length >= 4 && sk.startsWith(h))))) {
      matched++; if (!ABSTRACT.has(k)) concrete++;
    }
  }
  let score = matched * 10;
  // keywords in the same order next to each other ("video editing") count a bit more
  const flat = hay.map(stem).join(' ');
  for (let i = 0; i + 1 < kws.length; i++) if (flat.includes(stem(kws[i]) + ' ' + stem(kws[i + 1]))) score += 3;
  const o = orientation(item?.w, item?.h);
  if (want && o) score += o === want ? 4 : o === 'sq' || want === 'sq' ? 0 : -6;
  if ((item?.w || 0) >= 1200) score += 1;
  if (OLD.test(item?.title || '')) score -= 4;
  return { score, matched, concrete };
}

// Minimum keywords a photo must contain: 1 of 1, 2 of 2–3, 3 of 4+ (half of a long query matches far too much in the free
// libraries); and as many of them concrete as the query allows.
export const needOf = kws => (kws.length >= 4 ? 3 : Math.min(2, kws.length));

// Ranked candidates that pass: not junk, ≥ 500 px wide (unknown width accepted), enough keywords, URL not used yet.
export function rankImages(items, kws, { want = '', usedUrls = new Set(), need = needOf(kws) } = {}) {
  if (!kws.length || need < 1) return [];
  const needC = Math.min(need, concreteOf(kws).length);
  return (items || [])
    .filter(x => x && x.url && !usedUrls.has(x.url) && (x.w || 1000) >= 500 && !isJunk(x, kws))
    .map(x => ({ item: x, ...scoreItem(x, kws, want) }))
    .filter(x => x.matched >= need && x.concrete >= needC)
    .sort((a, b) => b.score - a.score);
}
export const pickImage = (items, kws, o) => rankImages(items, kws, o)[0] || null;

// Queries to try: the whole keyword list, then its first 2 concrete keywords (2 first ones if fewer are concrete).
// Never a single word ("artificial" → astronomy photos).
export function queriesOf(kws) {
  const c = concreteOf(kws), two = (c.length >= 2 ? c : kws).slice(0, 2);
  return [...new Set([kws.join(' '), two.join(' ')].filter(q => q && q.split(' ').length >= Math.min(2, kws.length)))];
}

// Width/height from the first bytes of a JPEG/PNG/WebP (no image library). null when unknown.
export function imageSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const f = buf.toString('ascii', 12, 16);
    if (f === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (f === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (f === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
    return null;
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i + 9 < buf.length;) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

// Orientation wanted by an image slot: a background follows the video frame, a "card" slot is landscape,
// otherwise the template's own sample photo tells (the template was designed around its shape).
export function slotOrientation(slotPath, sampleFile, { vertical = true, skill } = {}) {
  const k = String(slotPath.filter(x => typeof x === 'string').at(-1) || '');
  if (k === 'bg') return vertical ? 'v' : 'h';
  if (/card/i.test(slotPath.join('.'))) return 'h';
  try {
    const fd = fs.openSync(path.join(skill, 'examples', sampleFile), 'r'), b = Buffer.alloc(65536);
    const n = fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd);
    const sz = imageSize(b.subarray(0, n));
    if (sz) return orientation(sz.w, sz.h);
  } catch { /* sample missing */ }
  return '';
}

export const fileHash = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
// hashes of the photos already in <project>/media, so the same picture is never inserted twice
export function mediaHashes(dir) {
  const md = path.join(dir, 'media'), out = new Set();
  try { for (const f of fs.readdirSync(md)) if (/\.(jpe?g|png|webp)$/i.test(f)) try { out.add(fileHash(path.join(md, f))); } catch {} } catch {}
  return out;
}
// drop a downloaded duplicate: the file and its line in media/credits.json
export function dropMedia(dir, rel) {
  const f = path.join(dir, rel), cf = path.join(dir, 'media', 'credits.json');
  rmSync(f, { force: true });
  try { const c = JSON.parse(fs.readFileSync(cf, 'utf8')); fs.writeFileSync(cf, JSON.stringify(c.filter(x => x.file !== path.basename(rel)), null, 1)); } catch {}
}
