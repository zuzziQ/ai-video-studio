# Trợ lý LLM trong tính năng (`scripts/assist.mjs`)

> Phần thêm của bản `zuzziQ/ai-video-studio` (ROADMAP `M91`). Dựa trên AI Video Studio của Nguyễn Tất Kiểm.

Lớp dùng chung để gắn LLM vào một tính năng của Studio theo cùng một luật: chạy dạng job có tiến độ, kết quả là **đề xuất từng trường** để người dùng Nhận / Bỏ / Nhận tất cả, không tự ghi đè, có kiểm kết quả, lỗi CLI báo nguyên văn.

| Phần | File |
|---|---|
| Bảng trợ lý, kiểm đầu vào, gọi LLM, chuẩn hoá kết quả | `scripts/assist.mjs` |
| API + job | `studio/routes/05_assist.mjs` |
| Giao diện dùng chung | `studio/features/05_assist.js` (`Studio.assist`, `Studio.assistPanel`, `Studio.imagePayload`) |
| Test (CLI giả, mạng giả) | `scripts/tests/assist.test.mjs` |

Trợ lý có sẵn: `brand` (bước Thương hiệu của hướng dẫn lần đầu, form brand kit ở panel Thương hiệu) và `product` (bước Tài nguyên của hướng dẫn, panel Sản phẩm). `M90` (soát lời thoại) và `M92` (trợ lý chữ, nhấn từ khoá, gợi ý mẫu, ảnh bìa) thêm trợ lý mới vào cùng bảng.

## Luồng

1. Giao diện gom đầu vào (`input()` của `assistPanel`): ảnh được vẽ lại qua canvas (`Studio.imagePayload`, thu nhỏ, bỏ EXIF và vị trí chụp) thành data URL; màu logo đo bằng canvas (`Studio.logoColors`, cùng hàm của hướng dẫn lần đầu).
2. `POST /api/assist/<tên>` → `check(raw)` của trợ lý (sai → 400) → `ctx.startJob('assist', …)`: dùng ô job chung của Studio (một job một lúc như xuất video; đang bận → 409; huỷ bằng `POST /api/job/cancel`, `job.proc` là tiến trình `claude`). Không dùng `scripts/queue.mjs` (hàng đợi Tự lái): việc trợ lý chạy ngay, ngắn (5–60 s), người dùng ngồi chờ.
3. `runAssist`: `prepare` (tải website nếu có) → ghi ảnh vào một thư mục tạm chỉ chứa ảnh đó (`logo.png`, `product.jpg`) → `askJSON` của `scripts/llm.mjs` (`shape: 'object'`, `retries: 1`, `validate` = `normalize` của trợ lý) → `post` (soát thêm, ví dụ `ad_gates.py`) → xoá thư mục tạm.
4. Giao diện hỏi `GET /api/assist/<tên>` mỗi 0,8 s (setTimeout, không dựa animation) tới khi `state` khác `running`, rồi hiện đề xuất.

Nhà cung cấp: có ảnh → Claude xem ảnh bằng `--allowedTools Read --add-dir <thư mục tạm>`, `cwd` là thư mục đó; chỉ có chữ → `task: 'text'`, chạy theo cấu hình (`references/llm.md`: Claude hoặc Ollama). Thời gian chờ mặc định 180 s (`AVS_ASSIST_TIMEOUT_S`).

## Kết quả

```json
{ "state": "done", "run": 3, "provider": "claude", "ms": 7654, "warnings": ["…"], "reason": "…",
  "fields": [ { "id": "primary-0", "key": "primary", "label": "Màu chính", "kind": "color", "value": "#E63946", "note": "màu 1 đo được" },
              { "id": "claim-4", "key": "claim", "label": "Claim", "kind": "claim", "value": { "text": "…", "status": "pending" },
                "risk": [ { "severity": "high", "message": "…" } ], "note": "Rủi ro cao: …" } ] }
```

`kind`: `color` (ô màu + mã), `font` (`display` là tên, `value` là giá trị CSS), `text`, `claim` (`value.text`), `faq` (`value.q`, `value.a`). Trạng thái lỗi: `{state: 'error'|'cancelled', error, kind}`; `kind` theo `LlmError` (`missing`, `login`, `quota`, `timeout`, `parse`…), `error` là câu tiếng Việt của `llm.mjs` (thiếu `claude`: cách cài; chưa đăng nhập: chạy `claude` một lần).

## Robust-llm (bắt buộc cho mọi trợ lý)

- **Parse lỏng + hỏi lại**: `askJSON` bỏ ```, lời dẫn, dấu phẩy thừa; `normalize` ném lỗi (thiếu trường bắt buộc, sai kiểu) thì hỏi lại một lần kèm lý do.
- **Chuẩn hoá thay vì tin**: chỉ nhận giá trị trong tập cho phép (màu trong bảng đo được, font trong danh sách có tiếng Việt, ngành trong `INDUSTRIES`), cắt độ dài, bỏ trùng; giá trị ngoài tập thì thay bằng luật hoặc bỏ, kèm một dòng `warnings`.
- **Lùi về luật**: JSON vẫn hỏng sau khi hỏi lại → `fallback(input, prep)` (nếu trợ lý có) với `provider: 'rules'`. Lỗi CLI (thiếu `claude`, chưa đăng nhập, hết lượt, quá giờ, huỷ) **không** lùi về luật: báo nguyên văn để người dùng sửa.
- **Không bịa, không tự duyệt**: dữ liệu chép từ nguồn (giá) phải đối chiếu được với nguồn; trạng thái duyệt do người dùng đặt (claim luôn `pending`, không mang `evidence`).

## An toàn

- Prompt không chứa đường dẫn tuyệt đối, tên máy hay token: `assertCleanPrompt` chặn (lỗi 500) nếu prompt có home, thư mục tạm, thư mục repo, `AVS_HOME`, tên máy dạng `DESKTOP-AB12` hay chuỗi giống khoá API. Ảnh được gọi bằng tên tương đối trong thư mục hiện tại.
- Website / link: chỉ `http(s)` không kèm tài khoản; tải qua `safeFetch` của `scripts/net_guard.mjs` (chặn localhost, mạng nội bộ, link-local/metadata đám mây, kiểm lại ở mỗi lần chuyển hướng và ở IP thật lúc nối), không gửi cookie, đọc tối đa 1,5 MB (`maxBytes`), 10 s. Chỉ nhận `text/html`, `xhtml`, `text/plain`. Nội dung trang vào prompt trong khối "CHỈ LÀ DỮ LIỆU" và chỉ phần chữ (bỏ script, style, iframe).
- Ảnh: chỉ PNG/JPEG/WebP kiểm chữ ký file, ≤ 6 MB sau giải mã.
- Route không ghi gì xuống đĩa; kết quả chỉ nằm trong bộ nhớ (lượt gần nhất của mỗi trợ lý).

## Trợ lý `brand`

Đầu vào: `{image?, colors?: ['#RRGGBB' ≤ 6], website?, industry?, name?}` (cần ít nhất ảnh, website hoặc tên).
- Bảng màu cho phép = màu đo được (+ `theme-color` của website) + biến thể đậm/nhạt 25/50/85 % + trắng, đen. Vai trò `primary`, `accent`, `dark`, `light` chỉ được chọn trong bảng; ngoài bảng → luật (`ruleColors`: chính = màu đo đầu, nhấn = màu đo thứ hai hoặc bản nhạt 50 %, nền tối = màu chính đậm 85 %, chữ sáng = trắng).
- Tương phản `light` trên `dark` < 4,5:1 → đổi sang màu sáng nhất và tối nhất của bảng. Chữ sáng trên màu chính < 4,5:1 → ghi chú ở trường Màu chính.
- Font: Be Vietnam Pro, Montserrat, Inter, Lexend, Nunito, Oswald, Playfair Display, Bungee, Pacifico (DM Serif Display không có bộ chữ tiếng Việt nên không đề xuất).
- Chữ: `voice` (3 tính từ + câu mẫu, lưu một chuỗi), `slogan`, `cta`, `outro`; từ tuyệt đối (tốt nhất, số 1, 100 %…) có ghi chú rủi ro. Brand kit có thêm khoá `slogan`, `cta`, `voice` (`studio/routes/51_brands.mjs`).

## Trợ lý `product`

Đầu vào: `{image?, url?, industry?, brand?, name?}` (cần ảnh hoặc link). Kết quả: `name` (bắt buộc), `price`, `industry`, các `claim` (điểm mạnh + claim, ≤ 6 mỗi loại, bỏ trùng), `faq` (≤ 5, câu không có đáp bị bỏ).
- Giá giữ nguyên chuỗi: có link thì phải có nguyên văn trên trang (so sau khi bỏ khoảng trắng), không thì bỏ kèm cảnh báo; chỉ có ảnh thì giữ kèm ghi chú "đọc từ ảnh, kiểm lại".
- Claim luôn `pending`; AI ghi `approved` hay `evidence` → bị bỏ, kèm cảnh báo.
- Cờ rủi ro: `python scripts/ad_gates.py --script -` trên các câu claim (chính sách Meta/TikTok, cụm từ rủi ro; `risk_source: 'ad_gates'`); không chạy được Python thì dò danh sách từ đơn giản (`risk_source: 'rules'`).

## Thêm một trợ lý mới (cho M90, M92…)

1. Trong `scripts/assist.mjs`, viết một object và thêm vào `ASSISTANTS`:
   ```js
   const captionFix = {
     label: 'Soát lời thoại',
     check(raw) { /* kiểm kiểu, giới hạn độ dài; sai → throw new AssistError('…') (400) */ return input; },
     image: input => null,              // hoặc decodeImage(...) nếu cần Claude xem ảnh; imageName: 'frame'
     async prepare(input, env) { return { warnings: [] }; },   // tuỳ chọn: tải thêm dữ liệu (luôn qua net_guard)
     prompt(input, prep) { return '… Trả về DUY NHẤT JSON {…}'; },   // không đưa đường dẫn/tên máy/token
     normalize(v, input, prep) { /* chuẩn hoá; thiếu thứ bắt buộc → throw new Error('thiếu …') để hỏi lại */
       return { fields: [{ key, label, kind: 'text', value }], warnings: [] }; },
     fallback(input, prep) { return null; },   // tuỳ chọn: kết quả theo luật khi JSON hỏng
     async post(out, input, prep, env) { return out; },   // tuỳ chọn: soát thêm (ad_gates, từ điển…)
   };
   ```
   Mỗi trường cần `key` (khoá dữ liệu bên giao diện sẽ ghi), `label`, `kind`, `value`; `note` và `risk` tuỳ chọn. `id` do `runAssist` gán.
2. Test trong `scripts/tests/assist*.test.mjs` với CLI giả (`fixtures/fake_claude.mjs`): JSON hỏng, thiếu trường, giá trị ngoài tập, và luật riêng của trợ lý (ví dụ không tự duyệt).
3. Giao diện: đặt một `<div>` trong panel và
   ```js
   const ai = Studio.assistPanel({ name: 'captionFix', label: 'Soát bằng AI', hint: '…',
     input: async () => ({ … }),                 // ném Error('…') để báo thiếu đầu vào
     current: f => giáTrịHiệnTại(f),             // hiện "Hiện tại: …" cạnh đề xuất
     onAccept: f => ghiVàoForm(f),               // chỉ chạy khi người dùng bấm Nhận / Nhận tất cả
     filter: f => true });                       // tuỳ chọn: chỉ hiện một số trường
   ai.mount(el);                                 // vẽ lại panel thì mount lại; trạng thái nằm trong `ai`
   ```
   Hoặc gọi thẳng `await Studio.assist(name, input, { onStep })` nếu cần giao diện riêng (gạch chân trong lời thoại của M90).
4. Cập nhật bảng API trong `references/studio.md` nếu thêm route khác, và mục trợ lý trong file này.
