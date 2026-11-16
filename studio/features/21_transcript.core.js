// Lõi thuần của panel Lời thoại (ROADMAP M89), không đụng DOM hay Studio: chia lại thời gian khi sửa chữ, tìm chữ
// không phân biệt hoa thường (tuỳ chọn không dấu), từ điển "sai=đúng". Chạy trong trình duyệt (window.TranscriptCore)
// và trong Node (module.exports) cho scripts/tests/transcript_edit.test.mjs. features/21_transcript.js dùng nó.
'use strict';
(function (root) {
  const TONES = /[̣̀́̃̉]/g; // huyền, sắc, ngã, hỏi, nặng
  const EDGE = /^[,.!?:;"'“”()…]+|[,.!?:;"'“”()…]+$/g;
  const r3 = v => Math.round(v * 1000) / 1000;

  /** Khoá so khớp: chữ thường, bỏ dấu câu ở hai đầu, dấu thanh dời về cuối ("hóa" = "hoá", "tiền" ≠ "tiến").
   *  noAccent: bỏ hết dấu ("tien hoa" khớp "tiến hoá"). */
  function fold(w, noAccent) {
    const d = String(w || '').toLocaleLowerCase('vi').replace(EDGE, '').normalize('NFD');
    if (noAccent) return d.replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
    return d.replace(TONES, '').normalize('NFC') + (d.match(TONES) || []).sort().join('');
  }
  const tokenize = text => String(text || '').normalize('NFC').split(/\s+/).filter(Boolean);

  /** Chia [s, e] cho các từ mới theo độ dài chữ (từ ngắn nhất vẫn ≥ 1 phần). */
  function splitTimes(s, e, toks) {
    const wt = toks.map(t => Math.max(1, t.length)), sum = wt.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    return toks.map((w, i) => {
      const a = s + (e - s) * acc / sum; acc += wt[i];
      return { w, s: r3(a), e: i === toks.length - 1 ? r3(e) : r3(s + (e - s) * acc / sum) };
    });
  }

  /** Từ cũ của một khối → từ mới. Cùng số từ: giữ s/e và hl/br từng từ; khác số từ: chia lại trong [s đầu, e cuối],
   *  hl giữ khi mọi từ cũ đều nhấn, br của từ cuối giữ ở từ cuối. Từ đổi chữ có ed: true. */
  function retime(old, toks) {
    if (!toks.length) return [];
    if (old.length === toks.length) {
      return old.map((o, i) => {
        const n = { ...o, w: toks[i] };
        if (o.w !== toks[i]) n.ed = true;
        return n;
      });
    }
    const hl = old.length && old.every(o => o.hl), br = old.length && old[old.length - 1].br;
    const out = splitTimes(old[0].s, old[old.length - 1].e, toks).map(x => ({ ...x, ed: true, ...(hl ? { hl: true } : {}) }));
    if (br) out[out.length - 1].br = true;
    return out;
  }

  /** Chia n từ mới cho các khối theo thời lượng (dư lớn nhất), mỗi khối ≥ 1 từ khi đủ từ. */
  function distribute(durs, n) {
    const k = durs.length;
    if (!k) return [];
    if (n <= 0) return durs.map(() => 0);
    const base = n >= k ? 1 : 0, rest = n - base * k;
    const tot = durs.reduce((a, b) => a + Math.max(b, 0.01), 0);
    const raw = durs.map(d => rest * Math.max(d, 0.01) / tot);
    const out = raw.map(r => base + Math.floor(r));
    let left = n - out.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let j = 0; left > 0; j = (j + 1) % k, left--) out[order[j][1]]++;
    return out;
  }

  /** Sửa một đoạn có thể trải qua nhiều khối phụ đề: groups = [[từ cũ của khối 1], [khối 2]…] → [[từ mới khối 1]…].
   *  Tổng số từ không đổi: giữ thời gian từng từ. Đổi: chia từ mới cho các khối, chia giờ trong từng khối (không vượt khối). */
  function planEdit(groups, toks) {
    const total = groups.reduce((a, g) => a + g.length, 0);
    if (total === toks.length) {
      let k = 0;
      return groups.map(g => retime(g, toks.slice(k, (k += g.length))));
    }
    const counts = distribute(groups.map(g => g[g.length - 1].e - g[0].s), toks.length);
    let k = 0;
    return groups.map((g, i) => retime(g, toks.slice(k, (k += counts[i]))));
  }

  /** Chỗ khớp của cụm `query` trong mảng chữ `words` (không chồng nhau): [{i, n}]. */
  function findMatches(words, query, opts) {
    const na = !!(opts && opts.noAccent), q = tokenize(query).map(t => fold(t, na)).filter(Boolean);
    if (!q.length) return [];
    const F = words.map(w => fold(w, na)), out = [];
    for (let i = 0; i <= F.length - q.length; i++) {
      let ok = true;
      for (let j = 0; j < q.length && ok; j++) ok = F[i + j] === q[j];
      if (ok) { out.push({ i, n: q.length }); i += q.length - 1; }
    }
    return out;
  }

  // ---------- từ điển (cùng luật với scripts/dict.mjs) ----------
  const SIDE_MAX = 80, MAX = 500;
  // eslint-disable-next-line no-control-regex
  const BAD = /[=;\u0000-\u001f\u007f]/;
  function cleanSide(v) {
    if (typeof v !== 'string') return null;
    const s = v.normalize('NFC').replace(/\s+/g, ' ').trim().replace(/^[,.!?:"'“”]+|[,.!?:"'“”]+$/g, '').trim();
    return !s || s.length > SIDE_MAX || BAD.test(s) || s.startsWith('-') ? null : s;
  }
  function normalizeEntries(list) {
    const m = new Map();
    for (const it of Array.isArray(list) ? list : []) {
      const from = cleanSide(it && it.from), to = cleanSide(it && it.to);
      if (!from || !to || from === to) continue;
      const k = from.toLocaleLowerCase('vi'); m.delete(k); m.set(k, { from, to });
    }
    return [...m.values()].slice(-MAX);
  }
  /** "sai=đúng;…" hoặc mỗi dòng một cặp ("sai = đúng", "sai → đúng"). Trả cả số dòng hỏng để báo người dùng. */
  function parseDict(str) {
    const parts = String(str || '').split(/[;\n]+/).map(p => p.trim()).filter(Boolean);
    const pairs = [], bad = [];
    for (const p of parts) { const m = p.split(/=|→/); if (m.length === 2 && cleanSide(m[0]) && cleanSide(m[1])) pairs.push({ from: m[0], to: m[1] }); else bad.push(p); }
    return { entries: normalizeEntries(pairs), bad };
  }
  const dictString = entries => normalizeEntries(entries).map(e => `${e.from}=${e.to}`).join(';');
  const dictLines = entries => normalizeEntries(entries).map(e => `${e.from} = ${e.to}`).join('\n');

  // ---------- nghe lại bằng AI (M95): chữ Whisper nghe lại một đoạn → chỗ khác với lời thoại ----------
  // Số đọc bằng chữ và bằng số coi như nhau khi so ("một" = "1"), để khác cách viết không thành đề xuất.
  const NUMW = {};
  for (const [w, n] of Object.entries({ 'không': 0, 'một': 1, 'hai': 2, 'ba': 3, 'bốn': 4, 'năm': 5, 'sáu': 6, 'bảy': 7, 'bẩy': 7, 'tám': 8, 'chín': 9, 'mười': 10 })) NUMW[fold(w)] = String(n);
  const heardKey = w => { const k = fold(w); return NUMW[k] || k; };
  const word = (w, s, e) => ({ w, s: r3(s), e: r3(e) });
  /** Chữ Whisper trả về → từ cùng dạng lời thoại (giống scripts/captions.py): bỏ , . ! ở hai đầu, dán "%" vào số trước,
   *  khoảng số "15-30" / "15" "-30" đọc thành "15 đến 30" (người Việt nói "đến"), "-" khác dán vào từ trước. */
  function heardTokens(list) {
    const out = [];
    for (const x of Array.isArray(list) ? list : []) {
      const w = String(x && x.w || '').normalize('NFC').trim().replace(/^[,.!]+|[,.!]+$/g, '');
      const s = +x.s, e = +x.e;
      if (!w || !Number.isFinite(s) || !Number.isFinite(e)) continue;
      const prev = out[out.length - 1], rng = /^(\d+(?:[.,]\d+)?)[-–](\d+(?:[.,]\d+)?)(\S*)$/.exec(w);
      if (rng) { out.push(...splitTimes(s, e, [rng[1], 'đến', rng[2] + rng[3]])); continue; }
      if (prev && /^[-–]\d/.test(w) && /\d$/.test(prev.w)) { const m = s + (e - s) * .4; out.push(word('đến', s, m), word(w.slice(1), m, e)); continue; }
      if (prev && /^[%\-–]/.test(w)) { prev.w += w; prev.e = r3(e); continue; }
      out.push(word(w, s, e));
    }
    return out;
  }
  /** So lời thoại `old` (mảng chữ) với chữ nghe lại `heard` (mảng chữ) theo dãy con chung dài nhất, trả những chỗ khác
   *  chạm vào đoạn đã chọn [a, b] (chỉ số trong `old`): [{i, n, from, to}] = thay old[i..i+n-1] bằng `to`.
   *  Whisper bỏ sót từ ở mép đoạn cắt nên chỗ "chỉ xoá" không thành đề xuất; chỗ "chỉ thêm" gộp với từ kề trong đoạn. */
  function rehearDiff(old, heard, a, b) {
    const A = old.map(heardKey), B = heard.map(heardKey), n = A.length, m = B.length;
    const L = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const hunks = []; let i = 0, j = 0, h = null;
    const close = () => { if (h) hunks.push(h); h = null; };
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === B[j]) { close(); i++; j++; continue; }
      h ??= { oi: i, on: 0, hi: j, hn: 0 };
      if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { h.hn++; j++; } else { h.on++; i++; }
    }
    close();
    const out = [];
    for (const k of hunks) {
      if (!k.hn) continue;
      const add = heard.slice(k.hi, k.hi + k.hn);
      if (!add.some(t => /[\p{L}\p{N}]/u.test(t))) continue;
      let oi = k.oi, on = k.on, to = add;
      if (!on) { // chỉ thêm: dính vào từ kề nằm trong đoạn đã chọn
        if (oi - 1 >= a && oi - 1 <= b) { oi--; to = [old[oi], ...add]; } else if (oi >= a && oi <= b) to = [...add, old[oi]]; else continue;
        on = 1;
      }
      if (oi > b || oi + on - 1 < a) continue;
      out.push({ i: oi, n: on, from: old.slice(oi, oi + on).join(' '), to: to.join(' ') });
    }
    return out;
  }

  const T = { fold, tokenize, splitTimes, retime, distribute, planEdit, findMatches, cleanSide, normalizeEntries, parseDict, dictString, dictLines, heardTokens, rehearDiff };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.TranscriptCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
