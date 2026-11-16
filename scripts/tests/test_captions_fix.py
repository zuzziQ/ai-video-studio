"""captions.py --fix (M89): dictionary pairs fix whisper mistakes and keep timings."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "captions.py")


def run(words, *args):
    with tempfile.TemporaryDirectory() as d:
        src, out = os.path.join(d, "w.json"), os.path.join(d, "c.json")
        with open(src, "w", encoding="utf-8") as f:
            json.dump(words, f, ensure_ascii=False)
        subprocess.run([sys.executable, "-X", "utf8", SCRIPT, src, out, *args], check=True, capture_output=True)
        with open(out, encoding="utf-8") as f:
            return [w for c in json.load(f) for w in c["words"]]


W = [{"w": "thuyết", "s": 0.0, "e": 0.4}, {"w": "tiền", "s": 0.4, "e": 0.8}, {"w": "hóa", "s": 0.8, "e": 1.2},
     {"w": "của", "s": 1.2, "e": 1.5}, {"w": "lychee", "s": 1.5, "e": 2.0}]


class CaptionsFix(unittest.TestCase):
    def test_same_count_keeps_each_timing(self):
        out = run(W, "--fix=tiền hoá=tiến hoá")  # "hóa" vs "hoá": tone placement does not matter
        self.assertEqual([w["w"] for w in out[1:3]], ["tiến", "hoá"])
        self.assertEqual([(w["s"], w["e"]) for w in out[1:3]], [(0.4, 0.8), (0.8, 1.2)])

    def test_case_fix_and_more_words(self):
        out = run(W, "--fix=lychee=Lychee Group")
        self.assertEqual([w["w"] for w in out[-2:]], ["Lychee", "Group"])
        self.assertEqual(out[-2]["s"], 1.5)
        self.assertEqual(out[-1]["e"], 2.0)
        self.assertLess(out[-2]["e"], out[-1]["e"])

    def test_broken_pairs_are_skipped(self):
        out = run(W, "--fix=a=b=c;=x;của=")
        self.assertEqual([w["w"] for w in out], [w["w"] for w in W])

    def test_value_starting_with_dash_is_not_an_option(self):
        out = run(W, "--fix=-x=y")
        self.assertEqual(len(out), len(W))


class CaptionsProbability(unittest.TestCase):
    """M96: Whisper word probability `p` survives chunking; old words.json without `p` still works."""
    P = [{**w, "p": p} for w, p in zip(W, [0.99, 0.41, 0.62, 0.95, 0.3])]

    def test_p_is_kept(self):
        out = run(self.P)
        self.assertEqual([w.get("p") for w in out], [0.99, 0.41, 0.62, 0.95, 0.3])

    def test_old_words_without_p(self):
        self.assertTrue(all("p" not in w for w in run(W)))

    def test_fixed_word_drops_p_and_glue_takes_min(self):
        out = run(self.P, "--fix=tiền hóa=tiến hóa")
        self.assertEqual([w.get("p") for w in out[1:3]], [None, 0.62])  # "tiền" changed, "hóa" kept as is
        glued = run([{"w": "giảm", "s": 0, "e": .3, "p": .9}, {"w": "50", "s": .3, "e": .6, "p": .8}, {"w": "%", "s": .6, "e": .7, "p": .4}])
        self.assertEqual(glued[-1], {"w": "50%", "s": .3, "e": .7, "p": .4})


if __name__ == "__main__":
    unittest.main()
