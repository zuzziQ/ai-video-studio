"""Test M53: scripts/whisper_device.py chọn GPU/CPU cho faster-whisper và lùi về CPU khi CUDA lỗi.

Chạy: python -m unittest discover -s scripts/tests. Không cần faster-whisper, ctranslate2 hay GPU: model là hàm giả.
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import whisper_device as wd  # noqa: E402

ALL_CUDA = {"float32", "float16", "int8", "int8_float16", "int8_float32"}


class Factory:
    """Thay WhisperModel: ghi lại các lần gọi; ném lỗi theo thiết bị nếu được bảo."""

    def __init__(self, fail=None):
        self.calls, self.fail = [], fail or {}

    def __call__(self, name, **kw):
        self.calls.append((name, kw))
        err = self.fail.get(kw["device"])
        if err:
            raise err
        return ("model", name, kw["device"])


def load(env=None, cuda=(1, ALL_CUDA), missing=(), fail=None, warmup=None):
    f, warns = Factory(fail), []
    model, cfg = wd.load_model(f, "large-v3-turbo", env=env or {}, warn=warns.append, cuda=cuda,
                               missing=list(missing), cores=6, warmup=warmup)
    return model, cfg, f, warns


class PlanTest(unittest.TestCase):
    def test_auto_with_gpu(self):
        self.assertEqual(wd.plan("auto", 1, ALL_CUDA), [{"device": "cuda", "compute_type": "int8_float16"},
                                                        {"device": "cpu", "compute_type": "int8"}])

    def test_auto_without_gpu(self):
        self.assertEqual(wd.plan("auto", 0), [{"device": "cpu", "compute_type": "int8"}])

    def test_cpu_forced_ignores_gpu(self):
        self.assertEqual([c["device"] for c in wd.plan("cpu", 2, ALL_CUDA)], ["cpu"])

    def test_bad_mode_means_auto(self):
        self.assertEqual(wd.plan("gpu?", 1, ALL_CUDA)[0]["device"], "cuda")

    def test_compute_override_and_unsupported(self):
        self.assertEqual(wd.plan("auto", 1, ALL_CUDA, "float16")[0]["compute_type"], "float16")
        # GPU cũ (Pascal) không có float16: lùi về int8
        self.assertEqual(wd.plan("auto", 1, {"float32", "int8", "int8_float32"})[0]["compute_type"], "int8")


class LoadModelTest(unittest.TestCase):
    def test_gpu_ok(self):
        model, cfg, f, warns = load()
        self.assertEqual(model[2], "cuda")
        self.assertEqual(cfg, {"device": "cuda", "compute_type": "int8_float16"})
        self.assertEqual(len(f.calls), 1)
        self.assertEqual(warns, [])

    def test_no_gpu_uses_physical_cores_silently(self):
        model, cfg, f, warns = load(cuda=(0, set()))
        self.assertEqual(cfg, {"device": "cpu", "compute_type": "int8", "cpu_threads": 6})
        self.assertEqual(warns, [])

    def test_env_cpu(self):
        model, cfg, f, warns = load(env={"AVS_WHISPER_DEVICE": "CPU"})
        self.assertEqual(cfg["device"], "cpu")
        self.assertEqual(warns, [])

    def test_env_cuda_without_gpu_warns(self):
        model, cfg, f, warns = load(env={"AVS_WHISPER_DEVICE": "cuda"}, cuda=(0, set()))
        self.assertEqual(cfg["device"], "cpu")
        self.assertEqual(len(warns), 1)
        self.assertIn("không thấy GPU", warns[0])

    def test_missing_cudnn_skips_gpu_without_loading(self):
        model, cfg, f, warns = load(missing=["cuDNN"])
        self.assertEqual([c[1]["device"] for c in f.calls], ["cpu"])  # không thử CUDA: thiếu cuDNN làm chết tiến trình
        self.assertEqual(len(warns), 1)
        self.assertIn("cuDNN", warns[0])
        self.assertIn("6 luồng", warns[0])

    def test_cuda_load_error_falls_back(self):
        model, cfg, f, warns = load(fail={"cuda": RuntimeError("CUDA failed with error out of memory")})
        self.assertEqual(model[2], "cpu")
        self.assertEqual(len(warns), 1)
        self.assertIn("out of memory", warns[0])

    def test_cublas_error_at_first_inference_falls_back(self):
        def warmup(model):
            raise RuntimeError("Library cublas64_12.dll is not found or cannot be loaded")
        model, cfg, f, warns = load(warmup=warmup)
        self.assertEqual([c[1]["device"] for c in f.calls], ["cuda", "cpu"])
        self.assertIn("cublas64_12.dll", warns[0])

    def test_cpu_error_raised_without_gpu_warning(self):
        # model không tải được (offline): lỗi tải ném ra cho transcribe.py lùi về small, không đổ cho GPU
        err = OSError("couldn't connect to huggingface.co")
        f, warns = Factory({"cuda": err, "cpu": err}), []
        with self.assertRaises(OSError):
            wd.load_model(f, "large-v3-turbo", env={}, warn=warns.append, cuda=(1, ALL_CUDA), missing=[], cores=6,
                          warmup=None)
        self.assertEqual(warns, [])


class HelpersTest(unittest.TestCase):
    def test_physical_cores_positive(self):
        self.assertGreaterEqual(wd.physical_cores(), 1)
        self.assertLessEqual(wd.physical_cores(), os.cpu_count() or 1)

    def test_linux_cpuinfo(self):
        text = "".join(f"processor\t: {i}\nphysical id\t: 0\ncore id\t\t: {i % 4}\n\n" for i in range(8))
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as t:
            t.write(text)
        try:
            self.assertEqual(wd._linux_physical_cores(t.name), 4)
        finally:
            os.unlink(t.name)

    def test_missing_cuda_libs(self):
        def loader(have):
            def load(name):
                if name not in have:
                    raise OSError(name)
            return load
        win = sys.platform == "win32"
        blas, dnn8 = ("cublas64_12.dll", "cudnn64_8.dll") if win else ("libcublas.so.12", "libcudnn.so.8")
        self.assertEqual(wd.missing_cuda_libs(loader({blas, dnn8})), [])
        self.assertEqual(wd.missing_cuda_libs(loader({blas})), ["cuDNN"])
        self.assertEqual(wd.missing_cuda_libs(loader(set())), ["cuBLAS", "cuDNN"])

    def test_describe(self):
        self.assertEqual(wd.describe({"device": "cpu", "compute_type": "int8", "cpu_threads": 6}), "cpu int8, 6 luồng")
        self.assertEqual(wd.describe({"device": "cuda", "compute_type": "float16"}), "cuda float16")


if __name__ == "__main__":
    unittest.main()
