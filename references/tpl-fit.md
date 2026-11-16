# Bám lời thoại — mẫu tự khớp với clip (`scripts/tpl_fit.mjs`)

Mẫu (`templates/*.json`) được dựng trên clip mẫu: chữ là chữ giữ chỗ ("Tên sản phẩm", "Ưu điểm thứ nhất", vars của khối
HyperFrames…), ảnh là ảnh mẫu trong `examples/media`, thời điểm là thời điểm của clip mẫu (giãn theo tỉ lệ). Ngay sau khi
**Dùng mẫu**, Studio chạy bước "Bám lời thoại" để mọi graphic khớp với lời nói thật của clip.

## Luồng
1. `library.js applyTemplate()` → `win.applyTemplate` (engine) → `Studio.fitTemplate(tpl)` (`studio/features/27_tplfit.js`).
   Mẫu có `"fit": false` thì bỏ qua bước này.
2. `POST /api/tplfit {claude=true, images=true, model}` → job `tplfit` (`studio/routes/27_tplfit.mjs`):
   - dự án chưa có phụ đề → tự tạo lời thoại (whisper small, cùng hàm `transcribe()` của `25_transcribe.mjs`);
   - snapshot vào `.studio/history/*_tplfit.json`, rồi `fitProject()` sửa `timeline.json` tại chỗ (+ `.bak`).
3. Studio `reload()`; một ⌘Z hoàn tác cả mẫu lẫn phần bám lời thoại. Tab **Dự án** có nút **Bám lời thoại** để chạy lại.
4. Tự lái (`autopilot.mjs`, bot Telegram, thư mục theo dõi): hồ sơ có `template` → áp mẫu rồi `fitProject()` luôn.

## `fitProject(dir, {claude, model, images, dry, say})`
Chỉ đụng cảnh của mẫu: `_tpl` / `_recipe`, chưa sửa tay (`_orig`), không phải b-roll tự động (`_auto`).
- **Thời điểm**: cảnh không phải khung nền (dài ≥ 40 % video) và không `keep:true` → bắt đầu ở từ Claude chọn (`c`,`w`), hoặc
  (không có Claude) đầu câu gần nhất trong ±3 s. Giữ thứ tự, không chồng nhau, thời gian bên trong cảnh (`t`, `*_t`) dời theo.
- **Chữ**: mọi trường chữ (khối `hf`: vars kiểu string + texts, kể cả giá trị mặc định tiếng Việt của `vi.js`; cảnh thường: mọi
  chuỗi có chữ cái ngoài các khoá kỹ thuật) + emoji ở `icon/emoji/e/burst`. Claude viết lại theo lời thoại, giữ độ dài/kiểu HOA/
  định dạng. Độ dài bị chặn cứng ở `maxLen(chữ mẫu)` (≤ 12 ký tự: +4; dài hơn: ×1,15), cắt theo từ (`clampLen`): graphic chỉ
  vừa chữ mẫu, dài hơn là bị khung cắt (kiểm bằng `node scripts/tpl_text_audit.mjs <dự án> [--stretch k]`). Không có Claude: lấy lần lượt các cụm từ người nói nói từ đầu cảnh; số chỉ thay khi lời nói có số cùng loại (giá
  cần đơn vị tiền, % cần %). Chỗ không lấy được ghi vào `missing` để báo người dùng.
- **Ảnh**: trường ảnh (`image/media/bg/before/after/tiles/images/avatar/src`) đang trỏ ảnh mẫu `media/<file trong examples/media>`
  → tìm ảnh stock (Openverse/Commons, Pexels/Pixabay nếu có key) theo từ khoá tiếng Anh Claude đưa (prompt đòi thứ chụp được:
  người/vật/cảnh, cấm từ trừu tượng như "AI", "success"), tải vào `media/fit-*.jpg` + `media/credits.json`. Chọn ảnh ở
  `scripts/fit_images.mjs` (thuần, test `scripts/tests/fit_images.test.mjs`):
  - lấy 20 ứng viên, chấm theo số từ khoá (bỏ stopword, stem nhẹ) có trong tên ảnh + tag Openverse; tên do nhà cung cấp tự điền
    bằng chính từ khoá (ảnh không tên) không tính; danh mục Commons không dùng (quá nhiễu);
  - đạt khi khớp 1/1, 2 của 2–3, 3 của 4+ từ khoá, và đủ từ *cụ thể* (từ trong `ABSTRACT` như artificial, intelligence, success,
    technology không tính phần cụ thể); loại bản đồ/sơ đồ/scan/logo/tài liệu/ảnh lưu trữ (trừ khi từ khoá hỏi đúng thứ đó), ảnh
    < 500 px, URL đã dùng; trừ điểm tên có năm cũ (15xx–1950s);
  - hướng ô ảnh: `bg` theo khung video, đường dẫn có `card` → ngang, còn lại theo tỉ lệ ảnh mẫu trong `examples/media`;
    cùng hướng +4, lệch hướng −6;
  - thử cả câu rồi 2 từ cụ thể đầu, không lùi về 1 từ; vẫn không đạt → giữ ảnh mẫu, ghi `missing` kèm từ khoá;
  - chống trùng theo nội dung: sha1 file sau khi tải so với mọi ảnh trong `media/` của dự án; trùng thì xoá file + dòng
    credits, thử ứng viên kế (tối đa 3).
  Không có mạng → giữ ảnh mẫu. Chưa có key Pexels/Pixabay → kết quả có `noStockKey: true`, Studio gợi ý thêm key (không đọc key).
- **Phụ đề**: Claude chọn 1–2 từ khoá mỗi dòng → `hl:true`.
- Cảnh đã xử lý có `_fit: true`. Kết quả: `{fit, texts, images, hl, claude, missing[], picks[{q, file, title, score}], noStockKey?}`.

CLI: `node scripts/tpl_fit.mjs <dự án|timeline.json> [--claude] [--model sonnet] [--no-images] [--dry]`.
Prompt/đáp án Claude lưu ở `.studio/tplfit_prompt.txt`, `.studio/tplfit_raw.txt`.
