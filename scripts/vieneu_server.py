"""Máy chủ giọng đọc VieNeu-TTS cho AI Video Studio (M27). Chạy trong môi trường Python riêng có gói `vieneu`
(scripts/install_vieneu.ps1), chỉ nghe 127.0.0.1. Bật/tắt qua scripts/tts.py (vieneu-start). Spec: references/voice.md

  GET  /health          → {"ready": true, "loaded": bool, "clone": true, "voices": [{name, gender, region, style, kind}], "default"}
  POST /tts             {"text", "voice": "<tên giọng có sẵn hoặc giọng nhái>"} → audio/wav (PCM 16-bit, tần số của model)
  POST /voices          {"name", "audio_b64": "<WAV mono 3–30 s>", "consent": true, "consent_note"?} → {"name", "seconds"}
  POST /voices/delete   {"name"} → {"ok": true}

10 giọng có sẵn do tác giả VieNeu đề cử (featured 1..10) và giọng nhái người dùng tạo (C04 đã chốt cho dùng). Giọng nhái lưu ở
$AVS_HOME/vieneu/voices/<hash tên>.json: đặc trưng giọng + mã tham chiếu + xác nhận quyền dùng giọng, không giữ file âm thanh mẫu.
Không ghi/đọc file nào theo đường dẫn do client gửi: mẫu giọng đi trong body, âm thanh trả thẳng trong phản hồi.
Trình duyệt luôn gửi Origin khi trang web gọi sang → request có Origin bị từ chối (trang lạ không dùng được máy chủ này).
"""
import argparse
import base64
import hashlib
import io
import json
import os
import re
import sys
import tempfile
import threading
import time
import unicodedata
import uuid
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Kho blob dùng chung của huggingface_hub (thư mục con theo hash) để file .onnx và file .data đi kèm ở hai thư mục khác nhau
# → onnxruntime từ chối ("External data path escapes model directory"). Tắt kho chung và dùng cache riêng của VieNeu
# ($AVS_HOME/vieneu/hf-cache) để không lẫn với bản đã tải theo kiểu cũ. Phải đặt trước khi import huggingface_hub.
os.environ.setdefault("HF_HUB_DISABLE_SHARED_BLOBS", "1")
os.environ.setdefault("HF_HUB_CACHE", os.path.join(os.environ.get("AVS_HOME") or os.path.join(os.path.expanduser("~"), ".ai-video-studio"),
                                                   "vieneu", "hf-cache"))

MAX_BODY = 64 * 1024
MAX_VOICE_BODY = 8 * 1024 * 1024  # mẫu WAV ≤ 30 s dạng base64 (tts.py vieneu-clone gửi 24 kHz mono ≈ 1,4 MB)
MAX_TEXT = 5000
N_VOICES = 10
MAX_CLONES = 50
CLONE_MIN_SEC, CLONE_MAX_SEC = 3.0, 30.0
NAME_RE = re.compile(r"^\w[\w .\-]{0,39}$")  # chữ (gồm tiếng Việt), số, khoảng trắng, . - _; tối đa 40 ký tự

_lock = threading.Lock()  # một model, gọi tuần tự (CPU)
_vlock = threading.Lock()  # thêm/xoá giọng nhái (danh sách + file)
_model = None
_voices = None
_default = None
_clones = None  # {tên: bản ghi JSON của giọng nhái}, đọc từ voices_dir()


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


# ---------------------------------------------------------------- giọng nhái
def voices_dir():
    home = os.environ.get("AVS_HOME") or os.path.join(os.path.expanduser("~"), ".ai-video-studio")
    return os.path.join(home, "vieneu", "voices")


def _clone_file(name):
    """Tên file theo hash của tên giọng: không dựng đường dẫn từ chữ do client gửi."""
    return os.path.join(voices_dir(), hashlib.sha256(name.encode("utf-8")).hexdigest()[:24] + ".json")


def load_clones():
    global _clones
    if _clones is None:
        out = {}
        d = voices_dir()
        for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
            if not f.endswith(".json"):
                continue
            try:
                with open(os.path.join(d, f), encoding="utf-8") as fh:
                    v = json.load(fh)
            except (OSError, ValueError):
                continue
            if isinstance(v, dict) and isinstance(v.get("name"), str) and v.get("speaker_emb"):
                out[v["name"]] = v
        _clones = out
    return _clones


def clone_list():
    return [{"name": n, "gender": None, "region": None, "style": "Giọng nhái · " + str(v.get("created") or "")[:10], "kind": "clone"}
            for n, v in sorted(load_clones().items())]


def all_voices():
    return [{**v, "kind": "preset"} for v in load_voices()] + clone_list()


def wav_seconds(data):
    """Độ dài (giây) của WAV PCM; ValueError khi không đọc được."""
    try:
        with wave.open(io.BytesIO(data), "rb") as w:
            return w.getnframes() / float(w.getframerate())
    except (wave.Error, EOFError, ZeroDivisionError) as e:
        raise ValueError("Mẫu giọng không phải WAV PCM đọc được") from e


def enroll(wav_bytes):
    """WAV mẫu → (speaker_emb, codes) dạng list. File tạm riêng của máy chủ, xoá ngay sau khi dùng."""
    import numpy as np
    fd, tmp = tempfile.mkstemp(prefix="avs-clone-", suffix=".wav")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(wav_bytes)
        with _lock:
            emb, codes = model().encode_reference(tmp)
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
    # codes giữ nguyên shape (khung × 16 codebook) như giọng có sẵn trong voices_v3_turbo.json
    return ([round(float(x), 6) for x in np.asarray(emb).reshape(-1)],
            None if codes is None else np.asarray(codes, dtype=np.int64).tolist())


class Conflict(ValueError):
    """Trùng tên giọng nhái hoặc đã đủ số giọng → 409."""


def _check_free(name):
    if name in load_clones():
        raise Conflict(f"Đã có giọng nhái '{name}': xoá giọng cũ trước nếu muốn tạo lại")
    if len(load_clones()) >= MAX_CLONES:
        raise Conflict(f"Đã có {MAX_CLONES} giọng nhái; xoá bớt trước")


def add_clone(name, wav_bytes, consent_note=""):
    secs = wav_seconds(wav_bytes)
    if secs < CLONE_MIN_SEC or secs > CLONE_MAX_SEC + 0.5:
        raise ValueError(f"Mẫu giọng phải dài {CLONE_MIN_SEC:g}–{CLONE_MAX_SEC:g} giây (đang {secs:.1f} s)")
    with _vlock:
        _check_free(name)
    emb, codes = enroll(wav_bytes)  # chậm (CPU): ngoài _vlock, kiểm lại trước khi ghi
    rec = {"name": name, "created": time.strftime("%Y-%m-%dT%H:%M:%S"), "seconds": round(secs, 2),
           "consent": {"confirmed": True, "note": consent_note[:300]}, "speaker_emb": emb, "codes": codes}
    with _vlock:
        _check_free(name)
        os.makedirs(voices_dir(), exist_ok=True)
        f = _clone_file(name)
        part = f"{f}.{uuid.uuid4().hex}.part"
        with open(part, "w", encoding="utf-8") as fh:
            json.dump(rec, fh, ensure_ascii=False)
        try:
            os.chmod(part, 0o600)  # đặc trưng giọng của người thật: chỉ chủ máy đọc (như config.json)
        except OSError:
            pass
        os.replace(part, f)
        load_clones()[name] = rec
    return rec


def remove_clone(name):
    with _vlock:
        if name not in load_clones():
            return False
        try:
            os.remove(_clone_file(name))
        except FileNotFoundError:
            pass
        load_clones().pop(name, None)
        return True


def _voice_arg(voice):
    """Giọng có sẵn → tên; giọng nhái → dict {speaker_emb, codes} mà infer() của v3 Turbo nhận."""
    c = load_clones().get(voice)
    if c is None:
        return voice
    import numpy as np
    return {"speaker_emb": np.asarray(c["speaker_emb"], dtype=np.float32),
            "codes": None if c.get("codes") is None else np.asarray(c["codes"], dtype=np.int64)}


# ---------------------------------------------------------------- model
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
        audio = np.asarray(m.infer(text, voice=_voice_arg(voice)), dtype=np.float32)
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
            return self._send(200, {"ready": True, "loaded": _model is not None, "clone": True, "voices": all_voices(),
                                    "default": default_voice()})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = -1
        if n < 0 or n > (MAX_VOICE_BODY if self.path == "/voices" else MAX_BODY):
            self.close_connection = True  # không đọc body quá lớn: đóng kết nối sau khi trả lời
            return self._send(413, {"error": "body quá lớn"})
        raw = self.rfile.read(n)  # đọc hết body trước mọi lỗi khác: trả lời khi còn dữ liệu chưa đọc làm Windows RST kết nối
        if self.headers.get("Origin") or "application/json" not in (self.headers.get("Content-Type") or ""):
            return self._send(403, {"error": "forbidden"})
        if self.path not in ("/tts", "/voices", "/voices/delete"):
            return self._send(404, {"error": "not found"})
        try:
            body = json.loads(raw or b"{}")
        except ValueError:
            return self._send(400, {"error": "JSON lỗi"})
        if not isinstance(body, dict):
            return self._send(400, {"error": "JSON lỗi"})
        if self.path == "/voices":
            return self._add_voice(body)
        if self.path == "/voices/delete":
            name = unicodedata.normalize("NFC", str(body.get("name") or ""))
            return self._send(200, {"ok": True}) if remove_clone(name) else self._send(404, {"error": f"Không có giọng nhái '{name}'"})
        if body.get("ref") or body.get("ref_audio") or isinstance(body.get("voice"), dict):
            return self._send(403, {"error": "/tts không nhận file hay dữ liệu mẫu: tạo giọng nhái bằng POST /voices rồi gọi theo tên."})
        text = str(body.get("text") or "").strip()
        if not text:
            return self._send(400, {"error": "Thiếu câu cần đọc"})
        if len(text) > MAX_TEXT:
            return self._send(413, {"error": f"Câu quá dài (> {MAX_TEXT} ký tự)"})
        voice = body.get("voice") or default_voice()
        if voice not in [v["name"] for v in all_voices()]:
            return self._send(400, {"error": f"Không có giọng '{voice}'"})
        try:
            self._send(200, synth(text, voice), "audio/wav")
        except Exception as e:  # noqa: BLE001 — trả lỗi cho client hiển thị
            self._send(500, {"error": str(e)[:500]})

    def _add_voice(self, body):
        if body.get("consent") is not True:
            return self._send(400, {"error": "Cần xác nhận bạn là chủ giọng hoặc đã được chủ giọng đồng ý (consent: true)"})
        name = unicodedata.normalize("NFC", str(body.get("name") or "")).strip()
        if not NAME_RE.match(name):
            return self._send(400, {"error": "Tên giọng 1–40 ký tự: chữ, số, khoảng trắng, . - _"})
        if name in [v["name"] for v in load_voices()]:
            return self._send(409, {"error": f"'{name}' trùng tên giọng có sẵn"})
        try:
            wav_bytes = base64.b64decode(str(body.get("audio_b64") or ""), validate=True)
        except ValueError:
            return self._send(400, {"error": "audio_b64 không phải base64"})
        if wav_bytes[:4] != b"RIFF":
            return self._send(400, {"error": "Mẫu giọng phải là WAV"})
        try:
            rec = add_clone(name, wav_bytes, str(body.get("consent_note") or ""))
        except Conflict as e:
            return self._send(409, {"error": str(e)})
        except ValueError as e:
            return self._send(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            return self._send(500, {"error": str(e)[:500]})
        self._send(200, {"name": rec["name"], "seconds": rec["seconds"]})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8771)
    ap.add_argument("--preload", action="store_true", help="nạp model ngay khi bật (mặc định: lần đọc đầu)")
    a = ap.parse_args()
    load_voices()
    load_clones()
    if a.preload:
        model()
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    print(f"AVS VieNeu: http://127.0.0.1:{a.port} ({len(load_voices())} giọng có sẵn, {len(load_clones())} giọng nhái)",
          file=sys.stderr, flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
