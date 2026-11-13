# Lớp gọi LLM (`scripts/llm.mjs`)

> Phần thêm của bản `zuzziQ/ai-video-studio` (M25, M26). Dựa trên AI Video Studio của Nguyễn Tất Kiểm.

Mọi chỗ gọi AI trong `scripts/` đi qua `scripts/llm.mjs` (trừ `scripts/ai_qc.mjs`, chuyển sau).

| Hàm | Việc |
|---|---|
| `runClaude(prompt, opts)` | một lần `claude -p` (prompt qua stdin), có `timeout`, `onTick`, `onProc`, `stream` |
| `runOllama(prompt, opts)` | một lần `POST /api/generate` tới Ollama (không stream) |
| `runLLM(prompt, opts)` | chọn nhà cung cấp theo `opts.task` và cấu hình, rồi gọi |
| `askJSON(prompt, opts)` | prompt → JSON: parse lỏng (`shape`), `validate` ném lỗi thì hỏi lại `retries` lần |
| `parseLooseJSON(text, { shape })` | bỏ ```, lời dẫn, dấu phẩy thừa, ngoặc kép cong |

Lỗi là `LlmError` có `kind`: `missing`, `login`, `quota`, `model`, `exit`, `timeout`, `cancel`, `parse`.

## Chọn nhà cung cấp

- Việc **chỉ có chữ** đánh dấu `task: 'text'`: gợi ý b-roll (`ai_broll`, `auto_broll --claude`), AI dựng giúp và hook (`ai_edit`, kèm `highlights`, `topic_video`, `tpl_fit` qua `callClaude`), góp ý (`feedback`), nội dung đăng (`publish_texts`). Chạy bằng nhà cung cấp chọn trong cấu hình.
- Việc **cần xem ảnh hoặc dùng công cụ** (`broll_lib` gắn thẻ ảnh, `style_lab`, QC khung hình) luôn dùng Claude. Có `--allowedTools` trong `args` cũng bị ép về Claude.
- Model Claude (`sonnet`, `opus`, `haiku`, `default`) không phải model Ollama: khi chạy Ollama thì dùng model trong cấu hình.

## Cấu hình

`~/.ai-video-studio/config.json` (cùng file với API key, quyền 600), khoá `llm`:

```json
{ "llm": { "text": "ollama", "fallback": "claude",
           "ollama": { "url": "http://127.0.0.1:11434", "model": "qwen2.5:7b", "timeout": 600000 } } }
```

- `text`: `claude` (mặc định) hoặc `ollama`.
- `fallback`: `claude` thì khi Ollama không chạy hoặc chưa có model, việc đó chuyển sang Claude thay vì lỗi. Trả lời sai không chuyển.
- Biến môi trường thắng file: `AVS_LLM_TEXT`, `AVS_LLM_FALLBACK`, `OLLAMA_HOST`, `AVS_OLLAMA_MODEL`.

Lệnh:

```bash
node scripts/llm.mjs status                                   # cấu hình + Ollama có chạy, có model chưa
node scripts/llm.mjs set text=ollama model=qwen2.5:7b fallback=claude
node scripts/llm.mjs try provider=ollama                      # thử một lệnh JSON ngắn
node scripts/llm.mjs set text=claude                          # quay về Claude
```

Model nhỏ (3B–8B) làm caption và hook ổn; bản dựng của `ai_edit` (prompt dài, JSON phức tạp) nên giữ Claude hoặc dùng model ≥ 14B.

## Test

`node --test scripts/tests/llm.test.mjs scripts/tests/llm_ollama.test.mjs`: CLI giả lập (`scripts/tests/fixtures/fake_claude.mjs`, qua `CLAUDE_BIN`) và máy chủ Ollama giả; không gọi AI thật.
