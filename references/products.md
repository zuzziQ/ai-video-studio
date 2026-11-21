# Product Brain: hồ sơ sản phẩm dùng chung

Code: `scripts/products.mjs` (đọc/ghi, kiểm id), `studio/routes/53_products.mjs` (API), `studio/features/53_products.js` (panel **Sản phẩm**), phần giải hồ sơ trong `scripts/ad_gates.py` (`resolve_ads`). Test: `node --test scripts/tests/products.test.mjs`, `python -m unittest scripts.tests.test_ad_gates`.

Một sản phẩm có thể xuất hiện trong nhiều video. Thay vì nhập lại claim cho từng dự án, claim, bằng chứng, cụm từ cấm và FAQ nằm ở một hồ sơ dùng chung; dự án chỉ trỏ tới hồ sơ.

## Nơi lưu
`$AVS_HOME/products/<id>.json` (mặc định `~/.ai-video-studio/products/`), mỗi sản phẩm một file:

```json
{
  "version": 1, "id": "serum-b5-3f2a", "name": "Serum B5 đầu nhỏ giọt", "brand": "Lychee", "industry": "cosmetics", "price": "350.000đ",
  "claims": [
    {"id": "c1", "text": "Đầu nhỏ giọt giúp kiểm soát lượng dùng", "status": "approved",
     "evidence": "Thử nghiệm nội bộ 03/2026", "source": "https://…", "expires": "2027-03-01"},
    {"id": "c2", "text": "Trị dứt điểm mụn sau một tuần", "status": "prohibited", "evidence": "", "source": "", "expires": ""}
  ],
  "blocked": ["tên đối thủ"],
  "faq": [{"q": "Dùng mấy lần một ngày?", "a": "Sáng và tối, 2–3 giọt"}],
  "notes": "", "image": "image.png", "created": "…", "updated": "…"
}
```

- `id`: chỉ chữ thường không dấu, số, `-`, `_` (1–64 ký tự), sinh từ tên khi tạo. Không có dấu chấm hay gạch chéo nên không trỏ được ra ngoài `products/`; file là symlink ra ngoài thư mục cũng bị từ chối (403).
- `claims[].status`: `approved` (đã duyệt, **bắt buộc có `evidence`**: thiếu thì API từ chối lưu), `pending` (chờ duyệt, không tính là claim đã duyệt), `prohibited` (cấm nói), `expired`. Claim `approved` có `expires` (YYYY-MM-DD) đã qua được coi là `expired`.
- `industry`: như `ads.industry` của cổng quảng cáo (`references/ad-gates.md`).
- `price` (M91): chuỗi giá giữ nguyên như người dùng hoặc trang bán ghi (≤ 60 ký tự), không đổi định dạng; trống nếu chưa có.
- `image` (M18, tuỳ chọn): tên file `image.<jpg|png|webp>` trong `$AVS_HOME/products/<id>/` (như logo thương hiệu ở `brands/<id>/`). Chỉ `POST /api/products/image` đặt trường này (kiểm byte đầu, ≤ 8 MB, ghi qua file tạm, thay ảnh cũ); lưu hồ sơ không gửi `image` thì giữ ảnh đang có, gửi `image: ""` thì bỏ ảnh (xoá file). Thư mục `<id>/` là liên kết ra ngoài `products/` → 403. Xoá hồ sơ xoá luôn thư mục `<id>/`. Hồ sơ cũ không có `image` chạy như trước (graphic giữ ô giữ chỗ).
- Gắn hồ sơ có ảnh vào dự án: ảnh được chép vào `<dự án>/media/product_<id>.<ext>` (chỉ khi thiếu hoặc khác; `productHero` cho AI dựng và Tự lái, `POST /api/products/use-image` cho Studio) và dùng làm `image` của `rv_product` máy dựng khi khối chưa có ảnh.

## Dự án dùng hồ sơ
`timeline.json`:

```json
"ads": {"on": true, "product": "serum-b5-3f2a", "platforms": ["meta", "tiktok"]}
```

Khi kiểm tra quảng cáo, `ad_gates.py` đọc hồ sơ và gộp:
- **claim**: claim của hồ sơ (id dạng `<id hồ sơ>:<id claim>`) trước, rồi `ads.claims` nhập tay của dự án (nếu có). Trạng thái lấy theo luật trên (thiếu bằng chứng hoặc quá hạn thì không còn là đã duyệt, kể cả khi file bị sửa tay).
- **cụm từ cấm**: `ads.blocked` của dự án + `blocked` của hồ sơ (bỏ trùng, không phân biệt hoa/thường).
- **ngành**: `ads.industry` nếu có, không thì ngành của hồ sơ, không nữa thì đoán như cũ.

Dự án cũ không có `ads.product` chạy y như trước. Hồ sơ không tồn tại hoặc id sai dạng: thêm vấn đề `ad_claim` mã `PRODUCT-MISSING` mức cao (chặn xuất, bỏ qua được khi ghi lý do như mọi lỗi claim). Kết quả `ad_gates.py` có thêm `product: {id, name, claims, approved}` hoặc `{id, error}`.

## Studio
- Panel **Sản phẩm** (thanh trái): danh sách hồ sơ, tạo/sửa (claim kèm trạng thái, bằng chứng, nguồn, ngày hết hạn; cụm từ cấm; FAQ; ghi chú), xoá, **Dùng cho dự án** (đặt `ads.product`, bật kiểm tra quảng cáo; hoàn tác được), **Tạo từ claim của dự án** khi dự án còn claim nhập tay (claim đã duyệt cũ chuyển thành "Chờ duyệt" cho tới khi điền bằng chứng).
- **Điền bằng AI** (M91, trợ lý `product` của `references/assist.md`): ở panel Sản phẩm (nút dưới danh sách, và ô cuối form) và bước Tài nguyên của hướng dẫn lần đầu. Từ ảnh sản phẩm và/hoặc link trang bán (tải qua `net_guard`, chặn mạng nội bộ): đề xuất tên, giá (chỉ giữ khi có nguyên văn trên trang; đọc từ ảnh thì ghi chú phải kiểm lại), ngành, điểm mạnh và claim (**luôn Chờ duyệt**, AI không đánh dấu duyệt hay điền bằng chứng được; mỗi câu kèm cờ rủi ro từ `ad_gates.py --script`), FAQ chỉ dựa trên nguồn. Nhận từng mục mới thêm vào form; bấm Lưu mới ghi hồ sơ.
- **Graphic sản phẩm theo hồ sơ** (M18, lõi `studio/features/53_products.core.js`, test `node --test scripts/tests/product_fill.test.mjs`): khối do máy dựng (`_recipe`, `_ai`, `_auto`) loại `rv_product` lấy tên, thương hiệu, giá của hồ sơ (bỏ giá cũ, nhãn, logo ví dụ do máy tự nghĩ; logo là logo của bộ thương hiệu dự án); `rv_proscons` còn chữ giữ chỗ thì ưu điểm là claim **đã duyệt** nguyên văn (≤ 48 ký tự), claim chờ duyệt không bao giờ lên màn hình; `rv_specs_vs` đổi tên giữ chỗ bên A. Mỗi khối điền một lần (cờ `_prod` = id hồ sơ), sửa tay sau đó được giữ. Chạy khi mở dự án, sau "Dựng tự động theo gói", khi gắn hồ sơ (panel Sản phẩm, hướng dẫn lần đầu), trong `scripts/ai_edit.mjs` (dự án có hồ sơ thì `rv_product` vào danh sách khối cho Claude, prompt có tên, giá, điểm mạnh đã duyệt và luật không khẳng định claim chờ duyệt; giá và claim đã duyệt không bị coi là số tự nghĩ) và sau bước AI dựng của Tự lái.
- **Ảnh sản phẩm** (`studio/features/87_prodimg.js`): đầu Thuộc tính của khối có trường `image` (hero sản phẩm…): chọn ảnh từ Media, tải ảnh lên (vào `media/`), bỏ ảnh; khối `rv_product` của dự án có hồ sơ có thêm **Điền lại theo hồ sơ** và **Lưu làm ảnh của hồ sơ** (ảnh đang dùng thành ảnh của hồ sơ).
- **Ảnh của hồ sơ** (form panel Sản phẩm): tải lên / đổi / bỏ ảnh, xem trước; ảnh đã chọn ở Điền bằng AI có nút **Dùng ảnh của AI**. Ảnh chỉ ghi khi bấm Lưu (hồ sơ mới: sau khi có id).
- Hộp thoại **Kiểm tra quảng cáo** (panel AI → Kiểm tra chất lượng → Thiết lập): ô **Sản phẩm** chọn hồ sơ; khi đã chọn, ô claim bên dưới là "claim thêm riêng dự án này".

## API
Như mọi `/api/*`: cần token phiên (`X-AVS-Token`, `references/studio.md` mục API).

| Route | Ý nghĩa |
|---|---|
| `GET /api/products` | `[{id, name, brand, industry, updated, claims:{approved, pending, prohibited, expired}, blocked, faq}]` (đếm theo trạng thái hôm nay) |
| `GET /api/products/<id>` | hồ sơ đầy đủ; id sai dạng → 400, không có → 404 |
| `POST /api/products/save` | `{product}`; không có `id` = tạo mới; claim đã duyệt thiếu bằng chứng, thiếu tên → 400 |
| `POST /api/products/delete` | `{id}`; xoá cả thư mục `products/<id>/` |
| `POST /api/products/image?id=` | thân = ảnh PNG/JPG/WebP thô (≤ 8 MB, kiểm byte đầu) → hồ sơ có `image`; quá cỡ → 413, không phải ảnh / id sai → 400, không có hồ sơ → 404 |
| `GET /api/products/image?id=` | ảnh của hồ sơ; chưa có → 404 |
| `POST /api/products/use-image` | `{id}` → `{image}`: chép ảnh hồ sơ vào `media/product_<id>.<ext>` của dự án đang mở (`''` khi hồ sơ không có ảnh) |

## Kịch bản có claim gate (M22)
Code: `scripts/script_gate.mjs` (`gatedScript`), `ad_gates.py --script` (`check_script`), nối vào `scripts/topic_video.mjs`. Test: `node --test scripts/tests/script_gate.test.mjs` (LLM giả lập).

```bash
node scripts/topic_video.mjs "Serum B5 cho da khô mùa đông" --out ~/Desktop/serum --product serum-b5-3f2a [--platforms meta,tiktok]
node scripts/topic_video.mjs "<chủ đề>" --out <thư mục> --claim-gate      # chưa có hồ sơ: chỉ soát chính sách và cụm từ rủi ro
```

1. Đọc hồ sơ qua `check_script` (luật trạng thái như trên). Hồ sơ thiếu hoặc id sai: dừng ngay, không gọi LLM.
2. Prompt viết kịch bản của `topic_video.mjs` + luật: chỉ diễn đạt sát các claim đã duyệt (liệt kê), không nói claim cấm/hết hạn, không dùng cụm từ cấm, không cam kết tuyệt đối / y khoa / trước-sau / "số 1"; FAQ làm tư liệu. Claim chờ duyệt không được đưa vào.
3. Soát mọi câu của kịch bản: lời mở đầu, lời từng ý, lời kêu gọi, chữ trên màn hình (`screen`, `sub`, `items`), tiêu đề và mô tả đăng. Cùng luật với QC (`text_issues`: chính sách + claim gate, câu được coi là dẫn claim khi khớp ≥ 0,35). Lỗi mức cao (chặn) mới tính là sai; nhắc mức vừa giữ trong `script.json`.
4. Sai: hỏi lại một lần kèm danh sách lỗi (chỗ nào, mã, câu). LLM trả không phải JSON hợp lệ cũng tính là một lần sai; lỗi đăng nhập, hạn mức, timeout thì báo luôn.
5. Vẫn sai: **khuôn mẫu**: mỗi ý là nguyên văn một claim đã duyệt (tối đa số ý theo `--dur`), câu mở và kêu gọi trung tính (không nêu lợi ích), tiêu đề là tên sản phẩm. Khuôn mẫu cũng được soát; claim đã duyệt mà tự dính luật chặn (vd "100%") bị bỏ. Không có claim đã duyệt nào: một câu trung tính trỏ tới phần mô tả.

`script.json` có `claim_gate: {mode: "llm"|"template", attempts:[{blocked, issues}], issues, product, approved}`; dòng `RESULT` có `claim_gate`. Timeline mới có `ads: {on: true, product}` nên Kiểm tra chất lượng và cổng chặn xuất soát lại sau khi dựng. `--script` (kịch bản có sẵn) không qua bước sinh lại.

## Giới hạn
- Chưa có lịch sử sửa hồ sơ hay người duyệt claim: "đã duyệt" là do người dùng đánh dấu, bằng chứng là chữ tự do.
- FAQ chỉ được dùng làm tư liệu trong prompt viết kịch bản, cổng quảng cáo không soát theo FAQ.
- Claim gate dựa trên độ khớp chữ: câu diễn đạt lại quá xa claim đã duyệt có thể bị nhắc (mức vừa) dù đúng ý.
