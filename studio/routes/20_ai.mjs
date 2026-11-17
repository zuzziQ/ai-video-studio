// AI tools (references/ai-edit.md):
//   POST /api/ai/edit {goal,tone,pack,density,extra,skip?}  → job "ai": scripts/ai_edit.mjs (claude -p) writes .studio/ai_plan.json
//        S19 M134: thói quen đã học của thương hiệu của Kho chứa dự án đi kèm (opts.learned); skip = khoá thói quen tắt cho lần này
//   GET  /api/ai/habits                                → {id, name, learn, items:[{key, note, off}], active} của thương hiệu dự án
//   POST /api/ai/delivered {source:'ai'}               → lưu bản AI giao (.studio/ai_result.json) sau khi Studio áp kế hoạch và lưu
//   GET  /api/ai/plan                                  → that plan (the Studio applies it client-side, undoable)
//   POST /api/ai/fillers {words,pause,fillers,claude}  → scripts/fillers.py; with claude:true it runs as job "fillers", result at GET /api/ai/fillers
import fs from 'node:fs'; import path from 'node:path'; import { execFile } from 'node:child_process';
import { habitsFor, saveDelivered, getProfile } from '../../scripts/profile.mjs';
import { workspaceOfProject } from '../../scripts/workspace.mjs';

export default ctx => {
  const S = f => path.join(ctx.SKILL, 'scripts', f);
  const fillArgs = (b, inF, outF) => [S('fillers.py'), inF, outF, '--pause', String(+b.pause || .7),
    ...(b.fillers ? ['--fillers', String(b.fillers)] : []), ...(b.claude ? ['--claude'] : [])];
  // thương hiệu của dự án đang mở: Kho chứa dự án, không có thì TL.brand.kit, không có nữa thì Chung
  const brandOf = () => { try { return workspaceOfProject(ctx.project.dir, ctx.readProject().timeline).brand || 'chung'; } catch { return 'chung'; } };
  const keys = v => (Array.isArray(v) ? v : []).filter(k => typeof k === 'string' && k.length <= 64).slice(0, 50);
  return async (req, res, p) => {
    if (!p.startsWith('/api/ai/')) return false;
    if (!ctx.project) return ctx.json(res, { error: 'Chưa mở dự án' }, 404), true;
    const st = ctx.P('.studio'); fs.mkdirSync(st, { recursive: true });
    if (p === '/api/ai/habits') {
      const h = habitsFor(brandOf());
      return ctx.json(res, { id: h.id, name: h.name, learn: h.learn, items: h.items, active: h.active }), true;
    }
    if (p === '/api/ai/delivered' && req.method === 'POST') {
      const b = await ctx.body(req);
      return ctx.json(res, { ok: saveDelivered(ctx.project.dir, ['ai', 'template'].includes(b.source) ? b.source : 'ai') }), true;
    }
    if (p === '/api/ai/edit' && req.method === 'POST') {
      const b = await ctx.body(req);
      const o = { goal: String(b.goal || ''), tone: String(b.tone || ''), pack: String(b.pack || 'auto'), density: String(b.density || 'vua'), extra: String(b.extra || '').slice(0, 600) };
      // S19 M134: thói quen của thương hiệu (scripts/profile.mjs habitsFor) → ai_edit.mjs áp vào prompt và kết quả
      const h = habitsFor(brandOf(), { skip: keys(b.skip) }), a = h.adjust;
      if (h.active) {
        o.learned = { brand: h.name, notes: h.items.filter(i => !i.off && !keys(b.skip).includes(i.key)).map(i => i.note), extra: h.extra, drop: a.drop_src || [],
          music: a.music === 'off' ? 'off' : '', music_gain: a.music_gain || 0, caption_style: a.caption_style || '', dict: h.dict };
        if (a.ai_step) o.density = { day: 'vua', vua: 'thua' }[o.density] || o.density;
        if (a.pack && o.pack === 'auto') o.pack = a.pack;
      }
      // S19 M138: nhạc riêng của thương hiệu (Phong cách dựng → Nhạc nền = Nhạc trong Kho); thói quen "không nhạc" vẫn thắng
      try { const m = getProfile(brandOf()).music; if (typeof m === 'string' && (m === 'kho' || m.startsWith('kho:')) && o.learned?.music !== 'off') o.music_pick = m; } catch { /* phong cách lỗi: nhạc AI chọn */ }
      fs.writeFileSync(path.join(st, 'ai_opts.json'), JSON.stringify(o));
      fs.rmSync(path.join(st, 'ai_plan.json'), { force: true });
      const ok = ctx.startJob('ai', async () => {
        ctx.job.step = 'Chuẩn bị';
        await ctx.run('node', [S('ai_edit.mjs'), ctx.project.tlFile, '--opts', path.join(st, 'ai_opts.json'), '--out', path.join(st, 'ai_plan.json')], l => {
          const m = /^@@ ([\d.]+) (.*)$/.exec(l);
          if (m) { ctx.job.progress = +m[1]; ctx.job.step = m[2]; }
          else if (/^LỖI: /.test(l)) ctx.job.error = l.slice(5);
        }).catch(e => { throw new Error(ctx.job.error || e.message); });
        ctx.job.out = '.studio/ai_plan.json';
      });
      return ctx.json(res, { ok }), true;
    }
    if (p === '/api/ai/plan') {
      const f = path.join(st, 'ai_plan.json');
      return ctx.json(res, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { error: 'Chưa có bản dựng AI', none: true }), true;
    }
    if (p === '/api/ai/fillers' && req.method === 'POST') {
      const b = await ctx.body(req);
      const inF = path.join(st, 'fillers_in.json'), outF = path.join(st, 'fillers.json');
      // Same shape fillers.py reads (captions with .words, or a flat word list); a word without numeric s/e used to come back as a Python traceback (500).
      if (b.words != null) {
        if (!Array.isArray(b.words)) return ctx.json(res, { error: 'words phải là danh sách' }, 400), true;
        const flat = b.words.length && b.words[0] && 'words' in b.words[0] ? b.words.flatMap(c => (Array.isArray(c?.words) ? c.words : [null])) : b.words;
        if (!flat.every(w => w && typeof w === 'object' && (!String(w.w ?? '').trim() || (Number.isFinite(w.s) && Number.isFinite(w.e)))))
          return ctx.json(res, { error: 'Mỗi từ cần {w, s, e} với s, e là số giây' }, 400), true;
      }
      fs.writeFileSync(inF, JSON.stringify(Array.isArray(b.words) ? b.words : ctx.readProject().captions));
      fs.rmSync(outF, { force: true });
      if (b.claude) {
        const ok = ctx.startJob('fillers', async () => {
          ctx.job.step = 'Dò lỗi nói + hỏi Claude câu nói hỏng (20–60 giây)'; ctx.job.progress = .2;
          await ctx.run(ctx.PY, ['-I', '-X', 'utf8', ...fillArgs(b, inF, outF)]);
          ctx.job.out = '.studio/fillers.json';
        });
        return ctx.json(res, { ok, job: true }), true;
      }
      return await new Promise(ok => execFile(ctx.PY, ['-I', '-X', 'utf8', ...fillArgs(b, inF, outF)], (e, out, err) => {
        let r = null;
        if (!e) try { r = JSON.parse(fs.readFileSync(outF, 'utf8')); } catch (x) { err = 'fillers.py không ghi được kết quả: ' + x.message; }
        ctx.json(res, r || { error: (err || e?.message || '').slice(-400) }, r ? 200 : 500); ok(true);
      }));
    }
    if (p === '/api/ai/fillers') {
      const f = path.join(st, 'fillers.json');
      return ctx.json(res, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { error: 'Chưa có kết quả', none: true }), true;
    }
    return false;
  };
};
