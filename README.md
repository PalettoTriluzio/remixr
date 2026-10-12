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
  - **Recommended on the RTX 4090 Laptop (16 GB) — [Qwen2.5-14B-Instruct-GGUF](https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF)** → `Qwen2.5-14B-Instruct-Q5_K_M.gguf` (~10.5 GB). Fully on the GPU with 8k context; knows many more artists (feature "Stile di") and gets the JSON right more often. Q4_K_M (~9 GB) if you want more headroom.
  - **What fits in 16 GB** (llama-cpp-python 0.3.2, fully on GPU, 8k context):

    | Model | File | Size | Verdict |
    |---|---|---|---|
    | Qwen2.5-7B Q4_K_M | single | 4.7 GB | fast, weak on artist styles |
    | **Qwen2.5-14B Q5_K_M** | single | 10.5 GB | **sweet spot** |
    | Qwen2.5-14B Q6_K | single | 12.1 GB | fits, little gain over Q5 |
    | Qwen2.5-32B IQ3_XS | single | ~13.7 GB | at the limit (lower `REMIXR_LLM_CTX` to 4096), 3-bit loses quality |
    | Qwen2.5-32B Q4_K_M | single | ~19.9 GB | does **not** fit: partial offload (`REMIXR_LLM_GPU_LAYERS≈48`), several times slower |

    Newer families (Qwen3, Gemma 3, Mistral Small 3) need a newer llama-cpp-python: rebuild with `tools\build-llama-cuda.ps1 -Version <x.y.z>`.
- Put the file in `backend\models\`

Note: in the official Qwen repo the Q4_K_M is **split** into `-00001-of-0000N.gguf` parts (llama.cpp loads them if you point at part 1, all parts in the same folder). A single file is simpler — from the command line:
```powershell
cd backend
.venv\Scripts\activate
pip install -U "huggingface_hub[cli]"
hf download bartowski/Qwen2.5-7B-Instruct-GGUF Qwen2.5-7B-Instruct-Q4_K_M.gguf --local-dir models
hf download bartowski/Qwen2.5-14B-Instruct-GGUF Qwen2.5-14B-Instruct-Q5_K_M.gguf --local-dir models
```

**Check that the model loads on the GPU:**
```powershell
python -c "from llama_cpp import Llama; m=Llama('models/Qwen2.5-7B-Instruct-Q4_K_M.gguf', n_gpu_layers=-1, n_ctx=4096, verbose=True); print(m.create_chat_completion(messages=[{'role':'user','content':'Say OK'}])['choices'][0]['message']['content'])"
```
In the output look for `offloaded 29/29 layers to GPU`, then the reply.

**Which model Remixr loads**: the **biggest** `*.gguf` in `backend\models\` that fits fully in VRAM (≤ `REMIXR_LLM_MAX_GB`, default 12 GB). You can switch model at runtime from the selector in the AI panel header (it frees the GPU and reloads). To force one at startup:
```powershell
$env:REMIXR_LLM_MODEL = "Qwen2.5-14B-Instruct-Q4_K_M.gguf"   # name in backend\models\ or absolute path
```
Other knobs: `REMIXR_LLM_MAX_GB` (default 12), `REMIXR_LLM_CTX` (default 8192), `REMIXR_LLM_GPU_LAYERS` (default -1 = all), `REMIXR_LLM_PRELOAD=0` (load on the first prompt instead of at startup), `REMIXR_LLM_VERBOSE=0` (silence the llama.cpp log).

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
LLM status: http://127.0.0.1:8000/api/llm/status (`loading` for a few seconds after startup, then `ready`; the badge top-right of the AI panel shows the same).

**Quick tour**
- Drop a track → the effect rack (left) is live: power button = bypass, drag a knob vertically (Shift = fine), double-click = default.
- Every change renders a preview (first 30 s, or the region you drag on the waveform, max 30 s) and switches to **B** (remix). **A** = original. Loop button loops the region.
- **Seeing A vs B** (top panel):
  - lane **A · ORIGINALE** = the whole track; the dashed box is the window B was rendered from.
  - lane **B · REMIX** = that window drawn twice on the same scale: original on top, remix below. Louder/quieter, longer/shorter (tempo), more compressed is visible at a glance; top right: duration, peak and RMS `A → B`. Click the top half to hear A from there, the bottom half for B.
  - right column: live spectrum of what is playing (cyan = A, violet/pink = B); the whole UI (strip, play button, badge, lanes) switches colour with the side.
- AI panel (right): describe the remix, Enter to send. The answer shows each changed parameter `old → new`, the touched knobs turn pink in the rack, "annulla" reverts that answer.
  - **Stile di**: type an artist (suggestions for ~35 with curated traits, any name works) or just write "fammela come la farebbe <artista>". Only the production/mix is imitated (tone, space, density, grit, tempo): voice, melody and instruments can't change.
  - **Genre**: also sends the genre template's settings to the model as a starting point.
- **LOOK** (top of the AI panel): one tap, no AI — Slowed + Reverb, Nightcore, Lo-fi, Underwater, Radio, Stadium, Club, Vinile '70.
- **INTENSITÀ** (transport bar): one slider for the whole remix, 0 % = original, 100 % = the rack, 150 % = pushed further. Double-click = 100 %. Preview, export and saved presets use what you hear.
- **3 varianti** / **Sorprendimi** (AI panel): the AI gives three different takes; the first plays, "ascolta questa" switches to another. The one playing is marked "● IN ASCOLTO".
- **Volume pari** (scale icon, on by default): A and B play at the same average loudness, so you judge the sound, not the volume. Listening only.
- The session (track, remix, intensity, chat) survives a page reload. Drop an audio file anywhere in the window to load it.
- Top bar: undo/redo, **Preset** (genre templates + your presets: load, save, delete), **Export** (whole track, WAV 24-bit or MP3, downloaded as `<name>_remix.wav`).
- Shortcuts: `Space` play/pause · `B` switch A/B · `L` loop · `Esc` clear region · `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo.

---

## Troubleshooting

### "Not implemented (F4)" / il pannello AI non risponde

Il codice attuale non contiene più quella scritta: se la vedi, ti sta rispondendo un **backend vecchio**. Segui i passi in ordine, dalla root del repo.

**1. Il codice è aggiornato?**
```powershell
git pull
git merge-base --is-ancestor 27366d4 HEAD; if ($?) { "F3+F4 presente" } else { "F3+F4 MANCANTE" }
dir backend\app\llm      # devono esserci engine.py e interpret.py
```
Se `backend\app\llm` non c'è, il pull non è andato: risolvi prima quello (vedi "Git / general").

**2. Chi risponde sulla porta 8000?**
Con il backend acceso, apri http://127.0.0.1:8000/api/llm/status:
- `{"state":"loading"...}` o `{"state":"ready"...}` → backend nuovo, ok (salta al passo 5)
- `{"detail":"Not Found"}` → risponde un **processo vecchio**, vai al passo 3
- la pagina non si apre → nessun backend acceso

Per vedere quanti processi stanno in ascolto (con un backend solo deve esserci **una** riga, al massimo due con `--reload`):
```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen | Select-Object OwningProcess, @{n="Avviato";e={(Get-Process -Id $_.OwningProcess).StartTime}}
```
Su Windows `uvicorn --reload` può lasciare processi Python orfani sulla porta, e Windows permette a due processi di aprire la stessa porta: risponde quello vecchio.

**3. Chiudi tutti i backend**
Chiudi i terminali del backend, poi:
```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Get-NetTCPConnection -LocalPort 8000 -State Listen    # non deve stampare niente
```
Se stampa ancora qualcosa: riavvia il PC.

**4. Riporta numpy alla versione giusta**
La build di `llama-cpp-python` ha aggiornato numpy da 1.26.4 a 2.4.6 (si vede nel log della build). `requirements.txt` vuole 1.26.4, e numpy 2.4 può rompere librosa/numba (analisi BPM/key):
```powershell
cd backend
.venv\Scripts\activate
pip install numpy==1.26.4
python -c "import numpy, llama_cpp; print(numpy.__version__, llama_cpp.__version__, llama_cpp.llama_supports_gpu_offload())"
```
Deve stampare `1.26.4 0.3.2 True`.

**5. Riavvia il backend salvando il log**
Sempre in `backend` con il venv attivo:
```powershell
dir models\*.gguf      # deve esserci almeno un .gguf
uvicorn app.main:app --host 127.0.0.1 --port 8000 2>&1 | Tee-Object -FilePath "..\tools\logs\backend-$(Get-Date -Format yyyyMMdd-HHmmss).log"
```
(Senza `--reload` per questa prova: niente processi figli che restano appesi.) Il log finisce in `tools\logs\`.

Entro qualche secondo nel log deve comparire `offloaded 29/29 layers to GPU`, e http://127.0.0.1:8000/api/llm/status deve dire `"state":"ready"` e `"gpu_offload":true`.

**6. Riavvia il frontend**
In un altro terminale: `cd frontend`, `npm install`, `npm run dev`, poi ricarica la pagina con **Ctrl+F5**. In alto a destra nel pannello AI il pallino deve essere verde con il nome del modello e `GPU`.

**7. Se non funziona ancora**
Prova un prompt, chiudi il backend con Ctrl+C e manda il log:
```powershell
git add tools/logs
git commit -m "log backend"
git push
```
Cosa cercare nel log / nello status:
| Messaggio | Causa |
|---|---|
| `llama-cpp-python non installato` | venv sbagliato, o la build è finita in un altro Python → passo 4 |
| `Nessun modello .gguf in ...` | il file non è in `backend\models\`, o `REMIXR_LLM_MODEL` punta a un nome sbagliato |
| `Caricamento di ... fallito` | file GGUF incompleto/corrotto, o VRAM piena (chiudi altri programmi che usano la GPU) |
| `gpu_offload: false` / `CPU` nel badge | è installata la build CPU di llama-cpp-python → rifai README §8 |
| `502 ... JSON` | il modello ha risposto male: riprova, o usa il 14B (README §9) |

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
