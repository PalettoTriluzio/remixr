# Ultimo passo — Flip F5: stems + struttura (2026-10-15)

Commit: `8edb735` — "Flip F5: stems demucs (job, mixer, download) + struttura (battute, sezioni, accordi)".
Il codice non è stato eseguito: va provato su Windows.

## Cosa c'è di nuovo
- **Stems** (in cima alla colonna sinistra): "Separa voce · batteria · basso · altro" lancia demucs in background con barra di progresso.
  - Poi c'è un mixer: **M** = muto, **S** = solo, volume da −∞ a +12 dB (doppio clic = 0 dB).
  - Ci sono i tasti **acapella**, **strumentale** e reset, più il download di ogni stem in WAV.
  - Il mix degli stems entra nella preview B e nell'export.
  - Gli stems restano su disco (`backend/data/stems/`) anche dopo un riavvio.
- **Struttura** (automatica, corsia sotto la waveform A):
  - battute numerate disegnate sulla waveform;
  - sezioni: stessa lettera = stesso materiale, con un nome indicativo (intro / strofa / ritornello / bridge / break / outro). **Clic su una sezione = diventa la regione** (max 30 s);
  - accordi.
  - Quando gli stems sono pronti, la struttura viene ricalcolata da quelli ed è più precisa (in basso a destra della corsia: "da stems").
- **Transport bar**: posizione in `battuta.movimento` (es. `17.3`) e **magnete** = la regione si aggancia a battute intere (attivo di default).

## Cosa fare

1. Aggiorna il repo:
   ```powershell
   git pull
   ```

2. Installa torch con CUDA. Serve a demucs per lavorare sulla GPU: senza funziona lo stesso, ma su CPU ci vogliono minuti.
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\install-torch-cuda.ps1
   ```
   Lo script:
   - sostituisce il torch solo-CPU con torch 2.5.1 CUDA (download di ~2.5 GB);
   - rimette `numpy==1.26.4`;
   - scarica i pesi di demucs (dopo la separazione funziona offline);
   - fa una separazione di prova sulla GPU.

   Alla fine deve scrivere `FATTO` in verde.

3. Riavvia il backend (chiudi il vecchio uvicorn prima di lanciarlo):
   ```powershell
   cd backend
   .venv\Scripts\activate
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

4. Avvia il frontend:
   ```powershell
   cd frontend
   npm run dev
   ```
   Apri http://localhost:5173

## Cosa provare
1. Carica una canzone: dopo qualche secondo compaiono le battute sulla waveform e la corsia con sezioni e accordi.
2. Clicca una sezione: diventa la regione e la transport bar mostra "battute X–Y".
3. Trascina una regione a mano: col magnete acceso si aggancia alle battute.
4. Premi "Separa voce · batteria · basso · altro":
   - accanto alla percentuale deve comparire **CUDA** (se dice CPU, lo script del punto 2 non è andato a buon fine);
   - su GPU ci vogliono circa 10–40 secondi per canzone.
5. Prova **acapella** e **strumentale**, muto e solo sui singoli stems, e il download di uno stem.
6. Fai un export con il mixer modificato: deve rispettare il mix degli stems.

## Da sapere
- Battute, sezioni e accordi vengono da regole di analisi, senza un modello dedicato. Il tempo in 4/4 è dato per scontato. Sui brani con molta batteria dovrebbero essere affidabili; i nomi delle sezioni sono solo indicativi.
- Se il modello di linguaggio occupa troppa VRAM, la separazione passa da sola alla CPU e finisce comunque. Per restare sulla GPU puoi:
  - scegliere un GGUF più piccolo dal pannello AI;
  - oppure impostare `REMIXR_STEMS_MODEL=htdemucs`, che fa 1 passata invece di 4.

## Se qualcosa non va
Il log dello script finisce in `tools/logs/torch-cuda-*.log`. Committalo e pushalo:
```powershell
git add tools/logs
git commit -m "log torch cuda"
git push
```
Se l'errore è nell'app, copia anche il messaggio del pannello Stems o della corsia struttura.

## Prossimo passo
Quando questo passo funziona: **F9 — timeline + campionatore** (chop della voce, warp a un BPM nuovo, cambio di tonalità, correzione d'intonazione).
