// S18 M129: các dự án đang mở (tab) của Studio. Server cấp cho mỗi dự án đã mở một mã ngắn (12 ký tự hex, băm từ đường dẫn);
// trình duyệt chỉ gửi mã (header X-AVS-Project, đường dẫn /p/<mã>/...), không bao giờ gửi đường dẫn. Danh sách lưu ở
// $AVS_HOME/studio-tabs.json để mở lại Studio (hoặc tải lại trang sau khi server khởi động lại) vẫn còn các tab.
// Thư mục đọc từ file cũng đi qua `resolve` (resolveProject của security.mjs) như mọi lần mở dự án khác.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MAX_TABS = 8;
export const ID_RE = /^[a-f0-9]{12}$/;
const norm = d => { const r = path.resolve(d); return process.platform === 'win32' ? r.toLowerCase() : r; };
export const tabId = dir => crypto.createHash('sha1').update(norm(dir)).digest('hex').slice(0, 12);

export class TabRegistry {
  /** @param {{file: string, resolve: (dir: string) => {dir: string, tlFile: string}, max?: number}} o */
  constructor({ file, resolve, max = MAX_TABS, busy = () => false, onClose = () => {} }) {
    this.file = file; this.resolve = resolve; this.max = max; this.busy = busy; this.onClose = onClose;
    this.live = new Map(); // id → project {dir, tlFile} (đã kiểm trong phiên này)
    this.tabs = this.#load(); // [{id, dir, t}] theo thứ tự trên thanh tab
  }
  #load() {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return (Array.isArray(j?.tabs) ? j.tabs : []).filter(x => x && ID_RE.test(x.id) && typeof x.dir === 'string' && path.isAbsolute(x.dir) && tabId(x.dir) === x.id)
        .slice(0, this.max).map(x => ({ id: x.id, dir: x.dir, t: Number(x.t) || 0 }));
    } catch { return []; }
  }
  #store() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, tabs: this.tabs }, null, 1));
      fs.renameSync(tmp, this.file);
    } catch { /* không ghi được thì chỉ mất danh sách tab lần sau */ }
  }
  /** Mở (hoặc đưa lên dùng) dự án `p` (đường dẫn do server có, không phải trình duyệt) → {id, project, evicted?}. Lỗi resolve ném ra nguyên vẹn.
   *  `replace`: mã tab được thay tại chỗ (chuyển clip trong nhóm Cùng bộ), tab mới đứng đúng vị trí đó. */
  open(p, now = Date.now(), { replace } = {}) {
    const project = this.resolve(p), id = tabId(project.dir);
    this.live.set(id, project);
    const i = this.tabs.findIndex(x => x.id === id), r = replace && replace !== id ? this.tabs.findIndex(x => x.id === replace) : -1;
    let evicted = null;
    if (r >= 0) { // thay tab `replace` tại chỗ (không cần đẩy tab nào ra)
      if (i >= 0) this.tabs.splice(i, 1);
      this.tabs.splice(this.tabs.findIndex(x => x.id === replace), 1, { id, dir: project.dir, t: now });
      this.live.delete(replace);
    } else if (i >= 0) this.tabs[i] = { id, dir: project.dir, t: now };
    else {
      this.tabs.push({ id, dir: project.dir, t: now });
      if (this.tabs.length > this.max) { // đóng tab dùng lâu nhất (không phải tab vừa mở)
        const old = this.tabs.filter(x => x.id !== id && !this.busy(x.id)).sort((a, b) => a.t - b.t)[0];
        if (old) { evicted = old.id; this.close(old.id, { store: false }); }
      }
    }
    this.#store();
    return { id, project, evicted };
  }
  /** Dự án của mã `id` (tab đã lưu từ phiên trước thì kiểm lại thư mục) → project | null. */
  get(id) {
    if (!ID_RE.test(String(id || ''))) return null;
    // thư mục dự án bị xoá khi tab còn mở: không trả dự án (lưu sẽ dựng lại thư mục, "hồi sinh" dự án đã xoá)
    if (this.live.has(id)) { const pr = this.live.get(id); if (fs.existsSync(pr.tlFile)) return pr; this.live.delete(id); return null; }
    const tab = this.tabs.find(x => x.id === id);
    if (!tab) return null;
    try { const pr = this.resolve(tab.dir); if (tabId(pr.dir) !== id) return null; this.live.set(id, pr); return pr; } catch { return null; }
  }
  touch(id, now = Date.now()) { const tab = this.tabs.find(x => x.id === id); if (tab && now - tab.t > 60e3) { tab.t = now; this.#store(); } }
  close(id, { store = true } = {}) {
    const n = this.tabs.length;
    this.tabs = this.tabs.filter(x => x.id !== id); this.live.delete(id);
    if (n !== this.tabs.length) this.onClose(id);
    if (store && n !== this.tabs.length) this.#store();
    return n !== this.tabs.length;
  }
  /** Thứ tự tab mới (chỉ các mã đã có; mã lạ bỏ qua, mã thiếu giữ ở cuối). */
  reorder(ids) {
    const want = (Array.isArray(ids) ? ids : []).filter(x => typeof x === 'string');
    const by = new Map(this.tabs.map(x => [x.id, x]));
    const out = want.map(x => by.get(x)).filter(Boolean);
    for (const x of this.tabs) if (!out.includes(x)) out.push(x);
    this.tabs = [...new Set(out)]; this.#store();
  }
  list() { return this.tabs.map(x => ({ id: x.id, dir: x.dir, name: path.basename(x.dir), exists: fs.existsSync(path.join(x.dir, 'timeline.json')) })); }
}
