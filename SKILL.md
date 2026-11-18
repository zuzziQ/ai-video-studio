---
name: ai-video-studio
description: "AI Video Studio: phần mềm edit video tất-cả-trong-một chạy local (localhost:5186, có app Mac), giao diện tối kiểu editor chuyên nghiệp, 28 gói style trên một engine HTML→MP4 (slate, bubble, Hype Cam, luxury, neon, keynote, glow, podcast, kinetic, khoá học, BĐS, review, chia sẻ, chia đôi màn hình, trước/sau, phông xanh, bản tin, multicam, hỏi đáp, Top N, điện ảnh, ảnh theo nhạc, quay màn hình, in ấn/tạp chí, truyền hình, giải thích sản phẩm, montage/podcast giấy), ~200 khối hoạt ảnh HyperFrames (sản phẩm, số liệu, đánh giá, CTA, lower third), ~90 template gồm nhóm Doanh nghiệp. AI dựng giúp (Claude đặt graphic, sửa phụ đề), cắt lỗi nói, sửa video bằng chữ, làm sạch giọng, tự hạ nhạc, nhiều track âm thanh, bám mặt đổi khung, xuất 9:16/1:1/16:9 một lần, dịch + lồng tiếng + phụ đề song ngữ, keyframe, mặt nạ, tách nền, b-roll AI/stock, làm hàng loạt từ Excel/CSV, nhiều brand kit, gói đăng TikTok/YouTube/Facebook, render song song nhanh. Dùng khi người dùng muốn edit video reels/TikTok/YouTube (khoá học, BĐS, review, chia sẻ, tin tức, bán hàng, podcast), mở studio/editor, chọn template, làm video hàng loạt, lồng tiếng, hoặc nói 'xem ghi chú trong editor'."
---

> Dựa trên AI Video Studio của **Nguyễn Tất Kiểm** (MIT, https://github.com/nguyentatkiem/ai-video-studio) · Khi sửa mã giữ `LICENSE`, `NOTICE` và ghi công repo gốc, xem `AGENTS.md`.

# AI VIDEO STUDIO: phần mềm edit + mọi style trong một

Gồm 3 lớp:
1. **Engine** (`engine/`): render HTML → MP4 thật. Mỗi style là một **gói** (`engine/packs/*.js`).
2. **Studio** (`studio/`): editor trong trình duyệt. Người dùng tự chỉnh mọi thứ, xem `references/studio.md`.
3. **Claude**: chọn gói, dựng bản đầu, sửa theo ghi chú.

## Tính năng v4 (đọc khi cần)
| Việc | Đọc |
|---|---|
| **Kho theo thương hiệu** (một thư mục thật: `Nguon/ Anh/ BRoll/ Nhac/ Thuong hieu/ Du an/ Thanh pham/`): mọi bước lấy nguồn từ Kho, dự án mới vào `Du an/`, bản xuất giao vào `Thanh pham/<YYYY-MM>/`, chuyển file cũ vào Kho có hỏi trước (`scripts/workspace.mjs`, `kho_deliver.mjs`, `kho_media.mjs`, `kho_migrate.mjs`) | `references/studio.md` mục "Thư mục", `docs/plans/S12-kho-du-an.md` |
| AI dựng giúp (`scripts/ai_edit.mjs`: né mặt + phụ đề + vùng an toàn bằng `placePlan`, bỏ thẻ trống, số không có trong lời thoại, emoji cờ; nút **AI dựng** của bước Dựng kèm Thêm b-roll / Thêm âm thanh), cắt lỗi nói (`fillers.py`, panel Làm sạch lời nói), sửa video bằng chữ | `references/ai-edit.md` |
| QC đầy đủ (`scripts/ai_qc.mjs`: máy dò + Claude chấm + tự sửa) và **QC nhanh** sau AI dựng (`scripts/qc_quick.mjs`, không Claude, ~8 s, "Sửa ngay"); phụ đề cháy sẵn của video nguồn (`scripts/burnin.mjs`, thẻ Video nguồn: tắt / dời / che); nhiều phiên bản A/B | `references/qc-variants.md` |
| Làm sạch giọng (`voice_clean.py`), tự hạ nhạc, nhiều track âm thanh (`TL.audio.clean/duck/tracks`) | `references/audio.md` |
| Bám mặt đổi khung (`face_track.py`, `clip.reframe`), xuất nhiều khổ, dịch + lồng tiếng (`dub.py`, `TL.sub2`) | `references/reframe-dub.md` |
| Giọng đọc `say` / edge-tts / VieNeu (tiếng Việt, máy chủ trên 127.0.0.1, `scripts/tts.py`, cài Windows `scripts/install_vieneu.ps1`) | `references/voice.md` |
| Keyframe (`kf`), mặt nạ (`mask`), tách nền, b-roll AI/stock (`ai_broll.mjs`) | `references/keyframes-mask-broll.md` |
| Làm hàng loạt từ CSV/XLSX (`batch.mjs`), brand kit (`~/.ai-video-studio/brands.json`), gói đăng mạng xã hội | `references/batch-brands-publish.md` |
| Render song song (`render.mjs --workers N --fast`), app Mac (`scripts/make_app.sh`) | `references/app-render.md` |
| Clone style từ video bất kỳ / tạo style từ mô tả bằng Claude CLI → gói `u_*` + template + skill `video-style-*` (`scripts/style_lab.mjs clone|describe|apply`, panel "Tạo style") | `references/style-lab.md` |
| Tự thêm b-roll + âm thanh 1 bấm: **9 mục tiêu video** × vai trò từng câu × **11 nguồn** (9.080 preset/55 kiểu/307 chủ đề, khối HyperFrames, chữ, emoji, 100 logo công cụ, hiệu ứng trên người nói, media dự án, thư viện b-roll của tôi, ảnh/video stock, ảnh AI), chống lặp + 3 phương án thay thế mỗi cảnh; SFX `--level`, nhạc theo đoạn; tab "Tự động" của mục B-roll, hoặc chạy nối sau nút AI dựng (`scripts/auto_broll.mjs --goal --variety`, `broll_lib.mjs`, `auto_sfx.py`) | `references/autofill.md` |
| ~200 khối HyperFrames (HeyGen, Apache-2.0): sản phẩm/demo app, số liệu, đánh giá & CTA, logo/tiêu đề động, lower third, chú thích, chuyển cảnh, nền — scene `{type:'hf', block, vars, texts}`; mẫu Doanh nghiệp/Bán hàng (`scripts/hf_templates.mjs`); 16 kiểu phụ đề `hf_*` (`engine/packs/captions_hf.js`) | `references/hyperframes.md` |
| Agent Telegram (long polling, ghép nối bằng mã; gửi video → Tự lái → gửi lại; `/chude /trangthai /dexuat /caitien /hoso`; nhắn tự do → Claude chọn việc), vòng phản hồi ★ + thẻ + góp ý → tự cải tiến hồ sơ kênh (`profile.fb`), tự đề xuất + bản tin sáng; panel "Agent" (`scripts/telegram.mjs`, `feedback.mjs`) | `references/agent-telegram.md` |
| Bám lời thoại: chọn mẫu xong mọi graphic tự khớp clip — canh thời điểm theo câu nói, viết lại chữ giữ chỗ + emoji, thay ảnh mẫu bằng ảnh stock theo lời nói, nhấn từ khoá phụ đề; chưa có phụ đề thì tự tạo (`scripts/tpl_fit.mjs`, `/api/tplfit`, nút "Bám lời thoại") | `references/tpl-fit.md` |
| Kiểm tra quảng cáo trong QC: chính sách Meta/TikTok theo ngành, claim gate, điểm nguyên bản giữa các phiên bản (`TL.ads`, `scripts/ad_gates.py`, nút "Thiết lập" ở thẻ Kiểm tra chất lượng) | `references/ad-gates.md` |
| Kịch bản có sẵn: dán / mở .txt .docx ở bước Nguồn hoặc thẻ Chuẩn bị của Tự lái, dấu `[HOOK]` `[CHỮ: …]` `[B-ROLL: …]` `[CTA]`; phụ đề theo đúng chữ kịch bản (whisper chỉ cho thời điểm), AI dựng / Bám lời thoại làm theo dấu, QC báo đoạn chưa nói / nói lệch (`scripts/script_doc.mjs`, `/api/script`) | `references/script.md` |
| Hồ sơ sản phẩm dùng chung (Product Brain): claim kèm bằng chứng, cụm từ cấm, FAQ; dự án trỏ tới bằng `TL.ads.product` (panel Sản phẩm, `scripts/products.mjs`) | `references/products.md` |
| Gói Ads Manager Meta/TikTok để tải lên tay: tên file theo mã bản, `ads_mapping.csv` (chữ, CTA, trang đích + UTM), kiểm spec, loại bản bị QC chặn (`scripts/ads_pack.mjs`) | `references/ads-pack.md` |
| Nhập CSV kết quả Meta/TikTok Ads Manager, lift theo hook/góc/khán giả/kết cấu/bố cục/thời lượng/giọng/nhạc, lô kế tiếp có trọng số + hook mới (`scripts/ads_results.mjs`, `variants.mjs --learn`) | `references/ads-results.md` |
| Nhạc CC0 tuỳ chọn: 13 bài người soạn đã đối chiếu nhãn CC0 với trang nguồn, tải theo yêu cầu, kiểm sha1 (`scripts/music_cc0.py list|fetch|path`, `assets/music/cc0/catalog.json`) | `references/music-cc0.md` |
| Viết thêm tính năng cho Studio: `studio/routes/*.mjs` + `studio/features/*.js` (đối tượng `Studio`) | `references/studio.md` |

## Chọn gói theo nội dung
| Nội dung | Gói (`TL.pack`) | Đọc |
|---|---|---|
| Khoá học, bài giảng, dạy thao tác | `course` | `references/pack-course.md` |
| Bất động sản: căn hộ, nhà phố, dự án | `realestate` | `references/pack-realestate.md` |
| Review, so sánh, unbox sản phẩm | `review` | `references/pack-review.md` |
| Chia sẻ kinh nghiệm, kể chuyện, quan điểm | `share` | `references/pack-share.md` |
| Tin tức / thủ thuật AI, "Claude edit" | `slate` | `references/modules-slate.md`, `decode-slate.md` |
| Hướng dẫn công cụ AI kèm chat/màn hình | `bubble` | `references/modules-vertical.md`, `decode-bubble.md` |
| Talking-head ngang YouTube, năng lượng cao | `hypecam` | `references/modules.md`, `style-bible.md`, `decode-hype-cam.md` |
| Thương hiệu cao cấp, tối giản | `luxury` | `references/pack-luxury.md` |
| Phụ đề neon kiểu AI | `neon` | `references/pack-neon.md` |
| Thuyết trình / keynote | `keynote` | `references/pack-keynote.md` |
| Tutorial phát sáng | `glow` | `references/pack-glow.md` |
| Podcast, phỏng vấn | `podcast` | `references/pack-podcast.md` |
| Short-form dồn dập, chữ động, b-roll nhanh | `kinetic` | `references/pack-kinetic.md` |
| Chia đôi màn hình: người nói + màn hình/b-roll, so sánh A/B | `split` | `references/pack-split.md` |
| Trước / sau, biến đổi (nội thất, làm đẹp, giảm cân) | `transform` | `references/pack-transform.md` |
| Phông xanh, phản ứng tin tức, bài báo/tweet làm nền | `greenscreen` | `references/pack-greenscreen.md` (cutout bằng `segment.py`) |
| Bản tin, TIN NÓNG, ticker, lower-third | `news` | `references/pack-news.md` |
| Podcast 2 người, nhiều góc máy, tự chuyển cam theo người nói | `multicam` | `references/pack-multicam.md` (`scripts/multicam.py`) |
| Hỏi–đáp, phỏng vấn đường phố, trả lời bình luận | `qa` | `references/pack-qa.md` |
| Top N, đếm ngược, xếp hạng | `topn` | `references/pack-topn.md` |
| Điện ảnh kể chuyện, letterbox, màu phim | `cinema` | `references/pack-cinema.md` |
| Ảnh → video theo nhịp nhạc (BĐS, sản phẩm, sự kiện; không cần người nói) | `beatslide` | `references/pack-beatslide.md` (`scripts/beats.py`, `scripts/beat_project.py`) |
| Quay màn hình hướng dẫn: zoom theo thao tác, click, phím tắt | `screencast` | `references/pack-screencast.md` (`scripts/screen_focus.py`) |

**Template** (`templates/*.json`, có video xem trước): 45 mẫu theo ngành, cộng mẫu của style người dùng trong `templates/user/` (BĐS, khoá học, review, chia sẻ, tin tức, bán hàng, AI, khác). Áp mẫu bằng `applyTemplate()` (trong Studio: tab Mẫu → **Dùng mẫu**). Xem `references/templates.md`. Mỗi mẫu có trường `needs`, cho biết người dùng cần cung cấp những gì.

**Track chính nhiều clip** (`TL.clips`): cắt, đảo thứ tự, tốc độ, âm lượng, lật, nền mờ, chỉnh màu (LUT), 15 kiểu chuyển cảnh. Xem `references/clips.md`. Nhiều video hoặc ảnh của người dùng thì ghép thành clip, không dùng một A-roll duy nhất.

Các gói **phối được với nhau**: mọi module của mọi gói dùng chung một timeline. Ví dụ dùng gói `realestate` nhưng chèn `slate.diagram`. Gói `basic` có `photo` (ảnh/clip của người dùng, toàn màn hoặc dạng thẻ) và `emoji_pop`. Hợp đồng viết gói nằm trong `references/packs.md`. Ví dụ đầy đủ cho từng gói nằm ở `examples/timeline.<gói>.json`.

## 0. Chuẩn bị (1 lần)
`bash <skill>/scripts/setup.sh`. Cần ffmpeg ≥ 6, Google Chrome, Node ≥ 18, Python 3.10+, có mạng khi render (font, emoji, logo). Đặt `PY=<skill>/scripts/.venv/bin/python`.

## 1. Đường nhanh (người dùng tự làm)
```bash
bash <skill>/studio.sh --new /đường/dẫn/clip.mp4      # rồi chọn gói trong app, hoặc:
bash <skill>/studio.sh <thư mục dự án>
```
Trong app, nút **Video mới** cho chọn: gói, tiêu đề, khổ dọc 9:16 hoặc ngang 16:9, độ chính xác nhận giọng. App tự làm các bước: nhận giọng → cắt lặng → cắt khung → phụ đề → **recipe của gói** (intro, graphic đặt theo từ khoá, CTA, nhạc). Claude chạy server ở nền rồi đưa link `http://localhost:5186`.

Luồng 5 bước trong Studio (S13, chi tiết ở `references/studio.md` mục Màn hình): ① Chuẩn bị (thương hiệu, sản phẩm, Kho) → ② Nguồn (thẻ **Video nguồn**: đã tách lời thoại / phụ đề / mặt chưa, báo phụ đề cháy sẵn; Lời thoại + Làm sạch lời nói; Cắt clip khi video > 5 phút) → ③ Dựng (một nút **AI dựng**, xong tự chạy **QC nhanh** trong hộp Đã dựng xong) → ④ Kiểm tra (QC đầy đủ có Claude) → ⑤ Xuất và đăng. **Tự lái** (thả nhiều video, hàng đợi nền) là nút riêng trên thanh đầu, không thuộc bước nào.

## 2. Claude dựng bản chất lượng cao
1. **Phần thô**: `node <skill>/studio/server.mjs --new raw.mp4 <dir> --port 5186`. Hoặc tự chạy `transcribe.py`, `cut.py`, trích frame, `captions.py`.
2. **Phụ đề**: sửa lỗi whisper, viết chữ thường hoặc theo kiểu chữ của gói, đánh `hl` cho từ khoá, `br` để dòng ≤ 4 từ. Đặt `caption_style` = id của gói.
3. **Brand kit** `TL.brand = {primary, accent, name, handle, phone, website, logo}`: hỏi người dùng nếu là video thương hiệu, BĐS hoặc khoá học. Mọi gói đều dùng chung.
4. **Scenes**: đọc file `pack-<gói>.md`, áp bảng "lời nói → module". Mọi `t` lấy từ `word.s`. Mỗi 2–3 s có một sự kiện hình. Ảnh và clip của người dùng để vào `media/` rồi dùng trong module.
5. **QC**: `node scripts/qc_quick.mjs <dir>` (hình học, không Claude, `--fix` để tự dời) rồi `node scripts/ai_qc.mjs <dir>` (đầy đủ; `references/qc-variants.md`); xem thêm ảnh bằng `node scripts/render.mjs timeline.json x --still <t> qc/<t>.jpg` tại các điểm vào cảnh.
6. **Âm thanh**: `$PY scripts/auto_sfx.py timeline.json --keep-manual`, nhạc theo `music` của gói, gain −18…−20.
7. **Bàn giao**: mở Studio để người dùng chỉnh, hoặc xuất `mix_audio.py` + `render.mjs` → `final.mp4`.

## 3. Vòng sửa
- Người dùng bấm **Lưu** trong Studio, nên **luôn đọc lại `timeline.json` trước khi sửa**.
- "Xem ghi chú trong editor": đọc `<dir>/.studio/notes.md`, sửa đúng đường dẫn JSON được ghi, xoá `note`, rồi nhắc người dùng tải lại trang.
- Phần tử có `_orig` là phần người dùng đã tự chỉnh tay: giữ nguyên, trừ khi được yêu cầu sửa.

## 4. QC chung
- [ ] Chữ không tràn khung, dấu tiếng Việt không bị cắt, nằm trong vùng an toàn (dọc: y 130–1000).
- [ ] Graphic lớn không trùng nhau, không che mặt lúc đang nói chuyện quan trọng.
- [ ] Không thẻ trống, chữ graphic không bị cắt "…" giữa từ khoá, không emoji cờ (hiện thành chữ trên Chrome Windows); video nguồn có phụ đề cháy sẵn thì đã chọn tắt / dời / che ở thẻ Video nguồn.
- [ ] −14 LUFS, peak ≤ −1 dBFS (`ffmpeg -i final.mp4 -af ebur128=peak=true -f null -`).
- [ ] Logo hãng chỉ dùng để nhắc đúng sản phẩm. Thông tin BĐS (giá, pháp lý), review (điểm số), khoá học (giá, cam kết) phải đúng như người dùng cung cấp, **không tự bịa số liệu**.
