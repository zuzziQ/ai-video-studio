"""Thư viện nhạc CC0 tuỳ chọn (M29): danh mục ở assets/music/cc0/catalog.json, file tải theo yêu cầu. Spec: references/music-cc0.md

  python music_cc0.py list [--mood calm]            danh sách bài (mã, tâm trạng, dài, đã tải chưa)
  python music_cc0.py fetch --id pond [--id ...]    tải bài vào $AVS_HOME/music/cc0/<mã>.<đuôi>, kiểm kích thước + sha1
  python music_cc0.py fetch --mood calm | --all     tải theo tâm trạng / cả thư viện (~290 MB)
  python music_cc0.py path pond                     in đường dẫn file (tải nếu chưa có) — dùng làm audio.music[].file

Mỗi bài trong danh mục đã được đối chiếu nhãn CC0 với trang nguồn (trường source_page, evidence, verified_on).
File nhạc không nằm trong repo; thư mục tải có LICENSES.txt (bài, tác giả, giấy phép, nguồn). CC0 không bắt buộc ghi công,
ghi công vẫn là việc nên làm. Chỉ dùng thư viện chuẩn.
"""
import argparse
import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CATALOG = os.path.join(HERE, "..", "assets", "music", "cc0", "catalog.json")
HOSTS = {"archive.org", "opengameart.org"}
MAX_BYTES = 40 * 1024 * 1024


def avs_home():
    return os.environ.get("AVS_HOME") or os.path.join(os.path.expanduser("~"), ".ai-video-studio")


def music_dir():
    return os.environ.get("AVS_MUSIC_CC0_DIR") or os.path.join(avs_home(), "music", "cc0")


def catalog(path=None):
    with open(path or CATALOG, encoding="utf-8") as f:
        d = json.load(f)
    return [t for t in d["tracks"] if t.get("licence") == "CC0-1.0" and t.get("verified_on")]


def local_file(t):
    ext = os.path.splitext(urllib.parse.urlparse(t["url"]).path)[1].lower() or ".mp3"
    return os.path.join(music_dir(), t["id"] + ext)


def allowed_host(host):
    host = host or ""
    return host in HOSTS or host.endswith(".archive.org")  # archive.org/download chuyển sang máy ia*.us.archive.org


def check_url(url):
    u = urllib.parse.urlparse(url)
    if u.scheme != "https" or u.hostname not in HOSTS:
        raise ValueError(f"Nguồn tải không nằm trong danh sách cho phép: {url}")
    return url


def sha1_of(f):
    h = hashlib.sha1()
    with open(f, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def fetch(t, opener=None):
    """Tải một bài (bỏ qua nếu đã có và đúng sha1). Sai kích thước / sha1 → xoá file tạm, báo lỗi."""
    out = local_file(t)
    if os.path.exists(out) and sha1_of(out) == t["sha1"]:
        return out
    os.makedirs(music_dir(), exist_ok=True)
    tmp = out + ".part"
    req = urllib.request.Request(check_url(t["url"]), headers={"User-Agent": "ai-video-studio music_cc0"})
    n = 0
    with (opener or urllib.request.build_opener()).open(req, timeout=120) as r:
        final = r.geturl()
        if urllib.parse.urlparse(final).scheme != "https" or not allowed_host(urllib.parse.urlparse(final).hostname):
            raise ValueError(f"Nguồn chuyển hướng ra ngoài: {final}")
        with open(tmp, "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                n += len(b)
                if n > MAX_BYTES:
                    break
                f.write(b)
    if n != t["bytes"] or sha1_of(tmp) != t["sha1"]:
        os.remove(tmp)
        raise ValueError(f"{t['id']}: file tải về không khớp danh mục ({n} byte, cần {t['bytes']}); đã bỏ")
    os.replace(tmp, out)
    write_licenses()
    return out


def write_licenses():
    have = [t for t in catalog() if os.path.exists(local_file(t))]
    lines = ["Nhạc CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/) tải bằng scripts/music_cc0.py.",
             "CC0 không bắt buộc ghi công; ghi tên tác giả khi đăng video vẫn được khuyến khích.", ""]
    for t in have:
        lines += [os.path.basename(local_file(t)), f"  Bài: {t['title']} — {t['artist']}", f"  Giấy phép: CC0 1.0 (đối chiếu {t['verified_on']})",
                  f"  Nguồn: {t['source_page']}", ""]
    os.makedirs(music_dir(), exist_ok=True)
    with open(os.path.join(music_dir(), "LICENSES.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main(argv=None):
    ap = argparse.ArgumentParser(description="Thư viện nhạc CC0 tuỳ chọn")
    sub = ap.add_subparsers(dest="cmd", required=True)
    ls = sub.add_parser("list")
    ls.add_argument("--mood")
    fe = sub.add_parser("fetch")
    fe.add_argument("--id", action="append", default=[])
    fe.add_argument("--mood")
    fe.add_argument("--all", action="store_true")
    pa = sub.add_parser("path")
    pa.add_argument("id")
    a = ap.parse_args(argv)
    cat = catalog()
    if a.cmd == "list":
        for t in cat:
            if not a.mood or t["mood"] == a.mood:
                dur = f"{t['duration_s']}s" if t.get("duration_s") else "?"
                print(f"{t['id']:<40} {t['mood']:<14} {dur:>5}  {'đã tải' if os.path.exists(local_file(t)) else '-':<7} "
                      f"{t['title']} — {t['artist']}")
        return 0
    if a.cmd == "path":
        t = next((x for x in cat if x["id"] == a.id), None)
        if not t:
            raise SystemExit(f"Không có bài '{a.id}' trong danh mục CC0")
        print(fetch(t))
        return 0
    pick = [t for t in cat if a.all or t["id"] in a.id or (a.mood and t["mood"] == a.mood)]
    unknown = set(a.id) - {t["id"] for t in cat}
    if unknown:
        raise SystemExit("Không có bài: " + ", ".join(sorted(unknown)))
    if not pick:
        raise SystemExit("Chọn --id, --mood hoặc --all")
    print(f"Tải {len(pick)} bài ({sum(t['bytes'] for t in pick) / 1e6:.0f} MB) vào {music_dir()}", flush=True)
    bad = 0
    for i, t in enumerate(pick, 1):
        try:
            fetch(t)
            print(f"tải {i}/{len(pick)} {t['id']}", flush=True)
        except (OSError, ValueError) as e:
            bad += 1
            print(f"lỗi {t['id']}: {e}", file=sys.stderr, flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
