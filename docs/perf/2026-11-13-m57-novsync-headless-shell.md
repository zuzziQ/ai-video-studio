# `M57`: Chrome render không chờ vsync và dùng `chrome-headless-shell` — 2026-11-13

Làm theo khuyến nghị A+B của `docs/perf/2026-11-13-m56-capture.md` (mục 7). Mã đổi: `scripts/render_hw.mjs` (cờ + chọn file chạy),
`scripts/install_headless_shell.mjs` (mới), một bước tuỳ chọn trong `install.sh` / `install.ps1`, và một dòng ở `engine/hf.js`
(sửa chờ khối HyperFrames sẵn sàng, mục 3).

**Kết quả ngắn:** cả video nhanh hơn **21–23 %** ở 1080p (27,5–28,3 s → 21,7–21,8 s) và **29–30 %** ở 720p `neon` (22,4–23,1 s →
15,6–16,3 s). File ra **trùng md5** với đường hiện tại (GPU, có vsync). Khung mẫu 23 gói + `slate` và 15 khối HyperFrames WebGL:
không khung nào lệch dưới SSIM 0,9999 so với đường hiện tại sau khi sửa `engine/hf.js`, trừ khung đầu ngay sau khi gắn khối
`wireframe-portal-title` (lỗi đua có sẵn, đường mới dính thường hơn — mục 3).

## 1. Máy, dự án, tải máy

- i7-8700K 6 nhân / 12 luồng, 32 GB, GTX 1660 Ti (driver 560.94), Windows 10 19045, Node 24.22, ffmpeg 9.0.2.
  Chrome cài sẵn **156.0.8078.80**; `chrome-headless-shell` **156.0.8078.80** do `install_headless_shell.mjs` tải (cùng bản).
  Cả hai chạy GPU (ANGLE D3D11, `M50`), 4 worker, đoạn `veryfast` (`M51`).
- Dự án: bản chép `sample/clip-mau` (gói `slate`, 1080×1920, 947 khung), và bản `neon` 720×1280 (cùng timeline, `pack`/`caption_style` =
  `neon`); khung A-roll trích theo mục 5 của `docs/perf/2026-11-13-baseline.md`. Không mux tiếng (giống nhau mọi cấu hình).
- **Tải máy:** phiên `M53` (whisper GPU) có thể chạy song song; `nvidia-smi` lúc bắt đầu từng phép đo 15–30 % GPU. Máy nhẹ tải hơn lúc đo
  `M56` (đối chứng ở đây 27–28 s so với 35–41 s hôm đó), nên số tuyệt đối thấp hơn báo cáo `M56`; tỉ lệ cùng cỡ.

## 2. Cả video, A/B liền nhau, 2 lượt xen kẽ

`A` = đường hiện tại (`AVS_RENDER_NOVSYNC=0 AVS_CHROME_SHELL=0`), `B` = mặc định mới. Số là giây trong dòng `done` của `render.mjs`.

| Dự án | A lượt 1 / 2 | B lượt 1 / 2 | Nhanh hơn | md5 / SSIM B so A |
|---|---|---|---|---|
| sample `slate` 1080×1920 | 28,3 / 27,5 (33–34 fps) | **21,8 / 21,7** (43 fps) | −23 % / −21 % | md5 trùng cả hai lượt |
| `neon` 720×1280 | 23,1 / 22,4 (41–42 fps) | **16,3 / 15,6** (58–61 fps) | −29 % / −30 % | lượt 2 md5 trùng; lượt 1 SSIM 0,99907 (*) |

(*) A lượt 1 cũng khác A lượt 2 đúng bằng SSIM 0,99907, còn B lượt 1, B lượt 2 và A lượt 2 trùng md5 nhau: đây là dao động sẵn có của
đường cũ trên `neon`, không do `M57`.

Tách yếu tố (1080p, chạy ngay sau, cùng điều kiện):

| Cấu hình | Giây | md5 |
|---|---|---|
| chỉ bỏ vsync (`AVS_CHROME_SHELL=0`) | 22,9 | trùng A |
| chỉ `chrome-headless-shell` (`AVS_RENDER_NOVSYNC=0`) | 27,2 | trùng A |
| cả hai (mặc định) | 21,7–21,8 | trùng A |

Phần lớn lợi ích đến từ bỏ vsync; headless-shell thêm ~5 % khi đi cùng (một mình gần như không đổi trên máy này).

`--still` (1080p, t = 12,5 s): ảnh JPEG trùng md5 giữa A và B.

## 3. Khung mẫu theo gói và khối HyperFrames WebGL

Cách làm như `M50`: 720×1280, mỗi gói 6 thời điểm qua `recipe` (như `variants.mjs`), 23 gói (gồm 2 gói người dùng) + `slate` của sample;
**15 khối** HyperFrames có WebGL (12 khối của `M50` + `canopy-part-title`, `filmed-screen`, `orbit-card` tìm thấy khi quét `engine/hf`),
mỗi khối 4 thời điểm. Chụp đúng như `render.mjs` (`renderFrame` + CDP `captureScreenshot`), PNG không nén. Mỗi cấu hình chạy 2 lượt.

**Lần chạy đầu (mã `engine/hf.js` cũ)** lộ ra 3 khối lệch dưới 0,98: `canopy-part-title` (0,923 ở 2,4 s), `cuboid-carousel` (0,933 ở
1,33 s; khác cả giữa hai lượt B), `extruded-logo` (0,957 ở 1 s — khung B **thiếu chữ 3D “NOVA”**, chỉ còn quầng sáng nền).

Nguyên nhân (lỗi có sẵn, đường chụp nhanh hơn chỉ làm lộ): `engine/hf.js` chờ `w.__hf.buildReady` trước khi seek khối, nhưng các khối
khai báo nó là object `{ "<tên khối>": Promise }` (7 khối: dựng font/model 3D bất đồng bộ). `Promise.all([…, object])` coi object là
đã xong, nên khung đầu sau khi gắn khối có thể chụp trước khi khối dựng xong. Với vsync, mỗi khung chậm hơn ~45 ms nên thường kịp;
bỏ vsync thì không. Sửa: chờ mọi promise trong object (vẫn giữ trần 8 s).

**Sau khi sửa:**

| So sánh | Gói (144 khung) trùng byte | Khối WebGL (60 khung) trùng byte | SSIM nhỏ nhất của khung khác |
|---|---|---|---|
| A ↔ B lượt 1 | 134 | 47 | ≥ 0,99995 |
| A ↔ B lượt 2 | 136 | 50 | ≥ 0,99995 |
| A ↔ A (đường cũ tự so) | 132 | 53 | ≥ 0,99995 |
| B ↔ B (đường mới tự so) | 143 | 56 | ≥ 0,99995 |
| A trước sửa ↔ A sau sửa | 178/204 tổng | | ≥ 0,99995 |

Trong hai lượt này không khối nào lệch; các khung khác byte còn lại là dao động sẵn có (đường cũ tự so cũng khác ở cùng cỡ).

**Còn một khối lệch lúc có lúc không: `wireframe-portal-title`, chỉ ở khung chụp đầu tiên ngay sau khi gắn khối.** Lặp thêm (mỗi
lượt mở Chrome mới, gắn khối rồi chụp ngay):

| Gắn khối rồi chụp ngay ở | Đường cũ (A) sai | Đường mới (B) sai | Chụp lại cùng `t` sau 1,5 s |
|---|---|---|---|
| giữa khối, t = 1,6 s (bảng trên: 4 + 4 lượt) | 0/4 | 1/4 (SSIM 0,909) | đúng mọi lượt |
| giữa khối, t = 1,6 s (dò riêng, 3 + 6 lượt) | 1/3 | 4/6 (SSIM 0,85–0,91) | đúng mọi lượt |
| đầu khối, t = 0 / 0,033 / 0,067 s (3 + 6 lượt) | 2/27 khung sai, chung cả hai đường | | đúng mọi lượt |

Khung sai hiện chữ của câu khác (“LETS GO THRU” thay vì “BREAKTHROUGH”). Đây là lỗi đua có sẵn của khối (đường cũ cũng dính),
bỏ vsync làm lộ thường hơn. Trong video thật nó chỉ rơi vào **một khung** ở chỗ khối bắt đầu, hoặc ở ranh giới đoạn khi một worker
bắt đầu giữa khối, và `--still`. Đã thử chờ 2 `requestAnimationFrame` rồi seek lại ở lần gắn đầu: khối này phụ thuộc lịch sử seek nên
khung đầu lại sai ổn định — đã bỏ. Cần sửa riêng (trong khối hoặc cách `hfMount` gắn khối mới), xem mục 5.

**Đã sửa (cùng ngày, PR xếp chồng).** Nguyên nhân: module script của khối có `await` ở cấp cao nhất (tải font Geist) **trước** dòng
gán `window.__hf.buildReady["wireframe-portal-title"]`, nên sự kiện `load` của iframe có thể bắn khi `buildReady` chưa tồn tại.
`hfMount` thấy không có gì để chờ, seek ngay (lúc này `__wptRender` chưa có nên không vẽ gì), rồi module chạy tiếp: vẽ `renderScene`
ở 0,3/0,5/0,7 thời lượng để làm nóng shader (t = 2,4/4,0/5,6 s — câu thay thế đã hiện) cách nhau bằng `setTimeout(0)`, rồi mới vẽ lại
`tl.time()`. Ảnh chụp rơi vào giữa các lần vẽ làm nóng thì ra câu chữ khác. Seek lại cùng `t` không gọi `onUpdate` của GSAP nên khung
sai đứng yên (giải thích lần thử "2 rAF rồi seek lại" ở trên). `canopy-part-title` cũng gán `buildReady` sau một `await` cấp cao nhất.

Sửa chung trong `engine/hf.js` (không đụng khối): sau `load`, nếu script của khối có nhắc `buildReady` thì chờ nó xuất hiện (16 ms/lần,
trần 8 s) rồi mới chờ các promise trong đó như trước. Khối gán `buildReady` sớm trong script thường thoát vòng chờ ngay.
Test tĩnh: `scripts/tests/hf_ready.test.mjs`.

| Gắn khối rồi chụp ngay (Chrome mới mỗi lượt) | Trước sửa | Sau sửa |
|---|---|---|
| t = 1,6 s, đường mặc định (B) | 3/6 + 4/10 sai (`a5f9a60d`, `d095cefa`) | **0/10** sai (`69b6f064` mọi lượt) |
| t = 1,6 s, đường cũ (A) | 1/10 sai | **0/10** sai |
| t = 0 / 0,033 / 0,067 s, B (9 lượt) | 2/27 (chung hai đường) | **0/27** khác lượt chụp lại |
| t = 0 / 0,033 / 0,067 s, A (9 lượt) | | 1/27 khác md5, SSIM 1,000000, lượt thứ ba trùng lượt đầu |

Khung khác md5 còn lại ở đường cũ là nhiễu vsync sẵn có (ở t = 3,2 s đường cũ cũng đổi qua lại `b5b083b9`/`485fb217`, SSIM 1,000000,
cả trước lẫn sau sửa; đường mặc định không có).

Kiểm lại khung mẫu (cùng `qa.mjs`, 204 khung) sau sửa: B sau sửa ↔ B trước sửa (lượt có khung sai) trùng byte 200/204, khác duy nhất
`wireframe-portal-title@1,6` (nay là khung đúng `69b6f064`); `canopy-part-title@2,4` (cũng gán `buildReady` muộn) gắn rồi chụp ngay
6/6 lượt trùng khung chụp lại. A ↔ B sau sửa: gói + `slate` 132/144, khối WebGL 52/60 trùng byte, SSIM nhỏ nhất ≥ 0,99999, không khối
nào dưới 0,98.

Hai khối lệch của `M50` (`vfx-text-cursor`, `wireframe-portal-title`) là GPU so với SwiftShader, không thuộc phép so này.

## 4. Hành vi mới

- Mọi Chrome mở qua `launchChrome` (render, `--still`, `thumbs`, `batch`, `build_templates`, `fx_audit`, `hf_import`) thêm
  `--disable-gpu-vsync --disable-frame-rate-limit`, cả chế độ GPU lẫn SwiftShader. `AVS_RENDER_NOVSYNC=0` tắt.
- File chạy: `AVS_CHROME_SHELL=<exe>` nếu đặt (`0` = không dùng), không thì bản mới nhất trong `$AVS_HOME/chrome-headless-shell`
  (bố cục của `@puppeteer/browsers`). Thứ tự thử: shell + GPU → Chrome + GPU → shell + SwiftShader → Chrome + SwiftShader.
  Shell mở lỗi, hoặc chỉ Chrome đầy đủ có GPU, thì cả lượt dùng Chrome; mỗi tiến trình quyết một lần như `M50`.
  Đã thử thật: đường dẫn shell sai → Chrome; file shell hỏng (`spawn UNKNOWN`) → in một dòng, dùng Chrome GPU;
  `AVS_RENDER_GPU=0` → SwiftShader trên headless-shell.
- `node scripts/install_headless_shell.mjs [--version X]`: đọc bản Chrome máy này (mở headless một lần), tải `chrome-headless-shell`
  cùng bản dựng (`156.0.8078` → 156.0.8078.80), không có thì cùng milestone, cuối cùng `stable`; xoá bản cũ trong thư mục đó.
  Dùng `@puppeteer/browsers` (đã có sẵn vì `puppeteer-core` phụ thuộc). Tải ~14 s trên máy này. Bộ cài gọi bước này sau `npm install`;
  lỗi chỉ in một dòng, cài đặt đi tiếp.
- `node scripts/render_hw.mjs` in thêm `executable` (`chrome` / `chrome-headless-shell`), đường dẫn, phiên bản, `vsync`.

## 5. Chưa đo / rủi ro còn lại

- `wireframe-portal-title`: khung đầu sau khi gắn khối — đã sửa (mục 3). Phép đo dùng sample trên máy này; khối nào sau này gán
  `buildReady` muộn mà không nhắc chữ `buildReady` trong script thì vòng chờ không nhận ra.

- macOS/Linux và máy không GPU: chỉ kiểm bằng test giả (`scripts/tests/render_hw.test.mjs`) và `AVS_RENDER_GPU=0` trên máy này.
- Chrome tự cập nhật thì headless-shell lệch bản đến khi chạy lại lệnh cài (vẫn chạy được; trên máy này cùng bản nên md5 trùng).
- `thumbs.mjs`, `batch.mjs`, `build_templates.mjs`, `fx_audit.mjs`, `hf_import.mjs` chỉ đổi qua `launchChrome`, chưa chạy lại toàn bộ.
- `scripts/hf_import.mjs:147` có cùng kiểu chờ `buildReady` như một promise (chỉ ảnh hưởng ảnh xem trước khi nhập khối) — chưa sửa ở PR này.

## 6. Đo lại

```bash
# dự án như mục 1; AVS_HOME trỏ tới nơi có chrome-headless-shell
node scripts/install_headless_shell.mjs
AVS_RENDER_NOVSYNC=0 AVS_CHROME_SHELL=0 node scripts/render.mjs <tl.json> a.mp4   # đường cũ
node scripts/render.mjs <tl.json> b.mp4                                           # mặc định M57
md5sum a.mp4 b.mp4; ffmpeg -i a.mp4 -i b.mp4 -lavfi ssim -f null -
```
