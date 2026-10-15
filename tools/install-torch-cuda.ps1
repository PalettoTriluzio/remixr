<#
  Remixr - torch con CUDA per demucs (separazione stems sulla GPU)

  Cosa fa:
    1. mostra il torch attuale (la wheel di PyPI su Windows e' solo CPU)
    2. disinstalla torch/torchaudio e installa la build CUDA dall'indice PyTorch
       (torch 2.5.1 + cu124: le wheel includono il runtime CUDA, basta il driver)
    3. rimette numpy==1.26.4 (pip tende ad aggiornarlo, rompe librosa/numba)
    4. verifica torch.cuda.is_available() + un calcolo sulla GPU
    5. scarica i pesi di demucs (htdemucs_ft + htdemucs, ~400 MB in tutto)
       in %USERPROFILE%\.cache\torch\hub: dopo, la separazione gira offline
    6. prova demucs su 3 secondi di audio sintetico, sulla GPU
    7. logga tutto in tools\logs\torch-cuda-<timestamp>.log

  Uso (PowerShell normale, dalla root del repo):
      powershell -ExecutionPolicy Bypass -File .\tools\install-torch-cuda.ps1

  Varianti:
      -Force              reinstalla anche se torch vede gia' la GPU
      -TorchVersion 2.5.1 / -AudioVersion 2.5.1 / -Cuda cu124
      -SkipModels         non scaricare i pesi di demucs

  ATTENZIONE: installa pacchetti nel venv. Il download di torch CUDA e' ~2.5 GB.
#>
[CmdletBinding()]
param(
    [string]$TorchVersion = '2.5.1',
    [string]$AudioVersion = '2.5.1',
    [string]$Cuda = 'cu124',
    [string]$Python,
    [switch]$Force,
    [switch]$SkipModels
)

$ErrorActionPreference = 'Continue'
$ProgressPreference    = 'SilentlyContinue'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LogDir   = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir ("torch-cuda-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")

try { Stop-Transcript | Out-Null } catch { }
Start-Transcript -Path $Log -Append | Out-Null

function Head([string]$t) {
    Write-Host ''
    Write-Host ('=' * 78)
    Write-Host "== $t"
    Write-Host ('=' * 78)
}
function Die([string]$msg) {
    Write-Host ''
    Write-Host "STOP: $msg" -ForegroundColor Red
    Write-Host "Log: $Log" -ForegroundColor Cyan
    try { Stop-Transcript | Out-Null } catch { }
    exit 1
}
# Python multi-riga: file temporaneo invece di -c (le virgolette in PowerShell sono un campo minato).
function RunPy([string]$code) {
    $f = Join-Path $env:TEMP ("remixr-" + [guid]::NewGuid().ToString('N') + ".py")
    Set-Content -Path $f -Value $code -Encoding UTF8
    & $script:py $f 2>&1 | ForEach-Object { Write-Host $_ }
    $rc = $LASTEXITCODE
    Remove-Item $f -ErrorAction SilentlyContinue
    return $rc
}

Head "0. Contesto"
Write-Host ("data   : " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Write-Host ("repo   : " + $RepoRoot)
Write-Host ("target : torch==$TorchVersion torchaudio==$AudioVersion ($Cuda)")
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv 2>&1 | ForEach-Object { Write-Host $_ }

Head "1. Python / venv"
$venvPy = Join-Path $RepoRoot 'backend\.venv\Scripts\python.exe'
if ($Python) {
    $py = $Python
} elseif (Test-Path $venvPy) {
    $py = $venvPy
} else {
    Die "venv non trovato in backend\.venv. Creane uno:`n    cd $RepoRoot\backend`n    python -m venv .venv`n    .venv\Scripts\activate`n    pip install -r requirements.txt"
}
Write-Host "python : $py"
& $py --version

Head "2. torch attuale"
$probe = @'
try:
    import torch
    print("torch", torch.__version__, "| cuda build:", torch.version.cuda, "| cuda available:", torch.cuda.is_available())
    raise SystemExit(0 if torch.cuda.is_available() else 2)
except ImportError as e:
    print("torch non installato:", e)
    raise SystemExit(3)
'@
$rc = RunPy $probe

if ($rc -eq 0 -and -not $Force) {
    Write-Host "torch vede gia' la GPU: installazione saltata (-Force per reinstallare)." -ForegroundColor Green
} else {
    Head "3. Installazione torch CUDA"
    & $py -m pip uninstall -y torch torchaudio 2>&1 | ForEach-Object { Write-Host $_ }
    $index = "https://download.pytorch.org/whl/$Cuda"
    & $py -m pip install "torch==$TorchVersion" "torchaudio==$AudioVersion" --index-url $index 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Die "pip install torch fallito (indice $index)" }

    Write-Host "--- numpy==1.26.4 (pin di requirements.txt)"
    & $py -m pip install "numpy==1.26.4" 2>&1 | ForEach-Object { Write-Host $_ }
}

Head "4. Verifica GPU"
$verify = @'
import torch
print("torch", torch.__version__, "| cuda build:", torch.version.cuda)
ok = torch.cuda.is_available()
print("cuda available:", ok)
if not ok:
    raise SystemExit(1)
print("gpu:", torch.cuda.get_device_name(0))
x = torch.randn(2048, 2048, device="cuda")
print("matmul sulla GPU ok:", float((x @ x).abs().mean()) > 0)
import numpy
print("numpy", numpy.__version__)
'@
if ((RunPy $verify) -ne 0) { Die "torch non vede la GPU. Driver NVIDIA aggiornato? (nvidia-smi sopra)" }

if (-not $SkipModels) {
    Head "5. Pesi demucs + prova separazione"
    $demucs = @'
import time
import torch
from demucs.pretrained import get_model
from demucs.apply import apply_model

for name in ("htdemucs_ft", "htdemucs"):
    t = time.time()
    m = get_model(name)
    print(f"{name}: pesi pronti ({time.time() - t:.1f}s), sorgenti {m.sources}")

m = get_model("htdemucs")
m.eval()
wav = torch.randn(1, 2, 3 * m.samplerate) * 0.1
t = time.time()
with torch.no_grad():
    out = apply_model(m, wav, device="cuda", split=True, overlap=0.25, progress=False)
print(f"separazione di prova sulla GPU: {tuple(out.shape)} in {time.time() - t:.1f}s")
'@
    if ((RunPy $demucs) -ne 0) { Die "demucs non funziona (vedi errore sopra)" }
}

Head "FATTO"
Write-Host "torch CUDA pronto: la separazione stems usera' la GPU." -ForegroundColor Green
Write-Host "Riavvia il backend (uvicorn) per caricarlo."
Write-Host "Log: $Log" -ForegroundColor Cyan
try { Stop-Transcript | Out-Null } catch { }
