# S14 — Kết quả xuất không mất, cột phải đi cùng thanh trái, chấm điểm từng bước

Lập 2026-11-17. Mục ROADMAP: `M112`–`M114`, quyết định `C17`. Nguồn: chủ repo báo khi dùng Studio sau `S13`.

## 1. Hiện trạng

### 1.1. Xuất video

- Nút `#export` (`studio/studio.js`, khoảng dòng 1056–1090) mở hộp chọn chất lượng, khổ, Thành phẩm; xong job thì hiện hộp "Xuất xong" với đường dẫn, các khổ, "Hiện trong Finder", "Mở Thành phẩm", "Mở video" (`<a href="/project/…" target="_blank">`).
- Kết quả chỉ sống trong hộp đó. Người dùng báo: bấm xem video thì trang video hiện ở tab trên cùng, quay lại thì mất thông tin file ở đâu, thư mục nào; panel Xuất (`wf-export`, `studio/features/01_workflow.js`) chỉ có một thẻ với nút "Xuất video".
- Nhãn "Hiện trong Finder" sai trên Windows.
- Cần tái hiện trước khi sửa: trình duyệt thường trên Windows, và cửa sổ app nếu Studio mở kiểu app (link `_blank` có thể thay trang hiện tại).

### 1.2. Cột phải

- Khi không chọn gì, `#insp` hiện thẻ "Bước tiếp theo" + thanh "Sẵn sàng x/6" (`studio/features/03_nextstep.js`, M84): 6 mục có/không (Thương hiệu, Video nguồn, Mẫu, Phụ đề, Kiểm tra, Xuất), một câu + một nút; phần Dự án / Thương hiệu cũ nằm trong "Cài đặt dự án" thu gọn.
- Không đổi theo panel đang mở ở thanh trái (`#rail`, `#lib`), không cho biết mỗi bước làm tới đâu, trùng ý với thanh bước.

Rà lại 2026-11-17 trước khi làm `M113` (sau `M105`–`M112`):

| Khối ở `#insp` (không chọn gì) | Trùng / lệch với | Kết luận |
|---|---|---|
| Lưới 6 nút "Sẵn sàng" (Thương hiệu, Video nguồn, Mẫu, Phụ đề, Kiểm tra, Xuất), mỗi nút mở một panel | Thanh 5 bước `#wf-steps` trên header và `#rail` của bước đó mở đúng các panel này | Trùng: bỏ, thay bằng việc còn thiếu của **bước đang mở** |
| Thanh tiến độ 6 ô "Sẵn sàng x/6" | Thanh bước đã cho biết đang ở đâu; dấu có/không sẽ thành điểm ở `M114` | Bỏ; chỉ giữ "x/y việc xong" của bước đang mở |
| Thẻ "Bước tiếp theo" (một câu + một nút theo cả dự án) | Không theo bước đang mở: đang ở Xuất vẫn có thể bảo "Thêm thương hiệu" | Thay bằng nút đi tiếp theo bước đang mở |
| Mục Kiểm tra đọc `GET /api/qc` (chỉ QC đầy đủ) | QC nhanh `M105` (`.studio/qc_quick.json`) chỉ xem được trong hộp "Đã dựng xong", đóng là mất | Cột phải hiện kết quả QC nhanh ở bước Dựng và Kiểm tra |
| Mục Xuất đọc `GET /api/publish/videos` (file trong `out/`) | `M112` đã có `.studio/exports.json`, panel Xuất có bản gần nhất | Đọc `Studio.exports` (cùng dữ liệu panel Xuất); thêm `edited` (mtime `timeline.json`) vào `GET /api/exports` để báo "đã sửa sau lần xuất" |
| "Cài đặt dự án và thương hiệu" thu gọn (tab Dự án / Thương hiệu của `projectPanel`, `studio/studio.js`) | Không trùng (tham số riêng của dự án) | Giữ nguyên trong mục thu gọn |
| Trang chủ `#onb-home` (`02_onboarding.js`) | Chỉ hiện khi chưa mở dự án; cột phải chỉ vẽ khi đã có `TL` | Không trùng, không đổi |
| Panel Video nguồn `wf-new` đã liệt kê lời thoại / phụ đề / mặt | Cùng dữ liệu với việc thiếu của bước Nguồn | Cột phải tóm tắt, bấm mở panel đó và tô sáng dòng tương ứng |

`PANEL_STEP` trong ROADMAP là bảng `PANELS` của `01_workflow.js` (id panel → bước, thứ tự, mức); không có hằng tên `PANEL_STEP`. `M113` không đổi bước của panel nào, chỉ thêm `Studio.workflow.focus(id, chọn)` (mở panel qua bảng đó rồi tô sáng phần tử) để cột phải và nút sửa của `M114` dùng chung. Hướng dẫn người mới (`02_onboarding.js`) không nhắc tới cột phải; phần cần sửa là mô tả trong `references/studio.md` và bộ thử `docs/ux-test-s10.md`.

## 2. Hướng đi

1. **Bản xuất là dữ liệu của dự án**, không phải một hộp thoại: lưu `.studio/exports.json`, panel Xuất đọc lại được bất cứ lúc nào; xem video trong Studio.
2. **Cột phải là bạn đồng hành của thanh trái**: thanh trái chọn bước / công cụ, cột phải nói bước đó còn thiếu gì và kết quả gần nhất; bấm ở cột phải mở đúng chỗ bên trái.
3. **Điểm thay cho dấu tích**: mỗi bước một điểm có tiêu chí rõ, chỉ ra chỗ thiếu; tính từ dữ liệu sẵn có, không gọi Claude.

## 3. Mục

| Mã | Area | Việc | Phụ thuộc |
|---|---|---|---|
| `M112` | export | Lịch sử xuất `.studio/exports.json`; panel Xuất hiện bản gần nhất + danh sách, Xem trong Studio, Mở thư mục, Mở Thành phẩm, Chép đường dẫn; nhãn theo hệ điều hành; file mất thì đánh dấu | — |
| `M113` | infra | Cột phải theo bước đang mở bên trái: việc thiếu, kết quả gần nhất, nút đi tiếp; bấm mở đúng panel trái; bỏ phần trùng | `M112` (khối bản xuất) |
| `M114` | qc | Điểm 0–100 mỗi bước (Chuẩn bị, Nguồn, Dựng, Kiểm tra, Xuất) với tiêu chí đạt / thiếu và nút sửa | `M105`, `M106`, `M112`, `C17` |

Tiêu chí điểm đề xuất cho `M114` (chỉnh khi làm, ghi lại trong PR):

| Bước | Tiêu chí |
|---|---|
| Chuẩn bị | thương hiệu có tên, logo, màu; có sản phẩm khi gói là quảng cáo |
| Nguồn | có video; đã tách lời thoại, phụ đề, mặt; lời thoại đã làm sạch |
| Dựng | có mẫu; phụ đề bật; không khoảng trống dài; b-roll và âm thanh khi gói cần |
| Kiểm tra | điểm QC nhanh (`M105`); QC đầy đủ khi đã chạy |
| Xuất | có bản xuất mới hơn lần sửa cuối; đã giao Thành phẩm |

## 4. Quyết định

- **`C17`** Điểm có chặn Xuất không. Chốt 2026-11-17 theo đề xuất: không chặn; Kiểm tra dưới 60 điểm thì bấm Xuất hiện cảnh báo kèm chỗ thiếu và nút "Vẫn xuất".

## 5. Rủi ro

- `studio/studio.js` dài và nhiều phần dùng chung: `M112` nên đưa phần lịch sử xuất sang một cặp route / feature mới theo hợp đồng `references/studio.md`, chỉ để lại móc nối ở `#export`.
- Đổi cột phải làm lệch hướng dẫn người mới (`S10`) và `PANEL_STEP`: sửa cùng PR với `M113`.
- Điểm dễ thành con số vô nghĩa nếu tiêu chí không khớp gói: tiêu chí phụ thuộc gói (quảng cáo, review…) đọc từ gói, không viết cứng.
