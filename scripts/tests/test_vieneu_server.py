"""Test M27: các cổng chặn của scripts/vieneu_server.py (không cần gói vieneu: danh sách giọng gán sẵn, không gọi model).

Chạy: python -m unittest discover -s scripts/tests
"""
import base64
import io
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import wave
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import vieneu_server as vs  # noqa: E402


def wav(seconds, sr=8000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(b"\x00\x00" * int(seconds * sr))
    return buf.getvalue()


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        vs._voices = [{"name": "Hải Đăng"}, {"name": "Trúc Ly"}]
        vs._default = "Hải Đăng"
        cls.synth_calls = []
        cls._orig = vs.synth
        vs.synth = lambda text, voice: cls.synth_calls.append((text, voice)) or b"RIFF0000WAVE"
        cls.enroll_calls = []
        cls._orig_enroll = vs.enroll
        vs.enroll = lambda data: cls.enroll_calls.append(len(data)) or ([0.1, 0.2], [7, 8, 9])
        cls.home = tempfile.mkdtemp(prefix="avs-vieneu-")
        cls._orig_home = os.environ.get("AVS_HOME")
        os.environ["AVS_HOME"] = cls.home
        vs._clones = None
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), vs.Handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        cls.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        vs.synth = cls._orig
        vs.enroll = cls._orig_enroll
        vs._voices = vs._default = vs._clones = None
        if cls._orig_home is None:
            os.environ.pop("AVS_HOME", None)
        else:
            os.environ["AVS_HOME"] = cls._orig_home
        shutil.rmtree(cls.home, ignore_errors=True)

    def call(self, path, body=None, headers=None):
        data = None if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
        h = {"Content-Type": "application/json"} if data is not None else {}
        req = urllib.request.Request(self.url + path, data=data, headers={**h, **(headers or {})})
        try:
            with self.opener.open(req, timeout=5) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def test_health(self):
        code, b = self.call("/health")
        j = json.loads(b)
        self.assertEqual(code, 200)
        self.assertEqual((j["ready"], j["clone"], j["default"]), (True, True, "Hải Đăng"))
        self.assertEqual([v["name"] for v in j["voices"]], ["Hải Đăng", "Trúc Ly"])

    def test_tts_returns_wav(self):
        code, b = self.call("/tts", {"text": "Xin chào", "voice": "Trúc Ly"})
        self.assertEqual((code, b[:4]), (200, b"RIFF"))
        self.assertEqual(self.synth_calls[-1], ("Xin chào", "Trúc Ly"))

    def test_default_voice(self):
        self.call("/tts", {"text": "Một"})
        self.assertEqual(self.synth_calls[-1], ("Một", "Hải Đăng"))

    def test_browser_origin_rejected(self):
        self.assertEqual(self.call("/tts", {"text": "x"}, {"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.call("/health", None, {"Origin": "https://evil.example"})[0], 403)

    def test_non_json_rejected(self):
        self.assertEqual(self.call("/tts", b"text=x", {"Content-Type": "application/x-www-form-urlencoded"})[0], 403)

    def test_tts_never_takes_paths_or_raw_samples(self):
        n = len(self.synth_calls)
        for body in ({"text": "x", "voice": {"kind": "clone", "ref": "C:/a.wav"}}, {"text": "x", "ref_audio": "a.wav"}, {"text": "x", "ref": "a.wav"}):
            code, b = self.call("/tts", body)
            self.assertEqual(code, 403)
            self.assertIn("POST /voices", json.loads(b)["error"])
        self.assertEqual(len(self.synth_calls), n)

    # ------------------------------------------------------------ nhái giọng
    def clone_body(self, **kw):
        return {"name": "Giọng Minh", "audio_b64": base64.b64encode(wav(5.0)).decode(), "consent": True, **kw}

    def test_clone_gates(self):
        n = len(self.enroll_calls)
        cases = [
            (self.clone_body(consent=None), 400, "xác nhận"),
            (self.clone_body(consent="true"), 400, "xác nhận"),  # chỉ nhận true kiểu JSON
            (self.clone_body(name=""), 400, "Tên giọng"),
            (self.clone_body(name="../../etc/passwd"), 400, "Tên giọng"),
            (self.clone_body(name="a" * 41), 400, "Tên giọng"),
            (self.clone_body(name="Trúc Ly"), 409, "trùng"),
            (self.clone_body(audio_b64="không phải base64!"), 400, "base64"),
            (self.clone_body(audio_b64=base64.b64encode(b"ID3....mp3").decode()), 400, "WAV"),
            (self.clone_body(audio_b64=base64.b64encode(wav(1.0)).decode()), 400, "3–30"),
            (self.clone_body(audio_b64=base64.b64encode(wav(31.0)).decode()), 400, "3–30"),
        ]
        for body, code, msg in cases:
            c, b = self.call("/voices", body)
            self.assertEqual(c, code, body.get("name"))
            self.assertIn(msg, json.loads(b)["error"])
        self.assertEqual(len(self.enroll_calls), n, "không trích giọng khi bị chặn")
        self.assertEqual(self.call("/voices", self.clone_body(), {"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.declared("/voices", vs.MAX_VOICE_BODY + 1), 413)
        self.assertEqual(self.declared("/tts", vs.MAX_BODY + 1), 413, "/tts giữ giới hạn nhỏ")
        self.assertNotEqual(self.declared("/voices", vs.MAX_BODY + 1), 413, "/voices nhận mẫu lớn hơn /tts")

    def declared(self, path, n):
        """Chỉ khai Content-Length n (không gửi body): máy chủ phải trả 413 trước khi đọc."""
        import http.client
        c = http.client.HTTPConnection("127.0.0.1", self.srv.server_address[1], timeout=5)
        try:
            c.putrequest("POST", path)
            c.putheader("Content-Type", "application/json")
            c.putheader("Content-Length", str(n))
            c.endheaders()
            if n <= vs.MAX_VOICE_BODY:
                c.send(b"{}" + b" " * (n - 2))
            return c.getresponse().status
        finally:
            c.close()

    def test_clone_roundtrip(self):
        code, b = self.call("/voices", self.clone_body(consent_note="Chính tôi"))
        self.assertEqual(code, 200, b)
        self.assertEqual(json.loads(b), {"name": "Giọng Minh", "seconds": 5.0})
        files = os.listdir(vs.voices_dir())
        self.assertEqual(len(files), 1)
        self.assertNotIn("Minh", files[0], "tên file theo hash, không theo tên giọng")
        with open(os.path.join(vs.voices_dir(), files[0]), encoding="utf-8") as f:
            rec = json.load(f)
        self.assertEqual((rec["name"], rec["consent"]), ("Giọng Minh", {"confirmed": True, "note": "Chính tôi"}))
        self.assertEqual(rec["speaker_emb"], [0.1, 0.2])
        # đọc lại từ đĩa (như khi máy chủ khởi động lại)
        vs._clones = None
        h = json.loads(self.call("/health")[1])
        self.assertTrue(h["clone"])
        self.assertEqual([(v["name"], v["kind"]) for v in h["voices"]], [("Hải Đăng", "preset"), ("Trúc Ly", "preset"), ("Giọng Minh", "clone")])
        self.assertEqual(self.call("/tts", {"text": "Xin chào", "voice": "Giọng Minh"})[0], 200)
        self.assertEqual(self.synth_calls[-1], ("Xin chào", "Giọng Minh"))
        c, b = self.call("/voices", self.clone_body())
        self.assertEqual(c, 409, "tạo lại cùng tên phải báo trùng, không thay giọng và xác nhận cũ")
        self.assertIn("Đã có giọng nhái", json.loads(b)["error"])
        self.assertEqual(self.call("/voices/delete", {"name": "Giọng Minh"})[0], 200)
        self.assertEqual(os.listdir(vs.voices_dir()), [])
        self.assertEqual(self.call("/voices/delete", {"name": "Giọng Minh"})[0], 404)
        self.assertEqual(self.call("/voices/delete", {"name": "Trúc Ly"})[0], 404, "không xoá được giọng có sẵn")
        self.assertEqual(self.call("/tts", {"text": "x", "voice": "Giọng Minh"})[0], 400)

    def test_nfd_name_and_limit(self):
        import unicodedata
        nfd = unicodedata.normalize("NFD", "Nguyễn Văn")
        code, b = self.call("/voices", self.clone_body(name=nfd))
        self.assertEqual(code, 200, b)
        self.assertEqual(json.loads(b)["name"], "Nguyễn Văn")
        self.assertEqual(self.call("/voices/delete", {"name": nfd})[0], 200)
        orig = vs.MAX_CLONES
        vs.MAX_CLONES = 0
        try:
            c, b = self.call("/voices", self.clone_body(name="Thứ 51"))
            self.assertEqual(c, 409)
            self.assertIn("giọng nhái; xoá bớt", json.loads(b)["error"])
        finally:
            vs.MAX_CLONES = orig

    def test_enroll_keeps_codes_shape(self):
        """codes của v3 Turbo là (khung × 16): làm phẳng thì infer() lỗi 'could not broadcast … (1040,) into (1040,16)'."""
        try:
            import numpy as np
        except ImportError:
            self.skipTest("cần numpy")
        orig_model = vs.model

        class M:
            def encode_reference(self, path):
                assert os.path.isfile(path)
                return np.zeros(192, dtype=np.float32), np.arange(48).reshape(3, 16)
        vs.model = M
        try:
            emb, codes = type(self).__dict__["_orig_enroll"](wav(4.0))  # hàm gốc, không gắn self
        finally:
            vs.model = orig_model
        self.assertEqual(len(emb), 192)
        self.assertEqual(np.asarray(codes).shape, (3, 16))

    def test_voice_arg(self):
        vs._clones = {"Giọng A": {"name": "Giọng A", "speaker_emb": [0.5, 0.25], "codes": [1, 2, 3]}}
        try:
            self.assertEqual(vs._voice_arg("Trúc Ly"), "Trúc Ly")
            try:
                import numpy  # noqa: F401
            except ImportError:
                self.skipTest("cần numpy")
            d = vs._voice_arg("Giọng A")
            self.assertEqual((d["speaker_emb"].tolist(), d["codes"].tolist()), ([0.5, 0.25], [1, 2, 3]))
        finally:
            vs._clones = None

    def test_bad_requests(self):
        self.assertEqual(self.call("/tts", {"text": "x", "voice": "Không Có"})[0], 400)
        self.assertEqual(self.call("/tts", {"text": "   "})[0], 400)
        self.assertEqual(self.call("/tts", {"text": "a" * (vs.MAX_TEXT + 1)})[0], 413)
        self.assertEqual(self.call("/tts", b"[1,2]")[0], 400)
        self.assertEqual(self.call("/prepare", {"audio": "a.wav"})[0], 404)


if __name__ == "__main__":
    unittest.main()
