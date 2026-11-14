"""Test M27: scripts/tts.py (chọn giọng, gọi VieNeu, lùi về edge-tts) và dub.py --tts vieneu.

Chạy: python -m unittest discover -s scripts/tests. Không cần VieNeu thật: máy chủ HTTP giả trên 127.0.0.1 trả /health và /tts;
AVS_HOME là thư mục tạm. Test dub.py đầu-cuối chỉ chạy khi có numpy và ffmpeg.
"""
import contextlib
import importlib.util
import io
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import unittest
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SCRIPTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, SCRIPTS)
import tts  # noqa: E402

VOICES = [{"name": "Ngoc", "gender": "female", "region": "north"}, {"name": "Binh", "gender": "male", "region": "south"}]


def wav_bytes(seconds=0.4, sr=24000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        # tiếng "ồ" 220 Hz đơn giản để dub.py không cắt hết như khoảng lặng
        import math
        w.writeframes(b"".join(int(8000 * math.sin(2 * math.pi * 220 * i / sr)).to_bytes(2, "little", signed=True)
                               for i in range(int(seconds * sr))))
    return buf.getvalue()


class Fake(BaseHTTPRequestHandler):
    calls = []
    clones = []

    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json"):
        b = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ready": True, "clone": True, "voices": VOICES + [{"name": "Mẫu", "kind": "clone"}], "default": "Ngoc"})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        if self.path == "/voices":
            Fake.clones.append(body)
            return self._send(200, {"name": body.get("name"), "seconds": 4.0})
        if self.path == "/voices/delete":
            Fake.clones.append({"deleted": body.get("name")})
            return self._send(200, {"ok": True}) if body.get("name") == "Mẫu" else self._send(404, {"error": "Không có giọng nhái"})
        Fake.calls.append(body)
        if body.get("voice") not in [v["name"] for v in VOICES]:
            return self._send(400, {"error": "Không có giọng này"})
        self._send(200, wav_bytes(), "audio/wav")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class TtsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), Fake)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.srv.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def setUp(self):
        self.home = tempfile.mkdtemp(prefix="avs-tts-")
        self.env = {k: os.environ.get(k) for k in ("AVS_HOME", "AVS_VIENEU_URL")}
        os.environ["AVS_HOME"] = self.home
        os.environ.pop("AVS_VIENEU_URL", None)
        Fake.calls.clear()

    def tearDown(self):
        for k, v in self.env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        shutil.rmtree(self.home, ignore_errors=True)

    def resolve_quiet(self, *a):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            r = tts.resolve(*a)
        return r, err.getvalue()

    def test_config_url_and_default_voice(self):
        tts.write_vieneu_conf({"url": self.url})
        r, err = self.resolve_quiet("vieneu", "vi")
        self.assertEqual((r["engine"], r["voice"]), ("vieneu", "Ngoc"))
        self.assertEqual(err, "")

    def test_default_engine_kept_with_other_keys(self):
        with open(tts.config_path(), "w", encoding="utf-8") as f:
            json.dump({"pexels": "k", "llm": {"text": "ollama"}}, f)
        self.assertIsNone(tts.default_engine())
        tts.write_default_engine("vieneu")
        tts.write_vieneu_conf({"voice": "Binh"})
        c = tts.read_config()
        self.assertEqual((c["pexels"], c["llm"]["text"], c["tts"]["default_engine"], c["tts"]["vieneu"]["voice"]), ("k", "ollama", "vieneu", "Binh"))
        self.assertEqual(tts.default_engine(), "vieneu")
        with self.assertRaises(ValueError):
            tts.write_default_engine("lạ")

    def test_config_voice_wins_over_server_default(self):
        tts.write_vieneu_conf({"url": self.url, "voice": "Binh"})
        self.assertEqual(self.resolve_quiet("vieneu", "vi")[0]["voice"], "Binh")
        self.assertEqual(self.resolve_quiet("vieneu", "vi", "Ngoc")[0]["voice"], "Ngoc")

    def test_synth_writes_wav(self):
        os.environ["AVS_VIENEU_URL"] = self.url
        r, _ = self.resolve_quiet("vieneu", "vi")
        f = tts.synth("Xin chào các bạn", os.path.join(self.home, "a"), r)
        self.assertTrue(f.endswith(".wav"))
        with open(f, "rb") as h:
            self.assertEqual(h.read(4), b"RIFF")
        self.assertEqual(Fake.calls[-1], {"text": "Xin chào các bạn", "voice": "Ngoc"})

    def test_server_offline_falls_back_to_edge_with_clear_message(self):
        os.environ["AVS_VIENEU_URL"] = f"http://127.0.0.1:{free_port()}"
        r, err = self.resolve_quiet("vieneu", "vi", None, "vi-VN-NamMinhNeural")
        self.assertEqual(r, {"engine": "edge", "voice": "vi-VN-NamMinhNeural", "fallback": "offline"})
        self.assertIn("Máy chủ giọng VieNeu không chạy", err)
        self.assertIn("install_vieneu.ps1", err)

    def test_non_vietnamese_falls_back(self):
        os.environ["AVS_VIENEU_URL"] = self.url
        r, err = self.resolve_quiet("vieneu", "en", None, "en-US-AriaNeural")
        self.assertEqual((r["engine"], r["voice"], r["fallback"]), ("edge", "en-US-AriaNeural", "lang"))
        self.assertEqual(Fake.calls, [])

    def test_only_loopback_urls(self):
        for bad in ("http://192.168.1.5:8771", "https://127.0.0.1:8771", "http://example.com"):
            with self.assertRaises(ValueError):
                tts.check_loopback(bad)
        os.environ["AVS_VIENEU_URL"] = "http://10.0.0.2:8771"
        self.assertEqual(self.resolve_quiet("vieneu", "vi")[0]["fallback"], "url")

    def test_unknown_voice_stops(self):
        os.environ["AVS_VIENEU_URL"] = self.url
        with self.assertRaises(SystemExit):
            self.resolve_quiet("vieneu", "vi", "KhongCo")

    def test_server_error_is_reported(self):
        os.environ["AVS_VIENEU_URL"] = self.url
        with self.assertRaises(RuntimeError) as cm:
            tts.synth("x", os.path.join(self.home, "b"), {"engine": "vieneu", "voice": "KhongCo"})
        self.assertIn("Không có giọng này", str(cm.exception))

    def test_write_conf_keeps_other_keys(self):
        with open(os.path.join(self.home, "config.json"), "w", encoding="utf-8") as f:
            json.dump({"llm": {"text": "ollama"}, "pexels": "k"}, f)
        tts.write_vieneu_conf({"url": self.url, "python": "C:/v/python.exe"})
        tts.write_vieneu_conf({"voice": "Binh"})
        with open(os.path.join(self.home, "config.json"), encoding="utf-8") as f:
            c = json.load(f)
        self.assertEqual(c["llm"], {"text": "ollama"})
        self.assertEqual(c["pexels"], "k")
        self.assertEqual(c["tts"]["vieneu"], {"url": self.url, "python": "C:/v/python.exe", "voice": "Binh"})

    def test_status_reports_running_and_clones(self):
        os.environ["AVS_VIENEU_URL"] = self.url
        s = tts.status()["vieneu"]
        self.assertTrue(s["running"])
        self.assertTrue(s["clone"])
        self.assertEqual(s["voices"], ["Ngoc", "Binh", "Mẫu"])
        self.assertEqual(s["clones"], ["Mẫu"])

    def test_clone_needs_consent_and_running_server(self):
        os.environ["AVS_VIENEU_URL"] = self.url
        n = len(Fake.clones)
        with self.assertRaises(SystemExit) as e:
            tts.vieneu_clone("A", __file__, consent=False)
        self.assertIn("--consent", str(e.exception))
        os.environ["AVS_VIENEU_URL"] = "http://127.0.0.1:%d" % free_port()
        with self.assertRaises(SystemExit) as e:
            tts.vieneu_clone("A", __file__, consent=True)
        self.assertIn("không chạy", str(e.exception))
        os.environ["AVS_VIENEU_URL"] = "http://example.com:8771"
        with self.assertRaises(ValueError):
            tts.vieneu_clone("A", __file__, consent=True)
        self.assertEqual(len(Fake.clones), n, "không gửi gì khi bị chặn")

    @unittest.skipUnless(shutil.which("ffmpeg"), "cần ffmpeg")
    def test_cli_clone_converts_and_trims(self):
        src = os.path.join(self.home, "mau.wav")
        with open(src, "wb") as f:
            f.write(wav_bytes(40.0, 44100))  # 40 s, 44,1 kHz → cắt còn 30 s, 24 kHz mono
        env = {**os.environ, "AVS_VIENEU_URL": self.url, "PYTHONIOENCODING": "utf-8"}
        cli = [sys.executable, "-I", "-X", "utf8", os.path.join(SCRIPTS, "tts.py")]
        r = subprocess.run(cli + ["vieneu-clone", "--name", "Giọng Minh", "--audio", src, "--consent", "--note", "Chính tôi"],
                           capture_output=True, text=True, env=env, encoding="utf-8")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(json.loads([x for x in r.stdout.splitlines() if x.startswith("CLONE ")][0][6:]), {"name": "Giọng Minh", "seconds": 4.0})
        body = Fake.clones[-1]
        self.assertEqual((body["name"], body["consent"], body["consent_note"]), ("Giọng Minh", True, "Chính tôi"))
        import base64
        with wave.open(io.BytesIO(base64.b64decode(body["audio_b64"]))) as w:
            self.assertEqual((w.getnchannels(), w.getframerate(), w.getsampwidth()), (1, tts.CLONE_SR, 2))
            self.assertAlmostEqual(w.getnframes() / w.getframerate(), 30.0, delta=0.1)
        # --start gần cuối: còn 2 s < 3 s → báo quá ngắn, không gửi
        n = len(Fake.clones)
        r = subprocess.run(cli + ["vieneu-clone", "--name", "B", "--audio", src, "--consent", "--start", "38"],
                           capture_output=True, text=True, env=env, encoding="utf-8")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("quá ngắn", r.stderr)
        self.assertEqual(len(Fake.clones), n)
        r = subprocess.run(cli + ["vieneu-clone", "--name", "B", "--audio", os.path.join(self.home, "khong-co.wav"), "--consent"],
                           capture_output=True, text=True, env=env, encoding="utf-8")
        self.assertIn("Không thấy file", r.stderr)

    def test_voice_rm_clears_default(self):
        os.environ["AVS_VIENEU_URL"] = self.url
        tts.write_vieneu_conf({"voice": "Mẫu"})
        tts.vieneu_voice_rm("Mẫu")
        self.assertEqual(Fake.clones[-1], {"deleted": "Mẫu"})
        self.assertEqual(tts.vieneu_conf().get("voice"), "")
        with self.assertRaises(RuntimeError):
            tts.vieneu_voice_rm("Ngoc")

    def test_cli_say(self):
        env = {**os.environ, "AVS_VIENEU_URL": self.url, "PYTHONIOENCODING": "utf-8"}
        out = os.path.join(self.home, "voice.wav")
        r = subprocess.run([sys.executable, "-I", "-X", "utf8", os.path.join(SCRIPTS, "tts.py"), "say", "Một hai ba", "--engine", "vieneu",
                            "--out", out], capture_output=True, text=True, env=env, encoding="utf-8")
        self.assertEqual(r.returncode, 0, r.stderr)
        line = [x for x in r.stdout.splitlines() if x.startswith("TTS ")][0]
        res = json.loads(line[4:])
        self.assertEqual((res["engine"], res["voice"], res["fallback"]), ("vieneu", "Ngoc", None))
        self.assertTrue(os.path.exists(res["file"]))

    @unittest.skipUnless(importlib.util.find_spec("numpy") and shutil.which("ffmpeg"), "cần numpy và ffmpeg")
    def test_dub_with_vieneu(self):
        proj = os.path.join(self.home, "proj")
        os.makedirs(proj)
        caps = [{"t0": 0.2, "t1": 1.5, "words": [{"w": "hello", "t0": 0.2, "t1": 1.5}], "tr": "Xin chào"},
                {"t0": 2.5, "t1": 3.8, "words": [{"w": "world", "t0": 2.5, "t1": 3.8}], "tr": "thế giới"}]
        tlp = os.path.join(proj, "timeline.json")
        with open(tlp, "w", encoding="utf-8") as f:
            json.dump({"lang": "en", "duration": 5, "captions": caps}, f)
        env = {**os.environ, "AVS_VIENEU_URL": self.url, "PYTHONIOENCODING": "utf-8"}
        r = subprocess.run([sys.executable, "-I", "-X", "utf8", os.path.join(SCRIPTS, "dub.py"), tlp, "--lang", "vi", "--no-translate",
                            "--tts", "vieneu"], capture_output=True, text=True, env=env, encoding="utf-8")
        self.assertEqual(r.returncode, 0, r.stderr)
        with open(tlp, encoding="utf-8") as f:
            tl = json.load(f)
        self.assertEqual((tl["audio"]["dub"]["engine"], tl["audio"]["dub"]["voice"]), ("vieneu", "Ngoc"))
        self.assertTrue(os.path.exists(os.path.join(proj, "work", "dub_vi.wav")))
        self.assertEqual(len(Fake.calls), 2)


if __name__ == "__main__":
    unittest.main()
