"""Thư mục cache mô hình Hugging Face (whisper) dùng chung cho mọi checkout, worktree và subagent.

Thứ tự: AVS_MODEL_CACHE > HF_HUB_CACHE > HF_HOME/hub > XDG_CACHE_HOME/huggingface/hub > <home thật>/.cache/huggingface/hub.
Chỉ nhận đường dẫn tuyệt đối (giá trị tương đối phụ thuộc cwd nên bị bỏ qua). "Home thật" lấy từ tài khoản hệ điều hành
(Windows: GetUserProfileDirectoryW của token tiến trình; POSIX: pwd), không từ USERPROFILE/HOME: các lượt kiểm "người
dùng mới" của worktree/subagent đặt USERPROFILE/HOME vào thư mục tạm, và cache mặc định của huggingface_hub đi theo
nên mỗi lần tải lại ~1,6 GB. Cùng quy tắc với hfCache() ở studio/routes/01_setup.mjs. Chỉ dùng thư viện chuẩn.
"""
import os
import re

ENV = "AVS_MODEL_CACHE"
_ABS = re.compile(r"^([A-Za-z]:[\\/]|[\\/]{2})") if os.name == "nt" else re.compile(r"^/")


def is_abs(p):
    return bool(p) and bool(_ABS.match(p))


def _win_profile_dir():
    import ctypes
    from ctypes import wintypes
    k32, adv, ue = ctypes.WinDLL("kernel32"), ctypes.WinDLL("advapi32"), ctypes.WinDLL("userenv")
    k32.GetCurrentProcess.restype = wintypes.HANDLE
    adv.OpenProcessToken.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE)]
    ue.GetUserProfileDirectoryW.argtypes = [wintypes.HANDLE, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    k32.CloseHandle.argtypes = [wintypes.HANDLE]
    tok = wintypes.HANDLE()
    if not adv.OpenProcessToken(k32.GetCurrentProcess(), 0x0008, ctypes.byref(tok)):  # TOKEN_QUERY
        return None
    try:
        n = wintypes.DWORD(1024)
        buf = ctypes.create_unicode_buffer(n.value)
        return buf.value if ue.GetUserProfileDirectoryW(tok, buf, ctypes.byref(n)) else None
    finally:
        k32.CloseHandle(tok)


def real_home():
    """Thư mục người dùng của tài khoản đang chạy, không đổi theo USERPROFILE/HOME; lỗi thì lùi về expanduser."""
    try:
        if os.name == "nt":
            h = _win_profile_dir()
        else:
            import pwd
            h = pwd.getpwuid(os.getuid()).pw_dir
        if h:
            return h
    except Exception:
        pass
    return os.path.expanduser("~")


def hf_cache(env=None, home=None):
    """Thư mục cache dạng huggingface_hub (models--<org>--<repo>/snapshots/...), đường dẫn tuyệt đối."""
    env = os.environ if env is None else env
    for key, sub in ((ENV, ()), ("HF_HUB_CACHE", ()), ("HF_HOME", ("hub",)), ("XDG_CACHE_HOME", ("huggingface", "hub"))):
        v = (env.get(key) or "").strip()
        if is_abs(v):
            return os.path.join(v, *sub)
    return os.path.join(home or real_home(), ".cache", "huggingface", "hub")
