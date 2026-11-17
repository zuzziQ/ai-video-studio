// S18 M131: "Tạo dự án mới từ video này". Chủ repo chốt 2026-11-17: một dự án chỉ sửa ở một tab; mở cùng một video nguồn ở tab
// thứ hai nghĩa là một dự án thứ hai (cùng nguồn, cùng Kho / thương hiệu), không phải hai tab sửa chung một dự án.
//   POST /api/project/duplicate → chép dự án của tab (X-AVS-Project) sang thư mục bên cạnh "<tên> (2)", mở bản mới ở tab gọi
//        (X-AVS-Opened) → {ok, id, name}
// Chép thật từng file (không liên kết cứng: vài bước ghi đè file media tại chỗ, liên kết cứng sẽ làm hai dự án sửa lẫn nhau).
// Bỏ out/ (thành phẩm của bản cũ), lịch sử, dấu vết Tự lái (học từ chỉnh sửa không đếm bản sao như một video nữa) và file tạm.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SKIP = new Set(['out', '.studio/history', '.studio/autopilot.json', '.studio/autopilot_result.json', '.studio/qc_backup.json']);
const skip = rel => SKIP.has(rel.replace(/\\/g, '/')) || /\.(tmp|lock|part)$/i.test(rel);

export function freeName(parent, base) {
  const root = base.replace(/ \(\d+\)$/, '');
  for (let n = 2; n < 1000; n++) { const d = path.join(parent, `${root} (${n})`); if (!fs.existsSync(d)) return d; }
  throw Object.assign(new Error('Không tìm được tên thư mục trống'), { status: 409 });
}

// Xếp hàng trong tiến trình: lần sau chọn tên sau khi lần trước đã đổi tên xong (không hai lần cùng chọn "<tên> (2)").
let chain = Promise.resolve();
export function duplicateProject(src) { const p = chain.then(() => copyOnce(src)); chain = p.catch(() => {}); return p; }
async function copyOnce(src) {
  const dest = freeName(path.dirname(src), path.basename(src));
  const tmp = `${dest}.tao-${crypto.randomBytes(4).toString('hex')}`; // riêng từng lần: hai lần bấm cùng lúc không chép chồng
  try {
    await fs.promises.cp(src, tmp, { recursive: true, errorOnExist: true, force: false, filter: f => !skip(path.relative(src, f)), mode: fs.constants.COPYFILE_FICLONE });
    if (fs.existsSync(dest)) throw Object.assign(new Error('Thư mục vừa được tạo bởi lần bấm khác — thử lại'), { status: 409 });
    fs.renameSync(tmp, dest); // thư mục chỉ hiện tên thật khi chép xong: chép dở không thành dự án nửa vời
  } catch (e) { await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {}); throw e; }
  return dest;
}

export default ctx => async (req, res, p) => {
  if (p !== '/api/project/duplicate' || req.method !== 'POST') return false;
  if (!ctx.project) return ctx.json(res, { error: 'Chưa mở dự án' }, 404), true;
  try {
    const dest = await duplicateProject(ctx.project.dir);
    const id = ctx.openProject(dest);
    return ctx.json(res, { ok: true, id, name: path.basename(dest) }), true;
  } catch (e) { return ctx.json(res, { error: 'Chưa tạo được dự án mới: ' + e.message }, e.status || 500), true; }
};
