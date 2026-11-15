# Profile hiệu năng (M64)

Mã: `scripts/perf_profile.mjs` (lõi), `scripts/perf.mjs` (CLI). Panel `29_perf` (M67) và AI chọn profile (M68) dùng API này.

## Profile

| Tên | Worker | Encoder | Preset x264 | Ưu tiên | Lượt render cùng lúc |
|---|---|---|---|---|---|
| `tiet-kiem` | 2 | auto | mặc định | BelowNormal | 1 |
| `can-bang` (mặc định) | tự động (`renderPlan`) | auto | mặc định | Normal | 1 |
| `toc-do` | nhân thật − 1, tối đa 5 | auto | mặc định | Normal | 1 |
| `chat-luong` | tự động | x264 | medium | Normal | 1 |
| `tuy-chinh` | `perf.custom` | `perf.custom` | `perf.custom` | `perf.custom` | `perf.custom` |

Lưu ở khoá `perf` của `$AVS_HOME/config.json`: `{ "profile": "...", "custom": { workers, encoder, preset, priority, slots, whisperDevice } }`.

## Thứ tự thắng

Cờ CLI của `render.mjs` (`--workers`, `--preset`, `--fast`, `--profile`) > biến môi trường > profile.

| Biến | Ý nghĩa |
|---|---|
| `AVS_PERF_PROFILE` | tên profile (job hàng đợi nhận từ runner) |
| `AVS_ENCODER` | `auto|nvenc|qsv|videotoolbox|x264` |
| `AVS_WHISPER_DEVICE` | `auto|cuda|cpu` |
| `AVS_RENDER_SLOTS` | số lượt render cùng lúc trên cả máy, `0` = không điều phối |
| `AVS_RENDER_PRIORITY` | `normal|below_normal` |

## Hành vi

- **RAM:** `renderPlan` hạ worker khi RAM trống thấp (~0,7 GB mỗi worker 1080p theo số đo M50/M51, tỉ lệ theo điểm ảnh, chừa 1,5 GB). Không áp cho `--workers` gõ tay và trên macOS (`os.freemem()` bỏ qua cache).
- **Điều phối:** `render.mjs` xin chỗ trong `$AVS_HOME/render_slots.json` trước khi mở Chrome, in `Đang chờ lượt render khác…` khi phải chờ, nhả khi thoát. Chỗ của pid đã chết, hoặc không ghi nhịp quá 5 phút (pid bị dùng lại sau `taskkill /f`), được dọn. `--still` không xin chỗ.
- **Ưu tiên:** `below_normal` hạ `render.mjs`, Chrome và ffmpeg con (`os.setPriority`); tiến trình GPU của Chrome tự đặt mức riêng. Job hàng đợi hạ cả tiến trình job (LLM, TTS, whisper chạy trong job cũng thấp).
- **Nhật ký:** mỗi lượt render ghi một dòng `$AVS_HOME/perf_log.jsonl` (`at, profile, W, H, frames, workers, encoder, chrome, sec, fps, waited_s`), giữ 500 dòng.
- **Studio:** `POST /api/export` nhận thêm `profile` (tên hợp lệ; sai thì dùng profile đã lưu), bước job hiện `Đang chờ lượt render khác…`.
- **Panel Hiệu năng (M67):** `studio/features/29_perf.js` + `studio/routes/29_perf.mjs` (`GET|POST /api/perf`, `GET /api/perf/log`, `POST /api/perf/bench` = "Đo thử 10 s"); bảng API ở `references/studio.md`. Lượt đo thử cũng ghi vào `perf_log.jsonl`.

## CLI

```bash
node scripts/perf.mjs doctor --json      # máy + profile + kế hoạch 1080p
node scripts/perf.mjs set tiet-kiem
node scripts/perf.mjs set tuy-chinh --workers 3 --encoder x264 --preset medium --priority below_normal --slots 1 --whisper cpu
node scripts/perf.mjs log --n 20
```

## API (hợp đồng)

- `PROFILES`, `DEFAULT_PROFILE`, `ENCODER_CHOICES`, `X264_PRESETS`, `PRIORITIES`, `WHISPER_DEVICES`
- `loadPerf() → { profile, custom }`; `savePerf({ profile?, custom? }) → loadPerf()` (sai: `Error` có `status 400`, không ghi)
- `resolvePerf({ profile?, hw?, job?: { cli }, env?, perf? }) → { profile, workers, encoder, preset, priority, slots, whisperDevice, from }`
- `hwSnapshot({ run?, env?, encoders? }) → { cores, ram, gpu[], chrome, encoder }`
- `planFor({ W, H, fps, sec, perf, hw })`, `perfEnv(r)`, `lowerPriority(pid, priority)`
- `acquireRenderSlot({ slots, onWait, pollMs }) → { release(), waited_s }`, `slotHolders()`, `appendPerfLog(entry)`, `readPerfLog({ n })`

## AI chọn profile (M68)

Mã: `scripts/perf_advisor.mjs` (lõi), `scripts/perf_advise_cli.mjs` (CLI), `studio/routes/31_perfai.mjs` (API), skill Claude Code `.agents/skills/toi-uu-may/SKILL.md`.

- **Luật tất định** `candidates({ hw, log, job, goal, load })` sinh 2–4 ứng viên `{ profile, overrides, workers, why, est }` hợp lệ (cùng miền với `savePerf`; `overrides` chỉ khác `{}` khi profile là `tuy-chinh`). Mục tiêu: `nhanh` → `toc-do` (lô ≥ 5 video ghi rõ), `song-song` (vừa render vừa làm việc khác) → `tiet-kiem`, rồi nửa số nhân thật + BelowNormal; `chat-luong` → `chat-luong`. Không encoder phần cứng → `tuy-chinh` x264 veryfast. RAM trống < 6 GB → hạ worker theo RAM (~0,7 GB mỗi worker 1080p, chừa 1,5 GB). Đang có lượt render khác hoặc CPU ≥ 60 % → thêm `tiet-kiem`.
- **Ước thời gian** `est = { fps, sec, runs }`: trung vị fps của `perf_log` cùng profile (+ cùng số worker với `tuy-chinh`) và cùng W×H; chưa có số đo → `null`.
- **LLM chỉ chọn:** `advise({ goal, job, useLlm })` gửi qua `llm.mjs` (`task: 'text'`, đúng lựa chọn Claude/Ollama trong config, `cwd` = thư mục tạm) gói gồm phần cứng không đường dẫn, tải hiện tại (lượt render đang giữ chỗ, % CPU), ≤ 20 dòng `perf_log` (chỉ các trường số đo), job, goal và danh sách ứng viên. Mọi chuỗi giống đường dẫn hay token bị lọc (`scrub`). LLM trả `{ pick, reason }`; chỉ số sai, JSON hỏng, lỗi hay quá 60 s → ứng viên đầu, `provider: 'rules'`, kèm `llm_error`. Lý do cắt còn ≤ 2 câu.
- **Kết quả** `{ profile, overrides, reason, provider: 'claude'|'ollama'|'rules', pick, candidates, llm_error? }`. Không lưu gì: người dùng hoặc panel lưu bằng `savePerf` / `perf.mjs set`.
- **Lô** (`job.count > 1`): mỗi ứng viên có thêm `batch: { parallel, workersEach, why }` = `batchPlan` (mục dưới) với profile đó, và `why` ghi kế hoạch lô. `est` vẫn tính như render lần lượt.

```bash
node scripts/perf_advise_cli.mjs --goal nhanh            # Claude/Ollama chọn, in bảng ứng viên + lệnh áp dụng
node scripts/perf_advise_cli.mjs --goal song-song --no-llm --json
node scripts/perf_advise_cli.mjs --goal nhanh --count 10 --W 1080 --H 1920 --sec 45
```

API Studio: `POST /api/perf/advise {goal, job?: {W, H, fps, sec, count}, llm?: false}` → kết quả trên; sai kiểu → 400, đang có lượt khác → 409.

## Lô song song (M68, theo số đo M66)

Mã: `scripts/batch_parallel.mjs` (`batchPlan`, `holdBatchSlot`, `runPool`, `parallelLimit`), dùng ở `scripts/batch.mjs` (Hàng loạt) và `scripts/variants.mjs` (xuất phiên bản). Số đo: `docs/perf/2026-11-15-m66-batch-parallel.md` (lô 6 bản 1080p: `1×4` tuần tự 92,9 s, `6×1` 64,5 s; tốc độ theo tổng số Chrome, bão hoà ở ~số nhân thật; trần thật là VRAM).

- **`batchPlan({ n, hw, perf, load, W, H, limit })` → `{ parallel, workersEach, budget, why }`** (hàm thuần). Ngân sách worker (= Chrome) `B` = nhân thật, kẹp theo VRAM trống (`(trống − 1 GB) / v`, `v` = 0,55 GB mỗi Chrome ≤ 1080×1920, 0,45 GB ≤ 720×1280, theo điểm ảnh cho 4K) và RAM trống (`(trống − 1,5 GB) / 0,7 GB` mỗi worker 1080p). `tuy-chinh` có số worker → `B` tối đa bằng số đó (`can-bang`, `toc-do` cố ý dùng hết nhân thật: số đo M66 cho thấy lợi tới ~số nhân thật). `P = min(n, B)`, `W = clamp(floor(B / P), 1, 4)` (4K tối đa 3); `W = 3` hạ về 2 vì NVENC + 3 đoạn lệch pts ~0,33 ms sau ghép (M66 mục 4). Máy đo (6 nhân): lô ≥ 6 → `6×1`, 3 → `3×2`, 2 → `2×2`.
- **Tắt** (`parallel 1`, `workersEach null` = như trước M68): 1 bản; profile `tiet-kiem` hoặc ưu tiên `below_normal`; Chrome SwiftShader; encoder không phải phần cứng (x264, `chat-luong`); `perf.slots > 1` (lô chỉ giữ một lượt, nên không chạy song song khi đã cho nhiều lượt cùng lúc; `slots 0` = không điều phối thì vẫn song song); đang có lượt render khác; ngân sách < 2; `AVS_BATCH_PARALLEL=1`. `AVS_BATCH_PARALLEL=N` giới hạn tối đa N bản.
- **Điều phối với lượt render (M64): một lô = một lượt.** Trước hết `batchGate` kiểm các điều kiện tắt không cần dò máy (1 bản, `AVS_BATCH_PARALLEL=1`, `tiet-kiem`, BelowNormal, encoder ép x264, `slots > 1`): lô chắc chắn chạy lần lượt thì không xin lượt (giữ hành vi trước M68). Còn lại, lô xin một chỗ trong `render_slots.json` (`holdBatchSlot`, chờ như `render.mjs`, bước "Đang chờ lượt render khác…"; chỗ có `batch: true`), rồi mới dò máy và lập kế hoạch (`otherRenders()` không đếm chính lô). Kế hoạch `> 1`: mọi `render.mjs` con chạy với `AVS_RENDER_SLOTS=0` và `--workers W` nên không xếp hàng lẫn nhau, còn Studio export / hàng đợi khác vẫn phải chờ cả lô (không chồng tải). Kế hoạch `1`: nhả chỗ ngay, từng `render.mjs` tự xin chỗ như cũ. Chỗ nhả khi lô xong hoặc tiến trình thoát; bị giết cứng thì lượt sau dọn (pid chết).
- **`batch.mjs`** (vòng `pipeline()` của `batch_parallel.mjs`): dựng dòng vẫn lần lượt (một trình duyệt chung), render chạy tối đa `P` dòng cùng lúc (dòng kế dựng trong lúc các dòng khác render). Tiến độ cộng phần đang chạy của mọi dòng; lỗi một dòng không dừng dòng khác. `status.json` ghi nguyên tử (tmp + rename) và có `parallel: { parallel, workers, why }` khi chạy song song. RAM/VRAM đo một lần lúc lập kế hoạch (việc dựng dòng chạy song song với render không nằm trong ngân sách; lô đã giữ lượt nên không job render nào khác chen vào).
- **Tạm dừng (M24):** lô tuần tự giữ cách cũ (route giết lô khi dòng kế bắt đầu). Lô song song: route ghi `<thư mục lô>/.pause`, `batch.mjs` không bắt đầu dòng mới, các dòng đang render chạy xong, rồi thoát; dòng chưa bắt đầu vẫn `pending` để "Chạy tiếp".
- **`variants.mjs`:** `exportAll` xuất các phiên bản qua `runPool`; một bản lỗi thì cả lượt lỗi như cũ: không bắt đầu bản mới, các bản đang chạy chạy xong rồi mới báo lỗi.
- **Giới hạn đã biết:** lô song song giữ lượt suốt cả lô (Studio export, hàng đợi Tự lái chờ tới hết lô, bước "Đang chờ lượt render khác…"; muốn chen thì tạm dừng lô hoặc đặt `AVS_BATCH_PARALLEL=1`). `chrome.mode` là chế độ sẽ thử: Chrome lùi về SwiftShader lúc chạy thì kế hoạch không tự hạ. Cổng RAM dùng `os.freemem()`: trên macOS/Linux con số này không tính cache nên lô thường bị tắt ở đó (an toàn, chậm như cũ). `est` của ứng viên AI vẫn tính như lần lượt.
- **Huỷ:** hàng đợi và route giết cả cây (`killTree`, Windows `taskkill /t /f`) nên mọi `render.mjs` + Chrome + ffmpeg con đều dừng; Ctrl+C / SIGTERM trên POSIX: `batch.mjs` bật cờ dừng (đánh dấu các dòng đang chạy `cancelled` trước, không bắt đầu dòng mới, chạy một lần) rồi `killTree` từng tiến trình con (không dùng `process.kill(-pid)`); `variants.mjs` cũng `killTree` các render đang xuất.
