# Cài giọng đọc VieNeu-TTS cho AI Video Studio trên Windows 10/11 (M28). Chỉ 10 giọng có sẵn; nhái giọng KHÔNG bật (C04).
#   powershell -ExecutionPolicy Bypass -File scripts\install_vieneu.ps1 [-Port 8771] [-Version 3.8.4] [-Start] [-Yes]
#   -Start: cài xong thì bật máy chủ giọng luôn (sau này bật lại bằng: python scripts\tts.py vieneu-start).
# VieNeu cài từ nguồn chính thức: gói `vieneu` trên PyPI (https://pypi.org/project/vieneu/,
# mã nguồn https://github.com/pnnbao97/VieNeu-TTS, Apache-2.0). Model tải từ Hugging Face lần đọc đầu (khoảng 1 GB).
# Cài vào môi trường Python riêng $AVS_HOME\vieneu\venv (không đụng Python của Studio).
param([int]$Port = 8771, [string]$Version = '3.8.4', [switch]$Start, [switch]$Yes)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$REPO = Split-Path $PSScriptRoot -Parent
$HOME_DIR = if ($env:AVS_HOME) { $env:AVS_HOME } else { Join-Path $HOME '.ai-video-studio' }
$DIR = Join-Path $HOME_DIR 'vieneu'
$VENV = Join-Path $DIR 'venv'
$VPY = Join-Path $VENV 'Scripts\python.exe'

function Say($m) { Write-Host "▸ $m" -ForegroundColor Magenta }
function Die($m) { Write-Host "✗ $m" -ForegroundColor Red; exit 1 }
function Has($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }

# 1. Python 3.10+ (python.exe trong WindowsApps chỉ là lối tắt Microsoft Store: bỏ qua)
$PY = $null
if (Has 'py') { try { & py -3 -c 'import sys; sys.exit(sys.version_info < (3, 10))'; if ($LASTEXITCODE -eq 0) { $PY = @('py', '-3') } } catch {} }
if (-not $PY -and (Has 'python') -and ((Get-Command python).Source -notmatch 'WindowsApps')) {
  & python -c 'import sys; sys.exit(sys.version_info < (3, 10))'; if ($LASTEXITCODE -eq 0) { $PY = @('python') }
}
if (-not $PY) { Die 'Cần Python 3.10 trở lên. Cài: winget install Python.Python.3.12, mở lại cửa sổ rồi chạy lại.' }
if (-not (Has 'ffmpeg')) { Write-Host '! Chưa thấy ffmpeg: Studio cần ffmpeg để ghép giọng (winget install Gyan.FFmpeg).' -ForegroundColor Yellow }

$free = (Get-PSDrive -Name ([IO.Path]::GetPathRoot($HOME_DIR).Substring(0, 1))).Free
if ($free -lt 4GB) { Die ("Ổ đĩa chỉ còn {0:N1} GB; VieNeu cần khoảng 4 GB (thư viện + model)." -f ($free / 1GB)) }
if (-not $Yes) {
  Write-Host "Sẽ cài vieneu==$Version từ PyPI vào $VENV (khoảng 1–2 GB thư viện, model ~1 GB tải khi đọc lần đầu)."
  if ((Read-Host 'Tiếp tục? (Y/n)') -match '^[nN]') { exit 0 }
}

# 2. Môi trường riêng + gói vieneu
New-Item -ItemType Directory -Force $DIR | Out-Null
if (-not (Test-Path $VPY)) {
  Say "Tạo môi trường Python riêng ở $VENV"
  & $PY[0] $PY[1..9] -m venv $VENV
  if ($LASTEXITCODE -ne 0) { Die 'Không tạo được môi trường Python (venv).' }
}
Say "Cài vieneu==$Version (vài phút)…"
& $VPY -m pip install -q --upgrade pip
# Giữ huggingface_hub 1.x; vieneu_server.py còn tắt kho blob dùng chung (onnxruntime từ chối file .data nằm ngoài thư mục model)
& $VPY -m pip install -q "vieneu==$Version" "huggingface_hub<2" soundfile numpy
if ($LASTEXITCODE -ne 0) { Die 'pip cài vieneu lỗi (xem dòng báo lỗi ở trên). Thử lại khi mạng ổn định.' }
& $VPY -c 'import vieneu' 2>$null
if ($LASTEXITCODE -ne 0) { Die 'Đã cài nhưng không import được vieneu.' }

# 3. Ghi cấu hình vào $AVS_HOME\config.json (khoá "tts", giữ nguyên các khoá khác)
Say 'Ghi cấu hình giọng vào config.json'
& $PY[0] $PY[1..9] -I -X utf8 (Join-Path $REPO 'scripts\tts.py') vieneu-config --url "http://127.0.0.1:$Port" --python $VPY
if ($LASTEXITCODE -ne 0) { Die 'Không ghi được cấu hình.' }

Write-Host ''
Write-Host '✓ Đã cài VieNeu (10 giọng có sẵn, không nhái giọng).' -ForegroundColor Green
Write-Host '  Bật máy chủ giọng:   python scripts\tts.py vieneu-start'
Write-Host '  Kiểm tra:            python scripts\tts.py status'
Write-Host '  Đọc thử:             python scripts\tts.py say "Xin chào các bạn" --engine vieneu --out thu.wav'
Write-Host '  Lồng tiếng:          python scripts\dub.py <timeline.json> --lang vi --tts vieneu'
if ($Start) { & $PY[0] $PY[1..9] -I -X utf8 (Join-Path $REPO 'scripts\tts.py') vieneu-start }
