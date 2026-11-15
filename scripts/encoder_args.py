"""M65: args mã hoá video cho script Python theo encoder tự dò của Studio (chỉ thư viện chuẩn).

Hỏi `node scripts/encoder_cli.mjs args --use derive --crf N` (cùng pickEncoder của render_hw.mjs: NVENC/QSV/VideoToolbox
khi ffmpeg mở được, cache ở $AVS_HOME/encoders.json, AVS_ENCODER=x264 ép CPU). Không có Node, quá giờ, lỗi, hay CLI trả
libx264 → dùng đúng nguyên `x264` (args libx264 cũ của khâu đó).

    from encoder_args import video_args, run_encode
    venc = video_args(16, x264=["-c:v", "libx264", "-crf", "16", "-preset", "fast"], preset="fast")
    run_encode(lambda v: ["ffmpeg", ..., *v, out], venc, x264)   # lỗi với encoder phần cứng → chạy lại bằng x264
"""
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CLI = os.path.join(HERE, "encoder_cli.mjs")
_memo = {}


def node_bin():
    # Studio chạy dưới Node: AVS_NODE (nếu có) trỏ đúng bản đang chạy server
    return os.environ.get("AVS_NODE") or shutil.which("node") or "node"


def video_args(crf, *, x264, preset="medium", use="derive", timeout=30, run=subprocess.run):
    """crf (thang x264) → list args video. Mọi lỗi → list(x264) nguyên văn."""
    key = (crf, preset, use, tuple(x264))
    if key in _memo:
        return list(_memo[key])
    res = list(x264)
    try:
        r = run([node_bin(), CLI, "args", "--use", use, "--crf", str(int(crf)), "--preset", preset],
                capture_output=True, text=True, encoding="utf-8", timeout=timeout)
        args = json.loads(r.stdout or "null") if r.returncode == 0 else None
        if isinstance(args, list) and args and all(isinstance(x, str) for x in args) and "libx264" not in args:
            res = args
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    _memo[key] = res
    return list(res)


def run_encode(build, venc, x264, run=subprocess.run):
    """build(args_video) → argv ffmpeg. Chạy với venc; encoder phần cứng lỗi lúc chạy (hết phiên NVENC…) → chạy lại bằng x264."""
    try:
        return run(build(venc), check=True)
    except subprocess.CalledProcessError:
        if list(venc) == list(x264):
            raise
        print("[encoder] encoder phần cứng lỗi, chạy lại bằng libx264", file=sys.stderr)
        return run(build(list(x264)), check=True)
