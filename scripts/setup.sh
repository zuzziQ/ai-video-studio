#!/bin/bash
# One-time setup: Python venv (whisper, rembg, numpy, scipy) + puppeteer-core. Needs ffmpeg + Google Chrome + Node 18.
# The sound + b-roll libraries ship pre-generated; they are only rebuilt here if missing.
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
./.venv/bin/pip -q install faster-whisper numpy scipy pillow "rembg[cpu]" onnxruntime
# Whisper on GPU (M53): NVIDIA GPU on Linux → cuBLAS + cuDNN for CUDA 12 via pip (~1.3 GB). AVS_NO_CUDA=1 skips it.
if [ "${AVS_NO_CUDA:-0}" != 1 ] && [ "$(uname)" = Linux ] && nvidia-smi -L >/dev/null 2>&1; then
  ./.venv/bin/pip -q install nvidia-cublas-cu12 "nvidia-cudnn-cu12>=9,<10" || echo "CUDA runtime not installed: whisper runs on CPU"
fi
./.venv/bin/pip -q install edge-tts || echo "edge-tts not installed (optional: online voices for scripts/dub.py --tts edge)"
# M117: heavy models (whisper large-v3-turbo + large-v3, rembg u2net_human_seg, ~4.9 GB) up front; AVS_NO_MODELS=1 skips.
if [ "${AVS_NO_MODELS:-0}" != 1 ]; then
  ./.venv/bin/python -I prefetch_models.py || echo "Models not fully downloaded: features download them on first use"
fi
npm install --silent
PY=./.venv/bin/python
[ -f ../assets/sfx/catalog.json ] || $PY gen_sfx.py ../assets/sfx --ext flac
[ -f ../assets/music/catalog.json ] || $PY gen_music.py ../assets/music
[ -f ../assets/broll/catalog.json ] || $PY gen_broll_catalog.py
echo "SFX:   $(ls ../assets/sfx/*.flac | wc -l | tr -d ' ') · music: $(ls ../assets/music/*.mp3 | wc -l | tr -d ' ') · b-roll presets: $($PY -c "import json;print(len(json.load(open('../assets/broll/catalog.json'))))")"
echo "OK. Python: $(pwd)/.venv/bin/python"
