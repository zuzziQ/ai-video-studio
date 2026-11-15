# `M66`: render lô song song — bao nhiêu bản cùng lúc × bao nhiêu worker mỗi bản — 2026-11-15

Chỉ đo, không sửa mã sản phẩm. Mã đo: `scripts/bench/batch_parallel.mjs` (gọi `node scripts/render.mjs <tl> <out> --workers W`
như tiến trình con, giống cách `variants.mjs` / `batch.mjs` gọi). Kết quả dùng cho luật lô song song của `M68` và cách đếm lượt của `M64`.

**Đã áp dụng (M68):** luật lô ở `scripts/batch_parallel.mjs` (`batchPlan`), dùng trong `batch.mjs` và `variants.mjs`; xem `references/perf-profile.md` mục "Lô song song".

**Kết quả ngắn:** với lô 6 bản, chạy nhiều bản cùng lúc với ít worker mỗi bản nhanh hơn hẳn cách hiện tại (1 bản × 4 worker, tuần tự).
Tốt nhất là **6 bản × 1 worker**: 1080p 92,9 → **64,5 s** (−31 %), 720p 73,0 → **47,1 s** (−36 %). Phương án dung hoà **3 × 2**:
−23 % / −32 %, bản đầu xong sau ~33 s thay vì 64 s. Tốc độ tăng theo **tổng số Chrome** (= tổng worker) tới ~6 (bằng số nhân thật),
8 Chrome không nhanh hơn 6. Không phiên NVENC nào lỗi tới 10 phiên đồng thời; giới hạn thật trên máy này là **VRAM** (~0,5 GB mỗi Chrome
1080p, 10 Chrome chạm 5,8/6 GB), không phải CPU (trung bình ≤ 88 %) hay RAM (còn trống ≥ 7 GB).

## 1. Máy, dự án, cách đo

- i7-8700K 6 nhân thật / 12 luồng, 32 GB, GTX 1660 Ti 6 GB (driver 621.24), Windows 10 19045, Node 24.22, ffmpeg 9.0.2.
  Chrome GPU + `chrome-headless-shell` + không vsync (`M50`, `M57`), NVENC (`M52`, encoder `auto` dò được `h264_nvenc`).
  VRAM nền lúc rảnh ~0,9 GB (màn hình, ứng dụng khác).
- Mã render đo trên commit `1ad35af` (trước `M64`). Kiểm lại trên `main` sau `M64` (`9a003d9`): 3 × 1 720p ra 34,9 s và **cùng file**
  (SSIM như cũ) — số đo vẫn đúng. Lưu ý: từ `M64`, `render.mjs` xin "lượt render" cả máy (mặc định 1 lượt); không đặt
  `AVS_RENDER_SLOTS` thì 3 render song song bị xếp hàng tuần tự (cùng phép đo ra 94,8 s). Script đo tự đặt `AVS_RENDER_SLOTS=0`
  và `AVS_PERF_PROFILE=can-bang` cho tiến trình con.
- Dự án: bản chép `sample/clip-mau` (gói `slate`, 1080×1920, 947 khung), và bản `neon` 720×1280 (cùng timeline, cùng khung A-roll),
  khung trích theo mục 5 của `docs/perf/2026-11-13-baseline.md`. Không mux tiếng. Lô 6 bản = 6 lần render **cùng một timeline** ra
  6 file (khung A-roll nằm trong cache đĩa sau lượt đầu: lô thật với 6 dự án khác nhau sẽ đọc đĩa nhiều hơn một chút).
- Cấu hình `P×W`: P bản chạy cùng lúc (hàng đợi: bản xong thì bản kế vào), mỗi bản `--workers W`. Mỗi cấu hình 3 lượt
  (`4×2`, `2×4`, `6×1` thêm sau: 2 lượt), các lượt xoay vòng thứ tự cấu hình để tải nền rải đều; số trong bảng là **trung vị**.
- Trước mỗi lượt: chờ CPU cả máy < 15 % và NVENC < 10 % trong 10 s (`os.cpus()`, `nvidia-smi`), tối đa 10 phút rồi chạy và đánh dấu
  nhiễu. Phiên `M64`/`M65`/`M67` chạy song song nên tổng thời gian chờ ~40 phút; **một lượt bị nhiễu**: 1080p `1×4` lượt 1 (chờ hết
  10 phút, lúc bắt đầu NVENC 20 % do phiên khác) — số của nó (95,8 s) nằm ngoài trung vị.
- Lấy mẫu mỗi giây trong lúc chạy lô: CPU cả máy (trung bình), RAM trống (thấp nhất), `nvidia-smi -lms 500`: VRAM dùng (cao nhất),
  `utilization.gpu`, `utilization.encoder` (cao nhất và trung bình). Sau khi dừng đồng hồ: `ffprobe` từng file (codec, kích thước, đếm
  gói = 947), md5, SSIM so **bản tuần tự** (`1×4` lượt đầu) cho mỗi md5 khác. stderr của từng render: dòng `[encoder]`,
  `OpenEncodeSession`, `nvenc`, `out of memory`, `ffmpeg exit` (= phiên NVENC lỗi hoặc lùi x264).

## 2. Máy rảnh

"Chrome" = P × W (số Chrome + ffmpeg chạy cùng lúc). "So 1×4" = tổng thời gian cả lô. "Bản đầu xong" = thời gian riêng của một bản
(trung vị) — lúc người dùng thấy file đầu tiên.

### 2.1 1080×1920 (`slate`)

| P×W | Chrome | Tổng lô (s) | s/bản | So 1×4 | Bản đầu xong | CPU TB | RAM trống thấp nhất | VRAM cao nhất | NVENC cao nhất | Hỏng / NVENC lỗi | So bản tuần tự |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1×4 (hiện tại) | 4 | **92,9** | 15,5 | — | 15,3 s | 53 % | 11,3 GB | 3,1 GB | 71 % | 0 / 0 | md5 trùng 18/18 |
| 2×2 | 4 | 90,3 | 15,0 | −3 % | 27–33 s | 50 % | 11,0 GB | 3,1 GB | 62 % | 0 / 0 | SSIM 0,9968 (12 bản) / 0,9922 (6 bản) (*) |
| 3×1 | 3 | 93,0 | 15,5 | 0 % | 45,5 s | 39 % | 9,2 GB | 2,6 GB (4,6 nhiễu) | 71 % | 0 / 0 | SSIM 0,9951 |
| 2×3 | 6 | 78,4 | 13,1 | −16 % | 23–26 s | 78 % | 10,0 GB | 4,3 GB | 93 % | 0 / 0 | SSIM 0,960 theo pts, **0,9935 theo thứ tự khung** (mục 4) |
| 3×2 | 6 | 71,2 | 11,9 | −23 % | 33 s | 75 % | 8,9 GB | 4,2 GB (5,6 nhiễu) | 90 % | 0 / 0 | SSIM 0,9968 |
| 4×2 | 8 | 73,4 | 12,2 | −21 % | 28 / 42 s (2 đợt) | 80 % | 8,1 GB | 5,3 GB | 87 % | 0 / 0 | SSIM 0,9968 |
| 2×4 | 8 | 69,9 | 11,6 | −25 % | 23 s | 87 % | 8,5 GB | 5,1 GB | 96 % | 0 / 0 | md5 trùng 12/12 |
| **6×1** | 6 | **64,5** | **10,8** | **−31 %** | 64 s | 76 % | 8,8 GB | 4,0 GB | 78 % | 0 / 0 | SSIM 0,9951 |

### 2.2 720×1280 (`neon`)

| P×W | Chrome | Tổng lô (s) | s/bản | So 1×4 | Bản đầu xong | CPU TB | RAM trống thấp nhất | VRAM cao nhất | NVENC cao nhất | Hỏng / NVENC lỗi | So bản tuần tự |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1×4 (hiện tại) | 4 | **73,0** | 12,2 | — | 12,2 s | 51 % | 11,9 GB | 2,7 GB | 46 % | 0 / 0 | md5 trùng 18/18 |
| 2×2 | 4 | 62,1 | 10,3 | −15 % | 20,6 s | 49 % | 11,7 GB | 2,7 GB | 59 % | 0 / 0 | SSIM 0,9956 |
| 3×1 | 3 | 66,7 | 11,1 | −9 % | 33,3 s | 39 % | 11,9 GB | 2,2 GB | 60 % | 0 / 0 | SSIM 0,9934 |
| 2×3 | 6 | 53,8 | 9,0 | −26 % | 17,9 s | 67 % | 11,2 GB | 3,6 GB | 62 % | 0 / 0 | SSIM 0,961 theo pts (mục 4) |
| 3×2 | 6 | 49,9 | 8,3 | −32 % | 24,9 s | 66 % | 10,9 GB | 3,6 GB | 56 % | 0 / 0 | SSIM 0,9956 |
| 4×2 | 8 | 52,4 | 8,7 | −28 % | 21 / 31 s (2 đợt) | 72 % | 9,5 GB | 4,3 GB | 72 % | 0 / 0 | SSIM 0,9956 |
| 2×4 | 8 | 53,4 | 8,9 | −27 % | 17,8 s | 84 % | 10,1 GB | 4,3 GB | 67 % | 0 / 0 | md5 trùng 12/12 |
| **6×1** | 6 | **47,1** | **7,8** | **−36 %** | 46,8 s | 72 % | 9,8 GB | 3,4 GB | 60 % | 0 / 0 | SSIM 0,9934 |

Độ lặp: các lượt không nhiễu của cùng cấu hình lệch nhau ≤ 3 % ở 720p, ≤ 10 % ở 1080p (1080p `2×2` lượt 1 có một bản 48 s vì tải
nền giữa chừng). Mọi file ra đủ 947 khung, H.264, đúng kích thước, `ffprobe` không lỗi. SSIM so bản tuần tự ≥ 0,992 (trừ dòng `2×3`,
mục 4) là sai khác bình thường giữa các cách chia đoạn NVENC (ranh giới GOP khác nhau), cùng cỡ `M52` (0,991–0,995 so x264).

(*) 1080p `2×2`: 6/18 bản ra md5 khác (SSIM 0,9922 thay vì 0,9968), chỉ ở lượt 1 và 2 — hai lượt có tải nền từ phiên khác; lượt 3
và mọi lượt `3×2`/`4×2` (cũng 2 worker mỗi bản) ra một md5. Có thể là khung phụ thuộc thời điểm khi máy bận; chưa tìm khung nào lệch
(file đã xoá sau khi đo). Không thấy ở 720p.
Kiểm lại 2026-11-15 (`M69`): 4 bản `2×2` chạy cùng một render 4 worker chồng lên (8 Chrome) đều ra md5 tốt `6d338ae…`, không tái hiện.
Bản lạ luôn cùng **một** md5 (`b459e55…`, SSIM 0,992244 ở cả hai lượt) và đi theo cặp khởi động cùng lúc, nên là một cấu hình khác
tất định, không phải khung chụp ngẫu nhiên. Đã loại: lùi x264 (`2×2` x264 ra `8a711a5…`), hạ worker theo RAM (`--workers` gõ tay không
bị hạ), Chrome SwiftShader (`perf_log` chỉ có `gpu`). Lúc đó có phiên khác chạy thử render GPU (`perf_log` 10:05). Chưa rõ nguyên nhân.
Nếu gặp lại: giữ file ra và chạy `framemd5` để tìm khung đầu tiên khác.

### 2.3 Đọc bảng

- **Tổng Chrome quyết định tốc độ lô, không phải cách chia.** 3–4 Chrome: ~15,5 s/bản (1080p) dù chia `1×4`, `2×2` hay `3×1`;
  6 Chrome: 10,8–13,1; 8 Chrome: 11,6–12,2 (không hơn 6). Bão hoà ở ~6 Chrome = số nhân thật. Trong lúc đó CPU trung bình chỉ 53–88 %,
  GPU `utilization.gpu` trung bình 17–31 %: mỗi Chrome chủ yếu chờ vòng `renderFrame` → chụp khung (độ trễ), nên thêm Chrome lấp được
  chỗ trống cho tới khi các Chrome tranh nhau compositor/GPU.
- **Cùng số Chrome, ít worker mỗi bản lợi hơn:** `6×1` < `3×2` < `2×3` (1080p 64,5 < 71,2 < 78,4 s). Mỗi worker tốn một lần mở Chrome
  + nạp engine + seek tới đầu đoạn, và nhiều worker thì thêm bước ghép `concat`; một worker ghi thẳng file cuối.
- **Đổi lại, bản đầu xong muộn:** `6×1` cho file đầu sau 64 s (1080p), `3×2` sau 33 s, `1×4` sau 15 s.
- **Lô ít bản hơn số Chrome:** `4×2` với lô 6 chạy 2 đợt (4 rồi 2), đợt sau chỉ dùng 4 Chrome — nên chậm hơn `3×2`. Số bản song song nên
  chia hết số bản trong lô hoặc lô đủ lớn.

## 3. Máy bận giả lập (một render khác đang chạy)

1080p, mỗi cấu hình 1 lượt. Trong suốt lô có một render 1080p `--workers 4` khác chạy lặp liên tục (như job Studio chồng lên lô Tự lái).
Render đó một mình mất 15,3 s.

| P×W | Tổng lô (s) | So cùng cấu hình máy rảnh | So 1×4 máy rảnh | Render kia mỗi lượt | Tổng Chrome | CPU TB | RAM trống thấp nhất | VRAM cao nhất | NVENC cao nhất | Lỗi |
|---|---|---|---|---|---|---|---|---|---|---|
| 1×4 | 136,5 | +47 % | +47 % | 21,6–23,4 s (+41–53 %) | 8 | 86 % | 9,1 GB | 5,3 GB | 88 % | 0 |
| 2×2 | 120,3 | +33 % | +29 % | 21,5–22,7 s | 8 | 86 % | 9,0 GB | 5,3 GB | 82 % | 0 |
| 3×1 | 132,6 | +43 % | +43 % | 19,5–20,3 s | 7 | 80 % | 9,2 GB | 4,7 GB | 79 % | 0 |
| 2×3 | 103,0 | +31 % | +11 % | 26,2–26,8 s (+71–75 %) | 10 | 94 % | 7,3 GB | 5,8 GB | 99 % | 0 |
| 3×2 | 99,8 | +40 % | +7 % | 23,9–28,4 s (+56–85 %) | 10 | 95 % | 7,0 GB | 5,8 GB | 97 % | 0 |

- Chồng tải làm cả hai bên chậm: lô +31–47 %, render kia +27–85 %. Tổng việc vẫn xong nhanh hơn chạy nối nhau (ví dụ `1×4`: lô + 7 lượt
  render kia trong 136 s, nối nhau sẽ là 93 + 7 × 15,3 = 200 s), nhưng **render người dùng đang chờ** chậm đi rõ rệt.
- 10 Chrome: VRAM 5,8/6 GB, NVENC 97–99 %, CPU 94–95 % — sát mọi trần cùng lúc. Chưa vỡ (0 lỗi), nhưng không còn dư cho GPU whisper
  (`M53`) hay preview.

## 4. Phát hiện: `--workers 3` lệch pts sau ranh giới đoạn (NVENC) — đã sửa ở `M69`

SSIM 0,960 của `2×3` không phải lỗi hình. Với 947 khung và 3 worker, `render.mjs` chia đoạn `per = ceil(947/3) = 316` khung;
316/30 s = 10,5333… s không là số micro giây chẵn. Sau `concat -c copy`, **631/947 khung** (đoạn 2 và 3) có pts lệch ~0,33 ms khỏi lưới
1/30 s (`10.533008` thay vì `10.533333`), và ffmpeg báo `non monotonically increasing dts` ở khung cuối khi đọc lại. Bộ lọc `ssim` ghép
khung theo pts nên lúc ghép nhầm khung kề → 0,96. So theo **thứ tự khung** (`setpts=N/30/TB` cả hai): SSIM 0,9935, thấp nhất 0,9886 —
bằng bản 1 worker (0,9934 / 0,9885). Lệch 0,33 ms không thấy được khi xem, nhưng làm md5/SSIM theo thời gian và các công cụ so khung sai.

- Chỉ gặp với NVENC: cùng `--workers 3` bằng `AVS_ENCODER=x264` → 0 khung lệch. `--workers 2` (474 khung = 15,8 s) và `4` (237 = 7,9 s)
  không lệch trên video này vì độ dài đoạn tròn micro giây; video độ dài khác có thể gặp với mọi số worker > 1.
- Nguyên nhân: concat demuxer tính độ dài đoạn theo micro giây; ở đoạn 2 một gói có duration 507 thay vì 512 tick (lệch 5/15360 s).
- **Đã sửa (`M69`):** `segmentRanges` trong `render_hw.mjs` làm tròn độ dài đoạn lên bội số khung để `độ dài / fps` chẵn micro giây
  (30 fps → bội 3 khung; 947/3 → 318 + 318 + 311). Render lại `--workers 3` NVENC: 0/947 khung lệch lưới, mọi gói 512 tick, không còn
  cảnh báo dts, SSIM theo thời gian so bản 1 worker **0,9945** (trước 0,960). Hai lượt render ra cùng md5.

## 5. Giới hạn thực tế trên máy này

| Tài nguyên | Đo được | Kết luận |
|---|---|---|
| Phiên NVENC đồng thời | 8 phiên (máy rảnh), 10 phiên (máy bận), 1080p, 0 lỗi, không dòng `[encoder]` nào | Driver 621.24 không giới hạn phiên ở mức này (khớp `M52`: 9 phiên). `utilization.encoder` cao nhất 87–99 % từ 8 phiên 1080p: bộ mã hoá gần đầy, trung bình chỉ 33–47 % |
| VRAM | 1080p ~0,5–0,55 GB mỗi Chrome, 720p ~0,4–0,45 GB, + ~0,9 GB nền | **Trần thật**: 10 Chrome 1080p = 5,8 GB / 6 GB. Hai lượt nhiễu (phiên khác dùng GPU) đẩy `3×2` lên 5,6 GB |
| RAM | ~0,55 GB mỗi Chrome + ffmpeg (1080p), RAM trống thấp nhất 7,0 GB lúc 10 Chrome | Không phải giới hạn với 32 GB (máy đo chỉ còn trống ~12 GB vì các phiên khác) |
| CPU | trung bình 53 % (4 Chrome) → 76–88 % (6–8) → 95 % (10) | Không phải nút cổ chai khi NVENC + GPU Chrome; thành nút cổ chai khi chồng tải |
| Số Chrome | lợi đến ~6 (= nhân thật), 8 không hơn 6 | Ngân sách nên đếm theo Chrome (worker), không theo số lượt render |

Không đo: máy không GPU (Chrome SwiftShader — chụp khung bằng CPU, `M50`), `AVS_ENCODER=x264` cho cả lô (CPU mã hoá), 4K, máy khác.

## 6. Đề xuất cho `M68` (và cách đếm lượt của `M64`)

1. **Ngân sách theo worker, không theo lượt render.** `slots` của `M64` đếm số lượt `render.mjs` (tối đa `MAX_SLOTS = 4`), nên không diễn
   tả được `6×1` và không biết `1×4` nặng gấp 4 lần `1×1`. Đề xuất: ngân sách `B` = tổng worker (Chrome) cả máy, mỗi lượt xin đúng số
   worker của nó. Mặc định `B = số nhân thật` khi Chrome có GPU và encoder phần cứng (máy này: 6). Nếu giữ `slots`, ít nhất nâng
   `MAX_SLOTS` lên 6 cho chế độ lô.
2. **Chế độ lô song song** (biến thể, batch Excel), với `N` = số bản còn lại:
   `P = min(N, B)`, `W = clamp(floor(B / P), 1, 4)`. Máy này (B = 6): N ≥ 6 → `6×1`; N = 3 → `3×2`; N = 2 → `2×3`; N = 1 → `1×4`
   (như hiện tại). Lô 6 bản: 1080p −31 %, 720p −36 %.
   Khi người dùng cần xem bản đầu sớm (duyệt mẫu trước cả lô): `P = B/2`, `W = 2` (máy này `3×2`: −23 % / −32 %, bản đầu ~33 s / 25 s).
   Nên chọn P để `N` chia hết (lô 6 với `4×2` lãng phí đợt cuối).
3. **Cổng VRAM:** `P × W ≤ floor((VRAM trống − 1 GB) / v)`, `v` = 0,55 GB (≤ 1080×1920), 0,45 GB (≤ 720×1280); 4K chưa đo — tạm
   `v` theo tỉ lệ điểm ảnh và không quá 3 worker. Máy này lúc rảnh (5,2 GB trống): ≤ 7 Chrome 1080p.
4. **Cổng RAM:** giữ hệ số của `M64` (~0,7 GB mỗi worker 1080p, chừa 1,5 GB) — đo thực tế ~0,55 GB nên đã có dư.
5. **Phiên NVENC:** cho phép tới 8 phiên đồng thời (đã đo 10 không lỗi trên driver 621.24). Lưu ý `render.mjs` dò encoder một lần và
   cache, **không lùi x264 khi một phiên NVENC lỗi giữa chừng** — render chết. Máy/driver khác chưa đo: nên thử mở `P × W` phiên một lần
   trước khi chạy lô, hoặc thêm thử lại bằng x264 cho đoạn lỗi (đề xuất cho chủ `render.mjs`).
6. **Điều kiện tắt lô song song** (quay về `1 × auto`, chạy nối nhau):
   - Chrome chạy SwiftShader (không GPU): chụp khung ăn CPU, chưa đo song song — giữ tuần tự.
   - Encoder là x264 (không có encoder phần cứng, hoặc profile `chat-luong`): mã hoá ăn CPU — giữ `P × W ≤ nhân thật − 2` như `renderPlan`.
   - Đang có render/job nặng khác (job Studio, whisper GPU, export): trừ số worker của nó khỏi `B`; nếu còn < 2 thì chờ. Đo ở mục 3:
     chồng thêm 4 worker lên 6 làm render người dùng đang chờ chậm 56–85 %.
   - VRAM hoặc RAM trống dưới cổng ở mục 3–4 (đo lại trước mỗi đợt, không chỉ lúc bắt đầu lô).
7. **`toc-do` cho một bản** không đổi vì số liệu này (đo một bản không thuộc `M66`; `M67` đo 5 worker nhanh hơn 4 khoảng 12 % trên đoạn
   10 s). Song song chỉ có lợi khi có nhiều bản.
8. ~~Sửa lệch pts ở mục 4~~: xong ở `M69`.

## 7. Đo lại

```bash
node scripts/bench/batch_parallel.mjs <bản chép>/timeline.json --out <thư mục tạm> --tag p1080            # 5 cấu hình × 3 lượt
node scripts/bench/batch_parallel.mjs <bản chép>/timeline_neon720.json --out <thư mục tạm> --tag p720 --ref <file tuần tự>
node scripts/bench/batch_parallel.mjs <bản chép>/timeline.json --out <thư mục tạm> --tag busy --reps 1 --busy <bản chép>/timeline.json
node scripts/bench/batch_parallel.mjs <bản chép>/timeline.json --out <thư mục tạm> --configs 4x2,2x4,6x1 --reps 2
```

Kết quả từng lô nằm ở `<out>/<tag>.jsonl` (thời gian từng bản, md5, SSIM, mẫu tài nguyên, dòng stderr NVENC). So khung theo thứ tự (bỏ lệch
pts): `ffmpeg -i a.mp4 -i b.mp4 -lavfi "[0:v]setpts=N/30/TB[a];[1:v]setpts=N/30/TB[b];[a][b]ssim" -f null -`.
