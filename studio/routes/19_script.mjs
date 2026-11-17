// Kịch bản có sẵn (S17 M123, scripts/script_doc.mjs; feature studio/features/19_script.js).
//   GET  /api/script                 → { script | null, caps, mute }      (.studio/script.json của dự án đang mở)
//   POST /api/script {text, name}    → lưu, căn với lời nghe được, thay phụ đề bằng chữ kịch bản → { ok, script, captions, pending, gate }
//                                      (gate: claim gate của chữ kịch bản khi timeline.ads.on, null khi không bật quảng cáo)
//                                      (pending: dự án chưa có lời thoại; "Tạo lời thoại tự động" sẽ căn sau)
//   POST /api/script/clear           → bỏ kịch bản, trả phụ đề whisper đã sao lưu → { ok, restored }
//   POST /api/script/docx (thân = file .docx, ≤ 10 MB) → { text }
//   POST /api/script/stage {text, name} → { id } kịch bản chờ cho Tự lái (job autopilot `opts.script`, `--script <id>`)
// Như mọi /api/*, cần token phiên + cùng origin (studio/security.mjs).
import { applyScript, docxText, gateScript, readScript, removeScript, stageScript, writeScript } from '../../scripts/script_doc.mjs';

const MAX_DOCX = 10 << 20;
function rawBody(req, max) {
  return new Promise((ok, no) => {
    const parts = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > max) { no(Object.assign(new Error('File lớn quá (tối đa 10 MB)'), { status: 413 })); req.destroy(); } else parts.push(c); });
    req.on('end', () => ok(Buffer.concat(parts))); req.on('error', no);
  });
}

export default ctx => async (req, res, p) => {
  if (p !== '/api/script' && !p.startsWith('/api/script/')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  try {
    if (p === '/api/script/docx' && req.method === 'POST') {
      const text = docxText(await rawBody(req, MAX_DOCX));
      if (!text.trim()) return J({ error: 'File .docx không có chữ' }, 400);
      return J({ text });
    }
    if (p === '/api/script/stage' && req.method === 'POST') {
      const b = await ctx.body(req);
      return J({ ok: true, id: stageScript(b.text, { name: b.name }) });
    }
    if (!ctx.project) return J({ error: 'Chưa mở dự án' }, 400);
    const dir = ctx.project.dir;
    if (p === '/api/script' && req.method === 'GET') {
      const { timeline: tl, captions } = ctx.readProject();
      return J({ script: readScript(dir), caps: captions.length, mute: !!tl.speech?.none });
    }
    if (req.method !== 'POST') return false;
    if (p === '/api/script') {
      const b = await ctx.body(req);
      if (typeof b.text !== 'string') return J({ error: 'Thiếu chữ kịch bản' }, 400);
      writeScript(dir, b.text, { name: b.name });
      const { timeline: tl, captions } = ctx.readProject();
      const r = applyScript(dir, { tl, caps: captions });
      if (!r.pending) ctx.save({ timeline: r.tl, captions: r.caps });
      // dự án quảng cáo có sản phẩm: soát claim của chữ kịch bản ngay khi lưu (M22); lỗi soát không chặn việc lưu
      let gate = null; try { gate = await gateScript(dir, tl); } catch (e) { gate = { error: String(e.message || e).slice(0, 200), issues: [] }; }
      return J({ ok: true, script: readScript(dir), captions: r.pending ? captions.length : r.caps.length, pending: !!r.pending, gate });
    }
    if (p === '/api/script/clear') {
      const caps = removeScript(dir);
      if (caps) { const { timeline: tl } = ctx.readProject(); ctx.save({ timeline: tl, captions: caps }); }
      return J({ ok: true, restored: !!caps });
    }
  } catch (e) { return J({ error: String(e.message || e).slice(0, 300) }, e.status || 500); }
  return false;
};
