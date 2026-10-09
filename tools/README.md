# tools/

Script di diagnostica e build per la macchina Windows. **Li lanci tu**, non vengono mai eseguiti da Claude.

| Script | Cosa fa | Modifica il sistema? |
|---|---|---|
| `diag.ps1` | fotografia dell'ambiente (GPU, CUDA + variabili `CUDA_PATH_V*`, MSVC, Python, pacchetti, ffmpeg, node, git) | **no**, sola lettura |
| `build-llama-cuda.ps1` | compila `llama-cpp-python` con CUDA provando 4 strategie in cascata | sì, installa nel venv |

## Ordine d'uso

```powershell
cd C:\path\to\remixr

# 1. diagnostica (30 secondi, non installa niente)
powershell -ExecutionPolicy Bypass -File .\tools\diag.ps1

# 2. build llama-cpp con CUDA (10-20 min per tentativo)
powershell -ExecutionPolicy Bypass -File .\tools\build-llama-cuda.ps1
```

Entrambi scrivono in `tools/logs/`. Quei log **vanno committati** (la cartella non è in `.gitignore`):

```powershell
git add tools/logs
git commit -m "log diag + build"
git push
```

> `llama-cpp-python` serve **solo per F4** (prompt LLM). Upload, waveform, analisi BPM/key, catena DSP, preview ed export girano senza.

## Cosa risolve `build-llama-cuda.ps1`

1. **Ambiente MSVC** — carica `vcvars64.bat` da solo, quindi si lancia da PowerShell normale. Non serve la "x64 Native Tools Command Prompt" (dimenticarla è la causa più comune di `cl.exe not found`).
2. **Variabili CUDA** — ricostruisce `CUDA_PATH_V<maj>_<min>`, `CudaToolkitDir` e `CUDAToolkit_ROOT` dal path reale di `nvcc`. Senza `CUDA_PATH_V12_6` MSBuild muore con:
   `The CUDA Toolkit v12.6 directory '' does not exist`
   anche con CUDA installato e trovato da CMake.
3. **cmake 4.x** — pinna `cmake<4` + `ninja` + `scikit-build-core` nel venv e builda con `--no-build-isolation`: con l'isolamento di pip il `cmake.exe` del venv muore con `No module named 'cmake'` e `scikit-build-core` si scarica CMake 4.
3b. **Path con spazi** — `CMAKE_ARGS` viene spezzato sugli spazi (`CUDAToolkit_ROOT=C:/Program`): toolkit e nvcc passano da env `CUDAToolkit_ROOT` / `CUDACXX`, mai da `CMAKE_ARGS`.
3c. **`<chrono>` mancante** — MSVC 19.44 + llama.cpp di 0.3.2 → `'system_clock' non è un membro di 'std::chrono'`. Fix: `CXXFLAGS=/FIchrono`.
3d. **Strategia `wheel`** — usa `--only-binary`: se la wheel manca fallisce, invece di ricompilare in silenzio una build CPU.
4. **Check versione MSVC di nvcc** — `-allow-unsupported-compiler` quando MSVC è più recente di quanto il toolkit dichiara di supportare (es. MSVC 19.44 + CUDA 12.6).
5. **Build CPU silenziosa** — `pip uninstall` + `--no-cache-dir --force-reinstall --no-binary` prima di ogni tentativo, e verifica `llama_supports_gpu_offload()` dopo. Non ti ritrovi con una build CPU che sembra riuscita.

## Strategie

Si ferma alla prima che dà `llama_supports_gpu_offload() == True`:

| # | Nome | Cosa cambia |
|---|---|---|
| 1 | `ninja-allow-unsupported` | Ninja + `-DCMAKE_CUDA_FLAGS=-allow-unsupported-compiler` |
| 2 | `ninja` | Ninja puro: nvcc chiamato diretto, i `CUDA *.targets` di MSBuild non entrano in gioco |
| 3 | `msbuild` | generatore Visual Studio, con le variabili CUDA riparate |
| 4 | `wheel` | wheel CUDA precompilata da `abetlen.github.io`. Ultima spiaggia: non tarata per Ada, versione indietro |

L'ordine si adatta: se MSVC è più recente di quanto nvcc accetta parte dalla 1, altrimenti dalla 2.

Opzioni:

```powershell
.\tools\build-llama-cuda.ps1 -Strategy ninja        # forza una sola strategia
.\tools\build-llama-cuda.ps1 -Version 0.3.4         # altra versione di llama-cpp-python
.\tools\build-llama-cuda.ps1 -CudaArch 86           # Ampere 86, Ada 89, Hopper 90, Blackwell 120
.\tools\build-llama-cuda.ps1 -PersistCudaEnv        # setx delle variabili CUDA (permanenti)
.\tools\build-llama-cuda.ps1 -CmakePin cmake        # non pinnare cmake<4
.\tools\build-llama-cuda.ps1 -SkipDeps              # non toccare pip/cmake/ninja
```
