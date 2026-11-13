"""Cổng quảng cáo cho một dự án Studio: chính sách Meta/TikTok, claim gate, điểm nguyên bản.

usage: python ad_gates.py <thư mục dự án> [--against <dự án khác> ...]
In một JSON ra stdout: {enabled, industry, platforms, blocked, issues:[{t, kind, severity, code, msg, ref}], originality}.
Được `scripts/ai_qc.mjs` gọi khi timeline có `ads.on`. Spec: references/ad-gates.md.

Phần luật (`check_policy`, `check_script_claims`, `similarity`, `composite_similarity`) chuyển từ AI Video Factory
(services/api/avf/policy.py, creative.py, scale.py), giữ nguyên hành vi trừ một chỗ sửa lỗi: cụm từ rủi ro và từ
lợi ích nay khớp theo ranh giới từ ("số 1" không còn khớp "số 15", "100%" không còn khớp "1100%"); và một chỗ thu
hẹp: cảnh báo "có số liệu nhưng không gắn claim" chỉ tính số đi kèm %, thời gian hoặc số lần (xem `_MEASURE`).

Luật chỉ dò ngôn ngữ rủi ro theo chính sách công bố của Meta và TikTok. Không phải tư vấn pháp lý, không thay
kiểm duyệt của nền tảng và không bảo đảm quảng cáo được duyệt.
"""
from __future__ import annotations

import datetime
import hashlib
import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter

# ---------------------------------------------------------------- chính sách (policy.py)
INDUSTRIES = {
    "general": "Chung",
    "cosmetics": "Mỹ phẩm / chăm sóc da",
    "supplements": "Thực phẩm chức năng",
    "food": "Thực phẩm & đồ uống",
    "finance": "Tài chính",
    "health_device": "Thiết bị sức khoẻ",
}
PLATFORMS = {"meta": "Facebook / Instagram", "tiktok": "TikTok"}

# (code, regex, severity, ngành áp dụng (None = tất cả), nền tảng, thông điệp, tham chiếu chính sách)
_R = [
    ("POLICY-BEFORE-AFTER", r"\btrước\s*(và|&|/|-)\s*sau\b|before\s*(and|&|/)?\s*after|sau\s+\d+\s*(ngày|tuần|tháng)\s+(da|mặt|cân|vòng)",
     "critical", {"cosmetics", "supplements", "health_device"}, {"meta", "tiktok"},
     "So sánh trước/sau về cơ thể, da, cân nặng — Meta và TikTok từ chối quảng cáo dạng này",
     "Meta: Personal Health and Appearance · TikTok: Before-and-after imagery"),
    ("POLICY-GUARANTEE", r"\b(cam kết|đảm bảo|bảo đảm)\s+(hiệu quả|kết quả|hết|khỏi|trắng|giảm)|\b100\s*%\s*(hiệu quả|hết|khỏi|an toàn)|"
     r"\bchắc chắn\s+(hết|khỏi|giảm|trắng)|\b(hết|khỏi)\s+hẳn\b|\bhoàn toàn\s+(hết|khỏi)\b|\bvĩnh viễn\b",
     "critical", None, {"meta", "tiktok"},
     "Cam kết kết quả tuyệt đối — bị xếp vào 'misleading / exaggerated claims'",
     "Meta: Misleading Claims · TikTok: Exaggerated performance claims"),
    ("POLICY-MEDICAL", r"\b(chữa|điều trị|trị)\s+(khỏi|dứt|tận gốc|bệnh|mụn|nám|viêm|ung thư|tiểu đường|huyết áp)|\bkháng\s*(viêm|khuẩn)\b|"
     r"\bdiệt\s*khuẩn\b|\bthay thế\s+thuốc\b|\bkê\s*đơn\b|\bbác sĩ\s+khuyên\s+dùng\b",
     "critical", {"cosmetics", "supplements", "food", "general"}, {"meta", "tiktok"},
     "Công dụng y khoa (chữa/điều trị/kháng viêm) không được dùng cho mỹ phẩm, TPCN, thực phẩm",
     "Meta: Personal Health · TikTok: Medical claims for non-pharma"),
    ("POLICY-WEIGHT", r"\bgiảm\s+\d+\s*(kg|cân|ký)\b|\bgiảm\s+cân\s+(cấp tốc|thần tốc|nhanh chóng|siêu tốc)|\bđốt\s+mỡ\b|\bgiảm\s+mỡ\s+bụng\b",
     "critical", None, {"meta", "tiktok"},
     "Hứa hẹn giảm cân theo số kg / cấp tốc — nhóm bị hạn chế mạnh nhất trên cả hai nền tảng",
     "Meta: Weight loss products & claims · TikTok: Weight management (restricted)"),
    ("POLICY-PERSONAL", r"\b(bạn|chị|anh|em)\s+(đang\s+)?(béo|mập|xấu|già|lùn|đen|xấu xí|nhiều mụn|sạm)\b|\bda\s+(bạn|chị)\s+(xấu|tệ|sạm|đen)\b|"
     r"\bbạn\s+bị\s+(mụn|nám|hói|béo|tiểu đường)\b",
     "critical", None, {"meta", "tiktok"},
     "Ám chỉ đặc điểm cá nhân của người xem (ngoại hình, tình trạng sức khoẻ) — Meta cấm 'personal attributes'",
     "Meta: Personal Attributes · TikTok: Body shaming / negative self-perception"),
    ("POLICY-SUPERLATIVE", r"\b(số\s*1|số một|tốt nhất|duy nhất|đầu tiên|hàng đầu|độc quyền)\b(?!.*(theo|nguồn|khảo sát|chứng nhận))",
     "warning", None, {"meta", "tiktok"},
     "So sánh nhất ('số 1', 'tốt nhất', 'duy nhất') cần nguồn kiểm chứng, nếu không dễ bị từ chối",
     "Meta: Unsubstantiated claims · TikTok: Superlative claims require proof"),
    ("POLICY-URGENCY", r"\bchỉ\s+(hôm nay|trong\s+hôm nay|còn\s+\d+\s+(suất|chỗ|sản phẩm))|\bduy nhất\s+hôm nay\b|\bnhanh tay\s+kẻo\s+(hết|lỡ)\b|\bsắp\s+hết\s+hàng\b",
     "warning", None, {"meta", "tiktok"},
     "Khan hiếm/khẩn cấp không kiểm chứng được — Meta xếp vào 'misleading', TikTok yêu cầu đúng sự thật",
     "Meta: Misleading Claims (false urgency) · TikTok: Misleading promotions"),
    ("POLICY-PRICE", r"\b(giảm\s+giá|khuyến\s*mãi|ưu\s+đãi|miễn\s+phí|freeship|sale|giá\s+sốc|\d+\s*%\s*(off|giảm))\b",
     "warning", None, {"meta", "tiktok"},
     "Ưu đãi/giá nêu trong video phải khớp trang đích và còn hiệu lực lúc chạy quảng cáo",
     "Meta: Misleading Claims (offers) · TikTok: Price accuracy"),
    ("POLICY-TESTIMONIAL", r"\b(\d+|hàng\s+(nghìn|ngàn|triệu))\s+(khách|người|chị em)\s+(đã\s+)?(tin dùng|dùng|mua|hài lòng)\b|\bđánh giá\s+5\s*sao\b|\bchuyên gia\s+(khuyên|khuyến nghị)\b",
     "warning", None, {"meta", "tiktok"},
     "Số khách hàng / đánh giá / chuyên gia khuyên dùng cần bằng chứng kèm theo",
     "Meta: Unsubstantiated claims · TikTok: Fake testimonials"),
    ("POLICY-FINANCE", r"\b(lợi\s+nhuận|lãi\s+suất|x\d+\s*lần|nhân\s+\d+\s*lần|làm\s+giàu|thu\s+nhập\s+thụ\s+động)\b",
     "critical", {"finance"}, {"meta", "tiktok"},
     "Hứa hẹn lợi nhuận tài chính — bị cấm/ hạn chế theo giấy phép",
     "Meta: Financial products & services · TikTok: Financial services (restricted)"),
    ("POLICY-ALCOHOL-TOBACCO", r"\b(rượu|bia|thuốc\s+lá|vape|pod|cần\s+sa)\b",
     "critical", None, {"tiktok"},
     "TikTok cấm quảng cáo rượu bia, thuốc lá, vape",
     "TikTok: Prohibited industries"),
]
RULES = [{"code": c, "re": re.compile(r, re.IGNORECASE), "severity": s, "industries": i, "platforms": p, "message": m, "ref": ref}
         for c, r, s, i, p, m, ref in _R]

_PCT = re.compile(r"\d+([.,]\d+)?\s*%")

_INDUSTRY_HINTS = [
    ("supplements", ("thực phẩm chức năng", "tpcn", "bổ sung", "viên uống", "collagen", "vitamin")),
    ("cosmetics", ("mỹ phẩm", "chăm sóc da", "skincare", "serum", "kem", "dưỡng", "son", "trang điểm", "tóc")),
    ("food", ("thực phẩm", "đồ uống", "trà", "cà phê", "bánh", "sữa", "gia vị")),
    ("finance", ("tài chính", "đầu tư", "bảo hiểm", "vay", "chứng khoán", "crypto")),
    ("health_device", ("máy massage", "thiết bị y tế", "máy đo", "đai lưng")),
]


def detect_industry(text: str) -> str:
    """Đoán ngành từ một đoạn chữ (tên thương hiệu, tiêu đề, lời thoại). Không khớp gì thì 'general'."""
    low = text.lower()
    for ind, words in _INDUSTRY_HINTS:
        if any(_has(low, w) for w in words):
            return ind
    return "general"


def check_policy(beats: list[dict], industry: str = "general", platforms: set[str] | None = None) -> list[dict]:
    """Trả flags cùng định dạng claim gate: {beat, code, severity, message, ref, platforms}."""
    platforms = platforms or {"meta", "tiktok"}
    flags: list[dict] = []
    for i, b in enumerate(beats):
        text = f"{b.get('text', '')} {b.get('on_screen', '')}"
        for r in RULES:
            if r["industries"] and industry not in r["industries"]:
                continue
            if not (r["platforms"] & platforms):
                continue
            if r["re"].search(text):
                flags.append({"beat": i, "code": r["code"], "severity": r["severity"], "message": r["message"],
                              "ref": r["ref"], "platforms": sorted(r["platforms"] & platforms)})
        if _PCT.search(text) and not b.get("claim_ids"):
            flags.append({"beat": i, "code": "POLICY-NUMBER", "severity": "warning",
                          "message": "Số liệu phần trăm không gắn claim/nguồn — cần dẫn chứng hoặc bỏ",
                          "ref": "Meta/TikTok: Unsubstantiated claims", "platforms": sorted(platforms)})
    return flags


# ---------------------------------------------------------------- claim gate (creative.py)
RISKY_PHRASES = [
    "chữa khỏi", "điều trị", "trị dứt điểm", "khỏi hẳn", "100%", "cam kết", "tốt nhất", "số 1", "duy nhất",
    "thần kỳ", "thần thánh", "vĩnh viễn", "ngay lập tức", "bác sĩ khuyên", "chuyên gia khuyên", "không tác dụng phụ",
    "an toàn tuyệt đối", "giảm cân", "trắng bật tông", "hiệu quả sau 1 ngày",
]
BENEFIT_WORDS = ["giúp", "hiệu quả", "cải thiện", "làm sáng", "làm mờ", "giảm", "tăng cường", "ngăn ngừa", "phục hồi",
                 "an toàn", "chống", "căng bóng", "trắng", "mờ thâm", "se khít", "dưỡng ẩm sâu"]
CITE_BLOCK = 0.2      # độ khớp tối thiểu giữa câu và claim được trích (nội bộ, cần hiệu chỉnh bằng dữ liệu gán nhãn)
CITE_WARN = 0.35
# Số liệu cần dẫn chứng: số đi kèm phần trăm, thời gian hoặc số lần. Bản gốc tính mọi con số; trong Studio chữ trên
# màn hình đầy giá tiền, địa chỉ, mã giảm giá nên chỉ giữ các số đo hiệu quả.
_MEASURE = re.compile(r"(?<![\w.,])(\d+)(?:[.,]\d+)?\s*(?:%|ngày|tuần|tháng|giờ|phút|lần)(?!\w)", re.IGNORECASE)


def norm(text: str) -> str:
    text = unicodedata.normalize("NFC", text.lower())
    return re.sub(r"[^\w\s%]", " ", text)


def tokens(text: str) -> list[str]:
    return [t for t in norm(text).split() if t]


def _has(low: str, phrase: str) -> bool:
    """Cụm từ có trong chuỗi đã chuẩn hoá, tính theo ranh giới từ (ký tự chữ, số và % là một phần của từ)."""
    p = " ".join(norm(phrase).split())
    if not p:
        return False
    return re.search(r"(?<![\w%])" + re.escape(p).replace(r"\ ", r"\s+") + r"(?![\w%])", low) is not None


def _vec(text: str) -> Counter:
    t = tokens(text)
    return Counter(t + [a + "_" + b for a, b in zip(t, t[1:])])


def similarity(a: str, b: str) -> float:
    """Cosine trên unigram+bigram — chỉ là chỉ số nội bộ, không đại diện quyết định nền tảng."""
    va, vb = _vec(a), _vec(b)
    if not va or not vb:
        return 0.0
    dot = sum(va[k] * vb[k] for k in va.keys() & vb.keys())
    return round(dot / (math.sqrt(sum(v * v for v in va.values())) * math.sqrt(sum(v * v for v in vb.values()))), 3)


def check_script_claims(beats: list[dict], claims: list[dict], blocked: list[str] | None = None) -> list[dict]:
    approved = {c["id"]: c for c in claims if c["status"] == "approved"}
    prohibited = [c for c in claims if c["status"] in ("prohibited", "expired")]
    blocked = [b.lower() for b in (blocked or []) if b.strip()]
    flags: list[dict] = []
    for i, beat in enumerate(beats):
        text = beat.get("text", "")
        low = norm(text)
        cited = [approved[c] for c in beat.get("claim_ids", []) or [] if c in approved]
        for cid in beat.get("claim_ids", []) or []:
            if cid not in approved:
                flags.append({"beat": i, "code": "BLOCK-01", "severity": "critical",
                              "message": f"Câu dẫn claim {cid[:8]} chưa được duyệt hoặc không tồn tại"})
        if cited:
            # Trích dẫn phải khớp nội dung: chặn việc gắn ID hợp lệ cho một câu lợi ích bịa thêm
            best = max(similarity(text, c["text"]) for c in cited)
            if best < CITE_BLOCK:
                flags.append({"beat": i, "code": "BLOCK-01", "severity": "critical",
                              "message": f"Câu không khớp nội dung claim được trích (độ khớp {best:.0%}): “{cited[0]['text']}”"})
            elif best < CITE_WARN:
                flags.append({"beat": i, "code": "WARN-CITE", "severity": "warning",
                              "message": f"Câu diễn đạt khác claim được trích (độ khớp {best:.0%}) – cần người kiểm tra"})
        elif beat.get("type") in ("hook", "body") and any(_has(low, w) for w in BENEFIT_WORDS):
            flags.append({"beat": i, "code": "WARN-CLAIM", "severity": "warning",
                          "message": "Câu nêu lợi ích/công dụng nhưng không gắn claim đã duyệt"})
        for c in prohibited:
            if similarity(text, c["text"]) > 0.55:
                flags.append({"beat": i, "code": "BLOCK-01", "severity": "critical",
                              "message": f"Trùng claim bị cấm/hết hạn: “{c['text']}”"})
        for p in RISKY_PHRASES + blocked:
            if _has(low, p):
                flags.append({"beat": i, "code": "BLOCK-01", "severity": "critical",
                              "message": f"Cụm từ rủi ro/không được dùng: “{p}”"})
        nums = [m.group(1) for m in _MEASURE.finditer(text)]
        if nums and not beat.get("claim_ids"):
            supported = any(re.search(r"(?<!\d)" + re.escape(n) + r"(?!\d)", c["text"]) for c in approved.values() for n in nums)
            if not supported:
                flags.append({"beat": i, "code": "WARN-CLAIM", "severity": "warning",
                              "message": "Có số liệu nhưng không gắn evidence/claim đã duyệt"})
    return flags


# ---------------------------------------------------------------- điểm nguyên bản (scale.py)
ORIGINALITY_MIN = 0.35


def composite_similarity(a: dict, b: dict) -> dict:
    """Độ giống tổng hợp của hai bản: chữ 35% + hook 15% + hình 35% + tiếng 15%."""
    text = similarity(a["text"], b["text"])
    hook = similarity(a["hook"], b["hook"]) if a["hook"] and b["hook"] else text
    sa, sb_ = set(filter(None, a["scenes"])), set(filter(None, b["scenes"]))
    jac = len(sa & sb_) / len(sa | sb_) if (sa | sb_) else 0.0
    same_order = bool(a["scenes"]) and a["scenes"] == b["scenes"]
    visual = jac * (0.6 if a["format"] != b["format"] else 1.0) * (0.85 if a["font"] != b["font"] else 1.0)
    if same_order:
        visual = min(1.0, visual + 0.15)
    av, bv = a["voice"], b["voice"]
    audio = (0.6 if (av.get("voice"), av.get("provider")) == (bv.get("voice"), bv.get("provider")) else 0.0) \
        + (0.2 if av.get("rate") == bv.get("rate") else 0.0) + (0.2 if a["music"] == b["music"] else 0.0)
    total = 0.35 * text + 0.15 * hook + 0.35 * visual + 0.15 * audio
    return {"text": round(text, 3), "hook": round(hook, 3), "visual": round(visual, 3), "audio": round(audio, 3),
            "total": round(total, 3)}


def originality(me: dict, others: list[dict], minimum: float = ORIGINALITY_MIN) -> dict | None:
    """Điểm nguyên bản = 1 − độ giống tổng hợp với bản gần nhất. Không có bản nào để so thì trả None."""
    best, nearest = None, None
    for o in others:
        s = composite_similarity(me, o)
        if best is None or s["total"] > best["total"]:
            best, nearest = s, o
    if best is None:
        return None
    score = round(1 - best["total"], 3)
    return {"score": score, "min": minimum, "ok": score >= minimum, "nearest": nearest.get("id"), "parts": best,
            "compared": len(others)}


# ---------------------------------------------------------------- đọc dự án Studio
_SKIP_KEYS = {"type", "cid", "id", "image", "images", "icon", "mode", "enter", "exit", "color", "theme", "preset", "kind",
              "style", "layout", "logo", "bg", "url", "avatar", "side", "place", "frame", "grade", "shape", "anim",
              "font", "src", "file", "block", "screen", "video", "audio", "mask", "kf", "ease", "align", "pos", "fx"}
_NOT_TEXT = re.compile(r"^(#[0-9a-f]{3,8}|si:[\w-]+|https?://\S+|[\w./\\-]+\.(png|jpe?g|webp|gif|svg|mp4|mov|webm|mp3|wav|json))$", re.I)
_SENT_END = re.compile(r"[.!?…]+[\"'”’)]*$")


def _read_json(path: str):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_project(d: str) -> tuple[dict, list]:
    tl = _read_json(os.path.join(d, "timeline.json"))
    caps = tl.get("captions") or []
    if isinstance(caps, str):
        f = os.path.join(d, caps)
        caps = _read_json(f) if os.path.exists(f) else []
    return tl, caps


def sentences(caps: list, max_words: int = 28, gap: float = 0.8) -> list[dict]:
    """Ghép các từ phụ đề thành câu: ngắt ở dấu câu, quãng lặng > `gap` giây, hoặc đủ `max_words` từ."""
    words = [w for c in caps if not c.get("hidden") for w in (c.get("words") or []) if str(w.get("w", "")).strip()]
    out, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        if (nxt is None or _SENT_END.search(str(w["w"]).strip()) or len(cur) >= max_words
                or float(nxt.get("s", 0)) - float(w.get("e", w.get("s", 0))) > gap):
            out.append({"t": round(float(cur[0].get("s", 0)), 2), "text": " ".join(str(x["w"]).strip() for x in cur)})
            cur = []
    return out


def _strings(v, key: str = "") -> list[str]:
    if key in _SKIP_KEYS or key.startswith("_"):
        return []
    if isinstance(v, str):
        s = v.strip()
        return [s] if s and not _NOT_TEXT.match(s) and re.search(r"[^\W\d_]", s) else []
    if isinstance(v, list):
        return [s for x in v for s in _strings(x, key)]
    if isinstance(v, dict):
        return [s for k, x in v.items() for s in _strings(x, k)]
    return []


def screen_texts(tl: dict) -> list[dict]:
    """Chữ hiện trên màn hình của từng scene (mọi trường chuỗi không phải đường dẫn, màu, id)."""
    out = []
    for s in tl.get("scenes") or []:
        if not isinstance(s, dict) or s.get("hidden"):
            continue
        txt = " · ".join(_strings({k: v for k, v in s.items() if k != "note"}))
        if txt:
            out.append({"t": round(float(s.get("t0", s.get("t", 0)) or 0), 2), "text": txt})
    return out


def _file_id(d: str, rel) -> str | None:
    """Dấu vân tay nội dung của một file trong dự án (1 MB đầu); không đọc được thì dùng chính đường dẫn."""
    if not rel or not isinstance(rel, str):
        return None
    try:
        with open(os.path.join(d, rel), "rb") as f:
            return hashlib.sha1(f.read(1 << 20)).hexdigest()[:12]
    except OSError:
        return rel


HOOK_WINDOW = 3.0   # giây đầu: chữ trên màn hình bắt đầu trong khoảng này là hook người xem thấy


def hook_text(tl: dict, sents: list[dict]) -> str:
    """Hook người xem thấy: chữ trên màn hình bắt đầu trong 3 giây đầu; không có thì câu nói đầu tiên."""
    shown = [s["text"] for s in screen_texts(tl) if s["t"] < HOOK_WINDOW]
    return " ".join(shown) if shown else (sents[0]["text"] if sents else "")


def features(d: str) -> dict:
    """Đặc trưng một dự án để so độ giống: lời thoại, hook, chuỗi cảnh, gói style, kiểu phụ đề, giọng, nhạc."""
    tl, caps = load_project(d)
    sents = sentences(caps)
    aroll = tl.get("aroll")
    # video gốc cũng là hình: hai bản cùng A-roll, không thêm cảnh nào, phải tính là giống nhau về hình
    scenes = ["aroll:" + str(aroll.get("frames") or aroll.get("src") or "") if isinstance(aroll, dict) else "aroll:" + str(aroll)]
    for c in tl.get("clips") or []:
        src = c.get("src")
        scenes.append("clip:" + str(src.get("seq") if isinstance(src, dict) else src))
    for s in sorted((x for x in tl.get("scenes") or [] if isinstance(x, dict) and not x.get("hidden")),
                    key=lambda x: float(x.get("t0", x.get("t", 0)) or 0)):
        key = s.get("block") or s.get("image") or s.get("src") or " ".join(_strings(s))[:40]
        scenes.append(f"{s.get('type')}:{key}")
    audio = tl.get("audio") or {}
    music = [(m.get("src") or m.get("file") or m.get("mood") or m.get("name")) for m in audio.get("music") or [] if isinstance(m, dict)]
    return {"id": os.path.abspath(d), "text": " ".join(x["text"] for x in sents), "hook": hook_text(tl, sents),
            "scenes": scenes, "format": tl.get("pack") or "", "font": tl.get("caption_style") or "",
            "voice": {"voice": _file_id(d, audio.get("voice")), "provider": None,
                      "rate": [c.get("speed", 1) for c in tl.get("clips") or []]},
            "music": music}


def same_dir(a: str, b: str) -> bool:
    """Cùng một thư mục, kể cả khi hai đường dẫn viết khác nhau (tên ngắn 8.3 trên Windows, symlink, hoa/thường)."""
    try:
        return os.path.samefile(a, b)
    except OSError:
        return os.path.normcase(os.path.realpath(a)) == os.path.normcase(os.path.realpath(b))


AB_KINDS = {"hook", "style", "both"}   # các kiểu "Tạo phiên bản" của scripts/variants.mjs


def variant_group(d: str, tl: dict) -> dict:
    """Nhóm phiên bản cùng gốc (variants.json của dự án, hoặc của dự án gốc khi đang mở một phiên bản).

    `ab` = nhóm được khai là A/B có chủ đích: `ab_test: true`, hoặc file do variants.mjs viết (có `kind` hợp lệ)
    mà không ghi `ab_test: false`."""
    cands = [os.path.join(d, "variants.json")]
    base = (tl.get("_variant") or {}).get("base")
    if base:
        cands.append(os.path.join(base, "variants.json"))
    for f in cands:
        if os.path.exists(f):
            try:
                v = _read_json(f)
            except (OSError, ValueError):
                continue
            dirs = [v.get("base")] + [x.get("dir") for x in v.get("variants") or [] if isinstance(x, dict)]
            dirs = [os.path.abspath(x) for x in dirs if x and os.path.exists(os.path.join(x, "timeline.json"))]
            ab = v.get("ab_test") is True or (v.get("ab_test") is not False and v.get("kind") in AB_KINDS)
            return {"dirs": [x for x in dirs if not same_dir(x, d)], "ab": ab, "kind": v.get("kind")}
    return {"dirs": [], "ab": False, "kind": None}


def sibling_dirs(d: str, tl: dict) -> list[str]:
    """Các phiên bản cùng gốc, trừ chính dự án `d`."""
    return variant_group(d, tl)["dirs"]


# ---------------------------------------------------------------- Product Brain (M18, references/products.md)
# Hồ sơ sản phẩm dùng chung: $AVS_HOME/products/<id>.json, ghi bởi scripts/products.mjs (Studio, route 53_products).
# Dự án trỏ tới bằng `ads.product`. Id chỉ gồm [a-z0-9_-] nên không thoát được khỏi thư mục products/.
PRODUCT_ID = re.compile(r"[a-z0-9][a-z0-9_-]{0,63}")


class ProductError(ValueError):
    pass


def avs_home() -> str:
    return os.environ.get("AVS_HOME") or os.path.join(os.path.expanduser("~"), ".ai-video-studio")


def products_dir(home: str | None = None) -> str:
    return os.path.join(home or avs_home(), "products")


def product_file(pid, pdir: str | None = None) -> str:
    """Đường dẫn hồ sơ `pid`; id sai dạng hoặc file (qua symlink) nằm ngoài products/ → ProductError."""
    pdir = pdir or products_dir()
    if not isinstance(pid, str) or not PRODUCT_ID.fullmatch(pid):
        raise ProductError(f"id hồ sơ sản phẩm không hợp lệ: {str(pid)[:80]!r}")
    f = os.path.join(pdir, pid + ".json")
    if os.path.exists(f) and not same_dir(os.path.dirname(os.path.realpath(f)), pdir):
        raise ProductError("hồ sơ sản phẩm trỏ ra ngoài thư mục products/")
    return f


def load_product(pid, pdir: str | None = None) -> dict:
    f = product_file(pid, pdir)
    if not os.path.exists(f):
        raise ProductError(f"không thấy hồ sơ sản phẩm “{pid}” ({f})")
    p = _read_json(f)
    if not isinstance(p, dict):
        raise ProductError(f"hồ sơ sản phẩm “{pid}” hỏng")
    return p


def claim_status(c: dict, today: str | None = None) -> str:
    """Trạng thái dùng để soát của một claim trong hồ sơ: approved cần bằng chứng và chưa quá `expires`."""
    st = c.get("status")
    if st not in ("approved", "pending", "prohibited", "expired"):
        return "pending"
    today = today or datetime.date.today().isoformat()
    if st == "approved":
        if not str(c.get("evidence") or "").strip():
            return "pending"
        exp = str(c.get("expires") or "")
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", exp) and exp < today:
            return "expired"
    return st


def resolve_ads(cfg: dict, pdir: str | None = None, today: str | None = None) -> dict:
    """Gộp claim, cụm từ cấm và ngành của hồ sơ sản phẩm (`ads.product`) với phần nhập tay của dự án (dự án cũ).

    Trả {claims, blocked, industry, product, issues}; hồ sơ thiếu hoặc id sai → một vấn đề `PRODUCT-MISSING` mức cao."""
    claims = [{"id": str(c.get("id") or f"c{i + 1}"), "text": str(c.get("text") or ""), "status": c.get("status") or "approved"}
              for i, c in enumerate(cfg.get("claims") or []) if isinstance(c, dict) and str(c.get("text") or "").strip()]
    blocked = [str(b) for b in cfg.get("blocked") or [] if str(b).strip()]
    industry, info, issues = None, None, []
    pid = cfg.get("product")
    if pid:
        try:
            p = load_product(pid, pdir)
        except (ProductError, OSError, ValueError) as e:
            info = {"id": str(pid)[:80], "error": str(e)}
            issues.append({"t": 0, "kind": "ad_claim", "severity": "high", "code": "PRODUCT-MISSING", "ref": None,
                           "msg": f"Không đọc được hồ sơ sản phẩm nên chưa đối chiếu claim: {e}"})
        else:
            pc = [{"id": f"{pid}:{c.get('id') or i + 1}", "text": str(c.get("text") or ""), "status": claim_status(c, today)}
                  for i, c in enumerate(p.get("claims") or []) if isinstance(c, dict) and str(c.get("text") or "").strip()]
            claims = pc + claims
            seen = {b.lower() for b in blocked}
            blocked += [str(b) for b in p.get("blocked") or [] if str(b).strip() and str(b).lower() not in seen]
            industry = p.get("industry") if p.get("industry") in INDUSTRIES else None
            info = {"id": pid, "name": str(p.get("name") or pid), "claims": len(pc),
                    "approved": sum(c["status"] == "approved" for c in pc)}
    return {"claims": claims, "blocked": blocked, "industry": industry, "product": info, "issues": issues}


# ---------------------------------------------------------------- chạy trên một dự án
_SEV ={"critical": "high", "warning": "med"}
_REMINDER = {"POLICY-PRICE"}   # chỉ nhắc đối chiếu trang đích, không phải dấu hiệu vi phạm


def _issue(kind: str, t: float, flag: dict) -> dict:
    sev = "low" if flag["code"] in _REMINDER else _SEV.get(flag["severity"], "med")
    return {"t": t, "kind": kind, "severity": sev, "code": flag["code"], "msg": flag["message"], "ref": flag.get("ref")}


AB_SAME = 0.9   # hook và hình đều giống ≥ 90% thì không còn là hai phương án A/B


def _feats(dirs: list[str]) -> list[dict]:
    out = []
    for o in dirs:
        try:
            out.append(features(o))
        except (OSError, ValueError):
            pass
    return out


def originality_check(d: str, tl: dict, against: list[str], minimum: float) -> tuple[dict | None, list[dict]]:
    """Chấm nguyên bản riêng cho bản ngoài (`--against`) và cho nhóm phiên bản cùng gốc.

    Trong nhóm được khai là A/B (variants.json của "Tạo phiên bản"), các bản chủ ý chung lời thoại và hình: điểm thấp
    chỉ là nhắc mức thấp, không chặn, miễn là hook hoặc hình thật sự khác (< AB_SAME). Bản ngoài nhóm vẫn chặn mức cao."""
    group = variant_group(d, tl)
    ext = [o for o in against if not same_dir(o, d)]
    grp = [x for x in group["dirs"] if not any(same_dir(x, e) for e in ext)]
    me = features(d)
    ext_f, grp_f = _feats(ext), _feats(grp)
    o_ext = originality(me, ext_f, minimum) if ext_f else None
    o_grp = originality(me, grp_f, minimum) if grp_f else None
    if o_grp:
        o_grp["ab"] = group["ab"]
    issues = []

    def why(o):
        p = o["parts"]
        return (f"Điểm nguyên bản {o['score']:.2f} dưới ngưỡng {minimum:.2f}: quá giống {os.path.basename(str(o['nearest']))} "
                f"(chữ {p['text']:.0%}, hook {p['hook']:.0%}, hình {p['visual']:.0%}, tiếng {p['audio']:.0%})")

    if o_ext and not o_ext["ok"]:
        issues.append({"t": 0, "kind": "ad_originality", "severity": "high", "code": "BLOCK-04", "ref": None, "msg": why(o_ext)})
    if o_grp and not o_grp["ok"]:
        p = o_grp["parts"]
        if group["ab"] and min(p["hook"], p["visual"]) < AB_SAME:
            issues.append({"t": 0, "kind": "ad_originality", "severity": "low", "code": "INFO-AB", "ref": None,
                           "msg": why(o_grp) + ". Đây là phiên bản A/B có chủ đích (variants.json) nên không chặn; "
                                  "chạy chung một nhóm quảng cáo để so, đừng đăng như nhiều quảng cáo khác nhau"})
        else:
            extra = ". Cùng nhóm A/B nhưng hook và hình gần như giống hệt: chưa phải hai phương án" if group["ab"] else ""
            issues.append({"t": 0, "kind": "ad_originality", "severity": "high", "code": "BLOCK-04", "ref": None,
                           "msg": why(o_grp) + extra})
    cands = [o for o in (o_ext, o_grp) if o]
    orig = min(cands, key=lambda o: o["score"]) if cands else None
    if orig:
        orig = {**orig, "compared": len(ext_f) + len(grp_f)}
    return orig, issues


def run(d: str, against: list[str] | None = None) -> dict:
    tl, caps = load_project(d)
    cfg = tl.get("ads") if isinstance(tl.get("ads"), dict) else {}
    if not cfg.get("on"):
        return {"enabled": False, "issues": []}
    platforms = {p for p in cfg.get("platforms") or [] if p in PLATFORMS} or set(PLATFORMS)
    res = resolve_ads(cfg)
    claims, blocked = res["claims"], res["blocked"]
    approved = [c for c in claims if c["status"] == "approved"]

    spoken, shown = sentences(caps), screen_texts(tl)
    beats = [{"t": s["t"], "text": s["text"], "type": "hook" if i == 0 else "body", "where": "lời thoại"} for i, s in enumerate(spoken)]
    beats += [{"t": s["t"], "text": s["text"], "type": "screen", "where": "chữ trên màn hình"} for s in shown]
    for b in beats:   # Studio không có trích dẫn tay: câu được coi là dẫn claim đã duyệt nào khớp nội dung đủ gần
        b["claim_ids"] = [c["id"] for c in approved if similarity(b["text"], c["text"]) >= CITE_WARN]

    industry = cfg.get("industry") if cfg.get("industry") in INDUSTRIES else res["industry"]
    if not industry:
        brand = tl.get("brand") or {}
        industry = detect_industry(" ".join([str(brand.get("name") or ""), str(tl.get("title") or "")] + [b["text"] for b in beats]))

    def quote(b):
        return f" ({b['where']}: “{b['text'][:70]}{'…' if len(b['text']) > 70 else ''}”)"

    issues = list(res["issues"])
    for f in check_policy(beats, industry, platforms):
        b = beats[f["beat"]]
        issues.append(_issue("ad_policy", b["t"], {**f, "message": f["message"] + quote(b)}))
    for f in check_script_claims(beats, claims, blocked):
        if f["code"] == "WARN-CLAIM" and not approved:
            continue   # chưa khai claim nào thì không đòi dẫn chứng cho từng câu
        b = beats[f["beat"]]
        issues.append(_issue("ad_claim", b["t"], {**f, "message": f["message"] + quote(b)}))

    minimum = float(cfg.get("originality_min") or ORIGINALITY_MIN)
    orig, orig_issues = originality_check(d, tl, against or [], minimum)
    issues += orig_issues
    issues.sort(key=lambda i: i["t"])
    return {"enabled": True, "industry": industry, "industry_vi": INDUSTRIES[industry], "platforms": sorted(platforms),
            "claims": {"approved": len(approved), "other": len(claims) - len(approved)}, "product": res["product"],
            "blocked": any(i["severity"] == "high" for i in issues), "issues": issues, "originality": orig}


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__, file=sys.stderr)
        return 2
    d, against = argv[0], []
    if "--against" in argv:
        against = argv[argv.index("--against") + 1:]
    if os.path.isfile(d):
        d = os.path.dirname(os.path.abspath(d))
    try:
        out = run(d, against)
    except (OSError, ValueError) as e:
        print(f"LỖI: không đọc được dự án {d}: {e}", file=sys.stderr)
        return 1
    sys.stdout.reconfigure(encoding="utf-8")
    json.dump(out, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
