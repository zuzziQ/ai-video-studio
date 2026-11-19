# Tự lái · Phong cách dựng của thương hiệu · Hàng đợi nền · Thư mục tự động

Thả video thô → nhận MP4 hoàn chỉnh + ảnh bìa + phụ đề .srt + nội dung đăng, không cần mở timeline.

| Phần | File |
|---|---|
| Chuỗi tự lái (CLI) | `scripts/autopilot.mjs` |
| Tạo dự án từ video (dùng chung với `/api/new`) | `scripts/new_project.mjs` |
| Cắt ripple ngoài trình duyệt (chạy chính `studio/clips.js` trong `node:vm`) | `scripts/ripple.mjs` |
| Nội dung đăng (dùng chung với nút **Đăng**) | `scripts/publish_texts.mjs` |
| Phong cách dựng của thương hiệu (trước là hồ sơ kênh) + học từ chỉnh sửa | `scripts/profile.mjs` |
| Hàng đợi, thư mục tự động, LaunchAgent | `scripts/queue.mjs` |
| Thông báo macOS | `scripts/notify.mjs` |
| Studio | `studio/routes/15_autopilot.mjs`, `studio/features/15_autopilot.js` (rail **Tự lái**, nút **Tự lái** trên thanh trên); phong cách dựng sửa ở `studio/routes/51_brands.mjs`, `studio/features/51_brands.js` (trang **Thương hiệu**) |

Dữ liệu nằm trong `~/.ai-video-studio/` (đổi bằng `AVS_HOME`): `styles.json` (+ `profiles.json` cũ, chỉ đọc khi chuyển), `queue.json`, `autopilot.json` (cài đặt), `queue.lock`, `autopilot/projects/` (dự án do Tự lái tạo), `autopilot/inbox/` (video kéo thả vào Studio).

## 1. Chuỗi tự lái
```bash
node scripts/autopilot.mjs <video | thư mục dự án> [--brand <id> | --profile <id>] [--script <id | kịch bản.txt|.docx>] [--out <thư mục giao>] [--project <dir>] [--restart] [--from <bước>]
node scripts/autopilot.mjs --steps
```
| Bước | Làm gì | Tắt bằng (phong cách dựng) |
|---|---|---|
| `new` * | whisper (`whisper`, `lang`) → cắt lặng → khung hình (`orient`: theo video / dọc / ngang) → mặt → phụ đề | — (bỏ qua nếu đầu vào là dự án) |
| `brand` | brand kit (`brand`) + CTA (`cta` → `brand.outro`) | để trống cả hai |
| `clean` | `TL.audio.clean = {preset}` (áp khi trộn) | `clean: off` |
| `fillers` | `fillers.py` (+ `--claude`), cắt các chỗ conf ≥ 0,6 (đúng mức UI chọn sẵn) bằng ripple trên `TL.clips` | `fillers: false` |
| `script` | kịch bản có sẵn (S17 M123, `references/script.md`): `--script` (id kịch bản chờ của panel, hoặc file) hoặc `.studio/script.json` đã lưu ở bước Nguồn → phụ đề theo chữ kịch bản (căn với phụ đề sau `fillers`; không lời thì chia đều), claim gate khi có sản phẩm | không có kịch bản |
| `ai` | `ai_edit.mjs --apply` (mục tiêu, giọng điệu, gói, mật độ, yêu cầu thêm + CTA) **hoặc** template (`template`) qua `window.applyTemplate` trong Chrome headless; ép `caption_style` nếu có | `ai: false` và không có template |
| `broll` | `auto_broll.mjs --density --src [--claude]` | `broll_density: off` |
| `sfx` | `auto_sfx.py --level` (+ `--music auto` khi AI chưa chọn nhạc), nhạc `off`/mood cố định, chỉnh dB đã học | `sound: off` |
| `qc` | `ai_qc.mjs --fix` (A2) nếu có file; không có thì bỏ qua | `qc: false` |
| `export` * | lưu `.studio/autopilot_result.json` → `mix_audio.py` → `render.mjs --audio` (giống nút Xuất) → khổ phụ bằng `export_multi.deriveAspects` + `.srt` | — |
| `publish` | `publish_texts.mjs` (claude -p) → `publish/<nền tảng>.txt` | `platforms: []` |
| `cover` | `render.mjs --still` tại `thumb_time` AI gợi ý → `out/cover.jpg` | — |
| `deliver` * | `out/summary.json` (thời gian từng bước, file, QC…), chép kết quả vào `--out`, thông báo | — |

`*` = bắt buộc: lỗi thì dừng, báo lỗi tiếng Việt, mã thoát ≠ 0. Bước tuỳ chọn lỗi → ghi `warn` và chạy tiếp.

**Chạy tiếp được** (đã thử `kill -9` giữa lúc render rồi chạy lại: bỏ qua 8 bước đã xong, xoá file tạm/MP4 dở, xuất lại trong 33 s): trạng thái ở `<dự án>/.studio/autopilot.json`. Chạy lại cùng lệnh sẽ bỏ qua bước đã xong. Bước sửa `timeline.json` có bản sao `.studio/autopilot/pre_<bước>.json`; nếu bước đó bị ngắt giữa chừng thì timeline được khôi phục trước khi làm lại. Video cùng đường dẫn + dung lượng luôn vào cùng thư mục `autopilot/projects/<tên>-<hash>`. `--restart` làm lại từ đầu, `--from ai` làm lại từ một bước.

Đầu ra: dòng `@@ <0..1> [k/12] <bước>: <chi tiết>`, `PROJECT <dir>`, cuối cùng `RESULT {json}`. Với `--out`, thư mục giao có `<tên> 9x16.mp4` (+ `1x1`, `16x9`), `<tên> - ảnh bìa.jpg`, `<tên>.srt`, `<tên> - nội dung đăng.txt`, `summary.json`.

## 2. Phong cách dựng của thương hiệu (`styles.json`, S19 M133)
Mỗi thương hiệu (brand kit) có **một** phong cách dựng + điều đã học; `chung` = video không gắn thương hiệu (Kho Chung).
`{version, default, styles: { chung: {…}, <id thương hiệu>: {pack ('auto' = AI chọn), template, caption_style, goal, tone, ai, ai_density, extra, broll_density, broll_src[], broll_goal, broll_claude, sound, music ('auto'|'off'|mood), clean, fillers, fillers_claude, whisper, lang, orient, aspects[], quality, qc, cta, platforms[], slot, learn, learned, fb, updated} }, aliases: { <id hồ sơ cũ>: <id phong cách> }, migrated: {at, notes[]} }`.
`music` của phong cách: `auto` (AI / theo đoạn; Kho có bài hợp tâm trạng thì dùng bài đó) · `off` · tâm trạng của thư viện · **`kho`** = nhạc của thương hiệu: một bài trong `Nhac/` của Kho chứa dự án, cố định theo dự án (chạy lại không đổi bài) · **`kho:<rel>`** = đúng bài đó (mất thì như `kho`). Kho chưa có nhạc → như `auto`, ghi chú trong bước `sfx`. Tự lái thay mọi nhạc `_ai`/`_auto` bằng một đoạn cả video; AI dựng (`20_ai.mjs` → `opts.music_pick` → `ai_edit.mjs` `khoMusicPick`) dùng bài đó thay bài hợp tâm trạng, thói quen "không nhạc" vẫn thắng (S19 M138). Chọn trong biểu mẫu Phong cách dựng (ô Nhạc nền liệt kê nhạc trong Kho của thương hiệu).
- Thương hiệu chưa lưu phong cách riêng thì mượn các trường của Chung (không mượn `learned` / `fb`). Xoá thương hiệu → bỏ phong cách của nó.
- **Chuyển dữ liệu một lần** (lần đầu đọc, trong khoá `styles.json.lock`): hồ sơ có `brand` còn trong `brands.json` → phong cách của thương hiệu đó, không có / thương hiệu đã xoá → Chung. Nhiều hồ sơ cùng chỗ: lấy hồ sơ mặc định, không thì hồ sơ sửa gần nhất; `learned.projects` của cả nhóm gộp lại; ghi chú vào `migrated.notes` (trang Thương hiệu hiện một lần). `profiles.json` giữ nguyên. `default` = thương hiệu của hồ sơ mặc định cũ. `brands.json` / `profiles.json` hỏng hoặc bận lúc chuyển → báo lỗi, không ghi `styles.json` (lần sau chuyển lại). Cập nhật xong khởi động lại Studio, runner nền (LaunchAgent) và bot Telegram: tiến trình cũ còn ghi `profiles.json`, thay đổi đó bị bỏ qua.
- Xoá thương hiệu để lại bí danh `<id> → chung`: mục cũ còn mang id đó chạy theo Chung thay vì báo lỗi.
- **Id cũ vẫn nhận** (`resolveStyleId`): `--profile` của CLI, `opts.profile` trong `queue.json`, `profile` của thư mục canh, `profile` trong `.studio/autopilot.json` và cấu hình Telegram nhận id thương hiệu, `chung`, `__none` hoặc id hồ sơ cũ (qua `aliases`; `mac-dinh` → Chung). Id lạ → lỗi 404.
- `autopilot.mjs`: `--brand` quyết định luôn phong cách (`''` / `__none` → Chung); không có `--brand` thì `--profile`, rồi phong cách lần chạy trước, rồi `default`. `autopilot.json` ghi `profile` = id phong cách.
- Ghi luôn dưới khoá `styles.json.lock`; `styles.json` hỏng thì báo lỗi, không ghi đè. `saveStore` (feedback.mjs) không ghi `learned`, nên một bản đọc cũ không xoá điều vừa học.
Studio: trang **Thương hiệu** — thẻ **Chung** + mỗi thẻ thương hiệu có **Phong cách dựng** (bút chì mở hộp sửa) và **Điều đã học** (cục tẩy = quên). API: `GET /api/brands/styles`, `POST /api/brands/style {action: save|reset, id, style?}`; `POST /api/autopilot/profile {action: save|default|reset}` giữ cho tương thích (`duplicate`/`delete` → 409). CLI: `node scripts/profile.mjs list | show [id] | default <id> | learn <dự án> | reset-learned <id>`. `slot` (giờ đăng mặc định) được ghi vào `summary.json` để Lịch đăng (A4) dùng.

### Học từ chỉnh sửa
- **Bản AI giao** (S19 M134): `.studio/ai_result.json` = `{source: ai|autofill|autopilot, at, ms, timeline, captions}`, ghi bởi AI dựng (Studio áp kế hoạch, lưu, rồi `POST /api/ai/delivered`), Tự động (cuối job `/api/autofill`, trừ "Xoá phần tự động") và Tự lái (bước `export`, cùng `autopilot_result.json` cũ). Mỗi lần AI chèn mới thay bản giao cũ.
- Khi Studio đang mở một dự án có bản AI giao (bất kỳ tab nào trên thanh tab, M131) và bạn **lưu** nó (kiểm tra mỗi 15 s, hoặc bấm **Học từ dự án này**), Studio so `timeline.json` (và phụ đề) với bản AI giao (dự án Tự lái cũ: `.studio/autopilot_result.json`) và ghi một *quan sát* vào `learned.projects[<dự án>]` của **thương hiệu của Kho chứa dự án** (`workspaceOfProject`: `.kho.json`, không có thì `TL.brand.kit`, không có nữa thì Chung): số cảnh Tự lái chèn (`_auto` của b-roll + `_ai` của AI dựng giúp, trừ nền `_base`) theo loại (emoji / chữ / ảnh / graphic khác) trước–sau, riêng graphic AI trước–sau, SFX tự động trước–sau, nhạc bị tắt / đổi dB, kiểu phụ đề / gói bị đổi, số cảnh tự động bị chỉnh (`_orig`); M134 thêm: chữ phụ đề bị sửa (`words: [[sai, đúng]]`, ghép dòng cùng `t0` và cùng số từ), lời kết / CTA đổi (`brand.outro`), câu khẳng định trong graphic AI bị xoá (`claims: [trước, sau, ví dụ]`, nhận bằng `CLAIM`: %, “nhất”, “số 1”, cam kết, đảm bảo…). Lưu lại cùng dự án chỉ **thay** quan sát cũ, không cộng dồn.
- Luật (trên ≤ 10 quan sát mới nhất, cần **≥ 2 video**): xoá ≥ 60 % emoji / chữ nổi / ảnh tự động (≥ 4 cái) → bỏ nguồn đó khỏi b-roll và dặn AI “không chèn …”; xoá ≥ 45 % b-roll tự động → giảm mật độ một bậc; xoá ≥ 45 % graphic AI → AI thưa hơn một bậc; xoá ≥ 50 % SFX → giảm mức âm thanh; tắt nhạc ở ≥ 60 % video → không nhạc; luôn chỉnh nhạc cùng chiều → áp dB trung bình; 2–3 video gần nhất cùng đổi sang một kiểu phụ đề / gói → dùng luôn (trừ khi phong cách đã ép); 2 lần đổi CTA gần nhất cùng một câu → dùng câu đó; câu khẳng định AI chèn bị xoá ở ≥ 2 video (≥ 50 %) → dặn AI không viết số liệu / cam kết tuyệt đối; cùng cặp chữ phụ đề “sai → đúng” ở ≥ 2 video → **từ điển chính tả của thương hiệu** (mỗi cặp một điều, tối đa 12).
- Mỗi điều là một **thói quen** có khoá (`drop_emoji`, `broll_step`, `music_off`, `cta`, `no_claims`, `dict:<chữ sai>`…; `deriveRules().items`). `learned.off[]` tắt hẳn, `learned.forgot{khoá: thời điểm}` quên các lần sửa tới lúc đó (học lại từ video mới); trang Thương hiệu: nút mắt (tắt / bật) và ✕ (xoá) trên từng điều, `POST /api/brands/style {action: habit, id, key, op: off|on|forget}`.
- **Dùng điều đã học**: Tự lái qua `effectiveProfile` (mật độ, nguồn b-roll, nhạc, CTA, dặn AI); **AI dựng** (`/api/ai/edit` → `opts.learned` → `ai_edit.mjs applyLearned`: dặn trong prompt, bỏ loại graphic hay xoá, không nhạc / chỉnh dB, kiểu phụ đề, chính tả `plan.dict` áp cho mọi dòng phụ đề), hộp AI dựng ghi "Đang áp n thói quen của <thương hiệu>" và bỏ chọn được từng điều cho lần đó (`skip`); **từ điển** (`dict.mjs`: chính tả đã học vào `--fix` của `captions.py`, từ điển gõ tay của thương hiệu / dự án thắng; trợ lý soát lời thoại và nghe lại cũng nhận); **Cắt clip** (`/api/longform/highlights` nối thói quen vào `--brief`).
- **Gu của thương hiệu** (S27 M192, ghi ngầm, không panel mới): `tasteDiff` thêm vào mỗi quan sát số khối Claude đặt theo loại (`_ai` / `_auto` / `_script`, trừ `_base`, gồm `celem`), SFX theo tên, mood nhạc AI bị bỏ, khối sửa tay. Luật (≥ 2 video): xoá ≥ 60 % một loại khối → `avoid:<loại>` (emoji / chữ / ảnh vẫn theo `drop_*`), SFX → `avoid_sfx:<tên>`, mood → `avoid_mood:<mood>`; element Claude dựng được giữ trên timeline hoặc **Nhận** ở panel Element (`recordElem`, `learned.elems`) → `elem_keep`. Mẫu dựng sẵn (M191): **Dùng cho video mới** / **Lưu thành mẫu** ghi `recordPick` (`learned.picks`, một lần mỗi bản nháp, các phương án còn lại là bị bỏ) → `pick_pace` (nhịp hay chọn), `pick_pack`, `skip_pack:<gói>` (bỏ qua ≥ 3 lần, chưa chọn lần nào); dự án dùng phương án có bản AI giao (`source: draft`) nên sửa tay sau đó cũng được học. Đọc trước khi dựng: `habitsFor().extra` (gộp bằng `capText`, tối đa `TASTE_MAX` = 700 ký tự) vào prompt AI dựng (`learnedOf` → `opts.learned`, `applyLearned` bỏ khối / SFX tránh, trừ mục `_sheet`; nhịp hay chọn thay mật độ mặc định "vừa"), mẫu dựng sẵn (`ai_edit.mjs --taste <thương hiệu>`, phương án Theo thương hiệu theo `pace`), element (`elemTaste`, ≤ 300 ký tự). Xem / tắt / xoá từng mục như các thói quen khác ở panel Thương hiệu.
- Điều đã học hiện ở trang Thương hiệu (câu tiếng Việt), được ghi vào `autopilot.json`/`summary.json` (`learnedApplied`) mỗi lần chạy; **Quên điều đã học** (cục tẩy) xoá `learned`. Tắt hẳn: `learn: false`.

## 3. Hàng đợi nền (`queue.json`)
Mục: `{id, kind, input, opts, source, state: queued|paused|running|done|error|cancelled, progress, step, created, started, finished, outputs[], error, attempt, project, batch?}`.
Mọi lần đọc–sửa–ghi `queue.json` (Studio, runner, bot Telegram, CLI) đi qua `mutate()` và giữ khoá `queue.json.lock` (tạo độc quyền, vài ms; khoá của tiến trình đã chết hoặc cũ hơn 10 s bị gỡ). `queue.json` hỏng được giữ lại thành `queue.json.bad-<thời điểm>` trước khi ghi mới. Kind lạ (kể cả `constructor`, `toString`) bị từ chối khi thêm; mục kind lạ sửa tay vào file thì báo lỗi, không làm kẹt hàng đợi.

| kind | lệnh |
|---|---|
| `autopilot` | `autopilot.mjs <input> [--profile] [--brand] [--out]` |
| `highlights` | `highlights.mjs <video> --out <dir> [--n --min --max --orient]` (A3; mặc định `autopilot/highlights/<tên>-<id>`) |
| `topic` | `topic_video.mjs "<chủ đề>" --out <dir> [--dur --voice --orient]` (A3; mặc định mỗi mục một thư mục `autopilot/topics/<id>`) |
| `variants` | `variants.mjs <dự án> --n 3 [--kind]` (A2) |
| `publish` | `publish.mjs <action> <mp4> [--meta] [--schedule]` (A4) |
`opts.args` (mảng) được nối thêm vào cuối lệnh. Script chưa có → mục báo lỗi rõ “chưa được cài”, không thử lại.

- **Một runner duy nhất** giữ `queue.lock` (pid): lane trong máy chủ Studio (không dùng ô tác vụ chính — Xuất/AI vẫn chạy song song), `node scripts/queue.mjs run [--daemon]`, hoặc LaunchAgent. Tiến trình khác đứng chờ và tự nhận lại khi runner kia tắt. Chỉ chạy **1 mục nặng** một lúc.
- Lỗi → tự thử lại 1 lần (autopilot chạy tiếp từ bước dừng). Huỷ (đang chạy: giết cả nhóm tiến trình), Thử lại, Lên/Xuống, Xoá, Mở dự án trong Studio, Hiện trong Finder. Mục `running` của runner đã chết → tự về `queued`.
- Mỗi 60 s runner gọi `node scripts/publish.mjs run-due` nếu file tồn tại (lịch đăng A4).
- Cả lô (mục có cùng `batch`; không ghi lô = cả hàng đợi): `batchControl('pause'|'resume'|'cancel', lô)` — tạm dừng đổi mục chờ thành `paused` (runner chỉ lấy `queued`, mục đang chạy làm nốt), tiếp tục trả về `queued` giữ thứ tự, huỷ đổi mục chờ/tạm dừng thành `cancelled` và đặt cờ huỷ cho mục đang chạy.
- CLI: `node scripts/queue.mjs add autopilot ~/clip.mov [--profile id] [--out dir] [--batch lô] | list | cancel|retry|remove|up|down <id> | clear-done | pause|resume|cancel-all [lô] | run [--daemon]`.

## 4. Thư mục tự động
Mặc định (tắt sẵn): `~/Movies/AI Video Studio/Thả video vào đây` → kết quả `…/Đã xong/<tên>/`, bản gốc chuyển sang `…/Đã xử lý/`. Thêm nhiều thư mục, mỗi thư mục một thương hiệu (phong cách). Thư mục canh `Tha vao day/` của mỗi Kho dùng phong cách của thương hiệu của Kho (Kho Chung → `chung`). Nhận `.mov .mp4 .m4v .mkv`; bỏ qua file ẩn, `.download/.crdownload/.part` (AirDrop/trình duyệt đang tải); file phải giữ nguyên dung lượng + giờ sửa **5 giây** mới được nhận.
Chạy khi Studio/app mở. **Chạy cả khi tắt app**: cài `~/Library/LaunchAgents/com.aivideostudio.watch.plist` (`queue.mjs run --daemon --role agent`, KeepAlive, nhật ký `~/Library/Logs/AIVideoStudio-watch.log`); bỏ chọn = `launchctl bootout` + xoá plist. Nhờ `queue.lock` không bao giờ có hai runner cùng xử lý. CLI: `node scripts/queue.mjs agent install|uninstall|status`.

## 5. Giao diện
Rail **Tự lái** (biểu tượng tên lửa): vùng thả lớn + **Chọn file** + đường dẫn; thẻ **Đang làm** với danh sách 12 bước (✓ / đang chạy / bỏ qua / cảnh báo, thời gian từng bước); **Hàng đợi**; **Thư mục tự động** (bật/tắt, ô đường dẫn + Mở trong Finder, thương hiệu cho từng thư mục, Chạy cả khi tắt app, Thông báo, Thả vào app = tự lái). Thẻ Hồ sơ kênh đã chuyển sang trang **Thương hiệu** (M133). Nút **Tự lái** trên thanh trên hiện % việc đang chạy. Mở thẳng: `http://localhost:5186/#tu-lai`.
**Chuẩn bị trước khi chạy** (S16 M121): thẻ trong panel chọn **Thương hiệu · Kho** (`__none` = không thương hiệu, Kho Chung, hoặc id brand kit; M133: thương hiệu quyết định luôn phong cách dựng, `''` cũ → thương hiệu của phong cách mặc định) kèm một dòng tóm tắt phong cách dựng + số điều đã học, nút **Sửa ở trang Thương hiệu** và **Học từ dự án này** và **Sản phẩm** (không bắt buộc). Lựa chọn nhớ ở `autopilot.json` (`brand`, `product`), gửi kèm mỗi video (`/api/autopilot/enqueue` thân `brand`/`product`, `/api/autopilot/upload?brand=&product=`), thành `--brand` / `--product` của `autopilot.mjs`. Bước `brand` dùng thương hiệu đã chọn (logo, màu, thẻ kết) và gắn sản phẩm vào `timeline.ads` (`on`, `product`, `industry`), nên QC kiểm claim quảng cáo. Không chọn gì thì panel nói rõ đang chạy không thương hiệu. Máy thiếu Claude CLI thì panel báo trước các bước sẽ bị bỏ qua (M120).
**Thả vào app = tự lái**: thả video vào biểu tượng AI Video Studio → `launcher.sh new` đưa vào hàng đợi (`/api/autopilot/enqueue`) rồi mở Studio ở panel Tự lái.

## 6. Giới hạn
- Cần Claude Code CLI cho AI dựng giúp, câu nói hỏng và nội dung đăng; thiếu CLI → các bước đó ghi cảnh báo, video vẫn xuất (không graphic AI / không caption).
- Thời gian thật (Mac mini M-series, clip 31–46 s, mặc định): ~1,5–2 phút/video; AI dựng giúp 30–45 s, render 1080p 15–25 s.
- “Học từ chỉnh sửa” chỉ đếm thống kê đơn giản, không đoán ý; vị trí cảnh bị kéo chỉ được ghi nhận, chưa tự áp.
- Không tự đăng lên mạng (xem Lịch đăng của A4 cho YouTube).
