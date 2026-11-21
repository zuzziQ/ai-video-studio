"""S29 M207: tiếng theo đường cong tốc độ, tua ngược, đứng hình (scripts/speed_curve.py, dùng trong mix_audio.py)."""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import speed_curve as sc  # noqa: E402

# = PRESET_DUR của scripts/tests/s28_speed.test.mjs (engine/speed.js): thời lượng khi đoạn nguồn dài 1 s
PRESET_DUR = {"montage": 0.907421604903, "hero": 0.889938537395, "bullet": 1.690715166065,
              "jump_cut": 0.869669558795, "flash_in": 0.659408932744, "flash_out": 0.659408932744}


class SpeedCurve(unittest.TestCase):
    def test_dur_matches_engine(self):
        self.assertEqual(set(PRESET_DUR), set(sc.PRESETS))
        for k, v in PRESET_DUR.items():
            self.assertAlmostEqual(sc.dur({"in": 0, "out": 1, "speedCurve": k}, 1e9), v, places=9, msg=k)
        self.assertAlmostEqual(sc.dur({"in": 2, "out": 8, "speed": 2}), 3)
        self.assertAlmostEqual(sc.dur({"in": 3, "out": 3, "hold": 3}), 3)
        self.assertAlmostEqual(sc.dur({"in": 0, "out": 6, "reverse": True}), 6)

    def test_pieces_cover_span_and_sum_to_dur(self):
        for k in sc.PRESETS:
            for rev in (False, True):
                c = {"in": 1, "out": 7, "speedCurve": k, "reverse": rev}
                ps = sc.pieces(c)
                self.assertEqual(len(ps), sc.PIECES)
                self.assertAlmostEqual(sum(p[2] for p in ps), sc.dur(c), places=9)
                self.assertAlmostEqual(sum(p[1] - p[0] for p in ps), 6, places=9)
                first = ps[0]
                self.assertAlmostEqual(first[1] if rev else first[0], 7 if rev else 1, places=9)

    def test_graph_plain_reverse_hold_mute(self):
        plain = sc.clip_graph({"in": 0, "out": 4, "speed": 2}, "0:a", "p0", 2)
        self.assertEqual(len(plain), 1)
        self.assertIn("atempo=2.0000", plain[0])
        self.assertNotIn("areverse", plain[0])
        rev = sc.clip_graph({"in": 0, "out": 4, "reverse": True}, "0:a", "p0", 4)
        self.assertIn("areverse", rev[0])
        hold = sc.clip_graph({"in": 2, "out": 2, "hold": 3}, "0:a", "p0", 3)
        self.assertTrue(hold[0].startswith("anullsrc") and "duration=3.000" in hold[0])
        # jump_cut chạy 5× ở giữa: các đoạn đó im lặng (> 4×), đoạn còn lại có tiếng
        jc = sc.clip_graph({"in": 0, "out": 8, "speedCurve": "jump_cut"}, "0:a", "p0", sc.dur({"in": 0, "out": 8, "speedCurve": "jump_cut"}))
        mutes = [f for f in jc if f.startswith("anullsrc")]
        self.assertTrue(mutes and len(mutes) < sc.PIECES)
        self.assertTrue(jc[0].startswith("[0:a]asplit="))
        self.assertTrue(jc[-1].endswith("[p0]") and "concat=n=16" in jc[-1])
        for f in jc:
            for t in f.split("atempo=")[1:]:
                self.assertTrue(0.5 <= float(t.split(",")[0]) <= 2.0)

    @unittest.skipUnless(shutil.which("ffmpeg"), "cần ffmpeg")
    def test_ffmpeg_runs_curve_and_reverse(self):
        with tempfile.TemporaryDirectory() as d:
            src, out = os.path.join(d, "a.wav"), os.path.join(d, "o.wav")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:d=6", "-ar", "48000", src], check=True)
            clips = [{"in": 0, "out": 6, "speedCurve": "hero", "reverse": True}, {"in": 1, "out": 1, "hold": 1}]
            fc, parts = [], []
            for k, c in enumerate(clips):
                fc += sc.clip_graph(c, "0:a" if k == 0 else None, f"p{k}", sc.dur(c))
                parts.append(f"[p{k}]")
            fc.append("".join(parts) + f"concat=n={len(parts)}:v=0:a=1[v]")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-filter_complex", ";".join(fc), "-map", "[v]", out], check=True)
            got = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
                                       capture_output=True, text=True, check=True).stdout)
            self.assertAlmostEqual(got, sum(sc.dur(c) for c in clips), delta=0.05)


if __name__ == "__main__":
    unittest.main()
