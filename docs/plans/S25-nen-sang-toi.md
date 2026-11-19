# S25 — Nền sáng và nền tối cho giao diện Studio

Lập 2026-11-19. Mục ROADMAP: `M177`–`M179`, quyết định `C38`. Nguồn: chủ repo yêu cầu "xem và build cả lựa chọn nền sáng
tối, tổng hợp vào design token giống cách dashboard lychee main làm", thêm "phần /ui trong dashboard-lychee-main nữa".

## 1. Lychee (`dashboard-lychee-main`, nhánh `main`) làm thế nào

| Điểm | Lychee | Ghi chú |
|---|---|---|
| Nơi giữ token | `server/ui.css` mục "1. Token", mọi trang nạp trước `<style>` riêng | Một file, trang con không tự khai báo màu |
| Tầng | Một tầng vai trò (`--bg`, `--surface`, `--surface-2`, `--fg`, `--muted`, `--border`, `--accent`, `--accent-soft`, `--accent-fg`, `--good/-soft`, `--bad/-soft`, `--warn/-soft`, `--info/-soft`, `--shadow`) + lớp thương hiệu 82X (`body[data-ds="82x"]`) ghi đè cùng tên, thêm `--brand-*`, `--chart-1..6` | Không có tầng bảng màu riêng; giá trị hex viết thẳng vào vai trò |
| Đổi nền | Chỉ `@media (prefers-color-scheme: dark)` ghi đè **cùng tên token**; không có `data-theme`, không có nút chọn, không lưu lựa chọn | Theo hệ điều hành |
| Màu nhấn trên nền tối | Sáng lên (`#0620B6` → `#8CA0FF`), `--accent-fg` đổi sang màu nền tối | Giữ tương phản chữ trên nền nhấn |
| Biểu đồ | JS đọc `getComputedStyle(documentElement)`, vẽ lại khi `matchMedia('(prefers-color-scheme: dark)')` đổi | |

Bài học lấy về: **tên token theo vai trò không đổi giữa hai nền, chỉ giá trị đổi**; nền thứ hai chỉ là một khối ghi đè vai
trò, không ghi đè thành phần. Lychee thiếu nút chọn và chỗ lưu, Studio cần thêm (dựng video có người muốn nền tối dù máy để
sáng).

## 2. Studio hiện giờ (main sau `#222`)

- `studio/theme/tokens.css` đã có 3 tầng tốt hơn lychee: bảng màu (`--navy-*`, `--neutral-*`, trạng thái), vai trò
  `--color-*` (kênh RGB, dùng `rgb(var(--color-x) / a)`), và tên cũ (`--bg0`, `--tx`, `--acc`…) trỏ về vai trò. Chỉ có giá
  trị tối, `color-scheme: dark`.
- `scripts/check_studio_tokens.mjs`: 0 màu cứng ngoài `tokens.css` (M85 xong). Không còn hex rải rác.
- Chỗ còn **giả định nền tối** (không phải màu cứng nhưng sai trên nền sáng):
  - `rgb(var(--color-white) / a)` 41 chỗ, `rgb(var(--color-black) / a)` 38 chỗ: phần lớn là lớp phủ nhạt "sáng hơn nền"
    (hover, vạch lưới) hoặc bóng; trên nền sáng lớp trắng biến mất.
  - `color-scheme: dark` cứng ở `18_schedule.js`, `51_brands.js`, `53_products.js` (ô ngày/giờ).
  - `--navy-*` dùng thẳng 6 chỗ.
  - Trang khoá của `studio/server.mjs` (`LOCKED_CSS`) chép giá trị tối từ `tokens.css` (tệp nóng).
- Không đổi theo nền (đúng như hiện tại): khung xem trước (`--stage-*`, xám trung tính), màu track timeline (`--track-*`,
  chữ trắng trên khối), chữ trên ảnh/video (`--color-fg-on-media`), iframe engine và ảnh thumbnail.

## 3. Hướng

**Tầng token (giữ 3 tầng của Studio, thêm cách đổi nền của lychee):**

1. Bảng màu: thêm các bậc nền sáng cần (`--success-700`, `--warning-700`, `--danger-600`… giống hub).
2. Vai trò `--color-*`: khối `:root` giữ giá trị tối (mặc định). Thêm **một khối** `:root[data-theme="light"]` chỉ ghi đè
   vai trò, giá trị lấy từ hub/lychee nền sáng (canvas `241 244 250`, surface trắng, fg `neutral-900`, accent text
   `navy-600`…), cùng `color-scheme: light`. Không ghi đè thành phần nào trong `components.css` hay feature.
3. Thêm vai trò mới thay cho trắng/đen dùng như lớp phủ: `--color-overlay` (lớp "nhấn nhẹ" trên bề mặt: trắng ở nền tối, đen ở
   nền sáng), `--color-shadow` (đen ở cả hai, độ đậm bóng giảm ở nền sáng qua `--shadow-*`). `--color-white` / `--color-black`
   chỉ còn cho chỗ thật sự cần trắng/đen tuyệt đối (chữ trên khối màu, trên video).
4. Tên cũ (`--bg0`…) tự theo vì trỏ về vai trò.

**Đổi nền:**

- Thuộc tính `data-theme="light|dark"` trên `<html>`, luôn là giá trị đã giải (không để trống).
- Lựa chọn lưu `localStorage['avs.theme'] = 'dark' | 'light' | 'system'` (theo máy, giống `avs.rtab`, chế độ Cơ bản /
  Chuyên nghiệp).
- **Không chớp màu:** một `<script>` nhỏ chạy đồng bộ trong `<head>` của `studio/index.html` trước các `<link>` CSS, đọc
  lựa chọn, giải `system` bằng `matchMedia('(prefers-color-scheme: light)')`, đặt `data-theme`. Theo hệ thống thì nghe
  `change` để đổi ngay khi hệ điều hành đổi (giống lychee).
- **Nơi chọn:** menu ⋯ có mục "Giao diện" với ba lựa chọn Tối · Sáng · Theo hệ thống (đánh dấu cái đang dùng); thêm lệnh
  trong bảng lệnh ⌘K. API `Studio.theme.get() / set(v)`, phát sự kiện `avs:theme` cho feature nào cần vẽ lại (canvas
  waveform, điểm).
- Trang khoá (`server.mjs`, tệp nóng): ngoài phạm vi, giữ tối. Ghi vào mục "không làm" của đợt.

## 4. Mục

| Mục | Việc | File | Cỡ |
|---|---|---|---|
| `M177` | Token nền sáng + cơ chế `data-theme`, script chống chớp, `Studio.theme`, mục Giao diện trong ⋯ và ⌘K, vai trò `--color-overlay` / `--color-shadow`, test token định nghĩa cho cả hai nền + test lõi chọn nền, `DESIGN.md` mục nền sáng và bảng tương phản | `tokens.css`, `index.html`, `01_workflow.js` (menu), `04_cmdk.js`, feature mới `00_theme.js` (lõi), `scripts/tests/` | ~350 dòng |
| `M178` | Rà giả định nền tối: 79 chỗ trắng/đen → `--color-overlay` / `--color-shadow` hoặc giữ (chú thích lý do), bỏ `color-scheme: dark` cứng, `--navy-*` thẳng → vai trò; canvas vẽ bằng màu đọc từ token; đo tương phản bằng `javascript_tool` ở cả hai nền (chữ ≥ 4.5:1, viền điều khiển ≥ 3:1), ảnh chụp ở mốc cuối | `studio.css`, `components.css`, `library.js`, `studio/features/*.js` | ~300 dòng |

| `M179` | Trang mẫu design system `studio/ui.html` (mở `/studio/ui.html`, file tĩnh, không sửa `server.mjs`) theo trang `/ui` của lychee: ô màu từng tầng (bảng màu, vai trò, track, khung xem trước) đọc thẳng từ token; mẫu thành phần của `components.css` (nút, chip, ô nhập, tab, menu, popover, modal, thẻ); nút Tối · Sáng · Theo hệ thống; hai nền cạnh nhau (hai khối `data-theme` trên một trang) và tỉ lệ tương phản chữ / nền tính tại chỗ, tô đỏ cặp dưới ngưỡng; lối vào từ ⌘K "Mẫu giao diện" | `studio/ui.html`, `04_cmdk.js` | ~250 dòng |

Lychee `/ui` (`server/ui.html`, chỉ admin): độ rộng trang, ô màu `--accent…--surface` vẽ bằng `var(--x)`, thẻ số liệu, nút,
nhãn, ô nhập, bảng, thông báo / menu / popup, nút "Xem thử lớp 82x". Studio lấy cùng ý: **trang mẫu là nơi kiểm token bằng
mắt**, thành phần mới phải có mẫu ở đây trước khi feature dùng (thêm vào `DESIGN.md`).

`M177` → `M178` gộp **một PR** nếu tổng ≤ 800 dòng; `M179` PR riêng sau `M177` (dùng trang này để đo cho `M178` thì làm
`M179` ngay sau `M177`).

## 5. Quyết định cần chủ repo

- **`C38`: nền mặc định.** `C14` chốt Studio tối (dựng video cần nền tối để không lệch cảm nhận màu). Đề xuất: **mặc định
  Tối** cho cả người mới và người đang dùng; Sáng và Theo hệ thống là lựa chọn trong ⋯. Khung xem trước luôn xám trung tính
  dù chọn nền nào. Phương án khác: mặc định Theo hệ thống như lychee.

## 6. Cách kiểm

- `node scripts/check_studio_tokens.mjs` (vẫn 0 màu cứng), `node --test scripts/tests/studio_tokens_defined.test.mjs`
  (thêm: mọi vai trò có ở khối tối cũng có ở khối sáng hoặc được ghi rõ là dùng chung).
- Mở Studio (`studio.cmd`, `AVS_HOME`/`USERPROFILE` tạm), đổi Tối → Sáng → Theo hệ thống, tải lại trang không chớp (đo
  `data-theme` có trước lần vẽ đầu), đo tương phản các cặp chữ / nền chính ở cả hai nền, chụp một ảnh mỗi nền ở mốc cuối.

## 7. Không làm

- Không đổi khung xem trước, màu track, engine render theo nền.
- Không đổi trang khoá của `server.mjs` (tệp nóng; làm sau nếu cần).
- Không thêm nền thứ ba hay bộ màu người dùng tự chọn.
