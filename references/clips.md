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
| `volume`, `mute` | âm lượng (0–2), tắt tiếng |
| `filter` | `preset` (bảng *Bộ lọc* bên dưới) + `brightness`, `contrast`, `saturate` (1 = giữ nguyên), `hue` (độ), `temp` (−1…1), `blur` (px) |
| `flip` | lật ngang |
| `fit` | `cover` (mặc định), `contain`, `blurfill` (vừa khung, nền là chính nó làm mờ, dùng cho clip ngang trong video dọc) |
| `zoom`, `ox`, `oy` | phóng to 1–3 quanh điểm ox/oy (%) |
| `cutouts` | chuỗi PNG người đã tách nền, cùng cách đánh số với `src.seq` |
| `transition` | chuyển cảnh **vào** clip này: `{type, dur}`. `type` là một `id` của bảng *Chuyển cảnh* bên dưới, `dur` 0.1–1.5 s (mặc định 0.4). Clip trước tiếp tục chạy bên dưới, nên tổng thời lượng không đổi |
| `hidden` | bỏ qua clip |

## Danh sách hiệu ứng (sinh từ `engine/fx_registry.js`)
Nguồn duy nhất là `engine/fx_registry.js` (S28 `M202`): engine, Studio và prompt Claude đều đọc từ đó. Thêm hoặc sửa một loại ở registry rồi chạy `node scripts/fx_doc.mjs` để ghi lại các bảng này (test `s28_registry` kiểm khớp). Cột "Không khí / Dùng khi / Tránh" là mô tả `ai` Claude đọc khi chọn.

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
| `flash` | Loé sáng | Ánh sáng | sốc, cú đấm, khoảnh khắc | đúng beat drop, câu đinh, ảnh chụp/khoảnh khắc | quá 2–3 lần mỗi video; người xem nhạy sáng |
| `glitch` | Nhiễu | Nhiễu | công nghệ, gắt, căng | tin công nghệ/AI, lỗi, bất ngờ tiêu cực, nhạc điện tử | thương hiệu mềm mại, mỹ phẩm, BĐS cao cấp |
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
Hình vẫn vẽ ở `engine/vertical.js` `textLine`; registry giữ nhãn, nhóm và mô tả (`M205` gom hàm vào registry).
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

## Âm thanh
`mix_audio.py` thấy có `clips` thì dựng giọng từ các clip: cắt in/out, `atempo` theo tốc độ, áp âm lượng hoặc tắt tiếng, chèn im lặng cho ảnh tĩnh, nối lại, lưu ra `.studio/voice_clips.wav`. Sau đó trộn nhạc và SFX như cũ.

## Chuyển dự án cũ sang clip
`{ src: {seq: TL.aroll.frames, fps: TL.fps, count: <số frame>}, audio: TL.audio.voice, in: 0, out: count / fps }`.
