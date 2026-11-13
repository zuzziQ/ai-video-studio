# Gói Ads Manager (Meta, TikTok)

Code: `scripts/ads_pack.mjs`. Test: `node --test scripts/tests/ads_pack.test.mjs`.

Gom video đã xuất của một lô phiên bản (`variants.json`, `references/variant-matrix.md`) thành một thư mục cho mỗi nền tảng để **tải lên bằng tay**. Studio không đăng quảng cáo, không gọi API của Meta hay TikTok.

```bash
node scripts/ads_pack.mjs <dự án gốc | một phiên bản> [--platform meta,tiktok] [--campaign tên] \
  [--landing https://shop.vd/sp] [--cta LEARN_MORE] [--out thư-mục] [--dry-run]
```

Mặc định lấy từ `timeline.json` của dự án gốc: nền tảng `ads.platforms` (không có thì cả hai), chiến dịch `ads.campaign` → `ads.product` → tên thư mục, trang đích `ads.landing_url` → `brand.website`, CTA `ads.cta` → `LEARN_MORE`.

## Trong gói
Thư mục `<dự án gốc>/out/ads/<nền tảng>_<YYYYMMDD-HHMM>/`:

| File | Nội dung |
|---|---|
| `<ad_name>.mp4` | bản sao video, tên theo quy ước `<chiến dịch>_<nền tảng>_<mã bản>_<khổ>_<giây>s`, ví dụ `serum-b5_meta_ead6-V01_9x16_15s.mp4` |
| `ads_mapping.csv` | UTF-8 có BOM (mở thẳng bằng Excel). Cột: `ad_name, file, code, aspect, duration_s, size_mb, primary_text, headline, cta, landing_url`, trục của bản `hook, hook_text, angle, audience, narrative, format, duration, pack, voice, music`, `warnings` |
| `manifest.json` | mã bản → thư mục và trục; danh sách bản bị loại. Dùng để ghép kết quả quảng cáo về bản (M31) |
| `README.txt` | cách tải lên, cảnh báo, bản bị loại và lý do |

**Mã bản** `<lô>-V<i>`: `lô` là 4 ký tự hex từ đường dẫn dự án gốc + thời điểm tạo `variants.json`, nên chạy lại vẫn ra cùng mã; `V00` là bản gốc, `V01…` là phiên bản theo `timeline._variant.i`. Mã nằm trong `ad_name` và `utm_content`, nên báo cáo xuất từ Ads Manager hay Analytics đều ghép lại được. Đừng đổi tên quảng cáo khi tải lên.

**Video của một bản**: `variants[].video`, không có thì mp4 mới nhất trong `out/` của bản đó, cộng các khổ phụ do `scripts/export_multi.mjs` tạo (`<tên>_1x1.mp4`, `_16x9`…). Mỗi khổ là một dòng.

**Chữ quảng cáo**: từ gói đăng `publish/publish.json` của bản (`scripts/publish_texts.mjs`): Meta lấy `facebook` (rồi `instagram`), TikTok lấy `tiktok`. `primary_text` = caption (+ tối đa 3 hashtag nếu caption chưa có), `headline` = title (bỏ `#Shorts`; TikTok không có headline). Chưa có gói đăng thì dùng hook hoặc tiêu đề, kèm cảnh báo.

**Trang đích**: thêm `utm_source` (`facebook`/`tiktok`), `utm_medium=paid_social`, `utm_campaign`, `utm_content=<mã bản>`, `utm_term=<góc>`; giữ tham số sẵn có. Chỉ nhận http(s); thiếu `https://` thì tự thêm.

## Bản bị loại
- **QC quảng cáo chặn xuất** (`scripts/export_gate.mjs`): bản có `.studio/qc.json` dùng QC của chính nó; bản chưa chạy QC dùng QC của dự án gốc (cùng lời thoại). Bản đã ghi lý do bỏ qua lỗi claim/nguyên bản được giữ, kèm cảnh báo.
- **Chưa xuất video.** Trong lô có phiên bản, bản gốc chưa xuất thì bỏ qua, không báo.
- **Sai spec bắt buộc** của nền tảng (bảng dưới).

## Spec
Theo tài liệu công bố của Meta và TikTok đến 2025: kiểm lại trên Ads Manager. Sai cột "bắt buộc" thì loại khỏi gói; sai cột "khuyến nghị" thì giữ và ghi cảnh báo.

| | Meta (bắt buộc) | Meta (khuyến nghị) | TikTok (bắt buộc) | TikTok (khuyến nghị) |
|---|---|---|---|---|
| Khổ | 9:16, 4:5, 1:1, 16:9 | | 9:16, 1:1, 16:9 | 9:16 |
| Thời lượng | 1 s – 241 phút | ≤ 90 s | 5 – 600 s | ≤ 60 s |
| Dung lượng | ≤ 4096 MB | | ≤ 500 MB | |
| Cạnh ngắn | ≥ 120 px | ≥ 1080 px | ≥ 360 px | ≥ 720 px |
| Chữ | | primary ≤ 125, headline ≤ 40 ký tự | chữ quảng cáo ≤ 100 ký tự | |

Khổ lệch chuẩn ≤ 2% được coi là khổ chuẩn (720×1280 → 9:16). Đo bằng `ffprobe`; máy không có `ffprobe` thì lấy kích thước và thời lượng trong timeline, có cảnh báo. CTA ngoài danh sách của nền tảng chỉ cảnh báo.

## Giới hạn
- Không có giao diện Studio, chạy bằng lệnh.
- Chữ quảng cáo không đi qua `ad_gates.py`: chỉ video đã qua cổng. Đọc lại chữ trước khi chạy.
- Không tạo file nhập hàng loạt (bulk import) của Meta hay TikTok; `ads_mapping.csv` là bảng để dán tay.
