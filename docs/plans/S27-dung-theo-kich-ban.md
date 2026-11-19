# S27 — Dựng video theo kịch bản (mood, A-roll, B-roll, SFX, chữ)

Lập 2026-11-19. Chủ repo: phần dựng video dựa vào kịch bản nhập vào để dựng mood, A-roll, B-roll, âm thanh hiệu ứng.
Bản này thay phạm vi cũ của `M191` (chỉ "kịch bản → mẫu dựng sẵn") bằng năm mục `M191`, `M193`–`M196` trong đợt `S27`
của `docs/ROADMAP.md`. Chưa có code; mỗi mục là một PR.

## 0. Hiện trạng (đọc trước khi làm)

| Phần | Ở đâu | Đang làm gì | Còn thiếu cho việc này |
|---|---|---|---|
| Tách dấu | `scripts/script_doc.mjs` `parseScript` (regex `MARK`) | `[HOOK]` `[CTA]` mở đoạn; `[CHỮ: …]` `[B-ROLL: …]` gắn vào đoạn → `segments[{kind, say, screen[], broll[]}]` | Không có mood, nhạc, A-roll, SFX; B-roll chỉ là chữ mô tả |
| Căn với lời nói | `alignScript`, `applyScript` | LCS sau khi bỏ dấu → `t0/t1/spoken/ratio` mỗi đoạn, `align.offscript[{t0,t1,text}]` | Chỉ một nguồn giọng; không biết đoạn nào thuộc take nào |
| Dấu cho AI | `scriptMarks`, `scriptPrompt`, `markMissing` | Prompt AI dựng có từng đoạn kèm giờ, CHỮ, B-ROLL | `markMissing` chỉ hỏi "có cảnh hình không" cho B-ROLL |
| AI dựng | `scripts/ai_edit.mjs` `buildPrompt` / `validate` / `applyPlan`; bản client `studio/features/20_ai.js` (áp lại ở trình duyệt, cùng luật) | Chọn gói, hook, 6–15 graphic, **một** `music {mood, gain}` cho cả video, 3–8 SFX, b-roll động `assets/broll/catalog.json` | Không lấy cảnh quay trong Kho; không đổi nhạc theo đoạn |
| Nhạc theo đoạn | `scripts/auto_sfx.py` `music_auto` | Đã có: chia đoạn ≥ 8 s theo phụ đề, mood mỗi đoạn (Claude hoặc từ khoá), `xfade .8`, `offset`, tối đa một lần đổi / 10 s, cất nền cũ vào `_was` của nền `_auto` đầu | Không đọc kịch bản; chọn mood từ lời nghe được |
| Tự hạ nhạc | `scripts/mix_audio.py` `duck_env`, `scripts/audio_defaults.mjs` `DEFAULT_DUCK` | `audio.duck = {on, amount_db, attack, release}` hạ theo VAD giọng | Đủ dùng, chỉ cần bảo đảm nền mới có `duck` |
| B-roll tự động | `scripts/auto_broll.mjs` | 11 nguồn, Kho (`BRoll/`, `Anh/`) xếp trên thư viện và stock, `_alts` "Phương án khác", `_auto` | Chọn chỗ chèn theo vai câu, không theo dấu kịch bản |
| Kho | `scripts/kho_media.mjs` `searchKho`, `scoreRel`, `tagsOf`, `useFromKho`, `khoMusicPick` | Tìm theo tên file / thư mục / thẻ thư viện, liên kết cứng vào `media/kho_*` | — dùng lại nguyên |
| Mẫu khớp lời | `scripts/tpl_fit.mjs` | `[HOOK]`→cảnh mở, `[CTA]`→cảnh cuối, `[CHỮ]`→ô chữ, `[B-ROLL]`→từ khoá ảnh | — dùng lại cho chế độ trước khi quay |
| QC | `scripts/ai_qc.mjs` `scriptIssues` | `script_unspoken`, `script_drift`, `script_mark` | Không kiểm dấu mới |
| Tự lái | `scripts/autopilot.mjs` bước `script` (sau `fillers`, trước `ai`) | Áp kịch bản chờ, thay phụ đề | Không dựng theo bảng |
| Mẫu thương hiệu | `M189`: `brand_id` của mẫu, `tpl` của brand kit | Áp mẫu mặc định khi tạo video mới | — chế độ trước khi quay lưu thành mẫu này |
| Nhiều clip | `TL.clips` (`references/clips.md`), `scripts/multicam.py` | Track chính nhiều clip có `in/out/zoom/ox/oy`; multicam chọn người nói theo âm lượng | Không có "nhiều take của cùng một đoạn" |

Nguyên tắc giữ nguyên từ `references/script.md` mục 4: **mẫu / gói quyết định giao diện, kịch bản quyết định nội dung**; chữ của dấu thắng chữ Claude tự nghĩ.

## 1. Dấu mới trong kịch bản

Mọi dấu cũ giữ nguyên nghĩa. Dấu mới cùng cú pháp `[TÊN: giá trị | tuỳ chọn]`, không phân biệt hoa / thường, nhận cả không dấu
(`fold`). Phần sau `|` là tuỳ chọn; giá trị lạ thì giữ chữ gốc trong `raw` và QC báo, không làm hỏng việc tách.

| Dấu | Tên khác nhận được | Ví dụ | Gắn vào | Ý nghĩa |
|---|---|---|---|---|
| `[MOOD: …]` | `[KHÔNG KHÍ: …]` | `[MOOD: hồi hộp]` | đoạn đang viết **và các đoạn sau** tới dấu MOOD kế | Mood nhạc từ đây; chữ tự do, ánh xạ về mood của `assets/music/catalog.json` bằng `moodWords` / bảng đồng nghĩa (hồi hộp → `suspense`, vui → `happy`…), không khớp thì Claude chọn ở bảng dựng |
| `[NHẠC: tắt]` | `[NHAC: …]`, `[MUSIC: …]` | `[NHẠC: tắt]` `[NHẠC: đổi]` `[NHẠC: to]` `[NHẠC: kho Bài A]` | đoạn đang viết | `tắt`: im nhạc trong đoạn (fade 0,5 s); `bật`: lại nhạc sau `tắt`; `đổi`: chuyển bài mới cùng mood (xfade); `to` / `nhỏ`: ±4 dB so với nền trong đoạn; `kho <tên>`: bài trong Kho của thương hiệu (`khoMusicPick`) |
| `[A-ROLL: …]` | `[AROLL: …]`, `[QUAY: …]` | `[A-ROLL: cận mặt]` `[A-ROLL: clip 2]` `[A-ROLL: rộng \| take 3]` | đoạn đang viết | Cỡ khung: `cận mặt` / `cận` / `trung` / `rộng` (zoom quanh `TL.face`, như bám mặt); nguồn: `clip N` / `take N` / tên file trong `Nguon/` của Kho; `bỏ`: không dùng hình người nói ở đoạn này (B-roll phủ hết) |
| `[B-ROLL: … \| nguồn]` | như cũ | `[B-ROLL: căn hộ \| kho]` `[B-ROLL: bàn làm việc \| ảnh AI]` `[B-ROLL: số liệu \| động]` | như cũ | Mô tả như cũ; tuỳ chọn nguồn `kho`, `stock`, `ảnh AI`, `động` (b-roll động catalog), `tệp <tên>`; không ghi thì theo thứ tự mục 2.2 |
| `[SFX: …]` | `[ÂM: …]`, `[HIỆU ỨNG: …]` | `[SFX: whoosh]` `[SFX: tiếng chuông \| cuối]` | đoạn đang viết | Tên SFX của `assets/sfx/catalog.json` hoặc mô tả (Claude / từ khoá ánh xạ); vị trí `đầu` (mặc định, lúc đoạn bắt đầu), `cuối`, hoặc `@<từ>`: lúc nói từ đó |
| `[CHỮ: … \| kiểu]` | như cũ | `[CHỮ: 90% bị hớ \| số]` | như cũ | Tuỳ chọn kiểu gợi ý khối: `số`, `danh sách`, `trích dẫn`, `tiêu đề`, `giá`; không ghi thì gói chọn như cũ |

Đoạn dữ liệu mở rộng (thêm trường, không đổi trường cũ để `tpl_fit`, `gateShape`, QC cũ chạy như trước):

```json
{ "kind": "body", "say": "…", "screen": ["90% bị hớ"], "broll": ["căn hộ chung cư"],
  "mood": "hồi hộp", "music": "doi", "aroll": { "frame": "can", "take": 2 },
  "brollSrc": ["kho"], "sfx": [{ "name": "whoosh", "at": "dau" }], "screenKind": ["so"],
  "raw": ["[NHẠC: lạ]"] }
```

- `mood` được kế thừa khi dựng bảng (mục 2), **không** chép vào từng đoạn trong `script.json` (sửa một dấu MOOD đổi mọi đoạn sau).
- Dấu không phải chữ nói, nên không vào phụ đề và không vào claim gate (trừ `CHỮ` như cũ).
- `scriptPrompt` thêm dòng `· MOOD`, `· NHẠC`, `· A-ROLL`, `· SFX` khi có.

### 1.1 Claude gợi ý dấu cho kịch bản trơn

Ô Kịch bản có nút **Gợi ý dấu** (chỉ khi có Claude): gửi chữ kịch bản (không gửi video) + thương hiệu + lĩnh vực + khổ, Claude trả
lại **chính chữ đó** chèn thêm dấu. Luật kiểm sau khi nhận (hàm thuần `checkSuggested(orig, out)`):

1. Bỏ mọi dấu ở cả hai bản rồi so chữ nói: phải trùng sau `norm` (Claude không được sửa lời). Lệch → bỏ kết quả, báo "Claude đã sửa lời, không áp".
2. Mỗi đoạn tối đa 1 MOOD, 2 CHỮ, 2 B-ROLL, 2 SFX; MOOD đổi tối đa một lần / ~10 s đọc (ước theo tốc độ đọc, mục 5.1); không dấu A-ROLL `clip N` (Claude không biết các take).
3. Hiện dạng so sánh (dấu thêm được tô màu), người dùng **Nhận hết** / **Bỏ** / sửa tay rồi Lưu. Không tự lưu đè kịch bản.

Không có Claude: không hiện nút (bảng dựng ở mục 2 vẫn tự điền được bằng luật đơn giản).

## 2. Bảng dựng theo đoạn

### 2.1 Dữ liệu

`<dự án>/.studio/build_sheet.json`, sinh từ kịch bản đã căn (có `t0/t1`) + dấu + gợi ý của Claude cho ô trống:

```json
{ "version": 1, "script_updated": "…", "at": "…", "rows": [
  { "seg": 0, "t0": 0, "t1": 3.4, "kind": "hook", "say": "Bạn có biết…",
    "mood":  { "v": "suspense", "from": "mark" },
    "music": { "v": "bed", "from": "auto" },
    "aroll": { "frame": "can", "take": null, "from": "mark" },
    "broll": [{ "q": "căn hộ chung cư", "src": "kho", "pick": "BRoll/can-ho-01.mp4", "alts": ["stock:…", "ai:…"], "from": "mark" }],
    "sfx":   [{ "name": "whoosh_2", "at": 0, "from": "claude" }],
    "screen":[{ "text": "90% bị hớ", "kind": "so", "from": "mark" }],
    "lock": false } ] }
```

- `from`: `mark` (dấu trong kịch bản), `claude`, `auto` (luật), `user` (sửa trên bảng). Lần dựng lại chỉ thay ô `claude` / `auto`;
  ô `mark` theo dấu mới; ô `user` giữ (cùng tinh thần `_orig`). `lock: true` = cả hàng không đổi.
- Kịch bản sửa sau khi dựng bảng (`script_updated` khác): hàng nào lời không đổi (so `norm(say)`) giữ ô `user`; hàng mới / đổi lời thì dựng lại ô đó.
- Không lưu đường dẫn ra ngoài dự án: `pick` là đường dẫn tương đối trong Kho, chỉ liên kết vào `media/kho_*` lúc **Áp** (`useFromKho`).

### 2.2 Thứ tự nguồn B-roll

Mỗi ô B-roll tìm theo thứ tự, dừng ở nguồn đầu có kết quả đủ điểm; 2–3 kết quả kế giữ ở `alts` để đổi bằng một bấm:

1. **Kho của thương hiệu** (`searchKho` nhóm `broll`, `image`; điểm theo tên file / thư mục / thẻ thư viện), loại file đã dùng trong video.
2. **Thư viện cá nhân** (`broll_lib.mjs`).
3. **Stock** (`ai_broll.mjs` `search`, video trước, ảnh sau; cần mạng, theo `net_guard`).
4. **Ảnh AI** (`genImage`, chỉ khi có khoá; không tự sinh lúc dựng bảng, chỉ tạo khi người dùng bấm hoặc lúc Áp; ước giá hiện trên bảng).
5. **B-roll động** của catalog (`assets/broll/catalog.json`, luôn có): chốt chặn cuối.

Tuỳ chọn nguồn ở dấu (`| kho`, `| stock`…) chỉ dùng nguồn đó; không có kết quả thì ô đỏ "Kho không có cảnh khớp", không tự rơi xuống nguồn khác.

### 2.3 Giao diện

Panel **Bảng dựng** (tab của ô Kịch bản ở bước Dựng, và mở được từ tab Claude): mỗi hàng một đoạn, cột Lời (rút gọn, bấm thì nhảy tới giờ đó),
Mood, Nhạc, A-roll, B-roll (ảnh nhỏ + nguồn + "Đổi"), SFX (nút nghe thử), Chữ. Mỗi ô sửa được bằng danh sách chọn; cột B-roll có
"Tìm khác" / "Chọn từ Kho". Đầu bảng: **Dựng lại ô trống** (Claude), **Áp lên timeline**, **Hoàn tác lần áp**.
Kiểm bằng số đo theo `responsive-layout` ở 1280 px: bảng cuộn dọc trong panel, không cuộn ngang trang.

### 2.4 Áp lên timeline

Hàm thuần `sheetToPlan(sheet, tl, caps)` → cùng dạng `plan` của `ai_edit.mjs` (`scenes`, `music`, `sfx`, + mới `clips` cho A-roll), rồi đi qua
`validate` + `applyPlan` sẵn có, nên:

- mọi mục sinh ra có `_ai: true` và `_sheet: <seg>`; người dùng sửa thì có `_orig` như mọi mục khác và lần Áp sau giữ lại;
- một lần Áp = **một bước hoàn tác** (đi qua `pushUndo` của Studio), thẻ khay việc có Hoàn tác như AI dựng (`M185`);
- AI dựng (`ai_edit.mjs`) khi có bảng dựng: prompt nhận bảng thay cho dấu thô, các ô `mark` / `user` là ràng buộc cứng, Claude chỉ lấp phần trống
  và đặt graphic ngoài các ô đã chốt. Không có bảng thì chạy như hiện nay.
- `applyPlan` có hai bản (server `ai_edit.mjs` và client `20_ai.js`): sửa cả hai trong cùng PR, test so kết quả hai bản trên cùng đầu vào.

## 3. Nhạc theo đoạn, vẫn một nền nhạc tự sinh

Bài học `ai-video-studio-020` (hai nền nhạc chạy chồng): **mỗi nguồn tự sinh (`_ai`, `_auto`) phải thay nguồn kia và cất bản cũ vào `_was`;
chỉ nhạc file / tay được giữ song song.** Thiết kế:

- Bảng dựng sinh **một nền nhạc gồm nhiều khúc**, đúng dạng `music_auto` đã ghi: `[{t0, t1, mood, gain, offset, xfade, fade_in, fade_out, _ai: true, _sheet: true}]`,
  các khúc nối liền phủ cả video. Khúc đầu mang `_was` = các nền `_ai` / `_auto` / nhạc khởi đầu bị thay (giữ nhạc `isUserMusic`).
- Hàm thuần `musicFromSheet(rows, dur, catalog)` (ở `script_doc.mjs` hoặc file mới `scripts/script_build.mjs`): mood kế thừa theo hàng, gộp hàng kề cùng mood,
  tối đa một lần đổi / 10 s (như `music_auto`; ngắn hơn thì dời mốc đổi tới ranh giới đoạn gần nhất, QC báo), `NHẠC: tắt` → khoảng trống
  với fade 0,5 s, `đổi` → khúc mới cùng mood, `offset` khác, `to` / `nhỏ` → gain khúc ±4 dB, giới hạn −30…−10 dB.
- `auto_sfx.py music_auto`: thấy nền có `_sheet` thì **bỏ qua** (báo "giữ nhạc theo kịch bản"), không tự chia lại theo lời nghe được.
  "Xoá phần tự động" của panel Tự động không đụng nền `_sheet`; **Hoàn tác lần áp** của bảng dựng trả `_was`.
- `isUserMusic` không đổi: người dùng sửa mood / gain một khúc → khúc đó có `_orig`, lần Áp sau giữ **cả nền** (không ghép nửa nền cũ nửa nền mới),
  bảng dựng hiện "Nhạc đã chỉnh tay, Áp không thay nhạc" kèm nút "Thay nhạc theo bảng".
- **Tự hạ nhạc dưới giọng**: lúc Áp, nếu `audio.duck` chưa là object thì đặt `DEFAULT_DUCK` (`audio_defaults.mjs`); gain mặc định khúc lấy
  `DEFAULT_MUSIC_GAIN`. QC hiện có (nhạc quá nhỏ / quá to so với giọng) đo trên bản trộn nên tự phủ nền nhiều khúc.
- Nhạc trong Kho (`NHẠC: kho …` hoặc mood khớp bài trong Kho): dùng `khoMusicPick`, như AI dựng đang làm với một nền.

## 4. A-roll

### 4.1 Bỏ đoạn ngoài kịch bản

`align.offscript` đã có khoảng `{t0, t1, text}` (≥ 5 từ nghe được liền nhau không có trong kịch bản). Bảng dựng có dòng đầu
"Lời ngoài kịch bản: n đoạn, x s" với danh sách đánh dấu được; **Cắt các đoạn đã chọn** đi qua hàm cắt khoảng thời gian đã có trong
`20_ai.js` (cắt `TL.clips` ở hai mép, bỏ phần trong, dời mọi thứ sau; một bước hoàn tác). Mặc định **không** chọn sẵn đoạn nào
(lời ngoài kịch bản có thể là câu ứng biến hay); mốc `t0/t1` nới 0,15 s về phía khoảng lặng để không cắt mất âm đầu / cuối từ.
Sau khi cắt: căn lại kịch bản với phụ đề đã cắt (`applyScript` theo nhánh "đã cắt / đổi tốc độ" hiện có).

### 4.2 Nhiều take cho cùng kịch bản

Người dùng quay lại một đoạn nhiều lần (nhiều file trong `Nguon/` hoặc nhiều clip nguồn của dự án):

1. Mỗi take nhận dạng lời một lần (job nền mới `script_takes` trong `scripts/queue.mjs`, kết quả cache theo hash file ở `.studio/takes/<hash>.json`).
2. `alignTakes(segments, takes)`: căn từng take với **mọi** đoạn (LCS như `alignScript`), mỗi cặp (đoạn, take) có `ratio`, `t0/t1` trong take,
   số từ thừa / lỗi nói (đếm theo `fillers.py` nếu đã chạy), độ dài.
3. Chọn take mỗi đoạn: dấu `[A-ROLL: clip N]` thắng; không có thì điểm = `ratio` (chính) − phạt lỗi nói − phạt đoạn bị cắt cụt (đầu / cuối đoạn
   không khớp), hoà thì take **sau** (thường là lần quay tốt hơn). Đoạn không take nào đạt 30 % → hàng đỏ "chưa quay".
4. Ra `TL.clips` nối theo thứ tự kịch bản: mỗi đoạn một clip `{src, audio, in, out}` của take đã chọn, cỡ khung từ `aroll.frame`
   (`zoom` / `ox` / `oy` quanh mặt của take đó; chưa dò mặt thì giữ `cover`). Bảng dựng cho đổi take từng hàng (nghe thử đoạn đó).
5. Một take dài chứa cả kịch bản là trường hợp riêng của bước này (một take, chỉ cắt phần ngoài kịch bản), nên 4.1 và 4.2 dùng chung đường áp.

Không tự xoá file take; các take không dùng vẫn ở `Nguon/`. Giọng nối giữa các take đi qua `mix_audio.py` nhánh `clips` hiện có
(crossfade âm 30 ms ở mép để không tách tiếng); khác mức âm giữa take do `voice_clean` / loudnorm sẵn có lo.

## 5. Hai chế độ

### 5.1 Trước khi quay: mẫu dựng sẵn (`M191`)

Đầu vào: kịch bản (chữ / .docx, có hoặc không dấu) + thương hiệu + khổ. Chưa có video.

- Thời lượng mỗi đoạn theo tốc độ đọc: mặc định 2,6 từ/giây (≈ 156 wpm, tiếng Việt nói rõ), đổi được 2,0–3,4; nghỉ 0,4 s giữa đoạn. Hàm thuần `estimateTimes(segments, wps)`
  ghi `t0/t1` dự kiến với `align.mode: "estimate"` (khác `whisper` / `even`), nên mọi luồng sau đọc như kịch bản đã căn.
- Bảng dựng sinh như mục 2 trên giờ dự kiến; Claude dựng **3 phương án** khác nhau rõ (ví dụ: gói / nhịp graphic / mood nền), mỗi phương án là
  một `plan` qua `validate` + kiểm engine (`fx_audit`) + QC tĩnh (`staticIssues`, không cần bản trộn). Xem bằng khung ảnh tĩnh
  (`63_frames`, 4–6 khung / phương án) đặt cạnh nhau.
- Chọn một → lưu thành **mẫu của thương hiệu** (`brand_id` của `M189`, ô `placeholder` cho A-roll) hoặc **dùng cho video mới** (tạo dự án
  không video, A-roll là ô chờ). Kèm **danh sách quay** (shot list) xuất được ra `.txt`: mỗi đoạn lời + cỡ khung + ghi chú B-roll cần quay.
- Quay xong: thả video vào dự án → căn kịch bản thật → `27_tplfit` canh mẫu theo giọng thật (đã có) → bảng dựng dời giờ theo `t0/t1` thật, giữ các ô đã chọn.

### 5.2 Sau khi quay (`M193`–`M196`)

Video (một hoặc nhiều take) + kịch bản → căn (đã có) → bảng dựng → sửa → Áp. Tự lái: bước `script` sinh bảng dựng (không Claude thì chỉ
từ dấu + luật), bước `ai` đọc bảng thay cho dấu thô; chọn take và cắt lời ngoài kịch bản **không** chạy trong Tự lái (cần người duyệt),
chỉ ghi vào `summary.json` để thẻ việc báo "Có 3 đoạn lời ngoài kịch bản, mở Bảng dựng để cắt".

## 6. Chia mục, thứ tự, tệp nóng, rủi ro

| Mục | Nội dung | Tệp chính | Ước dòng | Tệp nóng | Sau |
|---|---|---|---|---|---|
| `M193` | Dấu mới (mục 1) trong `parseScript` + `scriptPrompt` + `scriptMarks`; `build_sheet.json` và `buildSheet` thuần (mục 2.1, 2.2 không gồm ảnh AI); Gợi ý dấu (1.1); `references/script.md` | `scripts/script_doc.mjs`, `scripts/script_build.mjs` (mới), `studio/routes/19_script.mjs`, `studio/features/19_script.js`, test `s27_m193` | 500–700 | không | — |
| `M194` | Panel Bảng dựng (2.3), `sheetToPlan` + Áp `_ai` một bước hoàn tác (2.4), AI dựng đọc bảng, QC dấu mới (`script_mark` cho SFX / A-roll / B-roll theo nguồn) | `studio/features/23_buildsheet.js` + `studio/routes/23_buildsheet.mjs` (mới), `scripts/ai_edit.mjs`, `studio/features/20_ai.js`, `scripts/ai_qc.mjs` | 600–800 | `scripts/ai_qc.mjs` | `M193` |
| `M195` | Nhạc theo đoạn (mục 3): `musicFromSheet`, `_was`, `_sheet`, `music_auto` bỏ qua nền `_sheet`, đặt `duck` | `scripts/script_build.mjs`, `scripts/ai_edit.mjs` + `studio/features/20_ai.js` (`applyPlan` hai bản), `scripts/auto_sfx.py`, test hồi quy cạnh `build_quality.test.mjs` | 300–450 | không | `M194` |
| `M196` | A-roll (mục 4): cắt lời ngoài kịch bản, job `script_takes`, `alignTakes`, chọn take, ra `TL.clips`, cỡ khung | `scripts/script_doc.mjs` / `script_build.mjs`, `scripts/queue.mjs` (một loại job), `studio/features/23_buildsheet.js` | 600–800 | `scripts/queue.mjs` | `M194`; song song được với `M195` (khác vùng; cùng `23_buildsheet.js` thì làm nối tiếp) |
| `M191` | Trước khi quay (mục 5.1): `estimateTimes`, 3 phương án, khung tĩnh, lưu mẫu thương hiệu / video mới, danh sách quay | `scripts/script_build.mjs`, route + feature mới `24_scriptdraft`, `scripts/queue.mjs` (job `script_draft`) | 600–800 | `scripts/queue.mjs` | `M194`, `M195`; sau `M196` nếu cùng sửa `queue.mjs` |
| `M192` | Claude nhớ gu thương hiệu (giữ như cũ), thêm: ô bảng dựng người dùng đổi (`from: user`) là tín hiệu học | như mục cũ | — | — | `M191` |

Thứ tự: `M193` → `M194` → (`M195` ∥ `M196`) → `M191` → `M192`. `M190` (Style Lab theo thương hiệu) song song được với cả chuỗi (khác file).

Tệp nóng: `scripts/ai_qc.mjs` chỉ `M194` sửa (gom mọi kiểm QC của dấu mới vào đó; mục sau cần thêm kiểm thì thêm vào bảng dựng, không vào QC);
`scripts/queue.mjs` chỉ `M196` rồi `M191` (mỗi PR thêm đúng một loại job, không đổi lõi hàng đợi); **không mục nào sửa `studio/server.mjs`**
(route mới nạp tự động từ `studio/routes/*.mjs`). `docs/ROADMAP.md`: mỗi PR chỉ sửa dòng của mục mình.

Rủi ro:

- **Hai nền nhạc chồng** (bài học `ai-video-studio-020`): `M195` thêm nguồn tự sinh thứ ba (`_sheet`); test bắt buộc: AI dựng → Tự động → Áp bảng (mọi thứ tự)
  luôn còn đúng một nền phủ cả video + nhạc file / tay; Hoàn tác trả đúng `_was`.
- **`applyPlan` hai bản lệch** (server / client): test so hai bản trong `M194` và `M195`.
- **Claude sửa lời khi gợi ý dấu**: chặn bằng `checkSuggested` (mục 1.1), không bao giờ ghi đè kịch bản khi chưa bấm Nhận.
- **Cắt nhầm lời thật**: không chọn sẵn đoạn ngoài kịch bản, không cắt trong Tự lái; một bước hoàn tác. Bài học `ai-video-studio-041`: Whisper có thể bịa
  lời trên đoạn chỉ có nhạc, nên đoạn "ngoài kịch bản" trên vùng không lời bị loại khỏi danh sách cắt (kiểm hình dạng mốc thời gian từ).
- **Cờ một lần** (bài học `ai-video-studio-040`): nếu bảng dựng thêm cờ trong timeline (vd `_sheet_pending`), mọi luồng không giao diện (Tự lái, batch, highlights) phải tiêu hoặc xoá nó.
- **Liên kết cứng Kho**: `pick` trong bảng là đường dẫn Kho, chỉ `useFromKho` lúc Áp; không ghi đè `media/kho_*`.
- **Chi phí**: ảnh AI chỉ tạo khi bấm / Áp; Claude gọi tối đa một lần cho Gợi ý dấu và một lần cho bảng dựng (không mỗi hàng một lần).
- **Take nhiều, dài**: nhận dạng mỗi take là job nền có Dừng (`M185`/`M186`); cache theo hash để sửa kịch bản không nhận dạng lại.

Verify mỗi mục: `node --check` file đổi, test `scripts/tests/s27_m19x.test.mjs` (hàm thuần: tách dấu, bảng, nhạc, take), `python -m unittest discover -s scripts/tests`
khi đụng `auto_sfx.py`, `node .rag/sync.js --check`; mở Studio thử luồng trên `sample/` (kịch bản có đủ dấu, hai take), render một video mẫu ở `M195` / `M196`.

## 7. Kịch bản dạng bảng (Excel / CSV) và chỉ dẫn dựng (`M197`)

Chủ repo 2026-11-19: phần lớn kịch bản viết cho source là file Excel chia theo đoạn giây, mỗi đoạn có lời và chỉ dẫn chữ tự do
("tìm thêm source này", "chuyển cảnh như này", "focus vào sản phẩm / người nói", "thêm ví dụ khi giới thiệu cái này").

- **Bảng → chữ kịch bản** (`scripts/script_table.mjs`): chữ kịch bản vẫn là bản duy nhất người dùng sửa và lưu; bảng chỉ là cách nhập.
  Mỗi hàng một đoạn (dòng trống tách); cột nhận theo tên không dấu, cột lạ hỏi người dùng gán. Mốc giây → `[MỐC: …]`, chỉ dẫn →
  `[GHI CHÚ: …]` (hai dấu mới, không phải lời nói). Hình / source có chữ người nói + cỡ khung → `[A-ROLL]`, còn lại → `[B-ROLL]`
  ("tìm …" → `| stock`, tên file → `| tệp`).
- **Mốc giây**: segment có `at {t0, t1}`. Không lời nghe được (video không lời, mẫu trước khi quay): giờ của đoạn = mốc bảng, đoạn không mốc
  chia khoảng trống. Có lời: giờ theo lời nói thắng, `align.drift` liệt kê đoạn lệch mốc > 2 s. Chưa căn: bảng dựng lấy `t0/t1` từ mốc.
- **Chỉ dẫn → ô bảng dựng**: luật thuần trước, Claude chỉ nhận các vế luật chưa hiểu (một lần gọi cho cả kịch bản, chỉ gửi lời + chỉ dẫn).
  Ô: `aroll.frame`, `focus {on: product|speaker, target}`, `transition {v}`, `broll[]` cần tìm (`miss`), `screen[]` kind `vidu`; mọi ô
  `from: claude` (+ `by: luat|claude`). Người dùng tick Nhận; `mergeSheet` giữ ô chỉ dẫn (`from: claude` có `by`) như ô `user` khi lời của hàng không đổi.
  `focus` / `transition` mới chỉ nằm trong bảng; áp lên timeline do panel Bảng dựng (`M194`) và mục sau quyết định.
