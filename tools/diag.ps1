<#
  Remixr - diagnostica ambiente (Windows)

  SOLO LETTURA: non installa, non compila, non modifica nulla.
  Scrive un log completo in tools\logs\diag-<timestamp>.log

  Uso (PowerShell normale, dalla root del repo):
      powershell -ExecutionPolicy Bypass -File .\tools\diag.ps1

  Poi committa e pusha il log:
      git add tools/logs; git commit -m "diag log"; git push
#>
[CmdletBinding()]
param(
    [string]$OutFile,
    [string]$Python  # opzionale: path a un python specifico
)

$ErrorActionPreference = 'Continue'
$ProgressPreference    = 'SilentlyContinue'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LogDir   = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
if (-not $OutFile) {
    $OutFile = Join-Path $LogDir ("diag-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")
}
Set-Content -Path $OutFile -Value "" -Encoding UTF8

$script:Findings = @()

function W([string]$t = '') {
    $t | Tee-Object -FilePath $OutFile -Append
}
function Section([string]$name) {
    W ''
    W ('=' * 78)
    W ("== $name")
    W ('=' * 78)
}
function Note([string]$level, [string]$msg) {
    # level: OK | WARN | FAIL
    $script:Findings += [pscustomobject]@{ Level = $level; Msg = $msg }
    W ("  [$level] $msg")
}
function Exec([string]$label, [string]$exe, [string[]]$exeArgs = @()) {
    W ''
    W ("--- $label")
    $cmd = Get-Command $exe -ErrorAction SilentlyContinue
    if (-not $cmd) {
        W ("    <non trovato nel PATH: $exe>")
        return $false
    }
    W ("    path: " + $cmd.Source)
    try {
        $out = & $exe @exeArgs 2>&1 | Out-String
        W ($out.TrimEnd())
    } catch {
        W ("    <errore: " + $_.Exception.Message + ">")
        return $false
    }
    return $true
}
function Has([string]$exe) {
    return [bool](Get-Command $exe -ErrorAction SilentlyContinue)
}

# ---------------------------------------------------------------- 1. contesto
Section "1. Contesto"
W ("data            : " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'))
W ("hostname        : " + $env:COMPUTERNAME)
W ("utente          : " + $env:USERNAME)
W ("repo            : " + $RepoRoot)
W ("script          : " + $PSCommandPath)
W ("PowerShell      : " + $PSVersionTable.PSVersion + "  (edition: " + $PSVersionTable.PSEdition + ")")
W ("64-bit process  : " + [Environment]::Is64BitProcess)
try {
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    W ("OS              : " + $os.Caption + " build " + $os.BuildNumber)
    W ("RAM totale      : " + [math]::Round($os.TotalVisibleMemorySize / 1MB, 1) + " GB")
    W ("RAM libera      : " + [math]::Round($os.FreePhysicalMemory / 1MB, 1) + " GB")
} catch { W "OS              : <non leggibile>" }

W ''
W "--- spazio disco"
Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Used -ne $null -or $_.Free -ne $null) {
        W ("    " + $_.Name + ": libero " + [math]::Round($_.Free / 1GB, 1) + " GB")
    }
}

# Path con spazi/non-ASCII rompono alcune build CUDA/CMake.
W ''
W "--- percorsi a rischio (non-ASCII o spazi)"
foreach ($p in @(
    @{ n = 'repo';     v = $RepoRoot },
    @{ n = 'USERPROFILE'; v = $env:USERPROFILE },
    @{ n = 'TEMP';     v = $env:TEMP }
)) {
    $val = [string]$p.v
    $nonAscii = $val -match '[^\x00-\x7F]'
    W ("    " + $p.n.PadRight(12) + " = " + $val + "   (non-ASCII: $nonAscii, spazi: " + ($val -match ' ') + ")")
    if ($nonAscii) { Note 'WARN' ($p.n + " contiene caratteri non-ASCII: puo' rompere la build di llama.cpp (nvcc/CMake). Valore: $val") }
}

try {
    $lp = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -ErrorAction Stop).LongPathsEnabled
    W ("    LongPathsEnabled = " + $lp)
    if ($lp -ne 1) { Note 'WARN' "LongPathsEnabled=0: i path lunghi della build llama.cpp possono superare i 260 caratteri. Compila da una cartella corta (es. C:\dev\remixr)." }
} catch { W "    LongPathsEnabled = <non leggibile>" }

# ------------------------------------------------------------------- 2. GPU
Section "2. GPU / driver NVIDIA"
if (Has 'nvidia-smi') {
    Exec "nvidia-smi" "nvidia-smi" @() | Out-Null
    Exec "nvidia-smi (query)" "nvidia-smi" @('--query-gpu=name,driver_version,memory.total,compute_cap', '--format=csv') | Out-Null
    Note 'OK' "nvidia-smi presente"
} else {
    Note 'FAIL' "nvidia-smi non trovato: driver NVIDIA assente o non nel PATH. Senza questo la build CUDA non ha senso."
}

# ------------------------------------------------------------------ 3. CUDA
Section "3. CUDA Toolkit"
W ("CUDA_PATH       : " + $env:CUDA_PATH)
W ("CudaToolkitDir  : " + $env:CudaToolkitDir)
W ''
W "--- variabili CUDA_PATH_V* (le leggono i .targets di MSBuild)"
$verVars = Get-ChildItem env: | Where-Object { $_.Name -like 'CUDA_PATH_V*' }
if ($verVars) {
    $verVars | ForEach-Object { W ("    " + $_.Name + " = " + $_.Value) }
} else {
    W "    <nessuna>"
    Note 'FAIL' "Nessuna CUDA_PATH_V<maj>_<min>: con il generatore MSBuild otterrai `"The CUDA Toolkit v<ver> directory '' does not exist`" perche' CudaToolkitDir resta vuoto. build-llama-cuda.ps1 la ricostruisce da sola (e con Ninja il problema non esiste)."
}
$cudaRoot = Join-Path ${env:ProgramFiles} 'NVIDIA GPU Computing Toolkit\CUDA'
W ''
W "--- toolkit installati in: $cudaRoot"
if (Test-Path $cudaRoot) {
    Get-ChildItem $cudaRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object { W ("    " + $_.Name) }
} else {
    W "    <cartella assente>"
}

$nvccOk = Exec "nvcc --version" "nvcc" @('--version')
if ($nvccOk) {
    Note 'OK' "nvcc trovato nel PATH"
} else {
    Note 'FAIL' "nvcc NON nel PATH: CUDA Toolkit non installato, oppure %CUDA_PATH%\bin non aggiunto al PATH (riapri il terminale dopo l'installazione)."
}

# "No CUDA toolset found" = integrazione MSBuild mancante
W ''
W "--- integrazione MSBuild di CUDA (causa di 'No CUDA toolset found')"
$bcDirs = @(
    'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Microsoft\VC\v170\BuildCustomizations',
    'C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Microsoft\VC\v170\BuildCustomizations',
    'C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Microsoft\VC\v170\BuildCustomizations',
    'C:\Program Files\Microsoft Visual Studio\2022\Enterprise\MSBuild\Microsoft\VC\v170\BuildCustomizations'
)
$foundCudaProps = $false
foreach ($d in $bcDirs) {
    if (Test-Path $d) {
        $props = Get-ChildItem $d -Filter 'CUDA*' -ErrorAction SilentlyContinue
        W ("    " + $d)
        if ($props) {
            $props | ForEach-Object { W ("        " + $_.Name) }
            $foundCudaProps = $true
        } else {
            W "        <nessun file CUDA*.props/.targets>"
        }
    }
}
if (-not $foundCudaProps) {
    Note 'WARN' "File CUDA*.props assenti dalle BuildCustomizations di VS: con il generatore MSBuild otterrai 'No CUDA toolset found'. build-llama-cuda.ps1 aggira il problema usando Ninja."
}

# ------------------------------------------------------- 4. Visual Studio / MSVC
Section "4. Visual Studio Build Tools / MSVC"
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vsPath = $null
if (Test-Path $vswhere) {
    W ("vswhere         : " + $vswhere)
    W ''
    W "--- installazioni VS (con toolset C++ x64)"
    $out = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -format value -property installationPath 2>&1 | Out-String
    $vsPath = ($out | Out-String).Trim()
    W ("    installationPath: " + $vsPath)
    $ver = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -format value -property installationVersion 2>&1 | Out-String
    W ("    installationVersion: " + $ver.Trim())
    W ''
    W "--- tutte le installazioni viste da vswhere"
    (& $vswhere -products * -format value -property installationPath 2>&1 | Out-String).TrimEnd() | ForEach-Object { W ("    " + $_) }
} else {
    Note 'FAIL' "vswhere.exe assente: Visual Studio Build Tools 2022 non installato (serve il workload 'Desktop development with C++')."
}

if ($vsPath -and (Test-Path $vsPath)) {
    Note 'OK' "VS con toolset C++ trovato: $vsPath"
    $msvcDir = Join-Path $vsPath 'VC\Tools\MSVC'
    W ''
    W "--- toolset MSVC installati"
    if (Test-Path $msvcDir) {
        Get-ChildItem $msvcDir -Directory -ErrorAction SilentlyContinue | ForEach-Object { W ("    " + $_.Name) }
    } else { W "    <assente>" }

    $vcvars = Join-Path $vsPath 'VC\Auxiliary\Build\vcvars64.bat'
    W ''
    W "--- cl.exe (banner, via vcvars64.bat)"
    if (Test-Path $vcvars) {
        $clOut = cmd /c "call `"$vcvars`" >nul 2>&1 && cl 2>&1" | Out-String
        W ($clOut.TrimEnd())
        if ($clOut -match 'Version\s+(\d+)\.(\d+)\.') {
            $clMajor = [int]$matches[1]; $clMinor = [int]$matches[2]
            W ''
            W ("    cl version rilevata: $clMajor.$clMinor")
            if ($clMajor -eq 19 -and $clMinor -ge 41) {
                Note 'WARN' "MSVC 19.$clMinor e' piu' recente dei toolset che nvcc dichiara di supportare: puo' fermarsi con 'unsupported Microsoft Visual Studio version'. La strategia 'ninja-allow-unsupported' di build-llama-cuda.ps1 lo aggira."
            }
        }
    } else {
        Note 'FAIL' "vcvars64.bat non trovato in $vsPath : workload C++ non installato."
    }
}

# ---------------------------------------------------------------- 5. Python
Section "5. Python / venv / pacchetti"
$venvPy = Join-Path $RepoRoot 'backend\.venv\Scripts\python.exe'
if ($Python) {
    $py = $Python
} elseif (Test-Path $venvPy) {
    $py = $venvPy
    Note 'OK' "venv trovato: backend\.venv"
} else {
    $py = 'python'
    Note 'WARN' "backend\.venv assente: uso il python di sistema. Crealo con: python -m venv .venv (dentro backend\)"
}
W ("python usato    : " + $py)

$pyOk = $false
try {
    $v = & $py -c "import sys,platform,struct;print(sys.version);print('exe',sys.executable);print('bits',struct.calcsize('P')*8);print('arch',platform.machine())" 2>&1 | Out-String
    W ''
    W "--- python -c (versione / arch)"
    W ($v.TrimEnd())
    $pyOk = $true
} catch {
    Note 'FAIL' ("python non eseguibile: " + $_.Exception.Message)
}

if ($pyOk) {
    W ''
    W "--- pip --version"
    W ((& $py -m pip --version 2>&1 | Out-String).TrimEnd())
    W ''
    W "--- pip list (completa)"
    W ((& $py -m pip list 2>&1 | Out-String).TrimEnd())
    W ''
    W "--- import dei pacchetti del backend (uno per uno)"
    $probe = @'
import importlib, sys
mods = ["numpy","soundfile","librosa","audioread","pedalboard","pyrubberband",
        "fastapi","uvicorn","pydantic","multipart","demucs","torch","llama_cpp"]
for m in mods:
    try:
        mod = importlib.import_module(m)
        print("%-14s OK   %s" % (m, getattr(mod, "__version__", "?")))
    except Exception as e:
        print("%-14s FAIL %s: %s" % (m, type(e).__name__, e))
try:
    import torch
    print("torch.cuda.is_available:", torch.cuda.is_available())
    print("torch.version.cuda     :", torch.version.cuda)
except Exception as e:
    print("torch probe failed:", e)
'@
    $probeFile = Join-Path $env:TEMP 'remixr_probe.py'
    Set-Content -Path $probeFile -Value $probe -Encoding UTF8
    W ((& $py $probeFile 2>&1 | Out-String).TrimEnd())
    Remove-Item $probeFile -ErrorAction SilentlyContinue
}

# ------------------------------------------------------------ 6. llama-cpp-python
Section "6. llama-cpp-python (stato attuale)"
if ($pyOk) {
    W "--- pip show llama-cpp-python"
    W ((& $py -m pip show llama-cpp-python 2>&1 | Out-String).TrimEnd())

    W ''
    W "--- supporto GPU"
    $gpuProbe = @'
try:
    import llama_cpp, os
    print("version        :", getattr(llama_cpp, "__version__", "?"))
    print("gpu_offload    :", llama_cpp.llama_supports_gpu_offload())
    libdir = os.path.join(os.path.dirname(llama_cpp.__file__), "lib")
    print("lib dir        :", libdir)
    if os.path.isdir(libdir):
        for f in sorted(os.listdir(libdir)):
            print("   ", f)
except Exception as e:
    print("llama_cpp non importabile:", type(e).__name__, e)
'@
    $gpuFile = Join-Path $env:TEMP 'remixr_gpu_probe.py'
    Set-Content -Path $gpuFile -Value $gpuProbe -Encoding UTF8
    $gpuOut = & $py $gpuFile 2>&1 | Out-String
    W ($gpuOut.TrimEnd())
    Remove-Item $gpuFile -ErrorAction SilentlyContinue

    if ($gpuOut -match 'gpu_offload\s*:\s*True') {
        Note 'OK' "llama_cpp con offload GPU attivo"
    } elseif ($gpuOut -match 'gpu_offload\s*:\s*False') {
        Note 'FAIL' "llama_cpp installato ma SENZA CUDA (build CPU). Va ricompilato: tools\build-llama-cuda.ps1"
    } else {
        Note 'WARN' "llama_cpp non installato / non importabile (vedi log sopra)"
    }
}

W ''
W "--- modelli GGUF in backend\models"
$modelsDir = Join-Path $RepoRoot 'backend\models'
if (Test-Path $modelsDir) {
    $ggufs = Get-ChildItem $modelsDir -Filter '*.gguf' -ErrorAction SilentlyContinue
    if ($ggufs) {
        $ggufs | ForEach-Object { W ("    " + $_.Name + "  " + [math]::Round($_.Length / 1GB, 2) + " GB") }
    } else { Note 'WARN' "nessun .gguf in backend\models (serve da F4)" }
} else { W "    <cartella assente>" }

# ----------------------------------------------------------- 7. build tooling
Section "7. Tooling di build"
Exec "cmake --version"  "cmake"  @('--version')  | Out-Null
Exec "ninja --version"  "ninja"  @('--version')  | Out-Null
Exec "git --version"    "git"    @('--version')  | Out-Null

W ''
W "--- git nel repo (controlla 'dubious ownership')"
if (Has 'git') {
    $gitOut = & git -C $RepoRoot status --short --branch 2>&1 | Out-String
    W ($gitOut.TrimEnd())
    if ($gitOut -match 'dubious ownership') {
        Note 'FAIL' "git rifiuta il repo per 'dubious ownership' (cartella di proprieta' di Administrators). Fix: git config --global --add safe.directory '$($RepoRoot -replace '\\','/')'"
    }
}
if ($pyOk) {
    W ''
    W "--- cmake/ninja/scikit-build-core nel venv"
    W ((& $py -m pip list 2>&1 | Select-String -Pattern 'cmake|ninja|scikit' | Out-String).TrimEnd())
}

# ------------------------------------------------------- 8. frontend / audio
Section "8. Frontend e tool audio"
Exec "node --version" "node" @('--version') | Out-Null
Exec "npm --version"  "npm"  @('--version')  | Out-Null
$nm = Join-Path $RepoRoot 'frontend\node_modules'
W ''
W ("frontend\node_modules : " + (Test-Path $nm))
if (-not (Test-Path $nm)) { Note 'WARN' "node_modules assente: lancia 'npm install' in frontend\" }

if (Has 'ffmpeg') {
    $ff = & ffmpeg -version 2>&1 | Select-Object -First 3 | Out-String
    W ''
    W "--- ffmpeg -version (prime righe)"
    W ($ff.TrimEnd())
    Note 'OK' "ffmpeg presente"
} else {
    Note 'FAIL' "ffmpeg non nel PATH: MP3/M4A/OGG non decodificabili (librosa/audioread lo richiede)."
}
if (Has 'rubberband') { Note 'OK' "rubberband CLI presente (pyrubberband usabile)" }
else { Note 'WARN' "rubberband CLI assente: time-stretch cade su librosa (ok, qualita' leggermente inferiore)" }

# ------------------------------------------------------------------ 9. PATH
Section "9. PATH (una voce per riga)"
($env:PATH -split ';') | Where-Object { $_ } | ForEach-Object { W ("    " + $_) }

# --------------------------------------------------------------- 10. sommario
Section "10. Sommario"
foreach ($lvl in @('FAIL', 'WARN', 'OK')) {
    $items = $script:Findings | Where-Object { $_.Level -eq $lvl }
    if ($items) {
        W ''
        W ("[$lvl]")
        $items | ForEach-Object { W ("  - " + $_.Msg) }
    }
}

W ''
W ('=' * 78)
W ("Log salvato in: " + $OutFile)
W ('=' * 78)
Write-Host ""
Write-Host "Log: $OutFile" -ForegroundColor Cyan
Write-Host "Committalo e pushalo:  git add tools/logs && git commit -m `"diag`" && git push" -ForegroundColor Cyan
