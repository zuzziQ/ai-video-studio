"""Nghe lại một đoạn ngắn bằng Whisper (ROADMAP M95, panel Lời thoại → "Nghe lại bằng AI").

usage: python rehear.py <audio> <out.json> --from 12.2 --to 14.6 [--model large-v3] [--prompt "câu trước … từ khoá"] [--lang vi]
Cắt [from, to] (giây, theo thời gian của file) bằng ffmpeg vào <out>.16k.wav, nhận dạng có mốc thời gian từng từ.
Output: {"model", "device", "words": [{"w", "s", "e"}] (giây theo file gốc), "text", "load_ms", "run_ms"}
Dòng "@step <0..1> <chữ>" trên stdout là tiến độ cho Studio (studio/routes/22_rehear.mjs).
"""
import argparse
import json
import os
import subprocess
import sys
import time
import wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # python -I does not add the script dir

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("out")
ap.add_argument("--from", dest="t0", type=float, required=True)
ap.add_argument("--to", dest="t1", type=float, required=True)
ap.add_argument("--model", default="large-v3")
ap.add_argument("--prompt", default="")
ap.add_argument("--lang", default="vi")
a = ap.parse_args()


def step(p, msg):
    print(f"@step {p:.2f} {msg}", flush=True)


t0, t1 = max(0.0, a.t0), a.t1
if t1 - t0 < 0.2 or t1 - t0 > 60:
    sys.exit("Đoạn nghe lại phải dài 0,2–60 giây")
step(0.1, "Cắt đoạn âm thanh")
wav = a.out + ".16k.wav"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t0:.3f}", "-to", f"{t1:.3f}", "-i", a.src, "-ac", "1", "-ar", "16000", wav], check=True)

import numpy as np  # noqa: E402  (sau khi cắt: báo lỗi ffmpeg trước khi nạp thư viện nặng)
from faster_whisper import WhisperModel  # noqa: E402
from whisper_device import describe, load_model  # noqa: E402

with wave.open(wav) as w:
    audio = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
os.remove(wav)
step(0.25, f"Nạp model {a.model} (lần đầu sẽ tải model)")
t = time.time()
try:
    model, dev = load_model(WhisperModel, a.model)
except Exception as e:  # ngoại tuyến lần đầu: nói rõ, không lùi về model nhỏ (nghe lại bằng model nhỏ hơn thì vô ích)
    sys.exit(f"Chưa nạp được model {a.model} ({e.__class__.__name__}: {e}). Lần đầu cần mạng để tải model.")
load_ms = int((time.time() - t) * 1000)
step(0.6, f"Đang nghe lại bằng Whisper {a.model} ({describe(dev)})")
t = time.time()
segs, _ = model.transcribe(audio, language=None if a.lang == "auto" else a.lang, word_timestamps=True, vad_filter=False,
                           beam_size=5, temperature=0, condition_on_previous_text=False,
                           initial_prompt=a.prompt.strip() or None)
words = [{"w": x.word.strip(), "s": round(x.start + t0, 3), "e": round(x.end + t0, 3)} for s in segs for x in (s.words or [])]
run_ms = int((time.time() - t) * 1000)
out = {"model": a.model, "device": describe(dev), "words": words, "text": " ".join(x["w"] for x in words), "load_ms": load_ms, "run_ms": run_ms}
with open(a.out, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)
step(1, f"Xong: {len(words)} từ")
