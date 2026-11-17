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
Lần đầu thay phụ đề, phụ đề nhận dạng được sao lưu ở `.studio/captions_noscript.json`; **Bỏ** kịch bản trả lại bản đó.

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
`argsFor` → `--script <id>`, rồi ô tự xoá. Bước `script` (sau `fillers`, trước `ai`) ghi `.studio/script.json` và thay phụ đề.
Gọi tay: `--script` nhận cả đường dẫn `.txt` / `.docx` / `.json` (`{text}`).
