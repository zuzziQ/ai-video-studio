# Lộ trình: gộp AI Video Factory vào AI Video Studio

> Loại: kế hoạch. Cập nhật 2026-11-13. Theo khuôn `templates/ROADMAP.template.md` của hub (`D:\ai`).
> Ký hiệu: `[x]` xong và đã kiểm · `[~]` làm một phần (ghi phần còn thiếu) · `[ ]` chưa làm · `[!]` bị chặn (cần quyết định hoặc bên ngoài).
> Quy tắc đồng bộ: mỗi PR hoàn tất một mục thì sửa file này trong cùng PR đó.

## 1. Bối cảnh và hướng đi

Hai nguồn, đều nhận dưới dạng file zip ngày 2026-11-13:

| | AI Video Studio (nền) | AI Video Factory (nguồn tính năng) |
|---|---|---|
| Vai trò | Editor và engine dựng hình HTML → MP4 | Sinh nhiều biến thể creative quảng cáo |
| Stack | Node, JSON file, Chrome headless + ffmpeg, script Python gọi qua CLI | FastAPI, SQLite, React/Tauri, ffmpeg + Pillow |
| Mã tự viết | ~35.000 dòng | ~27.500 dòng |
| LLM | Chỉ Claude CLI, khoảng 8 chỗ gọi rời | Chỉ Ollama, một hàm |
| Test | Không có | 77 test |
| Giấy phép | MIT, © 2026 Nguyễn Tất Kiểm, repo công khai `nguyentatkiem/ai-video-studio` | Không có file LICENSE |

Hướng đã chốt: **giữ nguyên engine và editor của Studio, chỉ mang phần nghiệp vụ quảng cáo của Factory sang.** Bỏ lại `main.py`, `db.py`, `worker.py`, `pipeline.py`, `render.py`, `looks.py` và toàn bộ giao diện React/Tauri của Factory (chỉ tham khảo luồng UX).

Mỗi tính năng vào Studio theo hợp đồng sẵn có (`references/studio.md`): một file `studio/routes/NN_x.mjs`, một file `studio/features/NN_x.js`, việc chạy lâu là một loại job trong `scripts/queue.mjs`. Trạng thái lưu bằng JSON (`timeline.json`, `.studio/`, `~/.ai-video-studio/`), không thêm cơ sở dữ liệu.

## 2. Hiện trạng (2026-11-13)

- Mã nằm ở `D:\ai\ai-video-studio`. `main` là lịch sử thật của repo gốc tới commit `168e1d3` (2026-11-12), khớp bản zip trừ một style người dùng `u_neon_hong_review_ai` (để ở nhánh máy `chore/zip-user-style`, chưa đẩy) và quyền thực thi của 5 file `.sh` mà zip làm mất.
- Repo riêng tư `zuzziQ/ai-video-studio` đã tạo, `main` đã đẩy. Remote `origin` = zuzziQ, `upstream` = repo gốc (đẩy bị tắt). Repo chỉ cho squash merge, tự xoá nhánh khi merge.
- Đã đăng ký với hub (zuzziQ/agent-hub#80); repo có `AGENTS.md`, `.rag/`, CI `gate`. Chưa có nhãn, Milestone hay issue (`M07`).
- Đợt 1 đã viết xong và đã kiểm trên máy: 19 test qua, QC thật chạy được, hộp thoại thiết lập hoạt động trong trình duyệt.

## 3. Hàng đợi

### **`S01`** Dựng repo trên zuzziQ và nối với hub

Làm trước mọi đợt sau. Thứ tự các mục là thứ tự thực hiện.

- [x] **`M01`** (`area/infra`): chốt ba quyết định ở mục 4. 2026-11-13: `C02` riêng tư, `C03` `zuzziQ/ai-video-studio`; `C01` chưa rõ nên giữ riêng tư.
- [x] **`M02`** (`area/infra`): thay ảnh chụp zip bằng lịch sử thật của repo gốc. Clone `nguyentatkiem/ai-video-studio`, tìm commit khớp nội dung zip (so cây thư mục), đặt làm gốc của `main`, rồi áp lại phần sửa đợt 1 lên trên. Xong khi `git diff <commit gốc>` chỉ còn 7 file của đợt 1. Kết quả: gốc là `168e1d3`; nhánh `feat/ad-gates-qc` khác gốc đúng 7 file đợt 1 và file này.
- [x] **`M03`** (`area/infra`): tạo repo `zuzziQ/ai-video-studio` bằng `gh repo create` (mặc định riêng tư, xem `C02`). Vì GitHub không cho fork riêng tư từ repo công khai, đây là repo mới, không phải fork. Remote `origin` = zuzziQ, remote `upstream` = repo gốc (chỉ kéo, không đẩy).
- [~] **`M04`** (`area/infra`): commit theo hai bước rồi đẩy: (1) lịch sử gốc không đổi, (2) đợt 1 đi qua PR đầu tiên theo `S02`. Không ghi tên AI trong commit và PR (luật hub). Còn lại: bước (2), PR của nhánh `feat/ad-gates-qc`.
- [x] **`M05`** (`area/docs`): ghi công theo `NOTICE`: giữ `LICENSE`, `NOTICE`, màn giới thiệu `studio/features/00_author.js`; thêm vào đầu `README.md` dòng "Dựa trên AI Video Studio của Nguyễn Tất Kiểm" kèm link repo gốc và một đoạn ngắn nói bản này thêm gì. Xong 2026-11-13: đoạn "Dựa trên…" ở đầu `README.md`; `.rag/sync.js --check` giữ dòng này cùng `LICENSE`, `NOTICE`, `00_author.js`.
- [~] **`M06`** (`area/infra`): đăng ký với hub: tạo `D:\ai\projects\ai-video-studio.json` (theo `templates/project.template.json`, `access: owner`, `repo` trỏ zuzziQ), chạy `python3 D:/ai/scripts/sync.py`, rồi `project-doctor.py` đến khi sạch. `AGENTS.md` của dự án giữ phần ghi công của tác giả và thêm phần luật làm việc theo `templates/AGENTS.project.template.md`. Manifest ở zuzziQ/agent-hub#80 (đã merge). Trong repo: `AGENTS.md` theo mẫu (giữ khối ghi công), `CLAUDE.md` nạp `@AGENTS.md`, `.rag/` + `.rag.json`, `.mcp.json`, `.agents/ship-checks.json`, `.gitattributes` eol=lf, mẫu issue/PR. Còn lại: sau merge chạy `sync.py --project ai-video-studio` ở bản checkout chính (D7) và tạo Milestone (`M07`, D13).
- [ ] **`M07`** (`area/infra`): nhãn, Milestone và issue: `gh-labels.py` với các vùng `infra, qc, ads, llm, voice, export, security, docs`; `gh-roadmap-issues.py <dự án> --local` để xem kế hoạch, rồi `--apply`.
- [x] **`M08`** (`area/infra`): CI tối thiểu từ `templates/ci-gate.workflow.yml`: `python -m unittest discover -s scripts/tests` và `node --check` cho `scripts/*.mjs`, `studio/**/*.js|mjs`. Không render video trong CI. Kiểm bằng `ci-audit.py`. Xong 2026-11-13: `.github/workflows/ci.yml` một job `gate` (nhãn, dòng Roadmap, `.rag` check, `node --check`, unittest); `ci-audit.py` sạch.
- [x] **`M09`** (`area/infra`): quy trình kéo bản mới từ repo gốc: `git fetch upstream` rồi gộp vào một nhánh riêng, mở PR. Ghi cách làm vào `AGENTS.md`. Phần thêm của mình ưu tiên nằm ở file mới để ít đụng file gốc. Xong 2026-11-13: quy trình ở `AGENTS.md` mục "Kéo bản mới từ repo gốc".
- [ ] **`M10`** (`area/infra`): `sample/video-goc.mov` nặng 37 MB (dưới giới hạn 100 MB của GitHub nên đẩy được). Giữ nguyên như repo gốc; chỉ chuyển sang Git LFS nếu repo vượt 1 GB.

### **`S02`** Đợt 1: cổng quảng cáo trong QC

Mã đã xong trên máy, chờ `S01` để thành PR.

- [~] **`M11`** (`area/ads`): `scripts/ad_gates.py`: 11 nhóm luật chính sách Meta/TikTok theo ngành, claim gate, điểm nguyên bản; đọc `timeline.ads`, in JSON. Kèm `scripts/tests/test_ad_gates.py` (19 test) và `references/ad-gates.md`. Còn lại: commit và PR.
- [~] **`M12`** (`area/qc`): `scripts/ai_qc.mjs` gọi `ad_gates.py` khi `timeline.ads.on`, đưa vấn đề vào `.studio/qc.json` (loại `ad_policy`, `ad_claim`, `ad_originality`, khối `ads`). Còn lại: commit và PR.
- [~] **`M13`** (`area/qc`): hộp thoại "Kiểm tra quảng cáo" trong `studio/features/16_qc.js` (bật/tắt, ngành, nền tảng, claim, cụm từ cấm). Còn lại: commit và PR.
- [ ] **`M14`** (`area/ads`): chạy thử trên ít nhất 3 video quảng cáo thật, ghi lại báo sai và sót, chỉnh luật. Đặc biệt xem lại việc "tốt nhất", "cam kết", "100%" bị chặn mức cao trong khi luật chính sách chỉ cảnh báo "tốt nhất".
- [ ] **`M15`** (`area/qc`): chặn xuất khi `ads.blocked`: nút Xuất hỏi lại và mặc định dừng; `scripts/autopilot.mjs` và `queue.mjs` dừng ở bước QC. Có lối bỏ qua có ghi lý do cho lỗi không phải chính sách.
- [ ] **`M16`** (`area/qc`): soát lại cổng quảng cáo sau `--fix` để vấn đề đã hết được đánh dấu đã sửa (hiện kết quả sau khi sửa vẫn là của lần soát trước).
- [ ] **`M17`** (`area/ads`): thử chấm nguyên bản qua luồng thật "Tạo 3 phiên bản" (mới thử bằng thư mục dựng tay). Quyết định cách xử lý phiên bản A/B chỉ khác hook: hiện luôn bị báo mức cao.

### **`S03`** Đợt 2: Product Brain, thư viện hook, ma trận biến thể

- [ ] **`M18`** (`area/ads`): Product Brain: hồ sơ sản phẩm dùng chung nhiều dự án tại `~/.ai-video-studio/products/<id>.json` (tên, ngành, claim kèm bằng chứng và trạng thái, cụm từ cấm, FAQ). Route và panel mới; `timeline.ads.product` trỏ tới hồ sơ thay cho việc nhập claim từng dự án.
- [ ] **`M19`** (`area/ads`): thư viện hook: sinh hook bằng LLM hoặc mẫu, hook mới phải khác mọi hook đã có (cosine < 0,5) và qua cổng chính sách + claim; mỗi hook dùng tối đa 5 bản. Chuyển phần thuần của `scale.py` (dòng 127–196).
- [ ] **`M20`** (`area/ads`): cổng đa dạng nguồn: > 20 bản cần ≥ 3 video nguồn và 12 cảnh; > 100 cần ≥ 5 và 25; > 300 cần ≥ 8 và 40. Thiếu thì báo cần thêm nguồn, có lối bỏ qua kèm cảnh báo.
- [ ] **`M21`** (`area/ads`): ma trận biến thể: mở rộng `scripts/variants.mjs` từ "đổi hook hoặc gói" thành tổ hợp khán giả × góc × kết cấu × bố cục × thời lượng, dựa trên `creative.plan_matrix`. Mỗi bản là một dự án anh em; `variants.json` ghi thêm trục của từng bản.
- [ ] **`M22`** (`area/ads`): kịch bản có claim gate: sinh kịch bản, kiểm bằng `check_script_claims`, sai thì sinh lại, vẫn sai thì dùng khuôn mẫu chỉ ghép dữ liệu đã duyệt. Nối vào `scripts/topic_video.mjs`.
- [ ] **`M23`** (`area/ads`): ước tính trước khi chạy lô lớn: số tổ hợp khả thi, giờ LLM và render (đo từ job đã chạy), dung lượng.
- [ ] **`M24`** (`area/infra`): hàng đợi chịu được lô lớn: khoá khi ghi `queue.json` (hiện đọc–sửa–ghi không khoá giữa các tiến trình), tạm dừng/tiếp tục/huỷ cả lô, phân trang trong panel.

### **`S04`** Đợt 3: LLM chạy trên máy và giọng đọc

- [ ] **`M25`** (`area/llm`): một lớp gọi LLM dùng chung: gom khoảng 8 chỗ `spawnClaude` về `scripts/llm.mjs` với giao diện "prompt → JSON, có hàm kiểm và thử lại". Chưa đổi hành vi.
- [ ] **`M26`** (`area/llm`): thêm Ollama làm nhà cung cấp thứ hai (cấu hình ở `~/.ai-video-studio/config.json`). Việc cần xem ảnh (QC khung hình, clone style) vẫn dùng Claude; việc chỉ có chữ (hook, kịch bản, caption đăng) chọn được.
- [ ] **`M27`** (`area/voice`): giọng VieNeu: giữ máy chủ giọng của Factory chạy riêng trên 127.0.0.1, thêm làm lựa chọn TTS trong `dub.py`, `topic_video.mjs`, `batch.mjs` bên cạnh `say` và `edge-tts`. Chỉ bật nhái giọng sau khi `C04` rõ.
- [ ] **`M28`** (`area/voice`): script cài VieNeu cho Windows (Factory mới có cho macOS và Linux).
- [ ] **`M29`** (`area/voice`): thư viện nhạc 58 bài CC0 của Factory làm nguồn nhạc tuỳ chọn. Trước khi đưa vào, đối chiếu nhãn CC0 của từng bài với trang nguồn (nhãn trong catalogue là tự khai).

### **`S05`** Đợt 4: xuất gói quảng cáo và học từ kết quả

- [ ] **`M30`** (`area/export`): gói Ads Manager: preset Meta và TikTok, tên file theo quy ước, `ads_mapping.csv` (ad_name, primary_text, headline, CTA, landing_url + UTM theo mã bản), kiểm spec (thời lượng, tỷ lệ, dung lượng), `README.txt`. Bản có `ads.blocked` bị loại khỏi gói. Tải lên thủ công, không tự đăng.
- [ ] **`M31`** (`area/export`): nhập CSV kết quả quảng cáo, tính lift theo hook, góc, khán giả, kết cấu, bố cục, thời lượng, giọng, nhạc (n ≥ 2). Tách phép tính khỏi SQLite của `scale.py`.
- [ ] **`M32`** (`area/ads`): lô kế tiếp có trọng số: yếu tố thắng được ưu tiên trong ma trận, kèm tỷ lệ hook mới. Nối với vòng phản hồi sẵn có của Studio (`scripts/feedback.mjs`).

### **`S06`** Sửa lỗi nền của Studio

Không phụ thuộc các đợt trên. `M33` và `M34` nên xong trước khi dùng Studio với lô lớn.

- [x] **`M33`** (`area/security`): `/api/open` nhận đường dẫn bất kỳ và API không có xác thực: một tiến trình khác trên máy có thể mở `~/.ai-video-studio` làm dự án rồi đọc token Telegram, YouTube, Claude. Chặn mở thư mục cấu hình và thư mục không có `timeline.json`; thêm token phiên cho API. Kết quả: `studio/security.mjs` từ chối (403) `$AVS_HOME`, thư mục cha của nó, thư mục con ngoài `autopilot/`, `longform/`, `footage/`, thư mục ẩn trong home và file `.json` không phải timeline; mọi `/api/*` cần token phiên (editor nhận qua `<meta>` trang chính, `studio/auth.js`; script đọc `$AVS_HOME/studio-<port>.token`), thiếu token → 401. Test `node --test scripts/tests/studio_security.test.mjs`.
- [x] **`M34`** (`area/infra`): hàng đợi ghi trạng thái `error` nhưng `telegram.mjs` và `feedback.mjs` kiểm `failed`: job hỏng không được báo và "thử lại" không thử lại gì. Thống nhất một tên. 2026-11-13: tên chung là `error` (`FAILED`, `isFailed` trong `queue.mjs`); `loadQueue()` đổi `failed` cũ trong `queue.json` thành `error`. Bot báo job hỏng kèm nút chạy lại, và báo lại khi job chạy lại xong. Test `scripts/tests/queue_telegram.test.mjs`.
- [x] **`M35`** (`area/infra`): trên Windows, huỷ job bằng `process.kill(-pid)` không có tác dụng nên render vẫn chạy; dùng `killTree` của `platform.mjs`. Dọn thư mục tạm `.render_*` còn sót. 2026-11-13: huỷ và dừng runner dùng `killTree` (Windows `taskkill /t /f`, macOS/Linux cả nhóm tiến trình). Job huỷ hoặc lỗi thì xoá `.render_*` sinh ra từ lúc job chạy trong thư mục của job. Thử thật trên Windows: huỷ một render 3 worker giữa chừng thì cả 24 Chrome, 3 ffmpeg và tiến trình node đều dừng trong 5,5 giây, không còn `.render_*`.
- [x] **`M36`** (`area/security`): mã ghép nối Telegram 6 số không giới hạn số lần thử; đường dẫn video do LLM suy ra từ tin nhắn. Giới hạn số lần thử và chỉ cho đường dẫn trong thư mục đã khai. 2026-11-13: sai 5 lần thì huỷ mã và khoá ghép nối 15 phút; tạo mã mới thì mở khoá. Đường dẫn video chỉ được nhận khi nằm trong thư mục tự động (vào, xong, đã xử lý), hộp thư của bot hoặc `roots` trong `telegram.json`, sau khi giải symlink và `..`.
- [x] **`M37`** (`area/security`): giới hạn kích thước body và upload; các GET có tác dụng phụ (`/api/still`, `/api/srt`, `/api/schedule/poster`) kiểm Origin hoặc đổi sang POST. Kết quả: body JSON ≤ 32 MB, upload ≤ 20 GB (đổi bằng `AVS_MAX_JSON_MB`, `AVS_MAX_UPLOAD_MB`) → 413, body không `Content-Length` → 411; `/api/still`, `/api/srt` chỉ nhận POST; mọi request phải đúng origin (Host loopback đúng cổng, `Origin`, `Sec-Fetch-Site`) nên `/api/schedule/poster` (GET cho `<img>`) chỉ chạy từ chính Studio kèm `?avs_token=`.
- [ ] **`M38`** (`area/security`): gói style do người dùng tạo (`engine/packs/user/*.js`) chạy không cách ly trong Studio và trong Chrome render có `--disable-web-security`. Tối thiểu: cảnh báo khi nhập gói từ nơi khác; xem xét bỏ cờ đó khi render.
- [ ] **`M39`** (`area/infra`): test cho phần nền: `queue.mjs`, `server.mjs` (kiểm đường dẫn, Origin), `publish.mjs` (đã có sẵn biến môi trường để giả lập `AVS_TG_API`, `AVS_YT_API`, `AVS_NOW`).

## 4. Bị chặn: cần quyết định

- [!] **`C01`** (`area/docs`): **giấy phép của AI Video Factory.** Repo không có LICENSE nên mặc định giữ mọi quyền. Một dòng trong `looks.py` gợi ý cùng tác giả với Studio nhưng không nói Factory là MIT. Cần: xác nhận bạn là tác giả hoặc đã được phép, hoặc xin phép tác giả. Ảnh hưởng tới `C02` và mọi mã chuyển từ Factory (hiện là `scripts/ad_gates.py`).
- [x] **`C02`** (`area/infra`): **repo riêng tư hay công khai.** Chốt 2026-11-13: riêng tư. Đề xuất: riêng tư cho tới khi `C01` rõ. Công khai thì phải xong `M05` trước.
- [x] **`C03`** (`area/infra`): **tên repo.** Chốt 2026-11-13: `zuzziQ/ai-video-studio`. Đề xuất `zuzziQ/ai-video-studio`. Nếu định phát hành như sản phẩm riêng thì nên đổi tên để không nhầm với repo gốc; `NOTICE` yêu cầu không giới thiệu như sản phẩm tự làm từ đầu.
- [!] **`C04`** (`area/voice`): **giấy phép thương mại của VieNeu cho tính năng nhái giọng** chưa được xác minh (tài liệu Factory tự ghi vậy). Chặn phần nhái giọng của `M27`; 10 giọng có sẵn ghi Apache-2.0.
- [!] **`C05`** (`area/ads`): **đóng góp ngược lên repo gốc hay không.** Các sửa lỗi ở `S06` có ích cho repo gốc. Nếu có, tách chúng thành PR riêng không lẫn phần quảng cáo.

## 5. Ưu tiên tiếp theo

1. **`M11`–`M13`**: PR đầu tiên, đưa đợt 1 vào `main` (xong `M04`).
2. **`M06`–`M08`**: nối hub, nhãn và issue, CI.
3. **`C01`**: xác nhận quyền dùng mã Factory trước khi công khai repo.
4. **`M33`, `M34`**: hai lỗi nền nên sửa trước khi làm lô lớn ở đợt 2.

## 6. Không làm

- Không có kỹ thuật né bộ lọc trùng lặp (lật hình, đổi tốc độ, thêm nhiễu, xoá watermark), không tự đăng hàng loạt, không đa tài khoản. Mục tiêu là nhiều creative khác nhau thật từ một bộ nguồn.
- Không mang sang cơ sở dữ liệu SQLite, hàng đợi worker, phần dựng hình và giao diện của Factory.
- Cổng chính sách chỉ chặn sớm câu rủi ro; không thay kiểm duyệt của nền tảng và không bảo đảm quảng cáo được duyệt.
