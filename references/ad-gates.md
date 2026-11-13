# Kiểm tra quảng cáo: chính sách, claim, điểm nguyên bản

Code: `scripts/ad_gates.py` (luật + CLI), `scripts/ai_qc.mjs` (`adsPass`), `studio/features/16_qc.js` (hộp thoại "Kiểm tra quảng cáo"). Test: `python -m unittest discover -s scripts/tests`.

Phần luật chuyển từ AI Video Factory (`policy.py`, `creative.py`, `scale.py`). Nó chỉ dò ngôn ngữ rủi ro theo chính sách công bố của Meta và TikTok: không phải tư vấn pháp lý, không thay kiểm duyệt của nền tảng, không bảo đảm quảng cáo được duyệt.

## Bật
Mặc định tắt. Bật trong Studio: panel AI → thẻ **Kiểm tra chất lượng** → **Thiết lập** ở dòng "Kiểm tra quảng cáo". Thiết lập lưu trong `timeline.json`:

```json
"ads": {
  "on": true,
  "industry": "cosmetics",
  "platforms": ["meta", "tiktok"],
  "claims": [{"id": "c1", "text": "Đầu nhỏ giọt giúp kiểm soát lượng dùng", "status": "approved"},
             {"id": "c2", "text": "Trị dứt điểm mụn sau một tuần", "status": "prohibited"}],
  "blocked": ["tên đối thủ"],
  "originality_min": 0.35
}
```

- `industry`: `general`, `cosmetics`, `supplements`, `food`, `finance`, `health_device`. Bỏ trống thì đoán từ tên thương hiệu, tiêu đề và lời thoại.
- `claims[].status`: `approved` (đã có bằng chứng), `prohibited` hoặc `expired` (không được nói).
- `product`: id hồ sơ sản phẩm dùng chung (`references/products.md`). Có thì claim, cụm từ cấm và ngành lấy từ hồ sơ, gộp với phần nhập tay ở trên; hồ sơ thiếu → `PRODUCT-MISSING` mức cao.

Khi `ads.on`, mỗi lần chạy QC (`node scripts/ai_qc.mjs <dự án>`) gọi thêm `ad_gates.py`. Chạy riêng:

```bash
python scripts/ad_gates.py <dự án> [--against <dự án khác> ...]
```

## Soát cái gì
Đơn vị soát là **câu**: từ phụ đề ghép thành câu (ngắt ở dấu câu, quãng lặng > 0,8 s, hoặc đủ 28 từ; bỏ phụ đề ẩn), cộng **chữ trên màn hình** của từng scene (mọi trường chuỗi không phải đường dẫn, màu, id; bỏ scene ẩn và trường `note`). Thời điểm của vấn đề là lúc câu bắt đầu hoặc `t0` của scene.

| `kind` | Mã | Mức | Nội dung |
|---|---|---|---|
| `ad_policy` | `POLICY-BEFORE-AFTER`, `-GUARANTEE`, `-MEDICAL`, `-WEIGHT`, `-PERSONAL`, `-FINANCE`, `-ALCOHOL-TOBACCO` | cao | 7 nhóm luật chặn, lọc theo ngành và nền tảng |
| `ad_policy` | `POLICY-SUPERLATIVE`, `-URGENCY`, `-TESTIMONIAL`, `-NUMBER` | vừa | cần nguồn kiểm chứng |
| `ad_policy` | `POLICY-PRICE` | thấp | nhắc đối chiếu giá/ưu đãi với trang đích |
| `ad_claim` | `BLOCK-01` | cao | cụm từ rủi ro (danh sách sẵn + `blocked`), hoặc câu giống claim bị cấm > 55% |
| `ad_claim` | `WARN-CLAIM` | vừa | câu nêu lợi ích, hoặc có số đo hiệu quả (số + %, ngày, tuần, tháng, giờ, phút, lần), mà không khớp claim đã duyệt nào. Chỉ báo khi đã khai ít nhất một claim `approved` |
| `ad_originality` | `BLOCK-04` | cao | điểm nguyên bản dưới `originality_min` (bản ngoài `--against`, hoặc nhóm phiên bản không khai A/B) |
| `ad_originality` | `INFO-AB` | thấp | điểm nguyên bản thấp nhưng bản gần nhất cùng nhóm A/B khai báo và hook hoặc hình khác thật (< 90%) |

Studio không có trích dẫn tay: một câu được coi là dẫn claim đã duyệt khi độ khớp chữ (cosine unigram + bigram) ≥ 0,35.

## Điểm nguyên bản
Điểm = 1 − độ giống tổng hợp với bản gần nhất. Bản để so: các phiên bản trong `variants.json` (của dự án, hoặc của dự án gốc khi đang mở một phiên bản) và các thư mục sau `--against`. Không có bản nào thì không chấm.

Độ giống = chữ 35% (toàn bộ lời thoại) + hook 15% (chữ trên màn hình bắt đầu trong 3 giây đầu; không có thì câu nói đầu) + hình 35% (Jaccard trên A-roll, clip và scene; nhân 0,6 nếu khác gói style, 0,85 nếu khác kiểu phụ đề; +0,15 nếu cùng thứ tự) + tiếng 15% (cùng file giọng 0,6, cùng tốc độ clip 0,2, cùng nhạc 0,2).

Hai đường dẫn cùng chỉ một thư mục (tên ngắn 8.3 trên Windows, symlink) được coi là một: dự án không bao giờ so với chính nó.

**Nhóm A/B khai báo.** Các phiên bản do "Tạo phiên bản" (`scripts/variants.mjs`) sinh ra dùng chung lời thoại, A-roll, giọng và nhạc nên điểm luôn thấp (đo trên `sample/clip-mau`, 3 phiên bản khác hook: 0,20–0,27). `variants.json` ghi `ab_test: true` (file cũ có `kind` là `hook`, `style`, `both` cũng được tính, trừ khi ghi `ab_test: false`). Khi bản gần nhất nằm trong nhóm đó và hook hoặc hình khác thật (độ giống < 0,9), vấn đề là `INFO-AB` mức thấp: không chặn, chỉ nhắc chạy các bản chung một nhóm quảng cáo để so chứ đừng đăng như nhiều quảng cáo khác nhau. Hook và hình giống hệt thì vẫn `BLOCK-04`. Bản ngoài nhóm (`--against`) được chấm riêng và luôn chặn mức cao. `originality.ab` cho biết điểm hiển thị là của nhóm A/B.

## Kết quả
Vấn đề nằm trong `issues` của `.studio/qc.json` như mọi vấn đề QC khác (`src: "auto"`, thêm `code`, tham chiếu chính sách ở `note`), tính vào điểm QC. Thêm khối:

```json
"ads": {"enabled": true, "industry": "cosmetics", "platforms": ["meta", "tiktok"], "blocked": true,
        "claims": {"approved": 1, "other": 1},
        "originality": {"score": 0.42, "min": 0.35, "ok": true, "nearest": "<thư mục>", "parts": {…}, "compared": 2}}
```

`blocked` = còn ít nhất một vấn đề mức cao. Với `--fix`, sau khi lưu bản đã sửa `ai_qc.mjs` chạy lại `ad_gates.py`: vấn đề không còn được đánh dấu `fixed` (ghi chú "soát lại sau khi sửa: không còn"), vấn đề mới thêm vào với `new: true`, và `ads.blocked`, `ads.originality` là của lần soát lại (`ads.rechecked: true`). `hash_now` là hash của timeline sau khi sửa.

## Chặn xuất
`scripts/export_gate.mjs` đọc `.studio/qc.json`: chặn khi kiểm tra quảng cáo đang bật và còn vấn đề `ad_*` mức cao chưa sửa.

- **Lỗi chính sách (`ad_policy`) mức cao không bỏ qua được.** Sửa lời thoại hoặc chữ rồi kiểm tra lại.
- **Lỗi claim hoặc nguyên bản bỏ qua được khi ghi lý do** (≥ 10 ký tự). Lý do lưu ở `override` trong `qc.json` (lý do, lúc, ai, mã lỗi, hash) và nối thêm một dòng JSON vào `.studio/qc_overrides.log`. Lý do chỉ có hiệu lực cho đúng lần QC đó; QC chạy lại thì phải ghi lại.
- **Studio:** bấm Xuất → hộp thoại liệt kê lỗi, nút mặc định là Dừng; có nút "Kiểm tra lại", và ô lý do + "Vẫn xuất" khi được bỏ qua. Timeline đã đổi sau lần QC thì hộp thoại nhắc kiểm tra lại. API: `GET /api/qc/gate`, `POST /api/qc/override {reason}`. Cổng nằm ở giao diện (`studio/features/16_qc.js`); `POST /api/export` của `server.mjs` chưa tự kiểm.
- **Tự lái:** bước `qc` dừng chuỗi (dòng `LỖI: … CHẶN XUẤT …`, `autopilot.json` có `state: "blocked"`); bước `export` cũng kiểm lại theo lần QC trước khi QC bị tắt hoặc lỗi. Bỏ qua: `node scripts/autopilot.mjs <dự án> --qc-override "<lý do>"`.
- **Hàng đợi:** việc tự lái dừng ở cổng không tự thử lại (`blocked: true`); thử lại kèm lý do: `node scripts/queue.mjs retry <id> --qc-override "<lý do>"`.
- **Tạo phiên bản `--export`:** không xuất khi QC của dự án gốc đang chặn.

## Giới hạn
- Không tự sửa. Một vấn đề chỉ hết khi bản sửa của QC (Claude sửa chữ, đổi hook, ẩn scene thiếu file…) làm nó biến mất ở lần soát lại.
- Luật là regex tiếng Việt (một luật có tiếng Anh), theo tài liệu công bố đến 2025.
- Độ giống hình so danh sách cảnh, không so khung hình (chưa dùng perceptual hash hay embedding).
- So với bản gốc AI Video Factory có hai chỗ khác: cụm từ rủi ro và từ lợi ích khớp theo ranh giới từ ("số 1" không khớp "số 15"); cảnh báo số liệu chỉ tính số đo hiệu quả thay vì mọi con số.
