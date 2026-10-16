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
- `tools/install-torch-cuda.ps1` — torch/torchaudio 2.5.1 **cu124** al posto della wheel CPU, ripristina `numpy==1.26.4`, scarica i pesi demucs (`htdemucs_ft`, `htdemucs`), prova una separazione sulla GPU.
- `diag`/`build-llama` caricano `vcvars64.bat` da soli (niente "x64 Native Tools Prompt"); tutti scrivono in `tools/logs/`, che **non è gitignorata**: i log si committano e si leggono dall'altra macchina.
- Dettagli in `tools/README.md`.
- `UltimoMessagio.md` (root) = istruzioni per l'utente sull'ultimo passo consegnato (cosa fare / cosa provare): va riscritto a ogni consegna.

### Stato ambiente macchina utente (2026-10-09)
Rilevato dal log `errors.txt`: Python 3.11, CUDA **12.6** (`v12.6`), MSVC **19.44** (VS BuildTools 17.14), driver ok, tutte le dipendenze di `requirements.txt` installate nel venv.
- **Blocco build llama-cpp**: `CUDA 12.6.targets(606,9): error : The CUDA Toolkit v12.6 directory '' does not exist`. CMake trovava CUDA correttamente (`Found CUDAToolkit ... v12.6`, `Using CUDA architectures: 89`), ma MSBuild legge il path da `CUDA_PATH_V12_6`, **non settata** → `CudaToolkitDir` vuoto. Risolto nello script (variabile ricostruita + Ninja che bypassa del tutto i `.targets`).
- MSVC 19.44 è oltre quanto CUDA 12.6 dichiara di supportare → serve `-allow-unsupported-compiler`.
- `scikit-build-core` si scaricava **cmake 4.4.4** nell'ambiente isolato → `cmake<4` nel venv non bastava (vedi run 18:21 sotto).
- `torch` installato è la wheel **CPU** di PyPI: irrilevante finché non arriva F5 (niente importa torch adesso), ma demucs girerebbe su CPU.
- Repo su Windows di proprietà di `BUILTIN\Administrators` → serviva `git config --global --add safe.directory`.

**Run build 2026-10-09 18:21 (`tools/logs/build-llama-20261009-182137.log`)**: tutte e 4 le strategie fallite per bug dello script (corretti):
- `CUDAToolkit_ROOT=C:/Program Files/...` dentro `CMAKE_ARGS` → spezzato sugli spazi → "CUDA Toolkit not found". Ora i path passano da env (`CUDAToolkit_ROOT`, `CUDACXX`).
- Build isolation di pip → `cmake.exe` del venv `No module named 'cmake'` → scaricato cmake 4.4.4. Ora `--no-build-isolation` + `scikit-build-core` nel venv + bin dir reale di cmake nel PATH.
- llama.cpp di 0.3.2 + MSVC 19.44: `'system_clock' non è un membro di 'std::chrono'` → `CXXFLAGS=/FIchrono`.
- Non esiste una wheel cu124 per 0.3.2 su Windows: la strategia `wheel` ricompilava dal sorgente una versione CPU. Ora usa `--only-binary` e, senza `-Version`, prende l'ultima wheel disponibile.
- La regex della versione MSVC non riconosceva il banner italiano ("versione") → ora `riskyCombo` viene rilevato.

**✅ Build CUDA riuscita (2026-10-09)** con la strategia `ninja-allow-unsupported` (llama-cpp-python 0.3.2, `llama_supports_gpu_offload() == True`). Modelli GGUF scaricati in `backend/models/` (2026-10-10).

**Analisi 2026-10-11 (commit utente `1dd18f8`, "F4 not implemented")**: il commit ha come parent `27366d4` (F3+F4), quindi il codice è aggiornato; la stringa "Not implemented (F4)" non esiste più → risponde un **processo uvicorn vecchio** (su Windows `--reload` può lasciare processi orfani sulla porta 8000, e Windows permette bind doppi). I log pushati sono solo build del 2026-10-09, nessun log runtime. Effetto collaterale trovato nel log della build riuscita: pip ha aggiornato **numpy 1.26.4 → 2.4.6** (rompe il pin di `requirements.txt`, rischio numba/librosa) → ripristinare `numpy==1.26.4`. Procedura per l'utente: README → Troubleshooting → "Not implemented (F4)" (il log del backend va in `tools/logs/backend-*.log`). Il commit cancella anche `backend/models/.gitkeep` (innocuo: `storage.py` crea la cartella).

**L'app gira anche senza llama-cpp**: `llama_cpp` è importato solo dentro `app/llm/engine.py` al primo load → senza, `/llm/interpret` risponde 503 e il resto funziona. `torch`/`demucs` importati solo dentro il job di separazione (`app/stems/separate.py`): senza, il job finisce in `error` e il resto funziona.

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
│   │   │                      # structure.py: beat/downbeat, sezioni, accordi (da stems se ci sono)
│   │   │                      # mood.py: valenza/energia/brillantezza → mood + stile consigliato
│   │   ├── dsp/               # chain.py: params→pedalboard + mid/side + time/pitch
│   │   │                      # render.py: decode cache → process → WAV/MP3
│   │   ├── llm/               # engine.py: Llama singleton (lock, warm-up, grammar JSON)
│   │   │                      # interpret.py: prompt → delta params → merge/clamp/diff
│   │   │                      # styles.py: tabella artista → tratti di produzione
│   │   │                      # recipe.py: prompt → ricetta di flip (F11)
│   │   ├── stems/             # separate.py: job demucs in background (1 worker), progress, OOM→CPU
│   │   ├── flip/              # render.py: FlipProject → audio (clip cache, gate, track chain, master), onsets
│   │   │                      # tune.py: intonazione nota per nota + armonia diatonica (pYIN)
│   │   │                      # instruments.py: batteria e synth in numpy (kit, preset, 808 con glide)
│   │   │                      # generate.py: strumentale procedurale per stile e mood (pattern + note)
│   │   │                      # recipe.py: ricetta → FlipProject (deterministico)
│   │   └── presets/           # store.py: preset utente + genre templates (JSON)
│   ├── data/
│   │   ├── uploads/           # audio caricati (gitignored)
│   │   ├── renders/           # output (gitignored)
│   │   ├── stems/             # stems separate: <track_id>/{vocals,drums,bass,other}.wav + meta.json (gitignored)
│   │   ├── analysis/          # cache struttura: <track_id>.<mix|stems>.v<N>.json (gitignored)
│   │   ├── presets/           # preset utente JSON
│   │   └── genre_templates/   # template di genere JSON
│   ├── models/                # LLM GGUF files (gitignored)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/        # WaveformView (corsia A + regions), CompareLane (corsia B: A sopra/B sotto),
│   │   │                      # SpectrumView (spettro live), EffectRack, EffectCard, Knob, PromptPanel,
│   │   │                      # TransportBar, TopBar (undo/redo, preset, export),
│   │   │                      # StemsPanel (separazione + mixer), StructureLane (griglia, sezioni, accordi),
│   │   │                      # ChainRack/EffectCard (rack generico su una EffectChain),
│   │   │                      # Flip: FlipTimeline, ClipWave, FlipSidebar (clip/traccia/master), SourceBar, FlipTransport,
│   │   │                      # GeneratePanel (genera strumentale), PatternEditor (step grid / piano roll),
│   │   │                      # RecipePanel (AI FLIP: frase → ricetta → progetto)
│   │   ├── hooks/             # usePreviewSync (debounce 300 ms → /render/preview + decode per la corsia B),
│   │   │                      # useShortcuts (Space, B, L, Esc, Ctrl+Z/Y), useLevelMatch (volume pari A/B),
│   │   │                      # useGlobalDrop (drop di un file ovunque), useTrackStructure (stems status/poll + struttura),
│   │   │                      # useFlipPreview (debounce 350 ms → /flip/preview, cambio canzone = progetto azzerato)
│   │   ├── lib/               # api, types, store (track + buffer originale), remixStore (params/undo/A-B/chat),
│   │   │                      # effects (metadata knob + path helpers), player (motore A/B),
│   │   │                      # peaks (decode 8 kHz, colonne peak/rms, livelli), analyser (AnalyserNode condiviso),
│   │   │                      # morph (Intensità), looks (look istantanei), session (localStorage),
│   │   │                      # stemsStore (job stems, mixer, struttura, snap — legato alla traccia),
│   │   │                      # flip (griglia sorgente, chop, factory), flipStore (progetto, undo, selezione, ops),
│   │   │                      # flipActions (entra in flip, pezzo→clip, parti dal ritornello, taglia), flipPlayer, keys
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
- `GET  /api/track/{track_id}` → info dell'upload se esiste ancora (ripristino sessione) ✅
- `GET  /api/analyze/{track_id}` → `{bpm, key, peaks[], spectrum[]}` ✅
- `POST /api/stems/{track_id}` → avvia la separazione (idempotente) / `GET /api/stems/{track_id}` → `{job_id, status: none|pending|running|done|error, progress, stems{nome: url}, model, device, elapsed_sec, error}` ✅
- `GET  /api/stems/{track_id}/{stem}` → WAV dello stem ✅
- `GET  /api/structure/{track_id}` → `{source: mix|stems, bpm, key, beats_per_bar, beats[], downbeats[], sections[{start,end,bar_start,bar_end,label,name,energy}], chords[{start,end,chord}]}` ✅
- `GET  /api/llm/status` → `{state: idle|loading|ready|error, model, gpu_offload, error, available[]}` ✅
- `POST /api/llm/model` `{model}` → cambia GGUF a runtime (libera la VRAM, ricarica in background) ✅
- `GET  /api/llm/styles` → artisti con tratti curati (suggerimenti UI) ✅
- `POST /api/llm/interpret` `{prompt, current_params, genre?, bpm?, key?, reference_artist?, variation?}` → `{params, explanation, changed_fields[]}` ✅ (503 = LLM non disponibile, 502 = output non valido)
- `POST /api/flip/preview` `{track_id, project, master, start_beat?, end_beat?}` → WAV 16-bit, max 120 s ✅ (409 = clip su stems non separati)
- `POST /api/flip/export` `{track_id, project, master, format}` → `{render_id, path, duration_sec}` ✅
- `GET  /api/flip/onsets/{track_id}?source&start&end` → `{times[]}` (transienti per il taglio) ✅
- `POST /api/flip/generate` `{track_id, project, style, harmony: song|new, mood: auto|dark|sad|epic|happy|dreamy, parts[], start_bar, bars, seed}` → `{tracks[], chords[], explanation, mood}` ✅ (non renderizza: restituisce tracce con pattern)
- `GET  /api/flip/mood/{track_id}` → `{mood, valence, energy, brightness, minor_share, suggested_style, description}` ✅
- `POST /api/flip/recipe` `{track_id, prompt, variation?, seed}` → `{recipe, project, explanation, notes[]}` ✅ (503/502 come `/llm/interpret`)
- `POST /api/flip/recipe/build` `{track_id, recipe, seed, explanation}` → come sopra, senza LLM ✅
- `POST /api/render/preview` `{track_id, params, stem_mix?, region?}` → WAV 16-bit stream, max 30 s ✅
- `POST /api/render/export` `{track_id, params, stem_mix?, format}` → `{render_id, path, duration_sec}` ✅ (`stem_mix` senza stems → 409)
- `GET  /api/render/file/{render_id}` → download ✅
- `GET/POST/DELETE /api/presets` → CRUD su `data/presets/<slug>.json` ✅
- `GET  /api/genre-templates` → list da `data/genre_templates/*.json` (7 generi, effetti parziali + default Pydantic) ✅

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

## UI / A-B (F3)
- **A** = originale (wavesurfer, traccia intera). **B** = preview remix: WAV della finestra (regione trascinata sulla waveform, max 30 s; senza regione i primi 30 s) suonato da un `<audio>` nascosto in `lib/player.ts`.
- Il tempo cambia la durata del render → posizioni mappate con `speed` della preview (`orig = start + t·speed`). Il cursore della waveform mostra sempre il tempo dell'originale.
- Ogni modifica ai params → nuova preview (debounce 300 ms, fetch abortita se superata) e passaggio automatico a B; lo spostamento della regione re-renderizza senza cambiare lato. Catena neutra (nessun effetto, gain 0) → nessuna preview, B disabilitato.
- Loop = sulla regione (o finestra di preview) in A, `audio.loop` in B.
- Ordine catena **fisso** → niente drag-to-reorder nel rack; le card seguono il flusso del segnale.
- Knob: drag verticale (Shift = fine), doppio click = default, frecce = step. Range = bound Pydantic.

## UI / A-B visiva (2026-10-12)
- La waveform A resta l'originale (è la traccia intera). Il remix si **vede** nella corsia **B**: la finestra della preview disegnata due volte sullo stesso asse e sulla stessa scala assoluta (no normalize): A sopra, B sotto. Asse = max(durata finestra, durata remix) → il tempo si vede come lunghezza.
- Entrambi i lati decodificati a **8 kHz** (wavesurfer `sampleRate: 8000` per A, `OfflineAudioContext` a 8 kHz per la preview) → peak/RMS confrontabili. Le statistiche ignorano il contenuto > 4 kHz (per quello c'è lo spettro).
- Spettro live: un `AudioContext` creato al **primo gesto** (play / cambio A-B), `createMediaElementSource` su `<audio>` di wavesurfer e sull'`<audio>` del remix → un solo `AnalyserNode` → destination. Prima del primo gesto nessun elemento è collegato (un context sospeso renderebbe muto l'audio). Senza analyser: spettro medio di `/analyze` in trasparenza.
- Cambio lato = cambio colore di tutta l'interfaccia: ciano = A, viola/rosa = B (striscia in alto, play, badge, corsie, spettro, waveform A ingrigita su B).
- Undo/redo in `remixStore` (max 100; i `setParam` sullo stesso controllo entro 800 ms = un solo passo).

## Esperienza (2026-10-12, "pensa come Steve Jobs")
- **Intensità** (0–150 %, `lib/morph.ts`): un'unica manopola sul remix. Ogni controllo "di quantità" scorre fra il suo valore neutro (dove non fa nulla: wet 0, ratio 1, tempo 1, hp 20 Hz, lp 20 kHz…) e il valore del rack; lineare o logaritmico come il knob, clamp ai range. I controlli "di forma" (freq/Q EQ, attack, tempo del delay, room) restano. 0 % = catena neutra → niente preview. Il rack mostra i valori **target**; preview, export e "salva preset" usano i valori **effettivi**. Look/preset/risposte AI riportano l'intensità a 100 %.
- **Look istantanei** (`lib/looks.ts`, barra "LOOK" nel pannello AI): 8 catene pronte, senza LLM (Slowed+Reverb, Nightcore con pitch che segue il tempo come un vinile, Lo-fi, Underwater, Radio, Stadium/Club con delay a tempo sul BPM, Vinile '70).
- **Varianti**: toggle "3 varianti" → 3 chiamate con `variation` 1..3 (temperature 0.8, seed casuale, hint "alternativa diversa"), tutte dallo stesso stato di partenza. La prima si applica, le altre hanno "ascolta questa". Il messaggio con i params in ascolto è segnato "● IN ASCOLTO". **Sorprendimi** = prompt creativo con lo stesso meccanismo.
- **Volume pari** (bilancia nella transport bar, default on): trim = RMS(A) − RMS(B) sulla finestra; abbassa solo il lato più forte (mai boost). Solo ascolto, non export.
- **Sessione**: params, intensità, chat, traccia + analisi in `localStorage` (`remixr.session.v1`, debounce 500 ms); al reload la traccia viene riaperta solo se `/api/track/{id}` la trova ancora.
- **Drop ovunque**: un file audio trascinato in qualsiasi punto della finestra carica la traccia (overlay); la `Dropzone` gestisce solo il clic.

## LLM (F4)
- Il modello **non** restituisce Params completi: `{explanation, changes}` con `changes` = EffectChain parziale. Grammar GBNF generata dallo schema (tutte le chiavi opzionali, **ordine delle chiavi = ordine dei campi** in `models.py`), fallback a JSON generico.
- Il delta viene unito ai params correnti: chiavi sconosciute scartate, numeri clampati ai bound Pydantic, effetto toccato senza `enabled` → acceso. `changed_fields` = diff (`global_chain.reverb.wet`).
- Schema grammar e tabella range nel system prompt derivano da `models.py` (single source of truth). `per_stem` passa invariato.
- Spiegazione nella lingua del prompt. BPM/key dall'analisi vanno nel prompt (delay a tempo, ratio verso un BPM target).
- Modello caricato da un thread di warm-up all'avvio; un lock serializza load e inferenza. Env: `REMIXR_LLM_MODEL` (default: il più grande che sta in VRAM, vedi sotto), `REMIXR_LLM_MAX_GB` (12), `REMIXR_LLM_CTX` (8192), `REMIXR_LLM_GPU_LAYERS` (-1), `REMIXR_LLM_PRELOAD` (1), `REMIXR_LLM_VERBOSE` (1).
- UI: badge stato modello (poll `/llm/status`) con selettore del modello se ce n'è più di uno, chat con diff `vecchio → nuovo` per risposta + "annulla", knob/card toccati dall'AI evidenziati (rosa) finché non li modifichi.
- **Modello di default** = il GGUF più grande che sta tutto in VRAM (≤ `REMIXR_LLM_MAX_GB`, default 12 → su 16 GB sceglie un 14B Q5_K_M). Grammar compilata una volta (`lru_cache`).
- **Stile artista** ("fammela come la farebbe X"): `app/llm/styles.py` = ~35 artisti → tratti di produzione nel vocabolario della catena. Artista dal campo `reference_artist` (match esplicito) o trovato nel testo del prompt (nomi ambigui come "Ultimo" solo dal campo). Artista sconosciuto → il modello usa la sua conoscenza e deve dirlo se non lo conosce. Il system prompt impone onestà: si imita solo produzione/mix, non voce/melodia/strumenti.
- **Genere**: se esiste `data/genre_templates/<genere>.json`, la sua catena (parziale) va nel prompt come punto di partenza.

## Flip — stravolgere i brani (dal 2026-10-15)
Obiettivo dell'utente: rifacimenti radicali alla "Una direzione giusta" (thasup su Neffa): tieni un pezzo riconoscibile (voce/hook), butta il resto, costruisci un pezzo nuovo (tempo, groove, armonia). Piano in 4 passi: **F5** stems + griglia → **F9** timeline + campionatore → **F10** strumentale generato (simbolico) → **F11** ricetta AI.
- Generazione **simbolica** (pattern + synth numpy + sample CC0), **non** MusicGen/Stable Audio: pesi con licenza non commerciale / restrizioni → violano "gratis, no royalty". Eventuale opzione solo-uso-personale più avanti.
- Melodia: in F9 basta pYIN di librosa (intonazione/armonia nota per nota), basic-pitch non serve.

### F5 — Stems + struttura
- **demucs** (`app/stems/separate.py`): un worker, un job per traccia (`job_id = track_id`). Default `htdemucs_ft` su GPU (4 passate, voce migliore), `htdemucs` su CPU. Env `REMIXR_STEMS_MODEL`, `REMIXR_STEMS_DEVICE`. Progress = `tqdm` di `demucs.apply` sostituito durante il job. OOM CUDA (LLM in VRAM) → ripete su CPU. Stems ricampionati al **sr originale** e tagliati/paddati alla **stessa lunghezza** dell'upload: stessa timeline del file. Scrittura in `<id>.tmp/` + rename; `meta.json` = marker "done" (sopravvive ai riavvii).
- **Mixer stems** = `StemMix` (gain_db −60…+12, mute, solo) nella **richiesta di render**, non in `Params`: è legato alla traccia (non entra in preset/LLM/look/undo/sessione). Solo vince, −60 dB = spento. Mixer a zero → si renderizza il file originale (somma stems ≈ originale, non identica). `per_stem` (catene per stem) resta 501.
- **Struttura** (`app/analysis/structure.py`, euristiche, nessun modello): beat da librosa sull'onset del drum stem (se il drum stem è quasi vuoto → mix); 4/4 assunto, fase della battuta = dove kick (onset < 150 Hz) e cambio armonico (chroma) coincidono; accordi = chroma beat-sync (bass+other, o HPSS del mix) vs 24 triadi + Viterbi, "N" sul silenzio; sezioni = SSM a livello di battuta (chroma+MFCC) → novelty a scacchiera → confini (min 4 battute, bonus ogni 4) → lettere per somiglianza (coseno > 0.6) → nomi indicativi (ritornello = lettera ripetuta più energica/con più voce). Cache su disco per sorgente; `VERSION` in `app/analysis/structure.py` invalida; `structure_for()` = accesso con cache (API e generatore).
- UI: righe di battuta sulla waveform A (numeri ogni 4/8/16), corsia sezioni (clic = regione, max 30 s) + accordi, `battuta.movimento` nella transport bar, **snap** della regione alle battute (magnete, default on), pannello Stems in cima al rack (acapella / strumentale / reset, download WAV).
- Dopo la separazione la struttura viene ricalcolata dagli stems (`source: "stems"`).

### F9 — Timeline + campionatore (2026-10-15)
- **Due viste** (switch REMIX | FLIP in top bar, `flipStore.view`). REMIX = tutto come prima. FLIP = waveform A + struttura in alto (sorgente), sotto `SourceBar` al posto della corsia B, poi sidebar (CLIP / TRACCIA / MASTER) + timeline + pannello AI FLIP (F11, chiudibile), `FlipTransport` al posto della transport bar.
- **Schema** (`models.py`, `FlipProject` → tracks → clips). Clip = fetta dell'originale (`source` stem o mix, `src_start/src_end` in s, `src_beats` = battiti della griglia sorgente) posata a `at_beat` per `length_beats`. `loop=false` → stirata a riempire; `loop=true` → suona `src_beats` al BPM del progetto e si ripete. `stretch`: warp (Rubber Band, pitch fermo) | repitch (resample, giradischi). Per clip: semitoni, reverse, gain, HP/LP, gate ritmico sulla griglia del progetto (`1/4…1/32`, duty), fade, `tune` 0..1, `harmony` (gradi di scala). Traccia: gain, pan, mute/solo, `follow_key` (batteria no), `chain` = EffectChain (tempo ignorato). Progetto: bpm, bars, `source_key` (scala per tune/armonia), `transpose`.
- **Render** (`app/flip/render.py`): per clip fetta → tune/armonia → reverse → warp|repitch (+transpose se `follow_key`) → loop → HP/LP, in **cache LRU 48** (chiave = hash dei campi che cambiano il suono, esclusi posizione/gain/gate/fade). Poi gate+fade+gain, posa, catena traccia, pan equal-power (centro = unità), master = **rack del remix con intensità** (`morphParams(...).global_chain`). Preview = finestra in beat (loop se attivo, altrimenti dal beat 0; oltre 120 s dalla battuta del playhead).
- **Intonazione/armonia** (`app/flip/tune.py`): pYIN (librosa, niente basic-pitch) → note = run di frame sulla stessa nota di scala (≥ 3 frame) → ogni nota spostata in blocco (PitchShift, contesto 50 ms, crossfade 10 ms). Tune sposta la mediana verso la nota di scala; harmony sposta di N gradi (terza = 3 o 4 semitoni a seconda del grado). Non voiced = invariato.
- **Griglia sorgente** (`lib/flip.ts`): `beatPos`/`timeAt` frazionari sui beat di `/structure` (o griglia dritta dal BPM). Pezzo→clip: `src_beats = beatsBetween` (intero se entro 0.15), clip alla posizione del playhead, playhead spostato alla fine (pezzi in fila). Taglio: battute / ½ / beat / 1/8 / transienti (`/flip/onsets`), i pezzi restano al loro posto (reverse gestito).
- Timeline: trascina = sposta (anche su altra traccia), Alt+trascina = copia, bordo destro = lunghezza, griglia battuta/1/4/1/8/1/16/libera, righello clic = playhead, trascina = range di loop, Ctrl+rotella = zoom. Canc / Ctrl+D / Esc / Space / L / Ctrl+Z in vista FLIP agiscono sul progetto (undo separato, max 100, gesture coalescenti 800 ms).
- Il progetto è legato alla canzone (`flipStore.trackId`): salvato in sessione con il track_id, azzerato se carichi un'altra canzone. La forma d'onda nelle clip è quella del mix (8 kHz di wavesurfer), anche per le clip di stems.
- "Parti dal ritornello": sezione `ritornello` (o la più energica), prime 8 battute, voce + batteria in loop ×2 dal beat 0.

### F10 — Strumentale generato (2026-10-15)
- **Simbolico e sintetizzato**: niente sample né modelli. Batteria = pattern a step (`lanes` velocità per step, `rolls` 2..6 colpi nello step, `steps_per_beat` 4 o 8). Basso/accordi/arpeggio = note MIDI (`Note{start,length,pitch,vel}`, beat dall'inizio del ciclo). Suoni in `app/flip/instruments.py` (numpy + scipy): 5 kit (trap, boombap, house, lofi, afro) con one-shot in `lru_cache`; preset 808 (monofonico, punch, glide tra note che si toccano, drive tanh), sub, reese, pluck_bass, pad (saw polyBLEP detunate, stereo), keys (piano elettrico), pluck (filtro che si chiude), bell (FM 3.5), lead.
- **Schema**: `FlipTrack.kind` audio|drums|bass|keys + `instrument` + `patterns: PatternClip[]` (ciclo `pattern_beats` ripetuto su `length_beats`, swing, gain). `FlipProject.chords` = ultima progressione (riga ACCORDI sotto il righello, trasposta in UI). Le note sono nella tonalità dell'originale: la trasposizione del progetto si aggiunge al render (come per le clip audio). Progetti F9 in sessione → `normalizeProject()`.
- **Generatore** (`app/flip/generate.py`, deterministico per seed): 8 stili (trap, drill, boombap, lofi, house, reggaeton, afro, pop) con kit/swing/preset/BPM tipico. Groove per generazione (cassa A/B, hi-hat, posizioni dei roll), pattern di 4 battute con fill nell'ultima. Trap/drill sotto i 100 BPM = half-time su griglia a 1/32. Armonia **song** = accordi di `/structure` sotto le clip audio con ♪ nel range (mappati con stretch/loop/reverse/semitoni/vinile, voto pesato: other/bass 1.5, voce/mix 1.0, maggioranza per mezza battuta) → si sposa con la voce; senza clip utili ripiega su **new** = progressione di 4 battute per mood (scuro, malinconico, epico, solare, sognante; tabelle maggiore/minore). Basso: sulle casse (808/trap/drill, lunghezza fino alla cassa dopo; drill a volte salto d'ottava con glide), house in levare con ottave, afro/pop 3-3-2. Accordi con voice leading (minimo spostamento), settime per boombap/lofi/house/afro; ritmo per stile (pad tenuto, stab in levare house, dembow reggaeton). Arpeggio su/su-giù/casuale con pause.
- Tracce generate: "Beat" (no ♪), "Basso synth", "Accordi" (HP 180 + riverbero), "Arpeggio" (delay 3/16 + riverbero). Rigenerare sostituisce le tracce generate con stesso nome e tipo (tiene catena, volume, pan). "Silenzia batteria e basso originali" muta le tracce audio fatte solo di stem drums/bass. "Rigenera questa parte" (seed+1) cambia solo il contenuto della clip selezionata.
- **Mood (2026-10-16)**: `app/analysis/mood.py` (cache `data/analysis/<id>.<src>.mood.v<N>.s<M>.json`): `minor_share` (durata accordi minori), brillantezza (centroide 1–3.5 kHz), energia (densità di onset + RMS + tempo, half-time letto al doppio), valenza (armonia > brillantezza, tempo) → `pick_mood` (valenza × energia) + `pick_style` (BPM × energia × valenza). Nel generatore `resolve_feel` → `Feel{density, energy, bright, space, grit}`: base per mood (`MOOD_FEEL`), colorata dal profilo della canzone (anche con mood scelto a mano); `auto` = mood dal profilo con l'energia mediata con quella delle **sezioni da cui vengono le clip** nel range. Effetti: pattern di cassa più radi/fitti, hi-hat 1/16 vs 1/8, numero e probabilità dei roll, ghost, velocity; basso solo sui battere se calmo; voicing più alto se brillante, settime per sognante/malinconico, add9 per sognante, radice all'ottava sotto per epico, pop energico a quarti; cutoff di pad/keys/arp/basso, preset dell'arpeggio (bell se brillante, pluck se scuro), riverbero/delay/attack/release dei pad con lo spazio, drive dell'808 col grit, swing +spazio. `energy` (0..1) come argomento interno di `generate()` per le sezioni della ricetta.
- UI: pulsante "genera strumentale" nella barra della timeline (stile, armonia, mood con "dalla canzone (X)" + descrizione e stile adatto cliccabile, parti, battute, variante/seed, "usa N BPM"), blocchi pattern con anteprima (puntini/piano roll), editor sotto la timeline (step grid: clic, Shift+clic intensità, tasto destro roll; piano roll: clic aggiunge/toglie, lunghezza nota, ciclo ÷2/×2), scheda TRACCIA con kit/preset e manopole del suono. Le clip generate si spostano solo su tracce dello stesso tipo.

### F11 — Ricetta AI (2026-10-16)
- L'LLM scrive una **ricetta** (`FlipRecipe` in `models.py`): `bpm`, `transpose`, `style`, `mood`, `harmony`, `sections[]` (1–8 dal modello, max 12) con `name`, `bars` (1–32), `sample` (sezione dell'originale per nome; `auto` = ritornello, altrimenti la più energica; `none`), `sample_bars` (1/2/4/8 dall'inizio della sezione), `keep` (stems), `fx` (filtered = LP 900, telephone = HP 600/LP 3200, reversed, stutter = gate 1/16, octave_up/down, harmony = seconda clip su "Voce armonia" a +2 gradi −5 dB, tuned = tune 0.8), `parts`, `energy` (low/mid/high → 0.25/0.55/0.85).
- `app/llm/recipe.py`: system prompt (concetto di flip, campi, regole), contesto = BPM/tonalità/stems sì-no, profilo mood, sezioni dell'originale con energia; schema JSON scritto a mano (enum per tutto, explanation per prima) → grammar; `sanitize()` filtra enum e clampa i numeri (output sporco → mai una ricetta invalida). Varianti = temperature 0.8 + seed casuale + hint, come `/llm/interpret`. `max_tokens` 1800.
- `app/flip/recipe.py` (deterministico): per sezione, una clip **loop** per stem tenuto (`src_beats = sample_bars × bpb`, griglia dai downbeat di `/structure`), effetti sulle sorgenti melodiche, poi `generate()` per le parti con l'energia della sezione (armonia "song" legge le clip appena posate). Tracce con lo stesso nome raccolgono clip/pattern di tutte le sezioni; tracce audio prima delle generate. Senza stems → `keep` diventa `mix` (nota). Max 128 battute. `markers` = sezioni della ricetta (riga SEZIONI, clic = loop).
- UI: `RecipePanel` a destra della timeline (`flipStore.aiOpen`, pulsante "AI" nella toolbar se chiuso). Risposta = spiegazione + riepilogo (stile · BPM · mood · armonia, una riga per sezione) + note del builder. Applicare = **sostituisce il progetto** con un solo `edit` (Ctrl+Z torna indietro) e allinea le impostazioni di "genera strumentale". "altro strumentale" = `/recipe/build` con seed+1 (niente LLM). Chat delle ricette e mood in `flipStore` (non in sessione), azzerati al cambio canzone.

## Progressione (vedi PLAN.md per dettaglio)
MVP → DSP core → LLM integration → Preset & templates → Polish UI → **Flip**: Stems + struttura (F5) → Timeline + campionatore (F9) → Strumentale (F10) → Ricetta AI (F11).
