// Mục nào của schedule.json đến lượt `publish.mjs run-due` xử lý (M55).
// Một nguồn cho cả hai phía: runDue() trong publish.mjs lọc mục bằng ba hàm dưới đây, còn hàng đợi (queue.mjs) và hẹn giờ
// của Studio (studio/routes/18_schedule.mjs) gọi scheduleHasDue() để chỉ sinh tiến trình `run-due` khi thật có việc.
// scheduleHasDue() chỉ đọc file: không khoá, không ghi, không sinh tiến trình. Khoá schedule.json (M40) và publish.lock
// (M41) vẫn nằm trọn trong publish.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Bằng DEFAULT_SETTINGS.remindMin / ytLeadMin của publish.mjs (test schedule_due.test.mjs giữ hai bên khớp nhau).
export const DUE_DEFAULTS = { remindMin: 10, ytLeadMin: 120 };
const at = it => new Date(it.when).getTime();
const ms = T => +T;
// 1) nhắc trước remindMin phút (không phải YouTube)
export const isPreRemindDue = (it, set, T) => it.state === 'planned' && it.platform !== 'youtube' && !it.preReminded && at(it) > ms(T) && at(it) - set.remindMin * 60e3 <= ms(T);
// 2) YouTube: tải lên trước giờ đăng ytLeadMin phút, trừ khi đang chờ thử lại (retryAfter)
export const isYoutubeDue = (it, set, T) => it.platform === 'youtube' && (it.state === 'planned' || it.state === 'uploading') && at(it) - set.ytLeadMin * 60e3 <= ms(T) && !(Date.parse(it.retryAfter) > ms(T));
// 3) nền tảng khác: đã đến giờ đăng
export const isPostDue = (it, set, T) => it.state === 'planned' && it.platform !== 'youtube' && at(it) <= ms(T);
export const isDue = (it, set, T) => isPreRemindDue(it, set, T) || isYoutubeDue(it, set, T) || isPostDue(it, set, T);

const nowMs = () => (process.env.AVS_NOW ? Date.parse(process.env.AVS_NOW) : Date.now());
// true khi run-due có việc. Không có schedule.json → false. Đọc không được (file bận trên Windows) hoặc không phải JSON →
// true: sinh run-due như trước khi có M55 (với file hỏng thì mỗi 60 s, cho tới khi lịch được ghi lại), không bỏ sót lượt đăng.
export function scheduleHasDue({ home = process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio'), now = nowMs() } = {}) {
  let s;
  try { s = JSON.parse(fs.readFileSync(path.join(home, 'schedule.json'), 'utf8')); }
  catch (e) { return e.code !== 'ENOENT'; }
  const items = Array.isArray(s?.items) ? s.items : [];
  const set = { ...DUE_DEFAULTS, ...(s?.settings || {}) };
  return items.some(it => it && isDue(it, set, now));
}
