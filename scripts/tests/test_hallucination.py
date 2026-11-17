"""S16 M119: lọc lời whisper bịa trên video không có người nói (scripts/hallucination.py)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from hallucination import filter_segments, judge  # noqa: E402


def seg(text, times):
    ws = text.split()
    assert len(ws) == len(times)
    return {"text": " " + text, "words": [{"w": w, "s": s, "e": e, "p": 0.9} for w, (s, e) in zip(ws, times)]}


def even(text, t0, rate=3.0):
    ws = text.split()
    return seg(text, [(round(t0 + i / rate, 3), round(t0 + (i + 1) / rate - 0.03, 3)) for i in range(len(ws))])


# Ba đoạn whisper large-v3-turbo nghe ra trên video sự kiện chỉ có nhạc (Chủ repo thử 2026-11-17)
HOA_HAU = [
    seg("Hãy subscribe cho kênh Ghiền Mì Gõ Để không bỏ lỡ những video hấp dẫn",
        [(5.72, 6.56), (6.56, 6.56), (6.56, 6.56), (6.56, 6.56), (6.56, 6.56), (6.56, 6.74), (6.74, 6.74), (6.74, 8.16),
         (8.16, 15.56), (15.56, 15.84), (15.84, 16.26), (16.26, 16.34), (16.34, 16.34), (16.34, 16.34), (16.34, 16.34)]),
    seg("Cảm ơn các bạn đã theo dõi", [(30.0, 30.66), (30.66, 30.66), (30.66, 30.88), (30.88, 31.22), (31.22, 43.8), (43.8, 43.8), (43.8, 43.86)]),
    seg("Cảm ơn các bạn đã theo dõi", [(64.24, 64.84), (64.84, 65.14), (65.14, 86.54), (86.54, 86.68), (86.68, 86.74), (86.74, 86.74), (86.74, 86.74)]),
]


class Hallucination(unittest.TestCase):
    def test_video_su_kien_khong_loi(self):
        words, dropped = filter_segments(HOA_HAU)
        self.assertEqual(words, [])
        self.assertEqual(len(dropped), 3)
        self.assertIn("ghien mi go", dropped[0]["why"])

    def test_loi_noi_that_giu_nguyen(self):
        segs = [even("Xin chào mọi người hôm nay mình review chiếc máy ảnh mới", 0.5),
                even("Pin dùng được cả ngày và chụp đêm rất đẹp", 5.0)]
        words, dropped = filter_segments(segs)
        self.assertEqual(len(words), sum(len(s["words"]) for s in segs))
        self.assertEqual(dropped, [])

    def test_vlog_that_ket_bang_cau_cam_on_van_giu(self):
        segs = [even("Hôm nay mình đi chợ nổi Cái Răng từ sáng sớm", 0.5),
                even("Cảm ơn các bạn đã theo dõi nhớ đăng ký kênh nhé", 20.0)]
        words, dropped = filter_segments(segs)
        self.assertEqual(dropped, [])
        self.assertEqual(words[-1]["w"], "nhé")

    def test_cau_ket_kenh_mot_minh_bi_bo(self):
        words, dropped = filter_segments([even("Cảm ơn các bạn đã theo dõi", 40.0)])
        self.assertEqual(words, [])
        self.assertIn("không có lời thật", dropped[0]["why"])

    def test_tu_keo_dai_nhung_doan_binh_thuong_van_giu(self):
        # một từ ngân dài (hát, kéo giọng) trong đoạn nói đều: không phải mốc thời gian vỡ
        s = even("Và đây là khoảnh khắc mà tất cả chúng ta đều chờ đợi rất lâu rồi", 0.0)
        s["words"][5]["e"] = s["words"][5]["s"] + 3.5
        for w in s["words"][6:]:
            w["s"] += 3.5
            w["e"] += 3.5
        self.assertEqual(judge(s), (True, ""))

    def test_doan_trong_bi_bo(self):
        self.assertFalse(judge({"text": " ", "words": []})[0])


if __name__ == "__main__":
    unittest.main()
