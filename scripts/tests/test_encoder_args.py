"""M65: scripts/encoder_args.py — CLI lỗi / quá giờ / trả libx264 → args x264 cũ nguyên văn; phần cứng lỗi → chạy lại x264.

Chạy: python -m unittest scripts.tests.test_encoder_args
"""
import json
import os
import subprocess
import sys
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import encoder_args  # noqa: E402

X264 = ["-c:v", "libx264", "-crf", "16", "-preset", "fast"]
NVENC = ["-c:v", "h264_nvenc", "-preset", "p5", "-cq", "22"]


def fake(returncode=0, stdout="", exc=None):
    calls = []

    def run(argv, **kw):
        calls.append(argv)
        if exc:
            raise exc
        return SimpleNamespace(returncode=returncode, stdout=stdout, stderr="")
    return run, calls


class VideoArgs(unittest.TestCase):
    def setUp(self):
        encoder_args._memo.clear()

    def test_hw_args_from_cli(self):
        run, calls = fake(stdout=json.dumps(NVENC))
        self.assertEqual(encoder_args.video_args(16, x264=X264, preset="fast", run=run), NVENC)
        self.assertEqual(calls[0][1:], [encoder_args.CLI, "args", "--use", "derive", "--crf", "16", "--preset", "fast"])
        # lần sau trong cùng tiến trình không gọi node lại
        encoder_args.video_args(16, x264=X264, preset="fast", run=run)
        self.assertEqual(len(calls), 1)

    def test_fallbacks_to_old_x264(self):
        cases = [fake(exc=FileNotFoundError("node")), fake(exc=subprocess.TimeoutExpired("node", 30)),
                 fake(returncode=2, stdout=""), fake(stdout="not json"), fake(stdout="[1, 2]"), fake(stdout="[]"),
                 fake(stdout=json.dumps(["-c:v", "libx264", "-preset", "fast", "-crf", "16", "-pix_fmt", "yuv420p"]))]
        for run, _ in cases:
            encoder_args._memo.clear()
            self.assertEqual(encoder_args.video_args(16, x264=X264, preset="fast", run=run), X264)

    def test_real_cli_forced_x264(self):
        old = os.environ.get("AVS_ENCODER")
        os.environ["AVS_ENCODER"] = "x264"
        try:
            self.assertEqual(encoder_args.video_args(16, x264=X264, preset="fast"), X264)
        finally:
            if old is None:
                os.environ.pop("AVS_ENCODER", None)
            else:
                os.environ["AVS_ENCODER"] = old


class RunEncode(unittest.TestCase):
    def test_hw_failure_retries_x264(self):
        seen = []

        def run(argv, check):
            seen.append(argv)
            if "h264_nvenc" in argv:
                raise subprocess.CalledProcessError(1, argv)
            return "ok"
        self.assertEqual(encoder_args.run_encode(lambda v: ["ffmpeg", *v, "out.mp4"], NVENC, X264, run=run), "ok")
        self.assertEqual(seen[-1], ["ffmpeg", *X264, "out.mp4"])

    def test_x264_failure_raises(self):
        def run(argv, check):
            raise subprocess.CalledProcessError(1, argv)
        with self.assertRaises(subprocess.CalledProcessError):
            encoder_args.run_encode(lambda v: ["ffmpeg", *v], X264, X264, run=run)


if __name__ == "__main__":
    unittest.main()
