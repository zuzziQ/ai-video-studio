"""Chọn và gọi giọng đọc (TTS) dùng chung cho dub.py và batch.mjs: macOS `say`, edge-tts, VieNeu (M27). Spec: references/voice.md

  python tts.py status                                   trạng thái các giọng (JSON)
  python tts.py say "Xin chào" --engine vieneu|edge|say [--voice TÊN] [--lang vi] --out file
                                                         đọc một câu; in "TTS {json}" (file thật, engine thật đã dùng)
  python tts.py vieneu-config [--url http://127.0.0.1:8771] [--python <venv python>] [--voice TÊN] [--default-engine vieneu|edge|say]
  python tts.py vieneu-start [--wait 60]                 bật máy chủ giọng VieNeu (chạy nền, chỉ nghe 127.0.0.1)
  python tts.py vieneu-clone --name TÊN --audio mau.m4a --consent [--note …] [--start 0] [--seconds 30]
                                                         tạo giọng nhái từ 3–30 s nói rõ; in "CLONE {json}"
  python tts.py vieneu-voice-rm --name TÊN               xoá giọng nhái

VieNeu chạy ở một máy chủ riêng (scripts/vieneu_server.py, trong môi trường Python riêng do install_vieneu.ps1 tạo),
cấu hình ở $AVS_HOME/config.json khoá "tts": {"vieneu": {"url", "python", "voice"}, "default_engine"}. default_engine là giọng
mặc định của job batch/dub khi job không ghi engine (Studio đặt ở hộp "Mô hình & giọng"). Chỉ nhận địa chỉ 127.0.0.1/localhost.
Không có máy chủ (hoặc ngôn ngữ không phải tiếng Việt) thì báo rõ ra stderr và lùi về edge-tts. Giọng nhái (C04 đã chốt cho
dùng) tạo bằng vieneu-clone, gọi theo tên như giọng có sẵn. Chỉ dùng thư viện chuẩn (dub.py/batch.mjs gọi bằng python -I).
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_URL = "http://127.0.0.1:8771"
EDGE_VI = "vi-VN-HoaiMyNeural"
LOOPBACK = {"127.0.0.1", "localhost", "::1"}
INSTALL_HINT = ("Cài một lần: powershell -ExecutionPolicy Bypass -File scripts\\install_vieneu.ps1 ; "
                "bật máy chủ: python scripts/tts.py vieneu-start")


def avs_home():
    return os.environ.get("AVS_HOME") or os.path.join(os.path.expanduser("~"), ".ai-video-studio")


def config_path():
    return os.path.join(avs_home(), "config.json")


def read_config():
    try:
        with open(config_path(), encoding="utf-8") as f:
            return json.load(f) or {}
    except (OSError, ValueError):
        return {}


def vieneu_conf():
    """{"url", "python", "voice"} của VieNeu; biến môi trường AVS_VIENEU_URL thắng config.json."""
    c = dict((read_config().get("tts") or {}).get("vieneu") or {})
    c["url"] = (os.environ.get("AVS_VIENEU_URL") or c.get("url") or DEFAULT_URL).rstrip("/")
    return c


ENGINES = ("say", "edge", "vieneu")


def default_engine():
    """Giọng mặc định cho job không ghi engine (khoá tts.default_engine); None khi chưa đặt."""
    e = (read_config().get("tts") or {}).get("default_engine")
    return e if e in ENGINES else None


def write_default_engine(engine):
    if engine not in ENGINES:
        raise ValueError(f"Giọng mặc định phải là: {', '.join(ENGINES)}")
    f = config_path()
    cur = read_config()
    cur["tts"] = {**(cur.get("tts") or {}), "default_engine": engine}
    _write_config(f, cur)
    return engine


def _write_config(f, cur):
    os.makedirs(os.path.dirname(f), exist_ok=True)
    tmp = f + ".tmp"
    with open(tmp, "w", encoding="utf-8") as h:
        json.dump(cur, h, ensure_ascii=False, indent=1)
    os.replace(tmp, f)
    try:
        os.chmod(f, 0o600)
    except OSError:
        pass


def check_loopback(url):
    u = urllib.parse.urlparse(url)
    if u.scheme != "http" or (u.hostname or "") not in LOOPBACK:
        raise ValueError(f"Địa chỉ máy chủ giọng phải là http://127.0.0.1:<cổng> (nhận: {url})")
    return url


def write_vieneu_conf(patch):
    """Gộp patch vào khoá tts.vieneu của config.json; các khoá khác giữ nguyên, quyền 600 như API key."""
    f = config_path()
    cur = read_config()
    tts = dict(cur.get("tts") or {})
    tts["vieneu"] = {**(tts.get("vieneu") or {}), **{k: v for k, v in patch.items() if v is not None}}
    cur["tts"] = tts
    _write_config(f, cur)
    return tts["vieneu"]


# ---------------------------------------------------------------- VieNeu client
def _request(url, path, body=None, timeout=5):
    check_loopback(url)
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url + path, data=data, headers={"Content-Type": "application/json"} if data else {})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # máy chủ ở 127.0.0.1: không đi qua proxy
    return opener.open(req, timeout=timeout)


def vieneu_health(url=None, timeout=2):
    """Trả JSON /health của máy chủ, hoặc None khi không gọi được."""
    try:
        with _request(url or vieneu_conf()["url"], "/health", timeout=timeout) as r:
            return json.loads(r.read() or b"{}")
    except (OSError, ValueError):
        return None


def vieneu_tts(text, out, voice, url=None, timeout=900):
    """Gọi POST /tts, ghi WAV vào out. Lỗi từ máy chủ → RuntimeError có thông báo của máy chủ."""
    try:
        with _request(url or vieneu_conf()["url"], "/tts", {"text": text, "voice": voice}, timeout=timeout) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read() or b"{}").get("error") or str(e)
        except ValueError:
            msg = str(e)
        raise RuntimeError(f"VieNeu lỗi: {msg}") from None
    if data[:4] != b"RIFF":
        raise RuntimeError("VieNeu trả về dữ liệu không phải WAV")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    tmp = out + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, out)
    return out


def voice_names(health):
    return [v.get("name") for v in (health or {}).get("voices") or [] if v.get("name")]


def clone_names(health):
    return [v.get("name") for v in (health or {}).get("voices") or [] if v.get("name") and v.get("kind") == "clone"]


# ---------------------------------------------------------------- nhái giọng (M27, C04 đã chốt cho dùng)
CLONE_SR = 24000
CLONE_MIN_SEC, CLONE_MAX_SEC = 3.0, 30.0


def _post_json(path, body, url=None, timeout=60):
    """POST JSON tới máy chủ VieNeu → dict; lỗi HTTP → RuntimeError có thông báo của máy chủ."""
    try:
        with _request(url or vieneu_conf()["url"], path, body, timeout=timeout) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read() or b"{}").get("error") or str(e)
        except ValueError:
            msg = str(e)
        raise RuntimeError(f"VieNeu lỗi: {msg}") from None


def clone_sample(src, seconds=CLONE_MAX_SEC, start=0.0):
    """File âm thanh/video bất kỳ → WAV PCM 16-bit mono 24 kHz, cắt tối đa `seconds` giây từ `start` (ffmpeg)."""
    if not os.path.isfile(src):
        raise SystemExit(f"Không thấy file mẫu giọng: {src}")
    seconds = max(CLONE_MIN_SEC, min(CLONE_MAX_SEC, float(seconds)))
    try:
        r = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-ss", str(max(0.0, float(start))), "-i", src, "-t", str(seconds),
                            "-vn", "-ac", "1", "-ar", str(CLONE_SR), "-f", "s16le", "-"], capture_output=True)
    except FileNotFoundError:
        raise SystemExit("Cần ffmpeg trong PATH để đọc file mẫu giọng.") from None
    if r.returncode:
        raise SystemExit("Không đọc được âm thanh của file mẫu (ffmpeg): " + r.stderr.decode("utf-8", "replace")[-200:])
    import io
    import wave
    pcm = r.stdout  # PCM thô: tự dựng header WAV (ffmpeg ghi WAV ra pipe thì không biết trước độ dài)
    secs = len(pcm) / (2.0 * CLONE_SR)
    if secs < CLONE_MIN_SEC:
        raise SystemExit(f"Mẫu giọng quá ngắn ({secs:.1f} s); cần ít nhất {CLONE_MIN_SEC:g} giây nói rõ.")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(CLONE_SR)
        w.writeframes(pcm[: len(pcm) // 2 * 2])
    return buf.getvalue(), secs


def vieneu_clone(name, src, consent, seconds=CLONE_MAX_SEC, start=0.0, note="", url=None):
    """Tạo giọng nhái `name` từ file mẫu. Bắt buộc consent (người dùng là chủ giọng hoặc được chủ giọng đồng ý)."""
    if not consent:
        raise SystemExit("Cần --consent: xác nhận bạn là chủ giọng hoặc đã được chủ giọng đồng ý cho dùng giọng này.")
    import unicodedata
    name = unicodedata.normalize("NFC", name).strip()  # macOS/trình duyệt có thể gửi dạng NFD
    url = url or vieneu_conf()["url"]
    check_loopback(url)
    h = vieneu_health(url)
    if not h or not h.get("ready"):
        raise SystemExit(f"Máy chủ giọng VieNeu không chạy ở {url}. {INSTALL_HINT}")
    if not h.get("clone"):
        raise SystemExit("Máy chủ VieNeu đang chạy bản cũ không có nhái giọng: tắt rồi bật lại (python scripts/tts.py vieneu-start).")
    import base64
    wav, secs = clone_sample(src, seconds, start)
    # lần đầu: nạp model + trích đặc trưng giọng trên CPU, có thể mất vài chục giây
    r = _post_json("/voices", {"name": name, "audio_b64": base64.b64encode(wav).decode("ascii"), "consent": True,
                               "consent_note": note or ""}, url, timeout=900)
    return {"name": r.get("name", name), "seconds": r.get("seconds", round(secs, 2))}


def vieneu_voice_rm(name, url=None):
    _post_json("/voices/delete", {"name": name}, url)
    conf = vieneu_conf()
    if conf.get("voice") == name:  # giọng mặc định vừa bị xoá → về giọng mặc định của máy chủ
        write_vieneu_conf({"voice": ""})
    return True


# ---------------------------------------------------------------- chọn engine
def warn(msg):
    print("⚠ " + msg, file=sys.stderr, flush=True)


def resolve(engine, lang="vi", voice=None, edge_voice=None):
    """Chọn engine/giọng một lần trước khi đọc (cả bài dùng một giọng). Trả {"engine", "voice", "fallback"?}.

    vieneu: cần máy chủ đang chạy và lang == vi; thiếu thì báo rõ rồi lùi về edge-tts (giọng edge_voice hoặc HoaiMy)."""
    if engine == "say" and not shutil.which("say"):
        engine = "edge"
    if engine != "vieneu":
        return {"engine": engine, "voice": voice}
    edge = {"engine": "edge", "voice": edge_voice or EDGE_VI}
    if lang != "vi":
        warn(f"VieNeu chỉ đọc tiếng Việt (ngôn ngữ đích: {lang}). Lùi về edge-tts.")
        return {**edge, "fallback": "lang"}
    conf = vieneu_conf()
    try:
        check_loopback(conf["url"])
    except ValueError as e:
        warn(f"{e}. Lùi về edge-tts.")
        return {**edge, "fallback": "url"}
    h = vieneu_health(conf["url"])
    if not h or not h.get("ready"):
        warn(f"Máy chủ giọng VieNeu không chạy ở {conf['url']}. {INSTALL_HINT}. Lùi về edge-tts (cần Internet).")
        return {**edge, "fallback": "offline"}
    names = voice_names(h)
    v = voice or conf.get("voice") or h.get("default") or (names[0] if names else None)
    if names and v not in names:
        raise SystemExit(f"VieNeu không có giọng '{v}'. Giọng có sẵn: {', '.join(names)}")
    if not v:
        raise SystemExit("Máy chủ VieNeu không có giọng dựng sẵn nào.")
    return {"engine": "vieneu", "voice": v, "url": conf["url"]}


def synth(text, out_base, choice, py=None):
    """Đọc text bằng lựa chọn của resolve(); out_base không đuôi. Trả đường dẫn file âm thanh (wav/mp3/aiff)."""
    eng, voice = choice["engine"], choice.get("voice")
    if eng == "vieneu":
        return vieneu_tts(text, out_base + ".wav", voice, choice.get("url"))
    if eng == "edge":
        f = out_base + ".mp3"
        r = subprocess.run([py or sys.executable, "-X", "utf8", "-m", "edge_tts", "--voice", voice or EDGE_VI, "--text", text,
                            "--write-media", f], capture_output=True, text=True)
        if r.returncode:
            raise SystemExit("edge-tts lỗi (cần Internet, `pip install edge-tts`): " + r.stderr[-200:])
        return f
    f = out_base + ".aiff"
    subprocess.run(["say", "-v", voice or "Linh", "-o", f, text], check=True)
    return f


# ---------------------------------------------------------------- máy chủ
def vieneu_start(wait=60):
    conf = vieneu_conf()
    url = check_loopback(conf["url"])
    if vieneu_health(url):
        print(f"Máy chủ VieNeu đã chạy ở {url}")
        return 0
    vpy = conf.get("python")
    if not vpy or not os.path.exists(vpy):
        raise SystemExit(f"Chưa cài VieNeu (không thấy Python của VieNeu trong config.json). {INSTALL_HINT}")
    port = urllib.parse.urlparse(url).port or 8771
    d = os.path.join(avs_home(), "vieneu")
    os.makedirs(d, exist_ok=True)
    log = open(os.path.join(d, "server.log"), "ab")
    kw = {"stdout": log, "stderr": log, "stdin": subprocess.DEVNULL, "cwd": d}
    if os.name == "nt":
        kw["creationflags"] = 0x00000008 | 0x00000200 | 0x08000000  # DETACHED_PROCESS | NEW_PROCESS_GROUP | NO_WINDOW
    else:
        kw["start_new_session"] = True
    p = subprocess.Popen([vpy, "-I", "-X", "utf8", os.path.join(HERE, "vieneu_server.py"), "--port", str(port)], **kw)
    with open(os.path.join(d, "server.pid"), "w") as f:
        f.write(str(p.pid))
    t0 = time.time()
    while time.time() - t0 < wait:
        if vieneu_health(url):
            print(f"Đã bật máy chủ VieNeu ở {url} (pid {p.pid}, log {os.path.join(d, 'server.log')})")
            return 0
        if p.poll() is not None:
            raise SystemExit(f"Máy chủ VieNeu thoát ngay (mã {p.returncode}); xem {os.path.join(d, 'server.log')}")
        time.sleep(0.5)
    raise SystemExit(f"Máy chủ VieNeu chưa trả lời sau {wait} giây; xem {os.path.join(d, 'server.log')}")


def status():
    conf = vieneu_conf()
    h = vieneu_health(conf["url"])
    return {
        "say": bool(shutil.which("say")),
        "edge": {"voice_vi": EDGE_VI, "needs_internet": True},
        "vieneu": {"url": conf["url"], "installed": bool(conf.get("python") and os.path.exists(conf["python"])),
                   "running": bool(h and h.get("ready")), "voices": voice_names(h), "default": conf.get("voice") or (h or {}).get("default"),
                   "clone": bool(h and h.get("clone")), "clones": clone_names(h)},
        "default_engine": default_engine(),
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description="Giọng đọc dùng chung: say, edge-tts, VieNeu")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    s = sub.add_parser("say")
    s.add_argument("text")
    s.add_argument("--engine", default="vieneu", choices=["say", "edge", "vieneu"])
    s.add_argument("--voice")
    s.add_argument("--edge-voice")
    s.add_argument("--lang", default="vi")
    s.add_argument("--out", required=True, help="file ra; đuôi theo engine thật (.wav/.mp3/.aiff)")
    s.add_argument("--python", help="Python có edge_tts (mặc định: Python đang chạy)")
    c = sub.add_parser("vieneu-config")
    c.add_argument("--url", help="mặc định: giữ địa chỉ đang lưu (lần đầu " + DEFAULT_URL + ")")
    c.add_argument("--python")
    c.add_argument("--voice")
    c.add_argument("--default-engine", choices=ENGINES, help="giọng mặc định của job batch/dub")
    st = sub.add_parser("vieneu-start")
    st.add_argument("--wait", type=float, default=60)
    cl = sub.add_parser("vieneu-clone", help="tạo giọng nhái từ một file âm thanh/video (3–30 s nói rõ, một người)")
    cl.add_argument("--name", required=True, help="tên giọng (1–40 ký tự)")
    cl.add_argument("--audio", required=True, help="file mẫu: wav/mp3/m4a/mp4…")
    cl.add_argument("--consent", action="store_true", help="xác nhận bạn là chủ giọng hoặc đã được chủ giọng đồng ý")
    cl.add_argument("--note", default="", help="ghi chú về sự đồng ý (ai, khi nào), lưu kèm giọng")
    cl.add_argument("--start", type=float, default=0.0, help="bắt đầu lấy mẫu từ giây thứ")
    cl.add_argument("--seconds", type=float, default=CLONE_MAX_SEC, help=f"độ dài mẫu, {CLONE_MIN_SEC:g}–{CLONE_MAX_SEC:g} s")
    rm = sub.add_parser("vieneu-voice-rm", help="xoá một giọng nhái")
    rm.add_argument("--name", required=True)
    a = ap.parse_args(argv)
    if a.cmd == "status":
        print(json.dumps(status(), ensure_ascii=False, indent=1))
    elif a.cmd == "say":
        choice = resolve(a.engine, a.lang, a.voice, a.edge_voice)
        f = synth(a.text, os.path.splitext(os.path.abspath(a.out))[0], choice, a.python)
        print("TTS " + json.dumps({"file": f, "engine": choice["engine"], "voice": choice.get("voice"),
                                   "fallback": choice.get("fallback")}, ensure_ascii=False), flush=True)
    elif a.cmd == "vieneu-config":
        url = (a.url or vieneu_conf()["url"]).rstrip("/")
        check_loopback(url)
        v = write_vieneu_conf({"url": url, "python": a.python, "voice": a.voice})
        if a.default_engine:
            write_default_engine(a.default_engine)
        print("Đã ghi tts.vieneu: " + json.dumps({k: v.get(k) for k in ("url", "voice")}, ensure_ascii=False)
              + (f", default_engine={a.default_engine}" if a.default_engine else ""))
    elif a.cmd == "vieneu-start":
        return vieneu_start(a.wait)
    elif a.cmd == "vieneu-clone":
        try:
            r = vieneu_clone(a.name, a.audio, a.consent, a.seconds, a.start, a.note)
        except (RuntimeError, ValueError) as e:
            raise SystemExit(str(e)) from None
        print("CLONE " + json.dumps(r, ensure_ascii=False), flush=True)
    elif a.cmd == "vieneu-voice-rm":
        try:
            vieneu_voice_rm(a.name)
        except (RuntimeError, ValueError) as e:
            raise SystemExit(str(e)) from None
        print(f"Đã xoá giọng nhái '{a.name}'")
    return 0


if __name__ == "__main__":
    sys.exit(main())
