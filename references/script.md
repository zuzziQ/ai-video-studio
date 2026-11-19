# Kịch bản có sẵn (S17 M123)

Người dùng đã viết sẵn lời: dán chữ hoặc mở `.txt` / `.docx` ở ô **Kịch bản** (thẻ Video nguồn của bước Nguồn, hoặc thẻ
*Chuẩn bị trước khi chạy* của Tự lái). Không bắt buộc: không có kịch bản thì mọi thứ chạy như cũ.
Mã: `scripts/script_doc.mjs` (lõi), `studio/routes/19_script.mjs`, `studio/features/19_script.js`, test `scripts/tests/s17_script.test.mjs`.

## 1. Viết kịch bản
```
[HOOK] Bạn có biết 90% người mua nhà lần đầu bị hớ?
[CHỮ: 90% bị hớ]

Hôm nay mình chia sẻ ba kinh nghiệm.
[B-ROLL: căn hộ chung cư]

[CTA] Theo dõi kênh để xem tiếp nhé.
```
- `[HOOK]` mở đoạn mở đầu, `[CTA]` mở đoạn kêu gọi; `[CHỮ: …]` (cũng nhận `[CHU: …]`, `[TEXT: …]`) là chữ trên màn hình của đoạn
  đang viết, `[B-ROLL: …]` (`[BROLL: …]`) là hình minh hoạ của đoạn. Dấu đứng trước đoạn đầu tiên gắn vào đoạn kế tiếp.
- Không dấu vẫn dùng được: dòng trống tách đoạn; chữ không có dòng trống nào thì mỗi dòng là một đoạn. Gạch đầu dòng / số thứ tự bị bỏ.
- `.docx` đọc thẳng `word/document.xml` (không cần thư viện): mỗi đoạn Word một dòng. Tối đa 60 000 ký tự, file ≤ 10 MB.

## 2. Lưu
`<dự án>/.studio/script.json`: `{ version, text (chữ gốc), name, updated, segments: [{ kind: hook|body|cta, say, screen[], broll[],
t0, t1, spoken, ratio }], align: { mode: whisper|even, at, words, matched, offscript: [{t0, t1, text}] }, gate? }`.
Lần đầu thay phụ đề, phụ đề nhận dạng được sao lưu ở `.studio/captions_noscript.json` (kèm `heardDur` = độ dài timeline lúc đó); **Bỏ** kịch bản trả lại bản đó.
Sửa kịch bản rồi lưu lại: căn với bản sao lưu này (không với phụ đề đã theo kịch bản) khi timeline chưa đổi độ dài; đã cắt / đổi tốc độ thì căn với phụ đề hiện có.

## 3. Phụ đề theo đúng chữ kịch bản
Lời nghe được (chữ của phụ đề hiện có, hoặc lời vừa nhận dạng lại ở "Tạo lời thoại tự động") chỉ cho **thời điểm**:
chữ kịch bản khớp với từ nghe được bằng LCS sau khi bỏ dấu (như `topic_video.mjs` alignLine, `references/longform-topic.md` mục 3);
chữ không khớp (vd "90%" đọc thành "chín mươi phần trăm") chia theo số ký tự giữa hai chữ khớp kề bên. Phụ đề ≤ 4 từ/dòng,
ngắt ở dấu câu, cuối đoạn và chỗ nghỉ > 0,7 s, giữ nguyên chữ hoa / thường của kịch bản.
- Đoạn ≥ 3 chữ mà < 30 % chữ nghe được (đoạn < 3 chữ: không chữ nào) = **chưa nói**: không đặt phụ đề, QC báo.
- ≥ 5 từ nghe được liền nhau không có trong kịch bản (và không có chữ kịch bản nào rơi vào đó) = **nói ngoài kịch bản**: giữ phụ đề
  nghe được ở đó (`_offscript`), QC báo.
- Video không lời (`timeline.speech.none`, M119): chia đều phần video (trước thẻ kết) cho các đoạn, trong đoạn chia theo số ký tự.
  Tự lái khi đó không bỏ qua bước `ai` / `broll` nữa vì đã có chữ.
- Dự án chưa có lời thoại: chỉ lưu kịch bản (`pending`), "Tạo lời thoại tự động" sẽ căn.

## 4. AI dựng và Bám lời thoại
Mẫu / gói quyết định giao diện (bố cục, màu, kiểu chữ, hiệu ứng), kịch bản quyết định nội dung; mâu thuẫn thì chữ theo kịch bản, kiểu theo mẫu.
- `ai_edit.mjs`: prompt có các đoạn kèm giờ và dấu + luật kịch bản; `validate` giữ nguyên chữ phụ đề (chỉ nhận `hl` / `br`), hook
  = chữ `[CHỮ]` của đoạn `[HOOK]` (không có thì lời đoạn đó, ≤ 60 ký tự); dấu chưa có cảnh tương ứng ghi vào `plan.dropped` và `plan.script.missing`.
- `tpl_fit.mjs`: `[HOOK]` vào cảnh mẫu mở đầu, `[CTA]` vào cảnh cuối, `[CHỮ]` vào cảnh trùng giờ nhiều nhất (thay ô chữ đầu tiên, vẫn cắt
  theo độ dài ô), `[B-ROLL]` thành từ khoá tìm ảnh của cảnh có ô ảnh trùng giờ. Chữ của dấu thắng chữ Claude / tự động.

## 5. QC và claim gate
`ai_qc.mjs scriptIssues` (trong `staticIssues`): `script_unspoken` (đoạn chưa nói), `script_drift` (đoạn < 75 % chữ khớp, lời ngoài
kịch bản), `script_mark` (dấu chưa có cảnh quanh giờ của đoạn). Chỉ báo, không tự sửa.
Dự án quảng cáo (`timeline.ads.on`, có sản phẩm): `gateScript` soát lời + chữ màn hình của kịch bản bằng `script_gate.checkScript`
(`ad_gates.py --script`, M22) khi lưu kịch bản (route trả `gate`, thẻ hiện lỗi), ở bước `script` của Tự lái (ghi chú) và trong QC
(lỗi của chữ màn hình, không trùng mã với lỗi ad_gates của dự án; không chạy lại khi soát lại sau sửa).

## 6. Tự lái
Thẻ Chuẩn bị có ô Kịch bản "cho video kế tiếp": khi thêm video (đường dẫn hoặc kéo thả, chỉ video đầu tiên), chữ được lưu thành
kịch bản chờ `$AVS_HOME/scripts/<id>.json` (`POST /api/script/stage`), job mang `opts.script = <id>` (route kiểm id `s-[a-z0-9]{6,40}`),
`argsFor` → `--script <id>` (chỉ id, chuỗi khác bị bỏ), rồi ô tự xoá. Kịch bản chờ cũ hơn 30 ngày được dọn khi lưu kịch bản chờ mới. Bước `script` (sau `fillers`, trước `ai`) ghi `.studio/script.json` và thay phụ đề.
Gọi tay `autopilot.mjs`: `--script` nhận cả đường dẫn `.txt` / `.docx` / `.json` (`{text}`).

## 7. Dấu dựng và bảng dựng (S27 M193)
Thiết kế: `docs/plans/S27-dung-theo-kich-ban.md` mục 1, 1.1, 2.1, 2.2. Mã: `scripts/script_doc.mjs` (tách dấu), `scripts/script_build.mjs`
(bảng dựng, gợi ý dấu), test `scripts/tests/s27_m193.test.mjs`. AI dựng theo dấu và ghi chú trên khối: mục 8 (`M194`).

| Dấu | Tên khác | Trường của đoạn |
|---|---|---|
| `[MOOD: hồi hộp]` | `[KHÔNG KHÍ: …]` | `mood` (chữ gốc; kế thừa cho các đoạn sau khi dựng bảng, không chép vào `script.json`) |
| `[NHẠC: tắt\|bật\|đổi\|to\|nhỏ\|kho <tên>]` | `[NHAC]`, `[MUSIC]` | `music`: `tat`, `bat`, `doi`, `to`, `nho`, `kho` / `kho:<tên>` |
| `[A-ROLL: cận mặt\|trung\|rộng\|clip N\|take N\|<tệp>\|bỏ]` | `[AROLL]`, `[QUAY]` | `aroll: { frame: can\|trung\|rong, take, file, off }` |
| `[B-ROLL: … \| kho\|stock\|ảnh AI\|động\|tệp <tên>]` | như cũ | `broll[]` + `brollSrc[]` song song (`kho`, `stock`, `ai`, `dong`, `tep:<tên>`, null) |
| `[SFX: … \| đầu\|cuối\|@từ]` | `[ÂM]`, `[HIỆU ỨNG]` | `sfx: [{ name, at: dau\|cuoi\|@từ }]` |
| `[CHỮ: … \| số\|danh sách\|trích dẫn\|tiêu đề\|giá]` | như cũ | `screen[]` + `screenKind[]` song song (`so`, `danhsach`, `trichdan`, `tieude`, `gia`) |

Trường mới chỉ có khi có dấu (trường cũ không đổi). Giá trị lạ: dấu gốc vào `raw[]`, ô Kịch bản báo "Dấu chưa hiểu". Dấu mới không có
giá trị (`[âm]`) và ngoặc khác (`[cười]`) vẫn là lời nói. `stripMarks` bỏ mọi dấu. `scriptMarks` thêm kind `mood|music|aroll|sfx`
(`markMissing` bỏ qua các kind này); `scriptPrompt` thêm dòng `· MOOD`, `· NHẠC`, `· A-ROLL`, `· SFX`.

**Bảng dựng** `<dự án>/.studio/build_sheet.json` `{ version: 1, script_updated, at, rows: [{ seg, t0, t1, kind, say, mood {v, text, from,
inherit?}, music {v, from}, aroll {frame, take, file?, off?, from}, broll [{q, src, pick, alts, miss?, pending?, from}], sfx [{name, q, at
(giây), pos, miss?, from}], screen [{text, kind, from}], lock }] }`. `from`: `mark|claude|auto|user|note` (`note`: chỉ dẫn [GHI CHÚ], mục 9). Tự dựng lại mỗi lần lưu kịch bản
(`POST /api/script`), `POST /api/script/sheet {stock}` dựng lại tay; Bỏ kịch bản xoá bảng. Dựng lại giữ ô `user` khi lời của hàng không
đổi (so `norm(say)`), giữ nguyên hàng `lock`. B-roll: Kho (`searchKho`, bỏ file đã vào `media/`) → thư viện (`broll_lib.search`) → stock
(chỉ khi `stock: true`) → b-roll động `assets/broll/catalog.json` (luôn có); nguồn ép ở dấu chỉ dùng nguồn đó (không có thì `miss`).
Ảnh AI không tự sinh khi dựng bảng (`pending`). `pick` của Kho là đường dẫn tương đối trong Kho; chỉ liên kết vào `media/kho_*` lúc Áp.

**Gợi ý dấu** (nút ở ô Kịch bản, chỉ khi có Claude Code): `POST /api/script/suggest {text}` gửi chữ (không gửi video) + tên thương hiệu
+ khổ; Claude trả chính chữ đó kèm dấu. `checkSuggested` kiểm: bỏ dấu ở hai bản phải trùng chữ nói (lệch → "Claude đã sửa lời, không
áp"), mỗi đoạn ≤ 1 MOOD, 2 CHỮ, 2 B-ROLL, 2 SFX (không tính dấu người dùng đã có), MOOD đổi cách nhau ≥ ~10 s đọc (2,6 từ/giây),
không A-ROLL clip / take / tệp. Sai luật thì hỏi lại một lần. Kết quả hiện dạng so sánh (dấu thêm tô màu): **Nhận hết** đưa vào ô chữ
(chưa lưu), **Bỏ** giữ bản cũ.

## 8. AI dựng theo dấu kịch bản, ghi chú trên khối (S27 M194)
Thiết kế: `docs/plans/S27-dung-theo-kich-ban.md` mục 2.3, 2.4 (đổi hướng 2026-11-19: không có panel Bảng dựng). Mã: `scripts/script_build.mjs`
(`sheetToPlan`, `sheetPrompt`, `builtSegs`, `sheetMood`, `scriptRequests`, `scriptReport`), `scripts/ai_edit.mjs` (`planFromSheet`,
`mergeScript`, `sheetMedia`, `applyPlan`), `studio/features/23_scriptnotes.js` (ghi chú), `studio/features/20_ai.js` (`applyPlan` client),
QC `buildMarkIssues` trong `scripts/ai_qc.mjs`; test `scripts/tests/s27_m194.test.mjs`.

- **Người dùng không sửa bảng.** Nhập kịch bản có dấu (bước Nguồn), bấm **AI dựng**. `.studio/build_sheet.json` là dữ liệu nội bộ.
- **AI dựng** (job `ai`, `node scripts/ai_edit.mjs <tl> --opts …`) khi kịch bản đã căn: `sheetFor` dựng lại bảng (Kho → thư viện → stock →
  b-roll động; `--no-stock` bỏ stock), prompt nhận `sheetPrompt` (ô `(chốt)` là ràng buộc cứng, hàng "DỰNG SẴN" Claude không đặt graphic chồng),
  Claude lấp phần còn lại; `sheetMedia` đưa media của ô B-roll vào dự án (Kho `useFromKho`, thư viện `useIn`, stock `fetchMedia`, ảnh AI
  `genImage` khi dấu ghi `| ảnh AI` và có khoá), `planFromSheet` = `sheetToPlan` rồi `validate` (chữ và b-roll động hai lượt riêng),
  `mergeScript` gộp vào kế hoạch của Claude (cảnh / SFX của Claude chồng dấu bị bỏ, nhạc = nền nhiều khúc theo dấu), đặt né mặt (`placePlan`) một lần.
  Một `.studio/ai_plan.json`, Studio áp một lần: **một bước hoàn tác**.
- Mục dựng theo dấu mang `_ai: true`, `_sheet: <seg>` và `_script` { id ("<đoạn>:chu|broll|sfx:<i>", "<đoạn>:mood"), kind, text, note, auto? }.
  `plan.script` = { total, done, req: [{ id, seg, t0, kind, text, ok, why? }] }; A-ROLL bỏ đạt khi đoạn có cảnh phủ cả khung.
- `applyPlan` (server `ai_edit.mjs` = client `20_ai.js`, test so hai bản): kế hoạch có `plan.script` thay mục `_sheet` cũ chưa sửa tay; mục
  bạn sửa tay (`_orig`) giữ và mục mới cùng đoạn cùng loại không thêm; kế hoạch không kèm kịch bản giữ mục `_sheet` và nền nhạc của nó; nhạc
  người dùng chọn luôn thắng; luôn một nền nhạc. A-ROLL `bỏ`: b-roll của đoạn chia đều phủ cả đoạn. Take / cỡ khung A-roll là `M196`.
- **Nhạc theo đoạn** (`M195`): `musicFromSheet` (`script_build.mjs`) dựng **một nền nhiều khúc** nối liền phủ cả video (`offset`, `xfade` 0,8 s,
  mood kế thừa theo hàng, gộp hàng kề cùng mood, tối đa một lần đổi / 10 s: gần hơn thì dời tới ranh giới đoạn kế, sát cuối thì bỏ, ghi vào
  `plan.dropped` + `miss` của MOOD; NHẠC `tắt` / `bật` / `đổi` / `to` / `nhỏ` (±4 dB, −30…−10) / `kho …`), gain `DEFAULT_MUSIC_GAIN`, mỗi khúc
  `_ai`, `_sheet`, `_script` (`<đoạn>:mood` hoặc `<đoạn>:music`). `sheetMusic` (`ai_edit.mjs` = client `20_ai.js`) thay nền `_ai` / `_auto` /
  `_sheet` / nhạc khởi đầu và cất vào `_was` của khúc đầu (`dropSheetMusic` trả lại), nhạc người dùng giữ song song, khúc `_sheet` chỉnh tay
  (`_orig`) → giữ cả nền; đặt `audio.duck = DEFAULT_DUCK` khi chưa có. `music_auto` (Tự động) và nhạc phong cách của Tự lái bỏ qua nền `_sheet`.
  Bài Kho: dấu `kho …` → `khoMusicPick`, còn lại `khoMusic` theo mood từng khúc. Thẻ AI dựng ghi "hype → sad (2 khúc)".
- **Ghi chú** (`23_scriptnotes.js`, hook `Studio._tip` / `Studio._itop` / `Studio._blk` của `studio.js`): tooltip khối "Kịch bản: [B-ROLL: …] ·
  Đã dựng: …"; chọn khối → dòng ghi chú đầu Thuộc tính, **Sửa tay** (`Studio.openSect`) và **Hỏi Claude** (`Studio.ask`, câu hỏi điền sẵn,
  chưa gửi). Dòng "Theo kịch bản: x/y yêu cầu đã dựng · n cần xem" ở panel AI dựng (`Studio.scriptNotes.line(plan)`): bấm = tua tới yêu cầu
  cần xem kế tiếp + lý do.
- **QC** (`script_mark`, low): `[SFX]` không có trong thư viện / chưa có quanh đoạn; `[A-ROLL: bỏ]` mà b-roll phủ < 70 % đoạn; `[B-ROLL: … | nguồn]`
  có cảnh nhưng khác nguồn; `[MOOD]` không khớp mood nào / nhạc nền lúc đó khác mood; dấu chưa hiểu (`raw`).

## 9. Kịch bản dạng bảng và chỉ dẫn dựng (S27 M197)
Thiết kế: `docs/plans/S27-dung-theo-kich-ban.md` mục 7. Mã: `scripts/script_table.mjs`, test `scripts/tests/s27_m197.test.mjs`
(file mẫu `scripts/tests/fixtures/s27_m197_kich_ban.xlsx` / `.csv`).

**Mở bảng** (nút "Mở .txt / .docx / .xlsx" ở ô Kịch bản): `POST /api/script/table` (thân = file, header `x-file-name`) đọc bằng
`parseSheetBuf` của `scripts/batch.mjs` (sheet đầu, hàng đầu là tên cột). Vai trò cột (`roleOf`, tên không dấu):

| Vai trò | Tên cột nhận ra (ví dụ) | Thành |
|---|---|---|
| `time` | Thời gian, Time, Timecode, Mốc, Giây | `[MỐC: 0:05–0:12]` (nhận `00:05–00:12`, `5-12`, `0:05`, `5s`, `5,5 - 8`, `1:02:03`, ô giờ của Excel) |
| `start` / `end` | Bắt đầu / Kết thúc, Start / End, In / Out | như `time` (một mốc thì kết thúc = mốc của hàng sau) |
| `say` | Lời thoại, Voice over, Kịch bản, Nội dung | chữ nói (không có cột tên lời: cột chữ dài nhất) |
| `screen` | Chữ trên màn hình, Text on screen, Tiêu đề | `[CHỮ: …]` mỗi dòng |
| `visual` | Hình ảnh / Source, B-roll, Cảnh quay | `[A-ROLL: cận mặt…]` khi nói về người nói, còn lại `[B-ROLL: …]` |
| `transition`, `note` | Chuyển cảnh; Ghi chú, Chỉ dẫn, Notes | `[GHI CHÚ: …]` |
| `mood`, `sfx`, `skip` | Nhạc / Mood; SFX / Âm thanh; STT, Mã cảnh | `[MOOD: …]`, `[SFX: …]`, bỏ |

Cột có chữ mà chưa nhận ra (`unknown`) tự thành ghi chú. Chỉ khi không nhận ra cột lời / thoại (`ask`) ô Kịch bản mới hiện bảng chọn
vai trò cột (`POST /api/script/table/text {columns, rows, roles}` dựng lại chữ); còn lại báo một dòng "Đọc N đoạn, có mốc giây, M chỉ dẫn dựng". Chữ vào ô (chưa lưu), người dùng sửa rồi Lưu như kịch bản thường. `[MỐC]` / `[GHI CHÚ]` không giá trị là chữ thường;
mốc không đọc được vào `raw[]`. Đoạn: `at {t0, t1}`, `note[]`; căn: `align.sheet` (số đoạn có mốc), `align.drift [{seg, sheet, heard, d}]`.

**Chỉ dẫn dựng** (không có bước Nhận / Bỏ): `[GHI CHÚ]` giữ nguyên văn trong đoạn (`note[]`, cả ở hàng bảng dựng). Mỗi lần dựng bảng,
`ruleCells` chuyển ngầm các mẫu câu hay gặp: chuyển cảnh (mờ dần / trượt / phóng / lia / nhiễu / cắt) → `transition {v}`, focus / phóng vào
sản phẩm hoặc người nói → `focus {on, target}`, cận / trung / toàn cảnh → `aroll.frame` (chỉ khi ô còn `auto`), tìm thêm source / video /
cảnh → `broll[]` (Kho → thư viện → stock khi bật → động), thêm ví dụ → `screen[]` kind `vidu` (chỉ dẫn mơ hồ thì lấy ý từ lời). Mọi ô này
`from: note` + `note` = câu gốc người dùng viết (ghi chú "Kịch bản yêu cầu …" trên timeline đọc lại); không đè ô `mark` / `user`.
`sheetPrompt` gửi AI dựng các ô đó (`(theo chỉ dẫn)`) và mọi câu gốc dạng "KỊCH BẢN YÊU CẦU (nguyên văn, làm theo khi dựng)", nên câu luật
chưa hiểu Claude làm theo lúc dựng. Không bao giờ sửa lời.

## 10. A-roll theo kịch bản (S27 M196)

Lõi `scripts/script_takes.mjs` (hàm thuần, test `scripts/tests/s27_m196.test.mjs`), route + feature `24_aroll`. Không panel, không cài đặt:
dòng gọn trong hộp AI dựng. Không chạy trong Tự lái (chọn take và cắt lời cần người duyệt; Tự lái chỉ ghi số đoạn `offscript` vào kết quả bước `script`).

- **Lời ngoài kịch bản**: `offscriptCuts(align.offscript, lời trên timeline)` → khoảng nên cắt, mép nới `PAD` = 0,15 s về phía lặng nhưng không lấn
  từ kề bên; bỏ đoạn đã không còn ở mốc đó (timeline đổi) và đoạn có mốc từ vỡ kiểu Whisper bịa (`brokenShape`: từ > 3 s, ≥ 40 % từ dài 0,
  mật độ < 0,8 từ/s; bài học `ai-video-studio-041`). Hộp "Xem để cắt" không tick sẵn; cắt = `Studio.ai.cutRanges` (một bước hoàn tác), lưu rồi
  `/api/aroll/realign` căn lại kịch bản.
- **Nhiều take**: mỗi nguồn có tiếng khác nhau trong `TL.clips` là một take, xếp theo giờ file (mtime) rồi thứ tự trên timeline; `clip N` / `take N`
  đếm từ 1 theo thứ tự đó. Job `script_takes` (`scripts/queue.mjs`) nhận dạng lời từng take một lần (cache `.studio/takes/<hash>.json`, hash =
  cỡ + 1 MB đầu + 1 MB cuối + mô hình) và dò mặt trên khung của take; `alignTakes` căn mọi đoạn với mọi take theo cửa sổ (lần quay lại cùng câu
  trong một take là một ứng viên: khớp nhiều hơn, ít từ thừa hơn, rồi lần sau); `pickTakes`: dấu `[A-ROLL: clip N | take N | tệp]` thắng, không thì
  `takeScore` = ratio − 0,02 × từ thừa (≤ 0,2) − 0,05 × từ đầu / cuối hụt (≤ 2 mỗi bên), chênh ≤ 0,02 thì take sau; dưới 30 % = "chưa quay".
- `takesToClips`: mỗi đoạn một clip `{…clip mẫu của take, in, out, zoom/ox/oy, _sheet, _take}` theo thứ tự kịch bản; hai đoạn liền nhau trong cùng
  take (ở giữa < 5 từ) nối ở giữa khoảng lặng (một take dài chứa cả kịch bản chỉ mất phần ngoài kịch bản). Cỡ khung: cận mặt zoom 1,6, trung 1,25
  quanh mặt của take (`ox/oy` %), rộng hoặc chưa dò mặt thì giữ cover. Kết quả `.studio/takes_plan.json` (clips, phụ đề theo giờ mới, segments /
  align, lựa chọn); **Áp** ở Studio thay `TL.clips` + phụ đề (thẻ kết cuối dời theo), `/api/aroll/applied` ghi align vào `script.json` và sao lưu
  lời nhận dạng của các take vào `captions_noscript.json` (+ `heardDur`) để sửa kịch bản lần sau căn đúng. Graphic đã dựng giữ nguyên giờ: AI dựng lại.
