# S13 — Luồng 5 bước gọn lại, soát chất lượng ngay từ lúc dựng

Lập 2026-11-17. Mục ROADMAP: `M103`–`M109`, quyết định `C15`–`C16`. Nguồn: chủ repo thử dự án thật (82x Beauty, gói Review, 78 s, `Du an/mwk0nt0z_FSave.com_Reels…`) sau khi gộp `S12`.

## 1. Hiện trạng (rà soát 2026-11-17)

### 1.1. Chất lượng bản AI dựng

QC của dự án mẫu: 40 điểm trước tự sửa, 54 sau tự sửa, còn 30 lỗi.

| Loại | Số chỗ | Ví dụ |
|---|---|---|
| `face_cover` | 11 | "ĐẸP DA, ĐẸP DÁNG" che 33% mặt; `media_card` che 50% |
| `text_unsafe` + `caption_overlap` | 3 + 2 | `media_card` đè 92% phụ đề |
| `readability` (thẻ trống, số bịa) | 4 | `media_card` trống che mắt; "13%/25% bổ sung collagen" lấy từ "tuổi 25" |
| `spelling` | 4 | "bốc dáng" → "vóc dáng", "sau bên trong" → "sâu bên trong" |
| `empty` | 3 | 12,6 s liền không có graphic |

Nguyên nhân trong code:

- `scripts/ai_edit.mjs` gửi Claude lời thoại, danh mục gói, khung dọc/ngang; **không gửi vị trí mặt, vùng an toàn, vị trí phụ đề**. Cảnh Claude trả về giữ toạ độ mặc định của khối (`rv_*` ở `x 360, y 440–640` trên khung 720×1280), trùng mặt (`timeline.face` = `395, 523`).
- `studio/features/20_ai.js` `applyPlan` áp kế hoạch nguyên trạng, không đặt lại chỗ.
- `timeline.face` là **một điểm cho cả video** (`find_face.py`, 5 khung). Chỉ QC (`scripts/ai_qc.mjs`) mới thấy mặt theo thời gian (khung mẫu khi soát).
- QC tự sửa (`applyDeterministic`) chỉ dời khi `solve` tìm được chỗ trống; bỏ qua cảnh đã có keyframe; không xử lý thẻ trống, số không có trong lời thoại, chính tả, khoảng trống dài. Vì vậy điểm chỉ lên 40 → 54.
- Hộp "Đã dựng xong" có 3 khung xem trước nhưng chưa render (ô trống).

### 1.2. Luồng 5 bước khó hiểu

| Chỗ | Hiện tại | Người dùng hiểu sai thế nào |
|---|---|---|
| Nguồn → Video mới (`wf-new`, `01_workflow.js`) | Thẻ cố định "Tạo dự án từ video thô" kể cả khi đã mở dự án | Chọn video xong vẫn thấy mời tạo dự án; không thấy video đang dùng và kết quả phân tích |
| Nguồn → Video dài (`17_longform.js`) | Luôn hiện cạnh Video mới | Không rõ khác gì Video mới (thật ra: cắt nhiều clip từ video 10–60 phút) |
| Nguồn → AI (`20_ai.js` `renderAi`) | Panel tên "AI": cắt lỗi nói, từ đệm, trạng thái AI dựng | Lời thoại đã ổn thì "AI" để làm gì |
| Dựng → nhóm Dựng nhanh AI | 3 tab Tự lái / AI dựng giúp / Tự động | Tự lái (hàng đợi nền, thả video ra video) lẫn vào bước Dựng của một dự án; Tự động (b-roll + âm thanh) trùng ý với AI dựng giúp |
| Kiểm tra | Chạy sau cùng | Lỗi sinh ra từ lúc dựng, sửa muộn thì nhiều bước |

## 2. Hướng đi

1. **Đặt đúng chỗ từ đầu**: AI dựng giúp biết mặt theo thời gian, vùng an toàn, vị trí phụ đề; sau khi Claude trả cảnh, một bước đặt chỗ tất định (dùng chung bộ giải `solve` của QC) dời/thu nhỏ trước khi áp. Kế hoạch không được có thẻ trống hay con số không có trong lời thoại.
2. **QC nhanh ngay sau khi dựng**: render vài khung + chạy kiểm tra hình học (không gọi Claude) ngay trong hộp "Đã dựng xong"; QC đầy đủ ở bước Kiểm tra chỉ còn xác nhận.
3. **Mỗi bước một việc**: Nguồn = video của dự án này (+ làm sạch lời nói); Dựng = một nút AI dựng; việc chạy nền (Tự lái) và việc tách nhiều clip (Video dài) ra khỏi luồng một dự án.

Chỉ tiêu nghiệm thu trên dự án mẫu (dựng lại bằng gói Review): `face_cover` = 0, không thẻ trống, không số bịa, điểm QC **trước** tự sửa ≥ 75.

## 3. Mục

| Mã | Area | Việc | Phụ thuộc |
|---|---|---|---|
| `M103` | qc | Mặt theo thời gian: `find_face.py` ra `work/face_track.json` (hộp mặt mỗi ~0,5 s, nhãn đang nói); `timeline.face` giữ làm điểm đại diện. Hàm dùng chung `faceAt(t)` | — |
| `M104` | qc | AI dựng giúp né mặt: gửi Claude vùng cấm (mặt, phụ đề, vùng an toàn của nền tảng) theo đoạn; sau khi nhận cảnh, đặt chỗ tất định bằng `solve` của `ai_qc.mjs` (tách ra `scripts/layout_solve.mjs`), rồi mới `applyPlan`. Kiểm kế hoạch: bỏ `media_card`/thẻ không có nội dung, bỏ số liệu không xuất hiện trong lời thoại (hoặc đổi sang chữ không số) | `M103` |
| `M105` | qc | QC nhanh sau AI dựng: render 3 khung (đúng 3 ô trong hộp "Đã dựng xong"), chạy kiểm tra hình học (`face_cover`, `text_unsafe`, `caption_overlap`, `empty`) không gọi Claude, hiện danh sách lỗi + nút "Sửa ngay" | `M104` |
| `M106` | qc | QC tự sửa mạnh hơn: dời cả cảnh có keyframe (dời cả đường đi), ẩn thẻ trống, đánh dấu số không có trong lời thoại, lấp khoảng trống dài bằng chữ nhấn từ khoá, nhận sửa chính tả từ AI soát lời thoại (`M90`/`M96`) | `M104` |
| `M107` | infra | Bước Nguồn theo trạng thái: thẻ "Video nguồn" (tên, độ dài, chỗ trong Kho, đã tách lời thoại/phụ đề/mặt chưa, nút Đổi video, Tạo dự án khác); chưa có dự án mới hiện bộ chọn. Panel "AI" đổi thành "Làm sạch lời nói" và gộp vào tab Lời thoại. "Video dài" đổi tên "Cắt clip từ video dài", chỉ gợi ý khi video nguồn > 5 phút (vẫn mở được từ ⋯) | — |
| `M108` | infra | Bước Dựng một nút "AI dựng": AI dựng giúp + tuỳ chọn "Thêm b-roll", "Thêm âm thanh" (chính là Tự động, chạy nối sau); xong mở hộp `M105`. Tự lái ra khỏi bước Dựng theo `C15` | `M105`, `C15` |
| `M110` | qc | Video nguồn có phụ đề cháy sẵn: dò, báo ở thẻ Video nguồn, chọn tắt / dời phụ đề mới hoặc che dải chữ cũ (phát sinh khi đo `M104`) | `M107` |
| `M111` | qc | Chữ graphic không bị cắt "…" giữa từ khoá; emoji cờ hiện thành chữ trên Chrome Windows (phát sinh khi đo `M104`) | — |
| `M109` | docs | `references/studio.md` (bước, panel), `references/ai-edit.md`, `references/qc-variants.md`, `references/autofill.md`, hướng dẫn người mới (`S10`), `SKILL.md` | `M103`–`M108` |

Kết quả `M103`–`M104` (2026-11-17): new_project đã có `timeline.face_track` nên `M103` chỉ thêm `faceZone`; `M104` không tách `layout_solve.mjs` (dùng thẳng `applyDeterministic` qua `placePlan`), vùng mặt gửi Claude là của cả video. Trên dự án mẫu: che mặt 11 → 0, QC đầy đủ có Claude 48 (chính tả phụ đề, khoảng trống, phụ đề cháy sẵn, chữ bị cắt) → phần nghiệm thu còn lại ở `M106`, `M110`, `M111`.

Kết quả `M105` (2026-11-17): `scripts/qc_quick.mjs` + job `qc_quick` (`/api/qc/quick`), tự chạy khi hộp "Đã dựng xong" mở (`C16`); ảnh 3 ô lấy từ chính các khung QC render (không qua `/api/still`). Kiểm tra ~8 s, "Sửa ngay" ~27 s trên clip mẫu 31,6 s.

Kết quả `M107` (2026-11-17): thẻ Video nguồn đọc `source.json` qua `GET /api/source` (dự án cũ không có thì ghi "chưa ghi video gốc"); "Đổi video" mở hộp tạo dự án mới (dự án hiện tại giữ trong Kho), "Tạo dự án khác" mở trang chủ. Trạng thái AI dựng giúp rời bước Nguồn sang panel AI dựng ở bước Dựng, để `M108` gộp tiếp.

Kết quả `M106` (2026-11-17, đo trên bản sao `sample/clip-mau`, chưa đo trên 82x): AI dựng giúp thật rồi QC đầy đủ có Claude: `face_cover` 0, thẻ trống 0, số bịa 0, điểm trước tự sửa 75 (đạt chỉ tiêu trên clip mẫu), sau tự sửa 89; bản có graphic giả: QC nhanh 7 lỗi → 0. Thẻ lớn che mặt trên khung dọc được đặt lên phụ đề và ẩn phụ đề lúc hiện (thẻ ≤ 3,6 s); sửa chính tả phụ đề không bao giờ đổi con số.

Kết quả `M108` (2026-11-17, đo trên bản sao `sample/clip-mau`): bước Dựng còn một mục "AI dựng" (nút + Thêm b-roll, Thêm âm thanh), Tự động chạy nối trong cùng bước hoàn tác rồi mở hộp "Đã dựng xong" của `M105`; cả luồng ~70 s trên clip 31,6 s (Claude ~31 s, Tự động, QC nhanh 13 s). Tự lái là màn hàng đợi riêng (bước ẩn `queue`) mở từ nút trên thanh đầu; tab Tự động chuyển sang mục B-roll để tuỳ chỉnh.

Thứ tự đề xuất: `M103` → `M104` (kéo điểm nhiều nhất) → `M105` → `M106`; `M107` làm song song được (không đụng file của nhóm QC). `M104` và `M106` đều sửa `scripts/ai_qc.mjs` (tệp nóng): làm lần lượt.

## 4. Quyết định (chốt 2026-11-17: theo đề xuất)

- **`C15`** Tự lái đặt ở đâu. Đề xuất: nút "Tự lái" trên thanh đầu (cạnh Kho/thương hiệu) mở màn hàng đợi riêng, không thuộc bước nào; bước Nguồn có một dòng "Có nhiều video? Thả vào `Nguon/Tha vao day/` để Tự lái làm hết".
- **`C16`** QC nhanh tự chạy sau AI dựng hay chờ bấm. Đề xuất: tự chạy (chỉ render 3 khung + kiểm hình học, ~10–20 s, không tốn lượt Claude); QC đầy đủ có Claude vẫn chờ bấm.

## 5. Rủi ro

- Đặt chỗ tất định có thể thu graphic quá nhỏ khi mặt chiếm giữa khung dọc: cho phép đổi sang vị trí trên/dưới và rút thời lượng cảnh; quá nhỏ thì đổi thành chữ 2 dòng (đường `reflow` có sẵn).
- `face_track.json` thêm thời gian tạo dự án: chạy trên khung 30 fps đã tách, lấy mẫu thưa, mục tiêu < 5 s cho video 60 s.
- Đổi tên/di chuyển panel làm lệch hướng dẫn người mới (`S10`) và `PANEL_STEP`: sửa cùng PR với `M107`/`M108`.

Kết quả `M110` (2026-11-17): dò phụ đề cháy sẵn bằng ffmpeg + cạnh dọc (không OCR), lưu `.studio/burnin.json`; chọn cách xử lý ở thẻ Video nguồn ghi `timeline.burnin.mode`, engine áp. Ngưỡng cạnh 40 báo nhầm kính / tay trên clip mẫu không chữ, nên dùng 80. Bản sao clip mẫu có chữ cháy: QC không Claude 52 → 67.

## 6. Kiểm nghiệm thu đợt (`M109`, 2026-11-17)

Máy làm đợt này không có dự án 82x, nên mọi số đo của `M105`–`M111` là trên bản sao `sample/clip-mau` (31,6 s, khung dọc). Riêng `M104` đo trên bản sao dự án 82x (trước khi dự án rời máy).

| Chỉ tiêu (mục 2) | Clip mẫu | Dự án 82x |
|---|---|---|
| `face_cover` = 0 | Đạt: AI dựng giúp thật + QC đầy đủ có Claude ra 0 (`M106`) | Đạt sau `M104` (11 → 0, dời 9 graphic); chờ đo lại sau `M106`–`M111` |
| Không thẻ trống | Đạt: 0 (`M106`) | Chờ chủ repo đo |
| Không số bịa | Đạt: 0 (`M106`); `validate` của AI dựng giúp bỏ cảnh có số không nói (`M104`) | Chờ chủ repo đo |
| Điểm QC **trước** tự sửa ≥ 75 | Đạt vừa đủ: 75 (sau tự sửa 89); Claude chấm dao động ±5 giữa các lượt (75 / 70) | `M104` ra 48 vì chính tả phụ đề, khoảng trống, phụ đề cháy sẵn, chữ bị cắt "…", emoji cờ; các nguyên nhân này đã có sửa ở `M106`, `M110`, `M111` nhưng **chưa đo lại** |

Luồng (mục 1.2), kiểm trong trình duyệt trên clip mẫu ở 1440×900 và 1024×700, không tràn ngang:

| Chỗ | Sau S13 |
|---|---|
| Nguồn → Video mới | Thẻ Video nguồn theo trạng thái (`M107`), báo phụ đề cháy sẵn + ba cách xử lý (`M110`) |
| Nguồn → Video dài | "Cắt clip từ video dài", chỉ hiện trên thanh trái khi video > 5 phút (thử bằng giả lập 400 s), luôn có trong ⋯ và trang chủ |
| Nguồn → AI | "Làm sạch lời nói", tab thứ hai của Lời thoại |
| Dựng → Dựng nhanh AI | Một nút AI dựng (+ Thêm b-roll, Thêm âm thanh), xong mở hộp có QC nhanh (~70 s cả luồng trên clip mẫu, `M108`); Tự lái lên thanh đầu (`C15`) |
| Kiểm tra chạy sau cùng | QC nhanh tự chạy ngay sau AI dựng (`C16`, ~8 s, không Claude); QC đầy đủ vẫn ở bước Kiểm tra |

Còn chờ chủ repo (trên máy có dự án 82x): dựng lại dự án mẫu bằng gói Review, chạy AI dựng (bật Thêm b-roll, Thêm âm thanh), xem QC nhanh, rồi QC đầy đủ có Claude; ghi `face_cover`, thẻ trống, số bịa, điểm trước / sau tự sửa vào mục `M109` của ROADMAP. Video gốc 82x tải từ Reels nên cũng là ca thật đầu tiên cho dò phụ đề cháy sẵn (`M110` chỉ thử trên chữ drawtext giả). Còn mở: số nghe nhầm ("15 đến 3 phút") QC không tự sửa, cần Nghe lại bằng AI (`M95`).

Tài liệu đã cập nhật: `references/studio.md` (bước, panel, Tự lái, route `14_source`, `/api/qc/quick`), `references/ai-edit.md`, `references/qc-variants.md` (loại lỗi mới, tự sửa của `M106`, mục 1b QC nhanh), `references/autofill.md`, `SKILL.md`. Hướng dẫn lần đầu (`02_onboarding`, `S10`): chỉ sửa mô tả trang chủ trong `references/studio.md`; nội dung hướng dẫn và cột phải để `M113`.
