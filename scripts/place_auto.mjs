// S13 · M104: đặt b-roll / graphic do "Tự động" thêm (_auto, chưa bị người dùng chỉnh) né mặt đang nói, phụ đề, mép khung và
// vùng an toàn — cùng bộ giải với QC (ai_qc.mjs placePlan). Graphic người dùng tự đặt không bị dời.
// Chạy như tiến trình con của job "autofill" (studio/routes/80_autofill.mjs) để Huỷ dừng được Chrome.
//   node scripts/place_auto.mjs <project_dir | timeline.json>
// stdout: "@@ <0..1> <bước>" (tiến độ) rồi một dòng JSON {moved, left}. Ghi timeline.json chỉ khi có graphic được dời.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadProject, placePlan } from './ai_qc.mjs';

export async function placeAuto(src, { onP } = {}) {
  const { dir, tlFile, tl, caps } = loadProject(src);
  const raw = JSON.parse(fs.readFileSync(tlFile, 'utf8')); // giữ nguyên dạng file (captions là đường dẫn)
  const only = s => !!s._auto && !s._orig;
  if (!(raw.scenes || []).some(only)) return { moved: 0, left: [] };
  const r = await placePlan(dir, tl, caps, { scenes: tl.scenes, pack: tl.pack, caption_style: tl.caption_style }, { only, tag: { _auto: true }, onP });
  if (r.moved) { raw.scenes = r.scenes; fs.writeFileSync(tlFile, JSON.stringify(raw, null, 1)); }
  return { moved: r.moved, left: r.left.map(i => ({ t: i.t, kind: i.kind, msg: i.msg })) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  const src = process.argv[2];
  if (!src) { console.error('usage: node scripts/place_auto.mjs <project_dir|timeline.json>'); process.exit(2); }
  placeAuto(src, { onP: k => console.log(`@@ ${k.toFixed(2)} Đặt b-roll né mặt và phụ đề… ${Math.round(k * 100)}%`) })
    .then(r => console.log(JSON.stringify(r)))
    .catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
}
