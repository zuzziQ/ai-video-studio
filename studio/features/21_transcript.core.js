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

  // ---------- soát kỹ hai lớp (M96) ----------
  // Lớp 1 (suspectSpans): tìm chỗ đáng nghe lại cho cả bài bằng tín hiệu rẻ: độ tự tin từng từ của Whisper (`p`, có từ
  // M96), con số, từ lặp liền nhau, độ dài lạ, chỗ AI soát chữ (M90) đề xuất sửa hoặc đánh dấu "nghi". Gom chỗ gần nhau
  // thành đoạn, nới mỗi đoạn đủ minWin giây như scripts/rehear.mjs checkSpan, giữ tối đa `limit` đoạn điểm cao nhất.
  // Lớp 2 chạy ở server (/api/rehear/batch); triage() so ba nguồn (gốc, AI chữ, nghe lại) rồi xếp đề xuất.
  // pLow / pMid đo trên sample/clip-mau (references/captions-accuracy.md, mục M96). minWin, maxSpan, pad = scripts/rehear.mjs.
  // Đo 2026-11-16: 4 lỗi của turbo có p 0,62–0,83 (sai mà vẫn khá chắc); p < 0,85 bắt cả 4, nghi nhầm 12/129 từ đúng.
  const SUSPECT = { pLow: 0.6, pMid: 0.85, gap: 2.5, maxCore: 20, minWin: 5, maxSpan: 30, pad: 1, limit: 12, min: 2 };
  const letters = w => String(w || '').replace(/[^\p{L}\p{N}]/gu, '');
  /** Điểm nghi từng từ: [{score, why: [...]}]. words [{w, s, e, p?, ed?}]; aiEdits / uncertain: [{start, end}] (chỉ số từ).
   *  Từ người dùng đã sửa tay (ed) không bao giờ nghi. */
  function suspectScores(words, { aiEdits = [], uncertain = [], ...o } = {}) {
    const K = { ...SUSPECT, ...o }, out = words.map(() => ({ score: 0, why: [] }));
    const add = (k, n, why) => { const x = out[k]; if (!x || words[k].ed) return; x.score += n; if (!x.why.includes(why)) x.why.push(why); };
    const mark = (list, n, why) => { for (const r of list) for (let k = Math.max(0, r.start | 0); k <= Math.min(words.length - 1, r.end ?? r.start); k++) add(k, n, why); };
    for (const [k, x] of words.entries()) {
      const p = x.p == null ? NaN : +x.p, L = letters(x.w), d = x.e - x.s;
      if (Number.isFinite(p)) { if (p < K.pLow) add(k, 3, 'Whisper không chắc'); else if (p < K.pMid) add(k, 2, 'Whisper không chắc'); }
      if (/\d/.test(x.w)) add(k, 2, 'con số');
      if (/^(đến|tới)$/i.test(L) && /\d/.test(words[k - 1]?.w || '') && /\d/.test(words[k + 1]?.w || '')) add(k, 2, 'con số');
      if (k && L && fold(x.w) === fold(words[k - 1].w)) { add(k, 1, 'từ lặp'); add(k - 1, 1, 'từ lặp'); }
      if (L.length > 12 || d > 1.6 || (d < 0.05 && L.length > 3)) add(k, 1, 'độ dài lạ');
    }
    mark(uncertain, 3, 'AI nghi');
    mark(aiEdits, 4, 'AI đề xuất sửa');
    return out;
  }
  /** Khoảng nghe [from, to] cho đoạn [s, e]: thêm pad, nới đều cho đủ minWin, chạm đầu/cuối thì dồn sang bên kia (= checkSpan). */
  function hearWindow(s, e, duration, o) {
    const K = { ...SUSPECT, ...o }, D = Number.isFinite(+duration) && +duration > 0 ? +duration : Infinity;
    const pad = Math.max(K.pad, (K.minWin - (e - s)) / 2);
    let from = s - pad, to = e + pad;
    if (from < 0) { to -= from; from = 0; }
    if (to > D) { from = Math.max(0, from - (to - D)); to = D; }
    return { from: r3(from), to: r3(to) };
  }
  /** Đoạn nghi: {spans: [{a, b (chỉ số từ), s, e, from, to, score, why}] theo thời gian, total, cut (số đoạn bỏ vì quá limit)}.
   *  o: ngưỡng (SUSPECT) + aiEdits, uncertain, duration. Mỗi đoạn ≤ maxCore giây; giữ `limit` đoạn điểm cao nhất. */
  function suspectSpans(words, o = {}) {
    const K = { ...SUSPECT, ...o }, sc = suspectScores(words, o), groups = [];
    let g = null;
    for (const [k, x] of words.entries()) {
      if (sc[k].score < K.min) continue;
      if (g && x.s - words[g.b].e <= K.gap && x.e - words[g.a].s <= K.maxCore) { g.b = k; g.score += sc[k].score; for (const y of sc[k].why) if (!g.why.includes(y)) g.why.push(y); continue; }
      if (g) groups.push(g);
      g = { a: k, b: k, score: sc[k].score, why: [...sc[k].why] };
    }
    if (g) groups.push(g);
    const keep = groups.map((x, i) => ({ x, i })).sort((p, q) => q.x.score - p.x.score || p.i - q.i).slice(0, K.limit).sort((p, q) => p.i - q.i).map(({ x }) => x);
    const spans = keep.map(x => { const s = words[x.a].s, e = Math.min(words[x.b].e, s + K.maxSpan); return { ...x, s: r3(s), e: r3(e), ...hearWindow(s, e, K.duration, K) }; });
    return { spans, total: groups.length, cut: groups.length - spans.length };
  }

  /** Whisper bịa: nghe ra nhiều chữ hơn hẳn lời thoại cùng khoảng, hoặc lặp một từ / một cụm (lỗi quen của Whisper khi đoạn ngắn). */
  function madeUp(heard, old) {
    const H = heard.map(heardKey).filter(Boolean);
    if (H.length > old.length * 1.6 + 4) return true;
    let run = 1;
    for (let i = 1; i < H.length; i++) { run = H[i] === H[i - 1] ? run + 1 : 1; if (run >= 4) return true; }
    const seen = new Map();
    for (let i = 0; i + 3 <= H.length; i++) { const k = H.slice(i, i + 3).join(' '); seen.set(k, (seen.get(k) || 0) + 1); if (seen.get(k) >= 3) return true; }
    return false;
  }
  const sameKeys = (a, b) => a.length === b.length && a.every((x, i) => heardKey(x) === heardKey(b[i]));
  const RANK = { cao: 0, 'vừa': 1, nghe: 2 };
  /**
   * So ba nguồn cho từng đoạn nghi. words [{w, s, e}] (lời thoại lúc soát), spans = suspectSpans().spans,
   * aiEdits [{start, end, old, new, kind, reason}] (trợ lý transcript), heard[j] = chữ Whisper nghe lại đoạn j ([{w, s, e}],
   * null = chưa nghe), uncertain [{start, end}] (chỗ AI nghi), aiRan (AI soát chữ đã đọc cả bài).
   * Luật: nghe lại = AI → "cao" (2 nguồn đồng ý). Nghe lại = gốc: AI đoán số → bỏ (AI không nghe được âm thanh); sửa chữ khác →
   * hạ xuống "nghe" (đo trên clip mẫu: large-v3 cũng nghe "tiền hóa" như turbo, AI sửa đúng "tiến hoá" theo nghĩa câu).
   * Ba nguồn khác nhau → "nghe" (to = bản nghe lại, alt = bản AI), trừ chỗ có con số → "vừa" (AI đoán số sai 6/41 lần ở M90). Chỉ nghe lại thấy khác: "vừa" nếu chạm con số hoặc chỗ AI
   * nghi (hoặc AI không chạy và từ đó nghi), không thì "nghe" (AI đã đọc câu và thấy đúng). Nghe lại bịa (madeUp) hoặc đổi quá
   * 3 từ → bỏ. Không sửa gì: trả {suggestions: [{start, end, from, to, alt?, kind, conf, src, reason}] xếp cao → vừa → nghe,
   * dropped (đề xuất AI bị bỏ), counts}.
   */
  function triage({ words, spans = [], aiEdits = [], heard = [], uncertain = [], aiRan = aiEdits.length > 0 || uncertain.length > 0, scores = null }) {
    const sc = scores || suspectScores(words, { aiEdits, uncertain }), out = [], dropped = [];
    const unsure = new Set(); for (const u of uncertain) for (let k = u.start; k <= (u.end ?? u.start); k++) unsure.add(k);
    const hasNum = t => /\d/.test(t);
    const st = { agree: 0, dropAi: 0, listen: 0, heardOnly: 0, madeUp: 0, wild: 0, aiOnly: 0, reheard: 0 };
    const quote = t => (t.length > 60 ? t.slice(0, 60) + '…' : t);
    const runs = spans.map((sp, j) => {
      const h = heard[j];
      if (!Array.isArray(h)) return null;
      st.reheard++;
      const ks = []; for (const [k, x] of words.entries()) if (x.e > sp.from + .05 && x.s < sp.to - .05) ks.push(k);
      if (!ks.length) return null;
      const toks = heardTokens(h), old = ks.map(k => words[k].w);
      if (madeUp(toks.map(x => x.w), old)) { st.madeUp++; return { sp, bad: true }; }
      const sa = ks.indexOf(sp.a), sb = ks.indexOf(sp.b);
      const diffs = (sa >= 0 && sb >= sa ? rehearDiff(old, toks.map(x => x.w), sa, sb) : []).map(d => ({ ...d, i: ks[0] + d.i, used: false }))
        .filter(d => { const ok = Math.abs(tokenize(d.to).length - d.n) <= 3; if (!ok) st.wild++; return ok; });
      const said = toks.filter(x => x.e > sp.s - 1.5 && x.s < sp.e + 1.5).map(x => x.w).join(' ');
      return { sp, diffs, said };
    });
    const runOf = (a, b) => runs.find(r => r && r.sp.a <= a && b <= r.sp.b);
    const apply = (lo, hi, chs) => { // chữ của words[lo..hi] sau khi áp các thay đổi {i, n, to}
      const res = []; let k = lo;
      for (const c of [...chs].sort((x, y) => x.i - y.i)) { while (k < c.i && k <= hi) res.push(words[k++].w); res.push(...tokenize(c.to)); k = Math.max(k, c.i + c.n); }
      while (k <= hi) res.push(words[k++].w);
      return res;
    };
    for (const ed of aiEdits) {
      const r = runOf(ed.start, ed.end), kind = ed.kind || 'nhận dạng';
      const oldT = words.slice(ed.start, ed.end + 1).map(x => x.w), newT = tokenize(ed.new);
      if (!r || r.bad || sameKeys(oldT, newT)) { // chưa nghe lại được, hoặc chỉ khác hoa thường / dấu câu (tai không phân biệt)
        st.aiOnly++;
        out.push({ kind, start: ed.start, end: ed.end, from: oldT.join(' '), to: ed.new, conf: 'vừa', src: 'AI soát chữ', reason: [ed.reason, r?.bad ? 'nghe lại ra câu lạ, không dùng' : ''].filter(Boolean).join(' · ') });
        continue;
      }
      const D = r.diffs.filter(d => d.i <= ed.end && d.i + d.n - 1 >= ed.start);
      if (!D.length) { // nghe lại vẫn ra chữ gốc
        if (hasNum(oldT.join(' ') + ' ' + ed.new)) { st.dropAi++; dropped.push({ start: ed.start, end: ed.end, from: oldT.join(' '), to: ed.new, said: r.said }); continue; }
        st.listen++;
        out.push({ kind, start: ed.start, end: ed.end, from: oldT.join(' '), to: ed.new, conf: 'nghe', src: 'AI soát chữ, nghe lại ra chữ gốc',
          reason: `Cần nghe: nghe lại vẫn ra “${oldT.join(' ')}”; AI sửa theo nghĩa câu${ed.reason ? ' (' + ed.reason + ')' : ''}` });
        continue;
      }
      D.forEach(d => { d.used = true; });
      const lo = Math.min(ed.start, ...D.map(d => d.i)), hi = Math.max(ed.end, ...D.map(d => d.i + d.n - 1));
      const heardV = apply(lo, hi, D), aiV = apply(lo, hi, [{ i: ed.start, n: ed.end - ed.start + 1, to: ed.new }]);
      const from = words.slice(lo, hi + 1).map(x => x.w).join(' ');
      if (sameKeys(heardV, aiV)) { st.agree++; out.push({ kind, start: lo, end: hi, from, to: aiV.join(' '), conf: 'cao', src: 'AI soát chữ + nghe lại', reason: `2 nguồn đồng ý${ed.reason ? ' · ' + ed.reason : ''} · nghe được: “${quote(r.said)}”` }); }
      else if (hasNum(from + ' ' + aiV.join(' ') + ' ' + heardV.join(' '))) { // AI đoán số mà không nghe được: tin bản nghe lại hơn
        st.heardOnly++;
        out.push({ kind: 'nhận dạng', start: lo, end: hi, from, to: heardV.join(' '), alt: aiV.join(' '), conf: 'vừa', src: 'nghe lại (AI đoán số khác)', reason: `Con số: nghe lại ra “${heardV.join(' ')}”; AI chỉ đọc chữ, đoán “${aiV.join(' ')}”` });
      } else { st.listen++; out.push({ kind: 'nhận dạng', start: lo, end: hi, from, to: heardV.join(' '), alt: aiV.join(' '), conf: 'nghe', src: 'ba nguồn khác nhau', reason: `Cần nghe: nghe lại ra “${heardV.join(' ')}”, AI soát chữ đề xuất “${aiV.join(' ')}”` }); }
    }
    for (const r of runs) {
      if (!r || r.bad) continue;
      for (const d of r.diffs) {
        if (d.used) continue;
        const ks = Array.from({ length: d.n }, (_, x) => d.i + x);
        const sus = hasNum(d.from) || hasNum(d.to) || ks.some(k => unsure.has(k)) || (!aiRan && ks.some(k => sc[k].score >= SUSPECT.min));
        st[sus ? 'heardOnly' : 'listen']++;
        out.push({ kind: 'nhận dạng', start: d.i, end: d.i + d.n - 1, from: d.from, to: d.to, conf: sus ? 'vừa' : 'nghe', src: 'nghe lại',
          reason: `${sus ? 'Chỗ nghi, nghe lại' : aiRan ? 'Cần nghe: AI đọc thấy chữ gốc ổn, nghe lại' : 'Cần nghe: chỉ nghe lại'} thấy khác · nghe được: “${quote(r.said)}”` });
      }
    }
    out.sort((x, y) => RANK[x.conf] - RANK[y.conf] || x.start - y.start);
    return { suggestions: out, dropped, counts: st };
  }

  const T = { fold, tokenize, splitTimes, retime, distribute, planEdit, findMatches, cleanSide, normalizeEntries, parseDict, dictString, dictLines, heardTokens, rehearDiff,
    SUSPECT, suspectScores, suspectSpans, hearWindow, madeUp, triage };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.TranscriptCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
