# Bộ thử người mới cho đợt S10 (dùng cho `M88`)

Mục `M87` soạn, chủ repo chạy ở `M88`. Đo xem đợt `S10` (5 bước, hướng dẫn lần đầu, gộp chỗ trùng, token 82X) có giúp người **chưa từng dùng Studio** làm ra video đầu tiên nhanh hơn, ít kẹt hơn không.

## 1. Mục tiêu

- **Chính:** thời gian từ lúc mở Studio tới lần bấm Xuất đầu tiên thành công (ra file MP4).
- **Phụ:** số lần bấm, số chỗ bị kẹt (người thử dừng > 20 giây hoặc hỏi), điểm SUS rút gọn.
- **Đạt:** sau S10 nhanh hơn trước S10 ít nhất 30 % theo trung vị, và không nhiệm vụ nào có hơn 1 chỗ kẹt ở quá nửa số người thử.

## 2. Người thử và chuẩn bị

- 2–3 người **chưa mở Studio lần nào**, biết dùng máy tính và mạng xã hội; không phải lập trình viên. Ghi lại: tuổi, nghề, đã từng dựng video bằng gì (CapCut, Premiere, không).
- Mỗi người thử **một** bản (trước hoặc sau) để không học bài; nếu chỉ có 2–3 người thì chia: người 1 thử "trước", người 2–3 thử "sau", rồi mời thêm người khi có thể. Nếu bắt buộc một người thử cả hai bản: thử "sau" trước, cách nhau ≥ 1 tuần, và ghi rõ trong bảng.
- Máy: cùng một máy, màn hình 1280×800 trở lên, trình duyệt Chrome, đã cài đủ phụ thuộc (`studio.cmd` / `./studio.sh` chạy được), mạng ổn định.
- Thư mục home riêng cho mỗi lượt để không lẫn brand kit, sản phẩm, trạng thái hướng dẫn của lượt trước:
  ```bash
  AVS_HOME=$PWD/.tmp-ux-<tên> node studio/server.mjs --port 5199
  ```
  Thêm `.tmp-ux-*/` vào `.git/info/exclude`. Xoá thư mục này sau lượt thử.
- Tài nguyên đưa cho người thử (để trên Desktop): clip mẫu `sample/video-goc.mov`, một file logo PNG, một ảnh sản phẩm. Không đưa thêm hướng dẫn nào.
- Người quan sát: một người, ngồi bên cạnh, **không chỉ đường**. Chỉ được nói câu cố định khi người thử kẹt quá 2 phút: "Bạn thử tìm ở thanh trên hoặc thanh trái xem." (tính là một lần gợi ý).
- Ghi màn hình (OBS hoặc Xbox Game Bar) cả lượt; bật hiện click chuột nếu được.

## 3. Bản "trước S10" và "sau S10"

| Bản | Cách lấy | Ghi chú |
|---|---|---|
| Trước S10 | `git worktree add ../avs-before ecb6e4d` (commit cuối trước `M81`/`M82`) | Không có thanh 5 bước, hướng dẫn lần đầu, thẻ Bước tiếp theo, ⌘K (từ `M113` cột phải theo bước đang mở thay thẻ Bước tiếp theo; từ `M114` cột phải có điểm 0–100 từng bước, và bấm Xuất khi bước Kiểm tra dưới 60 hiện hộp cảnh báo có nút Vẫn xuất) |
| Sau S10 | `main` sau khi `M81`–`M87` đã gộp (ghi mã commit vào bảng) | Chạy đúng như người dùng mới: chưa có `onboarding.json` |

Chạy mỗi bản trong thư mục của nó với `AVS_HOME` tạm như mục 2. Cả hai bản dùng cùng clip, logo, ảnh.

## 4. Năm nhiệm vụ

Đọc to từng nhiệm vụ, đưa giấy ghi nhiệm vụ cho người thử. Bấm giờ từ lúc đọc xong tới lúc người thử nói "xong" (hoặc bỏ cuộc). Giới hạn mỗi nhiệm vụ 10 phút; quá thì ghi "không xong" và chuyển nhiệm vụ sau (người quan sát làm hộ phần còn lại để nhiệm vụ sau bắt đầu được).

| # | Nhiệm vụ (câu đọc cho người thử) | Xong khi |
|---|---|---|
| 1 | "Mở phần mềm dựng video này lên và cho tôi biết bạn nghĩ nó dùng để làm gì." | Người thử đã qua màn tác giả và nói được mục đích |
| 2 | "Đặt thương hiệu của bạn: tên là *Tiệm Bánh Mây*, dùng file logo trên Desktop." | Brand kit có tên + logo (bản trước: panel Thương hiệu; bản sau: hướng dẫn lần đầu hoặc Chuẩn bị) |
| 3 | "Làm một video từ clip *video-goc.mov* trên Desktop." | Dự án mở với clip trên timeline, có phụ đề tự động hoặc người thử chủ động bỏ qua |
| 4 | "Cho video một kiểu trình bày đẹp (mẫu hoặc gói style) và kiểm tra phụ đề có đúng không, sửa một chữ sai." | Đổi gói/mẫu ít nhất một lần và sửa được một chữ phụ đề |
| 5 | "Xuất video ra file để đăng TikTok." | Có file MP4 9:16 trong `out/` (bản sau: người thử chưa kiểm tra thì gặp hộp cảnh báo điểm Kiểm tra; ghi lại họ bấm Sửa hay Vẫn xuất) |

## 5. Cách đo

| Số đo | Cách lấy |
|---|---|
| Thời gian mỗi nhiệm vụ (giây) | Bấm giờ tay, đối chiếu lại bằng video ghi màn hình |
| **Thời gian tới lần xuất đầu** | Từ lúc đọc nhiệm vụ 1 tới khi file MP4 của nhiệm vụ 5 xuất hiện (cộng cả thời gian render) và riêng phần thao tác (trừ thời gian chờ render/phụ đề) |
| Số lần bấm | Đếm từ video ghi màn hình (click chuột + phím tắt có tác dụng); không đếm gõ chữ |
| Chỗ kẹt | Mỗi lần dừng > 20 s không thao tác, mở sai panel rồi quay lại, hỏi người quan sát, hoặc nhận gợi ý. Ghi: nhiệm vụ, màn hình/panel, người thử tìm gì |
| Lỗi | Thao tác làm hỏng dự án hoặc phải hoàn tác |
| Hoàn thành | Xong / xong có gợi ý / không xong |

Sau 5 nhiệm vụ, người thử chấm **SUS rút gọn** (5 câu, thang 1–5: 1 = rất không đồng ý, 5 = rất đồng ý):

1. Tôi muốn dùng phần mềm này thường xuyên.
2. Phần mềm này phức tạp hơn mức cần thiết. *(câu đảo)*
3. Phần mềm này dễ dùng.
4. Tôi cần người hướng dẫn mới dùng được. *(câu đảo)*
5. Tôi tự tin khi dùng phần mềm này.

Điểm = (tổng câu 1, 3, 5 trừ 3) + (10 trừ tổng câu 2, 4), nhân 5; thang 0–100, ≥ 68 là dùng được. Hỏi thêm 2 câu mở: "Chỗ nào làm bạn bối rối nhất?" và "Nếu sửa một thứ, bạn sửa gì?".

## 6. Bảng ghi kết quả

Mỗi người thử một bảng; giờ ghi theo giây.

**Người thử:** ____ · **Bản:** trước / sau · **Commit:** ____ · **Ngày:** ____ · **Từng dựng video bằng:** ____

| Nhiệm vụ | Thời gian (s) | Số lần bấm | Chỗ kẹt (số + mô tả) | Gợi ý | Kết quả |
|---|---|---|---|---|---|
| 1. Mở Studio | | | | | |
| 2. Thương hiệu | | | | | |
| 3. Video từ clip | | | | | |
| 4. Mẫu + phụ đề | | | | | |
| 5. Xuất | | | | | |
| **Tổng** | | | | | |

| Thời gian tới lần xuất đầu (tổng / chỉ thao tác) | SUS (5 câu → điểm) | Bối rối nhất | Muốn sửa |
|---|---|---|---|
| | | | |

Bảng tổng hợp (dán vào dòng `M88` của `docs/ROADMAP.md`):

| Người | Bản | Tới lần xuất đầu (s) | Số bấm | Chỗ kẹt | SUS |
|---|---|---|---|---|---|
| N1 | | | | | |
| N2 | | | | | |
| N3 | | | | | |
| **Trung vị trước** | trước | | | | |
| **Trung vị sau** | sau | | | | |

## 7. So trước và sau

- So **trung vị** (không dùng trung bình: chỉ 2–3 người). Ghi cả từng người vì mẫu nhỏ.
- Kết luận theo mục 1. Chỗ kẹt lặp ở ≥ 2 người → mở mục mới trong `docs/ROADMAP.md` (đợt sau), kèm đoạn video ghi màn hình (đặt ngoài repo, chỉ ghi đường dẫn).
- Chỉ ghi số và chỗ kẹt; không ghi tên thật, ảnh mặt hay giọng người thử vào repo.
