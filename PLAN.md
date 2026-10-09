# PLAN — Remixr

Stato: **F3 — UI DAW-style** (F0, F1 completati 2026-08-21 · F2 completato 2026-10-09). Data inizio: 2026-08-21.

Legenda: ☐ da fare · ◐ in corso · ☑ fatto

## F0 — Bootstrap (scaffolding, zero logica) ☑
- ☑ `backend/requirements.txt`
- ☑ `backend/app/main.py` con FastAPI + CORS + healthcheck
- ☑ `backend/app/models.py` con Pydantic schema completo dei parametri
- ☑ Stub endpoints 501 (`upload`, `analyze`, `stems`, `llm/interpret`, `render/export`, `render/preview`, `presets`, `genre-templates`)
- ☑ `frontend/` con Vite + React + TS + Tailwind (dark theme custom)
- ☑ `frontend/src/lib/types.ts` mirror del Pydantic schema
- ☑ `frontend/src/lib/api.ts` client tipizzato
- ☑ `frontend/src/App.tsx` layout DAW placeholder (TopBar / WaveformView / EffectRack + PromptPanel / TransportBar)
- ☑ `.gitignore`
- ☑ `README.md` con setup Windows step-by-step

## F1 — Audio I/O + Analisi ☑
- ☑ `POST /api/upload` (multipart, salva in `data/uploads/{uuid}.ext`, max 200 MB, valida estensione)
- ☑ `GET /api/audio/{track_id}` per stream file al frontend (wavesurfer lo legge da URL)
- ☑ Loader universale (`app/audio/loader.py`: soundfile primary, librosa fallback per MP3/M4A)
- ☑ `app/storage.py` per path centralizzati + `find_upload()`
- ☑ `GET /api/analyze/{id}` → BPM (librosa.beat), key (Krumhansl-Schmuckler), peaks (2000 pt), mel-spectrum (128 bin)
- ☑ Frontend `Dropzone.tsx` drag-drop + click-to-browse con stati upload/analyzing/error
- ☑ Frontend `WaveformView.tsx` con wavesurfer.js v7 + metriche live (BPM/KEY/DUR/SR)
- ☑ Frontend `store.ts` (zustand): track + analysis + wavesurfer instance + play/pause state
- ☑ `TransportBar` play/pause funzionante + volume + time counter (loop/A-B ancora F3)

## F2 — DSP engine (pedalboard chain) ☑
- ☑ `backend/app/dsp/chain.py`: builder da params → `pedalboard.Pedalboard` (ordine fisso, vedi CLAUDE.md §DSP chain)
- ☑ Effetti: HP/LP, EQ 3-band peaking, Compressor (+makeup Gain), Limiter, Reverb, Delay, Distortion, Stereo width (mid/side numpy)
- ☑ Pitch + Tempo: `pedalboard.time_stretch` in un passaggio, fallback `pyrubberband` → `librosa`; solo-pitch via plugin `PitchShift`
- ☑ `app/dsp/render.py`: cache LRU del decode + clip pre-quantizzazione + write WAV 24-bit / MP3 (libsndfile)
- ☑ `app/audio/loader.py`: `load_audio_segment()` (decode della sola regione, soundfile seek / librosa offset)
- ☑ `app/storage.py`: `find_render()`
- ☑ `POST /api/render/export` — WAV 24-bit (o MP3), regione opzionale → `{render_id, path, duration_sec}`
- ☑ `POST /api/render/preview` — WAV 16-bit in memoria, max 30 s, no-store
- ☑ `GET /api/render/file/{render_id}` — download
- ☐ (rinviato a F5) `per_stem` nel render: ora risponde 501

## F3 — UI DAW-style (rack manuale)
- ☐ Componenti `EffectCard` (bypass toggle, sliders, knobs) per ogni effetto
- ☐ `EffectRack` verticale con drag-to-reorder
- ☐ `TransportBar` (play/pause, loop, A/B compare originale vs remix)
- ☐ Sync stato params ↔ backend (debounce 300ms, chiamata `/preview`)

## F4 — LLM integration
- ☐ `backend/app/llm/engine.py`: wrapper `Llama` da `llama-cpp-python` (path modello configurabile in env, `n_gpu_layers=-1`)
- ☐ System prompt che forza output JSON conforme allo schema params
- ☐ `POST /api/llm/interpret` — prende prompt utente + params correnti + genere opzionale → delta params + spiegazione testuale
- ☐ Validation con Pydantic prima di applicare
- ☐ Frontend: `PromptBar` in basso/destra, animazione "thinking", diff visivo dei parametri cambiati

## F5 — Stems (opzionale toggle)
- ☐ `backend/app/stems/demucs_wrapper.py` (chiamata `demucs.separate` in background task)
- ☐ `POST /api/stems/{id}` (job async) + polling `GET /api/stems/{id}`
- ☐ Estensione schema params: `per_stem` (chain separata per vocals/drums/bass/other)
- ☐ UI: toggle "Stems mode", tabs per stem nel rack

## F6 — Preset & Genre Templates
- ☐ CRUD preset JSON (`data/presets/*.json`)
- ☐ Genre templates seed: `house.json`, `lofi.json`, `rock.json`, `trap.json`, `pop.json`, `techno.json`, `ambient.json`
- ☐ Menu preset in top-bar (load/save/rename/delete)
- ☐ LLM può ricevere template come base (`genre` param in `/llm/interpret`)

## F7 — Polish
- ☐ Spectrum analyzer real-time nel waveform
- ☐ Export MP3 320 opzionale (via ffmpeg-python)
- ☐ Undo/redo history sui params
- ☐ Keyboard shortcuts (space=play, cmd+z=undo, cmd+s=save preset)
- ☐ Dark theme fine-tuning
- ☐ Windows installer script (.bat che fa venv, pip install, npm install, build, run)

## Decisioni tecniche pendenti
- Nome definitivo del progetto (placeholder: `remixr`)

## Decisioni prese
- **Ordine chain** (fisso, implementato in F2): `[time/pitch] → gain → HP → EQ → Comp → Distortion → LP → Delay → Reverb → Stereo → Limiter`.
- **`tempo.ratio` = moltiplicatore di velocità** (2.0 = doppia velocità). Lo `stretch_factor` di pedalboard viene sondato a runtime perché la sua semantica cambia tra versioni.
- **Preview**: WAV 16-bit, finestra max 30 s, non persistito. Export: WAV 24-bit. MP3 320 CBR vero → F7 (ffmpeg).
- **LLM**: Qwen2.5-**7B**-Instruct Q4_K_M di default (~4.4 GB, full GPU offload su 16 GB VRAM). 14B Q4_K_M (~9 GB) come opzione se serve più affidabilità sul JSON.
- **llama-cpp-python**: build da sorgente con `-DGGML_CUDA=on -DCMAKE_CUDA_ARCHITECTURES=89`. Vedi CLAUDE.md e README §8.

## Log modifiche
- 2026-08-21: doc iniziali creati (CLAUDE.md, PLAN.md). Stack e scope definiti via Q&A.
- 2026-08-21: F0 completato. Backend FastAPI + Pydantic schema + 8 stub endpoints. Frontend Vite/React/TS/Tailwind con layout DAW (TopBar, WaveformView, EffectRack con 11 EffectCard placeholder, PromptPanel, TransportBar). Types + API client tipizzati. README con setup Windows. Nome progetto tuttora placeholder `remixr`.
- 2026-08-21: README esteso con guida completa Windows (VS Build Tools, CMake, ffmpeg via winget, wheel pre-buildate llama-cpp-python, rubberband opzionale, troubleshooting).
- 2026-08-21: F1 completato. Upload reale con validazione formato/dimensione (max 200 MB), audio loader universale (soundfile→librosa), analyze endpoint (BPM/key/peaks/spectrum), dropzone drag-drop, wavesurfer.js v7 con play/pause funzionante + volume + time counter. Store zustand centralizzato.
- 2026-08-21: setup LLM cambiato da wheel CPU a **build CUDA da sorgente** (target RTX 4090 Laptop, arch 89). README riscritto: nuova §5 CUDA Toolkit 12.4, §8 dedicata alla compilazione, troubleshooting CUDA esteso (No CUDA toolset found, gpu_offload=False, arch non supportata, build lenta, OOM VRAM). `llama-cpp-python` rimosso da `requirements.txt` per evitare l'installazione CPU. Modello di default fissato a Qwen2.5-7B Q4_K_M.
- 2026-10-09: F2 completato. `app/dsp/chain.py` (11 effetti + mid/side + time/pitch con probe della convenzione `stretch_factor`), `app/dsp/render.py` (cache LRU decode, export WAV 24-bit / MP3, preview WAV 16-bit in memoria), `loader.load_audio_segment()`, `storage.find_render()`, 3 endpoint render implementati. `per_stem` → 501 fino a F5. Nessun tocco al frontend (contratto API invariato).
- 2026-10-09: aggiunta `tools/` con `diag.ps1` (diagnostica ambiente Windows, sola lettura) e `build-llama-cuda.ps1` (build llama-cpp-python con CUDA, strategie msbuild → ninja → ninja+allow-unsupported-compiler → wheel precompilata, con verifica `llama_supports_gpu_offload()` dopo ogni tentativo). Log in `tools/logs/`, committati per condividerli fra le due macchine. Setup bloccato sulla build CUDA: in attesa dei log dell'utente.
- 2026-10-09: diagnosticato il blocco build CUDA dal log utente (`errors.txt`): non era il flag `GGML_CUDA` ma `CUDA_PATH_V12_6` non settata → `CudaToolkitDir` vuoto → `CUDA 12.6.targets(606,9): The CUDA Toolkit v12.6 directory '' does not exist`. `build-llama-cuda.ps1` riscritto: ricostruisce le variabili CUDA da `nvcc`, pinna `cmake<4`+`ninja`, passa `CUDAToolkit_ROOT`/`CMAKE_CUDA_COMPILER` espliciti, nuovo ordine strategie (Ninja prima di MSBuild) e `-allow-unsupported-compiler` per MSVC 19.44 + CUDA 12.6. `diag.ps1` ora controlla `CUDA_PATH_V*` e la dubious ownership di git. README: 4 voci nuove di troubleshooting.
- 2026-10-09: nuovo log (`build-llama-20261009-182137.log`): 4 strategie fallite per bug dello script. Fix in `build-llama-cuda.ps1`: path CUDA via env (`CUDAToolkit_ROOT`, `CUDACXX`) invece che in `CMAKE_ARGS` (spezzato sugli spazi); `--no-build-isolation` + `scikit-build-core` nel venv (il cmake del venv non era raggiungibile → scaricava cmake 4.4.4); `CXXFLAGS=/FIchrono` per MSVC 19.44 con il llama.cpp di 0.3.2; strategia `wheel` con `--only-binary` (prima ricompilava una build CPU); regex MSVC compatibile con il banner italiano. README + tools/README aggiornati. In attesa di un nuovo run.
- 2026-10-09: **build CUDA di llama-cpp-python riuscita** (strategia `ninja-allow-unsupported`). README §9: download del modello da riga di comando (`hf download bartowski/Qwen2.5-7B-Instruct-GGUF`, file unico invece dei pezzi del repo ufficiale) + one-liner di verifica offload GPU.
