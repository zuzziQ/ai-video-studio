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

- **`C17`** Điểm có chặn Xuất không. Đề xuất: không chặn; Kiểm tra dưới 60 điểm thì bấm Xuất hiện cảnh báo kèm chỗ thiếu và nút "Vẫn xuất".

## 5. Rủi ro

- `studio/studio.js` dài và nhiều phần dùng chung: `M112` nên đưa phần lịch sử xuất sang một cặp route / feature mới theo hợp đồng `references/studio.md`, chỉ để lại móc nối ở `#export`.
- Đổi cột phải làm lệch hướng dẫn người mới (`S10`) và `PANEL_STEP`: sửa cùng PR với `M113`.
- Điểm dễ thành con số vô nghĩa nếu tiêu chí không khớp gói: tiêu chí phụ thuộc gói (quảng cáo, review…) đọc từ gói, không viết cứng.
