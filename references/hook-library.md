# Thư viện hook (M19)

Kho câu mở đầu (hook) dùng chung giữa nhiều dự án và phiên bản của cùng một sản phẩm. Mã: `scripts/hooks_lib.mjs`,
test: `node --test scripts/tests/hooks_lib.test.mjs`.

Phần lọc và chọn hook chuyển từ AI Video Factory (`services/api/avf/scale.py`, `filter_hooks`, `generate_hooks`,
`pick_hook`, `mark_hook_used`), viết lại theo kiến trúc Studio: kho là file JSON, không có cơ sở dữ liệu.

## Kho

`~/.ai-video-studio/hooks/<khoá>.json` (thư mục gốc đổi được bằng `AVS_HOME`). Khoá = `timeline.ads.product`
(mã hồ sơ Product Brain) nếu có, không thì tên thư mục dự án. `--lib <file>` chỉ định kho khác.

```json
{ "version": 1, "key": "kem-y-50ml", "updated": "…",
  "hooks": [{ "id": "h3b0e369437", "text": "Sai lầm phổ biến nhất khi dùng Kem Y", "angle": "mistakes",
              "source": "llm|template|manual", "status": "active|retired", "created": "…",
              "used": [{ "dir": "/…/du_an_v3", "at": "…" }] }] }
```

Ghi bằng file tạm rồi đổi tên, nên tiến trình khác không đọc phải file cụt.

## Luật nhận hook mới

Theo thứ tự, hook bị bỏ ở luật đầu tiên không qua:

1. **Độ dài** 3–16 từ, không có link, `@`, `#`.
2. **Cổng chính sách + claim**: `scripts/ad_gates.py` chạy qua CLI trên một dự án tạm, mỗi hook là một scene chữ.
   Có lỗi mức cao (`ad_policy`, `ad_claim`) là bỏ. Claim, cụm từ cấm, ngành và nền tảng lấy từ `timeline.ads` và hồ sơ
   Product Brain (`~/.ai-video-studio/products/<mã>.json`, nếu có).
3. **Khác mọi hook đã có**: cosine trên unigram + bigram (cùng công thức `ad_gates.similarity`) với mọi hook trong kho và
   mọi hook vừa nhận trong cùng lô phải < 0,5.

Mỗi hook dùng tối đa **5 bản** (`HOOK_REUSE_MAX`). `pickHook` chọn hook còn lượt ít dùng nhất (ưu tiên danh sách
`preferred`, ví dụ hook thắng của lô trước); hook gắn góc khác bị loại, hook không gắn góc hợp mọi góc.

## Sinh hook

- **LLM**: `askJSON` của `scripts/llm.mjs` với `task: 'text'` (chạy được bằng Claude hoặc Ollama theo `references/llm.md`).
  Prompt gồm Product Brain, claim đã duyệt, cụm từ cấm, góc nội dung và 30 hook đã có; xin gấp đôi số cần rồi lọc.
- **Mẫu**: 12 mẫu câu điền tên sản phẩm, khán giả, USP. Dùng khi `--no-llm` hoặc LLM lỗi.

## Lệnh

```bash
node scripts/hooks_lib.mjs gen  <dự_án> [--n 10] [--angle how_to] [--no-llm] [--model sonnet]
node scripts/hooks_lib.mjs add  <dự_án> "câu hook" ["câu khác" …]     # thêm tay, vẫn qua cổng và chống trùng
node scripts/hooks_lib.mjs list <dự_án> [--all]
node scripts/hooks_lib.mjs pick <dự_án> [--angle x] [--seed 1] [--use <thư_mục_phiên_bản>]
```

Góc (`--angle`): `how_to, faq, demo, comparison, mistakes, feature, brand_story, checklist, qa, tips`.
