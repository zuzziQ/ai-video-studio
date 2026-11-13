// Cổng chặn xuất theo kết quả QC (references/ad-gates.md, mục "Chặn xuất"). Không phụ thuộc Chrome: Studio, autopilot và
// test đều dùng được.
//   gateOf(qc, {hashNow})       → {blocked, hard, overridable, issues, policy, override, stale}
//   readGate(dir)                → gateOf(.studio/qc.json, hash của timeline đang lưu)
//   recordOverride(dir, reason)  → ghi lý do bỏ qua vào qc.json (`override`) và .studio/qc_overrides.log (mỗi dòng một JSON)
// Chặn khi QC còn vấn đề quảng cáo mức cao chưa sửa (kind ad_*). Lỗi chính sách (ad_policy) mức cao không bỏ qua được;
// lỗi claim hoặc nguyên bản bỏ qua được nếu ghi lý do. Lý do gắn với đúng lần QC đó: chạy QC lại thì phải ghi lại.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';

export const MIN_REASON = 10;

// Cùng công thức với hash trong ai_qc.mjs (scenes + captions + audio + kiểu phụ đề).
export const qcHash = (tl, caps) => crypto.createHash('sha1')
  .update(JSON.stringify({ s: tl.scenes || [], c: caps || [], a: tl.audio, cs: tl.caption_style })).digest('hex').slice(0, 16);

const readJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

export function projectHash(dir) {
  const tl = readJ(path.join(dir, 'timeline.json')); if (!tl) return null;
  let caps = tl.captions;
  if (typeof caps === 'string') caps = readJ(path.join(dir, caps)) || [];
  return qcHash(tl, Array.isArray(caps) ? caps : []);
}

export function gateOf(qc, { hashNow } = {}) {
  const none = { blocked: false, hard: false, overridable: false, issues: [], policy: [], override: null, stale: false };
  if (!qc || !qc.ads?.enabled) return none;
  const issues = (qc.issues || []).filter(i => !i.fixed && i.severity === 'high' && String(i.kind || '').startsWith('ad_'));
  if (!issues.length) return none;
  const policy = issues.filter(i => i.kind === 'ad_policy');
  const ref = qc.hash_now ?? qc.hash;
  const override = qc.override && qc.override.hash === ref && !policy.length ? qc.override : null;
  return { blocked: !override, hard: policy.length > 0, overridable: !policy.length, issues, policy, override,
    stale: !!(hashNow && ref && hashNow !== ref), checked: qc.created };
}

export function readGate(dir) {
  return gateOf(readJ(path.join(dir, '.studio/qc.json')), { hashNow: projectHash(dir) });
}

export function recordOverride(dir, reason, { by = 'studio' } = {}) {
  const f = path.join(dir, '.studio/qc.json'), qc = readJ(f), g = gateOf(qc);
  if (!g.issues.length) return { ok: true, noop: true };
  if (g.hard) throw new Error(`Lỗi chính sách quảng cáo mức cao không bỏ qua được (${g.policy.map(i => i.code || i.kind).join(', ')}). Sửa lời thoại hoặc chữ rồi kiểm tra lại.`);
  const why = String(reason || '').replace(/\s+/g, ' ').trim();
  if (why.length < MIN_REASON) throw new Error(`Cần ghi lý do bỏ qua (ít nhất ${MIN_REASON} ký tự).`);
  const ov = { reason: why.slice(0, 500), at: new Date().toISOString(), by, hash: qc.hash_now ?? qc.hash,
    codes: g.issues.map(i => i.code || i.kind), issues: g.issues.map(i => ({ t: i.t, kind: i.kind, code: i.code, msg: String(i.msg || '').slice(0, 200) })) };
  qc.override = ov;
  fs.writeFileSync(f, JSON.stringify(qc, null, 1));
  fs.appendFileSync(path.join(dir, '.studio/qc_overrides.log'), JSON.stringify({ ...ov, project: dir }) + '\n');
  return { ok: true, override: ov };
}

// Một dòng tóm tắt cho log / thông báo.
export function gateText(g) {
  const list = g.issues.map(i => i.code || i.kind).join(', ');
  return g.hard ? `${g.issues.length} lỗi quảng cáo mức cao, có lỗi chính sách không bỏ qua được (${list})`
    : `${g.issues.length} lỗi quảng cáo mức cao (${list}); bỏ qua được nếu ghi lý do`;
}
