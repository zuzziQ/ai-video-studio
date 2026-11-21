# S28 / S29 — Edit kiểu CapCut: chuyển cảnh, hoạt ảnh, hiệu ứng, màu, tốc độ

Lập 2026-11-21, chủ repo duyệt cùng ngày (`C39`–`C43` chốt theo đề xuất mục 5). Tiếp nối `S20` (chỉnh element trên khung). `S20` làm phần *thao tác*; đợt này làm phần *chất liệu edit*: chuyển cảnh, hoạt ảnh clip / chữ, hiệu ứng, màu, tốc độ, nhịp.

Nguồn nghiên cứu CapCut:
- Trang chính thức: capcut.com `help/keyframes-in-capcut-pc`, `help/capcut-transitions`, `tools/free-video-transitions`, `tools/speed-ramp`, `tools/hsl-color`, `resource/capcut-stabilizer`, `desktop/captions-for-video`, `create/audio-ducking-…`.
- Bài bên thứ ba: Filmora (timeline, mask, color grading), Shotkit (velocity), Tuts+ (transitions, body effects), atomisystems (review PC 2026).
- CapCut không công bố danh sách preset đầy đủ. Tên preset và khoảng giá trị ở mục 1 cần mở app kiểm lại trước khi dùng làm spec.

## 1. CapCut làm thế nào (phần liên quan đợt này)

| Nhóm | CapCut | Mẫu UX |
|---|---|---|
| Chuyển cảnh | ~13 nhóm tab (Trending, Basic, Camera, Overlay, Light, Split, Distortion, Glitch, Blur, Slide, MG, Mask, Social). Tham số chỉ có **thời lượng** (~0.1–2 s+). Không cần chừa handle, tổng thời lượng giữ nguyên. | Kéo thả vào chỗ nối, chạm là xem trước ngay trên footage thật, nút **Áp cho tất cả** |
| Hoạt ảnh clip | 3 tab **In / Out / Combo**. In / Out mỗi bên một thanh thời lượng; Combo chạy suốt clip (pendulum, zoom vào-ra, lắc 3D). Áp cho video, ảnh, chữ, sticker. | Lưới thumbnail, chạm lại để bỏ, mục "Không" |
| Hoạt ảnh chữ | In / Out / **Loop** riêng, thời lượng hoạt ảnh độc lập với thời lượng lớp chữ; text template | như trên |
| Hiệu ứng | Video effects theo nhóm, mỗi cái 1–3 thanh (cường độ, tốc độ, phạm vi). Hai cách áp: **gắn vào clip** hoặc **thành clip trên track Hiệu ứng** phủ mọi lớp bên dưới, kéo dài / ngắn được | Thanh màu riêng trên timeline |
| Màu | Bộ lọc có **cường độ 0–100**; Adjust (sáng, tương phản, bão hoà, phơi sáng, nét, vùng sáng / tối, nhiệt độ, tint, fade, vignette, hạt); HSL 8 màu, Curves, LUT `.cube`, Color match, Auto color. Adjust cũng đặt được thành lớp trên track | Áp cho tất cả, lưu preset |
| Tốc độ | Thường 0.1–100×, giữ cao độ. **Đường cong**: Montage, Hero, Bullet, Jump cut, Flash in, Flash out + tuỳ chỉnh điểm. Freeze (ảnh tĩnh ~3 s tại đầu đọc), Reverse | Đường cong preset một chạm |
| Keyframe | Hình thoi cạnh **từng thuộc tính**: vị trí, cỡ, xoay, mờ, tham số màu / hiệu ứng, mask, âm lượng; ease vào / ra, PC có preset đường cong | Chỉ hiện khi đang chọn clip |
| Nhịp | Auto Beat đánh dấu nhịp trên nhạc, clip hít vào nhịp, Auto Velocity theo nhịp | Vạch nhịp trên track nhạc |
| Hàng loạt | Copy / Paste **thuộc tính** (chọn mục), My presets | Menu chuột phải |
| Ghép lớp | Blend mode, chroma key (ống hút, cường độ, bóng), mask keyframe được | — |

Top tạo nên "cảm giác CapCut" cho short-form, theo nghiên cứu:
1. Bấm preset là xem ngay trên footage thật.
2. Một thanh trượt cho mỗi preset.
3. Áp cho tất cả.
4. In / Out / Combo một chạm.
5. Đường cong tốc độ preset.
6. Track hiệu ứng phủ nhiều clip.
7. Vạch nhịp.

## 2. Studio đang có gì (đọc mã 2026-11-21)

| Nhóm | Hiện có | Giới hạn chính |
|---|---|---|
| Chuyển cảnh | 15 loại ở `engine/engine.js:177` `TRANS`: fade, dissolve, slide ×3, push, zoom, zoom_out, blur, whip, spin, wipe, circle, flash, glitch. Kiểu "vào clip": clip trước chạy tiếp dưới nền, tổng thời lượng giữ nguyên. Đặt ở chỗ nối của Video chính (nút + kéo thả). 0.1–1.5 s. Có Áp cả video (`library.js:500`) | Chỉ ở track chính; không có tham số (hướng, màu, easing); xem thử chỉ là demo CSS trừu tượng (`studio.css`), không chạy trên footage |
| Danh sách | `TRANS` engine, `TRANS_TYPES` (`studio/clips.js:16`), `75_ask.core.js` TRANS + TRANS_VI, keyframes `.t-*` trong CSS, `references/clips.md` | Thêm một loại phải sửa 5–6 chỗ, không có registry |
| Hoạt ảnh chữ | 9 loại vào (`engine/vertical.js:43`) | Không có Ra / Lặp riêng, chỉ phong bì mờ chung `ENV`; shape / celem / hf mỗi nơi một bộ anim |
| Hoạt ảnh clip | Không có | — |
| Hiệu ứng | `TL.fx` 10 hiệu ứng nhấn (`engine.js:438`); 18 khối HyperFrames "Chuyển cảnh phủ" | `TL.fx`, `TL.grade`, `TL.zoom` chỉ AI / template ghi, **không hiện trên timeline hay inspector** |
| Màu | 8 LUT dạng CSS filter (`engine.js:99`, chép lại ở `clips.js:20`); chỉnh sáng, tương phản, bão hoà, hue, nhiệt độ, mờ | Chỉ clip chính; không cường độ; không HSL / curves / `.cube`; không keyframe |
| Keyframe | x, y, scale, rot, opacity, 7 easing (`engine.js:299`, `60_keyframes.js`) | Chỉ scene và dòng chữ; clip chính, mask, màu, âm lượng không có |
| Tốc độ | Đều 0.25–4×, tiếng `atempo` | Không đường cong, freeze, reverse |
| Nhịp | `beats.py`, `beat_project.py`, gói beatslide | Không có vạch nhịp hay hít nhịp trong Studio |
| Hàng loạt | Áp chuyển cảnh / bộ lọc cả video, áp kiểu cho mọi phụ đề, chép / dán element | Không chép thuộc tính, không preset người dùng |
| Mask / nền | 7 hình mask, feather, invert; tách nền rembg; `blurfill`; bám mặt đổi khung | Mask không keyframe; không chroma key, ổn định hình |
| Nền tảng | Khung xem trước là engine thật trong iframe, render dùng cùng trang qua `renderFrame`. **Xem trước khớp render** | Mọi hiệu ứng là chuỗi CSS theo `t`; chưa có lớp canvas / WebGL |

Điểm mạnh nên giữ: engine là hàm thuần theo `t`, nên xem trước khớp render. Mọi thứ mới phải giữ tính chất này, tức không dùng CSS animation chạy theo đồng hồ.

## 3. Ma trận

| Giữ | Nâng cấp | Thêm | Loại (không làm) |
|---|---|---|---|
| Engine thuần theo `t`, chuyển cảnh không đổi tổng thời lượng | Chuyển cảnh: registry + tham số + nhóm + xem thử trên footage | Hoạt ảnh clip In / Out / Combo | Body effects, retouch / làm đẹp mặt, Relight AI |
| Áp cả video | Hoạt ảnh chữ thêm Ra / Lặp, một bộ anim chung | Track Hiệu ứng / Điều chỉnh (lớp phủ theo thời gian) | Đổi giọng nhân vật |
| Keyframe 7 easing | Màu: cường độ, Adjust đủ, áp cho b-roll / lớp phủ | Đường cong tốc độ, freeze, reverse | Sinh video AI (Seedance), chợ template cộng đồng |
| 203 khối HyperFrames | Keyframe cho clip chính, mask, màu, âm lượng | Vạch nhịp + hít nhịp | Nhiều track video chồng thật (để đợt riêng, `C42`) |
| | `TL.fx` / `TL.grade` hiện thành khối sửa được | Chép / dán thuộc tính, preset người dùng | |
| | | Chroma key, LUT `.cube` (sau `C39`) | |

## 3b. Chọn theo thế mạnh: Claude làm cùng người dùng (chủ repo 2026-11-21)

Thế mạnh riêng của Studio:
- Claude dựng, sửa và đề xuất trên cùng một timeline: AI dựng, Tự lái, tab Claude có thẻ Nhận / Bỏ / Hoàn tác, kịch bản → mẫu (`M191`), gu thương hiệu (`M192`).
- CapCut có AI nhưng rời từng nút. Studio thì một tác tử hiểu cả video.

Vì vậy một tính năng CapCut chỉ đáng lấy khi nó làm Claude dựng hay hơn, hoặc làm người dùng sửa việc Claude làm nhanh hơn. Thang chấm:
- **A**: Claude dùng được ngay và người dùng thấy, sửa được.
- **B**: chỉ người dùng dùng.
- **C**: nặng, ít liên quan AI.

| Thứ tự | Mục | Hạng | Vì sao hợp thế mạnh AI |
|---|---|---|---|
| 1 | `M202` Registry + xem thử | **A** | Claude chỉ dùng được thứ nó biết. Mỗi mục registry có thêm `ai: {mood, nhịp, khi_nào, tránh}`, nên Claude chọn chuyển cảnh theo nội dung câu nói và gu thương hiệu thay vì chọn bừa. Xem thử trên footage dùng luôn cho thẻ đề xuất của Claude |
| 2 | `M206` Track Hiệu ứng | **A** | Hôm nay Claude đã ghi `TL.fx` / `TL.grade` nhưng người dùng **không thấy** để sửa. Hiện thành khối trên timeline thì việc AI làm nhìn thấy và sửa được, người dùng tin AI hơn |
| 3 | `M210` Vạch nhịp | **A** | `beats.py` đã có. Claude đặt chuyển cảnh, hiệu ứng nhấn, cắt b-roll đúng nhịp mạnh: chất "edit theo nhạc" mà người dùng khó tự làm |
| 4 | `M204` + `M205` Hoạt ảnh Vào / Ra / Combo / Lặp | **A** | Cho Claude thêm từ vựng. Combo Ken Burns làm b-roll ảnh tĩnh do AI tìm hết bị đứng hình. Chữ graphic AI đặt có thêm Ra / Lặp |
| 5 | `M207` Tốc độ cong, freeze, tua ngược | **A** | Claude nhấn khoảnh khắc hook: freeze + zoom ở câu đinh, Hero / Bullet ở cảnh khoe sản phẩm. Rẻ (xem mục 5b) |
| 6 | `M211` Chép thuộc tính + preset riêng | **A** | Preset người dùng lưu là dữ liệu học cho gu thương hiệu `M192`. Claude dùng lại preset của chính người dùng |
| 7 | `M203` Chuyển cảnh v2 (tham số, nhóm, +15 loại) | **B+** | Phần lớn giá trị đã nằm ở `M202`; thêm loại sau khi registry có mô tả AI |
| 8 | `M208` Màu đủ | **B** | Thêm "Claude chọn màu": đọc khung và gu thương hiệu, chọn bộ lọc + cường độ (thẻ Nhận / Bỏ) |
| 9 | `M209` Keyframe mở rộng | **B** | Công cụ tay cho người làm chuyên nghiệp |
| 10 | `M212` Chroma key, LUT `.cube` | **C** | Làm theo cách nướng sẵn ở mục 5a |

Mỗi mục hạng A thêm hai việc ngay trong PR của nó:
1. Prompt và kiểm tra đầu ra của Claude biết loại mới (`75_ask.core.js` đọc từ registry).
2. Có thẻ đề xuất xem thử được.

Không có mục "AI riêng" tách ra.

## 4. Mục (mỗi mục một PR 300–800 dòng)

### Đợt `S28`: nền + chuyển cảnh + hoạt ảnh

#### `M202` Registry hiệu ứng chung + xem thử trên footage thật (nền, làm trước)
- File mới `engine/fx_registry.js` là nguồn duy nhất cho chuyển cảnh, hoạt ảnh chữ, LUT. Mỗi mục gồm: `id`, nhãn Việt, nhóm, icon, tham số (kiểu, min / max / mặc định), hàm `(k, params) → [inStyle, outStyle]`.
- Các nơi sau đọc từ registry thay cho danh sách riêng: `engine.js TRANS`, `clips.js TRANS_TYPES`, `75_ask.core.js` (Claude biết đủ loại và tham số), `references/clips.md` (sinh bảng).
- Xem thử: rê chuột hoặc focus một ô chuyển cảnh thì khung xem trước phát đoạn ±1 s quanh chỗ nối đang chọn với loại đó, dùng TL tạm, không ghi undo. Rời ô là trả lại.
- Test: `s28_registry` (mọi id cũ vẫn có, hàm thuần cùng `k` cho cùng chuỗi, timeline cũ dựng ra giống hệt khung cũ).

#### `M203` Chuyển cảnh v2: tham số, nhóm, thêm ~15 loại CSS
- Tham số chung: thời lượng 0.1–3 s, easing (5 preset). Tham số riêng: hướng (trượt, đẩy, lau, whip), màu (flash, chớp đen / trắng), cường độ (glitch, lắc).
- Loại mới viết bằng CSS:
  - Camera: kéo vào, zoom mờ, lắc.
  - Light: chớp trắng / đen, rò sáng (gradient phủ), cháy phim.
  - Distortion: tách RGB (3 lớp lệch màu), gợn.
  - Mask: lau hình tim / sao / thoi (clip-path), lau chéo, rèm, lưới ô.
  - Slide: lật 3D (perspective + rotateY), cuộn trang.
- Panel Chuyển cảnh chia tab theo nhóm, có ô tìm, mục "Không".
- Inspector chỗ nối: thời lượng, easing, tham số, nút Áp cho tất cả (giữ tham số).
- Test engine + dựng `sample/` trên máy.

#### `M204` Hoạt ảnh clip In / Out / Combo
- `clip.anim = { in:{type,dur}, out:{type,dur}, combo:{type,speed} }` cho clip Video chính, b-roll, ảnh phủ.
- Preset ban đầu:
  - In 12: mờ, zoom vào / ra, trượt 4 hướng, xoay, lắc, lắc lư, nảy, mờ nhoè.
  - Out 10: bản đối xứng của In.
  - Combo 8: Ken Burns, con lắc, zoom vào-ra, lắc 3D, thở, trôi, rung nhịp, xoay chậm.
- Ghép vào transform của `clipLayer`, cộng dồn với keyframe nếu có (keyframe thắng phần trùng thuộc tính).
- Tab Hoạt ảnh trong Thuộc tính của clip: 3 tab con, lưới, thanh thời lượng, xem thử như `M202`.
- Sau `M202`.

#### `M205` Hoạt ảnh chữ và element: Vào / Ra / Lặp, một bộ anim chung
- Gom các bộ `vertical.js` (chữ), `shape.js`, `celem.js`, sticker thành một bộ anim chung `{in,out,loop}` trong registry.
- Thêm Ra: 9 loại đối xứng của Vào. Thêm Lặp 8 loại: nhịp đập, lắc lư, nảy, nhấp nháy, trôi, xoay, lấp lánh, sóng chữ.
- Thời lượng hoạt ảnh độc lập với thời lượng lớp.
- Dữ liệu cũ (`L.anim`) đọc thành `in`.
- Thanh nổi chữ (`M140`) có thêm Ra / Lặp.
- Sau `M202`; song song được với `M204` (khác file engine).

#### `M206` Track Hiệu ứng / Điều chỉnh
- Nhóm track mới "Hiệu ứng" trên timeline. Mỗi khối `{type, start, end, params, target: 'all'|'main'}` phủ mọi lớp bên dưới, kéo dài / ngắn, khoá, ẩn.
- `TL.fx` và `TL.grade` hiện có đọc vào thành khối của track này. AI / template vẫn ghi như cũ, người dùng giờ thấy được và sửa được.
- Hiệu ứng mới viết bằng CSS:
  - Lớp phủ gradient / filter: rò sáng, VHS, hạt phim, vignette, letterbox, phát sáng, chia đôi gương, mờ viền, đen trắng nhấn màu (gần đúng), nhịp sáng.
  - Mỗi hiệu ứng ≤ 3 thanh: cường độ, tốc độ, phạm vi.
- Khối "Điều chỉnh" cùng track: các thanh màu của `M208` áp cho đoạn.
- Sau `M202`. Cần chốt `C41`.

### Đợt `S29`: màu, tốc độ, keyframe, nhịp, hàng loạt

#### `M207` Đường cong tốc độ, freeze, reverse
- `clip.speedCurve`: các điểm `[{x,y}]`; preset Montage, Hero, Bullet, Jump cut, Flash in, Flash out; editor điểm kéo được.
- Engine ánh xạ `lt → src` bằng tích phân tốc độ. Giữ hàm thuần, nên render khớp xem trước.
- Âm thanh theo đường cong: chia đoạn `atempo` trong `mix_audio.py`, hoặc tắt tiếng khi > 4× (ghi rõ trong UI).
- Freeze: chèn đoạn 3 s giữ nguyên `srcT` tại đầu đọc (không trích ảnh).
- Reverse: đọc chuỗi khung ngược (mục 5b, `C40`), âm thanh `areverse`.
- Kèm khung xem trước 540p cho máy yếu (mục 5b). Tách thành `M213` nếu PR vượt 800 dòng.

#### `M208` Màu: cường độ bộ lọc, Adjust đủ, áp cho mọi lớp
- Cường độ 0–100 cho 8 LUT: nội suy filter, thay cho hai bản chép `engine.js:99` / `clips.js:20`, lấy từ registry.
- Adjust thêm: phơi sáng, vùng sáng / tối (SVG `feComponentTransfer`), nét, fade, vignette, hạt.
- Áp được cho b-roll, ảnh phủ, khối Điều chỉnh (`M206`). Keyframe được (cùng hệ `M209`).
- HSL / curves / `.cube`: sau `C39`.

#### `M209` Keyframe mở rộng
- Hình thoi cạnh từng thuộc tính trong Thuộc tính (vị trí, cỡ, xoay, mờ, màu, mask, âm lượng).
- Keyframe cho clip chính, mask, tham số màu, âm lượng nhạc / giọng. Âm lượng: `mix_audio.py` dựng đường bao `volume=…:eval=frame`.
- Thêm easing preset dạng bezier (ease vào / ra / cả hai, nảy, đàn hồi).

#### `M210` Vạch nhịp và hít nhịp
- Nút Nhịp trên khối nhạc: gọi `beats.py` qua một job mới trong `scripts/queue.mjs` (tệp nóng). Vạch nhịp vẽ trên track nhạc, mức 1/1, 1/2, mỗi phách.
- Snap: mép clip, element, chuyển cảnh hít vào nhịp.
- Lệnh "Cắt theo nhịp": chia clip đang chọn tại các nhịp. "Hiệu ứng theo nhịp": đặt khối `M206` ngắn tại mỗi nhịp mạnh.

#### `M211` Chép / dán thuộc tính + preset người dùng
- Menu chuột phải: Chép thuộc tính, rồi Dán thuộc tính với hộp tích chọn mục (hoạt ảnh, màu, mask, chuyển cảnh, tốc độ, keyframe).
- Lưu preset (chuyển cảnh + tham số, hoạt ảnh, màu, kiểu chữ) vào `~/.ai-video-studio/presets.json`, hiện ở tab "Của tôi" trong từng panel.
- Áp cho tất cả mở rộng sang hoạt ảnh clip và màu.

#### `M212` Nướng sẵn bằng ffmpeg: chroma key, LUT `.cube`, HSL / curves, ổn định hình
- Thực hiện theo mục 5a: một job nền trong `scripts/queue.mjs` biến chuỗi khung của đoạn `in–out` thành chuỗi mới, rồi engine đổi `seq`.
- Lúc kéo thanh trượt thì xem trước gần đúng bằng CSS, thả tay mới nướng.
- Chuyển cảnh shader WebGL có bản CSS dự phòng: làm sau, chỉ khi cần.

## 5a. WebGL: giảm rủi ro thế nào

Rủi ro thật: khung GPU khác khung SwiftShader (`M50`: `vfx-text-cursor` khác hạt nhiễu, `wireframe-portal-title` sáng hơn), máy yếu hoặc không có GPU chạy chậm, và Chrome giới hạn khoảng 16 context WebGL. Cách giảm, theo thứ tự ưu tiên:

1. **Nướng sẵn bằng ffmpeg thay vì WebGL lúc chạy.** Chroma key (`colorkey` / `chromakey`), LUT `.cube` (`lut3d`), HSL / curves (`huesaturation`, `curves`), ổn định hình (`deshake`) đều là bộ lọc ffmpeg.
   - Một job nền xử lý chuỗi khung JPEG của clip thành chuỗi mới, giống cách `cutouts` của rembg đang làm.
   - Engine chỉ đổi `seq`: không thêm mã dựng hình, xem trước khớp render, cùng kết quả trên mọi máy, **máy yếu không tốn gì lúc phát**.
   - Lúc kéo thanh trượt thì xem trước gần đúng bằng CSS filter (đã có), thả tay mới chạy job nướng. Chỉ nướng đoạn `in–out` đang dùng.
2. **WebGL chỉ còn cho chuyển cảnh shader** (luma wipe, displacement, morph): ngắn 0.3–1 s, ít khung.
   - Mỗi mục registry loại này bắt buộc có `css` dự phòng gần giống. Không có WebGL thì dùng bản CSS, không lỗi, không trắng khung.
3. **Shader tất định:**
   - Không dùng `Math.random` hay đồng hồ, nhiễu lấy hạt giống từ `t` và id.
   - `precision highp` và chỉ phép toán cơ bản. Không `fwidth` hay đạo hàm, tránh khác nhau giữa các driver.
   - Không đọc ngược pixel từ GPU.
4. **Một canvas WebGL dùng chung cho cả khung** (vẽ lần lượt từng hiệu ứng), không mỗi element một context.
5. **Cổng ảnh vàng:** test máy `s28_webgl` dựng khung mốc của mọi hiệu ứng WebGL bằng GPU và SwiftShader, đòi SSIM ≥ 0,98 (cùng ngưỡng `M50`). Hiệu ứng nào trượt thì registry đánh dấu `gpu_only: false` và render dùng bản CSS.
6. **Biết máy:** `perf_profile.mjs` đã biết `chrome.mode` là gpu hay swiftshader. Với SwiftShader, panel đánh huy hiệu "nặng trên máy này" cho hiệu ứng WebGL, và Claude không tự chọn các hiệu ứng đó.

Hệ quả: `C39` đổi thành "không thêm lớp WebGL chung. Nướng sẵn bằng ffmpeg là chính, WebGL chỉ cho chuyển cảnh shader có bản CSS dự phòng".

## 5b. Tua ngược, freeze, tốc độ cong trên máy yếu

Engine không phát `<video>`. Clip là chuỗi JPEG, và `srcFrame(c, srcT)` chọn ảnh số `floor(srcT × fps)` (`engine.js:93`). Vì vậy:
- **Tua ngược = đọc ảnh theo thứ tự ngược.** `srcT = out − lt × speed`, không cần ffmpeg tạo file đảo, không giải mã ngược. Chi phí bằng phát xuôi trên mọi máy, cả lúc xem trước lẫn render.
- **Freeze = giữ nguyên `srcT`.** Không cần trích ảnh.
- **Tốc độ cong = `srcT` là tích phân của đường cong.** Chỉ tốn một phép tính mỗi khung.
- **Âm thanh:**
  - Ngược: `areverse` cho đúng đoạn đó trong `mix_audio.py`.
  - Cong: chia đoạn `atempo`. Tắt tiếng khi quá 4×, như CapCut.
  - Freeze: im lặng hoặc giữ nhạc.

Phần thực sự làm máy yếu chậm là **xem trước khung 1080p**: mỗi khung là một JPEG ~200 KB (`-q:v 3`, `new_project.mjs:107`), cộng CSS `blur` lớn. Đề xuất làm kèm `M207` (hoặc tách thành `M213`):
1. **Khung xem trước nhẹ (proxy):**
   - Trích thêm chuỗi 540p `-q:v 5` (~4 lần nhẹ hơn) chỉ cho Studio. Render vẫn dùng 1080p.
   - Engine chọn chuỗi theo cờ `PREVIEW`, cùng mã nên vẫn khớp hình.
   - Bật tự động khi `perf_profile` là `tiet-kiem` hoặc SwiftShader.
2. **Nạp trước theo hướng phát:** khi phát ngược thì nạp các ảnh phía trước theo chiều ngược. `preload` ở `engine.js:495` hiện đã gom `<img>` của khung kế.
3. **Bớt khung khi phát nếu không theo kịp** (bỏ khung, giữ tiếng). Dừng lại hoặc tua là hiện đủ khung. Render không bị ảnh hưởng.
4. **Giới hạn hiệu ứng nặng lúc xem trước:** CSS `blur` > 20 px vẽ ở nửa độ phân giải trong chế độ nhẹ, render vẫn đủ.

## 5. Quyết định cần chốt

- **`C39`: WebGL.** Đề xuất sửa: theo mục 5a, không thêm lớp WebGL chung. Chroma key, LUT, HSL, curves, ổn định hình nướng sẵn bằng ffmpeg thành chuỗi khung. WebGL chỉ cho chuyển cảnh shader, bắt buộc có bản CSS dự phòng và qua cổng SSIM GPU / SwiftShader.
- **`C40`: tua ngược.** Đề xuất sửa: đọc chuỗi khung theo thứ tự ngược ngay trong engine (mục 5b), không tạo file đảo. Âm thanh dùng `areverse`. Kèm khung xem trước 540p cho máy yếu.
- **`C41`: hiệu ứng gắn clip hay track riêng.**
  - Đề xuất: track riêng là chính, như CapCut và đúng hướng hiện `TL.fx`. Gắn clip chỉ cho màu (đã có) và hoạt ảnh (`M204`).
- **`C42`: nhiều track video chồng thật** (overlay video kiểu PIP có khoảng trống). Đề xuất: không làm trong `S28` / `S29`. Lớp phủ hiện tại qua cảnh `photo` / b-roll đủ cho short-form.
- **`C43`: số preset.** Đề xuất: ít mà đẹp, mỗi nhóm 6–12 loại có tên Việt rõ, thay vì chạy theo số lượng của CapCut (hàng trăm). Claude chọn được mọi loại nhờ registry.

## 6. Thứ tự và tệp nóng

**Chia session (chốt 2026-11-21).** Ba mục không phụ thuộc nhau, chạy song song ngay:
- `M202`: registry + xem thử.
- `M207`: tốc độ cong, freeze, ngược, khung xem trước 540p.
- `M210`: vạch nhịp, hít nhịp, cắt theo nhịp.

`M210` chưa làm phần "hiệu ứng theo nhịp", phần này đợi `M206`.

Sau `M202` merge, chạy đợt 2: `M206` ∥ `M204` ∥ `M205`. Rồi tới `M211`, `M203`, `M208` → `M209`, cuối cùng `M212`.

Theo thứ tự hạng ở mục 3b:
- **`S28`:**
  - `M202` một mình (nền).
  - Rồi song song `M206` ∥ `M204` ∥ `M205` (khác vùng engine: track fx / clipLayer / anim chữ).
  - Rồi `M210` (nhịp, cần `M206` để đặt hiệu ứng theo nhịp).
- **`S29`:**
  - Song song `M207` (+ khung xem trước 540p) ∥ `M211` ∥ `M203`.
  - Rồi `M208` → `M209`.
  - Cuối `M212` (nướng ffmpeg).
- Không mục nào sửa `studio/server.mjs`. `scripts/ai_qc.mjs` không đụng.
- `scripts/queue.mjs` có ở `M210` (job nhịp), `M212` (job nướng) và job trích 540p, phải làm nối tiếp.
- `docs/ROADMAP.md`: thêm đợt `S28` / `S29` sau khi chủ repo duyệt. Mỗi PR chỉ sửa dòng mục của mình.

## 7. Rủi ro

- **`M202` đổi nguồn của mọi chuyển cảnh.** Phải có test so chuỗi khung cũ với khung mới cho mọi `TRANS` id, để timeline cũ không đổi hình.
- **Xem thử dùng TL tạm.** Không được rò vào undo hay autosave. Tận dụng cơ chế xem trước của `Studio.review` nếu hợp.
- **Hoạt ảnh clip, keyframe và bám mặt cùng ghi `transform`.** Phải định nghĩa thứ tự ghép một lần ở `clipLayer`.
- **Tốc độ đường cong làm lệch phụ đề và từ ngữ.** `remapAll` phải hiểu đường cong, không chỉ hệ số `speed`.
- **Hiệu ứng CSS nặng (blur lớn, nhiều lớp) làm chậm render song song.** Đo trên `sample/` trước / sau từng mục (`docs/perf/`).
