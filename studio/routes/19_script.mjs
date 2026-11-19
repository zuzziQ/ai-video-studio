// Kịch bản có sẵn (S17 M123, scripts/script_doc.mjs; feature studio/features/19_script.js).
//   GET  /api/script                 → { script | null, caps, mute }      (.studio/script.json của dự án đang mở)
//   POST /api/script {text, name}    → lưu, căn với lời nghe được, thay phụ đề bằng chữ kịch bản → { ok, script, captions, pending, gate }
//                                      (gate: claim gate của chữ kịch bản khi timeline.ads.on, null khi không bật quảng cáo)
//                                      (pending: dự án chưa có lời thoại; "Tạo lời thoại tự động" sẽ căn sau)
//   POST /api/script/clear           → bỏ kịch bản, trả phụ đề whisper đã sao lưu → { ok, restored }
//   POST /api/script/docx (thân = file .docx, ≤ 10 MB) → { text }
//   POST /api/script/stage {text, name} → { id } kịch bản chờ cho Tự lái (job autopilot `opts.script`, `--script <id>`)
//   S27 M193 (scripts/script_build.mjs):
//   GET  /api/script/sheet           → { sheet | null }   bảng dựng .studio/build_sheet.json (lưu kịch bản đã căn thì tự dựng lại)
//   POST /api/script/sheet {stock}   → { ok, sheet }      dựng lại bảng (stock: có tìm stock qua mạng; mặc định chỉ Kho / thư viện / b-roll động)
//   POST /api/script/suggest {text}  → { ok, text, added } Claude chèn dấu vào chính chữ đó (checkSuggested: không được sửa lời);
//                                      không lưu: người dùng Nhận / Bỏ trong ô Kịch bản rồi mới Lưu
// Như mọi /api/*, cần token phiên + cùng origin (studio/security.mjs).
import fs from 'node:fs';
import os from 'node:os';
import { applyScript, docxText, gateScript, readScript, removeScript, stageScript, writeScript, MAX_TEXT } from '../../scripts/script_doc.mjs';
import { checkSuggested, dropSheet, readSheet, sheetFor, suggestPrompt } from '../../scripts/script_build.mjs';

const MAX_DOCX = 10 << 20;
function rawBody(req, max) {
  return new Promise((ok, no) => {
    const parts = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > max) { no(Object.assign(new Error('File lớn quá (tối đa 10 MB)'), { status: 413 })); req.destroy(); } else parts.push(c); });
    req.on('end', () => ok(Buffer.concat(parts))); req.on('error', no);
  });
}

const readCat = async f => { try { return JSON.parse(fs.readFileSync(new URL('../../assets/' + f, import.meta.url), 'utf8')); } catch { return []; } };
// bảng dựng lỗi không chặn việc lưu kịch bản (Kho đọc lỗi, catalog hỏng…): trả lỗi kèm kết quả
async function rebuild(dir, tl, captions, o = {}) { try { return await sheetFor(dir, { tl, captions, ...o }); } catch (e) { return { error: String(e.message || e).slice(0, 200), rows: [] }; } }

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
    if (p === '/api/script/sheet' && req.method === 'GET') return J({ sheet: readSheet(dir) });
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
      const sheet = await rebuild(dir, r.tl, r.pending ? captions : r.caps);
      return J({ ok: true, script: readScript(dir), captions: r.pending ? captions.length : r.caps.length, pending: !!r.pending, gate, sheet: sheet && { rows: sheet.rows.length, error: sheet.error } });
    }
    if (p === '/api/script/sheet') {
      const b = await ctx.body(req);
      if (!readScript(dir)) return J({ error: 'Dự án chưa có kịch bản' }, 400);
      const { timeline: tl, captions } = ctx.readProject();
      const sheet = await rebuild(dir, tl, captions, { stock: !!b.stock });
      return sheet.error ? J({ error: sheet.error }, 500) : J({ ok: true, sheet });
    }
    if (p === '/api/script/suggest') {
      const b = await ctx.body(req), text = typeof b.text === 'string' ? b.text : '';
      if (!text.trim()) return J({ error: 'Kịch bản đang trống' }, 400);
      if (text.length > 20000) return J({ error: 'Kịch bản dài quá để gợi ý dấu (tối đa 20 000 ký tự)' }, 400);
      const { timeline: tl } = ctx.readProject();
      const [music, sfx] = await Promise.all([readCat('music/catalog.json'), readCat('sfx/catalog.json')]);
      const prompt = suggestPrompt(text, { brand: tl.brand?.name || '', field: String(b.field || '').slice(0, 80), aspect: tl.width && tl.height ? (tl.width < tl.height ? 'dọc 9:16' : tl.width === tl.height ? 'vuông 1:1' : 'ngang 16:9') : '',
        moods: [...new Set(music.map(x => x.mood))], sfx: [...new Set(sfx.map(x => x.name.replace(/_d+$/, '')))] });
      const L = ctx.llm || await import('../../scripts/llm.mjs');
      let last = null;
      try {
        const out = await L.askJSON(prompt, { shape: 'object', retries: 1, model: 'sonnet', task: 'text', cwd: os.tmpdir(), timeout: 240000, timeoutMsg: 'Claude quá 4 phút chưa trả lời. Thử lại sau.',
          retryHint: m => `\n\nLần trước chưa dùng được (${m}). Giữ nguyên từng chữ nói, chỉ thêm dấu theo luật, trả về DUY NHẤT JSON {"text": "…"}.`,
          validate: v => { last = checkSuggested(text, typeof v?.text === 'string' ? v.text : ''); if (!last.ok) throw new Error(last.error); return last; } });
        if (out.text.length > MAX_TEXT) return J({ error: 'Kết quả dài quá' }, 400);
        return J({ ok: true, text: out.text, added: out.added });
      } catch (e) { return J({ error: last && !last.ok ? last.error : String(e.message || e).slice(0, 300) }, last && !last.ok ? 422 : 502); }
    }
    if (p === '/api/script/clear') {
      const caps = removeScript(dir); dropSheet(dir);
      if (caps) { const { timeline: tl } = ctx.readProject(); ctx.save({ timeline: tl, captions: caps }); }
      return J({ ok: true, restored: !!caps });
    }
  } catch (e) { return J({ error: String(e.message || e).slice(0, 300) }, e.status || 500); }
  return false;
};
