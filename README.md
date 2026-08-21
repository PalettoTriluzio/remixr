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
| Visual Studio Build Tools | 2022 | to compile `llama-cpp-python` (unless you use a pre-built wheel) |
| CMake | 3.22+ | comes with VS Build Tools |
| Rubber Band CLI | 3.x | optional, needed only if using `pyrubberband` for high-quality time-stretch |
| Disk space | ~10 GB | LLM model (~4 GB) + demucs weights (~2 GB) + torch |
| RAM | 8 GB min, 16 GB recommended | LLM inference |
| GPU (NVIDIA) | optional | speeds up Demucs stem separation drastically |

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

### 4. Install Visual Studio Build Tools 2022 (needed to compile `llama-cpp-python`)
- Download **Build Tools for Visual Studio 2022** from [visualstudio.microsoft.com/downloads](https://visualstudio.microsoft.com/downloads/) (scroll to "Tools for Visual Studio")
- Run the installer, select the **"Desktop development with C++"** workload
- Make sure these components are checked (they usually are by default):
  - MSVC v143 – VS 2022 C++ x64/x86 build tools
  - Windows 11 SDK (or Windows 10 SDK)
  - C++ CMake tools for Windows
- Install (~7 GB). Reboot if prompted.

> **Shortcut — skip VS Build Tools:** you can install a pre-built wheel of `llama-cpp-python` instead of compiling. See §6 below.

### 5. (Optional) Install Rubber Band CLI (for time-stretch quality)
Only needed if you use `pyrubberband` (F2+). Download from [breakfastquay.com/rubberband](https://breakfastquay.com/rubberband/), extract, add the folder containing `rubberband.exe` to PATH.
If you skip this, we fall back to `librosa.effects.time_stretch` (works fine, slightly lower quality).

### 6. Clone the repo and set up the backend
```powershell
cd C:\path\to\your\projects
git clone <this-repo> remixr
cd remixr\backend

python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip setuptools wheel
```

Install everything **except** `llama-cpp-python` first (it's the slow / fragile one):
```powershell
pip install fastapi==0.115.0 "uvicorn[standard]==0.32.0" python-multipart==0.0.12 pydantic==2.9.2
pip install numpy==1.26.4 soundfile==0.12.1 librosa==0.10.2.post1 audioread==3.0.1
pip install pedalboard==0.9.16 pyrubberband==0.4.0
pip install demucs==4.0.1
```
> `demucs` will pull in `torch` (~800 MB). This can take several minutes.

Now install `llama-cpp-python`. **Pick ONE of the two paths:**

**Path A — compile from source (needs VS Build Tools from §4):**
```powershell
pip install llama-cpp-python==0.3.2
```
This compiles for ~5–10 min. If it fails, read the error — usually a missing MSVC component.

**Path B — use a pre-built CPU wheel (no compilation needed):**
```powershell
pip install llama-cpp-python==0.3.2 --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu
```
Faster and safer for most users. Switch to Path A only if you want CUDA acceleration on the LLM.

Verify install:
```powershell
pip list | findstr "fastapi pedalboard demucs llama"
```

### 7. Download the LLM model
- Create the folder `backend\models\` if not present
- Download a Qwen2.5-Instruct GGUF from [Hugging Face — Qwen/Qwen2.5-7B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF)
- Recommended file: `qwen2.5-7b-instruct-q4_k_m.gguf` (~4.4 GB)
- If you have < 12 GB RAM, use the 3B variant instead: [Qwen/Qwen2.5-3B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF)
- Put the file in `backend\models\`

### 8. Set up the frontend
```powershell
cd ..\frontend
npm install
```
Takes 1–2 minutes.

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
npm run dev
```

Open http://localhost:5173

Backend health check: http://127.0.0.1:8000/api/health

---

## Troubleshooting

**`llama-cpp-python` fails to compile with "cl.exe not found"**
→ VS Build Tools didn't install the C++ compiler. Re-run the installer, ensure "Desktop development with C++" is checked. Or use Path B (pre-built wheel).

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
