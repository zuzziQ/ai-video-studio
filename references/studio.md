# AI Video Studio — phần mềm edit (studio/)

Một editor chạy local trong trình duyệt. Preview dùng **chính engine render**, nên khung hình nhìn thấy giống hệt khung hình xuất ra. Studio đọc và ghi trực tiếp `timeline.json` + `captions.json` của dự án: Claude dựng bản đầu tiên, người dùng tinh chỉnh bằng chuột, rồi ghi chú lại để Claude sửa tiếp.

## Chạy
```bash
bash <skill>/studio.sh <thư mục dự án>          # mở dự án có sẵn → http://localhost:5186
bash <skill>/studio.sh --new raw.mp4 [thư mục]   # video thô → dự án khởi đầu → mở luôn
```
Cần Node ≥ 18, ffmpeg, Chrome (để xuất video), và `scripts/.venv` (whisper, nếu dùng "Video mới"). Khi Claude mở Studio cho người dùng thì chạy nền (`run_in_background`), rồi đưa link `http://localhost:5186`.

## Màn hình (v2 — giao diện tối kiểu editor chuyên nghiệp)
Code: `studio/index.html`, `studio.css` (khung editor, mọi màu/cỡ chữ/bo góc/chuyển động lấy từ `studio/theme/tokens.css`, xem `DESIGN.md`), `clips.js` (track chính + ripple), `library.js` (thanh icon trái + thư viện), `studio.js` (preview, inspector, timeline, phát, lưu/xuất). Icon: tabler-icons webfont (jsdelivr).
- **Giá trị động trong markup** (M85): không viết `style="..."`; vị trí/cỡ (timeline, khung chọn trên preview), ảnh nền, bộ lọc, màu swatch, CSS xem trước mẫu chữ đặt bằng thuộc tính `data-dl/dt/dw/dh` (px), `data-dbg` (url ảnh), `data-dfx` (filter), `data-dbc` (biến `--bc`), `data-dfill` (nền), `data-dcss` (cssText); `applyDyn()` trong `studio.js` gán vào `el.style` ngay khi phần tử được chèn (MutationObserver, nên tính năng dùng được luôn).
- **Thẻ tác giả** (`00_author.js`, ghi công bắt buộc): mỗi lần mở Studio hiện một thẻ nhỏ góc dưới phải, trên timeline (tên tác giả + link khoá học), trượt vào, tự tắt sau 3 giây (rê chuột hoặc focus vào thẻ thì dừng đếm), không chặn thao tác, không lấy focus, có nút đóng; chip "Tác giả" cạnh logo mở lại (mở lại thì không tự tắt).
- **Lần đầu mở** (`02_onboarding`, M83): sau thẻ tác giả (`00_author.js` luôn hiện trước; hướng dẫn chờ `#author` đóng), khi `$AVS_HOME/onboarding.json` chưa `done`/`skipped`, hiện hướng dẫn 3 bước (thanh tiến độ, Bỏ qua, Quay lại, Tiếp; mở lại ở đúng bước đã lưu):
  1. **Thương hiệu**: tên + logo bắt buộc (kéo thả), 2 màu chủ đạo tự lấy từ logo bằng canvas (đổi được), SĐT/website/tên kênh tuỳ chọn, nút **Gợi ý bằng AI** (trợ lý `brand`, `references/assist.md`: vai trò 4 màu trong bảng màu đo được, cặp font tiếng Việt, giọng văn, slogan, CTA, chữ màn kết; Nhận từng trường) → `POST /api/brands/save` + `/api/brands/logo` (`51_brands`), id kit ghi vào `onboarding.json` (`brand`); đang mở dự án thì áp luôn kit cho dự án (hoàn tác được).
  2. **Tài nguyên** (tuỳ chọn): ảnh/video sản phẩm và nhạc riêng → `/api/upload` (Media › Của tôi, cần dự án đang mở); một sản phẩm (tên, giá, điểm mạnh; **Điền bằng AI** từ ảnh và/hoặc link: trợ lý `product`) → `POST /api/products/save` (`53_products`): giá vào `price` (và `notes` như cũ), mỗi điểm mạnh là một claim `pending`, FAQ AI đã Nhận lưu cùng.
  3. **Mục đích**: lĩnh vực (BĐS, Khoá học, Bán hàng, Review, Chia sẻ, Tin tức, Doanh nghiệp, Khác) → gợi ý số mẫu và gói style hay dùng theo `category` của `GET /api/templates`; khổ 9:16/16:9/1:1; nền tảng đăng. Kết nối YouTube/Telegram và chọn Claude/Ollama để sau (nút Mô hình & giọng, Lịch đăng). Xong mà có dự án thì mở mục Mẫu lọc sẵn theo lĩnh vực.
- **Trang chủ** (`#onb-home`): tự hiện khi chưa mở dự án (thay hộp “Chưa mở dự án”), mở lại bằng nút nhà cạnh logo (Esc / Đóng khi có dự án). 4 thẻ: **Thả video → video hoàn chỉnh** (panel Tự lái), **Dựng theo mẫu** (mục Mẫu lọc theo lĩnh vực; chưa có dự án thì mở Video mới, tải lại xong tự mở Mẫu), **Video dài → clip ngắn** (panel Video dài), **Làm hàng loạt** (panel Hàng loạt); **Dự án gần đây** (8 dự án đã mở, mở bằng `POST /api/onboarding/open`); **Xem lại hướng dẫn**. Hàm: `Studio.openOnboarding()`, `Studio.openHome()`.
- **Thanh trên** (M82, `features/01_workflow.js`): logo + tên dự án + trạng thái Đã lưu / Chưa lưu, hoàn tác ↶ / làm lại ↷, **thanh 5 bước** ở giữa (1 Chuẩn bị · 2 Nguồn · 3 Dựng · 4 Kiểm tra · 5 Xuất và đăng), menu **⋯**, **Lưu** (⌘S), **Xuất** (nút chính duy nhất). Màn dưới 1180 px chỉ bước đang mở hiện chữ.
  - Bấm một bước: thanh icon trái chỉ hiện công cụ của bước đó (tối đa 7, phần còn lại trong **Thêm…**) và tự mở công cụ đầu. Bước đang mở lưu theo máy (`localStorage` `avs.step`). Mở một panel từ chỗ khác (liên kết, nút) thì thanh bước tự chuyển theo.
  - Bước: ① Thương hiệu, Sản phẩm, Media · ② Video mới, Video dài, Lời thoại, AI (cắt lỗi nói) · ③ Dựng nhanh AI, Mẫu, Chữ, Âm thanh, B-roll, Hiệu ứng, Sticker, Thêm… (Chuyển cảnh, Bộ lọc, Lồng tiếng) · ④ Kiểm tra (thẻ Kiểm tra chất lượng + Nhiều phiên bản của `16_qc`), Thành phần · ⑤ Xuất, Đăng, Lịch đăng, Hàng loạt.
  - **Mục gộp** (M84, bảng `GROUPS` của `01_workflow.js`): việc trùng thành một mục trên thanh trái + dải tab `#wf-tabs` trên panel: **Dựng nhanh AI** (tab Tự lái `autopilot` · AI dựng giúp `wf-aihelp` · Tự động `autofill`), **Âm thanh** (Nhạc & SFX `audio` · Giọng & trộn `audioplus`), **B-roll** (Kho & AI `aibroll` · B-roll động `wf-broll`: 9.080 `media_card` của `GET /api/broll`, chuyển từ tab cũ của Media). Mục mở lại tab dùng gần nhất (`avs.grp.<nhóm>`). Panel thành viên vẫn mở được bằng id (`#rail [data-p=x]` còn trong DOM, chỉ ẩn). Agent nằm ở Cài đặt; Thương hiệu chỉ ở bước ① (đổi nhanh trong ⋯).
  - **Tìm công cụ ⌘K / Ctrl K** (`04_cmdk`, M84; cũng có trong ⋯): ô `role="combobox"` tìm mọi panel (kể cả panel đang ẩn theo bước, tên nhóm › tab), 5 bước + Cài đặt và lệnh (Lưu, Xuất video, Hoàn tác, Làm lại, Mở Cài đặt, đổi chế độ, Video mới, Đổi nhanh thương hiệu, Gói đăng, Mô hình & giọng, Vừa khung, Trang chủ, Xem lại hướng dẫn). Gõ không dấu vẫn khớp (`xuat`, `broll`, `thuong hieu`); ↑↓ chọn, Enter mở, Esc đóng. Mở được cả khi đang gõ trong ô khác. `Studio.openCommand()`.
  - **⋯**: Chế độ Cơ bản / Chuyên nghiệp, **Tìm công cụ…**, **Lịch sử** (60 bản lưu trong `<dự án>/.studio/history/`), **Vừa khung** (fit preview + timeline), **Mô hình & giọng**, đổi nhanh **Thương hiệu**, **Mở thư mục dự án** (app Mac), **Cài đặt…**.
  - **Cài đặt** (trang riêng, mở từ ⋯): Giao diện (chọn chế độ), Mô hình & giọng, Hiệu năng, Agent, Tạo style.
  - **Chế độ Cơ bản / Chuyên nghiệp** (`avs.uiLevel`, mặc định hằng `DEFAULT_LEVEL` = Chuyên nghiệp cho tới khi chốt `C13`): Cơ bản ẩn tab Keyframe, Mặt nạ, Nâng cao (JSON) và panel Agent, Tạo style, Hiệu năng, Thành phần (panel đang mở vẫn hiện).
  - Nút cũ **Video mới**, **Tự lái**, **AI dựng giúp**, **Đăng** và nhãn khổ hình rời header (phần tử vẫn còn trong DOM, giấu ở `#wf-park`): thẻ của bước ②/③/⑤ bấm hộ chúng; khổ hình vẫn ở thanh dưới preview.
- **Thanh icon trái** mở thư viện:
  - **Mẫu**: gallery từ `GET /api/templates` (lọc theo BĐS, Khoá học, Review, Chia sẻ, Tin tức, Bán hàng, AI, Khác + ô tìm). Rê chuột = phát preview mp4. **Dùng mẫu** gọi `win.applyTemplate(TL, tpl, CAP, title)` của engine (`packs/core.js`): gói, kiểu phụ đề, brand (gộp, giá trị của người dùng thắng), theme, nhạc, fx, cảnh của recipe (`_recipe`) + cảnh của mẫu (`_tpl`, dời theo `base_dur`). Dùng lại mẫu khác sẽ thay chứ không chồng. **Lưu thành mẫu** → `POST /api/templates/save` → `templates/user/<id>.json` + ảnh bìa `templates/previews/<id>.jpg`.
  - **Media**: “Của tôi” (tải lên bằng nút hoặc kéo thả, `/api/upload`) — bấm **Track chính** để chèn ảnh/video làm clip vào chỗ nối gần playhead nhất (phần sau tự dồn), hoặc **Lớp phủ** để chèn cảnh `photo` như cũ; file nhạc → nhạc nền. “B-roll động”: gõ chủ đề + Enter, bấm để chèn `media_card`.
  - **Âm thanh**: nhạc nền theo mood (▶ nghe thử, + thêm từ playhead) và 191 SFX (▶ nghe thử, bấm để thêm tại playhead), nút Tự đặt SFX.
  - **Chữ**: + Thêm chữ, 14 mẫu chữ (style/font/hoạt ảnh), danh sách **kiểu phụ đề** (mọi `CAPTION_STYLES` + Karaoke cơ bản + Tắt).
  - **Sticker**: lưới emoji 3D Fluent → cảnh `emoji_pop` tại playhead.
  - **Hiệu ứng**: mọi item của mọi gói trong `window.PACKS`, nhóm theo gói, có ảnh thu nhỏ `studio/thumbs/<packid>__<index>.jpg` (thiếu thì hiện icon gói).
  - **Chuyển cảnh**: 15 kiểu (rê chuột để xem demo). Bấm = áp cho clip đang chọn; hoặc kéo thả vào chỗ nối giữa hai clip trên timeline. Có thời lượng và “Áp dụng cho mọi clip”.
  - **Bộ lọc**: 8 LUT (`clip.filter.preset`) xem trước trên khung của clip; áp cho clip đang chọn (hoặc clip tại playhead), hoặc mọi clip.
  - **Thành phần**: danh sách cũ với tab **Tại đây / Tất cả / Đã chỉnh**, ô tìm, ô tick ẩn/hiện.
- **Giữa**: preview đúng engine. Bấm chữ/graphic để chọn, kéo để dời (hít đường giữa, Alt bỏ hít), kéo góc đổi cỡ, bấm đúp để sửa chữ. Thanh dưới preview: nhãn khổ hình, **Vùng an toàn**, **Vùng mặt**, lùi/tiến 1 khung, phát/dừng, timecode `hiện tại / tổng`, **Phóng to** (ẩn 2 panel bên, Esc để thu lại).
- **Phải — inspector theo tab**:
  - Clip: **Cơ bản** (lấp đầy / vừa khung / nền mờ, phóng to + tâm, lật ngang, điểm vào/ra nguồn có ripple, tách / nhân bản / xoá) · **Tốc độ** (0.5/1/1.5/2× + thanh 0.25–4×) · **Âm thanh** (âm lượng 0–200 %, tắt tiếng) · **Màu** (LUT + độ sáng, tương phản, bão hoà, nhiệt độ, sắc độ, làm mờ) · **Chuyển cảnh**.
  - Chữ: **Cơ bản** (nội dung, font, độ đậm, kiểu chữ, nghiêng, màu) · **Hoạt ảnh** (9 kiểu `anim` có xem trước động + thời lượng hiển thị) · **Vị trí** (X/Y/cỡ, cảnh báo vùng an toàn, thời gian).
  - Phụ đề: **Cơ bản** (`*từ khoá*`, `/` xuống dòng, bấm từ để nổi bật, Shift+bấm xuống dòng, “Áp dụng cho mọi phụ đề”) · **Vị trí**.
  - Graphic/cảnh: **Cơ bản** · **Vị trí** · **Nâng cao** (sửa JSON). Mọi thành phần (trừ clip): Ẩn / Nhân bản / Xoá / **Về thiết kế** + **Ghi chú cho Claude**.
  - Không chọn gì (M84, `03_nextstep`): thẻ **Bước tiếp theo** (một câu + một nút theo trạng thái: chưa thương hiệu → ①, chưa video nguồn → ②, chưa mẫu hoặc phụ đề → ③, chưa kiểm tra → ④, chưa xuất → ⑤, xuất rồi → Gói đăng) và thanh **Sẵn sàng x/6** (Thương hiệu `TL.brand` có kit/tên/logo · Video nguồn `TL.clips` · Mẫu `TL.pack` hoặc cảnh của mẫu · Phụ đề có `captions` và kiểu khác Tắt · Kiểm tra `GET /api/qc` đã chạy · Xuất `GET /api/publish/videos` có file), bấm mục nào nhảy tới chỗ đó. Phần cũ nằm trong mục thu gọn **Cài đặt dự án và thương hiệu** (trạng thái mở lưu `avs.nsMore`): **Dự án** (gói style + **Dựng tự động theo gói**, kiểu phụ đề, vị trí mặt, Tự đặt SFX, ghi chú chung) · **Thương hiệu** (màu, chữ riêng của dự án; có link tới bộ thương hiệu dùng chung ở bước ①).
- **Timeline**: thanh công cụ (tách ⌘B, xoá, nhân bản, nam châm bật/tắt), thanh thu phóng + Vừa timeline (⌘/Ctrl + cuộn cũng zoom). Track: Phụ đề, Chữ thêm, Chữ graphic, Graphic, B-roll, Cảnh (track trống tự ẩn), **Video chính**, Âm thanh, Giọng (waveform theo từng clip). Mỗi track có nút **ẩn** (chỉ ẩn trên preview) và **khoá**.
  - Track chính: mỗi clip là một khối có dải ảnh thu nhỏ, nhãn tốc độ/tắt tiếng/bộ lọc, nút chuyển cảnh ở chỗ nối. Kéo khối để **đổi thứ tự** (phụ đề, SFX, graphic nằm trọn trong clip đi theo). Kéo mép để **cắt có ripple**. Delete = xoá clip có ripple.
  - Khối khác: kéo để dời, kéo mép để cắt, hít vào playhead / mép khối / chỗ nối clip. Bấm thước hoặc khoảng trống để tua, bấm đúp để nhảy tới khối. Kéo mép trên của timeline để đổi chiều cao.
- **Phím tắt**: Space phát/dừng · ← → 1 khung (Shift: 1 giây) · Alt+mũi tên dịch 1 px (Shift: 10 px) · Delete xoá · ⌘D nhân bản · ⌘B tách clip · ⌘Z / ⇧⌘Z · + / − zoom timeline · ⇧Z vừa khung · Esc bỏ chọn / thu preview.

## Lời thoại (M89, `features/21_transcript.js`)
Panel trái **Lời thoại** (bước ②) sửa phụ đề bằng chữ, không cần LLM. `CAP` (khối phụ đề, mỗi khối `words[{w, s, e, hl, br, ed}]`) là nguồn chung của panel, track Phụ đề và preview: mỗi thao tác là một bước ⌘Z (`S.pushUndo`) rồi `S.changed()`.
- **Hai chế độ cho Delete** (công tắc đầu panel, nhớ ở `localStorage` `avs.twMode`): **Sửa chữ** (mặc định) xoá chữ khỏi phụ đề, video giữ nguyên; **Cắt video** cắt đoạn khỏi video có ripple (`Studio.ai.cutRanges`).
- **Sửa tại chỗ**: bấm đúp một từ, hoặc chọn rồi Enter / F2 / gõ chữ → ô sửa; Enter lưu, Esc huỷ, bấm ra ngoài là lưu. Cùng số từ: giữ `s/e` (và `hl/br`) từng từ; khác số từ: chia lại trong `[s đầu, e cuối]` theo độ dài chữ; đoạn trải nhiều khối thì chia từ mới cho từng khối theo thời lượng, không từ nào ra ngoài khối của nó; khối hết chữ bị bỏ. Từ đổi chữ có `ed: true` (gạch chân chấm, lưu vào `captions.json`).
- **Chọn**: kéo, Shift-bấm, ← → (Shift mở rộng). **Menu đoạn** (chuột phải, phím Menu / Shift F10, thanh nổi cuối panel; `role="menu"`, ↑↓ Home End Enter Esc): Sửa chữ, Nhấn mạnh (`hl`), Xuống dòng sau đoạn (`br` của từ cuối), Ẩn khỏi phụ đề, Cắt khỏi video, Phát lại đoạn (lặp tới khi Esc hoặc dừng).
- **Tìm và thay** (Ctrl H khi panel mở, hoặc nút): không phân biệt hoa thường, dấu thanh đặt khác chỗ vẫn khớp ("hóa" = "hoá"), tuỳ chọn **Không phân biệt dấu**; khớp được cụm nhiều từ; danh sách chỗ khớp có mốc thời gian (bấm để tua và chọn); Thay (Enter ở ô Thay bằng) / Thay tất cả (một bước ⌘Z); **Nhớ cho lần sau** ghi các chữ đã khớp vào từ điển dự án hoặc thương hiệu.
- **Từ điển** (nút sách): hai ô "sai = đúng" (dự án, thương hiệu của dự án) + chip **Tự có** (tên thương hiệu, sản phẩm). **Lưu từ điển**; **Áp vào lời thoại này** áp ngay cho phụ đề đang mở. Sau mỗi lần tạo lời thoại (`25_transcribe`, `new_project.mjs`, `batch.mjs`, `highlights.mjs`) `scripts/dict.mjs` gộp các nguồn thành một tham số `--fix=…` cho `captions.py` (giữ thời gian; ba luồng hạ chữ thường vẫn giữ hoa cho từ đích của từ điển).
- **Đề xuất** (dữ liệu tạm trong trình duyệt, không lưu vào timeline): gạch sóng trên từ, chuột phải có Nhận / Bỏ.
- **AI soát lỗi** (M90; nút ✨ ở đầu panel hoặc "AI soát lỗi"): trợ lý `transcript` (`references/assist.md`) đọc lời thoại theo từng đoạn ~1 phút cùng từ điển, tên thương hiệu và sản phẩm; tiến độ "Đoạn k/n", Huỷ được, chạy được cả khi đang xuất video. Đề xuất hiện bằng gạch sóng; bấm một chỗ (hoặc trong danh sách) mở thẻ **cũ → mới** + lý do, **Nhận** / **Bỏ** / **Nghe đoạn này** (phát lặp đoạn, thêm 2 từ mỗi bên) / ‹ ›; thanh tổng "N đề xuất · Nhận tất cả (một bước ⌘Z) · Bỏ tất cả", lọc theo loại (nhận dạng, tên riêng, chính tả, dấu câu). Nhận dùng đúng hàm sửa của M89 (giữ/chia thời gian, `pushUndo`) và bỏ qua nếu chữ ở chỗ đó đã đổi; sửa lặp lại được (không phải dấu câu, chưa có trong từ điển) có ô **Thêm vào từ điển** (dự án hoặc thương hiệu; tên riêng chọn sẵn).

`Studio.transcript` (script, M90, Claude trong trình duyệt):
| Hàm | Việc |
|---|---|
| `mode`, `setMode('text'\|'cut')` | chế độ Delete |
| `words()` | `[{i, w, s, e, hl, br, ed}]` theo thứ tự thời gian (bỏ khối ẩn) |
| `find(q, {noAccent})` | `[{i, n, s, e, text}]` |
| `applyEdit(i, n, text)` | thay `n` từ từ vị trí `i` bằng `text` (`''` = xoá khỏi phụ đề); một bước ⌘Z; `false` khi vị trí sai |
| `suggest([{s, e, to, from?, reason?}])` | thay danh sách đề xuất (neo theo thời gian `s..e`), trả bản có `id` |
| `suggestions()`, `acceptSuggestion(id)`, `rejectSuggestion(id)`, `clearSuggestions()` | đọc / nhận (áp như `applyEdit`) / bỏ |
| `dict.load()`, `dict.saveProject(entries)` | đọc `GET /api/dict` / ghi từ điển dự án |
| `review()`, `reviewState()`, `openReview()`, `acceptAll()`, `rejectAll()` | AI soát lỗi (M90): chạy / trạng thái (`state`, `res.provider`, `res.windows`, `res.dropped`…) / mở hộp / nhận hoặc bỏ các đề xuất đang lọc |
| `openFind()`, `openDict()` | mở hộp Tìm và thay / Từ điển |

## Track chính trong Studio (`TL.clips`, xem clips.md)
- Mở dự án chưa có `clips` → tự chuyển: một clip `{src:{seq: aroll.frames, fps, count}, audio: audio.voice, in:0, out: min(count/fps, duration)}` (giữ `aroll` để tương thích; chỉ ghi vào file khi bấm Lưu).
- Ripple (`clips.js` → `remapAll`): xoá / cắt mép / đổi tốc độ / chèn / nhân bản clip sẽ dời phụ đề + từ (`words[].s/e`, bỏ từ nằm trong đoạn xoá), scenes (kể cả thời gian lồng bên trong), sfx, nhạc, fx, grade/zoom. `TL.duration` = tổng clip + đuôi của cảnh kết thúc sau đó.
- Khi phát, tiếng của clip phát theo đúng điểm nguồn, tốc độ, âm lượng, tắt tiếng.

Khi phát thử, preview nghe giọng gốc kèm SFX và nhạc phát trực tiếp theo timeline. Bản xuất thì trộn lại toàn bộ (`mix_audio.py`, −14 LUFS).

## Xuất
Trong hộp thoại xuất còn có **Ảnh bìa** (render khung hiện tại ra `out/cover_*.jpg` ở 1080p) và **Phụ đề .srt** (`out/<tên>.srt`, để đăng YouTube/Facebook).
"Xuất video" sẽ lưu dự án, chạy `mix_audio.py` rồi `render.mjs`, và ghi ra `<dự án>/out/<tên>_<thời gian>.mp4`. Chọn được 720p, 1080p hoặc 4K, và có thể chỉ xuất một đoạn từ–đến. Thanh tiến độ hiện ngay trong app, có nút "Hiện trong Finder".

## Ghi chú cho Claude
Mỗi lần lưu, Studio ghi `<dự án>/.studio/notes.md`, liệt kê mọi ghi chú kèm đường dẫn JSON (`scenes[3].lines[1]`, `captions[7]`…) và thời điểm. Khi người dùng nói "xem ghi chú trong editor":
1. Đọc `.studio/notes.md`.
2. Sửa `timeline.json` hoặc `captions.json` theo ghi chú.
3. Xoá trường `note` của các mục đã làm.
4. Báo người dùng bấm tải lại trang Studio. Studio chỉ đọc file lúc mở, nên **đừng sửa file khi người dùng đang có thay đổi chưa lưu**. Hỏi trước nếu không chắc.

Trường `_orig` trên một phần tử là bản thiết kế gốc (để dùng cho "Về thiết kế"). Phần tử có `_orig` nghĩa là người dùng đã tự chỉnh tay: khi dựng lại thì **giữ nguyên chỉnh sửa đó** trừ khi được yêu cầu.

## API (cho script)
Mọi `/api/*` cần **token phiên** (sinh mới mỗi lần chạy server): header `X-AVS-Token: <token>`, riêng GET/HEAD nhận thêm `?avs_token=` (cho `<img>`/`<video>`). Editor nhận token qua `<meta name="avs-token">` của trang chính (`studio/auth.js` tự gắn vào fetch/XHR, URL media dùng `avsUrl()`); script cục bộ đọc `$AVS_HOME/studio-<port>.token` (mặc định `~/.ai-video-studio`, quyền 600). Thiếu/sai token → 401. Chỉ nhận đúng origin của server (Host loopback đúng cổng, `Origin` và `Sec-Fetch-Site` nếu có phải cùng origin) → khác thì 403. Body JSON ≤ 32 MB (`AVS_MAX_JSON_MB`), file tải lên ≤ 20 GB (`AVS_MAX_UPLOAD_MB`) → 413; body không có `Content-Length` → 411. Kiểm ở `studio/security.mjs`. Phạm vi: header token áp cho `/api/*`. **Trang chính `/` và `/project/`** (file của dự án đang mở, symlink dẫn vào `$AVS_HOME` bị chặn) cần **phiên trình duyệt**: cookie HttpOnly `avs_s_<port>` (SameSite=Strict) mang một bí mật phiên riêng (không phải token API), lấy một lần qua link khởi chạy `http://localhost:<port>/?k=<token>` (server tự mở link này với `--open`, lối tắt đang chạy thì đọc file token rồi mở; link cũng in trong cửa sổ server), server đặt cookie rồi chuyển về `/` để key không nằm trên thanh địa chỉ. Thiếu cookie → `/` trả trang 401 hướng dẫn mở bằng lối tắt (không lộ token), `/project/` trả 401; CLI vẫn đọc `/project/` bằng header token. Nhờ vậy tiến trình khác chỉ chạm được cổng không lấy được token từ trang chính, cũng không đọc được file dự án (QA 2026-11-15, M60). Giới hạn: cookie gắn theo host chứ không theo cổng, nên trình duyệt cũng gửi nó tới server khác trên `localhost` mà người dùng mở; ai có cookie mở được `/` và đọc token trong trang. Giá trị cookie không dùng được làm `X-AVS-Token`. Link khởi chạy đi qua dòng lệnh của `open`/`rundll32` trong chốc lát. Ranh giới vẫn là tài khoản hệ điều hành. File tĩnh của mã nguồn (`/studio/`, `/engine/`, `/assets/`, `/templates/`) không cần phiên. Ranh giới bảo vệ là tài khoản người dùng hệ điều hành: file token nằm cùng các secret trong `$AVS_HOME` (trên Windows không có quyền 600, dựa vào ACL của thư mục người dùng).

| Đường dẫn | Việc |
|---|---|
| `GET /api/project` | `{timeline, captions, meta}` |
| `POST /api/save` | `{timeline, captions}` → ghi file + lịch sử + notes.md |
| `GET /api/history`, `GET /api/history/<id>` | lịch sử |
| `GET /api/library` | danh sách SFX / nhạc |
| `GET /api/waveform` | biên độ mỗi 1/50 s |
| `GET /api/broll?q=` | tìm trong 9.080 b-roll |
| `POST /api/autosfx` | chạy `auto_sfx.py --keep-manual` |
| `POST /api/export` | `{quality:"720"\|"1080"\|"4k", from?, to?}` |
| `POST /api/new` | `{video, dir?, model?, pack?, title?, orient?:"vertical"|"horizontal"}` |
| `GET /api/job`, `POST /api/job/cancel` | tiến độ / huỷ tác vụ |
| `POST /api/open` | `{path}` → đổi dự án. Chỉ thư mục có `timeline.json` (hoặc file timeline); từ chối (403) thư mục cấu hình `$AVS_HOME`, thư mục cha của nó, mọi thư mục con trừ `autopilot/`, `longform/`, `footage/`, và thư mục ẩn trong home (`~/.ssh`, `~/.claude`…) |
| `GET /api/media`, `POST /api/upload?name=` | thư viện media (body = file) |
| `GET /api/onboarding` | trạng thái hướng dẫn lần đầu `{done, skipped, step, purpose, aspect, platforms, brand, updated, isNew, project, recent:[{i, name, parent, t, current}]}` từ `$AVS_HOME/onboarding.json` (chưa có/hỏng → mặc định); có dự án đang mở thì ghi nó lên đầu `recent` (tối đa 8). Không trả đường dẫn đầy đủ (`02_onboarding`, M83) |
| `POST /api/onboarding` | gộp khoá `done`, `skipped` (bool), `step` (0–3), `purpose` (`bds\|khoahoc\|banhang\|review\|chiase\|tintuc\|doanhnghiep\|khac`), `aspect` (`9:16\|16:9\|1:1`), `platforms` (`tiktok, youtube, facebook, instagram, zalo`), `brand` (id kit); khoá lạ/sai kiểu → 400, body > 8 KB → 413; ghi file tạm rồi đổi tên. Không chứa token |
| `POST /api/onboarding/open` | `{i}` → mở dự án thứ `i` của `recent` (đường dẫn lấy từ file, cùng luật `/api/open`); không còn trên máy → 404 và bỏ khỏi danh sách |
| `GET /api/dict[?kit=<id>]` | từ điển lời thoại của dự án `{project, brand, auto, kit:{id,title}\|null}`: `project` từ `<dự án>/.studio/dict.json`, `brand` từ khoá `dict` của brand kit (mặc định `TL.brand.kit`, sau đó kit của hướng dẫn lần đầu), `auto` = tên thương hiệu và tên sản phẩm (`TL.ads.product`) thành cặp "chữ thường=Tên" (`21_dict`, `scripts/dict.mjs`) |
| `POST /api/dict` | `{entries:[{from, to}]}` (≤ 500 cặp, mỗi vế ≤ 80 ký tự, không `=`/`;`/ký tự điều khiển, không bắt đầu bằng `-`; cặp hỏng bị bỏ) → ghi `.studio/dict.json` qua file tạm rồi đổi tên; sai kiểu → 400. Từ điển thương hiệu ghi bằng `POST /api/brands/save {brand:{id, dict:"sai=đúng;…"}}` |
| `POST /api/still` | `{t}` → ảnh bìa `out/cover_*.jpg` |
| `POST /api/srt` | phụ đề → `out/<tên>.srt` |
| `GET /api/templates` | danh sách mẫu: `templates/*.json` + `templates/user/*.json`, kèm `preview:{mp4,jpg}` và `user` |
| `POST /api/templates/save` | `{tpl, t}` → `templates/user/<id>.json` + ảnh bìa `templates/previews/<id>.jpg` |
| `GET /templates/…` | file tĩnh của thư mục mẫu (preview mp4/jpg) |
| `GET /studio/thumbs/…` | ảnh thu nhỏ hiệu ứng + `index.json` |
| `GET /api/engines`, `GET /api/engines/status` | cấu hình LLM + giọng (chỉ khoá `llm`/`tts`, không khoá bí mật), trạng thái Ollama/VieNeu |
| `POST /api/engines/llm`, `POST /api/engines/llm/try` | `{text, fallback, url, model}` (url chỉ loopback) · thử một câu JSON |
| `POST /api/engines/voice`, `…/voice/start`, `…/voice/preview` | `{url, voice, default_engine}` · bật máy chủ VieNeu · `{voice, text}` → `audio/wav` |
| `GET /api/frames/check`, `POST /api/frames/rebuild` | chuỗi khung hình của timeline có thư mục trống `[{seq, fps, src}]` (`src`: video tạo lại được, `null` nếu không còn) · job tách lại bằng ffmpeg ở cỡ thiết kế. Mở dự án thiếu khung hình (chép thiếu `work/frames`) thì Studio hỏi tạo lại (`63_frames`, M63) |
| `GET /api/perf` | profile hiệu năng đã lưu + `custom`, `active`/`resolved` (sau biến môi trường), danh sách profile (nhãn + mô tả), máy này (`hwSnapshot`, không đường dẫn; giữ 30 s, `?fresh=1` đo lại), kế hoạch 720p/1080p/4k, `env` (tên biến `AVS_*` đang ghi đè → có/không) |
| `POST /api/perf` | `{profile?, custom?}` kiểm bằng `ENCODER_CHOICES`, `X264_PRESETS`, `PRIORITIES`, `WHISPER_DEVICES`, `MAX_WORKERS`, `MAX_SLOTS`; sai → 400 `{error}`, không ghi |
| `GET /api/perf/log?n=20` | `readPerfLog` (mới nhất cuối, tối đa 500) |
| `POST /api/perf/bench` | `{profiles?: [1–3 profile]}` (mặc định Tiết kiệm, Cân bằng, Tốc độ) → job `perf-bench`: render 10 s bản chép tạm `sample/clip-mau`, kết quả ở `job.bench` của `GET /api/job`; đang có job → 409; huỷ bằng `/api/job/cancel` |
| `GET /api/assist`, `POST /api/assist/<tên>`, `GET /api/assist/<tên>`, `POST /api/assist/cancel` | trợ lý LLM dùng chung (M91, M90; `references/assist.md`): danh sách `[{name, label}]` · khởi lượt trợ lý trong ô job riêng (chạy được khi đang xuất video; một trợ lý một lúc; 400 dữ liệu sai, 404 không có trợ lý, 409 trợ lý khác đang chạy) → `{ok, run}` · lượt gần nhất `{state: idle\|running\|done\|error\|cancelled, run, step, progress, fields \| suggestions, warnings, provider, ms \| error, kind}` · huỷ trợ lý đang chạy (`/api/job/cancel` không dừng trợ lý). Trợ lý `brand` `{image?, colors?, website?, industry?, name?}`, `product` `{image?, url?, industry?, brand?, name?}`, `transcript` `{words:[{w,s,e}], dict?, names?, industry?}`; `image` là data URL PNG/JPEG/WebP ≤ 6 MB; website/link tải qua `net_guard`. Chỉ đề xuất, không ghi đĩa |
| `POST /api/perf/advise` | `{goal:"nhanh"\|"song-song"\|"chat-luong", job?:{W,H,fps,sec,count}, llm?:false}` → `{profile, overrides, reason, provider, pick, candidates}`: luật sinh ứng viên, LLM chỉ chọn (M68, `references/perf-profile.md`); không lưu; 400 sai kiểu, 409 đang bận |

Server chỉ nghe ở `127.0.0.1` và chỉ phục vụ file trong `studio/`, `engine/`, `assets/`, thư mục mẫu và thư mục dự án. Thư mục mẫu mặc định là `<skill>/templates`, đổi bằng `--templates <dir>` hoặc biến `AVS_TEMPLATES`.

## Ảnh thu nhỏ hiệu ứng
```bash
node <skill>/scripts/thumbs.mjs <dự án có work/frames>/timeline.json            # mọi gói (≈1 phút)
node <skill>/scripts/thumbs.mjs <...>/timeline.json --only news,topn             # chỉ làm lại vài gói
```
Render mỗi item `make(2)` tại 2,7 s lên footage thật → `studio/thumbs/<packid>__<index>.jpg` (180×320, q70) + `studio/thumbs/index.json`. Chạy lại sau khi thêm/sửa gói (thứ tự item đổi thì ảnh cũng đổi theo index).

## Plugin (v4)
Studio tự nạp mọi `studio/routes/*.mjs` (server) và `studio/features/*.js` (giao diện) theo thứ tự tên.
- Route: `export default ctx => async (req, res, p, u) => true|false`. `ctx` có `project, job, startJob, run, json, body, save, readProject, P, PY, SKILL`.
- Feature: dùng đối tượng toàn cục `Studio`: `TL, CAP, addPanel(id, icon, tên, fn), addTopButton(html, fn), addInspectorTab(c => [key, nhãn, html]), onReady, reload, changed, pushUndo, api, pollJob, toast, modal`.
- `addPanel(id, icon, tên, fn, opts)` và `addTopButton(html, fn, opts)` nhận `opts = { step, level }` không bắt buộc (M82): `step` là `prep | source | build | check | ship | settings`, `level` là `basic | pro` (`pro` ẩn ở chế độ Cơ bản). Panel không có `opts` và không có trong bảng `PANELS` của `01_workflow.js` rơi vào **Thêm…** của bước Dựng. Nút trên header không có `opts.step` vào menu ⋯; có `opts.step` thì thành một mục trên thanh trái của bước đó (thẻ giải thích + nút bấm hộ). Hook nội bộ: `Studio._popts`, `Studio._top` (gọi sau `addTopButton`), `Studio._rail` (gọi sau `renderRail`).
- Tính năng có sẵn:
  - `01_workflow`: bố cục theo 5 bước, menu ⋯, trang Cài đặt, chế độ Cơ bản / Chuyên nghiệp (xem mục Màn hình).
  - `02_onboarding`: hướng dẫn lần đầu 3 bước + trang chủ khi chưa mở dự án (mục Màn hình ở trên).
  - `05_assist`: `Studio.assist(name, input, {onStep})`, `Studio.assistPanel({name, label, hint, input, current, onAccept, filter})` (ô đề xuất Nhận / Bỏ / Nhận tất cả, `mount(el)`), `Studio.imagePayload(src, {max, type})` (`references/assist.md`). Dùng ở `02_onboarding` (Gợi ý bằng AI, Điền bằng AI), `51_brands` (form brand kit), `53_products` (Điền bằng AI). `02_onboarding` cung cấp `Studio.logoColors(blob)` và `Studio.onboardingPurpose()`.
  - `03_nextstep`: thẻ Bước tiếp theo + Sẵn sàng x/6 ở inspector khi không chọn gì. `Studio.nextStep.refresh()`, `.state()`.
  - `04_cmdk`: tìm công cụ ⌘K / Ctrl K. Dùng `Studio.workflow` (`goStep, meta, groupOf, setLevel, openMore, closeMore, STEPS, step, level`) do `01_workflow` cung cấp.
  - `18_schedule`: Lịch đăng + Kết nối YouTube (`references/publish-schedule.md`).
  - `20_ai`: AI dựng giúp, Cắt lỗi nói (`Studio.ai`: `cutRanges`, `wordSpan`, `allWords`, `previewRange`, `fillers`).
  - `21_transcript` (+ lõi thuần `21_transcript.core.js` = `window.TranscriptCore`, test ở `scripts/tests/transcript_edit.test.mjs`): panel **Lời thoại** (M89), xem mục "Lời thoại" bên dưới.
  - `28_engines`: nút **Mô hình & giọng**: nhà cung cấp LLM cho việc chỉ có chữ (Claude/Ollama, `references/llm.md`) và giọng VieNeu (`references/voice.md`).
  - `29_perf`: panel trái **Hiệu năng** (`references/perf-profile.md`): thẻ máy, chọn profile, form Tuỳ chỉnh, dòng biến môi trường đang ghi đè, kế hoạch render, **Đo thử 10 s**, lịch sử `perf_log`, **Hỏi AI chọn profile** (`POST /api/perf/advise` của `31_perfai`, không có thì ẩn nút); hộp xuất hiện tên profile đang dùng. Route `29_perf.mjs` chỉ nhận `/api/perf`, `/api/perf/log`, `/api/perf/bench`, đường dẫn khác dưới `/api/perf/` để route sau xử lý.
  - `30_audio`: Âm thanh+.
  - `40_reframe`: Bám mặt, Lồng tiếng.
  - `50–52`: Hàng loạt, Thương hiệu, Đăng.
  - `53_products`: Sản phẩm (Product Brain, `references/products.md`).
  - `60–62`: Keyframe, Mặt nạ / Tách nền, B-roll AI.
  - `90_app`: mở thư mục, tiến trình.
