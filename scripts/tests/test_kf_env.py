"""S29 M209: đường bao âm lượng từ keyframe (scripts/kf_env.py) — cùng easing với engine/kf.js, biểu thức ffmpeg đúng giá trị."""
import math
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import kf_env as K  # noqa: E402

# giá trị in từ engine/kf.js (node -e "KF.EASE[e](k)") tại k = .1 .25 .5 .75 .9
JS = {
    "easeIn": [0.017027, 0.093465, 0.315357, 0.621862, 0.839428],
    "easeOut": [0.160572, 0.378138, 0.684643, 0.906535, 0.982973],
    "easeInOut": [0.019722, 0.129162, 0.5, 0.870838, 0.980278],
    "overshoot": [0.403933, 0.816289, 1.087401, 1.059647, 1.012616],
    "elastic": [1.25, 0.911612, 1.015625, 1.005524, 0.998047],
}


def ev(e, t):
    """Tính biểu thức ffmpeg (if / lt / pow / max) bằng Python tại t."""
    s = e.replace("if(", "_if(").replace("lt(", "_lt(").replace("pow(", "_pow(")
    return eval(s, {"_if": lambda c, a, b: a if c else b, "_lt": lambda a, b: a < b, "_pow": math.pow, "max": max, "t": t})


class KfEnv(unittest.TestCase):
    def test_ease_parity_with_js(self):
        for n, vals in JS.items():
            for k, v in zip([.1, .25, .5, .75, .9], vals):
                self.assertAlmostEqual(K.EASE[n](k), v, places=5, msg=n)
        for n in ("linear", "in", "out", "inOut", "back", "bounce", "hold"):
            self.assertIn(n, K.EASE)
        self.assertAlmostEqual(K.EASE["back"](.5), 1 + 2.7 * (-.5) ** 3 + 1.7 * .25)

    def test_value_at_per_prop(self):
        kf = [{"t": 0, "gain": -10, "ease": "linear"}, {"t": 1, "volume": .5}, {"t": 2, "gain": -30}]
        self.assertEqual(K.value_at(kf, "gain", 1), -20)
        self.assertEqual(K.value_at(kf, "gain", -1), -10)
        self.assertEqual(K.value_at(kf, "gain", 5), -30)
        self.assertIsNone(K.value_at(kf, "rot", 1))
        self.assertEqual(K.value_at(kf, "volume", 0), .5)

    def test_no_keys_keeps_old_filter(self):
        self.assertEqual(K.gain_filter(None, -20), "volume=-20dB")
        self.assertEqual(K.gain_filter([{"t": 0, "volume": 1}], -16), "volume=-16dB")
        self.assertIsNone(K.volume_filter(None))
        self.assertIsNone(K.volume_filter([{"t": 0, "gain": -3}]))

    def test_gain_envelope_matches_curve(self):
        kf = [{"t": .5, "gain": -16, "ease": "easeInOut"}, {"t": 2.5, "gain": -40, "ease": "hold"}, {"t": 3, "gain": -6}]
        f = K.gain_filter(kf, -16)
        m = re.fullmatch(r"volume='pow\(10,\((.*)\)/20\)':eval=frame", f)
        self.assertTrue(m, f)
        for t in [0, .5, .9, 1.5, 2.2, 2.5, 2.8, 2.999, 3, 4]:
            want = K.value_at(kf, "gain", t)
            self.assertAlmostEqual(ev(m.group(1), t), want, delta=.6, msg=t)  # lấy mẫu 8 đoạn / khoảng
        self.assertAlmostEqual(ev(m.group(1), 2.8), -40, places=3)  # hold: giữ tới key sau

    def test_volume_envelope_and_bezier(self):
        kf = [{"t": 0, "volume": 1, "bz": [0, 0, 1, 1]}, {"t": 2, "volume": 0}]
        f = K.volume_filter(kf)
        e = re.fullmatch(r"volume='(.*)':eval=frame", f).group(1)
        for t in [0, .5, 1, 1.5, 2, 3]:
            self.assertAlmostEqual(ev(e, t), max(0, 1 - min(t, 2) / 2), places=3)

    def test_mix_audio_uses_envelope(self):
        with open(os.path.join(os.path.dirname(__file__), "..", "mix_audio.py"), encoding="utf8") as fh:
            src = fh.read()
        self.assertIn("kf_env.gain_filter(m.get('kf'), m.get('gain', -20))", src)
        self.assertIn('kf_env.volume_filter(c.get("kf"))', src)


if __name__ == "__main__":
    unittest.main()
