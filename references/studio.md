# AI Video Studio — phần mềm edit (studio/)

Một editor chạy local trong trình duyệt. Preview dùng **chính engine render**, nên khung hình nhìn thấy giống hệt khung hình xuất ra. Studio đọc và ghi trực tiếp `timeline.json` + `captions.json` của dự án: Claude dựng bản đầu tiên, người dùng tinh chỉnh bằng chuột, rồi ghi chú lại để Claude sửa tiếp.

## Chạy
```bash
bash <skill>/studio.sh <thư mục dự án>          # mở dự án có sẵn → http://localhost:5186
bash <skill>/studio.sh --new raw.mp4 [thư mục]   # video thô → dự án khởi đầu → mở luôn
```
Cần Node ≥ 18, ffmpeg, Chrome (để xuất video), và `scripts/.venv` (whisper, nếu dùng "Video mới"). Khi Claude mở Studio cho người dùng thì chạy nền (`run_in_background`), rồi đưa link `http://localhost:5186`.

## Màn hình (v2 — giao diện tối kiểu editor chuyên nghiệp)
Code: `studio/index.html`, `studio.css` (theme tối, accent tím), `clips.js` (track chính + ripple), `library.js` (thanh icon trái + thư viện), `studio.js` (preview, inspector, timeline, phát, lưu/xuất). Icon: tabler-icons webfont (jsdelivr).
- **Lần đầu mở** (`02_onboarding`, M83): sau màn tác giả (`00_author.js` luôn hiện trước), khi `$AVS_HOME/onboarding.json` chưa `done`/`skipped`, hiện hướng dẫn 3 bước (thanh tiến độ, Bỏ qua, Quay lại, Tiếp; mở lại ở đúng bước đã lưu):
  1. **Thương hiệu**: tên + logo bắt buộc (kéo thả), 2 màu chủ đạo tự lấy từ logo bằng canvas (đổi được), SĐT/website/tên kênh tuỳ chọn → `POST /api/brands/save` + `/api/brands/logo` (`51_brands`), id kit ghi vào `onboarding.json` (`brand`); đang mở dự án thì áp luôn kit cho dự án (hoàn tác được).
  2. **Tài nguyên** (tuỳ chọn): ảnh/video sản phẩm và nhạc riêng → `/api/upload` (Media › Của tôi, cần dự án đang mở); một sản phẩm (tên, giá, điểm mạnh) → `POST /api/products/save` (`53_products`): giá vào `notes`, mỗi điểm mạnh là một claim `pending`.
  3. **Mục đích**: lĩnh vực (BĐS, Khoá học, Bán hàng, Review, Chia sẻ, Tin tức, Doanh nghiệp, Khác) → gợi ý số mẫu và gói style hay dùng theo `category` của `GET /api/templates`; khổ 9:16/16:9/1:1; nền tảng đăng. Kết nối YouTube/Telegram và chọn Claude/Ollama để sau (nút Mô hình & giọng, Lịch đăng). Xong mà có dự án thì mở mục Mẫu lọc sẵn theo lĩnh vực.
- **Trang chủ** (`#onb-home`): tự hiện khi chưa mở dự án (thay hộp “Chưa mở dự án”), mở lại bằng nút nhà cạnh logo (Esc / Đóng khi có dự án). 4 thẻ: **Thả video → video hoàn chỉnh** (panel Tự lái), **Dựng theo mẫu** (mục Mẫu lọc theo lĩnh vực; chưa có dự án thì mở Video mới, tải lại xong tự mở Mẫu), **Video dài → clip ngắn** (panel Video dài), **Làm hàng loạt** (panel Hàng loạt); **Dự án gần đây** (8 dự án đã mở, mở bằng `POST /api/onboarding/open`); **Xem lại hướng dẫn**. Hàm: `Studio.openOnboarding()`, `Studio.openHome()`.
- **Thanh trên** (M82, `features/01_workflow.js`): logo + tên dự án + trạng thái Đã lưu / Chưa lưu, hoàn tác ↶ / làm lại ↷, **thanh 5 bước** ở giữa (1 Chuẩn bị · 2 Nguồn · 3 Dựng · 4 Kiểm tra · 5 Xuất và đăng), menu **⋯**, **Lưu** (⌘S), **Xuất** (nút chính duy nhất). Màn dưới 1180 px chỉ bước đang mở hiện chữ.
  - Bấm một bước: thanh icon trái chỉ hiện công cụ của bước đó (tối đa 7, phần còn lại trong **Thêm…**) và tự mở công cụ đầu. Bước đang mở lưu theo máy (`localStorage` `avs.step`). Mở một panel từ chỗ khác (liên kết, nút) thì thanh bước tự chuyển theo.
  - Bước: ① Thương hiệu, Sản phẩm, Media · ② Video mới, Video dài, Lời thoại, AI (cắt lỗi nói) · ③ Tự lái, AI dựng, Mẫu, Chữ, Âm thanh, Hiệu ứng, Sticker, Thêm… (Chuyển cảnh, Bộ lọc, B-roll AI, Tự động, Âm thanh+, Lồng tiếng) · ④ Kiểm tra (thẻ Kiểm tra chất lượng + Nhiều phiên bản của `16_qc`), Thành phần · ⑤ Xuất, Đăng, Lịch đăng, Hàng loạt.
  - **⋯**: Chế độ Cơ bản / Chuyên nghiệp, **Lịch sử** (60 bản lưu trong `<dự án>/.studio/history/`), **Vừa khung** (fit preview + timeline), **Mô hình & giọng**, đổi nhanh **Thương hiệu**, **Mở thư mục dự án** (app Mac), **Cài đặt…**.
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
  - Không chọn gì: **Dự án** (gói style + **Dựng tự động theo gói**, kiểu phụ đề, vị trí mặt, Tự đặt SFX, ghi chú chung) · **Thương hiệu** (brand kit).
- **Timeline**: thanh công cụ (tách ⌘B, xoá, nhân bản, nam châm bật/tắt), thanh thu phóng + Vừa timeline (⌘/Ctrl + cuộn cũng zoom). Track: Phụ đề, Chữ thêm, Chữ graphic, Graphic, B-roll, Cảnh (track trống tự ẩn), **Video chính**, Âm thanh, Giọng (waveform theo từng clip). Mỗi track có nút **ẩn** (chỉ ẩn trên preview) và **khoá**.
  - Track chính: mỗi clip là một khối có dải ảnh thu nhỏ, nhãn tốc độ/tắt tiếng/bộ lọc, nút chuyển cảnh ở chỗ nối. Kéo khối để **đổi thứ tự** (phụ đề, SFX, graphic nằm trọn trong clip đi theo). Kéo mép để **cắt có ripple**. Delete = xoá clip có ripple.
  - Khối khác: kéo để dời, kéo mép để cắt, hít vào playhead / mép khối / chỗ nối clip. Bấm thước hoặc khoảng trống để tua, bấm đúp để nhảy tới khối. Kéo mép trên của timeline để đổi chiều cao.
- **Phím tắt**: Space phát/dừng · ← → 1 khung (Shift: 1 giây) · Alt+mũi tên dịch 1 px (Shift: 10 px) · Delete xoá · ⌘D nhân bản · ⌘B tách clip · ⌘Z / ⇧⌘Z · + / − zoom timeline · ⇧Z vừa khung · Esc bỏ chọn / thu preview.

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
  - `18_schedule`: Lịch đăng + Kết nối YouTube (`references/publish-schedule.md`).
  - `20_ai`: AI dựng giúp, Cắt lỗi nói, Lời thoại.
  - `28_engines`: nút **Mô hình & giọng**: nhà cung cấp LLM cho việc chỉ có chữ (Claude/Ollama, `references/llm.md`) và giọng VieNeu (`references/voice.md`).
  - `29_perf`: panel trái **Hiệu năng** (`references/perf-profile.md`): thẻ máy, chọn profile, form Tuỳ chỉnh, dòng biến môi trường đang ghi đè, kế hoạch render, **Đo thử 10 s**, lịch sử `perf_log`, **Hỏi AI chọn profile** (`POST /api/perf/advise` của `31_perfai`, không có thì ẩn nút); hộp xuất hiện tên profile đang dùng. Route `29_perf.mjs` chỉ nhận `/api/perf`, `/api/perf/log`, `/api/perf/bench`, đường dẫn khác dưới `/api/perf/` để route sau xử lý.
  - `30_audio`: Âm thanh+.
  - `40_reframe`: Bám mặt, Lồng tiếng.
  - `50–52`: Hàng loạt, Thương hiệu, Đăng.
  - `53_products`: Sản phẩm (Product Brain, `references/products.md`).
  - `60–62`: Keyframe, Mặt nạ / Tách nền, B-roll AI.
  - `90_app`: mở thư mục, tiến trình.
