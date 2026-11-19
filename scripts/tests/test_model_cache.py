"""Test: scripts/model_cache.py, cache whisper dùng chung mọi checkout (không theo HOME/USERPROFILE giả, không tương đối).

Chạy: python -m unittest discover -s scripts/tests. Không cần faster-whisper.
"""
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import model_cache as mc  # noqa: E402
import whisper_device as wd  # noqa: E402


class HfCacheTest(unittest.TestCase):
    def setUp(self):
        self.abs = os.path.join(tempfile.gettempdir(), "avs-models")
        self.default = os.path.join(mc.real_home(), ".cache", "huggingface", "hub")

    def test_precedence(self):
        self.assertEqual(mc.hf_cache({"AVS_MODEL_CACHE": self.abs, "HF_HUB_CACHE": "/khac" if os.name != "nt" else "C:\\khac"}), self.abs)
        self.assertEqual(mc.hf_cache({"HF_HOME": self.abs}), os.path.join(self.abs, "hub"))
        self.assertEqual(mc.hf_cache({"XDG_CACHE_HOME": self.abs}), os.path.join(self.abs, "huggingface", "hub"))
        self.assertEqual(mc.hf_cache({}), self.default)

    def test_relative_ignored(self):
        self.assertEqual(mc.hf_cache({"AVS_MODEL_CACHE": "models", "HF_HOME": ".hf", "HF_HUB_CACHE": "~/x"}), self.default)

    def test_fake_home_ignored(self):
        """Lượt kiểm người dùng mới đặt USERPROFILE/HOME vào thư mục tạm: cache vẫn ở home thật."""
        fake = tempfile.mkdtemp(prefix="avs-fake-home-")
        env = dict(os.environ, USERPROFILE=fake, HOME=fake)
        for k in ("AVS_MODEL_CACHE", "HF_HUB_CACHE", "HF_HOME", "XDG_CACHE_HOME"):
            env.pop(k, None)
        code = "import sys; sys.path.insert(0, sys.argv[1]); import model_cache as m; print(m.hf_cache())"
        out = subprocess.run([sys.executable, "-I", "-c", code, os.path.join(HERE, "..")], env=env,
                             capture_output=True, text=True, check=True).stdout.strip()
        self.assertEqual(os.path.normcase(out), os.path.normcase(self.default))
        self.assertFalse(os.path.normcase(out).startswith(os.path.normcase(fake)))

    def test_load_model_passes_download_root(self):
        seen = []

        def factory(name, **kw):
            seen.append(kw)
            return "m"

        wd.load_model(factory, "small", env={"AVS_WHISPER_DEVICE": "cpu", "AVS_MODEL_CACHE": self.abs}, cores=2)
        self.assertEqual(seen[0]["download_root"], self.abs)
        wd.load_model(factory, "small", env={"AVS_WHISPER_DEVICE": "cpu"}, cores=2, cache="/c")
        self.assertEqual(seen[1]["download_root"], "/c")


if __name__ == "__main__":
    unittest.main()
