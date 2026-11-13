// Mô hình & giọng (M26, M27): chọn nhà cung cấp LLM cho việc chỉ có chữ, và giọng VieNeu (máy chủ trên máy).
//   GET  /api/engines                      cấu hình hiện tại (không có khoá/token nào: chỉ khoá "llm" và "tts" của config.json)
//   GET  /api/engines/status               Ollama có chạy + model nào; VieNeu có chạy + 10 giọng có sẵn (chỉ gọi 127.0.0.1)
//   POST /api/engines/llm {text, fallback, url, model}         ghi khoá llm (url chỉ loopback)
//   POST /api/engines/llm/try {provider?}  một lần hỏi JSON ngắn (như `node scripts/llm.mjs try`) → {ok, provider, sec, result|error}
//   POST /api/engines/voice {url, voice, default_engine}        ghi khoá tts (url chỉ loopback; voice phải là giọng có sẵn)
//   POST /api/engines/voice/start          bật máy chủ VieNeu (python scripts/tts.py vieneu-start)
//   POST /api/engines/voice/preview {voice, text?}              đọc thử một câu ngắn bằng VieNeu → audio/wav
// Không nhái giọng (chờ C04). Ghi config.json: gộp vào file, giữ mọi khoá khác, quyền 600 (llm.mjs, tts_config.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MODEL_RE = /^[\w.:/-]{1,100}$/;
const PREVIEW_TEXT = 'Xin chào, đây là giọng đọc thử của AI Video Studio.';
const TRY_PROMPT = 'Trả về DUY NHẤT JSON {"ok": true, "loi_chao": "<một câu chào tiếng Việt ngắn>"}';
const bad = (m, status = 400) => Object.assign(new Error(m), { status });

export default ctx => {
  let L = null, T = null, busy = { try: false, start: false, preview: false };
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
  const voicesOf = h => (h?.voices || []).filter(v => v && typeof v.name === 'string').slice(0, 50)
    .map(v => ({ name: v.name, gender: v.gender || null, region: v.region || null, style: v.style || null }));
  async function vieneuStatus() {
    const t = T.ttsConfig(), h = await T.vieneuHealth(t.vieneu.url), vp = T.readConfig().tts?.vieneu?.python;
    return { url: t.vieneu.url, running: !!h?.ready, loaded: !!h?.loaded, voices: voicesOf(h), default: h?.default || null,
      installed: !!(vp && fs.existsSync(vp)), clone: false };
  }

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
        if (b.voice) { // máy chủ đang chạy: tên phải nằm trong 10 giọng có sẵn (không nhận giọng nhái)
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
    return false;
  };
};
