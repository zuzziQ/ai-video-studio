# S12 — Kho dự án theo thương hiệu, đồng bộ thư mục cho cả 5 bước

Lập 2026-11-16. Mục ROADMAP: `M97`–`M102`. Chốt với chủ repo: Kho đặt **theo thương hiệu**; chọn thư mục có sẵn bằng **dán đường dẫn hoặc hộp chọn thư mục** của hệ điều hành; mọi tính năng liên quan dùng chung một bố cục để sau này `S09` đóng gói dự án gửi máy render được.

## 1. Hiện trạng (kiểm kê 2026-11-16)

File vào **7 nơi** khác nhau, phần lớn nằm trong thư mục ẩn `~/.ai-video-studio` (gọi tắt `H`) mà người dùng không thấy trong Explorer/Finder:

| Luồng | File nguồn vào | Dự án tạo ở |
|---|---|---|
| Video mới (`26_pick`, `new_project.mjs`) | `H/uploads/` (chung chỗ với phiên tải YouTube) | cạnh video, hoặc `H/footage/` |
| Tự lái (`15_autopilot`, `queue.mjs`) | `H/autopilot/inbox/`, thư mục canh `~/Movies/AI Video Studio/Thả video vào đây`, `H/telegram/inbox/` | `H/autopilot/projects/<slug>-<md5>` |
| Video dài, video theo chủ đề (`17_longform`) | `H/longform/_uploads/` | `H/longform/highlights/…/NN_x`, `H/longform/topics/…` |
| Media của dự án (`/api/upload`), bước Tài nguyên của hướng dẫn | `P/media/` của dự án đang mở (chưa mở dự án thì không thêm được) | — |
| Thư viện B-roll (`81_brolllib`) | `H/broll_lib/` | chép vào `P/media/lib_*` |
| Logo thương hiệu | `H/brands/<id>/` | chép vào `P/media/brand_<id>.*` |
| Style Lab | `H/stylelab/uploads/` | `H/footage/clip-mau` |

Hệ quả: một video bị chép 2–3 lần; bước 1 "Chuẩn bị" không chuẩn bị được gì cho video sau; mỗi dự án tải lại logo, nhạc, ảnh; thành phẩm nằm rải trong `out/` của từng dự án; `AVS_HOME` được tự tính ở ~20 file.

## 2. Hợp đồng thư mục

### 2.1. Kho (một thư mục thật cho mỗi thương hiệu)

```
<Kho>/                       mặc định: <Videos>/AI Video Studio/<Tên thương hiệu>
  Nguon/                     video quay thô: Video mới, Tự lái, Video dài lấy từ đây; tải lên cũng vào đây
    Tha vao day/             thư mục canh của Tự lái (thay ~/Movies/AI Video Studio/Thả video vào đây)
  Anh/                       ảnh sản phẩm, ảnh dự án
  BRoll/                     video phụ
  Nhac/                      nhạc có quyền dùng
  Thuong hieu/               logo + phông (bản gốc; brand kit trỏ vào đây)
  Du an/<tên>/               mọi dự án Studio tạo cho thương hiệu này (Video mới, Tự lái, clip từ video dài, video chủ đề, biến thể, hàng loạt)
  Thanh pham/<YYYY-MM>/      video xuất xong + ảnh bìa + .srt + nội dung đăng (liên kết cứng tới out/ của dự án, không tốn thêm dung lượng)
  .kho.json                  id thương hiệu, phiên bản bố cục, chỉ mục nhẹ (tên, loại, dung lượng, mtime, sha256 khi cần)
```

- Lưu ở brand kit: khoá `workspace` (đường dẫn tuyệt đối) trong `H/brands.json`. Không có thương hiệu nào → Kho "Chung" (`<Videos>/AI Video Studio/Chung`).
- Ba cách thiết lập ở bước 1: **tự nhớ** (mở Studio, đổi thương hiệu → đúng Kho), **chọn thư mục có sẵn** (dán đường dẫn hoặc hộp chọn thư mục; Studio chỉ đọc và phân nhóm theo đuôi file, không chép, không đòi đúng cấu trúc con), **tải lên** (kéo thả nhiều file → chép vào đúng thư mục con theo loại).
- Thư mục có sẵn không theo cấu trúc: Studio vẫn dùng được; thư mục con nào thiếu thì tạo khi cần ghi (vd. `Du an/`, `Thanh pham/`).
- Kiểm an toàn: mọi đường dẫn Kho đi qua `forbiddenDir` (không nằm trong `H` hay thư mục ẩn của người dùng, không UNC); ghi file chỉ dưới Kho đã đăng ký.
- Hộp chọn thư mục: Windows `System.Windows.Forms.FolderBrowserDialog` qua PowerShell `-STA`, macOS `osascript choose folder`, Linux `zenity --file-selection --directory` nếu có; không có thì chỉ ô dán. Máy chủ Studio chỉ mở hộp khi yêu cầu đến từ phiên đã đăng nhập (token + cùng origin như mọi API).

### 2.2. Trong một dự án (giữ tên cũ, chốt vai trò)

Không đổi tên thư mục bên trong dự án: engine đọc mọi đường dẫn tương đối theo `TL.base`, nhưng `work/`, `media/`, `out/`, `publish/`, `.studio/` đang được ghi cứng ở hàng chục chỗ. Chốt vai trò để tách bạch:

| Thư mục | Vai trò | Gửi máy render (`S09`) |
|---|---|---|
| `timeline.json` | bản dựng | có |
| `media/` | tài nguyên **dùng trong dự án**; mỗi file có tiền tố nguồn: `kho_` (từ Kho, liên kết cứng), `brand_`, `lib_` (thư viện B-roll), `stock_`, `ai_`, `sticker_`, không tiền tố = tải thẳng vào dự án | có (trừ `*_frames/` tạo lại được) |
| `work/` | dữ liệu pipeline sinh ra (lời thoại, A-roll đã cắt, khung, phụ đề, mix, lồng tiếng) | chỉ phần không tạo lại được (`aroll.mp4`, `words*.json`, `captions.json`, `dub_*.wav`) |
| `out/` | thành phẩm của dự án (mp4, ảnh bìa, srt, gói quảng cáo) | không (kết quả trả về) |
| `publish/` | nội dung đăng theo nền tảng | không |
| `.studio/` | trạng thái và cache của Studio (lịch sử, QC, AI, tự lái) | không |
| `source.json` (mới) | nguồn của dự án: đường dẫn Kho tương đối, sha256, dung lượng của video gốc | có |

- Dự án **không chứa đường dẫn tuyệt đối** ra ngoài thư mục của nó: video gốc ghi trong `source.json` theo đường dẫn tương đối với Kho; file từ Kho được liên kết cứng vào `media/kho_*` (khác ổ đĩa thì chép). Điều này là điều kiện của `M70`.
- Biến thể (`<P>_v<i>`) và dòng hàng loạt (`P/batch/…/NN_x`) giữ chỗ hiện tại; biến thể nằm cạnh dự án gốc trong `Du an/`.

## 3. Bản đồ 5 bước sau khi đồng bộ (bỏ chỗ trùng)

| Bước | Hiện nay | Sau `S12` |
|---|---|---|
| Hướng dẫn đầu | Thương hiệu → Tài nguyên (cần dự án đang mở) → Mục đích | Thương hiệu → **Kho** (tạo mặc định / chọn thư mục / tải lên, không cần dự án) → Mục đích |
| 1 Chuẩn bị | Thương hiệu · Sản phẩm · Media (của dự án đang mở) | Thương hiệu · Sản phẩm · **Kho** (thay Media; xem theo loại Nguồn/Ảnh/B-roll/Nhạc, tải lên, đổi thư mục, mở trong Explorer) |
| 2 Nguồn | Video mới, Video dài: mỗi hộp tự tải lên chỗ riêng | Một bộ chọn video dùng chung: **danh sách `Nguon/` của Kho** + "Chọn từ máy" (chép vào `Nguon/`); dự án tạo ở `Du an/`; thương hiệu/gói/khổ lấy sẵn |
| 3 Dựng | Media panel = `P/media`; Tự lái có thư mục riêng; AI b-roll chỉ quét `P/media` + thư viện | Media panel 2 tab **Kho / Dự án này**; Tự lái canh `Nguon/Tha vao day` của Kho theo thương hiệu của hồ sơ; AI dựng, b-roll tự động, nhạc tự chọn ưu tiên `BRoll/`, `Anh/`, `Nhac/` của Kho rồi mới tới kho stock |
| 4 Kiểm tra | `.studio/qc.json` | giữ nguyên (không trùng) |
| 5 Xuất và đăng | `out/` từng dự án; Tự lái chép thêm sang `Đã xong/`; Lịch đăng gom từ nhiều nơi | xuất vào `out/` + liên kết cứng sang `Thanh pham/<YYYY-MM>/`; Tự lái giao hàng cùng chỗ; Đăng và Lịch đăng đọc `Thanh pham/` của Kho |

## 4. Liên quan `S09` (máy trạm → server → máy render)

- Đơn vị đồng bộ lên server là **dự án** (đã tự đủ, chỉ đường dẫn tương đối) + phần Kho mà `timeline.json` thật sự dùng; `.kho.json` có sha256 nên server chống trùng theo Kho (`C09`).
- Bảng "Gửi máy render" ở mục 2.2 là đầu vào của `scripts/project_bundle.mjs` (`M70`).
- Kết quả từ server về `out/` của dự án rồi vào `Thanh pham/` như xuất tại máy.

## 5. Đợt làm (mỗi đợt một PR, 300–800 dòng)

1. **`M97`** lõi Kho + bước 1: `scripts/workspace.mjs`, route/feature `studio/{routes,features}/12_workspace.*`, khoá `workspace` trong brand kit, hộp chọn thư mục, panel Kho thay Media ở bước Chuẩn bị, bước Tài nguyên của hướng dẫn tải vào Kho. Gộp `AVS_HOME` về một hàm dùng chung cho file chạm tới.
2. **`M98`** bước 2: bộ chọn video dùng chung đọc `Nguon/`; Video mới, Video dài, video chủ đề, Tự lái (tải lên, thư mục canh, Telegram) đặt nguồn vào `Nguon/`, dự án vào `Du an/`; `source.json`.
3. **`M99`** bước 3: tab Kho trong panel Media (chèn bằng liên kết cứng `media/kho_*`), AI dựng / b-roll tự động / nhạc ưu tiên Kho, logo brand kit lấy từ `Thuong hieu/`.
4. **`M100`** bước 5: `Thanh pham/<YYYY-MM>/` cho xuất tại máy, xuất nhiều khổ, Tự lái, hàng loạt, biến thể; Đăng và Lịch đăng đọc từ đó.
5. **`M101`** dọn file cũ: liệt kê file trong `H/uploads` (chỉ video, không đụng `*.json` phiên YouTube), `H/autopilot/inbox`, `H/longform/_uploads`, `H/footage`, thư mục canh cũ; người dùng bấm đồng ý mới chuyển vào Kho; dự án cũ giữ chỗ cũ, chỉ ghi vào danh sách gần đây của Kho.
6. **`M102`** tài liệu: `references/studio.md` mục "Thư mục", `SKILL.md`, cập nhật đầu vào của `M70`.
