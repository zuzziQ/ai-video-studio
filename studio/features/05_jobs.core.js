// Lõi thuần của khay việc (S26 M185): việc dài chạy nền, không chặn màn hình. Làm sạch log, một dòng bước, trạng thái thẻ,
// dòng tóm tắt hàng đợi Tự lái. Không DOM, không gọi server: features/05_jobs.js vẽ khay rồi gọi các hàm ở đây.
// Chạy trong trình duyệt (window.JobsCore) và trong Node (module.exports) cho scripts/tests/s26_m185.test.mjs.
'use strict';
(function (root) {
  const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
  const TQDM = /\d{1,3}%\|[^|]*\|/;                          // "12%|###   | 25M/176M [00:03<00:20, 7MB/s]"
  const TQDM_SIZE = /(\d+(?:[.,]\d+)?)\s*([kKMGT]?)i?B?\s*\/\s*(\d+(?:[.,]\d+)?)\s*([kKMGT]?)i?B?\b/;
  const PREFIX = /^@@\s+[\d.]+\s*/;                           // tiền tố tiến độ của scripts/queue.mjs
  const UNIT = { '': 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };

  const num = s => parseFloat(String(s).replace(',', '.'));
  const bytes = (n, u) => num(n) * (UNIT[u] || 1);
  // 176e6 → "176 MB"; 1.4e9 → "1,4 GB"
  function sizeLabel(b) {
    if (!(b > 0)) return '';
    if (b >= 1e9) return (b / 1e9).toFixed(1).replace('.', ',').replace(/,0$/, '') + ' GB';
    if (b >= 1e6) return Math.round(b / 1e6) + ' MB';
    return Math.max(1, Math.round(b / 1e3)) + ' KB';
  }
  // Dòng tqdm tải file: có thanh |###| và "đã/tổng" kèm đơn vị dung lượng (M, G, kB…). tqdm đếm khung hình ("30/120") không có đơn vị: không tính.
  function download(line) {
    const s = String(line || '').replace(ANSI, '');
    if (!TQDM.test(s)) return null;
    const m = TQDM_SIZE.exec(s.slice(s.indexOf('|', s.indexOf('|') + 1) + 1));
    if (!m || !(m[2] || m[4] || /[kKMGT]i?B\b/.test(s))) return null;
    const total = bytes(m[3], m[4]), pct = /(\d{1,3})%\|/.exec(s);
    return { pct: pct ? Math.min(100, +pct[1]) : Math.round(bytes(m[1], m[2]) / total * 100), total: sizeLabel(total) };
  }
  const isNoise = line => TQDM.test(line);

  // Log thô → các dòng đọc được: bỏ mã màu, tqdm, tiền tố "@@ 0.19", dòng trống; gộp dòng lặp liên tiếp ("x" "x" → "x (×2)").
  function cleanLog(raw, max = 8) {
    const out = [];
    for (let l of String(raw || '').replace(ANSI, '').split(/[\r\n]+/)) {
      l = l.replace(PREFIX, '').replace(/\s+$/, '');
      if (!l.trim() || isNoise(l)) continue;
      const last = out[out.length - 1];
      if (last && last.text === l) { last.n++; continue; }
      out.push({ text: l, n: 1 });
    }
    const lines = out.map(o => (o.n > 1 ? `${o.text} (×${o.n})` : o.text));
    return max > 0 ? lines.slice(-max) : lines;
  }
  // Dòng tqdm tải mới nhất trong phần đuôi log (tqdm ghi đè bằng \r nên chỉ xét đoạn cuối)
  function lastDownload(raw) {
    const parts = String(raw || '').slice(-4000).split(/[\r\n]+/);
    for (let i = parts.length - 1; i >= Math.max(0, parts.length - 6); i--) { const d = download(parts[i]); if (d) return d; }
    return null;
  }
  // Một dòng bước: đang tải mô hình thì "Đang tải mô hình (176 MB, lần đầu) 14%", không thì step của job bỏ tiền tố, không thì dòng log sạch cuối.
  function stepLine(job) {
    if (!job) return '';
    if (job.state === 'running' || job.state == null) {
      const d = lastDownload(job.log);
      if (d) return `Đang tải mô hình (${d.total}, lần đầu) ${d.pct}%`;
    }
    const step = String(job.step || '').replace(ANSI, '').replace(PREFIX, '').trim();
    if (step && !isNoise(step)) return step;
    return cleanLog(job.log, 1)[0] || '';
  }
  const pct = job => Math.max(0, Math.min(100, Math.round((+job?.progress || 0) * 100)));
  const download100 = job => lastDownload(job?.log);

  // ---------- thẻ ----------
  // job.state của server → pha của thẻ: run (đang chạy) · ok · err · stop (huỷ / tạm dừng, không phải lỗi)
  const PHASE = { running: 'run', done: 'ok', error: 'err', cancelled: 'stop', paused: 'stop' };
  const phaseOf = state => PHASE[state] || 'err';
  const STOP_TEXT = { cancelled: 'Đã huỷ', paused: 'Đã tạm dừng' };
  // Hiển thị của một thẻ: { phase, line, pct, canStop, tone }. card: { title, lock, phase, job, result }
  function view(card) {
    const j = card.job || {}, ph = card.phase || phaseOf(j.state);
    if (ph === 'run') return { phase: ph, tone: 'run', line: stepLine(j) || 'Bắt đầu', pct: pct(j), canStop: true, dl: download100(j) };
    if (ph === 'ok') return { phase: ph, tone: 'ok', line: (card.result?.text || stepLine(j) || 'Xong'), pct: 100, canStop: false };
    if (ph === 'stop') return { phase: ph, tone: 'warn', line: STOP_TEXT[j.state] || 'Đã dừng', pct: pct(j), canStop: false };
    return { phase: 'err', tone: 'err', line: card.result?.text || stepLine(j) || 'Chưa xong', pct: pct(j), canStop: false };
  }
  // Khoá sửa timeline khi còn thẻ đang chạy mà đặt lock (AI dựng, áp gợi ý QC): xuất video không khoá (server render bản đã lưu).
  const locked = cards => cards.some(c => c.lock && (c.phase || phaseOf(c.job?.state)) === 'run');
  const lockTitle = cards => (cards.find(c => c.lock && (c.phase || phaseOf(c.job?.state)) === 'run') || {}).title || '';
  // Việc thứ hai khi đang có việc → toast thay hộp lỗi
  const busyMessage = name => `Đang chạy: ${name || 'một việc khác'} (bấm chuông việc nền)`;
  const exportNote = 'Đang xuất bản lúc bấm Xuất: sửa tiếp sẽ vào lần xuất sau';

  // Dòng tóm tắt hàng đợi Tự lái từ /api/autopilot/state (items: {state, title, progress}); rỗng nếu hàng đợi trống
  function queueLine(items) {
    const list = Array.isArray(items) ? items : [], run = list.find(i => i.state === 'running'), wait = list.filter(i => i.state === 'queued').length;
    if (run) return `Tự lái: đang chạy “${run.title || 'video'}” ${Math.round((+run.progress || 0) * 100)}%${wait ? ` · ${wait} việc chờ` : ''}`;
    if (wait) return `Tự lái: ${wait} việc đang chờ`;
    return '';
  }
  // Tên việc đang chạy ở phía Tự lái (cho toast "Đang chạy: …" khi server báo bận mà khay không có thẻ nào)
  const queueRunning = items => (Array.isArray(items) ? items : []).find(i => i.state === 'running')?.title || '';

  // S26 M186: loại việc server (job.kind, ctx.startJob) → tên trong khay + có khoá timeline không. lock = route ghi lại timeline.json /
  // captions lúc xong (Studio tải lại dự án sau đó): sửa giữa chừng sẽ mất nên khoá. Tải lại trang giữa chừng: khay tự nhận lại theo bảng này.
  // Không có trong bảng = việc có màn theo dõi riêng (setup, perf-bench, batch, publish, frames, stylelab): khay không nhận.
  const KINDS = {
    export: ['Xuất video'], new: ['Tạo dự án mới'], ai: ['AI dựng giúp', 1], qc: ['Kiểm tra chất lượng', 1], qc_quick: ['Sửa vị trí graphic', 1],
    variants: ['Tạo 3 phiên bản'], fillers: ['Dò lỗi nói'], transcribe: ['Tạo lời thoại', 1], tplfit: ['Mẫu khớp lời thoại', 1],
    autofill: ['Tự thêm b-roll / âm thanh', 1], dub: ['Dịch & lồng tiếng', 1], mix: ['Trộn âm thanh'], reframe: ['Dò mặt'], segment: ['Tách nền'],
    sticker: ['Tạo sticker người'], broll_suggest: ['Claude gợi ý b-roll'], genimage: ['Tạo ảnh AI'], brolltag: ['Claude gắn thẻ thư viện'],
    'kho-migrate': ['Chuyển file cũ vào Kho'], highlights: ['Cắt clip từ video dài'], topic: ['Tạo video từ chủ đề'], 'longform-export': ['Xuất các clip'],
  };
  const kindInfo = kind => (Object.hasOwn(KINDS, kind) ? { kind, title: KINDS[kind][0], lock: !!KINDS[kind][1] } : null);
  // Lúc khởi động (GET /api/job): việc đang chạy mà khay chưa có thẻ thì nhận lại; loại có màn riêng hay đã xong thì thôi
  const resumeOf = j => (j && j.state === 'running' ? kindInfo(j.kind) : null);

  // S26 M187: nút chuông trên thanh đầu. → { n: số việc (thẻ + dòng Tự lái), tone: run | err | ok | '', pct: % việc đang chạy, label }
  // Đang chạy thắng lỗi (vòng % vẫn hiện), lỗi thắng xong; n = 0 thì giấu nút.
  function bell(cards, apLine) {
    const list = Array.isArray(cards) ? cards : [], ph = c => c.phase || phaseOf(c.job?.state);
    const run = list.find(c => ph(c) === 'run'), bad = list.find(c => ph(c) === 'err'), last = list[list.length - 1];
    const n = list.length + (apLine ? 1 : 0);
    const tone = run ? 'run' : bad ? 'err' : last && ph(last) === 'ok' ? 'ok' : '';
    const p = run ? pct(run.job) : 0;
    const what = run ? `${run.title} ${p}%` : bad ? `${bad.title}: lỗi` : last ? `${last.title}: ${view(last).line}` : apLine || '';
    return { n, tone, pct: p, label: n ? `Việc nền (${n}) · ${what}` : 'Việc nền' };
  }

  const T = { bell, cleanLog, download, lastDownload, stepLine, pct, sizeLabel, phaseOf, view, locked, lockTitle, busyMessage, exportNote, queueLine, queueRunning, isNoise, KINDS, kindInfo, resumeOf };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.JobsCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
