# S21 — Cột phải kiểu Adobe: Thuộc tính · Lớp · Dự án, chi tiết cho mục bên trái, núm điều chỉnh kiểu Claude Design

Lập 2026-11-18. Mục ROADMAP: `M145`–`M150`, quyết định `C21`–`C23`. Nguồn: chủ repo yêu cầu "bên trái là công cụ, quản lí project, các mẫu; bên phải chia tab để hiển thị chi tiết đầy đủ cho tính năng bên trái (layout, font, layer…) như Adobe", và "học Claude Design xem nên làm sáng tạo thế nào". Nền: main sau `S20` (`0f6b552`).

## 1. Hiện trạng (đọc mã)

- Bố cục `main` (`studio/studio.css` dòng ~110): `68px` thanh icon `#rail` · `312px` thư viện `#lib` · khung xem trước · `340px` cột phải `#right > #insp`.
- `#insp` có **hai chế độ chồng lên một chỗ** (`renderInspector`, `studio/studio.js` ~444):
  - Không chọn gì → `projectPanel()`: 5 ô điểm, tiêu chí của bước đang mở, "Cài đặt dự án" thu gọn (`03_nextstep.js`, M113/M114/M137).
  - Có chọn → đầu (tên, loại, thời gian, bỏ chọn) + **tab con** `itabs`: lõi cho Cơ bản / Hoạt ảnh / Vị trí / Nâng cao, tính năng thêm qua `Studio.addInspectorTab` (Keyframe `60`, Mặt nạ `61`, Hình `64`, Khối `35`, Bám mặt / dịch `40`, Phương án khác `82`, Fade `30`). Một cảnh có mặt nạ + keyframe có 5–6 tab con trên 340 px; tab đang mở nhớ theo loại (`ITAB`).
- **Lớp** (M142) nằm ở panel trái Thành phần (`67_layers.js`, `Studio.addCompTab`) — người dùng phải mở panel Thành phần mới thấy, trong khi panel trái là chỗ duyệt thư viện.
- Mục bên trái (mẫu, mẫu chữ, hiệu ứng / khối HyperFrames, sticker, hình khối, nhạc, chuyển cảnh, bộ lọc) chỉ có ô nhỏ + rê để xem; **không có chỗ xem chi tiết** (mẫu dùng font gì, thêm những lớp nào, dài bao lâu, biến gì đổi được) trước khi bấm áp.
- Thanh nổi (M140) đã gánh thao tác nhanh trên khung; cột phải là nơi chỉnh đủ (C20).

## 2. Adobe làm thế nào

| Ứng dụng | Cách chia | Lấy gì |
|---|---|---|
| Premiere Pro 2025 | Panel **Properties** thay Essential Graphics: theo ngữ cảnh — chọn đồ hoạ thì có Transform + Responsive Design, chọn chữ thì thêm các mục chữ; mục xếp chồng, có điểm ngắt cho panel hẹp. Essential Graphics cũ có hai tab Browse / Edit (duyệt mẫu ↔ sửa lớp). | Một panel thuộc tính theo ngữ cảnh, **mục xếp chồng thu gọn được thay cho tab con**; tách "duyệt" và "sửa". |
| Illustrator | Properties: chọn gì hiện nấy (Transform, Appearance, Character, Paragraph, Quick Actions); **không chọn gì thì hiện thiết lập tài liệu** + thao tác nhanh. | Không chọn gì = Dự án (đúng cái Studio đang có). |
| Photoshop | Properties + **Layers là panel riêng cùng nhóm tab**, Contextual Task Bar nổi trên canvas. | Lớp nằm cạnh Thuộc tính, không nằm trong thư viện; thanh nổi = M140. |
| Mọi app Adobe | Panel ghép thành **nhóm tab**, workspace nhớ bố cục. | Cột phải = một nhóm tab nhỏ, nhớ tab theo máy. |

## 3. Claude Design (Anthropic Labs, 2026-04) — lấy gì cho Studio

Theo các bài giới thiệu lúc ra mắt: khung chat bên trái + canvas bên phải; **bình luận ngay trên canvas**, **sửa chữ trực tiếp**, **thanh trượt do Claude tự sinh** để chỉnh nhanh (khoảng cách, độ đậm màu, mật độ lưới…); đọc mã / file thiết kế để dựng **hệ thiết kế của thương hiệu** rồi áp vào mọi bản; xuất sang Canva hoặc giao cho Claude Code.

Áp vào Studio (đã có: sửa chữ tại chỗ M139, bộ thương hiệu, AI dựng, Ghi chú cho Claude):
1. **Núm điều chỉnh**: mỗi cảnh / mẫu / khối có 2–4 thanh trượt mức cao ("Năng lượng", "Độ nổi chữ", "Mật độ", "Độ thương hiệu"), mỗi núm đổi nhiều trường một lúc theo bảng ánh xạ có kiểm (không gọi Claude khi kéo). Claude chỉ tham gia khi người dùng bấm "Gợi ý núm" cho một khối lạ: trả bảng ánh xạ JSON, kiểm theo danh sách trường cho phép.
2. **Hỏi Claude sửa element**: ô nhập trong Thuộc tính ("chữ này nổi hơn, hợp tông thương hiệu") → bản vá các trường cho phép → xem trước khác biệt → Nhận / Bỏ (một bước hoàn tác).
3. **Ghi chú ghim trên khung**: "Ghi chú cho Claude" thành ghim tại (x, y, t) trên khung, danh sách ở tab Dự án, "Giao Claude sửa hết" (dùng luồng ghi chú hiện có `.studio/notes.md`).
4. **Thương hiệu trước tiên**: ô màu / font trong Thuộc tính và thanh nổi hiện màu, font của bộ thương hiệu đang dùng ở hàng đầu.
5. **Biến thể**: 3 phương án cho element đang chọn (kiểu chữ / hoạt ảnh / vị trí) dựng thành ảnh nhỏ từ preview, bấm để chọn.

## 4. Bố cục đề xuất

```
┌ rail ┐┌──── thư viện (duyệt) ────┐┌──── khung xem trước ────┐┌── cột phải: [Thuộc tính] [Lớp] [Dự án] ──┐
│ bước ││ Mẫu · Media · Chữ ·       ││  thanh nổi (M140)       ││ Thuộc tính:                               │
│ công ││ Sticker · Hình · Hiệu ứng ││  khung chọn, gõ tại chỗ ││  ▸ đầu: tên · loại · giờ · khoá · ẩn · ⋯  │
│ cụ   ││ Âm thanh · Thành phần…    ││                         ││  ▸ dải mục: Chữ·Kiểu·Hoạt ảnh·Vị trí·…   │
│      ││ (bấm một mục = xem chi    ││                         ││  ▾ Chữ  ▾ Kiểu  ▸ Hoạt ảnh  ▸ Keyframe…   │
│      ││  tiết ở cột phải)         ││                         ││  ── hoặc Chi tiết mục thư viện ──         │
└──────┘└───────────────────────────┘└─────────────────────────┘│ Lớp: bảng lớp tại playhead (từ M142)      │
                                                                  │ Dự án: điểm 5 bước, việc thiếu, cài đặt   │
                                                                  └───────────────────────────────────────────┘
```

- **Trái = công cụ và duyệt** (giữ): thanh bước, thanh icon, thư viện, quản lý dự án / Kho / mẫu.
- **Phải = nhóm 3 tab**, đổi tự động nhưng ghim được:
  - **Thuộc tính**: chọn element → thuộc tính của nó; không chọn element mà đang xem một mục thư viện → **Chi tiết mục** (ảnh / video xem trước lớn; mẫu: bố cục, font, màu, danh sách lớp sẽ thêm, thời lượng, gói; mẫu chữ: font, cỡ, kiểu, hoạt ảnh; khối HyperFrames: biến đổi được; hiệu ứng, sticker, hình, nhạc, chuyển cảnh, bộ lọc: thông tin + xem thử) và nút **Thêm tại playhead** / **Thay element đang chọn** / **Áp cho cả video** theo loại. Có element đang chọn mà bấm một mục thư viện → mục "Áp lên element đang chọn" ghim đầu tab.
  - **Lớp**: bảng lớp tại playhead (dời từ panel trái Thành phần; panel trái giữ Tại đây / Tất cả / Đã chỉnh).
  - **Dự án**: nội dung "không chọn gì" hiện nay (điểm 5 bước, việc thiếu, Cài đặt dự án) + ghi chú ghim.
  - Chọn element → nhảy Thuộc tính; Esc / bỏ chọn → về tab trước đó; người dùng bấm tab khác trong lúc đang chọn thì giữ tab đó tới lần chọn sau. Tab lưu `avs.rtab`.
- **Thuộc tính dạng mục xếp chồng** (như Premiere / Illustrator) thay tab con: mỗi tab cũ thành một mục thu gọn được (nhớ trạng thái theo loại element), dải mục dính trên đầu để nhảy nhanh (cuộn theo mục đang thấy). `addInspectorTab` giữ nguyên chữ ký (trả `[key, label, html]`) nên tính năng cũ chạy ngay, chỉ đổi cách vẽ.

## 5. Ma trận

| | Mục |
|---|---|
| **Giữ** | Thanh bước + thư viện bên trái; thanh nổi (M140) cho thao tác nhanh; nội dung tab Dự án (M113/M114/M137); `addInspectorTab` (chữ ký cũ); bảng Lớp của M142 (logic giữ, đổi chỗ); Ghi chú cho Claude (`.studio/notes.md`). |
| **Nâng cấp** | `#insp` một chế độ → nhóm 3 tab có tự đổi + ghim; tab con → mục xếp chồng + dải mục; Lớp từ trái sang phải; ô màu / font → thương hiệu trước; Ghi chú → ghim trên khung. |
| **Thêm** | Chi tiết mục thư viện ở cột phải (+ Thêm / Thay / Áp cả video); Núm điều chỉnh (bảng ánh xạ có kiểm; "Gợi ý núm" bằng Claude khi bấm); Hỏi Claude sửa element (bản vá có kiểm, xem trước, một bước hoàn tác); Biến thể 3 phương án. |
| **Loại** | Kéo thả panel tự do / nhiều workspace như Adobe (một người dùng, 3 cột cố định là đủ; chỉ nhớ tab). Cột phải co giãn bằng chuột (để sau). Chat Claude thường trực một cột như Claude Design (Studio đã có AI dựng; chỉ thêm ô hỏi theo element). |

## 6. Mục và PR (300–800 dòng mỗi PR)

| Mục | Nội dung | Phụ thuộc | Tệp chính |
|---|---|---|---|
| `M145` | Khung cột phải: nhóm tab Thuộc tính · Lớp · Dự án, tự đổi + ghim, `avs.rtab`; API `Studio.right` (`show(tab)`, `addTab`, `setDetail(html, opts)` cho M147); dời bảng Lớp sang tab Lớp; tab Dự án = `projectPanel()`. | — (nền) | `studio/studio.js` (`renderInspector` vỏ ngoài), `studio/index.html`, `studio/studio.css`, `67_layers.js`, `features/68_right.js` + `.core.js` |
| `M146` | Thuộc tính dạng mục xếp chồng: tab con → mục thu gọn (nhớ theo loại), dải mục dính + cuộn theo mục, đầu cố định có khoá / ẩn / ⋯ (dùng bảng lệnh M140). | `M145` | `studio/studio.js` (`renderInspector` phần trong), `studio.css` |
| `M147` | Chi tiết mục thư viện: bấm (hoặc Enter) một mục bên trái → Thuộc tính hiện chi tiết + Thêm / Thay / Áp cả video; đọc dữ liệu có sẵn (`GET /api/templates`, `PACKS`, `HF_CATALOG`, preset chữ). | `M145` | `studio/library.js` (sự kiện chọn mục), `features/69_libdetail.js` + `.core.js` |
| `M148` | Núm điều chỉnh + thương hiệu trước: bảng núm theo loại cảnh / gói / khối (lõi thuần, có test), mục "Núm" đầu Thuộc tính; ô màu / font hiện bộ thương hiệu trước (cả thanh nổi). | `M146` | `features/71_knobs.js` + `.core.js`, `66_canvas_cmds.js` (màu) |
| `M149` | Hỏi Claude sửa element + Biến thể: route `studio/routes/72_elem_ai.mjs` (trợ lý `references/assist.md`, trả bản vá trường cho phép, `robust-llm`), mục trong Thuộc tính, xem trước khác biệt, Nhận / Bỏ; 3 biến thể dựng ảnh nhỏ từ preview. | `M146` | `features/72_elem_ai.js`, route mới |
| `M150` | Ghi chú ghim trên khung: ghim (x, y, t) trên preview, danh sách + "Giao Claude sửa hết" ở tab Dự án; ghi vào `note` như cũ để `.studio/notes.md` không đổi định dạng. | `M145` | `features/73_pins.js`, `03_nextstep.js` (một mục) |

**Song song**: `M145` trước (nền, một phiên). Sau đó 3 phiên song song `M146`, `M147`, `M150` (tệp riêng; `M146` giữ `renderInspector`, hai mục kia chỉ dùng API `Studio.right`). Sau `M146`: 2 phiên song song `M148`, `M149`.

## 7. Quyết định cần chốt

- **`C21`**: Lớp nằm ở đâu. Đề xuất: tab **Lớp** cột phải (cạnh Thuộc tính như Photoshop); panel trái Thành phần giữ Tại đây / Tất cả / Đã chỉnh.
- **`C22`**: tab con của inspector thành mục xếp chồng. Đề xuất: có (như Premiere Properties) + dải mục nhảy nhanh; Chế độ Cơ bản ẩn mục Keyframe / Mặt nạ / Nâng cao như ẩn tab hôm nay.
- **`C23`**: Hỏi Claude / Gợi ý núm / Biến thể tốn lượt Claude. Đề xuất: chỉ chạy khi người dùng bấm, dùng mô hình đã chọn ở Mô hình & giọng (Ollama được), không tự gọi.

## 8. Rủi ro

- `renderInspector` là chỗ nhiều tính năng gắn vào (`_insp`, `ITAB`, `data-itab`, `03_nextstep` vẽ `projectPanel`): `M145` chỉ bọc vỏ, giữ id `#insp` cho phần Thuộc tính để selector cũ (`#insp [data-f=…]`, `Studio.workflow.focus`, test `s19_sidebar`) còn chạy.
- 340 px chật cho dải 3 tab + dải mục: tab chỉ icon + chữ ngắn, kiểm ở 1024 / 1280 / 1440 px (bài học: thanh trên tràn ngang khi thêm phần tử).
- Bản vá của Claude (`M149`) phải lọc theo danh sách trường cho phép theo loại element và kiểm kiểu, không áp JSON tự do.
