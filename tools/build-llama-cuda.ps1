<#
  Remixr - build di llama-cpp-python con CUDA (Windows)

  Cosa fa:
    1. carica l'ambiente MSVC x64 da vcvars64.bat
       -> non serve la "x64 Native Tools Command Prompt"
    2. ricostruisce le variabili CUDA che mancano (CUDA_PATH_V<maj>_<min>, CudaToolkitDir):
       e' la causa dell'errore "The CUDA Toolkit v12.6 directory '' does not exist"
    3. pinna cmake<4 e ninja nel venv, cosi' scikit-build-core non si scarica cmake 4.x
    4. compila con strategie in cascata:
         A) ninja-allow-unsupported  Ninja + -allow-unsupported-compiler (nvcc ignora il check versione MSVC)
         B) ninja                    Ninja puro
         C) msbuild                  generatore VS, con le variabili CUDA riparate
         D) wheel                    wheel CUDA precompilata (ultima spiaggia)
       si ferma alla prima con llama_supports_gpu_offload() == True
    5. logga TUTTO in tools\logs\build-llama-<timestamp>.log

  Perche' Ninja per primo: con MSBuild la compilazione CUDA passa dai file
  "CUDA <ver>.targets" di Visual Studio, che leggono il path del toolkit da
  CUDA_PATH_V<maj>_<min>. Con Ninja CMake chiama nvcc direttamente e tutta
  quella catena non viene nemmeno toccata.

  Uso (PowerShell normale, dalla root del repo):
      powershell -ExecutionPolicy Bypass -File .\tools\build-llama-cuda.ps1

  Varianti utili:
      -Strategy ninja           forza una sola strategia
      -Version 0.3.4            altra versione di llama-cpp-python
      -CudaArch 86              altra GPU (Ampere 86, Ada 89, Hopper 90, Blackwell 120)
      -PersistCudaEnv           scrive CUDA_PATH_V<maj>_<min> nell'ambiente utente (setx), permanente
      -CmakePin 'cmake'         non pinnare cmake<4
      -SkipDeps                 non toccare pip/cmake/ninja

  ATTENZIONE: installa pacchetti nel venv (e' il suo lavoro).
  Ogni tentativo dura 10-20 minuti e stampa molto output nvcc: e' normale.
#>
[CmdletBinding()]
param(
    [string]$Version = '0.3.2',
    [int]$CudaArch = 89,
    [ValidateSet('auto', 'msbuild', 'ninja', 'ninja-allow-unsupported', 'wheel')]
    [string]$Strategy = 'auto',
    [string]$Python,
    [switch]$SkipDeps,
    [switch]$PersistCudaEnv,
    [string]$CmakePin = 'cmake<4',
    [string]$WheelIndex = 'https://abetlen.github.io/llama-cpp-python/whl/cu124'
)

$ErrorActionPreference = 'Continue'
$ProgressPreference    = 'SilentlyContinue'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LogDir   = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir ("build-llama-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")

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

Head "0. Contesto"
Write-Host ("data        : " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Write-Host ("repo        : " + $RepoRoot)
Write-Host ("versione    : llama-cpp-python==$Version")
Write-Host ("cuda arch   : $CudaArch")
Write-Host ("strategia   : $Strategy")
Write-Host ("cmake pin   : $CmakePin")
Write-Host ("log         : " + $Log)
Write-Host ("PowerShell  : " + $PSVersionTable.PSVersion)
Write-Host ("CPU threads : " + [Environment]::ProcessorCount)

# ------------------------------------------------- 1. ambiente MSVC (vcvars64)
Head "1. Ambiente MSVC x64"
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path $vswhere)) {
    Die "vswhere.exe non trovato. Installa 'Build Tools for Visual Studio 2022' con il workload 'Desktop development with C++' (README §4)."
}
$vsPath = (& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -format value -property installationPath 2>&1 | Out-String).Trim()
if (-not $vsPath -or -not (Test-Path $vsPath)) {
    Die "Nessuna installazione VS con toolset C++ x64. Visual Studio Installer -> 'Desktop development with C++'."
}
Write-Host ("VS trovato  : " + $vsPath)

$vcvars = Join-Path $vsPath 'VC\Auxiliary\Build\vcvars64.bat'
if (-not (Test-Path $vcvars)) { Die "vcvars64.bat assente in $vsPath (workload C++ incompleto)." }

Write-Host "Importo l'ambiente da vcvars64.bat ..."
$imported = 0
cmd /c "call `"$vcvars`" >nul 2>&1 && set" | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        Set-Item -Path ("env:" + $matches[1]) -Value $matches[2] -ErrorAction SilentlyContinue
        $imported++
    }
}
Write-Host ("variabili importate: " + $imported)

$cl = Get-Command cl.exe -ErrorAction SilentlyContinue
if (-not $cl) { Die "cl.exe non disponibile nemmeno dopo vcvars64.bat: installazione MSVC rotta." }
Write-Host ("cl.exe      : " + $cl.Source)
$clBanner = (& cl 2>&1 | Select-Object -First 2 | Out-String).Trim()
Write-Host $clBanner
$clMinor = 0
if ($clBanner -match 'Version\s+19\.(\d+)\.') { $clMinor = [int]$matches[1] }

# -------------------------------------------------------------- 2. CUDA
Head "2. CUDA (toolkit + variabili d'ambiente)"
$nvcc = Get-Command nvcc.exe -ErrorAction SilentlyContinue
if (-not $nvcc) {
    Die "nvcc non trovato. Installa CUDA Toolkit 12.4+ (README §5), riapri il terminale. Se e' installato: aggiungi %CUDA_PATH%\bin al PATH."
}
$nvccPath = $nvcc.Source
Write-Host ("nvcc        : " + $nvccPath)
$nvccBanner = (& nvcc --version 2>&1 | Out-String).Trim()
Write-Host $nvccBanner

$cudaMajor = 0; $cudaMinor = 0
if ($nvccBanner -match 'release\s+(\d+)\.(\d+)') { $cudaMajor = [int]$matches[1]; $cudaMinor = [int]$matches[2] }

# Root del toolkit: ...\CUDA\v12.6  (nvcc sta in ...\v12.6\bin\nvcc.exe)
$cudaRoot = Split-Path -Parent (Split-Path -Parent $nvccPath)
if ($env:CUDA_PATH -and (Test-Path $env:CUDA_PATH)) { $cudaRoot = $env:CUDA_PATH }
Write-Host ("cuda root   : " + $cudaRoot)
Write-Host ("versione    : $cudaMajor.$cudaMinor")

# QUESTO e' il fix dell'errore:
#   CUDA <ver>.targets(606,9): error : The CUDA Toolkit v12.6 directory '' does not exist.
# I .targets di VS leggono il path da CUDA_PATH_V<maj>_<min>; se la variabile non
# c'e', CudaToolkitDir resta vuoto e MSBuild muore prima di chiamare nvcc.
# MSBuild usa le variabili d'ambiente come proprieta' globali, quindi settare
# CudaToolkitDir qui e' sufficiente per il processo di build.
$verVar = "CUDA_PATH_V${cudaMajor}_${cudaMinor}"
$before = [Environment]::GetEnvironmentVariable($verVar)
Write-Host ''
Write-Host "--- variabili CUDA"
Write-Host ("CUDA_PATH       = " + $env:CUDA_PATH)
Write-Host ("$verVar = " + $before)
Write-Host ("CudaToolkitDir  = " + $env:CudaToolkitDir)

if (-not $before) {
    Write-Host ("MANCA $verVar -> la imposto per questa build: $cudaRoot") -ForegroundColor Yellow
}
Set-Item -Path ("env:" + $verVar) -Value $cudaRoot
if (-not $env:CUDA_PATH) { $env:CUDA_PATH = $cudaRoot }
$env:CudaToolkitDir   = $cudaRoot
$env:CUDAToolkit_ROOT = $cudaRoot

if ($PersistCudaEnv) {
    Write-Host "Rendo permanente $verVar nell'ambiente utente (setx) ..."
    & setx $verVar $cudaRoot | Out-String | Write-Host
    & setx CUDA_PATH $cudaRoot | Out-String | Write-Host
    Write-Host "Fatto. Le nuove finestre di terminale la vedranno."
}

if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    Write-Host ''
    Write-Host ((& nvidia-smi --query-gpu=name,driver_version,memory.total,compute_cap --format=csv 2>&1 | Out-String).Trim())
} else {
    Write-Host "nvidia-smi non trovato: driver NVIDIA fuori dal PATH (la build puo' riuscire comunque)."
}

# nvcc rifiuta MSVC piu' recenti di quelli che conosce. CUDA 12.6 conosce fino a
# ~19.40; MSVC 19.44 (VS 17.14) e' oltre -> serve -allow-unsupported-compiler.
$riskyCombo = ($clMinor -ge 41)
if ($riskyCombo) {
    Write-Host ''
    Write-Host "NOTA: MSVC 19.$clMinor e' piu' recente di quanto CUDA $cudaMajor.$cudaMinor dichiari di supportare." -ForegroundColor Yellow
    Write-Host "      Parto dalla strategia con -allow-unsupported-compiler." -ForegroundColor Yellow
}

# ------------------------------------------------------------- 3. python/venv
Head "3. Python / venv"
$venvPy = Join-Path $RepoRoot 'backend\.venv\Scripts\python.exe'
if ($Python) {
    $py = $Python
} elseif (Test-Path $venvPy) {
    $py = $venvPy
} else {
    Die "venv non trovato in backend\.venv. Creane uno:`n    cd $RepoRoot\backend`n    python -m venv .venv`n    .venv\Scripts\activate`n    pip install -r requirements.txt"
}
Write-Host ("python      : " + $py)
Write-Host ((& $py -c "import sys,struct;print(sys.version);print('bits',struct.calcsize('P')*8)" 2>&1 | Out-String).Trim())

if (-not $SkipDeps) {
    Write-Host ''
    Write-Host "--- pip / setuptools / wheel"
    & $py -m pip install --upgrade pip setuptools wheel 2>&1 | Out-String | Write-Host
    Write-Host ''
    Write-Host "--- $CmakePin + ninja nel venv"
    Write-Host "    (se cmake e ninja sono gia' nel PATH, scikit-build-core non si scarica cmake 4.x da solo)"
    & $py -m pip install --upgrade "$CmakePin" ninja 2>&1 | Out-String | Write-Host

    # Il cmake del venv deve precedere eventuali altri nel PATH.
    $venvScripts = Split-Path -Parent $py
    $env:PATH = $venvScripts + ';' + $env:PATH
    $cm = Get-Command cmake.exe -ErrorAction SilentlyContinue
    if ($cm) { Write-Host ("cmake usato : " + $cm.Source + "  -> " + ((& cmake --version 2>&1 | Select-Object -First 1 | Out-String).Trim())) }
    $nj = Get-Command ninja.exe -ErrorAction SilentlyContinue
    if ($nj) { Write-Host ("ninja usato : " + $nj.Source + "  -> " + ((& ninja --version 2>&1 | Out-String).Trim())) }
}

# ------------------------------------------------------------- 4. strategie
Head "4. Build"

# Path con backslash: in CMAKE_ARGS vanno passati con slash normali.
$cudaRootCMake = $cudaRoot -replace '\\', '/'
$nvccCMake     = $nvccPath -replace '\\', '/'

# LLAVA_BUILD=OFF: non ci serve il multimodale e salta una parte che su MSVC rompe spesso.
# GGML_CCACHE=OFF: silenzia il warning su ccache assente.
# CUDAToolkit_ROOT + CMAKE_CUDA_COMPILER espliciti: niente autodetection ambigua.
$baseArgs = "-DGGML_CUDA=on -DCMAKE_CUDA_ARCHITECTURES=$CudaArch -DLLAVA_BUILD=OFF -DGGML_CCACHE=OFF " +
            "-DCUDAToolkit_ROOT=$cudaRootCMake -DCMAKE_CUDA_COMPILER=$nvccCMake"

$plan = @(
    [pscustomobject]@{
        Name      = 'ninja-allow-unsupported'
        Desc      = 'Ninja + -allow-unsupported-compiler (bypassa il check versione MSVC di nvcc)'
        Generator = 'Ninja'
        CMakeArgs = "$baseArgs -DCMAKE_CUDA_FLAGS=-allow-unsupported-compiler"
        Source    = $true
    },
    [pscustomobject]@{
        Name      = 'ninja'
        Desc      = 'Ninja puro (nvcc chiamato diretto, niente CUDA.targets di MSBuild)'
        Generator = 'Ninja'
        CMakeArgs = $baseArgs
        Source    = $true
    },
    [pscustomobject]@{
        Name      = 'msbuild'
        Desc      = 'generatore Visual Studio, con CUDA_PATH_V* e CudaToolkitDir riparati'
        Generator = $null
        CMakeArgs = $baseArgs
        Source    = $true
    },
    [pscustomobject]@{
        Name      = 'wheel'
        Desc      = 'wheel CUDA precompilata (nessuna compilazione locale)'
        Generator = $null
        CMakeArgs = $null
        Source    = $false
    }
)

if (-not $riskyCombo -and $Strategy -eq 'auto') {
    # MSVC compatibile: provo prima Ninja puro, l'override non serve.
    $plan = @($plan[1], $plan[0], $plan[2], $plan[3])
}
if ($Strategy -ne 'auto') {
    $plan = $plan | Where-Object { $_.Name -eq $Strategy }
}

function Test-GpuOffload([string]$pyExe) {
    $probe = @'
import os, sys
try:
    import llama_cpp
except Exception as e:
    print("IMPORT_FAIL", type(e).__name__, e); sys.exit(2)
print("version:", getattr(llama_cpp, "__version__", "?"))
ok = bool(llama_cpp.llama_supports_gpu_offload())
print("gpu_offload:", ok)
libdir = os.path.join(os.path.dirname(llama_cpp.__file__), "lib")
if os.path.isdir(libdir):
    for f in sorted(os.listdir(libdir)):
        print("   lib:", f)
sys.exit(0 if ok else 1)
'@
    $f = Join-Path $env:TEMP 'remixr_verify_gpu.py'
    Set-Content -Path $f -Value $probe -Encoding UTF8
    $out = & $pyExe $f 2>&1 | Out-String
    $code = $LASTEXITCODE
    Remove-Item $f -ErrorAction SilentlyContinue
    Write-Host $out.TrimEnd()
    return ($code -eq 0)
}

$results = @()
$winner  = $null

foreach ($s in $plan) {
    Head ("Strategia: " + $s.Name)
    Write-Host $s.Desc
    Write-Host ''

    Write-Host "--- rimuovo installazioni precedenti (evita il riuso di una build CPU)"
    & $py -m pip uninstall -y llama-cpp-python 2>&1 | Out-String | Write-Host

    Remove-Item env:CMAKE_ARGS      -ErrorAction SilentlyContinue
    Remove-Item env:CMAKE_GENERATOR -ErrorAction SilentlyContinue
    Remove-Item env:FORCE_CMAKE     -ErrorAction SilentlyContinue

    if ($s.Source) {
        $env:FORCE_CMAKE = '1'
        $env:CMAKE_ARGS  = $s.CMakeArgs
        if ($s.Generator) { $env:CMAKE_GENERATOR = $s.Generator }
        $env:CMAKE_BUILD_PARALLEL_LEVEL = [string][Environment]::ProcessorCount

        Write-Host ''
        Write-Host ("CMAKE_ARGS      = " + $env:CMAKE_ARGS)
        Write-Host ("CMAKE_GENERATOR = " + $env:CMAKE_GENERATOR)
        Write-Host ("CudaToolkitDir  = " + $env:CudaToolkitDir)
        Write-Host ("PARALLEL_LEVEL  = " + $env:CMAKE_BUILD_PARALLEL_LEVEL)
        Write-Host ''
        Write-Host "--- pip install (10-20 min, output verboso)"
        $t0 = Get-Date
        & $py -m pip install "llama-cpp-python==$Version" `
            --no-cache-dir --force-reinstall --no-binary llama-cpp-python --verbose 2>&1 |
            Out-String -Stream | Write-Host
        $exit = $LASTEXITCODE
        $mins = [math]::Round(((Get-Date) - $t0).TotalMinutes, 1)
        Write-Host ''
        Write-Host ("pip exit code: $exit  (durata: $mins min)")
    } else {
        Write-Host ''
        Write-Host "--- pip install da indice wheel precompilate: $WheelIndex"
        & $py -m pip install "llama-cpp-python==$Version" `
            --force-reinstall --no-cache-dir --extra-index-url $WheelIndex --verbose 2>&1 |
            Out-String -Stream | Write-Host
        $exit = $LASTEXITCODE
        Write-Host ''
        Write-Host ("pip exit code: $exit")
    }

    Write-Host ''
    Write-Host "--- verifica supporto GPU"
    $ok = $false
    if ($exit -eq 0) { $ok = Test-GpuOffload $py } else { Write-Host "pip ha fallito, salto la verifica." }

    $results += [pscustomobject]@{ Strategy = $s.Name; PipExit = $exit; GpuOffload = $ok }

    if ($ok) { $winner = $s.Name; break }

    Write-Host ''
    Write-Host ("Strategia '" + $s.Name + "' non riuscita. Proseguo con la successiva (se presente).") -ForegroundColor Yellow
}

# ------------------------------------------------------------- 5. sommario
Head "5. Sommario"
$results | Format-Table -AutoSize | Out-String | Write-Host

if ($winner) {
    Write-Host "RIUSCITO con la strategia: $winner" -ForegroundColor Green
    Write-Host ""
    Write-Host "Per rendere permanenti le variabili CUDA (utile fuori da questo script):"
    Write-Host "    .\tools\build-llama-cuda.ps1 -PersistCudaEnv -Strategy $winner -SkipDeps"
    Write-Host "oppure a mano:  setx $verVar `"$cudaRoot`""
    Write-Host ""
    Write-Host "Prossimo passo: scarica il modello GGUF in backend\models (README §9)."
} else {
    Write-Host "NESSUNA strategia e' riuscita." -ForegroundColor Red
    Write-Host ""
    Write-Host "Da provare, in ordine:"
    Write-Host "  1) una versione piu' recente:   .\tools\build-llama-cuda.ps1 -Version <x.y.z>"
    Write-Host "     (lista versioni: python -m pip index versions llama-cpp-python)"
    Write-Host "  2) senza pin su cmake:          .\tools\build-llama-cuda.ps1 -CmakePin cmake"
    Write-Host "  3) solo la wheel precompilata:  .\tools\build-llama-cuda.ps1 -Strategy wheel"
    Write-Host ""
    Write-Host "Mandami il log: $Log"
    Write-Host "Cerca la prima riga con 'error' / 'nvcc fatal' / 'CMake Error': e' quella che conta."
}

Write-Host ""
Write-Host "Log completo: $Log" -ForegroundColor Cyan
Write-Host "Committalo:   git add tools/logs && git commit -m `"build log`" && git push" -ForegroundColor Cyan

try { Stop-Transcript | Out-Null } catch { }
