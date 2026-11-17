// AI QC + A/B variants (references/qc-variants.md):
//   POST /api/qc/run {fix, claude, model, fresh}  → job "qc": scripts/ai_qc.mjs → .studio/qc.json
//   GET  /api/qc                                  → last report (+ backup flag)
//   POST /api/qc/quick {times, fix}               → job "qc_quick" (S13 · M105): scripts/qc_quick.mjs, kiểm hình học không Claude;
//                                                   fix = sửa bằng bộ giải QC rồi ghi timeline.json → .studio/qc_quick.json
//   GET  /api/qc/quick                            → kết quả QC nhanh gần nhất (+ stale khi timeline đã đổi)
//   GET  /api/qc/gate                             → cổng chặn xuất (scripts/export_gate.mjs): {blocked, hard, overridable, issues, override, stale}
//   POST /api/qc/override {reason}                → ghi lý do bỏ qua chặn xuất (chỉ lỗi claim / nguyên bản; lỗi chính sách → 400)
//   POST /api/qc/undo                             → restore .studio/qc_backup.json (timeline + captions as before the fix)
//   POST /api/variants/run {n, kind, export, quality} → job "variants": scripts/variants.mjs → <project>_v1.._vN + variants.json
//   GET  /api/variants                            → variants.json of this project (or of its base when a variant is open)
//   GET  /api/variants/file?dir=&f=               → a still / video inside one of the listed variant folders
//   POST /api/variants/open {dir}                 → open a listed variant (or the base) in the Studio
import fs from 'node:fs'; import path from 'node:path';
import { readGate, recordOverride, projectHash } from '../../scripts/export_gate.mjs';

export default ctx => {
  const S = f => path.join(ctx.SKILL, 'scripts', f);
  const readJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const progress = l => { const m = /^@@ ([\d.]+) (.*)$/.exec(l); if (m) { ctx.job.progress = +m[1]; ctx.job.step = m[2]; } else if (/^LỖI: /.test(l)) ctx.job.error = l.slice(5); };
  // variants.json of the open project, or of its base project when a variant is open
  const variantsFile = () => {
    const own = path.join(ctx.project.dir, 'variants.json');
    if (fs.existsSync(own)) return own;
    const tl = readJ(ctx.project.tlFile), base = tl?._variant?.base;
    return base && fs.existsSync(path.join(base, 'variants.json')) ? path.join(base, 'variants.json') : null;
  };
  const allowedDirs = () => { const f = variantsFile(); const v = f ? readJ(f) : null; return v ? [v.base, ...(v.variants || []).map(x => x.dir)].filter(Boolean).map(d => path.resolve(d)) : []; };
  return async (req, res, p, u) => {
    if (!p.startsWith('/api/qc') && !p.startsWith('/api/variants')) return false;
    if (!ctx.project) return ctx.json(res, { error: 'Chưa mở dự án' }, 404), true;
    const st = ctx.P('.studio'); fs.mkdirSync(st, { recursive: true });
    if (p === '/api/qc/run' && req.method === 'POST') {
      const b = await ctx.body(req);
      // only: qcKey ids of the suggestions the user accepted (fix just those); absent = fix everything fixable
      const keys = b.fix && Array.isArray(b.only) ? b.only.filter(k => typeof k === 'string' && k.length <= 200).slice(0, 300) : null;
      if (keys && !keys.length) return ctx.json(res, { ok: false, error: 'Chưa chọn gợi ý sửa nào' }, 400), true;
      const onlyFile = path.join(st, `qc_only_${Date.now()}.json`);
      const argv = [S('ai_qc.mjs'), ctx.project.dir, ...(b.fix ? ['--fix'] : []), ...(keys ? ['--only', onlyFile] : []), ...(b.claude === false ? ['--no-claude'] : []), ...(b.fresh ? ['--fresh'] : []), '--model', String(b.model || 'sonnet').replace(/[^\w.-]/g, '')];
      const ok = ctx.startJob('qc', async () => {
        ctx.job.step = 'Chuẩn bị kiểm tra';
        // written only once this job really starts (a refused run must not touch a running one's selection)
        if (keys) fs.writeFileSync(onlyFile, JSON.stringify(keys));
        try { await ctx.run('node', argv, progress).catch(e => { throw new Error(ctx.job.error || e.message); }); }
        finally { if (keys) fs.rmSync(onlyFile, { force: true }); }
        ctx.job.out = '.studio/qc.json';
      });
      return ctx.json(res, ok ? { ok } : { ok, error: 'Đang có tác vụ khác chạy' }, ok ? 200 : 409), true;
    }
    // S13 · M105: QC nhanh sau AI dựng giúp (tự chạy theo C16): 3 khung cho hộp "Đã dựng xong" + lỗi hình học, không gọi Claude
    if (p === '/api/qc/quick' && req.method === 'POST') {
      const b = await ctx.body(req);
      const times = (Array.isArray(b.times) ? b.times : []).map(Number).filter(t => Number.isFinite(t) && t >= 0).slice(0, 3).map(t => t.toFixed(2));
      const argv = [S('qc_quick.mjs'), ctx.project.dir, ...(times.length ? ['--times', times.join(',')] : []), ...(b.fix ? ['--fix'] : [])];
      const ok = ctx.startJob('qc_quick', async () => {
        ctx.job.step = b.fix ? 'Sửa vị trí graphic' : 'Kiểm tra nhanh';
        await ctx.run('node', argv, progress).catch(e => { throw new Error(ctx.job.error || e.message); });
        ctx.job.out = '.studio/qc_quick.json';
      });
      return ctx.json(res, ok ? { ok } : { ok, error: 'Đang có tác vụ khác chạy' }, ok ? 200 : 409), true;
    }
    if (p === '/api/qc/quick') {
      const r = readJ(path.join(st, 'qc_quick.json'));
      if (!r) return ctx.json(res, { none: true, error: 'Chưa kiểm tra nhanh' }), true;
      const stale = projectHash(ctx.project.dir) !== r.hash;
      return ctx.json(res, { ...r, stale }), true;
    }
    if (p === '/api/qc') {
      const r = readJ(path.join(st, 'qc.json'));
      // S16 M120: stale = timeline đã đổi sau lần QC (sau tự sửa thì so với hash_now): điểm Kiểm tra chỉ tin QC đầy đủ còn mới
      const ref = r && (r.hash_now ?? r.hash), now = ref ? projectHash(ctx.project.dir) : null;
      return ctx.json(res, r ? { ...r, stale: !!(ref && now && ref !== now), can_undo: fs.existsSync(path.join(st, 'qc_backup.json')) } : { none: true, error: 'Chưa kiểm tra' }), true;
    }
    if (p === '/api/qc/gate') return ctx.json(res, readGate(ctx.project.dir)), true;
    if (p === '/api/qc/override' && req.method === 'POST') {
      const b = await ctx.body(req);
      try { return ctx.json(res, recordOverride(ctx.project.dir, b.reason, { by: 'studio' })), true; }
      catch (e) { return ctx.json(res, { error: e.message }, 400), true; }
    }
    if (p === '/api/qc/undo' && req.method === 'POST') {
      const f = path.join(st, 'qc_backup.json'), b = readJ(f);
      if (!b?.timeline) return ctx.json(res, { error: 'Không có bản sao lưu trước khi sửa' }, 400), true;
      ctx.save({ timeline: b.timeline, captions: b.captions || [] });
      fs.renameSync(f, path.join(st, `qc_backup_undone_${Date.now()}.json`));
      const q = readJ(path.join(st, 'qc.json')); if (q) { q.undone = new Date().toISOString(); fs.writeFileSync(path.join(st, 'qc.json'), JSON.stringify(q, null, 1)); }
      return ctx.json(res, { ok: true }), true;
    }
    if (p === '/api/variants/run' && req.method === 'POST') {
      const b = await ctx.body(req);
      const n = Math.max(2, Math.min(5, +b.n || 3)), kind = ['hook', 'style', 'both'].includes(b.kind) ? b.kind : 'hook';
      const argv = [S('variants.mjs'), ctx.project.dir, '--n', String(n), '--kind', kind, ...(b.export ? ['--export', '--quality', b.quality === '1080' ? '1080' : '720'] : []), ...(b.claude === false ? ['--no-claude'] : [])];
      const ok = ctx.startJob('variants', async () => {
        ctx.job.step = 'Chuẩn bị tạo phiên bản';
        await ctx.run('node', argv, progress).catch(e => { throw new Error(ctx.job.error || e.message); });
        ctx.job.out = 'variants.json';
      });
      return ctx.json(res, ok ? { ok } : { ok, error: 'Đang có tác vụ khác chạy' }, ok ? 200 : 409), true;
    }
    if (p === '/api/variants') { const f = variantsFile(); return ctx.json(res, f ? { ...readJ(f), current: ctx.project.dir } : { none: true }), true; }
    if (p === '/api/variants/file') {
      const dir = path.resolve(u.searchParams.get('dir') || ''), rel = u.searchParams.get('f') || '';
      if (!allowedDirs().includes(dir)) return ctx.json(res, { error: 'forbidden' }, 403), true;
      const f = ctx.under(dir, rel);
      return f ? (ctx.sendFile(req, res, f), true) : (ctx.json(res, {}, 403), true);
    }
    if (p === '/api/variants/open' && req.method === 'POST') {
      const b = await ctx.body(req), dir = path.resolve(String(b.dir || ''));
      if (!allowedDirs().includes(dir)) return ctx.json(res, { error: 'Không phải phiên bản của dự án này' }, 403), true;
      ctx.openProject(dir);
      return ctx.json(res, { ok: true }), true;
    }
    return false;
  };
};
