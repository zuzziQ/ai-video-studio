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
(bảng dựng, gợi ý dấu), test `scripts/tests/s27_m193.test.mjs`. Panel Bảng dựng và Áp lên timeline: mục 8 (`M194`).

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
(giây), pos, miss?, from}], screen [{text, kind, from}], lock }] }`. `from`: `mark|claude|auto|user`. Tự dựng lại mỗi lần lưu kịch bản
(`POST /api/script`), `POST /api/script/sheet {stock}` dựng lại tay; Bỏ kịch bản xoá bảng. Dựng lại giữ ô `user` khi lời của hàng không
đổi (so `norm(say)`), giữ nguyên hàng `lock`. B-roll: Kho (`searchKho`, bỏ file đã vào `media/`) → thư viện (`broll_lib.search`) → stock
(chỉ khi `stock: true`) → b-roll động `assets/broll/catalog.json` (luôn có); nguồn ép ở dấu chỉ dùng nguồn đó (không có thì `miss`).
Ảnh AI không tự sinh khi dựng bảng (`pending`). `pick` của Kho là đường dẫn tương đối trong Kho; chỉ liên kết vào `media/kho_*` lúc Áp.

**Gợi ý dấu** (nút ở ô Kịch bản, chỉ khi có Claude Code): `POST /api/script/suggest {text}` gửi chữ (không gửi video) + tên thương hiệu
+ khổ; Claude trả chính chữ đó kèm dấu. `checkSuggested` kiểm: bỏ dấu ở hai bản phải trùng chữ nói (lệch → "Claude đã sửa lời, không
áp"), mỗi đoạn ≤ 1 MOOD, 2 CHỮ, 2 B-ROLL, 2 SFX (không tính dấu người dùng đã có), MOOD đổi cách nhau ≥ ~10 s đọc (2,6 từ/giây),
không A-ROLL clip / take / tệp. Sai luật thì hỏi lại một lần. Kết quả hiện dạng so sánh (dấu thêm tô màu): **Nhận hết** đưa vào ô chữ
(chưa lưu), **Bỏ** giữ bản cũ.

## 8. Panel Bảng dựng và Áp lên timeline (S27 M194)
Thiết kế: `docs/plans/S27-dung-theo-kich-ban.md` mục 2.3, 2.4. Mã: `studio/features/23_buildsheet.js` + `studio/routes/23_buildsheet.mjs`,
hàm thuần ở `scripts/script_build.mjs` (`editCell`, `cleanCell`, `sheetToPlan`, `sheetPrompt`, `sheetMood`, `fillPrompt`, `applyFill`),
`scripts/ai_edit.mjs` (`planFromSheet`, `applySheet`, `--sheet`), QC `buildMarkIssues` trong `scripts/ai_qc.mjs`; test `scripts/tests/s27_m194.test.mjs`.

- **Panel** (bước Dựng, mức Chuyên nghiệp; mở từ dòng "Bảng dựng" của ô Kịch bản và từ tab Claude): mỗi đoạn một thẻ: Lời (bấm = tua tới),
  Mood, Nhạc, A-roll, B-roll (ảnh nhỏ + nguồn, **Đổi** = phương án kế trong `alts`, **Tìm cảnh** / **Chọn từ Kho**, ảnh AI theo từ khoá),
  SFX (nghe thử), Chữ (+ kiểu). Ô sửa tay → `from: user` (`POST /api/buildsheet/cell`, giá trị qua `cleanCell`: mood / SFX phải có
  trong catalog, `pick` của Kho / thư viện / b-roll động phải có thật, link stock chỉ `https`). Khoá hàng = `lock`.
- **Dựng lại ô trống**: một lần Claude cho cả bảng (`fillPrompt`), chỉ lấp mood ô `auto`, SFX / B-roll ô rỗng (`from: claude`); ô `mark` /
  `user`, hàng khoá không đổi.
- **Áp lên timeline**: job `buildsheet` (khay việc, khoá sửa timeline) chạy `node scripts/ai_edit.mjs <tl> --sheet [--ai]`: đưa media
  của ô B-roll vào dự án (Kho `useFromKho`, thư viện `useIn`, stock `fetchMedia`, ảnh AI `genImage` chỉ khi tích "Tạo ảnh AI lúc Áp"),
  `planFromSheet` = `sheetToPlan` rồi `validate` (chữ và b-roll động hai lượt riêng: hai lớp được chồng), đặt né mặt (`placePlan`), ghi
  `.studio/sheet_plan.json`. Trình duyệt áp bằng `Studio.ai.applyPlan(plan)` (`plan.sheet` → `applySheet`): **một bước hoàn tác**, thẻ khay
  có Hoàn tác. Mọi mục mang `_ai: true` + `_sheet: <seg>`.
- `applySheet`: không đổi gói, kiểu phụ đề, tiêu đề, phụ đề; thay mục `_sheet` cũ chưa sửa tay (`_orig` giữ); cảnh AI / Tự động chưa sửa tay
  chồng giờ cảnh mới của bảng bị bỏ; nhạc: chỉ khi bảng có mood chốt (ô không phải `auto`, mood phủ nhiều giây nhất) thì thay nền
  `_ai` / `_auto` / `_sheet` bằng một nền mood đó, nhạc người dùng chọn giữ; mục bảng bạn đã sửa (`_orig`) giữ và Áp lại không thêm mục cùng đoạn cùng loại. A-ROLL `bỏ`: b-roll của đoạn chia đều phủ cả đoạn (b-roll động thành `broll` toàn khung). Kế hoạch ghi `dir`: Studio chỉ áp khi đúng dự án và đúng lần chạy; ô sửa tay thay hẳn mục cũ; Dựng lại ô trống đọc lại bảng sau khi Claude trả lời (ô sửa trong lúc chờ giữ), từ chối khi đang Áp.
  Nhạc nhiều khúc theo đoạn là `M195`, take / cỡ khung A-roll là `M196`.
- **AI dựng** khi có bảng: prompt nhận bảng (`sheetPrompt`) thay dấu thô; ô `(chốt)` là ràng buộc cứng, hàng "ĐÃ TRÊN TIMELINE" Claude không
  đặt graphic chồng (`validate` bỏ cảnh chồng cảnh `_sheet`); `applyPlan` giữ mục `_sheet` và nền nhạc của bảng; mood chốt thắng mood Claude chọn.
- `applyPlan` / `applySheet` có hai bản (server `ai_edit.mjs`, client `20_ai.js`): test chạy bản client trong node, so hai bản qua chuỗi
  AI dựng → Áp bảng → AI dựng → Áp bảng (luôn một nền nhạc).
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

Cột có chữ mà chưa nhận ra (`unknown`) → ô Kịch bản hiện bảng chọn vai trò cột; `POST /api/script/table/text {columns, rows, roles}`
dựng lại chữ. Chữ vào ô (chưa lưu), người dùng sửa rồi Lưu như kịch bản thường. `[MỐC]` / `[GHI CHÚ]` không giá trị là chữ thường;
mốc không đọc được vào `raw[]`. Đoạn: `at {t0, t1}`, `note[]`; căn: `align.sheet` (số đoạn có mốc), `align.drift [{seg, sheet, heard, d}]`.

**Chỉ dẫn → bảng dựng** (nút hiện khi kịch bản đã lưu có `[GHI CHÚ]`): `POST /api/script/directives {claude}` → ô đề xuất. `ruleCells`:
chuyển cảnh (mờ dần / trượt / phóng / lia / nhiễu / cắt), focus / phóng vào sản phẩm hoặc người nói, cận / trung / toàn cảnh, tìm thêm
source / video / cảnh (B-roll stock + từ khoá), thêm ví dụ (graphic ví dụ, chỉ dẫn mơ hồ thì lấy ý từ lời). Vế luật không hiểu gửi Claude
một lần (`directivePrompt`, `checkClaudeCells`: chỉ 5 loại ô, đúng đoạn được hỏi, ≤ 3 ô mỗi đoạn). `POST /api/script/directives/accept
{cells}` ghi ô đã tick vào bảng dựng (`acceptCells`): `aroll.frame`, `focus`, `transition`, `broll[]` (`miss: Cần tìm nguồn`), `screen[]`
kind `vidu`, đều `from: claude`, `by: luat|claude`. Không bao giờ sửa lời.
