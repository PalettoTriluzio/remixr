# Ultimo passo — AI che modifica il flip, automazioni + sidechain, waveform degli stems, MP3 320 (2026-10-16)

Il codice non è stato eseguito: va provato su Windows. Non servono nuove dipendenze.
Per l'MP3 si usa ffmpeg (già installato per il README §3).

## Cosa c'è di nuovo

### 1. AI che modifica il flip
Nel pannello **AI FLIP** ci sono due modalità, scelte con lo switch sopra la casella di testo:
- **modifica questo flip** (default quando la timeline ha già qualcosa): cambia solo quello che chiedi. Le altre parti e i ritocchi fatti a mano restano.
  - Esempi: *"aggiungi un break di 4 battute dopo il ritornello"*, *"togli l'arpeggio e fai pompare gli accordi sulla cassa"*, *"voce un'ottava sopra nell'outro"*, *"filtro che si apre nell'intro e fade out alla fine"*, *"rifai il beat del ritornello più carico"*, *"portala a 150"*.
  - Nella risposta compare una riga per ogni modifica applicata.
  - Se una modifica non è possibile, compare tra le **note** e le altre vengono applicate lo stesso.
- **nuovo flip**: come prima, costruisce tutto da zero.

Le sezioni hanno un nome: l'AI le trova per nome (*"il ritornello"*, *"l'outro"*). Senza sezioni puoi dire *"battute 9-16"*.

### 2. Automazioni e sidechain
- **Automazioni**: nell'intestazione di ogni traccia c'è l'icona ad onda. Ogni clic mostra la curva di un parametro sopra la traccia, in quest'ordine: **volume**, **filtro passa-basso**, **filtro passa-alto**, poi nascosta.
  - Clic sulla curva = aggiungi un punto e trascinalo.
  - Doppio clic su un punto = toglilo.
- **Scheda TRACCIA → Automazione**: curve pronte (**fade in**, **fade out**, **apri filtro**, **chiudi filtro**, **sale da sotto**).
  - Vengono applicate sul range di loop, se c'è; altrimenti sulle prime o sulle ultime 4 battute.
- **Scheda TRACCIA → Sidechain**: la traccia si abbassa quando un'altra suona.
  - **sulla cassa** = il classico pompaggio.
  - Manopole **Quanto** e **Rilascio**.
- Le ricette nuove li usano già da sole:
  - con un'intro calma, il filtro si apre;
  - in house, afro e pop gli accordi pompano sulla cassa.

### 3. Waveform vere degli stems
Le clip di voce, batteria, basso e altro mostrano la forma d'onda del proprio stem, non più quella del mix.

### 4. Export MP3 320
Il formato si chiama **MP3 320** nella top bar: 320 kbps costanti tramite ffmpeg.

## Cosa fare
1. `git pull`
2. Riavvia il backend (chiudi il vecchio uvicorn):
   ```powershell
   cd backend
   .venv\Scripts\activate
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
3. Avvia il frontend: `cd frontend` poi `npm run dev`, e apri http://localhost:5173

## Cosa provare
1. Crea un flip con **nuovo flip** (es. *"rifalla drill a 142, tieni solo il ritornello, intro con voce filtrata"*).
2. Passa a **modifica questo flip** e chiedi, una alla volta:
   - *"aggiungi un break di 4 battute dopo il ritornello"*: nella riga SEZIONI compare il break e il resto si sposta;
   - *"togli l'arpeggio e fai pompare gli accordi sulla cassa"*;
   - *"voce un'ottava sopra nell'outro"*;
   - *"filtro che si apre nell'intro"*.
   Dopo ognuna: ascolta, poi **Ctrl+Z** per vedere che torna com'era.
3. Fai un ritocco a mano (sposta una clip), poi chiedi una modifica all'AI: il ritocco deve restare.
4. **Automazioni a mano**: clicca l'icona ad onda su una traccia, disegna un fade e ascolta. Prova anche **apri filtro** dalla scheda TRACCIA.
5. **Sidechain**: seleziona la traccia Accordi o Basso synth → scheda TRACCIA → **sulla cassa** → alza **Quanto**.
6. Con gli stems separati, controlla che le clip di voce e di batteria abbiano forme d'onda diverse.
7. Export in **MP3 320**: in Esplora file → tasto destro → Proprietà → Dettagli, la velocità in bit deve essere 320 kbps.

## Da sapere
- Quando inserisci o togli battute, le clip in loop e i pattern tagliati a metà ripartono dall'inizio del loop.
- Il sidechain non funziona se la traccia sorgente è muta.
- Se ffmpeg non è nel PATH, l'MP3 viene fatto da libsndfile (sempre a 320). Per indicare dove si trova ffmpeg: `$env:REMIXR_FFMPEG = "C:\percorso\ffmpeg.exe"` prima di avviare uvicorn.

## Se qualcosa non va
- **503** = modello non caricato.
- **502** = risposta del modello non valida: riprova o cambia frase.
- Per qualunque errore copia il messaggio (pannello AI, barra della timeline o top bar) e aggiungi l'errore del terminale del backend.

## Prossimo passo
Installer per Windows (rimandato), oppure quello che emerge dalle prove.
