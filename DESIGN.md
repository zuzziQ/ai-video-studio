# DESIGN.md: giao diện AI Video Studio

> **Kế thừa hub.** Studio dùng hệ thiết kế chung 82X / Lychee ở `D:/ai/templates/design-system/` (`DESIGN.md`, `tokens.css`, `components.css`): 3 tầng, token theo vai trò cùng tên, thang navy/neutral/trạng thái, chuyển động, 5 trạng thái, luật `:where()`. File này **chỉ ghi điểm khác** hub và luật dùng trong repo này. Mục `M81` (`docs/ROADMAP.md`), quyết định `C14`.

## 1. Ba tầng trong repo

| Tầng | File | Việc |
|---|---|---|
| 1 | `studio/theme/tokens.css` | Nơi **duy nhất** chứa giá trị màu thô (kênh RGB), thang chữ, khoảng cách, bo góc, chiều cao, bóng, chuyển động; cuối file là bí danh cho tên biến cũ |
| 2 | (không có) | Studio không dùng Tailwind; CSS cũ và CSS-in-JS của tính năng đọc biến trực tiếp |
| 3 | `studio/theme/components.css` | Lớp dùng chung tiền tố `ui-` (nút, ô nhập, panel, mục thanh trái, tiêu đề nhóm, thẻ chọn, bảng, tab, chip, modal, toast, 5 trạng thái) |

`studio/index.html` chạy `theme/theme-boot.js` (đặt `data-theme`, mục 4b) rồi nạp theo thứ tự `studio.css` → `theme/tokens.css` → `theme/components.css`, nên bí danh ở tầng 1 đè bảng màu cũ trong `:root` của `studio.css` và mọi CSS cũ đổi theo mà không sửa từng file.

## 2. Điểm khác hub

| Hạng mục | Hub | Studio | Lý do |
|---|---|---|---|
| Nền | Sáng (`canvas #F1F4FA`, `surface #FFF`) | **Tối**: canvas neutral-950, surface neutral-900, raised 850, muted 800, hover 750 | `C14`: phần mềm dựng video cần nền tối để không lệch cảm nhận màu video |
| Màu nhấn | navy-600 cho mọi chỗ | **Nền** navy-600 (chữ trắng 11,1:1); **chữ, icon, viền focus** navy-300 (`--color-accent-text`, `--color-focus`) | navy-600 trên neutral-900 chỉ 1,6:1, không đọc được làm chữ |
| Hover nút chính | navy-700 (tối hơn) | navy-500 (sáng hơn) | Trên nền tối, hover phải sáng lên mới thấy |
| Trạng thái | Bậc 600–700 | Bậc sáng 300–400 (`success-400`, `warning-400`, `danger-400`) | Chữ sáng trên nền tối |
| Độ dày | Chữ 14–16px, nút 40–44px | Chữ **11/12/13/15/18/22**, nút **28/32/40** | Editor nhiều điều khiển trên một màn |
| Bo góc | control 12 / card 16 / shell 24 | **xs 4 / control 8 / card 12 / modal 16 / pill** | Dày hơn thì bo nhỏ hơn |
| Bóng | neutral-900 mờ | Đen (`--color-black`), đậm hơn | Bóng neutral trên nền tối không thấy |
| Thêm | — | `--track-1..8` (màu track timeline), `--stage-*` (khung preview **xám trung tính**, không ngả xanh), `--color-audio` (sóng âm teal), `--color-playhead` | Riêng của editor |
| Neutral | 50…950 | Thêm `--neutral-850`, `--neutral-750` | Hai bậc nền trung gian của giao diện tối |
| Font | Plus Jakarta Sans + JetBrains Mono qua `next/font` | Cùng hai font, nạp bằng Google Fonts trong `index.html` (API `css2` tự chia `unicode-range` gồm tiếng Việt) | Font trong video (`engine/`) không đổi |

## 3. Token

Màu là kênh RGB: viết `rgb(var(--color-accent))` hoặc `rgb(var(--color-accent) / .2)`.

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--color-canvas` | neutral-950 | Nền app, rãnh timeline |
| `--color-surface` | neutral-900 | Thanh trên, thanh trái, panel, ô nhập |
| `--color-surface-raised` | neutral-850 | Modal, popover |
| `--color-surface-muted` | neutral-800 | Nút, chip, tiêu đề bảng |
| `--color-surface-hover` | neutral-750 | Hover trên nền muted |
| `--color-line` / `-strong` / `-hover` | 800 / 700 / 600 | Đường kẻ / viền nút, panel / viền khi hover |
| `--color-line-control` | neutral-500 | Viền một mình đánh dấu điều khiển (`.ui-input`) |
| `--color-fg` / `-muted` / `-subtle` | 50 / 300 / 400 | Chữ chính / phụ / gợi ý |
| `--color-accent` / `-hover` / `-fg` | navy-600 / navy-500 / trắng | Nền nút chính, tab chọn |
| `--color-accent-text` / `-strong` | navy-300 / navy-200 | Chữ, icon, viền đang chọn |
| `--color-accent-soft` | navy-600 (dùng với alpha .14–.24) | Nền mục đang chọn |
| `--color-focus` | navy-300 | Vòng focus 2px |
| `--color-brand-red` | `#EA2229` | **Chỉ nhận diện** (logo, nhãn "82X"); không dùng cho lỗi |
| `--color-success` / `warning` / `danger` (+ `-text`) | 400 (+ 300/200) | Trạng thái |
| `--track-1..8` | video, cảnh, phụ đề, thêm, đường graphic, graphic, b-roll, âm thanh | Khối trên timeline (chữ trắng trên mỗi màu ≥ 4,5:1); cảnh đổi từ tím sang navy-700 |
| `--text-2xs…xl` | 11, 12, 13, 15, 18, 22 | Cỡ chữ |
| `--space-050…8` | 2, 4, 8, 12, 16, 20, 24, 32 | Khoảng cách lưới 4 |
| `--radius-xs/control/card/modal/pill` | 4, 8, 12, 16, 999 | Bo góc |
| `--h-sm/md/lg` | 28, 32, 40 | Chiều cao điều khiển |
| `--duration-*`, `--ease-*` | y hệt hub, tắt khi `prefers-reduced-motion` | Chuyển động |

Bí danh cũ (chỉ để CSS cũ chạy, code mới không dùng; `M85` gỡ): `--bg0..4` → canvas/surface/raised/muted/hover; `--line/2/3` → line/strong/hover; `--tx/2/3` → fg/muted/subtle; `--acc` → accent-text (code cũ dùng `--acc` chủ yếu làm chữ, viền, focus); `--acc2` → accent (nền dưới chữ trắng); `--acc-soft`, `--acc-line`; `--ok/warn/bad`; `--wave`, `--ph`; `--t-*` → `--track-*`; `--ui` → `--font-sans`; `--mono` → `--font-mono`; `--r`, `--rs` → `--radius-control`.

## 4. Tương phản (đo 2026-11-16, WCAG 2.1)

Chữ cần ≥ 4,5:1; viền và icon đánh dấu điều khiển ≥ 3:1.

| Màu chữ / viền | canvas 950 | surface 900 | raised 850 | muted 800 | hover 750 |
|---|---|---|---|---|---|
| fg neutral-50 | 19,3 | 17,1 | 15,6 | 14,0 | 11,8 |
| fg-muted neutral-300 | 13,6 | 12,0 | 11,0 | 9,9 | 8,3 |
| fg-subtle neutral-400 | 7,9 | 7,0 | 6,4 | 5,7 | 4,8 |
| neutral-500 (**không dùng cho chữ**; viền `line-control`) | 4,2 | 3,8 | 3,4 | 3,1 | 2,6 |
| accent-text navy-300 | 7,5 | 6,6 | 6,0 | 5,4 | 4,6 |
| accent-text-strong navy-200 | 11,8 | 10,4 | 9,6 | 8,6 | 7,2 |
| success-400 | 10,5 | 9,3 | 8,5 | 7,6 | 6,4 |
| warning-400 | 12,1 | 10,7 | 9,8 | 8,8 | 7,4 |
| danger-400 | 7,5 | 6,6 | 6,1 | 5,4 | 4,6 |
| brand-red (chỉ chữ ≥ 18px / đậm 14px, đồ hoạ) | 4,6 | 4,0 | 3,7 | 3,3 | 2,8 |

Chữ trắng trên nút chính navy-600 11,1:1, trên hover navy-500 8,4:1. `--color-line` (800) và `--color-line-strong` (700) chỉ là đường phân cách, không phải thứ duy nhất nhận ra điều khiển (nút có nền muted + chữ), nên không cần 3:1; ô nhập mới (`.ui-input`) dùng `--color-line-control` 3,8:1 trên surface.

Đo trong trình duyệt (Studio cổng 5191, 1440×900, `sample/clip-mau`): 68 phần tử chữ ở thanh trên, thanh trái, thư viện, inspector, đầu timeline và 25 phần tử trong modal Xuất, **0** dưới 4,5:1; trang không tràn ngang.

## 4b. Nền sáng và nền tối (`S25`, `C38`)

Cách làm giống dashboard lychee (`server/ui.css`): **một bộ tên vai trò, chỉ giá trị đổi theo nền**. Studio giữ 3 tầng của mình (bảng màu → vai trò `--color-*` → bí danh cũ), thêm một khối `:root[data-theme="light"]` trong `tokens.css` chỉ ghi đè vai trò `--color-*` và bóng `--shadow-*` (test `studio_tokens_defined` chặn ghi đè thứ khác). CSS thành phần và feature không bao giờ hỏi đang ở nền nào.

- **Đổi nền:** `studio/theme/theme-boot.js` nạp đồng bộ trong `<head>` trước mọi CSS, luôn đặt `<html data-theme="light|dark">` trước lần vẽ đầu (không chớp). Lựa chọn lưu `localStorage['avs.theme']` = `system` (mặc định, `C38`) | `light` | `dark`; `system` theo `prefers-color-scheme` và đổi ngay khi hệ điều hành đổi; tab khác đổi thì theo.
- **Chỗ chọn:** công tắc ☀/☾ trên thanh đầu ngay trước ⋯ (bấm = sang nền kia, thành lựa chọn cố định); dòng "Giao diện" Hệ thống · Sáng · Tối trong menu ⋯; ba lệnh trong ⌘K. API `Studio.theme` / `AVSTheme` (`pref`, `mode`, `set`, `toggle`), sự kiện `avs:theme` cho phần tự vẽ canvas.
- **Không đổi theo nền:** khung xem trước `--stage-*`, khối track `--track-*` (chữ trắng), chữ trên ảnh/video `--color-fg-on-media`, engine, ảnh thumbnail. Ô xem trước **kiểu chữ của video** (mẫu chữ ở thư viện, `.txgrid .tx`) cũng nằm trên nền `--stage-*`: chữ mẫu là màu của video (trắng, vàng có bóng), đặt trên bề mặt sáng sẽ mất.
- **Trang khoá** (`server.mjs`, không nạp CSS): tự mang 4 giá trị mỗi nền (`LOCKED_LIGHT` chép khối sáng; test so với `tokens.css`), theo `avs.theme` đã lưu hoặc `prefers-color-scheme`.
- **Chữ trên nền đặc trạng thái:** `--color-danger-fg`, `--color-warning-fg` (tối: neutral-950, sáng: trắng) cho huy hiệu số, nhãn vùng an toàn, ghim nháp; không dùng `--color-white` hay `--color-canvas` trên nền đỏ / vàng.
- **Lúc đổi nền** `theme-boot.js` gắn `.avs-theme-sw` hai khung hình (tắt transition) để mọi màu đổi cùng lúc, không chạy qua màu trung gian.
- **Lớp phủ:** lớp "nhấn nhẹ" trên bề mặt giao diện (vạch track, nền hàng, swatch) dùng `rgb(var(--color-overlay) / a)` (trắng ở nền tối, mực ở nền sáng), không dùng `--color-white`. `--color-white` / `--color-black` chỉ cho trắng/đen thật: chữ trên khối màu, trên video, nhãn đè lên ảnh. Bóng dùng `--color-shadow`.
- **Màu nhấn nền sáng:** chữ, viền đang chọn navy-600 (`--color-accent-text`), nền đặc navy-600 + chữ trắng; `--color-accent-soft` = navy-300 dùng ở .24 → xanh nhạt `#E2E6FB` (navy-500 làm bước đang chọn đục, khó nhìn). Vòng điểm quanh số bước đang chọn cách số 3px và số không có bóng: cung tiến độ cùng màu navy với nền số, sát nhau thì không thấy.
- **Trang mẫu:** `studio/ui.html` (⌘K "Mẫu giao diện", theo `/ui` của lychee): ô màu hai tầng, mẫu thành phần `ui-*`, tỉ lệ tương phản tính tại chỗ, hai nền cạnh nhau (`?theme=light|dark`). Thành phần mới có mẫu ở đây trước khi feature dùng.

Tương phản nền sáng (WCAG 2.1, tính từ token; trang mẫu đo lại tại chỗ, 2026-11-19 cả hai nền 0 cặp dưới ngưỡng):

| Màu chữ / viền | canvas `#F1F4FA` | surface trắng | muted neutral-100 | hover neutral-200 |
|---|---|---|---|---|
| fg neutral-900 | 16,2 | 17,9 | 16,3 | 14,5 |
| fg-muted neutral-700 | 9,4 | 10,4 | 9,5 | 8,4 |
| fg-subtle neutral-600 | 6,9 | 7,6 | 6,9 | 6,1 |
| line-control neutral-500 (viền) | 4,3 | 4,8 | 4,3 | 3,9 |
| accent-text navy-600 | 10,1 | 11,1 | 10,1 | 9,0 |
| accent-text-strong navy-700 | 12,9 | 14,3 | 13,0 | 11,6 |
| success-text 800 | 7,0 | 7,7 | 7,0 | 6,2 |
| warning-text 800 | 6,4 | 7,1 | 6,5 | 5,8 |
| danger-text 700 | 5,7 | 6,3 | 5,7 | 5,1 |
| focus navy-500 (viền) | 7,6 | 8,4 | 7,7 | 6,8 |

Chữ trắng trên nút chính navy-600 11,1:1, hover navy-700 14,3:1; chữ canvas trên huy hiệu warning-700 4,6:1; nhãn bước đang chọn navy-700 trên `#E2E6FB` 11,5:1. Đo trên Studio thật (cổng tạm, `sample/clip-mau`, 1007 và 1440 px): nền sáng 0 phần tử chữ dưới ngưỡng; thanh đầu thêm công tắc không chồng, không tràn ngang. Rà hết (`M180`, 2026-11-19): 35 panel thanh trái, 5 bước + Cài đặt, modal Xuất, Trang chủ, menu ⋯, ⌘K, trang khoá, ở cả hai nền khi màu đã ổn định: 0 chữ dưới ngưỡng (tab đang tắt không tính). Huy hiệu số đỏ trên nền tối 7,5:1 (trước 2,7:1), trên nền sáng 4,7:1.

## 5. Luật dùng

1. **Màu chỉ lấy từ token.** Không viết hex, `rgb(số)`, `hsl(số)` ngoài `studio/theme/tokens.css`; không thêm `style="..."`. `scripts/check_studio_tokens.mjs` (job `gate` của CI) đếm từng file so với `scripts/studio_tokens_baseline.json`: tăng là đỏ; file mới được 0. Khi chuyển CSS cũ sang token, hạ mốc trong cùng PR (`node scripts/check_studio_tokens.mjs --write`). Một ngoại lệ hợp lý (vd ô xem trước màu người dùng chọn): thêm chú thích `design-token-ok` trên dòng đó.
2. **Màu nhấn** (cả hai nền): nền đặc dùng `--color-accent` + chữ `--color-accent-fg`; chữ, icon, viền đang chọn, focus dùng `--color-accent-text` / `--color-focus`. Không đặt chữ navy-600 trên nền tối; trên nền sáng `--color-accent-text` đã là navy-600.
3. **Không tím.** Bảng màu tím cũ (`#8B7BFF`, `#6C5CF0`) đã bỏ khỏi `studio.css` và `00_author.js`; CSS riêng của các tính năng còn vài chỗ, `M86`/`M87` chuyển hết. Từ `M85` khung (`studio.css`, `studio.js`, `library.js`, trang khoá của `server.mjs`, `00_author.js`) dùng thẳng tên token, không dùng bí danh cũ; bí danh còn đến khi `M86`/`M87` xong.
4. **Đỏ thương hiệu không phải lỗi.** Lỗi, xoá, cảnh báo dùng `--color-danger*`.
5. **Khung preview giữ xám trung tính** (`--stage-*`): không tô xanh, không gradient màu quanh video.
6. **Lớp tầng 3** tên `ui-…` (BEM nhẹ: `ui-btn--primary`, `ui-panel__head`), trạng thái bằng thuộc tính ARIA (`aria-selected`, `aria-checked`, `aria-pressed`, `aria-current`) hoặc `.is-active`. Lớp đơn (độ ưu tiên 0,1,0) để thắng luật phần tử cũ (`button`, `input`); luật style phần tử con bọc lớp trong `:where()` (`:where(.ui-table) td`).
7. **Nút:** 4 kiểu `ui-btn` (`--primary`, `--secondary`, `--ghost`, `--danger`) × 3 cỡ (`--sm` 28, `--md` 32, `--lg` 40), thêm `--icon`, `--block`. Mỗi màn chỉ một nút chính.
8. **5 trạng thái** (hub mục 6): `ui-state--loading`, `ui-state--empty`, `ui-state--error`, `ui-banner--partial`, `ui-toast--ok|err` (người gọi đặt `aria-live`).
9. **Chữ nhỏ nhất 11px**, kể cả nhãn dưới icon thanh trái (`M85`: 11px, nút 60px, nhãn dài như "Chuyển cảnh", "Thương hiệu" xuống 2 dòng thay vì thu chữ).
10. Timecode, số đo dùng `--font-mono` (`.ui-mono`), số trong bảng căn phải.
11. **Không `style="..."` trong markup.** Giá trị theo dữ liệu (vị trí, cỡ, ảnh nền, bộ lọc, màu swatch) đặt bằng thuộc tính `data-d*` và `applyDyn()` của `studio.js` (xem `references/studio.md`); màu là dữ liệu video (mẫu chữ, swatch, mặc định brand kit) giữ nguyên với ghi chú `design-token-ok`.
12. **Cỡ chữ** chỉ theo thang `--text-*`; cỡ px còn lại trong CSS là cỡ icon (`.ti`) hoặc emoji, không phải chữ. Khoảng cách theo `--space-*` (lưới 4, thêm 2/6 cho điều khiển dày), bo góc `--radius-*`, chuyển động `--duration-*` + `--ease-*` (riêng đồng hồ 3 giây của thẻ tác giả là thời gian, không phải chuyển động). `studio.css` đặt `small` = `--text-2xs` cho cả trang (mặc định trình duyệt cho 10px), nên `<small>` của tính năng cũng ≥ 11px trừ khi tính năng tự đặt cỡ khác.

## 6. Vùng bố cục (S23 nghiệm thu `M166`, S24 nghiệm thu `M175`)

Một cấu trúc riêng, không ghép CapCut / Premiere: **khung video ở giữa và luôn lớn nhất có thể, "người làm" ở cạnh**. Vùng do lõi
`studio/features/76_layout.core.js` quyết (khổ × chế độ × bề rộng cửa sổ), gắn lên `body` bằng `data-tl`, `data-lib`,
`data-right`, `data-controls`, `data-narrow`, `data-focus`; CSS bố cục chỉ đọc các thuộc tính này, không tự đo cửa sổ.

| Vùng | Cơ bản | Chuyên nghiệp | Cỡ |
|---|---|---|---|
| Thanh icon trái | luôn có | luôn có | 68 px |
| Thư viện | ngăn trượt đè lên khung (`data-lib=flyout`), tự đóng | cột (`panel`), gấp bằng `[` | ngăn 420 px; cột `--libw: clamp(312px, 22vw, 420px)` |
| Cột phải | Thuộc tính · Claude, gấp bằng `]` | Thuộc tính · Lớp · Claude, gấp bằng `]` | 340 px, mọi khổ (`C35`: Cơ bản giống Chuyên nghiệp, chỉ ít mục chỉnh tay hơn) |
| Claude | tab Claude ở cột phải; không chọn gì → Claude | như Cơ bản | `/`, ✦ mở tab (mở cột đang gấp); ô hỏi dính đáy tab, luồng cuộn cùng `#right` |
| Xem lại kết quả | thanh Nhận / Bỏ `#rvbar` ngay dưới khung | như Cơ bản | không nằm trong tab Claude (gắn với bản đang xem trước) |
| Chú thích | chấm số 24 px / khung vùng trên khung, ô hỏi nổi 268 px cạnh chấm | như Cơ bản | phím C; lớp chỉ nhận chuột khi bật chế độ |
| Nút phát | một dòng dưới khung | một dòng dưới khung | không xếp dọc (chốt 2026-11-18) |
| Timeline (`--tlh`) | dải tua 40 px | đầy đủ 300 px (180 px tới cửa sổ − 320 px) | gọn 120 px; cửa sổ hẹp mặc định gọn |
| Điểm | vòng điểm trên thanh bước | như Cơ bản | rê chuột thấy lý do |

Luật:

1. **Một chỗ cho AI, một chỗ cho chỉnh tay** (`C34`–`C37`): mọi lối vào Claude (✦, `/`, "Hỏi Claude về mục này", Hỏi ngay của chú thích,
   việc từ popover thanh bước) đi vào tab Claude qua `Studio.ask.open` / `Studio.right.show('claude')`; không tạo thanh hay cột Claude
   mới, không đặt ô AI trong Thuộc tính. Ngưỡng cửa sổ (< 1280 px) và gấp cột ở `LayoutCore`, không viết `@media` mới cho vùng.
2. **Chừa chỗ cho khung:** timeline mọi mức để lại ít nhất 320 px cho thanh trên + khung + nút phát (`FULL.keep`); thứ nổi (thông báo,
   dải báo) không đè khung xem: thông báo là chuông trên thanh đầu, dải báo ở vùng riêng đầu `#center`.
3. **Thanh nổi, khung chọn, chú thích** nằm trong `#stagewrap`; chấm chú thích 24 px, khung vùng viền 2 px màu nhấn (nháp: nét đứt màu
   cảnh báo) và không nhận chuột; khung chọn xoay theo element. Ô hỏi nổi (`.pinpop`) đặt bên phải chấm, hết chỗ thì bên trái.
4. **Kiểm tra:** sửa bố cục thì chạy `node --test scripts/tests/s23_layout_matrix.test.mjs scripts/tests/s24_layout_matrix.test.mjs` và đo lại trên Studio thật ít nhất 1024×768
   Chuyên nghiệp (ô chật nhất) và 1920×1080 Cơ bản video dọc: không tràn ngang, không cuộn kép, khung không bị che, `#play` bấm được.
