"""Word-level Vietnamese transcript with faster-whisper.

usage: python transcribe.py <video_or_audio> <out_words.json> [--model large-v3-turbo|small|medium|large-v3]
Output: [{"w": "Video", "s": 0.00, "e": 0.32, "p": 0.97}, ...]
        + <out>.meta.json {"dur", "raw", "words", "speech", "dropped": [{t0,t1,text,why}]} (S16 M119: video không lời)  (flat list of words, seconds; p = Whisper word probability,
        used by the Studio's "Soát kỹ" to pick spots worth re-hearing, ROADMAP M96)
"""
import argparse
import json
import os
import subprocess
import sys
import wave

import numpy as np
from faster_whisper import WhisperModel

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # python -I does not add the script dir
from whisper_device import describe, load_model  # GPU NVIDIA khi chạy được, không thì CPU (M53)
from hallucination import filter_segments  # S16 M119: bỏ lời whisper bịa trên nhạc / tiếng ồn

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("out")
# large-v3-turbo: ~2 % word error on Vietnamese vs ~13 % for small, ~2× slower (see references/captions-accuracy.md).
ap.add_argument("--model", default="large-v3-turbo")
ap.add_argument("--lang", default="vi")  # "auto" = detect
a = ap.parse_args()

# Decode with ffmpeg ourselves: PyAV versions bundled with faster-whisper vary and break decode_audio.
wav = a.out + ".16k.wav"
# Clip without an audio stream: nothing to transcribe (cut.py then keeps the whole clip).
if not subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", a.src],
                      capture_output=True, text=True).stdout.strip():
    json.dump([], open(a.out, "w"))
    json.dump({"dur": None, "raw": 0, "words": 0, "speech": False, "noAudio": True, "dropped": []}, open(a.out + ".meta.json", "w"))
    print(f"0 words (video không có tiếng) -> {a.out}")
    raise SystemExit(0)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.src, "-ac", "1", "-ar", "16000", wav], check=True)
w = wave.open(wav)
audio = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768

try:
    model, dev = load_model(WhisperModel, a.model)
except Exception as e:  # first run offline / download failed: a worse transcript beats no transcript
    if a.model == "small":
        raise
    print(f"model {a.model} không tải được ({e.__class__.__name__}: {e}) — dùng tạm model small", flush=True)
    model, dev = load_model(WhisperModel, "small")
print(f"whisper: {describe(dev)}", flush=True)
segs, _ = model.transcribe(audio, language=None if a.lang == "auto" else a.lang, word_timestamps=True, vad_filter=False)
raw = []
for s in segs:
    print(f"[{s.start:6.2f}-{s.end:6.2f}] {s.text}", flush=True)
    raw.append({"text": s.text, "words": [{"w": x.word.strip(), "s": round(x.start, 3), "e": round(x.end, 3), "p": round(float(x.probability), 2)}
                                         for x in s.words]})
words, dropped = filter_segments(raw)
for d in dropped:
    print(f"bỏ lời bịa [{d['t0']:6.2f}-{d['t1']:6.2f}] {d['why']}: {d['text']}", flush=True)
n_raw = sum(len(x["words"]) for x in raw)
# "có lời" khi còn ít nhất vài từ thật; không thì dự án là video không lời (new_project.mjs ghi timeline.speech)
meta = {"dur": round(len(audio) / 16000, 2), "raw": n_raw, "words": len(words), "speech": len(words) >= 3, "dropped": dropped}
json.dump(meta, open(a.out + ".meta.json", "w"), ensure_ascii=False, indent=1)
json.dump(words, open(a.out, "w"), ensure_ascii=False, indent=1)
print(f"{len(words)} words ({n_raw - len(words)} bịa đã bỏ){'' if meta['speech'] else ' · video không lời'} -> {a.out}")
