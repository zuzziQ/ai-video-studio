---
name: toi-uu-may
description: Tối ưu máy cho AI Video Studio — đọc phần cứng và lịch sử render, để luật + AI đề xuất profile hiệu năng (tiet-kiem, can-bang, toc-do, chat-luong, tuy-chinh), trình bày cho người dùng và chỉ lưu khi họ đồng ý. Dùng khi người dùng nói "tối ưu máy", "render chậm", "chọn profile", "máy giật khi render", "vừa render vừa làm việc khác". Không dùng để sửa mã render.
---

# Tối ưu máy (profile hiệu năng, M64 + M68)

Tài liệu: `references/perf-profile.md` (mục Profile và AI chọn profile). Mọi lệnh chạy từ gốc repo.

## Quy tắc

- **Không đọc, không in** `.env*`, `~/.ai-video-studio/config.json` ngoài khoá `perf`, hay bất kỳ token nào trong `~/.ai-video-studio/` (Telegram, YouTube, Claude). Chỉ dùng đầu ra của các lệnh dưới đây.
- **Không tự đặt con số.** Chỉ đề xuất một trong các ứng viên mà `perf_advise_cli.mjs` trả về.
- **Chỉ lưu sau khi người dùng đồng ý rõ ràng** (ví dụ "ok", "áp dụng đi"). Không lưu khi họ chỉ hỏi.
- Không render video thật nếu người dùng chưa đồng ý đo thử (mất 15–60 s, máy nặng trong lúc đó).

## Các bước

1. **Đọc máy:** `node scripts/perf.mjs doctor --json` → nhân, RAM trống, GPU/VRAM, encoder, profile hiện tại, kế hoạch 1080p, lượt render đang chạy.
2. **Hỏi mục tiêu** nếu người dùng chưa nói: `nhanh` (xong nhanh nhất), `song-song` (vừa render vừa làm việc khác), `chat-luong` (file đẹp nhất). Có lô nhiều video thì thêm `--count N`; video khác 1080×1920 / 30 s thì thêm `--W --H --sec`.
3. **Đề xuất:** `node scripts/perf_advise_cli.mjs --goal <mục tiêu> --json`
   - Kết quả: `profile`, `overrides` (chỉ với `tuy-chinh`), `reason`, `provider` (`claude`/`ollama` = AI chọn, `rules` = luật chọn vì không có LLM hoặc LLM lỗi), `candidates` (mỗi cái có `why`, `workers`, `est` từ `perf_log`), `set_command`.
   - Không có LLM hoặc muốn nhanh: thêm `--no-llm`.
4. **Đo thử (tuỳ chọn, hỏi trước):** khi `est` của ứng viên được chọn là `null` (chưa có số đo), đề nghị render thử `sample/` với profile đó: `node scripts/render.mjs <dự án mẫu> --profile <tên>`, rồi `node scripts/perf.mjs log --n 5` để xem fps. Có số đo rồi thì chạy lại bước 3.
5. **Trình bày** ngắn gọn: profile đề xuất + lý do, bảng 2–4 ứng viên (worker, thời gian ước tính nếu có, `why`), profile đang dùng. Nói rõ ai chọn (AI hay luật).
6. **Chỉ khi người dùng đồng ý:** chạy đúng `set_command` (ví dụ `node scripts/perf.mjs set toc-do`, hoặc `node scripts/perf.mjs set tuy-chinh --workers 3 --priority below_normal …`), rồi `node scripts/perf.mjs doctor` để xác nhận.

Đổi lại về mặc định: `node scripts/perf.mjs set can-bang`.
