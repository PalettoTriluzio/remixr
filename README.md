# Remixr

Local-only AI music remixer. Load audio → tweak via prompt (local LLM) or manual DAW-style controls → export.

**Everything runs offline. All dependencies are free / open-source.**

---

## Requirements

| Tool | Version | Notes |
|---|---|---|
| Python | 3.11 or 3.12 | 3.13 not yet supported by some deps |
| Node.js | 20+ | LTS recommended |
| Git | any | to clone |
| ffmpeg | latest | needed for MP3/M4A/OGG decoding |
| Visual Studio Build Tools | 2022 | C++ compiler, required to build `llama-cpp-python` |
| CUDA Toolkit | 12.4+ | required for the GPU build of `llama-cpp-python` |
| NVIDIA driver | 550+ | `nvidia-smi` must work |
| CMake | 3.22+ | comes with VS Build Tools |
| Rubber Band CLI | 3.x | optional, only for `pyrubberband` high-quality time-stretch |
| Disk space | ~15 GB | CUDA toolkit (~3 GB) + LLM model (~4 GB) + demucs weights (~2 GB) + torch |
| RAM | 16 GB recommended | |
| GPU | NVIDIA, 8 GB+ VRAM | RTX 4090 Laptop (16 GB) → full GPU offload of a 7B/14B model |

**Reference dev machine:** RTX 4090 Laptop (Ada Lovelace, compute capability **8.9**, 16 GB VRAM). The build flags below are tuned for it.

---

## Windows setup — step by step

### 1. Install Python 3.11
- Download from [python.org/downloads](https://www.python.org/downloads/) → Python 3.11.x Windows installer (64-bit)
- **On the first install screen, tick "Add python.exe to PATH"**, then Install
- Verify in a **new** PowerShell:
  ```powershell
  python --version
  ```

### 2. Install Node.js 20 LTS
- Download from [nodejs.org](https://nodejs.org/) (LTS button)
- Verify:
  ```powershell
  node --version
  npm --version
  ```

### 3. Install ffmpeg (required for MP3 / M4A / OGG)
Easiest path with winget (Windows 10 1809+):
```powershell
winget install --id=Gyan.FFmpeg -e
```
**Close and reopen PowerShell** so PATH refreshes. Verify:
```powershell
ffmpeg -version
```
Manual alternative: download from [gyan.dev/ffmpeg/builds](https://www.gyan.dev/ffmpeg/builds/), extract, add the `bin/` folder to your PATH.

### 4. Install Visual Studio Build Tools 2022 (C++ compiler)

> ⚠️ **Install this BEFORE the CUDA Toolkit (§5).** The CUDA installer registers its MSBuild integration into whatever Visual Studio it finds; if VS isn't there yet, the CUDA build later fails with *"No CUDA toolset found"*. (Fixable after the fact — see Troubleshooting.)

- Download **Build Tools for Visual Studio 2022** from [visualstudio.microsoft.com/downloads](https://visualstudio.microsoft.com/downloads/) (scroll to "Tools for Visual Studio")
- Run the installer, select the **"Desktop development with C++"** workload
- Make sure these components are checked (they usually are by default):
  - MSVC v143 – VS 2022 C++ x64/x86 build tools
  - Windows 11 SDK (or Windows 10 SDK)
  - C++ CMake tools for Windows
- Install (~7 GB). Reboot if prompted.

Verify — open **"x64 Native Tools Command Prompt for VS 2022"** from the Start menu and run:
```
cl
```
It should print the MSVC version banner.

### 5. Install CUDA Toolkit 12.4 (GPU acceleration for the LLM)

First check your driver:
```powershell
nvidia-smi
```
The top-right "CUDA Version" is the **max** your driver supports — it must be ≥ the toolkit you install. A recent 4090 laptop driver reports 12.x, which is fine.

Install the toolkit:
```powershell
winget install --id=Nvidia.CUDA -v 12.4 -e
```
Or download the local installer from [developer.nvidia.com/cuda-12-4-1-download-archive](https://developer.nvidia.com/cuda-12-4-1-download-archive) → Windows / x86_64 / 11 / exe (local). The **Express** installation is fine.

> Any CUDA 12.x ≥ 12.4 works. Pinning 12.4 just matches what llama.cpp is most widely tested against.

**Close and reopen PowerShell**, then verify:
```powershell
nvcc --version
echo $env:CUDA_PATH
```
`nvcc` must report release 12.x and `CUDA_PATH` must point at `...\NVIDIA GPU Computing Toolkit\CUDA\v12.4`. If `nvcc` isn't found, add `%CUDA_PATH%\bin` to your PATH manually and reopen the terminal.

### 6. (Optional) Install Rubber Band CLI (for time-stretch quality)
Only needed if you use `pyrubberband` (F2+). Download from [breakfastquay.com/rubberband](https://breakfastquay.com/rubberband/), extract, add the folder containing `rubberband.exe` to PATH.
If you skip this, we fall back to `librosa.effects.time_stretch` (works fine, slightly lower quality).

### 7. Clone the repo and set up the backend
```powershell
cd C:\path\to\your\projects
git clone https://github.com/PalettoTriluzio/remixr.git
cd remixr\backend

python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip setuptools wheel
```

Install everything **except** `llama-cpp-python` (that one gets its own GPU build in §8):
```powershell
pip install -r requirements.txt
```
> `demucs` pulls in `torch` (~800 MB). This can take several minutes.
> `requirements.txt` deliberately does **not** list `llama-cpp-python` — installing it via pip would give you a CPU-only build.

### 8. Build `llama-cpp-python` from source with CUDA

> **This step is only needed for F4 (the LLM prompt bar).** Everything else — upload, waveform, BPM/key analysis, the whole DSP chain, preview and export — runs without it. If the build is fighting you, skip to "Running" and come back later.

**Recommended: use the script.** It loads the MSVC environment itself, repairs the CUDA environment variables, and tries four build strategies in cascade until `llama_supports_gpu_offload()` is `True`:

```powershell
cd C:\path\to\remixr
powershell -ExecutionPolicy Bypass -File .\tools\build-llama-cuda.ps1
```

Full log lands in `tools\logs\`. See `tools/README.md` for the options. Run `.\tools\diag.ps1` first if something looks off — it's read-only and tells you what's missing.

**Manual path** (reference — what the script automates). Run from the "x64 Native Tools Command Prompt for VS 2022" (Start menu), then switch to PowerShell and activate the venv:

```
powershell
cd C:\path\to\remixr\backend
.venv\Scripts\activate
```

Set the build flags and compile:
```powershell
# MSBuild reads the toolkit path from this variable. If it's missing you get
# "The CUDA Toolkit v12.6 directory '' does not exist". Adjust to your version.
$env:CUDA_PATH_V12_6 = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6"

$env:CMAKE_GENERATOR = "Ninja"   # skips MSBuild's CUDA integration entirely
$env:CMAKE_ARGS = "-DGGML_CUDA=on -DCMAKE_CUDA_ARCHITECTURES=89 -DLLAVA_BUILD=OFF"
$env:CUDACXX = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6\bin\nvcc.exe"  # never put paths with spaces in CMAKE_ARGS
$env:CXXFLAGS = "/FIchrono"      # MSVC 19.44+ with the llama.cpp vendored in 0.3.2
$env:FORCE_CMAKE = "1"
pip install "cmake<4" ninja "scikit-build-core[pyproject]>=0.9.2"
pip install llama-cpp-python==0.3.2 --no-cache-dir --no-build-isolation --verbose
```

What the flags do:
- `-DGGML_CUDA=on` — the CUDA backend. (This replaced the old `-DLLAMA_CUBLAS=on` flag; that one is dead in 0.3.x and silently gives you a CPU build.)
- `-DCMAKE_CUDA_ARCHITECTURES=89` — build **only** for Ada Lovelace (the 4090). Without it, CMake compiles kernels for every architecture and the build takes 3–4× longer. Change it if you move to another GPU: Ampere (30xx / A100) = `86`, Hopper = `90`, Blackwell (50xx) = `120`.
- `--no-cache-dir` — forces a real rebuild instead of reusing a previously cached CPU wheel. **Essential** if you already installed a CPU version.

The build takes **10–20 minutes** and prints a lot of `nvcc` output. That's normal.

**Verify the GPU support actually landed:**
```powershell
python -c "import llama_cpp; print(llama_cpp.llama_supports_gpu_offload())"
```
Must print `True`. If it prints `False`, the build silently fell back to CPU — see Troubleshooting.

At runtime, Remixr loads the model with `n_gpu_layers=-1` (offload every layer). On the first model load you should see lines like `offloaded 29/29 layers to GPU` in the backend terminal, and `nvidia-smi` should show a few GB of VRAM in use.

### 9. Download the LLM model
- Create the folder `backend\models\` if not present
- Download a Qwen2.5-Instruct GGUF from Hugging Face:
  - **Default — [Qwen2.5-7B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF)** → `qwen2.5-7b-instruct-q4_k_m.gguf` (~4.4 GB). Fully GPU-resident on 16 GB VRAM, very fast.
  - **Optional, smarter — [Qwen2.5-14B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-14B-Instruct-GGUF)** → `qwen2.5-14b-instruct-q4_k_m.gguf` (~9 GB). Still fits fully in 16 GB with room for context; better at producing valid JSON on complex prompts.
- Put the file in `backend\models\`

---

## Running (dev mode)

Open **two** terminals from the project root.

**Terminal 1 — backend:**
```powershell
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 — frontend:**
```powershell
cd frontend
npm install     # first time only, 1-2 min
npm run dev
```

Open http://localhost:5173

Backend health check: http://127.0.0.1:8000/api/health

---

## Troubleshooting

### llama-cpp-python / CUDA build

**`CUDA 12.6.targets(606,9): error : The CUDA Toolkit v12.6 directory '' does not exist`**
→ The CUDA/MSBuild integration *is* installed, but MSBuild reads the toolkit path from `CUDA_PATH_V<major>_<minor>` and that variable isn't set, so `CudaToolkitDir` resolves to empty. Two fixes:
```powershell
# A) set it (permanently, for your user) and reopen the terminal
setx CUDA_PATH_V12_6 "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6"

# B) better: don't use MSBuild at all — Ninja calls nvcc directly
$env:CMAKE_GENERATOR = "Ninja"
```
`tools\build-llama-cuda.ps1` does both automatically.

**`unsupported Microsoft Visual Studio version`**
→ Your MSVC is newer than what `nvcc` whitelists (e.g. MSVC 19.44 / VS 17.14 with CUDA 12.6). Add the override:
```powershell
$env:CMAKE_ARGS = "$env:CMAKE_ARGS -DCMAKE_CUDA_FLAGS=-allow-unsupported-compiler"
```
This is the `ninja-allow-unsupported` strategy in the build script.

**Build picks CMake 4.x and configure fails in odd places** (log shows `No module named 'cmake'`)
→ `scikit-build-core` downloads its own CMake when it can't run one, and CMake 4 dropped compatibility shims that the vendored llama.cpp still relies on. Having `cmake<4` in the venv is not enough: pip's build isolation hides the venv's site-packages, so the venv's `cmake.exe` launcher crashes. Build without isolation:
```powershell
pip install "cmake<4" ninja "scikit-build-core[pyproject]>=0.9.2"
pip install llama-cpp-python==0.3.2 --no-cache-dir --no-build-isolation --verbose
```

**`Could not find nvcc executable in path specified by variable CUDAToolkit_ROOT=C:/Program`**
→ A path with spaces inside `CMAKE_ARGS`: it gets split on whitespace. Pass paths through env vars instead (`$env:CUDAToolkit_ROOT`, `$env:CUDACXX`) and keep `CMAKE_ARGS` path-free.

**`common.cpp: error C2039: 'system_clock': is not a member of 'std::chrono'`**
→ MSVC 19.44+ no longer pulls in `<chrono>` transitively and the llama.cpp vendored in 0.3.2 forgets to include it. Force-include it: `$env:CXXFLAGS = "/FIchrono"` (or try a newer `llama-cpp-python`).

**`No CUDA toolset found` (or `CMake Error ... CUDA_TOOLKIT_ROOT_DIR not found`)**
→ You installed CUDA before VS Build Tools, so the MSBuild integration is missing. Copy it in manually (adjust paths to your CUDA version / VS edition):
```powershell
Copy-Item "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4\extras\visual_studio_integration\MSBuildExtensions\*" `
  -Destination "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Microsoft\VC\v170\BuildCustomizations\" -Force
```
Run PowerShell **as Administrator** for this. Then retry the build.

**`llama_supports_gpu_offload()` prints `False` after a "successful" build**
→ pip reused a cached CPU wheel, or `CMAKE_ARGS` wasn't picked up. Force a clean rebuild:
```powershell
pip uninstall -y llama-cpp-python
$env:CMAKE_ARGS = "-DGGML_CUDA=on -DCMAKE_CUDA_ARCHITECTURES=89"
$env:FORCE_CMAKE = "1"
pip install llama-cpp-python==0.3.2 --no-cache-dir --force-reinstall --no-binary llama-cpp-python --verbose
```
Also double-check you're not using the old `-DLLAMA_CUBLAS=on` flag — it does nothing in 0.3.x.

**`cl.exe not found` / `Microsoft Visual C++ 14.0 or greater is required`**
→ You're not in the "x64 Native Tools Command Prompt for VS 2022", or the C++ workload wasn't installed. See §4.

**`nvcc fatal : Unsupported gpu architecture 'compute_89'`**
→ Your CUDA Toolkit is older than 11.8. Install 12.4 (§5) — Ada needs it.

**Build is extremely slow (40+ min)**
→ You forgot `-DCMAKE_CUDA_ARCHITECTURES=89` and it's compiling every GPU generation.

**`nvcc` not recognized after installing CUDA**
→ PATH not refreshed. Close/reopen the terminal; if it persists, add `%CUDA_PATH%\bin` to PATH by hand.

**Out of VRAM when loading the model**
→ Close other GPU apps (games, browsers with hardware accel), or use a smaller quant (Q4_K_S / Q3_K_M), or lower `n_gpu_layers` from `-1` to a partial offload like `24`.

**Last-resort escape hatch:** if the source build is truly unrecoverable, there are pre-built CUDA wheels:
```powershell
pip install llama-cpp-python --only-binary llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu124
```
`--only-binary` matters: without it, if there's no wheel for your version/Python, pip silently compiles a **CPU** build from source. They lag behind on versions and aren't tuned for Ada, so prefer the source build.

### Git / general

**`fatal: detected dubious ownership in repository`**
→ The repo folder is owned by `BUILTIN\Administrators` (created by an elevated process), so git refuses it. Whitelist it:
```powershell
git config --global --add safe.directory C:/Users/<you>/Desktop/remixr
```

**`torch.cuda.is_available()` is `False`**
→ The default PyPI wheel for Windows is CPU-only. Harmless for now (nothing imports torch until F5), but demucs stem separation will be slow. When you get to F5:
```powershell
pip install --force-reinstall torch torchaudio --index-url https://download.pytorch.org/whl/cu124
```

### Audio / general

**`soundfile` / `librosa` errors on MP3 load**
→ ffmpeg missing or not on PATH. Close and reopen the terminal after installing.

**`ImportError: DLL load failed` when starting uvicorn**
→ Usually a torch / numpy mismatch. Try `pip install --force-reinstall numpy==1.26.4`.

**Demucs first run downloads 2 GB and hangs**
→ Normal, first call downloads model weights to `%USERPROFILE%\.cache\torch\hub\`. Watch the terminal.

**Port 8000 or 5173 already in use**
→ Change `--port 8001` for backend (update `vite.config.ts` proxy target) or use `npm run dev -- --port 5174`.

---

## Project structure
See `CLAUDE.md`.

## Roadmap
See `PLAN.md`.

## License
TBD (all deps: pedalboard Apache 2.0, demucs MIT, librosa ISC, llama-cpp-python MIT, FastAPI MIT, React MIT, wavesurfer.js BSD-3).
