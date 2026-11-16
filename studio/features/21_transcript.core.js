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

  const T = { fold, tokenize, splitTimes, retime, distribute, planEdit, findMatches, cleanSide, normalizeEntries, parseDict, dictString, dictLines };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.TranscriptCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
