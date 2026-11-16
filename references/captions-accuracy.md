# Độ chính xác phụ đề tự động

Đo ngày 10/11/2026 trên clip mẫu tiếng Việt dài 29 giây, giọng rõ, có lẫn từ tiếng Anh (AI, edit, tool, video clip).
Đáp án chuẩn là bản lời thoại đã sửa tay (133 từ). Máy chạy là Apple M5 Pro, CPU, int8.
Tỉ lệ sai = số từ sai, thiếu hoặc thừa chia cho số từ đúng. Cách đặt dấu thanh cũ và mới ("hóa"/"hoá") tính là giống nhau.

| Model | Tỉ lệ sai | Thời gian (clip 29 s) | Tải lần đầu |
|---|---|---|---|
| **large-v3-turbo** (mặc định) | **2,3 %** | 9,8 s | ~1,6 GB |
| large-v3 | 6,0 % | 26,6 s | ~3 GB |
| medium | 11,3 % (còn viết "1" thay cho "một") | 14,4 s | ~1,5 GB |
| small (mặc định cũ) | 13,5 % | 5,0 s | ~0,5 GB |

Các cách khác đã thử trên small nhưng không đỡ hơn: bật `vad_filter`, `initial_prompt` có từ vựng chủ đề,
`condition_on_previous_text=false`. Muốn chính xác hơn thì phải đổi model; chỉnh tham số không giúp được.

Lỗi điển hình của small: "tiền hóa" (đúng là tiến hoá), "tiền động" (tự động), "tui này" (tool này), "hệ ứng" (hiệu ứng).
Turbo chỉ còn sai "tiền hóa" và "nghe" (đúng là "để").

**Giờ giấc từng chữ:** turbo và small khớp nhau. Lệch trung vị 0,02 s, 90 % số từ lệch dưới 0,05 s, lệch nhiều nhất 0,36 s.
Không có từ nào dài 0 s hoặc trên 1 s. Whisper không chừa khoảng lặng giữa các từ, vì vậy `captions.py` không dựa
vào khoảng lặng để ngắt dòng khi `cut.py` chưa cắt bỏ khoảng lặng.

**Ngắt dòng (`captions.py`):** Whisper tách tiếng Việt theo âm tiết. Trước đây cứ đủ N âm tiết là ngắt dòng, nên hay cắt đôi
từ ghép ("chúng | ta", "lựa | chọn"). Giờ chỗ ngắt được chọn cho cả đoạn cùng lúc, theo thứ tự ưu tiên:

- ngắt ở dấu câu, ở chữ hoa đầu câu mới, ở chỗ ngừng hơi và trước từ mở mệnh đề;
- tránh ngắt giữa từ ghép trong danh sách `COMPOUNDS`, sau hư từ ("của", "các", "là"…) và trong cụm số;
- giữ độ dài dòng gần mức đặt.

Trên clip mẫu (4 chữ/dòng), số chỗ cắt đôi từ ghép giảm từ 11 xuống 0. Danh sách từ ghép có lấy một phần từ chính
clip này, nên với video khác kết quả có thể kém hơn một chút. Gặp từ ghép bị cắt thì thêm nó vào `COMPOUNDS`.

Model nào cũng không tự biết tên riêng hay thuật ngữ. Vì vậy vẫn nên đọc lại phụ đề trong editor, hoặc dùng
`captions.py --fix "sai=đúng"`.

## Chạy whisper trên GPU NVIDIA (`M53`)

`transcribe.py` chọn thiết bị qua `scripts/whisper_device.py`: có GPU CUDA thì `device="cuda"`, `compute_type="int8_float16"`;
không có thì CPU `int8` với `cpu_threads` = số nhân thật. Thiếu cuBLAS/cuDNN, driver cũ hay hết VRAM thì in một dòng
`whisper: không chạy được trên GPU (…) — dùng CPU int8, N luồng` rồi chạy tiếp bằng CPU. Mỗi lần chạy in thêm `whisper: <thiết bị>`.

- `AVS_WHISPER_DEVICE=auto|cuda|cpu` (mặc định `auto`); `AVS_WHISPER_COMPUTE` đổi `compute_type` trên CUDA (ví dụ `float16`).
- Thư viện: `pip install nvidia-cublas-cu12` (Windows: ctranslate2 đã kèm cuDNN). Linux thêm `"nvidia-cudnn-cu12>=9,<10"`.
  `install.ps1` / `scripts/setup.sh` tự cài khi thấy `nvidia-smi`; bỏ qua bằng `-NoCuda` / `AVS_NO_CUDA=1`.
- Lỗi thiếu cuBLAS chỉ lộ ở lượt suy luận đầu, nên trên CUDA có một lượt chạy thử 1 s im lặng ngay sau khi nạp model.

Đo ngày 13/11/2026, `large-v3-turbo`, i7-8700K (6 nhân), GTX 1660 Ti 6 GB, driver 560.94, ctranslate2 4.9.0.
Máy có phiên render khác chạy song song (CPU nền 15–100 %, GPU nền tới 99 %), nên các cấu hình chạy xen kẽ, lặp 3 lần với clip ngắn.
Bản 10 phút là clip mẫu ghép 20 lần (614 s). Thời gian nạp model tính riêng (5–8 s, lần đầu đọc đĩa nguội tới ~200 s).

| Cấu hình | Clip 31 s: phiên âm | 10 phút: phiên âm | Chữ so với CPU cũ |
|---|---|---|---|
| CPU int8, 4 luồng (trước, mặc định ctranslate2) | 24,6–27,6 s | 551–625 s | — |
| CPU int8, 6 luồng (nhân thật) | 22,9–28,5 s | 400–674 s | giống hệt |
| **CUDA int8_float16** (mặc định mới) | **3,8–3,9 s** | **65–89 s** | lệch 0,8–1,2 % |
| CUDA float16 | 11,7–12,0 s | 181–190 s | bản 10 phút mất 120 từ |

GPU nhanh hơn CPU ~6,5 lần (clip ngắn) và ~7 lần (10 phút). Trên Turing không tensor core (GTX 16xx), `float16` chậm hơn
`int8_float16` ~3 lần và bỏ sót một đoạn, nên không dùng làm mặc định. Số luồng theo nhân thật không nhanh hơn rõ khi máy đang bận.

## Nghe lại một đoạn ngắn (`M95`, "Nghe lại bằng AI")

Panel Lời thoại có nút **Nghe lại bằng AI** (thẻ đề xuất và menu đoạn): cắt tiếng nói quanh đoạn chọn (thêm ≥ 1 s mỗi bên,
tối thiểu 5 s), chạy Whisper lớn hơn model đã tạo lời thoại kèm `initial_prompt` (từ điển + câu trước/sau), chỗ khác
thành đề xuất "nhận dạng" để người dùng Nhận / Bỏ (`scripts/rehear.mjs`, `scripts/rehear.py`, `references/studio.md`).

Đo ngày 16/11/2026 trên `clip-mau` (29,76 s), GTX 1660 Ti, CUDA int8_float16. Chỗ thử: lời nói "15 đến 30 phút",
turbo (model tạo lời thoại mặc định) viết "15 đến 3 phút".

| Cách nghe | Chữ ở chỗ đó | Thời gian |
|---|---|---|
| turbo, cả clip (lặp 2 lần) | 15 đến **3** phút | nạp 8,8–10,1 s + nhận dạng 2,5–3,2 s |
| **large-v3, cả clip** (lặp 2 lần) | 15 **-15** phút, thêm lỗi mới "hệ ứng", "mới sau một clip", "nha" | nạp 11,7–12,4 s + nhận dạng 10,2–10,4 s |
| turbo, đoạn 4,4 s (có / không prompt) | 15 đến 3 phút | nạp 7–11 s + 1,5 s |
| small, đoạn 4,4 s | 15-30 phút | nạp 3,5 s + 0,6 s |
| medium, đoạn 4,4 s | 15 đến 30 phút | nạp 52 s (lần đầu tải) + 1,9 s |
| **large-v3, đoạn 3–5 s** (4 lượt trong Studio, chọn "3" hoặc "15 đến 3 phút") + 2 lượt đoạn 4,4 s ngoài Studio | **15 đến 30 phút** (6/6) | 15–23 s cả lượt trong Studio: nạp 11–15 s, nhận dạng 2–6 s |
| large-v3, đoạn 2,1 s (chỉ chữ "3" ± 1 s) | 15 đến **20** phút + bịa câu "Hẹn gặp lại các bạn…" | 15 s |

Kết luận:

- **Không đổi model mặc định sang large-v3.** Cả clip, large-v3 vẫn nghe sai đúng chỗ này (theo kiểu khác) và thêm lỗi,
  chậm hơn turbo ~3,5 lần ở bước nhận dạng; khớp với số đo cũ (large-v3 sai 6,0 % số từ, turbo 2,3 %).
  Với video 10 phút, turbo nhận dạng 65–89 s; large-v3 ước ~4–5 phút.
- Nghe lại **một đoạn ngắn** bằng model lớn thì đúng: Whisper chỉ phải giải một câu, không bị cả đoạn dài kéo theo.
  Nên làm việc này theo từng chỗ nghi ngờ, không phải cả bài.
- Đoạn quá ngắn (≈ 2 s) làm Whisper đoán sai và bịa câu ở mép, nên Studio nới đoạn cho đủ 5 s.
  Prompt không chứa chữ của chính đoạn nghe: đưa "15 đến 3" vào prompt làm Whisper lặp lại lỗi và bỏ mất đầu câu.
- Lần đầu dùng large-v3 tải ~3 GB; mỗi lượt nạp lại model (11–15 s trên GTX 1660 Ti) là phần tốn nhất.

## Soát kỹ hai lớp (`M96`, "Soát kỹ (nghe lại chỗ nghi)")

Lớp 1 dò chỗ nghi cho cả bài (độ tự tin từng từ `p` của Whisper, con số, từ lặp, độ dài lạ, chỗ AI soát chữ sửa hoặc
đánh dấu nghi), lớp 2 chỉ nghe lại các chỗ đó bằng large-v3 trong một lượt, rồi so ba nguồn (gốc, AI chữ, nghe lại)
và xếp đề xuất theo độ tin. Không tự sửa (`references/studio.md`, mục Lời thoại).

Đo ngày 16/11/2026 trên `clip-mau` tạo lại bằng turbo (133 từ, có `p`), GTX 1660 Ti, CUDA int8_float16, Claude thật.
So với đáp án (bản sửa tay, "15 đến 30 phút"), turbo sai **4 chỗ**: "tiền hóa" (tiến hoá), "nghe" (để), "3" (30),
"phong chữ" (phông chữ).

**Ngưỡng `p`.** Bốn từ sai có `p` 0,62–0,83: turbo sai mà vẫn khá chắc, nên ngưỡng 0,5 không bắt được chỗ nào.

| Ngưỡng | Từ sai bắt được | Từ đúng bị nghi |
|---|---|---|
| p < 0,5 | 0/4 | 1/129 |
| p < 0,7 | 1/4 | 3/129 |
| **p < 0,85** (2 điểm, đủ thành chỗ nghi) | **4/4** | 12/129 |

Với ngưỡng này lớp tín hiệu ra 5 đoạn nghi (4 khi có AI), phủ cả 4 lỗi. Từ có p < 0,6 được 3 điểm.

**So hai cách soát** (mỗi dòng một lượt; "đúng" = sửa thành chữ của đáp án hoặc cùng nghĩa, "font chữ" tính là đúng):

| Cách | Đề xuất | Đúng / sai | Lỗi thật sửa đúng | Nhận tất cả (mặc định) | Đoạn nghe lại | Tổng thời gian |
|---|---|---|---|---|---|---|
| (a) AI soát chữ một mình (M90), lượt 1 | 3 | 2 / 1 ("15 đến 3" → "1 đến 3") | 2/4 | áp cả chỗ sai | 0 | 4,9 s |
| (a) lượt 2 | 5 | 2 / 3 (đoán số, "nghe" → "nếu", "từ đấy" → "từ đó") | 2/4 | áp cả 3 chỗ sai | 0 | 6,5 s |
| (b) Soát kỹ, lượt 1 | 4 | 3 / 1 | 3/4 | 1 đúng, 0 sai | 4 | 39,6 s |
| (b) lượt 2 | 5 | 3 / 2 | 3/4 | 1 đúng, 0 sai | 5 | 42,1 s |
| (b) lượt 3 | 5 | 3 / 2 | 3/4 | 1 đúng, 0 sai | 4 | 34,9 s |
| (b) thiếu `claude` (chỉ tín hiệu + nghe lại) | 3 | 2 / 1 | 2/4 | (không có nhóm cao) | 5 | 29,2 s |

Lượt (b) 1–2 chạy trước khi chốt luật cuối; bảng ghi theo luật cuối (lượt 1 thật sự đã bỏ "tiền hóa → tiến hoá",
xem dưới). Ở (b), nhóm **2 nguồn đồng ý** luôn là "phong chữ → phông chữ" (đúng 3/3); "15 đến 3 phút → 15 đến 30" ở
nhóm Một nguồn (đúng 3/3, lượt 2–3 AI đoán "1 đến 3" và bị bản nghe lại thay); "tiến hoá" ở nhóm Cần nghe. Hai đề
xuất sai của (b) đều do large-v3 nghe nhầm ("xong được" → "sau", "nghe" → "nghề"), xếp ở Cần nghe hoặc Một nguồn.
"nghe" (để) chưa cách nào sửa đúng. Thời gian (b): Claude 5–7 s + trộn tiếng nói (lượt đầu) + nạp large-v3 11–15 s +
2–4 s mỗi đoạn.

Luật rút ra từ số đo:

- **Nghe lại = gốc không có nghĩa là AI sai.** large-v3 cũng nghe "tiền hóa" như turbo; AI sửa đúng theo nghĩa câu
  ("thuyết tiến hoá"). Luật ban đầu "bỏ đề xuất AI" làm mất chỗ đúng này, nên chỉ bỏ khi AI đoán **số** (AI không
  nghe được âm thanh, ở M90 đoán số sai 6/41 lần); sửa chữ khác thì hạ xuống Cần nghe.
- **Chỉ nghe lại thấy khác, AI đọc thấy ổn → Cần nghe.** large-v3 có lỗi riêng ("mới sau một clip" đã thấy ở M95);
  chỉ tin hơn khi chỗ đó có số hoặc AI cũng nghi.
- Chỗ có số mà ba nguồn khác nhau: tin bản nghe lại (Một nguồn), giữ bản AI ở nút "Dùng bản AI".
- Mặc định "Nhận tất cả" chỉ nhận nhóm 2 nguồn đồng ý: trên clip mẫu là 1 chỗ đúng, 0 chỗ sai, so với (a) áp luôn
  1–3 chỗ sai.
