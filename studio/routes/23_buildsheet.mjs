// Bảng dựng theo đoạn (S27 M194, docs/plans/S27-dung-theo-kich-ban.md mục 2.3–2.4; feature studio/features/23_buildsheet.js).
// Bảng là .studio/build_sheet.json (scripts/script_build.mjs, dựng khi lưu kịch bản ở route 19_script).
//   GET  /api/buildsheet                   → { sheet | null, script, applied[seg], moods[], sfx[], ai }   (ai: có khoá ảnh AI)
//   POST /api/buildsheet/cell {seg, field, i?, value}  → { ok, row }   sửa một ô (ô thành nguồn `user`); field lock: value true/false
//   POST /api/buildsheet/find {q, src?}    → { items: [{src, id, name, thumb?}] }   "Tìm khác" / "Chọn từ Kho" của ô B-roll
//   POST /api/buildsheet/fill              → { ok, n, sheet }   Claude lấp ô trống (một lần cho cả bảng; ô mark / user / hàng khoá giữ)
//   POST /api/buildsheet/apply {ai}        → { ok }   job `buildsheet`: node scripts/ai_edit.mjs --sheet (đưa media vào dự án,
//                                            planFromSheet, đặt né mặt) → .studio/sheet_plan.json; Studio áp ở trình duyệt (một ⌘Z)
//   GET  /api/buildsheet/plan              → kế hoạch của lần Áp gần nhất
// Như mọi /api/*, cần token phiên + cùng origin (studio/security.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readScript } from '../../scripts/script_doc.mjs';
import { appliedSegs, applyFill, cleanCell, editCell, fillPrompt, pickBroll, readSheet, sheetSources, writeSheet } from '../../scripts/script_build.mjs';

const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

export default ctx => async (req, res, p) => {
  if (p !== '/api/buildsheet' && !p.startsWith('/api/buildsheet/')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  try {
    if (!ctx.project) return J({ error: 'Chưa mở dự án' }, 400);
    const dir = ctx.project.dir, st = path.join(dir, '.studio');
    const cats = () => ({ music: readJSON(path.join(ctx.SKILL, 'assets/music/catalog.json')) || [], sfx: readJSON(path.join(ctx.SKILL, 'assets/sfx/catalog.json')) || [] });
    if (req.method === 'GET' && p === '/api/buildsheet') {
      const { timeline: tl } = ctx.readProject(), { music, sfx } = cats();
      let ai = false; try { const k = (await import('../../scripts/ai_broll.mjs')).readKeys(); ai = !!(k.openai || k.gemini); } catch { /* không có module */ }
      return J({ sheet: readSheet(dir), script: !!readScript(dir), applied: [...appliedSegs(tl)], moods: [...new Set(music.map(x => x.mood))], sfx: sfx.map(x => x.name), ai });
    }
    if (req.method === 'GET' && p === '/api/buildsheet/plan') {
      const plan = readJSON(path.join(st, 'sheet_plan.json'));
      return plan ? J(plan) : J({ error: 'Chưa có kế hoạch áp bảng dựng' }, 404);
    }
    if (req.method !== 'POST') return false;
    const b = await ctx.body(req);
    if (p === '/api/buildsheet/apply') {
      const sheet = readSheet(dir);
      if (!sheet?.rows?.length) return J({ error: 'Dự án chưa có bảng dựng (lưu kịch bản ở bước Nguồn trước)' }, 400);
      const S = f => path.join(ctx.SKILL, 'scripts', f);
      const ok = ctx.startJob('buildsheet', async () => {
        ctx.job.step = 'Chuẩn bị';
        await ctx.run('node', [S('ai_edit.mjs'), ctx.project.tlFile, '--sheet', ...(b.ai ? ['--ai'] : []), '--out', path.join(st, 'sheet_plan.json')], l => {
          const m = /^@@ ([\d.]+) (.*)$/.exec(l);
          if (m) { ctx.job.progress = +m[1]; ctx.job.step = m[2]; }
          else if (/^LỖI: /.test(l)) ctx.job.error = l.slice(5);
        }).catch(e => { throw new Error(ctx.job.error || e.message); });
        ctx.job.out = '.studio/sheet_plan.json';
      });
      return J(ok ? { ok } : { ok, error: 'Đang có tác vụ khác chạy' }, ok ? 200 : 409);
    }
    if (!readSheet(dir)) return J({ error: 'Dự án chưa có bảng dựng' }, 400);
    const { timeline: tl } = ctx.readProject();
    if (p === '/api/buildsheet/cell') {
      const seg = +b.seg, field = String(b.field || ''), i = b.i == null ? null : +b.i;
      let value = b.value;
      if (field !== 'lock') {
        const { music, sfx } = cats(), need = field === 'broll' && value?.src && ['kho', 'lib', 'dong'].includes(value.src);
        const srcs = need ? await sheetSources(dir, tl) : null;
        value = cleanCell(field, value, { moods: new Set(music.map(x => x.mood)), sfx: new Set(sfx.map(x => x.name)),
          kho: srcs && new Set(srcs.items.map(x => x.rel)), lib: srcs && new Set(srcs.libItems.map(x => x.id)), dyn: srcs && new Set(srcs.dyn.map(x => x.id)) });
        if (value?.error) return J({ error: value.error }, 400);
      }
      const sheet = readSheet(dir); // đọc ngay trước khi ghi (sau mọi await): hai lần sửa ô liền nhau không đè nhau
      const row = editCell(sheet, seg, field, value, i);
      if (row.error) return J({ error: row.error }, 400);
      writeSheet(dir, sheet);
      return J({ ok: true, row });
    }
    if (p === '/api/buildsheet/find') {
      const q = String(b.q || '').slice(0, 120), only = ['kho', 'lib', 'dong'].includes(b.src) ? b.src : null;
      const { src, items } = await sheetSources(dir, tl), none = new Set(), out = [];
      if (!only || only === 'kho') {
        const hits = q ? src.kho(q, none) : items.slice(0, 24).map(x => ({ rel: x.rel }));
        for (const h of hits.slice(0, only ? 24 : 6)) { const it = items.find(x => x.rel === h.rel); if (it) out.push({ src: 'kho', id: it.rel, name: it.name, kind: it.kind, used: !!it.used }); }
      }
      if (q && (!only || only === 'lib')) for (const h of src.lib(q, none)) out.push({ src: 'lib', id: h.id, name: h.title || h.file || h.id });
      if (q && (!only || only === 'dong')) for (const h of src.dyn(q)) out.push({ src: 'dong', id: h.id, name: h.id });
      return J({ items: out });
    }
    if (p === '/api/buildsheet/fill') {
      if (ctx.job?.state === 'running' && ctx.job.kind === 'buildsheet') return J({ error: 'Đang áp bảng dựng: chờ xong rồi dựng lại ô trống' }, 409);
      const { music, sfx } = cats(), moods = [...new Set(music.map(x => x.mood))], sheet = readSheet(dir);
      const { n, prompt } = fillPrompt(sheet, { moods, sfx: [...new Set(sfx.map(x => x.name))], brand: tl.brand?.name || '' });
      if (!n) return J({ ok: true, n: 0, sheet });
      const L = ctx.llm || await import('../../scripts/llm.mjs');
      let out;
      try {
        out = await L.askJSON(prompt, { shape: 'object', retries: 1, model: 'sonnet', task: 'text', cwd: os.tmpdir(), timeout: 180000, timeoutMsg: 'Claude quá 3 phút chưa trả lời. Thử lại sau.',
          validate: v => { if (!Array.isArray(v?.rows)) throw new Error('thiếu "rows"'); return v; } });
      } catch (e) { return J({ error: String(e.message || e).slice(0, 300) }, 502); }
      const { src } = await sheetSources(dir, tl), taken = new Set(), now = readSheet(dir) || sheet; // đọc lại: ô bạn sửa trong lúc chờ Claude giữ
      for (const r of now.rows) for (const x of r.broll || []) if (x.pick) taken.add(`${x.src}:${x.pick}`);
      const filled = await applyFill(now, out, { moods, sfx, pick: async q => { const c = await pickBroll(q, null, src, taken); if (c.pick) taken.add(`${c.src}:${c.pick}`); return c; } });
      writeSheet(dir, now);
      return J({ ok: true, n: filled, sheet: now });
    }
  } catch (e) { return J({ error: String(e.message || e).slice(0, 300) }, e.status || 500); }
  return false;
};
