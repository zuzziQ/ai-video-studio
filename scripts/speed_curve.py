"""S29 M207: tốc độ của clip trên track chính (bản Python của engine/speed.js, cùng thuật toán, cùng số) cho mix_audio.py.

clip.speed (đều) | clip.speedCurve ([{x, y}] hoặc tên preset; x = vị trí 0–1 trên đoạn nguồn theo chiều phát, y = hệ số 0,1–10×,
nội suy theo log) | clip.reverse (phát ngược) | clip.hold (đứng hình hold giây, im lặng).
Tiếng theo đường cong: chia đoạn nguồn thành PIECES đoạn, mỗi đoạn một atempo (= tốc độ trung bình của đoạn); đoạn nhanh hơn
MUTE_ABOVE× thì im lặng (như CapCut). Ngược: areverse từng đoạn. Chỉ dùng thư viện chuẩn.
"""
import math

N, MIN, MAX = 240, 0.1, 10.0
PIECES = 16
MUTE_ABOVE = 4.0


def _p(a):
    return [{"x": x, "y": y} for x, y in a]


PRESETS = {
    "montage": _p([[0, 1], [0.2, 3], [0.4, 0.6], [0.6, 0.6], [0.8, 3], [1, 1]]),
    "hero": _p([[0, 2.5], [0.35, 2.5], [0.45, 0.3], [0.55, 0.3], [0.65, 2.5], [1, 2.5]]),
    "bullet": _p([[0, 2], [0.3, 2], [0.4, 0.2], [0.6, 0.2], [0.7, 2], [1, 2]]),
    "jump_cut": _p([[0, 1], [0.4, 1], [0.45, 5], [0.55, 5], [0.6, 1], [1, 1]]),
    "flash_in": _p([[0, 5], [0.3, 5], [0.5, 1], [1, 1]]),
    "flash_out": _p([[0, 1], [0.5, 1], [0.7, 5], [1, 5]]),
}


def _num(v):
    try:
        return v is not None and v != "" and not isinstance(v, bool) and math.isfinite(float(v))
    except (TypeError, ValueError):
        return False


def _clamp(v, a, b):
    return min(b, max(a, v))


def norm(pts):
    if isinstance(pts, str):
        pts = PRESETS.get(pts)
    if not isinstance(pts, list):
        return None
    p = sorted(({"x": _clamp(float(q["x"]), 0, 1), "y": _clamp(float(q["y"]), MIN, MAX)}
                for q in pts if isinstance(q, dict) and _num(q.get("x")) and _num(q.get("y"))), key=lambda q: q["x"])
    if not p:
        return None
    if p[0]["x"] > 0:
        p.insert(0, {"x": 0.0, "y": p[0]["y"]})
    if p[-1]["x"] < 1:
        p.append({"x": 1.0, "y": p[-1]["y"]})
    return p


def value_at(p, u):
    i = 1
    while i < len(p) - 1 and p[i]["x"] < u:
        i += 1
    a, b = p[i - 1], p[i]
    k = _clamp((u - a["x"]) / (b["x"] - a["x"]), 0, 1) if b["x"] > a["x"] else 1
    return math.exp(math.log(a["y"]) + (math.log(b["y"]) - math.log(a["y"])) * k)


def speeds(p):
    """Tốc độ của N ô đều trên đoạn nguồn (giá trị giữa ô)."""
    return [value_at(p, (j + 0.5) / N) for j in range(N)]


def span(c):
    return max(0.0, float(c.get("out", 3)) - float(c.get("in", 0) or 0))


def curve_of(c):
    return norm(c["speedCurve"]) if c.get("speedCurve") else None


def dur(c, fps=30):
    m = 1 / (fps or 30)
    if c.get("hold") is not None:
        return max(m, float(c.get("hold") or 0))
    k = curve_of(c)
    if k:
        return max(m, span(c) * sum(1 / N / v for v in speeds(k)))
    return max(m, span(c) / (c.get("speed") or 1))


def pieces(c):
    """Đoạn tiếng theo thứ tự phát: [(src_a, src_b, out_dur, speed)], src_a < src_b là giây nguồn (ngược: đoạn cần areverse)."""
    a0, S = float(c.get("in", 0) or 0), span(c)
    out = float(c.get("out", 3))
    k = curve_of(c)
    if not k:
        return [(a0, out, S / (c.get("speed") or 1), float(c.get("speed") or 1))]
    sp, res, step = speeds(k), [], N // PIECES
    for g in range(0, N, step):
        f0, f1 = g / N * S, min(N, g + step) / N * S  # tiến độ theo chiều phát
        d = sum(S / N / v for v in sp[g:g + step])
        a, b = (out - f1, out - f0) if c.get("reverse") else (a0 + f0, a0 + f1)
        res.append((a, b, d, (f1 - f0) / d if d > 0 else 1.0))
    return res


def tempo_chain(sp):
    chain, t = [], sp
    while t > 2.0:
        chain.append("atempo=2.0")
        t /= 2.0
    while t < 0.5:
        chain.append("atempo=0.5")
        t /= 0.5
    chain.append(f"atempo={t:.4f}")
    return chain


SR = "aresample=48000,aformat=channel_layouts=stereo"


def clip_graph(c, inp, label, d):
    """Các bộ lọc ffmpeg ghi tiếng của clip c (đầu vào [inp], ví dụ "0:a") vào [label], dài đúng d giây.
    inp=None = clip không có tiếng: im lặng."""
    vol = c.get("volume", 1)
    if inp is None or c.get("hold") is not None:
        return [f"anullsrc=r=48000:cl=stereo,atrim=duration={d:.3f}[{label}]"]
    rev = ",areverse" if c.get("reverse") else ""
    ps = pieces(c)
    if len(ps) == 1:
        a, b, _, sp = ps[0]
        return [f"[{inp}]atrim=start={a}:end={b},asetpts=PTS-STARTPTS,{SR}{rev},{','.join(tempo_chain(sp))},"
                f"volume={vol},apad,atrim=duration={d:.3f}[{label}]"]
    fc, parts, live = [], [], [i for i, p in enumerate(ps) if p[3] <= MUTE_ABOVE]
    if live:
        fc.append(f"[{inp}]asplit={len(live)}" + "".join(f"[{label}s{i}]" for i in live) if len(live) > 1 else f"[{inp}]anull[{label}s{live[0]}]")
    for i, (a, b, pd, sp) in enumerate(ps):
        if sp > MUTE_ABOVE:
            fc.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={pd:.4f}[{label}q{i}]")
        else:
            fc.append(f"[{label}s{i}]atrim=start={a:.4f}:end={b:.4f},asetpts=PTS-STARTPTS,{SR}{rev},{','.join(tempo_chain(sp))},"
                      f"apad,atrim=duration={pd:.4f}[{label}q{i}]")
        parts.append(f"[{label}q{i}]")
    fc.append("".join(parts) + f"concat=n={len(parts)}:v=0:a=1,volume={vol},apad,atrim=duration={d:.3f}[{label}]")
    return fc
