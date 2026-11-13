"""Chọn thiết bị cho faster-whisper (M53): GPU NVIDIA khi chạy được, không thì CPU int8 theo số nhân thật.

Biến môi trường:
  AVS_WHISPER_DEVICE  = auto (mặc định) | cuda | cpu
  AVS_WHISPER_COMPUTE = compute_type trên CUDA (mặc định int8_float16; ví dụ float16, int8)

Lỗi nạp CUDA (thiếu cuBLAS/cuDNN, driver cũ, hết VRAM) thì lùi về CPU và in một dòng cảnh báo.
Chỉ dùng thư viện chuẩn; ctranslate2 (kèm faster-whisper) chỉ được import khi cần.
"""
import ctypes
import glob
import os
import subprocess
import sys

DEVICE_ENV = "AVS_WHISPER_DEVICE"
COMPUTE_ENV = "AVS_WHISPER_COMPUTE"
CUDA_COMPUTE = "int8_float16"
CPU_COMPUTE = "int8"


def physical_cores():
    """Số nhân vật lý (không tính luồng siêu phân luồng); không đọc được thì luồng/2."""
    try:
        if sys.platform == "win32":
            n = _win_physical_cores()
        elif sys.platform == "darwin":
            n = int(subprocess.run(["sysctl", "-n", "hw.physicalcpu"], capture_output=True, text=True, timeout=5).stdout)
        else:
            n = _linux_physical_cores()
        if n and n > 0:
            return n
    except Exception:
        pass
    return max(1, (os.cpu_count() or 2) // 2)


def _win_physical_cores():
    class SLPI(ctypes.Structure):  # SYSTEM_LOGICAL_PROCESSOR_INFORMATION
        _fields_ = [("mask", ctypes.c_size_t), ("rel", ctypes.c_int), ("_u", ctypes.c_ulonglong * 2)]
    k32 = ctypes.windll.kernel32
    size = ctypes.c_ulong(0)
    k32.GetLogicalProcessorInformation(None, ctypes.byref(size))
    buf = (SLPI * (size.value // ctypes.sizeof(SLPI)))()
    if not k32.GetLogicalProcessorInformation(buf, ctypes.byref(size)):
        return 0
    return sum(1 for x in buf if x.rel == 0)  # RelationProcessorCore


def _linux_physical_cores(path="/proc/cpuinfo"):
    cores, phys = set(), "0"
    with open(path) as f:
        for line in f:
            k, _, v = line.partition(":")
            k, v = k.strip(), v.strip()
            if k == "physical id":
                phys = v
            elif k == "core id":
                cores.add((phys, v))
    return len(cores)


def nvidia_lib_dirs():
    """Thư mục thư viện của gói pip nvidia-cublas-cu12 / nvidia-cudnn-cu12 (nếu đã cài)."""
    sub = "bin" if sys.platform == "win32" else "lib"
    dirs = []
    for sp in sys.path:
        dirs += glob.glob(os.path.join(sp, "nvidia", "*", sub))
    return sorted({os.path.abspath(d) for d in dirs if os.path.isdir(d)})


def expose_nvidia_libs():
    """Cho tiến trình này thấy DLL/so CUDA cài bằng pip (pip không tự thêm vào PATH/LD_LIBRARY_PATH)."""
    dirs = nvidia_lib_dirs()
    if sys.platform == "win32":
        for d in dirs:
            try:
                os.add_dll_directory(d)
            except OSError:
                pass
        if dirs:
            os.environ["PATH"] = os.pathsep.join(dirs + [os.environ.get("PATH", "")])
    else:  # LD_LIBRARY_PATH đọc lúc khởi động: nạp sẵn theo tên đầy đủ để ctranslate2 dùng lại
        for d in dirs:
            for so in sorted(glob.glob(os.path.join(d, "lib*.so.*"))):
                try:
                    ctypes.CDLL(so, mode=ctypes.RTLD_GLOBAL)
                except OSError:
                    pass
    return dirs


def missing_cuda_libs(load=None):
    """Tên thư viện CUDA còn thiếu (cuBLAS 12, cuDNN 9 hoặc 8). Rỗng = đủ.

    Gọi sau cuda_info(): ctranslate2 bản Windows kèm sẵn cudnn64_9.dll trong thư mục gói và tự thêm vào đường tìm DLL.
    Thiếu cuBLAS thì lỗi chỉ lộ ở lượt suy luận đầu (bắt được, xem _warmup); thiếu cuDNN thì ctranslate2 có thể
    thoát hẳn tiến trình, nên dò trước khi nạp model.
    """
    if load is None:
        load = ctypes.WinDLL if sys.platform == "win32" else ctypes.CDLL
    if sys.platform == "win32":
        groups = [("cuBLAS", ["cublas64_12.dll"]), ("cuDNN", ["cudnn64_9.dll", "cudnn64_8.dll"])]
    else:
        groups = [("cuBLAS", ["libcublas.so.12"]), ("cuDNN", ["libcudnn.so.9", "libcudnn.so.8"])]
    missing = []
    for label, names in groups:
        for n in names:
            try:
                load(n)
                break
            except OSError:
                continue
        else:
            missing.append(label)
    return missing


def cuda_info():
    """(số GPU CUDA, tập compute_type hỗ trợ trên CUDA) theo ctranslate2; lỗi thì (0, ∅)."""
    try:
        import ctranslate2
        n = ctranslate2.get_cuda_device_count()
        return n, (set(ctranslate2.get_supported_compute_types("cuda")) if n else set())
    except Exception:
        return 0, set()


def plan(mode, cuda_count, cuda_types=None, compute=None):
    """Danh sách cấu hình thử lần lượt: [{"device", "compute_type"}]; CPU luôn là lựa chọn cuối."""
    mode = (mode or "auto").strip().lower()
    if mode not in ("auto", "cuda", "cpu"):
        mode = "auto"
    cfgs = []
    if mode != "cpu" and cuda_count > 0:
        ct = (compute or CUDA_COMPUTE).strip()
        if cuda_types and ct not in cuda_types:  # GPU cũ không có int8_float16/float16
            ct = next((c for c in (CUDA_COMPUTE, "float16", "int8", "float32") if c in cuda_types), "float32")
        cfgs.append({"device": "cuda", "compute_type": ct})
    cfgs.append({"device": "cpu", "compute_type": CPU_COMPUTE})
    return cfgs


def _warmup(model):
    """Chạy một lượt nhỏ: cuBLAS chỉ được nạp ở lần suy luận đầu, không phải lúc tạo model."""
    import numpy as np
    segs, _ = model.transcribe(np.zeros(16000, np.float32), language="en", beam_size=1)
    list(segs)


def load_model(factory, name, env=None, warn=None, cuda=None, missing=None, cores=None, warmup=_warmup):
    """Tạo WhisperModel trên thiết bị tốt nhất chạy được. Trả (model, cfg).

    factory: WhisperModel (hoặc hàm giả khi test). cuda/missing/cores: tiêm khi test.
    Lỗi CPU (ví dụ không tải được model) được ném ra nguyên vẹn, không in cảnh báo GPU gây hiểu lầm.
    """
    env = os.environ if env is None else env
    warn = warn or (lambda m: print(m, file=sys.stderr, flush=True))
    mode = (env.get(DEVICE_ENV) or "auto").strip().lower()
    if mode == "cpu":
        count, types = 0, set()
    else:
        if cuda is None:
            expose_nvidia_libs()
        count, types = cuda_info() if cuda is None else cuda
    gpu_err = None
    if mode == "cuda" and count == 0:
        gpu_err = f"{DEVICE_ENV}=cuda nhưng không thấy GPU CUDA"
    cfgs = plan(mode, count, types, env.get(COMPUTE_ENV))
    if cfgs[0]["device"] == "cuda":
        lack = missing_cuda_libs() if missing is None else missing
        if lack:
            pkgs = {"cuBLAS": "nvidia-cublas-cu12", "cuDNN": '"nvidia-cudnn-cu12>=9,<10"'}
            gpu_err = f"thiếu {' + '.join(lack)}; cài: pip install {' '.join(pkgs[x] for x in lack)}"
            cfgs = cfgs[1:]
    for cfg in cfgs:
        kw = dict(cfg)
        if cfg["device"] == "cpu":
            kw["cpu_threads"] = physical_cores() if cores is None else cores
        try:
            model = factory(name, **kw)
            if cfg["device"] == "cuda" and warmup:
                warmup(model)
        except Exception as e:
            if cfg["device"] != "cuda":
                raise
            gpu_err = f"{e.__class__.__name__}: {str(e).strip().splitlines()[0] if str(e).strip() else ''}"
            continue
        if gpu_err:
            warn(f"whisper: không chạy được trên GPU ({gpu_err}) — dùng CPU {CPU_COMPUTE}, {kw['cpu_threads']} luồng")
        return model, kw
    raise RuntimeError("không có cấu hình whisper nào chạy được")  # không tới được: CPU luôn có


def describe(cfg):
    extra = f", {cfg['cpu_threads']} luồng" if cfg.get("cpu_threads") else ""
    return f"{cfg['device']} {cfg['compute_type']}{extra}"
