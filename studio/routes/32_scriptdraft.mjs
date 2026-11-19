// S27 M191 · Kịch bản → mẫu dựng sẵn, trước khi quay (scripts/script_draft.mjs; feature studio/features/32_scriptdraft.js).
// Không cần dự án đang mở: bản nháp nằm ở ~/.ai-video-studio/drafts/<id>/ (draft.json, result.json, v1..v3 = 3 phương án, shots.txt).
//   POST /api/draft {text, name, brand, aspect: 9:16|16:9|1:1, wps: 2.0–3.4} → { ok, id, item, est: {segments, duration} }
//                                    xếp job nền `script_draft` (Claude dựng 3 phương án, kiểm engine + QC, chụp khung tĩnh)
//   GET  /api/draft/list             → { drafts: [{id, name, brand, aspect, created, state}] }  5 bản mới nhất
//   GET  /api/draft?id=              → { draft, job, result }   job: việc hàng đợi mới nhất của bản nháp; result: result.json
//   GET  /api/draft/still?id=&v=&n=  → ảnh khung tĩnh n của phương án v (thẻ <img>: avsUrl)
//   GET  /api/draft/shots?id=        → danh sách quay (text/plain, tải về .txt)
//   POST /api/draft/use {id, v}      → { ok, dir }  chép phương án v vào Du an/ của Kho thương hiệu rồi mở (client tải lại trang)
//   POST /api/draft/template {id, v, name} → { ok, id }  lưu thành mẫu người dùng có brand_id của bản nháp (M189)
// Mọi id kiểm bằng DRAFT_ID, v là 1..3, n là 1..6: không nhận đường dẫn từ client.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseScript, MAX_TEXT } from '../../scripts/script_doc.mjs';
import { ASPECTS, DRAFT_ID, VARIANTS, clampWps, draftDir, draftsDir, estimateTimes, resultFile, saveTemplateFile, shotList, toTemplate } from '../../scripts/script_draft.mjs';
import { addItem, loadQueue } from '../../scripts/queue.mjs';

const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(o, null, 1)); fs.renameSync(t, f); };
const same = (a, b) => path.resolve(String(a || '')).toLowerCase() === path.resolve(String(b || '')).toLowerCase();
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
export function lastJob(dir) { try { return loadQueue().items.filter(x => x.kind === 'script_draft' && same(x.input, dir)).pop() || null; } catch { return null; } }
const jobView = j => j && { id: j.id, state: j.state, step: j.step, progress: j.progress, error: j.error };
const varDir = (id, v) => { const k = +v; if (!Number.isInteger(k) || k < 1 || k > VARIANTS.length) throw bad('Phương án không hợp lệ'); return path.join(draftDir(id), `v${k}`); };

/** Kiểm đầu vào của POST /api/draft (hàm thuần cho test). known = id các thương hiệu đang có. → { draft } | lỗi có status */
export function checkDraftInput(b, known = () => false) {
  const text = typeof b?.text === 'string' ? b.text : '';
  if (!text.trim()) throw bad('Dán kịch bản hoặc thả file .docx / Excel trước');
  if (text.length > MAX_TEXT) throw bad(`Kịch bản dài quá (${text.length} ký tự, tối đa ${MAX_TEXT})`);
  const segs = parseScript(text); if (!segs.length) throw bad('Kịch bản không có chữ để nói');
  const brand = typeof b.brand === 'string' ? b.brand : '';
  if (brand && !(Array.isArray(known) ? known.includes(brand) : known(brand))) throw bad('Không thấy thương hiệu', 404);
  const aspect = ASPECTS[b.aspect] ? b.aspect : '9:16', wps = clampWps(b.wps);
  const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 80) || segs[0].say.split(/\s+/).slice(0, 8).join(' ');
  return { draft: { text, name, brand, aspect, wps }, est: estimateTimes(segs, { wps }) };
}

export default ctx => async (req, res, p) => {
  if (p !== '/api/draft' && !p.startsWith('/api/draft/')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  const q = new URL(req.url, 'http://x').searchParams;
  try {
    if (req.method === 'GET') {
      if (p === '/api/draft/list') {
        let ids = []; try { ids = fs.readdirSync(draftsDir()).filter(f => DRAFT_ID.test(f)); } catch { /* chưa có bản nháp */ }
        const drafts = ids.map(id => ({ id, d: readJSON(path.join(draftDir(id), 'draft.json')), r: readJSON(resultFile(draftDir(id))) })).filter(x => x.d)
          .sort((a, b) => String(b.d.created).localeCompare(String(a.d.created))).slice(0, 5)
          .map(({ id, d, r }) => ({ id, name: d.name, brand: d.brand, aspect: d.aspect, created: d.created, state: r?.state || lastJob(draftDir(id))?.state || 'queued' }));
        return J({ drafts });
      }
      const id = q.get('id'), dir = draftDir(id), d = readJSON(path.join(dir, 'draft.json'));
      if (!d) return J({ error: 'Không thấy bản nháp' }, 404);
      if (p === '/api/draft') { const { text, ...draft } = d; return J({ draft: { ...draft, chars: text.length }, job: jobView(lastJob(dir)), result: readJSON(resultFile(dir)) }); }
      if (p === '/api/draft/still') {
        const n = +q.get('n'); if (!Number.isInteger(n) || n < 1 || n > 6) return J({ error: 'Khung không hợp lệ' }, 400);
        ctx.sendFile(req, res, path.join(varDir(id, q.get('v')), '.studio', 'draft_stills', `${n}.jpg`)); return true;
      }
      if (p === '/api/draft/shots') {
        let t = ''; try { t = fs.readFileSync(path.join(dir, 'shots.txt'), 'utf8'); } catch { return J({ error: 'Chưa có danh sách quay (đợi dựng xong)' }, 404); }
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="danh-sach-quay.txt"; filename*=UTF-8''${encodeURIComponent(`Danh sách quay - ${d.name}.txt`)}`, 'Cache-Control': 'no-store' });
        res.end('﻿' + t.replace(/\r?\n/g, '\r\n')); return true; // BOM + CRLF: Notepad trên Windows đọc đúng dấu
      }
      return false;
    }
    if (req.method !== 'POST') return false;
    const b = await ctx.body(req);
    if (p === '/api/draft') {
      const { loadBrand } = await import('../../scripts/batch.mjs'); // cùng nơi nạp với job (script_draft.mjs brandOf)
      const { draft, est } = checkDraftInput(b, id => /^[a-z0-9][a-z0-9-]{0,39}$/.test(id) && !!loadBrand(id));
      const id = `d-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex')}`, dir = draftDir(id);
      wr(path.join(dir, 'draft.json'), { id, ...draft, created: new Date().toISOString() });
      const item = addItem({ kind: 'script_draft', input: dir, opts: {}, source: 'ui' });
      return J({ ok: true, id, item: jobView(item), est: { segments: est.segments.length, duration: est.duration, speech: est.speech } });
    }
    const id = b.id, dir = draftDir(id), d = readJSON(path.join(dir, 'draft.json')), vd = varDir(id, b.v);
    if (!d) return J({ error: 'Không thấy bản nháp' }, 404);
    const tl = readJSON(path.join(vd, 'timeline.json')), r = readJSON(resultFile(dir)), info = r?.variants?.find(x => x.k === +b.v);
    if (!tl || !info || info.error) return J({ error: 'Phương án này chưa dựng xong hoặc bị lỗi' }, 409);
    if (p === '/api/draft/use') {
      const W = await import('../../scripts/workspace.mjs');
      const ws = W.ensureWorkspace(W.workspaceFor(d.brand || '')), dest = W.projectDirFor(ws, d.name || 'Video theo kịch bản');
      fs.cpSync(vd, dest, { recursive: true, filter: s => !/[\\/]\.studio[\\/](draft_stills|history)([\\/]|$)/.test(s) });
      try { fs.copyFileSync(path.join(dir, 'shots.txt'), path.join(dest, 'Danh sach quay.txt')); } catch { /* chưa có danh sách quay */ }
      const t2 = { ...tl, draft: { ...(tl.draft || {}), from: id, variant: info.name } }; wr(path.join(dest, 'timeline.json'), t2);
      ctx.openProject(dest);
      return J({ ok: true, dir: dest });
    }
    if (p === '/api/draft/template') {
      const sheet = readJSON(path.join(vd, '.studio', 'build_sheet.json')), sc = readJSON(path.join(vd, '.studio', 'script.json'));
      const tpl = toTemplate(tl, { name: String(b.name || '').trim() || `${d.name} · ${info.name}`, brand: d.brand, variant: info, shots: shotList(sc?.segments || [], sheet), text: d.text });
      const T = path.join(ctx.SKILL, 'templates'), tid = saveTemplateFile(path.join(T, 'user'), T, tpl);
      try { fs.mkdirSync(path.join(T, 'previews'), { recursive: true }); fs.copyFileSync(path.join(vd, '.studio', 'draft_stills', '1.jpg'), path.join(T, 'previews', `${tid}.jpg`)); } catch { /* không có khung: mẫu không ảnh bìa */ }
      return J({ ok: true, id: tid });
    }
    return false;
  } catch (e) { return J({ error: String(e.message || e).slice(0, 300) }, e.status || 500); }
};
