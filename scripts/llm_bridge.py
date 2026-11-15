"""Gọi mô hình chữ từ script Python qua `node scripts/llm.mjs ask` (chỉ thư viện chuẩn).

Mọi lần gọi LLM của Python đi qua đây, không tự chạy `claude`, để có cùng hành vi với phần Node (scripts/llm.mjs):
chọn nhà cung cấp theo cấu hình (Claude / Ollama, có lùi về Claude), dọn biến môi trường của phiên Claude Code,
`--setting-sources ""`, chạy trong thư mục tạm, tìm đúng lệnh `claude` trên Windows (shim .cmd của npm), có timeout.

    from llm_bridge import ask, LlmUnavailable, LlmError
    text = ask(prompt, model="sonnet", timeout=240)
"""
import os
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
LLM_MJS = os.path.join(HERE, "llm.mjs")


class LlmError(RuntimeError):
    """Gọi được nhưng lỗi (quá giờ, mô hình báo lỗi…). Thông báo đã là câu tiếng Việt đọc được."""


class LlmUnavailable(LlmError):
    """Không có mô hình nào dùng được: thiếu lệnh claude, chưa đăng nhập, hết lượt, Ollama tắt."""


def node_bin():
    # Studio chạy dưới Node: AVS_NODE (nếu có) trỏ đúng bản đang chạy server
    return os.environ.get("AVS_NODE") or shutil.which("node") or "node"


def ask(prompt, *, model="sonnet", timeout=600, task="text", provider=None, shape=None):
    """prompt → câu trả lời dạng chữ của mô hình. Lỗi → LlmUnavailable / LlmError (không bao giờ traceback thô)."""
    argv = [node_bin(), LLM_MJS, "ask", f"model={model}", f"timeout={int(timeout)}", f"task={task}"]
    if provider:
        argv.append(f"provider={provider}")
    if shape:
        argv.append(f"shape={shape}")
    try:
        # node tự dừng tiến trình con khi quá giờ; thêm 30 s dư ở đây chỉ để không treo nếu node kẹt
        r = subprocess.run(argv, input=prompt, capture_output=True, text=True, encoding="utf-8", timeout=timeout + 30)
    except FileNotFoundError:
        raise LlmUnavailable("Không tìm thấy Node.js để gọi mô hình chữ. Chạy lại bộ cài (install).") from None
    except subprocess.TimeoutExpired:
        raise LlmError(f"Mô hình chữ quá {int(timeout)} giây") from None
    msg = (r.stderr or "").strip().splitlines()
    last = msg[-1] if msg else ""
    if r.returncode == 4:
        raise LlmUnavailable(last or "Không có mô hình chữ dùng được")
    if r.returncode == 3:
        raise LlmError(last or f"Mô hình chữ quá {int(timeout)} giây")
    if r.returncode:
        raise LlmError(last or f"Gọi mô hình chữ lỗi (mã {r.returncode})")
    return r.stdout
