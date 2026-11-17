"""Test S15 M117: scripts/prefetch_models.py (tải sẵn mô hình whisper / tách nền).

Chạy: python -m unittest discover -s scripts/tests. Không tải gì: fetch() được thay bằng hàm giả.
"""
import contextlib
import importlib.util
import io
import json
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC = importlib.util.spec_from_file_location("prefetch_models", os.path.join(HERE, "..", "prefetch_models.py"))
PM = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PM)


class PrefetchModels(unittest.TestCase):
    def test_list_has_large_v3_and_rembg(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(PM.main(["--list"]), 0)
        names = {m["name"]: m for m in json.loads(out.getvalue())}
        self.assertIn("large-v3", names)
        self.assertIn("large-v3-turbo", names)
        self.assertEqual(names["u2net_human_seg"]["kind"], "rembg")

    def test_pick(self):
        ms = PM.load_models()
        self.assertEqual([m["name"] for m in PM.pick(ms, "large-v3")], ["large-v3"])
        self.assertTrue(all(m["kind"] == "rembg" for m in PM.pick(ms, only="rembg")))
        with self.assertRaises(SystemExit):
            PM.pick(ms, "khong-co")

    def test_failure_goes_on_and_exits_1(self):
        seen, real = [], PM.fetch

        def fake(m):
            seen.append(m["name"])
            if m["name"] == "large-v3":
                raise OSError("mất mạng")
        PM.fetch = fake
        try:
            out, err = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                code = PM.main([])
        finally:
            PM.fetch = real
        self.assertEqual(code, 1)
        self.assertEqual(len(seen), len(PM.load_models()), "lỗi một mô hình vẫn tải tiếp mô hình sau")
        self.assertIn("▸ Tải mô hình whisper large-v3", out.getvalue())
        self.assertIn("mất mạng", err.getvalue())


if __name__ == "__main__":
    unittest.main()
