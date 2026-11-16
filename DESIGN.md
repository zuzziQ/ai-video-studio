# DESIGN.md: giao diện AI Video Studio

> **Kế thừa hub.** Studio dùng hệ thiết kế chung 82X / Lychee ở `D:/ai/templates/design-system/` (`DESIGN.md`, `tokens.css`, `components.css`): 3 tầng, token theo vai trò cùng tên, thang navy/neutral/trạng thái, chuyển động, 5 trạng thái, luật `:where()`. File này **chỉ ghi điểm khác** hub và luật dùng trong repo này. Mục `M81` (`docs/ROADMAP.md`), quyết định `C14`.

## 1. Ba tầng trong repo

| Tầng | File | Việc |
|---|---|---|
| 1 | `studio/theme/tokens.css` | Nơi **duy nhất** chứa giá trị màu thô (kênh RGB), thang chữ, khoảng cách, bo góc, chiều cao, bóng, chuyển động; cuối file là bí danh cho tên biến cũ |
| 2 | (không có) | Studio không dùng Tailwind; CSS cũ và CSS-in-JS của tính năng đọc biến trực tiếp |
| 3 | `studio/theme/components.css` | Lớp dùng chung tiền tố `ui-` (nút, ô nhập, panel, mục thanh trái, tiêu đề nhóm, thẻ chọn, bảng, tab, chip, modal, toast, 5 trạng thái) |

`studio/index.html` nạp theo thứ tự `studio.css` → `theme/tokens.css` → `theme/components.css`, nên bí danh ở tầng 1 đè bảng màu cũ trong `:root` của `studio.css` và mọi CSS cũ đổi theo mà không sửa từng file.

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

## 5. Luật dùng

1. **Màu chỉ lấy từ token.** Không viết hex, `rgb(số)`, `hsl(số)` ngoài `studio/theme/tokens.css`; không thêm `style="..."`. `scripts/check_studio_tokens.mjs` (job `gate` của CI) đếm từng file so với `scripts/studio_tokens_baseline.json`: tăng là đỏ; file mới được 0. Khi chuyển CSS cũ sang token, hạ mốc trong cùng PR (`node scripts/check_studio_tokens.mjs --write`). Một ngoại lệ hợp lý (vd ô xem trước màu người dùng chọn): thêm chú thích `design-token-ok` trên dòng đó.
2. **Màu nhấn trên nền tối:** nền đặc dùng `--color-accent` + chữ `--color-accent-fg`; chữ, icon, viền đang chọn, focus dùng `--color-accent-text` / `--color-focus`. Không đặt chữ navy-600 trên nền tối.
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
