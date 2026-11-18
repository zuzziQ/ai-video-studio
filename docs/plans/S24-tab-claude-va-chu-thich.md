# S24 — Tab Claude ở cột phải, chế độ chú thích trên khung, tách AI khỏi chỉnh tay

Lập 2026-11-18. Mục ROADMAP: `M170`–`M175`, quyết định `C34`–`C37`. Nguồn: chủ repo yêu cầu sau `S23`:

1. Điểm và lý do từng bước đã hiện khi rê chuột lên thanh bước (`M164`), vậy tab Dự án ở cột phải còn cần không?
2. Nếu không, chuyển Hỏi Claude thành một tab ở cột phải cho gọn: câu trả lời dài, cột phải cao hết màn hình là chỗ hợp lý nhất.
3. Element (chữ, clip) có cần ô hỏi / ghi chú Claude riêng không, hay gom hết vào tab Claude để tách rõ phần dùng AI với phần
   chỉnh tay chuyên nghiệp? Ghim ghi chú bấm trên khung có chuyển sang cột phải không?
4. Đặt câu hỏi ngay trên khung kiểu "chọn element / chú thích" của Claude có hợp không?

## 1. Hiện trạng (main sau `#214`)

| Vùng | Hiện giờ | Vấn đề |
|---|---|---|
| Cột phải, không chọn gì | Tab Dự án (`03_nextstep.js`): tiêu chí đạt / thiếu của bước đang mở + nút Sửa, khối "Ghi chú cho Claude (N)" của ghim (hook `S._proj`), mục thu gọn "Cài đặt dự án" | Tiêu chí trùng popover điểm trên thanh bước (`03_stepscore.js`, `M164`) |
| Hỏi Claude | `75_ask.js` hai dạng theo `LayoutCore.askPos`: Cơ bản + video dọc = cột 380 px thay cột phải; còn lại (video ngang, Chuyên nghiệp, cửa sổ < 1280 px) = một dòng 47 px dưới khung, gợi ý và kết quả bung lên khi gõ | Hai dạng, hai bộ CSS; dạng dòng ăn chiều cao khung và không có chỗ cho câu trả lời dài; không giữ lịch sử hỏi đáp |
| Cột phải, chọn element | Chuyên nghiệp: tab Thuộc tính · Lớp · Dự án (`S21`). Trong Thuộc tính có mục "Hỏi Claude" của element (`72_elem_ai.js`, `M149`: ô nhập, gợi ý nhanh, 3 biến thể) và ✦ trên thanh nổi | Ba lối vào Claude cho cùng một element (mục Thuộc tính, ✦, thanh Hỏi Claude với chip element); AI lẫn trong ô chỉnh tay |
| Ghim ghi chú | `73_pins.js`: nút "Ghim ghi chú" / phím C, bấm lên khung = ghim vào element dưới điểm bấm hoặc ghim chung (`TL.pins`), ghi `.studio/notes.md`; danh sách ở tab Dự án; "Giao Claude sửa hết" chỉ chép câu lệnh (`C23`) | Ghim chỉ là ghi chú để sau, không hỏi ngay được; không chú thích được một vùng (chỉ một điểm) |

Lõi bố cục (`76_layout.core.js`) đang ra `right = panel | claude | none` và `askPos = side | bottom`; Cơ bản + video ngang
không có cột phải.

## 2. Hướng: AI ở một chỗ, chỉnh tay ở một chỗ

- **Cột phải có tab Claude ở cả hai chế độ, mọi khổ video.** Bỏ dạng dòng dưới khung và dạng cột cạnh khung của `M163`; khung
  video lấy lại phần đó. Cột phải của Cơ bản giống hệt Chuyên nghiệp (`C35`): cùng vị trí, cùng tab **Thuộc tính · Lớp ·
  Claude** (bỏ Dự án; Cơ bản vẫn ẩn Lớp theo `M151`), cùng gấp `]`, cùng luật cửa sổ hẹp của `M168`; khác nhau chỉ ở số mục
  chỉnh tay trong Thuộc tính (bảng mức `01_level.core.js`). Không có ngăn trượt riêng cho Cơ bản.
- **Tab Claude là một luồng hội thoại của dự án:** chip phạm vi (khoảng thời gian → element / clip → vùng chú thích → bước), gợi
  ý nhanh theo phạm vi, câu hỏi và câu trả lời xếp theo thời gian (cuộn được, lưu `.studio/ask_log.json`), kết quả sửa video
  hiện thành thẻ có nút Xem (mở `Studio.review`). Thanh Nhận / Bỏ của `Studio.review` vẫn nằm ngay dưới khung vì gắn với bản
  đang xem trước. Phím `/` mở tab và đặt con trỏ vào ô hỏi; một nút ✦ ở thanh nút phát làm việc tương tự.
- **Thuộc tính chỉ còn chỉnh tay** (ô nhập, Núm, keyframe, mặt nạ…). Bỏ mục "Hỏi Claude" của `72_elem_ai.js` và ✦ trên thanh
  nổi; thay bằng một nút nhỏ "Hỏi Claude về mục này" ở đầu Thuộc tính: chuyển sang tab Claude với chip element. Luồng bản vá /
  3 biến thể của `M149` giữ nguyên, chỉ đổi chỗ gọi (từ tab Claude).
- **Chế độ chú thích thay chế độ ghim** (học "select element / annotate" của Claude): phím C hoặc nút ở thanh nút phát.
  - Bấm lên element: chọn element + ô hỏi nổi ngay tại điểm bấm.
  - Kéo một hình chữ nhật: chú thích một vùng (x, y, w, h theo px thiết kế, t = playhead; Shift + kéo trên thước vẫn là khoảng
    thời gian). Hợp cho chỗ không có element (mặt người, nền, một góc video gốc).
  - Ô hỏi nổi có hai nút: **Hỏi ngay** (gửi vào tab Claude với phạm vi đó, chạy luôn) và **Để sau** (lưu như ghim hiện giờ, giao
    Claude sửa hết một lần). Đúng `C23`: chỉ gọi mô hình khi người dùng bấm.
  - Mỗi chú thích là một chấm số (hoặc khung vùng) trên khung; danh sách chú thích nằm trong tab Claude (thay khối "Ghi chú cho
    Claude" của tab Dự án); bấm chấm → tab Claude cuộn tới chú thích đó. `.studio/notes.md` giữ định dạng cho Claude Code đọc.
  - Hỏi về vùng: route `75_ask` nhận phạm vi `region` (toạ độ + t), server cắt ảnh khung tại t làm ngữ cảnh cho mô hình.
- **Bỏ tab Dự án.** Tiêu chí đạt / thiếu đã ở popover thanh bước; "Cài đặt dự án" (tên, thương hiệu, khổ) chuyển vào bước
  Chuẩn bị ở thanh trái; nút "Sang bước" đã có trên thanh bước. Cột phải không chọn gì: Chuyên nghiệp mở tab Claude.

## 3. Rủi ro và cách giữ

| Rủi ro | Cách giữ |
|---|---|
| Cơ bản + video ngang thêm cột phải → khung 16:9 nhỏ đi | `C35`: dùng chung luật của Chuyên nghiệp — gấp `]`, cửa sổ hẹp theo `M168`; đo lại ma trận `s23_layout_matrix` |
| Bỏ dạng dòng dưới khung làm mất "hỏi nhanh không rời mắt khỏi video" | Chế độ chú thích hỏi ngay trên khung; `/` vẫn mở ô hỏi |
| Người quen mục Hỏi Claude trong Thuộc tính | Nút "Hỏi Claude về mục này" ở đúng chỗ cũ; ghi `references/studio.md` |
| Lịch sử hỏi đáp phình to | `.studio/ask_log.json` giữ 200 lượt gần nhất; không lưu ảnh, chỉ toạ độ |
| Ghim cũ (`TL.pins`, `obj.note`) | Đọc như chú thích "Để sau" kiểu điểm; không đổi định dạng `notes.md` |
| `studio/server.mjs` là tệp nóng | Phạm vi `region` và `ask_log` nằm trong `studio/routes/75_ask.mjs`; ghi `notes.md` giữ `writeNotes` sẵn có |

## 4. Mục và file

| Mục | Việc | File chính | Không đụng |
|---|---|---|---|
| `M170` | **Nền:** lõi bố cục ra `right = panel / none` thay `askPos` cho cả hai chế độ; cột phải có tab Claude ở mọi khổ × chế độ; Cơ bản dùng chung cột phải với Chuyên nghiệp (`C35`); `75_ask.js` một dạng (tab), bỏ dạng dòng + cột cạnh khung; `/` và ✦ ở thanh nút phát | `76_layout.core.js`, `76_layout.js`, `75_ask.js` (vỏ), `studio.css` khối cột phải, `scripts/tests/s23_layout_matrix.test.mjs` | `75_ask.core.js` (hợp đồng việc), `74_review*.js` |
| `M171` | Nội dung tab Claude: luồng hỏi đáp có lưu (`.studio/ask_log.json`), chip phạm vi, gợi ý nhanh, thẻ kết quả có nút Xem → `Studio.review`, ô đề xuất | `75_ask.js`, `studio/routes/75_ask.mjs` | `studio/server.mjs` |
| `M172` | Thuộc tính chỉ chỉnh tay: bỏ mục Hỏi Claude của element và ✦ trên thanh nổi, thêm nút "Hỏi Claude về mục này"; luồng bản vá / 3 biến thể của `M149` gọi từ tab Claude | `72_elem_ai.js`, phần thanh nổi trong `studio/studio.js` (chỉ lời gọi), `01_level.core.js` (mục Thuộc tính theo mức) | `75_ask.js` (của `M171`) |
| `M173` | Chế độ chú thích thay chế độ ghim: bấm element / kéo vùng, ô hỏi nổi Hỏi ngay / Để sau, danh sách trong tab Claude, phạm vi `region` (cắt ảnh khung tại t) | `73_pins.js`, `73_pins.core.js`, `75_ask.core.js` (thêm phạm vi `region`), `studio/routes/75_ask.mjs` | `09_stage.core.js` (chọn / kéo element) |
| `M174` | Bỏ tab Dự án: tiêu chí bước chỉ ở popover thanh bước, "Cài đặt dự án" sang bước Chuẩn bị, cột phải không chọn gì → Claude (Chuyên nghiệp) | `03_nextstep.js`, `01_level.core.js` (tab cột phải), `01_workflow.js` (panel Chuẩn bị) | `03_stepscore*.js` (chỉ đọc) |
| `M175` | Nghiệm thu: đo 1024 / 1440 / 1920 × 9:16 / 16:9 × 2 chế độ; luồng hỏi bằng chú thích vùng với mô hình thật; cập nhật `references/studio.md`, `DESIGN.md` | test `s24_*`, tài liệu | mã tính năng (chỉ sửa lỗi tìm thấy) |

Mỗi mục một PR, lõi thuần có test `scripts/tests/s24_<mục>.test.mjs`. Không mục nào sửa `studio/server.mjs`,
`scripts/queue.mjs`, `scripts/ai_qc.mjs`.

## 5. Chạy song song (tối đa 4 PR chờ duyệt)

```
Đợt 1          Đợt 2 (sau M170 merge)              Đợt 3
  M170 nền ──►   M171 nội dung tab ──► M173 chú thích   M175 nghiệm thu
                 M172 Thuộc tính chỉ chỉnh tay
                 M174 bỏ tab Dự án
```

- `M170` đổi lõi bố cục và vỏ `75_ask.js`, mọi mục khác dựa vào nó → làm trước, một mình.
- Đợt 2: `M171` (`75_ask.js`, route) ∥ `M172` (`72_elem_ai.js`, thanh nổi) ∥ `M174` (`03_nextstep.js`, `01_workflow.js`).
  `M172` và `M174` cùng `01_level.core.js` → mỗi bên chỉ sửa bảng của mình (mục Thuộc tính / tab cột phải), ai merge sau rebase.
- `M173` sau `M171` (cùng `75_ask*` và route); cùng session với `M171`, hai PR.
- Đợt 3: `M175` một session sau khi `M170`–`M174` merge.

## 6. Ma trận giữ / nâng cấp / thêm / loại

| Giữ | Nâng cấp | Thêm | Loại |
|---|---|---|---|
| `Studio.review` và thanh Nhận / Bỏ dưới khung; hợp đồng việc `75_ask.core.js`; luồng bản vá `M149`; `notes.md`; `C23` | Hỏi Claude thành tab cột phải; ghim thành chú thích (điểm + vùng, hỏi ngay hoặc để sau) | Lịch sử hỏi đáp của dự án; phạm vi `region`; nút "Hỏi Claude về mục này"; ✦ ở thanh nút phát | Thanh Hỏi Claude dưới khung (`C25`); cột Claude cạnh khung (`C30`, `M163`); mục Hỏi Claude trong Thuộc tính và ✦ thanh nổi; tab Dự án |

## 7. Quyết định (chốt 2026-11-18)

- `C34` Hỏi Claude là tab ở cột phải, mọi khổ × chế độ; thay `C25` và phần Claude của `C30`.
- `C35` (khác đề xuất ban đầu) Cơ bản có cột phải giống Chuyên nghiệp ở mọi khổ, chỉ ít mục chỉnh tay hơn; không ngăn trượt
  riêng. Thay `C31` (ngưỡng tỉ lệ khung không còn quyết định chỗ của Claude).
- `C36` Thuộc tính chỉ chỉnh tay; mọi lối vào AI của element đi qua tab Claude.
- `C37` Chế độ chú thích thay chế độ ghim: bấm element hoặc kéo vùng, Hỏi ngay / Để sau; bỏ tab Dự án, "Cài đặt dự án" sang
  bước Chuẩn bị.
