// Gói đăng: AI (claude -p) viết tiêu đề / caption / hashtag / bình luận đầu / gợi ý ảnh bìa cho từng nền tảng từ lời thoại.
// Shared by studio/routes/52_publish.mjs (/api/publish/gen) and scripts/autopilot.mjs. Writes <project>/publish/publish.json + <platform>.txt.
//   node scripts/publish_texts.mjs <project_dir> <video.mp4> [--platforms tiktok,youtube] [--notes "…"] [--model sonnet]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { PLATFORMS, probe } from '../studio/routes/52_publish.mjs';
import { claudeBin } from './platform.mjs';
import { runLLM, askJSON } from './llm.mjs';

export { claudeBin };
export const asText = (P, d) => [
  `# ${P.name}`, d.title ? `\n## Tiêu đề\n${d.title}` : '', `\n## Caption\n${d.caption || ''}`, `\n## Hashtag\n${(d.hashtags || []).join(' ')}`,
  d.first_comment ? `\n## Bình luận đầu tiên\n${d.first_comment}` : '', d.thumb_time != null ? `\n## Ảnh bìa gợi ý\n${d.thumb_time}s${d.thumb_text ? ` — chữ trên bìa: ${d.thumb_text}` : ''}` : '',
  `\n## Trang upload\n${P.url}`, `\n(Lưu ý: ${P.note})\n`,
].filter(Boolean).join('\n');

// What the model wrote → only the known fields, as strings of sane length; hashtags from an array or a "#a #b" string;
// thumb_time a number inside the video (QA: a string of hashtags used to throw on .map).
export function cleanPlatform(d, dur = 0) {
  const str = (v, n) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, n) : '');
  const tags = (Array.isArray(d.hashtags) ? d.hashtags : typeof d.hashtags === 'string' ? d.hashtags.split(/[\s,]+/) : [])
    .map(h => String(h).replace(/^#+/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 15).map(h => '#' + h.slice(0, 60));
  const t = Number(d.thumb_time);
  return { title: str(d.title, 200), caption: str(d.caption, 2200), hashtags: [...new Set(tags)], first_comment: str(d.first_comment, 500),
    thumb_time: Number.isFinite(t) && t >= 0 ? Math.round(Math.min(t, dur > 0 ? dur : t) * 10) / 10 : null, thumb_text: str(d.thumb_text, 80) };
}

export function buildPrompt({ tl, captions, info, plats, notes }) {
  const lines = captions.filter(c => !c.hidden).map(c => `[${c.t0.toFixed(1)}s] ${c.words.map(w => w.w).join(' ')}`).join('\n').slice(0, 9000);
  const onScreen = [...new Set((tl.scenes || []).flatMap(s => [s.title, s.name, s.text, s.question, s.value].filter(x => typeof x === 'string')))].slice(0, 30).join(' | ');
  const B = tl.brand || {};
  return `Bạn là chuyên gia social media Việt Nam. Viết nội dung đăng video ngắn (dọc 9:16, dài ${info?.dur ?? tl.duration}s) cho các nền tảng: ${plats.map(k => PLATFORMS[k].name).join(', ')}.
Thương hiệu: ${B.name || '(không có)'}${B.handle ? ', kênh ' + B.handle : ''}${B.phone ? ', SĐT ' + B.phone : ''}${B.website ? ', web ' + B.website : ''}.
Tiêu đề dự án: ${tl.title || '(không có)'}. Chữ trên màn hình: ${onScreen || '(không có)'}.
${notes ? 'Yêu cầu thêm của người dùng: ' + notes + '\n' : ''}Lời thoại (có mốc thời gian):
${lines || '(video không có lời thoại — dựa vào chữ trên màn hình)'}

Yêu cầu: tiếng Việt có dấu, tự nhiên, đúng văn phong từng nền tảng; không bịa số liệu, giá, cam kết không có trong lời thoại; giữ nguyên chữ "(ví dụ)" nếu nội dung là ví dụ.
- tiktok: caption ngắn có hook ≤ 150 ký tự, 3–6 hashtag.
- youtube: title ≤ 90 ký tự có #Shorts; caption là mô tả 2–4 câu; 3–5 hashtag.
- facebook: caption 2–4 câu có lời kêu gọi; 3–5 hashtag.
- instagram: caption có xuống dòng, 3–5 hashtag.
- zalo: caption ngắn gọn thân thiện, 0–3 hashtag.
thumb_time = giây (số) có khung hình đẹp nhất để làm ảnh bìa (chọn lúc có chữ/tiêu đề rõ, trong khoảng 0–${info?.dur ?? tl.duration}); thumb_text = chữ ngắn ≤ 6 từ nên in trên ảnh bìa.
first_comment = bình luận ghim đầu tiên (câu hỏi gợi tương tác hoặc thông tin liên hệ).
Chỉ trả về JSON đúng dạng, không giải thích:
{${plats.map(k => `"${k}":{"title":"","caption":"","hashtags":["#..."],"first_comment":"","thumb_time":0,"thumb_text":""}`).join(',')}}`;
}

// claude -p … --output-format json → the model's text. onProc(child) lets callers kill it.
export async function askClaude(prompt, { model = 'sonnet', onProc } = {}) {
  return (await runLLM(prompt, { task: 'text', model, cwd: os.tmpdir(), onProc })).text;
}

/** Generate publish texts. o: { dir, tl, captions, videoAbs, videoRel, platforms?, notes?, model?, onProc? } → publish.json doc */
export async function generatePublish({ dir, tl, captions, videoAbs, videoRel, platforms, notes, model = 'sonnet', onProc }) {
  const plats = (platforms || Object.keys(PLATFORMS)).filter(k => PLATFORMS[k]);
  if (!plats.length) throw new Error('Chưa chọn nền tảng');
  const info = await probe(videoAbs);
  const dur = +(info?.dur ?? tl.duration) || 0;
  // at least one asked platform with a caption, else one more try (askJSON retries); fields are cleaned by cleanPlatform
  const data = await askJSON(buildPrompt({ tl, captions, info, plats, notes }), { task: 'text', model, cwd: os.tmpdir(), onProc, shape: 'object', retries: 1,
    validate: d => { if (!plats.some(k => d?.[k] && typeof d[k] === 'object' && String(d[k].caption || d[k].title || '').trim())) throw new Error('thiếu caption cho các nền tảng đã chọn'); return d; } });
  const PUB = path.join(dir, 'publish');
  fs.mkdirSync(PUB, { recursive: true });
  const doc = { video: videoRel, created: new Date().toISOString(), info, platforms: {} };
  for (const k of plats) if (data[k] && typeof data[k] === 'object') {
    const d = cleanPlatform(data[k], dur);
    doc.platforms[k] = d; fs.writeFileSync(path.join(PUB, `${k}.txt`), asText(PLATFORMS[k], d));
  }
  fs.writeFileSync(path.join(PUB, 'publish.json'), JSON.stringify(doc, null, 1));
  return doc;
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const [dirArg, vid] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  if (!dirArg || !vid) { console.error('usage: node scripts/publish_texts.mjs <project_dir> <video.mp4> [--platforms tiktok,youtube] [--notes …] [--model sonnet]'); process.exit(2); }
  const { loadProject } = await import('./ai_edit.mjs');
  const { dir, tl, caps } = loadProject(dirArg);
  const videoAbs = path.resolve(dir, vid);
  console.log('@@ 0.10 AI đang viết nội dung đăng (claude -p)…');
  generatePublish({ dir, tl, captions: caps, videoAbs, videoRel: path.relative(dir, videoAbs), platforms: opt('--platforms')?.split(','), notes: opt('--notes', ''), model: opt('--model', 'sonnet') })
    .then(doc => { console.log('@@ 1.00 Xong'); console.log(JSON.stringify({ out: path.join(dir, 'publish/publish.json'), platforms: Object.keys(doc.platforms) })); })
    .catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
}
