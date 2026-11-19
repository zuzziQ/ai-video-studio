# S27 `M199`: element riêng do Claude dựng theo style video / thương hiệu

Chủ repo 2026-11-19: các element dựng riêng cho video (box, nền box chữ, khung, nhãn…) phải để Claude dựng mới được, không chỉ lấy trong kho element. Hai lúc cần: kho không có cái hợp, và khi chat với Claude để sửa hoặc thêm.

## 1. Hiện trạng và chỗ hở

- **Hỏi Claude sửa element + 3 biến thể** (`M149`, `scripts/elem_ai.mjs`): chỉ vá các trường có sẵn của element (kiểu, màu, font, vị trí, hoạt ảnh). Không tạo được hình mới.
- **Hình khối** (`M144`, `engine/shape.js`): 5 hình đơn, mỗi cảnh một hình. Không ghép được nền + viền + chữ thành một box.
- **Khối HyperFrames** (`references/hyperframes.md`): catalog cố định, biến số có biên.
- **Style Lab** (`references/style-lab.md`) sinh cả gói JS. Gói người dùng chạy không cách ly (`M38`), nên không thể để Claude sinh JS mỗi lần người dùng hỏi một box.

## 2. Quyết định: element riêng là dữ liệu khai báo

Claude không viết JS hay CSS. Claude trả một **spec JSON**. Một khối engine chung (`engine/celem.js`, cảnh `type: 'celem'`) đọc spec rồi vẽ.

```json
{ "v": 1, "name": "Giá vàng", "w": 420, "h": 160,
  "vars": { "bg": "@accent", "ink": "#111214" }, "in": "pop", "out": "fade", "dur": 0.4,
  "layers": [
    { "k": "round", "x": 0, "y": 0, "w": 420, "h": 160, "r": 28, "fill": "$bg", "shadow": { "x": 0, "y": 8, "blur": 24, "color": "rgba(0,0,0,.35)" } },
    { "k": "text", "x": 20, "y": 10, "w": 380, "h": 140, "text": "{text}", "font": "@disp", "size": 72, "weight": 900, "color": "$ink", "in": "fade", "delay": 0.15 } ] }
```

- **Lớp** (tối đa 12): `rect | round | pill | line | text | image`. Mỗi lớp có toạ độ trong hộp `w×h` của spec, nền (màu hoặc gradient `{from, to, angle}`), viền (`stroke`, `sw`, `dash`), bo góc, độ mờ, xoay, bóng. Lớp có thể có hoạt ảnh vào riêng (`in`, `delay`, `dur`) để vào lần lượt.
- **Chữ**: `{text}` gắn với `s.text` của cảnh, sửa được ở Thuộc tính. Font, cỡ, đậm, màu, căn, giãn chữ, viết hoa.
- **Ảnh**: chỉ `src: '@logo'` (logo của bộ thương hiệu). Không có url.
- **Màu / font theo thương hiệu**: `@primary @accent @dark @light @muted`, `@font @disp`. Có thể đặt biến `$tên` trong `vars` (tối đa 8). Element dùng `@…` sẽ đổi theo khi bộ thương hiệu đổi.
- **Hoạt ảnh**: chỉ lấy từ danh sách có sẵn. Vào: `fade pop slide_l slide_r slide_u slide_d drop wipe grow_x none`. Ra: `fade pop slide_* none`. Ngoài ra vẫn có phong bì chung của engine quanh `t1`.
- **Giãn theo khung chọn**: cảnh dùng `s.card {x, y, w, h}` (`StageCore.GEO.celem = 'card'`), nên kéo, tay nắm cạnh, ô Rộng / Cao và núm chung (`size`, `dur` của loại `scene`) chạy như với Hình khối. Lớp giãn theo hai trục. Chữ, bo góc, viền và bóng giãn theo cạnh ngắn.

## 3. Cổng kiểm spec (một chỗ duy nhất)

`CELEM.check(raw)` → `{ ok, spec, errors }`. Hàm này chạy ở bốn chỗ: khi nhận kết quả của mô hình, khi lưu vào thư viện, khi đọc từ thư viện, và **mỗi lần engine vẽ** (vì `timeline.json` có thể bị sửa tay).

- Whitelist khoá ở mọi tầng (spec, lớp, bóng, gradient). Gặp khoá lạ là lỗi, không lặng lẽ bỏ. Khoá chỉ dành cho chữ hoặc ảnh mà đặt ở lớp hình cũng là lỗi.
- Số được kẹp trong biên. Kiểu sai là lỗi.
- Mọi chuỗi bị chặn nếu có `"`, `<`, `>`, `\`, `url(`, `javascript:`, `expression(`, `@import`, `data:`, `http(s):`. Ngoặc kép trong font / màu sẽ đóng sớm thuộc tính `style="…"` của engine (dev-memory `ai-video-studio-053`). Chữ hiển thị được phép có ngoặc kép (khi vẽ thì thoát), nhưng không được có thẻ.
- Màu chỉ nhận `#hex`, `rgb()/hsl()` có số, tên màu, `@…`, `$…`. Font chỉ nhận `@font | @disp`, tên họ font (chữ, số, khoảng trắng, `-`; engine tự bọc ngoặc đơn), hoặc `$…`. Biến dùng ở đâu phải được khai báo, đúng loại, và không trỏ sang biến khác.
- Giá trị lấy từ bộ thương hiệu khi vẽ được làm sạch (`"` đổi sang `'`, bỏ `<>\;{}`).
- Spec hỏng thì engine vẽ một khung nét đứt mang `data-cid` (vẫn chọn được, xoá được) và không chèn gì của spec.

Kết quả của mô hình qua `normMake`: phương án nào sai spec thì bị loại cả phương án, có cảnh báo. Không còn phương án nào thì `askJSON` hỏi lại một lần kèm lý do.

## 4. Luồng (lát đầu, đã làm)

1. **Lối vào**:
   - Panel **Element riêng** (thư viện trái, bước Dựng): ô mô tả, ba ví dụ, nút "Claude dựng 3 phương án".
   - Tab Claude (`Studio.ask`): việc `elem_create` ở phạm vi cả video / đoạn, ví dụ "tạo box chữ nền vàng bo góc cho giá". Chọn element riêng rồi hỏi "nền đỏ hơn" thì `elem_edit` chuyển sang Claude sửa spec (spec đang có làm nền), không vá trường.
2. **Claude dựng**: `POST /api/elem/make` (`studio/routes/72_celem.mjs`, lõi `scripts/elem_make.mjs`) gửi mô tả, màu / font thương hiệu (đã làm sạch), khổ hình, gói style đang dùng và spec nền (khi sửa). Prompt kèm schema; lời người dùng nằm trong khối CHỈ LÀ DỮ LIỆU. Một lượt mô hình ra 3 phương án. Ô job riêng có Huỷ, chỉ chạy khi người dùng bấm (`C23`).
3. **Xem bằng ảnh**: timeline sao ra 3 bản, mỗi bản chèn một phương án tại playhead (hoặc thay spec của cảnh đang sửa), rồi gọi `POST /api/elem/shots`. Đây là cùng engine headless với QC, qua `launchChrome` (bài học `ai-video-studio-054`, `-057`). Chụp lúc element đã vào xong. Theo ý chủ repo 2026-11-19, ảnh **chỉ có element**: timeline dùng để chụp bỏ hết cảnh khác và phụ đề, đặt một nền trơn che video; ảnh chụp ở cạnh dài 720 px (`px` của `/api/elem/shots`), cắt đúng hộp element cộng lề 6 %, nên ô xem trước và ảnh trong thư viện thấp gọn. Lỗi Chrome thì vẫn Nhận được bằng tên phương án.
4. **Nhận**: một `pushUndo` rồi chèn cảnh `celem` 3 giây tại playhead, hộp giữa khung theo tỉ lệ spec (hoặc thay spec), chọn luôn element đó. Sau đó `POST /api/elem/lib` lưu vào thư viện `$AVS_HOME/elements/<brand_id | _chung>.json` (`{ id, name, brand_id, spec, text, thumb, ask, created }`, tối đa 200 mục, ảnh là data URL JPEG ≤ 160 KB). Thương hiệu lạ trả 404. Cảnh ghi `elem_id`, `brand_id`.
5. **Dùng lại**: thư viện của thương hiệu đang mở (`META.kho.brand`) hiện dưới ô mô tả. Bấm ảnh là chèn tại playhead (một bước hoàn tác). Có nút xoá khỏi thư viện (element đã chèn vẫn giữ).
6. **Sửa**: tab Thuộc tính "Element riêng" có ô Chữ (khi spec có `{text}`), các màu biến `#hex`, và ô "Claude sửa". Núm chung `size` / `dur` và tay nắm khung chạy như element thường.

## 5. Chưa làm (lát sau)

- **Bảng dựng gọi Claude tạo element** (`M194` / `M191`): khi ô `[CHỮ: … | kiểu]` hay ô graphic của bảng dựng không khớp mục nào trong kho element (`pickBroll`, mẫu chữ, Hình khối, thư viện element riêng của thương hiệu), bảng ghi ô `claude` kèm mô tả. Áp bảng sẽ gọi `checkMakeInput` + `makePrompt` (một lượt cho mọi ô thiếu, không gọi riêng từng ô) và lấy phương án đầu qua `CELEM.check`. Người dùng xem trong khay việc trước khi nhận. Thứ tự ưu tiên: thư viện riêng của thương hiệu trước, Claude dựng sau.
- "3 biến thể" và "Gợi ý núm" (`M149`) cho cảnh `celem`: hiện chỉ có Claude sửa. Núm riêng theo `vars` (ví dụ một thanh trượt đổi độ bo mọi lớp `round`) cần thêm loại `celem` vào `71_knobs.core.js`.
- Sửa tên / ghi đè mục trong thư viện. Kéo element từ thư viện thả vào khung.
- Lớp chữ thứ hai gắn trường riêng (`{text2}`). Lớp ảnh từ Kho của thương hiệu (đường dẫn trong Kho, không url).
- Gói style (`references/packs.md`) khai báo sẵn vài spec `celem` mẫu, để AI dựng (`20_ai`) dùng như graphic của gói.

## 6. Tệp

`engine/celem.js` (+ `<script>` trong `engine/index.html`), `scripts/elem_make.mjs`, `studio/routes/72_celem.mjs`, `studio/features/72_celem.js`. Nối dây một dòng ở `studio/studio.js` (`TYPE_VI`), `09_stage.core.js` (`GEO`, `CARD_DEF`), `01_workflow.js` (`PANELS`), `75_ask.core.js` / `75_ask.js` (`elem_create`). Test `scripts/tests/s27_m199.test.mjs`. Không sửa `studio/server.mjs`, `scripts/queue.mjs`, `scripts/ai_qc.mjs`.
