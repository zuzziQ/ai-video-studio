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
