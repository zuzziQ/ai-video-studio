# S20 — Tạo và chỉnh element ngay trên khung xem trước (kiểu CapCut, Canva)

Lập 2026-11-18. Mục ROADMAP: `M139`–`M144`, quyết định `C19`, `C20`. Nguồn: so sánh CapCut (web / desktop), Canva video, Clipchamp, VEED, Kapwing, Descript với Studio sau `S19` (main ở `b08c4b5`).

## 1. Các editor web làm thế nào

Mẫu chung (đã đối chiếu tài liệu trợ giúp của CapCut, Clipchamp, Kapwing và bảng phím tắt Canva; VEED, Descript theo cách dùng thường gặp, chưa có tài liệu chính thức nên chỉ lấy phần trùng với các editor kia):

| Nhóm | Cách làm phổ biến |
|---|---|
| Thêm element | Bấm trong thư viện = chèn giữa khung tại playhead; **kéo từ thư viện thả vào khung** = đặt đúng chỗ thả; thả vào track timeline = đúng thời điểm thả. Nhóm: chữ (mẫu chữ), sticker, **hình khối** (chữ nhật, tròn, đường, mũi tên), ảnh / video phủ, khối hoạt ảnh. |
| Chọn trên khung | Rê chuột: viền mảnh quanh element dưới chuột. Bấm: khung chọn + 4 tay nắm góc (phóng đều), tay nắm cạnh (giãn một chiều), **tay nắm xoay** dưới / trên khung (Shift bắt 15°). Bấm khoảng trống rồi kéo: **quét chọn** nhiều element. Shift bấm: thêm / bỏ. Đường gióng hồng tới giữa khung, mép, element khác. |
| Sửa chữ tại chỗ | Bấm đúp vào chữ: con trỏ gõ ngay trên khung, đúng font, cỡ, màu; Esc hoặc bấm ra ngoài là xong; một bước hoàn tác. |
| Thanh nổi theo ngữ cảnh | Clipchamp: thanh nổi cạnh preview, đổi theo element đang chọn (không chọn gì thì áp cả video), có thứ tự lớp, xoay. Canva: thanh trên khung (font, cỡ, màu, hiệu ứng, vị trí) + menu nhỏ cạnh element (nhân bản, xoá, khoá, ⋯). Chuột phải: Đưa lên / Đưa xuống (CapCut web). |
| Canvas ↔ timeline | Chọn trên khung thì khối trên timeline sáng lên và cuộn vào tầm nhìn; chọn khối thì khung chọn hiện trên preview và playhead nhảy vào khoảng của khối nếu đang ở ngoài. Track trên cao vẽ đè track dưới (CapCut: lớp trên cùng là cái nhìn thấy trên cùng). |
| Phím tắt | Canva: mũi tên dời 1 px, Shift + mũi tên 10 px, ⌘] / ⌘[ đưa lên / xuống một lớp, ⌘⌥] / ⌘⌥[ lên trên cùng / xuống dưới cùng, ⌥⇧L khoá, ⌥ + kéo nhân bản. Chung: ⌘C / ⌘V / ⌘X, ⌘D, Delete, ⌘Z / ⇧⌘Z. CapCut desktop: mũi tên là lùi / tiến khung, đổi được phím trong Cài đặt. |
| Lớp | Thứ tự lớp đổi được (lệnh, chuột phải, bảng Lớp có kéo thả, Kapwing: nút Front trong panel phải). Khoá và ẩn từng element. Bấm lặp chỗ chồng nhau để chọn lớp dưới. |

## 2. Studio đang có gì (đọc mã)

- **Preview** là engine thật trong iframe (`studio/studio.js` `draw`, `previewTL`); `#overlay` vẽ khung chọn bằng `rectOf(obj)` (đo `[data-cid]` trong iframe) — `drawOverlay`, `pick` (dòng ~162–205).
- **Chọn / kéo / đổi cỡ** (M124, `features/09_stage.core.js` = `StageCore`, test `scripts/tests/m124_stage.test.mjs`): bấm chọn, kéo dời, tay nắm góc phóng đều, tay nắm cạnh cho `GEO` (`frame_grid`, `media_card`, `hook_card`, `bubble_screen`, `follow_cta`), đường gióng (Alt bỏ hít), Shift thêm nhóm, căn N element, ô X/Y/Rộng/Cao/Xoay ở tab Vị trí, QC nhanh sau khi thả. Clip chính: khung cắt kéo / zoom.
- **Bấm đúp** trên preview chỉ đưa con trỏ vào ô `text` / `captext` của inspector (dòng ~812), không gõ tại chỗ.
- **Xoay**: chỉ có ô số `rot` (engine `applyRot`), không có tay nắm.
- **Inspector** cột phải theo tab; không có thanh nổi, không có menu chuột phải.
- **Timeline → canvas**: bấm khối gọi `select`, playhead nhảy vào khối; **canvas → timeline**: khối có lớp `sel` nhưng timeline không cuộn tới nếu khối ở ngoài tầm nhìn.
- **Phím** (dòng ~1114): Delete, ⌘D, ⌘B, ⌘Z / ⇧⌘Z, Alt + mũi tên dời 1 px (Shift 10 px), mũi tên lùi / tiến khung. Không có ⌘C / ⌘V, không có phím thứ tự lớp, không có khoá từng element.
- **Thêm element**: `library.js` `addText`, `addSticker`, Media (Lớp phủ → cảnh `photo`), Hiệu ứng (mọi item gói), khối HyperFrames (`35_hf.js`) — đều chèn tại playhead với vị trí mặc định; không kéo thả vào khung. Engine **không có loại cảnh hình khối**.
- **Lớp**: engine vẽ `back` của mọi cảnh, rồi người tách nền, rồi `front` theo thứ tự `TL.scenes`, phụ đề luôn trên cùng (`engine/engine.js` ~424–428). Thứ tự lớp = thứ tự mảng, chưa có lệnh đổi. Khoá / ẩn chỉ theo track (`TRK`), ẩn từng element có (`obj.hidden`).
- **Keyframe** (`60_keyframes.js`): kéo trên preview sửa key tại playhead; **mặt nạ** (`61_mask.js`): sửa bằng ô số trong inspector.

## 3. Ma trận

| | Mục |
|---|---|
| **Giữ** | Preview = engine thật, chọn bằng `data-cid`; `StageCore` (đường gióng, tay nắm cạnh, căn nhóm, QC nhanh sau khi thả); inspector theo tab là nơi chỉnh đầy đủ; khung cắt clip chính; ⌘D, Delete, ⌘B, ⌘Z; mũi tên = lùi / tiến khung khi không chọn element; `_orig` + Về thiết kế; ghi chú cho Claude. |
| **Nâng cấp** | Bấm đúp → **sửa chữ tại chỗ** trên khung (chữ thêm, chữ graphic, node sơ đồ; phụ đề vẫn sang inspector vì từng từ có mốc giờ). Ô số Xoay → thêm **tay nắm xoay** (Shift bắt 15°). Canvas → timeline: **cuộn timeline tới khối** đang chọn; **viền rê chuột** trên khung. Khoá theo track → thêm **khoá từng element** (`obj.locked`). Alt + mũi tên → **mũi tên dời khi đang chọn element trên khung** (`C19`). Panel Thành phần → **bảng Lớp tại playhead** (thứ tự kéo thả, mắt, khoá). Thêm element bằng bấm → thêm **kéo thả vào khung / timeline**. |
| **Thêm** | **Thanh nổi theo ngữ cảnh** trên khung chọn + **menu chuột phải** (khung và timeline, cùng một bảng lệnh). **Clipboard** ⌘C / ⌘X / ⌘V (dán tại playhead, cùng vị trí; dán lặp lệch 24 px), ⌥ + kéo nhân bản. **Thứ tự lớp** ⌘] / ⌘[ / ⌘⌥] / ⌘⌥[. **Quét chọn** (marquee). **Bấm lặp chọn lớp dưới**. **Hình khối**: loại cảnh `shape` mới trong engine (chữ nhật, bo góc, tròn, đường, mũi tên; nền, viền, độ mờ), có tay nắm cạnh qua `StageCore.GEO`. Bảng phím tắt (`?`). |
| **Loại** | Nhóm cố định (⌘G) — engine không có khái niệm nhóm, chọn nhiều tạm thời đã đủ. Số đo khoảng cách kiểu Figma. Cắt tự do ảnh phủ trên khung (đã có mặt nạ; để sau nếu người dùng hỏi). Chỉnh bằng cảm ứng / pinch. Đổi phím tắt trong Cài đặt. Sửa phụ đề tại chỗ (đổi chữ làm lệch mốc giờ từng từ; giữ ở tab Lời thoại / inspector). |

## 4. Mục (mỗi mục một PR 300–800 dòng)

### `M139` Chỉnh tại chỗ: sửa chữ trên khung, tay nắm xoay, canvas ↔ timeline (lát đầu)
- Bấm đúp chữ thêm / chữ graphic / node có `text`: ô gõ (`textarea` trong `#overlay`, không phải trong iframe) đặt đúng hộp `rectOf`, chép font, đậm, nghiêng, cỡ × K, màu, căn, bóng từ `getComputedStyle` của phần tử engine; phần tử gốc ẩn trong lúc gõ; ô tự giãn theo nội dung. Enter = xong (Shift + Enter xuống dòng nếu engine hỗ trợ), Esc = huỷ, bấm ra ngoài = xong. Một `pushUndo` cho cả lần gõ; inspector ô `text` cập nhật; tên khối trên timeline đổi theo. Đang phát thì dừng. Chữ đang `upper` thì ô hiện chữ gốc.
- Tay nắm xoay (chấm tròn trên đỉnh khung, chỉ khi `StageCore.canRotate`): kéo xoay quanh tâm, Shift bắt 15°, hít 0 / 90 / 180 khi gần (≤ 3°), nhãn "N°" trong lúc kéo; ghi `obj.rot` qua `StageCore.rotNorm`, đồng bộ ô Xoay.
- Rê chuột trên khung: viền mảnh quanh element dưới chuột (bỏ qua element bị khoá / track khoá).
- Chọn trên khung: timeline cuộn ngang / dọc tới khối nếu khối ngoài tầm nhìn; khối nháy sáng một lần.
- Lõi thuần mới trong `StageCore`: `rotFromDrag(cx, cy, x0, y0, x, y, rot0, {step})`, `textBoxStyle(computed, K)` (lọc thuộc tính chép), test thêm vào `m124_stage.test.mjs` (đổi tên file test mới `s20_stage.test.mjs`).
- File: `studio/studio.js` (overlay, dblclick, mousemove), `studio/features/09_stage.core.js`, `studio/studio.css`, `references/studio.md` mục Giữa.

### `M140` Thanh nổi theo ngữ cảnh và menu chuột phải
- Thanh nổi trên (hoặc dưới khi sát mép trên) khung chọn: chữ → font, cỡ, màu, đậm, hoạt ảnh, ⋯; cảnh / sticker / ảnh → Thay (mở thư viện đúng loại), Lớp ▲▼, Khoá, Nhân bản, Xoá, ⋯ (mở tab inspector đúng). Không che element: đặt theo `rectOf` + kích thước khung, tự lật.
- Menu chuột phải (khung + khối timeline): Cắt, Chép, Dán, Nhân bản, Xoá, Đưa lên / xuống / trên cùng / dưới cùng, Khoá, Ẩn, Về thiết kế, Ghi chú cho Claude. Một bảng lệnh `features/66_canvas_cmds.js` dùng chung cho thanh nổi, menu, phím (`M141`).
- Ẩn khi đang kéo, đang gõ, đang phát.

### `M141` Phím tắt, clipboard, thứ tự lớp, khoá từng element
- ⌘C / ⌘X / ⌘V (clipboard trong trang, nhiều element; dán tại playhead, giữ vị trí, dán lặp lệch 24 px), ⌥ + kéo nhân bản, ⌘] / ⌘[ / ⌘⌥] / ⌘⌥[ (đổi chỗ trong `TL.scenes`; chỉ đổi giữa các cảnh cùng lớp `front` / `back` của engine; chữ graphic đổi thứ tự trong `lines`), ⌥⇧L khoá (`obj.locked`, `pick` bỏ qua; bấm khối trên timeline vẫn chọn được để mở khoá), ⌘A chọn mọi element đang hiện tại playhead.
- Mũi tên: theo `C19`.
- Bảng phím tắt (phím `?` và mục trong ⋯).

### `M142` Bảng Lớp, quét chọn, bấm lặp chọn lớp dưới
- Panel Thành phần thêm chế độ **Lớp tại playhead**: danh sách theo thứ tự vẽ (trên cùng ở đầu), kéo thả đổi thứ tự, mắt, khoá, bấm chọn.
- Kéo trên khoảng trống của khung = quét chọn (hộp chạm element nào thì chọn), Shift cộng thêm.
- Bấm lại đúng chỗ đang chọn (không kéo) = chọn element kế tiếp bên dưới tại điểm đó (`elementsFromPoint`).

### `M143` Kéo từ thư viện thả vào khung và timeline
- Chữ (mẫu chữ), Sticker, Media (ảnh / video → Lớp phủ), Hiệu ứng, khối HyperFrames kéo được (`draggable`, `dataTransfer` mang id mục). Thả vào khung → chèn tại playhead, tâm ở điểm thả (đổi qua `setPos`); thả vào track timeline → chèn tại thời điểm thả, vị trí mặc định. Track video chính giữ hành vi hiện có (Media → Track chính).
- Bóng xem trước khi kéo trên khung; vùng thả hợp lệ sáng lên.

### `M144` Hình khối (loại cảnh `shape`)
- Engine: module `shape` (`engine/modules.js`): `s.shape` = `rect | rounded | circle | line | arrow`, `s.card {x, y, w, h}`, `fill`, `stroke`, `stroke_w`, `radius`, `opacity`, `anim` (fade / pop / wipe); có `data-cid`; render = preview (cùng engine).
- `StageCore.GEO.shape = 'card'` + `CARD_DEF` → tay nắm cạnh, ô Rộng / Cao chạy ngay.
- Studio: panel **Hình khối** trong bước Dựng (cạnh Sticker), tab inspector Cơ bản cho hình (màu nền, viền, bo góc, độ mờ, hoạt ảnh).
- Test engine thuần (`scripts/tests/s20_shape.test.mjs`) + dựng một video mẫu trên máy (`sample/`) để so preview / xuất.

## 5. Quyết định cần chốt

- **`C19`**: phím mũi tên khi đang chọn element trên khung. Đề xuất: theo **vùng đang focus** — vừa bấm trên khung (hoặc đang có khung chọn từ khung) thì mũi tên dời 1 px / Shift 10 px như Canva; vừa bấm timeline hoặc không chọn gì thì lùi / tiến khung như CapCut. Alt + mũi tên vẫn luôn dời (giữ thói quen M124). Phương án khác: giữ nguyên (chỉ Alt + mũi tên dời).
- **`C20`**: thanh nổi có thay một phần inspector không. Đề xuất: không — thanh nổi chỉ là lối tắt 5–6 thao tác hay dùng, inspector vẫn là nơi đủ mọi trường (người dùng cũ không mất chỗ quen).

## 6. Thứ tự và tệp nóng

`M139` trước (lát đầu, chỉ đụng `studio/studio.js` phần preview + `09_stage.core.js`). `M140` → `M141` nối tiếp (cùng bảng lệnh). `M142`, `M143` sau `M141` (cùng `studio.js` phần chuột). `M144` làm song song được (engine + panel mới, chỉ một dòng `GEO`). Không đụng `studio/server.mjs`, `scripts/queue.mjs`. `docs/ROADMAP.md`: mỗi PR chỉ sửa dòng mục của mình.

## 7. Rủi ro

- Ô gõ tại chỗ lệch với chữ engine khi chữ có hoạt ảnh (`pop`, `slide`, `fly`) đang chạy: khi vào gõ, đặt playhead về lúc hoạt ảnh vào đã xong (`L.t + 0.4` nếu đang trước đó) rồi mới đo.
- Chữ có keyframe (`kf`) hoặc xoay: ô gõ phải theo `rot`; khung đo `getBoundingClientRect` của phần tử xoay là hộp bao — dùng hộp chưa xoay (đo khi tạm bỏ `rotate`).
- Đổi thứ tự `TL.scenes` làm đổi `cid` (`s<i>`): mọi chỗ giữ `cid` (chọn, nhóm, ghi chú) phải tính lại sau `build()`; `restore` đã làm theo `cid`, cần giữ chọn theo object.
- Thêm loại cảnh mới vào engine: QC (`scripts/ai_qc.mjs`), Tự động, `trackOf` phải biết `shape` (vào track Graphic).
