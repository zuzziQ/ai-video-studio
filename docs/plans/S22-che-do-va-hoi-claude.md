# S22 — Cơ bản / Chuyên nghiệp tách rõ, Hỏi Claude theo bước, xem trước kết quả, bớt chữ giải thích

Lập 2026-11-18. Mục ROADMAP: `M151`–`M156`, quyết định `C13` (chốt lại), `C24`–`C27`. Nguồn: chủ repo yêu cầu sau `S20`/`S21` — "giao diện
vẫn lủng củng, cần rõ hơn, ít chữ giải thích hơn; Hỏi Claude có xem trước thì phải có thao tác để xem rõ hơn; tách rõ Cơ bản (làm việc
chủ yếu với Claude, tự lái, ít thứ) và Chuyên nghiệp (sâu từng element); Hỏi Claude áp ở bước nào chưa rõ".

## 1. Còn sót của S20 / S21

`main` ở `fcda83c`, `M139`–`M150` đều `[x]`, không còn PR mở. Còn lại:

- `M149` mới thử bằng CLI mô hình giả, chưa thử với Claude / Ollama thật → làm trong `M153` (cần máy có `claude` đăng nhập).
- `M141` (phím, clipboard, khoá) và `M149` chưa thử lại bằng chuột sau khi gộp tay → làm trong `M156`.
- Đã để sau, không làm trong S22: ⌘G nhóm, đo khoảng cách, cắt tự do ảnh phủ, cột phải co giãn.

## 2. Kiểm kê (Studio thật, AVS_HOME / USERPROFILE tạm, bản sao `sample/clip-mau`, 1440×900)

| # | Chỗ | Thấy gì |
|---|---|---|
| K1 | Chế độ | Cơ bản gần như **giống hệt** Chuyên nghiệp: thanh trái của cả 5 bước như nhau (bước Dựng: 8 mục + Thêm… ở cả hai), Thuộc tính của một phụ đề cao 1257 px ở cả hai. Cơ bản chỉ ẩn Hiệu năng / Agent / Tạo style ở Cài đặt và mục Keyframe / Mặt nạ / JSON. Đổi chế độ nằm sâu trong Cài đặt → Giao diện hoặc ⌘K. `C13` chưa chốt, mặc định Chuyên nghiệp. |
| K2 | Lần mở đầu | Ba hộp thoại nối nhau: Kiểm tra máy → Hướng dẫn 3 bước → Dự án thiếu khung hình. Hướng dẫn có một dòng giải thích dưới **mỗi** ô. |
| K3 | Chữ giải thích | 140 chỗ `class="help"` trong mã. Panel trái nào cũng mở đầu bằng một đoạn 3–6 dòng: Thương hiệu 424 ký tự, Kiểm tra 416, AI dựng 321, Video nguồn 278. Thuộc tính của một phụ đề có 4 khối gợi ý (417 ký tự), riêng Hỏi Claude 1 khối ~200 ký tự. |
| K4 | Cột phải | Không chọn gì thì ở mọi bước (Chuẩn bị, Kiểm tra, Xuất) cột phải vẫn là "Chưa chọn element" của tab Thuộc tính (tab nhớ theo máy) — phí 340 px; nội dung có ích của bước (điểm, việc thiếu) nằm ở tab Dự án phải tự bấm. |
| K5 | Lối vào Claude | Ít nhất 11 chỗ, mỗi chỗ một tên: AI dựng, Hỏi Claude (Thuộc tính), Viết lại ▾ / Tự nhấn từ khoá / Ngắt dòng, Gợi ý mẫu, Gợi ý b-roll, Làm sạch lời nói, Kiểm tra & gợi ý sửa, Nhiều phiên bản (A/B), ảnh bìa, Gợi ý bằng AI (thương hiệu), Giao Claude sửa hết (ghim), Tự lái. Chữ dùng lẫn "AI", "Claude", "Gợi ý", "Tự". Người dùng không biết ở bước nào hỏi được gì. |
| K6 | Xem trước kết quả Claude | Hỏi Claude áp tạm lên khung nhưng **không dời playhead**: chọn phụ đề ở 0:04 khi playhead ở 0:00 thì khung không hiện element đó, bản xem trước vô hình. Không có trước/sau, không phát đoạn, không phóng to. 3 biến thể là ảnh nhỏ (~90 px), bấm ảnh là **áp luôn**, không xem trên khung trước. |
| K7 | Lặt vặt | Bước Kiểm tra: ô "Nhờ Claude xem khung hình" vỡ hàng (ô tick xa chữ, chữ gãy 3 dòng). |

## 3. Học từ đâu

- **CapCut / Canva**: chế độ đơn giản = ít công cụ hiện sẵn, một nút AI lớn; công cụ sâu vẫn tìm được bằng ô tìm. Canva gom AI vào một lối (Magic / Canva AI) có ô hỏi và gợi ý theo ngữ cảnh.
- **Descript (Underlord)**: một khung trò chuyện với "đồng biên tập AI" làm việc trên cả dự án; kết quả là thay đổi xem lại được.
- **Claude Design** (đã dùng ở S21): khung chat cạnh canvas, mọi thay đổi xem ngay trên canvas, biến thể so cạnh nhau, chỉnh tiếp bằng núm.
- **Adobe**: chữ giải thích nằm ở tooltip / (i) và trang Learn, panel chỉ có nhãn ngắn.

## 4. Cơ bản và Chuyên nghiệp

Nguyên tắc: **Cơ bản = Claude lái, người dùng duyệt.** Mỗi bước một nút chính ("Để Claude làm"), thanh Hỏi Claude, và vài công cụ hay
dùng. **Chuyên nghiệp = đủ công cụ từng element** như hiện nay. Không bỏ tính năng: thứ ẩn ở Cơ bản vẫn mở được bằng ⌘K hoặc nút
"Mở ở Chuyên nghiệp" (`C24`). Đổi chế độ bằng công tắc **Cơ bản | Chuyên nghiệp** trên thanh đầu, cạnh ⋯.

| Bước | Cơ bản: thanh trái | Chuyên nghiệp thêm | Nút chính ở Cơ bản |
|---|---|---|---|
| Chuẩn bị | Thương hiệu | Sản phẩm, Kho | Claude dựng thương hiệu từ logo / website |
| Nguồn | Video nguồn (gồm kịch bản) | Lời thoại (sửa từng từ), Làm sạch lời nói chi tiết, Cắt clip từ video dài | Claude làm sạch lời nói |
| Dựng | AI dựng, Mẫu, Chữ, Âm thanh | Media, Thành phần, B-roll, Hiệu ứng, Sticker, Hình, Chuyển cảnh, Bộ lọc, Lồng tiếng | AI dựng |
| Kiểm tra | Kiểm tra (QC + Sửa hết) | Nhiều phiên bản (A/B), Kiểm tra quảng cáo | Claude kiểm và sửa |
| Xuất và đăng | Xuất, Đăng | Lịch đăng, Hàng loạt | Xuất + gói đăng do Claude viết |
| Cài đặt | Giao diện, Mô hình | Hiệu năng, Agent, Tạo style | — |

| Vùng | Cơ bản | Chuyên nghiệp |
|---|---|---|
| Cột phải | Hai tab: Thuộc tính · Dự án (không có Lớp) | Thuộc tính · Lớp · Dự án |
| Thuộc tính | Đầu + mục chính (nội dung, màu / font thương hiệu) + Núm; mục khác thu gọn sau "Thêm thuộc tính" | Đủ mục như S21 |
| Thanh nổi trên khung | Sửa chữ, màu, Hỏi Claude, xoá | Đủ như M140 |
| Timeline | Như nay; ẩn làn keyframe | Như nay |
| Lần mở đầu | Một màn chào: thương hiệu (tuỳ) → thả video → Claude dựng | Như nay, gộp hộp thoại (`M156`) |

## 5. Hỏi Claude theo từng bước

Một lối vào duy nhất (`C25`): **thanh Hỏi Claude** ngay dưới khung xem trước, có ở mọi bước và cả hai chế độ. Thanh hiện **phạm vi**
đang hỏi ("Bước Kiểm tra", "Phụ đề «bằng AI…»", "Clip 3", "0:04–0:09") và 3–4 gợi ý nhanh theo phạm vi. Các nút AI rải rác hiện nay
thành gợi ý nhanh của thanh này (vẫn giữ nút chính của panel: AI dựng, Kiểm tra & gợi ý sửa). Phím `/` mở thanh; nút ✦ trên thanh nổi
và ở đầu Thuộc tính mở thanh với phạm vi là element đang chọn. Chỉ gọi mô hình khi người dùng gửi (`C23`).

| Bước / phạm vi | Hỏi được gì | Làm bằng gì (đã có) |
|---|---|---|
| Chuẩn bị | Dựng bộ thương hiệu từ logo / website; viết mô tả sản phẩm, lợi ích, CTA; chọn phong cách dựng cho kênh | Gợi ý bằng AI (onboarding), `51_brands`, `53_products` |
| Nguồn | Cắt lỗi nói / lặp / ngập ngừng; sửa chữ sai trong lời thoại; khớp kịch bản; tìm đoạn hay trong video dài; viết hook mở đầu | `20_ai` Làm sạch, `21_transcript`, `19_script`, `17_longform` |
| Dựng, không chọn gì | Đổi phong cách / nhịp cả video; thêm b-roll, nhạc, SFX; thêm chuyển cảnh; dựng lại một đoạn ("0:10–0:20 sôi động hơn") | AI dựng `20_ai`, `80_autofill`, `62_broll`, `06_ai_suggest` |
| Dựng, chọn element (chữ, phụ đề, cảnh, khối, sticker) | Sửa kiểu / vị trí / hoạt ảnh / thời lượng; viết lại chữ; 3 biến thể; gợi ý núm | `72_elem_ai` (M149), `06_ai_suggest` Viết lại |
| Dựng, chọn clip | Tốc độ, màu / bộ lọc, chuyển cảnh, bám mặt / đổi khung, b-roll phủ | inspector clip, `40_reframe`, `82_broll_alts` |
| Kiểm tra | Giải thích từng lỗi QC; sửa hết (mỗi sửa một mục xem trước); viết 3 hook khác cho A/B | `16_qc`, Giao Claude sửa hết (`M150`) |
| Xuất và đăng | Tiêu đề, mô tả, hashtag theo nền tảng; ảnh bìa; khổ nên xuất; giờ đăng | `52_publish`, `18_schedule`, `55_exports` |
| Cài đặt | — (không có thanh) | — |

Câu hỏi tự do: server cho mô hình chọn **một việc trong danh sách việc của phạm vi** (bảng trên) kèm tham số; Studio chạy việc đó qua
hàm sẵn có và đưa kết quả vào khung xem lại (mục 6). Câu không khớp việc nào → trả lời bằng chữ, không sửa gì.

## 6. Xem trước kết quả Claude rõ hơn

Một khung xem lại dùng chung (`Studio.review`) cho mọi kết quả Claude sửa video (Hỏi Claude, Viết lại, Sửa hết QC, AI dựng một đoạn):

1. **Tự đưa tới chỗ đổi**: dời playhead vào khoảng của element / đoạn đổi và **phát lặp** đoạn đó (±0,3 s); nút dừng / phát lại.
2. **Trước / Sau**: nút giữ để xem bản cũ (phím `\`), hoặc chế độ **chia đôi** khung kéo được (trái cũ, phải mới).
3. **Phóng to**: nút ⤢ mở khung xem lớn (ẩn hai cột, chỉ còn khung + thanh Nhận / Bỏ), phóng tới element đang đổi.
4. **Biến thể** (`C27`): bấm một biến thể là **xem trên khung, chưa áp**; phím 1 / 2 / 3 đổi qua lại, Nhận để áp; ảnh biến thể to hơn,
   rê để phát đoạn ngắn.
5. **Nhiều thay đổi** (Sửa hết, AI dựng một đoạn): danh sách có mốc thời gian, bấm một dòng nhảy tới và phát; Nhận từng cái / tất cả,
   mỗi lần Nhận một bước ⌘Z.

## 7. Bớt chữ giải thích (`C26`)

- Dưới một ô chỉ giữ tối đa **một dòng** (≤ 70 ký tự). Phần dài hơn chuyển vào biểu tượng (i) cạnh nhãn, hiện khi rê / focus
  (`Studio.tip(text)`, `aria-describedby`).
- Bỏ đoạn mở đầu của panel; thay bằng tiêu đề + một dòng, chi tiết vào (i) của tiêu đề.
- Hướng dẫn đầu: bỏ dòng giải thích dưới từng ô, giữ placeholder.
- Test `s22_help`: không còn `.help` nào dài quá 120 ký tự trong mã giao diện (trừ danh sách ngoại lệ có lý do: cảnh báo lỗi, quyền riêng tư).

## 8. Ma trận

| | Mục |
|---|---|
| **Giữ** | 5 bước, nhóm tab cột phải (S21), Núm (M148), ghim (M150), thanh nổi (M140), C23 chỉ gọi khi bấm |
| **Nâng cấp** | Chế độ Cơ bản (từ "ẩn 3 mục" thành "Claude lái"), Hỏi Claude (từ mục trong Thuộc tính thành thanh có phạm vi theo bước), xem trước biến thể (xem trước khi áp), chữ giải thích (sang tooltip), lần mở đầu (một màn) |
| **Thêm** | Công tắc chế độ trên thanh đầu, `Studio.review` (trước / sau, phát lặp, phóng to), bộ định tuyến việc theo phạm vi |
| **Loại** | Đoạn giải thích đầu panel; nút AI trùng tên rải rác (thành gợi ý nhanh của thanh); cột phải trống "Chưa chọn element" khi không chọn |

## 9. Chia PR

| Mục | Nội dung | File chính | Sau |
|---|---|---|---|
| `M151` | Chế độ thật: lõi `01_level.core.js` (bảng mục theo bước × mức, tab cột phải, mục Thuộc tính theo mức), công tắc trên thanh đầu, Cơ bản ẩn tab Lớp và thu gọn mục phụ, "Mở ở Chuyên nghiệp" khi mở mục ẩn bằng ⌘K; `C13` / `C24` | `01_workflow.js`, `68_right.core.js`, `68_sections.core.js`, `studio.js` (`renderInspector` phần chọn mục) | — |
| `M152` | `Studio.review` + lõi `74_review.core.js`: tới chỗ đổi + phát lặp, trước / sau, chia đôi, phóng to, biến thể xem trước rồi mới áp; nối vào Hỏi Claude (`72_elem_ai.js`) và Viết lại (`06_ai_suggest.js`); thử `M149` với mô hình thật | file mới `74_review*`, `72_elem_ai.js`, `06_ai_suggest.js` | — (song song `M151`) |
| `M153` | Thanh Hỏi Claude có phạm vi: dock dưới khung, phạm vi theo bước + lựa chọn, gợi ý nhanh theo bảng mục 5, `/` mở, ✦ trên thanh nổi / Thuộc tính; route định tuyến việc `studio/routes/75_ask.mjs` + `scripts/ask_route.mjs` (mô hình chọn việc trong danh sách, kiểm tham số); mục Hỏi Claude trong Thuộc tính thành nút mở thanh | file mới `75_ask*`, `72_elem_ai.js`, `66_canvas_cmds.js` | `M152` |
| `M154` | Gắn việc của Chuẩn bị / Nguồn / Kiểm tra / Xuất vào thanh (gọi hàm sẵn có, kết quả qua `Studio.review` hoặc ô đề xuất `assistPanel`); bỏ nút AI trùng ở panel, giữ nút chính | `75_ask.js`, `16_qc.js`, `20_ai.js`, `52_publish.js`, `51_brands.js` | `M153` |
| `M155` | Bớt chữ giải thích: `Studio.tip`, đổi các `.help` dài sang (i), bỏ đoạn mở đầu panel, test `s22_help` | `studio.js`, `studio.css`, các `features/*.js` có `.help` dài | `M151` (cùng `studio.js`); làm theo nhóm file để không đụng PR khác đang mở |
| `M156` | Gọn chỗ: một màn lần mở đầu (Kiểm tra máy thành dải báo khi thiếu, thiếu khung hình tự tạo lại kèm dải báo), cột phải không chọn gì thì về Dự án ở mọi bước, sửa ô "Nhờ Claude xem khung hình"; thử lại `M141` bằng chuột | `02_onboarding.js`, `01_setup.js`, `63_frames.js`, `68_right.core.js`, `16_qc.js` | `M151` |

Thứ tự: `M151` ∥ `M152` → `M153` → `M154`; `M155`, `M156` sau `M151`. Không đụng `studio/server.mjs` (route mới theo hợp đồng
`studio/routes/NN_x.mjs`).

## 10. Quyết định (chốt 2026-11-18: theo đề xuất)

- **`C13`** (chốt lại): chế độ mặc định. Đề xuất: người mới (chưa có `onboarding.json`) vào **Cơ bản**; người đang dùng giữ Chuyên nghiệp; công tắc trên thanh đầu.
- **`C24`**: ở Cơ bản, công cụ của Chuyên nghiệp **ẩn khỏi thanh trái** nhưng vẫn mở được bằng ⌘K / "Mở ở Chuyên nghiệp" (không mất tính năng), hay hiện mờ trong "Thêm…"? Đề xuất: ẩn, mở bằng ⌘K.
- **`C25`**: Hỏi Claude **một lối vào** là thanh dưới khung xem trước; mục Hỏi Claude trong Thuộc tính thành nút mở thanh. Đề xuất: có.
- **`C26`**: quy tắc chữ giải thích: tối đa một dòng hiện, còn lại vào (i). Đề xuất: có, kèm test chặn đoạn dài.
- **`C27`**: bấm biến thể là xem trước, chưa áp (đổi hành vi M149). Đề xuất: có.
