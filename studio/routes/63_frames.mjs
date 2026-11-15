// Missing video frames (M63). A project copied without work/frames (sample/clip-mau straight from the repo, a folder synced
// without its frames) previews and exports black. Spec: references/studio.md (API).
//   GET  /api/frames/check     -> [{seq, fps, src}] frame sequences of the timeline whose folder has no image yet;
//                                 src = the video it can be rebuilt from (clip audio or audio.voice), null if none is left
//   POST /api/frames/rebuild   job: re-extract those sequences with ffmpeg at the design size (720×1280 or 1280×720)
import fs from 'node:fs';
import path from 'node:path';

const VID = /\.(mp4|mov|m4v|mkv|webm)$/i, IMG = /\.(jpe?g|png)$/i;

export default ctx => {
  // Not ctx.under: it URL-decodes (for /project/ URLs) and "%05d" in a frame pattern would decode to a control character.
  const inProj = rel => {
    if (typeof rel !== 'string' || !rel || rel.includes('\0')) return null;
    const root = ctx.project.dir, p = path.resolve(root, rel.replace(/^\/+/, ''));
    return p.startsWith(root + path.sep) ? p : null;
  };
  function missing() {
    const tl = ctx.readProject().timeline, out = new Map();
    const add = (seq, fps, src) => {
      if (typeof seq !== 'string' || !/%0?\d*d/.test(seq) || out.has(seq)) return;
      const dir = inProj(path.dirname(seq)); if (!dir) return;
      let have = 0; try { have = fs.readdirSync(dir).filter(f => IMG.test(f)).length; } catch {}
      if (have) return; // partly there: not ours to redo
      const file = [src, tl.audio?.voice].find(f => typeof f === 'string' && VID.test(f) && (() => { const a = inProj(f); return a && fs.existsSync(a); })());
      out.set(seq, { seq, fps: +fps || +tl.fps || 30, src: file || null });
    };
    if (tl.aroll?.frames) add(tl.aroll.frames, tl.fps, tl.audio?.voice);
    for (const c of tl.clips || []) if (c?.src?.seq) add(c.src.seq, c.src.fps, c.audio);
    return [...out.values()];
  }
  async function rebuild() {
    const tl = ctx.readProject().timeline, list = missing().filter(m => m.src);
    if (!list.length) throw new Error('Không có chuỗi khung hình nào cần tạo lại, hoặc không còn video nguồn trong dự án');
    const W = (+tl.width || 1080) > (+tl.height || 1920) ? 1280 : 720, H = W === 720 ? 1280 : 720;
    for (const [k, m] of list.entries()) {
      ctx.job.step = `Tách khung hình ${k + 1}/${list.length} từ ${path.basename(m.src)}`; ctx.job.progress = k / list.length;
      const out = inProj(m.seq); fs.mkdirSync(path.dirname(out), { recursive: true });
      await ctx.run('ffmpeg', ['-v', 'error', '-y', '-i', inProj(m.src), '-vf', `fps=${m.fps},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`, '-q:v', '3', out]);
    }
    ctx.job.out = { rebuilt: list.map(m => m.seq) };
  }
  return async (req, res, p) => {
    if (p !== '/api/frames/check' && p !== '/api/frames/rebuild') return false;
    if (!ctx.project) { ctx.json(res, { error: 'Chưa mở dự án' }, 400); return true; }
    if (p === '/api/frames/check') { ctx.json(res, missing()); return true; }
    if (req.method !== 'POST') { ctx.json(res, { error: 'Chỉ nhận POST' }, 405); return true; }
    const ok = ctx.startJob('frames', rebuild, {});
    ctx.json(res, ok ? { ok } : { ok, error: 'Đang có tác vụ khác chạy' }, ok ? 200 : 409);
    return true;
  };
};
