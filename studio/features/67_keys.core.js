// S20 M141: lõi thuần của phím tắt kiểu editor web — đọc tổ hợp phím, mũi tên dời hay tua (C19), vị trí dán lặp, chọn tất cả tại
// playhead và bảng phím tắt. Không DOM: studio.js (hàm keydown) và 67_keys.js gọi các hàm ở đây. Chạy trong trình duyệt
// (window.KeysCore) và trong Node (module.exports) cho scripts/tests/s20_keys.test.mjs.
'use strict';
(function (root) {
  // Tên phím theo vị trí (e.code) để ⌥ trên Mac không đổi ký tự (⌥L = "¬", ⌥] = "'"); phím khác theo e.key.
  function keyName(e) {
    const c = e.code || '';
    if (/^Key[A-Z]$/.test(c)) return c.slice(3).toLowerCase();
    if (/^Digit\d$/.test(c)) return c.slice(5);
    if (c === 'BracketRight') return ']';
    if (c === 'BracketLeft') return '[';
    return (e.key || '').length === 1 ? e.key.toLowerCase() : e.key || '';
  }
  // Tổ hợp chuẩn: "mod+alt+shift+<phím>" (mod = ⌘ trên Mac, Ctrl trên Windows).
  function chord(e) {
    const k = keyName(e);
    return [(e.metaKey || e.ctrlKey) && 'mod', e.altKey && 'alt', e.shiftKey && 'shift', k].filter(Boolean).join('+');
  }
  // Lệnh mới của M141 (các phím cũ vẫn ở hàm keydown của studio.js).
  const ACTIONS = {
    'mod+c': 'copy', 'mod+x': 'cut', 'mod+v': 'paste', 'mod+a': 'all',
    'mod+]': 'up', 'mod+[': 'down', 'mod+alt+]': 'top', 'mod+alt+[': 'bottom',
    'alt+shift+l': 'lock',
  };
  function actionOf(e) {
    if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) return 'help'; // ? = Shift + / trên bàn phím Mỹ, khác vị trí ở bàn phím khác
    return ACTIONS[chord(e)] || null;
  }

  // Vùng nhận mũi tên (C19): bấm trên khung → 'stage'; bấm timeline → 'timeline'; bấm thanh trái, thư viện, thanh trên → 'other';
  // inspector, thanh nổi, menu chuột phải ('keep') giữ vùng trước đó.
  const zoneAfter = (prev, region) => (region === 'keep' ? prev : region || prev);
  // Mũi tên: ⌥ luôn dời; vùng 'stage' + đang chọn element dời được thì dời; còn lại ← → lùi / tiến 1 khung (Shift 1 giây), ↑ ↓ không làm gì.
  // o: {key, alt, shift, zone, movable, locked, fps}. Trả {type:'nudge', dx, dy} | {type:'locked'} | {type:'seek', dt} | null.
  function arrowAction(o) {
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[o.key];
    if (!dir) return null;
    if (o.alt || o.zone === 'stage') {
      if (o.movable) { const n = o.shift ? 10 : 1; return { type: 'nudge', dx: dir[0] * n, dy: dir[1] * n }; }
      if (o.locked) return { type: 'locked' };
    }
    if (o.alt) return null; // ⌥ + mũi tên khi không chọn gì: không tua (⌘⌥ ← → là đổi tab, 58_tabs.js)
    if (!dir[0]) return null;
    return { type: 'seek', dt: dir[0] * (o.shift ? 1 : 1 / (o.fps || 30)) };
  }

  // Dán: lần đầu tại playhead giữ đúng vị trí; dán tiếp ở cùng thời điểm lệch thêm 24 px mỗi lần. Chép (không cắt) rồi dán ngay tại
  // thời điểm gốc thì bản đầu đã lệch 24 px để không đè khít lên bản gốc. st: {srcT0, cut, lastT, n}; trả trạng thái mới + off (px).
  const STEP = 24, EPS = 1e-3;
  function pasteStep(st, T) {
    const n = st.lastT != null && Math.abs(T - st.lastT) < EPS ? st.n + 1 : !st.cut && Math.abs(T - st.srcT0) < EPS ? 1 : 0;
    return { ...st, lastT: T, n, off: n * STEP };
  }
  // Kẹp tâm element trong khung sau khi lệch.
  const clampPos = (p, DW, DH) => ({ ...p, x: Math.min(DW, Math.max(0, p.x)), y: Math.min(DH, Math.max(0, p.y)) });

  // Loại element chép / dán được bằng clipboard trong trang.
  const COPYABLE = new Set(['scene', 'line', 'node', 'cap', 'sfx', 'music']);
  const STAGE_SKIP = new Set(['clip', 'sfx', 'music']);
  // ⌘A: element đang hiện tại playhead trên khung (bỏ clip, âm thanh, element ẩn / khoá, track khoá / ẩn, element không có vị trí).
  // list: [{kind, t0, t1, hidden, locked, trackOff, hasPos}] → chỉ số của mục được chọn.
  function selectAllAt(list, T) {
    const out = [];
    list.forEach((c, i) => { if (!STAGE_SKIP.has(c.kind) && c.hasPos && !c.hidden && !c.locked && !c.trackOff && T >= c.t0 && T < c.t1) out.push(i); });
    return out;
  }

  // Bảng phím tắt (phím ? và menu ⋯). Mọi phím của Studio, gom theo nhóm; 'mod' hiện thành ⌘ trên Mac, Ctrl trên Windows.
  const KEYMAP = [
    ['Phát và thời gian', [
      ['Space', 'Phát / dừng'],
      ['← →', 'Lùi / tiến 1 khung (khi vừa bấm timeline hoặc không chọn gì)'],
      ['⇧ ← →', 'Lùi / tiến 1 giây'],
      ['+ / −', 'Phóng to / thu nhỏ timeline'],
      ['⇧Z', 'Vừa khung (preview và timeline)'],
      ['`', 'Timeline: dải tua → gọn → đầy đủ (⇧ ngược lại; kéo mép trên cũng đổi)'],
    ]],
    ['Element trên khung', [
      ['← → ↑ ↓', 'Dời 1 px (khi vừa chọn element trên khung)'],
      ['⇧ + mũi tên', 'Dời 10 px'],
      ['⌥ + mũi tên', 'Luôn dời element (thêm Shift: 10 px)'],
      ['mod C / mod X / mod V', 'Chép / cắt / dán (dán tại playhead, dán lặp lệch 24 px)'],
      ['mod D', 'Nhân bản'],
      ['⌥ + kéo', 'Nhân bản rồi kéo bản sao'],
      ['mod ] / mod [', 'Đưa lên / xuống một lớp'],
      ['mod ⌥ ] / mod ⌥ [', 'Đưa lên trên cùng / xuống dưới cùng'],
      ['⌥⇧L', 'Khoá / mở khoá element'],
      ['mod A', 'Chọn mọi element đang hiện'],
      ['⇧ + bấm', 'Chọn thêm / bỏ khỏi nhóm'],
      ['Bấm đúp', 'Sửa chữ ngay trên khung (Enter xong, Esc huỷ)'],
      ['Delete', 'Xoá element đang chọn'],
      ['Esc', 'Bỏ chọn / thu preview'],
    ]],
    ['Clip và dự án', [
      ['mod B', 'Tách clip tại playhead'],
      ['mod Z / ⇧ mod Z', 'Hoàn tác / làm lại'],
      ['mod S', 'Lưu'],
      ['mod K', 'Bảng lệnh (tìm mọi công cụ)'],
      ['mod ⌥ ← →', 'Sang tab dự án trước / sau'],
      ['?', 'Bảng phím tắt này'],
    ]],
    ['Bản chép lời (panel Chữ)', [
      ['mod H', 'Tìm và thay'],
      ['Delete', 'Xoá chữ đã chọn (hoặc cắt video, theo chế độ)'],
      ['Enter / F2', 'Sửa đoạn đã chọn'],
      ['⇧F10', 'Menu đoạn'],
    ]],
  ];
  const keyLabel = (k, mac) => k.replace(/\bmod\b ?/g, mac ? '⌘' : 'Ctrl ').replace(/⌥/g, mac ? '⌥' : 'Alt ').replace(/⇧/g, mac ? '⇧' : 'Shift ').replace(/ {2,}/g, ' ').trim();

  const T = { keyName, chord, actionOf, ACTIONS, zoneAfter, arrowAction, pasteStep, clampPos, STEP, COPYABLE, selectAllAt, KEYMAP, keyLabel };
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.KeysCore = T;
})(typeof window !== 'undefined' ? window : globalThis);
