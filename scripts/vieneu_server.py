"""Máy chủ giọng đọc VieNeu-TTS cho AI Video Studio (M27). Chạy trong môi trường Python riêng có gói `vieneu`
(scripts/install_vieneu.ps1), chỉ nghe 127.0.0.1. Bật/tắt qua scripts/tts.py (vieneu-start). Spec: references/voice.md

  GET  /health   → {"ready": true, "loaded": bool, "clone": false, "voices": [{name, gender, region, style}], "default"}
  POST /tts      {"text", "voice": "<tên giọng có sẵn>"} → audio/wav (PCM 16-bit, tần số của model)

Chỉ 10 giọng có sẵn do tác giả VieNeu đề cử (featured 1..10). Nhái giọng tắt: không có endpoint nhận file mẫu (C04).
Không ghi file nào theo đường dẫn do client gửi: âm thanh trả thẳng trong phản hồi.
Trình duyệt luôn gửi Origin khi trang web gọi sang → request có Origin bị từ chối (trang lạ không dùng được máy chủ này).
"""
import argparse
import io
import json
import os
import sys
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Kho blob dùng chung của huggingface_hub (thư mục con theo hash) để file .onnx và file .data đi kèm ở hai thư mục khác nhau
# → onnxruntime từ chối ("External data path escapes model directory"). Tắt kho chung và dùng cache riêng của VieNeu
# ($AVS_HOME/vieneu/hf-cache) để không lẫn với bản đã tải theo kiểu cũ. Phải đặt trước khi import huggingface_hub.
os.environ.setdefault("HF_HUB_DISABLE_SHARED_BLOBS", "1")
os.environ.setdefault("HF_HUB_CACHE", os.path.join(os.environ.get("AVS_HOME") or os.path.join(os.path.expanduser("~"), ".ai-video-studio"),
                                                   "vieneu", "hf-cache"))

MAX_BODY = 64 * 1024
MAX_TEXT = 5000
N_VOICES = 10

_lock = threading.Lock()  # một model, gọi tuần tự (CPU)
_model = None
_voices = None
_default = None


def load_voices():
    """10 giọng đề cử, đọc từ danh sách đi kèm gói vieneu (không cần nạp model)."""
    global _voices, _default
    if _voices is None:
        import importlib.resources as res
        data = json.loads(res.files("vieneu").joinpath("assets/voices_v3_turbo.json").read_text("utf-8"))
        ranked = []
        for name, v in (data.get("presets") or {}).items():
            try:
                rank = int(v.get("featured"))
            except (TypeError, ValueError):
                continue
            if rank > 0:
                ranked.append((rank, name, v))
        ranked.sort()
        _voices = [{"name": n, "gender": v.get("gender"), "region": v.get("region"), "style": v.get("description")}
                   for _, n, v in ranked[:N_VOICES]]
        names = [v["name"] for v in _voices]
        _default = data.get("default_voice") if data.get("default_voice") in names else (names[0] if names else None)
    return _voices


def default_voice():
    load_voices()
    return _default


def model():
    global _model
    if _model is None:
        from vieneu import Vieneu
        _model = Vieneu()  # v3 Turbo, ONNX trên CPU; model tải từ Hugging Face lần đầu
    return _model


def synth(text, voice):
    import numpy as np
    with _lock:
        m = model()
        audio = np.asarray(m.infer(text, voice=voice), dtype=np.float32)
        sr = int(m.sample_rate)
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm)
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    server_version = "avs-vieneu"

    def log_message(self, fmt, *args):
        sys.stderr.write("vieneu: " + (fmt % args) + "\n")

    def _send(self, code, body, ctype="application/json"):
        b = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.headers.get("Origin"):
            return self._send(403, {"error": "forbidden"})
        if self.path == "/health":
            return self._send(200, {"ready": True, "loaded": _model is not None, "clone": False, "voices": load_voices(),
                                    "default": default_voice()})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.headers.get("Origin") or "application/json" not in (self.headers.get("Content-Type") or ""):
            return self._send(403, {"error": "forbidden"})
        if self.path != "/tts":
            return self._send(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = -1
        if n < 0 or n > MAX_BODY:
            return self._send(413, {"error": "body quá lớn"})
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return self._send(400, {"error": "JSON lỗi"})
        if not isinstance(body, dict):
            return self._send(400, {"error": "JSON lỗi"})
        if body.get("ref") or body.get("ref_audio") or isinstance(body.get("voice"), dict):
            return self._send(403, {"error": "Nhái giọng đang tắt (chờ xác minh giấy phép C04); chỉ dùng giọng có sẵn."})
        text = str(body.get("text") or "").strip()
        if not text:
            return self._send(400, {"error": "Thiếu câu cần đọc"})
        if len(text) > MAX_TEXT:
            return self._send(413, {"error": f"Câu quá dài (> {MAX_TEXT} ký tự)"})
        voice = body.get("voice") or default_voice()
        if voice not in [v["name"] for v in load_voices()]:
            return self._send(400, {"error": f"Không có giọng '{voice}'"})
        try:
            self._send(200, synth(text, voice), "audio/wav")
        except Exception as e:  # noqa: BLE001 — trả lỗi cho client hiển thị
            self._send(500, {"error": str(e)[:500]})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8771)
    ap.add_argument("--preload", action="store_true", help="nạp model ngay khi bật (mặc định: lần đọc đầu)")
    a = ap.parse_args()
    load_voices()
    if a.preload:
        model()
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    print(f"AVS VieNeu: http://127.0.0.1:{a.port} ({len(load_voices())} giọng có sẵn, không nhái giọng)", file=sys.stderr, flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
