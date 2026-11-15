"""Split a translated phrase back over its caption fragments (bilingual subtitles, scripts/dub.py). Standard library only.

split_like(text, weights): cut text into len(weights) pieces proportional to weights (source word counts).
drift(parts, weights): largest gap between where the model put the fragment boundaries and where the source words put them
  (cumulative share of tokens, 0..1). M63: the model kept the fragment count but moved words to earlier fragments
  ("AI has evolved so far," under "AI đã tiến hóa"), shifting the whole English line one caption early.
fit_parts(parts, weights): the model's split, or a proportional re-split when the count is wrong or it drifts > MAX_DRIFT.
"""

MAX_DRIFT = 0.15


def _spaced(text):
    return " " in text.strip()


def _toks(text, spaced):
    return text.split() if spaced else list(text.replace(" ", ""))  # CJK / Thai: split by characters


def split_like(text, weights):
    spaced = _spaced(text)
    toks, sep = _toks(text, spaced), " " if spaced else ""
    tot, out, k = sum(weights) or 1, [], 0
    for n, w in enumerate(weights):
        e = len(toks) if n == len(weights) - 1 else round(len(toks) * sum(weights[:n + 1]) / tot)
        out.append(sep.join(toks[k:e]))
        k = e
    return out


def drift(parts, weights):
    spaced = _spaced(" ".join(parts))
    n = [len(_toks(p, spaced)) for p in parts]
    tn, tw = sum(n), sum(weights)
    if not tn or not tw or len(parts) < 2:
        return 0.0
    cn = cw = 0
    worst = 0.0
    for a, b in zip(n[:-1], weights[:-1]):
        cn += a
        cw += b
        worst = max(worst, abs(cn / tn - cw / tw))
    return worst


def fit_parts(parts, weights):
    parts = [str(p).strip() for p in parts]
    if len(parts) != len(weights) or drift(parts, weights) > MAX_DRIFT:
        return split_like(" ".join(p for p in parts if p), weights)
    return parts
