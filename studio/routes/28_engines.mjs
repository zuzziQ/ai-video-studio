// Mô hình & giọng (M26, M27): chọn nhà cung cấp LLM cho việc chỉ có chữ, và giọng VieNeu (máy chủ trên máy).
//   GET  /api/engines                      cấu hình hiện tại (không có khoá/token nào: chỉ khoá "llm" và "tts" của config.json)
//   GET  /api/engines/status               Ollama có chạy + model nào; VieNeu có chạy + 10 giọng có sẵn (chỉ gọi 127.0.0.1)
//   POST /api/engines/llm {text, fallback, url, model}         ghi khoá llm (url chỉ loopback)
//   POST /api/engines/llm/try {provider?}  một lần hỏi JSON ngắn (như `node scripts/llm.mjs try`) → {ok, provider, sec, result|error}
//   POST /api/engines/voice {url, voice, default_engine}        ghi khoá tts (url chỉ loopback; voice phải là giọng có sẵn)
//   POST /api/engines/voice/start          bật máy chủ VieNeu (python scripts/tts.py vieneu-start)
//   POST /api/engines/voice/preview {voice, text?}              đọc thử một câu ngắn bằng VieNeu → audio/wav
//   POST /api/engines/voice/clone?name=&consent=1&start=&ext=  body thô = file mẫu (≤ 50 MB), header X-AVS-Consent-Note (tuỳ chọn,
//                                          encodeURIComponent) → giọng nhái (tts.py vieneu-clone)
//   POST /api/engines/voice/rm {name}      xoá giọng nhái
// Nhái giọng (C04 đã chốt cho dùng) bắt buộc xác nhận quyền dùng giọng. Ghi config.json: gộp vào file, giữ mọi khoá khác,
// quyền 600 (llm.mjs, tts_config.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MODEL_RE = /^[\w.:/-]{1,100}$/;
const VOICE_NAME_RE = /^[\p{L}\p{N}_][\p{L}\p{N}_ .-]{0,39}$/u; // khớp NAME_RE của vieneu_server.py
const CLONE_MAX_BYTES = 50 * 1024 * 1024;
const CLONE_EXT = new Set(['wav', 'mp3', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'webm', 'mp4', 'mov', 'mkv']);
const PREVIEW_TEXT = 'Xin chào, đây là giọng đọc thử của AI Video Studio.';
const TRY_PROMPT = 'Trả về DUY NHẤT JSON {"ok": true, "loi_chao": "<một câu chào tiếng Việt ngắn>"}';
const bad = (m, status = 400) => Object.assign(new Error(m), { status });

export default ctx => {
  let L = null, T = null, busy = { try: false, start: false, preview: false, clone: false };
  const mods = async () => {
    L ||= await import(pathToFileURL(path.join(ctx.SKILL, 'scripts/llm.mjs')).href);
    T ||= await import(pathToFileURL(path.join(ctx.SKILL, 'scripts/tts_config.mjs')).href);
    return { L, T };
  };
  const TTS = () => path.join(ctx.SKILL, 'scripts/tts.py');
  const py = (argv, timeout) => new Promise(ok => execFile(ctx.PY, ['-I', '-X', 'utf8', TTS(), ...argv], { timeout, windowsHide: true, maxBuffer: 1 << 20 },
    (e, out, err) => ok({ code: e ? (e.code ?? 1) : 0, out: String(out || ''), err: String(err || ''), killed: !!e?.killed })));
  const lastLine = s => s.trim().split(/\r?\n/).filter(Boolean).pop() || '';
  // Chỉ đưa ra những trường cần cho giao diện: không đường dẫn python, không khoá nào khác của config.json.
  async function view() {
    const { L, T } = await mods(), c = L.llmConfig(), t = T.ttsConfig(), env = process.env;
    return {
      llm: { text: c.text, fallback: c.fallback, providers: L.PROVIDERS, ollama: { url: c.ollama.url, model: c.ollama.model },
        env: { text: !!env.AVS_LLM_TEXT, fallback: env.AVS_LLM_FALLBACK != null, url: !!env.OLLAMA_HOST, model: !!env.AVS_OLLAMA_MODEL } },
      tts: { default_engine: t.default_engine, engines: T.ENGINES, vieneu: { url: t.vieneu.url, voice: t.vieneu.voice }, env: { url: t.env_url } },
      platform: process.platform,
    };
  }
  async function ollamaStatus(url, model) {
    let u; try { u = L.loopbackUrl(url); } catch (e) { return { reachable: false, error: e.message }; }
    try {
      const r = await fetch(u + '/api/tags', { signal: AbortSignal.timeout(2500), redirect: 'error' });
      const models = ((await r.json()).models || []).map(m => String(m.name || '')).filter(Boolean).slice(0, 200);
      return { reachable: true, models, has_model: models.some(m => m === model || m === model + ':latest') };
    } catch (e) { return { reachable: false, error: String(e.cause?.code || e.name || e.message) }; }
  }
  const voicesOf = h => (h?.voices || []).filter(v => v && typeof v.name === 'string').slice(0, 200) // 10 có sẵn + ≤ 50 giọng nhái
    .map(v => ({ name: v.name, gender: v.gender || null, region: v.region || null, style: v.style || null, kind: v.kind === 'clone' ? 'clone' : 'preset' }));
  async function vieneuStatus() {
    const t = T.ttsConfig(), h = await T.vieneuHealth(t.vieneu.url), vp = T.readConfig().tts?.vieneu?.python;
    return { url: t.vieneu.url, running: !!h?.ready, loaded: !!h?.loaded, voices: voicesOf(h), default: h?.default || null,
      installed: !!(vp && fs.existsSync(vp)), clone: !!h?.clone };
  }
  // Ghi body thô ra file tạm. Luôn settle (kể cả khi client huỷ giữa chừng) để finally xoá file tạm và nhả busy.
  // Quá giới hạn (dù Content-Length khai ít hơn) → cắt kết nối, không đọc tiếp.
  const saveUpload = (req, file, max) => new Promise((ok, bad) => {
    let n = 0, done = false; const w = fs.createWriteStream(file);
    const fail = e => { if (done) return; done = true; req.unpipe(w); w.destroy(); bad(e); };
    req.on('data', c => { n += c.length; if (n > max) { fail(Object.assign(new Error('File mẫu quá lớn (tối đa 50 MB)'), { status: 413 })); req.destroy(); } });
    req.on('aborted', () => fail(Object.assign(new Error('Đã huỷ gửi file'), { status: 400 })));
    req.on('close', () => { if (!req.complete) fail(Object.assign(new Error('Đã huỷ gửi file'), { status: 400 })); });
    req.on('error', fail); w.on('error', fail);
    w.on('finish', () => { if (!done) { done = true; ok(n); } });
    req.pipe(w);
  });

  return async (req, res, p) => {
    if (!p.startsWith('/api/engines')) return false;
    await mods();
    if (p === '/api/engines' && req.method === 'GET') { ctx.json(res, await view()); return true; }
    if (p === '/api/engines/status' && req.method === 'GET') {
      const c = L.llmConfig();
      const [ollama, vieneu] = await Promise.all([ollamaStatus(c.ollama.url, c.ollama.model), vieneuStatus()]);
      ctx.json(res, { ollama, vieneu }); return true;
    }
    if (req.method !== 'POST') return false;

    if (p === '/api/engines/llm') {
      const b = await ctx.body(req), patch = {};
      if (b.text !== undefined) { if (!L.PROVIDERS.includes(b.text)) throw bad('Nhà cung cấp phải là: ' + L.PROVIDERS.join(', ')); patch.text = b.text; }
      if (b.fallback !== undefined) patch.fallback = b.fallback === 'claude' ? 'claude' : '';
      const o = {};
      if (b.url !== undefined && b.url !== '') { try { o.url = L.loopbackUrl(b.url); } catch (e) { throw bad(e.message); } }
      if (b.model !== undefined && b.model !== '') { if (typeof b.model !== 'string' || !MODEL_RE.test(b.model)) throw bad('Tên model không hợp lệ (vd qwen2.5:7b)'); o.model = b.model; }
      if (Object.keys(o).length) patch.ollama = o;
      L.saveLlmConfig(patch);
      ctx.json(res, await view()); return true;
    }
    if (p === '/api/engines/llm/try') {
      const b = await ctx.body(req);
      const provider = b.provider === undefined || b.provider === '' ? undefined : b.provider;
      if (provider && !L.PROVIDERS.includes(provider)) throw bad('Nhà cung cấp không hợp lệ');
      if (busy.try) throw bad('Đang thử, đợi lần trước xong', 409);
      busy.try = true;
      let proc = null; const onClose = () => { if (!res.writableEnded) proc?.kill?.(); };
      res.on('close', onClose);
      const t0 = Date.now();
      try {
        const r = await L.runLLM(TRY_PROMPT, { task: 'text', provider, model: 'haiku', timeout: 120000, jsonShape: 'object', cwd: os.tmpdir(), onProc: h => (proc = h) });
        let result = null, parseError = '';
        try { result = L.parseLooseJSON(r.text, { shape: 'object' }); } catch (e) { parseError = e.message; }
        ctx.json(res, { ok: !parseError, provider: r.provider, sec: Math.round((Date.now() - t0) / 100) / 10, ...(r.fallbackFrom ? { fallbackFrom: r.fallbackFrom } : {}),
          ...(parseError ? { error: 'Trả lời không phải JSON: ' + parseError, raw: String(r.text || '').slice(0, 300) } : { result }) });
      } catch (e) {
        ctx.json(res, { ok: false, provider: L.pickProvider({ task: 'text', provider }), sec: Math.round((Date.now() - t0) / 100) / 10, kind: e.kind || 'error', error: e.message });
      } finally { busy.try = false; res.off('close', onClose); }
      return true;
    }
    if (p === '/api/engines/voice') {
      const b = await ctx.body(req), patch = {};
      if (b.url !== undefined && b.url !== '') { try { patch.url = L.loopbackUrl(b.url); } catch (e) { throw bad(e.message); } }
      if (b.default_engine !== undefined) patch.default_engine = b.default_engine;
      if (b.voice !== undefined) {
        patch.voice = b.voice;
        if (b.voice) { // máy chủ đang chạy: tên phải là giọng có sẵn hoặc giọng nhái đã tạo
          const names = voicesOf(await T.vieneuHealth(patch.url)).map(v => v.name);
          if (names.length && !names.includes(b.voice)) throw bad('VieNeu không có giọng này. Giọng có sẵn: ' + names.join(', '));
        }
      }
      T.saveTtsConfig(patch);
      ctx.json(res, await view()); return true;
    }
    if (p === '/api/engines/voice/start') {
      await ctx.body(req);
      if (busy.start) throw bad('Đang bật máy chủ giọng', 409);
      busy.start = true;
      try {
        const r = await py(['vieneu-start', '--wait', '120'], 150000);
        const msg = lastLine(r.code ? r.err || r.out : r.out);
        ctx.json(res, r.code ? { ok: false, error: r.killed ? 'Máy chủ VieNeu chưa trả lời sau 150 giây' : msg || 'Không bật được máy chủ VieNeu' } : { ok: true, msg, vieneu: await vieneuStatus() });
      } finally { busy.start = false; }
      return true;
    }
    if (p === '/api/engines/voice/preview') {
      const b = await ctx.body(req);
      const text = String(b.text || PREVIEW_TEXT).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200) || PREVIEW_TEXT;
      const st = await vieneuStatus();
      if (!st.running) throw bad('Máy chủ giọng VieNeu chưa chạy. Bấm "Bật máy chủ" trước.', 409);
      const names = st.voices.map(v => v.name), voice = b.voice || T.ttsConfig().vieneu.voice || st.default || names[0];
      if (!voice || typeof voice !== 'string' || (names.length && !names.includes(voice))) throw bad('Chọn một giọng có sẵn');
      if (busy.preview) throw bad('Đang đọc thử câu trước', 409);
      busy.preview = true;
      const out = path.join(os.tmpdir(), `avs-voice-${crypto.randomBytes(6).toString('hex')}.wav`);
      try {
        const r = await py(['say', '--engine', 'vieneu', '--voice', voice, '--lang', 'vi', '--out', out, '--', text], 300000) // '--': câu bắt đầu bằng '-' không thành tuỳ chọn;
        const tl = r.out.split(/\r?\n/).find(l => l.startsWith('TTS ')), info = tl ? JSON.parse(tl.slice(4)) : null;
        if (r.code || !info?.file || info.engine !== 'vieneu' || !fs.existsSync(info.file)) throw bad(lastLine(r.err) || 'VieNeu không đọc được câu này', 502);
        const wav = fs.readFileSync(info.file);
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length, 'Cache-Control': 'no-store', 'X-AVS-Voice': encodeURIComponent(voice) });
        res.end(wav);
      } finally {
        busy.preview = false;
        for (const f of [out, out.replace(/\.wav$/, '') + '.wav']) fs.rmSync(f, { force: true });
      }
      return true;
    }
    if (p === '/api/engines/voice/clone') {
      const u = new URL(req.url, 'http://x'), q = k => String(u.searchParams.get(k) || '');
      const name = q('name').normalize('NFC').trim(), ext = q('ext').toLowerCase().replace(/^\./, '') || 'wav';
      // trần riêng 50 MB theo Content-Length (UPLOAD_ROUTES chỉ chặn ở mức upload chung): trả 413 trước khi đọc body
      if (+(req.headers['content-length'] || 0) > CLONE_MAX_BYTES) { res.setHeader('Connection', 'close'); throw bad('File mẫu quá lớn (tối đa 50 MB)', 413); }
      if (q('consent') !== '1') { req.resume(); throw bad('Cần xác nhận bạn là chủ giọng hoặc đã được chủ giọng đồng ý'); }
      if (!VOICE_NAME_RE.test(name)) { req.resume(); throw bad('Tên giọng 1–40 ký tự: chữ, số, khoảng trắng, . - _'); }
      if (!CLONE_EXT.has(ext)) { req.resume(); throw bad('Định dạng file mẫu không hỗ trợ: ' + ext); }
      const start = Math.max(0, Math.min(36000, +q('start') || 0));
      if (busy.clone) { req.resume(); throw bad('Đang tạo một giọng nhái khác', 409); }
      busy.clone = true;
      const tmp = path.join(os.tmpdir(), `avs-clone-${crypto.randomBytes(6).toString('hex')}.${ext}`);
      try {
        await saveUpload(req, tmp, CLONE_MAX_BYTES);
        const st = await vieneuStatus();
        if (!st.running) throw bad('Máy chủ giọng VieNeu chưa chạy. Bấm "Bật máy chủ" trước.', 409);
        // ghi chú đồng ý đi trong header (không nằm trong URL/log); dạng --opt=giá trị để chữ bắt đầu bằng '-' không thành tuỳ chọn
        let note = ''; try { note = decodeURIComponent(String(req.headers['x-avs-consent-note'] || '')); } catch { /* giữ rỗng */ }
        note = note.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 300);
        const r = await py(['vieneu-clone', `--name=${name}`, `--audio=${tmp}`, '--consent', `--start=${start}`, `--note=${note}`], 900000);
        const cl = r.out.split(/\r?\n/).find(l => l.startsWith('CLONE ')), info = cl ? JSON.parse(cl.slice(6)) : null;
        if (r.code || !info) throw bad(lastLine(r.err) || 'Không tạo được giọng nhái', 502);
        ctx.json(res, { ok: true, ...info, vieneu: await vieneuStatus() });
      } finally { busy.clone = false; fs.rmSync(tmp, { force: true }); }
      return true;
    }
    if (p === '/api/engines/voice/rm') {
      const b = await ctx.body(req), name = String(b.name || '');
      const st = await vieneuStatus();
      if (!st.running) throw bad('Máy chủ giọng VieNeu chưa chạy', 409);
      if (!st.voices.some(v => v.kind === 'clone' && v.name === name)) throw bad('Không có giọng nhái này', 404);
      const r = await py(['vieneu-voice-rm', `--name=${name}`], 30000);
      if (r.code) throw bad(lastLine(r.err) || 'Không xoá được giọng nhái', 502);
      ctx.json(res, { ok: true, vieneu: await vieneuStatus(), cfg: await view() }); return true;
    }
    return false;
  };
};
