# Giọng đọc: `say`, edge-tts và VieNeu (`scripts/tts.py`)

> Phần thêm của bản `zuzziQ/ai-video-studio` (M27, M28). Dựa trên AI Video Studio của Nguyễn Tất Kiểm.

Ba engine đọc lời, chọn ở `dub.py --tts` (lồng tiếng) và `batch.mjs --tts` / cột `tts_engine` của `job.json` (làm hàng loạt):

| Engine | Chạy ở đâu | Ngôn ngữ | Ghi chú |
|---|---|---|---|
| `say` | macOS, trên máy | theo giọng đã cài | máy khác tự đổi sang `edge` |
| `edge` | dịch vụ Microsoft (edge-tts) | nhiều | cần Internet; câu chữ gửi lên Microsoft |
| `vieneu` | máy chủ riêng trên 127.0.0.1 | tiếng Việt | VieNeu-TTS v3 Turbo, chạy CPU, 10 giọng có sẵn |

Mặc định giữ như cũ: `dub.py` dùng `say` (máy không có `say` thì `edge`), `batch.mjs` dùng `say` trên macOS và `edge` ở nơi khác.

## VieNeu

- Gói `vieneu` từ PyPI (mã nguồn https://github.com/pnnbao97/VieNeu-TTS, Apache-2.0), cài vào môi trường Python riêng
  `$AVS_HOME/vieneu/venv` (không đụng Python của Studio). Model (~1 GB) tải từ Hugging Face lần đọc đầu vào
  `$AVS_HOME/vieneu/hf-cache`.
- Máy chủ `scripts/vieneu_server.py` (viết cho Studio, không lấy mã Factory) chỉ nghe `127.0.0.1`:
  - `GET /health` → `{ready, loaded, clone: false, voices: [{name, gender, region, style}], default}`
  - `POST /tts` `{text, voice}` → `audio/wav` (48 kHz). Không ghi file theo đường dẫn client gửi.
  - Từ chối request có `Origin` (trang web trong trình duyệt) và body không phải JSON; câu ≤ 5.000 ký tự.
- **Chỉ 10 giọng có sẵn** (các giọng `featured` 1..10 trong `voices_v3_turbo.json` của gói), mặc định `Hải Đăng`.
  **Nhái giọng tắt**: máy chủ không có endpoint nhận file mẫu, body có `ref`/`ref_audio`/`voice: {kind: clone}` bị trả 403.
  Chỉ bật sau khi `C04` (giấy phép thương mại của VieNeu cho nhái giọng) rõ.
- Gói cài tối thiểu không có watermark âm thanh (`vieneu[watermark]` cần thêm thư viện nặng). Đăng lên Meta/TikTok vẫn phải
  gắn nhãn nội dung AI.

### Cài và bật (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install_vieneu.ps1      # -Yes: không hỏi; -Start: bật luôn; -Port 8771
python scripts\tts.py vieneu-start                                       # bật máy chủ (chạy nền, log $AVS_HOME\vieneu\server.log)
python scripts\tts.py status                                             # engine nào dùng được, danh sách giọng
python scripts\tts.py say "Xin chào các bạn" --engine vieneu --out thu.wav
```

Script cài cần Python 3.10+ và ~4 GB đĩa trống. macOS/Linux: tạo venv và `pip install "vieneu==3.8.4" "huggingface_hub<2"`
như script, rồi `python3 scripts/tts.py vieneu-config --python <venv>/bin/python`.

### Cấu hình

`$AVS_HOME/config.json` (cùng file với khoá `llm` và API key, quyền 600), khoá `tts`:

```json
{ "tts": { "vieneu": { "url": "http://127.0.0.1:8771", "python": "C:\\…\\vieneu\\venv\\Scripts\\python.exe", "voice": "Trúc Ly" },
           "default_engine": "vieneu" } }
```

`python scripts/tts.py vieneu-config [--url …] [--python …] [--voice …] [--default-engine vieneu|edge|say]` gộp vào khoá này,
khoá khác giữ nguyên (không truyền `--url` thì giữ địa chỉ đang lưu). Phía Node đọc/ghi cùng định dạng qua `scripts/tts_config.mjs`.
`default_engine` là giọng của job không ghi engine riêng: `batch.mjs` (dòng không có `tts_engine`), `dub.py` (không có `--tts`),
`topic_video.mjs` (không có `--voice`). Chưa đặt thì như cũ: `say` trên macOS, edge-tts ở nơi khác.
Biến môi trường `AVS_VIENEU_URL` thắng `url`. Chỉ nhận `http://127.0.0.1|localhost|[::1]:<cổng>`.

### Khi không dùng được

`tts.py` chọn engine một lần trước khi đọc (cả bài một giọng):

- máy chủ không trả lời `/health` → in cảnh báo (kèm lệnh cài và lệnh bật) ra stderr, đọc bằng **edge-tts**;
- ngôn ngữ đích không phải `vi` (lồng tiếng sang tiếng khác) → edge-tts giọng của ngôn ngữ đó;
- địa chỉ trong cấu hình không phải loopback → edge-tts;
- giọng không có trong danh sách → dừng, in danh sách giọng.

`dub.py` ghi `TL.audio.dub.engine` theo engine thật đã dùng và thêm `fallback` vào dòng `DUB {…}`; `batch.mjs` ghi
"VieNeu không dùng được (…) → đã đọc bằng edge-tts" vào log của dòng.

## Dùng

```bash
python scripts/dub.py timeline.json --lang vi --tts vieneu [--voice "Trúc Ly"]
node scripts/batch.mjs <template> sheet.csv out/ --voice tts --tts vieneu [--tts-voice "Hải Đăng"]
node scripts/topic_video.mjs "<chủ đề>" --out <thư mục> --voice vieneu[:"Hải Đăng"]
```

`topic_video.mjs --voice vieneu[:<tên>]`: kiểm máy chủ một lần trước khi đọc (không tên = giọng trong cấu hình, rồi giọng mặc định
của máy chủ); mỗi câu đọc qua `scripts/tts.py say --engine vieneu`. Máy chủ không chạy → in cảnh báo (kèm lệnh bật) rồi đọc bằng
edge-tts như `dub.py`/`batch.mjs`; tên giọng lạ → dừng, in danh sách giọng; máy chủ tắt giữa chừng → dừng (không trộn hai giọng).
Bản đọc VieNeu không tăng tốc khi dài hơn `--dur` (chỉ `say` có `-r`).

### Trong Studio

Nút **Mô hình & giọng** trên thanh trên (`studio/features/28_engines.js`, API `studio/routes/28_engines.mjs`), thẻ **Giọng VieNeu**:
trạng thái máy chủ (chạy/không, nút **Bật máy chủ** = `tts.py vieneu-start`), chọn 1 trong 10 giọng có sẵn, **nghe thử** một câu ngắn
(≤ 200 ký tự, đọc thật qua `tts.py say`, trả `audio/wav`, file tạm xoá ngay), đặt **giọng mặc định** cho Hàng loạt, Lồng tiếng và
Video từ chủ đề, sửa địa chỉ máy chủ (chỉ loopback). Panel **Lồng tiếng** có thêm lựa chọn "VieNeu trên máy"; panel **Video dài**
(chủ đề → video) có giọng "VieNeu". Không có nhái giọng (`C04`).

`batch.mjs`: giọng của dòng là `tts_voice` trong `job.json`; tên giọng edge (đuôi `Neural`) chỉ dùng cho edge-tts.

## Test

`python -m unittest scripts.tests.test_tts scripts.tests.test_vieneu_server` và
`node --test scripts/tests/tts_batch.test.mjs scripts/tests/engines_route.test.mjs`: máy chủ VieNeu giả trên 127.0.0.1, edge-tts giả
(`scripts/tests/fixtures/fake_edge_tts`), không cần mạng hay gói `vieneu`. `engines_route.test.mjs` kiểm route Studio: GET không lộ
khoá/token/đường dẫn python, POST từ chối URL không phải loopback, giữ khoá khác của `config.json`, giọng phải có sẵn, `pickVoice`
của `topic_video.mjs`.

Còn lại (M27): nhái giọng chờ `C04`.
