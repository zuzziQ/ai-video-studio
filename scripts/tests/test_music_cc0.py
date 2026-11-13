"""Test M29: danh mục nhạc CC0 (assets/music/cc0/catalog.json) và scripts/music_cc0.py (tải, kiểm sha1, LICENSES.txt).

Chạy: python -m unittest discover -s scripts/tests. Không gọi mạng: "opener" giả trả nội dung cố định.
"""
import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
import unittest.mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import music_cc0 as m  # noqa: E402


class FakeResp(io.BytesIO):
    def __init__(self, data, url):
        super().__init__(data)
        self._url = url

    def geturl(self):
        return self._url

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


class FakeOpener:
    def __init__(self, data, final=None):
        self.data, self.final, self.urls = data, final, []

    def open(self, req, timeout=None):
        self.urls.append(req.full_url)
        return FakeResp(self.data, self.final or req.full_url)


class CatalogTest(unittest.TestCase):
    def test_every_track_has_verified_cc0_source(self):
        with open(m.CATALOG, encoding="utf-8") as f:
            d = json.load(f)
        tracks = d["tracks"]
        self.assertGreater(len(tracks), 0)
        ids = [t["id"] for t in tracks]
        self.assertEqual(len(ids), len(set(ids)), "mã bài trùng")
        for t in tracks:
            with self.subTest(t["id"]):
                self.assertEqual(t["licence"], "CC0-1.0")
                self.assertEqual(t["licence_url"], "https://creativecommons.org/publicdomain/zero/1.0/")
                self.assertTrue(t["source_page"].startswith("https://"))
                self.assertTrue(t["evidence"] and t["verified_on"])
                m.check_url(t["url"])
                self.assertRegex(t["sha1"], r"^[0-9a-f]{40}$")
                self.assertTrue(0 < t["bytes"] <= m.MAX_BYTES)
        self.assertEqual(len(m.catalog()), len(tracks))
        excluded = {x["id"] for x in d.get("excluded", [])}
        self.assertFalse(excluded & set(ids), "bài bị loại vẫn còn trong tracks")


class FetchTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="avs-cc0-")
        os.environ["AVS_MUSIC_CC0_DIR"] = self.dir
        self.data = b"ID3" + os.urandom(2000)
        self.t = {"id": "thu", "title": "Thử", "artist": "A", "mood": "calm", "url": "https://archive.org/download/x/thu.mp3",
                  "bytes": len(self.data), "sha1": hashlib.sha1(self.data).hexdigest(), "licence": "CC0-1.0",
                  "verified_on": "2026-11-13", "source_page": "https://archive.org/details/x", "duration_s": 1}
        self._cat = m.catalog
        m.catalog = lambda path=None: [self.t]

    def tearDown(self):
        m.catalog = self._cat
        os.environ.pop("AVS_MUSIC_CC0_DIR", None)
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_fetch_writes_file_and_licenses(self):
        op = FakeOpener(self.data, "https://ia800.us.archive.org/1/items/x/thu.mp3")
        f = m.fetch(self.t, op)
        self.assertEqual(f, os.path.join(self.dir, "thu.mp3"))
        with open(f, "rb") as h:
            self.assertEqual(h.read(), self.data)
        with open(os.path.join(self.dir, "LICENSES.txt"), encoding="utf-8") as h:
            lic = h.read()
        self.assertIn("Thử — A", lic)
        self.assertIn("CC0 1.0", lic)
        m.fetch(self.t, op)  # đã có, đúng sha1 → không tải lại
        self.assertEqual(len(op.urls), 1)

    def test_wrong_content_is_discarded(self):
        with self.assertRaises(ValueError):
            m.fetch(self.t, FakeOpener(self.data[:-1] + b"x"))
        self.assertEqual([x for x in os.listdir(self.dir) if x.endswith((".mp3", ".part"))], [])

    def test_redirect_outside_is_refused(self):
        with self.assertRaises(ValueError):
            m.fetch(self.t, FakeOpener(self.data, "https://evil.example/thu.mp3"))
        self.assertFalse(os.path.exists(os.path.join(self.dir, "thu.mp3")))

    def test_list_handles_missing_duration(self):
        self.t["duration_s"] = None
        out = io.StringIO()
        with unittest.mock.patch("sys.stdout", out):
            self.assertEqual(m.main(["list"]), 0)
        self.assertIn("thu", out.getvalue())

    def test_only_allowed_hosts(self):
        for bad in ("http://archive.org/download/x/a.mp3", "https://example.com/a.mp3", "file:///etc/passwd"):
            with self.assertRaises(ValueError):
                m.check_url(bad)


if __name__ == "__main__":
    unittest.main()
