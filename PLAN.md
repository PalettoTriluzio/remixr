# PLAN — Remixr

Stato: **F2 — DSP engine** (F0, F1 completati 2026-08-21). Data inizio: 2026-08-21.

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

## F2 — DSP engine (pedalboard chain)
- ☐ `backend/app/dsp/chain.py`: builder da params → `pedalboard.Pedalboard`
- ☐ Effetti: HP/LP, EQ 3-band parametrica (peaking), Compressor, Limiter, Reverb, Delay, Distortion, Stereo width (mid/side)
- ☐ Pitch shift (pedalboard.PitchShift) + Tempo (pyrubberband.time_stretch)
- ☐ `POST /api/render/export` — applica chain, salva WAV
- ☐ `POST /api/render/preview` — versione short (regione o full a bitrate ridotto) per audizione rapida

## F3 — UI DAW-style (rack manuale)
- ☐ Componenti `EffectCard` (bypass toggle, sliders, knobs) per ogni effetto
- ☐ `EffectRack` verticale con drag-to-reorder
- ☐ `TransportBar` (play/pause, loop, A/B compare originale vs remix)
- ☐ Sync stato params ↔ backend (debounce 300ms, chiamata `/preview`)

## F4 — LLM integration
- ☐ `backend/app/llm/engine.py`: wrapper `Llama` da `llama-cpp-python` (path modello configurabile in env)
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
- Modello LLM specifico (Qwen2.5-3B vs 7B vs 14B — dipende da RAM/VRAM utente)
- Ordine di default degli effetti nella chain (proposta: HP → EQ → Comp → Distortion → LP → Delay → Reverb → Stereo → Limiter)

## Log modifiche
- 2026-08-21: doc iniziali creati (CLAUDE.md, PLAN.md). Stack e scope definiti via Q&A.
- 2026-08-21: F0 completato. Backend FastAPI + Pydantic schema + 8 stub endpoints. Frontend Vite/React/TS/Tailwind con layout DAW (TopBar, WaveformView, EffectRack con 11 EffectCard placeholder, PromptPanel, TransportBar). Types + API client tipizzati. README con setup Windows. Nome progetto tuttora placeholder `remixr`.
- 2026-08-21: README esteso con guida completa Windows (VS Build Tools, CMake, ffmpeg via winget, wheel pre-buildate llama-cpp-python, rubberband opzionale, troubleshooting).
- 2026-08-21: F1 completato. Upload reale con validazione formato/dimensione (max 200 MB), audio loader universale (soundfile→librosa), analyze endpoint (BPM/key/peaks/spectrum), dropzone drag-drop, wavesurfer.js v7 con play/pause funzionante + volume + time counter. Store zustand centralizzato.
