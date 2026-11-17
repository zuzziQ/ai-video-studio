"""Lọc lời whisper bịa trên đoạn không ai nói (S16 M119).

Whisper (cả large-v3-turbo) gặp nhạc, tiếng ồn sự kiện, hát… hay "nghe" ra câu kết kênh YouTube với độ tin cậy cao
(no_speech_prob ~0, avg_logprob ~ -0.2), nên không lọc được theo điểm tin cậy; VAD Silero cũng coi nhạc có giọng hát là lời.
Hai dấu hiệu còn lại đủ chắc:
  1. câu nằm trong danh sách câu bịa quen của whisper (đăng ký kênh, cảm ơn đã theo dõi, phụ đề bởi…);
  2. mốc thời gian vỡ: có từ kéo dài vài giây (lời thật: một âm tiết < ~1.5 s) cùng nhiều từ dài 0 s hoặc mật độ từ rất thấp.

segment: {"text": str, "words": [{"w","s","e","p"}...]}  → (giữ: bool, lý do: str)
"""
import re
import unicodedata

# Không dấu, chữ thường, chỉ chữ/số/khoảng trắng. Mỗi mẫu là một cụm phải xuất hiện liền trong câu.
# ALWAYS: chỉ có trong lời bịa (tên kênh / dòng ghi công phụ đề lọt vào dữ liệu huấn luyện) → luôn bỏ.
ALWAYS = ["ghien mi go", "phu de boi", "phu de duoc thuc hien", "subtitles by", "amara org"]
# OUTRO: câu kết kênh. Vlog thật cũng nói những câu này, nên chỉ bỏ khi video không còn lời thật nào khác
# (hoặc mốc thời gian của đoạn đã vỡ, xử lý riêng).
OUTRO = [
    "subscribe", "dang ky kenh", "dang ki kenh", "nhan chuong", "bam chuong", "an chuong", "bat chuong",
    "like va share", "like share", "cam on cac ban da theo doi", "cam on cac ban da xem", "cam on da theo doi",
    "cam on cac ban da lang nghe", "hen gap lai cac ban", "hen gap lai trong", "khong bo lo nhung video",
    "thanks for watching", "thank you for watching", "please subscribe", "like and subscribe",
]
MIN_REAL = 8         # số từ lời thật (không thuộc câu kết kênh) để coi video có người nói
LONG_WORD = 3.0      # giây: một từ dài hơn thế là mốc thời gian vỡ
ZERO = 0.02          # giây: từ "dài 0"
ZERO_FRAC = 0.3      # ≥ 30 % từ dài 0
MIN_RATE = 1.0       # từ / giây của cả đoạn: lời nói thật thường 2–5


def norm(s):
    s = unicodedata.normalize("NFD", s.lower()).replace("đ", "d")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9 ]+", " ", s).split())


def has(text, phrases):
    padded = f" {text} "
    return next((p for p in phrases if f" {p} " in padded), None)


def judge(seg):
    """→ (giữ, lý do). Lý do rỗng khi giữ. Câu kết kênh (OUTRO) được giữ ở đây; filter_segments quyết theo cả video."""
    words = seg.get("words") or []
    text = norm(seg.get("text") or " ".join(w.get("w", "") for w in words))
    if not words or not text:
        return False, "trống"
    p = has(text, ALWAYS)
    if p:
        return False, f"câu bịa quen: {p}"
    durs = [max(0.0, float(w["e"]) - float(w["s"])) for w in words]
    span = max(float(words[-1]["e"]) - float(words[0]["s"]), 1e-3)
    longest = max(durs)
    if longest > LONG_WORD:
        zero = sum(d < ZERO for d in durs) / len(durs)
        rate = len(words) / span
        if zero >= ZERO_FRAC or rate < MIN_RATE:
            return False, f"mốc thời gian vỡ: từ dài {longest:.1f}s, {zero:.0%} từ dài 0, {rate:.1f} từ/s"
    return True, ""


def filter_segments(segs):
    """→ (từ giữ lại [phẳng, theo thứ tự], đoạn bỏ [{t0,t1,text,why}])."""
    keep, dropped = [], []
    for seg in segs:
        ok, why = judge(seg)
        if ok:
            keep.append(seg)
        else:
            ws = seg.get("words") or [{"s": 0, "e": 0}]
            dropped.append({"t0": ws[0]["s"], "t1": ws[-1]["e"], "text": (seg.get("text") or "").strip()[:120], "why": why})
    outro = [has(norm(s.get("text") or " ".join(w["w"] for w in s["words"])), OUTRO) for s in keep]
    real = sum(len(s["words"]) for s, o in zip(keep, outro) if not o)
    words = []
    for s, o in zip(keep, outro):
        if o and real < MIN_REAL:
            dropped.append({"t0": s["words"][0]["s"], "t1": s["words"][-1]["e"], "text": (s.get("text") or "").strip()[:120],
                            "why": f"câu kết kênh trên video không có lời thật: {o}"})
        else:
            words.extend(s["words"])
    dropped.sort(key=lambda d: d["t0"])
    return words, dropped
