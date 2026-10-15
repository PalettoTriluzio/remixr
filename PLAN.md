# PLAN — Remixr

Stato: **F3 + F4 scritti, da provare su Windows** (F0, F1 completati 2026-08-21 · F2 completato 2026-10-09 · F3, F4 scritti 2026-10-10). Prossimo: F5 stems. Data inizio: 2026-08-21.

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

## F3 — UI DAW-style (rack manuale) ◐ (scritto, da provare)
- ☑ `Knob` (SVG, drag verticale, Shift fine, doppio click default, frecce) + `EffectCard` (bypass, reset, collapse, highlight AI) per ogni effetto
- ☑ `EffectRack` verticale in ordine di catena + card Input gain + "reset all"
- ✗ drag-to-reorder: scartato, l'ordine della catena è fisso (decisione F2)
- ☑ `TransportBar`: play/pause, loop, A/B originale vs remix, regione (trascinata sulla waveform, max 30 s), stato rendering
- ☑ `lib/player.ts`: motore A/B con mappatura delle posizioni sul tempo
- ☑ `usePreviewSync`: debounce 300 ms → `/render/preview`, abort delle richieste superate, auto-switch a B

## F4 — LLM integration ◐ (scritto, da provare)
- ☑ `backend/app/llm/engine.py`: singleton `Llama` (env `REMIXR_LLM_*`, `n_gpu_layers=-1`, warm-up all'avvio, lock)
- ☑ System prompt + grammar GBNF dallo schema → `{explanation, changes}` (delta)
- ☑ `POST /api/llm/interpret` (+ `bpm`/`key` opzionali) e `GET /api/llm/status`
- ☑ Merge del delta con clamp ai bound Pydantic + validazione + `changed_fields`
- ☑ Frontend `PromptPanel`: badge modello, chat, animazione "thinking", diff `vecchio → nuovo`, annulla, highlight nel rack

## F5 — Stems + struttura (Flip passo 1) ◐ (scritto, da provare)
- ☑ `app/stems/separate.py`: demucs in background (1 worker, job per traccia, progress, OOM CUDA → CPU, risultati su disco)
- ☑ `POST/GET /api/stems/{id}` (polling) + `GET /api/stems/{id}/{stem}` (download WAV)
- ☑ Mixer stems (`StemMix`: volume, mute, solo) nella richiesta di render → preview ed export
- ☑ `app/analysis/structure.py` + `GET /api/structure/{id}`: beat, downbeat (4/4), sezioni con lettere/nomi, accordi; ricalcolata dagli stems
- ☑ UI: `StemsPanel` (separa, mixer, acapella/strumentale, download), griglia battute sulla waveform, `StructureLane` (sezioni cliccabili, accordi), snap regione alle battute, `battuta.movimento`
- ☑ `tools/install-torch-cuda.ps1` (torch cu124, numpy pin, pesi demucs, test GPU)
- ☐ Catene di effetti per stem (`per_stem`, ancora 501) — probabilmente assorbite dalle tracce della timeline (F9)

## F9 — Timeline + campionatore (Flip passo 2)
- ☐ Timeline ad arrangiamento: tracce, clip a battute, snap alla griglia
- ☐ Chop di uno stem per battute/transienti; per chop: pitch, reverse, stretch, filtro, gate
- ☐ Warp a un BPM nuovo (pitch preservato) + trasposizione di tonalità
- ☐ Melodia della voce (basic-pitch, Apache 2.0) → correzione d'intonazione sulla scala, armonizzazioni

## F10 — Strumentale generato (Flip passo 3)
- ☐ Step sequencer batteria (trap, drill, house, boom bap…) + kit CC0 inclusi
- ☐ 808 e synth/pad in numpy che seguono gli accordi
- ☐ Progressione nuova nella tonalità scelta; voce adattata o solo chop compatibili

## F11 — Ricetta AI (Flip passo 4)
- ☐ LLM → "ricetta di flip" JSON (BPM/tonalità target, stems da tenere, chop, sezioni, pattern, basso, accordi)
- ☐ Render deterministico della ricetta, tutto modificabile a mano nella timeline; varianti come oggi

## F6 — Preset & Genre Templates ◐ (scritto, da provare)
- ☑ CRUD preset JSON (`data/presets/<slug>.json`, `app/presets/store.py`)
- ☑ Genre templates seed: `house.json`, `lofi.json`, `rock.json`, `trap.json`, `pop.json`, `techno.json`, `ambient.json`
- ☑ Menu preset in top-bar (load/save/delete; rename = salva con altro nome + elimina)
- ☑ LLM riceve il template del genere come base (`genre` in `/llm/interpret`)

## F4b — Stile artista + modelli ◐ (scritto, da provare)
- ☑ `app/llm/styles.py`: ~35 artisti (internazionali + italiani) → tratti di produzione
- ☑ `reference_artist` in `/llm/interpret` + match automatico nel testo del prompt; regole di onestà nel system prompt
- ☑ UI: campo "Stile di" con suggerimenti (`GET /llm/styles`)
- ☑ Default = GGUF più grande che sta in VRAM (`REMIXR_LLM_MAX_GB`), cambio modello a runtime (`POST /llm/model` + selettore UI)
- ☐ (opzionale) aggiornare llama-cpp-python per Qwen3/Gemma 3 (rebuild con `-Version`)

## F7 — Polish
- ☑ Spectrum analyzer real-time (colonna destra, colore per lato A/B)
- ☑ Corsia B: confronto A sopra / B sotto della finestra di preview + peak/RMS/durata; UI che cambia colore con il lato
- ☑ Export dalla top bar (traccia intera, WAV 24 / MP3 libsndfile, download `<nome>_remix.<ext>`)
- ☐ Export MP3 320 CBR vero (via ffmpeg)
- ☑ Undo/redo history sui params (Ctrl+Z / Ctrl+Shift+Z, bottoni in top bar)
- ☑ Keyboard shortcuts (Space play, B A/B, L loop, Esc regione, Ctrl+Z/Y)
- ☐ Dark theme fine-tuning
- ☐ Windows installer script (.bat che fa venv, pip install, npm install, build, run)

## F8 — Esperienza ◐ (scritto, da provare)
- ☑ Intensità 0–150 % (macro su tutta la catena)
- ☑ 8 look istantanei senza AI
- ☑ AI: 3 varianti a scelta + "Sorprendimi", marcatore "in ascolto"
- ☑ Volume pari A/B (confronto onesto)
- ☑ Sessione salvata e ripristinata al reload
- ☑ Drag & drop di un file ovunque
- ☐ Idee per dopo: stems (F5) con intensità per stem, export loudness-normalizzato (-14 LUFS), prompt vocale offline (whisper.cpp)

## Decisioni tecniche pendenti
- Nome definitivo del progetto (placeholder: `remixr`)

## Decisioni prese
- **Ordine chain** (fisso, implementato in F2): `[time/pitch] → gain → HP → EQ → Comp → Distortion → LP → Delay → Reverb → Stereo → Limiter`.
- **`tempo.ratio` = moltiplicatore di velocità** (2.0 = doppia velocità). Lo `stretch_factor` di pedalboard viene sondato a runtime perché la sua semantica cambia tra versioni.
- **Preview**: WAV 16-bit, finestra max 30 s, non persistito. Export: WAV 24-bit. MP3 320 CBR vero → F7 (ffmpeg).
- **LLM** (aggiornato 2026-10-12): default = il GGUF più grande che sta tutto in VRAM (≤ 12 GB). Consigliato sulla 4090 Laptop: **Qwen2.5-14B-Instruct Q5_K_M** (~10.5 GB). 32B solo IQ3 (al limite) o con offload parziale (lento). Qwen3/Gemma 3 richiedono un llama-cpp-python più nuovo di 0.3.2.
- **LLM → delta, non Params completi** (2026-10-10): meno token, niente rumore sui campi non toccati; merge+clamp lato backend.
- **A/B**: A = originale intero, B = preview della finestra (regione o primi 30 s). Niente drag-to-reorder (catena fissa).
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
- 2026-10-10: modelli GGUF scaricati dall'utente. **F3 + F4 scritti** (da provare su Windows). F3: `Knob`, `EffectCard`, `EffectRack` (ordine catena, no reorder), `TransportBar` con loop/A-B/regione, `lib/player.ts` (A/B con mappatura tempo), `lib/remixStore.ts`, `lib/effects.ts`, `hooks/usePreviewSync.ts`, regions plugin di wavesurfer. F4: `app/llm/engine.py` (singleton, warm-up, lock, grammar con fallback JSON), `app/llm/interpret.py` (prompt, delta→merge/clamp/diff), `GET /llm/status`, `PromptPanel` con chat/diff/annulla. Schema: `LLMInterpretRequest` + `bpm`/`key`, nuovo `LLMStatus`.
- 2026-10-11: "F4 not implemented" sul PC dell'utente: codice aggiornato ma risponde un uvicorn vecchio rimasto sulla porta 8000. Dal log build: numpy portato a 2.4.6 da pip (da riportare a 1.26.4). Dettagli in CLAUDE.md.
- 2026-10-11: README → Troubleshooting: nuova sezione "Not implemented (F4)" con i passi per l'utente (verifica pull, processi sulla porta 8000, kill, numpy 1.26.4, avvio backend con log in `tools/logs/`, tabella dei messaggi d'errore).
- 2026-10-11: README, passo 1 della procedura F4: `git log -3` sostituito con `git merge-base --is-ancestor 27366d4 HEAD` (con commit successivi `27366d4` usciva dalle ultime 3 righe).
- 2026-10-12: "rendilo definitivo". **A/B visivo**: corsia B (`CompareLane`: finestra di preview, originale sopra / remix sotto, stessa scala, peak/RMS/durata, clic = ascolta A o B da lì), riquadro della finestra sulla waveform A, spettro live (`SpectrumView` + `lib/analyser.ts`), colori dell'interfaccia per lato (ciano A, viola B). **Stile artista** (`app/llm/styles.py`, `reference_artist`, campo "Stile di"). **Modelli**: scelta automatica del più grande che sta in VRAM, cambio a runtime dalla UI, grammar in cache. **F6**: CRUD preset + 7 genre template + menu in top bar; template del genere passato all'LLM. **Export** in top bar. **Undo/redo** e **scorciatoie**. README: tabella modelli per 16 GB, tour aggiornato.
- 2026-10-12: giro "esperienza" (F8): Intensità (`lib/morph.ts`), look istantanei (`lib/looks.ts`), varianti/Sorprendimi (`variation` in `/llm/interpret`, `seed` in `engine.chat_json`), volume pari A/B (`useLevelMatch`, trim in `player.ts`), sessione in localStorage (`lib/session.ts` + `GET /api/track/{id}`), drop ovunque (`useGlobalDrop`). Versione UI 0.3.0.
- 2026-10-15: **Flip** (stravolgere i brani, rifacimenti alla thasup/Neffa): piano in 4 passi F5 → F9 → F10 → F11, generazione simbolica (no MusicGen/Stable Audio per licenza). **F5 scritto**: separazione demucs in background (`app/stems/separate.py`, default `htdemucs_ft` su GPU), endpoint stems con progress e download, mixer stems in preview/export (`StemMix` nella richiesta di render), analisi struttura (`app/analysis/structure.py`: beat/downbeat, sezioni, accordi, cache in `data/analysis/`), UI (pannello Stems, griglia battute, corsia sezioni/accordi, snap, battuta.movimento), `tools/install-torch-cuda.ps1`. Melodia (basic-pitch) spostata in F9.
- 2026-10-15: `UltimoMessagio.md` in root con le istruzioni per provare F5 (pull, `install-torch-cuda.ps1`, riavvio, checklist di prova, log).
