# Track chính nhiều clip: `TL.clips`

Có `TL.clips` (mảng không rỗng) thì engine dựng video nền từ các clip **nối liền nhau** theo thứ tự trong mảng, giống track chính có nam châm. Không có thì engine dùng `TL.aroll` như cũ (một đoạn liền).

```json
"clips": [
  { "src": {"seq": "work/frames/%05d.jpg", "fps": 30, "count": 606}, "audio": "work/aroll.mp4", "in": 0, "out": 4 },
  { "src": {"seq": "work/frames/%05d.jpg", "fps": 30, "count": 606}, "audio": "work/aroll.mp4", "in": 8, "out": 12, "speed": 1.5,
    "transition": {"type": "zoom", "dur": 0.4} },
  { "src": "media/living.jpg", "in": 0, "out": 2, "fit": "blurfill", "transition": {"type": "slide_l", "dur": 0.4} },
  { "src": {"seq": "media/clip2_frames/%05d.jpg", "fps": 30, "count": 300}, "audio": "media/clip2.mp4", "in": 1, "out": 6,
    "filter": {"preset": "warm", "brightness": 1.05}, "flip": true, "volume": 0.8 }
]
```

| Trường | Ý nghĩa |
|---|---|
| `src` | chuỗi frame `{seq, fps, count}` (video đã tách khung) hoặc đường dẫn ảnh tĩnh |
| `audio` | file có tiếng của clip (mp4/wav), tính theo giây của nguồn. Bỏ trống thì clip im lặng |
| `in`, `out` | đoạn lấy từ nguồn, tính bằng giây nguồn. Ảnh tĩnh: `out - in` = thời lượng |
| `speed` | tốc độ (0.25–4). Thời lượng trên timeline = (out − in) / speed. Tiếng đổi theo bằng atempo |
| `speedCurve` | S29 M207: đường cong tốc độ, tên preset (`montage`, `hero`, `bullet`, `jump_cut`, `flash_in`, `flash_out`) hoặc `[{x, y}]`: `x` 0–1 trên đoạn nguồn theo chiều phát, `y` hệ số 0,1–10× (nội suy theo log). Có thì bỏ qua `speed`. Thời lượng = tích phân 1 / tốc độ |
| `reverse` | phát ngược: giây nguồn = `out` − tiến độ. Engine đọc chuỗi khung theo thứ tự ngược (không tạo file đảo, `C40`); tiếng `areverse` khi xuất, xem trước tắt tiếng |
| `hold` | clip đứng hình (Freeze) dài `hold` giây, giữ khung tại `in` (= `out`), im lặng. Studio chèn bằng nút Freeze (3 s tại playhead, tách clip nếu cần) |
| `volume`, `mute` | âm lượng (0–2), tắt tiếng |
| `filter` | `preset` (bảng *Bộ lọc* bên dưới) + `brightness`, `contrast`, `saturate` (1 = giữ nguyên), `hue` (độ), `temp` (−1…1), `blur` (px) |
| `flip` | lật ngang |
| `fit` | `cover` (mặc định), `contain`, `blurfill` (vừa khung, nền là chính nó làm mờ, dùng cho clip ngang trong video dọc) |
| `zoom`, `ox`, `oy` | phóng to 1–3 quanh điểm ox/oy (%) |
| `cutouts` | chuỗi PNG người đã tách nền, cùng cách đánh số với `src.seq` |
| `transition` | chuyển cảnh **vào** clip này: `{type, dur, params?}`. `type` là một `id` của bảng *Chuyển cảnh* bên dưới, `dur` 0.1–3 s (mặc định 0.4). `params` (S29 M203, chỉ ghi giá trị khác mặc định): `ease` nhịp `auto` (đường cong riêng của loại) / `smooth` / `accel` / `decel` / `snap`; `dir` `l` / `r` / `u` / `d` (trượt, đẩy, gạt, lia, lật 3D, mờ trượt); `color` `white` / `black` / `warm` / `pink` / `blue` (loé sáng, qua màu, nhấp nháy); `intensity` 0.2–2 (nhiễu, lắc, tách RGB). Clip trước tiếp tục chạy bên dưới, nên tổng thời lượng không đổi |
| `hidden` | bỏ qua clip |

## Danh sách hiệu ứng (sinh từ `engine/fx_registry.js`)
Nguồn duy nhất là `engine/fx_registry.js` (S28 `M202`): engine, Studio và prompt Claude đều đọc từ đó. Thêm hoặc sửa một loại ở registry rồi chạy `node scripts/fx_doc.mjs` để ghi lại các bảng này (test `s28_registry` kiểm khớp). Cột "Không khí / Dùng khi / Tránh" là mô tả `ai` Claude đọc khi chọn.

Panel Chuyển cảnh chia tab theo nhóm và có ô tìm (tên, không khí, dùng khi); mục Chuyển cảnh trong Thuộc tính của clip đặt thời lượng, nhịp và tham số riêng, nút *Áp cho tất cả chỗ nối* chép nguyên tham số (`studio/features/83_transui.js`). Loại `rgb_split` vẽ 3 bản sao khung trong đoạn chuyển nên nặng nhất khi render.

Rê chuột hoặc focus một ô chuyển cảnh (thư viện Chuyển cảnh hoặc mục Chuyển cảnh của clip) thì khung xem trước phát ±1 s quanh chỗ nối của clip đang chọn với loại đó, trên footage thật (`studio/features/79_transpeek.js`). Chỉ là bản xem tạm: không ghi hoàn tác, không tự lưu; rời ô là trả lại.

### Chuyển cảnh
<!-- fx:trans -->
| `id` | Tên | Nhóm | Không khí | Dùng khi | Tránh |
|---|---|---|---|---|---|
| `fade` | Mờ dần | Cơ bản | nhẹ, trung tính | đổi ý trong cùng mạch kể, chuyển giữa hai đoạn nói | video bán hàng nhịp nhanh, cần cú đấm |
| `dissolve` | Hoà tan | Cơ bản | mềm, cảm xúc, hoài niệm | cảnh đẹp, kể chuyện, trước/sau theo thời gian | nội dung tin tức, hướng dẫn cần rõ ràng |
| `slide_l` | Trượt trái | Trượt | gọn, tiến tới | sang ý tiếp theo, bước kế trong danh sách | dùng liên tục mọi chỗ nối (đơn điệu) |
| `slide_r` | Trượt phải | Trượt | gọn, quay lại | nhắc lại ý trước, so sánh ngược | dùng liên tục mọi chỗ nối (đơn điệu) |
| `slide_up` | Trượt lên | Trượt | hướng lên, tích cực | kết quả, con số tăng, video dọc kiểu lướt feed | tin buồn, nội dung trầm |
| `push` | Đẩy | Trượt | liền mạch, chuyên nghiệp | chuyển địa điểm, sản phẩm này sang sản phẩm khác | hai clip gần giống nhau (trông như giật) |
| `zoom` | Phóng vào | Camera | mạnh, nhấn, hào hứng | câu hook, tiết lộ, chi tiết sản phẩm, nhịp mạnh của nhạc | đặt dày đặc; nội dung trang trọng |
| `zoom_out` | Thu ra | Camera | mở rộng, toàn cảnh | từ chi tiết ra toàn cảnh, tổng kết, cảnh BĐS rộng | đầu video (mất hook) |
| `blur` | Nhoè | Ánh sáng | mơ màng, chuyển trạng thái | hồi tưởng, chuyển sang suy nghĩ, cảnh sang trọng | video hướng dẫn cần đọc chữ trên màn |
| `whip` | Lia nhanh | Trượt | năng lượng, trẻ, vlog | đổi cảnh dồn dập, montage, đúng nhịp mạnh | nội dung chậm, tâm sự; dur dài (> 0.5 s) |
| `spin` | Xoay | Camera | vui, bất ngờ, giải trí | twist, chuyển chủ đề vui, video giải trí | thương hiệu sang trọng, nội dung nghiêm túc |
| `wipe` | Gạt | Mặt nạ | rõ ràng, so sánh | trước/sau, so sánh hai lựa chọn, đổi chương | dùng cho mọi chỗ nối |
| `circle` | Vòng tròn | Mặt nạ | tập trung, tiết lộ | mở màn sản phẩm, tiết lộ kết quả ở giữa khung | chủ thể lệch mép khung |
| `flash` | Loé sáng | Ánh sáng | sốc, cú đấm, khoảnh khắc | đúng beat drop, câu đinh, ảnh chụp/khoảnh khắc (color black = chớp đen) | quá 2–3 lần mỗi video; người xem nhạy sáng |
| `glitch` | Nhiễu | Nhiễu | công nghệ, gắt, căng | tin công nghệ/AI, lỗi, bất ngờ tiêu cực, nhạc điện tử | thương hiệu mềm mại, mỹ phẩm, BĐS cao cấp |
| `dip` | Qua màu | Cơ bản | trầm, ngắt chương | hết một phần, chuyển thời gian, mở đầu/kết video (đen); trắng = mơ, hồi tưởng | giữa hai câu liền mạch; dur ngắn (< 0.4 s) |
| `soft_zoom` | Mờ phóng nhẹ | Cơ bản | nhẹ, có hồn | thay mờ dần cho video sang, lifestyle, BĐS | montage nhanh |
| `soft_slide` | Mờ trượt nhẹ | Cơ bản | gọn, hiện đại | chuyển ý trong video hướng dẫn, khoá học, giới thiệu sản phẩm | cần cú đấm mạnh |
| `blink` | Chớp mắt | Cơ bản | tò mò, góc nhìn nhân vật | tỉnh dậy, "nhìn lại", chuyển sang góc nhìn người nói | dùng nhiều lần; nội dung nghiêm túc |
| `pull_in` | Kéo vào | Camera | lao tới, cuốn vào | đi sâu vào chi tiết, "bên trong có gì", vlog du lịch | chủ thể nằm sát mép khung |
| `zoom_blur` | Zoom mờ | Camera | tốc độ, kịch tính | nối hai cảnh hành động, beat drop, thể thao, xe | nội dung nhẹ nhàng, chữ trên màn cần đọc |
| `shake` | Lắc | Camera | sốc, rung động | tin sốc, cú va, tiếng bass mạnh, phản ứng bất ngờ | quá 2 lần mỗi video; nội dung sang trọng |
| `leak` | Rò sáng | Ánh sáng | ấm, hoài niệm, phim | vlog, đám cưới, du lịch, kỷ niệm, hoàng hôn | công nghệ, tin tức |
| `burn` | Cháy phim | Ánh sáng | cổ điển, phim nhựa, mạnh | kể chuyện kiểu phim, chuyển thời kỳ, retro | thương hiệu sạch, y tế, văn phòng |
| `bloom` | Sáng loá | Ánh sáng | mơ, thiên đường, tích cực | kết quả đẹp, tiết lộ sản phẩm, cảnh nắng | cảnh đã cháy sáng sẵn |
| `strobe` | Nhấp nháy | Ánh sáng | tiệc, sân khấu, dồn dập | nhạc EDM, sự kiện, đếm ngược | người xem nhạy sáng; dùng quá 1 lần |
| `rgb_split` | Tách RGB | Nhiễu | công nghệ, gắt, MV | tin AI/công nghệ, nhạc điện tử, cú twist | mỹ phẩm, BĐS cao cấp; máy yếu (render nặng) |
| `ripple` | Gợn | Nhiễu | mơ, nước, chuyển trạng thái | hồi tưởng, giấc mơ, đồ uống, spa | video hướng dẫn cần rõ |
| `stretch` | Kéo giãn | Nhiễu | vui, đàn hồi, meme | giải trí, phản ứng hài, đổi cảnh bất ngờ | nội dung trang trọng, mặt người cận |
| `tv` | TV tắt | Nhiễu | retro, kết thúc, hài | tắt một ý/chủ đề, "hết giờ", nội dung retro, chuyển kênh | giữa hai câu liền mạch |
| `scan` | Vạch quét | Nhiễu | công nghệ, phân tích | quét/phân tích dữ liệu, demo app, AI, giao diện | cảnh thiên nhiên, cảm xúc |
| `heart` | Lau hình tim | Mặt nạ | dễ thương, yêu thương | cặp đôi, quà tặng, mẹ và bé, cảm ơn khách | tin tức, công nghệ, nội dung nghiêm túc |
| `star` | Lau hình sao | Mặt nạ | vui, nổi bật, giải thưởng | khoảnh khắc nổi bật, đánh giá 5 sao, trẻ em, chúc mừng | thương hiệu sang trọng |
| `diamond` | Lau hình thoi | Mặt nạ | sắc, hình học, thời trang | thời trang, trang sức, giới thiệu bộ sưu tập | chủ thể lệch mép khung |
| `diagonal` | Lau chéo | Mặt nạ | động, thể thao | so sánh, đổi chương nhanh, thể thao, ưu đãi | dùng cho mọi chỗ nối |
| `curtain` | Rèm mở | Mặt nạ | trang trọng, ra mắt | ra mắt sản phẩm, khai trương, mở màn sự kiện | giữa video nhịp nhanh |
| `blinds` | Lá sách | Mặt nạ | gọn, đồ hoạ, doanh nghiệp | trình bày, slide doanh nghiệp, nội thất | cảnh nhiều chi tiết dọc (rối mắt) |
| `grid` | Lưới ô | Mặt nạ | công nghệ, sắp xếp, vui | tổng hợp nhiều sản phẩm, danh sách, giao diện app | cảnh mặt người cận |
| `flip` | Lật 3D | Trượt | vui, lật mặt, trước/sau | trước/sau, lật thẻ, đáp án câu hỏi, mặt sau sản phẩm | dùng liên tục; nội dung trầm |
| `page` | Lật trang | Trượt | kể chuyện, sách, hướng dẫn | chương mới, bước tiếp theo trong hướng dẫn, khoá học | montage nhanh |
<!-- /fx:trans -->

### Bộ lọc (`filter.preset`)
<!-- fx:lut -->
| `id` | Tên | Nhóm | Không khí | Dùng khi | Tránh |
|---|---|---|---|---|---|
| `warm` | Ấm | Tông màu | ấm áp, gần gũi | đồ ăn, gia đình, chia sẻ, nội thất | da người đã vàng sẵn |
| `cool` | Lạnh | Tông màu | sạch, công nghệ | công nghệ, y tế, văn phòng | đồ ăn |
| `vivid` | Rực rỡ | Tông màu | tươi, bắt mắt | bán hàng, du lịch, sản phẩm nhiều màu | cảnh đã bão hoà, da mặt cận |
| `bw` | Đen trắng | Không khí | nghiêm, hoài niệm | hồi tưởng, trích dẫn, đoạn "trước" | sản phẩm cần thấy màu |
| `film` | Phim | Không khí | điện ảnh, cổ điển | kể chuyện, vlog, thương hiệu thủ công | tin tức, hướng dẫn |
| `fade` | Phai | Không khí | nhẹ, mộng | lifestyle, thời trang nhẹ nhàng | cảnh tối |
| `night` | Đêm | Không khí | bí ẩn, đêm | cảnh đêm, kể chuyện bí ẩn | da người cận mặt (đổi sắc mạnh) |
| `pop` | Pop | Tông màu | trẻ, sôi động | giải trí, review đồ chơi, quảng cáo nhanh | thương hiệu sang trọng |
<!-- /fx:lut -->

### Hoạt ảnh vào của chữ (`lines[].anim`)
Bộ chung `{in, out, loop}` (S28 `M205`) cho dòng chữ, hình khối (`shape`), element riêng (`celem`), sticker: hàm thuần ở registry
(`FX.animOf`, `FX.animAt`). Trường: `anim` (vào, chuỗi như cũ), `anim_dur`, `anim_out: {type, dur}`, `anim_loop: {type, speed}`;
thời lượng hoạt ảnh độc lập với thời lượng lớp. Không có `anim_out` thì Ra là phong bì mờ chung của engine như cũ.
Hình khối giữ `fade` / `pop` / `wipe` cũ; element riêng: `anim` của cảnh thay `spec.in`; sticker: `anim` thay `from`, `anim_loop` thay `bob`.
<!-- fx:text_in -->
| `id` | Tên | Nhóm | Không khí | Dùng khi | Tránh |
|---|---|---|---|---|---|
| `pop` | Bật | Cơ bản | vui, nổi bật | từ khoá, con số, nhãn ngắn (mặc định) | đoạn chữ dài |
| `fade` | Mờ dần | Cơ bản | nhẹ, sang | câu trích dẫn, thương hiệu cao cấp | hook cần giật mắt |
| `slide_l` | Trượt trái | Chuyển động | năng động | tiêu đề đi vào từ phải, danh sách | chữ đặt sát mép trái |
| `slide_r` | Trượt phải | Chuyển động | năng động | tiêu đề đi vào từ trái, đối xứng với slide_l | chữ đặt sát mép phải |
| `drop` | Rơi | Chuyển động | chắc, đóng dấu | kết luận, giá, nhãn "MỚI" | nhiều dòng cùng lúc |
| `blur_zoom` | Nhoè | Chuyển động | điện ảnh, mạnh | tiêu đề lớn, mở màn, câu hook | chữ nhỏ, phụ |
| `fly` | Bay | Chuyển động | kể chuyện, dẫn mắt | chữ hiện ở một chỗ rồi bay về vị trí (from_x / from_y) | không có vị trí bắt đầu rõ |
| `tumble` | Lật | Từng chữ | vui, sinh động | câu ngắn cần chú ý từng chữ | câu dài (> 20 ký tự) |
| `type` | Đánh máy | Từng chữ | công nghệ, tò mò | câu hỏi, prompt AI, ghi chú | chữ hiện quá ngắn (< 1 s) |
<!-- /fx:text_in -->

### Hoạt ảnh clip (`clip.anim`, S28 M204)
`anim = { in: {type, dur 0,1–3}, out: {type, dur}, combo: {type, speed 0,25–3} }` cho clip Video chính (`TL.clips[i]`) và cảnh `photo` / `broll`. Vào chạy `dur` giây đầu, Ra `dur` giây cuối (Vào + Ra dài hơn clip thì chia theo tỉ lệ), Combo chạy suốt clip; ba phần cộng dồn. Hoạt ảnh theo giây trên timeline, không theo giây nguồn (tốc độ cong / ngược không đổi nhịp).

Thứ tự ghép (một chỗ ở `engine/engine.js`, trên `animWrap`), từ trong ra ngoài:
- Clip chính: khung cắt / bám mặt → lật + phóng → mặt nạ → **hoạt ảnh** → chuyển cảnh → `TL.zoom` → `TL.fx`.
- Cảnh b-roll / ảnh phủ: module → mặt nạ → **hoạt ảnh** → keyframe. Thuộc tính nào keyframe đã đặt (`x`/`y`/`scale`/`rot`/`opacity`) thì keyframe thắng, phần đó của hoạt ảnh bị bỏ.

Ảnh tĩnh toàn khung do AI đặt (`script_build.mjs`, `auto_broll.mjs`) mặc định `anim.combo = ken_burns` (thay `kb` chỉ phóng).

Vào:
<!-- fx:clip_in -->
| `id` | Tên | Nhóm | Không khí | Dùng khi | Tránh |
|---|---|---|---|---|---|
| `fade` | Mờ dần | Vào | nhẹ, trung tính | mở clip đầu, ảnh phủ vào nhẹ | cần cú đấm ngay khung đầu |
| `zoom_in` | Phóng to vào | Vào | bật ra, hào hứng | sản phẩm, chi tiết, câu hook | nội dung trang trọng |
| `zoom_out` | Thu vào | Vào | mạnh, điện ảnh | cảnh rộng, mở chương, ảnh phủ toàn khung | clip quá ngắn (< 1 s) |
| `slide_l` | Trượt sang trái | Vào | tiến tới, gọn | ý tiếp theo, ảnh minh hoạ đi vào từ phải | dùng cho mọi clip liền nhau |
| `slide_r` | Trượt sang phải | Vào | quay lại, so sánh | nhắc ý trước, đối chiếu | dùng cho mọi clip liền nhau |
| `slide_up` | Trượt lên | Vào | tích cực, lướt feed | video dọc, kết quả, con số tăng | tin buồn |
| `slide_down` | Trượt xuống | Vào | rơi vào, đóng dấu | kết luận, thẻ giá, ảnh rơi vào khung | mở đầu video |
| `rotate` | Xoay vào | Vào | vui, bất ngờ | twist, giải trí, sticker ảnh | thương hiệu sang trọng |
| `shake` | Lắc | Vào | gắt, sốc | tin sốc, beat drop, lỗi | nội dung nhẹ nhàng; dùng dày |
| `sway` | Lắc lư | Vào | tinh nghịch, mềm | lifestyle, đồ ăn, trẻ em | tin tức, hướng dẫn kỹ thuật |
| `bounce` | Nảy | Vào | vui, năng lượng | ảnh sản phẩm dạng thẻ, khuyến mãi | cảnh toàn khung nghiêm túc |
| `blur` | Mờ nhoè | Vào | mơ màng, sang | hồi tưởng, BĐS cao cấp, mỹ phẩm | màn có chữ cần đọc ngay |
<!-- /fx:clip_in -->

Ra:
<!-- fx:clip_out -->
| `id` | Tên | Nhóm | Không khí | Dùng khi | Tránh |
|---|---|---|---|---|---|
| `fade` | Mờ dần | Ra | nhẹ, kết | clip cuối, ảnh phủ rút đi | ngay trước chuyển cảnh mạnh |
| `zoom_in` | Phóng ra | Ra | lao tới, dồn dập | trước cảnh hook, đẩy sang ý mới | kết video |
| `zoom_out` | Thu nhỏ | Ra | khép lại | tổng kết, ảnh thẻ rút đi | clip chính đang nói |
| `slide_l` | Trượt ra trái | Ra | tiến tới | nhường chỗ ý tiếp theo | dùng cho mọi clip |
| `slide_r` | Trượt ra phải | Ra | lùi lại | quay về ý trước | dùng cho mọi clip |
| `slide_up` | Trượt ra trên | Ra | lướt đi | video dọc kiểu lướt feed | tin buồn |
| `slide_down` | Trượt ra dưới | Ra | hạ xuống, kết | kết đoạn, rút ảnh minh hoạ | mở đầu |
| `rotate` | Xoay ra | Ra | vui, bất ngờ | kết đoạn giải trí | thương hiệu sang trọng |
| `sway` | Lắc lư ra | Ra | tinh nghịch | lifestyle, đồ ăn | tin tức |
| `blur` | Mờ nhoè | Ra | mơ màng | chuyển sang hồi tưởng, cảnh sang | màn có chữ cần đọc |
<!-- /fx:clip_out -->

Combo:
<!-- fx:clip_combo -->
| `id` | Tên | Nhóm | Không khí | Dùng khi | Tránh |
|---|---|---|---|---|---|
| `ken_burns` | Ken Burns | Combo | kể chuyện, sống động | b-roll ảnh tĩnh (ảnh AI, ảnh stock) cho khỏi đứng hình, BĐS, du lịch | video quay sẵn đã chuyển động mạnh |
| `pendulum` | Con lắc | Combo | đung đưa, thư thả | ảnh minh hoạ vui, đồ chơi, thời trang | tin tức, dữ liệu |
| `zoom_pulse` | Zoom vào-ra | Combo | nhấn nhá, sôi động | ảnh sản phẩm, khuyến mãi, nhạc vui | clip chính đang nói dài (chóng mặt) |
| `shake3d` | Lắc 3D | Combo | công nghệ, hiện đại | ảnh màn hình app, sản phẩm công nghệ | mặt người cận |
| `breathe` | Thở | Combo | êm, sống | ảnh tĩnh giữ lâu, chân dung, cảnh đẹp | chồng với Ken Burns |
| `drift` | Trôi | Combo | mơ màng, điện ảnh | cảnh thiên nhiên, BĐS, hồi tưởng | ảnh có chữ sát mép |
| `beat_shake` | Rung nhịp | Combo | mạnh, theo nhạc | montage, nhạc EDM, khoảnh khắc bùng nổ | đoạn nói chậm, tâm sự |
| `slow_spin` | Xoay chậm | Combo | lạ, nghệ thuật | ảnh sản phẩm trưng bày, intro nghệ thuật | clip dài (> 5 s, phóng quá to) |
<!-- /fx:clip_combo -->
### Hoạt ảnh ra (`anim_out.type`): đối xứng với Vào, chạy ngược tới lúc tắt
<!-- fx:anim_out -->
| `id` | Tên | Nhóm | Không khí | Dùng khi | Tránh |
|---|---|---|---|---|---|
| `pop` | Thu nhỏ | Cơ bản | vui, nổi bật | rời khung đối xứng với vào "pop"; từ khoá, con số, nhãn ngắn (mặc định) | đoạn chữ dài |
| `fade` | Mờ đi | Cơ bản | nhẹ, sang | rời khung đối xứng với vào "fade"; câu trích dẫn, thương hiệu cao cấp | hook cần giật mắt |
| `slide_l` | Trượt sang trái | Chuyển động | năng động | rời khung đối xứng với vào "slide_l"; tiêu đề đi vào từ phải, danh sách | chữ đặt sát mép trái |
| `slide_r` | Trượt sang phải | Chuyển động | năng động | rời khung đối xứng với vào "slide_r"; tiêu đề đi vào từ trái, đối xứng với slide_l | chữ đặt sát mép phải |
| `drop` | Bay lên | Chuyển động | chắc, đóng dấu | rời khung đối xứng với vào "drop"; kết luận, giá, nhãn "MỚI" | nhiều dòng cùng lúc |
| `blur_zoom` | Nhoè ra | Chuyển động | điện ảnh, mạnh | rời khung đối xứng với vào "blur_zoom"; tiêu đề lớn, mở màn, câu hook | chữ nhỏ, phụ |
| `fly` | Bay đi | Chuyển động | kể chuyện, dẫn mắt | rời khung đối xứng với vào "fly"; chữ hiện ở một chỗ rồi bay về vị trí (from_x / from_y) | không có vị trí bắt đầu rõ |
| `tumble` | Lật đi | Từng chữ | vui, sinh động | rời khung đối xứng với vào "tumble"; câu ngắn cần chú ý từng chữ | câu dài (> 20 ký tự) |
| `type` | Xoá chữ | Từng chữ | công nghệ, tò mò | rời khung đối xứng với vào "type"; câu hỏi, prompt AI, ghi chú | chữ hiện quá ngắn (< 1 s) |
<!-- /fx:anim_out -->

### Hoạt ảnh lặp (`anim_loop.type`): chạy sau khi vào xong, `speed` 0.25–3
<!-- fx:anim_loop -->
| `id` | Tên | Nhóm | Không khí | Dùng khi | Tránh |
|---|---|---|---|---|---|
| `pulse` | Nhịp đập | Chuyển động | nhấn, gấp | giá, ưu đãi, nút CTA, con số cần nhớ | chữ dài, đặt nhiều dòng cùng lúc |
| `sway` | Lắc lư | Chuyển động | vui, thả lỏng | sticker, nhãn vui, video giải trí | thương hiệu nghiêm túc |
| `bounce` | Nảy | Chuyển động | năng động, trẻ | mũi tên chỉ, "bấm vào đây", emoji | chữ lớn chiếm khung |
| `blink` | Nhấp nháy | Ánh sáng | cảnh báo, gây chú ý | "LIVE", "MỚI", cảnh báo ngắn | đoạn chữ cần đọc; người nhạy sáng |
| `float` | Trôi | Chuyển động | nhẹ, mơ màng, sang | tiêu đề giữ lâu, logo, thẻ sản phẩm cao cấp | chữ sát mép khung |
| `spin` | Xoay | Chuyển động | vui, kỹ thuật | huy hiệu tròn, icon, ngôi sao, "SALE" dạng tem | chữ (khó đọc khi xoay) |
| `sparkle` | Lấp lánh | Ánh sáng | sang, lấp lánh, quà tặng | mỹ phẩm, trang sức, giải thưởng, chữ vàng | nền trắng (không thấy sáng) |
| `wave` | Sóng chữ | Từng chữ | vui, nhạc, sinh động | tên bài hát, lời chào, câu ngắn theo nhạc | câu dài (> 20 ký tự); hình khối chỉ nhấp nhô cả khối |
<!-- /fx:anim_loop -->

## Thời gian
- Clip `i` bắt đầu tại tổng thời lượng các clip đứng trước. `TL.duration` nên bằng tổng các clip, cộng thêm phần đuôi nếu có thẻ kết.
- **Mọi thứ khác** (scenes, phụ đề, sfx, nhạc) dùng thời gian **đầu ra**. Khi người dùng cắt hoặc xoá một đoạn trên track chính (ripple), Studio phải dời theo:
  - phụ đề và các từ (`words[].s/e`), bỏ những từ nằm trong đoạn bị xoá;
  - scenes, sfx, nhạc.

## Tương thích
- Khi có clip, engine đặt `TL.aroll.frames = '@clip'` (và `'@cut'` cho cutout). Mọi module cũ gọi `url(fmtSeq(TL.aroll.frames, frameAt(t)))` vẫn tự lấy đúng khung của clip đang chạy, gồm cả cắt, tốc độ và thứ tự.
- `arollFilter(t)` đã gồm màu của clip.
- `arollImg(t)` vẽ cả chuyển cảnh.
- Hàm cho gói: `clipAt(t)` → `{c, i, lt, src}`, `srcFrame(clip, srcT)`, `mainTrack(t)`.
- Thời lượng và giây nguồn của clip luôn lấy từ `SpeedMap` (`engine/speed.js`: `dur`, `srcAt`, `ltAt`, `speedAt`), dùng chung cho engine, Studio (`studio/clips.js`, ripple `fClip` giữ phụ đề / cảnh theo giây nguồn khi đổi tốc độ, đường cong hay chiều phát) và `scripts/speed_curve.py` (cùng thuật toán, test so số ở `scripts/tests/test_speed_curve.py`). Đừng tự tính `(out − in) / speed` ở chỗ mới.

## Âm thanh
`mix_audio.py` thấy có `clips` thì dựng giọng từ các clip: cắt in/out, `atempo` theo tốc độ, áp âm lượng hoặc tắt tiếng, chèn im lặng cho ảnh tĩnh, nối lại, lưu ra `.studio/voice_clips.wav`. Đường cong: chia đoạn nguồn thành 16 đoạn, mỗi đoạn một `atempo`, đoạn nhanh hơn 4× im lặng; ngược: `areverse`; đứng hình: im lặng (`scripts/speed_curve.py`). Sau đó trộn nhạc và SFX như cũ.

## Chuyển dự án cũ sang clip
`{ src: {seq: TL.aroll.frames, fps: TL.fps, count: <số frame>}, audio: TL.audio.voice, in: 0, out: count / fps }`.
