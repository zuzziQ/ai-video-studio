# Ma trận biến thể, cổng đa dạng nguồn, ước tính lô lớn (M21, M20, M23)

`node scripts/variants.mjs <dự_án> --kind matrix --n 40 …` tạo một lô dự án anh em `<dự_án>_v1.._vN`, mỗi bản là một tổ hợp
**khán giả × góc × kết cấu × thời lượng × bố cục**. Phần thuần nằm ở `scripts/variant_matrix.mjs` (không mở engine),
test: `node --test scripts/tests/variant_matrix.test.mjs`.

Chuyển từ AI Video Factory (`services/api/avf/creative.py` `plan_matrix`; `scale.py` `SOURCE_GATE`, `check_source_gate`,
`estimate_plan`), viết lại theo kiến trúc Studio: nguồn và cảnh đọc từ `timeline.json`, thời gian đo từ `queue.json`.

## Lệnh

```bash
node scripts/variants.mjs <dự_án> --kind matrix --n 40 --estimate          # chỉ in ước tính + kế hoạch, không tạo gì
node scripts/variants.mjs <dự_án> --kind matrix --n 40 \
  [--audiences new_buyers,loyal] [--angles faq,mistakes,qa] [--narratives faq,how_to] \
  [--durations 0,15,30] [--formats full,split] [--seed 42] [--allow-low-source] [--export] [--no-claude]
```

Trục mặc định đọc từ `timeline.ads.matrix` (`audiences, angles, narratives, durations, formats, quota_ratio, seed`), cờ dòng lệnh
ghi đè. Thiếu thì: 2 khán giả đầu, mọi góc, mọi kết cấu, thời lượng `0` (giữ nguyên), bố cục `full`.

| Trục | Giá trị | Tác động lên bản |
|---|---|---|
| khán giả `audience` | `new_buyers, sensitive, busy_professionals, ingredient_focused, loyal` (hoặc chữ tự do) | ghi trục |
| góc `angle` | `how_to, faq, demo, comparison, mistakes, feature, brand_story, checklist, qa, tips` | hook lấy từ thư viện hook theo góc |
| kết cấu `narrative` | `problem_solution, how_to, faq, comparison, product_story` | kiểu chữ hook (style/anim/sfx) |
| thời lượng `duration` | giây; `0` = giữ độ dài | cắt timeline (phụ đề, scene, clip, sfx, nhạc, fx) |
| bố cục `format` | `full` (giữ gói), `split` → gói `split`, `packshot_text` → `review`, `pip` → `podcast` | công thức gói style; gói không hợp khổ hình thì giữ gói cũ và ghi chú |

Khán giả và kết cấu hiện chỉ ghi trục và đổi kiểu hook; kịch bản theo khán giả/kết cấu thuộc `M22`. Trục ghi ở
`variants.json` → `variants[].axes` và `timeline._variant.axes` của từng bản (để `M32` đo yếu tố thắng).

## Tổ hợp khả thi

Tổ hợp bị loại kèm lý do: `NEED_MORE_SOURCE` (dự án chưa có hình, hoặc góc cần thẻ cảnh chưa có: `how_to` cần
`demonstration`+`hand`, `demo` cần `demonstration`, `comparison`/`feature` cần `packshot`, `brand_story`/`qa` cần `face`,
`tips` cần `hand`), `NO_CLAIM` (dự án bật `ads` mà chưa có claim đã duyệt), `TOO_LONG` (thời lượng dài hơn video gốc).
Thẻ cảnh lấy từ `clips[].tags`, `scenes[].tags`, `timeline.face` (→ `face`, `presenter`) và `timeline.ads.source_tags`
(`{"packshot": 3}`, khai tay). Mỗi góc tối đa `ceil(n × quota_ratio)` bản (mặc định 25%); chọn tham lam theo điểm trừ phần
trùng giá trị trục với các bản đã chọn, nên lô nhỏ vẫn trải đều thời lượng/bố cục. Thiếu bản thì lấp bằng tổ hợp vượt quota
(`quota_overflow: true`).

Hook: `pickHook` theo góc, mỗi hook tối đa 5 bản, hết thì sinh thêm (`generateHooks`, LLM hoặc mẫu với `--no-claude`);
xem `references/hook-library.md`. Hook mẫu không gắn với góc cụ thể.

## Cổng đa dạng nguồn (M20)

| Số bản | Video nguồn khác nhau | Cảnh (đoạn hình hiện) |
|---|---|---|
| > 20 | ≥ 3 | ≥ 12 |
| > 100 | ≥ 5 | ≥ 25 |
| > 300 | ≥ 8 | ≥ 40 |

Video nguồn = file khác nhau của A-roll, `clips[].src`, scene có file ảnh/video. Cảnh = clip đang hiện + scene có file.
Thiếu thì dừng với lỗi `NEED_MORE_SOURCE` và gợi ý thêm nguồn; `--allow-low-source` cho chạy, cảnh báo ghi vào
`variants.json` → `source_gate.warnings`.

## Ước tính (M23)

In trước mọi lần chạy ma trận (và là toàn bộ đầu ra của `--estimate`, kèm dòng `RESULT {json}`):

- số tổ hợp lý thuyết / khả thi / sẽ tạo, lý do loại;
- hook: còn lượt, cần (`ceil(n / 5)`), phải sinh thêm;
- giờ **LLM** = số lần gọi (10 hook mỗi lần) × thời gian một lần (đo trong kho hook, `stats.llm_s`); giờ **dựng** = n × thời gian
  dựng một bản; giờ **xuất** = n × thời gian xuất một bản. Hai số sau đo từ job `variants` đã xong trong
  `~/.ai-video-studio/queue.json` (chỉ đọc; job không xuất → dựng, job `--export` → trừ phần dựng ra xuất). Chưa có job thì dùng
  mặc định (8 s, 90 s, 30 s) và ghi "mặc định";
- dung lượng = n × (kích thước dự án trừ `out/` + cỡ mp4 trung bình trong `out/`, mặc định 12 MB khi `--export`);
- cảnh báo: `NEED_MORE_SOURCE`, `COMBOS_LOW` (ít tổ hợp khả thi hơn số bản), `HOOKS_LOW`.
