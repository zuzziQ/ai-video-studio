// Missing video frames (M63). A project copied without work/frames (sample/clip-mau straight from the repo, a folder synced
// without its frames) previews and exports black. Spec: references/studio.md (API).
//   GET  /api/frames/check     -> [{seq, fps, src}] frame sequences of the timeline whose folder has no image yet;
//                                 src = the video it can be rebuilt from (clip audio or audio.voice), null if none is left
//   POST /api/frames/rebuild   job: re-extract those sequences with ffmpeg at the design size (720×1280 or 1280×720)
// S29 M213: khung xem trước 540p (engine/preview_proxy.js), chỉ cho preview của Studio, render vẫn đọc chuỗi gốc.
//   GET  /api/frames/proxy?pref=auto|on|off -> {on, profile, chromeMode, map: {chuỗi gốc: chuỗi 540p đã trích đủ}, pending: [chuỗi]}
//                                 on = PreviewProxy.wanted (pref thắng; auto = profile tiet-kiem hoặc Chrome render SwiftShader)
//   POST /api/frames/proxy      trích lười các chuỗi còn thiếu, chạy nền ở mức ưu tiên thấp, không chiếm job chung
//                                 (render, video mới vẫn chạy được) và không vào scripts/queue.mjs → {started: [chuỗi]}
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { rmSync } from '../../scripts/fs_rm.mjs';
import { createRequire } from 'node:module';
import { resolvePerf, lowerPriority } from '../../scripts/perf_profile.mjs';
import { gpuWanted } from '../../scripts/render_hw.mjs';

const PP = createRequire(import.meta.url)('../../engine/preview_proxy.js');

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
  // ---- S29 M213: chuỗi 540p ----
  const busy = new Map(); // thư mục 540p tuyệt đối → 'running' | 'error'
  const jpgs = dir => { try { return fs.readdirSync(dir).filter(f => IMG.test(f)).sort(); } catch { return []; } };
  function proxies() {
    const tl = ctx.readProject().timeline, seqs = new Set();
    if (tl.aroll?.frames) seqs.add(tl.aroll.frames);
    for (const c of tl.clips || []) if (c?.src?.seq) seqs.add(c.src.seq);
    const out = [];
    for (const seq of seqs) {
      const px = PP.proxySeq(seq), src = PP.isSeq(seq) && inProj(path.dirname(seq)), dst = px && inProj(path.dirname(px));
      if (!src || !dst) continue;
      const files = jpgs(src), have = files.length;
      if (!have) continue; // chuỗi gốc chưa có: việc của /api/frames/rebuild
      // chuỗi gốc trích lại (Video mới, /api/frames/rebuild) thì khung đầu đổi mtime → bản 540p cũ không còn khớp
      const mtime = Math.round(fs.statSync(path.join(src, files[0])).mtimeMs);
      let ok = null; try { ok = JSON.parse(fs.readFileSync(path.join(dst, PP.OK), 'utf8')); } catch {}
      const state = busy.get(dst) || (ok?.count === have && ok?.mtime === mtime ? 'ready' : 'missing');
      out.push({ seq, proxy: px, src, dst, files, mtime, state });
    }
    return out;
  }
  function extract(m) {
    const { files } = m, first = +(/(\d+)\.\w+$/.exec(files[0])?.[1] ?? 1);
    busy.set(m.dst, 'running');
    rmSync(m.dst, { recursive: true, force: true }); fs.mkdirSync(m.dst, { recursive: true });
    const base = path.basename(m.seq), p = spawn('ffmpeg', PP.ffArgs(path.join(m.src, base), path.join(m.dst, base), first), { windowsHide: true, stdio: 'ignore' });
    lowerPriority(p.pid, 'below_normal');
    const fail = () => busy.set(m.dst, 'error');
    p.on('error', fail);
    p.on('close', code => {
      const n = jpgs(m.dst).length;
      if (code !== 0 || n !== files.length) return fail();
      fs.writeFileSync(path.join(m.dst, PP.OK), JSON.stringify({ count: n, mtime: m.mtime, q: PP.Q, short: PP.SHORT }));
      busy.delete(m.dst);
    });
  }
  function proxyInfo(pref) {
    let profile = null; try { profile = resolvePerf().profile; } catch {}
    const chromeMode = gpuWanted() ? 'gpu' : 'swiftshader', list = proxies();
    return { on: PP.wanted({ pref, profile, chromeMode }), profile, chromeMode,
      map: Object.fromEntries(list.filter(m => m.state === 'ready').map(m => [m.seq, m.proxy])),
      pending: list.filter(m => m.state !== 'ready').map(m => ({ seq: m.seq, state: m.state })) };
  }

  return async (req, res, p) => {
    if (p === '/api/frames/proxy') {
      if (!ctx.project) { ctx.json(res, { error: 'Chưa mở dự án' }, 400); return true; }
      if (req.method === 'POST') {
        const todo = proxies().filter(m => m.state === 'missing' || m.state === 'error');
        for (const m of todo) extract(m);
        ctx.json(res, { started: todo.map(m => m.seq) }); return true;
      }
      const pref = new URL(req.url, 'http://x').searchParams.get('pref');
      ctx.json(res, proxyInfo(['on', 'off'].includes(pref) ? pref : 'auto')); return true;
    }
    if (p !== '/api/frames/check' && p !== '/api/frames/rebuild') return false;
    if (!ctx.project) { ctx.json(res, { error: 'Chưa mở dự án' }, 400); return true; }
    if (p === '/api/frames/check') { ctx.json(res, missing()); return true; }
    if (req.method !== 'POST') { ctx.json(res, { error: 'Chỉ nhận POST' }, 405); return true; }
    const ok = ctx.startJob('frames', rebuild, {});
    ctx.json(res, ok ? { ok } : { ok, error: 'Đang có tác vụ khác chạy' }, ok ? 200 : 409);
    return true;
  };
};
