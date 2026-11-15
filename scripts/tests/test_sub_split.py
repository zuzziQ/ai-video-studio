"""M63: bilingual subtitles - a translation the model split with words pulled into earlier fragments is re-split by source word share."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from sub_split import MAX_DRIFT, drift, fit_parts, split_like  # noqa: E402

# qa-reports/2026-11-15/video-e2e.md L3: what Claude returned for one phrase of sample/video-goc.mov
SRC = ["AI đã tiến hóa", "quá xa rồi", "và bây giờ đây", "là một video clip", "được edit tự", "động bằng AI"]
MODEL = ["AI has evolved so far,", "and now here's", "a video clip", "edited automatically", "entirely", "by AI."]
W = [len(s.split()) for s in SRC]


class SubSplit(unittest.TestCase):
    def test_drifted_split_is_resplit_in_step_with_speech(self):
        self.assertGreater(drift(MODEL, W), MAX_DRIFT)
        # "tự | động" is split across two source fragments, so "entirely" landing on the first one is in step with speech
        self.assertEqual(fit_parts(MODEL, W), ["AI has evolved", "so far,", "and now here's", "a video clip", "edited automatically entirely", "by AI."])

    def test_good_split_is_kept(self):
        good = ["AI has evolved", "so far,", "and now here's", "a video clip", "edited automatically", "entirely by AI."]
        self.assertLessEqual(drift(good, W), MAX_DRIFT)
        self.assertEqual(fit_parts(good, W), good)

    def test_wrong_count_and_cjk(self):
        self.assertEqual(fit_parts(["a b c d"], [1, 1]), ["a b", "c d"])
        self.assertEqual(split_like("你好世界", [1, 1]), ["你好", "世界"])
        self.assertEqual(fit_parts(["只有"], [2]), ["只有"])


if __name__ == "__main__":
    unittest.main()
