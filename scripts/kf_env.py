"""S29 M209: đường bao âm lượng từ keyframe cho mix_audio.py (chỉ thư viện chuẩn).

Cùng nghĩa với engine/kf.js: key = {t, <thuộc tính>, ease?, bz?}; thuộc tính nội suy giữa các key có nó, ngoài hai đầu giữ giá trị mép,
ease = đường cong của đoạn rời key (7 easing cũ + 5 preset bezier), bz = [x1, y1, x2, y2] thắng ease.
  nhạc nền:  music.kf  [{t (giây từ t0 của khối), gain (dB)}]   -> volume='pow(10,(…)/20)':eval=frame thay volume=<gain>dB
  clip chính: clip.kf  [{t (giây trong clip), volume (×, 0–2)}] -> volume='…':eval=frame sau chuỗi của clip (thay volume=<clip.volume>)
Đường cong không tuyến tính được lấy mẫu thành đoạn thẳng (STEPS mỗi đoạn) để biểu thức ffmpeg ngắn mà vẫn nghe liền.
"""
import math

STEPS = 8


def _bezier(x1, y1, x2, y2):
    cx = 3 * x1; bx = 3 * (x2 - x1) - cx; ax = 1 - cx - bx
    cy = 3 * y1; by = 3 * (y2 - y1) - cy; ay = 1 - cy - by
    sx = lambda u: ((ax * u + bx) * u + cx) * u
    sy = lambda u: ((ay * u + by) * u + cy) * u
    dx = lambda u: (3 * ax * u + 2 * bx) * u + cx

    def f(k):
        if not k > 0:
            return 0.0
        if k >= 1:
            return 1.0
        u = k
        for _ in range(8):
            e = sx(u) - k
            if abs(e) < 1e-7:
                return sy(u)
            d = dx(u)
            if abs(d) < 1e-6:
                break
            u -= e / d
        lo, hi, u = 0.0, 1.0, k
        for _ in range(40):
            x = sx(u)
            if abs(x - k) < 1e-7:
                break
            if x < k:
                lo = u
            else:
                hi = u
            u = (lo + hi) / 2
        return sy(u)
    return f


def _bounce(k):
    n, d = 7.5625, 2.75
    if k < 1 / d:
        return n * k * k
    if k < 2 / d:
        k -= 1.5 / d
        return n * k * k + .75
    if k < 2.5 / d:
        k -= 2.25 / d
        return n * k * k + .9375
    k -= 2.625 / d
    return n * k * k + .984375


def _elastic(k):
    if k <= 0:
        return 0.0
    if k >= 1:
        return 1.0
    return 2 ** (-10 * k) * math.sin((k * 10 - 0.75) * (2 * math.pi) / 3) + 1


BZ = {"easeIn": (0.42, 0, 1, 1), "easeOut": (0, 0, 0.58, 1), "easeInOut": (0.42, 0, 0.58, 1), "overshoot": (0.34, 1.56, 0.64, 1)}
EASE = {
    "linear": lambda k: k, "in": lambda k: k ** 3, "out": lambda k: 1 - (1 - k) ** 3,
    "inOut": lambda k: -(math.cos(math.pi * k) - 1) / 2,
    "back": lambda k: 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2, "hold": lambda k: 0.0, "bounce": _bounce, "elastic": _elastic,
    **{n: _bezier(*v) for n, v in BZ.items()},
}


def ease_of(k):
    bz = k.get("bz")
    if isinstance(bz, (list, tuple)) and len(bz) == 4:
        try:
            return _bezier(*[float(x) for x in bz])
        except (TypeError, ValueError):
            pass
    return EASE.get(k.get("ease"), EASE["linear"])


def _num(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def keys_of(kf, p):
    ks = [k for k in (kf or []) if isinstance(k, dict) and _num(k.get(p)) is not None and _num(k.get("t")) is not None]
    return sorted(ks, key=lambda k: float(k["t"]))


def value_at(kf, p, t):
    ks = keys_of(kf, p)
    if not ks:
        return None
    i = next((j for j, k in enumerate(ks) if float(k["t"]) > t), -1)
    if i <= 0:
        return float(ks[0 if i == 0 else -1][p])
    a, b = ks[i - 1], ks[i]
    ta, tb = float(a["t"]), float(b["t"])
    e = ease_of(a)(min(1.0, max(0.0, (t - ta) / max(1e-6, tb - ta))))
    return float(a[p]) + (float(b[p]) - float(a[p])) * e


def points(kf, p):
    """Các điểm (t, v) của đường gấp khúc xấp xỉ đường bao; [] khi không key nào có p."""
    ks = keys_of(kf, p)
    if not ks:
        return []
    pts = [(float(ks[0]["t"]), float(ks[0][p]))]
    for a, b in zip(ks, ks[1:]):
        ta, tb, va, vb = float(a["t"]), float(b["t"]), float(a[p]), float(b[p])
        name = a.get("ease")
        if name == "hold":  # giữ rồi nhảy ở key sau
            pts.append((tb - 1e-3, va))
        elif name not in (None, "linear") or a.get("bz"):
            f = ease_of(a)
            pts += [(ta + (tb - ta) * j / STEPS, va + (vb - va) * f(j / STEPS)) for j in range(1, STEPS)]
        pts.append((tb, vb))
    return pts


def expr(pts, fmt=lambda v: f"{v:.4f}"):
    """Biểu thức ffmpeg của t (giây) theo đường gấp khúc pts; dùng trong volume=…:eval=frame."""
    if not pts:
        return None
    out = fmt(pts[-1][1])
    for (ta, va), (tb, vb) in reversed(list(zip(pts, pts[1:]))):
        seg = fmt(va) if tb - ta < 1e-9 else f"{va:.4f}+({vb - va:.4f})*(t-{ta:.4f})/{tb - ta:.4f}"
        out = f"if(lt(t,{tb:.4f}),{seg},{out})"
    return f"if(lt(t,{pts[0][0]:.4f}),{fmt(pts[0][1])},{out})"


def gain_filter(kf, base_db):
    """Bộ lọc volume của khối nhạc: có key gain -> đường bao dB, không thì volume=<base>dB như cũ."""
    e = expr(points(kf, "gain"))
    return f"volume='pow(10,({e})/20)':eval=frame" if e else f"volume={base_db}dB"


def volume_filter(kf):
    """Bộ lọc volume theo key volume (×) của clip chính; None khi clip không có key âm lượng."""
    e = expr(points(kf, "volume"))
    return f"volume='max(0,{e})':eval=frame" if e else None
