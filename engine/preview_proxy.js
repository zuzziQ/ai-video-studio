// S29 M213: khung xem trước 540p cho máy yếu (mục 5b của docs/plans/S28-edit-kieu-capcut.md). Hàm thuần dùng chung cho
// engine (engine.js fmtSeq chọn chuỗi khung), Studio (studio/features/63_frames.js), route trích lười
// (studio/routes/63_frames.mjs) và test Node (scripts/tests/s29_proxy.test.mjs).
//   Chuỗi gốc  work/frames/%05d.jpg      cỡ thiết kế (720×1280), -q:v 3 — render luôn dùng chuỗi này
//   Chuỗi 540p work/frames_540/%05d.jpg  cạnh ngắn 540, -q:v 5, trích từ chính chuỗi gốc nên cùng số khung, khớp hình
// Chỉ timeline xem trước của Studio có TL.preview_proxy = { chuỗi gốc: chuỗi 540p } (những chuỗi đã trích đủ); timeline của
// render không có trường này. Ảnh 540p lỗi (thiếu, hỏng) → fallback() bỏ chuỗi đó khỏi map, ảnh đổi về bản gốc.
(function (root) {
  'use strict';
  const SUFFIX = '_540', SHORT = 540, Q = 5, OK = '.ok';
  const isSeq = s => typeof s === 'string' && /%0?\d*d/.test(s);
  const dirOf = s => s.slice(0, s.lastIndexOf('/') + 1);

  // 'work/frames/%05d.jpg' → 'work/frames_540/%05d.jpg'; không phải mẫu số, không có thư mục cha hay đã là 540p → null
  function proxySeq(seq) {
    if (!isSeq(seq)) return null;
    const i = seq.lastIndexOf('/');
    if (i <= 0 || seq.slice(0, i).endsWith(SUFFIX)) return null;
    return seq.slice(0, i) + SUFFIX + seq.slice(i);
  }
  // chuỗi engine sẽ đọc: bản 540p khi map có, không thì chính nó
  const pick = (map, seq) => (map && typeof seq === 'string' && Object.prototype.hasOwnProperty.call(map, seq) && typeof map[seq] === 'string' ? map[seq] : seq);

  // ảnh lỗi có src thuộc một chuỗi 540p của map → xoá chuỗi đó khỏi map (khung sau đọc bản gốc) và trả src bản gốc; không thuộc → null.
  // url = hàm biến đường dẫn dự án thành src (engine: url() thêm TL.base)
  function fallback(map, src, url = p => p) {
    if (!map || typeof src !== 'string') return null;
    for (const seq of Object.keys(map)) {
      const pd = url(dirOf(map[seq]));
      if (pd && src.startsWith(pd)) { delete map[seq]; return url(dirOf(seq)) + src.slice(pd.length); }
    }
    return null;
  }

  // bật hay không: người dùng chọn 'on' / 'off' thì theo đó; 'auto' (mặc định) = profile tiet-kiem hoặc Chrome render SwiftShader
  function wanted({ pref = 'auto', profile = null, chromeMode = null } = {}) {
    if (pref === 'on') return true;
    if (pref === 'off') return false;
    return profile === 'tiet-kiem' || chromeMode === 'swiftshader';
  }

  // lệnh ffmpeg trích 540p từ chuỗi gốc (đường dẫn tuyệt đối): cạnh ngắn 540 (ảnh nhỏ hơn thì giữ cỡ), số khung bắt đầu như bản gốc
  const ffArgs = (inPat, outPat, start = 1) => ['-v', 'error', '-y', '-start_number', String(start), '-i', inPat,
    '-vf', `scale='if(gt(iw,ih),-2,min(iw,${SHORT}))':'if(gt(iw,ih),min(ih,${SHORT}),-2)'`,
    '-q:v', String(Q), '-start_number', String(start), outPat];

  const api = { SUFFIX, SHORT, Q, OK, isSeq, proxySeq, pick, fallback, wanted, ffArgs };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PreviewProxy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
