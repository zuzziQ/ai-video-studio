// Test M15 (chặn xuất khi QC còn lỗi quảng cáo mức cao: cổng, lý do bỏ qua, hàng đợi, autopilot) và M16 (soát lại
// cổng quảng cáo sau --fix). Chạy: node --test scripts/tests/
// Không mở Chrome, không gọi Claude: autopilot được chạy từ bước export với các bước trước đánh dấu xong.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-gate-'));
process.env.AVS_HOME = HOME;
process.env.AVS_NO_NOTIFY = '1';
process.env.AVS_NO_LAUNCHCTL = '1';
const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const G = await import('../export_gate.mjs');
const Q = await import('../queue.mjs');
const { recheckAds } = await import('../ai_qc.mjs');
test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const issue = (kind, code, t = 1, extra = {}) => ({ t, kind, severity: 'high', code, msg: `${code} ở ${t}s`, src: 'auto', ...extra });
function project(name, issues, { ads = true } = {}) {
  const d = path.join(HOME, name);
  fs.mkdirSync(path.join(d, '.studio'), { recursive: true });
  const tl = { width: 1080, height: 1920, duration: 10, scenes: [], captions: [], ads: { on: ads } };
  fs.writeFileSync(path.join(d, 'timeline.json'), JSON.stringify(tl));
  const hash = G.qcHash(tl, []);
  fs.writeFileSync(path.join(d, '.studio/qc.json'), JSON.stringify({ created: new Date().toISOString(), hash, hash_now: hash, ads: { enabled: ads, blocked: issues.length > 0 }, issues }));
  return d;
}

test('cổng: không bật quảng cáo hoặc không còn lỗi mức cao thì không chặn', () => {
  assert.equal(G.gateOf(null).blocked, false);
  assert.equal(G.readGate(project('off', [issue('ad_policy', 'POLICY-MEDICAL')], { ads: false })).blocked, false);
  assert.equal(G.readGate(project('fixed', [issue('ad_claim', 'BLOCK-01', 1, { fixed: true }), { ...issue('ad_policy', 'POLICY-PRICE'), severity: 'low' }])).blocked, false);
  assert.equal(G.readGate(project('nonad', [issue('text_offcanvas', undefined)])).blocked, false);   // lỗi QC thường không chặn xuất
});

test('cổng: lỗi chính sách mức cao chặn và không bỏ qua được', () => {
  const d = project('policy', [issue('ad_policy', 'POLICY-MEDICAL'), issue('ad_claim', 'BLOCK-01', 3)]);
  const g = G.readGate(d);
  assert.deepEqual([g.blocked, g.hard, g.overridable, g.issues.length], [true, true, false, 2]);
  assert.throws(() => G.recordOverride(d, 'khách hàng đã duyệt nội dung này'), /không bỏ qua được/);
  assert.equal(G.readGate(d).blocked, true);
  assert.equal(fs.existsSync(path.join(d, '.studio/qc_overrides.log')), false);
});

test('cổng: lỗi claim / nguyên bản bỏ qua được khi ghi lý do, lý do vào qc.json và log', () => {
  const d = project('claim', [issue('ad_claim', 'BLOCK-01'), issue('ad_originality', 'BLOCK-04', 0)]);
  assert.deepEqual([G.readGate(d).blocked, G.readGate(d).overridable], [true, true]);
  assert.throws(() => G.recordOverride(d, 'ok'), /lý do/);
  const r = G.recordOverride(d, 'Claim đã có giấy chứng nhận số 123', { by: 'test' });
  assert.equal(r.ok, true);
  const g = G.readGate(d);
  assert.equal(g.blocked, false);
  assert.equal(g.override.reason, 'Claim đã có giấy chứng nhận số 123');
  const qc = JSON.parse(fs.readFileSync(path.join(d, '.studio/qc.json'), 'utf8'));
  assert.deepEqual(qc.override.codes, ['BLOCK-01', 'BLOCK-04']);
  const log = fs.readFileSync(path.join(d, '.studio/qc_overrides.log'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(log.length, 1); assert.equal(log[0].by, 'test');
});

test('cổng: lý do gắn với đúng lần QC; timeline đổi sau QC thì báo stale', () => {
  const d = project('stale', [issue('ad_claim', 'BLOCK-01')]);
  G.recordOverride(d, 'Claim đã có giấy chứng nhận số 123');
  const f = path.join(d, '.studio/qc.json'), qc = JSON.parse(fs.readFileSync(f, 'utf8'));
  qc.hash_now = 'khaclanqc'; fs.writeFileSync(f, JSON.stringify(qc));     // QC chạy lại: lý do cũ hết hiệu lực
  const g = G.readGate(d);
  assert.equal(g.blocked, true); assert.equal(g.stale, true);
});

test('M16: soát lại sau khi sửa đánh dấu đã sửa vấn đề không còn, giữ vấn đề còn, thêm vấn đề mới', () => {
  const det = [issue('ad_policy', 'POLICY-GUARANTEE', 1), issue('ad_claim', 'BLOCK-01', 4), { ...issue('face_cover', undefined, 2) }];
  const added = recheckAds(det, { issues: [{ t: 4.3, kind: 'ad_claim', severity: 'high', code: 'BLOCK-01', msg: 'câu mới' }, { t: 7, kind: 'ad_policy', severity: 'med', code: 'POLICY-URGENCY', msg: 'mới' }] }, 10);
  assert.equal(det[0].fixed, true); assert.match(det[0].note, /soát lại/);
  assert.equal(det[1].fixed, false); assert.equal(det[1].msg, 'câu mới');
  assert.equal(det[2].fixed, undefined);                                   // không đụng vấn đề không phải quảng cáo
  assert.deepEqual(added.map(i => [i.code, i.new]), [['POLICY-URGENCY', true]]);
});

test('hàng đợi: dừng ở cổng QC thì không tự thử lại; thử lại kèm lý do truyền --qc-override', () => {
  assert.equal(Q.isGateStop('AI kiểm tra lỗi (QC): CHẶN XUẤT — 1 lỗi'), true);
  assert.equal(Q.isGateStop('render lỗi'), false);
  const it = Q.addItem({ kind: 'autopilot', input: path.join(HOME, 'x.mp4') });
  Q.mutate(q => { Object.assign(q.items.find(x => x.id === it.id), { state: Q.FAILED, blocked: true }); });
  assert.equal(Q.retryItem(it.id, { qcOverride: 'Claim đã có giấy chứng nhận' }), true);
  const cur = Q.loadQueue().items.find(x => x.id === it.id);
  assert.equal(cur.state, 'queued'); assert.equal(cur.blocked, undefined); assert.equal(cur.opts.qc_override, 'Claim đã có giấy chứng nhận');
});

test('autopilot: bước xuất dừng khi QC trước đó còn chặn (không render)', () => {
  const d = project('ap', [issue('ad_policy', 'POLICY-MEDICAL')]);
  const done = { state: 'done', msg: '', sec: 0 };
  const steps = Object.fromEntries(['new', 'brand', 'clean', 'fillers', 'ai', 'broll', 'sfx', 'qc'].map(k => [k, done]));
  fs.writeFileSync(path.join(d, '.studio/autopilot.json'), JSON.stringify({ version: 1, input: d, steps }));
  const r = spawnSync(process.execPath, [path.join(SKILL, 'scripts/autopilot.mjs'), d], { encoding: 'utf8', env: process.env, timeout: 60000 });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /CHẶN XUẤT/);
  const st = JSON.parse(fs.readFileSync(path.join(d, '.studio/autopilot.json'), 'utf8'));
  assert.equal(st.state, 'blocked'); assert.equal(st.steps.export.blocked, true);
  assert.equal(fs.existsSync(path.join(d, 'out')), false);
});
