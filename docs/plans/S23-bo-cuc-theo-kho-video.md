# S23 — Bố cục theo khổ video, timeline 3 mức, điểm trên thanh bước, dọn lỗi tồn đọng

Lập 2026-11-18. Mục ROADMAP: `M157`–`M166`, quyết định `C29`–`C32`. Nguồn: chủ repo yêu cầu sau `S22` — "thanh Hỏi Claude dưới
video tốn chỗ làm preview bé đi, menu trái và cột phải không để làm gì; timeline cần ẩn / thu nhỏ cho Cơ bản; video dọc thì preview
nên dọc; điểm ở cột phải đưa lên thanh bước, hover thấy lý do; app ghép từ nhiều phần mềm, cần lối thiết kế riêng". Kèm sửa lỗi tồn
đọng và cảnh báo trong mục "Rủi ro" của các PR #170–#194.

## 1. Hiện trạng đo được

`main` ở `376eb3e` (`S22` xong). Studio thật, 1600×900, dự án dọc 9:16, chế độ Chuyên nghiệp:

| # | Vùng | Đo được |
|---|---|---|
| K1 | Khung video | `#frame` 222×395 px: cao 44 % màn hình. Vùng giữa rộng 880 px, video dọc dùng 222 px. |
| K2 | Dưới khung | `#controls` 48 px + `#askbar` 75 px = 123 px chiều cao lấy từ video, đúng chiều video dọc thiếu. |
| K3 | Timeline | `--tlh` 300 px (1/3 màn hình), tối thiểu 180 px khi kéo, không nhớ lần kéo, không gấp được. |
| K4 | Hai cột | Thanh icon 68 + Media 312 + cột phải 340 = 720 px; Media trống khi Kho chưa có file. |
| K5 | Điểm | Chip điểm 5 bước + thanh tiến độ ở tab Dự án lặp lại thanh bước trên cùng; lý do trừ điểm phải mở tab. |
| K6 | Chế độ | `body.expanded` (nút ⤢) ẩn hai cột nhưng không nhớ, không theo chế độ hay khổ video. |

Test trên `main` (Windows): Python 109 OK, `node --check` sạch, Node 787/791; lỗi `kho_deliver` (liên kết cứng), `kho_media`
(junction, `rmSync` EISDIR) có từ trước `S22`; `engines_route` nhái giọng chập chờn khi chạy cả bộ. CI Linux xanh.

## 2. Hướng thiết kế: khung video ở giữa, người làm ở cạnh

Studio đang ghép bố cục CapCut (thư viện trái, timeline dưới), Premiere (Thuộc tính phải) và một khung chat. Đợt này chốt một cấu
trúc riêng, mỗi vùng một vai:

1. **Khung video là trung tâm, luôn lớn nhất có thể.** Bố cục tự chọn theo khổ: video dọc thiếu chiều cao, thừa chiều ngang → thứ
   đang xếp dưới khung (Hỏi Claude, nút phát) sang cạnh khung; video ngang thiếu chiều ngang → giữ dưới khung, gọn một dòng.
2. **Cạnh khung là "người làm".** Cơ bản: cột Claude (làm thay, người dùng duyệt; chọn element thì mục chính + Núm hiện trong cột
   này). Chuyên nghiệp: Thuộc tính / Lớp như `S21`, Hỏi Claude một dòng, mở rộng khi gõ.
3. **Timeline là công cụ, hiện nhiều hay ít theo việc**: dải tua 40 px → gọn ~120 px (Video chính + Phụ đề, track khác thành vạch) →
   đầy đủ (kéo cao thấp). Phím `` ` `` đổi mức, kéo mép trên, nhớ theo chế độ.
4. **Thanh bước kiêm bảng điểm**: mỗi bước một vòng điểm; rê chuột thấy mục chưa đạt và vì sao; bấm mục thì giao đúng việc cho thanh
   Hỏi Claude (việc theo bước của `M154`) hoặc mở chỗ sửa.

Ước tính ở 1600×900, video 9:16: Cơ bản khung cao ~720 px (gấp 1,8), Chuyên nghiệp ~560 px (gấp 1,4).

| Vùng | Cơ bản | Chuyên nghiệp |
|---|---|---|
| Thanh trái | Thanh icon; bấm thì Media / Mẫu… mở thành ngăn trượt đè lên, tự đóng khi thả / chèn | Thanh icon + panel, gấp bằng `[` |
| Cột phải | Cột Claude (video dọc) / ẩn (video ngang, Claude dưới khung) | Thuộc tính · Lớp · Dự án, gấp bằng `]` |
| Nút phát | Dòng mảnh dưới khung | Dòng dưới khung (chủ repo chốt 2026-11-18: không xếp dọc cạnh khung, khó hiểu với người dựng) |
| Hỏi Claude | Video dọc: cột cạnh khung; ngang: dòng dưới khung | Một dòng, mở rộng khi gõ / có kết quả |
| Timeline | Dải tua (mặc định) | Đầy đủ (mặc định), gọn khi cần |
| Điểm | Vòng điểm trên thanh bước + hover | Như Cơ bản |

Cửa sổ hẹp (< 1280 px) luôn về kiểu "Claude dưới khung, timeline gọn"; `responsive-layout` đo 1024 / 1440 / 1920.

## 3. Lỗi tồn đọng và cảnh báo từ PR trước

Gom từ mục "Rủi ro" của #170–#194 và lần chạy test. Cột "Xử lý": mục của đợt này, hoặc chấp nhận (ghi lý do).

| Nguồn | Vấn đề | Xử lý |
|---|---|---|
| test | `kho_deliver` liên kết cứng, `kho_media` junction lỗi trên Windows (có từ trước `S22`) | `M157` |
| test | `engines_route` nhái giọng: file tạm của bản huỷ chưa xoá kịp khi chạy cả bộ | `M157` |
| #191 | `broll`, `style_lab`, `autopilot`… vẫn gọi `puppeteer.launch` thẳng; chưa rõ vì sao Chrome không lên khi `USERPROFILE` tạm | `M158` |
| #194 | "Sửa hết lỗi" rồi Bỏ: timeline về cũ nhưng `.studio/qc.json` vẫn ghi lần sửa | `M159` |
| #193 | Bỏ kết quả Tự động: dòng tóm tắt panel vẫn ghi lượt vừa chạy; xem trước không nghe SFX / nhạc | `M159` |
| #189 | Khung chọn / thanh nổi theo timeline thật khi đang xem bản mới trong `Studio.review` | `M159` |
| #194 | Mở panel Chuyên nghiệp từ thanh Hỏi Claude ở Cơ bản: thanh trái hiện mục đó trong lúc mở | `M159` |
| #185 | Phím mũi tên trên thanh trượt Núm bị phím tắt chung chiếm | `M160` |
| #174 | Khung chọn của element đã xoay vẫn là hộp bao | `M160` |
| #175 | `getPos` trả `size` 60 cho cảnh không có cỡ, khối HF hiểu `size` là % → kéo trên khung có thể đổi cỡ | `M160` |
| #177 | Thanh nổi rộng hơn khung 9:16 hẹp, đè mép trên element cao | `M160` (khung lớn hơn sau `M161` giảm phần lớn) |
| #182 | Chấm ghim 24 px che góc element bên dưới | `M160` |
| #178 | Bảng Lớp chưa tách cảnh nền "back" | `M160` |
| #190 | Dải báo nổi che đỉnh preview ở 1024 px | `M161` (dải báo vào vùng riêng trên khung) |
| #192 | Panel trái hẹp, dòng 70 ký tự vẫn xuống hai dòng | `M165` |
| #174, #177 | Chưa thử khổ 16:9 cho sửa chữ trên khung, thanh nổi | `M166` |
| #175, #181 | Kéo thả bằng chuột thật, chuyển cảnh `openSect('trans')` chưa thử bằng chuột | `M166` |
| #171, #173 | AI dựng / Tự lái với nhạc thương hiệu chưa chạy thật đầu-cuối | `M166` (cần `claude` đăng nhập + render trên máy) |
| #193 | Câu tự do cho element tốn hai lượt mô hình | Chấp nhận (gợi ý nhanh đi thẳng; `C23` chỉ chạy khi bấm) |
| #194 | Hook mở đầu co chữ tối thiểu 28 px | Chấp nhận |
| #191 | Hồ sơ Chrome nằm lại `%TEMP%` tới lần sau | Chấp nhận (dọn khi cũ hơn 1 giờ) |
| #187 | Người đã có `onboarding.json` mở vào Chuyên nghiệp | Chấp nhận (`C13`) |
| #184 | Sửa tay trường của núm thì núm về 0 | Chấp nhận |
| #183, #179, #180 | Đổi thói quen bấm (thư viện, mũi tên, Lớp sang cột phải) | Chấp nhận, đã ghi `references/studio.md` |

Ngoài đợt (cần chủ repo hoặc máy khác): `M14` video quảng cáo thật, `M26` Ollama thật, `M29` FreePD, `M50` chốt 2 khối SSIM.

## 4. Mục và file

| Mục | Việc | File chính | Không đụng |
|---|---|---|---|
| `M157` | Test Windows: junction / liên kết cứng (sửa test hay sửa mã tuỳ nguyên nhân), nhái giọng chờ xoá file tạm | `scripts/tests/kho_*.test.mjs`, `scripts/kho_deliver.mjs`, `scripts/kho_media.mjs`, `scripts/tests/engines_route.test.mjs` | `studio/` |
| `M158` | Mọi script mở Chrome qua `scripts/chrome_profile.mjs`; tìm nguyên nhân Chrome không lên khi `USERPROFILE` tạm | `scripts/chrome_profile.mjs`, `scripts/broll*.mjs`, `scripts/style_lab*.mjs`, `scripts/autopilot.mjs` | `scripts/queue.mjs`, `studio/` |
| `M159` | Hỏi Claude / xem lại: Bỏ thì hoàn trả cả `qc.json` + tóm tắt Tự động, khung chọn theo bản đang xem, nghe SFX / nhạc khi xem trước, panel Pro mở từ thanh không hiện ở thanh trái Cơ bản | `74_review*.js`, `75_ask*.js`, `16_qc.js`, `20_ai.js` | `studio/studio.js` ngoài lời gọi sẵn có |
| `M160` | Sân khấu: mũi tên trên Núm, khung chọn xoay theo element, `size` của HF, thanh nổi trong khung hẹp, chấm ghim, cảnh "back" trong Lớp | `studio/studio.js` (phần `#overlay` / `pick`), `09_stage.core.js`, `66_canvas_cmds.js`, `67_keys.core.js`, `67_layers*.js`, `73_pins.js`, `71_knobs.js` | `studio.css` phần bố cục |
| `M161` | **Nền:** lõi bố cục `76_layout.core.js` (khổ × chế độ × bề rộng → vùng), timeline 3 mức (`--tlh` theo mức, phím, kéo, nhớ `avs.tl.<mức>`), thay `body.expanded`, vùng dải báo; API `Studio.layout` | mới `studio/features/76_layout*.js`, `studio/studio.css` (grid `main`, `#tlwrap`, `#center`), `studio/studio.js` (`fit`, kéo `#tlwrap`, nút ⤢), `studio/index.html` | `#overlay`, `renderInspector` |
| `M162` | Dải tua 40 px: ảnh nhỏ theo thời gian, playhead, vạch cắt / cảnh, kéo để tua, bấm đúp mở mức gọn | mới `studio/features/77_scrub.js`, khối CSS riêng | `#tl` đầy đủ |
| `M163` | Hỏi Claude cạnh khung khi video dọc: `75_ask.js` hai dạng (cột / dòng) theo `Studio.layout`; cột gộp gợi ý, kết quả, ô đề xuất của `Studio.review`; Cơ bản chọn element thì mục chính + Núm trong cột | `75_ask.js`, `74_review.js`, khối CSS riêng | `75_ask.core.js` (giữ hợp đồng việc) |
| `M164` | Điểm lên thanh bước: vòng điểm từng bước, hover popover mục chưa đạt + vì sao + điểm mất, bấm mục → `Studio.ask` / chỗ sửa; tab Dự án bỏ chip + thanh, giữ danh sách việc | `01_workflow.js` (`renderTabs`), `03_nextstep.js`, `02_score.core.js` (chỉ thêm hàm đọc) | `studio/studio.js` |
| `M165` | Hai cột theo chế độ: Cơ bản thanh trái mở ngăn trượt tự đóng; Chuyên nghiệp `[` / `]` gấp hai cột; ~~nút phát dọc cạnh khung video dọc~~ (bỏ, chốt 2026-11-18); dòng chữ panel hẹp | `01_workflow.js` (phần thanh trái), `library.js`, `studio.css` khối cột | `renderTabs` (của `M164`) |
| `M166` | Nghiệm thu: đo `responsive-layout` 1024 / 1440 / 1920 × 9:16 / 1:1 / 16:9 × 2 chế độ, các mục "chưa thử" ở bảng mục 3, cập nhật `references/studio.md` + `DESIGN.md` | test `s23_layout_matrix`, tài liệu | mã tính năng (chỉ sửa lỗi tìm thấy) |

Mỗi mục một PR, test riêng `scripts/tests/s23_<mục>.test.mjs` cho lõi thuần. Không mục nào sửa `studio/server.mjs`,
`scripts/queue.mjs`, `scripts/ai_qc.mjs`.

## 5. Chạy song song (tối đa 4 PR chờ duyệt)

```
Đợt 1 (bắt đầu ngay, 4 session)     Đợt 2 (sau M161 merge)          Đợt 3
  A  M157 test Windows ──┐            E  M162 dải tua                 I  M166 nghiệm thu
  B  M158 Chrome ────────┼─ xong ──►  F  M159 → M163 Claude cạnh khung   (sau mọi mục)
  C  M161 nền bố cục ────┘            G  M165 hai cột theo chế độ
  D  M164 điểm thanh bước             H  M160 sân khấu (sau M165)
```

- **Đợt 1** không chung file: A chỉ `scripts/tests` + `kho_*`; B chỉ script mở Chrome; C bố cục (`studio.css`, `fit` của
  `studio.js`, `index.html`, file mới); D `01_workflow.js` `renderTabs` + `03_nextstep.js`. C và D cùng chạm `studio.css` → D để
  CSS của mình ở khối cuối file có chú thích `/* S23 M164 */`, rebase khi C merge trước.
- **Đợt 2** bắt đầu khi `M161` merge (cần `Studio.layout` và vùng mới). A, B xong thì nhường chỗ PR cho E, F, G. `M159` và `M163` cùng
  `75_ask.js` / `74_review.js` → một session (F) làm nối tiếp, hai PR. `M165` sau `M164` (cùng `01_workflow.js`). `M160` sau `M165`
  vì cả hai đổi vùng quanh khung trong `studio.js` / `studio.css`.
- **Đợt 3**: `M166` một session, sau khi `M157`–`M165` merge.
- Mỗi session: worktree riêng, 1 mục = 1 PR, sửa đúng dòng của mục trong `ROADMAP.md`, ship bằng `pr-ship.py --branch auto` rồi
  dừng. Session đợt sau mở từ `main` mới nhất.

## 6. Ma trận giữ / nâng cấp / thêm / loại

| | Thứ |
|---|---|
| Giữ | Thuộc tính · Lớp · Dự án (`S21`), thanh Hỏi Claude và việc theo bước (`M153`, `M154`), `Studio.review`, chế độ (`M151`) |
| Nâng cấp | Timeline (3 mức, nhớ), thanh bước (kiêm bảng điểm), `body.expanded` → `Studio.layout`, dải báo (vùng riêng) |
| Thêm | Bố cục theo khổ video, cột Claude cạnh khung, dải tua, ngăn trượt thanh trái ở Cơ bản, `[` / `]` |
| Loại | Chip điểm + thanh tiến độ ở tab Dự án, chiều cao timeline cố định 300 px |

## 7. Quyết định (chốt 2026-11-18: theo đề xuất)

- `C29` timeline mặc định: Cơ bản = dải tua, Chuyên nghiệp = đầy đủ; nhớ lần đổi theo từng chế độ.
- `C30` Cơ bản có cột phải không: video dọc = cột Claude (chọn element thì mục chính + Núm trong cột); video ngang = không cột phải,
  Claude dưới khung.
- `C31` ngưỡng tự đổi bố cục: tỉ lệ khung < 0,8 (dọc, 4:5) → Claude cạnh khung; ≥ 0,8 → dưới khung; cửa sổ < 1280 px → luôn dưới
  khung, timeline gọn. Người dùng ghim được một kiểu (⋯ → Bố cục).
- `C32` điểm: bỏ chip + thanh ở tab Dự án, chỉ còn vòng điểm trên thanh bước; tab Dự án giữ danh sách việc của bước đang xem.

## 8. Nghiệm thu (`M166`, 2026-11-18)

`main` ở `601c031` (M157–M165 đã merge), server Studio chạy từ worktree sau khi kéo main, 3 dự án thử chép từ một dự án thật (49,8 s,
4 cảnh + `led_text` + `slam_bg`) đổi `width`/`height` thành 9:16, 1:1, 16:9. Đo bằng Chrome chạy ngầm (`puppeteer-core` +
`scripts/chrome_profile.mjs`), viewport đúng cỡ, `localStorage` sạch mỗi ô.

**Ma trận bố cục** (54 ô = 3 cửa sổ × 3 khổ × 2 chế độ × 3 mức timeline). Mỗi ô kiểm: trang không cuộn ngang / dọc, không phần tử tràn
viewport mà không có tổ tiên cắt, không vùng cuộn dọc lồng nhau đang cuộn, 9 điểm trong khung `elementFromPoint` ra `#frame` /
`#stagebox`, khung nằm trên timeline, `#play` nằm trên timeline và bấm trúng, không lỗi JS. Lõi thuần giữ các bất biến trong
`scripts/tests/s23_layout_matrix.test.mjs`.

| Khổ | Cửa sổ | Chế độ | Hỏi Claude | Khung: dải tua / gọn / đầy đủ (px) | Đạt |
|---|---|---|---|---|---|
| 9:16 | 1024×768 | Cơ bản | dưới khung | 292×519 / 247×439 / 146×259 | ✓ |
| 9:16 | 1024×768 | Chuyên nghiệp | dưới khung | 264×469 / 247×439 / 146×259 | ✓ |
| 9:16 | 1440×900 | Cơ bản | cạnh khung | 393×698 / 348×618 / 246×438 | ✓ |
| 9:16 | 1440×900 | Chuyên nghiệp | cạnh khung | 366×651 / 321×571 / 220×391 | ✓ |
| 9:16 | 1920×1080 | Cơ bản | cạnh khung | 494×878 / 449×798 / 348×618 | ✓ |
| 9:16 | 1920×1080 | Chuyên nghiệp | cạnh khung | 467×831 / 422×751 / 321×571 | ✓ |
| 1:1 ¹ | 1024×768 | Cơ bản | dưới khung | 292×519 / 247×439 / 146×259 | ✓ |
| 1:1 ¹ | 1024×768 | Chuyên nghiệp | dưới khung | 264×469 / 247×439 / 146×259 | ✓ |
| 1:1 ¹ | 1440×900 | Cơ bản | cạnh khung | 393×698 / 348×618 / 246×438 | ✓ |
| 1:1 ¹ | 1440×900 | Chuyên nghiệp | cạnh khung | 366×651 / 321×571 / 220×391 | ✓ |
| 1:1 ¹ | 1920×1080 | Cơ bản | cạnh khung | 494×878 / 449×798 / 348×618 | ✓ |
| 1:1 ¹ | 1920×1080 | Chuyên nghiệp | cạnh khung | 467×831 / 422×751 / 321×571 | ✓ |
| 16:9 | 1024×768 | Cơ bản | dưới khung | 576×324 / 576×324 / 460×259 | ✓ |
| 16:9 | 1024×768 | Chuyên nghiệp | dưới khung | 264×149 / 264×149 / 264×149 | ✓ |
| 16:9 | 1440×900 | Cơ bản | dưới khung | 992×558 / 992×558 / 695×391 | ✓ |
| 16:9 | 1440×900 | Chuyên nghiệp | dưới khung | 675×380 / 675×380 / 675×380 | ✓ |
| 16:9 | 1920×1080 | Cơ bản | dưới khung | 1472×828 / 1335×751 / 1015×571 | ✓ |
| 16:9 | 1920×1080 | Chuyên nghiệp | dưới khung | 1052×592 / 1052×592 / 1015×571 | ✓ |

¹ Studio chỉ có hai khổ soạn (`DW/DH` của `studio.js`: rộng > cao → 16:9, còn lại 9:16); dự án `width` = `height` hiện như 9:16, Hỏi
Claude cạnh khung. Khổ vuông hiện là bản xuất thêm (`export_multi`). Ghi `M167`.

Cả 54 ô đạt các tiêu chí trên. Ô chật: Chuyên nghiệp 1024×768 video 16:9 khung chỉ 264×149 (thư viện 312 + cột phải 340 chiếm 652 px
của 1024) → `M168`. 16:9 Cơ bản 1024 dùng đủ bề ngang (576×324).

**Thử bằng chuột thật** (CDP `Input.dispatchMouseEvent`: con trỏ thật của trình duyệt, không `dispatchEvent` trên DOM), 16:9 Chuyên
nghiệp + Cơ bản 1440×900, 9:16 Cơ bản 1024 / 1440 / 1920, 9:16 Chuyên nghiệp 1440:

| Mục (bảng mục 3) | Kết quả |
|---|---|
| Bấm chọn khối HF trên khung → khung chọn + thanh nổi | Đạt mọi ô; thanh nổi trong `#stagewrap` (16:9: 261×34 trên đỉnh khối) |
| Kéo thả khối trên khung | Đạt: `x`/`y` đổi |
| Bấm đúp sửa chữ trên khung (`led_text`), gõ, bấm ra ngoài | Đạt cả 16:9 và 9:16 |
| Khung chọn xoay theo element (M160) | Đạt (`rotate: 20deg`); khối HF không có tay nắm cạnh (`StageCore.canResize`) nên chưa thử kéo cạnh đã xoay bằng chuột |
| Chấm ghim (M160) | Đạt: mở 24 px, nghỉ 12 px |
| Lớp: cảnh nền "back" (M160) | Một phần: `frame_grid` đúng; `slam_bg` (module cũ, không có `data-cid`) vẽ dưới người nhưng bảng Lớp xếp trên cùng, không ghi "· nền" → `M169` |
| Chuyển cảnh: tách clip, bấm nút ở chỗ nối | **Lỗi, đã sửa**: cột phải đang ở tab Lớp thì `openSect('trans')` không đổi tab (nextTab giữ Lớp), người dùng không thấy gì. `openSect` sang Thuộc tính khi có element chọn |
| Dải tua: kéo, bấm đúp | Đạt: kéo 20 % → 68 % thì playhead 33,9 / 49,8 s; bấm đúp → mức gọn |
| Cơ bản 9:16 ≥ 1280: cột Hỏi Claude cạnh khung + dải tua + ngăn trượt | Đạt (1440: khung 393×698, cột 346 px; 1920: 494×878, cột 380 px); ngăn trượt 420 px mở khi bấm thanh trái, đóng khi bấm khung |
| Cơ bản 16:9 / cửa sổ 1024: Hỏi Claude một dòng | Đạt (dòng 47 px dưới khung) |

**Cần chủ repo chạy:** AI dựng / Tự lái thật với nhạc thương hiệu (#171, #173). Chuỗi Tự lái gọi `claude` (lượt của chủ repo),
`notify` (Telegram), `deliver` (ghi vào Kho / Thành phẩm thật) và render; phiên nghiệm thu không gửi tin hay ghi Kho thay chủ repo.
Lệnh: `node scripts/autopilot.mjs <video> --brand <kit có nhạc>` rồi mở dự án trong Studio, xem nhạc thương hiệu ở track Âm thanh.

Test: `node --test scripts/tests/*.test.mjs` 865 test, 864 đạt, 1 bỏ qua (Windows); lần này không gặp lỗi chập chờn `batch_parallel`.
