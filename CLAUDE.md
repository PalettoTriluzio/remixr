# Remixr

Local-only AI music remixer. Load audio → tweak via local LLM prompt or manual DAW-style controls → export.

## Regole di collaborazione (dall'utente)
- **Sintetico, efficiente, niente divagazioni.**
- **Fai esattamente quello che ti viene chiesto.**
- **Aggiorna sempre `CLAUDE.md` e `PLAN.md` quando fai qualcosa.**
- **Non runnare niente**: scrivi il codice, l'utente lo prova su Windows.
- Tutto **offline** e **gratuito** (licenze open-source, no royalty).

## Stack (deciso)
| Layer | Scelta | Motivo |
|---|---|---|
| Backend | Python 3.11+ + FastAPI + uvicorn | HTTP layer per React, async, tipizzato |
| Frontend | React 18 + Vite + TypeScript + Tailwind + shadcn/ui | UI interattiva DAW-style |
| Waveform UI | wavesurfer.js v7 | Standard de-facto, gratis |
| LLM | `llama-cpp-python` **buildato da sorgente con CUDA** + Qwen2.5-Instruct GGUF Q4_K_M | 100% locale, no server esterno, full GPU offload |
| DSP | `pedalboard` (Apache 2.0) + `soundfile` + `librosa` | Effetti VST-quality gratis, analisi |
| Stems | `demucs` (MIT) | Separazione voce/drums/bass/other |
| Pitch/tempo | pedalboard time-stretch + `pyrubberband` fallback | Qualità |
| Preset | JSON su filesystem | Semplice, portabile |

## Piattaforma target
Windows 10/11 (dev machine dell'utente). Deve girare offline dopo setup iniziale.

**Hardware di riferimento**: RTX 4090 Laptop — Ada Lovelace, compute capability **8.9**, 16 GB VRAM.

### Build LLM (vincolo fisso)
`llama-cpp-python` va **compilato da sorgente con CUDA**, mai installato come wheel CPU:
```powershell
$env:CMAKE_ARGS = "-DGGML_CUDA=on -DCMAKE_CUDA_ARCHITECTURES=89"
$env:FORCE_CMAKE = "1"
pip install llama-cpp-python==0.3.2 --no-cache-dir
```
- `GGML_CUDA` (non `LLAMA_CUBLAS`, morto in 0.3.x)
- `CUDA_ARCHITECTURES=89` = solo Ada → build 3-4x più veloce
- Verifica: `llama_cpp.llama_supports_gpu_offload()` deve dare `True`
- Prerequisiti in ordine: VS Build Tools 2022 (C++) **prima**, poi CUDA Toolkit 12.4
- **Non** in `requirements.txt` (pip installerebbe la versione CPU)
- A runtime: `n_gpu_layers=-1` (offload totale, il modello ci sta in 16 GB)

### Diagnostica e build (script in `tools/`, li lancia l'utente)
- `tools/diag.ps1` — fotografia dell'ambiente Windows (GPU/CUDA/`CUDA_PATH_V*`/MSVC/Python/pacchetti/ffmpeg/node/git). **Sola lettura.**
- `tools/build-llama-cuda.ps1` — build di `llama-cpp-python` con CUDA, 4 strategie in cascata: `ninja-allow-unsupported` → `ninja` → `msbuild` → `wheel` precompilata. Si ferma alla prima con `llama_supports_gpu_offload() == True`.
- Entrambi caricano `vcvars64.bat` da soli (niente "x64 Native Tools Prompt") e scrivono in `tools/logs/`, che **non è gitignorata**: i log si committano e si leggono dall'altra macchina.
- Dettagli in `tools/README.md`.

### Stato ambiente macchina utente (2026-10-09)
Rilevato dal log `errors.txt`: Python 3.11, CUDA **12.6** (`v12.6`), MSVC **19.44** (VS BuildTools 17.14), driver ok, tutte le dipendenze di `requirements.txt` installate nel venv.
- **Blocco build llama-cpp**: `CUDA 12.6.targets(606,9): error : The CUDA Toolkit v12.6 directory '' does not exist`. CMake trovava CUDA correttamente (`Found CUDAToolkit ... v12.6`, `Using CUDA architectures: 89`), ma MSBuild legge il path da `CUDA_PATH_V12_6`, **non settata** → `CudaToolkitDir` vuoto. Risolto nello script (variabile ricostruita + Ninja che bypassa del tutto i `.targets`).
- MSVC 19.44 è oltre quanto CUDA 12.6 dichiara di supportare → serve `-allow-unsupported-compiler`.
- `scikit-build-core` si scaricava **cmake 4.4.4** nell'ambiente isolato → ora pinnato `cmake<4` nel venv.
- `torch` installato è la wheel **CPU** di PyPI: irrilevante finché non arriva F5 (niente importa torch adesso), ma demucs girerebbe su CPU.
- Repo su Windows di proprietà di `BUILTIN\Administrators` → serviva `git config --global --add safe.directory`.

**L'app gira già senza llama-cpp**: nessun modulo importa `llama_cpp`/`demucs`/`torch`, gli endpoint F4/F5 sono stub 501.

## Formati audio
- **Input**: MP3, WAV, FLAC, AAC/M4A, OGG (via `soundfile` + `librosa`/`audioread` fallback)
- **Output**: WAV 24-bit (default) + MP3 320kbps opzionale

## Architettura
```
remixr/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI entrypoint
│   │   ├── models.py          # Pydantic schemas (single source of truth for params)
│   │   ├── storage.py         # data dir paths + find_upload()
│   │   ├── api/               # endpoints (upload/audio, analyze, render, llm, presets, stems)
│   │   ├── audio/             # loader.py: soundfile→librosa fallback (MP3/WAV/FLAC/M4A/AAC/OGG)
│   │   ├── analysis/          # features.py: BPM (librosa.beat), key (Krumhansl), peaks, mel-spectrum
│   │   ├── dsp/               # chain.py: params→pedalboard + mid/side + time/pitch
│   │   │                      # render.py: decode cache → process → WAV/MP3
│   │   ├── llm/               # (F4) llama.cpp wrapper + prompt→JSON schema
│   │   ├── stems/             # (F5) demucs wrapper
│   │   └── presets/           # (F6) I/O preset JSON + genre templates
│   ├── data/
│   │   ├── uploads/           # audio caricati (gitignored)
│   │   ├── renders/           # output (gitignored)
│   │   ├── stems/             # stems separate (gitignored)
│   │   ├── presets/           # preset utente JSON
│   │   └── genre_templates/   # template di genere JSON
│   ├── models/                # LLM GGUF files (gitignored)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/        # WaveformView, EffectRack, EffectCard, PromptBar, PresetMenu, TransportBar
│   │   ├── hooks/             # useAudioEngine, useLLM, usePresets
│   │   ├── lib/               # api client, types, param schemas
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── index.html
├── CLAUDE.md
├── PLAN.md
└── README.md
```

## API contract
- `GET  /api/health` → `{status, app, version}` ✅
- `POST /api/upload` (multipart) → `{track_id, filename, duration_sec, sample_rate, channels}` ✅
- `GET  /api/audio/{track_id}` → raw audio file stream (for wavesurfer) ✅
- `GET  /api/analyze/{track_id}` → `{bpm, key, peaks[], spectrum[]}` ✅
- `POST /api/stems/{track_id}` (async) → `{job_id, status}` / `GET /api/stems/{track_id}` → status+paths (F5)
- `POST /api/llm/interpret` `{prompt, current_params, genre?}` → `{params, explanation, changed_fields[]}` (F4)
- `POST /api/render/preview` `{track_id, params, region?}` → WAV 16-bit stream, max 30 s ✅
- `POST /api/render/export` `{track_id, params, format}` → `{render_id, path, duration_sec}` ✅
- `GET  /api/render/file/{render_id}` → download ✅
- `GET/POST/DELETE /api/presets` → CRUD (F6)
- `GET  /api/genre-templates` → list (F6)

## Param schema (single source of truth, condiviso py↔ts)
Definito in `backend/app/models.py` come Pydantic → generato in `frontend/src/lib/types.ts`.
Struttura:
```
{
  input_gain, eq: [{freq, gain, q, type}], comp: {...}, limiter: {...},
  reverb: {...}, delay: {...}, pitch_semitones, tempo_ratio,
  stereo_width, distortion: {...}, hp: {freq}, lp: {freq},
  per_stem: {vocals: {...chain}, drums: {...}, bass: {...}, other: {...}} | null
}
```

## DSP chain (F2)
Ordine fisso in `app/dsp/chain.py`:
```
[time/pitch] → input_gain → HP → EQ(3 peaking) → Comp(+makeup Gain) → Distortion
             → LP → Delay → Reverb → [stereo width] → Limiter
```
- **Time/pitch prima**: trasformano la sorgente, il resto è colore. `pedalboard.time_stretch` (Rubber Band) in un passaggio solo per tempo+pitch; fallback `pyrubberband` → `librosa`. Solo pitch → plugin `PitchShift`.
- `tempo.ratio` = **moltiplicatore di velocità** (2.0 = doppia velocità, metà durata). La semantica di `stretch_factor` in pedalboard è ambigua tra versioni → sondata una volta a runtime con un buffer di 1 s (`_stretch_factor_is_speed`).
- **Stereo width** = mid/side in numpy (nessun plugin pedalboard): per questo la catena è spezzata in due board con lo step numpy in mezzo. Su mono è no-op.
- `Compressor` di pedalboard non ha makeup → `Gain` subito dopo.
- Band EQ a 0 dB e effetti disabilitati vengono saltati (meno passaggi).
- Clip a [-1, 1] prima della quantizzazione int (l'overflow wrappa → rumore full-scale).
- Cache LRU (4 entry) dell'audio decodificato in `app/dsp/render.py`: le preview di F3 ricalcolano solo la catena, non il decode.

## Progressione (vedi PLAN.md per dettaglio)
MVP → DSP core → LLM integration → Stems → Preset & templates → Polish UI.
