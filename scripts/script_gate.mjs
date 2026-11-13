// Kịch bản có claim gate (ROADMAP M22, references/products.md mục "Kịch bản có claim gate").
// Sinh kịch bản bằng LLM (scripts/llm.mjs askJSON) kèm luật claim của hồ sơ sản phẩm, kiểm từng câu bằng claim gate +
// chính sách quảng cáo (scripts/ad_gates.py --script, cùng luật với QC), sai thì sinh lại kèm danh sách lỗi, vẫn sai thì
// dùng khuôn mẫu chỉ ghép claim đã duyệt của hồ sơ. Dùng bởi scripts/topic_video.mjs (--product / --claim-gate).
//
//   gatedScript({ prompt, topic, ads, model, tries, run, py, onStep }) → { script, gate: { mode, attempts, issues, ... } }
//   checkScript(sc, ads, { py })        → kết quả check_script của ad_gates.py
//   scriptBeats(sc) / templateScript(…) / validateScript(sc)
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { askJSON } from './llm.mjs';
import { pyBin } from './platform.mjs';
import { loadProduct, validId } from './products.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AD_GATES = path.join(HERE, 'ad_gates.py');

/** Kịch bản dạng của topic_video.mjs phải có hook.say và ít nhất một beat có lời. */
export function validateScript(sc) {
  if (!sc || typeof sc !== 'object') throw new Error('không phải object');
  if (!String(sc.hook?.say || '').trim()) throw new Error('thiếu hook.say');
  if (!Array.isArray(sc.beats) || !sc.beats.some(b => String(b?.say || '').trim())) throw new Error('thiếu beats');
  return sc;
}

/** Các câu cần soát: lời đọc (hook/body/cta) và chữ trên màn hình, kèm `ref` để chỉ ra chỗ sai. */
export function scriptBeats(sc) {
  const out = [], add = (text, type, where, ref) => { const t = String(text ?? '').trim(); if (t) out.push({ text: t, type, where, ref }); };
  add(sc.hook?.say, 'hook', 'lời mở đầu', 'hook.say');
  add([sc.hook?.screen, sc.hook?.screen2].filter(Boolean).join(' · '), 'screen', 'chữ mở đầu', 'hook.screen');
  (sc.beats || []).forEach((b, i) => {
    add(b?.say, 'body', `lời ý ${i + 1}`, `beats[${i}].say`);
    add([b?.screen, b?.sub, ...(Array.isArray(b?.items) ? b.items : [])].filter(Boolean).join(' · '), 'screen', `chữ ý ${i + 1}`, `beats[${i}].screen`);
  });
  add(sc.cta?.say, 'cta', 'lời kêu gọi', 'cta.say');
  add([sc.cta?.screen, sc.cta?.button].filter(Boolean).join(' · '), 'screen', 'chữ kêu gọi', 'cta.screen');
  add(sc.title, 'screen', 'tiêu đề đăng', 'title');
  add(sc.caption, 'screen', 'mô tả đăng', 'caption');
  return out;
}

function gate(payload, py) {
  const out = execFileSync(py || pyBin(path.dirname(HERE)), ['-I', '-X', 'utf8', AD_GATES, '--script', '-'],
    { input: JSON.stringify(payload), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 << 20 });
  return JSON.parse(out);
}

/** Soát một kịch bản; `issues[].ref` chỉ ra trường của kịch bản bị bắt lỗi. */
export function checkScript(sc, ads = {}, { py } = {}) {
  const beats = scriptBeats(sc);
  const r = gate({ beats, ads, title: sc.title || sc.topic || '' }, py);
  for (const i of r.issues) if (i.beat != null) { i.ref = beats[i.beat]?.ref; i.where = beats[i.beat]?.where; }
  return r;
}

const high = r => r.issues.filter(i => i.severity === 'high');
const cut = (s, n) => { s = String(s).trim(); if (s.length <= n) return s; const w = s.slice(0, n + 1).split(/\s+/); w.pop(); return (w.join(' ') || s.slice(0, n)).trim(); };

/** Luật claim đưa vào prompt: chỉ được nói claim đã duyệt, không nói claim cấm và cụm từ cấm; FAQ làm tư liệu. */
export function claimRules(info, faq = []) {
  const L = ['', 'LUẬT QUẢNG CÁO (bắt buộc, kịch bản sẽ được máy soát từng câu):'];
  if (info.product?.name) L.push(`- Sản phẩm: ${info.product.name}.`);
  L.push(info.approved.length
    ? '- Mọi câu nói về công dụng, lợi ích, kết quả hay số liệu của sản phẩm PHẢI diễn đạt sát một trong các claim đã duyệt sau (giữ nguyên ý và con số, không thêm lợi ích mới):\n'
      + info.approved.map(c => `  • ${c.text}`).join('\n')
    : '- Chưa có claim nào được duyệt: không nêu công dụng, lợi ích, kết quả hay số liệu hiệu quả của sản phẩm.');
  if (info.prohibited.length) L.push('- KHÔNG được nói (kể cả diễn đạt khác):\n' + info.prohibited.map(t => `  • ${t}`).join('\n'));
  if (info.blocked_phrases.length) L.push('- Không dùng các cụm từ: ' + info.blocked_phrases.map(t => `“${t}”`).join(', ') + '.');
  L.push('- Không cam kết tuyệt đối (100%, cam kết, vĩnh viễn, khỏi hẳn), không nói chữa/điều trị bệnh, không so sánh trước/sau, không "số 1/tốt nhất/duy nhất", không ám chỉ khuyết điểm cơ thể người xem.');
  const qa = faq.filter(f => f.q && f.a).slice(0, 8);
  if (qa.length) L.push('- Hỏi đáp chuẩn của sản phẩm (chỉ dùng làm tư liệu, không biến thành lời hứa công dụng):\n' + qa.map(f => `  • ${f.q} → ${f.a}`).join('\n'));
  return L.join('\n');
}

function feedback(r) {
  const lines = high(r).map(i => `- ${i.where || 'kịch bản'} (${i.ref || i.code}): ${i.msg}`);
  return `\n\nBẢN TRƯỚC BỊ MÁY SOÁT CHẶN vì các lỗi sau. Viết lại toàn bộ kịch bản, sửa hết các chỗ này (bỏ hoặc thay bằng claim đã duyệt):\n${lines.join('\n')}\nChỉ trả về JSON.`;
}

/** Khuôn mẫu không cần LLM: mỗi ý là nguyên văn một claim đã duyệt; câu nối trung tính, không nêu lợi ích. */
export function templateScript({ topic, name, approved, nBeats = 4 }) {
  const who = String(name || topic || 'sản phẩm').trim();
  const end = s => (/[.!?…]$/.test(s) ? s : s + '.');
  const beats = approved.slice(0, Math.max(1, nBeats)).map(c => ({ say: end(c.text), screen: cut(c.text, 22), sub: '', visual: 'words', emoji: '✅', claim: c.id }));
  if (!beats.length) beats.push({ say: `Thông tin chi tiết về ${who} có trong phần mô tả.`, screen: cut(who, 22), sub: '', visual: 'words', emoji: 'ℹ️' });
  return {
    title: cut(who, 60), caption: `${who}. Thông tin chi tiết xem trong phần mô tả.`, hashtags: [], mood: 'corporate_upbeat',
    hook: { say: `Bạn đã biết những điều này về ${who}?`, screen: cut(who, 28), screen2: '' },
    beats, cta: { say: 'Xem thông tin chi tiết trong phần mô tả nhé.', screen: 'XEM MÔ TẢ', button: 'XEM THÊM' },
    _template: true,
  };
}

/**
 * Sinh kịch bản qua claim gate. opts:
 *  prompt   prompt viết kịch bản (topic_video.mjs scriptPrompt); luật claim được nối vào sau
 *  topic    chủ đề (tên dự phòng cho khuôn mẫu)
 *  ads      { product?, claims?, blocked?, industry?, platforms? } như timeline.ads
 *  tries    số lần sinh bằng LLM trước khi dùng khuôn mẫu (mặc định 2: sinh, rồi sinh lại một lần)
 *  nBeats   số ý cho khuôn mẫu
 *  model, run (gọi LLM; test cắm LLM giả ở đây), py (python), onStep(msg)
 * → { script, gate: { mode: 'llm'|'template', attempts: [{ blocked, issues }], issues, product } }
 */
export async function gatedScript(opts) {
  const { prompt, topic = '', ads = {}, tries = 2, nBeats = 4, model = 'sonnet', run, py, onStep = () => {} } = opts;
  const info = gate({ beats: [], ads }, py);
  if (info.product?.error) throw new Error('hồ sơ sản phẩm: ' + info.product.error);
  let faq = [];
  if (ads.product && validId(ads.product)) { try { faq = loadProduct(ads.product).faq || []; } catch { /* FAQ chỉ là tư liệu */ } }
  const base = prompt + claimRules(info, faq);
  const attempts = [];
  let fb = '';
  for (let a = 0; a < tries; a++) {
    onStep(a ? `Kịch bản vi phạm claim gate (${high(attempts[a - 1].r).length} lỗi nặng): viết lại lần ${a + 1}` : 'Viết kịch bản theo claim đã duyệt');
    let sc;
    try {
      sc = await askJSON(base + fb, { shape: 'object', validate: validateScript, retries: 1, task: 'text', model, cwd: os.tmpdir(), ...(run ? { run } : {}) });
    } catch (e) {
      if (e.kind !== 'parse') throw e;   // đăng nhập, hết hạn mức, timeout, lỗi chạy: báo luôn, không giấu sau khuôn mẫu
      attempts.push({ r: { blocked: true, issues: [{ severity: 'high', code: 'LLM-JSON', msg: e.message }] } });
      continue;
    }
    const r = checkScript(sc, ads, { py });
    attempts.push({ r });
    if (!r.blocked) return { script: sc, gate: summary('llm', attempts, r, info) };
    fb = feedback(r);
  }
  onStep('Vẫn vi phạm sau khi viết lại: dùng khuôn mẫu chỉ ghép claim đã duyệt');
  let sc = templateScript({ topic, name: info.product?.name, approved: info.approved, nBeats });
  let r = checkScript(sc, ads, { py });
  if (r.blocked) { // một claim đã duyệt tự nó dính luật chặn (vd "100%"): bỏ các ý đó
    const bad = new Set(high(r).map(i => i.ref).filter(Boolean));
    sc.beats = sc.beats.filter((_, i) => !bad.has(`beats[${i}].say`) && !bad.has(`beats[${i}].screen`));
    if (!sc.beats.length) sc = templateScript({ topic, name: info.product?.name, approved: [], nBeats });
    r = checkScript(sc, ads, { py });
    if (r.blocked) throw new Error('khuôn mẫu vẫn vi phạm claim gate: ' + high(r).map(i => i.msg).join('; '));
  }
  return { script: sc, gate: summary('template', attempts, r, info) };
}

function summary(mode, attempts, r, info) {
  return { mode, product: info.product, approved: info.approved.length,
    attempts: attempts.map(({ r: x }) => ({ blocked: x.blocked, issues: high(x).map(i => ({ code: i.code, ref: i.ref, msg: i.msg })) })),
    issues: r.issues.map(i => ({ severity: i.severity, code: i.code, ref: i.ref, msg: i.msg })) };
}
