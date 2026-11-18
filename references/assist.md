# Trợ lý LLM trong tính năng (`scripts/assist.mjs`)

> Phần thêm của bản `zuzziQ/ai-video-studio` (ROADMAP `M91`). Dựa trên AI Video Studio của Nguyễn Tất Kiểm.

Lớp dùng chung để gắn LLM vào một tính năng của Studio theo cùng một luật: chạy dạng job có tiến độ, kết quả là **đề xuất từng trường** để người dùng Nhận / Bỏ / Nhận tất cả, không tự ghi đè, có kiểm kết quả, lỗi CLI báo nguyên văn.

| Phần | File |
|---|---|
| Bảng trợ lý, kiểm đầu vào, gọi LLM, chuẩn hoá kết quả | `scripts/assist.mjs` |
| API + job | `studio/routes/05_assist.mjs` |
| Giao diện dùng chung | `studio/features/05_assist.js` (`Studio.assist`, `Studio.assistPanel`, `Studio.imagePayload`) |
| Giao diện các trợ lý M92 (chữ, phụ đề, mẫu, ảnh bìa) | `studio/features/06_ai_suggest.js`, ô ảnh bìa trong `studio/features/52_publish.js` |
| Test (CLI giả, mạng giả) | `scripts/tests/assist.test.mjs`, `scripts/tests/assist_text.test.mjs` (M92) |

Trợ lý có sẵn: `brand` (bước Thương hiệu của hướng dẫn lần đầu, form brand kit ở panel Thương hiệu), `product` (bước Tài nguyên của hướng dẫn, panel Sản phẩm), và từ `M92`: `text` (chữ trên video), `captions` (nhấn từ khoá, ngắt dòng phụ đề), `templates` (gợi ý mẫu), `cover` (ảnh bìa), `transcript` của `M90` (soát lời thoại, panel Lời thoại).

## Luồng

1. Giao diện gom đầu vào (`input()` của `assistPanel`): ảnh được vẽ lại qua canvas (`Studio.imagePayload`, thu nhỏ, bỏ EXIF và vị trí chụp) thành data URL; màu logo đo bằng canvas (`Studio.logoColors`, cùng hàm của hướng dẫn lần đầu).
2. `POST /api/assist/<tên>` → `check(raw)` của trợ lý (sai → 400) → chạy trong **ô job riêng của trợ lý** (M90; không dùng `ctx.startJob`): đang xuất video hay tạo video mới vẫn chạy được trợ lý; vẫn chỉ một trợ lý một lúc (trợ lý khác đang chạy → 409). Huỷ bằng `POST /api/assist/cancel` (`Studio.assistCancel()`, nút Huỷ của `assistPanel`): đặt cờ huỷ và dừng tiến trình `claude` đang chạy; `POST /api/job/cancel` chỉ dừng job xuất video, không đụng trợ lý. Server tắt thì tiến trình `claude` của trợ lý cũng bị dừng. Không dùng `scripts/queue.mjs` (hàng đợi Tự lái): việc trợ lý chạy ngay, ngắn (5–60 s), người dùng ngồi chờ.
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
- Trang dựng bằng JavaScript (M122): trang ít chữ (`thinPage`: không JSON-LD, không mô tả meta/og, chữ < 200 ký tự; sàn hay chặn bot như Shopee, Lazada thì mô tả chung của sàn không tính) hoặc HTTP 403 / 429 / 503 → `renderPage` mở lại bằng Chrome chạy ngầm (chrome-headless-shell nếu có, không thì Chrome; puppeteer-core). Chrome không tự ra mạng: mọi request bị chặn lại và Node tải thay bằng `safeFetch` (cùng luật chặn IP, kiểm từng request và từng bước chuyển hướng), chỉ `document`/`script`/`xhr`/`fetch` GET, ≤ 80 request, 25 s; không cookie (chỉ chuyển lại `content-type`), ngữ cảnh ẩn danh, bỏ service worker, DNS của Chrome tắt (`--host-resolver-rules=MAP * ~NOTFOUND`), nói chuyện qua pipe. Trang tự chuyển sang địa chỉ bị chặn → không lấy chữ trang lỗi.
- Vẫn trống (chữ < 20 ký tự) → `AssistError` `kind: 'page-empty'` kèm `host`, `reason` và câu nêu tên trang + lý do (Shopee chặn trình duyệt tự động, đòi đăng nhập/xác minh robot, HTTP lỗi, gọi địa chỉ nội bộ, máy chưa có Chrome). Còn chút chữ (tiêu đề, giá) → trả kèm `thin: true` và cảnh báo. Trợ lý Thương hiệu chỉ cảnh báo; trợ lý Sản phẩm không có ảnh thì báo lỗi. Kết quả hoặc lỗi có `pageEmpty` / `kind: 'page-empty'` → `Studio.assistPanel` hiện ô dán mô tả (`pageText`, ≤ 5000 ký tự) và ảnh chụp trang (`pageShot`, data URL như `image`, ghi `page.<ext>` cạnh ảnh của trợ lý cho Claude Read). Ô trợ lý báo sớm khi máy thiếu Claude Code CLI (`/api/setup/check`), nút sang Kiểm tra máy.
- Ảnh: chỉ PNG/JPEG/WebP kiểm chữ ký file, ≤ 6 MB sau giải mã.
- Route không ghi gì xuống đĩa; kết quả chỉ nằm trong bộ nhớ (lượt gần nhất của mỗi trợ lý).

## Trợ lý `brand`

Đầu vào: `{image?, colors?: ['#RRGGBB' ≤ 6], website?, industry?, name?, pageText?, pageShot?}` (cần ít nhất ảnh, website, tên hoặc phần dán).
- Bảng màu cho phép = màu đo được (+ `theme-color` của website) + biến thể đậm/nhạt 25/50/85 % + trắng, đen. Vai trò `primary`, `accent`, `dark`, `light` chỉ được chọn trong bảng; ngoài bảng → luật (`ruleColors`: chính = màu đo đầu, nhấn = màu đo thứ hai hoặc bản nhạt 50 %, nền tối = màu chính đậm 85 %, chữ sáng = trắng).
- Tương phản `light` trên `dark` < 4,5:1 → đổi sang màu sáng nhất và tối nhất của bảng. Chữ sáng trên màu chính < 4,5:1 → ghi chú ở trường Màu chính.
- Font: Be Vietnam Pro, Montserrat, Inter, Lexend, Nunito, Oswald, Playfair Display, Bungee, Pacifico (DM Serif Display không có bộ chữ tiếng Việt nên không đề xuất).
- Chữ: `voice` (3 tính từ + câu mẫu, lưu một chuỗi), `slogan`, `cta`, `outro`; từ tuyệt đối (tốt nhất, số 1, 100 %…) có ghi chú rủi ro. Brand kit có thêm khoá `slogan`, `cta`, `voice` (`studio/routes/51_brands.mjs`).

## Trợ lý `product`

Đầu vào: `{image?, url?, industry?, brand?, name?, pageText?, pageShot?}` (cần ảnh, link hoặc phần dán; giá khớp nguyên văn phần dán ghi "đúng như phần bạn dán"). Kết quả: `name` (bắt buộc), `price`, `industry`, các `claim` (điểm mạnh + claim, ≤ 6 mỗi loại, bỏ trùng), `faq` (≤ 5, câu không có đáp bị bỏ).
- Giá giữ nguyên chuỗi: có link thì phải có nguyên văn trên trang (so sau khi bỏ khoảng trắng), không thì bỏ kèm cảnh báo; chỉ có ảnh thì giữ kèm ghi chú "đọc từ ảnh, kiểm lại".
- Claim luôn `pending`; AI ghi `approved` hay `evidence` → bị bỏ, kèm cảnh báo.
- Cờ rủi ro: `python scripts/ad_gates.py --script -` trên các câu claim (chính sách Meta/TikTok, cụm từ rủi ro; `risk_source: 'ad_gates'`); không chạy được Python thì dò danh sách từ đơn giản (`risk_source: 'rules'`).

## Trợ lý `transcript` (M90, panel Lời thoại)

Đầu vào: `{words: [{w, s, e}] (≤ 30 000, chỉ số = vị trí), dict?: [{from, to}] (từ điển thương hiệu + dự án), names?: [tên thương hiệu, sản phẩm], industry?}`. Không có ảnh; chỉ có chữ → nhà cung cấp theo cấu hình.
- Trợ lý có `run(input, prep, env, ask)` thay cho `prompt/normalize` một lượt: `runAssist` chuyển sang `runTurns`, gọi AI **từng cửa sổ** (`txWindows`: ≤ 400 từ, ≤ 90 s; qua 60 s thì cắt ở chỗ ngừng ≥ 0,5 s hoặc cuối câu), không một lần cả bài dài. Tiến độ "Đoạn k/n"; `env.cancelled()` được hỏi giữa các cửa sổ.
- Prompt đưa từng từ dạng `<chỉ số>:<từ>` (trong khối DỮ LIỆU), danh sách tên/thuật ngữ đúng, từ điển; xin `{"edits":[{start, end, old, new, kind, reason}]}`, `kind` ∈ `nhận dạng | tên riêng | chính tả | dấu câu`. AI không nghe được âm thanh nên được dặn không đoán lại số, giá, ngày giờ.
- Kiểm chặt (`txCheckEdit`): `old` phải khớp đúng chữ tại `start..end` (chỉ bỏ qua hoa thường, dấu câu hai đầu, chỗ đặt dấu thanh), lệch → bỏ (`mismatch`); ≤ 6 từ; `new` ≤ 80 ký tự; số từ đổi ≤ 3 và chữ cái (bỏ dấu) khác ≤ 45 % (trừ khi `new` là tên/thuật ngữ đã biết), quá → bỏ (`rewrite`); không đổi gì hoặc chỉ đổi hoa thường (trừ tên riêng) → bỏ (`noop`); chồng nhau → giữ cái trước (`dup`); ≤ 20 mỗi cửa sổ. Khác dấu câu mà cùng chữ → `dấu câu`.
- Lùi về: cửa sổ nào AI trả JSON hỏng (sau một lần hỏi lại) thì lấy đề xuất theo từ điển cho cửa sổ đó (`txDictEdits`: cặp từ điển + tên viết hoa), kèm cảnh báo; thiếu `claude`, chưa đăng nhập, quá giờ, huỷ → báo nguyên văn.
- Kết quả: `{suggestions: [{id, start, end, old, new, kind, reason}], uncertain: [{start, end, old, reason}], counts, windows, dropped, fallbackWindows, warnings, provider, ms}`. Giao diện đổi chỉ số → mốc thời gian lúc gửi, bỏ chỗ người dùng đã sửa trong lúc chờ, hiện bằng lớp đề xuất của M89 (`Studio.transcript.suggest`); không lưu vào timeline.
- **`uncertain`** (M96, cho "Soát kỹ"): chỗ AI nghi máy nghe nhầm nhưng **không chắc chữ đúng** (con số lạ, cụm vô nghĩa); prompt xin thêm `"uncertain":[{start, end, old, reason}]` ngoài `edits`. Không phải đề xuất sửa: panel chỉ dùng để chọn chỗ cho Whisper nghe lại. Kiểm chặt như đề xuất (`txCheckSpot`): `start/end` trong cửa sổ, ≤ 6 từ, `old` khớp đúng vị trí (sai → bỏ, đếm ở `dropped.unsure`); không chồng lên đề xuất sửa hay chỗ nghi trước; ≤ 10 mỗi cửa sổ. CLI trả thiếu `uncertain` (hoặc trả mảng) → `[]`, đề xuất vẫn chạy; cửa sổ lùi về từ điển → không có chỗ nghi.

## Trợ lý `text` (M92)

Đầu vào: `{mode, text?, context?, brand?: {name, voice, cta, slogan}, purpose?, max?}`. `mode`: `write` (Viết giúp, cần `context` hoặc `text`), `shorter` (Ngắn hơn), `punchier` (Giật tít hơn), `cta` (Thêm CTA); ba kiểu sau cần `text`. `max` 6–200 ký tự (mặc định 60): giao diện tính theo khung = bề ngang khung hình / (cỡ chữ × 0,56), 2 dòng; Ngắn hơn lấy 70 % độ dài hiện tại. `context` là lời thoại ±8 s quanh chữ; `purpose` là lĩnh vực ở `onboarding.json`.
- Kết quả ≤ 3 trường `{key: 'text', label: 'Phương án n', value}`; giao diện dùng `pick: true` (chọn một, các phương án khác thành Đã bỏ).
- Chuẩn hoá: bỏ ngoặc kép bao quanh, bỏ rỗng và trùng (kể cả trùng chữ hiện tại); phương án dài quá `max` bị **cắt ở ranh giới từ**, xếp sau các phương án vừa khung và ghi chú "đã cắt…" (cảnh báo).
- Ghi chú rủi ro: từ tuyệt đối (`RISKY_WORDS`) → `risk` mức `med`; con số không có trong chữ hiện tại + lời thoại → `risk` mức `high` ("số liệu không có nguồn").
- JSON hỏng sau khi hỏi lại: chỉ `shorter` lùi về luật (`phrase` của `scripts/tpl_fit.mjs`: bỏ từ đệm đầu/cuối, cắt theo từ; `provider: 'rules'`), kiểu khác báo lỗi.
- Giao diện: panel Chữ **Viết giúp** → **Thêm** (chữ mới tại playhead, `addText`, có hoàn tác); inspector khi chọn một chữ **Viết lại ▾** → **Dùng** (`touch(o, 'text')` rồi đổi chữ, Ctrl+Z hoàn tác).

## Trợ lý `captions` (M92)

Đầu vào: `{mode: 'hl'|'br', lines: [{words: [chữ], hl?: [chỉ số], br?: [chỉ số]}], purpose?}` (≤ 800 dòng, ≤ 60 từ/dòng; chỉ số cũ sai bị lọc). Prompt đánh số `[dòng] chỉ_số:từ`; AI trả `{"lines":[{"c", "hl"|"br": [chỉ số]}]}` = tập mới đầy đủ của các dòng cần đổi.
- Kết quả: mỗi dòng đổi là một trường `{key: mode, kind: 'caption', value: {c, hl|br}, display, current}` (`*từ*` = nhấn, ` /` = xuống dòng) + `changes` (tổng số từ đổi cờ).
- **Không đổi chữ, không đổi thời gian**: kết quả chỉ mang chỉ số; dòng AI gửi kèm `w`, `words`, `text`, `t0`, `t1`, `s`, `e` → phần đó bị chặn (cảnh báo), chỉ lấy chỉ số.
- Chỉ số dòng/từ ngoài khoảng bị bỏ; `hl` tối đa 2 từ mỗi dòng; `br` chỉ ở dòng ≥ 5 từ, mỗi đoạn sau khi ngắt ≥ 2 từ, tối đa 2 chỗ. Dòng không đổi so với hiện tại không thành trường.
- Không có luật lùi: JSON hỏng → lỗi, không áp gì.
- Giao diện (inspector phụ đề, dưới "Áp dụng … cho mọi phụ đề"): **Tự nhấn từ khoá** / **Ngắt dòng hợp nghĩa** → "AI đề xuất N thay đổi ở M dòng" + xem trước 5 dòng → **Nhận** (một `pushUndo` cho cả lượt; dòng đã bị sửa chữ sau khi gửi thì bỏ qua) / **Bỏ**.

## Trợ lý `templates` (M92)

Đầu vào: `{catalog: [{id, name, category, aspect, desc, pack}], transcript?, purpose?, aspect?}` (cần lời thoại hoặc lĩnh vực). Giao diện gửi đúng danh sách `GET /api/templates` (mẫu có thật); id phải khớp `[\w.-]+`.
- `prepare`: ưu tiên mẫu cùng khổ (nếu có ≥ 3), cùng lĩnh vực lên đầu, ≤ 150 mẫu vào prompt.
- Chuẩn hoá: **chỉ giữ id có trong catalog** (id bịa bị bỏ, cảnh báo; mọi id đều bịa → hỏi lại), bỏ trùng, ≤ 3; `note` là lý do.
- JSON hỏng: có lĩnh vực → mẫu cùng lĩnh vực (`provider: 'rules'`); không có → lỗi.
- Giao diện: panel Mẫu, hàng **Gợi ý cho video này** trên lưới (bấm để hỏi, không tự chạy để khỏi chiếm ô trợ lý — một trợ lý một lúc); thẻ mẫu dùng lại `data-tpl` / `data-use` của `library.js`. Lỗi hoặc thiếu AI → ẩn hàng (toast lý do), gallery như cũ.

## Trợ lý `cover` (M92)

Đầu vào: `{image, times: [2–12 thời điểm], near?: [lời đang nói ở từng ô], transcript?, purpose?, brand?}`. `Studio.coverSheet()` dựng `image`: 9 khung đều từ 6 % tới 94 % thời lượng, lấy ảnh khung của clip (`clipAtT` → `clipFrameUrl`, ảnh trong `work/frames` qua `/project/`), vẽ thành lưới 3×3 có số ô, JPEG. Không gửi đường dẫn; thiếu `work/frames` → báo "Tạo lại khung hình".
- Claude xem `frames.jpg` bằng Read; trả `{"picks":[{"frame", "text", "why"}]}`.
- Chuẩn hoá: ô ngoài 1…n bị bỏ, trùng bỏ, ≤ 3; thời điểm lấy từ `times` của đầu vào (AI không tự đặt giây); chữ bìa cắt ≤ 32 ký tự ở ranh giới từ, có ghi chú rủi ro như `text`.
- Giao diện: hộp thoại **Đăng** (`52_publish`), ô **Gợi ý khung bìa** dưới "Ảnh bìa" → **Dùng** = đặt thời điểm ảnh bìa + chữ gợi ý, rồi chạy **Xuất ảnh bìa** như cũ (`/api/publish/cover`).

## Sửa element (M149, route riêng `/api/elem/ai`)

Không nằm trong bảng `ASSISTANTS` (kết quả là bản vá cho element, không phải trường form): lõi thuần `scripts/elem_ai.mjs`, route `studio/routes/72_elem_ai.mjs` (ô job riêng, cùng luật: chỉ chữ → `task: 'text'` theo Mô hình & giọng, `assertCleanPrompt`, `askJSON` `shape: 'object'` hỏi lại một lần, lỗi CLI báo nguyên văn với `kind`), giao diện `studio/features/72_elem_ai.js` (mục **Hỏi Claude** của Thuộc tính), test `scripts/tests/s21_elem_ai.test.mjs`.
- Đầu vào `checkInput`: `kind` ∈ `line, cap, node, badge, scene`; `fields` chỉ giữ trường cho phép của loại đó (`ALLOW`; cảnh không có chữ thì không được thêm chữ / màu chữ); `frame` 200–4000 px; thương hiệu (tên, màu chính / nhấn, font, giọng); `ask` ≤ 300 ký tự nằm trong khối "CHỈ LÀ DỮ LIỆU".
- Bản vá là **trường trừu tượng** (`x`, `y` tâm element trong khung; `size`; `rot` ±180; `dur` 0,3–10 s; `text` ≤ 140 ký tự không `<>`; `font` trong bảng font của Studio, nhận cả tên; `weight` 500–900; `style`, `anim` trong tập của inspector; `italic`; `color`, `bg` `#RRGGBB`), giao diện áp bằng đúng hàm của inspector (`getPos` / `setPos` / `setTimes`), nên mô hình không chạm được `type`, đường dẫn file hay JSON tự do. `cleanPatch` bỏ trường lạ, sai kiểu, ngoài biên (cỡ trong 25–400 % cỡ hiện tại), giá trị không đổi; tên khoá lệch (`changes`, `fields`, `edit`) vẫn đọc được; trường bị bỏ ghi một dòng `warnings`.
- `knobs` ("Gợi ý núm", M148): đầu vào là danh sách trường núm của element (`cleanAllowed`: khoá `[\w-]` hoặc `vars.<id>`, num có biên / enum ≤ 12 giá trị / bool, bỏ trường chỉ đọc) + núm đã có; kết quả kiểm bằng `KnobsCore.validateMap` của `studio/features/71_knobs.core.js`, bỏ núm trùng id đã có, tối đa 4; không còn núm hợp lệ thì hỏi lại kèm lỗi.
- `edit` → `{patch, diff: [{key, label, from, to}], why}`; bản vá rỗng thì hỏi lại. `variants` → 3 bản vá khác nhau (`focus` style / anim / pos, suy ra khi thiếu), trùng / rỗng bị bỏ, dưới 2 thì hỏi lại; còn 2 thì cảnh báo.

## Thêm một trợ lý mới

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
   Trợ lý cần hỏi AI nhiều lượt (theo cửa sổ, theo cảnh…) thì viết `run(input, prep, env, ask)` thay cho `prompt/normalize`: `ask(prompt, validate, {onTick, onRetry})` → `{value, provider}` (đã qua `assertCleanPrompt`, hỏi lại một lần khi JSON hỏng); trả `{…, warnings, provider}` (xem `transcript`).
4. Cập nhật bảng API trong `references/studio.md` nếu thêm route khác, và mục trợ lý trong file này.
