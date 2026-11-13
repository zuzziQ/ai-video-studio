# Thư viện nhạc CC0 tuỳ chọn (`scripts/music_cc0.py`)

> Phần thêm của bản `zuzziQ/ai-video-studio` (M29). Dựa trên AI Video Studio của Nguyễn Tất Kiểm.

Ngoài 30 bài nhạc tự sinh trong `assets/music/` (`catalog.json`, `references/sound-library.md`), Studio có thêm một
thư viện nhạc thật do người soạn, giấy phép **CC0 1.0** (dùng thương mại, không bắt buộc ghi công). Danh sách bài lấy từ
catalogue tự khai của AI Video Factory; **mỗi bài được đối chiếu lại nhãn CC0 với trang nguồn** trước khi vào danh mục.

- Danh mục: `assets/music/cc0/catalog.json` — `tracks` (bài đã xác minh) và `excluded` (bài bị loại, kèm lý do).
  Không gộp vào `assets/music/catalog.json`: file đó là danh sách nhạc tự sinh, `gen_music.py` ghi lại toàn bộ và
  `ai_edit.mjs` gợi ý bài từ đó (bài chưa tải sẽ thành gợi ý hỏng).
- File nhạc **không nằm trong repo** (13 bài hiện có khoảng 67,5 MB): tải theo yêu cầu vào `$AVS_HOME/music/cc0/<mã>.<đuôi>`
  (đổi bằng `AVS_MUSIC_CC0_DIR`), kiểm đúng kích thước và sha1 trong danh mục, rồi ghi `LICENSES.txt` cạnh file.
- Chỉ tải từ `https://archive.org` (và máy `*.archive.org` nó chuyển tới) và `https://opengameart.org`.

## Trường của một bài

| Trường | Nghĩa |
|---|---|
| `id`, `title`, `artist`, `mood`, `duration_s` | mã, tên bài, tác giả, tâm trạng (`news`, `corporate`, `inspirational`, `upbeat`, `emotional`, `dramatic`, `calm`, `funny`), độ dài |
| `url`, `bytes`, `sha1` | file tải, kích thước và sha1 phải khớp |
| `licence`, `licence_url` | `CC0-1.0`, https://creativecommons.org/publicdomain/zero/1.0/ |
| `source_page`, `also` | trang đã đối chiếu nhãn; trang phụ (mục archive.org) |
| `evidence`, `verified_on` | bằng chứng tìm thấy trên trang nguồn, ngày đối chiếu |

## Dùng

```bash
python scripts/music_cc0.py list [--mood calm]
python scripts/music_cc0.py fetch --mood calm          # hoặc --id pond, --all
python scripts/music_cc0.py path pond                  # in đường dẫn (tải nếu chưa có)
```

Trong timeline: `"audio": {"music": [{"file": "<đường dẫn từ lệnh path>", "t0": 0, "t1": 30, "gain": -10}]}`
(`mix_audio.py` nhận `file` thay cho `mood`). Nhạc thật chưa chuẩn hoá về -16 LUFS như nhạc tự sinh: nghe thử và chỉnh `gain`.

## Cách đối chiếu (2026-11-13)

- **FreePD** (Kevin MacLeod, Rafael Krux, Bryan Teoh…): freepd.com đã đóng; đối chiếu trang danh mục lưu trên Wayback
  (tên bài có trên trang, trang ghi nhạc public domain) và file trong mục `archive.org/details/freepd` (khớp sha1).
  Mục archive.org này do người dùng ẩn danh tải lên, không ghi giấy phép, nên không tự nó là bằng chứng.
  Đợt 2026-11-13 Wayback trả 429 cho cả 8 trang danh mục nên **45 bài FreePD đang nằm ở `excluded`**; khi mở được trang,
  dựng lại danh mục theo cách trên rồi chuyển bài qua `tracks`.
- **Komiku** (2 album): trang album trên loyaltyfreakmusic.com ghi "Licence" trỏ CC0 1.0; mục archive.org ghi `licenseurl` CC0 1.0.
- **Open Goldberg Variations** (Kimiko Ishizaka): mục archive.org ghi CC0 1.0; trang dự án nói là bản thu public domain.
- **OpenGameArt** (4 bài): trang từng bài ghi License CC0.

Bài nào thiếu một trong các bằng chứng trên, hoặc thẻ trong file mâu thuẫn với tác giả khai (ví dụ file ghi kho nhạc trả phí),
bị loại và ghi ở `excluded`. Test: `python -m unittest scripts.tests.test_music_cc0`.
