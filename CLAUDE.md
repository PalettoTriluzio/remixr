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
│   │   ├── dsp/               # (F2) pedalboard chain builder
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
- `POST /api/render/preview` `{track_id, params, region?}` → audio stream (F2)
- `POST /api/render/export` `{track_id, params, format}` → `{render_id, path, duration_sec}` (F2)
- `GET  /api/render/file/{render_id}` → download (F2)
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

## Progressione (vedi PLAN.md per dettaglio)
MVP → DSP core → LLM integration → Stems → Preset & templates → Polish UI.
