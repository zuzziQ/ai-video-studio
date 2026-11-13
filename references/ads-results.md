# Kết quả quảng cáo → lift → lô kế tiếp có trọng số

Code: `scripts/ads_results.mjs`, `variants.mjs --kind matrix --learn`, `feedback.mjs` (đề xuất `next_batch`). Test: `node --test scripts/tests/ads_results.test.mjs` (CSV mẫu ở `scripts/tests/fixtures/ads_results/`).

Vòng khép kín: ma trận biến thể (`references/variant-matrix.md`) → gói Ads Manager (`references/ads-pack.md`) → chạy quảng cáo → xuất báo cáo CSV → nhập → lift theo từng trục → lô kế tiếp ưu tiên yếu tố thắng. Phép tính lift, ngưỡng thắng, trọng số và số hook mới chuyển từ AI Video Factory (`scale.py`: `learnings`, `weights_from_learnings`, `next_batch`), viết lại không SQLite.

## Nhập báo cáo (M31)

```bash
node scripts/ads_results.mjs import <dự án gốc> <báo cáo.csv>… [--platform meta|tiktok] [--n 10]
node scripts/ads_results.mjs learn  <dự án gốc> [--kpi auto|ctr|hook_rate|completion|cvr|cpa|roas] [--platform meta|tiktok] [--min-impr 1000] [--json]
```

- **CSV nhận được**: báo cáo xuất từ Meta Ads Manager (giao diện tiếng Anh hoặc tiếng Việt) và TikTok Ads Manager, cấp quảng cáo (có cột tên quảng cáo). Dấu phân cách `,` `;` hoặc tab, có hay không BOM, số kiểu `1,234.5` hoặc `1.234,5`. Nền tảng đoán theo tên cột (`Amount spent`/`Reporting starts` → Meta, `Cost`/`Clicks (destination)` → TikTok); không đoán được thì cần `--platform`.
- **Cột đọc** (theo thứ tự ưu tiên, xem `COLUMNS`): tên / id quảng cáo, khoảng ngày, chi tiêu, lượt hiển thị, click (click liên kết / đích đến trước, rồi click tất cả), chuyển đổi (Purchases / Complete payment trước, rồi Conversions, Results), doanh thu, lượt xem 3 giây (Meta) hoặc 2 giây (TikTok), ThruPlay / xem 100%. Bỏ dòng tổng ("Total of N results").
- **Ghép về bản** theo mã `<lô>-V<i>` trong tên quảng cáo (hoặc cột `code`, `utm_content`, URL tags). Trục của bản lấy từ `manifest.json` của mọi gói trong `<dự án gốc>/out/ads/*/`. Báo về: mã không có trong gói, quảng cáo không có mã.
- **Lưu** ở `<dự án gốc>/ads_results.json`: `rows` (khoá = nền tảng + id/tên quảng cáo + khoảng ngày, nên nhập lại cùng báo cáo thì ghi đè, báo cáo tuần khác thì thêm), `variants` (trục chụp lại lúc nhập, vì lô sau ghi đè thư mục `<dự án>_v<i>`), `imports` (50 lần nhập gần nhất).

## Lift
- **KPI**: `ctr` (click / hiển thị), `hook_rate` (xem 2–3 giây / hiển thị), `completion` (xem hết / hiển thị), `cvr` (chuyển đổi / click), `cpa` (chi tiêu / chuyển đổi, thấp là tốt: so bằng nghịch đảo, hiển thị lại là tiền), `roas` (doanh thu / chi tiêu). `auto`: có doanh thu → `roas`; ≥ 5 chuyển đổi → `cpa`; còn lại `ctr`.
- Mỗi bản cộng mọi dòng của nó (mọi tuần, mọi khổ; lọc nền tảng bằng `--platform`). Bản dưới `--min-impr` lượt hiển thị (mặc định 1000) bị bỏ, liệt kê ở `low_data`.
- Trục: `hook, angle, audience, narrative, format, duration, voice, music` (giá trị rỗng bỏ qua; `duration` `0` = giữ độ dài gốc). Với mỗi giá trị: `n` = số bản, `mean` = trung bình KPI các bản đó, `lift = mean / trung bình mọi bản − 1`.
- **Thắng**: `n ≥ 2` và `lift > 10%`. Một bản đơn lẻ không bao giờ thắng. Tương quan không phải nhân quả: các trục không độc lập trong lô nhỏ.

## Lô kế tiếp có trọng số (M32)

```bash
node scripts/ads_results.mjs next <dự án gốc> [--n 20] [--kpi …] [--explore 0.2]      # xem kế hoạch
node scripts/variants.mjs <dự án gốc> --kind matrix --n 20 --learn [--kpi ctr] [--explore 0.2] [--estimate]
```

Hoặc bật trong `timeline.json`: `"ads": {"matrix": {"learn": {"kpi": "auto", "explore": 0.2}}}`.

- **Trọng số** cho 5 trục của ma trận (`audience, angle, narrative, duration, format`): `1 + lift`, kẹp 0,5–2, chỉ giá trị có `n ≥ 2`. `planMatrix` nhân điểm tổ hợp với trung bình trọng số các trục của nó, và quota mỗi góc (mặc định 25% số bản) nhân theo trọng số của góc: góc thắng được nhiều suất hơn, góc thua ít hơn (`angle_quota` trong `plan`).
- **Hook thắng** (trục `hook` thắng) được ưu tiên khi chọn hook cho bản thường (`pickHook` `preferred`), trong giới hạn 5 bản mỗi hook.
- **Tỷ lệ hook mới** `explore` (mặc định 0,2): sinh `max(2, ⌈n × explore / 5⌉)` hook mới trước khi dựng (qua cổng chính sách + claim như M19) và rải đều ~`n × explore` bản dùng hook mới, để lô sau không chỉ khai thác hook cũ.
- `variants.json` ghi `learn` (KPI, trọng số, hook thắng, số bản hook mới / hook thắng); mỗi bản có `learn_hook`: `new`, `winner` hoặc `library`.
- Chưa có số liệu thì chạy như ma trận thường và in lý do.

## Nối vòng phản hồi
Sau khi `import`, có yếu tố thắng thì thêm đề xuất "Lô kế tiếp có trọng số" vào `~/.ai-video-studio/suggestions.json` (một đề xuất mỗi dự án, cập nhật khi nhập tiếp). Áp dụng (`node scripts/feedback.mjs act <id> apply`, hoặc nút trong panel Agent / Telegram `/dexuat`) xếp hàng việc `variants` với `--kind matrix --learn --kpi … --explore …`.

## Giới hạn
- Chưa có giao diện nhập CSV trong Studio; nhập bằng lệnh.
- Không kiểm định thống kê (khoảng tin cậy, ý nghĩa); ngưỡng `n ≥ 2` và tối thiểu lượt hiển thị chỉ chặn nhiễu thô.
- Ghép dựa vào tên quảng cáo giữ nguyên mã bản; đổi tên trên Ads Manager thì dòng đó thành "không có mã".
- Trục `voice` lấy theo tên file giọng của timeline; `music` theo `mood` hoặc tên file nhạc đầu tiên.
