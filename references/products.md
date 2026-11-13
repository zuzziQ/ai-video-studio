# Product Brain: hồ sơ sản phẩm dùng chung

Code: `scripts/products.mjs` (đọc/ghi, kiểm id), `studio/routes/53_products.mjs` (API), `studio/features/53_products.js` (panel **Sản phẩm**), phần giải hồ sơ trong `scripts/ad_gates.py` (`resolve_ads`). Test: `node --test scripts/tests/products.test.mjs`, `python -m unittest scripts.tests.test_ad_gates`.

Một sản phẩm có thể xuất hiện trong nhiều video. Thay vì nhập lại claim cho từng dự án, claim, bằng chứng, cụm từ cấm và FAQ nằm ở một hồ sơ dùng chung; dự án chỉ trỏ tới hồ sơ.

## Nơi lưu
`$AVS_HOME/products/<id>.json` (mặc định `~/.ai-video-studio/products/`), mỗi sản phẩm một file:

```json
{
  "version": 1, "id": "serum-b5-3f2a", "name": "Serum B5 đầu nhỏ giọt", "brand": "Lychee", "industry": "cosmetics",
  "claims": [
    {"id": "c1", "text": "Đầu nhỏ giọt giúp kiểm soát lượng dùng", "status": "approved",
     "evidence": "Thử nghiệm nội bộ 03/2026", "source": "https://…", "expires": "2027-03-01"},
    {"id": "c2", "text": "Trị dứt điểm mụn sau một tuần", "status": "prohibited", "evidence": "", "source": "", "expires": ""}
  ],
  "blocked": ["tên đối thủ"],
  "faq": [{"q": "Dùng mấy lần một ngày?", "a": "Sáng và tối, 2–3 giọt"}],
  "notes": "", "created": "…", "updated": "…"
}
```

- `id`: chỉ chữ thường không dấu, số, `-`, `_` (1–64 ký tự), sinh từ tên khi tạo. Không có dấu chấm hay gạch chéo nên không trỏ được ra ngoài `products/`; file là symlink ra ngoài thư mục cũng bị từ chối (403).
- `claims[].status`: `approved` (đã duyệt, **bắt buộc có `evidence`**: thiếu thì API từ chối lưu), `pending` (chờ duyệt, không tính là claim đã duyệt), `prohibited` (cấm nói), `expired`. Claim `approved` có `expires` (YYYY-MM-DD) đã qua được coi là `expired`.
- `industry`: như `ads.industry` của cổng quảng cáo (`references/ad-gates.md`).

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
- Hộp thoại **Kiểm tra quảng cáo** (panel AI → Kiểm tra chất lượng → Thiết lập): ô **Sản phẩm** chọn hồ sơ; khi đã chọn, ô claim bên dưới là "claim thêm riêng dự án này".

## API
Như mọi `/api/*`: cần token phiên (`X-AVS-Token`, `references/studio.md` mục API).

| Route | Ý nghĩa |
|---|---|
| `GET /api/products` | `[{id, name, brand, industry, updated, claims:{approved, pending, prohibited, expired}, blocked, faq}]` (đếm theo trạng thái hôm nay) |
| `GET /api/products/<id>` | hồ sơ đầy đủ; id sai dạng → 400, không có → 404 |
| `POST /api/products/save` | `{product}`; không có `id` = tạo mới; claim đã duyệt thiếu bằng chứng, thiếu tên → 400 |
| `POST /api/products/delete` | `{id}` |

## Giới hạn
- Chưa có lịch sử sửa hồ sơ hay người duyệt claim: "đã duyệt" là do người dùng đánh dấu, bằng chứng là chữ tự do.
- FAQ chưa được cổng quảng cáo dùng; dành cho bước viết kịch bản (`M22`).
