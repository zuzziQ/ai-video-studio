"""S27 M195: music_auto (scripts/auto_sfx.py) giữ nền nhạc theo kịch bản (khúc _sheet), "Xoá phần tự động" không đụng nền đó.
Chạy: python -m unittest discover -s scripts/tests"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SFX = os.path.join(ROOT, "scripts", "auto_sfx.py")


class MusicSheetTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = self.tmp.name
        caps = [{"t0": i * 2, "t1": i * 2 + 2, "words": [{"w": "xin", "s": i * 2, "e": i * 2 + 1}, {"w": "chào", "s": i * 2 + 1, "e": i * 2 + 2}]} for i in range(15)]
        with open(os.path.join(d, "captions.json"), "w", encoding="utf-8") as f:
            json.dump(caps, f)
        self.tlf = os.path.join(d, "timeline.json")

    def tearDown(self):
        self.tmp.cleanup()

    def run_sfx(self, music, *args):
        with open(self.tlf, "w", encoding="utf-8") as f:
            json.dump({"width": 720, "height": 1280, "fps": 30, "duration": 30, "pack": "slate", "captions": "captions.json",
                       "scenes": [], "audio": {"music": music, "sfx": []}}, f)
        out = subprocess.run([sys.executable, "-I", "-X", "utf8", SFX, self.tlf, *args], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(out.returncode, 0, out.stderr)
        with open(self.tlf, encoding="utf-8") as f:
            return json.load(f)["audio"]["music"], out.stdout

    def test_skip_sheet_bed(self):
        was = {"t0": 0, "t1": 30, "mood": "tech", "gain": -20, "_ai": True}
        beds = [{"t0": 0, "t1": 14, "mood": "hype", "gain": -10, "offset": 0, "xfade": .8, "_ai": True, "_sheet": 0, "_was": [was]},
                {"t0": 14, "t1": 30, "mood": "sad", "gain": -10, "offset": 0, "xfade": .8, "_ai": True, "_sheet": 2}]
        music, log = self.run_sfx(beds, "--level", "vua", "--music", "auto")
        self.assertEqual(music, beds, "music_auto không được chia lại nền theo kịch bản")
        self.assertIn("giữ nhạc theo kịch bản", log)
        music, _ = self.run_sfx(beds, "--level", "vua", "--clear")
        self.assertEqual(music, beds, "Xoá phần tự động không đụng nền _sheet")

    def test_auto_still_replaces_ai(self):
        music, _ = self.run_sfx([{"t0": 0, "t1": 30, "mood": "tech", "gain": -20, "_ai": True}], "--level", "vua", "--music", "auto")
        self.assertTrue(music and all(m.get("_auto") for m in music))


if __name__ == "__main__":
    unittest.main()
