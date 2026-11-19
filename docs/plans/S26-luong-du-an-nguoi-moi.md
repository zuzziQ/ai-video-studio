# S26 — Chạy thử luồng dự án như người dùng mới

Lập 2026-11-19. Chủ repo: "kiểm tra logic từ lúc tạo dự án mới → ra thành phẩm, mở lại dự án đã lưu → sửa → thành phẩm, để người dùng không vướng mắc hay khó dùng".

## Cách chạy

- Studio ở `main` sau `#223`, `node studio/server.mjs --port 5401`, `USERPROFILE` / `AVS_HOME` tạm (không đụng Kho thật), cửa sổ 1440×900, Windows 11.
- Video: `sample/video-goc.mov` (0:31, 674×1198, HEVC). Render thật 720p trên máy.
- Luồng 1: hướng dẫn đầu (thương hiệu "Nhà Đẹp Thử", Kho mặc định, lĩnh vực Bất động sản, 9:16) → Video mới → 5 bước → Kiểm tra (áp gợi ý) → Xuất → `Thanh pham/2026-11/`.
- Luồng 2: tắt server → bật lại → mở dự án từ thẻ "Dự án gần đây" và từ thanh tab → sửa chữ, dời chữ, đổi nhạc, sửa phụ đề → xuất lại → nạp lại trang → hoàn tác.
- Nhánh: AI dựng (chưa đăng nhập Claude, rồi có Claude), Tự lái từ trang chủ, Chuyên nghiệp, dự án trong Kho thương hiệu, 2 tab cùng dự án, cắt clip từ video dài (3 clip) rồi xuất một clip.

Lưu ý khi thử lại: Studio cố ý ẩn dự án nằm trong thư mục tạm của máy khỏi "Dự án gần đây" (`hiddenRecent`, `M125`). Nếu `USERPROFILE` tạm nằm trong `%TEMP%` thì đặt `TEMP`/`TMP` ra chỗ khác, không thì trang chủ báo "Chưa có dự án nào". Đây không phải lỗi.

## Chạy đúng

- Xuất lại không đè bản cũ: `out/` có 2 file, `Thanh pham/` có `video-goc 9x16.mp4` và `video-goc 9x16 (2).mp4`; panel Xuất có "Bản gần nhất" và "Các bản trước (1)" kèm giờ.
- Xuất tự lưu dự án trước khi render.
- Mở lại từ thẻ trang chủ và từ thanh tab đều đúng dự án, đủ chỉnh sửa.
- Hoàn tác sau khi nạp lại trang lùi đúng 4 bước (phụ đề → nhạc → vị trí → chữ), làm lại đủ.
- Hai tab cùng dự án: tab sau hiện "Dự án đang mở ở tab khác" với "Tạo dự án mới từ video này".
- AI dựng có Claude: 9 graphic, giữ chữ và phụ đề đã sửa tay, có Hoàn tác.
- Cắt clip: 3 khoảnh khắc trong ~30 s, mỗi clip một dự án trong `Du an/buoi-chia-se - clip ngắn/`, xuất một clip vào Thành phẩm của đúng Kho.

## Vướng mắc

Mức: **chặn** = người mới không đi tiếp theo lối được dẫn; **khó hiểu** = đi tiếp được nhưng kết quả sai ý hoặc không biết vì sao; **nhỏ** = chữ, tên, thứ tự.

| # | Bước | Thao tác | Người dùng thấy | Đáng lẽ | Mức | Nghi ngờ |
|---|---|---|---|---|---|---|
| 1 | Hướng dẫn đầu, bước 1/3 | Gõ tên thương hiệu, chưa có logo, bấm Tiếp | "Thêm logo để tiếp tục." Lối khác duy nhất là "Bỏ qua hướng dẫn" (bỏ luôn Kho, lĩnh vực) | Logo không bắt buộc (thêm sau ở Thương hiệu); chỉ cần tên | chặn | `studio/features/02_onboarding.js:255` |
| 2 | AI dựng (sau khi mở lại) | Đã đổi nhạc sang `corporate`, gain −8, lưu; bấm AI dựng | Nhạc về `tech` −18, không báo đã thay nhạc người dùng chọn | Giữ nhạc người dùng đã chỉnh (như chữ có `_orig`), chỉ thay nhạc do AI / mặc định đặt | khó hiểu | `scripts/ai_edit.mjs:408` (lọc mọi nhạc phủ cả video, không chỉ `_ai`) |
| 3 | Tự lái ở trang chủ | Có đúng một thương hiệu (đã chọn ở hướng dẫn), thả video | Ô Thương hiệu mặc định "Theo hồ sơ Tự lái", video và thành phẩm vào Kho **Chung** | Mặc định thương hiệu của hướng dẫn đầu / thương hiệu duy nhất; ghi rõ Kho đích | khó hiểu | `studio/features/02_onboarding.js:527`, cài đặt `brand` của Tự lái |
| 4 | Tự lái xong | Máy chưa đăng nhập Claude | Hàng đợi ghi "xong trong 71s"; bước AI và Đăng là `warn` trong `summary.json`, không hiện ở đâu | Thẻ việc có dòng "Xong, bỏ qua: AI dựng (Claude chưa đăng nhập), Đăng" + lối sửa | khó hiểu | `studio/features/15_autopilot.js` (dòng hàng đợi), `scripts/autopilot.mjs` (`steps.*.state`) |
| 5 | AI dựng (chưa có Claude) | Mở AI dựng, chọn mục tiêu, gói, bấm Dựng | Điền xong mới biết "Claude Code chưa đăng nhập", câu lỗi in 2 lần (đoạn + khối log) | Kiểm Claude khi mở hộp, báo ngay kèm lối Kiểm tra máy; lỗi in một lần | khó hiểu | `studio/features/20_ai.js:154` |
| 6 | Tạo dự án từ trang chủ (chưa mở dự án nào) | Video mới → Tạo | Danh sách gói trống, tóm tắt "Nhà Đẹp Thử · Dọc 9:16" không có gói; dự án luôn là `slate` dù hướng dẫn chọn Bất động sản | Có danh sách gói khi chưa mở dự án; gói mặc định theo lĩnh vực đã chọn | khó hiểu | `studio/studio.js:992` (`packs()` đọc từ khung preview), `studio/studio.js:1721` (`packFor`) |
| 7 | Kiểm tra, dự án vừa tạo | Kiểm tra & gợi ý sửa | 67 điểm, 2 lỗi nặng ngay từ đầu: 29,7 s không graphic, không hook; "Nhạc quá nhỏ" (thấp hơn giọng 43,6 dB) và "Chọn tất cả" không áp được mục nhạc | Bản khởi đầu đạt cổng QC cơ bản: nhạc mặc định nghe được, có hook; gợi ý nhạc áp được | khó hiểu | `scripts/new_project.mjs:126`, `scripts/highlights.mjs:306` (gain −20), `scripts/ai_qc.mjs:475`, `:826` |
| 8 | Lưu | Sửa rồi để đó 6 s+ | "Chưa lưu", không tự lưu; chỉ hỏi khi đóng tab | Tự lưu sau vài giây không thao tác (có kiểm xung đột 409 sẵn); tắt cửa sổ server không mất bài | khó hiểu | `studio/studio.js:1775` (chỉ `beforeunload`) |
| 9 | Kiểm tra, áp gợi ý | Áp gợi ý "Thiếu hook" | Hook là tên file viết hoa "VIDEO-GOC" | Hook từ lời thoại / tiêu đề; tên file chỉ khi không có gì khác | nhỏ | `scripts/ai_qc.mjs` (sửa `hook_missing`) |
| 10 | Xuất | Xuất lúc 09:21 giờ máy | File `out/video-goc_2026-11-19T02-21-39.mp4` (giờ UTC) | Tên theo giờ máy | nhỏ | `studio/server.mjs:116` (`stamp`) |
| 11 | Thành phẩm | Xuất lần 2 | `video-goc 9x16 (2).mp4`; clip cắt ra tên `01_edit-video-mat-vai-tieng-gio-ai-lam-tu-d 9x16.mp4`; dự án Tự lái `nha-mau-tu-lai-31827a` | Tên đọc được (tiêu đề có dấu), lần xuất sau ghi rõ (giờ hoặc "bản 2") | nhỏ | `scripts/kho_deliver.mjs` (`exportItems`), `scripts/highlights.mjs` (tên thư mục clip) |
| 12 | Hộp chờ tạo dự án / QC | Tạo dự án trên máy mới | Dòng tqdm thô "14%\|#####4 \| 25.2M/176M" và "@@ 0.19 Render…" | Một dòng "Đang tải mô hình nhận giọng (176 MB, lần đầu) 14%" | nhỏ | `studio/studio.js:1767` (`#joblog`), hộp QC |
| 13 | Panel Tự lái trên Windows | Mở Hàng đợi | "Cài một tác vụ nền macOS (LaunchAgent)", "Thông báo macOS", "Thả video vào biểu tượng" | Ẩn trên Windows hoặc ghi cách tương đương | nhỏ | `studio/features/15_autopilot.js:235` |
| 14 | Cắt clip | Số clip 3, dài 6–12 s | Clip 2 dài 14 s | Cắt về trong khoảng đã chọn hoặc ghi vì sao vượt | nhỏ | `scripts/highlights.mjs` |
| 15 | AI dựng | Mở hộp | Mục tiêu video không chọn sẵn Bất động sản dù hướng dẫn đầu đã chọn | Chọn sẵn theo lĩnh vực | nhỏ | `studio/features/20_ai.js` |

Chưa thử: video dài 30–90 phút thật, Đăng / Lịch đăng, Telegram, "Áp cho các clip còn lại" (`M135`), xuất nhiều khổ một lần, máy macOS.

## Chia lát (chủ repo duyệt 2026-11-19)

- `M181` (`area/infra`): người mới đi hết hướng dẫn và có bản khởi đầu đạt QC — #1, #6, #7, #9, #15.
- `M182` (`area/llm`): AI dựng giữ nhạc đã chỉnh tay, kiểm Claude trước khi hiện hộp — #2, #5.
- `M183` (`area/infra`): Tự lái đúng Kho thương hiệu và báo bước bị bỏ qua, ẩn mục macOS trên Windows — #3, #4, #13.
- `M184` (`area/infra`): tự lưu, tên file xuất / thành phẩm đọc được — #8, #10, #11, #14. Có sửa `studio/server.mjs` (`stamp`): một phiên.
- `M185` (`area/infra`, chủ repo thêm khi duyệt 2026-11-19): xuất, AI dựng, Kiểm tra & sửa, tạo dự án mới chạy trong khay việc / thông báo thay hộp giữa màn hình, để người dùng làm việc khác trong lúc chờ — gồm #12.
