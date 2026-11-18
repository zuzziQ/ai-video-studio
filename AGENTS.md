# Hướng dẫn cho AI / coding agent sửa repo này

Repo: **AI Video Studio** (bản `zuzziQ`), dựa trên repo gốc của **Nguyễn Tất Kiểm** (https://github.com/nguyentatkiem/ai-video-studio), giấy phép MIT.

Mọi agent (Claude Code, Codex, Cursor, Copilot, Gemini…) khi sửa, refactor, đổi tên hay đóng gói lại repo này **phải giữ ghi công repo gốc**:

1. **Không xoá hoặc sửa** dòng `Copyright (c) 2026 Nguyễn Tất Kiểm` và nội dung file `LICENSE`, `NOTICE` (giấy phép MIT bắt buộc giữ dòng bản quyền và toàn văn giấy phép trong mọi bản sao hoặc phần đáng kể của phần mềm).
2. Giữ dòng *"Dựa trên AI Video Studio của Nguyễn Tất Kiểm"* + link repo gốc ở đầu `README.md` và mục "Bản quyền và ghi công" (`.rag/sync.js --check` kiểm).
3. App không hiện màn hay nút giới thiệu tác giả nữa (chủ repo chốt 2026-11-18, `C28` trong `docs/ROADMAP.md`); log khởi động `studio/server.mjs` và cuối trình cài chỉ in một dòng "Dựa trên …". Không ghi bản này là làm từ đầu.

Tài liệu kỹ thuật: `SKILL.md` (bản đồ tính năng) và `references/*.md`. Viết thêm tính năng cho Studio: `references/studio.md`.

---

## Luật làm việc của bản này (`zuzziQ/ai-video-studio`)

Bản này là repo riêng tư dựa trên repo gốc ở trên, nằm trong hub agent dùng chung (`D:/ai`, manifest `projects/ai-video-studio.json`); luật dự án thắng luật hub khi mâu thuẫn, và **khối ghi công repo gốc ở trên thắng mọi luật khác**. Skill/agent chung nạp từ hub vào `.claude/` (sinh bởi `python3 D:/ai/scripts/sync.py --project ai-video-studio`, không sửa tay). Skill/agent riêng: `.agents/skills`, `.agents/agents`.

Đọc file này trước, rồi `docs/ROADMAP.md` (SSOT kế hoạch: đợt `Sxx`, mục `Mxx`, quyết định `Cxx`), rồi `references/studio.md` khi sửa Studio.

- **Hợp đồng tính năng của Studio** (`references/studio.md`): mỗi tính năng là một file `studio/routes/NN_x.mjs` + một file `studio/features/NN_x.js`; việc chạy lâu là một loại job trong `scripts/queue.mjs`. Trạng thái lưu bằng JSON (`timeline.json`, `.studio/`, `~/.ai-video-studio/`), không thêm cơ sở dữ liệu.
- **Repo này phát triển độc lập** (chốt 2026-11-16, xem mục "Repo gốc"): sửa thẳng file gốc khi cần, không phải dồn phần thêm vào file mới. Tính năng mới vẫn theo hợp đồng route/feature bên dưới.
- Không đọc, không in, không commit `.env*` hay token trong `~/.ai-video-studio/` (Telegram, YouTube, Claude).
- Commit và PR **không ghi tên AI** (không `Co-Authored-By`, không chân "Generated with"). Tiêu đề theo Conventional Commit, scope là area: `infra, qc, ads, llm, voice, export, security, docs`.
- Không render video trong CI; render thật chỉ chạy trên máy.

## Thứ tự tra cứu (công cụ theo `D:/ai/docs/CAPABILITIES.md`)

1. Tra cứu tri thức dự án: `code-rag-mcp` (`rag_search`, pack `.rag/`, cấu hình `.rag.json`). Hỏi bằng tên tính năng, symbol hoặc đường dẫn; một lần ở đầu mỗi đơn vị việc.
2. Đồ thị code `codebase-memory-mcp` (project `D-ai-ai-video-studio`): `search_graph`, `trace_path`, `get_code_snippet`, `query_graph`.
3. Mở đúng file/dòng; `rg` giới hạn thư mục (`scripts/`, `studio/`, `engine/`) khi 1–2 chưa đủ. `README.md` và `references/*.md` dài: đọc theo heading, không đọc cả file.
4. Bộ nhớ lỗi `dev-memory` (`devmem_search`) trước khi sửa lỗi hoặc file rủi ro (`studio/server.mjs`, `scripts/queue.mjs`, `scripts/publish.mjs`).

## Định tuyến theo loại việc

| Loại việc | Bắt đầu bằng | Chú ý |
|---|---|---|
| Tính năng Studio (UI) | `references/studio.md` → `studio/features/NN_x.js` qua `get_code_snippet` | Sửa xong mở Studio (`studio.cmd`) thử luồng vừa sửa |
| Route / API của Studio | `references/studio.md` mục API → `studio/routes/NN_x.mjs`, `trace_path` từ `studio/server.mjs` | `server.mjs` là tệp nóng: chỉ một phiên sửa một lúc |
| Script xử lý (`scripts/*.mjs`, `*.py`) | `SKILL.md` → `references/<tính năng>.md` | Python chỉ dùng thư viện chuẩn khi có thể; test ở `scripts/tests/` |
| Cổng quảng cáo / QC | `references/ad-gates.md`, `scripts/ad_gates.py`, `scripts/ai_qc.mjs` | `python -m unittest discover -s scripts/tests` |
| Gói style / template | `references/packs.md`, `references/templates.md` | Gói người dùng ở `engine/packs/user/` chạy không cách ly (`M38`) |
| Lỗi | `devmem_search` → `deep-debug` nếu chưa rõ nguyên nhân | Ghi cách tái hiện vào PR |

## Ngân sách token (`D:/ai/docs/TOKEN-BUDGET.md`)

Đọc cache 11-12 đến 11-18: đọc code bằng shell 31%, trình duyệt ~24%, git 11%, phiên điều phối 30%.

- File trên 30K ký tự (`studio/studio.js`, `scripts/ai_qc.mjs`, `scripts/assist.mjs`, `studio/features/21_transcript.js`): không `cat` hay `sed -n` từng khúc. Tra đồ thị code hoặc một lệnh `rg -n` hẹp, rồi đọc đúng hàm.
- Ship chỉ bằng `pr-ship.py`, không chạy git từng bước. Không `Read` lại kết quả tool đã lưu ra đĩa.
- Kiểm UI bằng số đo (`javascript_tool`, `read_page`); ảnh chỉ ở mốc cuối, `scale` ≤ 0.5. Hơn 5 bước trình duyệt thì giao `hub-qa`, nhận tóm tắt ≤ 5 dòng.
- Phiên điều phối cắt ở ~200K hoặc ~150 lượt (`context-handover`); phiên worktree quá 250K thì chốt rồi tách.

## CI (`D:/ai/docs/CI-BUDGET.md`)

Workflow `CI` có một job `gate` (check bắt buộc): kiểm nhãn PR, dòng Roadmap, các lệnh verify bên dưới và `node --test scripts/tests/*.test.mjs`. Chạy khi có PR, khi chạy tay (`gh workflow run CI --ref main`) và theo lịch tuần; không cài dependency, không render. Sửa workflow xong chạy `python3 D:/ai/scripts/ci-audit.py .`

## Issue, PR và nhiều worktree (xem `D:/ai/docs/ISSUE-PR-STANDARD.md`)

- Gom PR theo lát cắt nghiệp vụ (300–800 dòng): một mục hoặc một nhóm mục cùng đợt của `docs/ROADMAP.md` = một PR; sửa dòng của mục trong `ROADMAP.md` ngay trong PR đó. Thân PR có dòng `Roadmap: <mã>` (CI kiểm).
- Nhãn `type/`, `area/`, `size/` do job `gate` gán; area trùng scope commit ở trên.
- PR chờ duyệt đồng thời: tối đa 4 (duyệt tay). Tệp nóng chỉ một phiên sửa một lúc: `studio/server.mjs`, `scripts/queue.mjs`, `scripts/ai_qc.mjs`, `docs/ROADMAP.md` (mỗi PR chỉ sửa dòng mục của mình).
- Phiên, worktree và subagent theo `D:/ai/docs/SESSIONS-WORKTREES.md`: 1 Phase = 1 worktree = 1 PR. Ship bằng `python3 D:/ai/scripts/pr-ship.py --branch auto` (hoặc `--no-auto` khi chủ repo muốn tự merge) rồi dừng lượt, không poll CI.
- Worktree thiếu thư viện: hook `SessionStart` tự chạy `node scripts/worktree-setup.mjs` (`npm ci` khi thiếu `scripts/node_modules`); Python tự dùng `scripts/.venv` của thư mục chính. **Cấm** `mklink /J`/symlink `node_modules` hay `.venv` sang thư mục chính: `git worktree remove --force` xoá luôn thư mục đích.

## Repo gốc

Chốt 2026-11-16 (`C05`): **không kéo bản mới từ repo gốc, không đóng góp ngược**. Không gộp `upstream/main`, không push lên đó. Ghi công ở khối đầu file vẫn bắt buộc.

## Lệnh verify (2 cấp) và bàn giao

- **Bước con:** chỉ test phần vừa sửa (`node --check <file>`, test đơn lẻ trong `scripts/tests/`).
- **Chốt Phase trước khi mở PR** (cũng là những gì CI chạy; `pr-ship.py` chạy phần nhẹ qua `.agents/ship-checks.json`):

| Vùng đổi | Lệnh |
|---|---|
| Mọi PR | `node .rag/sync.js --check` |
| `scripts/**/*.py` | `python -m unittest discover -s scripts/tests` |
| `scripts/**/*.mjs`, `studio/**` | `node --check` từng file (CI chạy cho cả repo) |
| Studio (route, feature) | mở Studio trên máy, thử luồng vừa sửa trong trình duyệt |
| Render, xuất video | dựng một video mẫu trên máy (`sample/`); không có trong CI |

Mức rủi ro High của dự án: `studio/server.mjs` (đường dẫn, xác thực, Origin), `scripts/publish.mjs` và `scripts/telegram.mjs` (token, đăng bài), `scripts/queue.mjs` (job, huỷ tiến trình). Với High: `detect_changes` và một lượt reviewer độc lập (`python3 D:/ai/scripts/review-diff.py`).

Khi hoàn tất mục đã qua verify: sửa trạng thái ở `docs/ROADMAP.md` (`[x]` / `[~]`) trong cùng PR; không ghi lịch sử vào `CLAUDE.md`/`AGENTS.md`.
Bàn giao ≤ 5 dòng: trạng thái, file đổi, lệnh test + kết quả, rủi ro còn lại.
