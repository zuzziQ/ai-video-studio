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
