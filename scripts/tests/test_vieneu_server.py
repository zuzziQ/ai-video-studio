"""Test M27: các cổng chặn của scripts/vieneu_server.py (không cần gói vieneu: danh sách giọng gán sẵn, không gọi model).

Chạy: python -m unittest discover -s scripts/tests
"""
import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import vieneu_server as vs  # noqa: E402


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        vs._voices = [{"name": "Hải Đăng"}, {"name": "Trúc Ly"}]
        vs._default = "Hải Đăng"
        cls.synth_calls = []
        cls._orig = vs.synth
        vs.synth = lambda text, voice: cls.synth_calls.append((text, voice)) or b"RIFF0000WAVE"
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), vs.Handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        cls.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        vs.synth = cls._orig
        vs._voices = vs._default = None

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
        self.assertEqual((j["ready"], j["clone"], j["default"]), (True, False, "Hải Đăng"))
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

    def test_clone_disabled(self):
        n = len(self.synth_calls)
        for body in ({"text": "x", "voice": {"kind": "clone", "ref": "C:/a.wav"}}, {"text": "x", "ref_audio": "a.wav"}, {"text": "x", "ref": "a.wav"}):
            code, b = self.call("/tts", body)
            self.assertEqual(code, 403)
            self.assertIn("Nhái giọng đang tắt", json.loads(b)["error"])
        self.assertEqual(len(self.synth_calls), n)

    def test_bad_requests(self):
        self.assertEqual(self.call("/tts", {"text": "x", "voice": "Không Có"})[0], 400)
        self.assertEqual(self.call("/tts", {"text": "   "})[0], 400)
        self.assertEqual(self.call("/tts", {"text": "a" * (vs.MAX_TEXT + 1)})[0], 413)
        self.assertEqual(self.call("/tts", b"[1,2]")[0], 400)
        self.assertEqual(self.call("/prepare", {"audio": "a.wav"})[0], 404)


if __name__ == "__main__":
    unittest.main()
