"""Tải sẵn mô hình nặng để lần đầu dùng tính năng không phải chờ (ROADMAP S15 M117).

usage: python -I scripts/prefetch_models.py [--model large-v3] [--only whisper|rembg] [--list]
  Không tham số: tải mọi mô hình trong scripts/models.json (whisper qua faster_whisper.download_model, cache
  model_cache.hf_cache(): AVS_MODEL_CACHE, không theo HOME giả; rembg qua rembg.new_session, thư mục của rembg). Đã có thì bỏ qua nhanh. In "▸ …" cho từng bước
  (Studio đưa lên thanh tiến trình). Gọi bởi install.ps1 / scripts/setup.sh và nút "Cài" của màn Kiểm tra máy.
  --list: in danh sách (JSON), không tải, không import thư viện nặng.
Mã thoát: 0 khi tải đủ, 1 khi có mô hình lỗi (mạng…): tính năng vẫn tự tải khi dùng lần đầu.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def load_models(path=os.path.join(HERE, "models.json")):
    with open(path, encoding="utf-8") as f:
        m = json.load(f)
    return [dict(x, kind="whisper") for x in m.get("whisper", [])] + [dict(x, kind="rembg") for x in m.get("rembg", [])]


def pick(models, name=None, only=None):
    out = [m for m in models if (not only or m["kind"] == only) and (not name or m["name"] == name)]
    if name and not out:
        raise SystemExit(f"Không có mô hình {name} trong scripts/models.json")
    return out


def fetch(m):
    if m["kind"] == "whisper":
        from faster_whisper import download_model
        sys.path.insert(0, HERE)
        from model_cache import hf_cache
        download_model(m["name"], cache_dir=hf_cache())
    else:
        from rembg import new_session
        new_session(m["name"])


def main(argv=None):
    # Console Windows (cp1252…) không in được tiếng Việt / "▸": ép UTF-8 như các script chạy với -X utf8
    for st in (sys.stdout, sys.stderr):
        try:
            st.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--model")
    ap.add_argument("--only", choices=["whisper", "rembg"])
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args(argv)
    todo = pick(load_models(), a.model, a.only)
    if a.list:
        print(json.dumps(todo, ensure_ascii=False))
        return 0
    bad = 0
    for i, m in enumerate(todo, 1):
        print(f"▸ Tải mô hình {m['kind']} {m['name']} (~{m['gb']} GB, {i}/{len(todo)}): {m['for']}", flush=True)
        try:
            fetch(m)
        except Exception as e:  # mạng, hết chỗ…: báo rồi đi tiếp mô hình sau
            bad += 1
            print(f"  lỗi tải {m['name']}: {e}", file=sys.stderr, flush=True)
    print("▸ Xong mô hình" + (f" ({bad} lỗi: tính năng sẽ tự tải khi dùng lần đầu)" if bad else ""), flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
